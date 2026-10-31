import { describe, expect, it, vi } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { runScreener, type ScreenerCell } from '../../src/domain/screener';
import { createScreenerSettings, replaceScreenerConfiguration, restoreScreenerSettings, runSavedScreener, screenerConfiguration } from '../../src/domain/screener-state';
import { SCREENER_CONVERTED_METRICS, SCREENER_CURRENCIES, SCREENER_FX_MAX_AGE_DAYS, convertScreenerCell, loadScreenerFxRates, screenerFxSeriesFor } from '../../src/domain/screener-currency';
import type { BarDataset } from '../../src/domain/types';

// Screener Currency menu. Rates are FRED daily series
// (DEXUSEU = USD per EUR, DEXJPUS = JPY per USD, ...). Expectations are computed by hand below, not by the code under test.
const T0 = 1704153600; // 2024-01-02 UTC
const DAY = 86400;
function data(symbol: string, currency: string, closes: number[]): BarDataset {
  const value = fixtureDataset(symbol, 0);
  value.instrument = { ...value.instrument, id: `TEST:${symbol}`, symbol, currency };
  value.provenance = { ...value.provenance, providerId: 'fixture-provider', datasetId: `fixture-provider:${symbol}:1D`, session: 'regular' };
  value.bars = closes.map((close, index) => ({ time: T0 + index * DAY, open: close, high: close + 1, low: close - 1, close, volume: 100 }));
  return value;
}
const RATES = { DEXUSEU: [[T0 - DAY, 1.1], [T0 + DAY, 1.2]] as [number, number][], DEXJPUS: [[T0 + DAY, 150]] as [number, number][] };
const cell = (value: number, asOf: number | null = T0 + DAY): ScreenerCell => ({ value, previous: value / 2, state: 'available', asOf });
const eur = { instrument: { currency: 'EUR' } } as BarDataset, usd = { instrument: { currency: 'USD' } } as BarDataset, hkd = { instrument: { currency: 'HKD' } } as BarDataset;

