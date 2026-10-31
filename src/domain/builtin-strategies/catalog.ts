// The built-in strategies listed in the Indicators dialog's Strategies tab.
// The list has 23 named strategies in a fixed order. Rules, inputs and defaults are our own choice; each source
// is original LVScript run through the existing restricted worker and Strategy report (see sources.ts).
import { BUILTIN_STRATEGY_SOURCES } from './sources';

export const BUILTIN_STRATEGY_FACT = 'builtin-strategies:list';
/** How a built-in places its entries: market orders at the next open, or stop orders at a price level. */
export type BuiltinEntryKind = 'market' | 'stop';
export interface BuiltinStrategy {
  /** Stable LV identity (also the selector entry id, prefixed `builtin-strategy:`). */
  readonly id: string;
  /** The listed name (fact). */
  readonly name: string;
  readonly entries: BuiltinEntryKind;
  /** Every rule is our own choice; the text is the one-line rule the source implements. */
  readonly basis: 'LV-DEFINED';
  readonly rule: string;
  readonly source: string;
}

const ROWS: readonly (readonly [string, string, BuiltinEntryKind])[] = [
  ['bar-up-down', 'Bar up/down strategy', 'market'],
  ['bollinger-bands', 'Bollinger Bands strategy', 'market'],
  ['bollinger-bands-directed', 'Bollinger Bands strategy directed', 'market'],
  ['channel-breakout', 'Channel breakout strategy', 'market'],
  ['consecutive-up-down', 'Consecutive up/down strategy', 'market'],
  ['greedy', 'Greedy strategy', 'market'],
  ['inside-bar', 'Inside bar strategy', 'market'],
  ['keltner-channels', 'Keltner channels strategy', 'market'],
  ['macd', 'MACD strategy', 'market'],
  ['momentum', 'Momentum strategy', 'market'],
  ['moving-average-crossover', 'Moving average crossover', 'market'],
  ['outside-bar', 'Outside bar strategy', 'market'],
  ['parabolic-sar', 'Parabolic SAR strategy', 'market'],
  ['pivot-extension', 'Pivot extension strategy', 'market'],
  ['pivot-reversal', 'Pivot reversal strategy', 'stop'],
  ['price-channel', 'Price channel strategy', 'market'],
  ['rob-booker-adx-breakout', 'Rob Booker - ADX Breakout', 'stop'],
  ['rsi', 'RSI strategy', 'market'],
  ['stochastic-slow', 'Stochastic slow strategy', 'market'],
  ['supertrend', 'Supertrend strategy', 'market'],
  ['technical-ratings', 'Technical ratings strategy', 'market'],
  ['two-moving-averages-crossover', 'Two moving averages crossover', 'market'],
  ['volatility-expansion-close', 'Volatility expansion-close strategy', 'market'],
];
const ruleOf = (source: string) => /OpenCandle-defined rule: (.*)$/m.exec(source)?.[1].trim() ?? '';

/** The built-ins in the listed (fact) order. */
export const BUILTIN_STRATEGIES: readonly BuiltinStrategy[] = Object.freeze(ROWS.map(([id, name, entries]) => {
  const source = BUILTIN_STRATEGY_SOURCES[id];
  if (typeof source !== 'string') throw new Error(`Built-in strategy ${id} has no source.`);
  return Object.freeze({ id, name, entries, basis: 'LV-DEFINED' as const, rule: ruleOf(source), source });
}));
export const BUILTIN_STRATEGY_PREFIX = 'builtin-strategy:';
export const builtinStrategyEntryId = (id: string) => BUILTIN_STRATEGY_PREFIX + id;
/** The built-in for an id or a selector entry id; unknown ids fail instead of guessing. */
export function builtinStrategy(id: string): BuiltinStrategy {
  const key = id.startsWith(BUILTIN_STRATEGY_PREFIX) ? id.slice(BUILTIN_STRATEGY_PREFIX.length) : id;
  const found = BUILTIN_STRATEGIES.find(row => row.id === key);
  if (!found) throw new Error('Unknown built-in strategy.');
  return found;
}
/** Selector rows for the Strategies tab (fact order). */
export const BUILTIN_STRATEGY_SELECTOR_ROWS: readonly { id: string; name: string }[] = Object.freeze(BUILTIN_STRATEGIES.map(row => Object.freeze({ id: builtinStrategyEntryId(row.id), name: row.name })));

/**
 * The script document a built-in adds to the local library: kind strategy, price pane, the original source. An existing
 * document with the same name and saved source is reused, so adding a built-in twice binds the same document again.
 */
export interface BuiltinStrategyDocument { name: string; source: string; pane: 'price'; kind: 'strategy' }
export function builtinStrategyDocument(id: string): BuiltinStrategyDocument {
  const row = builtinStrategy(id);
  return { name: row.name, source: row.source, pane: 'price', kind: 'strategy' };
}
export function findBuiltinStrategyDocument<T extends { id: string; name: string; source: string; kind: string; history: readonly { source: string; name: string }[] }>(documents: readonly T[], id: string): T | null {
  const wanted = builtinStrategyDocument(id);
  return documents.find(doc => doc.kind === 'strategy' && doc.name === wanted.name && doc.source === wanted.source && doc.history.at(-1)?.source === wanted.source && doc.history.at(-1)?.name === wanted.name) ?? null;
}
