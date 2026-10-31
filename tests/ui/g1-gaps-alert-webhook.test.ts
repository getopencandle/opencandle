// LV-local alert webhooks (this computer only) and the quick expiration choices. SYNTHETIC rows only; the
// electron module is exercised with an injected fetch (no network).
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { setup, invoke, input } from '../helpers/alert-dialog-harness';
import { ALERT_WEBHOOK_LOCAL_ONLY, alertWebhookRequest, createAlertDelivery, deliverAlertWebhooks, describeAlertDelivery, validateAlertDelivery, validateAlertWebhookUrl, type AlertDeliveryItem } from '../../src/domain/alert-delivery';
import { ALERT_EXPIRY_PRESETS, alertExpiryPreset } from '../../src/ui/alert-time';
import { fixtureDataset } from '../../src/domain/fixtures';
import type { AlertEvent, AlertNotification } from '../../src/domain/alerts';

const require = createRequire(import.meta.url);
const webhook = require('../../electron/alert-webhook.cjs');
const note = (message: string, extra: Partial<AlertNotification> = {}): AlertNotification => ({ id: 'n1', alertId: 'a', name: 'GME up', message, value: 23, at: 120, barId: 'b', sequence: 1, mode: 'ordinary', runId: 'ordinary', local: true, ...extra });
const item = (message: string, url = 'http://127.0.0.1:9000/hook', extra: Partial<AlertNotification> = {}): AlertDeliveryItem => ({ notification: note(message, extra), delivery: createAlertDelivery(true, false, null, url) });

describe('webhook URL policy (LV-local)', () => {
  it('accepts loopback http(s) and refuses other hosts, schemes and credentials', () => {
    for (const ok of ['http://127.0.0.1:8080/alert', 'https://localhost/x', 'http://[::1]:3000/']) expect(() => validateAlertWebhookUrl(ok)).not.toThrow();
    expect(() => validateAlertWebhookUrl('https://example.com/hook')).toThrow(ALERT_WEBHOOK_LOCAL_ONLY);
    expect(() => validateAlertWebhookUrl('http://192.168.1.4/hook')).toThrow(ALERT_WEBHOOK_LOCAL_ONLY);
    expect(() => validateAlertWebhookUrl('ftp://127.0.0.1/')).toThrow('http or https');
    expect(() => validateAlertWebhookUrl('http://u:p@127.0.0.1/')).toThrow('user name');
    expect(() => validateAlertWebhookUrl('not a url')).toThrow('not a valid');
  });
  it('delivery settings keep the webhook as an optional fifth field', () => {
    const delivery = createAlertDelivery(true, true, 'lv-chime', 'http://127.0.0.1:9000/hook');
    expect(delivery).toEqual({ schemaVersion: 1, popup: true, desktop: true, sound: 'lv-chime', webhook: 'http://127.0.0.1:9000/hook' });
    expect(() => validateAlertDelivery(delivery)).not.toThrow();
    expect(createAlertDelivery(true, false, null)).toEqual({ schemaVersion: 1, popup: true, desktop: false, sound: null });
    expect(() => validateAlertDelivery({ ...delivery, webhook: 'https://example.com' })).toThrow();
    expect(() => validateAlertDelivery({ ...delivery, extra: 1 })).toThrow('unsupported fields');
    expect(describeAlertDelivery(delivery)).toBe('Log · Popup · Desktop notification · Sound: Chime · Webhook');
  });
  it('the body is the alert message, JSON when it parses as an object, with the origin header value', () => {
    expect(alertWebhookRequest(item('{"side":"buy","qty":1}'))).toEqual({ url: 'http://127.0.0.1:9000/hook', body: '{"side":"buy","qty":1}', contentType: 'application/json', origin: 'local' });
    expect(alertWebhookRequest(item('GME crossed 23'))?.contentType).toBe('text/plain');
    expect(alertWebhookRequest(item('x', undefined, { mode: 'replay' }))?.origin).toBe('replay');
    expect(alertWebhookRequest(item('x', undefined, { name: 'SYNTHETIC GME up' }))?.origin).toBe('synthetic');
    expect(alertWebhookRequest({ notification: note('x'), delivery: createAlertDelivery(true, false, null) })).toBeNull();
  });
  it('posts once per trigger and reports failures and a missing desktop bridge', async () => {
    const post = vi.fn(async () => ({ delivered: true, status: 200, error: null }));
    expect(await deliverAlertWebhooks({ post }, [item('a'), item('b')])).toEqual({ sent: 2, failures: [] });
    expect(post).toHaveBeenCalledTimes(2);
    const failing = { post: vi.fn(async () => ({ delivered: false, status: 500, error: null })) };
    expect((await deliverAlertWebhooks(failing, [item('a')])).failures[0]).toContain('HTTP 500');
    expect((await deliverAlertWebhooks(null, [item('a')])).failures[0]).toContain('desktop app');
  });
});

