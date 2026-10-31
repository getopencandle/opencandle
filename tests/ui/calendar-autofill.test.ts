// Static-markup evidence for the calendar auto-fill panel, watchlist chips and the heatmap universe selector.
// No DOM, paint or native chooser is exercised; the handlers' data paths are covered in tests/domain/calendar-sources.test.ts.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CalendarDialog, applyAutoFill, calendarChipSymbols } from '../../src/ui/CalendarDialog';
import { HeatmapDialog } from '../../src/ui/HeatmapDialog';
import { createCalendarState } from '../../src/domain/calendar';
import { createHeatmapState } from '../../src/domain/heatmap';
import { dividendsToCalendarDocument } from '../../src/domain/calendar-sources';
import { fixtureDataset } from '../../src/domain/fixtures';
import { createWatchBook } from '../../src/watchlists/model';

const NOW = Date.parse('2026-06-10T12:00:00Z') / 1000;
const props = { state: createCalendarState(), onChange: () => {}, onClose: () => {}, now: NOW };
const render = (extra: Record<string, unknown> = {}) => renderToStaticMarkup(React.createElement(CalendarDialog, { ...props, ...extra } as never));

describe('calendar auto-fill panel', () => {
  it('shows nothing extra when no host data is connected', () => {
    expect(render()).not.toContain('Calendar auto-fill');
  });
  it('lists watchlist chips with counts and says why the fills are unavailable', () => {
    const markup = render({ watchBook: createWatchBook(['GME', 'SPY']), fundamentals: [] });
    expect(markup).toContain('Calendar auto-fill'); expect(markup).toContain('aria-label="Watchlist filter"');
    expect(markup).toContain('All symbols'); expect(markup).toContain('Watchlist (2)');
    expect(markup).toContain('Dividend auto-fill needs the desktop app'); expect(markup).toContain('Past earnings need saved SEC company facts');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Fill past earnings from SEC facts<\/button>/);
    expect(markup).not.toContain('—');
  });
  it('enables the dividend fill when the owner-key bridge is passed and the list has symbols', () => {
    const markup = render({ watchBook: createWatchBook(['GME', 'SPY']), alpacaCorporateActions: async () => ({ ok: false, error: { code: 'X', message: 'mock' } }) });
    expect(markup).toContain('Fill dividends (2 symbols)'); expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Fill dividends/);
  });
  it('chip symbols are upper-case, unique and sorted; applying a report replaces only its own document', () => {
    const book = createWatchBook(['SPY', 'GME']);
    expect(calendarChipSymbols(book, book.activeId)).toEqual(['GME', 'SPY']);
    const document = dividendsToCalendarDocument([{ schemaVersion: 1, symbol: 'GME', retrievedAt: 'x', cached: false, stale: false, synthetic: true, provenance: { provider: 'Alpaca', kind: 'owner-key', source: 'corporate-actions', license: 'x' }, events: [{ id: 'd', kind: 'cash-dividend', symbol: 'GME', exDate: '2026-05-01', recordDate: null, payableDate: null, processDate: null, amount: 1, currency: 'USD' }] }], NOW)!;
    const once = applyAutoFill(createCalendarState(), { document, used: ['GME'], skipped: [], message: '' }), twice = applyAutoFill(once, { document, used: ['GME'], skipped: [], message: '' });
    expect(once.documents).toHaveLength(1); expect(twice.documents).toHaveLength(1);
    expect(applyAutoFill(once, { document: null, used: [], skipped: [], message: '' })).toBe(once);
  });
});

describe('heatmap universe selector', () => {
  const sets = ['GME', 'SPY', 'AAA'].map(symbol => fixtureDataset(symbol, 10));
  const render = (extra: Record<string, unknown> = {}) => renderToStaticMarkup(React.createElement(HeatmapDialog, { datasets: sets, state: createHeatmapState(), onChange: () => {}, onSelect: () => {}, onClose: () => {}, ...extra } as never));
  it('offers the selector only when a watchlist book is passed', () => {
    expect(render()).not.toContain('aria-label="Heatmap universe"');
    const markup = render({ watchBook: createWatchBook(['GME', 'SPY']) });
    expect(markup).toContain('aria-label="Heatmap universe"'); expect(markup).toContain('All loaded instruments');
    expect(markup).toContain('Import metadata file'); expect(markup).toContain('aria-label="More metadata actions"'); expect(markup).not.toContain('Insert CSV template');
  });
});
