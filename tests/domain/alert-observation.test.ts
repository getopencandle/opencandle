import { describe, expect, it } from 'vitest';
import { advanceLocalAlertClock, createLocalAlert, processAlertEvent, restoreLocalAlerts, setLocalAlertPaused, validateLocalAlerts } from '../../src/domain/alerts';
import type { AlertCondition, AlertDefinition, AlertEvent, AlertFrequency } from '../../src/domain/alerts';
import { alertObservationContext, createAlertObservationSession, observeAlertSnapshot } from '../../src/domain/alert-observation';
import type { AlertObservationSession, AlertSourceSnapshot } from '../../src/domain/alert-observation';
import { fixtureDataset } from '../../src/domain/fixtures';
import type { BarDataset } from '../../src/domain/types';

const day = Date.UTC(2024, 0, 2) / 1000, now = Date.UTC(2026, 9, 14, 10) / 1000;
function dataset(closes = [9, 11, 12]): BarDataset {
  const data = fixtureDataset('GME', closes.length);
  data.bars = closes.map((close, i) => ({ time: day + i * 86400, open: close, high: close + 1, low: close - 1, close, volume: 100 + i }));
  data.provenance.fixture = false; data.provenance.providerId = 'user-import'; data.provenance.datasetId = 'original-file'; data.provenance.revision = 'r1';
  return data;
}
function session(data: BarDataset, changes: Partial<Parameters<typeof createAlertObservationSession>[1]> = {}): AlertObservationSession {
  return createAlertObservationSession(data, { sessionId: 'session-1', mode: 'ordinary', startedAt: now, ...changes });
}
function definition(state: AlertObservationSession, data: BarDataset, frequency: AlertFrequency = 'every-time', condition: AlertCondition = { kind: 'crossing-up', value: 10 }): AlertDefinition {
  const context = alertObservationContext(state, data);
  return { id: 'alert-1', name: 'Test observed snapshots', message: 'Local test', instrumentId: context.instrumentId, sourceId: context.sourceId, mode: context.mode, runId: context.runId, observationBinding: context.binding, frequency, condition, createdAt: now, expiresAt: null };
}
function requireEvent(event: AlertEvent | null): AlertEvent { expect(event).not.toBeNull(); return event!; }

