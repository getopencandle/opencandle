import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Bar, BarDataset } from '../../src/domain/types';
import { breadthFlow, extremes, outperformance, windowCutoff, windowReturn } from '../../src/market-views/breadth-extended';
import { filterHotSets, hotFilterOptions, hotlist, sortHotRows } from '../../src/market-views/hotlists';
import { seasonals } from '../../src/market-views/seasonals';
import { defaultSeasonalOptions, seasonalCsv, seasonalTermsLabel, seasonalHover, seasonalRange, seasonalYears, yearFilter } from '../../src/market-views/seasonal-view';
import { resampleBars } from '../../src/market-views/rating-interval';
import { technicalRating } from '../../src/market-views/rating';
import { colorScale, macroHoverText, macroMonths, macroRows, macroSourceLine, metricOf, MACRO_COUNTRIES } from '../../src/market-views/macro';
import { curveAt, latestCurveTime, monthsBefore, spreadOf, SPREADS } from '../../src/market-views/yield-curve';
import { FRED_OFF_NOTICE, loadFredSeriesList, valueAt } from '../../src/market-views/fred-views';
import { defaultMarketViews, restoreMarketViews } from '../../src/market-views/state';
import { fredDataset } from '../../src/domain/fred';
import { BreadthPanel, HotTable, MarketViewsDialog, RatingConstituents, SeasonalChart } from '../../src/ui/MarketViewsDialog';
import { MacroPanel, YieldPanel, fredTableCsv } from '../../src/ui/MarketMacroPanels';

const EM_DASH = String.fromCharCode(0x2014);
const DAY = 86400;
const T0 = Date.UTC(2023, 0, 2) / 1000;
const mk = (time: number, close: number, extra: Partial<Bar> = {}): Bar => ({ time, open: close, high: close, low: close, close, volume: 100, ...extra });
const ds = (symbol: string, bars: Bar[], over: { assetClass?: string; exchange?: string; fixture?: boolean; providerId?: string; datasetId?: string } = {}): BarDataset => ({
  instrument: { id: 'T:' + symbol, symbol, name: symbol, exchange: over.exchange ?? 'TEST', currency: 'USD', assetClass: (over.assetClass ?? 'stock') as BarDataset['instrument']['assetClass'], tickSize: 0.01, lotSize: 1, timezone: 'UTC' },
  bars, resolution: '1D',
  provenance: { providerId: over.providerId ?? 'local', providerName: 'x', datasetId: over.datasetId ?? symbol, fixture: over.fixture ?? true, coverage: '', asOf: 0, delaySeconds: null, adjustment: 'raw', session: 'regular', timezone: 'UTC', state: 'ready', license: '', revision: '', notes: [] },
});
const daily = (closes: number[], start = T0) => closes.map((c, i) => mk(start + i * DAY, c));
const noop = () => {};

describe('breadth extended (NET, RATIO, UP/DOWN VOLUME)', () => {
  it('counts net, ratio and volume shares with missing data apart from zero', () => {
    const up = ds('UP', [mk(T0, 10), mk(T0 + DAY, 11, { volume: 300 })]), down = ds('DN', [mk(T0, 10), mk(T0 + DAY, 9, { volume: 100 })]);
    const flat = ds('FL', [mk(T0, 10), mk(T0 + DAY, 10, { volume: 100 })]), novol = ds('NV', [mk(T0, 10), mk(T0 + DAY, 12, { volume: NaN })]), short = ds('SH', [mk(T0, 5)]);
    const r = breadthFlow([up, down, flat, novol, short]);
    expect(r).toMatchObject({ scoped: 5, measured: 4, advancers: 2, decliners: 1, unchanged: 1, net: 1, ratio: 2, volumeKnown: 3, upVolume: 300, downVolume: 200 });
    expect(r.upShare).toBeCloseTo(60); expect(r.downShare).toBeCloseTo(40);
    const none = breadthFlow([up]); expect(none.ratio).toBeNull(); expect(none.ratioNote).toMatch(/No decliners/);
  });
});

describe('new highs and lows over calendar windows (EXTREMES)', () => {
  it('uses calendar cutoffs and counts ties as new highs; net is over all scoped', () => {
    const last = Date.UTC(2024, 2, 31) / 1000;
    expect(windowCutoff(last, '1M')).toBe(Date.UTC(2024, 1, 29) / 1000);
    expect(windowCutoff(last, '1W')).toBe(last - 7 * DAY);
    const closes = Array.from({ length: 30 }, (_, i) => 10 + i);
    const hi = ds('HI', daily(closes)), tie = ds('TIE', daily([...closes.slice(0, 29), 38])), lo = ds('LO', daily(closes.map(c => 100 - c))), young = ds('YNG', daily([1, 2, 3]));
    const r = extremes([hi, tie, lo, young], '1W');
    expect(r).toMatchObject({ scoped: 4, eligible: 3, highs: 2, lows: 1 });
    expect(r.net).toBeCloseTo(25);
    expect(extremes([hi], '1Y').eligible).toBe(0);
  });
});

