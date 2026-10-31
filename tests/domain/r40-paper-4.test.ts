import { describe, expect, it } from 'vitest';
import { createPaperAccount, processPaperQuote, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import { restorePaperState, serializePaperState, setBookPresets } from '../../src/domain/paper-book';
import { paperExportTable, toCsv } from '../../src/domain/paper-export';
import { applyPaperPreset, placePaperPreset, presetInputFromTicket, presetSummary, savePaperPreset, validatePaperPreset, validatePaperPresets, type PaperPreset } from '../../src/domain/paper-presets';
import { materializePaperTicket, paperTicketDayClose, previewPaperTicket, type PaperTicketInput } from '../../src/domain/paper-ticket';
import type { Instrument, Quote } from '../../src/domain/types';

// GTC in paper presets, zone-aware CSV columns, and the Day close on NYSE early-close days.
// Synthetic instruments and quotes, virtual money only.
const instrument: Instrument = { id: 'SYNTHETIC:PAPER4', symbol: 'PP4', name: 'Synthetic paper four', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const NOW = 1000;
const quote: Quote = { instrumentId: instrument.id, bid: 99.99, ask: 100.01, sequence: 1, eventTime: NOW, receivedAt: NOW, availableAt: NOW, fixture: true, session: 'regular' };
const funded = (): PaperAccount => { const account = createPaperAccount({ initialBalance: 100000, now: NOW }); return processPaperQuote(account, quote, NOW, account.runId, instrument).account; };
const context = (account = funded()) => ({ account, instrument, quote, quoteSource: { key: 'synthetic paper four source', state: 'ready' as const }, now: NOW });
const ticket = (validity: PaperTicketInput['validity']): PaperTicketInput => ({ schemaVersion: 1, side: 'buy', type: 'limit', quantity: { kind: 'units', value: '5' }, limit: { kind: 'side-ticks', value: '-2' }, stop: null, validity, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null });

describe('presets keep GTC', () => {
  it('saving a preset from a GTC ticket saves GTC', () => {
    expect(presetInputFromTicket(ticket({ kind: 'gtc' })).validity).toEqual({ kind: 'gtc' });
    const saved = savePaperPreset([], { name: 'Resting bid', side: 'buy', input: presetInputFromTicket(ticket({ kind: 'gtc' })) }, { idFactory: () => 'pp4-1' });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.presets[0].input.validity).toEqual({ kind: 'gtc' });
  });
  it('applying a GTC preset restores GTC, on either side, whole or with saved fields', () => {
    const preset = validatePaperPreset({ schemaVersion: 1, id: 'pp4-gtc', name: 'Resting bid', side: 'buy', input: presetInputFromTicket(ticket({ kind: 'gtc' })) });
    expect(applyPaperPreset(preset, 'buy', NOW).input.validity).toEqual({ kind: 'gtc' });
    expect(applyPaperPreset(preset, 'sell', NOW).input.validity).toEqual({ kind: 'gtc' });
    const partial = validatePaperPreset({ ...preset, fields: ['validity'] });
    expect(applyPaperPreset(partial, 'buy', NOW, ticket({ kind: 'day' })).input.validity).toEqual({ kind: 'gtc' });
    expect(applyPaperPreset(validatePaperPreset({ ...preset, fields: ['quantity'] }), 'buy', NOW, ticket({ kind: 'gtc' })).input.validity).toEqual({ kind: 'gtc' });
  });
  it('the chart button summary says GTC and one-click placement places a GTC order with a GTC record', () => {
    const preset = validatePaperPreset({ schemaVersion: 1, id: 'pp4-gtc', name: 'Resting bid', side: 'buy', input: presetInputFromTicket(ticket({ kind: 'gtc' })) });
    expect(presetSummary(preset)).toBe('Buy limit, 5 units, 2 ticks below the ask, GTC');
    const placed = placePaperPreset(preset, 'buy', context(), { commandId: 'pp4-one-click' });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const order = placed.account.orders.find(row => row.id === placed.orderId)!;
    expect(order).toMatchObject({ timeInForce: 'GTC', status: 'working', limitPrice: 99.99 });
    expect(order.expiresAt).toBeUndefined();
    expect(order.ticket?.input.validity).toEqual({ kind: 'gtc' });
  });
  it('a GTC validity with extra fields is refused', () => {
    const input = { ...presetInputFromTicket(ticket({ kind: 'gtc' })), validity: { kind: 'gtc', expiresAt: 5000 } };
    expect(() => validatePaperPreset({ schemaVersion: 1, id: 'pp4-bad', name: 'Bad', side: 'buy', input })).toThrow('Preset validity must be Day, GTC or a manual expiry.');
    expect(() => validatePaperPreset({ schemaVersion: 1, id: 'pp4-bad', name: 'Bad', side: 'buy', input: { ...input, validity: { kind: 'week' } } })).toThrow('Preset validity must be Day, GTC or a manual expiry.');
  });
  it('retained existing validity still saves as Day', () => {
    expect(presetInputFromTicket(ticket({ kind: 'retain-existing', orderId: 'x' })).validity).toEqual({ kind: 'day' });
  });
});

describe('migration: presets saved before GTC restore unchanged', () => {
  // A book saved before this lane: Day, explicit expiry (future and passed) and a saved-fields preset. Text taken as stored JSON.
  const savedJson = JSON.stringify([
    { schemaVersion: 1, id: 'old-day', name: 'Old day', side: 'buy', input: { quantity: { kind: 'units', value: '10' }, type: 'limit', limit: { kind: 'side-ticks', value: '-2' }, stop: null, validity: { kind: 'day' }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null } },
    { schemaVersion: 1, id: 'old-gtd', name: 'Old expiry', side: 'sell', input: { quantity: { kind: 'notional', value: '500', currency: 'USD' }, type: 'stop', limit: null, stop: { kind: 'price', value: '95' }, validity: { kind: 'manual-expiry', expiresAt: 90000 }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null } },
    { schemaVersion: 1, id: 'old-passed', name: 'Old passed', side: 'buy', input: { quantity: { kind: 'units', value: '1' }, type: 'market', limit: null, stop: null, validity: { kind: 'manual-expiry', expiresAt: 10 }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null } },
    { schemaVersion: 1, id: 'old-fields', name: 'Old fields', side: 'buy', input: { quantity: { kind: 'units', value: '3' }, type: 'limit', limit: { kind: 'price', value: '98' }, stop: null, validity: { kind: 'day' }, entryOutsideRth: true, takeProfitOutsideRth: false, exits: null }, fields: ['quantity', 'validity'] },
  ]);
  it('validates and serializes byte for byte', () => {
    expect(JSON.stringify(validatePaperPresets(JSON.parse(savedJson)))).toBe(savedJson);
    const state = setBookPresets({ paper: funded(), book: null }, JSON.parse(savedJson));
    const stored = JSON.parse(JSON.stringify(serializePaperState(state)));
    const restored = restorePaperState(stored.paper, stored.paperBook);
    expect(JSON.stringify(restored.book!.presets)).toBe(savedJson);
  });
  it('applies exactly as before (Day stays Day, a future expiry stays explicit, a passed one falls back to Day)', () => {
    const presets = validatePaperPresets(JSON.parse(savedJson)), [day, gtd, passed, fields] = presets;
    expect(applyPaperPreset(day, 'buy', NOW).input.validity).toEqual({ kind: 'day' });
    expect(applyPaperPreset(gtd, 'sell', NOW).input.validity).toEqual({ kind: 'manual-expiry', expiresAt: 90000 });
    expect(applyPaperPreset(passed, 'buy', NOW)).toMatchObject({ input: { validity: { kind: 'day' } }, notes: ['The saved expiry has passed, so Day applies'] });
    expect(applyPaperPreset(fields, 'buy', NOW, ticket({ kind: 'gtc' })).input.validity).toEqual({ kind: 'day' });
    expect(presets.map(presetSummary)).toEqual([
      'Buy limit, 10 units, 2 ticks below the ask, Day',
      'Sell stop, 500 USD, stop at 95, expires 1970-01-02T01:00:00Z',
      'Buy market, 1 units, expires 1970-01-01T00:00:10Z',
      'Buy limit, 3 units, at 98, Day, in the ticket applies quantity, validity',
    ]);
  });
  it('a book holding a GTC preset round trips too', () => {
    const gtc = { schemaVersion: 1, id: 'new-gtc', name: 'New GTC', side: 'buy', input: { ...JSON.parse(savedJson)[0].input, validity: { kind: 'gtc' } } };
    const json = JSON.stringify([...JSON.parse(savedJson), gtc]);
    expect(JSON.stringify(validatePaperPresets(JSON.parse(json)))).toBe(json);
  });
});

describe('CSV exports keep their columns and add zone-aware ones', () => {
  const traded = () => {
    let account = funded();
    account = submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 2 }, NOW).account;
    account = submitPaperOrder(account, { instrument, side: 'sell', type: 'market', quantity: 2 }, NOW).account;
    account = submitPaperOrder(account, { instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 90, timeInForce: 'GTD', expiresAt: NOW + 3600 }, NOW).account;
    account = submitPaperOrder(account, { instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 80, timeInForce: 'GTC' }, NOW).account;
    return account;
  };
  // A stand-in zone formatter: the dialog passes the chart-time-text one (tests/ui/r40-paper-4-handlers).
  const zone = { name: 'Testville', iso: (seconds: number) => `wall:${seconds}` };
  it('without a zone every table is exactly as before', () => {
    const account = traded();
    expect(paperExportTable(account, 'orders').columns).toEqual(['Symbol', 'Side / type', 'Quantity', 'Limit / stop', 'Instruction', 'Status', 'Expiry (UTC)']);
    expect(paperExportTable(account, 'history').columns).toEqual(['Updated', 'Symbol', 'Side / type', 'Quantity', 'Limit / stop', 'Status', 'Average fill', 'Reason']);
    expect(paperExportTable(account, 'account-history').columns).toEqual(['Position', 'Symbol', 'Direction', 'Status', 'Closed (UTC)', 'Fill time (UTC)', 'Fill side', 'Fill quantity', 'Fill price', 'Virtual fee', 'Realized gross']);
    expect(paperExportTable(account, 'journal').columns).toEqual(['Time', 'Order', 'Event', 'Details']);
  });
  it('with a zone the old columns stay first and unchanged, and zone columns are appended', () => {
    const account = traded();
    const plain = paperExportTable(account, 'orders'), zoned = paperExportTable(account, 'orders', { zone });
    expect(zoned.columns).toEqual([...plain.columns, 'Expiry (Testville, ISO offset)']);
    expect(zoned.rows.map(row => row.slice(0, plain.columns.length))).toEqual(plain.rows);
    expect(zoned.rows.map(row => row.at(-1))).toEqual([`wall:${NOW + 3600}`, 'No scheduled expiry']);
    expect(paperExportTable(account, 'orders', { zone, ordersColumns: { expiry: false } }).columns).toEqual(['Symbol', 'Side / type', 'Quantity', 'Limit / stop', 'Instruction', 'Status']);
    const history = paperExportTable(account, 'history', { zone });
    expect(history.columns.at(-1)).toBe('Updated (Testville, ISO offset)');
    expect(history.rows.every(row => row.at(-1) === `wall:${NOW}`)).toBe(true);
    expect(history.rows.map(row => row.slice(0, -1))).toEqual(paperExportTable(account, 'history').rows);
    const positions = paperExportTable(account, 'account-history', { zone });
    expect(positions.columns.slice(-2)).toEqual(['Closed (Testville, ISO offset)', 'Fill time (Testville, ISO offset)']);
    expect(positions.rows[0].slice(-2)).toEqual([`wall:${NOW}`, `wall:${NOW}`]);
    expect(positions.rows.map(row => row.slice(0, -2))).toEqual(paperExportTable(account, 'account-history').rows);
    const journal = paperExportTable(account, 'journal', { zone });
    expect(journal.columns).toEqual(['Time', 'Order', 'Event', 'Details', 'Time (Testville, ISO offset)']);
    expect(toCsv(journal.columns, journal.rows).split('\r\n')[0]).toBe('Time,Order,Event,Details,"Time (Testville, ISO offset)"');
  });
  it('an open position leaves its zone Closed cell blank, like the UTC one', () => {
    const account = submitPaperOrder(funded(), { instrument, side: 'buy', type: 'market', quantity: 2 }, NOW).account;
    const row = paperExportTable(account, 'account-history', { zone }).rows[0];
    expect(row[4]).toBe(''); expect(row.at(-2)).toBe('');
  });
});

