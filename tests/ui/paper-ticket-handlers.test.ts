import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PaperPanel, type PaperPanelProps } from '../../src/ui/PaperPanel';
import { createPaperAccount, processPaperQuote, restorePaperAccount, submitPaperOrder } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';

// Actual handler calls with controlled hooks. No DOM, native input or executable is exercised.
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0 }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  return { ...actual, useState: (initial: any) => { const cells = hooks.cells, i = hooks.cursor++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], (next: any) => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; }, useRef: (initial: any) => { const cells = hooks.cells, i = hooks.cursor++; if (!(i in cells)) cells[i] = { current: initial }; return cells[i]; }, useEffect: () => {} };
});
const instrument: Instrument = { id: 'SYNTHETIC:UI', symbol: 'UI', name: 'Synthetic handler oracle', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: .01, lotSize: 1 };
const quote: Quote = { instrumentId: instrument.id, bid: 10, ask: 10, eventTime: 1000, receivedAt: 1000, availableAt: 1000, sequence: 1, fixture: true, session: 'regular' };
function text(node: any): string { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function find(node: any, predicate: (node: any) => boolean): any { if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } } else if (node?.props) { if (predicate(node)) return node; return find(node.props.children, predicate); } return null; }
function drivers(render: () => any) {
  const node = (predicate: (node: any) => boolean) => { const result = find(render(), predicate); if (!result) throw new Error('Expected handler missing'); return result; };
  return { render, text: () => text(render()), node, change: (label: string, value: string) => node(n => n.props['aria-label'] === label).props.onChange({ target: { value } }), click: (name: string) => node(n => n.type === 'button' && text(n) === name).props.onClick(), submit: () => node(n => n.type === 'form').props.onSubmit({ preventDefault: vi.fn(), stopPropagation: vi.fn() }) };
}
function setup(overrides: Partial<PaperPanelProps> = {}) {
  const account = processPaperQuote(createPaperAccount({ initialBalance: 1000, now: 1000 }), quote, 1000, 'ordinary', instrument).account;
  const props: PaperPanelProps = { account, instrument, quote, quoteSource: { key: 'synthetic UI basis A', state: 'ready' }, now: 1000, onAccountChange: vi.fn(() => true), ...overrides }, cells: any[] = [];
  const render = () => { hooks.cells = cells; hooks.cursor = 0; return PaperPanel(props); };
  const ui = drivers(render);
  return { ...ui, props, editor: () => { const element = ui.node(n => typeof n.type === 'function' && n.props.title === undefined && n.props.value?.title === 'Configure virtual ticket exits'), child: any[] = []; return drivers(() => { hooks.cells = child; hooks.cursor = 0; return element.type(element.props); }); } };
}
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; vi.stubGlobal('document', { activeElement: null }); });
afterEach(() => vi.unstubAllGlobals());

