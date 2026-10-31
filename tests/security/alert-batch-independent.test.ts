import { expect, it, vi } from 'vitest';
import { applyAlertBatch, prepareAlertBatch } from '../../src/domain/alert-batch-actions';
import { createLocalAlert, validateLocalAlerts, type AlertNotification, type LocalAlert } from '../../src/domain/alerts';

// Small synthetic saved-state literals; no publisher, observer, DOM or UI authority.
// Expected transitions below do not call the production pause/resume transformer.
function notice(id: string, sequence: number, at: number): AlertNotification {
  return { id: `SYNTHETIC ${id} notification ${sequence}`, alertId: id,
    name: 'SYNTHETIC recorded name', message: 'SYNTHETIC recorded message',
    value: 23, at, sequence, barId: `SYNTHETIC bar ${sequence}`,
    mode: 'ordinary', runId: 'ordinary', local: true };
}
function saved(id: string, status: LocalAlert['status'] = 'active', expiresAt: number | null = null): LocalAlert {
  const row = createLocalAlert({ id, name: `SYNTHETIC ${id}`, message: 'SYNTHETIC saved definition',
    instrumentId: 'SYNTHETIC instrument', sourceId: 'close', frequency: 'every-time',
    createdAt: 100, expiresAt, mode: 'ordinary', runId: 'ordinary', condition: { kind: 'greater', value: 20 } });
  return { ...row, status, lastSequence: 9, lastTime: 119, lastValue: status === 'waiting-for-data' ? null : 42,
    previousClosedValue: status === 'waiting-for-data' ? null : 31,
    currentBarId: status === 'waiting-for-data' ? null : 'SYNTHETIC current',
    closedBars: status === 'waiting-for-data' ? [] : [{ id: 'SYNTHETIC completed', value: 31 }],
    lastTriggeredAt: 119, lastTriggeredBar: 'SYNTHETIC bar 9',
    history: [notice(id, 3, 110), notice(id, 9, 119)] };
}
function advanced(row: LocalAlert): LocalAlert {
  return { ...structuredClone(row), lastTime: 130, lastSequence: 10, lastValue: 55,
    lastTriggeredAt: 130, lastTriggeredBar: 'SYNTHETIC bar 10',
    history: [...structuredClone(row.history), notice(row.definition.id, 10, 130)] };
}

it('admits the independent literals and pauses exactly the eligible mixed targets', () => {
  const base = [saved('hidden'), saved('a'), saved('w', 'waiting-for-data'), saved('p', 'paused'), saved('s', 'stopped'), saved('e', 'expired', 118)];
  expect(validateLocalAlerts(base).ok).toBe(true);
  const before = structuredClone(base), plan = prepareAlertBatch(base, ['e', 'w', 'p', 'a', 's'], 'pause', 120);
  const result = applyAlertBatch(plan, base, 120);
  expect(result.eligibleIds).toEqual(['w', 'a']);
  expect(result.unchanged).toEqual([{ id: 'e', reason: 'expired' }, { id: 'p', reason: 'already-paused' }, { id: 's', reason: 'stopped' }]);
  expect(result.candidate.map(row => [row.definition.id, row.status])).toEqual([
    ['hidden', 'active'], ['a', 'paused'], ['w', 'paused'], ['p', 'paused'], ['s', 'stopped'], ['e', 'expired']]);
  for (const index of [1, 2]) expect(result.candidate[index]).toStrictEqual({ ...base[index], status: 'paused',
    lastValue: null, previousClosedValue: null, currentBarId: null, closedBars: [] });
  for (const index of [0, 3, 4, 5]) expect(result.candidate[index]).toBe(base[index]);
  expect(result.base).toBe(base); expect(base).toStrictEqual(before);
});

