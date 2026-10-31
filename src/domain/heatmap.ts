import type { BarDataset, DataProvenance, Instrument } from './types';
import { parseInterval } from './intervals';
import { HEATMAP_BETA_BENCHMARK, dailyBeta, extendedHoursChange, extendedHoursReason } from '../market-views/heatmap-extended';

/** N-bar metrics ('volume', 'turnover') use the loaded-bar count; '-1d/-1w/-1m' use UTC calendar periods over loaded bars. */
export type HeatmapSize = 'volume' | 'turnover' | 'volume-1d' | 'volume-1w' | 'volume-1m' | 'turnover-1d' | 'turnover-1w' | 'turnover-1m' | 'market-cap' | 'aum';
export type HeatmapColor = 'change' | 'change-1h' | 'change-4h' | 'change-1d' | 'perf-1w' | 'perf-1m' | 'perf-3m' | 'perf-6m' | 'perf-ytd' | 'perf-1y' | 'gap' | 'gap-1d' | 'relative-volume' | 'range-percent' | 'volatility-1d'
  /** Extended-hours change and beta from loaded bars; NAV total return and top holding weight from supplied metadata. */
  | 'extended-pre' | 'extended-post' | 'beta-1y' | 'fund-nav-return' | 'fund-top-weight';
export type HeatmapGrouping = 'none' | 'exchange' | 'instrument-type' | 'sector' | 'fund-asset-class';
export interface HeatmapSettings {
  asset: 'all' | 'stock' | 'etf'; size: HeatmapSize; color: HeatmapColor; bars: number;
  monoSize: boolean; grouping: HeatmapGrouping; zoomGroup: string | null; search: string;
  currency: string | null; resolution: string | null; hiddenBins: number[];
  title: 'symbol' | 'description' | 'none'; value: 'color' | 'size' | 'price' | 'none';
  palette: 'classic' | 'color-blind' | 'monochrome'; knowledgeCutoff: number | null;
  datasetSelections: Record<string, string>;
}
export interface HeatmapMetadata {
  instrumentId: string; marketCap: number | null; aum: number | null; currency: string;
  sector: string | null; fundAssetClass: string | null; asOf: number; availableAt: number; source: string;
  /** Optional supplied fund data: NAV total return in percent (period as the source states) and largest holding weight in percent. */
  navTotalReturn?: number | null; topWeight?: number | null;
}
export interface HeatmapState { schemaVersion: 1; settings: HeatmapSettings; metadata: HeatmapMetadata[]; }
export interface HeatmapItem {
  id: string; symbol: string; name: string; exchange: string; assetClass: Instrument['assetClass']; currency: string; priceCurrency: string; resolution: string; group: string;
  price: number | null; sizeValue: number | null; colorValue: number | null; weight: number;
  sizeReason: string | null; colorReason: string | null; bin: number | null; color: string;
  priceTime: number | null; metadataAsOf: number | null; metadataSource: string | null; provenance: DataProvenance;
  /** Event time of the bar whose close/open is the color comparison base, when the metric has one. */
  colorBaseTime: number | null;
  /** First and last bar event times and bar count summed by the size metric, when it sums bars. */
  sizeWindow: { first: number; last: number; bars: number } | null;
}
export interface HeatmapBin { index: number; lower: number; upper: number; color: string; count: number; hidden: boolean; }
export interface HeatmapFilterCounts { unsupportedClass: number; asset: number; resolution: number; search: number; currency: number; }
export interface HeatmapUniverse { stock: number; etf: number; other: number; synthetic: number; nonSynthetic: number; }
export interface HeatmapResult {
  items: HeatmapItem[]; unavailable: HeatmapItem[]; zeroWeight: HeatmapItem[]; hiddenItems: HeatmapItem[]; bins: HeatmapBin[];
  coverage: { datasets: number; supplied: number; eligible: number; shown: number; excluded: number; hidden: number; unknownColor: number; unknownSize: number; synthetic: number };
  /** Dataset counts removed by each filter, in evaluation order (a dataset counts once, at its first failing filter). */
  filtered: HeatmapFilterCounts;
  /** Distinct supplied instruments by class and synthetic flag, before any filter. */
  universe: HeatmapUniverse;
  groups: string[]; diagnostics: string[]; policies: string[];
}
export interface HeatmapRect { id: string; x: number; y: number; width: number; height: number; }
export interface HeatmapGroupLayout { group: string; bounds: HeatmapRect; tiles: HeatmapRect[]; }
export interface HeatmapLayout { width: number; height: number; groups: HeatmapGroupLayout[]; undrawn: string[]; }
export interface HeatmapOption<V extends string = string> { value: V; label: string; category: string; available: boolean; reason: string | null; }

export const HEATMAP_UNKNOWN_COLOR = '#2b303b';
export const HEATMAP_GROUP_HEADER = 20;
export const HEATMAP_GROUP_PADDING = 2;
/** Tiles below this area (px²) cannot be seen or clicked; they are listed as undrawn and reachable from that list. */
export const HEATMAP_MIN_TILE_AREA = 1;
const DAY = 86400;

export const HEATMAP_POLICIES = [
  'The universe is the supplied local data, not every listed US security. Synthetic labels do not represent actual prices.',
  'N-bar windows count loaded bars, not calendar days. Volume sums these bars. Turnover proxy sums close times volume; it is not observed trade-by-trade turnover.',
  'Change compares the latest close with the close N loaded bars earlier. Gap compares latest open with previous close. Range is (high-low)/low; relative volume uses the preceding N volumes.',
  'Calendar-period metrics (1h, 4h, 1D, 1W, 1M, 3M, 6M, YTD, 1Y) use UTC clock and calendar boundaries over loaded bars, matching the OpenCandle interval policy. Exchange sessions, holidays and time zones are not modeled. A period whose base lies before the first loaded bar is unavailable, never shortened. Weekly and monthly bars are matched by UTC calendar week/month index and must sit in exactly the expected week/month; weekly bars cannot give year to date. On finer bars the base bar may be at most one bar (1h, 4h) or one bar plus 4 days (1D and longer) older than the period start; an older base means a data gap and the value is unavailable. A sum is complete when a fresh base exists or the loaded bars start within one bar of the period start.',
  'Change 1D, Gap 1D, Volatility 1D and the 1D sizes use the latest loaded UTC date, which may be a partial day. 1W is 7 calendar days; months use UTC calendar-month arithmetic with the day clamped to the month end; YTD uses the last loaded close before 1 January UTC.',
  'No market cap, AUM, sector or ETF asset class is inferred from a ticker. Monetary sizes require one currency; no FX conversion is performed.',
  'Volume compares raw shares or ETF units. Equal unit counts do not imply equal economic exposure. Asset filters and grouping remain explicit.',
  'The cutoff filters price/volume by bar event/open time only, using final loaded OHLC and any later corrections. Availability of those prices at that moment is unverified. Metadata separately requires eligible as-of and available-at times. This display is not a point-in-time backtest input.',
  'Mono-size preserves metric sorting while giving equal areas. Unknown color uses a distinct hatched fill, never a palette color. Unknown or zero size is listed separately in proportional mode.',
  'Seven symmetric color bins use the largest absolute value before legend hiding. Relative-volume, range and volatility bins run from zero to the largest value. Exact reference thresholds and colors remain unverified.',
  'Pre-market and post-market change use loaded intraday bars that include extended hours for US instruments quoted in New York time, classified by the OpenCandle session calendar (pre 04:00-09:30, post 16:00-20:00). Beta is OpenCandle-defined: up to 252 daily returns against loaded SPY daily bars on the same dates, at least 60. NAV total return and top holding weight come only from supplied dated metadata. Logos have no accepted source and stay unavailable.',
];

type SizeSpec = { label: string; category: string; period: Period | null; monetary: boolean; turnover: boolean; usesBars: boolean };
type ColorSpec = { label: string; category: string; period: Period | null; positiveOnly: boolean; unit: '%' | '×' | ''; usesBars: boolean };
type Period = '1h' | '4h' | '1d' | '1w' | '1m' | '3m' | '6m' | 'ytd' | '1y';
/** Largest bar duration (seconds, months counted as 31 days) able to resolve each period. */
const PERIOD_MAX_BAR: Record<Period, number> = { '1h': 3600, '4h': 14400, '1d': DAY, '1w': 7 * DAY, '1m': 31 * DAY, '3m': 93 * DAY, '6m': 186 * DAY, ytd: 31 * DAY, '1y': 372 * DAY };
const PERIOD_LABEL: Record<Period, string> = { '1h': '1 hour', '4h': '4 hours', '1d': '1 day', '1w': '1 week', '1m': '1 month', '3m': '3 months', '6m': '6 months', ytd: 'year to date', '1y': '1 year' };

