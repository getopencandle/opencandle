import { describe, expect, it } from 'vitest';
import { CALENDAR_CSV_TEMPLATE, calendarCoverage, calendarEventToIcs, calendarJsonTemplate, calendarPeriodRange, calendarRowsToCsv, createCalendarState, createSyntheticCalendarDemo, describeCalendarEmpty, parseCalendarCsv, parseCalendarJson, queryCalendar, restoreCalendarState, shiftCalendarPeriod, SYNTHETIC_CALENDAR_DEMO_ID, type CalendarDocument, type CalendarQuery } from '../../src/domain/calendar';

// Calendar model tests. Expected values are worked out by hand from the IANA rules
// and the documented LV policies, not read back from the implementation.
const at = (iso: string) => Date.parse(iso) / 1000;
function doc(events: unknown[], id = 'lv-c07-synthetic'): CalendarDocument { const parsed = parseCalendarJson(JSON.stringify(events), { documentId: id, sourceLabel: 'SYNTHETIC OpenCandle-C07 TEST EVENTS', fixture: true, now: at('2026-01-01T00:00:00Z') }); if (!parsed.ok) throw new Error(parsed.diagnostics.join(' ')); return parsed.document!; }
const q = (extra: Partial<CalendarQuery> = {}): CalendarQuery => ({ ...createCalendarState().query, ...extra });
const v = (value: number | null, unit: string, availableAt: number | null = 1) => ({ value, unit, availableAt });
const exact = (id: string, iso: string, extra: Record<string, unknown> = {}) => ({ id, kind: 'economic', title: `Synthetic ${id}`, date: iso.slice(0, 10), time: iso, timezone: 'UTC', timing: 'exact', publishedAt: 1, ...extra });

