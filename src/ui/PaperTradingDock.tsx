import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Decimal from 'decimal.js';
import { attachPaperPositionExits, cancelPaperOrder, cancelPaperOrders, closePaperPosition, modifyPaperExitPlan, modifyPaperOrder, paperExitTarget, paperPositionExitTarget, configurePaperAccount, paperAvailableFunds, paperFillBasisLabel, paperMarginBuffer, paperSummary, resetPaperAccount, reversePaperPosition, PAPER_NOTICE, type PaperAccount, type PaperCommission, type PaperOrder, type PaperResult, type PaperSide } from '../domain/paper';
import type { Instrument, Quote } from '../domain/types';
import type { PaperExitLevelInput } from '../domain/paper-brackets';
import { createBookAccount, deleteBookAccount, listBookAccounts, renameBookAccount, selectBookAccount, type CreateBookAccountInput, type PaperBook, type PaperBookResult, type PaperState } from '../domain/paper-book';
import { exportPaperCsv, paperExportTable, type PaperExportBridge } from '../domain/paper-export';
import { filterPaperJournal, paperJournalCounts, paperJournalExportTable, paperJournalRows, PAPER_JOURNAL_FILTERS, type PaperJournalFilter, type PaperJournalRow } from '../domain/paper-journal';
import { PaperDom } from './PaperDom';
import { PaperDomPane } from './PaperDomPane';
import { closePaperDomPane, openPaperDomPane, paperDomPaneState, subscribePaperDomPane, type PaperDomPaneState } from './paper-dom-pane';
import './dialog-forms.css';
import { InfoTip } from './dialog-extras';
import { formatPaperPrice } from './PaperChartLines';
import { chartZoneName, formatChartDateTime, type ChartClockHours } from './chart-time-text';

/**
 * Broker-style bottom panel for the virtual account (LV layout and wording): a summary strip, then Positions, Orders, History, Journal, Account
 * and DOM tabs. Every action goes through the paper engine and the host's account authority (onAccountChange), exactly like the
 * Paper trading dialog, which stays the place for the full order ticket and account management.
 */
/** Esc inside an inline Modify / Protect form cancels that form only (nothing else listening for Esc sees it). */
export const formEscape = (cancel: () => void) => (event: React.KeyboardEvent) => { if (event.key !== 'Escape' || event.nativeEvent.isComposing) return; event.preventDefault(); event.stopPropagation(); cancel(); };
export type PaperDockTab = 'positions' | 'orders' | 'history' | 'journal' | 'account' | 'dom';
export const PAPER_DOCK_TABS: ReadonlyArray<{ id: PaperDockTab; label: string }> = [
  { id: 'positions', label: 'Positions' }, { id: 'orders', label: 'Orders' }, { id: 'history', label: 'History' }, { id: 'journal', label: 'Journal' }, { id: 'account', label: 'Account' }, { id: 'dom', label: 'DOM' },
];
/** Trade value (average x quantity), market value (mark x quantity) and the position's realized P&L (gross, before fees). */
export interface PaperDockPositionRow { /** The working take profit / stop loss protecting the position ('' when none). */ takeProfit: string; stopLoss: string; instrumentId: string; symbol: string; side: 'Long' | 'Short'; quantity: number; average: string; last: string; pnl: string; pnlValue: number | null; pnlPercent: string; tradeValue: string; marketValue: string; realized: string; realizedValue: number; }
export interface PaperDockOrderRow { id: string; symbol: string; side: string; type: string; quantity: number; limit: string; stop: string; status: string; placed: string; }
/** Limit, stop, placing time and duration (time in force) join the history columns. */
export interface PaperDockHistoryRow { id: string; time: string; symbol: string; side: string; type: string; quantity: number; price: string; status: string; fee: string; limit: string; stop: string; placed: string; duration: string; /** What the fill price was based on (Ask, Bid, Last price, Order price); empty for an order that did not fill or an older fill. */ basis: string; }
/** GTC is a ticket choice now (Buy/Sell ticket), so it is no longer labelled legacy. */
const durationLabel: Record<NonNullable<PaperOrder['timeInForce']>, string> = { DAY: 'Day', GTD: 'Good till date', GTC: 'Good till cancelled' };
export function paperDockDuration(order: Pick<PaperOrder, 'timeInForce'> & { ticket?: PaperOrder['ticket'] }): string {
  const kind = order.ticket?.input.validity.kind;
  return kind === 'week' ? 'Week' : kind === 'month' ? 'Month' : durationLabel[order.timeInForce ?? 'GTC'];
}
export interface PaperDockSummary { balance: string; equity: string; unrealized: string; realized: string; available: string; fees: string; startingBalance: string; }

const money = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? 'n/a' : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (value: number | null) => value === null ? 'n/a' : (value > 0 ? '+' : '') + money(value);
/** Dock times on the chart wall clock (chart timezone formatter); the column header names the zone. UTC by default. */
export interface PaperDockClock { zone?: string; hours?: ChartClockHours; }
/** "2026-10-23 09:30" in `zone`. A non-finite time stays '' (the shared formatter would print the raw number). */
export function paperDockTime(seconds: number, zone = 'UTC', hours: ChartClockHours = '24'): string { return Number.isFinite(seconds) ? formatChartDateTime(seconds, zone, { hours, zone: false }) : ''; }
const clockTime = (clock: PaperDockClock) => (seconds: number) => paperDockTime(seconds, clock.zone ?? 'UTC', clock.hours ?? '24');
const working = (order: PaperOrder) => order.status === 'working' || order.status === 'triggered';
const typeLabel: Record<PaperOrder['type'], string> = { market: 'Market', limit: 'Limit', stop: 'Stop', 'stop-limit': 'Stop limit', 'trailing-stop': 'Trailing stop' };
const statusLabel: Record<PaperOrder['status'], string> = { working: 'Working', triggered: 'Triggered', filled: 'Filled', cancelled: 'Cancelled', expired: 'Expired', rejected: 'Rejected' };
const sideLabel = (side: PaperSide) => side === 'buy' ? 'Buy' : 'Sell';

