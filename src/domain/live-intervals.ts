import type { Bar } from './types';
import { intervalBucketRange, parseInterval } from './intervals';
import { usEquitySessionBucket } from './us-market-hours';

/**
 * Live interval planning. A live chart at any interval is built from the finest native feed a provider has:
 * backfill is fetched at a native granularity that divides the target and folded into UTC-policy buckets (the same
 * buckets local aggregation uses), and live messages (candles / minute bars / daily bars / trades) are folded into the
 * same buckets by LiveBarSeries. Nothing finer than the native feed is ever invented.
 *
 * A US equity feed (Alpaca) buckets minute intervals on the New York session instead of the UTC clock:
 * 1-hour bars open at 09:30, 10:30 and so on, 2-hour and 4-hour bars start at 09:30, and pre-market, after-hours and
 * overnight segments start their own buckets (us-market-hours.ts usEquitySessionBucket). Alpaca's own 1Hour bars sit
 * on clock hours (09:00-10:00 holds the 09:30 open), so they are never used: hourly and multi-hour charts fold 15-minute
 * bars, which divide every segment. Crypto (Coinbase) stays on the UTC clock.
 */
export interface LiveIntervalPlan {
  /** Canonical interval id (parseInterval form). */
  id: string;
  /** The provider publishes this interval itself: bars are used as published, no folding. */
  native: boolean;
  /** Bucket length for the series (calendar intervals use a nominal length; `bucketOf` is exact). */
  nominalSeconds: number;
  /** Live base bar size: 60 (minute bars / ticker), 300 (Coinbase candles channel) or 86400 (daily bars). */
  baseSeconds: number;
  ticks: boolean;
  /** Trades and minute bars also move the forming New York day (live-daily.ts), which a daily-based series
   * (1D, multi-day, weekly, monthly) takes as its daily base bar. False for intraday plans and feeds without it. */
  dayTicks: boolean;
  /** Native bar size requested for backfill (a key of the provider's native table, in seconds). */
  backfillSeconds: number;
  /** Bucket start for a time; null for native intervals. */
  bucketOf: ((time: number) => number) | null;
  /** Bucket [start, end) for a time (session buckets can be shorter than `nominalSeconds`); null for native intervals. */
  bucketRange: ((time: number) => { start: number; end: number }) | null;
  calendar: boolean;
}
export type LivePlanResult = { ok: true; plan: LiveIntervalPlan } | { ok: false; reason: string };
const DAY = 86400;
const fail = (reason: string): LivePlanResult => ({ ok: false, reason });

export interface LiveFeedShape {
  name: string;
  /** Native bar sizes in seconds, ascending. */
  native: readonly number[];
  /** Finest live base size for time-of-day intervals (60 or 300) and whether ticks refine it. */
  minuteBase: { baseSeconds: number; ticks: boolean };
  /** Live base for the native base of a native interval of this size. */
  nativeBase(seconds: number): { baseSeconds: number; ticks: boolean };
  /** Sizes the provider can fold intraday backfill from, largest first. */
  foldFrom: readonly number[];
  /** 'us-equity': minute buckets anchor at the New York session segments. 'utc': the UTC clock. */
  anchor: 'utc' | 'us-equity';
  /** Daily bars (86400 s base) also take trades on the forming New York day. */
  dayTicks?: boolean;
}
export const COINBASE_SHAPE: LiveFeedShape = {
  name: 'Coinbase', native: [60, 300, 900, 3600, 21600, 86400], minuteBase: { baseSeconds: 300, ticks: false },
  nativeBase: seconds => seconds === 60 ? { baseSeconds: 60, ticks: true } : { baseSeconds: 300, ticks: false }, foldFrom: [21600, 3600, 900, 300, 60], anchor: 'utc',
};
/** Alpaca 1Hour bars are clock-hour bars, so 60m is folded from 15-minute bars (every session segment is a multiple of 15). */
export const ALPACA_SHAPE: LiveFeedShape = {
  name: 'Alpaca', native: [60, 300, 900, 86400], minuteBase: { baseSeconds: 60, ticks: true },
  nativeBase: seconds => seconds === 86400 ? { baseSeconds: 86400, ticks: false } : { baseSeconds: 60, ticks: true }, foldFrom: [900, 300, 60], anchor: 'us-equity', dayTicks: true,
};

