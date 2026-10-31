import { describe, expect, it } from 'vitest';
import { paintAxisLabels, type AxisLabelContext } from '../../src/chart/appearance-painters';
import { INDICATOR_SCALE_GAPS } from '../../src/chart/indicator-scale';

// (follow-ups): the symbol name tag follows the main scale side, and the indicator left-scale
// gap no longer says that price scales are right only. Recording 2D context, synthetic scene; no DOM or canvas pixels.
function recordingContext() {
  const rects: Array<{ x: number; y: number; w: number; color: string }> = [];
  const ctx: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: '', textAlign: '', globalAlpha: 1,
    save() {}, restore() {}, beginPath() {}, fillText() {}, lineTo() {}, moveTo() {}, stroke() {}, setLineDash() {}, measureText: () => ({ width: 32 }),
    fillRect(x: number, y: number, w: number) { rects.push({ x, y, w, color: String(ctx.fillStyle) }); } };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects };
}
const coords = { priceToY: (price: number) => (120 - price) * 10, barInterval: 60_000, visibleLogicalRange: () => ({ from: 0, to: 0 }) };
const pane = { kind: 'price', bounds: { top: 0, height: 300 }, scale: { min: 90, max: 120 } };
const context: AxisLabelContext = { labels: { symbolName: true, prevClose: false, highLow: false, noOverlap: true }, lines: { prevCloseLine: false }, symbol: 'SYNTH', timezone: 'UTC', session: { kind: 'continuous', extended: true }, drawings: () => [], selected: () => [] };
const paint = (left: boolean) => {
  const rec = recordingContext();
  const scene = { scaleMode: 'price', bars: [{ time: 0, open: 100, high: 101, low: 99, close: 100 }], priceMintick: 0.01, style: { fontSize: 12 }, ...(left ? { lvMainScaleLeft: true } : {}) };
  paintAxisLabels(rec.ctx, scene, coords, { textColor: '#ccc', fontFamily: 'sans-serif' }, 500, pane, context, { drawn: true, y: 200, below: 8, value: 100, color: '#089981' });
  return rec.rects.filter(rect => rect.color === '#089981');
};

describe('symbol name tag and the main scale side', () => {
  it('right scale: the tag sits just left of the chip at the plot right edge (unchanged)', () => {
    expect(paint(false)).toEqual([{ x: 500 - 40, y: 192, w: 40, color: '#089981' }]);
  });
  it('left scale: the tag sits at the plot left edge, next to the left chip, not at the plot right edge', () => {
    expect(paint(true)).toEqual([{ x: 0, y: 192, w: 40, color: '#089981' }]);
  });
});

describe('indicator left-scale gap wording', () => {
  it('no longer claims the renderer draws price scales on the right only', () => {
    expect(INDICATOR_SCALE_GAPS.left).not.toMatch(/right only/);
    expect(INDICATOR_SCALE_GAPS.left).toMatch(/^A left-side scale is unavailable/);
  });
});
