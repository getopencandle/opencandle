import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPaperAccount, processPaperQuote, type PaperAccount } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';
import { PaperDom } from '../../src/ui/PaperDom';
import { PaperDomPane, paperDomPaneTitle } from '../../src/ui/PaperDomPane';
import { PaperTradingDock } from '../../src/ui/PaperTradingDock';
import { PaperOrderTicket } from '../../src/ui/PaperOrderTicket';
import { FloatingPanel } from '../../src/ui/FloatingPanel';
import { closePaperDomPane, openPaperDomPane, paperDomPaneHosted, paperDomPaneState, resetPaperDomPaneForTests, subscribePaperDomPane, PAPER_DOM_PANE_NO_HOST } from '../../src/ui/paper-dom-pane';

// The paper DOM as its own pane. Route store, the trading panel as the pane host,
// the order ticket and panel entry points, and the ladder centring on a requested price. Handlers through controlled hooks (the
// paper-1027 harness); no DOM or executable is exercised here. Synthetic instrument and quotes, virtual money only.
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0 }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  return {
    ...actual,
    useState: (initial: any) => { const cells = hooks.cells, i = hooks.cursor++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], (next: any) => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; },
    useEffect: () => {}, useMemo: (make: () => any) => make(), useRef: (value: any) => ({ current: value }),
  };
});
const instrument: Instrument = { id: 'SYNTHETIC:DOMPANE', symbol: 'DPNX', name: 'Synthetic DOM pane', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.05, lotSize: 1 };
const quote = (bid: number, ask: number): Quote => ({ instrumentId: instrument.id, bid, ask, session: 'regular', fixture: true, eventTime: 100, receivedAt: 100, availableAt: 100, sequence: 1 });
const quoted = (account = createPaperAccount({ now: 100 })) => processPaperQuote(account, quote(100, 100.1), 100, account.runId, instrument).account;
function text(node: any): string { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function find(node: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } return null; }
  if (node?.props) { if (predicate(node)) return node; return find(node.props.children, predicate); }
  return null;
}
const priceRows = (tree: any): string[] => { const rows: string[] = []; const walk = (node: any) => { if (Array.isArray(node)) node.forEach(walk); else if (node?.props) { if (node.type === 'td' && node.props.className === 'price') rows.push(text(node).split(' ')[0]); walk(node.props.children); } }; walk(tree); return rows; };
const dock = (account: PaperAccount, extra: Record<string, unknown> = {}) => () => { hooks.cursor = 0; return PaperTradingDock({ account, instrument, now: 100, open: true, embedded: true, onToggle: () => {}, onAccountChange: () => true, onOpenTicket: () => {}, initialTab: 'dom', ...extra } as never) as any; };
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; resetPaperDomPaneForTests(); });
afterEach(() => { resetPaperDomPaneForTests(); vi.unstubAllGlobals(); });

describe('DOM pane route store', () => {
  it('refuses without a host, opens and closes with one, and carries the clicked price as a one-shot centre', () => {
    expect(openPaperDomPane('ticket')).toBe(false);
    expect(paperDomPaneState().open).toBe(false);
    const seen: boolean[] = [], stop = subscribePaperDomPane(state => seen.push(state.open));
    expect(paperDomPaneHosted()).toBe(true);
    expect(openPaperDomPane('panel')).toBe(true);
    expect(paperDomPaneState()).toEqual({ open: true, origin: 'panel', center: null });
    expect(openPaperDomPane('chart-menu', 101.37)).toBe(true);
    const first = paperDomPaneState().center!;
    expect(first.price).toBe(101.37);
    openPaperDomPane('ticket');// no price: keeps the requested centre of the open pane
    expect(paperDomPaneState().center).toEqual(first);
    openPaperDomPane('chart-menu', 99);
    expect(paperDomPaneState().center!.token).toBeGreaterThan(first.token);
    openPaperDomPane('chart-menu', Number.NaN);
    expect(paperDomPaneState().center!.price).toBe(99);
    closePaperDomPane();
    expect(paperDomPaneState()).toEqual({ open: false, origin: null, center: null });
    expect(seen).toEqual([true, true, true, true, true, false]);
    stop();
    expect(paperDomPaneHosted()).toBe(false);
  });
});

describe('PaperDom centre request (numeric)', () => {
  it('centres the ladder on the requested price snapped to the tick, once per token, and the wheel still scrolls from there', () => {
    const account = quoted();
    let request: { price: number; token: number } | null = null;
    const render = () => { hooks.cursor = 0; return PaperDom({ account, instrument, now: 100, rows: 5, onAccountChange: () => true, centerRequest: request }) as any; };
    expect(priceRows(render())).toEqual(['100.15', '100.10', '100.05', '100.00', '99.95']);// automatic: mid 100.05
    request = { price: 101.37, token: 1 };// 101.37 snaps to 101.35 on a 0.05 tick
    expect(priceRows(render())).toEqual(['101.45', '101.40', '101.35', '101.30', '101.25']);
    find(render(), n => n.props['aria-label'] === 'Price ladder').props.onWheel({ deltaY: -100 });// up 3 ticks
    expect(priceRows(render())).toEqual(['101.60', '101.55', '101.50', '101.45', '101.40']);
    find(render(), n => n.type === 'button' && text(n) === 'Recenter').props.onClick();
    expect(priceRows(render())).toEqual(['100.15', '100.10', '100.05', '100.00', '99.95']);// same token: not re-applied
    request = { price: 98, token: 2 };
    expect(priceRows(render())[2]).toBe('98.00');
    find(render(), n => n.props['aria-label'] === 'Price ladder').props.onWheel({ deltaY: 100 });// down 3 ticks from the request
    expect(priceRows(render())[2]).toBe('97.85');
    request = { price: -5, token: 3 };// not a price: ignored, the ladder stays where it is
    expect(priceRows(render())[2]).toBe('97.85');
  });
});

