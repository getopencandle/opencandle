// Replay and strategy review fixes: forming bars for finer replay steps,
// session-anchored forming bars, decline maximum, size bound, rejected bracket legs, no cursor -1 projection.
import { describe, expect, it } from 'vitest';
import { fixtureDataset, fixtureInstrument } from '../../src/domain/fixtures';
import type { Bar, BarDataset } from '../../src/domain/types';
import { replayPrefix } from '../../src/domain/replay';
import { openReplay, replayChartFrame, replayChartView, replayStateForChart, replayTimeline, selectReplayStart, stepReplaySession, type ReplayParticipant } from '../../src/domain/replay-session';
import { growthDeclinePeriods } from '../../src/domain/strategy-report-periods';
import { backtestStrategy } from '../../src/domain/strategy';

const T0 = Date.UTC(2024, 0, 1) / 1000, HOUR = 3600, DAY = 86400;
function synthetic(symbol: string, resolution: string, step: number, count: number, start = T0): BarDataset {
  const bars: Bar[] = [];
  for (let index = 0; index < count; index++) { const base = 100 + index; bars.push({ time: start + index * step, open: base, high: base + 2, low: base - 1, close: base + 1, volume: 10 + index }); }
  return { instrument: fixtureInstrument(symbol), bars, resolution, provenance: { ...fixtureDataset(symbol, 1).provenance, datasetId: `fix:${symbol}:${resolution}`, revision: '1', coverage: 'synthetic test rows' } };
}
const participant = (dataset: BarDataset, cellId = 'c1'): ReplayParticipant => ({ cellId, instrumentId: dataset.instrument.id, symbol: dataset.instrument.symbol, interval: dataset.resolution, chartType: 'candles', datasetId: dataset.provenance.datasetId, revision: dataset.provenance.revision });

describe('RPST-F01: a single chart replayed in finer steps shows its forming bar', () => {
  it('a daily chart in 1h steps reveals a forming daily bar after one step, built from revealed hours only', () => {
    const daily = synthetic('FIN', '1D', DAY, 10), hourly = synthetic('FIN', '1h', HOUR, 240);
    let session = openReplay({ participants: [participant(daily)], activeCellId: 'c1', sessionId: 'f01' });
    session = selectReplayStart(session, daily, daily.bars[2].time, '1h');
    session = stepReplaySession(session, replayTimeline([hourly]));
    expect(session.clock).toBe(T0 + 3 * DAY + HOUR);
    const view = replayChartView(session, daily, hourly);
    expect(view.state?.cursor).toBe(2); expect(view.frame.partial).toBe(true); expect(view.frame.bars).toHaveLength(4);
    expect(view.frame.bars[3]).toEqual({ ...hourly.bars[72], time: T0 + 3 * DAY });
    hourly.bars[73].high = 9e9; daily.bars[3].high = 9e9;
    expect(replayChartView(session, daily, hourly).frame).toEqual(view.frame);
  });
});

describe('RPST-F02: forming bars follow the chart session anchor', () => {
  it('hourly bars labelled at :30 keep a correctly labelled forming bar for the whole hour', () => {
    const hourly = synthetic('ANC', '1h', HOUR, 6, T0 + 1800), quarter = synthetic('ANC', '15m', 900, 40);
    const early = replayChartFrame(hourly, T0 + 5400 + 900, quarter);
    expect(early.completeBars).toBe(1); expect(early.partial).toBe(true); expect(early.bars[1].time).toBe(T0 + 5400);
    const later = replayChartFrame(hourly, T0 + 5400 + 2700, quarter);
    expect(later.partial).toBe(true); expect(later.bars[1].time).toBe(T0 + 5400);
    expect(later.bars[1]).toMatchObject({ open: quarter.bars[6].open, close: quarter.bars[8].close, volume: quarter.bars.slice(6, 9).reduce((sum, bar) => sum + bar.volume, 0) });
  });
});

