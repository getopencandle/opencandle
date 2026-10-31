import { describe, expect, it } from 'vitest';
import { parseCalendarJson, type CalendarDocument } from '../../src/domain/calendar';
import { calendarChartMarkers, calendarMarkerSettings, economicEventAhead, economicMarkerTime, ECONOMIC_IMPORTANCE_COLOR } from '../../src/domain/calendar-chart-markers';
import { defaultChartSettingsDocument, restoreChartSettingsDocument } from '../../src/chart/chart-settings-document';
import { factoryAppearance, factoryPriceScale, findRow, writeRow, type ChartSettingsSources } from '../../src/chart/chart-settings-bindings';
import { EVENTS_MIN_BAR_SPACING, eventBarSpacing, eventsCompressed } from '../../src/ui/ChartEventMarkers';
import { fixtureDataset } from '../../src/domain/fixtures';
import { instrumentCurrencies, runScreener, screenerValueKind } from '../../src/domain/screener';
import { formatScreenerCell } from '../../src/domain/screener-format';
import { createScreenerSettings, replaceScreenerConfiguration, restoreScreenerSettings, screenerConfiguration, screenerGridDimensions } from '../../src/domain/screener-state';
import { gridSizeStyle } from '../../src/ui/ScreenerChartGrid';
import type { BarDataset } from '../../src/domain/types';

// Economic calendar flags, Future events only, hide at compressed zoom; screener grid size, base/quote currency
// and last trade time. SYNTHETIC documents and bars; expected values worked out by hand.
const at = (iso: string) => Date.parse(iso) / 1000;
function doc(events: unknown[], id = 'cal-markers-1028'): CalendarDocument {
  const parsed = parseCalendarJson(JSON.stringify(events), { documentId: id, sourceLabel: 'SYNTHETIC CAL-MARKERS TEST', fixture: true, now: at('2026-06-01T00:00:00Z') });
  if (!parsed.ok || !parsed.document) throw new Error(parsed.diagnostics.join(' '));
  return parsed.document;
}
// Daily bars at 00:00 UTC, 2026-06-01 .. 2026-06-10 (ten bars, step 86400).
const daily = Array.from({ length: 10 }, (_, i) => ({ time: at('2026-06-01T00:00:00Z') + i * 86400 }));
const econ = (id: string, extra: Record<string, unknown>) => ({ id, kind: 'economic', title: `Synthetic ${id}`, publishedAt: 1, ...extra });
const on = { earnings: false, dividends: false, splits: false, ipos: false, economic: true, economicFutureOnly: false };

