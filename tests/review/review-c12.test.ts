import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backtestStrategy, DEFAULT_STRATEGY_CONFIG, type StrategyConfig, type StrategySignal } from '../../src/domain/strategy';
import { buildStrategyReport, type StrategyReportContext } from '../../src/domain/strategy-report';
import { strategyReportJson } from '../../src/domain/strategy-report-export';
import { restoreStrategyReportJson } from '../../src/strategy-report/restore';
import { createStrategyReportClient } from '../../src/strategy-report/client';
import { useStrategyReport } from '../../src/strategy-report/use-report';
import { StrategyDialog, type StrategyDialogProps, type StrategyExecution } from '../../src/ui/StrategyDialog';
import type { StrategyReportJobInput, StrategyReportOwner } from '../../src/strategy-report/types';
import type { Bar } from '../../src/domain/types';
import { ReportLoopbackPort } from '../domain/strategy-report-test-port';
import { reportArithmeticFixture } from '../domain/strategy-report-fixtures';
import { readFileSync } from 'node:fs';

// Strategy tester independent review (second reviewer). Every expected number below is hand-derived
// in the comments from explicitly synthetic prices; none is copied from engine output.
// Same controlled-hook harness as the builder's handler tests (no DOM, focus or packaged window).
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, effects: [] as (() => void)[] }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  const same = (a: any[] | undefined, b: any[] | undefined) => Boolean(a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index])));
  return { ...actual,
    useState: (initial: any) => { const index = hooks.cursor++; if (!(index in hooks.cells)) hooks.cells[index] = typeof initial === 'function' ? initial() : initial; return [hooks.cells[index], (next: any) => { hooks.cells[index] = typeof next === 'function' ? next(hooks.cells[index]) : next; }]; },
    useRef: (initial: any) => { const index = hooks.cursor++; if (!(index in hooks.cells)) hooks.cells[index] = { current: initial }; return hooks.cells[index]; },
    useMemo: (factory: any, deps: any[]) => { const index = hooks.cursor++, old = hooks.cells[index]; if (!old || !same(old.deps, deps)) hooks.cells[index] = { deps, value: factory() }; return hooks.cells[index].value; },
    useEffect: (effect: any, deps: any[]) => { const index = hooks.cursor++, old = hooks.cells[index]; if (!old || !same(old.deps, deps)) { const cell = { deps, cleanup: old?.cleanup }; hooks.cells[index] = cell; hooks.effects.push(() => { cell.cleanup?.(); cell.cleanup = effect(); }); } },
  };
});

const at = (iso: string) => Date.parse(iso) / 1000;
const bar = (iso: string, open: number, high: number, low: number, close: number): Bar => ({ time: at(iso), open, high, low, close, volume: 1 });
const ids = (bars: readonly Bar[]) => bars.map((_, index) => 'c12-review:' + index);
const context = (timezone: string): StrategyReportContext => ({ executionId: 'c12-review', sourceLabel: 'Explicit synthetic reviewer fixture; no actual security prices', currency: 'USD', timezone });

// Bars straddle both 2024 America/New_York DST transitions (spring forward 07:00Z Mar 10, fall back 06:00Z Nov 3).
const BARS: Bar[] = [
  bar('2024-03-10T06:00:00Z', 100, 100, 100, 100), // 01:00 EST Sun
  bar('2024-03-10T06:30:00Z', 101, 103, 100, 102), // 01:30 EST Sun
  bar('2024-03-10T07:30:00Z', 104, 105, 99, 100), // 03:30 EDT Sun
  bar('2024-03-10T08:00:00Z', 98, 99, 95, 96), // 04:00 EDT Sun (naive fixed -5 would say 03)
  bar('2024-11-03T05:30:00Z', 95, 97, 94, 97), // 01:30 EDT Sun
  bar('2024-11-03T06:30:00Z', 97.5, 98, 96, 96.5), // 01:30 EST Sun (repeated wall hour)
  bar('2024-11-04T15:00:00Z', 96, 96, 90, 91), // 10:00 EST Mon
  bar('2024-11-04T16:00:00Z', 92, 93.5, 91, 93), // 11:00 EST Mon
];
// Explicit quantities, fractional 0.5 lots, market orders (as LVScript proposals map), next-open fills.
const SIGNALS: StrategySignal[] = [
  { barIndex: 0, orders: [{ action: 'buy', quantity: 1.5 }] },
  { barIndex: 1, orders: [{ action: 'sell', quantity: 1.5 }] },
  { barIndex: 2, orders: [{ action: 'sell', quantity: 2.5 }] },
  { barIndex: 3, orders: [{ action: 'buy', quantity: 1 }] },
  { barIndex: 4, orders: [{ action: 'buy', quantity: 2 }] }, // covers 1.5 short and reverses into 0.5 long
  { barIndex: 5, orders: [{ action: 'sell', quantity: 0.5 }] },
  { barIndex: 6, orders: [{ action: 'buy', quantity: 0.5 }] }, // left open
];
const BASE: Partial<StrategyConfig> = { initialCapital: 10000, tickSize: 0.25, slippageTicks: 2, lotSize: 0.5 };
const run = (commission: StrategyConfig['commission'], extra: Partial<StrategyConfig> = {}) => backtestStrategy({ bars: BARS, barIds: ids(BARS), signals: SIGNALS, config: { ...BASE, commission, ...extra } });
const report = (commission: StrategyConfig['commission'], timezone = 'America/New_York') => buildStrategyReport({ bars: BARS, barIds: ids(BARS), result: run(commission), context: context(timezone) });

