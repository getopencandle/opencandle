import { describe, expect, it } from 'vitest';
import { backtestStrategy, type StrategySignal } from '../../src/domain/strategy';
import { buildStrategyReport } from '../../src/domain/strategy-report';
import { closeEquityEpisodes, compoundAnnualGrowth, monthEndEquity, monthKeyFormatter, monthlyRatios } from '../../src/domain/strategy-report-periods';
import type { Bar } from '../../src/domain/types';
import { reportArithmeticFixture } from './strategy-report-fixtures';
const fixtureReport = () => { const { bars, barIds, result } = reportArithmeticFixture(); return buildStrategyReport({ bars, barIds, result, context }); };

// Strategy report oracles. Every expected number below is a literal: either printed in the public reference app help
// article named in the test, or hand/Python-Decimal derived from the article formula.
const context = { executionId: 'synthetic-reference-metrics', sourceLabel: 'Synthetic reference-metric fixture; no actual security prices', currency: null, timezone: 'UTC' };
const DAY = 86400, utc = (date: string) => Date.parse(date + 'T00:00:00Z') / 1000;
const bar = (time: number, open: number, high: number, low: number, close: number): Bar => ({ time, open, high, low, close, volume: 1 });
function report(bars: Bar[], signals: StrategySignal[], initialCapital: number, extra: Record<string, unknown> = {}) {
  const barIds = bars.map((_, index) => 'synthetic-reference:' + index);
  const result = backtestStrategy({ bars, barIds, signals, config: { initialCapital, ...extra } });
  expect(result.ok, result.diagnostics.join(' ')).toBe(true);
  return buildStrategyReport({ bars, barIds, result, context });
}

describe('reference intrabar drawdown and run-up', () => {
  it('reproduces the published worked example of help article 43000681690 (max drawdown, intrabar)', () => {
    // Article: 10,000 initial; long 44 @ 34.08 (lows 33.55 then 30.67 -> 23.32, 150.04); close long @ 31.81 (equity 9,900.12);
    // short 45 @ 31.81 (highs 34.29 then 35.34 -> 211.48, 258.73). Final published max drawdown: 258.73.
    const bars = [bar(0, 34, 34.2, 33.9, 34.08), bar(DAY, 34.08, 34.5, 33.55, 34), bar(2 * DAY, 33, 33.5, 30.67, 31.5), bar(3 * DAY, 31.81, 34.29, 31.5, 33), bar(4 * DAY, 33.5, 35.34, 33.4, 35), bar(5 * DAY, 35, 35.2, 34, 34.5)];
    const signals: StrategySignal[] = [{ barIndex: 0, orders: [{ id: 'long', action: 'buy', quantity: 44 }] }, { barIndex: 2, orders: [{ id: 'exit-long', action: 'close' }, { id: 'short', action: 'sell', quantity: 45 }] }];
    const all = report(bars, signals, 10000).metrics.all;
    expect(all.closedNet.value).toBeCloseTo(-99.88, 9);
    expect(all.maxIntrabarDrawdown).toMatchObject({ status: 'available' }); expect(all.maxIntrabarDrawdown.value).toBeCloseTo(258.73, 9);
    expect(all.maxIntrabarDrawdownInitial.value).toBeCloseTo(2.5873, 9);
    // Return of max drawdown = total PnL / 258.73. Short open net at final close 34.5: 45 * (31.81 - 34.5) = -121.05.
    expect(all.totalProfit.value).toBeCloseTo(-220.93, 9); expect(all.returnDrawdown.value).toBeCloseTo(-220.93 / 258.73, 9);
  });
  it('reproduces both published per-trade products of help article 43000682585 (max run-up, intrabar)', () => {
    // Article products: 32 * (64.05 - 47.11) = 542.08 for the first trade and 41 * (35.44 - 19.9) = 637.14 for the second,
    // the final max run-up. The second entry occurs at the minimum realized equity, so its equity term is zero.
    const bars = [bar(0, 47, 47.2, 46.9, 47.1), bar(DAY, 47.11, 64.05, 46, 60), bar(2 * DAY, 40, 41, 39, 40), bar(3 * DAY, 19.9, 35.44, 19.5, 30), bar(4 * DAY, 30, 31, 29, 30)];
    const signals: StrategySignal[] = [{ barIndex: 0, orders: [{ id: 'a', action: 'buy', quantity: 32 }] }, { barIndex: 1, orders: [{ id: 'a-exit', action: 'close' }] }, { barIndex: 2, orders: [{ id: 'b', action: 'buy', quantity: 41 }] }];
    const built = report(bars, signals, 10000), all = built.metrics.all;
    expect(built.trades[0].favorable.value).toBeCloseTo(542.08, 9); expect(built.trades[0].netProfit).toBeCloseTo(-227.52, 9);
    expect(all.maxIntrabarRunup.value).toBeCloseTo(637.14, 9); expect(all.maxIntrabarRunupInitial.value).toBeCloseTo(6.3714, 9);
  });
  it('refuses a value when pyramided or partially closed allocations overlap, and keeps dependent metrics unavailable', () => {
    const bars = [bar(0, 10, 10, 10, 10), bar(DAY, 10, 11, 9, 10), bar(2 * DAY, 10, 12, 8, 11), bar(3 * DAY, 11, 11, 11, 11)];
    const signals: StrategySignal[] = [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1 }] }, { barIndex: 1, orders: [{ action: 'buy', quantity: 1 }] }, { barIndex: 2, orders: [{ action: 'close' }] }];
    const all = report(bars, signals, 1000, { pyramiding: 2 }).metrics.all;
    for (const key of ['maxIntrabarDrawdown', 'maxIntrabarDrawdownInitial', 'maxIntrabarRunup', 'maxIntrabarRunupInitial', 'returnDrawdown', 'accountRequired', 'returnAccountRequired']) { expect(all[key], key).toMatchObject({ value: null, status: 'unavailable' }); expect(all[key].reason, key).toMatch(/Overlapping or partially closed/); }
    expect(all.maxDrawdown.status).toBe('available');
  });
  it('derives account size and its return from maximum close margin plus intrabar drawdown', () => {
    const all = fixtureReport().metrics.all;
    expect(all.maxMargin.value).toBe(63); expect(all.maxIntrabarDrawdown.value).toBe(12); expect(all.accountRequired.value).toBe(75);
    expect(all.returnAccountRequired.value).toBeCloseTo(-4 / 75 * 100, 9); expect(all.netLargestLoss.value).toBe(-50);
  });
});

