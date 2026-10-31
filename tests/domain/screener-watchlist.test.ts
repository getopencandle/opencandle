import { describe, expect, it } from 'vitest';
import { parseScreenerFilterValue, runScreener, type ScreenerColumn, type ScreenerFilter } from '../../src/domain/screener';
import { createScreenerConfiguration, createScreenerSettings, exportScreenerScreens, importScreenerScreens, previewScreenerImport, restoreScreenerSettings, runSavedScreener, saveScreenerScreen, screenerDatasetKey, type ScreenerConfiguration } from '../../src/domain/screener-state';
import type { BarDataset } from '../../src/domain/types';
import { addWatchList, createWatchBook, type WatchBook, type WatchReference } from '../../src/watchlists/model';
import { addWatchMembers, setWatchFlags, watchReferenceForDataset } from '../../src/watchlists/membership';

// Model-level evidence only. Expected rows below are derived by hand from the closes in each dataset.
function make(symbol: string, exchange: string, datasetId: string, closes: number[], extra: { currency?: string; assetClass?: 'stock' | 'etf' } = {}): BarDataset {
  return {
    instrument: { id: `${exchange}:${symbol}`, symbol, name: `${symbol} test`, exchange, currency: extra.currency ?? 'USD', assetClass: extra.assetClass ?? 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' },
    bars: closes.map((close, index) => ({ time: 1700000000 + index * 86400, open: close, high: close + 1, low: close - 0.5, close, volume: 1000 })),
    resolution: '1D',
    provenance: { providerId: datasetId.split(':')[0], providerName: 'Test import', datasetId, fixture: false, coverage: `${closes.length} test rows`, asOf: 1700000000, delaySeconds: null, adjustment: 'raw', session: 'regular', timezone: 'UTC', state: 'ready', license: 'test', revision: 'r1', notes: [] },
  };
}
// Hand-derived: last close and change % from the previous close.
const A1 = make('AAA', 'NASDAQ', 'prov-a:AAA', [10, 12]);       // last 12, +20%
const A2 = make('AAA', 'NASDAQ', 'prov-b:AAA', [10, 9]);        // same instrument, other source: last 9, -10%
const B = make('AAA', 'NYSE', 'prov-a:NYSE-AAA', [50, 55]);     // same ticker, other exchange: last 55, +10%
const C = make('CCC', 'NASDAQ', 'prov-a:CCC', [20, 18]);        // last 18, -10%
const D = make('DDD', 'NASDAQ', 'prov-a:DDD', [5, 6], { currency: 'EUR', assetClass: 'etf' }); // outside USD scope
const E = make('EEE', 'NASDAQ', 'prov-a:EEE', [30]);            // one row: change % insufficient history
const F = make('FFF', 'NASDAQ', 'prov-a:FFF', [1, 2]);          // +100%, never in the list
const loaded = [A1, A2, B, C, D, E, F];
const unbound: WatchReference = { symbol: 'ZZZ', exchange: 'NASDAQ', datasetId: null, dailyDatasetId: null, synthetic: false };
const unloaded: WatchReference = { symbol: 'QQQ', exchange: 'NASDAQ', datasetId: 'prov-x:QQQ', dailyDatasetId: null, synthetic: false };
let next = 0; const id = () => `row-${++next}`;
function book(references: WatchReference[] = [A1, B, C, D, E].map(watchReferenceForDataset).concat([unbound, unloaded])): WatchBook {
  return addWatchMembers(addWatchList(createWatchBook([]), 'tech', 'Tech'), 'tech', references, id).book;
}
const columns: ScreenerColumn[] = [{ id: 'symbol', metric: 'symbol' }, { id: 'last', metric: 'last' }, { id: 'pct', metric: 'changePercent' }];
const positive: ScreenerFilter = { id: 'up', columnId: 'pct', operator: 'gt', value: 0, active: true };
function configuration(patch: Partial<ScreenerConfiguration> = {}, match: 'source' | 'market' = 'source', listId = 'tech'): ScreenerConfiguration {
  const value = { ...createScreenerConfiguration(), columns, filters: [positive], sort: { columnId: 'pct', direction: 'desc' as const }, ...patch };
  value.universe = { ...value.universe, watchlist: { listId, name: 'Tech', match } };
  return value;
}
const ids = (rows: { instrumentId: string }[]) => rows.map(row => row.instrumentId);

describe('screener universe = watchlist (source-aware membership)', () => {
  it('screens only exact bound list sources and reports every member that cannot be evaluated', () => {
    const { universe, result } = runSavedScreener(loaded, configuration(), book());
    expect(result.diagnostics).toEqual([]);
    // A1 (+20) and B (+10) pass; C (-10) is false; E is unavailable; F is outside the list; A2 is a different source.
    expect(result.rows.map(row => [row.instrumentId, row.cells.last.value, row.provenance.datasetId])).toEqual([['NASDAQ:AAA', 12, 'prov-a:AAA'], ['NYSE:AAA', 55, 'prov-a:NYSE-AAA']]);
    expect(ids(result.unknownRows)).toEqual(['NASDAQ:EEE']);
    expect(result.coverage).toMatchObject({ universe: 4, matched: 2, excluded: 1, unavailablePredicate: 1 });
    expect(universe.watchlist).toMatchObject({ state: 'ready', name: 'Tech', members: 7, loaded: 4, unbound: 1, notLoaded: 1, outsideScope: 1 });
    expect(universe.watchlist!.details.map(member => [member.reference.symbol, member.status])).toEqual([['AAA', 'loaded'], ['AAA', 'loaded'], ['CCC', 'loaded'], ['DDD', 'outside-scope'], ['EEE', 'loaded'], ['ZZZ', 'unbound'], ['QQQ', 'source-not-loaded']]);
    expect(universe.coverage).toMatchObject({ loadedInstruments: 6, outsideWatchlist: 1, outsideAssetOrCurrency: 1, selected: 4, unresolved: 0 });
  });
  it('market match keeps two sources of one market ambiguous instead of choosing one, until a source is pinned', () => {
    const market = runSavedScreener(loaded, configuration({}, 'market'), book());
    expect(ids(market.result.rows)).toEqual(['NYSE:AAA']);
    expect(market.universe.members.find(member => member.instrumentId === 'NASDAQ:AAA')!.status).toBe('ambiguous');
    expect(market.universe.watchlist!.details.find(member => member.reference.symbol === 'ZZZ')!.status).toBe('source-not-loaded');
    const pinned = configuration({}, 'market'); pinned.universe.sourceChoices = { 'NASDAQ:AAA': screenerDatasetKey(A2) };
    const chosen = runSavedScreener(loaded, pinned, book());
    expect(ids(chosen.result.rows)).toEqual(['NYSE:AAA']); // A2 is -10%, so it is excluded, not substituted by A1.
    expect(chosen.result.coverage.excluded).toBe(2);
    expect(chosen.universe.datasets.find(dataset => dataset.instrument.id === 'NASDAQ:AAA')!.provenance.datasetId).toBe('prov-b:AAA');
  });
  it('keeps an empty list, a deleted list and a disconnected book distinct, and none fabricates rows', () => {
    const empty = runSavedScreener(loaded, configuration(), book([]));
    expect(empty.universe.watchlist).toMatchObject({ state: 'empty', members: 0 });
    const missing = runSavedScreener(loaded, configuration({}, 'source', 'deleted-list'), book());
    expect(missing.universe.watchlist).toMatchObject({ state: 'missing-list' }); expect(missing.universe.watchlist!.reason).toContain('no longer exists');
    const disconnected = runSavedScreener(loaded, configuration(), undefined);
    expect(disconnected.universe.watchlist).toMatchObject({ state: 'not-connected' });
    for (const run of [empty, missing, disconnected]) { expect(run.result.rows).toEqual([]); expect(run.result.unknownRows).toEqual([]); expect(run.universe.datasets).toEqual([]); }
    const onlyUnbound = runSavedScreener(loaded, configuration(), book([unbound]));
    expect(onlyUnbound.universe.watchlist).toMatchObject({ state: 'ready', members: 1, loaded: 0, unbound: 1 });
  });
  it('a pin to the listed dataset with changed coverage stays missing, never replaced by the loaded coverage', () => {
    const value = configuration(); value.universe.sourceChoices = { 'NASDAQ:CCC': screenerDatasetKey(make('CCC', 'NASDAQ', 'prov-a:CCC', [1, 2, 3])) };
    const run = runSavedScreener(loaded, value, book());
    expect(run.universe.members.find(member => member.instrumentId === 'NASDAQ:CCC')!.status).toBe('missing-bound-source');
    expect(run.universe.datasets.map(dataset => dataset.instrument.id)).toEqual(['NASDAQ:AAA', 'NYSE:AAA', 'NASDAQ:EEE']);
  });
});

describe('sort, filter and parameter combinations over the list universe', () => {
  it('sorts available values in both directions with unavailable values last', () => {
    const asc = runSavedScreener(loaded, configuration({ filters: [], sort: { columnId: 'pct', direction: 'asc' } }), book());
    expect(ids(asc.result.rows)).toEqual(['NASDAQ:CCC', 'NYSE:AAA', 'NASDAQ:AAA', 'NASDAQ:EEE']);
    const desc = runSavedScreener(loaded, configuration({ filters: [], sort: { columnId: 'pct', direction: 'desc' } }), book());
    expect(ids(desc.result.rows)).toEqual(['NASDAQ:AAA', 'NYSE:AAA', 'NASDAQ:CCC', 'NASDAQ:EEE']);
    const between = runSavedScreener(loaded, configuration({ filters: [{ id: 'range', columnId: 'last', operator: 'between', value: [12, 55] }, { ...positive, active: false }].map(filter => ({ active: true, ...filter })) as ScreenerFilter[], sort: { columnId: 'last', direction: 'asc' } }), book());
    expect(between.result.rows.map(row => row.cells.last.value)).toEqual([12, 18, 30, 55]);
  });
  it('re-evaluates a bound filter when its column parameters change', () => {
    const P = make('PPP', 'NASDAQ', 'prov-a:PPP', [10, 11, 12, 15]); // length 1: 15/12-1 = 25%; length 3: 15/10-1 = 50%
    const columnsFor = (length: number): ScreenerColumn[] => [{ id: 'symbol', metric: 'symbol' }, { id: 'perf', metric: 'performance', parameters: { length } }];
    const over30: ScreenerFilter = { id: 'over30', columnId: 'perf', operator: 'gt', value: 30, active: true };
    const short = runScreener([P], columnsFor(1), [over30]);
    expect(short.rows).toEqual([]); expect(short.coverage.excluded).toBe(1);
    const long = runScreener([P], columnsFor(3), [over30]);
    expect(long.rows[0].cells.perf.value).toBeCloseTo(50, 12);
    const tooLong = runScreener([P], columnsFor(4), [over30]);
    expect(tooLong.rows).toEqual([]); expect(tooLong.unknownRows[0].cells.perf.state).toBe('insufficient-history');
  });
});

describe('flag column and flag filters', () => {
  const flagColumns: ScreenerColumn[] = [{ id: 'symbol', metric: 'symbol' }, { id: 'flag', metric: 'flag' }];
  const flagged = () => setWatchFlags(book(), [watchReferenceForDataset(B)], 'red');
  it('reads flags by exchange and ticker, so the same ticker on another exchange stays unflagged', () => {
    const red = runSavedScreener(loaded, configuration({ columns: flagColumns, filters: [{ id: 'f', columnId: 'flag', operator: 'eq', value: 'red', active: true }], sort: { columnId: 'symbol', direction: 'asc' } }), flagged());
    expect(ids(red.result.rows)).toEqual(['NYSE:AAA']);
    const none = runSavedScreener(loaded, configuration({ columns: flagColumns, filters: [{ id: 'f', columnId: 'flag', operator: 'eq', value: 'none', active: true }], sort: { columnId: 'symbol', direction: 'asc' } }), flagged());
    expect(ids(none.result.rows)).toEqual(['NASDAQ:AAA', 'NASDAQ:CCC', 'NASDAQ:EEE']);
  });
  it('without a connected book flag cells are unavailable, never "none"', () => {
    const value = { ...createScreenerConfiguration(), columns: flagColumns, filters: [{ id: 'f', columnId: 'flag', operator: 'eq' as const, value: 'none', active: true }], sort: { columnId: 'symbol', direction: 'asc' as const } };
    const run = runSavedScreener([C, F], value);
    expect(run.result.rows).toEqual([]); expect(ids(run.result.unknownRows)).toEqual(['NASDAQ:CCC', 'NASDAQ:FFF']);
    expect(run.result.unknownRows[0].cells.flag).toMatchObject({ state: 'unavailable', value: null });
    // Invalid OHLCV does not invalidate a bar-free flag cell.
    const broken = structuredClone(C); broken.bars[1].low = 99;
    expect(runScreener([broken], flagColumns, [], undefined, { flagOf: () => 'green' }).rows[0].cells.flag).toMatchObject({ state: 'available', value: 'green' });
  });
  it('validates flag filter values and normalizes typed case', () => {
    expect(parseScreenerFilterValue('flag', 'eq', 'Red')).toBe('red');
    expect(parseScreenerFilterValue('flag', 'in', 'red, None')).toEqual(['red', 'none']);
    expect(() => parseScreenerFilterValue('flag', 'eq', 'magenta')).toThrow('flag values');
    expect(() => parseScreenerFilterValue('flag', 'gt', '1')).toThrow();
  });
});

describe('saved screens with a watchlist scope', () => {
  it('round-trips the scope through settings, save pinning and transfer JSON', () => {
    const settings = { ...createScreenerSettings(), ...configuration() };
    const restored = restoreScreenerSettings(JSON.parse(JSON.stringify(settings)));
    expect(restored.universe.watchlist).toEqual({ listId: 'tech', name: 'Tech', match: 'source' });
    const saved = saveScreenerScreen(restored, 1800000000, undefined, loaded, book());
    expect(saved.screens[0].configuration.universe.watchlist).toEqual({ listId: 'tech', name: 'Tech', match: 'source' });
    expect(JSON.parse(saved.screens[0].configuration.universe.sourceChoices['NASDAQ:AAA'])[3]).toBe('prov-a:AAA');
    const transfer = previewScreenerImport(exportScreenerScreens(saved, 'current'));
    const imported = importScreenerScreens(createScreenerSettings(), transfer, 1800000001, () => 'imported');
    expect(imported.screens[1].configuration.universe.watchlist).toEqual({ listId: 'tech', name: 'Tech', match: 'source' });
    expect(ids(runSavedScreener(loaded, imported.screens[1].configuration, book()).result.rows)).toEqual(['NASDAQ:AAA', 'NYSE:AAA']);
  });
  it('restores screens saved before the scope existed, unchanged and still evaluated over every loaded source', () => {
    const old = createScreenerSettings(); expect(Object.hasOwn(old.universe, 'watchlist')).toBe(false);
    const text = JSON.stringify(old), restored = restoreScreenerSettings(JSON.parse(text));
    expect(JSON.stringify(restored)).toBe(text);
    const legacy = restoreScreenerSettings({ columns, filters: [positive], sort: { columnId: 'pct', direction: 'desc' } });
    expect(Object.hasOwn(legacy.universe, 'watchlist')).toBe(false);
    // All loaded USD stocks/ETFs: NASDAQ:AAA is ambiguous (two sources); passing: NYSE:AAA +10, FFF +100.
    expect(ids(runSavedScreener(loaded, legacy, book()).result.rows)).toEqual(['NASDAQ:FFF', 'NYSE:AAA']);
  });
  it('rejects malformed scopes atomically', () => {
    const base = createScreenerSettings();
    for (const watchlist of [{ listId: 'tech', name: 'Tech', match: 'fuzzy' }, { listId: 'tech', name: 'Tech', match: 'source', extra: 1 }, { listId: '', name: 'Tech', match: 'source' }, { listId: 'tech', name: '', match: 'source' }, null]) {
      expect(() => restoreScreenerSettings({ ...base, universe: { ...base.universe, watchlist } })).toThrow();
    }
  });
});

describe('independent review regressions', () => {
  it('keeps a listed pin for an instrument with no loaded dataset and drops an unlisted one', () => {
    const G = make('GGG', 'NASDAQ', 'prov-a:GGG', [1, 2]), H = make('HHH', 'NASDAQ', 'prov-a:HHH', [1, 2]); // neither is loaded
    const value = configuration(); value.universe.sourceChoices = { 'NASDAQ:GGG': screenerDatasetKey(G), 'NASDAQ:HHH': screenerDatasetKey(H) };
    const run = runSavedScreener(loaded, value, book([A1, G].map(watchReferenceForDataset)));
    expect(run.universe.members.map(member => [member.instrumentId, member.status])).toEqual([['NASDAQ:AAA', 'selected'], ['NASDAQ:GGG', 'missing-bound-source']]);
    expect(run.universe.coverage.unresolved).toBe(1);
  });
  it('under exact-source scope the list binding wins over an earlier all-loaded pin, and says so', () => {
    const value = configuration({ filters: [] }); value.universe.sourceChoices = { 'NASDAQ:AAA': screenerDatasetKey(A2) };
    const run = runSavedScreener(loaded, value, book());
    const member = run.universe.members.find(item => item.instrumentId === 'NASDAQ:AAA')!;
    expect(member.status).toBe('selected'); expect(member.selected!.provenance.datasetId).toBe('prov-a:AAA'); expect(member.reason).toContain('not the source this list binds');
    expect(run.result.rows.find(row => row.instrumentId === 'NASDAQ:AAA')!.cells.last.value).toBe(12);
  });
  it('reports no outside-list count when membership is unknown', () => {
    expect(runSavedScreener(loaded, configuration(), undefined).universe.coverage.outsideWatchlist).toBeNull();
    expect(runSavedScreener(loaded, configuration({}, 'source', 'gone'), book()).universe.coverage.outsideWatchlist).toBeNull();
    expect(runSavedScreener(loaded, configuration(), book([])).universe.coverage.outsideWatchlist).toBe(6);
    expect(runSavedScreener(loaded, createScreenerConfiguration(), book()).universe.coverage.outsideWatchlist).toBe(0);
  });
  it('counts members loaded only at another resolution as outside scope, consistent with the resolver', () => {
    const value = configuration(); value.universe.resolution = '1H';
    const run = runSavedScreener(loaded, value, book());
    expect(run.universe.watchlist).toMatchObject({ loaded: 0, outsideScope: 5, unbound: 1, notLoaded: 1 });
    expect(run.result.rows).toEqual([]);
  });
  it('an identifier that can never be flagged has an unavailable flag, not "none"', () => {
    const odd = make('AAA', 'Nasdaq', 'prov-a:odd', [1, 2]);
    const value = { ...createScreenerConfiguration(), columns: [{ id: 'symbol', metric: 'symbol' }, { id: 'flag', metric: 'flag' }], filters: [], sort: { columnId: 'symbol', direction: 'asc' as const } };
    const cells = runSavedScreener([odd, C], value, book()).result.rows.map(row => [row.instrumentId, row.cells.flag.state, row.cells.flag.value]);
    expect(cells).toEqual([['Nasdaq:AAA', 'unavailable', null], ['NASDAQ:CCC', 'available', 'none']]);
  });
});

describe('independent re-check regressions', () => {
  it('saving under a list scope keeps the pin the list overrode, so leaving the scope restores it', () => {
    const value = { ...createScreenerSettings(), ...configuration({ filters: [] }) }; value.universe.sourceChoices = { 'NASDAQ:AAA': screenerDatasetKey(A2) };
    const saved = saveScreenerScreen(value, 1800000000, undefined, loaded, book());
    expect(saved.universe.sourceChoices['NASDAQ:AAA']).toBe(screenerDatasetKey(A2));
    expect(JSON.parse(saved.universe.sourceChoices['NYSE:AAA'])[3]).toBe('prov-a:NYSE-AAA');
    const unscoped = structuredClone(saved.screens[0].configuration); delete unscoped.universe.watchlist;
    expect(runSavedScreener(loaded, unscoped, book()).universe.datasets.find(dataset => dataset.instrument.id === 'NASDAQ:AAA')!.provenance.datasetId).toBe('prov-b:AAA');
  });
  it('an unflaggable identifier explains why it has no flag', () => {
    const odd = make('AAA', 'Nasdaq', 'prov-a:odd', [1, 2]);
    const value = { ...createScreenerConfiguration(), columns: [{ id: 'flag', metric: 'flag' }], filters: [], sort: { columnId: 'flag', direction: 'asc' as const } };
    expect(runSavedScreener([odd], value, book()).result.rows[0].cells.flag.reason).toBe('Flag state could not be read: this exchange or ticker cannot be a watchlist identifier, so it has no flag.');
  });
});
