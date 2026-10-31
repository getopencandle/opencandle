import { describe, expect, it } from 'vitest';
import { runScreener, type ScreenerColumn, type ScreenerFilter } from '../../src/domain/screener';
import { runSavedScreener, createScreenerSettings } from '../../src/domain/screener-state';
import { screenerFundamentalsIndex, SCREENER_FUNDAMENTAL_METRICS, type ScreenerFundamentalsSource } from '../../src/domain/screener-fundamentals';
import { SCREENER_COLUMN_SETS, SCREENER_PRESETS } from '../../src/domain/screener-presets';
import { formatScreenerCell, SCREENER_DASH } from '../../src/domain/screener-format';
import { normalizeCompanyFacts, type FactsDocument } from '../../src/fundamentals/company-facts';
import type { Bar, BarDataset } from '../../src/domain/types';

// SYNTHETIC facts only. Hand-worked expectations (fiscal year = calendar year):
//   FY2024 (10-K filed 2025-02-20): revenue 1200, gross 540, operating 300, pretax 270, net 240, D&A 60, dividends paid 80, diluted EPS 2.40
//   FY2023 (10-K filed 2024-02-15): revenue 1000, gross 400, operating 200, pretax 180, net 150, D&A 50, dividends paid 60, diluted EPS 1.50
//   DPS declared: four 2024 quarters of 0.20 (no annual value) = 0.80 TTM; balance 2024-12-31: equity 1000, cash 100, LTD noncurrent 300, current 50
//   Shares 100 (dei, filed 2025-02-20). Close 48 on 2025-03-03.
//   cap 4800; P/E 20; EPS growth 60% so PEG 1/3; P/S 4; P/B 4.8; EV 4800+350-100 = 5050; EBITDA 360; EV/EBITDA 14.02777...
//   yield 0.8/48*100 = 1.6667; payout 80/240 = 33.33%; margins 45 / 25 / 22.5 / 20
const fy = (year: number, val: number, filed: string) => ({ start: `${year}-01-01`, end: `${year}-12-31`, val, filed, form: '10-K', fy: year, fp: 'FY' });
const pair = (a: number, b: number) => [fy(2023, a, '2024-02-15'), fy(2024, b, '2025-02-20')];
function facts(mutate?: (raw: any) => void) {
  const usd = (rows: unknown[]) => ({ units: { USD: rows } });
  const raw: any = { cik: 9999, entityName: 'Synthetic Widgets', facts: { 'us-gaap': {
    Revenues: usd(pair(1000, 1200)), GrossProfit: usd(pair(400, 540)), OperatingIncomeLoss: usd(pair(200, 300)),
    IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: usd(pair(180, 270)), NetIncomeLoss: usd(pair(150, 240)),
    DepreciationDepletionAndAmortization: usd(pair(50, 60)), PaymentsOfDividends: usd(pair(60, 80)),
    EarningsPerShareDiluted: { units: { 'USD/shares': pair(1.5, 2.4) } },
    CommonStockDividendsPerShareDeclared: { units: { 'USD/shares': [['01-01', '03-31', '2024-04-25'], ['04-01', '06-30', '2024-07-25'], ['07-01', '09-30', '2024-10-25'], ['10-01', '12-31', '2025-02-20']].map(([s, e, filed]) => ({ start: '2024-' + s, end: '2024-' + e, val: 0.2, filed, form: '10-Q' })) } },
    StockholdersEquity: usd([{ end: '2024-12-31', val: 1000, filed: '2025-02-20', form: '10-K' }]),
    CashAndCashEquivalentsAtCarryingValue: usd([{ end: '2024-12-31', val: 100, filed: '2025-02-20', form: '10-K' }]),
    LongTermDebtNoncurrent: usd([{ end: '2024-12-31', val: 300, filed: '2025-02-20', form: '10-K' }]),
    LongTermDebtCurrent: usd([{ end: '2024-12-31', val: 50, filed: '2025-02-20', form: '10-K' }]),
  }, dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: '2025-01-31', val: 100, filed: '2025-02-20', form: '10-K' }] } } } } };
  mutate?.(raw);
  return normalizeCompanyFacts(raw);
}
const doc = (f = facts()): FactsDocument => ({ id: 'doc-synth', facts: f, source: { kind: 'synthetic', label: 'Synthetic fixture', retrievedAt: '2025-03-01T00:00:00Z', sourceUrl: null, sha256: null } });
const day = (date: string) => Date.parse(date + 'T00:00:00Z') / 1000;
const bar = (date: string, close: number): Bar => ({ time: day(date), open: close, high: close + 1, low: close - 1, close, volume: 1000 });
const dataset = (symbol: string, last: string, close = 48, currency = 'USD'): BarDataset => ({
  instrument: { id: 'DEMO:' + symbol, symbol, name: symbol, exchange: 'DEMO', currency, assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' },
  bars: [bar('2024-01-02', 40), bar(last, close)], resolution: '1D',
  provenance: { providerId: 'synthetic', providerName: 'SYNTHETIC DEMO', datasetId: 'synthetic:' + symbol, fixture: true, coverage: '2 rows', asOf: 0, delaySeconds: null, adjustment: 'raw', session: 'regular', timezone: 'UTC', state: 'ready', license: 'synthetic' },
} as unknown as BarDataset);
const source = (document = doc(), extra: Partial<ScreenerFundamentalsSource> = {}): ScreenerFundamentalsSource => ({ documents: [document], links: [{ exchange: 'DEMO', symbol: 'WID', synthetic: true, documentId: document.id }], cutoff: null, revisions: 'latest', ...extra });
const columns: ScreenerColumn[] = SCREENER_FUNDAMENTAL_METRICS.map(metric => ({ id: metric, metric }));
const cells = (data: BarDataset, src = source()) => runScreener([data], columns, [], undefined, { fundamentalsOf: screenerFundamentalsIndex(src) }).rows[0].cells;

describe('screener fundamentals from saved, linked company facts', () => {
  it('computes valuation, dividend and margin columns from TTM facts and the last close', () => {
    const c = cells(dataset('WID', '2025-03-03'));
    expect(c.marketCap.value).toBe(4800);
    expect(c.priceEarnings.value).toBe(20);
    expect(c.pegRatio.value).toBeCloseTo(1 / 3, 10);
    expect(c.priceSales.value).toBe(4);
    expect(c.priceBook.value).toBe(4.8);
    expect(c.evEbitda.value).toBeCloseTo(5050 / 360, 10);
    expect(c.epsTtm.value).toBe(2.4);
    expect(c.dividendsPerShare.value).toBeCloseTo(0.8, 10);
    expect(c.dividendYield.value).toBeCloseTo(0.8 / 48 * 100, 10);
    expect(c.payoutRatio.value).toBeCloseTo(100 / 3, 10);
    expect([c.grossMargin.value, c.operatingMargin.value, c.pretaxMargin.value, c.netMargin.value]).toEqual([45, 25, 22.5, 20]);
    expect(c.dividendsPerShare.note).toMatch(/sum of four reported quarters 2024-01-01 to 2024-12-31/);
    expect(c.marketCap.note).toMatch(/SYNTHETIC facts: Synthetic Widgets \(CIK 0000009999\), filings on or before 2025-03-03/);
    expect(c.marketCap.note).toMatch(/Last close 48 USD on 2025-03-03/);
    const shown = formatScreenerCell('marketCap', c.marketCap);
    expect(shown.text).toBe('4.80K'); expect(shown.title).toMatch(/EntityCommonStockSharesOutstanding/);
    expect(formatScreenerCell('netMargin', c.netMargin).text).toBe('20.00%');
  });
  it('is point in time: a dataset ending before the FY2024 filing uses FY2023 and has no share count yet', () => {
    const c = cells(dataset('WID', '2024-06-28', 30));
    expect(c.priceEarnings.value).toBe(20); // 30 / 1.50
    expect(c.netMargin.value).toBe(15);
    expect(c.marketCap.value).toBeNull(); expect(c.marketCap.reason).toMatch(/shares outstanding/);
    expect(c.pegRatio.value).toBeNull();
    // The Fundamentals filing cutoff also applies when it is earlier than the last row.
    expect(cells(dataset('WID', '2025-03-03'), source(doc(), { cutoff: '2024-12-01' })).epsTtm.value).toBe(1.5);
  });
  it('shows a dash with a reason for unlinked symbols and never invents a value', () => {
    const c = cells(dataset('OTHER', '2025-03-03'));
    for (const metric of SCREENER_FUNDAMENTAL_METRICS) { expect(c[metric].value).toBeNull(); expect(c[metric].reason).toMatch(/No saved company facts are linked to DEMO:OTHER/); }
    expect(formatScreenerCell('priceEarnings', c.priceEarnings).text).toBe(SCREENER_DASH);
    const unconnected = runScreener([dataset('WID', '2025-03-03')], columns).rows[0].cells;
    expect(unconnected.priceEarnings.reason).toMatch(/not connected/);
  });
  it('refuses a real document linked to a synthetic symbol, and price ratios across currencies', () => {
    const real: FactsDocument = { ...doc(), source: { ...doc().source, kind: 'local-import' } };
    expect(cells(dataset('WID', '2025-03-03'), source(real)).netMargin.reason).toMatch(/real filing data/);
    const eur = cells(dataset('WID', '2025-03-03', 48, 'EUR'));
    expect(eur.priceEarnings.reason).toMatch(/does not convert currencies/);
    expect(eur.netMargin.value).toBe(20);
  });
  it('leaves ratios empty on losses and without current debt reports only the noncurrent amount, disclosed', () => {
    const loss = cells(dataset('WID', '2025-03-03'), source(doc(facts(raw => { raw.facts['us-gaap'].EarningsPerShareDiluted.units['USD/shares'][1].val = -0.3; }))));
    expect(loss.priceEarnings.reason).toMatch(/zero or negative/); expect(loss.epsTtm.value).toBe(-0.3);
    const noCurrent = cells(dataset('WID', '2025-03-03'), source(doc(facts(raw => { delete raw.facts['us-gaap'].LongTermDebtCurrent; }))));
    expect(noCurrent.evEbitda.value).toBeCloseTo((4800 + 300 - 100) / 360, 10);
    expect(noCurrent.evEbitda.note).toMatch(/no current portion reported at 2024-12-31/);
  });
  it('filters P/E and dividend yield; unlinked rows are unknown, not excluded', () => {
    const filters: ScreenerFilter[] = [{ id: 'pe', columnId: 'priceEarnings', operator: 'lt', value: 25, active: true }, { id: 'y', columnId: 'dividendYield', operator: 'gt', value: 1, active: true }];
    const result = runScreener([dataset('WID', '2025-03-03'), dataset('OTHER', '2025-03-03')], columns, filters, undefined, { fundamentalsOf: screenerFundamentalsIndex(source()) });
    expect(result.rows.map(row => row.symbol)).toEqual(['WID']); expect(result.unknownRows.map(row => row.symbol)).toEqual(['OTHER']);
    expect(runScreener([dataset('WID', '2025-03-03')], columns, [{ ...filters[0], value: 15 }], undefined, { fundamentalsOf: screenerFundamentalsIndex(source()) }).coverage.excluded).toBe(1);
    expect(result.policies.join(' ')).toMatch(/explicitly linked/);
  });
  it('runSavedScreener feeds fundamentals, and the Valuation, Dividends and Margins sets and presets use known metrics', () => {
    const settings = { ...createScreenerSettings(), columns: [{ id: 'symbol', metric: 'symbol' }, { id: 'pe', metric: 'priceEarnings' }] };
    expect(runSavedScreener([dataset('WID', '2025-03-03')], settings, null, null, source()).result.rows[0].cells.pe.value).toBe(20);
    expect(runSavedScreener([dataset('WID', '2025-03-03')], settings).result.rows[0].cells.pe.state).toBe('unavailable');
    for (const id of ['valuation', 'dividends', 'margins']) expect(SCREENER_COLUMN_SETS.find(set => set.id === id)!.columns.length).toBeGreaterThan(3);
    for (const id of ['low-pe', 'dividend-yield']) expect(SCREENER_PRESETS.some(preset => preset.id === id)).toBe(true);
  });
});
