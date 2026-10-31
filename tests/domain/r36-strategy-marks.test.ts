// Strategy trades on the chart (model, settings store, the engine run behind them), the Strategies tab
// built-in rows and the List of trades row that scrolls the chart. SYNTHETIC bars and proposals only. Component handlers
// with controlled hooks (the strategy-dialog-handlers harness); no DOM, native focus or packaged window is exercised.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrategyDialog, type StrategyDialogProps, type StrategyExecution } from '../../src/ui/StrategyDialog';
import { DEFAULT_STRATEGY_CONFIG, backtestStrategy, type StrategyConfig } from '../../src/domain/strategy';
import { scriptOrdersToSignals } from '../../src/domain/strategy-script-orders';
import { createStrategyMarkStore, DEFAULT_STRATEGY_MARK_SETTINGS, restoreStrategyMarkSettings, strategyMarkPlacement, strategyMarkQuantity, strategyTradeJumpTime, strategyTradeMarks, STRATEGY_MARK_STORAGE_KEY } from '../../src/chart/strategy-marks';
import { strategyChartResult } from '../../src/chart/strategy-marks-view';
import { selectorView } from '../../src/domain/indicator-selector-catalog';
import { BUILTIN_STRATEGY_SELECTOR_ROWS } from '../../src/domain/builtin-strategies/catalog';
import { ReportLoopbackPort } from './strategy-report-test-port';

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
const text = (node: any): string => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
const find = (node: any, predicate: (value: any) => boolean): any => { if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } } else if (node?.props) { if (predicate(node)) return node; return find(node.props.children, predicate); } return null; };

// SYNTHETIC: closes 100, 102, ... with each bar spanning 1 below and 1 above its open and close.
const bars = Array.from({ length: 8 }, (_, index) => ({ time: 1_700_000_000 + index * 86400, open: 100 + 2 * index, high: 102 + 2 * index, low: 99 + 2 * index, close: 101 + 2 * index, volume: 1 }));
const barIds = bars.map((_, index) => 'synthetic-r36-marks:' + index);
const event = (index: number) => ({ id: barIds[index], revision: 1, time: bars[index].time });
const proposals = [
  { sequence: 1, side: 'buy', quantity: 1, event: event(0), virtual: true, options: { id: 'Long', entry: true } },
  { sequence: 2, side: 'sell', quantity: 1, event: event(3), virtual: true, options: { id: 'Short', entry: true } },
  { sequence: 3, side: 'buy', quantity: 1, event: event(5), virtual: true, options: { id: 'Close', close: true } },
];
function execution(id = 'synthetic-r36-marks', orders: Record<string, unknown>[] = proposals): StrategyExecution {
  return { bars, barIds, identity: id, source: 'Explicit synthetic provider; no real security prices', currency: null, timezone: 'UTC', chartType: 'standard', result: { plots: [], alerts: [], state: null, diagnostics: [], elapsedMs: 0, provisional: false, provenance: { kind: 'synthetic', label: 'Synthetic R36 marks test' }, orders } } as unknown as StrategyExecution;
}
const engine = () => backtestStrategy({ bars, barIds, signals: scriptOrdersToSignals(proposals, bars, barIds), config: DEFAULT_STRATEGY_CONFIG });

