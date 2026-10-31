import Decimal from 'decimal.js';
import { paperFeeFor, submitPaperOrder, type PaperAccount, type PaperOrderRequest, type PaperSide } from './paper';
import { materializePaperTicket, previewPaperTicket, type PaperExitValueInput, type PaperTicketContext, type PaperTicketInput } from './paper-ticket';

/**
 * The broker-style order ticket: Market, Limit, Stop and Stop limit tabs, a Buy/Sell toggle, quantity in units or as money at
 * risk, optional take profit and stop loss (as a price, ticks, percent of the entry or money), and Day, GTC or GTD time in force.
 * It builds a standard ticket input and goes through the same preview, materialize and submit path as every other virtual
 * order, so the engine's checks (tick grid, side of market, buying power) all apply. Virtual money only.
 */
export type BrokerTab = 'market' | 'limit' | 'stop' | 'stop-limit' | 'trailing-stop';
/** Trailing tab: trail by a price distance or by a percent of the best price. */
export type BrokerTrailMode = 'price' | 'percent';
/** How a take profit or stop loss is entered (the reference ticket's Price, Ticks, % and money columns). */
export type BrokerExitMode = 'price' | 'ticks' | 'percent' | 'money';
export interface BrokerTicketDraft {
  side: PaperSide; tab: BrokerTab; sizing: 'units' | 'risk';
  /** The limit price (Limit tab), the stop price (Stop and Stop limit tabs). */
  quantity: string; riskMoney: string; price: string; takeProfit: string; stopLoss: string;
  /** The limit price of a Stop limit order (its stop price is `price`). */
  limitPrice?: string;
  /** Trailing tab: how the stop trails and by how much (a plain number string). Absent mode means price. */
  trailMode?: BrokerTrailMode; trailAmount?: string;
  /** Absent means price. */
  takeProfitMode?: BrokerExitMode; stopLossMode?: BrokerExitMode;
  /** Limit entry may also fill in pre-market and post-market (version-2 session policy). Ignored for Market and Stop. */
  extendedHours?: boolean;
  /** The take-profit exit may also fill in pre-market and post-market (version-2 session policy). Needs a take profit. */
  takeProfitOutsideRth?: boolean;
  /** Time in force: Day (default), GTC or GTD. Week and Month stay unavailable until their reference rule is known (owner hold). */
  duration?: BrokerDuration;
  /** The GTD expiry as a datetime-local value ("YYYY-MM-DDTHH:MM") on the chart wall clock. */
  expiresAt?: string;
}
export type BrokerDuration = 'day' | 'gtc' | 'gtd' | 'week' | 'month';
/** `unavailable` is the reason a duration cannot be chosen (Week / Month: the reference arithmetic is unresolved). */
export const BROKER_DURATIONS: ReadonlyArray<{ id: BrokerDuration; label: string; unavailable?: string }> = [
  { id: 'day', label: 'Day' }, { id: 'gtc', label: 'Good till cancelled (GTC)' }, { id: 'gtd', label: 'Good till date (GTD)' },
  { id: 'week', label: 'Week: until the last session close of the week' }, { id: 'month', label: 'Month: until the last session close of the month' },
];
export function blankBrokerDraft(side: PaperSide): BrokerTicketDraft { return { side, tab: 'market', sizing: 'units', quantity: '1', riskMoney: '', price: '', takeProfit: '', stopLoss: '' }; }

