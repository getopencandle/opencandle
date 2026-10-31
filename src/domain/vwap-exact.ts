/** Original LV binary64 VWAP policy. This bounded exact kernel runs in a worker. */
export const VWAP_EXACT_SOURCES = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'] as const;
export type VwapExactSource = typeof VWAP_EXACT_SOURCES[number];
export const VWAP_EXACT_LIMITS = Object.freeze({ rows: 100_000, numeratorBits: 4_213, weightBits: 2_115, sourceBits: 2_101, intermediateBits: 6_400 });

interface Dyadic { coefficient: bigint; exponent: number }
export interface ExactVwapAccumulator {
  /** Source averages round once before weighting. Exact cancellation canonicalizes to +0. */
  push(open: number, high: number, low: number, close: number, volume: number, reset: boolean): number | null;
}
function fail(message: string): never { throw new Error(`Exact VWAP: ${message}`); }
const bits = new DataView(new ArrayBuffer(8)), fractionMask = (1n << 52n) - 1n, implicitBit = 1n << 52n;
function decode(value: number): Dyadic {
  bits.setFloat64(0, value, false);
  const raw = bits.getBigUint64(0, false), encoded = Number((raw >> 52n) & 2047n);
  let coefficient = raw & fractionMask;
  if (encoded) coefficient |= implicitBit;
  if (raw >> 63n) coefficient = -coefficient;
  return { coefficient, exponent: encoded ? encoded - 1075 : -1074 };
}
function bitLength(value: bigint): number { return value === 0n ? 0 : (value < 0n ? -value : value).toString(2).length; }
function shift(value: bigint, amount: number): bigint {
  if (!Number.isSafeInteger(amount) || amount < 0 || bitLength(value) + amount > VWAP_EXACT_LIMITS.intermediateBits) fail('intermediate bit limit exceeded');
  return value << BigInt(amount);
}
function add(sum: Dyadic, term: Dyadic, maximum: number): void {
  if (term.coefficient === 0n) return;
  if (sum.coefficient === 0n) { sum.coefficient = term.coefficient; sum.exponent = term.exponent; }
  else if (term.exponent < sum.exponent) { sum.coefficient = shift(sum.coefficient, sum.exponent - term.exponent) + term.coefficient; sum.exponent = term.exponent; }
  else sum.coefficient += shift(term.coefficient, term.exponent - sum.exponent);
  if (bitLength(sum.coefficient) > maximum) fail('accumulator bit limit exceeded');
}
function roundedQuotient(a: bigint, b: bigint, exponent: number): bigint {
  const numerator = exponent >= 0 ? shift(a, exponent) : a, denominator = exponent < 0 ? shift(b, -exponent) : b;
  let quotient = numerator / denominator;
  const remainder = numerator - quotient * denominator, twice = remainder * 2n;
  if (twice > denominator || (twice === denominator && (quotient & 1n) === 1n)) quotient++;
  return quotient;
}
function rationalToFloat(numerator: bigint, denominator: bigint, exponent: number): number {
  if (denominator <= 0n) fail('denominator must be positive');
  if (numerator === 0n) return 0;
  const negative = numerator < 0n, a = negative ? -numerator : numerator;
  let floor = bitLength(a) - bitLength(denominator);
  if (floor >= 0 ? a < shift(denominator, floor) : shift(a, -floor) < denominator) floor--;
  let power = floor + exponent, value: number;
  if (power >= -1022) {
    let significand = roundedQuotient(a, denominator, exponent - power + 52);
    if (significand === 1n << 53n) { significand >>= 1n; power++; }
    if (power > 1023) fail('finite convex mean overflowed');
    value = Number(significand) * 2 ** (power - 52);
  } else value = Number(roundedQuotient(a, denominator, exponent + 1074)) * Number.MIN_VALUE;
  if (!Number.isFinite(value)) fail('result is not finite');
  return negative ? -value : value;
}
function sourceIndices(source: VwapExactSource): readonly number[] {
  switch (source) {
    case 'open': return [0]; case 'high': return [1]; case 'low': return [2]; case 'close': return [3];
    case 'hl2': return [1, 2]; case 'hlc3': return [1, 2, 3]; case 'ohlc4': return [0, 1, 2, 3];
  }
}

export function createExactVwapAccumulator(source: VwapExactSource): ExactVwapAccumulator {
  if (!(VWAP_EXACT_SOURCES as readonly unknown[]).includes(source)) fail('unsupported source');
  const indices = sourceIndices(source);
  let count = 0, numerator: Dyadic = { coefficient: 0n, exponent: 0 }, weight: Dyadic = { coefficient: 0n, exponent: 0 }, last: number | null = null;
  const accumulator: ExactVwapAccumulator = {
    push(this: ExactVwapAccumulator, open, high, low, close, volume, reset) {
      if (this !== accumulator) fail('foreign accumulator receiver');
      if (count >= VWAP_EXACT_LIMITS.rows) fail('row limit exceeded');
      if (typeof reset !== 'boolean' || [open, high, low, close, volume].some(value => typeof value !== 'number' || !Number.isFinite(value)) || volume < 0) fail('finite prices and nonnegative finite volume are required');
      count++;
      if (reset) { numerator = { coefficient: 0n, exponent: 0 }; weight = { coefficient: 0n, exponent: 0 }; last = null; }
      if (volume === 0) return last;
      const prices = [open, high, low, close];
      let price: number;
      if (indices.length === 1) price = prices[indices[0]];
      else {
        const total: Dyadic = { coefficient: 0n, exponent: 0 };
        for (const field of indices) add(total, decode(prices[field]), VWAP_EXACT_LIMITS.sourceBits);
        price = rationalToFloat(total.coefficient, BigInt(indices.length), total.exponent);
      }
      const p = decode(price), v = decode(volume);
      add(numerator, { coefficient: p.coefficient * v.coefficient, exponent: p.exponent + v.exponent }, VWAP_EXACT_LIMITS.numeratorBits);
      add(weight, v, VWAP_EXACT_LIMITS.weightBits);
      last = rationalToFloat(numerator.coefficient, weight.coefficient, numerator.exponent - weight.exponent);
      return last;
    }
  };
  return Object.freeze(accumulator);
}