it('resumes only not-due paused rows without restarting stopped or expired lifecycles', () => {
  const base = [saved('p', 'paused', 121), saved('due', 'paused', 120), saved('a'), saved('w', 'waiting-for-data'), saved('s', 'stopped'), saved('e', 'expired', 118)];
  const result = applyAlertBatch(prepareAlertBatch(base, base.map(row => row.definition.id), 'resume', 120), base, 120);
  expect(result.eligibleIds).toEqual(['p']);
  expect(result.candidate[0]).toStrictEqual({ ...base[0], status: 'active', lastValue: null,
    previousClosedValue: null, currentBarId: null, closedBars: [] });
  expect(result.unchanged.map(row => row.reason)).toEqual(['expiration-due', 'already-active', 'waiting-for-data', 'stopped', 'expired']);
  for (let index = 1; index < base.length; index++) expect(result.candidate[index]).toBe(base[index]);
});

it.each(['pause', 'resume'] as const)('uses latest legitimate history and sequence for %s without changing definition identity', action => {
  const base = [saved('target', action === 'resume' ? 'paused' : 'active'), saved('hidden')];
  const plan = prepareAlertBatch(base, ['target'], action, 120), latest = [advanced(base[0]), base[1]], before = structuredClone(latest);
  const result = applyAlertBatch(plan, latest, 130), target = result.candidate[0];
  expect(target.history.map(item => [item.id, item.sequence, item.at])).toEqual([
    ['SYNTHETIC target notification 3', 3, 110], ['SYNTHETIC target notification 9', 9, 119], ['SYNTHETIC target notification 10', 10, 130]]);
  expect([target.lastSequence, target.lastTime, target.revision, target.armedAt]).toEqual([10, 130, 1, 100]);
  expect(target.definition).toStrictEqual(base[0].definition); expect(target.lastTriggeredAt).toBe(130);
  expect(result.base).toBe(latest); expect(result.candidate[1]).toBe(latest[1]); expect(latest).toStrictEqual(before);
});

it('follows latest saved order rather than selection or preparation order', () => {
  const base = [saved('z'), saved('a'), saved('m')], plan = prepareAlertBatch(base, ['a', 'z'], 'pause', 120);
  const latest = [base[2], base[0], base[1]], result = applyAlertBatch(plan, latest, 120);
  expect(result.candidate.map(row => row.definition.id)).toEqual(['m', 'z', 'a']);
  expect(result.candidate[0]).toBe(base[2]); expect(result.base).toBe(latest);
});

it('returns exact latest for no eligible rows and empty selections without resetting baselines', () => {
  const base = [saved('p', 'paused'), saved('s', 'stopped')];
  const plan = prepareAlertBatch(base, ['p', 's'], 'pause', 120), latest = structuredClone(base);
  for (const current of [plan, prepareAlertBatch(base, [], 'delete', 120)]) {
    const result = applyAlertBatch(current, latest, 120);
    expect(result.changed).toBe(false); expect(result.candidate).toBe(latest); expect(result.base).toBe(latest);
    expect(latest[0].lastValue).toBe(42); expect(latest[0].closedBars).toEqual([{ id: 'SYNTHETIC completed', value: 31 }]);
  }
});

it('canonicalizes nested key order while preserving unknown metadata and signed zero', () => {
  const row = saved('target'); Object.assign(row.definition, { future: { z: [null, -0, { b: true, a: 'SYNTHETIC retained' }], a: 7 } });
  const plan = prepareAlertBatch([row], ['target'], 'pause', 120), copy = structuredClone(row);
  const { future, ...definition } = copy.definition as typeof copy.definition & { future: unknown };
  void future;
  // These same plain definition entries retain every key/value; only insertion order changes.
  // fromEntries erases that known shape, so restore this fixture's type at this boundary.
  copy.definition = Object.fromEntries(Object.entries(definition).reverse()) as unknown as typeof copy.definition;
  Object.assign(copy.definition, { future: { a: 7, z: [null, -0, { a: 'SYNTHETIC retained', b: true }] } });
  const target = applyAlertBatch(plan, [copy], 120).candidate[0];
  expect(target.definition).toStrictEqual(copy.definition);
  expect(Object.is((target.definition as typeof target.definition & { future: { z: unknown[] } }).future.z[1], -0)).toBe(true);
});