const LEVEL = 'bracket';
const exitValue = (value: string, mode: BrokerExitMode | undefined, currency: string): PaperExitValueInput => mode === 'ticks' ? { kind: 'ticks', value } : mode === 'percent' ? { kind: 'price-percent', value } : mode === 'money' ? { kind: 'money', value, currency } : { kind: 'price', value };
/** Reads the GTD datetime-local value as epoch seconds, or throws a plain sentence. The ticket passes the chart-timezone reader. */
export type BrokerExpiryReader = (value: string) => number;
/** The default reader: the value is UTC wall time. */
export const utcBrokerExpiry: BrokerExpiryReader = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Choose a valid date and time.');
  const [y, mo, d, h, mi] = match.slice(1).map(Number), ms = Date.UTC(y, mo - 1, d, h, mi), check = new Date(ms);
  if (!Number.isFinite(ms) || check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || check.getUTCHours() !== h || check.getUTCMinutes() !== mi) throw new Error('That date or time does not exist.');
  return ms / 1000;
};
/** GTD reads the picked wall time (the ticket's reader uses the chart timezone); GTC is its own validity; Week and Month end at the last US session close of the period. */
function brokerValidity(draft: BrokerTicketDraft, readExpiry: BrokerExpiryReader): PaperTicketInput['validity'] {
  return draft.duration === 'gtd' ? { kind: 'manual-expiry', expiresAt: readExpiry((draft.expiresAt ?? '').trim()) } : draft.duration === 'gtc' ? { kind: 'gtc' } : draft.duration === 'week' ? { kind: 'week' } : draft.duration === 'month' ? { kind: 'month' } : { kind: 'day' };
}
export function brokerTicketInput(draft: BrokerTicketDraft, currency: string, exitUnits = '1', readExpiry: BrokerExpiryReader = utcBrokerExpiry): PaperTicketInput {
  const exits = draft.takeProfit.trim() || draft.stopLoss.trim()
    ? { mode: 'single' as const, levels: [{ id: LEVEL, quantity: exitUnits, takeProfit: draft.takeProfit.trim() ? exitValue(draft.takeProfit.trim(), draft.takeProfitMode, currency) : null, stopLoss: draft.stopLoss.trim() ? exitValue(draft.stopLoss.trim(), draft.stopLossMode, currency) : null }] }
    : null;
  return {
    schemaVersion: 1, side: draft.side, type: draft.tab as Exclude<BrokerTab, 'trailing-stop'>,
    quantity: draft.sizing === 'risk' ? { kind: 'risk-money', value: draft.riskMoney.trim(), currency, stopLevelId: LEVEL } : { kind: 'units', value: draft.quantity.trim() },
    limit: draft.tab === 'limit' ? { kind: 'price', value: draft.price.trim() } : draft.tab === 'stop-limit' ? { kind: 'price', value: (draft.limitPrice ?? '').trim() } : null,
    stop: draft.tab === 'stop' || draft.tab === 'stop-limit' ? { kind: 'price', value: draft.price.trim() } : null,
    validity: brokerValidity(draft, readExpiry), entryOutsideRth: draft.tab === 'limit' && draft.extendedHours === true, takeProfitOutsideRth: draft.takeProfitOutsideRth === true && !!draft.takeProfit.trim(), exits,
  };
}

export type BrokerTicketReview =
  | { ok: true; quantity: number; entry: number; notional: number; risk: number | null; reward: number | null; ratio: number | null; notices: string[]; takeProfitPrice: number | null; stopLossPrice: number | null; expiresAt: number | null }
  | { ok: false; message: string };

const word = (message: string) => message.replace(/Quantity or budget must be positive\./, 'Enter a quantity above zero.');
function missing(draft: BrokerTicketDraft): string | null {
  if (draft.tab === 'stop-limit') { if (!draft.price.trim()) return 'Enter a stop price.'; if (!(draft.limitPrice ?? '').trim()) return 'Enter a limit price.'; }
  else if (draft.tab !== 'market' && !draft.price.trim()) return `Enter a ${draft.tab} price.`;
  if (draft.sizing === 'risk') {
    if (!draft.riskMoney.trim()) return 'Enter the money to risk.';
    if (!draft.stopLoss.trim()) return 'Risk sizing needs a stop loss price.';
    if (draft.stopLossMode === 'money') return 'Risk sizing needs the stop loss as a price, ticks or percent.';
  } else if (!draft.quantity.trim()) return 'Enter a quantity.';
  if (draft.duration === 'gtd' && !(draft.expiresAt ?? '').trim()) return 'Choose an expiry date and time.';
  return null;
}
const converted = (mode: BrokerExitMode | undefined) => mode === 'percent' || mode === 'money';
/**
 * A percent or money take profit or stop loss becomes a price the ticket shows. The
 * distance from the entry (percent of the entry price, or money divided by the order quantity) rounds to the nearest tick, half
 * away from zero, because the engine refuses prices off the tick grid and does not round. Price and ticks reach the engine as typed.
 */
