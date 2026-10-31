import { afterEach, describe, expect, it } from 'vitest';
import { backtestStrategy, validateStrategyConfig, DEFAULT_STRATEGY_CONFIG, type StrategySignal } from '../../src/domain/strategy';
import { buildStrategyReport, buildStrategyReportAsync, type StrategyReportContext } from '../../src/domain/strategy-report';
import { strategyReportJson } from '../../src/domain/strategy-report-export';
import { restoreStrategyReportJson, RESTORE_MAX_BYTES } from '../../src/strategy-report/restore';
import { readFileSync } from 'node:fs';
import { createStrategyReportClient } from '../../src/strategy-report/client';
import { StrategyReportWorkerSession } from '../../src/strategy-report/worker-core';
import type { StrategyReportJobInput, StrategyReportOwner } from '../../src/strategy-report/types';
import type { Bar } from '../../src/domain/types';
import { reportArithmeticFixture } from './strategy-report-fixtures';
import { ReportLoopbackPort } from './strategy-report-test-port';

// Strategy tester independent oracles. Every expected number is derived by hand in the
// comments from explicitly synthetic prices; none is copied from engine output.
const context: StrategyReportContext = { executionId: 'lv-c12-synthetic', sourceLabel: 'Explicit synthetic OpenCandle-C12 fixture; no actual security prices', currency: 'USD', timezone: 'UTC' };
const bar = (time: number, open: number, high: number, low: number, close: number): Bar => ({ time, open, high, low, close, volume: 1 });
const ids = (bars: readonly Bar[]) => bars.map((_, index) => 'lv-c12:' + index);

