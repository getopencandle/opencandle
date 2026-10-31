import type { PaperAccount } from '../domain/paper';
import type { BarDataset, Instrument, Quote } from '../domain/types';
import { alpacaBarSession } from '../domain/alpaca-live';
import type { PaperBarFeedInput } from '../domain/paper-bar-feed';
import { paperWatchedInstruments } from '../domain/paper-multi-feed';

/**
 * Relayed order ticket quote. An order ticket the main window opens for a
 * layout window's instrument (Shift+B / Shift+S relay) gets a live quote from the main window's own quote path: the same Alpaca 1m
 * series the paper background feed opens (provider.open), folded into the paper account by feedPaperBars, plus the instrument's
 * live best bid and ask (useLiveQuote). The snapshot the layout window sent is shown only until the main window holds a quote that
 * is at least as new.
 */
export interface RelayedTicketSeed { instrument: Instrument; quote: Quote | null; now: number }

/** The symbol the main window opens a 1m series for: Alpaca US equities only (instrument id `US:<symbol>`). Others keep the snapshot. */
export function relayedFeedSymbol(instrument: Pick<Instrument, 'id' | 'symbol'>): string | null {
  return typeof instrument.symbol === 'string' && /^[A-Z0-9][A-Z0-9.\-/]{0,31}$/.test(instrument.symbol) && instrument.id === `US:${instrument.symbol}` ? instrument.symbol : null;
}

/** True when an existing feed already keeps this instrument's quote: the charted one (chart feed) or a watched one (background feed). */
export function relayedInstrumentFedElsewhere(account: PaperAccount, chartedId: string, instrumentId: string): boolean {
  return instrumentId === chartedId || paperWatchedInstruments(account).some(row => row.id === instrumentId);
}

/** The feed input for the relayed instrument's own 1m series, or null while it has no bars or another feed already covers it. */
export function relayedFeedInput(account: PaperAccount, chartedId: string, instrument: Instrument, series: Pick<BarDataset, 'bars' | 'provenance' | 'instrument'> | null): PaperBarFeedInput | null {
  if (!series || !series.bars.length || series.instrument.id !== instrument.id || relayedInstrumentFedElsewhere(account, chartedId, instrument.id)) return null;
  return { bars: series.bars, instrument, provenance: series.provenance, live: true, resolution: '1m', sessionOf: alpacaBarSession };
}

const freshness = (quote: Quote) => Math.max(quote.availableAt, quote.eventTime);
/** The quote the relayed ticket prices on: the main window's account quote once it is at least as new as the snapshot. */
export function relayedTicketQuote(account: PaperAccount, seed: RelayedTicketSeed): Quote | null {
  const held = account.quotes[seed.instrument.id] ?? null, snapshot = seed.quote && seed.quote.instrumentId === seed.instrument.id ? seed.quote : null;
  if (!held) return snapshot;
  if (!snapshot) return held;
  return freshness(held) >= freshness(snapshot) ? held : snapshot;
}
