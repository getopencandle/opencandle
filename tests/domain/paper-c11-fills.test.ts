import { describe, expect, it } from 'vitest';
import { cancelPaperOrder, cancelPaperOrders, closePaperPosition, configurePaperAccount, createPaperAccount, modifyPaperOrder, PAPER_POLICIES, paperBarQuotePath, paperBarQuotePathOrNull, paperCancelCandidates, paperFeeFor, paperSlippedPrice, paperSummary, processPaperBar, processPaperQuote, resetPaperAccount, restorePaperAccount, reversePaperPosition, submitPaperOrder, validatePaperAccount } from '../../src/domain/paper';
import type { PaperAccount, PaperOrderRequest, PaperResult } from '../../src/domain/paper';
import { previewPaperTicket } from '../../src/domain/paper-ticket';
import { fixtureQuote } from '../../src/domain/fixtures';
import type { Instrument, Quote } from '../../src/domain/types';

// Paper fill independent oracles. Every expected number below is derived by hand in the
// adjacent comment from the stated quote, quantity, fee and slippage, not read back from the engine.
const instrument: Instrument = { id: 'C11:ABC', symbol: 'ABC', name: 'Synthetic C11 oracle', exchange: 'SYNTHETIC', assetClass: 'stock', currency: 'USD', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const other: Instrument = { ...instrument, id: 'C11:XYZ', symbol: 'XYZ' };
const q = (bid: number, ask: number, sequence: number, at = sequence, target = instrument): Quote => ({ instrumentId: target.id, bid, ask, sequence, eventTime: at, receivedAt: at, availableAt: at, fixture: true, session: 'unknown' });
const ok = (result: PaperResult): PaperAccount => { expect(result.ok, result.diagnostics.map(d => d.message).join(';')).toBe(true); return result.account; };
const feed = (account: PaperAccount, quote: Quote, now = quote.availableAt) => ok(processPaperQuote(account, quote, now, account.runId, quote.instrumentId === other.id ? other : instrument));
const send = (account: PaperAccount, request: Partial<PaperOrderRequest>, now = account.clock) => submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 10, ...request }, now);

describe('cash, P&L and percent fee oracle', () => {
  it('round trip with 0.1 percent commission', () => {
    let account = feed(createPaperAccount({ initialBalance: 10000, commission: { kind: 'percent', value: 0.1 } }), q(49.95, 50.05, 1));
    account = ok(send(account, { quantity: 100 }));
    // Buy 100 at ask 50.05: notional 5005.00; fee 5005 * 0.1 / 100 = 5.005; cash 10000 - 5005 - 5.005 = 4989.995.
    expect(account.fills[0].price).toBe(50.05); expect(account.fills[0].commission).toBe(5.005); expect(account.cash).toBe(4989.995);
    account = feed(account, q(52.00, 52.10, 2));
    // Balance 10000 - 5.005 = 9994.995. Long marks at bid: (52.00 - 50.05) * 100 = 195. Equity 10189.995.
    const marked = paperSummary(account, 2);
    expect(marked.balance).toBe(9994.995); expect(marked.unrealized).toBe(195); expect(marked.equity).toBe(10189.995);
    // Margin used at leverage 1: 52.00 * 100 = 5200; no working orders, so orders margin 0.
    expect(marked.marginUsed).toBe(5200); expect(marked.reservedMargin).toBe(0);
    account = ok(send(account, { side: 'sell', quantity: 100 }, 2));
    // Sell 100 at bid 52.00: fee 5200 * 0.001 = 5.2; realized gross 195; cash 4989.995 + 5200 - 5.2 = 10184.795.
    // Fees 5.005 + 5.2 = 10.205; net realized 195 - 10.205 = 184.795; balance 10000 + 184.795 = 10184.795 = cash.
    const flat = paperSummary(account, 2);
    expect(account.cash).toBe(10184.795); expect(account.fees).toBe(10.205); expect(flat.netRealized).toBe(184.795); expect(flat.balance).toBe(10184.795); expect(flat.equity).toBe(10184.795);
    expect(paperFeeFor(account.settings, 100, 52)).toBe(5.2);
  });
});