describe('hand-computed fills, fees, equity and close statistics (fractional lots, slippage 2 x 0.25)', () => {
  // Fill prices: open +/- 0.5 against the trader.
  // F1 b1 buy 1.5 @101.5, F2 b2 sell 1.5 @103.5, F3 b3 sell 2.5 @97.5, F4 b4 buy 1 @95.5,
  // F5 b5 buy 2 @98, F6 b6 sell 0.5 @95.5, F7 b7 buy 0.5 @92.5.
  it('fills every order at the next open with adverse slippage', () => {
    const result = run({ kind: 'fixed', value: 0 });
    expect(result.ok).toBe(true);
    expect(result.fills.map(fill => [fill.barIndex, fill.side, fill.quantity, fill.price, fill.phase])).toEqual([
      [1, 'buy', 1.5, 101.5, 'open'], [2, 'sell', 1.5, 103.5, 'open'], [3, 'sell', 2.5, 97.5, 'open'], [4, 'buy', 1, 95.5, 'open'], [5, 'buy', 2, 98, 'open'], [6, 'sell', 0.5, 95.5, 'open'], [7, 'buy', 0.5, 92.5, 'open'],
    ]);
  });
  it('percent of value 0.1%: fees, FIFO allocations, equity, drawdown, run-up, margin', () => {
    // Fees: 152.25*0.001=0.15225, 155.25->0.15525, 243.75->0.24375, 95.5->0.0955, 196->0.196, 47.75->0.04775, 46.25->0.04625.
    const result = run({ kind: 'percent', value: 0.1 });
    expect(result.fills.map(fill => fill.commission)).toEqual([0.15225, 0.15525, 0.24375, 0.0955, 0.196, 0.04775, 0.04625]);
    // T1 long 1.5: gross 3, fees 0.3075, net 2.6925. T2 short 1: entry fee 0.24375/2.5=0.0975 + exit 0.0955 -> 0.193, gross 2, net 1.807.
    // T3 short 1.5: entry 0.14625 + exit 0.196*1.5/2=0.147 -> 0.29325, gross -0.75, net -1.04325.
    // T4 long 0.5 (reversal remainder): entry 0.196*0.5/2=0.049 + exit 0.04775 -> 0.09675, gross -1.25, net -1.34675.
    expect(result.trades.map(trade => [trade.direction, trade.quantity, trade.grossProfit, trade.commission, trade.netProfit])).toEqual([
      ['long', 1.5, 3, 0.3075, 2.6925], ['short', 1, 2, 0.193, 1.807], ['short', 1.5, -0.75, 0.29325, -1.04325], ['long', 0.5, -1.25, 0.09675, -1.34675],
    ]);
    // Cash/equity by close: 10000; 9847.59775+153; 10002.6925; 10246.19875-240; 10150.60325-145.5; 9954.40725+48.25; 10002.1095; 9955.81325+46.5.
    expect(result.equity.map(point => point.equity)).toEqual([10000, 10000.59775, 10002.6925, 10006.19875, 10005.10325, 10002.65725, 10002.1095, 10002.31325]);
    const built = buildStrategyReport({ bars: BARS, barIds: ids(BARS), result, context: context('America/New_York') }), all = built.metrics.all;
    expect(all.closedNet.value).toBe(2.1095); // 2.6925+1.807-1.04325-1.34675
    expect(all.totalProfit.value).toBe(2.31325); // + open 0.5*(93-92.5) - 0.04625 = 0.20375
    expect(built.openLots.map(lot => [lot.quantity, lot.entryPrice, lot.mark, lot.grossProfit, lot.remainingEntryCommission, lot.netProfit])).toEqual([[0.5, 92.5, 93, 0.25, 0.04625, 0.20375]]);
    // Peak 10006.19875 at b3; lowest later close 10002.1095 at b6 -> 4.08925. Run-up: trough stays at seed 10000 -> 6.19875.
    expect(all.maxDrawdown.value).toBe(4.08925); expect(all.maxDrawdownPercent.value).toBeCloseTo(4.08925 / 10006.19875 * 100, 9); expect(all.maxRunup.value).toBe(6.19875);
    expect(built.equity.map(point => point.closedNet)).toEqual([0, 0, 2.6925, 2.6925, 4.4995, 3.45625, 2.1095, 2.1095]);
    expect(built.equity.map(point => point.drawdown)).toEqual([0, 0, 0, 0, 1.0955, 3.5415, 4.08925, 3.8855]);
    // Close margin at 100%: b1 153, b3 240, b4 145.5, b5 48.25, b7 46.5. Max all 240, long 153, short 240; average 633.25/8.
    expect([all.maxMargin.value, built.metrics.long.maxMargin.value, built.metrics.short.maxMargin.value]).toEqual([240, 153, 240]);
    expect(all.averageMargin.value).toBe(79.15625);
    // Fees total incl. open entry fee: 0.15225+0.15525+0.24375+0.0955+0.196+0.04775+0.04625 = 0.93675.
    expect(all.commission.value).toBe(0.93675);
  });
  it('cash per unit 0.2: equity, drawdown and run-up', () => {
    // Fees per fill = qty*0.2: 0.3,0.3,0.5,0.2,0.4,0.1,0.1. Nets: 2.4, 1.6 (0.2+0.2), -1.35 (0.3+0.3), -1.45 (0.1+0.1); open 0.25-0.1.
    const result = run({ kind: 'per-unit', value: 0.2 });
    expect(result.trades.map(trade => trade.netProfit)).toEqual([2.4, 1.6, -1.35, -1.45]);
    expect(result.equity.map(point => point.equity)).toEqual([10000, 10000.45, 10002.4, 10005.65, 10004.45, 10001.8, 10001.2, 10001.35]);
    const all = buildStrategyReport({ bars: BARS, barIds: ids(BARS), result, context: context('UTC') }).metrics.all;
    expect([all.closedNet.value, all.totalProfit.value, all.maxDrawdown.value, all.maxRunup.value]).toEqual([1.2, 1.35, 4.45, 5.65]);
  });
  it('cash per order 1.25: equity below the seed moves the run-up trough', () => {
    // T1 0.5 (2.5 fees), T2 2-(0.5+1.25)=0.25, T3 -0.75-(0.75+0.9375)=-2.4375, T4 -1.25-(0.3125+1.25)=-2.8125; open 0.25-1.25=-1.
    const result = run({ kind: 'fixed', value: 1.25 });
    expect(result.trades.map(trade => [trade.commission, trade.netProfit])).toEqual([[2.5, 0.5], [1.75, 0.25], [1.6875, -2.4375], [1.5625, -2.8125]]);
    expect(result.equity.map(point => point.equity)).toEqual([10000, 9999.5, 10000.5, 10003, 10000.75, 9997.25, 9995.5, 9994.5]);
    const built = buildStrategyReport({ bars: BARS, barIds: ids(BARS), result, context: context('UTC') }), all = built.metrics.all;
    // Peak 10003 -> 9994.5 = 8.5. Run-up: trough 9999.5 at b1, then 10003 -> 3.5.
    expect([all.closedNet.value, all.totalProfit.value, all.maxDrawdown.value, all.maxRunup.value]).toEqual([-4.5, -5.5, 8.5, 3.5]);
    expect(built.analysis.sides.all.streaks).toEqual({ longestWins: 2, longestLosses: 2, bestWinRun: 0.75, worstLossRun: -5.25, finalKind: 'loss', finalCount: 2 });
  });
  it('streaks per direction and entry-time groups in America/New_York across both DST transitions', () => {
    const built = report({ kind: 'percent', value: 0.1 }), sides = built.analysis.sides;
    // All: W W L L. Long: T1 W, T4 L. Short: T2 W, T3 L.
    expect(sides.all.streaks).toEqual({ longestWins: 2, longestLosses: 2, bestWinRun: 4.4995, worstLossRun: -2.39, finalKind: 'loss', finalCount: 2 });
    expect(sides.long.streaks).toEqual({ longestWins: 1, longestLosses: 1, bestWinRun: 2.6925, worstLossRun: -1.34675, finalKind: 'loss', finalCount: 1 });
    expect(sides.short.streaks).toEqual({ longestWins: 1, longestLosses: 1, bestWinRun: 1.807, worstLossRun: -1.04325, finalKind: 'loss', finalCount: 1 });
    const used = (rows: readonly { key: number; trades: number; net: number }[]) => rows.filter(row => row.trades).map(row => [row.key, row.trades, row.net]);
    // Entries: T1 b1 01:30 EST; T2,T3 b3 04:00 EDT (after spring-forward); T4 b5 01:30 EST (after fall-back). All Sundays.
    expect(used(sides.all.hour)).toEqual([[1, 2, 1.34575], [4, 2, 0.76375]]);
    expect(used(sides.all.weekday)).toEqual([[0, 4, 2.1095]]);
    expect(used(sides.all.month)).toEqual([[2, 3, 3.45625], [10, 1, -1.34675]]);
    expect(used(sides.long.hour)).toEqual([[1, 2, 1.34575]]);
    // UTC: entries at 06:30, 08:00, 08:00, 06:30.
    const utc = report({ kind: 'percent', value: 0.1 }, 'UTC').analysis.sides.all;
    expect(used(utc.hour)).toEqual([[6, 2, 1.34575], [8, 2, 0.76375]]);
    // A half-hour zone: Asia/Kolkata (+05:30, no DST): 12:00, 13:30 -> hour 13, 12:00 -> 12.
    const kolkata = report({ kind: 'percent', value: 0.1 }, 'Asia/Kolkata').analysis.sides.all;
    expect(used(kolkata.hour)).toEqual([[12, 2, 1.34575], [13, 2, 0.76375]]);
  });
});

