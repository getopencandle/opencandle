import type { BarDataset } from '../domain/types';
import { exportNoticeFor, isLiveDatasetId, isLiveProviderId } from '../domain/live-provider';
import { exportRightsRefusal } from '../domain/provider-capabilities';
import { MONTHS, monthEnds, type SeasonalResult } from './seasonals';

/**
 * View options over seasonals(): which years count, how values are shown, a min to max band, the hover readout
 * and a CSV of exactly what is shown.
 * - Normalize 'percent': cumulative % from the base close. 'index': the same path as an index where the base close is 100.
 * - Range: per month, the lowest and highest value across the shown years (needs two years with a value).
 * - Legend visibility only hides lines; the average, median and range still use every selected year.
 */
export type SeasonalNormalize = 'percent' | 'index';
export interface SeasonalOptions { start: number | null; end: number | null; excluded: readonly number[]; normalize: SeasonalNormalize; range: boolean; hidden: readonly string[] }
export const defaultSeasonalOptions = (): SeasonalOptions => ({ start: null, end: null, excluded: [], normalize: 'percent', range: false, hidden: [] });

/** Calendar years (UTC) with at least one loaded month end. */
export function seasonalYears(set: BarDataset): number[] {
  return [...new Set([...monthEnds(set).keys()].map(k => Math.floor(k / 12)))].sort((a, b) => a - b);
}
/** The year filter from the options; start after end is swapped rather than rejected. */
export function yearFilter(o: Pick<SeasonalOptions, 'start' | 'end' | 'excluded'>): (year: number) => boolean {
  let lo = o.start ?? -Infinity, hi = o.end ?? Infinity; if (lo > hi) [lo, hi] = [hi, lo];
  const out = new Set(o.excluded);
  return year => year >= lo && year <= hi && !out.has(year);
}
export const normalizeValue = (v: number | null, mode: SeasonalNormalize) => v === null ? null : mode === 'index' ? 100 + v : v;
export function seasonalRange(r: SeasonalResult): { low: (number | null)[]; high: (number | null)[] } {
  const low: (number | null)[] = [], high: (number | null)[] = [];
  MONTHS.forEach((_, m) => { const v = r.years.map(y => y.points[m]).filter((x): x is number => x !== null); low.push(v.length >= 2 ? Math.min(...v) : null); high.push(v.length >= 2 ? Math.max(...v) : null); });
  return { low, high };
}
export interface HoverRow { key: string; label: string; value: number | null }
/** The readout for one month: each visible year, then average, median and the range when it is on. */
export function seasonalHover(r: SeasonalResult, month: number, o: SeasonalOptions): { month: string; rows: HoverRow[] } {
  const n = (v: number | null) => normalizeValue(v, o.normalize), hidden = new Set(o.hidden), rows: HoverRow[] = [];
  for (const y of r.years) if (!hidden.has(String(y.year))) rows.push({ key: String(y.year), label: String(y.year), value: n(y.points[month]) });
  if (!hidden.has('average')) rows.push({ key: 'average', label: 'Average', value: n(r.average[month]) });
  if (!hidden.has('median')) rows.push({ key: 'median', label: 'Median', value: n(r.median[month]) });
  if (o.range && !hidden.has('range')) { const g = seasonalRange(r); rows.push({ key: 'low', label: 'Range low', value: n(g.low[month]) }, { key: 'high', label: 'Range high', value: n(g.high[month]) }); }
  return { month: MONTHS[month], rows };
}
const cell = (v: number | null) => v === null || !Number.isFinite(v) ? '' : v.toFixed(4);
const q = (text: string) => /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
/** CSV of the shown table: one row per selected year, then Average, Median and (when on) Range low/high. */
export function seasonalCsv(symbol: string, r: SeasonalResult, o: SeasonalOptions): string {
  const n = (v: number | null) => cell(normalizeValue(v, o.normalize));
  const lines = [['series', ...MONTHS].join(','), ...r.years.map(y => [String(y.year), ...y.points.map(n)].join(',')),
    ['Average', ...r.average.map(n)].join(','), ['Median', ...r.median.map(n)].join(',')];
  if (o.range) { const g = seasonalRange(r); lines.push(['Range low', ...g.low.map(n)].join(','), ['Range high', ...g.high.map(n)].join(',')); }
  const unit = o.normalize === 'index' ? 'index, base close = 100' : 'cumulative percent from the base close';
  return [`# ${q(symbol)} seasonals (${unit}); OpenCandle local calculation from loaded bars`, ...lines].join('\n') + '\n';
}

/** Same rights rule as chart CSV export: live, FRED and display-only licensed data are refused; demo and local data pass. */
export function seasonalExportRefusal(set: BarDataset): string | null {
  const p = set.provenance;
  if (p.fixture) return null;
  if (isLiveDatasetId(p.datasetId) || isLiveProviderId(p.providerId)) return exportNoticeFor(p.datasetId);
  return exportRightsRefusal(p.providerId, p.fixture);
}
