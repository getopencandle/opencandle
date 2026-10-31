import Decimal from 'decimal.js';
import type { DomainDiagnostic, Instrument, Quote } from './types';
import { allocatePaperExitLevels, assertPaperPlainData, paperInstrumentKey, validatePaperExitPlan, validatePaperSessionPolicy, type PaperBracketBook, type PaperChildLink, type PaperExitLevelInput, type PaperExitPlanInput, type PaperExitTarget, type PaperSessionPolicy } from './paper-brackets';
import { admitPaperQuoteMetadata, applyPaperBracketFill, assertPaperBracketBudget, assertPaperExitTarget, ensurePaperBrackets, paperBracketQuoteReady, paperExitTarget, paperSerial, reallocatePaperExits, registerPaperExitPlan, revisePaperOrder, terminatePaperExitOrder, validatePaperBracketState } from './paper-bracket-runtime';
import { validatePaperTicketRecord, type PaperTicketRecord } from './paper-ticket';
import { isLastImportedQuote } from './paper-quote';
export type { PaperExitLevelInput, PaperExitPlanInput, PaperExitTarget } from './paper-brackets';
export { paperExitTarget } from './paper-bracket-runtime';

const Money = Decimal.clone({ precision: 32, rounding: Decimal.ROUND_HALF_EVEN });
const dec = (value: number | string) => new Money(value);
const numeric = (value: Decimal) => value.toDecimalPlaces(10).toNumber();
export const PAPER_NOTICE = 'Virtual trading only. Balances, orders, fees and profit/loss are simulated. No deposit, billing or broker connection.';
export type PaperSide = 'buy' | 'sell';
export type PaperOrderType = 'market' | 'limit' | 'stop' | 'stop-limit' | 'trailing-stop';
export type PaperOrderStatus = 'working' | 'triggered' | 'filled' | 'cancelled' | 'expired' | 'rejected';
export interface PaperCommission { kind: 'fixed' | 'percent' | 'per-unit'; value: number; }
/** slippageTicks is an LV-local adverse price adjustment for market and stop fills; no standard slippage setting is assumed. Absent means 0. */
export interface PaperSettings { initialBalance: number; currency: string; leverage: number; commission: PaperCommission; maxQuoteAgeSeconds: number; oneClick?: boolean; slippageTicks?: number; }
export interface PaperOrderRequest {
  instrument: Instrument; side: PaperSide; type: PaperOrderType; quantity: number;
  limitPrice?: number; stopPrice?: number; timeInForce?: 'GTC' | 'DAY' | 'GTD'; expiresAt?: number;
  /** Trailing stop only: exactly one of a price distance or a percent (of the best price) the stop trails behind it. */
  trailDistance?: number; trailPercent?: number;
  reduceOnly?: boolean; extendedHours?: boolean; commandId?: string;
  exits?: PaperExitPlanInput;
  sessionPolicy?: PaperSessionPolicy;
  ticket?: PaperTicketRecord;
}
export interface PaperOrder extends PaperOrderRequest {
  id: string; status: PaperOrderStatus; createdAt: number; updatedAt: number;
  filledQuantity: number; averageFillPrice: number | null; rejectionReason?: string;
  /** Trailing stop only: the best executable price seen since the first usable quote (highest bid for a sell, lowest ask for a buy). */
  trailBest?: number;
  submissionSequence?: number; bracket?: PaperChildLink;
}
export interface PaperPosition { instrument: Instrument; quantity: number; averagePrice: number; realizedGross: number; }
export interface PaperFill {
  id: string; orderId: string; instrumentId: string; side: PaperSide; quantity: number; price: number;
  commission: number; realizedGross: number; at: number; quoteEventTime: number; quoteSequence: number; fixture: boolean;
  /** Present only when LV slippage moved the price: the raw executable bid/ask and the adverse per-unit adjustment. */
  quotePrice?: number; slippage?: number;
  /** Present only for processPaperBar touch fills: the order level was crossed inside a bar segment, so the fill used the order price, not a bar extreme. */
  intrabar?: true;
  /** What the fill price was based on: the ask (buy) or bid (sell), the last imported price when the source has no bid/ask, or the order's own level. Absent on older fills. */
  basis?: PaperFillBasis;
}
export type PaperFillBasis = 'ask' | 'bid' | 'last' | 'order-level';
export function paperFillBasisLabel(basis: PaperFillBasis | undefined): string { return basis === 'ask' ? 'Ask' : basis === 'bid' ? 'Bid' : basis === 'last' ? 'Last price' : basis === 'order-level' ? 'Order price' : ''; }
export interface PaperEvent { id: number; at: number; type: 'submitted' | 'modified' | 'cancelled' | 'triggered' | 'filled' | 'expired' | 'rejected'; orderId: string; message: string; }
/**
 * Account-level journal entries (resets and settings changes). Optional and additive, so accounts saved
 * before it restore unchanged (absent means none). Entries survive a reset, unlike order events, and are capped at
 * PAPER_ACCOUNT_JOURNAL_LIMIT (oldest dropped). Ids are their own sequence, separate from nextId.
 */
export interface PaperAccountEntry { id: number; at: number; type: 'reset' | 'settings'; message: string; balance?: number; }
export const PAPER_ACCOUNT_JOURNAL_LIMIT = 1000;
export interface PaperAccount {
  schemaVersion: 1; id: string; name: string; mode: 'paper' | 'replay-paper'; runId: string; virtual: true;
  createdAt: number; clock: number; settings: PaperSettings; cash: number; realizedGross: number; fees: number;
  positions: Record<string, PaperPosition>; orders: PaperOrder[]; fills: PaperFill[]; events: PaperEvent[];
  quotes: Record<string, Quote>; commands: Record<string, { orderId: string; signature: string }>; nextId: number;
  brackets?: PaperBracketBook;
  journal?: PaperAccountEntry[];
}
export interface PaperResult { ok: boolean; account: PaperAccount; diagnostics: DomainDiagnostic[]; orderId?: string; }
export interface PaperSummary {
  cash: number; balance: number; equity: number | null; unrealized: number | null; realizedGross: number; netRealized: number;
  fees: number; marginUsed: number | null; reservedMargin: number | null; buyingPower: number | null;
  missingMarks: string[]; missingOrderPrices: string[]; staleMarks: string[]; virtual: true;
}
export const PAPER_POLICIES = [
  PAPER_NOTICE,
  'Buy orders execute at ask and sell orders at bid. Limit orders may improve on their limit; stop orders may gap.',
  'Full requested quantities fill at an eligible quote. Queue priority, quote-size liquidity and partial fills are not yet modeled.',
  'Equity marks long positions at bid and short positions at ask. Cash and balance are distinct.',
  'The default balance is 100000 virtual USD and leverage is 1. Zero fees are an OpenCandle default. OpenCandle also supports GTC, which a conventional paper-trading simulator may restrict.',
  'New OpenCandle tickets default to Day. For US equities a Day order ends at the session close: 16:00 New York time for regular-hours orders, 20:00 for extended-hours orders, the next trading day when placed after that close or on a weekend or holiday. On NYSE early-close days the close is 13:00 New York time, 17:00 for extended-hours orders. Other instruments end 86400 seconds after accepted placement. Existing Day expiry never renews on edit. GTC (good till cancelled) is a ticket choice: the order has no expiry and stays working until it fills or is cancelled.',
  'Virtual short positions do not imply actual borrow availability. Borrow fees and forced liquidation are not yet modeled.',
  'Existing working-order margin reservations remain binding. A gap can reject a triggered order rather than consume funds reserved elsewhere.',
  'Stock and ETF tick/lot increments support at most eight decimal places. Unsupported precision is rejected rather than rounded to a zero position.',
  'Ordinary and replay accounts have separate run identities. This engine accepts quotes, never chart-transformed OHLC as execution prices.',
  'Exit requests retain excess coverage visibly. OpenCandle allocates levels in configured order, uses FIFO control exposure for manual reductions, and activates children only on the next distinct quote.',
  'Exit ownership is a local simulation policy. It does not claim actual exchange priority, partial liquidity fills or reference Brackets Management behavior.',
  'Version-2 tickets separate limit-entry and take-profit extended-hours eligibility. Protective stops remain regular-session only. Legacy shared flags retain their original execution behavior.',
  'Synthetic quotes with an unknown session use the disclosed fixture regular-session assumption. All real-feed coverage does not prove an executable session for version-2 tickets.',
  'A last imported price from a source that declares no session fills regular-session-only orders, as synthetic data does. Orders that opt into extended hours wait for a declared session.',
  'Optional OpenCandle slippage (default 0 ticks) moves market and stop fills, including stop-loss exits, adversely by whole instrument ticks: buys pay ask plus slippage and sells receive bid minus slippage, floored at one tick so a sell always has a positive price. Limit, stop-limit and take-profit fills never receive slippage. No standard slippage setting is assumed; this is a local simulation policy.',
  'Gaps: execution uses only accepted quotes. When the next quote jumps past a stop, the stop fills at that quote side (worse than the stop price); a limit crossed by a gap fills at that quote side (better than the limit). No price between two quotes is assumed to have traded.',
  'Intrabar ordering: a single quote can satisfy at most one leg of a valid take-profit/stop-loss pair. Chart bars become quotes only through an explicit path (close-only, or open, then the extreme nearer the open, high on a tie, then the other extreme, then close) with a caller-declared availability time. Through processPaperBar, the open is a gap point (quote-side fills as above) and every later point is an intrabar touch: a limit or take profit crossed inside a segment fills at its own price, a stop or stop loss at its stop price plus any slippage, and a stop-limit triggered with a marketable limit at its stop price. Raw path quotes fed one by one through processPaperQuote are discrete jumps instead (optimistic take profits, pessimistic stop losses at the bar extremes). The point order resembles a conventional broker-emulator assumption, but OpenCandle does not claim parity with any other simulator; any intrabar order is an assumption, not observed data.',
  'Reverse is one market order for twice the position. It must fill on the current usable quote; otherwise, including insufficient virtual buying power, it is refused with no order created and the account unchanged. Older unrelated working orders (for example a manual non-reduce-only exit limit) are not cancelled by a reverse and can still fill against the new position.',
  'Ticket fee estimates apply configured slippage to the entry basis for market and stop orders. They remain estimates: the executed fill price, gaps and percent fees on the final price decide the booked fee.',
  'Stale quotes: a quote older than the account maximum quote age (default 60 seconds) neither fills orders nor supports a ticket preview. Working orders wait for a fresh quote; marks older than the limit are flagged as stale.',
  'Bar-path replay skips a previously accepted prefix only when its last point exactly matches the retained quote. Changed boundaries and older paths whose boundary is no longer retained are refused without changing the virtual account. Earlier skipped points are not re-executed or re-verified.',
  'Partial fills are not modeled. Orders show working, triggered (stop-limit armed), filled, cancelled, expired or rejected only.',
];

