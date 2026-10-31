import Decimal from 'decimal.js';
import type { Bar, StrategyFillBasis } from './types';
import type { PaperCommission } from './paper';
import { validateStrategyDateRange, type StrategyDateRange } from './strategy-date-range';

const D = Decimal.clone({ precision: 32, rounding: Decimal.ROUND_HALF_EVEN });
const decimal = (value: number) => new D(value);
const value = (number: Decimal) => number.toDecimalPlaces(10).toNumber();
export interface StrategyOrderIntent {
  id?: string; action: 'buy' | 'sell' | 'close' | 'cancel' | 'exit'; quantity?: number; type?: 'market' | 'limit' | 'stop' | 'stop-limit' | 'trailing-stop'; limitPrice?: number; stopPrice?: number; reduceOnly?: boolean; targetOrderId?: string;
  /** Exit bracket: take-profit limit and/or stop-loss stop for `quantity` (or the whole unreserved position). */
  profitPrice?: number; lossPrice?: number;
  /**
   * Modelled on the documented Pine Script strategy order-id behaviour: the shown name and
   * reference key of a buy/sell or exit. A newer same-name order replaces a still-working one, a newer same-name exit
   * replaces its bracket (an identical one is kept), and cancel (`targetName`) and exit (`fromEntry`) address it.
   */
  name?: string; targetName?: string;
  /** Exit: the entry (name or order identity) this exit protects. While that entry is still working, the exit waits and arms when it fills. */
  fromEntry?: string;
  /** Exit: take-profit and stop-loss distances in ticks from the entry price (the named entry's fill, else the open position's average price). */
  profitTicks?: number; lossTicks?: number;
  /** Exit trailing stop: activation at `trailPrice`, or `trailTicks` beyond the entry price; it then trails the best price by `trailOffsetTicks`. */
  trailPrice?: number; trailTicks?: number; trailOffsetTicks?: number;
  /** Exit: percent of the covered quantity, rounded down to the lot size. */
  quantityPercent?: number;
  /** One-cancels-all group. 'cancel': a fill cancels the other members; 'reduce': a fill reduces them by its quantity; 'none': no link. */
  ocaName?: string; ocaType?: 'cancel' | 'reduce' | 'none';
  /**
   * Modelled on the documented Pine Script strategy.entry behaviour, buy and sell only:
   * - `entry`: a strategy entry. When it fills against an opposite position it also closes that position (a reversal: the
   *   fill quantity grows by the open units). An entry in the direction of a position already at the pyramiding limit is
   *   not placed (counted in one diagnostic). Its stop and limit prices are used as given, without tick alignment.
   * - `closeOnly`: closes the whole open position on its side (a sell closes a long, a buy closes a short), sized at the
   *   fill. With nothing to close on that side it is not placed, or is cancelled at the fill.
   */
  entry?: boolean; closeOnly?: boolean;
}
/** Default order size (fixed, cash or percent of equity), used when an entry intent omits quantity. */
export interface StrategySizing { kind: 'contracts' | 'cash' | 'percent-of-equity'; value: number }
/** Recalculate-after-fill context. Only completed bars and the current bar up to the fill are visible. */
export interface StrategyFillContext { barIndex: number; fill: Readonly<StrategyFill>; position: number; completedBars: readonly Bar[]; currentBar: Readonly<{ time: number; open: number; high: number; low: number; price: number }>;
  /** The average fill price of the open units after this fill (null when flat) and the number of open trades (FIFO lots). */
  averagePrice: number | null; openTrades: number;
  /** This fill's ordinal among the recalculated fills of its bar (0 for the first). */
  ordinal: number }
/**
 * The engine's actual position, as a strategy sees it at a bar's close (after that bar's fills, before its
 * own new orders). The Strategy tester feeds it back to a script as `ctx.strategy` (src/strategy-report/feedback.ts).
 */
export interface StrategyPositionState { barIndex: number; position: number; averagePrice: number | null; openTrades: number }
export interface StrategySignal { barIndex: number; orders: StrategyOrderIntent[]; sourceEventId?: string; sourceRevision?: number; }
export interface StrategyConfig {
  initialCapital: number; commission: PaperCommission; slippageTicks: number; tickSize: number; lotSize: number;
  processOrdersOnClose: boolean; fillBasis: StrategyFillBasis; chartType: 'standard' | 'heikin-ashi' | 'renko' | 'range' | 'kagi' | 'line-break' | 'point-and-figure' | 'other';
  marginLongPercent: number; marginShortPercent: number; pyramiding: number; limitVerifyTicks: number;
  calcOnEveryTick: boolean; calcOnOrderFills: boolean; barMagnifier: boolean;
  /** Optional; absent means each entry intent supplies its quantity (the existing contract). */
  defaultQuantity?: StrategySizing;
  /**
   * The account currency the report shows its values in. Absent is "Default", the symbol
   * currency. 'USD' converts from the symbol currency; OpenCandle loads no exchange rates, so that conversion exists only
   * for USD symbols. The engine itself computes in the symbol currency either way.
   */
  accountCurrency?: 'USD';
  /** The Strategy tester date range (src/domain/strategy-date-range.ts). Absent is Entire history. The report host slices bars to it; the engine never reads it. */
  dateRange?: StrategyDateRange;
  /**
   * Semantics: orders a script proposes at a bar's close are
   * placed at the close of the bar this many bars later, sized there, and fill from then on as if proposed there.
   * Absent or 0 is no delay (results unchanged). onFill orders are not delayed.
   */
  orderDelayBars?: number;
}
export interface StrategyOrder extends StrategyOrderIntent { id: string; action: 'buy' | 'sell'; quantity: number; type: 'market' | 'limit' | 'stop' | 'stop-limit' | 'trailing-stop'; createdBar: number; eligibleBar: number; status: 'working' | 'triggered' | 'filled' | 'cancelled' | 'rejected'; fillBar: number | null; fillPrice: number | null; reason?: string; /** Readable signal name shown to people (caller id, Entry N, Close N, Exit N take profit/stop loss, Margin call N). */ label?: string; /** An unnamed reversal's two parts (the closed trade's exit and the new position's entry). */ exitLabel?: string; entryLabel?: string; }
export interface StrategyFill { orderId: string; side: 'buy' | 'sell'; quantity: number; price: number; commission: number; barIndex: number; time: number; phase: 'open' | 'intrabar' | 'close'; basis: StrategyFillBasis; marketPrice?: number; routeSegment?: number; routeBasis?: 'ohlc-nearest-extreme-low-tie-v1' | 'lower-timeframe-ohlc-v1'; }
export interface StrategyTrade { entryOrderId: string; exitOrderId: string; direction: 'long' | 'short'; quantity: number; entryPrice: number; exitPrice: number; entryBar: number; exitBar: number; grossProfit: number; commission: number; netProfit: number; barsHeld: number; }
export interface StrategyEquityPoint { barIndex: number; time: number; cash: number; position: number; equity: number; drawdown: number; drawdownPercent: number; }
export interface StrategyMetrics {
  initialCapital: number; finalEquity: number; netProfitClosed: number; openProfit: number; totalProfit: number; returnPercent: number;
  closedTrades: number; winningTrades: number; losingTrades: number; evenTrades: number; percentProfitable: number | null;
  grossProfit: number; grossLoss: number; profitFactor: number | null; averageTrade: number | null; largestWinningTrade: number | null; largestLosingTrade: number | null;
  totalCommission: number; maxDrawdown: number; maxDrawdownPercent: number; maxIntrabarDrawdown: number; maxIntrabarDrawdownPercent: number;
  buyHoldReturnPercent: number | null; maxConsecutiveWins: number; maxConsecutiveLosses: number;
}
export interface StrategyResult { ok: boolean; config: StrategyConfig; orders: StrategyOrder[]; fills: StrategyFill[]; trades: StrategyTrade[]; equity: StrategyEquityPoint[]; metrics: StrategyMetrics; diagnostics: string[]; policies: string[]; execution: { barsProcessed: number; orderEvaluations: number; maxOrderEvaluations: number; /** Execution bars routed through lower-timeframe bars (Bar Magnifier on). */ magnifiedBars?: number; magnifierCoverage?: MagnifierCoverage }; }
interface Lot { orderId: string; quantity: number; price: number; entryBar: number; remainingCommission: number; }
export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = { initialCapital: 1000000, commission: { kind: 'fixed', value: 0 }, slippageTicks: 0, tickSize: 0.01, lotSize: 1, processOrdersOnClose: false, fillBasis: 'chart-prices', chartType: 'standard', marginLongPercent: 100, marginShortPercent: 100, pyramiding: 1, limitVerifyTicks: 0, calcOnEveryTick: false, calcOnOrderFills: false, barMagnifier: false };
export const MAX_STRATEGY_ORDER_EVALUATIONS = 2000000;
/** Largest order execution delay in bars (our own bound). */
export const MAX_ORDER_DELAY_BARS = 1000;
/** The policy line a delayed run carries. */
export const orderDelayPolicy = (bars: number, dropped: number) => `Order execution delay: orders proposed at a bar's close are placed ${bars} bar${bars === 1 ? '' : 's'} later, at that bar's close, and sized and filled from there.${dropped ? ` ${dropped} proposal${dropped === 1 ? '' : 's'} fell past the last bar and ${dropped === 1 ? 'was' : 'were'} not placed.` : ''} Orders from onFill are not delayed.`;
/** Chart style id to the strategy chartType link (renko, range, kagi, line-break, point-and-figure; Heikin Ashi as before). */
export function strategyChartTypeForStyle(style: string): StrategyConfig['chartType'] {
  return ({ heikinashi: 'heikin-ashi', renko: 'renko', range: 'range', kagi: 'kagi', linebreak: 'line-break', pointfigure: 'point-and-figure' } as Record<string, StrategyConfig['chartType']>)[style] ?? 'standard';
}
/** Engine-generated margin-call liquidation orders use this reserved identity prefix; caller intents may not. */
export const MARGIN_CALL_ORDER_PREFIX = 'lv-margin-call-';
/** Documented broker-emulator multiplier: a margin call liquidates four times the units needed to cover the loss. */
export const MARGIN_CALL_MULTIPLIER = 4;
export const STRATEGY_POLICIES = [
  'Signals are available only at their declared completed bar. Default market execution is the next bar open.',
  'Nonstandard-chart strategies default to chart prices, including synthetic prices. Heikin-Ashi may explicitly use matching standard OHLC; display-scale price settings never change fills.',
  'The assumed intrabar route is open-high-low-close when open is closer to high, otherwise open-low-high-close. Equal-distance ties choose low first as an OpenCandle policy pending reference comparison.',
  'Gap-crossed orders execute at the next open when eligible. Limit verification requires penetration by configured ticks; a verified intrabar limit fills at its limit price.',
  'Market and stop-market fills include configured adverse slippage. Limit and stop-limit fills do not add slippage.',
  'FIFO lots allocate entry/exit virtual commissions to partial closed trades. Open profit includes remaining entry commissions.',
  'Drawdown is reported separately for bar closes and the assumed intrabar route. Neither proves actual tick-by-tick historical risk.',
  'Full quantity fills ignore actual book liquidity, queue priority and partial liquidity fills. Borrow fees and currency conversion are not modeled.',
  'Margin calls follow the documented emulator formula at every evaluated price of the assumed route, after working orders: available funds = equity - |position| x price x margin%; when negative, cover = truncate(|available / margin% / price|) to the lot size (at least one lot), and four times the cover (capped at the position) is liquidated as a market order with configured slippage and commission.',
  'Recalculation on every tick or fill, and Bar Magnifier, require additional event data and executable callbacks; unsupported requests are rejected.',
  'All orders, capital, commissions and performance are simulated. No funding, billing or broker connection exists.',
  'Execution stops with an error when the working-order evaluation budget is exhausted. Partial results are not a completed backtest.',
];

