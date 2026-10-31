import { describe, expect, it } from 'vitest';
import { cancelPaperOrders, closePaperPosition, configurePaperAccount, createPaperAccount, PAPER_POLICIES, paperBarQuotePath, paperBarQuotePathOrNull, paperSlippedPrice, paperSummary, processPaperBar, processPaperQuote, restorePaperAccount, reversePaperPosition, submitPaperOrder, validatePaperAccount } from '../../src/domain/paper';
import { fixtureQuote } from '../../src/domain/fixtures';
import type { PaperAccount, PaperOrderRequest, PaperResult } from '../../src/domain/paper';
import { previewPaperTicket } from '../../src/domain/paper-ticket';
import type { Instrument, Quote } from '../../src/domain/types';

// Second independent review of paper trading. Every expected number is computed by hand in the adjacent comment.
const ins: Instrument = { id: 'R11:AAA', symbol: 'AAA', name: 'Review oracle', exchange: 'SYNTHETIC', assetClass: 'stock', currency: 'USD', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const alt: Instrument = { ...ins, id: 'R11:BBB', symbol: 'BBB' };
const quote = (bid: number, ask: number, sequence: number, at = sequence, target = ins, session: Quote['session'] = 'unknown'): Quote => ({ instrumentId: target.id, bid, ask, sequence, eventTime: at, receivedAt: at, availableAt: at, fixture: true, session });
const ok = (result: PaperResult): PaperAccount => { expect(result.ok, result.diagnostics.map(row => row.message).join(';')).toBe(true); return result.account; };
const feed = (account: PaperAccount, q: Quote, now = q.availableAt) => ok(processPaperQuote(account, q, now, account.runId, q.instrumentId === alt.id ? alt : ins));
const order = (account: PaperAccount, request: Partial<PaperOrderRequest>, now = account.clock) => submitPaperOrder(account, { instrument: ins, side: 'buy', type: 'market', quantity: 10, ...request }, now);
const working = (account: PaperAccount) => account.orders.filter(row => row.status === 'working' || row.status === 'triggered');
const marketTicket = { schemaVersion: 1 as const, side: 'buy' as const, type: 'market' as const, quantity: { kind: 'units' as const, value: '1' }, limit: null, stop: null, validity: { kind: 'day' as const }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null };

describe('C11 review: full sequence with slippage, fixed fee, leverage 2, partial close and reverse', () => {
  it('matches hand-computed cash, P&L, margin and buying power at every step', () => {
    let a = feed(createPaperAccount({ initialBalance: 10000, leverage: 2, commission: { kind: 'fixed', value: 1 }, slippageTicks: 1 }), quote(19.99, 20.01, 1));
    a = ok(order(a, { quantity: 100 }));
    // Buy 100 market: ask 20.01 + 1 tick 0.01 = 20.02. Fee 1. Cash 10000 - 2002 - 1 = 7997.
    expect(a.fills[0]).toMatchObject({ price: 20.02, quotePrice: 20.01, slippage: 0.01, commission: 1 }); expect(a.cash).toBe(7997);
    a = feed(a, quote(21.00, 21.02, 2));
    // Balance 10000 - 1 = 9999. Long marked at bid 21.00: (21.00 - 20.02) * 100 = 98. Equity 10097.
    // Margin 21.00 * 100 / 2 = 1050. Buying power (10097 - 1050) * 2 = 18094.
    expect(paperSummary(a, 2)).toMatchObject({ balance: 9999, unrealized: 98, equity: 10097, marginUsed: 1050, reservedMargin: 0, buyingPower: 18094 });
    a = ok(closePaperPosition(a, ins.id, 2, 40));
    // Partial close: sell 40 at bid 21.00 - 0.01 = 20.99, fee 1. Realized (20.99 - 20.02) * 40 = 38.80.
    // Cash 7997 + 839.60 - 1 = 8835.60. Remaining long 60 at 20.02.
    expect(a.fills[1]).toMatchObject({ price: 20.99, realizedGross: 38.8 }); expect(a.cash).toBe(8835.6);
    expect(a.positions[ins.id]).toMatchObject({ quantity: 60, averagePrice: 20.02, realizedGross: 38.8 });
    a = feed(a, quote(19.50, 19.52, 3));
    const ordersBefore = a.orders.length;
    a = ok(reversePaperPosition(a, ins.id, 3));
    // Reverse: one market sell of 120 at bid 19.50 - 0.01 = 19.49, ONE fee of 1.
    // Realized (19.49 - 20.02) * 60 = -31.80. Cash 8835.60 + 120 * 19.49 (2338.80) - 1 = 11173.40. Short 60 at 19.49.
    expect(a.orders.length).toBe(ordersBefore + 1); expect(working(a)).toEqual([]);
    expect(a.fills[2]).toMatchObject({ side: 'sell', quantity: 120, price: 19.49, commission: 1, realizedGross: -31.8, quotePrice: 19.5, slippage: 0.01 });
    expect(a.positions[ins.id]).toMatchObject({ quantity: -60, averagePrice: 19.49 }); expect(a.cash).toBe(11173.4);
    // Realized gross 38.80 - 31.80 = 7.00; fees 3; balance 10004. Short marked at ask 19.52: (19.52 - 19.49) * -60 = -1.80.
    // Equity 10002.20 (= cash 11173.40 - 60 * 19.52). Margin 19.52 * 60 / 2 = 585.60. Buying power (10002.20 - 585.60) * 2 = 18833.20.
    expect(paperSummary(a, 3)).toMatchObject({ cash: 11173.4, balance: 10004, realizedGross: 7, fees: 3, netRealized: 4, unrealized: -1.8, equity: 10002.2, marginUsed: 585.6, reservedMargin: 0, buyingPower: 18833.2 });
    a = ok(closePaperPosition(a, ins.id, 3));
    // Buy 60 to close at ask 19.52 + 0.01 = 19.53, fee 1. Realized (19.53 - 19.49) * -60 = -2.40.
    // Cash 11173.40 - 1171.80 - 1 = 10000.60 = balance 10000 + (7 - 2.40) - 4.
    expect(a.cash).toBe(10000.6); expect(paperSummary(a, 3)).toMatchObject({ balance: 10000.6, equity: 10000.6, realizedGross: 4.6, fees: 4 });
    expect(restorePaperAccount(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });
});

describe('C11 review: slippage applicability, gaps and the sell floor', () => {
  it('slips market and stop fills, never limit or stop-limit fills', () => {
    let a = feed(createPaperAccount({ slippageTicks: 2 }), quote(9.98, 10.02, 1));
    a = ok(order(a, { type: 'stop', stopPrice: 10.5 }));
    a = ok(order(a, { type: 'stop-limit', stopPrice: 10.5, limitPrice: 11.5 }));
    // Buy stop reserve uses stop + slippage: 10 * (10.50 + 0.02) = 105.20. Stop-limit reserves at its limit 11.50: 115.00. Total 220.20.
    expect(paperSummary(a, 1).reservedMargin).toBe(220.2);
    a = feed(a, quote(10.98, 11.02, 2));
    // Gap: ask 11.02 >= 10.50 triggers both. Plain stop fills 11.02 + 0.02 = 11.04 (worse than the stop).
    // Stop-limit: ask 11.02 <= limit 11.50 fills at 11.02 with no slippage fields.
    const stopFill = a.fills.find(f => a.orders.find(o => o.id === f.orderId)!.type === 'stop')!, slFill = a.fills.find(f => a.orders.find(o => o.id === f.orderId)!.type === 'stop-limit')!;
    expect(stopFill).toMatchObject({ price: 11.04, quotePrice: 11.02, slippage: 0.02 });
    expect(slFill.price).toBe(11.02); expect(slFill.slippage).toBeUndefined(); expect(slFill.quotePrice).toBeUndefined();
    a = ok(order(a, { side: 'sell', type: 'limit', limitPrice: 11.5, quantity: 5 }, 2));
    expect(a.orders.at(-1)!.status).toBe('working');
    a = feed(a, quote(12.00, 12.04, 3));
    // Gap through a sell limit 11.50: fills at bid 12.00 (better than the limit), never slipped.
    expect(a.fills.at(-1)).toMatchObject({ price: 12, quantity: 5 }); expect(a.fills.at(-1)!.slippage).toBeUndefined();
    a = ok(order(a, { side: 'sell', quantity: 5 }, 3));
    // Market sell 5: bid 12.00 - 0.02 = 11.98.
    expect(a.fills.at(-1)).toMatchObject({ price: 11.98, quotePrice: 12, slippage: 0.02 });
  });
  it('floors a slipped sell at one tick, and at the quote itself when the quote is under one tick', () => {
    let a = feed(createPaperAccount({ slippageTicks: 10 }), quote(0.05, 0.07, 1));
    a = ok(order(a, {}));
    // Buy 10 at 0.07 + 0.10 = 0.17; cash 100000 - 1.70 = 99998.30.
    expect(a.fills[0]).toMatchObject({ price: 0.17, slippage: 0.1 });
    a = ok(order(a, { side: 'sell' }, 1));
    // Sell: max(0.05 - 0.10, min(0.05, 0.01)) = 0.01; applied slippage 0.04; realized (0.01 - 0.17) * 10 = -1.60; cash 99998.30 + 0.10 = 99998.40.
    expect(a.fills[1]).toMatchObject({ price: 0.01, quotePrice: 0.05, slippage: 0.04, realizedGross: -1.6 }); expect(a.cash).toBe(99998.4);
    let sub = feed(createPaperAccount({ slippageTicks: 10 }), quote(0.005, 0.015, 1));
    sub = ok(order(sub, { side: 'sell' }));
    // Bid 0.005 is already under one tick: max(-0.095, min(0.005, 0.01)) = 0.005; applied slippage 0, so no slippage fields.
    expect(sub.fills[0].price).toBe(0.005); expect(sub.fills[0].slippage).toBeUndefined();
    expect(validatePaperAccount(JSON.parse(JSON.stringify(a))).ok).toBe(true);
  });
});

describe('C11 review: insufficient virtual funds with slippage and fees', () => {
  it('refuses a market buy whose slipped cost plus fee exceeds equity, at the exact boundary', () => {
    const start = feed(createPaperAccount({ initialBalance: 1000, commission: { kind: 'fixed', value: 5 }, slippageTicks: 4 }), quote(9.99, 10.01, 1));
    // Fill price 10.01 + 0.04 = 10.05. equity - margin = (1000 - 5) + (9.99 - 10.05)Q - 9.99Q = 995 - 10.05Q.
    // Q = 100: 995 - 1005 = -10 < 0 -> rejected, nothing booked.
    const rejected = ok(order(start, { quantity: 100 }));
    expect(rejected.orders[0]).toMatchObject({ status: 'rejected', rejectionReason: 'Insufficient virtual buying power at the executable quote.' });
    expect(rejected.cash).toBe(1000); expect(rejected.fees).toBe(0); expect(rejected.positions).toEqual({});
    // Q = 99: 995 - 994.95 = 0.05 >= 0 -> filled; cash 1000 - 994.95 - 5 = 0.05.
    const filled = ok(order(start, { quantity: 99 }));
    expect(filled.fills[0].price).toBe(10.05); expect(filled.cash).toBe(0.05);
  });
  it('reserves a working buy stop at stop plus slippage', () => {
    const start = feed(createPaperAccount({ initialBalance: 1000, slippageTicks: 4 }), quote(9.99, 10.01, 1));
    // 95 * (10.50 + 0.04) = 1001.30 > 1000 -> rejected at placement; without slippage 95 * 10.50 = 997.50 would fit.
    expect(ok(order(start, { type: 'stop', stopPrice: 10.5, quantity: 95 })).orders[0].rejectionReason).toBe('Insufficient virtual buying power to reserve this working order.');
    const noSlip = feed(createPaperAccount({ initialBalance: 1000 }), quote(9.99, 10.01, 1));
    expect(ok(order(noSlip, { type: 'stop', stopPrice: 10.5, quantity: 95 })).orders[0].status).toBe('working');
    // 94 * 10.54 = 990.76 reserved; buying power 1000 - 990.76 = 9.24.
    const fits = ok(order(start, { type: 'stop', stopPrice: 10.5, quantity: 94 }));
    expect(paperSummary(fits, 1)).toMatchObject({ reservedMargin: 990.76, buyingPower: 9.24 });
  });
});

describe('C11 review: stale quote boundary (age exactly equal to the maximum is usable)', () => {
  it('fills, previews and marks fresh at age 60; refuses at age 61', () => {
    const a = feed(createPaperAccount({ maxQuoteAgeSeconds: 60 }), quote(9.98, 10.02, 1, 100), 100);
    const ctx = (now: number) => ({ account: a, instrument: ins, quote: a.quotes[ins.id], quoteSource: { key: 'r11', state: 'ready' as const }, now });
    // 160 - 100 = 60, not > 60: usable everywhere.
    expect(ok(order(a, {}, 160)).orders[0].status).toBe('filled');
    expect(previewPaperTicket(marketTicket, ctx(160)).ok).toBe(true);
    // 161 - 100 = 61 > 60: order waits, preview refused.
    expect(ok(order(a, {}, 161)).orders[0].status).toBe('working');
    const stale = previewPaperTicket(marketTicket, ctx(161));
    expect(stale.ok).toBe(false); expect(stale.diagnostics[0].code).toBe('STALE_TICKET_QUOTE');
    const held = ok(order(a, {}, 100));
    expect(paperSummary(held, 160).staleMarks).toEqual([]); expect(paperSummary(held, 161).staleMarks).toEqual([ins.id]);
    // Reverse at the boundary fills; one second later it is refused and the very same account object returns.
    expect(ok(reversePaperPosition(held, ins.id, 160)).positions[ins.id].quantity).toBe(-10);
    const refused = reversePaperPosition(held, ins.id, 161);
    expect(refused.ok).toBe(false); expect(refused.account).toBe(held); expect(refused.diagnostics[0].code).toBe('REVERSE_NEEDS_QUOTE');
  });
  it('treats maximum age 0 as same-second only', () => {
    const a = feed(createPaperAccount({ maxQuoteAgeSeconds: 0 }), quote(9.98, 10.02, 1, 50), 50);
    expect(ok(order(a, {}, 50)).orders[0].status).toBe('filled');
    expect(ok(order(a, {}, 51)).orders[0].status).toBe('working');
  });
});

describe('C11 review: reverse never leaves a working order', () => {
  it('refuses on a session-ineligible quote and cancels exits owned by the closed exposure on success', () => {
    const ext = feed(createPaperAccount(), quote(9.98, 10.02, 1));
    const held = ok(order(ext, {}));
    // An extended-session real quote is not usable for a regular market order: reverse is refused, nothing created.
    const extQuote = { ...quote(9.98, 10.02, 2), fixture: false, session: 'extended' as const };
    const atExt = ok(processPaperQuote(held, extQuote, 2, held.runId, ins));
    const refused = reversePaperPosition(atExt, ins.id, 2);
    expect(refused.ok).toBe(false); expect(refused.account).toBe(atExt); expect(working(refused.account)).toEqual([]);
    // With TP/SL children working, a successful reverse cancels both and leaves nothing working.
    let br = ok(order(feed(createPaperAccount(), quote(9.98, 10.02, 1)), { exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 10, takeProfit: 12, stopLoss: 9 }] } }));
    br = feed(br, quote(9.98, 10.02, 2));
    expect(working(br).map(o => o.bracket?.leg)).toEqual(['tp', 'sl']);
    br = ok(reversePaperPosition(br, ins.id, 2));
    expect(br.positions[ins.id].quantity).toBe(-10); expect(working(br)).toEqual([]);
  });
  it('documents that unrelated pre-existing working orders survive a reverse (OpenCandle policy, not created by reverse)', () => {
    let a = ok(order(feed(createPaperAccount(), quote(9.98, 10.02, 1)), {}));
    a = ok(order(a, { side: 'sell', type: 'limit', limitPrice: 11, quantity: 10 }));
    a = ok(reversePaperPosition(a, ins.id, 1));
    // Short 10 now; the earlier non-reduce-only sell limit 11 is still working and would grow the short to 20 if hit.
    expect(a.positions[ins.id].quantity).toBe(-10); expect(working(a).map(o => [o.side, o.limitPrice])).toEqual([['sell', 11]]);
  });
});