describe('future-data exclusion and replay prefix', () => {
  // Adds a resting limit and a stop so intrabar paths are exercised as well as market fills.
  const signals: StrategySignal[] = [...SIGNALS.slice(0, 3), { barIndex: 3, orders: [{ action: 'buy', quantity: 1 }, { action: 'buy', quantity: 0.5, type: 'limit', limitPrice: 94.25 }] }, ...SIGNALS.slice(4)];
  const config = { ...BASE, pyramiding: 5, commission: { kind: 'percent' as const, value: 0.1 } };
  it('later bars never change fills or equity on or before bar N (all N)', () => {
    const full = backtestStrategy({ bars: BARS, signals, config });
    expect(full.ok).toBe(true);
    for (let n = 0; n < BARS.length - 1; n++) {
      const altered = BARS.map((row, index) => index > n ? { ...row, open: 500, high: 999, low: 1, close: 2 } : row);
      const changed = backtestStrategy({ bars: altered, signals, config });
      expect(changed.fills.filter(fill => fill.barIndex <= n), `N=${n}`).toEqual(full.fills.filter(fill => fill.barIndex <= n));
      expect(changed.equity.slice(0, n + 1), `N=${n}`).toEqual(full.equity.slice(0, n + 1));
    }
  });
  it('a K-bar replay equals the first K bars of the full run, including the report rows and analysis counts', () => {
    const full = backtestStrategy({ bars: BARS, signals, config }), fullReport = buildStrategyReport({ bars: BARS, barIds: ids(BARS), result: full, context: context('America/New_York') });
    for (let k = 1; k <= BARS.length; k++) {
      const prefix = BARS.slice(0, k), result = backtestStrategy({ bars: prefix, signals: signals.filter(signal => signal.barIndex < k), config });
      const built = buildStrategyReport({ bars: prefix, barIds: ids(prefix), result, context: context('America/New_York') });
      expect(result.fills, `K=${k}`).toEqual(full.fills.filter(fill => fill.barIndex < k));
      expect(built.trades.map(trade => trade.netProfit), `K=${k}`).toEqual(fullReport.trades.filter(trade => trade.exit.barIndex < k).map(trade => trade.netProfit));
      expect(built.equity.map(row => [row.equity, row.closedNet, row.drawdown]), `K=${k}`).toEqual(fullReport.equity.slice(0, k).map(row => [row.equity, row.closedNet, row.drawdown]));
    }
  });
});

