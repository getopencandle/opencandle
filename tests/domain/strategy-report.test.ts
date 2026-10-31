import { describe, expect, it } from 'vitest';
import { backtestStrategy } from '../../src/domain/strategy';
import { buildStrategyReport, buildStrategyReportAsync, STRATEGY_REPORT_LIMITS, type StrategyReportInput } from '../../src/domain/strategy-report';
import { STRATEGY_REPORT_METRICS } from '../../src/domain/strategy-report-catalog';
import { reportArithmeticFixture } from './strategy-report-fixtures';
const context = { executionId: 'synthetic-report-run-1', sourceLabel: 'Synthetic arithmetic fixture; no actual security prices', currency: 'USD', timezone: 'UTC' };
function input(): StrategyReportInput { const { bars, barIds, result } = reportArithmeticFixture(); return { bars, barIds, result, context }; }

describe('independent strategy report arithmetic', () => {
  it('checks every available reference-catalog value against the hand-specified eight-row fixture', () => {
    const report = buildStrategyReport(input()), all = report.metrics.all;
    const expected: Record<string, number | null> = {
      initialCapital:1000,openNet:1,closedNet:-4,grossProfit:4,grossLoss:8,profitFactor:.5,commission:7,expectedPayoff:-4/3,
      buyHoldPnl:-100,buyHoldPercent:-10,outperformance:96,closedTrades:3,openTrades:1,winners:1,losers:1,profitablePercent:100/3,
      averagePnl:-4/3,averageProfit:4,averageLoss:8,averageWinLoss:.5,largestProfit:4,largestProfitShare:100,
      largestLoss:8,largestLossShare:100,averageBars:2,averageWinnerBars:2,averageLoserBars:2,
      closedReturn:-.4,averageMargin:15.625,maxDrawdown:8,maxContracts:4,evenTrades:1,
      // Hand-derived closes are 1000,1001,1004,1000,996,997,996,997. Run-up from the
      // initial-capital trough 1000 to 1004 = 4. Close margins (100%) are 0,2*11,0,3*21,0,4*5.5,0,2*9; max 63.
      maxRunup:4,maxMargin:63,
      // Reference-article formulas, hand-derived from the same ledger.
      // Net/|largest loss| = -4/8. Intrabar drawdown per trade: T1 0+2*(10-8)=4, T2 (1004-1004)+3*(23-20)=9,
      // T3 (1004-996)+4*(5-4)=12, open D (1004-996)+2*(8-7)=10 -> 12. Run-up: T1 0+2*(13-10)=6, T2 (1004-1000)+3*(20-19)=7,
      // T3 0+4*(6-5)=4, open 0+2*(9-8)=2 -> 7. Account = margin 63 + 12. Return of drawdown = total -3 / 12.
      // One close run-up 1000->1004 from t=1000 to t=1120 (120 s); the 1004->996 decline never recovers (null averages).
      // All closes are in one UTC month (N=1, null ratios). CAGR: (997/1000)^(365/(420/86400)) underflows to -100%.
      netLargestLoss:-50,maxIntrabarDrawdown:12,maxIntrabarDrawdownInitial:1.2,maxIntrabarRunup:7,maxIntrabarRunupInitial:.7,
      returnDrawdown:-.25,accountRequired:75,returnAccountRequired:-400/75,averageRunup:4,averageRunupDuration:120,
      averageDrawdown:null,averageDrawdownDuration:null,sharpe:null,sortino:null,cagr:-100,
      // No margin call occurs at 100% margin in this fixture: zero events and zero liquidated notional.
      marginCalls:0,liquidatedVolume:0,largestLiquidation:0,
    };
    for(const metric of STRATEGY_REPORT_METRICS.filter(row=>row.articleId&&!row.unavailable)){
      expect(expected,metric.key).toHaveProperty(metric.key);
      if(expected[metric.key]===null){expect(all[metric.key],metric.key).toMatchObject({value:null,status:'undefined'});expect(all[metric.key].reason,metric.key).toBeTruthy();continue;}
      expect(all[metric.key].status,metric.key).toBe('available');
      expect(all[metric.key].value,metric.key).toBeCloseTo(expected[metric.key]!,8);
    }
    expect(report.metrics.long.averageMargin.value).toBe(7.75);expect(report.metrics.short.averageMargin.value).toBe(7.875);
    expect(report.metrics.long.maxMargin.value).toBe(22);expect(report.metrics.short.maxMargin.value).toBe(63);
  });
  it('reconciles closed, open, fee and direction results without double-counting costs', () => {
    const report = buildStrategyReport(input()), all = report.metrics.all;
    expect(all.closedNet.value).toBe(-4); expect(all.openGross.value).toBe(2); expect(all.openFees.value).toBe(1); expect(all.openNet.value).toBe(1);
    expect(all.totalProfit.value).toBe(-3); expect(all.finalEquity.value).toBe(997); expect(all.commission.value).toBe(7);
    expect(all.grossProfit.value).toBe(4); expect(all.grossLoss.value).toBe(8); expect(all.profitFactor.value).toBe(.5); expect(all.averagePnl.value).toBeCloseTo(-4 / 3, 9);
    expect(all.profitablePercent.value).toBeCloseTo(100 / 3, 9); expect([all.winners.value, all.losers.value, all.evenTrades.value]).toEqual([1, 1, 1]);
    expect(report.metrics.long.closedNet.value).toBe(4); expect(report.metrics.short.closedNet.value).toBe(-8); expect(report.metrics.long.commission.value).toBe(5); expect(report.metrics.short.commission.value).toBe(2);
    expect(all.openTrades.value).toBe(1); expect(all.maxContracts.value).toBe(4); expect(report.openLots[0]).toMatchObject({ quantity: 2, grossProfit: 2, remainingEntryCommission: 1, netProfit: 1 });
    expect(report.trades.map(row => row.cumulativeNet)).toEqual([4, -4, -4]); expect(report.trades[0].returnPercent).toBe(20); expect(report.trades[1].returnPercent).toBeCloseTo(-100 * 8 / 60, 9);
  });
  it('begins the disclosed benchmark at the first opening mark, not the unrelated first supplied bar', () => {
    const report = buildStrategyReport(input()); expect(report.benchmark).toMatchObject({ entryMark: 10, lastMark: 9, start: { barIndex: 1 } });
    expect(report.metrics.all.buyHoldPercent.value).toBe(-10); expect(report.metrics.all.buyHoldPnl.value).toBe(-100); expect(report.metrics.all.outperformance.value).toBe(96); expect(report.metrics.all.outperformancePoints.value).toBe(9.6);
    expect(report.equity[0].buyHoldEquity).toBeNull(); expect(report.metrics.long.buyHoldPnl.status).toBe('unavailable');
  });
  it('clips excursions at the exit open and excludes later high100/low1 from the closed long trade', () => {
    const report = buildStrategyReport(input()), trade = report.trades[0]; expect(trade.favorable.value).toBe(6); expect(trade.adverse.value).toBe(4); expect(trade.favorablePercent.value).toBe(30); expect(trade.adversePercent.value).toBe(20);
    expect(trade.entry).toMatchObject({ time: 1060, phase: 'open', timeBasis: 'bar-event-open', routePosition: 0 }); expect(trade.exit).toMatchObject({ time: 1120, phase: 'open', routePosition: 0 });
  });
  it('uses same-bar entry/exit locations on the assumed route and includes actual adverse slippage', () => {
    const bars = [{ time: 1000, open: 10, high: 10, low: 10, close: 10, volume: 1 }, { time: 1060, open: 10, high: 15, low: 9, close: 11, volume: 1 }];
    const result = backtestStrategy({ bars, signals: [{ barIndex: 0, orders: [{ id: 'entry', action: 'buy', quantity: 1, type: 'limit', limitPrice: 9.5 }, { id: 'exit', action: 'sell', quantity: 1, type: 'limit', limitPrice: 12, reduceOnly: true }] }], config: { initialCapital: 1000 } });
    const report = buildStrategyReport({ bars, barIds: ['a', 'b'], result, context }); expect(report.trades[0].favorable.value).toBe(2.5); expect(report.trades[0].adverse.value).toBe(.5); expect(report.trades[0].barsHeld).toBe(1);
    const slipped = backtestStrategy({ bars, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1 }] }, { barIndex: 1, orders: [{ action: 'close' }] }], config: { initialCapital: 1000, slippageTicks: 1, tickSize: 1, processOrdersOnClose: true } });
    const marked = buildStrategyReport({ bars, barIds: ['a', 'b'], result: slipped, context }); expect(marked.trades[0].entryPrice).toBe(11); expect(marked.benchmark.entryMark).toBe(10); expect(marked.trades[0].adverse.value).toBe(2);
  });
  it('preserves all53 reference metrics and marks unsupported liquidation/intrabar definitions unavailable', () => {
    const report = buildStrategyReport(input()); expect(STRATEGY_REPORT_METRICS.filter(row => row.articleId)).toHaveLength(53);
    expect(report.metrics.all.marginCalls).toMatchObject({ value: 0, status: 'available' }); expect(report.metrics.all.marginEfficiency).toMatchObject({ value: null, status: 'unavailable' }); expect(report.metrics.all.maxIntrabarDrawdown).toMatchObject({ value: 12, status: 'available' }); expect(report.metrics.all.pathDrawdown.status).toBe('available');
    expect(report.metrics.all.pathDrawdown.value).not.toBe(report.metrics.all.maxIntrabarDrawdown.value); expect(report.metrics.long.maxIntrabarDrawdown.status).toBe('unavailable');
  });
  it('distinguishes flat zeros, undefined ratios, missing currency and unavailable benchmarks', () => {
    const bars = [{ time: 1000, open: 10, high: 10, low: 10, close: 10, volume: 1 }], result = backtestStrategy({ bars, signals: [], config: { initialCapital: 1000 } });
    const report = buildStrategyReport({ bars, barIds: ['only'], result, context: { ...context, currency: null } });
    expect(report.metrics.all.openNet.value).toBe(0); expect(report.metrics.all.profitFactor).toMatchObject({ value: null, status: 'undefined' }); expect(report.metrics.all.buyHoldPercent.status).toBe('unavailable'); expect(report.context.currency).toBeNull(); expect(report.metrics.all.maxDrawdown.value).toBe(0);
  });
});

