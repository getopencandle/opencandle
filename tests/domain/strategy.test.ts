import { describe, expect, it } from 'vitest';
import { backtestStrategy } from '../../src/domain/strategy';
import type { StrategySignal } from '../../src/domain/strategy';
import type { Bar } from '../../src/domain/types';
const bars = (values: number[]): Bar[] => values.map((close, i) => ({ time: i * 86400, open: close, high: close + 1, low: Math.max(0.01, close - 1), close, volume: 100 }));
const signal = (barIndex: number, action: 'buy' | 'sell' | 'close', quantity = 1): StrategySignal => ({ barIndex, orders: [{ action, quantity }] });

describe('independent strategy execution and equity oracles', () => {
  it('matches the independently requested PineTS comparison case on standard OHLC', () => {
    const result = backtestStrategy({ bars: bars([2, 4, 8, 10, 6, 12]), signals: [signal(0, 'buy'), signal(3, 'close')], config: { initialCapital: 1000 } });
    expect(result.ok).toBe(true); expect(result.fills.map(fill => [fill.barIndex, fill.price])).toEqual([[1, 4], [4, 6]]);
    expect(result.equity.map(point => point.equity)).toEqual([1000, 1000, 1004, 1006, 1002, 1002]); expect(result.metrics.netProfitClosed).toBe(2);
  });
  it('fills default signals at the next bar open with commission and adverse slippage', () => {
    const input: Bar[] = [{ time: 0, open: 10, high: 11, low: 9, close: 10, volume: 100 }, { time: 1, open: 12, high: 15, low: 11, close: 14, volume: 100 }, { time: 2, open: 13, high: 14, low: 10, close: 11, volume: 100 }];
    const result = backtestStrategy({ bars: input, signals: [signal(0, 'buy', 10), signal(1, 'close', 10)], config: { initialCapital: 1000, commission: { kind: 'fixed', value: 1 } } });
    expect(result.fills.map(fill => fill.price)).toEqual([12, 13]); expect(result.equity.map(point => point.equity)).toEqual([1000, 1019, 1008]); expect(result.metrics.netProfitClosed).toBe(8); expect(result.metrics.totalCommission).toBe(2);
    const slipped = backtestStrategy({ bars: input, signals: [signal(0, 'buy', 10), signal(1, 'close', 10)], config: { initialCapital: 1000, slippageTicks: 2, commission: { kind: 'fixed', value: 1 } } });
    expect(slipped.fills.map(fill => fill.price)).toEqual([12.02, 12.98]); expect(slipped.metrics.finalEquity).toBe(1007.6);
    const percent = backtestStrategy({ bars: input, signals: [signal(0, 'buy', 10), signal(1, 'close', 10)], config: { initialCapital: 1000, commission: { kind: 'percent', value: 1 } } });
    expect(percent.metrics.totalCommission).toBe(2.5); expect(percent.metrics.finalEquity).toBe(1007.5);
    const atClose = backtestStrategy({ bars: input, signals: [signal(0, 'buy', 10), signal(1, 'close', 10)], config: { initialCapital: 1000, processOrdersOnClose: true, commission: { kind: 'fixed', value: 1 } } });
    expect(atClose.fills.map(fill => [fill.barIndex, fill.price, fill.phase])).toEqual([[0, 10, 'close'], [1, 14, 'close']]); expect(atClose.metrics.finalEquity).toBe(1038);
  });
  it('allocates entry and exit commissions to a partial FIFO close', () => {
    const result = backtestStrategy({ bars: bars([10, 10, 12]), signals: [signal(0, 'buy', 10), signal(1, 'close', 5)], config: { initialCapital: 1000, commission: { kind: 'fixed', value: 1 } } });
    expect(result.trades).toHaveLength(1); expect(result.trades[0]).toMatchObject({ quantity: 5, grossProfit: 10, commission: 1.5, netProfit: 8.5 }); expect(result.metrics.openProfit).toBe(9.5); expect(result.metrics.finalEquity).toBe(1018);
  });
  it('handles short proceeds and reversal without increasing equity from cash alone', () => {
    const result = backtestStrategy({ bars: bars([10, 10, 8, 9]), signals: [signal(0, 'sell', 10), signal(1, 'buy', 15), signal(2, 'close', 5)], config: { initialCapital: 1000 } });
    expect(result.equity.map(point => point.equity)).toEqual([1000, 1000, 1020, 1025]); expect(result.metrics.netProfitClosed).toBe(25); expect(result.trades.map(t => t.direction)).toEqual(['short', 'long']);
  });
});

