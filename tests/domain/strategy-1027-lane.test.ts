import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DRAWDOWN_BAND, REPORT_CHART_COLORS, ReportChart, drawdownLayerPath, drawdownLayerQuery } from '../../src/strategy-report/ReportChart';
import { createStrategyReportClient, OWN_KEY_SCAN_ROWS } from '../../src/strategy-report/client';
import { DEFAULT_STRATEGY_CONFIG } from '../../src/domain/strategy';
import type { ReportInspection, ReportPlotQuery, ReportPlotResponse, StrategyReportHandle, StrategyReportJobInput, StrategyReportOwner } from '../../src/strategy-report/types';
import { ReportLoopbackPort } from './strategy-report-test-port';

// Report chart drawdown layer + theme-token colors and the large-array upload check.
// Component closures with controlled hooks, as strategy-report-chart-handlers. No DOM or GUI.
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, effects: [] as (() => void)[] }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  const same = (a: any[] | undefined, b: any[] | undefined) => Boolean(a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])));
  return { ...actual,
    useState(initial: any) { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = typeof initial === 'function' ? initial() : initial; return [hooks.cells[i], (next: any) => { hooks.cells[i] = typeof next === 'function' ? next(hooks.cells[i]) : next; }]; },
    useRef(initial: any) { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = { current: initial }; return hooks.cells[i]; },
    useEffect(effect: any, deps: any[]) { const i = hooks.cursor++, old = hooks.cells[i]; if (!old || !same(old.deps, deps)) { const cell = { deps, cleanup: old?.cleanup }; hooks.cells[i] = cell; hooks.effects.push(() => { cell.cleanup?.(); cell.cleanup = effect(); }); } },
  };
});
function text(node: any): string { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function findAll(node: any, test: (node: any) => boolean, out: any[] = []): any[] { if (Array.isArray(node)) for (const child of node) findAll(child, test, out); else if (node?.props) { if (test(node)) out.push(node); findAll(node.props.children, test, out); } return out; }
const equityPlot: ReportPlotResponse = { count: 3, min: 990, max: 1010, values: [0, 1, 2].map(index => ({ index, value: [1000, 990, 1010][index], breakBefore: index === 0 })), benchmark: [], excursions: [] };
const drawdownPlot: ReportPlotResponse = { count: 3, min: -10, max: 0, values: [0, 1, 2].map(index => ({ index, value: [0, -10, 0][index], breakBefore: index === 0 })), benchmark: [], excursions: [] };
const inspection = (barIndex: number): ReportInspection => ({ point: { barIndex, barId: 'synthetic-dd:' + barIndex, time: 1000 + barIndex * 60, equity: 1000, closedNet: 0, drawdown: barIndex === 1 ? 10 : 0, drawdownPercent: barIndex === 1 ? 1 : 0, buyHoldEquity: null } as ReportInspection['point'], trade: null });
function setupChart() {
  const handle = { summary: { counts: { bars: 3 }, context: { timezone: 'UTC' } }, plot: vi.fn(async (query: ReportPlotQuery) => query.series === 'drawdown' ? drawdownPlot : equityPlot), inspect: vi.fn(async (index: number) => inspection(index)) } as unknown as StrategyReportHandle;
  const props = { handle, assertOwner: () => {} }, render = () => { hooks.cursor = 0; return ReportChart(props); };
  const flush = () => { for (const effect of hooks.effects.splice(0)) effect(); }, settle = async () => { for (let round = 0; round < 4; round++) { render(); flush(); for (let i = 0; i < 10; i++) await Promise.resolve(); } };
  return { handle, render, settle };
}
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.effects = []; });
const cleanups: (() => void)[] = [];
afterEach(() => { for (const cell of hooks.cells) if (cell && typeof cell.cleanup === 'function') cell.cleanup(); for (const cleanup of cleanups.splice(0)) cleanup(); });

it('scales the drawdown layer from the top edge, deepest drawdown at full band depth, and draws nothing without a drawdown', () => {
  expect(drawdownLayerQuery(true)).toEqual({ series: 'drawdown', percent: true, benchmark: false, favorable: false, adverse: false });
  const x = (row: number) => row * 10;
  expect(drawdownLayerPath(drawdownPlot.values, drawdownPlot.min, x)).toBe(`M0,16V16 M10,16V${16 + DRAWDOWN_BAND} M20,16V16`);
  expect(drawdownLayerPath([{ index: 0, value: -5, breakBefore: true }], -10, x)).toBe(`M0,16V${16 + DRAWDOWN_BAND / 2}`);
  expect(drawdownLayerPath(equityPlot.values, 0, x)).toBe('');
});

