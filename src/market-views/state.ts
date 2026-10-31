import type { MarketScopeKind } from './scope';

export type MarketTab = 'gainers' | 'losers' | 'active' | 'seasonals' | 'rating' | 'breadth' | 'macro' | 'yield';
/**
 * The optional fields hold the view settings of each tab. They are written only once the user changes them,
 * so the saved default stays { version, tab, scope, symbolId }. Restore drops anything invalid.
 */
export interface MarketViewsState {
  version: 1; tab: MarketTab; scope: MarketScopeKind; symbolId: string | null;
  hotMarket?: string; hotExchange?: string; hotSort?: string | null; hotDir?: 'asc' | 'desc';
  seasonStart?: number | null; seasonEnd?: number | null; seasonExcluded?: number[]; seasonHidden?: string[]; seasonNormalize?: 'percent' | 'index'; seasonRange?: boolean;
  ratingInterval?: 'loaded' | '1W' | '1M';
  benchmarkId?: string | null;
  macroDataset?: string; macroMetric?: string; macroCountry?: string; macroPeriod?: string; macroCompare?: 'none' | '1M' | '12M'; macroScale?: 'linear' | 'quantile';
  yieldMaturities?: string[]; yieldDate?: string | null; yieldCompare?: string[]; yieldSpread?: string;
}
export const MARKET_TABS: readonly MarketTab[] = ['gainers', 'losers', 'active', 'seasonals', 'rating', 'breadth', 'macro', 'yield'];
export const defaultMarketViews = (): MarketViewsState => ({ version: 1, tab: 'gainers', scope: 'loaded', symbolId: null });

const str = (v: unknown, max = 200) => typeof v === 'string' && v.length <= max ? v : undefined;
const pick = <T extends string>(v: unknown, allowed: readonly T[]) => allowed.includes(v as T) ? v as T : undefined;
const year = (v: unknown) => v === null ? null : Number.isInteger(v) && (v as number) >= 1800 && (v as number) <= 2200 ? v as number : undefined;
const strList = (v: unknown, max = 40) => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length <= 40))].slice(0, max) : undefined;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Tolerant restore: anything unrecognised falls back to the default. */
export function restoreMarketViews(value: unknown): MarketViewsState {
  const d = defaultMarketViews(); if (!value || typeof value !== 'object') return d;
  const v = value as Record<string, unknown>;
  const out: MarketViewsState = {
    version: 1,
    tab: MARKET_TABS.includes(v.tab as MarketTab) ? v.tab as MarketTab : d.tab,
    scope: v.scope === 'watchlist' ? 'watchlist' : 'loaded',
    symbolId: typeof v.symbolId === 'string' && v.symbolId.length <= 200 ? v.symbolId : null,
  };
  const extra: Partial<MarketViewsState> = {
    hotMarket: str(v.hotMarket, 40), hotExchange: str(v.hotExchange, 80),
    hotSort: v.hotSort === null ? null : pick(v.hotSort, ['symbol', 'last', 'change', 'changePct', 'volume']), hotDir: pick(v.hotDir, ['asc', 'desc']),
    seasonStart: year(v.seasonStart), seasonEnd: year(v.seasonEnd),
    seasonExcluded: Array.isArray(v.seasonExcluded) ? [...new Set(v.seasonExcluded.filter((x): x is number => year(x) !== undefined && x !== null))].slice(0, 200) : undefined,
    seasonHidden: strList(v.seasonHidden, 210), seasonNormalize: pick(v.seasonNormalize, ['percent', 'index']), seasonRange: typeof v.seasonRange === 'boolean' ? v.seasonRange : undefined,
    ratingInterval: pick(v.ratingInterval, ['loaded', '1W', '1M']),
    benchmarkId: v.benchmarkId === null ? null : str(v.benchmarkId),
    macroDataset: str(v.macroDataset, 40), macroMetric: str(v.macroMetric, 40), macroCountry: str(v.macroCountry, 8),
    macroPeriod: typeof v.macroPeriod === 'string' && (v.macroPeriod === 'latest' || /^\d{4}-\d{2}$/.test(v.macroPeriod)) ? v.macroPeriod : undefined,
    macroCompare: pick(v.macroCompare, ['none', '1M', '12M']), macroScale: pick(v.macroScale, ['linear', 'quantile']),
    yieldMaturities: strList(v.yieldMaturities, 11),
    yieldDate: v.yieldDate === null ? null : typeof v.yieldDate === 'string' && DATE.test(v.yieldDate) ? v.yieldDate : undefined,
    yieldCompare: Array.isArray(v.yieldCompare) ? [...new Set(v.yieldCompare.filter((x): x is string => typeof x === 'string' && DATE.test(x)))].slice(0, 3) : undefined,
    yieldSpread: str(v.yieldSpread, 20),
  };
  for (const [k, x] of Object.entries(extra)) if (x !== undefined) (out as unknown as Record<string, unknown>)[k] = x;
  return out;
}
