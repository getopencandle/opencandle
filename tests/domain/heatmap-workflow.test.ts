import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { HEATMAP_UNKNOWN_COLOR, applyHeatmapSetting, calculateHeatmap, heatmapBaseTolerance, heatmapOpenDecision, createHeatmapState, heatmapCsv, heatmapDraftChanged, heatmapKeyboardTarget, heatmapOptions, heatmapPeriodBase, heatmapUniverseDisclosure, layoutHeatmap, layoutHeatmapGroups, resetHeatmapDraft, restoreHeatmapState, type HeatmapMetadata, type HeatmapSettings } from '../../src/domain/heatmap';
import type { Bar, BarDataset } from '../../src/domain/types';
import { HeatmapDialog, requestHeatmapSourceOpen } from '../../src/ui/HeatmapDialog';

const NOW = Date.UTC(2030, 0, 1) / 1000;
const settings = (patch: Partial<HeatmapSettings> = {}): HeatmapSettings => ({ ...createHeatmapState().settings, ...patch });
function data(symbol: string, closes: number[], volumes: number[] = closes.map(() => 100)): BarDataset {
  const result = fixtureDataset(symbol, 0);
  result.bars = closes.map((close, i) => ({ time: 100 + i * 100, open: close, high: close + 1, low: close - 1, close, volume: volumes[i] }));
  return result;
}
function withBars(symbol: string, bars: Bar[], resolution: string): BarDataset { const result = fixtureDataset(symbol, 0); result.bars = bars; result.resolution = resolution; return result; }
const area = (rect: { width: number; height: number }) => rect.width * rect.height;
const render = (datasets: BarDataset[], state = createHeatmapState()) => renderToStaticMarkup(React.createElement(HeatmapDialog, { datasets, state, onChange: () => {}, onSelect: () => {}, onClose: () => {} }));

/**
 * Daily calendar fixture: one bar per UTC day 2023-12-01 .. 2024-03-31 (122 days, weekends included on purpose).
 * Day index i: close = 100 + i, open = close - 0.5, high = close + 1, low = close - 1, volume = i + 1.
 * Index anchors: 2023-12-31 = 30, 2024-02-29 = 90 (leap year), 2024-03-24 = 114, 2024-03-30 = 120, 2024-03-31 = 121.
 */
function dailyCalendar(symbol = 'DAILY'): BarDataset {
  const bars: Bar[] = [], start = Date.UTC(2023, 11, 1) / 1000;
  for (let i = 0; i < 122; i++) { const close = 100 + i; bars.push({ time: start + i * 86400, open: close - 0.5, high: close + 1, low: close - 1, close, volume: i + 1 }); }
  return withBars(symbol, bars, '1D');
}
/** Hourly fixture spanning a UTC date boundary (2024-01-01 22:00 .. 2024-01-02 01:00). */
function hourly(symbol = 'HOURLY'): BarDataset {
  const t = (day: number, hour: number) => Date.UTC(2024, 0, day, hour) / 1000;
  return withBars(symbol, [
    { time: t(1, 22), open: 100, high: 101, low: 99, close: 100, volume: 5 },
    { time: t(1, 23), open: 100, high: 103, low: 100, close: 102, volume: 5 },
    { time: t(2, 0), open: 103, high: 105, low: 101, close: 104, volume: 10 },
    { time: t(2, 1), open: 104, high: 108, low: 103, close: 106, volume: 20 },
  ], '1h');
}
const colorOf = (dataset: BarDataset, color: HeatmapSettings['color']) => calculateHeatmap([dataset], settings({ color }), [], NOW).items[0];
const sizeOf = (dataset: BarDataset, size: HeatmapSettings['size']) => calculateHeatmap([dataset], settings({ size }), [], NOW).items[0];

