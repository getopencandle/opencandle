// RPST replay lane: session model, interval menu and the no-lookahead boundary (unit tests, not GUI evidence).
import { describe, expect, it } from 'vitest';
import { fixtureDataset, fixtureInstrument } from '../../src/domain/fixtures';
import { calculateIndicator } from '../../src/domain/indicators';
import type { Bar, BarDataset } from '../../src/domain/types';
import { chooseReplayInterval, replayIntervalDivides, replayIntervalMenu, resolveReplayStepSource } from '../../src/domain/replay-intervals';
import {
  advanceReplaySession, barCloseTime, beginReplayStartSelection, bucketStart, closeReplay, continueReplaySession, jumpReplayToRealtime, openReplay,
  readReplaySavedSession, replayAlertCreation, replayAlertEvaluationBasis, replayChartFrame, replayChartTypeSupport, replayDataWindowBar,
  replayDrawingApplicability, replayPaperRouting, replayParticipantSupport, replayRestoreLayout, replayShortcut, replayStartCandidate,
  replayStateForChart, replayTimeline, selectReplayStart, setReplayScope, setReplaySessionInterval, setReplaySessionPlaying, setReplaySessionSpeed,
  stepReplaySession, type ReplayParticipant,
} from '../../src/domain/replay-session';

const T0 = Date.UTC(2024, 0, 1) / 1000; // Monday 2024-01-01 00:00 UTC
function synthetic(symbol: string, resolution: string, step: number, count: number, start = T0, datasetSuffix = resolution): BarDataset {
  const instrument = fixtureInstrument(symbol), bars: Bar[] = [];
  for (let index = 0; index < count; index++) { const base = 100 + index; bars.push({ time: start + index * step, open: base, high: base + 2, low: base - 1, close: base + 1, volume: 10 + index }); }
  return { instrument, bars, resolution, provenance: { ...fixtureDataset(symbol, 1).provenance, datasetId: `test:${symbol}:${datasetSuffix}`, revision: '1', coverage: 'synthetic test rows' } };
}
function participant(dataset: BarDataset, cellId = 'c1', chartType = 'candles'): ReplayParticipant {
  return { cellId, instrumentId: dataset.instrument.id, symbol: dataset.instrument.symbol, interval: dataset.resolution, chartType, datasetId: dataset.provenance.datasetId, revision: dataset.provenance.revision };
}
const keyBase = { shiftKey: true, ctrlKey: false, altKey: false, metaKey: false, isComposing: false, focus: 'chart' as const };

