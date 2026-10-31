import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPaperAccount, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import { feedPaperBars } from '../../src/domain/paper-bar-feed';
import { attachPaperExitDrag } from '../../src/domain/paper-exit-drag';
import type { Instrument } from '../../src/domain/types';
import { PaperChartLines, paperChartLines, paperLinePlacement, type PaperPriceProjection } from '../../src/ui/PaperChartLines';

// Synthetic instrument, synthetic prices, virtual money only.
const instrument: Instrument = { id: 'SYNTHETIC:LANEE', symbol: 'LANEE', name: 'Synthetic lane E', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
const bar = (time: number, close: number) => ({ time, open: close, high: close, low: close, close, volume: 1 });
const feed = (account: PaperAccount, ...bars: ReturnType<typeof bar>[]) => feedPaperBars(account, { bars, instrument, provenance: { fixture: false, session: 'regular' }, live: false }).account;
function bracketed(): PaperAccount {
  const placed = submitPaperOrder(feed(createPaperAccount(), bar(60, 100)), { instrument, quantity: 2, side: 'buy', type: 'market', exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 2, takeProfit: 110, stopLoss: 95 }] } } as never, 60);
  expect(placed.ok).toBe(true);
  return feed(placed.account, bar(60, 100), bar(120, 100));
}
const projection: PaperPriceProjection = { left: 10, top: 20, width: 600, height: 300, priceToY: price => 20 + (120 - price) * 10, yToPrice: y => 120 - (y - 20) / 10 };
const props = (account: PaperAccount) => ({ account, instrument, visible: true, projection: () => projection, onModifyOrder: () => true, onCancelOrder: () => {}, onClosePosition: () => {} });

describe('lane E take profit and stop loss lines', () => {
  it('draws the paired exits as Take profit and Stop loss lines, not as plain orders', () => {
    const labels = paperChartLines(bracketed(), instrument).map(line => line.label);
    expect(labels).toContain('Take profit 2 at 110.00');
    expect(labels).toContain('Stop loss 2 at 95.00');
    expect(labels.filter(label => /^(Sell|Buy) /.test(label))).toEqual([]);
  });
  it('renders draggable handles for them and a drag-out handle on the position line', () => {
    const markup = renderToStaticMarkup(React.createElement(PaperChartLines, { ...props(bracketed()), onModifyExit: () => true, onAttachExit: () => true }));
    expect(markup).toContain('aria-label="Move Take profit 2 at 110.00"');
    expect(markup).toContain('aria-label="Move Stop loss 2 at 95.00"');
    expect(markup).toContain('aria-label="Drag a take profit or stop loss from the position"');
  });
  it('pins a line that is off screen to the pane edge instead of dropping it', () => {
    expect(paperLinePlacement(150, 300)).toEqual({ y: 150, pinned: null });
    expect(paperLinePlacement(-80, 300)).toEqual({ y: 9, pinned: 'above' });
    expect(paperLinePlacement(900, 300)).toEqual({ y: 291, pinned: 'below' });
    const far: PaperPriceProjection = { ...projection, priceToY: price => 20 + (500 - price) * 10 };
    expect(renderToStaticMarkup(React.createElement(PaperChartLines, { ...props(bracketed()), projection: () => far }))).toContain('data-pinned="below"');
  });
});

describe('lane E drag-out from the position line', () => {
  it('attaches a take profit to a bare position, then a stop loss to the same level', () => {
    let account = feed(createPaperAccount(), bar(60, 100));
    account = submitPaperOrder(account, { instrument, quantity: 3, side: 'buy', type: 'market' } as never, 60).account;
    account = feed(account, bar(60, 100), bar(120, 100));
    const tp = attachPaperExitDrag(account, instrument.id, 'tp', 106, 120);
    expect(tp.ok).toBe(true);
    const sl = attachPaperExitDrag(tp.account, instrument.id, 'sl', 97, 120);
    expect(sl.ok).toBe(true);
    expect(paperChartLines(sl.account, instrument).map(line => line.label)).toEqual(expect.arrayContaining(['Take profit 3 at 106.00', 'Stop loss 3 at 97.00']));
  });
});

describe('gap 4: price chips at the right axis edge', () => {
  it('draws one price chip per paper line, in the line colour, at the right edge', () => {
    const markup = renderToStaticMarkup(React.createElement(PaperChartLines, props(bracketed())));
    const tags = markup.match(/class="axis-tag"[^>]*>[^<]*</g) ?? [];
    expect(tags.map(tag => tag.replace(/.*>([^<]*)</, '$1')).sort()).toEqual(['100.00', '110.00', '95.00']);
    expect(markup).toContain('.lv-paper-line .axis-tag{');
  });
  it('draws a price chip for each alert line', async () => {
    const { AlertChartLines } = await import('../../src/ui/AlertChartLines');
    const rows = [{ alertId: 'a1', name: 'Alpha', slot: 'value' as never, price: 101.5, label: 'Alpha' }];
    const markup = renderToStaticMarkup(React.createElement(AlertChartLines, { rows, tickSize: 0.01, visible: true, projection: () => projection, onReprice: () => true }));
    expect(markup).toMatch(/class="axis-tag"[^>]*>101\.50</);
  });
});
