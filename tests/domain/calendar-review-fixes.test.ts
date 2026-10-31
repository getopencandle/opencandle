import { describe, expect, it } from 'vitest';
import { calendarCoverage, calendarEventToIcs, restoreCalendarDocument, calendarRowsToCsv, calendarSelectorValues, createCalendarState, describeCalendarEmpty, parseCalendarJson, queryCalendar, type CalendarDocument, type CalendarQuery } from '../../src/domain/calendar';
import { calendarSortChoices, resetCalendarFilters, selectCalendarPeriod } from '../../src/ui/CalendarDialog';

// Regression tests for the LV-C07 independent review findings (cutoff leaks through
// coverage/selectors, per-tab cutoff state, coverage widening, custom-range prefill,
// CSV column positions, multi-byte ICS folding, year-limit dates, multi-revision workload).
const at = (iso: string) => Date.parse(iso) / 1000;
function doc(events: unknown[], id = 'review-synthetic'): CalendarDocument { const parsed = parseCalendarJson(JSON.stringify(events), { documentId: id, sourceLabel: 'SYNTHETIC REVIEW EVENTS', fixture: true, now: 1 }); if (!parsed.ok) throw new Error(parsed.diagnostics.join(' ')); return parsed.document!; }
const q = (extra: Partial<CalendarQuery> = {}): CalendarQuery => ({ ...createCalendarState().query, ...extra });
const describeAt = (documents: CalendarDocument[], query: CalendarQuery, now: number) => describeCalendarEmpty(documents, query, queryCalendar(documents, query, now), '', now);

describe('information cutoff applies to coverage, selectors and per-tab empty states', () => {
  const now = at('2026-07-01T00:00:00Z');
  const d = doc([
    { id: 'econ', kind: 'economic', title: 'Synthetic', date: '2026-06-01', country: 'XA', publishedAt: 100 },
    { id: 'econ', kind: 'economic', title: 'Synthetic', date: '2026-06-20', country: 'XB', revision: 2, publishedAt: 900 },
    { id: 'earn', kind: 'earnings', title: 'Synthetic', date: '2026-06-05', symbol: 'LATE', publishedAt: 900 },
    { id: 'undated', kind: 'earnings', title: 'Synthetic', date: '2026-06-06', symbol: 'UNDATED', publishedAt: null },
  ]);
  it('measures coverage on eligible revisions only', () => {
    expect(calendarCoverage([d], 'economic', { asOf: 500, now })).toEqual({ identities: 1, unavailableAtCutoff: 0, documents: 1, syntheticDocuments: 1, from: '2026-06-01', to: '2026-06-01' });
    expect(calendarCoverage([d], 'economic', { asOf: null, now })).toMatchObject({ from: '2026-06-20', to: '2026-06-20' });
    expect(calendarCoverage([d], 'earnings', { asOf: 500, now })).toMatchObject({ identities: 0, unavailableAtCutoff: 0 }); // second review L1: never counted under a historical cutoff
    expect(calendarCoverage([d], 'earnings', { asOf: null, now })).toMatchObject({ identities: 2, unavailableAtCutoff: 0 });
    expect(calendarCoverage([d], 'all', { asOf: null, now: 500 })).toMatchObject({ identities: 2, unavailableAtCutoff: 1 });
  });
  it('lists selector values only from eligible revisions', () => {
    expect(calendarSelectorValues([d], 'economic', 'country', { asOf: 500, now })).toEqual(['XA']);
    expect(calendarSelectorValues([d], 'economic', 'country', { asOf: null, now })).toEqual(['XB']);
    expect(calendarSelectorValues([d], 'earnings', 'symbol', { asOf: 500, now })).toEqual([]);
    expect(calendarSelectorValues([d], 'all', 'symbol', { asOf: null, now })).toEqual(['LATE', 'UNDATED']);
  });
  it('reports a tab as unavailable at the cutoff even when other kinds are available', () => {
    expect(describeAt([d], q({ kind: 'earnings', asOf: 500 }), now)).toMatchObject({ reason: 'cutoff', availability: 'unavailable' });
    const outside = describeAt([d], q({ kind: 'economic', asOf: 500, period: 'custom', from: '2026-06-18', to: '2026-06-22' }), now);
    expect(outside.reason).toBe('outside-coverage'); expect(outside.message).not.toContain('2026-06-20');
    expect(describeAt([d], q({ kind: 'economic', period: 'custom', from: '2026-06-18', to: '2026-06-22', search: 'none' }), now).reason).toBe('filtered');
  });
});

describe('coverage widening covers the full UTC+14 to UTC-11 date spread', () => {
  it('keeps a filtered cross-timezone exact event as empty, not outside coverage', () => {
    const d = doc([{ id: 'x', kind: 'economic', title: 'Synthetic', date: '2026-01-02', time: '2026-01-01T10:30:00Z', timezone: 'Pacific/Kiritimati', publishedAt: 1 }]), now = at('2026-02-01T00:00:00Z');
    const visible = queryCalendar([d], q({ timezone: 'Pacific/Pago_Pago', period: 'custom', from: '2025-12-31', to: '2025-12-31' }), now); expect(visible.rows.map(row => row.displayDate)).toEqual(['2025-12-31']);
    expect(describeAt([d], q({ timezone: 'Pacific/Pago_Pago', period: 'custom', from: '2025-12-31', to: '2025-12-31', search: 'none' }), now).reason).toBe('filtered');
    expect(describeAt([d], q({ period: 'custom', from: '2025-12-30', to: '2025-12-30' }), now).reason).toBe('outside-coverage');
  });
});

