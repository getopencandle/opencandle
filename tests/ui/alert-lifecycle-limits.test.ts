import { expect, it, vi } from 'vitest';
import { all, invoke, notice, saved, setup, text } from '../helpers/alert-dialog-harness';
import { LOCAL_ALERT_NOTICE, advanceLocalAlertClock, createLocalAlert, editLocalAlert, processLocalAlertBatch, type AlertDefinition, type AlertEvent, type LocalAlert } from '../../src/domain/alerts';
import { alertObservationContext, createAlertObservationSession, observeAlertSnapshot, type AlertObservationSession } from '../../src/domain/alert-observation';
import { fixtureDataset } from '../../src/domain/fixtures';
import type { BarDataset } from '../../src/domain/types';

// Literal model checks plus actual AlertDialog handlers under the shared
// controlled hook/node model. No packaged GUI, OS sleep or reference claim.
const submit = (ui: ReturnType<typeof setup>) => { const form = ui.find(node => node.type === 'form'); invoke(form.props.onSubmit, { preventDefault: vi.fn() }); ui.settle(); };

it('ALERT.MANAGE.EDIT: a draft survives concurrent trigger history, but a concurrent definition edit refuses the stale draft', () => {
  const ui = setup();
  ui.rowButton('a', 'Edit'); ui.change('Alert name', 'SYNTHETIC a edited');
  // A trigger is recorded while the draft is open: history grows, revision is unchanged.
  const a = ui.props.alerts[0], triggered: LocalAlert = { ...a, lastSequence: 12, lastTime: 130, lastTriggeredAt: 130, lastTriggeredBar: 'SYNTHETIC bar 12', history: [...a.history, notice('a', 12, 130)] };
  ui.props.alerts = [triggered, ...ui.props.alerts.slice(1)]; ui.settle();
  submit(ui);
  const edited = ui.props.alerts[0];
  expect(edited.definition.name).toBe('SYNTHETIC a edited'); expect(edited.revision).toBe(2);
  expect(edited.history.map(item => item.id)).toEqual(triggered.history.map(item => item.id));
  expect(edited.lastValue).toBeNull(); expect(edited.closedBars).toEqual([]);
  // A second editor changes b's definition first (revision 2); the older draft cannot overwrite it.
  ui.rowButton('b', 'Edit'); ui.change('Alert name', 'SYNTHETIC stale draft');
  const elsewhere = editLocalAlert(ui.props.alerts[1], { name: 'SYNTHETIC b elsewhere' }, 125);
  const base = [ui.props.alerts[0], elsewhere, ui.props.alerts[2]]; ui.props.alerts = base; ui.settle();
  const calls = ui.publish.mock.calls.length; submit(ui);
  expect(ui.publish.mock.calls.length).toBe(calls); expect(ui.props.alerts).toBe(base);
  expect(ui.text()).toContain('This alert was removed or its settings changed. Reopen the edit or confirmation.');
  expect(ui.props.alerts[1].definition.name).toBe('SYNTHETIC b elsewhere');
});

const day = Date.UTC(2024, 0, 2) / 1000, now = Date.UTC(2026, 9, 14, 10) / 1000;
function dataset(closes: number[]): BarDataset {
  const data = fixtureDataset('GME', closes.length);
  data.bars = closes.map((close, i) => ({ time: day + i * 86400, open: close, high: close + 1, low: close - 1, close, volume: 100 + i }));
  data.provenance.fixture = false; data.provenance.providerId = 'user-import'; data.provenance.datasetId = 'original-file'; data.provenance.revision = 'r1';
  return data;
}
function bound(state: AlertObservationSession, data: BarDataset, id: string, condition: AlertDefinition['condition']): LocalAlert {
  const context = alertObservationContext(state, data);
  return createLocalAlert({ id, name: `SYNTHETIC ${id}`, message: '', instrumentId: context.instrumentId, sourceId: context.sourceId, mode: context.mode, runId: context.runId, observationBinding: context.binding, frequency: 'every-time', condition, createdAt: now, expiresAt: null });
}

