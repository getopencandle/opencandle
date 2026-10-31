// Report analyses travel through the worker transport, render in the dialog, and XLSX bytes reach the renderer.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStrategyReportClient } from '../../src/strategy-report/client';
import { validateAnalysis } from '../../src/strategy-report/responses';
import { workbookExport } from '../../src/strategy-report/use-report';
import { DEFAULT_STRATEGY_CONFIG } from '../../src/domain/strategy';
import { buildStrategyReport } from '../../src/domain/strategy-report';
import { sampleIndices } from '../../src/domain/strategy-report-periods';
import { RpstAnalysisPanel } from '../../src/ui/StrategyDialog';
import type { StrategyReportJobInput, StrategyReportOwner } from '../../src/strategy-report/types';
import { ReportLoopbackPort } from './strategy-report-test-port';
import { reportArithmeticFixture } from './strategy-report-fixtures';

function input(): StrategyReportJobInput {
  const bars = [100, 100, 120, 110].map((close, index) => ({ time: 1000 + index * 86400, open: close, high: close, low: close, close, volume: 1 })), barIds = ['s:a', 's:b', 's:c', 's:d'];
  return { execution: { bars, barIds, chartType: 'standard', context: { executionId: 'rpst-wiring', sourceLabel: 'Synthetic RPST wiring', currency: null, timezone: 'UTC' }, proposals: ['buy', 'sell'].map((side, index) => ({ sequence: index + 1, side, quantity: 1, event: { id: barIds[index], time: bars[index].time, revision: 1 }, virtual: true })) }, config: { ...DEFAULT_STRATEGY_CONFIG, chartType: 'standard' } } as StrategyReportJobInput;
}
const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.unstubAllGlobals(); });
async function handle() {
  const owner: StrategyReportOwner = { signal: new AbortController().signal, assertCurrent() {} };
  const client = createStrategyReportClient({ factory: () => new ReportLoopbackPort(), yieldControl: () => Promise.resolve() });
  cleanups.push(() => client.dispose()); return client.start(input(), owner, () => {});
}

describe('RPST report analyses through the worker (STRATEGY.REPORT.PERFORMANCE.*, TRADE_ANALYSIS.DISTRIBUTION, CHART.*)', () => {
  it('the summary carries bounded distribution, margin usage, growth/decline and benchmark analyses', async () => {
    const rpst = (await handle()).summary.analysis.rpst!;
    expect(rpst.distribution).toMatchObject({ available: true, averageGainPercent: 20 });
    expect(rpst.margin.points.map(point => point.margin)).toEqual([0, 100, 0, 0]); expect(rpst.margin.maxMargin).toBe(100);
    expect(rpst.growthDecline.summary.growth).toEqual({ max: 20, average: 20, current: 0 }); expect(rpst.growthDecline.periods).toEqual([{ kind: 'growth', amount: 20, percent: 0.002, startTime: 1000 + 86400, endTime: 1000 + 2 * 86400 }]);
    expect('points' in rpst.benchmark && rpst.benchmark.points.at(-1)).toEqual({ time: 1000 + 3 * 86400, strategyPercent: 0.002, benchmarkPercent: 10 });
  });
  it('the transport validator rejects tampered or oversized analyses', () => {
    const { bars, barIds, result } = reportArithmeticFixture();
    const report = buildStrategyReport({ bars, barIds, result, context: { executionId: 'v', sourceLabel: 'Synthetic', currency: null, timezone: 'UTC' } });
    const copy = () => JSON.parse(JSON.stringify(report.analysis));
    expect(() => validateAnalysis(copy(), report.trades.length, 'UTC')).not.toThrow();
    const extra = copy(); extra.rpst.margin.extra = 1; expect(() => validateAnalysis(extra, report.trades.length, 'UTC')).toThrow();
    const outlier = copy(); if (outlier.rpst.distribution.available) outlier.rpst.distribution.outliers = { available: true }; expect(() => validateAnalysis(outlier, report.trades.length, 'UTC')).toThrow();
    const big = copy(); big.rpst.margin.points = Array.from({ length: 501 }, () => big.rpst.margin.points[0]); expect(() => validateAnalysis(big, report.trades.length, 'UTC')).toThrow();
    const old = copy(); delete old.rpst; expect(() => validateAnalysis(old, report.trades.length, 'UTC')).not.toThrow();
    expect(sampleIndices(2000, 500, [1234])).toContain(1234); expect(sampleIndices(2000, 500).length).toBeLessThanOrEqual(500); expect(sampleIndices(3, 500)).toEqual([0, 1, 2]);
  });
  it('the dialog panel renders the analyses and the margin hover for a chosen point', async () => {
    const rpst = (await handle()).summary.analysis.rpst!;
    const html = renderToStaticMarkup(React.createElement(RpstAnalysisPanel, { analysis: rpst, timezone: 'UTC', initialIndex: 1 }));
    for (const text of ['Return distribution', 'Average gain: 20%', 'Outliers: unavailable', 'Margin usage', 'Maximum modeled margin: 100', '1 open trade, modeled margin 100', 'Growth and decline', 'Benchmark comparison', 'buy and hold 10%']) expect(html).toContain(text);
    expect(renderToStaticMarkup(React.createElement(RpstAnalysisPanel, { analysis: undefined, timezone: 'UTC' }))).toContain('not in this report');
  });
});

describe('RPST XLSX renderer path (STRATEGY.REPORT.EXPORT.XLSX)', () => {
  it('the worker returns workbook bytes to the renderer; the desktop save stays unavailable until its bridge lands', async () => {
    const exported = await (await handle()).export('xlsx');
    expect(exported.format).toBe('xlsx'); expect(exported.text).toBe(''); expect([...exported.data!.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]); expect(exported.bytes).toBe(exported.data!.byteLength);
    expect((await (await handle()).export('trades')).format).toBe('csv');
    vi.stubGlobal('window', { lv: { exportData: vi.fn() } }); expect(workbookExport()).toBeNull();
    const save = vi.fn(async () => ({ ok: true, value: { fileName: 'x.xlsx' } })); vi.stubGlobal('window', { lv: { exportData: vi.fn(), exportBinary: save } });
    expect(typeof workbookExport()).toBe('function');
  });
});