describe('custom range prefill never mixes stale and fresh dates', () => {
  const now = at('2026-06-10T12:00:00Z'), base = createCalendarState().query;
  it('uses the replaced preset range or today and keeps from <= to', () => {
    const cleared = { ...base, period: 'custom' as const, from: '2030-05-01', to: null };
    const today = selectCalendarPeriod(cleared, 'today', now); expect(today).toMatchObject({ period: 'today', from: '2030-05-01', to: null });
    expect(selectCalendarPeriod(today, 'custom', now)).toMatchObject({ period: 'custom', from: '2026-06-10', to: '2026-06-10' });
    expect(selectCalendarPeriod({ ...base, period: 'this-week', from: '2020-01-01', to: '2020-01-03' }, 'custom', now)).toMatchObject({ from: '2026-06-08', to: '2026-06-14' });
    expect(selectCalendarPeriod({ ...base, period: 'upcoming', from: '2020-01-01', to: '2020-01-03' }, 'custom', now)).toMatchObject({ from: '2026-06-10', to: '2026-06-10' });
    expect(selectCalendarPeriod(cleared, 'custom', now)).toMatchObject({ from: '2030-05-01', to: '2030-05-01' });
    expect(selectCalendarPeriod({ ...base, period: 'custom', from: '2026-07-01', to: '2026-06-01' }, 'custom', now)).toMatchObject({ from: '2026-07-01', to: '2026-07-01' });
  });
});

describe('export formats', () => {
  it('keeps every pre-LV-C07 CSV column position and appends new columns at the end', () => {
    const d = doc([{ id: 'x', kind: 'ipo', title: 'Synthetic', date: '2026-06-10', exchange: 'ZETA DEMO', publishedAt: 1, values: { actual: { value: 1, unit: '%', availableAt: 1 }, marketCap: { value: 5, unit: 'USD', availableAt: 1 } } }]);
    const [header, row] = calendarRowsToCsv(queryCalendar([d], q(), 10)).split('\r\n').map(line => line.split(',').map(cell => cell.replace(/^"|"$/g, '')));
    expect(header.slice(0, 21)).toEqual(['documentId', 'eventId', 'revision', 'kind', 'title', 'displayDate', 'displayTime', 'displayOffset', 'sourceDate', 'sourceTimezone', 'timing', 'symbol', 'country', 'importance', 'status', 'publishedAt', 'sourceLabel', 'sourceUrl', 'license', 'fixture', 'actual']);
    expect(header.slice(76, 81)).toEqual(['epsSurprisePercent', 'revenueSurprisePercent', 'dealAmount', 'ipoMarketCap', 'splitRatio']);
    expect(header.slice(81)).toEqual(['fiscalPeriod', 'exDate', 'payDate', 'exchange', 'previousRevision', 'revisedFields', 'marketCap', 'marketCapUnit', 'marketCapAvailability', 'marketCapAvailableAt', 'priorRevisedFrom', 'priorRevisedFromUnit', 'priorRevisedFromAvailability', 'priorRevisedFromAvailableAt']);
    expect(row[20]).toBe('1'); expect(row[84]).toBe('ZETA DEMO'); expect(row[87]).toBe('5'); expect(row).toHaveLength(header.length);
  });
  it('folds multi-byte iCalendar text on code-point boundaries and handles the last supported date', () => {
    const title = 'Synthetic é ünï 日本 😀 '.repeat(8).trim(), d = doc([{ id: 'mb', kind: 'economic', title, date: '9999-12-31', publishedAt: 1 }]);
    const ics = calendarEventToIcs(queryCalendar([d], q(), 10).rows[0], 10);
    for (const line of ics.split('\r\n')) { expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75); expect(line).not.toMatch(/[\uD800-\uDBFF]$/); expect(line).not.toMatch(/^ ?[\uDC00-\uDFFF]/); }
    expect(ics.replace(/\r\n /g, '')).toContain(`SUMMARY:SYNTHETIC: ${title}`);
    expect(ics).toContain('DTSTART;VALUE=DATE:99991231'); expect(ics).not.toContain('DTEND'); expect(ics).not.toContain('+0100');
  });
});

