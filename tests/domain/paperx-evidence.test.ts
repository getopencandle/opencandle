import { describe, expect, it } from 'vitest';
import { cancelPaperOrders, closePaperPosition, configurePaperAccount, createPaperAccount, paperCancelCandidates, paperSummary, processPaperQuote, resetPaperAccount, reversePaperPosition, submitPaperOrder, type PaperAccount, type PaperResult } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';

// Evidence over existing engine behavior for the paper trading behaviour that follows our own policy. Every expectation is hand computed.
// Nothing here is a reference formula: the leaves are specified by the LV policy list in paper.ts (PAPER_POLICIES).
const make = (id: string, extra: Partial<Instrument> = {}): Instrument => ({ id, symbol: id.split(':')[1], name: 'Synthetic evidence instrument', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1, ...extra });
const X = make('T:X'), Y = make('T:Y');
const quote = (instrument: Instrument, bid: number, ask: number, sequence: number, at = 10): Quote => ({ instrumentId: instrument.id, bid, ask, eventTime: at, receivedAt: at, availableAt: at, sequence, session: 'regular', fixture: true });
const ok = (result: PaperResult) => { expect(result.ok, result.diagnostics.map(row => row.message).join(';')).toBe(true); return result.account; };
const fed = (settings: Parameters<typeof createPaperAccount>[0] = {}, instrument = X, bid = 9.99, ask = 10.01) => ok(processPaperQuote(createPaperAccount({ now: 0, ...settings }), quote(instrument, bid, ask, 1), 10, 'ordinary', instrument));

describe('PAPER.ACCOUNT.CURRENCY_RESET', () => {
  it('a reset with a new currency clears history, starts a new run and never converts', () => {
    const traded = ok(submitPaperOrder(fed(), { instrument: X, side: 'buy', type: 'market', quantity: 5 }, 10));
    const reset = resetPaperAccount(traded, { initialBalance: 5000, currency: 'EUR' }, 20);
    expect(reset).toMatchObject({ id: traded.id, name: traded.name, orders: [], fills: [], events: [], positions: {}, cash: 5000, realizedGross: 0, fees: 0 });
    expect(reset.settings).toMatchObject({ initialBalance: 5000, currency: 'EUR', leverage: traded.settings.leverage });
    expect(reset.runId).not.toBe(traded.runId);
    const usd = submitPaperOrder(reset, { instrument: X, side: 'buy', type: 'market', quantity: 1 }, 20);
    expect(usd.ok).toBe(false); expect(usd.diagnostics[0].message).toMatch(/Currency conversion is unavailable/);
    const euro = make('T:E', { currency: 'EUR' });
    const priced = ok(processPaperQuote(reset, quote(euro, 9.99, 10.01, 1, 20), 20, reset.runId, euro));
    expect(ok(submitPaperOrder(priced, { instrument: euro, side: 'buy', type: 'market', quantity: 1 }, 20)).cash).toBe(5000 - 10.01);
  });
  it('refuses a malformed currency code', () => { expect(() => resetPaperAccount(createPaperAccount({ now: 0 }), { currency: 'eur' }, 0)).toThrow(/three-letter/); });
});

describe('PAPER.ACCOUNT.LEVERAGE and PAPER.ACCOUNT.MARGIN', () => {
  const longAt = (leverage: number) => {
    let account = fed({ leverage });
    account = ok(submitPaperOrder(account, { instrument: X, side: 'buy', type: 'market', quantity: 100 }, 10));   // 100 @ 10.01
    return ok(processPaperQuote(account, quote(X, 10, 10.02, 2), 10, 'ordinary', X));                             // mark at bid 10: unrealized (10 - 10.01) * 100 = -1
  };
  it('margin is mark value over leverage and buying power scales with it', () => {
    const one = paperSummary(longAt(1), 10), four = paperSummary(longAt(4), 10);
    expect(one).toMatchObject({ unrealized: -1, equity: 99999, marginUsed: 1000, reservedMargin: 0, buyingPower: 98999 });   // (99999 - 1000) * 1
    expect(four).toMatchObject({ marginUsed: 250, buyingPower: 398996 });                                                  // (99999 - 250) * 4
  });
  it('leverage decides whether a large order fits', () => {
    const attempt = (leverage: number) => submitPaperOrder(fed({ initialBalance: 1000, leverage }), { instrument: X, side: 'buy', type: 'market', quantity: 200 }, 10).account.orders[0];
    expect(attempt(1)).toMatchObject({ status: 'rejected', rejectionReason: 'Insufficient virtual buying power at the executable quote.' });   // 200 * 9.99 = 1998 > 996
    expect(attempt(4).status).toBe('filled');                                                                                                    // 200 * 9.99 / 4 = 499.5 <= 996
  });
  it('leverage is changed in place within 1 to 100 and applies to later margin only', () => {
    const base = longAt(1);
    const four = ok(configurePaperAccount(base, { leverage: 4 }, 10));
    expect(paperSummary(four, 10).marginUsed).toBe(250); expect(four.fills).toEqual(base.fills);
    expect(configurePaperAccount(base, { leverage: 0 }, 10).ok).toBe(false);
    expect(configurePaperAccount(base, { leverage: 101 }, 10).ok).toBe(false);
    expect(configurePaperAccount(base, { leverage: 100 }, 10).ok).toBe(true);
  });
  it('a working order reserves margin and fee', () => {
    const account = ok(submitPaperOrder(fed({ leverage: 2, commission: { kind: 'fixed', value: 1.5 } }), { instrument: X, side: 'buy', type: 'limit', quantity: 10, limitPrice: 8 }, 10));
    expect(paperSummary(account, 10).reservedMargin).toBe(41.5);   // 10 * 8 / 2 + 1.5
  });
});