function fail(account: PaperAccount, code: string, message: string): PaperResult { return { ok: false, account, diagnostics: [{ code, message, severity: 'error' }] }; }
function guardedPaperAction(account: PaperAccount, action: () => PaperResult, candidates = 1): PaperResult {
  try {
    assertPaperBracketBudget(account, candidates);
    const result = action();
    assertPaperPlainData(result.account);
    if (new TextEncoder().encode(JSON.stringify(result.account)).byteLength > 20 * 1024 * 1024) throw new Error('The complete virtual account exceeds the 20 MiB storage limit. Existing history was retained.');
    validatePaperBracketState(result.account);
    return result;
  }
  catch (error) { return fail(account, 'PAPER_TRANSACTION_REJECTED', error instanceof Error ? error.message : String(error)); }
}
export function submitPaperOrder(account: PaperAccount, request: PaperOrderRequest, now: number): PaperResult { return guardedPaperAction(account, () => submitPaperOrderInternal(account, request, now)); }
export function processPaperQuote(account: PaperAccount, quote: Quote, now: number, runId = account.runId, executionInstrument?: Instrument): PaperResult { return guardedPaperAction(account, () => processPaperQuoteInternal(account, quote, now, runId, executionInstrument), 0); }
export function advancePaperClock(account: PaperAccount, now: number): PaperResult { return guardedPaperAction(account, () => advancePaperClockInternal(account, now)); }
export function cancelPaperOrder(account: PaperAccount, orderId: string, now: number): PaperResult { return guardedPaperAction(account, () => cancelPaperOrderInternal(account, orderId, now)); }
export function modifyPaperOrder(account: PaperAccount, orderId: string, changes: Partial<Pick<PaperOrderRequest, 'quantity' | 'limitPrice' | 'stopPrice' | 'expiresAt' | 'extendedHours' | 'ticket' | 'trailDistance' | 'trailPercent'>>, now: number): PaperResult { return guardedPaperAction(account, () => modifyPaperOrderInternal(account, orderId, changes, now)); }
function assertPaperActionTime(account: PaperAccount, now: number): void { if (!validTime(now) || now < account.clock) throw new Error('Action time cannot precede the virtual account clock.'); }
export function previewPaperExitAllocation(input: unknown, instrument: Instrument, side: PaperSide, capacity: number) { const plan = validatePaperExitPlan(input, instrument, side); return allocatePaperExitLevels(plan.levels.map(level => level.quantity), capacity, instrument.lotSize); }
export function modifyPaperExitPlan(account: PaperAccount, target: PaperExitTarget, input: PaperExitPlanInput, now: number): PaperResult {
  return guardedPaperAction(account, () => {
    assertPaperActionTime(account, now); assertPaperExitTarget(account, target);
    if (target.kind !== 'parent') throw new Error('Edit placed levels individually; position replacement is a separate confirmed operation.');
    const next = structuredClone(account); next.clock = now; expireDueOrders(next, now); assertPaperExitTarget(next, target);
    const order = next.orders.find(row => row.id === target.id)!, pending = next.brackets!.pending[target.id];
    if (!active(order) || !pending) throw new Error('Parent order is no longer working.');
    const plan = validatePaperExitPlan(input, order.instrument, order.side);
    if (order.sessionPolicy?.takeProfitOutsideRth && !plan.levels.some(level => level.takeProfit !== undefined)) throw new Error('This parent enables take-profit extended hours. Retain a take profit or explicitly replace the parent policy.');
    order.exits = plan; pending.input = structuredClone(plan); pending.revision++;
    pending.levelIds = plan.levels.map((_, index) => pending.levelIds[index] ?? `${next.id}:level:${paperSerial(next)}`);
    revisePaperOrder(next, order); order.updatedAt = now; appendEvent(next, now, 'modified', order, 'Virtual exit plan modified. No executable child exists before an opening fill.');
    return { ok: true, account: next, diagnostics: [], orderId: order.id };
  });
}
export function modifyPaperExitLevel(account: PaperAccount, target: PaperExitTarget, levelId: string, input: PaperExitLevelInput, now: number): PaperResult {
  return guardedPaperAction(account, () => {
    assertPaperActionTime(account, now); assertPaperExitTarget(account, target);
    if (target.kind !== 'group') throw new Error('A placed exit group is required.');
    const next = structuredClone(account); next.clock = now; expireDueOrders(next, now); assertPaperExitTarget(next, target);
    const group = next.brackets!.groups.find(row => row.id === target.id)!, level = group.levels.find(row => row.id === levelId);
    if (group.status !== 'active' || !level || level.status !== 'active') throw new Error('This exit level is no longer active.');
    const validated = validatePaperExitPlan({ schemaVersion: 1, mode: group.mode, levels: [input] }, group.instrument, group.direction).levels[0];
    for (const childId of level.childIds) { const child = next.orders.find(row => row.id === childId)!; if (active(child)) { child.status = 'cancelled'; child.updatedAt = now; appendEvent(next, now, 'cancelled', child, 'Virtual exit level explicitly replaced; prior child retained in history.'); } }
    level.requestedQuantity = validated.quantity; delete level.takeProfit; delete level.stopLoss;
    if (validated.takeProfit !== undefined) level.takeProfit = validated.takeProfit;
    if (validated.stopLoss !== undefined) level.stopLoss = validated.stopLoss;
    level.revision++; group.revision++; level.allocation = 0; level.activationSequence = next.quotes[group.instrument.id]?.sequence ?? -1;
    reallocatePaperExits(next, group.instrument.id, now);
    return { ok: true, account: next, diagnostics: [] };
  });
}
export function cancelPaperExitLevel(account: PaperAccount, target: PaperExitTarget, levelId: string, now: number): PaperResult {
  return guardedPaperAction(account, () => {
    assertPaperActionTime(account, now); assertPaperExitTarget(account, target);
    if (target.kind !== 'group') throw new Error('A placed exit group is required.');
    const next = structuredClone(account); next.clock = now; expireDueOrders(next, now); assertPaperExitTarget(next, target);
    const group = next.brackets!.groups.find(row => row.id === target.id)!, level = group.levels.find(row => row.id === levelId);
    if (group.status !== 'active' || !level || level.status !== 'active') throw new Error('This exit level is no longer active.');
    const child = level.childIds.map(childId => next.orders.find(row => row.id === childId)!).find(active);
    if (child) { child.status = 'cancelled'; child.updatedAt = now; appendEvent(next, now, 'cancelled', child, 'Virtual exit pair cancelled.'); terminatePaperExitOrder(next, child, now); }
    else { level.status = 'cancelled'; level.allocation = 0; level.revision++; group.revision++; }
    reallocatePaperExits(next, group.instrument.id, now);
    return { ok: true, account: next, diagnostics: [] };
  });
}
export interface PaperPositionExitTarget { accountId: string; runId: string; instrumentId: string; instrumentKey: string; quantity: number; generation: number; fillCount: number; owners: Array<{ id: string; revision: number }>; }
export function paperPositionExitTarget(account: PaperAccount, instrumentId: string): PaperPositionExitTarget {
  const position = account.positions[instrumentId]; if (!position) throw new Error('Virtual position is unavailable.');
  return { accountId: account.id, runId: account.runId, instrumentId, instrumentKey: paperInstrumentKey(position.instrument), quantity: position.quantity, generation: account.brackets?.generations[instrumentId] ?? 0, fillCount: account.fills.length, owners: account.brackets?.groups.filter(group => group.status === 'active' && group.instrument.id === instrumentId).map(group => ({ id: group.id, revision: group.revision })) ?? [] };
}
export function attachPaperPositionExits(account: PaperAccount, target: PaperPositionExitTarget, input: PaperExitPlanInput, replacementIds: string[], now: number): PaperResult {
  return guardedPaperAction(account, () => {
    assertPaperActionTime(account, now);
    if (JSON.stringify(paperPositionExitTarget(account, target.instrumentId)) !== JSON.stringify(target) || JSON.stringify([...replacementIds].sort()) !== JSON.stringify(target.owners.map(row => row.id).sort())) throw new Error('Position or replacement groups changed. Review the current position again.');
    const position = account.positions[target.instrumentId], direction = position.quantity > 0 ? 'buy' : 'sell', plan = validatePaperExitPlan(input, position.instrument, direction);
    const next = structuredClone(account); next.clock = now; expireDueOrders(next, now); const book = ensurePaperBrackets(next);
    for (const group of book.groups) if (replacementIds.includes(group.id)) {
      for (const level of group.levels) { for (const childId of level.childIds) { const child = next.orders.find(row => row.id === childId)!; if (active(child)) { child.status = 'cancelled'; child.updatedAt = now; appendEvent(next, now, 'cancelled', child, 'Replaced by an explicitly confirmed current-position exit snapshot.'); } } if (level.status === 'active') { level.status = 'cancelled'; level.allocation = 0; level.revision++; } }
      group.status = 'cancelled'; group.revision++;
    }
    const serial = paperSerial(next), groupId = `${next.id}:exit:${serial}`, generation = book.generations[position.instrument.id];
    for (const lot of book.lots) if (lot.instrumentId === position.instrument.id && lot.generation === generation && lot.remainingQuantity > 0) lot.groupId = groupId;
    book.groups.push({ id: groupId, revision: 1, owner: 'position-snapshot', parentOrderId: null, instrument: structuredClone(position.instrument), instrumentKey: target.instrumentKey, generation, direction, mode: plan.mode, sequence: serial, createdAt: now, initialQuantity: Math.abs(position.quantity), status: 'active', extendedHours: false, sessionPolicy: { schemaVersion: 2, entryOutsideRth: false, takeProfitOutsideRth: false }, levels: plan.levels.map((level, ordinal) => ({ id: `${next.id}:level:${paperSerial(next)}`, ordinal, requestedQuantity: level.quantity, ...(level.takeProfit === undefined ? {} : { takeProfit: level.takeProfit }), ...(level.stopLoss === undefined ? {} : { stopLoss: level.stopLoss }), filledQuantity: 0, allocation: 0, status: 'active', childIds: [], activationSequence: next.quotes[position.instrument.id]?.sequence ?? -1, revision: 1 })) });
    reallocatePaperExits(next, position.instrument.id, now);
    return { ok: true, account: next, diagnostics: [] };
  });
}
function validNumber(value: unknown, minimum: number, exclusive = false): value is number { return typeof value === 'number' && Number.isFinite(value) && (exclusive ? value > minimum : value >= minimum); }
function validTime(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function safeKey(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 256 && !['__proto__', 'prototype', 'constructor'].includes(value); }
function active(order: PaperOrder): boolean { return order.status === 'working' || order.status === 'triggered'; }
export function paperFeeFor(settings: PaperSettings, quantity: number, price: number): number { return feeFor(settings, quantity, price); }
/** Market and stop (including stop-loss exit) fills receive slippage; limit-priced fills never do. */
export function paperSlippageApplies(order: Pick<PaperOrder, 'type'>): boolean { return order.type === 'market' || order.type === 'stop' || order.type === 'trailing-stop'; }
function slippageFor(settings: PaperSettings, order: Pick<PaperOrder, 'type' | 'instrument'>): Decimal { return paperSlippageApplies(order) ? dec(settings.slippageTicks ?? 0).mul(order.instrument.tickSize) : dec(0); }
function slippedPrice(settings: PaperSettings, order: Pick<PaperOrder, 'type' | 'instrument' | 'side'>, reference: number): Decimal {
  const configured = slippageFor(settings, order);
  // Sells never slip below one instrument tick (or below the reference itself when it is already under one tick), so closes and stop-loss exits still execute.
  return order.side === 'buy' ? dec(reference).add(configured) : Decimal.max(dec(reference).sub(configured), Decimal.min(reference, order.instrument.tickSize));
}
/** Estimate only: the reference price after configured slippage, using the same floor as execution. */
export function paperSlippedPrice(settings: PaperSettings, order: Pick<PaperOrder, 'type' | 'instrument' | 'side'>, reference: number): number { return numeric(slippedPrice(settings, order, reference)); }
function feeFor(settings: PaperSettings, quantity: number, price: number): number {
  const fee = settings.commission;
  return numeric(fee.kind === 'percent' ? dec(quantity).mul(price).mul(fee.value).div(100) : fee.kind === 'per-unit' ? dec(quantity).mul(fee.value) : dec(fee.value));
}
function assertSettings(settings: PaperSettings): void {
  if (!validNumber(settings.initialBalance, 0, true) || settings.initialBalance > 1e12) throw new Error('Initial virtual balance must be positive and at most 1000000000000.');
  if (!/^[A-Z]{3}$/.test(settings.currency)) throw new Error('Account currency must be a three-letter uppercase code.');
  if (!validNumber(settings.leverage, 1) || settings.leverage > 100) throw new Error('Virtual leverage must be from 1 to 100.');
  if (!['fixed', 'percent', 'per-unit'].includes(settings.commission.kind) || !validNumber(settings.commission.value, 0)) throw new Error('Commission must be a nonnegative virtual amount.');
  if (!validNumber(settings.maxQuoteAgeSeconds, 0)) throw new Error('Maximum quote age must be nonnegative.');
  if (settings.oneClick !== undefined && typeof settings.oneClick !== 'boolean') throw new Error('One-click mode must be a boolean.');
  if (settings.slippageTicks !== undefined && (!Number.isSafeInteger(settings.slippageTicks) || settings.slippageTicks < 0 || settings.slippageTicks > 10000)) throw new Error('Virtual slippage must be a whole number of ticks from 0 to 10000.');
}

export function createPaperAccount(options: Partial<PaperSettings> & { id?: string; name?: string; mode?: 'paper' | 'replay-paper'; runId?: string; now?: number } = {}): PaperAccount {
  const settings: PaperSettings = { initialBalance: options.initialBalance ?? 100000, currency: options.currency ?? 'USD', leverage: options.leverage ?? 1, commission: options.commission ?? { kind: 'fixed', value: 0 }, maxQuoteAgeSeconds: options.maxQuoteAgeSeconds ?? 60, oneClick: options.oneClick ?? false, ...(options.slippageTicks === undefined ? {} : { slippageTicks: options.slippageTicks }) };
  assertSettings(settings);
  const now = options.now ?? 0;
  if (!validTime(now)) throw new Error('Account time must be Unix seconds.');
  if (!safeKey(options.id ?? 'local-paper') || !safeKey(options.runId ?? 'ordinary') || !['paper', 'replay-paper'].includes(options.mode ?? 'paper')) throw new Error('Invalid virtual account or run identity.');
  return { schemaVersion: 1, id: options.id ?? 'local-paper', name: options.name ?? 'Paper Trading', mode: options.mode ?? 'paper', runId: options.runId ?? 'ordinary', virtual: true, createdAt: now, clock: now, settings: structuredClone(settings), cash: settings.initialBalance, realizedGross: 0, fees: 0, positions: {}, orders: [], fills: [], events: [], quotes: {}, commands: {}, nextId: 1 };
}

function appendEvent(account: PaperAccount, at: number, type: PaperEvent['type'], order: PaperOrder, message: string): void {
  account.events.push({ id: account.nextId++, at, type, orderId: order.id, message });
}
function expireDueOrders(account: PaperAccount, now: number): void {
  for (const order of account.orders) if (active(order) && order.expiresAt !== undefined && now >= order.expiresAt) {
    order.status = 'expired'; order.updatedAt = now; appendEvent(account, now, 'expired', order, 'Virtual order expired.'); terminatePaperExitOrder(account, order, now);
  }
}

function orderValidation(account: PaperAccount, request: PaperOrderRequest, now: number): string | null {
  const instrument = request.instrument;
  if (!validTime(now) || now < account.clock) return 'Action time must be Unix seconds and cannot precede the account clock.';
  if (!instrument || !safeKey(instrument.id) || typeof instrument.symbol !== 'string' || !instrument.symbol.trim() || instrument.symbol.length > 64 || typeof instrument.name !== 'string' || instrument.name.length > 500 || typeof instrument.exchange !== 'string' || instrument.exchange.length > 100 || typeof instrument.timezone !== 'string' || instrument.timezone.length > 100 || !['stock', 'etf'].includes(instrument.assetClass)) return 'A supported stock or ETF instrument with valid text metadata is required.';
  if (instrument.currency !== account.settings.currency) return 'Currency conversion is unavailable; instrument and account currencies must match.';
  if (!validNumber(instrument.tickSize, 0, true) || !validNumber(instrument.lotSize, 0, true)) return 'Instrument tick size and lot size must be positive.';
  if (dec(instrument.tickSize).decimalPlaces() > 8 || dec(instrument.lotSize).decimalPlaces() > 8) return 'Tick and lot increments beyond eight decimal places are unsupported.';
  if (!['buy', 'sell'].includes(request.side) || !['market', 'limit', 'stop', 'stop-limit', 'trailing-stop'].includes(request.type)) return 'Unsupported order side or type.';
  if (!validNumber(request.quantity, 0, true) || request.quantity > 1e9 || !dec(request.quantity).mod(instrument.lotSize).isZero()) return 'Quantity must be positive, within 1000000000 and aligned to the instrument lot size.';
  for (const field of ['limitPrice', 'stopPrice'] as const) {
    const required = field === 'limitPrice' ? ['limit', 'stop-limit'].includes(request.type) : ['stop', 'stop-limit'].includes(request.type);
    if (required && !validNumber(request[field], 0, true)) return `${field} must be positive for this order type.`;
    if (request[field] !== undefined && (!validNumber(request[field], 0, true) || !dec(request[field] as number).mod(instrument.tickSize).isZero())) return `${field} must be positive and aligned to the instrument tick size.`;
  }
  if (request.type === 'trailing-stop') {
    if (request.limitPrice !== undefined) return 'A trailing stop does not accept a limit price.';
    if (request.trailDistance !== undefined === (request.trailPercent !== undefined)) return 'A trailing stop needs exactly one of a trail distance or a trail percent.';
    if (request.trailDistance !== undefined && (!validNumber(request.trailDistance, 0, true) || !dec(request.trailDistance).mod(instrument.tickSize).isZero())) return 'Trail distance must be positive and aligned to the instrument tick size.';
    if (request.trailPercent !== undefined && (!validNumber(request.trailPercent, 0, true) || request.trailPercent >= 100)) return 'Trail percent must be above 0 and below 100.';
    if (request.exits !== undefined) return 'A trailing stop does not carry paired exits.';
  } else if (request.trailDistance !== undefined || request.trailPercent !== undefined) return 'Only a trailing stop accepts a trail distance or percent.';
  if (request.type === 'market' && (request.limitPrice !== undefined || request.stopPrice !== undefined)) return 'Market orders do not accept limit or stop prices.';
  if (request.type === 'limit' && request.stopPrice !== undefined || request.type === 'stop' && request.limitPrice !== undefined) return 'This order type contains an inapplicable trigger price.';
  if (request.timeInForce !== undefined && !['GTC', 'DAY', 'GTD'].includes(request.timeInForce)) return 'Unsupported time in force.';
  if (request.expiresAt !== undefined && (!validTime(request.expiresAt) || request.expiresAt <= now)) return 'Expiration must be a future Unix timestamp.';
  if (request.timeInForce && request.timeInForce !== 'GTC' && request.expiresAt === undefined) return 'DAY and GTD orders require an explicit expiry from a known calendar or user input.';
  const position = account.positions[instrument.id];
  if (request.reduceOnly && (!position || Math.sign(position.quantity) === (request.side === 'buy' ? 1 : -1) || request.quantity > Math.abs(position.quantity))) return 'Reduce-only quantity must close an existing opposite position without reversing it.';
  if (request.commandId !== undefined && (!safeKey(request.commandId) || request.commandId.length > 200)) return 'Command identity must contain 1 to 200 safe characters.';
  if (request.reduceOnly !== undefined && typeof request.reduceOnly !== 'boolean' || request.extendedHours !== undefined && typeof request.extendedHours !== 'boolean') return 'Order switches must be boolean values.';
  if (request.exits !== undefined) { try { validatePaperExitPlan(request.exits, instrument, request.side); } catch (error) { return String(error); } }
  if (request.sessionPolicy !== undefined) {
    try {
      const policy = validatePaperSessionPolicy(request.sessionPolicy);
      if (request.extendedHours !== policy.entryOutsideRth || policy.entryOutsideRth && request.type !== 'limit' || policy.takeProfitOutsideRth && !request.exits?.levels.some(level => level.takeProfit !== undefined)) return 'Session policy requires an eligible limit entry, an enabled take profit, and matching per-order eligibility.';
    } catch (error) { return String(error); }
  }
  if (request.ticket !== undefined) {
    try { const ticket = validatePaperTicketRecord(request.ticket); if (ticket.input.side !== request.side || ticket.input.type !== request.type || ticket.quote && ticket.quote.instrumentId !== instrument.id) return 'Ticket provenance disagrees with the order identity.';
      // A GTC ticket record belongs to a GTC order with no expiry. Older records (Day, explicit, retained) are unchanged.
      if (ticket.input.validity.kind === 'gtc' && ((request.timeInForce ?? 'GTC') !== 'GTC' || request.expiresAt !== undefined)) return 'Ticket provenance says GTC but the order has another time in force or an expiry.'; }
    catch (error) { return String(error); }
  }
  if (account.brackets && account.positions[instrument.id] && paperInstrumentKey(account.positions[instrument.id].instrument) !== paperInstrumentKey(instrument)) return 'Execution instrument metadata changed from the current position.';
  return null;
}

export function paperSummary(account: PaperAccount, now?: number): PaperSummary {
  let unrealized = dec(0), margin = dec(0), reserved = dec(0);
  const missingMarks: string[] = [], missingOrderPrices: string[] = [], staleMarks: string[] = [];
  for (const position of Object.values(account.positions)) {
    const quote = account.quotes[position.instrument.id];
    if (!quote) { missingMarks.push(position.instrument.id); continue; }
    if (now !== undefined && now - quote.availableAt > account.settings.maxQuoteAgeSeconds) staleMarks.push(position.instrument.id);
    const mark = position.quantity > 0 ? quote.bid : quote.ask;
    unrealized = unrealized.add(dec(mark).sub(position.averagePrice).mul(position.quantity));
    margin = margin.add(dec(mark).mul(Math.abs(position.quantity)).div(account.settings.leverage));
  }
  const pairFees = new Map<string, Decimal>();
  for (const order of account.orders.filter(active)) {
    const quote = account.quotes[order.instrument.id];
    const rawReference = order.limitPrice ?? order.stopPrice ?? (quote ? order.side === 'buy' ? quote.ask : quote.bid : undefined);
    const referencePrice = rawReference === undefined || order.side === 'sell' ? rawReference : numeric(dec(rawReference).add(slippageFor(account.settings, order)));
    if (referencePrice === undefined) { if (!missingOrderPrices.includes(order.instrument.id)) missingOrderPrices.push(order.instrument.id); continue; }
    const existing = account.positions[order.instrument.id]?.quantity ?? 0, delta = order.side === 'buy' ? order.quantity : -order.quantity;
    const opening = order.reduceOnly ? 0 : Math.max(0, Math.abs(existing + delta) - Math.abs(existing));
    const fee = feeFor(account.settings, order.quantity, referencePrice);
    if (order.bracket) { const key = order.bracket.groupId + ':' + order.bracket.levelId; pairFees.set(key, Decimal.max(pairFees.get(key) ?? 0, fee)); }
    else reserved = reserved.add(dec(opening).mul(referencePrice).div(account.settings.leverage)).add(fee);
  }
  for (const fee of pairFees.values()) reserved = reserved.add(fee);
  const balance = dec(account.settings.initialBalance).add(account.realizedGross).sub(account.fees), equity = balance.add(unrealized);
  const complete = missingMarks.length === 0;
  const reserveKnown = missingOrderPrices.length === 0;
  return { cash: account.cash, balance: numeric(balance), equity: complete ? numeric(equity) : null, unrealized: complete ? numeric(unrealized) : null, realizedGross: account.realizedGross, netRealized: numeric(dec(account.realizedGross).sub(account.fees)), fees: account.fees, marginUsed: complete ? numeric(margin) : null, reservedMargin: reserveKnown ? numeric(reserved) : null, buyingPower: complete && reserveKnown ? numeric(Decimal.max(0, equity.sub(margin).sub(reserved)).mul(account.settings.leverage)) : null, missingMarks, missingOrderPrices, staleMarks, virtual: true };
}

export interface PaperMarginBuffer { value: number | null; text: string; reason: string | null; }
/** (Equity - account margin) / equity * 100, two decimals. Not a reference formula. */
export function paperMarginBuffer(summary: Pick<PaperSummary, 'equity' | 'marginUsed'>): PaperMarginBuffer {
  if (summary.equity === null) return { value: null, text: 'n/a', reason: 'Equity needs a quote for every open position' };
  if (summary.equity <= 0) return { value: null, text: 'n/a', reason: 'Equity is zero or negative' };
  if (summary.marginUsed === null) return { value: null, text: 'n/a', reason: 'Margin needs a quote for every open position' };
  const value = dec(summary.equity).sub(summary.marginUsed).div(summary.equity).mul(100).toDecimalPlaces(2);
  return { value: value.toNumber(), text: value.toFixed(2), reason: null };
}

/**
 * Available funds = max(0, equity - account margin - orders margin), not multiplied by leverage. Null when equity,
 * account margin or order margin is unknown. Buying power is this figure times leverage; the two are equal only at leverage 1. Not a reference formula.
 */
export function paperAvailableFunds(summary: Pick<PaperSummary, 'equity' | 'marginUsed' | 'reservedMargin'>): number | null {
  if (summary.equity === null || summary.marginUsed === null || summary.reservedMargin === null) return null;
  return numeric(Decimal.max(0, dec(summary.equity).sub(summary.marginUsed).sub(summary.reservedMargin)));
}

/** The trailing stop level for a best price: the distance (or percent of the best price) behind it, on the tick grid, never below one tick. */
function trailStopPrice(order: Pick<PaperOrder, 'side' | 'trailDistance' | 'trailPercent' | 'instrument'>, best: number): number {
  const tick = order.instrument.tickSize, distance = order.trailDistance !== undefined ? dec(order.trailDistance) : dec(best).mul(order.trailPercent ?? 0).div(100);
  const raw = order.side === 'sell' ? dec(best).sub(distance) : dec(best).add(distance);
  const snapped = raw.div(tick).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).mul(tick);
  return numeric(Decimal.max(snapped, tick));
}

