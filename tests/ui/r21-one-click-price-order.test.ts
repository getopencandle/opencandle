import { describe, expect, it } from 'vitest';
import { createPaperAccount, processPaperQuote } from '../../src/domain/paper';
import { placePaperPreset, type PaperPreset, type PaperPresetInput } from '../../src/domain/paper-presets';
import { oneClickPriceOrder } from '../../src/ui/one-click-price-order';
import type { Instrument, Quote } from '../../src/domain/types';

// One-click price scale + ("Price anchored to selected level; off/on tested") and
// "Default off; on immediately places", requirements/analysis.json. Synthetic data, virtual money only.
const instrument: Instrument = { id: 'T:OC', symbol: 'OC', name: 'Synthetic one-click test', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const quote: Quote = { instrumentId: instrument.id, bid: 99.98, ask: 100.02, eventTime: 1, receivedAt: 1, availableAt: 1, sequence: 1, session: 'regular', fixture: true };
const input = (overrides: Partial<PaperPresetInput> = {}): PaperPresetInput => ({ quantity: { kind: 'units', value: '7' }, type: 'market', limit: null, stop: null, validity: { kind: 'day' }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null, ...overrides });
const preset = (overrides: Partial<PaperPreset> = {}): PaperPreset => ({ schemaVersion: 1, id: 'p1', name: 'Seven', side: 'buy', input: input(), ...overrides });
const context = () => ({ account: processPaperQuote(createPaperAccount({ now: 0 }), quote, 1).account, instrument, quote, quoteSource: { key: 'src', state: 'ready' as const }, now: 1 });

describe('placePaperPreset at a clicked stop price', () => {
  it('places a stop at the exact clicked price, with the preset quantity, and drops extended hours', () => {
    const placed = placePaperPreset(preset({ input: input({ type: 'limit', limit: { kind: 'side-ticks', value: '0' }, entryOutsideRth: true }) }), 'buy', context(), { commandId: 's1', stopPriceText: '101.5' });
    expect(placed.ok && placed.account.orders[0]).toMatchObject({ side: 'buy', type: 'stop', stopPrice: 101.5, quantity: 7, status: 'working', extendedHours: false });
    expect(placed.ok && placed.account.orders[0].limitPrice).toBeUndefined();
  });
  it('refuses a clicked stop price that is not on a tick', () => {
    const off = placePaperPreset(preset(), 'sell', context(), { commandId: 's2', stopPriceText: '98.505' });
    expect(off.ok).toBe(false);
  });
  it('refuses both clicked prices at once', () => {
    const both = placePaperPreset(preset(), 'buy', context(), { commandId: 's3', stopPriceText: '101', limitPriceText: '99' });
    expect(both.ok).toBe(false);
  });
});

describe('oneClickPriceOrder: the price scale + order rows', () => {
  const base = { order: { side: 'sell' as const, orderType: 'limit' as const }, priceText: '101.25', commandId: 'c1' };
  it('one-click off: opens the ticket (nothing placed)', () => {
    expect(oneClickPriceOrder({ ...base, oneClick: false, preset: preset(), context: context() })).toMatchObject({ kind: 'ticket' });
  });
  it('one-click on without a selected preset: opens the ticket, since the quantity is unknown', () => {
    expect(oneClickPriceOrder({ ...base, oneClick: true, preset: null, context: context() })).toMatchObject({ kind: 'ticket' });
  });
  it('one-click on: places the order at once, anchored to the clicked level, on the row side and type', () => {
    const limit = oneClickPriceOrder({ ...base, oneClick: true, preset: preset(), context: context() });
    expect(limit.kind).toBe('placed');
    if (limit.kind !== 'placed') return;
    expect(limit.account.orders.find(order => order.id === limit.orderId)).toMatchObject({ side: 'sell', type: 'limit', limitPrice: 101.25, quantity: 7, status: 'working' });
    expect(limit.message).toBe('Virtual sell limit 7 OC at 101.25 placed with one click.');
    const stop = oneClickPriceOrder({ ...base, order: { side: 'buy', orderType: 'stop' }, oneClick: true, preset: preset(), context: context() });
    expect(stop.kind === 'placed' && stop.account.orders.find(order => order.id === stop.orderId)).toMatchObject({ side: 'buy', type: 'stop', stopPrice: 101.25 });
  });
  it('uses the chart quantity box when it holds a unit count, like the Buy and Sell buttons', () => {
    const placed = oneClickPriceOrder({ ...base, oneClick: true, preset: preset(), quantityText: '3', context: context() });
    expect(placed.kind === 'placed' && placed.account.orders[0].quantity).toBe(3);
    const ignored = oneClickPriceOrder({ ...base, oneClick: true, preset: preset(), quantityText: 'abc', context: context() });
    expect(ignored.kind === 'placed' && ignored.account.orders[0].quantity).toBe(7);
  });
  it('a refused placement changes nothing and explains why', () => {
    const ctx = context();
    const refused = oneClickPriceOrder({ ...base, priceText: '101.255', oneClick: true, preset: preset(), context: ctx });
    expect(refused.kind).toBe('refused');
    expect(ctx.account.orders).toHaveLength(0);
  });
});