describe('OpenCandle slippage policy', () => {
  it('moves market fills adversely by whole ticks and records the raw quote', () => {
    let account = feed(createPaperAccount({ slippageTicks: 3 }), q(9.98, 10.02, 1));
    account = ok(send(account, {}));
    // 3 ticks * 0.01 = 0.03. Buy pays ask 10.02 + 0.03 = 10.05; cash 100000 - 100.50 = 99899.50.
    expect(account.fills[0]).toMatchObject({ price: 10.05, quotePrice: 10.02, slippage: 0.03 }); expect(account.cash).toBe(99899.5);
    account = ok(send(account, { side: 'sell' }));
    // Sell receives bid 9.98 - 0.03 = 9.95; realized (9.95 - 10.05) * 10 = -1.00; cash 99899.50 + 99.50 = 99999.00.
    expect(account.fills[1]).toMatchObject({ price: 9.95, quotePrice: 9.98, slippage: 0.03, realizedGross: -1 }); expect(account.cash).toBe(99999);
    expect(account.events.at(-1)!.message).toContain('virtual slippage 0.03');
  });
  it('never slips limit fills and does slip a triggered plain stop', () => {
    let account = feed(createPaperAccount({ slippageTicks: 2 }), q(9.98, 10.02, 1));
    account = ok(send(account, { type: 'limit', limitPrice: 10.02 }));
    // Marketable buy limit at 10.02 fills at ask 10.02 with no slippage field.
    expect(account.fills[0].price).toBe(10.02); expect(account.fills[0].slippage).toBeUndefined(); expect(account.fills[0].quotePrice).toBeUndefined();
    account = ok(send(account, { side: 'sell', type: 'stop', stopPrice: 9.5 }));
    expect(account.orders[1].status).toBe('working');
    account = feed(account, q(9.48, 9.52, 2));
    // Sell stop triggers at bid 9.48 <= 9.50 and fills at 9.48 - 0.02 = 9.46; realized (9.46 - 10.02) * 10 = -5.60.
    expect(account.fills[1]).toMatchObject({ price: 9.46, quotePrice: 9.48, slippage: 0.02, realizedGross: -5.6 });
  });
  it('slips the stop-loss exit child but not the take-profit child', () => {
    const exits = { schemaVersion: 1 as const, mode: 'single' as const, levels: [{ quantity: 10, takeProfit: 11, stopLoss: 9.5 }] };
    let account = feed(createPaperAccount({ slippageTicks: 3 }), q(9.98, 10.02, 1));
    account = ok(send(account, { type: 'limit', limitPrice: 10.02, exits }));
    // Entry is a limit: fills at 10.02 exactly. Children activate on the next distinct quote.
    expect(account.fills[0].price).toBe(10.02);
    account = feed(account, q(9.4, 9.44, 2));
    // SL sell stop 9.50 triggered by bid 9.40; fills 9.40 - 0.03 = 9.37; realized (9.37 - 10.02) * 10 = -6.50. TP sibling cancelled.
    expect(account.fills[1]).toMatchObject({ price: 9.37, slippage: 0.03, realizedGross: -6.5 });
    expect(account.orders.filter(o => o.bracket).map(o => [o.bracket!.leg, o.status])).toEqual([['tp', 'cancelled'], ['sl', 'filled']]);
    let profit = feed(createPaperAccount({ slippageTicks: 3 }), q(9.98, 10.02, 1));
    profit = feed(ok(send(profit, { type: 'limit', limitPrice: 10.02, exits })), q(11.1, 11.14, 2));
    // TP sell limit 11.00 fills at bid 11.10 (better than limit) with no slippage: realized (11.10 - 10.02) * 10 = 10.80.
    expect(profit.fills[1]).toMatchObject({ price: 11.1, realizedGross: 10.8 }); expect(profit.fills[1].slippage).toBeUndefined();
  });
  it('floors a slipped sell at one tick so closes and stop-loss exits still execute, and validates settings', () => {
    // Review regression: 600 ticks (6.00) against a 5.00 stock must not block closing.
    let low = feed(createPaperAccount({ slippageTicks: 600 }), q(4.98, 5.02, 1));
    low = ok(send(low, {}));
    // Buy 10 at 5.02 + 6.00 = 11.02 (cash 100000 - 110.20 = 99889.80).
    expect(low.fills[0]).toMatchObject({ price: 11.02, slippage: 6 });
    low = ok(closePaperPosition(low, instrument.id, 1));
    // Sell: 4.98 - 6.00 < 0, floored at one tick 0.01; applied slippage 4.97; realized (0.01 - 11.02) * 10 = -110.10; cash 99889.80 + 0.10 = 99889.90.
    expect(low.fills[1]).toMatchObject({ price: 0.01, quotePrice: 4.98, slippage: 4.97, realizedGross: -110.1 }); expect(low.cash).toBe(99889.9); expect(low.positions).toEqual({});
    expect(restorePaperAccount(JSON.parse(JSON.stringify(low))).cash).toBe(99889.9);
    const account = feed(createPaperAccount({ slippageTicks: 10000 }), q(9.98, 10.02, 1));
    for (const bad of [1.5, -1, 10001]) expect(configurePaperAccount(account, { slippageTicks: bad }, 1).diagnostics[0].code).toBe('INVALID_SETTINGS');
    expect(ok(configurePaperAccount(account, { slippageTicks: 0 }, 1)).settings.slippageTicks).toBe(0);
    expect(() => createPaperAccount({ slippageTicks: 0.5 })).toThrow(/whole number of ticks/);
  });
  it('reserves buying power for a working buy market order including slippage', () => {
    let account = createPaperAccount({ initialBalance: 1000, slippageTicks: 5 });
    account = ok(send(account, { quantity: 10, type: 'stop', stopPrice: 20 }));
    // Buy stop reference 20.00 + 5 ticks (0.05) = 20.05; reserve 10 * 20.05 = 200.50 at leverage 1.
    expect(paperSummary(account).reservedMargin).toBe(200.5);
  });
});