function quoteUsable(account: PaperAccount, order: PaperOrder, quote: Quote, now: number): boolean {
  const policy = order.sessionPolicy ?? (order.bracket ? account.brackets?.groups.find(group => group.id === order.bracket!.groupId)?.sessionPolicy : undefined);
  // A last-imported-bar quote from a source that declares no session fills regular-session-only orders, as the synthetic fixture does.
  // An order that opts into extended-hours entry or take profit needs a declared session, so it keeps waiting. Other quotes gate as before.
  const imported = isLastImportedQuote(quote);
  const importedUnknown = imported && quote.session === 'unknown' && !(policy?.entryOutsideRth || policy?.takeProfitOutsideRth || order.extendedHours);
  const sessionAllowed = quote.session === 'regular' || Boolean(order.extendedHours && quote.session === 'extended') || Boolean(quote.fixture && quote.session === 'unknown') || importedUnknown || quote.session === 'all' && !policy;
  // The imported price is rebuilt per user action: a copy retained from an earlier action never executes a later one.
  const currentAction = !imported || quote.availableAt >= now;
  return paperBracketQuoteReady(account, order, quote) && quote.availableAt <= now && currentAction && now - quote.availableAt <= account.settings.maxQuoteAgeSeconds && sessionAllowed;
}

function executeFill(account: PaperAccount, order: PaperOrder, quote: Quote, now: number, touchPrice?: number): void {
  const basis: PaperFillBasis = touchPrice !== undefined ? 'order-level' : isLastImportedQuote(quote) ? 'last' : order.side === 'buy' ? 'ask' : 'bid';
  const quotePrice = touchPrice ?? (order.side === 'buy' ? quote.ask : quote.bid), priced = slippedPrice(account.settings, order, quotePrice);
  const slippage = priced.sub(quotePrice).abs(), price = numeric(priced);
  const previous = account.positions[order.instrument.id], oldQuantity = previous?.quantity ?? 0, oldAverage = previous?.averagePrice ?? 0;
  const signedQuantity = order.side === 'buy' ? order.quantity : -order.quantity;
  if (order.reduceOnly && (!previous || Math.sign(oldQuantity) === Math.sign(signedQuantity) || order.quantity > Math.abs(oldQuantity))) {
    order.status = 'rejected'; order.updatedAt = now; order.rejectionReason = 'Position changed; reduce-only order would increase or reverse exposure.';
    appendEvent(account, now, 'rejected', order, order.rejectionReason); terminatePaperExitOrder(account, order, now); return;
  }
  const closingQuantity = oldQuantity && Math.sign(oldQuantity) !== Math.sign(signedQuantity) ? Math.min(Math.abs(oldQuantity), order.quantity) : 0;
  const realized = numeric(dec(price).sub(oldAverage).mul(closingQuantity).mul(Math.sign(oldQuantity)));
  const quantity = numeric(dec(oldQuantity).add(signedQuantity));
  const average = quantity === 0 ? 0 : oldQuantity === 0 || Math.sign(oldQuantity) !== Math.sign(quantity) ? price : Math.sign(oldQuantity) === Math.sign(signedQuantity) ? numeric(dec(oldAverage).mul(Math.abs(oldQuantity)).add(dec(price).mul(order.quantity)).div(Math.abs(quantity))) : oldAverage;
  const commission = feeFor(account.settings, order.quantity, price);
  const candidate = structuredClone(account);
  candidate.cash = numeric(dec(account.cash).sub(dec(signedQuantity).mul(price)).sub(commission));
  candidate.realizedGross = numeric(dec(account.realizedGross).add(realized)); candidate.fees = numeric(dec(account.fees).add(commission));
  if (quantity === 0) delete candidate.positions[order.instrument.id];
  else candidate.positions[order.instrument.id] = { instrument: { ...order.instrument }, quantity, averagePrice: average, realizedGross: numeric(dec(previous?.realizedGross ?? 0).add(realized)) };
  const candidateOrder = candidate.orders.find(o => o.id === order.id)!;
  candidateOrder.status = 'filled'; candidateOrder.updatedAt = now; candidateOrder.filledQuantity = candidateOrder.quantity; candidateOrder.averageFillPrice = price;
  const fill: PaperFill = { id: `${account.id}:fill:${paperSerial(candidate)}`, orderId: order.id, instrumentId: order.instrument.id, side: order.side, quantity: order.quantity, price, commission, realizedGross: realized, at: now, quoteEventTime: quote.eventTime, quoteSequence: quote.sequence, fixture: quote.fixture, basis, ...(slippage.isZero() ? {} : { quotePrice, slippage: numeric(slippage) }), ...(touchPrice === undefined ? {} : { intrabar: true as const }) };
  candidate.fills.push(fill); appendEvent(candidate, now, 'filled', candidateOrder, `${order.quantity} ${order.instrument.symbol} at ${price}${slippage.isZero() ? '' : ` (quote ${quotePrice}, virtual slippage ${numeric(slippage)})`}; virtual fee ${commission}.`);
  applyPaperBracketFill(candidate, candidateOrder, oldQuantity, fill, now);
  const summary = paperSummary(candidate, now);
  const reducing = Math.abs(quantity) < Math.abs(oldQuantity) && (quantity === 0 || Math.sign(quantity) === Math.sign(oldQuantity));
  if (!reducing && (summary.equity === null || summary.marginUsed === null || summary.reservedMargin === null || dec(summary.marginUsed).add(summary.reservedMargin).gt(summary.equity))) {
    order.status = 'rejected'; order.updatedAt = now; order.rejectionReason = 'Insufficient virtual buying power at the executable quote.';
    appendEvent(account, now, 'rejected', order, order.rejectionReason); terminatePaperExitOrder(account, order, now); return;
  }
  Object.assign(account, candidate);
}

