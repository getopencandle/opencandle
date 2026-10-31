import { describe, expect, it } from 'vitest';
import { createSyntheticCalendarDemo, parseCalendarJson } from '../../src/domain/calendar';
import { calendarChartMarkers, calendarZoneLabel } from '../../src/domain/calendar-chart-markers';
import { CALENDAR_MARKER_MAX_LANES, calendarMarkerLanes } from '../../src/domain/calendar-marker-layout';

// 1028: demo flags under Future events only, stacked economic flags, one UTC label.
const DAY = 86400, NOW = Date.parse('2026-06-10T12:00:00Z') / 1000, LATER = NOW + 40 * DAY;
const bars = Array.from({ length: 41 }, (_, index) => ({ time: NOW - 20 * DAY - (NOW % DAY) + index * DAY }));
const on = { earnings: false, dividends: false, splits: false, ipos: false, economic: true, economicFutureOnly: true, timezone: 'UTC' };

describe('calendar chart flags', () => {
  it('shows the OpenCandle demo economic flags with Future events only on; real imports still follow the filter', () => {
    const demo = createSyntheticCalendarDemo(NOW);
    const markers = calendarChartMarkers([demo], 'ANY', bars, on, LATER);
    expect(markers.filter(marker => marker.kind === 'economic').length).toBeGreaterThan(1);
    const economic = [...new Map(demo.events.filter(event => event.kind === 'economic' && event.status !== 'cancelled').map(event => [event.id, { id: event.id, kind: 'economic', title: event.title, date: event.date, publishedAt: 1 }])).values()];
    const copy = parseCalendarJson(JSON.stringify(economic), { documentId: 'my-import', sourceLabel: 'Copy', fixture: true, now: NOW }).document!;
    expect(calendarChartMarkers([copy], 'ANY', bars, on, LATER)).toEqual([]);
    expect(calendarChartMarkers([copy], 'ANY', bars, { ...on, economicFutureOnly: false }, LATER).length).toBeGreaterThan(0);
  });
  it('labels flag times UTC like the calendar, never GMT+0', () => {
    const doc = parseCalendarJson(JSON.stringify([{ id: 'x', kind: 'economic', title: 'Timed', date: '2026-06-01', time: '2026-06-01T12:30:00Z', timezone: 'UTC', timing: 'exact', publishedAt: 1 }]), { documentId: 'timed', sourceLabel: 'T', now: NOW }).document!;
    const [marker] = calendarChartMarkers([doc], 'ANY', bars, { ...on, economicFutureOnly: false }, NOW);
    const line = marker.lines.find(text => text.startsWith('Date:'))!;
    expect(line).toMatch(/12:30(:00)? UTC$/); expect(line).not.toContain('GMT');
    expect(['GMT', 'GMT+0', 'UTC+00:00', 'GMT−5', 'GMT+5:30', 'EST'].map(calendarZoneLabel)).toEqual(['UTC', 'UTC', 'UTC', 'UTC-5', 'UTC+5:30', 'EST']);
  });
  it('stacks flags that would overlap into rows, keeps spaced flags on the base row, and caps the rows', () => {
    expect(calendarMarkerLanes([{ x: 0 }, { x: 8 }, { x: 16 }, { x: 24 }], 16)).toEqual([0, 1, 2, 0]);
    expect(calendarMarkerLanes([{ x: 0 }, { x: 18 }, { x: 36 }], 16)).toEqual([0, 0, 0]);
    expect(calendarMarkerLanes([{ x: 16 }, { x: 0 }], 16)).toEqual([1, 0]);
    expect(CALENDAR_MARKER_MAX_LANES).toBe(3);
    expect(calendarMarkerLanes([{ x: 0 }, { x: 2 }, { x: 4 }], 16, 2, 2)).toEqual([0, 1, 0]);
    expect(calendarMarkerLanes([], 16)).toEqual([]);
  });
});
