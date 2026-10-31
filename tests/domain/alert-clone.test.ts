import { expect, it } from 'vitest';
import { applyAlertBatch, assertAlertBatchCurrent, prepareAlertBatch } from '../../src/domain/alert-batch-actions';
import { cloneLocalAlert, createLocalAlert, editLocalAlert, processAlertEvent, validateLocalAlerts, type AlertDefinition, type LocalAlert } from '../../src/domain/alerts';
import { createAlertDelivery } from '../../src/domain/alert-delivery';
import { alertObservationContext, createAlertObservationSession } from '../../src/domain/alert-observation';
import { fixtureDataset } from '../../src/domain/fixtures';

// SYNTHETIC fixtures; LV clone policy model checks. No GUI or reference claim.
const definition = (id: string, extra: Partial<AlertDefinition> = {}): AlertDefinition => ({ id, instrumentId: 'SYNTHETIC:GME', sourceId: 'close', name: `SYNTHETIC ${id}`, message: `SYNTHETIC ${id} message`, condition: { kind: 'crossing', value: 10 }, frequency: 'once-per-bar', createdAt: 100, expiresAt: null, mode: 'ordinary', runId: 'ordinary', ...extra });
function triggered(id: string, extra: Partial<AlertDefinition> = {}): LocalAlert {
  let alert = createLocalAlert(definition(id, extra));
  for (const [sequence, value] of [[1, 9], [2, 11]] as const) { const d = alert.definition; alert = processAlertEvent(alert, { instrumentId: d.instrumentId, sourceId: d.sourceId, value, time: 100 + sequence, availableAt: 100 + sequence, sequence, barId: `SYNTHETIC ${sequence}`, barClosed: true, feedState: 'ready', mode: d.mode, runId: d.runId }).alert; }
  expect(alert.history).toHaveLength(1); return alert;
}
const ids = (...values: string[]) => { const queue = [...values]; return () => { if (!queue.length) throw new Error('SYNTHETIC id source exhausted'); return queue.shift()!; }; };

it('copies the saved definition under a new identity with a fresh lifecycle and no copied trigger state', () => {
  const dataset = fixtureDataset('GME', 5), context = alertObservationContext(createAlertObservationSession(dataset, { version: 2, chartId: 'SYNTHETIC chart', sessionId: 'SYNTHETIC session', mode: 'ordinary', startedAt: 100 }), dataset);
  const fresh = createLocalAlert(definition('orig', { instrumentId: context.instrumentId, sourceId: context.sourceId, runId: context.runId, observationBinding: context.binding, conditionVersion: 2, expiresAt: 5000, delivery: createAlertDelivery(false, true, 'lv-bell') }));
  // Lifecycle state that must not be copied (a literal stand-in for prior observations).
  const original: LocalAlert = { ...fresh, revision: 4, armedAt: 150, missedDataGaps: 3, lastSequence: 7, lastTime: 160, lastValue: 11, closedBars: [{ id: 'SYNTHETIC 6', value: 9 }], currentBarId: 'SYNTHETIC 7', previousClosedValue: 9, lastTriggeredBar: 'SYNTHETIC 7', lastTriggeredAt: 160, history: [{ ...triggered('h').history[0], alertId: 'orig' }] };
  const paused = { ...original, status: 'paused' as const };
  const before = structuredClone(paused);
  const copy = cloneLocalAlert(paused, 'copy-1', 300);
  expect(copy.definition).toEqual({ ...original.definition, id: 'copy-1', createdAt: 300 });
  expect(copy.definition.observationBinding).toEqual(context.binding); expect(copy.definition.observationBinding).not.toBe(original.definition.observationBinding);
  expect(copy).toMatchObject({ revision: 1, armedAt: 300, status: 'active', lastSequence: null, lastTime: null, lastValue: null, closedBars: [], currentBarId: null, previousClosedValue: null, lastTriggeredBar: null, lastTriggeredAt: null, missedDataGaps: 0, history: [] });
  expect(paused).toEqual(before);
  expect(() => cloneLocalAlert(original, 'orig', 300)).toThrow('A cloned alert requires a new identity.');
  expect(() => cloneLocalAlert(original, '', 300)).toThrow('A cloned alert requires a new identity.');
  expect(() => cloneLocalAlert(original, 'copy', 5000)).toThrow(/expired alert cannot be cloned/);
  expect(() => cloneLocalAlert({ ...original, status: 'expired' }, 'copy', 300)).toThrow(/expired alert cannot be cloned/);
  expect(() => cloneLocalAlert(original, 'copy', -1)).toThrow('Invalid alert clone time.');
  // A stopped (already triggered once) alert can be copied into a new active lifecycle.
  expect(cloneLocalAlert({ ...original, status: 'stopped' }, 'copy-2', 300).status).toBe('active');
});

