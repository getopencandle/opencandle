import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { latestPrePostPrice, prePostAvailable, prePostColor } from '../../src/chart/pre-post-price';
import { paintAxisLabels, type AxisLabelContext } from '../../src/chart/appearance-painters';
import { factoryAppearance, factoryPriceScale, visibleTabView, type ChartSettingsSources } from '../../src/chart/chart-settings-bindings';
import { defaultChartSettingsDocument } from '../../src/chart/chart-settings-document';

// The pre/post-market price label and line. Synthetic bars written as New York
// wall clock on 2026-10-21 (EDT, UTC-4); pure functions, a recording 2D context and source wiring. No DOM, canvas pixels or GUI.
const us = { assetClass: 'stock', timezone: 'America/New_York' };
const at = (hour: number, minute = 0) => Date.UTC(2026, 9, 21, hour + 4, minute) / 1000;
const bar = (time: number, close: number) => ({ time, open: close, high: close, low: close, close });
const run = (...rows: Array<[number, number, number]>) => rows.map(([hour, minute, close]) => bar(at(hour, minute), close));

describe('latestPrePostPrice', () => {
  it('returns the latest pre-market close while the session has not opened', () => {
    expect(latestPrePostPrice(us, run([8, 0, 10], [8, 5, 10.5]))).toEqual({ price: 10.5, phase: 'pre', time: at(8, 5) });
  });
  it('returns the latest post-market close after the close', () => {
    expect(latestPrePostPrice(us, run([15, 55, 11], [16, 0, 11.2], [16, 5, 11.4]))).toEqual({ price: 11.4, phase: 'post', time: at(16, 5) });
  });
  it('no label during regular hours, and overnight bars are skipped back to the extended run', () => {
    expect(latestPrePostPrice(us, run([8, 0, 10], [9, 30, 10.2], [9, 35, 10.3]))).toBeNull();
    expect(latestPrePostPrice(us, run([19, 55, 12], [20, 0, 12.5], [20, 5, 12.6]))).toEqual({ price: 12, phase: 'post', time: at(19, 55) });
  });
  it('only US equity intraday charts carry the label', () => {
    const bars = run([8, 0, 10], [8, 5, 10.5]);
    expect(prePostAvailable(us, bars)).toBe(true);
    expect(latestPrePostPrice({ assetClass: 'crypto', timezone: 'America/New_York' }, bars)).toBeNull();
    expect(latestPrePostPrice({ assetClass: 'stock', timezone: 'UTC' }, bars)).toBeNull();
    const daily = [bar(at(8), 10), bar(at(8) + 86_400, 11)];
    expect(prePostAvailable(us, daily)).toBe(false);
  });
  it('colors come from Scales > Pre/post/night market (pre, post), with fallbacks', () => {
    expect(prePostColor(['#111111', '#222222', '#333333'], 'pre')).toBe('#111111');
    expect(prePostColor(['#111111', '#222222', '#333333'], 'post')).toBe('#222222');
    expect(prePostColor([], 'pre')).toBe('#FB8C00');
  });
});

function recordingContext() {
  const rects: Array<{ y: number; color: string }> = [], dashes: number[][] = [], strokes: string[] = [];
  const ctx: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: '', textAlign: '', globalAlpha: 1,
    save() {}, restore() {}, beginPath() {}, fillText() {}, lineTo() {}, moveTo() {}, measureText: () => ({ width: 32 }),
    setLineDash(value: number[]) { dashes.push(value); }, stroke() { strokes.push(String(ctx.strokeStyle)); },
    fillRect(_x: number, y: number, _w: number, _h: number) { rects.push({ y, color: String(ctx.fillStyle) }); } };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, dashes, strokes };
}
const scene = { scaleMode: 'price', bars: [{ time: 0, open: 100, high: 101, low: 99, close: 100 }], priceMintick: 0.01, style: { fontSize: 12 } };
const coords = { priceToY: (price: number) => (120 - price) * 10, barInterval: 60_000, visibleLogicalRange: () => ({ from: 0, to: 0 }) };
const pane = { kind: 'price', bounds: { top: 0, height: 300 }, scale: { min: 90, max: 120 } };
const context = (label: boolean, line: boolean): AxisLabelContext => ({ labels: { symbolName: false, prevClose: false, highLow: false, noOverlap: true }, lines: { prevCloseLine: false }, symbol: null, timezone: 'UTC', session: { kind: 'continuous', extended: true }, drawings: () => [], selected: () => [], prePost: { price: 105, phase: 'pre', label, line, color: '#FB8C00' } });
const paint = (label: boolean, line: boolean) => { const rec = recordingContext(); paintAxisLabels(rec.ctx, scene, coords, { textColor: '#ccc', fontFamily: 'sans-serif' }, 500, pane, context(label, line), { drawn: false, y: 0, below: 8, value: 100, color: '#089981' }); return rec; };

describe('the painter draws the label and the dotted line in the phase color', () => {
  it('label and line on', () => {
    const rec = paint(true, true);
    expect(rec.rects.some(rect => rect.color === '#FB8C00' && Math.abs(rect.y + 8 - 150) <= 9)).toBe(true);
    expect(rec.strokes).toContain('#FB8C00');
    expect(rec.dashes).toContainEqual([2, 2]);
  });
  it('each row toggles on its own', () => {
    expect(paint(false, true).rects.some(rect => rect.color === '#FB8C00')).toBe(false);
    expect(paint(true, false).strokes).not.toContain('#FB8C00');
    const off = paint(false, false);
    expect(off.rects.some(rect => rect.color === '#FB8C00')).toBe(false);
    expect(off.strokes).not.toContain('#FB8C00');
  });
});

describe('the row is live and the grid feeds it', () => {
  it('Scales > Pre/post/night market labels and lines is a live row', () => {
    const sources: ChartSettingsSources = { appearance: factoryAppearance(), document: defaultChartSettingsDocument(), documentConnected: true, priceScale: factoryPriceScale(), ratio: 0.5, style: 'candles', typeSettings: null, timezone: 'UTC', exchangeTimezone: null, scaleMode: { scale: 'linear', invert: false, auto: true } };
    const row = visibleTabView('scales', sources).flatMap(group => group.rows).find(item => item.key.endsWith('prePostLabelsLines'));
    expect(row).toBeDefined();
    expect(row!.availability.state).toBe('live');
  });
  it('MultiChartGrid no longer hard-codes prePost:false and passes the latest extended price (source wiring)', () => {
    const grid = readFileSync('src/ui/MultiChartGrid.tsx', 'utf8');
    expect(grid).not.toContain('prePost:false');
    expect(grid).toContain('data:{prePost:prePostOk,');
    expect(grid).toContain('latestPrePostPrice(dataset.instrument,rawBars)');
    expect(grid).toContain('chart.setPrePostPrice(');
  });
});