describe('worker path: replay prefix through script proposals, stale results, cancellation', () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
  function job(count: number): StrategyReportJobInput {
    const bars = BARS.slice(0, count), barIds = ids(bars);
    const proposals = SIGNALS.filter(signal => signal.barIndex < count).map((signal, index) => ({ sequence: index + 1, side: signal.orders[0].action as 'buy' | 'sell', quantity: signal.orders[0].quantity!, event: { id: barIds[signal.barIndex], time: bars[signal.barIndex].time, revision: 1 as const }, virtual: true as const }));
    return { execution: { bars, barIds, chartType: 'standard', context: { ...context('America/New_York'), currency: null }, proposals }, config: { ...DEFAULT_STRATEGY_CONFIG, ...BASE, commission: { kind: 'per-unit', value: 0.2 } } as StrategyConfig };
  }
  function client() {
    const abort = new AbortController(), owner: StrategyReportOwner = { signal: abort.signal, assertCurrent() {} };
    const value = createStrategyReportClient({ factory: () => new ReportLoopbackPort(), yieldControl: () => Promise.resolve() });
    cleanups.push(() => value.dispose()); return { value, owner, abort };
  }
  it('a 5-bar proposal replay matches the first 5 rows and closed trades of the 8-bar run', async () => {
    const a = client(), b = client(), full = await a.value.start(job(8), a.owner), prefix = await b.value.start(job(5), b.owner);
    for (let index = 0; index < 5; index++) expect((await prefix.inspect(index)).point).toEqual((await full.inspect(index)).point);
    const query = { side: 'all' as const, query: '', sort: 'number' as const, descending: false, page: 0 };
    const fullTrades = (await full.trades(query)).rows, prefixTrades = (await prefix.trades(query)).rows;
    // Per-unit 0.2 nets 2.4 and 1.6 close by bar 4; the 1.5 short is still open at the 5-bar cut.
    expect(prefixTrades.map(trade => trade.netProfit)).toEqual([2.4, 1.6]); expect(fullTrades.slice(0, 2)).toEqual(prefixTrades);
    expect(full.summary.metrics.all.maxDrawdown.value).toBe(4.45);
  });
  it('cancelling through the owner signal rejects with REPORT_CANCELLED', async () => {
    const test = client(), pending = test.value.start(job(8), test.owner, progress => { if (progress.phase === 'uploading') test.abort.abort(); });
    await expect(pending).rejects.toMatchObject({ code: 'REPORT_CANCELLED' });
  });
});