describe('RPST replay no-lookahead boundary (REPLAY.START_CLICK, REPLAY.REWIND, DATA.REPLAY)', () => {
  it('indicators and the data window see only revealed bars; future edits never change replay output', () => {
    const chart = synthetic('NLA', '1h', 3600, 60);
    let session = openReplay({ participants: [participant(chart)], activeCellId: 'c1', sessionId: 's' });
    session = selectReplayStart(session, chart, chart.bars[19].time + 60, '1h');
    const frame = replayChartFrame(chart, session.clock!);
    expect(frame.bars).toHaveLength(20); expect(frame.bars.at(-1)).toEqual(chart.bars[19]); expect(frame.partial).toBe(false);
    const sma = calculateIndicator('sma', frame.bars, { length: 5 }).series;
    expect(sma).toEqual(calculateIndicator('sma', chart.bars.slice(0, 20), { length: 5 }).series);
    for (let index = 20; index < chart.bars.length; index++) Object.assign(chart.bars[index], { open: 1e6, high: 1e6, low: 1e6, close: 1e6 });
    const again = replayChartFrame(chart, session.clock!);
    expect(again.bars).toEqual(frame.bars);
    expect(calculateIndicator('sma', again.bars, { length: 5 }).series).toEqual(sma);
    expect(replayDataWindowBar(again, chart.bars[25].time)).toBeNull();
    expect(replayDataWindowBar(again, chart.bars[19].time)?.close).toBe(120);
    again.bars[0].close = -1; expect(chart.bars[0].close).toBe(101);
  });
  it('the forming coarser bar is built from revealed step bars only, never from the future chart row', () => {
    const minutes = synthetic('PART', '1m', 60, 180), hourly = synthetic('PART', '1h', 3600, 3, T0, '1h');
    hourly.bars[1] = { ...hourly.bars[1], open: 9e9, high: 9e9, low: -9e9, close: 9e9, volume: 9e9 };
    const clock = T0 + 3600 + 25 * 60; // 25 one-minute steps into the second hour
    const frame = replayChartFrame(hourly, clock, minutes);
    expect(frame.completeBars).toBe(1); expect(frame.partial).toBe(true); expect(frame.bars).toHaveLength(2);
    const revealed = minutes.bars.slice(60, 85), forming = frame.bars[1];
    expect(forming).toEqual({ time: T0 + 3600, open: revealed[0].open, high: Math.max(...revealed.map(b => b.high)), low: Math.min(...revealed.map(b => b.low)), close: revealed.at(-1)!.close, volume: revealed.reduce((s, b) => s + b.volume, 0) });
    minutes.bars[100].close = 5e9; expect(replayChartFrame(hourly, clock, minutes)).toEqual(frame);
  });
  it('projects onto ReplayState with the session run identity for prefix hosts', () => {
    const chart = fixtureDataset('PROJ', 40);
    let session = openReplay({ participants: [participant(chart)], activeCellId: 'c1', sessionId: 'p' });
    session = selectReplayStart(session, chart, chart.bars[9].time, '1D');
    const state = replayStateForChart(session, chart);
    expect(state.cursor).toBe(9); expect(state.runId).toBe(session.runId); expect(state.totalBars).toBe(40);
    expect(() => replayStateForChart(session, { ...chart, provenance: { ...chart.provenance, revision: '2' } })).toThrow();
  });
});

describe('RPST open, start selection, step, play and speed (REPLAY.OPEN/START_CLICK/GOTO/STEP/PLAY/PAUSE/SPEED)', () => {
  it('Replay opens start selection; the scissors candidate snaps to the bar under the pointer', () => {
    const chart = synthetic('OPEN', '1h', 3600, 10);
    const session = openReplay({ participants: [participant(chart)], activeCellId: 'c1', sessionId: 'o' });
    expect(session.phase).toBe('selecting-start'); expect(session.clock).toBeNull(); expect(session.playing).toBe(false);
    expect(replayStartCandidate(chart, chart.bars[3].time + 1800)).toEqual({ ok: true, index: 3, time: chart.bars[3].time });
    expect(replayStartCandidate(chart, chart.bars[0].time - 1).ok).toBe(false);
    expect(replayStartCandidate(chart, chart.bars[9].time + 3600).ok).toBe(false);
    expect(() => selectReplayStart(session, chart, chart.bars[0].time - 1, '1h')).toThrow('inside the loaded history');
  });
  it('Go to: choosing a different start creates a new run identity and pauses', () => {
    const chart = synthetic('GOTO', '1h', 3600, 30), timeline = replayTimeline([chart]);
    let session = selectReplayStart(openReplay({ participants: [participant(chart)], activeCellId: 'c1', sessionId: 'g' }), chart, chart.bars[5].time, '1h');
    const first = session.runId; session = setReplaySessionPlaying(session, true, timeline); expect(session.playing).toBe(true);
    session = selectReplayStart(beginReplayStartSelection(session), chart, chart.bars[2].time, '1h');
    expect(session.runId).not.toBe(first); expect(session.playing).toBe(false); expect(session.clock).toBe(chart.bars[2].time + 3600);
  });
  it('steps exactly one replay interval, plays at the chosen speed, pauses and stops at the end', () => {
    const chart = synthetic('STEP', '1m', 60, 10), timeline = replayTimeline([chart]);
    let session = selectReplayStart(openReplay({ participants: [participant(chart)], activeCellId: 'c1', sessionId: 'st' }), chart, chart.bars[2].time, '1m');
    session = stepReplaySession(session, timeline); expect(replayChartFrame(chart, session.clock!).bars).toHaveLength(4);
    session = setReplaySessionSpeed(setReplaySessionPlaying(session, true, timeline), 1); // 2x left the catalog
    session = advanceReplaySession(session, 400, timeline); expect(replayChartFrame(chart, session.clock!).bars).toHaveLength(4);
    session = advanceReplaySession(session, 600, timeline); expect(replayChartFrame(chart, session.clock!).bars).toHaveLength(5); expect(session.remainderMilliseconds).toBe(0);
    session = setReplaySessionSpeed(session, 10); expect(session.playing).toBe(true);
    const paused = setReplaySessionPlaying(session, false, timeline); expect(paused.clock).toBe(session.clock); expect(paused.runId).toBe(session.runId);
    session = advanceReplaySession(session, 10000, timeline); expect(session.clock).toBe(timeline.at(-1)); expect(session.playing).toBe(false);
    expect(setReplaySessionPlaying(session, true, timeline).playing).toBe(false);
    expect(() => setReplaySessionSpeed(session, 2)).toThrow(); expect(() => stepReplaySession(session, timeline, 0)).toThrow();
  });
  it('weekend gaps step to the next supplied bar, not to an empty clock slot', () => {
    const daily = fixtureDataset('GAP', 10), timeline = replayTimeline([daily]); // weekday-only fixture
    let session = selectReplayStart(openReplay({ participants: [participant(daily)], activeCellId: 'c1', sessionId: 'w' }), daily, daily.bars[3].time, '1D');
    session = stepReplaySession(session, timeline); expect(replayChartFrame(daily, session.clock!).bars.at(-1)).toEqual(daily.bars[4]);
  });
});

