import {usSessionDay} from './us-market-hours';
import {createPreparedLocalCandleDataset} from './local-candle-origin';
/** Local historical import setup: draft metadata, preview, disclosure, synthetic examples and first-use guidance.
 * Pure model code. It never fetches data, never invents prices or volume, and never upgrades unknown basis to a guess. */
import { csvRows, localImportRevision, parseCsv, parseJson, type ImportOptions, type ImportResult } from './data';
import type { AdjustmentBasis, Bar, BarDataset, Instrument, SessionBasis } from './types';
import { datasetSourceTag } from './source-tag';
import { demoDataMode } from './demo-mode';

export const IMPORT_RESOLUTIONS = ['1s', '1m', '5m', '15m', '1h', '1D', '1W', '1M'] as const;
const RESOLUTION_SECONDS: Record<string, number> = { '1s': 1, '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1D': 86400, '1W': 604800, '1M': 2629746 };
export const IMPORT_ADJUSTMENTS: { value: AdjustmentBasis; label: string }[] = [
  { value: 'unknown', label: 'Unknown (not stated by the source)' },
  { value: 'raw', label: 'Raw, as traded (no split or dividend adjustment)' },
  { value: 'split-adjusted', label: 'Split-adjusted' },
  { value: 'total-return', label: 'Split and dividend adjusted (total return)' },
];
export const IMPORT_SESSIONS: { value: SessionBasis; label: string }[] = [
  { value: 'unknown', label: 'Unknown (not stated by the source)' },
  { value: 'regular', label: 'Regular trading hours only' },
  { value: 'extended', label: 'Extended hours included' },
  { value: 'all', label: 'All sessions (24-hour market)' },
];
export const IMPORT_MAX_BYTES = 20 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 100000;
const SYMBOL = /^[A-Z0-9.^_-]{1,24}$/, EXCHANGE = /^[A-Z0-9._-]{1,80}$/;

export type OutOfOrderPolicy = 'sort' | 'reject';
export interface ImportDraft {
  text: string; format: 'csv' | 'json'; fileName: string; sourceLabel: string;
  symbol: string; resolution: string; exchange: string; currency: string; assetClass: 'stock' | 'etf'; tickSize: number; lotSize: number; timezone: string;
  adjustment: AdjustmentBasis; session: SessionBasis;
  timestampUnit: 'seconds' | 'milliseconds'; duplicatePolicy: NonNullable<ImportOptions['duplicatePolicy']>; outOfOrder: OutOfOrderPolicy;
}
export type ImportIssueSeverity = 'error' | 'warning' | 'info';
export interface ImportIssue { severity: ImportIssueSeverity; code: string; message: string; field?: string; row?: number; }
/** syntheticLabel: every data row carries an exact shipped SYNTHETIC marker (structured, never a free-text match).
 * partialSyntheticLabel: some rows carry it and some do not, which blocks the import. */
export interface ImportScan { symbols: string[]; adjustedColumn: string | null; syntheticLabel: boolean; partialSyntheticLabel: boolean; dateOnly: boolean; exampleId: string | null; }
export interface ImportPreview {
  state: 'empty' | 'blocked' | 'ready'; headline: string; synthetic: boolean;
  rowsRead: number; validBars: number; rejectedRows: number; errors: number; warnings: number;
  first: string | null; last: string | null; typicalSpacing: string | null; largestGap: string | null;
  issues: ImportIssue[]; disclosure: { label: string; value: string }[];
  sample: { position: string; time: string; open: number; high: number; low: number; close: number; volume: number }[];
}
export interface PreparedImport { preview: ImportPreview; dataset: BarDataset | null; }
export interface ImportContext { now: number; existing?: readonly BarDataset[]; }

