import { expect, it } from 'vitest';
import { applyAlertBatch, prepareAlertBatch } from '../../src/domain/alert-batch-actions';
import { createLocalAlert, processAlertEvent, type LocalAlert } from '../../src/domain/alerts';

const created = 1000, now = 1020;
function saved(id: string, status: LocalAlert['status'] = 'active', expiresAt: number | null = null): LocalAlert {
  const initial = createLocalAlert({ id, name: 'SYNTHETIC ' + id, message: 'SYNTHETIC batch fixture', instrumentId: 'SYNTHETIC instrument', sourceId: 'close', mode: 'ordinary', runId: 'ordinary', createdAt: created, expiresAt, condition: { kind: 'greater', value: 10 }, frequency: 'every-time' });
  const observed = append(initial, 1); observed.status = status;
  if (status === 'waiting-for-data') { observed.lastValue = null; observed.previousClosedValue = null; observed.currentBarId = null; observed.closedBars = []; }
  return observed;
}
function append(row: LocalAlert, sequence: number): LocalAlert {
  return processAlertEvent(row, { instrumentId: row.definition.instrumentId, sourceId: 'close', mode: row.definition.mode, runId: row.definition.runId, value: 11 + sequence, time: 1009 + sequence, availableAt: 1009 + sequence, sequence, barId: 'SYNTHETIC bar ' + sequence, barClosed: false, feedState: 'ready' }).alert;
}

it('pauses only active/waiting targets atomically in original order, preserving untouched references', () => {
  const base = [saved('hidden'), saved('active'), saved('waiting', 'waiting-for-data'), saved('paused', 'paused'), saved('stopped', 'stopped'), saved('expired', 'expired', 1015)], before = structuredClone(base);
  const plan = prepareAlertBatch(base, ['expired', 'paused', 'waiting', 'stopped', 'active'], 'pause', now);
  expect(plan.eligibleIds).toEqual(['waiting', 'active']);
  expect(plan.unchanged).toEqual([{ id: 'expired', reason: 'expired' }, { id: 'paused', reason: 'already-paused' }, { id: 'stopped', reason: 'stopped' }]);
  const result = applyAlertBatch(plan, base, now);
  expect(result.base).toBe(base); expect(result.changed).toBe(true);
  expect(result.candidate.map(row => row.definition.id)).toEqual(['hidden', 'active', 'waiting', 'paused', 'stopped', 'expired']);
  expect(result.candidate.map(row => row.status)).toEqual(['active', 'paused', 'paused', 'paused', 'stopped', 'expired']);
  for (const index of [0, 3, 4, 5]) expect(result.candidate[index]).toBe(base[index]);
  for (const index of [1, 2]) {
    expect(result.candidate[index]).not.toBe(base[index]);
    expect(result.candidate[index]).toStrictEqual({ ...base[index], status: 'paused', lastValue: null, previousClosedValue: null, currentBarId: null, closedBars: [] });
  }
  expect(base).toStrictEqual(before); expect(Object.isFrozen(result.candidate)).toBe(true);
});

it('resumes only a not-due paused target and retains stopped, expired and due rows exactly', () => {
  const base = [saved('paused', 'paused', 1030), saved('active'), saved('waiting', 'waiting-for-data'), saved('stopped', 'stopped'), saved('expired', 'expired', 1015), saved('due', 'paused', now)];
  const result = applyAlertBatch(prepareAlertBatch(base, base.map(row => row.definition.id), 'resume', now), base, now);
  expect(result.eligibleIds).toEqual(['paused']);
  expect(result.unchanged).toEqual([{ id: 'active', reason: 'already-active' }, { id: 'waiting', reason: 'waiting-for-data' }, { id: 'stopped', reason: 'stopped' }, { id: 'expired', reason: 'expired' }, { id: 'due', reason: 'expiration-due' }]);
  expect(result.candidate[0]).toStrictEqual({ ...base[0], status: 'active', lastValue: null, previousClosedValue: null, currentBarId: null, closedBars: [] });
  for (let i = 1; i < base.length; i++) expect(result.candidate[i]).toBe(base[i]);
});

it('returns the exact latest array for zero eligible or empty selections without changing paused baselines', () => {
  const base = [saved('paused', 'paused'), saved('stopped', 'stopped')];
  for (const selected of [[], ['paused', 'stopped']]) {
    const result = applyAlertBatch(prepareAlertBatch(base, selected, 'pause', now), base, now);
    expect(result.changed).toBe(false); expect(result.base).toBe(base); expect(result.candidate).toBe(base);
    expect(result.candidate[0].lastValue).toBe(12);
  }
});

