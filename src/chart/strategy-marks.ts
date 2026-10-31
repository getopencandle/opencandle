// Strategy trades on the chart. Pure model only: which fills show, where, with
// which text, and the optional trade lines. The overlay (strategy-marks-view.tsx) paints them over the active chart's price
// pane. Each fill gets an arrow (a buy below the bar, a sell above it) with the order name and the signed
// quantity; a line can join each closed trade's entry and exit. Look, wording and defaults are our own choice.
// Virtual proposals only: nothing here reaches a paper account.
import { strategyOrderLabel, type StrategyFill, type StrategyResult } from '../domain/strategy';

export interface StrategyMarkSettings {
  /** Arrows for every fill. */
  trades: boolean;
  /** The order name next to the arrow. */
  labels: boolean;
  /** The signed quantity next to the arrow. */
  quantity: boolean;
  /** A line from each closed trade's entry fill to its exit fill. */
  lines: boolean;
}
/** Defaults: arrows, names and quantities on, trade lines off. */
export const DEFAULT_STRATEGY_MARK_SETTINGS: Readonly<StrategyMarkSettings> = Object.freeze({ trades: true, labels: true, quantity: true, lines: false });
export const STRATEGY_MARK_SETTING_LABELS: readonly (readonly [keyof StrategyMarkSettings, string])[] = Object.freeze([
  ['trades', 'Trades on chart'], ['labels', 'Signal labels'], ['quantity', 'Quantity'], ['lines', 'Trade lines'],
]);
export function restoreStrategyMarkSettings(value: unknown): StrategyMarkSettings {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const pick = (key: keyof StrategyMarkSettings) => typeof record[key] === 'boolean' ? record[key] as boolean : DEFAULT_STRATEGY_MARK_SETTINGS[key];
  return { trades: pick('trades'), labels: pick('labels'), quantity: pick('quantity'), lines: pick('lines') };
}

export interface StrategyTradeMark {
  id: string; side: 'buy' | 'sell'; barIndex: number; barTime: number;
  /** The fill price, and the bar extreme the arrow points at (the low for a buy, the high for a sell). */
  price: number; anchor: number;
  /** 0 for the first fill of this side on its bar, then 1, 2, ... (stacked away from the bar). */
  stack: number;
  /** Shown text (name and or signed quantity, per the settings; empty when both are off). */
  label: string;
  /** Accessible description: always the name, side, quantity and price. */
  title: string;
}
export interface StrategyTradeLine { id: string; direction: 'long' | 'short'; fromTime: number; fromPrice: number; toTime: number; toPrice: number; profit: boolean; entryBar: number; exitBar: number }
/** At most this many of the newest fills and closed trades are placed. */
export const STRATEGY_MARK_LIMIT = 2000;

const quantityText = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(8)));
const priceText = (value: number) => String(Number(value.toPrecision(10)));
/** The signed quantity as shown: "+2" for a buy, "-2" for a sell. */
export function strategyMarkQuantity(side: 'buy' | 'sell', quantity: number): string { return (side === 'buy' ? '+' : '-') + quantityText(quantity); }

const GENERATED_SCRIPT_ID = /^script-\d+$/;
/** The word for an unnamed fill: "Close" when it only reduces the open position, otherwise the direction it leaves ("Long" or "Short"). */
export function strategyFillWord(side: 'buy' | 'sell', quantity: number, positionBefore: number): string {
  const after = positionBefore + (side === 'buy' ? quantity : -quantity), epsilon = 1e-9;
  if (Math.abs(positionBefore) > epsilon && Math.sign(after) !== Math.sign(positionBefore) && Math.abs(after) <= epsilon) return 'Close';
  if (Math.abs(positionBefore) > epsilon && Math.sign(after) === Math.sign(positionBefore) && Math.abs(after) < Math.abs(positionBefore)) return 'Close';
  return after > 0 ? 'Long' : after < 0 ? 'Short' : side === 'buy' ? 'Long' : 'Short';
}

