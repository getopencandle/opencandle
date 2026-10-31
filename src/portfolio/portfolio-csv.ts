// CSV import/export (our own columns) and the one-way paper-book import.
import type { PaperAccount } from '../domain/paper';
import { PORTFOLIO_LIMITS, PORTFOLIO_TX_TYPES, applyTransaction, newBook, normalizeTransaction, sortTransactions, type Portfolio, type PortfolioTx, type PortfolioTxType } from './portfolio';

export const PORTFOLIO_CSV_COLUMNS = ['date', 'type', 'symbol', 'quantity', 'price', 'amount', 'fee', 'note'] as const;
export const PORTFOLIO_CSV_TEMPLATE = PORTFOLIO_CSV_COLUMNS.join(',') + '\n2026-01-05,deposit,,,,10000,,Opening cash\n2026-01-06,buy,AAA,10,100,,1,\n2026-02-10,dividend,AAA,,,5,,\n2026-03-02,sell,AAA,4,110,,1,\n';
export const PORTFOLIO_CSV_MAX_BYTES = 4 * 1024 * 1024;
export type PortfolioImportMode = 'create' | 'add' | 'replace';
export const PORTFOLIO_IMPORT_MODES: Record<PortfolioImportMode, string> = { create: 'Create a new portfolio', add: 'Add to the selected portfolio', replace: 'Replace the history of the selected portfolio' };

/** RFC 4180 style parser: quoted fields, doubled quotes, CRLF or LF, optional BOM. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false, any = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) { if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += ch; continue; }
    if (ch === '"' && field === '') { quoted = true; any = true; }
    else if (ch === ',') { row.push(field); field = ''; any = true; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; if (any || field !== '' || row.length) { row.push(field); rows.push(row); } row = []; field = ''; any = false; }
    else { field += ch; any = true; }
  }
  if (any || field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const csvField = (value: string | number | undefined) => {
  if (value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text; // spreadsheet formula guard
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
};
const unguard = (value: string) => /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
export const isoDate = (time: number) => new Date(time * 1000).toISOString().slice(0, 10);
export function parseDate(text: string): number | null {
  const value = text.trim(); if (!value) return null;
  if (/^\d{9,11}$/.test(value)) return Number(value);
  if (!/^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) return null;
  const parsed = Date.parse(value.length === 10 ? value + 'T00:00:00Z' : /(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value.replace(' ', 'T') : value.replace(' ', 'T') + 'Z');
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

export function portfolioToCsv(portfolio: Portfolio): string {
  const lines = [PORTFOLIO_CSV_COLUMNS.join(',')];
  for (const tx of portfolio.transactions) lines.push([isoDate(tx.time), tx.type, tx.symbol, tx.quantity, tx.price, tx.amount, tx.fee, tx.note].map(csvField).join(','));
  return lines.join('\n') + '\n';
}
export function portfolioExportName(portfolio: Portfolio): string { return 'OpenCandle-portfolio-' + portfolio.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) + '.csv'; }

export interface CsvPreview { rows: PortfolioTx[]; errors: { line: number; message: string }[]; lines: number; }
export function parsePortfolioCsv(text: string, source: PortfolioTx['source'] = 'csv'): CsvPreview | { fatal: string } {
  if (new TextEncoder().encode(text).length > PORTFOLIO_CSV_MAX_BYTES) return { fatal: 'The file is larger than 4 MiB.' };
  const table = parseCsvRows(text); if (!table.length) return { fatal: 'The file is empty.' };
  const header = table[0].map(name => name.trim().toLowerCase()), at = (name: string) => header.indexOf(name);
  for (const required of ['date', 'type']) if (at(required) < 0) return { fatal: `Missing the "${required}" column. Expected columns: ${PORTFOLIO_CSV_COLUMNS.join(', ')}.` };
  const rows: PortfolioTx[] = [], errors: { line: number; message: string }[] = [];
  const num = (cells: string[], name: string) => { const cell = at(name) < 0 ? '' : (cells[at(name)] ?? '').trim(); return cell === '' ? undefined : Number(cell.replace(/,/g, '')); };
  table.slice(1).forEach((cells, offset) => {
    const line = offset + 2; if (cells.every(cell => !cell.trim())) return;
    if (rows.length + errors.length >= PORTFOLIO_LIMITS.transactions * 2) return;
    const type = (cells[at('type')] ?? '').trim().toLowerCase() as PortfolioTxType, time = parseDate(cells[at('date')] ?? '');
    if (!PORTFOLIO_TX_TYPES.includes(type)) { errors.push({ line, message: `Unknown type "${(cells[at('type')] ?? '').trim()}".` }); return; }
    if (time === null) { errors.push({ line, message: 'Date must look like 2026-01-31.' }); return; }
    const note = at('note') < 0 ? '' : unguard((cells[at('note')] ?? '').trim());
    const result = normalizeTransaction({ type, time, symbol: at('symbol') < 0 ? '' : unguard((cells[at('symbol')] ?? '').trim()), quantity: num(cells, 'quantity'), price: num(cells, 'price'), amount: num(cells, 'amount'), fee: num(cells, 'fee'), note, source }, source);
    if (result.ok) rows.push({ ...result.value, id: result.value.id }); else errors.push({ line, message: result.error });
  });
  return { rows: sortTransactions(rows), errors, lines: table.length - 1 };
}

/** One-way import of a paper account: opening balance as a deposit, fills as buys and sells (commission becomes the fee).
 * Short sales (selling more than held) cannot be represented in a long-only portfolio and are skipped with a warning. */
export function paperAccountToTransactions(account: PaperAccount): { rows: PortfolioTx[]; warnings: string[]; currency: string } {
  const rows: PortfolioTx[] = [], warnings: string[] = [], book = newBook();
  const symbolOf = new Map<string, string>();
  for (const position of Object.values(account.positions)) symbolOf.set(position.instrument.id, position.instrument.symbol);
  for (const order of account.orders) symbolOf.set(order.instrument.id, order.instrument.symbol);
  const opening: PortfolioTx = { id: 'paper-' + account.id + '-open', type: 'deposit', time: account.createdAt, amount: account.settings.initialBalance, note: 'Virtual opening balance', source: 'paper' };
  if (account.settings.initialBalance > 0) { rows.push(opening); applyTransaction(book, opening); }
  for (const fill of [...account.fills].sort((a, b) => a.at - b.at)) {
    const symbol = symbolOf.get(fill.instrumentId);
    if (!symbol) { warnings.push(`Fill ${fill.id} skipped: its instrument is no longer known.`); continue; }
    const tx: PortfolioTx = { id: 'paper-' + fill.id, type: fill.side, time: fill.at, symbol: symbol.toUpperCase(), quantity: fill.quantity, price: fill.price, ...(fill.commission > 0 ? { fee: fill.commission } : {}), note: 'Virtual fill', source: 'paper' };
    const error = applyTransaction(book, tx);
    if (error) { warnings.push(`Fill ${fill.id} skipped (short or oversold in a long-only portfolio).`); continue; }
    rows.push(tx);
  }
  return { rows, warnings, currency: account.settings.currency };
}