export const HEATMAP_SIZE_SPECS: Record<HeatmapSize, SizeSpec> = {
  'market-cap': { label: 'Market cap', category: 'Fundamental', period: null, monetary: true, turnover: false, usesBars: false },
  aum: { label: 'Assets under management', category: 'Fundamental', period: null, monetary: true, turnover: false, usesBars: false },
  'volume-1d': { label: 'Volume 1D', category: 'Volume', period: '1d', monetary: false, turnover: false, usesBars: false },
  'volume-1w': { label: 'Volume 1W', category: 'Volume', period: '1w', monetary: false, turnover: false, usesBars: false },
  'volume-1m': { label: 'Volume 1M', category: 'Volume', period: '1m', monetary: false, turnover: false, usesBars: false },
  volume: { label: 'Volume, last N loaded bars', category: 'Volume', period: null, monetary: false, turnover: false, usesBars: true },
  'turnover-1d': { label: 'Price × volume proxy 1D', category: 'Turnover proxy', period: '1d', monetary: true, turnover: true, usesBars: false },
  'turnover-1w': { label: 'Price × volume proxy 1W', category: 'Turnover proxy', period: '1w', monetary: true, turnover: true, usesBars: false },
  'turnover-1m': { label: 'Price × volume proxy 1M', category: 'Turnover proxy', period: '1m', monetary: true, turnover: true, usesBars: false },
  turnover: { label: 'Price × volume proxy, last N loaded bars', category: 'Turnover proxy', period: null, monetary: true, turnover: true, usesBars: true },
};
export const HEATMAP_COLOR_SPECS: Record<HeatmapColor, ColorSpec> = {
  'change-1h': { label: 'Change 1h, %', category: 'Price change', period: '1h', positiveOnly: false, unit: '%', usesBars: false },
  'change-4h': { label: 'Change 4h, %', category: 'Price change', period: '4h', positiveOnly: false, unit: '%', usesBars: false },
  'change-1d': { label: 'Change 1D, %', category: 'Price change', period: '1d', positiveOnly: false, unit: '%', usesBars: false },
  change: { label: 'Change over last N loaded bars, %', category: 'Price change', period: null, positiveOnly: false, unit: '%', usesBars: true },
  'perf-1w': { label: 'Performance 1W, %', category: 'Performance', period: '1w', positiveOnly: false, unit: '%', usesBars: false },
  'perf-1m': { label: 'Performance 1M, %', category: 'Performance', period: '1m', positiveOnly: false, unit: '%', usesBars: false },
  'perf-3m': { label: 'Performance 3M, %', category: 'Performance', period: '3m', positiveOnly: false, unit: '%', usesBars: false },
  'perf-6m': { label: 'Performance 6M, %', category: 'Performance', period: '6m', positiveOnly: false, unit: '%', usesBars: false },
  'perf-ytd': { label: 'Performance YTD, %', category: 'Performance', period: 'ytd', positiveOnly: false, unit: '%', usesBars: false },
  'perf-1y': { label: 'Performance 1Y, %', category: 'Performance', period: '1y', positiveOnly: false, unit: '%', usesBars: false },
  'relative-volume': { label: 'Relative volume (latest bar / preceding N mean)', category: 'Activity and volatility', period: null, positiveOnly: true, unit: '×', usesBars: true },
  'volatility-1d': { label: 'Volatility 1D proxy, % (latest UTC date range / low)', category: 'Activity and volatility', period: '1d', positiveOnly: true, unit: '%', usesBars: false },
  'range-percent': { label: 'Latest bar range, % ((high − low) / low)', category: 'Activity and volatility', period: null, positiveOnly: true, unit: '%', usesBars: false },
  'gap-1d': { label: 'Gap 1D, % (first open of latest UTC date vs prior close)', category: 'Activity and volatility', period: '1d', positiveOnly: false, unit: '%', usesBars: false },
  gap: { label: 'Gap vs previous loaded bar, %', category: 'Activity and volatility', period: null, positiveOnly: false, unit: '%', usesBars: false },
  'extended-pre': { label: 'Pre-market change, %', category: 'Extended hours', period: null, positiveOnly: false, unit: '%', usesBars: false },
  'extended-post': { label: 'Post-market change, %', category: 'Extended hours', period: null, positiveOnly: false, unit: '%', usesBars: false },
  'beta-1y': { label: 'Beta 1Y vs SPY (daily)', category: 'Risk', period: null, positiveOnly: false, unit: '', usesBars: false },
  'fund-nav-return': { label: 'NAV total return, %', category: 'Fund data', period: null, positiveOnly: false, unit: '%', usesBars: false },
  'fund-top-weight': { label: 'Top holding weight, %', category: 'Fund data', period: null, positiveOnly: true, unit: '%', usesBars: false },
};
/** Documented reference leaves with no accepted LV data source. Now empty; extended-hours change, beta, NAV total return and top holding weight are color metrics in HEATMAP_COLOR_SPECS. Logos stay unavailable (HEATMAP_LOGO_REASON). */
export const HEATMAP_UNSUPPORTED_COLORS: readonly HeatmapOption[] = [
];
export const HEATMAP_LOGO_REASON = 'Logos are unavailable: no licensed logo source is accepted, and OpenCandle does not fabricate symbol artwork.';
const GROUP_LABELS: Record<HeatmapGrouping, string> = { none: 'No grouping', exchange: 'Exchange', 'instrument-type': 'Instrument type', sector: 'Sector', 'fund-asset-class': 'ETF asset class' };

export function createHeatmapState(): HeatmapState {
  return { schemaVersion: 1, settings: { asset: 'all', size: 'volume', color: 'change', bars: 1, monoSize: true, grouping: 'none', zoomGroup: null, search: '', currency: null, resolution: null, hiddenBins: [], title: 'symbol', value: 'color', palette: 'classic', knowledgeCutoff: null, datasetSelections: {} }, metadata: [] };
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown, limit: number, nullable = false): value is string | null => nullable && value === null || typeof value === 'string' && value.length <= limit;
const timestamp = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= -62135596800 && Number(value) <= 253402300799;
export function restoreHeatmapState(input: unknown): HeatmapState {
  if (!object(input) || input.schemaVersion !== 1 || !object(input.settings) || !Array.isArray(input.metadata) || input.metadata.length > 50000) throw new Error('Invalid heatmap state.');
  const s = input.settings;
  for (const [key, choices] of Object.entries({ asset: ['all', 'stock', 'etf'], size: Object.keys(HEATMAP_SIZE_SPECS), color: Object.keys(HEATMAP_COLOR_SPECS), grouping: ['none', 'exchange', 'instrument-type', 'sector', 'fund-asset-class'], title: ['symbol', 'description', 'none'], value: ['color', 'size', 'price', 'none'], palette: ['classic', 'color-blind', 'monochrome'] })) if (typeof s[key] !== 'string' || !choices.includes(s[key])) throw new Error(`Invalid heatmap ${key}.`);
  if (!Number.isSafeInteger(s.bars) || Number(s.bars) < 1 || Number(s.bars) > 100000 || typeof s.monoSize !== 'boolean' || !text(s.search, 200) || !text(s.currency, 30, true) || !text(s.resolution, 50, true) || !text(s.zoomGroup, 500, true) || s.knowledgeCutoff !== null && !timestamp(s.knowledgeCutoff)) throw new Error('Invalid heatmap window or filters.');
  if (!Array.isArray(s.hiddenBins) || s.hiddenBins.length > 7 || new Set(s.hiddenBins).size !== s.hiddenBins.length || s.hiddenBins.some(value => !Number.isSafeInteger(value) || value < 0 || value > 6)) throw new Error('Invalid heatmap legend selection.');
  const selections = s.datasetSelections ?? {};
  if (!object(selections) || Object.keys(selections).length > 50000 || Object.entries(selections).some(([key, value]) => !key || key.length > 500 || typeof value !== 'string' || !value || value.length > 2000)) throw new Error('Invalid heatmap dataset selections.');
  const ids = new Set<string>();
  const metadata = input.metadata.map(row => {
    if (!object(row) || !text(row.instrumentId, 500) || !row.instrumentId || ids.has(row.instrumentId as string) || !text(row.currency, 30) || !row.currency || !text(row.source, 2000) || !row.source || !text(row.sector, 500, true) || !text(row.fundAssetClass, 500, true) || !timestamp(row.asOf) || !timestamp(row.availableAt) || row.availableAt < row.asOf || [row.marketCap, row.aum].some(value => value !== null && (!finite(value) || value < 0)) || row.navTotalReturn !== undefined && row.navTotalReturn !== null && (!finite(row.navTotalReturn) || row.navTotalReturn < -100) || row.topWeight !== undefined && row.topWeight !== null && (!finite(row.topWeight) || row.topWeight < 0 || row.topWeight > 100)) throw new Error('Invalid, duplicate or undated heatmap metadata.');
    ids.add(row.instrumentId as string);
    return { instrumentId: row.instrumentId, marketCap: row.marketCap, aum: row.aum, currency: row.currency, sector: row.sector, fundAssetClass: row.fundAssetClass, asOf: row.asOf, availableAt: row.availableAt, source: row.source, ...(row.navTotalReturn === undefined ? {} : { navTotalReturn: row.navTotalReturn }), ...(row.topWeight === undefined ? {} : { topWeight: row.topWeight }) } as HeatmapMetadata;
  });
  return { schemaVersion: 1, settings: { asset: s.asset, size: s.size, color: s.color, bars: s.bars, monoSize: s.monoSize, grouping: s.grouping, zoomGroup: s.zoomGroup, search: s.search, currency: s.currency, resolution: s.resolution, hiddenBins: [...s.hiddenBins], title: s.title, value: s.value, palette: s.palette, knowledgeCutoff: s.knowledgeCutoff, datasetSelections: { ...selections } } as HeatmapSettings, metadata };
}
/** Reset edits the draft only: display settings return to defaults; explicit source choices and supplied metadata are kept. */
export function resetHeatmapDraft(draft: HeatmapState): HeatmapState {
  // Deliberately unvalidated: Reset must remain the way out of an invalid draft (for example N = 0).
  // Source choices survive Reset: explicit dataset selections and the resolution filter, which is the first
  // disambiguator between same-instrument datasets. Clearing it could turn a working view into "Ambiguous datasets".
  const resolution = typeof draft.settings.resolution === 'string' && draft.settings.resolution.length <= 50 ? draft.settings.resolution : null;
  return { schemaVersion: 1, settings: { ...createHeatmapState().settings, resolution, datasetSelections: { ...draft.settings.datasetSelections } }, metadata: draft.metadata.map(row => ({ ...row })) };
}
/**
 * Chart-open gate for Enter, double-click and the Open button. An unselected tile is selected first (never opened);
 * a dirty draft needs explicit confirmation because opening closes the dialog and discards it.
 */