export function createImportDraft(): ImportDraft {
  return { text: '', format: 'csv', fileName: '', sourceLabel: '', symbol: 'IMPORTED', resolution: '1D', exchange: 'USER-SUPPLIED', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC', adjustment: 'unknown', session: 'unknown', timestampUnit: 'seconds', duplicatePolicy: 'dedupe-identical', outOfOrder: 'sort' };
}

// ---------------------------------------------------------------- synthetic examples
export interface ImportExample { id: string; title: string; summary: string; fileName: string; expectValid: boolean; draft: Omit<ImportDraft, 'fileName' | 'sourceLabel'>; }
const EXAMPLE_LABEL = 'SYNTHETIC EXAMPLE - not market data';
const GME_CSV = `date,symbol,open,high,low,close,volume,label
2024-01-02,GME,20.00,20.80,19.60,20.50,1500000,${EXAMPLE_LABEL}
2024-01-03,GME,20.50,21.10,20.20,20.90,1620000,${EXAMPLE_LABEL}
2024-01-04,GME,20.90,21.00,20.10,20.30,1410000,${EXAMPLE_LABEL}
2024-01-05,GME,20.30,20.70,19.90,20.60,1380000,${EXAMPLE_LABEL}
2024-01-08,GME,20.60,21.40,20.50,21.20,1750000,${EXAMPLE_LABEL}
2024-01-09,GME,21.20,21.30,20.70,20.80,1290000,${EXAMPLE_LABEL}
2024-01-10,GME,20.80,21.00,20.40,20.95,1330000,${EXAMPLE_LABEL}
2024-01-11,GME,20.95,21.60,20.90,21.45,1810000,${EXAMPLE_LABEL}
2024-01-12,GME,21.45,21.50,20.85,21.00,1460000,${EXAMPLE_LABEL}
2024-01-16,GME,21.00,21.20,20.30,20.40,1520000,${EXAMPLE_LABEL}
2024-01-17,GME,20.40,20.60,19.80,19.95,1690000,${EXAMPLE_LABEL}
2024-01-18,GME,19.95,20.50,19.90,20.35,1400000,${EXAMPLE_LABEL}
`;
const spyBars: [number, number, number, number, number, number][] = [
  [1704153600, 100.00, 100.90, 99.40, 100.60, 800000], [1704240000, 100.60, 101.20, 100.10, 100.20, 760000], [1704326400, 100.20, 100.50, 99.10, 99.30, 910000],
  [1704412800, 99.30, 100.40, 99.00, 100.10, 870000], [1704672000, 100.10, 101.50, 100.00, 101.40, 990000], [1704758400, 101.40, 101.60, 100.70, 100.90, 720000],
  [1704844800, 100.90, 101.30, 100.50, 101.10, 680000], [1704931200, 101.10, 102.00, 101.00, 101.80, 1050000], [1705017600, 101.80, 102.10, 101.20, 101.50, 830000],
  [1705363200, 101.50, 101.70, 100.60, 100.80, 940000],
];
const SPY_JSON = `{
  "fixture": "${EXAMPLE_LABEL}",
  "symbol": "SPY",
  "bars": [
${spyBars.map(([time, open, high, low, close, volume]) => `    { "time": ${time}, "open": ${open.toFixed(2)}, "high": ${high.toFixed(2)}, "low": ${low.toFixed(2)}, "close": ${close.toFixed(2)}, "volume": ${volume} }`).join(',\n')}
  ]
}
`;
const LVDEMO_CSV = `time,open,high,low,close,volume,label
${[['09:30', '50.00,50.40,49.80,50.25,12000'], ['09:35', '50.25,50.60,50.10,50.55,9800'], ['09:40', '50.55,50.70,50.30,50.35,8700'], ['09:45', '50.35,50.50,50.05,50.10,9100'],
  ['09:50', '50.10,50.30,49.95,50.20,7600'], ['09:55', '50.20,50.45,50.15,50.40,6900'], ['10:00', '50.40,50.90,50.35,50.85,14200'], ['10:05', '50.85,50.95,50.60,50.70,8800'],
  ['10:10', '50.70,50.80,50.40,50.45,7300'], ['10:15', '50.45,50.55,50.20,50.30,6500'], ['10:20', '50.30,50.65,50.25,50.60,7100'], ['10:25', '50.60,50.75,50.50,50.70,6800']]
  .map(([clock, values]) => `2024-01-02T${clock}:00-05:00,${values},${EXAMPLE_LABEL}`).join('\n')}
`;
const PRACTICE_LABEL = 'SYNTHETIC PRACTICE - deliberate mistakes';
const PRACTICE_CSV = `date,open,high,low,close,volume,label
2024-01-02,10.00,10.50,9.80,10.20,1000,${PRACTICE_LABEL}
2024-01-04,10.40,10.70,10.30,10.60,1200,${PRACTICE_LABEL}
2024-01-03,10.20,10.60,10.10,10.40,1100,${PRACTICE_LABEL}
2024-01-03,10.20,10.60,10.10,10.40,1100,${PRACTICE_LABEL}
2024-01-05,10.60,10.40,10.50,10.55,900,${PRACTICE_LABEL}
2024-01-08,10.55,10.80,10.45,10.75,,${PRACTICE_LABEL}
2024-01-09,10.75,11.00,10.70,$10.90,1300,${PRACTICE_LABEL}
2024-02-30,10.90,11.10,10.80,11.00,1250,${PRACTICE_LABEL}
2024-01-10,10.90,11.10,10.80,11.00,1250,${PRACTICE_LABEL}
2024-01-10,10.90,11.20,10.80,11.10,1400,${PRACTICE_LABEL}
`;
const exampleBase = { exchange: 'SYNTHETIC-EXAMPLE', currency: 'USD', tickSize: 0.01, lotSize: 1, timestampUnit: 'seconds', duplicatePolicy: 'dedupe-identical', outOfOrder: 'sort' } as const;
export const IMPORT_EXAMPLES: readonly ImportExample[] = Object.freeze([
  { id: 'gme-daily-csv', title: 'GME daily bars, CSV (synthetic)', fileName: 'bars-GME-synthetic-daily.csv', expectValid: true,
    summary: '12 invented daily bars dated January 2024, with a symbol column and a holiday gap. The prices are made up for practice and are not GME market data.',
    draft: { ...exampleBase, text: GME_CSV, format: 'csv', symbol: 'GME', resolution: '1D', assetClass: 'stock', timezone: 'America/New_York', adjustment: 'raw', session: 'regular' } },
  { id: 'spy-daily-json', title: 'SPY daily bars, JSON with Unix seconds (synthetic)', fileName: 'bars-SPY-synthetic-daily.json', expectValid: true,
    summary: '10 invented daily ETF bars in a JSON object with numeric Unix-second timestamps. The prices are made up and are not SPY market data.',
    draft: { ...exampleBase, text: SPY_JSON, format: 'json', symbol: 'SPY', resolution: '1D', assetClass: 'etf', timezone: 'America/New_York', adjustment: 'raw', session: 'regular' } },
  { id: 'lvdemo-5m-csv', title: 'LVDEMO 5-minute bars, CSV with UTC offsets (synthetic)', fileName: 'bars-LVDEMO-synthetic-5m.csv', expectValid: true,
    summary: '12 invented intraday bars for a made-up ticker, with ISO timestamps that carry an explicit -05:00 offset.',
    draft: { ...exampleBase, text: LVDEMO_CSV, format: 'csv', symbol: 'LVDEMO', resolution: '5m', assetClass: 'stock', timezone: 'America/New_York', adjustment: 'raw', session: 'regular' } },
  { id: 'practice-mistakes-csv', title: 'Practice file with mistakes (synthetic, will be rejected)', fileName: 'bars-PRACTICE-synthetic-mistakes.csv', expectValid: false,
    summary: 'Out-of-order rows, duplicates, an impossible high, missing volume, a currency symbol and an invalid date, so you can see how validation reports each one.',
    draft: { ...exampleBase, text: PRACTICE_CSV, format: 'csv', symbol: 'PRACTICE', resolution: '1D', assetClass: 'stock', timezone: 'UTC', adjustment: 'unknown', session: 'unknown' } },
] satisfies ImportExample[]);


/** A distinct longer exercise; the four established short examples and their shipped files remain unchanged. */
const SEASONALITY_EQUITY_CSV=(()=>{
 const output=['date,symbol,open,high,low,close,volume,label'],ends=[100,110,105,120,100,115,95,108,118,103,112,125];let previous=125,ordinal=0;
 for(let year=2015;year<=2023;year++)for(let month=0;month<12;month++){
  if(year===2015&&month<11)continue;
  const days=new Date(Date.UTC(year,month+1,0)).getUTCDate(),close=ends[month]+10*(year-2015);
  for(let day=1;day<=days;day++){const date=String(year)+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0'),session=usSessionDay(date);if(session.weekend||session.holiday)continue;
   output.push(`${date},GME,${previous},${Math.max(previous,close)+1},${Math.min(previous,close)-1},${close},${100000+ordinal++},${EXAMPLE_LABEL}`);previous=close;
  }
 }
 return output.join('\n')+'\n';
})();
export const SEASONALITY_IMPORT_EXAMPLES:readonly ImportExample[]=Object.freeze([
 {id:'seasonality-equity-csv',title:'Multi-year equity history (synthetic)',fileName:'bars-GME-synthetic-multi-year.csv',expectValid:true,
  summary:'Invented daily equity candles from December 2015 through December 2023 on the supported NYSE calendar, including a preceding December seed. Prices are made up and are not GME market data. Calendar and completion choices in a study remain explicit declarations.',
  draft:{...exampleBase,text:SEASONALITY_EQUITY_CSV,format:'csv',symbol:'GME',resolution:'1D',assetClass:'stock',timezone:'America/New_York',adjustment:'raw',session:'regular'}},
]);
export function findImportExample(id:string):ImportExample|undefined{return IMPORT_EXAMPLES.find(row=>row.id===id)??SEASONALITY_IMPORT_EXAMPLES.find(row=>row.id===id);}

export function exampleDraft(id: string): ImportDraft {
  const example = findImportExample(id);
  if (!example) throw new Error('Unknown synthetic example.');
  return { ...createImportDraft(), ...structuredClone(example.draft), fileName: example.fileName, sourceLabel: '' };
}
const canonical = (text: string) => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
/** Text identity, not a remembered button press, decides whether bars are the shipped synthetic example. */
export function matchExample(text: string): ImportExample | null {
  const value = canonical(text);
  if(!value)return null;for(const group of [IMPORT_EXAMPLES,SEASONALITY_IMPORT_EXAMPLES]){const example=group.find(row=>canonical(row.draft.text)===value);if(example)return example;}return null;
}

// ---------------------------------------------------------------- parsing and scanning
export function parseImportText(draft: Pick<ImportDraft, 'text' | 'format' | 'timestampUnit' | 'duplicatePolicy' | 'outOfOrder' | 'resolution'>): ImportResult {
  const options: ImportOptions = { resolution: draft.resolution, timestampUnit: draft.timestampUnit, duplicatePolicy: draft.duplicatePolicy, sort: draft.outOfOrder === 'sort', maxBytes: IMPORT_MAX_BYTES, maxRows: IMPORT_MAX_ROWS };
  return (draft.format === 'csv' ? parseCsv : parseJson)(draft.text, undefined, options);
}

const ADJUSTED = ['adj close', 'adj_close', 'adjclose', 'adjusted close', 'adjusted_close', 'adjustedclose'];
const SYMBOL_KEYS = ['symbol', 'ticker'], TIME_KEYS = ['time', 'timestamp', 'date'];
/** The only accepted synthetic declarations: these exact strings in a CSV "label" column or JSON row "label", or as the JSON container's "fixture" value. */
export const SYNTHETIC_MARKERS: readonly string[] = Object.freeze([EXAMPLE_LABEL, PRACTICE_LABEL]);
const isMarker = (value: unknown) => typeof value === 'string' && SYNTHETIC_MARKERS.includes(value.trim());
/** Reads row-level metadata that the strict OHLCV parser intentionally ignores. Malformed input yields an empty scan; the parser reports it. */
export function scanImportText(text: string, format: 'csv' | 'json'): ImportScan {
  const scan: ImportScan = { symbols: [], adjustedColumn: null, syntheticLabel: false, partialSyntheticLabel: false, dateOnly: false, exampleId: matchExample(text)?.id ?? null };
  const symbols = new Set<string>(), times: unknown[] = [];
  let rowCount = 0, marked = 0, containerMarked = false;
  try {
    if (format === 'csv') {
      const rows = csvRows(text, { maxRows: IMPORT_MAX_ROWS + 1 }), header = rows.shift()?.map(cell => cell.trim().toLowerCase()) ?? [];
      scan.adjustedColumn = header.find(name => ADJUSTED.includes(name)) ?? null;
      const symbolIndex = header.findIndex(name => SYMBOL_KEYS.includes(name)), timeIndex = header.findIndex(name => TIME_KEYS.includes(name)), labelIndex = header.indexOf('label');
      for (const row of rows) {
        rowCount++; if (labelIndex >= 0 && isMarker(row[labelIndex])) marked++;
        if (symbolIndex >= 0 && row[symbolIndex]?.trim()) symbols.add(row[symbolIndex].trim().toUpperCase());
        if (timeIndex >= 0 && times.length < 50) times.push(row[timeIndex]);
      }
    } else {
      const data: unknown = JSON.parse(text), container = typeof data === 'object' && data !== null && !Array.isArray(data) ? data as Record<string, unknown> : null;
      const rows = Array.isArray(data) ? data : Array.isArray(container?.bars) ? container.bars as unknown[] : [];
      if (container) { for (const key of SYMBOL_KEYS) if (typeof container[key] === 'string' && (container[key] as string).trim()) symbols.add((container[key] as string).trim().toUpperCase()); containerMarked = isMarker(container.fixture); }
      for (const row of rows) {
        rowCount++;
        if (typeof row !== 'object' || row === null || Array.isArray(row)) continue;
        const record = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
        for (const key of SYMBOL_KEYS) if (typeof record[key] === 'string' && (record[key] as string).trim()) symbols.add((record[key] as string).trim().toUpperCase());
        scan.adjustedColumn ??= Object.keys(record).find(name => ADJUSTED.includes(name)) ?? null;
        if (isMarker(record.label)) marked++;
        if (times.length < 50) times.push(record.time ?? record.timestamp ?? record.date);
      }
    }
  } catch { return { ...scan, symbols: [], adjustedColumn: null }; }
  // Exact markers only: all rows marked, or a marked JSON container whose rows carry no conflicting partial marking.
  scan.syntheticLabel = rowCount > 0 && (marked === rowCount || containerMarked && marked === 0);
  scan.partialSyntheticLabel = !scan.syntheticLabel && (marked > 0 || containerMarked);
  scan.symbols = [...symbols].slice(0, 20);
  scan.dateOnly = times.length > 0 && times.every(value => typeof value === 'string' && /^\s*\d{4}-\d{2}-\d{2}\s*$/.test(value));
  return scan;
}

export function detectImportFormat(text: string): 'csv' | 'json' | null {
  const value = text.replace(/^﻿/, '').trimStart();
  return !value ? null : value.startsWith('{') || value.startsWith('[') ? 'json' : /^[^\n,]*,/.test(value) ? 'csv' : null;
}

// ---------------------------------------------------------------- metadata
export function importInstrument(draft: ImportDraft, synthetic = false): Instrument {
  const symbol = draft.symbol.trim().toUpperCase();
  return { id: `${draft.exchange}:${symbol}`, symbol, name: synthetic ? `${symbol} synthetic import example (not market data)` : 'Imported historical data', exchange: draft.exchange, currency: draft.currency, assetClass: draft.assetClass, tickSize: draft.tickSize, lotSize: draft.lotSize, timezone: draft.timezone };
}
const intraday = (resolution: string) => (RESOLUTION_SECONDS[resolution] ?? 86400) < 86400;
export function validateImportMetadata(draft: ImportDraft, synthetic = false): ImportIssue[] {
  const issues: ImportIssue[] = [], fail = (field: string, message: string) => issues.push({ severity: 'error', code: 'METADATA', field, message });
  const symbol = draft.symbol.trim().toUpperCase();
  if (!SYMBOL.test(symbol)) fail('symbol', 'Symbol: enter 1 to 24 letters, numbers, dots, carets, underscores or dashes (for example GME or BRK.B).');
  if (!(IMPORT_RESOLUTIONS as readonly string[]).includes(draft.resolution)) fail('resolution', 'Resolution: choose one of the listed bar durations.');
  if (!EXCHANGE.test(draft.exchange)) fail('exchange', 'Exchange: enter an exchange code such as NYSE, or USER-SUPPLIED when unknown.');
  else if (!synthetic && draft.exchange.startsWith('SYNTHETIC')) fail('exchange', 'Exchange: SYNTHETIC codes are reserved for generated example data. Use the real exchange code or USER-SUPPLIED.');
  else if (synthetic && draft.exchange !== 'SYNTHETIC-EXAMPLE') fail('exchange', 'Exchange: synthetic example data must keep the SYNTHETIC-EXAMPLE exchange code, so invented prices are never shown under a real exchange.');
  if (!/^[A-Z]{3}$/.test(draft.currency)) fail('currency', 'Currency: enter a three-letter code such as USD.');
  if (!Number.isFinite(draft.tickSize) || draft.tickSize <= 0) fail('tickSize', 'Tick size must be a positive number such as 0.01.');
  if (!Number.isFinite(draft.lotSize) || draft.lotSize <= 0) fail('lotSize', 'Lot size must be a positive number such as 1.');
  try { if (!draft.timezone.trim()) throw new Error(); new Intl.DateTimeFormat('en', { timeZone: draft.timezone }); } catch { fail('timezone', 'Exchange timezone: enter an IANA name such as America/New_York or UTC.'); }
  if (!IMPORT_ADJUSTMENTS.some(row => row.value === draft.adjustment)) fail('adjustment', 'Adjustment basis: choose one of the listed options.');
  if (!IMPORT_SESSIONS.some(row => row.value === draft.session)) fail('session', 'Session: choose one of the listed options.');
  if (draft.sourceLabel.length > 160 || /[\u0000-\u001f]/.test(draft.sourceLabel)) fail('sourceLabel', 'Source description: use at most 160 characters on one line.');
  if (draft.fileName.length > 255) fail('fileName', 'File name is too long to record.');
  if (SYMBOL.test(symbol) && symbol === 'IMPORTED') issues.push({ severity: 'warning', code: 'PLACEHOLDER_SYMBOL', field: 'symbol', message: 'Symbol is still the placeholder IMPORTED. Enter the real ticker so the watchlist, compare and screener rows identify this data.' });
  if (draft.adjustment === 'unknown') issues.push({ severity: 'warning', code: 'ADJUSTMENT_UNKNOWN', field: 'adjustment', message: 'Adjustment basis is unknown. Splits or dividends may appear as price jumps, and indicator, strategy and comparison results inherit that uncertainty.' });
  if (draft.session === 'unknown' && intraday(draft.resolution)) issues.push({ severity: 'warning', code: 'SESSION_UNKNOWN', field: 'session', message: 'Session basis is unknown for intraday bars. Session-anchored tools such as VWAP cannot tell regular from extended hours.' });
  return issues;
}

// ---------------------------------------------------------------- formatting
export function formatBarTime(time: number, dateOnly: boolean): string {
  const iso = new Date(time * 1000).toISOString();
  return dateOnly ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, iso.endsWith(':00.000Z') ? 16 : 19)} UTC`;
}
export function formatDuration(seconds: number): string {
  const unit = (value: number, name: string) => `${Number.isInteger(value) ? value : value.toFixed(1)} ${name}${value === 1 ? '' : 's'}`;
  return seconds < 60 ? unit(seconds, 'second') : seconds < 3600 ? unit(seconds / 60, 'minute') : seconds < 86400 ? unit(seconds / 3600, 'hour') : unit(seconds / 86400, 'day');
}
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null; };

// ---------------------------------------------------------------- preview and dataset
function contentIssues(draft: ImportDraft, bars: readonly Bar[], scan: ImportScan, context: ImportContext, dateOnly: boolean): ImportIssue[] {
  const issues: ImportIssue[] = [], symbol = draft.symbol.trim().toUpperCase();
  if (scan.symbols.length > 1) issues.push({ severity: 'error', code: 'MULTIPLE_SYMBOLS', field: 'symbol', message: `The file names ${scan.symbols.length >= 20 ? '20 or more' : scan.symbols.length} symbols (${scan.symbols.slice(0, 5).join(', ')}). Import one instrument per file.` });
  else if (scan.symbols.length === 1 && scan.symbols[0] !== symbol) issues.push({ severity: 'error', code: 'SYMBOL_MISMATCH', field: 'symbol', message: `The file's rows are labeled ${scan.symbols[0]}, but the Symbol field says ${symbol || '(empty)'}. Correct the symbol or choose the matching file.` });
  if (scan.adjustedColumn) issues.push({ severity: 'warning', code: 'ADJUSTED_COLUMN_IGNORED', field: 'adjustment', message: `The "${scan.adjustedColumn}" column is ignored; the close column is imported exactly as it is in the file. Set the adjustment basis to match the open/high/low/close columns, not the ignored column.` });
  const gaps = bars.slice(1).map((bar, index) => bar.time - bars[index].time), typical = median(gaps), declared = RESOLUTION_SECONDS[draft.resolution];
  if (intraday(draft.resolution) && bars.length > 0 && (dateOnly || bars.length > 1 && bars.every(bar => bar.time % 86400 === 0))) issues.push({ severity: 'error', code: 'DATE_ONLY_INTRADAY', field: 'resolution', message: `Rows carry dates only (UTC midnight), but the resolution is ${draft.resolution}. Choose 1D, 1W or 1M, or supply full timestamps with a timezone offset.` });
  else if (typical !== null && declared) {
    const finer = draft.resolution === '1M' ? typical < 27 * 86400 : typical < declared * 0.9;
    if (finer) issues.push({ severity: 'error', code: 'RESOLUTION_MISMATCH', field: 'resolution', message: `Rows are typically ${formatDuration(typical)} apart, finer than the declared ${draft.resolution}. Declare the resolution the file actually has; OpenCandle aggregates coarser intervals later without inventing bars.` });
    else if (draft.resolution === '1M' ? typical > 32 * 86400 : typical > declared * (draft.resolution === '1D' ? 4 : 1.5)) issues.push({ severity: 'warning', code: 'RESOLUTION_SPARSE', field: 'resolution', message: `Rows are typically ${formatDuration(typical)} apart, coarser than the declared ${draft.resolution}. Check the resolution; gaps are kept as gaps and never filled.` });
  }
  if (draft.timestampUnit === 'milliseconds' && bars.length && bars[bars.length - 1].time < 31536000 * 2) issues.push({ severity: 'warning', code: 'MILLISECONDS_SUSPECT', field: 'timestampUnit', message: 'Every timestamp decodes to 1970 or 1971. The numbers look like Unix seconds; choose Unix seconds instead of milliseconds.' });
  if (bars.length && bars.every(bar => bar.volume === 0)) issues.push({ severity: 'warning', code: 'ZERO_VOLUME', message: 'Every volume value is 0. Volume, VWAP, relative volume and volume-sized heatmaps will treat this as zero trading, not as missing volume.' });
  const jumps = bars.slice(1).flatMap((bar, index) => Math.abs(bar.close / bars[index].close - 1) > 0.4 ? [bar.time] : []);
  if (jumps.length) issues.push({ severity: 'warning', code: 'LARGE_MOVES', message: `${jumps.length} close-to-close move(s) exceed 40% (first at ${formatBarTime(jumps[0], dateOnly)}). If these are splits, the data is not split-adjusted; check the row or the adjustment basis.` });
  const future = bars.filter(bar => bar.time > context.now).length;
  if (future) issues.push({ severity: 'warning', code: 'FUTURE_ROWS', message: `${future} row(s) are dated after this computer's current time. Check the timestamps and timezone offsets.` });
  const same = (context.existing ?? []).filter(row => row.instrument.symbol === symbol);
  const identical = same.find(row => row.resolution === draft.resolution && row.bars.length === bars.length && row.bars.every((bar, index) => (['time', 'open', 'high', 'low', 'close', 'volume'] as const).every(key => bar[key] === bars[index][key])));
  if (identical) issues.push({ severity: 'warning', code: 'ALREADY_IMPORTED', message: `These exact ${draft.resolution} bars are already imported for ${symbol} (${identical.provenance.providerName}). Importing again adds a second source with the same prices.` });
  else if (same.length) issues.push({ severity: 'info', code: 'OTHER_SOURCES', message: `${same.length} other ${symbol} source(s) are already imported. This import adds a separate source; switch between them with the chart's Source selector.` });
  return issues;
}

