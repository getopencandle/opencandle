import Decimal from 'decimal.js';
import type { PaperAccount, PaperOrderRequest } from './paper';
import { assertPaperPlainData, paperInstrumentKey, validatePaperExitPlan } from './paper-brackets';
import type { DataState, DomainDiagnostic, Instrument, Quote } from './types';
import { isLastImportedQuote, LAST_IMPORTED_LABEL, UNKNOWN_SESSION_NOTE } from './paper-quote';
import { paperDayExpiry, paperPeriodExpiry, paperSessionBound } from './paper-expiry';
import { newYorkClock, NYSE_EARLY_CLOSES, US_SESSION_MINUTES } from './us-market-hours';
/** A Day order on an NYSE early-close day expires at the 13:00 close (17:00 extended). */
export const PAPER_EARLY_CLOSE = { earlyClose: (date: string) => NYSE_EARLY_CLOSES.has(date) ? US_SESSION_MINUTES.earlyClose : null };
/** The Day close a ticket submitted at `now` would get, on the same early-close calendar materializePaperTicket uses
 * (13:00 New York time, 17:00 for extended hours), for the Paper trading dialog's Day hint. `closeMinute` is that close as a New York
 * minute of the day (null for an instrument without a US equity session, which keeps the 24-hour Day). */
export function paperTicketDayClose(now: number, instrument: Pick<Instrument, 'assetClass' | 'timezone'>, extendedHours: boolean): { expiresAt: number; closeMinute: number | null; earlyClose: boolean } {
  const expiresAt = paperDayExpiry(now, instrument, extendedHours, PAPER_EARLY_CLOSE);
  if (!Number.isFinite(now) || !paperSessionBound(instrument)) return { expiresAt, closeMinute: null, earlyClose: false };
  const close = newYorkClock(expiresAt);
  return { expiresAt, closeMinute: close.minutes, earlyClose: NYSE_EARLY_CLOSES.has(close.date) };
}

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_DOWN });
const MAX_TIME = 253402300799;
export const PAPER_TICKET_LIMITS = { bytes: 32768, nodes: 1000, levels: 4, scalarCharacters: 80, sourceCharacters: 16384, equityPositions: 16384 } as const;
export type PaperSizingBalance = 'realized-balance' | 'cash' | 'equity';
export type PaperPriceInput = { kind: 'price' | 'side-ticks'; value: string };
export type PaperQuantityInput =
  | { kind: 'units'; value: string }
  | { kind: 'notional'; value: string; currency: string }
  | { kind: 'balance-percent'; value: string; basis: PaperSizingBalance }
  | { kind: 'risk-money'; value: string; currency: string; stopLevelId: string }
  | { kind: 'risk-percent'; value: string; basis: PaperSizingBalance; stopLevelId: string };
export type PaperExitValueInput =
  | { kind: 'price' | 'ticks' | 'price-percent'; value: string }
  | { kind: 'money'; value: string; currency: string }
  | { kind: 'balance-percent'; value: string; basis: PaperSizingBalance };
