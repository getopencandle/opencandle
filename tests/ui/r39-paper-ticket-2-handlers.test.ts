import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closePaperPosition, createPaperAccount, processPaperQuote, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';
import { PaperTradingDock, type PaperTradingDockProps } from '../../src/ui/PaperTradingDock';
import { PaperOrderTicket, type PaperOrderTicketProps } from '../../src/ui/PaperOrderTicket';
import { PaperPanel, type PaperPanelProps } from '../../src/ui/PaperPanel';

// Actual handler calls with controlled hooks (the paper-ticket-handlers harness). No DOM, native dialog or
// executable is exercised. Synthetic instruments and quotes, virtual money only.
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0 }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  return { ...actual, useState: (initial: any) => { const cells = hooks.cells, i = hooks.cursor++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], (next: any) => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; }, useRef: (initial: any) => { const cells = hooks.cells, i = hooks.cursor++; if (!(i in cells)) cells[i] = { current: initial }; return cells[i]; }, useEffect: () => {}, useMemo: (make: () => unknown) => make() };
});
const stock = (symbol: string): Instrument => ({ id: `SYNTHETIC:${symbol}`, symbol, name: `Synthetic ${symbol}`, exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 });
const AAA = stock('AAA'), BBB = stock('BBB');
const quoteOf = (instrument: Instrument, price: number, sequence: number, time: number): Quote => ({ instrumentId: instrument.id, bid: price, ask: price, eventTime: time, receivedAt: time, availableAt: time, sequence, fixture: true, session: 'regular' });
function text(node: any): string { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function find(node: any, predicate: (node: any) => boolean): any { if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } } else if (node?.props) { if (predicate(node)) return node; return find(node.props.children, predicate); } return null; }
function drivers(render: () => any) {
  const node = (predicate: (node: any) => boolean) => { const result = find(render(), predicate); if (!result) throw new Error('Expected handler missing'); return result; };
  const has = (predicate: (node: any) => boolean) => !!find(render(), predicate);
  return { render, has, text: () => text(render()), node, change: (label: string, value: string) => node(n => n.props['aria-label'] === label).props.onChange({ target: { value, checked: false } }), click: (name: string) => node(n => n.type === 'button' && text(n) === name).props.onClick(), submit: () => node(n => n.type === 'form').props.onSubmit({ preventDefault: vi.fn(), stopPropagation: vi.fn() }) };
}
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; vi.stubGlobal('document', { activeElement: null }); });
afterEach(() => vi.unstubAllGlobals());

const T = 2000;
function twoPositions(): PaperAccount {
  let account = createPaperAccount({ initialBalance: 100000, now: T });
  account = processPaperQuote(account, quoteOf(AAA, 10, 1, T), T, account.runId, AAA).account;
  account = processPaperQuote(account, quoteOf(BBB, 20, 2, T), T, account.runId, BBB).account;
  account = submitPaperOrder(account, { instrument: AAA, side: 'buy', type: 'market', quantity: 10 }, T).account;
  account = submitPaperOrder(account, { instrument: BBB, side: 'sell', type: 'market', quantity: 5 }, T).account;
  return account;
}
function dock(overrides: Partial<PaperTradingDockProps> = {}) {
  const props: PaperTradingDockProps = { account: twoPositions(), instrument: AAA, now: T, open: true, onToggle: () => {}, onAccountChange: vi.fn(() => true), onOpenTicket: () => {}, initialTab: 'positions', ...overrides }, cells: any[] = [];
  const ui = drivers(() => { hooks.cells = cells; hooks.cursor = 0; return PaperTradingDock(props); });
  return { ...ui, props };
}

