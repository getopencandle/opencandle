import Decimal from 'decimal.js';
import { cancelPaperOrders, closePaperPosition, modifyPaperOrder, reversePaperPosition, submitPaperOrder, type PaperAccount, type PaperOrder, type PaperOrderRequest, type PaperResult, type PaperSide } from './paper';
import { paperDayExpiry } from './paper-expiry';
import type { Instrument, Quote } from './types';

/**
 * The DOM order ladder. Pure functions only; the panel in src/ui/PaperDom.tsx renders them.
 *
 * Data honesty (actual depth or explicitly synthetic depth only; no book from OHLCV bars): OpenCandle feeds carry
 * top of book at most (Alpaca IEX gives one bid and one ask, sometimes with sizes; bar imports give none). The ladder therefore
 * shows a size only on the best bid and best ask rows, and only when the quote carries that size. Every other level is a price
 * row with the account's own working orders. Nothing here invents depth from bars.
 *
 * Choices (no reference observation exists; each is labelled where it appears):
 * - Row count 21 (10 above and 10 below the centre), centre = bid/ask midpoint snapped to the tick, or the
 *   position average, or the nearest working order price when no quote exists.
 * - An order sits on the row of its trigger price: limit at limitPrice, stop at stopPrice, stop-limit at stopPrice
 *   until triggered and limitPrice after.
 * - A marketable cell limit (buy at or above the ask, sell at or below the bid) is allowed but always asks for
 *   confirmation, even with one-click trading on, because it fills at once.
 * - A cell stop that would trigger at once (buy stop at or below the ask, sell stop at or above the bid) is refused.
 * - Cell and market orders use Day validity (the same session-close rule as a new ticket).
 * - Buy Mkt and Sell Mkt fill on the current usable quote or are refused with the account unchanged, like Reverse.
 * - Tick P&L counts whole instrument ticks (stocks have ticks, not pips); percent P&L divides by the position cost
 *   basis (average price times quantity), the same basis as the Positions table.
 */
export const PAPER_DOM_ROWS = 21;
export const PAPER_DOM_NO_DEPTH = 'Top of book only. This data source has no market depth, so sizes show on the best bid and best ask rows when the quote carries them. Other rows list your own working orders.';

const dec = (value: number | string) => new Decimal(value);
const snap = (price: number, tick: number) => dec(price).div(tick).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(tick).toNumber();
const working = (order: PaperOrder) => order.status === 'working' || order.status === 'triggered';
const decimalsOf = (tick: number) => Math.max(0, dec(tick).decimalPlaces());
export const paperDomPriceText = (price: number, tick: number) => dec(price).toFixed(Math.max(2, decimalsOf(tick)));

export interface PaperDomCapability { kind: 'top-of-book' | 'no-quote'; sizes: boolean; label: string; }
export function paperDomCapability(quote: Quote | null | undefined): PaperDomCapability {
  if (!quote) return { kind: 'no-quote', sizes: false, label: 'No quote for this symbol yet. The ladder shows your own orders; prices fill in when a quote arrives.' };
  const sizes = quote.bidSize !== undefined || quote.askSize !== undefined;
  return { kind: 'top-of-book', sizes, label: PAPER_DOM_NO_DEPTH + (sizes ? '' : ' This quote carries no sizes.') + (quote.fixture ? ' Synthetic quote.' : '') };
}

/** The level an order sits on. Market orders have no level. */
export function paperDomOrderPrice(order: Pick<PaperOrder, 'type' | 'status' | 'limitPrice' | 'stopPrice'>): number | null {
  if (order.type === 'limit') return order.limitPrice ?? null;
  if (order.type === 'stop') return order.stopPrice ?? null;
  if (order.type === 'stop-limit') return (order.status === 'triggered' ? order.limitPrice : order.stopPrice) ?? null;
  return null;
}

/** The centre price for the current state, or null when nothing gives a price. */
export function paperDomCenter(account: PaperAccount, instrument: Instrument, quote: Quote | null | undefined): number | null {
  const tick = instrument.tickSize;
  if (quote) return snap(dec(quote.bid).add(quote.ask).div(2).toNumber(), tick);
  const position = account.positions[instrument.id];
  if (position) return snap(position.averagePrice, tick);
  const prices = account.orders.filter(order => working(order) && order.instrument.id === instrument.id).map(paperDomOrderPrice).filter((price): price is number => price !== null);
  return prices.length ? snap(prices[0], tick) : null;
}

