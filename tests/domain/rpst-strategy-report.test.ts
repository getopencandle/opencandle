// RPST strategy report: analyses (distribution, margin usage, growth/decline, benchmark, testing period, FX) and XLSX export.
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildStrategyReport } from '../../src/domain/strategy-report';
import { crc32, strategyReportCsv, strategyReportXlsx, STRATEGY_XLSX_SCHEMA } from '../../src/domain/strategy-report-export';
import {
  applyTestingPeriod, benchmarkComparison, convertAsOf, DISTRIBUTION_BASIS, growthDeclinePeriods, marginUsage, marginUsageHover, testingPeriodRange, tradeDistribution, tradeReturnPercent, type AnalysisTrade,
} from '../../src/domain/strategy-report-periods';
import { reportArithmeticFixture } from './strategy-report-fixtures';
import { DEFAULT_STRATEGY_CONFIG } from '../../src/domain/strategy';
import { validateReportStart } from '../../src/strategy-report/schema';

const trade = (netProfit: number, entryPrice = 100, quantity = 1, entryBar = 0, exitBar = 1): AnalysisTrade => ({ direction: 'long', quantity, entryPrice, netProfit, entryBar, exitBar });

describe('RPST trade distribution (STRATEGY.REPORT.TRADE_ANALYSIS.DISTRIBUTION/.HISTOGRAM/.OUTLIERS)', () => {
  it('bins returns on entry notional, separates wins and losses, and places average gain/loss markers', () => {
    const trades = [trade(3), trade(1.5), trade(-2), trade(0), trade(-0.4, 200, 2)];
    expect(tradeReturnPercent(trades[4])).toBe(-0.1);
    const result = tradeDistribution(trades);
    if (!result.available) throw new Error(result.reason);
    expect(result.binWidthPercent).toBe(0.5); expect(result.basis).toBe(DISTRIBUTION_BASIS);
    expect(result.bins[0]).toEqual({ from: -2, to: -1.5, winning: 0, losing: 1, even: 0 });
    const counts = result.bins.reduce((sum, bin) => ({ winning: sum.winning + bin.winning, losing: sum.losing + bin.losing, even: sum.even + bin.even }), { winning: 0, losing: 0, even: 0 });
    expect(counts).toEqual({ winning: 2, losing: 2, even: 1 });
    expect(result.bins.find(bin => bin.from === 3)!.winning).toBe(1);
    expect(result.averageGainPercent).toBe(2.25); expect(result.averageLossPercent).toBe(-1.05);
    expect(result.outliers.available).toBe(false); expect(result.outliers.reason).toContain('not established');
  });
  it('wide ranges widen the bin; no trades is an explicit unavailable state', () => {
    const wide = tradeDistribution([trade(-50), trade(150)]); if (!wide.available) throw new Error('expected bins');
    expect(wide.binWidthPercent).toBe(10); expect(wide.bins).toHaveLength(21);
    expect(tradeDistribution([])).toEqual({ available: false, reason: 'No closed trades with a positive entry notional.' });
  });
});

