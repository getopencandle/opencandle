import Decimal from 'decimal.js';
import { formatPaperExpiry } from './paper-expiry';
import type { PaperAccount, PaperEvent, PaperFill, PaperOrder } from './paper';

/** CSV export of the Paper manager tables. Scope and columns are our own choice. */
export type PaperExportKind = 'orders' | 'positions' | 'history' | 'account-history' | 'journal';
export interface PaperExportTable { kind: PaperExportKind; fileName: string; columns: string[]; rows: Array<Array<string | number>>; }
/**
 * The chart timezone for the exported times. `name` is the zone as the dialog names it ("New York") and `iso` writes
 * ISO 8601 wall time with its UTC offset ("2026-10-23T09:30:00-04:00"); the dialog passes the chart-time-text one. With a zone,
 * every time column gets a "<column> (<zone>, ISO offset)" twin appended after the existing columns, which stay first and
 * unchanged (their UTC text is pinned), so each cell names its own offset and DST cannot make a row ambiguous.
 */
export interface PaperExportZone { name: string; iso: (seconds: number) => string; }
export interface PaperExportOptions { ordersColumns?: { expiry: boolean }; journalQuery?: string; zone?: PaperExportZone; }
export interface PaperExportBridge { exportData?: (value: { text: string; format: 'csv'; suggestedName: string }) => Promise<{ ok: boolean; error?: { message: string } }>; }

const FORMULA_START = /^[=+\-@\t\r]/;
/** Strings that a spreadsheet could read as a formula or command get a single leading quote. Numbers are written as numbers. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value);
  if (FORMULA_START.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
export function toCsv(columns: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Same instruction wording the Orders table shows. */
export function orderInstruction(account: PaperAccount, order: PaperOrder): string {
  const group = order.bracket ? account.brackets?.groups.find(row => row.id === order.bracket!.groupId) : undefined;
  return order.sessionPolicy || group?.sessionPolicy ? order.extendedHours ? 'Outside RTH eligible' : 'Regular session only' : order.extendedHours ? 'Legacy: outside enabled' : 'Legacy: outside disabled';
}
export function orderExpiryText(order: Pick<PaperOrder, 'expiresAt' | 'timeInForce'>, zone?: PaperExportZone): string {
  const expiry = formatPaperExpiry(order.expiresAt);
  return expiry.kind === 'scheduled' ? zone ? zone.iso(order.expiresAt!) : expiry.text : expiry.kind === 'missing' && order.timeInForce === 'GTC' ? 'No scheduled expiry' : 'Expiry unavailable';
}
const isWorking = (order: PaperOrder) => order.status === 'working' || order.status === 'triggered';
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const zoneColumns = (zone: PaperExportZone | undefined, names: string[]) => zone ? names.map(name => `${name} (${zone.name}, ISO offset)`) : [];

/** LV text search over event text, case-insensitive. Nothing is ever deleted by searching. */
export function filterJournal(events: PaperEvent[], query: string): PaperEvent[] {
  const needle = query.trim().toLowerCase();
  return needle ? events.filter(event => (event.type + ' ' + event.message).toLowerCase().includes(needle)) : events;
}

export interface PaperPositionClose {
  index: number; instrumentId: string; symbol: string; direction: 'long' | 'short'; status: 'open' | 'closed';
  openedAt: number; closedAt: number | null; fills: PaperFill[]; realizedGross: number; fees: number; netRealized: number; opensFromReversal: boolean;
}
/**
 * Groups fills by position lifetime: a position opens at the first fill from flat and closes when the quantity
 * returns to zero or flips. A reversing fill is listed under both positions; its realized profit and fee count under the one it closed.
 */
export function paperPositionCloses(account: PaperAccount): PaperPositionClose[] {
  const symbols = new Map(account.orders.map(order => [order.id, order.instrument.symbol]));
  const groups: PaperPositionClose[] = [], current = new Map<string, { group: PaperPositionClose; quantity: Decimal }>();
  const open = (fill: PaperFill, signed: Decimal, reversal: boolean) => {
    const group: PaperPositionClose = { index: groups.length + 1, instrumentId: fill.instrumentId, symbol: symbols.get(fill.orderId) ?? fill.instrumentId, direction: signed.gt(0) ? 'long' : 'short', status: 'open', openedAt: fill.at, closedAt: null, fills: [fill], realizedGross: 0, fees: 0, netRealized: 0, opensFromReversal: reversal };
    groups.push(group); current.set(fill.instrumentId, { group, quantity: signed }); return group;
  };
  const settle = (group: PaperPositionClose) => { group.netRealized = new Decimal(group.realizedGross).sub(group.fees).toDecimalPlaces(10).toNumber(); };
  for (const fill of account.fills) {
    const signed = new Decimal(fill.side === 'buy' ? fill.quantity : -fill.quantity), held = current.get(fill.instrumentId);
    if (!held) { const group = open(fill, signed, false); group.fees = fill.commission; settle(group); continue; }
    held.group.fills.push(fill);
    held.group.realizedGross = new Decimal(held.group.realizedGross).add(fill.realizedGross).toDecimalPlaces(10).toNumber();
    held.group.fees = new Decimal(held.group.fees).add(fill.commission).toDecimalPlaces(10).toNumber();
    const next = held.quantity.add(signed);
    if (next.isZero() || next.isPositive() !== held.quantity.isPositive()) {
      held.group.status = 'closed'; held.group.closedAt = fill.at; settle(held.group); current.delete(fill.instrumentId);
      if (!next.isZero()) { const group = open(fill, next, true); settle(group); }
    } else { held.quantity = next; settle(held.group); }
  }
  return groups;
}

