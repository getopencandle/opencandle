// (1) All-charts replay frames of non-active derived charts are marked so the adapter treats the last derived
// bar as forming; (2) the VWAP Earnings anchor. SYNTHETIC bars and calendar events only; unit tests, not GUI evidence.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { fixtureDataset, fixtureInstrument } from '../../src/domain/fixtures';
import type { Bar, BarDataset } from '../../src/domain/types';
import { openReplay, selectReplayStart, type ReplayParticipant } from '../../src/domain/replay-session';
import { replayLayoutFrames } from '../../src/domain/replay-layout';
import { isReplayFrameBars } from '../../src/chart/bar-input-identity';
import { derivedCalculation } from '../../src/chart/calculation-bars';
import { derivedCalculationSettings, derivedSettingsDefaults } from '../../src/chart/derived/derived-settings';
import type { DerivedStyle } from '../../src/chart/derived';
import { calculateIndicator } from '../../src/domain/indicators';
import { clearVwapEventDates, rememberVwapEarningsDates, rememberVwapEventDates, vwapEarningsDatesFromCalendar, vwapEventAnchorKeys, vwapEventDatesFor } from '../../src/domain/vwap-event-anchors';
import { effectiveVwapSettings } from '../../src/vwap/settings';
import type { CalendarDocument, CalendarEvent } from '../../src/domain/calendar';

const T0 = Date.UTC(2024, 0, 1) / 1000;
function synthetic(symbol: string, count: number): BarDataset {
  const bars: Bar[] = [];
  for (let i = 0; i < count; i++) { const base = 100 + 3 * Math.sin(i / 4) + i * 0.05; bars.push({ time: T0 + i * 3600, open: base, high: base + 0.6, low: base - 0.5, close: base + 0.2 * Math.cos(i), volume: 10 }); }
  return { instrument: fixtureInstrument(symbol), bars, resolution: '1h', provenance: { ...fixtureDataset(symbol, 1).provenance, datasetId: `test:${symbol}:1h`, revision: '1' } };
}
const active = synthetic('AAA', 120), other = synthetic('BBB', 120);
const row = (data: BarDataset, cellId: string, chartType: string): ReplayParticipant => ({ cellId, instrumentId: data.instrument.id, symbol: data.instrument.symbol, interval: '1h', chartType, datasetId: data.provenance.datasetId, revision: '1' });

describe('INDREPLAY2-1028 All charts: non-active derived charts treat the last bar as forming', () => {
  for (const style of ['renko', 'kagi', 'pointfigure', 'range', 'linebreak'] as const) {
    it(`${style}: the other chart frame is marked, and a forming last bar never presents a confirmed brick`, () => {
      let session = openReplay({ participants: [row(active, 'a', 'candles'), row(other, 'b', style)], activeCellId: 'a', scope: 'all', sessionId: 's-' + style });
      session = selectReplayStart(session, active, active.bars[59].time, '1h');
      const frame = replayLayoutFrames(session, [active, other]).b;
      expect(frame.length).toBeGreaterThan(30);
      expect(isReplayFrameBars(frame)).toBe(true);
      expect(isReplayFrameBars(other.bars)).toBe(false);
      expect(isReplayFrameBars([...frame])).toBe(false); // a copy is not a replay frame
      const settings = derivedCalculationSettings(style as DerivedStyle, { ...derivedSettingsDefaults(style as DerivedStyle), ...(style === 'range' ? { range: 50 } : {}) });
      const run = (lastBarOpen: boolean) => { const result = derivedCalculation(frame, style, { settings, tickSize: 0.01, lastBarOpen }); if (!result.ok) throw new Error(result.diagnostic.message); return result.value; };
      const settled = run(false), forming = run(true);
      const last = frame.length - 1;
      expect(forming.confirmed.every(bar => (bar.confirmedAt ?? last) < last)).toBe(true);
      expect(forming.confirmed.length + forming.projection.length).toBeGreaterThanOrEqual(settled.confirmed.length);
    });
  }
  it('the adapter reads the frame mark in lastBarForming (wiring check; the adapter needs a canvas to construct)', () => {
    const source = readFileSync('src/chart/adapter.ts', 'utf8');
    expect(source).toMatch(/const lastBarForming=\(\)=>[^\n]*isReplayFrameBars\(currentBars\)/);
  });
});