describe('heatmap tile weights and color buckets (independent arithmetic)', () => {
  it('gives proportional areas equal to the size share of the full viewport', () => {
    // N=1 volume sizes 600, 300, 100; total 1000. Viewport 1000 x 500 = 500000 px².
    // Expected areas: 0.6*500000 = 300000, 0.3*500000 = 150000, 0.1*500000 = 50000.
    const rows = [data('A', [10, 10], [1, 600]), data('B', [10, 10], [1, 300]), data('C', [10, 10], [1, 100])];
    const result = calculateHeatmap(rows, settings({ monoSize: false }), [], NOW);
    expect(result.items.map(item => [item.symbol, item.sizeValue, item.weight])).toEqual([['A', 600, 600], ['B', 300, 300], ['C', 100, 100]]);
    const layout = layoutHeatmapGroups(result.items, 'none', 1000, 500), byId = new Map(layout.groups[0].tiles.map(tile => [tile.id, tile]));
    expect(area(byId.get('SYNTHETIC:A')!)).toBeCloseTo(300000, 6); expect(area(byId.get('SYNTHETIC:B')!)).toBeCloseTo(150000, 6); expect(area(byId.get('SYNTHETIC:C')!)).toBeCloseTo(50000, 6);
    expect(layout.undrawn).toEqual([]);
  });
  it('sizes by supplied market cap only, with a 3:1 area ratio for 3e9 vs 1e9', () => {
    // 400 x 100 = 40000 px²; 3/4 -> 30000, 1/4 -> 10000.
    const a = data('A', [10, 11]), b = data('B', [10, 11]);
    const metadata: HeatmapMetadata[] = [a, b].map((row, index) => ({ instrumentId: row.instrument.id, marketCap: index ? 1e9 : 3e9, aum: null, currency: 'USD', sector: null, fundAssetClass: null, asOf: 100, availableAt: 100, source: 'Synthetic test metadata' }));
    const result = calculateHeatmap([a, b], settings({ size: 'market-cap', monoSize: false }), metadata, NOW);
    const tiles = layoutHeatmap(result.items, 400, 100);
    expect(tiles.map(tile => [tile.id, area(tile)])).toEqual([['SYNTHETIC:A', 30000], ['SYNTHETIC:B', 10000]]);
  });
  it('assigns symmetric seven-bin buckets from the largest absolute change', () => {
    // Changes: A +10%, B -5%, C 0%, D +2%. extent = 10. bin = floor(((v / 10) + 1) / 2 * 7), clamped to 0..6.
    // A: (1+1)/2*7 = 7 -> 6.  B: (-0.5+1)/2*7 = 1.75 -> 1.  C: 0.5*7 = 3.5 -> 3.  D: (0.2+1)/2*7 = 4.2 -> 4.
    // Bin 1 bounds: (2/7 - 1)*10 = -50/7 and (4/7 - 1)*10 = -30/7, which contain -5.
    const rows = [data('A', [100, 110]), data('B', [100, 95]), data('C', [50, 50]), data('D', [100, 102])];
    const result = calculateHeatmap(rows, settings(), [], NOW), bins = Object.fromEntries(result.items.map(item => [item.symbol, item.bin]));
    expect(bins).toEqual({ A: 6, B: 1, C: 3, D: 4 });
    expect(result.bins[1].lower).toBeCloseTo(-50 / 7, 12); expect(result.bins[1].upper).toBeCloseTo(-30 / 7, 12);
    expect(result.items.find(item => item.symbol === 'A')!.color).toBe('#087e69');
    expect(result.items.find(item => item.symbol === 'B')!.color).toBe('#bf5059');
    expect(result.bins.map(bin => bin.count)).toEqual([0, 1, 0, 1, 1, 0, 1]);
  });
  it('uses one-directional bins for range and keeps unknown color distinct from every palette color', () => {
    // range% = (high - low) / low * 100. A: high 12 low 10 -> 20%. B: 11/10 -> 10%. extent 20.
    // bin = floor(v / 20 * 7): A -> 7 -> clamp 6; B -> 3.5 -> 3.
    const a = data('A', [11]); a.bars[0] = { ...a.bars[0], open: 11, close: 11, high: 12, low: 10 };
    const b = data('B', [10.5]); b.bars[0] = { ...b.bars[0], open: 10.5, close: 10.5, high: 11, low: 10 };
    const result = calculateHeatmap([a, b], settings({ color: 'range-percent' }), [], NOW);
    expect(Object.fromEntries(result.items.map(item => [item.symbol, item.bin]))).toEqual({ A: 6, B: 3 });
    expect(result.bins[3].lower).toBeCloseTo(60 / 7, 12); expect(result.bins[3].upper).toBeCloseTo(80 / 7, 12);
    // A single loaded bar has a range but no prior close, so close change is unknown for all three.
    const unknown = data('U', [10]);
    const change = calculateHeatmap([a, b, unknown], settings(), [], NOW);
    const u = change.items.find(item => item.symbol === 'U')!;
    expect(u.colorValue).toBeNull(); expect(u.color).toBe(HEATMAP_UNKNOWN_COLOR); expect(change.coverage.unknownColor).toBe(3);
    for (const palette of ['classic', 'color-blind', 'monochrome'] as const) for (const color of ['change', 'relative-volume'] as const) expect(calculateHeatmap([a], settings({ palette, color }), [], NOW).bins.map(bin => bin.color)).not.toContain(HEATMAP_UNKNOWN_COLOR);
  });
});

