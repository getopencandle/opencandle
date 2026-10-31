import { describe, expect, it } from 'vitest';
import { createPaperAccount, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import { feedPaperBars, paperFeedSession, PAPER_FEED_SEQUENCE_SCALE, type PaperBarFeedInput } from '../../src/domain/paper-bar-feed';
import type { Bar, Instrument } from '../../src/domain/types';

// Synthetic instrument and bars only. Virtual money.
const instrument: Instrument = { id: 'syn-feed', symbol: 'SYNF', name: 'Synthetic feed', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' } as Instrument;
const bar = (time: number, open: number, high: number, low: number, close: number): Bar => ({ time, open, high, low, close, volume: 1 });
const live = (bars: Bar[], forming: PaperBarFeedInput['forming'] = null): PaperBarFeedInput => ({ bars, instrument, provenance: { fixture: false, session: 'all' }, live: true, forming });
const closed = (bars: Bar[], fixture = false): PaperBarFeedInput => ({ bars, instrument, provenance: { fixture, session: fixture ? 'unknown' : 'regular' }, live: false });
const feed = (account: PaperAccount, input: PaperBarFeedInput) => { const result = feedPaperBars(account, input); expect(result.message).toBe(null); expect(result.ok).toBe(true); return result; };
const order = (account: PaperAccount, request: Record<string, unknown>, now: number) => { const result = submitPaperOrder(account, { instrument, quantity: 1, ...request } as never, now); expect(result.diagnostics.map(row => row.message).join(' ')).toBe(''); expect(result.ok).toBe(true); return result.account; };

describe('paper fills against chart bars', () => {
  it('starts at the latest bar and never replays history into a new account', () => {
    const history = [bar(60, 100, 101, 90, 95), bar(120, 95, 96, 94, 95.5)];
    const result = feed(createPaperAccount(), closed(history));
    expect(result.account.quotes[instrument.id]).toMatchObject({ bid: 95.5, ask: 95.5, eventTime: 120, sequence: 120 * PAPER_FEED_SEQUENCE_SCALE });
    expect(result.account.fills).toHaveLength(0);
  });
  it('a market order fills at once at the price of the latest bar', () => {
    let account = feed(createPaperAccount(), closed([bar(60, 100, 101, 99, 100)])).account;
    account = order(account, { side: 'buy', type: 'market' }, 60);
    expect(account.fills).toHaveLength(1); expect(account.fills[0].price).toBe(100); expect(account.positions[instrument.id].quantity).toBe(1);
  });
  it('a resting buy limit fills at its own price when a later closed bar trades through it', () => {
    let account = feed(createPaperAccount(), closed([bar(60, 100, 101, 99, 100)])).account;
    account = order(account, { side: 'buy', type: 'limit', limitPrice: 97.5 }, 60);
    expect(account.fills).toHaveLength(0);
    account = feed(account, closed([bar(60, 100, 101, 99, 100), bar(120, 99, 99.5, 97, 98)])).account;
    expect(account.fills).toHaveLength(1); expect(account.fills[0].price).toBe(97.5);
  });
  it('a sell stop triggers on the forming live bar as the price falls through it', () => {
    let account = feed(createPaperAccount(), live([bar(60, 100, 100, 100, 100)])).account;
    account = order(account, { side: 'buy', type: 'market' }, 60);
    let formingSnapshot = feedPaperBars(account, live([bar(60, 100, 100, 100, 100)])).forming;
    account = order(account, { side: 'sell', type: 'stop', stopPrice: 98 }, 60);
    const step = feed(account, live([bar(60, 100, 100, 97.5, 97.5)], formingSnapshot));
    account = step.account; formingSnapshot = step.forming;
    expect(account.fills.map(fill => fill.side)).toEqual(['buy', 'sell']);
    expect(account.fills[1].price).toBe(98);
    expect(account.positions[instrument.id]).toBeUndefined();
  });
  it('live ticks on the same bar are idempotent and keep rising sequences across the next bar', () => {
    const first = feed(createPaperAccount(), live([bar(60, 100, 100, 100, 100)]));
    const again = feedPaperBars(first.account, live([bar(60, 100, 100, 100, 100)], first.forming));
    expect(again.account).toBe(first.account);
    const tick = feed(first.account, live([bar(60, 100, 100.5, 100, 100.5)], first.forming));
    const next = feed(tick.account, live([bar(60, 100, 100.5, 100, 100.4), bar(120, 100.4, 100.4, 100.4, 100.4)], tick.forming));
    const quote = next.account.quotes[instrument.id];
    expect(quote.eventTime).toBe(120); expect(quote.bid).toBe(100.4);
    expect(quote.sequence).toBeGreaterThan(tick.account.quotes[instrument.id].sequence);
  });
  it('a widened low on the forming bar fills a buy limit even when the close came back up', () => {
    let start = feed(createPaperAccount(), live([bar(60, 100, 100, 100, 100)]));
    let account = order(start.account, { side: 'buy', type: 'limit', limitPrice: 99 }, 60);
    account = feed(account, live([bar(60, 100, 100.2, 98.8, 100.1)], start.forming)).account;
    expect(account.fills).toHaveLength(1); expect(account.fills[0].price).toBe(99);
  });
  it('the synthetic fixture keeps the fixture spread and session', () => {
    const result = feed(createPaperAccount(), closed([bar(60, 100, 101, 99, 100)], true));
    expect(result.account.quotes[instrument.id]).toMatchObject({ bid: 99.99, ask: 100.01, fixture: true, session: 'unknown' });
  });
  it('an instrument the engine cannot execute is left alone without a message', () => {
    const account = createPaperAccount(), result = feedPaperBars(account, { ...live([bar(60, 100, 100, 100, 100)]), instrument: { ...instrument, assetClass: 'crypto' } });
    expect(result).toMatchObject({ ok: true, processed: 0, message: null }); expect(result.account).toBe(account);
  });
  it('maps declared sessions: all trades as regular, unknown real data is the last imported price', () => {
    expect(paperFeedSession({ fixture: false, session: 'all' })).toEqual({ session: 'regular' });
    expect(paperFeedSession({ fixture: false, session: 'unknown' })).toEqual({ session: 'unknown', basis: 'last-imported-bar' });
    expect(paperFeedSession({ fixture: true, session: 'unknown' })).toEqual({ session: 'unknown' });
  });
  it('an unknown-session import fills a ticket-style order with a session policy', () => {
    const input: PaperBarFeedInput = { bars: [bar(60, 50, 51, 49, 50)], instrument, provenance: { fixture: false, session: 'unknown' }, live: false };
    let account = feed(createPaperAccount(), input).account;
    account = order(account, { side: 'buy', type: 'market', extendedHours: false, sessionPolicy: { schemaVersion: 2, entryOutsideRth: false, takeProfitOutsideRth: false } }, 60);
    expect(account.fills).toHaveLength(1);
  });
});