describe('C11 review: scoped cancel is atomic and leaves exit pairs alone', () => {
  it('cancels every scoped non-exit order in one transition, including a parent with pending exits', () => {
    let a = feed(feed(createPaperAccount(), quote(9.98, 10.02, 1)), quote(19.98, 20.02, 1, 1, alt));
    a = ok(order(a, { exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 10, takeProfit: 12, stopLoss: 9 }] } }));
    a = feed(a, quote(9.98, 10.02, 2));
    a = ok(order(a, { type: 'limit', limitPrice: 9, exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 10, takeProfit: 11, stopLoss: 8 }] } }, 2));
    const parentId = a.orders.at(-1)!.id;
    expect(a.brackets!.pending[parentId]).toBeDefined();
    a = ok(order(a, { side: 'sell', type: 'limit', limitPrice: 15 }, 2));
    a = ok(order(a, { type: 'limit', limitPrice: 8, expiresAt: 3, timeInForce: 'GTD' }, 2));
    a = ok(submitPaperOrder(a, { instrument: alt, side: 'buy', type: 'limit', limitPrice: 15, quantity: 1 }, 2));
    const eventsBefore = a.events.length;
    const result = ok(cancelPaperOrders(a, { instrumentId: ins.id }, 3));
    // At 3 the GTD order (expiresAt 3) expires first; the parent and the sell limit are cancelled; exits and the other symbol stay.
    const byId = (id: string) => result.orders.find(o => o.id === id)!;
    expect(byId(parentId).status).toBe('cancelled'); expect(result.brackets!.pending[parentId]).toBeUndefined();
    expect(result.orders.filter(o => o.limitPrice === 8 && !o.bracket)[0].status).toBe('expired');
    expect(working(result).map(o => o.bracket?.leg ?? o.instrument.id)).toEqual(['tp', 'sl', alt.id]);
    // Events: 1 expired + 2 cancelled = 3 new events.
    expect(result.events.length - eventsBefore).toBe(3);
    // Input account is untouched (no partial mutation).
    expect(working(a).length).toBe(6);
  });
  it('rejects invalid scopes without changing the account', () => {
    const a = ok(order(feed(createPaperAccount(), quote(9.98, 10.02, 1)), { type: 'limit', limitPrice: 9 }));
    for (const scope of [{ instrumentId: '' }, { instrumentId: ins.id, side: 'both' as never }, { instrumentId: '__proto__' }]) {
      const r = cancelPaperOrders(a, scope, 1); expect(r.ok).toBe(false); expect(r.account).toBe(a);
    }
    expect(cancelPaperOrders(a, { instrumentId: ins.id, side: 'sell' }, 1).diagnostics[0].code).toBe('NO_MATCHING_ORDERS');
  });
});