describe('bar gaps and ambiguous intrabar ordering (explicit path policy)', () => {
  const bar = (open: number, high: number, low: number, close: number, time = 100) => ({ time, open, high, low, close });
  it('builds open-proximity and close-only paths without inventing duplicate events', () => {
    // High distance 0.20 > low distance 0.10, so the low is visited first: O, L, H, C.
    const path = paperBarQuotePath({ instrumentId: instrument.id, bar: bar(9, 9.2, 8.9, 9.1), firstSequence: 5, halfSpread: 0.01, policy: 'open-proximity', fixture: true, session: 'unknown', availableAt: 100 });
    expect(path.map(row => [row.bid, row.ask, row.sequence])).toEqual([[8.99, 9.01, 5], [8.89, 8.91, 6], [9.19, 9.21, 7], [9.09, 9.11, 8]]);
    expect(paperBarQuotePath({ instrumentId: instrument.id, bar: bar(9, 9.2, 8.9, 9.1), firstSequence: 5, halfSpread: 0.01, policy: 'close-only', fixture: true, session: 'unknown', availableAt: 100 }).map(row => row.bid)).toEqual([9.09]);
    // Open equals high: O and H collapse into one event (O, L, C).
    expect(paperBarQuotePath({ instrumentId: instrument.id, bar: bar(10, 10, 9, 9.5), firstSequence: 1, halfSpread: 0, policy: 'open-proximity', fixture: true, session: 'unknown', availableAt: 100 }).map(row => row.bid)).toEqual([10, 9, 9.5]);
    // Review regression: availability is explicit and may not precede the bar stamp (a daily bar stamped at its open would otherwise look ahead).
    expect(() => paperBarQuotePath({ instrumentId: instrument.id, bar: bar(9, 9.2, 8.9, 9.1), firstSequence: 1, halfSpread: 0, policy: 'close-only', fixture: true, session: 'unknown', availableAt: 99 })).toThrow(/timing/);
    expect(paperBarQuotePath({ instrumentId: instrument.id, bar: bar(9, 9.2, 8.9, 9.1, 100), firstSequence: 1, halfSpread: 0, policy: 'close-only', fixture: true, session: 'unknown', availableAt: 186400 })[0]).toMatchObject({ eventTime: 100, availableAt: 186400 });
    expect(() => paperBarQuotePath({ instrumentId: instrument.id, bar: bar(10, 9, 8, 9.5), firstSequence: 1, halfSpread: 0, policy: 'open-proximity', fixture: true, session: 'unknown', availableAt: 100 })).toThrow(/bounding/);
    expect(() => paperBarQuotePath({ instrumentId: instrument.id, bar: bar(0.01, 0.02, 0.01, 0.01), firstSequence: 1, halfSpread: 0.01, policy: 'close-only', fixture: true, session: 'unknown', availableAt: 100 })).toThrow(/nonpositive bid/);
  });
  it('fills a gapped-through stop at the open quote, worse than the stop', () => {
    let account = feed(createPaperAccount(), q(9.98, 10.02, 1));
    account = ok(send(account, {}));
    account = ok(send(account, { side: 'sell', type: 'stop', stopPrice: 9.5 }));
    for (const quote of paperBarQuotePath({ instrumentId: instrument.id, bar: bar(9, 9.2, 8.9, 9.1), firstSequence: 2, halfSpread: 0.01, policy: 'open-proximity', fixture: true, session: 'unknown', availableAt: 100 })) account = feed(account, quote, 100);
    // The first quote after the gap is bid 8.99 (open 9.00 - 0.01). Stop 9.50 fills there: realized (8.99 - 10.02) * 10 = -10.30.
    expect(account.fills[1]).toMatchObject({ price: 8.99, quoteSequence: 2, realizedGross: -10.3 });
  });
  it('fills a gapped-through buy limit at the better open quote', () => {
    let account = feed(createPaperAccount(), q(9.98, 10.02, 1));
    account = ok(send(account, { type: 'limit', limitPrice: 10 }));
    expect(account.orders[0].status).toBe('working');
    for (const quote of paperBarQuotePath({ instrumentId: instrument.id, bar: bar(9.5, 9.7, 9.4, 9.6), firstSequence: 2, halfSpread: 0.01, policy: 'open-proximity', fixture: true, session: 'unknown', availableAt: 100 })) account = feed(account, quote, 100);
    // Open ask 9.51 <= limit 10.00: fills at 9.51, an improvement of 0.49 per unit.
    expect(account.fills[0]).toMatchObject({ price: 9.51, quoteSequence: 2 });
  });
  it('resolves a bar that spans both TP and SL by the declared path, and close-only fills neither', () => {
    const exits = { schemaVersion: 1 as const, mode: 'single' as const, levels: [{ quantity: 10, takeProfit: 10.5, stopLoss: 9.5 }] };
    const opened = () => ok(send(feed(createPaperAccount(), q(9.99, 10.01, 1)), { exits }));
    const run = (account: PaperAccount, b: ReturnType<typeof bar>, policy: 'open-proximity' | 'close-only') => { for (const quote of paperBarQuotePath({ instrumentId: instrument.id, bar: b, firstSequence: 2, halfSpread: 0.01, policy, fixture: true, session: 'unknown', availableAt: 100 })) account = feed(account, quote, 100); return account; };
    // Tie (0.60 each side): LV visits the high first. H bid 10.59 >= TP 10.50 fills at 10.59: (10.59 - 10.01) * 10 = 5.80. SL is cancelled as the OCO sibling.
    const tie = run(opened(), bar(10, 10.6, 9.4, 10), 'open-proximity');
    expect(tie.fills.map(f => [f.price, f.realizedGross])).toEqual([[10.01, 0], [10.59, 5.8]]);
    // High distance 0.70 > low distance 0.60: low first. L bid 9.39 <= SL 9.50 fills at 9.39: (9.39 - 10.01) * 10 = -6.20.
    const lowFirst = run(opened(), bar(10, 10.7, 9.4, 10), 'open-proximity');
    expect(lowFirst.fills.map(f => [f.price, f.realizedGross])).toEqual([[10.01, 0], [9.39, -6.2]]);
    expect(lowFirst.orders.find(o => o.bracket?.leg === 'tp')!.status).toBe('cancelled');
    // Close-only sees one quote at 10.00 (bid 9.99): neither leg fills and both remain working.
    const closeOnly = run(opened(), bar(10, 10.7, 9.4, 10), 'close-only');
    expect(closeOnly.fills).toHaveLength(1); expect(closeOnly.orders.filter(o => o.bracket && o.status === 'working')).toHaveLength(2);
    expect(PAPER_POLICIES.join(' ')).toMatch(/Intrabar ordering/);
  });
});

