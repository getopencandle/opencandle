import { STRATEGY_REPORT_METRICS } from './strategy-report-catalog';
import { strategyOrderLabel } from './strategy';
import { isStrategyReport, STRATEGY_REPORT_LIMITS, StrategyReportError, type StrategyReport, type StrategyReportSide } from './strategy-report';

const encoder = new TextEncoder();
class BoundedText {
  private chunks: string[] = [];
  private pending = '';
  private bytes = 0;
  append(text: string) { this.pending += text; if (this.pending.length >= 8192) this.flush(); }
  private flush() { if (!this.pending) return; this.bytes += encoder.encode(this.pending).byteLength; if (this.bytes > STRATEGY_REPORT_LIMITS.exportBytes) throw new StrategyReportError('REPORT_EXPORT_LIMIT', 'This report export exceeds 20 MiB UTF-8. Choose a smaller accepted execution; no partial file was produced.'); this.chunks.push(this.pending); this.pending = ''; }
  finish() { this.flush(); return this.chunks.join(''); }
}
function check(report: StrategyReport, side: StrategyReportSide) { if (!isStrategyReport(report)) throw new StrategyReportError('REPORT_EXPORT_IDENTITY', 'Only a completed report from the current model can be exported.'); if (!['all', 'long', 'short'].includes(side)) throw new StrategyReportError('REPORT_EXPORT_SIDE', 'Unknown report direction.'); }
export function strategyCsvCell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new StrategyReportError('REPORT_EXPORT_NUMBER', 'Non-finite report numbers cannot be exported.'); return String(value); }
  const safe = /^[\s\uFEFF]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function strategyReportCsv(report: StrategyReport, kind: 'metrics' | 'trades' | 'orders', side: StrategyReportSide = 'all'): string {
  check(report, side); const writer = new BoundedText(), row = (fields: (string | number | null)[]) => writer.append(fields.map(strategyCsvCell).join(',') + '\r\n');
  const metadata = [report.context.executionId, report.context.sourceLabel, report.context.currency, report.context.timezone, report.fillBasis, report.config.chartType];
  const metadataHeaders = ['execution_id', 'source_label', 'explicit_currency', 'display_timezone', 'fill_basis', 'chart_type'];
  if (kind === 'metrics') {
    row([...metadataHeaders, 'metric_key', 'metric_label', 'unit', ...(['all', 'long', 'short'] as const).flatMap(value => [value + '_value', value + '_status', value + '_basis', value + '_reason'])]);
    for (const definition of STRATEGY_REPORT_METRICS) row([...metadata, definition.key, definition.label, definition.unit, ...(['all', 'long', 'short'] as const).flatMap(group => { const metric = report.metrics[group][definition.key]; return [metric.value, metric.status, metric.basis, metric.reason]; })]);
  } else if (kind === 'trades') {
    row([...metadataHeaders, 'selected_direction', 'record_id', 'state', 'trade_number', 'direction', 'entry_order', 'exit_order', 'entry_bar_id', 'entry_bar_index', 'entry_bar_event_unix_seconds', 'entry_phase', 'exit_bar_id', 'exit_bar_index', 'exit_bar_event_unix_seconds', 'exit_phase', 'time_basis', 'quantity', 'entry_price', 'exit_price_or_open_mark', 'entry_notional', 'gross_price_pnl', 'allocated_fees', 'net_pnl', 'return_percent_of_entry_notional', 'cumulative_closed_net', 'cumulative_percent_of_initial', 'inclusive_bars_held', 'favorable_gross', 'favorable_status', 'favorable_reason', 'adverse_gross', 'adverse_status', 'adverse_reason', 'favorable_percent_of_entry', 'adverse_percent_of_entry', 'excursion_basis']);
    for (const trade of report.trades) if (side === 'all' || trade.direction === side) row([...metadata, side, trade.id, 'closed', trade.number, trade.direction, trade.entrySignal, trade.exitSignal, trade.entry.barId, trade.entry.barIndex, trade.entry.time, trade.entry.phase, trade.exit.barId, trade.exit.barIndex, trade.exit.time, trade.exit.phase, 'bar event/open time; phase is simulated, not an exact intrabar timestamp', trade.quantity, trade.entryPrice, trade.exitPrice, trade.entryNotional, trade.grossProfit, trade.commission, trade.netProfit, trade.returnPercent, trade.cumulativeNet, trade.cumulativePercent, trade.barsHeld, trade.favorable.value, trade.favorable.status, trade.favorable.reason, trade.adverse.value, trade.adverse.status, trade.adverse.reason, trade.favorablePercent.value, trade.adversePercent.value, trade.favorable.basis]);
    for (const lot of report.openLots) if (side === 'all' || lot.direction === side) row([...metadata, side, lot.id, 'open', null, lot.direction, lot.entrySignal, null, lot.entry.barId, lot.entry.barIndex, lot.entry.time, lot.entry.phase, null, null, null, null, 'bar event/open time; open mark is final supplied execution close', lot.quantity, lot.entryPrice, lot.mark, lot.entryNotional, lot.grossProfit, lot.remainingEntryCommission, lot.netProfit, 100 * lot.netProfit / lot.entryNotional, null, null, null, null, 'unavailable', 'Open-lot excursion is not calculated in this report.', null, 'unavailable', 'Open-lot excursion is not calculated in this report.', null, null, 'Open net includes remaining entry fees under the declared OpenCandle convention.']);
  } else if (kind === 'orders') {
    row([...metadataHeaders, 'order_id', 'side', 'type', 'quantity', 'created_bar', 'eligible_bar', 'limit_price', 'stop_price', 'status', 'fill_bar', 'fill_price', 'reduce_only', 'reason']);
    for (const order of report.orders) row([...metadata, strategyOrderLabel(order), order.action, order.type, order.quantity, order.createdBar, order.eligibleBar, order.limitPrice ?? null, order.stopPrice ?? null, order.status, order.fillBar, order.fillPrice, order.reduceOnly ? 'true' : 'false', order.reason ?? null]);
  } else throw new StrategyReportError('REPORT_EXPORT_KIND', 'Unsupported report export.');
  return writer.finish();
}
export function strategyReportJson(report: StrategyReport): string {
  check(report, 'all'); const writer = new BoundedText(); let nodes = 0;
  function write(value: unknown, depth: number) {
    if (++nodes > STRATEGY_REPORT_LIMITS.work || depth > 20) throw new StrategyReportError('REPORT_EXPORT_LIMIT', 'Report JSON exceeds its bounded serialization work.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') { writer.append(JSON.stringify(value)); return; }
    if (typeof value === 'number') { if (!Number.isFinite(value)) throw new StrategyReportError('REPORT_EXPORT_NUMBER', 'Non-finite report numbers cannot be exported.'); writer.append(String(value)); return; }
    if (Array.isArray(value)) { writer.append('['); for (let i = 0; i < value.length; i++) { if (i) writer.append(','); write(value[i], depth + 1); } writer.append(']'); return; }
    if (!value || typeof value !== 'object') throw new StrategyReportError('REPORT_EXPORT_VALUE', 'Unsupported report serialization value.');
    writer.append('{'); let count = 0; for (const [key, child] of Object.entries(value)) { if (child === undefined) continue; if (count++) writer.append(','); writer.append(JSON.stringify(key) + ':'); write(child, depth + 1); } writer.append('}');
  }
  write(report, 0); return writer.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// A real Office Open XML workbook (stored ZIP, inline strings), not relabelled CSV/JSON.
// Sheets: Metrics, Trades, Orders (the same rows and columns as the CSV exports) and Assumptions (schema version,
// execution identity, policies and diagnostics). Text cells keep the CSV formula-safety prefix.
export const STRATEGY_XLSX_SCHEMA = 'lv-strategy-report-xlsx-1';
const CRC_TABLE = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();
export function crc32(bytes: Uint8Array): number { let crc = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8); return (crc ^ 0xFFFFFFFF) >>> 0; }
/** Minimal ZIP writer (method 0, stored). Fixed DOS timestamp 1980-01-01 keeps output deterministic. */
export function storedZip(files: readonly { name: string; data: Uint8Array }[]): Uint8Array {
  const locals: Uint8Array[] = [], centrals: Uint8Array[] = []; let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name), crc = crc32(file.data), size = file.data.length;
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true); lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, size, true); lv.setUint32(22, size, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true); local.set(name, 30);
    const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); central.set(name, 46);
    locals.push(local, file.data); centrals.push(central); offset += local.length + size;
  }
  const centralSize = centrals.reduce((sum, row) => sum + row.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22); let at = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, at); at += part.length; }
  return out;
}
type XlsxCell = string | number | null;
/** Parse the CSV this module writes back into typed cells: quoted fields are text, bare fields numbers, empty is blank. */
function csvRows(text: string): XlsxCell[][] {
  const rows: XlsxCell[][] = []; let row: XlsxCell[] = [], i = 0;
  while (i < text.length) {
    if (text[i] === '"') {
      let value = ''; i++;
      for (;;) { const quote = text.indexOf('"', i); value += text.slice(i, quote); i = quote + 1; if (text[i] === '"') { value += '"'; i++; } else break; }
      row.push(value);
    } else { let end = i; while (end < text.length && text[end] !== ',' && text[end] !== '\r') end++; const raw = text.slice(i, end); row.push(raw === '' ? null : Number(raw)); i = end; }
    if (text[i] === ',') { i++; if (text[i] === '\r' || i >= text.length) row.push(null); }
    if (text[i] === '\r') { rows.push(row); row = []; i += 2; }
  }
  return rows;
}
const xmlText = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function columnName(index: number) { let name = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name; return name; }
function sheetXml(rows: readonly XlsxCell[][]): string {
  const body = rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => {
    if (cell === null) return '';
    const ref = columnName(c) + (r + 1);
    if (typeof cell === 'number') { if (!Number.isFinite(cell)) throw new StrategyReportError('REPORT_EXPORT_NUMBER', 'Non-finite report numbers cannot be exported.'); return `<c r="${ref}"><v>${cell}</v></c>`; }
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlText(cell)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}
/** Workbook bytes for a completed report. Size is bounded by the same 20 MiB export limit. */
export function strategyReportXlsx(report: StrategyReport): Uint8Array {
  check(report, 'all');
  const sheets: { name: string; rows: XlsxCell[][] }[] = [
    { name: 'Metrics', rows: csvRows(strategyReportCsv(report, 'metrics')) },
    { name: 'Trades', rows: csvRows(strategyReportCsv(report, 'trades')) },
    { name: 'Orders', rows: csvRows(strategyReportCsv(report, 'orders')) },
    { name: 'Assumptions', rows: [['key', 'value'], ['export_schema', STRATEGY_XLSX_SCHEMA], ['report_schema_version', report.schemaVersion], ['execution_id', report.context.executionId], ['source_label', report.context.sourceLabel], ['explicit_currency', report.context.currency], ['display_timezone', report.context.timezone], ['fill_basis', report.fillBasis], ['simulated', 'All orders, capital and results are simulated with virtual money.'], ...report.policies.map((policy, index): XlsxCell[] => ['policy_' + (index + 1), policy]), ...report.diagnostics.map((text, index): XlsxCell[] => ['diagnostic_' + (index + 1), text])].map(row => row.map(cell => typeof cell === 'string' && /^[\s﻿]*[=+\-@]/.test(cell) ? `'${cell}` : cell)) },
  ];
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const files = [{ name: '[Content_Types].xml', text: contentTypes }, { name: '_rels/.rels', text: rootRels }, { name: 'xl/workbook.xml', text: workbook }, { name: 'xl/_rels/workbook.xml.rels', text: workbookRels }, ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, text: sheetXml(sheet.rows) }))];
  let total = 0; const encoded = files.map(file => { const data = encoder.encode(file.text); total += data.length; return { name: file.name, data }; });
  if (total > STRATEGY_REPORT_LIMITS.exportBytes) throw new StrategyReportError('REPORT_EXPORT_LIMIT', 'This report workbook exceeds 20 MiB. Choose a smaller accepted execution; no partial file was produced.');
  return storedZip(encoded);
}
