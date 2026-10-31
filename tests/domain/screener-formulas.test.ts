import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { runScreener, validateScreenerColumn, screenerParameters, type ScreenerColumn, type ScreenerFilter } from '../../src/domain/screener';
import { SCREENER_PATTERN_NAMES, SCREENER_PATTERN_SIDES, formulaCell, ratingBucketLabel } from '../../src/domain/screener-formulas';
import type { Bar, BarDataset } from '../../src/domain/types';

const DAY = 86400, T0 = Date.UTC(2024, 0, 1) / 1000;
function make(bars: Bar[]): BarDataset { const d = fixtureDataset('FORM', 0); d.provenance.session = 'regular'; d.bars = bars; return d; }
const bar = (i: number, o: number, h: number, l: number, c: number, v = 100): Bar => ({ time: T0 + i * DAY, open: o, high: h, low: l, close: c, volume: v });
const value = (bars: Bar[], metric: string, parameters: Record<string, unknown> = {}) => formulaCell(make(bars), metric as never, parameters);
const flat = (n: number) => Array.from({ length: n }, (_, i) => bar(i, 100, 101, 99, 100));
const daily = (n: number, close: (i: number) => number) => Array.from({ length: n }, (_, i) => { const c = close(i); return bar(i, c, c + 1, c - 1, c); });

describe('screener candlestick pattern formula', () => {
  it('exposes the 44 documented patterns with unique names', () => {
    expect(SCREENER_PATTERN_SIDES.length).toBe(44);
    expect(new Set(SCREENER_PATTERN_NAMES).size).toBe(44);
  });
  it('detects a doji on the last row and honours the look-back', () => {
    // body 0.02 <= 5% of range 4; Doji has no trend role.
    const withDoji = [...flat(3), bar(3, 10, 12, 8, 10.02)];
    expect(value(withDoji, 'pattern', { pattern: 'Doji' }).value).toBe(1);
    const dojiThenPlain = [...flat(2), bar(2, 10, 12, 8, 10.02), bar(3, 10, 12, 8, 11.5)];
    expect(value(dojiThenPlain, 'pattern', { pattern: 'Doji' }).value).toBe(0);
    expect(value(dojiThenPlain, 'pattern', { pattern: 'Doji', within: 2 }).value).toBe(1);
  });
  it('gates a reversal pattern by the trend rule', () => {
    // o10 c10.5 h10.5 l8: body .5, lower shadow 2 >= 2 bodies, upper 0, not a doji -> hammer shape.
    const bars = [...flat(3), bar(3, 10, 10.5, 8, 10.5)];
    expect(value(bars, 'pattern', { pattern: 'Hammer', trendRule: 'No detection' }).value).toBe(1);
    expect(value(bars, 'pattern', { pattern: 'Hanging man', trendRule: 'No detection' }).value).toBe(1);
    expect(value(bars, 'pattern', { pattern: 'Hammer', trendRule: 'SMA50' }).value).toBe(0); // fewer than 50 rows: no trend
  });
  it('rejects an unknown pattern name as invalid, not zero', () => {
    const cell = value(flat(5), 'pattern', { pattern: 'Not a pattern' });
    expect(cell.state).toBe('invalid'); expect(cell.value).toBeNull();
    expect(validateScreenerColumn({ id: 'p', metric: 'pattern', parameters: { pattern: 'Not a pattern' } })).toMatch(/invalid pattern/);
  });
});

describe('screener volatility, ADR % and ATR %', () => {
  it('volatility uses only bars of the latest UTC date', () => {
    const bars = [bar(0, 10, 50, 1, 10), { ...bar(1, 10, 12, 10, 11), time: T0 + DAY }, { ...bar(1, 10, 11, 9, 10), time: T0 + DAY + 3600 }];
    expect(value(bars, 'volatility').value).toBeCloseTo(100 * (12 - 9) / 9, 10);
  });
  it('ADR % is 100 x (mean high/low - 1) over N rows', () => {
    const bars = [bar(0, 1, 100, 1, 1), bar(1, 10, 12, 10, 11), bar(2, 10, 11, 10, 10)]; // newest two: 1.2 and 1.1
    expect(value(bars, 'adrPercent', { length: 2 }).value).toBeCloseTo(15, 10);
    expect(value(bars, 'adrPercent', { length: 4 }).state).toBe('insufficient-history');
  });
  it('ATR % of a constant true range of 2 on close 100 is 2', () => {
    expect(value(flat(30), 'atrPercent', { length: 14 }).value).toBeCloseTo(2, 10);
    expect(value(flat(5), 'atrPercent', { length: 14 }).state).toBe('insufficient-history');
  });
});