describe('DST transitions and date boundaries across display timezones', () => {
  it('shows the New York spring gap and the London fall repeat with offsets and instant order', () => {
    const d = doc([exact('ny-before', '2026-03-08T06:59:59Z'), exact('ny-after', '2026-03-08T07:00:00Z'), exact('ldn-first', '2026-10-25T00:30:00Z'), exact('ldn-second', '2026-10-25T01:30:00Z')]);
    const ny = queryCalendar([d], q({ timezone: 'America/New_York', period: 'custom', from: '2026-03-08', to: '2026-03-08' }), at('2026-12-01T00:00:00Z')).rows;
    expect(ny.map(row => [row.event.id, row.displayTime, row.displayOffset])).toEqual([['ny-before', '01:59:59', 'GMT-5'], ['ny-after', '03:00:00', 'GMT-4']]);
    const london = queryCalendar([d], q({ timezone: 'Europe/London', period: 'custom', from: '2026-10-25', to: '2026-10-25' }), at('2026-12-01T00:00:00Z')).rows;
    // ICU spells the zero offset as GMT or GMT+0 depending on version; the two repeated 01:30 rows must still differ.
    expect(london.map(row => [row.event.id, row.displayTime])).toEqual([['ldn-first', '01:30:00'], ['ldn-second', '01:30:00']]); expect(london[0].displayOffset).toBe('GMT+1'); expect(london[1].displayOffset).toMatch(/^GMT(\+0)?$/);
    const descending = queryCalendar([d], q({ timezone: 'Europe/London', period: 'custom', from: '2026-10-25', to: '2026-10-25', sort: { key: 'date', direction: 'desc' } }), at('2026-12-01T00:00:00Z')).rows;
    expect(descending.map(row => row.event.id)).toEqual(['ldn-second', 'ldn-first']);
  });
  it('places one instant on three different dates and applies Today/Yesterday per display timezone', () => {
    const instant = '2026-01-01T10:30:00Z', d = doc([exact('instant', instant), { id: 'day', kind: 'economic', title: 'Synthetic date only', date: '2026-01-01', publishedAt: 1 }]), now = at(instant);
    const show = (timezone: string) => queryCalendar([d], q({ timezone }), now).rows.map(row => [row.event.id, row.displayDate, row.displayTime, row.displayOffset]);
    expect(show('Pacific/Kiritimati')).toEqual([['day', '2026-01-01', null, null], ['instant', '2026-01-02', '00:30:00', 'GMT+14']]);
    expect(show('Pacific/Pago_Pago')).toEqual([['instant', '2025-12-31', '23:30:00', 'GMT-11'], ['day', '2026-01-01', null, null]]);
    expect(show('Asia/Kathmandu')[0]).toEqual(['instant', '2026-01-01', '16:15:00', 'GMT+5:45']);
    expect(queryCalendar([d], q({ timezone: 'Pacific/Kiritimati', period: 'today' }), now).rows.map(row => row.event.id)).toEqual(['instant']);
    expect(queryCalendar([d], q({ timezone: 'Pacific/Kiritimati', period: 'yesterday' }), now).rows.map(row => row.event.id)).toEqual(['day']);
    expect(queryCalendar([d], q({ timezone: 'Pacific/Pago_Pago', period: 'today' }), now).rows.map(row => row.event.id)).toEqual(['instant']);
    expect(queryCalendar([d], q({ timezone: 'Pacific/Pago_Pago', period: 'tomorrow' }), now).rows.map(row => row.event.id)).toEqual(['day']);
  });
  it('computes Monday weeks and shifts bounded periods across the DST week', () => {
    const now = at('2026-03-08T12:00:00Z'); // Sunday 08:00 EDT, the first day of US daylight time.
    expect(calendarPeriodRange({ period: 'this-week', from: null, to: null, timezone: 'America/New_York' }, now)).toEqual({ from: '2026-03-02', to: '2026-03-08' });
    expect(calendarPeriodRange({ period: 'this-week', from: null, to: null, timezone: 'Pacific/Kiritimati' }, now)).toEqual({ from: '2026-03-09', to: '2026-03-15' });
    expect(shiftCalendarPeriod(q({ period: 'this-week', timezone: 'America/New_York' }), 1, now)).toMatchObject({ period: 'custom', from: '2026-03-09', to: '2026-03-15' });
    expect(shiftCalendarPeriod(q({ period: 'today', timezone: 'America/New_York' }), -1, now)).toMatchObject({ period: 'custom', from: '2026-03-07', to: '2026-03-07' });
    expect(shiftCalendarPeriod(q({ period: 'custom', from: '2026-02-27', to: '2026-03-01' }), 1, now)).toMatchObject({ from: '2026-03-02', to: '2026-03-04' });
    expect(shiftCalendarPeriod(q({ period: 'custom', from: '2028-02-28', to: '2028-02-29' }), 1, now)).toMatchObject({ from: '2028-03-01', to: '2028-03-02' });
    expect(shiftCalendarPeriod(q({ period: 'all' }), 1, now)).toBeNull(); expect(shiftCalendarPeriod(q({ period: 'upcoming' }), -1, now)).toBeNull();
    expect(shiftCalendarPeriod(q({ period: 'custom', from: '0001-01-01', to: '0001-01-01' }), -1, now)).toBeNull();
  });
});

