import { expect, it, vi } from 'vitest';
import * as alerts from '../../src/domain/alerts';
import type { LocalAlert } from '../../src/domain/alerts';
import { applyAlertBatch, assertAlertBatchCurrent, prepareAlertBatch } from '../../src/domain/alert-batch-actions';

// Authored guard regressions. These are not executable interface evidence.
function observed(row: LocalAlert, sequence = 1): LocalAlert {
  return alerts.processAlertEvent(row, {
    instrumentId: 'SYNTHETIC guard instrument', sourceId: 'close', mode: 'ordinary', runId: 'ordinary',
    value: 11, time: 109 + sequence, availableAt: 109 + sequence, sequence,
    barId: 'SYNTHETIC guard bar ' + sequence, barClosed: false, feedState: 'ready',
  }).alert;
}
function saved(id: string, status: LocalAlert['status'] = 'active', expiresAt: number | null = null): LocalAlert {
  const row = observed(alerts.createLocalAlert({
    id, name: 'SYNTHETIC ' + id, message: 'SYNTHETIC guard fixture',
    instrumentId: 'SYNTHETIC guard instrument', sourceId: 'close', mode: 'ordinary', runId: 'ordinary',
    createdAt: 100, expiresAt, condition: { kind: 'greater', value: 10 }, frequency: 'every-time',
  }));
  row.status = status;
  return row;
}

it('accepts exact and same-value cloned bases without transforming, validating or cloning a candidate', () => {
  const base = [saved('a'), saved('p', 'paused')], before = structuredClone(base);
  const cloned = structuredClone(base);
  cloned[0].definition = Object.fromEntries(Object.entries(cloned[0].definition).reverse()) as typeof cloned[0]['definition'];
  const plans = [
    prepareAlertBatch(base, ['a'], 'pause', 120),
    prepareAlertBatch(base, ['p'], 'resume', 120),
    prepareAlertBatch(base, ['a', 'p'], 'delete', 120),
  ];
  const transform = vi.spyOn(alerts, 'setLocalAlertPaused');
  const validate = vi.spyOn(alerts, 'validateLocalAlerts');
  const clone = vi.spyOn(globalThis, 'structuredClone');
  try {
    for (const plan of plans) {
      expect(assertAlertBatchCurrent(plan, base, 121)).toBeUndefined();
      expect(assertAlertBatchCurrent(plan, cloned, 121)).toBeUndefined();
    }
    expect(transform).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
    expect(base).toStrictEqual(before);
    expect(cloned).toStrictEqual(before);
    expect(base.map(row => row.status)).toEqual(['active', 'paused']);
    expect(base.map(row => row.history.length)).toEqual([1, 1]);
  } finally {
    clone.mockRestore(); validate.mockRestore(); transform.mockRestore();
  }
});

it('still transforms eligible rows and validates the full changed candidate during explicit apply', () => {
  const base = [saved('a'), saved('hidden')], plan = prepareAlertBatch(base, ['a'], 'pause', 120);
  const transform = vi.spyOn(alerts, 'setLocalAlertPaused');
  const validate = vi.spyOn(alerts, 'validateLocalAlerts');
  try {
    const result = applyAlertBatch(plan, base, 121);
    expect(transform).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(result.base).toBe(base);
    expect(result.candidate.map(row => row.status)).toEqual(['paused', 'active']);
    expect(result.candidate[1]).toBe(base[1]);
    expect(result.candidate[0].history).toStrictEqual(base[0].history);
    expect(base[0].status).toBe('active');
  } finally {
    validate.mockRestore(); transform.mockRestore();
  }
});

it('keeps full candidate admission after successful read-only target validation', () => {
  const base = [saved('a')], plan = prepareAlertBatch(base, ['a'], 'pause', 120);
  const validate = vi.spyOn(alerts, 'validateLocalAlerts').mockReturnValue({ ok: false, errors: ['SYNTHETIC admission refusal'] });
  try {
    expect(() => assertAlertBatchCurrent(plan, base, 121)).not.toThrow();
    expect(validate).not.toHaveBeenCalled();
    expect(() => applyAlertBatch(plan, base, 121)).toThrow('SYNTHETIC admission refusal');
    expect(validate).toHaveBeenCalledTimes(1);
    expect(base[0].status).toBe('active');
  } finally { validate.mockRestore(); }
});

it('requires private exact plan provenance and does not consume genuine reusable plans', () => {
  const base = [saved('a')], plan = prepareAlertBatch(base, ['a'], 'pause', 120);
  expect(() => assertAlertBatchCurrent({ ...plan }, base, 121)).toThrow(/Unknown alert batch plan/);
  expect(() => assertAlertBatchCurrent(structuredClone(plan), base, 121)).toThrow(/Unknown alert batch plan/);
  expect(() => assertAlertBatchCurrent(plan, base, 121)).not.toThrow();
  expect(() => assertAlertBatchCurrent(plan, base, 121)).not.toThrow();
});

it.each(['revision', 'status', 'armedAt', 'definition', 'unknown-definition'] as const)('rejects a selected %s change without mutating input', field => {
  const base = [saved('a'), saved('b')], plan = prepareAlertBatch(base, ['a', 'b'], 'pause', 120);
  const latest = structuredClone(base);
  if (field === 'revision') latest[1].revision = 2;
  else if (field === 'status') latest[1].status = 'paused';
  else if (field === 'armedAt') latest[1].armedAt = 101;
  else if (field === 'definition') latest[1].definition.message = 'SYNTHETIC changed definition';
  else Object.assign(latest[1].definition, { futureMetadata: { value: 'SYNTHETIC added field' } });
  const before = structuredClone(latest);
  expect(() => assertAlertBatchCurrent(plan, latest, 121)).toThrow(/batch changed/);
  expect(() => applyAlertBatch(plan, latest, 121)).toThrow(/batch changed/);
  expect(latest).toStrictEqual(before);
  expect(base[1].status).toBe('active');
});

