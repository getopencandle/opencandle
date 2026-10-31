import Decimal from 'decimal.js';
import type { Bar, StrategyFillBasis } from './types';
import { magnifiedRoute, magnifierGroups, MARGIN_CALL_ORDER_PREFIX, MAX_ORDER_QUANTITY, strategyOrderLabel, type MagnifierCoverage, type StrategyConfig, type StrategyFill, type StrategyOrder, type StrategyResult, type StrategyTrade } from './strategy';
import { exactAdd, exactCompare, exactDiv, exactMul, exactNumber, exactOf, exactSub, exactText, type Exact } from './strategy-report-exact';
import { STRATEGY_REPORT_METRICS, type StrategyReportUnit } from './strategy-report-catalog';
import { averageOf, buildReportPeriods, closeEquityEpisodes, compoundAnnualGrowth, DEFAULT_ANNUAL_RISK_FREE_PERCENT, EPISODE_BASIS, monthEndEquity, monthKeyFormatter, monthlyRatios, buildRpstAnalysis, type ReportPeriods, type ReportRpstAnalysis } from './strategy-report-periods';

const REPORT_PRECISION = 32;
const D = Decimal.clone({ precision: REPORT_PRECISION, rounding: Decimal.ROUND_HALF_EVEN });
const d = (n: number) => new D(n);
const number = (n: Decimal) => n.toDecimalPlaces(10).toNumber();
export const STRATEGY_REPORT_LIMITS = Object.freeze({ bars: 200000, fills: 100000, orders: 100000, trades: 200000, work: 10000000, inputTextBytes: 64 * 1024 * 1024, exportBytes: 20 * 1024 * 1024, pageSize: 200, plotPoints: 2000 });
export type StrategyReportSide = 'all' | 'long' | 'short';
export interface ReportValue { readonly value: number | null; readonly status: 'available' | 'undefined' | 'unavailable'; readonly unit: StrategyReportUnit; readonly basis: string; readonly reason: string | null }
export interface StrategyReportContext { executionId: string; sourceLabel: string; currency: string | null; timezone: string }
export interface StrategyReportInput { result: StrategyResult; bars: readonly Bar[]; standardBars?: readonly Bar[]; barIds: readonly string[]; context: StrategyReportContext; signal?: AbortSignal; maxWork?: number; /** The Bar Magnifier rows the run used, so magnified fill routes can be verified. */ magnifierBars?: readonly Bar[] }
export interface ReportLocation { readonly barIndex: number; readonly barId: string; readonly time: number; readonly phase: StrategyFill['phase']; readonly timeBasis: 'bar-event-open'; readonly routePosition: number | null }
export interface ReportTrade {
  readonly id: string; readonly number: number; readonly direction: 'long' | 'short'; readonly quantity: number;
  readonly entryOrderId: string; readonly exitOrderId: string; /** Readable names; the ids stay internal. */ readonly entrySignal: string; readonly exitSignal: string; readonly entry: ReportLocation; readonly exit: ReportLocation;
  readonly entryPrice: number; readonly exitPrice: number; readonly entryNotional: number; readonly grossProfit: number; readonly commission: number; readonly netProfit: number;
  readonly returnPercent: number; readonly cumulativeNet: number; readonly cumulativePercent: number; readonly barsHeld: number;
  readonly favorable: ReportValue; readonly adverse: ReportValue; readonly favorablePercent: ReportValue; readonly adversePercent: ReportValue;
}
export interface ReportOpenLot {
  readonly id: string; readonly direction: 'long' | 'short'; readonly quantity: number; readonly entryOrderId: string; readonly entrySignal: string; readonly entry: ReportLocation;
  readonly entryPrice: number; readonly mark: number; readonly entryNotional: number; readonly grossProfit: number; readonly remainingEntryCommission: number; readonly netProfit: number;
}
export interface ReportEquityPoint { readonly barIndex: number; readonly barId: string; readonly time: number; readonly equity: number; readonly closedNet: number; readonly drawdown: number; readonly drawdownPercent: number; readonly buyHoldEquity: number | null }
/** One calendar group of closed allocations. `key` is hour 0-23, weekday 0-6 (Sunday first) or month 0-11. */
export interface ReportBucket { readonly key: number; readonly trades: number; readonly wins: number; readonly losses: number; readonly even: number; readonly net: number; readonly winRate: number | null }
export interface ReportOutcomes { readonly trades: number; readonly wins: number; readonly losses: number; readonly even: number; readonly winShare: number | null; readonly lossShare: number | null; readonly evenShare: number | null }
export interface ReportStreaks { readonly longestWins: number; readonly longestLosses: number; readonly bestWinRun: number | null; readonly worstLossRun: number | null; readonly finalKind: 'win' | 'loss' | 'even' | null; readonly finalCount: number }
export interface ReportSideAnalysis { readonly outcomes: ReportOutcomes; readonly streaks: ReportStreaks; readonly hour: readonly ReportBucket[]; readonly weekday: readonly ReportBucket[]; readonly month: readonly ReportBucket[] }
/** `periods` (calendar periodical and benchmark rows) is absent from exports made before it existed. */
export interface ReportAnalysis { readonly basis: string; readonly timezone: string; readonly sides: Readonly<Record<StrategyReportSide, ReportSideAnalysis>>; readonly periods?: ReportPeriods; readonly rpst?: ReportRpstAnalysis }
export const REPORT_ANALYSIS_BASIS = 'Closed FIFO allocations from this run in closing order. Even (zero net) allocations end win and loss streaks. Streak amounts sum the net results of one consecutive run. Time patterns group by entry bar event time in the display time zone, not an exact intrabar fill time. Reference histogram and outlier conventions are unverified and not calculated. Best entry periods use the stated OpenCandle ranking policy (win rate, then net PnL, trades, earlier group).';
export interface StrategyReport {
  readonly schemaVersion: 1; readonly context: Readonly<StrategyReportContext>; readonly config: Readonly<StrategyConfig>; readonly fillBasis: StrategyFillBasis;
  readonly trades: readonly ReportTrade[]; readonly openLots: readonly ReportOpenLot[]; readonly orders: readonly Readonly<StrategyOrder>[]; readonly equity: readonly ReportEquityPoint[];
  readonly metrics: Readonly<Record<StrategyReportSide, Readonly<Record<string, ReportValue>>>>;
  readonly benchmark: Readonly<{ start: ReportLocation | null; entryMark: number | null; lastMark: number | null; policy: string }>;
  readonly drawdown: Readonly<{ amount: number; percent: number; peakBarId: string | null; troughBarId: string | null; peakEquity: number }>;
  readonly analysis: ReportAnalysis;
  readonly policies: readonly string[]; readonly diagnostics: readonly string[]; readonly work: number;
}
const reports = new WeakSet<object>();
const snapshotWork = new WeakMap<object, number>();
export function isStrategyReport(value: unknown): value is StrategyReport { return typeof value === 'object' && value !== null && reports.has(value); }
export class StrategyReportError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = 'StrategyReportError'; } }
const fail = (code: string, message: string): never => { throw new StrategyReportError(code, message); };
function finite(n: unknown, label: string, minimum = -1e100, maximum = 1e100): number { if (typeof n !== 'number' || !Number.isFinite(n) || n < minimum || n > maximum) fail('REPORT_NUMBER', `${label} is outside the finite supported range.`); return n as number; }
function integer(n: unknown, label: string, minimum: number, maximum: number): number { const value = finite(n, label, minimum, maximum); if (!Number.isSafeInteger(value)) fail('REPORT_INTEGER', `${label} must be an integer.`); return value; }
function text(n: unknown, label: string, maximum = 512, empty = false): string { if (typeof n !== 'string' || n.length > maximum || !empty && !n.length) fail('REPORT_TEXT', `${label} is not bounded text.`); return n as string; }
const FORBIDDEN_FIELDS: ReadonlySet<string> = new Set(['__proto__', 'prototype', 'constructor', 'toJSON']);
function record(value: unknown, label: string, fields?: readonly string[]) {
  if (!value || typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) fail('REPORT_RECORD', `${label} must be a plain record.`);
  const keys = Reflect.ownKeys(value as object);
  if (keys.length > 64) fail('REPORT_RECORD', `${label} has too many fields.`);
  for (const key of keys) {
    if (typeof key !== 'string' || FORBIDDEN_FIELDS.has(key) || fields && !fields.includes(key)) fail('REPORT_FIELD', `${label} contains an unsupported field.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) fail('REPORT_FIELD', `${label} must contain enumerable data fields only.`);
  }
}
function checkedArray<T>(value: unknown, label: string, maximum: number): readonly T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) fail('REPORT_ARRAY', `${label} exceeds its supported array bound.`);
  const list = value as T[], keys = Reflect.ownKeys(list);
  // L5 perf: a dense plain array has exactly its indices plus length as own keys (no per-key regex or per-index lookup needed).
  // Own keys list indices first, then string keys in creation order, and 'length' is the first string key of every array; with exactly length + 1 own keys, 'length' last means the other length keys are all indices below length (distinct), so the array is dense and carries no extra property.
  const dense = keys.length === list.length + 1 && keys[list.length] === 'length';
  if (!dense) fail('REPORT_ARRAY', `${label} must be a dense plain array.`);
  return list;
}
/**
 * L5b perf: reportSteps reads only prepareInput's private copy. Every record there is a fresh `{}` whose fields were
 * assigned from Object.keys of a source that passed record() (string, enumerable, data, at most 64, none forbidden),
 * and every array a fresh array filled by push, never exposed. On such a copy record() can fail only on its plain-record
 * test or its field allowlist, array() only on its type or bound, and at() only outside the copy's length, so these are
 * those same checks without the descriptor walks (identical outcomes, including the error codes).
 */
function ownedRecord(value: unknown, label: string, fields?: readonly string[]) {
  if (!value || typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) fail('REPORT_RECORD', `${label} must be a plain record.`);
  if (fields) for (const key of Object.keys(value as object)) if (!fields.includes(key)) fail('REPORT_FIELD', `${label} contains an unsupported field.`);
}
function ownedArray<T>(value: unknown, label: string, maximum: number): readonly T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) fail('REPORT_ARRAY', `${label} exceeds its supported array bound.`);
  return value as T[];
}
function ownedAt<T>(list: readonly T[], index: number): T { if (!(index >= 0 && index < list.length)) fail('REPORT_ARRAY', 'Report arrays cannot contain accessors or missing values.'); return list[index]; }
/** record() that also returns the validated field values (prepareInput reads each descriptor once). */
function recordValues(value: unknown, label: string): { keys: string[]; values: unknown[] } {
  if (!value || typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) fail('REPORT_RECORD', `${label} must be a plain record.`);
  const keys = Reflect.ownKeys(value as object), values: unknown[] = [];
  if (keys.length > 64) fail('REPORT_RECORD', `${label} has too many fields.`);
  for (const key of keys) {
    if (typeof key !== 'string' || FORBIDDEN_FIELDS.has(key)) fail('REPORT_FIELD', `${label} contains an unsupported field.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) fail('REPORT_FIELD', `${label} must contain enumerable data fields only.`);
    values.push(descriptor.value);
  }
  return { keys: keys as string[], values };
}
/** UTF-8 byte length, as TextEncoder encodes (a lone surrogate becomes U+FFFD, three bytes). */
function utf8Bytes(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1; else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length && (value.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}
function at<T>(list: readonly T[], index: number): T { const descriptor = Object.getOwnPropertyDescriptor(list, String(index)); if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail('REPORT_ARRAY', 'Report arrays cannot contain accessors or missing values.'); return descriptor!.value as T; }
function near(a: number, b: number, label: string) { if (Math.abs(a - b) > Math.max(1e-7, Math.max(Math.abs(a), Math.abs(b)) * Number.EPSILON * 16)) fail('REPORT_RECONCILIATION', `${label} does not reconcile with the actual execution.`); }
const rv = (value: number | null, unit: StrategyReportUnit, basis: string, reason: string | null = null, status: ReportValue['status'] = value === null ? 'undefined' : 'available'): ReportValue => Object.freeze({ value: value === null ? null : finite(value, 'Metric'), unit, basis, reason, status });
const absent = (unit: StrategyReportUnit, reason: string) => rv(null, unit, 'Unavailable', reason, 'unavailable');
function route(bar: Bar) { return Math.abs(bar.open - bar.high) < Math.abs(bar.open - bar.low) ? [bar.open, bar.high, bar.low, bar.close, bar.close] : [bar.open, bar.low, bar.high, bar.close, bar.close]; }
/**
 * Raw position of a fill on its bar's route (0 at the open, path.length - 1 at the close). A bar the Bar Magnifier
 * routed through lower-timeframe bars has the magnified route (four points per lower-timeframe bar, then the close).
 */
function routePosition(fill: StrategyFill, bar: Bar, path: readonly number[], magnified: boolean): number | null {
  if (fill.marketPrice === undefined && fill.routeSegment === undefined && fill.routeBasis === undefined) return null;
  if (fill.routeBasis !== (magnified ? 'lower-timeframe-ohlc-v1' : 'ohlc-nearest-extreme-low-tie-v1')) fail('REPORT_ROUTE', 'Unknown simulated fill-route provenance.');
  const end = path.length - 1, mark = finite(fill.marketPrice, 'Fill market mark', Number.MIN_VALUE), segment = integer(fill.routeSegment, 'Fill route segment', 0, end);
  if (fill.phase === 'open') { if (segment !== 0 || mark !== bar.open) fail('REPORT_ROUTE', 'Opening fill route contradicts its bar.'); return 0; }
  if (fill.phase === 'close') { if (segment !== end || mark !== bar.close) fail('REPORT_ROUTE', 'Closing fill route contradicts its bar.'); return end; }
  if (segment < 1 || segment > end - 1 || mark < Math.min(path[segment - 1], path[segment]) || mark > Math.max(path[segment - 1], path[segment])) fail('REPORT_ROUTE', 'Intrabar fill mark is outside its declared route segment.');
  return path[segment] === path[segment - 1] ? segment : segment - 1 + (mark - path[segment - 1]) / (path[segment] - path[segment - 1]);
}
function boundary(path: readonly number[], from: number, to: number, fromMark: number, toMark: number): [number, number] {
  if (from > to) fail('REPORT_ROUTE', 'Trade exits before its entry route location.');
  let low = Math.min(fromMark, toMark), high = Math.max(fromMark, toMark);
  for (let position = 0; position < path.length; position++) if (position >= from && position <= to) { low = Math.min(low, path[position]); high = Math.max(high, path[position]); }
  return [low, high];
}
interface Lot { entry: StrategyFill; fillIndex: number; remaining: number; fees: number; direction: 'long' | 'short' }
interface Totals { count: number; wins: number; losses: number; even: number; net: Decimal; profit: Decimal; loss: Decimal; fees: Decimal; bars: number; winBars: number; lossBars: number; largestWin: number | null; largestLoss: number | null; openGross: Decimal; openFees: Decimal; openCount: number; margin: Decimal; maxMargin: Decimal; maxContracts: number; /** Sums and extremes of trade Return % (net PnL / entry notional). */ returns: Decimal; winReturns: Decimal; lossReturns: Decimal; largestWinReturn: number | null; largestLossReturn: number | null }
const totals = (): Totals => ({ count: 0, wins: 0, losses: 0, even: 0, net: d(0), profit: d(0), loss: d(0), fees: d(0), bars: 0, winBars: 0, lossBars: 0, largestWin: null, largestLoss: null, openGross: d(0), openFees: d(0), openCount: 0, margin: d(0), maxMargin: d(0), maxContracts: 0, returns: d(0), winReturns: d(0), lossReturns: d(0), largestWinReturn: null, largestLossReturn: null });
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Calendar fields of a bar event time in an explicit IANA zone. */
export function reportCalendar(timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', hour: '2-digit', weekday: 'short', month: 'numeric' });
  return (time: number) => {
    let hour = -1, weekday = -1, month = -1;
    for (const part of formatter.formatToParts(time * 1000)) { if (part.type === 'hour') hour = Number(part.value) % 24; else if (part.type === 'weekday') weekday = WEEKDAYS.indexOf(part.value); else if (part.type === 'month') month = Number(part.value) - 1; }
    if (!Number.isSafeInteger(hour) || hour < 0 || weekday < 0 || !Number.isSafeInteger(month) || month < 0 || month > 11) fail('REPORT_TIMEZONE', 'The display time zone did not produce calendar fields.');
    return { hour, weekday, month };
  };
}
interface BucketTotals { trades: number; wins: number; losses: number; even: number; net: Decimal }
const buckets = (count: number): BucketTotals[] => Array.from({ length: count }, () => ({ trades: 0, wins: 0, losses: 0, even: 0, net: d(0) }));
const freezeBuckets = (rows: BucketTotals[]): readonly ReportBucket[] => Object.freeze(rows.map((row, key) => Object.freeze({ key, trades: row.trades, wins: row.wins, losses: row.losses, even: row.even, net: number(row.net), winRate: row.trades ? 100 * row.wins / row.trades : null })));

/** Detach caller-owned records before the cooperative runner can yield. */
function prepareInput(input: StrategyReportInput): StrategyReportInput {
  // L5b perf: prepareInput runs synchronously and reads descriptors, never getters, so an array already found dense and
  // plain here stays so; a second check of the same array keeps only its type and bound tests (one native own-key walk
  // per 200k-row array instead of two). Like recordValues reading each descriptor once, this assumes ordinary data, not a
  // Proxy whose traps answer differently on a second call (worker input is structured-cloned and never a Proxy).
  const dense = new Set<object>(), array = <T,>(value: unknown, label: string, maximum: number): readonly T[] => {
    if (dense.has(value as object)) return ownedArray<T>(value, label, maximum);
    const list = checkedArray<T>(value, label, maximum); dense.add(list); return list;
  };
  record(input, 'Report input', ['result', 'bars', 'standardBars', 'barIds', 'context', 'signal', 'maxWork', 'magnifierBars']);
  const budget = integer(input.maxWork ?? STRATEGY_REPORT_LIMITS.work, 'Report work budget', 1, STRATEGY_REPORT_LIMITS.work);
  if (input.signal !== undefined && !(input.signal instanceof AbortSignal)) fail('REPORT_SIGNAL', 'Cancellation requires an actual AbortSignal.');
  record(input.result, 'Strategy result'); record(input.result.config, 'Strategy config'); record(input.result.execution, 'Execution accounting');
  if (input.result.ok !== true) fail('REPORT_INCOMPLETE', 'A failed or budget-stopped strategy has no completed report.');
  const bars = array<Bar>(input.bars, 'Signal bars', STRATEGY_REPORT_LIMITS.bars), ids = array<string>(input.barIds, 'Bar identities', STRATEGY_REPORT_LIMITS.bars), equity = array(input.result.equity, 'Equity history', STRATEGY_REPORT_LIMITS.bars);
  if (bars.length !== ids.length || bars.length !== equity.length || input.result.execution.barsProcessed !== bars.length) fail('REPORT_PREFIX', 'Report arrays do not describe the same completed input prefix.');
  if (input.result.config.fillBasis === 'standard-ohlc' && input.result.config.chartType === 'heikin-ashi' && array(input.standardBars, 'Standard bars', STRATEGY_REPORT_LIMITS.bars).length !== bars.length) fail('REPORT_PREFIX', 'Standard execution bars do not match the signal prefix.');
  let nodes = 0, textBytes = 0; const copied = new Map<object, unknown>(), active = new Set<object>();
  function clone(value: unknown, depth: number, field = ''): unknown {
    if (++nodes > budget) fail('REPORT_WORK_LIMIT', 'Report calculation work limit exceeded while capturing the execution.');
    if (input.signal?.aborted) fail('REPORT_CANCELLED', 'Report calculation cancelled.');
    if (depth > 20) fail('REPORT_RECORD', 'Report input nesting exceeds its bound.');
    if (value === null || value === undefined || typeof value === 'boolean') return value;
    if (typeof value === 'number') return finite(value, 'Report input number');
    if (typeof value === 'string') { text(value, 'Report input text', field === 'executionId' ? 32768 : ['sourceLabel', 'reason', 'policies', 'diagnostics'].includes(field) ? 4096 : 512, true); textBytes += utf8Bytes(value); if (textBytes > STRATEGY_REPORT_LIMITS.inputTextBytes) fail('REPORT_TEXT_LIMIT', 'Combined report input text exceeds 64 MiB UTF-8.'); return value; }
    if (!value || typeof value !== 'object') fail('REPORT_RECORD', 'Report data cannot contain executable or symbolic values.');
    const object = value as object; if (active.has(object)) fail('REPORT_RECORD', 'Report data cannot contain cycles.'); const known = copied.get(object); if (known !== undefined) return known;
    if (Array.isArray(value)) {
      active.add(object);
      const source = array<unknown>(value, 'Report input array', STRATEGY_REPORT_LIMITS.trades), target: unknown[] = []; copied.set(object, target);
      for (let i = 0; i < source.length; i++) target.push(clone(at(source, i), depth + 1, field)); active.delete(object); return target;
    }
    // L5b perf: a record whose fields are all primitives has no descendant that could reach it, so it never needs to be
    // marked active for the cycle check (the same outcome); the copy memo is unchanged, as is every node count.
    const fields = recordValues(value, 'Report input record'), target: Record<string, unknown> = {}; copied.set(object, target);
    let leaf = true; for (const field of fields.values) if (typeof field === 'object' && field !== null) { leaf = false; break; }
    if (!leaf) active.add(object);
    for (let k = 0; k < fields.keys.length; k++) target[fields.keys[k]] = clone(fields.values[k], depth + 1, fields.keys[k]);
    if (!leaf) active.delete(object); return target;
  }
  const owned = clone({ result: input.result, bars: input.bars, standardBars: input.standardBars, barIds: input.barIds, context: input.context, maxWork: input.maxWork, ...(input.magnifierBars !== undefined ? { magnifierBars: array<Bar>(input.magnifierBars, 'Bar Magnifier bars', STRATEGY_REPORT_LIMITS.bars) } : {}) }, 0) as StrategyReportInput;
  owned.signal = input.signal; snapshotWork.set(owned, nodes); return owned;
}

const BAR_FIELDS: readonly string[] = ['time', 'open', 'high', 'low', 'close', 'volume'];
function* reportSteps(input: StrategyReportInput): Generator<void, StrategyReport> {
  ownedRecord(input, 'Report input', ['result', 'bars', 'standardBars', 'barIds', 'context', 'signal', 'maxWork', 'magnifierBars']);
  if (input.signal !== undefined && !(input.signal instanceof AbortSignal)) fail('REPORT_SIGNAL', 'Cancellation requires an actual AbortSignal.');
  const maxWork = integer(input.maxWork ?? STRATEGY_REPORT_LIMITS.work, 'Report work budget', 1, STRATEGY_REPORT_LIMITS.work);
  let work = snapshotWork.get(input) ?? 0; const step = (n = 1) => { work += n; if (work > maxWork) fail('REPORT_WORK_LIMIT', 'Report calculation work limit exceeded. No completed report or export was produced.'); if (input.signal?.aborted) fail('REPORT_CANCELLED', 'Report calculation cancelled.'); };
  step(); ownedRecord(input.result, 'Strategy result', ['ok', 'config', 'orders', 'fills', 'trades', 'equity', 'metrics', 'diagnostics', 'policies', 'execution']);
  if (input.result.ok !== true) fail('REPORT_INCOMPLETE', 'A failed or budget-stopped strategy has no completed report.');
  const result = input.result; ownedRecord(result.config, 'Strategy config', ['initialCapital', 'commission', 'slippageTicks', 'tickSize', 'lotSize', 'processOrdersOnClose', 'fillBasis', 'chartType', 'marginLongPercent', 'marginShortPercent', 'pyramiding', 'limitVerifyTicks', 'calcOnEveryTick', 'calcOnOrderFills', 'barMagnifier', 'defaultQuantity', 'orderDelayBars']); ownedRecord(result.config.commission, 'Strategy commission', ['kind', 'value']); ownedRecord(result.execution, 'Execution accounting'); ownedRecord(result.metrics, 'Existing metrics');
  const config = result.config, initial = finite(config.initialCapital, 'Initial capital', Number.MIN_VALUE, 1e12);
  for (const key of ['slippageTicks', 'tickSize', 'lotSize', 'pyramiding', 'limitVerifyTicks'] as const) finite(config[key], key, 0);
  finite(config.commission.value, 'Commission value', 0); if (!['fixed', 'percent', 'per-unit'].includes(config.commission.kind)) fail('REPORT_CONFIG', 'Unknown commission type.');
  for (const key of ['processOrdersOnClose', 'calcOnEveryTick', 'calcOnOrderFills', 'barMagnifier'] as const) if (typeof config[key] !== 'boolean') fail('REPORT_CONFIG', 'Execution flags must be booleans.');
  if (!['standard', 'heikin-ashi', 'renko', 'range', 'kagi', 'line-break', 'point-and-figure', 'other'].includes(config.chartType)) fail('REPORT_CONFIG', 'Unknown chart-price transform.');
  if (config.defaultQuantity !== undefined) { ownedRecord(config.defaultQuantity, 'Default order size', ['kind', 'value']); if (!['contracts', 'cash', 'percent-of-equity'].includes(config.defaultQuantity.kind)) fail('REPORT_CONFIG', 'Unknown default order size.'); finite(config.defaultQuantity.value, 'Default order size', Number.MIN_VALUE); }
  if (config.orderDelayBars !== undefined && !Number.isSafeInteger(finite(config.orderDelayBars, 'Order execution delay', 0, 1000))) fail('REPORT_CONFIG', 'Order execution delay must be whole bars.');
  finite(config.marginLongPercent, 'Long margin', Number.MIN_VALUE, 100); finite(config.marginShortPercent, 'Short margin', Number.MIN_VALUE, 100);
  if (!['chart-prices', 'standard-ohlc'].includes(config.fillBasis)) fail('REPORT_BASIS', 'Unknown execution-price basis.');
  ownedRecord(input.context, 'Report context', ['executionId', 'sourceLabel', 'currency', 'timezone']);
  const context = { executionId: text(input.context.executionId, 'Execution identity', 32768), sourceLabel: text(input.context.sourceLabel, 'Source label', 4096), currency: input.context.currency, timezone: text(input.context.timezone, 'Display timezone', 128) };
  if (context.currency !== null && (typeof context.currency !== 'string' || !/^[A-Z]{3}$/.test(context.currency))) fail('REPORT_CURRENCY', 'Currency must be explicitly supplied as a three-letter code or null.');
  try { new Intl.DateTimeFormat('en', { timeZone: context.timezone }); } catch { fail('REPORT_TIMEZONE', 'Invalid report display timezone.'); }
  const signalBars = ownedArray<Bar>(input.bars, 'Signal bars', STRATEGY_REPORT_LIMITS.bars), bars = config.fillBasis === 'standard-ohlc' && config.chartType === 'heikin-ashi' ? ownedArray<Bar>(input.standardBars, 'Standard bars', STRATEGY_REPORT_LIMITS.bars) : signalBars;
  const ids = ownedArray<string>(input.barIds, 'Bar identities', STRATEGY_REPORT_LIMITS.bars), fills = ownedArray<StrategyFill>(result.fills, 'Fills', STRATEGY_REPORT_LIMITS.fills), rawTrades = ownedArray<StrategyTrade>(result.trades, 'Trades', STRATEGY_REPORT_LIMITS.trades), rawOrders = ownedArray<StrategyOrder>(result.orders, 'Orders', STRATEGY_REPORT_LIMITS.orders), rawEquity = ownedArray<StrategyResult['equity'][number]>(result.equity, 'Equity history', STRATEGY_REPORT_LIMITS.bars);
  if (ids.length !== bars.length || signalBars.length !== bars.length || rawEquity.length !== bars.length || result.execution.barsProcessed !== bars.length) fail('REPORT_PREFIX', 'Report arrays do not describe the same completed input prefix.');
  const seenIds = new Set<string>(), copiedBars: Bar[] = [], copiedIds: string[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (!(i % 1024)) yield; step(15);
    const bar = ownedAt(bars, i), signalBar = ownedAt(signalBars, i); ownedRecord(bar, 'Execution bar', BAR_FIELDS); if (signalBar !== bar) ownedRecord(signalBar, 'Signal bar', BAR_FIELDS);
    for (const candidate of bars === signalBars ? [bar] : [bar, signalBar]) {
      integer(candidate.time, 'Bar time', -62135596800, 253402300799); finite(candidate.open, 'Bar open', Number.MIN_VALUE); finite(candidate.high, 'Bar high', Number.MIN_VALUE); finite(candidate.low, 'Bar low', Number.MIN_VALUE); finite(candidate.close, 'Bar close', Number.MIN_VALUE); finite(candidate.volume, 'Bar volume', 0);
      if (candidate.high < Math.max(candidate.open, candidate.close, candidate.low) || candidate.low > Math.min(candidate.open, candidate.close, candidate.high)) fail('REPORT_BAR', 'Invalid OHLC relation.');
    }
    if (bar.time !== signalBar.time || i && bar.time < copiedBars[i - 1].time) fail('REPORT_PREFIX', 'Execution bars are unordered or misaligned with signals.');
    const id = text(ownedAt(ids, i), 'Bar identity'); if (seenIds.has(id)) fail('REPORT_PREFIX', 'Bar identities must be unique even when display timestamps repeat.'); seenIds.add(id); copiedIds.push(id); copiedBars.push({ ...bar });
  }
  // Bar Magnifier: rebuild the run's lower-timeframe routes with the engine's own grouping, so every magnified fill is verified.
  let magnifiedPaths: (number[] | null)[] | null = null;
  if (input.magnifierBars !== undefined) {
    if (!config.barMagnifier) fail('REPORT_PREFIX', 'Bar Magnifier rows need the Bar Magnifier property.');
    const lower = ownedArray<Bar>(input.magnifierBars, 'Bar Magnifier bars', STRATEGY_REPORT_LIMITS.bars), copiedLower: Bar[] = [];
    for (let i = 0; i < lower.length; i++) { if (!(i % 2048)) yield; step(2); const row = ownedAt(lower, i); ownedRecord(row, 'Bar Magnifier bar', ['time', 'open', 'high', 'low', 'close', 'volume']); copiedLower.push({ ...row }); }
    const coverage: MagnifierCoverage = (result.execution as { magnifierCoverage?: MagnifierCoverage }).magnifierCoverage === 'available' ? 'available' : 'all';
    const grouped = magnifierGroups(copiedBars, copiedLower, coverage); if (grouped.diagnostics.length) fail('REPORT_ROUTE', grouped.diagnostics[0]);
    magnifiedPaths = grouped.groups.map((group, index) => group ? [...magnifiedRoute(group), copiedBars[index].close] : null);
    const magnifiedCount = magnifiedPaths.filter(Boolean).length, declared = (result.execution as { magnifiedBars?: number }).magnifiedBars;
    if (declared !== undefined && declared !== magnifiedCount) fail('REPORT_ROUTE', 'The Bar Magnifier coverage contradicts the supplied lower-timeframe bars.');
    step(magnifiedCount);
  }
  const pathOf = (index: number): readonly number[] => magnifiedPaths?.[index] ?? route(copiedBars[index]);
  let treeSize = 1; while (treeSize < bars.length) treeSize *= 2;
  const lows = new Float64Array(treeSize * 2).fill(Infinity), highs = new Float64Array(treeSize * 2).fill(-Infinity);
  for (let i = 0; i < copiedBars.length; i++) { step(); lows[treeSize + i] = copiedBars[i].low; highs[treeSize + i] = copiedBars[i].high; if (!(i % 2048)) yield; }
  for (let i = treeSize - 1; i; i--) { step(); lows[i] = Math.min(lows[i * 2], lows[i * 2 + 1]); highs[i] = Math.max(highs[i * 2], highs[i * 2 + 1]); if (!(i % 2048)) yield; }
  const range = (from: number, to: number): [number, number] => { let lo = Infinity, hi = -Infinity, left = from + treeSize, right = to + treeSize; while (left <= right) { step(); if (left & 1) { lo = Math.min(lo, lows[left]); hi = Math.max(hi, highs[left++]); } if (!(right & 1)) { lo = Math.min(lo, lows[right]); hi = Math.max(hi, highs[right--]); } left = Math.floor(left / 2); right = Math.floor(right / 2); } return [lo, hi]; };
  const fillById = new Map<string, { fill: StrategyFill; index: number; location: ReportLocation; raw: number | null }>(), orders: Readonly<StrategyOrder>[] = [], orderById = new Map<string, StrategyOrder>();
  const signal = (id: string, role: 'entry' | 'exit') => strategyOrderLabel(orderById.get(id) ?? { id }, role);
  for (let i = 0; i < rawOrders.length; i++) { if (!(i % 1024)) yield; step(10); const order = ownedAt(rawOrders, i); ownedRecord(order, 'Order', ['id', 'action', 'quantity', 'type', 'limitPrice', 'stopPrice', 'reduceOnly', 'targetOrderId', 'createdBar', 'eligibleBar', 'status', 'fillBar', 'fillPrice', 'reason', 'label', 'entryLabel', 'exitLabel']); text(order.id, 'Order identity'); for (const key of ['label', 'entryLabel', 'exitLabel'] as const) if (order[key] !== undefined) text(order[key], 'Order label', 512); if (orderById.has(order.id)) fail('REPORT_ORDER', 'Order identity repeats.'); text(order.action, 'Order side', 16); text(order.type, 'Order type', 32); text(order.status, 'Order status', 32); integer(order.createdBar, 'Created bar', 0, bars.length - 1); integer(order.eligibleBar, 'Eligible bar', 0, bars.length); finite(order.quantity, 'Order quantity'); if (order.fillBar !== null) integer(order.fillBar, 'Order fill bar', 0, bars.length - 1); if (order.fillPrice !== null) finite(order.fillPrice, 'Order fill price', Number.MIN_VALUE); for (const key of ['limitPrice', 'stopPrice'] as const) if (order[key] !== undefined) finite(order[key], key); if (order.reduceOnly !== undefined && typeof order.reduceOnly !== 'boolean') fail('REPORT_ORDER', 'Reduce-only must be boolean.'); if (order.targetOrderId !== undefined) text(order.targetOrderId, 'Target order'); if (order.reason !== undefined) text(order.reason, 'Order diagnostic', 4096, true); orderById.set(order.id, order); orders.push(Object.freeze({ ...order })); }
  let cash = d(initial), position = d(0), closedCursor = 0, lotHead = 0, firstOpening: StrategyFill | null = null;
  const lots: Lot[] = [], endStates = new Map<number, { cash: number; position: number }>(), sideTotals: Record<StrategyReportSide, Totals> = { all: totals(), long: totals(), short: totals() };
  let previousPosition = -1, previousBar = -1;
  for (let i = 0; i < fills.length; i++) {
    if (!(i % 512)) yield; step(12); const fill = ownedAt(fills, i); ownedRecord(fill, 'Fill', ['orderId', 'side', 'quantity', 'price', 'commission', 'barIndex', 'time', 'phase', 'basis', 'marketPrice', 'routeSegment', 'routeBasis']);
    text(fill.orderId, 'Fill order identity'); const order = orderById.get(fill.orderId);
    integer(fill.barIndex, 'Fill bar', 0, bars.length - 1); finite(fill.quantity, 'Fill quantity', Number.MIN_VALUE, MAX_ORDER_QUANTITY); finite(fill.price, 'Fill price', Number.MIN_VALUE); finite(fill.commission, 'Fill commission', 0);
    if (!order || order.status !== 'filled' || order.fillBar !== fill.barIndex || order.fillPrice !== fill.price || order.action !== fill.side || order.quantity !== fill.quantity || fillById.has(fill.orderId) || !['buy', 'sell'].includes(fill.side) || !['open', 'intrabar', 'close'].includes(fill.phase) || fill.basis !== config.fillBasis || fill.time !== copiedBars[fill.barIndex].time) fail('REPORT_FILL', 'Fill contradicts its order, bar or execution basis.');
    const path = pathOf(fill.barIndex), point = routePosition(fill, copiedBars[fill.barIndex], path, !!magnifiedPaths?.[fill.barIndex]); if (fill.barIndex < previousBar || fill.barIndex === previousBar && point !== null && point < previousPosition) fail('REPORT_FILL', 'Fills are not in execution order.'); previousBar = fill.barIndex; previousPosition = point ?? -1;
    // The shown route position stays on the 0 (open) to 4 (close) scale; a magnified route is scaled onto it.
    const location: ReportLocation = Object.freeze({ barIndex: fill.barIndex, barId: copiedIds[fill.barIndex], time: fill.time, phase: fill.phase, timeBasis: 'bar-event-open', routePosition: point === null ? null : path.length === 5 ? point : point * 4 / (path.length - 1) }); fillById.set(fill.orderId, { fill, index: i, location, raw: point });
    const direction = fill.side === 'buy' ? 'long' : 'short', sign = direction === 'long' ? 1 : -1;
    let remaining = fill.quantity;
    while (remaining > 0 && lotHead < lots.length && lots[lotHead].direction !== direction) {
      step(10); const lot = lots[lotHead], closeQuantity = Math.min(remaining, lot.remaining), raw = ownedAt(rawTrades, closedCursor++); ownedRecord(raw, 'Closed trade');
      const entryFee = number(d(lot.fees).mul(closeQuantity).div(lot.remaining)), exitFee = number(d(fill.commission).mul(closeQuantity).div(fill.quantity));
      const gross = number(d(fill.price).sub(lot.entry.price).mul(closeQuantity).mul(lot.direction === 'long' ? 1 : -1)), fee = number(d(entryFee).add(exitFee));
      if (raw.entryOrderId !== lot.entry.orderId || raw.exitOrderId !== fill.orderId || raw.direction !== lot.direction || raw.entryBar !== lot.entry.barIndex || raw.exitBar !== fill.barIndex || raw.entryPrice !== lot.entry.price || raw.exitPrice !== fill.price || raw.quantity !== closeQuantity || raw.barsHeld !== fill.barIndex - lot.entry.barIndex + 1) fail('REPORT_TRADE', 'Closed allocation contradicts FIFO execution.');
      near(finite(raw.grossProfit, 'Trade gross'), gross, 'Trade gross'); near(finite(raw.commission, 'Trade fees', 0), fee, 'Trade fees'); near(finite(raw.netProfit, 'Trade net'), number(d(gross).sub(fee)), 'Trade net');
      lot.remaining = number(d(lot.remaining).sub(closeQuantity)); lot.fees = number(d(lot.fees).sub(entryFee)); remaining = number(d(remaining).sub(closeQuantity)); if (!lot.remaining) lotHead++;
    }
    if (remaining > 0) { if (!firstOpening) firstOpening = fill; lots.push({ entry: fill, fillIndex: i, remaining, fees: number(d(fill.commission).mul(remaining).div(fill.quantity)), direction }); }
    position = d(number(position.add(d(fill.quantity).mul(sign)))); cash = cash.sub(d(fill.quantity).mul(fill.price).mul(sign)).sub(fill.commission);
    endStates.set(fill.barIndex, { cash: number(cash), position: number(position) }); sideTotals.all.maxContracts = Math.max(sideTotals.all.maxContracts, Math.abs(number(position))); if (!position.isZero()) sideTotals[position.gt(0) ? 'long' : 'short'].maxContracts = Math.max(sideTotals[position.gt(0) ? 'long' : 'short'].maxContracts, Math.abs(number(position)));
  }
  if (closedCursor !== rawTrades.length) fail('REPORT_TRADE', 'Closed trade count contradicts accepted fills.');
  const firstLocation = firstOpening ? fillById.get(firstOpening.orderId)!.location : null, benchmarkEntry = firstOpening?.marketPrice ?? null, lastMark = copiedBars.at(-1)?.close ?? null;
  const benchmarkPolicy = 'Fractional initial capital at first opening pre-slippage market mark; final execution close; no fee, leverage or FX. Exact reference entry/rounding policy unverified.';
  const location = (fill: StrategyFill) => fillById.get(fill.orderId)!.location;
  const excursion = (entry: StrategyFill, exit: StrategyFill, direction: 'long' | 'short', quantity: number): [ReportValue, ReportValue, ReportValue, ReportValue] => {
    const a = fillById.get(entry.orderId)!.raw, b = fillById.get(exit.orderId)!.raw, basis = 'Gross price excursion on the supplied OHLC assumed route, clipped to simulated entry/exit; fees excluded.';
    if (a === null || b === null) return [absent('currency', 'Precise simulated fill-route metadata is unavailable.'), absent('currency', 'Precise simulated fill-route metadata is unavailable.'), absent('percent', 'Precise simulated fill-route metadata is unavailable.'), absent('percent', 'Precise simulated fill-route metadata is unavailable.')];
    let low = Math.min(entry.price, exit.price), high = Math.max(entry.price, exit.price);
    const merge = (extremes: [number, number]) => { low = Math.min(low, extremes[0]); high = Math.max(high, extremes[1]); };
    if (entry.barIndex === exit.barIndex) merge(boundary(pathOf(entry.barIndex), a, b, entry.marketPrice!, exit.marketPrice!));
    else { merge(boundary(pathOf(entry.barIndex), a, pathOf(entry.barIndex).length - 1, entry.marketPrice!, copiedBars[entry.barIndex].close)); merge(boundary(pathOf(exit.barIndex), 0, b, copiedBars[exit.barIndex].open, exit.marketPrice!)); if (exit.barIndex - entry.barIndex > 1) merge(range(entry.barIndex + 1, exit.barIndex - 1)); }
    const favorable = Math.max(0, number(d(direction === 'long' ? high - entry.price : entry.price - low).mul(quantity))), adverse = Math.max(0, number(d(direction === 'long' ? entry.price - low : high - entry.price).mul(quantity))), denominator = d(entry.price).mul(quantity);
    return [rv(favorable, 'currency', basis), rv(adverse, 'currency', basis), rv(number(d(favorable).div(denominator).mul(100)), 'percent', basis + ' Percentage of actual entry notional.'), rv(number(d(adverse).div(denominator).mul(100)), 'percent', basis + ' Percentage of actual entry notional.')];
  };
  const trades: ReportTrade[] = [], closedByBar = new Map<number, Decimal>(); let cumulative = d(0);
  type Run = { hour: BucketTotals[]; weekday: BucketTotals[]; month: BucketTotals[]; kind: ReportStreaks['finalKind']; count: number; net: Decimal; longestWins: number; longestLosses: number; bestWinRun: number | null; worstLossRun: number | null };
  const when = reportCalendar(context.timezone), runs = Object.fromEntries((['all', 'long', 'short'] as const).map(side => [side, { hour: buckets(24), weekday: buckets(7), month: buckets(12), kind: null, count: 0, net: d(0), longestWins: 0, longestLosses: 0, bestWinRun: null, worstLossRun: null } as Run])) as Record<StrategyReportSide, Run>;
  for (let i = 0; i < rawTrades.length; i++) {
    if (!(i % 512)) yield; step(8); const raw = ownedAt(rawTrades, i), entry = fillById.get(raw.entryOrderId)!.fill, exit = fillById.get(raw.exitOrderId)!.fill, notional = number(d(raw.entryPrice).mul(raw.quantity));
    cumulative = cumulative.add(raw.netProfit); closedByBar.set(raw.exitBar, (closedByBar.get(raw.exitBar) ?? d(0)).add(raw.netProfit));
    const [favorable, adverse, favorablePercent, adversePercent] = excursion(entry, exit, raw.direction, raw.quantity);
    trades.push(Object.freeze({ id: `trade:${i + 1}`, number: i + 1, direction: raw.direction, quantity: raw.quantity, entryOrderId: raw.entryOrderId, exitOrderId: raw.exitOrderId, entrySignal: signal(raw.entryOrderId, 'entry'), exitSignal: signal(raw.exitOrderId, 'exit'), entry: location(entry), exit: location(exit), entryPrice: raw.entryPrice, exitPrice: raw.exitPrice, entryNotional: notional, grossProfit: raw.grossProfit, commission: raw.commission, netProfit: raw.netProfit, returnPercent: number(d(raw.netProfit).div(notional).mul(100)), cumulativeNet: number(cumulative), cumulativePercent: number(cumulative.div(initial).mul(100)), barsHeld: raw.barsHeld, favorable, adverse, favorablePercent, adversePercent }));
    const entered = when(location(entry).time), kind: 'win' | 'loss' | 'even' = raw.netProfit > 0 ? 'win' : raw.netProfit < 0 ? 'loss' : 'even';
    for (const side of ['all', raw.direction] as const) {
      const run = runs[side]; step(3);
      if (run.kind === kind) { run.count++; run.net = run.net.add(raw.netProfit); } else { run.kind = kind; run.count = 1; run.net = d(raw.netProfit); }
      if (kind === 'win') { run.longestWins = Math.max(run.longestWins, run.count); run.bestWinRun = Math.max(run.bestWinRun ?? -Infinity, number(run.net)); }
      else if (kind === 'loss') { run.longestLosses = Math.max(run.longestLosses, run.count); run.worstLossRun = Math.min(run.worstLossRun ?? Infinity, number(run.net)); }
      for (const bucket of [run.hour[entered.hour], run.weekday[entered.weekday], run.month[entered.month]]) { bucket.trades++; if (kind === 'win') bucket.wins++; else if (kind === 'loss') bucket.losses++; else bucket.even++; bucket.net = bucket.net.add(raw.netProfit); }
    }
    const tradeReturn = trades[trades.length - 1].returnPercent;
    for (const side of ['all', raw.direction] as const) { const t = sideTotals[side]; t.count++; t.net = t.net.add(raw.netProfit); t.fees = t.fees.add(raw.commission); t.bars += raw.barsHeld; t.returns = t.returns.add(tradeReturn); if (raw.netProfit > 0) { t.wins++; t.profit = t.profit.add(raw.netProfit); t.winBars += raw.barsHeld; t.largestWin = Math.max(t.largestWin ?? 0, raw.netProfit); t.winReturns = t.winReturns.add(tradeReturn); t.largestWinReturn = Math.max(t.largestWinReturn ?? -Infinity, tradeReturn); } else if (raw.netProfit < 0) { t.losses++; t.loss = t.loss.add(-raw.netProfit); t.lossBars += raw.barsHeld; t.largestLoss = Math.max(t.largestLoss ?? 0, -raw.netProfit); t.lossReturns = t.lossReturns.add(-tradeReturn); t.largestLossReturn = Math.max(t.largestLossReturn ?? -Infinity, -tradeReturn); } else t.even++; }
  }
  const openLots: ReportOpenLot[] = [];
  for (let i = lotHead; i < lots.length; i++) { if (!(i % 1024)) yield; step(5); const lot = lots[i]; if (!lot.remaining) continue; const gross = number(d(lastMark!).sub(lot.entry.price).mul(lot.remaining).mul(lot.direction === 'long' ? 1 : -1)); openLots.push(Object.freeze({ id: `open:${lot.fillIndex + 1}`, direction: lot.direction, quantity: lot.remaining, entryOrderId: lot.entry.orderId, entrySignal: signal(lot.entry.orderId, 'entry'), entry: location(lot.entry), entryPrice: lot.entry.price, mark: lastMark!, entryNotional: number(d(lot.entry.price).mul(lot.remaining)), grossProfit: gross, remainingEntryCommission: lot.fees, netProfit: number(d(gross).sub(lot.fees)) })); for (const side of ['all', lot.direction] as const) { const t = sideTotals[side]; t.openCount++; t.openGross = t.openGross.add(gross); t.openFees = t.openFees.add(lot.fees); t.fees = t.fees.add(lot.fees); } }
  // Reference intrabar drawdown / run-up: per bar in a position, (max prior realized equity - realized equity on entry)
  // + units * adverse move, and (realized equity on entry - min prior realized equity) + units * favorable move.
  // Realized equity is initial capital plus closed net of allocations closed at or before the entry fill.
  const intrabar = { drawdown: d(0), runup: d(0), reason: null as string | null };
  {
    const overlap = 'Overlapping or partially closed entries (pyramiding or partial exits) are present. The reference per-position aggregation for simultaneous allocations is not established, so no value is reported.';
    let realized = d(initial), peakRealized = d(initial), minRealized = d(initial), lastExit = -1;
    const visit = (entryIndex: number, adverse: ReportValue, favorable: ReportValue) => {
      if (entryIndex < lastExit) { intrabar.reason ??= overlap; return; }
      if (adverse.status !== 'available' || favorable.status !== 'available') { intrabar.reason ??= adverse.reason ?? 'Precise simulated fill-route metadata is unavailable.'; return; }
      intrabar.drawdown = Decimal.max(intrabar.drawdown, peakRealized.sub(realized).add(adverse.value!)); intrabar.runup = Decimal.max(intrabar.runup, realized.sub(minRealized).add(favorable.value!));
    };
    for (let i = 0; i < trades.length; i++) {
      if (!(i % 512)) yield; step(6); const trade = trades[i], entryIndex = fillById.get(trade.entryOrderId)!.index;
      visit(entryIndex, trade.adverse, trade.favorable);
      realized = realized.add(trade.netProfit); peakRealized = Decimal.max(peakRealized, realized); minRealized = Decimal.min(minRealized, realized); lastExit = fillById.get(trade.exitOrderId)!.index;
    }
    const remaining = lots.slice(lotHead).filter(lot => lot.remaining > 0);
    if (remaining.length > 1) intrabar.reason ??= overlap;
    else if (remaining.length === 1) {
      step(20); const lot = remaining[0], a = fillById.get(lot.entry.orderId)!.raw, entryBar = lot.entry.barIndex, last = copiedBars.length - 1, mark = copiedBars[last].close, basis = 'Open entry marked through the final supplied close on the assumed route; fees excluded.';
      if (a === null) visit(lot.fillIndex, absent('currency', 'Precise simulated fill-route metadata is unavailable.'), absent('currency', 'Precise simulated fill-route metadata is unavailable.'));
      else {
        let low = Math.min(lot.entry.price, mark), high = Math.max(lot.entry.price, mark);
        const merge = (extremes: [number, number]) => { low = Math.min(low, extremes[0]); high = Math.max(high, extremes[1]); };
        merge(boundary(pathOf(entryBar), a, pathOf(entryBar).length - 1, lot.entry.marketPrice!, copiedBars[entryBar].close)); if (last > entryBar) merge(range(entryBar + 1, last));
        const long = lot.direction === 'long';
        visit(lot.fillIndex, rv(Math.max(0, number(d(long ? lot.entry.price - low : high - lot.entry.price).mul(lot.remaining))), 'currency', basis), rv(Math.max(0, number(d(long ? high - lot.entry.price : lot.entry.price - low).mul(lot.remaining))), 'currency', basis));
      }
    }
  }
  let trough = initial, maxRunup = 0, maxRunupPercent = 0, state = { cash: initial, position: 0 }, peak = initial, peakId: string | null = null, peakForDrawdown = initial, troughId: string | null = null, drawdownPeakId: string | null = null, maxDrawdown = 0, maxDrawdownPercent = 0, closedNet = d(0);
  /* L5 perf: parsed values are hoisted out of the per-bar loop (same values, parsed once per state or bar). Exact memos: flat bars share one marked value per state; the drawdown pair repeats while equity is unchanged; closed net changes only on a closing bar.
     L5b perf: the per-bar arithmetic runs in the exact BigInt emulation of decimal.js at this report's precision (strategy-report-exact.ts: the same correctly rounded results, so the same numbers bit for bit); margin sums convert back to Decimal after the loop. */
  const P = REPORT_PRECISION, HUNDRED_X = exactOf(100), initialX = exactOf(initial), benchmarkEntryX = benchmarkEntry !== null ? exactOf(benchmarkEntry) : null;
  const equity: ReportEquityPoint[] = []; const held = { state: null as { cash: number; position: number } | null, cash: d(0), position: exactOf(0), absolute: exactOf(0), percent: exactOf(0), cashX: exactOf(0) };
  const flat: { state: { cash: number; position: number } | null; value: number } = { state: null, value: 0 }, declineMemo = { peak: NaN, marked: NaN, decline: 0, percent: 0 }, closedNumber: { source: Decimal | null; value: number } = { source: null, value: 0 };
  const margins: Record<StrategyReportSide, { sum: Exact; max: Exact }> = { all: { sum: exactOf(0), max: exactOf(0) }, long: { sum: exactOf(0), max: exactOf(0) }, short: { sum: exactOf(0), max: exactOf(0) } };
  for (let i = 0; i < copiedBars.length; i++) {
    if (!(i % 1024)) yield; step(10); const supplied = ownedAt(rawEquity, i); ownedRecord(supplied, 'Equity row'); if (supplied.barIndex !== i || supplied.time !== copiedBars[i].time) fail('REPORT_EQUITY', 'Equity row does not match its input bar.'); state = endStates.get(i) ?? state; if (held.state !== state) { held.state = state; held.cash = d(state.cash); held.cashX = exactOf(state.cash); held.position = exactOf(state.position); held.absolute = exactOf(Math.abs(state.position)); held.percent = exactOf(state.position >= 0 ? config.marginLongPercent : config.marginShortPercent); } const closeX = exactOf(copiedBars[i].close); const marked = state.position === 0 ? (flat.state === state ? flat.value : (flat.state = state, flat.value = number(held.cash.add(0)))) : exactNumber(exactAdd(held.cashX, exactMul(held.position, closeX, P), P)); near(finite(supplied.cash, 'Equity cash'), state.cash, 'Equity cash'); near(finite(supplied.position, 'Equity quantity'), state.position, 'Equity quantity'); near(finite(supplied.equity, 'Equity'), marked, 'Equity');
    trough = Math.min(trough, marked); if (!(marked - trough < maxRunup - 1e-9 * (1 + Math.abs(marked) + Math.abs(trough)))) maxRunup = Math.max(maxRunup, exactNumber(exactSub(exactOf(marked), exactOf(trough), P))); if (trough > 0 && marked > trough && (marked - trough) / trough * 100 > maxRunupPercent - 1e-6) maxRunupPercent = Math.max(maxRunupPercent, exactNumber(exactMul(exactDiv(exactSub(exactOf(marked), exactOf(trough), P), exactOf(trough), P), HUNDRED_X, P)));
    if (marked > peak) { peak = marked; peakId = copiedIds[i]; } if (declineMemo.peak !== peak || declineMemo.marked !== marked) { declineMemo.peak = peak; declineMemo.marked = marked; declineMemo.decline = exactNumber(exactSub(exactOf(peak), exactOf(marked), P)); declineMemo.percent = exactNumber(exactMul(exactDiv(exactOf(declineMemo.decline), exactOf(peak), P), HUNDRED_X, P)); } const decline = declineMemo.decline, declinePercent = declineMemo.percent; if (decline > maxDrawdown) { maxDrawdown = decline; peakForDrawdown = peak; drawdownPeakId = peakId; troughId = copiedIds[i]; } maxDrawdownPercent = Math.max(maxDrawdownPercent, declinePercent); const closedHere = closedByBar.get(i); if (closedHere !== undefined) closedNet = closedNet.add(closedHere);
    if (state.position) { const margin = exactDiv(exactMul(exactMul(held.absolute, closeX, P), held.percent, P), HUNDRED_X, P); for (const side of ['all', state.position > 0 ? 'long' : 'short'] as const) { const m = margins[side]; m.sum = exactAdd(m.sum, margin, P); if (exactCompare(margin, m.max) > 0) m.max = margin; } }
    const benchmark = benchmarkEntryX !== null && firstOpening && i >= firstOpening.barIndex ? exactNumber(exactDiv(exactMul(initialX, closeX, P), benchmarkEntryX, P)) : null;
    equity.push(Object.freeze({ barIndex: i, barId: copiedIds[i], time: copiedBars[i].time, equity: marked, closedNet: closedNumber.source === closedNet ? closedNumber.value : (closedNumber.source = closedNet, closedNumber.value = number(closedNet)), drawdown: decline, drawdownPercent: declinePercent, buyHoldEquity: benchmark }));
  }
  for (const side of ['all', 'long', 'short'] as const) { sideTotals[side].margin = new D(exactText(margins[side].sum)); sideTotals[side].maxMargin = new D(exactText(margins[side].max)); }
  const closedCounts = new Map<number, { net: number; count: number }>();
  for (const trade of trades) { const row = closedCounts.get(trade.exit.barIndex) ?? { net: 0, count: 0 }; closedCounts.set(trade.exit.barIndex, { net: number(d(row.net).add(trade.netProfit)), count: row.count + 1 }); }
  const periods = buildReportPeriods(initial, equity, closedCounts, context.timezone, () => step()); yield;
  const finalEquity = equity.at(-1)?.equity ?? initial, totalNet = number(sideTotals.all.net.add(sideTotals.all.openGross).sub(sideTotals.all.openFees)); near(finalEquity, number(d(initial).add(totalNet)), 'Closed/open equity');
  const metrics = {} as Record<StrategyReportSide, Readonly<Record<string, ReportValue>>>;
  for (const side of ['all', 'long', 'short'] as const) {
    const t = sideTotals[side], values: Record<string, ReportValue> = {}, sideBasis = `Actual ${side} trades from this run; no separate counterfactual execution.`, set = (key: string, n: number | null, basis = sideBasis, reason: string | null = n === null ? 'The denominator or applicable trade set is empty.' : null) => { const definition = STRATEGY_REPORT_METRICS.find(item => item.key === key)!; values[key] = rv(n, definition.unit, basis, reason); };
    for (const definition of STRATEGY_REPORT_METRICS) values[definition.key] = absent(definition.unit, definition.unavailable ?? 'This metric is not available for the selected direction.');
    set('initialCapital', initial, 'Common original run capital, not a separate allocation.'); set('closedNet', number(t.net)); set('grossProfit', number(t.profit)); set('grossLoss', number(t.loss)); set('commission', number(t.fees), sideBasis + ' Executed fees, including remaining open-entry fees; slippage is already in prices.'); set('closedTrades', t.count); set('openTrades', t.openCount); set('winners', t.wins); set('losers', t.losses); set('evenTrades', t.even);
    set('profitFactor', t.loss.isZero() ? null : number(t.profit.div(t.loss))); set('profitablePercent', t.count ? 100 * t.wins / t.count : null); set('averagePnl', t.count ? number(t.net.div(t.count)) : null); set('expectedPayoff', t.count ? number(t.net.div(t.count)) : null); set('averageProfit', t.wins ? number(t.profit.div(t.wins)) : null); set('averageLoss', t.losses ? number(t.loss.div(t.losses)) : null); set('averageWinLoss', t.wins && t.losses && !t.loss.isZero() ? number(t.profit.div(t.wins).div(t.loss.div(t.losses))) : null); set('largestProfit', t.largestWin); set('largestLoss', t.largestLoss); set('largestProfitShare', t.largestWin === null || t.profit.isZero() ? null : number(d(t.largestWin).div(t.profit).mul(100))); set('largestLossShare', t.largestLoss === null || t.loss.isZero() ? null : number(d(t.largestLoss).div(t.loss).mul(100)));
    set('averageBars', t.count ? t.bars / t.count : null, 'Inclusive exit bar minus entry bar plus one; reference same-bar convention unverified.'); set('averageWinnerBars', t.wins ? t.winBars / t.wins : null, 'Inclusive bar count.'); set('averageLoserBars', t.losses ? t.lossBars / t.losses : null, 'Inclusive bar count.'); set('maxContracts', t.maxContracts, 'Maximum accepted fill-by-fill exposure; intrabar round trips included.'); set('averageMargin', copiedBars.length ? number(t.margin.div(copiedBars.length)) : null, 'Configured margin at every supplied bar close, including flat zero bars; no liquidation model.'); set('maxMargin', copiedBars.length ? number(t.maxMargin) : null, 'Largest configured margin at any supplied bar close for this direction; intrabar margin and liquidation are not modeled.');
    let calls = 0, volume = d(0), largest = d(0);
    for (const order of orders) if (order.id.startsWith(MARGIN_CALL_ORDER_PREFIX) && order.status === 'filled' && (side === 'all' || (order.action === 'sell' ? 'long' : 'short') === side)) { const notional = d(order.quantity).mul(order.fillPrice!); calls++; volume = volume.add(notional); largest = Decimal.max(largest, notional); }
    const liquidationBasis = 'Engine margin-call liquidations of this run (documented emulator formula; OpenCandle timing and rounding conventions in the execution policies). Volume = liquidated units x fill price.';
    set('marginCalls', calls, liquidationBasis); set('liquidatedVolume', number(volume), liquidationBasis + ' Summed over all margin calls.'); set('largestLiquidation', number(largest), liquidationBasis + ' Largest single margin-call event.');
    set('netLargestLoss', t.largestLoss === null ? null : number(t.net.div(t.largestLoss).mul(100)), 'Closed net PnL / |largest losing closed allocation| x 100.', t.largestLoss === null ? 'No losing closed trade exists in this direction.' : null);
    // Percent forms (our own bases; trade Return % is net PnL / entry notional, as in the List of trades).
    const percentOfInitial = 'Amount / common initial capital x 100.', tradeReturns = 'Mean of the trades\' Return % (net PnL / entry notional x 100).';
    set('grossProfitPercent', number(t.profit.div(initial).mul(100)), percentOfInitial); set('grossLossPercent', number(t.loss.div(initial).mul(100)), percentOfInitial); set('openNetPercent', number(t.openGross.sub(t.openFees).div(initial).mul(100)), percentOfInitial + ' Open net includes remaining entry fees.');
    set('averagePnlPercent', t.count ? number(t.returns.div(t.count)) : null, tradeReturns); set('averageProfitPercent', t.wins ? number(t.winReturns.div(t.wins)) : null, tradeReturns + ' Winning trades only.'); set('averageLossPercent', t.losses ? number(t.lossReturns.div(t.losses)) : null, tradeReturns + ' Losing trades only, as a magnitude.');
    set('largestProfitPercent', t.largestWinReturn, 'Largest Return % of a winning trade (it can be a different trade from the largest amount).'); set('largestLossPercent', t.largestLossReturn, 'Largest Return % magnitude of a losing trade (it can be a different trade from the largest amount).');
    set('openGross', number(t.openGross), 'Final execution-series close minus actual entry prices, direction adjusted.'); set('openFees', number(t.openFees), 'Unallocated commissions on still-open entry lots.'); set('openNet', number(t.openGross.sub(t.openFees)), 'OpenCandle open net convention includes remaining entry fees; reference fee treatment unverified.'); set('totalProfit', number(t.net.add(t.openGross).sub(t.openFees)), 'Closed net plus open net.'); set('totalReturn', number(t.net.add(t.openGross).sub(t.openFees).div(initial).mul(100)), 'Total marked PnL / common initial capital.'); set('closedReturn', number(t.net.div(initial).mul(100)), 'Closed net / common initial capital; marked return is separate.');
    if (side === 'all') {
      set('maxRunupPercent', maxRunupPercent, 'Largest rise of closing equity above its lowest prior close, divided by that low, x 100; seeded with initial capital.');
      set('finalEquity', finalEquity); set('maxRunup', maxRunup, 'Largest rise of closing equity above its lowest prior close, seeded with initial capital. Durations and averages of run-up periods remain unavailable.'); set('maxDrawdown', maxDrawdown, 'Prior closing peak to subsequent closing low, seeded with initial capital.'); set('maxDrawdownPercent', maxDrawdownPercent, 'Maximum of each close decline divided by its own previous peak; may occur at a different bar from maximum currency decline.'); set('pathDrawdown', finite(result.metrics.maxIntrabarDrawdown, 'Legacy path drawdown', 0), 'OpenCandle continuous assumed-path peak statistic, distinct from the reference prior-realized-equity formula.');
      const unit = (key: string) => STRATEGY_REPORT_METRICS.find(item => item.key === key)!.unit;
      const episodes = closeEquityEpisodes(initial, copiedBars[0]?.time ?? 0, equity, () => step()), unrecovered = episodes.unrecovered ? ` One unrecovered final decline of ${episodes.unrecovered.amount} is excluded.` : '';
      set('averageRunup', averageOf(episodes.runups.map(row => row.amount)), EPISODE_BASIS + ' Mean of (peak - trough before peak).', episodes.runups.length ? null : 'No close-equity run-up episode occurred.');
      set('averageRunupDuration', averageOf(episodes.runups.map(row => row.seconds)), EPISODE_BASIS + ' Mean of (peak time - trough time), in seconds; displayed as calendar days.', episodes.runups.length ? null : 'No close-equity run-up episode occurred.');
      set('averageDrawdown', averageOf(episodes.drawdowns.map(row => row.amount)), EPISODE_BASIS + ' Mean of (peak - trough) over recovered drawdowns.' + unrecovered, episodes.drawdowns.length ? null : 'No drawdown recovered to its previous peak.' + unrecovered);
      set('averageDrawdownDuration', averageOf(episodes.drawdowns.map(row => row.seconds)), EPISODE_BASIS + ' Mean of (recovery time - peak time) over recovered drawdowns, in seconds; displayed as calendar days.' + unrecovered, episodes.drawdowns.length ? null : 'No drawdown recovered to its previous peak.' + unrecovered);
      const intrabarBasis = 'Per bar in a position: realized-equity term plus units times the adverse (drawdown) or favorable (run-up) price move on the assumed route, clipped at entry and exit. Realized equity includes closed net after fees; the open trade\'s own fees are excluded.';
      if (intrabar.reason) for (const key of ['maxIntrabarDrawdown', 'maxIntrabarDrawdownInitial', 'maxIntrabarRunup', 'maxIntrabarRunupInitial', 'returnDrawdown', 'accountRequired', 'returnAccountRequired']) values[key] = absent(unit(key), intrabar.reason);
      else {
        const drawdown = number(intrabar.drawdown), runup = number(intrabar.runup), account = number(t.maxMargin.add(intrabar.drawdown)), total = t.net.add(t.openGross).sub(t.openFees);
        set('maxIntrabarDrawdown', drawdown, intrabarBasis); set('maxIntrabarDrawdownInitial', number(intrabar.drawdown.div(initial).mul(100)), 'Maximum intrabar drawdown / initial capital x 100.');
        set('maxIntrabarRunup', runup, intrabarBasis); set('maxIntrabarRunupInitial', number(intrabar.runup.div(initial).mul(100)), 'Maximum intrabar run-up / initial capital x 100.');
        set('returnDrawdown', drawdown ? number(total.div(intrabar.drawdown)) : null, 'Total PnL (closed net + open net) / maximum intrabar drawdown.', drawdown ? null : 'Maximum intrabar drawdown is zero.');
        set('accountRequired', account, 'Maximum close margin + |maximum intrabar drawdown|. Margin is sampled at supplied bar closes.');
        set('returnAccountRequired', account ? number(t.net.div(account).mul(100)) : null, 'Closed net PnL / account size required x 100.', account ? null : 'Account size required is zero.');
      }
      const growth = copiedBars.length ? compoundAnnualGrowth(initial, finalEquity, copiedBars[0].time, copiedBars.at(-1)!.time) : { value: null, reason: 'No bars loaded.' };
      set('cagr', growth.value, '((final marked equity / initial capital) ^ (365 / calendar days) - 1) x 100. Days span the first to last supplied bar event times.', growth.reason);
      const ratios = monthlyRatios(initial, monthEndEquity(equity, monthKeyFormatter(context.timezone), () => step()), DEFAULT_ANNUAL_RISK_FREE_PERCENT), ratioBasis = `Simple returns of close equity at each calendar month's last supplied bar in ${context.timezone}, starting from initial capital; partial first/last months included. Risk-free rate ${DEFAULT_ANNUAL_RISK_FREE_PERCENT}% annual / 12 per month. N=${ratios.returns.length}.`;
      set('sharpe', ratios.sharpe, ratioBasis + ' (MR - RFR) / population standard deviation.', ratios.sharpeReason);
      set('sortino', ratios.sortino, ratioBasis + ' (MR - RFR) / sqrt(sum(min(0, X - RFR)^2) / N); OpenCandle uses the risk-free rate as the target return.', ratios.sortinoReason);
      if (benchmarkEntry !== null && lastMark !== null) { const gain = d(lastMark).div(benchmarkEntry).sub(1), pnl = gain.mul(initial); set('buyHoldPnl', number(pnl), benchmarkPolicy); set('buyHoldPercent', number(gain.mul(100)), benchmarkPolicy); set('outperformance', number(t.net.sub(pnl)), benchmarkPolicy + ' Closed net minus benchmark.'); set('outperformancePoints', number(t.net.div(initial).sub(gain).mul(100)), 'Percentage-point difference: closed return on initial capital minus benchmark gain.'); }
      else for (const key of ['buyHoldPnl', 'buyHoldPercent', 'outperformance', 'outperformancePoints']) values[key] = absent(STRATEGY_REPORT_METRICS.find(item => item.key === key)!.unit, 'No opening fill with captured pre-slippage market mark is available.');
    }
    metrics[side] = Object.freeze(values);
  }
  const diagnostics = ownedArray<string>(result.diagnostics, 'Execution diagnostics', 100000), policies = ownedArray<string>(result.policies, 'Execution policies', 64), copiedDiagnostics: string[] = [], copiedPolicies: string[] = [];
  for (let i = 0; i < diagnostics.length; i++) { step(); copiedDiagnostics.push(text(ownedAt(diagnostics, i), 'Execution diagnostic', 4096, true)); if (!(i % 2048)) yield; }
  for (let i = 0; i < policies.length; i++) copiedPolicies.push(text(ownedAt(policies, i), 'Execution policy', 4096));
  copiedPolicies.push('All values are virtual. Bar timestamps identify source events, not exact intrabar execution times.', benchmarkPolicy, 'Trade counts represent FIFO closed allocations. Partial-close grouping and excursion commission conventions remain unverified against the reference.', 'Unavailable reference metrics are retained with reasons. The close-equity series is the full actual run, not a direction-only rerun.', 'Report display controls do not rerun the strategy. Exports contain the accepted result identity and all available columns.');
  // Analyses: trade distribution, modeled margin usage, growth/decline periods and benchmark comparison (bounded).
  const rpst = buildRpstAnalysis({ initial, startTime: copiedBars[0]?.time ?? 0, closes: copiedBars.map(bar => bar.close), positions: equity.map((point, index) => ({ barIndex: index, time: point.time, position: (ownedAt(rawEquity, index) as { position: number }).position })), equity, trades: trades.map(trade => ({ direction: trade.direction, quantity: trade.quantity, entryPrice: trade.entryPrice, netProfit: trade.netProfit, entryBar: trade.entry.barIndex, exitBar: trade.exit.barIndex })), openEntryBars: openLots.map(lot => lot.entry.barIndex), marginLongPercent: config.marginLongPercent, marginShortPercent: config.marginShortPercent }); step(copiedBars.length);
  const report: StrategyReport = Object.freeze({ schemaVersion: 1, context: Object.freeze(context), config: Object.freeze({ ...config, commission: Object.freeze({ ...config.commission }) }), fillBasis: config.fillBasis, trades: Object.freeze(trades), openLots: Object.freeze(openLots), orders: Object.freeze(orders), equity: Object.freeze(equity), metrics: Object.freeze(metrics), benchmark: Object.freeze({ start: firstLocation, entryMark: benchmarkEntry, lastMark, policy: benchmarkPolicy }), drawdown: Object.freeze({ amount: maxDrawdown, percent: peakForDrawdown ? number(d(maxDrawdown).div(peakForDrawdown).mul(100)) : 0, peakBarId: drawdownPeakId, troughBarId: troughId, peakEquity: peakForDrawdown }), analysis: Object.freeze({ basis: REPORT_ANALYSIS_BASIS, timezone: context.timezone, periods, rpst, sides: Object.freeze(Object.fromEntries((['all', 'long', 'short'] as const).map(side => { const run = runs[side], t = sideTotals[side]; return [side, Object.freeze({ outcomes: Object.freeze({ trades: t.count, wins: t.wins, losses: t.losses, even: t.even, winShare: t.count ? 100 * t.wins / t.count : null, lossShare: t.count ? 100 * t.losses / t.count : null, evenShare: t.count ? 100 * t.even / t.count : null }), streaks: Object.freeze({ longestWins: run.longestWins, longestLosses: run.longestLosses, bestWinRun: run.bestWinRun, worstLossRun: run.worstLossRun, finalKind: run.kind, finalCount: run.count }), hour: freezeBuckets(run.hour), weekday: freezeBuckets(run.weekday), month: freezeBuckets(run.month) })]; })) as Record<StrategyReportSide, ReportSideAnalysis>) }), policies: Object.freeze(copiedPolicies), diagnostics: Object.freeze(copiedDiagnostics), work });
  reports.add(report); return report;
}

/** Synchronous host/test entry point; the UI uses the cooperative async runner. */
export function buildStrategyReport(input: StrategyReportInput): StrategyReport { const steps = reportSteps(prepareInput(input)); for (;;) { const next = steps.next(); if (next.done) return next.value; } }
export async function buildStrategyReportAsync(input: StrategyReportInput): Promise<StrategyReport> { const steps = reportSteps(prepareInput(input)); for (;;) { const next = steps.next(); if (next.done) return next.value; await new Promise<void>(resolve => setTimeout(resolve, 0)); } }
