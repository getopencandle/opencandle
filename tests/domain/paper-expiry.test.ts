import { expect, it, vi } from 'vitest';
import { formatPaperExpiry } from '../../src/domain/paper-expiry';
import { parsePaperExpiryText } from '../../src/domain/paper-ticket';

// Literal UTC/Unix pairs are independent expectations, not results generated
// by a second use of the formatter. Epoch0 is a scalar formatting boundary;
// an actual order still requires expiry later than its creation time.
it.each([
  [0, '1970-01-01T00:00:00Z'],
  [1000, '1970-01-01T00:16:40Z'],
  [87400, '1970-01-02T00:16:40Z'],
  [946684800, '2000-01-01T00:00:00Z'],
  [951782400, '2000-02-29T00:00:00Z'],
  [253402300799, '9999-12-31T23:59:59Z'],
] as const)('formats canonical seconds %s as %s and preserves strict parser roundtrip', (seconds, text) => {
  const result = formatPaperExpiry(seconds);
  expect(result).toStrictEqual({ kind: 'scheduled', text });
  expect(parsePaperExpiryText(text)).toBe(seconds);
});

it('distinguishes an absent expiry from an unsupported timestamp', () => {
  expect(formatPaperExpiry(undefined)).toStrictEqual({ kind: 'missing' });
});

it.each([-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('does not coerce or echo invalid seconds %s', value => {
  expect(formatPaperExpiry(value)).toStrictEqual({ kind: 'unavailable' });
});

it.each([253402300800, Number.MAX_SAFE_INTEGER])('retains only the informational raw value for unformattable safe seconds %s', value => {
  expect(formatPaperExpiry(value)).toStrictEqual({ kind: 'unavailable', rawSeconds: value });
});

it.each([null, '1000', true])('does not accept a nonnumeric runtime value %s', value => {
  expect(formatPaperExpiry(value as unknown as number)).toStrictEqual({ kind: 'unavailable' });
});

it('does not call coercion hooks on an invalid runtime object', () => {
  let calls = 0;
  const invalid = { valueOf() { calls++; throw Error('SYNTHETIC coercion must not run'); }, toString() { calls++; return '1000'; } };
  expect(formatPaperExpiry(invalid as unknown as number)).toStrictEqual({ kind: 'unavailable' });
  expect(calls).toBe(0);
});

it('does not consult the wall clock while formatting canonical seconds', () => {
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => { throw Error('SYNTHETIC wall clock must not run'); });
  try {
    expect(formatPaperExpiry(87400)).toStrictEqual({ kind: 'scheduled', text: '1970-01-02T00:16:40Z' });
    expect(clock).not.toHaveBeenCalled();
  } finally { clock.mockRestore(); }
});

it('keeps fractional explicit expiry syntax unsupported rather than rounding it', () => {
  expect(() => parsePaperExpiryText('1970-01-02T00:16:40.125Z')).toThrow();
  expect(() => parsePaperExpiryText('1970-01-02T00:16:40.000Z')).toThrow();
  expect(formatPaperExpiry(87400.125)).toStrictEqual({ kind: 'unavailable' });
});
