import React from 'react';
import type { Bar } from '../domain/types';

/**
 * Chart grid for screener results: one small SVG per result row, drawn from the loaded bars. It does not use the chart
 * engine, so it holds no chart state; opening a thumbnail asks the screener to open that exact source.
 */
export type ScreenerChartMode = 'line' | 'candles';
export interface ScreenerChartItem { key: string; label: string; detail: string; bars: readonly Bar[]; }
export const GRID_BARS = 60, GRID_W = 220, GRID_H = 96, GRID_PAD = 6;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Newest `count` bars with a complete finite OHLC, plus the price range that frames them. Null when nothing can be drawn. */
export function gridFrame(bars: readonly Bar[], count = GRID_BARS): { bars: Bar[]; low: number; high: number } | null {
  const usable = bars.slice(-count).filter(bar => [bar.open, bar.high, bar.low, bar.close].every(finite) && bar.high >= bar.low);
  if (usable.length < 2) return null;
  let low = Infinity, high = -Infinity;
  for (const bar of usable) { low = Math.min(low, bar.low); high = Math.max(high, bar.high); }
  return { bars: usable, low, high: high === low ? low + 1 : high };
}
/** Pixel position of a price inside the thumbnail (higher price, smaller y). */
export const gridY = (price: number, low: number, high: number): number => GRID_PAD + (GRID_H - 2 * GRID_PAD) * (1 - (price - low) / (high - low));
export const gridX = (index: number, count: number): number => GRID_PAD + (GRID_W - 2 * GRID_PAD) * (count === 1 ? 0 : index / (count - 1));
/** SVG polyline `points` string for the closes. */
export function gridLinePoints(frame: { bars: Bar[]; low: number; high: number }): string {
  return frame.bars.map((bar, i) => `${gridX(i, frame.bars.length).toFixed(1)},${gridY(bar.close, frame.low, frame.high).toFixed(1)}`).join(' ');
}

function Thumb({ item, mode }: { item: ScreenerChartItem; mode: ScreenerChartMode }) {
  const frame = gridFrame(item.bars);
  if (!frame) return <div className="screener-grid-empty">Not enough bars to draw</div>;
  const up = frame.bars[frame.bars.length - 1].close >= frame.bars[0].close, tone = up ? 'var(--lv-positive-text, #22ab94)' : 'var(--lv-negative-text, #f7525f)';
  const width = Math.max(1.5, (GRID_W - 2 * GRID_PAD) / frame.bars.length * 0.6);
  return <svg viewBox={`0 0 ${GRID_W} ${GRID_H}`} width="100%" role="img" aria-label={`${item.label} last ${frame.bars.length} bars, ${up ? 'rising' : 'falling'}`} preserveAspectRatio="none">
    {mode === 'line'
      ? <polyline points={gridLinePoints(frame)} fill="none" stroke={tone} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      : frame.bars.map((bar, i) => {
        const x = gridX(i, frame.bars.length), color = bar.close >= bar.open ? 'var(--lv-positive-text, #22ab94)' : 'var(--lv-negative-text, #f7525f)';
        const top = gridY(Math.max(bar.open, bar.close), frame.low, frame.high), bottom = gridY(Math.min(bar.open, bar.close), frame.low, frame.high);
        return <g key={i} stroke={color} fill={color}><line x1={x} x2={x} y1={gridY(bar.high, frame.low, frame.high)} y2={gridY(bar.low, frame.low, frame.high)} strokeWidth="1" vectorEffect="non-scaling-stroke" /><rect x={x - width / 2} y={top} width={width} height={Math.max(1, bottom - top)} stroke="none" /></g>;
      })}
  </svg>;
}

/** A fixed grid size sets the columns and fits that many rows in the visible
 * grid area (the rest scrolls); without one the grid fills by width (Auto). The 70vh grid area and the 10 px gap. */
export const GRID_GAP = 10;
export function gridSizeStyle(size: { columns: number; rows: number } | null | undefined): React.CSSProperties | undefined {
  if (!size) return undefined;
  return { gridTemplateColumns: `repeat(${size.columns}, minmax(0, 1fr))`, gridAutoRows: `calc((100% - ${(size.rows - 1) * GRID_GAP}px) / ${size.rows})`, height: '70vh', overflowY: 'auto' };
}
export function ScreenerChartGrid({ items, mode, onOpen, size }: { items: readonly ScreenerChartItem[]; mode: ScreenerChartMode; onOpen: (key: string) => void; size?: { columns: number; rows: number } | null }) {
  if (!items.length) return <p className="screener-note">No matching rows to chart.</p>;
  return <div className="screener-chart-grid" role="list" aria-label="Result charts" data-grid-size={size ? `${size.columns}x${size.rows}` : 'auto'} style={gridSizeStyle(size)}>
    {items.map(item => <button type="button" role="listitem" className="screener-chart-card" key={item.key} onClick={() => onOpen(item.key)} aria-label={`Open ${item.label}`}>
      <span className="screener-chart-title"><strong>{item.label}</strong><small>{item.detail}</small></span>
      <Thumb item={item} mode={mode} />
    </button>)}
  </div>;
}

export const SCREENER_GRID_CSS = `.table-scroll[hidden]{display:none}.screener-view-switch{display:inline-flex;gap:0}.screener-controls-line>label{display:inline-flex;gap:8px;align-items:center}.screener-chart-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin:10px 0}.screener-chart-card{display:flex;flex-direction:column;gap:6px;padding:10px;text-align:left;background:var(--lv-bg-raised,#1f1f1f);border:1px solid var(--lv-border,#434343);border-radius:var(--lv-menu-radius,6px);color:var(--lv-text-primary,#d1d4dc);cursor:pointer}.screener-chart-card:hover{background:var(--lv-hover,#2e2e2e);border-color:var(--lv-border-hover,#5a5a5a)}.screener-chart-card:focus-visible{outline:2px solid var(--lv-focus-ring,#2962ff);outline-offset:1px}.screener-chart-title{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.screener-chart-title small{color:var(--lv-text-secondary,#9a9a9a);white-space:nowrap}.screener-chart-card svg{height:96px;display:block}.screener-chart-grid:not([data-grid-size=auto]) .screener-chart-card{min-height:0;overflow:hidden}.screener-chart-grid:not([data-grid-size=auto]) .screener-chart-card svg{flex:1 1 0;min-height:32px;height:auto}.screener-grid-empty{height:96px;display:flex;align-items:center;justify-content:center;color:var(--lv-text-secondary,#9a9a9a);font-size:12px}.screener-preset-note{color:var(--lv-text-secondary,#9a9a9a);font-size:12px}`;