export interface PaperDomOrderRef { id: string; side: PaperSide; type: PaperOrder['type']; quantity: number; }
export interface PaperDomLevel {
  price: number; priceText: string;
  bid: boolean; ask: boolean; average: boolean;
  bidSize: number | null; askSize: number | null;
  buyQuantity: number; sellQuantity: number; orders: PaperDomOrderRef[];
}
export interface PaperDomLadder { levels: PaperDomLevel[]; above: number; below: number; center: number; }

/** A fixed ladder around `center`; the quote moves inside it and never re-centres it. Prices descend. */
export function paperDomLadder(account: PaperAccount, instrument: Instrument, quote: Quote | null | undefined, center: number, rows = PAPER_DOM_ROWS): PaperDomLadder {
  const tick = instrument.tickSize, half = Math.floor(Math.max(1, rows) / 2), mid = snap(center, tick);
  const bid = quote ? snap(quote.bid, tick) : null, ask = quote ? snap(quote.ask, tick) : null;
  const position = account.positions[instrument.id], average = position ? snap(position.averagePrice, tick) : null;
  const levels: PaperDomLevel[] = [];
  for (let step = half; step >= -half; step--) {
    const price = dec(mid).add(dec(tick).mul(step)).toNumber();
    if (price <= 0) continue;
    levels.push({ price, priceText: paperDomPriceText(price, tick), bid: price === bid, ask: price === ask, average: price === average, bidSize: price === bid ? quote?.bidSize ?? null : null, askSize: price === ask ? quote?.askSize ?? null : null, buyQuantity: 0, sellQuantity: 0, orders: [] });
  }
  const top = levels[0]?.price ?? mid, bottom = levels.at(-1)?.price ?? mid;
  let above = 0, below = 0;
  for (const order of account.orders) {
    if (!working(order) || order.instrument.id !== instrument.id) continue;
    const raw = paperDomOrderPrice(order); if (raw === null) continue;
    const price = snap(raw, tick);
    if (price > top) { above++; continue; }
    if (price < bottom) { below++; continue; }
    const level = levels.find(row => row.price === price); if (!level) continue;
    level.orders.push({ id: order.id, side: order.side, type: order.type, quantity: order.quantity });
    if (order.side === 'buy') level.buyQuantity = dec(level.buyQuantity).add(order.quantity).toNumber(); else level.sellQuantity = dec(level.sellQuantity).add(order.quantity).toNumber();
  }
  return { levels, above, below, center: mid };
}

