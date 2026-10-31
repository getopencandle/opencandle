/**
 * Fib retracement "Active level crossing" alerts (the condition requires a Fib retracement source). Every rule below is
 * - "Active" means the levels that are enabled (drawn) on the drawing when the alert is created.
 * - The level set is captured once and frozen, like a captured drawing boundary. Later edits of the drawing do not move it.
 * - Levels are horizontal prices that apply at every bar, whether or not the drawing's lines extend that far in time.
 * - Level prices follow the chart renderer exactly: reverse ? p1 + r * (p2 - p1) : p2 + r * (p1 - p2), where a saved
 *   drawing without a reverse flag reads as reversed (renderer FibRetracement.readProps).
 * - A crossing of any one level triggers, with the same crossing semantics version as single-level price alerts.
 */
import Decimal from 'decimal.js';

export interface AlertLevel { ratio: number; price: number }
/** For a Fib channel each level's price is its ratio: the alert value is the price's Fib ratio in the channel. */
export interface AlertLevelSet { schemaVersion: 1; drawingId: string; tool: 'fibretracement' | 'tpo' | 'fibchannel'; levels: AlertLevel[] }
export const ALERT_LEVEL_LIMIT = 64;
export const ALERT_LEVELS_POLICY = 'Fib active level crossing (OpenCandle policy pending reference comparison): the levels enabled on the drawing when the alert is created are frozen; a crossing of any of them notifies, at any bar time; later drawing edits need a new alert.';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function exact(value: unknown, keys: readonly string[], message: string): Record<string, unknown> {
  if (!plain(value)) throw new Error(message);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || !keys.every(key => own.includes(key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value') && Object.getOwnPropertyDescriptor(value, key)!.enumerable)) throw new Error(message);
  return value;
}

export function validateAlertLevels(value: unknown): asserts value is AlertLevelSet {
  const row = exact(value, ['schemaVersion', 'drawingId', 'tool', 'levels'], 'Alert levels have unsupported or missing fields.');
  if (row.schemaVersion !== 1 || (row.tool !== 'fibretracement' && row.tool !== 'tpo' && row.tool !== 'fibchannel') || typeof row.drawingId !== 'string' || !row.drawingId.length || row.drawingId.length > 200) throw new Error('Alert levels need a Fib retracement, Fib channel or TPO level identity.');
  const levels = row.levels;
  if (!Array.isArray(levels) || levels.length < 1 || levels.length > ALERT_LEVEL_LIMIT) throw new Error(`Alert levels need 1 to ${ALERT_LEVEL_LIMIT} levels.`);
  let previous = -Infinity;
  for (const level of levels) {
    const item = exact(level, ['ratio', 'price'], 'Each alert level needs exactly a ratio and a price.');
    if (!finite(item.ratio) || !finite(item.price)) throw new Error('Alert level ratios and prices must be finite.');
    if (item.price <= previous) throw new Error('Alert levels must be distinct prices in ascending order.');
    previous = item.price;
  }
}

/** The enabled levels of a placed Fib retracement on the main price pane, sorted by price. Equal prices keep the first ratio. */
export function captureFibActiveLevels(drawing: unknown): { ok: true; levels: AlertLevelSet } | { ok: false; diagnostics: string[] } {
  try {
    if (!plain(drawing) || drawing.type !== 'fibretracement') throw new Error('This drawing is not a Fib retracement.');
    const id = String(drawing.id ?? '');
    if (!id || id.length > 200) throw new Error('This Fib retracement has no usable identity.');
    if (drawing.paneId !== 'price') throw new Error('Fib level alerts need the drawing on the main price pane.');
    const anchors = drawing.anchors;
    if (!Array.isArray(anchors) || anchors.length !== 2) throw new Error('Finish placing the Fib retracement before creating its alert.');
    const [p1, p2] = anchors.map(anchor => (anchor as { price?: unknown } | null)?.price);
    if (!finite(p1) || !finite(p2)) throw new Error('Fib retracement anchors must be finite prices.');
    const props = plain(drawing.props) ? drawing.props : {};
    if (!Array.isArray(props.levels) || !props.levels.length) throw new Error('This Fib retracement has no saved level list.');
    const reverse = typeof props.reverse === 'boolean' ? props.reverse : true;
    const byPrice = new Map<number, AlertLevel>();
    for (const level of props.levels) {
      if (!plain(level) || level.enabled !== true || !finite(level.ratio)) continue;
      const ratio = new Decimal(level.ratio), price = (reverse ? new Decimal(p1).add(ratio.mul(new Decimal(p2).sub(p1))) : new Decimal(p2).add(ratio.mul(new Decimal(p1).sub(p2)))).toNumber();
      if (finite(price) && !byPrice.has(price)) byPrice.set(price, { ratio: level.ratio, price });
    }
    if (!byPrice.size) throw new Error('This Fib retracement has no active (enabled) level.');
    const levels = [...byPrice.values()].sort((a, b) => a.price - b.price);
    if (levels.length > ALERT_LEVEL_LIMIT) throw new Error(`Fib level alerts support at most ${ALERT_LEVEL_LIMIT} active levels.`);
    const set: AlertLevelSet = { schemaVersion: 1, drawingId: id, tool: 'fibretracement', levels };
    validateAlertLevels(set);
    return { ok: true, levels: set };
  } catch (error) { return { ok: false, diagnostics: [error instanceof Error ? error.message : String(error)] }; }
}

/**
 * The enabled levels of a Fib channel, as ratios. Ratios do not move when
 * the drawing moves, so the alert keeps watching the same levels of the moved channel (the geometry follows the drawing).
 * As for the Fib retracement: the levels enabled when the alert is made are frozen; a later change of the enabled
 * levels restarts the alert (its geometry key changes) but the watched ratios stay; make a new alert to watch other levels.
 */
export function captureFibChannelLevels(drawing: unknown, enabledRatios: readonly number[]): { ok: true; levels: AlertLevelSet } | { ok: false; diagnostics: string[] } {
  try {
    if (!plain(drawing) || drawing.type !== 'fibchannel') throw new Error('This drawing is not a Fib channel.');
    const id = String(drawing.id ?? '');
    if (!id || id.length > 200) throw new Error('This Fib channel has no usable identity.');
    const ratios = [...new Set(enabledRatios.filter(finite))].sort((a, b) => a - b);
    if (!ratios.length) throw new Error('This Fib channel has no active (enabled) level.');
    if (ratios.length > ALERT_LEVEL_LIMIT) throw new Error(`Fib level alerts support at most ${ALERT_LEVEL_LIMIT} active levels.`);
    const set: AlertLevelSet = { schemaVersion: 1, drawingId: id, tool: 'fibchannel', levels: ratios.map(ratio => ({ ratio, price: ratio })) };
    validateAlertLevels(set);
    return { ok: true, levels: set };
  } catch (error) { return { ok: false, diagnostics: [error instanceof Error ? error.message : String(error)] }; }
}

export function describeAlertLevels(set: AlertLevelSet): string {
  return `${set.levels.length} active level${set.levels.length === 1 ? '' : 's'}: ${set.levels.map(level => String(set.tool === 'fibchannel' ? level.ratio : level.price)).join(', ')}`;
}

/**
 * The level a move from `previous` to `current` crossed, or null. Version 2 (modern) counts reaching a level from strictly
 * below or above; version 1 is strict on both sides, the same as single-level crossing. When one move passes several levels
 * the last one passed in the direction of travel is reported.
 */
export function crossedAlertLevel(set: AlertLevelSet, previous: number | null, current: number, modern: boolean): AlertLevel | null {
  if (previous === null || !finite(previous) || !finite(current) || previous === current) return null;
  const up = current > previous;
  const hits = set.levels.filter(({ price }) => up ? (modern ? previous < price && current >= price : previous <= price && current > price) : (modern ? previous > price && current <= price : previous >= price && current < price));
  if (!hits.length) return null;
  return up ? hits[hits.length - 1] : hits[0];
}
