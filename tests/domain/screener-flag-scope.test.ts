import { describe, expect, it } from 'vitest';
import {
  createScreenerConfiguration, createScreenerSettings, pinScreenerSources,
  replaceScreenerConfiguration, restoreScreenerSettings, runSavedScreener,
  saveScreenerScreen, screenerDatasetKey,
  type SavedScreenerResult, type ScreenerConfiguration, type ScreenerUniverseSelection,
} from '../../src/domain/screener-state';
import type { BarDataset } from '../../src/domain/types';
import { addWatchList, createWatchBook, type WatchBook, type WatchReference } from '../../src/watchlists/model';
import { addWatchMembers, setWatchFlags } from '../../src/watchlists/membership';

// Authored literals, never actual GME history. fixture:false tests only the supplied-source identity branch.
// These objects are not demo assets or packaged GUI/provider evidence.
function source(providerId: string, fixture: boolean, closes: readonly number[], exchange = 'NYSE', instrumentId = `${exchange}:GME`): BarDataset {
  return {
    instrument: { id: instrumentId, exchange, symbol: 'GME', name: 'GME identity test', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' },
    resolution: '1D',
    bars: closes.map((close, index) => ({ time: 1700000000 + index * 86400, open: close, high: close + 1, low: close - 0.5, close, volume: 1000 })),
    provenance: { providerId, providerName: 'Authored test input', datasetId: `${providerId}:GME`, fixture, coverage: '2 review rows', asOf: 1700086400, delaySeconds: null, adjustment: 'raw', session: 'regular', timezone: 'UTC', state: 'ready', license: 'Original test literals', revision: 'r1', notes: ['Isolated test data, not actual market prices.'] },
  };
}
const S = source('demo', true, [10, 11]);
const I = source('imp', false, [20, 24]);
const S_KEY = '["NYSE:GME","NYSE","demo","demo:GME","1D","USD","raw","regular","UTC","stock",true,"2 review rows"]';
const I_KEY = '["NYSE:GME","NYSE","imp","imp:GME","1D","USD","raw","regular","UTC","stock",false,"2 review rows"]';
const M_KEY = '["NYSE:GME","NYSE","missing","missing:GME","1D","USD","raw","regular","UTC","stock",false,"2 review rows"]';
const S_REF: WatchReference = { exchange: 'NYSE', symbol: 'GME', datasetId: 'demo:GME', dailyDatasetId: null, synthetic: true };
const I_REF: WatchReference = { exchange: 'NYSE', symbol: 'GME', datasetId: 'imp:GME', dailyDatasetId: null, synthetic: false };
const red = { listId: 'flag:red', name: 'Red', match: 'market' as const };
const mix = { listId: 'mix', name: 'Mix', match: 'market' as const };
const flagged = (reference: WatchReference): WatchBook => setWatchFlags(createWatchBook([]), [reference], 'red');
function custom(reference: WatchReference): WatchBook {
  return addWatchMembers(addWatchList(createWatchBook([]), 'mix', 'Mix'), 'mix', [reference], () => 'member-1').book;
}
function configuration(universe: Partial<ScreenerUniverseSelection> = {}): ScreenerConfiguration {
  const base = createScreenerConfiguration();
  return { ...base, columns: [{ id: 'symbol', metric: 'symbol' }, { id: 'last', metric: 'last' }, { id: 'pct', metric: 'changePercent' }, { id: 'flag', metric: 'flag' }], filters: [], sort: { columnId: 'symbol', direction: 'asc' }, universe: { ...base.universe, watchlist: red, ...universe } };
}
function expectCells(run: SavedScreenerResult, last: number, percentage: number): void {
  expect(run.result.rows.map(row => row.instrumentId)).toEqual(['NYSE:GME']);
  expect(run.result.rows[0].cells.last).toMatchObject({ state: 'available', value: last });
  // Hand expectations: (11 - 10) / 10 * 100 = 10; (24 - 20) / 20 * 100 = 20.
  expect(run.result.rows[0].cells.pct.state).toBe('available');
  expect(run.result.rows[0].cells.pct.value).toBeCloseTo(percentage, 12);
  expect(run.result.rows[0].cells.flag).toMatchObject({ state: 'available', value: 'red' });
}

describe('explicit flagged market scope across synthetic statuses', () => {
  it.each([
    { label: 'synthetic reference to supplied candidate', reference: S_REF, candidate: I, key: I_KEY, last: 24, percentage: 20, fixture: false },
    { label: 'supplied reference to synthetic candidate', reference: I_REF, candidate: S, key: S_KEY, last: 11, percentage: 10, fixture: true },
  ])('$label preserves the exact source and agrees with the market flag filter', ({ reference, candidate, key, last, percentage, fixture }) => {
    const book = flagged(reference), before = JSON.stringify(book);
    const run = runSavedScreener([candidate], configuration(), book);
    expectCells(run, last, percentage);
    expect(run.universe.datasets).toHaveLength(1);
    expect(run.universe.datasets[0]).toBe(candidate);
    expect(run.universe.members[0]).toMatchObject({ status: 'selected', selectedKey: key });
    expect(run.universe.datasets[0].provenance.fixture).toBe(fixture);
    expect(run.universe.watchlist).toMatchObject({ members: 1, loaded: 1, notLoaded: 0, outsideScope: 0 });
    expect(run.universe.watchlist!.details[0]).toMatchObject({ status: 'loaded', reason: '1 loaded source match.' });
    const all = configuration(); delete all.universe.watchlist;
    all.filters = [{ id: 'red-only', columnId: 'flag', operator: 'eq', value: 'red', active: true }];
    const filtered = runSavedScreener([candidate], all, book);
    expect(filtered.result.rows).toEqual(run.result.rows);
    expect(JSON.stringify(book)).toBe(before);
  });

  it('keeps two same-instrument source statuses ambiguous with one flagged market', () => {
    const run = runSavedScreener([S, I], configuration(), flagged(S_REF));
    expect(run.universe.watchlist).toMatchObject({ members: 1, loaded: 1, notLoaded: 0 });
    expect(run.universe.watchlist!.details[0].reason).toBe('2 loaded sources match.');
    expect(run.universe.coverage).toMatchObject({ inScope: 1, selected: 0, unresolved: 1 });
    expect(run.universe.members[0]).toMatchObject({ status: 'ambiguous', selected: null, selectedKey: null });
    expect(run.universe.members[0].candidates).toEqual([S, I]);
    expect(run.result.rows).toEqual([]);
  });

  it.each([
    { label: 'synthetic', key: S_KEY, candidate: S, last: 11, percentage: 10 },
    { label: 'supplied', key: I_KEY, candidate: I, last: 24, percentage: 20 },
  ])('selects and saves only the exact $label choice among competing statuses', ({ key, candidate, last, percentage }) => {
    const book = flagged(S_REF), selected = configuration({ sourceChoices: { 'NYSE:GME': key } });
    const run = runSavedScreener([I, S], selected, book);
    expectCells(run, last, percentage);
    expect(run.universe.datasets[0]).toBe(candidate);
    expect(run.universe.members[0].selectedKey).toBe(key);
    expect(screenerDatasetKey(candidate)).toBe(key);
    expect(run.universe.coverage).toMatchObject({ selected: 1, unresolved: 0 });
    const settings = replaceScreenerConfiguration(createScreenerSettings(), selected);
    const saved = saveScreenerScreen(settings, 1800000000, undefined, [I, S], book);
    expect(saved.universe.sourceChoices).toEqual({ 'NYSE:GME': key });
    expect(saved.screens[0].configuration.universe.sourceChoices).toEqual({ 'NYSE:GME': key });
  });

  it.each([I_KEY, M_KEY])('does not replace missing saved choice %s with an opposite-status candidate', key => {
    const book = flagged(I_REF), selected = configuration({ sourceChoices: { 'NYSE:GME': key } });
    const run = runSavedScreener([S], selected, book);
    expect(run.universe.members[0]).toMatchObject({ status: 'missing-bound-source', selected: null });
    expect(run.universe.coverage).toMatchObject({ selected: 0, unresolved: 1 });
    expect(run.result.rows).toEqual([]);
    expect(pinScreenerSources(selected, [S], book).universe.sourceChoices).toEqual({ 'NYSE:GME': key });
    const saved = saveScreenerScreen(replaceScreenerConfiguration(createScreenerSettings(), selected), 1800000000, undefined, [S], book);
    expect(saved.screens[0].configuration.universe.sourceChoices).toEqual({ 'NYSE:GME': key });
  });

  it('does not replace a coverage-bound pin with corrected coverage or the synthetic alternative', () => {
    const corrected = structuredClone(I); corrected.provenance.coverage = '2 corrected review rows';
    const book = flagged(S_REF), selected = configuration({ sourceChoices: { 'NYSE:GME': I_KEY } });
    const run = runSavedScreener([corrected, S], selected, book);
    expect(run.universe.members[0].status).toBe('missing-bound-source');
    expect(run.result.rows).toEqual([]);
    expect(pinScreenerSources(selected, [corrected, S], book).universe.sourceChoices['NYSE:GME']).toBe(I_KEY);
  });

  it('keeps a legacy key without coverage unavailable and unchanged', () => {
    const legacy = '["NYSE:GME","NYSE","imp","imp:GME","1D","USD","raw","regular","UTC","stock",false]';
    const book = flagged(S_REF), selected = configuration({ sourceChoices: { 'NYSE:GME': legacy } });
    const run = runSavedScreener([S, I], selected, book);
    expect(run.universe.members[0]).toMatchObject({ status: 'missing-bound-source', selected: null });
    expect(run.universe.members[0].reason).toContain('older saved source did not record coverage');
    expect(run.result.rows).toEqual([]);
    expect(pinScreenerSources(selected, [S, I], book).universe.sourceChoices['NYSE:GME']).toBe(legacy);
  });

  it('does not pick the first record when complete source identities are duplicated', () => {
    const run = runSavedScreener([I, structuredClone(I)], configuration({ sourceChoices: { 'NYSE:GME': I_KEY } }), flagged(S_REF));
    expect(run.universe.members[0]).toMatchObject({ status: 'ambiguous', selected: null });
    expect(run.universe.members[0].candidates).toHaveLength(2);
    expect(run.result.rows).toEqual([]);
  });
});

describe('unchanged custom and exact-source boundaries', () => {
  it.each([
    { label: 'synthetic', reference: S_REF, opposite: I, same: S },
    { label: 'supplied', reference: I_REF, opposite: S, same: I },
  ])('custom market scope retains the $label status guard', ({ label, reference, opposite, same }) => {
    const book = custom(reference), selected = configuration({ watchlist: mix });
    const rejected = runSavedScreener([opposite], selected, book);
    expect(rejected.result.rows).toEqual([]);
    expect(rejected.universe.watchlist!.details[0]).toMatchObject({ status: 'source-not-loaded', reason: `No loaded ${label} source for NYSE:GME.` });
    expect(runSavedScreener([same], selected, book).universe.datasets[0]).toBe(same);
  });

  it.each([
    { label: 'flagged synthetic', list: red, reference: S_REF, candidate: S, book: flagged },
    { label: 'flagged supplied', list: red, reference: I_REF, candidate: I, book: flagged },
    { label: 'custom synthetic', list: mix, reference: S_REF, candidate: S, book: custom },
    { label: 'custom supplied', list: mix, reference: I_REF, candidate: I, book: custom },
  ])('$label exact-source scope still rejects the opposite status even with identical dataset ID', ({ list, reference, candidate, book }) => {
    const opposite = structuredClone(candidate); opposite.provenance.fixture = !candidate.provenance.fixture;
    const selected = configuration({ watchlist: { ...list, match: 'source' } });
    const rejected = runSavedScreener([opposite], selected, book(reference));
    expect(rejected.result.rows).toEqual([]);
    expect(rejected.universe.watchlist!.details[0].status).toBe('source-not-loaded');
    expect(runSavedScreener([candidate], selected, book(reference)).universe.datasets[0]).toBe(candidate);
  });

  it('retains exact-list binding precedence and preserves the overridden old source pin on save', () => {
    const book = flagged(S_REF), selected = configuration({ watchlist: { ...red, match: 'source' }, sourceChoices: { 'NYSE:GME': I_KEY } });
    const run = runSavedScreener([I, S], selected, book);
    expect(run.universe.members[0]).toMatchObject({ status: 'selected', selectedKey: S_KEY, pinOverridden: true });
    expect(run.universe.datasets[0]).toBe(S);
    expect(pinScreenerSources(selected, [I, S], book).universe.sourceChoices['NYSE:GME']).toBe(I_KEY);
  });

  it('keeps an unbound custom source distinct from an unavailable exact source', () => {
    const book = custom({ ...I_REF, datasetId: null });
    const run = runSavedScreener([I], configuration({ watchlist: { ...mix, match: 'source' } }), book);
    expect(run.universe.watchlist).toMatchObject({ unbound: 1, notLoaded: 0, loaded: 0 });
    expect(run.universe.watchlist!.details[0].status).toBe('unbound');
    expect(run.result.rows).toEqual([]);
  });
});

describe('market namespace, availability and preserved identity limitations', () => {
  it.each([
    { label: 'other exchange', reference: S_REF, candidate: source('imp', false, [50, 55], 'NASDAQ'), market: 'NYSE:GME' },
    { label: 'built-in synthetic namespace', reference: I_REF, candidate: source('demo', true, [40, 44], 'SYNTHETIC'), market: 'NYSE:GME' },
    { label: 'synthetic namespace flag', reference: { ...S_REF, exchange: 'SYNTHETIC' }, candidate: I, market: 'SYNTHETIC:GME' },
  ])('never matches by ticker alone: $label', ({ reference, candidate, market }) => {
    const run = runSavedScreener([candidate], configuration(), flagged(reference));
    expect(run.result.rows).toEqual([]);
    expect(run.universe.watchlist).toMatchObject({ notLoaded: 1, loaded: 0 });
    expect(run.universe.watchlist!.details[0]).toMatchObject({ status: 'source-not-loaded', reason: `No loaded source for flagged market ${market}.` });
  });

  it.each(['resolution', 'currency', 'asset'] as const)('reports an opposite-status candidate outside the %s scope without fabricating data', kind => {
    const candidate = structuredClone(I), selected = configuration();
    if (kind === 'resolution') candidate.resolution = '1W';
    else if (kind === 'currency') candidate.instrument.currency = 'EUR';
    else { candidate.instrument.assetClass = 'etf'; selected.universe.assets = ['stock']; }
    const run = runSavedScreener([candidate], selected, flagged(S_REF));
    expect(run.universe.watchlist).toMatchObject({ outsideScope: 1, loaded: 0, notLoaded: 0 });
    expect(run.universe.watchlist!.details[0]).toMatchObject({ status: 'outside-scope', reason: 'NYSE:GME is loaded only outside the selected asset class, currency or resolution.' });
    expect(run.result.rows).toEqual([]);
    if (kind === 'resolution') {
      expect(run.universe.members[0].status).toBe('missing-resolution');
      expect(run.universe.coverage.unresolved).toBe(1);
    } else {
      expect(run.universe.members).toEqual([]);
      expect(run.universe.coverage.outsideAssetOrCurrency).toBe(1);
    }
  });

  it('keeps explicit exclusion ahead of source choice and ambiguity', () => {
    const run = runSavedScreener([I, S], configuration({ excludedInstrumentIds: ['NYSE:GME'], sourceChoices: { 'NYSE:GME': I_KEY } }), flagged(S_REF));
    expect(run.universe.members[0]).toMatchObject({ status: 'excluded', selected: null });
    expect(run.universe.coverage).toMatchObject({ explicitlyExcluded: 1, selected: 0, unresolved: 0 });
    expect(run.result.rows).toEqual([]);
  });

  it.each([
    { label: 'empty flagged list', book: createWatchBook([]), scope: red, state: 'empty', outside: 1 },
    { label: 'invalid flagged ID', book: flagged(S_REF), scope: { ...red, listId: 'flag:invalid' }, state: 'missing-list', outside: null },
    { label: 'missing custom list', book: flagged(S_REF), scope: mix, state: 'missing-list', outside: null },
    { label: 'disconnected book', book: null, scope: red, state: 'not-connected', outside: null },
  ])('retains distinct $label availability', ({ book, scope, state, outside }) => {
    const run = runSavedScreener([I], configuration({ watchlist: scope }), book);
    expect(run.universe.watchlist!.state).toBe(state);
    expect(run.universe.coverage.outsideWatchlist).toBe(outside);
    expect(run.result.rows).toEqual([]);
  });

  it('evaluation, exact pinning and save/restore never mutate the stored flag or source bytes', () => {
    const book = flagged(S_REF), datasets = [structuredClone(I)], selected = configuration();
    const before = JSON.stringify({ book, datasets, selected });
    const run = runSavedScreener(datasets, selected, book);
    expectCells(run, 24, 20);
    const pinned = pinScreenerSources(selected, datasets, book);
    expect(pinned.universe.sourceChoices).toEqual({ 'NYSE:GME': I_KEY });
    const settings = replaceScreenerConfiguration(createScreenerSettings(), selected), beforeSettings = JSON.stringify(settings);
    const saved = saveScreenerScreen(settings, 1800000000, undefined, datasets, book);
    const restored = restoreScreenerSettings(JSON.parse(JSON.stringify(saved)));
    expect(restored.universe.watchlist).toEqual(red);
    expect(restored.universe.sourceChoices).toEqual({ 'NYSE:GME': I_KEY });
    expectCells(runSavedScreener(datasets, restored, book), 24, 20);
    expect(JSON.stringify({ book, datasets, selected })).toBe(before);
    expect(JSON.stringify(settings)).toBe(beforeSettings);
    expect(book.flags[0].reference).toEqual(S_REF);
    expect(datasets[0].provenance.fixture).toBe(false);
  });

  it('KNOWN IDENTITY BOUNDARY: differing instrument IDs remain separate rows for the same market', () => {
    const alias = source('alias', false, [60, 66], 'NYSE', 'vendor:GME:1');
    const run = runSavedScreener([I, alias], configuration(), flagged(S_REF));
    expect(run.universe.watchlist).toMatchObject({ members: 1, loaded: 1 });
    expect(run.universe.watchlist!.details[0].reason).toBe('2 loaded sources match.');
    expect(run.universe.coverage).toMatchObject({ inScope: 2, selected: 2, unresolved: 0 });
    expect(run.result.rows.map(row => row.instrumentId).sort()).toEqual(['NYSE:GME', 'vendor:GME:1']);
    expect(run.result.rows.find(row => row.instrumentId === 'NYSE:GME')!.cells.last.value).toBe(24);
    expect(run.result.rows.find(row => row.instrumentId === 'vendor:GME:1')!.cells.last.value).toBe(66);
  });

  it('KNOWN GAP: no-candidate market pin survives but is absent from unresolved member counts', () => {
    const book = flagged(S_REF), selected = configuration({ sourceChoices: { 'NYSE:GME': M_KEY } });
    const run = runSavedScreener([], selected, book);
    expect(run.universe.watchlist).toMatchObject({ notLoaded: 1, loaded: 0 });
    expect(run.universe.members).toEqual([]);
    expect(run.universe.coverage.unresolved).toBe(0);
    expect(run.result.rows).toEqual([]);
    expect(pinScreenerSources(selected, [], book).universe.sourceChoices['NYSE:GME']).toBe(M_KEY);
  });
});
