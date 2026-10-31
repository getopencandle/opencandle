import type { LocalAlert } from './alerts';
import type { AlertObservationBinding, AlertScalarSource, AlertSourceSnapshot } from './alert-observation';
import { validateChartSourceBasisIdentity } from '../chart/source-context';

export const ALERT_MANAGER_QUERY_MAX_UNITS = 256;
export type AlertManagerStatusFilter = 'all' | LocalAlert['status'];
export type AlertManagerSourceFilter = 'all' | 'price' | 'indicator' | 'drawing' | 'comparison' | 'legacy';
export type AlertManagerModeFilter = 'all' | 'ordinary' | 'replay';
export interface AlertManagerFilter {
  query: string;
  status: AlertManagerStatusFilter;
  sourceType: AlertManagerSourceFilter;
  mode: AlertManagerModeFilter;
}
export const DEFAULT_ALERT_MANAGER_FILTER: Readonly<AlertManagerFilter> = Object.freeze({
  query: '', status: 'all', sourceType: 'all', mode: 'all',
});

const filterKeys = ['query', 'status', 'sourceType', 'mode'] as const;
const statuses: readonly string[] = ['all', 'active', 'paused', 'stopped', 'expired', 'waiting-for-data'];
const sourceTypes: readonly string[] = ['all', 'price', 'indicator', 'drawing', 'comparison', 'legacy'];
const modes: readonly string[] = ['all', 'ordinary', 'replay'];

/** Snapshot only the view tuple. This neither validates nor authorizes saved alerts. */
export function validateAlertManagerFilter(input: unknown): Readonly<AlertManagerFilter> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new Error('Alert search requires a plain filter record.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(input), keys = Reflect.ownKeys(descriptors);
  if (keys.length !== filterKeys.length || keys.some(key => typeof key !== 'string' || !filterKeys.includes(key as typeof filterKeys[number]))) {
    throw new Error('Alert search requires only query, status, sourceType and mode.');
  }
  for (const key of filterKeys) {
    const property = descriptors[key];
    if (!property || !property.enumerable || !Object.hasOwn(property, 'value')) throw new Error('Alert search filters must contain own data values.');
  }
  const query: unknown = descriptors.query.value, status: unknown = descriptors.status.value;
  const sourceType: unknown = descriptors.sourceType.value, mode: unknown = descriptors.mode.value;
  if (typeof query !== 'string' || query.length > ALERT_MANAGER_QUERY_MAX_UNITS) {
    throw new Error(`Search alerts using at most ${ALERT_MANAGER_QUERY_MAX_UNITS} UTF-16 code units.`);
  }
  if (typeof status !== 'string' || !statuses.includes(status)) throw new Error('Choose a supported alert status filter.');
  if (typeof sourceType !== 'string' || !sourceTypes.includes(sourceType)) throw new Error('Choose a supported saved source type.');
  if (typeof mode !== 'string' || !modes.includes(mode)) throw new Error('Choose All, Ordinary or Replay alerts.');
  return Object.freeze({ query, status: status as AlertManagerStatusFilter, sourceType: sourceType as AlertManagerSourceFilter, mode: mode as AlertManagerModeFilter });
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum) throw new Error('Saved alert search metadata is invalid or oversized.');
  return value;
}

// Binding schema 2 contains chart-basis tuple version 1. These are different versions.
const version1Fields = { instrument: 0, provider: 1, dataset: 2 } as const;
const version2Fields = { instrument: 1, symbol: 2, exchange: 4, provider: 8, dataset: 9 } as const;
interface SavedDatasetMetadata { provider: string; dataset: string; symbol?: string; exchange?: string; }

