import {createParsedLocalCandleDataset} from './local-candle-origin';
import type { Bar, BarDataset, DomainDiagnostic, Instrument } from './types';

export interface ImportOptions { maxBytes?: number; maxRows?: number; timestampUnit?: 'seconds' | 'milliseconds'; duplicatePolicy?: 'dedupe-identical' | 'reject' | 'keep-last'; sort?: boolean; resolution?: string; }
export interface ImportResult { ok: boolean; bars: Bar[]; diagnostics: DomainDiagnostic[]; rowCount: number; dataset?: BarDataset; }
const DEFAULT_INSTRUMENT: Instrument = { id: 'LOCAL:IMPORTED', symbol: 'IMPORTED', name: 'Local imported data', exchange: 'USER-SUPPLIED', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
const error = (code: string, message: string, row?: number, field?: string): DomainDiagnostic => ({ code, message, row, field, severity: 'error' });
const mib = (bytes: number) => `${bytes.toLocaleString('en-US')} bytes (${Number((bytes / 1024 / 1024).toFixed(2))} MiB)`;
const iso = (time: number) => new Date(time * 1000).toISOString().replace('.000Z', 'Z');

/** Revision every local import carried before content revisions existed. Records saved with it are read as revision-unknown. */
export const LEGACY_LOCAL_IMPORT_REVISION = '1';
export const LOCAL_IMPORT_REVISION_PREFIX = 'local-v1:';
/** Plain notice shown once when a record saved before content revisions resumes on an imported file. */
export const LOCAL_IMPORT_LEGACY_NOTICE = 'This was saved before OpenCandle tracked changes to imported files. It continues on the data loaded now, which may differ from the data it was saved with.';
/**
 * Deterministic content revision of imported bars. Same dual 32-bit FNV-1a style mix and per-bar
 * encoding as the derived-interval contentFingerprint (src/domain/intervals.ts:178-185), fed with the bars only:
 * no import time, file name, label or other metadata, so it is stable across app restarts. That function is
 * module-private and also mixes in the source revision, so it cannot be called here. Non-cryptographic identity.
 */
export function localImportRevision(bars: readonly Bar[]): string {
  let a = 2166136261, b = 2246822519;
  const feed = (text: string) => { for (let i = 0; i < text.length; i++) { const code = text.charCodeAt(i); a = Math.imul(a ^ code, 16777619); b = Math.imul(b ^ code, 3266489917); } };
  for (const bar of bars) feed(`${bar.time},${bar.open},${bar.high},${bar.low},${bar.close},${bar.volume};`);
  return LOCAL_IMPORT_REVISION_PREFIX + (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
/** A saved legacy revision against a local import that now carries a content revision: the saved basis is unknown. */
export function isLegacyLocalRevision(saved: string, current: Pick<BarDataset, 'provenance'>): boolean {
  return saved === LEGACY_LOCAL_IMPORT_REVISION && current.provenance.datasetId.startsWith('local:') && current.provenance.revision.startsWith(LOCAL_IMPORT_REVISION_PREFIX);
}

/**
 * The one display form of a source revision for UI text. Exports and audit records keep the exact value.
 * A local file revision and a derived interval revision show their first 8 hex digits; legacy '1' on a local import
 * reads as not tracked; any other value stays a plain "Revision <value>".
 */
export function describeSourceRevision(revision: string, datasetId?: string | null): string {
  // Tampered or invalid persisted values never print raw: empty or non-string is unknown, others cap at 24.
  if (typeof revision !== 'string' || !revision) return 'Revision unknown';
  const file = /^local-v1:([0-9a-f]{16})$/.exec(revision);
  if (file) return `File version ${file[1].slice(0, 8)}`;
  const derived = /^utc-v1:([0-9a-f]{16})$/.exec(revision);
  if (derived) return `Derived version ${derived[1].slice(0, 8)}`;
  const live = /^live-v1:[0-9a-z]+:(\d{1,12})$/.exec(revision);
  if (live) return `Live, update ${live[1]}`;
  if (revision === LEGACY_LOCAL_IMPORT_REVISION && typeof datasetId === 'string' && datasetId.startsWith('local:')) return 'Not tracked (imported before version tracking)';
  return `Revision ${revision.length > 24 ? revision.slice(0, 24) + '…' : revision}`;
}

function checkSize(text: string, options: ImportOptions): void {
  if (options.maxBytes !== undefined && (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > 20 * 1024 * 1024) || options.maxRows !== undefined && (!Number.isSafeInteger(options.maxRows) || options.maxRows < 1 || options.maxRows > 100000)) throw new Error('Import limits must be positive integers no greater than 20 MiB and 100000 rows.');
  const bytes = new TextEncoder().encode(text).length, limit = options.maxBytes ?? 20 * 1024 * 1024;
  if (bytes > limit) throw new Error(`File exceeds the configured import byte limit: ${mib(bytes)} supplied, ${mib(limit)} allowed. Split the file or remove unused columns.`);
}

/** RFC-style quoted cells, including embedded commas/newlines and doubled quotes. */
export function csvRows(text: string, limits: { maxRows?: number; maxColumns?: number; maxFieldLength?: number } = {}): string[][] {
  const maxRows = limits.maxRows ?? 100001, maxColumns = limits.maxColumns ?? 256, maxFieldLength = limits.maxFieldLength ?? 32768;
  if (text.length > 20 * 1024 * 1024 || !Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 100001 || !Number.isSafeInteger(maxColumns) || maxColumns < 1 || maxColumns > 256 || !Number.isSafeInteger(maxFieldLength) || maxFieldLength < 1 || maxFieldLength > 32768) throw new Error('CSV input or tokenizer limits exceed the supported bounds.');
  const rows: string[][] = [];
  let cells: string[] = [], cell = '', quoted = false, afterQuote = false;
  const pushCell = () => { if (cells.length >= maxColumns) throw new Error('CSV column limit exceeded while tokenizing.'); cells.push(cell); cell = ''; afterQuote = false; };
  const pushRow = () => { pushCell(); if (cells.some(value => value.trim() !== '')) { if (rows.length >= maxRows) throw new Error('CSV row limit exceeded while tokenizing.'); rows.push(cells); } cells = []; };
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') { if (input[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; afterQuote = true; } }
      else cell += c;
    } else if (c === '"' && cell === '' && !afterQuote) quoted = true;
    else if (c === ',') pushCell();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      pushRow();
    } else if (afterQuote && c.trim() !== '') throw new Error('Unexpected text after a closing CSV quote.');
    else if (!afterQuote) cell += c;
    if (cell.length > maxFieldLength) throw new Error('CSV field length limit exceeded while tokenizing.');
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  pushRow();
  return rows;
}

function parseTime(value: unknown, options: ImportOptions): number {
  if (typeof value === 'number' || typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const raw = Number(value), milliseconds = options.timestampUnit === 'milliseconds', numeric = raw / (milliseconds ? 1000 : 1);
    const valid = (seconds: number) => Number.isSafeInteger(seconds) && seconds >= -62135596800 && seconds <= 253402300799;
    if (!valid(numeric)) {
      // Messages prefixed "Timestamp unit:" are summarized once by the import preview instead of repeated per row.
      if (milliseconds) throw new Error(valid(raw) ? `Timestamp unit: ${String(value).trim()} is not a whole second when read as Unix milliseconds; the values look like Unix seconds.` : `Timestamp unit: ${String(value).trim()} is not a valid Unix millisecond time for years 0001 to 9999.`);
      throw new Error(valid(raw / 1000) ? `Timestamp unit: ${String(value).trim()} is outside Unix seconds for years 0001 to 9999; the values look like Unix milliseconds.` : 'Timestamp must be valid Unix seconds for years 0001 to 9999; select milliseconds explicitly when needed.');
    }
    return numeric;
  }
  if (typeof value !== 'string') throw new Error('Missing timestamp.');
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) && !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) throw new Error('Use a date YYYY-MM-DD or ISO timestamp with explicit timezone.');
  const datePart = text.slice(0, 10), midnight = Date.parse(`${datePart}T00:00:00Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== datePart || datePart.startsWith('0000')) throw new Error('Invalid calendar date.');
  const time = Date.parse(text.length === 10 ? `${text}T00:00:00Z` : text);
  if (!Number.isFinite(time) || time % 1000 !== 0 || time / 1000 < -62135596800 || time / 1000 > 253402300799) throw new Error('Invalid date, unsupported subsecond timestamp, or normalized UTC year outside 0001 to 9999.');
  if (text.length === 10 && new Date(time).toISOString().slice(0, 10) !== text) throw new Error('Invalid calendar date.');
  return time / 1000;
}

function numberField(value: unknown, field: string): number {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'string' && value.trim() === '') throw new Error(`Missing ${field}.`);
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error(`Invalid ${field}.`);
  if (typeof value === 'string' && !/^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(value)) throw new Error(`Invalid ${field} "${value.trim().slice(0, 40)}": use plain decimal numbers without thousands separators, currency symbols or formulas.`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Nonfinite ${field}.`);
  return number;
}

