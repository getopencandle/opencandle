// Order execution delay, run-up/drawdown period spans, the report strategy chooser and the Advanced View
// benchmark workspace key. SYNTHETIC bars only (hand-written prices).
import { describe, expect, it } from 'vitest';
import { backtestStrategy, DEFAULT_STRATEGY_CONFIG, validateStrategyConfig, type StrategySignal } from '../../src/domain/strategy';
import { buildStrategyReport } from '../../src/domain/strategy-report';
import { validateReportStart } from '../../src/strategy-report/schema';
import { validateFrozenStrategyConfig } from '../../src/domain/strategy-alert';
import { periodAtRow, periodSpans, periodText, rowAtTime } from '../../src/strategy-report/ReportChart';
import { forgetStrategyRuns, recalledStrategyRun, rememberStrategyRun, strategyChoices } from '../../src/strategy-report/strategy-chooser';
import { sameStrategyConfig, withOrderDelay } from '../../src/ui/StrategyDialog';
import { restoreWorkspace } from '../../src/ui/workspace-validation';
import { defaultTheme } from '../../src/ui/themes';
import type { Bar } from '../../src/domain/types';

const t0 = 1_700_000_000;
const closes = [100, 101, 103, 102, 99, 98, 101, 104, 106, 105, 103, 107];
const bars: Bar[] = closes.map((close, index) => ({ time: t0 + index * 86400, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1 }));
const signals: StrategySignal[] = [
  { barIndex: 0, orders: [{ action: 'buy', quantity: 2 }] }, { barIndex: 3, orders: [{ action: 'close' }] },
  { barIndex: 4, orders: [{ action: 'sell', quantity: 1 }] }, { barIndex: 6, orders: [{ action: 'close' }] },
  { barIndex: 7, orders: [{ action: 'buy', quantity: 1, type: 'limit', limitPrice: 105 }] }, { barIndex: 11, orders: [{ action: 'close' }] },
];
const strip = (result: ReturnType<typeof backtestStrategy>) => { const { config: _config, ...rest } = result; return JSON.stringify(rest); };

describe('G2-STRAT order execution delay (STRATEGY.REPORT.CURRENT.ORDER_DELAY)', () => {
  it('absent and 0 give bit-identical results; the default config gains no key', () => {
    const base = backtestStrategy({ bars, signals });
    expect(base.ok, base.diagnostics.join(' ')).toBe(true);
    expect(strip(backtestStrategy({ bars, signals, config: { orderDelayBars: 0 } }))).toBe(strip(base));
    expect(Object.hasOwn(base.config, 'orderDelayBars')).toBe(false);
    expect(Object.hasOwn(DEFAULT_STRATEGY_CONFIG, 'orderDelayBars')).toBe(false);
    expect(withOrderDelay({ ...DEFAULT_STRATEGY_CONFIG }, 0)).toEqual(DEFAULT_STRATEGY_CONFIG);
    expect(sameStrategyConfig(withOrderDelay({ ...DEFAULT_STRATEGY_CONFIG }, 2), DEFAULT_STRATEGY_CONFIG)).toBe(false);
  });
  it('N bars of delay equals the same proposals sent N bars later (sized and filled there); past-the-end proposals are dropped and counted', () => {
    for (const delay of [1, 2]) {
      const delayed = backtestStrategy({ bars, signals, config: { orderDelayBars: delay } });
      const kept = signals.filter(row => row.barIndex + delay < bars.length).map(row => ({ ...row, barIndex: row.barIndex + delay }));
      const shifted = backtestStrategy({ bars, signals: kept });
      expect(delayed.ok, delayed.diagnostics.join(' ')).toBe(true);
      expect(JSON.stringify(delayed.trades)).toBe(JSON.stringify(shifted.trades));
      expect(JSON.stringify(delayed.fills)).toBe(JSON.stringify(shifted.fills));
      expect(delayed.metrics).toEqual(shifted.metrics);
      const dropped = signals.filter(row => row.barIndex + delay >= bars.length).length;
      expect(delayed.policies.find(line => line.startsWith('Order execution delay'))).toContain(`placed ${delay} bar`);
      if (dropped) expect(delayed.policies.join(' ')).toContain(`${dropped} proposal`);
    }
    // First entry: no delay fills at bar 1 open, one bar of delay at bar 2 open.
    expect(backtestStrategy({ bars, signals }).fills[0].barIndex).toBe(1);
    expect(backtestStrategy({ bars, signals, config: { orderDelayBars: 1 } }).fills[0].barIndex).toBe(2);
  });
  it('validation, report transport and alert freezing accept the optional key', () => {
    expect(validateStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, orderDelayBars: 3 })).toEqual([]);
    for (const bad of [-1, 1.5, 1001, NaN]) expect(validateStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, orderDelayBars: bad }).join(' ')).toContain('Order execution delay');
    const context = { executionId: 'g2', sourceLabel: 'Synthetic', currency: 'USD', timezone: 'UTC' };
    expect(() => validateReportStart({ context, config: { ...DEFAULT_STRATEGY_CONFIG, orderDelayBars: 2 }, chartType: 'standard', counts: { bars: 1, standardBars: 0, barIds: 1, proposals: 0 } })).not.toThrow();
    expect(() => validateFrozenStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, orderDelayBars: 2 })).not.toThrow();
    const result = backtestStrategy({ bars, signals, config: { orderDelayBars: 1 } });
    const report = buildStrategyReport({ result, bars, barIds: bars.map((_, index) => 'b' + index), context });
    expect(report.config.orderDelayBars).toBe(1);
  });
});

