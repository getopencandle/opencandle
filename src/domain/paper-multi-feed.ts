import type { BarDataset, Instrument } from './types';
import { alpacaBarSession } from './alpaca-live';
import type { PaperAccount } from './paper';
import { feedPaperBars, type PaperBarFeedInput } from './paper-bar-feed';

/**
 * Fills and marks for every symbol the account touches, not only the charted one. `feedPaperBars` is already per instrument;
 * this folds one step per supplied series over the account. The host opens a background series for each instrument that
 * `paperWatchedInstruments` names (one owner of that multi-symbol feed).
 */
export function feedPaperSymbols(account: PaperAccount, inputs: readonly PaperBarFeedInput[]): { ok: boolean; account: PaperAccount; processed: number; messages: string[] } {
  let current = account, processed = 0, ok = true;
  const messages: string[] = [];
  for (const input of inputs) {
    const step = feedPaperBars(current, input);
    current = step.account; processed += step.processed; ok = ok && step.ok;
    if (step.message) messages.push(step.message);
  }
  return { ok, account: current, processed, messages };
}

/** Instruments with a working or triggered order or an open position, in a stable order. */
export function paperWatchedInstruments(account: PaperAccount): Instrument[] {
  const found = new Map<string, Instrument>();
  for (const order of account.orders) if (order.status === 'working' || order.status === 'triggered') found.set(order.instrument.id, order.instrument);
  for (const position of Object.values(account.positions)) if (position.quantity !== 0) found.set(position.instrument.id, position.instrument);
  return [...found.values()].sort((x, y) => x.id.localeCompare(y.id));
}

/** Symbols the host opens a background 1m series for: every watched instrument except the charted one. */
export function paperBackgroundSymbols(account: PaperAccount, chartedId: string): string[] {
  return paperWatchedInstruments(account).filter(row => row.id !== chartedId).map(row => row.symbol);
}

/** One 1m feed input per watched, non-charted instrument whose background series has bars. Others wait for their series. */
export function paperBackgroundInputs(account: PaperAccount, chartedId: string, series: ReadonlyMap<string, Pick<BarDataset, 'bars' | 'provenance'>>): PaperBarFeedInput[] {
  return paperWatchedInstruments(account).filter(row => row.id !== chartedId).flatMap(row => {
    const found = series.get(row.id);
    return found && found.bars.length ? [{ bars: found.bars, instrument: row, provenance: found.provenance, live: true, resolution: '1m', sessionOf: alpacaBarSession }] : [];
  });
}
