import Decimal from 'decimal.js';
import type { Instrument } from './types';
import { attachPaperPositionExits, modifyPaperExitLevel, modifyPaperExitPlan, paperExitTarget, paperPositionExitTarget, type PaperAccount, type PaperResult, type PaperSide } from './paper';

/**
 * Take profit and stop loss on the chart: each active child of a paired exit is a line that can be dragged, and a position line can
 * be dragged out into a new take profit or stop loss. Every change goes through the engine's own exit-level operations, so quantity
 * and OCO ownership are validated there. Synthetic or virtual only.
 */
export interface PaperExitLine { orderId: string; groupId: string; levelId: string; leg: 'tp' | 'sl'; side: PaperSide; price: number; quantity: number; }

export function paperExitLines(account: PaperAccount, instrument: Instrument): PaperExitLine[] {
  const lines: PaperExitLine[] = [];
  for (const order of account.orders) {
    if (!order.bracket || order.instrument.id !== instrument.id || (order.status !== 'working' && order.status !== 'triggered')) continue;
    const price = order.bracket.leg === 'tp' ? order.limitPrice : order.stopPrice;
    if (price === undefined) continue;
    lines.push({ orderId: order.id, groupId: order.bracket.groupId, levelId: order.bracket.levelId, leg: order.bracket.leg, side: order.side, price, quantity: order.quantity });
  }
  return lines;
}

/**
 * The take profit and stop loss a working entry order carries before it fills (its pending
 * exit plan). They are drawn with the order and move by drag; the engine places the real exit orders on the opening fill.
 */
export interface PaperPendingExitLine { orderId: string; level: number; leg: 'tp' | 'sl'; side: PaperSide; price: number; quantity: number; }
export function paperPendingExitLines(account: PaperAccount, instrument: Instrument): PaperPendingExitLine[] {
  const lines: PaperPendingExitLine[] = [];
  for (const order of account.orders) {
    if (order.bracket || !order.exits || order.instrument.id !== instrument.id || (order.status !== 'working' && order.status !== 'triggered')) continue;
    const side: PaperSide = order.side === 'buy' ? 'sell' : 'buy';
    order.exits.levels.forEach((level, index) => {
      if (level.takeProfit !== undefined) lines.push({ orderId: order.id, level: index, leg: 'tp', side, price: level.takeProfit, quantity: level.quantity });
      if (level.stopLoss !== undefined) lines.push({ orderId: order.id, level: index, leg: 'sl', side, price: level.stopLoss, quantity: level.quantity });
    });
  }
  return lines;
}
/** Moves one leg of a working order's pending exit plan. Null for a no-op or an order without that leg. */
export function applyPaperPendingExitDrag(account: PaperAccount, orderId: string, pending: { level: number; leg: 'tp' | 'sl' }, price: number, tick: number, now: number): PaperResult | null {
  const order = account.orders.find(row => row.id === orderId), plan = order?.exits, level = plan?.levels[pending.level], key = pending.leg === 'tp' ? 'takeProfit' : 'stopLoss';
  const snapped = snap(price, tick);
  if (!order || !plan || !level || !account.brackets?.pending[order.id] || level[key] === undefined || !Number.isFinite(snapped) || level[key] === snapped) return null;
  const levels = plan.levels.map((row, index) => index === pending.level ? { ...row, [key]: snapped } : { ...row });
  return modifyPaperExitPlan(account, paperExitTarget(account, 'parent', order.id), { schemaVersion: 1, mode: plan.mode, levels }, now);
}

function snap(price: number, tick: number): number {
  if (!Number.isFinite(price) || !(tick > 0)) return NaN;
  return Decimal.max(tick, new Decimal(price).div(tick).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(tick)).toNumber();
}

/** Moves one exit leg to a snapped price. Null for a no-op or an unknown line; the engine's result (possibly refused) otherwise. */
export function applyPaperExitDrag(account: PaperAccount, orderId: string, price: number, tick: number, now: number, pending?: { level: number; leg: 'tp' | 'sl' }): PaperResult | null {
  if (pending) return applyPaperPendingExitDrag(account, orderId, pending, price, tick, now);
  const order = account.orders.find(row => row.id === orderId), link = order?.bracket;
  if (!order || !link) return null;
  const group = account.brackets?.groups.find(row => row.id === link.groupId), level = group?.levels.find(row => row.id === link.levelId);
  const snapped = snap(price, tick);
  if (!group || !level || !Number.isFinite(snapped) || (link.leg === 'tp' ? level.takeProfit : level.stopLoss) === snapped) return null;
  const input = { quantity: level.requestedQuantity, ...(level.takeProfit === undefined ? {} : { takeProfit: level.takeProfit }), ...(level.stopLoss === undefined ? {} : { stopLoss: level.stopLoss }), [link.leg === 'tp' ? 'takeProfit' : 'stopLoss']: snapped };
  return modifyPaperExitLevel(account, paperExitTarget(account, 'group', group.id), level.id, input, now);
}

/** Which leg a handle dragged off a position line becomes. On the profit side of the average it is a take profit. */
export function paperDragOutExit(positionQuantity: number, average: number, price: number, tick: number): { leg: 'tp' | 'sl'; price: number } | null {
  const snapped = snap(price, tick);
  if (!Number.isFinite(snapped) || snapped === average) return null;
  const profitSide = positionQuantity > 0 ? snapped > average : snapped < average;
  return { leg: profitSide ? 'tp' : 'sl', price: snapped };
}

/**
 * Adds the dragged leg to the position's exits. A single-level exit keeps its other leg; with none, one level covering the whole
 * position is attached. Several levels are not guessed at: the result is a refusal the caller shows.
 */
export function attachPaperExitDrag(account: PaperAccount, instrumentId: string, leg: 'tp' | 'sl', price: number, now: number): PaperResult {
  const position = account.positions[instrumentId];
  if (!position || position.quantity === 0) return { ok: false, account, diagnostics: [{ code: 'NO_POSITION', message: 'There is no open virtual position to protect.', severity: 'error' }] };
  const active = account.brackets?.groups.filter(group => group.status === 'active' && group.instrument.id === instrumentId) ?? [];
  const levels = active.flatMap(group => group.levels.filter(level => level.status === 'active'));
  if (active.length > 1 || levels.length > 1) return { ok: false, account, diagnostics: [{ code: 'MULTIPLE_EXITS', message: 'Edit these exits in the order panel.', severity: 'error' }] };
  if (active.length === 1 && levels.length === 1) {
    const level = levels[0];
    return modifyPaperExitLevel(account, paperExitTarget(account, 'group', active[0].id), level.id, { quantity: level.requestedQuantity, ...(level.takeProfit === undefined ? {} : { takeProfit: level.takeProfit }), ...(level.stopLoss === undefined ? {} : { stopLoss: level.stopLoss }), [leg === 'tp' ? 'takeProfit' : 'stopLoss']: price }, now);
  }
  const target = paperPositionExitTarget(account, instrumentId);
  return attachPaperPositionExits(account, target, { schemaVersion: 1, mode: 'single', levels: [{ quantity: Math.abs(position.quantity), [leg === 'tp' ? 'takeProfit' : 'stopLoss']: price }] }, [], now);
}
