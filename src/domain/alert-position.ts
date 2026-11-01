/**
 * Long/Short position drawing alerts. One price condition covers entry, take
 * profit and stop loss: the first entry crossing notifies once and the alert stays
 * active; the first later take-profit or stop-loss notifies once and the alert
 * stops. Policies marked LV below are local choices where reference behavior is
 * unresolved (initial state beyond a level, same-observation ordering, deletion).
 */
import { isPositionDrawing } from './position-drawing';

export interface AlertPositionLevels { schemaVersion: 1; drawingId: string; side: 'long' | 'short'; entry: number; target: number; stop: number; quantity: number; ticker: string; currency: string; }
export type AlertPositionPhase = 'waiting-entry' | 'entered' | 'exited';
export type AlertPositionLevel = 'entry' | 'target' | 'stop';
export const ALERT_POSITION_PHASES: readonly AlertPositionPhase[] = Object.freeze(['waiting-entry', 'entered', 'exited']);
export const ALERT_POSITION_LEVELS: readonly AlertPositionLevel[] = Object.freeze(['entry', 'target', 'stop']);
export const ALERT_POSITION_POLICY = 'Long/Short position alerts: the first price reaching the entry from either side notifies once and the alert stays active; afterwards the first take profit or stop loss notifies once and the alert stops. If the first observation is already between entry and take profit, entry counts as passed and exits are monitored without an entry notification. OpenCandle policies pending reference comparison: a first observation beyond take profit or stop waits for an entry crossing; one observation reports at most one level (entry first); moving the drawing levels restarts the alert with new levels and keeps history; a missing drawing keeps the last captured levels.';
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= limit;
const KEYS = ['schemaVersion', 'drawingId', 'side', 'entry', 'target', 'stop', 'quantity', 'ticker', 'currency'];

