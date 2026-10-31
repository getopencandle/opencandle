import { csvRows } from './data';
import { DEMO_SYMBOLS, makeFixture } from './fixtures';

export const CALENDAR_KINDS = ['economic', 'earnings', 'dividend', 'ipo', 'split'] as const;
export type CalendarKind = typeof CALENDAR_KINDS[number];
/** `marketCap` and `priorRevisedFrom` were appended later. The visible CSV report keeps every earlier column position and appends the newer columns at the end. */
export const CALENDAR_VALUE_KEYS = ['actual', 'forecast', 'prior', 'epsActual', 'epsForecast', 'revenueActual', 'revenueForecast', 'dividendAmount', 'dividendYield', 'offerPrice', 'sharesOffered', 'sharesOutstanding', 'splitNumerator', 'splitDenominator', 'marketCap', 'priorRevisedFrom'] as const;
export type CalendarValueKey = typeof CALENDAR_VALUE_KEYS[number];
const LEGACY_CSV_VALUE_KEYS = 14;
export const CALENDAR_DERIVED_KEYS = ['epsSurprisePercent', 'revenueSurprisePercent', 'dealAmount', 'ipoMarketCap', 'splitRatio'] as const;
export type CalendarDerivedKey = typeof CALENDAR_DERIVED_KEYS[number];
export const CALENDAR_TEXT_SORT_KEYS = ['date', 'title', 'symbol', 'country', 'importance', 'exchange', 'exDate', 'payDate'] as const;
export type CalendarSortKey = typeof CALENDAR_TEXT_SORT_KEYS[number] | CalendarValueKey | CalendarDerivedKey;
export const CALENDAR_SORT_KEYS: readonly CalendarSortKey[] = [...CALENDAR_TEXT_SORT_KEYS, ...CALENDAR_VALUE_KEYS, ...CALENDAR_DERIVED_KEYS];
/** Array order is the menu order; restore accepts every listed value. */
export const CALENDAR_PERIODS = ['all', 'upcoming', 'past', 'yesterday', 'today', 'tomorrow', 'this-week', 'next-week', 'custom'] as const;
export type CalendarPeriod = typeof CALENDAR_PERIODS[number];
export interface CalendarDatum { value: number | null; unit: string; availableAt: number | null; }
export interface CalendarEvent {
  id: string; revision: number; kind: CalendarKind; title: string; description: string; date: string;
  time: number | null; timezone: string | null; timing: 'exact' | 'date-only' | 'before-open' | 'after-close' | 'unknown';
  symbol: string | null; instrumentId: string | null; country: string | null; category: string | null;
  importance: 'low' | 'medium' | 'high' | null; status: 'scheduled' | 'confirmed' | 'released' | 'cancelled' | 'tentative';
  publishedAt: number | null; fiscalPeriod: string | null; exDate: string | null; payDate: string | null;
  /** Listing venue, mainly for IPOs. Optional; older documents restore it as null. */
  exchange: string | null;
  values: Partial<Record<CalendarValueKey, CalendarDatum>>;
}
export interface CalendarProvenance { kind: 'local-import' | 'synthetic'; label: string; sourceUrl: string | null; importedAt: number; license: string; fixture: boolean; }
export interface CalendarDocument { schemaVersion: 1; id: string; provenance: CalendarProvenance; events: CalendarEvent[]; }
export interface CalendarQuery {
  kind: 'all' | CalendarKind; period: CalendarPeriod;
  from: string | null; to: string | null; timezone: string; countries: string[]; categories: string[]; symbols: string[];
  highImportance: boolean; search: string; includeCancelled: boolean; asOf: number | null;
  sort: { key: CalendarSortKey; direction: 'asc' | 'desc' };
}
export interface CalendarState { schemaVersion: 1; documents: CalendarDocument[]; query: CalendarQuery; }
export interface CalendarValueView { value: number | null; unit: string | null; state: 'available' | 'missing' | 'not-yet-available' | 'unknown-availability'; availableAt: number | null; reason?: string; }
/** One eligible (already published at the cutoff) revision. Values are deliberately omitted. */
export interface CalendarRevisionEntry { revision: number; publishedAt: number | null; status: CalendarEvent['status']; date: string; time: number | null; timing: CalendarEvent['timing']; }
/** A field that differs between the previous eligible revision and the shown one. Value fields use cutoff-masked numbers. */
export interface CalendarRevisionChange { field: string; before: string | number | null; after: string | number | null; unitBefore?: string | null; unitAfter?: string | null; }
export interface CalendarRevisionView { history: CalendarRevisionEntry[]; previousRevision: number | null; changes: CalendarRevisionChange[]; }
export interface CalendarRow { key: string; documentId: string; event: CalendarEvent; provenance: CalendarProvenance; displayDate: string; displayTime: string | null; displayOffset: string | null; publicationUnknown: boolean; values: Record<CalendarValueKey, CalendarValueView>; derived: Record<CalendarDerivedKey, CalendarValueView>; revisions: CalendarRevisionView; }
export interface CalendarResult { rows: CalendarRow[]; coverage: { documents: number; records: number; identities: number; availableEvents: number; matched: number; excluded: number; unavailableAtCutoff: number; unknownPublication: number; hiddenValues: number; synthetic: number; revised: number }; diagnostics: string[]; range: { from: string | null; to: string | null }; }
export interface CalendarImportOptions { documentId?: string; sourceLabel?: string; sourceUrl?: string | null; license?: string; fixture?: boolean; now?: number; maxBytes?: number; maxEvents?: number; }
export interface CalendarImportResult { ok: boolean; document?: CalendarDocument; diagnostics: string[]; rowCount: number; }
export const CALENDAR_STATE_MAX_BYTES = 20 * 1024 * 1024;
export const CALENDAR_POLICIES = [
  'Only local imported events are shown. The empty default contains no invented current events or news. Source coverage and rights remain the importer’s responsibility.',
  'Exact times require a source timezone and are converted for display. Date-only, before-open and after-close events keep their supplied date; no midnight or exchange-session instant is invented.',
  'Date sorting compares exact instants within each displayed date, including repeated DST hours. Events without an exact time follow exact events for the same day in both directions, ordered before open, after close, date only, then unknown.',
  'Each event identity shows its latest revision published by the cutoff. Earlier eligible revisions are listed with the fields that changed; later or undated revisions are never shown under a historical cutoff. A supplied priorRevisedFrom value is the originally reported prior and is shown beside the revised prior, never in place of it.',
  'Earlier period and Later period move the selected date range by its own length and switch to a custom range. All and Upcoming have no bounded range to move.',
  'An historical availability cutoff excludes revisions published afterward and revisions with unknown publication time. Values need their own availability timestamps. Latest view can show undated values, marked unknown availability.',
  'Upcoming includes exact events at or after now and date-only events dated today or later. This week starts on Monday in the display timezone. These are explicit OpenCandle policies pending reference comparison.',
  'Countries, categories and symbols use OR within a selector and AND across selectors. Empty selections mean all supplied values. Missing importance never counts as high.',
  'Reset filters restores OpenCandle defaults for period, selectors, search, importance, cancelled events and sort. It keeps the active tab, the display timezone and the information cutoff; clear the cutoff explicitly in the availability filters.',
  'Under a historical cutoff, counts of later or undated publications are hidden; coverage, selectors, the status line and empty-state messages use only information known by the cutoff.',
  'Surprise uses (actual − forecast) / absolute forecast × 100, with matching units and a nonzero forecast. This OpenCandle formula has not been confirmed against every reference case.',
  'IPO deal amount uses offer price × shares offered. IPO market capitalization uses offer price × total shares outstanding. Missing inputs are never replaced with each other.',
  'IPO offer-price units must be a recognized ISO currency, such as USD, meaning currency per share in this field, or explicit USD/share. Derived amounts have currency units. Counts use shares. Numeric magnitudes above the JavaScript safe-integer range are rejected; smaller nonintegers use binary floating-point precision.',
];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
function timestamp(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= -62135596800 && Number(value) <= 253402300799; }
function requireText(value: unknown, field: string, max: number, nullable = false, empty = false): string | null {
  if (nullable && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || value.length > max || !empty && value.trim() === '') throw new Error(`Invalid ${field}.`);
  return value;
}
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const time = Date.parse(`${value}T00:00:00Z`); return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
const formatters = new Map<string, Intl.DateTimeFormat>();
const currencies = new Set(Intl.supportedValuesOf('currency'));
function formatter(zone: string, kind: 'date' | 'time') {
  const key = `${kind}:${zone}`, existing = formatters.get(key); if (existing) { formatters.delete(key); formatters.set(key, existing); return existing; }
  const created = new Intl.DateTimeFormat(kind === 'date' ? 'en-US' : 'en-GB', { timeZone: zone, ...(kind === 'date' ? { year: 'numeric', month: '2-digit', day: '2-digit', era: 'short' } : { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset' }) } as Intl.DateTimeFormatOptions);
  if (formatters.size >= 64) formatters.delete(formatters.keys().next().value!); formatters.set(key, created); return created;
}
function validZone(value: unknown): value is string { if (typeof value !== 'string' || value.length > 100) return false; try { formatter(value, 'date'); return true; } catch { return false; } }
export function calendarTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (timestamp(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) { const number = Number(value); if (timestamp(number)) return number; }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) && isCalendarDate(value.slice(0, 10))) {
    const time = Date.parse(value) / 1000; if (timestamp(time)) return time;
  }
  throw new Error('Use Unix seconds or an ISO timestamp with seconds and an explicit Z/offset. Ambiguous local times are not accepted.');
}
function calendarDateAt(time: number, timezone: string): string {
  const parts = formatter(timezone, 'date').formatToParts(time * 1000), get = (key: string) => parts.find(part => part.type === key)!.value;
  if (get('era') !== 'AD' || Number(get('year')) > 9999) throw new Error('Timezone conversion falls outside supported years 0001 to 9999.');
  return `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}`;
}
function calendarTimeAt(time: number, timezone: string): { time: string; offset: string } { const parts = formatter(timezone, 'time').formatToParts(time * 1000), get = (key: string) => parts.find(part => part.type === key)!.value; return { time: `${get('hour')}:${get('minute')}:${get('second')}`, offset: get('timeZoneName') }; }
function sourceUrl(value: unknown): string | null {
  const url = requireText(value, 'source URL', 2048, true); if (url === null) return null;
  let parsed: URL; try { parsed = new URL(url); } catch { throw new Error('Source URL must be HTTP or HTTPS.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Source URL must be HTTP or HTTPS without credentials.');
  return url;
}
const eventFields = ['id', 'revision', 'kind', 'title', 'description', 'date', 'time', 'timezone', 'timing', 'symbol', 'instrumentId', 'country', 'category', 'importance', 'status', 'publishedAt', 'fiscalPeriod', 'exDate', 'payDate', 'exchange', 'values'];
function normalizeEvent(input: unknown): CalendarEvent {
  if (!object(input)) throw new Error('Calendar event must be an object.');
  for (const key of Object.keys(input)) if (!eventFields.includes(key)) throw new Error(`Unsupported event field ${key}.`);
  const id = requireText(input.id, 'event ID', 300)!, title = requireText(input.title, 'event title', 1000)!, description = requireText(input.description ?? '', 'description', 20000, false, true)!;
  const revision = input.revision ?? 1; if (!Number.isSafeInteger(revision) || Number(revision) < 1 || Number(revision) > 1000000000) throw new Error('Revision must be an integer from 1 to 1000000000.');
  if (!CALENDAR_KINDS.includes(input.kind as CalendarKind) || !isCalendarDate(input.date)) throw new Error('Invalid event kind or calendar date.');
  const time = calendarTimestamp(input.time), timezone = input.timezone === null || input.timezone === undefined || input.timezone === '' ? null : input.timezone;
  if (timezone !== null && !validZone(timezone)) throw new Error('Invalid event timezone.');
  const timing = input.timing ?? (time === null ? 'date-only' : 'exact');
  if (!['exact', 'date-only', 'before-open', 'after-close', 'unknown'].includes(String(timing)) || (time !== null) !== (timing === 'exact')) throw new Error('Exact timing needs a timestamp; other timing categories must not invent one.');
  if (time !== null && (timezone === null || calendarDateAt(time, timezone as string) !== input.date)) throw new Error('Exact timestamp must match the supplied date in its source timezone.');
  const importance = input.importance ?? null; if (importance !== null && !['low', 'medium', 'high'].includes(String(importance))) throw new Error('Invalid importance.');
  const status = input.status ?? 'scheduled'; if (!['scheduled', 'confirmed', 'released', 'cancelled', 'tentative'].includes(String(status))) throw new Error('Invalid event status.');
  const values: Partial<Record<CalendarValueKey, CalendarDatum>> = {};
  if (input.values !== undefined && !object(input.values)) throw new Error('Event values must be a named object.');
  for (const [key, value] of Object.entries(input.values ?? {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    if (!CALENDAR_VALUE_KEYS.includes(key as CalendarValueKey) || !object(value) || Object.keys(value).some(field => !['value', 'unit', 'availableAt'].includes(field))) throw new Error(`Unsupported value field ${key}.`);
    if (value.value !== null && (!finite(value.value) || Math.abs(value.value) > Number.MAX_SAFE_INTEGER)) throw new Error(`Invalid or unsafe numeric ${key}; use null for missing and preserve excessive-precision data outside this numeric schema.`);
    if (value.value !== null && ['dividendAmount', 'dividendYield', 'offerPrice', 'sharesOffered', 'sharesOutstanding', 'splitNumerator', 'splitDenominator', 'marketCap'].includes(key) && Number(value.value) < 0) throw new Error(`${key} must be nonnegative.`);
    if (value.value === 0 && ['splitNumerator', 'splitDenominator'].includes(key)) throw new Error('Split numerator and denominator must be positive.');
    values[key as CalendarValueKey] = { value: value.value as number | null, unit: requireText(value.unit, `${key} unit`, 100)!, availableAt: calendarTimestamp(value.availableAt) };
  }
  const dateField = (field: string) => { const value = input[field] ?? null; if (value !== null && !isCalendarDate(value)) throw new Error(`Invalid ${field}.`); return value as string | null; };
  return { id, revision: revision as number, kind: input.kind as CalendarKind, title, description, date: input.date, time, timezone: timezone as string | null, timing: timing as CalendarEvent['timing'], symbol: requireText(input.symbol, 'symbol', 100, true), instrumentId: requireText(input.instrumentId, 'instrument ID', 500, true), country: requireText(input.country, 'country', 100, true), category: requireText(input.category, 'category', 200, true), importance: importance as CalendarEvent['importance'], status: status as CalendarEvent['status'], publishedAt: calendarTimestamp(input.publishedAt), fiscalPeriod: requireText(input.fiscalPeriod, 'fiscal period', 100, true), exDate: dateField('exDate'), payDate: dateField('payDate'), exchange: requireText(input.exchange, 'exchange', 100, true), values };
}
export function restoreCalendarDocument(input: unknown): CalendarDocument {
  if (!object(input) || input.schemaVersion !== 1 || !object(input.provenance) || !Array.isArray(input.events) || input.events.length > 50000) throw new Error('Invalid calendar document or event limit exceeded.');
  const id = requireText(input.id, 'document ID', 300)!, p = input.provenance;
  if (!['local-import', 'synthetic'].includes(String(p.kind)) || typeof p.fixture !== 'boolean' || (p.kind === 'synthetic') !== p.fixture || !timestamp(p.importedAt)) throw new Error('Invalid provenance or synthetic label.');
  const provenance: CalendarProvenance = { kind: p.kind as CalendarProvenance['kind'], label: requireText(p.label, 'source label', 500)!, sourceUrl: sourceUrl(p.sourceUrl), importedAt: p.importedAt, license: requireText(p.license, 'rights statement', 2000)!, fixture: p.fixture };
  const identities = new Map<string, CalendarEvent>(), revisions = new Map<string, CalendarEvent[]>();
  for (const raw of input.events) {
    const event = normalizeEvent(raw), key = JSON.stringify([event.id, event.revision]), previous = identities.get(key);
    if (previous) { if (JSON.stringify(previous) !== JSON.stringify(event)) throw new Error(`Conflicting duplicate event ${event.id} revision ${event.revision}.`); continue; }
    identities.set(key, event); const list = revisions.get(event.id) ?? []; list.push(event); revisions.set(event.id, list);
  }
  for (const rows of revisions.values()) { rows.sort((a, b) => a.revision - b.revision); let latest: number | null = null; for (const row of rows) if (row.publishedAt !== null) { if (latest !== null && row.publishedAt < latest) throw new Error(`Revision publication order is inconsistent for ${row.id}.`); latest = row.publishedAt; } }
  return { schemaVersion: 1, id, provenance, events: [...identities.values()] };
}
export function createCalendarState(): CalendarState {
  return { schemaVersion: 1, documents: [], query: { kind: 'all', period: 'all', from: null, to: null, timezone: 'UTC', countries: [], categories: [], symbols: [], highImportance: false, search: '', includeCancelled: false, asOf: null, sort: { key: 'date', direction: 'asc' } } };
}
export function restoreCalendarQuery(input: unknown): CalendarQuery {
  if (!object(input) || !['all', ...CALENDAR_KINDS].includes(input.kind as string) || !(CALENDAR_PERIODS as readonly string[]).includes(String(input.period)) || !validZone(input.timezone) || typeof input.highImportance !== 'boolean' || typeof input.includeCancelled !== 'boolean' || typeof input.search !== 'string' || input.search.length > 500 || input.asOf !== null && !timestamp(input.asOf) || !object(input.sort) || !['asc', 'desc'].includes(String(input.sort.direction)) || !(CALENDAR_SORT_KEYS as readonly string[]).includes(String(input.sort.key))) throw new Error('Invalid calendar query.');
  for (const key of ['from', 'to']) if (input[key] !== null && !isCalendarDate(input[key])) throw new Error('Invalid calendar date range.');
  if (input.period === 'custom' && (!input.from || !input.to || String(input.from) > String(input.to))) throw new Error('Custom range requires a valid start and end in ascending order.');
  const lists = {} as Pick<CalendarQuery, 'countries' | 'categories' | 'symbols'>;
  for (const key of ['countries', 'categories', 'symbols'] as const) { const values = input[key]; if (!Array.isArray(values) || values.length > 1000 || values.some(value => typeof value !== 'string' || !value.trim() || value.length > 200) || new Set(values.map(value => value.toLowerCase())).size !== values.length) throw new Error(`Invalid calendar ${key} selection.`); lists[key] = [...values]; }
  return { kind: input.kind as CalendarQuery['kind'], period: input.period as CalendarQuery['period'], from: input.from as string | null, to: input.to as string | null, timezone: input.timezone, ...lists, highImportance: input.highImportance, search: input.search, includeCancelled: input.includeCancelled, asOf: input.asOf as number | null, sort: { key: input.sort.key as CalendarQuery['sort']['key'], direction: input.sort.direction as 'asc' | 'desc' } };
}
export function restoreCalendarState(input: unknown): CalendarState {
  if (!object(input) || input.schemaVersion !== 1 || !Array.isArray(input.documents) || input.documents.length > 100) throw new Error('Invalid calendar state.');
  let count = 0; for (const document of input.documents) { if (!object(document) || !Array.isArray(document.events)) throw new Error('Invalid calendar document.'); count += document.events.length; if (count > 50000) throw new Error('Combined calendar event limit exceeded before normalization.'); }
  // Native/paste input is byte-bounded separately. Check accumulated documents
  // before event normalization and cloning, including local in-memory imports.
  const rawJson = JSON.stringify(input); if (rawJson.length > CALENDAR_STATE_MAX_BYTES || new TextEncoder().encode(rawJson).length > CALENDAR_STATE_MAX_BYTES) throw new Error('Combined calendar state exceeds 20 MiB UTF-8.');
  const documents = input.documents.map(restoreCalendarDocument);
  if (new Set(documents.map(document => document.id)).size !== documents.length || documents.reduce((sum, document) => sum + document.events.length, 0) > 50000) throw new Error('Duplicate documents or combined calendar event limit exceeded.');
  const state: CalendarState = { schemaVersion: 1, documents, query: restoreCalendarQuery(input.query) };
  const canonical = JSON.stringify(state); if (canonical.length > CALENDAR_STATE_MAX_BYTES || new TextEncoder().encode(canonical).length > CALENDAR_STATE_MAX_BYTES) throw new Error('Normalized calendar state exceeds 20 MiB UTF-8.');
  return state;
}
function checkImport(text: string, options: CalendarImportOptions) {
  if (typeof text !== 'string' || !Number.isSafeInteger(options.maxBytes ?? 10 * 1024 * 1024) || !Number.isSafeInteger(options.maxEvents ?? 50000) || (options.maxBytes ?? 1) < 1 || (options.maxEvents ?? 1) < 1 || (options.maxBytes ?? 0) > 10 * 1024 * 1024 || (options.maxEvents ?? 0) > 50000) throw new Error('Invalid calendar import limits.');
  if (text.length > (options.maxBytes ?? 10 * 1024 * 1024) || new TextEncoder().encode(text).length > (options.maxBytes ?? 10 * 1024 * 1024)) throw new Error('Calendar import exceeds the 10 MiB limit or lower configured limit.');
}
function wrapEvents(events: unknown[], options: CalendarImportOptions): CalendarDocument {
  return restoreCalendarDocument({ schemaVersion: 1, id: options.documentId ?? crypto.randomUUID(), provenance: { kind: options.fixture ? 'synthetic' : 'local-import', fixture: options.fixture ?? false, label: options.sourceLabel ?? 'Local calendar import', sourceUrl: options.sourceUrl ?? null, importedAt: options.now ?? Math.floor(Date.now() / 1000), license: options.license ?? 'User-supplied data; distribution rights not assessed.' }, events });
}
export function parseCalendarJson(text: string, options: CalendarImportOptions = {}): CalendarImportResult {
  try { checkImport(text, options); const input: unknown = JSON.parse(text.replace(/^\uFEFF/, '')); const count = Array.isArray(input) ? input.length : object(input) && Array.isArray(input.events) ? input.events.length : 0; if (count > (options.maxEvents ?? 50000)) throw new Error('Calendar event count exceeds the configured limit.'); const document = Array.isArray(input) ? wrapEvents(input, options) : restoreCalendarDocument(input); return { ok: true, document, rowCount: count, diagnostics: document.events.length < count ? ['Identical duplicate event revisions were collapsed.'] : [] }; }
  catch (cause) { return { ok: false, diagnostics: [cause instanceof Error ? cause.message : String(cause)], rowCount: 0 }; }
}
const csvFields = [...eventFields.filter(key => key !== 'values'), ...CALENDAR_VALUE_KEYS.flatMap(key => [key, `${key}Unit`, `${key}AvailableAt`])];
function numericText(value: string, field: string): number | null { if (!value.trim()) return null; if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) || !Number.isFinite(Number(value))) throw new Error(`Invalid numeric ${field}.`); return Number(value); }
export function parseCalendarCsv(text: string, options: CalendarImportOptions = {}): CalendarImportResult {
  let rowCount = 0;
  try {
    checkImport(text, options); const rows = csvRows(text, { maxRows: (options.maxEvents ?? 50000) + 1, maxColumns: csvFields.length, maxFieldLength: 20000 }), headers = rows.shift()?.map(value => value.trim()) ?? [];
    if (!headers.length || new Set(headers).size !== headers.length || headers.some(header => !csvFields.includes(header)) || ['id', 'kind', 'title', 'date'].some(header => !headers.includes(header))) throw new Error('Calendar CSV needs unique known headers including id, kind, title and date.');
    rowCount = rows.length; if (!rows.length || rows.length > (options.maxEvents ?? 50000)) throw new Error('Calendar CSV has no events or exceeds the configured event limit.');
    const events = rows.map((cells, index) => {
      if (cells.length !== headers.length) throw new Error(`CSV row ${index + 2} has the wrong number of cells.`);
      const source = Object.fromEntries(headers.map((key, column) => [key, cells[column]])), event: Record<string, unknown> = {};
      for (const key of eventFields.filter(key => key !== 'values')) if (source[key] !== undefined && source[key] !== '') event[key] = key === 'revision' ? numericText(source[key], key) : source[key];
      const values: Record<string, unknown> = {};
      for (const key of CALENDAR_VALUE_KEYS) if (source[key] !== undefined || source[`${key}Unit`] !== undefined || source[`${key}AvailableAt`] !== undefined) { const value = numericText(source[key] ?? '', key); if (value !== null || source[`${key}Unit`] || source[`${key}AvailableAt`]) values[key] = { value, unit: source[`${key}Unit`], availableAt: source[`${key}AvailableAt`] || null }; }
      event.values = values; try { return normalizeEvent(event); } catch (cause) { throw new Error(`CSV row ${index + 2}: ${cause instanceof Error ? cause.message : String(cause)}`); }
    });
    const document = wrapEvents(events, options); return { ok: true, document, rowCount, diagnostics: document.events.length < rowCount ? ['Identical duplicate event revisions were collapsed.'] : [] };
  } catch (cause) { return { ok: false, diagnostics: [cause instanceof Error ? cause.message : String(cause)], rowCount }; }
}
function missingValue(state: CalendarValueView['state'] = 'missing', unit: string | null = null, availableAt: number | null = null): CalendarValueView { return { value: null, unit, state, availableAt }; }
function viewValue(datum: CalendarDatum | undefined, cutoff: number, historical: boolean): CalendarValueView {
  if (!datum) return missingValue();
  if (datum.value === null) return missingValue('missing', datum.unit, datum.availableAt);
  if (datum.availableAt === null) return { value: historical ? null : datum.value, unit: datum.unit, state: 'unknown-availability', availableAt: null };
  if (datum.availableAt > cutoff) return missingValue('not-yet-available', datum.unit, datum.availableAt);
  return { ...datum, state: 'available' };
}
function derivedValues(values: Record<CalendarValueKey, CalendarValueView>): Record<CalendarDerivedKey, CalendarValueView> {
  function derive(a: CalendarValueKey, b: CalendarValueKey, unit: string | null, formula: (a: number, b: number) => number, compatible: (a: CalendarValueView, b: CalendarValueView) => boolean): CalendarValueView {
    const first = values[a], second = values[b]; if (first.value === null || second.value === null || !compatible(first, second)) return missingValue('missing', unit);
    const value = formula(first.value, second.value); if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) return { ...missingValue('missing', unit), reason: 'Derived value exceeds the supported numeric range or has a zero denominator.' };
    const known = first.availableAt !== null && second.availableAt !== null;
    return { value, unit, state: known ? 'available' : 'unknown-availability', availableAt: known ? Math.max(first.availableAt!, second.availableAt!) : null };
  }
  const sameUnit = (a: CalendarValueView, b: CalendarValueView) => a.unit === b.unit;
  const surprise = (actual: number, forecast: number) => forecast === 0 ? NaN : 100 * (actual - forecast) / Math.abs(forecast);
  const priceUnit = /^([A-Z]{3})(?:\/share)?$/.exec(values.offerPrice.unit ?? ''), currency = priceUnit && currencies.has(priceUnit[1]) ? priceUnit[1] : null;
  const shares = (_a: CalendarValueView, b: CalendarValueView) => currency !== null && b.unit === 'shares';
  const monetary = (key: 'sharesOffered' | 'sharesOutstanding') => currency === null && values.offerPrice.value !== null ? { ...missingValue(), reason: 'IPO offer price requires a recognized ISO currency per share, such as USD or USD/share.' } : derive('offerPrice', key, currency, (price, count) => price * count, shares);
  return { epsSurprisePercent: derive('epsActual', 'epsForecast', '%', surprise, sameUnit), revenueSurprisePercent: derive('revenueActual', 'revenueForecast', '%', surprise, sameUnit), dealAmount: monetary('sharesOffered'), ipoMarketCap: monetary('sharesOutstanding'), splitRatio: derive('splitNumerator', 'splitDenominator', 'ratio', (a, b) => b === 0 ? NaN : a / b, sameUnit) };
}
function moveDate(date: string, days: number): string { return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
/** Keeps a moved date inside the supported years 0001 to 9999 (toISOString would otherwise yield 0000 or +010000 forms). */
function clampDate(date: string): string { return isCalendarDate(date as unknown) ? date : date.startsWith('+') || date > '9999' ? '9999-12-31' : '0001-01-01'; }
function dayCount(from: string, to: string): number { return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1; }
function compare(a: string | number | null, b: string | number | null, direction: 'asc' | 'desc') { if (a === null) return b === null ? 0 : 1; if (b === null) return -1; const result = a < b ? -1 : a > b ? 1 : 0; return direction === 'asc' ? result : -result; }
/** The calendar date at `now` in the display timezone. */
export function calendarToday(timezone: string, now = Math.floor(Date.now() / 1000)): string { if (!timestamp(now) || !validZone(timezone)) throw new Error('Invalid calendar clock or timezone.'); return calendarDateAt(now, timezone); }
/** Inclusive date range for a period in the display timezone. All, Upcoming and Past have no bounded range (null/null); Upcoming and Past split at the current clock. Weeks start on Monday. */
export function calendarPeriodRange(query: Pick<CalendarQuery, 'period' | 'from' | 'to' | 'timezone'>, now = Math.floor(Date.now() / 1000)): { from: string | null; to: string | null } {
  if (query.period === 'custom') return { from: query.from, to: query.to };
  if (query.period === 'all' || query.period === 'upcoming' || query.period === 'past') return { from: null, to: null };
  const today = calendarToday(query.timezone, now);
  if (query.period === 'this-week' || query.period === 'next-week') { const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(), from = clampDate(moveDate(today, -((weekday + 6) % 7) + (query.period === 'next-week' ? 7 : 0))); return { from, to: clampDate(moveDate(from, 6)) }; }
  const day = clampDate(moveDate(today, query.period === 'yesterday' ? -1 : query.period === 'tomorrow' ? 1 : 0)); return { from: day, to: day };
}
/** Earlier/Later period: shifts a bounded range by its own length and returns a custom-range query. Null when the period is unbounded or the result leaves supported years. */
export function shiftCalendarPeriod(query: CalendarQuery, direction: -1 | 1, now = Math.floor(Date.now() / 1000)): CalendarQuery | null {
  const range = calendarPeriodRange(query, now); if (range.from === null || range.to === null || !isCalendarDate(range.from) || !isCalendarDate(range.to) || range.from > range.to) return null;
  const length = dayCount(range.from, range.to), from = moveDate(range.from, direction * length), to = moveDate(range.to, direction * length);
  return isCalendarDate(from) && isCalendarDate(to) ? { ...query, period: 'custom', from, to } : null;
}
const timingRank: Record<CalendarEvent['timing'], number> = { exact: 0, 'before-open': 1, 'after-close': 2, 'date-only': 3, unknown: 4 };
const revisionFields = ['kind', 'title', 'description', 'date', 'time', 'timezone', 'timing', 'status', 'importance', 'country', 'category', 'symbol', 'fiscalPeriod', 'exDate', 'payDate', 'exchange'] as const;
function revisionChanges(previous: CalendarEvent, current: CalendarEvent, before: Record<CalendarValueKey, CalendarValueView>, after: Record<CalendarValueKey, CalendarValueView>): CalendarRevisionChange[] {
  const changes: CalendarRevisionChange[] = [];
  for (const field of revisionFields) if (previous[field] !== current[field]) changes.push({ field, before: previous[field], after: current[field] });
  for (const key of CALENDAR_VALUE_KEYS) { const a = before[key], b = after[key]; if (a.value !== b.value || a.unit !== b.unit || a.state !== b.state) changes.push({ field: key, before: a.value, after: b.value, unitBefore: a.unit, unitAfter: b.unit }); }
  return changes;
}
export function queryCalendar(documents: readonly CalendarDocument[], input: CalendarQuery, now = Math.floor(Date.now() / 1000)): CalendarResult {
  if (!timestamp(now)) throw new Error('Invalid calendar clock.');
  const state = restoreCalendarState({ schemaVersion: 1, documents, query: input }), query = state.query, cutoff = Math.min(now, query.asOf ?? now), today = calendarDateAt(now, query.timezone);
  const { from, to } = calendarPeriodRange(query, now);
  const result: CalendarResult = { rows: [], coverage: { documents: documents.length, records: state.documents.reduce((sum, document) => sum + document.events.length, 0), identities: 0, availableEvents: 0, matched: 0, excluded: 0, unavailableAtCutoff: 0, unknownPublication: 0, hiddenValues: 0, synthetic: 0, revised: 0 }, diagnostics: [], range: { from, to } };
  if (query.asOf !== null && query.asOf > now) result.diagnostics.push('Availability cutoff is capped at the supplied current clock.');
  const selected = (values: string[], candidate: string | null) => !values.length || candidate !== null && values.some(value => value.toLowerCase() === candidate.toLowerCase());
  const view = (event: CalendarEvent) => Object.fromEntries(CALENDAR_VALUE_KEYS.map(key => [key, viewValue(event.values[key], cutoff, query.asOf !== null)])) as Record<CalendarValueKey, CalendarValueView>;
  for (const document of state.documents) {
    const groups = new Map<string, CalendarEvent[]>(); for (const event of document.events) { const list = groups.get(event.id) ?? []; list.push(event); groups.set(event.id, list); }
    result.coverage.identities += groups.size;
    for (const revisions of groups.values()) {
      const eligible = revisions.filter(event => event.publishedAt === null ? query.asOf === null : event.publishedAt <= cutoff).sort((a, b) => b.revision - a.revision), event = eligible[0];
      if (!event) { result.coverage.unavailableAtCutoff++; continue; }
      result.coverage.availableEvents++; if (event.publishedAt === null) result.coverage.unknownPublication++;
      const date = event.time === null ? event.date : calendarDateAt(event.time, query.timezone);
      if (query.kind !== 'all' && event.kind !== query.kind || !query.includeCancelled && event.status === 'cancelled' || query.highImportance && event.importance !== 'high' || !selected(query.countries, event.country) || !selected(query.categories, event.category) || !selected(query.symbols, event.symbol) || query.search && !`${event.title} ${event.description} ${event.symbol ?? ''}`.toLowerCase().includes(query.search.toLowerCase()) || from !== null && date < from || to !== null && date > to || query.period === 'upcoming' && (event.time === null ? date < today : event.time < now) || query.period === 'past' && (event.time === null ? date >= today : event.time >= now)) { result.coverage.excluded++; continue; }
      const values = view(event);
      for (const value of Object.values(values)) if (value.state === 'not-yet-available' || value.state === 'unknown-availability' && value.value === null) result.coverage.hiddenValues++;
      if (document.provenance.fixture) result.coverage.synthetic++;
      const safeEvent = { ...event, values: Object.fromEntries(Object.entries(event.values).map(([key, datum]) => [key, { ...datum, value: values[key as CalendarValueKey].value }])) };
      const clock = event.time === null ? null : calendarTimeAt(event.time, query.timezone), previous = eligible[1] ?? null;
      const revisionView: CalendarRevisionView = { history: [...eligible].reverse().map(row => ({ revision: row.revision, publishedAt: row.publishedAt, status: row.status, date: row.date, time: row.time, timing: row.timing })), previousRevision: previous?.revision ?? null, changes: previous ? revisionChanges(previous, event, view(previous), values) : [] };
      if (revisionView.changes.length) result.coverage.revised++;
      result.rows.push({ key: JSON.stringify([document.id, event.id]), documentId: document.id, event: safeEvent, provenance: document.provenance, displayDate: date, displayTime: clock?.time ?? null, displayOffset: clock?.offset ?? null, publicationUnknown: event.publishedAt === null, values, derived: derivedValues(values), revisions: revisionView });
    }
  }
  const textKeys: readonly string[] = CALENDAR_TEXT_SORT_KEYS, numericSort = !textKeys.includes(query.sort.key);
  const sortValue = (row: CalendarRow): string | number | null => { const key = query.sort.key; if (key === 'importance') return row.event.importance === null ? null : ['low', 'medium', 'high'].indexOf(row.event.importance); if (key === 'title' || key === 'symbol' || key === 'country' || key === 'exchange') return row.event[key]?.toLowerCase() ?? null; if (key === 'exDate' || key === 'payDate') return row.event[key]; if (key === 'date') return row.displayDate; return (row.values[key as CalendarValueKey] ?? row.derived[key as CalendarDerivedKey]).value; };
  const sortUnit = (row: CalendarRow) => numericSort ? (row.values[query.sort.key as CalendarValueKey] ?? row.derived[query.sort.key as CalendarDerivedKey]).unit : null;
  if (numericSort && new Set(result.rows.filter(row => sortValue(row) !== null).map(sortUnit)).size > 1) result.diagnostics.push('Selected numeric field contains different units. Sorting groups by unit, then compares values within that unit; no currency conversion is performed.');
  const byDate = (a: CalendarRow, b: CalendarRow, direction: 'asc' | 'desc') => compare(a.displayDate, b.displayDate, direction) || compare(a.event.time, b.event.time, direction) || timingRank[a.event.timing] - timingRank[b.event.timing];
  result.rows.sort((a, b) => { if (query.sort.key === 'date') return byDate(a, b, query.sort.direction) || compare(a.key, b.key, 'asc'); const av = sortValue(a), bv = sortValue(b); return (av === null || bv === null ? compare(av, bv, query.sort.direction) : numericSort ? compare(sortUnit(a), sortUnit(b), 'asc') || compare(av, bv, query.sort.direction) : compare(av, bv, query.sort.direction)) || byDate(a, b, 'asc') || compare(a.key, b.key, 'asc'); });
  result.coverage.matched = result.rows.length; return result;
}
function csvCell(value: unknown): string { let text = value === null || value === undefined ? '' : String(value); if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; }
/** A disclosed query report, not the canonical import format; JSON state preserves all revisions. */
export function calendarRowsToCsv(result: CalendarResult): string {
  // The original columns keep their positions; every newer column is appended after them.
  const legacyKeys = CALENDAR_VALUE_KEYS.slice(0, LEGACY_CSV_VALUE_KEYS), addedKeys = CALENDAR_VALUE_KEYS.slice(LEGACY_CSV_VALUE_KEYS), valueHeaders = (key: CalendarValueKey) => [key, `${key}Unit`, `${key}Availability`, `${key}AvailableAt`];
  const valueCells = (row: CalendarRow, key: CalendarValueKey) => [row.values[key].value, row.values[key].unit, row.values[key].state, row.values[key].availableAt];
  const headers = ['documentId', 'eventId', 'revision', 'kind', 'title', 'displayDate', 'displayTime', 'displayOffset', 'sourceDate', 'sourceTimezone', 'timing', 'symbol', 'country', 'importance', 'status', 'publishedAt', 'sourceLabel', 'sourceUrl', 'license', 'fixture', ...legacyKeys.flatMap(valueHeaders), ...CALENDAR_DERIVED_KEYS, 'fiscalPeriod', 'exDate', 'payDate', 'exchange', 'previousRevision', 'revisedFields', ...addedKeys.flatMap(valueHeaders)];
  const rows = result.rows.map(row => [row.documentId, row.event.id, row.event.revision, row.event.kind, row.event.title, row.displayDate, row.displayTime, row.displayOffset, row.event.date, row.event.timezone, row.event.timing, row.event.symbol, row.event.country, row.event.importance, row.event.status, row.event.publishedAt, row.provenance.label, row.provenance.sourceUrl, row.provenance.license, row.provenance.fixture ? 'SYNTHETIC' : 'LOCAL IMPORT', ...legacyKeys.flatMap(key => valueCells(row, key)), ...CALENDAR_DERIVED_KEYS.map(key => row.derived[key].value), row.event.fiscalPeriod, row.event.exDate, row.event.payDate, row.event.exchange, row.revisions.previousRevision, row.revisions.changes.map(change => change.field).join(' '), ...addedKeys.flatMap(key => valueCells(row, key))]);
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}
export const CALENDAR_KIND_LABELS: Record<'all' | CalendarKind, string> = { all: 'All supplied events', economic: 'Economic', earnings: 'Earnings and revenue', dividend: 'Dividends', ipo: 'IPO', split: 'Splits' };
/** Information cutoff for helpers outside queryCalendar; it uses the same eligibility rule. */
export interface CalendarCutoff { asOf: number | null; now: number; }
/** Latest revision of each identity published by the cutoff (undated revisions only in the latest view), plus identities with no eligible revision. */
function eligibleIdentities(document: CalendarDocument, cutoff: CalendarCutoff): { shown: CalendarEvent[]; hidden: CalendarEvent[][] } {
  const limit = Math.min(cutoff.now, cutoff.asOf ?? cutoff.now), groups = new Map<string, CalendarEvent[]>(), shown: CalendarEvent[] = [], hidden: CalendarEvent[][] = [];
  for (const event of document.events) { const list = groups.get(event.id) ?? []; list.push(event); groups.set(event.id, list); }
  for (const revisions of groups.values()) { let best: CalendarEvent | null = null; for (const event of revisions) if ((event.publishedAt === null ? cutoff.asOf === null : event.publishedAt <= limit) && (!best || event.revision > best.revision)) best = event; if (best) shown.push(best); else hidden.push(revisions); }
  return { shown, hidden };
}
/** `unavailableAtCutoff` counts identities whose every revision is published after `now` (or undated) in the latest view only; it is always 0 under a historical cutoff. */
export interface CalendarKindCoverage { identities: number; unavailableAtCutoff: number; documents: number; syntheticDocuments: number; from: string | null; to: string | null; }
/** Supplied coverage for one tab at the information cutoff, measured on source dates of each identity's eligible revision. Nothing published after the cutoff contributes. It describes the imports, never the market. */
export function calendarCoverage(documents: readonly CalendarDocument[], kind: 'all' | CalendarKind, cutoff: CalendarCutoff = { asOf: null, now: Math.floor(Date.now() / 1000) }): CalendarKindCoverage {
  const coverage: CalendarKindCoverage = { identities: 0, unavailableAtCutoff: 0, documents: 0, syntheticDocuments: 0, from: null, to: null };
  for (const document of documents) {
    const { shown, hidden } = eligibleIdentities(document, cutoff), matches = shown.filter(event => kind === 'all' || event.kind === kind);
    // Under a historical cutoff, unpublished identities are not counted at all: even their existence, number and kind would be later information.
    if (cutoff.asOf === null) coverage.unavailableAtCutoff += hidden.filter(revisions => kind === 'all' || revisions.some(event => event.kind === kind)).length;
    for (const event of matches) { if (coverage.from === null || event.date < coverage.from) coverage.from = event.date; if (coverage.to === null || event.date > coverage.to) coverage.to = event.date; }
    if (matches.length) { coverage.identities += matches.length; coverage.documents++; if (document.provenance.fixture) coverage.syntheticDocuments++; }
  }
  return coverage;
}
/** Selector choices from the eligible revisions of the active tab, so later publications cannot leak through option lists. */
export function calendarSelectorValues(documents: readonly CalendarDocument[], kind: 'all' | CalendarKind, key: 'country' | 'category' | 'symbol', cutoff: CalendarCutoff = { asOf: null, now: Math.floor(Date.now() / 1000) }): string[] {
  const values = new Set<string>(); for (const document of documents) for (const event of eligibleIdentities(document, cutoff).shown) if ((kind === 'all' || event.kind === kind) && event[key] !== null) values.add(event[key]!);
  return [...values].sort();
}
export type CalendarEmptyReason = 'no-documents' | 'no-kind-coverage' | 'cutoff' | 'cancelled' | 'outside-coverage' | 'filtered' | 'error';
export interface CalendarEmptyState { reason: CalendarEmptyReason; availability: 'unavailable' | 'empty'; message: string; }
/** Explains a zero-row result: unavailable coverage is reported separately from a genuinely empty filter result. */
export function describeCalendarEmpty(documents: readonly CalendarDocument[], query: CalendarQuery, result: CalendarResult | null, error = '', now = Math.floor(Date.now() / 1000)): CalendarEmptyState {
  if (error || !result) return { reason: 'error', availability: 'unavailable', message: error || 'The calendar query is invalid.' };
  const label = CALENDAR_KIND_LABELS[query.kind], noun = query.kind === 'all' ? 'calendar' : label.toLowerCase();
  if (!documents.length) return { reason: 'no-documents', availability: 'unavailable', message: 'Unavailable: No event documents imported, and OpenCandle has no connected event feed. Import a local JSON or CSV file in "Import and manage local event documents", or preview the clearly labelled synthetic demo.' };
  const coverage = calendarCoverage(documents, query.kind, { asOf: query.asOf, now });
  // Under a historical cutoff the message is identical whether or not later events exist, so it reveals nothing published afterwards.
  if (!coverage.identities && query.asOf !== null) return { reason: 'cutoff', availability: 'unavailable', message: `Unavailable at this cutoff: no imported ${noun} events are known by the information cutoff. Publications after the cutoff or without a publication time are not shown or counted.` };
  if (!coverage.identities && coverage.unavailableAtCutoff) return { reason: 'cutoff', availability: 'unavailable', message: `Unavailable now: every imported ${noun} event has a publication time after the current clock.` };
  if (!coverage.identities) return { reason: 'no-kind-coverage', availability: 'unavailable', message: `Unavailable: the imported documents contain no ${noun} events. Import a source that covers ${label} to populate this tab.` };
  const range = query.period === 'upcoming' ? { from: calendarToday(query.timezone, now), to: null } : query.period === 'past' ? { from: null, to: moveDate(calendarToday(query.timezone, now), -1) } : result.range;
  // Display dates can differ from source dates by up to two days (UTC+14 against UTC-12), so coverage is widened by two days each side.
  const outside = coverage.from !== null && coverage.to !== null && (range.to !== null && range.to < clampDate(moveDate(coverage.from, -2)) || range.from !== null && range.from > clampDate(moveDate(coverage.to, 2)));
  if (!query.includeCancelled && queryCalendar(documents, { ...query, includeCancelled: true }, now).rows.length) return { reason: 'cancelled', availability: 'empty', message: `Empty: every imported ${noun} event matching the current period and filters is cancelled. Turn on Include cancelled events to show them.` };
  if (outside) return { reason: 'outside-coverage', availability: 'unavailable', message: `Unavailable for this period: imported ${noun} coverage at this cutoff spans ${coverage.from} to ${coverage.to} (source dates). The selected period ${range.from ?? 'start'} to ${range.to ?? 'open end'} lies outside it, so no rows here is not evidence that no events occurred.` };
  return { reason: 'filtered', availability: 'empty', message: `Empty: no imported ${noun} events match the current period and filters. Reset filters to widen the view. This does not establish market-wide coverage.` };
}
/** RFC 5545 TEXT: escape backslash, semicolon, comma and line breaks, then drop the remaining C0/C1 control characters and DEL (HTAB is allowed). */
function icsText(value: string): string { return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ''); }
function icsFold(line: string): string {
  const encoder = new TextEncoder(), parts: string[] = []; let current = '', bytes = 0;
  for (const char of line) { const size = encoder.encode(char).length, limit = parts.length ? 74 : 75; if (bytes + size > limit) { parts.push(current); current = ''; bytes = 0; } current += char; bytes += size; }
  parts.push(current); return parts.join('\r\n ');
}
function icsStamp(seconds: number): string { return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, ''); }
/** RFC 5545 text for one row, produced locally for an explicit user save. No values are included, so cutoff masking cannot leak. Nothing is transmitted. */
export function calendarEventToIcs(row: CalendarRow, now = Math.floor(Date.now() / 1000)): string {
  if (!timestamp(now)) throw new Error('Invalid calendar clock.');
  const event = row.event, status = event.status === 'cancelled' ? 'CANCELLED' : event.status === 'tentative' ? 'TENTATIVE' : event.status === 'scheduled' ? null : 'CONFIRMED';
  const start = event.time !== null ? [`DTSTART:${icsStamp(event.time)}`] : [`DTSTART;VALUE=DATE:${event.date.replaceAll('-', '')}`, ...(event.date === '9999-12-31' ? [] : [`DTEND;VALUE=DATE:${moveDate(event.date, 1).replaceAll('-', '')}`])];
  const description = [`${row.provenance.fixture ? 'SYNTHETIC DEMO DATA, not a real event. ' : ''}${CALENDAR_KIND_LABELS[event.kind]} event, timing ${event.timing}, status ${event.status}, revision ${event.revision}.`, event.description, `Source: ${row.provenance.label}. Rights: ${row.provenance.license}`, 'Saved locally from OpenCandle. Values are not included.'].filter(Boolean).join('\n');
  // Encode the pair rather than joining independently encoded IDs with a permitted ID character.
  // JSON also escapes lone surrogates before URI encoding. Revisions retain the same event UID.
  const uid = encodeURIComponent(JSON.stringify([row.documentId, event.id]));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OpenCandle//Local calendar export//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:lv-${uid}@opencandle.local`, `DTSTAMP:${icsStamp(now)}`, ...start, `SEQUENCE:${event.revision - 1}`, `SUMMARY:${icsText(`${row.provenance.fixture ? 'SYNTHETIC: ' : ''}${event.title}${event.symbol ? ` (${event.symbol})` : ''}`)}`, `DESCRIPTION:${icsText(description)}`, ...(status ? [`STATUS:${status}`] : []), 'END:VEVENT', 'END:VCALENDAR'];
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
/** CSV header covering the commonly used import fields. Every other documented field is also accepted. */
export const CALENDAR_CSV_TEMPLATE = ['id', 'revision', 'kind', 'title', 'date', 'time', 'timezone', 'timing', 'country', 'category', 'importance', 'status', 'publishedAt', 'symbol', 'exchange', 'fiscalPeriod', 'exDate', 'payDate', 'actual', 'actualUnit', 'actualAvailableAt', 'forecast', 'forecastUnit', 'forecastAvailableAt', 'prior', 'priorUnit', 'priorAvailableAt'].join(',') + '\r\n';
/** An empty document skeleton. It carries no events, so importing it unedited cannot create a fact. */
export function calendarJsonTemplate(now = Math.floor(Date.now() / 1000)): string {
  return JSON.stringify({ schemaVersion: 1, id: 'my-calendar-source', provenance: { kind: 'local-import', label: 'Replace with your source name', sourceUrl: null, importedAt: now, license: 'Replace with your rights statement', fixture: false }, events: [] }, null, 2);
}
export const SYNTHETIC_CALENDAR_DEMO_ID = 'lv-synthetic-calendar-demo';
/** Invented demonstration events relative to `now` (UTC dates). Every title, country (ISO user-assigned XA/XB), symbol and venue is fictitious, and the document is labelled synthetic. */
/** Where the demo events should sit. `lastBarTime` is the last demo bar (events are placed around that day); `symbols` are the demo chart symbols that replace SYNTH1..SYNTH7 in order. */
export interface CalendarDemoAnchor { lastBarTime: number; symbols: readonly string[]; }
/** The anchor for the bundled demo charts: computed from the generated demo bars, never hard-coded dates. */
export function calendarDemoAnchor(): CalendarDemoAnchor {
  const bars = makeFixture(DEMO_SYMBOLS[0]!), last = bars[bars.length - 1];
  return { lastBarTime: last ? last.time : Math.floor(Date.now() / 1000), symbols: ['GME', 'AAPL', 'MSFT', 'IWM', 'NVDA', 'AMD', 'TSLA'] };
}
export function createSyntheticCalendarDemo(now = Math.floor(Date.now() / 1000), anchor?: CalendarDemoAnchor): CalendarDocument {
  if (!timestamp(now)) throw new Error('Invalid calendar clock.');
  const today = calendarDateAt(anchor && timestamp(anchor.lastBarTime) ? anchor.lastBarTime : now, 'UTC'), day = (offset: number) => moveDate(today, offset), at = (offset: number, hhmmss: string) => Date.parse(`${day(offset)}T${hhmmss}Z`) / 1000, week = now - 7 * 86400;
  const v = (value: number | null, unit: string, availableAt: number | null) => ({ value, unit, availableAt });
  const base = { description: 'Synthetic demonstration record invented by OpenCandle. It is not a real event and its numbers are not estimates or actuals.', publishedAt: week };
  const ny = Date.parse(`${day(-1)}T12:30:00Z`) / 1000, nyDate = calendarDateAt(ny, 'America/New_York');
  const cpi = { ...base, id: 'econ-price-index', kind: 'economic', title: 'Synthetic demo: consumer price index (invented)', date: day(0), time: at(0, '12:30:00'), timezone: 'UTC', timing: 'exact', country: 'XA', category: 'Inflation', importance: 'high', status: 'confirmed', values: { actual: v(2.5, '%', at(0, '12:30:00')), forecast: v(2.4, '%', week), prior: v(2.6, '%', week) } };
  const moved = { ...base, id: 'econ-retail', kind: 'economic', title: 'Synthetic demo: retail activity (invented, rescheduled)', date: day(2), country: 'XB', category: 'Consumer', importance: 'medium', status: 'scheduled', values: { forecast: v(0.3, '%', week) } };
  const events: unknown[] = [
    cpi, { ...cpi, revision: 2, publishedAt: now - 86400, values: { ...cpi.values, prior: v(2.7, '%', now - 86400), priorRevisedFrom: v(2.6, '%', week) } },
    { ...base, id: 'econ-policy-rate', kind: 'economic', title: 'Synthetic demo: policy rate decision (invented)', date: day(1), time: at(1, '18:00:00'), timezone: 'UTC', timing: 'exact', country: 'XB', category: 'Interest rates', importance: 'high', values: { actual: v(null, '%', null), forecast: v(4.25, '%', week), prior: v(4.5, '%', week) } },
    { ...base, id: 'econ-payrolls', kind: 'economic', title: 'Synthetic demo: payroll survey (invented, New York time)', date: nyDate, time: ny, timezone: 'America/New_York', timing: 'exact', country: 'XA', category: 'Labor', importance: 'medium', status: 'released', values: { actual: v(150, 'thousand persons', ny), forecast: v(175, 'thousand persons', week), prior: v(160, 'thousand persons', week) } },
    moved, { ...moved, revision: 2, publishedAt: now - 3600, date: day(3), status: 'tentative' },
    { ...base, id: 'econ-holiday', kind: 'economic', title: 'Synthetic demo: market holiday notice (invented, importance not supplied)', date: day(0), country: 'XB', category: 'Holidays' },
    { ...base, id: 'econ-cancelled', kind: 'economic', title: 'Synthetic demo: bond auction (invented, cancelled)', date: day(1), time: at(1, '15:00:00'), timezone: 'UTC', timing: 'exact', country: 'XA', category: 'Bonds', importance: 'low', status: 'cancelled' },
    { ...base, id: 'earn-synth1', kind: 'earnings', title: 'Synthetic demo: SYNTH1 quarterly results (invented)', date: day(0), timing: 'before-open', symbol: 'SYNTH1', country: 'XA', fiscalPeriod: 'Q3 (synthetic)', status: 'released', values: { epsForecast: v(1.2, 'USD/share', week), epsActual: v(1.32, 'USD/share', now - 3600), revenueForecast: v(5000000000, 'USD', week), revenueActual: v(4900000000, 'USD', now - 3600), marketCap: v(120000000000, 'USD', week) } },
    { ...base, id: 'earn-synth2', kind: 'earnings', title: 'Synthetic demo: SYNTH2 quarterly results (invented)', date: day(1), timing: 'after-close', symbol: 'SYNTH2', country: 'XB', fiscalPeriod: 'Q3 (synthetic)', values: { epsForecast: v(0.45, 'USD/share', week), epsActual: v(null, 'USD/share', null), revenueForecast: v(800000000, 'USD', week), marketCap: v(9000000000, 'USD', week) } },
    { ...base, id: 'earn-synth3', kind: 'earnings', title: 'Synthetic demo: SYNTH3 results with a negative estimate (invented)', date: day(-1), timing: 'unknown', symbol: 'SYNTH3', country: 'XA', fiscalPeriod: 'Q3 (synthetic)', status: 'released', values: { epsForecast: v(-0.1, 'USD/share', week), epsActual: v(-0.05, 'USD/share', now - 86400) } },
    { ...base, id: 'div-synth1', kind: 'dividend', title: 'Synthetic demo: SYNTH1 cash dividend (invented)', date: day(2), timing: 'before-open', symbol: 'SYNTH1', country: 'XA', exDate: day(2), payDate: day(16), status: 'confirmed', values: { dividendAmount: v(0.24, 'USD', week), dividendYield: v(1.8, '%', week) } },
    { ...base, id: 'div-synth4', kind: 'dividend', title: 'Synthetic demo: SYNTH4 cash dividend (invented, pay date not supplied)', date: day(-1), timing: 'after-close', symbol: 'SYNTH4', country: 'XB', exDate: day(-1), values: { dividendAmount: v(0.5, 'EUR', week) } },
    { ...base, id: 'ipo-synth5', kind: 'ipo', title: 'Synthetic demo: SYNTH5 initial offering (invented, tentative terms)', date: day(5), symbol: 'SYNTH5', exchange: 'DEMO EXCHANGE', country: 'XA', status: 'tentative', values: { offerPrice: v(18, 'USD/share', week), sharesOffered: v(10000000, 'shares', week), sharesOutstanding: v(80000000, 'shares', week) } },
    { ...base, id: 'ipo-synth6', kind: 'ipo', title: 'Synthetic demo: SYNTH6 initial offering (invented, priced)', date: day(-3), symbol: 'SYNTH6', exchange: 'DEMO EXCHANGE', country: 'XB', status: 'released', values: { offerPrice: v(24, 'USD/share', week), sharesOffered: v(5000000, 'shares', week), sharesOutstanding: v(40000000, 'shares', week) } },
    { ...base, id: 'split-synth7', kind: 'split', title: 'Synthetic demo: SYNTH7 four-for-one split (invented)', date: day(7), symbol: 'SYNTH7', country: 'XA', values: { splitNumerator: v(4, 'ratio', week), splitDenominator: v(1, 'ratio', week) } },
  ];
  if (anchor) for (const event of events as { symbol?: string; title?: string }[]) { const match = /^SYNTH([1-7])$/.exec(event.symbol ?? ''), symbol = match ? anchor.symbols[Number(match[1]) - 1] : undefined; if (symbol) { event.title = (event.title ?? '').replaceAll(event.symbol!, symbol); event.symbol = symbol; } }
  return restoreCalendarDocument({ schemaVersion: 1, id: SYNTHETIC_CALENDAR_DEMO_ID, provenance: { kind: 'synthetic', label: 'OpenCandle SYNTHETIC DEMO EVENTS (invented, not market data)', sourceUrl: null, importedAt: now, license: 'Invented by OpenCandle for demonstration only. Contains no real events, estimates or actuals.', fixture: true }, events });
}
/** How old the newest real import is. Imported files are snapshots that LV never refreshes, so the dialog says so once the newest one is a week old. Synthetic documents are ignored. */
export const CALENDAR_STALE_DAYS = 7;
export interface CalendarStaleness { newestImportedAt: number | null; ageDays: number | null; stale: boolean; message: string | null; }
export function calendarStaleness(documents: readonly CalendarDocument[], now = Math.floor(Date.now() / 1000)): CalendarStaleness {
  const times = documents.filter(document => document.provenance.kind === 'local-import' && !document.provenance.fixture).map(document => document.provenance.importedAt).filter(value => Number.isFinite(value));
  if (!times.length) return { newestImportedAt: null, ageDays: null, stale: false, message: null };
  const newest = Math.max(...times), ageDays = Math.max(0, Math.floor((now - newest) / 86400)), stale = ageDays >= CALENDAR_STALE_DAYS;
  return { newestImportedAt: newest, ageDays, stale, message: stale ? `Your newest calendar import is ${ageDays} days old (imported ${new Date(newest * 1000).toISOString().slice(0, 10)}). Imports are snapshots: schedules, forecasts and results may have changed since. Import a fresh file or run auto-fill to update.` : null };
}
/** The dialog state that opens one event (from a chart marker): filters reset, the event's tab, all dates, cancelled included, and the page that holds it. Null when the event is not visible at the current clock. */
export function focusCalendarEvent(state: CalendarState, focus: { documentId: string; eventId: string }, now = Math.floor(Date.now() / 1000), pageSize = 50): { query: CalendarQuery; key: string; page: number } | null {
  const document = state.documents.find(row => row.id === focus.documentId), event = document?.events.find(row => row.id === focus.eventId);
  if (!event) return null;
  const base = createCalendarState().query, query: CalendarQuery = { ...base, kind: event.kind, period: 'all', includeCancelled: true, timezone: state.query.timezone, asOf: null };
  const key = JSON.stringify([focus.documentId, focus.eventId]), index = queryCalendar(state.documents, query, now).rows.findIndex(row => row.key === key);
  return index < 0 ? null : { query, key, page: Math.floor(index / pageSize) };
}