export function paperDockSummary(account: PaperAccount, now: number): PaperDockSummary {
  const summary = paperSummary(account, now);
  return { balance: money(summary.balance), equity: money(summary.equity), unrealized: signed(summary.unrealized), realized: signed(summary.netRealized), available: money(paperAvailableFunds(summary)), fees: money(summary.fees), startingBalance: money(account.settings.initialBalance) };
}
/** Unrealized P&L as a percent of the trade value (average price x quantity): "+2.00%". Null when the trade value is zero. Shared with the Paper trading dialog. */
export function paperPositionPnlPercent(pnl: number, averagePrice: number, quantity: number): string | null {
  const basis = new Decimal(averagePrice).mul(Math.abs(quantity));
  return basis.isZero() ? null : (pnl >= 0 ? '+' : '') + new Decimal(pnl).div(basis).mul(100).toFixed(2) + '%';
}
export function paperDockPositions(account: PaperAccount): PaperDockPositionRow[] {
  return Object.values(account.positions).map(position => {
    const quote = account.quotes[position.instrument.id], mark = quote ? position.quantity > 0 ? quote.bid : quote.ask : null, tick = position.instrument.tickSize;
    const pnl = mark === null ? null : new Decimal(mark).sub(position.averagePrice).mul(position.quantity).toNumber();
    const basis = new Decimal(position.averagePrice).mul(Math.abs(position.quantity));
    const exits = paperDockProtect(account, position.instrument.id);
    return { takeProfit: exits.takeProfit, stopLoss: exits.stopLoss, instrumentId: position.instrument.id, symbol: position.instrument.symbol, side: position.quantity > 0 ? 'Long' : 'Short', quantity: Math.abs(position.quantity), average: formatPaperPrice(position.averagePrice, tick), last: mark === null ? 'n/a' : formatPaperPrice(mark, tick), pnl: signed(pnl), pnlValue: pnl, pnlPercent: pnl === null ? 'n/a' : paperPositionPnlPercent(pnl, position.averagePrice, position.quantity) ?? 'n/a',
      tradeValue: money(basis.toNumber()), marketValue: mark === null ? 'n/a' : money(new Decimal(mark).mul(Math.abs(position.quantity)).toNumber()), realized: signed(position.realizedGross), realizedValue: position.realizedGross };
  });
}
export function paperDockOrders(account: PaperAccount, clock: PaperDockClock = {}): PaperDockOrderRow[] {
  const paperDockTime = clockTime(clock);
  return account.orders.filter(working).map(order => ({ id: order.id, symbol: order.instrument.symbol, side: sideLabel(order.side), type: typeLabel[order.type], quantity: order.quantity, limit: order.limitPrice === undefined ? '' : formatPaperPrice(order.limitPrice, order.instrument.tickSize), stop: order.stopPrice === undefined ? '' : formatPaperPrice(order.stopPrice, order.instrument.tickSize), status: statusLabel[order.status], placed: paperDockTime(order.createdAt) }));
}
export function paperDockHistory(account: PaperAccount, clock: PaperDockClock = {}): PaperDockHistoryRow[] {
  const fees = new Map<string, number>(), paperDockTime = clockTime(clock);
  for (const fill of account.fills) fees.set(fill.orderId, new Decimal(fees.get(fill.orderId) ?? 0).add(fill.commission).toNumber());
  return account.orders.filter(order => !working(order)).sort((a, b) => b.updatedAt - a.updatedAt || (b.submissionSequence ?? 0) - (a.submissionSequence ?? 0)).map(order => ({ id: order.id, time: paperDockTime(order.updatedAt), symbol: order.instrument.symbol, side: sideLabel(order.side), type: typeLabel[order.type], quantity: order.quantity, price: order.averageFillPrice === null ? '' : formatPaperPrice(order.averageFillPrice, order.instrument.tickSize), status: statusLabel[order.status] + (order.rejectionReason ? ': ' + order.rejectionReason : ''), fee: fees.has(order.id) ? money(fees.get(order.id)!) : '',
    limit: order.limitPrice === undefined ? '' : formatPaperPrice(order.limitPrice, order.instrument.tickSize), stop: order.stopPrice === undefined ? '' : formatPaperPrice(order.stopPrice, order.instrument.tickSize), placed: paperDockTime(order.createdAt), duration: paperDockDuration(order), basis: paperFillBasisLabel(account.fills.find(fill => fill.orderId === order.id)?.basis) }));
}
/** Reset with a new starting balance. The account keeps its name and settings; its orders, fills and history are cleared. */
export function resetPaperDockAccount(account: PaperAccount, balanceText: string, now: number): { ok: true; account: PaperAccount } | { ok: false; message: string } {
  const balance = Number(balanceText.replace(/,/g, '').trim());
  if (!balanceText.trim() || !Number.isFinite(balance) || balance <= 0 || balance > 1e12) return { ok: false, message: 'Enter a starting balance above 0.' };
  try { return { ok: true, account: resetPaperAccount(account, { initialBalance: balance }, Math.max(now, 0)) }; }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
}


/** Orders tab status views. Working includes triggered stop-limits. View set. */
export type PaperDockOrderFilter = 'working' | 'filled' | 'cancelled' | 'rejected' | 'expired' | 'all';
export const PAPER_DOCK_ORDER_FILTERS: ReadonlyArray<{ id: PaperDockOrderFilter; label: string }> = [
  { id: 'working', label: 'Working' }, { id: 'filled', label: 'Filled' }, { id: 'cancelled', label: 'Cancelled' }, { id: 'rejected', label: 'Rejected' }, { id: 'expired', label: 'Expired' }, { id: 'all', label: 'All' },
];
export interface PaperDockAnyOrderRow extends PaperDockOrderRow { /** The order's take profit / stop loss (a working entry's exit plan, or the exit child's own price); '' when none. */ takeProfit: string; stopLoss: string; working: boolean; /** Trailing stop only: "Trail 0.50" or "Trail 2%"; '' otherwise. */ trail: string; fillPrice: string; updated: string; reason: string; duration: string; expires: string; }
export function paperDockOrdersByStatus(account: PaperAccount, filter: PaperDockOrderFilter, clock: PaperDockClock = {}): PaperDockAnyOrderRow[] {
  const paperDockTime = clockTime(clock);
  const keep = (order: PaperOrder) => filter === 'all' || (filter === 'working' ? working(order) : order.status === filter);
  return account.orders.filter(keep).sort((a, b) => b.createdAt - a.createdAt || (b.submissionSequence ?? 0) - (a.submissionSequence ?? 0)).map(order => ({ id: order.id, symbol: order.instrument.symbol, side: sideLabel(order.side), type: typeLabel[order.type], quantity: order.quantity, limit: order.limitPrice === undefined ? '' : formatPaperPrice(order.limitPrice, order.instrument.tickSize), stop: order.stopPrice === undefined ? '' : formatPaperPrice(order.stopPrice, order.instrument.tickSize), status: statusLabel[order.status], placed: paperDockTime(order.createdAt), working: working(order), trail: paperDockTrailText(order), fillPrice: order.averageFillPrice === null ? '' : formatPaperPrice(order.averageFillPrice, order.instrument.tickSize), updated: paperDockTime(order.updatedAt), reason: order.rejectionReason ?? '', duration: paperDockDuration(order), expires: order.expiresAt === undefined ? '' : paperDockTime(order.expiresAt), ...paperDockOrderExits(order) }));
}
/** The trail of a trailing stop in words: "Trail 0.50" (price distance) or "Trail 2%" (percent of the best price). '' for any other order. */
export function paperDockTrailText(order: Pick<PaperOrder, 'type' | 'trailDistance' | 'trailPercent' | 'instrument'>): string {
  if (order.type !== 'trailing-stop') return '';
  if (order.trailPercent !== undefined) return `Trail ${order.trailPercent}%`;
  return order.trailDistance === undefined ? '' : `Trail ${formatPaperPrice(order.trailDistance, order.instrument.tickSize)}`;
}
/** TP / SL text of one order. An entry shows its exit plan (several levels joined), an exit child its own leg. */
export function paperDockOrderExits(order: PaperOrder): { takeProfit: string; stopLoss: string } {
  const tick = order.instrument.tickSize, text = (prices: Array<number | undefined>) => prices.filter((price): price is number => price !== undefined).map(price => formatPaperPrice(price, tick)).join(', ');
  if (order.bracket) return { takeProfit: order.bracket.leg === 'tp' ? text([order.limitPrice]) : '', stopLoss: order.bracket.leg === 'sl' ? text([order.stopPrice]) : '' };
  const levels = order.exits?.levels ?? [];
  return { takeProfit: text(levels.map(level => level.takeProfit)), stopLoss: text(levels.map(level => level.stopLoss)) };
}
export function paperDockOrderCounts(account: PaperAccount): Record<PaperDockOrderFilter, number> {
  const counts: Record<PaperDockOrderFilter, number> = { working: 0, filled: 0, cancelled: 0, rejected: 0, expired: 0, all: account.orders.length };
  for (const order of account.orders) counts[working(order) ? 'working' : order.status as Exclude<PaperDockOrderFilter, 'working' | 'all'>]++;
  return counts;
}

/** Column sorting: numbers (including "1,234.50", "+2.00", "1.00%") compare as numbers, blanks and "n/a" sort last, other text by locale. */
export type PaperDockSort = { column: string; direction: 'asc' | 'desc' } | null;
const sortNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.replace(/,/g, '').replace(/%$/, '').trim();
  return /^[+-]?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
};
export function sortPaperDockRows<T extends object>(rows: readonly T[], sort: PaperDockSort): T[] {
  if (!sort) return [...rows];
  const key = sort.column as keyof T, factor = sort.direction === 'asc' ? 1 : -1;
  const blank = (value: unknown) => value === null || value === undefined || value === '' || value === 'n/a';
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const left = a.row[key] as unknown, right = b.row[key] as unknown;
    if (blank(left) || blank(right)) return blank(left) === blank(right) ? a.index - b.index : blank(left) ? 1 : -1;
    const x = sortNumber(left), y = sortNumber(right);
    const order = x !== null && y !== null ? x - y : String(left).localeCompare(String(right));
    return order === 0 ? a.index - b.index : order * factor;
  }).map(entry => entry.row);
}
export function nextPaperDockSort(current: PaperDockSort, column: string): PaperDockSort {
  if (current?.column !== column) return { column, direction: 'asc' };
  return current.direction === 'asc' ? { column, direction: 'desc' } : null;
}

