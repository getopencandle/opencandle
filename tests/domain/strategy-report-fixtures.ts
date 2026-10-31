import type { Bar } from '../../src/domain/types';
import { backtestStrategy, type StrategyConfig, type StrategySignal } from '../../src/domain/strategy';

/** Entirely synthetic arithmetic input, unrelated to any actual security. */
export function reportArithmeticFixture() {
  const prices = [
    [5, 5, 5, 5],
    [10, 12, 8, 11],
    [13, 100, 1, 20],
    [20, 23, 19, 21],
    [22, 22, 5, 5],
    [5, 6, 4, 5.5],
    [5.5, 8, 5, 8],
    [8, 9, 7, 9],
  ];
  const bars: Bar[] = prices.map(([open, high, low, close], index) => ({ time: 1000 + index * 60, open, high, low, close, volume: 1 }));
  const signals: StrategySignal[] = [
    { barIndex: 0, orders: [{ id: 'long-a', action: 'buy', quantity: 2 }] },
    { barIndex: 1, orders: [{ id: 'close-a', action: 'close' }] },
    { barIndex: 2, orders: [{ id: 'short-b', action: 'sell', quantity: 3 }] },
    { barIndex: 3, orders: [{ id: 'close-b', action: 'close' }] },
    { barIndex: 4, orders: [{ id: 'long-c', action: 'buy', quantity: 4 }] },
    { barIndex: 5, orders: [{ id: 'close-c', action: 'close' }] },
    { barIndex: 6, orders: [{ id: 'open-d', action: 'buy', quantity: 2 }] },
  ];
  const config: Partial<StrategyConfig> = { initialCapital: 1000, commission: { kind: 'fixed', value: 1 } };
  const barIds = bars.map((_, index) => `synthetic-report:${index}`);
  return { bars, barIds, signals, config, result: backtestStrategy({ bars, barIds, signals, config }) };
}
