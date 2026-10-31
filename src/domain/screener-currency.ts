import type { BarDataset } from './types';
import type { ScreenerCell } from './screener';
import { hasFredBridge, fredNotice, type FredBridgeAny, type FredSeriesValue } from './fred';

/**
 * The screener Currency menu. Default keeps every value in
 * its instrument currency. Picking a currency converts the eligible money values of each row with FRED daily exchange rates
 * (Federal Reserve H.10 noon buying rates, public data, no key), downloaded on demand one series at a time.
 * Not reference-compared:
 * - Last (the price column) stays in the instrument currency, as the requirement states; price-level and money-amount
 *   columns convert; percentages, ratios, volumes and counts never change.
 * - The rate used is the newest FRED value dated on or before the cell's own as-of date (latest rate when the cell has no date);
 *   a rate older than SCREENER_FX_MAX_AGE_DAYS before that date leaves the cell unavailable.
 * - Cross rates go through USD: value x (USD per source unit) / (USD per target unit).
 * - Filters, sorting and CSV use the converted value, so filter thresholds are read in the selected currency.
 * - A row whose instrument currency is not in the menu is unavailable (never shown unconverted under the selected currency).
 */
export const SCREENER_CURRENCIES = ['USD', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'CHF', 'CNY'] as const;
export type ScreenerCurrency = typeof SCREENER_CURRENCIES[number];
export const isScreenerCurrency = (value: unknown): value is ScreenerCurrency => (SCREENER_CURRENCIES as readonly unknown[]).includes(value);
/** FRED daily series per currency and how it is quoted (US dollars per unit, or units per US dollar). */
export const SCREENER_FX_SERIES: Readonly<Record<Exclude<ScreenerCurrency, 'USD'>, { series: string; quote: 'usd-per-unit' | 'units-per-usd' }>> = Object.freeze({
  EUR: { series: 'DEXUSEU', quote: 'usd-per-unit' },
  GBP: { series: 'DEXUSUK', quote: 'usd-per-unit' },
  AUD: { series: 'DEXUSAL', quote: 'usd-per-unit' },
  JPY: { series: 'DEXJPUS', quote: 'units-per-usd' },
  CAD: { series: 'DEXCAUS', quote: 'units-per-usd' },
  CHF: { series: 'DEXSZUS', quote: 'units-per-usd' },
  CNY: { series: 'DEXCHUS', quote: 'units-per-usd' },
});
export const SCREENER_FX_MAX_AGE_DAYS = 10;
/** Money columns that convert. `last` is deliberately absent. */
export const SCREENER_CONVERTED_METRICS: ReadonlySet<string> = new Set(['open', 'high', 'low', 'change', 'changeFromOpen', 'sma', 'ema', 'atr', 'macd', 'periodHigh', 'periodLow', 'marketCap', 'epsTtm', 'dividendsPerShare']);
/** Loaded FRED rows per series id: ascending [Unix seconds, value]. A missing series means not loaded. */
export type ScreenerFxRates = Readonly<Record<string, readonly (readonly [number, number])[]>>;
export interface ScreenerCurrencyContext { target: ScreenerCurrency; rates: ScreenerFxRates | null; /** Why rates are missing (download off, offline, no desktop app). */ missingReason?: string }

