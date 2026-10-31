import type { Bar } from '../domain/types';
import { parseInterval, type IntervalSpec } from '../domain/intervals';
import { chartBarEnd } from '../domain/indicator-resample';
import { currentScriptRequestResolver, type ScriptRequestBase, type ScriptRequestResolver } from '../ui/script-requests';
import { REPORT_WORKER_LIMITS } from './types';

/**
 * Bar Magnifier data.
 *
 * The lower-timeframe bars come from the same place a script's ctx.request reads: a dataset the app already holds (an
 * exact interval, or one finer source of the same provider aggregated by the interval menu's rule), or, for a live
 * chart's own symbol, the on-demand symbol loader and its existing feed limits. Nothing new is fetched, and nothing
 * is manufactured: bars without matching lower-timeframe data keep the OHLC route, and the report says how many.
 *
 * The lower interval for each chart interval is the
 * first row of MAGNIFIER_INTERVALS whose minimum the chart interval reaches.
 */
export const MAGNIFIER_INTERVALS: readonly (readonly [minimumSeconds: number, interval: string])[] = Object.freeze([
  [604800, '1D'], [86400, '60m'], [14400, '15m'], [3600, '5m'], [120, '1m'],
]);
function nominalSeconds(spec: IntervalSpec): number | null {
  if (spec.kind !== 'time') return null;
  if (spec.seconds !== null) return spec.seconds;
  return spec.unit === 'day' ? 86400 * spec.multiplier : spec.unit === 'week' ? 604800 * spec.multiplier : spec.unit === 'month' ? 2419200 * spec.multiplier : null;
}
/** The lower interval the Bar Magnifier reads for a chart interval, or null when the chart has none finer (1 minute and below). */
export function magnifierInterval(resolution: string | null | undefined): string | null {
  if (!resolution) return null;
  let spec: IntervalSpec; try { spec = parseInterval(resolution); } catch { return null; }
  const seconds = nominalSeconds(spec); if (seconds === null) return null;
  return MAGNIFIER_INTERVALS.find(([minimum]) => seconds >= minimum)?.[1] ?? null;
}
export type MagnifierSource =
  | { readonly state: 'ready'; readonly bars: readonly Bar[]; readonly label: string; readonly interval: string }
  | { readonly state: 'loading'; readonly message: string; readonly interval: string }
  | { readonly state: 'unavailable'; readonly reason: string; readonly interval: string | null };

/** Lower-timeframe bars inside the chart's bars, from the installed request resolver (or the one given, in tests). */
export function resolveMagnifierBars(input: { bars: readonly Bar[]; base: ScriptRequestBase | null | undefined; resolver?: ScriptRequestResolver | null }): MagnifierSource {
  const base = input.base, interval = magnifierInterval(base?.resolution ?? null);
  if (!base || !base.resolution) return { state: 'unavailable', reason: 'The Bar Magnifier needs a chart with a time interval. This chart style or source has none, so fills use the OHLC route.', interval: null };
  if (!interval) return { state: 'unavailable', reason: `No lower interval is defined for ${base.resolution} charts, so fills use the OHLC route.`, interval: null };
  if (!input.bars.length) return { state: 'ready', bars: [], label: interval, interval };
  const resolver = input.resolver === undefined ? currentScriptRequestResolver() : input.resolver;
  if (!resolver) return { state: 'unavailable', reason: 'No loaded data can be read here, so fills use the OHLC route.', interval };
  let series;
  try { series = resolver({ id: 'magnifier', symbol: null, interval }, { datasetId: base.datasetId, resolution: base.resolution }); }
  catch (cause) {
    const message = (cause instanceof Error ? cause.message : String(cause)).slice(0, 300);
    return /\bloading\b/i.test(message) ? { state: 'loading', message, interval } : { state: 'unavailable', reason: `${interval} bars are not available: ${message} Fills use the OHLC route.`, interval };
  }
  const first = input.bars[0].time, chart = parseInterval(base.resolution), end = chartBarEnd(input.bars[input.bars.length - 1].time, chart), bars: Bar[] = [];
  for (const row of series.bars) {
    if (row.time < first || row.time >= end) continue;
    if (bars.length >= REPORT_WORKER_LIMITS.magnifierBars) return { state: 'unavailable', reason: `More than ${REPORT_WORKER_LIMITS.magnifierBars} ${interval} bars cover this chart. Shorten the history; fills use the OHLC route.`, interval };
    // Volume never affects a fill; a missing volume is carried as zero so the row passes the transport checks.
    bars.push({ time: row.time, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number.isFinite(row.volume) && row.volume >= 0 ? row.volume : 0 });
  }
  return { state: 'ready', bars, label: `${series.label}${series.fixture ? ' (synthetic)' : ''}`.slice(0, 200), interval };
}
