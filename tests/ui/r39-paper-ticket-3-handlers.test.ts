import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelPaperOrder, createPaperAccount, processPaperQuote, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';
import { PaperOrderTicket, type PaperOrderTicketProps } from '../../src/ui/PaperOrderTicket';
import { PaperPanel, type PaperPanelProps } from '../../src/ui/PaperPanel';

// Actual handler calls with controlled hooks (the paper-ticket-handlers harness). No DOM, native dialog or
// executable is exercised. Synthetic instruments and quotes, virtual money only.
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0 }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  return { ...actual, useState: (initial: any) => { const cells = hooks.cells, i = hooks.cursor++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], (next: any) => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; }, useRef: (initial: any) => { const cells = hooks.cells, i = hooks.cursor++; if (!(i in cells)) cells[i] = { current: initial }; return cells[i]; }, useEffect: () => {}, useMemo: (make: () => unknown) => make() };
});
const AAA: Instrument = { id: 'SYNTHETIC:AAA', symbol: 'AAA', name: 'Synthetic AAA', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const quoteOf = (price: number, sequence: number, time: number): Quote => ({ instrumentId: AAA.id, bid: price, ask: price, eventTime: time, receivedAt: time, availableAt: time, sequence, fixture: true, session: 'regular' });
function text(node: any): string { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function find(node: any, predicate: (node: any) => boolean): any { if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } } else if (node?.props) { if (predicate(node)) return node; return find(node.props.children, predicate); } return null; }
function all(node: any, predicate: (node: any) => boolean, out: any[] = []): any[] { if (Array.isArray(node)) node.forEach(child => all(child, predicate, out)); else if (node?.props) { if (predicate(node)) out.push(node); all(node.props.children, predicate, out); } return out; }
function drivers(render: () => any) {
  const node = (predicate: (node: any) => boolean) => { const result = find(render(), predicate); if (!result) throw new Error('Expected handler missing'); return result; };
  const has = (predicate: (node: any) => boolean) => !!find(render(), predicate);
  return { render, has, text: () => text(render()), node, change: (label: string, value: string) => node(n => n.props['aria-label'] === label).props.onChange({ target: { value, checked: false } }), check: (label: string, checked: boolean) => node(n => n.props['aria-label'] === label).props.onChange({ target: { value: 'on', checked } }), click: (name: string) => node(n => n.type === 'button' && text(n) === name).props.onClick(), submit: () => node(n => n.type === 'form').props.onSubmit({ preventDefault: vi.fn(), stopPropagation: vi.fn() }) };
}
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; vi.stubGlobal('document', { activeElement: null }); });
afterEach(() => vi.unstubAllGlobals());

// 2026-10-23 13:30:00 UTC is 09:30:00 in New York (UTC-4).
const AT = Date.UTC(2026, 9, 23, 13, 30) / 1000, NY = 'America/New_York';
const funded = (now = AT): PaperAccount => { const account = createPaperAccount({ initialBalance: 100000, now }); return processPaperQuote(account, quoteOf(10, 1, now), now, account.runId, AAA).account; };

describe('Buy/Sell ticket: Take profit outside regular hours', () => {
  function ticket(overrides: Partial<PaperOrderTicketProps> = {}) {
    const props: PaperOrderTicketProps = { account: funded(), instrument: AAA, quote: quoteOf(10, 1, AT), quoteSource: { key: 'synthetic r39 pt3 ticket', state: 'ready' }, now: AT, side: 'buy', onAccountChange: vi.fn(() => true), onDone: vi.fn(), timezone: NY, timeHours: '24', ...overrides }, cells: any[] = [];
    const ui = drivers(() => { hooks.cells = cells; hooks.cursor = 0; return PaperOrderTicket(props); });
    return { ...ui, props };
  }
  const box = (ui: ReturnType<typeof ticket>) => ui.node(n => n.props['aria-label'] === 'Take profit outside regular hours');
  it('is disabled with its reason until a take profit is entered', () => {
    const ui = ticket();
    expect(box(ui).props.disabled).toBe(true);
    expect(box(ui).props.checked).toBe(false);
    expect(ui.text()).toContain('Take profit outside regular hours (needs a take profit)');
    ui.change('Take profit price', '10.5');
    expect(box(ui).props.disabled).toBe(false);
    expect(ui.text()).not.toContain('(needs a take profit)');
  });
  it('ticked with a take profit, the order is placed with take profit outside regular hours', () => {
    const ui = ticket();
    ui.change('Take profit price', '10.5'); ui.change('Stop loss price', '9.5');
    ui.check('Take profit outside regular hours', true);
    expect(box(ui).props.checked).toBe(true);
    ui.submit();
    const [next] = vi.mocked(ui.props.onAccountChange).mock.calls[0];
    const parent = next.orders.find(order => !order.bracket)!;
    expect(parent.sessionPolicy).toEqual({ schemaVersion: 2, entryOutsideRth: false, takeProfitOutsideRth: true });
  });
  it('clearing the take profit turns the box back off and places without it', () => {
    const ui = ticket();
    ui.change('Take profit price', '10.5'); ui.check('Take profit outside regular hours', true);
    ui.change('Take profit price', ''); ui.change('Stop loss price', '9.5');
    expect(box(ui).props.disabled).toBe(true);
    expect(box(ui).props.checked).toBe(false);
    ui.submit();
    const [next] = vi.mocked(ui.props.onAccountChange).mock.calls[0];
    expect(next.orders.find(order => !order.bracket)!.sessionPolicy).toEqual({ schemaVersion: 2, entryOutsideRth: false, takeProfitOutsideRth: false });
  });
});