describe('the Day close a ticket would get on NYSE early-close days', () => {
  const ny: Instrument = { ...instrument, id: 'SYNTHETIC:PAPER4NY', timezone: 'America/New_York' };
  const at = (iso: string) => Date.parse(iso) / 1000;
  it('the day after Thanksgiving 2026 closes at 13:00 New York time, 17:00 for extended hours', () => {
    const now = at('2026-11-27T15:00:00Z'); // 10:00 New York (UTC-5)
    expect(paperTicketDayClose(now, ny, false)).toEqual({ expiresAt: at('2026-11-27T18:00:00Z'), closeMinute: 780, earlyClose: true });
    expect(paperTicketDayClose(now, ny, true)).toEqual({ expiresAt: at('2026-11-27T22:00:00Z'), closeMinute: 1020, earlyClose: true });
  });
  it('matches what the ticket materializes on that day', () => {
    const now = at('2026-11-27T15:00:00Z'), nyQuote = { ...quote, instrumentId: ny.id, eventTime: now, receivedAt: now, availableAt: now };
    const blank = createPaperAccount({ initialBalance: 100000, now }), account = processPaperQuote(blank, nyQuote, now, blank.runId, ny).account;
    const ctx = { account, instrument: ny, quote: nyQuote, quoteSource: { key: 'synthetic paper four ny', state: 'ready' as const }, now };
    const preview = previewPaperTicket(ticket({ kind: 'day' }), ctx);
    if (!preview.ok) throw new Error(preview.diagnostics[0].message);
    const built = materializePaperTicket(preview.value, ticket({ kind: 'day' }), ctx);
    if (!built.ok) throw new Error(built.diagnostics[0].message);
    expect(built.value.expiresAt).toBe(paperTicketDayClose(now, ny, false).expiresAt);
  });
  it('after the early close, the next trading day closes at 16:00 and is not early', () => {
    expect(paperTicketDayClose(at('2026-11-27T19:00:00Z'), ny, false)).toEqual({ expiresAt: at('2026-11-30T21:00:00Z'), closeMinute: 960, earlyClose: false });
  });
  it('an ordinary day closes at 16:00 (20:00 extended), and a 24-hour instrument has no session close', () => {
    expect(paperTicketDayClose(at('2026-11-25T15:00:00Z'), ny, false)).toEqual({ expiresAt: at('2026-11-25T21:00:00Z'), closeMinute: 960, earlyClose: false });
    expect(paperTicketDayClose(at('2026-11-25T15:00:00Z'), ny, true)).toEqual({ expiresAt: at('2026-11-26T01:00:00Z'), closeMinute: 1200, earlyClose: false });
    expect(paperTicketDayClose(NOW, instrument, false)).toEqual({ expiresAt: NOW + 86400, closeMinute: null, earlyClose: false });
  });
});
