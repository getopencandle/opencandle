// Independent reviewer tests for the stock/ETF heatmap. Model level only; no GUI evidence.
// Tests marked FIXED were FINDING tests in the first review and now assert the fixed behavior.
import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { HEATMAP_UNKNOWN_COLOR, calculateHeatmap, createHeatmapState, heatmapCsv, heatmapKeyboardTarget, heatmapOptions, layoutHeatmap, layoutHeatmapGroups, resetHeatmapDraft, type HeatmapMetadata, type HeatmapSettings } from '../../src/domain/heatmap';
import type { Bar, BarDataset } from '../../src/domain/types';

const NOW = Date.UTC(2030, 0, 1) / 1000;
const DAY = 86400;
const settings = (patch: Partial<HeatmapSettings> = {}): HeatmapSettings => ({ ...createHeatmapState().settings, ...patch });
const utcDay = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000;
function make(symbol: string, bars: Bar[], resolution = '1D'): BarDataset { const d = fixtureDataset(symbol, 0); d.bars = bars; d.resolution = resolution; return d; }
/** Two daily bars: close 100 then `last`; volume `volume` on the last bar. */
function pair(symbol: string, last: number, volume = 100): BarDataset {
  return make(symbol, [{ time: utcDay(2024, 3, 1), open: 100, high: 101, low: 99, close: 100, volume: 1 }, { time: utcDay(2024, 3, 2), open: last, high: Math.max(last, 100) + 1, low: Math.min(last, 100) - 1, close: last, volume }]);
}
function daily(symbol: string, from: number, to: number, close = (i: number) => 100 + i, volume = (i: number) => i + 1): BarDataset {
  const bars: Bar[] = []; for (let t = from, i = 0; t <= to; t += DAY, i++) bars.push({ time: t, open: close(i), high: close(i) + 1, low: close(i) - 1, close: close(i), volume: volume(i) });
  return make(symbol, bars);
}
const one = (dataset: BarDataset, patch: Partial<HeatmapSettings>) => { const r = calculateHeatmap([dataset], settings(patch), [], NOW); return [...r.items, ...r.unavailable, ...r.zeroWeight, ...r.hiddenItems][0]; };