function exitPrice(leg: 'tp' | 'sl', amount: string, mode: BrokerExitMode, side: PaperSide, entry: number, quantity: number, tickSize: number): { price: string } | { message: string } {
  const name = leg === 'tp' ? 'take profit' : 'stop loss';
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(amount) || !new Decimal(amount).gt(0)) return { message: `Enter the ${name} as a number above zero.` };
  const raw = mode === 'percent' ? new Decimal(entry).mul(amount).div(100) : new Decimal(amount).div(quantity);
  const distance = raw.div(tickSize).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(tickSize);
  if (distance.isZero()) return { message: `The ${name} is less than one tick from the entry.` };
  const price = new Decimal(entry).add(distance.mul((side === 'buy' ? 1 : -1) * (leg === 'tp' ? 1 : -1)));
  if (!price.gt(0)) return { message: `The ${name} would be at or below zero.` };
  return { price: price.toString() };
}
/**
 * Resolves the draft in passes: the entry price first (from a one-lot preview), then the quantity (by risk when sizing by risk),
 * then any percent or money exit converted to a price, and last the full ticket with the exit quantity set to the order quantity.
 */
function resolve(draft: BrokerTicketDraft, context: PaperTicketContext, readExpiry: BrokerExpiryReader) {
  const gap = missing(draft);
  if (gap) return { ok: false as const, message: gap };
  const currency = context.account.settings.currency, fail = (diagnostics: Array<{ message: string }>) => ({ ok: false as const, message: word(diagnostics.map(row => row.message).join(' ')) });
  const preview = (next: BrokerTicketDraft, exitUnits = '1') => previewPaperTicket(brokerTicketInput(next, currency, exitUnits, readExpiry), context);
  let ticket = draft;
  try {
    if (converted(draft.takeProfitMode) || converted(draft.stopLossMode)) {
      const bare = { ...draft, sizing: 'units' as const, quantity: String(context.instrument.lotSize), takeProfit: '', stopLoss: '' }, basis = preview(bare);
      if (!basis.ok) return fail(basis.diagnostics);
      const entry = basis.value.sizing.entryPrice;
      const convert = (leg: 'tp' | 'sl', current: BrokerTicketDraft, quantity: number) => {
        const amount = (leg === 'tp' ? current.takeProfit : current.stopLoss).trim(), mode = leg === 'tp' ? current.takeProfitMode : current.stopLossMode;
        if (!amount || !converted(mode)) return { draft: current };
        const found = exitPrice(leg, amount, mode!, current.side, entry, quantity, context.instrument.tickSize);
        return 'message' in found ? { message: found.message } : { draft: leg === 'tp' ? { ...current, takeProfit: found.price, takeProfitMode: 'price' as const } : { ...current, stopLoss: found.price, stopLossMode: 'price' as const } };
      };
      // A percent stop does not depend on the quantity, so it is converted before risk sizing reads it (a money stop cannot size).
      if (ticket.stopLossMode === 'percent') { const stop = convert('sl', ticket, 1); if ('message' in stop) return { ok: false as const, message: stop.message! }; ticket = stop.draft; }
      const sized = preview({ ...ticket, ...(converted(ticket.takeProfitMode) ? { takeProfit: '' } : {}), ...(converted(ticket.stopLossMode) ? { stopLoss: '' } : {}) });
      if (!sized.ok) return fail(sized.diagnostics);
      for (const leg of ['tp', 'sl'] as const) { const next = convert(leg, ticket, sized.value.sizing.quantity); if ('message' in next) return { ok: false as const, message: next.message! }; ticket = next.draft; }
    }
    let input = brokerTicketInput(ticket, currency, '1', readExpiry), first = previewPaperTicket(input, context);
    if (first.ok && (ticket.sizing === 'risk' || input.exits)) { input = brokerTicketInput(ticket, currency, String(first.value.resolved.quantity), readExpiry); first = previewPaperTicket(input, context); }
    if (!first.ok) return fail(first.diagnostics);
    return { ok: true as const, preview: first.value, input };
  } catch (error) { return { ok: false as const, message: error instanceof Error ? error.message : String(error) }; }
}

