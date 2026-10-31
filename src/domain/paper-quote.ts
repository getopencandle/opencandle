import type { BarDataset, Quote } from './types';

/** User-facing name of the price an imported source supplies to paper trading. */
export const LAST_IMPORTED_LABEL = 'last imported price';
/** Informational note for a source without a declared session. It never refuses an order by itself. */
export const UNKNOWN_SESSION_NOTE = 'This source does not declare a trading session.';
/**
 * A quote built from an imported bar. The optional basis field is declared on Quote by a root diff; until it lands this local
 * intersection keeps the code typed, and absent basis means an ordinary quote exactly as before.
 */
export type PaperQuote = Quote & { basis?: 'last-imported-bar' };
export function isLastImportedQuote(quote: Quote): boolean { return (quote as PaperQuote).basis === 'last-imported-bar'; }

export interface LastImportedQuoteOptions {
  /** True for a dataset whose final bar may still be forming: the last closed bar (the one before it) is used instead. */
  live?: boolean;
  /** Event sequence for the quote. The default is the number of bars used; callers that rebuild per action pass a rising value. */
  sequence?: number;
}
/**
 * The paper quote for imported, non-fixture data. bid and ask are both the close of the last
 * (closed) bar; availableAt and receivedAt are the action time, so its age starts at the user action. It is rebuilt per
 * action and must not be cached across actions: the engine refuses a last-imported-bar quote older than the action.
 * Returns null when no usable bar exists.
 */
export function lastImportedQuote(dataset: BarDataset, now: number, options: LastImportedQuoteOptions = {}): PaperQuote | null {
  const bars = options.live ? dataset.bars.slice(0, -1) : dataset.bars;
  const bar = bars.at(-1);
  if (!bar || !Number.isFinite(bar.close) || bar.close <= 0 || !Number.isSafeInteger(bar.time) || bar.time < 0 || !Number.isSafeInteger(now) || now < 0 || bar.time > now) return null;
  const sequence = options.sequence ?? bars.length;
  if (!Number.isSafeInteger(sequence) || sequence < 0) return null;
  return { instrumentId: dataset.instrument.id, bid: bar.close, ask: bar.close, eventTime: bar.time, receivedAt: now, availableAt: now, sequence, session: dataset.provenance.session, fixture: false, basis: 'last-imported-bar' };
}

/**
 * The quote at the user action: the quote the ticket, the dock and the chart buttons act on. For an imported,
 * non-fixture source outside replay it is the last imported price rebuilt at the action time `now` (age starts at the action), with
 * a sequence after the accepted one so the account takes it; once accepted for this action time it is returned as is. Every other
 * source (fixture, live provider, replay) keeps the bar-feed quote unchanged.
 */
export function paperActionQuote(dataset: BarDataset, stored: Quote | null, now: number, options: { replay?: boolean } = {}): Quote | null {
  if (options.replay || dataset.provenance.fixture || !dataset.provenance.datasetId.startsWith('local-import:')) return stored;
  if (stored && stored.instrumentId !== dataset.instrument.id) return stored;
  if (stored && isLastImportedQuote(stored) && stored.availableAt >= now) return stored;
  return lastImportedQuote(dataset, now, { sequence: (stored?.sequence ?? 0) + 1 }) ?? stored;
}
