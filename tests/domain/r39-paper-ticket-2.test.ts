import { describe, expect, it } from 'vitest';
import { createPaperAccount, processPaperQuote } from '../../src/domain/paper';
import { BROKER_DURATIONS, blankBrokerDraft, brokerTicketInput, placeBrokerTicket, reviewBrokerTicket, type BrokerTicketDraft } from '../../src/domain/paper-broker-ticket';
import type { Instrument, Quote } from '../../src/domain/types';
import { parseChartDateTimeInput } from '../../src/ui/chart-time-text';

// Synthetic instrument, synthetic quote, virtual money only.
const instrument: Instrument = { id: 'SYNTHETIC:TICKET39', symbol: 'TKT', name: 'Synthetic ticket 39', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const NOW = 1000;
const quote: Quote = { instrumentId: instrument.id, bid: 99.99, ask: 100.01, sequence: 1, eventTime: NOW, receivedAt: NOW, availableAt: NOW, fixture: true, session: 'regular' };
const context = () => { const account = createPaperAccount({ initialBalance: 100000, now: NOW }); return { account: processPaperQuote(account, quote, NOW, account.runId, instrument).account, instrument, quote, quoteSource: { key: 'synthetic ticket 39 source', state: 'ready' as const }, now: NOW }; };
const draft = (changes: Partial<BrokerTicketDraft> = {}): BrokerTicketDraft => ({ ...blankBrokerDraft('buy'), quantity: '10', ...changes });
const placed = (changes: Partial<BrokerTicketDraft>, zone = 'UTC') => {
  const ctx = context(), result = placeBrokerTicket(draft(changes), ctx, 'cmd-r39', value => parseChartDateTimeInput(value, zone));
  if (!result.ok) throw new Error(result.message);
  return result.account.orders.filter(order => !order.bracket).at(-1)!;
};

describe('Stop limit on the Buy/Sell ticket', () => {
  it('reviews at the limit price and places a working stop-limit order with both prices', () => {
    expect(reviewBrokerTicket(draft({ tab: 'stop-limit', price: '101', limitPrice: '101.5' }), context())).toMatchObject({ ok: true, entry: 101.5, quantity: 10 });
    expect(placed({ tab: 'stop-limit', price: '101', limitPrice: '101.5' })).toMatchObject({ type: 'stop-limit', stopPrice: 101, limitPrice: 101.5, status: 'working', side: 'buy' });
  });
  it('asks for each missing price in plain words', () => {
    expect(reviewBrokerTicket(draft({ tab: 'stop-limit', price: '', limitPrice: '101.5' }), context())).toEqual({ ok: false, message: 'Enter a stop price.' });
    expect(reviewBrokerTicket(draft({ tab: 'stop-limit', price: '101', limitPrice: '' }), context())).toEqual({ ok: false, message: 'Enter a limit price.' });
  });
  it('names the order type in words in the placed message', () => {
    const result = placeBrokerTicket(draft({ tab: 'stop-limit', price: '101', limitPrice: '101.5' }), context(), 'cmd-msg');
    expect(result.ok && result.message).toBe('Buy stop limit 10 placed with virtual funds.');
  });
});

describe('time in force: Day, GTC, GTD, Week and Month', () => {
  it('lists Day, GTC, GTD, Week and Month as choices (the Week and Month hold was released)', () => {
    expect(BROKER_DURATIONS.map(row => [row.id, row.unavailable ?? null])).toEqual([['day', null], ['gtc', null], ['gtd', null], ['week', null], ['month', null]]);
    expect(BROKER_DURATIONS.map(row => row.label)).toEqual(['Day', 'Good till cancelled (GTC)', 'Good till date (GTD)', 'Week: until the last session close of the week', 'Month: until the last session close of the month']);
  });
  it('Day stays the default and places a Day order', () => {
    expect(blankBrokerDraft('buy').duration ?? 'day').toBe('day');
    expect(placed({ tab: 'limit', price: '95' })).toMatchObject({ timeInForce: 'DAY' });
  });
  it('GTC places an order with no expiry', () => {
    const order = placed({ tab: 'limit', price: '95', duration: 'gtc' });
    expect(order.timeInForce).toBe('GTC');
    expect(order.expiresAt).toBeUndefined();
    expect(order.status).toBe('working');
  });
  it('GTD reads the picked date and time on the chart wall clock', () => {
    const order = placed({ tab: 'limit', price: '95', duration: 'gtd', expiresAt: '2026-10-24T16:00' }, 'America/New_York');
    expect(order).toMatchObject({ timeInForce: 'GTD', expiresAt: Date.UTC(2026, 9, 24, 20, 0) / 1000 });
    expect(brokerTicketInput(draft({ duration: 'gtd', expiresAt: '2026-10-24T16:00' }), 'USD', '1').validity).toEqual({ kind: 'manual-expiry', expiresAt: Date.UTC(2026, 9, 24, 16, 0) / 1000 });
  });
  it('GTD refuses a missing, malformed or passed expiry', () => {
    expect(reviewBrokerTicket(draft({ tab: 'limit', price: '95', duration: 'gtd', expiresAt: '' }), context())).toEqual({ ok: false, message: 'Choose an expiry date and time.' });
    expect(reviewBrokerTicket(draft({ tab: 'limit', price: '95', duration: 'gtd', expiresAt: 'tomorrow' }), context())).toEqual({ ok: false, message: 'Choose a valid date and time.' });
    expect(reviewBrokerTicket(draft({ tab: 'limit', price: '95', duration: 'gtd', expiresAt: '1970-01-01T00:10' }), context())).toMatchObject({ ok: false, message: expect.stringContaining('expiry') });
  });
  it('a Week or Month draft keeps its own validity (resolved to the period close at placement)', () => {
    expect(brokerTicketInput(draft({ duration: 'month' }), 'USD').validity).toEqual({ kind: 'month' });
    expect(brokerTicketInput(draft({ duration: 'week' }), 'USD').validity).toEqual({ kind: 'week' });
  });
});

describe('take profit and stop loss as price, ticks, percent or money', () => {
  it('ticks go to the engine as ticks from the entry', () => {
    const review = reviewBrokerTicket(draft({ takeProfit: '100', takeProfitMode: 'ticks', stopLoss: '50', stopLossMode: 'ticks' }), context());
    expect(review).toMatchObject({ ok: true, entry: 100.01, takeProfitPrice: 101.01, stopLossPrice: 99.51, reward: 10, risk: 5, ratio: 2 });
    const order = placed({ takeProfit: '100', takeProfitMode: 'ticks', stopLoss: '50', stopLossMode: 'ticks' });
    expect(order.ticket?.input.exits?.levels[0]).toMatchObject({ takeProfit: { kind: 'ticks', value: '100' }, stopLoss: { kind: 'ticks', value: '50' } });
  });
  it('percent of the entry price rounds to the nearest tick (buy and sell)', () => {
    expect(reviewBrokerTicket(draft({ takeProfit: '1', takeProfitMode: 'percent', stopLoss: '0.5', stopLossMode: 'percent' }), context())).toMatchObject({ ok: true, takeProfitPrice: 101.01, stopLossPrice: 99.51 });
    expect(reviewBrokerTicket(draft({ side: 'sell', takeProfit: '1', takeProfitMode: 'percent', stopLoss: '1', stopLossMode: 'percent' }), context())).toMatchObject({ ok: true, entry: 99.99, takeProfitPrice: 98.99, stopLossPrice: 100.99 });
  });
  it('money is the profit or loss of the whole order, rounded to the nearest tick', () => {
    expect(reviewBrokerTicket(draft({ takeProfit: '25', takeProfitMode: 'money', stopLoss: '12.34', stopLossMode: 'money' }), context())).toMatchObject({ ok: true, takeProfitPrice: 102.51, stopLossPrice: 98.78 });
    const order = placed({ takeProfit: '25', takeProfitMode: 'money' });
    expect(order.exits?.levels[0]).toMatchObject({ takeProfit: 102.51 });
  });
  it('risk sizing works with a percent stop and refuses a money stop', () => {
    expect(reviewBrokerTicket(draft({ sizing: 'risk', riskMoney: '100', stopLoss: '1', stopLossMode: 'percent' }), context())).toMatchObject({ ok: true, quantity: 100, stopLossPrice: 99.01, risk: 100 });
    expect(reviewBrokerTicket(draft({ sizing: 'risk', riskMoney: '100', stopLoss: '10', stopLossMode: 'money' }), context())).toEqual({ ok: false, message: 'Risk sizing needs the stop loss as a price, ticks or percent.' });
  });
  it('money take profit with risk sizing uses the sized quantity', () => {
    expect(reviewBrokerTicket(draft({ sizing: 'risk', riskMoney: '100', stopLoss: '99.01', takeProfit: '200', takeProfitMode: 'money' }), context())).toMatchObject({ ok: true, quantity: 100, takeProfitPrice: 102.01, reward: 200 });
  });
  it('refuses a distance under one tick and a non-number in plain words', () => {
    expect(reviewBrokerTicket(draft({ takeProfit: '0.001', takeProfitMode: 'percent' }), context())).toEqual({ ok: false, message: 'The take profit is less than one tick from the entry.' });
    expect(reviewBrokerTicket(draft({ stopLoss: 'abc', stopLossMode: 'money' }), context())).toEqual({ ok: false, message: 'Enter the stop loss as a number above zero.' });
  });
  it('price mode is unchanged', () => {
    expect(reviewBrokerTicket(draft({ takeProfit: '104.01', stopLoss: '98.01' }), context())).toMatchObject({ ok: true, risk: 20, reward: 40, ratio: 2, takeProfitPrice: 104.01, stopLossPrice: 98.01 });
  });
});