describe('price orders, intrabar assumptions and failure cases', () => {
  it('improves a buy limit at a gap open and gaps a stop at its executable opening price', () => {
    const limit = backtestStrategy({ bars: bars([12, 8]), signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1, type: 'limit', limitPrice: 10 }] }], config: { initialCapital: 1000 } });
    expect(limit.fills[0].price).toBe(8); expect(limit.fills[0].phase).toBe('open');
    const stop = backtestStrategy({ bars: bars([10, 14]), signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1, type: 'stop', stopPrice: 12 }] }], config: { initialCapital: 1000 } });
    expect(stop.fills[0].price).toBe(14);
    const stopLimit = backtestStrategy({ bars: bars([10, 14, 12]), signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1, type: 'stop-limit', stopPrice: 12, limitPrice: 13 }] }], config: { initialCapital: 1000 } });
    expect(stopLimit.fills[0]).toMatchObject({ barIndex: 1, price: 13, phase: 'intrabar' });
  });
  it('makes the ambiguous high/low path visible in competing exit outcomes', () => {
    const initial = bars([10, 10]);
    const signals: StrategySignal[] = [signal(0, 'buy'), { barIndex: 1, orders: [{ id: 'take', action: 'sell', quantity: 1, type: 'limit', limitPrice: 12, reduceOnly: true }, { id: 'stop', action: 'sell', quantity: 1, type: 'stop', stopPrice: 5, reduceOnly: true }] }];
    const highFirst = backtestStrategy({ bars: [...initial, { time: 2 * 86400, open: 10, high: 12, low: 5, close: 9, volume: 1 }], signals, config: { initialCapital: 1000 } });
    expect(highFirst.fills.at(-1)?.orderId).toBe('take'); expect(highFirst.metrics.netProfitClosed).toBe(2);
    const lowFirst = backtestStrategy({ bars: [...initial, { time: 2 * 86400, open: 6, high: 12, low: 5, close: 9, volume: 1 }], signals, config: { initialCapital: 1000 } });
    expect(lowFirst.fills.at(-1)?.orderId).toBe('stop'); expect(lowFirst.metrics.netProfitClosed).toBe(-5);
    expect(lowFirst.policies.join(' ')).toContain('assumed intrabar');
  });
  it('cancels pending orders and rejects invalid quantities without silently changing them', () => {
    const result = backtestStrategy({ bars: bars([10, 10, 8]), signals: [{ barIndex: 0, orders: [{ id: 'pending', action: 'buy', quantity: 1, type: 'limit', limitPrice: 7 }, { action: 'buy', quantity: 0.5 }] }, { barIndex: 1, orders: [{ action: 'cancel', targetOrderId: 'pending' }] }], config: { initialCapital: 1000 } });
    expect(result.orders[0].status).toBe('cancelled'); expect(result.orders[1].status).toBe('rejected'); expect(result.fills).toEqual([]);
  });
  it('enforces funding and pyramiding, and leaves last-bar orders unfilled', () => {
    const result = backtestStrategy({ bars: bars([10, 10, 10]), signals: [signal(0, 'buy', 5), signal(1, 'buy', 1), signal(2, 'close', 5)], config: { initialCapital: 100 } });
    expect(result.orders.map(order => order.status)).toEqual(['filled', 'rejected', 'working']); expect(result.orders[1].reason).toContain('Pyramiding');
    const oversized = backtestStrategy({ bars: bars([10, 10]), signals: [signal(0, 'buy', 11)], config: { initialCapital: 100 } }); expect(oversized.orders[0].status).toBe('rejected'); expect(oversized.metrics.finalEquity).toBe(100);
  });
  it('rejects unsupported recalculation and mismatched execution basis', () => {
    for (const config of [{ calcOnEveryTick: true }, { calcOnOrderFills: true }, { barMagnifier: true }, { fillBasis: 'standard-ohlc' as const, chartType: 'renko' as const }]) expect(backtestStrategy({ bars: bars([10, 12]), signals: [], config }).ok).toBe(false);
    expect(backtestStrategy({ bars: bars([10, 12]), standardBars: bars([11]), signals: [], config: { chartType: 'heikin-ashi', fillBasis: 'standard-ohlc' } }).ok).toBe(false);
  });
  it('permits the first entry with pyramiding zero and rejects an additional same-direction entry', () => {
    const result = backtestStrategy({ bars: bars([10, 10, 10]), signals: [signal(0, 'buy'), signal(1, 'buy')], config: { pyramiding: 0 } });
    expect(result.ok).toBe(true); expect(result.orders.map(order => order.status)).toEqual(['filled', 'rejected']); expect(result.equity.at(-1)?.position).toBe(1);
  });
  it('rejects malformed signal bars even when execution uses valid standard OHLC', () => {
    for (const bad of [{ close: NaN }, { high: 1 }, { volume: -1 }]) {
      const signalBars = bars([10, 12]); signalBars[1] = { ...signalBars[1], ...bad };
      const result = backtestStrategy({ bars: signalBars, standardBars: bars([11, 13]), signals: [], config: { chartType: 'heikin-ashi', fillBasis: 'standard-ohlc' } });
      expect(result.ok).toBe(false); expect(result.diagnostics.join(' ')).toContain('signal bar'); expect(result.equity).toEqual([]);
    }
  });
  it('rejects inapplicable price fields and malformed runtime configuration', () => {
    const result = backtestStrategy({ bars: bars([10, 10]), signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1, type: 'market', limitPrice: 9 }] }] });
    expect(result.orders[0].status).toBe('rejected'); expect(result.fills).toEqual([]);
    expect(backtestStrategy({ bars: bars([10]), signals: [], config: { processOrdersOnClose: 'false' as unknown as boolean } }).ok).toBe(false);
  });
  it('validates source identities and revisions independently of the script UI adapter', () => {
    const input = { bars: bars([10, 12]), barIds: ['a', 'b'], signals: [{ ...signal(0, 'buy'), sourceEventId: 'a', sourceRevision: 1 }] };
    expect(backtestStrategy(input).ok).toBe(true);
    expect(backtestStrategy({ ...input, signals: [{ ...input.signals[0], sourceEventId: 'b' }] }).ok).toBe(false);
    expect(backtestStrategy({ ...input, signals: [{ ...input.signals[0], sourceRevision: 2 }] }).ok).toBe(false);
    expect(backtestStrategy({ ...input, barRevisions: [2, 1], signals: [{ ...input.signals[0], sourceRevision: 2 }] }).ok).toBe(true);
    expect(backtestStrategy({ ...input, barRevisions: [0, 0], signals: [{ ...input.signals[0], sourceRevision: 0 }] }).ok).toBe(true);
  });
});