describe('dialog hook: stale results, no auto-run from a loaded draft', () => {
  const starts: StrategyConfig[] = [];
  class CountingPort extends ReportLoopbackPort { postMessage(raw: unknown) { const message = raw as any; if (message?.kind === 'start') starts.push(message.input.config); super.postMessage(raw); } }
  beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.effects = []; starts.length = 0; vi.stubGlobal('window', { lv: { exportData: vi.fn() } }); vi.stubGlobal('Worker', CountingPort); });
  afterEach(() => { for (const cell of hooks.cells) if (cell && typeof cell === 'object' && typeof cell.cleanup === 'function') cell.cleanup(); vi.unstubAllGlobals(); });
  function execution(): StrategyExecution {
    const bars = [100, 100, 120].map((close, index) => ({ time: 1000 + index * 60, open: close, high: close, low: close, close, volume: 1 })), barIds = bars.map((_, index) => 'c12-review-hook:' + index);
    return { bars, barIds, identity: 'c12-review-hook', source: 'Explicit synthetic provider; no real security prices', currency: 'USD', timezone: 'UTC', chartType: 'standard', result: { plots: [], alerts: [], state: null, diagnostics: [], elapsedMs: 0, provisional: false, provenance: { kind: 'synthetic', label: 'Synthetic reviewer test' }, orders: [{ sequence: 1, side: 'buy', quantity: 1, event: { id: barIds[0], revision: 1, time: bars[0].time }, virtual: true }, { sequence: 2, side: 'sell', quantity: 1, event: { id: barIds[1], revision: 1, time: bars[1].time }, virtual: true }] } } as StrategyExecution;
  }
  const wait = () => new Promise(resolve => setTimeout(resolve, 5));
  it('a report started under old properties never publishes after the properties change', async () => {
    const props: StrategyDialogProps = { execution: execution(), config: { ...DEFAULT_STRATEGY_CONFIG, initialCapital: 1000 }, onChange: vi.fn(() => true), onClose: vi.fn() };
    const render = () => { hooks.cursor = 0; return useStrategyReport(props); }, flush = () => { for (const effect of hooks.effects.splice(0)) effect(); };
    render(); flush();
    props.config = { ...DEFAULT_STRATEGY_CONFIG, initialCapital: 2000 }; render(); flush();
    let state = render();
    for (let i = 0; i < 80 && !state.report; i++) { await wait(); state = render(); flush(); }
    expect(starts.at(-1)?.initialCapital).toBe(2000);
    expect(state.report?.config.initialCapital).toBe(2000);
    // Bars 100,100,120: buy at bar1 open 100, sell at bar2 open 120 -> +20 on 2000 capital.
    expect(state.report?.metrics.all.closedNet.value).toBe(20); expect(state.report?.metrics.all.closedReturn.value).toBe(1);
  });
  it('loading saved properties fills an unapplied draft and starts no report run', async () => {
    const change = vi.fn(() => true), props: StrategyDialogProps = { execution: execution(), config: { ...DEFAULT_STRATEGY_CONFIG, initialCapital: 1000 }, onChange: change, onClose: vi.fn() };
    const render = () => { hooks.cursor = 0; return StrategyDialog(props); }, flush = () => { for (const effect of hooks.effects.splice(0)) effect(); };
    render(); flush(); for (let i = 0; i < 20; i++) { await wait(); render(); flush(); }
    expect(starts).toHaveLength(1);
    const find = (node: any, predicate: (value: any) => boolean): any => { if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } } else if (node?.props) { if (predicate(node)) return node; return find(node.props.children, predicate); } return null; };
    const panel = find(render(), node => node.props && typeof node.props.onLoadProperties === 'function');
    panel.props.onLoadProperties({ ...DEFAULT_STRATEGY_CONFIG, initialCapital: 7000, slippageTicks: 4 });
    for (let i = 0; i < 20; i++) { await wait(); render(); flush(); }
    expect(starts).toHaveLength(1); expect(change).not.toHaveBeenCalled();
  });
});

