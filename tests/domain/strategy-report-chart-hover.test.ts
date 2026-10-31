import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReportChart } from '../../src/strategy-report/ReportChart';
import type { ReportInspection, ReportPlotResponse, StrategyReportHandle } from '../../src/strategy-report/types';

// Pointer movement over the curve selects a supplied row; the inspection
// shows trade number/direction, cumulative closed PnL, excursions and the buy-and-hold value only when that layer is on.
// Actual component closures with controlled hooks (same harness as strategy-report-chart-handlers). No DOM or GUI.
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
function find(node: any, test: (node: any) => boolean): any { if (Array.isArray(node)) { for (const child of node) { const value = find(child, test); if (value) return value; } } else if (node?.props) return test(node) ? node : find(node.props.children, test); return null; }
const value = (metric: number) => ({ value: metric, status: 'available', unit: 'currency', basis: 'synthetic', reason: null });
const plot: ReportPlotResponse = { count: 5, min: 990, max: 1040, values: [0, 1, 2, 3, 4].map(index => ({ index, value: 1000 + index * 10, breakBefore: index === 0 })), benchmark: [], excursions: [] };
const inspection = (barIndex: number): ReportInspection => ({
  point: { barIndex, barId: 'synthetic-hover:' + barIndex, time: 1000 + barIndex * 60, equity: 1000 + barIndex * 10, closedNet: barIndex >= 3 ? 25 : 0, drawdown: 0, drawdownPercent: 0, buyHoldEquity: 1012.5 },
  trade: barIndex >= 3 ? { id: 'trade:2', number: 2, direction: 'short', quantity: 1, entryOrderId: 'enter-short', exitOrderId: 'cover', netProfit: 15, cumulativeNet: 25, favorable: value(18), adverse: value(4) } as unknown as ReportInspection['trade'] : null,
});
function setup() {
  const handle = { summary: { counts: { bars: 5 }, context: { timezone: 'UTC' } }, plot: vi.fn(async () => plot), inspect: vi.fn(async (index: number) => inspection(index)) } as unknown as StrategyReportHandle;
  const props = { handle, assertOwner: () => {} }, render = () => { hooks.cursor = 0; return ReportChart(props); };
  const flush = () => { for (const effect of hooks.effects.splice(0)) effect(); }, settle = async () => { for (let round = 0; round < 4; round++) { render(); flush(); for (let i = 0; i < 10; i++) await Promise.resolve(); } };
  return { handle, render, settle };
}
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.effects = []; });
afterEach(() => { for (const cell of hooks.cells) if (cell && typeof cell.cleanup === 'function') cell.cleanup(); });

it('maps pointer position to the row and shows trade identity, cumulative PnL and excursions at that point', async () => {
  const ui = setup(); await ui.settle();
  // x = 12 + row / 4 * 936 in a 960-wide viewBox; clientX 726 on a 960 px box selects row 3.
  find(ui.render(), node => node.type === 'svg').props.onMouseMove({ clientX: 726, currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 960 }) } }); await ui.settle();
  expect(ui.handle.inspect).toHaveBeenLastCalledWith(3);
  const shown = text(ui.render());
  expect(shown).toContain('synthetic-hover:3'); expect(shown).toContain('Cumulative closed net 25');
  expect(shown).toContain('Latest completed allocation #2, short: enter-short to cover; net 15; cumulative closed net 25; favorable 18; adverse 4.');
  expect(shown).not.toContain('Buy-and-hold equity');
});
it('adds the buy-and-hold value only after its layer is enabled', async () => {
  const ui = setup(); await ui.settle();
  const toggle = find(ui.render(), node => node.type === 'label' && text(node).includes('Buy-and-hold')).props.children[0]; toggle.props.onChange({ target: { checked: true } }); await ui.settle();
  expect(text(ui.render())).toContain('Buy-and-hold equity ' + (1012.5).toLocaleString(undefined, { maximumFractionDigits: 6 }));
});