describe('Trading panel: Close all positions with an in-app confirmation', () => {
  it('asks first in an in-app dialog, then closes every position in one account change', () => {
    const confirmSpy = vi.fn(() => true); vi.stubGlobal('confirm', confirmSpy); vi.stubGlobal('window', { confirm: confirmSpy });
    const ui = dock();
    expect(Object.keys(ui.props.account.positions)).toHaveLength(2);
    ui.click('Close all positions');
    const dialog = ui.node(n => n.props.role === 'alertdialog');
    expect(dialog.props['aria-modal']).toBe('true');
    expect(text(dialog)).toContain('Close 2 virtual positions?');
    expect(text(dialog)).toContain('AAA long 10');
    expect(text(dialog)).toContain('BBB short 5');
    expect(ui.props.onAccountChange).not.toHaveBeenCalled();
    ui.click('Close all');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(ui.props.onAccountChange).toHaveBeenCalledTimes(1);
    const [next, expected] = vi.mocked(ui.props.onAccountChange).mock.calls[0];
    expect(expected).toBe(ui.props.account);
    expect(next.positions).toEqual({});
    expect(next.orders.filter(order => order.reduceOnly && order.status === 'filled')).toHaveLength(2);
    expect(ui.has(n => n.props.role === 'alertdialog')).toBe(false);
    expect(ui.text()).toContain('2 virtual positions closed.');
  });
  it('Cancel and Escape close the dialog and change nothing', () => {
    const ui = dock();
    ui.click('Close all positions'); ui.click('Cancel');
    expect(ui.has(n => n.props.role === 'alertdialog')).toBe(false);
    ui.click('Close all positions');
    ui.node(n => n.props.role === 'alertdialog').props.onKeyDown({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn(), nativeEvent: { isComposing: false } });
    expect(ui.has(n => n.props.role === 'alertdialog')).toBe(false);
    expect(ui.props.onAccountChange).not.toHaveBeenCalled();
  });
  it('refuses when the positions changed after the dialog opened', () => {
    const ui = dock();
    ui.click('Close all positions');
    ui.props.account = closePaperPosition(ui.props.account, AAA.id, T).account;
    ui.click('Close all');
    expect(ui.props.onAccountChange).not.toHaveBeenCalled();
    expect(ui.text()).toContain('The open virtual positions changed after the confirmation opened. Review them again.');
  });
  it('keeps the per-row Close, and hides Close all when nothing is open', () => {
    const ui = dock();
    ui.node(n => n.props['aria-label'] === 'Close AAA position').props.onClick();
    expect(Object.keys(vi.mocked(ui.props.onAccountChange).mock.calls[0][0].positions)).toEqual([BBB.id]);
    const empty = dock({ account: createPaperAccount({ now: T }) });
    expect(empty.has(n => n.type === 'button' && text(n) === 'Close all positions')).toBe(false);
  });
});