export function heatmapOpenDecision(input: { selectedId: string | null; itemId: string; dirty: boolean; confirmed: boolean }): 'select' | 'confirm' | 'open' {
  if (input.selectedId !== input.itemId) return 'select';
  return input.dirty && !input.confirmed ? 'confirm' : 'open';
}
/** True when the selected size or color metric reads the loaded-bar count N. */
export function heatmapUsesBars(settings: Pick<HeatmapSettings, 'size' | 'color'>): boolean { return HEATMAP_SIZE_SPECS[settings.size].usesBars || HEATMAP_COLOR_SPECS[settings.color].usesBars; }
/**
 * One draft edit. Changing grouping clears zoom. When the new metrics no longer use N and N is invalid, N returns
 * to its default so a disabled field can never leave the draft unrecoverable.
 */
export function applyHeatmapSetting<K extends keyof HeatmapSettings>(settings: HeatmapSettings, key: K, value: HeatmapSettings[K]): HeatmapSettings {
  const next = { ...settings, [key]: value, ...(key === 'grouping' ? { zoomGroup: null } : {}) } as HeatmapSettings;
  if (!heatmapUsesBars(next) && !(Number.isSafeInteger(next.bars) && next.bars >= 1 && next.bars <= 100000)) next.bars = createHeatmapState().settings.bars;
  return next;
}
/** True when the draft would change saved state if applied. Invalid drafts count as changed. */
export function heatmapDraftChanged(saved: HeatmapState, draft: HeatmapState): boolean {
  try { return JSON.stringify(restoreHeatmapState(saved)) !== JSON.stringify(restoreHeatmapState(draft)); } catch { return true; }
}
const palettes = {
  classic: ['#a52f3b', '#bf5059', '#bb777d', '#555e6d', '#608f84', '#328578', '#087e69'],
  'color-blind': ['#9d4d08', '#ba6e26', '#bc9367', '#555e6d', '#6a9fba', '#337da9', '#006799'],
  monochrome: ['#303b4d', '#3b4b61', '#495e78', '#58708e', '#6d86a5', '#819ab8', '#a4b8d0'],
};
const positivePalettes = {
  classic: ['#415953', '#3b665c', '#327565', '#29856e', '#1d9578', '#0ca581', '#08b88d'],
  'color-blind': ['#475460', '#476579', '#41778f', '#3589a7', '#299cbd', '#14afd3', '#00c2e8'],
  monochrome: palettes.monochrome,
};
function compareId(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
/** Stable across provider revisions, distinct across source datasets and resolutions. */
export function heatmapDatasetKey(dataset: BarDataset): string { return JSON.stringify([dataset.instrument.id, dataset.provenance.providerId, dataset.provenance.datasetId, dataset.resolution]); }
export function heatmapSelectedDataset(item: HeatmapItem, datasets: readonly BarDataset[]): BarDataset | undefined {
  const matches = datasets.filter(dataset => dataset.instrument.id === item.id && dataset.instrument.exchange === item.exchange && dataset.instrument.assetClass === item.assetClass && dataset.instrument.currency === item.priceCurrency && dataset.resolution === item.resolution && ['providerId', 'datasetId', 'adjustment', 'session', 'timezone', 'fixture', 'revision', 'coverage'].every(key => dataset.provenance[key as keyof DataProvenance] === item.provenance[key as keyof DataProvenance]));
  return matches.length === 1 ? matches[0] : undefined;
}

/** Declared bar duration in seconds (months as 31 days), or null for event-based/unparseable resolutions. */
export function heatmapResolutionSeconds(resolution: string): number | null {
  try {
    const spec = parseInterval(resolution);
    if (spec.kind !== 'time') return null;
    if (spec.seconds !== null) return spec.seconds;
    return spec.multiplier * (spec.unit === 'day' ? DAY : spec.unit === 'week' ? 7 * DAY : 31 * DAY);
  } catch { return null; }
}
function periodResolutionReason(resolution: string, period: Period): string | null {
  const seconds = heatmapResolutionSeconds(resolution);
  if (seconds === null) return `Resolution "${resolution}" has no declared time duration; ${PERIOD_LABEL[period]} metrics need a time resolution.`;
  if (period === 'ytd' && parseInterval(resolution).unit === 'week') return `Weekly bars (${resolution}) can span 1 January, so year to date cannot be separated.`;
  return seconds > PERIOD_MAX_BAR[period] ? `Resolution ${resolution} is coarser than the ${PERIOD_LABEL[period]} period.` : null;
}
function utcMonthsBefore(time: number, months: number): number {
  const date = new Date(time * 1000), day = date.getUTCDate();
  const target = new Date(0); target.setUTCFullYear(date.getUTCFullYear(), date.getUTCMonth() - months, 1);
  const monthEnd = new Date(0); monthEnd.setUTCFullYear(target.getUTCFullYear(), target.getUTCMonth() + 1, 0);
  target.setUTCDate(Math.min(day, monthEnd.getUTCDate())); target.setUTCHours(date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), 0);
  return Math.floor(target.getTime() / 1000);
}
/** Inclusive upper bound for the comparison-base bar time of a calendar period ending at the latest bar. */
export function heatmapPeriodBase(lastTime: number, period: Period): number {
  if (period === '1h') return lastTime - 3600;
  if (period === '4h') return lastTime - 14400;
  if (period === '1d') return Math.floor(lastTime / DAY) * DAY - 1;
  if (period === '1w') return lastTime - 7 * DAY;
  if (period === 'ytd') { const start = new Date(0); start.setUTCFullYear(new Date(lastTime * 1000).getUTCFullYear(), 0, 1); return Math.floor(start.getTime() / 1000) - 1; }
  return utcMonthsBefore(lastTime, period === '1m' ? 1 : period === '3m' ? 3 : period === '6m' ? 6 : 12);
}
function lastAtOrBefore(bars: readonly { time: number }[], target: number): number {
  let low = 0, high = bars.length - 1, found = -1;
  while (low <= high) { const middle = (low + high) >> 1; if (bars[middle].time <= target) { found = middle; low = middle + 1; } else high = middle - 1; }
  return found;
}
const iso = (time: number) => new Date(time * 1000).toISOString();

type Bars = BarDataset['bars'];
/** UTC calendar index: days since epoch, Monday-start weeks since epoch, or months since year 0. */
export function heatmapCalendarIndex(time: number, unit: 'day' | 'week' | 'month'): number {
  const day = Math.floor(time / DAY);
  if (unit === 'day') return day;
  if (unit === 'week') return Math.floor((day + 3) / 7);
  const date = new Date(time * 1000); return date.getUTCFullYear() * 12 + date.getUTCMonth();
}
const MONTH_STEPS: Partial<Record<Period, number>> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 };
/**
 * Index of the comparison-base bar (-1 when history is too short) for a period ending at the latest bar. Calendar
 * bars (week/month resolutions) are matched by UTC calendar index rather than by timestamp shift, so a bar stamped on
 * a first trading day can never make one period cover two. Finer bars use the timestamp rule in heatmapPeriodBase.
 */