/**
 * touchFrom is the previous point of the same bar path (processPaperBar only). The executable side moved continuously from that point to this
 * quote, so an order level strictly inside or at the ends of that segment was traded through and fills at its own price. A level outside the
 * segment (the order only became eligible here) keeps the ordinary quote-side fill.
 */
function evaluateOrder(account: PaperAccount, order: PaperOrder, now: number, touchFrom?: Quote): void {
  if (!active(order)) return;
  if (order.expiresAt !== undefined && now >= order.expiresAt) { order.status = 'expired'; order.updatedAt = now; appendEvent(account, now, 'expired', order, 'Virtual order expired.'); return; }
  const quote = account.quotes[order.instrument.id];
  if (!quote || !quoteUsable(account, order, quote, now)) return;
  const price = order.side === 'buy' ? quote.ask : quote.bid, from = touchFrom ? order.side === 'buy' ? touchFrom.ask : touchFrom.bid : undefined;
  const inside = (level: number | undefined) => from !== undefined && level !== undefined && level >= Math.min(from, price) && level <= Math.max(from, price);
  let triggeredHere = false;
  if (order.type === 'trailing-stop' && order.status !== 'triggered') {
    const best = order.trailBest;
    if (best === undefined || order.stopPrice === undefined) { order.trailBest = price; order.stopPrice = trailStopPrice(order, price); return; }
    if (!(order.side === 'buy' ? price >= order.stopPrice : price <= order.stopPrice)) {
      if (order.side === 'buy' ? price < best : price > best) { order.trailBest = price; order.stopPrice = trailStopPrice(order, price); }
      return;
    }
    order.status = 'triggered'; order.updatedAt = now; triggeredHere = true; appendEvent(account, now, 'triggered', order, 'Trailing stop activated by executable quote side.');
  }
  if ((order.type === 'stop' || order.type === 'stop-limit') && order.status !== 'triggered') {
    if (!(order.side === 'buy' ? price >= order.stopPrice! : price <= order.stopPrice!)) return;
    order.status = 'triggered'; order.updatedAt = now; triggeredHere = true; appendEvent(account, now, 'triggered', order, touchFrom ? 'Stop activated inside a bar segment (intrabar touch).' : 'Stop activated by executable quote side.');
  }
  const stopMarketable = order.type === 'stop-limit' && (order.side === 'buy' ? order.stopPrice! <= order.limitPrice! : order.stopPrice! >= order.limitPrice!);
  if (touchFrom && order.type === 'stop-limit' && triggeredHere && stopMarketable && inside(order.stopPrice)) { executeFill(account, order, quote, now, order.stopPrice); return; }
  if ((order.type === 'limit' || order.type === 'stop-limit') && !(order.side === 'buy' ? price <= order.limitPrice! : price >= order.limitPrice!)) return;
  // A trailing stop triggered inside a bar segment fills at the stop in force when the segment began, like a plain stop; a gap
  // through it (no segment, or the level outside the segment) keeps the ordinary quote-side fill.
  const touch = order.type === 'stop' || order.type === 'trailing-stop' ? (inside(order.stopPrice) ? order.stopPrice : undefined) : order.type === 'limit' || order.type === 'stop-limit' ? (inside(order.limitPrice) ? order.limitPrice : undefined) : undefined;
  executeFill(account, order, quote, now, touch);
}