const DAY = 86400;
const isoDate = (time: number) => new Date(time * 1000).toISOString().slice(0, 10);
/** The FRED series a conversion between these currencies needs (none for same-currency or USD-only pairs). */
export function screenerFxSeriesFor(target: ScreenerCurrency, sourceCurrencies: Iterable<string>): string[] {
  const needed = new Set<string>();
  for (const raw of sourceCurrencies) {
    const source = String(raw).trim().toUpperCase();
    if (!isScreenerCurrency(source) || source === target) continue;
    if (source !== 'USD') needed.add(SCREENER_FX_SERIES[source].series);
    if (target !== 'USD') needed.add(SCREENER_FX_SERIES[target].series);
  }
  return [...needed].sort();
}
/** Newest row dated on or before `at` (binary search). */
function rowAtOrBefore(rows: readonly (readonly [number, number])[], at: number): readonly [number, number] | null {
  let lo = 0, hi = rows.length - 1, found = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (rows[mid][0] <= at) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  return found < 0 ? null : rows[found];
}
type UsdRate = { ok: true; usdPerUnit: number; time: number; series: string | null } | { ok: false; reason: string };
function usdPerUnit(currency: ScreenerCurrency, context: ScreenerCurrencyContext, at: number | null): UsdRate {
  if (currency === 'USD') return { ok: true, usdPerUnit: 1, time: at ?? 0, series: null };
  const { series, quote } = SCREENER_FX_SERIES[currency], rows = context.rates?.[series];
  if (!rows) return { ok: false, reason: context.missingReason ?? `The ${currency} exchange rate (FRED ${series}) is not loaded yet.` };
  const row = at === null ? rows.at(-1) ?? null : rowAtOrBefore(rows, at + DAY - 1);
  if (!row || !(row[1] > 0)) return { ok: false, reason: `FRED ${series} has no ${currency} rate on or before ${at === null ? 'today' : isoDate(at)}.` };
  if (at !== null && at - row[0] > SCREENER_FX_MAX_AGE_DAYS * DAY) return { ok: false, reason: `The newest ${currency} rate (FRED ${series}, ${isoDate(row[0])}) is more than ${SCREENER_FX_MAX_AGE_DAYS} days older than this value.` };
  return { ok: true, usdPerUnit: quote === 'usd-per-unit' ? row[1] : 1 / row[1], time: row[0], series };
}
const rateText = (rate: number) => Number(rate.toPrecision(6)).toString();
/** Convert one screener cell. Ineligible metrics and same-currency rows return the cell unchanged. */
export function convertScreenerCell(cell: ScreenerCell, metric: string, dataset: Pick<BarDataset, 'instrument'>, context: ScreenerCurrencyContext | undefined): ScreenerCell {
  if (!context || !SCREENER_CONVERTED_METRICS.has(metric)) return cell;
  const source = dataset.instrument.currency.trim().toUpperCase(), target = context.target;
  if (source === target) return cell;
  const unavailable = (reason: string): ScreenerCell => ({ ...cell, value: null, previous: null, state: 'unavailable', reason });
  if (!isScreenerCurrency(source)) return unavailable(`This instrument is quoted in ${source || 'an undeclared currency'}, which the Currency menu cannot convert to ${target}. Choose Default to see the native value.`);
  if (cell.state !== 'available' || typeof cell.value !== 'number') return cell;
  const from = usdPerUnit(source, context, cell.asOf), to = usdPerUnit(target, context, cell.asOf);
  if (!from.ok) return unavailable(from.reason);
  if (!to.ok) return unavailable(to.reason);
  const factor = from.usdPerUnit / to.usdPerUnit, convert = (value: number | string | null) => typeof value === 'number' && Number.isFinite(value) ? value * factor : value;
  const used = [from, to].filter(rate => rate.series).map(rate => `FRED ${rate.series} ${isoDate(rate.time)}`).join(', ');
  const note = `Converted from ${source} to ${target} at ${rateText(factor)} ${target} per ${source} (${used}).`;
  return { ...cell, value: convert(cell.value), previous: convert(cell.previous), note: cell.note ? `${cell.note} ${note}` : note };
}

/** On-demand download of the needed rate series through the FRED bridge. Already loaded series are not fetched again. */
export interface ScreenerFxLoad { rates: Record<string, Array<[number, number]>>; notices: string[] }
export async function loadScreenerFxRates(bridge: unknown, series: readonly string[], loaded: ScreenerFxRates, enabled = true): Promise<ScreenerFxLoad> {
  const out: ScreenerFxLoad = { rates: {}, notices: [] }, wanted = series.filter(id => !loaded[id]);
  if (!wanted.length) return out;
  if (!enabled) { out.notices.push('FRED downloads are turned off in Data sources, so exchange rates cannot be loaded.'); return out; }
  if (!hasFredBridge(bridge)) { out.notices.push('Currency conversion needs the desktop app to download exchange rates.'); return out; }
  for (const id of wanted) {
    let result: FredBridgeAny<FredSeriesValue> | FredSeriesValue;
    try { result = await bridge.fetchFredSeries({ series: id }); }
    catch (error) { out.notices.push(fredNotice((error as { code?: string })?.code ?? 'FRED_ERROR', id, error instanceof Error ? error.message : '')); continue; }
    if ('ok' in result && !result.ok) { out.notices.push(fredNotice(result.error.code, id, result.error.message)); continue; }
    const value = 'ok' in result ? result.value : result;
    const rows = (Array.isArray(value?.rows) ? value.rows : []).filter((row): row is [number, number] => Array.isArray(row) && Number.isSafeInteger(row[0]) && Number.isFinite(row[1]) && row[1] > 0);
    rows.sort((a, b) => a[0] - b[0]);
    if (!rows.length) { out.notices.push(`FRED has no values for ${id}.`); continue; }
    out.rates[id] = rows;
    if (value.stale) out.notices.push(`Using the saved copy of ${id}: ${value.notice ?? 'FRED could not be reached.'}`);
  }
  return out;
}
export const SCREENER_CURRENCY_POLICY = 'Currency: money columns other than Last are converted with FRED daily exchange rates dated on or before each value; filters and sorting use the converted values. Percentages, ratios and volumes do not change.';
