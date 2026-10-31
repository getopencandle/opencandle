import { describe, expect, it } from 'vitest';
import { niceTicks, tickLabel } from '../../src/market-views/ticks';
import { resolveScope, scopeChip } from '../../src/market-views/scope';

describe('seasonals nice axis ticks', () => {
  it('uses even 1/2/2.5/5 steps that cover the range and include zero', () => {
    const a = niceTicks(-13.4, 16.2, 6);
    expect(a.step).toBe(10); expect(a.ticks).toEqual([-20, -10, 0, 10, 20]);
    const b = niceTicks(-1.2, 3.7, 6);
    expect(b.step).toBe(1); expect(b.ticks).toEqual([-2, -1, 0, 1, 2, 3, 4]);
    const c = niceTicks(0, 0.9, 5);
    expect(c.step).toBe(0.25); expect(c.ticks.map(t => tickLabel(t, c.step))).toEqual(['0.00', '0.25', '0.50', '0.75', '1.00']);
    for (const r of [a, b, c]) { const gaps = r.ticks.slice(1).map((t, i) => +(t - r.ticks[i]).toFixed(9)); expect(new Set(gaps).size).toBe(1); expect(r.ticks).toContain(0); }
  });
  it('handles a flat or non-finite range', () => {
    expect(niceTicks(0, 0).ticks).toContain(0); expect(niceTicks(Number.NaN, 1).ticks).toEqual([0]);
  });
  it('short scope chip text', () => {
    expect(scopeChip(resolveScope([], 'loaded', undefined))).toBe('Loaded symbols only (0)');
    expect(scopeChip(resolveScope([], 'watchlist', ['A', 'B']))).toBe('Watchlist: 0 of 2 loaded');
  });
});
