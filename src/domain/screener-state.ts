import type { BarDataset } from './types';
import type { ScreenerColumn, ScreenerContext, ScreenerFilter, ScreenerSort, ScreenerResult } from './screener';
import { DEFAULT_SCREENER_COLUMNS, runScreener, screenerToCsv } from './screener';
import type { CalendarDocument } from './calendar';
import { isEarningsMetric, screenerEarningsIndex } from './screener-earnings';
import { isFundamentalMetric, screenerFundamentalsIndex, type ScreenerFundamentalsSource } from './screener-fundamentals';
import { isScreenerCurrency, type ScreenerCurrency, type ScreenerFxRates } from './screener-currency';
import type { FlagColor, WatchBook, WatchReference } from '../watchlists/model';
import { watchFlagIndex, watchReferenceForDataset, watchListById, watchListMembers, watchMarketKey, watchMemberKey } from '../watchlists/membership';

/**
 * Optional watchlist or flagged-list scope. `name` is the list name when chosen, kept only to label a list
 * that later disappears. 'source' matches exchange, ticker and the exact bound dataset (and synthetic status);
 * 'market' matches exchange and ticker across loaded sources. Custom lists also require the same synthetic
 * status; flagged lists follow market-wide colors across statuses. Either may need an explicit source choice.
 * The field is omitted for the all-loaded universe, so screens saved before it existed restore unchanged.
 */
export interface ScreenerWatchScope { listId: string; name: string; match: 'source' | 'market'; }
export interface ScreenerUniverseSelection {
  resolution: string | null;
  currency: string | null;
  assets: Array<'stock' | 'etf'>;
  excludedInstrumentIds: string[];
  sourceChoices: Record<string, string>;
  watchlist?: ScreenerWatchScope;
}
export interface ScreenerWatchMemberReport { reference: WatchReference; status: 'loaded' | 'unbound' | 'source-not-loaded' | 'outside-scope'; reason: string; }
/** 'empty' is a list with no symbols; 'missing-list' and 'not-connected' mean membership is unavailable. */
export interface ScreenerWatchUniverseReport {
  listId: string; name: string; match: 'source' | 'market';
  state: 'ready' | 'empty' | 'missing-list' | 'not-connected'; reason: string;
  members: number; loaded: number; unbound: number; notLoaded: number; outsideScope: number;
  details: ScreenerWatchMemberReport[];
}
export interface ScreenerConfiguration {
  columns: ScreenerColumn[];
  filters: ScreenerFilter[];
  sort: ScreenerSort;
  universe: ScreenerUniverseSelection;
  filtersHidden: boolean;
  view: 'table';
  /** Chart grid size as columns x rows; absent means Auto (fill by width). */
  chartGrid?: ScreenerGridSize;
  /** Currency menu choice; absent means Default (each row in its instrument currency). */
  currency?: ScreenerCurrency;
}
/** Grid sizes for the result chart grid (columns x rows per visible screen). */
export const SCREENER_GRID_SIZES = ['2x2', '3x2', '3x3', '4x3', '4x4', '5x4'] as const;
export type ScreenerGridSize = typeof SCREENER_GRID_SIZES[number];
/** Columns and rows of a grid size; null for Auto. */
export function screenerGridDimensions(size: ScreenerGridSize | undefined): { columns: number; rows: number } | null {
  if (!size) return null; const [columns, rows] = size.split('x').map(Number); return { columns, rows };
}
export interface SavedScreenerScreen {
  id: string;
  name: string;
  configuration: ScreenerConfiguration;
  revision: number;
  savedAt: number;
}
/** Working configuration is kept at the top level for legacy workspace migration. */
export interface ScreenerSettings extends ScreenerConfiguration {
  schemaVersion: 2;
  name: string;
  activeScreenId: string | null;
  screens: SavedScreenerScreen[];
  recentIds: string[];
  autosave: boolean;
}
export interface ScreenerUniverseMember {
  instrumentId: string;
  symbol: string;
  candidates: BarDataset[];
  selected: BarDataset | null;
  selectedKey: string | null;
  status: 'selected' | 'excluded' | 'missing-resolution' | 'ambiguous' | 'missing-bound-source';
  /** Present (true) when a saved pin was not used because an exact-source list binds another source. Save keeps that pin. */
  pinOverridden?: true;
  reason: string;
}
export interface ScreenerUniverseResult {
  datasets: BarDataset[];
  members: ScreenerUniverseMember[];
  coverage: { loadedDatasets: number; loadedInstruments: number; inScope: number; selected: number; unresolved: number; explicitlyExcluded: number; outsideAssetOrCurrency: number; outsideWatchlist: number | null };
  watchlist: ScreenerWatchUniverseReport | null;
}
export interface SavedScreenerResult { universe: ScreenerUniverseResult; result: ScreenerResult; }
export interface ScreenerUndoState { past: ScreenerConfiguration[]; future: ScreenerConfiguration[]; }
export interface ScreenerTransfer { format: 'lv-screener-screens'; version: 1; screens: Array<{ name: string; configuration: ScreenerConfiguration }>; }
export interface ScreenerImportPreview { transfer: ScreenerTransfer; text: string; settingsFingerprint: string; }