export interface PaperTicketExitLevel { id: string; quantity: string; takeProfit: PaperExitValueInput | null; stopLoss: PaperExitValueInput | null; }
/** `gtc` is good till cancelled (no expiry). Records saved before it carry only the other three kinds. */
export type PaperTicketValidity = { kind: 'day' } | { kind: 'gtc' } | { kind: 'week' } | { kind: 'month' } | { kind: 'manual-expiry'; expiresAt: number } | { kind: 'retain-existing'; orderId: string };
export interface PaperTicketInput {
  schemaVersion: 1; side: 'buy' | 'sell'; type: 'market' | 'limit' | 'stop' | 'stop-limit';
  quantity: PaperQuantityInput; limit: PaperPriceInput | null; stop: PaperPriceInput | null;
  validity: PaperTicketValidity; entryOutsideRth: boolean; takeProfitOutsideRth: boolean;
  exits: { mode: 'single' | 'multiple'; levels: PaperTicketExitLevel[] } | null;
}
export interface PaperQuoteSource { key: string; state: DataState; }
export interface PaperTicketContext { account: PaperAccount; instrument: Instrument; quote: Quote | null; quoteSource: PaperQuoteSource | null; now: number; editOrderId?: string; }
export interface PaperTicketSizing {
  entryPrice: number; entryBasis: 'ask' | 'bid' | 'requested-limit' | 'requested-stop';
  balanceBasis: PaperSizingBalance | null; balanceValue: number | null;
  riskStopLevelId: string | null; riskStopPrice: number | null;
  rawQuantity: string; quantity: number; grossNotional: number;
  feesIncluded: false; leverageApplied: false; fxApplied: false;
}
export interface PaperTicketRecord {
  schemaVersion: 1; policy: 'gross-local-v1'; preparedAt: number; submittedAt: number;
  input: PaperTicketInput; sourceKey: string | null; quote: Quote | null; sizing: PaperTicketSizing;
}
export interface PaperTicketPreview {
  schemaVersion: 1; preparedAt: number; expectedAccount: PaperAccount; draftFingerprint: string;
  instrumentKey: string; quoteFingerprint: string | null; sourceKey: string | null;
  resolved: Omit<PaperOrderRequest, 'timeInForce' | 'expiresAt'>; validity: PaperTicketValidity;
  sizing: PaperTicketSizing; notices: string[];
}
export type PaperTicketResolution<T> = { ok: true; value: T; diagnostics: DomainDiagnostic[] } | { ok: false; diagnostics: DomainDiagnostic[] };
class TicketError extends Error { constructor(readonly code: string, message: string) { super(message); } }
function error(code: string, message: string): never { throw new TicketError(code, message); }
function failure<T>(value: unknown): PaperTicketResolution<T> { return { ok: false, diagnostics: [{ code: value instanceof TicketError ? value.code : 'INVALID_TICKET', message: value instanceof Error ? value.message : String(value), severity: 'error' }] }; }
function record(value: unknown, keys: string[], label: string): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) error('INVALID_TICKET_SCHEMA', `${label} has missing or unsupported fields.`);
}
function time(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIME; }
function basis(value: unknown): value is PaperSizingBalance { return typeof value === 'string' && ['cash', 'realized-balance', 'equity'].includes(value); }
function scalar(value: unknown, label: string, signed = false): Decimal {
  if (typeof value !== 'string' || value.length > PAPER_TICKET_LIMITS.scalarCharacters || !(signed ? /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/ : /^(?:\d+(?:\.\d*)?|\.\d+)$/).test(value.trim())) error('INVALID_TICKET_NUMBER', `${label} requires a decimal number without exponents or grouping.`);
  const parsed = new D(value.trim());
  if (!parsed.isFinite() || parsed.abs().gt('1000000000000000')) error('TICKET_NUMBER_LIMIT', `${label} exceeds the supported scalar range.`);
  return parsed;
}
function positive(value: unknown, label: string): Decimal { const parsed = scalar(value, label); if (!parsed.gt(0)) error('NONPOSITIVE_TICKET_NUMBER', `${label} must be positive.`); return parsed; }
function number(value: Decimal, label: string): number {
  const result = value.toNumber();
  if (!Number.isFinite(result) || Number.isInteger(result) && !Number.isSafeInteger(result) || !new D(result).eq(value)) error('TICKET_PRECISION', `${label} cannot be represented safely at the supported precision.`);
  return result;
}
function grid(value: Decimal, increment: number, label: string): number { if (!value.gt(0) || !value.mod(increment).isZero()) error('OFF_GRID_PRICE', `${label} must be positive and exactly tick-aligned. OpenCandle does not round prices.`); return number(value, label); }
function boundedText(value: unknown, maximum: number): value is string { return typeof value === 'string' && value.length > 0 && value.length <= maximum; }
function validateValue(input: unknown, exit: boolean): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) error('INVALID_TICKET_SCHEMA', 'Price representation must be a plain record.');
  const v = input as Record<string, unknown>;
  const kinds = exit ? ['price', 'ticks', 'price-percent', 'money', 'balance-percent'] : ['price', 'side-ticks'];
  if (typeof v.kind !== 'string' || !kinds.includes(v.kind)) error('UNSUPPORTED_PRICE_REPRESENTATION', 'Unsupported price representation.');
  record(v, ['kind', 'value', ...(v.kind === 'money' ? ['currency'] : []), ...(v.kind === 'balance-percent' ? ['basis'] : [])], 'Price representation');
  if (v.kind === 'side-ticks') scalar(v.value, 'Relative ticks', true); else positive(v.value, 'Price or distance');
  if (v.kind === 'money' && (typeof v.currency !== 'string' || !/^[A-Z]{3}$/.test(v.currency))) error('INVALID_CURRENCY', 'Choose an explicit three-letter currency.');
  if (v.kind === 'balance-percent' && !basis(v.basis)) error('INVALID_BALANCE_BASIS', 'Choose cash, realized balance or equity explicitly.');
}
export function validatePaperTicketInput(input: unknown): PaperTicketInput {
  assertPaperPlainData(input, PAPER_TICKET_LIMITS.nodes);
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > PAPER_TICKET_LIMITS.bytes) error('TICKET_SIZE_LIMIT', 'Ticket draft exceeds 32 KiB of UTF-8.');
  record(input, ['schemaVersion', 'side', 'type', 'quantity', 'limit', 'stop', 'validity', 'entryOutsideRth', 'takeProfitOutsideRth', 'exits'], 'Ticket');
  if (input.schemaVersion !== 1 || !['buy', 'sell'].includes(input.side) || !['market', 'limit', 'stop', 'stop-limit'].includes(input.type) || typeof input.entryOutsideRth !== 'boolean' || typeof input.takeProfitOutsideRth !== 'boolean') error('INVALID_TICKET_SCHEMA', 'Unsupported ticket version, side, type or session switches.');
  const q = input.quantity;
  if (!q || typeof q !== 'object' || Array.isArray(q) || !['units', 'notional', 'balance-percent', 'risk-money', 'risk-percent'].includes(q.kind)) error('INVALID_QUANTITY_REPRESENTATION', 'Choose a supported quantity representation.');
  record(q, ['kind', 'value', ...(['notional', 'risk-money'].includes(q.kind) ? ['currency'] : []), ...(['balance-percent', 'risk-percent'].includes(q.kind) ? ['basis'] : []), ...(['risk-money', 'risk-percent'].includes(q.kind) ? ['stopLevelId'] : [])], 'Quantity');
  positive(q.value, 'Quantity or budget');
  if (['notional', 'risk-money'].includes(q.kind) && (typeof q.currency !== 'string' || !/^[A-Z]{3}$/.test(q.currency))) error('INVALID_CURRENCY', 'Choose an explicit account currency.');
  if (['balance-percent', 'risk-percent'].includes(q.kind) && !basis(q.basis)) error('INVALID_BALANCE_BASIS', 'Choose the percentage denominator explicitly.');
  if (['risk-money', 'risk-percent'].includes(q.kind) && !boundedText(q.stopLevelId, 128)) error('RISK_STOP_REQUIRED', 'Choose a specific stop-loss level for risk sizing.');
  for (const key of ['limit', 'stop'] as const) {
    const required = key === 'limit' ? ['limit', 'stop-limit'].includes(input.type) : ['stop', 'stop-limit'].includes(input.type);
    if (required ? input[key] === null : input[key] !== null) error('INAPPLICABLE_TICKET_PRICE', 'The order type and price inputs disagree.');
    if (input[key] !== null) validateValue(input[key], false);
  }
  const validity = input.validity;
  if (!validity || typeof validity !== 'object' || Array.isArray(validity)) error('INVALID_VALIDITY', 'Choose a validity policy.');
  if (validity.kind === 'day') record(validity, ['kind'], 'Day validity');
  else if (validity.kind === 'gtc') record(validity, ['kind'], 'GTC validity');
  else if (validity.kind === 'week' || validity.kind === 'month') record(validity, ['kind'], 'Week or Month validity');
  else if (validity.kind === 'manual-expiry') { record(validity, ['kind', 'expiresAt'], 'Manual validity'); if (!time(validity.expiresAt)) error('INVALID_EXPIRATION', 'Expiry must be supported UTC Unix seconds.'); }
  else if (validity.kind === 'retain-existing') { record(validity, ['kind', 'orderId'], 'Retained validity'); if (!boundedText(validity.orderId, 256)) error('INVALID_VALIDITY', 'An existing order is required.'); }
  else error('UNSUPPORTED_VALIDITY', 'Choose Day, Week, Month, GTC or an explicit local expiry.');
  if (input.exits !== null) {
    record(input.exits, ['mode', 'levels'], 'Ticket exits');
    if (!['single', 'multiple'].includes(input.exits.mode) || !Array.isArray(input.exits.levels) || input.exits.levels.length < 1 || input.exits.levels.length > 4 || input.exits.mode === 'single' && input.exits.levels.length !== 1) error('INVALID_EXIT_LEVELS', 'Choose one single level or up to four paired levels.');
    const ids = new Set<string>();
    for (const level of input.exits.levels) {
      record(level, ['id', 'quantity', 'takeProfit', 'stopLoss'], 'Ticket exit level');
      if (!boundedText(level.id, 128) || ids.has(level.id)) error('INVALID_EXIT_ID', 'Exit level IDs must be bounded and unique.'); ids.add(level.id);
      positive(level.quantity, 'Exit quantity');
      if (level.takeProfit === null && level.stopLoss === null || input.exits.mode === 'multiple' && (level.takeProfit === null || level.stopLoss === null)) error('EXIT_REQUIRED', 'Multiple levels require paired take profit and stop loss.');
      if (level.takeProfit !== null) validateValue(level.takeProfit, true);
      if (level.stopLoss !== null) validateValue(level.stopLoss, true);
    }
  }
  return structuredClone(input) as PaperTicketInput;
}
export function parsePaperExpiryText(text: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})$/.exec(text.trim());
  if (!match) error('EXPLICIT_EXPIRY_OFFSET_REQUIRED', 'Use an ISO date/time with Z or an explicit UTC offset. Ambiguous local times are not accepted.');
  const [, ys, ms, ds, hs, mins, ss = '0', offset] = match, year = Number(ys), month = Number(ms), day = Number(ds), hour = Number(hs), minute = Number(mins), second = Number(ss);
  const check = new Date(0); check.setUTCFullYear(year, month - 1, day); check.setUTCHours(hour, minute, second, 0);
  if (year < 1970 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59)) error('INVALID_EXPIRATION', 'Expiry date, time or offset is invalid.');
  const seconds = Date.parse(text.trim()) / 1000;
  if (!time(seconds)) error('INVALID_EXPIRATION', 'Expiry must normalize to supported UTC seconds from 1970 through 9999.');
  return seconds;
}
/** The key list the previous package accepts for a saved ticket quote (built bundle function j5). A saved record must stay inside it. */
const RECORD_QUOTE_KEYS = ['instrumentId', 'bid', 'ask', 'bidSize', 'askSize', 'session', 'fixture', 'eventTime', 'receivedAt', 'availableAt', 'sequence'];
/** 'basis' is runtime-only: it labels a live context quote and is never written into order.ticket.quote (older readers reject the key). */
export function paperTicketRecordQuote(quote: Quote): Quote { const { basis: _basis, ...rest } = quote as Quote & { basis?: unknown }; return rest as Quote; }
function validateQuote(quote: Quote, instrumentId: string, now: number, maxAge: number, record = false): string {
  assertPaperPlainData(quote, 40);
  if (Object.keys(quote).some(key => !(record ? RECORD_QUOTE_KEYS : [...RECORD_QUOTE_KEYS, 'basis']).includes(key)) || (quote as { basis?: unknown }).basis !== undefined && (!isLastImportedQuote(quote) || quote.fixture) || quote.instrumentId !== instrumentId || !Number.isFinite(quote.bid) || !Number.isFinite(quote.ask) || quote.bid <= 0 || quote.ask <= 0 || quote.bid > quote.ask || !time(quote.eventTime) || !time(quote.receivedAt) || !time(quote.availableAt) || !Number.isSafeInteger(quote.sequence) || quote.sequence < 0 || typeof quote.fixture !== 'boolean' || !['regular', 'extended', 'all', 'unknown'].includes(quote.session)) error('INVALID_TICKET_QUOTE', 'A positive, ordered, matching bid/ask quote with explicit timestamps is required.');
  if (quote.eventTime > quote.availableAt || quote.receivedAt > quote.availableAt || quote.availableAt > now) error('FUTURE_TICKET_QUOTE', 'Quote information is not available at this simulation time.');
  if (!Number.isFinite(maxAge) || maxAge < 0 || now - quote.availableAt > maxAge) error('STALE_TICKET_QUOTE', 'Quote is stale. Refresh the preview with a usable quote.');
  for (const size of [quote.bidSize, quote.askSize]) if (size !== undefined && (!Number.isFinite(size) || size < 0)) error('INVALID_TICKET_QUOTE', 'Quote sizes must be nonnegative.');
  return JSON.stringify([quote.instrumentId, quote.bid, quote.ask, quote.bidSize ?? null, quote.askSize ?? null, quote.eventTime, quote.receivedAt, quote.availableAt, quote.sequence, quote.session, quote.fixture]);
}
function contextIdentity(context: PaperTicketContext) {
  const instrumentKey = paperInstrumentKey(context.instrument);
  if (!time(context.now) || context.now < context.account.clock) error('INVALID_TICKET_TIME', 'Ticket time cannot precede the virtual account clock.');
  if (context.account.virtual !== true || context.instrument.currency !== context.account.settings.currency) error('TICKET_FX_UNAVAILABLE', 'Instrument and virtual account currency must match. FX conversion is unavailable.');
  if (context.quoteSource !== null) {
    assertPaperPlainData(context.quoteSource, 10); record(context.quoteSource, ['key', 'state'], 'Quote source');
    if (!boundedText(context.quoteSource.key, PAPER_TICKET_LIMITS.sourceCharacters) || !['ready', 'loading', 'stale', 'disconnected', 'unavailable', 'error'].includes(context.quoteSource.state)) error('INVALID_TICKET_SOURCE', 'Quote source identity or state is invalid.');
    if (context.quoteSource.state !== 'ready') error('TICKET_SOURCE_UNAVAILABLE', `Selected quote source is ${context.quoteSource.state}.`);
  }
  if (context.quote && !context.quoteSource) error('TICKET_SOURCE_REQUIRED', 'The quote needs an exact source identity before a ticket preview.');
  const quoteFingerprint = context.quote ? validateQuote(context.quote, context.instrument.id, context.now, context.account.settings.maxQuoteAgeSeconds) : null;
  return { instrumentKey, quoteFingerprint, sourceKey: context.quoteSource?.key ?? null };
}
function balanceValue(context: PaperTicketContext, selected: PaperSizingBalance): Decimal {
  const account = context.account;
  let value = selected === 'cash' ? new D(account.cash) : new D(account.settings.initialBalance).add(account.realizedGross).sub(account.fees);
  if (selected === 'equity') {
    const keys = Object.keys(account.positions);
    if (keys.length > PAPER_TICKET_LIMITS.equityPositions) error('TICKET_WORK_LIMIT', 'Equity sizing exceeds the bounded position workload.');
    for (const key of keys) {
      const position = account.positions[key], quote = account.quotes[key];
      if (!quote) error('EQUITY_MARK_MISSING', `Equity sizing needs a quote for ${key}.`);
      validateQuote(quote, key, context.now, account.settings.maxQuoteAgeSeconds);
      value = value.add(new D(position.quantity > 0 ? quote.bid : quote.ask).sub(position.averagePrice).mul(position.quantity));
    }
  }
  if (!value.isFinite() || !value.gt(0)) error('INVALID_BALANCE_VALUE', `Selected ${selected} must be positive and available.`);
  return value;
}
function currency(context: PaperTicketContext, value: string): void { if (value !== context.account.settings.currency || value !== context.instrument.currency) error('TICKET_FX_UNAVAILABLE', 'This conversion requires the same explicit account and instrument currency.'); }
function exitPrice(input: PaperExitValueInput, leg: 'tp' | 'sl', quantity: Decimal, entry: Decimal, context: PaperTicketContext, side: 'buy' | 'sell'): number {
  const amount = positive(input.value, 'Exit amount'); let price: Decimal;
  if (input.kind === 'price') price = amount;
  else {
    let distance: Decimal;
    if (input.kind === 'ticks') distance = amount.mul(context.instrument.tickSize);
    else if (input.kind === 'price-percent') distance = entry.mul(amount).div(100);
    else { const budget = input.kind === 'money' ? (currency(context, input.currency), amount) : input.kind === 'balance-percent' ? balanceValue(context, input.basis).mul(amount).div(100) : error('UNSUPPORTED_PRICE_REPRESENTATION', 'Unsupported exit representation.'); distance = budget.div(quantity); }
    price = entry.add(distance.mul((side === 'buy' ? 1 : -1) * (leg === 'tp' ? 1 : -1)));
  }
  if (leg === 'sl' ? side === 'buy' ? !price.lt(entry) : !price.gt(entry) : side === 'buy' ? !price.gt(entry) : !price.lt(entry)) error('WRONG_SIDE_EXIT', `${leg === 'sl' ? 'Protective stop' : 'Take profit'} must be strictly on its declared side of the sizing entry.`);
  return grid(price, context.instrument.tickSize, 'Exit price');
}
function resolve(input: PaperTicketInput, context: PaperTicketContext): Omit<PaperTicketPreview, 'expectedAccount' | 'schemaVersion' | 'preparedAt' | 'draftFingerprint'> {
  const identity = contextIdentity(context), quote = context.quote, sidePrice = quote ? new D(input.side === 'buy' ? quote.ask : quote.bid) : null;
  const old = context.editOrderId ? context.account.orders.find(order => order.id === context.editOrderId) : undefined;
  if (context.editOrderId && (!old || !['working', 'triggered'].includes(old.status) || paperInstrumentKey(old.instrument) !== identity.instrumentKey || old.side !== input.side || old.type !== input.type || old.bracket)) error('STALE_TICKET_ORDER', 'The edited order is unavailable or its immutable identity changed.');
  const price = (field: PaperPriceInput | null, label: string) => { if (!field) return undefined; const result = field.kind === 'price' ? positive(field.value, label) : sidePrice ? sidePrice.add(scalar(field.value, 'Relative ticks', true).mul(context.instrument.tickSize)) : error('QUOTE_REQUIRED', 'Relative ticks require a current side quote.'); return grid(result, context.instrument.tickSize, label); };
  const limitPrice = price(input.limit, 'Limit price'), stopPrice = price(input.stop, 'Stop price');
  if (stopPrice !== undefined && !old) { if (!sidePrice) error('QUOTE_REQUIRED', 'Entry-stop side validation requires a current quote.'); if (input.side === 'buy' ? !new D(stopPrice).gt(sidePrice) : !new D(stopPrice).lt(sidePrice)) error('WRONG_SIDE_ENTRY_STOP', 'Entry stop must be strictly beyond the executable side quote.'); }
  const entryBasis = limitPrice !== undefined ? 'requested-limit' : stopPrice !== undefined ? 'requested-stop' : input.side === 'buy' ? 'ask' : 'bid';
  const entry = limitPrice !== undefined ? new D(limitPrice) : stopPrice !== undefined ? new D(stopPrice) : sidePrice ?? error('QUOTE_REQUIRED', 'Market sizing requires a current bid/ask quote.');
  const selectedBasis = 'basis' in input.quantity ? input.quantity.basis : null, selectedBalance = selectedBasis ? balanceValue(context, selectedBasis) : null;
  let budget = positive(input.quantity.value, 'Quantity or budget');
  if ('currency' in input.quantity) currency(context, input.quantity.currency);
  if (selectedBalance) budget = selectedBalance.mul(budget).div(100);
  let riskStopLevelId: string | null = null, riskStopPrice: number | null = null;
  if ('stopLevelId' in input.quantity) {
    riskStopLevelId = input.quantity.stopLevelId;
    const level = input.exits?.levels.find(row => row.id === riskStopLevelId);
    if (!level?.stopLoss) error('RISK_STOP_REQUIRED', 'The explicitly selected stop-loss level is unavailable.');
    riskStopPrice = exitPrice(level.stopLoss, 'sl', positive(level.quantity, 'Selected exit quantity'), entry, context, input.side);
  }
  const raw = input.quantity.kind === 'units' ? budget : riskStopPrice !== null ? budget.div(entry.sub(riskStopPrice).abs()) : budget.div(entry);
  const rounded = input.quantity.kind === 'units' ? raw : raw.div(context.instrument.lotSize).floor().mul(context.instrument.lotSize);
  if (!rounded.gt(0)) error('ZERO_SIZED_QUANTITY', 'Budget rounds down to zero units at this lot size. No order was created.');
  if (rounded.gt(1e9) || !rounded.mod(context.instrument.lotSize).isZero()) error('INVALID_SIZED_QUANTITY', 'Quantity must align to the lot size and be at most 1000000000.');
  const quantity = number(rounded, 'Quantity');
  const exits = input.exits ? validatePaperExitPlan({ schemaVersion: 1, mode: input.exits.mode, levels: input.exits.levels.map(level => {
    const units = positive(level.quantity, 'Exit quantity'); return { quantity: number(units, 'Exit quantity'), ...(level.takeProfit ? { takeProfit: exitPrice(level.takeProfit, 'tp', units, entry, context, input.side) } : {}), ...(level.stopLoss ? { stopLoss: exitPrice(level.stopLoss, 'sl', units, entry, context, input.side) } : {}) };
  }) }, context.instrument, input.side) : undefined;
  const legacy = !!old && old.sessionPolicy === undefined;
  if (!legacy && (input.entryOutsideRth && input.type !== 'limit' || input.takeProfitOutsideRth && !exits?.levels.some(level => level.takeProfit !== undefined))) error('INVALID_SESSION_ELIGIBILITY', 'Only limit entries support entry extended hours. TP extended hours requires an enabled take profit.');
  if (legacy && (input.entryOutsideRth !== !!old.extendedHours || input.takeProfitOutsideRth !== !!old.extendedHours)) error('LEGACY_SESSION_CONVERSION_REQUIRED', 'Legacy shared session eligibility is retained. Explicit conversion is not yet supported.');
  if (input.validity.kind === 'retain-existing' && (!old || old.id !== input.validity.orderId)) error('EXISTING_ORDER_REQUIRED', 'Retained validity requires the exact edited order.');
  // An edit cannot change the time in force (modifyPaperOrder keeps it), so GTC is only for a GTC order with no
  // stored deadline (a legacy GTC deadline is kept with retain-existing).
  if (old && input.validity.kind === 'gtc' && ((old.timeInForce ?? 'GTC') !== 'GTC' || old.expiresAt !== undefined)) error('GTC_CONVERSION_REQUIRES_NEW_ORDER', 'An edited order keeps its time in force. Cancel it and place a new GTC order.');
  if (old && (input.validity.kind === 'week' || input.validity.kind === 'month')) error('EXPIRY_RENEWAL_REQUIRES_REVIEW', 'Editing cannot renew Week or Month automatically. Retain the existing expiry or choose an explicit new one.');
  if (old && input.validity.kind === 'day') error('EXPIRY_RENEWAL_REQUIRES_REVIEW', 'Editing cannot renew Day automatically. Retain the existing expiry or choose an explicit new one.');
  if (input.validity.kind === 'manual-expiry' && input.validity.expiresAt <= context.now || input.validity.kind === 'day' && (context.now > MAX_TIME - 86400 || paperDayExpiry(context.now, context.instrument, input.entryOutsideRth, PAPER_EARLY_CLOSE) > MAX_TIME) || (input.validity.kind === 'week' || input.validity.kind === 'month') && (context.now > MAX_TIME - 86400 * 40 || paperPeriodExpiry(input.validity.kind, context.now, context.instrument, input.entryOutsideRth, PAPER_EARLY_CLOSE) > MAX_TIME) || old?.expiresAt !== undefined && old.expiresAt <= context.now) error('INVALID_EXPIRATION', 'The expiry is passed or outside the supported date range.');
  const resolved: PaperTicketPreview['resolved'] = { instrument: structuredClone(context.instrument), side: input.side, type: input.type, quantity, extendedHours: input.entryOutsideRth, ...(legacy ? {} : { sessionPolicy: { schemaVersion: 2, entryOutsideRth: input.entryOutsideRth, takeProfitOutsideRth: input.takeProfitOutsideRth } }), ...(limitPrice === undefined ? {} : { limitPrice }), ...(stopPrice === undefined ? {} : { stopPrice }), ...(exits ? { exits } : {}) };
  const sizing: PaperTicketSizing = { entryPrice: number(entry, 'Entry basis'), entryBasis, balanceBasis: selectedBasis, balanceValue: selectedBalance ? number(selectedBalance, 'Sizing balance') : null, riskStopLevelId, riskStopPrice, rawQuantity: raw.toString(), quantity, grossNotional: number(rounded.mul(entry), 'Gross notional'), feesIncluded: false, leverageApplied: false, fxApplied: false };
  const notices = ['OpenCandle gross sizing policy: fees, leverage, FX, financing and gap risk are excluded. Engine buying-power and virtual fees are checked separately.', 'Budget sizing rounds down to the lot. Off-grid prices are rejected.'];
  if (quote?.fixture) notices.push('Quote is synthetic. Unknown fixture sessions are simulated as regular-session observations.');
  if (quote && isLastImportedQuote(quote)) {
    notices.push('The price is the ' + LAST_IMPORTED_LABEL + ' from the imported file, not a live quote. It is read again for every action.');
    if (quote.session === 'unknown') notices.push(UNKNOWN_SESSION_NOTE);
  }
  if (legacy) notices.push('Legacy shared session eligibility and existing GTC lifetime are retained, not converted.');
  if (input.type === 'stop' || input.type === 'stop-limit') notices.push('Requested stop/limit prices are sizing references. Gaps and stop-limit nonexecution can change the outcome.');
  return { ...identity, resolved, validity: structuredClone(input.validity), sizing, notices };
}
interface Lease { account: PaperAccount; editOrderId: string | undefined; input: PaperTicketInput; fingerprint: string; quoteFingerprint: string | null; sourceKey: string | null; instrumentKey: string; preparedAt: number; }
const leases = new WeakMap<PaperTicketPreview, Lease>();
export function previewPaperTicket(input: unknown, context: PaperTicketContext): PaperTicketResolution<PaperTicketPreview> {
  try {
    const normalized = validatePaperTicketInput(input), fingerprint = JSON.stringify(normalized), resolved = resolve(normalized, context);
    const value: PaperTicketPreview = { schemaVersion: 1, preparedAt: context.now, expectedAccount: context.account, draftFingerprint: fingerprint, ...resolved };
    leases.set(value, { account: context.account, editOrderId: context.editOrderId, input: normalized, fingerprint, quoteFingerprint: resolved.quoteFingerprint, sourceKey: resolved.sourceKey, instrumentKey: resolved.instrumentKey, preparedAt: context.now });
    return { ok: true, value, diagnostics: [] };
  } catch (caught) { return failure(caught); }
}
export function materializePaperTicket(preview: PaperTicketPreview, currentInput: unknown, context: PaperTicketContext): PaperTicketResolution<PaperOrderRequest> {
  try {
    const lease = leases.get(preview);
    if (!lease || context.account !== lease.account || context.editOrderId !== lease.editOrderId) error('STALE_TICKET_PREVIEW', 'Account or edited order changed. Review a fresh preview.');
    if (context.now < lease.preparedAt) error('STALE_TICKET_TIME', 'Submission time cannot precede the captured preview.');
    const input = validatePaperTicketInput(currentInput), identity = contextIdentity(context);
    if (JSON.stringify(input) !== lease.fingerprint || identity.instrumentKey !== lease.instrumentKey || identity.quoteFingerprint !== lease.quoteFingerprint || identity.sourceKey !== lease.sourceKey) error('STALE_TICKET_PREVIEW', 'Ticket, quote, source or instrument changed. Review a fresh preview.');
    const resolved = resolve(input, context), old = context.editOrderId ? context.account.orders.find(order => order.id === context.editOrderId)! : null;
    const validity = input.validity.kind === 'day' ? { timeInForce: 'DAY' as const, expiresAt: paperDayExpiry(context.now, context.instrument, input.entryOutsideRth, PAPER_EARLY_CLOSE) } : input.validity.kind === 'gtc' ? { timeInForce: 'GTC' as const } : input.validity.kind === 'week' || input.validity.kind === 'month' ? { timeInForce: 'GTD' as const, expiresAt: paperPeriodExpiry(input.validity.kind, context.now, context.instrument, input.entryOutsideRth, PAPER_EARLY_CLOSE) } : input.validity.kind === 'manual-expiry' ? { timeInForce: 'GTD' as const, expiresAt: input.validity.expiresAt } : { timeInForce: old!.timeInForce ?? 'GTC' as const, ...(old!.expiresAt === undefined ? {} : { expiresAt: old!.expiresAt }) };
    const ticket: PaperTicketRecord = { schemaVersion: 1, policy: 'gross-local-v1', preparedAt: lease.preparedAt, submittedAt: context.now, input: structuredClone(input), sourceKey: identity.sourceKey, quote: context.quote ? structuredClone(paperTicketRecordQuote(context.quote)) : null, sizing: resolved.sizing };
    return { ok: true, value: { ...resolved.resolved, ...validity, ticket }, diagnostics: [] };
  } catch (caught) { return failure(caught); }
}
/** Informational creation/edit snapshot only; execution always uses canonical order fields. */
export function validatePaperTicketRecord(input: unknown): PaperTicketRecord {
  assertPaperPlainData(input, 1200); record(input, ['schemaVersion', 'policy', 'preparedAt', 'submittedAt', 'input', 'sourceKey', 'quote', 'sizing'], 'Ticket provenance');
  if (input.schemaVersion !== 1 || input.policy !== 'gross-local-v1' || !time(input.preparedAt) || !time(input.submittedAt) || input.preparedAt > input.submittedAt || input.sourceKey !== null && !boundedText(input.sourceKey, PAPER_TICKET_LIMITS.sourceCharacters)) error('INVALID_TICKET_PROVENANCE', 'Unsupported ticket provenance or times.');
  validatePaperTicketInput(input.input);
  const s = input.sizing;
  record(s, ['entryPrice', 'entryBasis', 'balanceBasis', 'balanceValue', 'riskStopLevelId', 'riskStopPrice', 'rawQuantity', 'quantity', 'grossNotional', 'feesIncluded', 'leverageApplied', 'fxApplied'], 'Ticket sizing');
  if (!['ask', 'bid', 'requested-limit', 'requested-stop'].includes(s.entryBasis) || s.balanceBasis !== null && !basis(s.balanceBasis) || s.riskStopLevelId !== null && !boundedText(s.riskStopLevelId, 128) || s.feesIncluded !== false || s.leverageApplied !== false || s.fxApplied !== false) error('INVALID_TICKET_PROVENANCE', 'Invalid sizing provenance.');
  for (const field of ['entryPrice', 'quantity', 'grossNotional']) if (typeof s[field] !== 'number' || !Number.isFinite(s[field]) || s[field] <= 0 || Number.isInteger(s[field]) && !Number.isSafeInteger(s[field])) error('INVALID_TICKET_PROVENANCE', 'Sizing provenance contains invalid numbers.');
  for (const field of ['balanceValue', 'riskStopPrice']) if (s[field] !== null && (typeof s[field] !== 'number' || !Number.isFinite(s[field]) || s[field] <= 0)) error('INVALID_TICKET_PROVENANCE', 'Sizing provenance contains invalid optional numbers.');
  if ((s.balanceBasis === null) !== (s.balanceValue === null) || (s.riskStopLevelId === null) !== (s.riskStopPrice === null) || s.quantity > 1e9 || !new D(s.entryPrice).mul(s.quantity).eq(s.grossNotional)) error('INVALID_TICKET_PROVENANCE', 'Sizing provenance has contradictory bases or notional.');
  if (!boundedText(s.rawQuantity, 128)) error('INVALID_TICKET_PROVENANCE', 'Invalid raw quantity snapshot.');
  const raw = new D(s.rawQuantity);
  if (!raw.isFinite() || !raw.gt(0) || raw.gt(1e9) || raw.lt(s.quantity)) error('INVALID_TICKET_PROVENANCE', 'Invalid raw quantity snapshot.');
  if (input.quote !== null) { if (input.sourceKey === null) error('INVALID_TICKET_PROVENANCE', 'Quote provenance requires a source identity.'); validateQuote(input.quote, input.quote.instrumentId, input.submittedAt, Number.MAX_SAFE_INTEGER, true); }
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 64 * 1024) error('TICKET_SIZE_LIMIT', 'Ticket provenance exceeds 64 KiB.');
  return structuredClone(input) as PaperTicketRecord;
}
