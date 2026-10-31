// Bar Replay across the layout. SYNTHETIC bars; unit tests, not GUI evidence.
import { describe, expect, it } from 'vitest';
import { fixtureDataset, fixtureInstrument } from '../../src/domain/fixtures';
import type { Bar, BarDataset } from '../../src/domain/types';
import { openReplay, selectReplayStart, stepReplaySession, stepBackReplaySession, jumpReplayToRealtime, type ReplayParticipant } from '../../src/domain/replay-session';
import { replayDefaultScope, replayFocusSession, replayLayoutFrames, replayLayoutParticipants, replayLayoutTimeline } from '../../src/domain/replay-layout';

const T0 = Date.UTC(2024, 0, 1) / 1000;
function synthetic(symbol: string, resolution: string, step: number, count: number): BarDataset {
  const bars: Bar[] = []; for (let index = 0; index < count; index++) bars.push({ time: T0 + index * step, open: 100 + index, high: 102 + index, low: 99 + index, close: 101 + index, volume: 10 });
  return { instrument: fixtureInstrument(symbol), bars, resolution, provenance: { ...fixtureDataset(symbol, 1).provenance, datasetId: `test:${symbol}:${resolution}`, revision: '1' } };
}
const row = (data: BarDataset, cellId: string, chartType = 'candles'): ReplayParticipant => ({ cellId, instrumentId: data.instrument.id, symbol: data.instrument.symbol, interval: data.resolution, chartType, datasetId: data.provenance.datasetId, revision: data.provenance.revision });
const hourly = synthetic('AAA', '1h', 3600, 48), quarter = synthetic('BBB', '15m', 900, 192), daily = synthetic('CCC', '1D', 86400, 2);
const universe = [hourly, quarter, daily];
const layout = [row(hourly, 'a'), row(quarter, 'b'), row(daily, 'c')];

describe(' replay across the layout', () => {
  it('starts on All charts only for a multi-chart layout with Time sync on (OpenCandle-defined default)', () => {
    expect(replayDefaultScope({ cells: [1, 2], sync: { time: true } })).toBe('all');
    expect(replayDefaultScope({ cells: [1, 2], sync: { time: false } })).toBe('current');
    expect(replayDefaultScope({ cells: [1], sync: { time: true } })).toBe('current');
    expect(replayDefaultScope(null)).toBe('current');
  });
  it('leaves live and unreplayable charts out of All charts but always keeps the active chart', () => {
    const rows = [...layout, row(hourly, 'footprint', 'footprint'), { ...row(hourly, 'live'), datasetId: 'live:alpaca-iex:AAA:1h' }];
    expect(replayLayoutParticipants(rows, 'a', id => id.startsWith('live:')).map(item => item.cellId)).toEqual(['a', 'b', 'c']);
    // A Range (or other LV derived) chart joins All charts.
    expect(replayLayoutParticipants([...layout, row(hourly, 'range', 'range')], 'a', () => false).map(item => item.cellId)).toEqual(['a', 'b', 'c', 'range']);
    expect(replayLayoutParticipants(rows, 'live', id => id.startsWith('live:')).map(item => item.cellId)).toContain('live');
  });
  it('every chart shows bars up to the one clock on its own interval; Forward, Step back and real time move all of them', () => {
    let session = openReplay({ participants: layout, activeCellId: 'a', scope: 'all', sessionId: 's' });
    session = selectReplayStart(session, hourly, hourly.bars[9].time, '15m');
    const clock = hourly.bars[10].time; expect(session.clock).toBe(clock);
    let frames = replayLayoutFrames(session, universe);
    expect(Object.keys(frames).sort()).toEqual(['b', 'c']); // the active chart is projected by the host
    expect(frames.b.at(-1)!.time + 900).toBe(clock); expect(frames.b.every(bar => bar.time + 900 <= clock)).toBe(true);
    expect(frames.c).toEqual([]); // no daily bar has closed yet
    const timeline = replayLayoutTimeline(session, universe);
    expect(timeline).toContain(quarter.bars[5].time + 900); // 15m closes of the other chart are steps too
    session = stepReplaySession(session, timeline);
    expect(session.clock).toBe(clock + 900);
    frames = replayLayoutFrames(session, universe); expect(frames.b.at(-1)!.time + 900).toBe(clock + 900);
    session = stepBackReplaySession(session, timeline);
    expect(replayLayoutFrames(session, universe).b.at(-1)!.time + 900).toBe(clock);
    expect(replayLayoutFrames(jumpReplayToRealtime(session).session, universe)).toEqual({});
  });
  it('Current chart replays the active chart only, so the other charts keep their data', () => {
    const session = selectReplayStart(openReplay({ participants: layout, activeCellId: 'a', sessionId: 's' }), hourly, hourly.bars[9].time, '1h');
    expect(replayLayoutFrames(session, universe)).toEqual({});
  });
  it('selecting another chart of an All charts replay keeps the run; Current chart or an outside chart ends it', () => {
    const all = selectReplayStart(openReplay({ participants: layout, activeCellId: 'a', scope: 'all', sessionId: 's' }), hourly, hourly.bars[9].time, '1h');
    const moved = replayFocusSession(all, 'b')!;
    expect(moved.activeCellId).toBe('b'); expect(moved.runId).toBe(all.runId); expect(moved.clock).toBe(all.clock);
    expect(Object.keys(replayLayoutFrames(moved, universe)).sort()).toEqual(['a', 'c']);
    expect(replayFocusSession(all, 'elsewhere')).toBeNull();
    const single = selectReplayStart(openReplay({ participants: layout, activeCellId: 'a', sessionId: 's' }), hourly, hourly.bars[9].time, '1h');
    expect(replayFocusSession(single, 'b')).toBeNull();
  });
});
