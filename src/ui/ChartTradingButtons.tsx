import React from 'react';
import './chart-commands.css';
import {ChartTradingButtonsPlacement,type ChartTradingPlacement} from './ChartTradingButtonsPlacement';

/**
 * Virtual Buy and Sell buttons drawn inside the main chart pane (presentational; the workspace mounts and wires it). Layout and colors are
 * LV-chosen. The group sits below the legend block, so it never covers a legend row or its buttons, and it is not rendered
 * while the legend is collapsed or open for editing. It never mentions an account or order identity.
 */
export const LAST_IMPORTED_BUTTON_LABEL = 'last imported price';
export const LAST_PRICE_BUTTON_LABEL = 'last price';
export const TRADING_BUTTONS_GAP = 6;
export const ACTIVATION_WINDOW_MS = 750;
export interface ActivationGuard { run: (key: string, action: (commandId: string) => boolean | void) => 'ran' | 'blocked'; }
/**
 * Same idea as the ticket's re-entry guard: one user action places one order. An identical activation (same key) is ignored until the short
 * window closes; each accepted activation carries a fresh command identity that the engine also recognizes. An action that returns false
 * (it was refused) does not open the window, so the user can try again at once. No wall clock is read: a timer only reopens the window.
 */
export function createActivationGuard(windowMs: number = ACTIVATION_WINDOW_MS, schedule: (reopen: () => void, ms: number) => unknown = (reopen, ms) => setTimeout(reopen, ms)): ActivationGuard {
  let recent: string | null = null;
  return {
    run(key, action) {
      if (recent === key) return 'blocked';
      const commandId = `chart-${globalThis.crypto.randomUUID()}`;
      if (action(commandId) === false) return 'ran';
      recent = key; schedule(() => { if (recent === key) recent = null; }, windowMs);
      return 'ran';
    },
  };
}
const sharedGuard = createActivationGuard();

export interface ChartTradingQuote { bid: number; ask: number; basis?: 'last-imported-bar'; }
export interface ChartTradingButtonsProps {
  /** Optional actual-pane geometry; omitted keeps the original pure presentational contract. */
  placement?:ChartTradingPlacement;
  /** Chart settings, Trading, "Buy/sell buttons". */
  visible: boolean;
  legend: 'normal' | 'collapsed' | 'editing';
  /** Pixels from the top of the main pane to the bottom edge of the legend block. */
  legendBottom: number;
  quote: ChartTradingQuote | null;
  /** The last streamed price, shown on both buttons when there is no paper quote (a live feed the virtual engine
   * does not quote, such as crypto), instead of blank buttons and "No quote". Display only: orders still use `quote`. */
  lastPrice?: number | null;
  digits: number;
  presetName: string | null;
  presetTooltip: string | null;
  oneClick: boolean;
  disabledReason?: string | null;
  /** Reports a click on a refused button (the reason); absent, a refused button is plainly disabled. */
  onRefused?: (reason: string) => void;
  /** Changes whenever the account, preset or instrument the buttons act on changes, so a deliberate second order after a change is allowed. */
  actionKey?: string;
  guard?: ActivationGuard;
  /** Receives the command identity of this activation. Return false when the action was refused. */
  onBuy: (commandId: string, quantity?: string) => boolean | void;
  onSell: (commandId: string, quantity?: string) => boolean | void;
  /** The quantity box between Sell and Buy. Shown only when a change handler is given. Empty means the preset or ticket default. */
  quantity?: string;
  onQuantity?: (value: string) => void;
  /** In a multi-chart layout the cell is small and the group can sit over drawing labels (a fib's level text).
   * The group is then see-through: translucent until hovered or focused, and clicks pass through except on its controls. */
  seeThrough?: boolean;
}
/** Where the group sits, as pane pixels. Exposed so layout measurements and tests use the same numbers. */
export function chartTradingButtonsBox(legendBottom: number): { top: number; left: number } { return { top: Math.max(0, legendBottom) + TRADING_BUTTONS_GAP, left: 8 }; }

