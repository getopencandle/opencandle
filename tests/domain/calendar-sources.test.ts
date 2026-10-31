// Calendar auto-fill builders. The Alpaca bridge is always a mock here; no key, endpoint or network is used.
// Facts come from the SYNTHETIC statement fixture.
import { describe, expect, it, vi } from 'vitest';
import { AUTO_DIVIDEND_DOCUMENT_ID, AUTO_EARNINGS_DOCUMENT_ID, AUTO_EARNINGS_NEEDS_DATA, dividendsToCalendarDocument, earningsFromFacts, fetchDividendDocument, selectDividendSymbols } from '../../src/domain/calendar-sources';
import { createCalendarState, queryCalendar } from '../../src/domain/calendar';
import type { ChartEventsResult, CorporateActionsValue } from '../../src/domain/chart-events';
import { normalizeCompanyFacts, type FactsDocument } from '../../src/fundamentals/company-facts';
import { syntheticSource, syntheticStatementFacts } from '../fundamentals/fixtures/synthetic-statements';

const NOW = Date.parse('2026-06-10T12:00:00Z') / 1000;
function actions(symbol: string, synthetic = false): CorporateActionsValue {
  return {
    schemaVersion: 1, symbol, retrievedAt: '2026-06-10T00:00:00Z', cached: false, stale: false, synthetic,
    provenance: { provider: 'Alpaca', kind: 'owner-key', source: 'corporate-actions', license: 'owner key' },
    events: [
      { id: 'd1', kind: 'cash-dividend', symbol, exDate: '2026-05-01', recordDate: '2026-05-02', payableDate: '2026-05-15', processDate: null, amount: 0.25, currency: 'USD' },
      { id: 'd2', kind: 'cash-dividend', symbol, exDate: '2026-08-01', recordDate: null, payableDate: null, processDate: null, amount: 0.3, currency: 'USD', special: true },
      { id: 's1', kind: 'forward-split', symbol, exDate: '2026-01-05', recordDate: null, payableDate: null, processDate: null, oldRate: 1, newRate: 4 },
    ],
  };
}
const ok = (value: CorporateActionsValue): ChartEventsResult => ({ ok: true, value });

describe('dividend auto-fill (Alpaca owner key, mocked)', () => {
  it('turns cash dividends into one calendar document and ignores splits', () => {
    const document = dividendsToCalendarDocument([actions('AAPL')], NOW)!;
    expect(document.id).toBe(AUTO_DIVIDEND_DOCUMENT_ID);
    expect(document.events).toHaveLength(2); expect(document.events.every(event => event.kind === 'dividend')).toBe(true);
    expect(document.events.map(event => event.status).sort()).toEqual(['released', 'scheduled']);
    const first = document.events.find(event => event.exDate === '2026-05-01')!;
    expect(first).toMatchObject({ symbol: 'AAPL', exDate: '2026-05-01', payDate: '2026-05-15', date: '2026-05-01' });
    expect(first.values.dividendAmount).toEqual({ value: 0.25, unit: 'USD', availableAt: null });
    expect(document.provenance).toMatchObject({ kind: 'local-import', fixture: false });
    expect(document.provenance.label).toContain('Alpaca');
  });
  it('labels stub data SYNTHETIC and queries like any imported calendar', () => {
    const document = dividendsToCalendarDocument([actions('AAPL', true)], NOW)!;
    expect(document.provenance).toMatchObject({ kind: 'synthetic', fixture: true }); expect(document.events[0].title).toContain('SYNTHETIC');
    const query = { ...createCalendarState().query, kind: 'dividend' as const, symbols: ['AAPL'] };
    const result = queryCalendar([document], query, NOW);
    expect(result.rows).toHaveLength(2);
  });
  it('returns null when no dividend exists', () => {
    const none = actions('AAPL'); none.events = none.events.filter(event => event.kind !== 'cash-dividend');
    expect(dividendsToCalendarDocument([none], NOW)).toBeNull();
  });
  it('selects US symbols, de-duplicates, caps and reports the rest', () => {
    const picked = selectDividendSymbols(['aapl', 'AAPL', 'BRK.B', 'BTCUSD:X', '', 'MSFT', 'TOOLONGSYMBOL'], 3);
    expect(picked.symbols).toEqual(['AAPL', 'BRK.B', 'MSFT']);
    expect(picked.skipped.map(row => row.symbol)).toEqual(['BTCUSD:X', 'TOOLONGSYMBOL']);
    expect(selectDividendSymbols(['A', 'B', 'C'], 2).skipped[0].reason).toContain('2-symbol limit');
  });
  it('fetches one symbol at a time through the bridge and keeps failures as skipped rows', async () => {
    const bridge = vi.fn(async ({ symbol }: { requestId: string; symbol: string }): Promise<ChartEventsResult> => symbol === 'FAIL' ? { ok: false, error: { code: 'X', message: 'No key saved.' } } : ok(actions(symbol)));
    const report = await fetchDividendDocument(bridge, ['AAPL', 'FAIL', 'MSFT'], { now: NOW });
    expect(bridge).toHaveBeenCalledTimes(3); expect(bridge.mock.calls.map(call => call[0].symbol)).toEqual(['AAPL', 'FAIL', 'MSFT']);
    expect(new Set(bridge.mock.calls.map(call => call[0].requestId)).size).toBe(3);
    expect(report.used).toEqual(['AAPL', 'MSFT']); expect(report.skipped).toEqual([{ symbol: 'FAIL', reason: 'No key saved.' }]);
    expect(report.document!.events).toHaveLength(4); expect(report.message).toContain('4 dividend events for 2 symbols; 1 skipped');
  });
  it('explains itself without a bridge and stops when asked', async () => {
    expect((await fetchDividendDocument(undefined, ['AAPL'], { now: NOW })).message).toContain('desktop app');
    const bridge = vi.fn(async ({ symbol }: { requestId: string; symbol: string }) => ok(actions(symbol)));
    let stop = false; const report = await fetchDividendDocument(async input => { stop = true; return bridge(input); }, ['AAPL', 'MSFT'], { now: NOW, shouldStop: () => stop });
    expect(bridge).toHaveBeenCalledTimes(1); expect(report.used).toEqual(['AAPL']);
    expect((await fetchDividendDocument(bridge, ['BTCUSD:X'], { now: NOW })).message).toContain('No US stock symbols');
  });
  it('a thrown bridge error is a skipped symbol, not a crash', async () => {
    const report = await fetchDividendDocument(async () => { throw new Error('IPC closed'); }, ['AAPL'], { now: NOW });
    expect(report.document).toBeNull(); expect(report.skipped[0].reason).toBe('IPC closed');
  });
});