export function describeSource(draft: ImportDraft, synthetic: boolean, example: boolean): string {
  const base = example ? 'OpenCandle synthetic import example (not market data)' : synthetic ? 'Local data labeled SYNTHETIC by its content' : draft.fileName ? `Local file ${draft.fileName.slice(0, 255)}` : 'Pasted local data';
  const label = draft.sourceLabel.trim();
  return label ? `${base}; declared source: ${label.slice(0, 160)}` : base;
}

/** Build the preview and, only when nothing blocks, the dataset to hand to the workspace publication path. */
export function prepareImport(draft: ImportDraft, parsed: ImportResult | null, scan: ImportScan | null, context: ImportContext): PreparedImport {
  const example = scan?.exampleId != null, synthetic = example || scan?.syntheticLabel === true;
  const issues: ImportIssue[] = [...validateImportMetadata(draft, synthetic)];
  const preview: ImportPreview = { state: 'empty', headline: '', synthetic, rowsRead: 0, validBars: 0, rejectedRows: 0, errors: 0, warnings: 0, first: null, last: null, typicalSpacing: null, largestGap: null, issues, disclosure: [], sample: [] };
  const finish = (dataset: BarDataset | null): PreparedImport => {
    issues.sort((a, b) => ['error', 'warning', 'info'].indexOf(a.severity) - ['error', 'warning', 'info'].indexOf(b.severity));
    preview.errors = issues.filter(issue => issue.severity === 'error').length; preview.warnings = issues.filter(issue => issue.severity === 'warning').length;
    if (!draft.text.trim() || !parsed) { preview.state = 'empty'; preview.headline = 'Choose a file, paste data or load a demo example to see a preview.'; return { preview, dataset: null }; }
    preview.state = dataset ? 'ready' : 'blocked';
    preview.headline = dataset ? `Ready: ${preview.validBars.toLocaleString('en-US')} bar${preview.validBars === 1 ? '' : 's'} for ${dataset.instrument.symbol}${synthetic ? ' (SYNTHETIC)' : ''}${preview.warnings ? `, ${preview.warnings} warning(s) to review` : ''}.` : `Import blocked: fix ${preview.errors} problem(s) listed below. Nothing has been changed.`;
    return { preview, dataset };
  };
  if (!draft.text.trim() || !parsed) return finish(null);
  preview.rowsRead = parsed.rowCount;
  // Timestamp-unit failures are one diagnosis, not one misleading message per row.
  const unitRows = parsed.diagnostics.filter(diagnostic => diagnostic.code === 'INVALID_ROW' && diagnostic.message.startsWith('Timestamp unit:'));
  for (const diagnostic of parsed.diagnostics) if (!unitRows.includes(diagnostic)) issues.push({ severity: diagnostic.severity, code: diagnostic.code, message: diagnostic.message, row: diagnostic.row, field: diagnostic.field });
  if (unitRows.length) {
    const ms = draft.timestampUnit === 'milliseconds', selected = ms ? 'Unix milliseconds' : 'Unix seconds', other = ms ? 'Unix seconds' : 'Unix milliseconds';
    issues.push({ severity: 'error', code: 'TIMESTAMP_UNIT', field: 'timestampUnit', row: unitRows[0].row, message: `${unitRows.length} row(s) cannot be read as ${selected} (first at data row ${unitRows[0].row}: ${unitRows[0].message.slice('Timestamp unit: '.length)}) Choose ${other} under Parsing rules > Numeric timestamps.` });
  }
  if (scan?.partialSyntheticLabel) issues.push({ severity: 'error', code: 'MIXED_SYNTHETIC_MARKER', message: 'Some rows carry the SYNTHETIC example marker and others do not. Do not mix invented example rows with other data; import them separately.' });
  preview.rejectedRows = parsed.diagnostics.filter(diagnostic => diagnostic.code === 'INVALID_ROW').length;
  const looksLike = detectImportFormat(draft.text);
  if (!parsed.ok && looksLike && looksLike !== draft.format) issues.push({ severity: 'error', code: 'FORMAT_MISMATCH', field: 'format', message: `The text looks like ${looksLike.toUpperCase()}, but Format is set to ${draft.format.toUpperCase()}. Switch Format to ${looksLike.toUpperCase()}.` });
  if (!parsed.ok || !parsed.dataset) return finish(null);
  const bars = parsed.bars, dateOnly = scan?.dateOnly === true || bars.every(bar => bar.time % 86400 === 0) && !intraday(draft.resolution);
  issues.push(...contentIssues(draft, bars, scan ?? { symbols: [], adjustedColumn: null, syntheticLabel: false, partialSyntheticLabel: false, dateOnly: false, exampleId: null }, context, dateOnly));
  preview.validBars = bars.length;
  const first = formatBarTime(bars[0].time, dateOnly), last = formatBarTime(bars[bars.length - 1].time, dateOnly);
  preview.first = first; preview.last = last;
  const gaps = bars.slice(1).map((bar, index) => ({ seconds: bar.time - bars[index].time, from: bars[index].time, to: bar.time })), typical = median(gaps.map(gap => gap.seconds));
  preview.typicalSpacing = typical === null ? null : formatDuration(typical);
  const largest = gaps.reduce<typeof gaps[number] | null>((best, gap) => !best || gap.seconds > best.seconds ? gap : best, null);
  preview.largestGap = largest && typical !== null && largest.seconds > typical ? `${formatDuration(largest.seconds)} between ${formatBarTime(largest.from, dateOnly)} and ${formatBarTime(largest.to, dateOnly)} (kept as a gap, not filled)` : null;
  const picks = bars.length <= 6 ? bars.map((bar, index) => ({ bar, index })) : [0, 1, 2, bars.length - 3, bars.length - 2, bars.length - 1].map(index => ({ bar: bars[index], index }));
  preview.sample = picks.map(({ bar, index }) => ({ position: `${index + 1} of ${bars.length}`, time: formatBarTime(bar.time, dateOnly), open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume }));
  const instrument = importInstrument(draft, synthetic), source = describeSource(draft, synthetic, example);
  const adjustment = IMPORT_ADJUSTMENTS.find(row => row.value === draft.adjustment)?.label ?? draft.adjustment, session = IMPORT_SESSIONS.find(row => row.value === draft.session)?.label ?? draft.session;
  preview.disclosure = [
    { label: 'Source', value: `${source}. ${synthetic ? 'Clearly labeled SYNTHETIC; not market data.' : 'Your own data; redistribution rights unconfirmed.'}` },
    { label: 'Instrument', value: `${instrument.exchange}:${instrument.symbol}, ${instrument.assetClass === 'etf' ? 'ETF' : 'stock'}, ${instrument.currency}, tick ${instrument.tickSize}, lot ${instrument.lotSize}` },
    { label: 'Resolution', value: `${draft.resolution} declared${preview.typicalSpacing ? `; rows typically ${preview.typicalSpacing} apart` : ''}` },
    { label: 'Time basis', value: dateOnly ? `Date-only rows are UTC calendar dates; no exchange open or close time is invented. Exchange timezone recorded as ${instrument.timezone}.` : `Timestamps converted to Unix seconds and shown in UTC; exchange timezone recorded as ${instrument.timezone}.` },
    { label: 'Session', value: draft.session === 'unknown' ? session : `${session} (declared by you, not verified by OpenCandle)` },
    { label: 'Adjustment', value: draft.adjustment === 'unknown' ? adjustment : `${adjustment} (declared by you, not verified by OpenCandle)` },
    { label: 'Coverage', value: `${bars.length.toLocaleString('en-US')} bars from ${first} to ${last}; only what this file contains. Gaps are kept, never filled.` },
    { label: 'Updates', value: `Static file. As of the last bar (${last}); no live connection, no delay figure, no automatic refresh.` },
  ];
  if (issues.some(issue => issue.severity === 'error')) return finish(null);
  const notes = [
    draft.adjustment === 'unknown' ? 'Price adjustment basis not declared; split and dividend effects are unverified.' : `Adjustment basis declared by the user as ${draft.adjustment}; OpenCandle did not verify it.`,
    draft.session === 'unknown' ? 'Session basis not declared.' : `Session basis declared by the user as ${draft.session}; OpenCandle did not verify it.`,
    dateOnly ? 'Date-only rows interpreted as UTC calendar dates, not exchange opening timestamps.' : 'Timestamps normalized to Unix seconds from the offsets or numeric values in the file.',
    ...(synthetic ? ['SYNTHETIC: generated example data, not market data.'] : []),
  ];
  const dataset: BarDataset = createPreparedLocalCandleDataset(parsed.dataset, instrument, draft.resolution, { ...parsed.dataset.provenance, providerName: source, datasetId: `local:${instrument.id}`, revision: localImportRevision(parsed.dataset.bars), fixture: synthetic, coverage: `${bars.length} imported bars, ${first} to ${last}; universe limited to this file`, adjustment: draft.adjustment, session: draft.session, timezone: instrument.timezone, license: synthetic ? 'Synthetic example generated for OpenCandle; not market data' : parsed.dataset.provenance.license, notes });
  return finish(dataset);
}