function formatSpan(seconds: number): string { return seconds % DAY === 0 ? `${seconds / DAY} days` : seconds % 3600 === 0 ? `${seconds / 3600} hours` : `${seconds} seconds`; }
/** Largest allowed age (seconds) of the comparison-base bar before the period start: one bar for 1h/4h, one bar plus 4 days (weekends, holidays) otherwise. */
export function heatmapBaseTolerance(period: Period, resolution: string): number | null {
  const seconds = heatmapResolutionSeconds(resolution);
  return seconds === null ? null : period === '1h' || period === '4h' ? seconds : seconds + 4 * DAY;
}
interface PeriodBase { base: number; target: number; reason: string | null; stale: string | null; startCovered: boolean }
/**
 * Comparison-base bar for a period ending at the latest bar. Finer bars use the timestamp rule in heatmapPeriodBase
 * and the age bound in heatmapBaseTolerance; week/month bars are matched by UTC calendar index and must sit in exactly
 * the expected week/month. `stale` explains a base that is too old (a data gap). `startCovered` is true when the bars
 * after the base begin within one bar of the period start, so a sum over them covers the whole period.
 */
function periodBaseIndex(bars: Bars, resolution: string, period: Period): PeriodBase {
  const last = bars.at(-1)!, target = heatmapPeriodBase(last.time, period), seconds = heatmapResolutionSeconds(resolution) ?? 0;
  let unit: string | null = null; try { unit = parseInterval(resolution).unit; } catch { unit = null; }
  if (unit === 'week' && period === 'ytd') return { base: -1, target, reason: 'Weekly bars can span 1 January, so year to date cannot be separated. Load daily or monthly bars.', stale: null, startCovered: false };
  let targetIndex: number | null = null, calendar: 'week' | 'month' | null = null;
  if (unit === 'week' && period === '1w') { calendar = 'week'; targetIndex = heatmapCalendarIndex(last.time, 'week') - 1; }
  else if (unit === 'month' && (period === 'ytd' || MONTH_STEPS[period])) { calendar = 'month'; targetIndex = period === 'ytd' ? new Date(last.time * 1000).getUTCFullYear() * 12 - 1 : heatmapCalendarIndex(last.time, 'month') - MONTH_STEPS[period]!; }
  if (calendar === null || targetIndex === null) {
    const base = lastAtOrBefore(bars, target), tolerance = heatmapBaseTolerance(period, resolution) ?? 0, first = bars[base + 1];
    const stale = base >= 0 && target - bars[base].time > tolerance ? `The nearest loaded bar at or before ${iso(target)} is ${iso(bars[base].time)}, more than ${formatSpan(tolerance)} earlier; a ${PERIOD_LABEL[period]} comparison would span a data gap.` : null;
    return { base, target, reason: null, stale, startCovered: !!first && first.time <= target + seconds };
  }
  let base = -1; for (let index = bars.length - 2; index >= 0; index--) if (heatmapCalendarIndex(bars[index].time, calendar) <= targetIndex) { base = index; break; }
  const stale = base >= 0 && heatmapCalendarIndex(bars[base].time, calendar) !== targetIndex ? `No loaded bar falls in the UTC ${calendar} before the period; the nearest earlier bar (${iso(bars[base].time)}) would stretch the ${PERIOD_LABEL[period]} comparison.` : null;
  return { base, target, reason: null, stale, startCovered: heatmapCalendarIndex(bars[base + 1].time, calendar) === targetIndex + 1 };
}
/** Sums and the latest-date range need a complete window: a fresh base bar, or bars starting within one bar of the period start. */
function windowReason(found: PeriodBase, period: Period): string | null {
  if (found.base >= 0 && !found.stale) return null;
  if (found.startCovered) return null;
  if (found.stale) return found.stale;
  return period === '1d' ? `Loaded history starts after 00:00 UTC of the latest date; the 1-day window would be incomplete.` : `Loaded history does not reach back to ${iso(found.target)}; a ${PERIOD_LABEL[period]} sum would be incomplete.`;
}
function periodSize(bars: Bars, spec: SizeSpec, resolution: string): { value: number | null; reason: string | null; window: HeatmapItem['sizeWindow'] } {
  const last = bars.at(-1)!, period = spec.period!, found = periodBaseIndex(bars, resolution, period);
  const blocked = found.reason ?? windowReason(found, period);
  if (blocked) return { value: null, reason: blocked, window: null };
  const window = bars.slice(found.base + 1);
  if (!window.every(bar => finite(bar.volume) && bar.volume >= 0 && finite(bar.close) && bar.close > 0)) return { value: null, reason: 'A bar in the period has invalid volume or close.', window: null };
  return { value: window.reduce((sum, bar) => sum + bar.volume * (spec.turnover ? bar.close : 1), 0), reason: null, window: { first: window[0].time, last: last.time, bars: window.length } };
}
function periodColor(bars: Bars, metric: HeatmapColor, period: Period, resolution: string): { value: number | null; reason: string | null; baseTime: number | null } {
  const last = bars.at(-1)!, found = periodBaseIndex(bars, resolution, period), { base, target, reason } = found;
  if (reason) return { value: null, reason, baseTime: null };
  if (metric === 'volatility-1d') {
    const partial = windowReason(found, period); if (partial) return { value: null, reason: partial, baseTime: null };
    const day = bars.slice(base + 1); let high = -Infinity, low = Infinity;
    for (const bar of day) { if (!finite(bar.high) || !finite(bar.low) || bar.low <= 0 || bar.high < bar.low) return { value: null, reason: 'A bar on the latest UTC date has an invalid range.', baseTime: null }; high = Math.max(high, bar.high); low = Math.min(low, bar.low); }
    return { value: 100 * (high - low) / low, reason: null, baseTime: null };
  }
  if (base < 0) return { value: null, reason: period === '1d' ? 'No loaded close exists before the latest UTC date.' : `Loaded history does not reach back to ${iso(target)}.`, baseTime: null };
  if (found.stale) return { value: null, reason: found.stale, baseTime: null };
  const reference = bars[base].close;
  if (!finite(reference) || reference <= 0) return { value: null, reason: 'The comparison close is missing or not positive.', baseTime: null };
  if (metric === 'gap-1d') { const open = bars[base + 1].open; return finite(open) && open > 0 ? { value: 100 * (open / reference - 1), reason: null, baseTime: bars[base].time } : { value: null, reason: 'The first open of the latest UTC date is invalid.', baseTime: null }; }
  return { value: 100 * (last.close / reference - 1), reason: null, baseTime: bars[base].time };
}

