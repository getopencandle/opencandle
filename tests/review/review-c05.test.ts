import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Independent review of the screener (filters, columns, watchlist integration).
// Expected rows are derived by hand from the closes below; nothing is copied from the builder's tests.
// Model tests call the real domain functions. Dialog tests drive the real ScreenerDialog handlers through
// controlled React hooks (not DOM, focus, paint, App wiring or packaged-executable evidence).
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, cleanups: [] as (() => void)[] }));
const ctl = vi.hoisted(() => ({ addError: null as unknown, flagError: null as unknown }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  return {
    ...actual,
    useState: (initial: any) => { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = typeof initial === 'function' ? initial() : initial; return [hooks.cells[i], (next: any) => { hooks.cells[i] = typeof next === 'function' ? next(hooks.cells[i]) : next; }]; },
    useRef: (initial: any) => { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = { current: initial }; return hooks.cells[i]; },
    useMemo: (fn: any) => fn(),
    useEffect: (effect: any, deps: any[]) => { const i = hooks.cursor++, old = hooks.cells[i]; if (!old || deps.some((value, index) => !Object.is(value, old.deps[index]))) { old?.cleanup?.(); const cleanup = effect(); hooks.cells[i] = { deps, cleanup }; if (cleanup) hooks.cleanups.push(cleanup); } },
  };
});
// Pass-through wrapper so a test can make the C04 write API throw a chosen error (typed or untyped).
vi.mock('../../src/watchlists/membership', async () => {
  const actual = await vi.importActual<any>('../../src/watchlists/membership');
  return {
    ...actual,
    addWatchMembers: (...args: any[]) => { if (ctl.addError) throw ctl.addError; return actual.addWatchMembers(...args); },
    setWatchFlags: (...args: any[]) => { if (ctl.flagError) throw ctl.flagError; return actual.setWatchFlags(...args); },
  };
});

import { runScreener, parseScreenerFilterValue, type ScreenerColumn, type ScreenerFilter } from '../../src/domain/screener';
import { createScreenerConfiguration, createScreenerSettings, exportScreenerScreens, pinScreenerSources, restoreScreenerSettings, runSavedScreener, saveScreenerScreen, screenerDatasetKey, type ScreenerConfiguration, type ScreenerSettings } from '../../src/domain/screener-state';
import { ScreenerDialog, type ScreenerDialogProps } from '../../src/ui/ScreenerDialog';
import type { BarDataset } from '../../src/domain/types';
import { addWatchList, createWatchBook, deleteWatchList, type WatchBook, type WatchReference } from '../../src/watchlists/model';
import { addWatchMembers, setWatchFlags, watchFlagOf, watchListMembers, watchReferenceForDataset, WatchCapacityError, WatchReferenceError, WatchStaleError } from '../../src/watchlists/membership';