function panel(overrides: Partial<PaperPanelProps> = {}) {
  const props: PaperPanelProps = { account: funded(), instrument: AAA, quote: quoteOf(10, 1, AT), quoteSource: { key: 'synthetic r39 pt3 panel', state: 'ready' }, now: AT, onAccountChange: vi.fn(() => true), ...overrides }, cells: any[] = [];
  const ui = drivers(() => { hooks.cells = cells; hooks.cursor = 0; return PaperPanel(props); });
  return { ...ui, props };
}

describe('Paper trading dialog ticket: GTC', () => {
  it('offers Good till cancelled (GTC) for a new ticket', () => {
    const ui = panel();
    const select = ui.node(n => n.props['aria-label'] === 'Time in force');
    const options = all(select, n => n.type === 'option').map(n => [n.props.value, text(n), !!n.props.disabled]);
    expect(options).toContainEqual(['GTC', 'Good till cancelled (GTC)', false]);
    expect(options.filter(row => row[0] === 'GTC')).toHaveLength(1);
  });
  it('places a GTC order with no expiry and a GTC ticket record, after the in-app confirmation', () => {
    const ui = panel();
    ui.change('Order type', 'limit'); ui.change('Limit price', '9.5');
    ui.change('Time in force', 'GTC');
    expect(ui.has(n => n.props['aria-label'] === 'Order expiration')).toBe(false);
    ui.submit();
    expect(ui.text()).toContain('GTC has no expiry: the order stays working until it fills or is cancelled.');
    ui.click('Confirm');
    const [next] = vi.mocked(ui.props.onAccountChange).mock.calls[0];
    const order = next.orders.at(-1)!;
    expect(order).toMatchObject({ type: 'limit', limitPrice: 9.5, timeInForce: 'GTC', status: 'working' });
    expect(order.expiresAt).toBeUndefined();
    expect(order.ticket?.input.validity).toEqual({ kind: 'gtc' });
  });
  it('editing a GTC order still retains it (the select stays locked)', () => {
    let account = funded();
    account = submitPaperOrder(account, { instrument: AAA, side: 'buy', type: 'limit', quantity: 3, limitPrice: 9, timeInForce: 'GTC' }, AT).account;
    const ui = panel({ account });
    ui.click('Modify');
    const select = ui.node(n => n.props['aria-label'] === 'Time in force');
    expect(select.props.value).toBe('GTC');
    expect(select.props.disabled).toBe(true);
  });
});

describe('Paper trading dialog: its times use the chart timezone', () => {
  function traded(): PaperAccount {
    let account = funded();
    account = submitPaperOrder(account, { instrument: AAA, side: 'buy', type: 'market', quantity: 2 }, AT).account;
    account = submitPaperOrder(account, { instrument: AAA, side: 'buy', type: 'limit', quantity: 1, limitPrice: 9, timeInForce: 'GTD', expiresAt: AT + 3600 }, AT).account;
    account = submitPaperOrder(account, { instrument: AAA, side: 'buy', type: 'limit', quantity: 1, limitPrice: 8, timeInForce: 'GTC' }, AT).account;
    return cancelPaperOrder(account, account.orders.at(-1)!.id, AT).account;
  }
  it('the simulation clock and ticket time read on the New York wall clock', () => {
    const ui = panel({ account: traded(), timezone: NY, timeHours: '24' });
    expect(ui.text()).toContain('Simulation clock (New York): 2026-10-23 09:30:00 UTC-4');
    expect(ui.text()).toContain('Current ticket time (New York): 2026-10-23 09:30:00 UTC-4');
  });
  it('the working-order expiry column names the zone and shows wall time', () => {
    const ui = panel({ account: traded(), timezone: NY, timeHours: '24' });
    const headers = all(ui.render(), n => n.type === 'th').map(text);
    expect(headers).toContain('Expiry (New York)');
    expect(ui.text()).toContain('2026-10-23 10:30:00');
  });
  it('history, fills, account history and journal times read on the chart wall clock in 12-hour form', () => {
    const ui = panel({ account: traded(), timezone: NY, timeHours: '12' });
    ui.click('History');
    const headers = all(ui.render(), n => n.type === 'th').map(text);
    expect(headers).toEqual(expect.arrayContaining(['Updated (New York)', 'Time (New York)', 'Opened (New York)', 'Closed (New York)']));
    const cells = all(ui.render(), n => n.type === 'td').map(text);
    expect(cells.filter(cell => cell === '2026-10-23 9:30:00 AM').length).toBeGreaterThanOrEqual(4);
    expect(cells.some(cell => /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(cell))).toBe(false);
  });
  it('without a timezone the dialog shows UTC', () => {
    const ui = panel({ account: traded() });
    expect(ui.text()).toContain('Simulation clock (UTC): 2026-10-23 13:30:00 UTC');
    expect(all(ui.render(), n => n.type === 'th').map(text)).toContain('Expiry (UTC)');
  });
  it('an unshowable clock reads Unavailable', () => {
    const ui = panel({ now: Number.NaN });
    expect(ui.text()).toContain('Current ticket time (UTC): Unavailable');
  });
});
