// Heatmap pre-market / post-market change, beta, supplied NAV total return and top weight, and fullscreen.
// SYNTHETIC bars only. Every expected number is a hand oracle from the bar table below.
import { describe, expect, it, vi } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { calculateHeatmap, createHeatmapState, heatmapCsv, heatmapOptions, parseHeatmapMetadata, restoreHeatmapState, type HeatmapMetadata, type HeatmapSettings } from '../../src/domain/heatmap';
import { BETA_MIN_RETURNS, dailyBeta, extendedHoursChange, extendedHoursReason } from '../../src/market-views/heatmap-extended';
import { toggleHeatmapFullscreen } from '../../src/ui/HeatmapDialog';
import type { Bar, BarDataset } from '../../src/domain/types';

const DAY = 86400, NOW = Date.UTC(2026, 11, 31) / 1000;
const settings = (color: HeatmapSettings['color'], asset: HeatmapSettings['asset'] = 'all'): HeatmapSettings => ({ ...createHeatmapState().settings, color, asset });
// New York wall time on 2026-10-19/20 (EDT, UTC-4).
const ny = (day: 19 | 20, hour: number, minute: number) => Date.UTC(2026, 9, day, hour + 4, minute) / 1000;
const bar = (time: number, close: number): Bar => ({ time, open: close, high: close, low: close, close, volume: 10 });
const extendedBars = [bar(ny(19, 15, 55), 100), bar(ny(19, 16, 30), 99), bar(ny(20, 8, 0), 101), bar(ny(20, 9, 25), 102), bar(ny(20, 9, 30), 103), bar(ny(20, 15, 55), 105), bar(ny(20, 16, 0), 104), bar(ny(20, 19, 55), 106.05)];
function intraday(symbol: string, bars: Bar[], session: BarDataset['provenance']['session'] = 'extended', resolution = '5m'): BarDataset {
  const set = fixtureDataset(symbol, 0);
  set.instrument.assetClass = 'stock'; set.instrument.timezone = 'America/New_York'; set.resolution = resolution; set.provenance.session = session; set.bars = bars;
  return set;
}
function daily(symbol: string, closes: number[], assetClass: 'stock' | 'etf' = 'etf'): BarDataset {
  const set = fixtureDataset(symbol, 0), start = Date.UTC(2025, 0, 1) / 1000;
  set.instrument.assetClass = assetClass; set.resolution = '1D';
  set.bars = closes.map((close, i) => ({ time: start + i * DAY, open: close, high: close, low: close, close, volume: 5 }));
  return set;
}

describe('AN.HEAT.STOCK.COLOR_METRIC.PRE_MARKETCHANGE / POST_MARKETCHANGE', () => {
  it('pre-market: last pre-market close of the latest New York date vs the prior regular close', () => {
    const item = calculateHeatmap([intraday('EXT', extendedBars)], settings('extended-pre'), [], NOW).items[0];
    expect(item.colorValue).toBeCloseTo(2, 12); expect(item.colorBaseTime).toBe(ny(19, 15, 55));
    expect(extendedHoursChange(extendedBars.slice(0, 2), 300, 'pre').reason).toBe('No pre-market bars on the latest loaded New York date (2026-10-19).');
  });
  it('post-market: last post-market close vs the regular close of the same New York date', () => {
    const item = calculateHeatmap([intraday('EXT', extendedBars)], settings('extended-post'), [], NOW).items[0];
    expect(item.colorValue).toBeCloseTo(1, 12); expect(item.colorBaseTime).toBe(ny(20, 15, 55));
    expect(extendedHoursChange(extendedBars.slice(0, 6), 300, 'post').reason).toBe('No post-market bars after the regular close of 2026-10-20.');
  });
  it('missing inputs stay unavailable with reasons and the option is disabled', () => {
    const regular = calculateHeatmap([intraday('REG', extendedBars, 'regular')], settings('extended-pre'), [], NOW).items[0];
    expect(regular).toMatchObject({ colorValue: null, colorReason: 'This dataset holds regular-session bars only. Load bars that include extended hours.' });
    expect(extendedHoursReason({ timezone: 'America/New_York', assetClass: 'stock', session: 'extended', resolutionSeconds: 3600 })).toContain('30 minutes or less');
    expect(extendedHoursReason({ timezone: 'Europe/London', assetClass: 'stock', session: 'extended', resolutionSeconds: 300 })).toContain('New York');
    const off = heatmapOptions([intraday('REG', extendedBars, 'regular')], createHeatmapState(), NOW).color.find(row => row.value === 'extended-pre')!;
    expect(off.available).toBe(false);
    expect(heatmapOptions([intraday('EXT', extendedBars)], createHeatmapState(), NOW).color.find(row => row.value === 'extended-post')!.available).toBe(true);
  });
});