describe('snapshot availability and completion are explicit local assumptions', () => {
  it('does not call a loaded daily final OHLC closed or available at its opening timestamp', () => {
    const data = dataset([11]), state = session(data), observed = observeAlertSnapshot(state, { dataset: data, observedAt: now });
    const event = requireEvent(observed.event);
    expect(event.time).toBe(now); expect(event.availableAt).toBe(now); expect(event.barClosed).toBe(false);
    expect(event.observation).toMatchObject({ kind: 'supplied-snapshot', sourceTime: day, observedAt: now, sourceAvailableAt: null, completion: 'unknown', informationBars: 1 });
    const ordinary = processAlertEvent(createLocalAlert(definition(state, data, 'every-time', { kind: 'greater', value: 10 })), event);
    expect(ordinary.notification?.value).toBe(11); expect(ordinary.notification?.observation?.sourceTime).toBe(day);
    for (const [frequency, condition] of [['once-per-bar-close', { kind: 'greater', value: 10 }], ['every-time', { kind: 'moving-up', amount: 0, bars: 1 }]] as const) {
      const result = processAlertEvent(createLocalAlert(definition(state, data, frequency, condition)), event);
      expect(result.notification).toBeNull(); expect(result.alert.closedBars).toEqual([]);
    }
  });
  it('deduplicates a rerender but sequences same-length corrections without inventing crossing ticks', () => {
    const data = dataset([9]), first = observeAlertSnapshot(session(data), { dataset: data, observedAt: now });
    let alert = processAlertEvent(createLocalAlert(definition(first.session, data)), requireEvent(first.event)).alert;
    const duplicate = observeAlertSnapshot(first.session, { dataset: structuredClone(data), observedAt: now + 1 });
    expect(duplicate.event).toBeNull(); expect(duplicate.session.sequence).toBe(first.session.sequence); expect(duplicate.session.lastObservedAt).toBe(now + 1);
    const corrected = dataset([11]); corrected.provenance.revision = 'r2';
    const next = observeAlertSnapshot(first.session, { dataset: corrected, observedAt: now + 2 });
    expect(next.event?.sequence).toBe(2); expect(next.event?.observation?.correction).toBe(true);
    alert = processAlertEvent(alert, requireEvent(next.event)).alert;
    expect(alert.history).toEqual([]); expect(alert.lastValue).toBe(11);
    const level = processAlertEvent(createLocalAlert(definition(next.session, corrected, 'every-time', { kind: 'greater', value: 10 })), requireEvent(next.event));
    expect(level.notification?.observation?.sourceRevision).toBe('r2'); expect(level.notification?.observation?.correction).toBe(true);
  });
  it('evaluates an unchanged snapshot only on an explicit request and records that reason', () => {
    const data = dataset([11]), first = observeAlertSnapshot(session(data), { dataset: data, observedAt: now });
    const late = createLocalAlert({ ...definition(first.session, data, 'only-once', { kind: 'greater', value: 10 }), createdAt: now + 5 });
    expect(processAlertEvent(late, requireEvent(first.event)).notification).toBeNull();
    expect(observeAlertSnapshot(first.session, { dataset: data, observedAt: now + 5 }).event).toBeNull();
    const requested = observeAlertSnapshot(first.session, { dataset: data, observedAt: now + 5, reason: 'explicit-evaluation' });
    expect(requested.event?.sequence).toBe(2); expect(requested.event?.barClosed).toBe(false);
    expect(requested.event?.observation).toMatchObject({ reason: 'explicit-evaluation', correction: false, sourceAvailableAt: null, completion: 'unknown' });
    expect(processAlertEvent(late, requireEvent(requested.event)).notification?.value).toBe(11);
    expect(observeAlertSnapshot(requested.session, { dataset: data, observedAt: now + 6 }).event).toBeNull();
  });
  it('advances deduplicated heartbeat time but clears baselines on an unchanged post-sleep observation', () => {
    const one = dataset([9]), first = observeAlertSnapshot(session(one), { dataset: one, observedAt: now });
    expect(() => createLocalAlert({ ...definition(first.session, one), maxGapSeconds: 60 })).toThrow('Snapshot sessions own observation continuity');
    let state = first.session, alert = processAlertEvent(createLocalAlert(definition(state, one)), requireEvent(first.event)).alert;
    for (let seconds = 10; seconds <= 90; seconds += 10) { const poll = observeAlertSnapshot(state, { dataset: one, observedAt: now + seconds }); expect(poll.event).toBeNull(); state = poll.session; }
    expect(state.sequence).toBe(1); expect(state.lastObservedAt).toBe(now + 90);
    const next = observeAlertSnapshot(state, { dataset: dataset([9, 11]), observedAt: now + 91 });
    expect(next.event?.observation?.continuity).toBe('continuous'); expect(processAlertEvent(alert, requireEvent(next.event)).notification?.value).toBe(11);
    const slept = observeAlertSnapshot(first.session, { dataset: one, observedAt: now + 61 });
    expect(slept.event?.observation?.continuity).toBe('gap'); expect(slept.event?.value).toBe(9);
    alert = processAlertEvent(alert, requireEvent(slept.event)).alert; expect(alert.missedDataGaps).toBe(1); expect(alert.history).toEqual([]);
  });
  it('compares successive supplied values while preserving unknown completion and gap behavior', () => {
    const one = dataset([9]), first = observeAlertSnapshot(session(one), { dataset: one, observedAt: now });
    const alert = processAlertEvent(createLocalAlert(definition(first.session, one)), requireEvent(first.event)).alert;
    const two = dataset([9, 11]), next = observeAlertSnapshot(first.session, { dataset: two, observedAt: now + 1 });
    expect(processAlertEvent(alert, requireEvent(next.event)).notification?.value).toBe(11);
    const afterSleep = observeAlertSnapshot(first.session, { dataset: two, observedAt: now + 61 });
    expect(afterSleep.event?.observation?.continuity).toBe('gap');
    const resumed = processAlertEvent(alert, requireEvent(afterSleep.event));
    expect(resumed.notification).toBeNull(); expect(resumed.alert.missedDataGaps).toBe(1);
    expect(resumed.alert.closedBars).toEqual([]);
  });
  it('rejects fake completion/publication, future source times and backward local observations', () => {
    const data = dataset([11]), first = observeAlertSnapshot(session(data), { dataset: data, observedAt: now });
    const alert = createLocalAlert(definition(first.session, data, 'once-per-bar-close', { kind: 'greater', value: 10 }));
    const event = requireEvent(first.event);
    expect(processAlertEvent(alert, { ...event, barClosed: true }).notification).toBeNull();
    const fake = structuredClone(event); fake.observation!.sourceAvailableAt = day as never;
    expect(processAlertEvent(alert, fake).alert).toBe(alert);
    expect(observeAlertSnapshot(first.session, { dataset: data, observedAt: now - 1 }).event).toBeNull();
    data.bars[0].time = now + 1;
    expect(observeAlertSnapshot(session(data), { dataset: data, observedAt: now }).diagnostics[0]).toContain('future');
  });
  it('expires paused alerts with no price event and retains the true observation history clock', () => {
    const data = dataset([11]), state = session(data);
    const alert = setLocalAlertPaused(createLocalAlert({ ...definition(state, data), expiresAt: now + 10 }), true);
    expect(advanceLocalAlertClock(alert, now + 9)).toBe(alert);
    const expired = advanceLocalAlertClock(alert, now + 10);
    expect(expired.status).toBe('expired'); expect(expired.lastTime).toBeNull(); expect(expired.history).toEqual([]);
  });
});