describe('information availability and explicit synthetic execution basis', () => {
  it('never rewrites past equity when future bars or future signals change', () => {
    const originalBars = bars([10, 12, 14, 16, 18]), signals = [signal(0, 'buy', 2), signal(3, 'close', 2)];
    const first = backtestStrategy({ bars: originalBars, signals, config: { initialCapital: 1000 } });
    const changed = [...originalBars.slice(0, 3), ...bars([100, 1]).map((bar, i) => ({ ...bar, time: (i + 3) * 86400 }))];
    const second = backtestStrategy({ bars: changed, signals: [...signals, signal(4, 'sell', 1)], config: { initialCapital: 1000 } });
    expect(second.equity.slice(0, 3)).toEqual(first.equity.slice(0, 3)); expect(second.fills[0]).toEqual(first.fills[0]);
  });
  it('uses synthetic chart prices by default and standard OHLC only on explicit HA override', () => {
    const chartBars = bars([10, 12, 14]), standardBars = bars([11, 13, 17]), signals = [signal(0, 'buy'), signal(1, 'close')];
    const chart = backtestStrategy({ bars: chartBars, standardBars, signals, config: { initialCapital: 1000, chartType: 'heikin-ashi' } });
    const standard = backtestStrategy({ bars: chartBars, standardBars, signals, config: { initialCapital: 1000, chartType: 'heikin-ashi', fillBasis: 'standard-ohlc' } });
    expect(chart.fills.map(fill => fill.price)).toEqual([12, 14]); expect(standard.fills.map(fill => fill.price)).toEqual([13, 17]); expect(chart.metrics.netProfitClosed).toBe(2); expect(standard.metrics.netProfitClosed).toBe(4);
  });
  it('keeps next-bar ordering when non-time bars share a display timestamp', () => {
    const input = bars([10, 12, 14]).map(bar => ({ ...bar, time: 100 }));
    const result = backtestStrategy({ bars: input, barIds: ['source:1', 'source:2', 'source:3'], signals: [signal(0, 'buy'), signal(1, 'close')], config: { initialCapital: 1000, chartType: 'range' } });
    expect(result.fills.map(fill => fill.barIndex)).toEqual([1, 2]); expect(result.metrics.netProfitClosed).toBe(2);
    expect(backtestStrategy({ bars: input, barIds: ['same', 'same', 'other'], signals: [] }).ok).toBe(false);
  });
  it('reports closed and intrabar drawdown separately with a literal known example', () => {
    const result = backtestStrategy({ bars: bars([10, 10, 20, 15]), signals: [signal(0, 'buy', 10)], config: { initialCapital: 1000 } });
    expect(result.equity.map(point => point.equity)).toEqual([1000, 1000, 1100, 1050]); expect(result.metrics.maxDrawdown).toBe(50); expect(result.metrics.maxDrawdownPercent).toBeCloseTo(100 * 50 / 1100, 12); expect(result.metrics.maxIntrabarDrawdown).toBe(70);
  });
});

