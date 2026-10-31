import { expect, it, vi } from 'vitest';
import { ALERT_SOUND_IDS, ALERT_SOUNDS, LV_DEFAULT_ALERT_DELIVERY, alertDeliveryFor, collectFreshAlertNotifications, createAlertDelivery, deliverDesktopNotifications, describeAlertDelivery, planAlertDelivery, retainedNotificationIds, validateAlertDelivery, type AlertDeliveryItem, type DesktopNotificationPort } from '../../src/domain/alert-delivery';
import { createLocalAlert, editLocalAlert, processAlertEvent, restoreLocalAlerts, validateLocalAlerts, type AlertDefinition, type AlertEvent, type LocalAlert } from '../../src/domain/alerts';

// SYNTHETIC fixtures. Model checks only: no OS notification, audio device or GUI.
const definition = (id: string, extra: Partial<AlertDefinition> = {}): AlertDefinition => ({ id, instrumentId: 'SYNTHETIC:GME', sourceId: 'close', name: `SYNTHETIC ${id}`, message: `SYNTHETIC ${id} message`, condition: { kind: 'greater', value: 10 }, frequency: 'every-time', createdAt: 100, expiresAt: null, mode: 'ordinary', runId: 'ordinary', ...extra });
const event = (sequence: number, value: number, time = 100 + sequence): AlertEvent => ({ instrumentId: 'SYNTHETIC:GME', sourceId: 'close', value, time, availableAt: time, sequence, barId: `SYNTHETIC bar ${sequence}`, barClosed: false, feedState: 'ready', mode: 'ordinary', runId: 'ordinary' });
function trigger(alert: LocalAlert, sequence: number, value = 11): LocalAlert { const result = processAlertEvent(alert, event(sequence, value)); expect(result.notification).not.toBeNull(); return result.alert; }
const item = (id: string, at: number, delivery = createAlertDelivery(true, false, null), mode: 'ordinary' | 'replay' = 'ordinary'): AlertDeliveryItem => ({ notification: { id, alertId: 'SYNTHETIC', name: `SYNTHETIC ${id}`, message: 'SYNTHETIC body', value: 11, at, barId: 'SYNTHETIC bar', sequence: at, mode, runId: mode === 'replay' ? 'replay:run' : 'ordinary', local: true }, delivery });

it('validates exact delivery settings and keeps OpenCandle defaults explicit', () => {
  expect(LV_DEFAULT_ALERT_DELIVERY).toEqual({ schemaVersion: 1, popup: true, desktop: true, sound: 'lv-chime' });
  expect(Object.isFrozen(LV_DEFAULT_ALERT_DELIVERY)).toBe(true);
  expect(ALERT_SOUNDS.map(sound => sound.id)).toEqual([...ALERT_SOUND_IDS]);
  expect(ALERT_SOUNDS.every(sound => sound.tones.length > 0 && sound.tones.every(tone => tone.frequency > 0 && tone.duration > 0 && tone.start >= 0))).toBe(true);
  expect(() => validateAlertDelivery(createAlertDelivery(false, true, 'lv-bell'))).not.toThrow();
  for (const bad of [null, [], { schemaVersion: 1, popup: true, desktop: false }, { schemaVersion: 2, popup: true, desktop: false, sound: null }, { schemaVersion: 1, popup: 'yes', desktop: false, sound: null }, { schemaVersion: 1, popup: true, desktop: false, sound: 'siren' }, { schemaVersion: 1, popup: true, desktop: false, sound: null, email: true }])
    expect(() => validateAlertDelivery(bad)).toThrow();
  const getter = Object.defineProperty({ schemaVersion: 1, popup: true, desktop: false }, 'sound', { enumerable: true, get: () => null });
  expect(() => validateAlertDelivery(getter)).toThrow(/unsupported fields/);
  expect(describeAlertDelivery(createAlertDelivery(true, true, 'lv-chime'))).toBe('Log · Popup · Desktop notification · Sound: Chime');
  expect(describeAlertDelivery(createAlertDelivery(false, false, null))).toBe('Log');
});

it('persists delivery in the definition, rejects invalid saved settings and treats legacy alerts as popup only', () => {
  const legacy = createLocalAlert(definition('legacy'));
  expect('delivery' in legacy.definition).toBe(false);
  expect(alertDeliveryFor(legacy.definition)).toEqual({ schemaVersion: 1, popup: true, desktop: false, sound: null });
  const configured = createLocalAlert(definition('configured', { delivery: createAlertDelivery(false, true, 'lv-pulse') }));
  const restored = restoreLocalAlerts(JSON.parse(JSON.stringify([legacy, configured])));
  expect(restored[1].definition.delivery).toEqual({ schemaVersion: 1, popup: false, desktop: true, sound: 'lv-pulse' });
  expect(() => createLocalAlert(definition('bad', { delivery: { schemaVersion: 1, popup: true, desktop: false, sound: 'unknown' } as never }))).toThrow(/Invalid alert delivery/);
  const forged = JSON.parse(JSON.stringify([configured])); forged[0].definition.delivery.webhook = 'https://example.invalid';
  expect(validateLocalAlerts(forged).ok).toBe(false);
  const edited = editLocalAlert(trigger(configured, 1), { delivery: createAlertDelivery(true, false, 'lv-rise') }, 150);
  expect(edited.definition.delivery).toEqual({ schemaVersion: 1, popup: true, desktop: false, sound: 'lv-rise' });
  expect(edited.revision).toBe(2); expect(edited.history).toHaveLength(1);
  expect(() => editLocalAlert(configured, { delivery: { schemaVersion: 1, popup: true, desktop: true, sound: 'loud' } as never }, 150)).toThrow(/Invalid alert delivery/);
});

