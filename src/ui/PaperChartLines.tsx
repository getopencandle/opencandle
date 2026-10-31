import React, { useEffect, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { paperSummary, type PaperAccount, type PaperOrder, type PaperOrderRequest, type PaperSide } from '../domain/paper';
import type { Instrument } from '../domain/types';
import { paperDragOutExit, paperExitLines, paperPendingExitLines } from '../domain/paper-exit-drag';
import { axisTagOffset, type AxisTagBoard } from '../chart/axis-tag-board';
import { estimateLabelTextWidth, layoutLineLabels, LINE_LABEL_BUTTON_PX, LINE_LABEL_HANDLE_PX, type LineLabelRequest, type LineLabelSpot } from './line-label-layout';

/**
 * Virtual order and position lines over the active chart's price pane (LV layout and wording). Each working order shows one line per
 * price it carries (limit, stop); the open position shows its average price and its open profit or loss. An order line moves by drag,
 * or by ArrowUp / ArrowDown one tick at a time on its focused label; the change goes through modifyPaperOrder like any other edit.
 * The lines are not drawings: hide, lock, erase and the object tree never see them.
 */
export interface PaperPriceProjection {
  /** Client (viewport) pixels of the price pane. */
  left: number; top: number; width: number; height: number;
  priceToY: (price: number) => number;
  yToPrice: (y: number) => number;
  /** Main price scale side; absent = right. */
  scaleSide?: 'left' | 'right';
}
export type PaperLineField = 'limitPrice' | 'stopPrice';
export interface PaperChartLine {
  /** 'market' is the projection of a working market order at the last price (not movable). */
  id: string; kind: 'order' | 'position' | 'exit' | 'market'; side: PaperSide; price: number; label: string;
  orderId?: string; field?: PaperLineField; quantity: number; leg?: 'tp' | 'sl';
  /** A trailing stop's moving line: it follows the market, so it is shown and cancellable but not dragged. */
  trailing?: true;
  /** A take profit or stop loss of a working entry order's exit plan (placed on the fill). Moves by drag; no cancel here. */
  pendingExit?: { level: number; leg: 'tp' | 'sl' };
}
export type PaperOrderChange = Partial<Pick<PaperOrderRequest, 'limitPrice' | 'stopPrice'>>;

const decimalsOf = (tick: number) => Math.min(8, new Decimal(tick).decimalPlaces());
export function formatPaperPrice(price: number, tickSize: number): string { return price.toFixed(decimalsOf(tickSize)); }
/** Rounds to the nearest tick (half away from zero), never below one tick. */
export function snapPaperPrice(price: number, tickSize: number): number {
  if (!Number.isFinite(price) || !(tickSize > 0)) return NaN;
  const ticks = new Decimal(price).div(tickSize).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return Decimal.max(tickSize, ticks.mul(tickSize)).toNumber();
}
const working = (order: PaperOrder) => order.status === 'working' || order.status === 'triggered';
const typeName: Record<PaperOrder['type'], string> = { market: 'market', limit: 'limit', stop: 'stop', 'stop-limit': 'stop limit', 'trailing-stop': 'trailing stop' };
const sideName = (side: PaperSide) => side === 'buy' ? 'Buy' : 'Sell';

/**
 * Chart settings > Trading > Profit and loss value (trading.positionAndBracketsPL), Positions
 * (trading.positionPL) and Brackets (trading.bracketsPLDisplay), each with Money, Ticks or %. Absent: the position line shows its
 * money P&L and exit lines show none (the behaviour before these rows were connected).
 */
export type PaperProfitDisplay = 'money' | 'ticks' | 'percent';
export interface PaperLineProfitSettings { visible: boolean; position: { visible: boolean; display: PaperProfitDisplay }; brackets: { visible: boolean; display: PaperProfitDisplay } }
/**
 * Chart settings > Trading > Project order for market orders
 * (trading.marketProjectOrderVisibility). A market order that is still working (no fresh quote yet, or outside its session) is
 * drawn at the last price: `lastPrice` (the chart's last price), else the account's quote side it would fill on (ask for a buy,
 * bid for a sell). Absent or false: no projection line.
 */
export interface PaperChartLineOptions { profitLoss?: PaperLineProfitSettings; projectMarketOrders?: boolean; lastPrice?: number | null }
export const PAPER_MARKET_PROJECTION_TITLE = 'This virtual market order is waiting for a fresh quote. The line shows the last price. It fills at the quote, not at this line.';
/** The price a working market order is projected at, or null when no last price is known. */
export function paperMarketProjectionPrice(order: Pick<PaperOrder, 'side' | 'instrument'>, account: PaperAccount, lastPrice?: number | null): number | null {
  if (typeof lastPrice === 'number' && Number.isFinite(lastPrice) && lastPrice > 0) return lastPrice;
  const quote = account.quotes[order.instrument.id], side = quote ? order.side === 'buy' ? quote.ask : quote.bid : NaN;
  return Number.isFinite(side) && side > 0 ? side : null;
}
/**
 * P&L text of a long (quantity > 0) or short position of |quantity| at averagePrice, valued at price. Formats (the facts
 * name the three choices only): Money is the account currency amount with two decimals; Ticks is the price move in instrument ticks
 * in the position's favor, rounded to a whole tick; % is that move against the average price, two decimals.
 */
export function paperLineProfitText(quantity: number, averagePrice: number, price: number | null, tickSize: number, display: PaperProfitDisplay): string {
  if (price === null || !Number.isFinite(price) || !Number.isFinite(averagePrice) || quantity === 0) return 'P&L unavailable';
  const move = new Decimal(price).sub(averagePrice).mul(Math.sign(quantity)), sign = (value: number) => value > 0 ? '+' : '';
  if (display === 'ticks') { if (!(tickSize > 0)) return 'P&L unavailable'; const ticks = move.div(tickSize).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(); return `P&L ${sign(ticks)}${ticks === 0 ? 0 : ticks} ${Math.abs(ticks) === 1 ? 'tick' : 'ticks'}`; }
  if (display === 'percent') { if (averagePrice === 0) return 'P&L unavailable'; const percent = move.div(averagePrice).mul(100).toNumber(); return `P&L ${sign(percent)}${percent.toFixed(2)}%`; }
  const money = move.mul(Math.abs(quantity)).toNumber();
  return `P&L ${money >= 0 ? '+' : ''}${money.toFixed(2)}`;
}

export function paperChartLines(account: PaperAccount, instrument: Instrument, options: PaperChartLineOptions = {}): PaperChartLine[] {
  const lines: PaperChartLine[] = [], tick = instrument.tickSize, profit = options.profitLoss;
  const position = account.positions[instrument.id];
  if (position) {
    const quote = account.quotes[instrument.id], mark = quote ? position.quantity > 0 ? quote.bid : quote.ask : null;
    const shown = !profit || profit.visible && profit.position.visible;
    const pnlText = shown ? ', ' + paperLineProfitText(position.quantity, position.averagePrice, mark, tick, profit?.position.display ?? 'money') : '';
    lines.push({ id: 'position:' + instrument.id, kind: 'position', side: position.quantity > 0 ? 'buy' : 'sell', price: position.averagePrice, quantity: Math.abs(position.quantity), label: `${position.quantity > 0 ? 'Long' : 'Short'} ${Math.abs(position.quantity)} at ${formatPaperPrice(position.averagePrice, tick)}${pnlText}` });
  }
  for (const order of account.orders) {
    if (!working(order) || order.instrument.id !== instrument.id || order.bracket) continue;
    if (order.type === 'market') {
      const at = options.projectMarketOrders ? paperMarketProjectionPrice(order, account, options.lastPrice) : null;
      if (at !== null) lines.push({ id: `market:${order.id}`, kind: 'market', side: order.side, price: at, quantity: order.quantity, orderId: order.id, label: `${sideName(order.side)} market ${order.quantity} at ${formatPaperPrice(at, tick)} (last price)` });
      continue;
    }
    if (order.type === 'trailing-stop') {
      if (order.stopPrice === undefined) continue;
      const trail = order.trailDistance !== undefined ? formatPaperPrice(order.trailDistance, tick) : `${order.trailPercent}%`;
      lines.push({ id: `order:${order.id}:stopPrice`, kind: 'order', side: order.side, price: order.stopPrice, quantity: order.quantity, orderId: order.id, field: 'stopPrice', trailing: true, label: `${sideName(order.side)} trailing stop ${order.quantity} at ${formatPaperPrice(order.stopPrice, tick)} (trail ${trail})` });
      continue;
    }
    const fields: PaperLineField[] = order.type === 'limit' ? ['limitPrice'] : order.type === 'stop' ? ['stopPrice'] : order.type === 'stop-limit' ? (order.status === 'triggered' ? ['limitPrice'] : ['stopPrice', 'limitPrice']) : [];
    for (const field of fields) {
      const price = order[field]!;
      const what = order.type === 'stop-limit' ? (field === 'stopPrice' ? 'stop limit, stop' : 'stop limit, limit') : typeName[order.type];
      lines.push({ id: `order:${order.id}:${field}`, kind: 'order', side: order.side, price, quantity: order.quantity, orderId: order.id, field, label: `${sideName(order.side)} ${what} ${order.quantity} at ${formatPaperPrice(price, tick)}` });
    }
  }
  // Brackets P&L: the result of the exit filling at its price, against the open position's average price.
  const bracketText = (quantity: number, price: number) => profit && profit.visible && profit.brackets.visible && position ? ', ' + paperLineProfitText(Math.sign(position.quantity) * quantity, position.averagePrice, price, tick, profit.brackets.display) : '';
  for (const exit of paperPendingExitLines(account, instrument)) lines.push({ id: `pending-exit:${exit.orderId}:${exit.level}:${exit.leg}`, kind: 'exit', side: exit.side, price: exit.price, quantity: exit.quantity, orderId: exit.orderId, leg: exit.leg, pendingExit: { level: exit.level, leg: exit.leg }, label: `${exit.leg === 'tp' ? 'Take profit' : 'Stop loss'} ${exit.quantity} at ${formatPaperPrice(exit.price, tick)} (on fill)` });
  for (const exit of paperExitLines(account, instrument)) lines.push({ id: `exit:${exit.orderId}`, kind: 'exit', side: exit.side, price: exit.price, quantity: exit.quantity, orderId: exit.orderId, leg: exit.leg, label: `${exit.leg === 'tp' ? 'Take profit' : 'Stop loss'} ${exit.quantity} at ${formatPaperPrice(exit.price, tick)}${bracketText(exit.quantity, exit.price)}` });
  return lines;
}

/** Trading.positionAlign: label placement. Right keeps the stylesheet's 64 px gap before the price scale; Left
 * mirrors it; Center centers the label (our own offsets). */
export function paperLabelAlignment(alignment: 'left' | 'center' | 'right' | undefined, part: 'chip' | 'confirm' = 'chip'): React.CSSProperties | undefined {
  if (alignment === 'left') return { left: 64, right: 'auto' };
  if (alignment === 'center') return { left: '50%', right: 'auto', transform: part === 'chip' ? 'translate(-50%, -50%)' : 'translateX(-50%)' };
  return undefined;
}

/** Trading.extendLeftTradingLine, "Extended price lines across the entire chart width"
 * (reference default on). Off: each line is drawn only from its label toward the price scale (Right alignment: the 64 px
 * between the label and the scale; Left and Center: from the label's start to the scale). Null: the full-width line. The
 * short-line geometry is our own choice. */
export function paperLineSegment(extend: boolean | undefined, alignment: 'left' | 'center' | 'right' | undefined): React.CSSProperties | null {
  if (extend !== false) return null;
  if (alignment === 'left') return { left: 64, right: 0 };
  if (alignment === 'center') return { left: '50%', right: 0 };
  return { right: 0, width: 64 };
}

/** The chip's place across the pane at its alignment (the stylesheet's 64 px gap), as a span. */
export const PAPER_LABEL_GAP = 64;
export function paperLabelSpan(alignment: 'left' | 'center' | 'right' | undefined, paneWidth: number, width: number): Pick<LineLabelRequest, 'left' | 'right' | 'step'> {
  if (alignment === 'left') return { left: PAPER_LABEL_GAP, right: PAPER_LABEL_GAP + width, step: 'right' };
  if (alignment === 'center') return { left: paneWidth / 2 - width / 2, right: paneWidth / 2 + width / 2, step: 'right' };
  return { left: paneWidth - PAPER_LABEL_GAP - width, right: paneWidth - PAPER_LABEL_GAP, step: 'left' };
}
/** The chip (or its confirmation) style once its label is laid out: moved by `offset` px down and `dx` px across. */
export function paperLabelStyle(alignment: 'left' | 'center' | 'right' | undefined, part: 'chip' | 'confirm', offset: number, dx: number): React.CSSProperties | undefined {
  const base = paperLabelAlignment(alignment, part);
  if (!offset && !dx) return base;
  const style: React.CSSProperties = { ...(base ?? {}) };
  if (dx) { if (alignment === 'left') style.left = PAPER_LABEL_GAP + dx; else if (alignment === 'center') style.left = `calc(50% + ${dx}px)`; else style.right = PAPER_LABEL_GAP - dx; }
  if (offset) style.marginTop = (part === 'confirm' ? 12 : 0) + offset;
  return style;
}
/** The thin leader from a moved chip back to its line. */
export function paperLabelLeader(alignment: 'left' | 'center' | 'right' | undefined, offset: number, dx: number): React.CSSProperties {
  const across: React.CSSProperties = alignment === 'left' ? { left: PAPER_LABEL_GAP + dx + 4 } : alignment === 'center' ? { left: `calc(50% + ${dx}px)` } : { right: PAPER_LABEL_GAP - dx + 4 };
  return { ...across, top: Math.min(0, offset), height: Math.abs(offset) };
}

/** Where a line sits in the pane. One that is off screen is pinned 9 px inside the nearest edge so it stays reachable. */
export function paperLinePlacement(y: number, height: number): { y: number; pinned: 'above' | 'below' | null } {
  if (!Number.isFinite(y)) return { y: NaN, pinned: null };
  if (y < 9) return { y: 9, pinned: 'above' };
  if (y > height - 9) return { y: height - 9, pinned: 'below' };
  return { y, pinned: null };
}

/** The order change a drag or key move produces. Null when the move is not valid (no change, crossing its own stop limit pair). */
export function paperLineChange(order: PaperOrder, field: PaperLineField, price: number, tickSize: number): PaperOrderChange | null {
  const snapped = snapPaperPrice(price, tickSize);
  if (!Number.isFinite(snapped) || snapped === order[field]) return null;
  return { [field]: snapped } as PaperOrderChange;
}
export function paperLineKeyStep(key: string): number { return key === 'ArrowUp' ? 1 : key === 'ArrowDown' ? -1 : 0; }

function sameProjection(a: PaperPriceProjection | null, b: PaperPriceProjection | null, probe: number): boolean {
  if (!a || !b) return a === b;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height && (a.scaleSide ?? 'right') === (b.scaleSide ?? 'right') && a.priceToY(probe) === b.priceToY(probe) && a.priceToY(probe * 1.01) === b.priceToY(probe * 1.01);
}

export interface PaperChartLinesProps {
  account: PaperAccount;
  instrument: Instrument;
  visible: boolean;
  /** Reads the active chart's price pane right now; null while the chart is unavailable. */
  projection: () => PaperPriceProjection | null;
  /** Returns false when the change was refused (the line snaps back). */
  onModifyOrder: (orderId: string, changes: PaperOrderChange) => boolean | void;
  onCancelOrder: (orderId: string) => void;
  onClosePosition: (instrumentId: string) => void;
  /** The Reverse button next to Close on the position line. Absent: no button. */
  onReversePosition?: (instrumentId: string) => void;
  /** Chart settings > Trading > Reverse position button (trading.reverseButton). Absent: shown. */
  showReverse?: boolean;
  /** Moves a take profit or stop loss child to a new price. Returns false when refused. */
  onModifyExit?: (orderId: string, price: number, pending?: { level: number; leg: 'tp' | 'sl' }) => boolean | void;
  /** A take profit or stop loss dragged out of the position line. */
  onAttachExit?: (instrumentId: string, leg: 'tp' | 'sl', price: number) => boolean | void;
  /** The chart's shared axis tag layout. Absent: each price tag sits at its price. */
  tagBoard?: AxisTagBoard;
  /** Trading.positionAndBracketsPL, positionPL and bracketsPLDisplay. Absent: money P&L on the position only. */
  profitLoss?: PaperLineProfitSettings;
  /** Trading.positionAlign, where the labels sit across the pane. Absent: right. */
  alignment?: 'left' | 'center' | 'right';
  /** True while one-click trading is off. A move, cancel, close or drag-out exit then waits for
   * an inline Confirm; false or absent sends it at once (one-click on). */
  confirmActions?: boolean;
  /** A short status message, such as a confirmation refused because the order changed meanwhile. */
  onNotice?: (message: string) => void;
  /** Trading.marketProjectOrderVisibility. Absent: no market order projection. */
  projectMarketOrders?: boolean;
  /** Trading.extendLeftTradingLine. Absent or true: lines span the pane; false: only from the label to the scale. */
  extendLines?: boolean;
  /** The chart's last price, where a working market order is projected. */
  lastPrice?: number | null;
}
/** What one line draws this frame (a dragged or confirming line at its new price). */
export interface PaperLineDraw { line: PaperChartLine; price: number; placed: { y: number; pinned: 'above' | 'below' | null }; moving: boolean; text: string }
export function paperLineDraws(lines: readonly PaperChartLine[], projection: PaperPriceProjection, priceOf: (line: PaperChartLine) => number, drag: { id: string; price: number } | null, tickSize: number): PaperLineDraw[] {
  return lines.flatMap(line => {
    const price = priceOf(line), placed = paperLinePlacement(projection.priceToY(price) - projection.top, projection.height);
    if (!Number.isFinite(placed.y)) return [];
    const moving = price !== line.price || drag?.id === line.id, label = moving ? line.label.replace(/at [\d.]+/, 'at ' + formatPaperPrice(price, tickSize)) : line.label;
    const arrow = placed.pinned === 'above' ? '\u25B2 ' : placed.pinned === 'below' ? '\u25BC ' : '';
    return [{ line, price, placed, moving, text: arrow + label }];
  });
}
/**
 * Lays the chips out together so none covers another one's buttons. The line being dragged or confirmed keeps
 * its place, then the position line (its Reverse, Close and TP/SL controls never move), then the others top to bottom, each at
 * the nearest free height. Chip widths are the estimates of line-label-layout.ts.
 */
export function paperLabelLayout(draws: readonly PaperLineDraw[], projection: Pick<PaperPriceProjection, 'width' | 'height'>, options: { alignment?: 'left' | 'center' | 'right'; anchorId?: string | null; handle?: boolean; reverse?: boolean } = {}): Map<string, LineLabelSpot> {
  const rank = (draw: PaperLineDraw) => draw.line.id === options.anchorId ? 0 : draw.line.kind === 'position' ? 1 : 2;
  const requests = draws.map((draw, index) => ({ draw, index })).sort((a, b) => rank(a.draw) - rank(b.draw) || a.draw.placed.y - b.draw.placed.y || a.index - b.index).map(({ draw }): LineLabelRequest => {
    const position = draw.line.kind === 'position', width = estimateLabelTextWidth(draw.text) + (position && options.handle ? LINE_LABEL_HANDLE_PX : 0) + (position && options.reverse ? LINE_LABEL_BUTTON_PX : 0) + LINE_LABEL_BUTTON_PX;
    return { id: draw.line.id, y: draw.placed.y, height: 18, ...paperLabelSpan(options.alignment, projection.width, width), ...(draw.line.id === options.anchorId ? { anchor: true } : {}) };
  });
  return layoutLineLabels(requests, projection);
}
/** Pane-relative axis tag requests for the lines as drawn (a dragged line at its drag price). */
export function paperAxisTagRequests(lines: readonly PaperChartLine[], projection: PaperPriceProjection, drag: { id: string; price: number } | null) {
  return lines.flatMap(line => { const placed = paperLinePlacement(projection.priceToY(drag?.id === line.id ? drag.price : line.price) - projection.top, projection.height); return Number.isFinite(placed.y) ? [{ id: line.id, y: placed.y, height: 18 }] : []; });
}

/**
 * One pointer drag of a chart
 * line. Moves preview the snapped price; release commits it; Escape or a pointer cancel ends the drag with the committed anchor
 * (no change is sent). It finishes once; later events are ignored.
 */
export interface PaperLineDragSession { move(clientY: number): void; release(): void; cancel(): void; keydown(key: string): boolean; }
export function createPaperLineDragSession(options: { startPrice: number; tickSize: number; yToPrice: (y: number) => number; onPreview: (price: number) => void; onFinish: (result: { committed: boolean; price: number }) => void }): PaperLineDragSession {
  let price = options.startPrice, done = false;
  const finish = (committed: boolean) => { if (done) return; done = true; options.onFinish({ committed, price: committed ? price : options.startPrice }); };
  return {
    move(clientY) { if (done) return; const at = snapPaperPrice(options.yToPrice(clientY), options.tickSize); if (Number.isFinite(at)) { price = at; options.onPreview(at); } },
    release() { finish(true); },
    cancel() { finish(false); },
    keydown(key) { if (done || key !== 'Escape') return false; finish(false); return true; },
  };
}
/** A chart line action waiting for the inline confirmation (one-click off). `from` is the line price it was asked against. */
export type PaperLinePending =
  | { kind: 'move'; lineId: string; owner: string; from: number; price: number }
  | { kind: 'cancel'; lineId: string; owner: string; from: number }
  | { kind: 'close'; lineId: string; owner: string; from: number }
  | { kind: 'reverse'; lineId: string; owner: string; from: number }
  | { kind: 'attach'; lineId: string; owner: string; from: number; leg: 'tp' | 'sl'; price: number };
export const PAPER_LINE_STALE = 'The virtual order or position changed before you confirmed. Nothing was sent. Review it again.';
/** The question the inline confirmation asks (LV wording). */
export function paperPendingQuestion(pending: PaperLinePending, line: PaperChartLine, tickSize: number): string {
  const subject = line.label.replace(/ at [\d.]+.*$/, '');
  if (pending.kind === 'move') return `Move ${subject} to ${formatPaperPrice(pending.price, tickSize)}?`;
  if (pending.kind === 'cancel') return line.kind === 'exit' ? `Remove ${subject} at ${formatPaperPrice(line.price, tickSize)}?` : `Cancel ${subject} at ${formatPaperPrice(line.price, tickSize)}?`;
  if (pending.kind === 'close') return `${line.label.replace(/^(Long|Short)/, 'Close $1')}. Close at the current price?`;
  if (pending.kind === 'reverse') return `Reverse ${subject} with one market order to ${line.side === 'buy' ? 'sell' : 'buy'} ${new Decimal(line.quantity).mul(2).toString()}?`;
  return `Add ${pending.leg === 'tp' ? 'take profit' : 'stop loss'} ${line.quantity} at ${formatPaperPrice(pending.price, tickSize)}?`;
}

export function PaperChartLines(props: PaperChartLinesProps) {
  const { account, instrument } = props;
  const lineOptions = (from: PaperChartLinesProps): PaperChartLineOptions => ({ profitLoss: from.profitLoss, projectMarketOrders: from.projectMarketOrders, lastPrice: from.lastPrice });
  const lines = props.visible ? paperChartLines(account, instrument, lineOptions(props)) : [];
  const [projection, setProjection] = useState<PaperPriceProjection | null>(() => lines.length ? props.projection() : null);
  const [drag, setDrag] = useState<{ id: string; price: number } | null>(null);
  const latest = useRef(props); latest.current = props;
  const probe = lines[0]?.price ?? 1;
  const [, setTagSignature] = useState('');
  // Follows pan, zoom, scale and resize: re-read the pane each frame while lines exist; state only changes when the geometry does.
  useEffect(() => {
    if (!lines.length) { setProjection(null); return; }
    let frame = 0, previous: PaperPriceProjection | null = null, tags = '';
    const step = () => { let next: PaperPriceProjection | null = null; try { next = latest.current.projection(); } catch { next = null; } if (!sameProjection(previous, next, probe)) { previous = next; setProjection(next); } const board = latest.current.tagBoard; if (board) { const signature = board.signature('paper'); if (signature !== tags) { tags = signature; setTagSignature(signature); } } frame = requestAnimationFrame(step); };
    step();
    return () => cancelAnimationFrame(frame);
  }, [lines.length > 0, probe]);
  // Hand this frame's tags to the shared layout (an empty list releases them).
  const [pendingState, setPending] = useState<PaperLinePending | null>(null);
  const owner = `${account.id}|${account.runId}`;
  // The action waiting for its inline confirmation (one-click off). It belongs to one account, run and line.
  const pending = pendingState && pendingState.owner === owner && lines.some(line => line.id === pendingState.lineId) ? pendingState : null;
  const shown = drag ?? (pending?.kind === 'move' ? { id: pending.lineId, price: pending.price } : null);
  const tagRequests = props.tagBoard && projection ? paperAxisTagRequests(lines, projection, shown) : [], tagKey = JSON.stringify(tagRequests);
  useEffect(() => { const board = props.tagBoard; if (!board) return; board.submit('paper', tagRequests, projection?.height ?? 0); }, [props.tagBoard, tagKey, projection?.height]);
  useEffect(() => { const board = props.tagBoard; return () => { board?.submit('paper', [], 0); board?.publishLabels?.('paper', []); }; }, [props.tagBoard]);
  // The chips, laid out together, and handed to the board so the alert chips keep clear of them.
  const draws = projection ? paperLineDraws(lines, projection, line => drag?.id === line.id ? drag.price : pending?.kind === 'move' && pending.lineId === line.id ? pending.price : line.price, drag, instrument.tickSize) : [];
  const labelSpots = projection ? paperLabelLayout(draws, projection, { alignment: props.alignment, anchorId: drag?.id ?? pending?.lineId ?? null, handle: !!props.onAttachExit, reverse: props.showReverse !== false && !!props.onReversePosition }) : new Map<string, LineLabelSpot>();
  const labelRects = [...labelSpots.values()].map(spot => spot.rect), labelKey = JSON.stringify(labelRects);
  useEffect(() => { props.tagBoard?.publishLabels?.('paper', labelRects); }, [props.tagBoard, labelKey]);
  const confirmBox = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (pending) confirmBox.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }, [pending?.lineId, pending?.kind]);
  if (!lines.length || !projection) return null;
  const spots = props.tagBoard?.placements('paper');
  const orderOf = (id?: string) => account.orders.find(order => order.id === id);
  const confirming = () => latest.current.confirmActions === true;
  const commit = (line: PaperChartLine, price: number) => {
    if (line.kind === 'exit') { if (line.orderId && Number.isFinite(price)) latest.current.onModifyExit?.(line.orderId, price, line.pendingExit); return; }
    const order = latest.current.account.orders.find(row => row.id === line.orderId) ?? orderOf(line.orderId);
    if (!order || !line.field) return;
    const change = paperLineChange(order, line.field, price, instrument.tickSize);
    if (change) latest.current.onModifyOrder(order.id, change);
  };
  /** A move from a drag or a key: sent at once (one-click on) or held for the inline confirmation. */
  const requestMove = (line: PaperChartLine, price: number) => {
    if (!confirming()) { commit(line, price); return; }
    const snapped = snapPaperPrice(price, instrument.tickSize);
    if (!Number.isFinite(snapped) || snapped === line.price) { setPending(null); return; }
    setPending({ kind: 'move', lineId: line.id, owner, from: line.price, price: snapped });
  };
  const runCancel = (line: PaperChartLine) => latest.current.onCancelOrder(line.orderId!);
  const runClose = () => latest.current.onClosePosition(instrument.id);
  const runReverse = () => latest.current.onReversePosition?.(instrument.id);
  const request = (line: PaperChartLine, kind: 'cancel' | 'close' | 'reverse') => { if (!confirming()) { if (kind === 'cancel') runCancel(line); else if (kind === 'reverse') runReverse(); else runClose(); return; } setPending({ kind, lineId: line.id, owner, from: line.price }); };
  const keep = () => setPending(null);
  const confirmPending = () => {
    const held = pending; setPending(null);
    if (!held) return;
    const live = latest.current, now = live.visible ? paperChartLines(live.account, live.instrument, lineOptions(live)) : [], line = now.find(row => row.id === held.lineId);
    // A market projection follows the last price, so only the order itself must still be working.
    if (!line || `${live.account.id}|${live.account.runId}` !== held.owner || line.kind !== 'market' && line.price !== held.from) { live.onNotice?.(PAPER_LINE_STALE); return; }
    if (held.kind === 'move') commit(line, held.price);
    else if (held.kind === 'cancel') runCancel(line);
    else if (held.kind === 'close') runClose();
    else if (held.kind === 'reverse') runReverse();
    else live.onAttachExit?.(live.instrument.id, held.leg, held.price);
  };
  /** Pointer, Escape and cleanup wiring for one drag (Escape restores the committed anchor). */
  const listenDrag = (target: HTMLElement, pointerId: number, startPrice: number, preview: (price: number) => void, done: (result: { committed: boolean; price: number }) => void) => {
    const doc: Pick<Document, 'addEventListener' | 'removeEventListener'> | undefined = target.ownerDocument ?? (typeof document !== 'undefined' ? document : undefined);
    const move = (next: PointerEvent) => session.move(next.clientY);
    const up = (next: PointerEvent) => { if (next.type === 'pointerup') session.release(); else session.cancel(); };
    const key = (next: KeyboardEvent) => { if (session.keydown(next.key)) { next.preventDefault?.(); next.stopPropagation?.(); } };
    const session = createPaperLineDragSession({ startPrice, tickSize: instrument.tickSize, yToPrice: projection.yToPrice, onPreview: preview, onFinish: result => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
      doc?.removeEventListener('keydown', key as EventListener, true);
      try { target.releasePointerCapture?.(pointerId); } catch { /* capture is optional */ }
      setDrag(null); done(result);
    } });
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
    doc?.addEventListener('keydown', key as EventListener, true);
  };
  const begin = (line: PaperChartLine) => (event: React.PointerEvent<HTMLElement>) => {
    if (line.kind === 'position' || line.kind === 'market' || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    // preventDefault on pointerdown also cancels the focus a press gives; focus the handle so ArrowUp / ArrowDown move it after a click.
    const target = event.currentTarget; try { target.focus({ preventScroll: true }); } catch { /* focus is best effort */ }
    try { target.setPointerCapture(event.pointerId); } catch { /* capture is optional */ }
    setPending(null);
    listenDrag(target, event.pointerId, line.price, price => setDrag({ id: line.id, price }), result => { if (result.committed) requestMove(line, result.price); });
    setDrag({ id: line.id, price: line.price });
  };
  // A handle on the position line: drag up or down to create a take profit or stop loss at the release price.
  const beginOut = (line: PaperChartLine) => (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const target = event.currentTarget; try { target.setPointerCapture(event.pointerId); } catch { /* capture is optional */ }
    const signed = line.side === 'buy' ? line.quantity : -line.quantity;
    setPending(null);
    listenDrag(target, event.pointerId, line.price, price => setDrag({ id: line.id + ':out', price }), result => {
      const exit = result.committed ? paperDragOutExit(signed, line.price, result.price, instrument.tickSize) : null;
      if (!exit) return;
      if (confirming()) setPending({ kind: 'attach', lineId: line.id, owner, from: line.price, leg: exit.leg, price: exit.price });
      else latest.current.onAttachExit?.(instrument.id, exit.leg, exit.price);
    });
  };
  const keyMove = (line: PaperChartLine) => (event: React.KeyboardEvent<HTMLElement>) => {
    const step = paperLineKeyStep(event.key);
    if (!step || line.kind === 'position' || line.kind === 'market') return;
    event.preventDefault(); event.stopPropagation();
    const base = pending?.kind === 'move' && pending.lineId === line.id ? pending.price : line.price;
    requestMove(line, new Decimal(base).add(new Decimal(instrument.tickSize).mul(step)).toNumber());
  };
  return (
    <div className="lv-paper-lines" aria-label="Virtual order and position lines" role="group" {...(projection.scaleSide === 'left' ? { 'data-scale-side': 'left' } : {})} style={{ position: 'fixed', left: projection.left, top: projection.top, width: projection.width, height: projection.height, pointerEvents: 'none', zIndex: 4, overflow: 'hidden' }}>
      <style>{`.lv-paper-line .leader{position:absolute;width:0;border-left:1px solid var(--lv-paper-line,#2f7fd1);pointer-events:none}.lv-paper-line{position:absolute;left:0;right:0;height:0;border-top:1px dashed var(--lv-paper-line,#2f7fd1)}.lv-paper-line.short{border-top-color:transparent}.lv-paper-line .segment{position:absolute;top:-1px;height:0;border-top:1px dashed var(--lv-paper-line,#2f7fd1);pointer-events:none}.lv-paper-line.position .segment{border-top-style:solid}.lv-paper-line.sell{--lv-paper-line:#c9483f}.lv-paper-line.position{border-top-style:solid;--lv-paper-line:#d9a441}.lv-paper-line .chip{position:absolute;right:64px;transform:translateY(-50%);display:inline-flex;align-items:stretch;pointer-events:auto;font:11px/18px system-ui,sans-serif;color:#fff;background:var(--lv-paper-line,#2f7fd1);border-radius:2px;white-space:nowrap;user-select:none}.lv-paper-line .chip>span{padding:0 6px}.lv-paper-line.order .chip>span,.lv-paper-line .chip>span[role=slider]{cursor:ns-resize}.lv-paper-line .chip button{border:0;border-left:1px solid #0004;background:transparent;color:inherit;cursor:pointer;padding:0 5px;font:inherit}.lv-paper-line.dragging{border-top-width:2px}.lv-paper-line.exit.tp{--lv-paper-line:#2f9d63}.lv-paper-line.exit.sl{--lv-paper-line:#c9483f}.lv-paper-line .chip .out{cursor:ns-resize;border-left:1px solid #0004;background:#0003}.lv-paper-line.market{border-top-style:dotted}.lv-paper-line.market .chip{opacity:.9}.lv-paper-line[data-pinned]{opacity:.85}.lv-paper-line .axis-tag{position:absolute;right:0;transform:translateY(-50%);padding:0 5px;font:11px/18px system-ui,sans-serif;color:#fff;background:var(--lv-paper-line,#2f7fd1);pointer-events:none;white-space:nowrap}.lv-paper-lines[data-scale-side="left"] .lv-paper-line .axis-tag{left:0;right:auto}.lv-paper-confirm{position:absolute;right:64px;margin-top:12px;display:inline-flex;gap:4px;align-items:center;pointer-events:auto;font:11px/20px system-ui,sans-serif;color:var(--lv-text,#d1d4dc);background:var(--lv-panel,#1e222d);border:1px solid var(--lv-border,#434651);border-radius:3px;padding:2px 6px;box-shadow:0 2px 8px #0006;white-space:nowrap}.lv-paper-confirm button{font:inherit;padding:0 8px;border-radius:2px;border:1px solid var(--lv-border,#434651);background:transparent;color:inherit;cursor:pointer}.lv-paper-confirm button.primary{background:#2962ff;border-color:#2962ff;color:#fff}`}</style>
      {draws.map(({ line, price, placed, moving, text }) => {
        const segment = paperLineSegment(props.extendLines, props.alignment);
        const out = drag?.id === line.id + ':out' ? drag.price : pending?.kind === 'attach' && pending.lineId === line.id ? pending.price : null, outY = out === null ? null : projection.priceToY(out) - projection.top;
        const movable = (line.kind === 'order' || line.kind === 'exit') && !line.trailing;
        const asking = pending?.lineId === line.id ? pending : null;
        // The chip's laid-out place; z-order puts the confirming, dragged and position chips on top.
        const spot = labelSpots.get(line.id), offset = spot ? spot.center - placed.y : 0, dx = spot?.dx ?? 0;
        const layer = asking ? 4 : drag?.id === line.id ? 3 : line.kind === 'position' ? 2 : 0;
        return (
          <React.Fragment key={line.id}>
            <div className={`lv-paper-line ${line.kind} ${line.side}${line.leg ? ' ' + line.leg : ''}${moving ? ' dragging' : ''}${segment ? ' short' : ''}`} style={layer ? { top: placed.y, zIndex: layer } : { top: placed.y }} data-price={price} {...(placed.pinned ? { 'data-pinned': placed.pinned } : {})} {...(offset || dx ? { 'data-label-moved': 'true' } : {})}>
              {segment && <div className="segment" aria-hidden="true" style={segment}/>}
              {offset !== 0 && <span className="leader" aria-hidden="true" style={paperLabelLeader(props.alignment, offset, dx)}/>}
              <div className="chip" style={paperLabelStyle(props.alignment, 'chip', offset, dx)}>
                <span role={movable ? 'slider' : undefined} tabIndex={movable ? 0 : undefined} aria-label={movable ? `Move ${line.label}` : line.label} aria-valuenow={movable ? price : undefined} title={line.pendingExit ? 'Placed when the order fills. Drag to move it, or change it with Modify in the Orders tab.' : movable ? 'Drag to move this virtual order. Arrow keys move it one tick. Escape during a drag puts it back.' : line.kind === 'market' ? PAPER_MARKET_PROJECTION_TITLE : undefined} onPointerDown={begin(line)} onKeyDown={keyMove(line)}>{text}</span>
                {line.kind === 'position' && latest.current.onAttachExit && <span className="out" role="button" aria-label="Drag a take profit or stop loss from the position" title="Drag up or down to add a take profit or stop loss" onPointerDown={beginOut(line)}>TP/SL</span>}
                {line.kind === 'position' && props.showReverse !== false && latest.current.onReversePosition && <button type="button" className="reverse" aria-label={`Reverse ${line.label}`} title="Reverse this virtual position with one market order at the current price" onClick={() => request(line, 'reverse')}>{'⇅'}</button>}
                {line.pendingExit ? null : line.kind === 'position'
                  ? <button type="button" aria-label={`Close ${line.label}`} title="Close this virtual position at the current price" onClick={() => request(line, 'close')}>{'\u00D7'}</button>
                  : <button type="button" aria-label={`Cancel ${line.label}`} title={line.kind === 'exit' ? 'Remove this exit line' : 'Cancel this virtual order'} onClick={() => request(line, 'cancel')}>{'\u00D7'}</button>}
              </div>
              {/* A tag the shared layout has no free room for still shows at its own price (overlapping its
                 neighbours) while its line is inside the pane; only a line pinned to the pane edge loses its tag. */}
              {!(spots?.get(line.id)?.hidden && placed.pinned) && <span className="axis-tag" aria-hidden="true" {...(axisTagOffset(spots?.get(line.id)) ? { 'data-tag-moved': 'true', style: { marginTop: axisTagOffset(spots?.get(line.id)) } } : {})}>{formatPaperPrice(price, instrument.tickSize)}</span>}
              {asking && <div className="lv-paper-confirm" ref={confirmBox} style={paperLabelStyle(props.alignment, 'confirm', offset, dx)} role="group" aria-label="Confirm virtual order change" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); keep(); } }}><span>{paperPendingQuestion(asking, line, instrument.tickSize)}</span><button type="button" className="primary" onClick={confirmPending}>Confirm</button><button type="button" onClick={keep}>Keep</button></div>}
            </div>
            {outY !== null && out !== null && <div className="lv-paper-line exit dragging" style={{ top: outY, zIndex: 3 }} data-price={out}><div className="chip"><span>{`${paperDragOutExit(line.side === 'buy' ? line.quantity : -line.quantity, line.price, out, instrument.tickSize)?.leg === 'tp' ? 'Take profit' : 'Stop loss'} at ${formatPaperPrice(out, instrument.tickSize)}`}</span></div></div>}
          </React.Fragment>
        );
      })}
    </div>
  );
}
