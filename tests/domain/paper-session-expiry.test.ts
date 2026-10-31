import { describe, expect, it } from 'vitest';
import { advancePaperClock, createPaperAccount, PAPER_POLICIES, processPaperQuote } from '../../src/domain/paper';
import { newYorkWallClockMs, paperDayExpiry, paperSessionBound, PAPER_DAY_FALLBACK_SECONDS } from '../../src/domain/paper-expiry';
import { materializePaperTicket, previewPaperTicket, type PaperTicketInput } from '../../src/domain/paper-ticket';
import { submitPaperOrder } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';

// Day orders end at the session close, not 24 h after placement.
// Synthetic instruments and quotes, virtual money only. Times are written as New York wall clock and checked as UTC.
const us: Instrument = { id: 'SYNTHETIC:DAYCLOSE', symbol: 'DAYCLOSE', name: 'Synthetic Day close oracle', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'America/New_York', tickSize: 0.01, lotSize: 1 };
const utc: Instrument = { ...us, id: 'SYNTHETIC:UTC', symbol: 'UTCFIX', timezone: 'UTC' };
const crypto: Instrument = { ...us, id: 'SYNTHETIC:COIN', symbol: 'COIN', assetClass: 'crypto', timezone: 'America/New_York' };
/** Unix seconds of a New York wall-clock time. */
const ny = (year: number, month: number, day: number, hour: number, minute = 0) => newYorkWallClockMs(year, month, day, hour * 60 + minute) / 1000;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

describe('paperDayExpiry: US equity session close', () => {
  it('converts New York wall clock across daylight saving (EDT -4, EST -5)', () => {
    expect(iso(ny(2026, 10, 21, 16))).toBe('2026-10-21T20:00:00.000Z');
    expect(iso(ny(2026, 11, 2, 16))).toBe('2026-11-02T21:00:00.000Z');
  });
  it('a regular-hours order placed during the session ends at 16:00 the same day', () => {
    expect(iso(paperDayExpiry(ny(2026, 10, 21, 10), us, false))).toBe('2026-10-21T20:00:00.000Z');
  });
  it('a regular-hours order placed in the pre-market also ends at 16:00 the same day', () => {
    expect(iso(paperDayExpiry(ny(2026, 10, 21, 5), us, false))).toBe('2026-10-21T20:00:00.000Z');
  });
  it('an extended-hours order ends at 20:00 the same day', () => {
    expect(iso(paperDayExpiry(ny(2026, 10, 21, 10), us, true))).toBe('2026-10-22T00:00:00.000Z');
    expect(iso(paperDayExpiry(ny(2026, 10, 21, 17), us, true))).toBe('2026-10-22T00:00:00.000Z');
  });
  it('after the close it is the next trading day close', () => {
    expect(iso(paperDayExpiry(ny(2026, 10, 21, 17), us, false))).toBe('2026-10-22T20:00:00.000Z');
    expect(iso(paperDayExpiry(ny(2026, 10, 21, 16), us, false))).toBe('2026-10-22T20:00:00.000Z');
    expect(iso(paperDayExpiry(ny(2026, 10, 21, 20, 30), us, true))).toBe('2026-10-23T00:00:00.000Z');
  });
  it('skips the weekend and NYSE holidays (Thanksgiving 2026-11-26)', () => {
    expect(iso(paperDayExpiry(ny(2026, 10, 23, 21), us, true))).toBe('2026-10-27T00:00:00.000Z');
    expect(iso(paperDayExpiry(ny(2026, 10, 24, 12), us, false))).toBe('2026-10-26T20:00:00.000Z');
    expect(iso(paperDayExpiry(ny(2026, 11, 25, 17), us, false))).toBe('2026-11-27T21:00:00.000Z');
  });
  it('crosses the end of daylight saving time (Friday 2026-10-30 to Monday 2026-11-02)', () => {
    expect(iso(paperDayExpiry(ny(2026, 10, 30, 17), us, false))).toBe('2026-11-02T21:00:00.000Z');
  });
  it('uses an early close only when the host supplies the calendar (us-market-hours does not expose one yet)', () => {
    const at = ny(2026, 11, 27, 9);
    expect(iso(paperDayExpiry(at, us, false))).toBe('2026-11-27T21:00:00.000Z');
    const earlyClose = (date: string) => date === '2026-11-27' ? 780 : null;
    expect(iso(paperDayExpiry(at, us, false, { earlyClose }))).toBe('2026-11-27T18:00:00.000Z');
    expect(iso(paperDayExpiry(at, us, true, { earlyClose }))).toBe('2026-11-27T22:00:00.000Z');
    // A throwing or nonsensical calendar falls back to the ordinary close.
    expect(iso(paperDayExpiry(at, us, false, { earlyClose: () => { throw new Error('SYNTHETIC calendar failure'); } }))).toBe('2026-11-27T21:00:00.000Z');
    expect(iso(paperDayExpiry(at, us, false, { earlyClose: () => 1300 }))).toBe('2026-11-27T21:00:00.000Z');
  });
  it('instruments without a US equity session keep the 86400 s Day policy', () => {
    const at = ny(2026, 10, 21, 10);
    expect(paperSessionBound(utc)).toBe(false);
    expect(paperSessionBound(crypto)).toBe(false);
    expect(paperDayExpiry(at, utc, false)).toBe(at + PAPER_DAY_FALLBACK_SECONDS);
    expect(paperDayExpiry(at, crypto, true)).toBe(at + PAPER_DAY_FALLBACK_SECONDS);
  });
  it('the policy text describes the session close instead of a 24 h lifetime for US equities', () => {
    const policy = PAPER_POLICIES.find(text => text.startsWith('New OpenCandle tickets default to Day'))!;
    expect(policy).toContain('16:00 New York time for regular-hours orders, 20:00 for extended-hours orders');
    expect(policy).not.toContain('86400 seconds from accepted placement');
  });
});