/** Daily SPY bars for beta, searched in `pool` (the whole loaded universe, so a watchlist scope does not hide the benchmark). */
export function heatmapBenchmark(pool: readonly BarDataset[]): BarDataset | null {
  return pool.find(dataset => dataset.instrument.symbol.toUpperCase() === HEATMAP_BETA_BENCHMARK && heatmapResolutionSeconds(dataset.resolution) === DAY && dataset.bars.length > 1) ?? null;
}
const BENCHMARK_MISSING = `Beta needs ${HEATMAP_BETA_BENCHMARK} daily bars loaded as the benchmark.`;
export function calculateHeatmap(datasets: readonly BarDataset[], settings: HeatmapSettings, metadata: readonly HeatmapMetadata[] = [], now = Math.floor(Date.now() / 1000), benchmarkPool: readonly BarDataset[] = datasets): HeatmapResult {
  const state = restoreHeatmapState({ schemaVersion: 1, settings, metadata });
  if (!timestamp(now) || datasets.length > 50000) throw new Error('Invalid heatmap clock or excessive universe.');
  const cutoff = Math.min(now, state.settings.knowledgeCutoff ?? now), meta = new Map(state.metadata.map(row => [row.instrumentId, row]));
  const sizeSpec = HEATMAP_SIZE_SPECS[settings.size], colorSpec = HEATMAP_COLOR_SPECS[settings.color], fundamental = settings.size === 'market-cap' || settings.size === 'aum';
  const result: HeatmapResult = { items: [], unavailable: [], zeroWeight: [], hiddenItems: [], bins: [], groups: [], diagnostics: [], filtered: { unsupportedClass: 0, asset: 0, resolution: 0, search: 0, currency: 0 }, universe: { stock: 0, etf: 0, other: 0, synthetic: 0, nonSynthetic: 0 }, coverage: { datasets: datasets.length, supplied: new Set(datasets.map(dataset => dataset.instrument.id)).size, eligible: 0, shown: 0, excluded: 0, hidden: 0, unknownColor: 0, unknownSize: 0, synthetic: 0 }, policies: [...HEATMAP_POLICIES] };
  const benchmark = settings.color === 'beta-1y' ? heatmapBenchmark(benchmarkPool) : null, benchmarkBars = benchmark ? benchmark.bars.filter(bar => bar.time <= cutoff) : [];
  const seen = new Map<string, BarDataset>();
  for (const dataset of datasets) if (!seen.has(dataset.instrument.id)) seen.set(dataset.instrument.id, dataset);
  for (const dataset of seen.values()) { const kind = dataset.instrument.assetClass; if (kind === 'stock') result.universe.stock++; else if (kind === 'etf') result.universe.etf++; else result.universe.other++; if (dataset.provenance.fixture) result.universe.synthetic++; else result.universe.nonSynthetic++; }
  const search = settings.search.trim().toLowerCase();
  const choices = new Map<string, BarDataset[]>(); let candidates: HeatmapItem[] = [];
  for (const dataset of datasets) {
    const instrument = dataset.instrument;
    if (!['stock', 'etf'].includes(instrument.assetClass)) { result.filtered.unsupportedClass++; continue; }
    if (settings.asset !== 'all' && settings.asset !== instrument.assetClass) { result.filtered.asset++; continue; }
    if (settings.resolution && settings.resolution !== dataset.resolution) { result.filtered.resolution++; continue; }
    if (search && !`${instrument.symbol} ${instrument.name}`.toLowerCase().includes(search)) { result.filtered.search++; continue; }
    const supplied = meta.get(instrument.id), known = supplied && supplied.availableAt <= cutoff && supplied.asOf <= cutoff ? supplied : undefined;
    const currency = fundamental ? known?.currency ?? instrument.currency : instrument.currency;
    if (settings.currency && settings.currency !== currency) { result.filtered.currency++; continue; }
    const list = choices.get(instrument.id) ?? []; list.push(dataset); choices.set(instrument.id, list);
  }
  result.coverage.excluded = result.coverage.supplied - choices.size;
  for (const [instrumentId, sources] of choices) {
    const selected = sources.length === 1 ? sources : sources.filter(source => heatmapDatasetKey(source) === state.settings.datasetSelections[instrumentId]);
    if (selected.length !== 1) throw new Error(`Ambiguous datasets for ${sources[0].instrument.symbol}. Choose a resolution or select one source dataset; no source is substituted automatically.`);
    const dataset = selected[0], instrument = dataset.instrument;
    for (let index = 0; index < dataset.bars.length; index++) if (!timestamp(dataset.bars[index].time) || index > 0 && dataset.bars[index].time <= dataset.bars[index - 1].time) throw new Error('Heatmap requires ordered, unique time bars. Derived chart events are not an equivalent input.');
    const bars = dataset.bars.filter(bar => bar.time <= cutoff), last = bars.at(-1), previous = bars.at(-2), window = bars.slice(-settings.bars);
    const usable = ['ready', 'stale', 'disconnected'].includes(dataset.provenance.state) && last && [last.open, last.high, last.low, last.close, last.volume].every(finite) && Math.min(last.open, last.high, last.low, last.close) > 0 && last.volume >= 0 && last.high >= Math.max(last.open, last.close, last.low) && last.low <= Math.min(last.open, last.close);
    const supplied = meta.get(instrument.id), known = supplied && supplied.availableAt <= cutoff && supplied.asOf <= cutoff ? supplied : undefined;
    const sizeCurrency = fundamental ? known?.currency ?? instrument.currency : instrument.currency;
    let sizeValue: number | null = null, colorValue: number | null = null, sizeReason: string | null = null, colorReason: string | null = null, colorBaseTime: number | null = null, sizeWindow: HeatmapItem['sizeWindow'] = null;
    if (fundamental) { sizeValue = known?.[settings.size === 'market-cap' ? 'marketCap' : 'aum'] ?? null; if (sizeValue === null) sizeReason = supplied && !known ? state.settings.knowledgeCutoff !== null && state.settings.knowledgeCutoff < now ? 'Supplied metadata is dated after the cutoff.' : 'Supplied metadata is dated in the future (after the current clock).' : `No eligible dated ${settings.size === 'market-cap' ? 'market cap' : 'AUM'} metadata. It is never derived from price or volume.`; }
    else if (sizeSpec.period) {
      const resolutionReason = periodResolutionReason(dataset.resolution, sizeSpec.period);
      if (resolutionReason) sizeReason = resolutionReason;
      else if (!usable) sizeReason = 'Required loaded bars or volume are unavailable.';
      else { const computed = periodSize(bars, sizeSpec, dataset.resolution); sizeValue = computed.value; sizeReason = computed.reason; sizeWindow = computed.window; }
    }
    else if (usable && window.length === settings.bars && window.every(bar => finite(bar.volume) && bar.volume >= 0 && finite(bar.close) && bar.close > 0)) { sizeValue = window.reduce((sum, bar) => sum + bar.volume * (settings.size === 'turnover' ? bar.close : 1), 0); sizeWindow = { first: window[0].time, last: window.at(-1)!.time, bars: window.length }; }
    else sizeReason = 'Required loaded bars or volume are unavailable.';
    if (sizeValue !== null && !Number.isFinite(sizeValue)) { sizeValue = null; sizeWindow = null; sizeReason = 'Size calculation exceeded the supported numeric range.'; }
    if (usable) {
      if (colorSpec.period) {
        const resolutionReason = periodResolutionReason(dataset.resolution, colorSpec.period);
        if (resolutionReason) colorReason = resolutionReason;
        else { const computed = periodColor(bars, settings.color, colorSpec.period, dataset.resolution); colorValue = computed.value; colorReason = computed.reason; colorBaseTime = computed.baseTime; }
      }
      else if (settings.color === 'change') { const base = bars.at(-settings.bars - 1); if (base && finite(base.close) && base.close > 0) { colorValue = 100 * (last.close / base.close - 1); colorBaseTime = base.time; } }
      else if (settings.color === 'gap' && previous && finite(previous.close) && previous.close > 0) { colorValue = 100 * (last.open / previous.close - 1); colorBaseTime = previous.time; }
      else if (settings.color === 'range-percent' && last.high >= last.low) colorValue = 100 * (last.high - last.low) / last.low;
      else if (settings.color === 'extended-pre' || settings.color === 'extended-post') { const blocked = extendedHoursReason({ timezone: instrument.timezone, assetClass: instrument.assetClass, session: dataset.provenance.session, resolutionSeconds: heatmapResolutionSeconds(dataset.resolution) }); if (blocked) colorReason = blocked; else { const computed = extendedHoursChange(bars, heatmapResolutionSeconds(dataset.resolution)!, settings.color === 'extended-pre' ? 'pre' : 'post'); colorValue = computed.value; colorReason = computed.reason; colorBaseTime = computed.baseTime; } }
      else if (settings.color === 'beta-1y') { if (!benchmark) colorReason = BENCHMARK_MISSING; else if (heatmapResolutionSeconds(dataset.resolution) !== DAY) colorReason = 'Beta needs daily bars for this instrument.'; else { const computed = dailyBeta(bars, benchmarkBars); colorValue = computed.value; colorReason = computed.reason; } }
      else if (settings.color === 'relative-volume') { const prior = bars.slice(-settings.bars - 1, -1); if (prior.length === settings.bars && prior.every(bar => finite(bar.volume) && bar.volume >= 0)) { const average = prior.reduce((sum, bar) => sum + bar.volume / settings.bars, 0); if (finite(average) && average > 0) colorValue = last.volume / average; } }
    }
    if (settings.color === 'fund-nav-return' || settings.color === 'fund-top-weight') { const field = settings.color === 'fund-nav-return' ? 'navTotalReturn' : 'topWeight', supplied = known?.[field]; colorValue = supplied ?? null; colorReason = supplied === undefined || supplied === null ? `No eligible dated ${settings.color === 'fund-nav-return' ? 'NAV total return' : 'top holding weight'} in the supplied metadata. It is never derived from prices.` : null; }
    if (colorValue === null || !Number.isFinite(colorValue)) { colorValue = null; colorBaseTime = null; colorReason = colorReason ?? 'Required price/volume history or nonzero denominator is unavailable.'; }
    const group = settings.grouping === 'sector' ? known?.sector || 'Sector unavailable' : settings.grouping === 'fund-asset-class' ? known?.fundAssetClass || 'Fund asset class unavailable' : settings.grouping === 'exchange' ? instrument.exchange || 'Exchange unavailable' : settings.grouping === 'instrument-type' ? instrument.assetClass : 'All loaded instruments';
    candidates.push({ id: instrument.id, symbol: instrument.symbol, name: instrument.name, exchange: instrument.exchange, assetClass: instrument.assetClass, currency: sizeCurrency, priceCurrency: instrument.currency, resolution: dataset.resolution, group, price: usable ? last.close : null, priceTime: usable ? last.time : null, sizeValue, colorValue, weight: settings.monoSize ? 1 : sizeValue ?? 0, sizeReason, colorReason, bin: null, color: HEATMAP_UNKNOWN_COLOR, metadataAsOf: known?.asOf ?? null, metadataSource: known?.source ?? null, provenance: structuredClone(dataset.provenance), colorBaseTime, sizeWindow });
  }
  result.groups = [...new Set(candidates.map(item => item.group))].sort(compareId);
  if (settings.zoomGroup !== null) candidates = candidates.filter(item => item.group === settings.zoomGroup);
  if (new Set(candidates.map(item => item.resolution)).size > 1) result.diagnostics.push('Loaded resolutions differ. N bars span different times across instruments; choose a common resolution for comparable windows.');
  if (sizeSpec.monetary && new Set(candidates.filter(item => item.sizeValue !== null).map(item => item.currency)).size > 1) {
    result.diagnostics.push('Monetary sizes use different currencies. Select one currency; no FX conversion or cross-currency size ranking is performed.');
    candidates = candidates.map(item => ({ ...item, sizeValue: null, sizeWindow: null, sizeReason: 'Mixed currencies cannot be compared.', weight: settings.monoSize ? 1 : 0 }));
  }
  result.coverage.eligible = candidates.length;
  const positiveOnly = colorSpec.positiveOnly;
  let extent = 0; for (const row of candidates) if (row.colorValue !== null) extent = Math.max(extent, Math.abs(row.colorValue));
  for (let index = 0; index < 7; index++) result.bins.push({ index, lower: positiveOnly ? index * extent / 7 : (index * 2 / 7 - 1) * extent, upper: positiveOnly ? (index + 1) * extent / 7 : ((index + 1) * 2 / 7 - 1) * extent, color: (positiveOnly ? positivePalettes : palettes)[settings.palette][index], count: 0, hidden: settings.hiddenBins.includes(index) });
  for (const item of candidates) {
    if (item.colorValue !== null) { item.bin = extent === 0 ? positiveOnly ? 0 : 3 : Math.max(0, Math.min(6, Math.floor((positiveOnly ? item.colorValue / extent : (item.colorValue / extent + 1) / 2) * 7))); item.color = result.bins[item.bin].color; result.bins[item.bin].count++; }
    else result.coverage.unknownColor++;
    if (item.sizeValue === null) result.coverage.unknownSize++;
    if (item.provenance.fixture) result.coverage.synthetic++;
    if (item.bin !== null && settings.hiddenBins.includes(item.bin)) { result.coverage.hidden++; result.hiddenItems.push(item); continue; }
    if (!settings.monoSize && item.sizeValue === null) result.unavailable.push(item);
    else if (!settings.monoSize && item.weight === 0) result.zeroWeight.push(item);
    else result.items.push(item);
  }
  result.items.sort((a, b) => a.sizeValue === null && b.sizeValue !== null ? 1 : b.sizeValue === null && a.sizeValue !== null ? -1 : (b.sizeValue ?? 0) - (a.sizeValue ?? 0) || compareId(a.id, b.id));
  result.coverage.shown = result.items.length;
  return result;
}

