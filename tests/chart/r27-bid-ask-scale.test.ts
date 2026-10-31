import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { paintAxisLabels, type AxisLabelContext } from '../../src/chart/appearance-painters';
import { factoryAppearance, factoryPriceScale, visibleTabView, type ChartSettingsSources } from '../../src/chart/chart-settings-bindings';
import { defaultChartSettingsDocument } from '../../src/chart/chart-settings-document';

// Scales > Bid and ask. A recording 2D context and pure functions; no DOM, canvas pixels or GUI.
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
const context = (label: boolean, line: boolean, ask: boolean = true): AxisLabelContext => ({ labels: { symbolName: false, prevClose: false, highLow: false, noOverlap: false }, lines: { prevCloseLine: false }, symbol: null, timezone: 'UTC', session: { kind: 'continuous', extended: true }, drawings: () => [], selected: () => [],
  bidAsk: { bid: { price: 100, color: '#2962FF' }, ask: ask ? { price: 110, color: '#F7525F' } : null, label, line } });
const paint = (label: boolean, line: boolean, ask = true) => { const rec = recordingContext(); paintAxisLabels(rec.ctx, scene, coords, { textColor: '#ccc', fontFamily: 'sans-serif' }, 500, pane, context(label, line, ask), { drawn: false, y: 0, below: 8, value: 100, color: '#089981' }); return rec; };

describe('the painter draws the Bid and Ask labels and dotted lines in their colors', () => {
  it('labels and lines on, each side at its own price', () => {
    const rec = paint(true, true);
    expect(rec.rects.some(rect => rect.color === '#2962FF' && Math.abs(rect.y + 8 - 200) <= 1)).toBe(true);
    expect(rec.rects.some(rect => rect.color === '#F7525F' && Math.abs(rect.y + 8 - 100) <= 1)).toBe(true);
    expect(rec.strokes).toEqual(expect.arrayContaining(['#2962FF', '#F7525F']));
    expect(rec.dashes).toContainEqual([1, 2]);
  });
  it('label and line toggle on their own, and a one-sided quote paints one side', () => {
    expect(paint(false, true).rects.some(rect => rect.color === '#2962FF')).toBe(false);
    expect(paint(true, false).strokes).not.toContain('#2962FF');
    const bidOnly = paint(true, true, false);
    expect(bidOnly.rects.some(rect => rect.color === '#F7525F')).toBe(false);
    expect(bidOnly.rects.some(rect => rect.color === '#2962FF')).toBe(true);
  });
});

describe('the row is live and the grid feeds it', () => {
  it('Scales > Bid and ask is a live row now that live charts stream quotes', () => {
    const sources: ChartSettingsSources = { appearance: factoryAppearance(), document: defaultChartSettingsDocument(), documentConnected: true, priceScale: factoryPriceScale(), ratio: 0.5, style: 'candles', typeSettings: null, timezone: 'UTC', exchangeTimezone: null, scaleMode: { scale: 'linear', invert: false, auto: true } };
    const row = visibleTabView('scales', sources).flatMap(group => group.rows).find(item => item.key.endsWith('bidAskLabelsLines'));
    expect(row).toBeDefined();
    expect(row!.availability.state).toBe('live');
  });
  it('the grid cell hands the live quote to the chart and reports bid and ask data to the price scale menu', () => {
    const grid = readFileSync('src/ui/MultiChartGrid.tsx', 'utf8'), adapter = readFileSync('src/chart/adapter.ts', 'utf8');
    expect(grid).toContain('chart.setBidAskPrice(bidAsk)');
    expect(grid).toContain('get bidAsk(){return bidAskAvailable.current;}');
    expect(grid).toContain('useLiveQuote(liveLineageOf(bars)?dataset.instrument.id:null)');
    expect(adapter).toContain('setBidAskPrice:');
  });
});