describe(' strategy trade marks', () => {
  it('places an arrow per fill with the order name and signed quantity, a buy at its bar low and a sell at its bar high', () => {
    const { marks, lines } = strategyTradeMarks(engine(), bars, DEFAULT_STRATEGY_MARK_SETTINGS);
    expect(marks.map(mark => [mark.barIndex, mark.side, mark.label, mark.anchor, mark.price])).toEqual([[1, 'buy', 'Long +1', 101, 102], [4, 'sell', 'Short -2', 110, 108], [6, 'buy', 'Close +1', 111, 112]]);
    expect(marks[1].title).toBe('Short sell 2 at 108');
    expect(lines).toEqual([]);
  });
  it('follows the settings: names only, quantities only, nothing, and trade lines coloured by result', () => {
    const result = engine();
    expect(strategyTradeMarks(result, bars, { ...DEFAULT_STRATEGY_MARK_SETTINGS, quantity: false }).marks.map(mark => mark.label)).toEqual(['Long', 'Short', 'Close']);
    expect(strategyTradeMarks(result, bars, { ...DEFAULT_STRATEGY_MARK_SETTINGS, labels: false }).marks.map(mark => mark.label)).toEqual(['+1', '-2', '+1']);
    expect(strategyTradeMarks(result, bars, { ...DEFAULT_STRATEGY_MARK_SETTINGS, labels: false, quantity: false }).marks.every(mark => mark.label === '')).toBe(true);
    expect(strategyTradeMarks(result, bars, { ...DEFAULT_STRATEGY_MARK_SETTINGS, trades: false })).toEqual({ marks: [], lines: [] });
    const { lines } = strategyTradeMarks(result, bars, { ...DEFAULT_STRATEGY_MARK_SETTINGS, lines: true });
    expect(lines.map(line => [line.direction, line.entryBar, line.exitBar, line.fromPrice, line.toPrice, line.profit])).toEqual([['long', 1, 4, 102, 108, true], ['short', 4, 6, 108, 112, false]]);
    expect(strategyTradeMarks(null, bars, DEFAULT_STRATEGY_MARK_SETTINGS)).toEqual({ marks: [], lines: [] });
  });
  it('stacks fills of one side on one bar away from the bar, and places arrows below buys and above sells', () => {
    const result = { orders: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] as any, trades: [], fills: [{ orderId: 'a', side: 'buy', quantity: 1, price: 101, barIndex: 2 }, { orderId: 'b', side: 'buy', quantity: 1, price: 102, barIndex: 2 }] as any };
    expect(strategyTradeMarks(result, bars, DEFAULT_STRATEGY_MARK_SETTINGS).marks.map(mark => mark.stack)).toEqual([0, 1]);
    expect(strategyMarkPlacement('buy', 10, 100, 0)).toMatchObject({ tipY: 104, baseY: 114, direction: 'up' });
    expect(strategyMarkPlacement('sell', 10, 100, 1)).toMatchObject({ tipY: 78, baseY: 68, direction: 'down' });
    expect(strategyMarkQuantity('sell', 0.5)).toBe('-0.5');
  });
  it('the chart runs the same engine job as the report: same fills, and none while there are no proposals', () => {
    const chart = strategyChartResult(execution(), DEFAULT_STRATEGY_CONFIG)!;
    expect(chart.result.fills).toEqual(engine().fills); expect(chart.bars).toBe(bars);
    expect(strategyChartResult(execution('none', []), DEFAULT_STRATEGY_CONFIG)).toBeNull();
    expect(strategyChartResult(null, DEFAULT_STRATEGY_CONFIG)).toBeNull();
    expect(strategyChartResult(execution('bad', [{ sequence: 1, side: 'buy', quantity: 1, event: { id: 'elsewhere', revision: 1, time: 1 }, virtual: true }]), DEFAULT_STRATEGY_CONFIG)).toBeNull();
    expect(strategyChartResult(execution(), { ...DEFAULT_STRATEGY_CONFIG, slippageTicks: 100 })!.result.fills[0].price).toBe(103);
  });
  it('keeps the settings per viewer in storage, restores bad records to the defaults and notifies on select', () => {
    const saved = new Map<string, string>(), storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
    const store = createStrategyMarkStore(() => storage), seen = vi.fn(); store.subscribe(seen);
    expect(store.settings()).toEqual(DEFAULT_STRATEGY_MARK_SETTINGS);
    store.setSettings({ lines: true }); expect(JSON.parse(saved.get(STRATEGY_MARK_STORAGE_KEY)!)).toMatchObject({ lines: true, trades: true });
    expect(createStrategyMarkStore(() => storage).settings().lines).toBe(true);
    store.select({ entryBar: 1, exitBar: 4, entryTime: bars[1].time }); expect(store.selected()).toEqual({ entryBar: 1, exitBar: 4, entryTime: bars[1].time }); expect(seen).toHaveBeenCalledTimes(2);
    expect(restoreStrategyMarkSettings({ trades: 'yes', lines: true })).toEqual({ ...DEFAULT_STRATEGY_MARK_SETTINGS, lines: true });
    expect(createStrategyMarkStore(() => { throw new Error('blocked'); }).settings()).toEqual(DEFAULT_STRATEGY_MARK_SETTINGS);
    expect(strategyTradeJumpTime({ entry: { time: 42 } })).toBe(42);
  });
});