it.each(['message', 'sourceId', 'mode/run', 'condition', 'unknown', 'armedAt'] as const)('refuses same-ID/revision replacement of %s', change => {
  const base = [saved('target')], plan = prepareAlertBatch(base, ['target'], 'pause', 120), latest = structuredClone(base);
  if (change === 'message') latest[0].definition.message = 'SYNTHETIC changed';
  else if (change === 'sourceId') latest[0].definition.sourceId = 'open';
  else if (change === 'mode/run') {
    latest[0].definition.mode = 'replay'; latest[0].definition.runId = 'SYNTHETIC replay';
    for (const item of latest[0].history) { item.mode = 'replay'; item.runId = 'SYNTHETIC replay'; }
  }
  else if (change === 'condition') latest[0].definition.condition.value = 21;
  else if (change === 'unknown') Object.assign(latest[0].definition, { future: { retained: 'SYNTHETIC changed' } });
  else latest[0].armedAt++;
  expect(validateLocalAlerts(latest).ok).toBe(true);
  const before = structuredClone(latest);
  expect(() => applyAlertBatch(plan, latest, 120)).toThrow(/prepared alert batch changed/); expect(latest).toStrictEqual(before);
});

it('detaches the prepared definition and distinguishes negative zero from positive zero', () => {
  const row = saved('target'); Object.assign(row.definition, { future: { offset: -0 } });
  const plan = prepareAlertBatch([row], ['target'], 'pause', 120);
  (row.definition as typeof row.definition & { future: { offset: number } }).future.offset = 0;
  expect(() => applyAlertBatch(plan, [row], 120)).toThrow(/prepared alert batch changed/);
});

it('checks the final target before any domain transform or validation clone', () => {
  const base = [saved('first'), saved('last')], plan = prepareAlertBatch(base, ['first', 'last'], 'pause', 120);
  const latest = structuredClone(base); latest[1].definition.message = 'SYNTHETIC replaced last target';
  const before = structuredClone(latest), clone = vi.spyOn(globalThis, 'structuredClone');
  try { expect(() => applyAlertBatch(plan, latest, 120)).toThrow(/prepared alert batch changed/); expect(clone).not.toHaveBeenCalled(); }
  finally { clone.mockRestore(); }
  expect(latest).toStrictEqual(before);
});

it('refuses a whole prepared resume at the exact expiry boundary', () => {
  const base = [saved('long', 'paused', 150), saved('edge', 'paused', 121)], plan = prepareAlertBatch(base, ['long', 'edge'], 'resume', 120);
  expect(() => applyAlertBatch(plan, base, 121)).toThrow(/prepared alert batch changed/);
  expect(base.map(row => row.status)).toEqual(['paused', 'paused']);
});

it('refuses resume time rollback and latest observations ahead of the injected clock', () => {
  const base = [saved('p', 'paused')], plan = prepareAlertBatch(base, ['p'], 'resume', 120);
  expect(() => prepareAlertBatch(base, ['p'], 'resume', 118)).toThrow(/clock/);
  expect(() => applyAlertBatch(plan, base, 119)).toThrow(/clock/);
  expect(() => applyAlertBatch(plan, [advanced(base[0])], 129)).toThrow(/clock/);
  expect(applyAlertBatch(plan, [advanced(base[0])], 130).candidate[0].status).toBe('active');
});

it.each(['pause', 'delete'] as const)('%s does not borrow resume clock-floor restrictions', action => {
  const base = [saved('target')], plan = prepareAlertBatch(base, ['target'], action, 120);
  expect(applyAlertBatch(plan, base, 0).changed).toBe(true);
});