export function planLiveInterval(shape: LiveFeedShape, input: string): LivePlanResult {
  let spec;
  const dayTicks = (base: { baseSeconds: number }) => shape.dayTicks === true && base.baseSeconds === DAY;
  try { spec = parseInterval(input); } catch (cause) { return fail(cause instanceof Error ? cause.message : String(cause)); }
  if (spec.kind === 'event') return fail('Tick and range bars need trade-by-trade data that this live feed does not provide.');
  if (spec.unit === 'second') return fail(`${shape.name} live data has no feed finer than 1 minute.`);
  if (spec.unit === 'minute') {
    const seconds = spec.seconds!;
    if (shape.native.includes(seconds)) return { ok: true, plan: { id: spec.id, native: true, nominalSeconds: seconds, ...shape.nativeBase(seconds), dayTicks: dayTicks(shape.nativeBase(seconds)), backfillSeconds: seconds, bucketOf: null, bucketRange: null, calendar: false } };
    const from = shape.foldFrom.find(size => seconds % size === 0);
    if (from === undefined) return fail('No live source divides this interval.');
    // Alpaca folds from minute bars (ticks) and Coinbase from 5-minute candles when the interval allows, else from the ticker.
    const base = seconds % shape.minuteBase.baseSeconds === 0 ? shape.minuteBase : { baseSeconds: 60, ticks: true };
    const bucketRange = shape.anchor === 'us-equity' ? (time: number) => usEquitySessionBucket(time, spec.multiplier) : (time: number) => { const start = Math.floor(time / seconds) * seconds; return { start, end: start + seconds }; };
    return { ok: true, plan: { id: spec.id, native: false, nominalSeconds: seconds, ...base, dayTicks: false, backfillSeconds: from, bucketOf: time => bucketRange(time).start, bucketRange, calendar: false } };
  }
  if (spec.unit === 'day' && spec.multiplier === 1) return { ok: true, plan: { id: spec.id, native: true, nominalSeconds: DAY, ...shape.nativeBase(DAY), dayTicks: dayTicks(shape.nativeBase(DAY)), backfillSeconds: DAY, bucketOf: null, bucketRange: null, calendar: false } };
  const nominal = spec.multiplier * (spec.unit === 'day' ? DAY : spec.unit === 'week' ? 7 * DAY : 31 * DAY);
  const base = shape.nativeBase(DAY);
  return { ok: true, plan: { id: spec.id, native: false, nominalSeconds: nominal, baseSeconds: base.baseSeconds === 86400 ? 86400 : shape.minuteBase.baseSeconds, ticks: false, dayTicks: dayTicks(base), backfillSeconds: DAY, bucketOf: time => intervalBucketRange(time, spec.id).start, bucketRange: time => intervalBucketRange(time, spec.id), calendar: true } };
}
export const planCoinbaseInterval = (input: string) => planLiveInterval(COINBASE_SHAPE, input);
export const planAlpacaInterval = (input: string) => planLiveInterval(ALPACA_SHAPE, input);

/** Fold chronological bars into target buckets (open first, close last, high/low extremes, volume sum). */
export function foldBars(bars: readonly Bar[], bucketOf: (time: number) => number): Bar[] {
  const out: Bar[] = [];
  for (const bar of [...bars].sort((a, b) => a.time - b.time)) {
    const start = bucketOf(bar.time), last = out.at(-1);
    if (last && last.time === start) { last.high = Math.max(last.high, bar.high); last.low = Math.min(last.low, bar.low); last.close = bar.close; last.volume += bar.volume; }
    else out.push({ time: start, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume });
  }
  return out;
}
