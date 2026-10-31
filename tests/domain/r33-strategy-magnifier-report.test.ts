// Bar Magnifier data source, every-tick forming bar, the report transport, the Performance Summary and
// restored percent metrics. SYNTHETIC bars only; the controlled transport is the real worker session.
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_STRATEGY_CONFIG, STRATEGY_EVERY_TICK_POLICIES, validateStrategyConfig, type StrategyConfig } from '../../src/domain/strategy';
import { STRATEGY_TESTER_CAPABILITIES, strategyReportJobInput } from '../../src/strategy-report/use-report';
import type { StrategyExecution } from '../../src/ui/StrategyDialog';
import { createStrategyReportClient, type ReportWorkerPort } from '../../src/strategy-report/client';
import { StrategyReportWorkerSession } from '../../src/strategy-report/worker-core';
import { magnifierInterval, resolveMagnifierBars } from '../../src/strategy-report/magnifier';
import { PerformanceSummary, performanceCell, reportModeLines, ReportProperties } from '../../src/strategy-report/PerformanceSummary';
import { restoreStrategyReportJson } from '../../src/strategy-report/restore';
import { STRATEGY_REPORT_METRICS } from '../../src/domain/strategy-report-catalog';
import { REPORT_TRADE_COLUMNS, tradeColumnValue } from '../../src/domain/strategy-report-view';
import type { StrategyReportJobInput } from '../../src/strategy-report/types';
import type { Bar } from '../../src/domain/types';

class Port implements ReportWorkerPort {
  listeners = new Map<string, Set<(event: any) => void>>(); requests: any[] = [];
  session = new StrategyReportWorkerSession((progress, job, sequence) => this.emit({ version: 1, kind: 'progress', job, sequence, progress }));
  emit(data: unknown) { for (const fn of this.listeners.get('message') ?? []) fn({ data }); }
  addEventListener(type: string, fn: (event: any) => void) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type)!.add(fn); }
  removeEventListener(type: string, fn: (event: any) => void) { this.listeners.get(type)?.delete(fn); }
  postMessage(value: unknown) { const request = structuredClone(value) as any; this.requests.push(request); queueMicrotask(() => this.emit(this.session.handle(request))); }
  terminate() {}
}
const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
function setup() { const port = new Port(), client = createStrategyReportClient({ factory: () => { queueMicrotask(() => port.emit({ version: 1, kind: 'started' })); return port; }, yieldControl: () => Promise.resolve() }); cleanups.push(() => client.dispose()); return { port, client, owner: { signal: new AbortController().signal, assertCurrent: vi.fn() } }; }

const HOUR = 3600, T0 = Date.UTC(2024, 0, 2, 14) / 1000;
// Hourly chart bars and their 5-minute bars: bar 2 dips to 90 first, then rallies to 104 (the OHLC route assumes the high first).
const chart: Bar[] = [[100, 101, 99, 100], [100, 101, 99, 100], [100, 104, 90, 103], [103, 104, 102, 103]].map(([open, high, low, close], index) => ({ time: T0 + index * HOUR, open, high, low, close, volume: 10 }));
const five = (start: number, rows: number[][]) => rows.map(([open, high, low, close], index) => ({ time: start + index * 300, open, high, low, close, volume: 1 }));
const lower = [...five(chart[0].time, [[100, 101, 99, 100]]), ...five(chart[1].time, [[100, 101, 99, 100]]), ...five(chart[2].time, [[100, 100.5, 90, 91], [91, 104, 91, 103]]), ...five(chart[3].time, [[103, 104, 102, 103]])];
const ids = chart.map((_, index) => 'synthetic-hour:' + index);
const proposal = (sequence: number, index: number, extra: Record<string, unknown>) => ({ sequence, event: { id: ids[index], time: chart[index].time, revision: 1 }, virtual: true, ...extra });
const proposals = [proposal(1, 0, { side: 'buy', quantity: 1, options: { id: 'Long' } }), proposal(2, 0, { side: 'exit', target: 'Bracket', exit: { fromEntry: 'Long', limit: 103.5, stop: 95 } })];
const context = { executionId: 'synthetic-r33-magnifier', sourceLabel: 'Synthetic hourly', currency: 'USD', timezone: 'UTC' };
const config = (patch: Partial<StrategyConfig> = {}): StrategyConfig => ({ ...DEFAULT_STRATEGY_CONFIG, initialCapital: 1000, ...patch });
const job = (patch: Partial<StrategyReportJobInput['execution']> = {}, settings = config()): StrategyReportJobInput => ({ execution: { bars: chart, barIds: ids, proposals, chartType: 'standard', context, ...patch }, config: settings });