describe('heatmap calendar-period metrics over loaded bars', () => {
  it('computes daily-bar periods with UTC calendar bases', () => {
    const daily = dailyCalendar();
    // Last close (2024-03-31, i=121) = 221. Change 1D base 2024-03-30 close 220: (221/220 - 1)*100.
    expect(colorOf(daily, 'change-1d').colorValue).toBeCloseTo((221 / 220 - 1) * 100, 10);
    // 1W base <= 2024-03-24 (i=114, close 214).
    expect(colorOf(daily, 'perf-1w').colorValue).toBeCloseTo((221 / 214 - 1) * 100, 10);
    // 1M: 2024-03-31 minus one month clamps to 2024-02-29 (i=90, close 190).
    const month = colorOf(daily, 'perf-1m'); expect(month.colorValue).toBeCloseTo((221 / 190 - 1) * 100, 10); expect(month.colorBaseTime).toBe(Date.UTC(2024, 1, 29) / 1000);
    // 3M: 2023-12-31 (i=30, close 130) -> 70%. YTD: last close before 2024-01-01 is the same bar -> 70%.
    expect(colorOf(daily, 'perf-3m').colorValue).toBeCloseTo(70, 10); expect(colorOf(daily, 'perf-ytd').colorValue).toBeCloseTo(70, 10);
    // 6M and 1Y bases precede the first bar (2023-12-01): unavailable, never shortened.
    for (const color of ['perf-6m', 'perf-1y'] as const) { const item = colorOf(daily, color); expect(item.colorValue).toBeNull(); expect(item.colorReason).toContain('does not reach back'); }
    // Gap 1D: open 220.5 vs prior close 220. Volatility 1D: (222 - 220) / 220.
    expect(colorOf(daily, 'gap-1d').colorValue).toBeCloseTo((220.5 / 220 - 1) * 100, 10);
    expect(colorOf(daily, 'volatility-1d').colorValue).toBeCloseTo(200 / 220, 10);
    // Daily bars cannot resolve 1h or 4h.
    expect(colorOf(daily, 'change-1h')).toMatchObject({ colorValue: null, colorReason: expect.stringContaining('coarser') });
  });
  it('sums calendar volume and turnover windows and refuses incomplete windows', () => {
    const daily = dailyCalendar();
    // Volume 1D = last bar volume 122. Turnover 1D = 221 * 122 = 26962.
    expect(sizeOf(daily, 'volume-1d').sizeValue).toBe(122); expect(sizeOf(daily, 'turnover-1d').sizeValue).toBe(26962);
    // Volume 1W = bars after 2024-03-24: i=115..121, volumes 116..122 -> 7 * 119 = 833.
    const week = sizeOf(daily, 'volume-1w'); expect(week.sizeValue).toBe(833); expect(week.sizeWindow).toMatchObject({ bars: 7, first: Date.UTC(2024, 2, 25) / 1000 });
    // Volume 1M = bars after 2024-02-29: i=91..121, volumes 92..122 -> 31 * 107 = 3317.
    expect(sizeOf(daily, 'volume-1m').sizeValue).toBe(3317);
    const short = withBars('SHORT', daily.bars.slice(-5), '1D');
    expect(sizeOf(short, 'volume-1w')).toMatchObject({ sizeValue: null, sizeReason: expect.stringContaining('incomplete') });
  });
  it('handles intraday bars across a UTC date boundary', () => {
    const h = hourly();
    // Change 1h: base <= 00:00 -> close 104; (106/104 - 1)*100. Change 4h: base <= 21:00 precedes history.
    expect(colorOf(h, 'change-1h').colorValue).toBeCloseTo((106 / 104 - 1) * 100, 10);
    expect(colorOf(h, 'change-4h').colorValue).toBeNull();
    // Change 1D: last close before 2024-01-02 is 23:00 close 102. Gap 1D: first open 103 vs 102.
    expect(colorOf(h, 'change-1d').colorValue).toBeCloseTo((106 / 102 - 1) * 100, 10);
    expect(colorOf(h, 'gap-1d').colorValue).toBeCloseTo((103 / 102 - 1) * 100, 10);
    // Volatility 1D over 2024-01-02 bars only: high max(105,108)=108, low min(101,103)=101.
    expect(colorOf(h, 'volatility-1d').colorValue).toBeCloseTo((108 - 101) / 101 * 100, 10);
    // Volume 1D = 10 + 20 = 30; turnover 1D = 104*10 + 106*20 = 3160.
    expect(sizeOf(h, 'volume-1d').sizeValue).toBe(30); expect(sizeOf(h, 'turnover-1d').sizeValue).toBe(3160);
  });
  it('clamps month arithmetic and keeps YTD at the prior UTC year end', () => {
    expect(heatmapPeriodBase(Date.UTC(2023, 4, 31, 15) / 1000, '3m')).toBe(Date.UTC(2023, 1, 28, 15) / 1000);
    expect(heatmapPeriodBase(Date.UTC(2024, 2, 31) / 1000, '1y')).toBe(Date.UTC(2023, 2, 31) / 1000);
    expect(heatmapPeriodBase(Date.UTC(2024, 5, 15) / 1000, 'ytd')).toBe(Date.UTC(2024, 0, 1) / 1000 - 1);
    expect(heatmapPeriodBase(Date.UTC(2024, 5, 15, 13) / 1000, '1d')).toBe(Date.UTC(2024, 5, 15) / 1000 - 1);
  });
  it('treats undeclared resolutions as unavailable for calendar periods only', () => {
    const local = data('LOCAL', [10, 11]); local.resolution = 'user-supplied';
    expect(colorOf(local, 'change-1d')).toMatchObject({ colorValue: null, colorReason: expect.stringContaining('no declared time duration') });
    expect(colorOf(local, 'change').colorValue).toBeCloseTo(10, 10);
  });
});