describe('PAPER.ORDER.CANCEL_BUY, CANCEL_SELL and CANCEL_ALL', () => {
  function book() {
    let account = ok(processPaperQuote(createPaperAccount({ now: 0 }), quote(X, 9.99, 10.01, 1), 10, 'ordinary', X));
    account = ok(submitPaperOrder(account, { instrument: X, side: 'buy', type: 'market', quantity: 10, exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 10, takeProfit: 12, stopLoss: 9 }] } }, 10));
    account = ok(processPaperQuote(account, quote(X, 9.99, 10.01, 2), 10, 'ordinary', X));                       // exit children become working
    account = ok(submitPaperOrder(account, { instrument: X, side: 'buy', type: 'limit', quantity: 1, limitPrice: 8 }, 10));
    account = ok(submitPaperOrder(account, { instrument: X, side: 'sell', type: 'limit', quantity: 2, limitPrice: 14 }, 10));
    account = ok(submitPaperOrder(account, { instrument: Y, side: 'buy', type: 'limit', quantity: 3, limitPrice: 5 }, 10));
    return account;
  }
  const active = (account: PaperAccount) => account.orders.filter(order => order.status === 'working' || order.status === 'triggered');
  it('the scope is the current instrument, optionally one side, and exit pair children are excluded', () => {
    const account = book();
    expect(active(account).some(order => order.bracket)).toBe(true);
    expect(paperCancelCandidates(account, { instrumentId: X.id }).map(order => [order.side, order.quantity])).toEqual([['buy', 1], ['sell', 2]]);
    expect(paperCancelCandidates(account, { instrumentId: X.id, side: 'buy' }).map(order => order.quantity)).toEqual([1]);
    expect(paperCancelCandidates(account, { instrumentId: X.id, side: 'sell' }).map(order => order.quantity)).toEqual([2]);
    expect(paperCancelCandidates(account, { instrumentId: Y.id }).map(order => order.quantity)).toEqual([3]);
  });
  it('cancels all matching orders in one transition and leaves other instruments, pairs and fills alone', () => {
    const account = book(), before = active(account).length;
    const after = ok(cancelPaperOrders(account, { instrumentId: X.id }, 11));
    expect(active(after).length).toBe(before - 2);
    expect(active(after).filter(order => order.instrument.id === Y.id)).toHaveLength(1);
    expect(active(after).filter(order => order.bracket)).toHaveLength(2);
    expect(after.fills).toEqual(account.fills);
    expect(after.events.filter(event => event.type === 'cancelled')).toHaveLength(2);
  });
  it('cancel buy and cancel sell touch only their side; a scope with no match fails and changes nothing', () => {
    const account = book();
    const buys = ok(cancelPaperOrders(account, { instrumentId: X.id, side: 'buy' }, 11));
    expect(paperCancelCandidates(buys, { instrumentId: X.id }).map(order => order.side)).toEqual(['sell']);
    const sells = ok(cancelPaperOrders(account, { instrumentId: X.id, side: 'sell' }, 11));
    expect(paperCancelCandidates(sells, { instrumentId: X.id }).map(order => order.side)).toEqual(['buy']);
    const none = cancelPaperOrders(buys, { instrumentId: X.id, side: 'buy' }, 12);
    expect(none.ok).toBe(false); expect(none.account).toBe(buys);
  });
});