function make(symbol: string, exchange: string, datasetId: string, closes: number[], extra: { fixture?: boolean; currency?: string } = {}): BarDataset {
  return {
    instrument: { id: `${exchange}:${symbol}`, symbol, name: `${symbol} review`, exchange, currency: extra.currency ?? 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' },
    bars: closes.map((close, index) => ({ time: 1700000000 + index * 86400, open: close, high: close + 1, low: close - 0.5, close, volume: 1000 })),
    resolution: '1D',
    provenance: { providerId: datasetId.split(':')[0], providerName: 'Review import', datasetId, fixture: extra.fixture ?? false, coverage: `${closes.length} review rows`, asOf: 1700000000, delaySeconds: null, adjustment: 'raw', session: 'regular', timezone: 'UTC', state: 'ready', license: 'review', revision: 'r1', notes: [] },
  } as BarDataset;
}
// Hand-derived change % = 100 * (last / previous - 1).
const P1 = make('AAA', 'NASDAQ', 'pa:AAA', [100, 110]); // +10, last 110
const P2 = make('AAA', 'NASDAQ', 'pb:AAA', [100, 95]);  // same instrument, other source: -5, last 95
const N = make('AAA', 'NYSE', 'pa:NAAA', [40, 46]);     // same ticker, other exchange: +15, last 46
const L = make('LOW', 'nyse', 'pa:LOW', [10, 13]);      // lowercase exchange identity: +30, last 13
const M = make('MIS', 'NASDAQ', 'pa:MIS', [7]);         // one row: change unavailable, last 7
const Z = make('ZER', 'NASDAQ', 'pa:ZER', [5, 5]);      // 0 change: a real zero, not a missing value
const all = [P1, P2, N, L, M, Z];
const cols: ScreenerColumn[] = [{ id: 'sym', metric: 'symbol' }, { id: 'last', metric: 'last' }, { id: 'pct', metric: 'changePercent' }];
const ids = (rows: { instrumentId: string }[]) => rows.map(row => row.instrumentId);
const f = (operator: ScreenerFilter['operator'], value: ScreenerFilter['value'], columnId = 'pct', id = 'f'): ScreenerFilter => ({ id, columnId, operator, value, active: true });
function conf(patch: Partial<ScreenerConfiguration> = {}, universe: Partial<ScreenerConfiguration['universe']> = {}): ScreenerConfiguration {
  const value = { ...createScreenerConfiguration(), columns: cols, filters: [] as ScreenerFilter[], sort: { columnId: 'sym', direction: 'asc' as const }, ...patch };
  value.universe = { ...value.universe, ...universe };
  return value;
}
const ref = (dataset: BarDataset) => watchReferenceForDataset(dataset);
let counter = 0; const makeId = () => `rv${++counter}`;
const listBook = (references: WatchReference[], book: WatchBook = addWatchList(createWatchBook([]), 'mix', 'Mix')) => references.length ? addWatchMembers(book, 'mix', references, makeId).book : book;

describe('independent expected rows: filters, sorting, parameter edits, empty vs unavailable', () => {
  it('all-loaded universe: two sources of one instrument stay unresolved; missing change is never 0 and never passes', () => {
    const run = runSavedScreener(all, conf({ filters: [f('gt', 0)], sort: { columnId: 'last', direction: 'desc' } }));
    // NASDAQ:AAA has two eligible sources and no pin: unresolved. N +15 (46), L +30 (13) pass; Z 0 fails; M unavailable.
    expect(ids(run.result.rows)).toEqual(['NYSE:AAA', 'nyse:LOW']);
    expect(ids(run.result.unknownRows)).toEqual(['NASDAQ:MIS']);
    expect(run.result.coverage).toMatchObject({ universe: 4, evaluated: 4, matched: 2, excluded: 1, unavailablePredicate: 1 });
    expect(run.universe.coverage).toMatchObject({ unresolved: 1, selected: 4, outsideWatchlist: 0 });
    expect(run.universe.watchlist).toBeNull();
    // Equality to 0, inequality to 0 and "<= 0": the one-row instrument is unavailable in every case.
    for (const [filter, rows] of [[f('eq', 0), ['NASDAQ:ZER']], [f('lte', 0), ['NASDAQ:ZER']], [f('neq', 0), ['NYSE:AAA', 'nyse:LOW']]] as const) {
      const r = runSavedScreener(all, conf({ filters: [filter], sort: { columnId: 'sym', direction: 'asc' } }));
      expect(ids(r.result.rows)).toEqual(rows); expect(ids(r.result.unknownRows)).toEqual(['NASDAQ:MIS']);
    }
  });
  it('pins choose the exact source; the -5% source is excluded rather than replaced by the +10% one', () => {
    const p1 = runSavedScreener(all, conf({ filters: [f('gt', 0)], sort: { columnId: 'last', direction: 'desc' } }, { sourceChoices: { 'NASDAQ:AAA': screenerDatasetKey(P1) } }));
    expect(p1.result.rows.map(row => [row.instrumentId, row.cells.last.value])).toEqual([['NASDAQ:AAA', 110], ['NYSE:AAA', 46], ['nyse:LOW', 13]]);
    const p2 = runSavedScreener(all, conf({ filters: [f('gt', 0)] }, { sourceChoices: { 'NASDAQ:AAA': screenerDatasetKey(P2) } }));
    expect(ids(p2.result.rows).sort()).toEqual(['NYSE:AAA', 'nyse:LOW']); expect(p2.result.coverage.excluded).toBe(2);
  });
  it('sort asc/desc keeps unavailable cells last in both directions', () => {
    const pinned = { sourceChoices: { 'NASDAQ:AAA': screenerDatasetKey(P1) } };
    const asc = runSavedScreener(all, conf({ sort: { columnId: 'pct', direction: 'asc' } }, pinned));
    expect(ids(asc.result.rows)).toEqual(['NASDAQ:ZER', 'NASDAQ:AAA', 'NYSE:AAA', 'nyse:LOW', 'NASDAQ:MIS']);
    const desc = runSavedScreener(all, conf({ sort: { columnId: 'pct', direction: 'desc' } }, pinned));
    expect(ids(desc.result.rows)).toEqual(['nyse:LOW', 'NYSE:AAA', 'NASDAQ:AAA', 'NASDAQ:ZER', 'NASDAQ:MIS']);
    expect(asc.result.rows.find(row => row.instrumentId === 'NASDAQ:AAA')!.cells.pct.value).toBeCloseTo(10, 9);
  });
  it('no matches and unavailable are distinct results', () => {
    const none = runSavedScreener(all, conf({ filters: [f('eq', 'NOPE', 'sym')] }));
    expect(none.result.rows).toEqual([]); expect(none.result.unknownRows).toEqual([]); expect(none.result.coverage.excluded).toBe(4);
    const big = runSavedScreener(all, conf({ filters: [f('gt', 1000)] }));
    expect(big.result.rows).toEqual([]); expect(ids(big.result.unknownRows)).toEqual(['NASDAQ:MIS']);
  });
  it('parameter edits on the filtered instance re-evaluate the filter (performance length)', () => {
    // closes 80,100,50,120: perf(1)=+140%, perf(2)=+20%, perf(3)=+50%, perf(4)=unavailable.
    const S = make('PRF', 'NASDAQ', 'pa:PRF', [80, 100, 50, 120]);
    const expectations: Array<[number, 'row' | 'excluded' | 'unknown', number | null]> = [[1, 'row', 140], [2, 'excluded', 20], [3, 'row', 50], [4, 'unknown', null]];
    for (const [length, where, value] of expectations) {
      const run = runSavedScreener([S], conf({ columns: [...cols, { id: 'perf', metric: 'performance', parameters: { length } }], filters: [f('gt', 30, 'perf')] }));
      const row = [...run.result.rows, ...run.result.unknownRows][0];
      expect(where === 'row' ? run.result.rows.length : where === 'unknown' ? run.result.unknownRows.length : run.result.coverage.excluded).toBe(1);
      if (value === null) expect(row.cells.perf.value).toBeNull(); else if (row) expect(row.cells.perf.value).toBeCloseTo(value, 9);
    }
    // Window high over the last 2 rows: highs are close+1 -> max(51, 121) = 121.
    const high = runScreener([S], [{ id: 'hi', metric: 'periodHigh', parameters: { length: 2 } }]);
    expect(high.rows[0].cells.hi.value).toBe(121);
  });
});

describe('watchlist universe', () => {
  const mix = () => listBook([ref(P1), ref(N), { symbol: 'ZER', exchange: 'NASDAQ', datasetId: null, dailyDatasetId: null, synthetic: false }, { symbol: 'LOW', exchange: 'NYSE', datasetId: null, dailyDatasetId: null, synthetic: false }]);
  it('exact-source match: only the bound sources; unbound members reported, not resolved', () => {
    const run = runSavedScreener(all, conf({ sort: { columnId: 'sym', direction: 'asc' } }, { watchlist: { listId: 'mix', name: 'Mix', match: 'source' } }), mix());
    expect(run.result.rows.map(row => [row.instrumentId, row.provenance.datasetId])).toEqual([['NASDAQ:AAA', 'pa:AAA'], ['NYSE:AAA', 'pa:NAAA']]);
    expect(run.universe.watchlist).toMatchObject({ state: 'ready', members: 4, loaded: 2, unbound: 2, notLoaded: 0, outsideScope: 0 });
    // Loaded instrument identities: NASDAQ:AAA, NYSE:AAA, nyse:LOW, NASDAQ:MIS, NASDAQ:ZER = 5; 2 are in the list.
    expect(run.universe.coverage).toMatchObject({ loadedInstruments: 5, outsideWatchlist: 3, unresolved: 0 });
  });
  it('exchange+ticker match: two sources of NASDAQ:AAA are ambiguous; the uppercase NYSE:LOW member never matches the lowercase nyse dataset', () => {
    const run = runSavedScreener(all, conf({ sort: { columnId: 'sym', direction: 'asc' } }, { watchlist: { listId: 'mix', name: 'Mix', match: 'market' } }), mix());
    expect(ids(run.result.rows)).toEqual(['NYSE:AAA', 'NASDAQ:ZER']);
    expect(run.universe.members.find(member => member.instrumentId === 'NASDAQ:AAA')!.status).toBe('ambiguous');
    expect(run.universe.watchlist!.details.map(detail => [detail.reference.exchange + ':' + detail.reference.symbol, detail.status])).toEqual([['NASDAQ:AAA', 'loaded'], ['NYSE:AAA', 'loaded'], ['NASDAQ:ZER', 'loaded'], ['NYSE:LOW', 'source-not-loaded']]);
  });
  it('deleted list, empty list and disconnected book are distinct; outsideWatchlist is null only when membership is unknown', () => {
    const scope = { watchlist: { listId: 'mix', name: 'Mix', match: 'source' as const } };
    const empty = runSavedScreener(all, conf({}, scope), listBook([]));
    const deleted = runSavedScreener(all, conf({}, scope), deleteWatchList(mix(), 'mix', mix().lists.find(list => list.id !== 'mix')?.id ?? 'flag:red'));
    const disconnected = runSavedScreener(all, conf({}, scope), null);
    expect([empty, deleted, disconnected].map(run => [run.universe.watchlist!.state, run.universe.coverage.outsideWatchlist, run.result.rows.length, run.result.unknownRows.length])).toEqual([['empty', 5, 0, 0], ['missing-list', null, 0, 0], ['not-connected', null, 0, 0]]);
    expect(deleted.universe.watchlist!.name).toBe('Mix');
  });
  it('KNOWN GAP confirmed: exchange+ticker mode drops a saved pin to an unloaded source (not counted unresolved), but the pin survives Save', () => {
    const missingKey = screenerDatasetKey(make('QQQ', 'NASDAQ', 'px:QQQ', [1, 2]));
    const book = listBook([{ symbol: 'QQQ', exchange: 'NASDAQ', datasetId: null, dailyDatasetId: null, synthetic: false }]);
    const allLoaded = runSavedScreener(all, conf({}, { sourceChoices: { 'NASDAQ:QQQ': missingKey } }));
    expect(allLoaded.universe.members.find(member => member.instrumentId === 'NASDAQ:QQQ')!.status).toBe('missing-bound-source');
    const scoped = runSavedScreener(all, conf({}, { sourceChoices: { 'NASDAQ:QQQ': missingKey }, watchlist: { listId: 'mix', name: 'Mix', match: 'market' } }), book);
    expect(scoped.universe.members.find(member => member.instrumentId === 'NASDAQ:QQQ')).toBeUndefined();
    expect(scoped.universe.coverage.unresolved).toBe(0);
    expect(scoped.universe.watchlist).toMatchObject({ notLoaded: 1 }); // still disclosed in the list report
    const pinned = pinScreenerSources(conf({}, { sourceChoices: { 'NASDAQ:QQQ': missingKey }, watchlist: { listId: 'mix', name: 'Mix', match: 'market' } }), all, book);
    expect(pinned.universe.sourceChoices['NASDAQ:QQQ']).toBe(missingKey);
  });
  it('flag column and flagged market universe agree across source statuses without changing the chosen source', () => {
    // Authored test literals only. The fixture:false object exercises supplied-source identity, not actual GME history.
    const synthetic = make('GME', 'NYSE', 'demo:GME', [10, 11], { fixture: true }), supplied = make('GME', 'NYSE', 'imp:GME', [20, 24]);
    const book = setWatchFlags(createWatchBook([]), [ref(synthetic)], 'red');
    const flagCol: ScreenerColumn = { id: 'flag', metric: 'flag' };
    const flagged = runSavedScreener([supplied], conf({ columns: [...cols, flagCol], filters: [f('eq', 'red', 'flag')] }), book);
    expect(ids(flagged.result.rows)).toEqual(['NYSE:GME']);
    const redList = runSavedScreener([supplied], conf({ columns: [...cols, flagCol] }, { watchlist: { listId: 'flag:red', name: 'Red', match: 'market' } }), book);
    expect(ids(redList.result.rows)).toEqual(['NYSE:GME']);
    expect(redList.universe.datasets[0]).toBe(supplied);
    expect(redList.result.rows[0].cells.last.value).toBe(24);
    expect(redList.result.rows[0].cells.pct.value).toBeCloseTo(20, 12);
    expect(redList.result.rows[0].cells.flag.value).toBe('red');
    expect(redList.universe.watchlist!.details[0].status).toBe('loaded');
    expect(book.flags[0].reference.synthetic).toBe(true);
    expect(supplied.provenance.fixture).toBe(false);
  });
});

describe('flag column', () => {
  it('reads by exchange+ticker; unflaggable identities and a missing book are unavailable, never "none"', () => {
    const book = setWatchFlags(createWatchBook([]), [ref(P1)], 'red'), flagCol: ScreenerColumn = { id: 'flag', metric: 'flag' };
    const pin = { sourceChoices: { 'NASDAQ:AAA': screenerDatasetKey(P2) } };
    const run = runSavedScreener(all, conf({ columns: [...cols, flagCol], filters: [f('eq', 'none', 'flag')], sort: { columnId: 'sym', direction: 'asc' } }, pin), book);
    // P2 is the selected source of NASDAQ:AAA, flagged Red through P1's market identity -> excluded.
    expect(ids(run.result.rows)).toEqual(['NYSE:AAA', 'NASDAQ:MIS', 'NASDAQ:ZER']);
    expect(ids(run.result.unknownRows)).toEqual(['nyse:LOW']);
    expect(run.result.unknownRows[0].cells.flag.state).toBe('unavailable');
    const neq = runSavedScreener(all, conf({ columns: [...cols, flagCol], filters: [f('neq', 'red', 'flag')] }, pin), book);
    expect(ids(neq.result.unknownRows)).toEqual(['nyse:LOW']); expect(ids(neq.result.rows)).not.toContain('nyse:LOW');
    const noBook = runSavedScreener(all, conf({ columns: [...cols, flagCol], filters: [f('eq', 'none', 'flag')] }, pin));
    expect(noBook.result.rows).toEqual([]); expect(noBook.result.unknownRows.length).toBe(5);
    expect(parseScreenerFilterValue('flag', 'in', 'RED, None')).toEqual(['red', 'none']);
    expect(() => parseScreenerFilterValue('flag', 'eq', 'magenta')).toThrow();
  });
});

// Literal checkpoint-4519 contract, transcribed from its default schema and independently derived
// source identities. No historical application code is imported. This checks the specified fields,
// serialization and numerical rows; it does not claim a whole-program baseline differential.
const baselineConfiguration: ScreenerConfiguration = {
  columns: [{id:'symbol',metric:'symbol'},{id:'last',metric:'last'},{id:'changePercent',metric:'changePercent'},{id:'volume',metric:'volume'},{id:'rsi',metric:'rsi',parameters:{length:14}}],
  filters: [], sort: {columnId:'symbol',direction:'asc'},
  universe: {resolution:'1D',currency:'USD',assets:['stock','etf'],excludedInstrumentIds:[],sourceChoices:{}},
  filtersHidden:false,view:'table',
};
const baselineSettings: ScreenerSettings = {
  ...structuredClone(baselineConfiguration),schemaVersion:2,name:'Loaded stocks and ETFs',activeScreenId:'local-default-screen',
  screens:[{id:'local-default-screen',name:'Loaded stocks and ETFs',configuration:structuredClone(baselineConfiguration),revision:1,savedAt:0}],
  recentIds:['local-default-screen'],autosave:false,
};
describe('saved-screen compatibility with a literal checkpoint-4519 contract', () => {
  it('default settings, Save with exact sources, export and computed rows match independent literals', () => {
    const datasets = [N, L, M, Z];
    const settings = createScreenerSettings();
    expect(JSON.stringify(settings)).toBe(JSON.stringify(baselineSettings));
    expect(restoreScreenerSettings(JSON.parse(JSON.stringify(baselineSettings)))).toEqual(baselineSettings);
    const draft = { ...settings, filters: [{ id: 'up', columnId: 'changePercent', operator: 'gt' as const, value: 0, active: true }] };
    const savedConfiguration: ScreenerConfiguration = {...structuredClone(baselineConfiguration),filters:[{id:'up',columnId:'changePercent',operator:'gt',value:0,active:true}],universe:{...baselineConfiguration.universe,sourceChoices:{
      'NYSE:AAA':'["NYSE:AAA","NYSE","pa","pa:NAAA","1D","USD","raw","regular","UTC","stock",false,"2 review rows"]',
      'nyse:LOW':'["nyse:LOW","nyse","pa","pa:LOW","1D","USD","raw","regular","UTC","stock",false,"2 review rows"]',
      'NASDAQ:MIS':'["NASDAQ:MIS","NASDAQ","pa","pa:MIS","1D","USD","raw","regular","UTC","stock",false,"1 review rows"]',
      'NASDAQ:ZER':'["NASDAQ:ZER","NASDAQ","pa","pa:ZER","1D","USD","raw","regular","UTC","stock",false,"2 review rows"]',
    }}};
    const expectedSaved: ScreenerSettings={...structuredClone(baselineSettings),...savedConfiguration,screens:[{id:'local-default-screen',name:'Loaded stocks and ETFs',configuration:savedConfiguration,revision:2,savedAt:1700000500}]};
    const laneSaved = saveScreenerScreen(draft, 1700000500, 'new-id', datasets);
    expect(JSON.stringify(laneSaved)).toBe(JSON.stringify(expectedSaved));
    expect(JSON.stringify(laneSaved)).not.toContain('watchlist');
    expect(exportScreenerScreens(laneSaved,'all')).toBe(JSON.stringify({format:'lv-screener-screens',version:1,screens:[{name:'Loaded stocks and ETFs',configuration:savedConfiguration}]}));
    const laneRun = runSavedScreener(datasets,laneSaved);
    expect(laneRun.result.rows.map(row=>[row.instrumentId,row.cells.last.value])).toEqual([['NYSE:AAA',46],['nyse:LOW',13]]);
    expect(laneRun.result.rows[0].cells.changePercent.value).toBeCloseTo(15,12);
    expect(laneRun.result.rows[1].cells.changePercent.value).toBeCloseTo(30,12);
    expect(laneRun.result.unknownRows.map(row=>[row.instrumentId,row.cells.changePercent.value])).toEqual([['NASDAQ:MIS',null]]);
    expect(laneRun.result.coverage).toEqual({universe:4,evaluated:4,matched:2,excluded:1,unavailablePredicate:1,fixtures:0,providerIds:['pa']});
    expect(laneRun.universe.coverage).toEqual({loadedDatasets:4,loadedInstruments:4,inScope:4,selected:4,unresolved:0,explicitlyExcluded:0,outsideAssetOrCurrency:0,outsideWatchlist:0});
  });
  it('the optional scope round-trips while unknown match modes are refused by the current schema', () => {
    const scoped: ScreenerSettings = { ...structuredClone(baselineSettings), universe: { ...baselineConfiguration.universe, watchlist: { listId: 'mix', name: 'Mix', match: 'market' } } };
    const text = JSON.stringify(scoped);
    expect(JSON.stringify(restoreScreenerSettings(JSON.parse(text)))).toBe(text);
    const invalid=JSON.parse(text);invalid.universe.watchlist.match='any-source';
    expect(() => restoreScreenerSettings(invalid)).toThrow(/source or market/);
    // Older binaries reject the added scope according to the historical review. That behavior is
    // recorded in the handoff, not re-executed or asserted against a copied validator here.
  });
});

// ---------------------------------------------------------------- dialog handlers
function text(node: any): string { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function find(node: any, predicate: (node: any) => boolean): any { if (Array.isArray(node)) { for (const child of node) { const match = find(child, predicate); if (match) return match; } } else if (node?.props) { if (predicate(node)) return node; return find(node.props.children, predicate); } return null; }
function setup(extra: Partial<ScreenerDialogProps> = {}) {
  // P2 left out so NASDAQ:AAA resolves; default sort symbol asc, ties by instrument id.
  const props: any = {
    datasets: [P1, N, L, M, Z], settings: createScreenerSettings(), watchBook: listBook([]), onClose: vi.fn(), onSelect: vi.fn(), onNotes: vi.fn(() => true),
    onChange: vi.fn((next: ScreenerSettings) => { props.settings = next; return true; }),
    onWatchBook: vi.fn((next: WatchBook, expected: WatchBook) => { if (props.watchBook !== expected) return false; props.watchBook = next; return true; }), ...extra,
  };
  const render = () => { hooks.cursor = 0; return ScreenerDialog(props); };
  const row = (id: string) => { const node = find(render(), node => node.type === 'tr' && node.key === id); if (!node) throw new Error('Missing row ' + id); return node; };
  const button = (name: string) => { const node = find(render(), node => node.type === 'button' && (text(node) === name || node.props['aria-label'] === name)); if (!node) throw new Error('Missing button ' + name); return node.props; };
  const click = (id: string, mods: { ctrl?: boolean; shift?: boolean } = {}) => row(id).props.onClick({ ctrlKey: !!mods.ctrl, metaKey: false, shiftKey: !!mods.shift, target: null });
  const status = () => text(find(render(), node => node.type === 'output'));
  const alert = () => text(find(render(), node => node.props?.role === 'alert'));
  const panelOpen = () => !!find(render(), node => node.props?.role === 'dialog');
  const toolbar = () => text(find(render(), node => node.props?.['aria-live'] === 'polite'));
  return { props, render, row, button, click, status, alert, panelOpen, toolbar };
}
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.cleanups = []; counter = 0; ctl.addError = null; ctl.flagError = null; });
afterEach(() => hooks.cleanups.forEach(cleanup => cleanup()));

