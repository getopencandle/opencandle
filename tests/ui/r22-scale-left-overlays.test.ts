import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pricePaneProjectionOf } from '../../src/chart/price-pane-projection';
import { AlertChartLines } from '../../src/ui/AlertChartLines';
import { PaperChartLines, type PaperPriceProjection } from '../../src/ui/PaperChartLines';
import { createPaperAccount, submitPaperOrder } from '../../src/domain/paper';
import { feedPaperBars } from '../../src/domain/paper-bar-feed';
import type { Instrument } from '../../src/domain/types';

// the DOM overlays (alert and virtual paper lines) follow
// the data area, which starts at the renderer's input element (after any left scale gutter), and anchor their axis tags on the
// side of the main price scale. SYNTHETIC geometry, instrument and prices; virtual money only. No GUI or pixel claim.
Object.assign(globalThis, { requestAnimationFrame: () => 1, cancelAnimationFrame: () => undefined });
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });
function renderer(side: 'left' | 'right' | null, inputLeft: number) {
  return {
    scene: { panes: new Map([['price', { bounds: { top: 0, height: 400 }, scale: { min: 0, max: 400 } }]]) },
    coords: { width: 736, priceToY: (price: number) => 400 - price, yToPrice: (y: number) => 400 - y },
    input: { el: { getBoundingClientRect: () => rect(inputLeft, 30, 736, 430) } },
    ...(side ? { lvMainScaleSide: () => side, lvSetMainScaleSide: () => false } : {}),
  };
}
const container = { getBoundingClientRect: () => rect(10, 30, 864, 430) };

describe('price pane projection', () => {
  it('starts at the input element rect (a 64 px left gutter) and reports the left scale side', () => {
    const projection = pricePaneProjectionOf(renderer('left', 74) as never, container as never)!;
    expect(projection.left).toBe(74); expect(projection.width).toBe(736); expect(projection.top).toBe(30); expect(projection.height).toBe(400);
    expect(projection.scaleSide).toBe('left');
    expect(projection.priceToY(100)).toBe(30 + 300); expect(projection.yToPrice(30 + 300)).toBe(100);
  });
  it('right side and a renderer without the API: the native right side; no input element falls back to the container', () => {
    expect(pricePaneProjectionOf(renderer('right', 10) as never, container as never)).toMatchObject({ left: 10, scaleSide: 'right' });
    expect(pricePaneProjectionOf(renderer(null, 10) as never, container as never)).toMatchObject({ left: 10, scaleSide: 'right' });
    const bare = { ...renderer(null, 10), input: null };
    expect(pricePaneProjectionOf(bare as never, container as never)).toMatchObject({ left: 10, scaleSide: 'right' });
    expect(pricePaneProjectionOf({ scene: { panes: new Map() }, coords: {} } as never, container as never)).toBeNull();
  });
  it('the chart controller projection uses it', () => {
    const source = readFileSync('src/chart/adapter.ts', 'utf8');
    expect(source).toContain("pricePaneProjectionOf(rendererHolder.current");
  });
});

describe('axis tags follow the main scale side', () => {
  const projection = (scaleSide?: 'left' | 'right') => ({ left: 74, top: 30, width: 736, height: 400, priceToY: (price: number) => 30 + (400 - price), yToPrice: (y: number) => 400 - (y - 30), ...(scaleSide ? { scaleSide } : {}) });
  const alerts = (scaleSide?: 'left' | 'right') => renderToStaticMarkup(React.createElement(AlertChartLines, { rows: [{ alertId: 'a', name: 'SYNTHETIC', slot: 'level', price: 100, label: '100  SYNTHETIC' }], tickSize: 0.5, visible: true, projection: () => projection(scaleSide), onReprice: () => undefined } as never));
  it('alert tags anchor left:0 on a left scale; right:0 stays the default', () => {
    const attr = /<div class="lv-alert-lines"[^>]* data-scale-side="left"/;
    expect(alerts('left')).toMatch(attr);
    expect(alerts('left')).toContain('.lv-alert-lines[data-scale-side="left"] .lv-alert-line .axis-tag{left:0;right:auto}');
    expect(alerts('right')).not.toMatch(attr);expect(alerts()).not.toMatch(attr);
    expect(alerts()).toContain('.lv-alert-line .axis-tag{position:absolute;right:0;');
  });
  it('paper tags anchor left:0 on a left scale', () => {
    const instrument: Instrument = { id: 'SYNTHETIC:R22', symbol: 'R22', name: 'Synthetic R22', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
    const bar = { time: 60, open: 100, high: 100, low: 100, close: 100, volume: 1 };
    const fed = feedPaperBars(createPaperAccount(), { bars: [bar], instrument, provenance: { fixture: false, session: 'regular' }, live: false }).account;
    const placed = submitPaperOrder(fed, { instrument, quantity: 1, side: 'buy', type: 'limit', limitPrice: 95 } as never, 60);
    expect(placed.ok).toBe(true);
    const paper = (scaleSide?: 'left' | 'right') => renderToStaticMarkup(React.createElement(PaperChartLines, { account: placed.account, instrument, visible: true, projection: () => projection(scaleSide) as PaperPriceProjection, onModifyOrder: () => true, onCancelOrder: () => {}, onClosePosition: () => {} } as never));
    const attr = /<div class="lv-paper-lines"[^>]* data-scale-side="left"/;
    expect(paper('left')).toMatch(attr);
    expect(paper('left')).toContain('.lv-paper-lines[data-scale-side="left"] .lv-paper-line .axis-tag{left:0;right:auto}');
    expect(paper()).not.toMatch(attr);expect(paper('right')).not.toMatch(attr);
  });
});