/** All mutations return a fresh serializable state; failed validation preserves the old state. */
function submitPaperOrderInternal(account: PaperAccount, request: PaperOrderRequest, now: number): PaperResult {
  const validation = orderValidation(account, request, now);
  if (validation) return fail(account, 'INVALID_ORDER', validation);
  if (request.ticket && request.ticket.submittedAt !== now) return fail(account, 'STALE_TICKET_TIME', 'Ticket must be materialized at this submission time.');
  const signature = JSON.stringify({ ...request, commandId: undefined });
  if (request.commandId && account.commands[request.commandId]) {
    const command = account.commands[request.commandId];
    return command.signature === signature ? { ok: true, account, diagnostics: [], orderId: command.orderId } : fail(account, 'COMMAND_CONFLICT', 'Command identity was already used for different order contents.');
  }
  if (account.orders.length >= 100000) return fail(account, 'HISTORY_LIMIT', 'This local account reached 100000 orders. Export its history and start a separate virtual account.');
  const next = structuredClone(account); next.clock = now; expireDueOrders(next, now);
  const serial = paperSerial(next);
  let order: PaperOrder = { ...structuredClone(request), timeInForce: request.timeInForce ?? 'GTC', id: `${account.id}:order:${serial}`, submissionSequence: serial, status: 'working', createdAt: now, updatedAt: now, filledQuantity: 0, averageFillPrice: null };
  next.orders.push(order);
  registerPaperExitPlan(next, order);
  if (request.commandId) next.commands[request.commandId] = { orderId: order.id, signature };
  appendEvent(next, now, 'submitted', order, 'Virtual order submitted.');
  evaluateOrder(next, order, now);
  order = next.orders.find(item => item.id === order.id)!;
  if (active(order)) {
    const summary = paperSummary(next, now);
    if (summary.equity !== null && summary.marginUsed !== null && summary.reservedMargin !== null && dec(summary.marginUsed).add(summary.reservedMargin).gt(summary.equity)) {
      order.status = 'rejected'; order.updatedAt = now; order.rejectionReason = 'Insufficient virtual buying power to reserve this working order.';
      appendEvent(next, now, 'rejected', order, order.rejectionReason);
      terminatePaperExitOrder(next, order, now);
    }
  }
  return { ok: true, account: next, diagnostics: order.status === 'rejected' ? [{ code: 'ORDER_REJECTED', message: order.rejectionReason!, severity: 'warning' }] : [], orderId: order.id };
}

function paperQuoteInputFailure(account: PaperAccount, quote: Quote, now: number, runId: string): PaperResult | null {
  if (runId !== account.runId) return fail(account, 'RUN_MISMATCH', 'Quote belongs to a different ordinary or replay run.');
  if (!safeKey(quote.instrumentId) || !validNumber(quote.bid, 0, true) || !validNumber(quote.ask, 0, true) || quote.bid > quote.ask || !validTime(now) || now < account.clock || !validTime(quote.eventTime) || !validTime(quote.availableAt) || !validTime(quote.receivedAt) || !Number.isSafeInteger(quote.sequence) || quote.sequence < 0 || typeof quote.fixture !== 'boolean' || !['regular', 'extended', 'all', 'unknown'].includes(quote.session)) return fail(account, 'INVALID_QUOTE', 'Quote needs positive ordered bid/ask, valid nondecreasing timestamps and a nonnegative event sequence.');
  if ((quote as { basis?: unknown }).basis !== undefined && (!isLastImportedQuote(quote) || quote.fixture)) return fail(account, 'INVALID_QUOTE', 'Quote basis must be the last imported bar of a non-synthetic source.');
  if (quote.eventTime > quote.availableAt || quote.receivedAt > quote.availableAt || quote.availableAt > now) return fail(account, 'FUTURE_QUOTE', 'Quote information was not yet available at this simulation time.');
  return null;
}
function processPaperQuoteInternal(account: PaperAccount, quote: Quote, now: number, runId = account.runId, executionInstrument?: Instrument, touchFrom?: Quote): PaperResult {
  const invalid = paperQuoteInputFailure(account, quote, now, runId); if (invalid) return invalid;
  const previous = account.quotes[quote.instrumentId];
  if (previous && quote.sequence <= previous.sequence) return fail(account, 'OUT_OF_ORDER_QUOTE', 'Quote event sequence is duplicate or older than the accepted event.');
  if (previous && quote.availableAt < previous.availableAt) return fail(account, 'OUT_OF_ORDER_QUOTE', 'Quote availability time moved backward.');
  const next = structuredClone(account); next.clock = now; expireDueOrders(next, now);
  admitPaperQuoteMetadata(next, quote, executionInstrument);
  next.quotes[quote.instrumentId] = structuredClone(quote);
  const queue = next.orders.filter(order => active(order) && order.instrument.id === quote.instrumentId).sort((a, b) => (a.submissionSequence ?? Number(a.id.split(':').at(-1))) - (b.submissionSequence ?? Number(b.id.split(':').at(-1))) || a.id.localeCompare(b.id)).map(order => order.id);
  assertPaperBracketBudget(next, queue.length);
  for (const orderId of queue) { const order = next.orders.find(item => item.id === orderId)!; evaluateOrder(next, order, now, touchFrom); }
  return { ok: true, account: next, diagnostics: [] };
}

