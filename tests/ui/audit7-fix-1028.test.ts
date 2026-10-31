import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScreenerDialog } from '../../src/ui/ScreenerDialog';
import { createScreenerSettings } from '../../src/domain/screener-state';
import { fixtureDataset } from '../../src/domain/fixtures';
import { runScreener } from '../../src/domain/screener';
import { parseCalendarJson } from '../../src/domain/calendar';
import { calendarChartMarkers, calendarMarkerSettings } from '../../src/domain/calendar-chart-markers';

// Static markup and domain evidence only, not GUI evidence. SYNTHETIC data.
const render = (settings = createScreenerSettings(), datasets = [fixtureDataset('SYNTH', 40)]) =>
  renderToStaticMarkup(React.createElement(ScreenerDialog, { datasets, settings, onChange: () => {}, onSelect: () => ({ ok: true }), onClose: () => {} }));
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

describe('screener: no internal ids, safe first focus, keys after a click', () => {
  it('names filter chips and column menus by their fields, never by id', () => {
    const settings = createScreenerSettings(), column = settings.columns.find(row => row.metric === 'last')!;
    column.id = '8d3f3801-0000-4000-8000-000000000001';
    settings.filters = [{ id: 'bf14c944-0000-4000-8000-000000000002', columnId: column.id, operator: 'gt', value: 5, active: true }];
    const markup = render(settings);
    expect(markup).not.toMatch(UUID); expect(markup).not.toContain('8d3f3801');
    expect(markup).toContain('aria-label="Reset filter Price &gt; 5"'); expect(markup).toContain('aria-label="Column actions Last close"');
  });
  it('focuses the result search first (not the Autosave checkbox) and makes the results a focus target for keys', () => {
    const markup = render();
    expect(markup).toMatch(/<input type="search" autofocus=""[^>]*aria-label="Search screener results"/);
    expect(markup).toContain('class="table-scroll" tabindex="-1" aria-label="Screener results"');
    expect(readFileSync('src/ui/ScreenerDialog.tsx', 'utf8')).toContain('tableRef.current?.focus({ preventScroll: true })');
  });
  it('states "no matches in the loaded symbols" when a preset filter has no data to check', () => {
    const settings = createScreenerSettings(), pe = { id: 'pe', metric: 'priceEarnings' };
    settings.columns = [...settings.columns, pe]; settings.filters = [{ id: 'cheap', columnId: 'pe', operator: 'lt', value: 15, active: true }];
    expect(render(settings)).toContain('No matches in the loaded symbols. 1 of them could not be checked because data this screen needs is not loaded');
  });
});

describe('relative volume uses the Symbol details daily basis', () => {
  it('gives daily demo bars a relative volume equal to daily volume over the mean of the earlier daily bars', () => {
    const data = fixtureDataset('SYNTH', 30), cell = runScreener([data], [{ id: 'rv', metric: 'relativeVolume', parameters: { length: 10 } }]).rows[0].cells.rv;
    const volumes = data.bars.map(bar => bar.volume), mean = volumes.slice(-11, -1).reduce((a, b) => a + b, 0) / 10;
    expect(cell.state).toBe('available'); expect(cell.value as number).toBeCloseTo(volumes.at(-1)! / mean, 10);
  });
});

describe('right rail at short heights', () => {
  it('scrolls instead of clipping, and its flyout menu is not clipped by the scroller', () => {
    const css = readFileSync('src/ui/styles.css', 'utf8');
    expect(css).toContain('.lv-right-rail{overflow-y:auto;overflow-x:hidden');
    expect(css).toContain('.lv-rail-menu{position:fixed;right:calc(var(--lv-rail-w) + 6px)');
  });
});

describe('calendar flag tooltips use the chart time zone', () => {
  const at = (iso: string) => Date.parse(iso) / 1000;
  const parsed = parseCalendarJson(JSON.stringify([{ id: 'cpi', kind: 'economic', title: 'Synthetic CPI', publishedAt: 1, date: '2026-06-03', time: '2026-06-03T12:30:00Z', timezone: 'UTC', timing: 'exact' }]), { documentId: 'audit7', sourceLabel: 'SYNTHETIC AUDIT7', fixture: true, now: at('2026-06-01T00:00:00Z') });
  const daily = Array.from({ length: 10 }, (_, i) => ({ time: at('2026-06-01T00:00:00Z') + i * 86400 }));
  const events = { earnings: { visible: false }, dividends: false, splits: false, economic: { visible: true, futureOnly: false } };
  const dateLine = (zone?: string) => calendarChartMarkers([parsed.document!], 'SYNTH', daily, calendarMarkerSettings(events, false, zone), at('2026-06-01T00:00:00Z'))[0].lines.find(line => line.startsWith('Date:'));
  it('reads 12:30 on a UTC chart and keeps New York when no zone is passed; placement is unchanged', () => {
    expect(dateLine('UTC')).toMatch(/12:30/); expect(dateLine()).toMatch(/08:30/);
    const bar = (zone?: string) => calendarChartMarkers([parsed.document!], 'SYNTH', daily, calendarMarkerSettings(events, false, zone), at('2026-06-01T00:00:00Z'))[0].barTime;
    expect(bar('UTC')).toBe(bar());
  });
});