describe('C11 review: bar-to-quote helper', () => {
  const bar = (open: number, high: number, low: number, close: number, time = 100) => ({ time, open, high, low, close });
  const path = (b: ReturnType<typeof bar>, policy: 'close-only' | 'open-proximity', firstSequence = 2, halfSpread = 0.01) => paperBarQuotePath({ instrumentId: ins.id, bar: b, firstSequence, halfSpread, policy, fixture: true, session: 'unknown', availableAt: 160 });
  it('orders an exactly equidistant bar open, high, low, close and collapses equal neighbours', () => {
    // |H-O| = |O-L| = 0.50: tie goes to the high first.
    expect(path(bar(10, 10.5, 9.5, 10.2), 'open-proximity', 7, 0).map(q => [q.bid, q.sequence])).toEqual([[10, 7], [10.5, 8], [9.5, 9], [10.2, 10]]);
    // Open equals low: distance to low 0 < 0.5, so O, L, H, C; O and L collapse.
    expect(path(bar(10, 10.5, 10, 10.2), 'open-proximity', 1, 0).map(q => q.bid)).toEqual([10, 10.5, 10.2]);
    expect(path(bar(10, 10.5, 9.5, 10.2), 'close-only', 1, 0).map(q => q.bid)).toEqual([10.2]);
    expect(path(bar(10, 10.5, 9.5, 10.2), 'close-only').every(q => q.availableAt === 160 && q.eventTime === 100)).toBe(true);
  });
  it('fills a gapped stop at the first path quote under open-proximity, at the close under close-only, plus slippage', () => {
    let a = ok(order(feed(createPaperAccount({ slippageTicks: 2 }), quote(9.98, 10.02, 1)), {}));
    a = ok(order(a, { side: 'sell', type: 'stop', stopPrice: 9.5 }));
    const b = bar(9, 9.2, 8.8, 9.1);
    let op = a; for (const q of path(b, 'open-proximity')) op = feed(op, q, 160);
    // Tie (0.20 each side): O, H, L, C. First quote bid 9.00 - 0.01 = 8.99 <= stop 9.50; fill 8.99 - 0.02 = 8.97.
    expect(op.fills[1]).toMatchObject({ price: 8.97, quotePrice: 8.99, quoteSequence: 2 });
    let co = a; for (const q of path(b, 'close-only')) co = feed(co, q, 160);
    // Close-only: only bid 9.10 - 0.01 = 9.09; fill 9.07 (better than the open, an artifact of ignoring the open).
    expect(co.fills[1]).toMatchObject({ price: 9.07, quotePrice: 9.09 });
  });
  it('treats intrabar extremes as discrete jumps: a take profit inside the bar range fills at the extreme, not at its limit', () => {
    let a = ok(order(feed(createPaperAccount(), quote(9.99, 10.01, 1)), { exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 10, takeProfit: 10.5 }] } }));
    // Low distance 0.10 < high distance 1.00: O 10, L 9.9, H 11, C 10.6. Only the H point reaches TP 10.50; bid there 10.99.
    for (const q of paperBarQuotePath({ instrumentId: ins.id, bar: bar(10, 11, 9.9, 10.6), firstSequence: 2, halfSpread: 0.01, policy: 'open-proximity', fixture: true, session: 'unknown', availableAt: 160 })) a = feed(a, q, 160);
    // First review (M1) pinned this: raw path quotes fed one by one are discrete jumps, so TP 10.50 fills at 10.99, realized
    // (10.99 - 10.01) * 10 = 9.80. After the fix this raw behaviour is retained but DISCLOSED; processPaperBar (re-review block below) fills at 10.50.
    expect(a.fills[1]).toMatchObject({ price: 10.99, realizedGross: 9.8 }); expect(a.fills[1].intrabar).toBeUndefined();
    expect(PAPER_POLICIES.join(' ')).toMatch(/Intrabar ordering/);
    expect(PAPER_POLICIES.join(' ')).toMatch(/discrete jumps/);
    expect(PAPER_POLICIES.join(' ')).toMatch(/does not claim parity/);
  });
});