describe('bounded strategy workloads and FIFO accounting', () => {
  it('evaluates working orders rather than rescanning ten thousand completed orders', () => {
    const history = bars(Array(10001).fill(10));
    const signals = Array.from({ length: 10000 }, (_, index) => signal(index, index % 2 ? 'sell' : 'buy'));
    const result = backtestStrategy({ bars: history, signals, maxOrderEvaluations: 10000, config: { initialCapital: 1000, commission: { kind: 'fixed', value: 0.01 } } });
    expect(result.ok).toBe(true); expect(result.execution).toEqual({ barsProcessed: 10001, orderEvaluations: 10000, maxOrderEvaluations: 10000 });
    expect(result.fills).toHaveLength(10000); expect(result.trades).toHaveLength(5000);
    expect(result.metrics.totalCommission).toBe(100); expect(result.metrics.finalEquity).toBe(900); expect(result.equity.at(-1)?.position).toBe(0);
  });
  it('preserves fee allocation and new entries after a large FIFO queue is drained', () => {
    const signals: StrategySignal[] = [{ barIndex: 0, orders: Array.from({ length: 5000 }, () => ({ action: 'buy', quantity: 1 })) }, signal(1, 'close', 5000), signal(2, 'buy'), signal(3, 'close')];
    const result = backtestStrategy({ bars: bars([10, 10, 12, 13, 14]), signals, config: { initialCapital: 100000, pyramiding: 5000, commission: { kind: 'fixed', value: 0.01 } } });
    expect(result.ok).toBe(true); expect(result.trades).toHaveLength(5001); expect(result.metrics.totalCommission).toBe(50.03);
    expect(result.trades[0]).toMatchObject({ quantity: 1, entryPrice: 10, exitPrice: 12, commission: 0.010002, netProfit: 1.989998 });
    expect(result.metrics.finalEquity).toBe(109950.97); expect(result.equity.at(-1)?.position).toBe(0);
  });
  it('stops unresolved working-order workloads without reporting a completed backtest', () => {
    const result = backtestStrategy({ bars: bars(Array(100).fill(10)), signals: [{ barIndex: 0, orders: Array.from({ length: 30 }, () => ({ action: 'buy', quantity: 1, type: 'limit', limitPrice: 1 })) }], maxOrderEvaluations: 100 });
    expect(result.ok).toBe(false); expect(result.execution.orderEvaluations).toBe(100); expect(result.execution.barsProcessed).toBeLessThan(100);
    expect(result.diagnostics.join(' ')).toContain('Partial results are not a completed backtest'); expect(result.fills).toEqual([]);
    expect(backtestStrategy({ bars: bars([10]), signals: [], maxOrderEvaluations: 0 }).ok).toBe(false);
    expect(backtestStrategy({ bars: bars([10]), signals: [], maxOrderEvaluations: 2000001 }).ok).toBe(false);
  });
});