describe('economic event flags', () => {
  it('sit on the bar holding the release time, snap to the future bar grid past the last bar, and drop before the first bar', () => {
    const row = (event: Record<string, unknown>) => ({ event: { time: null, date: '2026-06-03', ...event } }) as never;
    expect(economicMarkerTime(row({ time: at('2026-06-03T12:30:00Z') }), daily)).toEqual({ barTime: at('2026-06-03T00:00:00Z'), future: false });
    expect(economicMarkerTime(row({ time: at('2026-06-10T18:00:00Z') }), daily)).toEqual({ barTime: at('2026-06-10T00:00:00Z'), future: false });
    expect(economicMarkerTime(row({ time: at('2026-06-13T15:00:00Z') }), daily)).toEqual({ barTime: at('2026-06-13T00:00:00Z'), future: true });
    expect(economicMarkerTime(row({ date: '2026-06-20' }), daily)).toEqual({ barTime: at('2026-06-20T00:00:00Z'), future: true });
    expect(economicMarkerTime(row({ time: at('2026-05-20T12:00:00Z') }), daily)).toBeNull();
  });
  it('appear only with the Economic events setting, carry the country code and the importance color, and ignore the chart symbol', () => {
    const d = doc([
      econ('cpi', { date: '2026-06-03', time: '2026-06-03T12:30:00Z', timezone: 'UTC', timing: 'exact', country: 'XA', importance: 'high', category: 'Inflation', values: { actual: { value: 2.5, unit: '%', availableAt: 1 } } }),
      econ('retail', { date: '2026-06-03', time: '2026-06-03T14:00:00Z', timezone: 'UTC', timing: 'exact', country: 'XA', importance: 'low' }),
      econ('mixed', { date: '2026-06-05', country: 'XB', importance: 'medium' }),
      econ('mixed2', { date: '2026-06-05', country: 'XA' }),
      { id: 'earn', kind: 'earnings', title: 'Synthetic earnings', date: '2026-06-04', symbol: 'OTHER', publishedAt: 1 },
    ]);
    expect(calendarChartMarkers([d], 'SYNTH', daily, { ...on, economic: false }, at('2026-06-01T00:00:00Z'))).toEqual([]);
    const markers = calendarChartMarkers([d], 'SYNTH', daily, on, at('2026-06-01T00:00:00Z'));
    expect(markers.map(m => [m.kind, m.barTime, m.letter, m.color, m.entries.length])).toEqual([
      ['economic', at('2026-06-03T00:00:00Z'), 'XA', ECONOMIC_IMPORTANCE_COLOR.high, 2],
      // Date-only entries use the New York trading date like the other calendar badges: the 00:00 UTC bar of 06-06 is 06-05 in New York.
      ['economic', at('2026-06-06T00:00:00Z'), 'EC', ECONOMIC_IMPORTANCE_COLOR.medium, 2],
    ]);
    expect(markers[0].lines).toEqual(expect.arrayContaining(['SYNTHETIC Economic event', 'Country: XA', 'Category: Inflation', 'Importance: high', 'Actual: 2.5 %']));
    expect(markers[0].synthetic).toBe(true);
  });
  it('Future events only keeps entries whose time (or date) is still ahead and places them right of the last bar', () => {
    const d = doc([
      econ('past', { date: '2026-06-09', time: '2026-06-09T12:00:00Z', timezone: 'UTC', timing: 'exact', country: 'XA' }),
      econ('later-today', { date: '2026-06-10', time: '2026-06-10T20:00:00Z', timezone: 'UTC', timing: 'exact', country: 'XA' }),
      econ('next-week', { date: '2026-06-15', country: 'XB' }),
    ]);
    const now = at('2026-06-10T16:00:00Z');
    expect(calendarChartMarkers([d], 'SYNTH', daily, on, now).map(m => m.entries[0].eventId)).toEqual(['past', 'later-today', 'next-week']);
    const future = calendarChartMarkers([d], 'SYNTH', daily, { ...on, economicFutureOnly: true }, now);
    expect(future.map(m => [m.entries[0].eventId, m.future === true])).toEqual([['later-today', false], ['next-week', true]]);
    expect(economicEventAhead({ time: null, date: '2026-06-10' }, now)).toBe(true);
    expect(economicEventAhead({ time: null, date: '2026-06-09' }, now)).toBe(false);
  });
  it('the chart passes Events > Economic events and its nested Future events only', () => {
    const events = defaultChartSettingsDocument().events;
    expect(events.economic).toEqual({ visible: true, futureOnly: true });
    expect(calendarMarkerSettings({ ...events, economic: { visible: true, futureOnly: false } }, false)).toMatchObject({ economic: true, economicFutureOnly: false });
    expect(calendarMarkerSettings({ ...events, economic: { visible: false, futureOnly: true } }, false)).toMatchObject({ economic: false });
  });
});

describe('Economic events chart settings row', () => {
  const sources = (): ChartSettingsSources => ({ appearance: factoryAppearance(), document: defaultChartSettingsDocument(), documentConnected: true, priceScale: factoryPriceScale(), ratio: 0.5, style: 'candles', typeSettings: null, timezone: 'UTC', exchangeTimezone: null, scaleMode: { scale: 'linear', invert: false, auto: true } });
  it('is live, writes the document, disables the nested box while unchecked and survives restore', () => {
    const row = findRow('events', sources(), 'events.economicEvents')!;
    expect(row.availability).toEqual({ state: 'live' });
    expect(row.value).toEqual({ checked: true, nested: true });
    const next = writeRow(sources(), 'events.economicEvents', { checked: false, nested: false });
    expect(next.document.events.economic).toEqual({ visible: false, futureOnly: false });
    expect(findRow('events', next, 'events.economicEvents')!.disabledParts).toContain('nested');
    expect(restoreChartSettingsDocument(JSON.parse(JSON.stringify(next.document))).events.economic).toEqual({ visible: false, futureOnly: false });
    const legacy = JSON.parse(JSON.stringify(defaultChartSettingsDocument())); delete legacy.events.economic;
    expect(restoreChartSettingsDocument(legacy).events.economic).toEqual({ visible: true, futureOnly: true });
    expect(() => restoreChartSettingsDocument({ ...legacy, events: { ...legacy.events, economic: { visible: 'yes', futureOnly: true } } })).toThrow(/economic/);
  });
});

