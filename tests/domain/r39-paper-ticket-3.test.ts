import { describe, expect, it } from 'vitest';
import { createPaperAccount, modifyPaperOrder, PAPER_POLICIES, processPaperQuote, submitPaperOrder, validatePaperAccount, type PaperAccount } from '../../src/domain/paper';
import { blankBrokerDraft, brokerTicketInput, placeBrokerTicket, type BrokerTicketDraft } from '../../src/domain/paper-broker-ticket';
import { materializePaperTicket, previewPaperTicket, validatePaperTicketInput, validatePaperTicketRecord, type PaperTicketInput } from '../../src/domain/paper-ticket';
import type { Instrument, Quote } from '../../src/domain/types';

// A real GTC validity in the ticket record, the paper.ts policy text, and Take profit outside regular hours
// on the Buy/Sell ticket. Synthetic instrument and quotes, virtual money only.
const instrument: Instrument = { id: 'SYNTHETIC:TICKET3', symbol: 'TK3', name: 'Synthetic ticket three', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const NOW = 1000;
const quote: Quote = { instrumentId: instrument.id, bid: 99.99, ask: 100.01, sequence: 1, eventTime: NOW, receivedAt: NOW, availableAt: NOW, fixture: true, session: 'regular' };
const source = { key: 'synthetic ticket three source', state: 'ready' as const };
const funded = (): PaperAccount => { const account = createPaperAccount({ initialBalance: 100000, now: NOW }); return processPaperQuote(account, quote, NOW, account.runId, instrument).account; };
const context = (account = funded(), editOrderId?: string) => ({ account, instrument, quote, quoteSource: source, now: NOW, ...(editOrderId ? { editOrderId } : {}) });
const limitInput = (validity: PaperTicketInput['validity'], changes: Partial<PaperTicketInput> = {}): PaperTicketInput => ({ schemaVersion: 1, side: 'buy', type: 'limit', quantity: { kind: 'units', value: '5' }, limit: { kind: 'price', value: '95' }, stop: null, validity, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null, ...changes });
let commandSerial = 0;
function place(input: PaperTicketInput, account = funded()) {
  const ctx = context(account), preview = previewPaperTicket(input, ctx);
  if (!preview.ok) throw new Error(preview.diagnostics[0].message);
  const built = materializePaperTicket(preview.value, input, ctx);
  if (!built.ok) throw new Error(built.diagnostics[0].message);
  const result = submitPaperOrder(account, { ...built.value, commandId: `r39-pt3-${++commandSerial}` }, NOW);
  if (!result.ok) throw new Error(result.diagnostics[0].message);
  return { preview: preview.value, request: built.value, account: result.account, order: result.account.orders.find(order => order.id === result.orderId)! };
}
const draft = (changes: Partial<BrokerTicketDraft> = {}): BrokerTicketDraft => ({ ...blankBrokerDraft('buy'), quantity: '10', ...changes });

describe('the ticket record has a GTC validity', () => {
  it('validates { kind: "gtc" } and refuses extra fields on it', () => {
    expect(validatePaperTicketInput(limitInput({ kind: 'gtc' })).validity).toEqual({ kind: 'gtc' });
    expect(() => validatePaperTicketInput(limitInput({ kind: 'gtc', expiresAt: 5 } as never))).toThrow(/GTC validity has missing or unsupported fields/);
  });
  it('previews as GTC and materializes as GTC with no expiry and a GTC ticket record', () => {
    const { preview, request, order } = place(limitInput({ kind: 'gtc' }));
    expect(preview.validity).toEqual({ kind: 'gtc' });
    expect(request.timeInForce).toBe('GTC');
    expect('expiresAt' in request).toBe(false);
    expect(order).toMatchObject({ timeInForce: 'GTC', status: 'working' });
    expect(order.expiresAt).toBeUndefined();
    expect(order.ticket?.input.validity).toEqual({ kind: 'gtc' });
    expect(validatePaperTicketRecord(order.ticket).input.validity).toEqual({ kind: 'gtc' });
  });
  it('the engine refuses a GTC ticket record on a Day or GTD order', () => {
    const { request } = place(limitInput({ kind: 'gtc' }));
    const day = submitPaperOrder(funded(), { ...request, timeInForce: 'DAY', expiresAt: NOW + 3600 }, NOW);
    expect(day.ok).toBe(false);
    expect(day.diagnostics.map(row => row.message).join(' ')).toContain('Ticket provenance says GTC but the order has another time in force or an expiry.');
  });
  it('editing keeps the time in force: GTC is accepted on a GTC order and refused on a Day order', () => {
    const gtc = place(limitInput({ kind: 'gtc' }));
    const edit = limitInput({ kind: 'gtc' }, { quantity: { kind: 'units', value: '6' } }), editContext = context(gtc.account, gtc.order.id);
    const preview = previewPaperTicket(edit, editContext);
    expect(preview.ok).toBe(true);
    const built = materializePaperTicket((preview as any).value, edit, editContext);
    if (!built.ok) throw new Error(built.diagnostics[0].message);
    const modified = modifyPaperOrder(gtc.account, gtc.order.id, { quantity: built.value.quantity, limitPrice: built.value.limitPrice, expiresAt: built.value.expiresAt, extendedHours: built.value.extendedHours, ticket: built.value.ticket }, NOW);
    expect(modified.ok).toBe(true);
    expect(modified.account.orders.find(order => order.id === gtc.order.id)).toMatchObject({ quantity: 6, timeInForce: 'GTC' });
    const day = place(limitInput({ kind: 'day' }));
    const refused = previewPaperTicket(limitInput({ kind: 'gtc' }), context(day.account, day.order.id));
    expect(refused.ok).toBe(false);
    expect(refused.diagnostics[0]).toMatchObject({ code: 'GTC_CONVERSION_REQUIRES_NEW_ORDER' });
  });
});

describe('migration: saved accounts from before GTC records restore unchanged', () => {
  // A save made before this lane: Day and explicit-expiry tickets carry records, a GTC order (or a low-level
  // request) carries none, and a retained-expiry edit carries retain-existing. JSON round trip as the workspace store does.
  function savedBeforeLane(): unknown {
    let account = place(limitInput({ kind: 'day' })).account;
    account = place(limitInput({ kind: 'manual-expiry', expiresAt: NOW + 7200 }), account).account;
    account = submitPaperOrder(account, { instrument, side: 'buy', type: 'limit', quantity: 2, limitPrice: 90, timeInForce: 'GTC' }, NOW).account;
    const gtd = account.orders[1], retained = limitInput({ kind: 'retain-existing', orderId: gtd.id }, { quantity: { kind: 'units', value: '4' } }), ctx = context(account, gtd.id);
    const preview = previewPaperTicket(retained, ctx); if (!preview.ok) throw new Error(preview.diagnostics[0].message);
    const built = materializePaperTicket(preview.value, retained, ctx); if (!built.ok) throw new Error(built.diagnostics[0].message);
    account = modifyPaperOrder(account, gtd.id, { quantity: built.value.quantity, limitPrice: built.value.limitPrice, expiresAt: built.value.expiresAt, extendedHours: built.value.extendedHours, ticket: built.value.ticket }, NOW).account;
    for (const order of account.orders) expect(order.ticket?.input.validity.kind ?? 'none').not.toBe('gtc');
    return JSON.parse(JSON.stringify(account));
  }
  it('every older validity kind restores, and the restored account equals the save byte for byte', () => {
    const saved = savedBeforeLane(), text = JSON.stringify(saved);
    const restored = validatePaperAccount(saved);
    expect(restored.errors).toEqual([]);
    expect(restored.ok).toBe(true);
    expect(JSON.stringify(restored.account)).toBe(text);
    const kinds = (restored.account as PaperAccount).orders.map(order => [order.timeInForce, order.ticket?.input.validity.kind ?? null]);
    expect(kinds).toEqual([['DAY', 'day'], ['GTD', 'retain-existing'], ['GTC', null]]);
  });
  it('a save with a GTC ticket record restores and round trips too', () => {
    const saved = JSON.parse(JSON.stringify(place(limitInput({ kind: 'gtc' })).account));
    const restored = validatePaperAccount(saved);
    expect(restored.ok).toBe(true);
    expect(JSON.stringify(restored.account)).toBe(JSON.stringify(saved));
    expect((restored.account as PaperAccount).orders[0].ticket?.input.validity).toEqual({ kind: 'gtc' });
  });
  it('a hand-edited save that pairs a GTC record with a Day order is refused', () => {
    const saved = JSON.parse(JSON.stringify(place(limitInput({ kind: 'gtc' })).account));
    saved.orders[0].timeInForce = 'DAY'; saved.orders[0].expiresAt = NOW + 3600;
    expect(validatePaperAccount(saved).ok).toBe(false);
  });
});

describe('the Buy/Sell ticket records GTC as GTC', () => {
  it('GTC previews and places with a GTC ticket record (no longer Day without a record)', () => {
    expect(brokerTicketInput(draft({ tab: 'limit', price: '95', duration: 'gtc' }), 'USD').validity).toEqual({ kind: 'gtc' });
    const result = placeBrokerTicket(draft({ tab: 'limit', price: '95', duration: 'gtc' }), context(), 'cmd-pt3');
    if (!result.ok) throw new Error(result.message);
    const order = result.account.orders.at(-1)!;
    expect(order).toMatchObject({ timeInForce: 'GTC' });
    expect(order.expiresAt).toBeUndefined();
    expect(order.ticket?.input.validity).toEqual({ kind: 'gtc' });
    expect(order.ticket?.sizing.quantity).toBe(10);
  });
  it('Day and GTD are unchanged', () => {
    expect(brokerTicketInput(draft(), 'USD').validity).toEqual({ kind: 'day' });
    expect(brokerTicketInput(draft({ duration: 'gtd', expiresAt: '2026-10-24T16:00' }), 'USD').validity).toEqual({ kind: 'manual-expiry', expiresAt: Date.UTC(2026, 9, 24, 16) / 1000 });
  });
});

describe('Take profit outside regular hours on the Buy/Sell ticket', () => {
  it('is off by default, and on only with a take profit', () => {
    expect(brokerTicketInput(draft({ takeProfit: '105' }), 'USD').takeProfitOutsideRth).toBe(false);
    expect(brokerTicketInput(draft({ takeProfit: '105', takeProfitOutsideRth: true }), 'USD').takeProfitOutsideRth).toBe(true);
    expect(brokerTicketInput(draft({ stopLoss: '95', takeProfitOutsideRth: true }), 'USD').takeProfitOutsideRth).toBe(false);
  });
  it('places a version-2 session policy with take profit outside regular hours, so the take-profit child may fill in extended hours', () => {
    const result = placeBrokerTicket(draft({ takeProfit: '105', stopLoss: '95', takeProfitOutsideRth: true }), context(), 'cmd-pt3-tp');
    if (!result.ok) throw new Error(result.message);
    const parent = result.account.orders.find(order => !order.bracket)!;
    expect(parent.sessionPolicy).toEqual({ schemaVersion: 2, entryOutsideRth: false, takeProfitOutsideRth: true });
    expect(parent.ticket?.input.takeProfitOutsideRth).toBe(true);
    // Exits activate on the next distinct quote; the take-profit child carries extended hours, the stop loss does not.
    const next = processPaperQuote(result.account, { ...quote, sequence: 2, eventTime: NOW + 1, receivedAt: NOW + 1, availableAt: NOW + 1 }, NOW + 1, result.account.runId, instrument).account;
    const children = next.orders.filter(order => order.bracket && order.status === 'working');
    expect(children.map(order => [order.bracket!.leg, order.extendedHours]).sort()).toEqual([['sl', false], ['tp', true]]);
  });
});

describe('paper.ts policy text matches the behaviour', () => {
  const text = PAPER_POLICIES.join(' ');
  it('drops the stale legacy GTC and early-close lines', () => {
    expect(text).not.toContain('Low-level legacy GTC requests remain supported and labeled.');
    expect(text).not.toContain('Early-close days use the ordinary close until the market-hours calendar exposes them.');
  });
  it('states the early-close rule and GTC as a ticket choice', () => {
    const day = PAPER_POLICIES.find(row => row.startsWith('New OpenCandle tickets default to Day'))!;
    expect(day).toContain('16:00 New York time for regular-hours orders, 20:00 for extended-hours orders');
    expect(day).toContain('On NYSE early-close days the close is 13:00 New York time, 17:00 for extended-hours orders.');
    expect(day).toContain('GTC (good till cancelled) is a ticket choice: the order has no expiry and stays working until it fills or is cancelled.');
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });
});