function advancePaperClockInternal(account: PaperAccount, now: number): PaperResult {
  if (!validTime(now) || now < account.clock) return fail(account, 'INVALID_TIME', 'Action time must be Unix seconds and cannot precede the account clock.');
  const next = structuredClone(account); next.clock = now; expireDueOrders(next, now);
  for (const order of next.orders) if (active(order) && order.expiresAt !== undefined && now >= order.expiresAt) evaluateOrder(next, order, now);
  return { ok: true, account: next, diagnostics: [] };
}

function cancelPaperOrderInternal(account: PaperAccount, orderId: string, now: number): PaperResult {
  const original = account.orders.find(o => o.id === orderId);
  if (!original || !active(original)) return fail(account, 'ORDER_NOT_WORKING', 'Only a working or triggered order can be cancelled.');
  if (!validTime(now) || now < account.clock) return fail(account, 'INVALID_TIME', 'Cancellation time cannot precede the account clock.');
  const next = structuredClone(account), order = next.orders.find(o => o.id === orderId)!;
  next.clock = now; expireDueOrders(next, now);
  if (order.status === 'expired') return fail(next, 'ORDER_EXPIRED', 'The virtual order expired before cancellation.');
  order.status = 'cancelled'; order.updatedAt = now; appendEvent(next, now, 'cancelled', order, 'Virtual order cancelled.');
  terminatePaperExitOrder(next, order, now); reallocatePaperExits(next, order.instrument.id, now);
  return { ok: true, account: next, diagnostics: [], orderId };
}

function modifyPaperOrderInternal(account: PaperAccount, orderId: string, changes: Partial<Pick<PaperOrderRequest, 'quantity' | 'limitPrice' | 'stopPrice' | 'expiresAt' | 'extendedHours' | 'ticket' | 'trailDistance' | 'trailPercent'>>, now: number): PaperResult {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).some(key => !['quantity', 'limitPrice', 'stopPrice', 'expiresAt', 'extendedHours', 'ticket', 'trailDistance', 'trailPercent'].includes(key))) return fail(account, 'INVALID_MODIFICATION', 'Modification contains an unsupported field.');
  if (changes.ticket && changes.ticket.submittedAt !== now) return fail(account, 'STALE_TICKET_TIME', 'Ticket must be materialized at this modification time.');
  const original = account.orders.find(o => o.id === orderId);
  if (!original || !active(original)) return fail(account, 'ORDER_NOT_WORKING', 'Only a working or triggered order can be modified.');
  if (original.bracket) return fail(account, 'PAIRED_EXIT_EDIT', 'Edit the paired exit level so quantity and OCO ownership remain consistent.');
  if (now < original.updatedAt) return fail(account, 'INVALID_TIME', 'Modification time cannot precede the order state.');
  if (validTime(now) && now >= account.clock && original.expiresAt !== undefined && now >= original.expiresAt) {
    const expired = structuredClone(account); expired.clock = now; expireDueOrders(expired, now);
    return fail(expired, 'ORDER_EXPIRED', 'The virtual order expired before modification.');
  }
  if (original.type === 'trailing-stop' && changes.stopPrice !== undefined) return fail(account, 'TRAIL_STOP_COMPUTED', 'A trailing stop price follows the market. Change the trail distance or percent instead.');
  const proposed = { ...original, ...changes };
  if (original.type === 'trailing-stop') { if (changes.trailPercent !== undefined && changes.trailDistance === undefined) delete proposed.trailDistance; if (changes.trailDistance !== undefined && changes.trailPercent === undefined) delete proposed.trailPercent; }
  if (original.sessionPolicy && changes.extendedHours !== undefined) proposed.sessionPolicy = { ...original.sessionPolicy, entryOutsideRth: changes.extendedHours };
  const validation = orderValidation(account, proposed, now);
  if (validation) return fail(account, 'INVALID_ORDER', validation);
  if (original.status === 'triggered' && changes.stopPrice !== undefined && changes.stopPrice !== original.stopPrice) return fail(account, 'ALREADY_TRIGGERED', 'A triggered stop-limit cannot be rearmed by changing its stop price. Cancel and replace it.');
  const next = structuredClone(account), order = next.orders.find(o => o.id === orderId)!;
  next.clock = now; expireDueOrders(next, now);
  for (const key of Object.keys(changes) as Array<keyof typeof changes>) {
    const value = changes[key];
    if (value === undefined) delete order[key];
    else Object.assign(order, { [key]: value });
  }
  if (proposed.sessionPolicy) order.sessionPolicy = structuredClone(proposed.sessionPolicy);
  if (order.type === 'trailing-stop') { if (proposed.trailDistance === undefined) delete order.trailDistance; if (proposed.trailPercent === undefined) delete order.trailPercent; if (order.trailBest !== undefined) order.stopPrice = trailStopPrice(order, order.trailBest); }
  order.updatedAt = now; appendEvent(next, now, 'modified', order, 'Virtual order parameters modified.');
  revisePaperOrder(next, order);
  const summary = paperSummary(next, now);
  if (summary.equity !== null && summary.marginUsed !== null && summary.reservedMargin !== null && dec(summary.marginUsed).add(summary.reservedMargin).gt(summary.equity)) return fail(account, 'INSUFFICIENT_BUYING_POWER', 'Modification exceeds available virtual buying power.');
  evaluateOrder(next, order, now);
  return { ok: true, account: next, diagnostics: [], orderId };
}

export function closePaperPosition(account: PaperAccount, instrumentId: string, now: number, quantity?: number): PaperResult {
  const position = account.positions[instrumentId];
  if (!position) return fail(account, 'POSITION_MISSING', 'No virtual position exists for this instrument.');
  return submitPaperOrder(account, { instrument: position.instrument, side: position.quantity > 0 ? 'sell' : 'buy', type: 'market', quantity: quantity ?? Math.abs(position.quantity), reduceOnly: true }, now);
}

export interface PaperCancelScope { instrumentId: string; side?: PaperSide; }
/** Current-instrument scope only (documented DOM scope); exit-pair children are excluded and managed per level. One atomic state transition. */
export function paperCancelCandidates(account: PaperAccount, scope: PaperCancelScope): PaperOrder[] {
  return account.orders.filter(order => active(order) && !order.bracket && order.instrument.id === scope.instrumentId && (scope.side === undefined || order.side === scope.side));
}
export function cancelPaperOrders(account: PaperAccount, scope: PaperCancelScope, now: number): PaperResult {
  return guardedPaperAction(account, () => {
    if (!scope || !safeKey(scope.instrumentId) || scope.side !== undefined && !['buy', 'sell'].includes(scope.side)) return fail(account, 'INVALID_CANCEL_SCOPE', 'Choose an instrument and optional side to cancel.');
    if (!validTime(now) || now < account.clock) return fail(account, 'INVALID_TIME', 'Cancellation time cannot precede the account clock.');
    const next = structuredClone(account); next.clock = now; expireDueOrders(next, now);
    const targets = paperCancelCandidates(next, scope);
    if (!targets.length) return fail(account, 'NO_MATCHING_ORDERS', 'No working virtual orders match this cancellation scope.');
    for (const order of targets) { order.status = 'cancelled'; order.updatedAt = now; appendEvent(next, now, 'cancelled', order, 'Virtual order cancelled by a scoped cancel request.'); terminatePaperExitOrder(next, order, now); }
    reallocatePaperExits(next, scope.instrumentId, now);
    return { ok: true, account: next, diagnostics: [] };
  }, 0);
}
/** LV reverse policy: one market order for twice the absolute position in the opposite direction. It fills on the current quote or is refused with the account unchanged (no working or rejected row); reference atomicity is unresolved. */
export function reversePaperPosition(account: PaperAccount, instrumentId: string, now: number): PaperResult {
  const position = account.positions[instrumentId];
  if (!position) return fail(account, 'POSITION_MISSING', 'No virtual position exists for this instrument.');
  const quantity = numeric(dec(position.quantity).abs().mul(2));
  if (quantity > 1e9) return fail(account, 'INVALID_ORDER', 'Reversal quantity exceeds 1000000000 units.');
  const result = submitPaperOrder(account, { instrument: position.instrument, side: position.quantity > 0 ? 'sell' : 'buy', type: 'market', quantity }, now);
  const order = result.ok ? result.account.orders.find(row => row.id === result.orderId) : undefined;
  if (order && order.status === 'rejected') return fail(account, 'REVERSE_REJECTED', `${order.rejectionReason ?? 'Reverse was rejected.'} No virtual order was created; the position is unchanged.`);
  if (order && order.status !== 'filled') return fail(account, 'REVERSE_NEEDS_QUOTE', 'Reverse needs a current usable quote and fills immediately or not at all. No virtual order was created.');
  return result;
}

