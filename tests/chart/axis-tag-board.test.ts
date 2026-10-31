import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { axisTagOffset, createAxisTagBoard, OVERLAY_TAG_PUBLISHER, type AxisTagHost } from '../../src/chart/axis-tag-board';
import { paintAxisLabels, type AxisLabelContext } from '../../src/chart/appearance-painters';
import { PaperChartLines, paperAxisTagRequests, paperChartLines, type PaperPriceProjection } from '../../src/ui/PaperChartLines';
import { AlertChartLines, alertAxisTagRequests } from '../../src/ui/AlertChartLines';
import { createPaperAccount, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import { feedPaperBars } from '../../src/domain/paper-bar-feed';
import type { Instrument } from '../../src/domain/types';

// Alert, order, position, TP and SL price-axis tags share one collision layout
// with the last price chip and indicator tags, and the canvas labels avoid them. Pure layout, a recording 2D context and
// static markup; no DOM, canvas pixels or GUI claim. Synthetic instrument and prices, virtual money only.
const host = (fixed: [number, number][] = [], noOverlap = true) => {
  const published: Array<{ owner: string; ranges: readonly (readonly [number, number])[] }> = [];
  const value: AxisTagHost = { fixed: () => fixed, noOverlap: () => noOverlap, publish: (owner, ranges) => { published.push({ owner, ranges }); } };
  return { value, published };
};

describe('axis tag board', () => {
  it('moves an overlay tag off the last price chip and keeps price order between owners', () => {
    const h = host([[142, 158]]), board = createAxisTagBoard(() => h.value);
    board.submit('paper', [{ id: 'order', y: 150, height: 18 }], 300);
    board.submit('alerts', [{ id: 'alert', y: 152, height: 16 }], 300);
    const paper = board.placements('paper').get('order')!, alert = board.placements('alerts').get('alert')!;
    expect(paper.hidden).toBe(false); expect(alert.hidden).toBe(false);
    // Neither tag overlaps the chip [142,158] or each other.
    const box = (center: number, height: number) => [center - height / 2, center + height / 2];
    const [pa, pb] = box(paper.center, 18), [aa, ab] = box(alert.center, 16);
    expect(pb <= 142 + 0.5 || pa >= 158 - 0.5).toBe(true);
    expect(ab <= 142 + 0.5 || aa >= 158 - 0.5).toBe(true);
    expect(pb <= aa + 0.5 || pa >= ab - 0.5).toBe(true);
    expect(axisTagOffset(paper)).toBe(paper.center - 150);
  });
  it('publishes the placed overlay tags so the canvas labels avoid them; an empty board clears them', () => {
    const h = host(), board = createAxisTagBoard(() => h.value);
    board.submit('paper', [{ id: 'order', y: 100, height: 18 }], 300);
    board.placements('paper');
    expect(h.published.at(-1)).toEqual({ owner: OVERLAY_TAG_PUBLISHER, ranges: [[91, 109]] });
    board.submit('paper', [], 0);
    expect(h.published.at(-1)).toEqual({ owner: OVERLAY_TAG_PUBLISHER, ranges: [] });
  });
  it('without No overlapping labels every tag stays at its price', () => {
    const h = host([[92, 108]], false), board = createAxisTagBoard(() => h.value);
    board.submit('paper', [{ id: 'order', y: 100, height: 18 }], 300);
    expect(board.placements('paper').get('order')).toEqual({ y: 100, center: 100, hidden: false });
    expect(axisTagOffset(board.placements('paper').get('order'))).toBe(0);
  });
  it('the signature changes only when a placement changes', () => {
    const h = host(), board = createAxisTagBoard(() => h.value);
    board.submit('alerts', [{ id: 'a', y: 50 }], 300);
    const first = board.signature('alerts');
    board.submit('alerts', [{ id: 'a', y: 50 }], 300);
    expect(board.signature('alerts')).toBe(first);
    board.submit('alerts', [{ id: 'a', y: 80 }], 300);
    expect(board.signature('alerts')).not.toBe(first);
  });
  it('a missing or throwing host still separates the overlay tags from each other', () => {
    const board = createAxisTagBoard(() => { throw new Error('SYNTHETIC host failure'); });
    board.submit('paper', [{ id: 'p', y: 100, height: 18 }], 300);
    board.submit('alerts', [{ id: 'a', y: 100, height: 16 }], 300);
    const p = board.placements('paper').get('p')!, a = board.placements('alerts').get('a')!;
    expect(Math.abs(p.center - a.center)).toBeGreaterThanOrEqual(17 - 1e-6);
  });
});

function recordingContext() {
  const rects: Array<{ x: number; y: number; w: number; h: number; color: string }> = [], lines: number[] = [];
  const ctx: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: '', textAlign: '', globalAlpha: 1,
    save() {}, restore() {}, beginPath() {}, stroke() {}, setLineDash() {}, fillText() {}, lineTo() {},
    moveTo(_x: number, y: number) { lines.push(y); }, measureText: () => ({ width: 32 }),
    fillRect(x: number, y: number, w: number, h: number) { rects.push({ x, y, w, h, color: String(ctx.fillStyle) }); } };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, lines };
}
const scene = { scaleMode: 'price', bars: [{ time: 0, open: 100, high: 101, low: 99, close: 100 }], priceMintick: 0.01, style: { fontSize: 12 } };
const coords = { priceToY: (price: number) => (120 - price) * 10, barInterval: 60_000, visibleLogicalRange: () => ({ from: 0, to: 0 }) };
const pane = { kind: 'price', bounds: { top: 0, height: 300 }, scale: { min: 90, max: 120 } };
const context = (extra: Partial<AxisLabelContext>): AxisLabelContext => ({ labels: { symbolName: false, prevClose: false, highLow: false, noOverlap: true }, lines: { prevCloseLine: false }, symbol: null, timezone: 'UTC', session: { kind: 'continuous', extended: true }, drawings: () => [], selected: () => [], ...extra });