describe(' Bar Magnifier data source', () => {
  it('maps each chart interval to its lower interval (OpenCandle-defined table)', () => {
    expect([['1W', '1D'], ['1D', '60m'], ['240m', '15m'], ['60m', '5m'], ['15m', '1m'], ['5m', '1m'], ['1m', null], ['30s', null], ['100T', null]].map(([chartInterval]) => [chartInterval, magnifierInterval(chartInterval)])).toEqual([['1W', '1D'], ['1D', '60m'], ['240m', '15m'], ['60m', '5m'], ['15m', '1m'], ['5m', '1m'], ['1m', null], ['30s', null], ['100T', null]]);
  });
  it('reads loaded bars through the request resolver and keeps only those inside the chart bars', () => {
    const seen: unknown[] = [];
    const resolver = (request: unknown, base: unknown) => { seen.push([request, base]); return { bars: [{ ...lower[0], time: chart[0].time - 300 }, ...lower, { ...lower[0], time: chart[3].time + HOUR }], resolution: '5m', label: 'SYN 5m from Synthetic', fixture: true }; };
    const ready = resolveMagnifierBars({ bars: chart, base: { datasetId: 'synthetic:hourly', resolution: '60m' }, resolver });
    expect(seen).toEqual([[{ id: 'magnifier', symbol: null, interval: '5m' }, { datasetId: 'synthetic:hourly', resolution: '60m' }]]);
    expect(ready).toEqual({ state: 'ready', bars: lower, label: 'SYN 5m from Synthetic (synthetic)', interval: '5m' });
  });
  it('reports loading and unavailable data instead of manufacturing it', () => {
    expect(resolveMagnifierBars({ bars: chart, base: { datasetId: 'x', resolution: '60m' }, resolver: () => { throw new Error('SPY is loading.'); } })).toEqual({ state: 'loading', message: 'SPY is loading.', interval: '5m' });
    expect(resolveMagnifierBars({ bars: chart, base: { datasetId: 'x', resolution: '60m' }, resolver: () => { throw new Error('No loaded data for SPY.'); } })).toMatchObject({ state: 'unavailable', reason: '5m bars are not available: No loaded data for SPY. Fills use the OHLC route.' });
    expect(resolveMagnifierBars({ bars: chart, base: { datasetId: 'x', resolution: null }, resolver: null })).toMatchObject({ state: 'unavailable', interval: null });
    expect(resolveMagnifierBars({ bars: chart, base: { datasetId: 'x', resolution: '1m' }, resolver: null }).state).toBe('unavailable');
  });
});

