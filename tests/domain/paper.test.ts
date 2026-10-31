import { describe, expect, it } from 'vitest';
import { advancePaperClock, cancelPaperOrder, closePaperPosition, configurePaperAccount, createPaperAccount, modifyPaperOrder, PAPER_NOTICE, paperSummary, processPaperQuote, resetPaperAccount, restorePaperAccount, submitPaperOrder, validatePaperAccount } from '../../src/domain/paper';
import type { PaperAccount, PaperOrderRequest, PaperResult } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';
import { ORACLES } from './oracle-cases';

const instrument: Instrument = { id: 'TEST:ABC', symbol: 'ABC', name: 'Synthetic oracle', exchange: 'SYNTHETIC', assetClass: 'stock', currency: 'USD', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const quote = (bid = 9.98, ask = 10.02, sequence = 1, at = sequence): Quote => ({ instrumentId: instrument.id, bid, ask, sequence, eventTime: at, receivedAt: at, availableAt: at, fixture: true, session: 'unknown' });
const order = (changes: Partial<PaperOrderRequest> = {}): PaperOrderRequest => ({ instrument, side: 'buy', type: 'market', quantity: 10, ...changes });
const resultState = (result: PaperResult): PaperAccount => { expect(result.ok, result.diagnostics.map(d => d.message).join(';')).toBe(true); return result.account; };
const market = (account: PaperAccount, changes = {}) => resultState(submitPaperOrder(account, order(changes), account.clock));

describe('virtual paper account and independent accounting oracle', () => {
  it('starts with 100000 virtual USD and no external account dependency', () => {
    const account = createPaperAccount();
    expect(account.settings.initialBalance).toBe(100000); expect(account.cash).toBe(100000); expect(account.settings.leverage).toBe(1);
    expect(account.virtual).toBe(true); expect(account.settings.currency).toBe('USD'); expect(account.orders).toEqual([]);
    expect(PAPER_NOTICE).toContain('No deposit'); expect(paperSummary(account).equity).toBe(100000);
  });
  it('matches the independent Decimal round-trip oracle including spread and three fees', () => {
    const o = ORACLES.paper;
    let account = createPaperAccount({ initialBalance: 1000, commission: { kind: 'fixed', value: 1 } });
    account = resultState(processPaperQuote(account, quote(), 1));
    const original = structuredClone(account);
    account = market(account);
    expect(original.cash).toBe(1000); expect(original.fills).toHaveLength(0);
    expect(account.cash).toBe(o.cashAfterBuy); expect(paperSummary(account).balance).toBe(999); expect(paperSummary(account).equity).toBe(o.equityAtBid998);
    account = resultState(processPaperQuote(account, quote(11.98, 12.02, 2), 2));
    account = market(account, { side: 'sell', quantity: 4 });
    expect(account.cash).toBe(o.cashAfterPartial); expect(account.positions[instrument.id].quantity).toBe(6); expect(account.positions[instrument.id].averagePrice).toBe(10.02);
    account = resultState(processPaperQuote(account, quote(9.98, 10.02, 3), 3));
    account = resultState(closePaperPosition(account, instrument.id, 3));
    expect(account.cash).toBe(o.finalCash); expect(account.fees).toBe(o.totalFees); expect(paperSummary(account).netRealized).toBe(o.netProfit);
    expect(account.positions).toEqual({}); expect(account.fills.map(f => f.price)).toEqual([10.02, 11.98, 9.98]); expect(paperSummary(account).equity).toBe(o.finalCash);
  });
  it('marks shorts at ask and computes partial cover and reversal without creating money', () => {
    let account = resultState(processPaperQuote(createPaperAccount({ initialBalance: 1000 }), quote(10, 10), 1));
    account = market(account, { side: 'sell', quantity: 10 });
    expect(account.cash).toBe(1100); expect(paperSummary(account).equity).toBe(1000); expect(paperSummary(account).buyingPower).toBe(900);
    account = resultState(processPaperQuote(account, quote(8, 8, 2), 2));
    account = market(account, { quantity: 4 });
    expect(account.realizedGross).toBe(8); expect(account.positions[instrument.id].quantity).toBe(-6); expect(paperSummary(account).equity).toBe(1020);
    account = market(account, { quantity: 10 });
    expect(account.realizedGross).toBe(20); expect(account.positions[instrument.id].quantity).toBe(4); expect(account.positions[instrument.id].averagePrice).toBe(8); expect(paperSummary(account).equity).toBe(1020);
  });
  it('calculates configurable virtual commissions without binary float drift', () => {
    for (const [commission, fee] of [[{ kind: 'percent', value: 0.5 }, 0.5], [{ kind: 'per-unit', value: 0.03 }, 0.3]] as const) {
      let account = resultState(processPaperQuote(createPaperAccount({ commission }), quote(10, 10), 1));
      account = market(account);
      expect(account.fees).toBe(fee); expect(account.cash).toBe(100000 - 100 - fee);
    }
  });
});

describe('order lifecycle and quote-side execution', () => {
  it('keeps unavailable market quotes pending and fills only after availability', () => {
    let account = market(createPaperAccount());
    expect(account.orders[0].status).toBe('working'); expect(account.fills).toHaveLength(0); expect(paperSummary(account).equity).toBe(100000); expect(paperSummary(account).buyingPower).toBeNull();
    account = resultState(processPaperQuote(account, quote(), 1));
    expect(account.orders[0].status).toBe('filled'); expect(account.fills[0].price).toBe(10.02);
  });
  it('executes buy limits on ask and sell limits on bid with price improvement', () => {
    let account = resultState(processPaperQuote(createPaperAccount(), quote(9.98, 10.02), 1));
    account = market(account, { type: 'limit', limitPrice: 10 });
    expect(account.orders[0].status).toBe('working');
    account = resultState(processPaperQuote(account, quote(9.95, 9.99, 2), 2));
    expect(account.fills[0].price).toBe(9.99);
    account = market(account, { type: 'limit', side: 'sell', limitPrice: 10.1 });
    account = resultState(processPaperQuote(account, quote(10.2, 10.24, 3), 3));
    expect(account.fills[1].price).toBe(10.2); expect(account.positions).toEqual({});
  });
  it('models stop-market gap fills and triggered stop-limit waiting separately', () => {
    let account = resultState(processPaperQuote(createPaperAccount(), quote(), 1));
    account = market(account, { type: 'stop', stopPrice: 11 });
    account = market(account, { type: 'stop-limit', stopPrice: 11, limitPrice: 11.2 });
    account = resultState(processPaperQuote(account, quote(11.98, 12.02, 2), 2));
    expect(account.orders[0].status).toBe('filled'); expect(account.fills[0].price).toBe(12.02);
    expect(account.orders[1].status).toBe('triggered'); expect(account.fills).toHaveLength(1);
    expect(modifyPaperOrder(account, account.orders[1].id, { stopPrice: 11.5 }, 2).ok).toBe(false);
    account = resultState(processPaperQuote(account, quote(11.05, 11.09, 3), 3));
    expect(account.orders[1].status).toBe('filled'); expect(account.fills[1].price).toBe(11.09);
  });
  it('modifies working orders, rejects invalid edits atomically, and never fills cancellations', () => {
    let account = resultState(processPaperQuote(createPaperAccount(), quote(), 1));
    account = market(account, { type: 'limit', limitPrice: 9 });
    const id = account.orders[0].id;
    const invalid = modifyPaperOrder(account, id, { limitPrice: -1 }, 1);
    expect(invalid.ok).toBe(false); expect(invalid.account).toBe(account);
    account = resultState(modifyPaperOrder(account, id, { quantity: 4, limitPrice: 10.1 }, 1));
    expect(account.fills[0].quantity).toBe(4); expect(account.fills[0].price).toBe(10.02);
    expect(cancelPaperOrder(account, id, 1).ok).toBe(false);
    account = market(account, { type: 'limit', limitPrice: 9 });
    account = resultState(cancelPaperOrder(account, account.orders[1].id, 1));
    account = resultState(processPaperQuote(account, quote(8, 8.04, 2), 2));
    expect(account.fills).toHaveLength(1); expect(account.orders[1].status).toBe('cancelled');
  });
  it('expires orders before fills and requires explicit DAY expiration', () => {
    let account = resultState(processPaperQuote(createPaperAccount(), quote(), 1));
    expect(submitPaperOrder(account, order({ type: 'limit', limitPrice: 9, timeInForce: 'DAY' }), 1).ok).toBe(false);
    account = market(account, { type: 'limit', limitPrice: 9, timeInForce: 'GTD', expiresAt: 5 });
    account = resultState(processPaperQuote(account, quote(8, 8.04, 2, 5), 5));
    expect(account.orders[0].status).toBe('expired'); expect(account.fills).toEqual([]);
    account = market(account, { type: 'limit', limitPrice: 7, expiresAt: 10 });
    account = resultState(advancePaperClock(account, 10));
    expect(account.orders[1].status).toBe('expired');
  });
  it('honors stale quotes and explicit session permissions', () => {
    let account = resultState(processPaperQuote(createPaperAccount({ maxQuoteAgeSeconds: 10 }), quote(), 1));
    account = resultState(submitPaperOrder(account, order(), 20));
    expect(account.fills).toEqual([]);
    account = resultState(processPaperQuote(account, { ...quote(10, 10.1, 2, 21), fixture: false, session: 'extended' }, 21));
    expect(account.fills).toEqual([]);
    account = resultState(modifyPaperOrder(account, account.orders[0].id, { extendedHours: true }, 21));
    expect(account.fills[0].price).toBe(10.1);
    expect(paperSummary(account, 100).staleMarks).toContain(instrument.id);
  });
});

describe('account integrity, failures and replay isolation', () => {
  it('rejects invalid quantity/tick/currency and unsafe identifiers', () => {
    const account = createPaperAccount();
    for (const change of [{ quantity: 0 }, { quantity: 1.5 }, { quantity: NaN }, { type: 'limit', limitPrice: 10.001 }, { instrument: { ...instrument, currency: 'EUR' } }, { instrument: { ...instrument, id: '__proto__' } }, { commandId: '__proto__' }]) expect(submitPaperOrder(account, order(change as Partial<PaperOrderRequest>), 0).ok).toBe(false);
    expect(submitPaperOrder(account, order({ quantity: 1e-11, instrument: { ...instrument, lotSize: 1e-11 } }), 0).ok).toBe(false);
  });
  it('does not fill an oversized order or reuse short proceeds as free buying power', () => {
    let account = resultState(processPaperQuote(createPaperAccount({ initialBalance: 100 }), quote(10, 10), 1));
    account = market(account, { quantity: 11 });
    expect(account.orders[0].status).toBe('rejected'); expect(account.cash).toBe(100); expect(account.fills).toEqual([]);
    account = market(account, { side: 'sell', quantity: 10 });
    expect(account.cash).toBe(200); expect(paperSummary(account).buyingPower).toBe(0);
    account = market(account, { side: 'sell', quantity: 1 });
    expect(account.orders[2].status).toBe('rejected'); expect(account.positions[instrument.id].quantity).toBe(-10);
  });
  it('reserves working order margin and releases it after cancellation', () => {
    let account = resultState(processPaperQuote(createPaperAccount({ initialBalance: 100 }), quote(10, 10), 1));
    account = market(account, { type: 'limit', limitPrice: 9, quantity: 10 });
    expect(paperSummary(account).reservedMargin).toBe(90); expect(paperSummary(account).buyingPower).toBe(10);
    const excessive = modifyPaperOrder(account, account.orders[0].id, { quantity: 12 }, 1);
    expect(excessive.ok).toBe(false); expect(excessive.account).toBe(account);
    account = market(account, { type: 'limit', limitPrice: 9, quantity: 2 });
    expect(account.orders[1].status).toBe('rejected');
    account = resultState(cancelPaperOrder(account, account.orders[0].id, 1));
    expect(paperSummary(account).reservedMargin).toBe(0); expect(paperSummary(account).buyingPower).toBe(100);
  });
  it('preserves other reservations when a stop gaps past buying power', () => {
    let account = resultState(processPaperQuote(createPaperAccount({ initialBalance: 100 }), quote(10, 10), 1));
    account = market(account, { type: 'limit', quantity: 5, limitPrice: 8 });
    account = market(account, { type: 'stop', quantity: 5, stopPrice: 11 });
    expect(paperSummary(account).reservedMargin).toBe(95);
    account = resultState(processPaperQuote(account, quote(13, 13, 2), 2));
    expect(account.orders[0].status).toBe('working'); expect(account.orders[1].status).toBe('rejected'); expect(account.fills).toEqual([]); expect(paperSummary(account).reservedMargin).toBe(40);
  });
  it('rejects injected modification fields and expires reservations at command time', () => {
    let account = resultState(processPaperQuote(createPaperAccount({ initialBalance: 100 }), quote(10, 10), 1));
    account = market(account, { type: 'limit', quantity: 10, limitPrice: 9, expiresAt: 5 });
    const injected = modifyPaperOrder(account, account.orders[0].id, { status: 'filled', quantity: 1 } as never, 1);
    expect(injected.ok).toBe(false); expect(injected.account).toBe(account);
    account = resultState(submitPaperOrder(account, order({ type: 'limit', limitPrice: 8, quantity: 10 }), 6));
    expect(account.orders[0].status).toBe('expired'); expect(account.orders[1].status).toBe('working'); expect(paperSummary(account).reservedMargin).toBe(80);
    account = resultState(modifyPaperOrder(account, account.orders[1].id, { expiresAt: 10 }, 6));
    const expired = cancelPaperOrder(account, account.orders[1].id, 11);
    expect(expired.ok).toBe(false); expect(expired.account.orders[1].status).toBe('expired');
  });
  it('prevents duplicate commands, duplicate events, future information and clock reversal', () => {
    let account = resultState(processPaperQuote(createPaperAccount(), quote(), 1));
    const first = submitPaperOrder(account, order({ commandId: 'first' }), 1); account = resultState(first);
    const repeat = submitPaperOrder(account, order({ commandId: 'first' }), 1);
    expect(repeat.account).toBe(account); expect(repeat.orderId).toBe(first.orderId); expect(account.fills).toHaveLength(1);
    expect(submitPaperOrder(account, order({ commandId: 'first', quantity: 11 }), 1).ok).toBe(false);
    expect(processPaperQuote(account, quote(), 1).ok).toBe(false);
    expect(processPaperQuote(account, quote(10, 11, 2, 5), 2).ok).toBe(false);
    account = resultState(advancePaperClock(account, 10));
    expect(processPaperQuote(account, quote(10, 11, 3, 9), 9).ok).toBe(false);
    expect(submitPaperOrder(account, order(), 9).ok).toBe(false);
  });
  it('isolates replay account identity and reset state', () => {
    const ordinary = createPaperAccount({ id: 'live-local', runId: 'ordinary' });
    let replay = createPaperAccount({ id: 'replay-local', mode: 'replay-paper', runId: 'replay:1', initialBalance: 1000 });
    expect(processPaperQuote(ordinary, quote(), 1, 'replay:1').ok).toBe(false);
    replay = resultState(processPaperQuote(replay, quote(), 1, 'replay:1')); replay = market(replay);
    expect(ordinary.fills).toEqual([]); expect(ordinary.cash).toBe(100000);
    const reset = resetPaperAccount(replay, { initialBalance: 5000 }, 2);
    expect(reset.cash).toBe(5000); expect(reset.orders).toEqual([]); expect(reset.fills).toEqual([]); expect(reset.positions).toEqual({});
    // Reset changes the account generation while staying attached to the active replay stream.
    expect(reset.id).not.toBe(replay.id); expect(reset.runId).toBe(replay.runId);
    expect(processPaperQuote(reset, quote(10, 11, 2, 3), 3, 'replay:other').ok).toBe(false);
  });
  it('closes without reversal and preserves the accounting identity through many trades', () => {
    let account = resultState(processPaperQuote(createPaperAccount(), quote(10, 10), 1));
    account = market(account, { quantity: 10 });
    expect(closePaperPosition(account, instrument.id, 1, 11).ok).toBe(false);
    for (let i = 2; i <= 60; i++) {
      account = resultState(processPaperQuote(account, quote(10 + i / 100, 10.04 + i / 100, i), i));
      account = market(account, { side: i % 3 === 0 ? 'sell' : 'buy', quantity: 1 });
      const summary = paperSummary(account), position = account.positions[instrument.id], mark = position.quantity > 0 ? account.quotes[instrument.id].bid : account.quotes[instrument.id].ask;
      expect(Math.abs(summary.equity! - (account.cash + position.quantity * mark))).toBeLessThan(1e-7);
      expect(summary.equity).toBeCloseTo(summary.balance + summary.unrealized!, 7);
    }
    const serialized = JSON.parse(JSON.stringify(account));
    expect(paperSummary(serialized)).toEqual(paperSummary(account));
    expect(restorePaperAccount(serialized)).toEqual(account);
  });
});

describe('local account restoration and configuration', () => {
  it('round trips working, filled, cancelled and partially closed state', () => {
    let account = resultState(processPaperQuote(createPaperAccount({ initialBalance: 1000, commission: { kind: 'fixed', value: 1 } }), quote(), 1));
    account = market(account, { commandId: 'one' }); account = market(account, { type: 'limit', limitPrice: 8 });
    account = resultState(cancelPaperOrder(account, account.orders[1].id, 1));
    account = resultState(processPaperQuote(account, quote(11.98, 12.02, 2), 2)); account = market(account, { side: 'sell', quantity: 4 });
    const parsed = JSON.parse(JSON.stringify(account)), validation = validatePaperAccount(parsed);
    expect(validation.errors).toEqual([]); expect(validation.ok).toBe(true); expect(validation.account).toEqual(account); expect(validation.account).not.toBe(account);
    expect(restorePaperAccount(JSON.parse(JSON.stringify(createPaperAccount())))).toEqual(createPaperAccount());
  });
  it('rejects altered cash, positions, fees, fill history and unsafe objects', () => {
    let account = resultState(processPaperQuote(createPaperAccount(), quote(), 1)); account = market(account);
    for (const mutate of [
      (copy: PaperAccount) => { copy.cash += 1; }, (copy: PaperAccount) => { copy.fees = 5; }, (copy: PaperAccount) => { copy.positions[instrument.id].quantity = 11; }, (copy: PaperAccount) => { copy.fills[0].quantity = 11; }, (copy: PaperAccount) => { copy.fills[0].realizedGross = 1; }, (copy: PaperAccount) => { copy.orders[0].status = 'working'; }, (copy: PaperAccount) => { copy.nextId = 1; }, (copy: PaperAccount) => { copy.positions[instrument.id].instrument.symbol = {} as string; },
    ]) { const copy = structuredClone(account); mutate(copy); expect(validatePaperAccount(copy).ok).toBe(false); }
    for (const input of [null, [], {}, { ...account, virtual: false }, { ...account, cash: NaN }, JSON.parse('{"__proto__":{"polluted":true}}')]) expect(validatePaperAccount(input).ok).toBe(false);
    expect(() => restorePaperAccount(null)).toThrow();
  });
  it('applies future fee settings without rewriting historical fills or resetting cash', () => {
    let account = resultState(processPaperQuote(createPaperAccount(), quote(10, 10), 1)); account = market(account);
    const oldFill = structuredClone(account.fills[0]);
    account = resultState(configurePaperAccount(account, { commission: { kind: 'fixed', value: 2 }, oneClick: true }, 1));
    expect(account.fills[0]).toEqual(oldFill); expect(account.cash).toBe(99900); expect(account.settings.oneClick).toBe(true);
    account = market(account, { side: 'sell' }); expect(account.fees).toBe(2); expect(account.cash).toBe(99998);
    expect(validatePaperAccount(JSON.parse(JSON.stringify(account))).ok).toBe(true);
    expect(configurePaperAccount(account, { initialBalance: 1 } as never, 1).ok).toBe(false);
  });
});