/** A positive quantity aligned to the instrument lot, at most 1000000000 (the engine bound). */
export function paperDomQuantity(text: string, instrument: Instrument): { ok: true; quantity: number } | { ok: false; message: string } {
  const trimmed = String(text ?? '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { ok: false, message: 'Enter a quantity above 0.' };
  const quantity = Number(trimmed);
  if (!(quantity > 0)) return { ok: false, message: 'Enter a quantity above 0.' };
  if (quantity > 1e9) return { ok: false, message: 'Quantity can be at most 1,000,000,000.' };
  if (!dec(trimmed).mod(instrument.lotSize).isZero()) return { ok: false, message: `Quantity must be a multiple of the lot size ${instrument.lotSize}.` };
  return { ok: true, quantity };
}

export interface PaperDomIntent { request: PaperOrderRequest; label: string; marketable: boolean; }
export type PaperDomIntentResult = { ok: true; intent: PaperDomIntent } | { ok: false; message: string };
const sideWord = (side: PaperSide) => side === 'buy' ? 'Buy' : 'Sell';

/** The order a cell click places. `stop` is the Ctrl modifier. */
export function paperDomCellIntent(input: { instrument: Instrument; side: PaperSide; price: number; quantity: number; stop: boolean; quote: Quote | null | undefined; now: number }): PaperDomIntentResult {
  const { instrument, side, quote } = input, tick = instrument.tickSize;
  if (!(input.price > 0) || !dec(input.price).mod(tick).isZero()) return { ok: false, message: 'That price is not on the instrument tick.' };
  const priceText = paperDomPriceText(input.price, tick), expiresAt = paperDayExpiry(input.now, instrument, false);
  if (input.stop) {
    if (quote && (side === 'buy' ? input.price <= quote.ask : input.price >= quote.bid)) return { ok: false, message: side === 'buy' ? `A buy stop at ${priceText} is at or below the ask and would trigger at once. Use Buy Mkt instead.` : `A sell stop at ${priceText} is at or above the bid and would trigger at once. Use Sell Mkt instead.` };
    return { ok: true, intent: { request: { instrument, side, type: 'stop', quantity: input.quantity, stopPrice: input.price, timeInForce: 'DAY', expiresAt }, label: `${sideWord(side)} stop ${input.quantity} ${instrument.symbol} at ${priceText}`, marketable: false } };
  }
  const marketable = !!quote && (side === 'buy' ? input.price >= quote.ask : input.price <= quote.bid);
  return { ok: true, intent: { request: { instrument, side, type: 'limit', quantity: input.quantity, limitPrice: input.price, timeInForce: 'DAY', expiresAt }, label: `${sideWord(side)} limit ${input.quantity} ${instrument.symbol} at ${priceText}${marketable ? ' (fills now at the current quote)' : ''}`, marketable } };
}

export function paperDomMarketIntent(instrument: Instrument, side: PaperSide, quantity: number, now: number): PaperDomIntent {
  return { request: { instrument, side, type: 'market', quantity, timeInForce: 'DAY', expiresAt: paperDayExpiry(now, instrument, false) }, label: `${sideWord(side)} market ${quantity} ${instrument.symbol}`, marketable: true };
}

/** Submits a DOM intent. Market orders must fill at once; otherwise the account is returned unchanged. */
export function submitPaperDomIntent(account: PaperAccount, intent: PaperDomIntent, now: number): PaperResult {
  const result = submitPaperOrder(account, intent.request, now);
  if (!result.ok || intent.request.type !== 'market') return result;
  const order = result.account.orders.find(row => row.id === result.orderId);
  if (order?.status === 'filled') return result;
  const reason = order?.status === 'rejected' ? order.rejectionReason ?? 'The market order was rejected.' : 'A market order needs a current usable quote.';
  return { ok: false, account, diagnostics: [{ code: 'DOM_MARKET_NOT_FILLED', message: `${reason} No virtual order was created.`, severity: 'error' }] };
}

/** The entry points a cell's context menu offers at that price. */
export interface PaperDomContextEntry { id: string; label: string; side: PaperSide; kind: 'market' | 'limit' | 'stop'; disabled: string | null; }
export function paperDomContextEntries(instrument: Instrument, price: number, quote: Quote | null | undefined, quantity: number, now: number): PaperDomContextEntry[] {
  const priceText = paperDomPriceText(price, instrument.tickSize), rows: PaperDomContextEntry[] = [];
  for (const side of ['buy', 'sell'] as const) {
    for (const stop of [false, true]) {
      const intent = paperDomCellIntent({ instrument, side, price, quantity, stop, quote, now });
      rows.push({ id: `${side}-${stop ? 'stop' : 'limit'}`, label: `${sideWord(side)} ${stop ? 'stop' : 'limit'} at ${priceText}`, side, kind: stop ? 'stop' : 'limit', disabled: intent.ok ? null : intent.message });
    }
  }
  for (const side of ['buy', 'sell'] as const) rows.push({ id: `${side}-market`, label: `${sideWord(side)} market`, side, kind: 'market', disabled: quote ? null : 'A market order needs a quote.' });
  return rows;
}

export type PaperDomPnlMode = 'money' | 'ticks' | 'percent';
export interface PaperDomPnl { value: number | null; text: string; reason: string | null; }
/** Money, pip and percent P&L for the selected instrument's open position (marks: long at bid, short at ask). */
export function paperDomPnl(account: PaperAccount, instrument: Instrument, mode: PaperDomPnlMode): PaperDomPnl {
  const position = account.positions[instrument.id];
  if (!position) return { value: null, text: 'Flat', reason: 'No open position' };
  const quote = account.quotes[instrument.id];
  if (!quote) return { value: null, text: 'n/a', reason: 'P&L needs a quote' };
  const mark = position.quantity > 0 ? quote.bid : quote.ask, perUnit = dec(mark).sub(position.averagePrice);
  const sign = (value: Decimal) => (value.gt(0) ? '+' : '');
  if (mode === 'money') { const value = perUnit.mul(position.quantity); return { value: value.toNumber(), text: `${sign(value)}${value.toFixed(2)} ${account.settings.currency}`, reason: null }; }
  if (mode === 'ticks') { const value = perUnit.mul(Math.sign(position.quantity)).div(instrument.tickSize).toDecimalPlaces(0, Decimal.ROUND_DOWN); return { value: value.toNumber(), text: `${sign(value)}${value.toFixed(0)} ticks`, reason: null }; }
  const basis = dec(position.averagePrice).mul(Math.abs(position.quantity));
  if (basis.isZero()) return { value: null, text: 'n/a', reason: 'Cost basis is zero' };
  const value = perUnit.mul(position.quantity).div(basis).mul(100).toDecimalPlaces(2);
  return { value: value.toNumber(), text: `${sign(value)}${value.toFixed(2)}%`, reason: null };
}

/** Close the selected instrument position. Working orders stay (the record names only the position). */
export function flattenPaperDom(account: PaperAccount, instrument: Instrument, now: number): PaperResult { return closePaperPosition(account, instrument.id, now); }
/** The engine reverse (one market order for twice the position, all or nothing). */
export function reversePaperDom(account: PaperAccount, instrument: Instrument, now: number): PaperResult { return reversePaperPosition(account, instrument.id, now); }
/** Cancel buy, cancel sell and cancel all in the documented DOM scope (current instrument). */
export function cancelPaperDom(account: PaperAccount, instrument: Instrument, side: PaperSide | undefined, now: number): PaperResult { return cancelPaperOrders(account, { instrumentId: instrument.id, ...(side ? { side } : {}) }, now); }

/**
 * Drag modify: dropping a working order on another row moves the price it sits on: a limit moves its
 * limit price, a stop its stop price, an untriggered stop-limit its stop price (the limit price stays) and a triggered one its
 * limit price., the same rules as a cell click: a stop may not move to a level that would trigger
 * at once, and a limit moved through the market is marked marketable so the panel always asks first. The engine checks the rest.
 */
export type PaperDomMove = { ok: true; orderId: string; changes: { limitPrice?: number; stopPrice?: number }; label: string; marketable: boolean } | { ok: false; message: string };
export function paperDomMoveIntent(account: PaperAccount, instrument: Instrument, orderId: string, price: number, quote: Quote | null | undefined): PaperDomMove {
  const order = account.orders.find(row => row.id === orderId);
  if (!order || !working(order) || order.instrument.id !== instrument.id) return { ok: false, message: 'That order is no longer working.' };
  const tick = instrument.tickSize;
  if (!(price > 0) || !dec(price).mod(tick).isZero()) return { ok: false, message: 'That price is not on the instrument tick.' };
  const from = paperDomOrderPrice(order);
  if (from === null) return { ok: false, message: 'This order has no price on the ladder.' };
  if (snap(from, tick) === price) return { ok: false, message: 'The order is already at that price.' };
  const priceText = paperDomPriceText(price, tick), moveStop = order.type === 'stop' || (order.type === 'stop-limit' && order.status !== 'triggered');
  if (moveStop && quote && (order.side === 'buy' ? price <= quote.ask : price >= quote.bid)) return { ok: false, message: `A ${order.side} stop at ${priceText} would trigger at once. The order was not moved.` };
  const marketable = !moveStop && !!quote && (order.side === 'buy' ? price >= quote.ask : price <= quote.bid);
  const kind = order.type === 'stop-limit' ? (moveStop ? 'stop-limit stop' : 'stop-limit limit') : order.type;
  return { ok: true, orderId, changes: moveStop ? { stopPrice: price } : { limitPrice: price }, label: `Move ${sideWord(order.side).toLowerCase()} ${kind} ${order.quantity} ${instrument.symbol} to ${priceText}${marketable ? ' (fills now at the current quote)' : ''}`, marketable };
}
/** Applies a move through the engine (modifyPaperOrder keeps the order id and revision rules). */
export function movePaperDomOrder(account: PaperAccount, move: Extract<PaperDomMove, { ok: true }>, now: number): PaperResult { return modifyPaperOrder(account, move.orderId, move.changes, now); }

/** Static ladder scrolling: the wheel moves the fixed ladder by whole ticks; the price stays on the tick grid and above zero. */
export function paperDomScrolled(center: number, ticks: number, instrument: Instrument): number {
  const tick = instrument.tickSize, next = dec(snap(center, tick)).add(dec(tick).mul(Math.trunc(ticks)));
  return next.gt(0) ? next.toNumber() : tick;
}
