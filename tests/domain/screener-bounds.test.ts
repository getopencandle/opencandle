import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { runScreener } from '../../src/domain/screener';
import { boundScreenerHistory, createScreenerSettings, exportScreenerScreens, pinScreenerSources, previewScreenerImport, resolveScreenerUniverse, restoreScreenerSettings, savedScreenerToCsv, screenerConfiguration, screenerDatasetKey, runSavedScreener, type ScreenerConfiguration } from '../../src/domain/screener-state';

describe('source coverage identity and bounded screener recovery', () => {
  it('accepts price revisions but rejects changed venue coverage under the same provider/dataset identity', () => {
    const data = fixtureDataset('SOURCE', 3); data.provenance.coverage = 'Single venue';
    const configuration = pinScreenerSources(screenerConfiguration(createScreenerSettings()), [data]);
    const revised = structuredClone(data); revised.provenance.revision = 'corrected';
    expect(resolveScreenerUniverse([revised], configuration.universe).datasets).toEqual([revised]);
    const consolidated = structuredClone(revised); consolidated.provenance.coverage = 'Consolidated';
    expect(resolveScreenerUniverse([consolidated], configuration.universe).members[0]).toMatchObject({ status: 'missing-bound-source', selected: null });
    const csv = savedScreenerToCsv(runSavedScreener([data], configuration), configuration.columns);
    expect(csv).toContain('Source coverage'); expect(csv).toContain('Single venue');
  });
  it('retains old coverage-less keys through recovery/export as unavailable until explicitly rebound', () => {
    const data = fixtureDataset('LEGACY', 3), settings = createScreenerSettings(), full = JSON.parse(screenerDatasetKey(data));
    expect(full).toHaveLength(12); const legacy = JSON.stringify(full.slice(0, 11));
    settings.universe.sourceChoices[data.instrument.id] = legacy; settings.screens[0].configuration.universe.sourceChoices[data.instrument.id] = legacy;
    const restored = restoreScreenerSettings(settings), before = JSON.stringify(restored);
    expect(restored.universe.sourceChoices[data.instrument.id]).toBe(legacy);
    const unresolved = resolveScreenerUniverse([data], restored.universe);
    expect(unresolved.datasets).toEqual([]); expect(unresolved.members[0].reason).toContain('did not record coverage');
    expect(pinScreenerSources(screenerConfiguration(restored), [data]).universe.sourceChoices[data.instrument.id]).toBe(legacy);
    expect(previewScreenerImport(exportScreenerScreens(restored, 'all')).screens[0].configuration.universe.sourceChoices[data.instrument.id]).toBe(legacy);
    const rebound = { ...restored.universe, sourceChoices: { ...restored.universe.sourceChoices, [data.instrument.id]: screenerDatasetKey(data) } };
    expect(resolveScreenerUniverse([data], rebound).datasets).toEqual([data]); expect(JSON.stringify(restored)).toBe(before);
  });
  it('keeps only a contiguous newest history segment within a UTF-8 payload budget', () => {
    const original = screenerConfiguration(createScreenerSettings());
    const entry = (label: string): ScreenerConfiguration => ({ ...structuredClone(original), columns: [{ id: 'symbol', metric: 'symbol', label }] });
    const a = entry('A'), b = entry('B'), c = entry('C'), bytes = new TextEncoder().encode(JSON.stringify(b)).length + new TextEncoder().encode(JSON.stringify(c)).length;
    const source = { past: [a, b, c], future: [] }, before = JSON.stringify(source);
    const kept = boundScreenerHistory(source, 'past', bytes);
    expect(kept.history.past.map(value => value.columns[0].label)).toEqual(['B', 'C']); expect(kept.droppedSteps).toBe(1); expect(JSON.stringify(source)).toBe(before);
    const euro = entry('€'), single = new TextEncoder().encode(JSON.stringify(a)).length;
    expect(boundScreenerHistory({ past: [a, euro], future: [] }, 'past', single).history.past).toEqual([]);
    expect(boundScreenerHistory({ past: [euro, b], future: [] }, 'past', single).history.past).toEqual([b]);
  });
  it('prioritizes the newly transferred undo/redo side without skipping an oversized adjacent state', () => {
    const original = screenerConfiguration(createScreenerSettings()), older = structuredClone(original), latest = structuredClone(original);
    older.columns[0].label = 'A'; latest.columns[0].label = 'B';
    const one = new TextEncoder().encode(JSON.stringify(latest)).length;
    expect(boundScreenerHistory({ past: [older], future: [latest] }, 'future', one).history).toEqual({ past: [], future: [latest] });
    expect(boundScreenerHistory({ past: [older], future: [latest] }, 'past', one).history).toEqual({ past: [older], future: [] });
    expect(boundScreenerHistory({ past: [older], future: [latest] }, 'past', 0).droppedSteps).toBe(2);
    expect(boundScreenerHistory({ past: Array(101).fill(older), future: [] }, 'past').history.past).toHaveLength(100);
  });
  it('rejects a huge set-membership workload before evaluating any rows', () => {
    const template = fixtureDataset('LIMIT', 0), datasets = Array.from({ length: 10000 }, (_, index) => ({ ...template, instrument: { ...template.instrument, id: `LIMIT:${index}` } }));
    const columns = [{ id: 'last', metric: 'last' }], filters = Array.from({ length: 500 }, (_, index) => ({ id: `set-${index}`, columnId: 'last', operator: 'in' as const, value: Array.from({ length: 1000 }, (_, value) => value), active: true }));
    const result = runScreener(datasets, columns, filters);
    expect(result.diagnostics.some(value => value.code === 'WORKLOAD_LIMIT')).toBe(true); expect(result.coverage.evaluated).toBe(0); expect(result.rows).toEqual([]);
    expect(runScreener(datasets, columns, filters.map(filter => ({ ...filter, active: false }))).diagnostics).toEqual([]);
  });
  it('includes string lengths in the conservative text predicate estimate', () => {
    const template = fixtureDataset('TEXT', 0), datasets = Array.from({ length: 1000 }, (_, index) => ({ ...template, instrument: { ...template.instrument, id: `TEXT:${index}`, name: 'a'.repeat(1000) } }));
    const result = runScreener(datasets, [{ id: 'name', metric: 'name' }], [{ id: 'search', columnId: 'name', operator: 'contains', value: 'b'.repeat(1000), active: true }]);
    expect(result.diagnostics.some(value => value.code === 'WORKLOAD_LIMIT')).toBe(true); expect(result.coverage.evaluated).toBe(0);
  });
});