describe('heatmap zero, negative, missing and invented-data boundaries', () => {
  it('separates zero sizes, rejects invalid bars and never fabricates fundamentals', () => {
    const zero = data('ZERO', [10, 10], [0, 0]), negative = data('NEG', [10, 11]); negative.bars[1] = { ...negative.bars[1], close: -1, low: -2 };
    const badVolume = data('BADV', [10, 11], [100, -5]);
    const result = calculateHeatmap([zero, negative, badVolume], settings({ monoSize: false }), [], NOW);
    expect(result.zeroWeight.map(item => item.symbol)).toEqual(['ZERO']);
    expect(result.unavailable.map(item => item.symbol).sort()).toEqual(['BADV', 'NEG']);
    expect(result.unavailable.every(item => item.colorValue === null && item.price === null)).toBe(true);
    const missing = calculateHeatmap([zero], settings({ size: 'market-cap', grouping: 'sector' }), [], NOW).items[0];
    expect(missing).toMatchObject({ sizeValue: null, group: 'Sector unavailable' }); expect(missing.sizeReason).toContain('never derived');
    expect(() => restoreHeatmapState({ ...createHeatmapState(), metadata: [{ instrumentId: 'X', marketCap: -1, aum: null, currency: 'USD', sector: null, fundAssetClass: null, asOf: 0, availableAt: 0, source: 'S' }] })).toThrow();
  });
  it('disables data-less size, color and grouping options with reasons instead of falling back', () => {
    const daily = dailyCalendar(), state = createHeatmapState();
    const options = heatmapOptions([daily], state), find = <T extends { value: string }>(rows: readonly T[], value: string) => rows.find(row => row.value === value)!;
    expect(find(options.size, 'market-cap')).toMatchObject({ available: false, reason: expect.stringContaining('never derived') });
    expect(find(options.size, 'aum').available).toBe(false); expect(find(options.size, 'volume-1w').available).toBe(true);
    expect(find(options.color, 'change-1h')).toMatchObject({ available: false, reason: expect.stringContaining('1D') });
    expect(find(options.grouping, 'sector').available).toBe(false); expect(find(options.grouping, 'exchange').available).toBe(true);
    // The placeholders are real metrics now, disabled here because a daily synthetic set has no extended hours, SPY or fund data.
    expect(options.unsupportedColor).toEqual([]);
    for (const value of ['extended-pre', 'extended-post', 'beta-1y', 'fund-nav-return', 'fund-top-weight']) expect(find(options.color, value).available).toBe(false);
    state.metadata = [{ instrumentId: daily.instrument.id, marketCap: 5, aum: null, currency: 'USD', sector: 'Supplied sector', fundAssetClass: null, asOf: 0, availableAt: 0, source: 'Synthetic test metadata' }];
    const supplied = heatmapOptions([daily], state);
    expect(find(supplied.size, 'market-cap').available).toBe(true); expect(find(supplied.grouping, 'sector').available).toBe(true);
    expect(find(heatmapOptions([daily, hourly()], createHeatmapState()).color, 'change-1h').available).toBe(true);
    // Selecting an unavailable metric through saved state keeps tiles explicitly unavailable.
    const result = calculateHeatmap([daily], settings({ size: 'market-cap', monoSize: false }), [], NOW);
    expect(result.items).toHaveLength(0); expect(result.unavailable).toHaveLength(1);
  });
});

describe('heatmap filtering and loaded-subset disclosure', () => {
  it('counts each filter separately, trims search and states the subset scope', () => {
    const rows = [data('AAPL', [10, 11]), data('SPY', [10, 11]), data('MSFT', [10, 11]), data('FUT', [10, 11])]; rows[3].instrument.assetClass = 'future'; rows[2].resolution = '1h';
    const result = calculateHeatmap(rows, settings({ search: '  aapl ', resolution: '1D' }), [], NOW);
    expect(result.items.map(item => item.symbol)).toEqual(['AAPL']);
    expect(result.filtered).toEqual({ unsupportedClass: 1, asset: 0, resolution: 1, search: 1, currency: 0 });
    expect(result.universe).toEqual({ stock: 2, etf: 1, other: 1, synthetic: 4, nonSynthetic: 0 });
    const text = heatmapUniverseDisclosure(result);
    expect(text).toContain('Loaded subset, not a whole market: 4 supplied instruments (2 stock, 1 ETF, 1 other');
    expect(text).toContain('shares of this subset only'); expect(text).toContain('2 datasets filtered (asset 0, resolution 1, search 1, currency 0)');
    expect(calculateHeatmap(rows, settings({ asset: 'etf' }), [], NOW).filtered.asset).toBe(2);
  });
});

describe('heatmap resize and layout determinism', () => {
  const rows = ['A', 'B', 'C', 'D', 'E'].map((symbol, index) => data(symbol, [10, 10 + index], [1, (index + 1) * 100]));
  it('is deterministic and scales exactly with a proportional viewport', () => {
    const items = calculateHeatmap(rows, settings({ monoSize: false }), [], NOW).items;
    const first = layoutHeatmapGroups(items, 'none', 900, 440), again = layoutHeatmapGroups(items, 'none', 900, 440), half = layoutHeatmapGroups(items, 'none', 450, 220);
    expect(again).toEqual(first);
    // Halving both sides halves every coordinate (power-of-two scaling is exact) and quarters every area.
    expect(half.groups[0].tiles).toEqual(first.groups[0].tiles.map(tile => ({ id: tile.id, x: tile.x / 2, y: tile.y / 2, width: tile.width / 2, height: tile.height / 2 })));
    expect(first.groups[0].tiles.reduce((sum, tile) => sum + area(tile), 0)).toBeCloseTo(900 * 440, 6);
  });
  it('orders groups by total weight, reserves headers and lists tiles too small to draw', () => {
    const items = calculateHeatmap(rows, settings({ monoSize: false, grouping: 'instrument-type' }), [], NOW).items.map(item => ({ ...item, group: ['A', 'B'].includes(item.symbol) ? 'small' : 'large' }));
    // large = 300+400+500 = 1200, small = 100+200 = 300 -> large first.
    const layout = layoutHeatmapGroups(items, 'instrument-type', 600, 300);
    expect(layout.groups.map(group => group.group)).toEqual(['large', 'small']);
    for (const group of layout.groups) for (const tile of group.tiles) { expect(tile.y).toBeGreaterThanOrEqual(group.bounds.y + 20 - 1e-9); expect(tile.x + tile.width).toBeLessThanOrEqual(group.bounds.x + group.bounds.width + 1e-9); }
    const tiny = layoutHeatmapGroups(items, 'instrument-type', 600, 21);
    expect([...tiny.undrawn].sort()).toEqual(items.map(item => item.id).sort());
    expect(layoutHeatmapGroups(items, 'none', 0, 300).undrawn).toHaveLength(5);
  });
});