/** Tuple-only admission: never traverse captured inputs, drawing geometry or history. */
function savedDatasetMetadata(binding: AlertObservationBinding, instrumentId: string): SavedDatasetMetadata {
  const key = text(binding.datasetKey, 100000);
  if (binding.schemaVersion === 2) {
    validateChartSourceBasisIdentity(key);
    const tuple = JSON.parse(key) as (string | number | boolean)[];
    if (tuple[version2Fields.instrument] !== instrumentId || tuple[17] !== binding.fixture) throw new Error('Saved alert source metadata disagrees with its identity.');
    const symbol = tuple[version2Fields.symbol] as string, exchange = tuple[version2Fields.exchange] as string;
    return { symbol, exchange, provider: tuple[version2Fields.provider] as string, dataset: tuple[version2Fields.dataset] as string };
  }
  if (binding.schemaVersion !== 1) throw new Error('Unsupported saved alert source metadata version.');
  let tuple: unknown;
  try { tuple = JSON.parse(key); } catch { throw new Error('Invalid saved alert source metadata JSON.'); }
  // Exact tuple checks from validateAlertBinding's v1 branch, without full source validation.
  if (!Array.isArray(tuple) || tuple.length !== 8 || tuple.some(value => typeof value !== 'string' || !value.length || value.length > 4096) || JSON.stringify(tuple) !== key) {
    throw new Error('Invalid or noncanonical saved alert source metadata.');
  }
  if (tuple[version1Fields.instrument] !== instrumentId) throw new Error('Saved alert source metadata disagrees with its identity.');
  return { provider: tuple[version1Fields.provider], dataset: tuple[version1Fields.dataset] };
}

export function alertSourceType(source: AlertSourceSnapshot | undefined): Exclude<AlertManagerSourceFilter, 'all'> {
  if (!source) return 'legacy';
  switch (source.kind) {
    case 'price': return 'price';
    case 'indicator': case 'script': case 'footprint': return 'indicator';
    case 'drawing': case 'drawing-boundary': return 'drawing';
    case 'comparison': return [source.left, source.right].some(side => side.kind === 'drawing' || side.kind === 'drawing-boundary') ? 'drawing' : 'comparison';
    // An all-conditions alert is listed with comparisons when a condition compares two sources, else by what it reads.
    case 'all': { const types = source.members.map(member => alertSourceType(member)); return types.includes('comparison') ? 'comparison' : types.includes('indicator') ? 'indicator' : 'price'; }
    default: throw new Error('Unsupported saved alert source type.');
  }
}

function scalarFields(source: AlertScalarSource): string[] {
  switch (source.kind) {
    case 'price': return ['price', text(source.field, 100), ...(source.transformId === undefined ? [] : [text(source.transformId, 200)])];
    case 'indicator': return ['indicator', text(source.indicator, 100), text(source.plotId, 100), text(source.instanceId, 200), text(source.snapshotId, 100), text(source.transformId, 200)];
    case 'drawing': return ['drawing', text(source.tool, 100), text(source.instanceId, 200), text(source.snapshotId, 100)];
    case 'drawing-boundary': return ['drawing-boundary', text(source.geometry.tool, 100), text(source.instanceId, 200), text(source.snapshotId, 100)];
    case 'footprint': return ['footprint', text(source.metric, 100), text(source.instanceId, 200), text(source.snapshotId, 100)];
    default: throw new Error('Unsupported saved scalar alert source type.');
  }
}

function searchableFields(alert: LocalAlert): string[] {
  const definition = alert.definition;
  const fields = [text(definition.name, 200), text(definition.message, 4000), text(definition.instrumentId, 500), text(definition.sourceId, 500)];
  const binding = definition.observationBinding;
  if (!binding) return fields;
  const metadata = savedDatasetMetadata(binding, definition.instrumentId);
  if (metadata.symbol !== undefined) fields.push(metadata.symbol, metadata.exchange!, `${metadata.exchange}:${metadata.symbol}`);
  fields.push(metadata.provider, metadata.dataset);
  const source = binding.source;
  const sourceFields = (row: AlertSourceSnapshot): string[] => row.kind === 'comparison' ? ['comparison', text(row.snapshotId, 100), ...scalarFields(row.left), ...scalarFields(row.right)] : row.kind === 'all' ? ['all conditions', text(row.snapshotId, 100), ...row.members.flatMap(sourceFields)] : scalarFields(row);
  fields.push(...sourceFields(source));
  return fields;
}

/**
 * View only, over already validated application alerts. The returned rows preserve
 * identity/order and confer no publication or source authority. No history, bars,
 * frozen settings or live chart metadata are read. Filter errors are for the UI to
 * display with zero matching rows; they never imply an empty saved collection.
 */
