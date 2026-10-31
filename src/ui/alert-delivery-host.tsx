import React, { useEffect, useRef, useState } from 'react';
import type { LocalAlert } from '../domain/alerts';
import { scheduleActivityAutoHide, alertNotificationBody, collectFreshAlertNotifications, deliverDesktopNotifications, deliverAlertWebhooks, planAlertDelivery, type AlertWebhookPort, retainedNotificationIds, type AlertDeliveryItem, type DesktopNotificationPort, type DesktopPermission } from '../domain/alert-delivery';
import { sharedAlertSoundPlayer, type AlertSoundPlayer } from './alert-sound';
import { alertUsesSyntheticStub } from './background-alert-plan';
import {popupTarget,STACKED_POPUP_STYLE} from './alert-popup-target';

export const ALERT_POPUP_VISIBLE_LIMIT = 5;
/** Above every non-modal layer (at most 95) and below the modal shade (100): an open aria-modal dialog stays fully
 * operable (popups never cover its footer Close button) and the popups return on top when it closes. */
export const ALERT_POPUP_LAYER_Z_INDEX = 99;
export interface AlertDeliveryHostProps {
  /** undefined keeps the standalone corner; null waits for a shared popup rack. */
  popupHost?: HTMLElement | null;
  alerts: readonly LocalAlert[];
  /** Chart settings "Automatically hide toasts" (default on). Off keeps each popup until it is dismissed. */
  autoHide?: boolean;
  /** Injected for tests and alternative shells. Defaults use the renderer's Web Audio and Notification APIs. */
  soundPlayer?: AlertSoundPlayer;
  desktopPort?: DesktopNotificationPort | null;
  /** LV-local webhook poster. Default: the desktop bridge's postAlertWebhook; null without one. */
  webhookPort?: AlertWebhookPort | null;
}
interface Popup { key: string; item: AlertDeliveryItem; shownAt: number; }
/** Triggers recorded outside the local alert collection (list alerts, one per symbol) are presented by the
 * mounted host exactly like local alert triggers. Each notification id is presented once. */
const announced = new Set<(items: readonly AlertDeliveryItem[]) => void>();
export function announceAlertDeliveries(items: readonly AlertDeliveryItem[]): void { if (items.length) for (const listener of [...announced]) { try { listener(items); } catch { /* one host failing never blocks another */ } } }
/** The desktop bridge's OS notification call, as the preload exposes it. */
export interface AlertNotifyBridge { showAlertNotification?: (input: { title: string; body: string; tag: string }) => Promise<{ ok: true; value: { shown: boolean } } | { ok: false; error: { message: string } }> }
/** OS notifications are shown by the main process behind the trusted bridge; the OS decides whether the user sees them. */
export function bridgeDesktopNotificationPort(bridge: AlertNotifyBridge): DesktopNotificationPort {
  return {
    permission: () => 'granted',
    show: async (title, body, tag) => {
      const result = await bridge.showAlertNotification!({ title, body, tag });
      if (!result.ok) throw new Error(result.error.message);
      if (!result.value.shown) throw new Error('The operating system did not show the notification.');
    },
  };
}
/** The desktop bridge's webhook call (main process; loopback URLs only, electron/alert-webhook.cjs). */
export interface AlertWebhookBridge { postAlertWebhook?: (input: { url: string; body: string; contentType: string; origin: string }) => Promise<{ ok: true; value: { delivered: boolean; status: number; error: string | null } } | { ok: false; error: { message: string } }> }
export function defaultAlertWebhookPort(bridge: AlertWebhookBridge | undefined): AlertWebhookPort | null {
  if (typeof bridge?.postAlertWebhook !== 'function') return null;
  return { post: async request => { const result = await bridge.postAlertWebhook!(request); if (!result.ok) throw new Error(result.error.message); return result.value; } };
}
export function defaultDesktopNotificationPort(bridge: AlertNotifyBridge | undefined): DesktopNotificationPort | null {
  return typeof bridge?.showAlertNotification === 'function' ? bridgeDesktopNotificationPort(bridge) : browserDesktopNotificationPort();
}