/** Recalculate on every tick policy lines (our own wording). They also mark a saved report that ran with the setting on. */
export const STRATEGY_EVERY_TICK_POLICIES = Object.freeze({
  historical: 'Recalculate on every tick: historical bars calculate once, at their close, exactly as with the setting off. No still-forming realtime bar was in this run.',
  forming: 'Recalculate on every tick: the last bar is the still-forming realtime bar at its latest update. Its proposals and fills use the open, high, low and price seen so far, so they repaint until the bar closes. Historical bars calculate once, at their close.',
});
/** The policy line that marks a run with the Bar Magnifier on (a saved report restores the setting only with it). */
export const STRATEGY_MAGNIFIER_POLICY_PREFIX = 'Bar Magnifier routes each execution bar';
function finitePositive(input: unknown): input is number { return typeof input === 'number' && Number.isFinite(input) && input > 0; }
const validStrategyBar = (bar: Bar | undefined) => !!bar && [bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) && Math.min(bar.open, bar.high, bar.low, bar.close) > 0 && bar.high >= Math.max(bar.open, bar.close, bar.low) && bar.low <= Math.min(bar.open, bar.close, bar.high) && bar.volume >= 0;
/**
 * Bar Magnifier coverage. 'all' (the strict contract) refuses the run unless every execution bar has
 * lower-timeframe bars that reproduce its OHLC. 'available' (the Strategy tester) routes each reproducing bar through its
 * lower-timeframe bars and keeps the OHLC route for the others (counted in the policies). Missing data is
 * never manufactured either way.
 */
export type MagnifierCoverage = 'all' | 'available';
export const MAX_MAGNIFIER_BARS = 2000000;
/** Lower-timeframe bars per execution bar: those timed in [bar time, next bar time). Null marks a bar that keeps the OHLC route. */
export function magnifierGroups(bars: readonly Bar[], lower: readonly Bar[], coverage: MagnifierCoverage = 'all'): { groups: (Bar[] | null)[]; diagnostics: string[] } {
  const diagnostics: string[] = [], groups: (Bar[] | null)[] = bars.map(() => null);
  if (lower.length > MAX_MAGNIFIER_BARS) return { groups, diagnostics: [`Bar Magnifier input exceeds ${MAX_MAGNIFIER_BARS} lower-timeframe bars.`] };
  let cursor = 0;
  for (let i = 0; i < bars.length && !diagnostics.length; i++) {
    const end = i + 1 < bars.length ? bars[i + 1].time : Infinity, group: Bar[] = [];
    if (coverage === 'available') while (cursor < lower.length && lower[cursor].time < bars[i].time) cursor++;
    else if (cursor < lower.length && lower[cursor].time < bars[i].time) { diagnostics.push(`Bar Magnifier bar at ${lower[cursor].time} lies outside the execution bars.`); break; }
    while (cursor < lower.length && lower[cursor].time < end) { const sub = lower[cursor]; if (!validStrategyBar(sub) || cursor > 0 && sub.time <= lower[cursor - 1].time) { diagnostics.push(`Invalid Bar Magnifier bar at index ${cursor}.`); break; } group.push(sub); cursor++; }
    if (diagnostics.length) break;
    const bar = bars[i], reproduces = group.length > 0 && group[0].open === bar.open && group.at(-1)!.close === bar.close && group.reduce((high, row) => Math.max(high, row.high), -Infinity) === bar.high && group.reduce((low, row) => Math.min(low, row.low), Infinity) === bar.low;
    if (reproduces) groups[i] = group;
    else if (coverage === 'all') diagnostics.push(group.length ? `Bar Magnifier data does not reproduce execution bar ${i} OHLC; it must be the same instrument and price basis.` : `Bar Magnifier has no lower-timeframe data for execution bar ${i}. Missing data is never manufactured.`);
  }
  return { groups, diagnostics };
}
/** The assumed route through one bar (open, nearer extreme, farther extreme, close; equal distance takes the low first). */
export function strategyBarRoute(row: Bar): number[] { return Math.abs(row.open - row.high) < Math.abs(row.open - row.low) ? [row.open, row.high, row.low, row.close] : [row.open, row.low, row.high, row.close]; }
/** A magnified bar's route points: each lower-timeframe bar's four route points in time order (segment 4k is the gap into bar k). */
export function magnifiedRoute(group: readonly Bar[]): number[] { return group.flatMap(strategyBarRoute); }
function validateConfig(config: StrategyConfig, available: StrategyCapabilities = {}): string[] {
  const diagnostics: string[] = [];
  if (!finitePositive(config.initialCapital) || config.initialCapital > 1e12) diagnostics.push('Initial capital must be positive and at most 1000000000000.');
  for (const [key, input] of [['tickSize', config.tickSize], ['lotSize', config.lotSize]] as const) if (!finitePositive(input) || decimal(input).decimalPlaces() > 8) diagnostics.push(`${key} must be positive with at most eight decimal places.`);
  for (const [key, input] of [['slippageTicks', config.slippageTicks], ['limitVerifyTicks', config.limitVerifyTicks], ['pyramiding', config.pyramiding]] as const) if (!Number.isSafeInteger(input) || input < 0 || input > 100000) diagnostics.push(`${key} is outside the supported integer range.`);
  if (!['fixed', 'percent', 'per-unit'].includes(config.commission.kind) || !Number.isFinite(config.commission.value) || config.commission.value < 0) diagnostics.push('Virtual commission must be nonnegative.');
  for (const input of [config.marginLongPercent, config.marginShortPercent]) if (!finitePositive(input) || input > 100) diagnostics.push('Margin percentages must be greater than zero and at most 100.');
  if (!['chart-prices', 'standard-ohlc'].includes(config.fillBasis)) diagnostics.push('Unsupported fill-price basis.');
  if (!['standard', 'heikin-ashi', 'renko', 'range', 'kagi', 'line-break', 'point-and-figure', 'other'].includes(config.chartType)) diagnostics.push('Unsupported chart type.');
  for (const key of ['processOrdersOnClose', 'calcOnEveryTick', 'calcOnOrderFills', 'barMagnifier'] as const) if (typeof config[key] !== 'boolean') diagnostics.push(`${key} must be a boolean.`);
  if (config.fillBasis === 'standard-ohlc' && !['standard', 'heikin-ashi'].includes(config.chartType)) diagnostics.push('Standard OHLC execution is implemented only for standard or matching Heikin-Ashi bars.');
  if (config.defaultQuantity !== undefined) {
    const sizing = config.defaultQuantity;
    if (!sizing || typeof sizing !== 'object' || !['contracts', 'cash', 'percent-of-equity'].includes(sizing.kind) || !finitePositive(sizing.value)) diagnostics.push('Default order size needs a type (contracts, cash or percent of equity) and a positive value.');
    else if (sizing.kind === 'percent-of-equity' && sizing.value > 100) diagnostics.push('Percent of equity order size must be at most 100.');
    else if (sizing.kind === 'contracts' && !decimal(sizing.value).mod(config.lotSize).isZero()) diagnostics.push('Default contract quantity must be a multiple of the lot size.');
  }
  if (config.orderDelayBars !== undefined && (!Number.isSafeInteger(config.orderDelayBars) || config.orderDelayBars < 0 || config.orderDelayBars > MAX_ORDER_DELAY_BARS)) diagnostics.push(`Order execution delay must be a whole number of bars from 0 to ${MAX_ORDER_DELAY_BARS}.`);
  if (config.accountCurrency !== undefined && config.accountCurrency !== 'USD') diagnostics.push('Account currency must be Default (the symbol currency) or USD.');
  diagnostics.push(...validateStrategyDateRange(config.dateRange));
  const missing = [config.calcOnEveryTick && !available.everyTick ? 'Recalculation on every tick needs realtime ticks; historical bars calculate once per bar, and this local engine receives no realtime ticks.' : '', config.calcOnOrderFills && !available.afterFill ? 'Recalculate after order is filled needs an executable strategy callback in this request.' : '', config.barMagnifier && !available.magnifier ? 'Bar Magnifier needs actual lower-timeframe history for every bar; none was supplied, and it is never manufactured.' : ''].filter(Boolean);
  if (missing.length) diagnostics.push('Tick/fill recalculation and Bar Magnifier require data/callbacks not present in this execution request. ' + missing.join(' '));
  return diagnostics;
}
export interface StrategyCapabilities { everyTick?: boolean; afterFill?: boolean; magnifier?: boolean }
/** A request with no bars validates configuration only (Apply, saved workspaces); the data each mode needs is checked when bars are supplied. */
const CONFIGURATION_ONLY: StrategyCapabilities = Object.freeze({ everyTick: true, afterFill: true, magnifier: true });
/** Configuration-only validation used by Properties before Apply. It never reads or executes history. `available` declares inputs the host will supply. */
export function validateStrategyConfig(config: StrategyConfig, available: StrategyCapabilities = {}): string[] {
  try { return validateConfig({ ...DEFAULT_STRATEGY_CONFIG, ...config, commission: { ...(config.commission ?? DEFAULT_STRATEGY_CONFIG.commission) } }, available); }
  catch { return ['Strategy properties are malformed.']; }
}

/** Max same-bar recalculations after fills per bar (our own bound; the reference limit is unresolved). */
/**
 * Largest order quantity in units, for explicit, contract and resolved cash/percent sizes alike. No
 * reference fact sets a unit cap; 1e12 admits sub-cent crypto sizes at the 1e12 initial-capital bound while keeping
 * Decimal arithmetic and report transport bounded.
 */
export const MAX_ORDER_QUANTITY = 1e12;
/** The name a person sees for an order. Generated identities never surface; older results without a label get a generic word. */
export function strategyOrderLabel(order: { id: string; label?: string; entryLabel?: string; exitLabel?: string }, role?: 'entry' | 'exit'): string {
  if (role === 'entry' && order.entryLabel) return order.entryLabel;
  if (role === 'exit' && order.exitLabel) return order.exitLabel;
  if (typeof order.label === 'string' && order.label) return order.label;
  if (order.id.startsWith(MARGIN_CALL_ORDER_PREFIX)) return `Margin call ${order.id.slice(MARGIN_CALL_ORDER_PREFIX.length)}`;
  if (/^strategy-order-\d+$/.test(order.id)) return 'Entry';
  const exit = /^strategy-exit-\d+(?::(profit|loss|trail))?$/.exec(order.id); if (exit) return exit[1] ? `Exit ${EXIT_LEG_WORDS[exit[1] as ExitLeg]}` : 'Exit';
  return order.id;
}
type ExitLeg = 'profit' | 'loss' | 'trail';
const EXIT_LEG_WORDS: Record<ExitLeg, string> = { profit: 'take profit', loss: 'stop loss', trail: 'trailing stop' };
/** Shapes generated labels take (Entry N, Exit N [take profit|stop loss|trailing stop], Exit N and Entry M, Order N, Margin call N). */
const GENERATED_LABEL = /^(entry|exit|order|margin call) \d+( take profit| stop loss| trailing stop| and entry \d+)?$/i;
/**
 * A caller name that reads like a generated label, or already ends in "(script)" /
 * "(script N)", is shown as "<base> (script)"; a repeat of the same base gets "(script 2)", "(script 3)" and so on,
 * compared case-insensitively, so shown names never collide with generated labels or with each other. One namer per run.
 */
