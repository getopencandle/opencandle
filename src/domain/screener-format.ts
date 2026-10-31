import type { ScreenerCell, ScreenerColumn } from './screener';
import { ratingBucketLabel } from './screener-formulas';
import { SCREENER_FUNDAMENTAL_SHORT, isFundamentalMetric } from './screener-fundamentals';

/**
 * Display formatting for screener cells and column titles. Pure presentation: filters, sorting and CSV export keep the
 * exact native values; only the table text changes. Unavailable values never become zero or blank, they read "n/a" with
 * the reason kept for the tooltip.
 */
export type ScreenerFormatKind = 'compact' | 'price' | 'signed-price' | 'percent' | 'signed-percent' | 'volume' | 'ratio' | 'index' | 'boolean' | 'rating' | 'days' | 'text' | 'flag' | 'datetime' | 'number';
const KINDS: Record<string, ScreenerFormatKind> = {
  symbol: 'text', name: 'text', exchange: 'text', currency: 'text', assetClass: 'text', flag: 'flag', baseCurrency: 'text', quoteCurrency: 'text', lastTradeTime: 'datetime',
  last: 'price', open: 'price', high: 'price', low: 'price', sma: 'price', ema: 'price', atr: 'price', macd: 'price', periodHigh: 'price', periodLow: 'price',
  change: 'signed-price', changeFromOpen: 'signed-price',
  changePercent: 'signed-percent', performance: 'signed-percent', performancePeriod: 'signed-percent', changeFromOpenPercent: 'signed-percent', gapPercent: 'signed-percent', preMarketChangePercent: 'signed-percent', postMarketChangePercent: 'signed-percent',
  volatility: 'percent', adrPercent: 'percent', atrPercent: 'percent',
  volume: 'volume', averageVolume: 'volume', preMarketVolume: 'volume', postMarketVolume: 'volume',
  relativeVolume: 'ratio', relativeVolumeAtTime: 'ratio', rsi: 'index',
  pattern: 'boolean', newHigh: 'boolean', newLow: 'boolean', rating: 'rating', earningsUpcomingDays: 'days', earningsRecentDays: 'days',
  marketCap: 'compact', priceEarnings: 'ratio', pegRatio: 'ratio', priceSales: 'ratio', priceBook: 'ratio', evEbitda: 'ratio', epsTtm: 'ratio', dividendsPerShare: 'ratio',
  dividendYield: 'percent', payoutRatio: 'percent', grossMargin: 'percent', operatingMargin: 'percent', pretaxMargin: 'percent', netMargin: 'percent',
};
export const screenerFormatKind = (metric: string): ScreenerFormatKind => KINDS[metric] ?? 'number';

/** Short header text. The full meaning stays in the header tooltip. */
export const SCREENER_SHORT_LABELS: Record<string, string> = {
  symbol: 'Symbol', name: 'Name', exchange: 'Exchange', currency: 'Currency', assetClass: 'Type', flag: 'Flag', baseCurrency: 'Base cur', quoteCurrency: 'Quote cur', lastTradeTime: 'Last trade',
  last: 'Price', change: 'Chg', changePercent: 'Chg %', open: 'Open', high: 'High', low: 'Low', volume: 'Volume', averageVolume: 'Avg vol', relativeVolume: 'Rel volume',
  sma: 'SMA', ema: 'EMA', rsi: 'RSI', atr: 'ATR', macd: 'MACD', performance: 'Perf %', periodHigh: 'High', periodLow: 'Low',
  pattern: 'Pattern', volatility: 'Volatility', adrPercent: 'ADR %', atrPercent: 'ATR %', performancePeriod: 'Perf', newHigh: 'New high', newLow: 'New low', rating: 'Rating',
  changeFromOpen: 'Chg from open', changeFromOpenPercent: 'Chg from open %', gapPercent: 'Gap %', preMarketChangePercent: 'Pre-mkt chg %', preMarketVolume: 'Pre-mkt vol',
  postMarketChangePercent: 'Post-mkt chg %', postMarketVolume: 'Post-mkt vol', relativeVolumeAtTime: 'Rel vol at time',
  earningsUpcomingDays: 'Next earnings', earningsRecentDays: 'Last earnings',
  ...SCREENER_FUNDAMENTAL_SHORT,
};
const LENGTH_SUFFIX = new Set(['sma', 'ema', 'rsi', 'atr', 'performance', 'periodHigh', 'periodLow', 'atrPercent', 'adrPercent']);

/** Header text: a custom label is kept as typed; a default (or absent) label becomes the short form plus its key parameter. */
export function screenerShortTitle(column: ScreenerColumn, fullLabels: Record<string, string>): string {
  if (column.label && column.label !== fullLabels[column.metric]) return column.label;
  const base = SCREENER_SHORT_LABELS[column.metric] ?? fullLabels[column.metric] ?? column.metric, parameters = column.parameters ?? {};
  if (column.metric === 'performancePeriod' && typeof parameters.period === 'string') return `${base} ${parameters.period}`;
  if (column.metric === 'periodHigh' || column.metric === 'periodLow') return Number.isSafeInteger(parameters.length) ? `${base} ${parameters.length}` : base;
  if (LENGTH_SUFFIX.has(column.metric) && Number.isSafeInteger(parameters.length)) return `${base} ${parameters.length}`;
  return base;
}

/** Full header tooltip: the long metric meaning plus every parameter. */
export function screenerColumnTooltip(column: ScreenerColumn, fullLabels: Record<string, string>): string {
  const full = fullLabels[column.metric] ?? column.metric, entries = Object.entries(column.parameters ?? {});
  const custom = column.label && column.label !== full ? `${column.label}: ` : '';
  return `${custom}${full}${entries.length ? ` (${entries.map(([key, value]) => `${key} ${String(value)}`).join(', ')})` : ''}. Click to sort.`;
}