function normalize(rows: Record<string, unknown>[], instrument: Instrument, options: ImportOptions): ImportResult {
  const diagnostics: DomainDiagnostic[] = [], parsed: Bar[] = [], sourceRows: number[] = [];
  if (rows.length > (options.maxRows ?? 100000)) return { ok: false, bars: [], rowCount: rows.length, diagnostics: [error('ROW_LIMIT', `Too many rows: ${rows.length.toLocaleString('en-US')} data rows supplied; the limit is ${(options.maxRows ?? 100000).toLocaleString('en-US')}.`)] };
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    try {
      const bar: Bar = { time: parseTime(row.time ?? row.timestamp ?? row.date, options), open: numberField(row.open, 'open'), high: numberField(row.high, 'high'), low: numberField(row.low, 'low'), close: numberField(row.close, 'close'), volume: numberField(row.volume, 'volume') };
      if (Math.min(bar.open, bar.high, bar.low, bar.close) <= 0) throw new Error('Equity OHLC prices must be positive.');
      if (bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high)) throw new Error('OHLC range is inconsistent.');
      if (bar.volume < 0) throw new Error('Volume must be nonnegative. Missing volume cannot be replaced with zero.');
      parsed.push(bar); sourceRows.push(index + 1);
    } catch (cause) { diagnostics.push(error('INVALID_ROW', cause instanceof Error ? cause.message : String(cause), index + 1)); }
  }
  if (!rows.length) diagnostics.push(error('EMPTY_FILE', 'No data rows.'));
  const backwards = parsed.reduce<number[]>((rows, bar, index) => index > 0 && bar.time < parsed[index - 1].time ? [...rows.slice(0, 20), sourceRows[index]] : rows, []);
  let order = parsed.map((_, index) => index);
  if (backwards.length) {
    const where = `${backwards.length === 21 ? 'More than 20' : backwards.length} row(s) earlier than the row before them, first at data row ${backwards[0]}`;
    if (options.sort === false) diagnostics.push(error('OUT_OF_ORDER', `Rows are not chronological: ${where}.`, backwards[0]));
    else { order = order.sort((a, b) => parsed[a].time - parsed[b].time); diagnostics.push({ code: 'SORTED', message: `Input rows were sorted by timestamp: ${where}.`, row: backwards[0], severity: 'warning' }); }
  }
  const bars: Bar[] = [];
  for (const index of order) {
    const bar = parsed[index], row = sourceRows[index], previous = bars.at(-1);
    if (previous?.time !== bar.time) { bars.push(bar); continue; }
    const identical = ['open', 'high', 'low', 'close', 'volume'].every(key => previous[key as keyof Bar] === bar[key as keyof Bar]);
    if (options.duplicatePolicy === 'keep-last') { bars[bars.length - 1] = bar; diagnostics.push({ code: 'DUPLICATE_REPLACED', message: `Kept last input at ${bar.time} (${iso(bar.time)}).`, row, severity: 'warning' }); }
    else if (identical && options.duplicatePolicy !== 'reject') diagnostics.push({ code: 'DUPLICATE_REMOVED', message: `Removed identical duplicate at ${bar.time} (${iso(bar.time)}).`, row, severity: 'warning' });
    else diagnostics.push(error('CONFLICTING_DUPLICATE', `Duplicate timestamp ${bar.time} (${iso(bar.time)}) ${identical ? 'is rejected by the selected duplicate policy' : 'has different values and requires an explicit correction policy'}.`, row));
  }
  if (diagnostics.some(d => d.severity === 'error')) return { ok: false, bars: [], diagnostics, rowCount: rows.length };
  const dataset: BarDataset = createParsedLocalCandleDataset({ ...instrument }, bars, options.resolution ?? 'user-supplied', { providerId: 'local-import', providerName: 'Local file supplied by user', datasetId: `local:${instrument.id}`, fixture: false, coverage: `${bars.length} imported bars; universe limited to this file`, asOf: bars.at(-1)?.time ?? 0, delaySeconds: null, adjustment: 'unknown', session: 'unknown', timezone: instrument.timezone, state: 'ready', license: 'Your own data; redistribution rights unconfirmed', revision: localImportRevision(bars), notes: ['Price adjustment and session basis must be supplied by the user.', 'Date-only rows interpreted as UTC calendar dates, not exchange opening timestamps.'] });
  return { ok: true, bars, diagnostics, rowCount: rows.length, dataset };
}