describe('compressed zoom', () => {
  it('measures the spacing of the last two bars and hides only below the threshold', () => {
    expect(eventBarSpacing(seconds => (seconds - daily[0].time) / 86400 * 1.5, daily)).toBeCloseTo(1.5);
    expect(eventsCompressed(1.5)).toBe(true);
    expect(eventsCompressed(EVENTS_MIN_BAR_SPACING)).toBe(false);
    expect(eventsCompressed(null)).toBe(false);
    expect(eventsCompressed(0)).toBe(false);
    expect(eventBarSpacing(() => null, daily)).toBeNull();
    expect(eventBarSpacing(() => 1, daily.slice(0, 1))).toBeNull();
  });
});

function data(symbol: string, assetClass: BarDataset['instrument']['assetClass'], currency: string): BarDataset {
  const value = fixtureDataset(symbol, 0);
  value.instrument = { ...value.instrument, id: `x:${symbol}`, symbol, assetClass, currency };
  value.bars = [100, 101, 102].map((close, index) => ({ time: 1704153600 + index * 86400, open: close, high: close + 1, low: close - 1, close, volume: 100 }));
  return value;
}
describe('screener base/quote currency and last trade time', () => {
  it('reads currencies from symbol metadata only', () => {
    expect(instrumentCurrencies({ symbol: 'BTC-USD', currency: 'USD', assetClass: 'crypto' })).toEqual({ base: 'BTC', quote: 'USD' });
    expect(instrumentCurrencies({ symbol: 'eurusd', currency: '', assetClass: 'forex' })).toEqual({ base: 'EUR', quote: 'USD' });
    expect(instrumentCurrencies({ symbol: 'AAPL', currency: 'usd', assetClass: 'stock' })).toEqual({ base: null, quote: 'USD' });
    expect(instrumentCurrencies({ symbol: 'AAPL', currency: '', assetClass: 'stock' })).toEqual({ base: null, quote: null });
    expect(screenerValueKind('baseCurrency')).toBe('text');
    expect(screenerValueKind('lastTradeTime')).toBe('number');
  });
  it('columns, a text filter and the last bar time', () => {
    const rows = [data('BTC-USD', 'crypto', 'USD'), data('SAPX', 'stock', 'EUR')];
    const columns = [{ id: 'base', metric: 'baseCurrency' }, { id: 'quote', metric: 'quoteCurrency' }, { id: 'time', metric: 'lastTradeTime' }];
    const result = runScreener(rows, columns, [], { columnId: 'quote', direction: 'asc' });
    expect(result.diagnostics).toEqual([]);
    const bySymbol = Object.fromEntries(result.rows.map(row => [row.symbol, row.cells]));
    expect(bySymbol['BTC-USD'].base.value).toBe('BTC');
    expect(bySymbol.SAPX.base).toMatchObject({ value: null, state: 'unavailable' });
    expect(bySymbol.SAPX.quote.value).toBe('EUR');
    expect(bySymbol.SAPX.time).toMatchObject({ value: 1704153600 + 2 * 86400, previous: 1704153600 + 86400, state: 'available' });
    const filtered = runScreener(rows, columns, [{ id: 'f', columnId: 'quote', operator: 'eq', value: 'EUR', active: true }], { columnId: 'quote', direction: 'asc' });
    expect(filtered.rows.map(row => row.symbol)).toEqual(['SAPX']);
    expect(formatScreenerCell('lastTradeTime', { value: 1704326400, state: 'available' }).text).toBe('2024-01-04 00:00 UTC');
  });
});

describe('screener chart grid size', () => {
  it('is saved in the configuration, validated, and cleared when a configuration without it replaces it', () => {
    const base = createScreenerSettings();
    expect(screenerConfiguration(base)).not.toHaveProperty('chartGrid');
    const sized = replaceScreenerConfiguration(base, { ...screenerConfiguration(base), chartGrid: '3x2' });
    expect(sized.chartGrid).toBe('3x2');
    expect(restoreScreenerSettings(JSON.parse(JSON.stringify(sized))).chartGrid).toBe('3x2');
    expect(replaceScreenerConfiguration(sized, screenerConfiguration(base)).chartGrid).toBeUndefined();
    expect(() => replaceScreenerConfiguration(base, { ...screenerConfiguration(base), chartGrid: '9x9' as never })).toThrow(/grid size/);
    expect(screenerGridDimensions('4x3')).toEqual({ columns: 4, rows: 3 });
    expect(screenerGridDimensions(undefined)).toBeNull();
    expect(gridSizeStyle({ columns: 3, rows: 2 })).toMatchObject({ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridAutoRows: 'calc((100% - 10px) / 2)' });
    expect(gridSizeStyle(null)).toBeUndefined();
  });
});