/**
 * Size/color/grouping choices with availability over the loaded universe. Unavailable choices stay listed with a
 * reason instead of silently falling back to another metric. Availability ignores search/zoom so typing does not
 * disable options; individual tiles still carry their own reasons.
 */
export function heatmapOptions(datasets: readonly BarDataset[], state: HeatmapState, now = Math.floor(Date.now() / 1000), benchmarkPool: readonly BarDataset[] = datasets): { size: HeatmapOption<HeatmapSize>[]; color: HeatmapOption<HeatmapColor>[]; unsupportedColor: readonly HeatmapOption[]; grouping: HeatmapOption<HeatmapGrouping>[] } {
  const settings = state.settings;
  const scoped = datasets.filter(dataset => ['stock', 'etf'].includes(dataset.instrument.assetClass) && (settings.asset === 'all' || settings.asset === dataset.instrument.assetClass) && (!settings.resolution || settings.resolution === dataset.resolution));
  const cutoff = Math.min(now, settings.knowledgeCutoff ?? now), ids = new Set(scoped.map(dataset => dataset.instrument.id)), rows = state.metadata.filter(row => ids.has(row.instrumentId) && row.asOf <= cutoff && row.availableAt <= cutoff);
  const resolutions = [...new Set(scoped.map(dataset => dataset.resolution))].sort();
  const periodReason = (period: Period | null): string | null => {
    if (!period) return null;
    if (!scoped.length) return 'No stock or ETF datasets are loaded for the current instrument and resolution filters.';
    return resolutions.some(resolution => periodResolutionReason(resolution, period) === null) ? null : `No loaded resolution can resolve ${PERIOD_LABEL[period]} (loaded: ${resolutions.join(', ')}).`;
  };
  const size = (Object.keys(HEATMAP_SIZE_SPECS) as HeatmapSize[]).map(value => {
    const spec = HEATMAP_SIZE_SPECS[value];
    let reason = periodReason(spec.period);
    if (value === 'market-cap' && !rows.some(row => row.marketCap !== null)) reason = 'No market-cap metadata dated at or before the cutoff and current clock for the loaded instruments. Market cap is never derived from price or volume.';
    if (value === 'aum' && !rows.some(row => row.aum !== null)) reason = 'No AUM metadata dated at or before the cutoff and current clock for the loaded funds. AUM is never derived from price or volume.';
    return { value, label: spec.label, category: spec.category, available: reason === null, reason };
  });
  const extendedReason = scoped.some(dataset => extendedHoursReason({ timezone: dataset.instrument.timezone, assetClass: dataset.instrument.assetClass, session: dataset.provenance.session, resolutionSeconds: heatmapResolutionSeconds(dataset.resolution) }) === null) ? null : 'No loaded US stock or ETF dataset has intraday bars (30 minutes or less) that include extended hours.';
  const special: Partial<Record<HeatmapColor, string | null>> = {
    'extended-pre': extendedReason, 'extended-post': extendedReason,
    'beta-1y': !heatmapBenchmark(benchmarkPool) ? BENCHMARK_MISSING : scoped.some(dataset => heatmapResolutionSeconds(dataset.resolution) === DAY) ? null : 'Beta needs daily bars; no loaded stock or ETF dataset is daily.',
    'fund-nav-return': rows.some(row => row.navTotalReturn !== undefined && row.navTotalReturn !== null) ? null : 'No NAV total return metadata (navTotalReturn column) dated at or before the cutoff for the loaded instruments.',
    'fund-top-weight': rows.some(row => row.topWeight !== undefined && row.topWeight !== null) ? null : 'No top holding weight metadata (topWeight column) dated at or before the cutoff for the loaded instruments.',
  };
  const color = (Object.keys(HEATMAP_COLOR_SPECS) as HeatmapColor[]).map(value => { const spec = HEATMAP_COLOR_SPECS[value], reason = value in special ? special[value]! : periodReason(spec.period); return { value, label: spec.label, category: spec.category, available: reason === null, reason }; });
  const grouping = (Object.keys(GROUP_LABELS) as HeatmapGrouping[]).map(value => {
    const reason = value === 'sector' && !rows.some(row => row.sector) ? 'No sector metadata for the loaded instruments. Sectors are never inferred from tickers or prices.' : value === 'fund-asset-class' && !rows.some(row => row.fundAssetClass) ? 'No ETF asset-class metadata for the loaded funds.' : null;
    return { value, label: GROUP_LABELS[value], category: 'Grouping', available: reason === null, reason };
  });
  return { size, color, unsupportedColor: HEATMAP_UNSUPPORTED_COLORS, grouping };
}

/** Plain-language scope statement: the loaded subset is never presented as a whole market. */
export function heatmapUniverseDisclosure(result: HeatmapResult): string {
  const u = result.universe, f = result.filtered, filteredTotal = f.asset + f.resolution + f.search + f.currency;
  return `Loaded subset, not a whole market: ${result.coverage.supplied} supplied instrument${result.coverage.supplied === 1 ? '' : 's'} (${u.stock} stock, ${u.etf} ETF, ${u.other} other class not mapped; ${u.synthetic} synthetic, ${u.nonSynthetic} local import). No index, exchange or country constituent list is loaded, so tile shares are shares of this subset only. ${result.coverage.eligible} eligible after filters; ${filteredTotal} dataset${filteredTotal === 1 ? '' : 's'} filtered (asset ${f.asset}, resolution ${f.resolution}, search ${f.search}, currency ${f.currency}).`;
}

/** Balanced binary treemap. Input order is stable; area is proportional to weight. */
export function layoutHeatmap(items: readonly { id: string; weight: number }[], width: number, height: number): HeatmapRect[] {
  if (!finite(width) || !finite(height) || width < 0 || height < 0 || items.length > 50000 || new Set(items.map(item => item.id)).size !== items.length || items.some(item => !finite(item.weight) || item.weight <= 0)) throw new Error('Invalid heatmap geometry or weights.');
  if (!items.length || width === 0 || height === 0) return [];
  let maximum = 0; for (const item of items) maximum = Math.max(maximum, item.weight);
  const weights = items.map(item => item.weight / maximum), prefix = [0];
  for (const weight of weights) { const next = prefix.at(-1)! + weight; if (weight === 0 || next === prefix.at(-1)) throw new Error('Weight range is too large to preserve nonzero tile areas. Choose mono-size or narrow the universe.'); prefix.push(next); }
  const result: HeatmapRect[] = [];
  const stack = [{ first: 0, end: items.length, x: 0, y: 0, width, height }];
  while (stack.length) {
    const box = stack.pop()!;
    if (box.end - box.first === 1) { result.push({ id: items[box.first].id, x: box.x, y: box.y, width: box.width, height: box.height }); continue; }
    const total = prefix[box.end] - prefix[box.first], half = prefix[box.first] + total / 2;
    let low = box.first + 1, high = box.end - 1;
    while (low < high) { const middle = Math.floor((low + high) / 2); if (prefix[middle] < half) low = middle + 1; else high = middle; }
    let split = low; if (split > box.first + 1 && Math.abs(prefix[split - 1] - half) < Math.abs(prefix[split] - half)) split--;
    const ratio = (prefix[split] - prefix[box.first]) / total;
    if (!finite(ratio) || ratio <= 0 || ratio >= 1) throw new Error('Weight range is too large to preserve nonzero tile areas. Choose mono-size or narrow the universe.');
    if (box.width >= box.height) { const firstWidth = box.width * ratio; stack.push({ ...box, first: split, x: box.x + firstWidth, width: box.width - firstWidth }, { ...box, end: split, width: firstWidth }); }
    else { const firstHeight = box.height * ratio; stack.push({ ...box, first: split, y: box.y + firstHeight, height: box.height - firstHeight }, { ...box, end: split, height: firstHeight }); }
  }
  return result;
}