describe('outperformance (PERFORMANCE)', () => {
  it('needs a chosen benchmark, compares strictly and reports the equal-weight spread', () => {
    const n = 100, bench = ds('BM', daily(Array.from({ length: n }, (_, i) => 100 + i * 0.1)));
    const a = ds('A', daily(Array.from({ length: n }, (_, i) => 100 + i))), b = ds('B', daily(Array.from({ length: n }, () => 100)));
    expect(outperformance([a, b, bench], null, '1M').reason).toMatch(/Pick a benchmark/);
    const r = outperformance([a, b, bench], bench, '1M');
    const ra = windowReturn(a.bars, '1M')!, rb = windowReturn(bench.bars, '1M')!;
    expect(r).toMatchObject({ constituents: 2, eligible: 2, outperform: 1, pct: 50 });
    expect(r.spread).toBeCloseTo((ra + 0) / 2 - rb);
    const three = outperformance([a, ds('S', daily([1, 2, 3])), bench], bench, '3M'); expect(three.eligible).toBe(1);
  });
});

describe('hotlists market, exchange and sort', () => {
  const sets = [ds('AAA', daily([10, 12]), { exchange: 'NYSE' }), ds('BBB', daily([10, 11]), { exchange: 'NASDAQ' }), ds('BTC', daily([10, 15]), { assetClass: 'crypto', exchange: 'CB' })];
  it('filters by asset class and exchange and lists only loaded values', () => {
    expect(hotFilterOptions(sets, 'all')).toEqual({ markets: ['crypto', 'stock'], exchanges: ['CB', 'NASDAQ', 'NYSE'] });
    expect(hotFilterOptions(sets, 'stock').exchanges).toEqual(['NASDAQ', 'NYSE']);
    expect(filterHotSets(sets, 'stock', 'NYSE').map(s => s.instrument.symbol)).toEqual(['AAA']);
  });
  it('sorts rows by a column and markup shows sortable headers', () => {
    const rows = hotlist(sets, 'gainers').rows;
    expect(rows.map(r => r.symbol)).toEqual(['BTC', 'AAA', 'BBB']);
    expect(sortHotRows(rows, 'symbol', 'asc').map(r => r.symbol)).toEqual(['AAA', 'BBB', 'BTC']);
    expect(sortHotRows(rows, 'last', 'asc').map(r => r.symbol)).toEqual(['BBB', 'AAA', 'BTC']);
    const html = renderToStaticMarkup(h(HotTable, { rows, empty: '', sortKey: 'symbol', sortDir: 'asc', onSort: noop }));
    expect(html).toContain('aria-sort="ascending"'); expect(html.indexOf('AAA')).toBeLessThan(html.indexOf('BTC'));
    const dialog = renderToStaticMarkup(h(MarketViewsDialog, { datasets: sets, state: { ...defaultMarketViews(), hotMarket: 'crypto' }, onClose: noop }));
    expect(dialog).toContain('BTC'); expect(dialog).not.toContain('>AAA<'); expect(dialog).toContain('aria-label="Exchange"');
  });
});