describe('reviewer: weights, layout and color buckets from hand arithmetic', () => {
  it('lays out 50/30/15/5 volume in 200 x 100 exactly', () => {
    // Weights 50,30,15,5 (sum 100), viewport 20000 px². Balanced split: prefix of normalized weights [0,1,1.6,1.9,2.0], half 1 -> split after A.
    // A: ratio 50/100 of width 200 -> x 0..100, h 100 (10000 = 50%).
    // Rest 100x100 (width >= height -> vertical cut): B ratio 30/50 -> x 100..160 (6000 = 30%).
    // Rest 40x100 (height > width -> horizontal cut): C ratio 15/20 -> h 75 (3000 = 15%); D 40x25 (1000 = 5%).
    const rows = [pair('A', 100, 50), pair('B', 100, 30), pair('C', 100, 15), pair('D', 100, 5)];
    const r = calculateHeatmap(rows, settings({ monoSize: false }), [], NOW);
    expect(r.items.map(i => [i.symbol, i.sizeValue])).toEqual([['A', 50], ['B', 30], ['C', 15], ['D', 5]]);
    const tiles = layoutHeatmap(r.items, 200, 100).map(t => [t.id.slice(10), t.x, t.y, t.width, t.height]);
    const expected = [['A', 0, 0, 100, 100], ['B', 100, 0, 60, 100], ['C', 160, 0, 40, 75], ['D', 160, 75, 40, 25]] as const;
    expect(tiles.map(t => t[0])).toEqual(expected.map(e => e[0]));
    tiles.forEach((t, i) => { for (let k = 1; k < 5; k++) expect(t[k] as number).toBeCloseTo(expected[i][k] as number, 9); });
  });
  it('keyboard order on that layout follows geometry, Home/End follow size order', () => {
    const rects = [{ id: 'A', x: 0, y: 0, width: 100, height: 100 }, { id: 'B', x: 100, y: 0, width: 60, height: 100 }, { id: 'C', x: 160, y: 0, width: 40, height: 75 }, { id: 'D', x: 160, y: 75, width: 40, height: 25 }], order = ['A', 'B', 'C', 'D'];
    // A -> Right: B (gap 0) beats C/D (gap 60). B -> Right: C and D both overlap and touch; C centre offset |37.5-50| = 12.5 < D |87.5-50| = 37.5.
    expect(heatmapKeyboardTarget(rects, order, 'A', 'ArrowRight')).toBe('B');
    expect(heatmapKeyboardTarget(rects, order, 'B', 'ArrowRight')).toBe('C');
    expect(heatmapKeyboardTarget(rects, order, 'C', 'ArrowDown')).toBe('D');
    expect(heatmapKeyboardTarget(rects, order, 'D', 'ArrowLeft')).toBe('B');
    expect(heatmapKeyboardTarget(rects, order, 'D', 'ArrowUp')).toBe('C');
    expect(heatmapKeyboardTarget(rects, order, 'A', 'ArrowLeft')).toBeNull();
    expect(heatmapKeyboardTarget(rects, order, 'C', 'Home')).toBe('A');
    expect(heatmapKeyboardTarget(rects, order, 'A', 'End')).toBe('D');
    expect(heatmapKeyboardTarget(rects, order, 'A', 'Tab')).toBeNull();
  });
  it('buckets +7 / -3.5 / 0 / +2 % into bins 6 / 1 / 3 / 4 of a 7 % extent', () => {
    // Symmetric bins: bin = floor(((v / 7) + 1) / 2 * 7).
    // +7 -> 7 -> clamp 6; -3.5 -> 1.75 -> 1; 0 -> 3.5 -> 3; +2 -> (9/7)/2*7 = 4.5 -> 4.
    const rows = [pair('UP', 107), pair('DN', 96.5), pair('FLAT', 100), pair('TWO', 102)];
    const r = calculateHeatmap(rows, settings(), [], NOW), by = new Map(r.items.map(i => [i.symbol, i]));
    expect(by.get('UP')!.colorValue).toBeCloseTo(7, 10); expect(by.get('DN')!.colorValue).toBeCloseTo(-3.5, 10);
    expect([by.get('UP')!.bin, by.get('DN')!.bin, by.get('FLAT')!.bin, by.get('TWO')!.bin]).toEqual([6, 1, 3, 4]);
    // Bin 4 spans [1, 3]: lower = (8/7 - 1) * 7 = 1, upper = (10/7 - 1) * 7 = 3.
    expect(r.bins[4].lower).toBeCloseTo(1, 10); expect(r.bins[4].upper).toBeCloseTo(3, 10);
    expect(r.bins.map(b => b.count)).toEqual([0, 1, 0, 1, 1, 0, 1]);
  });
  it('missing color is the hatched unknown, never bin 3 / neutral 0 %', () => {
    const lone = make('LONE', [{ time: utcDay(2024, 3, 2), open: 10, high: 11, low: 9, close: 10, volume: 5 }]);
    const r = calculateHeatmap([lone, pair('UP', 110)], settings(), [], NOW), item = r.items.find(i => i.symbol === 'LONE')!;
    expect([item.colorValue, item.bin, item.color]).toEqual([null, null, HEATMAP_UNKNOWN_COLOR]);
    expect(item.colorReason).toBeTruthy(); expect(r.coverage.unknownColor).toBe(1); expect(r.bins.reduce((s, b) => s + b.count, 0)).toBe(1);
  });
});