describe('C11 review: persistence and restore validation', () => {
  it('restores a literal legacy schema-1 synthetic account without adding slippage fields', () => {
    // Hand-authored legacy data and arithmetic, not output from the implementation under test or a copied baseline runtime.
    // This uses the optional-brackets-absent schema supported at checkpoint 4519. It is not claimed to be a captured export.
    // Buy 10 at 10.02, close 4 at 9.98, plus an unfilled buy limit. Fees are 0.1002 + 0.03992; realized gross is -0.16.
    const b: PaperAccount = {
      schemaVersion: 1, id: 'local-paper', name: 'SYNTHETIC legacy arithmetic fixture', mode: 'paper', runId: 'ordinary', virtual: true,
      createdAt: 0, clock: 1, settings: { initialBalance: 100000, currency: 'USD', leverage: 1, commission: { kind: 'percent', value: 0.1 }, maxQuoteAgeSeconds: 60, oneClick: false },
      cash: 99939.57988, realizedGross: -0.16, fees: 0.14012,
      positions: { [ins.id]: { instrument: ins, quantity: 6, averagePrice: 10.02, realizedGross: -0.16 } },
      orders: [
        { id: 'local-paper:order:1', instrument: ins, side: 'buy', type: 'market', quantity: 10, timeInForce: 'GTC', submissionSequence: 1, status: 'filled', createdAt: 1, updatedAt: 1, filledQuantity: 10, averageFillPrice: 10.02 },
        { id: 'local-paper:order:5', instrument: ins, side: 'buy', type: 'limit', limitPrice: 9, quantity: 5, timeInForce: 'GTC', submissionSequence: 5, status: 'working', createdAt: 1, updatedAt: 1, filledQuantity: 0, averageFillPrice: null },
        { id: 'local-paper:order:7', instrument: ins, side: 'sell', type: 'market', quantity: 4, reduceOnly: true, timeInForce: 'GTC', submissionSequence: 7, status: 'filled', createdAt: 1, updatedAt: 1, filledQuantity: 4, averageFillPrice: 9.98 },
      ],
      fills: [
        { id: 'local-paper:fill:3', orderId: 'local-paper:order:1', instrumentId: ins.id, side: 'buy', quantity: 10, price: 10.02, commission: 0.1002, realizedGross: 0, at: 1, quoteEventTime: 1, quoteSequence: 1, fixture: true },
        { id: 'local-paper:fill:9', orderId: 'local-paper:order:7', instrumentId: ins.id, side: 'sell', quantity: 4, price: 9.98, commission: 0.03992, realizedGross: -0.16, at: 1, quoteEventTime: 1, quoteSequence: 1, fixture: true },
      ],
      events: [
        { id: 2, at: 1, type: 'submitted', orderId: 'local-paper:order:1', message: 'Synthetic buy submitted.' },
        { id: 4, at: 1, type: 'filled', orderId: 'local-paper:order:1', message: 'Synthetic buy filled at 10.02.' },
        { id: 6, at: 1, type: 'submitted', orderId: 'local-paper:order:5', message: 'Synthetic limit submitted.' },
        { id: 8, at: 1, type: 'submitted', orderId: 'local-paper:order:7', message: 'Synthetic partial close submitted.' },
        { id: 10, at: 1, type: 'filled', orderId: 'local-paper:order:7', message: 'Synthetic close filled at 9.98.' },
      ],
      quotes: { [ins.id]: { instrumentId: ins.id, bid: 9.98, ask: 10.02, sequence: 1, eventTime: 1, receivedAt: 1, availableAt: 1, fixture: true, session: 'unknown' } }, commands: {}, nextId: 11,
    };
    const json = JSON.parse(JSON.stringify(b));
    expect('slippageTicks' in json.settings).toBe(false);
    const restored = restorePaperAccount(json);
    expect(restored).toEqual(b);
    // Buy 10 at 10.02, fee 0.1002; sell 4 at 9.98, fee 0.03992. Cash 100000 - 100.20 - 0.1002 + 39.92 - 0.03992 = 99939.57988.
    expect(restored.cash).toBe(99939.57988);
    // Lane engine continues the legacy account with zero slippage.
    const next = ok(processPaperQuote(restored, quote(9.98, 10.02, 2), 2, restored.runId, ins));
    expect(ok(submitPaperOrder(next, { instrument: ins, side: 'sell', type: 'market', quantity: 6, reduceOnly: true }, 2)).fills.at(-1)!.slippage).toBeUndefined();
  });
  it('rejects tampered or partial slippage settings and fill fields', () => {
    let a = feed(createPaperAccount({ slippageTicks: 3 }), quote(9.98, 10.02, 1));
    a = ok(order(a, {}));
    a = ok(order(a, { side: 'sell', type: 'limit', limitPrice: 9.98 }));
    const clean = JSON.parse(JSON.stringify(a));
    expect(validatePaperAccount(clean).ok).toBe(true);
    const mutate = (fn: (x: any) => void) => { const x = JSON.parse(JSON.stringify(a)); fn(x); return validatePaperAccount(x).ok; };
    for (const bad of [-1, 1.5, '2', null, 10001, Number.MAX_SAFE_INTEGER]) expect(mutate(x => { x.settings.slippageTicks = bad; })).toBe(false);
    expect(mutate(x => { x.settings.slippageTicks = 10000; })).toBe(true);
    expect(mutate(x => { delete x.fills[0].quotePrice; })).toBe(false);
    expect(mutate(x => { delete x.fills[0].slippage; })).toBe(false);
    expect(mutate(x => { x.fills[0].slippage = 0; })).toBe(false);
    // Favourable sign: buy price 10.05 with quote 10.08 and slippage 0.03 would be price = quote - slippage.
    expect(mutate(x => { x.fills[0].quotePrice = 10.08; })).toBe(false);
    expect(mutate(x => { x.fills[1].quotePrice = 10; x.fills[1].slippage = 0.02; })).toBe(false);
    // Unverifiable by design: removing BOTH fields from a slipped fill still restores (price stays authoritative).
    expect(mutate(x => { delete x.fills[0].quotePrice; delete x.fills[0].slippage; })).toBe(true);
    expect(configurePaperAccount(a, { slippageTicks: 2.5 }, 1).diagnostics[0].code).toBe('INVALID_SETTINGS');
  });
});

