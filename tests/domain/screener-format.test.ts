import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatCompactVolume, formatScreenerCell, priceDecimals, screenerColumnTooltip, screenerShortTitle, SCREENER_NA } from '../../src/domain/screener-format';
import { ScreenerDialog } from '../../src/ui/ScreenerDialog';
import { createScreenerSettings } from '../../src/domain/screener-state';
import { fixtureDataset } from '../../src/domain/fixtures';

const ok = (value: number | string) => ({ value, state: 'available' as const });
describe('screener display formatting (presentation only; filters, sort and CSV keep native values)', () => {
  it('prices follow the instrument tick precision', () => {
    expect(priceDecimals(0.01)).toBe(2); expect(priceDecimals(0.25)).toBe(2); expect(priceDecimals(1)).toBe(0); expect(priceDecimals(0.0001)).toBe(4); expect(priceDecimals(1e-7)).toBe(7); expect(priceDecimals(NaN)).toBe(2);
    expect(formatScreenerCell('last', ok(24), { tickSize: 0.01 }).text).toBe('24.00');
    expect(formatScreenerCell('last', ok(2.117501), { tickSize: 0.0001 }).text).toBe('2.1175');
  });
  it('signed percents use two decimals, a sign and an up/down tone; zero is neutral', () => {
    expect(formatScreenerCell('changePercent', ok(2.117501))).toMatchObject({ text: '+2.12%', tone: 'up' });
    expect(formatScreenerCell('changePercent', ok(-0.306382))).toMatchObject({ text: '-0.31%', tone: 'down' });
    expect(formatScreenerCell('changePercent', ok(-0.001))).toMatchObject({ text: '0.00%', tone: null });
    expect(formatScreenerCell('change', ok(-1.5), { tickSize: 0.01 })).toMatchObject({ text: '-1.50', tone: 'down' });
    expect(formatScreenerCell('volatility', ok(3.14159))).toMatchObject({ text: '3.14%', tone: null });
  });
  it('volumes are compact and keep the exact value in the tooltip', () => {
    expect(formatCompactVolume(1170000)).toBe('1.17M'); expect(formatCompactVolume(950230)).toBe('950.23K'); expect(formatCompactVolume(2.5e9)).toBe('2.50B'); expect(formatCompactVolume(999)).toBe('999');
    const shown = formatScreenerCell('volume', ok(1170000)); expect(shown.text).toBe('1.17M'); expect(shown.title).toContain('1,170,000');
  });
  it('unavailable values read n/a with the state and reason in the tooltip, never zero', () => {
    const shown = formatScreenerCell('rsi', { value: null, state: 'insufficient-history', reason: 'Needs 15 rows.' });
    expect(shown).toMatchObject({ text: SCREENER_NA, available: false }); expect(shown.title).toBe('n/a (not enough history): Needs 15 rows.');
    expect(formatScreenerCell('last', { value: null, state: 'invalid' }).title).toContain('(invalid)');
    expect(formatScreenerCell('rating', ok(0.33))).toMatchObject({ text: 'Buy', tone: 'up' }); expect(formatScreenerCell('newHigh', ok(1)).text).toBe('Yes');
  });
  it('headers are short with the full meaning in the tooltip; custom labels stay as typed', () => {
    const labels = { last: 'Last supplied close', changePercent: 'Change % from previous supplied row', sma: 'SMA', relativeVolume: 'Relative volume' };
    expect(screenerShortTitle({ id: 'a', metric: 'last' }, labels)).toBe('Price');
    expect(screenerShortTitle({ id: 'b', metric: 'changePercent', label: 'Change % from previous supplied row' }, labels)).toBe('Chg %');
    expect(screenerShortTitle({ id: 'c', metric: 'sma', parameters: { length: 50 } }, labels)).toBe('SMA 50');
    expect(screenerShortTitle({ id: 'd', metric: 'relativeVolume', parameters: { length: 10 } }, labels)).toBe('Rel volume');
    expect(screenerShortTitle({ id: 'e', metric: 'last', label: 'My close' }, labels)).toBe('My close');
    expect(screenerColumnTooltip({ id: 'b', metric: 'changePercent' }, labels)).toContain('Change % from previous supplied row');
  });
  it('the dialog renders compact rows: DEMO badge, short headers, formatted cells, provenance kept in the tooltip, no em dashes', () => {
    const markup = renderToStaticMarkup(React.createElement(ScreenerDialog, { datasets: [fixtureDataset('AAPL', 60)], settings: createScreenerSettings(), onChange: () => {}, onSelect: () => ({ ok: true }), onClose: () => {} }));
    expect(markup).toContain('>DEMO<'); expect(markup).toContain('>Price<'); expect(markup).toContain('>Chg %<'); expect(markup).not.toContain('Last supplied close<');
    expect(markup).toContain('1 match<'); expect(markup).toContain('matches from'); expect(markup).toContain('aria-label="Screener help"');
    expect(markup.match(/class="lv-info-btn"/g)).toHaveLength(1);
    // A plain source name replaced the 'providerId / datasetId' tooltip line with a plain source name ("Demo data").
    expect(markup).toContain('| Demo data | ready\nDemo data\n'); expect(markup).not.toContain('lv-synthetic-v1'); expect(markup).toContain('Row time ');
    expect(markup).not.toMatch(/>[^<]*—[^<]*</);
    expect(markup).toMatch(/class="num screener-(up|down)"|class="num"/);
  });
});