describe('reviewer: zero, negative and missing sizes are never silently dropped', () => {
  it('accounts for every eligible tile in proportional mode', () => {
    const zero = pair('ZERO', 101, 0), neg = pair('NEG', 101, -5), nan = pair('NAN', 101, Number.NaN), ok = pair('OK', 101, 10);
    const r = calculateHeatmap([zero, neg, nan, ok], settings({ monoSize: false }), [], NOW);
    expect(r.items.map(i => i.symbol)).toEqual(['OK']);
    expect(r.zeroWeight.map(i => i.symbol)).toEqual(['ZERO']);
    expect(r.unavailable.map(i => i.symbol).sort()).toEqual(['NAN', 'NEG']);
    expect(r.unavailable.every(i => i.sizeValue === null && !!i.sizeReason)).toBe(true);
    expect(r.items.length + r.zeroWeight.length + r.unavailable.length + r.hiddenItems.length).toBe(r.coverage.eligible);
    // Negative/NaN volume on the latest bar makes the bar unusable, so color is unknown too (not 0).
    expect(r.unavailable.every(i => i.colorValue === null && i.price === null)).toBe(true);
  });
  it('mono-size keeps unknown sizes visible, sorted last and counted', () => {
    const r = calculateHeatmap([pair('NAN', 101, Number.NaN), pair('OK', 101, 10)], settings({ monoSize: true }), [], NOW);
    expect(r.items.map(i => [i.symbol, i.weight, i.sizeValue])).toEqual([['OK', 1, 10], ['NAN', 1, null]]);
    expect(r.coverage.unknownSize).toBe(1);
  });
  it('market cap without metadata never comes from OHLCV; zero market cap is a zero-size tile', () => {
    const a = pair('A', 101, 1e6), b = pair('B', 101, 1e6);
    const none = calculateHeatmap([a, b], settings({ size: 'market-cap', monoSize: false }), [], NOW);
    expect(none.items).toEqual([]); expect(none.unavailable.map(i => i.sizeValue)).toEqual([null, null]);
    expect(none.unavailable[0].sizeReason).toContain('never derived from price or volume');
    const meta: HeatmapMetadata[] = [{ instrumentId: a.instrument.id, marketCap: 0, aum: null, currency: 'USD', sector: null, fundAssetClass: null, asOf: 0, availableAt: 0, source: 'R' }];
    const zero = calculateHeatmap([a, b], settings({ size: 'market-cap', monoSize: false }), meta, NOW);
    expect(zero.zeroWeight.map(i => i.symbol)).toEqual(['A']); expect(zero.unavailable.map(i => i.symbol)).toEqual(['B']);
    expect(() => calculateHeatmap([a], settings({ size: 'market-cap' }), [{ ...meta[0], marketCap: -1 }], NOW)).toThrow();
    // Sector grouping without metadata: explicit "Sector unavailable", never inferred.
    expect(calculateHeatmap([a], settings({ grouping: 'sector' }), [], NOW).items[0].group).toBe('Sector unavailable');
  });
});

