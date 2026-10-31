import { afterEach, expect, it, vi } from 'vitest';
import { formatPaperExpiry } from '../../src/domain/paper-expiry';
import { advancePaperClock, createPaperAccount, modifyPaperOrder, restorePaperAccount, submitPaperOrder } from '../../src/domain/paper';
import { materializePaperTicket, parsePaperExpiryText, previewPaperTicket, type PaperTicketContext, type PaperTicketInput, type PaperTicketResolution } from '../../src/domain/paper-ticket';
import type { Instrument } from '../../src/domain/types';

// Independent fixed oracles. This file does not claim desktop or reference UI coverage.
const instrument: Instrument = { id: 'SYNTHETIC:EXPIRY', symbol: 'EXPIRY', name: 'Synthetic expiry oracle', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'America/New_York', tickSize: .01, lotSize: 1 };
const draft = (): PaperTicketInput => ({ schemaVersion: 1, side: 'buy', type: 'limit', quantity: { kind: 'units', value: '1' }, limit: { kind: 'price', value: '9' }, stop: null, validity: { kind: 'day' }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null });
const context = (now = 1000): PaperTicketContext => ({ account: createPaperAccount({ initialBalance: 1000, now }), instrument, quote: null, quoteSource: null, now });
function accepted<T>(result: PaperTicketResolution<T>): T {
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.ok) throw new Error('Independent test setup did not resolve');
  return result.value;
}
afterEach(() => vi.restoreAllMocks());

it.each([
  [0, '1970-01-01T00:00:00Z'],
  [1000, '1970-01-01T00:16:40Z'],
  [87400, '1970-01-02T00:16:40Z'],
  [253402300799, '9999-12-31T23:59:59Z'],
] as const)('ORACLE.PAPER.EXPIRY.FORMAT / PAPER.EXPIRY.FORMAT.ROUNDTRIP: %i is exactly %s', (seconds, literal) => {
  expect(formatPaperExpiry(seconds)).toEqual({ kind: 'scheduled', text: literal });
  expect(parsePaperExpiryText(literal)).toBe(seconds);
});

it('PAPER.EXPIRY.FORMAT.BOUNDS: only undefined is missing; epoch zero remains an actual date', () => {
  expect(formatPaperExpiry(undefined)).toEqual({ kind: 'missing' });
  expect(formatPaperExpiry(0)).toEqual({ kind: 'scheduled', text: '1970-01-01T00:00:00Z' });
});

