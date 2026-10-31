import type { PaperAccount } from '../domain/paper';
import { placePaperPreset, type PaperPreset } from '../domain/paper-presets';
import type { PaperTicketContext } from '../domain/paper-ticket';

/**
 * The price scale + menu's order rows with one-click trading (the price is anchored
 * to the selected level; one-click is off by default, and when on it places, modifies, cancels and closes immediately).
 * Off: the row opens the order ticket at the clicked price, as before. On: the order is placed at once, at the clicked price,
 * on the row's side and type., matching the chart Buy/Sell buttons: the quantity, validity and exits come from
 * the selected order preset (a unit count typed in the chart quantity box overrides the preset quantity), and with no
 * preset selected the ticket opens instead, because one-click has no quantity to use. Virtual money only.
 */
export type OneClickPriceOutcome =
  | { kind: 'ticket'; reason: string }
  | { kind: 'placed'; account: PaperAccount; orderId: string; message: string }
  | { kind: 'refused'; message: string };
export interface OneClickPriceInput {
  oneClick: boolean;
  preset: PaperPreset | null;
  /** The chart quantity box text; a plain unit count overrides the preset quantity. */
  quantityText?: string;
  order: { side: 'buy' | 'sell'; orderType: 'limit' | 'stop' };
  /** The clicked price as shown on the menu row (instrument precision, not snapped). */
  priceText: string;
  context: PaperTicketContext;
  commandId: string;
}

export function oneClickPriceOrder(input: OneClickPriceInput): OneClickPriceOutcome {
  if (!input.oneClick) return { kind: 'ticket', reason: 'One-click trading is off.' };
  if (!input.preset) return { kind: 'ticket', reason: 'No order preset is selected, so one-click has no quantity.' };
  const typed = input.quantityText?.trim() ?? '';
  const preset = /^(?:\d+\.?\d*|\.\d+)$/.test(typed) ? { ...input.preset, input: { ...input.preset.input, quantity: { kind: 'units' as const, value: typed } } } : input.preset;
  const result = placePaperPreset(preset, input.order.side, input.context, input.order.orderType === 'limit' ? { commandId: input.commandId, limitPriceText: input.priceText } : { commandId: input.commandId, stopPriceText: input.priceText });
  if (!result.ok) return { kind: 'refused', message: result.message };
  const order = result.account.orders.find(row => row.id === result.orderId)!;
  return { kind: 'placed', account: result.account, orderId: result.orderId, message: `Virtual ${order.side} ${order.type} ${order.quantity} ${order.instrument.symbol} at ${input.priceText} placed with one click.` };
}
