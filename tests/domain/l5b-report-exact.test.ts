// L5b: the BigInt emulation the report uses on its per-bar path must equal decimal.js exactly: every add, sub, mul and
// div at the report's precisions, ROUND_HALF_EVEN, the sign of zero, and toDecimalPlaces(10).toNumber(). Deterministic
// pseudo-random operands from several distributions, chained so later operands carry full-precision results.
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { exactAdd, exactCompare, exactDiv, exactMul, exactNumber, exactOf, exactSub, exactText, type Exact } from '../../src/domain/strategy-report-exact';

let state = 99; const next = () => (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)];
function operand(): number {
  switch (Math.floor(next() * 9)) {
    case 0: return Math.round((next() * 2000 - 1000) * 100) / 100;
    case 1: return (next() - 0.5) * 1e6;
    case 2: return (next() - 0.5) * 1e-9;
    case 3: return Math.floor((next() - 0.5) * 1e7);
    case 4: return pick([0, -0, 1, -1, 100, 0.1, 0.5, 2.5, 1e21, 1.5e-7, 123456789.123, 5e-324, 1e300]);
    case 5: return Math.round(next() * 1e6) / 1e4 * pick([1, -1]);
    case 6: return (next() + 0.5) * 10 ** Math.floor(next() * 40 - 20);
    case 7: return pick([3, 5, 25, 40]) * pick([1, -1]);
    default: return Math.round(next() * 1e8) / 1e8;
  }
}
const same = (exact: Exact, decimal: Decimal) => {
  expect(new Decimal(exactText(exact)).eq(decimal) && (exact.c === 0n ? (exact.s < 0) === decimal.isNeg() : true)).toBe(true);
  expect(Object.is(exactNumber(exact), decimal.toDecimalPlaces(10).toNumber())).toBe(true);
};
describe('L5b exact report arithmetic equals decimal.js', () => {
  for (const precision of [32, 40]) it('precision ' + precision, () => {
    const D = Decimal.clone({ precision, rounding: Decimal.ROUND_HALF_EVEN });
    const pool: { exact: Exact; decimal: Decimal }[] = [];
    const take = () => { if (pool.length > 8 && next() < 0.5) return pick(pool); const n = operand(); return { exact: exactOf(n), decimal: new D(n) }; };
    for (let i = 0; i < 40000; i++) {
      const a = take(), b = take(), op = Math.floor(next() * 4);
      if (op === 3 && b.decimal.isZero()) continue;
      const exact = op === 0 ? exactAdd(a.exact, b.exact, precision) : op === 1 ? exactSub(a.exact, b.exact, precision) : op === 2 ? exactMul(a.exact, b.exact, precision) : exactDiv(a.exact, b.exact, precision);
      const decimal = op === 0 ? a.decimal.add(b.decimal) : op === 1 ? a.decimal.sub(b.decimal) : op === 2 ? a.decimal.mul(b.decimal) : a.decimal.div(b.decimal);
      if (!decimal.isFinite() || decimal.abs().gt('1e1000') || (!decimal.isZero() && decimal.abs().lt('1e-1000'))) continue;
      same(exact, decimal);
      expect(exactCompare(a.exact, b.exact)).toBe(a.decimal.comparedTo(b.decimal));
      pool.push({ exact, decimal }); if (pool.length > 64) pool.shift();
    }
  });
  it('parses numbers as decimal.js does, including -0', () => {
    for (const n of [0, -0, 1e21, 1.5e-7, -123.45, 5e-324, 9007199254740993, 0.1 + 0.2]) same(exactOf(n), new Decimal(n));
  });
});