describe('fills, fees, slippage, equity and drawdown (independent arithmetic)', () => {
  // Short entry with per-unit commission and two ticks of 0.5 slippage (1.0 price).
  const bars = [bar(0, 100, 100, 100, 100), bar(60, 101, 103, 100, 102), bar(120, 97, 100, 96, 98), bar(180, 98, 98, 98, 98)];
  const signals: StrategySignal[] = [{ barIndex: 0, orders: [{ id: 'short', action: 'sell', quantity: 10 }] }, { barIndex: 1, orders: [{ id: 'cover', action: 'close' }] }];
  const config = { initialCapital: 10000, tickSize: 0.5, slippageTicks: 2, commission: { kind: 'per-unit' as const, value: 0.1 } };
  it('fills a short at next open minus slippage and covers at next open plus slippage', () => {
    const result = backtestStrategy({ bars, signals, config });
    expect(result.ok).toBe(true);
    // Sell: 101 open - 2*0.5 = 100. Cover buy: 97 open + 1 = 98. Fees 10*0.1 = 1 per fill.
    expect(result.fills.map(fill => [fill.barIndex, fill.price, fill.commission, fill.phase])).toEqual([[1, 100, 1, 'open'], [2, 98, 1, 'open']]);
    // Cash after short: 10000 + 10*100 - 1 = 10999; bar1 close 102 marks 10999 - 1020 = 9979.
    // Cash after cover: 10999 - 10*98 - 1 = 10018, flat from there.
    expect(result.equity.map(point => point.equity)).toEqual([10000, 9979, 10018, 10018]);
    expect(result.trades[0]).toMatchObject({ direction: 'short', grossProfit: 20, commission: 2, netProfit: 18 });
  });
  it('reports drawdown, run-up, margin, benchmark and excursions from the same arithmetic', () => {
    const result = backtestStrategy({ bars, signals, config }), report = buildStrategyReport({ bars, barIds: ids(bars), result, context }), all = report.metrics.all;
    // Peak 10000 (initial) to 9979: 21 = 0.21%. Trough 9979 to 10018: run-up 39.
    expect(all.maxDrawdown.value).toBe(21); expect(all.maxDrawdownPercent.value).toBeCloseTo(0.21, 10); expect(all.maxRunup.value).toBe(39);
    expect(all.closedNet.value).toBe(18); expect(all.commission.value).toBe(2); expect(all.totalReturn.value).toBeCloseTo(0.18, 10);
    expect(all.profitFactor).toMatchObject({ value: null, status: 'undefined' });
    // Close margins at 100%: only bar1 holds 10 * 102 = 1020. Average over four closes = 255.
    expect(all.maxMargin.value).toBe(1020); expect(all.averageMargin.value).toBe(255); expect(report.metrics.short.maxMargin.value).toBe(1020); expect(report.metrics.long.maxMargin.value).toBe(0);
    // Benchmark starts at the pre-slippage opening mark 101 and ends at close 98: 98/101 - 1.
    expect(all.buyHoldPercent.value).toBeCloseTo((98 / 101 - 1) * 100, 8); expect(all.buyHoldPnl.value).toBeCloseTo((98 / 101 - 1) * 10000, 6);
    // Route bar1 (open 101 nearer low 100): 101,100,103,102. Exit bar opens 97. Low 97, high 103 vs entry 100.
    const trade = report.trades[0]; expect(trade.favorable.value).toBe(30); expect(trade.adverse.value).toBe(30); expect(trade.favorablePercent.value).toBe(3); expect(trade.returnPercent).toBeCloseTo(1.8, 10);
  });
  it('fills limits without slippage, charges percent fees on each fill and slips stop-market fills', () => {
    const priced = [bar(0, 50, 50, 50, 50), bar(60, 50, 52, 49, 51), bar(120, 51, 56, 50, 55), bar(180, 55, 55, 55, 55)];
    const costs = { initialCapital: 1000, tickSize: 0.5, slippageTicks: 2, commission: { kind: 'percent' as const, value: 0.2 } };
    const limit = backtestStrategy({ bars: priced, config: costs, signals: [{ barIndex: 0, orders: [{ id: 'entry', action: 'buy', quantity: 4, type: 'limit', limitPrice: 49.5 }] }, { barIndex: 1, orders: [{ id: 'target', action: 'sell', quantity: 4, type: 'limit', limitPrice: 54, reduceOnly: true }] }] });
    // Bar1 route 50,49,52,51 crosses 49.5 -> fill 49.5, fee 4*49.5*0.2% = 0.396.
    // Bar2 route 51,50,56,55 crosses 54 -> fill 54, fee 4*54*0.2% = 0.432. Net (54-49.5)*4 - 0.828 = 17.172.
    expect(limit.fills.map(fill => [fill.price, fill.commission, fill.phase])).toEqual([[49.5, 0.396, 'intrabar'], [54, 0.432, 'intrabar']]);
    expect(limit.equity.map(point => point.equity)).toEqual([1000, 1005.604, 1017.172, 1017.172]); expect(limit.metrics.netProfitClosed).toBe(17.172);
    const stop = backtestStrategy({ bars: priced, config: costs, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1, type: 'stop', stopPrice: 52 }] }] });
    // Stop triggers at 52 on the 49->52 leg, fills 52 + 1 slippage = 53; fee 0.106; close 51 marks 1000-53-0.106+51.
    expect(stop.fills[0]).toMatchObject({ price: 53, commission: 0.106 }); expect(stop.equity[1].equity).toBe(997.894);
  });
});

describe('future-data exclusion and replay prefixes', () => {
  it('never lets later bars change earlier fills, equity or report rows', () => {
    const { bars, signals, config } = reportArithmeticFixture(), full = backtestStrategy({ bars, signals, config });
    const altered = bars.map((row, index) => index > 3 ? bar(row.time, 900, 999, 1, 2) : row), changed = backtestStrategy({ bars: altered, signals, config });
    expect(changed.equity.slice(0, 4)).toEqual(full.equity.slice(0, 4));
    expect(changed.fills.filter(fill => fill.barIndex <= 3)).toEqual(full.fills.filter(fill => fill.barIndex <= 3));
  });
  it('produces identical rows for every replay prefix and its closed trades are a prefix of the full run', () => {
    const { bars, signals, config } = reportArithmeticFixture(), full = backtestStrategy({ bars, signals, config }), fullReport = buildStrategyReport({ bars, barIds: ids(bars), result: full, context });
    for (let n = 1; n <= bars.length; n++) {
      const prefix = bars.slice(0, n), result = backtestStrategy({ bars: prefix, signals: signals.filter(signal => signal.barIndex < n), config });
      const report = buildStrategyReport({ bars: prefix, barIds: ids(prefix), result, context });
      expect(result.equity, `prefix ${n}`).toEqual(full.equity.slice(0, n));
      expect(result.trades, `prefix ${n}`).toEqual(full.trades.filter(trade => trade.exitBar < n));
      expect(report.equity.map(row => [row.equity, row.closedNet, row.drawdown]), `prefix ${n}`).toEqual(fullReport.equity.slice(0, n).map(row => [row.equity, row.closedNet, row.drawdown]));
      expect(report.metrics.all.closedNet.value).toBeCloseTo(full.trades.filter(trade => trade.exitBar < n).reduce((sum, trade) => sum + trade.netProfit, 0), 10);
    }
  });
});