const monthly = (years: number[]) => years.flatMap(y => Array.from({ length: 12 }, (_, m) => mk(Date.UTC(y, m, 28) / 1000, 100 + (y - years[0]) * 10 + m * (y % 2 ? 1 : -1))));
describe('seasonal options', () => {
  const set = ds('SEA', monthly([2020, 2021, 2022, 2023]));
  it('year range, exclusions, range band, hover and CSV', () => {
    expect(seasonalYears(set)).toEqual([2020, 2021, 2022, 2023]);
    const only = seasonals(set, yearFilter({ start: 2023, end: 2021, excluded: [2022] }));
    expect(only.years.map(y => y.year)).toEqual([2021, 2023]);
    expect(seasonals(set, yearFilter({ start: 2030, end: 2031, excluded: [] })).note).toMatch(/No loaded year/);
    const g = seasonalRange(only); expect(g.low[5]).toBe(Math.min(only.years[0].points[5]!, only.years[1].points[5]!));
    const o = { ...defaultSeasonalOptions(), normalize: 'index' as const, range: true, hidden: ['2021'] };
    const hv = seasonalHover(only, 5, o);
    expect(hv.month).toBe('Jun'); expect(hv.rows.map(r => r.key)).toEqual(['2023', 'average', 'median', 'low', 'high']);
    expect(hv.rows[0].value).toBeCloseTo(100 + only.years[1].points[5]!);
    const csv = seasonalCsv('SEA', only, o).split('\n');
    expect(csv[1]).toBe('series,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec'); expect(csv.some(l => l.startsWith('Range high,'))).toBe(true);
  });
  it('export saves FRED, live and licensed data with the provider terms line; demo and local data carry none', () => {
    const TERMS = "Market data from x, saved for your personal analysis. The provider's terms apply: do not share or resell this file.";
    expect(seasonalTermsLabel(set)).toBeNull();expect(seasonalTermsLabel(ds('L', [], { fixture: false, providerId: 'local-import', datasetId: 'local:L' }))).toBeNull();
    expect(seasonalTermsLabel(ds('F', [], { fixture: false, providerId: 'fred-public', datasetId: 'fred:fred-public:DGS10:1D' }))).toBe('x');
    expect(seasonalTermsLabel(ds('B', [], { fixture: false, providerId: 'coinbase-public', datasetId: 'live:coinbase-public:BTC-USD:1D' }))).toBe('x');
    expect(seasonalTermsLabel(ds('S', [], { fixture: false, providerId: 'alpaca-sip-delayed', datasetId: 'alpaca-sip-delayed:SPY:1D' }))).toBe('x');
    const r = seasonals(set, yearFilter({ start: null, end: null, excluded: [] })), o = defaultSeasonalOptions();
    const plain = seasonalCsv('SEA', r, o).split('\n'), terms = seasonalCsv('SEA', r, o, 'x').split('\n');
    expect(plain[1]).toMatch(/^series,/);expect(terms[1]).toBe('# ' + TERMS);expect(terms.slice(2)).toEqual(plain.slice(1));
  });
  it('chart markup shows controls, legend toggles and the hover readout', () => {
    const html = renderToStaticMarkup(h(SeasonalChart, { set, options: { range: true, hidden: ['median'] }, onOptions: noop, onExport: noop, hoverMonth: 2 }));
    for (const s of ['aria-label="Start year"', 'aria-label="End year"', 'aria-label="Normalize"', 'Show range', 'Export CSV', 'aria-pressed="false"', '<b>Mar</b>']) expect(html).toContain(s);
    expect(html).not.toContain(EM_DASH);
  });
});

describe('rating interval and constituents', () => {
  it('groups daily bars into weeks and months and refuses finer targets', () => {
    const bars = daily(Array.from({ length: 70 }, (_, i) => 10 + i)).map((b, i) => ({ ...b, high: b.close + 1, low: b.close - 1, volume: i }));
    const w = resampleBars(bars, '1W');
    expect(w.reason).toBeNull(); expect(w.bars.length).toBe(10);
    expect(w.bars[1]).toMatchObject({ open: 17, close: 23, high: 24, low: 16, volume: 7 + 8 + 9 + 10 + 11 + 12 + 13 });
    expect(resampleBars(bars, '1M').bars.length).toBe(3);
    expect(resampleBars(w.bars, '1W').reason).toMatch(/already weekly/);
    const html = renderToStaticMarkup(h(RatingConstituents, { rating: technicalRating(bars) }));
    expect(html).toContain('RSI 14'); expect(html).toContain('Moving average');
    const dialog = renderToStaticMarkup(h(MarketViewsDialog, { datasets: [ds('R', bars)], state: { ...defaultMarketViews(), tab: 'rating', ratingInterval: '1W' }, onClose: noop }));
    expect(dialog).toContain('Weekly, grouped'); expect(dialog).toContain('Needs at least 30');
  });
});