export function paperExportTable(account: PaperAccount, kind: PaperExportKind, options: PaperExportOptions = {}): PaperExportTable {
  const base = { kind, fileName: kind === 'orders' ? 'OpenCandle-virtual-orders.csv' : kind === 'positions' ? 'OpenCandle-virtual-positions.csv' : kind === 'history' ? 'OpenCandle-virtual-order-history.csv' : kind === 'account-history' ? 'OpenCandle-virtual-account-history.csv' : 'OpenCandle-virtual-journal.csv' };
  if (kind === 'orders') {
    const expiry = options.ordersColumns?.expiry ?? true, zone = expiry ? options.zone : undefined;
    return { ...base, columns: ['Symbol', 'Side / type', 'Quantity', 'Limit / stop', 'Instruction', 'Status', ...(expiry ? ['Expiry (UTC)'] : []), ...zoneColumns(zone, ['Expiry'])], rows: account.orders.filter(isWorking).map(order => [order.instrument.symbol, `${order.side} ${order.type}`, order.quantity, `${order.limitPrice ?? 'None'} / ${order.stopPrice ?? 'None'}`, orderInstruction(account, order), order.status, ...(expiry ? [orderExpiryText(order)] : []), ...(zone ? [orderExpiryText(order, zone)] : [])]) };
  }
  if (kind === 'positions') {
    return { ...base, columns: ['Symbol', 'Side', 'Quantity', 'Average price', 'Mark', 'Unrealized P&L', 'Realized gross'], rows: Object.values(account.positions).map(position => {
      const quote = account.quotes[position.instrument.id], mark = quote ? position.quantity > 0 ? quote.bid : quote.ask : null;
      return [position.instrument.symbol, position.quantity > 0 ? 'Long' : 'Short', position.quantity, position.averagePrice, mark ?? 'Unavailable', mark === null ? 'Unavailable' : new Decimal(mark).sub(position.averagePrice).mul(position.quantity).toDecimalPlaces(10).toNumber(), position.realizedGross];
    }) };
  }
  if (kind === 'history') {
    const zone = options.zone;
    return { ...base, columns: ['Updated', 'Symbol', 'Side / type', 'Quantity', 'Limit / stop', 'Status', 'Average fill', 'Reason', ...zoneColumns(zone, ['Updated'])], rows: account.orders.filter(order => !isWorking(order)).slice().reverse().map(order => [iso(order.updatedAt), order.instrument.symbol, `${order.side} ${order.type}${order.bracket ? ` (${order.bracket.leg === 'tp' ? 'take profit' : 'stop loss'})` : ''}`, order.quantity, `${order.limitPrice ?? 'None'} / ${order.stopPrice ?? 'None'}`, order.status, order.averageFillPrice ?? 'None', order.rejectionReason ?? '', ...(zone ? [zone.iso(order.updatedAt)] : [])]) };
  }
  if (kind === 'account-history') {
    const zone = options.zone;
    return { ...base, columns: ['Position', 'Symbol', 'Direction', 'Status', 'Closed (UTC)', 'Fill time (UTC)', 'Fill side', 'Fill quantity', 'Fill price', 'Virtual fee', 'Realized gross', ...zoneColumns(zone, ['Closed', 'Fill time'])], rows: paperPositionCloses(account).flatMap(group => group.fills.map(fill => [group.index, group.symbol, group.direction, group.status, group.closedAt === null ? '' : iso(group.closedAt), iso(fill.at), fill.side, fill.quantity, fill.price, fill.commission, fill.realizedGross, ...(zone ? [group.closedAt === null ? '' : zone.iso(group.closedAt), zone.iso(fill.at)] : [])])) };
  }
  const zone = options.zone;
  return { ...base, columns: ['Time', 'Order', 'Event', 'Details', ...zoneColumns(zone, ['Time'])], rows: filterJournal(account.events, options.journalQuery ?? '').slice().reverse().map(event => [iso(event.at), event.orderId, event.type, event.message, ...(zone ? [zone.iso(event.at)] : [])]) };
}
/**
 * Writes the table through the data export bridge. The write is all or nothing from LV's side: a refusal or a thrown error only
 * reports "The file could not be saved." and nothing else in the account or workspace changes.
 */
export async function exportPaperCsv(table: PaperExportTable, bridge: PaperExportBridge | undefined): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!bridge?.exportData) return { ok: false, message: 'Saving a file needs the desktop app.' };
  try {
    const result = await bridge.exportData({ text: toCsv(table.columns, table.rows), format: 'csv', suggestedName: table.fileName });
    return result.ok ? { ok: true } : { ok: false, message: 'The file could not be saved.' };
  } catch { return { ok: false, message: 'The file could not be saved.' }; }
}
