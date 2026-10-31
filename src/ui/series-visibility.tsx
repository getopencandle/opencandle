import React from 'react';
import { EyeIcon } from './icons/toolbar-icons';

/**
 * Main-series Hide: the main series visibility of a grid cell. Saved on the cell
 * (`seriesHidden: true` only while hidden, so older saves and shown series stay byte-identical), applied by the grid cell
 * through the renderer's own candleVisible (bars, price line and last price chip), and toggled from the Object tree row Hide.
 * While hidden, the status line shows an eye that shows the series again (the series legend offers no Hide button).
 */
export interface SeriesVisibilityGrid { layout: { activeCellId: string }; cells: Record<string, { seriesHidden?: boolean }> }
export function activeSeriesHidden(grid: SeriesVisibilityGrid | undefined | null): boolean {
  if (!grid) return false;
  return grid.cells[grid.layout.activeCellId]?.seriesHidden === true;
}
/** The grid with the active cell's main series shown or hidden; the same object when nothing changes. */
export function withActiveSeriesVisible<T extends SeriesVisibilityGrid>(grid: T, visible: boolean): T {
  const id = grid.layout.activeCellId, cell = grid.cells[id];
  if (!cell) throw new Error('The active chart is unavailable.');
  if ((cell.seriesHidden === true) === !visible) return grid;
  const next = { ...cell } as typeof cell;
  if (visible) delete next.seriesHidden; else next.seriesHidden = true;
  return { ...grid, cells: { ...grid.cells, [id]: next } };
}
export const SHOW_SERIES_LABEL = 'Show main series';
/** The status line eye, present only while the main series is hidden. */
export function seriesLegendEye(hidden: boolean, onShow: () => void): React.ReactNode {
  if (!hidden) return null;
  return <button type="button" className="lv-legend-series-eye" data-series-hidden="true" aria-label={SHOW_SERIES_LABEL} title="The main series is hidden. Click to show it." onClick={event => { event.stopPropagation(); onShow(); }}><EyeIcon width={18} height={18}/></button>;
}