/** Decimals implied by an instrument tick size (0.01 gives 2, 0.25 gives 2, 1 gives 0). Unknown ticks use 2. */
export function priceDecimals(tickSize: number | undefined): number {
  if (typeof tickSize !== 'number' || !Number.isFinite(tickSize) || tickSize <= 0) return 2;
  const text = String(tickSize), exponent = /e-(\d+)$/.exec(text);
  if (exponent) return Math.min(8, Number(exponent[1]) + ((text.split('e')[0].split('.')[1] ?? '').length));
  return Math.min(8, (text.split('.')[1] ?? '').length);
}
const fixed = (value: number, digits: number) => value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** 1,170,000 reads 1.17M; values under one thousand keep their integer form. */
export function formatCompactVolume(value: number): string {
  const size = Math.abs(value);
  for (const [limit, suffix] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as const) if (size >= limit) return `${fixed(value / limit, 2)}${suffix}`;
  return Number.isInteger(value) ? fixed(value, 0) : fixed(value, 2);
}
/** Signed text with a direction tone. A value that rounds to zero is neutral and unsigned. */
function signed(value: number, digits: number, suffix: string): { text: string; tone: 'up' | 'down' | null } {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return { text: `${fixed(0, digits)}${suffix}`, tone: null };
  return { text: `${rounded > 0 ? '+' : '-'}${fixed(Math.abs(value), digits)}${suffix}`, tone: rounded > 0 ? 'up' : 'down' };
}

export interface ScreenerCellDisplay { text: string; tone: 'up' | 'down' | null; available: boolean; title?: string; }
const STATE_WORDS: Record<ScreenerCell['state'], string> = { available: 'unavailable', unavailable: 'unavailable', 'insufficient-history': 'not enough history', invalid: 'invalid' };
export const SCREENER_NA = 'n/a';
/** Fundamentals cells with no value (no linked facts, or an input is missing). */
export const SCREENER_DASH = '-';

export function formatScreenerCell(metric: string, cell: Pick<ScreenerCell, 'value' | 'state' | 'reason' | 'note'>, options: { tickSize?: number; flagLabel?: (value: string) => string } = {}): ScreenerCellDisplay {
  // Fundamentals read like a quote table: a missing value is a dash, the tooltip carries the reason or the source note.
  if (isFundamentalMetric(metric)) {
    if (cell.state !== 'available' || typeof cell.value !== 'number' || !Number.isFinite(cell.value)) return { text: SCREENER_DASH, tone: null, available: false, title: `No value: ${cell.reason ?? 'not available.'}` };
    const shown = screenerFormatKind(metric) === 'compact' ? formatCompactVolume(cell.value) : screenerFormatKind(metric) === 'percent' ? `${fixed(cell.value, 2)}%` : fixed(cell.value, 2);
    return { text: shown, tone: null, available: true, title: `${cell.note ? cell.note + '\n' : ''}Exact value ${cell.value}` };
  }
  if (cell.state !== 'available' || cell.value === null) return { text: SCREENER_NA, tone: null, available: false, title: `${SCREENER_NA} (${STATE_WORDS[cell.state]})${cell.reason ? `: ${cell.reason}` : '.'}` };
  const value = cell.value, kind = screenerFormatKind(metric);
  if (typeof value === 'string') return { text: kind === 'flag' && options.flagLabel ? options.flagLabel(value) : value, tone: null, available: true, title: cell.reason };
  if (!Number.isFinite(value)) return { text: SCREENER_NA, tone: null, available: false, title: `${SCREENER_NA} (invalid): the value is not finite.` };
  const exact = `Exact value ${value}`;
  switch (kind) {
    case 'price': return { text: fixed(value, priceDecimals(options.tickSize)), tone: null, available: true, title: exact };
    case 'signed-price': return { ...signed(value, priceDecimals(options.tickSize), ''), available: true, title: exact };
    case 'signed-percent': return { ...signed(value, 2, '%'), available: true, title: exact };
    case 'percent': return { text: `${fixed(value, 2)}%`, tone: null, available: true, title: exact };
    case 'volume': return { text: formatCompactVolume(value), tone: null, available: true, title: `Exact value ${value.toLocaleString()}` };
    case 'ratio': case 'index': return { text: fixed(value, 2), tone: null, available: true, title: exact };
    case 'boolean': return { text: value === 1 ? 'Yes' : value === 0 ? 'No' : String(value), tone: null, available: true, title: exact };
    // The newest supplied bar's time, shown in UTC (the exact Unix seconds stay in the tooltip, filters and CSV).
    case 'datetime': { const date = new Date(value * 1000); return Number.isNaN(date.getTime()) ? { text: SCREENER_NA, tone: null, available: false, title: `${SCREENER_NA} (invalid): the time is out of range.` } : { text: `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`, tone: null, available: true, title: `Bar time ${value} (Unix seconds)` }; }
    case 'days': return { text: Number.isInteger(value) ? fixed(value, 0) : fixed(value, 1), tone: null, available: true, title: exact };
    case 'rating': { const bucket = ratingBucketLabel(value); return { text: bucket ?? fixed(value, 2), tone: value >= 0.1 ? 'up' : value <= -0.1 ? 'down' : null, available: true, title: `Rating ${fixed(value, 2)} on a -1 to +1 scale` }; }
    default: return { text: value.toLocaleString(undefined, { maximumFractionDigits: 4 }), tone: null, available: true, title: exact };
  }
}