describe('net profit as percent of largest loss', () => {
  it('uses each direction\'s closed net and largest losing allocation, undefined without a loser', () => {
    const metrics = fixtureReport().metrics;
    expect(metrics.short.netLargestLoss.value).toBe(-100); // short closed net -8 / |largest short loss 8|
    expect(metrics.long.netLargestLoss).toMatchObject({ value: null, status: 'undefined', reason: 'No losing closed trade exists in this direction.' });
  });
});

describe('close-equity episodes', () => {
  it('averages completed run-ups and recovered drawdowns with explicit plateau and unrecovered-tail handling', () => {
    // Seed 1000 at t0; closes 1000,1100,1050,990,1100(recovers),1200,1150,1180 at one-day steps.
    const points = [1000, 1100, 1050, 990, 1100, 1200, 1150, 1180].map((equity, index) => ({ time: index * DAY, equity }));
    const episodes = closeEquityEpisodes(1000, 0, points);
    expect(episodes.runups.map(row => [row.amount, row.seconds])).toEqual([[100, DAY], [210, 2 * DAY]]); // 1000->1100; trough 990 (day 3) -> new peak 1200 (day 5)
    expect(episodes.drawdowns.map(row => [row.amount, row.seconds, row.recoveryTime])).toEqual([[110, 3 * DAY, 4 * DAY]]); // peak day 1 -> regains 1100 on day 4
    expect(episodes.unrecovered).toEqual({ amount: 50, peakTime: 5 * DAY, troughTime: 6 * DAY });
  });
  it('reports the fixture run-up and leaves drawdown averages undefined when no decline recovers', () => {
    const all = fixtureReport().metrics.all;
    expect(all.averageRunup.value).toBe(4); expect(all.averageRunupDuration).toMatchObject({ value: 120, unit: 'seconds' });
    expect(all.averageDrawdown).toMatchObject({ value: null, status: 'undefined' }); expect(all.averageDrawdown.reason).toContain('unrecovered final decline of 8');
    expect(all.maxRunup.value).toBe(4);
  });
  it('has no run-up for a monotone decline and treats equality as recovery', () => {
    expect(closeEquityEpisodes(100, 0, [{ time: 0, equity: 90 }, { time: 1, equity: 80 }])).toEqual({ runups: [], drawdowns: [], unrecovered: { amount: 20, peakTime: 0, troughTime: 1 } });
    expect(closeEquityEpisodes(100, 0, [{ time: 1, equity: 90 }, { time: 2, equity: 100 }]).drawdowns).toEqual([{ amount: 10, seconds: 2, peakTime: 0, troughTime: 1, recoveryTime: 2 }]);
  });
});

