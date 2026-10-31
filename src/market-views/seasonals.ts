import type { BarDataset } from '../domain/types';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
/** points: cumulative percent at each month end, null where there is no base or no data. */
export interface SeasonalYear { year: number; points: (number | null)[] }
export interface SeasonalResult { years: SeasonalYear[]; average: (number | null)[]; median: (number | null)[]; monthlyAverage: (number | null)[]; note: string }

/** Month-end closes keyed by year*12+month (UTC). */
export function monthEnds(set: BarDataset): Map<number, number> {
  const out = new Map<number, number>();
  for (const bar of set.bars) { if (!Number.isFinite(bar.close) || !Number.isFinite(bar.time)) continue; const d = new Date(bar.time * 1000); out.set(d.getUTCFullYear() * 12 + d.getUTCMonth(), bar.close); }
  return out;
}
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/**
 * Per year: cumulative percent change of the month-end close against the previous December close
 * (for the first loaded year, against its first month-end close, which leaves that month and earlier empty).
 * Average and median run across the years that have a value for that month. Needs two calendar years of data.
 */
/** `include`: years outside it are left out of the lines and the statistics; bases still use every loaded month end. */
export function seasonals(set: BarDataset, include?: (year: number) => boolean): SeasonalResult {
  const ends = monthEnds(set), keys = [...ends.keys()].sort((a, b) => a - b);
  const empty = (note: string): SeasonalResult => ({ years: [], average: Array(12).fill(null), median: Array(12).fill(null), monthlyAverage: Array(12).fill(null), note });
  if (!keys.length) return empty('No bars are loaded for this symbol.');
  const yearList = [...new Set(keys.map(k => Math.floor(k / 12)))];
  if (yearList.length < 2) return empty('Seasonals need bars from at least two calendar years.');
  const chosen = include ? yearList.filter(include) : yearList;
  if (!chosen.length) return empty('No loaded year is inside the selected years.');
  const years: SeasonalYear[] = chosen.map(year => {
    const decPrev = ends.get(year * 12 - 1);
    const firstKey = keys.find(k => Math.floor(k / 12) === year)!;
    const base = decPrev ?? ends.get(firstKey)!;
    const points = MONTHS.map((_, m) => {
      const v = ends.get(year * 12 + m); if (v === undefined) return null;
      if (decPrev === undefined && year * 12 + m <= firstKey) return null;
      return base > 0 ? (v / base - 1) * 100 : null;
    });
    return { year, points };
  });
  const stat = (f: (v: number[]) => number) => MONTHS.map((_, m) => { const v = years.map(y => y.points[m]).filter((x): x is number => x !== null); return v.length ? f(v) : null; });
  const monthlyAverage = MONTHS.map((_, m) => {
    const v: number[] = [];
    for (const y of chosen) { const a = ends.get(y * 12 + m), p = ends.get(y * 12 + m - 1); if (a !== undefined && p !== undefined && p > 0) v.push((a / p - 1) * 100); }
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  });
  return { years, average: stat(v => v.reduce((s, x) => s + x, 0) / v.length), median: stat(median), monthlyAverage, note: '' };
}