it('ALERT.SLEEP: nothing triggers while OpenCandle is not observing, and a resumed observation never fabricates the missed crossing', () => {
  const below = dataset([9]); let state = createAlertObservationSession(below, { sessionId: 'SYNTHETIC sleep', mode: 'ordinary', startedAt: now });
  let alerts = [bound(state, below, 'cross', { kind: 'crossing-up', value: 10 })];
  const first = observeAlertSnapshot(state, { dataset: below, observedAt: now }); state = first.session;
  alerts = processLocalAlertBatch(alerts, [first.event as AlertEvent], now).alerts;
  expect(alerts[0].lastValue).toBe(9);
  // App closed or asleep: no observations. Only the clock advances; no history appears.
  expect(processLocalAlertBatch(alerts, [], now + 3600).alerts[0].history).toEqual([]);
  // Price moved 9 -> 11 while unobserved. The resumed observation is a gap (61 s > 60 s default).
  const above = dataset([9, 11]);
  const resumed = observeAlertSnapshot(state, { dataset: above, observedAt: now + 61 });
  expect(resumed.event?.observation?.continuity).toBe('gap');
  const result = processLocalAlertBatch(alerts, [resumed.event as AlertEvent], now + 61);
  expect(result.alerts[0].history).toEqual([]); expect(result.alerts[0].missedDataGaps).toBe(1);
  expect(result.diagnostics).toContain('Data gap observed. No missed ticks were reconstructed.');
  // The local notice is shown in the manager.
  const ui = setup(); expect(ui.text()).toContain('Alerts run while OpenCandle is open.');
  // Reworded once the LV-local webhook (loopback URLs only) shipped; still no hosted delivery.
  expect(LOCAL_ALERT_NOTICE).toBe('Alerts run locally while OpenCandle receives usable data. Closing the app, sleep or disconnection can miss triggers. No server, email or SMS delivery is configured. Webhooks post only to this computer (localhost).');
});

it('ALERT.REPLAY: replay observations never trigger ordinary alerts and ordinary observations never trigger replay alerts', () => {
  const data = dataset([9, 11, 12]);
  const ordinarySession = createAlertObservationSession(data, { sessionId: 'SYNTHETIC live', mode: 'ordinary', startedAt: now });
  const replaySession = createAlertObservationSession(data, { sessionId: 'SYNTHETIC replay', mode: 'replay', replayRunId: 'SYNTHETIC run', startedAt: now });
  const ordinary = bound(ordinarySession, data, 'ordinary', { kind: 'greater', value: 10 }), replay = bound(replaySession, data, 'replay', { kind: 'greater', value: 10 });
  const replayEvent = observeAlertSnapshot(replaySession, { dataset: data, observedAt: now + 1, barIndex: 1, replayRunId: 'SYNTHETIC run' }).event as AlertEvent;
  const ordinaryEvent = observeAlertSnapshot(ordinarySession, { dataset: data, observedAt: now + 1 }).event as AlertEvent;
  expect(replayEvent.value).toBe(11); expect(replayEvent.mode).toBe('replay'); expect(ordinaryEvent.value).toBe(12);
  const replayOnly = processLocalAlertBatch([ordinary, replay], [replayEvent], now + 1);
  expect(replayOnly.alerts[0].history).toEqual([]);
  expect(replayOnly.alerts[1].history.map(item => [item.value, item.mode, item.runId])).toEqual([[11, 'replay', 'replay:snapshot:SYNTHETIC replay']]);
  const ordinaryOnly = processLocalAlertBatch([ordinary, replay], [ordinaryEvent], now + 1);
  expect(ordinaryOnly.alerts[1].history).toEqual([]);
  expect(ordinaryOnly.alerts[0].history.map(item => [item.value, item.mode])).toEqual([[12, 'ordinary']]);
  expect(ordinaryOnly.diagnostics).toContain('Alert event belongs to a different ordinary or replay run.');
  expect(advanceLocalAlertClock(replayOnly.alerts[0], now + 2).history).toEqual([]);
});

it('ALERT.SNAPSHOT: editing keeps the captured source; source and price controls are locked while editing', () => {
  const ui = setup([saved('a')]);
  ui.props.sourceChoices = [{ id: 'price:close:chart', label: 'SYNTHETIC Close', source: null }]; ui.props.selectedSourceId = 'price:close:chart'; ui.props.onSourceChange = vi.fn(); ui.props.onTargetChange = vi.fn(); ui.props.onPriceSourceChange = vi.fn(); ui.settle();
  expect(ui.field('Technical alert source').props.disabled).toBe(false);
  ui.rowButton('a', 'Edit');
  expect(ui.field('Technical alert source').props.disabled).toBe(true);
  expect(ui.field('Technical alert target').props.disabled).toBe(true);
  expect(ui.field('Alert price source').props.disabled).toBe(true);
  const before = ui.props.alerts[0].definition;
  ui.change('Alert level', '25'); submit(ui);
  const after = ui.props.alerts[0].definition;
  expect(after.condition).toEqual({ kind: 'greater', value: 25 });
  // Only the condition changed; the edit also records the legacy popup-only delivery explicitly.
  const { delivery, ...rest } = after;
  expect({ ...rest, condition: before.condition }).toEqual(before); expect(delivery).toEqual({ schemaVersion: 1, popup: true, desktop: false, sound: null });
  expect(after.sourceId).toBe(before.sourceId); expect(after.instrumentId).toBe(before.instrumentId); expect(after.runId).toBe(before.runId);
});
