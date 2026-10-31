import type { Bar } from './types';
import { newYorkClock, newYorkWallTime, usMarketSession } from './us-market-hours';

/**
 * The forming New York day of a US equity feed, moved by every trade.
 *
 * The daily (and weekly and monthly) bar's close, high, low and volume move on each trade. Alpaca publishes
 * its daily bar ('d') only once a minute, so the forming day is held here as:
 *  - the published daily bar (the backfill's bar for today, then each 'd' message), which covers every trade before its
 *    `coverage` instant: the backfill instant, or the start of the minute in which a 'd' message arrived (Alpaca sends the
 *    updated daily bar right after the minute bar it includes);
 *  - on top of it, the minutes from `coverage` on: a published minute bar ('b', or 'u' for a late correction) when one
 *    has arrived, else the trades seen in that minute (price as the close, high and low extremes, sizes summed).
 * So a minute bar replaces that minute's trades and a newer published daily bar replaces every minute it covers. Volume is
 * never counted twice: each trade is held in exactly one place. A trade in a minute whose bar has arrived (a late print)
 * is left to the next published bar, as is a trade from before `coverage`.
 *
 * Session rule (; daily bars commonly follow the regular session, and there is no convention for a feed whose published
 * daily bar includes extended hours, as Alpaca's IEX bars do): the published bar is taken as published. On top of it,
 * Extended trading hours on folds trades and minute bars from 04:00 to 20:00 New York time; off folds only 09:30 to
 * 16:00 (early closes and holidays follow us-market-hours). Prints outside every session are never folded. Every minute is
 * kept whatever the setting, so switching the setting refolds the same trades.
 */
export type DailyTickSession = 'regular' | 'extended';
export interface DailyTrade { time: number; price: number; high?: number; low?: number; size?: number | null }
type Minute = { bar: Bar; published: boolean };

/** New York midnight (Unix seconds) of the day holding `time`. */
export function newYorkDayStart(time: number): number { return newYorkWallTime(newYorkClock(time).date, 0); }
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const validBar = (bar: Bar) => Number.isSafeInteger(bar.time) && [bar.open, bar.high, bar.low, bar.close].every(value => finite(value) && value > 0) && finite(bar.volume) && bar.volume >= 0 && bar.high >= Math.max(bar.open, bar.close, bar.low) && bar.low <= Math.min(bar.open, bar.close, bar.high);
const copy = (bar: Bar): Bar => ({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume });

export class LiveDailyForming {
  session: DailyTickSession;
  /** New York midnight of the forming day; null before the first input. */
  private day: number | null = null;
  private published: Bar | null = null;
  private coverage = Number.NEGATIVE_INFINITY;
  private minutes = new Map<number, Minute>();
  constructor(session: DailyTickSession = 'extended') { this.session = session; }
  get formingDay(): number | null { return this.day; }

  /** The published daily bar of its day; every trade before `coverage` (Unix seconds) is inside it. A bar that covers less
   * than the one held (an older day, or an earlier instant of the same day) is ignored. Returns the new forming bar, or null. */
  official(bar: Bar, coverage: number): Bar | null {
    if (!validBar(bar) || !finite(coverage) || !this.enter(bar.time) || coverage < this.coverage) return null;
    this.published = copy(bar); this.coverage = coverage;
    for (const time of [...this.minutes.keys()]) if (time < coverage) this.minutes.delete(time);
    return this.bar();
  }
  /** A published minute bar ('b', or 'u' correcting a closed minute): it replaces the trades seen in that minute. */
  minute(bar: Bar): Bar | null {
    if (!validBar(bar) || bar.time % 60 !== 0 || !this.enter(newYorkDayStart(bar.time)) || bar.time < this.coverage) return null;
    this.minutes.set(bar.time, { bar: copy(bar), published: true });
    return this.bar();
  }
  /** One trade (or main's per-minute trade aggregate: `time` the newest print, `size` the sum). */
  trade(input: DailyTrade): Bar | null {
    if (!Number.isSafeInteger(input.time) || !finite(input.price) || input.price <= 0 || !this.enter(newYorkDayStart(input.time)) || input.time < this.coverage) return null;
    const minute = Math.floor(input.time / 60) * 60, prior = this.minutes.get(minute);
    if (prior?.published) return null;
    const high = Math.max(input.price, finite(input.high) ? input.high : input.price), low = Math.min(input.price, finite(input.low) && input.low > 0 ? input.low : input.price), size = finite(input.size) && input.size > 0 ? input.size : 0;
    if (prior) { prior.bar.high = Math.max(prior.bar.high, high); prior.bar.low = Math.min(prior.bar.low, low); prior.bar.close = input.price; prior.bar.volume += size; }
    else this.minutes.set(minute, { bar: { time: minute, open: input.price, high, low, close: input.price, volume: size }, published: false });
    return this.bar();
  }
  /** The forming day's bar (time = New York midnight): the published bar plus the minutes after it that the session setting folds. */
  bar(): Bar | null {
    if (this.day === null) return null;
    const parts = [...this.minutes.entries()].filter(([time]) => this.folds(time)).sort((a, b) => a[0] - b[0]).map(([, row]) => row.bar);
    let out: Bar | null = this.published ? copy(this.published) : null;
    for (const part of parts) {
      if (!out) { out = copy(part); out.time = this.day; continue; }
      out.high = Math.max(out.high, part.high); out.low = Math.min(out.low, part.low); out.close = part.close; out.volume += part.volume;
    }
    return out;
  }
  /** True when a minute starting at `time` is folded under the current session setting. */
  folds(time: number): boolean {
    const session = usMarketSession(time * 1000);
    return session === 'regular' || (session === 'extended' && this.session === 'extended');
  }
  /** Moves to the day of an input. An older day is refused; a newer day starts empty (its published bar comes later). */
  private enter(day: number): boolean {
    if (this.day !== null && day < this.day) return false;
    if (this.day === null || day > this.day) {
      this.day = day; this.published = null; this.coverage = Number.NEGATIVE_INFINITY;
      for (const time of [...this.minutes.keys()]) if (time < day) this.minutes.delete(time);
    }
    return true;
  }
}