describe('Day tickets materialize and expire at the session close', () => {
  const now = ny(2026, 10, 21, 8);
  const quote: Quote = { instrumentId: us.id, bid: 9.99, ask: 10, eventTime: now, receivedAt: now, availableAt: now, sequence: 1, fixture: true, session: 'regular' };
  const account = processPaperQuote(createPaperAccount({ initialBalance: 1000, now }), quote, now, undefined, us).account;
  const input = (entryOutsideRth: boolean): PaperTicketInput => ({ schemaVersion: 1, side: 'buy', type: 'limit', quantity: { kind: 'units', value: '1' }, limit: { kind: 'price', value: '9' }, stop: null, validity: { kind: 'day' }, entryOutsideRth, takeProfitOutsideRth: false, exits: null });
  const materialize = (entryOutsideRth: boolean) => {
    const context = { account, instrument: us, quote, quoteSource: { key: 'SYNTHETIC day close source', state: 'ready' as const }, now };
    const preview = previewPaperTicket(input(entryOutsideRth), context);
    if (!preview.ok) throw new Error(preview.diagnostics.map(row => row.message).join(' '));
    const request = materializePaperTicket(preview.value, input(entryOutsideRth), context);
    if (!request.ok) throw new Error(request.diagnostics.map(row => row.message).join(' '));
    return request.value;
  };
  it('a pre-market regular-hours limit ends at 16:00 and an extended-hours limit at 20:00', () => {
    expect(materialize(false)).toMatchObject({ timeInForce: 'DAY', expiresAt: ny(2026, 10, 21, 16), extendedHours: false });
    expect(materialize(true)).toMatchObject({ timeInForce: 'DAY', expiresAt: ny(2026, 10, 21, 20), extendedHours: true });
  });
  it('the engine expires the order at the close, not 24 h later', () => {
    const placed = submitPaperOrder(account, materialize(false), now);
    expect(placed.ok, JSON.stringify(placed.diagnostics)).toBe(true);
    const before = advancePaperClock(placed.account, ny(2026, 10, 21, 15, 59)).account;
    expect(before.orders[0].status).toBe('working');
    const after = advancePaperClock(before, ny(2026, 10, 21, 16)).account;
    expect(after.orders[0].status).toBe('expired');
  });
});