/** Account summary details: margin figures come from the engine; n/a when a quote is missing. */
export interface PaperDockAccountDetails { accountMargin: string; ordersMargin: string; marginBuffer: string; buyingPower: string; currency: string; leverage: string; commission: string; }
/** The commission model in words, as the Account tab shows it. */
export function paperDockCommissionText(commission: PaperCommission, currency: string): string {
  return commission.kind === 'percent' ? `${commission.value}% of notional per fill` : commission.kind === 'per-unit' ? `${commission.value} ${currency} per unit` : commission.value === 0 ? 'None' : `${commission.value} ${currency} per filled order`;
}
/** The dock's commission form. Applies to future fills only (configurePaperAccount); a blank or negative amount is refused. */
export function configurePaperDockCommission(account: PaperAccount, kind: PaperCommission['kind'], valueText: string, now: number): PaperResult | { ok: false; message: string } {
  const value = Number(valueText.replace(/,/g, '').trim());
  if (!valueText.trim() || !Number.isFinite(value) || value < 0) return { ok: false, message: 'Enter a commission of 0 or more.' };
  if (kind === 'percent' && value > 100) return { ok: false, message: 'A percent commission is at most 100.' };
  return configurePaperAccount(account, { commission: { kind, value } }, Math.max(now, account.clock));
}
export function paperDockAccountDetails(account: PaperAccount, now: number): PaperDockAccountDetails {
  const summary = paperSummary(account, now), buffer = paperMarginBuffer(summary);
  return { accountMargin: money(summary.marginUsed), ordersMargin: money(summary.reservedMargin), marginBuffer: buffer.value === null ? 'n/a' : buffer.text + '%', buyingPower: money(summary.buyingPower), currency: account.settings.currency, leverage: `${account.settings.leverage}x`, commission: paperDockCommissionText(account.settings.commission, account.settings.currency) };
}

/**
 * Modify from the Orders tab (the order row edit). Quantity and the order's own limit/stop price change through
 * modifyPaperOrder, exactly like a chart line drag or the ticket. Trailing stops and bracket children keep their own editors
 * (the ticket and the chart lines), so they are refused here with where to go. Blank fields keep the current value.
 */
export interface PaperDockOrderEdit { orderId: string; quantity: string; limit: string; stop: string; /** A working entry's single-level exit plan; absent when it has none or several levels. Blank removes that leg. */ takeProfit?: string; stopLoss?: string; /** A trailing stop's trail amount (distance or percent, as it was placed). */ trail?: string; }
export function paperDockOrderEdit(order: PaperOrder): PaperDockOrderEdit {
  const tick = order.instrument.tickSize;
  const level = order.exits?.mode === 'single' ? order.exits.levels[0] : undefined;
  return { orderId: order.id, quantity: String(order.quantity), limit: order.limitPrice === undefined ? '' : formatPaperPrice(order.limitPrice, tick), stop: order.stopPrice === undefined ? '' : formatPaperPrice(order.stopPrice, tick), ...(order.type === 'trailing-stop' ? { trail: String(order.trailPercent ?? (order.trailDistance === undefined ? '' : formatPaperPrice(order.trailDistance, tick))) } : {}), ...(level ? { takeProfit: level.takeProfit === undefined ? '' : formatPaperPrice(level.takeProfit, tick), stopLoss: level.stopLoss === undefined ? '' : formatPaperPrice(level.stopLoss, tick) } : {}) };
}
export function paperDockOrderEditable(order: PaperOrder): string | null {
  if (!working(order)) return 'Only working virtual orders can be modified.';
  if (order.bracket) return 'Take profit and stop loss orders move by dragging their chart lines, or from the position they protect.';
  return null;
}
const positiveNumber = (text: string): number | null => { const value = Number(text.replace(/,/g, '').trim()); return text.trim() && Number.isFinite(value) && value > 0 ? value : null; };
export function modifyPaperDockOrder(account: PaperAccount, edit: PaperDockOrderEdit, now: number): PaperResult | { ok: false; message: string } {
  const order = account.orders.find(row => row.id === edit.orderId);
  if (!order) return { ok: false, message: 'This virtual order is no longer in the account.' };
  const refusal = paperDockOrderEditable(order); if (refusal) return { ok: false, message: refusal };
  const changes: { quantity?: number; limitPrice?: number; stopPrice?: number; trailDistance?: number; trailPercent?: number } = {};
  if (edit.quantity.trim()) { const quantity = positiveNumber(edit.quantity); if (quantity === null) return { ok: false, message: 'Enter a quantity above 0.' }; if (quantity !== order.quantity) changes.quantity = quantity; }
  if (order.type === 'trailing-stop' && edit.trail?.trim()) {
    const amount = positiveNumber(edit.trail), field = order.trailPercent !== undefined ? 'trailPercent' : 'trailDistance';
    if (amount === null) return { ok: false, message: 'Enter a trail amount above 0.' };
    if (amount !== order[field]) changes[field] = amount;
  }
  for (const [field, text, label] of order.type === 'trailing-stop' ? [] as const : [['limitPrice', edit.limit, 'limit'], ['stopPrice', edit.stop, 'stop']] as const) {
    if (order[field] === undefined || !text.trim()) continue;
    const price = positiveNumber(text); if (price === null) return { ok: false, message: `Enter a ${label} price above 0.` };
    if (price !== order[field]) changes[field] = price;
  }
  // The exit plan changes first, while the entry is surely still working (an order change can fill it).
  let exits: PaperExitLevelInput | null = null;
  const level = order.exits?.mode === 'single' ? order.exits.levels[0] : undefined;
  if (level && edit.takeProfit !== undefined && edit.stopLoss !== undefined) {
    const next: PaperExitLevelInput = { quantity: changes.quantity !== undefined && level.quantity === order.quantity ? changes.quantity : level.quantity };
    for (const [field, text, label] of [['takeProfit', edit.takeProfit, 'take profit'], ['stopLoss', edit.stopLoss, 'stop loss']] as const) {
      if (!text.trim()) continue;
      const price = positiveNumber(text); if (price === null) return { ok: false, message: `Enter a ${label} price above 0, or leave it blank for none.` };
      next[field] = price;
    }
    if (next.takeProfit === undefined && next.stopLoss === undefined) return { ok: false, message: 'Keep a take profit or a stop loss. To trade without exits, cancel the order and place it again.' };
    if (next.takeProfit !== level.takeProfit || next.stopLoss !== level.stopLoss || next.quantity !== level.quantity) exits = next;
  }
  if (!Object.keys(changes).length && !exits) return { ok: false, message: 'Nothing changed.' };
  let current = account;
  if (exits) {
    let result: PaperResult;
    try { result = modifyPaperExitPlan(account, paperExitTarget(account, 'parent', order.id), { schemaVersion: 1, mode: 'single', levels: [exits] }, now); }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
    if (!result.ok || !Object.keys(changes).length) return result;
    current = result.account;
  }
  return modifyPaperOrder(current, order.id, changes, now);
}

/**
 * Protect position from the Positions tab (the position row's "Protect position"): one take profit and/or stop loss
 * price for the whole open quantity, saved with the engine's position-exit snapshot (attachPaperPositionExits). It replaces
 * the exits already protecting the position. Both blank removes nothing; use the chart line's x or the Orders tab for that.
 */