describe('stale quotes', () => {
  it('a stale quote fills nothing, flags marks and blocks ticket previews until a fresh quote arrives', () => {
    let account = feed(createPaperAccount({ maxQuoteAgeSeconds: 60 }), q(9.98, 10.02, 1, 100));
    account = ok(send(account, {}, 100));
    expect(account.positions[instrument.id].quantity).toBe(10);
    account = ok(send(account, { quantity: 5 }, 200));
    // 200 - 100 = 100 seconds > 60: the order stays working and the long mark is stale.
    expect(account.orders[1].status).toBe('working'); expect(paperSummary(account, 200).staleMarks).toEqual([instrument.id]);
    const preview = previewPaperTicket({ schemaVersion: 1, side: 'buy', type: 'market', quantity: { kind: 'units', value: '1' }, limit: null, stop: null, validity: { kind: 'day' }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null }, { account, instrument, quote: account.quotes[instrument.id], quoteSource: { key: 'c11', state: 'ready' }, now: 200 });
    expect(preview.ok).toBe(false); expect(preview.diagnostics[0].code).toBe('STALE_TICKET_QUOTE');
    account = feed(account, q(10.48, 10.52, 2, 205), 205);
    // Fresh quote at 205: the waiting order fills at ask 10.52; weighted average (10 * 10.02 + 5 * 10.52) / 15 = 152.80 / 15 = 10.1866666667.
    expect(account.orders[1].status).toBe('filled'); expect(account.fills[1].price).toBe(10.52); expect(account.positions[instrument.id].averagePrice).toBe(10.1866666667);
  });
  it('rejects out-of-order quotes without changing the account', () => {
    const account = feed(createPaperAccount(), q(9.98, 10.02, 5, 10));
    expect(processPaperQuote(account, q(9.98, 10.02, 4, 11), 11, account.runId, instrument).diagnostics[0].code).toBe('OUT_OF_ORDER_QUOTE');
  });
});