/** Convenience path used by tests and simple callers: parse, scan and prepare one draft. */
export function prepareImportDraft(draft: ImportDraft, context: ImportContext): PreparedImport {
  if (!draft.text.trim()) return prepareImport(draft, null, null, context);
  return prepareImport(draft, parseImportText(draft), scanImportText(draft.text, draft.format), context);
}

export function describeIssue(issue: ImportIssue): string {
  return `${issue.row ? `Data row ${issue.row}: ` : ''}${issue.message}`;
}

// ---------------------------------------------------------------- after import
/** Distinguishes otherwise identical "GME | 1D | LOCAL IMPORT" entries in source selectors. */
export function importSourceLabel(dataset: BarDataset): string {
  const p = dataset.provenance, bars = dataset.bars, dateOnly = /[DWM]$/.test(dataset.resolution) && bars.every(bar => bar.time % 86400 === 0);
  const range = bars.length ? `${formatBarTime(bars[0].time, dateOnly)} to ${formatBarTime(bars[bars.length - 1].time, dateOnly)}` : 'no bars';
  return `${dataset.instrument.symbol} | ${dataset.resolution} | ${datasetSourceTag(dataset)} | ${range} | ${p.providerName}`.slice(0, 300);
}
/** A source picker row (grid strip): an import keeps importSourceLabel; any other source (live, stub,
 * derived, fixture) gets the shared source tag, so a derived feed is DERIVED and never LOCAL IMPORT. */