describe('RPST interval menu (REPLAY.INTERVAL.*)', () => {
  const minute = synthetic('INT', '1m', 60, 600), five = synthetic('INT', '5m', 300, 120), hour = synthetic('INT', '1h', 3600, 10);
  it('divisibility follows chart boundaries; weekly/monthly accept one-day or day-dividing steps', () => {
    expect(replayIntervalDivides('5m', '1h')).toBe(true); expect(replayIntervalDivides('45m', '1h')).toBe(false); expect(replayIntervalDivides('1h', '5m')).toBe(false);
    expect(replayIntervalDivides('1D', '1W')).toBe(true); expect(replayIntervalDivides('2D', '1W')).toBe(false); expect(replayIntervalDivides('1D', '1M')).toBe(true);
    expect(replayIntervalDivides('1h', '1W')).toBe(true); expect(replayIntervalDivides('1W', '1W')).toBe(true); expect(replayIntervalDivides('1W', '1M')).toBe(false);
    expect(replayIntervalDivides('1T', '1h')).toBe(false); expect(replayIntervalDivides('7m', '1D')).toBe(false);
  });
  it('options require actual data at or below the interval: no seconds without second data (SECONDS), no minutes without minute data (INTRADAY)', () => {
    const menu = replayIntervalMenu([{ cellId: 'c1', instrumentId: hour.instrument.id, interval: '1h' }], [minute, hour]);
    const option = (id: string) => menu.options.find(row => row.id === id)!;
    expect(option('1s').available).toBe(false); expect(option('1s').reason).toContain('second data');
    expect(option('1m').available).toBe(true); expect(option('5m').available).toBe(true); expect(option('60m').available).toBe(true);
    expect(option('45m').available).toBe(false); expect(option('45m').reason).toContain('does not divide');
    expect(menu.auto).toMatchObject({ id: '60m' });
    const hourOnly = replayIntervalMenu([{ cellId: 'c1', instrumentId: hour.instrument.id, interval: '1h' }], [hour]);
    expect(hourOnly.options.find(row => row.id === '1m')!.reason).toContain('minute');
    expect(chooseReplayInterval(hourOnly, '1m')).toMatchObject({ ok: false }); expect(chooseReplayInterval(menu, '5m')).toEqual({ ok: true, id: '5m' });
  });
  it('Auto: one chart uses its interval; several charts use the largest common supported interval', () => {
    const other = synthetic('OTH', '15m', 900, 40), otherMinute = synthetic('OTH', '1m', 60, 600, T0, '1m');
    const menu = replayIntervalMenu([{ cellId: 'a', instrumentId: hour.instrument.id, interval: '1h' }, { cellId: 'b', instrumentId: other.instrument.id, interval: '15m' }], [minute, five, hour, other, otherMinute]);
    expect(menu.auto.id).toBe('15m'); expect(menu.options.find(row => row.id === '30m')!.available).toBe(false);
  });
  it('weekly and monthly charts replay in one-day steps when daily data exists; otherwise a labelled whole-bar fallback', () => {
    const daily = fixtureDataset('WK', 60), weekly: BarDataset = { ...synthetic('WK', '1W', 7 * 86400, 8), instrument: daily.instrument };
    const withDaily = replayIntervalMenu([{ cellId: 'c1', instrumentId: daily.instrument.id, interval: '1W' }], [daily, weekly]);
    expect(withDaily.auto).toMatchObject({ id: '1D' });
    const weeklyOnly = replayIntervalMenu([{ cellId: 'c1', instrumentId: daily.instrument.id, interval: '1W' }], [weekly]);
    expect(weeklyOnly.auto.id).toBe('1W'); expect(weeklyOnly.auto.reason).toContain('OpenCandle-defined');
    const steps = resolveReplayStepSource([daily, weekly], daily.instrument.id, '1D'); expect(steps).toMatchObject({ ok: true, kind: 'exact' });
    expect(bucketStart(daily.bars[7].time, '1W') % 86400).toBe(0); expect(new Date(bucketStart(daily.bars[7].time, '1W') * 1000).getUTCDay()).toBe(1);
    expect(barCloseTime({ time: Date.UTC(2024, 0, 1) / 1000 }, '1M')).toBe(Date.UTC(2024, 1, 1) / 1000);
  });
  it('step sources are exact or built from one finer original source; never from coarser data; ambiguity is refused', () => {
    expect(resolveReplayStepSource([minute, hour], hour.instrument.id, '5m')).toMatchObject({ ok: true, kind: 'derived' });
    expect(resolveReplayStepSource([hour], hour.instrument.id, '5m')).toMatchObject({ ok: false, code: 'NO_SOURCE' });
    expect(resolveReplayStepSource([minute, five, hour], hour.instrument.id, '15m')).toMatchObject({ ok: false, code: 'AMBIGUOUS_SOURCE' });
    expect(resolveReplayStepSource([hour], hour.instrument.id, '10T')).toMatchObject({ ok: false, code: 'UNSUPPORTED' });
  });
  it('changing the interval starts a new run', () => {
    let session = selectReplayStart(openReplay({ participants: [participant(hour)], activeCellId: 'c1', sessionId: 'i' }), hour, hour.bars[2].time, '1h');
    const before = session.runId; session = setReplaySessionInterval(session, '5m', '5m');
    expect(session.interval).toBe('5m'); expect(session.runId).not.toBe(before); expect(session.clock).toBe(hour.bars[2].time + 3600);
  });
});

