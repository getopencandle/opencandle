import { describe, expect, it } from 'vitest';
import { runScreener, validateScreenerColumn, type ScreenerColumn } from '../../src/domain/screener';
import { runSavedScreener, createScreenerSettings } from '../../src/domain/screener-state';
import { screenerEarningsIndex } from '../../src/domain/screener-earnings';
import { SCREENER_COLUMN_SETS, applyScreenerColumnSet } from '../../src/domain/screener-presets';
import type { CalendarDocument, CalendarEvent } from '../../src/domain/calendar';
import type { Bar, BarDataset } from '../../src/domain/types';

const dataset = (symbol: string, bars: Bar[], extra: { resolution?: string; timezone?: string; session?: BarDataset['provenance']['session']; fixture?: boolean; id?: string } = {}): BarDataset => ({
  instrument: { id: extra.id ?? 'NASDAQ:' + symbol, symbol, name: symbol, exchange: 'NASDAQ', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: extra.timezone ?? 'America/New_York' },
  bars, resolution: extra.resolution ?? '1D',
  provenance: { providerId: 'test', providerName: 'Test import', datasetId: 'test:' + symbol, fixture: extra.fixture ?? false, coverage: bars.length + ' rows', asOf: 0, delaySeconds: null, adjustment: 'raw', session: extra.session ?? 'regular', timezone: 'UTC', state: 'ready', license: 'test', revision: 'r1', notes: [] },
} as BarDataset);
const ny = (date: string, time: string) => Date.parse(`${date}T${time}:00-04:00`) / 1000;
const bar = (time: number, open: number, close: number, volume = 100): Bar => ({ time, open, high: Math.max(open, close) + 1, low: Math.min(open, close) - 1, close, volume });
const col = (metric: string, parameters?: Record<string, unknown>): ScreenerColumn => ({ id: metric, metric, ...(parameters ? { parameters } : {}) });
const value = (data: BarDataset, column: ScreenerColumn, context = {}) => runScreener([data], [column], [], undefined, context).rows[0].cells[column.id];

describe('change from open and gap', () => {
  const day = (i: number) => 86400 * (20000 + i);
  const data = dataset('DLY', [bar(day(0), 9, 10), bar(day(1), 10.5, 11.55)]);
  it('change from open uses the last row open, gap uses the previous close', () => {
    expect(value(data, col('changeFromOpen')).value).toBeCloseTo(1.05);
    expect(value(data, col('changeFromOpenPercent')).value).toBeCloseTo(10);
    expect(value(data, col('changeFromOpenPercent')).previous).toBeCloseTo(100 / 9);
    expect(value(data, col('gapPercent')).value).toBeCloseTo(5);
  });
  it('gap needs a previous row and is never zero-filled', () => {
    const cell = value(dataset('ONE', [bar(day(0), 9, 10)]), col('gapPercent'));
    expect(cell.state).toBe('insufficient-history'); expect(cell.value).toBeNull();
  });
});

describe('pre-market, post-market and relative volume at time', () => {
  const rows = [
    bar(ny('2026-10-19', '09:30'), 99, 100, 1000), bar(ny('2026-10-19', '10:00'), 100, 101, 1000), bar(ny('2026-10-19', '15:55'), 101, 102, 500),
    bar(ny('2026-10-20', '08:00'), 103, 104, 200), bar(ny('2026-10-20', '09:00'), 104, 105, 300),
    bar(ny('2026-10-20', '09:30'), 105, 106, 3000), bar(ny('2026-10-20', '10:00'), 106, 107, 1000),
    bar(ny('2026-10-20', '16:30'), 107, 110, 50),
  ];
  const data = dataset('EXT', rows, { resolution: '5m', session: 'extended' });
  it('pre-market change compares the last pre-market close with the previous regular close', () => {
    expect(value(data, col('preMarketChangePercent')).value).toBeCloseTo(100 * (105 / 102 - 1));
    expect(value(data, col('preMarketVolume')).value).toBe(500);
  });
  it('post-market change compares with the same date regular close', () => {
    expect(value(data, col('postMarketChangePercent')).value).toBeCloseTo(100 * (110 / 107 - 1));
    expect(value(data, col('postMarketVolume')).value).toBe(50);
  });
  it('relative volume at time compares cumulative regular volume up to the same time of day', () => {
    expect(value(data, col('relativeVolumeAtTime', { length: 1 })).value).toBeCloseTo(4000 / 2000);
    expect(value(data, col('relativeVolumeAtTime', { length: 2 })).state).toBe('insufficient-history');
  });
  it('is unavailable without extended rows, intraday rows or the US calendar', () => {
    expect(value(dataset('REG', rows, { resolution: '5m', session: 'regular' }), col('preMarketChangePercent')).reason).toContain('extended-hours');
    expect(value(dataset('DAY', rows, { resolution: '1D', session: 'extended' }), col('postMarketVolume')).reason).toContain('intraday');
    expect(value(dataset('LON', rows, { resolution: '5m', session: 'extended', timezone: 'Europe/London' }), col('preMarketVolume')).reason).toContain('US equity calendar');
    const noPre = value(dataset('NOPRE', rows.filter((_, i) => i !== 3 && i !== 4), { resolution: '5m', session: 'extended' }), col('preMarketChangePercent'));
    expect(noPre.state).toBe('unavailable'); expect(noPre.reason).toContain('No pre-market rows on 2026-10-20');
  });
  it('validates the relative volume at time length', () => {
    expect(validateScreenerColumn(col('relativeVolumeAtTime', { length: 10 }))).toBeNull();
    expect(validateScreenerColumn(col('relativeVolumeAtTime', { lenght: 10 }))).toContain('unsupported parameter');
  });
});

