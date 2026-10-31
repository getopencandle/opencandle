import { expect, it } from 'vitest';
import { createPaperAccount, modifyPaperOrder, processPaperQuote, restorePaperAccount, submitPaperOrder } from '../../src/domain/paper';
import { materializePaperTicket, parsePaperExpiryText, previewPaperTicket, validatePaperTicketInput, type PaperTicketContext, type PaperTicketInput, type PaperTicketPreview } from '../../src/domain/paper-ticket';
import type { Instrument, Quote } from '../../src/domain/types';

const instrument: Instrument = { id: 'SYNTHETIC:TICKET', symbol: 'TICKET', name: 'Synthetic ticket oracle', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: .25, lotSize: 1 };
const quote: Quote = { instrumentId: instrument.id, bid: 99, ask: 100, sequence: 1, eventTime: 1000, receivedAt: 1000, availableAt: 1000, fixture: true, session: 'regular' };
const context = (): PaperTicketContext => ({ account: createPaperAccount({ initialBalance: 1000, now: 1000 }), instrument, quote, quoteSource: { key: 'exact synthetic source basis A', state: 'ready' }, now: 1000 });
const input = (): PaperTicketInput => ({ schemaVersion: 1, side: 'buy', type: 'limit', quantity: { kind: 'units', value: '1' }, limit: { kind: 'price', value: '10' }, stop: null, validity: { kind: 'day' }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null });
function ok<T>(result: { ok: boolean; value?: T; diagnostics: unknown[] }): T { expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true); return result.value!; }
const preview = (draft: PaperTicketInput, ctx = context()) => ok<PaperTicketPreview>(previewPaperTicket(draft, ctx));

