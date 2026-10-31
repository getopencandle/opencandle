import type { StrategyOrderIntent, StrategySignal } from './strategy';
import type { Bar } from './types';

/**
 * LVScript virtual order proposals to Strategy tester signals.
 *
 * A proposal is one of (every field is own plain data; anything else rejects the whole request):
 * - `ctx.order(side, quantity[, options])`: `{sequence, side:'buy'|'sell', quantity, event, virtual:true[, options]}`.
 *   `options` may hold `id` (the order name, 1 to 64 characters), `type` (market, limit, stop, stop-limit), `limit`,
 *   `stop` (prices), `ocaName` and `ocaType` (cancel, reduce, none). Without options the proposal maps exactly as before.
 *   `entry: true` makes it a strategy entry (it reverses an opposite position at the fill) and
 *   `close: true` a close-only order sized to the open position; at most one of them (see strategy.ts).
 * - `ctx.exit(name, spec)`: `{sequence, side:'exit', target, exit, event, virtual:true}`. `exit` may hold `fromEntry`,
 *   `quantity`, `quantityPercent`, `profit` and `loss` (ticks), `limit` and `stop` (prices), `trailPrice`, `trailPoints`
 *   and `trailOffset` (ticks) and `ocaName`.
 * - `ctx.cancel(name)`: `{sequence, side:'cancel', target, event, virtual:true}`.
 *
 * Every proposal gets the engine identity `script-<sequence>`, so identities never repeat; the script's own names
 * travel as `name`, which the engine shows and uses for replacement, cancel and fromEntry (see strategy.ts).
 */
export const SCRIPT_ORDER_OPTION_KEYS = Object.freeze(['id', 'type', 'limit', 'stop', 'ocaName', 'ocaType', 'entry', 'close']);
export const SCRIPT_EXIT_KEYS = Object.freeze(['fromEntry', 'quantity', 'quantityPercent', 'profit', 'loss', 'limit', 'stop', 'trailPrice', 'trailPoints', 'trailOffset', 'ocaName']);
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const own = (record: Record<string, unknown>, allowed: readonly string[], what: string) => {
  for (const key of Reflect.ownKeys(record)) { const descriptor = Object.getOwnPropertyDescriptor(record, key)!; if (typeof key !== 'string' || !allowed.includes(key) || !descriptor.enumerable || !('value' in descriptor)) throw new Error(`${what} has an unsupported field.`); }
};
const name = (value: unknown): value is string => typeof value === 'string' && value.length >= 1 && value.length <= 64;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const optional = (value: unknown, test: (value: unknown) => boolean) => value === undefined || test(value);

/** Throws when a proposal is not one of the documented shapes (the event, sequence and bar checks stay with the caller). */
export function validateScriptProposalShape(order: Record<string, unknown>): void {
  const side = order.side;
  if (side === 'buy' || side === 'sell') {
    own(order, ['sequence', 'side', 'quantity', 'event', 'virtual', 'options'], 'Order proposal');
    if (!positive(order.quantity)) throw new Error('Invalid order proposal, sequence or source revision.');
    if (order.options === undefined) return;
    if (!plain(order.options)) throw new Error('Order options must be a plain object.');
    const options = order.options; own(options, SCRIPT_ORDER_OPTION_KEYS, 'Order options');
    if (!optional(options.id, name) || !optional(options.type, type => ['market', 'limit', 'stop', 'stop-limit'].includes(type as string)) || !optional(options.limit, positive) || !optional(options.stop, positive) || !optional(options.ocaName, name) || !optional(options.ocaType, type => ['cancel', 'reduce', 'none'].includes(type as string)) || !optional(options.entry, flag => flag === true) || !optional(options.close, flag => flag === true) || options.entry === true && options.close === true) throw new Error('Order options are invalid.');
    return;
  }
  if (side === 'exit') {
    own(order, ['sequence', 'side', 'target', 'exit', 'event', 'virtual'], 'Exit proposal');
    if (!name(order.target) || !plain(order.exit)) throw new Error('An exit proposal needs a name and an exit specification.');
    const exit = order.exit; own(exit, SCRIPT_EXIT_KEYS, 'Exit specification');
    if (!optional(exit.fromEntry, name) || !['quantity', 'profit', 'loss', 'limit', 'stop', 'trailPrice', 'trailPoints'].every(key => optional(exit[key], positive)) || !optional(exit.quantityPercent, value => positive(value) && (value as number) <= 100) || !optional(exit.trailOffset, value => typeof value === 'number' && Number.isFinite(value) && value >= 0) || !optional(exit.ocaName, name)) throw new Error('The exit specification is invalid.');
    return;
  }
  if (side === 'cancel') {
    own(order, ['sequence', 'side', 'target', 'event', 'virtual'], 'Cancel proposal');
    if (!name(order.target)) throw new Error('A cancel proposal needs the name of an order or exit.');
    return;
  }
  throw new Error('Invalid order proposal, sequence or source revision.');
}

