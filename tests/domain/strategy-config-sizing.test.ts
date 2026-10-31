import { expect, it } from 'vitest';
import { backtestStrategy } from '../../src/domain/strategy';
import type { Bar } from '../../src/domain/types';

// Every order fills exactly its chosen units. There is no default size:
// an order without units, or with units off the configured lot grid, is rejected with a reason, never resized.
const bars: Bar[] = [10, 10, 12, 12].map((close, index) => ({ time: 1000 + index * 60, open: close, high: close, low: close, close, volume: 1 }));

it('fills the chosen whole units and trades exactly that quantity', () => {
  const result = backtestStrategy({ bars, signals: [{ barIndex: 0, orders: [{ id: 'a', action: 'buy', quantity: 3 }] }, { barIndex: 1, orders: [{ id: 'b', action: 'sell', quantity: 3 }] }], config: { initialCapital: 1000 } });
  expect(result.fills.map(fill => [fill.orderId, fill.quantity, fill.price])).toEqual([['a', 3, 10], ['b', 3, 12]]);
  expect(result.trades[0]).toMatchObject({ quantity: 3, netProfit: 6 }); expect(result.equity.map(row => row.position)).toEqual([0, 3, 0, 0]);
});
it('accepts fractional units on a fractional lot grid and rejects off-grid or missing units without resizing', () => {
  const fractional = backtestStrategy({ bars, signals: [{ barIndex: 0, orders: [{ id: 'half', action: 'buy', quantity: 2.5 }] }], config: { initialCapital: 1000, lotSize: 0.5 } });
  expect(fractional.fills[0]).toMatchObject({ orderId: 'half', quantity: 2.5 });
  const rejected = backtestStrategy({ bars, signals: [{ barIndex: 0, orders: [{ id: 'off-grid', action: 'buy', quantity: 2.5 }, { id: 'missing', action: 'buy' }] }], config: { initialCapital: 1000 } });
  expect(rejected.orders.map(order => [order.id, order.status, order.reason])).toEqual([['off-grid', 'rejected', 'Invalid action, order type or lot-aligned quantity.'], ['missing', 'rejected', 'Invalid action, order type or lot-aligned quantity.']]);
  expect(rejected.fills).toEqual([]);
});
