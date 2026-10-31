import type { Bar, BarDataset, Instrument } from './types';
import type { AlertNotification, LocalAlert } from './alerts';
import type { AlertPlotValue } from './alert-observation';
import type { AlertStrategyFill } from './strategy-alert';

/**
 * Local message placeholders, substituted once when a trigger is recorded. The
 * saved alert keeps its template; history keeps the rendered text. Unknown
 * placeholders, and values LV cannot establish for that trigger, stay verbatim.
 * Every value is the one recorded for the trigger bar: the supplied row, the plots of the alert's indicator or script
 * calculated on the prefix ending at that row, and the strategy fill on that row.
 *
 * Placeholder catalog, spelling and number format. The names follow the common
 * double-brace style ({{plot_0}}, {{plot("Title")}}, {{syminfo.*}}, {{strategy.*}}); numbers are printed in
 * full JavaScript precision (no rounding to the tick) and the syminfo fields read LV's instrument record.
 */
export type AlertPlaceholderGroup = 'Symbol' | 'Bar' | 'Time' | 'Plots' | 'Strategy';
export interface AlertPlaceholderInfo { readonly token: string; readonly group: AlertPlaceholderGroup; readonly help: string; }
const info = (group: AlertPlaceholderGroup, rows: ReadonlyArray<readonly [string, string]>) => rows.map(([token, help]) => Object.freeze({ token, group, help }));
export const ALERT_MESSAGE_PLACEHOLDER_CATALOG: readonly AlertPlaceholderInfo[] = Object.freeze([
  ...info('Symbol', [['{{ticker}}', 'Symbol name'], ['{{exchange}}', 'Exchange'], ['{{interval}}', 'Chart interval'], ['{{syminfo.ticker}}', 'Symbol name'], ['{{syminfo.tickerid}}', 'Exchange and symbol (EXCHANGE:SYMBOL)'], ['{{syminfo.prefix}}', 'Exchange prefix'], ['{{syminfo.description}}', 'Instrument description'], ['{{syminfo.currency}}', 'Price currency'], ['{{syminfo.basecurrency}}', 'Base currency of a crypto pair'], ['{{syminfo.type}}', 'Instrument type'], ['{{syminfo.mintick}}', 'Minimum price tick'], ['{{syminfo.timezone}}', 'Exchange time zone']]),
  ...info('Bar', [['{{open}}', 'Open of the trigger bar'], ['{{high}}', 'High of the trigger bar'], ['{{low}}', 'Low of the trigger bar'], ['{{close}}', 'Close of the trigger bar'], ['{{volume}}', 'Volume of the trigger bar']]),
  ...info('Time', [['{{time}}', 'Trigger bar time, UTC'], ['{{timenow}}', 'Trigger time, UTC']]),
  ...info('Plots', [['{{plot_0}}', 'First plot of the alert\'s indicator or script; {{plot_1}} the second, and so on'], ['{{plot("Title")}}', 'The plot with this exact title']]),
  ...info('Strategy', [['{{strategy.order.action}}', 'buy or sell'], ['{{strategy.order.contracts}}', 'Units of the filled order'], ['{{strategy.order.price}}', 'Fill price'], ['{{strategy.order.id}}', 'Name of the filled order'], ['{{strategy.position_size}}', 'Position after the fill (negative when short)'], ['{{strategy.market_position}}', 'long, short or flat after the fill'], ['{{strategy.market_position_size}}', 'Absolute position size after the fill'], ['{{strategy.prev_market_position}}', 'long, short or flat before the fill'], ['{{strategy.prev_market_position_size}}', 'Absolute position size before the fill']]),
]);
export const ALERT_MESSAGE_PLACEHOLDERS = Object.freeze(ALERT_MESSAGE_PLACEHOLDER_CATALOG.map(row => row.token.slice(2, -2)).filter(name => /^[a-z][a-z0-9_.]*$/.test(name)));
export type AlertMessagePlaceholder = string;
export const ALERT_MESSAGE_PLACEHOLDER_HELP = 'Placeholders such as {{ticker}}, {{close}} and {{plot_0}} are replaced with the values of the trigger bar when the alert fires. {{time}} is that bar\'s time and {{timenow}} the trigger time, both UTC (yyyy-MM-ddTHH:mm:ssZ). Plot placeholders read the alert\'s indicator or script, and strategy placeholders a strategy order-fill alert. Unavailable or unknown placeholders are kept as typed.';
export const ALERT_MESSAGE_LIMIT = 4000;
export type AlertMessageInstrument = Pick<Instrument, 'symbol' | 'name' | 'exchange' | 'currency' | 'assetClass' | 'tickSize' | 'timezone'>;
export interface AlertMessageValues {
  ticker: string; exchange: string; interval: string; bar: Pick<Bar, 'time' | 'open' | 'high' | 'low' | 'close'> & { volume?: number } | null; triggeredAt: number;
  /** Optional sources of the syminfo, plot and strategy placeholders. Absent values stay verbatim. */
  instrument?: AlertMessageInstrument | null; plots?: readonly AlertPlotValue[] | null; fill?: AlertStrategyFill | null;
}