describe('PAPER.POSITION.REVERSE', () => {
  it('is one market order for twice the position and fills as a whole', () => {
    const account = ok(submitPaperOrder(fed(), { instrument: X, side: 'buy', type: 'market', quantity: 10 }, 10));
    const reversed = ok(reversePaperPosition(account, X.id, 10));
    const fill = reversed.fills.at(-1)!;
    expect(fill).toMatchObject({ side: 'sell', quantity: 20, price: 9.99 });
    expect(reversed.positions[X.id].quantity).toBe(-10);
    expect(reversed.orders).toHaveLength(2);
    expect(fill.realizedGross).toBeCloseTo((9.99 - 10.01) * 10, 10);
  });
  it('is refused with no order created and the account unchanged when funds do not cover it', () => {
    const account = ok(submitPaperOrder(fed({ initialBalance: 1003 }), { instrument: X, side: 'buy', type: 'market', quantity: 100 }, 10));
    const result = reversePaperPosition(account, X.id, 10);
    expect(result.ok).toBe(false); expect(result.account).toBe(account);
    expect(result.diagnostics[0].message).toContain('No virtual order was created');
    expect(account.orders).toHaveLength(1);
  });
  it('has no position to reverse', () => { expect(reversePaperPosition(fed(), X.id, 10)).toMatchObject({ ok: false }); });
});

describe('PAPER.POSITION.FRACTIONAL', () => {
  it('accepts a quantity aligned to a fractional lot and refuses one that is not', () => {
    const half = make('T:F', { lotSize: 0.001 });
    const account = fed({}, half);
    const filled = ok(submitPaperOrder(account, { instrument: half, side: 'buy', type: 'market', quantity: 0.5 }, 10));
    expect(filled.positions[half.id].quantity).toBe(0.5); expect(filled.cash).toBe(100000 - 5.005);   // 0.5 * 10.01
    const off = submitPaperOrder(account, { instrument: half, side: 'buy', type: 'market', quantity: 0.0005 }, 10);
    expect(off.ok).toBe(false); expect(off.diagnostics[0].message).toMatch(/aligned to the instrument lot size/);
    expect(closePaperPosition(filled, half.id, 10, 0.2).account.positions[half.id].quantity).toBe(0.3);
  });
  it('refuses increments beyond eight decimal places instead of rounding to zero', () => {
    const tiny = make('T:T', { lotSize: 0.000000001 });
    const seeded = ok(processPaperQuote(createPaperAccount({ now: 0 }), quote(tiny, 9.99, 10.01, 1), 10));
    const result = submitPaperOrder(seeded, { instrument: tiny, side: 'buy', type: 'market', quantity: 1 }, 10);
    expect(result.ok).toBe(false); expect(result.diagnostics[0].message).toMatch(/eight decimal places/);
  });
});

describe('PAPER.EXITS.CONFLICT', () => {
  it('keeps four levels executable and refuses a fifth', () => {
    const levels = (count: number) => Array.from({ length: count }, (_, n) => ({ quantity: 2, takeProfit: 11 + n, stopLoss: 9 - n * 0.1 }));
    const request = (count: number) => submitPaperOrder(fed(), { instrument: X, side: 'buy', type: 'limit', quantity: count * 2, limitPrice: 5, exits: { schemaVersion: 1, mode: 'multiple', levels: levels(count) } }, 10);
    expect(request(4).ok).toBe(true);
    expect(request(5).ok).toBe(false);
  });
});

describe('PAPER.MANAGER.SETTINGS, UNREALIZED, POSITIONS, HISTORY', () => {
  it('settings apply to future fills only and never rewrite history', () => {
    let account = ok(submitPaperOrder(fed(), { instrument: X, side: 'buy', type: 'market', quantity: 100 }, 10));
    expect(account.fees).toBe(0);
    account = ok(configurePaperAccount(account, { commission: { kind: 'percent', value: 0.1 } }, 10));
    account = ok(closePaperPosition(account, X.id, 10, 50));
    expect(account.fills[0].commission).toBe(0); expect(account.fills[1].commission).toBeCloseTo(0.4995, 10);   // 50 * 9.99 * 0.1 / 100
    expect(account.fees).toBeCloseTo(0.4995, 10);
  });
  it('unrealized and realized profit follow the quote side', () => {
    let account = ok(submitPaperOrder(fed(), { instrument: X, side: 'buy', type: 'market', quantity: 10 }, 10));
    account = ok(processPaperQuote(account, quote(X, 12, 12.02, 2), 10, 'ordinary', X));
    expect(paperSummary(account, 10).unrealized).toBeCloseTo((12 - 10.01) * 10, 10);                          // 19.9
    account = ok(closePaperPosition(account, X.id, 10, 4));
    expect(account.realizedGross).toBeCloseTo((12 - 10.01) * 4, 10);                                          // 7.96
    expect(paperSummary(account, 10).unrealized).toBeCloseTo((12 - 10.01) * 6, 10);                           // 11.94
    expect(account.positions[X.id].quantity).toBe(6);
  });
});
