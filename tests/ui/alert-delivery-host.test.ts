import { expect, it, vi } from 'vitest';
import { mountControlledComponent, all, text, invoke } from '../helpers/alert-dialog-harness';
import { AlertDeliveryHost, ALERT_POPUP_VISIBLE_LIMIT, type AlertDeliveryHostProps } from '../../src/ui/alert-delivery-host';
import { createAlertDelivery, type DesktopNotificationPort } from '../../src/domain/alert-delivery';
import { createLocalAlert, processAlertEvent, type AlertDefinition, type LocalAlert } from '../../src/domain/alerts';

// Component-handler checks through the shared controlled hook model. Effects
// and async deliveries are flushed explicitly. No DOM, OS notification, audio
// device, focus or packaged GUI behavior is claimed.
const definition = (id: string, delivery?: AlertDefinition['delivery'], mode: 'ordinary' | 'replay' = 'ordinary'): AlertDefinition => ({ id, instrumentId: 'SYNTHETIC:GME', sourceId: 'close', name: `SYNTHETIC ${id}`, message: `SYNTHETIC ${id} crossed`, condition: { kind: 'greater', value: 10 }, frequency: 'every-time', createdAt: 1000, expiresAt: null, mode, runId: mode === 'replay' ? 'replay:SYNTHETIC' : 'ordinary', ...(delivery ? { delivery } : {}) });
function fire(alert: LocalAlert, sequence: number, value = 11): LocalAlert {
  const d = alert.definition, time = 1000 + sequence;
  const result = processAlertEvent(alert, { instrumentId: d.instrumentId, sourceId: d.sourceId, value, time, availableAt: time, sequence, barId: `SYNTHETIC bar ${sequence}`, barClosed: false, feedState: 'ready', mode: d.mode, runId: d.runId });
  expect(result.notification).not.toBeNull(); return result.alert;
}
const microtasks = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function host(initial: LocalAlert[], ports: Partial<AlertDeliveryHostProps> = {}) {
  const play = vi.fn(async () => undefined), show = vi.fn();
  const desktop: DesktopNotificationPort = { permission: () => 'granted', show };
  const props: AlertDeliveryHostProps = { alerts: initial, soundPlayer: { play }, desktopPort: desktop, ...ports };
  const view = mountControlledComponent(() => AlertDeliveryHost(props));
  view.settle();
  const popups = () => all(view.render(), node => node.type === 'article' && typeof node.props['data-alert-notification-id'] === 'string');
  const update = (alerts: LocalAlert[]) => { props.alerts = alerts; view.settle(); };
  return { ...view, props, play, show, popups, update };
}

it('does not re-announce retained history and presents a newly recorded trigger as a popup until dismissed', async () => {
  const alert = fire(createLocalAlert(definition('a')), 1);
  const ui = host([alert]);
  expect(ui.render()).toBeNull(); expect(ui.play).not.toHaveBeenCalled(); expect(ui.show).not.toHaveBeenCalled();
  const next = fire(alert, 2, 12);
  ui.update([next]);
  const [popup] = ui.popups();
  expect(popup.props['data-alert-notification-id']).toBe(next.history[1].id);
  expect(text(popup)).toBe('Alert: SYNTHETIC aSYNTHETIC a crossed\nValue 12 at 1970-01-01T00:16:42Z (local observation).Dismiss');
  expect(ui.play).not.toHaveBeenCalled(); expect(ui.show).not.toHaveBeenCalled();
  ui.update([next]); expect(ui.popups()).toHaveLength(1);
  const dismiss = all(ui.render(), node => node.type === 'button' && node.props['aria-label'] === 'Dismiss alert popup SYNTHETIC a')[0];
  invoke(dismiss.props.onClick); ui.settle();
  expect(ui.render()).toBeNull();
  // Saved history is never touched by presentation.
  expect(next.history).toHaveLength(2);
});

it('plays the selected sound once per batch and shows granted desktop notifications without a popup when popup is off', async () => {
  const quiet = createLocalAlert(definition('quiet', createAlertDelivery(false, true, 'lv-double')));
  const loud = createLocalAlert(definition('loud', createAlertDelivery(true, false, 'lv-rise')));
  const ui = host([quiet, loud]);
  ui.update([fire(quiet, 1), fire(loud, 2)]);
  await microtasks();
  expect(ui.play.mock.calls).toEqual([['lv-rise']]);
  expect(ui.show.mock.calls.map(call => [call[0], call[2]])).toEqual([['Alert: SYNTHETIC quiet', 'quiet:ordinary:revision-1:1']]);
  expect(ui.popups().map(node => node.props['data-alert-notification-id'])).toEqual(['loud:ordinary:revision-1:2']);
});

