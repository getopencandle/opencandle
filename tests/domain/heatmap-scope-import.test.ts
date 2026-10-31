// Watchlist scope and metadata file import for the heatmap.
import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { HEATMAP_METADATA_CSV_TEMPLATE, calculateHeatmap, createHeatmapState, heatmapCsvRows, heatmapWatchScope, mergeHeatmapMetadata, parseHeatmapMetadata } from '../../src/domain/heatmap';

const NOW = 1_800_000_000;
const sets = () => ['AAA', 'BBB', 'CCC'].map(symbol => { const set = fixtureDataset(symbol, 20); set.instrument.assetClass = 'stock'; return set; });

describe('heatmap watchlist scope', () => {
  it('keeps only watchlist members and names members with no loaded data', () => {
    const universe = sets(), scope = heatmapWatchScope(universe, [{ symbol: 'AAA', exchange: 'SYNTHETIC', datasetId: null }, { symbol: 'ZZZ', exchange: 'SYNTHETIC', datasetId: null }]);
    expect(scope.datasets.map(set => set.instrument.symbol)).toEqual(['AAA']); expect(scope.missing).toEqual(['ZZZ']);
  });
  it('matches a bound member to its own dataset only, and exchange case-insensitively', () => {
    const universe = sets(), twin = structuredClone(universe[0]); twin.provenance.datasetId = 'other-dataset';
    const bound = heatmapWatchScope([...universe, twin], [{ symbol: 'AAA', exchange: 'SYNTHETIC', datasetId: 'other-dataset' }]);
    expect(bound.datasets).toEqual([twin]);
    expect(heatmapWatchScope(universe, [{ symbol: 'bbb', exchange: 'synthetic', datasetId: null }]).datasets).toHaveLength(1);
  });
  it('feeds the heatmap so a scoped view counts only the scoped instruments', () => {
    const universe = sets(), scoped = heatmapWatchScope(universe, [{ symbol: 'AAA', exchange: 'SYNTHETIC', datasetId: null }, { symbol: 'BBB', exchange: 'SYNTHETIC', datasetId: null }]).datasets;
    const result = calculateHeatmap(scoped, createHeatmapState().settings, [], NOW);
    expect(result.coverage.supplied).toBe(2); expect(result.items).toHaveLength(2);
  });
});

describe('heatmap metadata file import', () => {
  it('reads the existing JSON schema, an object wrapper, and rejects undated rows', () => {
    const [a] = sets(), row = { instrumentId: a.instrument.id, marketCap: 5, aum: null, currency: 'USD', sector: 'Tech', fundAssetClass: null, asOf: 10, availableAt: 20, source: 'Mine' };
    expect(parseHeatmapMetadata(JSON.stringify([row]), 'json', [a]).metadata).toEqual([row]);
    expect(parseHeatmapMetadata(JSON.stringify({ metadata: [row] }), 'json', [a]).metadata).toEqual([row]);
    expect(() => parseHeatmapMetadata(JSON.stringify([{ ...row, availableAt: 5 }]), 'json', [a])).toThrow(/undated|Invalid/);
  });
  it('reads a sector and industry CSV, matches symbols to loaded instruments and defaults dates to now', () => {
    const universe = sets(), text = 'symbol,sector,industry,marketCap,source\nAAA,Technology,,"1,500",Sheet\nbbb,,Banks,200,\nNOPE,Energy,,1,\n';
    const result = parseHeatmapMetadata(text, 'csv', universe, { now: NOW, source: 'sectors.csv' });
    expect(result.metadata).toHaveLength(2);
    expect(result.metadata[0]).toMatchObject({ instrumentId: universe[0].instrument.id, sector: 'Technology', marketCap: 1500, currency: universe[0].instrument.currency, asOf: NOW, availableAt: NOW, source: 'Sheet' });
    expect(result.metadata[1]).toMatchObject({ sector: 'Banks', source: 'sectors.csv' });
    expect(result.diagnostics.join(' ')).toContain('NOPE has no loaded instrument'); expect(result.diagnostics.join(' ')).toContain('industry text fills the sector slot');
  });
  it('accepts ISO dates and Unix seconds, and names the bad line', () => {
    const universe = sets();
    const good = parseHeatmapMetadata('symbol,asOf,availableAt,sector\nAAA,2026-01-02,1767398400,X\n', 'csv', universe, { now: NOW });
    expect(good.metadata[0]).toMatchObject({ asOf: Date.parse('2026-01-02T00:00:00Z') / 1000, availableAt: 1767398400 });
    expect(() => parseHeatmapMetadata('symbol,marketCap\nAAA,lots\n', 'csv', universe)).toThrow(/Line 2.*marketCap/);
    expect(() => parseHeatmapMetadata('symbol,asOf\nAAA,yesterday\n', 'csv', universe)).toThrow(/Line 2.*asOf/);
    expect(() => parseHeatmapMetadata('name\nAAA\n', 'csv', universe)).toThrow(/symbol or instrumentId/);
    expect(() => parseHeatmapMetadata('symbol,sector\nNOPE,X\n', 'csv', universe)).toThrow(/No CSV row matched/);
  });
  it('refuses an ambiguous symbol unless an exchange column narrows it', () => {
    const [a] = sets(), clone = structuredClone(a); clone.instrument.id = 'OTHER:AAA'; clone.instrument.exchange = 'OTHER';
    expect(() => parseHeatmapMetadata('symbol,sector\nAAA,X\n', 'csv', [a, clone])).toThrow(/matches 2 loaded instruments/);
    expect(parseHeatmapMetadata('symbol,exchange,sector\nAAA,OTHER,X\n', 'csv', [a, clone]).metadata[0].instrumentId).toBe('OTHER:AAA');
  });
  it('parses quoted CSV and the template is a header plus an example row', () => {
    expect(heatmapCsvRows('a,"b,c","d ""q"""\r\n\r\n1,2,3\n')).toEqual([['a', 'b,c', 'd "q"'], ['1', '2', '3']]);
    expect(() => heatmapCsvRows('a,"open')).toThrow(/unclosed/);
    expect(heatmapCsvRows(HEATMAP_METADATA_CSV_TEMPLATE)).toHaveLength(2);
  });
  it('merges by instrument, replacing the old row', () => {
    const [a, b] = sets(), mk = (id: string, sector: string) => ({ instrumentId: id, marketCap: null, aum: null, currency: 'USD', sector, fundAssetClass: null, asOf: 1, availableAt: 1, source: 's' });
    const merged = mergeHeatmapMetadata([mk(a.instrument.id, 'Old'), mk(b.instrument.id, 'Keep')], [mk(a.instrument.id, 'New')]);
    expect(merged.map(row => row.sector).sort()).toEqual(['Keep', 'New']);
  });
});