describe('reviewer: calendar periods over UTC boundaries', () => {
  it('YTD uses the last close before 1 January across a holiday gap; unavailable when history starts in the year', () => {
    const bars = [utcDay(2023, 12, 28), utcDay(2023, 12, 29), utcDay(2024, 1, 2), utcDay(2024, 1, 3)].map((time, i) => ({ time, open: 100 + i * 10, high: 101 + i * 10, low: 99 + i * 10, close: 100 + i * 10, volume: 1 }));
    const item = one(make('Y', bars), { color: 'perf-ytd' });
    // Base = 2023-12-29 close 110; last close 130 -> 100 * (130/110 - 1) = 18.1818...
    expect(item.colorValue).toBeCloseTo(100 * (130 / 110 - 1), 10); expect(item.colorBaseTime).toBe(utcDay(2023, 12, 29));
    expect(one(make('Y2', bars.slice(2)), { color: 'perf-ytd' }).colorValue).toBeNull();
  });
  it('1Y from a leap day clamps to 28 Feb and the first bar may be the base', () => {
    const d = daily('L', utcDay(2023, 2, 28), utcDay(2024, 2, 29));
    // 366 days -> 367 bars, i = 0..366; base i = 0 close 100, last close 466.
    const item = one(d, { color: 'perf-1y' });
    expect(item.colorBaseTime).toBe(utcDay(2023, 2, 28)); expect(item.colorValue).toBeCloseTo(366, 10);
    const short = daily('S', utcDay(2023, 3, 1), utcDay(2024, 2, 29));
    expect(one(short, { color: 'perf-1y' }).colorValue).toBeNull();
  });
  it('Gap 1D and the volatility proxy match their labels on hourly bars', () => {
    const t = (d: number, h: number) => Date.UTC(2024, 4, d, h) / 1000;
    const bars = [
      { time: t(1, 23), open: 50, high: 51, low: 49, close: 50, volume: 1 },
      { time: t(2, 0), open: 52, high: 60, low: 52, close: 55, volume: 2 },
      { time: t(2, 1), open: 55, high: 56, low: 40, close: 45, volume: 3 },
    ];
    const ds = make('H', bars, '1h');
    // Gap 1D: first open of 2024-05-02 (52) vs prior close 50 -> 4 %.
    expect(one(ds, { color: 'gap-1d' }).colorValue).toBeCloseTo(4, 10);
    // Volatility proxy: (max high 60 - min low 40) / 40 over 2024-05-02 only -> 50 % (the 05-01 bar is excluded).
    expect(one(ds, { color: 'volatility-1d' }).colorValue).toBeCloseTo(50, 10);
    // Change 1D: 45 vs 50 -> -10 %.
    expect(one(ds, { color: 'change-1d' }).colorValue).toBeCloseTo(-10, 10);
    // Volume 1D: 2 + 3.
    expect(one(ds, { size: 'volume-1d', monoSize: false }).sizeValue).toBe(5);
  });
  it('FIXED (L2): exactly seven full UTC days give a complete 1W sum; six do not', () => {
    const seven = daily('W7', utcDay(2024, 3, 25), utcDay(2024, 3, 31)), six = daily('W6', utcDay(2024, 3, 26), utcDay(2024, 3, 31)), eight = daily('W8', utcDay(2024, 3, 24), utcDay(2024, 3, 31));
    expect(seven.bars).toHaveLength(7);
    // T = 31 Mar - 7 d = 24 Mar 00:00; window = bars opened after T. Seven bars 25..31 Mar start at T + 1 bar: volumes 1..7 -> 28.
    expect(one(seven, { size: 'volume-1w', monoSize: false }).sizeValue).toBe(28);
    expect(one(six, { size: 'volume-1w', monoSize: false }).sizeValue).toBeNull();
    // Eight bars: base 24 Mar is fresh, window is the last seven: volumes 2..8 -> 35.
    expect(one(eight, { size: 'volume-1w', monoSize: false }).sizeValue).toBe(35);
    // A single daily bar is a complete latest-date range for the volatility proxy: (101 - 99) / 99.
    expect(one(daily('V1', utcDay(2024, 3, 31), utcDay(2024, 3, 31)), { color: 'volatility-1d' }).colorValue).toBeCloseTo(200 / 99, 10);
  });
  it('FIXED (M1): a base older than the tolerance is a data gap, never a stretched period', () => {
    const early = daily('G', utcDay(2024, 1, 1), utcDay(2024, 1, 10));
    early.bars.push({ time: utcDay(2024, 3, 1), open: 200, high: 201, low: 199, close: 200, volume: 1 });
    const item = one(early, { color: 'perf-1w' });
    expect([item.colorValue, item.colorBaseTime]).toEqual([null, null]); expect(item.colorReason).toContain('data gap');
    // The 1W sum is also refused: base 10 Jan is stale and the bars after it start on 1 Mar, after T + 1 bar (24 Feb).
    const size = one(early, { size: 'volume-1w', monoSize: false });
    expect(size.sizeValue).toBeNull(); expect(size.sizeReason).toContain('data gap');
  });
});