export type PaperBarPathPolicy = 'close-only' | 'open-proximity';
export interface PaperBarPathOptions { instrumentId: string; bar: { time: number; open: number; high: number; low: number; close: number }; firstSequence: number; halfSpread: number; policy: PaperBarPathPolicy; fixture: boolean; session: Quote['session']; availableAt: number; fixtureCents?: boolean; /** Tags every point as a last-imported-bar quote (non-synthetic sources only). */ basis?: 'last-imported-bar'; }
/**
 * Explicit bar-to-quote path for replay or fixture simulation. Bars carry no tick order, so every intrabar sequence is an assumption:
 * close-only emits the close; open-proximity emits open, then the extreme nearer the open (high on a tie), then the other extreme, then close.
 * The point order is a common broker-emulator assumption. These raw quotes are
 * discrete jumps: fed one by one through processPaperQuote, orders crossed inside the bar fill at the bar extremes (optimistic take profits,
 * pessimistic stop losses). Use processPaperBar for order-price intrabar fills. Consecutive equal prices collapse so no extra event is invented.
 * All points share the caller-declared availability time (for example the bar close time, never an open-time stamp that would look ahead).
 * fixtureCents reproduces fixtureQuote rounding per point (bid and ask rounded to cents, bid floored at 0.01, ask never below bid) and never
 * rejects a low price; without it, prices are exact and a nonpositive bid throws.
 */
export function paperBarQuotePath(options: PaperBarPathOptions): Quote[] {
  const { bar, halfSpread, firstSequence } = options, at = options.availableAt;
  if (![bar.open, bar.high, bar.low, bar.close].every(value => Number.isFinite(value) && value > 0) || bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) throw new Error('Bar prices must be positive with low and high bounding open and close.');
  if (!validTime(bar.time) || !validTime(at) || at < bar.time || !Number.isSafeInteger(firstSequence) || firstSequence < 0 || !validNumber(halfSpread, 0) || !['close-only', 'open-proximity'].includes(options.policy) || !safeKey(options.instrumentId)) throw new Error('Invalid quote path timing, sequence, spread or policy.');
  const points = options.policy === 'close-only' ? [bar.close] : dec(bar.high).sub(bar.open).lte(dec(bar.open).sub(bar.low)) ? [bar.open, bar.high, bar.low, bar.close] : [bar.open, bar.low, bar.high, bar.close];
  const path = points.filter((value, index) => index === 0 || value !== points[index - 1]);
  return path.map((mid, index) => {
    const bid = options.fixtureCents ? Math.max(0.01, Math.round((mid - halfSpread) * 100) / 100) : numeric(dec(mid).sub(halfSpread));
    const ask = options.fixtureCents ? Math.max(bid, Math.round((mid + halfSpread) * 100) / 100) : numeric(dec(mid).add(halfSpread));
    if (!(bid > 0)) throw new Error('Half spread leaves a nonpositive bid; no quote is synthesized.');
    return { instrumentId: options.instrumentId, bid, ask, eventTime: bar.time, receivedAt: at, availableAt: at, sequence: firstSequence + index, session: options.session, fixture: options.fixture, ...(options.basis ? { basis: options.basis } : {}) };
  });
}
/** Render-safe variant: an invalid bar or spread yields null (quote unavailable) instead of throwing. */
export function paperBarQuotePathOrNull(options: PaperBarPathOptions): Quote[] | null { try { return paperBarQuotePath(options); } catch { return null; } }
/**
 * Applies one bar as an ordered quote path in a single atomic transition. The first point (the open, or the close under close-only) is a gap
 * point with ordinary quote-side fills; later points are intrabar touches (see evaluateOrder). Points at or below the account's accepted
 * sequence are skipped only when the last skipped point exactly matches the retained accepted quote. That accepted quote supplies the
 * resume boundary; an unaccepted correction never does. Older paths without that boundary are refused. Repeating the same completed path
 * is idempotent and returns the same account object. Prior skipped points are not re-executed or claimed to be re-verified.
 * Any failure returns the original account.
 */
export function processPaperBar(account: PaperAccount, options: PaperBarPathOptions & { now: number; executionInstrument?: Instrument }, runId = account.runId): PaperResult {
  return guardedPaperAction(account, () => {
    const path = paperBarQuotePath(options); let current = account, previous: Quote | undefined;
    // Validate even a fully repeated path: skipping events must not bypass run, clock or provenance checks.
    for (const quote of path) { const invalid = paperQuoteInputFailure(account, quote, options.now, runId); if (invalid) return invalid; }
    const accepted = account.quotes[options.instrumentId];
    let offset = 0;
    if (accepted) {
      while (offset < path.length && path[offset].sequence <= accepted.sequence) offset++;
      if (offset) {
        const boundary = path[offset - 1];
        if (boundary.sequence !== accepted.sequence) return fail(account, 'OUT_OF_ORDER_QUOTE', 'This bar path is older than the retained quote. Its replay boundary cannot be verified.');
        const fields: readonly (keyof Quote)[] = ['instrumentId', 'bid', 'ask', 'bidSize', 'askSize', 'eventTime', 'receivedAt', 'availableAt', 'sequence', 'session', 'fixture'];
        if (fields.some(field => boundary[field] !== accepted[field])) return fail(account, 'BAR_PATH_CONFLICT', 'The repeated bar point differs from the accepted quote. A correction cannot replace the execution boundary.');
        previous = accepted;
      }
    }
    for (const quote of path.slice(offset)) {
      const result = processPaperQuoteInternal(current, quote, options.now, runId, options.executionInstrument, previous);
      if (!result.ok) return { ...result, account };
      current = result.account; previous = quote;
    }
    return { ok: true, account: current, diagnostics: [] };
  }, 0);
}

/**
 * Applies quotes observed one after another on a continuous feed (a forming live bar, or the close of the bar the feed last saw).
 * The price moved continuously from the retained quote to each point, so a working order level inside that segment fills at its own price,
 * exactly as an intrabar touch in processPaperBar. Atomic: any failure returns the original account.
 */
export function processPaperTouchPath(account: PaperAccount, quotes: readonly Quote[], now: number, runId = account.runId, executionInstrument?: Instrument): PaperResult {
  return guardedPaperAction(account, () => {
    let current = account;
    for (const quote of quotes) {
      const previous = current.quotes[quote.instrumentId];
      const result = processPaperQuoteInternal(current, quote, now, runId, executionInstrument, previous && previous.eventTime === quote.eventTime ? previous : undefined);
      if (!result.ok) return { ...result, account };
      current = result.account;
    }
    return { ok: true, account: current, diagnostics: [] };
  }, 0);
}

export function resetPaperAccount(account: PaperAccount, changes: Partial<PaperSettings> = {}, now = 0): PaperAccount {
  const generation = `${account.mode}:reset:${crypto.randomUUID()}`;
  const next = createPaperAccount({ ...account.settings, ...changes, id: account.mode === 'replay-paper' ? generation : account.id, name: account.name, mode: account.mode, runId: account.mode === 'replay-paper' ? account.runId : generation, now });
  const cleared = `${account.orders.length} order${account.orders.length === 1 ? '' : 's'} and ${account.fills.length} fill${account.fills.length === 1 ? '' : 's'}`;
  next.journal = appendAccountEntry(account.journal, { at: next.createdAt, type: 'reset', message: `Virtual account reset. Starting balance ${next.settings.initialBalance} ${next.settings.currency}; ${cleared} from the previous history were cleared.`, balance: next.settings.initialBalance });
  return next;
}
function appendAccountEntry(journal: PaperAccountEntry[] | undefined, entry: Omit<PaperAccountEntry, 'id'>): PaperAccountEntry[] {
  const rows = (journal ?? []).map(row => structuredClone(row)), id = rows.reduce((highest, row) => Math.max(highest, row.id), 0) + 1;
  rows.push({ id, ...entry });
  return rows.slice(-PAPER_ACCOUNT_JOURNAL_LIMIT);
}
const commissionText = (fee: PaperCommission) => fee.kind === 'percent' ? `${fee.value}% of notional` : fee.kind === 'per-unit' ? `${fee.value} per unit` : `${fee.value} per filled order`;
function settingsChangeText(before: PaperSettings, after: PaperSettings): string[] {
  const parts: string[] = [];
  if (before.commission.kind !== after.commission.kind || before.commission.value !== after.commission.value) parts.push(`commission ${commissionText(after.commission)}`);
  if (before.leverage !== after.leverage) parts.push(`leverage ${after.leverage}x`);
  if ((before.slippageTicks ?? 0) !== (after.slippageTicks ?? 0)) parts.push(`slippage ${after.slippageTicks ?? 0} tick(s)`);
  if (before.maxQuoteAgeSeconds !== after.maxQuoteAgeSeconds) parts.push(`maximum quote age ${after.maxQuoteAgeSeconds} seconds`);
  if ((before.oneClick ?? false) !== (after.oneClick ?? false)) parts.push(`one-click actions ${after.oneClick ? 'on' : 'off'}`);
  return parts;
}

export function configurePaperAccount(account: PaperAccount, changes: Partial<Pick<PaperSettings, 'commission' | 'leverage' | 'maxQuoteAgeSeconds' | 'oneClick' | 'slippageTicks'>>, now: number): PaperResult {
  return guardedPaperAction(account, () => {
    assertPaperPlainData(changes, 100);
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).some(key => !['commission', 'leverage', 'maxQuoteAgeSeconds', 'oneClick', 'slippageTicks'].includes(key))) return fail(account, 'INVALID_SETTINGS', 'Unsupported account setting. Initial balance changes require a reset.');
    if (!validTime(now) || now < account.clock) return fail(account, 'INVALID_TIME', 'Settings time cannot precede the account clock.');
    const settings = { ...account.settings, ...structuredClone(changes) };
    try { assertSettings(settings); } catch (error) { return fail(account, 'INVALID_SETTINGS', error instanceof Error ? error.message : String(error)); }
    const next = structuredClone(account); next.clock = now; next.settings = settings; expireDueOrders(next, now);
    const changed = settingsChangeText(account.settings, settings);
    if (changed.length) next.journal = appendAccountEntry(account.journal, { at: now, type: 'settings', message: `Settings changed: ${changed.join('; ')}. Existing fills are unchanged.` });
    return { ok: true, account: next, diagnostics: [] };
  });
}