it('retains latest legitimate pause history, sequence and definition values', () => {
  const base = [saved('selected'), saved('hidden')], plan = prepareAlertBatch(base, ['selected'], 'pause', now);
  const latest = [append(base[0], 2), base[1]], result = applyAlertBatch(plan, latest, now);
  expect(result.base).toBe(latest); expect(result.candidate[1]).toBe(base[1]);
  expect(result.candidate[0].history).toStrictEqual(latest[0].history);
  expect(result.candidate[0].lastSequence).toBe(2); expect(result.candidate[0].lastTime).toBe(1011);
  expect(result.candidate[0].definition).toStrictEqual(base[0].definition); expect(result.candidate[0].revision).toBe(1);
});

it('uses latest admitted history on resume without resetting event identities or rearming', () => {
  const base = [saved('selected', 'paused')], plan = prepareAlertBatch(base, ['selected'], 'resume', now);
  const historical = append({ ...base[0], status: 'active' }, 2); historical.status = 'paused';
  const result = applyAlertBatch(plan, [historical], now);
  expect(result.candidate[0].history).toStrictEqual(historical.history); expect(result.candidate[0].lastSequence).toBe(2);
  expect(result.candidate[0].definition).toStrictEqual(base[0].definition); expect(result.candidate[0].armedAt).toBe(created); expect(result.candidate[0].revision).toBe(1);
});

it('deletes exactly the selected definitions and embedded history without reordering hidden rows', () => {
  const base = [saved('first'), saved('remove-a', 'stopped'), saved('middle', 'paused'), saved('remove-b', 'expired', 1015), saved('last')];
  const plan = prepareAlertBatch(base, ['remove-b', 'remove-a'], 'delete', now), result = applyAlertBatch(plan, base, now);
  expect(plan.removedHistoryCount).toBe(2); expect(result.removedHistoryCount).toBe(2);
  expect(result.candidate).toEqual([base[0], base[2], base[4]]);
  expect(result.candidate[0]).toBe(base[0]); expect(result.candidate[1]).toBe(base[2]); expect(result.candidate[2]).toBe(base[4]);
  expect(base).toHaveLength(5); expect(base[1].history).toHaveLength(1); expect(base[3].history).toHaveLength(1);
});

it.each(['append', 'same-count replacement', 'identity correction'] as const)('requires new delete consent after %s', change => {
  const base = [saved('selected')], plan = prepareAlertBatch(base, ['selected'], 'delete', now), next = structuredClone(base);
  if (change === 'append') next[0] = append(next[0], 2);
  else if (change === 'same-count replacement') next[0].history[0].id = 'SYNTHETIC substituted identity';
  else { next[0].history[0].sequence = 2; next[0].lastSequence = 2; }
  const before = structuredClone(next); expect(() => applyAlertBatch(plan, next, now)).toThrow(/history changed/); expect(next).toStrictEqual(before);
});

it('permits same-value clones and reordered definition object keys without losing histories', () => {
  const base = [saved('selected')], plan = prepareAlertBatch(base, ['selected'], 'pause', now), latest = structuredClone(base);
  latest[0].definition = { ...Object.fromEntries(Object.entries(latest[0].definition).reverse()), ...latest[0].definition };
  expect(applyAlertBatch(plan, latest, now).candidate[0].status).toBe('paused');
});

it.each(['revision', 'status', 'armedAt', 'same-revision definition', 'unknown definition metadata'] as const)('refuses a prepared %s change before returning any candidate', change => {
  const base = [saved('first'), saved('second')], plan = prepareAlertBatch(base, ['first', 'second'], 'pause', now), latest = structuredClone(base);
  if (change === 'revision') latest[1].revision++;
  else if (change === 'status') latest[1].status = 'paused';
  else if (change === 'armedAt') latest[1].armedAt++;
  else if (change === 'same-revision definition') latest[1].definition.message = 'SYNTHETIC replacement';
  else (latest[1].definition as any).future = { retained: 'SYNTHETIC new metadata' };
  const before = structuredClone(latest); expect(() => applyAlertBatch(plan, latest, now)).toThrow(/batch changed/); expect(latest).toStrictEqual(before);
});

it('detaches definition identity at preparation, including nested unknown fields and signed zero', () => {
  const base = [saved('selected')]; (base[0].definition as any).future = { value: -0 };
  const plan = prepareAlertBatch(base, ['selected'], 'pause', now); (base[0].definition as any).future.value = 0;
  expect(() => applyAlertBatch(plan, base, now)).toThrow(/batch changed/);
});

