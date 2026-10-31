import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { calculateHeatmap, createHeatmapState, heatmapDatasetKey, heatmapSelectedDataset, layoutHeatmap, restoreHeatmapState, type HeatmapMetadata } from '../../src/domain/heatmap';

function data(symbol: string, closes: number[], volumes: number[] = closes.map(() => 100)) {
  const result = fixtureDataset(symbol, 0);
  result.bars = closes.map((close, i) => ({ time: 100 + i * 100, open: close, high: close + 1, low: close - 1, close, volume: volumes[i] }));
  return result;
}
const settings = () => createHeatmapState().settings;
describe('heatmap calculations and explicit coverage', () => {
  it('uses actual loaded windows, independent returns and turnover proxy numbers', () => {
    const a = data('A', [10, 11, 12], [100, 200, 300]), b = data('B', [20, 18, 16], [50, 80, 100]);
    const result = calculateHeatmap([a, b], { ...settings(), bars: 2, monoSize: false }, [], 1000);
    expect(result.items.map(row => row.sizeValue)).toEqual([500, 180]);
    expect(result.items[0].colorValue).toBeCloseTo(20, 12); expect(result.items[1].colorValue).toBeCloseTo(-20, 12);
    expect(result.coverage).toMatchObject({ supplied: 2, eligible: 2, shown: 2, synthetic: 2, unknownColor: 0 });
    expect(calculateHeatmap([a], { ...settings(), bars: 2, size: 'turnover' }, [], 1000).items[0].sizeValue).toBe(5800);
    expect(calculateHeatmap([a], { ...settings(), bars: 2, color: 'relative-volume' }, [], 1000).items[0].colorValue).toBe(2);
    expect(calculateHeatmap([a], { ...settings(), color: 'gap' }, [], 1000).items[0].colorValue).toBeCloseTo(100 / 11, 12);
    expect(calculateHeatmap([a], { ...settings(), color: 'range-percent' }, [], 1000).items[0].colorValue).toBeCloseTo(200 / 11, 12);
  });
  it('separates zero, absent history, unavailable data and equal-area mode', () => {
    const missing = data('MISSING', []), zero = data('ZERO', [10, 10], [0, 0]), bad = data('BAD', [10, 11]); bad.provenance.state = 'unavailable';
    const result = calculateHeatmap([missing, zero, bad], { ...settings(), monoSize: false }, [], 1000);
    expect(result.items).toHaveLength(0); expect(result.unavailable).toHaveLength(2); expect(result.zeroWeight.map(row => row.symbol)).toEqual(['ZERO']);
    expect(result.coverage).toMatchObject({ unknownColor: 2, unknownSize: 2, shown: 0 });
    const equal = calculateHeatmap([missing, zero, bad], settings(), [], 1000);
    expect(equal.items).toHaveLength(3); expect(equal.items.every(row => row.weight === 1)).toBe(true);
    expect(calculateHeatmap([zero], { ...settings(), color: 'relative-volume' }, [], 1000).items[0].colorValue).toBeNull();
  });
  it('excludes future bars and late metadata without substituting invented fundamentals', () => {
    const source = data('A', [10, 12, 1000]);
    const metadata: HeatmapMetadata[] = [{ instrumentId: source.instrument.id, marketCap: 5000, aum: null, currency: 'USD', sector: 'Reported sector', fundAssetClass: null, asOf: 100, availableAt: 250, source: 'Local dated report' }];
    const result = calculateHeatmap([source], { ...settings(), knowledgeCutoff: 200, size: 'market-cap', grouping: 'sector' }, metadata, 1000);
    expect(result.items[0]).toMatchObject({ price: 12, priceTime: 200, sizeValue: null, group: 'Sector unavailable' });
    expect(result.items[0].colorValue).toBeCloseTo(20, 12);
    expect(calculateHeatmap([source], { ...settings(), knowledgeCutoff: 250, size: 'market-cap', grouping: 'sector' }, metadata, 1000).items[0]).toMatchObject({ sizeValue: 5000, group: 'Reported sector', metadataAsOf: 100 });
  });
  it('rejects mixed monetary units but preserves price currency separately from metadata currency', () => {
    const a = data('A', [10, 12]), b = data('B', [20, 18]); b.instrument.currency = 'EUR';
    const mixed = calculateHeatmap([a, b], { ...settings(), size: 'turnover', monoSize: false }, [], 1000);
    expect(mixed.items).toHaveLength(0); expect(mixed.unavailable).toHaveLength(2); expect(mixed.diagnostics[0]).toContain('different currencies');
    const single = calculateHeatmap([a, b], { ...settings(), size: 'turnover', currency: 'EUR' }, [], 1000);
    expect(single.items.map(row => row.symbol)).toEqual(['B']); expect(single.coverage.excluded).toBe(1);
    const metadata: HeatmapMetadata[] = [{ instrumentId: a.instrument.id, marketCap: 500, aum: null, currency: 'EUR', sector: null, fundAssetClass: null, asOf: 100, availableAt: 100, source: 'Local' }];
    expect(calculateHeatmap([a], { ...settings(), size: 'market-cap', currency: 'EUR' }, metadata, 1000).items[0]).toMatchObject({ currency: 'EUR', priceCurrency: 'USD', sizeValue: 500, price: 12 });
  });
  it('preserves chosen metric sort in mono-size and stable legend boundaries while hiding ranges', () => {
    const rows = [data('A', [10, 12], [100, 500]), data('B', [10, 8], [100, 100]), data('C', [10, 10], [100, 200])];
    const result = calculateHeatmap(rows, settings(), [], 1000);
    expect(result.items.map(row => row.symbol)).toEqual(['A', 'C', 'B']);
    const hidden = calculateHeatmap(rows, { ...settings(), hiddenBins: [result.items[0].bin!] }, [], 1000);
    expect(hidden.items.map(row => row.symbol)).toEqual(['C', 'B']); expect(hidden.coverage.hidden).toBe(1);
    expect(hidden.bins.map(bin => [bin.lower, bin.upper, bin.count])).toEqual(result.bins.map(bin => [bin.lower, bin.upper, bin.count]));
    expect(result.items.find(row => row.symbol === 'C')!.bin).toBe(3);
  });
  it('keeps immutable input/provenance, supported universe counts, group zoom and resolution warnings', () => {
    const rows = [data('A', [10, 12]), data('SPY', [20, 19]), data('FUT', [15, 16])]; rows[2].instrument.assetClass = 'future'; rows[1].resolution = '1h';
    const before = structuredClone(rows); const result = calculateHeatmap(rows, { ...settings(), grouping: 'instrument-type' }, [], 1000);
    expect(result.groups).toEqual(['etf', 'stock']); expect(result.coverage.excluded).toBe(1); expect(result.diagnostics.join(' ')).toContain('resolutions differ');
    result.items[0].provenance.notes.push('output only'); expect(rows).toEqual(before);
    expect(calculateHeatmap(rows, { ...settings(), grouping: 'instrument-type', zoomGroup: 'etf' }, [], 1000).items.map(row => row.symbol)).toEqual(['SPY']);
  });
});
describe('heatmap geometry, draft cancellation and persistence boundaries', () => {
  it('allocates independent area ratios without gaps or overlaps', () => {
    const rects = layoutHeatmap([{ id: 'A', weight: 3 }, { id: 'B', weight: 1 }, { id: 'C', weight: 2 }], 600, 400);
    rects.forEach((row, index) => expect(row.width * row.height).toBeCloseTo([120000, 40000, 80000][index], 8));
    for (const r of rects) { expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0); expect(r.x + r.width).toBeLessThanOrEqual(600); expect(r.y + r.height).toBeLessThanOrEqual(400); }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; expect(Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))).toBe(0); }
    expect(layoutHeatmap([], 600, 400)).toEqual([]); expect(layoutHeatmap([{ id: 'A', weight: 1 }], 0, 400)).toEqual([]);
  });
  it('rejects invalid and unrepresentable numeric geometry rather than producing NaN tiles', () => {
    for (const weights of [[0], [-1], [Infinity], [1, 1e-300]]) expect(() => layoutHeatmap(weights.map((weight, id) => ({ id: String(id), weight })), 500, 400)).toThrow();
    expect(() => layoutHeatmap([{ id: 'A', weight: 1 }, { id: 'A', weight: 2 }], 500, 400)).toThrow();
  });
  it('roundtrips cloned state, validates imports and leaves original state untouched when draft is discarded', () => {
    const original = createHeatmapState(), draft = restoreHeatmapState(JSON.parse(JSON.stringify(original)));
    draft.settings.hiddenBins.push(1); draft.settings.bars = 3;
    expect(original).toEqual(createHeatmapState()); expect(restoreHeatmapState(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    for (const invalid of [{ ...draft.settings, bars: 0 }, { ...draft.settings, hiddenBins: [1, 1] }, { ...draft.settings, size: { toString: () => 'volume' } }]) expect(() => restoreHeatmapState({ ...draft, settings: invalid })).toThrow();
    expect(() => calculateHeatmap([data('A', [10]), data('A', [12])], settings())).toThrow('Ambiguous');
    const unsorted = data('B', [10, 12]); unsorted.bars.reverse(); expect(() => calculateHeatmap([unsorted], settings())).toThrow('ordered');
  });
  it('filters resolutions before duplicate checks and persists explicit same-resolution source choices', () => {
    const daily = data('A', [10, 12]), minute = data('A', [10, 20]); minute.resolution = '1m';
    expect(calculateHeatmap([daily, minute], { ...settings(), resolution: '1D' }, [], 1000).items[0].price).toBe(12);
    const second = data('A', [10, 30]); second.provenance.providerId = 'second-source';
    expect(() => calculateHeatmap([daily, second], settings(), [], 1000)).toThrow('Ambiguous');
    const state = createHeatmapState(); state.settings.datasetSelections[daily.instrument.id] = heatmapDatasetKey(second);
    const restored = restoreHeatmapState(JSON.parse(JSON.stringify(state))), result = calculateHeatmap([daily, second], restored.settings, [], 1000);
    expect(result.items[0].price).toBe(30); expect(result.coverage).toMatchObject({ datasets: 2, supplied: 1, eligible: 1 });
    expect(heatmapSelectedDataset(result.items[0], [daily, second])).toBe(second);
  });
});
