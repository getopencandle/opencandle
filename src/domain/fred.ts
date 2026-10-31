import type { Bar, BarDataset, Instrument, ProviderCapabilities } from './types';

/**
 * Economic data series from FRED (St. Louis Fed) as chartable 1D symbols, FRED:<series id>. The network and the
 * 5 MB disk cache live in electron/public-fred.cjs; this module holds the symbol list, the bar mapping and the notices.
 * A FRED value is one number per date, so each row becomes a bar with open = high = low = close = value and volume 0.
 * Weekly and monthly series keep their native dates (the chart shows them at 1D). Fetched on demand, one series at a time.
 */
export const FRED_PROVIDER_ID = 'fred-public';
export const FRED_PROVIDER_NAME = 'FRED economic data (St. Louis Fed)';
export const FRED_EXCHANGE = 'FRED';
export const FRED_RESOLUTION = '1D';
export const FRED_LICENSE = 'FRED public data; display only here. Some series carry their own source terms (see fred.stlouisfed.org). Do not export or share.';
export const FRED_CACHE_MAX_BYTES = 5 * 1024 * 1024;
export const FRED_SERIES_ID = /^[A-Z0-9_]{1,25}$/;

/** Popular series: ids are public identifiers; the descriptions are OpenCandle's own words. */
export interface FredSeriesInfo { id: string; description: string; units: string; frequency: string }
export const FRED_POPULAR: readonly FredSeriesInfo[] = Object.freeze([
  { id: 'DGS10', description: 'Ten-year Treasury yield, daily', units: 'percent', frequency: 'daily' },
  { id: 'DGS2', description: 'Two-year Treasury yield, daily', units: 'percent', frequency: 'daily' },
  { id: 'DGS5', description: 'Five-year Treasury yield, daily', units: 'percent', frequency: 'daily' },
  { id: 'DGS30', description: 'Thirty-year Treasury yield, daily', units: 'percent', frequency: 'daily' },
  { id: 'DGS3MO', description: 'Three-month Treasury yield, daily', units: 'percent', frequency: 'daily' },
  { id: 'T10Y2Y', description: 'Ten-year minus two-year Treasury yield gap', units: 'percentage points', frequency: 'daily' },
  { id: 'T10Y3M', description: 'Ten-year minus three-month Treasury yield gap', units: 'percentage points', frequency: 'daily' },
  { id: 'FEDFUNDS', description: 'Effective federal funds rate, monthly average', units: 'percent', frequency: 'monthly' },
  { id: 'CPIAUCSL', description: 'Consumer prices for urban households, seasonally adjusted', units: 'index', frequency: 'monthly' },
  { id: 'UNRATE', description: 'US civilian unemployment rate', units: 'percent', frequency: 'monthly' },
  { id: 'PAYEMS', description: 'Total nonfarm payroll jobs', units: 'thousands of people', frequency: 'monthly' },
  { id: 'GDP', description: 'US gross domestic product, quarterly', units: 'billions of dollars', frequency: 'quarterly' },
  { id: 'M2SL', description: 'M2 money supply', units: 'billions of dollars', frequency: 'monthly' },
  { id: 'ICSA', description: 'Initial jobless claims, weekly', units: 'number of claims', frequency: 'weekly' },
  { id: 'VIXCLS', description: 'Cboe volatility index close, daily', units: 'index', frequency: 'daily' },
  { id: 'DEXUSEU', description: 'US dollars per euro, daily', units: 'US dollars', frequency: 'daily' },
  { id: 'MORTGAGE30US', description: 'Average 30-year fixed mortgage rate, weekly', units: 'percent', frequency: 'weekly' },
]);

export interface FredSymbol { series: string }
/** "FRED:DGS10" (any case) or an exact known popular id ("dgs10") to a series; any other text is not a FRED symbol. */
export function parseFredSymbol(text: string): FredSymbol | null {
  const value = String(text ?? '').trim().toUpperCase();
  const prefixed = value.startsWith(FRED_EXCHANGE + ':');
  const id = prefixed ? value.slice(FRED_EXCHANGE.length + 1) : value;
  if (!FRED_SERIES_ID.test(id)) return null;
  if (prefixed || FRED_POPULAR.some(row => row.id === id)) return { series: id };
  return null;
}
export const fredInstrumentId = (series: string) => `${FRED_EXCHANGE}:${series}`;
export const fredDatasetId = (series: string) => `fred:${FRED_PROVIDER_ID}:${series}:${FRED_RESOLUTION}`;
export const fredDescription = (series: string): string => FRED_POPULAR.find(row => row.id === series)?.description ?? 'FRED economic series ' + series;

