// RPST re-review RPR-1..RPR-4 (forming-bar labels from the opened chart row
// bracket reservation reconciliation, the unit cap, empty-frame notice wording, readable exit labels.
import { describe, expect, it } from 'vitest';
import { fixtureDataset, fixtureInstrument } from '../../src/domain/fixtures';
import type { Bar, BarDataset } from '../../src/domain/types';
import { openReplay, replayChartFrame, replayChartView, selectReplayStart, type ReplayParticipant } from '../../src/domain/replay-session';
import { backtestStrategy, MAX_ORDER_QUANTITY } from '../../src/domain/strategy';
import { buildStrategyReport } from '../../src/domain/strategy-report';

const HOUR = 3600, DAY = 86400, T0 = Date.UTC(2024, 0, 1) / 1000;
const utc = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min) / 1000;
function series(symbol: string, resolution: string, times: number[]): BarDataset {
  const bars: Bar[] = times.map((time, index) => { const base = 100 + index; return { time, open: base, high: base + 2, low: base - 1, close: base + 1, volume: 10 + index }; });
  return { instrument: fixtureInstrument(symbol), bars, resolution, provenance: { ...fixtureDataset(symbol, 1).provenance, datasetId: `r3:${symbol}:${resolution}`, revision: '1', coverage: 'synthetic test rows' } };
}
const range = (start: number, step: number, count: number) => Array.from({ length: count }, (_, index) => start + index * step);

describe('RPR-1: the forming bar is labelled by the opened chart row (time only, never its prices)', () => {
  it('DST weekend: 4h session bars keep the Monday 13:30 forming bar through the period', () => {
    const chart = series('DST', '4h', [utc(2024, 3, 8, 14, 30), utc(2024, 3, 8, 18, 30), utc(2024, 3, 11, 13, 30), utc(2024, 3, 11, 17, 30)]);
    const steps = series('DST', '1h', [...range(utc(2024, 3, 8, 14, 30), HOUR, 8), ...range(utc(2024, 3, 11, 13, 30), HOUR, 8)]);
    chart.bars[2] = { ...chart.bars[2], open: 9e9, high: 9e9, low: -9e9, close: 9e9, volume: 9e9 };
    for (const [clock, count] of [[utc(2024, 3, 11, 15, 30), 2], [utc(2024, 3, 11, 16, 30), 3]] as const) {
      const frame = replayChartFrame(chart, clock, steps), revealed = steps.bars.slice(8, 8 + count);
      expect(frame.completeBars).toBe(2); expect(frame.partial).toBe(true);
      expect(frame.bars[2]).toEqual({ time: utc(2024, 3, 11, 13, 30), open: revealed[0].open, high: Math.max(...revealed.map(b => b.high)), low: Math.min(...revealed.map(b => b.low)), close: revealed.at(-1)!.close, volume: revealed.reduce((s, b) => s + b.volume, 0) });
      expect(JSON.stringify(frame)).not.toContain('9000000000');
    }
  });
  it('lookahead: changing the opened row prices and every later row never changes the frame', () => {
    const chart = series('LKA', '1h', range(T0, HOUR, 6)), steps = series('LKA', '15m', range(T0, 900, 24)), clock = T0 + HOUR + 1800;
    const before = replayChartFrame(chart, clock, steps);
    for (const bar of chart.bars.slice(1)) Object.assign(bar, { open: 7e9, high: 7e9, low: -7e9, close: 7e9, volume: 7e9 });
    for (const bar of steps.bars.slice(6)) Object.assign(bar, { open: 5e9, high: 5e9, low: -5e9, close: 5e9, volume: 5e9 });
    expect(replayChartFrame(chart, clock, steps)).toEqual(before); expect(before.bars[1].time).toBe(T0 + HOUR);
  });
  it('first chart bar at :30 with nothing completed stays labelled 00:30 for the whole hour', () => {
    const chart = series('FST', '1h', range(T0 + 1800, HOUR, 4)), steps = series('FST', '15m', range(T0 + 1800, 900, 16));
    for (const [clock, count] of [[T0 + 2700, 1], [T0 + 4500, 3]] as const) {
      const frame = replayChartFrame(chart, clock, steps);
      expect(frame.completeBars).toBe(0); expect(frame.bars).toHaveLength(1); expect(frame.bars[0].time).toBe(T0 + 1800); expect(frame.bars[0].close).toBe(steps.bars[count - 1].close);
    }
  });
  it('monthly bars labelled on the first trading day form under that label', () => {
    const chart = series('MON', '1M', [utc(2023, 12, 1), utc(2024, 1, 2)]), steps = series('MON', '1D', range(utc(2024, 1, 2), DAY, 10));
    const frame = replayChartFrame(chart, utc(2024, 1, 5), steps);
    expect(frame.completeBars).toBe(1); expect(frame.bars[1]).toMatchObject({ time: utc(2024, 1, 2), close: steps.bars[2].close });
  });
});