describe(' report transport with Bar Magnifier rows', () => {
  it('uploads the lower-timeframe section, magnifies the run and verifies the magnified fills', async () => {
    const plain = await setup().client.start(job({}, config({ barMagnifier: true })), setup().owner);
    // Without lower-timeframe rows every bar keeps the OHLC route: bar 2 assumes the high first, so the 103.5 target fills.
    expect(plain.summary.policies).toContain("Bar Magnifier coverage: 0 of 4 execution bars used lower-timeframe bars. The other 4 kept the OHLC route: no lower-timeframe bars, or bars that do not reproduce the execution bar's open, high, low and close. Missing data is never manufactured.");
    const h = setup(), handle = await h.client.start(job({ magnifierBars: lower, magnifierLabel: 'SYN 5m' }, config({ barMagnifier: true })), h.owner);
    expect(h.port.requests.filter(request => request.kind === 'chunk').map(request => request.section)).toEqual(['bars', 'barIds', 'proposals', 'magnifierBars']);
    expect(handle.summary.policies.find(line => line.startsWith('Bar Magnifier coverage'))).toContain('4 of 4 execution bars used lower-timeframe bars (SYN 5m)');
    // The 5-minute bars show the dip first: the 95 stop fills before the rally.
    const orders = (await handle.orders(0)).rows;
    expect(orders.map(row => [row.label, row.status, row.fillPrice])).toEqual([['Long', 'filled', 100], ['Exit Bracket take profit', 'cancelled', null], ['Exit Bracket stop loss', 'filled', 95]]);
    const trades = await handle.trades({ side: 'all', query: '', sort: 'number', descending: false, page: 0 });
    expect(trades.rows[0]).toMatchObject({ netProfit: -5 }); expect(trades.rows[0].exit.routePosition).toBeGreaterThan(0); expect(trades.rows[0].exit.routePosition).toBeLessThan(4);
    expect(reportModeLines(handle.summary.config, handle.summary.policies)).toContain(handle.summary.policies.find(line => line.startsWith('Bar Magnifier coverage'))!);
  });
  it('refuses lower-timeframe rows without the Bar Magnifier property', async () => {
    const h = setup(); await expect(h.client.start(job({ magnifierBars: lower }), h.owner)).rejects.toThrow(/Bar Magnifier rows need the Bar Magnifier property/);
  });
  it('declares the forming bar with Recalculate on every tick, and its report says so', async () => {
    const h = setup(), handle = await h.client.start(job({ formingBar: true }, config({ calcOnEveryTick: true })), h.owner);
    expect(h.port.requests.find(request => request.kind === 'start').input.formingBar).toBe(true);
    expect(handle.summary.policies).toContain(STRATEGY_EVERY_TICK_POLICIES.forming);
    expect(reportModeLines(handle.summary.config, handle.summary.policies)).toContain('Recalculation: on every tick. The last bar is the still-forming realtime bar, so this report repaints until it closes.');
    const off = await setup().client.start(job(), setup().owner);
    expect(reportModeLines(off.summary.config, off.summary.policies)).toEqual(['Orders: market orders fill at the next bar open.', 'Recalculation: once per bar, at its close.', 'Recalculate after order is filled: off.', 'Bar Magnifier: off. Intrabar fills use the open, high, low and close route of each bar.']);
  });
});

describe(' Performance Summary, trade percents and restore', () => {
  it('shows All, Long and Short with each amount beside its percent form', async () => {
    const h = setup(), handle = await h.client.start(job(), h.owner), summary = handle.summary;
    // One long trade: entry 100, take profit 103.5 on bar 2 (OHLC route, high first): net 3.5 on 1000 capital.
    expect(summary.metrics.all.closedNet.value).toBe(3.5);
    expect(performanceCell(summary.metrics.all.closedNet, summary.metrics.all.closedReturn, 'USD')).toBe('3.50 USD (0.35%)');
    expect(summary.metrics.all.averagePnlPercent.value).toBe(3.5); expect(summary.metrics.all.largestProfitPercent.value).toBe(3.5); expect(summary.metrics.all.grossProfitPercent.value).toBe(0.35);
    expect(summary.metrics.short.averagePnlPercent).toMatchObject({ value: null, status: 'undefined' });
    const html = renderToStaticMarkup(React.createElement(PerformanceSummary, { summary }));
    expect(html).toContain('<th>All</th><th>Long</th><th>Short</th>'); expect(html).toContain('Average trade'); expect(html).toContain('3.50 USD (3.50%)'); expect(html).not.toMatch(/—/);
    const properties = renderToStaticMarkup(React.createElement(ReportProperties, { summary, firstTime: chart[0].time, lastTime: chart[3].time, timezone: 'UTC' }));
    expect(properties).toContain('01/02/2024, 14:00 to 01/02/2024, 17:00 (4 bars)'); expect(properties).toContain('Recalculation: once per bar, at its close.');
    const trades = await handle.trades({ side: 'all', query: '', sort: 'number', descending: false, page: 0 });
    expect(REPORT_TRADE_COLUMNS.slice(-2)).toEqual([['favorablePercent', 'Favorable %'], ['adversePercent', 'Adverse %']]);
    expect([tradeColumnValue(trades.rows[0], 'favorablePercent'), tradeColumnValue(trades.rows[0], 'adversePercent')]).toEqual([3.5, 1]);
  });
  it('restores the percent forms with recomputation, and an older export without them as unavailable', async () => {
    const h = setup(), handle = await h.client.start(job(), h.owner), saved = JSON.parse((await handle.export('json')).text);
    const restored = restoreStrategyReportJson(JSON.stringify(saved));
    expect(restored.verified).toEqual(expect.arrayContaining(['all.averagePnlPercent', 'all.grossProfitPercent', 'all.maxRunupPercent', 'long.largestProfitPercent']));
    const tampered = structuredClone(saved); tampered.metrics.all.averagePnlPercent.value = 10;
    expect(() => restoreStrategyReportJson(JSON.stringify(tampered))).toThrow(/Average trade return % \(all\) does not agree/);
    const older = structuredClone(saved); for (const side of ['all', 'long', 'short']) for (const definition of STRATEGY_REPORT_METRICS) if (definition.since) delete older.metrics[side][definition.key];
    const old = restoreStrategyReportJson(JSON.stringify(older));
    expect(old.summary.metrics.all.averagePnlPercent).toMatchObject({ value: null, status: 'unavailable' });
    expect(old.unverified).toContain('Average trade return % (all): unavailable in this saved report.');
    const mode = structuredClone(saved); mode.config.barMagnifier = true; expect(() => restoreStrategyReportJson(JSON.stringify(mode))).toThrow(/Bar Magnifier/);
  });
});

