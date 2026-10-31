import Decimal from 'decimal.js';
import { editLocalAlert, type LocalAlert } from '../domain/alerts';

/** The pure part of dragging an alert line on the chart to a new price. */
export type AlertLineSlot = 'level' | 'lower' | 'upper';
export interface AlertReprice { alertId: string; slot: AlertLineSlot; price: number; tickSize: number; now: number }

/** Nearest tick (half up), never below one tick. NaN when the price or tick is unusable. */
export function snapAlertPrice(price: number, tickSize: number): number {
  if (!Number.isFinite(price) || !(tickSize > 0)) return Number.NaN;
  const ticks = new Decimal(price).div(tickSize).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return Decimal.max(tickSize, ticks.mul(tickSize)).toNumber();
}
export const alertLineKeyStep = (key: string): number => key === 'ArrowUp' ? 1 : key === 'ArrowDown' ? -1 : 0;

/** The collection with one alert's level moved. The edit restarts the alert's baseline and keeps its history, like any edit.
 * Returns the same array when the snapped price equals the current one. Throws a plain message when the move is not allowed. */
export function repriceAlert(alerts: readonly LocalAlert[], change: AlertReprice): LocalAlert[] {
  const alert = alerts.find(row => row.definition.id === change.alertId);
  if (!alert) throw new Error('That alert is no longer in the list.');
  const price = snapAlertPrice(change.price, change.tickSize);
  if (!Number.isFinite(price)) throw new Error('That price cannot be used.');
  const condition = { ...alert.definition.condition }, key = change.slot === 'level' ? 'value' : change.slot;
  if (condition[key] === undefined) throw new Error('This alert has no line to move.');
  if (condition[key] === price) return alerts as LocalAlert[];
  condition[key] = price;
  if (condition.lower !== undefined && condition.upper !== undefined && condition.lower > condition.upper) throw new Error('A channel line cannot cross its other line.');
  const edited = editLocalAlert(alert, { condition }, Math.max(change.now, alert.definition.createdAt));
  return alerts.map(row => row === alert ? edited : row);
}