export interface PaperDockProtect { instrumentId: string; takeProfit: string; stopLoss: string; }
export function paperDockProtect(account: PaperAccount, instrumentId: string): PaperDockProtect {
  const position = account.positions[instrumentId], tick = position?.instrument.tickSize ?? 0.01;
  const exits = account.orders.filter(order => working(order) && order.bracket && order.instrument.id === instrumentId);
  const limit = exits.find(order => order.bracket!.leg === 'tp')?.limitPrice, stop = exits.find(order => order.bracket!.leg === 'sl')?.stopPrice;
  return { instrumentId, takeProfit: limit === undefined ? '' : formatPaperPrice(limit, tick), stopLoss: stop === undefined ? '' : formatPaperPrice(stop, tick) };
}
export function protectPaperDockPosition(account: PaperAccount, edit: PaperDockProtect, now: number): PaperResult | { ok: false; message: string } {
  const position = account.positions[edit.instrumentId];
  if (!position) return { ok: false, message: 'This virtual position is closed.' };
  const level: { quantity: number; takeProfit?: number; stopLoss?: number } = { quantity: Math.abs(position.quantity) };
  if (edit.takeProfit.trim()) { const price = positiveNumber(edit.takeProfit); if (price === null) return { ok: false, message: 'Enter a take profit price above 0.' }; level.takeProfit = price; }
  if (edit.stopLoss.trim()) { const price = positiveNumber(edit.stopLoss); if (price === null) return { ok: false, message: 'Enter a stop loss price above 0.' }; level.stopLoss = price; }
  if (level.takeProfit === undefined && level.stopLoss === undefined) return { ok: false, message: 'Enter a take profit, a stop loss, or both.' };
  const long = position.quantity > 0;
  if (level.takeProfit !== undefined && level.stopLoss !== undefined && (long ? level.takeProfit <= level.stopLoss : level.takeProfit >= level.stopLoss)) return { ok: false, message: long ? 'For a long position the take profit must be above the stop loss.' : 'For a short position the take profit must be below the stop loss.' };
  let target; try { target = paperPositionExitTarget(account, edit.instrumentId); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
  return attachPaperPositionExits(account, target, { schemaVersion: 1, mode: 'single', levels: [level] }, target.owners.map(row => row.id), now);
}

/** Create-account input check for the panel form: optional balance (blank keeps the 100000 default) and a 3-letter currency. */
export function paperDockCreateInput(name: string, balanceText: string, currencyText: string): { ok: true; input: CreateBookAccountInput } | { ok: false; message: string } {
  const balanceRaw = balanceText.replace(/,/g, '').trim(), currency = currencyText.trim().toUpperCase() || 'USD';
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, message: 'Currency needs a three-letter code such as USD.' };
  if (!balanceRaw) return { ok: true, input: { name, currency } };
  const balance = Number(balanceRaw);
  if (!Number.isFinite(balance) || balance <= 0 || balance > 1e12) return { ok: false, message: 'Enter a starting balance above 0.' };
  return { ok: true, input: { name, initialBalance: balance, currency } };
}

/** The host's multi-account authority (the same one the Paper trading dialog uses). Absent in replay. */
export interface PaperDockManager {
  book: PaperBook | null;
  onStateChange: (next: PaperState, expected: PaperState) => boolean | void;
  idFactory?: () => string;
}

export interface PaperTradingDockProps {
  account: PaperAccount;
  instrument: Instrument;
  now: number;
  open: boolean;
  onToggle: (open: boolean) => void;
  /** The host's account authority. Returns false when it refused the change. */
  onAccountChange: (next: PaperAccount, expected: PaperAccount) => boolean | void;
  /** Opens the order ticket (the Paper trading dialog), optionally for a side. */
  onOpenTicket: (side: PaperSide | null) => void;
  replay?: boolean;
  initialTab?: PaperDockTab;
  /** Account create/select/rename/delete from the panel. */
  manager?: PaperDockManager;
  /** The host's current quote, for the DOM ladder. */
  quote?: Quote | null;
  /** Display-only live best bid and ask for the DOM ladder, and its plain source. */
  book?: Quote | null; bookSource?: string | null;
  exportBridge?: PaperExportBridge;
  /** A plain reason paper trading is refused on this chart (a derived symbol). Buy/Sell and the DOM are off. */
  tradingRefusal?: string | null;
  /** The Trading panel tab of the bottom panel. It has no collapsed bar of its own (closed renders nothing),
   *  fills the tab, and renders into dockHost when given. */
  embedded?: boolean;
  dockHost?: HTMLElement | null;
  /** The chart timezone (chartTimeZone) and hour cycle for every time in the panel. Default UTC, 24 hours. */
  timezone?: string;
  timeHours?: ChartClockHours;
  /** Clicking a position or order symbol shows that symbol on the chart (a row click). Absent: plain text. */
  onSelectSymbol?: (instrument: Instrument) => void;
}
/** What Close all positions acts on: the account identity and each position's size. A change after the dialog opens refuses the close. */
export function paperDockPositionsFingerprint(account: PaperAccount): string {
  return JSON.stringify([account.id, account.runId, Object.values(account.positions).map(position => [position.instrument.id, position.quantity])]);
}
/**
 * Close all positions composes the engine's close-position call (a reduce-only market
 * order per position, paper.ts unchanged) on one account copy and publishes it as one account change. A refused close changes
 * nothing. The sentence says how many filled and how many wait for a usable quote.
 */
export function closeAllPaperDockPositions(account: PaperAccount, now: number): { ok: true; account: PaperAccount; message: string } | { ok: false; message: string } {
  const ids = Object.keys(account.positions);
  if (!ids.length) return { ok: false, message: 'No open virtual positions.' };
  let next = account, waiting = 0;
  for (const id of ids) {
    const result = closePaperPosition(next, id, now);
    if (!result.ok) return { ok: false, message: `${account.positions[id].instrument.symbol} could not be closed: ${result.diagnostics.map(row => row.message).join(' ') || 'the virtual account refused it.'} No position was closed.` };
    if (result.account.orders.find(order => order.id === result.orderId)?.status !== 'filled') waiting++;
    next = result.account;
  }
  const count = `${ids.length} virtual position${ids.length === 1 ? '' : 's'}`;
  return { ok: true, account: next, message: waiting ? `Close orders sent for ${count}; ${waiting} wait${waiting === 1 ? 's' : ''} for a usable quote.` : `${count} closed.` };
}