export function ChartTradingButtons(props: ChartTradingButtonsProps) {
  if (!props.visible || props.legend !== 'normal') return null;
  const { top, left } = chartTradingButtonsBox(props.legendBottom), selected = props.presetName !== null;
  const price = (value: number | undefined) => value === undefined ? '' : value.toFixed(props.digits);
  const title = (side: 'Buy' | 'Sell') => {
    // Tooltips stay short (name and effect); without a preset there is nothing to add.
    const lead = props.presetTooltip ? `${props.presetTooltip}. ` : '';
    return props.disabledReason ? props.disabledReason : lead + (props.oneClick ? `${side} places the order at once with virtual funds.` : `${side} opens the order ticket.`);
  };
  const shown = props.quote ?? (typeof props.lastPrice === 'number' && Number.isFinite(props.lastPrice) ? { bid: props.lastPrice, ask: props.lastPrice } : null);
  const guard = props.guard ?? sharedGuard;
  const activate = (side: 'Buy' | 'Sell', handler: (commandId: string, quantity?: string) => boolean | void) => () => { guard.run(`${side}|${props.actionKey ?? ''}|${props.quantity ?? ''}`, commandId => handler(commandId, props.onQuantity ? props.quantity : undefined)); };
  const spread = props.quote && props.quote.ask > props.quote.bid ? (props.quote.ask - props.quote.bid).toFixed(props.digits) : null;
  // With onRefused, a refused Buy or Sell (the workspace is busy, a derived symbol) still
  // answers a click by reporting why, instead of a silent disabled button.
  const refused = Boolean(props.disabledReason) && !!props.onRefused;
  const button = (side: 'Buy' | 'Sell', value: number | undefined, onClick: () => void) => (
    <button type="button" className={'lv-trade-button ' + side.toLowerCase() + (selected ? ' selected' : '')} aria-label={value === undefined ? side : `${side} at ${price(value)}`} title={title(side)} disabled={Boolean(props.disabledReason) && !refused} aria-disabled={refused || undefined} data-preset-selected={selected ? 'true' : 'false'} onClick={refused ? () => props.onRefused!(props.disabledReason!) : onClick}>
      <span>{side}</span>{value !== undefined && <b>{price(value)}</b>}
    </button>
  );
  const content = (
    // With a placement, the placement owns top and left. React writing top from legendBottom (which moves when the
    // placement publishes --lv-trade-buttons-h) replaced the placement's value until its next frame and dropped the group
    // over the legend rows for a frame.
    <div role="group" aria-label="Virtual trading" className="lv-trade-buttons" data-lv-see-through={props.seeThrough ? 'true' : undefined} style={props.placement ? { position: 'absolute' } : { position: 'absolute', top, left }}>
      {button('Sell', shown?.bid, activate('Sell', props.onSell))}
      {spread !== null && <small className="lv-trade-spread" title="Spread" aria-label={'Spread ' + spread}>{spread}</small>}
      {props.onQuantity && <input type="text" inputMode="decimal" className="lv-trade-qty" aria-label="Chart order quantity" title="Units for the next Buy or Sell. Leave empty to use the preset or ticket default." placeholder="Qty" size={5} value={props.quantity ?? ''} onChange={event => props.onQuantity!(event.target.value)} />}
      {button('Buy', shown?.ask, activate('Buy', props.onBuy))}
      <small>{props.quote ? (props.quote.basis === 'last-imported-bar' ? LAST_IMPORTED_BUTTON_LABEL : '') : shown ? LAST_PRICE_BUTTON_LABEL : 'No quote'}</small>
      <small>{props.presetName ? `Preset: ${props.presetName}` : ''}</small>
    </div>
  );
  return props.placement?<ChartTradingButtonsPlacement placement={props.placement} gap={TRADING_BUTTONS_GAP}>{content}</ChartTradingButtonsPlacement>:content;
}
