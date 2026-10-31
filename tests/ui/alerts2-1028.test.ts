// Alert leftovers. Local notice wording, webhook Send test, webhooks on compound (all-conditions) and list
// alerts, Sound duration, and the alert-dialog defaults. SYNTHETIC rows only; webhook ports are injected (no network).
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { setup, invoke, input, focusDocument } from '../helpers/alert-dialog-harness';
import { alertDisplayClockActive, setAlertDisplayClock, systemAlertClock } from '../../src/ui/alert-time';
import { LOCAL_ALERT_NOTICE, type AlertEvent } from '../../src/domain/alerts';
import { ALERT_SOUND_REPEAT_SECONDS, ALERT_WEBHOOK_TEST_BODY, alertWebhookTestRequest, copyAlertDelivery, createAlertDelivery, describeAlertDelivery, planAlertDelivery, sendAlertWebhookTest, validateAlertDelivery, type AlertDeliverySettings } from '../../src/domain/alert-delivery';
import { alertSoundRepeatOffsets, createAlertSoundPlayer, type AlertAudioContextLike } from '../../src/ui/alert-sound';
import { CompoundDeliveryRuntime, compoundWebhookRequest, type CompoundDeliveryPorts } from '../../src/ui/CompoundAlertDeliveryHost';
import type { CompoundAlertBook, CompoundBookEntry, CompoundBookEvent } from '../../src/ui/compound-alert-book';
import type { CompoundJournalNode } from '../../src/ui/compound-alert-document';
import { COMPOUND_POLICY, type CompoundDefinition } from '../../src/domain/compound-alerts';
import { listAlertDelivery, listAlertFromForm, listAlertToForm, restoreListAlerts, type ListAlert, type ListAlertForm } from '../../src/domain/watchlist-alerts';
import { renderAlertMessage } from '../../src/domain/alert-message';
import { fixtureDataset } from '../../src/domain/fixtures';

const require = createRequire(import.meta.url);
const webhook = require('../../electron/alert-webhook.cjs');
const HOOK = 'http://127.0.0.1:9000/hook';
const microtasks = async () => { for (let index = 0; index < 80; index++) await Promise.resolve(); };

it('the local notice no longer says webhook delivery is missing', () => {
  expect(LOCAL_ALERT_NOTICE).toContain('Webhooks post only to this computer');
  expect(LOCAL_ALERT_NOTICE).not.toContain('webhook delivery is configured');
});

describe('webhook Send test', () => {
  it('builds a test request from the draft message, or a fixed sample when blank', () => {
    expect(alertWebhookTestRequest(HOOK, '{"side":"buy"}')).toEqual({ url: HOOK, body: '{"side":"buy"}', contentType: 'application/json', origin: 'test' });
    expect(alertWebhookTestRequest(HOOK, '  ').body).toBe(ALERT_WEBHOOK_TEST_BODY);
    expect(() => alertWebhookTestRequest('https://example.com/x', 'x')).toThrow('this computer');
    expect(webhook.alertWebhookInput({ url: HOOK, body: 'x', contentType: 'text/plain', origin: 'test' }).origin).toBe('test');
  });
  it('reports delivered with the status, the status, the error, and a missing desktop app', async () => {
    expect(await sendAlertWebhookTest({ post: async () => ({ delivered: true, status: 204, error: null }) }, HOOK, 'x')).toEqual({ delivered: true, text: 'Test delivered (HTTP 204).' });
    expect((await sendAlertWebhookTest({ post: async () => ({ delivered: false, status: 500, error: null }) }, HOOK, 'x')).text).toBe('Test failed: HTTP 500.');
    expect((await sendAlertWebhookTest({ post: async () => ({ delivered: false, status: 0, error: 'The webhook could not be reached.' }) }, HOOK, 'x')).text).toContain('could not be reached');
    expect((await sendAlertWebhookTest(null, HOOK, 'x')).text).toContain('desktop app');
    expect((await sendAlertWebhookTest({ post: vi.fn() }, 'http://10.0.0.1/', 'x')).text).toContain('Test not sent');
  });
});

