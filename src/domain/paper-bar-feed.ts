import type { Bar, DataProvenance, Instrument, Quote } from './types';
import { paperInstrumentKey } from './paper-brackets';
import { processPaperBar, processPaperTouchPath, type PaperAccount, type PaperBarPathOptions } from './paper';
import { intervalOrderSeconds } from './intervals';

/**
 * Fills virtual orders against the bars of the active chart, including the forming bar of a live feed.
 *
 * - Closed bars the account has not seen run as an open-proximity bar path (processPaperBar): the open is a gap point, later points
 *   are intrabar touches, so a resting limit or stop inside the bar range fills at its own price.
 * - The bar the account saw last (a forming live bar, or the last closed bar) continues as a touch path: a new high or low and the
 *   new close, each reached continuously from the retained quote.
 * - Without a retained quote the feed starts at the latest bar and never replays history, so an order only ever meets prices that
 *   came after it was placed.
 * - Simulation time is the bar time (the same clock the chart's virtual time uses). Sequences are bar time x SCALE + offset, so
 *   they rise across bars and across interval switches of the same instrument.
 * - Session: a synthetic fixture keeps 'unknown' with its fixture flag (as fixtureQuote does). A source that declares 'all' trades as
 *   'regular' (the whole day is the trading session, for example a 24 hour crypto feed). 'unknown' on real data is tagged as the last
 *   imported price, so regular-session orders fill on it as the imported-price ruling already allows.
 */
export const PAPER_FEED_SEQUENCE_SCALE = 1_000_000;
export const PAPER_FEED_TICK_OFFSET = 8;
/** At most this many unseen closed bars are replayed for resting orders in one call; older ones are skipped with a notice. */
export const PAPER_FEED_MAX_CATCH_UP = 500;
export interface PaperFormingSnapshot { instrumentId: string; time: number; high: number; low: number; /** The bar interval the previous call fed. */ resolution?: string; }
/** US equity session of a bar by its start time. 'closed' quotes carry no tradable session. */
export type PaperBarSession = 'regular' | 'extended' | 'closed';
export interface PaperBarFeedInput {
  bars: readonly Bar[];
  instrument: Instrument;
  provenance: Pick<DataProvenance, 'fixture' | 'session'>;
  /** True when the last bar is still forming (a live feed). */
  live: boolean;
  /** What the previous call saw of the bar it ended on, so a widened high or low is replayed as a touch. */
  forming?: PaperFormingSnapshot | null;
  /** The interval of `bars`. A change from the previous call's interval never replays the new series' earlier bars. */
  resolution?: string;
  /** Per-bar session for sources that publish extended-hours trades without a session field (Alpaca). */
  sessionOf?: (time: number) => PaperBarSession;
  runId?: string;
}
export interface PaperBarFeedResult { ok: boolean; account: PaperAccount; processed: number; forming: PaperFormingSnapshot | null; message: string | null; }

const active = (account: PaperAccount, instrumentId: string) => account.orders.some(order => (order.status === 'working' || order.status === 'triggered') && order.instrument.id === instrumentId);
const validBar = (bar: Bar | undefined): bar is Bar => !!bar && Number.isSafeInteger(bar.time) && bar.time >= 0 && [bar.open, bar.high, bar.low, bar.close].every(value => Number.isFinite(value) && value > 0) && bar.low <= Math.min(bar.open, bar.close) && bar.high >= Math.max(bar.open, bar.close);