it('deletes all selected statuses and their histories in one candidate, preserving hidden row references', () => {
  const base = [saved('keep-a'), saved('remove', 'stopped'), saved('keep-b'), saved('remove-expired', 'expired', 118)];
  const plan = prepareAlertBatch(base, ['remove-expired', 'remove'], 'delete', 120), result = applyAlertBatch(plan, base, 120);
  expect(plan.removedHistoryCount).toBe(4); expect(result.removedHistoryCount).toBe(4);
  expect(result.candidate.map(row => row.definition.id)).toEqual(['keep-a', 'keep-b']);
  expect(result.candidate[0]).toBe(base[0]); expect(result.candidate[1]).toBe(base[2]);
  expect(base).toHaveLength(4); expect(base[1].history).toHaveLength(2);
});

it.each(['id', 'at', 'sequence', 'order'] as const)('refreshes delete consent for same-count history %s changes', change => {
  const base = [saved('target')], plan = prepareAlertBatch(base, ['target'], 'delete', 120), latest = structuredClone(base);
  if (change === 'id') latest[0].history[0].id = 'SYNTHETIC corrected identity';
  else if (change === 'at') latest[0].history[0].at = 111;
  else if (change === 'sequence') latest[0].history[0].sequence = 4;
  else latest[0].history.reverse(); // Deliberately invalid order: fail before deletion, not an admitted-input claim.
  expect(latest[0].history).toHaveLength(2);
  expect(() => applyAlertBatch(plan, latest, 120)).toThrow(/history changed/); expect(latest).toHaveLength(1);
});

it('does not treat nonidentity recorded text correction as new delete consent', () => {
  const base = [saved('target')], plan = prepareAlertBatch(base, ['target'], 'delete', 120), latest = structuredClone(base);
  latest[0].history[0].message = 'SYNTHETIC corrected recorded message';
  expect(applyAlertBatch(plan, latest, 120).candidate).toEqual([]);
});

it('keeps plan summaries immutable, rejects copies and does not pretend reusable plans are UI tokens', () => {
  const base = [saved('a'), saved('p', 'paused')], ids = ['a', 'p'], plan = prepareAlertBatch(base, ids, 'pause', 120);
  ids.reverse(); expect(plan.selectedIds).toEqual(['a', 'p']);
  for (const value of [plan, plan.selectedIds, plan.eligibleIds, plan.unchanged, plan.unchanged[0]]) expect(Object.isFrozen(value)).toBe(true);
  expect(() => applyAlertBatch({ ...plan }, base, 120)).toThrow(/Unknown alert batch plan/);
  const first = applyAlertBatch(plan, base, 120), second = applyAlertBatch(plan, base, 120);
  expect(first.candidate).toStrictEqual(second.candidate); expect(first.base).toBe(base); expect(second.base).toBe(base);
});

it('refuses missing and duplicate selected identities without mutating the collection', () => {
  const base = [saved('target')], plan = prepareAlertBatch(base, ['target'], 'delete', 120), before = structuredClone(base);
  expect(() => prepareAlertBatch(base, ['target', 'target'], 'delete', 120)).toThrow(/Duplicate selected/);
  expect(() => prepareAlertBatch(base, ['absent'], 'pause', 120)).toThrow(/no longer exists/);
  expect(() => applyAlertBatch(plan, [], 120)).toThrow(/no longer exists/); expect(base).toStrictEqual(before);
});

it('withholds the entire changed candidate when whole-collection validation fails', () => {
  const base = [saved('target'), saved('hidden')], plan = prepareAlertBatch(base, ['target'], 'pause', 120), latest = structuredClone(base);
  latest[1].lastValue = Infinity; // Lost upstream admission, testing only the final existing guard.
  expect(() => applyAlertBatch(plan, latest, 120)).toThrow(/nonfinite/);
  expect(latest[0].status).toBe('active'); expect(latest[1].lastValue).toBe(Infinity);
});