export function alertUtcTime(seconds: number): string | null {
  if (!Number.isFinite(seconds)) return null; const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString().replace(/\.\d{3}Z$/, 'Z') : null;
}
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
const text = (value: unknown) => typeof value === 'string' && value ? value : null;
const side = (size: number) => size > 0 ? 'long' : size < 0 ? 'short' : 'flat';
/** A crypto pair written BASE-QUOTE, BASE/QUOTE or BASEQUOTE whose quote is the price currency. */
function baseCurrency(instrument: AlertMessageInstrument): string | null {
  if (instrument.assetClass !== 'crypto' || !instrument.currency) return null;
  const symbol = instrument.symbol.toUpperCase(), quote = instrument.currency.toUpperCase();
  const pair = /^([A-Z0-9]+)[-/]([A-Z0-9]+)$/.exec(symbol);
  if (pair) return pair[2] === quote ? pair[1] : null;
  return symbol.length > quote.length && symbol.endsWith(quote) ? symbol.slice(0, -quote.length) : null;
}
function value(name: string, values: AlertMessageValues): string | null {
  const instrument = values.instrument ?? null, fill = values.fill ?? null;
  const plot = /^plot_(0|[1-9][0-9]{0,3})$/.exec(name);
  if (plot) return number(values.plots?.[Number(plot[1])]?.value);
  switch (name) {
    case 'ticker': return values.ticker || null;
    case 'exchange': return values.exchange || null;
    case 'interval': return values.interval || null;
    case 'open': case 'high': case 'low': case 'close': return values.bar ? number(values.bar[name as 'open']) : null;
    case 'volume': return values.bar ? number(values.bar.volume) : null;
    case 'time': return values.bar ? alertUtcTime(values.bar.time) : null;
    case 'timenow': return alertUtcTime(values.triggeredAt);
    case 'syminfo.ticker': return instrument ? text(instrument.symbol) : null;
    case 'syminfo.tickerid': return instrument && instrument.exchange && instrument.symbol ? `${instrument.exchange}:${instrument.symbol}` : null;
    case 'syminfo.prefix': return instrument ? text(instrument.exchange) : null;
    case 'syminfo.description': return instrument ? text(instrument.name) : null;
    case 'syminfo.currency': return instrument ? text(instrument.currency) : null;
    case 'syminfo.basecurrency': return instrument ? baseCurrency(instrument) : null;
    case 'syminfo.type': return instrument ? text(instrument.assetClass) : null;
    case 'syminfo.mintick': return instrument ? number(instrument.tickSize) : null;
    case 'syminfo.timezone': return instrument ? text(instrument.timezone) : null;
    case 'strategy.order.action': return fill ? fill.action : null;
    case 'strategy.order.contracts': return fill ? number(fill.contracts) : null;
    case 'strategy.order.price': return fill ? number(fill.price) : null;
    case 'strategy.order.id': return fill ? text(fill.orderId) : null;
    case 'strategy.position_size': return fill ? number(fill.positionSize) : null;
    case 'strategy.market_position': return fill ? side(fill.positionSize) : null;
    case 'strategy.market_position_size': return fill ? number(Math.abs(fill.positionSize)) : null;
    case 'strategy.prev_market_position': return fill ? side(fill.prevPositionSize) : null;
    case 'strategy.prev_market_position_size': return fill ? number(Math.abs(fill.prevPositionSize)) : null;
    default: return null;
  }
}
/** {{name}} (lowercase, digits, underscores, dotted) or {{plot("Title")}}. Spacing and case are exact, as typed placeholders. */
const PLACEHOLDER = /\{\{(?:([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)|plot\("([^"{}\r\n]{1,200})"\))\}\}/g;
/** Single pass: substituted text is never scanned again, so values cannot inject placeholders. Output is limited to the saved-message limit. */
export function renderAlertMessage(template: string, values: AlertMessageValues): string {
  const rendered = template.replace(PLACEHOLDER, (whole, name: string | undefined, title: string | undefined) => (name !== undefined ? value(name, values) : number(values.plots?.find(plot => plot.title === title)?.value)) ?? whole);
  return rendered.length > ALERT_MESSAGE_LIMIT ? rendered.slice(0, ALERT_MESSAGE_LIMIT - 1) + '…' : rendered;
}
const ANY_PLACEHOLDER = new RegExp(PLACEHOLDER.source);
export function alertMessageHasPlaceholders(template: string): boolean { return ANY_PLACEHOLDER.test(template); }
/** The plot and strategy fill values recorded with a trigger: the alert's own operand first, else its comparison target. */
export function alertTriggerOperandValues(notification: Pick<AlertNotification, 'observation'>): { plots: readonly AlertPlotValue[] | null; fill: AlertStrategyFill | null } {
  const operands = notification.observation?.operands; if (!operands) return { plots: null, fill: null };
  const plots = operands.left.plots?.length ? operands.left.plots : operands.right?.plots?.length ? operands.right.plots : null;
  return { plots, fill: operands.left.fill ?? operands.right?.fill ?? null };
}

/** Find the exact supplied row that produced a recorded trigger, or null when its basis was not recorded or does not match. */
export function alertTriggerRow(notification: AlertNotification, rows: ReadonlyArray<readonly Bar[]>): Bar | null {
  const observation = notification.observation; if (!observation) return null;
  for (const candidate of rows) { const row = candidate[observation.informationEndIndex]; if (row && row.time === observation.sourceTime) return row; }
  return null;
}

/**
 * Render templates only for notifications appended by this observation batch
 * (IDs absent before it). Returns the same array when nothing changes, so the
 * caller's exact-base publication semantics are preserved.
 */
export function renderNewAlertMessages(before: readonly LocalAlert[], after: LocalAlert[], context: { dataset: BarDataset; bars?: readonly Bar[] }): LocalAlert[] {
  const known = new Set<string>(); for (const alert of before) for (const item of alert.history) known.add(item.id);
  let changed = false;
  const next = after.map(alert => {
    if (alert.definition.instrumentId !== context.dataset.instrument.id) return alert;
    let history: AlertNotification[] | null = null;
    alert.history.forEach((item, index) => {
      if (known.has(item.id) || !alertMessageHasPlaceholders(item.message)) return;
      const message = renderAlertMessage(item.message, { ticker: context.dataset.instrument.symbol, exchange: context.dataset.instrument.exchange, interval: context.dataset.resolution, bar: alertTriggerRow(item, [context.dataset.bars, context.bars ?? []]), triggeredAt: item.at, instrument: context.dataset.instrument, ...alertTriggerOperandValues(item) });
      if (message === item.message) return;
      history ??= [...alert.history]; history[index] = { ...item, message };
    });
    if (!history) return alert; changed = true; return { ...alert, history };
  });
  return changed ? next : after;
}
