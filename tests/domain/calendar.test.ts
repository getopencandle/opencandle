import { describe, expect, it } from 'vitest';
import { calendarRowsToCsv, calendarTimestamp, createCalendarState, isCalendarDate, parseCalendarCsv, parseCalendarJson, queryCalendar, restoreCalendarDocument, restoreCalendarState, type CalendarEvent, type CalendarQuery } from '../../src/domain/calendar';
import { csvRows } from '../../src/domain/data';

const at = (iso: string) => Date.parse(iso) / 1000;
const options = { documentId: 'test-document', sourceLabel: 'SYNTHETIC TEST EVENTS', fixture: true, now: 1000 };
function event(id = 'event', extra: Partial<CalendarEvent> = {}) { return { id, kind: 'economic', title: 'Synthetic test event', date: '1970-01-01', publishedAt: 100, ...extra }; }
function document(events: unknown[]) { const parsed = parseCalendarJson(JSON.stringify(events), options); if (!parsed.ok) throw new Error(parsed.diagnostics.join(' ')); return parsed.document!; }
function query(extra: Partial<CalendarQuery> = {}): CalendarQuery { return { ...createCalendarState().query, ...extra }; }
const amount = (value: number | null, unit: string, availableAt: number | null = 100) => ({ value, unit, availableAt });