/** The trailing tab builds the engine request directly (the ticket pipeline has no trailing type). Good till cancelled, no paired exits. */
function trailingRequest(draft: BrokerTicketDraft, context: PaperTicketContext, commandId?: string): { ok: true; request: PaperOrderRequest } | { ok: false; message: string } {
  const number = (text: string) => /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim()) ? Number(text.trim()) : NaN;
  const quantity = number(draft.quantity), amount = number(draft.trailAmount ?? '');
  if (draft.sizing === 'risk' || !(quantity > 0)) return { ok: false, message: draft.sizing === 'risk' ? 'A trailing stop is sized in units.' : 'Enter a quantity above zero.' };
  if (!(amount > 0)) return { ok: false, message: 'Enter the trail amount as a number above zero.' };
  const percent = draft.trailMode === 'percent';
  return { ok: true, request: { instrument: context.instrument, side: draft.side, type: 'trailing-stop', quantity, timeInForce: 'GTC', ...(percent ? { trailPercent: amount } : { trailDistance: amount }), ...(commandId ? { commandId } : {}) } };
}

export function reviewBrokerTicket(draft: BrokerTicketDraft, context: PaperTicketContext, readExpiry: BrokerExpiryReader = utcBrokerExpiry): BrokerTicketReview {
  if (draft.tab === 'trailing-stop') {
    const built = trailingRequest(draft, context);
    if (!built.ok) return built;
    const checked = submitPaperOrder(context.account, built.request, context.now);
    if (!checked.ok) return { ok: false, message: checked.diagnostics.map(row => row.message).join(' ') || 'The virtual order was refused.' };
    const entry = (draft.side === 'buy' ? context.quote?.ask : context.quote?.bid) ?? 0;
    return { ok: true, quantity: built.request.quantity, entry, notional: new Decimal(entry).mul(built.request.quantity).toNumber(), risk: null, reward: null, ratio: null, notices: [], takeProfitPrice: null, stopLossPrice: null, expiresAt: null };
  }
  const found = resolve(draft, context, readExpiry);
  if (!found.ok) return found;
  const { sizing, resolved, notices } = found.preview, level = resolved.exits?.levels[0];
  const per = (price: number | undefined) => price === undefined ? null : new Decimal(price).sub(sizing.entryPrice).abs().mul(sizing.quantity).toNumber();
  const risk = per(level?.stopLoss), reward = per(level?.takeProfit), validity = found.input.validity;
  return { ok: true, quantity: sizing.quantity, entry: sizing.entryPrice, notional: sizing.grossNotional, risk, reward, ratio: risk && reward ? new Decimal(reward).div(risk).toDecimalPlaces(2).toNumber() : null, notices, takeProfitPrice: level?.takeProfit ?? null, stopLossPrice: level?.stopLoss ?? null, expiresAt: validity.kind === 'manual-expiry' ? validity.expiresAt : null };
}

const KIND_WORD: Record<BrokerTab, string> = { market: 'market', limit: 'limit', stop: 'stop', 'stop-limit': 'stop limit', 'trailing-stop': 'trailing stop' };
export const brokerTabWord = (tab: BrokerTab) => KIND_WORD[tab];
export type BrokerPlaceResult = { ok: true; account: PaperAccount; message: string } | { ok: false; message: string };
export function placeBrokerTicket(draft: BrokerTicketDraft, context: PaperTicketContext, commandId: string, readExpiry: BrokerExpiryReader = utcBrokerExpiry): BrokerPlaceResult {
  if (draft.tab === 'trailing-stop') {
    const built = trailingRequest(draft, context, commandId);
    if (!built.ok) return built;
    const result = submitPaperOrder(context.account, built.request, context.now);
    if (!result.ok) return { ok: false, message: result.diagnostics.map(row => row.message).join(' ') || 'The virtual order was refused.' };
    return { ok: true, account: result.account, message: `${draft.side === 'buy' ? 'Buy' : 'Sell'} trailing stop ${built.request.quantity} placed with virtual funds.` };
  }
  const found = resolve(draft, context, readExpiry);
  if (!found.ok) return found;
  const built = materializePaperTicket(found.preview, found.input, context);
  if (!built.ok) return { ok: false, message: word(built.diagnostics.map(row => row.message).join(' ')) };
  // GTC is previewed, checked and recorded as GTC (the ticket record has a gtc validity), with no expiry.
  const request: PaperOrderRequest = { ...built.value, commandId };
  const result = submitPaperOrder(context.account, request, context.now);
  if (!result.ok) return { ok: false, message: result.diagnostics.map(row => row.message).join(' ') || 'The virtual order was refused.' };
  const order = result.account.orders.find(row => row.id === result.orderId), filled = order?.status === 'filled';
  const side = draft.side === 'buy' ? 'Buy' : 'Sell';
  return { ok: true, account: result.account, message: `${side} ${KIND_WORD[draft.tab]} ${found.preview.sizing.quantity} ${filled ? 'filled' : 'placed'} with virtual funds.` };
}

