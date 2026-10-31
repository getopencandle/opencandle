// Step back (REPLAY.REWIND backseek) and the start-point menu in the
// replay session model. SYNTHETIC rows; unit tests, not GUI evidence.
import { describe, expect, it } from 'vitest';
import { fixtureDataset, fixtureInstrument } from '../../src/domain/fixtures';
import type { Bar, BarDataset } from '../../src/domain/types';
import {
  REPLAY_START_POINTS_LV, barCloseTime, jumpReplayToRealtime, openReplay, replayCanStepBack, replayChartFrame, replayStartPointTime, replayTimeline,
  selectReplayStart, setReplaySessionPlaying, startReplayAt, stepBackReplaySession, stepReplaySession, type ReplayParticipant,
} from '../../src/domain/replay-session';

const T0 = Date.UTC(2024, 0, 1) / 1000, DAY = 86400;
function synthetic(count: number, step = DAY, resolution = '1D'): BarDataset {
  const instrument = fixtureInstrument('RSB'), bars: Bar[] = [];
  for (let index = 0; index < count; index++) { const base = 100 + index; bars.push({ time: T0 + index * step, open: base, high: base + 2, low: base - 1, close: base + 1, volume: 10 + index }); }
  return { instrument, bars, resolution, provenance: { ...fixtureDataset('RSB', 1).provenance, datasetId: `test:RSB:${resolution}`, revision: '1', coverage: 'synthetic test rows' } };
}
function participant(dataset: BarDataset): ReplayParticipant {
  return { cellId: 'c1', instrumentId: dataset.instrument.id, symbol: 'RSB', interval: dataset.resolution, chartType: 'candles', datasetId: dataset.provenance.datasetId, revision: '1' };
}
const chart = synthetic(20), timeline = replayTimeline([chart]);
const selecting = openReplay({ participants: [participant(chart)], activeCellId: 'c1', sessionId: 'rsb' });
const at = (index: number) => selectReplayStart(selecting, chart, chart.bars[index].time, '1D');

describe(' step back (REPLAY.REWIND)', () => {
  it('moves the clock back exactly one replay step and hides the bar that was last revealed', () => {
    const active = at(9), back = stepBackReplaySession(active, timeline);
    expect(active.clock).toBe(barCloseTime(chart.bars[9], '1D'));
    expect(back.clock).toBe(barCloseTime(chart.bars[8], '1D'));
    const frame = replayChartFrame(chart, back.clock!);
    expect(frame.bars.map(bar => bar.time)).toEqual(chart.bars.slice(0, 9).map(bar => bar.time));
    expect(frame.bars.some(bar => bar.time >= chart.bars[9].time)).toBe(false);
  });
  it('is a backseek: a new run identity, paused, so replay orders and the replay account of the old run are not rewound into the new one', () => {
    const playing = setReplaySessionPlaying(at(9), true, timeline), back = stepBackReplaySession(playing, timeline);
    expect(playing.playing).toBe(true);
    expect(back.playing).toBe(false); expect(back.remainderMilliseconds).toBe(0);
    expect(back.runId).not.toBe(playing.runId); expect(back.generation).toBe(playing.generation + 1);
    expect(back.sessionId).toBe(playing.sessionId); expect(back.phase).toBe('active');
  });
  it('steps back several steps, and forward then back returns to the same clock', () => {
    const active = at(9);
    expect(stepBackReplaySession(active, timeline, 3).clock).toBe(barCloseTime(chart.bars[6], '1D'));
    expect(stepBackReplaySession(stepReplaySession(active, timeline), timeline).clock).toBe(active.clock);
  });
  it('refuses at the first bar of the loaded history and reports it through replayCanStepBack', () => {
    const first = at(0);
    expect(replayCanStepBack(first, timeline)).toBe(false); expect(replayCanStepBack(at(1), timeline)).toBe(true);
    expect(() => stepBackReplaySession(first, timeline)).toThrow(/first bar/);
    expect(stepBackReplaySession(at(2), timeline, 99).clock).toBe(barCloseTime(chart.bars[0], '1D'));
  });
  it('needs an active replay with a chosen bar and a positive whole step count', () => {
    expect(replayCanStepBack(selecting, timeline)).toBe(false); expect(replayCanStepBack(null, timeline)).toBe(false);
    expect(() => stepBackReplaySession(selecting, timeline)).toThrow(/start bar/);
    const realtime = jumpReplayToRealtime(at(5)).session; expect(replayCanStepBack(realtime, timeline)).toBe(false);
    expect(() => stepBackReplaySession(at(5), timeline, 0)).toThrow(RangeError); expect(() => stepBackReplaySession(at(5), timeline, 1.5)).toThrow(RangeError);
  });
});

