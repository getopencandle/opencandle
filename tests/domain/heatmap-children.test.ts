// Per-leaf evidence for the heatmap size, color, appearance, legend and zoom children that the code already
// computes. Every expected number below is a hand oracle built from the bar table, not read back from the module.
// Leaf ids are quoted in each test title so can cite them.
import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { HEATMAP_COLOR_SPECS, HEATMAP_LOGO_REASON, HEATMAP_SIZE_SPECS, HEATMAP_UNSUPPORTED_COLORS, applyHeatmapSetting, calculateHeatmap, createHeatmapState, heatmapOptions, heatmapCsv, layoutHeatmapGroups, restoreHeatmapState, resetHeatmapDraft, type HeatmapMetadata, type HeatmapSettings } from '../../src/domain/heatmap';
import type { BarDataset } from '../../src/domain/types';

const DAY = 86400, START = Date.UTC(2025, 0, 1) / 1000;
const settings = (): HeatmapSettings => createHeatmapState().settings;
/** Daily bars from 2025-01-01 UTC: close = 100 + i, open = close - 0.5, high = close + 1, low = close - 2, volume = 10 + i. */
function daily(symbol: string, count: number, assetClass: 'stock' | 'etf' = 'stock'): BarDataset {
  const set = fixtureDataset(symbol, 0);
  set.instrument.assetClass = assetClass; set.resolution = '1D';
  set.bars = Array.from({ length: count }, (_, i) => ({ time: START + i * DAY, open: 99.5 + i, high: 101 + i, low: 98 + i, close: 100 + i, volume: 10 + i }));
  return set;
}
const dayIndex = (year: number, month: number, date: number) => (Date.UTC(year, month - 1, date) / 1000 - START) / DAY;
const close = (i: number) => 100 + i, vol = (i: number) => 10 + i;
const sumVolume = (from: number, to: number) => { let total = 0; for (let i = from; i <= to; i++) total += vol(i); return total; };
const sumTurnover = (from: number, to: number) => { let total = 0; for (let i = from; i <= to; i++) total += vol(i) * close(i); return total; };
const COUNT = 400, LAST = COUNT - 1; // last bar is 2026-02-04
const pct = (now: number, then: number) => 100 * (now / then - 1);
const classes = ['stock', 'etf'] as const;

describe('HEAT size metrics (STOCK and ETF)', () => {
  for (const kind of classes) {
    const id = kind === 'stock' ? 'STOCK' : 'ETF';
    const set = daily('AAA', COUNT, kind);
    const size = (value: HeatmapSettings['size']) => calculateHeatmap([set], { ...settings(), size: value, monoSize: false, asset: kind }, [], START + COUNT * DAY).items[0].sizeValue;
    it(`HEAT.${id}.SIZE_METRIC.VOLUME1D / TURNOVER1D use only the latest UTC date`, () => {
      expect(size('volume-1d')).toBe(vol(LAST));
      expect(size('turnover-1d')).toBe(vol(LAST) * close(LAST));
    });
    it(`HEAT.${id}.SIZE_METRIC.VOLUME1W / TURNOVER1W sum the 7 calendar days after the base bar`, () => {
      expect(size('volume-1w')).toBe(sumVolume(LAST - 6, LAST));
      expect(size('turnover-1w')).toBe(sumTurnover(LAST - 6, LAST));
    });
    it(`HEAT.${id}.SIZE_METRIC.VOLUME1M / TURNOVER1M sum from the same day of the previous UTC month`, () => {
      const base = dayIndex(2026, 1, 4);
      expect(size('volume-1m')).toBe(sumVolume(base + 1, LAST));
      expect(size('turnover-1m')).toBe(sumTurnover(base + 1, LAST));
    });
  }
  it('HEAT.*.SIZE_METRIC.* reports a window longer than the loaded history as unavailable, never shortened', () => {
    const short = daily('SHORT', 5), result = calculateHeatmap([short], { ...settings(), size: 'volume-1m', monoSize: false }, [], START + 10 * DAY);
    expect(result.items).toHaveLength(0); expect(result.unavailable[0].sizeValue).toBeNull(); expect(result.unavailable[0].sizeReason).toContain('incomplete');
  });
  it('HEAT.STOCK.SIZE_METRIC.MARKET_CAP and HEAT.ETF.SIZE_METRIC.AUM come only from dated supplied metadata', () => {
    const stock = daily('STK', 5), fund = daily('FND', 5, 'etf');
    const metadata: HeatmapMetadata[] = [
      { instrumentId: stock.instrument.id, marketCap: 9000, aum: null, currency: 'USD', sector: 'Tech', fundAssetClass: null, asOf: START, availableAt: START, source: 'Local file' },
      { instrumentId: fund.instrument.id, marketCap: null, aum: 4000, currency: 'USD', sector: null, fundAssetClass: 'Equity', asOf: START, availableAt: START, source: 'Local file' },
    ];
    const now = START + 10 * DAY;
    expect(calculateHeatmap([stock], { ...settings(), size: 'market-cap', monoSize: false }, metadata, now).items[0].sizeValue).toBe(9000);
    expect(calculateHeatmap([fund], { ...settings(), size: 'aum', monoSize: false }, metadata, now).items[0].sizeValue).toBe(4000);
    expect(calculateHeatmap([stock], { ...settings(), size: 'market-cap', monoSize: false }, [], now).unavailable[0].sizeValue).toBeNull();
    const options = heatmapOptions([stock], { ...createHeatmapState(), metadata: [] }, now);
    expect(options.size.find(row => row.value === 'market-cap')).toMatchObject({ available: false });
    expect(options.size.find(row => row.value === 'market-cap')!.reason).toContain('never derived');
  });
});