describe('saved-report restore: acceptance, rejection, honesty of labels', () => {
  const exported = (commission: StrategyConfig['commission'] = { kind: 'percent', value: 0.1 }) => strategyReportJson(report(commission));
  it('restores valid fractional-lot exports for every commission type and lists the re-derived values', () => {
    for (const commission of [{ kind: 'percent', value: 0.1 }, { kind: 'per-unit', value: 0.2 }, { kind: 'fixed', value: 1.25 }] as const) {
      const restored = restoreStrategyReportJson(exported(commission));
      expect(restored.trades).toHaveLength(4); expect(restored.openLots).toHaveLength(1); expect(restored.summary.analysis).not.toBeNull();
    }
    expect(restoreStrategyReportJson(exported()).checks).toContain('Maximum close drawdown: 4.08925');
  });
  it('restores a long fractional run with many open lots (tolerance does not drift)', () => {
    const bars: Bar[] = [], signals: StrategySignal[] = [];
    for (let i = 0; i < 700; i++) { const price = Math.round((1.23456789 + ((i * 7919) % 1000) * 0.00012347) * 1e8) / 1e8; bars.push({ time: 1700000000 + i * 3600, open: price, high: price + 0.001, low: price - 0.001, close: Math.round((price + 0.0003) * 1e8) / 1e8, volume: 1 }); }
    for (let i = 0; i < 400; i++) signals.push({ barIndex: i, orders: [{ action: i % 2 ? 'sell' : 'buy', quantity: 0.003 }] });
    for (let i = 400; i < 699; i++) signals.push({ barIndex: i, orders: [{ action: 'buy', quantity: 0.001 }] });
    const result = backtestStrategy({ bars, signals, config: { initialCapital: 1000, lotSize: 0.001, tickSize: 0.00000001, slippageTicks: 3, pyramiding: 1000, commission: { kind: 'percent', value: 0.0137 } } });
    expect(result.ok).toBe(true);
    const built = buildStrategyReport({ bars, barIds: bars.map((_, i) => 'long:' + i), result, context: context('Europe/London') });
    expect(built.openLots.length).toBe(299);
    const restored = restoreStrategyReportJson(strategyReportJson(built));
    expect(restored.trades).toHaveLength(200);
  });
  it('rejects prototype-pollution keys anywhere and never pollutes Object.prototype', () => {
    const text = exported();
    const variants = [
      text.replace('{"schemaVersion":1', '{"__proto__":{"polluted":true},"schemaVersion":1'),
      text.replace('"config":{', '"config":{"__proto__":{"polluted":true},'),
      text.replace('"trades":[{', '"trades":[{"constructor":{"prototype":{"polluted":true}},'),
      text.replace('"metrics":{"all":{', '"metrics":{"all":{"__proto__":{"polluted":true},'),
      text.replace('"sides":{"all":{', '"sides":{"all":{"constructor":1,'),
    ];
    for (const variant of variants) { expect(variant).not.toBe(text); expect(() => restoreStrategyReportJson(variant)).toThrow(/unsupported field|plain data/); }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('rejects oversized, partial and type-confused input with reasons', () => {
    const parsed = () => JSON.parse(exported());
    expect(() => restoreStrategyReportJson('x'.repeat(20 * 1024 * 1024 + 1))).toThrow(/20 MiB/);
    const partial = parsed(); delete partial.equity; expect(() => restoreStrategyReportJson(JSON.stringify(partial))).toThrow(/missing required/);
    const truncated = exported().slice(0, 5000); expect(() => restoreStrategyReportJson(truncated)).toThrow(/not valid JSON/);
    const typed = parsed(); typed.trades[0].quantity = '1.5'; expect(() => restoreStrategyReportJson(JSON.stringify(typed))).toThrow();
    const mode = parsed(); mode.config.calcOnEveryTick = true; expect(() => restoreStrategyReportJson(JSON.stringify(mode))).toThrow(/Bar Magnifier/);
    const reorder = parsed(); [reorder.trades[0], reorder.trades[1]] = [reorder.trades[1], reorder.trades[0]]; expect(() => restoreStrategyReportJson(JSON.stringify(reorder))).toThrow(/chronological/);
    const zone = parsed(); zone.context.timezone = 'Mars/Olympus'; expect(() => restoreStrategyReportJson(JSON.stringify(zone))).toThrow(/timezone/i);
    expect(() => restoreStrategyReportJson('[]')).toThrow(); expect(() => restoreStrategyReportJson('null')).toThrow();
  });
  // The two first-review FINDING tests were retired after the builder's fixes; their scenarios are flipped below.
  it('M1 re-review: the committed 4519 baseline export restores and differs from this lane only by the documented OpenCandle-C12 additions', () => {
    const text = readFileSync(new URL('../fixtures/strategy-report-baseline-4519.json', import.meta.url), 'utf8'), saved = JSON.parse(text);
    // Shape check against what the lane emits for the same fixture and context.
    const { bars, barIds, result } = reportArithmeticFixture(), lane = JSON.parse(strategyReportJson(buildStrategyReport({ bars, barIds, result, context: saved.context })));
    const diffs: string[] = [];
    const walk = (a: any, b: any, path: string) => {
      if (a && b && typeof a === 'object' && typeof b === 'object') { for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], path + '.' + key); return; }
      if (!Object.is(a, b)) diffs.push(path);
    };
    walk(saved, lane, '');
    const computedLater = 'accountRequired|averageDrawdown|averageDrawdownDuration|averageRunup|averageRunupDuration|cagr|largestLiquidation|liquidatedVolume|marginCalls|maxIntrabarDrawdown|maxIntrabarDrawdownInitial|maxIntrabarRunup|maxIntrabarRunupInitial|netLargestLoss|returnAccountRequired|returnDrawdown|sharpe|sortino';
    // Percent metrics added after this export; the baseline has none of them.
    const r33Added = 'grossProfitPercent|grossLossPercent|openNetPercent|averagePnlPercent|averageProfitPercent|averageLossPercent|largestProfitPercent|largestLossPercent|maxRunupPercent';
    // Round3: readable signal labels added to trades, open entries and orders.
    const allowed = new RegExp('^\\.(analysis(\\..*)?|work|trades\\.\\d+\\.(entrySignal|exitSignal)|openLots\\.\\d+\\.entrySignal|orders\\.\\d+\\.label|metrics\\.(all|long|short)\\.(maxRunup|maxMargin)\\.(value|basis|reason|status)|metrics\\.(all|long|short)\\.(' + computedLater + ')\\.(value|basis|reason|status)|metrics\\.(all|long|short)\\.(largestLiquidation|liquidatedVolume)\\.unit|policies\\.(7|8|9|1[0-6])|metrics\\.(all|long|short)\\.[A-Za-z]+\\.(basis|reason)|policies\\.\\d+|metrics\\.(all|long|short)\\.(' + r33Added + '))$');
    expect(diffs.filter(path => !allowed.test(path))).toEqual([]);
    // None of the newly computed metrics overwrote a value the baseline already reported.
    const at = (root: any, path: string) => path.slice(1).split('.').reduce((node, key) => node?.[key], root);
    for (const path of diffs.filter(path => new RegExp('^\\.metrics\\.(all|long|short)\\.(' + computedLater + ')\\.value$').test(path))) expect(at(saved, path), path).toBeNull();
    expect(diffs).toContain('.analysis'); expect(saved.metrics.all.maxRunup.reason).toBe('Plateau, incomplete-period and duration conventions are not yet implemented.');
    expect(saved.metrics.all.maxMargin.reason).toBe('The complete capital/margin denominator and intrabar semantics are not implemented.');
    const restored = restoreStrategyReportJson(text);
    expect(restored.summary.analysis).toBeNull(); expect(restored.verified).not.toContain('all.maxRunup'); expect(restored.unverified.join(' ')).toMatch(/run-up \(all\): unavailable in this saved report/);
    expect(restored.verified).toEqual(expect.arrayContaining(['all.closedNet', 'all.maxDrawdown', 'all.finalEquity', 'long.commission']));
  });
  it('M2 re-review: each tampered field family throws, or is labelled as saved and not re-verified', () => {
    const parsed = () => JSON.parse(exported());
    const restore = (mutate: (value: any) => void) => { const value = parsed(); mutate(value); return restoreStrategyReportJson(JSON.stringify(value)); };
    const throws = (mutate: (value: any) => void, pattern: RegExp) => expect(() => restore(mutate)).toThrow(pattern);
    // Last equity row moved with a consistent drawdown and final-equity metric: the ledger anchor rejects it.
    throws(value => { const last = value.equity.at(-1); last.equity = 10005.31325; last.drawdown = 0.8855; last.drawdownPercent = 0.8855 / 10006.19875 * 100; value.metrics.all.finalEquity.value = 10005.31325; }, /Final close equity/);
    throws(value => { value.metrics.all.finalEquity.value = 10002.4; }, /Final marked equity/);
    throws(value => { value.drawdown.amount = 0; value.drawdown.percent = 0; }, /drawdown summary/);
    throws(value => { value.drawdown.troughBarId = 'c12-review:7'; }, /drawdown summary/);
    throws(value => { value.metrics.all.commission.value = 123; }, /Commission paid \(all\)/);
    throws(value => { value.metrics.long.commission.value = 0.5; }, /Commission paid \(long\)/);
    throws(value => { value.metrics.short.largestLoss.value = 2; }, /\(short\)/);
    throws(value => { value.metrics.long.largestProfit.value = 9; }, /\(long\)/);
    throws(value => { value.metrics.all.initialCapital.value = 1; }, /\(all\)/);
    throws(value => { value.metrics.all.maxRunup.value = 7; }, /run-up/);
    // Moving one closed trade between New York hour groups (totals unchanged) is caught.
    throws(value => { const hour = value.analysis.sides.all.hour; hour[1].trades--; hour[1].wins--; hour[1].net -= 2.6925; hour[1].winRate = 0; hour[2] = { ...hour[2], trades: 1, wins: 1, net: 2.6925, winRate: 100 }; }, /Entry-time groups \(all\)/);
    // Metrics outside the recomputed set restore, and are labelled "As saved, not re-verified" (absent from verified).
    const margin = restore(value => { value.metrics.all.maxMargin.value = 1; value.metrics.all.maxContracts.value = 99; });
    expect(margin.verified).not.toContain('all.maxMargin'); expect(margin.verified).not.toContain('all.maxContracts'); expect(margin.unverified.join(' ')).toMatch(/Margin, maximum units held/);
    // A saved metric flipped to unavailable is shown as Unavailable and listed, never as a number.
    const flipped = restore(value => { value.metrics.all.closedNet = { value: null, status: 'unavailable', unit: 'currency', basis: 'Unavailable', reason: 'x' }; });
    expect(flipped.verified).not.toContain('all.closedNet'); expect(flipped.unverified.join(' ')).toMatch(/\(all\): unavailable in this saved report/);
    // An interior equity row restores (it is disclosed as not verifiable without bar prices).
    const middle = restore(value => { value.equity[2].equity = 10001.6925; });
    expect(middle.unverified[0]).toMatch(/All nonfinal equity values, including the first row/);
  });
  it('discloses that the first equity row is saved data even when its derived statistics reconcile', () => {
    // Row 0 lowered to 9990 with a self-consistent drawdown row, drawdown block and close statistics: it restores,
    // and maxDrawdown / maxRunup are reported as "Recomputed and matched" from the tampered row.
    const value = JSON.parse(exported());
    value.equity[0] = { ...value.equity[0], equity: 9990, drawdown: 10, drawdownPercent: 0.1 };
    value.drawdown = { amount: 10, percent: 0.1, peakBarId: null, troughBarId: 'c12-review:0', peakEquity: 10000 };
    value.metrics.all.maxDrawdown.value = 10; value.metrics.all.maxDrawdownPercent.value = 0.1; value.metrics.all.maxRunup.value = 16.19875; value.metrics.all.maxRunupPercent.value = 16.19875 / 9990 * 100; // The percent form of the same run-up
    const restored = restoreStrategyReportJson(JSON.stringify(value));
    expect(restored.verified).toEqual(expect.arrayContaining(['all.maxDrawdown', 'all.maxRunup']));
    expect(restored.unverified[0]).toMatch(/including the first row/);
    expect(restored.unverified[0]).toMatch(/not verified against source prices/);
  });
  it('rejects a re-timed trade even when its changed analysis groups reconcile', () => {
    // Re-time trade 1 from bar 1 (06:30Z, 01:30 EST) to 07:15Z (03:15 EDT) and carry the matching analysis.
    const moved = BARS.map((row, index) => index === 1 ? { ...row, time: at('2024-03-10T07:15:00Z') } : row);
    const alt = buildStrategyReport({ bars: moved, barIds: ids(moved), result: backtestStrategy({ bars: moved, barIds: ids(moved), signals: SIGNALS, config: { ...BASE, commission: { kind: 'percent', value: 0.1 } } }), context: context('America/New_York') });
    const value = JSON.parse(exported());
    value.trades[0].entry.time = at('2024-03-10T07:15:00Z'); value.analysis = JSON.parse(JSON.stringify(alt.analysis));
    expect(value.equity[1].time).toBe(at('2024-03-10T06:30:00Z'));
    expect(() => restoreStrategyReportJson(JSON.stringify(value))).toThrow(/entry time or bar identity does not match its saved equity row/);
  });
  it('RE-REVIEW FINDING (section 9 proposal): the 100%-of-equity formula fits buys but not short entries with slippage', () => {
    // Flat, equity 10000, signal close 100 = next open (no gap), 2 x 0.25 slippage, 0.1% fee, lot 0.5, margin 100.
    // Protocol: P = close +/- slip; q = floorLot(B / (P * 1.001)). Buy: P 100.5 -> q = floor(99.40) = 99. Sell: P 99.5 -> q = floor(100.40) = 100.
    const bars: Bar[] = [bar('2024-01-02T15:00:00Z', 100, 100, 100, 100), bar('2024-01-02T16:00:00Z', 100, 100, 100, 100)];
    const config = { initialCapital: 10000, tickSize: 0.25, slippageTicks: 2, lotSize: 0.5, commission: { kind: 'percent' as const, value: 0.1 } };
    const buy = backtestStrategy({ bars, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 99 }] }], config });
    expect(buy.orders[0].status).toBe('filled'); // 10000 - 99*0.5 - 9.9495 = 9940.55 >= 99*100
    // Engine margin for a short uses mark, not the sell fill: needs 10000 - 100*0.5 - 9.95 = 9940.05 >= 100*100. Rejected.
    const sell = backtestStrategy({ bars, signals: [{ barIndex: 0, orders: [{ action: 'sell', quantity: 100 }] }], config });
    expect(sell.orders[0]).toMatchObject({ status: 'rejected', reason: 'Insufficient simulated equity for configured margin.' });
  });
  it('checks the 20 MiB cap before any parse, on length and on UTF-8 bytes', () => {
    expect(() => restoreStrategyReportJson('x'.repeat(20 * 1024 * 1024 + 1))).toThrow(/Nothing was parsed/);
    expect(() => restoreStrategyReportJson('"' + 'é'.repeat(10.5 * 1024 * 1024) + '"')).toThrow(/Nothing was parsed/);
  });
  it('measures restore time for a 6,000-trade export on the calling thread (recorded, bounded by the 20 MiB cap)', () => {
    const bars: Bar[] = [], signals: StrategySignal[] = [];
    for (let i = 0; i < 12000; i++) { const price = 100 + (i % 7) * 0.25; bars.push({ time: 1700000000 + i * 60, open: price, high: price + 0.5, low: price - 0.5, close: price, volume: 1 }); }
    for (let i = 0; i < 11999; i++) signals.push({ barIndex: i, orders: [{ action: i % 2 ? 'sell' : 'buy', quantity: 1 }] });
    const result = backtestStrategy({ bars, signals, config: { initialCapital: 100000, commission: { kind: 'percent', value: 0.05 } } });
    const text = strategyReportJson(buildStrategyReport({ bars, barIds: bars.map((_, i) => 'big:' + i), result, context: context('UTC') }));
    const started = performance.now(), restored = restoreStrategyReportJson(text), elapsed = performance.now() - started;
    console.log(`[c12-review] restore of ${restored.trades.length} trades / ${restored.equity.length} rows / ${(text.length / 1048576).toFixed(1)} MiB took ${elapsed.toFixed(0)} ms`);
    expect(restored.trades.length).toBe(5999);
  }, 120000);
});