describe('alert dialog: Send test and Sound duration', () => {
  const instrumentId = fixtureDataset('GME', 1).instrument.id;
  function ui(post = vi.fn(async () => ({ delivered: true, status: 200, error: null }))) {
    const view = setup([]);
    const check = (label: string, checked: boolean) => { const control = view.field(label), target = view.nodeFor(control); invoke(control.props.onChange, input(target, { target: { checked } })); view.settle(); };
    const submit = () => { const form = view.find(node => node.type === 'form'); invoke(form.props.onSubmit, { preventDefault: vi.fn() }); view.settle(); };
    const event: AlertEvent = { instrumentId, sourceId: 'close', value: 23, time: 120, availableAt: 120, sequence: 1, barId: 'SYNTHETIC bar', barClosed: false, feedState: 'ready', mode: 'ordinary', runId: 'ordinary' };
    view.props.event = event; view.props.webhookPort = { post };
    view.callButton('Create alert');
    return { ...view, check, submit, post };
  }
  it('Send test posts the draft message to the URL and shows the result', async () => {
    const view = ui();
    view.check('Alert webhook', true);
    view.change('Alert webhook URL', HOOK);
    view.change('Alert message', 'SYNTHETIC {{ticker}} test');
    view.callButton('Send test');
    await microtasks(); view.settle();
    expect(view.post).toHaveBeenCalledWith({ url: HOOK, body: 'SYNTHETIC {{ticker}} test', contentType: 'text/plain', origin: 'test' });
    expect(view.text()).toContain('Test delivered (HTTP 200).');
    expect(view.props.alerts).toHaveLength(0);
  });
  it('saves a Sound duration with the sound', () => {
    const view = ui();
    view.change('Alert sound duration', '10');
    view.submit();
    expect(view.props.alerts.at(-1)!.definition.delivery).toEqual({ schemaVersion: 1, popup: true, desktop: true, sound: 'lv-chime', soundRepeat: 10 });
  });
  it('the frequency defaults to Only once and lists the reference choices', () => {
    const view = ui();
    const select = view.field('Alert frequency');
    expect(select.props.value).toBe('only-once');
    expect(view.text()).toContain('Once per bar close');
    expect(view.text()).toContain('Once per minute');
  });
});

describe('Sound duration', () => {
  it('is an optional field that needs a sound and one of the LV choices', () => {
    expect(ALERT_SOUND_REPEAT_SECONDS).toEqual([5, 10, 30]);
    const delivery = createAlertDelivery(true, false, 'lv-bell', null, 30);
    expect(delivery).toEqual({ schemaVersion: 1, popup: true, desktop: false, sound: 'lv-bell', soundRepeat: 30 });
    expect(createAlertDelivery(true, false, null, null, 30)).toEqual({ schemaVersion: 1, popup: true, desktop: false, sound: null });
    expect(() => validateAlertDelivery({ schemaVersion: 1, popup: true, desktop: false, sound: null, soundRepeat: 5 })).toThrow('sound duration');
    expect(() => validateAlertDelivery({ ...delivery, soundRepeat: 7 })).toThrow('sound duration');
    expect(describeAlertDelivery(delivery)).toBe('Log · Popup · Sound: Bell (30 s)');
    expect(planAlertDelivery([{ notification: { id: 'n', alertId: 'a', name: 'n', message: '', value: 1, at: 1, barId: 'b', sequence: 1, mode: 'ordinary', runId: 'ordinary', local: true }, delivery }]).soundRepeat).toBe(30);
  });
  it('the player schedules the tones again for each repetition', async () => {
    expect(alertSoundRepeatOffsets('lv-chime')).toEqual([0]);
    const offsets = alertSoundRepeatOffsets('lv-chime', 5);
    expect(offsets.length).toBeGreaterThan(4); expect(offsets.at(-1)!).toBeLessThanOrEqual(5);
    const starts: number[] = [];
    const context: AlertAudioContextLike = { state: 'running', currentTime: 0, destination: {}, createOscillator: () => ({ type: '', frequency: { setValueAtTime: () => {} }, connect: () => {}, start: time => { starts.push(time); }, stop: () => {} }), createGain: () => ({ gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} }, connect: () => {} }) };
    const player = createAlertSoundPlayer(() => context, () => ({ enabled: true, level: 0.5 }));
    await player.play('lv-chime'); expect(starts).toHaveLength(2);
    starts.length = 0; await player.play('lv-chime', 5); expect(starts).toHaveLength(2 * offsets.length);
  });
});