export function sourceOptionLabel(dataset: BarDataset): string {
  if (dataset.provenance.providerId === 'local-import') return importSourceLabel(dataset);
  const tag = datasetSourceTag(dataset); // A plain synthetic fixture reads as "Example data" (it was "Demo data") (the chart badge says DEMO), never the raw tag.
  // Outside example and legacy modes a demo-source option has no data (it is the bar-less placeholder).
  return `${dataset.instrument.symbol} |  ${dataset.resolution} |  ${tag === 'SYNTHETIC' ? (demoDataMode() === 'off' ? 'No data' : 'Example data') : tag}`;
}
/** Workspace status after a committed import, stating the actual declared basis instead of a fixed "unknown" sentence. */
export function importCommitMessage(dataset: BarDataset): string {
  const p = dataset.provenance;
  return `Imported ${dataset.bars.length.toLocaleString('en-US')} ${p.fixture ? 'SYNTHETIC ' : ''}bars for ${dataset.instrument.symbol}. Session ${p.session === 'unknown' ? 'basis unknown' : p.session + ' (declared)'}; adjustment ${p.adjustment === 'unknown' ? 'basis unknown' : p.adjustment + ' (declared)'}. Use the chart's Source selector to switch sources.`;
}

export interface ToolCoverage { tool: string; supplied: string; notSupplied: string; }
/** What imported OHLCV bars do and do not feed, per tool, at this checkpoint. */
export const OHLCV_TOOL_COVERAGE: readonly ToolCoverage[] = Object.freeze([
  { tool: 'Chart and Data Window', supplied: 'Candles, bars, line, area and Heikin Ashi views; open, high, low, close and volume per bar.', notSupplied: 'Bid/ask, trades, order book, or any bar the file does not contain.' },
  { tool: 'Indicators and CandleScript', supplied: 'Everything calculated from OHLCV: moving averages, RSI, MACD, ATR, Bollinger Bands, volume studies, VWAP.', notSupplied: 'Tick or quote inputs. VWAP sessions depend on the session you declare; date-only bars give one VWAP point per bar.' },
  { tool: 'Intervals', supplied: 'Coarser intervals derived from your bars in UTC buckets (for example 1D to 1W).', notSupplied: 'Finer intervals. A daily file never becomes 5-minute bars; exchange holidays and DST are not modeled.' },
  { tool: 'Compare symbols', supplied: 'Overlay of any loaded source with matching resolution.', notSupplied: 'Symbols you have not imported (only synthetic demo series exist for them).' },
  { tool: 'Watchlist and Advanced View', supplied: 'Last close, change and volume from the final imported bars for rows bound to this source.', notSupplied: 'Live quotes, pre/post-market prices, company names or profiles.' },
  { tool: 'Stock screener', supplied: 'Price, change, volume, average and relative volume, SMA, EMA, RSI, ATR, MACD, performance, period high/low; name, exchange, currency and asset class from your metadata.', notSupplied: 'Fundamentals, market cap, sector, float or short interest. The default screen covers 1D USD sources; intraday imports need a matching screen resolution.' },
  { tool: 'Heatmap', supplied: 'Volume or turnover sizing and change, gap, relative-volume or range colors.', notSupplied: 'Market cap, AUM, sector and fund class. These need separately imported dated metadata and are never inferred.' },
  { tool: 'Strategy tester and Replay', supplied: 'Bar-by-bar simulation and replay on the imported bars, with the fill policy shown in the report.', notSupplied: 'Intrabar path, spreads, borrow or real fills. Results inherit the adjustment and session basis.' },
  { tool: 'Paper trading', supplied: 'Account, orders and history in virtual money.', notSupplied: 'Quotes. At this checkpoint virtual bid/ask quotes are generated only for SYNTHETIC sources, so paper tickets on a non-synthetic import have no quote to fill against.' },
  { tool: 'Alerts', supplied: 'Conditions evaluated against loaded bars.', notSupplied: 'New data. A static file never updates by itself, so alerts can observe only bars that are loaded (for example during Replay).' },
  { tool: 'Fundamentals, News, Calendar, Symbol details', supplied: 'Nothing: OHLCV contains no fundamentals, filings, events or company profile.', notSupplied: 'Use their own Import buttons or the optional public SEC data request; each keeps its own provenance.' },
]);
export const IMPORT_FIRST_USE_STEPS: readonly string[] = Object.freeze([
  'Choose a CSV or JSON file, paste text, or load a demo example. One instrument per import.',
  'Fill in the symbol, resolution and instrument details, and declare the adjustment and session basis if your source states them. Leave them Unknown otherwise.',
  'Read the preview. Errors block the import; warnings are allowed but stay visible. Nothing changes until you press Import and open.',
  'Import and open switches the active chart to the new source. The chart header and footer then show LOCAL IMPORT (or SYNTHETIC) instead of the demo series.',
  "Switch between the synthetic demo, this import and other imports with the chart's Source selector. Imported sources are saved with the local workspace and restored at launch; Export workspace keeps a portable copy.",
]);
