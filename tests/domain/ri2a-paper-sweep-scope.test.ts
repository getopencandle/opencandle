import { describe, expect, it } from 'vitest';
import { createPaperAccount, processPaperQuote, submitPaperOrder } from '../../src/domain/paper';
import { sweepPaperExpiry } from '../../src/domain/paper-expiry-sweep';
import type { Instrument, Quote } from '../../src/domain/types';

// An economic series with future bars (FRED) must not expire Day orders on a stock. Synthetic, virtual money.
const stock: Instrument = { id: 'SYNTHETIC:GME', symbol: 'GME', name: 'Synthetic stock', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
const quote: Quote = { instrumentId: stock.id, bid: 9.99, ask: 10, session: 'regular', fixture: true, eventTime: 1000, receivedAt: 1000, availableAt: 1000, sequence: 1 };
function account() {
  const a = processPaperQuote(createPaperAccount({ now: 0 }), quote, 1000).account;
  return submitPaperOrder(a, { instrument: stock, side: 'buy', type: 'limit', quantity: 1, limitPrice: 9, timeInForce: 'DAY', expiresAt: 5000 }, 1000).account;
}
describe('expiry sweep scoped to the chart instrument', () => {
  it('an economic series never moves the paper clock', () => {
    expect(sweepPaperExpiry(account(), 9e9, { instrumentId: 'FRED:DGS10', assetClass: 'other' })).toBeNull();
  });
  it('another stock chart does not expire this symbol, its own chart does', () => {
    expect(sweepPaperExpiry(account(), 9e9, { instrumentId: 'SYNTHETIC:OTHER', assetClass: 'stock' })).toBeNull();
    expect(sweepPaperExpiry(account(), 5000, { instrumentId: stock.id, assetClass: 'stock' })!.orders[0]!.status).toBe('expired');
  });
  it('without a source the old behaviour holds', () => {
    expect(sweepPaperExpiry(account(), 5000)!.orders[0]!.status).toBe('expired');
  });
});
