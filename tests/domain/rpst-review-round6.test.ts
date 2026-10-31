// RPST re-review round 5 follow-ups (round5): RPR-10 unnamed orders are labelled
// when they fill (a reversal carries an exit part and an entry part, never-filled orders read "Order N");
// RPR-11 caller names that look like generated labels get a " (script)" suffix.
import { describe, expect, it } from 'vitest';
import { backtestStrategy, strategyOrderLabel } from '../../src/domain/strategy';
import { buildStrategyReport } from '../../src/domain/strategy-report';
import type { Bar } from '../../src/domain/types';

const DAY = 86400, T0 = Date.UTC(2024, 0, 2) / 1000;
const flat: Bar[] = Array.from({ length: 8 }, (_, index) => ({ time: T0 + index * DAY, open: 100, high: 101, low: 99, close: 100, volume: 1 }));
const context = { executionId: 'r6', sourceLabel: 'Synthetic', currency: null, timezone: 'UTC' };
function run(signals: Parameters<typeof backtestStrategy>[0]['signals'], config: Record<string, unknown> = {}) {
  const barIds = flat.map((_, index) => `r6:${index}`), result = backtestStrategy({ bars: flat, barIds, signals, config });
  return { result, report: buildStrategyReport({ bars: flat, barIds, result, context }) };
}

describe('RPR-10: unnamed orders are labelled at fill', () => {
  it('a percent-of-equity sell that reverses a long reads as an exit for the closed part and an entry for the new short', () => {
    const { result, report } = run([{ barIndex: 0, orders: [{ action: 'buy', quantity: 10 }] }, { barIndex: 1, orders: [{ action: 'sell' }] }], { initialCapital: 10000, defaultQuantity: { kind: 'percent-of-equity', value: 50 } });
    const sell = result.orders[1];
    expect(sell).toMatchObject({ status: 'filled', quantity: 50 });
    expect(strategyOrderLabel(sell)).toBe('Exit 1 and Entry 2');
    expect(report.trades[0]).toMatchObject({ entrySignal: 'Entry 1', exitSignal: 'Exit 1' });
    expect(report.openLots[0]).toMatchObject({ direction: 'short', entrySignal: 'Entry 2' });
  });
  it('orders that never fill read "Order N"; filled numbering stays consecutive', () => {
    const { result } = run([{ barIndex: 0, orders: [{ action: 'buy', type: 'limit', limitPrice: 50, quantity: 1 }, { action: 'buy', quantity: 1.5 }, { action: 'buy', quantity: 2 }] }, { barIndex: 2, orders: [{ action: 'sell', quantity: 2 }] }]);
    expect(result.orders.map(order => [order.status, strategyOrderLabel(order)])).toEqual([['working', 'Order 1'], ['rejected', 'Order 2'], ['filled', 'Entry 1'], ['filled', 'Exit 1']]);
  });
});

describe('RPR-11: caller names never read like generated labels', () => {
  it('caller ids shaped like generated labels get " (script)"; ordinary caller ids are unchanged', () => {
    const { result } = run([{ barIndex: 0, orders: [{ id: 'Entry 1', action: 'buy', quantity: 2 }, { action: 'buy', quantity: 1 }, { id: 'script-9', action: 'buy', quantity: 1 }] }, { barIndex: 1, orders: [{ action: 'exit', id: '1', quantity: 1, profitPrice: 200 }, { action: 'exit', quantity: 1, profitPrice: 200 }] }], { pyramiding: 3 });
    expect(result.orders.map(order => strategyOrderLabel(order))).toEqual(['Entry 1 (script)', 'Entry 1', 'script-9', 'Exit 1 (script) take profit', 'Exit 1 take profit']);
  });
});

describe('RPR-13: suffixed caller names stay unique', () => {
  it('a caller already named "... (script)" cannot collide; repeats get a counter', () => {
    const { result } = run([{ barIndex: 0, orders: [{ id: 'Entry 1 (script)', action: 'buy', quantity: 1 }, { id: 'Entry 1', action: 'buy', quantity: 1 }, { id: 'entry 1 (Script 2)', action: 'buy', quantity: 1 }, { action: 'buy', quantity: 1 }, { id: 'plain (script)', action: 'buy', quantity: 1 }] }], { pyramiding: 5 });
    const labels = result.orders.map(order => strategyOrderLabel(order));
    expect(labels).toEqual(['Entry 1 (script)', 'Entry 1 (script 2)', 'entry 1 (script 3)', 'Entry 1', 'plain (script)']);
    expect(new Set(labels.map(label => label.toLowerCase())).size).toBe(labels.length);
  });
});

describe('RPR-16: composed exit-leg labels go through the same namer', () => {
  it('caller exit id "1" and a caller order named "Exit 1 (script) take profit" read differently, in either order', () => {
    for (const exitFirst of [true, false]) {
      const order = { id: 'Exit 1 (script) take profit', action: 'buy' as const, quantity: 1 }, exit = { action: 'exit' as const, id: '1', quantity: 1, profitPrice: 200 };
      const signals = exitFirst ? [{ barIndex: 0, orders: [{ action: 'buy' as const, quantity: 1 }] }, { barIndex: 1, orders: [exit] }, { barIndex: 2, orders: [order] }] : [{ barIndex: 0, orders: [{ action: 'buy' as const, quantity: 1 }, order] }, { barIndex: 1, orders: [exit] }];
      const labels = run(signals, { pyramiding: 3 }).result.orders.map(row => strategyOrderLabel(row));
      expect(new Set(labels.map(label => label.toLowerCase())).size, labels.join(' | ')).toBe(labels.length);
      expect(labels).toContain('Exit 1 (script) take profit'); // whichever comes first keeps the plain form
    }
  });
});

describe('RPR-16 nit: a countered leg label is the one its reason uses', () => {
  it('the reason starts with the displayed leg label', () => {
    const { result } = run([{ barIndex: 0, orders: [{ action: 'buy', quantity: 1 }, { id: 'Exit 1 (script) take profit', action: 'buy', quantity: 1 }] }, { barIndex: 1, orders: [{ action: 'exit', id: '1', quantity: 1, profitPrice: 200, lossPrice: 50 }] }], { pyramiding: 3 });
    const legs = result.orders.filter(order => order.id.startsWith('1:'));
    expect(legs.map(leg => leg.label)).toEqual(['Exit 1 (script) take profit (script 2)', 'Exit 1 (script) stop loss']);
    for (const leg of legs) expect(leg.reason!.startsWith(leg.label!), leg.reason).toBe(true);
  });
});
