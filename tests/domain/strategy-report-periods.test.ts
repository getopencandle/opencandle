import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { backtestStrategy } from '../../src/domain/strategy';
import { buildStrategyReport } from '../../src/domain/strategy-report';
import { buildReportPeriods, periodKey, REPORT_PERIOD_ROW_LIMIT } from '../../src/domain/strategy-report-periods';
import { validateAnalysis } from '../../src/strategy-report/responses';
import { ReportPeriodsTable } from '../../src/ui/StrategyDialog';

// Periodical (realized results by calendar period) and benchmarking (same-period buy-and-hold) rows.
const at = (iso: string) => Date.parse(iso) / 1000;
const rows = [
  { time: at('2025-03-30T12:00:00Z'), equity: 1000, buyHoldEquity: null },
  { time: at('2025-03-31T12:00:00Z'), equity: 1010, buyHoldEquity: 1000 },
  { time: at('2025-04-01T12:00:00Z'), equity: 990, buyHoldEquity: 1050 },
  { time: at('2025-04-02T12:00:00Z'), equity: 1020, buyHoldEquity: 1100 },
];
const closed = new Map([[1, { net: 10, count: 1 }], [3, { net: 30, count: 2 }]]);
const view = (list: readonly any[] | null) => list!.map(row => [row.key, row.startBarIndex, row.endBarIndex, row.closedTrades, row.closedNet, row.returnPercent, row.benchmarkReturnPercent]);

describe('calendar period keys', () => {
  it('uses ISO 8601 weeks and calendar quarters', () => {
    expect(periodKey('week', { year: 2021, month: 1, day: 3 })).toBe('2020-W53'); expect(periodKey('week', { year: 2021, month: 1, day: 4 })).toBe('2021-W01');
    expect(periodKey('week', { year: 2024, month: 12, day: 30 })).toBe('2025-W01'); expect(periodKey('week', { year: 2026, month: 10, day: 16 })).toBe('2026-W42');
    expect(periodKey('quarter', { year: 2025, month: 11, day: 1 })).toBe('2025-Q4'); expect(periodKey('day', { year: 2025, month: 4, day: 2 })).toBe('2025-04-02'); expect(periodKey('year', { year: 999, month: 1, day: 1 })).toBe('0999');
  });
});

describe('periodical and benchmark rows', () => {
  it('sums realized results by exit period and compares marked and buy-and-hold returns over the same boundaries', () => {
    const periods = buildReportPeriods(1000, rows, closed, 'UTC');
    // March: 1000 -> 1010 (+1%); benchmark starts in March at initial capital 1000 and closes at 1000 (0%).
    // April: 1010 -> 1020 (+0.9900990099%); benchmark 1000 -> 1100 (+10%). Closed 1 trade (10) in March, 2 (30) in April.
    expect(view(periods.rows.month)).toEqual([['2025-03', 0, 1, 1, 10, 1, 0], ['2025-04', 2, 3, 2, 30, 0.9900990099, 10]]);
    expect(view(periods.rows.quarter)).toEqual([['2025-Q1', 0, 1, 1, 10, 1, 0], ['2025-Q2', 2, 3, 2, 30, 0.9900990099, 10]]);
    expect(view(periods.rows.year)).toEqual([['2025', 0, 3, 3, 40, 2, 10]]);
    // 2025-03-30 is a Sunday (ISO week 13); the benchmark has not started there, so its return is null.
    expect(view(periods.rows.week)).toEqual([['2025-W13', 0, 0, 0, 0, 0, null], ['2025-W14', 1, 3, 3, 40, 2, 10]]);
    expect(periods.rows.day!.map(row => row.key)).toEqual(['2025-03-30', '2025-03-31', '2025-04-01', '2025-04-02']); expect(periods.rows.day![2]).toMatchObject({ openingEquity: 1010, closingEquity: 990, returnPercent: -1.9801980198, benchmarkReturnPercent: 5 });
  });
  it('assigns periods in the display time zone and nulls a kind with more than the row limit', () => {
    const late = [{ time: at('2025-04-01T05:00:00Z'), equity: 1000, buyHoldEquity: null }, { time: at('2025-04-01T12:00:00Z'), equity: 1000, buyHoldEquity: null }];
    expect(buildReportPeriods(1000, late, new Map(), 'UTC').rows.month!.map(row => row.key)).toEqual(['2025-04']);
    expect(buildReportPeriods(1000, late, new Map(), 'Pacific/Honolulu').rows.month!.map(row => row.key)).toEqual(['2025-03', '2025-04']);
    const daily = Array.from({ length: REPORT_PERIOD_ROW_LIMIT + 100 }, (_, index) => ({ time: at('2024-01-01T12:00:00Z') + index * 86400, equity: 1000, buyHoldEquity: null }));
    const many = buildReportPeriods(1000, daily, new Map(), 'UTC'); expect(many.rows.day).toBeNull(); expect(many.rows.week!.length).toBe(86); expect(many.rows.year!.map(row => row.key)).toEqual(['2024', '2025']);
  });
  it('is attached to the report, validated in transport, and rejects rows that miss closed allocations', () => {
    const start = at('2025-01-06T09:00:00Z'), opens = [10, 10, 12, 12], bars = opens.map((price, index) => ({ time: start + index * 3600, open: price, high: price, low: price, close: price, volume: 1 })), barIds = bars.map((_, index) => 'synthetic-periods:' + index);
    const result = backtestStrategy({ bars, barIds, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1 }] }, { barIndex: 1, orders: [{ action: 'sell', quantity: 1 }] }], config: { initialCapital: 1000 } });
    const report = buildStrategyReport({ bars, barIds, result, context: { executionId: 'synthetic-periods', sourceLabel: 'Synthetic periods fixture', currency: null, timezone: 'UTC' } });
    expect(view(report.analysis.periods!.rows.day)).toEqual([['2025-01-06', 0, 3, 1, 2, 0.2, 20]]);
    expect(() => validateAnalysis(report.analysis, 1, 'UTC')).not.toThrow();
    const tampered = structuredClone(report.analysis) as any; tampered.periods.rows.month[0].closedTrades = 0; expect(() => validateAnalysis(tampered, 1, 'UTC')).toThrow(/cover every closed allocation/);
    const gap = structuredClone(report.analysis) as any; gap.periods.rows.day[0].startBarIndex = 1; expect(() => validateAnalysis(gap, 1, 'UTC')).toThrow(/contiguous/);
    const legacy = structuredClone(report.analysis) as any; delete legacy.periods; expect(() => validateAnalysis(legacy, 1, 'UTC')).not.toThrow();
  });
  it('renders the selected period table and states an unavailable report', () => {
    const periods = buildReportPeriods(1000, rows, closed, 'UTC');
    const markup = renderToStaticMarkup(React.createElement(ReportPeriodsTable, { periods }));
    expect(markup).toContain('<td>2025-04</td><td>2</td><td>30</td>'); expect(markup).toContain('Month is the initial OpenCandle selection.');
    expect(renderToStaticMarkup(React.createElement(ReportPeriodsTable, { periods, initialKind: 'year' }))).toContain('<td>2025</td><td>3</td><td>40</td>');
    expect(renderToStaticMarkup(React.createElement(ReportPeriodsTable, { periods: undefined }))).toContain('Calendar periods are not available in this report.');
  });
});