describe('report input and work boundaries', () => {
  it('rejects failed runs, mismatched prefixes, corrupted allocations and hostile getters without execution', () => {
    const a = input(); a.result.ok = false; expect(() => buildStrategyReport(a)).toThrow(/completed report/);
    const b = input(); b.barIds = ['wrong']; expect(() => buildStrategyReport(b)).toThrow(/prefix/);
    const c = input(); c.result.trades[0].commission = 3; expect(() => buildStrategyReport(c)).toThrow(/reconcile/);
    let calls = 0; const e = input(); Object.defineProperty(e.result.fills[0], 'price', { enumerable: true, get() { calls++; return 10; } }); expect(() => buildStrategyReport(e)).toThrow(/data fields/); expect(calls).toBe(0);
  });
  it('uses only the exact supplied prefix and keeps duplicate timestamps distinguished by stable IDs', () => {
    const original = reportArithmeticFixture(), prefix = original.bars.slice(0, 3), ids = original.barIds.slice(0, 3); let futureReads = 0;
    prefix[2] = { ...prefix[2], time: prefix[1].time };
    const result = backtestStrategy({ bars: prefix, barIds: ids, signals: original.signals.slice(0, 2), config: original.config });
    const report = buildStrategyReport({ bars: prefix, barIds: ids, result, context }); expect(report.trades[0].entry.time).toBe(report.trades[0].exit.time); expect(report.trades[0].entry.barId).not.toBe(report.trades[0].exit.barId); expect(futureReads).toBe(0);
    expect(report.trades[0].netProfit).toBe(4);
    const full = prefix.slice(); Object.defineProperty(full, 3, { enumerable: true, get() { futureReads++; throw new Error('future read'); } });
    expect(() => buildStrategyReport({ bars: full, barIds: ids, result, context })).toThrow(/prefix/); expect(futureReads).toBe(0);
  });
  it('cancels cooperative work and refuses exhaustion without returning a report', async () => {
    expect(() => buildStrategyReport({ ...input(), maxWork: 10 })).toThrow(/work limit/);
    const controller = new AbortController(), promise = buildStrategyReportAsync({ ...input(), signal: controller.signal }); controller.abort(); await expect(promise).rejects.toThrow(/cancelled/);
    expect(STRATEGY_REPORT_LIMITS.work).toBe(10000000);
  });
  it('keeps minted report structures immutable', () => {
    const report = buildStrategyReport(input()); expect(Object.isFrozen(report.trades[0])).toBe(true); expect(Object.isFrozen(report.metrics.all.closedNet)).toBe(true); expect(Object.isFrozen(report.config.commission)).toBe(true);
  });
  it('owns config, fills and allocations before the first asynchronous yield', async () => {
    const source = input(), pending = buildStrategyReportAsync(source);
    source.result.config.commission.value = 99; source.result.fills[0].price = 999; source.result.trades[0].netProfit = 999; source.bars[0].close = 999; source.context = { ...source.context, executionId: 'other' };
    const report = await pending; expect(report.config.commission.value).toBe(1); expect(report.trades[0].entryPrice).toBe(10); expect(report.trades[0].netProfit).toBe(4); expect(report.context.executionId).toBe(context.executionId);
  });
});
