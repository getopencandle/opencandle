import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { parseScreenerFilterValue, runScreener } from '../../src/domain/screener';
import { applyScreenerSwitch, captureScreenerSwitch, copyScreenerScreen, createScreenerSettings, deleteScreenerScreen, editScreenerWithHistory, exportScreenerScreens, importScreenerScreens, isScreenerDirty, pinScreenerSources, previewScreenerImport, renameScreenerScreen, replaceScreenerConfiguration, resolveScreenerUniverse, restoreScreenerSettings, runSavedScreener, savedScreenerToCsv, saveScreenerScreen, scheduleScreenerAutosave, screenerConfiguration, screenerDatasetKey, SCREENER_STATE_LIMITS, travelScreenerHistory } from '../../src/domain/screener-state';
import type { ScreenerSettings, ScreenerUndoState } from '../../src/domain/screener-state';
import type { BarDataset } from '../../src/domain/types';

function data(symbol: string, closes: number[], resolution = '1D', provider = 'fixture-provider'): BarDataset {
  const value = fixtureDataset(symbol, 0); value.resolution = resolution;
  value.provenance = { ...value.provenance, providerId: provider, datasetId: `${provider}:${symbol}:${resolution}`, session: 'regular' };
  value.bars = closes.map((close, index) => ({ time: 1704153600 + index * 86400, open: close, high: close + 1, low: close - 1, close, volume: 100 }));
  return value;
}
const now = 1800000000;
afterEach(() => vi.useRealTimers());