/** Marks and lines for one engine result on the bars it ran on. Fills or trades outside those bars are left out. */
export function strategyTradeMarks(result: Pick<StrategyResult, 'fills' | 'orders' | 'trades'> | null, bars: readonly { time: number; high: number; low: number }[], settings: StrategyMarkSettings, limit = STRATEGY_MARK_LIMIT): { marks: StrategyTradeMark[]; lines: StrategyTradeLine[] } {
  if (!result || !settings.trades || !bars.length) return { marks: [], lines: [] };
  const orders = new Map(result.orders.map(order => [order.id, order])), stacks = new Map<string, number>(), marks: StrategyTradeMark[] = [];
  // An unnamed script order is named by what its fill did ("Long", "Short" or "Close"), never by its generated id.
  const before = new Map<StrategyFill, number>(); let position = 0;
  for (const fill of result.fills) { before.set(fill, position); if (Number.isFinite(fill.quantity)) position += fill.side === 'buy' ? fill.quantity : -fill.quantity; }
  for (const fill of result.fills.slice(-Math.max(0, limit))) {
    const bar = bars[fill.barIndex]; if (!bar || !Number.isFinite(fill.price) || !(fill.quantity > 0)) continue;
    const order = orders.get(fill.orderId), label0 = strategyOrderLabel(order ?? { id: fill.orderId }), name = GENERATED_SCRIPT_ID.test(label0) ? strategyFillWord(fill.side, fill.quantity, before.get(fill) ?? 0) : label0, signed = strategyMarkQuantity(fill.side, fill.quantity);
    const key = fill.barIndex + ':' + fill.side, stack = stacks.get(key) ?? 0; stacks.set(key, stack + 1);
    const label = [settings.labels ? name : '', settings.quantity ? signed : ''].filter(Boolean).join(' ');
    marks.push({ id: fill.orderId, side: fill.side, barIndex: fill.barIndex, barTime: bar.time, price: fill.price, anchor: fill.side === 'buy' ? bar.low : bar.high, stack, label, title: `${name} ${fill.side === 'buy' ? 'buy' : 'sell'} ${quantityText(fill.quantity)} at ${priceText(fill.price)}` });
  }
  const lines: StrategyTradeLine[] = [];
  if (settings.lines) result.trades.slice(-Math.max(0, limit)).forEach((trade, index) => {
    const from = bars[trade.entryBar], to = bars[trade.exitBar]; if (!from || !to) return;
    lines.push({ id: `${trade.entryOrderId}>${trade.exitOrderId}:${index}`, direction: trade.direction, fromTime: from.time, fromPrice: trade.entryPrice, toTime: to.time, toPrice: trade.exitPrice, profit: trade.netProfit >= 0, entryBar: trade.entryBar, exitBar: trade.exitBar });
  });
  return { marks, lines };
}

/** Where a mark's arrow sits in pane pixels: a buy points up from below its bar's low, a sell down from above its high. */
export const STRATEGY_MARK_OFFSET_PX = 4, STRATEGY_MARK_ARROW_PX = 10, STRATEGY_MARK_STACK_PX = 18;
export function strategyMarkPlacement(side: 'buy' | 'sell', x: number, anchorY: number, stack: number): { x: number; tipY: number; baseY: number; labelY: number; direction: 'up' | 'down' } {
  const shift = STRATEGY_MARK_OFFSET_PX + stack * STRATEGY_MARK_STACK_PX;
  return side === 'buy'
    ? { x, tipY: anchorY + shift, baseY: anchorY + shift + STRATEGY_MARK_ARROW_PX, labelY: anchorY + shift + STRATEGY_MARK_ARROW_PX + 1, direction: 'up' }
    : { x, tipY: anchorY - shift, baseY: anchorY - shift - STRATEGY_MARK_ARROW_PX, labelY: anchorY - shift - STRATEGY_MARK_ARROW_PX - 15, direction: 'down' };
}

/** The bar time a List of trades row scrolls the chart to: the trade's entry bar. */
export function strategyTradeJumpTime(trade: { entry: { time: number } }): number { return trade.entry.time; }

// ---- Per-viewer settings and the selected trade (session view state) ----
// The settings are a per-viewer convenience kept in local storage; without storage the defaults apply.
export const STRATEGY_MARK_STORAGE_KEY = 'lv.strategy-trade-marks.v1';
export interface StrategyMarkStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const defaultStorage = (): StrategyMarkStorage | null => { try { return (globalThis as { localStorage?: StrategyMarkStorage }).localStorage ?? null; } catch { return null; } };
export interface SelectedStrategyTrade { entryBar: number; exitBar: number; entryTime: number }
export function createStrategyMarkStore(storage: () => StrategyMarkStorage | null = defaultStorage) {
  let settings: StrategyMarkSettings | null = null, selected: SelectedStrategyTrade | null = null;
  const listeners = new Set<() => void>(), notify = () => { for (const listener of [...listeners]) listener(); };
  const read = (): StrategyMarkSettings => { if (settings) return settings; let raw: unknown = null; try { const text = storage()?.getItem(STRATEGY_MARK_STORAGE_KEY); raw = text ? JSON.parse(text) : null; } catch { raw = null; } settings = restoreStrategyMarkSettings(raw); return settings; };
  return {
    settings: read,
    setSettings(patch: Partial<StrategyMarkSettings>) { const next = restoreStrategyMarkSettings({ ...read(), ...patch }); settings = next; try { storage()?.setItem(STRATEGY_MARK_STORAGE_KEY, JSON.stringify(next)); } catch { /* A blocked store keeps the change for this session only. */ } notify(); },
    selected: () => selected,
    select(trade: SelectedStrategyTrade | null) { selected = trade; notify(); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
export type StrategyMarkStore = ReturnType<typeof createStrategyMarkStore>;
/** The app's shared store (the overlay, the settings block and the List of trades read and write it). */
export const strategyMarkStore: StrategyMarkStore = createStrategyMarkStore();