it('submits a gross-notional ticket through actual mode handlers with Day from accepted time', () => {
  const ui = setup(); ui.change('Quantity representation', 'notional'); ui.change('Order quantity', '250');
  expect(ui.text()).toContain('25 units'); ui.submit(); ui.props.now = 1005; ui.render(); ui.click('Confirm');
  const [next, base] = vi.mocked(ui.props.onAccountChange).mock.calls[0];
  expect(base).toBe(ui.props.account); expect(next.orders[0]).toMatchObject({ quantity: 25, timeInForce: 'DAY', expiresAt: 87405, sessionPolicy: { schemaVersion: 2, entryOutsideRth: false, takeProfitOutsideRth: false } });
  expect(restorePaperAccount(next).orders[0].ticket?.input.quantity).toEqual({ kind: 'notional', value: '250', currency: 'USD' });
});
it('retains draft and confirmation when publication is rejected', () => {
  const ui = setup({ onAccountChange: vi.fn(() => false) }); ui.change('Order quantity', '2'); ui.submit(); ui.click('Confirm');
  expect(ui.text()).toContain('change was rejected'); expect(ui.node(n => n.props.role === 'alertdialog')).toBeTruthy();
  expect(ui.node(n => n.props['aria-label'] === 'Order quantity').props.value).toBe('2'); expect(ui.props.account.orders).toEqual([]);
});
it('rejects same-price source changes and quote changes after confirmation without publishing', () => {
  const ui = setup(); ui.submit(); ui.props.quoteSource = { key: 'different exact source', state: 'ready' }; ui.render(); ui.click('Confirm');
  expect(ui.props.onAccountChange).not.toHaveBeenCalled(); expect(ui.text()).toContain('changed');
  ui.click('Cancel'); ui.props.quoteSource = { key: 'synthetic UI basis A', state: 'ready' }; ui.render(); ui.submit(); ui.props.quote = { ...quote, ask: 11, sequence: 2 }; ui.render(); ui.click('Confirm'); expect(ui.props.onAccountChange).not.toHaveBeenCalled();
});
it('refuses an unbound quote without inventing a source or opening an exit editor', () => {
  const ui = setup({ quoteSource: null }); ui.click('Add take profit / stop loss'); expect(ui.text()).toContain('exact source identity');
  expect(find(ui.render(), n => typeof n.type === 'function' && n.props.value?.title === 'Configure virtual ticket exits')).toBeNull(); ui.submit(); expect(ui.props.onAccountChange).not.toHaveBeenCalled();
});
it('uses actual exit representation handlers and requires an explicitly chosen risk stop', () => {
  const ui = setup(); ui.change('Quantity representation', 'risk-money'); ui.change('Order quantity', '100'); ui.click('Add take profit / stop loss'); const editor = ui.editor();
  editor.change('Exit 1 quantity', '50'); editor.change('Exit 1 tp representation', 'price-percent'); editor.change('Exit 1 sl representation', 'ticks'); editor.change('Exit 1 take profit', '20'); editor.change('Exit 1 stop loss', '200');
  expect(editor.text()).toContain('Resolved TP: 12; SL: 8.'); editor.submit();
  expect(ui.text()).toContain('Choose a specific stop-loss level');
  const chooser = ui.node(n => n.props['aria-label'] === 'Risk sizing stop'), option = find(chooser, n => n.type === 'option' && n.props.value !== '');
  ui.change('Risk sizing stop', option.props.value); expect(ui.text()).toContain('50 units'); expect(ui.text()).toContain('TP 12; SL 8'); ui.submit(); ui.click('Confirm');
  expect(vi.mocked(ui.props.onAccountChange).mock.calls[0][0].orders[0].exits?.levels[0]).toEqual({ quantity: 50, takeProfit: 12, stopLoss: 8 });
});
it('keeps legacy GTC and expiry immutable when the working order is edited', () => {
  const ui = setup(); ui.props.account = submitPaperOrder(ui.props.account, { instrument, type: 'limit', side: 'buy', quantity: 1, limitPrice: 9, timeInForce: 'GTC', extendedHours: true }, 1000).account;
  ui.render(); ui.click('Modify'); ui.change('Order quantity', '2'); ui.submit(); ui.click('Confirm');
  const order = vi.mocked(ui.props.onAccountChange).mock.calls[0][0].orders[0]; expect(order.timeInForce).toBe('GTC'); expect(order).not.toHaveProperty('expiresAt'); expect(order).not.toHaveProperty('sessionPolicy'); expect(order.extendedHours).toBe(true);
});
it('ignores composing Escape in the exit dialog and cancels normally without an order', () => {
  const ui = setup(); ui.click('Add take profit / stop loss'); const editor = ui.editor();
  editor.node(n => n.props.role === 'dialog').props.onKeyDown({ key: 'Escape', nativeEvent: { isComposing: true }, preventDefault: vi.fn(), stopPropagation: vi.fn() }); expect(find(ui.render(), n => typeof n.type === 'function' && !!n.props.value)).toBeTruthy();
  editor.click('Cancel'); expect(find(ui.render(), n => typeof n.type === 'function' && !!n.props.value)).toBeNull(); expect(ui.props.onAccountChange).not.toHaveBeenCalled();
});
it('retains cancellation and account-reset confirmations when publication rejects', () => {
  const ui = setup({ onAccountChange: vi.fn(() => false) });
  ui.props.account = submitPaperOrder(ui.props.account, { instrument, type: 'limit', side: 'buy', quantity: 1, limitPrice: 9 }, 1000).account;
  ui.render(); ui.click('Cancel order'); ui.click('Confirm'); expect(ui.node(n => n.props.role === 'alertdialog')).toBeTruthy(); expect(ui.props.account.orders[0].status).toBe('working');
  ui.click('Cancel'); ui.click('Account'); ui.click('Reset virtual account'); ui.click('Confirm'); expect(ui.node(n => n.props.role === 'alertdialog')).toBeTruthy(); expect(ui.props.account.orders).toHaveLength(1);
});