describe('all-day and unknown times', () => {
  const now = at('2026-05-05T20:00:00Z');
  const d = doc([
    { id: 'unknown', kind: 'earnings', title: 'Synthetic unknown time', date: '2026-05-05', timing: 'unknown', publishedAt: 1 },
    { id: 'date-only', kind: 'economic', title: 'Synthetic date only', date: '2026-05-05', publishedAt: 1 },
    { id: 'after', kind: 'earnings', title: 'Synthetic after close', date: '2026-05-05', timing: 'after-close', publishedAt: 1 },
    { id: 'before', kind: 'earnings', title: 'Synthetic before open', date: '2026-05-05', timing: 'before-open', publishedAt: 1 },
    exact('late', '2026-05-05T21:00:00Z'), exact('early', '2026-05-05T13:00:00Z'),
  ]);
  it('keeps supplied dates in every timezone and orders exact, before open, after close, date only, unknown', () => {
    for (const timezone of ['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) for (const row of queryCalendar([d], q({ timezone }), now).rows.filter(row => row.event.time === null)) { expect(row.displayDate).toBe('2026-05-05'); expect(row.displayTime).toBeNull(); }
    expect(queryCalendar([d], q(), now).rows.map(row => row.event.id)).toEqual(['early', 'late', 'before', 'after', 'date-only', 'unknown']);
    expect(queryCalendar([d], q({ sort: { key: 'date', direction: 'desc' } }), now).rows.map(row => row.event.id)).toEqual(['late', 'early', 'before', 'after', 'date-only', 'unknown']);
  });
  it('treats today undated events as upcoming but a past exact time as passed, and never invents an instant', () => {
    expect(queryCalendar([d], q({ period: 'upcoming' }), now).rows.map(row => row.event.id)).toEqual(['late', 'before', 'after', 'date-only', 'unknown']);
    expect(parseCalendarJson(JSON.stringify([{ id: 'bad', kind: 'earnings', title: 'Synthetic', date: '2026-05-05', timing: 'before-open', time: '2026-05-05T12:00:00Z', timezone: 'UTC' }])).ok).toBe(false);
    expect(parseCalendarJson(JSON.stringify([{ id: 'bad', kind: 'economic', title: 'Synthetic', date: '2026-05-06', time: '2026-05-05T23:00:00Z', timezone: 'UTC' }])).ok).toBe(false);
  });
});

describe('revised events keep previous and revised values distinct', () => {
  const base = { id: 'cpi', kind: 'economic', title: 'Synthetic CPI', date: '2026-02-10', country: 'XA' };
  const d = doc([
    { ...base, revision: 1, publishedAt: 100, values: { forecast: v(2, '%', 100), prior: v(1, '%', 100) } },
    { ...base, revision: 2, publishedAt: 200, date: '2026-02-11', status: 'tentative', values: { forecast: v(2, '%', 100), prior: v(1.1, '%', 200), priorRevisedFrom: v(1, '%', 100) } },
    { ...base, revision: 3, publishedAt: 400, date: '2026-02-11', status: 'released', values: { actual: v(7.77, '%', 400), forecast: v(2, '%', 100), prior: v(1.1, '%', 200), priorRevisedFrom: v(1, '%', 100) } },
  ]);
  it('shows the revision eligible at each cutoff with only already-published history', () => {
    const first = queryCalendar([d], q({ asOf: 150 }), 500).rows[0];
    expect(first.event.revision).toBe(1); expect(first.revisions).toEqual({ history: [{ revision: 1, publishedAt: 100, status: 'scheduled', date: '2026-02-10', time: null, timing: 'date-only' }], previousRevision: null, changes: [] });
    const second = queryCalendar([d], q({ asOf: 250 }), 500);
    expect(second.rows[0].event.revision).toBe(2); expect(second.rows[0].revisions.history.map(entry => entry.revision)).toEqual([1, 2]); expect(second.coverage.revised).toBe(1);
    expect(second.rows[0].revisions.changes).toEqual([
      { field: 'date', before: '2026-02-10', after: '2026-02-11' }, { field: 'status', before: 'scheduled', after: 'tentative' },
      { field: 'prior', before: 1, after: 1.1, unitBefore: '%', unitAfter: '%' }, { field: 'priorRevisedFrom', before: null, after: 1, unitBefore: null, unitAfter: '%' },
    ]);
    expect(second.rows[0].values.prior.value).toBe(1.1); expect(second.rows[0].values.priorRevisedFrom.value).toBe(1);
    expect(JSON.stringify(second)).not.toContain('7.77'); expect(calendarRowsToCsv(second)).not.toContain('7.77'); expect(calendarRowsToCsv(second)).toContain('"date status prior priorRevisedFrom"');
    const latest = queryCalendar([d], q(), 500).rows[0]; expect(latest.revisions.previousRevision).toBe(2); expect(latest.revisions.changes.map(change => change.field)).toEqual(['status', 'actual']);
  });
  it('excludes an undated revision from history under a historical cutoff but uses it in the latest view', () => {
    const undated = doc([{ ...base, revision: 1, publishedAt: 100 }, { ...base, revision: 2, publishedAt: null, title: 'Synthetic CPI corrected title' }]);
    expect(queryCalendar([undated], q({ asOf: 300 }), 500).rows[0].revisions.history).toHaveLength(1);
    expect(queryCalendar([undated], q(), 500).rows[0].revisions.changes).toEqual([{ field: 'title', before: 'Synthetic CPI', after: 'Synthetic CPI corrected title' }]);
  });
  it('masks a revised value that is not yet available in both the previous and revised columns', () => {
    const masked = doc([{ ...base, revision: 1, publishedAt: 100, values: { forecast: v(5, '%', 100) } }, { ...base, revision: 2, publishedAt: 150, values: { forecast: v(6.66, '%', 900) } }]);
    const row = queryCalendar([masked], q({ asOf: 200 }), 1000).rows[0];
    expect(row.revisions.changes).toEqual([{ field: 'forecast', before: 5, after: null, unitBefore: '%', unitAfter: '%' }]); expect(JSON.stringify(row)).not.toContain('6.66');
  });
});

describe('each event type, filters and sorting', () => {
  const now = at('2026-06-10T12:00:00Z');
  const d = doc([
    { id: 'e1', kind: 'economic', title: 'Synthetic rates', date: '2026-06-10', country: 'XA', category: 'Interest rates', importance: 'high', publishedAt: 1, values: { actual: v(4, '%'), forecast: v(4.25, '%'), prior: v(4.5, '%') } },
    { id: 'e2', kind: 'economic', title: 'Synthetic inflation', date: '2026-06-11', country: 'XB', category: 'Inflation', importance: 'medium', publishedAt: 1 },
    { id: 'e3', kind: 'economic', title: 'Synthetic bonds', date: '2026-06-12', country: 'xa', category: 'Bonds', publishedAt: 1, status: 'cancelled' },
    { id: 'r1', kind: 'earnings', title: 'Synthetic earnings A', date: '2026-06-10', timing: 'before-open', symbol: 'SYNA', publishedAt: 1, fiscalPeriod: 'Q2', values: { epsForecast: v(2, 'USD/share'), epsActual: v(2.5, 'USD/share'), revenueForecast: v(1000, 'USD'), revenueActual: v(900, 'USD'), marketCap: v(50000, 'USD') } },
    { id: 'r2', kind: 'earnings', title: 'Synthetic earnings B', date: '2026-06-11', timing: 'after-close', symbol: 'synb', publishedAt: 1, values: { marketCap: v(70000, 'USD') } },
    { id: 'd1', kind: 'dividend', title: 'Synthetic dividend A', date: '2026-06-15', symbol: 'SYNA', exDate: '2026-06-15', payDate: '2026-07-01', publishedAt: 1, values: { dividendAmount: v(0.5, 'USD'), dividendYield: v(2, '%') } },
    { id: 'd2', kind: 'dividend', title: 'Synthetic dividend B', date: '2026-06-12', symbol: 'SYNB', exDate: '2026-06-12', publishedAt: 1, values: { dividendAmount: v(0.25, 'USD') } },
    { id: 'i1', kind: 'ipo', title: 'Synthetic IPO A', date: '2026-06-20', symbol: 'SYNC', exchange: 'ZETA DEMO', status: 'tentative', publishedAt: 1, values: { offerPrice: v(20, 'USD/share'), sharesOffered: v(1000, 'shares'), sharesOutstanding: v(5000, 'shares') } },
    { id: 'i2', kind: 'ipo', title: 'Synthetic IPO B', date: '2026-06-18', symbol: 'SYND', exchange: 'ALPHA DEMO', publishedAt: 1 },
    { id: 's1', kind: 'split', title: 'Synthetic split', date: '2026-06-22', symbol: 'SYNA', publishedAt: 1, values: { splitNumerator: v(3, 'ratio'), splitDenominator: v(2, 'ratio') } },
  ]);
  const ids = (extra: Partial<CalendarQuery>) => queryCalendar([d], q(extra), now).rows.map(row => row.event.id);
  it('separates kinds and computes kind-specific values with hand-checked numbers', () => {
    expect(ids({ kind: 'economic' })).toEqual(['e1', 'e2']); expect(ids({ kind: 'earnings' })).toEqual(['r1', 'r2']); expect(ids({ kind: 'dividend' })).toEqual(['d2', 'd1']); expect(ids({ kind: 'ipo' })).toEqual(['i2', 'i1']); expect(ids({ kind: 'split' })).toEqual(['s1']);
    const rows = queryCalendar([d], q(), now).rows, row = (id: string) => rows.find(item => item.event.id === id)!;
    expect(row('r1').derived.epsSurprisePercent.value).toBe(25); expect(row('r1').derived.revenueSurprisePercent.value).toBe(-10); expect(row('r1').values.marketCap).toMatchObject({ value: 50000, unit: 'USD', state: 'available' });
    expect(row('r2').derived.epsSurprisePercent).toMatchObject({ value: null, state: 'missing' });
    expect(row('i1').derived.dealAmount).toMatchObject({ value: 20000, unit: 'USD' }); expect(row('i1').derived.ipoMarketCap).toMatchObject({ value: 100000, unit: 'USD' }); expect(row('i1').event.exchange).toBe('ZETA DEMO'); expect(row('i2').derived.dealAmount.value).toBeNull();
    expect(row('s1').derived.splitRatio.value).toBe(1.5); expect(row('d2').event.payDate).toBeNull();
  });
  it('combines OR within selectors and AND across selectors, case-insensitively, with cancelled and importance gates', () => {
    expect(ids({ countries: ['XA'] })).toEqual(['e1']); expect(ids({ countries: ['XA'], includeCancelled: true })).toEqual(['e1', 'e3']);
    expect(ids({ countries: ['XA', 'XB'], categories: ['Inflation', 'Bonds'], includeCancelled: true })).toEqual(['e2', 'e3']);
    expect(ids({ highImportance: true })).toEqual(['e1']); expect(ids({ kind: 'earnings', symbols: ['SYNB'] })).toEqual(['r2']); expect(ids({ symbols: ['syna'], period: 'custom', from: '2026-06-11', to: '2026-06-30' })).toEqual(['d1', 's1']);
    expect(ids({ search: 'ipo', period: 'upcoming' })).toEqual(['i2', 'i1']); expect(ids({ kind: 'economic', period: 'tomorrow' })).toEqual(['e2']);
  });
  it('sorts by importance, ex-date, pay date, exchange and market cap with missing values last in both directions', () => {
    expect(ids({ kind: 'economic', includeCancelled: true, sort: { key: 'importance', direction: 'desc' } })).toEqual(['e1', 'e2', 'e3']);
    expect(ids({ kind: 'economic', includeCancelled: true, sort: { key: 'importance', direction: 'asc' } })).toEqual(['e2', 'e1', 'e3']);
    expect(ids({ kind: 'dividend', sort: { key: 'exDate', direction: 'desc' } })).toEqual(['d1', 'd2']); expect(ids({ kind: 'dividend', sort: { key: 'payDate', direction: 'asc' } })).toEqual(['d1', 'd2']); expect(ids({ kind: 'dividend', sort: { key: 'payDate', direction: 'desc' } })).toEqual(['d1', 'd2']);
    expect(ids({ kind: 'ipo', sort: { key: 'exchange', direction: 'asc' } })).toEqual(['i2', 'i1']); expect(ids({ kind: 'ipo', sort: { key: 'dealAmount', direction: 'asc' } })).toEqual(['i1', 'i2']);
    expect(ids({ kind: 'earnings', sort: { key: 'marketCap', direction: 'desc' } })).toEqual(['r2', 'r1']);
  });
});

describe('coverage, empty versus unavailable states, templates and synthetic demo', () => {
  const now = at('2026-06-10T12:00:00Z'), d = doc([{ id: 'e', kind: 'economic', title: 'Synthetic', date: '2026-06-01', publishedAt: at('2026-05-01T00:00:00Z') }, { id: 'e', kind: 'economic', title: 'Synthetic', date: '2026-06-03', revision: 2, publishedAt: at('2026-05-02T00:00:00Z') }]);
  const empty = (documents: CalendarDocument[], extra: Partial<CalendarQuery>) => { const query = q(extra); let result = null, error = ''; try { result = queryCalendar(documents, query, now); } catch (cause) { error = String(cause); } return describeCalendarEmpty(documents, query, result, error, now); };
  it('reports imported coverage by source date and classifies each zero-row reason', () => {
    expect(calendarCoverage([d], 'economic', { asOf: null, now })).toEqual({ identities: 1, unavailableAtCutoff: 0, documents: 1, syntheticDocuments: 1, from: '2026-06-03', to: '2026-06-03' }); expect(calendarCoverage([d], 'ipo', { asOf: null, now }).identities).toBe(0);
    expect(empty([], {})).toMatchObject({ reason: 'no-documents', availability: 'unavailable' }); expect(empty([], {}).message).toContain('No event documents imported');
    expect(empty([d], { kind: 'ipo' })).toMatchObject({ reason: 'no-kind-coverage', availability: 'unavailable' });
    expect(empty([d], { asOf: at('2026-04-01T00:00:00Z') })).toMatchObject({ reason: 'cutoff', availability: 'unavailable' });
    expect(empty([d], { period: 'upcoming' })).toMatchObject({ reason: 'outside-coverage', availability: 'unavailable' });
    expect(empty([d], { period: 'custom', from: '2026-06-06', to: '2026-06-09' })).toMatchObject({ reason: 'outside-coverage' });
    expect(empty([d], { period: 'custom', from: '2026-06-05', to: '2026-06-09' })).toMatchObject({ reason: 'filtered', availability: 'empty' });
    expect(empty([d], { search: 'nothing matches' })).toMatchObject({ reason: 'filtered', availability: 'empty' });
    expect(empty([d], { period: 'custom', from: '2026-06-09', to: '2026-06-01' }).reason).toBe('error');
  });
  it('offers templates that cannot create events and accepts the new exchange and market cap fields from CSV', () => {
    const template = parseCalendarJson(calendarJsonTemplate(now)); expect(template.ok).toBe(true); expect(template.document!.events).toEqual([]); expect(template.document!.provenance.kind).toBe('local-import');
    expect(parseCalendarCsv(CALENDAR_CSV_TEMPLATE).ok).toBe(false);
    const csv = parseCalendarCsv('id,kind,title,date,exchange,symbol,marketCap,marketCapUnit,marketCapAvailableAt,priorRevisedFrom,priorRevisedFromUnit\nx,ipo,Synthetic,2026-06-10,ZETA DEMO,SYNZ,1000,USD,5,,\n', { fixture: true, documentId: 'csv' });
    expect(csv.ok).toBe(true); expect(csv.document!.events[0]).toMatchObject({ exchange: 'ZETA DEMO', values: { marketCap: { value: 1000, unit: 'USD', availableAt: 5 } } }); expect(csv.document!.events[0].values.priorRevisedFrom).toBeUndefined();
    expect(parseCalendarJson(JSON.stringify([{ id: 'neg', kind: 'earnings', title: 'Synthetic', date: '2026-06-10', values: { marketCap: v(-1, 'USD') } }])).ok).toBe(false);
  });
  it('builds a deterministic, fully labelled synthetic demo covering every tab and a revision', () => {
    const demo = createSyntheticCalendarDemo(now); expect(createSyntheticCalendarDemo(now)).toEqual(demo);
    expect(demo).toMatchObject({ id: SYNTHETIC_CALENDAR_DEMO_ID, provenance: { kind: 'synthetic', fixture: true } }); expect(demo.provenance.label).toContain('SYNTHETIC');
    expect(demo.events.every(event => event.title.startsWith('Synthetic demo:') && event.description.includes('not a real event'))).toBe(true);
    expect(new Set(demo.events.map(event => event.kind))).toEqual(new Set(['economic', 'earnings', 'dividend', 'ipo', 'split']));
    expect(new Set(demo.events.flatMap(event => event.country ? [event.country] : []))).toEqual(new Set(['XA', 'XB']));
    const result = queryCalendar([demo], q({ includeCancelled: true }), now + 3600); expect(result.coverage.synthetic).toBe(result.rows.length); expect(result.coverage.revised).toBe(2);
    const cpi = result.rows.find(row => row.event.id === 'econ-price-index')!; expect(cpi.values.actual.state).toBe('available'); expect(cpi.values.prior.value).toBe(2.7); expect(cpi.values.priorRevisedFrom.value).toBe(2.6);
    const early = queryCalendar([demo], q(), now - 2 * 3600).rows.find(row => row.event.id === 'econ-price-index')!; expect(early.values.actual.state).toBe('not-yet-available');
    expect(restoreCalendarState({ ...createCalendarState(), documents: [demo] }).documents[0]).toEqual(demo);
  });
});

describe('persistence and local iCalendar export', () => {
  it('round-trips the new fields and sort keys and restores legacy events without an exchange', () => {
    const d = doc([{ id: 'x', kind: 'ipo', title: 'Synthetic', date: '2026-06-10', exchange: 'ZETA DEMO', publishedAt: 1, values: { marketCap: v(5, 'USD'), priorRevisedFrom: v(-1, '%') } }]);
    const state = { ...createCalendarState(), documents: [d], query: q({ kind: 'dividend', period: 'custom', from: '2026-06-01', to: '2026-06-30', timezone: 'Asia/Kathmandu', countries: ['XA'], sort: { key: 'exDate', direction: 'desc' } }) };
    expect(restoreCalendarState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    const legacy = JSON.parse(JSON.stringify(state)); delete legacy.documents[0].events[0].exchange; expect(restoreCalendarState(legacy).documents[0].events[0].exchange).toBeNull();
    expect(() => restoreCalendarState({ ...state, query: { ...state.query, sort: { key: 'unknownColumn', direction: 'asc' } } })).toThrow('Invalid calendar query');
    expect(() => restoreCalendarState({ ...state, query: { ...state.query, timezone: 'Mars/Olympus' } })).toThrow();
  });
  it('writes RFC 5545 text with UTC or all-day dates, escaping, folding and no values', () => {
    const d = doc([exact('exact', '2026-03-08T07:00:00Z', { title: 'Synthetic, rate; decision\nsecond line ' + 'x'.repeat(120), symbol: 'SYN', status: 'cancelled', revision: 3, values: { actual: v(98765.4321, '%') } }), { id: 'all-day', kind: 'dividend', title: 'Synthetic dividend', date: '2026-12-31', timing: 'before-open', publishedAt: 1 }]);
    const rows = queryCalendar([d], q({ includeCancelled: true }), at('2027-01-01T00:00:00Z')).rows, ics = calendarEventToIcs(rows.find(row => row.event.id === 'exact')!, at('2026-01-02T03:04:05Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true); expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('\r\nDTSTART:20260308T070000Z\r\n'); expect(ics).toContain('\r\nDTSTAMP:20260102T030405Z\r\n'); expect(ics).toContain('\r\nSTATUS:CANCELLED\r\n'); expect(ics).toContain('\r\nSEQUENCE:2\r\n');
    const unfolded = ics.replace(/\r\n /g, ''); expect(unfolded).toContain('SUMMARY:SYNTHETIC: Synthetic\\, rate\\; decision\\nsecond line'); expect(unfolded).not.toContain('98765');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const allDay = calendarEventToIcs(rows.find(row => row.event.id === 'all-day')!, at('2026-01-02T03:04:05Z'));
    expect(allDay).toContain('\r\nDTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101\r\n'); expect(allDay).not.toContain('STATUS:'); expect(allDay).not.toMatch(/DTSTART:\d/);
  });
});