describe(' Strategy tester job input (use-report)', () => {
  const execution = (forming: boolean): StrategyExecution => ({ result: { orders: proposals.slice(0, 1) } as never, bars: chart.slice(0, 3), barIds: ids.slice(0, 3), standardBars: chart.slice(0, 3), identity: 'synthetic', source: 'Synthetic hourly', chartType: 'standard', currency: 'USD', timezone: 'UTC', magnifierBase: { datasetId: 'synthetic:hourly', resolution: '60m' }, forming: forming ? { bar: chart[3], barId: ids[3], standardBar: chart[3], orders: [proposal(9, 3, { side: 'sell', quantity: 1 })] } : null });
  it('adds the forming bar and its proposals only with Recalculate on every tick', () => {
    const off = strategyReportJobInput(execution(true), config());
    expect(off.waiting).toBe(false); if (off.waiting) return;
    expect(off.input.execution.bars).toHaveLength(3); expect('formingBar' in off.input.execution).toBe(false);
    const on = strategyReportJobInput(execution(true), config({ calcOnEveryTick: true }));
    if (on.waiting) throw new Error('unexpected wait');
    expect(on.input.execution.bars).toEqual(chart); expect(on.input.execution.barIds).toEqual(ids); expect(on.input.execution.standardBars).toEqual(chart);
    expect(on.input.execution.proposals.map(row => row.sequence)).toEqual([1, 9]); expect(on.input.execution.formingBar).toBe(true);
    const closed = strategyReportJobInput(execution(false), config({ calcOnEveryTick: true }));
    if (closed.waiting) throw new Error('unexpected wait'); expect(closed.input.execution.formingBar).toBe(false);
  });
  it('waits while lower-timeframe bars load, then carries them; unavailable data leaves a notice', () => {
    expect(strategyReportJobInput(execution(false), config({ barMagnifier: true }), () => ({ state: 'loading', message: 'SYN is loading.', interval: '5m' }))).toEqual({ waiting: true, notice: 'Bar Magnifier: waiting for 5m bars. SYN is loading.' });
    const ready = strategyReportJobInput(execution(false), config({ barMagnifier: true }), () => ({ state: 'ready', bars: lower, label: 'SYN 5m', interval: '5m' }));
    if (ready.waiting) throw new Error('unexpected wait'); expect(ready.input.execution.magnifierBars).toBe(lower); expect(ready.input.execution.magnifierLabel).toBe('SYN 5m'); expect(ready.notice).toBeUndefined();
    const none = strategyReportJobInput(execution(false), config({ barMagnifier: true }), () => ({ state: 'unavailable', reason: 'No lower interval is defined for 1m charts, so fills use the OHLC route.', interval: null }));
    if (none.waiting) throw new Error('unexpected wait'); expect(none.input.execution.magnifierBars).toEqual([]); expect(none.notice).toBe('Bar Magnifier: No lower interval is defined for 1m charts, so fills use the OHLC route.');
    expect('magnifierBars' in (strategyReportJobInput(execution(false), config()) as { input: StrategyReportJobInput }).input.execution).toBe(false);
  });
  it('Properties validates the new settings against what the Strategy tester supplies', () => {
    expect(validateStrategyConfig(config({ calcOnEveryTick: true, barMagnifier: true }), STRATEGY_TESTER_CAPABILITIES)).toEqual([]);
    // The Strategy tester now supplies recalculation after a fill (the onFill feedback replay).
    expect(validateStrategyConfig(config({ calcOnOrderFills: true }), STRATEGY_TESTER_CAPABILITIES)).toEqual([]);
    expect(validateStrategyConfig(config({ calcOnOrderFills: true })).join(' ')).toMatch(/executable strategy callback/);
  });
});