describe('canvas labels and the overlay tags', () => {
  it('hands the chip range to the overlays and moves a canvas label away from an overlay tag', () => {
    const { ctx, rects } = recordingContext(), native = vi.fn();
    paintAxisLabels(ctx, scene, coords, { textColor: '#ccc', fontFamily: 'sans-serif' }, 500, pane, context({ onNativeFixed: native, overlayRanges: () => [[141, 159]], prePost: { price: 105, phase: 'post', label: true, line: false, color: '#2962FF' } }), { drawn: true, y: 50, below: 8, value: 107, color: '#089981' });
    expect(native).toHaveBeenCalledWith([[42, 58]]);
    const label = rects.find(rect => rect.color === '#2962FF')!;
    expect(label).toBeDefined();
    const center = label.y + 8;
    expect(center + 8 <= 141 + 0.5 || center - 8 >= 159 - 0.5).toBe(true);
  });
  it('the adapter feeds the painter and exposes the board host (source wiring)', () => {
    const adapter = readFileSync('src/chart/adapter.ts', 'utf8');
    expect(adapter).toContain('overlayRanges:()=>');
    expect(adapter).toContain('onNativeFixed:ranges=>{nativeAxisFixed=ranges;}');
    expect(adapter).toMatch(/axisTags:\{\r?\n\s+fixed:\(\):\[number,number\]\[\]=>/);
    const app = readFileSync('src/ui/App.tsx', 'utf8');
    expect(app).toContain('<AlertChartLines tagBoard={axisTagBoard}');
    expect(app).toContain('<PaperChartLines tagBoard={axisTagBoard}');
  });
});

const instrument: Instrument = { id: 'SYNTHETIC:TAGS', symbol: 'TAGS', name: 'Synthetic tags', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
const bar = (time: number, close: number) => ({ time, open: close, high: close, low: close, close, volume: 1 });
const feed = (account: PaperAccount, ...bars: ReturnType<typeof bar>[]) => feedPaperBars(account, { bars, instrument, provenance: { fixture: false, session: 'regular' }, live: false }).account;
const projection: PaperPriceProjection = { left: 10, top: 20, width: 600, height: 300, priceToY: price => 20 + (120 - price) * 10, yToPrice: y => 120 - (y - 20) / 10 };

describe('overlay tags take their place from the board', () => {
  it('paper lines submit pane-relative tags and draw a moved tag where the board puts it', () => {
    let account = feed(createPaperAccount(), bar(60, 100));
    // A buy limit under the market stays working (synthetic).
    account = submitPaperOrder(account, { instrument, quantity: 1, side: 'buy', type: 'limit', limitPrice: 95, timeInForce: 'GTC' } as never, 60).account;
    const lines = paperChartLines(account, instrument);
    expect(paperAxisTagRequests(lines, projection, null)).toEqual([{ id: lines[0].id, y: 250, height: 18 }]);
    const h = host([[241, 259]]), board = createAxisTagBoard(() => h.value);
    board.submit('paper', paperAxisTagRequests(lines, projection, null), 300);
    const html = renderToStaticMarkup(React.createElement(PaperChartLines, { account, instrument, visible: true, projection: () => projection, onModifyOrder: () => true, onCancelOrder: () => {}, onClosePosition: () => {}, tagBoard: board }));
    expect(html).toMatch(/class="axis-tag" aria-hidden="true" data-tag-moved="true" style="margin-top:-?\d+(\.\d+)?px"/);
  });
  it('alert lines submit their visible rows only', () => {
    const rows = [{ alertId: 'a1', name: 'SYNTHETIC alert', slot: 'primary' as never, price: 105, label: 'SYNTHETIC 105' }, { alertId: 'a2', name: 'Far', slot: 'primary' as never, price: 500, label: 'Far' }];
    expect(alertAxisTagRequests(rows, projection, null)).toEqual([{ id: 'a1:primary', y: 150, height: 16 }]);
    const board = createAxisTagBoard(() => host([[141, 159]]).value);
    board.submit('alerts', alertAxisTagRequests(rows, projection, null), 300);
    const html = renderToStaticMarkup(React.createElement(AlertChartLines, { rows, tickSize: 0.01, visible: true, projection: () => projection, onReprice: () => true, tagBoard: board }));
    expect(html).toContain('data-tag-moved="true"');
  });
  it('without a board the tags stay at their price, as before', () => {
    let account = feed(createPaperAccount(), bar(60, 100));
    account = submitPaperOrder(account, { instrument, quantity: 1, side: 'buy', type: 'limit', limitPrice: 95, timeInForce: 'GTC' } as never, 60).account;
    const html = renderToStaticMarkup(React.createElement(PaperChartLines, { account, instrument, visible: true, projection: () => projection, onModifyOrder: () => true, onCancelOrder: () => {}, onClosePosition: () => {} }));
    expect(html).toContain('<span class="axis-tag" aria-hidden="true">95.00</span>');
  });
});
