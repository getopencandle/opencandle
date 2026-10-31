import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BreadthPanel, HotTable, MarketViewsDialog, RatingGauge, SeasonalChart } from '../../src/ui/MarketViewsDialog';
import { technicalRating } from '../../src/market-views/rating';
import type { Bar, BarDataset } from '../../src/domain/types';

const EM_DASH = String.fromCharCode(0x2014);
const bar = (time: number, close: number): Bar => ({ time, open: close, high: close, low: close, close, volume: 1000 });
const ds = (symbol: string, closes: number[]): BarDataset => ({
  instrument: { id: 'T:' + symbol, symbol, name: symbol + ' Inc', exchange: 'TEST', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' },
  bars: closes.map((c, i) => bar(Date.UTC(2023, 0, 1 + i * 20) / 1000, c)), resolution: '1D',
  provenance: { providerId: 's', providerName: 'SYNTHETIC', datasetId: symbol, fixture: true, coverage: '', asOf: 0, delaySeconds: null, adjustment: 'raw', session: 'regular', timezone: 'UTC', state: 'ready', license: '', revision: '', notes: [] },
});
const sets = [ds('AAA', Array.from({ length: 60 }, (_, i) => 10 + i)), ds('BBB', Array.from({ length: 60 }, (_, i) => 80 - i))];
const noop = () => {};

describe('MarketViewsDialog markup', () => {
  it('shows the scope line, labels synthetic data and offers row actions', () => {
    const html = renderToStaticMarkup(h(MarketViewsDialog, { datasets: sets, onClose: noop, onOpen: noop, onAddToWatchlist: noop }));
    expect(html).toContain('2 of 2 loaded symbols'); expect(html).toContain('Not market-wide'); expect(html).toContain('SYNTHETIC');
    expect(html).toContain('aria-label="Open AAA"'); expect(html).not.toContain(EM_DASH);
  });
  it('watchlist scope limits the rows and names missing symbols', () => {
    const html = renderToStaticMarkup(h(MarketViewsDialog, { datasets: sets, watchSymbols: ['AAA', 'NOPE'], state: { version: 1, tab: 'breadth', scope: 'watchlist', symbolId: null }, onClose: noop }));
    expect(html).toContain('1 of 2 watchlist symbols have loaded data'); expect(html).toContain('NOPE');
  });
  it('renders every panel without em dashes', () => {
    const out = [renderToStaticMarkup(h(SeasonalChart, { set: sets[0] })), renderToStaticMarkup(h(RatingGauge, { rating: technicalRating(sets[0].bars) })),
      renderToStaticMarkup(h(BreadthPanel, { sets })), renderToStaticMarkup(h(HotTable, { rows: [], empty: 'Nothing here' }))].join('');
    expect(out).toContain('Buy'); expect(out).toContain('Advancers'); expect(out).toContain('Nothing here'); expect(out).not.toContain(EM_DASH);
  });
});