it.each([-1, .001, 1000.125, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('PAPER.EXPIRY.FORMAT.BOUNDS: invalid %s never becomes missing, a date, or raw retained seconds', value => {
  expect(formatPaperExpiry(value)).toEqual({ kind: 'unavailable' });
});

it.each([253402300800, Number.MAX_SAFE_INTEGER])('PAPER.EXPIRY.FORMAT.BOUNDS: unsupported safe expiry %i remains distinguishable from unlimited', value => {
  expect(formatPaperExpiry(value)).toEqual({ kind: 'unavailable', rawSeconds: value });
});

it('PAPER.EXPIRY.CLOCK.ISOLATION: UTC formatting cannot consult the wall clock', () => {
  const wallClock = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Wall time is not simulation time'); });
  expect(formatPaperExpiry(87400)).toEqual({ kind: 'scheduled', text: '1970-01-02T00:16:40Z' });
  expect(wallClock).not.toHaveBeenCalled();
});

it.each([
  ['1970-01-01T01:16:40+01:00', 1000],
  ['1970-01-01T19:16:40-05:00', 87400],
] as const)('PAPER.EXPIRY.FORMAT.ROUNDTRIP: existing explicit offset %s preserves its exact second', (input, expected) => {
  expect(parsePaperExpiryText(input)).toBe(expected);
});

it.each(['1970-01-02T00:16:40.000Z', '1970-01-02T00:16:40.125Z', '1970-01-02T00:16:40', '2026-02-30T12:00:00Z'])('PAPER.EXPIRY.INVALID.RECOVERY: formatter repair does not relax strict parser input %s', input => {
  expect(() => parsePaperExpiryText(input)).toThrow();
});

// A US equity Day order ends at the session close of its accepted time (16:00 New York for a
// regular-hours entry), not 86400 s after placement. 1010 s is 1969-12-31 19:16:50 New York, after that day's close, so the
// order ends at the next trading day's close: 1970-01-01 16:00 New York = 75600 (1970 has no listed holidays).
it('PAPER.EXPIRY.DAY.ACCEPTANCE: a later acceptance ends at the session close of the accepted time (75600), not a 24 h deadline', () => {
  const ctx = context(), input = draft(), before = structuredClone(ctx.account);
  const preview = accepted(previewPaperTicket(input, ctx));
  const request = accepted(materializePaperTicket(preview, input, { ...ctx, now: 1010 }));
  expect(request).toMatchObject({ timeInForce: 'DAY', expiresAt: 75600 });
  expect(formatPaperExpiry(request.expiresAt)).toEqual({ kind: 'scheduled', text: '1970-01-01T21:00:00Z' });
  expect(ctx.account).toEqual(before);
});

it.each(['DAY', 'GTD', 'GTC'] as const)('PAPER.EXPIRY.CANONICAL.PRIORITY: untouched finite %s deadline survives quantity edit and restore', timeInForce => {
  const ctx = context(1);
  const submitted = submitPaperOrder(ctx.account, { instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 9, timeInForce, expiresAt: 5 }, 1);
  expect(submitted.ok, JSON.stringify(submitted.diagnostics)).toBe(true);
  const before = structuredClone(submitted.account), input = draft();
  input.quantity.value = '2'; input.validity = { kind: 'retain-existing', orderId: submitted.orderId! };
  const editContext = { ...ctx, account: submitted.account, now: 2, editOrderId: submitted.orderId! };
  const request = accepted(materializePaperTicket(accepted(previewPaperTicket(input, editContext)), input, editContext));
  expect(request).toMatchObject({ quantity: 2, timeInForce, expiresAt: 5 });
  const modified = modifyPaperOrder(submitted.account, submitted.orderId!, { quantity: request.quantity, expiresAt: request.expiresAt, ticket: request.ticket }, 2);
  expect(modified.ok, JSON.stringify(modified.diagnostics)).toBe(true);
  expect(restorePaperAccount(modified.account).orders[0]).toMatchObject({ quantity: 2, timeInForce, expiresAt: 5, status: 'working' });
  expect(formatPaperExpiry(modified.account.orders[0].expiresAt)).toEqual({ kind: 'scheduled', text: '1970-01-01T00:00:05Z' });
  expect(submitted.account).toEqual(before);
});

it('PAPER.EXPIRY.BOUNDARY: formatting at the saved boundary is pure; explicit clock processing expires without a fill', () => {
  const submitted = submitPaperOrder(context(1).account, { instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 9, timeInForce: 'GTC', expiresAt: 5 }, 1);
  expect(submitted.ok).toBe(true);
  const before = structuredClone(submitted.account);
  expect(formatPaperExpiry(submitted.account.orders[0].expiresAt)).toEqual({ kind: 'scheduled', text: '1970-01-01T00:00:05Z' });
  expect(submitted.account).toEqual(before);
  const processed = advancePaperClock(submitted.account, 5);
  expect(processed.ok).toBe(true);
  expect(processed.account.orders[0]).toMatchObject({ status: 'expired', expiresAt: 5, quantity: 1 });
  expect(processed.account.fills).toEqual([]);
  expect(processed.account.cash).toBe(1000);
  expect(submitted.account).toEqual(before);
});

it('PAPER.EXPIRY.CANONICAL.PRIORITY: unsupported finite legacy expiry survives storage rather than becoming unlimited', () => {
  const submitted = submitPaperOrder(context(1).account, { instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 9, timeInForce: 'GTC', expiresAt: 253402300800 }, 1);
  expect(submitted.ok, JSON.stringify(submitted.diagnostics)).toBe(true);
  const restored = restorePaperAccount(submitted.account);
  expect(restored.orders[0].expiresAt).toBe(253402300800);
  expect(formatPaperExpiry(restored.orders[0].expiresAt)).toEqual({ kind: 'unavailable', rawSeconds: 253402300800 });
});

it('PAPER.EXPIRY.FORMAT.BOUNDS: valid formatting epoch zero does not permit an order deadline before creation', () => {
  const result = submitPaperOrder(context(0).account, { instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 9, timeInForce: 'GTD', expiresAt: 0 }, 0);
  expect(result.ok).toBe(false);
  expect(result.account.orders).toEqual([]);
});
