import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { backtestStrategy, type StrategySignal } from '../../src/domain/strategy';
import { buildStrategyReport, type ReportBucket } from '../../src/domain/strategy-report';
import { bestEntryPeriod } from '../../src/domain/strategy-report-view';
import { TradeAnalysis } from '../../src/ui/StrategyDialog';

// Trade-analysis leaves: outcome counts/shares, streaks by count and amount, entry hour/weekday/month
// groups in an explicit time zone, and the best entry period under the stated LV ranking policy. Literal hand oracles.
const start = Date.parse('2025-01-06T09:00:00Z') / 1000; // a Monday
const opens = [10, 10, 12, 12, 15, 15, 14, 14, 14];
const bars = opens.map((price, index) => ({ time: start + index * 3600, open: price, high: price, low: price, close: price, volume: 1 }));
const signals: StrategySignal[] = [0, 2, 4, 6].flatMap(index => [{ barIndex: index, orders: [{ action: 'buy' as const, quantity: 1 }] }, { barIndex: index + 1, orders: [{ action: 'sell' as const, quantity: 1 }] }]);
function report(timezone: string) {
  const barIds = bars.map((_, index) => 'synthetic-analysis:' + index), result = backtestStrategy({ bars, barIds, signals, config: { initialCapital: 1000 } });
  return buildStrategyReport({ bars, barIds, result, context: { executionId: 'synthetic-analysis', sourceLabel: 'Synthetic trade-analysis fixture', currency: null, timezone } });
}
const used = (rows: readonly ReportBucket[]) => rows.filter(row => row.trades).map(row => [row.key, row.trades, row.winRate, row.net]);

describe('trade analysis from one accepted run', () => {
  it('counts outcomes with shares and streaks by count and by amount', () => {
    // Trades: +2 (entry 10:00 UTC), +3 (12:00), -1 (14:00), 0 (16:00).
    const all = report('UTC').analysis.sides.all;
    expect(report('UTC').trades.map(trade => trade.netProfit)).toEqual([2, 3, -1, 0]);
    expect(all.outcomes).toEqual({ trades: 4, wins: 2, losses: 1, even: 1, winShare: 50, lossShare: 25, evenShare: 25 });
    expect(all.streaks).toEqual({ longestWins: 2, longestLosses: 1, bestWinRun: 5, worstLossRun: -1, finalKind: 'even', finalCount: 1 });
    expect(report('UTC').analysis.sides.short.outcomes).toEqual({ trades: 0, wins: 0, losses: 0, even: 0, winShare: null, lossShare: null, evenShare: null });
  });
  it('groups by entry hour, weekday and month in the display time zone', () => {
    const utc = report('UTC').analysis.sides.all, tokyo = report('Asia/Tokyo').analysis.sides.all;
    expect(used(utc.hour)).toEqual([[10, 1, 100, 2], [12, 1, 100, 3], [14, 1, 0, -1], [16, 1, 0, 0]]);
    expect(used(utc.weekday)).toEqual([[1, 4, 50, 4]]); expect(used(utc.month)).toEqual([[0, 4, 50, 4]]);
    // UTC+9: 19:00, 21:00, 23:00 Monday and 01:00 Tuesday.
    expect(used(tokyo.hour).map(row => row[0])).toEqual([1, 19, 21, 23]); expect(used(tokyo.weekday)).toEqual([[1, 3, 200 / 3, 4], [2, 1, 0, 0]]);
  });
  it('ranks the best entry period by win rate, then net PnL, trades and earlier key', () => {
    const utc = report('UTC').analysis.sides.all;
    expect(bestEntryPeriod(utc.hour)).toMatchObject({ key: 12, winRate: 100, net: 3 }); // 10:00 and 12:00 tie at 100%; 12:00 has higher net
    expect(bestEntryPeriod(utc.weekday)).toMatchObject({ key: 1, trades: 4 }); expect(bestEntryPeriod(report('UTC').analysis.sides.short.hour)).toBeNull();
    const bucket = (key: number, trades: number, wins: number, net: number): ReportBucket => ({ key, trades, wins, losses: trades - wins, even: 0, net, winRate: trades ? 100 * wins / trades : null });
    expect(bestEntryPeriod([bucket(0, 2, 1, 5), bucket(1, 4, 2, 5), bucket(2, 0, 0, 0)])!.key).toBe(1); // equal rate and net: more trades
    expect(bestEntryPeriod([bucket(3, 1, 1, 2), bucket(5, 1, 1, 2)])!.key).toBe(3); // full tie: earlier key
  });
  it('renders outcome shares, streaks and best periods for the selected direction', () => {
    const markup = renderToStaticMarkup(React.createElement(TradeAnalysis, { analysis: report('UTC').analysis, side: 'all' }));
    expect(markup).toContain('Longest winning streak</td><td>2 trades'); expect(markup).toContain('Best winning run net: 5');
    expect(markup).toContain('Best entry hour</td><td>12:00'); expect(markup).toContain('Best entry weekday</td><td>Monday'); expect(markup).toContain('Best entry month</td><td>January');
    const empty = renderToStaticMarkup(React.createElement(TradeAnalysis, { analysis: report('UTC').analysis, side: 'short' }));
    expect(empty).toContain('Best entry hour</td><td>None (no closed trades)');
  });
});