describe('RPR-4: the empty-frame notice does not claim a forming bar', () => {
  it('plain wording without a forming bar, forming wording with one', () => {
    const hourly = series('NOT', '1h', range(T0, HOUR, 72)), daily = series('NOT', '1D', range(T0, DAY, 3));
    const participants: ReplayParticipant[] = [hourly, daily].map((d, i) => ({ cellId: `c${i}`, instrumentId: d.instrument.id, symbol: d.instrument.symbol, interval: d.resolution, chartType: 'candles', datasetId: d.provenance.datasetId, revision: '1' }));
    const session = selectReplayStart(openReplay({ participants, activeCellId: 'c0', scope: 'all', sessionId: 'n' }), hourly, hourly.bars[5].time, '1h');
    const empty = replayChartView(session, daily, null);
    expect(empty.frame.bars).toHaveLength(0); expect(empty.notice).toBe('This chart has no completed bar at the replay point yet.');
    expect(replayChartView(session, daily, hourly).notice).toContain('it shows only its forming bar');
  });
});

const flat: Bar[] = range(T0, DAY, 6).map(time => ({ time, open: 100, high: 101, low: 99, close: 100, volume: 1 }));
const order = (result: ReturnType<typeof backtestStrategy>, id: string) => result.orders.find(row => row.id === id)!;
describe('RPR-2: bracket reservations follow every position change', () => {
  it('reversal ends the old-direction bracket and releases its reservation', () => {
    const result = backtestStrategy({ bars: flat, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 10 }] }, { barIndex: 1, orders: [{ action: 'exit', id: 'A', quantity: 10, profitPrice: 110, lossPrice: 80 }, { action: 'sell', quantity: 20 }] }, { barIndex: 3, orders: [{ action: 'exit', id: 'B', quantity: 10, lossPrice: 120 }] }] });
    for (const id of ['A:profit', 'A:loss']) { expect(order(result, id).status).toBe('cancelled'); expect(order(result, id).reason).toContain('reversed'); }
    expect(result.diagnostics.join(' ')).not.toContain('exit B'); expect(order(result, 'B:loss').status).toBe('working');
  });
  it('shrink clamps the reservation to the open position; the unreserved amount is never negative', () => {
    const result = backtestStrategy({ bars: flat, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 10 }] }, { barIndex: 1, orders: [{ action: 'exit', id: 'A', quantity: 10, profitPrice: 110, lossPrice: 80 }, { action: 'sell', quantity: 5 }] }, { barIndex: 3, orders: [{ action: 'exit', id: 'B', quantity: 5, lossPrice: 90 }] }] });
    expect(order(result, 'A:profit')).toMatchObject({ status: 'working', quantity: 5 }); expect(order(result, 'A:profit').reason).toContain('reduced to 5');
    const text = result.diagnostics.join(' '); expect(text).toContain('exit B quantity 5 exceeds the unreserved position 0'); expect(text).not.toMatch(/position -\d/);
  });
  it('cancelling both legs releases the reservation and records a cancel reason', () => {
    const result = backtestStrategy({ bars: flat, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 10 }] }, { barIndex: 1, orders: [{ action: 'exit', id: 'A', quantity: 10, profitPrice: 110, lossPrice: 80 }] }, { barIndex: 2, orders: [{ action: 'cancel', targetOrderId: 'A:profit' }, { action: 'cancel', targetOrderId: 'A:loss' }] }, { barIndex: 3, orders: [{ action: 'exit', id: 'B', quantity: 10, lossPrice: 90 }] }] });
    for (const id of ['A:profit', 'A:loss']) expect(order(result, id)).toMatchObject({ status: 'cancelled', reason: 'Cancelled by the strategy.' });
    expect(result.diagnostics.join(' ')).not.toContain('exit B'); expect(order(result, 'B:loss').status).toBe('working');
  });
  it('an exit without a caller id is named "Exit N" in messages, never by its generated identity', () => {
    const result = backtestStrategy({ bars: flat, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 10 }] }, { barIndex: 1, orders: [{ action: 'exit', quantity: 20, lossPrice: 90 }, { action: 'exit', lossPrice: 90 }] }] });
    const text = [...result.diagnostics, ...result.orders.map(row => row.reason ?? '')].join(' ');
    expect(text).toContain('Exit 1 quantity 20 exceeds'); expect(text).toContain('Exit 2 stop loss'); expect(text).not.toContain('strategy-exit');
  });
});

describe('RPR-3: OpenCandle-defined unit cap of 1e12 for every size path', () => {
  it('sub-cent crypto at 100 percent of 1,000,000 fills; the report accepts it; above 1e12 is refused', () => {
    expect(MAX_ORDER_QUANTITY).toBe(1e12);
    const bars: Bar[] = range(T0, DAY, 3).map(time => ({ time, open: 0.00001234, high: 0.00001234, low: 0.00001234, close: 0.00001234, volume: 1 }));
    const result = backtestStrategy({ bars, signals: [{ barIndex: 0, orders: [{ action: 'buy' }] }], config: { initialCapital: 1e6, tickSize: 1e-8, defaultQuantity: { kind: 'percent-of-equity', value: 100 } } });
    expect(result.fills).toHaveLength(1); expect(result.fills[0].quantity).toBe(81037277147);
    expect(() => buildStrategyReport({ bars, barIds: bars.map((_, i) => `c:${i}`), result, context: { executionId: 'c', sourceLabel: 'Synthetic', currency: null, timezone: 'UTC' } })).not.toThrow();
    const explicit = backtestStrategy({ bars, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1e12 + 1 }] }], config: { initialCapital: 1e6, tickSize: 1e-8 } });
    expect(explicit.orders[0].status).toBe('rejected');
  });
});
