import type { ScreenerColumn, ScreenerFilter, ScreenerSort } from './screener';

/**
 * Starter screens. Every preset is our own choice (a convenient starting point, not a copy of any vendor screen) and is applied
 * as an ordinary editable draft: the user can change any column or filter afterwards, and nothing is saved until Save.
 */
export interface ScreenerPreset {
  id: string; name: string; description: string;
  columns: ScreenerColumn[]; filters: ScreenerFilter[]; sort: ScreenerSort;
}
const symbol: ScreenerColumn = { id: 'symbol', metric: 'symbol' }, last: ScreenerColumn = { id: 'last', metric: 'last' };
const filter = (id: string, columnId: string, operator: ScreenerFilter['operator'], value: ScreenerFilter['value']): ScreenerFilter => ({ id, columnId, operator, value, active: true });

export const SCREENER_PRESETS: readonly ScreenerPreset[] = Object.freeze([
  { id: 'top-gainers', name: 'Top gainers', description: 'Rows that rose against the previous supplied row, biggest rise first.',
    columns: [symbol, last, { id: 'change', metric: 'changePercent' }, { id: 'volume', metric: 'volume' }],
    filters: [filter('gain', 'change', 'gt', 0)], sort: { columnId: 'change', direction: 'desc' } },
  { id: 'top-losers', name: 'Top losers', description: 'Rows that fell against the previous supplied row, biggest fall first.',
    columns: [symbol, last, { id: 'change', metric: 'changePercent' }, { id: 'volume', metric: 'volume' }],
    filters: [filter('loss', 'change', 'lt', 0)], sort: { columnId: 'change', direction: 'asc' } },
  { id: 'oversold-rsi', name: 'Oversold RSI', description: 'RSI (14) at or under 30, lowest first.',
    columns: [symbol, last, { id: 'rsi', metric: 'rsi', parameters: { length: 14, source: 'close' } }, { id: 'change', metric: 'changePercent' }],
    filters: [filter('oversold', 'rsi', 'lte', 30)], sort: { columnId: 'rsi', direction: 'asc' } },
  { id: 'new-52-week-high', name: 'New 52-week high', description: 'The last row went above every high of the 52 weeks before it. Needs a year of loaded bars.',
    columns: [symbol, last, { id: 'high52', metric: 'newHigh', parameters: { basis: '52 weeks', length: 20 } }, { id: 'perfYear', metric: 'performancePeriod', parameters: { period: '1Y' } }],
    filters: [filter('high', 'high52', 'eq', 1)], sort: { columnId: 'perfYear', direction: 'desc' } },
  { id: 'unusual-volume', name: 'Unusual volume', description: 'Last volume at least twice the mean of the 10 rows before it. Regular-session or daily bars.',
    columns: [symbol, last, { id: 'relvol', metric: 'relativeVolume', parameters: { length: 10 } }, { id: 'change', metric: 'changePercent' }],
    filters: [filter('unusual', 'relvol', 'gte', 2)], sort: { columnId: 'relvol', direction: 'desc' } },
  { id: 'gap-up', name: 'Gap up', description: 'The last row opened at least 2% above the previous close, biggest gap first.',
    columns: [symbol, last, { id: 'gap', metric: 'gapPercent' }, { id: 'fromOpen', metric: 'changeFromOpenPercent' }, { id: 'volume', metric: 'volume' }],
    filters: [filter('gapUp', 'gap', 'gte', 2)], sort: { columnId: 'gap', direction: 'desc' } },
  { id: 'earnings-week', name: 'Earnings within 7 days', description: 'A supplied earnings date 0 to 7 days after the last row. Needs earnings in Calendar.',
    columns: [symbol, last, { id: 'earnings', metric: 'earningsUpcomingDays' }, { id: 'change', metric: 'changePercent' }],
    filters: [filter('soon', 'earnings', 'between', [0, 7])], sort: { columnId: 'earnings', direction: 'asc' } },
  { id: 'low-pe', name: 'Low P/E', description: 'Positive TTM P/E under 15, lowest first. Needs saved company facts linked in Fundamentals.',
    columns: [symbol, last, { id: 'pe', metric: 'priceEarnings' }, { id: 'cap', metric: 'marketCap' }, { id: 'net', metric: 'netMargin' }],
    filters: [filter('cheap', 'pe', 'lt', 15)], sort: { columnId: 'pe', direction: 'asc' } },
  { id: 'dividend-yield', name: 'High dividend yield', description: 'TTM dividend yield above 3%, highest first. Needs saved company facts linked in Fundamentals.',
    columns: [symbol, last, { id: 'yield', metric: 'dividendYield' }, { id: 'dps', metric: 'dividendsPerShare' }, { id: 'payout', metric: 'payoutRatio' }],
    filters: [filter('yielding', 'yield', 'gt', 3)], sort: { columnId: 'yield', direction: 'desc' } },
] satisfies ScreenerPreset[]);

/**
 * Column sets replace the visible columns only. Groupings; columns that a filter or the sort still uses are kept
 * after the set so no filter silently disappears.
 */