/**
 * Grouped treemap for a measured viewport. Groups are ordered by total weight (then name), each reserves a header
 * band, and members keep the item order. Tiles that cannot receive area at this size are listed in `undrawn`
 * rather than silently disappearing.
 */
export function layoutHeatmapGroups(items: readonly HeatmapItem[], grouping: HeatmapGrouping, width: number, height: number): HeatmapLayout {
  if (!finite(width) || !finite(height) || width < 0 || height < 0) throw new Error('Invalid heatmap geometry or weights.');
  const visible = (tiles: HeatmapRect[]) => tiles.filter(tile => tile.width * tile.height >= HEATMAP_MIN_TILE_AREA);
  if (grouping === 'none') { const tiles = visible(layoutHeatmap(items, width, height)), drawn = new Set(tiles.map(tile => tile.id)); return { width, height, groups: [{ group: '', bounds: { id: '', x: 0, y: 0, width, height }, tiles }], undrawn: items.filter(item => !drawn.has(item.id)).map(item => item.id) }; }
  const groups = new Map<string, HeatmapItem[]>(); for (const item of items) { const group = groups.get(item.group) ?? []; group.push(item); groups.set(item.group, group); }
  const weights = [...groups].map(([id, rows]) => ({ id, weight: rows.reduce((sum, row) => sum + row.weight, 0) })).sort((a, b) => b.weight - a.weight || compareId(a.id, b.id));
  const layout: HeatmapLayout = { width, height, groups: [], undrawn: [] };
  for (const bounds of layoutHeatmap(weights, width, height)) {
    const members = groups.get(bounds.id)!, innerWidth = bounds.width - 2 * HEATMAP_GROUP_PADDING, innerHeight = bounds.height - HEATMAP_GROUP_HEADER - HEATMAP_GROUP_PADDING;
    const tiles = innerWidth > 0 && innerHeight > 0 ? visible(layoutHeatmap(members, innerWidth, innerHeight)).map(tile => ({ ...tile, x: tile.x + bounds.x + HEATMAP_GROUP_PADDING, y: tile.y + bounds.y + HEATMAP_GROUP_HEADER })) : [];
    const drawn = new Set(tiles.map(tile => tile.id)); layout.undrawn.push(...members.filter(item => !drawn.has(item.id)).map(item => item.id));
    layout.groups.push({ group: bounds.id, bounds, tiles });
  }
  if (!layout.groups.length) layout.undrawn.push(...items.map(item => item.id));
  return layout;
}

function lexicographicLess(a: readonly number[], b: readonly number[]): boolean {
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return a[index] < b[index];
  return false;
}
/**
 * Keyboard selection over drawn tiles. Arrow keys move to the nearest tile in that direction, preferring tiles that
 * overlap on the cross axis; Home/End follow the metric order. Returns null when there is nowhere to move.
 */
export function heatmapKeyboardTarget(rects: readonly HeatmapRect[], order: readonly string[], currentId: string | null, key: string): string | null {
  const drawn = new Map(rects.map(rect => [rect.id, rect])), ordered = order.filter(id => drawn.has(id));
  if (!ordered.length) return null;
  if (key === 'Home') return ordered[0];
  if (key === 'End') return ordered.at(-1)!;
  const current = currentId === null ? undefined : drawn.get(currentId);
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return null;
  if (!current) return ordered[0];
  const epsilon = 1e-6, horizontal = key === 'ArrowLeft' || key === 'ArrowRight', rank = new Map(ordered.map((id, index) => [id, index]));
  let best: { id: string; score: [number, number, number, number] } | null = null;
  for (const rect of rects) {
    if (rect.id === current.id || !rank.has(rect.id)) continue;
    const gap = key === 'ArrowRight' ? rect.x - (current.x + current.width) : key === 'ArrowLeft' ? current.x - (rect.x + rect.width) : key === 'ArrowDown' ? rect.y - (current.y + current.height) : current.y - (rect.y + rect.height);
    if (gap < -epsilon) continue;
    const overlap = horizontal ? Math.min(rect.y + rect.height, current.y + current.height) - Math.max(rect.y, current.y) : Math.min(rect.x + rect.width, current.x + current.width) - Math.max(rect.x, current.x);
    const offset = horizontal ? Math.abs(rect.y + rect.height / 2 - (current.y + current.height / 2)) : Math.abs(rect.x + rect.width / 2 - (current.x + current.width / 2));
    const score: [number, number, number, number] = [overlap > epsilon ? 0 : 1, Math.max(0, gap), offset, rank.get(rect.id)!];
    if (!best || lexicographicLess(score, best.score)) best = { id: rect.id, score };
  }
  return best?.id ?? null;
}

function csvCell(value: unknown): string { let cell = value === null || value === undefined ? '' : String(value); if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@\uff1d\uff0b\uff0d\uff20]/.test(cell)) cell = `'${cell}`; return `"${cell.replaceAll('"', '""')}"`; }
/** Visible-view CSV. Unknown numbers stay empty with a status/reason, never zero. Every row states its loaded-subset scope. */
export function heatmapCsv(result: HeatmapResult, settings: HeatmapSettings): string {
  const headers = ['scope', 'status', 'symbol', 'name', 'instrument_id', 'asset_class', 'exchange', 'group', 'size_metric', 'size_value', 'size_unit', 'size_reason', 'color_metric', 'color_value', 'color_unit', 'color_bin_lower', 'color_bin_upper', 'color_reason', 'color_base_bar_utc', 'size_window_bars', 'size_window_first_utc', 'size_window_last_utc', 'price', 'price_currency', 'price_time_utc', 'resolution', 'provider', 'dataset_id', 'synthetic', 'coverage', 'adjustment', 'session', 'data_state', 'metadata_source'];
  const sizeUnit = (item: HeatmapItem) => settings.size.startsWith('volume') ? 'shares/units' : item.currency;
  const row = (item: HeatmapItem, status: string) => {
    const bin = item.bin === null ? null : result.bins[item.bin];
    return ['loaded subset; not a full market', status, item.symbol, item.name, item.id, item.assetClass, item.exchange, item.group, settings.size, item.sizeValue, sizeUnit(item), item.sizeReason, settings.color, item.colorValue, HEATMAP_COLOR_SPECS[settings.color].unit, bin?.lower ?? null, bin?.upper ?? null, item.colorReason, item.colorBaseTime === null ? null : iso(item.colorBaseTime), item.sizeWindow?.bars ?? null, item.sizeWindow ? iso(item.sizeWindow.first) : null, item.sizeWindow ? iso(item.sizeWindow.last) : null, item.price, item.priceCurrency, item.priceTime === null ? null : iso(item.priceTime), item.resolution, item.provenance.providerName, item.provenance.datasetId, item.provenance.fixture ? 'yes' : 'no', item.provenance.coverage, item.provenance.adjustment, item.provenance.session, item.provenance.state, item.metadataSource];
  };
  const rows = [...result.items.map(item => row(item, 'shown')), ...result.unavailable.map(item => row(item, 'size unavailable')), ...result.zeroWeight.map(item => row(item, 'zero size')), ...result.hiddenItems.map(item => row(item, 'hidden by legend'))];
  return [headers, ...rows].map(line => line.map(csvCell).join(',')).join('\r\n');
}

// Watchlist scope and metadata file import. Both are pure helpers; the dialog owns the UI state.
/** A watchlist member as the heatmap needs it: market identity plus an optional bound dataset. */
export interface HeatmapScopeMember { symbol: string; exchange: string; datasetId: string | null; }
export const HEATMAP_METADATA_CSV_TEMPLATE = 'symbol,exchange,sector,industry,marketCap,aum,currency,fundAssetClass,navTotalReturn,topWeight,asOf,availableAt,source\nEXAMPLE,LOCAL,Technology,Software,1500000000,,USD,,,,2026-01-02,2026-01-02,My own spreadsheet\n';
/**
 * Limits the universe to the members of one watchlist. A member bound to a dataset matches only that dataset;
 * an unbound member matches every loaded dataset with the same exchange and symbol. Members with no loaded data are reported.
 */