describe('closed-trade analysis (outcomes, streaks, entry-time groups)', () => {
  // Six flat-bar round trips closing on bar close; nets +10,+5,0,-3,-4,+2 with qty 1, no fees.
  const at = (iso: string) => Date.parse(iso) / 1000;
  const times = ['2024-01-15T14:30:00Z', '2024-01-15T15:00:00Z', '2024-03-11T13:30:00Z', '2024-03-11T14:00:00Z', '2024-07-04T18:00:00Z', '2024-07-04T19:00:00Z', '2024-11-01T03:30:00Z', '2024-11-01T04:00:00Z', '2024-12-02T05:00:00Z', '2024-12-02T06:00:00Z', '2024-12-07T16:00:00Z', '2024-12-07T17:00:00Z'].map(at);
  const prices = [100, 110, 100, 105, 100, 100, 100, 97, 100, 96, 100, 102];
  const bars = prices.map((price, index) => bar(times[index], price, price, price, price));
  const signals: StrategySignal[] = prices.map((_, index) => ({ barIndex: index, orders: [index % 2 ? { action: 'close' as const } : { action: 'buy' as const, quantity: 1 }] }));
  const run = (timezone: string) => buildStrategyReport({ bars, barIds: ids(bars), result: backtestStrategy({ bars, signals, config: { initialCapital: 1000, processOrdersOnClose: true } }), context: { ...context, timezone } });
  it('counts outcomes and streaks, with even trades ending a run', () => {
    const report = run('America/New_York'), all = report.analysis.sides.all;
    expect(report.trades.map(trade => trade.netProfit)).toEqual([10, 5, 0, -3, -4, 2]);
    expect(all.outcomes).toMatchObject({ trades: 6, wins: 3, losses: 2, even: 1, winShare: 50 }); expect(all.outcomes.lossShare).toBeCloseTo(100 / 3, 10); expect(all.outcomes.evenShare).toBeCloseTo(100 / 6, 10);
    // W W E L L W: longest win run 2 worth 15, longest loss run 2 worth -7, final run one win.
    expect(all.streaks).toEqual({ longestWins: 2, longestLosses: 2, bestWinRun: 15, worstLossRun: -7, finalKind: 'win', finalCount: 1 });
    expect(report.analysis.sides.short.outcomes).toEqual({ trades: 0, wins: 0, losses: 0, even: 0, winShare: null, lossShare: null, evenShare: null });
    expect(report.analysis.sides.short.streaks.finalKind).toBeNull();
  });
  it('groups by entry bar time in the explicit display time zone, including DST and date boundaries', () => {
    const ny = run('America/New_York').analysis.sides.all, used = (rows: typeof ny.hour) => rows.filter(row => row.trades).map(row => [row.key, row.trades, row.wins, row.losses, row.even, row.net]);
    // Entries at 09:30 EST Mon Jan, 09:30 EDT Mon Mar, 14:00 EDT Thu Jul, 23:30 EDT Thu Oct 31, 00:00 EST Mon Dec 2, 11:00 EST Sat Dec 7.
    expect(used(ny.hour)).toEqual([[0, 1, 0, 1, 0, -4], [9, 2, 2, 0, 0, 15], [11, 1, 1, 0, 0, 2], [14, 1, 0, 0, 1, 0], [23, 1, 0, 1, 0, -3]]);
    expect(used(ny.weekday)).toEqual([[1, 3, 2, 1, 0, 11], [4, 2, 0, 1, 1, -3], [6, 1, 1, 0, 0, 2]]);
    expect(used(ny.month)).toEqual([[0, 1, 1, 0, 0, 10], [2, 1, 1, 0, 0, 5], [6, 1, 0, 0, 1, 0], [9, 1, 0, 1, 0, -3], [11, 2, 1, 1, 0, -2]]);
    expect(ny.weekday[1].winRate).toBeCloseTo(200 / 3, 10); expect(ny.month[11].winRate).toBe(50);
    // The same 03:30Z entry is a Friday in November when grouped in UTC.
    const utc = run('UTC').analysis.sides.all; expect(utc.month[10].trades).toBe(1); expect(utc.month[9].trades).toBe(0); expect(utc.weekday[5].net).toBe(-3);
  });
});

