import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyCalendarPreview, CalendarDialog, previewCalendarImport, serializeCalendarState } from '../../src/ui/CalendarDialog';
import { createCalendarState } from '../../src/domain/calendar';

describe('calendar preview commit and static markup only, not executable UI evidence', () => {
  it('does not change saved state on preview, failure or discard, then supports explicit document/state commits', () => {
    const saved = createCalendarState(), before = JSON.stringify(saved);
    const preview = previewCalendarImport('[{"id":"test","kind":"economic","title":"Synthetic test","date":"2026-01-01"}]', 'json', { documentId: 'test', fixture: true });
    expect(JSON.stringify(saved)).toBe(before); expect(() => previewCalendarImport('bad', 'json')).toThrow(); expect(JSON.stringify(saved)).toBe(before);
    const next = applyCalendarPreview(saved, preview); expect(next.documents).toHaveLength(1); expect(saved.documents).toHaveLength(0);
    const statePreview = previewCalendarImport(JSON.stringify(next), 'json'); expect(applyCalendarPreview(saved, statePreview)).toEqual(next);
    statePreview.state!.documents[0].events[0].title = 'changed preview'; expect(next.documents[0].events[0].title).toBe('Synthetic test');
  });
  it('updates only the explicitly matching document identity and enforces combined limits on commit', () => {
    const csv = 'id,kind,title,date\neconomic,economic,Synthetic,2026-01-01';
    const first = previewCalendarImport(csv, 'csv', { documentId: 'one', fixture: true }), other = previewCalendarImport(csv, 'csv', { documentId: 'two', fixture: true });
    const state = applyCalendarPreview(applyCalendarPreview(createCalendarState(), first), other);
    const replacement = previewCalendarImport(csv.replace('Synthetic,', 'Replacement,'), 'csv', { documentId: 'one', fixture: true });
    const next = applyCalendarPreview(state, replacement); expect(next.documents).toHaveLength(2); expect(next.documents.find(document => document.id === 'two')!.events[0].title).toBe('Synthetic'); expect(next.documents.find(document => document.id === 'one')!.events[0].title).toBe('Replacement');
  });
  it('renders an empty local calendar, accessible filters and CSV/JSON chooser and paste controls without fabricated events', () => {
    const markup = renderToStaticMarkup(React.createElement(CalendarDialog, { state: createCalendarState(), onChange: () => {}, onClose: () => {} }));
    expect(markup).toContain('No event feed is connected'); expect(markup).toContain('No event documents imported');
    expect(markup).toContain('aria-label="Calendar countries"'); expect(markup).toContain('aria-label="Calendar availability cutoff"');
    expect(markup).toContain('Choose or paste CSV or JSON below.'); expect(markup).toContain('>Choose calendar file</button>');
    const importFormat = markup.match(/<select\b[^>]*aria-label="Calendar import format"[^>]*>([\s\S]*?)<\/select>/)?.[1];
    expect(importFormat).toBeDefined(); expect(importFormat).toMatch(/<option[^>]*value="json"[^>]*>JSON<\/option>/); expect(importFormat).toMatch(/<option[^>]*value="csv"[^>]*>CSV<\/option>/);
    expect(markup).toContain('aria-label="Calendar import text"'); expect(markup).toContain('No sample market events are inserted automatically.');
    expect(markup).toContain('>Cancel</button>'); expect(markup).toContain('>Apply</button>'); expect(markup).not.toContain('<iframe');
  });
  it('renders imported HTML-like titles only as text', () => {
    const preview = previewCalendarImport(JSON.stringify([{ id: 'test', kind: 'economic', title: '<img src=x onerror=alert(1)>', description: '<script>bad()</script>', date: '2026-01-01', publishedAt: 0 }]), 'json', { fixture: true });
    const state = applyCalendarPreview(createCalendarState(), preview), markup = renderToStaticMarkup(React.createElement(CalendarDialog, { state, onChange: () => {}, onClose: () => {} }));
    expect(markup).toContain('&lt;img'); expect(markup).not.toContain('<img src'); expect(markup).not.toContain('<script>bad');
  });
  it('roundtrips a valid combined state larger than individual-import limits and rejects oversize accumulation', () => {
    const description = 'x'.repeat(16000), make = (id: string) => previewCalendarImport(JSON.stringify(Array.from({ length: 350 }, (_, index) => ({ id: String(index), kind: 'economic', title: 'Synthetic bounded state test', date: '2026-01-01', description }))), 'json', { documentId: id, fixture: true });
    const first = make('first'), second = make('second'), state = applyCalendarPreview(applyCalendarPreview(createCalendarState(), first), second), serialized = serializeCalendarState(state);
    expect(serialized).toBe(JSON.stringify(state));
    expect(new TextEncoder().encode(serialized).length).toBeGreaterThan(10 * 1024 * 1024); expect(new TextEncoder().encode(serialized).length).toBeLessThan(20 * 1024 * 1024);
    const restored = previewCalendarImport(serialized, 'json'); expect(restored.state!.documents.map(document => document.events.length)).toEqual([350, 350]);
    expect(restored.state!.documents[1].events[349].description).toBe(description);
    expect(() => previewCalendarImport(JSON.stringify([...state.documents[0].events, ...state.documents[1].events]), 'json')).toThrow('10 MiB');
    const oversized = { ...state, documents: [...state.documents, { ...state.documents[0], id: 'third' }, { ...state.documents[1], id: 'fourth' }] };
    expect(() => applyCalendarPreview(state, { documents: oversized.documents, state: oversized, diagnostics: [] })).toThrow('20 MiB');
  });
});
