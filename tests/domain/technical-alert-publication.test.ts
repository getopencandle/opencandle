import { expect, it } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { createLocalAlert, processAlertEvent } from '../../src/domain/alerts';
import { TechnicalAlertObserver, type TechnicalAlertInput } from '../../src/ui/technical-alert-observer';

const now = Date.UTC(2026, 9, 14) / 1000;
const dataset = fixtureDataset('GME', 3);
dataset.bars = [9, 11, 12].map((close, i) => ({ time: Date.UTC(2024, 0, i + 2) / 1000, open: close, high: close + 1, low: close - 1, close, volume: 100 }));
const input = (count: number): TechnicalAlertInput => ({ dataset, bars: dataset.bars.slice(0, count), chartId: 'chart', replay: null, assumeReplayCompletion: false, selectedSource: { kind: 'price', field: 'close', transformId: 'standard' }, alerts: [] });
const observer = () => { let serial = 0; return new TechnicalAlertObserver(() => `s${++serial}`, () => Promise.resolve()); };

it('rolls back a rejected crossing publication and reoffers the same event sequence without losing its old baseline', async () => {
  const engine = observer(), first = await engine.observe(input(1), now), context = first.selectedContext!;
  const original = processAlertEvent(createLocalAlert({ id: 'alert', name: 'Crossing', message: '', instrumentId: context.instrumentId, sourceId: context.sourceId, mode: context.mode, runId: context.runId, observationBinding: context.binding, conditionVersion: 2, condition: { kind: 'crossing-up', value: 10 }, frequency: 'every-time', createdAt: now, expiresAt: null }), first.events[0]).alert;
  expect(original.lastValue).toBe(9);
  const request = { ...input(2), alerts: [original] }, staged = await engine.observeForPublication(request, now + 1);
  const proposed = processAlertEvent(original, staged.view.events[0]).alert; expect(proposed.history).toHaveLength(1);
  expect(staged.rollback()).toBe(true); expect(staged.rollback()).toBe(false); expect(original.history).toEqual([]);
  const retried = await engine.observeForPublication(request, now + 2);
  expect(retried.view.events[0].sequence).toBe(staged.view.events[0].sequence);
  const accepted = processAlertEvent(original, retried.view.events[0]).alert; expect(accepted.history).toHaveLength(1); expect(accepted.history[0].value).toBe(11);
  retried.commit(); expect(retried.rollback()).toBe(false);
  const duplicate = await engine.observe({ ...request, alerts: [accepted] }, now + 3); expect(duplicate.events).toEqual([]);
});

it('never lets an older publication checkpoint overwrite a newer observer operation or reset', async () => {
  const engine = observer(); await engine.observe(input(1), now);
  const staged = await engine.observeForPublication(input(2), now + 1);
  const newer = await engine.observe(input(3), now + 2); expect(staged.rollback()).toBe(false);
  expect((await engine.observe(input(3), now + 3)).events).toEqual([]);
  const resetCandidate = await engine.observeForPublication(input(3), now + 4, 'explicit-evaluation'); engine.reset();
  expect(resetCandidate.rollback()).toBe(false);
  const after = await engine.observe(input(1), now + 5); expect(after.selectedContext!.runId).not.toBe(newer.selectedContext!.runId);
});

it('does not restore a pre-reset checkpoint when calculation was cancelled while yielding', async () => {
  const deferred: { release?: () => void } = {}; let called = false;
  const engine = new TechnicalAlertObserver(() => 'new-session', () => { called = true; return new Promise<void>(resolve => { deferred.release = resolve; }); });
  const pending = engine.observeForPublication(input(2), now);
  for (let turn = 0; turn < 10 && !called; turn++) await Promise.resolve();
  engine.reset(); deferred.release?.(); const result = await pending;
  expect(result.view.cancelled).toBe(true); expect(result.rollback()).toBe(false);
});