export function parseCsv(text: string, instrument: Instrument = DEFAULT_INSTRUMENT, options: ImportOptions = {}): ImportResult {
  try {
    checkSize(text, options);
    let tokenized: string[][];
    try { tokenized = csvRows(text); } catch (cause) { if (cause instanceof Error && cause.message.startsWith('CSV row limit')) throw new Error(`Too many rows: more than 100,000 data rows supplied; the limit is ${(options.maxRows ?? 100000).toLocaleString('en-US')}.`); throw cause; }
    const rows = tokenized, header = rows.shift()?.map(h => h.trim().toLowerCase()) ?? [];
    if (new Set(header).size !== header.length) throw new Error('Duplicate column names.');
    const missing = [['time', 'timestamp', 'date'].some(k => header.includes(k)) ? '' : 'time (or date/timestamp)', ...['open', 'high', 'low', 'close', 'volume'].filter(k => !header.includes(k))].filter(Boolean);
    if (missing.length) throw new Error(`Required columns: time (or date/timestamp), open, high, low, close, volume. Missing: ${missing.join(', ')}. Found: ${header.slice(0, 12).join(', ') || 'no header'}.`);
    const ragged = rows.findIndex(row => row.length !== header.length);
    if (ragged >= 0) throw new Error(`CSV row column count differs from header: data row ${ragged + 1} has ${rows[ragged].length} cell(s), the header has ${header.length}.`);
    return normalize(rows.map(row => Object.fromEntries(header.map((key, i) => [key, row[i]]))), instrument, options);
  } catch (cause) { return { ok: false, bars: [], rowCount: 0, diagnostics: [error('CSV_PARSE', cause instanceof Error ? cause.message : String(cause))] }; }
}