describe('cancellation, stale worker results and restore round trip', () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
  function job(bars: Bar[], quantity = 1): StrategyReportJobInput {
    const barIds = ids(bars);
    return { execution: { bars, barIds, chartType: 'standard', context: { ...context, currency: null }, proposals: [{ sequence: 1, side: 'buy', quantity, event: { id: barIds[0], time: bars[0].time, revision: 1 }, virtual: true }, { sequence: 2, side: 'sell', quantity, event: { id: barIds[2], time: bars[2].time, revision: 1 }, virtual: true }] }, config: { ...DEFAULT_STRATEGY_CONFIG, commission: { kind: 'fixed', value: 0 }, initialCapital: 1000 } };
  }
  function client() {
    const ports: ReportLoopbackPort[] = [], abort = new AbortController();
    const owner: StrategyReportOwner = { signal: abort.signal, assertCurrent() {} };
    const value = createStrategyReportClient({ factory: () => { const port = new ReportLoopbackPort(); ports.push(port); return port; }, yieldControl: () => Promise.resolve() });
    cleanups.push(() => value.dispose()); return { value, owner, abort, ports };
  }
  // Buy 1 at bar1 open 100, sell at bar3 open 90: closed net -10. Closes 100,104,95,90,90.
  const series = [bar(0, 100, 100, 100, 100), bar(60, 100, 104, 100, 104), bar(120, 95, 95, 95, 95), bar(180, 90, 90, 90, 90), bar(240, 90, 90, 90, 90)];
  it('cancels a cooperative report build without producing a report', async () => {
    const result = backtestStrategy({ bars: series, signals: [], config: { initialCapital: 1000 } }), controller = new AbortController();
    const pending = buildStrategyReportAsync({ bars: series, barIds: ids(series), result, context, signal: controller.signal }); controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'REPORT_CANCELLED' });
  });
  it('cancels a worker upload through the owner signal and terminates its worker', async () => {
    // Abort during the first chunk upload, after the worker has started.
    const test = client(), phases: string[] = [], started = test.value.start(job(series), test.owner, progress => { phases.push(progress.phase); if (progress.phase === 'uploading') test.abort.abort(); });
    await expect(started).rejects.toMatchObject({ code: 'REPORT_CANCELLED' }); expect(phases).toEqual(['starting', 'uploading']); expect(test.ports).toHaveLength(1); expect(test.ports[0].terminated).toBe(1);
  });
  it('plots close drawdown below zero through the worker and keeps inspection rows for the accepted prefix only', async () => {
    const test = client(), handle = await test.value.start(job(series), test.owner);
    // Equity: 1000, 1004, 995, 990, 990. Prior peak 1004 -> drawdown 0,0,9,14,14; percent 14/1004*100.
    const plot = await handle.plot({ series: 'drawdown', percent: false, benchmark: false, favorable: false, adverse: false });
    expect(plot.values.map(point => point.value)).toEqual([0, 0, -9, -14, -14]);
    const percent = await handle.plot({ series: 'drawdown', percent: true, benchmark: false, favorable: false, adverse: false });
    expect(percent.values[3].value).toBeCloseTo(-1400 / 1004, 10);
    expect(handle.summary.metrics.all.maxRunup.value).toBe(4); expect(handle.summary.analysis.sides.all.outcomes.losses).toBe(1);
    // A three-row replay prefix of the same proposals yields the same first three rows through the worker.
    const other = client(), prefix = await other.value.start(job(series.slice(0, 3)), other.owner);
    for (let index = 0; index < 3; index++) expect((await prefix.inspect(index)).point.equity).toBe((await handle.inspect(index)).point.equity);
  });
  it('ignores a delayed duplicate worker reply and retires on a reply from another job', async () => {
    const test = client(), handle = await test.value.start(job(series), test.owner), port = test.ports[0];
    const job0 = port.messages[0].job;
    port.emit({ version: 1, job: job0, sequence: 1, ok: true, kind: 'ack', received: 0 }); // stale: older than any pending command
    expect((await handle.orders(0)).count).toBe(2);
    port.hold.add('orders'); const pending = handle.orders(0);
    port.emit({ version: 1, job: 'another-job', sequence: port.messages.at(-1).sequence, ok: true, kind: 'result', value: { count: 0, pages: 1, page: 0, rows: [] } });
    await expect(pending).rejects.toMatchObject({ code: 'REPORT_REPLY_OWNER' }); expect(port.terminated).toBe(1);
  });
  it('rejects a drawdown plot that requests benchmark or excursion layers', () => {
    const session = new StrategyReportWorkerSession(), j = job(series), barIds = j.execution.barIds;
    const send = (sequence: number, kind: string, fields: Record<string, unknown>) => session.handle({ version: 1, job: 'lv-c12-session', sequence, kind, ...fields });
    expect(send(1, 'start', { input: { context: j.execution.context, config: j.config, counts: { bars: 5, standardBars: 0, barIds: 5, proposals: 2 }, chartType: 'standard' } })).toMatchObject({ ok: true });
    send(2, 'chunk', { section: 'bars', start: 0, rows: series }); send(3, 'chunk', { section: 'barIds', start: 0, rows: barIds }); send(4, 'chunk', { section: 'proposals', start: 0, rows: j.execution.proposals });
    expect(send(5, 'seal', {})).toMatchObject({ ok: true, kind: 'ready' });
    expect(send(6, 'plot', { query: { series: 'drawdown', percent: false, benchmark: true, favorable: false, adverse: false } })).toMatchObject({ ok: false, code: 'REPORT_PLOT' });
  });
  it('restores an exported report JSON exactly and rejects tampering, foreign schema and re-export', () => {
    const { bars, barIds, result } = reportArithmeticFixture(), report = buildStrategyReport({ bars, barIds, result, context }), text = strategyReportJson(report);
    const restored = restoreStrategyReportJson(text);
    expect(restored.summary.metrics).toEqual(report.metrics); expect(restored.summary.analysis).toEqual(report.analysis); expect(restored.trades).toEqual(report.trades);
    expect(restored.equity).toEqual(report.equity); expect(restored.summary.config).toEqual(report.config); expect(restored.openLots).toEqual(report.openLots);
    expect(restored.orders.map(order => order.id)).toEqual(report.orders.map(order => order.id)); expect(restored.checks.join(' ')).toContain('Net closed PnL: -4');
    expect(() => strategyReportJson(restored as never)).toThrow(/completed report/);
    const parsed = () => JSON.parse(text);
    const tampered = parsed(); tampered.trades[0].netProfit = 5; tampered.trades[0].cumulativeNet = 5;
    expect(() => restoreStrategyReportJson(JSON.stringify(tampered))).toThrow(/reconcile/);
    const metric = parsed(); metric.metrics.all.closedNet.value = 100; expect(() => restoreStrategyReportJson(JSON.stringify(metric))).toThrow(/Net closed PnL/);
    const extra = parsed(); extra.sourceCode = 'x'; expect(() => restoreStrategyReportJson(JSON.stringify(extra))).toThrow(/unsupported field/);
    const version = parsed(); version.schemaVersion = 2; expect(() => restoreStrategyReportJson(JSON.stringify(version))).toThrow(/version 1/);
    const older = parsed(); delete older.analysis; expect(restoreStrategyReportJson(JSON.stringify(older)).summary.analysis).toBeNull();
    const nulled = parsed(); nulled.analysis = null; expect(() => restoreStrategyReportJson(JSON.stringify(nulled))).toThrow();
    // Re-derived values: eight-row fixture closes 1000,1001,1004,1000,996,997,996,997 -> drawdown 8, run-up 4.
    expect(restored.checks).toContain('Maximum close drawdown: 8'); expect(restored.checks).toContain('Maximum close run-up: 4'); expect(restored.unverified.join(' ')).toMatch(/Margin/);
    // Tampering that keeps gross - fee = net and the cumulative chain still fails on price x quantity.
    const price = parsed(); price.trades[0].exitPrice = 14; expect(() => restoreStrategyReportJson(JSON.stringify(price))).toThrow(/reconcile prices/);
    const row = parsed(); row.equity[4].drawdown = 1; expect(() => restoreStrategyReportJson(JSON.stringify(row))).toThrow(/equity row 4/);
    const runup = parsed(); runup.metrics.all.maxRunup.value = 40; expect(() => restoreStrategyReportJson(JSON.stringify(runup))).toThrow(/run-up/);
    const side = parsed(); side.metrics.long.grossProfit.value = 9; expect(() => restoreStrategyReportJson(JSON.stringify(side))).toThrow(/Gross profit.*\(long\)/);
    const streak = parsed(); streak.analysis.sides.all.streaks.longestWins = 0; streak.analysis.sides.all.streaks.bestWinRun = null;
    expect(() => restoreStrategyReportJson(JSON.stringify(streak))).toThrow();
    expect(() => restoreStrategyReportJson('{not json')).toThrow(/not valid JSON/); expect(() => restoreStrategyReportJson('  ')).toThrow(/Paste/);
  });
});