describe('screener calendar performance', () => {
  const bars = daily(400, i => 100 + i); // day 0 = 2024-01-01, last = idx 399 = 2025-02-03, close 499
  it('1W compares against the close seven days earlier', () => { expect(value(bars, 'performancePeriod', { period: '1W' }).value).toBeCloseTo(100 * (499 / 492 - 1), 10); });
  it('YTD compares against the last close before 1 January', () => { expect(value(bars, 'performancePeriod', { period: 'YTD' }).value).toBeCloseTo(100 * (499 / 465 - 1), 10); });
  it('1Y compares against the same date a year earlier', () => { expect(value(bars, 'performancePeriod', { period: '1Y' }).value).toBeCloseTo(100 * (499 / 133 - 1), 10); });
  it('is insufficient history, never zero, when the base is not loaded', () => {
    const cell = value(daily(100, i => 100 + i), 'performancePeriod', { period: '1Y' });
    expect(cell.state).toBe('insufficient-history'); expect(cell.value).toBeNull();
  });
});

describe('screener new high and new low', () => {
  const highs = (list: number[]) => list.map((h, i) => bar(i, 1, h, 1, 1));
  it('row window: strictly above the prior N highs', () => {
    expect(value(highs([5, 6, 7, 9]), 'newHigh', { length: 3 }).value).toBe(1);
    expect(value(highs([5, 9, 7, 7]), 'newHigh', { length: 3 }).value).toBe(0);
    expect(value(highs([5, 6, 7, 7]), 'newHigh', { length: 3 }).value).toBe(0);
    expect(value(highs([5, 6]), 'newHigh', { length: 3 }).state).toBe('insufficient-history');
  });
  it('row window: strictly below the prior N lows', () => {
    const lows = (list: number[]) => list.map((l, i) => bar(i, 5, 9, l, 5));
    expect(value(lows([4, 3, 2, 1]), 'newLow', { length: 3 }).value).toBe(1);
    expect(value(lows([4, 3, 2, 2]), 'newLow', { length: 3 }).value).toBe(0);
  });
  it('52 week window needs the loaded history to cover it', () => {
    expect(value(daily(400, i => 100 + i), 'newHigh', { basis: '52 weeks' }).value).toBe(1);
    expect(value(daily(400, i => 600 - i), 'newLow', { basis: '52 weeks' }).value).toBe(1);
    expect(value(daily(400, i => 600 - i), 'newHigh', { basis: '52 weeks' }).value).toBe(0);
    expect(value(daily(100, i => 100 + i), 'newHigh', { basis: '52 weeks' }).state).toBe('insufficient-history');
  });
});

describe('screener technical rating', () => {
  it('a steady rise votes strong buy on the moving averages and a fall strong sell', () => {
    const up = value(daily(300, i => 100 + i), 'rating', { use: 'Moving averages' }), down = value(daily(300, i => 500 - i), 'rating', { use: 'Moving averages' });
    expect(up.value!).toBeGreaterThanOrEqual(0.5); expect(ratingBucketLabel(Number(up.value))).toBe('Strong buy');
    expect(down.value!).toBeLessThanOrEqual(-0.5); expect(ratingBucketLabel(Number(down.value))).toBe('Strong sell');
  });
  it('needs 200 rows for the moving averages', () => { expect(value(daily(100, i => 100 + i), 'rating', { use: 'Moving averages' }).state).toBe('insufficient-history'); });
  it('maps bucket edges as the Technical ratings indicator does', () => {
    expect([0.5, 0.1, 0.09, -0.09, -0.1, -0.5, null].map(ratingBucketLabel)).toEqual(['Strong buy', 'Buy', 'Neutral', 'Neutral', 'Sell', 'Strong sell', null]);
  });
});

describe('formula metrics inside the screener run', () => {
  it('filters on a pattern column and exposes parameter schemas', () => {
    const doji = make([...flat(3), bar(3, 10, 12, 8, 10.02)]), plain = make([...flat(3), bar(3, 10, 12, 8, 11.5)]);
    plain.instrument = { ...plain.instrument, id: 'plain', symbol: 'PLAIN' };
    const columns: ScreenerColumn[] = [{ id: 'symbol', metric: 'symbol' }, { id: 'doji', metric: 'pattern', parameters: { pattern: 'Doji' } }];
    const filters: ScreenerFilter[] = [{ id: 'f', columnId: 'doji', operator: 'eq', value: 1, active: true }];
    const result = runScreener([doji, plain], columns, filters);
    expect(result.diagnostics).toEqual([]); expect(result.rows.map(r => r.symbol)).toEqual([doji.instrument.symbol]);
    expect(screenerParameters('pattern').map(p => p.key)).toEqual(['pattern', 'within', 'trendRule']);
    expect(screenerParameters('rating')[0].options).toContain('Oscillators');
  });
});