describe('C11 re-review: processPaperBar intrabar semantics (hand oracles)', () => {
  const bar = (open: number, high: number, low: number, close: number, time = 100) => ({ time, open, high, low, close });
  const barOptions = (b: ReturnType<typeof bar>, firstSequence = 2) => ({ instrumentId: ins.id, bar: b, firstSequence, halfSpread: 0.01, policy: 'open-proximity' as const, fixture: true, session: 'unknown' as const, availableAt: 160, now: 160, executionInstrument: ins });
  const runBar = (account: PaperAccount, b: ReturnType<typeof bar>, firstSequence = 2) => ok(processPaperBar(account, barOptions(b, firstSequence)));
  const opened = (settings: Parameters<typeof createPaperAccount>[0] = {}, extra: Partial<PaperOrderRequest> = {}) => ok(order(feed(createPaperAccount(settings), quote(9.99, 10.01, 1)), extra));
  it('take profit crossed inside the bar fills at its limit 10.50, not the extreme', () => {
    // Path O10, L9.9, H11, C10.6 (low distance 0.10 < high 1.00). Bids 9.99, 9.89, 10.99, 10.59.
    // TP sell limit 10.50 lies inside the L->H bid segment [9.89, 10.99]: fill 10.50, realized (10.50 - 10.01) * 10 = 4.90.
    const a = runBar(opened({}, { exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 10, takeProfit: 10.5 }] } }), bar(10, 11, 9.9, 10.6));
    expect(a.fills[1]).toMatchObject({ price: 10.5, realizedGross: 4.9, intrabar: true }); expect(a.fills[1].slippage).toBeUndefined();
    expect(a.positions[ins.id]).toBeUndefined();
    // Idempotent: the same bar again returns the very same account object.
    expect(processPaperBar(a, barOptions(bar(10, 11, 9.9, 10.6))).account).toBe(a);
  });
  it('intrabar stop fills at the stop less slippage; adverse open gap fills at the open bid less slippage', () => {
    // Entry with 2 ticks: 10.01 + 0.02 = 10.03.
    const inside = runBar(ok(order(opened({ slippageTicks: 2 }), { side: 'sell', type: 'stop', stopPrice: 9.5 })), bar(10, 10.2, 9.4, 9.8));
    // O,H,L,C (high 0.20 < low 0.60). H->L bid segment [9.39, 10.19] contains 9.50: fill 9.50 - 0.02 = 9.48; realized (9.48 - 10.03) * 10 = -5.50.
    expect(inside.fills[1]).toMatchObject({ price: 9.48, quotePrice: 9.5, slippage: 0.02, intrabar: true, realizedGross: -5.5 });
    const gap = runBar(ok(order(opened({ slippageTicks: 2 }), { side: 'sell', type: 'stop', stopPrice: 9.5 })), bar(9.2, 9.3, 9.0, 9.1));
    // Open bid 9.19 already below the stop: gap point, quote-side fill 9.19 - 0.02 = 9.17, not intrabar; realized (9.17 - 10.03) * 10 = -8.60.
    expect(gap.fills[1]).toMatchObject({ price: 9.17, quotePrice: 9.19, realizedGross: -8.6 }); expect(gap.fills[1].intrabar).toBeUndefined();
  });
  it('favourable open gap fills a buy limit at the open ask; a limit reached later fills at its own price', () => {
    const start = feed(createPaperAccount(), quote(9.99, 10.01, 1));
    // O9.50: ask 9.51 <= limit 9.60 at the gap point -> 9.51 (better than the limit), not intrabar.
    const gapFill = runBar(ok(order(start, { type: 'limit', limitPrice: 9.6 })), bar(9.5, 9.7, 9.4, 9.6));
    expect(gapFill.fills[0].price).toBe(9.51); expect(gapFill.fills[0].intrabar).toBeUndefined();
    // Limit 9.45: open ask 9.51 too high; O->L ask segment [9.41, 9.51] contains 9.45 -> 9.45 intrabar.
    const later = runBar(ok(order(start, { type: 'limit', limitPrice: 9.45 })), bar(9.5, 9.7, 9.4, 9.6));
    expect(later.fills[0]).toMatchObject({ price: 9.45, intrabar: true });
  });
  it('marketable stop-limit fills at its stop; a non-marketable one stays triggered; raw quotes leave the marketable one triggered', () => {
    const start = feed(createPaperAccount({ slippageTicks: 3 }), quote(9.99, 10.01, 1));
    const b = bar(10, 11, 9.9, 10.6);
    // L->H ask segment [9.91, 11.01] contains stop 10.50 and stop <= limit 10.60: fill 10.50, never slipped.
    const m = runBar(ok(order(start, { type: 'stop-limit', stopPrice: 10.5, limitPrice: 10.6 })), b);
    expect(m.fills[0]).toMatchObject({ price: 10.5, intrabar: true }); expect(m.fills[0].slippage).toBeUndefined();
    // Limit 10.40 below the stop: triggered at H; H->C ask segment [10.61, 11.01] never reaches 10.40.
    const n = runBar(ok(order(start, { type: 'stop-limit', stopPrice: 10.5, limitPrice: 10.4 })), b);
    expect(n.fills).toEqual([]); expect(n.orders[0].status).toBe('triggered');
    let raw = ok(order(start, { type: 'stop-limit', stopPrice: 10.5, limitPrice: 10.6 }));
    for (const q of paperBarQuotePath({ instrumentId: ins.id, bar: b, firstSequence: 2, halfSpread: 0.01, policy: 'open-proximity', fixture: true, session: 'unknown', availableAt: 160 })) raw = feed(raw, q, 160);
    // Raw: H ask 11.01 > 10.60, C ask 10.61 > 10.60 -> triggered, unfilled.
    expect(raw.fills).toEqual([]); expect(raw.orders[0].status).toBe('triggered');
  });
  it('bar touching both TP and SL: the extreme nearer the open wins (high on a tie); the other leg is cancelled', () => {
    const exits = { exits: { schemaVersion: 1 as const, mode: 'single' as const, levels: [{ quantity: 10, takeProfit: 10.5, stopLoss: 9.5 }] } };
    // Tie 0.60/0.60 -> O,H,L,C: TP at 10.50 first, realized 4.90.
    const tie = runBar(opened({}, exits), bar(10, 10.6, 9.4, 10));
    expect(tie.fills[1]).toMatchObject({ price: 10.5, realizedGross: 4.9 }); expect(tie.orders.find(o => o.bracket?.leg === 'sl')!.status).toBe('cancelled');
    // Low nearer (0.60 < 0.70) -> SL at 9.50 first, realized (9.50 - 10.01) * 10 = -5.10.
    const low = runBar(opened({}, exits), bar(10, 10.7, 9.4, 10));
    expect(low.fills[1]).toMatchObject({ price: 9.5, realizedGross: -5.1, intrabar: true }); expect(low.orders.find(o => o.bracket?.leg === 'tp')!.status).toBe('cancelled');
    expect(PAPER_POLICIES.join(' ')).toMatch(/nearer the open, high on a tie/);
  });
  it('documents (low finding) that exits of an entry filled inside a bar ignore the rest of that segment', () => {
    // Buy limit 9.95 with SL 9.50. Path O10,H10.2,L9.0,C9.8. H->L ask segment [9.01, 10.21] fills entry at 9.95 intrabar.
    // Price then continued to 9.00 in the same segment, below SL 9.50, but children activate only from the next point; C bid 9.79 > 9.50.
    const a = runBar(ok(order(feed(createPaperAccount(), quote(9.99, 10.01, 1)), { type: 'limit', limitPrice: 9.95, exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 10, stopLoss: 9.5 }] } })), bar(10, 10.2, 9.0, 9.8));
    expect(a.fills).toHaveLength(1); expect(a.fills[0]).toMatchObject({ price: 9.95, intrabar: true });
    expect(a.positions[ins.id].quantity).toBe(10); expect(working(a).map(o => o.bracket?.leg)).toEqual(['sl']);
  });
  it('restores processPaperBar fills and rejects a tampered intrabar flag', () => {
    const a = runBar(ok(order(opened({ slippageTicks: 2 }), { side: 'sell', type: 'stop', stopPrice: 9.5 })), bar(10, 10.2, 9.4, 9.8));
    expect(restorePaperAccount(JSON.parse(JSON.stringify(a)))).toEqual(a);
    const t1 = JSON.parse(JSON.stringify(a)); t1.fills[1].intrabar = false; expect(validatePaperAccount(t1).ok).toBe(false);
    const t2 = JSON.parse(JSON.stringify(a)); t2.fills[0].intrabar = true; expect(validatePaperAccount(t2).ok).toBe(false);
  });
});