export function parseJson(text: string, instrument: Instrument = DEFAULT_INSTRUMENT, options: ImportOptions = {}): ImportResult {
  try {
    checkSize(text, options);
    const data: unknown = JSON.parse(text);
    const rows = Array.isArray(data) ? data : typeof data === 'object' && data !== null && 'bars' in data ? (data as { bars: unknown }).bars : null;
    if (!Array.isArray(rows) || rows.some(row => typeof row !== 'object' || row === null || Array.isArray(row))) throw new Error('Expected an array of bar objects, or an object containing bars.');
    return normalize(rows as Record<string, unknown>[], instrument, options);
  } catch (cause) { return { ok: false, bars: [], rowCount: 0, diagnostics: [error('JSON_PARSE', cause instanceof Error ? cause.message : String(cause))] }; }
}

/** Fixed-duration UTC buckets. Exchange-calendar/session aggregation needs explicit anchors. */
export function aggregateBars(bars: readonly Bar[], intervalSeconds: number, anchor = 0): Bar[] {
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds <= 0 || !Number.isSafeInteger(anchor)) throw new RangeError('Interval must be a positive integer number of seconds, with an integer anchor.');
  const output: Bar[] = [];
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (i && bar.time <= bars[i - 1].time) throw new Error('Aggregation requires unique chronological bars.');
    const time = Math.floor((bar.time - anchor) / intervalSeconds) * intervalSeconds + anchor;
    const last = output.at(-1);
    if (last?.time === time) { last.high = Math.max(last.high, bar.high); last.low = Math.min(last.low, bar.low); last.close = bar.close; last.volume += bar.volume; }
    else output.push({ ...bar, time });
  }
  return output;
}

export function barsToCsv(bars: readonly Bar[]): string {
  return 'time,open,high,low,close,volume\n' + bars.map(b => [b.time, b.open, b.high, b.low, b.close, b.volume].join(',')).join('\n') + '\n';
}
