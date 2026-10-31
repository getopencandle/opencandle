import { expect, it, vi } from 'vitest';
import { mountControlledComponent, all } from '../helpers/alert-dialog-harness';
import { AlertDeliveryHost, announceAlertDeliveries, type AlertDeliveryHostProps } from '../../src/ui/alert-delivery-host';
import { LV_DEFAULT_ALERT_DELIVERY, type DesktopNotificationPort } from '../../src/domain/alert-delivery';
import { listAlertNotificationToLocal, type ListAlertNotification } from '../../src/domain/watchlist-alerts';
import { createLocalAlert, processAlertEvent, type LocalAlert } from '../../src/domain/alerts';
import { alertOn, liveLike } from '../helpers/background-alert-fixtures';

// List-alert triggers (one per symbol) reach the mounted delivery host like local alert triggers.
// SYNTHETIC notifications through the controlled hook model; no DOM, OS notification or audio device.
const microtasks = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const trigger = (symbol: string, sequence: number): ListAlertNotification => ({ id: `la:US:${symbol}:${sequence}:100`, alertId: 'la', memberKey: 'US:' + symbol, name: 'SYNTHETIC list cross', message: 'SYNTHETIC level reached', value: 11, at: 100 + sequence, barId: 'SYNTHETIC bar ' + sequence, sequence });
const item = (row: ListAlertNotification) => ({ notification: listAlertNotificationToLocal(row), delivery: LV_DEFAULT_ALERT_DELIVERY });

it('announced list-alert triggers show one popup per symbol, play the sound once, and are never presented twice', async () => {
  const play = vi.fn(async () => undefined), show = vi.fn();
  const desktop: DesktopNotificationPort = { permission: () => 'granted', show };
  const props: AlertDeliveryHostProps = { alerts: [], soundPlayer: { play }, desktopPort: desktop };
  const view = mountControlledComponent(() => AlertDeliveryHost(props)); view.settle();
  const popups = () => all(view.render(), node => node.type === 'article' && typeof node.props['data-alert-notification-id'] === 'string');
  expect(popups()).toHaveLength(0);
  announceAlertDeliveries([item(trigger('GME', 1)), item(trigger('SPY', 1))]); view.settle(); await microtasks(); view.settle();
  expect(popups().map(node => node.props['data-alert-notification-id'])).toEqual(['la:US:GME:1:100', 'la:US:SPY:1:100']);
  expect(play).toHaveBeenCalledTimes(1); expect(show).toHaveBeenCalledTimes(2);
  expect(show.mock.calls.map(call => call[0])).toEqual(['Alert: SYNTHETIC list cross (US:GME)', 'Alert: SYNTHETIC list cross (US:SPY)']);
  announceAlertDeliveries([item(trigger('GME', 1))]); view.settle(); await microtasks();
  expect(popups()).toHaveLength(2); expect(play).toHaveBeenCalledTimes(1);
  announceAlertDeliveries([]); expect(play).toHaveBeenCalledTimes(1);
});

it('a local alert observed on the synthetic Alpaca stub is announced as SYNTHETIC; a real-feed alert is not', async () => {
  // Plain SYNTHETIC alerts fire; each then carries the observation binding of a live dataset (stub or real), which is all the host reads.
  const plain = (id: string, name: string) => createLocalAlert({ id, instrumentId: 'US:GME', sourceId: 'close', name, message: 'SYNTHETIC', condition: { kind: 'greater', value: 10 }, frequency: 'every-time', createdAt: 1000, expiresAt: null, mode: 'ordinary', runId: 'ordinary' });
  const fire = (alert: LocalAlert, sequence: number): LocalAlert => { const d = alert.definition, time = 1000 + sequence; const result = processAlertEvent(alert, { instrumentId: d.instrumentId, sourceId: d.sourceId, value: 11, time, availableAt: time, sequence, barId: 'SYNTHETIC bar ' + sequence, barClosed: false, feedState: 'ready', mode: d.mode, runId: d.runId }); expect(result.notification).not.toBeNull(); return result.alert; };
  const bind = (alert: LocalAlert, providerId?: string): LocalAlert => ({ ...alert, definition: { ...alert.definition, observationBinding: alertOn(liveLike('GME', '5m', providerId), 'b').definition.observationBinding } });
  const stub = bind(plain('stub', 'Stub cross'), 'alpaca-stub'), real = bind(plain('real', 'Real cross'));
  const show = vi.fn(), props: AlertDeliveryHostProps = { alerts: [stub, real], soundPlayer: { play: vi.fn(async () => undefined) }, desktopPort: { permission: () => 'granted', show } };
  const view = mountControlledComponent(() => AlertDeliveryHost(props)); view.settle();
  props.alerts = [bind(fire(plain('stub', 'Stub cross'), 1), 'alpaca-stub'), bind(fire(plain('real', 'Real cross'), 2))]; view.settle(); await microtasks(); view.settle();
  const names = all(view.render(), node => node.type === 'article').map(node => node.props['aria-label']);
  expect(names).toEqual(['Alert triggered: SYNTHETIC Stub cross', 'Alert triggered: Real cross']);
});
