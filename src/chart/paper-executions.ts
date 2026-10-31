// Virtual fills on the chart. Pure model only: which fills show, at which bar and
// price, with which text. The overlay (src/ui/PaperExecutionMarks.tsx) paints them and plays the execution sound. Settings:
// Chart settings > Trading > Executions (trading.executionMarks), Execution labels (trading.executionLabels) and the execution
// sound (trading.executionSound). Wording and shapes are OpenCandle's own. Virtual money only.
import Decimal from 'decimal.js';

export interface PaperExecutionFill { id: string; instrumentId: string; side: 'buy' | 'sell'; quantity: number; price: number; at: number; quoteEventTime?: number }
export interface PaperExecutionMark {
  id: string; side: 'buy' | 'sell'; quantity: number; price: number;
  /** Open time (Unix seconds) of the chart bar the fill belongs to. */
  barTime: number;
  /** Side, quantity and price, for the optional label and the accessible name. */
  label: string;
}
/** At most this many of the newest fills are placed; older ones are not painted. */
export const PAPER_EXECUTION_MARK_LIMIT = 500;
/** Pixel gap between the fill price and the arrow tip. */
export const PAPER_EXECUTION_OFFSET_PX = 4;
export const PAPER_EXECUTION_ARROW_PX = 9;

const decimals = (tick: number) => tick > 0 && Number.isFinite(tick) ? Math.min(8, new Decimal(tick).decimalPlaces()) : 2;
export function paperExecutionLabel(side: 'buy' | 'sell', quantity: number, price: number, tickSize: number): string {
  return `${side === 'buy' ? 'Buy' : 'Sell'} ${quantity} at ${price.toFixed(decimals(tickSize))}`;
}
/** Index of the last bar that opens at or before `time` (bars ascending by Unix seconds), or -1. */
export function barIndexAt(bars: readonly { time: number }[], time: number): number {
  let low = 0, high = bars.length - 1, found = -1;
  while (low <= high) { const middle = (low + high) >> 1; if (bars[middle].time <= time) { found = middle; low = middle + 1; } else high = middle - 1; }
  return found;
}
/** The fill's market time: the quote it executed on when known, else the action time. */
export function paperFillTime(fill: PaperExecutionFill): number { return typeof fill.quoteEventTime === 'number' && Number.isFinite(fill.quoteEventTime) && fill.quoteEventTime > 0 ? fill.quoteEventTime : fill.at; }
/**
 * Marks for one chart: fills of its instrument that fall inside the loaded bars, snapped to the bar that contains them. A fill
 * before the first loaded bar is left out; a fill after the last bar belongs to the last bar (the forming bar of a live chart).
 */
export function paperExecutionMarks(fills: readonly PaperExecutionFill[], instrumentId: string, bars: readonly { time: number }[], tickSize: number, limit = PAPER_EXECUTION_MARK_LIMIT): PaperExecutionMark[] {
  if (!bars.length) return [];
  const own = fills.filter(fill => fill.instrumentId === instrumentId && Number.isFinite(fill.price) && fill.quantity > 0).slice(-Math.max(0, limit));
  const out: PaperExecutionMark[] = [];
  for (const fill of own) {
    const index = barIndexAt(bars, paperFillTime(fill));
    if (index < 0) continue;
    out.push({ id: fill.id, side: fill.side, quantity: fill.quantity, price: fill.price, barTime: bars[index].time, label: paperExecutionLabel(fill.side, fill.quantity, fill.price, tickSize) });
  }
  return out;
}
/** Where a mark's arrow sits: a buy points up from below the fill price, a sell points down from above it. */
export function paperExecutionPlacement(side: 'buy' | 'sell', x: number, priceY: number): { x: number; tipY: number; baseY: number; direction: 'up' | 'down' } {
  return side === 'buy'
    ? { x, tipY: priceY + PAPER_EXECUTION_OFFSET_PX, baseY: priceY + PAPER_EXECUTION_OFFSET_PX + PAPER_EXECUTION_ARROW_PX, direction: 'up' }
    : { x, tipY: priceY - PAPER_EXECUTION_OFFSET_PX, baseY: priceY - PAPER_EXECUTION_OFFSET_PX - PAPER_EXECUTION_ARROW_PX, direction: 'down' };
}
/**
 * Fills that are new since the previous observation of the same account run. The first observation (previous null), a
 * different account or run, and a shrinking history (reset) report nothing, so opening a chart or loading a workspace never
 * plays a sound for old fills.
 */
export interface PaperFillObservation { key: string; ids: ReadonlySet<string>; count: number }
export function observePaperFills(previous: PaperFillObservation | null, key: string, fills: readonly { id: string }[]): { observation: PaperFillObservation; fresh: string[] } {
  const observation: PaperFillObservation = { key, ids: new Set(fills.map(fill => fill.id)), count: fills.length };
  if (!previous || previous.key !== key || fills.length < previous.count) return { observation, fresh: [] };
  return { observation, fresh: fills.filter(fill => !previous.ids.has(fill.id)).map(fill => fill.id) };
}
