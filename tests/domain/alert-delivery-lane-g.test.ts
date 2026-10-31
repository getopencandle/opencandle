import { expect, it, vi } from 'vitest';
import { ALERT_POPUP_AUTOHIDE_MS, LEGACY_ALERT_DELIVERY, LV_DEFAULT_ALERT_DELIVERY, alertPopupExpired, deliverDesktopNotifications, type AlertDeliveryItem, type DesktopNotificationPort } from '../../src/domain/alert-delivery';

// SYNTHETIC checks: defaults, popup auto-hide timing and asynchronous OS notification acceptance.
const item = (id: string): AlertDeliveryItem => ({ notification: { id, alertId: 'SYNTHETIC', name: 'SYNTHETIC ' + id, message: 'm', value: 1, at: 100, barId: 'b', sequence: 1, mode: 'ordinary', runId: 'r', local: true }, delivery: { schemaVersion: 1, popup: true, desktop: true, sound: 'lv-chime' } });

it('presents a toast, an OS notification and a sound for new alerts, while alerts saved earlier stay popup only', () => {
  expect(LV_DEFAULT_ALERT_DELIVERY).toEqual({ schemaVersion: 1, popup: true, desktop: true, sound: 'lv-chime' });
  expect(LEGACY_ALERT_DELIVERY).toEqual({ schemaVersion: 1, popup: true, desktop: false, sound: null });
});

it('hides a toast on its own after a fixed time, and never before', () => {
  expect(ALERT_POPUP_AUTOHIDE_MS).toBe(20_000);
  expect(alertPopupExpired(1000, 1000 + ALERT_POPUP_AUTOHIDE_MS - 1)).toBe(false);
  expect(alertPopupExpired(1000, 1000 + ALERT_POPUP_AUTOHIDE_MS)).toBe(true);
});

it('counts an OS notification as shown only after the asynchronous port accepted it', async () => {
  const accepted: DesktopNotificationPort = { permission: () => 'granted', show: vi.fn(async () => undefined) };
  expect(await deliverDesktopNotifications(accepted, [item('a'), item('b')])).toEqual({ shown: 2, failure: null });
  const refused: DesktopNotificationPort = { permission: () => 'granted', show: vi.fn(async () => { throw new Error('refused'); }) };
  const result = await deliverDesktopNotifications(refused, [item('a')]);
  expect(result.shown).toBe(0);
  expect(result.failure).toMatch(/not shown/);
});