describe('RPST-F03: the decline maximum includes the current unrecovered decline', () => {
  it('max is never below current', () => {
    const result = growthDeclinePeriods(100, 0, [{ time: 1, equity: 110 }, { time: 2, equity: 105 }, { time: 3, equity: 120 }, { time: 4, equity: 90 }]);
    expect(result.summary.decline.current).toBe(30); expect(result.summary.decline.max).toBe(30);
  });
});

describe('RPST-F04: cash and percent sizes respect the order quantity bound', () => {
  it('a resolved size above the unit cap (1e12 after RPR-3) is refused with a visible reason', () => {
    const rows: Bar[] = [0, 1, 2].map(index => ({ time: T0 + index * DAY, open: 0.01, high: 0.01, low: 0.01, close: 0.01, volume: 1 }));
    const result = backtestStrategy({ bars: rows, signals: [{ barIndex: 0, orders: [{ action: 'buy' }] }], config: { initialCapital: 1e12, defaultQuantity: { kind: 'cash', value: 1e11 } } });
    expect(result.fills).toHaveLength(0); expect(result.orders[0].status).toBe('rejected'); expect(result.orders[0].reason).toContain('resolves to 10,000,000,000,000 units at 0.01, above the 1,000,000,000,000 unit order limit');
  });
});

describe('RPST-F05: a rejected bracket leg ends its one-cancels-all group', () => {
  it('the sibling leg is cancelled and the reserved quantity is released', () => {
    // Now a shrinking position resizes bracket legs, so the rejection comes from slippage instead: the stop
    // leg's slippage-adjusted fill price is nonpositive, so it is rejected and its take profit must end with it.
    const rows: Bar[] = [[3, 3.1, 2.9, 3], [3, 3.1, 2.9, 3], [3, 3.1, 2.9, 3], [3, 3.1, 0.9, 3], [3, 3.1, 2.9, 3], [3, 3.1, 2.9, 3]].map(([open, high, low, close], index) => ({ time: T0 + index * DAY, open, high, low, close, volume: 1 }));
    const result = backtestStrategy({ bars: rows, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 10 }] }, { barIndex: 1, orders: [{ action: 'exit', id: 'A', quantity: 10, profitPrice: 10, lossPrice: 1 }] }, { barIndex: 3, orders: [{ action: 'exit', id: 'B', quantity: 10, lossPrice: 1 }] }], config: { slippageTicks: 200 } });
    expect(result.orders.find(order => order.id === 'A:loss')?.status).toBe('rejected');
    expect(result.orders.find(order => order.id === 'A:profit')).toMatchObject({ status: 'cancelled' });
    expect(result.orders.find(order => order.id === 'A:profit')?.reason).toContain('was rejected');
    expect(result.diagnostics.join(' ')).not.toContain('exit B');
    expect(result.orders.find(order => order.id === 'B:loss')?.status).toBe('working');
  });
});

describe('RPST-F06: a chart with no completed bar is never projected to cursor -1', () => {
  it('the projection refuses visibly and the view shows only the forming bar', () => {
    const hourly = synthetic('ALL', '1h', HOUR, 72), daily = synthetic('ALL', '1D', DAY, 3);
    let session = openReplay({ participants: [participant(hourly), participant(daily, 'c2')], activeCellId: 'c1', scope: 'all', sessionId: 'f06' });
    session = selectReplayStart(session, hourly, hourly.bars[5].time, '1h');
    expect(() => replayStateForChart(session, daily)).toThrow('no completed bar');
    const view = replayChartView(session, daily, hourly);
    expect(view.state).toBeNull(); expect(view.notice).toContain('no completed bar'); expect(view.frame.completeBars).toBe(0);
    expect(view.frame.bars).toHaveLength(1); expect(view.frame.bars[0].time).toBe(T0);
    const active = replayChartView(session, hourly, null);
    expect(replayPrefix(hourly, active.state!)).toHaveLength(6);
  });
});