describe('Buy/Sell ticket: GTD date and time picker on the chart timezone', () => {
  const NY = 'America/New_York';
  function ticket(overrides: Partial<PaperOrderTicketProps> = {}) {
    let account = createPaperAccount({ initialBalance: 100000, now: T });
    const quote = quoteOf(AAA, 10, 1, T);
    account = processPaperQuote(account, quote, T, account.runId, AAA).account;
    const props: PaperOrderTicketProps = { account, instrument: AAA, quote, quoteSource: { key: 'synthetic r39 ticket', state: 'ready' }, now: T, side: 'buy', onAccountChange: vi.fn(() => true), onDone: vi.fn(), timezone: NY, timeHours: '24', ...overrides }, cells: any[] = [];
    const ui = drivers(() => { hooks.cells = cells; hooks.cursor = 0; return PaperOrderTicket(props); });
    return { ...ui, props };
  }
  it('shows a datetime picker labelled with the chart timezone and places a GTD order at that wall time', () => {
    const ui = ticket();
    ui.node(n => n.type === 'button' && text(n) === 'Limit').props.onClick();
    ui.change('Limit price', '9.5');
    ui.change('Duration', 'gtd');
    const picker = ui.node(n => n.props['aria-label'] === 'Expiry date and time');
    expect(picker.props.type).toBe('datetime-local');
    expect(ui.text()).toContain('Good till (New York)');
    ui.change('Expiry date and time', '2026-10-24T16:00');
    expect(ui.text()).toContain('Expires 2026-10-24 16:00 UTC-4.');
    ui.submit();
    const [next] = vi.mocked(ui.props.onAccountChange).mock.calls[0];
    expect(next.orders.at(-1)).toMatchObject({ type: 'limit', timeInForce: 'GTD', expiresAt: Date.UTC(2026, 9, 24, 20, 0) / 1000 });
  });
  it('places GTC with no expiry and a stop limit with both prices', () => {
    const ui = ticket();
    ui.node(n => n.type === 'button' && text(n) === 'Stop limit').props.onClick();
    ui.change('Stop price', '11');
    ui.change('Limit price', '11.5');
    ui.change('Duration', 'gtc');
    expect(ui.has(n => n.props['aria-label'] === 'Expiry date and time')).toBe(false);
    expect(ui.text()).toContain('Buy 1 stop limit');
    ui.submit();
    const [next] = vi.mocked(ui.props.onAccountChange).mock.calls[0];
    expect(next.orders.at(-1)).toMatchObject({ type: 'stop-limit', stopPrice: 11, limitPrice: 11.5, timeInForce: 'GTC' });
    expect(next.orders.at(-1)!.expiresAt).toBeUndefined();
  });
  it('switches take profit and stop loss between price, ticks, percent and money', () => {
    const ui = ticket();
    ui.change('Take profit as', 'ticks'); ui.change('Take profit ticks', '50');
    ui.change('Stop loss as', 'money'); ui.change('Stop loss money', '0.25');
    expect(ui.text()).toContain('Take profit at 10.50. Stop loss at 9.75.');
    ui.change('Take profit as', 'percent'); ui.change('Take profit percent', '10');
    expect(ui.text()).toContain('Take profit at 11.00.');
  });
});

describe('Paper trading dialog: Positions P&L %, Close all, and current limitation text', () => {
  const panelQuote = quoteOf(AAA, 10, 1, 1000);
  function panel(overrides: Partial<PaperPanelProps> = {}) {
    let account = processPaperQuote(createPaperAccount({ initialBalance: 1000, now: 1000 }), panelQuote, 1000, 'ordinary', AAA).account;
    account = submitPaperOrder(account, { instrument: AAA, side: 'buy', type: 'market', quantity: 10 }, 1000).account;
    const up = quoteOf(AAA, 11, 2, 1001);
    account = processPaperQuote(account, up, 1001, account.runId, AAA).account;
    const props: PaperPanelProps = { account, instrument: AAA, quote: up, quoteSource: { key: 'synthetic r39 panel', state: 'ready' }, now: 1001, onAccountChange: vi.fn(() => true), ...overrides }, cells: any[] = [];
    const ui = drivers(() => { hooks.cells = cells; hooks.cursor = 0; return PaperPanel(props); });
    return { ...ui, props };
  }
  it('Positions shows Unrealized P&L with its percent', () => {
    const ui = panel(); ui.click('Positions');
    expect(ui.text()).toContain('P&L %');
    expect(ui.text()).toContain('+10.00%');
  });
  it('Close all positions goes through the in-app confirmation', () => {
    const ui = panel(); ui.click('Positions'); ui.click('Close all positions');
    const dialog = ui.node(n => n.props.role === 'alertdialog');
    expect(text(dialog)).toContain('Close 1 virtual position?');
    expect(ui.props.onAccountChange).not.toHaveBeenCalled();
    ui.click('Confirm');
    expect(vi.mocked(ui.props.onAccountChange).mock.calls[0][0].positions).toEqual({});
  });
  it('no longer says dragging order lines on the chart is unimplemented', () => {
    const ui = panel(); ui.click('Account');
    expect(ui.text()).not.toContain('dragging order lines on the chart');
    expect(ui.text()).toContain('Working orders and their exits move by dragging their lines on the chart.');
  });
});
