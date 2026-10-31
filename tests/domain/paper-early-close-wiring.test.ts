import { expect, it } from 'vitest';
import { createPaperAccount, processPaperQuote } from '../../src/domain/paper';
import { newYorkWallClockMs } from '../../src/domain/paper-expiry';
import { materializePaperTicket, previewPaperTicket, type PaperTicketInput } from '../../src/domain/paper-ticket';
import type { Instrument, Quote } from '../../src/domain/types';

// Integration: the early-close hook wired to the NYSE session calendar in paper-ticket.ts.
// Synthetic instrument and quotes, virtual money only.
const us: Instrument = { id: 'SYNTHETIC:EARLYCLOSE', symbol: 'EARLYCLOSE', name: 'Synthetic early close oracle', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'America/New_York', tickSize: 0.01, lotSize: 1 };
const ny = (year: number, month: number, day: number, hour: number, minute = 0) => newYorkWallClockMs(year, month, day, hour * 60 + minute) / 1000;
const day = (now: number, entryOutsideRth: boolean) => {
  const quote: Quote = { instrumentId: us.id, bid: 9.99, ask: 10, eventTime: now, receivedAt: now, availableAt: now, sequence: 1, fixture: true, session: 'regular' };
  const account = processPaperQuote(createPaperAccount({ initialBalance: 1000, now }), quote, now, undefined, us).account;
  const input: PaperTicketInput = { schemaVersion: 1, side: 'buy', type: 'limit', quantity: { kind: 'units', value: '1' }, limit: { kind: 'price', value: '9' }, stop: null, validity: { kind: 'day' }, entryOutsideRth, takeProfitOutsideRth: false, exits: null };
  const context = { account, instrument: us, quote, quoteSource: { key: 'SYNTHETIC early close source', state: 'ready' as const }, now };
  const preview = previewPaperTicket(input, context);
  if (!preview.ok) throw new Error(preview.diagnostics.map(row => row.message).join(' '));
  const request = materializePaperTicket(preview.value, input, context);
  if (!request.ok) throw new Error(request.diagnostics.map(row => row.message).join(' '));
  return request.value;
};

it('a Day ticket on an NYSE early-close day (day after Thanksgiving 2026) ends at 13:00, or 17:00 with extended hours', () => {
  expect(day(ny(2026, 11, 27, 9), false)).toMatchObject({ timeInForce: 'DAY', expiresAt: ny(2026, 11, 27, 13) });
  expect(day(ny(2026, 11, 27, 9), true)).toMatchObject({ timeInForce: 'DAY', expiresAt: ny(2026, 11, 27, 17) });
});
it('an ordinary day keeps the 16:00 close', () => {
  expect(day(ny(2026, 11, 25, 9), false)).toMatchObject({ expiresAt: ny(2026, 11, 25, 16) });
});