describe('modify and cancel', () => {
  it('modifies a working limit, updates its reservation and cancels idempotently', () => {
    let account = feed(createPaperAccount({ initialBalance: 1000 }), q(9.98, 10.02, 1));
    account = ok(send(account, { type: 'limit', limitPrice: 9 }));
    // Reserve 10 * 9.00 = 90.
    expect(paperSummary(account).reservedMargin).toBe(90);
    const id = account.orders[0].id;
    account = ok(modifyPaperOrder(account, id, { quantity: 20, limitPrice: 9.5 }, 2));
    // Reserve 20 * 9.50 = 190; buying power 1000 - 190 = 810.
    expect(paperSummary(account).reservedMargin).toBe(190); expect(paperSummary(account).buyingPower).toBe(810); expect(account.events.at(-1)!.type).toBe('modified');
    expect(modifyPaperOrder(account, id, { quantity: 200, limitPrice: 9.5 }, 2).diagnostics[0].code).toBe('INSUFFICIENT_BUYING_POWER');
    account = ok(cancelPaperOrder(account, id, 3));
    expect(account.orders[0].status).toBe('cancelled'); expect(paperSummary(account).reservedMargin).toBe(0);
    const again = cancelPaperOrder(account, id, 3);
    expect(again.ok).toBe(false); expect(again.account).toBe(account); expect(again.diagnostics[0].code).toBe('ORDER_NOT_WORKING');
    expect(modifyPaperOrder(account, id, { quantity: 1 }, 3).diagnostics[0].code).toBe('ORDER_NOT_WORKING');
  });
  it('scoped cancel touches only the chosen instrument and side, excluding exit children', () => {
    let account = feed(feed(createPaperAccount(), q(9.98, 10.02, 1)), q(19.98, 20.02, 1, 1, other));
    account = ok(send(account, { exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 10, takeProfit: 12, stopLoss: 9 }] } }));
    account = feed(account, q(9.98, 10.02, 2, 2), 2);
    account = ok(send(account, { type: 'limit', limitPrice: 9 }, 2));
    account = ok(send(account, { type: 'limit', limitPrice: 8 }, 2));
    account = ok(send(account, { side: 'sell', type: 'limit', limitPrice: 15 }, 2));
    account = ok(submitPaperOrder(account, { instrument: other, side: 'buy', type: 'limit', limitPrice: 15, quantity: 1 }, 2));
    expect(paperCancelCandidates(account, { instrumentId: instrument.id, side: 'buy' })).toHaveLength(2);
    account = ok(cancelPaperOrders(account, { instrumentId: instrument.id, side: 'buy' }, 3));
    const status = (price: number, target = instrument) => account.orders.find(o => o.instrument.id === target.id && o.limitPrice === price && !o.bracket)!.status;
    expect([status(9), status(8), status(15), status(15, other)]).toEqual(['cancelled', 'cancelled', 'working', 'working']);
    account = ok(cancelPaperOrders(account, { instrumentId: instrument.id }, 3));
    expect(status(15)).toBe('cancelled'); expect(status(15, other)).toBe('working');
    // Exit children (TP 12 / SL 9 pair) are untouched by scoped cancel.
    expect(account.orders.filter(o => o.bracket && o.status === 'working')).toHaveLength(2);
    const none = cancelPaperOrders(account, { instrumentId: instrument.id }, 3);
    expect(none.ok).toBe(false); expect(none.diagnostics[0].code).toBe('NO_MATCHING_ORDERS'); expect(none.account).toBe(account);
  });
});