describe('earnings date filters', () => {
  const last = Date.parse('2026-10-20T00:00:00Z') / 1000;
  const data = dataset('SYNA', [bar(last - 86400, 10, 11), bar(last, 11, 12)]);
  const event = (id: string, date: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, revision: 1, kind: 'earnings', title: id, description: '', date, time: null, timezone: null, timing: 'date-only', symbol: 'SYNA', instrumentId: null, country: null, category: null, importance: null, status: 'scheduled', publishedAt: null, fiscalPeriod: null, exDate: null, payDate: null, exchange: null, values: {}, ...extra });
  const document = (events: CalendarEvent[], fixture = false): CalendarDocument => ({ schemaVersion: 1, id: fixture ? 'synthetic' : 'import', provenance: { kind: fixture ? 'synthetic' : 'local-import', label: 'test', sourceUrl: null, importedAt: 0, license: 'test', fixture }, events });
  const documents = [
    document([event('next', '2026-10-23'), event('past', '2026-07-20'), event('gone', '2026-10-21', { revision: 2, status: 'cancelled' }), event('gone', '2026-10-21'), event('other', '2026-10-22', { symbol: 'OTHER' }), event('div', '2026-10-21', { kind: 'dividend' })]),
    document([event('synthetic', '2026-10-20')], true),
  ];
  const earningsOf = screenerEarningsIndex(documents);
  it('counts days to the next and since the latest supplied earnings date', () => {
    expect(earningsOf(data)).toEqual(['2026-07-20', '2026-10-23']);
    expect(value(data, col('earningsUpcomingDays'), { earningsOf }).value).toBe(3);
    expect(value(data, col('earningsRecentDays'), { earningsOf }).value).toBe(92);
  });
  it('matches by instrument id or by ticker with the same synthetic status', () => {
    expect(earningsOf(dataset('SYNA', data.bars, { fixture: true }))).toEqual(['2026-10-20']);
    const byId = screenerEarningsIndex([document([event('id', '2026-11-02', { symbol: null, instrumentId: 'NASDAQ:ZZZ' })])]);
    expect(byId(dataset('ZZZ', data.bars))).toEqual(['2026-11-02']);
  });
  it('is unavailable without a calendar or a matching event, never zero', () => {
    expect(value(data, col('earningsUpcomingDays')).reason).toContain('No local calendar');
    const none = value(dataset('NONE', data.bars), col('earningsUpcomingDays'), { earningsOf });
    expect(none.value).toBeNull(); expect(none.reason).toContain('No supplied earnings event');
    expect(value(dataset('SYNA', [bar(Date.parse('2026-12-01T00:00:00Z') / 1000, 5, 6)]), col('earningsUpcomingDays'), { earningsOf }).reason).toContain('on or after 2026-12-01');
  });
  it('runSavedScreener connects calendar documents to a between filter', () => {
    const settings = { ...createScreenerSettings(), columns: [col('symbol'), col('earningsUpcomingDays')], filters: [{ id: 'soon', columnId: 'earningsUpcomingDays', operator: 'between' as const, value: [0, 7], active: true }], sort: { columnId: 'symbol', direction: 'asc' as const } };
    const datasets = [data, dataset('NONE', data.bars)];
    const connected = runSavedScreener(datasets, settings, null, documents).result;
    expect(connected.rows.map(row => row.symbol)).toEqual(['SYNA']); expect(connected.unknownRows.map(row => row.symbol)).toEqual(['NONE']);
    expect(connected.policies.join(' ')).toContain('local Calendar documents only');
    expect(runSavedScreener(datasets, settings, null).result.rows).toEqual([]);
  });
});

describe('column sets', () => {
  it('every set validates and runs', () => {
    for (const set of SCREENER_COLUMN_SETS) {
      for (const column of set.columns) expect(validateScreenerColumn(column), `${set.id}:${column.id}`).toBeNull();
      expect(runScreener([dataset('RUN', [bar(86400, 1, 2), bar(172800, 2, 3)])], set.columns).diagnostics, set.id).toEqual([]);
    }
  });
  it('moves matching filters and sort to the set columns and keeps unmatched filter columns', () => {
    let n = 0; const id = () => 'n' + n++;
    const current = { columns: [col('symbol'), col('rsi', { source: 'close', length: 14 }), col('flag'), col('volume')], filters: [{ id: 'f1', columnId: 'rsi', operator: 'lte' as const, value: 30, active: true }, { id: 'f2', columnId: 'flag', operator: 'eq' as const, value: 'red', active: true }], sort: { columnId: 'symbol', direction: 'desc' as const } };
    const next = applyScreenerColumnSet(SCREENER_COLUMN_SETS.find(set => set.id === 'oscillators')!, current, id);
    expect(next.columns.map(column => column.metric)).toEqual(['symbol', 'last', 'rsi', 'macd', 'atrPercent', 'rating', 'flag']);
    expect(next.filters.map(item => next.columns.find(column => column.id === item.columnId)?.metric)).toEqual(['rsi', 'flag']);
    expect(next.sort).toEqual({ columnId: next.columns[0].id, direction: 'desc' });
    expect(next.columns.some(column => column.metric === 'volume')).toBe(false);
  });
});
