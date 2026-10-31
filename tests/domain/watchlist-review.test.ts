import { describe, expect, it } from 'vitest';
import { addWatchSymbols, createWatchBook, referenceFromDataset, rebindWatchRow, restoreWatchBook } from '../../src/watchlists/model';
import { watchQuote } from '../../src/watchlists/quotes';
import { fixtureDataset } from '../../src/domain/fixtures';
import { aggregateInterval, createIntervalMenuState } from '../../src/domain/intervals';
import { allChartsDataset, ensureWorkspaceGrid } from '../../src/ui/workspace-grid';
import type { ChartWorkspace } from '../../src/ui/workspace-grid';
import type { BarDataset } from '../../src/domain/types';
import { defaultTheme } from '../../src/ui/themes';

/** These are synthetic numerical cases for the imported-data namespace, not actual prices. */
function supplied(id: string, resolution = '1D'): BarDataset {
  const data = fixtureDataset('TEST', 2);
  data.instrument = { ...data.instrument, id: 'TESTX:TEST', exchange: 'TESTX', currency: 'USD' };
  data.resolution = resolution;
  data.provenance = { ...data.provenance, datasetId: id, providerId: 'synthetic-review-import', providerName: 'Synthetic review input', fixture: false, session: 'regular', adjustment: 'raw', timezone: 'UTC', coverage: 'Synthetic numerical test rows only' };
  data.bars = [{ time: 86400, open: 100, high: 101, low: 99, close: 100, volume: 1000 }, { time: 172800, open: 90, high: 91, low: 89, close: 90, volume: 3000 }];
  return data;
}

describe('independent watchlist source and calculation review', () => {
  it('retains a valid long derived dataset identity through addition and local restore', () => {
    const original = fixtureDataset('TEST', 20);
    original.provenance.datasetId = 'source-with-a-valid-long-identity-' + 'a'.repeat(180);
    const derived = aggregateInterval(original, '1W', createIntervalMenuState().policy).dataset;
    expect(derived.provenance.datasetId.length).toBeGreaterThan(300);
    const initial = createWatchBook([]), added = addWatchSymbols(initial, initial.activeId, [referenceFromDataset(derived)], () => 'derived-row');
    const saved = restoreWatchBook(JSON.parse(JSON.stringify(added)));
    expect(watchQuote((saved.lists[0].rows[0] as Extract<typeof saved.lists[0]['rows'][number], { kind: 'symbol' }>).reference, [derived]).dataset).toBe(derived);
    expect(initial.lists[0].rows).toEqual([]);
  });
  it('computes a separate daily -10 and -10 percent without replacing the primary last123', () => {
    const primary = supplied('minute', '1m'), daily = supplied('daily'); primary.bars[1] = { ...primary.bars[1], high: 124, close: 123 };
    const reference = { ...referenceFromDataset(primary), dailyDatasetId: daily.provenance.datasetId };
    const quote = watchQuote(reference, [primary, daily]);
    expect(quote.last).toBe(123); expect(quote.change).toBe(-10); expect(quote.changePercent).toBe(-10); expect(quote.volume).toBe(3000);
    expect(quote.dataset).toBe(primary); expect(quote.dailyDataset).toBe(daily); expect(quote.reason).toContain('Daily change and volume use the daily bars');
    const mismatch = structuredClone(daily); mismatch.provenance.adjustment = 'split-adjusted';
    expect(watchQuote(reference, [primary, mismatch])).toMatchObject({ last: 123, change: null, changePercent: null, volume: null, dailyBasis: false });
  });
  it('does not infer a pre/post-market quote from an extended-session dataset label', () => {
    const primary = supplied('extended-without-per-bar-session', '1m'); primary.provenance.session = 'extended';
    expect(watchQuote(referenceFromDataset(primary), [primary]).extended).toBeNull();
  });
  it('rejects an invalid daily-companion choice without losing the valid binding', () => {
    const primary = supplied('minute', '1m'), daily = supplied('daily'), invalid = supplied('other-minute', '1m');
    const initial = createWatchBook([]), added = addWatchSymbols(initial, initial.activeId, [{ ...referenceFromDataset(primary), dailyDatasetId: daily.provenance.datasetId }], () => 'source-row');
    const before = JSON.stringify(added);
    expect(() => rebindWatchRow(added, added.activeId, 'source-row', invalid, true, [primary, daily, invalid])).toThrow();
    const wrongProvider = supplied('wrong-provider-daily'); wrongProvider.provenance.providerId = 'another-source';
    const wrongCurrency = supplied('wrong-currency-daily'); wrongCurrency.instrument.currency = 'EUR';
    for (const candidate of [wrongProvider, wrongCurrency]) expect(() => rebindWatchRow(added, added.activeId, 'source-row', candidate, true, [primary, daily, candidate])).toThrow();
    expect(JSON.stringify(added)).toBe(before);
  });
  it('refuses all-chart source changes when the only linked interval has a different data basis', () => {
    const base: ChartWorkspace = { symbol: 'GME', sourceId: null, imports: [], chartStyle: 'candles', themeId: defaultTheme.id, appearance: defaultTheme.appearance, chartOptions: { source: 'close', scale: 'linear', invert: false, auto: true, timezone: 'UTC' }, drawings: { version: 1, drawings: [] }, indicators: [], comparisons: [] };
    const selected = supplied('selected-daily'), otherMinute = supplied('other-minute', '1m');
    const oldMinute = fixtureDataset('GME', 2); oldMinute.resolution = '1m'; oldMinute.provenance.datasetId = 'old-minute';
    const state = ensureWorkspaceGrid(base), first = state.grid.layout.cells[0];
    state.grid.presetId = 'two-rows'; state.grid.layout.sync.interval = false;
    state.grid.layout.cells.push({ ...first, id: 'second', interval: '1m' }); state.grid.cells.second = { ...structuredClone(state.grid.cells[first.id]), datasetId: oldMinute.provenance.datasetId };
    const mismatches = [
      (data: BarDataset) => { data.provenance.providerId = 'different-provider'; },
      (data: BarDataset) => { data.instrument.currency = 'EUR'; },
      (data: BarDataset) => { data.provenance.adjustment = 'split-adjusted'; },
      (data: BarDataset) => { data.provenance.session = 'extended'; },
      (data: BarDataset) => { data.provenance.timezone = 'America/New_York'; },
    ];
    for (const mismatch of mismatches) {
      const candidate = structuredClone(otherMinute); mismatch(candidate); state.imports = [selected, oldMinute, candidate];
      const before = JSON.stringify(state);
      expect(() => allChartsDataset(state, selected)).toThrow(); expect(JSON.stringify(state)).toBe(before);
    }
  });
});