it('plans and applies one atomic clone batch appended in selected order, keeping originals and mixed sources exact', () => {
  const replay = triggered('replay', { mode: 'replay', runId: 'replay:SYNTHETIC run' });
  const base = [triggered('a'), triggered('b', { expiresAt: 400 }), { ...triggered('c'), status: 'expired' as const }, replay];
  const plan = prepareAlertBatch(base, ['replay', 'a', 'b', 'c'], 'clone', 400);
  expect(plan.eligibleIds).toEqual(['replay', 'a']);
  expect(plan.unchanged).toEqual([{ id: 'b', reason: 'expiration-due' }, { id: 'c', reason: 'expired' }]);
  expect(plan.removedHistoryCount).toBe(0);
  const result = applyAlertBatch(plan, base, 400, ids('new-replay', 'new-a'));
  expect(result.createdIds).toEqual(['new-replay', 'new-a']);
  expect(result.candidate.slice(0, 4).every((row, index) => row === base[index])).toBe(true);
  expect(result.candidate.slice(4).map(row => [row.definition.id, row.definition.mode, row.definition.runId, row.history.length, row.definition.createdAt])).toEqual([['new-replay', 'replay', 'replay:SYNTHETIC run', 0, 400], ['new-a', 'ordinary', 'ordinary', 0, 400]]);
  expect(validateLocalAlerts(result.candidate as LocalAlert[]).ok).toBe(true);
  // Notification identities are never shared: the copy's next trigger gets its own ID.
  const copy = result.candidate[5], d = copy.definition;
  const fired = processAlertEvent(processAlertEvent(copy, { instrumentId: d.instrumentId, sourceId: d.sourceId, value: 9, time: 401, availableAt: 401, sequence: 3, barId: 'SYNTHETIC 3', barClosed: true, feedState: 'ready', mode: 'ordinary', runId: 'ordinary' }).alert, { instrumentId: d.instrumentId, sourceId: d.sourceId, value: 11, time: 402, availableAt: 402, sequence: 4, barId: 'SYNTHETIC 4', barClosed: true, feedState: 'ready', mode: 'ordinary', runId: 'ordinary' });
  expect(fired.notification?.id).toBe('new-a:ordinary:revision-1:4'); expect(base[0].history[0].id).not.toBe(fired.notification?.id);
});

it('refuses the whole batch on identity collision, missing identity source, stale targets or capacity', () => {
  const base = [triggered('a'), triggered('b')];
  const plan = prepareAlertBatch(base, ['a', 'b'], 'clone', 200);
  expect(() => applyAlertBatch(plan, base, 200)).toThrow('Cloning requires a new alert identity source.');
  expect(() => applyAlertBatch(plan, base, 200, ids('fresh', 'b'))).toThrow(/collided with an existing alert/);
  expect(() => applyAlertBatch(plan, base, 200, ids('same', 'same'))).toThrow(/collided/);
  expect(() => applyAlertBatch(plan, base, 200, ids('fresh', ''))).toThrow('Invalid alert batch identity.');
  expect(() => applyAlertBatch(plan, base, 199, ids('x', 'y'))).toThrow('The local evaluation clock moved backward after preparation.');
  const edited = [editLocalAlert(base[0], { name: 'SYNTHETIC renamed' }, 150), base[1]];
  expect(() => assertAlertBatchCurrent(plan, edited, 200)).toThrow('The prepared alert batch changed. Refresh its preview.');
  expect(() => applyAlertBatch(plan, [base[1]], 200, ids('x'))).toThrow('A selected alert no longer exists.');
  const none = prepareAlertBatch([{ ...base[0], status: 'expired' }], ['a'], 'clone', 200);
  const unchanged = applyAlertBatch(none, [{ ...base[0], status: 'expired' }], 200, ids());
  expect(unchanged.changed).toBe(false); expect(unchanged.createdIds).toEqual([]);
  const full = Array.from({ length: 9999 }, (_, index) => createLocalAlert(definition(`bulk-${index}`)));
  expect(() => prepareAlertBatch(full, ['bulk-0', 'bulk-1'], 'clone', 200)).toThrow('Cloning 2 alerts would exceed the 10000 local alert limit. No copies were prepared.');
  expect(prepareAlertBatch(full, ['bulk-0'], 'clone', 200).eligibleIds).toEqual(['bulk-0']);
});