export interface ScreenerColumnSet { id: string; name: string; columns: ScreenerColumn[]; }
const col = (id: string, metric: string, parameters?: Record<string, unknown>): ScreenerColumn => parameters ? { id, metric, parameters } : { id, metric };
export const SCREENER_COLUMN_SETS: readonly ScreenerColumnSet[] = Object.freeze([
  { id: 'overview', name: 'Overview', columns: [symbol, col('name', 'name'), last, col('chg', 'changePercent'), col('vol', 'volume'), col('relvol', 'relativeVolume', { length: 10 }), col('rating', 'rating', { use: 'All' })] },
  { id: 'performance', name: 'Performance', columns: [symbol, last, col('chg', 'changePercent'), col('w1', 'performancePeriod', { period: '1W' }), col('m1', 'performancePeriod', { period: '1M' }), col('m3', 'performancePeriod', { period: '3M' }), col('m6', 'performancePeriod', { period: '6M' }), col('ytd', 'performancePeriod', { period: 'YTD' }), col('y1', 'performancePeriod', { period: '1Y' }), col('volat', 'volatility')] },
  { id: 'oscillators', name: 'Oscillators', columns: [symbol, last, col('rsi', 'rsi', { length: 14, source: 'close' }), col('macd', 'macd', { fast: 12, slow: 26, signal: 9, source: 'close', oscillatorType: 'EMA', signalType: 'EMA', plot: 'macd' }), col('atrp', 'atrPercent', { length: 14 }), col('rating', 'rating', { use: 'Oscillators' })] },
  { id: 'trend', name: 'Trend', columns: [symbol, last, col('sma50', 'sma', { length: 50, source: 'close' }), col('sma200', 'sma', { length: 200, source: 'close' }), col('ema20', 'ema', { length: 20, source: 'close' }), col('rating', 'rating', { use: 'Moving averages' })] },
  { id: 'volume', name: 'Volume', columns: [symbol, last, col('vol', 'volume'), col('avgvol', 'averageVolume', { length: 10 }), col('relvol', 'relativeVolume', { length: 10 }), col('rvat', 'relativeVolumeAtTime', { length: 10 })] },
  { id: 'extended', name: 'Extended hours', columns: [symbol, last, col('gap', 'gapPercent'), col('fromOpen', 'changeFromOpenPercent'), col('pre', 'preMarketChangePercent'), col('prevol', 'preMarketVolume'), col('post', 'postMarketChangePercent'), col('postvol', 'postMarketVolume')] },
  { id: 'earnings', name: 'Earnings', columns: [symbol, last, col('chg', 'changePercent'), col('next', 'earningsUpcomingDays'), col('recent', 'earningsRecentDays')] },
  // Fundamentals sets read saved, linked SEC companyfacts only.
  { id: 'valuation', name: 'Valuation', columns: [symbol, last, col('cap', 'marketCap'), col('pe', 'priceEarnings'), col('peg', 'pegRatio'), col('ps', 'priceSales'), col('pb', 'priceBook'), col('evebitda', 'evEbitda'), col('eps', 'epsTtm')] },
  { id: 'dividends', name: 'Dividends', columns: [symbol, last, col('yield', 'dividendYield'), col('dps', 'dividendsPerShare'), col('payout', 'payoutRatio')] },
  { id: 'margins', name: 'Margins', columns: [symbol, last, col('gross', 'grossMargin'), col('oper', 'operatingMargin'), col('pretax', 'pretaxMargin'), col('net', 'netMargin')] },
] satisfies ScreenerColumnSet[]);

/**
 * Swap the visible columns for a set. A filter or sort column that matches a set column (same metric and parameters) moves
 * to it; a filter column with no match is kept after the set so no filter silently disappears. A sort with no match moves
 * to the first column ascending.
 */
export function applyScreenerColumnSet(set: ScreenerColumnSet, current: { columns: readonly ScreenerColumn[]; filters: readonly ScreenerFilter[]; sort: ScreenerSort }, newId: () => string): { columns: ScreenerColumn[]; filters: ScreenerFilter[]; sort: ScreenerSort } {
  const fresh = set.columns.map(column => ({ ...structuredClone(column), id: newId() }));
  const shape = (column: ScreenerColumn) => JSON.stringify([column.metric, Object.entries(column.parameters ?? {}).sort(([a], [b]) => a.localeCompare(b))]);
  const byShape = new Map(fresh.map(column => [shape(column), column.id]));
  const remap = new Map<string, string>(), kept: ScreenerColumn[] = [];
  for (const column of current.columns) {
    const match = byShape.get(shape(column));
    if (match) remap.set(column.id, match);
    else if (current.filters.some(item => item.columnId === column.id)) { kept.push(structuredClone(column)); remap.set(column.id, column.id); }
  }
  const columns = [...fresh, ...kept];
  if (columns.length > 100) throw new Error('This column set and the filtered columns would exceed 100 columns. Remove some filters first.');
  const filters = current.filters.map(item => ({ ...structuredClone(item), columnId: remap.get(item.columnId) ?? item.columnId }));
  const sortId = remap.get(current.sort.columnId);
  return { columns, filters, sort: sortId ? { columnId: sortId, direction: current.sort.direction } : { columnId: columns[0].id, direction: 'asc' } };
}

/** A fresh copy with new column and filter ids so applying twice never shares identities. */
export function instantiateScreenerPreset(preset: ScreenerPreset, newId: () => string): { columns: ScreenerColumn[]; filters: ScreenerFilter[]; sort: ScreenerSort } {
  const ids = new Map(preset.columns.map(column => [column.id, newId()]));
  const columns = preset.columns.map(column => ({ ...structuredClone(column), id: ids.get(column.id)! }));
  const filters = preset.filters.map(item => ({ ...structuredClone(item), id: newId(), columnId: ids.get(item.columnId)! }));
  return { columns, filters, sort: { ...preset.sort, columnId: ids.get(preset.sort.columnId)! } };
}