export function paperFeedSession(provenance: PaperBarFeedInput['provenance']): { session: Quote['session']; basis?: 'last-imported-bar' } {
  if (provenance.fixture) return { session: 'unknown' };
  if (provenance.session === 'all') return { session: 'regular' };
  if (provenance.session === 'unknown') return { session: 'unknown', basis: 'last-imported-bar' };
  return { session: provenance.session };
}
/** The session of one bar: a per-bar classifier (real data only) wins over the dataset's declared session. */
function barSession(input: PaperBarFeedInput, time: number): { session: Quote['session']; basis?: 'last-imported-bar' } {
  if (input.sessionOf && !input.provenance.fixture) { const session = input.sessionOf(time); return { session: session === 'closed' ? 'unknown' : session }; }
  return paperFeedSession(input.provenance);
}
const halfSpreadOf = (provenance: PaperBarFeedInput['provenance']) => provenance.fixture ? 0.01 : 0;
function quoteAt(input: PaperBarFeedInput, bar: Bar, mid: number, sequence: number, time: number = bar.time): Quote {
  const { session, basis } = barSession(input, time), half = halfSpreadOf(input.provenance);
  const bid = input.provenance.fixture ? Math.max(0.01, Math.round((mid - half) * 100) / 100) : mid;
  const ask = input.provenance.fixture ? Math.max(bid, Math.round((mid + half) * 100) / 100) : mid;
  return { instrumentId: input.instrument.id, bid, ask, eventTime: time, receivedAt: time, availableAt: time, sequence, session, fixture: input.provenance.fixture, ...(basis ? { basis } : {}) } as Quote;
}
function spanOf(input: PaperBarFeedInput, bars: readonly Bar[]): number {
  if (input.resolution) try { const seconds = intervalOrderSeconds(input.resolution); if (Number.isFinite(seconds) && seconds > 0 && seconds < 1e12) return seconds; } catch { /* spacing below */ }
  return bars.length > 1 ? bars.at(-1)!.time - bars.at(-2)!.time : 0;
}
const midOf = (quote: Quote) => (quote.bid + quote.ask) / 2;