describe('HEAT color metrics (STOCK and ETF)', () => {
  for (const kind of classes) {
    const id = kind === 'stock' ? 'STOCK' : 'ETF';
    const set = daily('AAA', COUNT, kind);
    const color = (value: HeatmapSettings['color']) => calculateHeatmap([set], { ...settings(), color: value, size: 'volume-1d', asset: kind }, [], START + COUNT * DAY).items[0].colorValue;
    it(`HEAT.${id}.COLOR_METRIC.CHANGE1D compares the latest close with the last close before the latest UTC date`, () => {
      expect(color('change-1d')).toBeCloseTo(pct(close(LAST), close(LAST - 1)), 10);
    });
    it(`HEAT.${id}.COLOR_METRIC.PERFORMANCE1W / 1M / 3M / 6M / 1Y use UTC calendar bases`, () => {
      expect(color('perf-1w')).toBeCloseTo(pct(close(LAST), close(LAST - 7)), 10);
      expect(color('perf-1m')).toBeCloseTo(pct(close(LAST), close(dayIndex(2026, 1, 4))), 10);
      expect(color('perf-3m')).toBeCloseTo(pct(close(LAST), close(dayIndex(2025, 11, 4))), 10);
      expect(color('perf-6m')).toBeCloseTo(pct(close(LAST), close(dayIndex(2025, 8, 4))), 10);
      expect(color('perf-1y')).toBeCloseTo(pct(close(LAST), close(dayIndex(2025, 2, 4))), 10);
    });
    it(`HEAT.${id}.COLOR_METRIC.PERFORMANCEYTD uses the last close before 1 January UTC`, () => {
      expect(color('perf-ytd')).toBeCloseTo(pct(close(LAST), close(dayIndex(2025, 12, 31))), 10);
    });
    it(`HEAT.${id}.COLOR_METRIC.VOLATILITY1D is the latest UTC date range over its low`, () => {
      expect(color('volatility-1d')).toBeCloseTo(100 * ((101 + LAST) - (98 + LAST)) / (98 + LAST), 10);
    });
    it(`HEAT.${id}.COLOR_METRIC.GAP compares an open with the previous close (loaded-bar and first-open-of-date forms)`, () => {
      expect(color('gap')).toBeCloseTo(pct(99.5 + LAST, close(LAST - 1)), 10);
      expect(color('gap-1d')).toBeCloseTo(pct(99.5 + LAST, close(LAST - 1)), 10);
    });
    it(`HEAT.${id}.COLOR_METRIC.CHANGE1H / CHANGE4H compare with the close one and four hours earlier`, () => {
      const hourly = daily('HRS', 0, kind); hourly.resolution = '1h';
      hourly.bars = Array.from({ length: 12 }, (_, i) => ({ time: START + i * 3600, open: 50 + i, high: 52 + i, low: 49 + i, close: 51 + i, volume: 5 }));
      const run = (value: HeatmapSettings['color']) => calculateHeatmap([hourly], { ...settings(), color: value, size: 'volume', bars: 1, asset: kind }, [], START + DAY).items[0].colorValue;
      expect(run('change-1h')).toBeCloseTo(pct(62, 61), 10);
      expect(run('change-4h')).toBeCloseTo(pct(62, 58), 10);
    });
  }
  it('HEAT.STOCK.COLOR_METRIC.RELATIVEVOLUME divides the latest volume by the preceding N mean', () => {
    const set = daily('RV', 10), result = calculateHeatmap([set], { ...settings(), color: 'relative-volume', bars: 3 }, [], START + 20 * DAY);
    expect(result.items[0].colorValue).toBeCloseTo(vol(9) / ((vol(6) + vol(7) + vol(8)) / 3), 12);
  });
  // These five became real color metrics (loaded intraday/daily bars or supplied metadata); without their inputs
  // they are listed unavailable with a reason, which this pins. The retired placeholder list is empty. Values: dl-gaps1-1028-heatmap.test.ts.
  it('HEAT.*.COLOR_METRIC.PRE_MARKETCHANGE / POST_MARKETCHANGE / NAVTOTALRETURN / TOPWEIGHT / BETA are unavailable with reasons when inputs are missing', () => {
    expect(HEATMAP_UNSUPPORTED_COLORS).toEqual([]);
    const options = heatmapOptions([daily('A', COUNT)], createHeatmapState(), START + COUNT * DAY);
    for (const value of ['extended-pre', 'extended-post', 'beta-1y', 'fund-nav-return', 'fund-top-weight']) expect(options.color.find(row => row.value === value)).toMatchObject({ available: false, reason: expect.any(String) });
    for (const value of ['unsupported:beta', 'premarket']) expect(() => restoreHeatmapState({ ...createHeatmapState(), settings: { ...settings(), color: value } })).toThrow();
  });
  it('HEAT.*.COLOR_METRIC.* keeps every selectable metric in the option list', () => {
    // 15 + extended-pre, extended-post, beta-1y, fund-nav-return, fund-top-weight.
    expect(Object.keys(HEATMAP_COLOR_SPECS).length).toBe(20); expect(Object.keys(HEATMAP_SIZE_SPECS).length).toBe(10);
    const options = heatmapOptions([daily('A', COUNT)], createHeatmapState(), START + COUNT * DAY);
    for (const value of ['change-1h', 'change-4h', 'change-1d', 'perf-1w', 'perf-1m', 'perf-3m', 'perf-6m', 'perf-ytd', 'perf-1y', 'volatility-1d', 'gap-1d', 'relative-volume']) expect(options.color.some(row => row.value === value)).toBe(true);
  });
});