describe('insufficient virtual funds, partial close and reverse', () => {
  it('spread and fixed fee can push a market buy over buying power', () => {
    // 98 units, no fee: equity 1000 + (9.98 - 10.02) * 98 = 996.08 >= margin 9.98 * 98 = 978.04: accepted.
    const fits = ok(send(feed(createPaperAccount({ initialBalance: 1000 }), q(9.98, 10.02, 1)), { quantity: 98 }));
    expect(fits.positions[instrument.id].quantity).toBe(98); expect(paperSummary(fits, 1).equity).toBe(996.08);
    // 99 units, fixed fee 10: equity 1000 - 10 + (9.98 - 10.02) * 99 = 986.04 < margin 9.98 * 99 = 988.02: rejected.
    const base = feed(createPaperAccount({ initialBalance: 1000, commission: { kind: 'fixed', value: 10 } }), q(9.98, 10.02, 1));
    const rejected = ok(send(base, { quantity: 99 }));
    expect(rejected.orders[0]).toMatchObject({ status: 'rejected', rejectionReason: 'Insufficient virtual buying power at the executable quote.' });
    expect(rejected.cash).toBe(1000); expect(rejected.fees).toBe(0); expect(rejected.fills).toEqual([]);
    // Working limit reserve 200 * 9.00 = 1800 + fee 10 > equity 1000: rejected at placement.
    expect(ok(send(base, { quantity: 200, type: 'limit', limitPrice: 9 })).orders[0].rejectionReason).toBe('Insufficient virtual buying power to reserve this working order.');
  });
  it('partial close keeps the remainder and cannot reverse', () => {
    let account = ok(send(feed(createPaperAccount(), q(9.98, 10.02, 1)), {}));
    account = ok(closePaperPosition(account, instrument.id, 1, 4));
    // Sell 4 at 9.98: realized (9.98 - 10.02) * 4 = -0.16; remaining long 6 at 10.02.
    expect(account.positions[instrument.id]).toMatchObject({ quantity: 6, averagePrice: 10.02, realizedGross: -0.16 });
    expect(closePaperPosition(account, instrument.id, 1, 7).diagnostics[0].code).toBe('INVALID_ORDER');
  });
  it('reverses a long into an equal short as one order', () => {
    let account = ok(send(feed(createPaperAccount({ initialBalance: 1000 }), q(9.98, 10.02, 1)), { quantity: 98 }));
    account = ok(reversePaperPosition(account, instrument.id, 1));
    // Sell 196 at 9.98: realized (9.98 - 10.02) * 98 = -3.92; cash 1000 - 981.96 + 1956.08 = 1974.12; short 98 at 9.98.
    expect(account.orders.at(-1)).toMatchObject({ side: 'sell', type: 'market', quantity: 196, status: 'filled' });
    expect(account.positions[instrument.id]).toMatchObject({ quantity: -98, averagePrice: 9.98 }); expect(account.cash).toBe(1974.12); expect(account.realizedGross).toBe(-3.92);
    // Short marks at ask: (10.02 - 9.98) * -98 = -3.92; equity 1000 - 3.92 - 3.92 = 992.16.
    expect(paperSummary(account, 1).equity).toBe(992.16);
  });
  it('rejects the whole reversal when the opening half lacks buying power', () => {
    let account = ok(send(feed(createPaperAccount({ initialBalance: 1000 }), q(9.98, 10.02, 1)), { quantity: 98 }));
    account = ok(configurePaperAccount(account, { commission: { kind: 'fixed', value: 15 } }, 1));
    const result = reversePaperPosition(account, instrument.id, 1);
    // After the reversal: balance 1000 - 3.92 - 15 = 981.08; equity 981.08 - 3.92 = 977.16 < margin 10.02 * 98 = 981.96: rejected.
    // Second-review L1: refused with the same account object, no rejected row, position and cash unchanged.
    expect(result.ok).toBe(false); expect(result.diagnostics[0].code).toBe('REVERSE_REJECTED'); expect(result.diagnostics[0].message).toMatch(/Insufficient virtual buying power.*No virtual order was created/);
    expect(result.account).toBe(account); expect(account.orders).toHaveLength(1); expect(account.positions[instrument.id].quantity).toBe(98);
    expect(reversePaperPosition(account, other.id, 1).diagnostics[0].code).toBe('POSITION_MISSING');
  });
  it('refuses a reverse that cannot fill now instead of leaving a double-size order working', () => {
    // Review regression: long 10, quote goes stale (61 s > 60 s). A working sell 20 could later open a short 20.
    let account = ok(send(feed(createPaperAccount(), q(9.98, 10.02, 1, 100)), {}, 100));
    const stale = reversePaperPosition(account, instrument.id, 161);
    expect(stale.ok).toBe(false); expect(stale.diagnostics[0].code).toBe('REVERSE_NEEDS_QUOTE'); expect(stale.account).toBe(account);
    account = feed(account, q(9.98, 10.02, 2, 161), 161);
    expect(ok(reversePaperPosition(account, instrument.id, 161)).positions[instrument.id].quantity).toBe(-10);
  });
});

describe('persistence and reset', () => {
  it('round-trips a populated account through JSON and rejects tampered slippage history', () => {
    let account = feed(createPaperAccount({ slippageTicks: 1, commission: { kind: 'per-unit', value: 0.01 } }), q(9.98, 10.02, 1));
    account = ok(send(account, { exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 10, takeProfit: 12, stopLoss: 9 }] } }));
    account = ok(send(account, { type: 'limit', limitPrice: 9.5 }));
    account = ok(cancelPaperOrder(account, account.orders.at(-1)!.id, 1));
    account = ok(closePaperPosition(account, instrument.id, 1, 3));
    const restored = restorePaperAccount(JSON.parse(JSON.stringify(account)));
    expect(restored).toEqual(account); expect(paperSummary(restored, 1)).toEqual(paperSummary(account, 1));
    // Buy 10 at 10.02 + 0.01 = 10.03, fee 10 * 0.01 = 0.10; sell 3 at 9.98 - 0.01 = 9.97, fee 0.03.
    // Cash 100000 - 100.30 - 0.10 + 29.91 - 0.03 = 99929.48.
    expect(restored.cash).toBe(99929.48); expect(restored.settings.slippageTicks).toBe(1);
    const tampered = JSON.parse(JSON.stringify(account)); tampered.fills[0].slippage = 0.02;
    expect(validatePaperAccount(tampered).errors[0]).toMatch(/slippage disagrees/);
    // Review regression: slippage fields on a limit-priced fill are rejected even when arithmetically consistent.
    const limitFill = JSON.parse(JSON.stringify(ok(send(feed(createPaperAccount(), q(9.98, 10.02, 1)), { type: 'limit', limitPrice: 10.05 }))));
    Object.assign(limitFill.fills[0], { quotePrice: 10.01, slippage: 0.01 });
    expect(validatePaperAccount(limitFill).errors[0]).toMatch(/slippage disagrees/);
    const legacy = JSON.parse(JSON.stringify(ok(send(feed(createPaperAccount(), q(9.98, 10.02, 1)), {}))));
    expect('slippageTicks' in legacy.settings).toBe(false); expect(restorePaperAccount(legacy).fills[0].price).toBe(10.02);
  });
  it('reset clears history, applies balance and currency, keeps simulation settings and changes the run', () => {
    let account = feed(createPaperAccount({ slippageTicks: 2, commission: { kind: 'fixed', value: 1 } }), q(9.98, 10.02, 1));
    account = ok(send(account, {}));
    const reset = resetPaperAccount(account, { initialBalance: 5000, currency: 'EUR' }, 2);
    expect(reset).toMatchObject({ cash: 5000, fees: 0, realizedGross: 0, orders: [], fills: [], events: [], positions: {}, id: account.id });
    expect(reset.settings).toMatchObject({ initialBalance: 5000, currency: 'EUR', slippageTicks: 2, commission: { kind: 'fixed', value: 1 } });
    expect(reset.runId).not.toBe(account.runId); expect(account.fills).toHaveLength(1);
    expect(() => resetPaperAccount(account, { currency: 'eur' }, 2)).toThrow(/three-letter/);
    // USD instruments cannot trade in the EUR account: no silent conversion.
    expect(send(feed(reset, q(9.98, 10.02, 3)), {}, 3).diagnostics[0].message).toMatch(/Currency conversion is unavailable/);
  });
});