export interface PaperValidation { ok: boolean; account?: PaperAccount; errors: string[]; }
/** Local JSON is untrusted. Financial totals must agree with the immutable fill history. */
export function validatePaperAccount(input: unknown): PaperValidation {
  const errors: string[] = [];
  try {
    assertPaperPlainData(input);
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 20 * 1024 * 1024) throw new Error('Account state exceeds 20 MiB of UTF-8.');
    const account = input as PaperAccount;
    if (!account || account.schemaVersion !== 1 || account.virtual !== true || !safeKey(account.id) || !safeKey(account.runId) || !['paper', 'replay-paper'].includes(account.mode) || typeof account.name !== 'string' || account.name.length > 500 || !validTime(account.createdAt) || !validTime(account.clock) || account.clock < account.createdAt) throw new Error('Invalid virtual account identity, version or clock.');
    assertSettings(account.settings);
    if (!Array.isArray(account.orders) || !Array.isArray(account.fills) || !Array.isArray(account.events) || account.orders.length > 100000 || account.fills.length > 100000 || account.events.length > 1000000) throw new Error('Invalid account history arrays.');
    if (!account.positions || typeof account.positions !== 'object' || Array.isArray(account.positions) || !account.quotes || typeof account.quotes !== 'object' || Array.isArray(account.quotes) || !account.commands || typeof account.commands !== 'object' || Array.isArray(account.commands)) throw new Error('Invalid account dictionaries.');
    const allIds = new Set<string>(), orders = new Map<string, PaperOrder>(); let highestId = 0;
    const registerId = (id: string, kind: string) => { if (typeof id !== 'string' || !id.startsWith(`${account.id}:${kind}:`) || allIds.has(id)) throw new Error(`Invalid or duplicate ${kind} identity.`); const serial = Number(id.split(':').at(-1)); if (!Number.isSafeInteger(serial) || serial < 1) throw new Error('Invalid account event serial.'); highestId = Math.max(highestId, serial); allIds.add(id); };
    for (const order of account.orders) {
      registerId(order.id, 'order');
      const validationAccount = createPaperAccount({ ...account.settings, id: account.id, now: account.createdAt });
      const validation = orderValidation(validationAccount, { ...order, reduceOnly: false }, order.createdAt);
      if (validation || !validTime(order.updatedAt) || order.updatedAt < order.createdAt || order.updatedAt > account.clock || !['working', 'triggered', 'filled', 'cancelled', 'expired', 'rejected'].includes(order.status) || order.reduceOnly !== undefined && typeof order.reduceOnly !== 'boolean') throw new Error(`Invalid persisted order: ${validation ?? order.id}`);
      if (order.ticket && (order.ticket.submittedAt < order.createdAt || order.ticket.submittedAt > order.updatedAt)) throw new Error('Ticket provenance time is outside its order history.');
      if (order.status === 'filled' ? order.filledQuantity !== order.quantity || !finiteNumber(order.averageFillPrice) || order.averageFillPrice <= 0 : order.filledQuantity !== 0 || order.averageFillPrice !== null) throw new Error('Persisted order fill totals disagree with its status.');
      orders.set(order.id, order);
    }
    let expectedCash = dec(account.settings.initialBalance), expectedFees = dec(0), expectedRealized = dec(0), previousFillTime = account.createdAt;
    const positions = new Map<string, { quantity: number; averagePrice: number; realizedGross: number }>(), filledOrders = new Set<string>();
    for (const fill of account.fills) {
      registerId(fill.id, 'fill'); const order = orders.get(fill.orderId);
      if (!order || order.status !== 'filled' || filledOrders.has(fill.orderId) || fill.quantity !== order.quantity || fill.price !== order.averageFillPrice || fill.side !== order.side || fill.instrumentId !== order.instrument.id || !validNumber(fill.price, 0, true) || !validNumber(fill.quantity, 0, true) || !validNumber(fill.commission, 0) || !finiteNumber(fill.realizedGross) || !validTime(fill.at) || fill.at < order.createdAt || fill.at < previousFillTime || fill.at > account.clock || !validTime(fill.quoteEventTime) || fill.quoteEventTime > fill.at || !Number.isSafeInteger(fill.quoteSequence) || fill.quoteSequence < 0 || typeof fill.fixture !== 'boolean') throw new Error('Invalid or inconsistent persisted fill.');
      if (fill.quotePrice !== undefined || fill.slippage !== undefined) {
        if (!paperSlippageApplies(order) || !validNumber(fill.quotePrice, 0, true) || !validNumber(fill.slippage, 0, true) || dec(fill.quotePrice).add(dec(fill.slippage).mul(fill.side === 'buy' ? 1 : -1)).sub(fill.price).abs().gt(1e-8)) throw new Error('Persisted fill slippage disagrees with its quote and price.');
      }
      if (fill.intrabar !== undefined && (fill.intrabar !== true || order.type === 'market')) throw new Error('Persisted intrabar fill flag is invalid.');
      filledOrders.add(fill.orderId); previousFillTime = fill.at;
      const previous = positions.get(fill.instrumentId), oldQuantity = previous?.quantity ?? 0, average = previous?.averagePrice ?? 0, signed = fill.side === 'buy' ? fill.quantity : -fill.quantity;
      const closing = oldQuantity && Math.sign(oldQuantity) !== Math.sign(signed) ? Math.min(Math.abs(oldQuantity), fill.quantity) : 0;
      const realized = numeric(dec(fill.price).sub(average).mul(closing).mul(Math.sign(oldQuantity))), quantity = numeric(dec(oldQuantity).add(signed));
      if (Math.abs(realized - fill.realizedGross) > 1e-8) throw new Error('Fill realized profit does not match prior virtual positions.');
      const nextAverage = quantity === 0 ? 0 : oldQuantity === 0 || Math.sign(quantity) !== Math.sign(oldQuantity) ? fill.price : Math.sign(signed) === Math.sign(oldQuantity) ? numeric(dec(average).mul(Math.abs(oldQuantity)).add(dec(fill.price).mul(fill.quantity)).div(Math.abs(quantity))) : average;
      if (quantity === 0) positions.delete(fill.instrumentId); else positions.set(fill.instrumentId, { quantity, averagePrice: nextAverage, realizedGross: numeric(dec(previous?.realizedGross ?? 0).add(realized)) });
      expectedCash = expectedCash.sub(dec(signed).mul(fill.price)).sub(fill.commission); expectedFees = expectedFees.add(fill.commission); expectedRealized = expectedRealized.add(realized);
    }
    for (const order of account.orders) if ((order.status === 'filled') !== filledOrders.has(order.id)) throw new Error('Order and fill histories disagree.');
    for (const [name, expected] of [['cash', expectedCash], ['fees', expectedFees], ['realizedGross', expectedRealized]] as const) if (!finiteNumber(account[name]) || dec(account[name]).sub(expected).abs().gt(1e-8)) throw new Error(`Persisted ${name} does not match fill history.`);
    if (Object.keys(account.positions).length !== positions.size) throw new Error('Position count does not match fill history.');
    for (const [id, expected] of positions) {
      const position = account.positions[id]; if (!position || position.instrument.id !== id || position.instrument.currency !== account.settings.currency) throw new Error('Persisted position instrument is invalid.');
      if (orderValidation(createPaperAccount({ ...account.settings, now: account.createdAt }), { instrument: position.instrument, type: 'market', side: 'buy', quantity: Math.abs(position.quantity) }, account.clock)) throw new Error('Persisted position instrument metadata or quantity is invalid.');
      for (const key of ['quantity', 'averagePrice', 'realizedGross'] as const) if (!finiteNumber(position[key]) || Math.abs(position[key] - expected[key]) > 1e-8) throw new Error(`Persisted position ${key} does not match fill history.`);
    }
    for (const [id, quote] of Object.entries(account.quotes)) if (id !== quote.instrumentId || !processPaperQuote(createPaperAccount({ now: 0 }), quote, account.clock).ok) throw new Error('Invalid persisted quote.');
    const eventIds = new Set<number>();
    for (const event of account.events) { if (!Number.isSafeInteger(event.id) || event.id < 1 || eventIds.has(event.id) || !orders.has(event.orderId) || !validTime(event.at) || event.at < account.createdAt || event.at > account.clock || !['submitted', 'modified', 'cancelled', 'triggered', 'filled', 'expired', 'rejected'].includes(event.type) || typeof event.message !== 'string') throw new Error('Invalid persisted account event.'); eventIds.add(event.id); highestId = Math.max(highestId, event.id); }
    for (const [id, command] of Object.entries(account.commands)) if (!safeKey(id) || !orders.has(command.orderId) || typeof command.signature !== 'string' || command.signature.length > 32000) throw new Error('Invalid persisted command identity.');
    if (!Number.isSafeInteger(account.nextId) || account.nextId <= highestId) throw new Error('Account identity sequence is invalid.');
    if (account.journal !== undefined) {
      if (!Array.isArray(account.journal) || account.journal.length > PAPER_ACCOUNT_JOURNAL_LIMIT) throw new Error('Invalid account journal.');
      const entryIds = new Set<number>();
      for (const entry of account.journal) if (!entry || typeof entry !== 'object' || !Number.isSafeInteger(entry.id) || entry.id < 1 || entryIds.has(entry.id) || !entryIds.add(entry.id) || !validTime(entry.at) || !['reset', 'settings'].includes(entry.type) || typeof entry.message !== 'string' || entry.message.length > 2000 || entry.balance !== undefined && !validNumber(entry.balance, 0, true) || Object.keys(entry).some(key => !['id', 'at', 'type', 'message', 'balance'].includes(key))) throw new Error('Invalid account journal entry.');
    }
    validatePaperBracketState(account);
    return { ok: true, account: structuredClone(account), errors };
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); return { ok: false, errors }; }
}
function finiteNumber(input: unknown): input is number { return typeof input === 'number' && Number.isFinite(input); }
export function restorePaperAccount(input: unknown): PaperAccount { const validation = validatePaperAccount(input); if (!validation.ok || !validation.account) throw new Error(validation.errors.join(' ')); return validation.account; }