describe('compound (all-conditions) alerts: webhook', () => {
  const definition = (): CompoundDefinition => ({ kind: 'compound', schemaVersion: 1, policy: COMPOUND_POLICY, mode: 'ordinary', id: 'compound-SYNTHETIC', name: 'SYNTHETIC both', message: '{"note":"SYNTHETIC"}', context: { instrumentId: 'SYNTHETIC GME', sourceFamily: 'SYNTHETIC family', interval: '1m', session: 'regular', basis: 'SYNTHETIC basis' }, predicates: [{ id: 'price', source: { kind: 'price', field: 'close' }, operator: { kind: 'greater', value: 125 } }, { id: 'average', source: { kind: 'indicator', indicator: 'sma', plot: 'sma', snapshotId: 'frozen SYNTHETIC', inputs: { length: 2, source: 'close' } }, operator: { kind: 'greater', value: 129 } }], frequency: 'every-time', createdAt: 0, expiresAt: null } as unknown as CompoundDefinition);
  function runtime(delivery: AlertDeliverySettings, ports: Partial<CompoundDeliveryPorts>) {
    const generation = {}, rows = [{ id: 'compound-SYNTHETIC', generation }] as unknown as CompoundBookEntry[], listeners = new Set<(event: CompoundBookEvent) => void>();
    const book = { entry: (id: string) => rows.find(row => row.id === id) ?? null, entries: () => rows, subscribe: (listener: (event: CompoundBookEvent) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } } as unknown as CompoundAlertBook;
    const notice = vi.fn(), all: CompoundDeliveryPorts = { soundPlayer: { play: vi.fn(async () => {}) }, desktopPort: null, popup: vi.fn(), notice, ...ports };
    const owner = new CompoundDeliveryRuntime(book, () => all);
    const d = definition(), node = { item: { id: 'SYNTHETIC-1', alertId: d.id, revision: 1, sequence: 1, at: 1001, barId: 'SYNTHETIC bar', values: [150, 140], local: true }, binding: { id: 'SYNTHETIC binding', revision: 1, restriction: 'restricted-live', declaration: d, provenance: { providerId: 'synthetic', datasetId: d.context.sourceFamily, revision: 'SYNTHETIC revision', resolution: '1m', basis: d.context.basis } }, delivery, previous: null, size: 1 } as unknown as CompoundJournalNode;
    for (const listener of [...listeners]) listener({ kind: 'observation', version: 1n, entry: rows[0], fresh: node } as unknown as CompoundBookEvent);
    return { owner, notice };
  }
  it('keeps the webhook and duration through the stored copy and validates them', () => {
    const delivery = createAlertDelivery(true, false, 'lv-rise', HOOK, 5);
    expect(copyAlertDelivery(delivery)).toEqual(delivery);
    expect(() => copyAlertDelivery({ ...delivery, webhook: 'https://example.com/' })).toThrow();
  });
  it('posts the compound message once per trigger and reports failures and a missing bridge', async () => {
    const post = vi.fn(async () => ({ delivered: true, status: 200, error: null }));
    const ok = runtime(createAlertDelivery(false, false, null, HOOK), { webhookPort: { post } }); await microtasks();
    expect(ok.notice.mock.calls).toEqual([]); expect(post).toHaveBeenCalledTimes(1);
    const request = (post.mock.calls[0] as unknown as [{ url: string; body: string; contentType: string; origin: string }])[0];
    expect(request).toMatchObject({ url: HOOK, contentType: 'application/json', origin: 'local' }); expect(request.body).toContain('SYNTHETIC');
    ok.owner.dispose();
    const failing = runtime(createAlertDelivery(false, false, null, HOOK), { webhookPort: { post: async () => ({ delivered: false, status: 503, error: null }) } }); await microtasks();
    expect(failing.notice.mock.calls.flat().join(' ')).toContain('HTTP 503'); failing.owner.dispose();
    const none = runtime(createAlertDelivery(false, false, null, HOOK), {}); await microtasks();
    expect(none.notice.mock.calls.flat().join(' ')).toContain('desktop app'); none.owner.dispose();
    const quiet = vi.fn(); const off = runtime(createAlertDelivery(false, false, null), { webhookPort: { post: quiet } }); await microtasks();
    expect(quiet).not.toHaveBeenCalled(); off.owner.dispose();
    expect(compoundWebhookRequest({ view: { id: 'x', title: 'SYNTHETIC Alert: a', message: 'plain', at: 1, conditions: [], desktopBody: '' }, delivery: createAlertDelivery(false, false, null, HOOK), alertId: 'a', generation: {} })?.origin).toBe('synthetic');
  });
});