describe('G2-STRAT run-up and drawdown periods on the report chart (CHART.LAYER.GROWTH_DECLINE, CHART.PERIOD_HOVER)', () => {
  const points = bars.map((bar, index) => ({ barIndex: index, time: bar.time }));
  it('maps period times to rows exactly, and interpolates between sampled rows', () => {
    expect(rowAtTime(points, bars[5].time, bars.length)).toBe(5);
    const sampled = [points[0], points[6], points[11]];
    expect(rowAtTime(sampled, bars[6].time, bars.length)).toBe(6);
    expect(rowAtTime(sampled, bars[3].time, bars.length)).toBe(3);
    expect(rowAtTime(sampled, bars[11].time + 999, bars.length)).toBe(11);
  });
  it('spans flag the largest of each kind; hover picks the innermost period and names amount, percent and dates', () => {
    const periods = [
      { kind: 'growth' as const, amount: 30, percent: 3, startTime: bars[0].time, endTime: bars[2].time },
      { kind: 'decline' as const, amount: 50, percent: 4.85, startTime: bars[2].time, endTime: bars[7].time },
      { kind: 'growth' as const, amount: 80, percent: 8, startTime: bars[5].time, endTime: bars[8].time },
    ];
    const spans = periodSpans(periods, points, bars.length);
    expect(spans.map(span => [span.from, span.to, span.largest])).toEqual([[0, 2, false], [2, 7, true], [5, 8, true]]);
    expect(periodAtRow(spans, 6)?.kind).toBe('growth');
    expect(periodAtRow(spans, 3)?.kind).toBe('decline');
    expect(periodAtRow(spans, 10)).toBeNull();
    const text = periodText(spans[1], 'UTC');
    expect(text).toMatch(/^Drawdown \(largest\): -50 \(-4\.85%\), /);
    expect(text).toContain('2023');
  });
  it('a built report carries the periods the chart reads', () => {
    const result = backtestStrategy({ bars, signals });
    const report = buildStrategyReport({ result, bars, barIds: bars.map((_, index) => 'b' + index), context: { executionId: 'g2', sourceLabel: 'Synthetic', currency: 'USD', timezone: 'UTC' } });
    const rpst = report.analysis.rpst!;
    const spans = periodSpans(rpst.growthDecline.periods, rpst.margin.points, bars.length);
    expect(spans.length).toBe(rpst.growthDecline.periods.length);
    expect(spans.length).toBeGreaterThan(0);
    for (const span of spans) expect(span.from).toBeLessThanOrEqual(span.to);
  });
});