describe('RPST current chart, all charts, real time, close and continue (REPLAY.SINGLE/ALL/REALTIME/CLOSE/RESTORE)', () => {
  const a = synthetic('AAA', '1h', 3600, 24), b = synthetic('BBB', '15m', 900, 96), layout = [participant(a, 'a'), participant(b, 'b')];
  it('Current chart replays only the active chart; All charts shares one event clock across symbols and intervals', () => {
    const single = openReplay({ participants: layout, activeCellId: 'a', sessionId: 'x' });
    expect(single.participants.map(row => row.cellId)).toEqual(['a']);
    let all = selectReplayStart(setReplayScope(single, 'all', layout), a, a.bars[3].time, '15m');
    expect(all.participants.map(row => row.cellId)).toEqual(['a', 'b']);
    all = stepReplaySession(all, replayTimeline([a, b])); // one 15m step
    expect(all.clock).toBe(a.bars[3].time + 3600 + 900);
    const fa = replayChartFrame(a, all.clock!, b.instrument.id === a.instrument.id ? b : null), fb = replayChartFrame(b, all.clock!);
    expect(fa.bars.at(-1)!.time).toBe(a.bars[3].time); expect(fb.bars.at(-1)!.time + 900).toBe(all.clock);
    expect(fb.bars.every(bar => bar.time + 900 <= all.clock!)).toBe(true);
  });
  it('Jump to real time ends the run without merging replay account state', () => {
    let session = selectReplayStart(openReplay({ participants: layout, activeCellId: 'a', sessionId: 'r' }), a, a.bars[3].time, '1h');
    const result = jumpReplayToRealtime(session);
    expect(result).toMatchObject({ endedRunId: session.runId, mergedIntoOrdinary: false }); expect(result.session.phase).toBe('realtime'); expect(result.session.clock).toBeNull();
    expect(result.session.runId).not.toBe(session.runId);
    expect(replayPaperRouting(result.session, 'replay-trading').account).toBe('ordinary');
    session = result.session; expect(replayShortcut({ ...keyBase, key: 'ArrowRight' }, session)).toBeNull();
  });
  it('Close remembers the session; Continue restores symbols, intervals, last bar and state paused under a new run; chart type is not saved', () => {
    let session = selectReplayStart(setReplayScope(openReplay({ participants: layout, activeCellId: 'a', sessionId: 'k' }), 'all', layout), a, a.bars[5].time, '15m');
    session = setReplaySessionSpeed(session, 5);
    const closed = closeReplay(session, 1700000000); expect(closed.endedRunId).toBe(session.runId);
    const saved = readReplaySavedSession(JSON.parse(JSON.stringify(closed.saved)));
    expect(JSON.stringify(saved)).not.toContain('candles');
    expect(replayRestoreLayout(saved)).toEqual([{ cellId: 'a', symbol: 'AAA', interval: '60m', datasetId: a.provenance.datasetId }, { cellId: 'b', symbol: 'BBB', interval: '15m', datasetId: b.provenance.datasetId }]);
    const restored = continueReplaySession(saved, [a, b], { a: 'line', b: 'bars' }, '15m');
    expect(restored).toMatchObject({ phase: 'active', scope: 'all', clock: session.clock, stepsPerSecond: 5, playing: false, interval: '15m' });
    expect(restored.participants.map(row => row.chartType)).toEqual(['line', 'bars']); expect(restored.runId).not.toBe(session.runId);
    expect(() => continueReplaySession(saved, [a], {}, '15m')).toThrow('no longer loaded');
    expect(() => continueReplaySession(saved, [a, { ...b, provenance: { ...b.provenance, revision: '9' } }], {}, '15m')).toThrow('revised');
    expect(() => readReplaySavedSession({ ...saved, extra: 1 })).toThrow(); expect(() => readReplaySavedSession({ ...saved, stepsPerSecond: 4 })).toThrow();
    expect(closeReplay(openReplay({ participants: layout, activeCellId: 'a' }), 1).saved).toBeNull();
  });
});

