import type { Bar } from '../domain/types';
import { isoDate } from './fred-views';

/**
 * Monthly country indicators that FRED republishes from the OECD, one small series per country, loaded on
 * demand. A country whose series FRED does not have stays "not available", never zero. The map is a tile grid placed
 * roughly by geography (no shape files or outside assets).
 * - Period 'latest': each country's own latest month (dates are shown, they can differ). 'YYYY-MM': that exact month only.
 * - Compare: value minus the value 1 or 12 months before the shown month (percentage points).
 * - Color scale 'linear': five equal steps from the lowest to the highest shown value. 'quantile': five rank groups.
 *   With Compare on, colors show the change, centered on zero.
 */
export interface MacroCountry { code: string; name: string; col: number; row: number }
export const MACRO_COUNTRIES: readonly MacroCountry[] = Object.freeze([
  { code: 'CA', name: 'Canada', col: 1, row: 0 }, { code: 'US', name: 'United States', col: 1, row: 1 }, { code: 'MX', name: 'Mexico', col: 1, row: 2 },
  { code: 'NO', name: 'Norway', col: 8, row: 0 }, { code: 'SE', name: 'Sweden', col: 9, row: 0 },
  { code: 'IE', name: 'Ireland', col: 5, row: 1 }, { code: 'GB', name: 'United Kingdom', col: 6, row: 1 }, { code: 'NL', name: 'Netherlands', col: 7, row: 1 }, { code: 'DE', name: 'Germany', col: 8, row: 1 }, { code: 'PL', name: 'Poland', col: 9, row: 1 },
  { code: 'PT', name: 'Portugal', col: 5, row: 2 }, { code: 'ES', name: 'Spain', col: 6, row: 2 }, { code: 'FR', name: 'France', col: 7, row: 2 }, { code: 'IT', name: 'Italy', col: 8, row: 2 },
  { code: 'KR', name: 'South Korea', col: 12, row: 1 }, { code: 'JP', name: 'Japan', col: 13, row: 1 },
  { code: 'AU', name: 'Australia', col: 12, row: 3 }, { code: 'NZ', name: 'New Zealand', col: 13, row: 4 },
]);
export const MAP_COLS = 15, MAP_ROWS = 5;
export interface MacroMetric { key: string; dataset: string; label: string; units: string; series: (code: string) => string }
export const MACRO_DATASETS = [{ key: 'labor', label: 'Labor market' }, { key: 'prices', label: 'Prices' }, { key: 'rates', label: 'Interest rates' }] as const;
export const MACRO_METRICS: readonly MacroMetric[] = Object.freeze([
  { key: 'unemployment', dataset: 'labor', label: 'Unemployment rate', units: '%', series: c => `LRHUTTTT${c}M156S` },
  { key: 'employment', dataset: 'labor', label: 'Employment rate, ages 15 to 64', units: '%', series: c => `LREM64TT${c}M156S` },
  { key: 'inflation', dataset: 'prices', label: 'Consumer price inflation, year over year', units: '%', series: c => `CPALTT01${c}M659N` },
  { key: 'long-rate', dataset: 'rates', label: 'Long-term government bond yield (10Y)', units: '%', series: c => `IRLTLT01${c}M156N` },
  { key: 'short-rate', dataset: 'rates', label: 'Three-month interbank rate', units: '%', series: c => `IR3TIB01${c}M156N` },
]);
export const metricsOf = (dataset: string) => MACRO_METRICS.filter(m => m.dataset === dataset);
export const metricOf = (key: string) => MACRO_METRICS.find(m => m.key === key) ?? MACRO_METRICS[0];
export type MacroCompare = 'none' | '1M' | '12M';
export type MacroScale = 'linear' | 'quantile';

