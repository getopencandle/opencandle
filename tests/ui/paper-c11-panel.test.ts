import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PaperPanel, type PaperPanelProps } from '../../src/ui/PaperPanel';
import { configurePaperAccount, createPaperAccount, processPaperQuote, submitPaperOrder, type PaperAccount, type PaperResult } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';

// Actual PaperPanel handler calls with controlled hooks. No DOM, native focus,
// packaged executable or GUI is exercised; these are component-handler tests only.
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0 }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  return { ...actual, useState: (initial: any) => { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = typeof initial === 'function' ? initial() : initial; return [hooks.cells[i], (next: any) => { hooks.cells[i] = typeof next === 'function' ? next(hooks.cells[i]) : next; }]; }, useRef: (initial: any) => { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = { current: initial }; return hooks.cells[i]; }, useEffect: () => { hooks.cursor++; } };
});
const instrument: Instrument = { id: 'C11:UI', symbol: 'CUI', name: 'Synthetic C11 panel', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const quote: Quote = { instrumentId: instrument.id, bid: 9.98, ask: 10.02, eventTime: 1, receivedAt: 1, availableAt: 1, sequence: 1, fixture: true, session: 'unknown' };
const ok = (result: PaperResult) => { expect(result.ok, result.diagnostics.map(d => d.message).join(';')).toBe(true); return result.account; };
const start = (options = {}) => ok(processPaperQuote(createPaperAccount({ initialBalance: 1000, ...options }), quote, 1, 'ordinary', instrument));
function text(node: any): string { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function find(tree: any, predicate: (node: any) => boolean): any { if (Array.isArray(tree)) { for (const child of tree) { const found = find(child, predicate); if (found) return found; } } else if (tree?.props) { if (predicate(tree)) return tree; return find(tree.props.children, predicate); } return null; }
function setup(account: PaperAccount) {
  const change = vi.fn((next: PaperAccount, expected?: PaperAccount) => { if (expected !== props.account) return false; props.account = next; return true; });
  const props: PaperPanelProps = { account, instrument, quote, quoteSource: { key: 'c11-synthetic', state: 'ready' }, now: 1, onAccountChange: change };
  const render = () => { hooks.cursor = 0; return PaperPanel(props); };
  const node = (predicate: (n: any) => boolean) => { const found = find(render(), predicate); if (!found) throw new Error('missing node'); return found; };
  return { props, change, render, text: () => text(render()), node,
    click: (name: string) => node(n => n.type === 'button' && text(n) === name).props.onClick(),
    input: (label: string, value: string) => node(n => n.props['aria-label'] === label).props.onChange({ target: { value } }),
    submit: () => node(n => n.type === 'form').props.onSubmit({ preventDefault: vi.fn(), stopPropagation: vi.fn() }),
    dialog: () => find(render(), n => n.props?.role === 'alertdialog'),
    message: () => text(find(render(), n => n.type === 'output')) };
}
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; vi.stubGlobal('document', { activeElement: null }); });
afterEach(() => vi.unstubAllGlobals());