describe('second review: older exports and honest restore labels', () => {
  // Produced once by the unmodified checkpoint 4519 code path (base backtestStrategy, buildStrategyReport and
  // strategyReportJson) from reportArithmeticFixture(); maxRunup/maxMargin are unavailable and analysis is absent.
  const baseline = () => readFileSync(new URL('../fixtures/strategy-report-baseline-4519.json', import.meta.url), 'utf8');
  it('restores an actual checkpoint 4519 export and lists what that export did not compute', () => {
    const raw = JSON.parse(baseline()); expect(Object.hasOwn(raw, 'analysis')).toBe(false); expect(raw.metrics.all.maxRunup.status).toBe('unavailable');
    const restored = restoreStrategyReportJson(baseline());
    expect(restored.summary.analysis).toBeNull(); expect(restored.summary.metrics.all.maxRunup.value).toBeNull();
    expect(restored.verified).toContain('all.closedNet'); expect(restored.verified).not.toContain('all.maxRunup');
    expect(restored.unverified.join(' ')).toContain('Maximum close run-up (all): unavailable in this saved report.');
    // Same hand-derived ledger as the current model: closed net -4, drawdown 8, final 997.
    expect(restored.checks).toContain('Net closed PnL: -4'); expect(restored.checks).toContain('Maximum close drawdown: 8'); expect(restored.checks).toContain('Final marked equity: 997');
  });
  it('marks only recomputed metrics as matched and never claims margin, contracts, path drawdown or benchmark values', () => {
    const { bars, barIds, result } = reportArithmeticFixture(), restored = restoreStrategyReportJson(strategyReportJson(buildStrategyReport({ bars, barIds, result, context })));
    for (const key of ['commission', 'initialCapital', 'largestProfit', 'largestLoss', 'openTrades', 'openNet', 'closedReturn', 'totalReturn', 'averageWinLoss', 'profitFactor']) for (const side of ['all', 'long', 'short']) expect(restored.verified, side + '.' + key).toContain(side + '.' + key);
    for (const key of ['averageMargin', 'maxMargin', 'maxContracts', 'pathDrawdown', 'buyHoldPnl', 'buyHoldPercent', 'outperformance', 'outperformancePoints', 'sharpe']) expect(restored.verified).not.toContain('all.' + key);
    expect(restored.unverified.join(' ')).toMatch(/Margin, maximum units held and path-drawdown/);
  });
  it('detects tampering of every recomputed field', () => {
    const { bars, barIds, result } = reportArithmeticFixture(), text = strategyReportJson(buildStrategyReport({ bars, barIds, result, context }));
    const cases: [string, (value: any) => void][] = [
      ['commission', value => { value.metrics.all.commission.value = 123; }],
      ['initial capital metric', value => { value.metrics.all.initialCapital.value = 1; }],
      ['initial capital property', value => { value.config.initialCapital = 2000; }],
      ['largest profit', value => { value.metrics.all.largestProfit.value = 999; }],
      ['largest loss (short)', value => { value.metrics.short.largestLoss.value = 1; }],
      ['open entries (long)', value => { value.metrics.long.openTrades.value = 0; }],
      ['open fees', value => { value.metrics.all.openFees.value = 0; }],
      ['closed return', value => { value.metrics.all.closedReturn.value = 5; }],
      ['average bars', value => { value.metrics.all.averageBars.value = 3; }],
      ['drawdown block amount', value => { value.drawdown.amount = 0; value.drawdown.percent = 0; }],
      ['drawdown block trough', value => { value.drawdown.troughBarId = value.equity[1].barId; }],
      ['equity curve moved off the ledger', value => { const last = value.equity.at(-1); last.equity += 3; last.drawdown = 4; last.drawdownPercent = 0.4 / 1.004 * 1; value.metrics.all.finalEquity.value = last.equity; }],
      ['entry-time group', value => { const hour = value.analysis.sides.all.hour; [hour[0], hour[1]] = [{ ...hour[1], key: 0 }, { ...hour[0], key: 1 }]; }],
      ['open lot mark', value => { value.openLots[0].mark = 10; }],
      ['closed net', value => { value.metrics.all.closedNet.value = 5; }],
    ];
    for (const [label, mutate] of cases) { const value = JSON.parse(text); mutate(value); expect(() => restoreStrategyReportJson(JSON.stringify(value)), label).toThrow(); }
  });
  it('rejects an over-limit paste by length before encoding or parsing', () => {
    expect(() => restoreStrategyReportJson('{' + ' '.repeat(RESTORE_MAX_BYTES))).toThrow(/Nothing was parsed/);
  });
});