describe('reviewer: CSV formula-injection guard', () => {
  it('neutralises = + - @ (incl. leading whitespace/control and full-width) in every text column, never in numbers', () => {
    const names = ['+SUM(1)', '-1+1', '@SUM(1)', '\t=1', ' =1', '\r=1', '＝1', ' =1', '=1"x"'];
    const rows = names.map((name, i) => { const d = pair('S' + i, 96); d.instrument.name = name; d.provenance.providerName = '@prov'; return d; });
    const meta: HeatmapMetadata[] = rows.map(d => ({ instrumentId: d.instrument.id, marketCap: null, aum: null, currency: 'USD', sector: '=HYPERLINK("http://x")', fundAssetClass: null, asOf: 0, availableAt: 0, source: '-src' }));
    const s = settings({ grouping: 'sector' }), r = calculateHeatmap(rows, s, meta, NOW), csv = heatmapCsv(r, s);
    const parse = (line: string) => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(m => m[1].replaceAll('""', '"'));
    const lines = csv.split('\r\n'), header = parse(lines[0]), col = (name: string) => header.indexOf(name);
    expect(lines).toHaveLength(names.length + 1);
    for (const line of lines.slice(1)) {
      const cells = parse(line);
      expect(cells[col('name')].startsWith("'")).toBe(true);
      expect(cells[col('group')]).toBe('\'=HYPERLINK("http://x")');
      expect(cells[col('provider')]).toBe("'@prov");
      expect(cells[col('metadata_source')]).toBe("'-src");
      // Negative numeric color value stays a plain number (-4 %), not text.
      expect(Number(cells[col('color_value')])).toBeCloseTo(-4, 10);
    }
  });
});

describe('reviewer: Reset and option availability', () => {
  it('FIXED (L3): Reset keeps the resolution filter that disambiguates the source', () => {
    const d1 = pair('AMB', 101), dh = structuredClone(d1); dh.resolution = '1h';
    const draft = createHeatmapState(); draft.settings.resolution = '1D'; draft.settings.color = 'perf-1m'; draft.settings.search = 'x';
    const reset = resetHeatmapDraft(draft);
    expect(reset.settings.resolution).toBe('1D'); expect(reset.settings.color).toBe('change'); expect(reset.settings.search).toBe('');
    expect(() => calculateHeatmap([d1, dh], reset.settings, [], NOW)).not.toThrow();
  });
  it('FIXED (L4): options and tiles both refuse metadata dated after the clock', () => {
    const a = pair('A', 101), meta: HeatmapMetadata[] = [{ instrumentId: a.instrument.id, marketCap: 5e9, aum: null, currency: 'USD', sector: 'Tech', fundAssetClass: null, asOf: NOW + 10, availableAt: NOW + 10, source: 'future' }];
    const state = { ...createHeatmapState(), metadata: meta };
    expect(heatmapOptions([a], state, NOW).size.find(o => o.value === 'market-cap')!.available).toBe(false);
    expect(heatmapOptions([a], state, NOW + 10).size.find(o => o.value === 'market-cap')!.available).toBe(true);
    const r = calculateHeatmap([a], settings({ size: 'market-cap', monoSize: false }), meta, NOW);
    expect(r.items).toEqual([]); expect(r.unavailable[0].sizeReason).toContain('future');
  });
  it('FIXED (L5): a sub-pixel tile is listed as undrawn and is not a keyboard target', () => {
    const items = [{ id: 'BIG', weight: 1e7 }, { id: 'TINY', weight: 1 }].map(row => ({ ...calculateHeatmap([pair('A', 101)], settings(), [], NOW).items[0], ...row }));
    const layout = layoutHeatmapGroups(items, 'none', 900, 440), tiles = layout.groups[0].tiles;
    expect(tiles.map(t => t.id)).toEqual(['BIG']); expect(layout.undrawn).toEqual(['TINY']);
    expect(heatmapKeyboardTarget(tiles, ['BIG', 'TINY'], 'BIG', 'End')).toBe('BIG');
  });
});