export function browserDesktopNotificationPort(): DesktopNotificationPort | null {
  const scope = globalThis as unknown as { Notification?: { new(title: string, options: { body: string; tag: string; silent: boolean }): unknown; permission?: string; requestPermission?: () => Promise<string> } };
  const Constructor = scope.Notification;
  if (typeof Constructor !== 'function') return null;
  const normalize = (value: unknown): DesktopPermission => value === 'granted' || value === 'denied' || value === 'default' ? value : 'unsupported';
  return {
    permission: () => normalize(Constructor.permission),
    request: typeof Constructor.requestPermission === 'function' ? async () => normalize(await Constructor.requestPermission!()) : undefined,
    show: (title, body, tag) => { new Constructor(title, { body, tag, silent: true }); },
  };
}

/**
 * Presents triggers newly recorded in local alert history. History already
 * retained when the host mounts is never re-announced. A popup hides itself
 * after ALERT_POPUP_AUTOHIDE_MS while autoHide is on (the trigger stays in the log), and always when dismissed.
 */
export function AlertDeliveryHost({ alerts, autoHide = true, soundPlayer, desktopPort, webhookPort, popupHost }: AlertDeliveryHostProps) {
  const [popups, setPopups] = useState<Popup[]>([]), [notices, setNotices] = useState<string[]>([]), [closedCount, setClosedCount] = useState(0);
  const seen = useRef<Set<string> | null>(null), mounted = useRef(true), visible = useRef<Popup[]>([]);
  const showPopups = (next: Popup[]) => { visible.current = next; setPopups(next); };
  const ports = useRef({ soundPlayer, desktopPort, webhookPort }); ports.current = { soundPlayer, desktopPort, webhookPort };
  const addNotice = (text: string) => { if (mounted.current) setNotices(current => [...current.filter(item => item !== text), text].slice(-3)); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const present = (fresh: AlertDeliveryItem[]) => {
    if (!fresh.length) return;
    if (fresh.some(item => item.delivery.webhook)) {
      const port = ports.current.webhookPort === undefined ? defaultAlertWebhookPort((globalThis as unknown as { lv?: AlertWebhookBridge }).lv) : ports.current.webhookPort;
      void deliverAlertWebhooks(port, fresh).then(result => { for (const failure of result.failures) addNotice(failure); });
    }
    const plan = planAlertDelivery(fresh);
    if (plan.popups.length || plan.suppressedPopups) {
      const combined = [...visible.current.filter(popup => !plan.popups.some(item => item.notification.id === popup.key)), ...plan.popups.map(item => ({ key: item.notification.id, item, shownAt: Date.now() }))];
      const dropped = plan.suppressedPopups + Math.max(0, combined.length - ALERT_POPUP_VISIBLE_LIMIT);
      showPopups(combined.slice(-ALERT_POPUP_VISIBLE_LIMIT));
      if (dropped) setClosedCount(current => current + dropped);
    }
    if (plan.sound) {
      const player = ports.current.soundPlayer ?? sharedAlertSoundPlayer();
      void (plan.soundRepeat ? player.play(plan.sound, plan.soundRepeat) : player.play(plan.sound)).catch(error => addNotice(`Alert sound was not played: ${error instanceof Error ? error.message : String(error)} The trigger is recorded in alert history.`));
    }
    if (plan.desktop.length || plan.suppressedDesktop) {
      const port = ports.current.desktopPort === undefined ? defaultDesktopNotificationPort((globalThis as unknown as { lv?: AlertNotifyBridge }).lv) : ports.current.desktopPort;
      void deliverDesktopNotifications(port, plan.desktop).then(result => {
        if (result.failure) addNotice(result.failure);
        if (plan.suppressedDesktop) addNotice(`${plan.suppressedDesktop} additional desktop notifications were not shown to limit one batch. All triggers are recorded in alert history.`);
      });
    }
  };
  const presentRef = useRef(present); presentRef.current = present;
  useEffect(() => {
    if (seen.current === null) { seen.current = retainedNotificationIds(alerts); return; }
    const { seen: next, fresh } = collectFreshAlertNotifications(seen.current, alerts); seen.current = next;
    // A trigger observed on the synthetic Alpaca stub says SYNTHETIC in its popup and desktop notice.
    const synthetic = new Set(alerts.filter(alertUsesSyntheticStub).map(alert => alert.definition.id));
    present(fresh.map(item => synthetic.has(item.notification.alertId) ? { ...item, notification: { ...item.notification, name: 'SYNTHETIC ' + item.notification.name } } : item));
  }, [alerts]);
  useEffect(() => {
    const shown = new Set<string>();
    const listener = (items: readonly AlertDeliveryItem[]) => { const fresh = items.filter(item => !shown.has(item.notification.id)); for (const item of fresh) shown.add(item.notification.id); presentRef.current(fresh); };
    announced.add(listener); return () => { announced.delete(listener); };
  }, []);
  useEffect(() => {
    if (!popups.length || !autoHide) return;
    const cancels = popups.map(popup => scheduleActivityAutoHide(popup.shownAt, () => showPopups(visible.current.filter(item => item.key !== popup.key))));
    return () => { for (const cancel of cancels) cancel(); };
  }, [popups, autoHide]);
  if (!popups.length && !notices.length) return null;
  const dismiss = (key: string) => showPopups(visible.current.filter(popup => popup.key !== key));
  return popupTarget(<section className="lv-alert-popups" aria-label="Alert notifications" aria-live="polite" style={popupHost===undefined?{ position: 'fixed', right: 16, bottom: 16, zIndex: ALERT_POPUP_LAYER_Z_INDEX, display: 'flex', flexDirection: 'column', gap: 8, width: 'min(340px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 32px)', overflow: 'auto' }:STACKED_POPUP_STYLE}>
    {notices.map(text => <div key={text} className="lv-alert-delivery-notice" role="status" style={{ background: 'var(--lv-notice-bg)', border: '1px solid var(--lv-notice-border)', borderRadius: 6, padding: 10, fontSize: 12, lineHeight: 1.5 }}><p style={{ margin: 0 }}>{text}</p><button type="button" aria-label="Dismiss delivery notice" onClick={() => setNotices(current => current.filter(item => item !== text))}>Dismiss</button></div>)}
    {closedCount > 0 && <p className="lv-alert-popup-overflow" role="status" style={{ margin: 0, fontSize: 11, color: 'var(--lv-notice-text)' }}>{closedCount} earlier alert popup{closedCount === 1 ? ' was' : 's were'} closed to keep {ALERT_POPUP_VISIBLE_LIMIT} visible. All triggers remain in alert history.</p>}
    {popups.map(({ key, item }) => <article key={key} className="lv-alert-popup" data-alert-notification-id={key} aria-label={`Alert triggered: ${item.notification.name}`} style={{ background: 'var(--lv-bg-raised)', border: '1px solid var(--lv-border-hover)', borderRadius: 6, padding: 12, boxShadow: '0 8px 24px #0007' }}>
      <strong>{item.notification.mode === 'replay' ? 'Replay alert: ' : 'Alert: '}{item.notification.name}</strong>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '6px 0', fontSize: 12 }}>{alertNotificationBody(item)}</p>
      <button type="button" aria-label={`Dismiss alert popup ${item.notification.name}`} onClick={() => dismiss(key)}>Dismiss</button>
    </article>)}
    {popups.length > 1 && <button type="button" onClick={() => { showPopups([]); setClosedCount(0); }}>Dismiss all alert popups</button>}
  </section>,popupHost);
}
