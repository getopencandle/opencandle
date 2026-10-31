// Quick trading from the Bar Replay bar (Buy, Sell, Flatten and the open position with its P&L), as the
// reference's replay trading shows them on the replay toolbar. The replay account is LV's separate replay virtual account
// (replay-paper); these helpers only build ordinary market orders through the paper engine, so every fill, fee and refusal
// follows PAPER_POLICIES. Quantity rule: a positive whole multiple of the instrument lot size, default one lot.
import { closePaperPosition, processPaperQuote, submitPaperOrder, type PaperAccount, type PaperResult, type PaperSide } from './paper';
import type { Instrument, Quote } from './types';

export interface ReplayQuickPosition {
  side: 'long' | 'short'; quantity: number; averagePrice: number;
  /** Open P&L at the executable mark (bid for long, ask for short), or null without a mark. */
  unrealized: number | null;
  /** Short text for the bar: "Long 10 @ 23.45". */
  label: string;
  /** Signed P&L text ("+12.30", "-4.00"), or null without a mark. */
  pnl: string | null;
  tone: 'up' | 'down' | 'flat';
}

const decimalsOf = (step: number) => { const text = String(step); return text.includes('e-') ? Number(text.split('e-')[1]) : (text.split('.')[1]?.length ?? 0); };
/** A price at the instrument's tick precision (at least two decimals). */
export function replayQuickPrice(value: number, tickSize: number): string { return value.toFixed(Math.max(2, Math.min(8, decimalsOf(tickSize)))); }
function signed(value: number): string { const text = Math.abs(value).toFixed(2); return value > 0 ? '+' + text : value < 0 ? '-' + text : text; }

/** The replay account's position in the chart instrument, or null when flat. */
export function replayQuickPosition(account: PaperAccount | null, instrument: Pick<Instrument, 'id' | 'tickSize'>): ReplayQuickPosition | null {
  const position = account?.positions[instrument.id];
  if (!account || !position || position.quantity === 0) return null;
  const quote = account.quotes[instrument.id], long = position.quantity > 0, quantity = Math.abs(position.quantity);
  const mark = quote ? (long ? quote.bid : quote.ask) : null;
  const unrealized = mark === null ? null : Math.round((mark - position.averagePrice) * position.quantity * 1e8) / 1e8;
  return {
    side: long ? 'long' : 'short', quantity, averagePrice: position.averagePrice, unrealized,
    label: `${long ? 'Long' : 'Short'} ${quantity} @ ${replayQuickPrice(position.averagePrice, instrument.tickSize)}`,
    pnl: unrealized === null ? null : signed(unrealized), tone: unrealized === null || unrealized === 0 ? 'flat' : unrealized > 0 ? 'up' : 'down',
  };
}

/** Parses the bar's quantity field. Returns the quantity or throws the refusal shown under the field. */
export function parseReplayQuickQuantity(text: string, lotSize: number): number {
  const value = Number(String(text).trim());
  if (!String(text).trim() || !Number.isFinite(value) || value <= 0) throw new Error('Enter a quantity above zero.');
  const lot = lotSize > 0 ? lotSize : 1, lots = value / lot;
  if (Math.abs(lots - Math.round(lots)) > 1e-9) throw new Error(`Quantity must be a whole number of lots (${lot}).`);
  return value;
}

/** True when the quote is the instrument's and newer than the one the account already holds (a repeat is not re-sent). */
function fresherQuote(account: PaperAccount, instrument: Instrument, quote: Quote | null): quote is Quote {
  if (!quote || quote.instrumentId !== instrument.id) return false;
  const held = account.quotes[instrument.id];
  return !held || held.availableAt < quote.availableAt || held.availableAt === quote.availableAt && held.sequence < quote.sequence;
}

/**
 * One market order on the replay account. The current replay quote (the revealed bar's price, when supplied) is accepted
 * first, as the order ticket does, so the order fills at that quote when it is usable; otherwise it waits for the next step.
 */
export function replayQuickOrder(account: PaperAccount, instrument: Instrument, side: PaperSide, quantity: number, quote: Quote | null, now: number): PaperResult {
  if (account.mode !== 'replay-paper') return { ok: false, account, diagnostics: [{ code: 'REPLAY_ACCOUNT_REQUIRED', message: 'Replay quick trading uses the replay account only.', severity: 'error' }] };
  let current = account;
  if (fresherQuote(current, instrument, quote)) { const accepted = processPaperQuote(current, quote, now, current.runId, instrument); if (!accepted.ok) return accepted; current = accepted.account; }
  return submitPaperOrder(current, { instrument, side, type: 'market', quantity, commandId: `replay-quick:${side}:${now}:${current.nextId}` }, now);
}

/** Flatten: closes the whole replay position in the instrument with one reduce-only market order. */
export function replayQuickFlatten(account: PaperAccount, instrument: Instrument, quote: Quote | null, now: number): PaperResult {
  if (account.mode !== 'replay-paper') return { ok: false, account, diagnostics: [{ code: 'REPLAY_ACCOUNT_REQUIRED', message: 'Replay quick trading uses the replay account only.', severity: 'error' }] };
  let current = account;
  if (fresherQuote(current, instrument, quote)) { const accepted = processPaperQuote(current, quote, now, current.runId, instrument); if (!accepted.ok) return accepted; current = accepted.account; }
  return closePaperPosition(current, instrument.id, now);
}