it('announces only triggers recorded after the initial observation, in recorded order', () => {
  let a = trigger(createLocalAlert(definition('a', { delivery: createAlertDelivery(true, false, 'lv-bell') })), 1);
  const b = createLocalAlert(definition('b', { delivery: createAlertDelivery(false, true, null) }));
  const initial = retainedNotificationIds([a, b]);
  expect([...initial]).toEqual([a.history[0].id]);
  expect(collectFreshAlertNotifications(initial, [a, b]).fresh).toEqual([]);
  a = trigger(a, 3); const b2 = trigger(b, 2);
  const { seen, fresh } = collectFreshAlertNotifications(initial, [a, b2]);
  expect(fresh.map(entry => [entry.notification.id, entry.delivery.popup, entry.delivery.desktop, entry.delivery.sound])).toEqual([[b2.history[0].id, false, true, null], [a.history[1].id, true, false, 'lv-bell']]);
  expect(seen.size).toBe(3);
  // Deleting an alert removes its IDs from delivery memory; nothing is re-announced.
  const afterDelete = collectFreshAlertNotifications(seen, [b2]);
  expect(afterDelete.fresh).toEqual([]); expect([...afterDelete.seen]).toEqual([b2.history[0].id]);
  // An edit keeps history IDs and delivers nothing; only the next trigger is fresh.
  const edited = editLocalAlert(b2, { name: 'SYNTHETIC renamed' }, 200);
  expect(collectFreshAlertNotifications(afterDelete.seen, [edited]).fresh).toEqual([]);
});

it('bounds a delivery batch, counts the remainder and lets the latest sound-enabled trigger choose the sound', () => {
  const quiet = createAlertDelivery(true, true, null), bell = createAlertDelivery(false, false, 'lv-bell'), chime = createAlertDelivery(true, false, 'lv-chime');
  const fresh = [item('1', 1, chime), item('2', 2, bell), ...Array.from({ length: 23 }, (_, i) => item(`q${i}`, 3 + i, quiet))];
  const plan = planAlertDelivery(fresh);
  expect(plan.sound).toBe('lv-bell');
  expect(plan.popups).toHaveLength(20); expect(plan.suppressedPopups).toBe(4); expect(plan.popups[0].notification.id).toBe('q3');
  expect(plan.desktop).toHaveLength(20); expect(plan.suppressedDesktop).toBe(3);
  expect(planAlertDelivery([item('x', 1, createAlertDelivery(false, false, null))])).toEqual({ popups: [], desktop: [], sound: null, soundRepeat: 0, suppressedPopups: 0, suppressedDesktop: 0 });
  expect(planAlertDelivery([item('1', 1, chime), item('2', 2, quiet)]).sound).toBe('lv-chime');
  expect(() => planAlertDelivery(fresh, 0)).toThrow(/positive integer/);
});

it('never claims a desktop notification unless local permission is granted and the port accepts it', async () => {
  const items = [item('n1', 1_700_000_000, createAlertDelivery(true, true, null)), item('n2', 1_700_000_060, createAlertDelivery(true, true, null), 'replay')];
  expect(await deliverDesktopNotifications(null, [])).toEqual({ shown: 0, failure: null });
  expect((await deliverDesktopNotifications(null, items)).failure).toMatch(/^2 desktop notifications were not shown: desktop notifications are unavailable/);
  const denied: DesktopNotificationPort = { permission: () => 'denied', show: vi.fn() };
  const deniedResult = await deliverDesktopNotifications(denied, items);
  expect(deniedResult.shown).toBe(0); expect(deniedResult.failure).toContain('local notification permission is denied'); expect(denied.show).not.toHaveBeenCalled();
  const request = vi.fn(async () => 'denied' as const), prompt: DesktopNotificationPort = { permission: () => 'default', request, show: vi.fn() };
  expect((await deliverDesktopNotifications(prompt, items)).failure).toContain('denied'); expect(request).toHaveBeenCalledTimes(1); expect(prompt.show).not.toHaveBeenCalled();
  const failingRequest: DesktopNotificationPort = { permission: () => 'default', request: async () => { throw new Error('SYNTHETIC'); }, show: vi.fn() };
  expect((await deliverDesktopNotifications(failingRequest, items)).failure).toContain('permission request failed');
  const unreadable: DesktopNotificationPort = { permission: () => { throw new Error('SYNTHETIC'); }, show: vi.fn() };
  expect((await deliverDesktopNotifications(unreadable, items.slice(0, 1))).failure).toMatch(/^1 desktop notification was not shown: the local notification permission could not be read/);
  const show = vi.fn(), granted: DesktopNotificationPort = { permission: () => 'granted', show };
  expect(await deliverDesktopNotifications(granted, items)).toEqual({ shown: 2, failure: null });
  expect(show.mock.calls).toEqual([
    ['Alert: SYNTHETIC n1', 'SYNTHETIC body\nValue 11 at 2023-11-14T22:13:20Z (local observation).', 'n1'],
    ['Replay alert: SYNTHETIC n2', 'SYNTHETIC body\nValue 11 at 2023-11-14T22:14:20Z (local observation).', 'n2'],
  ]);
  let calls = 0; const partial: DesktopNotificationPort = { permission: () => 'granted', show: () => { if (++calls === 2) throw new Error('SYNTHETIC'); } };
  const partialResult = await deliverDesktopNotifications(partial, items);
  expect(partialResult.shown).toBe(1); expect(partialResult.failure).toMatch(/^1 desktop notification was not shown: the local notification service refused/);
});