describe('RPST margin usage, growth/decline and benchmark (STRATEGY.REPORT.PERFORMANCE.*, CHART.*)', () => {
  it('modeled margin = |position| x close x margin percent with open-trade count for hover', () => {
    const points = [{ barIndex: 0, time: 10, position: 0 }, { barIndex: 1, time: 20, position: 10 }, { barIndex: 2, time: 30, position: -5 }, { barIndex: 3, time: 40, position: 0 }];
    const series = marginUsage(points, [100, 101, 102, 103], [trade(1, 100, 10, 1, 2), trade(1, 102, 5, 2, 3)], 50, 25);
    expect(series.map(row => row.margin)).toEqual([0, 505, 127.5, 0]); expect(series.map(row => row.openTrades)).toEqual([0, 1, 1, 0]);
    expect(marginUsageHover(series, 1)).toEqual({ tradeCount: 1, margin: 505, time: 20 }); expect(marginUsageHover(series, 9)).toBeNull();
  });
  it('growth and decline periods carry amount, percent of starting equity and dates; summary shows current decline', () => {
    const points = [{ time: 2, equity: 110 }, { time: 3, equity: 99 }, { time: 4, equity: 120 }, { time: 5, equity: 90 }];
    const result = growthDeclinePeriods(100, 1, points);
    expect(result.periods).toEqual([
      { kind: 'growth', amount: 10, percent: 10, startTime: 1, endTime: 2 },
      { kind: 'decline', amount: 11, percent: 10, startTime: 2, endTime: 4 },
      { kind: 'growth', amount: 21, percent: 21.2121212121, startTime: 3, endTime: 4 },
    ]);
    expect(result.summary.growth).toEqual({ max: 21, average: 15.5, current: 0 }); expect(result.summary.decline).toEqual({ max: 30, average: 11, current: 30 }); // Max includes the unrecovered decline; average stays over completed episodes
  });
  it('benchmark comparison shows cumulative strategy and buy-and-hold returns; missing benchmark stays null', () => {
    expect(benchmarkComparison(1000, [{ time: 1, equity: 1100, buyHoldEquity: 1050 }, { time: 2, equity: 900, buyHoldEquity: null }])).toEqual([{ time: 1, strategyPercent: 10, benchmarkPercent: 5 }, { time: 2, strategyPercent: -10, benchmarkPercent: null }]);
    expect(benchmarkComparison(1000, [])).toMatchObject({ available: false });
  });
});

describe('RPST testing period and account currency (STRATEGY.REPORT.CURRENT.TESTING_PERIOD/ACCOUNT_CURRENCY, STRATEGY.CONFIG.CURRENCY)', () => {
  it('testing period selects inclusive bar range and rebases signals; invalid ranges are refused', () => {
    const times = [10, 20, 30, 40, 50];
    expect(testingPeriodRange(times, 15, 40)).toEqual({ ok: true, startIndex: 1, endIndex: 3 });
    expect(testingPeriodRange(times, null, null)).toEqual({ ok: true, startIndex: 0, endIndex: 4 });
    expect(testingPeriodRange(times, 41, 49)).toMatchObject({ ok: false }); expect(testingPeriodRange(times, 40, 10)).toMatchObject({ ok: false });
    expect(applyTestingPeriod([{ barIndex: 0, orders: [] }, { barIndex: 2, orders: [] }, { barIndex: 4, orders: [] }], { startIndex: 1, endIndex: 3 })).toEqual([{ barIndex: 1, orders: [] }]);
  });
  it('as-of FX conversion uses the latest rate at or before the event; missing FX is unavailable, never 1', () => {
    const rates = [{ time: 100, rate: 1.1 }, { time: 200, rate: 1.2 }];
    expect(convertAsOf(50, 150, 'EUR', 'USD', rates)).toEqual({ available: true, value: 55, rateTime: 100 });
    expect(convertAsOf(50, 200, 'EUR', 'USD', rates)).toEqual({ available: true, value: 60, rateTime: 200 });
    expect(convertAsOf(50, 99, 'EUR', 'USD', rates)).toMatchObject({ available: false });
    expect(convertAsOf(50, 150, 'EUR', 'USD', null)).toMatchObject({ available: false, reason: 'No EUR/USD rate is loaded. Account currency conversion is unavailable.' });
    expect(convertAsOf(50, 150, 'USD', 'USD', null)).toEqual({ available: true, value: 50, rateTime: null });
  });
});

