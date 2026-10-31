import type { PaperAccount, PaperEvent } from './paper';
import { PAPER_JOURNAL_LABELS } from './paper-journal';
import { isAlpacaStubInstrument } from './alpaca-live';

/**
 * Trading notifications for the virtual account. Every order event recorded after the
 * notifier first sees an account (placed, modified, cancelled, stop triggered, filled, rejected, expired) becomes one
 * notification. Chart settings > Trading > "Show only rejection notifications" (trading.tradingNotifications, reference default
 * off) keeps only the rejections. History already in the account when it is first seen, or after a reset or an account switch,
 * is never announced. Wording is our own choice and always says virtual.
 */
export interface PaperTradingNotification { key: string; kind: PaperEvent['type']; title: string; body: string; rejection: boolean; /** The order the event belongs to, and the instrument of a take profit or stop loss child (internal; never shown). */ orderId?: string; instrumentId?: string; }
/** At most this many notifications show at once (the oldest close first). */
export const PAPER_NOTIFICATION_LIMIT = 3;
/** Each notification closes itself after this long (it stays in the paper Journal). */
export const PAPER_NOTIFICATION_AUTOHIDE_MS = 8_000;

/** Identity of one account generation: another account, a replay run or a reset is a new key. */
export function paperNotificationKey(account: PaperAccount): string { return JSON.stringify([account.mode, account.id, account.runId, account.createdAt]); }
/** The newest order event id (0 when there is none). */
export function paperNotificationWatermark(account: PaperAccount): number { let max = 0; for (const event of account.events) if (event.id > max) max = event.id; return max; }

/** The notifications for events after `after`, oldest first, and the new watermark (which also passes filtered-out events). */
export function freshPaperNotifications(account: PaperAccount, after: number, rejectionOnly: boolean): { watermark: number; notifications: PaperTradingNotification[] } {
  const orders = new Map(account.orders.map(order => [order.id, order]));
  let watermark = after;
  const notifications: PaperTradingNotification[] = [];
  for (const event of [...account.events].sort((a, b) => a.id - b.id)) {
    if (event.id <= after) continue;
    watermark = Math.max(watermark, event.id);
    if (rejectionOnly && event.type !== 'rejected') continue;
    const order = orders.get(event.orderId), label = PAPER_JOURNAL_LABELS[event.type];
    const symbol = order ? order.instrument.symbol + (isAlpacaStubInstrument(order.instrument) ? ' SYNTHETIC' : '') : '';
    notifications.push({ key: `${account.id}:${event.id}`, kind: event.type, title: 'Virtual ' + label.charAt(0).toLowerCase() + label.slice(1), body: symbol ? `${symbol}: ${event.message}` : event.message, rejection: event.type === 'rejected', orderId: event.orderId, ...(order?.bracket ? { instrumentId: order.instrument.id } : {}) });
  }
  // One notice per fill. An order placed and filled in the same update (a market order) and the take profit and
  // stop loss children placed with a fill on their symbol show only the fill; each event stays in the Journal.
  const fills = notifications.filter(row => row.kind === 'filled'), filledOrders = new Set(fills.map(row => row.orderId));
  const symbols = new Set(fills.flatMap(row => { const order = orders.get(row.orderId!); return order ? [order.instrument.id] : []; }));
  return { watermark, notifications: notifications.filter(row => row.kind !== 'submitted' || !filledOrders.has(row.orderId) && !(row.instrumentId && symbols.has(row.instrumentId))) };
}
