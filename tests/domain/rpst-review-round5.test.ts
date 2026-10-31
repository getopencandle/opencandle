// RPST re-review round 4 follow-ups (round4): RPR-8 unnamed orders are labelled by
// their effect at creation, and the Orders header is "Order"; RPR-9 search matches visible text by
// substring and internal ids only by exact equality.
import { describe, expect, it } from 'vitest';
import { backtestStrategy } from '../../src/domain/strategy';
import { buildStrategyReport } from '../../src/domain/strategy-report';
import { queryReportTrades, reportTradeMatches } from '../../src/domain/strategy-report-view';
import { ORDER_TABLE_HEADERS } from '../../src/ui/StrategyDialog';
import type { Bar } from '../../src/domain/types';

const DAY = 86400, T0 = Date.UTC(2024, 0, 2) / 1000;
const flat: Bar[] = Array.from({ length: 8 }, (_, index) => ({ time: T0 + index * DAY, open: 100, high: 101, low: 99, close: 100, volume: 1 }));
const context = { executionId: 'r5', sourceLabel: 'Synthetic', currency: null, timezone: 'UTC' };
function run(signals: Parameters<typeof backtestStrategy>[0]['signals'], config: Record<string, unknown> = {}) {
  const barIds = flat.map((_, index) => `r5:${index}`), result = backtestStrategy({ bars: flat, barIds, signals, config });
  return { result, report: buildStrategyReport({ bars: flat, barIds, result, context }) };
}

describe('RPR-8: unnamed orders are labelled by their effect at creation', () => {
  it('opening or adding is Entry N; reducing or closing is Exit N; reversing has an exit part and an entry part (RPR-10)', () => {
    const { result, report } = run([{ barIndex: 0, orders: [{ action: 'buy', quantity: 10 }] }, { barIndex: 1, orders: [{ action: 'buy', quantity: 2 }] }, { barIndex: 2, orders: [{ action: 'sell', quantity: 4 }] }, { barIndex: 3, orders: [{ action: 'sell', quantity: 20 }] }, { barIndex: 4, orders: [{ action: 'close' }] }], { pyramiding: 2 });
    expect(result.orders.map(order => order.label)).toEqual(['Entry 1', 'Entry 2', 'Exit 1', 'Exit 2 and Entry 3', 'Exit 3']);
    expect(report.trades.map(trade => [trade.entrySignal, trade.exitSignal])).toEqual([['Entry 1', 'Exit 1'], ['Entry 1', 'Exit 2'], ['Entry 2', 'Exit 2'], ['Entry 3', 'Exit 3']]);
  });
  it('the Orders table header is "Order"', () => { expect(ORDER_TABLE_HEADERS[0]).toBe('Order'); expect(ORDER_TABLE_HEADERS).not.toContain('Order ID'); });
});

describe('RPR-9: search matches visible text; internal ids only exactly', () => {
  it('a trade shown as "Entry 1" to "Exit 3" (exit id strategy-order-4) ignores hidden id fragments', () => {
    const { report } = run([{ barIndex: 0, orders: [{ action: 'buy', quantity: 10 }] }, { barIndex: 1, orders: [{ action: 'exit', quantity: 10, profitPrice: 200, lossPrice: 50 }, { action: 'exit', quantity: 20, lossPrice: 50 }] }, { barIndex: 2, orders: [{ action: 'sell', quantity: 20 }] }]);
    const trade = report.trades[0];
    expect([trade.entrySignal, trade.exitSignal, trade.exitOrderId]).toEqual(['Entry 1', 'Exit 3', 'strategy-order-4']); // The reversal's closing part
    const query = (text: string) => queryReportTrades(report, { side: 'all', query: text, sort: 'number', descending: false, page: 0 }).rows.map(row => row.number);
    for (const text of ['order', 'strategy', '-', '4']) { expect(query(text), text).toEqual([]); expect(reportTradeMatches(trade, text), text).toBe(false); }
    expect(query('exit 3')).toEqual([1]); expect(query('1')).toEqual([1]); expect(query('strategy-order-4')).toEqual([1]); expect(query('STRATEGY-ORDER-1')).toEqual([1]);
  });
});
