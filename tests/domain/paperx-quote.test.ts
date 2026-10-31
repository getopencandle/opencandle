import { describe, expect, it } from 'vitest';
import { createPaperAccount, processPaperQuote, submitPaperOrder, paperSummary } from '../../src/domain/paper';
import { previewPaperTicket, type PaperTicketInput } from '../../src/domain/paper-ticket';
import { lastImportedQuote, LAST_IMPORTED_LABEL, UNKNOWN_SESSION_NOTE } from '../../src/domain/paper-quote';
import { fixtureQuote } from '../../src/domain/fixtures';
import type { BarDataset, Instrument, Quote } from '../../src/domain/types';

// The quote built from the last imported bar must actually fill.
const instrument: Instrument = { id: 'LOCAL:DAILY', symbol: 'DAILY', name: 'Imported daily test file', exchange: 'LOCAL', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const bar = (time: number, close: number) => ({ time, open: close - 1, high: close + 1, low: close - 2, close, volume: 10 });
const dataset = (session: 'unknown' | 'regular' = 'unknown', bars = [bar(1577836800, 100), bar(1577923200, 101.5)]): BarDataset => ({ instrument, bars, resolution: '1D', provenance: { providerId: 'local-import', providerName: 'Local file supplied by user', datasetId: 'local:DAILY', fixture: false, coverage: 'two imported bars', asOf: 1577923200, delaySeconds: null, adjustment: 'unknown', session, timezone: 'UTC', state: 'ready', license: 'User-supplied', revision: '1', notes: [] } });
const NOW = 1_800_000_000;
const market = { instrument, side: 'buy' as const, type: 'market' as const, quantity: 10 };

describe('lastImportedQuote', () => {
  it('builds a bid=ask=close quote whose age starts at the user action', () => {
    const quote = lastImportedQuote(dataset(), NOW)!;
    expect(quote).toMatchObject({ instrumentId: 'LOCAL:DAILY', bid: 101.5, ask: 101.5, eventTime: 1577923200, receivedAt: NOW, availableAt: NOW, session: 'unknown', fixture: false, basis: 'last-imported-bar' });
    expect(Number.isSafeInteger(quote.sequence)).toBe(true);
  });
  it('carries the declared session through', () => { expect(lastImportedQuote(dataset('regular'), NOW)!.session).toBe('regular'); });
  it('uses the last closed bar for a live dataset', () => { expect(lastImportedQuote(dataset(), NOW, { live: true })!.bid).toBe(100); });
  it('keeps the only bar of a one-bar live dataset out of the quote', () => { expect(lastImportedQuote(dataset('unknown', [bar(1577836800, 100)]), NOW, { live: true })).toBeNull(); });
  it('refuses an empty dataset, a future bar and a non-positive close', () => {
    expect(lastImportedQuote(dataset('unknown', []), NOW)).toBeNull();
    expect(lastImportedQuote(dataset('unknown', [bar(NOW + 10, 5)]), NOW)).toBeNull();
    expect(lastImportedQuote(dataset('unknown', [bar(1, 0)]), NOW)).toBeNull();
  });
  it('allows an explicit event sequence so a later action can supersede an earlier one', () => { expect(lastImportedQuote(dataset(), NOW, { sequence: 77 })!.sequence).toBe(77); });
  it('labels the quote as the last imported price', () => { expect(LAST_IMPORTED_LABEL).toBe('last imported price'); expect(UNKNOWN_SESSION_NOTE).toBe('This source does not declare a trading session.'); });
});

describe('engine gates for a last-imported-bar quote', () => {
  const fillWith = (quote: Quote, request: Parameters<typeof submitPaperOrder>[1], at = NOW) => {
    const seeded = processPaperQuote(createPaperAccount({ now: 0 }), quote, at);
    expect(seeded.ok).toBe(true);
    const result = submitPaperOrder(seeded.account, request, at);
    return result.account.orders[0];
  };
  it('fills a market order at the close of an imported 2020 daily bar when the source declares no session', () => {
    const order = fillWith(lastImportedQuote(dataset(), NOW)!, market);
    expect(order.status).toBe('filled'); expect(order.averageFillPrice).toBe(101.5);
  });
  it('fills a default ticket order that carries a regular-session-only policy', () => {
    const order = fillWith(lastImportedQuote(dataset(), NOW)!, { ...market, extendedHours: false, sessionPolicy: { schemaVersion: 2, entryOutsideRth: false, takeProfitOutsideRth: false } });
    expect(order.status).toBe('filled');
  });
  it('does not fill an order whose session policy needs a declared session', () => {
    const order = fillWith(lastImportedQuote(dataset(), NOW)!, { instrument, side: 'buy', type: 'limit', quantity: 5, limitPrice: 102, extendedHours: true, sessionPolicy: { schemaVersion: 2, entryOutsideRth: true, takeProfitOutsideRth: false } });
    expect(order.status).toBe('working');
  });
  it('refuses a last-imported-bar quote that belongs to an earlier action', () => {
    const quote = lastImportedQuote(dataset(), NOW)!;
    const seeded = processPaperQuote(createPaperAccount({ now: 0 }), quote, NOW);
    const later = submitPaperOrder(seeded.account, market, NOW + 1);
    expect(later.account.orders[0].status).toBe('working');
  });
  it('gates every other quote exactly as before', () => {
    const unknown: Quote = { instrumentId: instrument.id, bid: 99, ask: 99, eventTime: NOW, receivedAt: NOW, availableAt: NOW, sequence: 1, session: 'unknown', fixture: false };
    expect(fillWith(unknown, market).status).toBe('working');
    const fixture = fixtureQuote(instrument.id, bar(NOW, 50), 1);
    expect(fillWith(fixture, market).status).toBe('filled');
    const regular: Quote = { ...unknown, session: 'regular' };
    expect(fillWith(regular, market).status).toBe('filled');
  });
  it('rejects a basis value other than last-imported-bar and a fixture-flagged imported quote', () => {
    const base = lastImportedQuote(dataset(), NOW)!;
    expect(processPaperQuote(createPaperAccount({ now: 0 }), { ...base, basis: 'other' } as unknown as Quote, NOW).ok).toBe(false);
    expect(processPaperQuote(createPaperAccount({ now: 0 }), { ...base, fixture: true }, NOW).ok).toBe(false);
  });
  it('lets the ticket preview accept the quote and show the informational notes', () => {
    const quote = lastImportedQuote(dataset(), NOW)!;
    const input: PaperTicketInput = { schemaVersion: 1, side: 'buy', type: 'market', quantity: { kind: 'units', value: '3' }, limit: null, stop: null, validity: { kind: 'day' }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null };
    const result = previewPaperTicket(input, { account: createPaperAccount({ now: 0 }), instrument, quote, quoteSource: { key: 'local:DAILY', state: 'ready' }, now: NOW });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.notices).toContain(UNKNOWN_SESSION_NOTE);
      expect(result.value.notices.some(text => text.includes('last imported price'))).toBe(true);
      expect(result.value.sizing.entryPrice).toBe(101.5);
    }
  });
  it('marks open positions at the imported price', () => {
    const quote = lastImportedQuote(dataset(), NOW)!;
    const seeded = processPaperQuote(createPaperAccount({ now: 0 }), quote, NOW);
    const filled = submitPaperOrder(seeded.account, market, NOW).account;
    expect(paperSummary(filled, NOW).unrealized).toBe(0);
  });
});