export function validateAlertPosition(value: unknown): asserts value is AlertPositionLevels {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Position alert levels must be a plain object.');
  const own = Reflect.ownKeys(value);
  if (own.length !== KEYS.length || !KEYS.every(key => own.includes(key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value') && Object.getOwnPropertyDescriptor(value, key)!.enumerable)) throw new Error('Position alert levels have unsupported fields.');
  const p = value as Record<string, unknown>;
  if (p.schemaVersion !== 1 || !text(p.drawingId, 200) || !text(p.ticker, 64) || !text(p.currency, 16) || !finite(p.entry) || !finite(p.target) || !finite(p.stop) || !finite(p.quantity) || p.quantity < 0) throw new Error('Position alert levels require identities, finite prices and a nonnegative quantity.');
  if (p.side === 'long' ? !(p.stop < p.entry && p.entry < p.target) : p.side === 'short' ? !(p.target < p.entry && p.entry < p.stop) : true) throw new Error('Position alert levels must keep take profit and stop loss on opposite sides of the entry.');
}
export function samePositionLevels(a: AlertPositionLevels, b: AlertPositionLevels): boolean {
  return a.side === b.side && a.entry === b.entry && a.target === b.target && a.stop === b.stop && a.quantity === b.quantity;
}

/** The lot size when the drawing's Stop from ATR (props.lvPositionAtr) is on, else null. The lot size is props.lvPositionInputs.lotSize
 *  when it is a positive number, else 1 (a position without saved inputs shows quantities in lots of 1). */
function atrStopLot(props: Record<string, unknown>): number | null {
  const atr = props.lvPositionAtr as { enabled?: unknown } | undefined;
  if (!atr || typeof atr !== 'object' || Array.isArray(atr) || atr.enabled !== true) return null;
  const lot = (props.lvPositionInputs as { lotSize?: unknown } | undefined)?.lotSize;
  return finite(lot) && lot > 0 ? lot : 1;
}
/** Read a placed Long/Short drawing: anchors are entry, stop, target; size = balance x risk% / |entry - stop|. No defaults are assumed. */
export function capturePositionDrawing(drawing: unknown, instrument: { symbol: string; currency: string }): { ok: true; position: AlertPositionLevels } | { ok: false; diagnostics: string[] } {
  try {
    if (!drawing || typeof drawing !== 'object') throw new Error('This drawing is not a Long/Short position.');
    const record = drawing as { id?: unknown; type?: unknown; paneId?: unknown; anchors?: unknown; props?: unknown };
    if (!isPositionDrawing(record.type) || !text(String(record.id ?? ''), 200)) throw new Error('This drawing is not a Long/Short position.');
    if (record.paneId !== 'price') throw new Error('Position alerts require a Long/Short drawing on the main price pane.');
    if (!Array.isArray(record.anchors) || record.anchors.length !== 3) throw new Error('Finish placing the Long/Short drawing before creating its alert.');
    const prices = record.anchors.map(anchor => (anchor as { price?: unknown })?.price);
    if (!prices.every(finite)) throw new Error('Long/Short drawing levels must be finite prices.');
    const [entry, stop, target] = prices as number[];
    const props = record.props as { riskPercent?: unknown; accountBalance?: unknown; [key: string]: unknown } | undefined;
    if (!props || !finite(props.riskPercent) || !finite(props.accountBalance) || props.riskPercent < 0 || props.accountBalance < 0) throw new Error('The Long/Short drawing has no saved account size and risk, so its quantity is unknown.');
    const risk = Math.abs(entry - stop), raw = risk < 1e-9 ? 0 : props.accountBalance * (props.riskPercent / 100) / risk, lot = atrStopLot(props);
    // Stop from ATR sizes whole lots, as the drawing shows: floor(risk amount / (k x ATR x lot size)) lots of `lot` units
    // (the saved stop is the ATR stop, so |entry - stop| is k x ATR). The tolerance reads 2999.9999999999995 as 3000.
    const quantity = lot === null ? raw : Math.max(0, Math.floor(raw / lot * (1 + 1e-12))) * lot;
    const position: AlertPositionLevels = { schemaVersion: 1, drawingId: String(record.id), side: target >= entry ? 'long' : 'short', entry, target, stop, quantity, ticker: instrument.symbol, currency: instrument.currency };
    validateAlertPosition(position);
    return { ok: true, position };
  } catch (error) { return { ok: false, diagnostics: [error instanceof Error ? error.message : String(error)] }; }
}

export interface AlertPositionStep { phase: AlertPositionPhase; level: AlertPositionLevel | null; diagnostic: string | null; }
/** Pure state transition for one usable price observation. `previous` is null after arming, a gap or a correction. */
export function evaluatePositionStep(position: AlertPositionLevels, phase: AlertPositionPhase, previous: number | null, current: number): AlertPositionStep {
  const long = position.side === 'long';
  if (phase === 'exited') return { phase, level: null, diagnostic: null };
  if (phase === 'entered') {
    if (long ? current >= position.target : current <= position.target) return { phase: 'exited', level: 'target', diagnostic: null };
    if (long ? current <= position.stop : current >= position.stop) return { phase: 'exited', level: 'stop', diagnostic: null };
    return { phase, level: null, diagnostic: null };
  }
  if (previous === null) {
    const inside = long ? current > position.entry && current < position.target : current < position.entry && current > position.target;
    if (inside) return { phase: 'entered', level: null, diagnostic: 'Entry was already passed when monitoring began. Take profit and stop loss are monitored without an entry notification.' };
    const beyond = long ? current >= position.target || current <= position.stop : current <= position.target || current >= position.stop;
    return { phase, level: null, diagnostic: beyond ? 'The first price seen is already past take profit or stop loss. The alert waits for price to cross the entry.' : null };
  }
  const crossed = previous < position.entry && current >= position.entry || previous > position.entry && current <= position.entry;
  return crossed ? { phase: 'entered', level: 'entry', diagnostic: null } : { phase, level: null, diagnostic: null };
}

const LABEL: Record<AlertPositionLevel, string> = { entry: 'Entry', target: 'Take profit', stop: 'Stop loss' };
const shortNumber = (value: number) => String(Number(value.toPrecision(12)));
/** Ticker, triggered level, observed price, quantity and PnL at that price. Formatting is an LV choice. */
export function positionAlertSummary(position: AlertPositionLevels, level: AlertPositionLevel, price: number): string {
  const pnl = (position.side === 'long' ? price - position.entry : position.entry - price) * position.quantity;
  const sign = pnl > 0 ? '+' : pnl < 0 ? '-' : '';
  return `${position.ticker} ${position.side === 'long' ? 'Long' : 'Short'} position: ${LABEL[level]} ${shortNumber(position[level])} reached at ${shortNumber(price)}. Quantity ${shortNumber(position.quantity)}. PnL ${sign}${Math.abs(pnl).toFixed(2)} ${position.currency}.`;
}
export function positionAlertMessage(userMessage: string, position: AlertPositionLevels, level: AlertPositionLevel, price: number): string {
  const summary = positionAlertSummary(position, level, price), trimmed = userMessage.trim();
  const message = trimmed ? `${trimmed}\n${summary}` : summary;
  return message.length > 4000 ? message.slice(0, 3999) + '…' : message;
}
export function describePosition(position: AlertPositionLevels): string {
  return `${position.side === 'long' ? 'Long' : 'Short'} entry ${shortNumber(position.entry)}, take profit ${shortNumber(position.target)}, stop loss ${shortNumber(position.stop)}, quantity ${shortNumber(position.quantity)}`;
}
