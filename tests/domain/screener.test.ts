import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { removeScreenerFilter, resetScreenerFilter, runScreener, screenerToCsv } from '../../src/domain/screener';
import type { ScreenerColumn, ScreenerFilter } from '../../src/domain/screener';
import type { BarDataset } from '../../src/domain/types';

function dataset(symbol: string, closes: number[], volumes = closes.map(() => 100)): BarDataset {
  const data = fixtureDataset(symbol, 0); data.provenance.session = 'regular';
  data.bars = closes.map((close, i) => ({ time: i * 86400, open: close, high: close + 1, low: close - 1, close, volume: volumes[i] }));
  return data;
}
const simple: ScreenerColumn[] = [{ id: 'symbol', metric: 'symbol' }, { id: 'last', metric: 'last' }, { id: 'change', metric: 'change' }, { id: 'percent', metric: 'changePercent' }];
const filter = (operator: ScreenerFilter['operator'], value: ScreenerFilter['value'], columnId = 'last'): ScreenerFilter => ({ id: 'filter', columnId, operator, value, active: true });

describe('calculated screener universe', () => {
  it('computes actual values for every supplied symbol with no hard-coded acceptance names', () => {
    const result = runScreener([dataset('ARBITRARY', [10, 12]), dataset('SECOND', [20, 18]), dataset('FLAT', [15, 15])], simple, [], { columnId: 'last', direction: 'desc' });
    expect(result.diagnostics).toEqual([]); expect(result.rows.map(r => r.symbol)).toEqual(['SECOND', 'FLAT', 'ARBITRARY']);
    const row = result.rows.find(r => r.symbol === 'ARBITRARY')!;
    expect(row.cells.last.value).toBe(12); expect(row.cells.change.value).toBe(2); expect(row.cells.percent.value).toBeCloseTo(20, 12);
    expect(result.coverage).toMatchObject({ universe: 3, evaluated: 3, matched: 3, fixtures: 3 });
    expect(row.provenance.fixture).toBe(true); expect(row.adjustment).toBe('raw');
  });
  it('calculates independent average and relative-volume denominators', () => {
    const columns: ScreenerColumn[] = [{ id: 'average', metric: 'averageVolume', parameters: { length: 2 } }, { id: 'relative', metric: 'relativeVolume', parameters: { length: 2 } }];
    const result = runScreener([dataset('VOLUME', [10, 11, 12], [100, 200, 450])], columns);
    expect(result.rows[0].cells.average.value).toBe(325);
    expect(result.rows[0].cells.relative.value).toBe(3);
    const extended = dataset('EXTENDED', [10, 11, 12]); extended.provenance.session = 'extended';
    expect(runScreener([extended], columns).rows[0].cells.average.state).toBe('unavailable');
  });
  it('distinguishes a confirmed empty result from missing inputs', () => {
    const result = runScreener([dataset('EMPTY', []), dataset('SMALL', [5, 7]), dataset('MATCH', [30, 35])], simple, [filter('gt', 20)]);
    expect(result.rows.map(r => r.symbol)).toEqual(['MATCH']); expect(result.unknownRows.map(r => r.symbol)).toEqual(['EMPTY']);
    expect(result.coverage).toMatchObject({ universe: 3, matched: 1, excluded: 1, unavailablePredicate: 1 });
    const empty = runScreener([dataset('SMALL', [5, 7])], simple, [filter('gt', 20)]);
    expect(empty.rows).toEqual([]); expect(empty.unknownRows).toEqual([]); expect(empty.coverage.excluded).toBe(1);
  });
  it('supports independent parameterized column instances and sort binding', () => {
    const columns: ScreenerColumn[] = [{ id: 'sma2', metric: 'sma', parameters: { length: 2 } }, { id: 'sma3', metric: 'sma', parameters: { length: 3 } }];
    const data = dataset('SMA', [2, 4, 6]);
    const first = runScreener([data], columns, [filter('gt', 4.5, 'sma2')], { columnId: 'sma2', direction: 'asc' });
    expect(first.rows[0].cells.sma2.value).toBe(5); expect(first.rows[0].cells.sma3.value).toBe(4);
    const changed = runScreener([data], [columns[0], { ...columns[1], parameters: { length: 1 } }], [filter('gt', 4.5, 'sma2')]);
    expect(changed.rows[0].cells.sma2.value).toBe(5); expect(changed.rows[0].cells.sma3.value).toBe(6);
  });
  it('computes percent performance and window extremes without fabricated history', () => {
    const columns: ScreenerColumn[] = [{ id: 'performance', metric: 'performance', parameters: { length: 2 } }, { id: 'high', metric: 'periodHigh', parameters: { length: 2 } }, { id: 'low', metric: 'periodLow', parameters: { length: 2 } }];
    const row = runScreener([dataset('PERFORMANCE', [10, 15, 12])], columns).rows[0];
    expect(row.cells.performance.value).toBeCloseTo(20, 12); expect(row.cells.high.value).toBe(16); expect(row.cells.low.value).toBe(11);
  });
});

