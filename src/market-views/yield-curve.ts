import type { Bar } from '../domain/types';
import { isoDate, valueAt } from './fred-views';

/**
 * The US Treasury constant
 * maturity curve from FRED daily series (DGS1MO ... DGS30). A point is the last value on or before the chosen date, at most
 * YIELD_MAX_AGE_DAYS older (weekends and holidays have no value). No other country has a free multi-maturity curve in the
 * sources OpenCandle uses, so other countries are listed as not available from local sources.
 */
export interface Maturity { key: string; label: string; series: string; years: number }
export const MATURITIES: readonly Maturity[] = Object.freeze([
  { key: '1M', label: '1M', series: 'DGS1MO', years: 1 / 12 }, { key: '3M', label: '3M', series: 'DGS3MO', years: 0.25 },
  { key: '6M', label: '6M', series: 'DGS6MO', years: 0.5 }, { key: '1Y', label: '1Y', series: 'DGS1', years: 1 },
  { key: '2Y', label: '2Y', series: 'DGS2', years: 2 }, { key: '3Y', label: '3Y', series: 'DGS3', years: 3 },
  { key: '5Y', label: '5Y', series: 'DGS5', years: 5 }, { key: '7Y', label: '7Y', series: 'DGS7', years: 7 },
  { key: '10Y', label: '10Y', series: 'DGS10', years: 10 }, { key: '20Y', label: '20Y', series: 'DGS20', years: 20 },
  { key: '30Y', label: '30Y', series: 'DGS30', years: 30 },
]);
/** A lean default: five series, so the first load stays small. */
export const DEFAULT_MATURITIES = ['3M', '2Y', '5Y', '10Y', '30Y'] as const;
export const YIELD_MAX_AGE_DAYS = 7;
export const YIELD_COUNTRIES = [{ code: 'US', label: 'United States (Treasury, FRED daily)', available: true },
  { code: 'DE', label: 'Germany', available: false }, { code: 'GB', label: 'United Kingdom', available: false }, { code: 'JP', label: 'Japan', available: false }] as const;
export const YIELD_COUNTRY_UNAVAILABLE = 'Not available from local sources: only the US Treasury curve is published free on FRED with several maturities.';
export interface Spread { key: string; long: string; short: string }
export const SPREADS: readonly Spread[] = Object.freeze([{ key: '10Y-2Y', long: '10Y', short: '2Y' }, { key: '10Y-3M', long: '10Y', short: '3M' }, { key: '30Y-5Y', long: '30Y', short: '5Y' }, { key: '2Y-3M', long: '2Y', short: '3M' }]);
export const maturityOf = (key: string) => MATURITIES.find(m => m.key === key) ?? null;
export const pickMaturities = (keys: readonly string[]) => MATURITIES.filter(m => keys.includes(m.key));

export interface CurvePoint { key: string; label: string; value: number | null; date: string | null }
export interface Curve { date: string; points: CurvePoint[]; missing: string[] }
export function curveAt(series: ReadonlyMap<string, readonly Bar[]>, keys: readonly string[], time: number): Curve {
  const points = pickMaturities(keys).map(m => { const bars = series.get(m.series); const hit = bars ? valueAt(bars, time, YIELD_MAX_AGE_DAYS) : null;
    return { key: m.key, label: m.label, value: hit ? hit.value : null, date: hit ? isoDate(hit.time) : null }; });
  return { date: isoDate(time), points, missing: points.filter(p => p.value === null).map(p => p.label) };
}
/** Latest date any loaded selected series has. */
export function latestCurveTime(series: ReadonlyMap<string, readonly Bar[]>, keys: readonly string[]): number | null {
  let best: number | null = null;
  for (const m of pickMaturities(keys)) { const b = series.get(m.series); if (b?.length) best = Math.max(best ?? -Infinity, b[b.length - 1].time); }
  return best;
}
/** Spread in percentage points; null with a reason when a leg is not selected or has no value. */
export function spreadOf(curve: Curve, spread: Spread): { value: number | null; reason: string | null } {
  const leg = (k: string) => curve.points.find(p => p.key === k);
  const a = leg(spread.long), b = leg(spread.short);
  if (!a || !b) return { value: null, reason: `Select both ${spread.long} and ${spread.short} to see this spread.` };
  if (a.value === null || b.value === null) return { value: null, reason: `No ${a.value === null ? spread.long : spread.short} value near ${curve.date}.` };
  return { value: a.value - b.value, reason: null };
}
/** Preset comparison: the same calendar day k months earlier (UTC), clamped to the month end. */
export function monthsBefore(time: number, months: number): number {
  const d = new Date(time * 1000), t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d.getUTCDate(), last)); return t.getTime() / 1000;
}
