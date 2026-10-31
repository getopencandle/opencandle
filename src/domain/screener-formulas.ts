import { calculateIndicator, sma } from './indicators';
import { CANDLE_FAMILIES, CandleMetrics, TREND_RULES, detectCandleFamily, trendStates, type TrendRule } from './indicators-ext/patterns-candles';
import { heatmapPeriodBase } from './heatmap';
import type { BarDataset } from './types';
import type { ScreenerCell } from './screener';

/**
 * Screener formula family. Every formula reads only the supplied bars. A value that cannot be computed is a
 * cell with state 'insufficient-history' or 'unavailable' and a reason, never zero. Definitions are readings
 * of the public descriptions of these screener fields and are listed in SCREENER_FORMULA_POLICIES.
 */
export const SCREENER_FORMULA_METRICS = ['pattern', 'volatility', 'adrPercent', 'atrPercent', 'performancePeriod', 'newHigh', 'newLow', 'rating'] as const;
export type ScreenerFormulaMetric = typeof SCREENER_FORMULA_METRICS[number];
export const isFormulaMetric = (metric: string): metric is ScreenerFormulaMetric => (SCREENER_FORMULA_METRICS as readonly string[]).includes(metric);

export interface FormulaParameter { key: string; label: string; defaultValue: number | string; options?: string[]; }
export interface PatternSide { name: string; family: string; direction: 'bullish' | 'bearish' | 'neutral'; }
/** The candlestick sides (one per documented pattern), in catalog order. Names are unique. */
export const SCREENER_PATTERN_SIDES: readonly PatternSide[] = CANDLE_FAMILIES.flatMap(family =>
  (['bullish', 'bearish', 'neutral'] as const).flatMap(direction => { const side = family[direction]; return side ? [{ name: side.name, family: family.id, direction }] : []; }));
export const SCREENER_PATTERN_NAMES: string[] = SCREENER_PATTERN_SIDES.map(side => side.name);
export const SCREENER_PERFORMANCE_PERIODS = ['1W', '1M', '3M', '6M', 'YTD', '1Y'] as const;
export const SCREENER_RATING_BASES = ['All', 'Moving averages', 'Oscillators'] as const;
const DAY = 86400;