describe('exact-source screener configuration', () => {
  it('migrates the previous three-field shape without sharing or changing its parameterized instances', () => {
    const legacy = { columns: [{ id: 'short', metric: 'sma', parameters: { length: 2 } }, { id: 'long', metric: 'sma', parameters: { length: 3 } }], filters: [{ id: 'positive', columnId: 'short', operator: 'gt', value: 4.5, active: true }], sort: { columnId: 'short', direction: 'desc' } };
    const before = JSON.stringify(legacy), next = restoreScreenerSettings(legacy);
    expect(next.schemaVersion).toBe(2); expect(next.columns).toEqual(legacy.columns); expect(next.sort).toEqual(legacy.sort); expect(next.filters).toEqual(legacy.filters); expect(isScreenerDirty(next)).toBe(false);
    next.columns[0].parameters!.length = 1; expect(JSON.stringify(legacy)).toBe(before);
    expect(() => restoreScreenerSettings({ ...legacy, sort: { columnId: 'missing', direction: 'asc' } })).toThrow();
    expect(() => restoreScreenerSettings({ ...legacy, filters: [{ ...legacy.filters[0], columnId: 'missing' }] })).toThrow();
  });
  it('selects resolution before ambiguity and retains a missing saved source without substitution', () => {
    const daily = data('ARBITRARY', [10, 12]), minute = data('ARBITRARY', [20, 21], '1m'), other = data('ARBITRARY', [30, 31], '1D', 'other-provider');
    const configuration = screenerConfiguration(createScreenerSettings());
    expect(resolveScreenerUniverse([minute, daily], configuration.universe).datasets).toEqual([daily]);
    expect(resolveScreenerUniverse([daily, other], configuration.universe).coverage).toMatchObject({ selected: 0, unresolved: 1, inScope: 1 });
    configuration.universe.sourceChoices[daily.instrument.id] = screenerDatasetKey(daily);
    expect(resolveScreenerUniverse([other, daily], configuration.universe).datasets).toEqual([daily]);
    expect(resolveScreenerUniverse([other], configuration.universe).members[0].status).toBe('missing-bound-source');
    expect(resolveScreenerUniverse([], configuration.universe).coverage).toMatchObject({ loadedInstruments: 0, inScope: 1, unresolved: 1 });
    const duplicate = resolveScreenerUniverse([daily, structuredClone(daily)], configuration.universe);
    expect(duplicate.members[0].status).toBe('ambiguous'); expect(duplicate.datasets).toEqual([]);
  });
  it('binds exchange, currency, adjustment, session, timezone and fixture label independently of revision', () => {
    const original = data('SOURCE', [10, 12]), configuration = pinScreenerSources(screenerConfiguration(createScreenerSettings()), [original]);
    for (const mutate of [
      (value: BarDataset) => { value.instrument.exchange = 'OTHER'; },
      (value: BarDataset) => { value.instrument.currency = 'EUR'; },
      (value: BarDataset) => { value.provenance.adjustment = 'split-adjusted'; },
      (value: BarDataset) => { value.provenance.session = 'extended'; },
      (value: BarDataset) => { value.provenance.timezone = 'America/New_York'; },
      (value: BarDataset) => { value.provenance.fixture = false; },
    ]) { const changed = structuredClone(original); mutate(changed); expect(resolveScreenerUniverse([changed], configuration.universe).datasets).toEqual([]); }
    const correction = structuredClone(original); correction.provenance.revision = 'correction-2';
    expect(resolveScreenerUniverse([correction], configuration.universe).datasets[0].provenance.revision).toBe('correction-2');
  });
  it('counts matches, false predicates and unresolved inputs against the same supported denominator', () => {
    const configuration = screenerConfiguration(createScreenerSettings());
    configuration.filters = [{ id: 'gt10', columnId: 'last', operator: 'gt', value: 10, active: true }];
    const unsupported = data('COIN', [100]); unsupported.instrument.assetClass = 'crypto';
    const value = runSavedScreener([data('MATCH', [10, 12]), data('FALSE', [5, 7]), data('MISSING_DAY', [9], '1m'), unsupported], configuration);
    expect(value.universe.coverage).toMatchObject({ loadedInstruments: 4, inScope: 3, selected: 2, unresolved: 1, outsideAssetOrCurrency: 1 });
    expect(value.result.coverage).toMatchObject({ matched: 1, excluded: 1, unavailablePredicate: 0 });
    expect(value.result.rows[0].symbol).toBe('MATCH');
    expect(value.result.policies.join(' ')).not.toContain('completed supplied');
    expect(value.result.policies.join(' ')).toContain('Actual completion and historical publication time are unknown');
  });
  it('edits one parameterized instance while cancellation leaves both columns and dependent filters intact', () => {
    const settings = createScreenerSettings(); settings.columns = [{ id: 'sma2', metric: 'sma', parameters: { length: 2 } }, { id: 'sma3', metric: 'sma', parameters: { length: 3 } }]; settings.sort.columnId = 'sma2'; settings.filters = [{ id: 'match', columnId: 'sma2', operator: 'gt', value: 4.5, active: true }];
    const original = JSON.stringify(settings), draft = screenerConfiguration(settings); draft.columns[1].parameters!.length = 1;
    expect(JSON.stringify(settings)).toBe(original);
    const committed = replaceScreenerConfiguration(settings, draft), row = runSavedScreener([data('SMA', [2, 4, 6])], committed).result.rows[0];
    expect(row.cells.sma2.value).toBe(5); expect(row.cells.sma3.value).toBe(6); expect(committed.filters).toEqual(settings.filters); expect(committed.sort).toEqual(settings.sort);
    expect(JSON.stringify(settings)).toBe(original);
  });
  it('rejects blank numeric elements, incompatible operators and unsupported parameter no-ops', () => {
    for (const value of ['', ' ', '1,,2', '1,NaN', '1,']) expect(() => parseScreenerFilterValue('last', 'in', value)).toThrow();
    expect(() => parseScreenerFilterValue('symbol', 'gt', 'ABC')).toThrow(); expect(() => parseScreenerFilterValue('last', 'contains', '1')).toThrow();
    expect(parseScreenerFilterValue('last', 'between', '0, 10')).toEqual([0, 10]);
    expect(runScreener([], [{ id: 'x', metric: 'last', parameters: { length: 14 } }]).diagnostics[0].code).toBe('COLUMN_PARAMETER');
    const settings = createScreenerSettings(); settings.columns.push({ id: 'unknown', metric: 'analystRating', parameters: { period: 'FY' } });
    const row = runSavedScreener([data('UNKNOWN', [10])], restoreScreenerSettings(settings)).result.rows[0];
    expect(row.cells.unknown).toMatchObject({ value: null, state: 'unavailable' });
  });
  it('uses actual MACD plot choices and literal fractional EMA expectations', () => {
    const parameters = { fast: 2, slow: 3, signal: 2, oscillatorType: 'EMA', signalType: 'EMA', source: 'close' };
    // MACD EMAs are SMA-seeded as in the reference app (ARM 1D: line from bar 25, signal from bar 33), so a fourth
    // close is needed for a signal. Closes 2, 4, 6, 5: EMA2 = 3, 5, 5; EMA3 = 4, 4.5; line = 1, 1/2; signal = mean(1, 1/2) = 3/4.
    // (Was closes 2, 4, 6 with the first-value seed: 11/18, 13/27, 7/54.)
    const row = runScreener([data('MACD', [2, 4, 6, 5])], ['macd', 'signal', 'histogram'].map(plot => ({ id: plot, metric: 'macd', parameters: { ...parameters, plot } }))).rows[0];
    expect(row.cells.macd.value).toBeCloseTo(1 / 2, 12); expect(row.cells.signal.value).toBeCloseTo(3 / 4, 12); expect(row.cells.histogram.value).toBeCloseTo(-1 / 4, 12);
  });
});

