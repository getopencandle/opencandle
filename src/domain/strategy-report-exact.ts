/**
 * L5b: exact BigInt emulation of the few decimal.js operations the report runs once per bar. decimal.js rounds every
 * add, sub, mul and div correctly (the exact result rounded once to `precision` significant digits, ROUND_HALF_EVEN, with
 * a sticky bit for division), and `new Decimal(number)` is the exact value of the number's shortest decimal string. So an
 * exact rational computation rounded the same way yields the identical value, including the sign of zero under the
 * decimal.js rules. tests/domain/l5b-report-exact.test.ts checks every operation against decimal.js itself.
 * Values are s * c * 10^e with c >= 0n; zero keeps its sign as decimal.js does.
 */
export interface Exact { readonly s: 1 | -1; readonly c: bigint; readonly e: number }
const TEN = 10n;
const POW: bigint[] = [1n];
const pow10 = (n: number): bigint => { while (POW.length <= n) POW.push(POW[POW.length - 1] * TEN); return POW[n]; };
const TEN_POWERS = new Map<bigint, number>(Array.from({ length: 23 }, (_, n) => [10n ** BigInt(n), n]));
const NUMBER_POW = Array.from({ length: 23 }, (_, n) => 10 ** n); // exact doubles up to 1e22
/** Decimal digit count of c > 0n: a log10 estimate, corrected by exact comparisons. */
function digits(c: bigint): number {
  if (c < 9007199254740992n) {
    const n = Number(c); let count = Math.floor(Math.log10(n)) + 1;
    if (NUMBER_POW[count - 1] > n) count--; else if (NUMBER_POW[count] <= n) count++;
    return count;
  }
  const estimate = Number(c); if (!(estimate < 1e300)) return String(c).length;
  let count = Math.floor(Math.log10(estimate)) + 1;
  if (pow10(count - 1) > c) count--; else if (pow10(count) <= c) count++;
  return count;
}
const ZERO: Exact = Object.freeze({ s: 1, c: 0n, e: 0 }), NEGATIVE_ZERO: Exact = Object.freeze({ s: -1, c: 0n, e: 0 });
const parsed = new Map<number, Exact>();
/** The exact value decimal.js gives `new Decimal(n)` for a finite number (memoized: prices and equity levels repeat). */
export function exactOf(n: number): Exact {
  const known = parsed.get(n);
  if (known !== undefined && (n !== 0 || Object.is(n, -0) === (known.s < 0))) return known;
  if (parsed.size >= 65536) parsed.clear();
  const value = parse(n); parsed.set(n, value); return value;
}
function parse(n: number): Exact {
  if (n === 0) return Object.is(n, -0) ? NEGATIVE_ZERO : ZERO;
  const s: 1 | -1 = n < 0 ? -1 : 1;
  if (Number.isSafeInteger(n)) return { s, c: BigInt(s * n), e: 0 };
  const text = String(s * n), mark = text.indexOf('e');
  const mantissa = mark < 0 ? text : text.slice(0, mark), exponent = mark < 0 ? 0 : Number(text.slice(mark + 1)), dot = mantissa.indexOf('.');
  return dot < 0 ? { s, c: BigInt(mantissa), e: exponent } : { s, c: BigInt(mantissa.slice(0, dot) + mantissa.slice(dot + 1)), e: exponent - (mantissa.length - dot - 1) };
}
/** Round s * c * 10^e (c > 0n) to `precision` significant digits, half-even; `sticky` marks a nonzero discarded remainder. */
function round(s: 1 | -1, c: bigint, e: number, precision: number, sticky = false): Exact {
  const n = digits(c);
  if (n <= precision) { if (sticky) throw new Error('Exact rounding needs a wider quotient.'); return { s, c, e }; }
  const drop = n - precision, unit = pow10(drop), half = unit / 2n;
  let q = c / unit; const r = c - q * unit;
  if (r > half || r === half && (sticky || (q & 1n) === 1n)) q += 1n;
  return { s, c: q, e: e + drop };
}
export function exactMul(a: Exact, b: Exact, precision: number): Exact {
  const s = (a.s * b.s) as 1 | -1;
  if (a.c === 0n || b.c === 0n) return s < 0 ? NEGATIVE_ZERO : ZERO;
  return round(s, a.c * b.c, a.e + b.e, precision);
}
export function exactAdd(a: Exact, b: Exact, precision: number): Exact {
  if (a.c === 0n || b.c === 0n) {
    // decimal.js: x + 0 is x and 0 + y is y (rounded); two zeros keep their common sign, or +0 when the signs differ.
    if (b.c !== 0n) return round(b.s, b.c, b.e, precision);
    if (a.c !== 0n) return round(a.s, a.c, a.e, precision);
    return a.s === b.s ? a : ZERO;
  }
  const e = Math.min(a.e, b.e), x = (a.s < 0 ? -a.c : a.c) * pow10(a.e - e), y = (b.s < 0 ? -b.c : b.c) * pow10(b.e - e), sum = x + y;
  if (sum === 0n) return ZERO;
  return sum < 0n ? round(-1, -sum, e, precision) : round(1, sum, e, precision);
}
export const exactNegate = (a: Exact): Exact => ({ s: (a.s < 0 ? 1 : -1), c: a.c, e: a.e });
export const exactSub = (a: Exact, b: Exact, precision: number): Exact => exactAdd(a, exactNegate(b), precision);
export function exactDiv(a: Exact, b: Exact, precision: number): Exact {
  if (b.c === 0n) throw new Error('Exact division by zero.');
  const s = (a.s * b.s) as 1 | -1;
  if (a.c === 0n) return s < 0 ? NEGATIVE_ZERO : ZERO;
  // Dividing by a power of ten is exact: only the final rounding remains.
  const power = TEN_POWERS.get(b.c); if (power !== undefined) return round(s, a.c, a.e - b.e - power, precision);
  // Scale the dividend so the integer quotient has at least precision + 1 digits; the remainder is the sticky bit.
  const k = Math.max(0, precision + 1 + digits(b.c) - digits(a.c)), scaled = a.c * pow10(k), q = scaled / b.c;
  return round(s, q, a.e - k - b.e, precision, scaled !== q * b.c);
}
/** decimal.js `x.toDecimalPlaces(places).toNumber()` with ROUND_HALF_EVEN. */
export function exactNumber(a: Exact, places = 10): number {
  if (a.c === 0n) return a.s < 0 ? -0 : 0;
  let c = a.c, e = a.e;
  if (e < -places) {
    const unit = pow10(-places - e), half = unit / 2n; let q = c / unit; const r = c - q * unit;
    if (r > half || r === half && (q & 1n) === 1n) q += 1n;
    c = q; e = -places;
    if (c === 0n) return a.s < 0 ? -0 : 0;
  }
  // Exact-operand fast path (as in strtod): c and 10^|e| are exact doubles, so one IEEE multiply or divide is the
  // correctly rounded value, the same double Number() parses from the decimal string.
  if (c < 9007199254740992n && e >= -22 && e <= 22) { const n = Number(c), value = e < 0 ? n / NUMBER_POW[-e] : n * NUMBER_POW[e]; return a.s < 0 ? -value : value; }
  return Number((a.s < 0 ? '-' : '') + c + 'e' + e);
}
export const exactGt = (a: Exact, b: Exact): boolean => exactCompare(a, b) > 0;
export function exactCompare(a: Exact, b: Exact): number {
  const e = Math.min(a.e, b.e), x = (a.s < 0 ? -a.c : a.c) * pow10(a.e - e), y = (b.s < 0 ? -b.c : b.c) * pow10(b.e - e);
  return x > y ? 1 : x < y ? -1 : 0;
}
/** The exact value as a decimal string decimal.js parses to the same value. */
export const exactText = (a: Exact): string => (a.s < 0 ? '-' : '') + a.c + 'e' + a.e;