describe('heatmap keyboard selection', () => {
  // Four equal tiles in 400x400: the first split is vertical (A,B | C,D), then each half splits horizontally.
  const rects = layoutHeatmap(['A', 'B', 'C', 'D'].map(id => ({ id, weight: 1 })), 400, 400), order = ['A', 'B', 'C', 'D'];
  it('moves spatially with arrows and by metric order with Home/End', () => {
    expect(rects.map(rect => [rect.id, rect.x, rect.y])).toEqual([['A', 0, 0], ['B', 0, 200], ['C', 200, 0], ['D', 200, 200]]);
    expect(heatmapKeyboardTarget(rects, order, 'A', 'ArrowRight')).toBe('C');
    expect(heatmapKeyboardTarget(rects, order, 'A', 'ArrowDown')).toBe('B');
    expect(heatmapKeyboardTarget(rects, order, 'D', 'ArrowUp')).toBe('C');
    expect(heatmapKeyboardTarget(rects, order, 'D', 'ArrowLeft')).toBe('B');
    expect(heatmapKeyboardTarget(rects, order, 'A', 'ArrowLeft')).toBeNull();
    expect(heatmapKeyboardTarget(rects, order, 'C', 'Home')).toBe('A'); expect(heatmapKeyboardTarget(rects, order, 'A', 'End')).toBe('D');
    expect(heatmapKeyboardTarget(rects, order, null, 'ArrowDown')).toBe('A'); expect(heatmapKeyboardTarget(rects, order, 'A', 'x')).toBeNull();
    expect(heatmapKeyboardTarget([], [], null, 'Home')).toBeNull();
  });
});

describe('heatmap cancel, reset, persistence and chart-open requests', () => {
  it('resets display settings only, keeps sources and metadata, and leaves saved state untouched', () => {
    const saved = createHeatmapState(); saved.settings.datasetSelections = { 'SYNTHETIC:A': '["k"]' };
    saved.metadata = [{ instrumentId: 'SYNTHETIC:A', marketCap: 1, aum: null, currency: 'USD', sector: null, fundAssetClass: null, asOf: 0, availableAt: 0, source: 'S' }];
    const draft = restoreHeatmapState(JSON.parse(JSON.stringify(saved))); draft.settings.color = 'perf-1m'; draft.settings.hiddenBins = [2];
    expect(heatmapDraftChanged(saved, draft)).toBe(true); expect(heatmapDraftChanged(saved, restoreHeatmapState(saved))).toBe(false);
    const reset = resetHeatmapDraft(draft);
    expect(reset.settings).toEqual({ ...createHeatmapState().settings, datasetSelections: { 'SYNTHETIC:A': '["k"]' } }); expect(reset.metadata).toEqual(saved.metadata);
    expect(draft.settings.color).toBe('perf-1m');
    expect(heatmapDraftChanged(saved, { ...draft, settings: { ...draft.settings, bars: 0 } })).toBe(true);
  });
  it('round-trips new period choices and rejects unsupported leaves on restore', () => {
    const state = createHeatmapState(); Object.assign(state.settings, { size: 'turnover-1w', color: 'perf-ytd', grouping: 'exchange', zoomGroup: 'SYNTHETIC', search: 'a', hiddenBins: [0, 6] });
    const restored = restoreHeatmapState(JSON.parse(JSON.stringify(state)));
    expect(restored).toEqual(state); expect(restoreHeatmapState(JSON.parse(JSON.stringify(restored)))).toEqual(restored);
    for (const color of ['unsupported:beta', 'premarket-change', 'beta']) expect(() => restoreHeatmapState({ ...state, settings: { ...state.settings, color } })).toThrow('Invalid heatmap color');
    // A pre-change saved state (baseline schema, no new keys) still restores unchanged.
    const legacy = { schemaVersion: 1, settings: { asset: 'etf', size: 'turnover', color: 'gap', bars: 3, monoSize: false, grouping: 'none', zoomGroup: null, search: '', currency: 'USD', resolution: '1D', hiddenBins: [], title: 'description', value: 'price', palette: 'monochrome', knowledgeCutoff: null, datasetSelections: {} }, metadata: [] };
    expect(restoreHeatmapState(legacy)).toEqual(legacy);
  });
  it('opens only the exact displayed source and reports unconfirmed or failing chart requests', () => {
    const a = data('A', [10, 11]), item = calculateHeatmap([a], settings(), [], NOW).items[0];
    let opened: BarDataset | null = null;
    expect(requestHeatmapSourceOpen(item, [a], dataset => { opened = dataset; return { ok: true }; })).toEqual({ ok: true }); expect(opened).toBe(a);
    expect(requestHeatmapSourceOpen(item, [a], () => undefined).ok).toBe(false);
    expect(requestHeatmapSourceOpen(item, [a], () => { throw new Error('grid locked'); })).toEqual({ ok: false, error: 'grid locked' });
    const changed = structuredClone(a); changed.provenance.revision = '2';
    expect(requestHeatmapSourceOpen(item, [changed], () => ({ ok: true })).error).toContain('missing, changed or ambiguous');
  });
});

