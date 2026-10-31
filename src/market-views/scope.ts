import type { BarDataset } from '../domain/types';

/** Which loaded datasets a Markets view looks at. Never market-wide: only what the user has loaded. */
export type MarketScopeKind = 'loaded' | 'watchlist';
export interface MarketScope { kind: MarketScopeKind; datasets: BarDataset[]; loadedTotal: number; watchTotal: number | null; missingWatch: string[] }

/** One dataset per instrument: the one with the most bars (ties keep the first). */
export function dedupeDatasets(datasets: readonly BarDataset[]): BarDataset[] {
  const best = new Map<string, BarDataset>();
  for (const set of datasets) { const old = best.get(set.instrument.id); if (!old || set.bars.length > old.bars.length) best.set(set.instrument.id, set); }
  return [...best.values()];
}
/** Watch entries match an instrument id or a symbol, case-insensitive. */
export function resolveScope(datasets: readonly BarDataset[], kind: MarketScopeKind, watch: readonly string[] | undefined): MarketScope {
  const all = dedupeDatasets(datasets);
  if (kind === 'loaded' || !watch) return { kind: 'loaded', datasets: all, loadedTotal: all.length, watchTotal: null, missingWatch: [] };
  const keys = [...new Set(watch.map(entry => entry.trim().toUpperCase()).filter(Boolean))];
  const hit = (set: BarDataset, key: string) => set.instrument.id.toUpperCase() === key || set.instrument.symbol.toUpperCase() === key;
  const picked = all.filter(set => keys.some(key => hit(set, key)));
  const missingWatch = keys.filter(key => !all.some(set => hit(set, key)));
  return { kind: 'watchlist', datasets: picked, loadedTotal: all.length, watchTotal: keys.length, missingWatch };
}
/** The visible scope line. `eligible` is how many of the scoped symbols had enough bars for the current view. */
export function scopeLine(scope: MarketScope, eligible: number): string {
  const n = scope.datasets.length;
  const base = scope.kind === 'watchlist'
    ? `${n} of ${scope.watchTotal} watchlist symbols have loaded data`
    : `${n} of ${n} loaded symbol${n === 1 ? '' : 's'}`;
  const tail = eligible === n ? '' : `, ${eligible} with enough bars for this view`;
  return `${base}${tail}. Not market-wide: only symbols loaded in this workspace are counted.`;
}
/** Short visible scope chip; the full sentence from scopeLine goes in the info popover. */
export function scopeChip(scope: MarketScope, single = false): string {
  const n = scope.datasets.length;
  if (scope.kind === 'watchlist') return `Watchlist: ${n} of ${scope.watchTotal} loaded`;
  return single ? `${n} loaded symbol${n === 1 ? '' : 's'}` : `Loaded symbols only (${n})`;
}