describe('INDREPLAY2-1028 VWAP Earnings anchor', () => {
  afterEach(() => clearVwapEventDates());
  // NY trading days Mon 2025-06-09 .. Fri 2025-06-13, daily bars at 13:30 UTC (09:30 EDT).
  const day = (n: number) => Date.UTC(2025, 5, 9 + n, 13, 30) / 1000;
  const bars = [0, 1, 2, 3, 4].map(i => ({ time: day(i), open: 10 + i, high: 11 + i, low: 9 + i, close: 10 + i, volume: 1 }));
  const event = (id: string, date: string, patch: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, revision: 1, kind: 'earnings', title: 'Q', description: '', date, time: null, timezone: null, timing: 'date-only', symbol: 'GME', instrumentId: null, country: null, category: null, importance: null, status: 'confirmed', publishedAt: null, fiscalPeriod: null, exDate: null, payDate: null, exchange: null, values: {}, ...patch });
  const doc = (events: CalendarEvent[], fixture = false): CalendarDocument => ({ schemaVersion: 1, id: 'd' + events.length + fixture, provenance: { kind: 'local-import', label: 'test', sourceUrl: null, importedAt: 0, license: 'test', fixture }, events });
  const target = { instrumentId: 'US:GME', symbol: 'GME', fixture: false };
  const starts = (events: CalendarEvent[]) => vwapEarningsDatesFromCalendar([doc(events)], target);

  it('is unavailable with a short reason when no earnings data exists (no invented dates)', () => {
    expect(starts([])).toBeNull();
    expect(starts([event('x', '2025-06-11', { symbol: 'SPY' })])).toBeNull();
    expect(starts([event('x', '2025-06-11', { status: 'cancelled' })])).toBeNull();
    expect(() => vwapEventAnchorKeys(bars, 'Earnings', null)).toThrow('Import or auto-fill earnings in Calendar');
    const result = calculateIndicator('vwap', bars, { anchor: 'Earnings', timezone: 'UTC', source: 'close' });
    expect(result.diagnostics.join(' ')).toContain('Earnings anchor needs earnings dates');
  });
  it('timing rule never looks ahead: before-open starts on the date, after-close/date-only/unknown on the next session, exact at the first bar at or after it', () => {
    const keys = (e: Partial<CalendarEvent>) => vwapEventAnchorKeys(bars, 'Earnings', starts([event('e', '2025-06-11', e)]));
    expect(keys({ timing: 'before-open' })).toEqual(['0', '0', '1', '1', '1']);
    expect(keys({ timing: 'after-close' })).toEqual(['0', '0', '0', '1', '1']);
    expect(keys({ timing: 'date-only' })).toEqual(['0', '0', '0', '1', '1']);
    expect(keys({ timing: 'unknown' })).toEqual(['0', '0', '0', '1', '1']);
    // Exact 20:05 UTC (after the 13:30 UTC open of the 11th) -> the 12th; exact 12:00 UTC (before it) -> the 11th.
    expect(keys({ timing: 'exact', time: Date.UTC(2025, 5, 11, 20, 5) / 1000 })).toEqual(['0', '0', '0', '1', '1']);
    expect(keys({ timing: 'exact', time: Date.UTC(2025, 5, 11, 12, 0) / 1000 })).toEqual(['0', '0', '1', '1', '1']);
    // Exact instant equal to a bar start: that bar (at/after).
    expect(keys({ timing: 'exact', time: day(2) })).toEqual(['0', '0', '1', '1', '1']);
    // An event on or before the first bar, or after the last, makes no reset.
    expect(vwapEventAnchorKeys(bars, 'Earnings', starts([event('a', '2025-06-01', { timing: 'before-open' })]))).toEqual(['0', '0', '0', '0', '0']);
    expect(() => vwapEventAnchorKeys(bars, 'Earnings', starts([event('b', '2025-07-01')]))).not.toThrow();
  });
  it('matches by instrument id or ticker with the same synthetic status, uses the latest revision, and drops cancelled revisions', () => {
    const byId = event('i', '2025-06-10', { symbol: null, instrumentId: 'US:GME', timing: 'before-open' });
    expect(starts([byId])).toEqual([{ exDate: '2025-06-10', kind: 'earnings' }]);
    expect(vwapEarningsDatesFromCalendar([doc([event('s', '2025-06-10')], true)], target)).toBeNull(); // synthetic doc, real chart
    expect(vwapEarningsDatesFromCalendar([doc([event('s', '2025-06-10')], true)], { ...target, fixture: true })).toHaveLength(1);
    const moved = [event('m', '2025-06-10', { timing: 'before-open' }), event('m', '2025-06-12', { revision: 2, timing: 'before-open' })];
    expect(starts(moved)).toEqual([{ exDate: '2025-06-12', kind: 'earnings' }]);
    expect(starts([...moved, event('m', '2025-06-12', { revision: 3, status: 'cancelled' })])).toBeNull();
  });
  it('computes VWAP periods, keeps Dividends and Splits independent of earnings, and the exact kernel refuses it', () => {
    const e = vwapEarningsDatesFromCalendar([doc([event('e', '2025-06-11', { timing: 'before-open' })])], target)!;
    rememberVwapEarningsDates('US:GME', e);
    const dates = vwapEventDatesFor('US:GME')!;
    expect(dates).toBe(vwapEventDatesFor('US:GME')); // stable identity while unchanged
    const plot = calculateIndicator('vwap', bars, { anchor: 'Earnings', timezone: 'UTC', source: 'close' }, { corporateActions: dates }).series.find(p => p.id === 'vwap')!;
    expect(plot.values).toEqual([10, 10.5, 12, 12.5, 13]);
    // Earnings loaded but corporate actions not: Dividends stays unavailable (no silent single period).
    expect(() => vwapEventAnchorKeys(bars, 'Dividends', dates)).toThrow('Alpaca corporate actions');
    // Actions loaded with no dates, plus earnings: Dividends is a single period, Earnings still resets.
    rememberVwapEventDates('US:GME', []);
    const both = vwapEventDatesFor('US:GME')!;
    expect(vwapEventAnchorKeys(bars, 'Dividends', both)).toEqual(['0', '0', '0', '0', '0']);
    expect(vwapEventAnchorKeys(bars, 'Earnings', both)).toEqual(['0', '0', '1', '1', '1']);
    rememberVwapEarningsDates('US:GME', null);
    expect(vwapEventDatesFor('US:GME')).toEqual([]);
    expect(() => effectiveVwapSettings({ kernelVersion: 2, anchor: 'Earnings', timezone: 'UTC', source: 'close' }, 'standard')).toThrow('Original calculation method');
  });
});