describe('G2-STRAT report strategy chooser (STRATEGY.REPORT.CURRENT.SELECT_STRATEGY)', () => {
  it('lists strategy bindings only, numbering repeated names; runs are kept per cell and binding', () => {
    const documents = [{ id: 'd1', kind: 'strategy', name: 'Cross' }, { id: 'd2', kind: 'indicator', name: 'Line' }, { id: 'd3', kind: 'strategy', name: 'Breakout' }];
    const bindings = [{ id: 'a', documentId: 'd1', name: 'Cross' }, { id: 'b', documentId: 'd2', name: 'Line' }, { id: 'c', documentId: 'd1', name: 'Cross' }, { id: 'e', documentId: 'd3', name: 'Breakout' }];
    expect(strategyChoices(bindings, documents)).toEqual([{ id: 'a', name: 'Cross (1)' }, { id: 'c', name: 'Cross (2)' }, { id: 'e', name: 'Breakout' }]);
    const owner = new Map<string, string>(), run = { bindingId: 'c', result: 1 };
    rememberStrategyRun(owner, 'cell', run);
    expect(recalledStrategyRun(owner, 'cell', 'c')).toBe(run);
    expect(recalledStrategyRun(owner, 'other', 'c')).toBeNull();
    forgetStrategyRuns(owner);
    expect(recalledStrategyRun(owner, 'cell', 'c')).toBeNull();
  });
});

describe('G2-STRAT watchBenchmarks workspace key (additive)', () => {
  const screenConfiguration = { columns: [{ id: 'symbol', metric: 'symbol' }], filters: [], sort: { columnId: 'symbol', direction: 'asc' }, universe: { resolution: '1D', currency: 'USD', assets: ['stock', 'etf'], excludedInstrumentIds: [], sourceChoices: {} }, filtersHidden: false, view: 'table' };
  const screener = { ...screenConfiguration, schemaVersion: 2, name: 'Loaded stocks and ETFs', activeScreenId: 'local-default-screen', screens: [{ id: 'local-default-screen', name: 'Loaded stocks and ETFs', configuration: structuredClone(screenConfiguration), revision: 1, savedAt: 0 }], recentIds: ['local-default-screen'], autosave: false };
  const original: any = { screener, version: 1, symbol: 'GME', chartStyle: 'candles', themeId: defaultTheme.id, appearance: defaultTheme.appearance, watchlist: ['GME'], drawings: { version: 1, drawings: [] }, indicators: [], imports: [], sourceId: null, script: { id: 'test', name: 'Test', source: '({onBar(){}})', pane: 'price' }, chartOptions: { source: 'close', scale: 'linear', auto: true, invert: false, timezone: 'UTC' }, strategy: DEFAULT_STRATEGY_CONFIG };
  it('old workspaces load unchanged; a present key is validated exactly', () => {
    const plain = restoreWorkspace(original, original) as any;
    expect(Object.hasOwn(plain, 'watchBenchmarks')).toBe(false);
    const withKey = restoreWorkspace({ ...original, watchBenchmarks: { schemaVersion: 1, byList: { L: 'wl:NYSE:SPY' } } }, original) as any;
    expect(withKey.watchBenchmarks).toEqual({ schemaVersion: 1, byList: { L: 'wl:NYSE:SPY' } });
    expect(() => restoreWorkspace({ ...original, watchBenchmarks: { schemaVersion: 2, byList: {} } }, original)).toThrow();
    expect(() => restoreWorkspace({ ...original, watchBenchmarks: { schemaVersion: 1, byList: { L: 5 } } }, original)).toThrow();
  });
});
