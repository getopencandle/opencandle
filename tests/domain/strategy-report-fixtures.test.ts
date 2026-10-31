import { expect, it } from 'vitest';
import { reportArithmeticFixture } from './strategy-report-fixtures';

it('establishes the report arithmetic fixture through real next-bar fills without using report calculations', () => {
  const { result } = reportArithmeticFixture();
  expect(result.ok).toBe(true);
  expect(result.fills.map(fill => [fill.orderId, fill.barIndex, fill.price, fill.quantity])).toEqual([
    ['long-a', 1, 10, 2], ['close-a', 2, 13, 2], ['short-b', 3, 20, 3],
    ['close-b', 4, 22, 3], ['long-c', 5, 5, 4], ['close-c', 6, 5.5, 4], ['open-d', 7, 8, 2],
  ]);
  expect(result.trades.map(trade => [trade.grossProfit, trade.commission, trade.netProfit])).toEqual([[6, 2, 4], [-6, 2, -8], [2, 2, 0]]);
  expect(result.metrics).toMatchObject({ netProfitClosed: -4, openProfit: 1, finalEquity: 997, totalCommission: 7, totalProfit: -3 });
  expect(result.equity.at(-1)).toMatchObject({ cash: 979, position: 2, equity: 997 });
});