describe('dialog: identities, atomic Add/Flag, stale actions and selection', () => {
  it('a lowercase-exchange row renders (no crash) and is refused by Add with its identity named; nothing published', () => {
    const ui = setup();
    expect(() => ui.render()).not.toThrow();
    expect(find(ui.row('nyse:LOW'), node => node.type === 'button' && /Add note/.test(node.props['aria-label'] ?? ''))).toBeNull();
    expect(find(ui.row('NYSE:AAA'), node => node.type === 'button' && /Add note/.test(node.props['aria-label'] ?? ''))).not.toBeNull();
    ui.click('NYSE:AAA'); ui.click('nyse:LOW', { ctrl: true });
    ui.button('Add selected to watchlist').onClick();
    expect(ui.alert()).toContain('nyse:LOW'); expect(ui.alert()).toMatch(/Nothing was changed/);
    expect(ui.panelOpen()).toBe(false); expect(ui.props.onWatchBook).not.toHaveBeenCalled();
  });
  it('FINDING: right-click on a row whose identity notes reject opens no row-actions group, so Add/Flag are not offered there', () => {
    const ui = setup();
    ui.row('nyse:LOW').props.onContextMenu({ preventDefault() {} });
    expect(find(ui.render(), node => node.props?.['aria-label'] === 'Screener row actions')).toBeNull();
    ui.row('NYSE:AAA').props.onContextMenu({ preventDefault() {} });
    expect(find(ui.render(), node => node.props?.['aria-label'] === 'Screener row actions')).not.toBeNull();
  });
  const pick = (ui: ReturnType<typeof setup>) => { ui.click('NASDAQ:AAA'); ui.click('NYSE:AAA', { ctrl: true }); };
  it('WatchCapacityError keeps the book, the selection and the open panel', () => {
    const ui = setup(); pick(ui); ui.button('Add selected to watchlist').onClick();
    const before = ui.props.watchBook; ctl.addError = new WatchCapacityError('"Mix" would hold 5001 rows; one list holds at most 5,000. Nothing was added.');
    ui.button('Add selected to Mix').onClick();
    expect(ui.props.onWatchBook).not.toHaveBeenCalled(); expect(ui.props.watchBook).toBe(before);
    expect(ui.panelOpen()).toBe(true); expect(ui.toolbar()).toMatch(/^2 of 5/); expect(ui.alert()).toContain('5,000');
  });
  it('WatchStaleError from the API closes the panel and publishes nothing', () => {
    const ui = setup(); pick(ui); ui.button('Add selected to watchlist').onClick();
    ctl.addError = new WatchStaleError('This watchlist changed after it was chosen.');
    ui.button('Add selected to Mix').onClick();
    expect(ui.props.onWatchBook).not.toHaveBeenCalled(); expect(ui.panelOpen()).toBe(false); expect(ui.alert()).toMatch(/Nothing was changed/);
  });
  it('WatchReferenceError from setWatchFlags publishes nothing', () => {
    const ui = setup(); pick(ui); ui.button('Flag selected').onClick();
    ctl.flagError = new WatchReferenceError('Bad reference. Nothing was changed.');
    ui.button('Flag Red').onClick();
    expect(ui.props.onWatchBook).not.toHaveBeenCalled(); expect(ui.props.watchBook.flags).toEqual([]); expect(ui.alert()).toContain('Bad reference');
  });
  it('an untyped error in the create-list path and a throwing host both publish nothing', () => {
    const ui = setup(); pick(ui); ui.button('Add selected to watchlist').onClick();
    const before = ui.props.watchBook; ctl.addError = new TypeError('boom');
    find(ui.render(), node => node.props?.['aria-label'] === 'New watchlist name').props.onChange({ target: { value: 'Fresh' } });
    ui.button('Create list with selected').onClick();
    expect(ui.props.onWatchBook).not.toHaveBeenCalled(); expect(ui.props.watchBook).toBe(before); expect(ui.alert()).toBe('boom Nothing was changed.');
    ctl.addError = null; ui.props.onWatchBook.mockImplementationOnce(() => { throw new Error('host refused'); });
    ui.button('Add selected to Mix').onClick();
    expect(ui.props.watchBook).toBe(before); expect(ui.alert()).toContain('host refused');
  });
  it('a list deleted between opening the panel and clicking its (stale) button is refused', () => {
    const extra = addWatchList(listBook([]), 'other', 'Other');
    const ui = setup({ watchBook: extra }); pick(ui); ui.button('Add selected to watchlist').onClick();
    const staleClick = ui.button('Add selected to Mix').onClick;
    const before = ui.props.watchBook, deleted = deleteWatchList(before, 'mix', 'other');
    ui.props.watchBook = deleted;
    // Without a re-render the dialog still computes from the book it last rendered; the host guard (expected !== current) refuses it.
    staleClick();
    expect(ui.props.onWatchBook).toHaveBeenCalledOnce(); expect(ui.props.onWatchBook.mock.calls[0][1]).toBe(before); expect(ui.props.watchBook).toBe(deleted);
    expect(ui.alert()).toContain('rejected');
    // After the re-render that a prop change causes, the same stale button is refused by the dialog itself.
    ui.render(); ui.props.onWatchBook.mockClear(); staleClick();
    expect(ui.props.onWatchBook).not.toHaveBeenCalled(); expect(ui.props.watchBook).toBe(deleted); expect(ui.panelOpen()).toBe(false); expect(ui.alert()).toMatch(/deleted or replaced/);
  });
  it('re-sorting while the panel is open still acts on the captured rows, in the order shown when it opened', () => {
    const ui = setup(); ui.click('NASDAQ:ZER'); ui.click('NASDAQ:AAA', { ctrl: true });
    ui.button('Add selected to watchlist').onClick();
    ui.props.settings = { ...ui.props.settings, sort: { columnId: 'symbol', direction: 'desc' } };
    ui.button('Add selected to Mix').onClick();
    expect(watchListMembers(ui.props.watchBook, 'mix')).toEqual([ref(P1), ref(Z)]); // symbol asc order at open: AAA, ZER
  });
  it('a filter that hides a selected row while the panel is open refuses the batch; before opening, hidden rows leave the selection', () => {
    const ui = setup(); ui.click('NASDAQ:AAA'); ui.click('NASDAQ:ZER', { ctrl: true }); ui.click('NYSE:AAA', { ctrl: true });
    ui.button('Add selected to watchlist').onClick();
    const positive = { ...ui.props.settings, filters: [{ id: 'up', columnId: 'changePercent', operator: 'gt', value: 0, active: true }] };
    ui.props.settings = positive; // ZER (0%) is now excluded
    ui.button('Add selected to Mix').onClick();
    expect(ui.props.onWatchBook).not.toHaveBeenCalled(); expect(ui.alert()).toContain('no longer in the current results'); expect(ui.panelOpen()).toBe(false);
    // Rows now: NASDAQ:AAA, NYSE:AAA, nyse:LOW (MIS is unavailable, ZER excluded). Selection count discloses 2.
    expect(ui.toolbar()).toMatch(/^2 of 3 matching rows selected/);
    ui.button('Add selected to watchlist').onClick(); ui.button('Add selected to Mix').onClick();
    expect(watchListMembers(ui.props.watchBook, 'mix')).toEqual([ref(P1), ref(N)]);
  });
  it('Flag selected flags both markets in one publication; removing the flag keeps custom-list membership', () => {
    const ui = setup({ watchBook: listBook([]) }); pick(ui);
    ui.button('Add selected to watchlist').onClick(); ui.button('Add selected to Mix').onClick();
    ui.button('Flag selected').onClick(); ui.button('Flag Red').onClick();
    expect(ui.props.onWatchBook).toHaveBeenCalledTimes(2);
    expect([watchFlagOf(ui.props.watchBook, ref(P1)), watchFlagOf(ui.props.watchBook, ref(N))]).toEqual(['red', 'red']);
    ui.button('Flag selected').onClick(); ui.button('Remove flag').onClick();
    expect(ui.props.watchBook.flags).toEqual([]); expect(watchListMembers(ui.props.watchBook, 'mix')).toEqual([ref(P1), ref(N)]);
  });
  it('choosing a flagged list scopes by exchange+ticker; a deleted custom scope stays labelled unavailable', () => {
    const book = setWatchFlags(listBook([ref(Z)]), [ref(N)], 'red');
    const ui = setup({ watchBook: book });
    find(ui.render(), node => node.props?.['aria-label'] === 'Screener watchlist universe').props.onChange({ target: { value: 'flag:red' } });
    expect(ui.props.settings.universe.watchlist).toEqual({ listId: 'flag:red', name: expect.any(String), match: 'market' });
    expect(find(ui.render(), node => node.type === 'tr' && node.key === 'NYSE:AAA')).not.toBeNull();
    expect(find(ui.render(), node => node.type === 'tr' && node.key === 'NASDAQ:ZER')).toBeNull();
    find(ui.render(), node => node.props?.['aria-label'] === 'Screener watchlist universe').props.onChange({ target: { value: 'mix' } });
    expect(ui.props.settings.universe.watchlist.match).toBe('source');
    ui.props.watchBook = deleteWatchList(ui.props.watchBook, 'mix', 'flag:red');
    const select = find(ui.render(), node => node.props?.['aria-label'] === 'Screener watchlist universe');
    expect(text(select)).toContain('Mix (unavailable)');
    expect(text(ui.render())).toContain('Watchlist membership is unavailable');
  });
});
