import { describe, expect, it } from 'vitest';
import { createPaperAccount, paperMarginBuffer, paperSummary, processPaperQuote, submitPaperOrder } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';

// Hand-computed oracles. Margin formulas are our own choice, never reference formulas.
const instrument: Instrument = { id: 'T:M', symbol: 'M', name: 'Synthetic margin test', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const quote = (bid: number, ask: number, sequence = 1): Quote => ({ instrumentId: instrument.id, bid, ask, eventTime: 1, receivedAt: 1, availableAt: 1, sequence, session: 'regular', fixture: true });

describe('margin buffer', () => {
  it('equity 100000 and margin 25000 gives 75.00', () => { expect(paperMarginBuffer({ equity: 100000, marginUsed: 25000 })).toMatchObject({ value: 75, text: '75.00', reason: null }); });
  it('rounds to two places', () => { expect(paperMarginBuffer({ equity: 3, marginUsed: 1 }).text).toBe('66.67'); });
  it('shows n/a when equity is zero or negative', () => {
    expect(paperMarginBuffer({ equity: 0, marginUsed: 0 })).toMatchObject({ value: null, text: 'n/a', reason: 'Equity is zero or negative' });
    expect(paperMarginBuffer({ equity: -5, marginUsed: 10 })).toMatchObject({ value: null, text: 'n/a', reason: 'Equity is zero or negative' });
  });
  it('shows n/a with a reason when equity or margin is unavailable', () => {
    expect(paperMarginBuffer({ equity: null, marginUsed: null }).text).toBe('n/a');
    expect(paperMarginBuffer({ equity: 100, marginUsed: null }).reason).toMatch(/quote/i);
  });
  it('is 100.00 with no margin used', () => { expect(paperMarginBuffer({ equity: 50, marginUsed: 0 }).text).toBe('100.00'); });
});

describe('account margin, available funds and order margin on the OpenCandle formulas', () => {
  it('leverage 2: 100 units marked at bid 50 use 2500; a working buy limit of 10 at 40 reserves 200', () => {
    let account = createPaperAccount({ leverage: 2, now: 0 });
    account = processPaperQuote(account, quote(49.99, 50), 1).account;
    account = submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 100 }, 1).account;
    expect(account.positions[instrument.id].quantity).toBe(100);
    account = processPaperQuote(account, quote(50, 50.01, 2), 1).account;
    account = submitPaperOrder(account, { instrument, side: 'buy', type: 'limit', quantity: 10, limitPrice: 40 }, 1).account;
    const summary = paperSummary(account, 1);
    expect(summary.marginUsed).toBe(2500);        // 100 * 50 / 2
    expect(summary.reservedMargin).toBe(200);     // 10 * 40 / 2
    expect(summary.equity).toBe(100000);          // balance 100000, unrealized (50 - 50) * 100 = 0
    expect(summary.buyingPower).toBe(194600);     // (100000 - 2500 - 200) * 2
    expect(paperMarginBuffer(summary).text).toBe('97.50'); // (100000 - 2500) / 100000 * 100
  });
});