describe('restore precision', () => {
  it('accepts a valid fractional-lot export whose entry notional has more than ten decimals', () => {
    // 1.23456789 * 0.001 = 0.00123456789 (11 dp); the report rounds the notional to 10 dp before dividing.
    const bars = [bar(0, 1, 1, 1, 1), bar(60, 1.23456789, 1.23456789, 1.23456789, 1.23456789), bar(120, 2.46913578, 2.46913578, 2.46913578, 2.46913578)];
    const result = backtestStrategy({ bars, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 0.001 }] }, { barIndex: 1, orders: [{ action: 'close' }] }], config: { initialCapital: 1000, lotSize: 0.001, tickSize: 0.00000001 } });
    const report = buildStrategyReport({ bars, barIds: ids(bars), result, context });
    expect(report.trades[0].entryNotional).toBe(0.0012345679);
    expect(restoreStrategyReportJson(strategyReportJson(report)).trades[0].returnPercent).toBe(report.trades[0].returnPercent);
  });
});

describe('empty history', () => {
  it('keeps margin statistics undefined, not zero, when no bars were supplied', () => {
    const report = buildStrategyReport({ bars: [], barIds: [], result: backtestStrategy({ bars: [], signals: [], config: { initialCapital: 1000 } }), context });
    expect(report.metrics.all.maxMargin).toMatchObject({ value: null, status: 'undefined' }); expect(report.metrics.all.averageMargin.value).toBeNull();
    expect(restoreStrategyReportJson(strategyReportJson(report)).summary.counts.bars).toBe(0);
  });
});

describe('Properties validation used before Apply', () => {
  it('reports invalid values without executing history and accepts the defaults', () => {
    expect(validateStrategyConfig(DEFAULT_STRATEGY_CONFIG)).toEqual([]);
    expect(validateStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, initialCapital: -5 }).join(' ')).toMatch(/Initial capital/);
    expect(validateStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, commission: { kind: 'percent', value: NaN } }).join(' ')).toMatch(/commission/);
    expect(validateStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, barMagnifier: true }).join(' ')).toMatch(/Bar Magnifier/);
  });
});