describe('list (watchlist) alerts: webhook', () => {
  const form = (webhook?: string): ListAlertForm => ({ listId: 'L', name: 'SYNTHETIC list', message: 'up', kind: 'crossing-up', value: '10', lower: '', upper: '', frequency: 'only-once', session: 'regular', expires: '', ...(webhook !== undefined ? { webhook } : {}) });
  it('takes an optional loopback webhook, refuses another computer, and round-trips it', () => {
    expect(listAlertFromForm(form(), 'a', 100).webhook).toBeUndefined();
    expect(listAlertFromForm(form('  '), 'a', 100).webhook).toBeUndefined();
    const spec = listAlertFromForm(form(' ' + HOOK + ' '), 'a', 100); expect(spec.webhook).toBe(HOOK);
    expect(() => listAlertFromForm(form('https://example.com/hook'), 'a', 100)).toThrow('this computer');
    const alert: ListAlert = { schemaVersion: 1, ...spec, status: 'active', statusReason: null, members: [], history: [] };
    expect(restoreListAlerts([alert])[0].webhook).toBe(HOOK);
    expect(listAlertToForm(alert).webhook).toBe(HOOK);
    expect(() => restoreListAlerts([{ ...alert, webhook: 'http://8.8.8.8/' }])).toThrow();
    const { webhook: _drop, ...plain } = alert; expect(restoreListAlerts([plain])[0]).not.toHaveProperty('webhook');
  });
  it('its triggers carry the webhook in the LV default delivery', () => {
    expect(listAlertDelivery({ webhook: HOOK })).toEqual({ schemaVersion: 1, popup: true, desktop: true, sound: 'lv-chime', webhook: HOOK });
    expect(listAlertDelivery(undefined)).toEqual({ schemaVersion: 1, popup: true, desktop: true, sound: 'lv-chime' });
  });
});

it('message placeholders render with the trigger values', () => {
  const text = renderAlertMessage('{{ticker}} {{interval}} {{close}} {{time}} {{plot_0}}', { ticker: 'GME', exchange: 'NYSE', interval: '1D', bar: { time: 86400, open: 1, high: 3, low: 1, close: 2.5 }, triggeredAt: 86460, plots: [{ title: 'SMA', value: 2.25 }] as never });
  expect(text).toBe('GME 1D 2.5 1970-01-02T00:00:00Z 2.25');
});

describe('FLOWS-AUDIT4-1028: create focus, close label, plain copy, chart timezone', () => {
  const instrumentId = fixtureDataset('GME', 1).instrument.id;
  it('a new alert focuses its first field and the X reads Close', () => {
    vi.useFakeTimers();
    try {
      // Opened from outside the dialog (toolbar Alert): createRequest, focus on the close button as the audit observed.
      const view = setup([]);
      view.props.event = { instrumentId, sourceId: 'close', value: 23, time: 120, availableAt: 120, sequence: 1, barId: 'SYNTHETIC bar', barClosed: false, feedState: 'ready', mode: 'ordinary', runId: 'ordinary' };
      view.props.createRequest = {}; view.settle(); vi.runAllTimers(); view.settle();
      const active = focusDocument.activeElement;
      expect(active?.tag === 'input' || active?.tag === 'select').toBe(true);
      expect(active?.props.type).not.toBe('checkbox');
      expect(view.find(node => node.props['aria-label'] === 'Close')).toBeTruthy();
      expect(view.text()).not.toContain('skipped by a clock change');
      expect(view.text()).toContain('About placeholders');
    } finally { vi.useRealTimers(); }
  });
  it('the manager keeps Close alerts', () => {
    const view = setup([]);
    expect(view.find(node => node.props['aria-label'] === 'Close alerts')).toBeTruthy();
  });
  it('the display clock follows the chart timezone when App sets it, and returns to the OS zone', () => {
    try {
      setAlertDisplayClock({ zone: 'America/Phoenix', hours: '12' });
      expect(systemAlertClock()).toEqual({ zone: 'America/Phoenix', hours: '12' }); expect(alertDisplayClockActive()).toBe(true);
      setAlertDisplayClock({ zone: 'Not/AZone' }); expect(alertDisplayClockActive()).toBe(false);
    } finally { setAlertDisplayClock(null); }
    expect(alertDisplayClockActive()).toBe(false);
  });
});