describe('past reported earnings from saved SEC facts', () => {
  const document = (id = 'facts-1'): FactsDocument => ({ id, facts: normalizeCompanyFacts(syntheticStatementFacts()), source: syntheticSource });
  const link = (symbol = 'SYN', documentId = 'facts-1') => ({ exchange: 'SYNTHETIC', symbol, synthetic: true, documentId });
  it('builds one released event per reported quarter, dated by filing, with only the values that exist', () => {
    const report = earningsFromFacts([document()], [link()], null, NOW);
    expect(report.document!.id).toBe(AUTO_EARNINGS_DOCUMENT_ID); expect(report.used).toEqual(['SYN']);
    const byDate = Object.fromEntries(report.document!.events.map(event => [event.date, event]));
    expect(Object.keys(byDate).sort()).toEqual(['2024-06-05', '2024-09-05', '2024-12-05']);
    expect(byDate['2024-06-05'].values.revenueActual).toMatchObject({ value: 280, unit: 'USD' });
    expect(byDate['2024-06-05'].values.epsActual).toBeUndefined();
    expect(byDate['2024-12-05'].values.epsActual).toMatchObject({ value: 0.3, unit: 'USD/shares' });
    expect(byDate['2024-12-05'].values.revenueActual!.value).toBe(320);
    expect(byDate['2024-12-05']).toMatchObject({ kind: 'earnings', status: 'released', symbol: 'SYN', timing: 'date-only', fiscalPeriod: 'Quarter ended 2024-10-31' });
    expect(byDate['2024-12-05'].values.epsActual!.availableAt).toBe(Date.parse('2024-12-05T00:00:00Z') / 1000);
  });
  it('is labelled SYNTHETIC for a synthetic facts fixture and shows no estimate', () => {
    const report = earningsFromFacts([document()], [link()], null, NOW);
    expect(report.document!.provenance).toMatchObject({ kind: 'synthetic', fixture: true });
    expect(report.document!.events.every(event => event.values.epsForecast === undefined && event.values.revenueForecast === undefined)).toBe(true);
    const rows = queryCalendar([report.document!], { ...createCalendarState().query, kind: 'earnings' }, NOW).rows;
    expect(rows).toHaveLength(3); expect(rows[0].provenance.fixture).toBe(true);
  });
  it('limits to the wanted symbols and reports missing documents and unlinked work', () => {
    expect(earningsFromFacts([document()], [link()], ['OTHER'], NOW).document).toBeNull();
    const missing = earningsFromFacts([], [link()], null, NOW);
    expect(missing.document).toBeNull(); expect(missing.skipped[0].reason).toContain('removed'); expect(missing.message).toBe(AUTO_EARNINGS_NEEDS_DATA);
    expect(earningsFromFacts([document()], [], null, NOW).message).toContain('link');
  });
  it('refuses a link that mixes synthetic and real filing data', () => {
    const report = earningsFromFacts([document()], [{ ...link(), synthetic: false }], null, NOW);
    expect(report.document).toBeNull(); expect(report.skipped[0].reason).toContain('mixes');
  });
});
