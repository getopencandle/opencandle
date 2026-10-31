import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCalendarState, parseCalendarJson, queryCalendar } from '../../src/domain/calendar';

describe('declared host calendar workload, not packaged responsiveness', () => {
  it('measures 5000 exact-time events with bounded timezone formatters and valid results', () => {
    const time = Date.parse('2026-11-01T06:00:00Z') / 1000;
    const events = Array.from({ length: 5000 }, (_, index) => ({ id: String(index), kind: 'economic', title: `Synthetic workload ${index}`, date: '2026-11-01', time: time + index, timezone: 'UTC', publishedAt: time - 1, values: { actual: { value: index, unit: '%', availableAt: time + index } } }));
    const imported = parseCalendarJson(JSON.stringify(events), { documentId: 'performance', fixture: true, now: time }); expect(imported.ok).toBe(true);
    const start = performance.now(), result = queryCalendar([imported.document!], { ...createCalendarState().query, timezone: 'America/New_York' }, time + 6000), elapsedMs = performance.now() - start;
    expect(result.rows).toHaveLength(5000); expect(result.rows[0].event.id).toBe('0'); expect(result.rows.at(-1)!.values.actual.value).toBe(4999);
    console.log(JSON.stringify({ kind: 'host-calendar-workload', at: new Date().toISOString(), node: process.version, events: 5000, elapsedMs: Number(elapsedMs.toFixed(2)), targetMs: 2000, targetMet: elapsedMs < 2000, sourceSha256: createHash('sha256').update(readFileSync('src/domain/calendar.ts')).digest('hex'), limitation: 'One host unit-runtime workload; no GUI or packaged performance pass.' }));
  });
});
