import { readFileSync } from 'node:fs';
import type React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { activeSeriesHidden, seriesLegendEye, SHOW_SERIES_LABEL, withActiveSeriesVisible } from '../../src/ui/series-visibility';
import { fixtureDataset } from '../../src/domain/fixtures';
import { ensureWorkspaceGrid } from '../../src/ui/workspace-grid';
import { restoreWorkspace } from '../../src/ui/workspace-validation';
import { defaultTheme } from '../../src/ui/themes';
import { DEFAULT_STRATEGY_CONFIG } from '../../src/domain/strategy';

// Main-series Hide in the Object tree hides, shows and persists, and the
// status line eye matches. Synthetic fixture dataset; pure state helpers, static markup and source wiring. No DOM or GUI.
const grid = (seriesHidden?: boolean) => ({ layout: { activeCellId: 'main' }, cells: { main: { datasetId: 'SYNTHETIC', ...(seriesHidden === undefined ? {} : { seriesHidden }) } as { datasetId: string; seriesHidden?: boolean }, other: { datasetId: 'SYNTHETIC-2' } as { datasetId: string; seriesHidden?: boolean } } });

describe('series visibility state', () => {
  it('hides and shows the active cell only; shown leaves no key behind', () => {
    const hidden = withActiveSeriesVisible(grid(), false);
    expect(hidden.cells.main.seriesHidden).toBe(true);
    expect(hidden.cells.other).toEqual({ datasetId: 'SYNTHETIC-2' });
    expect(activeSeriesHidden(hidden)).toBe(true);
    const shown = withActiveSeriesVisible(hidden, true);
    expect('seriesHidden' in shown.cells.main).toBe(false);
    expect(activeSeriesHidden(shown)).toBe(false);
  });
  it('no change returns the same grid; a missing active cell is an error', () => {
    const g = grid();
    expect(withActiveSeriesVisible(g, true)).toBe(g);
    expect(activeSeriesHidden(null)).toBe(false);
    expect(() => withActiveSeriesVisible({ layout: { activeCellId: 'gone' }, cells: {} }, false)).toThrow('The active chart is unavailable.');
  });
  it('the status line eye shows only while hidden and has a readable label', () => {
    expect(seriesLegendEye(false, () => {})).toBeNull();
    const html = renderToStaticMarkup(seriesLegendEye(true, () => {}) as React.ReactElement);
    expect(html).toContain(`aria-label="${SHOW_SERIES_LABEL}"`);
    expect(html).toContain('data-series-hidden="true"');
    expect(html).not.toContain(String.fromCharCode(0x2014));
  });
});

describe('persistence', () => {
  const dataset = fixtureDataset('GME', 3);
  dataset.resolution = '1m'; dataset.provenance = { ...dataset.provenance, providerId: 'A', providerName: 'Synthetic A', datasetId: 'A-1m' }; dataset.bars = [0, 60, 120].map(time => ({ time, open: 10, high: 12, low: 9, close: 11, volume: 100 }));
  const defaults = { version: 1, symbol: 'GME', sourceId: null, imports: [], chartStyle: 'candles', themeId: defaultTheme.id, appearance: defaultTheme.appearance, watchlist: ['GME'], chartOptions: { source: 'close' as const, scale: 'linear' as const, auto: true, invert: false, timezone: 'UTC' }, drawings: { version: 1, drawings: [] }, indicators: [], comparisons: [], script: { id: 'test', name: 'Synthetic test', source: '({onBar(){}})', pane: 'price' }, strategy: DEFAULT_STRATEGY_CONFIG, screener: { columns: [{ id: 'symbol', metric: 'symbol' }], filters: [], sort: { columnId: 'symbol', direction: 'asc' } } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saved = (value: unknown) => { const state = ensureWorkspaceGrid({ ...defaults, imports: [dataset], sourceId: dataset.provenance.datasetId } as never) as any; state.grid.cells[state.grid.layout.activeCellId].seriesHidden = value; return state; };
  it('a hidden series survives save and restore', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const restored = restoreWorkspace(structuredClone(saved(true)), defaults) as any;
    expect(activeSeriesHidden(restored.grid)).toBe(true);
  });
  it('a non-boolean saved value is rejected', () => {
    expect(() => restoreWorkspace(saved('yes'), defaults)).toThrow('Invalid main series visibility.');
  });
});

describe('wiring (source)', () => {
  it('the grid cell applies the saved value through the renderer candleVisible', () => {
    const grid = readFileSync('src/ui/MultiChartGrid.tsx', 'utf8'), adapter = readFileSync('src/chart/adapter.ts', 'utf8');
    expect(grid).toContain('chart.setSeriesVisible(saved.seriesHidden!==true)');
    expect(adapter).toContain("chart.renderer.set('candleVisible',visible)");
  });
  it('the Object tree Hide button and the legend eye both commit the active cell', () => {
    const app = readFileSync('src/ui/App.tsx', 'utf8'), tree = readFileSync('src/ui/ObjectTreePanel.tsx', 'utf8');
    expect(app).toContain('seriesVisible:!seriesHidden,onSeriesVisibility:setSeriesVisibility');
    expect(app).toContain('seriesLegendEye(seriesHidden,()=>setSeriesVisibility(true))');
    expect(app).toContain('withActiveSeriesVisible(');
    expect(tree).toContain("if(button==='hide')latest.current.onSeriesVisibility?.(!node.visible)");
  });
});