const monthIndex = (time: number) => { const d = new Date(time * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
export const monthLabel = (index: number) => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
export const parseMonth = (text: string): number | null => /^\d{4}-(0[1-9]|1[0-2])$/.test(text) ? Number(text.slice(0, 4)) * 12 + Number(text.slice(5)) - 1 : null;
function byMonth(bars: readonly Bar[]): Map<number, { value: number; time: number }> {
  const m = new Map<number, { value: number; time: number }>(); for (const b of bars) if (Number.isFinite(b.close)) m.set(monthIndex(b.time), { value: b.close, time: b.time }); return m;
}

export interface MacroRow { code: string; name: string; series: string; value: number | null; month: string | null; previous: number | null; change: number | null; reason: string | null }
export function macroRows(series: ReadonlyMap<string, readonly Bar[] | null>, metric: MacroMetric, period: string, compare: MacroCompare): MacroRow[] {
  const want = period === 'latest' ? null : parseMonth(period), back = compare === '1M' ? 1 : compare === '12M' ? 12 : 0;
  return MACRO_COUNTRIES.map(c => {
    const id = metric.series(c.code), bars = series.get(id);
    const row: MacroRow = { code: c.code, name: c.name, series: id, value: null, month: null, previous: null, change: null, reason: null };
    if (bars === undefined) { row.reason = 'Not loaded yet.'; return row; }
    if (bars === null || !bars.length) { row.reason = 'Not available from FRED for this country.'; return row; }
    const months = byMonth(bars), keys = [...months.keys()];
    const at = want ?? Math.max(...keys), hit = months.get(at);
    if (!hit) { row.reason = `No value for ${monthLabel(at)}.`; return row; }
    row.value = hit.value; row.month = monthLabel(at);
    if (back) { const p = months.get(at - back); if (p) { row.previous = p.value; row.change = hit.value - p.value; } else row.reason = `No value for ${monthLabel(at - back)} to compare.`; }
    return row;
  });
}
/** Months that any loaded series has, newest first (for the period picker), capped. */
export function macroMonths(series: ReadonlyMap<string, readonly Bar[] | null>, limit = 120): string[] {
  const all = new Set<number>(); for (const bars of series.values()) for (const b of bars ?? []) all.add(monthIndex(b.time));
  return [...all].sort((a, b) => b - a).slice(0, limit).map(monthLabel);
}
export interface ColorScale { bins: { from: number; to: number; color: string }[]; colorOf: (v: number | null) => string; diverging: boolean }
const NONE = 'var(--lv-bg-pill)';
const seq = (i: number) => `color-mix(in srgb, var(--lv-accent) ${20 + i * 18}%, var(--lv-bg-surface))`;
const div = (i: number) => i === 2 ? 'var(--lv-bg-pill)' : `color-mix(in srgb, ${i < 2 ? 'var(--lv-negative-text)' : 'var(--lv-positive-text)'} ${i === 0 || i === 4 ? 80 : 45}%, var(--lv-bg-surface))`;
/** Five bins over the shown values. Diverging (Compare on) is symmetric around zero. */
export function colorScale(values: readonly (number | null)[], mode: MacroScale, diverging: boolean): ColorScale {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b), color = diverging ? div : seq;
  if (!v.length) return { bins: [], colorOf: () => NONE, diverging };
  let edges: number[];
  if (diverging) { const m = Math.max(...v.map(Math.abs)) || 1; edges = mode === 'linear' ? [-m, -0.6 * m, -0.2 * m, 0.2 * m, 0.6 * m, m] : [-m, ...[0.2, 0.4, 0.6, 0.8].map(q => v[Math.min(v.length - 1, Math.floor(q * v.length))]), m]; }
  else if (mode === 'linear') { const lo = v[0], hi = v[v.length - 1], s = (hi - lo) / 5 || 1; edges = [0, 1, 2, 3, 4, 5].map(i => lo + i * s); }
  else edges = [v[0], ...[0.2, 0.4, 0.6, 0.8].map(q => v[Math.min(v.length - 1, Math.floor(q * v.length))]), v[v.length - 1]];
  const bins = [0, 1, 2, 3, 4].map(i => ({ from: edges[i], to: edges[i + 1], color: color(i) }));
  const colorOf = (x: number | null) => { if (x === null || !Number.isFinite(x)) return NONE; let i = bins.findIndex(b => x < b.to); if (i < 0) i = 4; return bins[i].color; };
  return { bins, colorOf, diverging };
}
const f2 = (v: number | null) => v === null ? 'n/a' : v.toFixed(2);
/** The hover and focus readout for one country. */
export function macroHoverText(row: MacroRow, metric: MacroMetric, compare: MacroCompare): string {
  if (row.value === null) return `${row.name}: ${row.reason ?? 'not available'}`;
  const base = `${row.name}: ${metric.label} ${f2(row.value)}${metric.units} (${row.month})`;
  if (compare === 'none') return base;
  return row.change === null ? `${base}. ${row.reason ?? ''}`.trim() : `${base}, ${row.change >= 0 ? '+' : ''}${f2(row.change)} pp vs ${compare === '1M' ? '1 month' : '12 months'} earlier`;
}
export function macroSourceLine(series: ReadonlyMap<string, readonly Bar[] | null>, metric: MacroMetric): string {
  const loaded = MACRO_COUNTRIES.filter(c => series.get(metric.series(c.code))?.length), last = loaded.map(c => { const b = series.get(metric.series(c.code))!; return b[b.length - 1].time; });
  return `FRED (St. Louis Fed), from OECD Main Economic Indicators. Series ${metric.series('XX').replace('XX', '<country>')}. ${loaded.length} of ${MACRO_COUNTRIES.length} countries loaded${last.length ? `, newest value ${isoDate(Math.max(...last))}` : ''}.`;
}