describe('screener currency conversion', () => {
  it('lists the menu currencies and only the FRED series a conversion needs', () => {
    expect(SCREENER_CURRENCIES).toEqual(['USD', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'CHF', 'CNY']);
    expect(screenerFxSeriesFor('USD', ['USD'])).toEqual([]);
    expect(screenerFxSeriesFor('USD', ['EUR', 'USD', 'HKD'])).toEqual(['DEXUSEU']);
    expect(screenerFxSeriesFor('JPY', ['EUR', 'USD'])).toEqual(['DEXJPUS', 'DEXUSEU']);
    expect(SCREENER_CONVERTED_METRICS.has('last')).toBe(false);
    expect(SCREENER_CONVERTED_METRICS.has('volume')).toBe(false);
  });
  it('converts money cells with the rate dated on or before the value, directly and through USD', () => {
    const toUsd = convertScreenerCell(cell(10), 'sma', eur, { target: 'USD', rates: RATES });
    expect(toUsd.value).toBeCloseTo(12, 10); expect(toUsd.previous).toBeCloseTo(6, 10);
    expect(toUsd.note).toBe('Converted from EUR to USD at 1.2 USD per EUR (FRED DEXUSEU 2024-01-03).');
    // On 2024-01-02 only the 2024-01-01 rate exists.
    expect(convertScreenerCell(cell(10, T0), 'open', eur, { target: 'USD', rates: RATES }).value).toBeCloseTo(11, 10);
    // USD to EUR divides; USD to JPY multiplies by JPY per USD; EUR to JPY goes 10 EUR = 12 USD = 1800 JPY.
    expect(convertScreenerCell(cell(12), 'high', usd, { target: 'EUR', rates: RATES }).value).toBeCloseTo(10, 10);
    expect(convertScreenerCell(cell(2), 'marketCap', usd, { target: 'JPY', rates: RATES }).value).toBeCloseTo(300, 10);
    expect(convertScreenerCell(cell(10), 'change', eur, { target: 'JPY', rates: RATES }).value).toBeCloseTo(1800, 8);
  });
  it('leaves Last, ratios, volumes and same-currency rows unchanged', () => {
    for (const metric of ['last', 'rsi', 'volume', 'changePercent', 'priceEarnings']) expect(convertScreenerCell(cell(10), metric, eur, { target: 'USD', rates: RATES })).toEqual(cell(10));
    expect(convertScreenerCell(cell(10), 'sma', usd, { target: 'USD', rates: null })).toEqual(cell(10));
    expect(convertScreenerCell(cell(10), 'sma', eur, undefined)).toEqual(cell(10));
  });
  it('is unavailable, never unconverted, when a rate is missing, stale or the currency is not in the menu', () => {
    expect(convertScreenerCell(cell(10), 'sma', hkd, { target: 'USD', rates: RATES })).toMatchObject({ state: 'unavailable', value: null, reason: expect.stringContaining('HKD') });
    expect(convertScreenerCell(cell(10), 'sma', eur, { target: 'USD', rates: null, missingReason: 'FRED downloads are off.' })).toMatchObject({ state: 'unavailable', reason: 'FRED downloads are off.' });
    expect(convertScreenerCell(cell(10), 'sma', eur, { target: 'USD', rates: {} }).reason).toContain('DEXUSEU');
    expect(convertScreenerCell(cell(10, T0 - 5 * DAY), 'sma', eur, { target: 'USD', rates: RATES }).reason).toContain('on or before 2023-12-28');
    expect(convertScreenerCell(cell(10, T0 + DAY + (SCREENER_FX_MAX_AGE_DAYS + 1) * DAY), 'sma', eur, { target: 'USD', rates: RATES }).reason).toContain('more than 10 days older');
    // An already unavailable cell stays as it was.
    const missing: ScreenerCell = { value: null, previous: null, state: 'insufficient-history', asOf: T0 };
    expect(convertScreenerCell(missing, 'sma', eur, { target: 'USD', rates: RATES })).toEqual(missing);
  });
  it('filters and sorts on converted values, with Last kept native', () => {
    const rows = [data('EURCO', 'EUR', [10, 10]), data('USDCO', 'USD', [11.5, 11.5])];
    const columns = [{ id: 'symbol', metric: 'symbol' }, { id: 'last', metric: 'last' }, { id: 'open', metric: 'open' }];
    const filters = [{ id: 'f', columnId: 'open', operator: 'gt' as const, value: 11.6, active: true }];
    const result = runScreener(rows, columns, filters, { columnId: 'open', direction: 'desc' }, { currency: { target: 'USD', rates: RATES } });
    expect(result.rows.map(row => row.symbol)).toEqual(['EURCO']);
    expect(result.rows[0].cells.open.value).toBeCloseTo(12, 10); expect(result.rows[0].cells.last.value).toBe(10);
    expect(result.policies.some(policy => policy.startsWith('Currency:'))).toBe(true);
    expect(runScreener(rows, columns, filters).rows.map(row => row.symbol)).toEqual([]);
  });
  it('persists the choice in the screen configuration; Default (absent) clears it; bad codes are refused', () => {
    const base = createScreenerSettings();
    expect(screenerConfiguration(base)).not.toHaveProperty('currency');
    const chosen = replaceScreenerConfiguration(base, { ...screenerConfiguration(base), currency: 'EUR' });
    expect(chosen.currency).toBe('EUR');
    expect(restoreScreenerSettings(JSON.parse(JSON.stringify(chosen))).currency).toBe('EUR');
    expect(replaceScreenerConfiguration(chosen, screenerConfiguration(base)).currency).toBeUndefined();
    expect(() => restoreScreenerSettings({ ...JSON.parse(JSON.stringify(base)), currency: 'XYZ' })).toThrow('Invalid screener currency.');
    const saved = { ...chosen, universe: { ...chosen.universe, currency: null } };
    const out = runSavedScreener([data('USDCO', 'USD', [10, 10])], { ...saved, columns: [{ id: 'symbol', metric: 'symbol' }, { id: 'open', metric: 'open' }], filters: [], sort: { columnId: 'symbol', direction: 'asc' } } as any, null, null, null, { rates: null, missingReason: 'Exchange rates are still downloading from FRED.' });
    expect(out.result.rows[0].cells.open).toMatchObject({ state: 'unavailable', reason: 'Exchange rates are still downloading from FRED.' });
  });
});

describe('on-demand rate download', () => {
  it('fetches only missing series, sorts rows and reports stale copies and failures', async () => {
    const fetchFredSeries = vi.fn(async ({ series }: { series: string }) => {
      if (series === 'DEXJPUS') return { ok: false as const, error: { code: 'FRED_OFFLINE', message: '' } };
      return { ok: true as const, value: { schemaVersion: 1 as const, series, rows: [[T0 + DAY, 1.2], [T0, 1.1], [T0 + 2 * DAY, Number.NaN]] as [number, number][], fetchedAt: 1, cached: true, stale: true, notice: 'offline' } };
    });
    const out = await loadScreenerFxRates({ fetchFredSeries }, ['DEXUSEU', 'DEXJPUS', 'DEXUSUK'], { DEXUSUK: [[T0, 1.3]] });
    expect(fetchFredSeries.mock.calls.map(call => call[0].series)).toEqual(['DEXUSEU', 'DEXJPUS']);
    expect(out.rates).toEqual({ DEXUSEU: [[T0, 1.1], [T0 + DAY, 1.2]] });
    expect(out.notices).toEqual(['Using the saved copy of DEXUSEU: offline', expect.stringContaining('FRED could not be reached and DEXJPUS')]);
  });
  it('makes no request when downloads are off or there is no desktop bridge', async () => {
    const fetchFredSeries = vi.fn();
    expect((await loadScreenerFxRates({ fetchFredSeries }, ['DEXUSEU'], {}, false)).notices[0]).toContain('turned off');
    expect((await loadScreenerFxRates(undefined, ['DEXUSEU'], {})).notices[0]).toContain('desktop app');
    expect((await loadScreenerFxRates({ fetchFredSeries }, [], {})).notices).toEqual([]);
    expect(fetchFredSeries).not.toHaveBeenCalled();
  });
});
