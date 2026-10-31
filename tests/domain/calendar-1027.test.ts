import { describe, expect, it } from 'vitest';
import { calendarPeriodRange, calendarStaleness, createCalendarState, describeCalendarEmpty, focusCalendarEvent, parseCalendarJson, queryCalendar, restoreCalendarQuery, shiftCalendarPeriod, type CalendarDocument, type CalendarQuery } from '../../src/domain/calendar';
import { calendarChartMarkers, calendarMarkerSettings, calendarSymbolMatches } from '../../src/domain/calendar-chart-markers';
import { AUTO_DIVIDEND_DOCUMENT_ID } from '../../src/domain/calendar-sources';

// Past and Next week periods, the stale-import note, focusing one entry, and chart markers for calendar entries.
// Expected values are worked out by hand (Monday weeks, New York trading dates).
const at = (iso: string) => Date.parse(iso) / 1000;
const q = (extra: Partial<CalendarQuery> = {}): CalendarQuery => ({ ...createCalendarState().query, ...extra });
function doc(events: unknown[], id = 'cal-1027', options: { fixture?: boolean; now?: number } = {}): CalendarDocument {
  const parsed = parseCalendarJson(JSON.stringify(events), { documentId: id, sourceLabel: 'SYNTHETIC CALENDAR-1027 TEST', fixture: options.fixture ?? true, now: options.now ?? at('2026-06-01T00:00:00Z') });
  if (!parsed.ok || !parsed.document) throw new Error(parsed.diagnostics.join(' '));
  return parsed.document;
}
const v = (value: number | null, unit: string) => ({ value, unit, availableAt: 1 });

describe('Past and Next week periods', () => {
  const now = at('2026-06-10T12:00:00Z'); // Wednesday.
  it('next week is the following Monday to Sunday, and shifts like any bounded range', () => {
    expect(calendarPeriodRange({ period: 'next-week', from: null, to: null, timezone: 'UTC' }, now)).toEqual({ from: '2026-06-15', to: '2026-06-21' });
    expect(shiftCalendarPeriod(q({ period: 'next-week' }), -1, now)).toMatchObject({ period: 'custom', from: '2026-06-08', to: '2026-06-14' });
  });
  it('past keeps events before now (date-only events before today) and is unbounded', () => {
    const d = doc([
      { id: 'old', kind: 'economic', title: 'Synthetic old', date: '2026-06-09', publishedAt: 1 },
      { id: 'today-date', kind: 'economic', title: 'Synthetic today', date: '2026-06-10', publishedAt: 1 },
      { id: 'earlier-today', kind: 'economic', title: 'Synthetic earlier', date: '2026-06-10', time: '2026-06-10T08:00:00Z', timezone: 'UTC', timing: 'exact', publishedAt: 1 },
      { id: 'later-today', kind: 'economic', title: 'Synthetic later', date: '2026-06-10', time: '2026-06-10T15:00:00Z', timezone: 'UTC', timing: 'exact', publishedAt: 1 },
    ]);
    expect(queryCalendar([d], q({ period: 'past' }), now).rows.map(row => row.event.id).sort()).toEqual(['earlier-today', 'old']);
    expect(calendarPeriodRange({ period: 'past', from: null, to: null, timezone: 'UTC' }, now)).toEqual({ from: null, to: null });
    expect(shiftCalendarPeriod(q({ period: 'past' }), 1, now)).toBeNull();
    expect(restoreCalendarQuery(q({ period: 'past' })).period).toBe('past');
    expect(restoreCalendarQuery(q({ period: 'next-week' })).period).toBe('next-week');
  });
  it('a past view after the imported coverage reports the gap as unavailable, not empty', () => {
    const d = doc([{ id: 'future', kind: 'economic', title: 'Synthetic future', date: '2026-07-01', publishedAt: 1 }]);
    const query = q({ period: 'past' }), result = queryCalendar([d], query, now);
    expect(describeCalendarEmpty([d], query, result, '', now)).toMatchObject({ reason: 'outside-coverage', availability: 'unavailable' });
  });
});

describe('stale import note', () => {
  it('flags real imports a week old and ignores synthetic documents', () => {
    const imported = doc([{ id: 'a', kind: 'economic', title: 'x', date: '2026-06-01' }], 'real', { fixture: false, now: at('2026-06-01T00:00:00Z') });
    expect(calendarStaleness([imported], at('2026-06-07T23:00:00Z'))).toMatchObject({ ageDays: 6, stale: false, message: null });
    const stale = calendarStaleness([imported], at('2026-06-09T00:00:00Z'));
    expect(stale).toMatchObject({ ageDays: 8, stale: true });
    expect(stale.message).toContain('8 days old (imported 2026-06-01)');
    expect(stale.message).not.toMatch(/—/);
    const synthetic = doc([{ id: 'a', kind: 'economic', title: 'x', date: '2026-06-01' }], 'demo', { fixture: true });
    expect(calendarStaleness([synthetic], at('2027-01-01T00:00:00Z'))).toMatchObject({ stale: false, newestImportedAt: null });
  });
});