describe('HEAT appearance, legend and zoom (STOCK and ETF)', () => {
  const rows = () => [daily('AAA', 30), daily('BBB', 30), daily('CCC', 30, 'etf')];
  it('HEAT.*.APPEARANCE.MONOSIZE gives equal weights, and proportional mode weights by size', () => {
    const data = rows(); data[0].bars = data[0].bars.map(bar => ({ ...bar, volume: bar.volume * 10 }));
    const mono = calculateHeatmap(data, { ...settings(), size: 'volume-1d', monoSize: true }, [], START + 40 * DAY), prop = calculateHeatmap(data, { ...settings(), size: 'volume-1d', monoSize: false }, [], START + 40 * DAY);
    expect(mono.items.every(row => row.weight === 1)).toBe(true);
    expect(prop.items[0].symbol).toBe('AAA'); expect(prop.items[0].weight).toBeGreaterThan(prop.items[1].weight);
  });
  it('HEAT.*.APPEARANCE.TITLE / VALUE persist, validate and survive reset policy', () => {
    for (const title of ['symbol', 'description', 'none'] as const) for (const value of ['color', 'size', 'price', 'none'] as const) {
      const next = applyHeatmapSetting(applyHeatmapSetting(settings(), 'title', title), 'value', value);
      expect(restoreHeatmapState({ ...createHeatmapState(), settings: next }).settings).toMatchObject({ title, value });
    }
    expect(() => restoreHeatmapState({ ...createHeatmapState(), settings: { ...settings(), title: 'logo' } })).toThrow();
    expect(resetHeatmapDraft({ ...createHeatmapState(), settings: { ...settings(), title: 'none', value: 'price' } }).settings).toMatchObject({ title: 'symbol', value: 'color' });
  });
  it('HEAT.*.APPEARANCE.PALETTE changes the tile colors and keeps unknown color distinct', () => {
    const data = rows(), run = (palette: HeatmapSettings['palette']) => calculateHeatmap(data, { ...settings(), palette, color: 'change-1d' }, [], START + 40 * DAY);
    const classic = run('classic'), blind = run('color-blind'), mono = run('monochrome');
    expect(new Set([classic.items[0].color, blind.items[0].color, mono.items[0].color]).size).toBe(3);
    const unknown = daily('UNK', 1); expect(calculateHeatmap([unknown], { ...settings(), color: 'change-1d' }, [], START + 3 * DAY).items[0].color).toBe('#2b303b');
  });
  it('HEAT.*.APPEARANCE.LOGO has no data source and says so', () => {
    expect(HEATMAP_LOGO_REASON).toContain('no licensed logo source');
  });
  it('HEAT.*.COLOR_METRIC.LEGEND.RANGES shows 7 contiguous symmetric bins from the largest absolute value', () => {
    const data = rows(); data[1].bars = data[1].bars.map(bar => ({ ...bar, close: 50 + bar.close / 10 }));
    const result = calculateHeatmap(data, { ...settings(), color: 'change-1d' }, [], START + 40 * DAY);
    expect(result.bins).toHaveLength(7);
    const extent = Math.max(...result.items.map(row => Math.abs(row.colorValue ?? 0)));
    expect(result.bins[0].lower).toBeCloseTo(-extent, 10); expect(result.bins[6].upper).toBeCloseTo(extent, 10);
    for (let i = 1; i < 7; i++) expect(result.bins[i].lower).toBeCloseTo(result.bins[i - 1].upper, 10);
    const volatile = calculateHeatmap(data, { ...settings(), color: 'volatility-1d' }, [], START + 40 * DAY);
    expect(volatile.bins[0].lower).toBe(0);
  });
  it('HEAT.*.COLOR_METRIC.LEGEND.TOGGLE hides a bin and counts its tiles apart from shown tiles', () => {
    const data = rows(); data[0].bars = data[0].bars.map(bar => ({ ...bar, close: bar.close * 3 }));
    const all = calculateHeatmap(data, { ...settings(), color: 'perf-1w' }, [], START + 40 * DAY), bin = all.items[0].bin!;
    const hidden = calculateHeatmap(data, { ...settings(), color: 'perf-1w', hiddenBins: [bin] }, [], START + 40 * DAY);
    expect(hidden.coverage.hidden).toBeGreaterThan(0); expect(hidden.items.length + hidden.hiddenItems.length).toBe(all.items.length);
    expect(hidden.hiddenItems.every(row => row.bin === bin)).toBe(true);
  });
  it('HEAT.*.GROUPING.ZOOM limits the view to one group and Show all returns every group', () => {
    const data = rows(), full = calculateHeatmap(data, { ...settings(), grouping: 'instrument-type' }, [], START + 40 * DAY);
    expect(full.groups).toEqual(['etf', 'stock']);
    const zoomed = calculateHeatmap(data, { ...settings(), grouping: 'instrument-type', zoomGroup: 'etf' }, [], START + 40 * DAY);
    expect(zoomed.items.map(row => row.symbol)).toEqual(['CCC']);
    expect(applyHeatmapSetting({ ...settings(), grouping: 'instrument-type', zoomGroup: 'etf' }, 'grouping', 'exchange').zoomGroup).toBeNull();
    const layout = layoutHeatmapGroups(full.items, 'instrument-type', 600, 400);
    expect(layout.groups.map(group => group.group).sort()).toEqual(['etf', 'stock']);
  });
  it('HEAT.*.EXPORT CSV carries the shown tiles with the metric values', () => {
    const data = rows(), result = calculateHeatmap(data, { ...settings(), color: 'change-1d' }, [], START + 40 * DAY);
    const lines = heatmapCsv(result, { ...settings(), color: 'change-1d' }).split('\r\n');
    expect(lines.length).toBe(result.items.length + 1); expect(lines.some(line => line.includes('AAA'))).toBe(true);
  });
});