describe('saved screens, untrusted configuration and local timer semantics', () => {
  it('save/copy/rename/delete retain independent snapshots and reject stale revisions', () => {
    const settings = createScreenerSettings(), configuration = screenerConfiguration(settings); configuration.columns[1].label = 'Latest supplied close';
    const changed = replaceScreenerConfiguration(settings, configuration), saved = saveScreenerScreen(changed, now, undefined, [data('PINNED', [10])]);
    expect(isScreenerDirty(saved)).toBe(false); expect(Object.keys(saved.universe.sourceChoices)).toHaveLength(1); expect(settings.screens[0].revision).toBe(1); expect(saved.screens[0].revision).toBe(2);
    const copied = copyScreenerScreen(saved, 'copy', 'Research copy', now + 1), renamed = renameScreenerScreen(copied, 'copy', 1, 'Renamed', now + 2);
    expect(renamed.screens[0].name).toBe('Loaded stocks and ETFs'); expect(renamed.name).toBe('Renamed'); expect(copied.screens[1].name).toBe('Research copy');
    expect(() => deleteScreenerScreen(renamed, 'copy', 1)).toThrow('changed');
    const deleted = deleteScreenerScreen(renamed, 'copy', 2); expect(deleted.activeScreenId).toBeNull(); expect(deleted.columns).toEqual(renamed.columns); expect(deleted.screens).toHaveLength(1);
  });
  it('pins dirty-switch target and state; Cancel and stale decisions never discard work', () => {
    let settings = copyScreenerScreen(createScreenerSettings(), 'copy', 'Second', now);
    settings = replaceScreenerConfiguration(settings, { ...screenerConfiguration(settings), filtersHidden: true });
    const request = captureScreenerSwitch(settings, 'local-default-screen'), before = JSON.stringify(settings);
    expect(applyScreenerSwitch(settings, request, 'cancel', now + 1)).toBe(settings);
    const stale = { ...settings, name: 'Changed during confirmation' };
    expect(() => applyScreenerSwitch(stale, request, 'discard', now + 1)).toThrow('changed');
    const saved = applyScreenerSwitch(settings, request, 'save', now + 1);
    expect(saved.activeScreenId).toBe('local-default-screen'); expect(saved.filtersHidden).toBe(false); expect(saved.screens.find(row => row.id === 'copy')!.configuration.filtersHidden).toBe(true);
    expect(JSON.stringify(settings)).toBe(before);
  });
  it('undo/redo retains100 configuration steps without rewinding saved records', () => {
    let settings = createScreenerSettings(), history: ScreenerUndoState = { past: [], future: [] };
    for (let index = 1; index <= 105; index++) { const configuration = screenerConfiguration(settings); configuration.columns[1].label = `Price ${index}`; ({ settings, history } = editScreenerWithHistory(settings, history, configuration)); }
    expect(history.past).toHaveLength(100); const saved = JSON.stringify(settings.screens);
    for (let index = 0; index < 100; index++) ({ settings, history } = travelScreenerHistory(settings, history, 'undo'));
    expect(settings.columns[1].label).toBe('Price 5'); expect(JSON.stringify(settings.screens)).toBe(saved);
    ({ settings, history } = travelScreenerHistory(settings, history, 'redo')); expect(settings.columns[1].label).toBe('Price 6');
  });
  it('autosave waits two quiet seconds, uses the latest edit, and cannot recreate a deleted active record', () => {
    vi.useFakeTimers(); let settings: ScreenerSettings = { ...createScreenerSettings(), autosave: true };
    settings = replaceScreenerConfiguration(settings, { ...screenerConfiguration(settings), filtersHidden: true });
    const save = vi.fn((value: ScreenerSettings) => { settings = value; });
    const cancel = scheduleScreenerAutosave(settings, () => settings, save, () => now);
    vi.advanceTimersByTime(1000); cancel(); settings = replaceScreenerConfiguration(settings, { ...screenerConfiguration(settings), sort: { columnId: 'last', direction: 'desc' } });
    scheduleScreenerAutosave(settings, () => settings, save, () => now + 1);
    vi.advanceTimersByTime(1000); expect(save).not.toHaveBeenCalled(); vi.advanceTimersByTime(1000); expect(save).toHaveBeenCalledOnce(); expect(settings.screens[0].configuration.sort.columnId).toBe('last');
    settings = replaceScreenerConfiguration(settings, { ...screenerConfiguration(settings), filtersHidden: false });
    scheduleScreenerAutosave(settings, () => settings, save, () => now + 2);
    settings = deleteScreenerScreen(settings, settings.activeScreenId!, settings.screens[0].revision);
    vi.advanceTimersByTime(3000); expect(save).toHaveBeenCalledOnce(); expect(settings.screens).toEqual([]); expect(settings.activeScreenId).toBeNull();
    scheduleScreenerAutosave(settings, () => settings, save, () => now + 3); vi.advanceTimersByTime(3000); expect(save).toHaveBeenCalledOnce();
  });
  it('imports previews atomically with fresh identities and exports no price bars', () => {
    const original = createScreenerSettings(), exported = exportScreenerScreens(original, 'all'), preview = previewScreenerImport(exported);
    expect(exported).not.toContain('"bars"'); const before = JSON.stringify(original);
    const imported = importScreenerScreens(original, preview, now, () => 'imported');
    expect(imported.screens).toHaveLength(2); expect(imported.screens[1].configuration).toEqual(original.screens[0].configuration); expect(imported.activeScreenId).toBe(original.activeScreenId);
    expect(() => importScreenerScreens(original, { ...preview, screens: [...preview.screens, ...preview.screens] }, now, () => 'duplicate')).toThrow(); expect(JSON.stringify(original)).toBe(before);
    expect(() => previewScreenerImport('{"format":"lv-screener-screens","version":1,"screens":[],"__proto__":{}}')).toThrow();
    expect(() => previewScreenerImport('é'.repeat(SCREENER_STATE_LIMITS.bytes / 2 + 1))).toThrow('before parsing');
    const accessor = { ...original }; Object.defineProperty(accessor, 'name', { enumerable: true, get() { throw new Error('Accessor must never execute'); } });
    expect(() => restoreScreenerSettings(accessor)).toThrow('unsafe properties');
  });
  it('CSV carries exact source and native basis even when those are not visible metric columns', () => {
    const configuration = screenerConfiguration(createScreenerSettings()); configuration.columns = [{ id: 'lv-export:provider', metric: 'last', label: '=Unsafe header' }]; configuration.sort.columnId = 'lv-export:provider';
    const source = data('CSV', [10, 12]); source.provenance.state = 'disconnected';
    const csv = savedScreenerToCsv(runSavedScreener([source], configuration), configuration.columns);
    expect(csv).toContain("'=Unsafe header"); expect(csv).toContain('12'); expect(csv).toContain('fixture-provider'); expect(csv).toContain(source.provenance.datasetId); expect(csv).toContain('disconnected'); expect(csv).toContain('publication and completion unknown');
  });
});