it('the drawdown layer is off by default, requests its own drawdown plot when enabled, and draws it over the equity curve', async () => {
  const ui = setupChart(); await ui.settle();
  expect(ui.handle.plot).toHaveBeenCalledTimes(1); expect(findAll(ui.render(), node => node.props['data-layer'] === 'drawdown')).toHaveLength(0);
  const label = findAll(ui.render(), node => node.type === 'label' && text(node).includes('Drawdown layer'))[0];
  label.props.children[0].props.onChange({ target: { checked: true } }); await ui.settle();
  expect(ui.handle.plot).toHaveBeenLastCalledWith(drawdownLayerQuery(false));
  const layer = findAll(ui.render(), node => node.props['data-layer'] === 'drawdown');
  expect(layer).toHaveLength(1); expect(layer[0].props.d).toContain('V' + (16 + DRAWDOWN_BAND));
  expect(text(ui.render())).toContain('Drawdown to -10');
  // Selecting the drawdown curve itself masks the layer.
  findAll(ui.render(), node => node.type === 'select')[0].props.onChange({ target: { value: 'drawdown' } }); await ui.settle();
  expect(findAll(ui.render(), node => node.props['data-layer'] === 'drawdown')).toHaveLength(0);
});

it('paints every chart layer with OpenCandle theme tokens, never fixed colors', async () => {
  for (const color of Object.values(REPORT_CHART_COLORS)) expect(color).toMatch(/^var\(--lv-[a-z-]+, #[0-9a-f]{6}\)$/);
  const ui = setupChart(); await ui.settle();
  const painted = findAll(ui.render(), node => node.type === 'path' || node.type === 'text');
  expect(painted.length).toBeGreaterThan(3);
  for (const node of painted) { expect(node.props.stroke).toBeUndefined(); expect(node.props.fill === undefined || node.props.fill === 'none').toBe(true); }
});

function bigInput(rows: number): StrategyReportJobInput {
  const bars = Array.from({ length: rows }, (_, index) => ({ time: 1000 + index * 60, open: 100, high: 100, low: 100, close: 100, volume: 1 })), barIds = bars.map((_, index) => 'synthetic-large:' + index);
  return { execution: { bars, barIds, chartType: 'standard', context: { executionId: 'synthetic-large-upload', sourceLabel: 'Synthetic large upload', currency: null, timezone: 'UTC' }, proposals: [] }, config: { ...DEFAULT_STRATEGY_CONFIG, commission: { kind: 'fixed', value: 0 }, initialCapital: 1000 } };
}
function setupClient() {
  const abort = new AbortController(), owner: StrategyReportOwner = { signal: abort.signal, assertCurrent() {} };
  const client = createStrategyReportClient({ factory: () => new ReportLoopbackPort(), yieldControl: () => Promise.resolve() });
  cleanups.push(() => client.dispose()); return { client, owner };
}
it('uploads a large source array without the native key list, never reading a named extra property, and still rejects holes', async () => {
  const rows = OWN_KEY_SCAN_ROWS + 1, spy = vi.spyOn(Reflect, 'ownKeys');
  const data = bigInput(rows); let reads = 0;
  Object.defineProperty(data.execution.bars, 'extra', { enumerable: true, get() { reads++; return 1; } });
  const test = setupClient(), handle = await test.client.start(data, test.owner);
  expect(handle.summary.counts.bars).toBe(rows); expect(reads).toBe(0);
  expect(spy.mock.calls.some(([target]) => target === data.execution.bars || target === data.execution.barIds)).toBe(false);
  spy.mockRestore();
  const sparse = bigInput(rows); delete (sparse.execution.barIds as string[])[rows - 5];
  const next = setupClient(); await expect(next.client.start(sparse, next.owner)).rejects.toThrow(/contiguous|data values/);
}, 60000);
it('small arrays keep the full own-key check, which also refuses named extra properties', async () => {
  const data = bigInput(3); (data.execution.bars as unknown as Record<string, unknown>).extra = 1;
  const test = setupClient(); await expect(test.client.start(data, test.owner)).rejects.toThrow(/extra properties/);
});