export function filterAlertManagerAlerts(alerts: readonly LocalAlert[], input: Readonly<AlertManagerFilter>): readonly LocalAlert[] {
  const filter = validateAlertManagerFilter(input);
  if (!Array.isArray(alerts) || alerts.length > 10000) throw new Error('Alert search requires the existing bounded saved collection.');
  const query = filter.query.trim().toLowerCase();
  if (!query && filter.status === 'all' && filter.sourceType === 'all' && filter.mode === 'all') return alerts;
  const result: LocalAlert[] = [];
  for (const alert of alerts) {
    if (filter.status !== 'all' && alert.status !== filter.status || filter.mode !== 'all' && alert.definition.mode !== filter.mode) continue;
    if (filter.sourceType !== 'all' && alertSourceType(alert.definition.observationBinding?.source) !== filter.sourceType) continue;
    if (query && !searchableFields(alert).some(field => field.toLowerCase().includes(query))) continue;
    result.push(alert);
  }
  return result;
}

export type AlertManagerSortKey = 'original' | 'ticker' | 'name' | 'message' | 'created' | 'triggered';
export type AlertManagerSortDirection = 'asc' | 'desc';
export interface AlertManagerSort { key: AlertManagerSortKey; direction: AlertManagerSortDirection; }
/** Original order is an LV compatibility default; reference defaults remain unknown. */
export const DEFAULT_ALERT_MANAGER_SORT: Readonly<AlertManagerSort> = Object.freeze({ key: 'original', direction: 'asc' });
const sortKeys: readonly string[] = ['original', 'ticker', 'name', 'message', 'created', 'triggered'];

/** Keep sorting separate from the existing closed four-field search tuple. */
export function validateAlertManagerSort(input: unknown): Readonly<AlertManagerSort> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new Error('Alert sorting requires a plain sort record.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(input), keys = Reflect.ownKeys(descriptors);
  if (keys.length !== 2 || keys.some(key => key !== 'key' && key !== 'direction')) throw new Error('Alert sorting requires only key and direction.');
  for (const key of ['key', 'direction']) {
    const property = descriptors[key];
    if (!property || !property.enumerable || !Object.hasOwn(property, 'value')) throw new Error('Alert sorting requires own data values.');
  }
  const key: unknown = descriptors.key.value, direction: unknown = descriptors.direction.value;
  if (typeof key !== 'string' || !sortKeys.includes(key)) throw new Error('Choose a supported alert sort key.');
  if (direction !== 'asc' && direction !== 'desc') throw new Error('Choose an ascending or descending alert sort direction.');
  return Object.freeze({ key: key as AlertManagerSortKey, direction });
}

function sortText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum) throw new Error('Saved alert sort metadata is invalid or oversized.');
  return value.toLowerCase();
}

function sortTime(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Saved alert sort time must be a nonnegative safe integer.');
  return value;
}

function selectedSortValue(alert: LocalAlert, key: Exclude<AlertManagerSortKey, 'original'>): string | number | null {
  if (key === 'triggered') {
    const value = alert.lastTriggeredAt;
    return value === null ? null : sortTime(value);
  }
  const definition = alert.definition;
  if (key === 'name') return sortText(definition.name, 200);
  if (key === 'message') return sortText(definition.message, 4000);
  if (key === 'created') return sortTime(definition.createdAt);
  const instrument = text(definition.instrumentId, 500);
  if (!instrument.length) throw new Error('Saved alert sort metadata requires its instrument identity.');
  const binding = definition.observationBinding;
  const symbol = binding === undefined ? undefined : savedDatasetMetadata(binding, instrument).symbol;
  return sortText(symbol ?? instrument, symbol === undefined ? 500 : 4096);
}

/**
 * View only over validated application alerts. Original order returns its input;
 * other keys sort fresh references after one bounded scalar preparation pass.
 * No history/source graph is read, and the result grants no mutation authority.
 * The LV trigger key is saved lastTriggeredAt, including null after edits that
 * retain history. Null stays last and original-index ties never reverse.
 */
export function sortAlertManagerAlerts(alerts: readonly LocalAlert[], input: Readonly<AlertManagerSort>): readonly LocalAlert[] {
  const sort = validateAlertManagerSort(input);
  if (!Array.isArray(alerts) || alerts.length > 10000) throw new Error('Alert sorting requires the existing bounded saved collection.');
  const key = sort.key;
  if (key === 'original') return alerts;
  const prepared = alerts.map((alert, index) => ({ alert, index, value: selectedSortValue(alert, key) }));
  prepared.sort((left, right) => {
    if (left.value === null) return right.value === null ? left.index - right.index : 1;
    if (right.value === null) return -1;
    const primary = left.value < right.value ? -1 : left.value > right.value ? 1 : 0;
    return (sort.direction === 'asc' ? primary : -primary) || left.index - right.index;
  });
  return prepared.map(entry => entry.alert);
}
