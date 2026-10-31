import React, { useEffect, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import type { PaperAccount } from '../domain/paper';
import { formatPaperPrice } from './PaperChartLines';
import { registerToast } from './toast-escape';
import { freshPaperNotifications, paperNotificationKey, paperNotificationWatermark, PAPER_NOTIFICATION_AUTOHIDE_MS, PAPER_NOTIFICATION_LIMIT, type PaperTradingNotification } from '../domain/paper-notifications';

/**
 * Virtual trading notifications for the account the chart trades (replay funds during
 * replay). Each new order event shows a small one-line notice in the bottom-right corner (earlier the top centre toast column,
 * so notices no longer cover Manage layouts, Save or the watchlist header); Chart settings > Trading > "Show only rejection
 * notifications" keeps only the rejections. A notice closes after PAPER_NOTIFICATION_AUTOHIDE_MS or when dismissed; every
 * event stays in the paper Journal. Placement, size and timing are our own choice.
 */
/** Order placed/filled notices close sooner than rejections. */
export const PAPER_FILL_AUTOHIDE_MS = 4_000;
export interface PaperTradingToastsProps { account: PaperAccount; rejectionOnly: boolean; }
/** shownAt: wall time for the auto-hide; order: the Escape order (newest first) among every toast host. */
interface Shown { item: PaperTradingNotification; shownAt: number; order: number }

/** One step of the notifier: what to show after the account changed. Exported for tests. */
export function nextPaperToasts(state: { key: string; watermark: number } | null, account: PaperAccount, rejectionOnly: boolean): { state: { key: string; watermark: number }; fresh: PaperTradingNotification[] } {
  const key = paperNotificationKey(account);
  if (!state || state.key !== key) return { state: { key, watermark: paperNotificationWatermark(account) }, fresh: [] };
  const { watermark, notifications } = freshPaperNotifications(account, state.watermark, rejectionOnly);
  return { state: { key, watermark }, fresh: notifications.map(item => paperFillNoticeBody(account, item)) };
}
/**
 * A fill notice reads "Buy 1 AAPL at 49.20" (symbol price precision), with ", fee 1.25 USD" only when a fee was
 * charged. The engine's journal sentence (raw numbers) stays in the Journal. Other notices are unchanged.
 */
export function paperFillNoticeBody(account: PaperAccount, item: PaperTradingNotification): PaperTradingNotification {
  if (item.kind !== 'filled' || !item.orderId) return item;
  const order = account.orders.find(row => row.id === item.orderId), event = account.events.find(row => `${account.id}:${row.id}` === item.key);
  const fills = order ? account.fills.filter(fill => fill.orderId === order.id && (!event || fill.at === event.at)) : [];
  if (!order || !fills.length) return item;
  const quantity = fills.reduce((sum, fill) => sum.add(fill.quantity), new Decimal(0)), fee = fills.reduce((sum, fill) => sum.add(fill.commission), new Decimal(0));
  const price = fills.reduce((sum, fill) => sum.add(new Decimal(fill.price).mul(fill.quantity)), new Decimal(0)).div(quantity).toNumber();
  const symbol = item.body.includes(':') ? item.body.slice(0, item.body.indexOf(':')) : order.instrument.symbol;
  const feeText = fee.isZero() ? '' : `, fee ${fee.toFixed(2)} ${account.settings.currency}`;
  return { ...item, body: `${order.side === 'buy' ? 'Buy' : 'Sell'} ${quantity.toString()} ${symbol} at ${formatPaperPrice(price, order.instrument.tickSize)}${feeText}` };
}

export function PaperTradingToasts({ account, rejectionOnly }: PaperTradingToastsProps) {
  const [shown, setShown] = useState<Shown[]>([]);
  const seen = useRef<{ key: string; watermark: number } | null>(null);
  useEffect(() => {
    const step = nextPaperToasts(seen.current, account, rejectionOnly), reset = seen.current?.key !== step.state.key;
    seen.current = step.state;
    if (reset) { setShown([]); return; }
    if (step.fresh.length) { const now = Date.now(), order = performance.now(); setShown(current => [...current, ...step.fresh.map((item, index) => ({ item, shownAt: now, order: order + index * 1e-3 }))].slice(-PAPER_NOTIFICATION_LIMIT)); }
  }, [account, rejectionOnly]);
  useEffect(() => {
    if (!shown.length) return;
    const now = Date.now(), timers = shown.map(row => setTimeout(() => setShown(current => current.filter(other => other.item.key !== row.item.key)), Math.max(0, (row.item.rejection ? PAPER_NOTIFICATION_AUTOHIDE_MS : PAPER_FILL_AUTOHIDE_MS) - (now - row.shownAt))));
    // Escape (outside dialogs and text fields) dismisses the newest notice.
    const releases = shown.map(row => registerToast(row.item, () => setShown(current => current.filter(other => other.item.key !== row.item.key)), row.order));
    return () => { for (const timer of timers) clearTimeout(timer); for (const release of releases) release(); };
  }, [shown]);
  if (!shown.length) return null;
  // Small one-line notices in the bottom-right corner (left of the right rail, above
  // the bottom toolbar), newest last, so they never cover the chart's position line. Placement and size are our own choice.
  return <section className="lv-paper-toasts" aria-label="Virtual trading notifications" aria-live="polite" style={{ position: 'fixed', right: 'var(--lv-paper-toast-right, calc(var(--lv-rail-w, 45px) + 12px))', bottom: 'calc(var(--lv-bottom-h, 38px) + 40px)', zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, width: 'min(320px, calc(100vw - 32px))', pointerEvents: 'none' }}>
    {shown.map(({ item }) => <article key={item.key} className={'lv-paper-toast' + (item.rejection ? ' rejected' : '')} data-paper-event={item.kind} role={item.rejection ? 'alert' : 'status'} title={`${item.title}. ${item.body}`} style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%', background: 'var(--lv-bg-raised, #1e222d)', color: 'var(--lv-text-primary, #d1d4dc)', borderLeft: `3px solid ${item.rejection ? '#c9483f' : '#2f7fd1'}`, borderRadius: 4, padding: '4px 4px 4px 8px', boxShadow: '0 2px 8px #0005', fontSize: 12, lineHeight: 1.3 }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}><strong>{compactTitle(item.title)}</strong> · {item.body}</span>
      <button type="button" aria-label={`Dismiss ${item.title}`} title="Dismiss" onClick={() => setShown(current => current.filter(row => row.item.key !== item.key))} style={{ flex: 'none', width: 18, height: 18, padding: 0, lineHeight: '16px', background: 'transparent', color: 'var(--lv-text-secondary, #9598a1)' }}>×</button>
    </article>)}
  </section>;
}
/** "Virtual order filled" -> "Order filled": the notice is on the replay or paper account already. */
export function compactTitle(title: string): string { const rest = title.replace(/^Virtual /, ''); return rest.charAt(0).toUpperCase() + rest.slice(1); }