describe('heatmap visible-view CSV export', () => {
  it('keeps unknown values empty, guards formula cells and labels the subset scope', () => {
    const formula = data('=CMD', [10, 12]), unknown = data('ONE', [10]), hidden = data('DOWN', [10, 5]);
    const result = calculateHeatmap([formula, unknown, hidden], settings({ monoSize: false, hiddenBins: [0] }), [], NOW);
    const lines = heatmapCsv(result, settings({ monoSize: false, hiddenBins: [0] })).split('\r\n');
    expect(lines[0]).toContain('"scope","status","symbol"');
    expect(lines).toHaveLength(4);
    const shown = lines.find(line => line.includes('CMD'))!; expect(shown).toContain(`"'=CMD"`); expect(shown).toContain('"loaded subset; not a full market","shown"');
    // ONE has a single bar: color change needs 2 bars, so color_value stays empty rather than 0.
    const one = lines.find(line => line.includes('"ONE"'))!; expect(one).toContain('"change","","%"'); expect(one).not.toContain('"change","0"');
    expect(lines.some(line => line.includes('"hidden by legend","DOWN"'))).toBe(true);
  });
});

describe('heatmap static markup only, not executable UI evidence', () => {
  it('lists unavailable options disabled with reasons and discloses the loaded subset', () => {
    const markup = render([dailyCalendar()]);
    expect(markup).toMatch(/<option value="market-cap" disabled="" title="[^"]*never derived[^"]*">Market cap \(unavailable\)<\/option>/);
    // The pre-market option is a real metric now, still disabled for daily bars.
    expect(markup).toMatch(/<option value="extended-pre" disabled=""/);
    expect(markup).toMatch(/<option value="change-1h" disabled=""/);
    expect(markup).toContain('Loaded subset, not a whole market'); expect(markup).toContain('Logos (unavailable)');
    expect(markup).toMatch(/aria-label="Heatmap logos"[^>]*disabled=""/);
    expect(markup).not.toContain('Unapplied changes'); expect(markup).not.toContain('—');
  });
  it('states an unavailable saved metric instead of substituting another and disables the unused N input', () => {
    const state = createHeatmapState(); state.settings.size = 'market-cap'; state.settings.color = 'perf-1m';
    const markup = render([dailyCalendar()], state);
    expect(markup).toContain('Market cap is unavailable for the loaded data'); expect(markup).toContain('no other metric is substituted');
    expect(markup).toMatch(/aria-label="Heatmap loaded bars"[^>]*disabled=""/);
  });
  it('renders one roving tab stop over drawn tiles', () => {
    const markup = render([data('A', [10, 11]), data('B', [10, 9])]);
    expect(markup.match(/role="button" tabindex="0"/g)).toHaveLength(1); expect(markup.match(/role="button" tabindex="-1"/g)).toHaveLength(1);
  });
});