describe('second review M1: processPaperBar fills intrabar touches at the order price', () => {
  const bar = (open: number, high: number, low: number, close: number, time = 100) => ({ time, open, high, low, close });
  const exits = { schemaVersion: 1 as const, mode: 'single' as const, levels: [{ quantity: 10, takeProfit: 10.5, stopLoss: 9.5 }] };
  const applyBar = (account: PaperAccount, b: ReturnType<typeof bar>, policy: 'open-proximity' | 'close-only' = 'open-proximity') => processPaperBar(account, { instrumentId: instrument.id, bar: b, firstSequence: 2, halfSpread: 0.01, policy, fixture: true, session: 'unknown', availableAt: 100, now: 100, executionInstrument: instrument });
  // Long 10 at 10.01: marketable limit at quote 9.99/10.01, so no entry slippage. Children activate from sequence 2.
  const opened = (slippageTicks = 0) => ok(send(feed(createPaperAccount({ slippageTicks }), q(9.99, 10.01, 1)), { type: 'limit', limitPrice: 10.01, exits }));
  it('fills a take profit crossed inside the bar at its limit, not at the bar high', () => {
    // O10 H11 L9.9 C10.6: low distance 0.10 < high distance 1.00, so O, L, H, C. Bids 9.99, 9.89, 10.99, 10.59.
    // The L-to-H segment (9.89 to 10.99) crosses TP 10.50: fill 10.50, realized (10.50 - 10.01) * 10 = 4.90 (raw discrete quotes would give 10.99 and 9.80).
    const account = ok(applyBar(opened(), bar(10, 11, 9.9, 10.6)));
    expect(account.fills[1]).toMatchObject({ price: 10.5, realizedGross: 4.9, intrabar: true, quoteSequence: 4 });
    expect(account.orders.find(o => o.bracket?.leg === 'sl')!.status).toBe('cancelled');
    expect(restorePaperAccount(JSON.parse(JSON.stringify(account)))).toEqual(account);
  });
  it('fills a stop loss crossed inside the bar at its stop price minus slippage', () => {
    // O10 H10.1 L9.0 C9.2: high distance 0.10 < low distance 1.00, so O, H, L, C. The H-to-L segment (bid 10.09 to 8.99) crosses SL 9.50.
    // 2 ticks: fill 9.50 - 0.02 = 9.48; realized (9.48 - 10.01) * 10 = -5.30.
    const account = ok(applyBar(opened(2), bar(10, 10.1, 9, 9.2)));
    expect(account.fills[1]).toMatchObject({ price: 9.48, quotePrice: 9.5, slippage: 0.02, realizedGross: -5.3, intrabar: true });
  });
  it('fills an adverse gap at the open quote plus slippage, with no intrabar flag', () => {
    // O9.2 is below SL 9.50 at the first (gap) point: bid 9.19 - 0.02 = 9.17; realized (9.17 - 10.01) * 10 = -8.40.
    const account = ok(applyBar(opened(2), bar(9.2, 9.3, 9, 9.1)));
    expect(account.fills[1]).toMatchObject({ price: 9.17, quotePrice: 9.19, realizedGross: -8.4 }); expect(account.fills[1].intrabar).toBeUndefined();
  });
  it('gives a favourable gap to a resting limit and the limit price to one crossed later in the bar', () => {
    let account = feed(createPaperAccount(), q(9.99, 10.01, 1));
    account = ok(send(account, { type: 'limit', limitPrice: 10 }));
    account = ok(send(account, { type: 'limit', limitPrice: 9.45 }));
    // O9.5 H9.6 L9.3 C9.4: high distance 0.10 <= low distance 0.20, so O, H, L, C; asks 9.51, 9.61, 9.31, 9.41.
    // Limit 10.00 fills at the open ask 9.51 (gap, better than its limit). Limit 9.45 is crossed in the H-to-L segment: fills 9.45.
    // Cash 100000 - 95.10 - 94.50 = 99810.40.
    account = ok(applyBar(account, bar(9.5, 9.6, 9.3, 9.4)));
    expect(account.fills.map(f => [f.price, f.intrabar ?? false])).toEqual([[9.51, false], [9.45, true]]); expect(account.cash).toBe(99810.4);
  });
  it('fills a stop-limit with a marketable limit at its stop inside the bar, where raw quotes leave it triggered', () => {
    const base = ok(send(feed(createPaperAccount(), q(9.99, 10.01, 1)), { type: 'stop-limit', stopPrice: 10.5, limitPrice: 10.6 }));
    // O10 H11 L9.95 C10.8: high distance 1.00 > low distance 0.05, so O, L, H, C; asks 10.01, 9.96, 11.01, 10.81.
    // The L-to-H segment crosses stop 10.50, and 10.50 <= limit 10.60: fill 10.50, no slippage for stop-limit.
    expect(ok(applyBar(base, bar(10, 11, 9.95, 10.8))).fills[0]).toMatchObject({ price: 10.5, intrabar: true });
    // Raw discrete quotes: triggered at ask 11.01, but 11.01 and 10.81 are both above 10.60, so it never fills.
    let raw = base; for (const quote of paperBarQuotePath({ instrumentId: instrument.id, bar: bar(10, 11, 9.95, 10.8), firstSequence: 2, halfSpread: 0.01, policy: 'open-proximity', fixture: true, session: 'unknown', availableAt: 100 })) raw = feed(raw, quote, 100);
    expect(raw.orders[0].status).toBe('triggered'); expect(raw.fills).toEqual([]);
  });
  it('is idempotent and atomic, and close-only matches fixtureQuote rounding without throwing', () => {
    const once = ok(applyBar(opened(), bar(10, 10.2, 9.9, 10.1)));
    expect(applyBar(once, bar(10, 10.2, 9.9, 10.1)).account).toBe(once);
    const invalid = applyBar(once, bar(10, 9, 9.9, 10.1, 200));
    expect(invalid.ok).toBe(false); expect(invalid.account).toBe(once);
    expect(paperBarQuotePathOrNull({ instrumentId: instrument.id, bar: bar(0.01, 0.01, 0.01, 0.01), firstSequence: 1, halfSpread: 0.01, policy: 'close-only', fixture: true, session: 'unknown', availableAt: 100 })).toBeNull();
    // fixtureCents: close 0.005 gives bid max(0.01, round(-0.5) / 100) = 0.01 and ask round(1.5) / 100 = 0.02, with no throw.
    expect(paperBarQuotePath({ instrumentId: instrument.id, bar: bar(0.005, 0.005, 0.005, 0.005), firstSequence: 1, halfSpread: 0.01, policy: 'close-only', fixture: true, session: 'unknown', availableAt: 100, fixtureCents: true })[0]).toMatchObject({ bid: 0.01, ask: 0.02 });
    for (const close of [12.345, 7.005, 100, 0.02]) {
      const b = bar(close, close, close, close), fixture = fixtureQuote(instrument.id, { ...b, volume: 0 }, 9), path = paperBarQuotePath({ instrumentId: instrument.id, bar: b, firstSequence: 9, halfSpread: 0.01, policy: 'close-only', fixture: true, session: 'unknown', availableAt: b.time, fixtureCents: true });
      expect(path).toEqual([fixture]);
    }
  });
  it('estimates fees on the slipped price and rejects a forged intrabar flag', () => {
    // 3 ticks: buy market reference 10.02 becomes 10.05; 600 ticks on a 4.98 sell floors at 0.01; limits never slip.
    const settings = createPaperAccount({ slippageTicks: 3, commission: { kind: 'percent', value: 1 } }).settings;
    expect(paperSlippedPrice(settings, { type: 'market', side: 'buy', instrument }, 10.02)).toBe(10.05);
    expect(paperSlippedPrice({ ...settings, slippageTicks: 600 }, { type: 'stop', side: 'sell', instrument }, 4.98)).toBe(0.01);
    expect(paperSlippedPrice(settings, { type: 'limit', side: 'buy', instrument }, 10.02)).toBe(10.02);
    // 1% of 10 * 10.05 = 1.005 (not 1.002 on the unslipped 10.02).
    expect(paperFeeFor(settings, 10, paperSlippedPrice(settings, { type: 'market', side: 'buy', instrument }, 10.02))).toBe(1.005);
    const forged = JSON.parse(JSON.stringify(ok(send(feed(createPaperAccount(), q(9.98, 10.02, 1)), {}))));
    forged.fills[0].intrabar = true;
    expect(validatePaperAccount(forged).errors[0]).toMatch(/intrabar/);
  });
});
