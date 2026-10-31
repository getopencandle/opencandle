import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configurePaperAccount, createPaperAccount, processPaperQuote, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import { brokerTicketInfo, reviewBrokerTicket, blankBrokerDraft } from '../../src/domain/paper-broker-ticket';
import { movePaperDomOrder, paperDomMoveIntent, paperDomScrolled } from '../../src/domain/paper-dom';
import type { Instrument, Quote } from '../../src/domain/types';
import { PaperDom } from '../../src/ui/PaperDom';
import { PaperOrderTicket } from '../../src/ui/PaperOrderTicket';

// DOM drag modify and wheel scroll, ticket Order info and Position info. Handlers are called through controlled hooks
// (the paper-ticket-handlers harness); no DOM or executable is exercised. Synthetic instrument and quotes, virtual money only.
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0 }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  return {
    ...actual,
    useState: (initial: any) => { const cells = hooks.cells, i = hooks.cursor++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], (next: any) => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; },
    useEffect: () => {}, useMemo: (make: () => any) => make(), useRef: (value: any) => ({ current: value }),
  };
});
const instrument: Instrument = { id: 'SYNTHETIC:DOM1027', symbol: 'DOMX', name: 'Synthetic DOM', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const quote = (bid: number, ask: number, sequence = 1, at = 100): Quote => ({ instrumentId: instrument.id, bid, ask, session: 'regular', fixture: true, eventTime: at, receivedAt: at, availableAt: at, sequence });
const quoted = (account = createPaperAccount({ now: 100 })) => processPaperQuote(account, quote(100, 100.02), 100, account.runId, instrument).account;
const submit = (account: PaperAccount, request: Record<string, unknown>) => { const result = submitPaperOrder(account, { instrument, quantity: 1, ...request } as never, 100); expect(result.ok).toBe(true); return result.account; };
function text(node: any): string { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function find(node: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } return null; }
  if (node?.props) { if (predicate(node)) return node; return find(node.props.children, predicate); }
  return null;
}
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; });
afterEach(() => vi.unstubAllGlobals());

describe('DOM drag modify (domain)', () => {
  it('moves a limit to the dropped row and keeps the order id', () => {
    const account = submit(quoted(), { side: 'buy', type: 'limit', limitPrice: 99.9, quantity: 3 });
    const id = account.orders[0].id, move = paperDomMoveIntent(account, instrument, id, 99.95, account.quotes[instrument.id]);
    expect(move).toMatchObject({ ok: true, changes: { limitPrice: 99.95 }, marketable: false });
    if (!move.ok) return;
    expect(move.label).toBe('Move buy limit 3 DOMX to 99.95');
    const moved = movePaperDomOrder(account, move, 100);
    expect(moved.ok).toBe(true);
    expect(moved.account.orders.find(row => row.id === id)!.limitPrice).toBe(99.95);
  });
  it('moves a stop or untriggered stop-limit by its stop price and refuses a level that triggers at once', () => {
    let account = submit(quoted(), { side: 'buy', type: 'stop', stopPrice: 100.5 });
    account = submit(account, { side: 'buy', type: 'stop-limit', stopPrice: 100.6, limitPrice: 100.7 });
    const [stop, stopLimit] = account.orders, q = account.quotes[instrument.id];
    expect(paperDomMoveIntent(account, instrument, stop.id, 100.4, q)).toMatchObject({ ok: true, changes: { stopPrice: 100.4 } });
    expect(paperDomMoveIntent(account, instrument, stopLimit.id, 100.65, q)).toMatchObject({ ok: true, changes: { stopPrice: 100.65 } });
    const refused = paperDomMoveIntent(account, instrument, stop.id, 100.02, q);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toContain('would trigger at once');
  });
  it('marks a limit moved through the market as marketable and refuses off-tick, same-row and unknown orders', () => {
    const account = submit(quoted(), { side: 'sell', type: 'limit', limitPrice: 100.5 }), id = account.orders[0].id, q = account.quotes[instrument.id];
    expect(paperDomMoveIntent(account, instrument, id, 99.9, q)).toMatchObject({ ok: true, marketable: true });
    expect(paperDomMoveIntent(account, instrument, id, 100.005, q).ok).toBe(false);
    expect(paperDomMoveIntent(account, instrument, id, 100.5, q).ok).toBe(false);
    expect(paperDomMoveIntent(account, instrument, 'missing', 100.4, q).ok).toBe(false);
  });
  it('scrolls the fixed ladder by whole ticks and never below one tick', () => {
    expect(paperDomScrolled(100.01, 3, instrument)).toBe(100.04);
    expect(paperDomScrolled(100.01, -3, instrument)).toBe(99.98);
    expect(paperDomScrolled(0.02, -5, instrument)).toBe(0.01);
  });
});