describe('Trading panel hosts the DOM pane', () => {
  it('the DOM pane button opens the pane with the same ladder, the tab then points to it, and the pane closes again', () => {
    const account = quoted(), render = dock(account);
    let tree = render();
    expect(find(tree, n => n.type === PaperDomPane)).toBeNull();
    expect(find(tree, n => n.type === PaperDom)).not.toBeNull();
    // The panel is the host; the mocked effect does not subscribe, so register the host the way its effect does.
    const cell = hooks.cells.indexOf(paperDomPaneState());
    expect(cell).toBeGreaterThanOrEqual(0);
    const stop = subscribePaperDomPane(state => { hooks.cells[cell] = state; });
    const toggle = find(tree, n => n.type === 'button' && text(n) === 'DOM pane');
    expect(toggle.props['aria-pressed']).toBe(false);
    toggle.props.onClick();
    tree = render();
    const pane = find(tree, n => n.type === PaperDomPane);
    expect(pane.props.account).toBe(account);expect(pane.props.instrument).toBe(instrument);expect(pane.props.onClose).toBe(closePaperDomPane);
    expect(find(tree, n => n.type === 'button' && text(n) === 'DOM pane').props['aria-pressed']).toBe(true);
    expect(text(tree)).toContain('The order ladder is open in its own pane.');
    expect(find(tree, n => n.type === PaperDom)).toBeNull();// one ladder at a time
    find(tree, n => n.type === 'button' && text(n) === 'Show it here').props.onClick();
    tree = render();
    expect(find(tree, n => n.type === PaperDomPane)).toBeNull();expect(find(tree, n => n.type === PaperDom)).not.toBeNull();
    stop();
  });
  it('a collapsed embedded panel still renders an open pane, and the closed shape is unchanged', () => {
    const account = quoted();
    expect(dock(account, { open: false })()).toBeNull();
    hooks.cells = [];
    const stop = subscribePaperDomPane(() => {});
    openPaperDomPane('chart-menu', 100.5);
    const tree = dock(account, { open: false })();
    const pane = find(tree, n => n.type === PaperDomPane);
    expect(pane.props.center).toEqual(paperDomPaneState().center);
    stop();
  });
  it('the pane wraps the ladder in a floating panel with a virtual-money label, and shows a trading refusal instead of the ladder', () => {
    const account = quoted();
    const tree = PaperDomPane({ account, instrument, now: 100, onAccountChange: () => true, onClose: () => {}, host: null, center: { price: 100, token: 4 } }) as any;
    expect(tree.type).toBe(FloatingPanel);expect(tree.props.title).toBe('DOM: DPNX');
    expect(text(tree)).toContain('Virtual money: ');
    expect(find(tree, n => n.type === PaperDom).props.centerRequest).toEqual({ price: 100, token: 4 });
    const refused = PaperDomPane({ account, instrument, now: 100, onAccountChange: () => true, onClose: () => {}, host: null, tradingRefusal: 'Trading is not available on a derived symbol.' }) as any;
    expect(find(refused, n => n.type === PaperDom)).toBeNull();expect(text(refused)).toContain('derived symbol');
    expect(paperDomPaneTitle(instrument, true)).toBe('Replay DOM: DPNX');
  });
});

describe('Order ticket entry point', () => {
  it('Open DOM pane routes to the host, or explains when no trading panel is mounted', () => {
    const account = quoted();
    const render = () => { hooks.cursor = 0; return PaperOrderTicket({ account, instrument, quote: account.quotes[instrument.id], quoteSource: { key: 'synthetic', state: 'ready' }, now: 100, side: 'buy', quantity: '1', onAccountChange: () => true, onDone: () => {} } as never) as any; };
    find(render(), n => n.type === 'button' && text(n) === 'Open DOM pane').props.onClick();
    expect(text(render())).toContain(PAPER_DOM_PANE_NO_HOST);
    const stop = subscribePaperDomPane(() => {});
    find(render(), n => n.type === 'button' && text(n) === 'Open DOM pane').props.onClick();
    expect(paperDomPaneState()).toMatchObject({ open: true, origin: 'ticket' });
    stop();
  });
  it('the submitted ladder order from the pane goes through the same account authority', () => {
    let account = quoted(account0());
    const changes: PaperAccount[] = [];
    const render = () => { hooks.cursor = 0; return PaperDom({ account, instrument, now: 100, rows: 5, onAccountChange: next => { changes.push(next); account = next; return true; }, centerRequest: { price: 99, token: 9 } }) as any; };
    find(render(), n => n.props['aria-label'] === 'Buy at 99.00').props.onClick({ ctrlKey: false, metaKey: false });
    expect(changes).toHaveLength(1);
    expect(changes[0].orders.find(order => order.status === 'working')).toMatchObject({ side: 'buy', type: 'limit', limitPrice: 99 });
  });
});
function account0() { const base = createPaperAccount({ now: 100 }); return { ...base, settings: { ...base.settings, oneClick: true } }; }