describe(' Strategies tab', () => {
  const source = { indicators: [], scripts: [{ id: 's1', name: 'Synthetic cross', kind: 'strategy' as const }, { id: 's2', name: 'Synthetic plot', kind: 'indicator' as const }], strategies: BUILTIN_STRATEGY_SELECTOR_ROWS };
  it('lists the built-ins first in the reference order, then saved CandleScript strategies, and searches them', () => {
    const view = selectorView(source, { item: 'built-ins', tab: 'strategies', query: '' });
    expect(view.entries).toHaveLength(24); expect(view.empty).toBeNull();
    expect(view.entries[0]).toEqual({ id: 'builtin-strategy:bar-up-down', label: 'Bar up/down strategy', kind: 'strategy' });
    expect(view.entries.at(-1)).toEqual({ id: 's1', label: 'Synthetic cross', kind: 'script' });
    expect(selectorView(source, { item: 'built-ins', tab: 'strategies', query: 'rsi' }).entries.map(row => row.label)).toEqual(['RSI strategy']);
    expect(selectorView(source, { item: 'built-ins', tab: 'strategies', query: 'zzz' }).empty).toEqual({ kind: 'no-match' });
    expect(selectorView({ ...source, strategies: undefined }, { item: 'built-ins', tab: 'strategies', query: '' }).entries).toEqual([{ id: 's1', label: 'Synthetic cross', kind: 'script' }]);
  });
});

describe(' List of trades row scrolls the chart', () => {
  function setup(onTradeSelect?: StrategyDialogProps['onTradeSelect']) {
    const props: StrategyDialogProps = { execution: execution(), config: { ...DEFAULT_STRATEGY_CONFIG, commission: { kind: 'fixed', value: 0 }, initialCapital: 1000 }, onChange: vi.fn((_config: StrategyConfig) => true), onClose: vi.fn(), ...(onTradeSelect ? { onTradeSelect } : {}) };
    const render = () => { hooks.cursor = 0; return StrategyDialog(props); };
    const flush = () => { for (const effect of hooks.effects.splice(0)) effect(); };
    const click = (label: string) => { const value = find(render(), node => node.type === 'button' && text(node) === label); if (!value) throw Error('Missing button ' + label); value.props.onClick(); };
    const ready = async () => { render(); flush(); for (let i = 0; i < 80; i++) { await new Promise(resolve => setTimeout(resolve, 5)); const tree = render(); flush(); if (!find(tree, node => node.type === 'button' && text(node) === 'Export metrics CSV')?.props.disabled) return; } throw Error('Report did not become ready'); };
    const row = async (number: number) => { for (let i = 0; i < 80; i++) { const found = find(render(), node => node.type === 'tr' && node.props['data-trade-row'] === number); if (found) return found; flush(); await new Promise(resolve => setTimeout(resolve, 5)); } return find(render(), node => node.type === 'tr' && node.key === 'missing'); };
    return { render, flush, click, ready, row };
  }
  beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.effects = []; vi.stubGlobal('window', { lv: { exportData: vi.fn() } }); vi.stubGlobal('Worker', ReportLoopbackPort); });
  afterEach(() => { for (const cell of hooks.cells) if (cell && typeof cell === 'object' && typeof cell.cleanup === 'function') cell.cleanup(); vi.unstubAllGlobals(); });
  it('a click or Enter on a trade row hands the trade to the host, which scrolls to its entry bar', async () => {
    const selected = vi.fn(), ui = setup(selected); await ui.ready(); ui.click('Trades'); ui.render(); ui.flush();
    const second = await ui.row(2); expect(second, 'trade row 2').toBeTruthy();
    expect(second.props).toMatchObject({ tabIndex: 0, title: 'Show this trade on the chart' });
    second.props.onClick();
    expect(selected).toHaveBeenCalledOnce();
    const trade = selected.mock.calls[0][0];
    expect([trade.direction, trade.entry.barIndex, trade.exit.barIndex, trade.entrySignal]).toEqual(['short', 4, 6, 'Short']);
    expect(strategyTradeJumpTime(trade)).toBe(bars[4].time);
    const prevent = vi.fn(); (await ui.row(1)).props.onKeyDown({ key: 'Enter', preventDefault: prevent }); expect(prevent).toHaveBeenCalled(); expect(selected).toHaveBeenCalledTimes(2);
    expect(selected.mock.calls[1][0].entry.barIndex).toBe(1);
  });
  it('without a host route the rows stay plain', async () => {
    const ui = setup(); await ui.ready(); ui.click('Trades'); ui.render(); ui.flush(); await new Promise(resolve => setTimeout(resolve, 30)); ui.flush();
    const tree = ui.render(), anyRow = find(tree, node => node.type === 'tr' && node.key !== null && typeof node.key === 'string' && node.props.onClick);
    expect(anyRow).toBeNull();
  });
});