describe('DOM drag modify and scroll (panel handlers)', () => {
  it('a dragged buy cell dropped on another buy row moves the order through onAccountChange; the wheel shifts the ladder', () => {
    let account = submit(quoted(), { side: 'buy', type: 'limit', limitPrice: 99.99, quantity: 2 });
    account = configurePaperAccount(account, { oneClick: true }, 100).account;
    const changes: PaperAccount[] = [];
    const render = () => { hooks.cursor = 0; return PaperDom({ account, instrument, now: 100, rows: 9, onAccountChange: next => { changes.push(next); return true; } }) as any; };
    let tree = render();
    const grabbed = find(tree, n => n.props['aria-label'] === 'Buy at 99.99');
    expect(grabbed.props.draggable).toBe(true);
    grabbed.props.onDragStart({ dataTransfer: { setData: () => {} } });
    tree = render();
    const target = find(tree, n => n.props['aria-label'] === 'Buy at 99.97');
    let prevented = false;
    target.props.onDragOver({ preventDefault: () => { prevented = true; } });
    expect(prevented).toBe(true);
    target.props.onDrop({ preventDefault: () => {} });
    expect(changes).toHaveLength(1);
    expect(changes[0].orders[0].limitPrice).toBe(99.97);
    expect(text(render())).toContain('Move buy limit 2 DOMX to 99.97: done.');
    // A sell cell is not a drop target for a buy order.
    expect(find(render(), n => n.props['aria-label'] === 'Sell at 99.97').props.draggable).toBeUndefined();
    const before = find(render(), n => n.props['aria-label'] === 'Price ladder');
    const top = () => find(render(), n => typeof n.props['aria-label'] === 'string' && n.props['aria-label'].startsWith('Buy at ') && !n.props['aria-label'].includes('size')).props['aria-label'];
    const first = top();
    before.props.onWheel({ deltaY: 100 });
    expect(top()).not.toBe(first);
    expect(Number(top().slice(7))).toBeCloseTo(Number(first.slice(7)) - 0.03, 6);
  });
});

describe('ticket Order info and Position info (PAPER.TICKET.INFO)', () => {
  const context = (account: PaperAccount) => ({ account, instrument, quote: account.quotes[instrument.id], quoteSource: { key: 'synthetic', state: 'ready' as const }, now: 100 });
  it('computes trade value, leverage, margin, commission, tick value and the position after the fill', () => {
    let account = quoted(createPaperAccount({ now: 100, leverage: 4, commission: { kind: 'per-unit', value: 0.05 } }));
    account = submit(account, { side: 'buy', type: 'market', quantity: 10 });
    const info = brokerTicketInfo({ quantity: 30, entry: 100, notional: 3000 }, 'sell', { account, instrument });
    expect(info).toMatchObject({ tradeValue: 3000, leverage: 4, commission: 1.5, tickValue: 0.3, closing: 10, opening: 20, current: { side: 'Long', quantity: 10 }, after: { side: 'Short', quantity: 20, average: 100 } });
    expect(info.margin).toBe(500);
    const adding = brokerTicketInfo({ quantity: 10, entry: 101, notional: 1010 }, 'buy', { account, instrument });
    expect(adding.after.side).toBe('Long'); expect(adding.after.quantity).toBe(20); expect(adding.after.average).toBeCloseTo((account.positions[instrument.id].averagePrice * 10 + 1010) / 20, 8);
    expect(brokerTicketInfo({ quantity: 10, entry: 99, notional: 990 }, 'sell', { account, instrument }).after).toEqual({ side: 'Flat', quantity: 0, average: null });
  });
  it('the reviewed ticket renders an Order info and a Position info block with the estimates', () => {
    const account = quoted(createPaperAccount({ now: 100, leverage: 2 }));
    const review = reviewBrokerTicket({ ...blankBrokerDraft('buy'), quantity: '5' }, context(account));
    expect(review.ok).toBe(true);
    hooks.cursor = 0;
    const tree = PaperOrderTicket({ ...context(account), side: 'buy', quantity: '5', onAccountChange: () => true, onDone: () => {} }) as any;
    const order = find(tree, n => n.props['aria-label'] === 'Order info'), position = find(tree, n => n.props['aria-label'] === 'Position info');
    expect(text(order)).toContain('Trade value500.10 USD');
    expect(text(order)).toContain('Leverage2x');
    expect(text(order)).toContain('Margin250.05 USD');
    expect(text(order)).toContain('Commission0.00 USD');
    expect(text(order)).toContain('Tick value0.05 USD');
    expect(text(position)).toContain('Position nowFlat');
    expect(text(position)).toContain('After fillLong 5 at 100.02');
  });
});
