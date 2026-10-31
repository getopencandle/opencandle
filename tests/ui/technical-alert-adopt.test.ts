import { expect, it } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { createLocalAlert, processLocalAlertBatch, type LocalAlert } from '../../src/domain/alerts';
import { TechnicalAlertObserver, type TechnicalAlertInput } from '../../src/ui/technical-alert-observer';

// SYNTHETIC checks: a saved alert keeps being evaluated by a new observer (another symbol's background feed, or the
// chart after a symbol change) because the observer adopts the alert's own saved source session.
const now = Date.UTC(2026, 9, 14) / 1000;
const dataset = fixtureDataset('GME', 3);
dataset.bars = [9, 11, 12].map((close, i) => ({ time: Date.UTC(2024, 0, i + 2) / 1000, open: close, high: close + 1, low: close - 1, close, volume: 100 }));
const input = (count: number, alerts: LocalAlert[] = [], extra: Partial<TechnicalAlertInput> = {}): TechnicalAlertInput => ({ dataset, bars: dataset.bars.slice(0, count), chartId: 'chart', replay: null, assumeReplayCompletion: false, selectedSource: { kind: 'price', field: 'close', transformId: 'standard' }, alerts, ...extra });
const observer = (prefix: string) => { let serial = 0; return new TechnicalAlertObserver(() => `${prefix}${++serial}`, () => Promise.resolve()); };

async function armed(): Promise<LocalAlert> {
  const first = observer('a'), view = await first.observe(input(1), now), context = view.selectedContext!;
  const alert = createLocalAlert({ id: 'alert', name: 'Crossing', message: '', instrumentId: context.instrumentId, sourceId: context.sourceId, mode: context.mode, runId: context.runId, observationBinding: context.binding, conditionVersion: 2, condition: { kind: 'crossing-up', value: 10 }, frequency: 'every-time', createdAt: now, expiresAt: null });
  return processLocalAlertBatch([alert], view.events, now).alerts[0];
}

it('does not resume a saved alert in a new observer unless asked to adopt its saved session', async () => {
  const alert = await armed();
  const view = await observer('b').observe({ ...input(2, [alert]), selectedSource: null }, now + 1);
  expect(view.events).toEqual([]);
  expect(view.inactiveAlertIds).toEqual(['alert']);
});

it('adopts the saved session of an active alert and continues its event sequence, so the next crossing triggers', async () => {
  const alert = await armed();
  expect(alert.lastSequence).toBe(1);
  const view = await observer('c').observe({ ...input(2, [alert], { adopt: true }), selectedSource: null }, now + 1);
  expect(view.inactiveAlertIds).toEqual([]);
  expect(view.events).toHaveLength(1);
  expect(view.events[0].sequence).toBe(2);
  const processed = processLocalAlertBatch([alert], view.events, now + 1);
  expect(processed.alerts[0].history).toHaveLength(1);
  expect(processed.alerts[0].history[0].value).toBe(11);
});

it('never adopts a paused alert, another dataset, or a replay binding', async () => {
  const alert = await armed();
  const paused = { ...alert, status: 'paused' as const };
  expect((await observer('d').observe({ ...input(2, [paused], { adopt: true }), selectedSource: null }, now + 1)).events).toEqual([]);
  const other = fixtureDataset('SPY', 3); other.bars = dataset.bars;
  expect((await observer('e').observe({ ...input(2, [alert], { adopt: true }), dataset: other, selectedSource: null }, now + 1)).events).toEqual([]);
});