it('shows virtual margin, orders margin and fees, with fee and slippage in the ticket info', () => {
  const ui = setup(ok(configurePaperAccount(start(), { slippageTicks: 2, commission: { kind: 'fixed', value: 1.5 } }, 1)));
  const all = ui.text();
  for (const label of ['Account margin', 'Orders margin', 'Fees paid', 'Buying power']) expect(all).toContain(label);
  expect(all).toContain('All amounts here are virtual USD');
  expect(all).toContain('Estimated virtual fee at entry basis after slippage: 1.50 USD'); expect(all).toContain('Slippage: 2 tick(s) on this fill');
  ui.input('Order type', 'limit'); expect(ui.text()).toContain('none for limit-priced fills');
});
it('blocks an order the engine would reject for insufficient virtual funds without creating history', () => {
  const ui = setup(start()); ui.input('Order quantity', '150'); ui.submit();
  // 150 * 10.02 = 1503 > 1000 virtual USD.
  expect(ui.dialog()).toBeNull(); expect(ui.change).not.toHaveBeenCalled(); expect(ui.props.account.orders).toEqual([]);
  expect(ui.message()).toMatch(/Not submitted.*Insufficient virtual buying power/);
});
it('cancels only buy orders after confirmation and refuses a stale scoped confirmation', () => {
  let account = start();
  for (const [side, limitPrice] of [['buy', 9], ['buy', 8], ['sell', 15]] as const) account = ok(submitPaperOrder(account, { instrument, side, type: 'limit', limitPrice, quantity: 1 }, 1));
  const ui = setup(account); ui.click('Cancel buy orders');
  expect(text(ui.dialog())).toContain('Cancel 2 working virtual buy order(s)');
  ui.click('Confirm');
  expect(ui.props.account.orders.map(o => o.status)).toEqual(['cancelled', 'cancelled', 'working']);
  const stale = setup(account); stale.click('Cancel all CUI orders');
  stale.props.account = ok(submitPaperOrder(account, { instrument, side: 'buy', type: 'limit', limitPrice: 7, quantity: 1 }, 1)); stale.render(); stale.click('Confirm');
  expect(stale.change).not.toHaveBeenCalled(); expect(stale.message()).toMatch(/changed after confirmation/);
});
it('partially closes, then reverses, a position through confirmations', () => {
  const ui = setup(ok(submitPaperOrder(start(), { instrument, side: 'buy', type: 'market', quantity: 10 }, 1)));
  ui.click('Positions'); expect(ui.text()).toContain('Long');
  ui.input('Close quantity CUI', '10'); ui.click('Close quantity'); expect(ui.message()).toMatch(/smaller than the position/); expect(ui.dialog()).toBeNull();
  ui.input('Close quantity CUI', '4'); ui.click('Close quantity'); ui.click('Confirm');
  expect(ui.props.account.positions[instrument.id].quantity).toBe(6);
  ui.click('Reverse'); expect(text(ui.dialog())).toContain('sell 12 units'); ui.click('Cancel');
  expect(ui.props.account.positions[instrument.id].quantity).toBe(6);
  ui.click('Reverse'); ui.click('Confirm');
  // 6 long reversed with one market sell of 12 at 9.98: short 6 at 9.98.
  expect(ui.props.account.positions[instrument.id]).toMatchObject({ quantity: -6, averagePrice: 9.98 });
  expect(ui.text()).toContain('Short');
});
it('applies slippage and quote-age settings and lists slipped fills in history', () => {
  const ui = setup(start()); ui.click('Account');
  ui.input('Virtual slippage ticks', '3'); ui.input('Maximum quote age seconds', '30'); ui.click('Apply simulation settings');
  expect(ui.props.account.settings).toMatchObject({ slippageTicks: 3, maxQuoteAgeSeconds: 30 });
  ui.input('Virtual slippage ticks', '1.5'); ui.click('Apply simulation settings');
  expect(ui.message()).toMatch(/whole number of ticks/); expect(ui.props.account.settings.slippageTicks).toBe(3);
  ui.props.account = ok(submitPaperOrder(ui.props.account, { instrument, side: 'buy', type: 'market', quantity: 2 }, 1));
  ui.click('History'); const history = ui.text();
  // Ask 10.02 + 3 * 0.01 = 10.05.
  expect(history).toContain('Fills and realized results'); expect(history).toContain('10.05'); expect(history).toContain('0.03'); expect(history).toContain('Order history');
});
it('reset requires confirmation, Cancel keeps the account, Confirm resets balance and currency', () => {
  const funded = ok(submitPaperOrder(start(), { instrument, side: 'buy', type: 'market', quantity: 5 }, 1));
  const ui = setup(funded); ui.click('Account'); ui.input('Reset virtual balance', '2500'); ui.input('Reset virtual currency', 'eur');
  ui.click('Reset virtual account'); expect(text(ui.dialog())).toContain('1 position(s) and 1 fill(s)');
  ui.click('Cancel'); expect(ui.props.account).toBe(funded); expect(ui.dialog()).toBeNull();
  ui.click('Reset virtual account'); ui.click('Confirm');
  expect(ui.props.account).toMatchObject({ cash: 2500, fills: [], positions: {} }); expect(ui.props.account.settings.currency).toBe('EUR');
  ui.input('Reset virtual currency', 'EURO'); ui.click('Reset virtual account'); expect(ui.dialog()).toBeNull(); expect(ui.message()).toMatch(/three-letter/);
});
it('a reverse refused for lack of virtual funds shows the reason and creates no order', () => {
  // Long 98 at 10.02 in a 1000 account, then a fixed fee of 15: the reversed short needs margin 981.96 > equity 977.16.
  const long = ok(submitPaperOrder(start(), { instrument, side: 'buy', type: 'market', quantity: 98 }, 1));
  const ui = setup(ok(configurePaperAccount(long, { commission: { kind: 'fixed', value: 15 } }, 1)));
  const before = ui.props.account; ui.click('Positions'); ui.click('Reverse'); ui.click('Confirm');
  expect(ui.change).not.toHaveBeenCalled(); expect(ui.props.account).toBe(before); expect(before.orders).toHaveLength(1);
  expect(ui.message()).toMatch(/Insufficient virtual buying power.*No virtual order was created/);
});