describe('replay, source and immutable calculation-prefix isolation', () => {
  it('requires explicit replay completion and cannot trigger an ordinary alert', () => {
    const data = dataset(), replay = session(data, { sessionId: 'replay-session', mode: 'replay', replayRunId: 'seek-1', assumeReplayCompletion: true });
    const first = observeAlertSnapshot(replay, { dataset: data, observedAt: now, barIndex: 0, replayRunId: 'seek-1' });
    let alert = processAlertEvent(createLocalAlert(definition(replay, data, 'once-per-bar-close')), requireEvent(first.event)).alert;
    const next = observeAlertSnapshot(first.session, { dataset: data, observedAt: now + 1, barIndex: 1, replayRunId: 'seek-1' });
    expect(next.event?.barClosed).toBe(true); expect(next.event?.observation?.completion).toBe('simulated-complete');
    expect(processAlertEvent(alert, requireEvent(next.event)).notification?.value).toBe(11);
    const ordinary = createLocalAlert(definition(session(data), data, 'once-per-bar-close'));
    expect(processAlertEvent(ordinary, requireEvent(next.event)).alert).toBe(ordinary);
    const unknown = session(data, { sessionId: 'unassumed', mode: 'replay', replayRunId: 'seek-1' });
    expect(observeAlertSnapshot(unknown, { dataset: data, observedAt: now, barIndex: 0, replayRunId: 'seek-1' }).event?.barClosed).toBe(false);
    expect(() => session(data, { assumeReplayCompletion: true })).toThrow();
  });
  it('refuses changed replay runs, revision corrections, retrospective navigation and wrong sources', () => {
    const data = dataset(), state = session(data, { mode: 'replay', replayRunId: 'seek-1' });
    const first = observeAlertSnapshot(state, { dataset: data, observedAt: now, barIndex: 1, replayRunId: 'seek-1' });
    expect(observeAlertSnapshot(first.session, { dataset: data, observedAt: now + 1, barIndex: 2, replayRunId: 'seek-2' }).event).toBeNull();
    expect(observeAlertSnapshot(first.session, { dataset: data, observedAt: now + 1, barIndex: 0, replayRunId: 'seek-1' }).event).toBeNull();
    const revised = structuredClone(data); revised.provenance.revision = 'r2';
    expect(observeAlertSnapshot(state, { dataset: revised, observedAt: now, barIndex: 0, replayRunId: 'seek-1' }).diagnostics[0]).toContain('revision');
    const other = structuredClone(data); other.provenance.providerId = 'another-provider';
    expect(observeAlertSnapshot(state, { dataset: other, observedAt: now, barIndex: 0, replayRunId: 'seek-1' }).diagnostics[0]).toContain('another exact source');
    expect(observeAlertSnapshot(session(data), { dataset: data, observedAt: now, barIndex: 0 }).event).toBeNull();
  });
  it('rejects another replay seek downstream even if the caller reused its session nonce', () => {
    const data = dataset([11]), original = session(data, { sessionId: 'reused', mode: 'replay', replayRunId: 'seek-1', assumeReplayCompletion: true });
    const alert = createLocalAlert(definition(original, data, 'once-per-bar-close', { kind: 'greater', value: 10 }));
    const other = session(data, { sessionId: 'reused', mode: 'replay', replayRunId: 'seek-2', assumeReplayCompletion: true });
    const event = requireEvent(observeAlertSnapshot(other, { dataset: data, observedAt: now, replayRunId: 'seek-2', barIndex: 0 }).event);
    const result = processAlertEvent(alert, event);
    expect(result.alert).toBe(alert); expect(result.notification).toBeNull(); expect(result.diagnostics[0]).toContain('binding differs');
  });
  it('cannot promote unknown completion or relabel synthetic data through a reused session identity', () => {
    const data = dataset([11]), unknown = session(data, { mode: 'replay', replayRunId: 'seek-1' });
    const alert = createLocalAlert(definition(unknown, data, 'once-per-bar-close', { kind: 'greater', value: 10 }));
    const simulated = session(data, { mode: 'replay', replayRunId: 'seek-1', assumeReplayCompletion: true });
    const event = requireEvent(observeAlertSnapshot(simulated, { dataset: data, observedAt: now, replayRunId: 'seek-1' }).event);
    expect(processAlertEvent(alert, event).notification).toBeNull();
    const relabeled = structuredClone(data); relabeled.provenance.fixture = true;
    expect(observeAlertSnapshot(session(data), { dataset: relabeled, observedAt: now }).diagnostics[0]).toContain('labeling changed');
    const fixture = fixtureDataset('TEST', 2), replay = session(fixture, { mode: 'replay', replayRunId: 'fixture-replay' });
    expect(alertObservationContext(replay, fixture).description).toContain('synthetic fixture');
  });
  it('never reads the replay future tail and distinguishes duplicate display timestamps by ordinal', () => {
    const data = dataset(), state = session(data, { mode: 'replay', replayRunId: 'seek-1', assumeReplayCompletion: true });
    data.bars[1].time = data.bars[0].time;
    const guarded = { ...data, bars: new Proxy(data.bars, { get(target, name, receiver) { if (name === '1' || name === '2') throw new Error('Future tail read'); return Reflect.get(target, name, receiver); } }) };
    const first = observeAlertSnapshot(state, { dataset: guarded, observedAt: now, barIndex: 0, replayRunId: 'seek-1' });
    expect(first.event?.value).toBe(9);
    const next = observeAlertSnapshot(first.session, { dataset: data, observedAt: now, barIndex: 1, replayRunId: 'seek-1' });
    expect(next.event?.barId).not.toBe(first.event?.barId); expect(next.event?.observation?.sourceTime).toBe(first.event?.observation?.sourceTime);
  });
  it('copies indicator parameters and rejects later edits, nonfinite samples or future input prefixes', () => {
    const data = dataset(), source: AlertSourceSnapshot = { kind: 'indicator', instanceId: 'sma-1', snapshotId: 'settings-1', indicator: 'SMA', plotId: 'line', inputs: { length: 2 }, inputBasis: 'standard-ohlc', transformId: 'raw' };
    const state = session(data, { mode: 'replay', replayRunId: 'seek-1', source });
    source.inputs.length = 200; expect((state.binding.source as typeof source).inputs.length).toBe(2);
    const sample = { source: state.binding.source, value: 10, informationBars: 2, informationEndIndex: 1, informationEndTime: data.bars[1].time };
    const valid = observeAlertSnapshot(state, { dataset: data, observedAt: now, barIndex: 1, replayRunId: 'seek-1', sample });
    expect(valid.event?.value).toBe(10); // Independent mean of the supplied closes 9 and 11.
    for (const changed of [{ ...sample, informationBars: 3 }, { ...sample, informationEndIndex: 2 }, { ...sample, source }, { ...sample, value: NaN }]) expect(observeAlertSnapshot(state, { dataset: data, observedAt: now, barIndex: 1, replayRunId: 'seek-1', sample: changed }).event).toBeNull();
    expect(observeAlertSnapshot(state, { dataset: data, observedAt: now, barIndex: 1, replayRunId: 'seek-1' }).diagnostics[0]).toContain('No approximate');
  });
  it('preserves observation basis across persistence and rejects cross-session or falsified history', () => {
    const data = dataset([11]), state = session(data), observed = observeAlertSnapshot(state, { dataset: data, observedAt: now });
    const alert = processAlertEvent(createLocalAlert(definition(state, data, 'every-time', { kind: 'greater', value: 10 })), requireEvent(observed.event)).alert;
    expect(restoreLocalAlerts(JSON.parse(JSON.stringify([alert])))).toEqual([alert]);
    const restarted = session(data, { sessionId: 'fresh-restart' }), newEvent = requireEvent(observeAlertSnapshot(restarted, { dataset: data, observedAt: now + 1 }).event);
    expect(processAlertEvent(alert, newEvent).alert).toBe(alert);
    for (const mutation of [(copy: typeof alert) => { copy.history[0].observation!.sourceAvailableAt = day as never; }, (copy: typeof alert) => { copy.lastObservation!.observedAt++; }, (copy: typeof alert) => { copy.history[0].observation!.binding.datasetKey = JSON.stringify(['x']); }]) {
      const copy = structuredClone(alert); mutation(copy); expect(validateLocalAlerts([copy]).ok).toBe(false);
    }
  });
});