export function PaperTradingDock(props: PaperTradingDockProps) {
  const { account, now, manager } = props, zone = props.timezone ?? 'UTC', clock: PaperDockClock = { zone, hours: props.timeHours ?? '24' }, zoneName = chartZoneName(zone);
  const [tab, setTab] = useState<PaperDockTab>(props.initialTab ?? 'positions');
  const [message, setMessage] = useState('');
  const [resetOpen, setResetOpen] = useState(false), [resetBalance, setResetBalance] = useState(String(account.settings.initialBalance));
  const [orderFilter, setOrderFilter] = useState<PaperDockOrderFilter>('working');
  const [sorts, setSorts] = useState<Record<string, PaperDockSort>>({});
  const [creating, setCreating] = useState<{ name: string; balance: string; currency: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [journalFilter, setJournalFilter] = useState<PaperJournalFilter>('all'), [journalQuery, setJournalQuery] = useState('');
  const [commission, setCommission] = useState<{ kind: PaperCommission['kind']; value: string } | null>(null);
  /** The positions fingerprint while the Close all positions dialog is open. */
  const [closingAll, setClosingAll] = useState<string | null>(null);
  /** The inline Modify (Orders tab) and Protect position (Positions tab) editors. */
  const [orderEdit, setOrderEdit] = useState<PaperDockOrderEdit | null>(null), [protect, setProtect] = useState<PaperDockProtect | null>(null);
  /** This panel hosts the separate DOM pane, open or collapsed. */
  const [domPane, setDomPane] = useState<PaperDomPaneState>(paperDomPaneState);
  useEffect(() => { setDomPane(paperDomPaneState()); return subscribePaperDomPane(setDomPane); }, []);
  const summary = paperDockSummary(account, now), positions = paperDockPositions(account), orders = paperDockOrders(account, clock), history = paperDockHistory(account, clock);
  const counts: Record<PaperDockTab, number | null> = { positions: positions.length, orders: orders.length, history: history.length, journal: null, account: null, dom: null };
  const apply = (result: PaperResult, done: string) => {
    if (!result.ok) { setMessage(result.diagnostics.map(row => row.message).join(' ') || 'The virtual account refused this action.'); return; }
    setMessage(props.onAccountChange(result.account, account) === false ? 'The virtual account changed before this action completed. Try again.' : done);
  };
  const state: PaperState | null = manager ? { paper: account, book: manager.book } : null;
  const applyState = (result: PaperBookResult, done: string): boolean => {
    if (!state || !manager) return false;
    if (!result.ok) { setMessage(result.message); return false; }
    if (manager.onStateChange(result.state, state) === false) { setMessage('The virtual accounts changed before this action completed. Try again.'); return false; }
    setMessage(done); return true;
  };
  const title = (props.replay ? 'Replay paper trading' : 'Paper trading') + ': ' + account.name;
  const domPaneNode = domPane.open ? <PaperDomPane account={account} instrument={props.instrument} quote={props.quote ?? null} book={props.book ?? null} bookSource={props.bookSource ?? null} now={now} onAccountChange={props.onAccountChange} tradingRefusal={props.tradingRefusal} replay={props.replay} center={domPane.center} onClose={closePaperDomPane}/> : null;
  /** The pane sits beside the panel only while it is open, so the panel's own element (or portal) is returned unchanged otherwise. */
  const withPane = (node: React.ReactElement | null) => domPaneNode ? <>{node}{domPaneNode}</> : node;
  if (!props.open) return withPane(props.embedded ? null : (
    <div className="lv-paper-dock collapsed" role="region" aria-label="Paper trading panel">
      <button type="button" aria-expanded="false" aria-controls="lv-paper-dock-body" onClick={() => props.onToggle(true)} title="Open the paper trading panel">
        <span>{title}</span><small>Equity {summary.equity} {account.settings.currency}</small><small>{orders.length} working, {positions.length} open</small>
      </button>
    </div>
  ));
  /** A sortable table: `columns` pairs a header with the row field it sorts by (null for an action column). */
  const table = <T extends object>(name: string, columns: Array<[string, (keyof T & string) | null]>, rows: T[], cells: (row: T) => React.ReactNode[], empty: string, label: string) => {
    if (rows.length === 0) return <p className="lv-paper-dock-empty">{empty}</p>;
    const sort = sorts[name] ?? null, sorted = sortPaperDockRows(rows, sort);
    return <table aria-label={label}><thead><tr>{columns.map(([header, key], index) => key === null ? <th key={index} scope="col">{header}</th> : <th key={index} scope="col" aria-sort={sort?.column === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className="sort" title={`Sort by ${header}`} onClick={() => setSorts(current => ({ ...current, [name]: nextPaperDockSort(current[name] ?? null, key) }))}>{header}{sort?.column === key ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>)}</tr></thead><tbody>{sorted.map((row, index) => <tr key={index}>{cells(row).map((cell, column) => <td key={column}>{columns[column]?.[0] === 'Side' && (cell === 'Buy' || cell === 'Sell' || cell === 'Long' || cell === 'Short') ? <span className={`lv-paper-side ${cell === 'Buy' || cell === 'Long' ? 'is-buy' : 'is-sell'}`}>{cell}</span> : cell}</td>)}</tr>)}</tbody></table>;
  };
  const confirmReset = () => {
    const result = resetPaperDockAccount(account, resetBalance, now);
    if (!result.ok) { setMessage(result.message); return; }
    if (props.onAccountChange(result.account, account) === false) { setMessage('The virtual account changed before the reset. Try again.'); return; }
    setResetOpen(false); setMessage(`Account reset to ${money(result.account.settings.initialBalance)} ${result.account.settings.currency}. Orders, positions and history were cleared.`);
  };
  const exportHistory = async () => {
    const result = await exportPaperCsv(paperExportTable(account, 'history'), props.exportBridge ?? (typeof window !== 'undefined' ? (window as unknown as { lv?: PaperExportBridge }).lv : undefined));
    setMessage(result.ok ? 'Virtual order history exported as CSV.' : result.message);
  };
  const journalAll = tab === 'journal' ? paperJournalRows(account) : [], journalRows = tab === 'journal' ? filterPaperJournal(journalAll, journalFilter, journalQuery) : [], journalCounts = paperJournalCounts(journalAll);
  const exportJournal = async () => {
    const result = await exportPaperCsv(paperJournalExportTable(account, journalFilter, journalQuery), props.exportBridge ?? (typeof window !== 'undefined' ? (window as unknown as { lv?: PaperExportBridge }).lv : undefined));
    setMessage(result.ok ? 'Virtual account journal exported as CSV.' : result.message);
  };
  const saveCommission = () => {
    if (!commission) return;
    const result = configurePaperDockCommission(account, commission.kind, commission.value, now);
    if ('message' in result) { setMessage(result.message); return; }
    if (!result.ok) { apply(result, ''); return; }
    if (props.onAccountChange(result.account, account) === false) { setMessage('The virtual account changed before this action completed. Try again.'); return; }
    setCommission(null); setMessage(`Commission set to ${paperDockCommissionText(result.account.settings.commission, result.account.settings.currency).toLowerCase()}. It applies to future virtual fills; existing fills are unchanged.`);
  };
  const closeAll = () => {
    const opened = closingAll; setClosingAll(null);
    if (opened !== paperDockPositionsFingerprint(account)) { setMessage('The open virtual positions changed after the confirmation opened. Review them again.'); return; }
    const result = closeAllPaperDockPositions(account, now);
    if (!result.ok) { setMessage(result.message); return; }
    apply({ ok: true, account: result.account, diagnostics: [] }, result.message);
  };
  const closeAllDetail = () => `Close ${positions.length} virtual position${positions.length === 1 ? '' : 's'}? Each one closes with a reduce-only market order at the current virtual quote: ${positions.map(row => `${row.symbol} ${row.side.toLowerCase()} ${row.quantity}`).join(', ')}. All funds are virtual.`;
  const cancelAll = () => { const ids = [...new Set(account.orders.filter(working).map(order => order.instrument.id))]; let next = account; for (const id of ids) { const result = cancelPaperOrders(next, { instrumentId: id }, now); if (!result.ok) { apply(result, ''); return; } next = result.account; } apply({ ok: true, account: next, diagnostics: [] }, 'All working virtual orders were cancelled.'); };
  const orderCounts = paperDockOrderCounts(account), orderRows = paperDockOrdersByStatus(account, orderFilter, clock);
  const accountRows = state ? listBookAccounts(state) : [];
  const details = paperDockAccountDetails(account, now);
  const symbolCell = (symbol: string, instrument: Instrument | undefined) => props.onSelectSymbol && instrument ? <button type="button" className="lv-paper-dock-symbol" title={`Show ${symbol} on the chart`} onClick={() => props.onSelectSymbol!(instrument)}>{symbol}</button> : symbol;
  const submitCreate = () => {
    if (!state || !creating) return;
    const checked = paperDockCreateInput(creating.name, creating.balance, creating.currency);
    if (!checked.ok) { setMessage(checked.message); return; }
    if (applyState(createBookAccount(state, checked.input, Math.max(now, 0), manager!.idFactory), `Virtual account ${checked.input.name.trim()} created. Select it to trade in it.`)) setCreating(null);
  };
  const panel = (
    <section className={props.embedded ? 'lv-paper-dock lv-paper-dock-embedded' : 'lv-paper-dock'} role="region" aria-label="Paper trading panel" id="lv-paper-dock-body">
      <style>{`.lv-paper-dock .lv-paper-side{display:inline-block;padding:0 6px;border-radius:8px;font-weight:600;color:var(--lv-on-trade,#fff)}.lv-paper-dock .lv-paper-side.is-buy{background:var(--lv-trade-buy)}.lv-paper-dock .lv-paper-side.is-sell{background:var(--lv-trade-sell)}.lv-paper-dock{display:flex;flex-direction:column;min-height:0;max-height:38vh;border-top:1px solid var(--lv-border);background:var(--lv-bg-raised);color:var(--lv-text-primary);font-size:12px}.lv-paper-dock.collapsed>button{display:flex;gap:12px;align-items:center;width:100%;padding:4px 10px;border:0;border-top:1px solid var(--lv-border);background:var(--lv-bg-raised);color:inherit;font-size:12px;cursor:pointer;text-align:left}.lv-paper-dock header{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--lv-border)}.lv-paper-dock dl{display:flex;flex-wrap:wrap;gap:4px 14px;margin:0}.lv-paper-dock dl div{display:flex;gap:4px}.lv-paper-dock dt{opacity:.7}.lv-paper-dock dd{margin:0;font-weight:600}.lv-paper-dock .tabs{display:flex;gap:2px;padding:0 6px}.lv-paper-dock .tabs button[aria-selected=true],.lv-paper-dock .filters button[aria-pressed=true]{border-bottom:2px solid var(--lv-accent)}.lv-paper-dock .filters{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:4px 0}.lv-paper-dock .body{overflow:auto;padding:4px 10px 8px}.lv-paper-dock table{border-collapse:collapse;width:100%}.lv-paper-dock th,.lv-paper-dock td{text-align:left;padding:3px 8px;border-bottom:1px solid var(--lv-border);white-space:nowrap}.lv-paper-dock th button.sort{border:0;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer;padding:0}.lv-paper-dock .lv-paper-dock .buy,.lv-paper-dock .sell{padding:4px 14px;border-radius:var(--lv-radius-plate,6px);border:0;color:var(--lv-on-trade);font-weight:600;cursor:pointer}.lv-paper-dock .buy{background:var(--lv-buy,#2962ff)}.lv-paper-dock .sell{background:var(--lv-sell,#f23645)}.lv-paper-dock .buy:disabled,.lv-paper-dock .sell:disabled{opacity:.5;cursor:default}.lv-paper-dock .lv-paper-dock .badge{padding:0 6px;border:1px solid currentColor;border-radius:3px;font-size:10px}.lv-paper-dock .spacer{flex:1}.lv-paper-dock .lv-paper-dock-symbol{border:0;background:transparent;color:inherit;font:inherit;padding:0;cursor:pointer;text-decoration:underline dotted}.lv-paper-dock fieldset{display:flex;flex-wrap:wrap;gap:6px;align-items:center;border:1px solid var(--lv-border);margin:6px 0}.lv-paper-dock.lv-paper-dock-embedded{max-height:none;height:100%;border-top:0}.lv-paper-dock th:empty,.lv-paper-dock td:has(>.lv-paper-dock-acts){position:sticky;right:0;background:var(--lv-bg-raised);box-shadow:-1px 0 0 var(--lv-border)}.lv-paper-dock .lv-paper-dock-acts{display:inline-flex;gap:4px}.lv-paper-dock-confirm{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}.lv-paper-dock-confirm>div{max-width:min(460px,92vw);padding:14px 16px;border:1px solid var(--lv-border);border-radius:4px;background:var(--lv-bg-raised);color:var(--lv-text-primary)}.lv-paper-dock-confirm h3{margin:0 0 8px;font-size:14px}.lv-paper-dock-confirm footer{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}.lv-paper-dock .lv-info-btn{min-width:18px;height:18px;padding:0;font-size:11px;margin-left:4px}.lv-paper-dock .lv-paper-dock-hint{display:flex;align-items:center}`}</style>
      <header>
        <strong>{title}</strong><span className="badge" title={PAPER_NOTICE}>Virtual money</span>
        {state && accountRows.length > 1 && <label>Account <select aria-label="Virtual account" value={account.id} onChange={event => applyState(selectBookAccount(state, event.target.value), 'Switched virtual account. Orders, positions, settings and history now belong to the chosen account.')}>{accountRows.map(row => <option key={row.id} value={row.id}>{row.name} ({row.currency})</option>)}</select></label>}
        <dl aria-label="Account summary">
          <div><dt>Balance</dt><dd>{summary.balance}</dd></div>
          <div><dt>Equity</dt><dd>{summary.equity}</dd></div>
          <div><dt>Unrealized P&amp;L</dt><dd>{summary.unrealized}</dd></div>
          <div><dt>Realized P&amp;L</dt><dd>{summary.realized}</dd></div>
          <div><dt>Available funds</dt><dd>{summary.available}</dd></div>
          <div><dt>Account margin</dt><dd>{details.accountMargin}</dd></div>
          <div><dt>Orders margin</dt><dd>{details.ordersMargin}</dd></div>
          <div><dt>Margin buffer</dt><dd>{details.marginBuffer}</dd></div>
        </dl>
        <span className="spacer"/>
        <button type="button" className="sell" disabled={!!props.tradingRefusal} title={props.tradingRefusal ?? undefined} onClick={() => props.onOpenTicket('sell')}>Sell</button>
        <button type="button" className="buy" disabled={!!props.tradingRefusal} title={props.tradingRefusal ?? undefined} onClick={() => props.onOpenTicket('buy')}>Buy</button>
        <button type="button" title="Open the floating Paper trading dialog" onClick={() => props.onOpenTicket(null)}>Open floating</button>
        <button type="button" aria-pressed={domPane.open} title="Open the order ladder (DOM) in its own floating pane" onClick={() => domPane.open ? closePaperDomPane() : openPaperDomPane('panel')}>DOM pane</button>
        <button type="button" onClick={() => { setResetBalance(String(account.settings.initialBalance)); setResetOpen(true); setTab('account'); }}>Reset account</button>
        {!props.embedded && <button type="button" aria-expanded="true" aria-label="Collapse the paper trading panel" title="Collapse" onClick={() => props.onToggle(false)}>▾</button>}
      </header>
      <div className="tabs" role="tablist" aria-label="Paper trading views">
        {PAPER_DOCK_TABS.map(row => <button key={row.id} type="button" role="tab" aria-selected={tab === row.id} onClick={() => setTab(row.id)}>{row.label}{counts[row.id] === null ? '' : ` (${counts[row.id]})`}</button>)}
      </div>
      <div className="body" role="tabpanel" aria-label={PAPER_DOCK_TABS.find(row => row.id === tab)!.label}>
        {tab === 'positions' && positions.length > 0 && <div className="filters"><span className="spacer"/><button type="button" onClick={() => setClosingAll(paperDockPositionsFingerprint(account))}>Close all positions</button></div>}
        {tab === 'positions' && table<PaperDockPositionRow>('positions', [['Symbol', 'symbol'], ['Side', 'side'], ['Quantity', 'quantity'], ['Average price', 'average'], ['Take profit', 'takeProfit'], ['Stop loss', 'stopLoss'], ['Last price', 'last'], ['Unrealized P&L', 'pnlValue'], ['P&L %', 'pnlPercent'], ['Trade value', 'tradeValue'], ['Market value', 'marketValue'], ['Realized P&L', 'realizedValue'], ['', null]], positions, row => [symbolCell(row.symbol, account.positions[row.instrumentId]?.instrument), <span className={row.side === 'Long' ? 'buy' : 'sell'}>{row.side}</span>, row.quantity, row.average, row.takeProfit, row.stopLoss, row.last, row.pnl, row.pnlPercent, row.tradeValue, row.marketValue, <span title="Gross realized profit of this position, before fees">{row.realized}</span>,
          <span className="lv-paper-dock-acts"><button type="button" aria-label={`Close ${row.symbol} position`} onClick={() => apply(closePaperPosition(account, row.instrumentId, now), `Close order sent for ${row.symbol}.`)}>Close</button> <button type="button" aria-label={`Reverse ${row.symbol} position`} onClick={() => apply(reversePaperPosition(account, row.instrumentId, now), `${row.symbol} position reversed.`)}>Reverse</button> <button type="button" aria-label={`Protect ${row.symbol} position`} title="Set a take profit and stop loss for the whole position" onClick={() => { setOrderEdit(null); setProtect(paperDockProtect(account, row.instrumentId)); }}>Protect</button></span>], 'No open virtual positions.', 'Positions')}
        {tab === 'positions' && protect && <fieldset aria-label="Protect position" onKeyDown={formEscape(() => setProtect(null))}><legend>Protect {account.positions[protect.instrumentId]?.instrument.symbol ?? 'position'} (whole position)</legend>
          <label>Take profit <input aria-label="Take profit price" inputMode="decimal" value={protect.takeProfit} onChange={event => setProtect({ ...protect, takeProfit: event.target.value })}/></label>
          <label>Stop loss <input aria-label="Stop loss price" inputMode="decimal" value={protect.stopLoss} onChange={event => setProtect({ ...protect, stopLoss: event.target.value })}/></label>
          <button type="button" onClick={() => setProtect(null)}>Cancel</button> <button type="button" className="primary" onClick={() => { const result = protectPaperDockPosition(account, protect, now); if ('message' in result) { setMessage(result.message); return; } apply(result, 'Position exits saved. They replace the exits that protected it; later entries are not included.'); if (result.ok) setProtect(null); }}>Save exits</button>
        </fieldset>}        {tab === 'orders' && <>
          <div className="filters" role="group" aria-label="Order status">
            {PAPER_DOCK_ORDER_FILTERS.map(row => <button key={row.id} type="button" aria-pressed={orderFilter === row.id} onClick={() => setOrderFilter(row.id)}>{row.label} ({orderCounts[row.id]})</button>)}
            <span className="spacer"/>
            {orders.length > 0 && <button type="button" onClick={cancelAll}>Cancel all</button>}
          </div>
          {table<PaperDockAnyOrderRow>('orders', [['Symbol', 'symbol'], ['Side', 'side'], ['Type', 'type'], ['Quantity', 'quantity'], ['Limit price', 'limit'], ['Stop price', 'stop'], ['Take profit', 'takeProfit'], ['Stop loss', 'stopLoss'], ['Fill price', 'fillPrice'], ['Status', 'status'], ['Duration', 'duration'], [`Expires (${zoneName})`, 'expires'], [`Placed (${zoneName})`, 'placed'], [`Updated (${zoneName})`, 'updated'], ['', null]], orderRows, row => [symbolCell(row.symbol, account.orders.find(item => item.id === row.id)?.instrument), <span className={row.side === 'Buy' ? 'buy' : 'sell'}>{row.side}</span>, row.type, row.quantity, row.limit, row.trail ? <span title={row.trail}>{row.stop} ({row.trail})</span> : row.stop, row.takeProfit, row.stopLoss, row.fillPrice, <span title={row.reason || undefined}>{row.status}{row.reason ? ': ' + row.reason : ''}</span>, row.duration, row.expires, row.placed, row.updated,
            row.working ? <span className="lv-paper-dock-acts">{(() => { const order = account.orders.find(item => item.id === row.id), refusal = order ? paperDockOrderEditable(order) : 'This virtual order is no longer in the account.'; return <button type="button" aria-label={`Modify ${row.side} ${row.type} ${row.symbol}`} disabled={!!refusal} title={refusal ?? 'Change the quantity or price of this virtual order'} onClick={() => { if (!order) return; setProtect(null); setOrderEdit(paperDockOrderEdit(order)); }}>Modify</button>; })()} <button type="button" aria-label={`Cancel ${row.side} ${row.type} ${row.symbol}`} onClick={() => apply(cancelPaperOrder(account, row.id, now), 'Virtual order cancelled.')}>Cancel</button></span> : ''], `No ${orderFilter === 'all' ? '' : PAPER_DOCK_ORDER_FILTERS.find(row => row.id === orderFilter)!.label.toLowerCase() + ' '}virtual orders.`, orderFilter === 'working' ? 'Working orders' : `${PAPER_DOCK_ORDER_FILTERS.find(row => row.id === orderFilter)!.label} orders`)}
          {orderEdit && (() => { const order = account.orders.find(item => item.id === orderEdit.orderId); if (!order) return null; return <fieldset aria-label="Modify virtual order" onKeyDown={formEscape(() => setOrderEdit(null))}><legend>Modify {order.side === 'buy' ? 'Buy' : 'Sell'} {order.instrument.symbol}</legend>
            <label>Quantity <input aria-label="Modify quantity" autoFocus inputMode="decimal" value={orderEdit.quantity} onChange={event => setOrderEdit({ ...orderEdit, quantity: event.target.value })}/></label>
            {order.limitPrice !== undefined && <label>Limit price <input aria-label="Modify limit price" inputMode="decimal" value={orderEdit.limit} onChange={event => setOrderEdit({ ...orderEdit, limit: event.target.value })}/></label>}
            {order.stopPrice !== undefined && order.type !== 'trailing-stop' && <label>Stop price <input aria-label="Modify stop price" inputMode="decimal" value={orderEdit.stop} onChange={event => setOrderEdit({ ...orderEdit, stop: event.target.value })}/></label>}
            {orderEdit.trail !== undefined && <label>{order.trailPercent !== undefined ? 'Trail percent' : 'Trail distance'} <input aria-label="Modify trail amount" inputMode="decimal" value={orderEdit.trail} onChange={event => setOrderEdit({ ...orderEdit, trail: event.target.value })}/></label>}
            {orderEdit.takeProfit !== undefined && <label>Take profit <input aria-label="Modify take profit" inputMode="decimal" placeholder="None" value={orderEdit.takeProfit} onChange={event => setOrderEdit({ ...orderEdit, takeProfit: event.target.value })}/></label>}
            {orderEdit.stopLoss !== undefined && <label>Stop loss <input aria-label="Modify stop loss" inputMode="decimal" placeholder="None" value={orderEdit.stopLoss} onChange={event => setOrderEdit({ ...orderEdit, stopLoss: event.target.value })}/></label>}
            {orderEdit.takeProfit === undefined && !order.exits && order.type !== 'trailing-stop' && <small>No exits on this order. Once it fills, use Protect on the position to add a take profit and stop loss.</small>}
            {order.exits && order.exits.mode !== 'single' && <small>Several exit levels: edit them in the Paper trading dialog.</small>}
            <button type="button" onClick={() => setOrderEdit(null)}>Cancel</button> <button type="button" className="primary" onClick={() => { const result = modifyPaperDockOrder(account, orderEdit, now); if ('message' in result) { setMessage(result.message); return; } apply(result, 'Virtual order modified.'); if (result.ok) setOrderEdit(null); }}>Save changes</button>
          </fieldset>; })()}        </>}
        {tab === 'history' && <>
          <div className="filters"><span className="spacer"/><button type="button" disabled={history.length === 0} onClick={() => { void exportHistory(); }}>Export CSV…</button></div>
          {table<PaperDockHistoryRow>('history', [[`Time (${zoneName})`, 'time'], ['Symbol', 'symbol'], ['Side', 'side'], ['Type', 'type'], ['Quantity', 'quantity'], ['Limit price', 'limit'], ['Stop price', 'stop'], ['Fill price', 'price'], ['Fill basis', 'basis'], ['Fee', 'fee'], ['Status', 'status'], ['Duration', 'duration'], [`Placed (${zoneName})`, 'placed']], history, row => [row.time, row.symbol, <span className={row.side === 'Buy' ? 'buy' : 'sell'}>{row.side}</span>, row.type, row.quantity, row.limit, row.stop, row.price, row.basis, row.fee, row.status, row.duration, row.placed], 'No virtual order history.', 'Order history')}
        </>}
        {tab === 'journal' && <>
          <div className="filters" role="group" aria-label="Journal events">
            {PAPER_JOURNAL_FILTERS.map(row => <button key={row.id} type="button" aria-pressed={journalFilter === row.id} onClick={() => setJournalFilter(row.id)}>{row.label} ({journalCounts[row.id]})</button>)}
            <label>Search <input aria-label="Search the journal" type="search" value={journalQuery} onChange={event => setJournalQuery(event.target.value)}/></label>
            <span className="spacer"/>
            <button type="button" disabled={journalRows.length === 0} onClick={() => { void exportJournal(); }}>Export CSV…</button>
          </div>
          {table<PaperJournalRow & { time: string }>('journal', [[`Time (${zoneName})`, 'time'], ['Event', 'event'], ['Symbol', 'symbol'], ['Details', 'details']], journalRows.map(row => ({ ...row, time: paperDockTime(row.at, zone, clock.hours) })), row => [row.time, row.event, row.symbol, row.details], journalQuery.trim() || journalFilter !== 'all' ? 'No journal events match.' : 'No journal events yet.', 'Account journal')}
        </>}
        {tab === 'dom' && props.tradingRefusal && <p className="paper-notice" role="status">{props.tradingRefusal}</p>}
        {tab === 'dom' && !props.tradingRefusal && domPane.open && <p className="lv-paper-dock-empty">The order ladder is open in its own pane. <button type="button" onClick={closePaperDomPane}>Show it here</button></p>}
        {tab === 'dom' && !props.tradingRefusal && !domPane.open && <PaperDom account={account} instrument={props.instrument} quote={props.quote ?? null} book={props.book ?? null} bookSource={props.bookSource ?? null} now={now} onAccountChange={props.onAccountChange}/>}
        {tab === 'account' && <div>
          <dl aria-label="Account details">
            <div><dt>Starting balance</dt><dd>{summary.startingBalance} {details.currency}</dd></div>
            <div><dt>Balance</dt><dd>{summary.balance}</dd></div>
            <div><dt>Equity</dt><dd>{summary.equity}</dd></div>
            <div><dt>Realized P&amp;L</dt><dd>{summary.realized}</dd></div>
            <div><dt>Unrealized P&amp;L</dt><dd>{summary.unrealized}</dd></div>
            <div><dt>Account margin</dt><dd>{details.accountMargin}</dd></div>
            <div><dt>Orders margin</dt><dd>{details.ordersMargin}</dd></div>
            <div><dt>Available funds</dt><dd>{summary.available}</dd></div>
            <div><dt>Buying power</dt><dd>{details.buyingPower}</dd></div>
            <div><dt>Margin buffer</dt><dd>{details.marginBuffer}</dd></div>
            <div><dt>Fees paid</dt><dd>{summary.fees}</dd></div>
            <div><dt>Leverage</dt><dd>{details.leverage}</dd></div>
            <div><dt>Commission</dt><dd>{details.commission}</dd></div>
          </dl>
          {commission ? <fieldset aria-label="Commission settings"><legend>Commission</legend>
            <label>Model <select aria-label="Commission model" value={commission.kind} onChange={event => setCommission({ ...commission, kind: event.target.value as PaperCommission['kind'] })}><option value="fixed">Per filled order</option><option value="percent">Percent of notional</option><option value="per-unit">Per unit</option></select></label>
            <label>Amount <input aria-label="Commission amount" inputMode="decimal" value={commission.value} onChange={event => setCommission({ ...commission, value: event.target.value })}/></label>
            <button type="button" onClick={() => setCommission(null)}>Cancel</button> <button type="button" className="primary" onClick={saveCommission}>Save commission</button>
            <p className="help">Virtual commission applies to future fills only. Existing fills keep their fees.</p>
          </fieldset> : <button type="button" onClick={() => setCommission({ kind: account.settings.commission.kind, value: String(account.settings.commission.value) })}>Commission…</button>}
          <p className="help lv-paper-dock-hint">Virtual funds only<InfoTip label="About virtual funds">{PAPER_NOTICE}</InfoTip></p>
          {resetOpen ? <fieldset aria-label="Reset virtual account"><legend>Reset virtual account</legend>
            <p>This clears every virtual order, position and fill of {account.name}. Other virtual accounts are not affected.</p>
            <label>Starting balance <input aria-label="Starting balance" inputMode="decimal" value={resetBalance} onChange={event => setResetBalance(event.target.value)}/></label>
            <button type="button" onClick={() => setResetOpen(false)}>Cancel</button> <button type="button" className="primary" onClick={confirmReset}>Reset now</button>
          </fieldset> : <button type="button" onClick={() => { setResetBalance(String(account.settings.initialBalance)); setResetOpen(true); }}>Reset account</button>}
          {state ? <section aria-label="Virtual accounts">
            <h4>Virtual accounts<InfoTip label="About virtual accounts">Each virtual account keeps its own orders, positions, history and settings. Orders only fill when the symbol currency matches the account currency.</InfoTip></h4>
            <table aria-label="Virtual accounts list"><thead><tr><th scope="col">Name</th><th scope="col">Currency</th><th scope="col"></th></tr></thead><tbody>{accountRows.map(row => <tr key={row.id}>
              <td>{renaming?.id === row.id ? <input aria-label={`New name for ${row.name}`} value={renaming.text} maxLength={64} onChange={event => setRenaming({ id: row.id, text: event.target.value })}/> : <>{row.name}{row.active ? ' (active)' : ''}</>}</td>
              <td>{row.currency}</td>
              <td>{renaming?.id === row.id ? <><button type="button" onClick={() => { if (applyState(renameBookAccount(state, row.id, renaming.text), 'Virtual account renamed. Its history is unchanged.')) setRenaming(null); }}>Save name</button> <button type="button" onClick={() => setRenaming(null)}>Cancel</button></>
                : deleting === row.id ? <><span>Delete {row.name} and its virtual history?</span> <button type="button" className="primary" onClick={() => { if (applyState(deleteBookAccount(state, row.id), `Virtual account ${row.name} deleted.`)) setDeleting(null); }}>Delete</button> <button type="button" onClick={() => setDeleting(null)}>Keep</button></>
                : <>{!row.active && <button type="button" aria-label={`Select ${row.name}`} onClick={() => applyState(selectBookAccount(state, row.id), 'Switched virtual account. Orders, positions, settings and history now belong to the chosen account.')}>Select</button>} <button type="button" aria-label={`Rename ${row.name}`} onClick={() => { setDeleting(null); setRenaming({ id: row.id, text: row.name }); }}>Rename</button> <button type="button" aria-label={`Delete ${row.name}`} disabled={accountRows.length <= 1} title={accountRows.length <= 1 ? 'Keep at least one virtual account' : undefined} onClick={() => { setRenaming(null); setDeleting(row.id); }}>Delete</button></>}</td>
            </tr>)}</tbody></table>
            {creating ? <fieldset aria-label="New virtual account"><legend>New virtual account</legend>
              <label>Name <input aria-label="New account name" maxLength={64} value={creating.name} onChange={event => setCreating({ ...creating, name: event.target.value })}/></label>
              <label>Starting balance <input aria-label="New account starting balance" inputMode="decimal" placeholder="100000" value={creating.balance} onChange={event => setCreating({ ...creating, balance: event.target.value })}/></label>
              <label>Currency <input aria-label="New account currency" maxLength={3} value={creating.currency} onChange={event => setCreating({ ...creating, currency: event.target.value })}/></label>
              <button type="button" onClick={() => setCreating(null)}>Cancel</button> <button type="button" className="primary" onClick={submitCreate}>Create account</button>
            </fieldset> : <button type="button" onClick={() => setCreating({ name: '', balance: '', currency: 'USD' })}>New account…</button>}
          </section> : <p className="help">{props.replay ? 'Replay uses its own virtual account. Account management returns when replay ends.' : 'Account management is in the Paper trading dialog.'}</p>}
        </div>}
        <p role="status" aria-live="polite">{message}</p>
      </div>
      {closingAll !== null && <div className="lv-paper-dock-confirm" onMouseDown={event => event.stopPropagation()}><div role="alertdialog" aria-modal="true" aria-labelledby="lv-paper-dock-close-all-title" onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setClosingAll(null); return; }
        if (event.key === 'Tab') { const buttons = event.currentTarget.querySelectorAll('button'), first = buttons[0], last = buttons[buttons.length - 1]; if (!first) return; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
      }}>
        <h3 id="lv-paper-dock-close-all-title">Close all positions</h3>
        <p>{closeAllDetail()}</p>
        <footer><button type="button" autoFocus onClick={() => setClosingAll(null)}>Cancel</button><button type="button" className="primary" onClick={closeAll}>Close all</button></footer>
      </div></div>}
    </section>
  );
  return withPane(props.embedded && props.dockHost ? createPortal(panel, props.dockHost) as unknown as React.ReactElement : panel);
}
