import type { AlertDefinition, AlertNotification, LocalAlert } from './alerts';

/**
 * Local alert delivery actions. Every trigger is always recorded in the local
 * alert history (the in-app log). These optional actions only present a
 * recorded trigger; they never create, suppress or reorder history.
 * Sounds are original synthesized tones, not recorded audio assets.
 */
export const ALERT_SOUND_IDS = ['lv-chime', 'lv-pulse', 'lv-bell', 'lv-rise', 'lv-double'] as const;
export type AlertSoundId = typeof ALERT_SOUND_IDS[number];
export interface AlertTone { readonly frequency: number; readonly start: number; readonly duration: number; readonly wave: 'sine' | 'square' | 'triangle'; }
export interface AlertSoundSpec { readonly id: AlertSoundId; readonly label: string; readonly tones: readonly AlertTone[]; }
const tone = (frequency: number, start: number, duration: number, wave: AlertTone['wave'] = 'sine'): AlertTone => Object.freeze({ frequency, start, duration, wave });
export const ALERT_SOUNDS: readonly AlertSoundSpec[] = Object.freeze([
  Object.freeze({ id: 'lv-chime', label: 'Chime', tones: Object.freeze([tone(880, 0, 0.18), tone(1318.5, 0.16, 0.32)]) }),
  Object.freeze({ id: 'lv-pulse', label: 'Pulse', tones: Object.freeze([tone(660, 0, 0.09, 'square'), tone(660, 0.16, 0.09, 'square'), tone(660, 0.32, 0.09, 'square')]) }),
  Object.freeze({ id: 'lv-bell', label: 'Bell', tones: Object.freeze([tone(523.25, 0, 0.6, 'triangle'), tone(1046.5, 0, 0.35)]) }),
  Object.freeze({ id: 'lv-rise', label: 'Rising', tones: Object.freeze([tone(440, 0, 0.12), tone(554.37, 0.12, 0.12), tone(659.25, 0.24, 0.2)]) }),
  Object.freeze({ id: 'lv-double', label: 'Double beep', tones: Object.freeze([tone(988, 0, 0.12, 'triangle'), tone(988, 0.2, 0.12, 'triangle')]) }),
] as AlertSoundSpec[]);
export function alertSound(id: AlertSoundId): AlertSoundSpec { const found = ALERT_SOUNDS.find(sound => sound.id === id); if (!found) throw new Error('Unknown local alert sound.'); return found; }

export interface AlertDeliverySettings { schemaVersion: 1; popup: boolean; desktop: boolean; sound: AlertSoundId | null;
  /** Optional webhook URL (LV-local: this computer only, see validateAlertWebhookUrl). Absent means no webhook. */
  webhook?: string;
  /** Optional sound duration in seconds (ALERT_SOUND_REPEAT_SECONDS). Absent means the sound plays once. */
  soundRepeat?: AlertSoundRepeat; }
/**
 * Sound duration choices. Once (absent) or the selected sound
 * repeated, with a short gap, for about this many seconds. The whole sequence is scheduled once per delivered batch.
 */