/**
 * The ticket's Order info and Position info blocks. Every figure is an estimate
 * from the reviewed ticket and the virtual account at the shown quote; the fill may differ (slippage, a moved quote).
 * Formulas (no reference formula catalog is known; each matches the engine in paper.ts):
 * - Trade value = entry price x quantity (the review's gross notional).
 * - Leverage = the account leverage setting.
 * - Margin = the opening part of the order (the quantity that adds exposure, not the part that closes a position) x entry
 *   price / leverage, the same rule as the engine's orders margin.
 * - Commission = the account commission model applied to this one fill (fixed per fill, percent of notional, or per unit).
 * - Tick value = one instrument tick x quantity: the money one tick of price movement makes or loses on the whole order.
 * - Position after fill = the current position plus the signed order quantity; the average follows the engine (adding keeps a
 *   weighted average, reducing keeps the average, reversing starts at the entry price).
 */
export interface BrokerTicketInfoPosition { side: 'Long' | 'Short' | 'Flat'; quantity: number; average: number | null; }
export interface BrokerTicketInfo {
  tradeValue: number; leverage: number; margin: number; commission: number; tickValue: number; currency: string;
  current: BrokerTicketInfoPosition; after: BrokerTicketInfoPosition; closing: number; opening: number;
}
const infoPosition = (quantity: number, average: number): BrokerTicketInfoPosition => quantity === 0 ? { side: 'Flat', quantity: 0, average: null } : { side: quantity > 0 ? 'Long' : 'Short', quantity: Math.abs(quantity), average };
export function brokerTicketInfo(review: { quantity: number; entry: number; notional: number }, side: PaperSide, context: Pick<PaperTicketContext, 'account' | 'instrument'>): BrokerTicketInfo {
  const { account, instrument } = context, settings = account.settings;
  const held = account.positions[instrument.id], oldQuantity = held?.quantity ?? 0, oldAverage = held?.averagePrice ?? 0;
  const signed = side === 'buy' ? review.quantity : -review.quantity;
  const closing = oldQuantity && Math.sign(oldQuantity) !== Math.sign(signed) ? Math.min(Math.abs(oldQuantity), review.quantity) : 0;
  const opening = new Decimal(review.quantity).sub(closing).toNumber();
  const quantity = new Decimal(oldQuantity).add(signed).toNumber();
  const average = quantity === 0 ? 0 : oldQuantity === 0 || Math.sign(oldQuantity) !== Math.sign(quantity) ? review.entry
    : Math.sign(oldQuantity) === Math.sign(signed) ? new Decimal(oldAverage).mul(Math.abs(oldQuantity)).add(new Decimal(review.entry).mul(review.quantity)).div(Math.abs(quantity)).toNumber() : oldAverage;
  return {
    tradeValue: review.notional, leverage: settings.leverage, currency: settings.currency,
    margin: new Decimal(opening).mul(review.entry).div(settings.leverage).toDecimalPlaces(2).toNumber(),
    commission: paperFeeFor(settings, review.quantity, review.entry),
    tickValue: new Decimal(instrument.tickSize).mul(review.quantity).toNumber(),
    current: infoPosition(oldQuantity, oldAverage), after: infoPosition(quantity, average), closing, opening,
  };
}