describe('monthly Sharpe and Sortino ratios', () => {
  const monthly = () => [bar(utc('2025-01-01'), 10, 10, 10, 10), bar(utc('2025-01-02'), 10, 10, 10, 10), bar(utc('2025-01-31'), 11, 11, 11, 11), bar(utc('2025-02-28'), 10.45, 10.45, 10.45, 10.45), bar(utc('2025-03-31'), 11.495, 11.495, 11.495, 11.495)];
  it('matches independent Python Decimal values for returns +10%, -5%, +10% at the documented 2% annual risk-free rate', () => {
    // 100 units bought at 10 with 1000 capital: month-end equity 1100, 1045, 1149.5. MR=0.05, RFR=0.02/12,
    // SD=sqrt(0.005), downside sqrt(((-0.05-0.02/12)^2)/3). Python Decimal(50): 0.683536555147, 1.620305594177.
    const all = report(monthly(), [{ barIndex: 0, orders: [{ action: 'buy', quantity: 100 }] }], 1000).metrics.all;
    expect(all.sharpe.value).toBeCloseTo(0.68353655514699594, 9); expect(all.sortino.value).toBeCloseTo(1.6203055941773368, 9);
    expect(all.sharpe.basis).toContain('N=3');
    // CAGR over Jan 1 -> Mar 31 2025 (89 days): (1.1495^(365/89) - 1) * 100; Python: 77.07399581392310.
    expect(all.cagr.value).toBeCloseTo(77.0739958139231, 8);
    // Close equity 1000 (Jan 1, Jan 2), 1100 (Jan 31), 1045 (Feb 28), 1149.5 (Mar 31). Run-ups: 1000 -> 1100 from the last
    // flat close (Jan 2) to Jan 31 = 29 days; 1045 -> 1149.5 from Feb 28 to Mar 31 = 31 days. One recovered drawdown
    // 1100 -> 1045, peak Jan 31 to recovery Mar 31 = 59 days.
    expect(all.averageRunup.value).toBe(102.25); expect(all.averageRunupDuration.value).toBe(30 * DAY);
    expect(all.averageDrawdown.value).toBe(55); expect(all.averageDrawdownDuration.value).toBe(59 * DAY);
  });
  it('mirrors the article example return: equity 100 on January 1 and 110 on February 1 is a 10% January return', () => {
    expect(monthlyRatios(100, [{ month: '2026-01', time: 0, equity: 110 }]).returns).toEqual([0.1]);
  });
  it('assigns month ends in the explicit display time zone and calls the formatter a bounded number of times', () => {
    const points = [{ time: Date.parse('2025-01-31T12:00:00Z') / 1000, equity: 1100 }, { time: Date.parse('2025-01-31T20:00:00Z') / 1000, equity: 1200 }, { time: Date.parse('2025-02-28T12:00:00Z') / 1000, equity: 1045 }];
    expect(monthEndEquity(points, monthKeyFormatter('UTC')).map(row => [row.month, row.equity])).toEqual([['2025-01', 1200], ['2025-02', 1045]]);
    expect(monthEndEquity(points, monthKeyFormatter('Asia/Tokyo')).map(row => [row.month, row.equity])).toEqual([['2025-01', 1100], ['2025-02', 1045]]);
    let calls = 0; const key = monthKeyFormatter('UTC'), dense = Array.from({ length: 5700 }, (_, index) => ({ time: utc('2025-01-01') + index * 1800, equity: 1000 + index }));
    const months = monthEndEquity(dense, time => { calls++; return key(time); });
    expect(months.map(row => row.month)).toEqual(['2025-01', '2025-02', '2025-03', '2025-04']); expect(months[0].time).toBe(utc('2025-01-31') + 23.5 * 3600); expect(calls).toBeLessThan(120);
  });
  it('returns explained undefined values for one month, zero variance and no downside', () => {
    expect(monthlyRatios(1000, [{ month: '2025-01', time: 0, equity: 1100 }])).toMatchObject({ sharpe: null, sortino: null, sharpeReason: 'At least two monthly returns are required.' });
    const flat = monthlyRatios(1000, [{ month: '2025-01', time: 0, equity: 1100 }, { month: '2025-02', time: 1, equity: 1210 }]);
    expect(flat.sharpe).toBeNull(); expect(flat.sharpeReason).toMatch(/zero standard deviation/); expect(flat.sortino).toBeNull(); expect(flat.sortinoReason).toMatch(/downside deviation is zero/);
  });
});

describe('annualized return (CAGR)', () => {
  it('compounds over calendar days: 1000 -> 1210 across 730 days is exactly 10% a year', () => {
    expect(compoundAnnualGrowth(1000, 1210, 0, 730 * DAY).value).toBeCloseTo(10, 9);
    expect(compoundAnnualGrowth(1000, 810, 0, 730 * DAY).value).toBeCloseTo(-10, 9);
  });
  it('is undefined with a reason for zero elapsed time, nonpositive equity and overflow', () => {
    expect(compoundAnnualGrowth(1000, 1100, 5, 5)).toEqual({ value: null, reason: 'The supplied history spans no elapsed calendar time.' });
    expect(compoundAnnualGrowth(1000, 0, 0, DAY).value).toBeNull();
    expect(compoundAnnualGrowth(1000, 2000, 0, 1)).toEqual({ value: null, reason: 'Annualizing this short history exceeds the finite reporting range.' });
  });
});

describe('metric display text', () => {
  it('shows durations in calendar days, under one day as <1 day, and undefined values with their status', async () => {
    const { strategyMetricText } = await import('../../src/ui/StrategyDialog');
    expect(strategyMetricText(129600, 'seconds', 'available')).toBe((1.5).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' calendar days');
    expect(strategyMetricText(120, 'seconds', 'available')).toBe('<1 day');
    expect(strategyMetricText(null, 'ratio', 'undefined')).toBe('Unavailable (undefined)');
    expect(strategyMetricText(-50, 'percent', 'available')).toBe((-50).toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' percent');
  });
});