const fredBars = (start: number, values: number[], step = DAY) => values.map((v, i) => mk(start + i * step, v, { volume: 0 }));
describe('yield curves', () => {
  const series = new Map([['DGS3MO', fredBars(T0, [5, 5.1, 5.2])], ['DGS2', fredBars(T0, [4.5, 4.6, 4.7])], ['DGS10', fredBars(T0, [4, 4.1])]]);
  it('builds a curve from the last value on or before the date, with spreads', () => {
    expect(latestCurveTime(series, ['3M', '2Y', '10Y'])).toBe(T0 + 2 * DAY);
    const c = curveAt(series, ['3M', '2Y', '10Y', '30Y'], T0 + 2 * DAY);
    expect(c.points.map(p => p.value)).toEqual([5.2, 4.7, 4.1, null]); expect(c.missing).toEqual(['30Y']);
    expect(spreadOf(c, SPREADS[0]).value).toBeCloseTo(-0.6);
    expect(spreadOf(c, SPREADS[2]).reason).toMatch(/30Y/);
    expect(curveAt(series, ['2Y'], T0 + 30 * DAY).points[0].value).toBeNull();
    expect(monthsBefore(Date.UTC(2024, 2, 31) / 1000, 1)).toBe(Date.UTC(2024, 1, 29) / 1000);
    expect(valueAt(series.get('DGS2')!, T0 - DAY, 7)).toBeNull();
  });
  it('panel shows maturities, compare dates, honest country and export states', () => {
    const fred = new Map([...series].map(([id, bars]) => [id, { id, bars, status: 'ready' as const, notice: null, fromWorkspace: false }]));
    const view = { ...defaultMarketViews(), tab: 'yield' as const, yieldMaturities: ['3M', '2Y', '10Y'], yieldCompare: ['2023-01-02'] };
    const html = renderToStaticMarkup(h(YieldPanel, { view, set: noop, fred, busy: null, enabled: true, available: true, onLoad: noop }));
    for (const s of ['Maturities', '1 year earlier', 'Remove 2023-01-02', 'Not available from local sources', '10Y minus 2Y', 'DGS10 to 2023-01-03', 'Export']) expect(html).toContain(s);
    expect(html).not.toContain(EM_DASH);
    const off = renderToStaticMarkup(h(YieldPanel, { view, set: noop, fred: new Map(), busy: null, enabled: false, available: true, onLoad: noop }));
    expect(off).toContain(FRED_OFF_NOTICE);
  });
});

describe('macro maps', () => {
  const metric = metricOf('unemployment');
  const months = (vals: number[]) => vals.map((v, i) => mk(Date.UTC(2024, i, 1) / 1000, v, { volume: 0 }));
  const series = new Map<string, Bar[] | null>([[metric.series('US'), months([4, 4.1, 4.3])], [metric.series('DE'), months([3, 3.2])], [metric.series('JP'), null]]);
  it('rows keep missing apart from zero; period, compare and scale work', () => {
    const rows = macroRows(series, metric, 'latest', '1M');
    const us = rows.find(r => r.code === 'US')!, de = rows.find(r => r.code === 'DE')!, jp = rows.find(r => r.code === 'JP')!, fr = rows.find(r => r.code === 'FR')!;
    expect(us).toMatchObject({ value: 4.3, month: '2024-03' }); expect(us.change).toBeCloseTo(0.2);
    expect(de).toMatchObject({ value: 3.2, month: '2024-02' }); expect(jp.reason).toMatch(/Not available/); expect(fr.reason).toMatch(/Not loaded/);
    expect(macroRows(series, metric, '2024-03', 'none').find(r => r.code === 'DE')!.reason).toMatch(/No value for 2024-03/);
    expect(macroMonths(series)).toEqual(['2024-03', '2024-02', '2024-01']);
    const s = colorScale([1, 2, 3, 4, 5, null], 'linear', false);
    expect(s.bins.length).toBe(5); expect(s.colorOf(null)).toBe('var(--lv-bg-pill)'); expect(s.colorOf(5)).toBe(s.bins[4].color);
    expect(colorScale([-2, 1], 'quantile', true).diverging).toBe(true);
    expect(macroHoverText(us, metric, '1M')).toMatch(/United States: Unemployment rate 4.30% \(2024-03\), \+0.20 pp vs 1 month earlier/);
    expect(macroSourceLine(series, metric)).toContain(`2 of ${MACRO_COUNTRIES.length} countries loaded`);
  });
  it('panel renders the tile map, table, legend, hover readout and FRED source', () => {
    const fred = new Map([...series].map(([id, bars]) => [id, { id, bars: bars ?? [], status: bars ? 'ready' as const : 'missing' as const, notice: null, fromWorkspace: false }]));
    const view = { ...defaultMarketViews(), tab: 'macro' as const, macroCountry: 'DE', macroCompare: '1M' as const };
    const html = renderToStaticMarkup(h(MacroPanel, { view, set: noop, fred, busy: null, enabled: true, available: true, onLoad: noop, hover: 'US' }));
    for (const s of ['aria-label="Dataset"', 'aria-label="Metric"', 'aria-label="Period"', 'aria-label="Compare"', 'aria-label="Color scale"', 'aria-label="Country"', 'Tile map of', 'data-code="NZ"', 'Change (pp)', 'United States: Unemployment rate', 'FRED (St. Louis Fed)', 'Not available']) expect(html).toContain(s);
    expect(html).not.toContain(EM_DASH);
  });
  it('Macro maps and Yield curves tables export as CSV with the FRED terms line', () => {
    const csv = fredTableCsv('Unemployment rate by country; source FRED (St. Louis Fed)', ['Country', 'Value', 'Note'], [['United States', 4.1, null], ['=cmd', Number.NaN, 'a "quoted", note']]).split('\n');
    expect(csv).toEqual(['# Unemployment rate by country; source FRED (St. Louis Fed)', "# Market data from FRED (St. Louis Fed), saved for your personal analysis. The provider's terms apply: do not share or resell this file.",
      '"Country","Value","Note"', '"United States",4.1,', `"'=cmd",,"a ""quoted"", note"`, '']);
    const fred = new Map([...series].map(([id, bars]) => [id, { id, bars: bars ?? [], status: bars ? 'ready' as const : 'missing' as const, notice: null, fromWorkspace: false }]));
    const html = renderToStaticMarkup(h(MacroPanel, { view: { ...defaultMarketViews(), tab: 'macro' as const }, set: noop, fred, busy: null, enabled: true, available: true, onLoad: noop, onExport: noop }));
    expect(html).toContain('Export CSV');expect(html).not.toMatch(/can.t be exported/);
  });
});