function createCallerNamer(): { caller: (name: string) => string; composed: (label: string) => string } {
  const used = new Set<string>();
  const unique = (base: string, first: string) => { let candidate = first; for (let count = 2; used.has(candidate.toLowerCase()); count++) candidate = `${base} (script ${count})`; used.add(candidate.toLowerCase()); return candidate; };
  return {
    // A caller name: suffixed when it reads like a generated label, already carries "(script)", or repeats a shown name.
    caller: name => { const base = name.replace(/ \(script(?: \d+)?\)$/i, ''); if (base === name && !GENERATED_LABEL.test(base) && !used.has(name.toLowerCase())) { used.add(name.toLowerCase()); return name; } return unique(base, `${base} (script)`); },
    // A label composed from a shown name (exit legs) is claimed in the same set, so it cannot equal a caller name.
    composed: label => unique(label, label),
  };
}
const grouped = (amount: number) => amount.toLocaleString('en-US', { maximumFractionDigits: 12 });
export const MAX_FILL_RECALCULATIONS_PER_BAR = 100;
export function backtestStrategy(input: {
  bars: readonly Bar[]; signals: readonly StrategySignal[]; config?: Partial<StrategyConfig>; standardBars?: readonly Bar[]; barIds?: readonly string[]; barRevisions?: readonly number[]; maxOrderEvaluations?: number;
  /** Actual lower-timeframe bars (same instrument and price basis) covering every execution bar. */
  magnifierBars?: readonly Bar[];
  /** 'all' (default) refuses the run unless every bar is covered; 'available' keeps the OHLC route for uncovered bars. */
  magnifierCoverage?: MagnifierCoverage;
  /** Where the lower-timeframe bars came from, named in the policies (for example "SPY 5m from Alpaca"). */
  magnifierLabel?: string;
  /**
   * Recalculate on every tick: the host's realtime handling. `formingBar` is true when the last supplied bar is the
   * still-forming live bar, included at its latest update because Recalculate on every tick is on.
   */
  everyTick?: { formingBar: boolean };
  /** Strategy callback re-run after each fill; returned intents may fill later on the same bar. */
  onFill?: (context: StrategyFillContext) => readonly StrategyOrderIntent[];
  /** Called at each bar's close with the actual position, after that bar's fills and before its signals are placed. */
  observePosition?: (state: Readonly<StrategyPositionState>) => void;
  /** True when the last supplied bar is a still-forming live bar: it is dropped (with its signals, ids, revisions and magnifier bars) so no order is evaluated or filled on it. */
  excludeFormingBar?: boolean;
}): StrategyResult {
  if (input.excludeFormingBar && input.bars.length) {
    const cut = input.bars.length - 1, formingTime = input.bars[cut].time;
    input = { ...input, excludeFormingBar: false, bars: input.bars.slice(0, cut), standardBars: input.standardBars?.slice(0, cut), barIds: input.barIds?.slice(0, cut), barRevisions: input.barRevisions?.slice(0, cut), signals: input.signals.filter(signal => signal.barIndex < cut), magnifierBars: input.magnifierBars?.filter(bar => bar.time < formingTime) };
  }
  const config: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, ...input.config, commission: { ...(input.config?.commission ?? DEFAULT_STRATEGY_CONFIG.commission) } };
  if (config.defaultQuantity) config.defaultQuantity = { ...config.defaultQuantity };
  const emptyMetrics: StrategyMetrics = { initialCapital: config.initialCapital, finalEquity: config.initialCapital, netProfitClosed: 0, openProfit: 0, totalProfit: 0, returnPercent: 0, closedTrades: 0, winningTrades: 0, losingTrades: 0, evenTrades: 0, percentProfitable: null, grossProfit: 0, grossLoss: 0, profitFactor: null, averageTrade: null, largestWinningTrade: null, largestLosingTrade: null, totalCommission: 0, maxDrawdown: 0, maxDrawdownPercent: 0, maxIntrabarDrawdown: 0, maxIntrabarDrawdownPercent: 0, buyHoldReturnPercent: null, maxConsecutiveWins: 0, maxConsecutiveLosses: 0 };
  const maxOrderEvaluations = input.maxOrderEvaluations ?? MAX_STRATEGY_ORDER_EVALUATIONS;
  const result: StrategyResult = { ok: false, config, orders: [], fills: [], trades: [], equity: [], metrics: emptyMetrics, diagnostics: validateConfig(config, input.bars.length ? { afterFill: typeof input.onFill === 'function', magnifier: !!input.magnifierBars, everyTick: !!input.everyTick && typeof input.everyTick.formingBar === 'boolean' } : CONFIGURATION_ONLY), policies: [...STRATEGY_POLICIES], execution: { barsProcessed: 0, orderEvaluations: 0, maxOrderEvaluations } };
  if (config.defaultQuantity && config.defaultQuantity.kind !== 'contracts') result.policies.push('Cash and percent-of-equity sizes use the signal bar: allocation (cash, or that percent of strategy equity at the signal close) divided by the signal close (the current price on a still-forming bar or after a fill), rounded down to the lot size. The order still fills at its own fill price, so a gap moves the filled notional away from the target. Below one lot the order is rejected.');
  if (config.barMagnifier) result.policies.push('Bar Magnifier routes each execution bar through the supplied lower-timeframe bars in time order, each with the OHLC route assumption. Gaps between lower-timeframe bars fill at the next lower-timeframe open.');
  if (config.calcOnEveryTick) result.policies.push(input.everyTick?.formingBar ? STRATEGY_EVERY_TICK_POLICIES.forming : STRATEGY_EVERY_TICK_POLICIES.historical);
  if (config.calcOnOrderFills) result.policies.push(`After each fill the strategy callback sees completed bars and the current bar only up to the fill price; at most ${MAX_FILL_RECALCULATIONS_PER_BAR} recalculations per bar.`);
  if (!Number.isSafeInteger(maxOrderEvaluations) || maxOrderEvaluations < 1 || maxOrderEvaluations > MAX_STRATEGY_ORDER_EVALUATIONS) result.diagnostics.push(`Order-evaluation budget must be between one and ${MAX_STRATEGY_ORDER_EVALUATIONS}.`);
  const bars = config.fillBasis === 'standard-ohlc' && config.chartType === 'heikin-ashi' ? input.standardBars : input.bars;
  if (!bars || bars.length !== input.bars.length) result.diagnostics.push('Standard execution bars must match the signal bar count.');
  if (input.bars.length > 200000) result.diagnostics.push('This execution request exceeds 200000 supplied bars. Split the workload with explicit state checkpoints.');
  if (input.barIds && (input.barIds.length !== input.bars.length || new Set(input.barIds).size !== input.barIds.length)) result.diagnostics.push('Stable source bar identities must be unique and match the supplied count.');
  if (input.barRevisions && (input.barRevisions.length !== input.bars.length || input.barRevisions.some(revision => !Number.isSafeInteger(revision) || revision < 0))) result.diagnostics.push('Source bar revisions must be nonnegative integers and match the supplied count.');
  const validBar = validStrategyBar;
  for (let i = 0; i < input.bars.length; i++) if (!validBar(input.bars[i]) || i > 0 && input.bars[i].time < input.bars[i - 1].time) { result.diagnostics.push(`Invalid signal bar at index ${i}.`); break; }
  if (bars) for (let i = 0; i < bars.length; i++) {
    const bar = bars[i], signalBar = input.bars[i];
    if (!validBar(bar) || !signalBar || i > 0 && bar.time < bars[i - 1].time || bar.time !== signalBar.time) { result.diagnostics.push(`Invalid or misaligned execution bar at index ${i}.`); break; }
  }
  let magnifier: (Bar[] | null)[] | null = null;
  if (config.barMagnifier && input.magnifierBars && bars && !result.diagnostics.length) {
    const coverage: MagnifierCoverage = input.magnifierCoverage === 'available' ? 'available' : 'all';
    if (input.magnifierCoverage !== undefined && !['all', 'available'].includes(input.magnifierCoverage)) result.diagnostics.push('Bar Magnifier coverage must be all or available.');
    const grouped = magnifierGroups(bars, input.magnifierBars, coverage);
    result.diagnostics.push(...grouped.diagnostics); magnifier = grouped.groups;
    const magnified = magnifier.filter(Boolean).length; result.execution.magnifiedBars = magnified; result.execution.magnifierCoverage = coverage;
    if (coverage === 'available') result.policies.push(`Bar Magnifier coverage: ${magnified} of ${bars.length} execution bars used lower-timeframe bars${input.magnifierLabel ? ' (' + String(input.magnifierLabel).slice(0, 200) + ')' : ''}. The other ${bars.length - magnified} kept the OHLC route: no lower-timeframe bars, or bars that do not reproduce the execution bar's open, high, low and close. Missing data is never manufactured.`);
  }
  const signals = new Map<number, StrategySignal[]>();
  let intentCount = 0, delayedPastEnd = 0;
  const delayBars = Number.isSafeInteger(config.orderDelayBars) && config.orderDelayBars! > 0 ? config.orderDelayBars! : 0;
  for (const signal of input.signals) {
    if (!Number.isSafeInteger(signal.barIndex) || signal.barIndex < 0 || signal.barIndex >= input.bars.length || !Array.isArray(signal.orders)) { result.diagnostics.push('Signal bar index is outside supplied history.'); break; }
    if (signal.sourceEventId !== undefined && (!input.barIds || signal.sourceEventId !== input.barIds[signal.barIndex]) || signal.sourceRevision !== undefined && signal.sourceRevision !== (input.barRevisions?.[signal.barIndex] ?? 1)) { result.diagnostics.push('Signal source identity or revision does not match its supplied bar. Omitted source revision arrays mean revision one.'); break; }
    intentCount += signal.orders.length;
    if (intentCount > 100000) { result.diagnostics.push('This request exceeds 100000 order intents. Split the workload with explicit state checkpoints.'); break; }
    if (signal.orders.some(order => !order || typeof order !== 'object')) { result.diagnostics.push('Each order intent must be an object.'); break; }
    // An order execution delay moves the proposal to the close of a later bar (absent or 0 keeps it).
    const placed = signal.barIndex + delayBars;
    if (placed >= input.bars.length) { delayedPastEnd += signal.orders.length; continue; }
    const bucket = signals.get(placed) ?? []; bucket.push(signal); signals.set(placed, bucket);
  }
  if (delayBars > 0) result.policies.push(orderDelayPolicy(delayBars, delayedPastEnd));
  if (result.diagnostics.length || !bars) return result;
  let cash = decimal(config.initialCapital), totalCommission = decimal(0), positionQuantity = decimal(0), peakClose = config.initialCapital, peakIntrabar = config.initialCapital, lots: Lot[] = [], lotHead = 0, nextOrder = 1;
  const workingOrders = new Map<string, StrategyOrder>(), usedOrderIds = new Set<string>(), orderById = new Map<string, StrategyOrder>();
  let routeBasis: NonNullable<StrategyFill['routeBasis']> = 'ohlc-nearest-extreme-low-tie-v1';
  const addOrder = (order: StrategyOrder) => { result.orders.push(order); orderById.set(order.id, order); };
  const evaluationLimit = new Error('Working-order evaluation budget exhausted. Reduce pending orders or supplied history. Partial results are not a completed backtest.');
  const evaluateOrder = () => { if (result.execution.orderEvaluations >= maxOrderEvaluations) throw evaluationLimit; result.execution.orderEvaluations++; };
  // L5 perf: Decimals are immutable and `cash`/`positionQuantity` change only on a fill, so their rounded numbers are memoised by identity (bit-identical to recomputing).
  let quantitySource: Decimal | null = null, quantityValue = 0, cashSource: Decimal | null = null, cashValue = 0;
  const marginNumber: { source: Decimal | null; value: number } = { source: null, value: 0 };
  const quantity = () => { if (quantitySource !== positionQuantity) { quantitySource = positionQuantity; quantityValue = value(positionQuantity); } return quantityValue; };
  const cashNumber = () => { if (cashSource !== cash) { cashSource = cash; cashValue = value(cash); } return cashValue; };
  /** The open position as a strategy sees it: signed units, their average fill price and the open trades (FIFO lots). */
  const positionState = (): { averagePrice: number | null; openTrades: number } => {
    let units = decimal(0), cost = decimal(0), open = 0;
    for (let k = lotHead; k < lots.length; k++) { const size = Math.abs(lots[k].quantity); if (!size) continue; open++; units = units.add(size); cost = cost.add(decimal(size).mul(lots[k].price)); }
    return { averagePrice: open ? value(cost.div(units)) : null, openTrades: open };
  };
  const equityAt = (price: number) => quantity() === 0 && Number.isFinite(price) ? cashNumber() : value(cash.add(decimal(quantity()).mul(price)));
  const commissionFor = (size: number, price: number) => value(config.commission.kind === 'percent' ? decimal(size).mul(price).mul(config.commission.value).div(100) : config.commission.kind === 'per-unit' ? decimal(size).mul(config.commission.value) : decimal(config.commission.value));
  const reject = (order: StrategyOrder, reason: string) => {
    order.status = 'rejected'; order.reason = reason; workingOrders.delete(order.id);
    // A rejected exit leg ends its one-cancels-all group: the sibling is cancelled and the reserved quantity released.
    const group = ocaOf.get(order.id); if (group !== undefined) endBracket(group, `Cancelled because the other leg of ${exitLabel.get(group)} was rejected; its reserved quantity is released.`);
    leaveOca(order.id); trailing.delete(order.id);
  };
  const markIntrabar = (price: number) => {
    // L5 perf: once an intrabar drawdown is on record, a mark whose double estimate sits safely inside the recorded band changes no extreme, so the 32-digit Decimal equity is skipped (estimate error ~1e-16 relative; guard 1e-9).
    const heldQuantity = quantity();
    if (heldQuantity !== 0 && peakIntrabar > 0 && Number.isFinite(price)) {
      if (marginNumber.source !== cash) { marginNumber.source = cash; marginNumber.value = cash.toNumber(); }
      const exposure = heldQuantity * price, estimate = marginNumber.value + exposure, guard = 1e-9 * (Math.abs(marginNumber.value) + Math.abs(exposure) + 1), metrics = result.metrics;
      if (Number.isFinite(estimate) && estimate + guard <= peakIntrabar && peakIntrabar - estimate + guard <= metrics.maxIntrabarDrawdown && 100 * (peakIntrabar - estimate + guard) / peakIntrabar <= metrics.maxIntrabarDrawdownPercent) return;
    }
    const equity = equityAt(price); peakIntrabar = Math.max(peakIntrabar, equity);
    result.metrics.maxIntrabarDrawdown = Math.max(result.metrics.maxIntrabarDrawdown, peakIntrabar - equity);
    result.metrics.maxIntrabarDrawdownPercent = Math.max(result.metrics.maxIntrabarDrawdownPercent, peakIntrabar ? 100 * (peakIntrabar - equity) / peakIntrabar : 0);
  };
  const fillPriceFor = (order: StrategyOrder, mark: number, phase: StrategyFill['phase']) => order.type === 'limit' || order.type === 'stop-limit'
    ? config.limitVerifyTicks > 0 && phase === 'intrabar' ? order.limitPrice! : order.action === 'buy' ? Math.min(mark, order.limitPrice!) : Math.max(mark, order.limitPrice!)
    : value(decimal(mark).add(decimal(config.slippageTicks).mul(config.tickSize).mul(order.action === 'buy' ? 1 : -1)));
  const sizingOf = new Map<string, { sizing: StrategySizing; refPrice: number; allocation: Decimal }>(), ocaOf = new Map<string, string>(), ocaMembers = new Map<string, string[]>(), ocaQuantity = new Map<string, number>(), exitLabel = new Map<string, string>();
  let unnamedExits = 0, unnamedEntries = 0, unnamedNeverFilled = 0;
  const unnamedOrders = new Set<string>(), namer = createCallerNamer();
  const queuedIntents: Array<{ intent: StrategyOrderIntent; refPrice: number }> = []; let recalculations = 0, recalculationBar = -1, seenHigh = 0, seenLow = 0;
  const cancelOrder = (order: StrategyOrder, reason: string) => { if (order.status === 'working' || order.status === 'triggered') { order.status = 'cancelled'; order.reason = reason; workingOrders.delete(order.id); leaveOca(order.id); trailing.delete(order.id); } };
  const endBracket = (group: string, reason: string) => {
    for (const id of ocaMembers.get(group) ?? []) { const leg = workingOrders.get(id); if (leg) cancelOrder(leg, reason); ocaOf.delete(id); trailing.delete(id); }
    ocaMembers.delete(group); ocaQuantity.delete(group); exitLabel.delete(group); bracketEntry.delete(group); leaveOca(group);
    const name = exitNameOf.get(group); if (name !== undefined) { exitNameOf.delete(group); if (namedExits.get(name)?.group === group) namedExits.delete(name); }
  };
  // State: trailing stops, names, exits waiting for their entry and one-cancels-all groups.
  const trailing = new Map<string, { activation: number; offset: number; active: boolean; extreme: number }>();
  const namedOrders = new Map<string, string>(), namedExits = new Map<string, { group?: string; pendingFor?: string; key: string }>(), exitNameOf = new Map<string, string>();
  const pendingExits = new Map<string, StrategyOrderIntent[]>(), armedEntry = new WeakMap<StrategyOrderIntent, string>();
  const userOca = new Map<string, { type: 'cancel' | 'reduce' | 'none'; members: Set<string> }>(), memberOca = new Map<string, string>(), ocaReduction = new Map<string, number>();
  const shownNames = new Map<string, string>(), composedNames = new Map<string, string>();
  let flatExitSkips = 0;
  // Per-entry exits: each sub-intent's slot (name and entry), and the slots of each exit name.
  const bracketEntry = new Map<string, string>(), perEntryExit = new WeakMap<StrategyOrderIntent, { slot: string | undefined }>(), entryExitSlots = new Map<string, Map<string, string>>();
  // Strategy entries (reversing) and close-only orders, by order identity, and the calls not placed.
  const entryOrderIds = new Set<string>(), closeOrderIds = new Set<string>(); let entrySkips = 0, closeSkips = 0;
  const shown = (name: string) => { let label = shownNames.get(name); if (label === undefined) { label = namer.caller(name); shownNames.set(name, label); } return label; };
  const composedOnce = (label: string) => { let text = composedNames.get(label); if (text === undefined) { text = namer.composed(label); composedNames.set(label, text); } return text; };
  const leaveOca = (member: string) => { const name = memberOca.get(member); if (name === undefined) return; memberOca.delete(member); const group = userOca.get(name); group?.members.delete(member); if (group && !group.members.size) userOca.delete(name); };
  /** Joins a one-cancels-all group; a member may not change the type of an existing group. */
  const ocaProblem = (name: unknown, type: unknown): string | null => typeof name !== 'string' || !name || name.length > 64 ? 'A one-cancels-all group name must be text of 1 to 64 characters.' : !['cancel', 'reduce', 'none'].includes(type as string) ? 'A one-cancels-all group needs a type: cancel, reduce or none.' : userOca.has(name) && userOca.get(name)!.type !== type ? `One-cancels-all group ${name} is a ${userOca.get(name)!.type} group; this order asked for ${String(type)}.` : null;
  const joinOca = (member: string, name: string, type: 'cancel' | 'reduce' | 'none') => { const group = userOca.get(name) ?? { type, members: new Set<string>() }; group.members.add(member); userOca.set(name, group); memberOca.set(member, name); };
  /** A member filled `filled` units: cancel the other members, or reduce them by the fill (an order reduced to nothing is cancelled). */
  const applyOca = (member: string, filled: number, label: string) => {
    const name = memberOca.get(member); if (name === undefined) return;
    const group = userOca.get(name)!; leaveOca(member);
    if (group.type === 'none') return;
    for (const other of [...group.members]) {
      if (ocaMembers.has(other)) {
        const held = ocaQuantity.get(other) ?? 0, keep = value(decimal(held).sub(filled));
        if (group.type === 'cancel' || !(keep > 0)) endBracket(other, group.type === 'cancel' ? `One-cancels-all group ${name}: ${label} filled.` : `One-cancels-all group ${name} reduced this exit by ${filled} when ${label} filled; nothing remains.`);
        else { ocaQuantity.set(other, keep); for (const leg of workingLegs(other)) { leg.quantity = keep; leg.reason = `${leg.reason ?? ''} Reduced to ${keep} when ${label} of one-cancels-all group ${name} filled.`.trim(); } }
        continue;
      }
      const order = workingOrders.get(other); if (!order) { leaveOca(other); continue; }
      if (group.type === 'cancel') { cancelOrder(order, `One-cancels-all group ${name}: ${label} filled.`); continue; }
      if (sizingOf.has(order.id)) { ocaReduction.set(order.id, value(decimal(ocaReduction.get(order.id) ?? 0).add(filled))); continue; }
      const keep = value(decimal(order.quantity).sub(filled));
      if (!(keep > 0)) cancelOrder(order, `One-cancels-all group ${name} reduced this order by ${filled} when ${label} filled; nothing remains.`);
      else { order.quantity = keep; order.reason = `${order.reason ?? ''} Reduced to ${keep} when ${label} of one-cancels-all group ${name} filled.`.trim(); }
    }
  };
  const legWord = (id: string): string => EXIT_LEG_WORDS[(id.slice(id.lastIndexOf(':') + 1) as ExitLeg)] ?? 'stop loss';
  const trailLevel = (order: StrategyOrder) => { const trail = trailing.get(order.id)!; return trail.active ? value(decimal(trail.extreme).add(decimal(trail.offset).mul(order.action === 'sell' ? -1 : 1))) : trail.activation; };
  /** Drops a named exit that is still waiting for its entry. */
  const dropPending = (name: string) => {
    const pending = namedExits.get(name); if (pending?.pendingFor === undefined) return;
    const list = (pendingExits.get(pending.pendingFor) ?? []).filter(intent => intent.name !== name);
    if (list.length) pendingExits.set(pending.pendingFor, list); else pendingExits.delete(pending.pendingFor);
    namedExits.delete(name);
  };
  const workingLegs = (group: string) => (ocaMembers.get(group) ?? []).map(id => workingOrders.get(id)).filter((leg): leg is StrategyOrder => !!leg);
  // Reservations follow every position change. Flat ends every bracket; a sign change ends brackets whose
  // side no longer reduces; a smaller position clamps reservations (oldest bracket first) and resizes their legs
  // (our own clamp); a group with no working leg is released.
  const reconcileBrackets = (position: number) => {
    if (position === 0) { for (const group of [...ocaMembers.keys()]) endBracket(group, 'Position closed; exit bracket cancelled.'); return; }
    let remaining = Math.abs(position);
    for (const group of [...ocaMembers.keys()]) {
      const legs = workingLegs(group), label = exitLabel.get(group) ?? 'This exit';
      if (!legs.length) { endBracket(group, ''); continue; }
      if (legs[0].action !== (position > 0 ? 'sell' : 'buy')) { endBracket(group, `Position reversed; ${label} was cancelled and its reserved quantity released.`); continue; }
      // A per-entry bracket also keeps at most its own entry's open units (the FIFO lots of that entry).
      const entryId = bracketEntry.get(group), entryUnits = entryId === undefined ? Infinity : lots.slice(lotHead).reduce((sum, lot) => lot.orderId === entryId ? sum + Math.abs(lot.quantity) : sum, 0);
      const held = ocaQuantity.get(group) ?? 0, keep = Math.min(held, remaining, entryUnits);
      if (!(keep > 0)) { endBracket(group, `Position reduced below ${label}; it was cancelled and its reserved quantity released.`); continue; }
      if (keep < held) { ocaQuantity.set(group, keep); for (const leg of legs) { leg.quantity = keep; leg.reason = `${(leg.reason ?? '').replace(/ ?Quantity reduced to \S+ to match the open position\.$/, '')} Quantity reduced to ${keep} to match the open position.`.trim(); } }
      remaining = value(decimal(remaining).sub(keep));
    }
  };
  const execute = (order: StrategyOrder, mark: number, barIndex: number, phase: StrategyFill['phase'], routeSegment: number) => {
    const pendingSize = sizingOf.get(order.id);
    if (pendingSize) {
      sizingOf.delete(order.id);
      const { refPrice: price, allocation } = pendingSize, kind = pendingSize.sizing.kind;
      const units = price > 0 ? allocation.div(price).div(config.lotSize).floor().mul(config.lotSize) : decimal(0);
      if (units.gt(MAX_ORDER_QUANTITY)) { reject(order, `The ${kind === 'cash' ? 'cash' : 'percent of equity'} allocation of ${grouped(value(allocation))} resolves to ${grouped(value(units))} units at ${price}, above the ${grouped(MAX_ORDER_QUANTITY)} unit order limit (sized at the signal close).`); return; }
      if (!units.gt(0)) { reject(order, `The ${kind === 'cash' ? 'cash' : 'percent of equity'} allocation of ${value(allocation)} buys less than one lot at ${price} (the signal close).`); return; }
      order.quantity = value(units); order.reason = `Size from the signal bar: ${value(allocation)} / ${price} (signal close) rounded down to the lot size ${config.lotSize}.`;
      const reduction = ocaReduction.get(order.id);
      if (reduction !== undefined) {
        ocaReduction.delete(order.id); const keep = value(decimal(order.quantity).sub(reduction));
        if (!(keep > 0)) { cancelOrder(order, `${order.reason} One-cancels-all fills of ${reduction} leave nothing to fill.`); return; }
        order.quantity = keep; order.reason += ` Reduced by ${reduction} for earlier one-cancels-all fills.`;
      }
    }
    if (closeOrderIds.has(order.id) || entryOrderIds.has(order.id)) {
      // Close-only orders size to the open position at the fill; a reversing entry adds the opposite units.
      const held = quantity(), opposite = order.action === 'buy' ? held < 0 : held > 0;
      if (closeOrderIds.has(order.id)) {
        if (!opposite) { cancelOrder(order, 'Nothing to close: the position is flat or on the same side at the fill.'); return; }
        if (order.quantity !== Math.abs(held)) { order.quantity = Math.abs(held); order.reason = `Close sized at the fill to the open ${Math.abs(held)} units.`; }
      } else if (opposite) { order.quantity = value(decimal(order.quantity).add(Math.abs(held))); order.reason = `Reversal: the fill also closes the open ${Math.abs(held)} units.`; }
    }
    const oldQuantity = quantity(), signed = order.action === 'buy' ? order.quantity : -order.quantity;
    if (order.reduceOnly && (oldQuantity === 0 || Math.sign(oldQuantity) === Math.sign(signed) || order.quantity > Math.abs(oldQuantity))) { reject(order, 'Reduce-only order would increase or reverse the current virtual position.'); return; }
    const newQuantity = value(decimal(oldQuantity).add(signed));
    const opening = oldQuantity === 0 || Math.sign(signed) === Math.sign(oldQuantity) || Math.sign(newQuantity) !== Math.sign(oldQuantity) && newQuantity !== 0;
    if (opening && oldQuantity !== 0 && Math.sign(signed) === Math.sign(oldQuantity) && lots.length - lotHead >= Math.max(1, config.pyramiding)) { reject(order, 'Pyramiding limit reached.'); return; }
    const fillPrice = fillPriceFor(order, mark, phase);
    if (fillPrice <= 0) { reject(order, 'Configured slippage produces a nonpositive fill price.'); return; }
    const commission = commissionFor(order.quantity, fillPrice), proposedCash = cash.sub(decimal(signed).mul(fillPrice)).sub(commission), proposedEquity = proposedCash.add(decimal(newQuantity).mul(mark));
    const requiredMargin = decimal(Math.abs(newQuantity)).mul(mark).mul(newQuantity >= 0 ? config.marginLongPercent : config.marginShortPercent).div(100);
    const reducing = Math.abs(newQuantity) < Math.abs(oldQuantity) && (newQuantity === 0 || Math.sign(newQuantity) === Math.sign(oldQuantity));
    if (!reducing && proposedEquity.lt(requiredMargin)) { reject(order, 'Insufficient simulated equity for configured margin.'); return; }
    let remaining = order.quantity;
    while (remaining > 0 && lotHead < lots.length && Math.sign(lots[lotHead].quantity) !== Math.sign(signed)) {
      const lot = lots[lotHead], closing = Math.min(remaining, Math.abs(lot.quantity));
      const entryCommission = value(decimal(lot.remainingCommission).mul(closing).div(Math.abs(lot.quantity))), exitCommission = value(decimal(commission).mul(closing).div(order.quantity));
      const gross = value(decimal(fillPrice).sub(lot.price).mul(closing).mul(Math.sign(lot.quantity))), allocatedCommission = value(decimal(entryCommission).add(exitCommission));
      result.trades.push({ entryOrderId: lot.orderId, exitOrderId: order.id, direction: lot.quantity > 0 ? 'long' : 'short', quantity: closing, entryPrice: lot.price, exitPrice: fillPrice, entryBar: lot.entryBar, exitBar: barIndex, grossProfit: gross, commission: allocatedCommission, netProfit: value(decimal(gross).sub(allocatedCommission)), barsHeld: barIndex - lot.entryBar + 1 });
      lot.remainingCommission = value(decimal(lot.remainingCommission).sub(entryCommission)); lot.quantity = value(decimal(lot.quantity).sub(decimal(closing).mul(Math.sign(lot.quantity)))); remaining = value(decimal(remaining).sub(closing));
      if (lot.quantity === 0) lotHead++;
    }
    if (lotHead > 4096 && lotHead * 2 > lots.length) { lots = lots.slice(lotHead); lotHead = 0; }
    if (remaining > 0) lots.push({ orderId: order.id, quantity: order.action === 'buy' ? remaining : -remaining, price: fillPrice, entryBar: barIndex, remainingCommission: value(decimal(commission).mul(remaining).div(order.quantity)) });
    cash = proposedCash; totalCommission = totalCommission.add(commission); positionQuantity = decimal(newQuantity);
    // An unnamed buy/sell is named by its actual effect when it fills: reduce or close -> Exit N; open or
    // add -> Entry N; reversal -> an exit part for the closed trade and an entry part for the new position.
    if (unnamedOrders.has(order.id) && order.label === undefined) {
      const opposite = oldQuantity !== 0 && Math.sign(signed) !== Math.sign(oldQuantity), reverses = opposite && newQuantity !== 0 && Math.sign(newQuantity) !== Math.sign(oldQuantity);
      if (reverses) { order.exitLabel = `Exit ${++unnamedExits}`; order.entryLabel = `Entry ${++unnamedEntries}`; order.label = `${order.exitLabel} and ${order.entryLabel}`; }
      else order.label = opposite ? `Exit ${++unnamedExits}` : `Entry ${++unnamedEntries}`;
    }
    order.status = 'filled'; order.fillBar = barIndex; order.fillPrice = fillPrice;
    workingOrders.delete(order.id);
    const fill: StrategyFill = { orderId: order.id, side: order.action, quantity: order.quantity, price: fillPrice, commission, barIndex, time: bars[barIndex].time, phase, basis: config.fillBasis, marketPrice: mark, routeSegment, routeBasis };
    result.fills.push(fill);
    // One leg of a bracket fills, the other leg of the same group is cancelled; when the position is flat every bracket ends.
    const group = ocaOf.get(order.id), filledLabel = order.label ?? strategyOrderLabel(order);
    // A filled member of a one-cancels-all group (an order, or a whole exit for its legs) cancels or reduces the others.
    applyOca(group ?? order.id, order.quantity, filledLabel);
    if (group) endBracket(group, `One-cancels-all: the ${legWord(order.id)} of ${exitLabel.get(group)} filled.`);
    trailing.delete(order.id);
    reconcileBrackets(newQuantity);
    // Exits waiting for this entry arm now, at the next route point of this bar (never at the fill's own price).
    const waiting = pendingExits.get(order.id);
    if (waiting) {
      pendingExits.delete(order.id);
      for (const intent of waiting) { if (intent.name !== undefined && namedExits.get(intent.name)?.pendingFor === order.id) namedExits.delete(intent.name); armedEntry.set(intent, order.id); queuedIntents.push({ intent, refPrice: mark }); }
    }
    if (config.calcOnOrderFills && input.onFill) {
      if (recalculationBar !== barIndex) { recalculationBar = barIndex; recalculations = 0; }
      if (++recalculations > MAX_FILL_RECALCULATIONS_PER_BAR) { if (recalculations === MAX_FILL_RECALCULATIONS_PER_BAR + 1) result.diagnostics.push(`Bar ${barIndex}: more than ${MAX_FILL_RECALCULATIONS_PER_BAR} recalculations after fills; later fills on this bar were not recalculated.`); }
      else {
        const bar = bars[barIndex], held = positionState();
        // The completed bars are copied only when the callback reads them (a script feed never does).
        let completed: readonly Bar[] | undefined;
        const context = { barIndex, fill: Object.freeze({ ...fill }), position: newQuantity, currentBar: Object.freeze({ time: bar.time, open: bar.open, high: Math.max(seenHigh, mark), low: Math.min(seenLow, mark), price: mark }), averagePrice: held.averagePrice, openTrades: held.openTrades, ordinal: recalculations - 1 } as StrategyFillContext;
        Object.defineProperty(context, 'completedBars', { enumerable: true, get: () => completed ??= Object.freeze(bars.slice(0, barIndex).map(row => Object.freeze({ ...row }))) });
        const intents = input.onFill(Object.freeze(context));
        if (!Array.isArray(intents) || intents.length > 1000) result.diagnostics.push(`Bar ${barIndex}: the after-fill callback must return at most 1000 order intents.`);
        else for (const intent of intents) queuedIntents.push({ intent, refPrice: mark }); // the callback saw the fill price as the current price
      }
    }
  };
  // L5 perf: the limit threshold is a pure function of (limit price, side) for a fixed config, so it is computed once per pair.
  const thresholds = { buy: new Map<number, number>(), sell: new Map<number, number>() };
  const limitThreshold = (order: StrategyOrder): number => {
    const cache = order.action === 'buy' ? thresholds.buy : thresholds.sell; let found = cache.get(order.limitPrice!);
    if (found === undefined) { found = value(decimal(order.limitPrice!).add(decimal(config.limitVerifyTicks).mul(config.tickSize).mul(order.action === 'buy' ? -1 : 1))); cache.set(order.limitPrice!, found); }
    return found;
  };
  const processAt = (price: number, barIndex: number, phase: StrategyFill['phase'], routeSegment = phase === 'open' ? 0 : 4) => {
    seenHigh = Math.max(seenHigh, price); seenLow = Math.min(seenLow, price);
    for (const order of workingOrders.values()) {
      evaluateOrder();
      if (order.eligibleBar > barIndex) continue;
      if (order.type === 'trailing-stop') {
        // Trailing stop: it activates when the price reaches its activation level, then follows the best price seen
        // since by its offset and fills as a stop-market order (with slippage) once the price returns to that level.
        const trail = trailing.get(order.id)!, long = order.action === 'sell';
        if (!trail.active) { if (!(long ? price >= trail.activation : price <= trail.activation)) continue; trail.active = true; trail.extreme = price; order.status = 'triggered'; }
        trail.extreme = long ? Math.max(trail.extreme, price) : Math.min(trail.extreme, price);
        order.stopPrice = trailLevel(order);
        if (!(long ? price <= order.stopPrice : price >= order.stopPrice)) continue;
        execute(order, price, barIndex, phase, routeSegment); continue;
      }
      if (order.type === 'stop' || order.type === 'stop-limit') {
        if (order.status !== 'triggered') { if (!(order.action === 'buy' ? price >= order.stopPrice! : price <= order.stopPrice!)) continue; order.status = 'triggered'; }
      }
      if (order.type === 'limit' || order.type === 'stop-limit') {
        const threshold = limitThreshold(order);
        if (!(order.action === 'buy' ? price <= threshold : price >= threshold)) continue;
      }
      execute(order, price, barIndex, phase, routeSegment);
    }
    markIntrabar(price);
    marginCheck(price, barIndex, phase, routeSegment);
    // After-fill intents join at the next route point of the same bar (never at the price that triggered them).
    if (queuedIntents.length) for (const { intent, refPrice } of queuedIntents.splice(0)) submit(intent, barIndex, refPrice, true);
  };
  let marginCalls = 0;
  const marginCheck = (price: number, barIndex: number, phase: StrategyFill['phase'], routeSegment: number) => {
    const position = quantity(); if (!position) return;
    // L5 perf: skip the 32-digit Decimal evaluation when a double estimate is safely non-negative (estimate error is ~1e-16 relative; the guard is 1e-9).
    if (marginNumber.source !== cash) { marginNumber.source = cash; marginNumber.value = cash.toNumber(); }
    { const exposure = Math.abs(position) * price, ratioNumber = (position > 0 ? config.marginLongPercent : config.marginShortPercent) / 100, approx = marginNumber.value + position * price - exposure * ratioNumber; if (Number.isFinite(approx) && approx > 1e-9 * (Math.abs(marginNumber.value) + 2 * exposure + 1)) return; }
    const ratio = decimal(position > 0 ? config.marginLongPercent : config.marginShortPercent).div(100), marketValue = decimal(Math.abs(position)).mul(price);
    const available = cash.add(decimal(position).mul(price)).sub(marketValue.mul(ratio));
    if (!available.lt(0)) return;
    let cover = available.div(ratio).div(price).abs().div(config.lotSize).floor().mul(config.lotSize);
    if (cover.isZero()) cover = decimal(config.lotSize);
    const size = value(D.min(cover.mul(MARGIN_CALL_MULTIPLIER), Math.abs(position))), id = MARGIN_CALL_ORDER_PREFIX + (++marginCalls);
    const order: StrategyOrder = { id, action: position > 0 ? 'sell' : 'buy', quantity: size, type: 'market', reduceOnly: true, createdBar: barIndex, eligibleBar: barIndex, status: 'working', fillBar: null, fillPrice: null, label: `Margin call ${marginCalls}`, reason: `Margin call: available funds ${value(available)} at price ${price}; liquidating ${MARGIN_CALL_MULTIPLIER} x ${value(cover)} units (capped at the position).` };
    usedOrderIds.add(id); addOrder(order); execute(order, price, barIndex, phase, routeSegment);
  };
  const traverse = (from: number, to: number, barIndex: number, routeSegment: number) => {
    let cursor = from;
    for (;;) {
      let nextLevel: number | undefined;
      for (const order of workingOrders.values()) {
        evaluateOrder();
        if (order.eligibleBar > barIndex) continue;
        const stopWaiting = (order.type === 'stop' || order.type === 'stop-limit') && order.status !== 'triggered';
        const level = order.type === 'trailing-stop' ? trailLevel(order) : stopWaiting ? order.stopPrice : order.type === 'limit' || order.type === 'stop-limit' ? limitThreshold(order) : undefined;
        if (level !== undefined && (to > cursor ? level > cursor && level <= to : level < cursor && level >= to) && (nextLevel === undefined || (to > cursor ? level < nextLevel : level > nextLevel))) nextLevel = level;
      }
      if (nextLevel === undefined) break;
      cursor = nextLevel; processAt(cursor, barIndex, 'intrabar', routeSegment);
    }
    processAt(to, barIndex, 'intrabar', routeSegment);
  };
  const tickAligned = (price: unknown) => finitePositive(price) && decimal(price).mod(config.tickSize).isZero();
  /**
   * Exits (modelled on the documented Pine Script strategy.exit parameters): tick or price
   * targets, a trailing stop, a percent of the covered units, a named entry (waiting until it fills), same-name
   * replacement and one-cancels-all groups. Exits that use none of these keep the original path below unchanged.
   */
  /** The entries (order identities, oldest first) with open units on the position's side. */
  const openEntryIds = (): string[] => { const ids: string[] = []; for (let k = lotHead; k < lots.length; k++) if (lots[k].quantity !== 0 && !ids.includes(lots[k].orderId)) ids.push(lots[k].orderId); return ids; };
  /**
   * Modelled on the documented Pine Script strategy.exit behaviour: an exit without
   * `fromEntry` while more than one entry is open places one exit per open entry. Each covers that entry's open units (an
   * explicit quantity is capped at them, a percent is of them) and counts tick distances from that entry's fill price. A
   * named exit keeps one slot per entry, so re-sending it keeps each unchanged bracket, adds brackets for new entries and
   * ends brackets whose entry is closed. Cancel by name ends them all.
   */
  const submitPerEntryExits = (intent: StrategyOrderIntent, entries: readonly string[], barIndex: number, eligibleBar: number) => {
    const name = intent.name, slots = name !== undefined ? entryExitSlots.get(name) ?? new Map<string, string>() : null;
    if (name !== undefined) {
      const plain = namedExits.get(name);
      if (plain?.group !== undefined) endBracket(plain.group, `Replaced by one exit per open entry named ${name}.`); else if (plain?.pendingFor !== undefined) dropPending(name);
      for (const [slot, entryId] of [...slots!]) { const held = namedExits.get(slot); if (!held) { slots!.delete(slot); continue; } if (!entries.includes(entryId)) { if (held.group !== undefined) endBracket(held.group, `Its entry is closed; ${exitLabel.get(held.group) ?? 'this exit'} ended.`); slots!.delete(slot); } }
      entryExitSlots.set(name, slots!);
    }
    entries.forEach((entryId, k) => {
      const units = lots.slice(lotHead).filter(lot => lot.orderId === entryId).reduce((sum, lot) => sum.add(Math.abs(lot.quantity)), decimal(0));
      const sub: StrategyOrderIntent = { ...intent, fromEntry: entryId, ...(intent.id !== undefined ? { id: `${String(intent.id)}.${k + 1}` } : {}), ...(intent.quantity !== undefined ? { quantity: Math.min(intent.quantity, value(units)) } : {}) };
      const slot = name !== undefined ? `\u0000entry\u0000${entryId}\u0000${name}` : undefined;
      armedEntry.set(sub, entryId); perEntryExit.set(sub, { slot });
      if (slot !== undefined) slots!.set(slot, entryId);
      submitExitR33(sub, barIndex, eligibleBar);
    });
  };
  const submitExitR33 = (intent: StrategyOrderIntent, barIndex: number, eligibleBar: number) => {
    const name = intent.name, what = name !== undefined ? `exit ${String(name)}` : intent.id !== undefined ? `exit ${String(intent.id)}` : 'An exit', fail = (text: string) => { result.diagnostics.push(`Bar ${barIndex}: ${text}`); };
    if (name !== undefined && (typeof name !== 'string' || !name || name.length > 64)) return fail('an exit name must be text of 1 to 64 characters.');
    const positive = (input: unknown) => input === undefined || finitePositive(input);
    if (![intent.profitPrice, intent.lossPrice, intent.profitTicks, intent.lossTicks, intent.trailPrice, intent.trailTicks].every(positive) || !(intent.trailOffsetTicks === undefined || typeof intent.trailOffsetTicks === 'number' && Number.isFinite(intent.trailOffsetTicks) && intent.trailOffsetTicks >= 0) || !(intent.quantityPercent === undefined || finitePositive(intent.quantityPercent) && intent.quantityPercent <= 100) || !positive(intent.quantity)) return fail(`${what}: prices, tick distances and quantity must be positive numbers, the trailing offset zero or more, and the percent at most 100.`);
    if (intent.profitPrice !== undefined && intent.profitTicks !== undefined || intent.lossPrice !== undefined && intent.lossTicks !== undefined || intent.trailPrice !== undefined && intent.trailTicks !== undefined) return fail(`${what}: give each leg a price or a tick distance, not both.`);
    const trailWanted = intent.trailPrice !== undefined || intent.trailTicks !== undefined;
    if (trailWanted !== (intent.trailOffsetTicks !== undefined)) return fail(`${what}: a trailing stop needs an activation (price or ticks) and a trailing offset in ticks.`);
    const wantsProfit = intent.profitPrice !== undefined || intent.profitTicks !== undefined, wantsLoss = intent.lossPrice !== undefined || intent.lossTicks !== undefined;
    if (!wantsProfit && !wantsLoss && !trailWanted) return fail(`${what} needs a profit, loss or trailing stop.`);
    if (intent.quantity !== undefined && intent.quantityPercent !== undefined) return fail(`${what}: give a quantity or a percent, not both.`);
    if (intent.ocaType !== undefined && intent.ocaName === undefined) return fail(`${what}: a one-cancels-all type needs a group name.`);
    // A per-entry exit is kept under its own slot (name and entry); its shown name stays the exit name.
    const perEntry = perEntryExit.get(intent), slot = perEntry ? perEntry.slot : name;
    if (!perEntry && intent.fromEntry === undefined && quantity() !== 0) {
      const entries = openEntryIds();
      if (entries.length > 1 || name !== undefined && [...entryExitSlots.get(name)?.keys() ?? []].some(key => namedExits.has(key))) { submitPerEntryExits(intent, entries, barIndex, eligibleBar); return; }
    }
    let entry: StrategyOrder | undefined;
    if (intent.fromEntry !== undefined) {
      const reference = armedEntry.get(intent) ?? (typeof intent.fromEntry === 'string' ? namedOrders.get(intent.fromEntry) ?? intent.fromEntry : undefined);
      entry = reference === undefined ? undefined : orderById.get(reference);
      if (!entry || entry.id.startsWith(MARGIN_CALL_ORDER_PREFIX)) return fail(`${what} names entry ${String(intent.fromEntry)}, which is not an order of this run.`);
      if (entry.status === 'working' || entry.status === 'triggered') {
        // The exit waits for its entry and arms when it fills; a newer same-name exit replaces a waiting one.
        if (name !== undefined) { if (namedExits.get(name)?.pendingFor !== undefined) dropPending(name); else if (namedExits.get(name)?.group !== undefined) endBracket(namedExits.get(name)!.group!, `Replaced by a newer exit named ${name}.`); namedExits.set(name, { pendingFor: entry.id, key: '' }); }
        const list = pendingExits.get(entry.id) ?? []; list.push(intent); pendingExits.set(entry.id, list); return;
      }
      if (entry.status !== 'filled') return fail(`${what} protects ${strategyOrderLabel(entry)}, which was ${entry.status}; no exit was placed.`);
    }
    const position = quantity();
    if (!position) { if (name !== undefined && intent.fromEntry === undefined) { flatExitSkips++; return; } return fail(`${what} has no open position to protect.`); }
    const long = position > 0, side: 'buy' | 'sell' = long ? 'sell' : 'buy';
    let covered = decimal(0), cost = decimal(0);
    for (let k = lotHead; k < lots.length; k++) { const lot = lots[k]; if (Math.sign(lot.quantity) !== Math.sign(position) || entry && lot.orderId !== entry.id) continue; const units = Math.abs(lot.quantity); covered = covered.add(units); cost = cost.add(decimal(units).mul(lot.price)); }
    if (!covered.gt(0)) return fail(`${what}: ${entry ? strategyOrderLabel(entry) : 'the position'} has no open units left to protect.`);
    // Tick distances count from the named entry's fill price, else from the open position's average price.
    const base = entry ? decimal(entry.fillPrice!) : cost.div(covered), coveredUnits = value(covered);
    const previous = slot !== undefined ? namedExits.get(slot) : undefined;
    const reserved = [...ocaQuantity.entries()].filter(([group]) => group !== previous?.group).reduce((sum, [, size]) => sum.add(size), decimal(0));
    const unreserved = Math.max(0, value(decimal(Math.abs(position)).sub(reserved)));
    const size = intent.quantity ?? (intent.quantityPercent !== undefined ? value(covered.mul(intent.quantityPercent).div(100).div(config.lotSize).floor().mul(config.lotSize)) : Math.min(coveredUnits, unreserved));
    if (!finitePositive(size) || size > unreserved || size > coveredUnits || !decimal(size).mod(config.lotSize).isZero()) return fail(`${what} quantity ${size} exceeds the unreserved position ${unreserved}${entry ? ` or the ${coveredUnits} open units of ${strategyOrderLabel(entry)}` : ''}, or is not lot-aligned. Other exits reserve ${value(reserved)}.`);
    const direction = long ? 1 : -1, tick = decimal(config.tickSize), toTick = (price: Decimal) => value(price.div(tick).round().mul(tick));
    const profit = intent.profitPrice ?? (intent.profitTicks !== undefined ? toTick(base.add(tick.mul(intent.profitTicks).mul(direction))) : undefined);
    const loss = intent.lossPrice ?? (intent.lossTicks !== undefined ? toTick(base.sub(tick.mul(intent.lossTicks).mul(direction))) : undefined);
    const activation = intent.trailPrice ?? (intent.trailTicks !== undefined ? toTick(base.add(tick.mul(intent.trailTicks).mul(direction))) : undefined);
    const offset = intent.trailOffsetTicks !== undefined ? value(tick.mul(intent.trailOffsetTicks)) : undefined;
    if ([profit, loss, activation].some(price => price !== undefined && !tickAligned(price))) return fail(`${what} prices must be positive and tick-aligned; a tick distance must not reach zero.`);
    if (activation !== undefined && long && !(offset! < activation)) return fail(`${what}: the trailing offset must be smaller than the activation price.`);
    if (intent.ocaName !== undefined) { const problem = ocaProblem(intent.ocaName, intent.ocaType ?? 'reduce'); if (problem && !(previous?.group !== undefined && memberOca.get(previous.group) === intent.ocaName)) return fail(`${what}: ${problem}`); }
    const key = JSON.stringify([entry?.id ?? null, size, profit ?? null, loss ?? null, activation ?? null, offset ?? null, intent.ocaName ?? null, intent.ocaType ?? null]);
    // Re-sending the same exit keeps the working bracket (and its trailing state); a changed one replaces it.
    if (previous?.group !== undefined && previous.key === key && workingLegs(previous.group).length) return;
    const group = intent.id ?? `strategy-exit-${nextOrder++}`;
    if (typeof group !== 'string' || !group || group.startsWith(MARGIN_CALL_ORDER_PREFIX) || usedOrderIds.has(group) || ocaMembers.has(group) || ['profit', 'loss', 'trail'].some(leg => usedOrderIds.has(`${group}:${leg}`))) return fail(`${what} uses an identity that is reserved or already used.`);
    if (previous?.group !== undefined) endBracket(previous.group, `Replaced by a newer exit named ${name}.`);
    if (previous?.pendingFor !== undefined) dropPending(slot!);
    const title = name !== undefined ? shown(`Exit ${name}`) : intent.id !== undefined ? namer.caller(`Exit ${String(intent.id)}`) : `Exit ${++unnamedExits}`;
    const legs: StrategyOrder[] = [], common = { action: side, quantity: size, reduceOnly: true, createdBar: barIndex, eligibleBar, status: 'working' as const, fillBar: null, fillPrice: null };
    if (profit !== undefined) legs.push({ id: `${group}:profit`, ...common, type: 'limit', limitPrice: profit });
    if (loss !== undefined) legs.push({ id: `${group}:loss`, ...common, type: 'stop', stopPrice: loss });
    if (activation !== undefined) { legs.push({ id: `${group}:trail`, ...common, type: 'trailing-stop' }); trailing.set(`${group}:trail`, { activation, offset: offset!, active: false, extreme: activation }); }
    usedOrderIds.add(group); ocaMembers.set(group, legs.map(leg => leg.id)); ocaQuantity.set(group, size); exitLabel.set(group, title);
    if (perEntry && entry) bracketEntry.set(group, entry.id);
    const from = intent.profitTicks !== undefined || intent.lossTicks !== undefined || intent.trailTicks !== undefined ? ` Tick distances count from ${entry ? 'the entry fill' : 'the average open price'} ${value(base)}.` : '';
    for (const leg of legs) {
      const word = legWord(leg.id), others = legs.filter(other => other !== leg).map(other => legWord(other.id)), base = `${title} ${word}`;
      leg.label = name !== undefined ? composedOnce(base) : namer.composed(base);
      leg.reason = `${leg.label}${leg.type === 'trailing-stop' ? `: activates at ${activation}, then trails the best price by ${offset}` : ''}${others.length ? `; one-cancels-all with its ${others.join(' and ')}` : ''}.${entry ? ` Protects ${strategyOrderLabel(entry, 'entry')}.` : ''}${from}`;
      usedOrderIds.add(leg.id); ocaOf.set(leg.id, group); addOrder(leg); workingOrders.set(leg.id, leg);
    }
    if (slot !== undefined) { namedExits.set(slot, { group, key }); exitNameOf.set(group, slot); }
    if (intent.ocaName !== undefined) joinOca(group, intent.ocaName, intent.ocaType ?? 'reduce');
  };
  const R33_EXIT_FIELDS = ['name', 'fromEntry', 'profitTicks', 'lossTicks', 'trailPrice', 'trailTicks', 'trailOffsetTicks', 'quantityPercent', 'ocaName', 'ocaType'] as const;
  const submitExit = (intent: StrategyOrderIntent, barIndex: number, eligibleBar: number) => {
    if (R33_EXIT_FIELDS.some(field => intent[field] !== undefined)) { submitExitR33(intent, barIndex, eligibleBar); return; }
    const position = quantity(), group = intent.id ?? `strategy-exit-${nextOrder++}`, label = intent.id !== undefined ? `exit ${String(intent.id)}` : `Exit ${++unnamedExits}`, title = intent.id !== undefined ? namer.caller(`Exit ${String(intent.id)}`) : label;
    if (typeof group !== 'string' || !group || group.startsWith(MARGIN_CALL_ORDER_PREFIX) || usedOrderIds.has(group) || ocaMembers.has(group)) { result.diagnostics.push(`Bar ${barIndex}: ${label} uses an identity that is reserved or already used.`); return; }
    if (!position) { result.diagnostics.push(`Bar ${barIndex}: ${label} has no open position to protect.`); return; }
    if (intent.profitPrice === undefined && intent.lossPrice === undefined) { result.diagnostics.push(`Bar ${barIndex}: ${label} needs a profit or loss price.`); return; }
    if (intent.profitPrice !== undefined && !tickAligned(intent.profitPrice) || intent.lossPrice !== undefined && !tickAligned(intent.lossPrice)) { result.diagnostics.push(`Bar ${barIndex}: ${label} prices must be positive and tick-aligned.`); return; }
    const reserved = [...ocaQuantity.values()].reduce((sum, size) => sum.add(size), decimal(0)), unreserved = Math.max(0, value(decimal(Math.abs(position)).sub(reserved)));
    const size = intent.quantity ?? unreserved;
    if (!finitePositive(size) || size > unreserved || !decimal(size).mod(config.lotSize).isZero()) { result.diagnostics.push(`Bar ${barIndex}: ${label} quantity ${size} exceeds the unreserved position ${unreserved} or is not lot-aligned. Existing exits reserve ${value(reserved)}.`); return; }
    const side = position > 0 ? 'sell' : 'buy', legs: StrategyOrder[] = [];
    if (intent.profitPrice !== undefined) legs.push({ id: `${group}:profit`, action: side, quantity: size, type: 'limit', limitPrice: intent.profitPrice, reduceOnly: true, createdBar: barIndex, eligibleBar, status: 'working', fillBar: null, fillPrice: null, reason: `${title} take profit${intent.lossPrice !== undefined ? '; one-cancels-all with its stop loss' : ''}.` });
    if (intent.lossPrice !== undefined) legs.push({ id: `${group}:loss`, action: side, quantity: size, type: 'stop', stopPrice: intent.lossPrice, reduceOnly: true, createdBar: barIndex, eligibleBar, status: 'working', fillBar: null, fillPrice: null, reason: `${title} stop loss${intent.profitPrice !== undefined ? '; one-cancels-all with its take profit' : ''}.` });
    if (legs.some(leg => usedOrderIds.has(leg.id))) { result.diagnostics.push(`Bar ${barIndex}: ${label} leg identities are already used.`); return; }
    usedOrderIds.add(group); ocaMembers.set(group, legs.map(leg => leg.id)); ocaQuantity.set(group, size); exitLabel.set(group, title);
    for (const leg of legs) { const base = `${title} ${leg.type === 'limit' ? 'take profit' : 'stop loss'}`; leg.label = namer.composed(base); if (leg.reason?.startsWith(base)) leg.reason = leg.label + leg.reason.slice(base.length); usedOrderIds.add(leg.id); ocaOf.set(leg.id, group); addOrder(leg); workingOrders.set(leg.id, leg); }
  };
  const submit = (intent: StrategyOrderIntent, barIndex: number, refPrice: number, sameBar = false) => {
    const eligibleBar = sameBar || config.processOrdersOnClose ? barIndex : barIndex + 1;
    if (intent.action === 'cancel' && intent.targetName !== undefined) {
      // Cancel by name reaches the working order and the exit (working or waiting) of that name. Nothing working is a no-op.
      const name = intent.targetName, order = workingOrders.get(namedOrders.get(name) ?? ''), exit = namedExits.get(name);
      if (order) cancelOrder(order, 'Cancelled by the strategy.');
      if (exit?.group !== undefined) endBracket(exit.group, 'Cancelled by the strategy.'); else if (exit?.pendingFor !== undefined) dropPending(name);
      for (const slot of entryExitSlots.get(name)?.keys() ?? []) { const held = namedExits.get(slot); if (held?.group !== undefined) endBracket(held.group, 'Cancelled by the strategy.'); }
      entryExitSlots.delete(name);
      return;
    }
    if (intent.action === 'cancel') {
      const target = workingOrders.get(intent.targetOrderId ?? '');
      if (target) { cancelOrder(target, 'Cancelled by the strategy.'); const group = ocaOf.get(target.id); if (group !== undefined && !workingLegs(group).length) endBracket(group, ''); } else result.diagnostics.push(`Bar ${barIndex}: cancel target is not working.`);
      return;
    }
    if (intent.action === 'exit') { submitExit(intent, barIndex, eligibleBar); return; }
    const currentQuantity = quantity(), action = intent.action === 'close' ? currentQuantity > 0 ? 'sell' : 'buy' : intent.action;
    const sizing = intent.action !== 'close' && intent.quantity === undefined ? config.defaultQuantity : undefined;
    let size = intent.action === 'close' ? intent.quantity ?? Math.abs(currentQuantity) : intent.quantity ?? (sizing?.kind === 'contracts' ? sizing.value : undefined);
    if (intent.entry !== undefined || intent.closeOnly !== undefined) {
      // Strategy entries and close-only orders. Calls that cannot apply now are not placed and are counted.
      if (intent.action !== 'buy' && intent.action !== 'sell' || intent.entry !== undefined && intent.entry !== true || intent.closeOnly !== undefined && intent.closeOnly !== true || intent.entry && intent.closeOnly) { result.diagnostics.push(`Bar ${barIndex}: entry and close options apply to a buy or a sell, one at a time.`); return; }
      const direction = action === 'buy' ? 1 : -1;
      if (intent.entry && Math.sign(currentQuantity) === direction && lots.length - lotHead >= Math.max(1, config.pyramiding)) { entrySkips++; return; }
      if (intent.closeOnly) { if (Math.sign(currentQuantity) !== -direction) { closeSkips++; return; } size = Math.abs(currentQuantity); }
    }
    const id = intent.id ?? `strategy-order-${nextOrder++}`;
    if (typeof id === 'string' && id.startsWith(MARGIN_CALL_ORDER_PREFIX)) { result.diagnostics.push(`Bar ${barIndex}: order identity prefix ${MARGIN_CALL_ORDER_PREFIX} is reserved for margin calls.`); return; }
    if (usedOrderIds.has(id)) { result.diagnostics.push(`Bar ${barIndex}: duplicate order identity ${id}.`); return; }
    const name = intent.name;
    if (name !== undefined && (typeof name !== 'string' || !name || name.length > 64)) { result.diagnostics.push(`Bar ${barIndex}: an order name must be text of 1 to 64 characters.`); return; }
    usedOrderIds.add(id);
    const { profitPrice: _profit, lossPrice: _loss, ...fields } = intent;
    for (const field of R33_ORDER_FIELDS) delete (fields as Record<string, unknown>)[field];
    const order: StrategyOrder = { ...fields, id, action: action as 'buy' | 'sell', quantity: size ?? 0, type: intent.type ?? 'market', reduceOnly: intent.action === 'close' || intent.closeOnly ? true : intent.reduceOnly, createdBar: barIndex, eligibleBar, status: 'working', fillBar: null, fillPrice: null, ...(name !== undefined ? { label: shown(name) } : intent.id !== undefined ? { label: namer.caller(String(intent.id)) } : {}) };
    if (intent.id === undefined && name === undefined) unnamedOrders.add(id); // Labelled when it fills, or 'Order N' if it never does
    if (name !== undefined) {
      // A newer same-name order replaces a still-working one; exits waiting for the old order now wait for this one.
      const previous = workingOrders.get(namedOrders.get(name) ?? '');
      if (previous) { cancelOrder(previous, `Replaced by a newer order named ${name}.`); const waiting = pendingExits.get(previous.id); if (waiting) { pendingExits.delete(previous.id); pendingExits.set(id, waiting); for (const intent of waiting) if (intent.name !== undefined && namedExits.get(intent.name)?.pendingFor === previous.id) namedExits.set(intent.name, { pendingFor: id, key: '' }); } }
      namedOrders.set(name, id);
    }
    addOrder(order);
    if (intent.ocaName !== undefined || intent.ocaType !== undefined) {
      const problem = intent.ocaName === undefined ? 'A one-cancels-all type needs a group name.' : ocaProblem(intent.ocaName, intent.ocaType);
      if (problem) { reject(order, problem); return; }
    }
    const deferred = sizing !== undefined && sizing.kind !== 'contracts' && ['buy', 'sell'].includes(order.action);
    if (!['buy', 'sell'].includes(order.action) || !['market', 'limit', 'stop', 'stop-limit'].includes(order.type) || !deferred && (!finitePositive(order.quantity) || order.quantity > MAX_ORDER_QUANTITY || !decimal(order.quantity).mod(config.lotSize).isZero())) { reject(order, 'Invalid action, order type or lot-aligned quantity.'); return; }
    if (deferred) {
      // Sizing happens at the signal bar, qty = cash / close or (percent x equity / 100) / close, with close and
      // strategy equity read when the order is placed. The lot-step quantity resolves at the fill (OCA reductions), from these.
      const allocation = sizing!.kind === 'cash' ? decimal(sizing!.value) : decimal(equityAt(refPrice)).mul(sizing!.value).div(100);
      sizingOf.set(order.id, { sizing: sizing!, refPrice, allocation });
      order.reason = `Size from ${sizing!.kind === 'cash' ? 'cash' : 'percent of equity'} ${sizing!.value} at the signal close ${refPrice}.`;
    }
    for (const field of ['limitPrice', 'stopPrice'] as const) {
      const required = field === 'limitPrice' ? ['limit', 'stop-limit'].includes(order.type) : ['stop', 'stop-limit'].includes(order.type);
      if (required && !finitePositive(order[field]) || order[field] !== undefined && (!required || !finitePositive(order[field]) || !intent.entry && !decimal(order[field] as number).mod(config.tickSize).isZero())) { reject(order, `${field} must be positive and tick-aligned when applicable, and omitted otherwise.`); return; }
    }
    if (intent.entry) entryOrderIds.add(order.id); else if (intent.closeOnly) closeOrderIds.add(order.id);
    workingOrders.set(order.id, order);
    if (intent.ocaName !== undefined) joinOca(order.id, intent.ocaName, intent.ocaType!);
  };
  const R33_ORDER_FIELDS = ['name', 'targetName', 'fromEntry', 'profitTicks', 'lossTicks', 'trailPrice', 'trailTicks', 'trailOffsetTicks', 'quantityPercent', 'ocaName', 'ocaType', 'entry', 'closeOnly'] as const;
  // Unnamed orders that never filled (working, cancelled or rejected) read 'Order N'.
  const nameUnfilled = () => { for (const order of result.orders) if (unnamedOrders.has(order.id) && order.label === undefined) order.label = `Order ${++unnamedNeverFilled}`; };
  try {
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i], group = magnifier?.[i] ?? null; seenHigh = bar.open; seenLow = bar.open;
    routeBasis = group ? 'lower-timeframe-ohlc-v1' : 'ohlc-nearest-extreme-low-tie-v1';
    processAt(bar.open, i, 'open');
    if (group) {
      // Each lower-timeframe bar k gets its own route, segments 4k+1 to 4k+3 of the magnified route; segment 4k is the
      // gap from the previous lower-timeframe close to its open, an intrabar point at that open.
      for (let k = 0; k < group.length; k++) {
        const path = strategyBarRoute(group[k]);
        if (k > 0 && path[0] !== group[k - 1].close) processAt(path[0], i, 'intrabar', 4 * k);
        for (let j = 1; j < path.length; j++) traverse(path[j - 1], path[j], i, 4 * k + j);
      }
    } else {
      const path = strategyBarRoute(bar);
      for (let j = 1; j < path.length; j++) traverse(path[j - 1], path[j], i, j);
    }
    if (input.observePosition) input.observePosition(Object.freeze({ barIndex: i, position: quantity(), ...positionState() }));
    for (const signal of signals.get(i) ?? []) for (const intent of signal.orders) submit(intent, i, input.bars[i].close);
    if (config.processOrdersOnClose) processAt(bar.close, i, 'close', group ? 4 * group.length : 4);
    const equity = equityAt(bar.close); peakClose = Math.max(peakClose, equity);
    const drawdown = peakClose - equity, drawdownPercent = peakClose ? 100 * drawdown / peakClose : 0;
    result.metrics.maxDrawdown = Math.max(result.metrics.maxDrawdown, drawdown); result.metrics.maxDrawdownPercent = Math.max(result.metrics.maxDrawdownPercent, drawdownPercent);
    result.equity.push({ barIndex: i, time: bar.time, cash: cashNumber(), position: quantity(), equity, drawdown, drawdownPercent });
    result.execution.barsProcessed++;
  }
  } catch (error) { if (error !== evaluationLimit) throw error; result.diagnostics.push(evaluationLimit.message); nameUnfilled(); return result; }
  nameUnfilled();
  if (flatExitSkips) result.diagnostics.push(`${flatExitSkips} named exit call${flatExitSkips === 1 ? '' : 's'} while flat and without a named entry did nothing (OpenCandle-defined).`);
  if (entrySkips) result.diagnostics.push(`${entrySkips} entry call${entrySkips === 1 ? '' : 's'} in the direction of a position already at the pyramiding limit ${entrySkips === 1 ? 'was' : 'were'} not placed (OpenCandle-defined).`);
  if (closeSkips) result.diagnostics.push(`${closeSkips} close call${closeSkips === 1 ? '' : 's'} with no open position on that side ${closeSkips === 1 ? 'was' : 'were'} not placed (OpenCandle-defined).`);
  const finalEquity = result.equity.at(-1)?.equity ?? config.initialCapital;
  const netProfitClosed = value(result.trades.reduce((sum, trade) => sum.add(trade.netProfit), decimal(0))), grossProfit = value(result.trades.reduce((sum, trade) => sum.add(Math.max(0, trade.netProfit)), decimal(0))), grossLoss = value(result.trades.reduce((sum, trade) => sum.add(Math.max(0, -trade.netProfit)), decimal(0)));
  let wins = 0, losses = 0, consecutiveWins = 0, consecutiveLosses = 0, largestWinningTrade: number | null = null, largestLosingTrade: number | null = null;
  for (const trade of result.trades) {
    if (trade.netProfit > 0) { wins++; consecutiveWins++; consecutiveLosses = 0; } else if (trade.netProfit < 0) { losses++; consecutiveLosses++; consecutiveWins = 0; } else { consecutiveWins = 0; consecutiveLosses = 0; }
    result.metrics.maxConsecutiveWins = Math.max(result.metrics.maxConsecutiveWins, consecutiveWins); result.metrics.maxConsecutiveLosses = Math.max(result.metrics.maxConsecutiveLosses, consecutiveLosses);
    if (trade.netProfit > 0) largestWinningTrade = Math.max(largestWinningTrade ?? trade.netProfit, trade.netProfit);
    if (trade.netProfit < 0) largestLosingTrade = Math.min(largestLosingTrade ?? trade.netProfit, trade.netProfit);
  }
  result.metrics = { ...result.metrics, finalEquity, netProfitClosed, openProfit: value(decimal(finalEquity).sub(config.initialCapital).sub(netProfitClosed)), totalProfit: value(decimal(finalEquity).sub(config.initialCapital)), returnPercent: 100 * (finalEquity / config.initialCapital - 1), closedTrades: result.trades.length, winningTrades: wins, losingTrades: losses, evenTrades: result.trades.length - wins - losses, percentProfitable: result.trades.length ? 100 * wins / result.trades.length : null, grossProfit, grossLoss, profitFactor: grossLoss ? grossProfit / grossLoss : null, averageTrade: result.trades.length ? netProfitClosed / result.trades.length : null, largestWinningTrade, largestLosingTrade, totalCommission: value(totalCommission), buyHoldReturnPercent: bars.length ? 100 * (bars.at(-1)!.close / bars[0].open - 1) : null };
  result.ok = true;
  return result;
}