export function fredInstrument(series: string): Instrument {
  return { id: fredInstrumentId(series), symbol: series, name: fredDescription(series) + ' (FRED)', exchange: FRED_EXCHANGE, currency: 'XXX', assetClass: 'other', tickSize: 0.0001, lotSize: 1, timezone: 'UTC' };
}

/** Type-ahead: after the FRED: prefix (or 2+ letters of a known id or description) lists matches from the built-in list; an exact valid id after the prefix is offered even when unlisted. */
export function fredSearch(query: string, limit = 12): FredSeriesInfo[] {
  const raw = String(query ?? '').trim().toUpperCase();
  const prefixed = raw.startsWith(FRED_EXCHANGE + ':');
  const needle = prefixed ? raw.slice(FRED_EXCHANGE.length + 1) : raw;
  if (!prefixed && needle.length < 2) return [];
  const listed = FRED_POPULAR.filter(row => !needle || row.id.includes(needle) || row.description.toUpperCase().includes(needle));
  const extra = prefixed && FRED_SERIES_ID.test(needle) && !FRED_POPULAR.some(row => row.id === needle);
  const rows = extra ? [{ id: needle, description: 'FRED economic series ' + needle + ' (checked when opened)', units: 'units', frequency: 'unknown' }, ...listed] : listed;
  return rows.slice(0, limit);
}
/** Search-list datasets (empty bars; nothing is downloaded until the user opens one), mirroring coinbaseSearchDatasets. */
export function fredSearchDatasets(query: string, enabled = true): BarDataset[] {
  if (!enabled) return [];
  return fredSearch(query).map(row => fredDataset(row.id, [], { state: 'disconnected', coverage: 'Not downloaded until opened', asOf: 0 }));
}

export function fredBars(rows: readonly (readonly [number, number])[]): Bar[] {
  const bars: Bar[] = [];
  for (const [time, value] of rows) if (Number.isFinite(value) && Number.isSafeInteger(time) && (!bars.length || time > bars[bars.length - 1].time)) bars.push({ time, open: value, high: value, low: value, close: value, volume: 0 });
  return bars;
}
export function fredDataset(series: string, bars: Bar[], opts: { state?: 'ready' | 'stale' | 'disconnected' | 'loading'; coverage?: string; asOf?: number; notes?: string[] } = {}): BarDataset {
  const info = FRED_POPULAR.find(row => row.id === series), last = bars.length ? bars[bars.length - 1].time : 0;
  return { instrument: fredInstrument(series), bars, resolution: FRED_RESOLUTION, provenance: {
    providerId: FRED_PROVIDER_ID, providerName: FRED_PROVIDER_NAME, datasetId: fredDatasetId(series), fixture: false,
    coverage: opts.coverage ?? `FRED ${series}${info ? ', ' + info.frequency : ''}; one value per date at its native date`, asOf: opts.asOf ?? last,
    delaySeconds: null, adjustment: 'raw', session: 'all', timezone: 'UTC', state: opts.state ?? 'ready', license: FRED_LICENSE, revision: `fred-v1:${last}:${bars.length}`,
    notes: [...(opts.notes ?? []), 'Each date is one value drawn as open = high = low = close with volume 0. Missing values are skipped.'] } };
}