it('refuses the entire prepared resume when one target crosses its expiry boundary', () => {
  const base = [saved('first', 'paused', 1030), saved('second', 'paused', 1021)], before = structuredClone(base), plan = prepareAlertBatch(base, ['first', 'second'], 'resume', now);
  expect(() => applyAlertBatch(plan, base, 1021)).toThrow(/batch changed/); expect(base).toStrictEqual(before);
});

it.each([NaN, Infinity, -1, 1.5])('refuses an invalid local clock %s at prepare and apply', value => {
  const base = [saved('selected', 'paused')]; expect(() => prepareAlertBatch(base, ['selected'], 'resume', value)).toThrow(/clock/);
  const plan = prepareAlertBatch(base, ['selected'], 'pause', now); expect(() => applyAlertBatch(plan, base, value)).toThrow(/clock/);
});

it('refuses resume clocks behind preparation, armedAt or latest observed time', () => {
  const base = [saved('selected', 'paused')]; expect(() => prepareAlertBatch(base, ['selected'], 'resume', created - 1)).toThrow(/clock/);
  expect(() => prepareAlertBatch(base, ['selected'], 'resume', 1009)).toThrow(/clock/);
  const plan = prepareAlertBatch(base, ['selected'], 'resume', now); expect(() => applyAlertBatch(plan, base, now - 1)).toThrow(/clock/);
  const latest = [{ ...base[0], lastTime: now + 1 }]; expect(() => applyAlertBatch(plan, latest, now)).toThrow(/clock/);
});

it.each(['pause', 'delete'] as const)('does not invent a lifecycle-clock restriction for %s', action => {
  const base = [saved('selected')], plan = prepareAlertBatch(base, ['selected'], action, 0);
  expect(applyAlertBatch(plan, base, 0).changed).toBe(true);
});

it('freezes detached plan summaries, requires exact plan identity and remains reusable without UI authority', () => {
  const base = [saved('selected'), saved('paused', 'paused')], plan = prepareAlertBatch(base, ['selected', 'paused'], 'pause', now);
  expect(Object.isFrozen(plan)).toBe(true); expect(Object.isFrozen(plan.selectedIds)).toBe(true); expect(Object.isFrozen(plan.eligibleIds)).toBe(true); expect(Object.isFrozen(plan.unchanged)).toBe(true); expect(Object.isFrozen(plan.unchanged[0])).toBe(true);
  expect(() => applyAlertBatch({ ...plan }, base, now)).toThrow(/Unknown/);
  const first = applyAlertBatch(plan, base, now), second = applyAlertBatch(plan, base, now); expect(first.candidate).toStrictEqual(second.candidate); expect(first.base).toBe(base); expect(second.base).toBe(base);
});

it('rejects duplicate, missing and ambiguous selected identities without input changes', () => {
  const base = [saved('selected')], before = structuredClone(base);
  expect(() => prepareAlertBatch(base, ['selected', 'selected'], 'pause', now)).toThrow(/Duplicate/);
  expect(() => prepareAlertBatch(base, ['missing'], 'pause', now)).toThrow(/no longer exists/);
  expect(() => prepareAlertBatch([base[0], base[0]], ['selected'], 'pause', now)).toThrow(/Duplicate/);
  const plan = prepareAlertBatch(base, ['selected'], 'pause', now); expect(() => applyAlertBatch(plan, [], now)).toThrow(/no longer exists/); expect(base).toStrictEqual(before);
});

it('retains existing count bounds and refuses getter-bearing metadata without calling it', () => {
  expect(() => prepareAlertBatch(new Array(10001), [], 'pause', now)).toThrow(/limits/);
  const base = [saved('selected')], selected: any[] = [0]; let reads = 0; Object.defineProperty(selected, '0', { enumerable: true, get() { reads++; return 'selected'; } });
  expect(() => prepareAlertBatch(base, selected, 'pause', now)).toThrow(/own data/); expect(reads).toBe(0);
  Object.defineProperty(base[0].definition, 'future', { enumerable: true, get() { reads++; return 1; } });
  expect(() => prepareAlertBatch(base, ['selected'], 'pause', now)).toThrow(/own data/); expect(reads).toBe(0);
});

it('returns no candidate if latest upstream admission was lost in an unselected row', () => {
  const base = [saved('selected'), saved('hidden')], plan = prepareAlertBatch(base, ['selected'], 'pause', now), latest = structuredClone(base);
  latest[1].lastValue = Infinity; const before = structuredClone(latest);
  // This deliberately violates the admitted-input precondition to check the
  // final whole-candidate guard, not to certify a new untrusted input boundary.
  expect(() => applyAlertBatch(plan, latest, now)).toThrow(/nonfinite/); expect(latest).toStrictEqual(before); expect(latest[0].status).toBe('active');
});
