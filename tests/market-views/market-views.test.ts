import { describe, expect, it } from 'vitest';
import type { Bar, BarDataset } from '../../src/domain/types';
import { hotlist } from '../../src/market-views/hotlists';
import { breadth } from '../../src/market-views/breadth';
import { seasonals } from '../../src/market-views/seasonals';
import { technicalRating } from '../../src/market-views/rating';
import { resolveScope, scopeLine } from '../../src/market-views/scope';
import { restoreMarketViews } from '../../src/market-views/state';

const bar = (time: number, close: number, volume = 100, high = close, low = close): Bar => ({ time, open: close, high, low, close, volume });
const ds = (symbol: string, bars: Bar[], fixture = true): BarDataset => ({
  instrument: { id: 'T:' + symbol, symbol, name: symbol + ' Inc', exchange: 'TEST', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' },
  bars, resolution: '1D',
  provenance: { providerId: 't', providerName: 't', datasetId: symbol, fixture, coverage: '', asOf: 0, delaySeconds: null, adjustment: 'raw', session: 'regular', timezone: 'UTC', state: 'ready', license: '', revision: '', notes: [] },
});
const day = (n: number) => Date.UTC(2024, 0, 1 + n) / 1000;
const series = (closes: number[]) => closes.map((c, i) => bar(day(i), c));
const utc = (y: number, m: number) => Date.UTC(y, m, 28) / 1000;

describe('hotlists', () => {
  const sets = [ds('AAA', [bar(1, 100, 500), bar(2, 110, 500)]), ds('BBB', [bar(1, 50, 900), bar(2, 45, 900)]), ds('CCC', [bar(1, 20, 100), bar(2, 20.2, 100)]), ds('DDD', [bar(1, 5)])];
  it('ranks gainers, losers and volume by hand-checked values', () => {
    const g = hotlist(sets, 'gainers'); expect(g.eligible).toBe(3);
    expect(g.rows.map(r => r.symbol)).toEqual(['AAA', 'CCC']); expect(g.rows[0].changePct).toBeCloseTo(10, 10); expect(g.rows[1].changePct).toBeCloseTo(1, 10);
    const l = hotlist(sets, 'losers'); expect(l.rows.map(r => r.symbol)).toEqual(['BBB']); expect(l.rows[0].changePct).toBeCloseTo(-10, 10); expect(l.rows[0].change).toBe(-5);
    expect(hotlist(sets, 'active').rows.map(r => r.symbol)).toEqual(['BBB', 'AAA', 'CCC']);
  });
  it('honours the limit', () => expect(hotlist(sets, 'active', 2).rows).toHaveLength(2));
});

describe('breadth', () => {
  it('counts advancers, decliners and SMA20 membership', () => {
    const up = ds('UP', series(Array.from({ length: 20 }, (_, i) => i + 1)));        // last 20, SMA20 = 10.5 -> above
    const down = ds('DN', series(Array.from({ length: 20 }, (_, i) => 20 - i)));      // last 1, SMA20 = 10.5 -> below
    const flat = ds('FL', series([5, 5, 5]));                                         // unchanged, too short for SMA
    const r = breadth([up, down, flat]);
    expect([r.scoped, r.measured, r.advancers, r.decliners, r.unchanged]).toEqual([3, 3, 1, 1, 1]);
    expect(r.above[0]).toMatchObject({ period: 20, eligible: 2, above: 1, pct: 50 });
    expect(r.above[1]).toMatchObject({ period: 50, eligible: 0, pct: null });
  });
  it('flags new highs and lows against the prior window only', () => {
    const hi = ds('HI', [...series([10, 11, 12, 11]), bar(day(4), 13, 1, 13, 13)]);
    const lo = ds('LO', [...series([10, 11, 12, 11]), bar(day(4), 9, 1, 9, 9)]);
    const mid = ds('MD', series([10, 11, 12, 11, 11]));
    const r = breadth([hi, lo, mid], 4);
    expect(r.highLow).toEqual({ window: 4, eligible: 3, highs: 1, lows: 1 });
    expect(breadth([hi], 5).highLow.eligible).toBe(0);
  });
});

describe('seasonals', () => {
  const set = ds('S', [bar(utc(2020, 11), 100), bar(utc(2021, 5), 110), bar(utc(2021, 11), 120), bar(utc(2022, 5), 90), bar(utc(2022, 11), 108), bar(utc(2023, 5), 120)]);
  const s = seasonals(set);
  it('builds cumulative lines against the prior December', () => {
    expect(s.years.map(y => y.year)).toEqual([2020, 2021, 2022, 2023]);
    expect(s.years[1].points[5]).toBeCloseTo(10, 10); expect(s.years[1].points[11]).toBeCloseTo(20, 10);
    expect(s.years[2].points[5]).toBeCloseTo(-25, 10); expect(s.years[2].points[11]).toBeCloseTo(-10, 10);
    expect(s.years[3].points[5]).toBeCloseTo((120 / 108 - 1) * 100, 10);
    expect(s.years[0].points.every(p => p === null)).toBe(true);
  });
  it('averages and takes the median across years', () => {
    expect(s.average[5]).toBeCloseTo((10 - 25 + 100 / 9) / 3, 10); expect(s.median[5]).toBeCloseTo(10, 10);
    expect(s.average[11]).toBeCloseTo(5, 10); expect(s.median[11]).toBeCloseTo(5, 10); expect(s.average[0]).toBeNull();
  });
  it('explains short history', () => expect(seasonals(ds('X', [bar(utc(2021, 1), 1), bar(utc(2021, 5), 2)])).note).toMatch(/two calendar years/));
});

describe('technical rating', () => {
  // An accelerating trend plus a small deterministic wobble (slope >= 1 > wobble 0.3, so every close still rises): the
  // MACD line sits clearly above its signal (about +1.07), independent of rounding.
  const up = Array.from({ length: 60 }, (_, i) => 10 + i + 0.02 * i * i + 0.3 * Math.sin(i)), down = up.map(v => 200 - v);
  it('scores an accelerating uptrend 1/3 (Buy) by hand: averages +1, oscillators -1/3', () => {
    const r = technicalRating(series(up)), vote = (name: string) => r.votes.find(v => v.name === name)!;
    // Every close is above each SMA/EMA (+1 x 8). RSI 100, %K 100, CCI > 100 and %R 0 are overbought (-1 x 4); momentum and
    // MACD (line above signal) are +1: oscillators (2 - 4) / 6 = -1/3; score (1 - 1/3) / 2 = 1/3.
    expect(r.groups.average).toBe(1); expect(r.groups.oscillator).toBeCloseTo(-1 / 3, 10);
    expect(r.score).toBeCloseTo(1 / 3, 10); expect(r.label).toBe('Buy'); expect([r.buy, r.sell, r.neutral]).toEqual([10, 4, 0]);
    expect(vote('MACD 12 26 9').vote).toBe(1); expect(vote('MACD 12 26 9').value as number).toBeGreaterThan(0.5);
    expect(vote('RSI 14').value).toBe(100); expect(vote('SMA 50').value).toBeCloseTo(up.slice(10).reduce((a, b) => a + b, 0) / 50, 10);
  });
  it('mirrors for a downtrend and refuses short history', () => {
    const r = technicalRating(series(down));
    expect(r.score).toBeCloseTo(-1 / 3, 10); expect(r.label).toBe('Sell'); expect([r.buy, r.sell, r.neutral]).toEqual([4, 10, 0]);
    expect(r.votes.find(v => v.name === 'MACD 12 26 9')!.vote).toBe(-1);
    const short = technicalRating(series([1, 2, 3])); expect(short.score).toBeNull(); expect(short.label).toBe('Unavailable');
  });
});

describe('scope', () => {
  const a = ds('AAA', series([1, 2, 3])), b = ds('BBB', series([1, 2]));
  it('loaded scope covers every loaded symbol, deduped by instrument', () => {
    const s = resolveScope([a, b, ds('AAA', series([1, 2, 3, 4]))], 'loaded', undefined);
    expect(s.datasets).toHaveLength(2); expect(s.datasets.find(d => d.instrument.symbol === 'AAA')!.bars).toHaveLength(4);
    expect(scopeLine(s, 2)).toMatch(/^2 of 2 loaded symbols\./);
    expect(scopeLine(s, 2)).toMatch(/Not market-wide/);
  });
  it('watchlist scope reports missing names', () => {
    const s = resolveScope([a, b], 'watchlist', ['aaa', 'ZZZ', 'aaa']);
    expect(s.datasets.map(d => d.instrument.symbol)).toEqual(['AAA']); expect(s.watchTotal).toBe(2); expect(s.missingWatch).toEqual(['ZZZ']);
    expect(scopeLine(s, 0)).toMatch(/^1 of 2 watchlist symbols have loaded data, 0 with enough bars/);
  });
  it('restores state tolerantly', () => { expect(restoreMarketViews({ tab: 'bogus', scope: 'watchlist' })).toMatchObject({ tab: 'gainers', scope: 'watchlist' }); expect(restoreMarketViews(7).scope).toBe('loaded'); });
});