describe('electron/alert-webhook.cjs', () => {
  it('validates exact input and refuses non-loopback URLs', () => {
    expect(webhook.alertWebhookInput({ url: 'http://127.0.0.1:9000/h', body: 'x', contentType: 'text/plain', origin: 'local' }).url).toBe('http://127.0.0.1:9000/h');
    expect(() => webhook.alertWebhookInput({ url: 'https://example.com', body: 'x', contentType: 'text/plain', origin: 'local' })).toThrow('this computer');
    expect(() => webhook.alertWebhookInput({ url: 'http://127.0.0.1/', body: 'x', contentType: 'text/html', origin: 'local' })).toThrow();
    expect(() => webhook.alertWebhookInput({ url: 'http://127.0.0.1/', body: 'x', contentType: 'text/plain' })).toThrow();
  });
  it('posts with the content type and origin header, without following redirects', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 204 }));
    const result = await webhook.postAlertWebhook({ url: 'http://127.0.0.1:9000/h', body: '{}', contentType: 'application/json', origin: 'replay' }, fetchImpl);
    expect(result).toEqual({ delivered: true, status: 204, error: null });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, any];
    expect(init).toMatchObject({ method: 'POST', body: '{}', redirect: 'manual', headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-OpenCandle-Alert': 'replay' } });
    expect((await webhook.postAlertWebhook({ url: 'http://127.0.0.1:1/', body: '', contentType: 'text/plain', origin: 'local' }, async () => { throw new Error('refused'); })).delivered).toBe(false);
  });
});

describe('alert dialog: webhook field and quick expiration', () => {
  const instrumentId = fixtureDataset('GME', 1).instrument.id;
  function ui() {
    const view = setup([]);
    const check = (label: string, checked: boolean) => { const control = view.field(label), target = view.nodeFor(control); invoke(control.props.onChange, input(target, { target: { checked } })); view.settle(); };
    const submit = () => { const form = view.find(node => node.type === 'form'); invoke(form.props.onSubmit, { preventDefault: vi.fn() }); view.settle(); };
    const event: AlertEvent = { instrumentId, sourceId: 'close', value: 23, time: 120, availableAt: 120, sequence: 1, barId: 'SYNTHETIC bar', barClosed: false, feedState: 'ready', mode: 'ordinary', runId: 'ordinary' };
    view.props.event = event; view.callButton('Create alert');
    return { ...view, check, submit };
  }
  it('saves a loopback webhook URL with the alert', () => {
    const view = ui();
    view.check('Alert webhook', true);
    view.change('Alert webhook URL', 'http://127.0.0.1:9000/hook');
    view.submit();
    expect(view.props.alerts.at(-1)!.definition.delivery?.webhook).toBe('http://127.0.0.1:9000/hook');
  });
  it('refuses a webhook to another computer', () => {
    const view = ui();
    view.check('Alert webhook', true);
    view.change('Alert webhook URL', 'https://example.com/hook');
    view.submit();
    expect(view.props.alerts).toHaveLength(0);
  });
  it('a quick expiration choice turns expiration on at that offset', () => {
    const view = ui();
    view.check('Alert expiration enabled', true);
    view.callButton('1 week');
    view.submit();
    const saved = view.props.alerts.at(-1)!.definition;
    expect(saved.expiresAt).not.toBeNull();
    expect(saved.expiresAt! - saved.createdAt).toBeGreaterThan(6 * 86400);
  });
  it('presets are LV-defined offsets', () => {
    expect(ALERT_EXPIRY_PRESETS.map(row => row.label)).toEqual(['1 hour', '1 day', '1 week', '30 days', '90 days']);
    expect(alertExpiryPreset(1_000_000, 3600, 'UTC').original).toBe(1_003_600);
    expect(() => alertExpiryPreset(1, 0, 'UTC')).toThrow();
  });
});

describe('alerts panel: Expiration sort', async () => {
  const { dockVisibleAlerts, DEFAULT_DOCK_LIST_VIEW, DOCK_SORT_KEYS } = await import('../../src/ui/alerts-dock-model');
  const { saved } = await import('../helpers/alert-dialog-harness');
  const at = (id: string, expiresAt: number | null) => { const alert = saved(id); return { ...alert, definition: { ...alert.definition, expiresAt } }; };
  it('orders soonest expiration first, open-ended last in both directions', () => {
    const alerts = [at('a', null), at('b', 5000), at('c', 3000), at('d', null)];
    const ids = (direction: 'asc' | 'desc') => dockVisibleAlerts(alerts, { ...DEFAULT_DOCK_LIST_VIEW, sort: 'expires', direction }).map(alert => alert.definition.id);
    expect(ids('asc')).toEqual(['c', 'b', 'a', 'd']);
    expect(ids('desc')).toEqual(['b', 'c', 'a', 'd']);
    expect(DOCK_SORT_KEYS.some(([key, label]) => key === 'expires' && label === 'Expiration')).toBe(true);
  });
});