describe('RPST shortcuts, unsupported types, drawings and isolation', () => {
  const chart = synthetic('KEY', '1h', 3600, 10);
  const active = selectReplayStart(openReplay({ participants: [participant(chart)], activeCellId: 'c1', sessionId: 'kb' }), chart, chart.bars[2].time, '1h');
  it('Shift+Down toggles playback and Shift+Right steps only with chart focus; editors, inputs and IME are protected', () => {
    expect(replayShortcut({ ...keyBase, key: 'ArrowDown' }, active)).toBe('toggle-play');
    expect(replayShortcut({ ...keyBase, key: 'ArrowRight' }, active)).toBe('step');
    for (const focus of ['editor', 'text-input', 'dialog', 'other'] as const) expect(replayShortcut({ ...keyBase, key: 'ArrowRight', focus }, active)).toBeNull();
    expect(replayShortcut({ ...keyBase, key: 'ArrowRight', isComposing: true }, active)).toBeNull();
    expect(replayShortcut({ ...keyBase, key: 'ArrowRight', shiftKey: false }, active)).toBeNull();
    expect(replayShortcut({ ...keyBase, key: 'ArrowRight', ctrlKey: true }, active)).toBeNull();
    expect(replayShortcut({ ...keyBase, key: 'ArrowRight' }, null)).toBeNull();
    expect(replayShortcut({ ...keyBase, key: 'ArrowDown' }, beginReplayStartSelection(active))).toBeNull();
  });
  it('Footprint, TPO, spreads and tick charts are refused, never emulated; OpenCandle replays its derived types (IND-REPLAY-1028)', () => {
    for (const type of ['footprint', 'tpo']) expect(replayChartTypeSupport(type).supported).toBe(false);
    for (const type of ['candles', 'bars', 'line', 'heikinashi', 'hollow', 'renko', 'kagi', 'pointfigure', 'range', 'linebreak']) expect(replayChartTypeSupport(type).supported).toBe(true);
    expect(() => openReplay({ participants: [participant(chart, 'c1', 'footprint')], activeCellId: 'c1' })).toThrow('Volume footprint');
    expect(openReplay({ participants: [participant(chart, 'c1', 'range')], activeCellId: 'c1' }).phase).toBe('selecting-start');
    expect(replayParticipantSupport({ chartType: 'candles', symbol: 'AAPL/MSFT', interval: '1h' }).supported).toBe(false);
    expect(replayParticipantSupport({ chartType: 'candles', symbol: 'BRK-B', interval: '1h' }).supported).toBe(true);
    expect(replayParticipantSupport({ chartType: 'candles', symbol: 'AAPL', interval: '100T' }).supported).toBe(false);
  });
  it('Regression trend and Fixed range volume profile are inactive; other tools stay available', () => {
    expect(replayDrawingApplicability('DW.CHANNEL.REGRESSION_TREND').active).toBe(false);
    expect(replayDrawingApplicability('LineToolFixedRangeVolumeProfile').active).toBe(false);
    expect(replayDrawingApplicability('DW.LINES.TREND_LINE').active).toBe(true);
  });
  it('normal Paper and quote lists use current data; replay trading is a separate labelled run account', () => {
    expect(replayPaperRouting(active, 'paper-panel')).toEqual({ account: 'ordinary', runId: null, label: 'Paper Trading (current data)' });
    expect(replayPaperRouting(active, 'quote-list').account).toBe('ordinary');
    expect(replayPaperRouting(active, 'replay-trading')).toEqual({ account: 'replay', runId: active.runId, label: 'Replay trading (separate replay account)' });
  });
  it('existing live alerts keep the live basis; new ordinary alerts are unavailable during replay', () => {
    expect(replayAlertCreation(active, 'ordinary').allowed).toBe(false); expect(replayAlertCreation(null, 'ordinary')).toEqual({ allowed: true, runId: 'ordinary' });
    expect(replayAlertCreation(active, 'replay')).toEqual({ allowed: true, runId: active.runId });
    expect(replayAlertEvaluationBasis('ordinary', 'ordinary', active)).toBe('live');
    expect(replayAlertEvaluationBasis('replay', active.runId, active)).toBe('replay');
    expect(replayAlertEvaluationBasis('replay', 'old-run', active)).toBe('skip');
  });
});