it('does not use a live definition alias as the prepared basis', () => {
  const base = [saved('a')];
  Object.assign(base[0].definition, { futureMetadata: { number: -0 } });
  const plan = prepareAlertBatch(base, ['a'], 'pause', 120);
  Object.assign(base[0].definition, { futureMetadata: { number: 0 } });
  expect(() => assertAlertBatchCurrent(plan, base, 121)).toThrow(/batch changed/);
});

it('permits legitimate unselected changes and pause history additions on the selected row', () => {
  const base = [saved('a'), saved('hidden')], plan = prepareAlertBatch(base, ['a'], 'pause', 120);
  const latest = [observed(base[0], 2), saved('hidden', 'paused'), saved('new-unselected')];
  latest[1].definition.message = 'SYNTHETIC unselected update';
  const before = structuredClone(latest);
  expect(() => assertAlertBatchCurrent(plan, latest, 121)).not.toThrow();
  expect(latest).toStrictEqual(before);
  expect(latest[0].history).toHaveLength(2);
  expect(latest.map(row => row.definition.id)).toEqual(['a', 'hidden', 'new-unselected']);
});

it.each(['substitution', 'reorder', 'append', 'sequence'] as const)('requires new delete consent after selected history %s', change => {
  const base = [observed(saved('a'), 2), saved('hidden')];
  const plan = prepareAlertBatch(base, ['a'], 'delete', 120), latest = structuredClone(base);
  expect(plan.removedHistoryCount).toBe(2);
  if (change === 'substitution') latest[0].history[0].id = 'SYNTHETIC replacement notification';
  else if (change === 'reorder') latest[0].history.reverse();
  else if (change === 'append') latest[0] = observed(latest[0], 3);
  else latest[0].history[0].sequence = 4;
  const before = structuredClone(latest);
  expect(() => assertAlertBatchCurrent(plan, latest, 121)).toThrow(/history changed/);
  expect(latest).toStrictEqual(before);
});

it('ignores unselected history updates when checking delete consent', () => {
  const base = [saved('a'), saved('hidden')], plan = prepareAlertBatch(base, ['a'], 'delete', 120);
  const latest = [base[0], observed(base[1], 2)];
  expect(() => assertAlertBatchCurrent(plan, latest, 121)).not.toThrow();
  expect(plan.removedHistoryCount).toBe(1);
  expect(latest[1].history).toHaveLength(2);
});

it('rejects changed resume eligibility exactly at expiration', () => {
  const base = [saved('p', 'paused', 121)], plan = prepareAlertBatch(base, ['p'], 'resume', 120);
  expect(() => assertAlertBatchCurrent(plan, base, 120)).not.toThrow();
  expect(() => assertAlertBatchCurrent(plan, base, 121)).toThrow(/batch changed/);
  expect(base[0].status).toBe('paused');
});

it('preserves Resume-only preparation and lifecycle clock floors', () => {
  const base = [saved('p', 'paused')], plan = prepareAlertBatch(base, ['p'], 'resume', 120);
  expect(() => assertAlertBatchCurrent(plan, base, 119)).toThrow(/clock/);
  expect(() => assertAlertBatchCurrent(plan, [{ ...base[0], lastTime: 122 }], 121)).toThrow(/clock/);
  expect(() => assertAlertBatchCurrent(plan, [{ ...base[0], armedAt: 122 }], 121)).toThrow(/clock/);
});

it.each(['pause', 'delete'] as const)('does not add a preparation/lifecycle floor for %s', action => {
  const base = [saved('a')], plan = prepareAlertBatch(base, ['a'], action, 120);
  expect(() => assertAlertBatchCurrent(plan, base, 0)).not.toThrow();
  expect(base[0].armedAt).toBe(100);
  expect(base[0].lastTime).toBe(110);
});

it.each([NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid action time %s for every action', now => {
  const base = [saved('p', 'paused')];
  for (const action of ['pause', 'resume', 'delete'] as const) {
    const plan = prepareAlertBatch(base, ['p'], action, 120);
    expect(() => assertAlertBatchCurrent(plan, base, now)).toThrow(/clock/);
  }
});

it('retains dense unique latest-index checks and missing-target refusal', () => {
  const base = [saved('a')], plan = prepareAlertBatch(base, ['a'], 'pause', 120);
  expect(() => assertAlertBatchCurrent(plan, [], 121)).toThrow(/no longer exists/);
  expect(() => assertAlertBatchCurrent(plan, [base[0], base[0]], 121)).toThrow(/Duplicate/);
  expect(() => assertAlertBatchCurrent(plan, new Array<LocalAlert>(1), 121)).toThrow(/dense/);
  let reads = 0;
  const accessor: LocalAlert[] = [base[0]];
  Object.defineProperty(accessor, '0', { enumerable: true, get() { reads++; return base[0]; } });
  expect(() => assertAlertBatchCurrent(plan, accessor, 121)).toThrow(/own data/);
  expect(reads).toBe(0);
});

it('returns no candidate for empty and no-op selections and leaves no-op apply identity intact', () => {
  const base = [saved('p', 'paused')];
  for (const selected of [[], ['p']]) {
    const plan = prepareAlertBatch(base, selected, 'pause', 120);
    expect(assertAlertBatchCurrent(plan, base, 121)).toBeUndefined();
    const result = applyAlertBatch(plan, base, 121);
    expect(result.changed).toBe(false);
    expect(result.base).toBe(base);
    expect(result.candidate).toBe(base);
  }
});