export const ALERT_SOUND_REPEAT_SECONDS = [5, 10, 30] as const;
export type AlertSoundRepeat = typeof ALERT_SOUND_REPEAT_SECONDS[number];
export const ALERT_SOUND_REPEAT_LABELS: Readonly<Record<AlertSoundRepeat, string>> = Object.freeze({ 5: 'Repeat for 5 seconds', 10: 'Repeat for 10 seconds', 30: 'Repeat for 30 seconds' });
/** LV defaults for a new alert: an in-app toast, an OS notification and a chime. The log always records the trigger. */
export const LV_DEFAULT_ALERT_DELIVERY: Readonly<AlertDeliverySettings> = Object.freeze({ schemaVersion: 1, popup: true, desktop: true, sound: 'lv-chime' });
/** Alerts saved before delivery settings existed present an in-app popup only. */
export const LEGACY_ALERT_DELIVERY: Readonly<AlertDeliverySettings> = Object.freeze({ schemaVersion: 1, popup: true, desktop: false, sound: null });
/** An in-app toast hides itself after this long (20 s, measured on user activity); the trigger stays in the alert log. */
export const ALERT_POPUP_AUTOHIDE_MS = 20_000;
export function alertPopupExpired(shownAtMs: number, nowMs: number): boolean { return nowMs - shownAtMs >= ALERT_POPUP_AUTOHIDE_MS; }
/** The user counts as away when the page is hidden or no input arrived for this long (once any input has been seen). */
export const ALERT_USER_IDLE_MS = ALERT_POPUP_AUTOHIDE_MS;
export const ALERT_AWAY_POLL_MS = 1_000;
let lastInputAt: number | null = null, listening = false;
const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
function listenForInput(): void {
  if (listening || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  listening = true;
  for (const name of INPUT_EVENTS) window.addEventListener(name, () => { lastInputAt = Date.now(); }, { passive: true, capture: true });
}
/** Test seam: forget observed input. */
export function resetAlertActivity(): void { lastInputAt = null; }
export function alertUserAway(nowMs: number = Date.now(), input: number | null = lastInputAt, hidden: boolean = typeof document !== 'undefined' && document.visibilityState === 'hidden'): boolean {
  return hidden || (input !== null && nowMs - input >= ALERT_USER_IDLE_MS);
}
/**
 * Hide a toast ALERT_POPUP_AUTOHIDE_MS after it was shown, counted on user activity: if the user is away when the time is
 * up, the toast waits and the full delay restarts once they are back. Returns a cancel function.
 */
export function scheduleActivityAutoHide(shownAtMs: number, hide: () => void, nowMs: () => number = Date.now): () => void {
  listenForInput();
  let timer: ReturnType<typeof setTimeout> | undefined, stopped = false;
  const fire = () => {
    if (stopped) return;
    if (!alertUserAway(nowMs())) { hide(); return; }
    const poll = () => { if (stopped) return; if (alertUserAway(nowMs())) timer = setTimeout(poll, ALERT_AWAY_POLL_MS); else timer = setTimeout(fire, ALERT_POPUP_AUTOHIDE_MS); };
    timer = setTimeout(poll, ALERT_AWAY_POLL_MS);
  };
  timer = setTimeout(fire, Math.max(0, ALERT_POPUP_AUTOHIDE_MS - (nowMs() - shownAtMs)));
  return () => { stopped = true; if (timer !== undefined) clearTimeout(timer); };
}
export const ALERT_DELIVERY_POLICY = 'Every trigger is recorded in local alert history. Popup, desktop and sound actions only present recorded triggers. Desktop notifications depend on local app and OS permission; a refusal is shown in OpenCandle. A sound plays once per delivered batch, or repeats for the chosen Sound duration (5, 10 or 30 seconds). Webhooks are OpenCandle-local: they post only to this computer (localhost, 127.0.0.1 or ::1). Email and SMS delivery are not configured.';

const DELIVERY_OPTIONAL = ['webhook', 'soundRepeat'] as const;
export function validateAlertDelivery(value: unknown): asserts value is AlertDeliverySettings {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Alert delivery settings must be a plain object.');
  const keys = Reflect.ownKeys(value), optional = DELIVERY_OPTIONAL.filter(key => keys.includes(key)), expected = ['schemaVersion', 'popup', 'desktop', 'sound', ...optional];
  if (keys.length !== expected.length || !expected.every(key => keys.includes(key) && Object.getOwnPropertyDescriptor(value, key)?.enumerable && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) throw new Error('Alert delivery settings have unsupported fields.');
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || typeof record.popup !== 'boolean' || typeof record.desktop !== 'boolean' || record.sound !== null && !ALERT_SOUND_IDS.includes(record.sound as AlertSoundId)) throw new Error('Invalid alert delivery settings.');
  if (optional.includes('webhook')) validateAlertWebhookUrl(record.webhook);
  if (optional.includes('soundRepeat') && (record.sound === null || !(ALERT_SOUND_REPEAT_SECONDS as readonly unknown[]).includes(record.soundRepeat))) throw new Error('Invalid alert sound duration.');
}
/** A validated frozen copy that keeps the optional webhook and sound duration (compound alerts store these). */
export function copyAlertDelivery(value: unknown): Readonly<AlertDeliverySettings> {
  validateAlertDelivery(value);
  return Object.freeze({ schemaVersion: 1, popup: value.popup, desktop: value.desktop, sound: value.sound, ...(value.webhook !== undefined ? { webhook: value.webhook } : {}), ...(value.soundRepeat !== undefined ? { soundRepeat: value.soundRepeat } : {}) });
}
export function alertDeliveryFor(definition: Pick<AlertDefinition, 'delivery'>): AlertDeliverySettings {
  return definition.delivery ? { ...definition.delivery } : { ...LEGACY_ALERT_DELIVERY };
}
export function createAlertDelivery(popup: boolean, desktop: boolean, sound: AlertSoundId | null, webhook?: string | null, soundRepeat?: AlertSoundRepeat | null): AlertDeliverySettings {
  const value: AlertDeliverySettings = { schemaVersion: 1, popup, desktop, sound, ...(webhook ? { webhook: webhook.trim() } : {}), ...(sound && soundRepeat ? { soundRepeat } : {}) }; validateAlertDelivery(value); return value;
}
/** LV-local webhook rule: http or https to this computer only, no credentials, at most 2048 characters. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
export const ALERT_WEBHOOK_LOCAL_ONLY = 'Webhook URLs must point to this computer (localhost, 127.0.0.1 or ::1). OpenCandle never sends alerts off this machine.';
export function validateAlertWebhookUrl(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || value !== value.trim()) throw new Error('Enter a webhook URL.');
  let url: URL; try { url = new URL(value); } catch { throw new Error('The webhook URL is not a valid address.'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Webhook URLs use http or https.');
  if (url.username || url.password) throw new Error('Webhook URLs cannot contain a user name or password.');
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) throw new Error(ALERT_WEBHOOK_LOCAL_ONLY);
}
/** The webhook body: the alert message, as JSON when it parses as JSON, otherwise plain text. */
export type AlertWebhookOrigin = 'local' | 'replay' | 'synthetic' | 'test';
export interface AlertWebhookRequest { url: string; body: string; contentType: 'application/json' | 'text/plain'; /** Sent as the X-OpenCandle-Alert header so a receiver can tell replay and synthetic triggers apart without changing the body. */ origin: AlertWebhookOrigin }
export function alertWebhookRequest(item: AlertDeliveryItem): AlertWebhookRequest | null {
  const url = item.delivery.webhook; if (!url) return null;
  const body = item.notification.message.slice(0, 8000);
  let json = false; try { const parsed = JSON.parse(body); json = parsed !== null && typeof parsed === 'object'; } catch { /* plain text */ }
  const origin: AlertWebhookOrigin = item.notification.mode === 'replay' ? 'replay' : item.notification.name.startsWith('SYNTHETIC ') ? 'synthetic' : 'local';
  return { url, body, contentType: json ? 'application/json' : 'text/plain', origin };
}
export interface AlertWebhookPort { post(request: AlertWebhookRequest): Promise<{ delivered: boolean; status: number; error: string | null }>; }
/** The dialog's Send test. The draft message is the body (placeholders stay as typed; JSON when it parses as an
 * object, else plain text; a blank message sends a fixed sample) and the X-OpenCandle-Alert header says test. One POST through the same port. */
export const ALERT_WEBHOOK_TEST_BODY = 'OpenCandle test alert. This is not a trigger.';
export function alertWebhookTestRequest(url: string, message: string): AlertWebhookRequest {
  validateAlertWebhookUrl(url);
  const body = (message.trim() ? message : ALERT_WEBHOOK_TEST_BODY).slice(0, 8000);
  let json = false; try { const parsed = JSON.parse(body); json = parsed !== null && typeof parsed === 'object'; } catch { /* plain text */ }
  return { url, body, contentType: json ? 'application/json' : 'text/plain', origin: 'test' };
}
/** Sends the test and returns the line the dialog shows: delivered with the HTTP status, the status, or the error. Never throws. */
export async function sendAlertWebhookTest(port: AlertWebhookPort | null, url: string, message: string): Promise<{ delivered: boolean; text: string }> {
  let request: AlertWebhookRequest;
  try { request = alertWebhookTestRequest(url, message); } catch (error) { return { delivered: false, text: `Test not sent: ${error instanceof Error ? error.message : String(error)}` }; }
  if (!port) return { delivered: false, text: 'Test not sent: webhooks need the OpenCandle desktop app.' };
  try {
    const result = await port.post(request);
    if (result.delivered) return { delivered: true, text: `Test delivered (HTTP ${result.status}).` };
    return { delivered: false, text: `Test failed: ${sentence(result.error ?? 'HTTP ' + result.status)}` };
  } catch (error) { return { delivered: false, text: `Test failed: ${sentence(error instanceof Error ? error.message : String(error))}` }; }
}
/** One closing period, never "reached..". */
const sentence = (text: string) => { const trimmed = text.trim().replace(/[.\s]+$/, ''); return trimmed + '.'; };
/** Posts each webhook trigger once, in trigger order. Failures are reported, never retried; the log already holds every trigger. */
export async function deliverAlertWebhooks(port: AlertWebhookPort | null, items: readonly AlertDeliveryItem[], limit = ALERT_DELIVERY_BATCH_LIMIT): Promise<{ sent: number; failures: string[] }> {
  const requests = items.flatMap(item => { const request = alertWebhookRequest(item); return request ? [{ item, request }] : []; });
  if (!requests.length) return { sent: 0, failures: [] };
  if (!port) return { sent: 0, failures: [`${requests.length} webhook${requests.length === 1 ? ' was' : 's were'} not sent: webhooks need the OpenCandle desktop app. The trigger${requests.length === 1 ? ' is' : 's are'} recorded in alert history.`] };
  let sent = 0; const failures: string[] = [];
  for (const { item, request } of requests.slice(-limit)) {
    try { const result = await port.post(request); if (result.delivered) sent++; else failures.push(`Webhook for ${item.notification.name} failed: ${result.error ?? 'HTTP ' + result.status}.`); }
    catch (error) { failures.push(`Webhook for ${item.notification.name} failed: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (requests.length > limit) failures.push(`${requests.length - limit} more webhooks were not sent to limit one batch. All triggers are recorded in alert history.`);
  return { sent, failures };
}
export function describeAlertDelivery(delivery: AlertDeliverySettings): string {
  const parts = ['Log'];
  if (delivery.popup) parts.push('Popup'); if (delivery.desktop) parts.push('Desktop notification');
  if (delivery.sound) parts.push(`Sound: ${alertSound(delivery.sound).label}${delivery.soundRepeat ? ` (${delivery.soundRepeat} s)` : ''}`);
  if (delivery.webhook) parts.push('Webhook');
  return parts.join(' · ');
}

export interface AlertDeliveryItem { readonly notification: AlertNotification; readonly delivery: AlertDeliverySettings; }
/**
 * Identify triggers recorded since the previous observation of the collection.
 * The returned seen set contains only currently retained notification IDs, so
 * removed alerts do not grow the delivery memory. History present when the
 * caller first observes the collection must be supplied as the initial seen set.
 */
export function collectFreshAlertNotifications(seen: ReadonlySet<string>, alerts: readonly LocalAlert[]): { seen: Set<string>; fresh: AlertDeliveryItem[] } {
  const next = new Set<string>(), fresh: AlertDeliveryItem[] = [];
  for (const alert of alerts) {
    const delivery = alertDeliveryFor(alert.definition);
    for (const notification of alert.history) {
      next.add(notification.id);
      if (!seen.has(notification.id)) fresh.push({ notification, delivery });
    }
  }
  fresh.sort((a, b) => a.notification.at - b.notification.at || a.notification.sequence - b.notification.sequence || (a.notification.id < b.notification.id ? -1 : a.notification.id > b.notification.id ? 1 : 0));
  return { seen: next, fresh };
}
export function retainedNotificationIds(alerts: readonly LocalAlert[]): Set<string> { return collectFreshAlertNotifications(new Set(), alerts).seen; }

export const ALERT_DELIVERY_BATCH_LIMIT = 20;
export interface AlertDeliveryPlan { readonly popups: readonly AlertDeliveryItem[]; readonly desktop: readonly AlertDeliveryItem[]; readonly sound: AlertSoundId | null; /** Seconds to repeat the batch sound; 0 plays it once. */ readonly soundRepeat: number; readonly suppressedPopups: number; readonly suppressedDesktop: number; }
/** Present at most a bounded number of items per batch; the remainder is counted, never dropped silently. The latest sound-enabled trigger chooses the batch sound. */
export function planAlertDelivery(fresh: readonly AlertDeliveryItem[], limit = ALERT_DELIVERY_BATCH_LIMIT): AlertDeliveryPlan {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Alert delivery batch limit must be a positive integer.');
  const popup = fresh.filter(item => item.delivery.popup), desktop = fresh.filter(item => item.delivery.desktop);
  const chosen = [...fresh].reverse().find(item => item.delivery.sound !== null), sound = chosen?.delivery.sound ?? null, soundRepeat = chosen?.delivery.soundRepeat ?? 0;
  return Object.freeze({ popups: Object.freeze(popup.slice(-limit)), desktop: Object.freeze(desktop.slice(-limit)), sound, soundRepeat, suppressedPopups: Math.max(0, popup.length - limit), suppressedDesktop: Math.max(0, desktop.length - limit) });
}

export function alertNotificationTitle(item: AlertDeliveryItem): string { return `${item.notification.mode === 'replay' ? 'Replay alert: ' : 'Alert: '}${item.notification.name}`; }
export function alertNotificationBody(item: AlertDeliveryItem): string {
  const time = new Date(item.notification.at * 1000).toISOString().replace('.000Z', 'Z');
  const message = item.notification.message.trim();
  return `${message ? message + '\n' : ''}Value ${item.notification.value} at ${time} (local observation).`;
}

export type DesktopPermission = 'granted' | 'denied' | 'default' | 'unsupported';
export interface DesktopNotificationPort {
  permission: () => DesktopPermission;
  request?: () => Promise<DesktopPermission>;
  show: (title: string, body: string, tag: string) => void | Promise<void>;
}
export interface DesktopDeliveryResult { readonly shown: number; readonly failure: string | null; }
/** Never claims an OS notification was shown unless the port accepted it. Requests permission at most once per call. */
export async function deliverDesktopNotifications(port: DesktopNotificationPort | null, items: readonly AlertDeliveryItem[]): Promise<DesktopDeliveryResult> {
  if (!items.length) return { shown: 0, failure: null };
  const refused = (reason: string) => ({ shown: 0, failure: `${items.length} desktop notification${items.length === 1 ? ' was' : 's were'} not shown: ${reason} The trigger${items.length === 1 ? ' is' : 's are'} recorded in alert history and in-app popups still apply.` });
  if (!port) return refused('desktop notifications are unavailable in this environment.');
  let permission: DesktopPermission;
  try { permission = port.permission(); } catch { return refused('the local notification permission could not be read.'); }
  if (permission === 'default' && port.request) { try { permission = await port.request(); } catch { return refused('the local notification permission request failed.'); } }
  if (permission === 'unsupported') return refused('desktop notifications are unavailable in this environment.');
  if (permission !== 'granted') return refused(`local notification permission is ${permission === 'denied' ? 'denied' : 'not granted'}.`);
  let shown = 0;
  for (const item of items) {
    try { await port.show(alertNotificationTitle(item), alertNotificationBody(item), item.notification.id); shown++; }
    catch { return { shown, failure: `${items.length - shown} desktop notification${items.length - shown === 1 ? ' was' : 's were'} not shown: the local notification service refused the request. The trigger is recorded in alert history.` }; }
  }
  return { shown, failure: null };
}