describe('RPST worker transport accepts the optional default order size', () => {
  const start = (config: Record<string, unknown>) => ({ context: { executionId: 'x', sourceLabel: 'Synthetic', currency: null, timezone: 'UTC' }, config, counts: { bars: 0, standardBars: 0, barIds: 0, proposals: 0 }, chartType: 'standard' });
  it('passes defaultQuantity through and still rejects missing or unknown config fields', () => {
    expect(validateReportStart(start({ ...DEFAULT_STRATEGY_CONFIG, defaultQuantity: { kind: 'cash', value: 1000 } })).config.defaultQuantity).toEqual({ kind: 'cash', value: 1000 });
    expect(validateReportStart(start({ ...DEFAULT_STRATEGY_CONFIG })).config.defaultQuantity).toBeUndefined();
    expect(() => validateReportStart(start({ ...DEFAULT_STRATEGY_CONFIG, defaultQuantity: { kind: 'cash' } }))).toThrow();
    expect(() => validateReportStart(start({ ...DEFAULT_STRATEGY_CONFIG, defaultQuantity: { kind: 'percent-of-equity', value: 101 } }))).toThrow(/at most 100/);
    const { pyramiding: _drop, ...missing } = DEFAULT_STRATEGY_CONFIG; expect(() => validateReportStart(start(missing))).toThrow(/missing/);
    expect(() => validateReportStart(start({ ...DEFAULT_STRATEGY_CONFIG, extra: 1 }))).toThrow(/unsupported/);
  });
});

describe('RPST XLSX export (STRATEGY.REPORT.EXPORT.XLSX)', () => {
  function unzip(bytes: Uint8Array): Map<string, string> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), files = new Map<string, string>();
    const end = bytes.length - 22; expect(view.getUint32(end, true)).toBe(0x06054b50);
    const count = view.getUint16(end + 10, true); let offset = view.getUint32(end + 16, true);
    for (let i = 0; i < count; i++) {
      expect(view.getUint32(offset, true)).toBe(0x02014b50);
      const method = view.getUint16(offset + 10, true), crc = view.getUint32(offset + 16, true), size = view.getUint32(offset + 20, true), nameLength = view.getUint16(offset + 28, true), local = view.getUint32(offset + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      expect(view.getUint32(local, true)).toBe(0x04034b50);
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = bytes.subarray(start, start + size), data = method === 0 ? raw : new Uint8Array(inflateRawSync(raw));
      expect(crc32(data)).toBe(crc); files.set(name, new TextDecoder().decode(data)); offset += 46 + nameLength;
    }
    return files;
  }
  const { bars, barIds, result } = reportArithmeticFixture();
  const report = buildStrategyReport({ bars, barIds, result, context: { executionId: '=UNTRUSTED()', sourceLabel: 'Synthetic <fixture> & "quotes"', currency: null, timezone: 'UTC' } });
  it('writes a valid OOXML package with Metrics, Trades, Orders and Assumptions sheets', () => {
    const bytes = strategyReportXlsx(report);
    expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const files = unzip(bytes);
    expect([...files.keys()]).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml', 'xl/worksheets/sheet4.xml']);
    expect(files.get('[Content_Types].xml')).toContain('spreadsheetml.sheet.main+xml');
    expect(files.get('xl/workbook.xml')).toContain('<sheet name="Metrics" sheetId="1" r:id="rId1"/>'); expect(files.get('xl/workbook.xml')).toContain('name="Assumptions"');
    const trades = files.get('xl/worksheets/sheet2.xml')!;
    expect(trades).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">execution_id</t></is></c>');
    expect(trades).toContain("'=UNTRUSTED()"); expect(trades).toContain('Synthetic &lt;fixture&gt; &amp; &quot;quotes&quot;');
    expect(trades).toMatch(/<c r="[A-Z]+2"><v>-?\d/);
    const assumptions = files.get('xl/worksheets/sheet4.xml')!; expect(assumptions).toContain(STRATEGY_XLSX_SCHEMA); expect(assumptions).toContain('virtual money'); expect(assumptions).toContain('policy_1');
  });
  it('sheet rows mirror the CSV exports cell for cell and are deterministic', () => {
    const files = unzip(strategyReportXlsx(report)), csvLines = strategyReportCsv(report, 'orders').split('\r\n').filter(Boolean);
    expect((files.get('xl/worksheets/sheet3.xml')!.match(/<row /g) ?? []).length).toBe(csvLines.length);
    expect(strategyReportXlsx(report)).toEqual(strategyReportXlsx(report));
    expect(() => strategyReportXlsx({ ...report })).toThrow(/completed report/);
  });
});
