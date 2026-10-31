import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReportChart } from '../../src/strategy-report/ReportChart';
import type { ReportInspection, ReportPlotResponse, StrategyReportHandle } from '../../src/strategy-report/types';

// Actual component closures with controlled hooks. No rendered DOM, native
// input, SVG visual comparison or packaged-window proof is claimed.
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, effects: [] as (() => void)[], writes: 0 }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  const same = (a: any[] | undefined, b: any[] | undefined) => Boolean(a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])));
  return { ...actual,
    useState(initial: any) { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = typeof initial === 'function' ? initial() : initial; return [hooks.cells[i], (next: any) => { hooks.writes++; hooks.cells[i] = typeof next === 'function' ? next(hooks.cells[i]) : next; }]; },
    useRef(initial: any) { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = { current: initial }; return hooks.cells[i]; },
    useEffect(effect: any, deps: any[]) { const i = hooks.cursor++, old = hooks.cells[i]; if (!old || !same(old.deps, deps)) { const cell = { deps, cleanup: old?.cleanup }; hooks.cells[i] = cell; hooks.effects.push(() => { cell.cleanup?.(); cell.cleanup = effect(); }); } },
  };
});
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function text(node: any): string { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function find(node: any, test: (node: any) => boolean): any { if (Array.isArray(node)) { for (const child of node) { const value = find(child, test); if (value) return value; } } else if (node?.props) return test(node) ? node : find(node.props.children, test); return null; }
const plot = (value = 100): ReportPlotResponse => ({ count: 3, min: value, max: value, values: [{ index: 0, value, breakBefore: true }, { index: 2, value, breakBefore: false }], benchmark: [], excursions: [] });
const inspection = (barIndex: number, equity = 100): ReportInspection => ({ point: { barIndex, barId: 'fixture:' + barIndex, time: 1000 + barIndex * 60, equity, closedNet: 0, drawdown: 0, drawdownPercent: 0, buyHoldEquity: null } as ReportInspection['point'], trade: null });
function handle() { return { summary: { counts: { bars: 3 }, context: { timezone: 'UTC' } }, plot: vi.fn(async () => plot()), inspect: vi.fn(async (index: number) => inspection(index)) } as unknown as StrategyReportHandle; }
function setup() {
  const props = { handle: handle(), assertOwner: () => {} };
  const render = () => { hooks.cursor = 0; return ReportChart(props); };
  const flush = () => { for (const effect of hooks.effects.splice(0)) effect(); };
  const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  return { props, render, flush, tick };
}
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.effects = []; hooks.writes = 0; });
afterEach(() => { for (const cell of hooks.cells) if (cell && typeof cell.cleanup === 'function') cell.cleanup(); });

it('coalesces row changes while a plot is pending and inspects the latest exact row', async () => {
  const ui = setup(), pending = deferred<ReportPlotResponse>(); vi.mocked(ui.props.handle.plot).mockReturnValueOnce(pending.promise);
  ui.render(); ui.flush();
  find(ui.render(), node => node.props['aria-label'] === 'Inspect strategy report row').props.onChange({ target: { value: '1' } }); ui.render(); ui.flush();
  find(ui.render(), node => node.props['aria-label'] === 'Inspect strategy report row').props.onChange({ target: { value: '2' } }); ui.render(); ui.flush();
  pending.resolve(plot()); await ui.tick();
  expect(ui.props.handle.plot).toHaveBeenCalledOnce(); expect(ui.props.handle.inspect).toHaveBeenCalledOnce(); expect(ui.props.handle.inspect).toHaveBeenCalledWith(2);
  expect(text(ui.render())).toContain('fixture:2');
});

it('starts a new handle while an old query is pending and ignores the old completion', async () => {
  const ui = setup(), old = ui.props.handle, pending = deferred<ReportPlotResponse>(); vi.mocked(old.plot).mockReturnValueOnce(pending.promise);
  ui.render(); ui.flush(); ui.props.handle = handle(); ui.render(); ui.flush(); await ui.tick();
  expect(ui.props.handle.plot).toHaveBeenCalledOnce(); expect(ui.props.handle.inspect).toHaveBeenCalledWith(0);
  const writes = hooks.writes; pending.resolve(plot(999)); await ui.tick(); expect(old.inspect).not.toHaveBeenCalled(); expect(hooks.writes).toBe(writes);
  expect(text(ui.render())).toContain('Equity 100'); expect(text(ui.render())).not.toContain('999');
});

it('retained curve controls cannot borrow a replacement parent assertion', () => {
  const ui = setup(); let current = true; ui.props.assertOwner = () => { if (!current) throw Error('Original parent retired'); };
  const old = find(ui.render(), node => node.type === 'select').props.onChange;
  current = false; ui.props.assertOwner = () => {}; ui.render(); const writes = hooks.writes;
  old({ target: { value: 'closed' } }); expect(hooks.writes).toBe(writes);
});

it('does not write state after unmount when a pending inspection completes', async () => {
  const ui = setup(), pending = deferred<ReportInspection>(); vi.mocked(ui.props.handle.inspect).mockReturnValueOnce(pending.promise);
  ui.render(); ui.flush(); await ui.tick();
  for (const cell of hooks.cells) if (cell && typeof cell.cleanup === 'function') cell.cleanup(); const writes = hooks.writes;
  pending.resolve(inspection(0, 999)); await ui.tick(); expect(hooks.writes).toBe(writes);
});