describe('C11 re-review: L1 reverse rejection, L2 render-safe path, fee estimate', () => {
  it('REVERSE_REJECTED returns the same account with no order row', () => {
    let a = ok(order(feed(createPaperAccount({ initialBalance: 1000 }), quote(9.98, 10.02, 1)), { quantity: 98 }));
    a = ok(configurePaperAccount(a, { commission: { kind: 'fixed', value: 15 } }, 1));
    // Equity after reversal 1000 - 3.92 - 15 - 3.92 = 977.16 < margin 10.02 * 98 = 981.96 -> refused.
    const r = reversePaperPosition(a, ins.id, 1);
    expect(r.ok).toBe(false); expect(r.account).toBe(a); expect(r.diagnostics[0].code).toBe('REVERSE_REJECTED');
    expect(r.account.orders).toHaveLength(1); expect(r.account.positions[ins.id].quantity).toBe(98);
  });
  it('paperBarQuotePathOrNull never throws and fixtureCents matches fixtureQuote exactly', () => {
    expect(paperBarQuotePathOrNull({ instrumentId: ins.id, bar: { time: 1, open: 1, high: 0.5, low: 1, close: 1 }, firstSequence: 1, halfSpread: 0.01, policy: 'close-only', fixture: true, session: 'unknown', availableAt: 1 })).toBeNull();
    expect(paperBarQuotePathOrNull({ instrumentId: ins.id, bar: { time: 1, open: 0.01, high: 0.01, low: 0.01, close: 0.01 }, firstSequence: 1, halfSpread: 0.01, policy: 'close-only', fixture: true, session: 'unknown', availableAt: 1 })).toBeNull();
    for (const close of [12.345, 7.005, 100, 0.02, 0.01, 0.005, 1.115, 0.0001]) {
      const b = { time: 500, open: close, high: close, low: close, close };
      const path = paperBarQuotePathOrNull({ instrumentId: ins.id, bar: b, firstSequence: 9, halfSpread: 0.01, policy: 'close-only', fixture: true, session: 'unknown', availableAt: 500, fixtureCents: true });
      expect(path, String(close)).not.toBeNull(); expect(path![0]).toEqual(fixtureQuote(ins.id, { ...b, volume: 0 }, 9));
    }
  });
  it('fee estimate basis applies slippage with the execution floor', () => {
    const s = createPaperAccount({ slippageTicks: 3 }).settings;
    // Buy market 10.02 + 0.03 = 10.05; sell market 0.02 - 0.03 floored at 0.01; limit unchanged; stop sell 9.50 - 0.03 = 9.47.
    expect(paperSlippedPrice(s, { type: 'market', side: 'buy', instrument: ins }, 10.02)).toBe(10.05);
    expect(paperSlippedPrice(s, { type: 'market', side: 'sell', instrument: ins }, 0.02)).toBe(0.01);
    expect(paperSlippedPrice(s, { type: 'limit', side: 'buy', instrument: ins }, 10.02)).toBe(10.02);
    expect(paperSlippedPrice(s, { type: 'stop', side: 'sell', instrument: ins }, 9.5)).toBe(9.47);
  });
});
