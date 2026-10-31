import { describe, expect, it } from 'vitest';
import { createPaperAccount, processPaperQuote } from '../../src/domain/paper';
import { blankBrokerDraft, placeBrokerTicket, reviewBrokerTicket, type BrokerTicketDraft } from '../../src/domain/paper-broker-ticket';
import type { Instrument, Quote } from '../../src/domain/types';

// Synthetic instrument, synthetic quote, virtual money only.
const instrument: Instrument = { id: 'SYNTHETIC:BROKER', symbol: 'BROKER', name: 'Synthetic broker', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const quote: Quote = { instrumentId: instrument.id, bid: 99.99, ask: 100.01, sequence: 1, eventTime: 1000, receivedAt: 1000, availableAt: 1000, fixture: true, session: 'regular' };
const context = () => ({ account: createPaperAccount({ initialBalance: 100000, now: 1000 }), instrument, quote, quoteSource: { key: 'synthetic broker source', state: 'ready' as const }, now: 1000 });
const draft = (changes: Partial<BrokerTicketDraft> = {}): BrokerTicketDraft => ({ ...blankBrokerDraft('buy'), quantity: '10', ...changes });

describe('broker order ticket', () => {
  it('starts as a market buy of one unit with no exits', () => {
    expect(blankBrokerDraft('sell')).toMatchObject({ side: 'sell', tab: 'market', sizing: 'units', quantity: '1', takeProfit: '', stopLoss: '' });
  });
  it('reviews a market ticket at the side quote', () => {
    const review = reviewBrokerTicket(draft(), context());
    expect(review).toMatchObject({ ok: true, quantity: 10, entry: 100.01, notional: 1000.1, risk: null, reward: null });
  });
  it('reviews a limit ticket at its own price and a sell at the bid', () => {
    expect(reviewBrokerTicket(draft({ tab: 'limit', price: '99.5' }), context())).toMatchObject({ ok: true, entry: 99.5 });
    expect(reviewBrokerTicket(draft({ side: 'sell' }), context())).toMatchObject({ ok: true, entry: 99.99 });
  });
  it('shows risk, reward and the ratio when take profit and stop loss are set', () => {
    const review = reviewBrokerTicket(draft({ takeProfit: '104.01', stopLoss: '98.01' }), context());
    expect(review).toMatchObject({ ok: true, risk: 20, reward: 40, ratio: 2 });
  });
  it('sizes by money at risk from the stop loss, rounding down to the lot', () => {
    const review = reviewBrokerTicket(draft({ sizing: 'risk', riskMoney: '100', stopLoss: '98.01' }), context());
    expect(review).toMatchObject({ ok: true, quantity: 50, risk: 100 });
  });
  it('needs a stop loss for risk sizing and a price on limit and stop tabs', () => {
    expect(reviewBrokerTicket(draft({ sizing: 'risk', riskMoney: '100' }), context())).toMatchObject({ ok: false });
    expect(reviewBrokerTicket(draft({ tab: 'limit', price: '' }), context())).toMatchObject({ ok: false, message: expect.stringContaining('limit price') });
    expect(reviewBrokerTicket(draft({ tab: 'stop', price: '' }), context())).toMatchObject({ ok: false, message: expect.stringContaining('stop price') });
  });
  it('explains a wrong-side stop loss in plain words', () => {
    const review = reviewBrokerTicket(draft({ stopLoss: '105' }), context());
    expect(review.ok).toBe(false);
  });
  it('places a market order with a bracket that fills at once and arms both exits', () => {
    const ctx = context(), live = processPaperQuote(ctx.account, quote, 1000, ctx.account.runId, instrument).account, placed = placeBrokerTicket(draft({ takeProfit: '104.01', stopLoss: '98.01' }), { ...ctx, account: live }, 'cmd-1');
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.account.positions[instrument.id].quantity).toBe(10);
    expect(placed.account.orders.filter(order => order.bracket && order.status === 'working')).toHaveLength(2);
    expect(placed.message).toContain('Buy');
  });
  it('places a resting limit and refuses a second identical command id as one order', () => {
    const ctx = context(), first = placeBrokerTicket(draft({ tab: 'limit', price: '95' }), ctx, 'cmd-2');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.account.orders.filter(order => order.status === 'working')).toHaveLength(1);
  });
});