describe('heatmap review regressions (independent review findings)', () => {
  it('Reset recovers an invalid draft and a disabled N never traps the draft', () => {
    const invalid = createHeatmapState(); invalid.settings.bars = 0; invalid.settings.knowledgeCutoff = 1.5;
    expect(() => restoreHeatmapState(invalid)).toThrow();
    const reset = resetHeatmapDraft(invalid); expect(restoreHeatmapState(reset)).toEqual(reset); expect(reset.settings.bars).toBe(1);
    const zero = { ...createHeatmapState().settings, bars: 0 };
    // Size still uses N, so the invalid N stays visible and editable.
    expect(applyHeatmapSetting(zero, 'color', 'perf-1m').bars).toBe(0);
    // Neither metric uses N any more: it returns to the default 1 instead of becoming an uneditable invalid value.
    expect(applyHeatmapSetting(applyHeatmapSetting(zero, 'color', 'perf-1m'), 'size', 'volume-1w').bars).toBe(1);
    expect(applyHeatmapSetting({ ...zero, bars: 5, zoomGroup: 'X' }, 'grouping', 'exchange')).toMatchObject({ zoomGroup: null, bars: 5 });
  });
  it('refuses 1D windows whose loaded history starts after 00:00 UTC', () => {
    const h = hourly(), fromMidnight = withBars('MID', h.bars.slice(2), '1h'), partial = withBars('PART', h.bars.slice(3), '1h');
    // From 00:00: 10 + 20 = 30 is a whole loaded day so far.
    expect(sizeOf(fromMidnight, 'volume-1d').sizeValue).toBe(30);
    expect(sizeOf(partial, 'volume-1d')).toMatchObject({ sizeValue: null, sizeReason: expect.stringContaining('incomplete') });
    expect(colorOf(partial, 'volatility-1d').colorValue).toBeNull();
  });
  it('matches weekly and monthly bars by calendar index, not timestamp shift', () => {
    const day = (y: number, m: number, d: number) => Date.UTC(y, m, d) / 1000, bar = (time: number, close: number, volume = 1): Bar => ({ time, open: close, high: close, low: close, close, volume });
    // Weekly: Mon 1 Jan, Tue 9 Jan (holiday-shifted stamp), Mon 15 Jan. 1W base is the 9 Jan bar: (121/110 - 1) * 100 = 10.
    const weekly = withBars('WK', [bar(day(2024, 0, 1), 100, 1), bar(day(2024, 0, 9), 110, 2), bar(day(2024, 0, 15), 121, 4)], '1W');
    const w = colorOf(weekly, 'perf-1w'); expect(w.colorValue).toBeCloseTo(10, 10); expect(w.colorBaseTime).toBe(day(2024, 0, 9));
    expect(sizeOf(weekly, 'volume-1w')).toMatchObject({ sizeValue: 4, sizeWindow: { bars: 1 } });
    expect(colorOf(weekly, 'perf-ytd')).toMatchObject({ colorValue: null, colorReason: expect.stringContaining('1 January') });
    expect(heatmapOptions([weekly], createHeatmapState()).color.find(option => option.value === 'perf-ytd')!.available).toBe(false);
    // Monthly bars stamped on first trading days: Nov 1, Dec 1, Jan 2, Feb 1 with closes 100, 104, 110, 121.
    const monthly = withBars('MO', [bar(day(2023, 10, 1), 100), bar(day(2023, 11, 1), 104), bar(day(2024, 0, 2), 110), bar(day(2024, 1, 1), 121)], '1M');
    // 1M base = Jan 2 bar (a timestamp shift to Jan 1 would wrongly pick December): 10%.
    expect(colorOf(monthly, 'perf-1m').colorValue).toBeCloseTo(10, 10);
    // YTD base = December 2023 bar: (121/104 - 1) * 100. 3M base = November: 21%.
    expect(colorOf(monthly, 'perf-ytd').colorValue).toBeCloseTo((121 / 104 - 1) * 100, 10);
    expect(colorOf(monthly, 'perf-3m').colorValue).toBeCloseTo(21, 10);
    expect(colorOf(monthly, 'perf-6m').colorValue).toBeNull();
  });
  it('applies the metadata cutoff to option availability and exports traceable, guarded CSV', () => {
    const a = data('A', [10, 11]), state = createHeatmapState();
    state.metadata = [{ instrumentId: a.instrument.id, marketCap: 5, aum: null, currency: 'USD', sector: null, fundAssetClass: null, asOf: 300, availableAt: 500, source: 'S' }];
    expect(heatmapOptions([a], state).size.find(option => option.value === 'market-cap')!.available).toBe(true);
    state.settings.knowledgeCutoff = 400;
    expect(heatmapOptions([a], state).size.find(option => option.value === 'market-cap')!.reason).toContain('cutoff');
    const wide = data('＝X', [10, 12]), result = calculateHeatmap([wide], settings(), [], NOW), lines = heatmapCsv(result, settings()).split('\r\n');
    expect(lines[0]).toContain('"color_base_bar_utc","size_window_bars","size_window_first_utc","size_window_last_utc"');
    expect(lines[1]).toContain(`"'＝X"`); expect(lines[1]).toContain(`"${new Date(100 * 1000).toISOString()}","1"`);
  });
  it('lists unavailable options with readable reasons outside the native select', () => {
    const markup = render([dailyCalendar()]);
    expect(markup).toContain('Unavailable options and reasons');
    expect(markup).toMatch(/<li><b>Market cap<\/b>: No market-cap metadata/);
    expect(markup).toMatch(/<li><b>Pre-market change, %<\/b>: No loaded US stock or ETF dataset has intraday bars/); // The reason now names the missing input.
  });
});

