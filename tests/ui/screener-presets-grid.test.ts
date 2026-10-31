import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { runScreener, validateScreenerColumn, validateScreenerFilter } from '../../src/domain/screener';
import { SCREENER_PRESETS, instantiateScreenerPreset } from '../../src/domain/screener-presets';
import { GRID_H, GRID_PAD, GRID_W, ScreenerChartGrid, gridFrame, gridLinePoints, gridX, gridY } from '../../src/ui/ScreenerChartGrid';
import type { Bar, BarDataset } from '../../src/domain/types';

const bar = (i: number, o: number, h: number, l: number, c: number): Bar => ({ time: 86400 * i, open: o, high: h, low: l, close: c, volume: 100 });

describe('screener starter presets', () => {
  it('lists the LV-defined starters', () => {
    expect(SCREENER_PRESETS.map(p => p.name)).toEqual(['Top gainers', 'Top losers', 'Oversold RSI', 'New 52-week high', 'Unusual volume', 'Gap up', 'Earnings within 7 days', 'Low P/E', 'High dividend yield']);
  });
  it('every preset is a valid, runnable configuration with fresh ids on each application', () => {
    let n = 0;
    for (const preset of SCREENER_PRESETS) {
      const a = instantiateScreenerPreset(preset, () => `id-${n++}`), b = instantiateScreenerPreset(preset, () => `id-${n++}`);
      expect(a.columns.map(c => c.id)).not.toEqual(b.columns.map(c => c.id));
      for (const column of a.columns) expect(validateScreenerColumn(column)).toBeNull();
      for (const item of a.filters) expect(validateScreenerFilter(item, a.columns.find(c => c.id === item.columnId))).toBeNull();
      expect(a.columns.some(c => c.id === a.sort.columnId)).toBe(true);
      const result = runScreener([fixtureDataset('PRESET', 1)], a.columns, a.filters, a.sort);
      expect(result.diagnostics, preset.id).toEqual([]);
    }
  });
  it('Top gainers keeps only risers and sorts the biggest rise first', () => {
    const make = (symbol: string, closes: number[]): BarDataset => { const d = fixtureDataset(symbol, 0); d.bars = closes.map((c, i) => bar(i, c, c + 1, c - 1, c)); return d; };
    const preset = SCREENER_PRESETS.find(p => p.id === 'top-gainers')!, set = instantiateScreenerPreset(preset, (() => { let k = 0; return () => `g${k++}`; })());
    const result = runScreener([make('SMALL', [100, 101]), make('BIG', [100, 110]), make('DOWN', [100, 90])], set.columns, set.filters, set.sort);
    expect(result.rows.map(r => r.symbol)).toEqual(['BIG', 'SMALL']);
  });
  it('Unusual volume uses relative volume of 2 or more over the previous 10 rows', () => {
    const d = fixtureDataset('VOL', 0); d.provenance.session = 'regular';
    d.bars = Array.from({ length: 11 }, (_, i) => ({ ...bar(i, 10, 11, 9, 10), volume: i === 10 ? 250 : 100 }));
    const preset = SCREENER_PRESETS.find(p => p.id === 'unusual-volume')!, set = instantiateScreenerPreset(preset, (() => { let k = 0; return () => `v${k++}`; })());
    expect(runScreener([d], set.columns, set.filters, set.sort).rows.map(r => r.cells[set.columns[2].id].value)).toEqual([2.5]);
  });
});

describe('screener chart grid', () => {
  it('frames the newest bars and drops incomplete ones', () => {
    const bars = [bar(0, 1, 2, 0, 1), { ...bar(1, 1, 2, 0, 1), close: NaN }, bar(2, 2, 6, 1, 5), bar(3, 5, 8, 4, 7)];
    const frame = gridFrame(bars)!;
    expect(frame.bars.length).toBe(3); expect(frame.low).toBe(0); expect(frame.high).toBe(8);
    expect(gridFrame([bar(0, 1, 2, 0, 1)])).toBeNull();
  });
  it('maps price to pixels with high at the top and the line follows the closes', () => {
    expect(gridY(8, 0, 8)).toBe(GRID_PAD); expect(gridY(0, 0, 8)).toBe(GRID_H - GRID_PAD);
    expect(gridX(0, 3)).toBe(GRID_PAD); expect(gridX(2, 3)).toBe(GRID_W - GRID_PAD);
    const frame = { bars: [bar(0, 0, 8, 0, 0), bar(1, 0, 8, 0, 8)], low: 0, high: 8 };
    expect(gridLinePoints(frame)).toBe(`${GRID_PAD.toFixed(1)},${(GRID_H - GRID_PAD).toFixed(1)} ${(GRID_W - GRID_PAD).toFixed(1)},${GRID_PAD.toFixed(1)}`);
  });
  it('renders one card per row in both styles and an honest empty state', () => {
    const items = [{ key: 'a', label: 'AAA', detail: 'XNAS 1D', bars: Array.from({ length: 10 }, (_, i) => bar(i, i, i + 1, i - 1, i + 0.5)) }, { key: 'b', label: 'BBB', detail: 'XNAS 1D', bars: [bar(0, 1, 2, 0, 1)] }];
    const candles = renderToStaticMarkup(React.createElement(ScreenerChartGrid, { items, mode: 'candles', onOpen: () => undefined }));
    const line = renderToStaticMarkup(React.createElement(ScreenerChartGrid, { items, mode: 'line', onOpen: () => undefined }));
    expect(candles.match(/screener-chart-card/g)!.length).toBe(2); expect(candles).toContain('<rect'); expect(candles).toContain('Not enough bars to draw');
    expect(line).toContain('<polyline'); expect(line).not.toContain('<rect');
    expect(renderToStaticMarkup(React.createElement(ScreenerChartGrid, { items: [], mode: 'line', onOpen: () => undefined }))).toContain('No matching rows');
  });
});