export const SCREENER_STATE_LIMITS = { bytes: 20 * 1024 * 1024, historyBytes: 20 * 1024 * 1024, nodes: 500000, depth: 24, screens: 200, columns: 100, filters: 500, sourceChoices: 10000, undo: 100, recent: 5 } as const;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const text = (value: unknown, max = 200): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const safeId = (value: unknown): value is string => text(value, 128) && !['__proto__', 'prototype', 'constructor'].includes(value);
const clone = <T>(value: T): T => structuredClone(value);
function assertKeys(value: Record<string, unknown>, allowed: string[]): void { if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unsupported screener state field.'); }
function assertJson(value: unknown): void {
  const stack = [{ value, depth: 0 }]; let count = 0;
  while (stack.length) {
    const entry = stack.pop()!;
    if (++count > SCREENER_STATE_LIMITS.nodes || entry.depth > SCREENER_STATE_LIMITS.depth) throw new Error('Screener state exceeds its JSON record or nesting limit.');
    const item = entry.value;
    if (item === null || typeof item === 'string' || typeof item === 'boolean') continue;
    if (typeof item === 'number') { if (!Number.isFinite(item)) throw new Error('Screener state contains a nonfinite number.'); continue; }
    if (!Array.isArray(item) && !object(item)) throw new Error('Screener state requires plain JSON values.');
    for (const [key, property] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (property.get || property.set || ['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Screener state contains unsafe properties.');
      stack.push({ value: property.value, depth: entry.depth + 1 });
    }
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > SCREENER_STATE_LIMITS.bytes) throw new Error('Screener state exceeds 20 MiB UTF-8.');
}
function timestamp(now: number): void { if (!Number.isSafeInteger(now) || now < 0 || now > 253402300799) throw new Error('A valid local save timestamp is required.'); }
function name(value: unknown): asserts value is string { if (!text(value, 100) || value.trim() !== value || !value.trim()) throw new Error('Screen name requires 1 to 100 characters without outer spaces.'); }

export function createScreenerConfiguration(): ScreenerConfiguration {
  return { columns: clone(DEFAULT_SCREENER_COLUMNS), filters: [], sort: { columnId: 'symbol', direction: 'asc' }, universe: { resolution: '1D', currency: 'USD', assets: ['stock', 'etf'], excludedInstrumentIds: [], sourceChoices: {} }, filtersHidden: false, view: 'table' };
}
export function createScreenerSettings(): ScreenerSettings {
  const configuration = createScreenerConfiguration();
  return { ...clone(configuration), schemaVersion: 2, name: 'Loaded stocks and ETFs', activeScreenId: 'local-default-screen', screens: [{ id: 'local-default-screen', name: 'Loaded stocks and ETFs', configuration, revision: 1, savedAt: 0 }], recentIds: ['local-default-screen'], autosave: false };
}
export function screenerDatasetKey(dataset: BarDataset): string {
  const values = [dataset.instrument.id, dataset.instrument.exchange, dataset.provenance.providerId, dataset.provenance.datasetId, dataset.resolution, dataset.instrument.currency, dataset.provenance.adjustment, dataset.provenance.session, dataset.provenance.timezone, dataset.instrument.assetClass];
  if (values.some(value => !text(value, 4096)) || typeof dataset.provenance.fixture !== 'boolean') throw new Error('Incomplete screener source identity.');
  if (!text(dataset.provenance.coverage, 4096)) throw new Error('Incomplete or excessive screener coverage identity.');
  const key = JSON.stringify([...values, dataset.provenance.fixture, dataset.provenance.coverage]);
  if (key.length > 30000) throw new Error('Screener source identity exceeds local bounds.');
  return key;
}
function validateSourceKey(value: unknown, instrumentId: string): void {
  if (!text(value, 30000)) throw new Error('Invalid screener source choice.');
  let parts: unknown; try { parts = JSON.parse(value); } catch { throw new Error('Invalid screener source key JSON.'); }
  // Earlier 11-field keys remain retained, but cannot match a current coverage-bound source.
  if (!Array.isArray(parts) || ![11, 12].includes(parts.length) || parts.slice(0, 10).some(part => !text(part, 4096)) || typeof parts[10] !== 'boolean' || parts.length === 12 && !text(parts[11], 4096) || parts[0] !== instrumentId || JSON.stringify(parts) !== value) throw new Error('Screener source key and instrument identity disagree.');
}
export function validateScreenerUniverse(value: unknown): asserts value is ScreenerUniverseSelection {
  if (!object(value)) throw new Error('Invalid screener universe.');
  assertKeys(value, ['resolution', 'currency', 'assets', 'excludedInstrumentIds', 'sourceChoices', 'watchlist']);
  if (Object.hasOwn(value, 'watchlist')) {
    const scope = value.watchlist;
    if (!object(scope)) throw new Error('Invalid screener watchlist scope.');
    assertKeys(scope, ['listId', 'name', 'match']);
    if (!text(scope.listId, 200) || ['__proto__', 'prototype', 'constructor'].includes(scope.listId) || !text(scope.name, 200) || !['source', 'market'].includes(scope.match as string)) throw new Error('Screener watchlist scope needs a list identity, a name of at most 200 characters and a source or market match.');
  }
  if (value.resolution !== null && !text(value.resolution, 64) || value.currency !== null && !text(value.currency, 20) || !Array.isArray(value.assets) || !value.assets.length || value.assets.length > 2 || new Set(value.assets).size !== value.assets.length || value.assets.some(asset => !['stock', 'etf'].includes(asset)) || !Array.isArray(value.excludedInstrumentIds) || value.excludedInstrumentIds.length > SCREENER_STATE_LIMITS.sourceChoices || value.excludedInstrumentIds.some(id => !text(id, 4096) || ['__proto__', 'constructor', 'prototype'].includes(id)) || new Set(value.excludedInstrumentIds).size !== value.excludedInstrumentIds.length || !object(value.sourceChoices) || Object.keys(value.sourceChoices).length > SCREENER_STATE_LIMITS.sourceChoices) throw new Error('Invalid or excessive screener universe selection.');
  for (const [id, key] of Object.entries(value.sourceChoices)) { if (!text(id, 4096) || ['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('Invalid screener instrument identity.'); validateSourceKey(key, id); }
}
export function validateScreenerConfiguration(value: unknown): asserts value is ScreenerConfiguration {
  if (!object(value)) throw new Error('Invalid screener configuration.');
  assertKeys(value, ['columns', 'filters', 'sort', 'universe', 'filtersHidden', 'view', 'chartGrid', 'currency']);
  if (value.chartGrid !== undefined && !(SCREENER_GRID_SIZES as readonly unknown[]).includes(value.chartGrid)) throw new Error('Invalid screener chart grid size.');
  if (value.currency !== undefined && !isScreenerCurrency(value.currency)) throw new Error('Invalid screener currency.');
  if (!Array.isArray(value.columns) || !value.columns.length || value.columns.length > SCREENER_STATE_LIMITS.columns || !Array.isArray(value.filters) || value.filters.length > SCREENER_STATE_LIMITS.filters || !object(value.sort) || !safeId(value.sort.columnId) || !['asc', 'desc'].includes(value.sort.direction as string) || typeof value.filtersHidden !== 'boolean' || value.view !== 'table') throw new Error('Invalid screener columns, filters, sorting or view.');
  assertKeys(value.sort, ['columnId', 'direction']);
  validateScreenerUniverse(value.universe);
  const checked = runScreener([], value.columns as unknown as ScreenerColumn[], value.filters as unknown as ScreenerFilter[], value.sort as unknown as ScreenerSort);
  if (checked.diagnostics.length) throw new Error(checked.diagnostics.map(row => row.message).join(' '));
}
export function screenerConfiguration(settings: ScreenerConfiguration): ScreenerConfiguration {
  return clone({ columns: settings.columns, filters: settings.filters, sort: settings.sort, universe: settings.universe, filtersHidden: settings.filtersHidden, view: settings.view, ...(settings.chartGrid ? { chartGrid: settings.chartGrid } : {}), ...(settings.currency ? { currency: settings.currency } : {}) });
}
export function restoreScreenerSettings(input: unknown): ScreenerSettings {
  assertJson(input);
  if (!object(input)) throw new Error('Saved screener settings must be an object.');
  if (input.schemaVersion === undefined) {
    assertKeys(input, ['columns', 'filters', 'sort']);
    const base = createScreenerSettings(), configuration = { ...screenerConfiguration(base), columns: input.columns, filters: input.filters, sort: input.sort };
    validateScreenerConfiguration(configuration);
    base.screens[0].configuration = clone(configuration); return { ...base, ...clone(configuration) };
  }
  assertKeys(input, ['schemaVersion', 'columns', 'filters', 'sort', 'universe', 'filtersHidden', 'view', 'chartGrid', 'currency', 'name', 'activeScreenId', 'screens', 'recentIds', 'autosave']);
  if (input.schemaVersion !== 2 || typeof input.autosave !== 'boolean' || !Array.isArray(input.screens) || input.screens.length > SCREENER_STATE_LIMITS.screens || !Array.isArray(input.recentIds) || input.recentIds.length > SCREENER_STATE_LIMITS.recent || new Set(input.recentIds).size !== input.recentIds.length || input.activeScreenId !== null && !safeId(input.activeScreenId)) throw new Error('Invalid saved-screen collection.');
  name(input.name);
  validateScreenerConfiguration(screenerConfiguration(input as unknown as ScreenerSettings));
  const ids = new Set<string>();
  for (const screen of input.screens) {
    if (!object(screen)) throw new Error('Invalid saved screen.');
    assertKeys(screen, ['id', 'name', 'configuration', 'revision', 'savedAt']); name(screen.name);
    if (!safeId(screen.id) || ids.has(screen.id) || !Number.isSafeInteger(screen.revision) || (screen.revision as number) < 1) throw new Error('Invalid or duplicated saved-screen identity/revision.');
    timestamp(screen.savedAt as number); ids.add(screen.id); validateScreenerConfiguration(screen.configuration);
  }
  if (input.activeScreenId !== null && !ids.has(input.activeScreenId as string) || input.recentIds.some(id => !ids.has(id))) throw new Error('Saved screen selection refers to a missing identity.');
  return clone(input as unknown as ScreenerSettings);
}
// Exact-source and custom-list market keys retain synthetic status. Flagged market scope uses the color's market identity.
const sourceMatchKey = (reference: Pick<WatchReference, 'exchange' | 'symbol' | 'datasetId'>, synthetic: boolean) => JSON.stringify([watchMemberKey({ ...reference, dailyDatasetId: null, synthetic }), synthetic]);
const marketMatchKey = (reference: Pick<WatchReference, 'exchange' | 'symbol'>, synthetic: boolean) => JSON.stringify([watchMarketKey(reference), synthetic]);
/** Watchlist scope. Membership never substitutes a source: unbound members and unloaded sources stay reported, not fabricated. */
function scopeToWatchlist(datasets: readonly BarDataset[], selection: ScreenerUniverseSelection, book: WatchBook | null | undefined): { datasets: readonly BarDataset[]; report: ScreenerWatchUniverseReport | null; members: WatchReference[] } {
  const scope = selection.watchlist;
  if (!scope) return { datasets, report: null, members: [] };
  const report: ScreenerWatchUniverseReport = { listId: scope.listId, name: scope.name, match: scope.match, state: 'ready', reason: '', members: 0, loaded: 0, unbound: 0, notLoaded: 0, outsideScope: 0, details: [] };
  if (!book) return { datasets: [], members: [], report: { ...report, state: 'not-connected', reason: 'The local watchlist book is not connected to this screener. Watchlist membership is unavailable; no symbols were assumed.' } };
  let members: WatchReference[];
  try { report.name = watchListById(book, scope.listId).name; members = watchListMembers(book, scope.listId); }
  catch { return { datasets: [], members: [], report: { ...report, state: 'missing-list', reason: `The list "${scope.name}" no longer exists. Membership is unavailable; choose a current list.` } }; }
  report.members = members.length;
  if (!members.length) return { datasets: [], members, report: { ...report, state: 'empty', reason: `"${report.name}" has no symbols. The universe is empty, not unavailable.` } };
  // A flag belongs to exchange+ticker, not to the source through which it was set. This only admits candidates;
  // resolveScreenerUniverse still enforces exact pins and ambiguity without changing source provenance.
  const flaggedMarket = scope.listId.startsWith('flag:') && scope.match === 'market';
  const marketKey = (reference: Pick<WatchReference, 'exchange' | 'symbol'>, synthetic: boolean) => flaggedMarket ? watchMarketKey(reference) : marketMatchKey(reference, synthetic);
  // One index per evaluation: O(datasets + members) instead of comparing every member with every dataset.
  const index = new Map<string, BarDataset[]>();
  for (const dataset of datasets) { const key = scope.match === 'source' ? sourceMatchKey({ exchange: dataset.instrument.exchange, symbol: dataset.instrument.symbol, datasetId: dataset.provenance.datasetId }, dataset.provenance.fixture) : marketKey(dataset.instrument, dataset.provenance.fixture); const group = index.get(key) ?? []; group.push(dataset); index.set(key, group); }
  const inScope = (dataset: BarDataset) => selection.assets.includes(dataset.instrument.assetClass as 'stock' | 'etf') && (selection.currency === null || dataset.instrument.currency === selection.currency) && (selection.resolution === null || dataset.resolution === selection.resolution);
  const scoped = new Set<BarDataset>();
  for (const reference of members) {
    const found = scope.match === 'source' ? reference.datasetId === null ? [] : index.get(sourceMatchKey(reference, reference.synthetic)) ?? [] : index.get(marketKey(reference, reference.synthetic)) ?? [], eligible = found.filter(inScope);
    found.forEach(dataset => scoped.add(dataset));
    const status: ScreenerWatchMemberReport['status'] = eligible.length ? 'loaded' : found.length ? 'outside-scope' : scope.match === 'source' && reference.datasetId === null ? 'unbound' : 'source-not-loaded';
    const where = `${reference.exchange}:${reference.symbol}`;
    const reason = status === 'loaded' ? `${eligible.length} loaded source${eligible.length === 1 ? '' : 's'} match.` : status === 'outside-scope' ? `${where} is loaded only outside the selected asset class, currency or resolution.` : status === 'unbound' ? `${where} has no bound source in the list. Bind a source in the watchlist, or match by exchange and ticker.` : scope.match === 'source' ? `Bound source ${reference.datasetId} for ${where} is not loaded.` : flaggedMarket ? `No loaded source for flagged market ${where}.` : `No loaded ${reference.synthetic ? 'synthetic' : 'supplied'} source for ${where}.`;
    report.details.push({ reference: structuredClone(reference), status, reason });
    if (status === 'loaded') report.loaded++; else if (status === 'outside-scope') report.outsideScope++; else if (status === 'unbound') report.unbound++; else report.notLoaded++;
  }
  return { datasets: datasets.filter(dataset => scoped.has(dataset)), report, members };
}
export function resolveScreenerUniverse(datasets: readonly BarDataset[], selection: ScreenerUniverseSelection, watchBook?: WatchBook | null): ScreenerUniverseResult {
  validateScreenerUniverse(selection);
  const all = new Set(datasets.map(row => row.instrument.id)), scope = scopeToWatchlist(datasets, selection, watchBook), scopedIds = new Set(scope.datasets.map(row => row.instrument.id));
  const eligible = new Map<string, BarDataset[]>(), excluded = new Set(selection.excludedInstrumentIds);
  for (const dataset of scope.datasets) if (selection.assets.includes(dataset.instrument.assetClass as 'stock' | 'etf') && (selection.currency === null || dataset.instrument.currency === selection.currency)) { const group = eligible.get(dataset.instrument.id) ?? []; group.push(dataset); eligible.set(dataset.instrument.id, group); }
  const outsideAssetOrCurrency = scopedIds.size - eligible.size;
  const listedSources = new Set(scope.members.map(reference => JSON.stringify([reference.exchange, reference.datasetId])));
  for (const [id, key] of Object.entries(selection.sourceChoices)) {
    const parts = JSON.parse(key) as Array<string | boolean>;
    // Under a watchlist scope a pinned source that is not loaded stays visible only when the list holds that exchange and dataset.
    const listed = !selection.watchlist || listedSources.has(JSON.stringify([parts[1], parts[3]]));
    if (!eligible.has(id) && listed && selection.assets.includes(parts[9] as 'stock' | 'etf') && (selection.currency === null || selection.currency === parts[5])) eligible.set(id, []);
  }
  const result: ScreenerUniverseResult = { datasets: [], members: [], coverage: { loadedDatasets: datasets.length, loadedInstruments: all.size, inScope: 0, selected: 0, unresolved: 0, explicitlyExcluded: 0, outsideAssetOrCurrency, outsideWatchlist: !selection.watchlist ? 0 : scope.report?.state === 'ready' || scope.report?.state === 'empty' ? all.size - scopedIds.size : null }, watchlist: scope.report };
  for (const [instrumentId, group] of eligible) {
    const pinned = selection.sourceChoices[instrumentId], pinParts = pinned ? JSON.parse(pinned) as Array<string | boolean> : null;
    // Under exact-source list scope the list binding decides; a pin to a source the list does not hold is reported and not used.
    const overridden = !!pinParts && selection.watchlist?.match === 'source' && !listedSources.has(JSON.stringify([pinParts[1], pinParts[3]]));
    const candidates = group.filter(dataset => selection.resolution === null || dataset.resolution === selection.resolution), chosen = overridden ? undefined : pinned;
    const member: ScreenerUniverseMember = { instrumentId, symbol: group[0]?.instrument.symbol ?? instrumentId, candidates, selected: null, selectedKey: null, status: 'ambiguous', reason: '' };
    if (excluded.has(instrumentId)) { member.status = 'excluded'; member.reason = 'Explicitly excluded from this screen.'; result.coverage.explicitlyExcluded++; }
    else {
      result.coverage.inScope++;
      const matches = chosen ? candidates.filter(dataset => screenerDatasetKey(dataset) === chosen) : candidates;
      if (matches.length === 1) { member.selected = matches[0]; member.selectedKey = screenerDatasetKey(matches[0]); member.status = 'selected'; member.reason = chosen ? 'Exact saved source selection.' : 'Only one eligible supplied source.'; result.datasets.push(matches[0]); result.coverage.selected++; }
      else {
        member.status = chosen && !matches.length ? 'missing-bound-source' : !candidates.length ? 'missing-resolution' : 'ambiguous';
        member.reason = member.status === 'missing-bound-source' ? chosen && JSON.parse(chosen).length === 11 ? 'This older saved source did not record coverage. Explicitly choose its current source basis before evaluation; no coverage was inferred.' : 'The exact saved source or its coverage is unavailable. No replacement provider was selected.' : member.status === 'missing-resolution' ? 'No supplied source at this resolution. No bars were fabricated.' : 'Multiple eligible source datasets require an explicit choice; identical duplicate identities cannot be disambiguated.';
        result.coverage.unresolved++;
      }
    }
    if (overridden) member.pinOverridden = true;
    if (overridden) member.reason = `The saved source pin (${String(pinParts![3])}) is not the source this list binds, so the list binding was used. ${member.reason}`;
    result.members.push(member);
  }
  return result;
}
export function pinScreenerSources(configuration: ScreenerConfiguration, datasets: readonly BarDataset[], watchBook?: WatchBook | null): ScreenerConfiguration {
  const next = screenerConfiguration(configuration), resolved = resolveScreenerUniverse(datasets, next.universe, watchBook);
  for (const member of resolved.members) if (member.selectedKey && !member.pinOverridden) next.universe.sourceChoices[member.instrumentId] = member.selectedKey;
  validateScreenerConfiguration(next); return next;
}
/** O(1) flag reads per row through C04's cached per-book index (flag identity = exchange and ticker). */
export function screenerFlagLookup(watchBook: WatchBook): (market: Pick<WatchReference, 'exchange' | 'symbol'>) => FlagColor | null {
  const colors = watchFlagIndex(watchBook);
  return market => colors.get(watchMarketKey(market)) ?? null;
}
/** Local flag context: the market's flag color or 'none'. Without a book, flag cells stay unavailable. */
export function screenerWatchContext(watchBook?: WatchBook | null): ScreenerContext {
  if (!watchBook) return {};
  const flagOf = screenerFlagLookup(watchBook);
  return { flagOf: dataset => { try { watchReferenceForDataset(dataset); } catch { throw new Error('this exchange or ticker cannot be a watchlist identifier, so it has no flag.'); } return flagOf(dataset.instrument) ?? 'none'; } };
}
/** `calendarDocuments` (local Calendar documents) feed the earnings-date columns; absent means those cells are unavailable. */
/** `fundamentals` (saved, explicitly linked SEC companyfacts) feeds the valuation, dividend and margin columns; absent means those cells are unavailable. */
export function runSavedScreener(datasets: readonly BarDataset[], configuration: ScreenerConfiguration, watchBook?: WatchBook | null, calendarDocuments?: readonly CalendarDocument[] | null, fundamentals?: ScreenerFundamentalsSource | null, fx?: { rates: ScreenerFxRates | null; missingReason?: string } | null): SavedScreenerResult {
  validateScreenerConfiguration(screenerConfiguration(configuration));
  const universe = resolveScreenerUniverse(datasets, configuration.universe, watchBook);
  const context: ScreenerContext = { ...screenerWatchContext(watchBook), ...(calendarDocuments && configuration.columns.some(column => isEarningsMetric(column.metric)) ? { earningsOf: screenerEarningsIndex(calendarDocuments) } : {}), ...(fundamentals && configuration.columns.some(column => isFundamentalMetric(column.metric)) ? { fundamentalsOf: screenerFundamentalsIndex(fundamentals) } : {}), ...(configuration.currency ? { currency: { target: configuration.currency, rates: fx?.rates ?? null, ...(fx?.missingReason ? { missingReason: fx.missingReason } : {}) } } : {}) };
  return { universe, result: runScreener(universe.datasets, configuration.columns, configuration.filters, configuration.sort, context) };
}
/** A configuration replaces the grid size and currency too: one without `chartGrid` (Auto) or `currency` (Default) must not inherit the previous choice. */
function withoutGrid(settings: ScreenerSettings): ScreenerSettings { const copy = clone(settings); delete copy.chartGrid; delete copy.currency; return copy; }
export function replaceScreenerConfiguration(settings: ScreenerSettings, configuration: ScreenerConfiguration): ScreenerSettings {
  assertJson(configuration); validateScreenerConfiguration(configuration);
  return restoreScreenerSettings({ ...withoutGrid(settings), ...clone(configuration) });
}
export function isScreenerDirty(settings: ScreenerSettings): boolean {
  const saved = settings.screens.find(screen => screen.id === settings.activeScreenId);
  return !saved || settings.name !== saved.name || JSON.stringify(screenerConfiguration(settings)) !== JSON.stringify(saved.configuration);
}
function recent(settings: ScreenerSettings, id: string): string[] { return [id, ...settings.recentIds.filter(value => value !== id)].slice(0, SCREENER_STATE_LIMITS.recent); }
export function saveScreenerScreen(settings: ScreenerSettings, now: number, newId?: string, datasets?: readonly BarDataset[], watchBook?: WatchBook | null): ScreenerSettings {
  timestamp(now); name(settings.name);
  const next = restoreScreenerSettings(settings), existing = next.screens.find(screen => screen.id === next.activeScreenId), configuration = datasets ? pinScreenerSources(next, datasets, watchBook) : screenerConfiguration(next);
  if (existing) {
    if (existing.revision >= Number.MAX_SAFE_INTEGER) throw new Error('Saved-screen revision counter is exhausted. Make a new copy.');
    Object.assign(existing, { name: next.name, configuration, revision: existing.revision + 1, savedAt: now });
  } else {
    if (!safeId(newId) || next.screens.some(screen => screen.id === newId)) throw new Error('A unique new saved-screen identity is required.');
    next.screens.push({ id: newId, name: next.name, configuration, revision: 1, savedAt: now }); next.activeScreenId = newId;
  }
  Object.assign(next, clone(configuration)); next.recentIds = recent(next, next.activeScreenId!); return restoreScreenerSettings(next);
}
export function copyScreenerScreen(settings: ScreenerSettings, id: string, copyName: string, now: number, datasets?: readonly BarDataset[], watchBook?: WatchBook | null): ScreenerSettings {
  if (!safeId(id) || settings.screens.some(screen => screen.id === id)) throw new Error('Copy requires a new saved-screen identity.');
  name(copyName);
  return saveScreenerScreen({ ...clone(settings), activeScreenId: null, name: copyName }, now, id, datasets, watchBook);
}
export function renameScreenerScreen(settings: ScreenerSettings, id: string, revision: number, nextName: string, now: number): ScreenerSettings {
  name(nextName); timestamp(now);
  const next = restoreScreenerSettings(settings), screen = next.screens.find(item => item.id === id);
  if (!screen || screen.revision !== revision) throw new Error('The screen changed since rename began. Reopen the action.');
  if (screen.revision >= Number.MAX_SAFE_INTEGER) throw new Error('Saved-screen revision counter is exhausted.');
  screen.name = nextName; screen.revision++; screen.savedAt = now; if (next.activeScreenId === id) next.name = nextName;
  return restoreScreenerSettings(next);
}
export function deleteScreenerScreen(settings: ScreenerSettings, id: string, revision: number): ScreenerSettings {
  const next = restoreScreenerSettings(settings), screen = next.screens.find(item => item.id === id);
  if (!screen || screen.revision !== revision) throw new Error('The screen changed since delete confirmation. Nothing was deleted.');
  next.screens = next.screens.filter(item => item.id !== id); next.recentIds = next.recentIds.filter(value => value !== id);
  if (next.activeScreenId === id) next.activeScreenId = null;
  return restoreScreenerSettings(next);
}
export interface ScreenerSwitchRequest { targetId: string | null; targetRevision: number | null; fingerprint: string; }
export function captureScreenerSwitch(settings: ScreenerSettings, targetId: string | null): ScreenerSwitchRequest {
  const target = settings.screens.find(screen => screen.id === targetId); if (targetId !== null && !target) throw new Error('The selected screen is unavailable.');
  return { targetId, targetRevision: target?.revision ?? null, fingerprint: JSON.stringify(settings) };
}
export function applyScreenerSwitch(settings: ScreenerSettings, request: ScreenerSwitchRequest, choice: 'save' | 'discard' | 'cancel', now: number, newId?: string, datasets?: readonly BarDataset[], watchBook?: WatchBook | null): ScreenerSettings {
  if (choice === 'cancel') return settings;
  if (JSON.stringify(settings) !== request.fingerprint) throw new Error('Working settings changed during the screen-switch confirmation. Review it again.');
  const target = settings.screens.find(screen => screen.id === request.targetId);
  if (request.targetId !== null && (!target || target.revision !== request.targetRevision)) throw new Error('The selected saved screen changed. Reopen the picker.');
  const next = choice === 'save' && isScreenerDirty(settings) ? saveScreenerScreen(settings, now, newId, datasets, watchBook) : restoreScreenerSettings(settings);
  if (request.targetId === null) return restoreScreenerSettings({ ...withoutGrid(next), ...createScreenerConfiguration(), name: 'Untitled screen', activeScreenId: null });
  const selected = next.screens.find(screen => screen.id === request.targetId)!;
  return restoreScreenerSettings({ ...withoutGrid(next), ...clone(selected.configuration), name: selected.name, activeScreenId: selected.id, recentIds: recent(next, selected.id) });
}
/** Retain contiguous newest entries. An entry that cannot fit is a history barrier, never skipped. */
export function boundScreenerHistory(history: ScreenerUndoState, preferred: 'past' | 'future', byteBudget: number = SCREENER_STATE_LIMITS.historyBytes): { history: ScreenerUndoState; droppedSteps: number } {
  if (!Number.isSafeInteger(byteBudget) || byteBudget < 0 || byteBudget > SCREENER_STATE_LIMITS.historyBytes) throw new Error('Invalid screener history byte budget.');
  const kept: ScreenerUndoState = { past: [], future: [] }; let remaining = byteBudget, steps = SCREENER_STATE_LIMITS.undo;
  for (const side of [preferred, preferred === 'past' ? 'future' : 'past'] as const) {
    for (let index = history[side].length - 1; index >= 0 && steps > 0; index--) {
      const bytes = new TextEncoder().encode(JSON.stringify(history[side][index])).byteLength;
      if (bytes > remaining) break;
      kept[side].unshift(history[side][index]); remaining -= bytes; steps--;
    }
  }
  return { history: kept, droppedSteps: history.past.length + history.future.length - kept.past.length - kept.future.length };
}
export function editScreenerWithHistory(settings: ScreenerSettings, history: ScreenerUndoState, configuration: ScreenerConfiguration): { settings: ScreenerSettings; history: ScreenerUndoState; droppedSteps: number } {
  const next = replaceScreenerConfiguration(settings, configuration);
  if (JSON.stringify(screenerConfiguration(settings)) === JSON.stringify(configuration)) return { settings, history, droppedSteps: 0 };
  return { settings: next, ...boundScreenerHistory({ past: [...history.past, screenerConfiguration(settings)], future: [] }, 'past') };
}
export function travelScreenerHistory(settings: ScreenerSettings, history: ScreenerUndoState, direction: 'undo' | 'redo'): { settings: ScreenerSettings; history: ScreenerUndoState; droppedSteps: number } {
  const from = direction === 'undo' ? history.past : history.future, to = direction === 'undo' ? history.future : history.past;
  const configuration = from.at(-1); if (!configuration) return { settings, history, droppedSteps: 0 };
  const moved = [...to, screenerConfiguration(settings)], rest = from.slice(0, -1);
  return { settings: replaceScreenerConfiguration(settings, configuration), ...boundScreenerHistory(direction === 'undo' ? { past: rest, future: moved } : { past: moved, future: rest }, direction === 'undo' ? 'future' : 'past') };
}
export function validateScreenerTransfer(input: unknown): asserts input is ScreenerTransfer {
  assertJson(input); if (!object(input)) throw new Error('Expected an OpenCandle screen configuration document.');
  assertKeys(input, ['format', 'version', 'screens']);
  if (input.format !== 'lv-screener-screens' || input.version !== 1 || !Array.isArray(input.screens) || !input.screens.length || input.screens.length > SCREENER_STATE_LIMITS.screens) throw new Error('Unsupported or empty saved-screen document.');
  for (const screen of input.screens) { if (!object(screen)) throw new Error('Invalid imported screen.'); assertKeys(screen, ['name', 'configuration']); name(screen.name); validateScreenerConfiguration(screen.configuration); }
}
export function previewScreenerImport(content: string): ScreenerTransfer {
  if (typeof content !== 'string' || new TextEncoder().encode(content).byteLength > SCREENER_STATE_LIMITS.bytes) throw new Error('Screen JSON exceeds 20 MiB UTF-8 before parsing.');
  let parsed: unknown; try { parsed = JSON.parse(content); } catch { throw new Error('Screen configuration JSON could not be parsed.'); }
  validateScreenerTransfer(parsed); return clone(parsed);
}
export function exportScreenerScreens(settings: ScreenerSettings, scope: 'current' | 'all'): string {
  const value: ScreenerTransfer = { format: 'lv-screener-screens', version: 1, screens: scope === 'current' ? [{ name: settings.name, configuration: screenerConfiguration(settings) }] : settings.screens.map(screen => ({ name: screen.name, configuration: clone(screen.configuration) })) };
  validateScreenerTransfer(value); return JSON.stringify(value);
}
export function importScreenerScreens(settings: ScreenerSettings, value: ScreenerTransfer, now: number, newId: () => string): ScreenerSettings {
  timestamp(now); validateScreenerTransfer(value); const next = restoreScreenerSettings(settings), ids = new Set(next.screens.map(screen => screen.id));
  for (const screen of value.screens) { const id = newId(); if (!safeId(id) || ids.has(id)) throw new Error('Imported screens require distinct new local identities. Nothing was imported.'); ids.add(id); next.screens.push({ id, name: screen.name, configuration: clone(screen.configuration), savedAt: now, revision: 1 }); }
  return restoreScreenerSettings(next);
}
/** Preview is bound to both the displayed input and the library/working state it will extend. */
export function captureScreenerImportPreview(text: string, settings: ScreenerSettings): ScreenerImportPreview {
  return { transfer: previewScreenerImport(text), text, settingsFingerprint: JSON.stringify(settings) };
}
export function applyScreenerImportPreview(settings: ScreenerSettings, preview: ScreenerImportPreview, currentText: string, now: number, newId: () => string): ScreenerSettings {
  if (preview.text !== currentText || preview.settingsFingerprint !== JSON.stringify(settings)) throw new Error('The input or saved-screen collection changed after preview. Preview it again before Apply.');
  return importScreenerScreens(settings, preview.transfer, now, newId);
}
/** The caller owns effect cleanup. A stale timer can never save or recreate a deleted screen. */
export function scheduleScreenerAutosave(settings: ScreenerSettings, getCurrent: () => ScreenerSettings, commit: (next: ScreenerSettings) => void, now: () => number, datasets?: readonly BarDataset[], onError?: (message: string) => void, watchBook?: WatchBook | null): () => void {
  if (!settings.autosave || !settings.activeScreenId || !settings.screens.some(screen => screen.id === settings.activeScreenId) || !isScreenerDirty(settings)) return () => {};
  const fingerprint = JSON.stringify(settings);
  const timer = setTimeout(() => {
    const current = getCurrent();
    if (!current.autosave || JSON.stringify(current) !== fingerprint || !current.screens.some(screen => screen.id === settings.activeScreenId)) return;
    try { commit(saveScreenerScreen(current, now(), undefined, datasets, watchBook)); } catch (error) { onError?.(error instanceof Error ? error.message : String(error)); }
  }, 2000);
  return () => clearTimeout(timer);
}
export function savedScreenerToCsv(value: SavedScreenerResult, columns: readonly ScreenerColumn[]): string {
  const ids = new Set(columns.map(column => column.id)), sources = new Map(value.universe.datasets.map(dataset => [dataset.instrument.id, dataset]));
  const base = clone(value.result), metadata: ScreenerColumn[] = ['exchange', 'provider', 'dataset', 'coverage', 'revision', 'resolution', 'currency', 'adjustment', 'session', 'timezone', 'synthetic', 'state', 'sourceTime', 'availability'].map(metric => { let id = `lv-export:${metric}`; while (ids.has(id)) id += ':'; ids.add(id); return { id, metric, label: `Source ${metric}` }; });
  for (const row of base.rows) {
    const dataset = sources.get(row.instrumentId)!;
    const values = [dataset.instrument.exchange, dataset.provenance.providerId, dataset.provenance.datasetId, dataset.provenance.coverage, dataset.provenance.revision, dataset.resolution, dataset.instrument.currency, dataset.provenance.adjustment, dataset.provenance.session, dataset.provenance.timezone, dataset.provenance.fixture ? 'synthetic' : 'supplied', dataset.provenance.state, dataset.bars.at(-1)?.time ?? null, 'Final supplied snapshot; publication and completion unknown'];
    metadata.forEach((column, index) => { row.cells[column.id] = { value: values[index], previous: null, state: values[index] === null ? 'unavailable' : 'available', asOf: null }; });
  }
  return screenerToCsv(base, [...columns, ...metadata]);
}