export function heatmapWatchScope(datasets: readonly BarDataset[], members: readonly HeatmapScopeMember[]): { datasets: BarDataset[]; missing: string[] } {
  const key = (exchange: string, symbol: string) => `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;
  const bound = new Set(members.filter(member => member.datasetId !== null).map(member => member.datasetId as string));
  const markets = new Set(members.filter(member => member.datasetId === null).map(member => key(member.exchange, member.symbol)));
  const kept = datasets.filter(dataset => bound.has(dataset.provenance.datasetId) || markets.has(key(dataset.instrument.exchange, dataset.instrument.symbol)));
  const present = new Set(kept.map(dataset => key(dataset.instrument.exchange, dataset.instrument.symbol)));
  const missing = [...new Set(members.filter(member => !present.has(key(member.exchange, member.symbol))).map(member => member.symbol))];
  return { datasets: kept, missing };
}
/** RFC 4180 style CSV rows (quoted fields, doubled quotes, CRLF or LF). */
export function heatmapCsvRows(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  const text = input.replace(/^﻿/, '');
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) { if (char === '"') { if (text[index + 1] === '"') { field += '"'; index++; } else quoted = false; } else field += char; }
    else if (char === '"' && field === '') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[index + 1] === '\n') index++; row.push(field); field = ''; if (row.some(value => value.trim() !== '')) rows.push(row); row = []; }
    else field += char;
  }
  if (quoted) throw new Error('The CSV has an unclosed quote.');
  row.push(field); if (row.some(value => value.trim() !== '')) rows.push(row);
  return rows;
}
const metadataTime = (value: string, fallback: number, name: string): number => {
  const raw = value.trim(); if (!raw) return fallback;
  if (/^-?\d{1,12}$/.test(raw)) { const seconds = Number(raw); if (timestamp(seconds)) return seconds; }
  if (/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))?$/.test(raw)) { const parsed = Date.parse(raw.length === 10 ? raw + 'T00:00:00Z' : raw) / 1000; if (timestamp(parsed)) return Math.floor(parsed); }
  throw new Error(`Invalid ${name} "${raw}". Use YYYY-MM-DD or Unix seconds.`);
};
const metadataNumber = (value: string, name: string): number | null => {
  const raw = value.trim().replace(/,/g, ''); if (!raw) return null;
  if (!/^\d+(?:\.\d+)?(?:e\d+)?$/i.test(raw)) throw new Error(`Invalid ${name} "${value.trim()}". Use a plain nonnegative number.`);
  return Number(raw);
};
/** Optional fund columns: present only when supplied, so files without them parse exactly as before. NAV return may be negative. */
function optionalFund(nav: string, top: string): Pick<HeatmapMetadata, 'navTotalReturn' | 'topWeight'> {
  const signed = (raw: string, name: string) => { const value = raw.replace(/,/g, ''); if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error(`Invalid ${name} "${raw}". Use a plain number in percent.`); return Number(value); };
  const out: Pick<HeatmapMetadata, 'navTotalReturn' | 'topWeight'> = {};
  if (nav) out.navTotalReturn = signed(nav, 'navTotalReturn');
  if (top) { const value = signed(top, 'topWeight'); if (value < 0 || value > 100) throw new Error(`Invalid topWeight "${top}". Use a percent from 0 to 100.`); out.topWeight = value; }
  return out;
}
export interface HeatmapMetadataImport { metadata: HeatmapMetadata[]; diagnostics: string[]; }
/**
 * Parses a metadata file. JSON is the existing HeatmapMetadata[] schema. CSV needs a symbol (or instrumentId) column; sector,
 * industry, marketCap, aum, currency, fundAssetClass, asOf, availableAt and source are optional. Missing dates default to
 * `now`, so such rows only count from now on. A CSV symbol is matched to a loaded instrument (an exchange column narrows it).
 * Rows with no loaded instrument are skipped and reported, never guessed. Industry fills the sector slot only when sector is blank.
 */
export function parseHeatmapMetadata(text: string, format: 'json' | 'csv', datasets: readonly BarDataset[], options: { now?: number; source?: string } = {}): HeatmapMetadataImport {
  const now = options.now ?? Math.floor(Date.now() / 1000), source = (options.source ?? 'Local metadata file').slice(0, 2000) || 'Local metadata file';
  if (text.length > 10 * 1024 * 1024) throw new Error('Metadata exceeds the 10 MiB limit.');
  if (format === 'json') {
    const input: unknown = JSON.parse(text.replace(/^﻿/, ''));
    const state = restoreHeatmapState({ ...createHeatmapState(), metadata: Array.isArray(input) ? input : (object(input) && Array.isArray(input.metadata) ? input.metadata : input) });
    return { metadata: state.metadata, diagnostics: [] };
  }
  const rows = heatmapCsvRows(text);
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one data row.');
  const header = rows[0].map(name => name.trim().toLowerCase()), column = (name: string) => header.indexOf(name.toLowerCase());
  const symbolAt = column('symbol'), idAt = column('instrumentid');
  if (symbolAt < 0 && idAt < 0) throw new Error('The CSV needs a symbol or instrumentId column.');
  const known = new Set(['symbol', 'instrumentid', 'exchange', 'sector', 'industry', 'marketcap', 'aum', 'currency', 'fundassetclass', 'navtotalreturn', 'topweight', 'asof', 'availableat', 'source']);
  const diagnostics = header.filter(name => name && !known.has(name)).map(name => `Ignored unknown column "${name}".`);
  const byId = new Map<string, BarDataset>(), bySymbol = new Map<string, BarDataset[]>();
  for (const dataset of datasets) { byId.set(dataset.instrument.id, dataset); const list = bySymbol.get(dataset.instrument.symbol.toUpperCase()) ?? []; if (!list.some(row => row.instrument.id === dataset.instrument.id)) list.push(dataset); bySymbol.set(dataset.instrument.symbol.toUpperCase(), list); }
  const get = (cells: string[], name: string) => { const at = column(name); return at < 0 ? '' : (cells[at] ?? '').trim(); };
  const result = new Map<string, HeatmapMetadata>(); let industryUsed = 0;
  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    try {
      const idText = idAt >= 0 ? get(cells, 'instrumentid') : '', symbolText = symbolAt >= 0 ? get(cells, 'symbol').toUpperCase() : '', exchange = get(cells, 'exchange').toUpperCase();
      let dataset: BarDataset | undefined = idText ? byId.get(idText) : undefined;
      if (!dataset && symbolText) { const matches = (bySymbol.get(symbolText) ?? []).filter(row => !exchange || row.instrument.exchange.toUpperCase() === exchange); const ids = [...new Set(matches.map(row => row.instrument.id))]; if (ids.length > 1) throw new Error(`${symbolText} matches ${ids.length} loaded instruments; add an exchange column.`); dataset = matches[0]; }
      if (!dataset) { diagnostics.push(`Line ${line}: ${idText || symbolText || 'blank'} has no loaded instrument; skipped.`); return; }
      let sector: string | null = get(cells, 'sector') || null; if (!sector) { const industry = get(cells, 'industry'); if (industry) { sector = industry; industryUsed++; } }
      const asOf = metadataTime(get(cells, 'asof'), now, 'asOf'), availableAt = metadataTime(get(cells, 'availableat'), Math.max(now, asOf), 'availableAt');
      result.set(dataset.instrument.id, { instrumentId: dataset.instrument.id, marketCap: metadataNumber(get(cells, 'marketcap'), 'marketCap'), aum: metadataNumber(get(cells, 'aum'), 'aum'), currency: (get(cells, 'currency') || dataset.instrument.currency).toUpperCase(), sector, fundAssetClass: get(cells, 'fundassetclass') || null, asOf, availableAt, source: get(cells, 'source') || source, ...optionalFund(get(cells, 'navtotalreturn'), get(cells, 'topweight')) });
    } catch (cause) { throw new Error(`Line ${line}: ${cause instanceof Error ? cause.message : String(cause)}`); }
  });
  if (industryUsed) diagnostics.push(`${industryUsed} row${industryUsed === 1 ? '' : 's'} had no sector, so the industry text fills the sector slot.`);
  if (!result.size) throw new Error('No CSV row matched a loaded instrument. ' + diagnostics.slice(0, 3).join(' '));
  const metadata = [...result.values()];
  restoreHeatmapState({ ...createHeatmapState(), metadata });
  return { metadata, diagnostics };
}
/** Imported rows replace existing rows for the same instrument; other rows stay. */
export function mergeHeatmapMetadata(existing: readonly HeatmapMetadata[], incoming: readonly HeatmapMetadata[]): HeatmapMetadata[] {
  const ids = new Set(incoming.map(row => row.instrumentId));
  return [...existing.filter(row => !ids.has(row.instrumentId)), ...incoming].map(row => ({ ...row }));
}