describe('heatmap second-review regressions', () => {
  const day = (y: number, m: number, d: number) => Date.UTC(y, m, d) / 1000;
  const bar = (time: number, close: number, volume = 1): Bar => ({ time, open: close, high: close + 1, low: close - 1, close, volume });
  it('M1: a period base older than its tolerance is unavailable with a data-gap reason', () => {
    // Daily 1-10 Jan, then 1 Mar. Performance 1W target = 23 Feb; the base would be 10 Jan, 44 days old (tolerance 1D bar + 4 days = 5 days).
    const gap = withBars('GAP', [...Array.from({ length: 10 }, (_, i) => bar(day(2024, 0, 1 + i), 100 + i)), bar(day(2024, 2, 1), 200)], '1D');
    expect(colorOf(gap, 'perf-1w')).toMatchObject({ colorValue: null, colorReason: expect.stringContaining('data gap') });
    expect(colorOf(gap, 'change-1d').colorValue).toBeNull();
    // One complete daily bar is still a whole 1D volume window.
    expect(sizeOf(gap, 'volume-1d').sizeValue).toBe(1);
    expect(heatmapBaseTolerance('1w', '1D')).toBe(5 * 86400); expect(heatmapBaseTolerance('1h', '5m')).toBe(300); expect(heatmapBaseTolerance('1d', 'user-supplied')).toBeNull();
    // Boundary: last = D0 + 12 days -> 1W target D0 + 5 days, base age exactly 5 days -> allowed: (110/100 - 1) * 100 = 10.
    const d0 = day(2024, 0, 1), edge = withBars('EDGE', [bar(d0, 100), bar(d0 + 12 * 86400, 110)], '1D');
    expect(colorOf(edge, 'perf-1w').colorValue).toBeCloseTo(10, 10);
    // One second older than the tolerance -> stale.
    expect(colorOf(withBars('EDGE2', [bar(d0, 100), bar(d0 + 12 * 86400 + 1, 110)], '1D'), 'perf-1w').colorValue).toBeNull();
    // Monday after a Monday-holiday weekend (Fri -> Tue): base age 3 days 23:59:59 <= 5 days -> Change 1D available.
    expect(colorOf(withBars('HOL', [bar(day(2024, 0, 12), 100), bar(day(2024, 0, 16), 103)], '1D'), 'change-1d').colorValue).toBeCloseTo(3, 10);
    // Intraday 1h bars across an overnight gap: Change 1h at the session's first bar is unavailable (base 17 h old > 1 h).
    const overnight = withBars('ON', [bar(day(2024, 0, 2) + 19 * 3600, 100), bar(day(2024, 0, 2) + 20 * 3600, 101), bar(day(2024, 0, 3) + 14 * 3600, 105)], '1h');
    expect(colorOf(overnight, 'change-1h').colorValue).toBeNull();
  });
  it('L2: exactly seven full daily bars make 1W sums available; six do not', () => {
    // Last 31 Mar, 1W target 24 Mar 00:00. Bars 25..31 Mar start one bar (1 day) after the target, so the window is complete.
    const seven = withBars('S7', Array.from({ length: 7 }, (_, i) => bar(day(2024, 2, 25 + i), 10, i + 1)), '1D');
    expect(sizeOf(seven, 'volume-1w')).toMatchObject({ sizeValue: 28, sizeWindow: { bars: 7 } }); // 1 + ... + 7 = 28
    expect(sizeOf(seven, 'turnover-1w').sizeValue).toBe(280); // 28 * close 10
    expect(sizeOf(withBars('S6', seven.bars.slice(1), '1D'), 'volume-1w')).toMatchObject({ sizeValue: null, sizeReason: expect.stringContaining('incomplete') });
    // Colors still need a real base close: Performance 1W on the seven bars is unavailable.
    expect(colorOf(seven, 'perf-1w').colorValue).toBeNull();
  });
  it('L3: Reset keeps the resolution filter that disambiguates sources', () => {
    const d1 = data('AMB', [100, 101]), dh = structuredClone(d1); dh.resolution = '1h';
    const draft = createHeatmapState(); draft.settings.resolution = '1D'; draft.settings.color = 'perf-1m'; draft.settings.palette = 'monochrome';
    const reset = resetHeatmapDraft(draft);
    expect(reset.settings).toMatchObject({ resolution: '1D', color: 'change', palette: 'classic' });
    expect(() => calculateHeatmap([d1, dh], reset.settings, [], NOW)).not.toThrow();
  });
  it('L4: metadata dated after the clock is not offered and its reason names the clock', () => {
    const a = data('A', [10, 11]), meta: HeatmapMetadata[] = [{ instrumentId: a.instrument.id, marketCap: 5, aum: null, currency: 'USD', sector: 'S', fundAssetClass: null, asOf: NOW + 10, availableAt: NOW + 10, source: 'future' }];
    const options = heatmapOptions([a], { ...createHeatmapState(), metadata: meta }, NOW);
    expect(options.size.find(option => option.value === 'market-cap')!.available).toBe(false); expect(options.grouping.find(option => option.value === 'sector')!.available).toBe(false);
    expect(heatmapOptions([a], { ...createHeatmapState(), metadata: meta }, NOW + 10).size.find(option => option.value === 'market-cap')!.available).toBe(true);
    expect(calculateHeatmap([a], settings({ size: 'market-cap', monoSize: false }), meta, NOW).unavailable[0].sizeReason).toContain('future');
  });
  it('L5: tiles below 1 px² are listed as undrawn rather than counted as drawn', () => {
    // Weights 1e7 : 1 in 900x440 (396000 px²): the small tile gets about 0.0396 px².
    const base = calculateHeatmap([data('A', [10, 11])], settings(), [], NOW).items[0];
    const items = [{ ...base, id: 'BIG', weight: 1e7 }, { ...base, id: 'TINY', weight: 1 }];
    const layout = layoutHeatmapGroups(items, 'none', 900, 440);
    expect(layout.undrawn).toEqual(['TINY']); expect(layout.groups[0].tiles.map(tile => tile.id)).toEqual(['BIG']);
    expect(layoutHeatmapGroups(items.map(item => ({ ...item, group: 'G' })), 'exchange', 900, 440).undrawn).toEqual(['TINY']);
  });
  it('L1: Enter or double-click selects an unselected tile first and a dirty draft needs confirmation', () => {
    expect(heatmapOpenDecision({ selectedId: null, itemId: 'A', dirty: false, confirmed: false })).toBe('select');
    expect(heatmapOpenDecision({ selectedId: 'B', itemId: 'A', dirty: true, confirmed: true })).toBe('select');
    expect(heatmapOpenDecision({ selectedId: 'A', itemId: 'A', dirty: false, confirmed: false })).toBe('open');
    expect(heatmapOpenDecision({ selectedId: 'A', itemId: 'A', dirty: true, confirmed: false })).toBe('confirm');
    expect(heatmapOpenDecision({ selectedId: 'A', itemId: 'A', dirty: true, confirmed: true })).toBe('open');
  });
});
