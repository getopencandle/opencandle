import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calendarDateLabel, calendarZoneLabel } from '../../src/ui/CalendarDialog';

const screener = readFileSync('src/ui/ScreenerDialog.tsx', 'utf8');
const css = readFileSync('src/ui/screener.css', 'utf8');

describe('AUDIT7-LOWS #15 screener', () => {
  it('opening a row does not close the screener', () => {
    const body = /function chooseDataset[^\n]*/.exec(screener)![0];
    expect(body).toContain('onSelect(dataset)');
    expect(body).not.toMatch(/\bclose\(\)/);
  });
  it('row actions sit beside the symbol instead of floating mid-row', () => {
    expect(css).not.toMatch(/\.screener-row-actions\{margin-left:auto/);
    expect(css).toMatch(/td\.screener-source\{[^}]*width:300px/);
  });
});

describe('AUDIT7-LOWS #12 calendar', () => {
  it('names the zone offset', () => {
    expect(calendarZoneLabel('GMT')).toBe('UTC');
    expect(calendarZoneLabel('GMT+0')).toBe('UTC');
    expect(calendarZoneLabel('GMT-4')).toBe('UTC-4');
    expect(calendarZoneLabel('GMT+5:30')).toBe('UTC+5:30');
    expect(calendarZoneLabel(null)).toBe('');
  });
  it('formats the date readably and leaves bad input alone', () => {
    expect(calendarDateLabel('2026-10-28')).toBe('Wed, Oct 28, 2026');
    expect(calendarDateLabel('soon')).toBe('soon');
  });
});