export const SCREENER_FORMULA_LABELS: Record<ScreenerFormulaMetric, string> = {
  pattern: 'Candlestick pattern (1 = seen, 0 = not seen)', volatility: 'Volatility, % (latest UTC date range / low)', adrPercent: 'ADR %, average daily range', atrPercent: 'ATR %, average true range / close',
  performancePeriod: 'Performance over a calendar period, %', newHigh: 'New high (1 = yes)', newLow: 'New low (1 = yes)', rating: 'Technical rating (-1 sell to +1 buy)',
};
export const SCREENER_FORMULA_POLICIES = [
  'Candlestick pattern: 1 when the chosen pattern completes on any of the newest N supplied bars (N defaults to 1, the last bar), otherwise 0. Detection reuses the chart pattern rules and the chosen trend rule; fewer than 14 bars before a pattern cannot qualify it.',
  'Volatility: (highest high - lowest low) / lowest low over the bars of the latest UTC date, in percent. It may be a partial day.',
  'ADR %: 100 x (mean of high / low over the newest N bars - 1). ATR %: 100 x ATR(N, RMA) / last close.',
  'Performance: percent change of the last close against the last close at or before the period start (UTC calendar, as the heatmap). A period whose base is older than five days before the start, or beyond the first loaded bar, is insufficient history.',
  'New high or low: 1 when the last bar exceeds the highest high (or goes under the lowest low) of the N bars before it, or of the 52 weeks before it. A window not covered by the loaded bars is insufficient history.',
  'Technical rating: mean of the moving-average and oscillator votes from the Technical ratings indicator; buckets are strong buy at 0.5 or more, buy at 0.1, sell at -0.1, strong sell at -0.5 or less. OpenCandle-defined.',
];
export function formulaParameters(metric: string): FormulaParameter[] {
  const length = (value: number, label = 'Length in supplied rows'): FormulaParameter => ({ key: 'length', label, defaultValue: value });
  switch (metric) {
    case 'pattern': return [{ key: 'pattern', label: 'Pattern', defaultValue: SCREENER_PATTERN_NAMES[0], options: SCREENER_PATTERN_NAMES }, { key: 'within', label: 'Seen within the newest rows', defaultValue: 1 }, { key: 'trendRule', label: 'Detect trend based on', defaultValue: 'SMA50', options: [...TREND_RULES] }];
    case 'adrPercent': return [length(14)];
    case 'atrPercent': return [length(14)];
    case 'performancePeriod': return [{ key: 'period', label: 'Period', defaultValue: '1M', options: [...SCREENER_PERFORMANCE_PERIODS] }];
    case 'newHigh': case 'newLow': return [{ key: 'basis', label: 'Window', defaultValue: 'Rows', options: ['Rows', '52 weeks'] }, length(20, 'Rows before the last row')];
    case 'rating': return [{ key: 'use', label: 'Rating is based on', defaultValue: 'All', options: [...SCREENER_RATING_BASES] }];
    default: return [];
  }
}
/** Rough per-bar work, for the screener calculation budget. */
export function formulaWork(metric: string): number {
  return metric === 'rating' ? 420 : metric === 'pattern' ? 48 : metric === 'atrPercent' ? 10 : 8;
}
export function ratingBucketLabel(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value >= 0.5 ? 'Strong buy' : value >= 0.1 ? 'Buy' : value > -0.1 ? 'Neutral' : value > -0.5 ? 'Sell' : 'Strong sell';
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function formulaCell(dataset: BarDataset, metric: ScreenerFormulaMetric, parameters: Record<string, unknown>): ScreenerCell {
  const bars = dataset.bars, last = bars.at(-1);
  const base: ScreenerCell = { value: null, previous: null, state: 'unavailable', asOf: last?.time ?? null };
  const ok = (value: number): ScreenerCell => ({ ...base, value, state: 'available' });
  const short = (reason: string): ScreenerCell => ({ ...base, state: 'insufficient-history', reason });
  const invalid = (reason: string): ScreenerCell => ({ ...base, state: 'invalid', reason });
  if (!last) return { ...base, reason: 'No historical bars are loaded for this instrument.' };
  if (['error', 'unavailable', 'loading'].includes(dataset.provenance.state)) return { ...base, reason: `Dataset is ${dataset.provenance.state}.` };
  const positive = (key: string, fallback: number): number | null => { const v = parameters[key] ?? fallback; return Number.isSafeInteger(v) && (v as number) >= 1 && (v as number) <= 100000 ? v as number : null; };

  if (metric === 'pattern') {
    const name = String(parameters.pattern ?? SCREENER_PATTERN_NAMES[0]), side = SCREENER_PATTERN_SIDES.find(s => s.name === name), within = positive('within', 1);
    if (!side) return invalid(`Unknown candlestick pattern ${name}.`);
    if (within === null) return invalid('Rows to look back must be a positive integer.');
    const rule = String(parameters.trendRule ?? 'SMA50') as TrendRule;
    if (!TREND_RULES.includes(rule)) return invalid(`Unknown trend rule ${rule}.`);
    const family = CANDLE_FAMILIES.find(f => f.id === side.family)!, metrics = new CandleMetrics(bars);
    const hits = detectCandleFamily(metrics, family, trendStates(bars, rule, sma), { bullish: true, bearish: true }, rule === 'No detection');
    const from = bars.length - within;
    return ok(hits.some(hit => hit.index >= from && hit.direction === side.direction && hit.name === side.name) ? 1 : 0);
  }
  if (metric === 'volatility') {
    const day = Math.floor(last.time / DAY);
    let high = -Infinity, low = Infinity;
    for (let i = bars.length - 1; i >= 0 && Math.floor(bars[i].time / DAY) === day; i--) {
      const bar = bars[i];
      if (!fin(bar.high) || !fin(bar.low) || bar.low <= 0 || bar.high < bar.low) return invalid('A bar on the latest UTC date has an invalid range.');
      high = Math.max(high, bar.high); low = Math.min(low, bar.low);
    }
    return ok(100 * (high - low) / low);
  }
  if (metric === 'adrPercent') {
    const n = positive('length', 14); if (n === null) return invalid('Length must be a positive integer at most 100000.');
    if (bars.length < n) return short(`ADR % needs ${n} rows; ${bars.length} supplied.`);
    let sum = 0;
    for (const bar of bars.slice(-n)) { if (!fin(bar.high) || !fin(bar.low) || bar.low <= 0 || bar.high < bar.low) return invalid('A bar in the window has an invalid range.'); sum += bar.high / bar.low; }
    return ok(100 * (sum / n - 1));
  }
  if (metric === 'atrPercent') {
    const n = positive('length', 14); if (n === null) return invalid('Length must be a positive integer at most 100000.');
    const calculated = calculateIndicator('atr', bars, { length: n, smoothing: 'RMA' });
    if (calculated.diagnostics.length) return invalid(calculated.diagnostics.join('; '));
    const atr = calculated.series.find(s => s.id === 'atr')?.values.at(-1);
    if (!fin(atr)) return short(`ATR % needs more than ${n} rows.`);
    return fin(last.close) && last.close > 0 ? ok(100 * atr / last.close) : invalid('The last close is not positive.');
  }
  if (metric === 'performancePeriod') {
    const period = String(parameters.period ?? '1M').toLowerCase();
    if (!['1w', '1m', '3m', '6m', 'ytd', '1y'].includes(period)) return invalid(`Unknown performance period ${parameters.period}.`);
    const target = heatmapPeriodBase(last.time, period as Parameters<typeof heatmapPeriodBase>[1]);
    let found = -1;
    for (let i = bars.length - 1; i >= 0; i--) if (bars[i].time <= target) { found = i; break; }
    if (found < 0) return short(`Loaded history does not reach back to the start of the ${String(parameters.period ?? '1M')} period.`);
    if (target - bars[found].time > 5 * DAY) return short('The comparison bar is more than five days older than the period start (a data gap).');
    const reference = bars[found].close;
    return fin(reference) && reference > 0 && fin(last.close) ? ok(100 * (last.close / reference - 1)) : invalid('The comparison close is missing or not positive.');
  }
  if (metric === 'newHigh' || metric === 'newLow') {
    const high = metric === 'newHigh', weeks = parameters.basis === '52 weeks';
    let from: number;
    if (weeks) {
      const start = last.time - 364 * DAY;
      if (bars[0].time > start + 5 * DAY) return short('Loaded history does not cover the 52 weeks before the last row.');
      from = bars.findIndex(bar => bar.time >= start);
    } else {
      const n = positive('length', 20); if (n === null) return invalid('Rows must be a positive integer at most 100000.');
      if (bars.length < n + 1) return short(`New ${high ? 'high' : 'low'} needs ${n + 1} rows; ${bars.length} supplied.`);
      from = bars.length - 1 - n;
    }
    let extreme = high ? -Infinity : Infinity;
    for (let i = from; i < bars.length - 1; i++) extreme = high ? Math.max(extreme, bars[i].high) : Math.min(extreme, bars[i].low);
    if (!fin(extreme)) return short('No earlier row is in the window.');
    return ok(high ? (last.high > extreme ? 1 : 0) : (last.low < extreme ? 1 : 0));
  }
  // rating
  const use = String(parameters.use ?? 'All');
  if (!(SCREENER_RATING_BASES as readonly string[]).includes(use)) return invalid(`Unknown rating basis ${use}.`);
  const calculated = calculateIndicator('techrating', bars, { ratingsUse: use });
  if (calculated.diagnostics.length) return invalid(calculated.diagnostics.join('; '));
  const series = calculated.series.find(s => s.id === 'rating')?.values;
  const value = series?.at(-1);
  if (!fin(value)) return short('The technical rating needs 200 rows for the moving averages and 50 for the oscillators.');
  const previous = series?.at(-2);
  return { ...ok(value), previous: fin(previous) ? previous : null };
}
