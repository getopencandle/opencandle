import { describe, expect, it } from 'vitest';
import { createPaperAccount, processPaperQuote, submitPaperOrder } from '../../src/domain/paper';
import { blankBrokerDraft, placeBrokerTicket, reviewBrokerTicket } from '../../src/domain/paper-broker-ticket';
import type { Instrument, Quote } from '../../src/domain/types';

// The ticket's Trailing tab places a trailing-stop order by price distance or percent. Synthetic instrument, virtual money.
const instrument: Instrument = { id: 'SYN:TT', symbol: 'TT', name: 'Synthetic', exchange: 'SYNTHETIC', assetClass: 'stock', currency: 'USD', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const quote: Quote = { instrumentId: instrument.id, bid: 99.99, ask: 100.01, sequence: 1, eventTime: 1, receivedAt: 1, availableAt: 1, fixture: true, session: 'regular' };
const account = () => { const a = createPaperAccount({ initialBalance: 100000, now: 0 }), fed = processPaperQuote(a, quote, 1, a.runId, instrument); const bought = submitPaperOrder(fed.account, { instrument, side: 'buy', type: 'market', quantity: 1 }, 1); if (!bought.ok) throw new Error('setup'); return bought.account; };
const context = (a = account()) => ({ account: a, instrument, quote, quoteSource: null, now: 1 });

describe('ticket Trailing tab', () => {
  it('places a trailing stop by distance, and by percent', () => {
    for (const [mode, key, amount] of [['price', 'trailDistance', '0.5'], ['percent', 'trailPercent', '1.5']] as const) {
      const draft = { ...blankBrokerDraft('sell'), tab: 'trailing-stop' as const, trailMode: mode, trailAmount: amount };
      const ctx = context();
      expect(reviewBrokerTicket(draft, ctx).ok).toBe(true);
      const placed = placeBrokerTicket(draft, ctx, 'trail-' + mode);
      expect(placed.ok, placed.ok ? '' : placed.message).toBe(true);
      if (placed.ok) expect(placed.account.orders.at(-1)).toMatchObject({ type: 'trailing-stop', side: 'sell', quantity: 1, [key]: Number(amount) });
    }
  });
  it('says what is wrong before placing', () => {
    const draft = { ...blankBrokerDraft('sell'), tab: 'trailing-stop' as const };
    expect(reviewBrokerTicket(draft, context())).toEqual({ ok: false, message: 'Enter the trail amount as a number above zero.' });
    expect(reviewBrokerTicket({ ...draft, trailAmount: '0.005' }, context()).ok).toBe(false);
    expect(reviewBrokerTicket({ ...draft, trailMode: 'percent', trailAmount: '100' }, context()).ok).toBe(false);
  });
});
