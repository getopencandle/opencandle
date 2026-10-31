// RPST re-review round 3 follow-ups (round3): RPR-6 readable signal labels in
// report trades, open entries, orders and exports (never generated identities); RPR-7 one resize sentence per leg.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { backtestStrategy, strategyOrderLabel } from '../../src/domain/strategy';
import { buildStrategyReport } from '../../src/domain/strategy-report';
import { strategyReportCsv } from '../../src/domain/strategy-report-export';
import { TradeCell } from '../../src/ui/StrategyDialog';
import { reportTradeSignals } from '../../src/strategy-report/ReportChart';
import { queryReportTrades, tradeColumnValue } from '../../src/domain/strategy-report-view';
import type { Bar } from '../../src/domain/types';

const DAY = 86400, T0 = Date.UTC(2024, 0, 2) / 1000;
const rows = (list: Array<[number, number, number, number]>): Bar[] => list.map(([open, high, low, close], index) => ({ time: T0 + index * DAY, open, high, low, close, volume: 1 }));
const context = { executionId: 'r4', sourceLabel: 'Synthetic', currency: null, timezone: 'UTC' };
const GENERATED = /strategy-order-|strategy-exit-|lv-margin-call-/;
function report(bars: Bar[], signals: Parameters<typeof backtestStrategy>[0]['signals'], config: Record<string, unknown> = {}) {
  const barIds = bars.map((_, index) => `r4:${index}`), result = backtestStrategy({ bars, barIds, signals, config });
  return { result, report: buildStrategyReport({ bars, barIds, result, context }) };
}

describe('RPR-6: readable signal labels', () => {
  it('unnamed entries and exits read "Entry N" and "Exit N ..." consistently with their reasons', () => {
    const bars = rows([[100, 101, 99, 100], [100, 101, 99, 100], [100, 101, 99, 100], [100, 101, 89, 90], [90, 91, 89, 90], [90, 91, 89, 90]]);
    const { result, report: built } = report(bars, [{ barIndex: 0, orders: [{ action: 'buy', quantity: 10 }, { action: 'buy', quantity: 5 }] }, { barIndex: 1, orders: [{ action: 'exit', quantity: 10, lossPrice: 95 }] }], { pyramiding: 2 });
    const exitLeg = result.orders.find(order => order.type === 'stop')!;
    expect(exitLeg.reason).toContain('Exit 1 stop loss'); expect(strategyOrderLabel(exitLeg)).toBe('Exit 1 stop loss');
    expect(built.trades[0]).toMatchObject({ entrySignal: 'Entry 1', exitSignal: 'Exit 1 stop loss' });
    expect(built.openLots[0]).toMatchObject({ entrySignal: 'Entry 2' });
    const cells = ['entryOrderId', 'exitOrderId'].map(column => renderToStaticMarkup(React.createElement(TradeCell, { trade: built.trades[0], column: column as 'entryOrderId', timezone: 'UTC' })));
    expect(cells.join(' ')).toContain('Entry 1'); expect(cells.join(' ')).toContain('Exit 1 stop loss'); expect(cells.join(' ')).not.toMatch(GENERATED);
    for (const kind of ['trades', 'orders'] as const) expect(strategyReportCsv(built, kind)).not.toMatch(GENERATED);
  });
  it('caller names stay as given; margin calls read "Margin call N"', () => {
    const { report: built } = report([{ time: 0, open: 4.5, high: 4.5, low: 4.5, close: 4.5, volume: 1 }, { time: 60, open: 4.43, high: 4.43, low: 3.9, close: 3.9, volume: 1 }], [{ barIndex: 0, orders: [{ id: 'long', action: 'buy', quantity: 682438 }] }], { initialCapital: 1000000, marginLongPercent: 25 });
    expect(built.trades[0]).toMatchObject({ entrySignal: 'long', exitSignal: 'Margin call 1', exitOrderId: 'lv-margin-call-1' });
    expect(built.orders.map(order => strategyOrderLabel(order))).toEqual(['long', 'Margin call 1']);
    expect(strategyOrderLabel({ id: 'strategy-order-7' })).toBe('Entry'); expect(strategyOrderLabel({ id: 'strategy-exit-3:loss' })).toBe('Exit stop loss');
  });
});

describe('RPR-7: repeated shrinks keep one resize sentence', () => {
  it('three sells of 2 from 10 leave a single "Quantity reduced to 4" sentence', () => {
    const bars = rows(Array.from({ length: 7 }, () => [100, 101, 99, 100] as [number, number, number, number]));
    const result = backtestStrategy({ bars, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 10 }] }, { barIndex: 1, orders: [{ action: 'exit', id: 'A', quantity: 10, lossPrice: 80 }, { action: 'sell', quantity: 2 }] }, { barIndex: 2, orders: [{ action: 'sell', quantity: 2 }] }, { barIndex: 3, orders: [{ action: 'sell', quantity: 2 }] }] });
    expect(result.orders.find(order => order.id === 'A:loss')).toMatchObject({ quantity: 4, reason: 'Exit A stop loss. Quantity reduced to 4 to match the open position.' });
  });
});

describe('RPR-6 round 4b: chart caption, search and sort use the display label', () => {
  const bars = rows([[100, 101, 99, 100], [100, 101, 99, 100], [100, 101, 99, 100], [100, 101, 89, 90], [90, 91, 89, 90], [90, 91, 89, 90], [90, 91, 89, 90], [90, 99, 89, 90]]);
  const built = () => report(bars, [{ barIndex: 0, orders: [{ action: 'buy', quantity: 10 }] }, { barIndex: 1, orders: [{ action: 'exit', quantity: 10, lossPrice: 95 }] }, { barIndex: 4, orders: [{ id: 'm-late', action: 'buy', quantity: 1 }] }, { barIndex: 5, orders: [{ action: 'close' }] }]).report;
  it('the chart caption names signals by their labels', () => {
    const trade = built().trades[0];
    expect(reportTradeSignals(trade)).toBe('Entry 1 to Exit 1 stop loss');
    expect(reportTradeSignals({ entryOrderId: 'strategy-order-4', exitOrderId: 'lv-margin-call-2' })).toBe('Entry to Margin call 2');
  });
  it('search matches the display label as well as the internal id; sort uses the label', () => {
    const value = built(), query = (text: string, sort: 'exitOrderId' | 'entryOrderId' = 'exitOrderId') => queryReportTrades(value, { side: 'all', query: text, sort, descending: false, page: 0 });
    expect(query('exit 1 stop').rows.map(row => row.number)).toEqual([1]);
    expect(query('strategy-exit').rows).toEqual([]); expect(query(value.trades[0].exitOrderId).rows.map(row => row.number)).toEqual([1]); // Ids match only exactly
    expect(query('exit 2').rows.map(row => row.number)).toEqual([2]); // The unnamed close is an exit (Exit 1 is the bracket)
    expect(tradeColumnValue(value.trades[0], 'exitOrderId')).toBe('Exit 1 stop loss');
    expect(query('', 'entryOrderId').rows.map(row => row.entrySignal)).toEqual(['Entry 1', 'm-late']);
  });
});