/** Weekday-only daily bars (UTC 00:00 stamps), skipping listed holidays; close = 100 + index. */
function weekdays(symbol: string, from: number, to: number, holidays: number[] = []): BarDataset {
  const bars: Bar[] = []; for (let t = from; t <= to; t += DAY) { const dow = new Date(t * 1000).getUTCDay(); if (dow === 0 || dow === 6 || holidays.includes(t)) continue; const close = 100 + bars.length; bars.push({ time: t, open: close, high: close + 1, low: close - 1, close, volume: 1 }); }
  return make(symbol, bars);
}
describe('reviewer re-review: M1 staleness rule across weekends, holidays and month ends', () => {
  const change1d = (a: number, b: number) => one(make('P', [a, b].map((time, i) => ({ time, open: 100, high: 111, low: 99, close: 100 + 10 * i, volume: 1 }))), { color: 'change-1d' }).colorValue;
  it('1D on daily bars: weekend, Monday holiday, Fri->Wed and a 4-day closure pass; Thu->Wed is a gap', () => {
    // Tolerance = 1 bar + 4 d = 5 d, measured from T = 00:00 of the latest date - 1 s back to the base bar time.
    expect(change1d(utcDay(2024, 3, 1), utcDay(2024, 3, 4))).toBeCloseTo(10, 10);   // Fri -> Mon: age 3 d - 1 s
    expect(change1d(utcDay(2024, 2, 16), utcDay(2024, 2, 20))).toBeCloseTo(10, 10); // Fri -> Tue (Presidents Day): 4 d - 1 s
    expect(change1d(utcDay(2024, 2, 15), utcDay(2024, 2, 20))).toBeCloseTo(10, 10); // Thu -> Tue: 5 d - 1 s
    expect(change1d(utcDay(2024, 2, 16), utcDay(2024, 2, 21))).toBeCloseTo(10, 10); // Fri -> Wed: 5 d - 1 s
    expect(change1d(utcDay(2024, 2, 15), utcDay(2024, 2, 21))).toBeNull();          // Thu -> Wed: 6 d - 1 s, a gap
  });
  it('1M across a month end landing on a weekend after Good Friday uses the Thursday close', () => {
    // Last = Tue 30 Apr 2024; T = 30 Mar (Sat). Good Friday 29 Mar is skipped, so the base is Thu 28 Mar (age 2 d).
    const d = weekdays('M', utcDay(2024, 3, 1), utcDay(2024, 4, 30), [utcDay(2024, 3, 29)]), item = one(d, { color: 'perf-1m' });
    const baseIndex = d.bars.findIndex(b => b.time === utcDay(2024, 3, 28));
    expect(item.colorBaseTime).toBe(utcDay(2024, 3, 28)); expect(item.colorValue).toBeCloseTo(100 * ((100 + d.bars.length - 1) / (100 + baseIndex) - 1), 10);
  });
  it('YTD across the New Year holiday and a weekend uses Fri 29 Dec', () => {
    const d = weekdays('Y', utcDay(2023, 12, 26), utcDay(2024, 1, 5), [utcDay(2024, 1, 1)]);
    expect(one(d, { color: 'perf-ytd' }).colorBaseTime).toBe(utcDay(2023, 12, 29));
  });
  it('1h on hourly bars tolerates one missing bar (2 h span) and refuses two', () => {
    const h = (hour: number) => Date.UTC(2024, 4, 2, hour) / 1000, bar = (time: number, close: number) => ({ time, open: 100, high: 111, low: 99, close, volume: 1 });
    expect(one(make('H1', [bar(h(10), 100), bar(h(12), 110)], '1h'), { color: 'change-1h' }).colorValue).toBeCloseTo(10, 10);
    expect(one(make('H2', [bar(h(9), 100), bar(h(12), 110)], '1h'), { color: 'change-1h' }).colorValue).toBeNull();
  });
  it('weekly and monthly bars must have a bar in exactly the expected week or month', () => {
    const bar = (time: number, close: number) => ({ time, open: 100, high: 111, low: 99, close, volume: 7 });
    expect(one(make('W', [bar(utcDay(2024, 3, 4), 100), bar(utcDay(2024, 3, 18), 110)], '1W'), { color: 'perf-1w' }).colorValue).toBeNull();
    expect(one(make('W', [bar(utcDay(2024, 3, 12), 100), bar(utcDay(2024, 3, 18), 110)], '1W'), { color: 'perf-1w' }).colorValue).toBeCloseTo(10, 10);
    const monthly = make('MO', [bar(utcDay(2024, 1, 2), 100), bar(utcDay(2024, 3, 1), 110)], '1M');
    expect(one(monthly, { color: 'perf-1m' }).colorValue).toBeNull();
    // A single monthly bar still covers its own month, so Volume 1M is complete.
    expect(one(monthly, { size: 'volume-1m', monoSize: false }).sizeValue).toBe(7);
  });
});
