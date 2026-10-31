import type { BarDataset } from '../domain/types';

export type HotlistKind = 'gainers' | 'losers' | 'active';
export interface HotRow { id: string; symbol: string; name: string; currency: string; last: number; previous: number; change: number; changePct: number; volume: number; dollarVolume: number; resolution: string }

/** Change is the last bar close against the bar before it. Needs two bars and a finite positive previous close. */
export function hotRow(set: BarDataset): HotRow | null {
  const b = set.bars; if (b.length < 2) return null;
  const last = b[b.length - 1], prev = b[b.length - 2];
  if (![last.close, prev.close, last.volume].every(Number.isFinite) || prev.close <= 0) return null;
  const change = last.close - prev.close;
  return { id: set.instrument.id, symbol: set.instrument.symbol, name: set.instrument.name, currency: set.instrument.currency, last: last.close, previous: prev.close,
    change, changePct: change / prev.close * 100, volume: last.volume, dollarVolume: last.volume * last.close, resolution: set.resolution };
}
export function hotlist(sets: readonly BarDataset[], kind: HotlistKind, limit = 20): { rows: HotRow[]; eligible: number } {
  const all = sets.map(hotRow).filter((r): r is HotRow => r !== null);
  const cmp: Record<HotlistKind, (a: HotRow, b: HotRow) => number> = {
    gainers: (a, b) => b.changePct - a.changePct, losers: (a, b) => a.changePct - b.changePct, active: (a, b) => b.volume - a.volume };
  const pool = kind === 'gainers' ? all.filter(r => r.changePct > 0) : kind === 'losers' ? all.filter(r => r.changePct < 0) : all;
  return { rows: pool.sort((a, b) => cmp[kind](a, b) || a.symbol.localeCompare(b.symbol)).slice(0, limit), eligible: all.length };
}

/**
 * Filters over the loaded symbols only. Market is the
 * instrument asset class, exchange is the instrument exchange; 'all' keeps everything. Sorting reorders the ranked rows.
 */
export const HOT_MARKET_LABEL: Record<string, string> = { stock: 'Stocks', etf: 'ETFs', crypto: 'Crypto', forex: 'Forex', future: 'Futures', index: 'Indices', commodity: 'Commodities', bond: 'Bonds', option: 'Options', other: 'Other' };
export const hotMarketLabel = (value: string) => HOT_MARKET_LABEL[value] ?? value;
export function hotFilterOptions(sets: readonly BarDataset[], market: string): { markets: string[]; exchanges: string[] } {
  const markets = [...new Set(sets.map(s => s.instrument.assetClass))].sort();
  const pool = market === 'all' ? sets : sets.filter(s => s.instrument.assetClass === market);
  return { markets, exchanges: [...new Set(pool.map(s => s.instrument.exchange).filter(Boolean))].sort() };
}
export function filterHotSets(sets: readonly BarDataset[], market: string, exchange: string): BarDataset[] {
  return sets.filter(s => (market === 'all' || s.instrument.assetClass === market) && (exchange === 'all' || s.instrument.exchange === exchange));
}
export type HotSortKey = 'symbol' | 'last' | 'change' | 'changePct' | 'volume';
export const HOT_SORT_KEYS: readonly HotSortKey[] = ['symbol', 'last', 'change', 'changePct', 'volume'];
export function sortHotRows(rows: readonly HotRow[], key: HotSortKey | null, dir: 'asc' | 'desc'): HotRow[] {
  if (!key) return [...rows];
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => sign * (key === 'symbol' ? a.symbol.localeCompare(b.symbol) : a[key] - b[key]) || a.symbol.localeCompare(b.symbol));
}
