import type { PaperAccount } from './paper';

/**
 * The part of a virtual account the workspace autosave waits on. Live price marks (`quotes`) and the
 * simulation clock change on every tick, so they are excluded: a price-only update never re-arms the autosave debounce.
 * Orders, fills, positions, cash, events, settings and brackets are included, so every real change is seen. The latest
 * quotes are still written with the next save.
 */
export function paperDurableKey(account: PaperAccount | null | undefined): string {
  if (!account) return '';
  const { quotes: _quotes, clock: _clock, ...durable } = account;
  return JSON.stringify(durable);
}
/** Debounce for the workspace autosave, and the longest a real change may wait while changes keep arriving. */
export const AUTOSAVE_DEBOUNCE_MS = 1200;
export const AUTOSAVE_MAX_WAIT_MS = 5000;
export function autosaveDelay(dirtySince: number, now: number): number {
  return Math.max(0, Math.min(AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_WAIT_MS - (now - dirtySince)));
}