describe('calendar import and provenance boundaries', () => {
  it('starts empty and imports canonical bounded JSON with preserved explicit synthetic provenance', () => {
    expect(createCalendarState().documents).toEqual([]); expect(queryCalendar([], query(), 500).coverage.matched).toBe(0);
    const first = document([event()]), restored = parseCalendarJson(JSON.stringify(first));
    expect(restored.ok).toBe(true); expect(restored.document).toEqual(first); expect(first.provenance).toMatchObject({ fixture: true, kind: 'synthetic', label: 'SYNTHETIC TEST EVENTS' });
    expect(first.events[0]).toMatchObject({ revision: 1, timing: 'date-only', time: null, timezone: null });
    expect(parseCalendarJson('[]', { maxBytes: 1 }).ok).toBe(false); expect(parseCalendarJson('[{}]', { maxEvents: 0 }).ok).toBe(false);
    expect(parseCalendarJson(JSON.stringify([event()]), { sourceUrl: 'https://user:secret@example.com' }).ok).toBe(false);
  });
  it('handles quoted CSV fields, blank missing values and rejects an invalid row atomically', () => {
    const csv = 'id,kind,title,date,publishedAt,actual,actualUnit,actualAvailableAt,forecast,forecastUnit,forecastAvailableAt\r\nfirst,economic,"Synthetic, \"\"quoted\"\" event",1970-01-01,100,3.5,%,300,,%,100';
    const parsed = parseCalendarCsv(csv, options); expect(parsed.ok).toBe(true); expect(parsed.document!.events[0].title).toBe('Synthetic, "quoted" event');
    expect(parsed.document!.events[0].values.actual).toEqual(amount(3.5, '%', 300)); expect(parsed.document!.events[0].values.forecast!.value).toBeNull();
    const invalid = parseCalendarCsv(csv + '\nsecond,economic,Bad,2026-02-30,100,4,%,300,,%,100', options); expect(invalid).toMatchObject({ ok: false, rowCount: 2 }); expect(invalid).not.toHaveProperty('document');
    expect(parseCalendarCsv('id,id,kind,title,date\na,a,economic,test,1970-01-01', options).ok).toBe(false);
    expect(parseCalendarCsv('id,kind,title,date,unsupported\na,economic,test,1970-01-01,secret', options).ok).toBe(false);
  });
  it('rejects unsafe financial numbers, unknown fields, ambiguous timestamps and invalid dates', () => {
    expect(parseCalendarJson(JSON.stringify([event('bad', { values: { sharesOffered: amount(Number.MAX_SAFE_INTEGER + 1, 'shares') } })]), options).ok).toBe(false);
    expect(parseCalendarJson(JSON.stringify([event('bad', { values: { actual: amount(123, '%') } })]).replace('"value":123', '"value":1e309'), options).ok).toBe(false);
    expect(parseCalendarJson(JSON.stringify([{ ...event(), unknown: 3 }]), options).ok).toBe(false);
    expect(() => calendarTimestamp('2026-11-01T01:30:00')).toThrow('Ambiguous'); expect(() => calendarTimestamp('2026-01-01T24:00:00Z')).toThrow();
    expect(calendarTimestamp('2026-01-01T00:00:00-07:00')).toBe(at('2026-01-01T07:00:00Z'));
    expect(isCalendarDate('2024-02-29')).toBe(true); expect(isCalendarDate('2026-02-29')).toBe(false); expect(isCalendarDate('0000-01-01')).toBe(false);
    expect(parseCalendarJson(JSON.stringify([event('bad', { timing: 'exact', time: 100, timezone: null })]), options).ok).toBe(false);
  });
  it('collapses identical revisions canonically while rejecting conflicting and misordered revisions', () => {
    const first = event('same', { values: { actual: amount(1, '%'), prior: amount(2, '%') } }), reversedKeys = event('same', { values: { prior: amount(2, '%'), actual: amount(1, '%') } });
    const parsed = parseCalendarJson(JSON.stringify([first, reversedKeys]), options); expect(parsed.document!.events).toHaveLength(1); expect(parsed.diagnostics).toHaveLength(1);
    expect(parseCalendarJson(JSON.stringify([first, { ...first, title: 'Contradiction' }]), options).ok).toBe(false);
    expect(parseCalendarJson(JSON.stringify([first, { ...first, revision: 2, publishedAt: 99 }]), options).ok).toBe(false);
  });
  it('enforces CSV limits during tokenization and rejects aggregate event counts before normalization', () => {
    expect(() => csvRows('header\nrow\nrow\n"unterminated', { maxRows: 2 })).toThrow('row limit');
    expect(() => csvRows('one,two,three\n', { maxColumns: 2 })).toThrow('column limit');
    expect(() => csvRows('"abcde"', { maxFieldLength: 4 })).toThrow('field length');
    expect(csvRows('"a,b","c\nd"\r\n', { maxRows: 1, maxColumns: 2, maxFieldLength: 3 })).toEqual([['a,b', 'c\nd']]);
    const malformed = { events: new Array(25001).fill(null) };
    expect(() => restoreCalendarState({ ...createCalendarState(), documents: [malformed, malformed] })).toThrow('before normalization');
    const csv = 'id,kind,title,date\na,economic,A,1970-01-01\nb,economic,B,1970-01-01';
    expect(parseCalendarCsv(csv, { ...options, maxEvents: 1 }).diagnostics[0]).toContain('row limit');
  });
});
describe('calendar availability, timezone and query invariants', () => {
  it('hides future values in every returned field and chooses only the available revision', () => {
    const first = event('revision', { values: { actual: amount(123456, '%', 300), forecast: amount(2, '%', 100) } });
    const doc = document([first, { ...first, revision: 2, publishedAt: 400, values: { actual: amount(999999, '%', 400) } }]);
    const result = queryCalendar([doc], query({ asOf: 200 }), 500);
    expect(result.rows[0].event.revision).toBe(1); expect(result.rows[0].values.actual).toMatchObject({ value: null, state: 'not-yet-available' });
    expect(result.rows[0].event.values.actual!.value).toBeNull(); expect(result.rows[0].values.forecast.value).toBe(2);
    expect(JSON.stringify(result)).not.toContain('123456'); expect(JSON.stringify(result)).not.toContain('999999');
    expect(doc.events[0].values.actual!.value).toBe(123456); expect(queryCalendar([doc], query({ asOf: 450 }), 500).rows[0].values.actual.value).toBe(999999);
  });
  it('keeps unknown publication and value availability distinct from zero and explicit absence', () => {
    const doc = document([event('unknown-publication', { publishedAt: null }), event('unknown-value', { values: { actual: amount(0, '%', null), forecast: amount(null, '%', 100) } })]);
    const latest = queryCalendar([doc], query(), 500), historical = queryCalendar([doc], query({ asOf: 200 }), 500);
    expect(latest.coverage.unknownPublication).toBe(1); expect(latest.rows.find(row => row.event.id === 'unknown-value')!.values.actual).toMatchObject({ value: 0, state: 'unknown-availability' });
    expect(historical.coverage.unavailableAtCutoff).toBe(1); expect(historical.rows[0].values.actual).toMatchObject({ value: null, state: 'unknown-availability' }); expect(historical.rows[0].values.forecast.state).toBe('missing');
    expect(queryCalendar([doc], query({ asOf: 1000 }), 500).diagnostics).toHaveLength(1);
  });
  it('converts exact events through DST but keeps date-only events on their supplied date', () => {
    const doc = document([
      event('date-only', { date: '2026-01-02' }),
      event('exact', { date: '2026-01-02', time: at('2026-01-02T01:00:00Z'), timezone: 'UTC', timing: 'exact' }),
      event('dst-before', { date: '2026-03-08', time: at('2026-03-08T06:30:00Z'), timezone: 'UTC', timing: 'exact' }),
      event('dst-after', { date: '2026-03-08', time: at('2026-03-08T07:30:00Z'), timezone: 'UTC', timing: 'exact' }),
    ]);
    const rows = queryCalendar([doc], query({ timezone: 'America/New_York' }), at('2026-04-01T00:00:00Z')).rows;
    expect(rows.find(row => row.event.id === 'date-only')).toMatchObject({ displayDate: '2026-01-02', displayTime: null });
    expect(rows.find(row => row.event.id === 'exact')).toMatchObject({ displayDate: '2026-01-01', displayTime: '20:00:00' });
    expect(rows.find(row => row.event.id === 'dst-before')!.displayTime).toBe('01:30:00'); expect(rows.find(row => row.event.id === 'dst-after')!.displayTime).toBe('03:30:00');
  });
  it('orders the repeated fall-back hour by actual instant and displays distinguishable offsets', () => {
    const doc = document([
      event('later', { date: '2026-11-01', time: at('2026-11-01T06:15:00Z'), timezone: 'UTC', timing: 'exact' }),
      event('earlier', { date: '2026-11-01', time: at('2026-11-01T05:45:00Z'), timezone: 'UTC', timing: 'exact' }),
      event('date-only', { date: '2026-11-01' }),
    ]), now = at('2026-11-02T00:00:00Z');
    const result = queryCalendar([doc], query({ timezone: 'America/New_York' }), now);
    expect(result.rows.map(row => [row.event.id, row.displayTime, row.displayOffset])).toEqual([['earlier', '01:45:00', 'GMT-4'], ['later', '01:15:00', 'GMT-5'], ['date-only', null, null]]);
    expect(queryCalendar([doc], query({ timezone: 'America/New_York', sort: { key: 'date', direction: 'desc' } }), now).rows.map(row => row.event.id)).toEqual(['later', 'earlier', 'date-only']);
    const csv = calendarRowsToCsv(result); expect(csv).toContain('displayOffset'); expect(csv).toContain('GMT-4'); expect(csv).toContain('GMT-5');
  });
  it('applies inclusive date ranges, Monday weeks, upcoming precision and independent filter categories', () => {
    const now = at('2026-10-14T12:00:00Z'), doc = document([
      event('today', { date: '2026-10-14', country: 'US', category: 'Inflation', importance: 'high' }),
      event('earlier', { date: '2026-10-14', time: now - 60, timezone: 'UTC', timing: 'exact', country: 'US', importance: 'high' }),
      event('next', { date: '2026-10-15', country: 'CA', category: 'Inflation', importance: 'medium' }),
      event('sunday', { date: '2026-10-18', country: 'US', importance: null }),
      event('monday', { date: '2026-10-19', country: 'US', importance: 'high', status: 'cancelled' }),
    ]);
    expect(queryCalendar([doc], query({ period: 'upcoming' }), now).rows.map(row => row.event.id)).toEqual(['today', 'next', 'sunday']);
    expect(queryCalendar([doc], query({ period: 'this-week' }), now).rows).toHaveLength(4);
    expect(queryCalendar([doc], query({ period: 'custom', from: '2026-10-15', to: '2026-10-18' }), now).rows.map(row => row.event.id)).toEqual(['next', 'sunday']);
    expect(queryCalendar([doc], query({ countries: ['US', 'CA'], categories: ['Inflation'], highImportance: true }), now).rows.map(row => row.event.id)).toEqual(['today']);
    expect(queryCalendar([doc], query({ includeCancelled: true }), now).rows).toHaveLength(5);
    expect(() => queryCalendar([doc], query({ period: 'custom', from: '2026-10-15', to: '2026-10-14' }), now)).toThrow();
  });
  it('does not merge event IDs across different source documents', () => {
    const first = document([event('same')]), second = structuredClone(first); second.id = 'another-source';
    const result = queryCalendar([first, second], query(), 500); expect(result.rows).toHaveLength(2); expect(new Set(result.rows.map(row => row.key)).size).toBe(2);
    expect(() => restoreCalendarState({ ...createCalendarState(), documents: [first, first] })).toThrow('Duplicate');
  });
});
describe('calendar numerical oracles, sorting, export and draft isolation', () => {
  it('computes negative-forecast surprise and distinguishes offering proceeds from market capitalization', () => {
    const doc = document([event('ipo', { kind: 'ipo', values: { epsActual: amount(-1, 'USD/share'), epsForecast: amount(-2, 'USD/share'), offerPrice: amount(10, 'USD/share'), sharesOffered: amount(100, 'shares'), sharesOutstanding: amount(1000, 'shares'), splitNumerator: amount(4, 'ratio'), splitDenominator: amount(1, 'ratio') } })]);
    const derived = queryCalendar([doc], query(), 500).rows[0].derived;
    expect(derived.epsSurprisePercent.value).toBe(50); expect(derived.dealAmount).toMatchObject({ value: 1000, unit: 'USD' }); expect(derived.ipoMarketCap).toMatchObject({ value: 10000, unit: 'USD' }); expect(derived.splitRatio.value).toBe(4);
    const zero = structuredClone(doc); zero.events[0].values.epsForecast!.value = 0; expect(queryCalendar([zero], query(), 500).rows[0].derived.epsSurprisePercent.value).toBeNull();
    const incompatible = structuredClone(doc); incompatible.events[0].values.offerPrice!.unit = '%'; const invalid = queryCalendar([incompatible], query(), 500).rows[0].derived;
    expect(invalid.dealAmount.value).toBeNull(); expect(invalid.dealAmount.reason).toContain('ISO currency');
    incompatible.events[0].values.offerPrice!.unit = 'USD'; delete incompatible.events[0].values.sharesOutstanding; expect(queryCalendar([incompatible], query(), 500).rows[0].derived.ipoMarketCap.value).toBeNull();
  });
  it('sorts nulls last in both directions and does not compare raw numbers across different units', () => {
    const doc = document([event('usd', { values: { actual: amount(1, 'USD') } }), event('eur', { values: { actual: amount(100, 'EUR') } }), event('missing')]);
    const result = queryCalendar([doc], query({ sort: { key: 'actual', direction: 'asc' } }), 500);
    expect(result.rows.map(row => row.event.id)).toEqual(['eur', 'usd', 'missing']); expect(result.diagnostics[0]).toContain('different units');
    expect(queryCalendar([doc], query({ sort: { key: 'actual', direction: 'desc' } }), 500).rows.at(-1)!.event.id).toBe('missing');
  });
  it('escapes spreadsheet formulas and exports visible values with provenance and availability', () => {
    const doc = document([event('formula', { title: '=HYPERLINK("https://example.invalid")', values: { actual: amount(876543, '%', 900) } })]);
    const csv = calendarRowsToCsv(queryCalendar([doc], query({ asOf: 200 }), 500));
    expect(csv).toContain("'=HYPERLINK"); expect(csv).toContain('SYNTHETIC TEST EVENTS'); expect(csv).toContain('not-yet-available'); expect(csv).not.toContain('876543');
  });
  it('roundtrips state and leaves saved state unchanged after a cancelled draft or failed import', () => {
    const original = { ...createCalendarState(), documents: [document([event()])] }, before = JSON.stringify(original), draft = restoreCalendarState(original);
    draft.query.search = 'changed'; draft.documents[0].events[0].title = 'draft'; expect(JSON.stringify(original)).toBe(before);
    expect(restoreCalendarState(JSON.parse(JSON.stringify(original)))).toEqual(original);
    expect(parseCalendarJson('{"events": "broken"}', options).ok).toBe(false); expect(JSON.stringify(original)).toBe(before);
    expect(() => restoreCalendarDocument({ ...original.documents[0], provenance: { ...original.documents[0].provenance, fixture: false } })).toThrow('synthetic');
  });
});