describe('FRED loads and state', () => {
  it('uses open workspace series, makes no request when off and loads one series at a time', async () => {
    const calls: string[] = [];
    const bridge = { fetchFredSeries: async ({ series }: { series: string }) => { calls.push(series); if (series === 'BAD') throw Object.assign(new Error('x'), { code: 'FRED_NOT_FOUND' }); return { schemaVersion: 1 as const, series, rows: [[T0, 1]] as Array<[number, number]>, fetchedAt: 0, cached: false, stale: false }; } };
    const open = fredDataset('DGS10', fredBars(T0, [4]));
    const off = await loadFredSeriesList(bridge, false, ['DGS10', 'DGS2'], [open]);
    expect(calls).toEqual([]); expect(off.get('DGS10')!.fromWorkspace).toBe(true); expect(off.get('DGS2')!.notice).toBe(FRED_OFF_NOTICE);
    const on = await loadFredSeriesList(bridge, true, ['DGS10', 'DGS2', 'BAD', 'DGS2'], [open]);
    expect(calls).toEqual(['DGS2', 'BAD']); expect(on.get('DGS2')!.bars.length).toBe(1); expect(on.get('BAD')!.status).toBe('missing'); expect(on.get('BAD')!.notice).toMatch(/no series named BAD/);
  });
  it('restores new view fields and keeps the saved default unchanged', () => {
    expect(restoreMarketViews(defaultMarketViews())).toEqual(defaultMarketViews());
    const r = restoreMarketViews({ tab: 'yield', hotSort: 'volume', hotDir: 'asc', seasonExcluded: [2020, 'x', 2020], seasonNormalize: 'index', ratingInterval: '1M', yieldCompare: ['2024-01-01', 'bad'], macroPeriod: '2024-03', macroCompare: 'nope' });
    expect(r).toMatchObject({ tab: 'yield', hotSort: 'volume', hotDir: 'asc', seasonExcluded: [2020], seasonNormalize: 'index', ratingInterval: '1M', yieldCompare: ['2024-01-01'], macroPeriod: '2024-03' });
    expect(r.macroCompare).toBeUndefined();
  });
  it('the dialog lists the new tabs and the breadth panel shows the new sections', () => {
    const sets = [ds('AAA', daily(Array.from({ length: 40 }, (_, i) => 10 + i))), ds('BBB', daily(Array.from({ length: 40 }, (_, i) => 80 - i)))];
    const html = renderToStaticMarkup(h(MarketViewsDialog, { datasets: sets, state: { ...defaultMarketViews(), tab: 'macro' }, onClose: noop }));
    expect(html).toContain('Macro maps'); expect(html).toContain('Yield curves'); expect(html).toContain('FRED data needs the desktop app.');
    const b = renderToStaticMarkup(h(BreadthPanel, { sets, benchmarkId: 'T:AAA', onBenchmark: noop }));
    for (const s of ['Net advancers', 'Advance/decline ratio', 'Up volume', 'Down volume', 'New highs and lows', '1W', '1M', '3M', '1Y', 'Equal-weight spread', 'aria-label="Benchmark"']) expect(b).toContain(s);
    expect(b).not.toContain(EM_DASH);
  });
});