/** The engine intent of one validated proposal. A plain buy or sell keeps the original intent exactly. */
export function scriptProposalIntent(order: Record<string, unknown>): StrategyOrderIntent {
  const id = 'script-' + String(order.sequence);
  if (order.side === 'cancel') return { action: 'cancel', targetName: order.target as string };
  if (order.side === 'exit') {
    const exit = order.exit as Record<string, unknown>, intent: StrategyOrderIntent = { id, action: 'exit', name: order.target as string };
    const map: Array<[string, keyof StrategyOrderIntent]> = [['fromEntry', 'fromEntry'], ['quantity', 'quantity'], ['quantityPercent', 'quantityPercent'], ['profit', 'profitTicks'], ['loss', 'lossTicks'], ['limit', 'profitPrice'], ['stop', 'lossPrice'], ['trailPrice', 'trailPrice'], ['trailPoints', 'trailTicks'], ['trailOffset', 'trailOffsetTicks'], ['ocaName', 'ocaName']];
    for (const [from, to] of map) if (exit[from] !== undefined) (intent as unknown as Record<string, unknown>)[to] = exit[from];
    return intent;
  }
  const intent: StrategyOrderIntent = { id, action: order.side as 'buy' | 'sell', quantity: order.quantity as number, type: 'market' };
  const options = order.options as Record<string, unknown> | undefined;
  if (!options) return intent;
  if (options.type !== undefined) intent.type = options.type as StrategyOrderIntent['type'];
  if (options.limit !== undefined) intent.limitPrice = options.limit as number;
  if (options.stop !== undefined) intent.stopPrice = options.stop as number;
  if (options.id !== undefined) intent.name = options.id as string;
  if (options.ocaName !== undefined) intent.ocaName = options.ocaName as string;
  if (options.ocaType !== undefined) intent.ocaType = options.ocaType as StrategyOrderIntent['ocaType'];
  if (options.entry === true) intent.entry = true;
  if (options.close === true) intent.closeOnly = true;
  return intent;
}

/**
 * An after-fill proposal is a proposal made by the script's `onFill(ctx, fill)` hook. It carries `fill`, the
 * ordinal of that fill among the recalculated fills of its bar (0 for the first). Returns the proposal without `fill`, so
 * the documented shapes above apply to it unchanged, and the ordinal. Throws on anything else.
 */
export function splitFillProposal(order: Record<string, unknown>): { proposal: Record<string, unknown>; ordinal: number } {
  if (!plain(order)) throw new Error('An after-fill proposal must be a plain object.');
  const descriptor = Object.getOwnPropertyDescriptor(order, 'fill');
  if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || !Number.isSafeInteger(descriptor.value) || descriptor.value < 0 || descriptor.value > 1000) throw new Error('An after-fill proposal needs the ordinal of its fill.');
  const proposal: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(order)) { if (key === 'fill') continue; const field = Object.getOwnPropertyDescriptor(order, key)!; if (typeof key !== 'string' || !field.enumerable || !('value' in field)) throw new Error('After-fill proposal has an unsupported field.'); proposal[key] = field.value; }
  return { proposal, ordinal: descriptor.value as number };
}
/** The bar-and-ordinal key of an after-fill answer (the engine's StrategyFillContext barIndex and ordinal). */
export const fillAnswerKey = (barIndex: number, ordinal: number) => `${barIndex}:${ordinal}`;
/**
 * Bar-close proposals to signals, and after-fill proposals to engine intents keyed by their fill. Sequences must be
 * unique across both lists, and every check of scriptOrdersToSignals applies to each row.
 */
export function scriptOrdersAndFillAnswers(orders: readonly Record<string, unknown>[], fillOrders: readonly Record<string, unknown>[], bars: readonly Bar[], ids: readonly string[]): { signals: StrategySignal[]; answers: Map<string, StrategyOrderIntent[]> } {
  const split = fillOrders.map(splitFillProposal), all = scriptOrdersToSignals([...orders, ...split.map(row => row.proposal)], bars, ids);
  const answers = new Map<string, StrategyOrderIntent[]>();
  split.forEach((row, index) => { const signal = all[orders.length + index], key = fillAnswerKey(signal.barIndex, row.ordinal); const list = answers.get(key) ?? []; list.push(...signal.orders); answers.set(key, list); });
  return { signals: all.slice(0, orders.length), answers };
}
/** Validate every event identity. Unmatched, future or malformed proposals reject the whole request. */
export function scriptOrdersToSignals(orders: readonly Record<string, unknown>[], bars: readonly Bar[], ids: readonly string[]): StrategySignal[] {
  if (ids.length !== bars.length || new Set(ids).size !== ids.length) throw new Error('Unique source bar identities are required.');
  const indices = new Map(ids.map((id, index) => [id, index]));
  const sequences = new Set<number>();
  return orders.map(order => {
    const event = order.event as Record<string, unknown> | undefined;
    if (order.virtual !== true || !event || typeof event.id !== 'string' || !indices.has(event.id)) throw new Error('Order proposal does not belong to this simulation history.');
    const barIndex = indices.get(event.id)!;
    if (event.time !== bars[barIndex].time || event.revision !== 1 || !['buy', 'sell', 'exit', 'cancel'].includes(order.side as string) || typeof order.sequence !== 'number' || !Number.isSafeInteger(order.sequence) || order.sequence < 1 || sequences.has(order.sequence)) throw new Error('Invalid order proposal, sequence or source revision.');
    if ((order.side === 'buy' || order.side === 'sell') && (typeof order.quantity !== 'number' || !Number.isFinite(order.quantity) || order.quantity <= 0)) throw new Error('Invalid order proposal, sequence or source revision.');
    if (order.options !== undefined || order.side === 'exit' || order.side === 'cancel') validateScriptProposalShape(order);
    sequences.add(order.sequence);
    return { barIndex, sourceEventId: event.id, sourceRevision: 1, orders: [scriptProposalIntent(order)] };
  });
}