describe('declared host workload with revision history, not packaged responsiveness', () => {
  it('queries 25,000 revisions in 5,000 five-revision groups with change diffs', () => {
    const start0 = at('2026-03-01T00:00:00Z'), events = Array.from({ length: 25000 }, (_, index) => { const id = Math.floor(index / 5), revision = index % 5 + 1, time = start0 + id * 8; return { id: String(id), revision, kind: 'economic', title: `Synthetic workload ${id}`, date: '2026-03-01', time, timezone: 'UTC', publishedAt: time - 10000 + revision, values: { forecast: { value: revision, unit: '%', availableAt: time - 10000 + revision } } }; });
    // Built as a document directly: this workload exceeds the 10 MiB single-import limit but fits the 20 MiB state limit.
    const workload = restoreCalendarDocument({ schemaVersion: 1, id: 'workload', provenance: { kind: 'synthetic', label: 'SYNTHETIC WORKLOAD', sourceUrl: null, importedAt: start0, license: 'Synthetic test data', fixture: true }, events });
    const begin = performance.now(), result = queryCalendar([workload], q({ timezone: 'America/New_York', asOf: start0 - 10000 + 482 }), start0 + 86400), elapsedMs = performance.now() - begin;
    expect(result.coverage.identities).toBe(5000); expect(result.rows.find(row => row.event.id === '0')!.revisions).toMatchObject({ previousRevision: 4, changes: [{ field: 'forecast', before: 4, after: 5 }] });
    expect(result.rows.find(row => row.event.id === '60')!.event.revision).toBe(2);
    console.log(JSON.stringify({ kind: 'host-calendar-revision-workload', revisions: 25000, identities: 5000, elapsedMs: Number(elapsedMs.toFixed(2)), limitation: 'One host unit-runtime workload; no GUI or packaged performance pass.' }));
    expect(elapsedMs).toBeLessThan(10000);
  });
});

describe('second review fixes (L1-L4, sort labels)', () => {
  const now = at('2026-07-01T00:00:00Z');
  const d = doc([{ id: 'econ', kind: 'economic', title: 'Synthetic', date: '2026-06-01', publishedAt: 100 }, { id: 'later-ipo', kind: 'ipo', title: 'Synthetic later IPO', date: '2026-06-02', publishedAt: 900 }]);
  it('L1: a historical cutoff gives the same answer whether or not later events of a kind exist', () => {
    const ipo = describeAt([d], q({ kind: 'ipo', asOf: 500 }), now), split = describeAt([d], q({ kind: 'split', asOf: 500 }), now);
    expect({ ...ipo, message: ipo.message.replace(' ipo ', ' KIND ') }).toEqual({ ...split, message: split.message.replace(' splits ', ' KIND ') }); expect(ipo).toMatchObject({ reason: 'cutoff', availability: 'unavailable' }); expect(ipo.message).not.toMatch(/\d+ imported/);
    expect(calendarCoverage([d], 'ipo', { asOf: 500, now })).toEqual(calendarCoverage([d], 'split', { asOf: 500, now }));
    expect(describeAt([d], q({ kind: 'split' }), now).reason).toBe('no-kind-coverage');
    expect(calendarCoverage([d], 'ipo', { asOf: null, now: 500 })).toMatchObject({ identities: 0, unavailableAtCutoff: 1 });
  });
  it('L2: a tab whose matching events are all cancelled points to Include cancelled events', () => {
    const cancelled = doc([{ id: 'c', kind: 'economic', title: 'Synthetic', date: '2026-06-10', status: 'cancelled', publishedAt: 1 }]);
    expect(describeAt([cancelled], q({ kind: 'economic' }), now)).toMatchObject({ reason: 'cancelled', availability: 'empty' });
    expect(describeAt([cancelled], resetCalendarFilters(q({ kind: 'economic' })), now).reason).toBe('cancelled');
    expect(queryCalendar([cancelled], q({ kind: 'economic', includeCancelled: true }), now).rows).toHaveLength(1);
    expect(describeAt([cancelled], q({ kind: 'economic', search: 'none' }), now).reason).toBe('filtered');
  });
  it('L3: Reset filters keeps the tab, display timezone and information cutoff', () => {
    expect(resetCalendarFilters(q({ kind: 'economic', asOf: 12345, timezone: 'Asia/Tokyo', search: 'x', countries: ['XA'], includeCancelled: true }))).toEqual({ ...createCalendarState().query, kind: 'economic', asOf: 12345, timezone: 'Asia/Tokyo' });
  });
  it('L4: iCalendar TEXT drops C0/C1 controls and DEL but keeps HTAB and escaped line breaks', () => {
    const e = doc([{ id: 'ctl', kind: 'economic', title: 'bell\u0007 esc\u001B del\u007F nel\u0085 tab\there', description: 'a\r\nb', date: '2026-06-10', publishedAt: 1 }]);
    const ics = calendarEventToIcs(queryCalendar([e], q(), now).rows[0], now), unfolded = ics.replace(/\r\n /g, '');
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/); expect(unfolded).toContain('SUMMARY:SYNTHETIC: bell esc del nel tab\there'); expect(unfolded).toContain('a\\nb');
  });
  it('lists only the active tab sort keys plus a restored foreign key', () => {
    expect(calendarSortChoices('dividend', 'date')).toEqual(['date', 'symbol', 'title', 'dividendAmount', 'exDate', 'payDate', 'dividendYield']);
    expect(calendarSortChoices('economic', 'splitRatio')).toEqual(['date', 'country', 'importance', 'title', 'actual', 'forecast', 'prior', 'splitRatio']);
  });
});