describe('screener filters, resets, sorting and export', () => {
  it('implements numeric range boundaries, equality and set membership', () => {
    const data = [dataset('LOW', [5]), dataset('MID', [10]), dataset('HIGH', [15])];
    for (const [operator, value, expected] of [
      ['gt', 10, ['HIGH']], ['gte', 10, ['MID', 'HIGH']], ['lt', 10, ['LOW']], ['lte', 10, ['LOW', 'MID']], ['eq', 10, ['MID']], ['neq', 10, ['LOW', 'HIGH']], ['between', [5, 10], ['LOW', 'MID']], ['outside', [5, 10], ['HIGH']], ['in', [5, 15], ['LOW', 'HIGH']], ['not-in', [5, 15], ['MID']],
    ] as const) expect(runScreener(data, simple, [filter(operator, [...Array.isArray(value) ? value : []].length ? [...value as readonly number[]] : value as number)]).rows.map(r => r.symbol)).toEqual(expected);
  });
  it('compares text case-insensitively and crossings using prior supplied values', () => {
    const data = [dataset('ALPHA', [9, 11]), dataset('BETA', [11, 9]), dataset('ALPINE', [10, 10])];
    expect(runScreener(data, simple, [filter('contains', 'alp', 'symbol')]).rows.map(r => r.symbol)).toEqual(['ALPHA', 'ALPINE']);
    expect(runScreener(data, simple, [filter('starts-with', 'be', 'symbol')]).rows.map(r => r.symbol)).toEqual(['BETA']);
    expect(runScreener(data, simple, [filter('crosses-above', 10)]).rows.map(r => r.symbol)).toEqual(['ALPHA']);
    expect(runScreener(data, simple, [filter('crosses-below', 10)]).rows.map(r => r.symbol)).toEqual(['BETA']);
  });
  it('keeps reset chip identity while remove deletes it, without result differences', () => {
    const data = [dataset('ONE', [10]), dataset('TWO', [20]), dataset('MISSING', [])], filters = [filter('gt', 15)];
    const reset = resetScreenerFilter(filters, 'filter'), removed = removeScreenerFilter(filters, 'filter');
    expect(reset).toHaveLength(1); expect(reset[0].active).toBe(false); expect(removed).toEqual([]);
    expect(runScreener(data, simple, reset).rows).toEqual(runScreener(data, simple, removed).rows);
    expect(filters[0].active).toBe(true);
    expect(runScreener(data, simple, reset).rows).toEqual(runScreener(data, simple, removeScreenerFilter(reset, 'filter')).rows);
  });
  it('sorts unavailable values last in both directions and validates identities/parameters', () => {
    const data = [dataset('MISSING', []), dataset('ONE', [10]), dataset('TWO', [20])];
    for (const direction of ['asc', 'desc'] as const) expect(runScreener(data, simple, [], { columnId: 'last', direction }).rows.at(-1)!.symbol).toBe('MISSING');
    expect(runScreener(data, [simple[0], simple[0]]).diagnostics[0].code).toBe('COLUMN_ID');
    expect(runScreener(data, simple, [filter('between', [10, 5])]).diagnostics[0].code).toBe('FILTER_VALUE');
    expect(runScreener(data, simple, [filter('gt', '5')]).diagnostics[0].code).toBe('FILTER_VALUE');
    expect(runScreener(data, simple, [filter('gt', 10, 'missing')]).diagnostics[0].code).toBe('FILTER_COLUMN');
    expect(runScreener([data[0], data[0]], simple).diagnostics[0].code).toBe('UNIVERSE_ID');
  });
  it('neutralizes formula-looking text in exported spreadsheets', () => {
    const columns: ScreenerColumn[] = [{ id: 'name', metric: 'name', label: '=danger' }, { id: 'last', metric: 'last' }];
    const data = dataset('SAFE', [10]); data.instrument.name = '=HYPERLINK("https://example.invalid")';
    const csv = screenerToCsv(runScreener([data], columns), columns);
    expect(csv.startsWith("'=danger,last\n")).toBe(true); expect(csv).toContain("'=HYPERLINK"); expect(csv).toContain(',10');
  });
});