describe('AN.HEAT.ETF.COLOR_METRIC.BETA', () => {
  // Benchmark daily returns alternate +1% / -1%; the fund moves exactly twice as much, so beta is 2.
  const n = BETA_MIN_RETURNS + 10, spy: number[] = [100], fund: number[] = [50];
  for (let i = 1; i < n; i++) { const r = i % 2 ? 0.01 : -0.01; spy.push(spy[i - 1] * (1 + r)); fund.push(fund[i - 1] * (1 + 2 * r)); }
  it('beta = cov / var of daily returns on shared dates against loaded SPY daily bars', () => {
    const result = calculateHeatmap([daily('FUND', fund), daily('SPY', spy)], settings('beta-1y', 'etf'), [], NOW);
    const byId = new Map(result.items.map(item => [item.symbol, item.colorValue]));
    expect(byId.get('FUND')).toBeCloseTo(2, 10); expect(byId.get('SPY')).toBeCloseTo(1, 10);
  });
  it('the benchmark is found in the whole pool even when the scope excludes it', () => {
    const item = calculateHeatmap([daily('FUND', fund)], settings('beta-1y'), [], NOW, [daily('FUND', fund), daily('SPY', spy)]).items[0];
    expect(item.colorValue).toBeCloseTo(2, 10);
  });
  it('without SPY, with too few returns, or on intraday bars it is unavailable', () => {
    expect(calculateHeatmap([daily('FUND', fund)], settings('beta-1y'), [], NOW).items[0].colorReason).toBe('Beta needs SPY daily bars loaded as the benchmark.');
    expect(dailyBeta(daily('A', fund.slice(0, 30)).bars, daily('SPY', spy).bars).reason).toContain(`at least ${BETA_MIN_RETURNS} daily returns`);
    expect(calculateHeatmap([intraday('EXT', extendedBars)], settings('beta-1y'), [], NOW, [daily('SPY', spy)]).items[0].colorReason).toBe('Beta needs daily bars for this instrument.');
    expect(heatmapOptions([daily('FUND', fund)], createHeatmapState(), NOW).color.find(row => row.value === 'beta-1y')!.available).toBe(false);
  });
});

describe('AN.HEAT.ETF.COLOR_METRIC.NAVTOTALRETURN / TOPWEIGHT from supplied metadata', () => {
  const set = daily('FUND', [10, 11, 12]), other = daily('BARE', [5, 6]);
  const csv = 'symbol,navTotalReturn,topWeight,asOf,source\nFUND,-3.25,12.5,2026-01-02,My fund sheet\nBARE,,,2026-01-02,My fund sheet\n';
  it('CSV columns are optional, NAV return may be negative, weight must be 0 to 100', () => {
    const { metadata } = parseHeatmapMetadata(csv, 'csv', [set, other], { now: NOW });
    const fund = metadata.find(row => row.instrumentId === set.instrument.id)!, bare = metadata.find(row => row.instrumentId === other.instrument.id)!;
    expect(fund).toMatchObject({ navTotalReturn: -3.25, topWeight: 12.5 }); expect('navTotalReturn' in bare).toBe(false); expect('topWeight' in bare).toBe(false);
    expect(() => parseHeatmapMetadata('symbol,topWeight\nFUND,120\n', 'csv', [set], { now: NOW })).toThrow('Use a percent from 0 to 100.');
    expect(restoreHeatmapState({ ...createHeatmapState(), metadata }).metadata).toEqual(metadata);
    expect(() => restoreHeatmapState({ ...createHeatmapState(), metadata: [{ ...fund, topWeight: -1 }] })).toThrow('Invalid, duplicate or undated heatmap metadata.');
  });
  it('colors by the supplied values and leaves other tiles unavailable, never derived from prices', () => {
    const { metadata } = parseHeatmapMetadata(csv, 'csv', [set, other], { now: NOW });
    const nav = calculateHeatmap([set, other], settings('fund-nav-return'), metadata, NOW), top = calculateHeatmap([set, other], settings('fund-top-weight'), metadata, NOW);
    const value = (r: typeof nav, symbol: string) => r.items.find(item => item.symbol === symbol)!;
    expect(value(nav, 'FUND').colorValue).toBe(-3.25); expect(value(top, 'FUND').colorValue).toBe(12.5);
    expect(value(nav, 'BARE')).toMatchObject({ colorValue: null, colorReason: 'No eligible dated NAV total return in the supplied metadata. It is never derived from prices.' });
    expect(heatmapCsv(nav, settings('fund-nav-return'))).toContain('-3.25');
    const options = heatmapOptions([set], { ...createHeatmapState(), metadata }, NOW).color;
    expect(options.find(row => row.value === 'fund-nav-return')!.available).toBe(true); expect(options.find(row => row.value === 'fund-top-weight')!.available).toBe(true);
    expect(heatmapOptions([set], createHeatmapState(), NOW).color.find(row => row.value === 'fund-top-weight')!.available).toBe(false);
    const future: HeatmapMetadata[] = metadata.map(row => ({ ...row, asOf: NOW + DAY, availableAt: NOW + DAY }));
    expect(calculateHeatmap([set], settings('fund-nav-return'), future, NOW).items[0].colorValue).toBeNull();
  });
});

describe('AN.HEAT.STOCK / ETF.APPEARANCE.FULLSCREEN', () => {
  it('first press puts the heatmap view in fullscreen; the next press exits, restoring the prior window', async () => {
    const doc = { fullscreenElement: null as unknown, exitFullscreen: vi.fn(async () => { doc.fullscreenElement = null; }) };
    const view = { requestFullscreen: vi.fn(async () => { doc.fullscreenElement = view; }) };
    expect(await toggleHeatmapFullscreen(doc, view)).toBe('entered'); expect(view.requestFullscreen).toHaveBeenCalledTimes(1); expect(doc.fullscreenElement).toBe(view);
    expect(await toggleHeatmapFullscreen(doc, view)).toBe('exited'); expect(doc.exitFullscreen).toHaveBeenCalledTimes(1); expect(doc.fullscreenElement).toBeNull();
    expect(await toggleHeatmapFullscreen(doc, null)).toBe('unavailable');
  });
});