it('shows a visible notice when local desktop permission is denied or sound output fails, while the popup still appears', async () => {
  const play = vi.fn(async () => { throw new Error('Sound output is blocked until audio is permitted.'); });
  const denied: DesktopNotificationPort = { permission: () => 'denied', show: vi.fn() };
  const alert = createLocalAlert(definition('both', createAlertDelivery(true, true, 'lv-chime')));
  const ui = host([alert], { desktopPort: denied, soundPlayer: { play } });
  ui.update([fire(alert, 1)]);
  await microtasks(); ui.settle();
  const notices = all(ui.render(), node => node.props.className === 'lv-alert-delivery-notice').map(text);
  expect(notices).toEqual([
    'Alert sound was not played: Sound output is blocked until audio is permitted. The trigger is recorded in alert history.Dismiss',
    '1 desktop notification was not shown: local notification permission is denied. The trigger is recorded in alert history and in-app popups still apply.Dismiss',
  ]);
  expect(denied.show).not.toHaveBeenCalled(); expect(ui.popups()).toHaveLength(1);
  const close = all(ui.render(), node => node.type === 'button' && node.props['aria-label'] === 'Dismiss delivery notice')[0];
  invoke(close.props.onClick); ui.settle();
  expect(all(ui.render(), node => node.props.className === 'lv-alert-delivery-notice')).toHaveLength(1);
});

it('reports an unavailable desktop notification environment and labels replay popups', async () => {
  const alert = createLocalAlert(definition('replayed', createAlertDelivery(true, true, null), 'replay'));
  const ui = host([alert], { desktopPort: null });
  ui.update([fire(alert, 1)]);
  await microtasks(); ui.settle();
  expect(text(ui.popups()[0])).toMatch(/^Replay alert: SYNTHETIC replayed/);
  expect(ui.text()).toContain('1 desktop notification was not shown: desktop notifications are unavailable in this environment.');
});

it('keeps the newest popups visible, counts closed ones and dismisses all', () => {
  let alert = createLocalAlert(definition('many'));
  const ui = host([alert]);
  for (let sequence = 1; sequence <= ALERT_POPUP_VISIBLE_LIMIT + 2; sequence++) { alert = fire(alert, sequence); ui.update([alert]); }
  expect(ui.popups().map(node => node.props['data-alert-notification-id'])).toEqual(alert.history.slice(-ALERT_POPUP_VISIBLE_LIMIT).map(item => item.id));
  expect(ui.text()).toContain('2 earlier alert popups were closed to keep 5 visible. All triggers remain in alert history.');
  const all_ = all(ui.render(), node => node.type === 'button' && text(node) === 'Dismiss all alert popups')[0];
  invoke(all_.props.onClick); ui.settle();
  expect(ui.render()).toBeNull(); expect(alert.history).toHaveLength(ALERT_POPUP_VISIBLE_LIMIT + 2);
});

// SYNTHETIC: OS notifications go through the trusted desktop bridge, and toasts hide themselves.
import { bridgeDesktopNotificationPort, defaultDesktopNotificationPort } from '../../src/ui/alert-delivery-host';
import { ALERT_POPUP_AUTOHIDE_MS } from '../../src/domain/alert-delivery';

it('presents an OS notification through the desktop bridge and fails loudly when the bridge refuses', async () => {
  const calls: unknown[] = [];
  const port = bridgeDesktopNotificationPort({ showAlertNotification: async (input: unknown) => { calls.push(input); return { ok: true as const, value: { shown: true } }; } });
  expect(port.permission()).toBe('granted');
  await port.show('Alert: A', 'Value 1', 'id-1');
  expect(calls).toEqual([{ title: 'Alert: A', body: 'Value 1', tag: 'id-1' }]);
  await expect(bridgeDesktopNotificationPort({ showAlertNotification: async () => ({ ok: true as const, value: { shown: false } }) }).show('a', 'b', 'c')).rejects.toThrow();
  await expect(bridgeDesktopNotificationPort({ showAlertNotification: async () => ({ ok: false as const, error: { code: 'DENIED', message: 'no' } }) }).show('a', 'b', 'c')).rejects.toThrow('no');
});

it('prefers the desktop bridge over the renderer Notification API', () => {
  expect(defaultDesktopNotificationPort({ showAlertNotification: async () => ({ ok: true as const, value: { shown: true } }) })?.permission()).toBe('granted');
  expect(defaultDesktopNotificationPort(undefined)).toBe(null);
});

it('hides a toast after the auto-hide time and keeps it in history', async () => {
  vi.useFakeTimers();
  try {
    const alert = fire(createLocalAlert(definition('a')), 1);
    const ui = host([alert]);
    ui.update([fire(alert, 2, 12)]);
    expect(ui.popups()).toHaveLength(1);
    vi.advanceTimersByTime(ALERT_POPUP_AUTOHIDE_MS - 1); ui.settle();
    expect(ui.popups()).toHaveLength(1);
    vi.advanceTimersByTime(1); ui.settle();
    expect(ui.popups()).toHaveLength(0);
  } finally { vi.useRealTimers(); }
});
