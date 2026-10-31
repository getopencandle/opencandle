import { describe, expect, it } from 'vitest';
import { advanceLocalAlertClock, createLocalAlert, processAlertEvent, setLocalAlertPaused } from '../../src/domain/alerts';
import type { AlertCondition, AlertDefinition, LocalAlert } from '../../src/domain/alerts';
import { fixtureDataset } from '../../src/domain/fixtures';
import { WorkspaceAlertObserver } from '../../src/ui/workspace-alert-observer';
import type { WorkspaceAlertInput, WorkspaceAlertView } from '../../src/ui/workspace-alert-observer';

const now = Date.UTC(2026, 9, 14, 11) / 1000;
function input(closes = [9]): WorkspaceAlertInput {
  const dataset = fixtureDataset('TEST', closes.length);
  dataset.bars = closes.map((close, index) => ({ time: 1704153600 + index * 86400, open: close, high: close + 1, low: close - 1, close, volume: 100 }));
  dataset.provenance.coverage = 'Synthetic independent controller test';
  return { dataset, priceSource: 'close', replay: null, assumeReplayCompletion: false };
}
function definition(view: WorkspaceAlertView, condition: AlertCondition = { kind: 'crossing-up', value: 10 }): AlertDefinition {
  const context = view.context!;
  return { id: 'review-alert', name: 'Review alert', message: 'Synthetic test', instrumentId: context.instrumentId, sourceId: context.sourceId, runId: context.runId, mode: context.mode, observationBinding: context.binding, condition, frequency: 'every-time', createdAt: view.now, expiresAt: null };
}
function consume(alert: LocalAlert, view: WorkspaceAlertView): LocalAlert {
  const timed = advanceLocalAlertClock(alert, view.now);
  return view.event ? processAlertEvent(timed, view.event).alert : timed;
}

describe('independent workspace observation lifecycle, no mounted GUI evidence', () => {
  it('clears a crossing baseline after invalid data even when recovery is inside the sleep threshold', () => {
    let id = 0; const observer = new WorkspaceAlertObserver(() => `review-${++id}`), one = input();
    const first = observer.observe(one, now), alert = consume(createLocalAlert(definition(first)), first);
    const bad = structuredClone(one); bad.dataset.bars[0].close = Number.NaN;
    const missing = observer.observe(bad, now + 1);
    expect(missing.event).toBeNull(); expect(missing.diagnostics.length).toBeGreaterThan(0);
    const recovered = observer.observe(input([9, 11]), now + 2), result = consume(alert, recovered);
    expect(result.history).toEqual([]);
    expect(recovered.event?.observation?.continuity === 'gap' || recovered.context?.binding.sessionId !== first.context?.binding.sessionId).toBe(true);
  });
  it('valid unchanged polling does not manufacture gaps or suppress a later real snapshot transition', () => {
    const observer = new WorkspaceAlertObserver(() => 'continuous'), one = input(), first = observer.observe(one, now);
    let alert = consume(createLocalAlert(definition(first)), first);
    for (let seconds = 10; seconds <= 90; seconds += 10) alert = consume(alert, observer.observe(one, now + seconds));
    const next = observer.observe(input([9, 11]), now + 91); alert = consume(alert, next);
    expect(alert.history.map(row => row.value)).toEqual([11]); expect(alert.missedDataGaps).toBe(0);
    expect(alert.history[0].observation?.sourceAvailableAt).toBeNull(); expect(alert.history[0].observation?.completion).toBe('unknown');
  });
  it('a later-created alert requires a fresh explicit evaluation instead of consuming the cached past event', () => {
    const observer = new WorkspaceAlertObserver(() => 'late-created'), data = input([11]);
    observer.observe(data, now);
    const idle = observer.observe(data, now + 5), alert = createLocalAlert(definition(idle, { kind: 'greater', value: 10 }));
    expect(consume(alert, idle).history).toEqual([]);
    const evaluation = observer.observe(data, now + 5, 'explicit-evaluation'), result = consume(alert, evaluation);
    expect(result.history).toHaveLength(1); expect(result.history[0].at).toBe(now + 5);
    expect(result.history[0].observation).toMatchObject({ reason: 'explicit-evaluation', sourceAvailableAt: null, completion: 'unknown' });
    expect(consume(result, observer.observe(data, now + 6)).history).toHaveLength(1);
  });
  it('never lets a reused caller nonce mix replay runs or completion assumptions downstream', () => {
    const observer = new WorkspaceAlertObserver(() => 'same-nonce'), data = input([11]);
    data.replay = { runId: 'seek-1', cursor: 0 };
    const first = observer.observe(data, now), alert = createLocalAlert(definition(first, { kind: 'greater', value: 10 }));
    const second = observer.observe({ ...data, replay: { runId: 'seek-2', cursor: 0 } }, now + 1);
    expect(consume(alert, second).history).toEqual([]);
    const completed = observer.observe({ ...data, assumeReplayCompletion: true }, now + 2);
    expect(completed.event?.barClosed).toBe(true); expect(consume(alert, completed).history).toEqual([]);
  });
  it('revising a replay source or rewinding its cursor creates a fresh session, preserving old alerts separately', () => {
    let id = 0; const observer = new WorkspaceAlertObserver(() => `revision-${++id}`), data = input([9, 11]);
    data.replay = { runId: 'same-run', cursor: 1 };
    const first = observer.observe(data, now), alert = createLocalAlert(definition(first, { kind: 'greater', value: 10 }));
    const revised = structuredClone(data); revised.dataset.provenance.revision = 'revised';
    const correction = observer.observe(revised, now + 1);
    expect(correction.context?.binding.sessionId).not.toBe(first.context?.binding.sessionId); expect(consume(alert, correction).history).toEqual([]);
    const backward = observer.observe({ ...revised, replay: { runId: 'same-run', cursor: 0 } }, now + 2);
    expect(backward.context?.binding.sessionId).not.toBe(correction.context?.binding.sessionId);
  });
  it('expires a paused alert from the local controller clock even when its cached source event is unchanged', () => {
    const observer = new WorkspaceAlertObserver(() => 'expiry'), data = input([11]), first = observer.observe(data, now);
    let alert = setLocalAlertPaused(createLocalAlert({ ...definition(first), expiresAt: now + 10 }), true);
    alert = consume(alert, observer.observe(data, now + 9)); expect(alert.status).toBe('paused');
    alert = consume(alert, observer.observe(data, now + 10)); expect(alert.status).toBe('expired'); expect(alert.history).toEqual([]);
  });
});