it('uses ask/bid signed ticks, permits locked quotes and rejects crossed or off-grid prices', () => {
  const draft = input(); draft.limit = { kind: 'side-ticks', value: '-4' };
  expect(preview(draft).resolved.limitPrice).toBe(99);
  draft.side = 'sell'; draft.limit.value = '4'; expect(preview(draft).resolved.limitPrice).toBe(100);
  const ctx = context(); ctx.quote = { ...quote, bid: 100 }; expect(preview(draft, ctx).resolved.limitPrice).toBe(101);
  ctx.quote = { ...quote, bid: 101 }; expect(previewPaperTicket(draft, ctx)).toMatchObject({ ok: false, diagnostics: [{ code: 'INVALID_TICKET_QUOTE' }] });
  draft.limit.value = '.5'; expect(previewPaperTicket(draft, context())).toMatchObject({ ok: false, diagnostics: [{ code: 'OFF_GRID_PRICE' }] });
});
it('distinguishes cash, realized balance and equity using literal virtual-account arithmetic', () => {
  let account = createPaperAccount({ initialBalance: 1000, commission: { kind: 'fixed', value: 1 }, now: 1000 });
  account = processPaperQuote(account, { ...quote, bid: 10, ask: 10 }, 1000, account.runId, instrument).account;
  account = submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 10 }, 1000).account;
  account = processPaperQuote(account, { ...quote, bid: 12, ask: 12, sequence: 2, eventTime: 1001, receivedAt: 1001, availableAt: 1001 }, 1001, account.runId, instrument).account;
  expect(account.cash).toBe(899); const ctx = { ...context(), account, quote: account.quotes[instrument.id], now: 1001 };
  for (const [basis, expectedBalance, units] of [['cash', 899, 8], ['realized-balance', 999, 9], ['equity', 1019, 10]] as const) {
    const draft = input(); draft.quantity = { kind: 'balance-percent', value: '10', basis };
    expect(preview(draft, ctx).sizing).toMatchObject({ balanceBasis: basis, balanceValue: expectedBalance, quantity: units, feesIncluded: false, leverageApplied: false });
  }
  const stale = { ...ctx, now: 1100, quote: { ...ctx.quote, eventTime: 1100, receivedAt: 1100, availableAt: 1100, sequence: 3 } };
  const draft = input(); draft.quantity = { kind: 'balance-percent', value: '10', basis: 'equity' };
  expect(previewPaperTicket(draft, stale)).toMatchObject({ ok: false, diagnostics: [{ code: 'STALE_TICKET_QUOTE' }] });
});
it('rounds budget quantities downward, never clamps zero upward and never applies leverage or FX', () => {
  const draft = input(); draft.quantity = { kind: 'notional', value: '250', currency: 'USD' };
  expect(preview(draft).resolved.quantity).toBe(25);
  draft.quantity.value = '9'; expect(previewPaperTicket(draft, context())).toMatchObject({ ok: false, diagnostics: [{ code: 'ZERO_SIZED_QUANTITY' }] });
  const ctx = context(); ctx.instrument = { ...instrument, lotSize: .01 }; draft.limit!.value = '3'; draft.quantity.value = '10';
  expect(preview(draft, ctx).sizing).toMatchObject({ quantity: 3.33, grossNotional: 9.99 });
  draft.quantity = { kind: 'units', value: '3.335' }; expect(previewPaperTicket(draft, ctx).ok).toBe(false);
  draft.quantity = { kind: 'notional', value: '250', currency: 'EUR' }; expect(previewPaperTicket(draft, ctx)).toMatchObject({ ok: false, diagnostics: [{ code: 'TICKET_FX_UNAVAILABLE' }] });
});
it('sizes risk from the explicitly selected level and validates long/short protective sides', () => {
  const draft = input(); draft.quantity = { kind: 'risk-money', value: '100', currency: 'USD', stopLevelId: 'second' };
  draft.exits = { mode: 'multiple', levels: [
    { id: 'first', quantity: '20', takeProfit: { kind: 'price', value: '12' }, stopLoss: { kind: 'price', value: '9' } },
    { id: 'second', quantity: '30', takeProfit: { kind: 'price', value: '13' }, stopLoss: { kind: 'price', value: '8' } },
  ] };
  expect(preview(draft).sizing).toMatchObject({ quantity: 50, riskStopLevelId: 'second', riskStopPrice: 8 });
  draft.quantity.stopLevelId = 'missing'; expect(previewPaperTicket(draft, context()).ok).toBe(false);
  draft.quantity.stopLevelId = 'second'; draft.exits.levels[1].stopLoss!.value = '10'; expect(previewPaperTicket(draft, context())).toMatchObject({ ok: false, diagnostics: [{ code: 'WRONG_SIDE_EXIT' }] });
  draft.side = 'sell'; draft.exits = { mode: 'single', levels: [{ id: 'second', quantity: '50', takeProfit: { kind: 'price', value: '8' }, stopLoss: { kind: 'price', value: '12' } }] };
  expect(preview(draft).resolved.quantity).toBe(50);
});
it('resolves all five exit representations with independent fixed-level quantity', () => {
  for (const value of [{ kind: 'price', value: '12' }, { kind: 'ticks', value: '8' }, { kind: 'price-percent', value: '20' }, { kind: 'money', value: '20', currency: 'USD' }, { kind: 'balance-percent', value: '2', basis: 'cash' }] as const) {
    const draft = input(); draft.exits = { mode: 'single', levels: [{ id: 'one', quantity: '10', takeProfit: value, stopLoss: { kind: 'price', value: '8' } }] };
    expect(preview(draft).resolved.exits?.levels[0]).toEqual({ quantity: 10, takeProfit: 12, stopLoss: 8 });
  }
});
it('treats entry-stop direction separately from valid marketable limits', () => {
  const draft = input(); draft.limit!.value = '101'; expect(preview(draft).resolved.limitPrice).toBe(101);
  draft.type = 'stop'; draft.limit = null; draft.stop = { kind: 'price', value: '100' };
  expect(previewPaperTicket(draft, context())).toMatchObject({ ok: false, diagnostics: [{ code: 'WRONG_SIDE_ENTRY_STOP' }] });
  draft.stop.value = '100.25'; expect(preview(draft).resolved.stopPrice).toBe(100.25);
  draft.side = 'sell'; draft.stop.value = '98.75'; expect(preview(draft).resolved.stopPrice).toBe(98.75);
});
it('materializes Day from accepted placement and preserves that expiry on edit', () => {
  const ctx = context(), draft = input(), p = preview(draft, ctx);
  const request = ok(materializePaperTicket(p, draft, { ...ctx, now: 1010 })); expect(request).toMatchObject({ timeInForce: 'DAY', expiresAt: 87410 });
  const submitted = submitPaperOrder(ctx.account, request, 1010); expect(submitted.ok).toBe(true);
  const editContext = { ...ctx, account: submitted.account, editOrderId: submitted.orderId!, now: 1010 };
  draft.validity = { kind: 'retain-existing', orderId: submitted.orderId! }; draft.quantity.value = '2';
  const edit = ok(materializePaperTicket(preview(draft, editContext), draft, { ...editContext, now: 1011 })); expect(edit.expiresAt).toBe(87410);
  const modified = modifyPaperOrder(submitted.account, submitted.orderId!, { quantity: edit.quantity, ticket: edit.ticket, expiresAt: edit.expiresAt }, 1011);
  expect(modified.ok).toBe(true); expect(restorePaperAccount(modified.account).orders[0].expiresAt).toBe(87410);
});
it('retains legacy GTC/shared session semantics without introducing version 2', () => {
  const ctx = context(), existing = submitPaperOrder(ctx.account, { instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 10, extendedHours: true, timeInForce: 'GTC' }, 1000);
  const draft = input(); draft.entryOutsideRth = true; draft.takeProfitOutsideRth = true; draft.validity = { kind: 'retain-existing', orderId: existing.orderId! };
  const editing = { ...ctx, account: existing.account, editOrderId: existing.orderId };
  const result = ok(materializePaperTicket(preview(draft, editing), draft, editing));
  expect(result.timeInForce).toBe('GTC'); expect(result).not.toHaveProperty('expiresAt'); expect(result).not.toHaveProperty('sessionPolicy'); expect(result.extendedHours).toBe(true);
});
it('rejects changed preview dependencies, forged receipts and unbound or stale sources', () => {
  const ctx = context(), draft = input(), p = preview(draft, ctx);
  const altered = [
    { ...ctx, account: { ...ctx.account } }, { ...ctx, quote: { ...quote, sequence: 2 } }, { ...ctx, quoteSource: { key: 'other source', state: 'ready' as const } },
    { ...ctx, instrument: { ...instrument, tickSize: .01 } }, { ...ctx, now: 1061 }, { ...ctx, quoteSource: { key: ctx.quoteSource!.key, state: 'disconnected' as const } },
  ];
  for (const changed of altered) expect(materializePaperTicket(p, draft, changed).ok).toBe(false);
  expect(materializePaperTicket({ ...p }, draft, ctx).ok).toBe(false);
  expect(materializePaperTicket(p, { ...draft, side: 'sell' }, ctx).ok).toBe(false);
  expect(previewPaperTicket(draft, { ...ctx, quoteSource: null }).ok).toBe(false);
  expect(previewPaperTicket(draft, { ...ctx, quoteSource: { key: 'x'.repeat(16385), state: 'ready' } }).ok).toBe(false);
  expect(ok(materializePaperTicket(p, draft, { ...ctx, now: 1001 })).quantity).toBe(1);
});
it('rejects hostile schema and representations without invoking accessors', () => {
  let calls = 0; const hostile = input(); Object.defineProperty(hostile, 'quantity', { enumerable: true, get: () => { calls++; return { kind: 'units', value: '1' }; } });
  expect(() => validatePaperTicketInput(hostile)).toThrow(); expect(calls).toBe(0);
  for (const value of ['1e3', '0x10', 'Infinity', '1,000', '', '-1']) { const draft = input(); draft.quantity.value = value; expect(previewPaperTicket(draft, context()).ok).toBe(false); }
  expect(() => validatePaperTicketInput({ ...input(), hidden: 1 })).toThrow();
  expect(previewPaperTicket({ ...input(), validity: { kind: 'quarter' } }, context()).ok).toBe(false);
});
it('requires an explicit expiry offset and rejects normalized impossible dates', () => {
  expect(parsePaperExpiryText('2026-11-01T01:30:00-05:00') - parsePaperExpiryText('2026-11-01T01:30:00-04:00')).toBe(3600);
  for (const text of ['2026-11-01T01:30:00', '2026-02-30T12:00:00Z', '2026-01-01T24:00:00Z', '9999-12-31T23:59:59-01:00', '1970-01-01T00:00:00+01:00']) expect(() => parsePaperExpiryText(text)).toThrow();
});
it('preserves bounded ticket provenance while rejecting corrupt required values', () => {
  const ctx = context(), draft = input(), request = ok(materializePaperTicket(preview(draft, ctx), draft, ctx)), account = submitPaperOrder(ctx.account, request, ctx.now).account;
  expect(restorePaperAccount(account).orders[0].ticket).toEqual(request.ticket);
  for (const corrupt of [(s: any) => { s.entryPrice = null; }, (s: any) => { s.grossNotional = 11; }, (s: any) => { s.rawQuantity = '1e99999'; }, (s: any) => { s.balanceBasis = 'cash'; }]) {
    const changed = structuredClone(account); corrupt(changed.orders[0].ticket!.sizing); expect(() => restorePaperAccount(changed)).toThrow();
  }
});
it('measures bounded scalar conversion without serializing full account history', () => {
  const ctx = context(), draft = input(); draft.exits = { mode: 'multiple', levels: Array.from({ length: 4 }, (_, index) => ({ id: String(index), quantity: '10', takeProfit: { kind: 'price-percent' as const, value: '20' }, stopLoss: { kind: 'price-percent' as const, value: '20' } })) };
  Object.defineProperty(ctx.account, 'events', { enumerable: true, get: () => { throw new Error('Ticket conversion must not read history.'); } });
  const begin = performance.now(); for (let i = 0; i < 100; i++) expect(previewPaperTicket(draft, ctx).ok).toBe(true);
  console.info('PAPER_TICKET_SCALAR_WORKLOAD', JSON.stringify({ iterations: 100, levels: 4, elapsedMs: performance.now() - begin, nativeGui: false }));
});