export type FredBridgeAny<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };
export interface FredSeriesValue { schemaVersion: 1; series: string; rows: Array<[number, number]>; fetchedAt: number; cached: boolean; stale: boolean; notice?: string }
export interface fredDataStatus { schemaVersion: 1; bytes: number; entries: number; maxBytes: number }
/** Trusted IPC calls (electron/preload.cjs). Main throws a coded error on failure; a wrapped result is accepted too. */
export interface FredBridge {
  fetchFredSeries?(input: { series: string }): Promise<FredBridgeAny<FredSeriesValue> | FredSeriesValue>;
  fredDataStatus?(): Promise<FredBridgeAny<fredDataStatus> | fredDataStatus>;
  clearFredData?(): Promise<FredBridgeAny<fredDataStatus> | fredDataStatus>;
}
export const hasFredBridge = (bridge: unknown): bridge is Required<Pick<FredBridge, 'fetchFredSeries'>> & FredBridge => !!bridge && typeof (bridge as FredBridge).fetchFredSeries === 'function';

/** Plain notice for a failed load (shown as a toast or notice by the caller). */
export function fredNotice(code: string, series: string, message = ''): string {
  switch (code) {
    case 'FRED_NOT_FOUND': return `FRED has no series named ${series}. Check the id on fred.stlouisfed.org.`;
    case 'FRED_OFFLINE': return `FRED could not be reached and ${series} is not saved on this computer. Check your connection and try again.`;
    case 'INVALID_ARGUMENT': return `${series} is not a valid FRED series id.`;
    case 'RATE_LIMITED': return 'FRED asked for fewer requests. Try again in a while.';
    default: return message || `FRED series ${series} could not be loaded.`;
  }
}
export type FredLoad = { ok: true; dataset: BarDataset; notice: string | null } | { ok: false; code: string; notice: string };
/** Open one series on demand (main chart or Compare). No request is made when `enabled` is false (the caller's offline or remote-request setting). */
export async function loadFredDataset(bridge: unknown, symbol: string, enabled = true): Promise<FredLoad> {
  const parsed = parseFredSymbol(symbol);
  if (!parsed) return { ok: false, code: 'INVALID_ARGUMENT', notice: fredNotice('INVALID_ARGUMENT', String(symbol)) };
  if (!enabled) return { ok: false, code: 'DISABLED', notice: 'Remote data requests are turned off, so FRED series cannot be opened.' };
  if (!hasFredBridge(bridge)) return { ok: false, code: 'NO_BRIDGE', notice: 'FRED series need the desktop app.' };
  let result: FredBridgeAny<FredSeriesValue> | FredSeriesValue;
  try { result = await bridge.fetchFredSeries({ series: parsed.series }); }
  catch (error) { const code = (error as { code?: string })?.code ?? 'FRED_ERROR'; return { ok: false, code, notice: fredNotice(code, parsed.series, error instanceof Error ? error.message : '') }; }
  let value: FredSeriesValue;
  if ('ok' in result) {
    if (!result.ok) return { ok: false, code: result.error.code, notice: fredNotice(result.error.code, parsed.series, result.error.message) };
    value = result.value;
  } else value = result;
  const bars = fredBars(value.rows);
  if (!bars.length) return { ok: false, code: 'FRED_NO_DATA', notice: `FRED has no values for ${parsed.series}.` };
  const notice = value.stale ? `Showing the saved copy of ${parsed.series}: ${value.notice ?? 'FRED could not be reached.'}` : null;
  return { ok: true, dataset: fredDataset(parsed.series, bars, { state: value.stale ? 'stale' : 'ready', notes: value.cached ? ['Saved on this computer; refreshed at most once a day.'] : [] }), notice };
}

export const FRED_CAPABILITIES: ProviderCapabilities = {
  id: FRED_PROVIDER_ID, assets: ['other'], universe: 'FRED economic series typed as FRED:<series id>; a short built-in list of popular ones (Treasury yields, consumer prices, unemployment, fed funds); any valid id works',
  fields: ['ohlcv'], resolutions: [FRED_RESOLUTION], streaming: false, delaySeconds: null, sessions: ['all'], adjustmentBases: ['raw'],
  earliestHistory: { [FRED_RESOLUTION]: null }, requiresKey: false, redistributable: false,
  limits: ['1D only; no intraday, no live updates', 'One value per date drawn as flat bars with volume 0; weekly, monthly and quarterly series keep their native dates', 'Downloaded one series at a time when opened, refreshed at most once a day', 'Local cache capped at 5 MB, least recently used removed first'],
  verifiedLive: false,
};
