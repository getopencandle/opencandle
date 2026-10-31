import { describe, expect, it } from 'vitest';
import { backtestStrategy, MARGIN_CALL_ORDER_PREFIX, type StrategySignal } from '../../src/domain/strategy';
import { buildStrategyReport } from '../../src/domain/strategy-report';
import type { Bar } from '../../src/domain/types';

// Margin calls follow the broker-emulator formula published in the Pine strategies documentation
// (https://www.tradingview.com/pine-script-docs/concepts/strategies/, "Margin" section): Available Funds = Equity - MVS x
// Margin Ratio; Loss = Available / Ratio; Cover = TRUNCATE(Loss / Price); Margin Call Size = Cover x 4.
const context = { executionId: 'synthetic-margin-call', sourceLabel: 'Synthetic margin-call fixture; no actual security prices', currency: null, timezone: 'UTC' };
const bar = (time: number, open: number, high: number, low: number, close: number): Bar => ({ time, open, high, low, close, volume: 1 });
function run(bars: Bar[], signals: StrategySignal[], config: Record<string, unknown>) {
  const barIds = bars.map((_, index) => 'synthetic-margin:' + index), result = backtestStrategy({ bars, barIds, signals, config });
  expect(result.ok, result.diagnostics.join(' ')).toBe(true);
  return { result, report: buildStrategyReport({ bars, barIds, result, context }) };
}
const calls = <T extends { id: string }>(orders: readonly T[]) => orders.filter(order => order.id.startsWith(MARGIN_CALL_ORDER_PREFIX));

describe('documented margin-call liquidation', () => {
  it('reproduces the published long example: 682,438 shares @ 4.43, 25% margin, price 3.90 -> liquidate 111,052', () => {
    // Published lines: equity 638,307.86; margin 665,377.05; available -27,069.19; loss -108,276.76; cover -27,763; size -111,052.
    const { result, report } = run([bar(0, 4.5, 4.5, 4.5, 4.5), bar(60, 4.43, 4.43, 3.9, 3.9)], [{ barIndex: 0, orders: [{ id: 'long', action: 'buy', quantity: 682438 }] }], { initialCapital: 1000000, marginLongPercent: 25 });
    expect(calls(result.orders)).toEqual([expect.objectContaining({ id: 'lv-margin-call-1', action: 'sell', quantity: 111052, status: 'filled', fillBar: 1, fillPrice: 3.9, reduceOnly: true })]);
    expect(result.fills.at(-1)).toMatchObject({ orderId: 'lv-margin-call-1', phase: 'intrabar', price: 3.9, quantity: 111052 });
    expect(result.equity[1]).toMatchObject({ position: 571386, equity: 638307.86 });
    const all = report.metrics.all;
    expect(all.marginCalls.value).toBe(1); expect(all.liquidatedVolume.value).toBeCloseTo(433102.8, 9); expect(all.largestLiquidation.value).toBeCloseTo(433102.8, 9);
    expect(report.metrics.long.marginCalls.value).toBe(1); expect(report.metrics.short.marginCalls.value).toBe(0);
    expect(report.trades[0]).toMatchObject({ exitOrderId: 'lv-margin-call-1', quantity: 111052, direction: 'long' });
  });
  it('liquidates shorts when a rise exhausts 100% short margin (hand: available 1500 - 20 x 80 = -100 -> cover 1 -> buy 4)', () => {
    const { result, report } = run([bar(0, 50, 50, 50, 50), bar(60, 50, 80, 49, 78)], [{ barIndex: 0, orders: [{ action: 'sell', quantity: 10 }] }], { initialCapital: 1000 });
    expect(calls(result.orders)).toEqual([expect.objectContaining({ action: 'buy', quantity: 4, fillPrice: 80, status: 'filled' })]);
    expect(result.equity[1]).toMatchObject({ position: -6, cash: 1180, equity: 712 });
    expect(report.metrics.short).toMatchObject({ marginCalls: { value: 1 }, liquidatedVolume: { value: 320 }, largestLiquidation: { value: 320 } });
  });
  it('liquidates at least one lot (times four) when the truncated cover would be zero', () => {
    // Available 1500 - 20 x 75.5 = -10; |-10 / 1 / 75.5| truncates to 0 -> one lot -> 4 units.
    const { result } = run([bar(0, 50, 50, 50, 50), bar(60, 50, 75.5, 49.5, 60)], [{ barIndex: 0, orders: [{ action: 'sell', quantity: 10 }] }], { initialCapital: 1000 });
    expect(calls(result.orders).map(order => [order.action, order.quantity])).toEqual([['buy', 4]]);
  });
  it('never margin-calls a 100% long position, and reserves the margin-call identity prefix', () => {
    const { result, report } = run([bar(0, 100, 100, 100, 100), bar(60, 100, 100, 5, 6)], [{ barIndex: 0, orders: [{ action: 'buy', quantity: 10 }, { id: MARGIN_CALL_ORDER_PREFIX + '9', action: 'buy', quantity: 1 }] }], { initialCapital: 1000 });
    expect(calls(result.orders)).toEqual([]); expect(report.metrics.all.marginCalls.value).toBe(0); expect(report.metrics.all.liquidatedVolume.value).toBe(0);
    expect(result.diagnostics).toContain('Bar 0: order identity prefix lv-margin-call- is reserved for margin calls.');
  });
});