/** One step of the feed. Returns the same account object when nothing new was seen. */
export function feedPaperBars(account: PaperAccount, input: PaperBarFeedInput): PaperBarFeedResult {
  const id = input.instrument.id, runId = input.runId ?? account.runId;
  // Instruments the virtual engine cannot execute (for example crypto today) get no quote: nothing fills and nothing is reported each bar.
  try { paperInstrumentKey(input.instrument); } catch { return { ok: true, account, processed: 0, forming: null, message: null }; }
  const bars = input.bars.filter(validBar);
  const last = bars.at(-1);
  if (!last) return { ok: true, account, processed: 0, forming: input.forming ?? null, message: null };
  const accepted = account.quotes[id];
  let current = account, processed = 0, message: string | null = null;
  const snapshotOf = (bar: Bar): PaperFormingSnapshot => ({ instrumentId: id, time: bar.time, high: bar.high, low: bar.low, ...(input.resolution ? { resolution: input.resolution } : {}) });
  const fail = (text: string): PaperBarFeedResult => ({ ok: false, account: current, processed, forming: input.forming ?? null, message: text });
  const nowFor = (bar: Bar) => Math.max(current.clock, bar.time);
  const done = (): PaperBarFeedResult => ({ ok: true, account: current, processed, forming: input.live || input.resolution ? snapshotOf(last) : null, message });

  const seen = accepted ? bars.find(bar => bar.time === accepted.eventTime) : undefined;
  // A different series of the same instrument (an interval switch). Its bars before now are not replayed, and a
  // coarse forming bar that began before the retained quote is not a stall: the series' current close is one touch from the
  // retained quote, at the later of the two times. Older data than the retained quote changes nothing.
  const priorResolution = input.forming && input.forming.instrumentId === id ? input.forming.resolution : undefined;
  const switched = !!accepted && !!input.resolution && !!priorResolution && priorResolution !== input.resolution;
  const behind = !!accepted && !seen && last.time <= accepted.eventTime;
  if (accepted && (switched || behind)) {
    const time = Math.max(accepted.eventTime, last.time);
    if (time >= last.time + Math.max(1, spanOf(input, bars)) && last.time < accepted.eventTime) return done();
    const quote = quoteAt(input, last, last.close, Math.max(accepted.sequence + 1, last.time * PAPER_FEED_SEQUENCE_SCALE + PAPER_FEED_TICK_OFFSET), time);
    if (quote.eventTime === accepted.eventTime && quote.bid === accepted.bid && quote.ask === accepted.ask && quote.session === accepted.session) return done();
    const result = processPaperTouchPath(current, [quote], Math.max(current.clock, time), runId, input.instrument);
    if (!result.ok) return fail(result.diagnostics.map(row => row.message).join(' '));
    current = result.account; processed++;
    return done();
  }
  // Continue the bar the account saw last.
  if (accepted && seen) {
    const prior = input.forming && input.forming.instrumentId === id && input.forming.time === seen.time ? input.forming : null, from = midOf(accepted);
    const extremes: number[] = [];
    if (prior) {
      if (seen.high > prior.high) extremes.push(seen.high);
      if (seen.low < prior.low) extremes.push(seen.low);
      if (extremes.length === 2 && Math.abs(seen.low - from) < Math.abs(seen.high - from)) extremes.reverse();
    }
    // Points whose executable prices equal the previous point are dropped, so a repeated call with the same bars changes nothing.
    const quotes: Quote[] = [];
    const base = Math.max(accepted.sequence, seen.time * PAPER_FEED_SEQUENCE_SCALE + PAPER_FEED_TICK_OFFSET - 1);
    for (const mid of [...extremes, seen.close]) {
      const previous = quotes.at(-1) ?? accepted, quote = quoteAt(input, seen, mid, base + 1 + quotes.length);
      if (quote.bid !== previous.bid || quote.ask !== previous.ask) quotes.push(quote);
    }
    if (quotes.length) {
      if (base + quotes.length >= (seen.time + 1) * PAPER_FEED_SEQUENCE_SCALE) return fail('This bar has more price updates than the virtual feed can sequence. Orders wait for the next bar.');
      const result = processPaperTouchPath(current, quotes, nowFor(seen), runId, input.instrument);
      if (!result.ok) return fail(result.diagnostics.map(row => row.message).join(' '));
      current = result.account; processed++;
    }
  }
  // Bars after the one seen last.
  const lastClosedIndex = input.live ? bars.length - 2 : bars.length - 1;
  const after = accepted ? bars.filter(bar => bar.time > accepted.eventTime) : [last];
  let replay = after;
  if (!accepted || !active(current, id)) replay = after.length ? [after.at(-1)!] : [];
  else if (after.length > PAPER_FEED_MAX_CATCH_UP) { message = `Only the latest ${PAPER_FEED_MAX_CATCH_UP} unseen bars were checked against working virtual orders.`; replay = after.slice(-PAPER_FEED_MAX_CATCH_UP); }
  for (const bar of replay) {
    const forming = input.live && bar === bars[lastClosedIndex + 1];
    if (!forming && replay.length > 1 && bar !== replay.at(-1) && !active(current, id)) continue; // nothing rests: only the latest bar marks the account
    if (forming) {
      const result = processPaperTouchPath(current, [quoteAt(input, bar, bar.close, bar.time * PAPER_FEED_SEQUENCE_SCALE + PAPER_FEED_TICK_OFFSET)], nowFor(bar), runId, input.instrument);
      if (!result.ok) return fail(result.diagnostics.map(row => row.message).join(' '));
      current = result.account; processed++; continue;
    }
    const { session, basis } = barSession(input, bar.time);
    const options: PaperBarPathOptions & { now: number; executionInstrument?: Instrument } = { instrumentId: id, bar, firstSequence: bar.time * PAPER_FEED_SEQUENCE_SCALE, halfSpread: halfSpreadOf(input.provenance), policy: accepted ? 'open-proximity' : 'close-only', fixture: input.provenance.fixture, session, availableAt: bar.time, now: nowFor(bar), executionInstrument: input.instrument, ...(input.provenance.fixture ? { fixtureCents: true } : {}), ...(basis ? { basis } : {}) };
    const result = processPaperBar(current, options, runId);
    if (!result.ok) return fail(result.diagnostics.map(row => row.message).join(' '));
    current = result.account; processed++;
  }
  return done();
}