describe(' start-point menu (REPLAY.GOTO, REPLAY.START_CLICK)', () => {
  it('lists Select date, First available date and Random bar in that order', () => {
    expect(REPLAY_START_POINTS_LV.map(row => row.label)).toEqual(['Select date', 'First available date', 'Random bar']);
    expect(REPLAY_START_POINTS_LV.map(row => row.kind)).toEqual(['date', 'first', 'random']);
  });
  it('First available date reveals only the first completed bar', () => {
    expect(replayStartPointTime(chart, { kind: 'first' })).toEqual({ ok: true, index: 0, time: chart.bars[0].time });
    const started = startReplayAt(selecting, chart, { kind: 'first' }, '1D');
    expect(started.phase).toBe('active'); expect(started.clock).toBe(barCloseTime(chart.bars[0], '1D'));
    expect(replayChartFrame(chart, started.clock!).bars).toHaveLength(1);
  });
  it('Random bar draws from the completed bars and always leaves at least one step to replay', () => {
    expect(replayStartPointTime(chart, { kind: 'random' }, () => 0)).toEqual({ ok: true, index: 0, time: chart.bars[0].time });
    expect(replayStartPointTime(chart, { kind: 'random' }, () => 0.5)).toEqual({ ok: true, index: 9, time: chart.bars[9].time });
    const last = replayStartPointTime(chart, { kind: 'random' }, () => 0.999999);
    expect(last).toEqual({ ok: true, index: 18, time: chart.bars[18].time });
    for (const value of [-1, 1, 7, Number.NaN]) { const row = replayStartPointTime(chart, { kind: 'random' }, () => value); expect(row.ok && row.index >= 0 && row.index <= 18).toBe(true); }
    const started = startReplayAt(selecting, chart, { kind: 'random' }, '1D', () => 0.5);
    expect(started.clock).toBe(barCloseTime(chart.bars[9], '1D'));
    expect(stepReplaySession(started, timeline).clock).toBeGreaterThan(started.clock!);
  });
  it('Select date makes the bar containing the chosen time the last revealed bar, like a click', () => {
    const noon = chart.bars[4].time + DAY / 2;
    expect(replayStartPointTime(chart, { kind: 'date', time: noon })).toEqual({ ok: true, index: 4, time: chart.bars[4].time });
    expect(startReplayAt(selecting, chart, { kind: 'date', time: noon }, '1D').clock).toBe(selectReplayStart(selecting, chart, noon, '1D').clock);
  });
  it('Select date outside the loaded history is refused with a plain reason, never clamped', () => {
    expect(replayStartPointTime(chart, { kind: 'date', time: T0 - DAY })).toEqual({ ok: false, reason: 'The chosen date is outside the loaded history.' });
    expect(replayStartPointTime(chart, { kind: 'date', time: T0 + 40 * DAY })).toEqual({ ok: false, reason: 'The chosen date is outside the loaded history.' });
    expect(replayStartPointTime(chart, { kind: 'date', time: Number.NaN }).ok).toBe(false);
    expect(() => startReplayAt(selecting, chart, { kind: 'date', time: T0 - DAY }, '1D')).toThrow('The chosen date is outside the loaded history.');
  });
  it('works while a replay exists (Go to): every new start is a new run, paused', () => {
    const active = setReplaySessionPlaying(at(12), true, timeline), moved = startReplayAt(active, chart, { kind: 'first' }, '1D');
    expect(moved.clock).toBe(barCloseTime(chart.bars[0], '1D')); expect(moved.runId).not.toBe(active.runId); expect(moved.playing).toBe(false);
  });
  it('an empty or one-bar history: no start on empty, the single bar for first and random', () => {
    const empty = { ...chart, bars: [] }, one = { ...chart, bars: chart.bars.slice(0, 1) };
    for (const kind of ['first', 'random'] as const) expect(replayStartPointTime(empty, { kind })).toEqual({ ok: false, reason: 'The chart has no history to replay.' });
    expect(replayStartPointTime(one, { kind: 'random' }, () => 0.9)).toEqual({ ok: true, index: 0, time: chart.bars[0].time });
  });
});