describe('focusing one calendar entry', () => {
  it('opens the entry tab with filters reset and finds its page', () => {
    const events = Array.from({ length: 60 }, (_, index) => ({ id: `e${index}`, kind: 'earnings', title: `Synthetic report ${index}`, symbol: 'SYNTH1', date: `2026-06-${String(1 + (index % 28)).padStart(2, '0')}`, publishedAt: 1 }));
    const state = { ...createCalendarState(), documents: [doc(events)], query: q({ kind: 'economic', symbols: ['OTHER'], search: 'nothing' }) };
    const focus = focusCalendarEvent(state, { documentId: 'cal-1027', eventId: 'e27' }, at('2026-06-10T00:00:00Z'));
    expect(focus?.query).toMatchObject({ kind: 'earnings', period: 'all', symbols: [], search: '', includeCancelled: true });
    expect(focus?.key).toBe(JSON.stringify(['cal-1027', 'e27']));
    // e27 is dated 2026-06-28, the last date; sorted by date it sits on page 2 (index >= 50).
    expect(focus?.page).toBe(1);
    expect(focusCalendarEvent(state, { documentId: 'cal-1027', eventId: 'missing' })).toBeNull();
  });
});

describe('chart markers for calendar entries', () => {
  // Daily bars at 09:30 New York (13:30 UTC), Monday 2026-06-01 to Friday 2026-06-12.
  const days = ['01', '02', '03', '04', '05', '08', '09', '10', '11', '12'];
  const bars = days.map(day => ({ time: at(`2026-06-${day}T13:30:00Z`) }));
  const all = { earnings: true, dividends: true, splits: true, ipos: true };
  const d = doc([
    { id: 'earn', kind: 'earnings', title: 'Synthetic Q2 report', symbol: 'SYNTH1', date: '2026-06-03', timing: 'after-close', fiscalPeriod: 'Q2 2026', values: { epsForecast: v(1.2, 'USD'), epsActual: v(1.35, 'USD') }, publishedAt: 1 },
    { id: 'div', kind: 'dividend', title: 'Synthetic dividend', symbol: 'SYNTH1', date: '2026-06-01', exDate: '2026-06-09', payDate: '2026-06-30', values: { dividendAmount: v(0.25, 'USD') }, publishedAt: 1 },
    { id: 'other', kind: 'earnings', title: 'Synthetic other symbol', symbol: 'SYNTH2', date: '2026-06-03', publishedAt: 1 },
    { id: 'cancelled', kind: 'earnings', title: 'Synthetic cancelled', symbol: 'SYNTH1', date: '2026-06-04', status: 'cancelled', publishedAt: 1 },
    { id: 'outside', kind: 'earnings', title: 'Synthetic later', symbol: 'SYNTH1', date: '2026-07-20', publishedAt: 1 },
    { id: 'econ', kind: 'economic', title: 'Synthetic CPI', symbol: 'SYNTH1', date: '2026-06-05', publishedAt: 1 },
  ]);
  const now = at('2026-06-20T00:00:00Z');
  it('matches symbols with or without an exchange prefix', () => {
    expect(calendarSymbolMatches('synth1', 'DEMO:SYNTH1')).toBe(true);
    expect(calendarSymbolMatches('SYNTH1', 'SYNTH10')).toBe(false);
    expect(calendarSymbolMatches(null, 'SYNTH1')).toBe(false);
  });
  it('puts earnings on the report date and dividends on the ex-date bar, never economic, cancelled or off-bar events', () => {
    const markers = calendarChartMarkers([d], 'SYNTH1', bars, all, now);
    expect(markers.map(row => [row.kind, row.letter, row.barTime])).toEqual([['earnings', 'E', at('2026-06-03T13:30:00Z')], ['dividend', 'D', at('2026-06-09T13:30:00Z')]]);
    expect(markers[0].lines).toEqual(['SYNTHETIC Earnings', 'Synthetic Q2 report', 'Fiscal period: Q2 2026', 'EPS estimate: 1.2 USD', 'EPS actual: 1.35 USD', 'Date: 2026-06-03, After close', 'Source: SYNTHETIC CALENDAR-1027 TEST']);
    expect(markers[1].lines).toContain('Ex-date: 2026-06-09, Time not supplied');
    expect(markers[0].entries[0]).toMatchObject({ documentId: 'cal-1027', eventId: 'earn' });
    expect(markers[0].label).toContain('Opens the calendar entry');
  });
  it('follows the chart Events settings and skips the Alpaca auto-fill document on charts that show corporate actions', () => {
    expect(calendarChartMarkers([d], 'SYNTH1', bars, { ...all, earnings: false }, now).map(row => row.kind)).toEqual(['dividend']);
    expect(calendarChartMarkers([d], 'SYNTH1', bars, { earnings: false, dividends: false, splits: false, ipos: false }, now)).toEqual([]);
    const auto = { ...doc([{ id: 'alp', kind: 'dividend', title: 'Synthetic auto', symbol: 'SYNTH1', date: '2026-06-02', exDate: '2026-06-02', publishedAt: 1 }], AUTO_DIVIDEND_DOCUMENT_ID) };
    const settings = calendarMarkerSettings({ earnings: { visible: true }, dividends: true, splits: true }, true);
    expect(calendarChartMarkers([d, auto], 'SYNTH1', bars, settings, now).map(row => row.entries[0].eventId)).toEqual(['earn', 'div']);
    expect(calendarChartMarkers([d, auto], 'SYNTH1', bars, calendarMarkerSettings({ earnings: { visible: true }, dividends: true, splits: true }, false), now).map(row => row.entries[0].eventId)).toEqual(['alp', 'earn', 'div']);
  });
  it('returns nothing without a symbol, documents or bars', () => {
    expect(calendarChartMarkers([d], null, bars, all, now)).toEqual([]);
    expect(calendarChartMarkers([], 'SYNTH1', bars, all, now)).toEqual([]);
    expect(calendarChartMarkers([d], 'SYNTH1', [], all, now)).toEqual([]);
  });
});
