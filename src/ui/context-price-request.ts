import Decimal from 'decimal.js';
import type { Instrument } from '../domain/types';
import type { PaperAccount } from '../domain/paper';
import { paperInstrumentKey } from '../domain/paper-brackets';
import { tickDecimals } from './data-window-model';

export type ContextPriceOutcome = 'saved' | 'cancelled' | 'replaced';
export interface ContextPriceRequest {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly action: 'price-alert' | 'paper-ticket';
  readonly price: number;
  readonly priceText: string;
  readonly instrument: Readonly<Instrument>;
  readonly chartId: string;
  readonly sourceKey: string;
  readonly style: string;
  readonly executionIdentity: string;
  readonly pointTime: number | null;
  readonly pointIndex: number | null;
  readonly paperOwner: Readonly<{ id: string; mode: PaperAccount['mode']; runId: string }> | null;
  /** A virtual ticket preset (the price scale + menu rows); absent keeps the Buy Limit draft default. */
  readonly order?: Readonly<ContextOrderPreset>;
}
export interface ContextOrderPreset { side: 'buy' | 'sell'; orderType: 'limit' | 'stop' }
export type ContextPriceRequestInput = Omit<ContextPriceRequest, 'schemaVersion' | 'priceText'>;
export interface ContextPriceProps {
  contextRequest?: ContextPriceRequest | null;
  assertContextCurrent?: (request: ContextPriceRequest, phase?: 'seed' | 'use') => void;
  onContextComplete?: (request: ContextPriceRequest, outcome: ContextPriceOutcome) => void;
}
export const CONTEXT_PRICE_LIMITS = Object.freeze({ sourceBytes: 16384, requestBytes: 32768, priceCharacters: 80, identityCharacters: 200, executionCharacters: 2048 });
const instrumentFields = ['id', 'symbol', 'name', 'exchange', 'currency', 'assetClass', 'tickSize', 'lotSize', 'timezone'];
function record(value: unknown, names: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label} must be plain data.`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) throw new Error(`${label} has unsupported or missing fields.`);
  const fields = Object.getOwnPropertyDescriptors(value);
  if (names.some(key => !fields[key]?.enumerable || !('value' in fields[key]))) throw new Error(`${label} fields must be enumerable data without accessors.`);
  return Object.fromEntries(names.map(key => [key, fields[key].value]));
}
const ALERT_ASSET_CLASSES: readonly string[] = ['stock', 'etf', 'index', 'option', 'future', 'forex', 'crypto', 'commodity', 'bond', 'other'];
/** The instrument identity a clicked-price request carries. A virtual ticket needs an instrument the paper account can
 * trade (stocks and ETFs, paperInstrumentKey); a price alert watches any charted market, live crypto included, so it
 * checks the same bounded metadata for every asset class. */
export function contextInstrumentKey(instrument: Instrument, action: ContextPriceRequest['action']): string {
  if (action === 'paper-ticket') return paperInstrumentKey(instrument);
  const bounded = (value: unknown, maximum: number, empty = false) => typeof value === 'string' && value.length <= maximum && (empty || value.trim().length > 0);
  if (!instrument || !ALERT_ASSET_CLASSES.includes(instrument.assetClass) || !bounded(instrument.id, 256) || ['__proto__', 'prototype', 'constructor'].includes(instrument.id) || !bounded(instrument.symbol, 64) || !bounded(instrument.exchange, 100, true) || !bounded(instrument.name, 500) || !bounded(instrument.timezone, 100) || typeof instrument.currency !== 'string' || !/^[A-Z]{3}$/.test(instrument.currency)) throw new Error('The clicked chart has no supported instrument for this action.');
  if (!Number.isFinite(instrument.tickSize) || instrument.tickSize <= 0) throw new Error('The clicked chart has no supported price increment.');
  return JSON.stringify([instrument.id, instrument.symbol, instrument.exchange, instrument.currency, instrument.assetClass, instrument.tickSize, instrument.lotSize]);
}
function text(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error(`${label} must be bounded nonempty text.`);
  return value;
}
/** The clicked price at the instrument's displayed price precision (decimals implied by tickSize, the same as the Data Window and menu label). Not snapped to a tick multiple. */
export function contextRoundedPrice(price: number, tickSize: number): number {
  return new Decimal(price).toDecimalPlaces(tickDecimals(tickSize), Decimal.ROUND_HALF_UP).toNumber();
}
/** Menu-label text for the clicked price: identical to the seeded alert value. */
export function contextPriceLabel(price: number, tickSize: number): string {
  return new Decimal(contextRoundedPrice(price, tickSize)).toFixed(tickDecimals(tickSize));
}
/** Preserve the exact decimal representation of the supplied number. No tick snapping. */
export function contextPriceText(price: number): string {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 1e15) throw new Error('Clicked price must be positive, finite and at most 1000000000000000.');
  const result = new Decimal(price).toFixed();
  if (result.length > CONTEXT_PRICE_LIMITS.priceCharacters || Number(result) !== price) throw new Error('Clicked price exceeds the supported exact decimal input range.');
  return result;
}
/** Side and order type a clicked-price ticket opens with: the price scale menu preset, else Buy Limit. */
export function contextOrderDraft(request: Pick<ContextPriceRequest, 'order'>): { side: 'buy' | 'sell'; type: 'limit' | 'stop' } {
  return { side: request.order?.side ?? 'buy', type: request.order?.orderType ?? 'limit' };
}
/** Pure data construction only. Root must separately register exact request authority. */
export function buildContextPriceRequestData(input: ContextPriceRequestInput): ContextPriceRequest {
  const row = record(input, ['id', 'action', 'price', 'instrument', 'chartId', 'sourceKey', 'style', 'executionIdentity', 'pointTime', 'pointIndex', 'paperOwner', ...('order' in (input as object) ? ['order'] : [])], 'Clicked-price request');
  if (row.action !== 'price-alert' && row.action !== 'paper-ticket') throw new Error('Unsupported clicked-price action.');
  const instrument = record(row.instrument, instrumentFields, 'Clicked instrument') as unknown as Instrument;
  contextInstrumentKey(instrument, row.action);
  const roundedPrice = typeof row.price === 'number' && Number.isFinite(row.price) ? contextRoundedPrice(row.price, instrument.tickSize) : row.price, priceText = (contextPriceText(roundedPrice as number), contextPriceLabel(roundedPrice as number, instrument.tickSize)), sourceKey = text(row.sourceKey, CONTEXT_PRICE_LIMITS.sourceBytes, 'Source identity');
  if (new TextEncoder().encode(sourceKey).byteLength > CONTEXT_PRICE_LIMITS.sourceBytes) throw new Error('Clicked source identity exceeds 16 KiB.');
  if (row.pointTime !== null && (!Number.isSafeInteger(row.pointTime) || (row.pointTime as number) < -62135596800 || (row.pointTime as number) > 253402300799)) throw new Error('Clicked time must be a supported Unix second or null.');
  if (row.pointIndex !== null && (!Number.isSafeInteger(row.pointIndex) || (row.pointIndex as number) < 0 || (row.pointIndex as number) >= 1000000)) throw new Error('Clicked bar index is outside the supported prefix range.');
  if ((row.pointIndex === null) !== (row.pointTime === null)) throw new Error('A loaded clicked bar needs both its index and time; an unloaded point needs neither.');
  let paperOwner: ContextPriceRequest['paperOwner'] = null;
  if (row.paperOwner !== null) {
    const owner = record(row.paperOwner, ['id', 'mode', 'runId'], 'Virtual account owner');
    if (owner.mode !== 'paper' && owner.mode !== 'replay-paper') throw new Error('Unsupported virtual account mode.');
    paperOwner = Object.freeze({ id: text(owner.id, 256, 'Account identity'), mode: owner.mode, runId: text(owner.runId, 256, 'Account run identity') });
  }
  if ((row.action === 'paper-ticket') !== (paperOwner !== null)) throw new Error('Only a virtual ticket must name an exact virtual account owner.');
  let order: Readonly<ContextOrderPreset> | undefined;
  if ('order' in row) {
    if (row.action !== 'paper-ticket') throw new Error('Only a virtual ticket can carry an order preset.');
    const preset = record(row.order, ['side', 'orderType'], 'Order preset');
    if ((preset.side !== 'buy' && preset.side !== 'sell') || (preset.orderType !== 'limit' && preset.orderType !== 'stop')) throw new Error('Unsupported order preset.');
    order = Object.freeze({ side: preset.side, orderType: preset.orderType });
  }
  const result: ContextPriceRequest = { schemaVersion: 1, id: text(row.id, 200, 'Request identity'), action: row.action, price: roundedPrice as number, priceText, instrument: Object.freeze(instrument), chartId: text(row.chartId, 200, 'Chart identity'), sourceKey, style: text(row.style, 100, 'Chart style'), executionIdentity: text(row.executionIdentity, CONTEXT_PRICE_LIMITS.executionCharacters, 'Execution identity'), pointTime: row.pointTime as number | null, pointIndex: row.pointIndex as number | null, paperOwner, ...(order ? { order } : {}) };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > CONTEXT_PRICE_LIMITS.requestBytes) throw new Error('Clicked-price request exceeds 32 KiB.');
  return Object.freeze(result);
}

/** Child-side invariant checks supplement, but never replace, root's private authority. */
export function assertContextPriceRequest(props: ContextPriceProps, request: ContextPriceRequest, action: ContextPriceRequest['action'], instrument: Instrument, phase: 'seed' | 'use' = 'use'): void {
  if (props.contextRequest !== request || request.action !== action || !props.assertContextCurrent || !props.onContextComplete) throw new Error('The clicked-price request is unavailable or was replaced.');
  props.assertContextCurrent(request, phase);
  if (contextInstrumentKey(request.instrument, action) !== contextInstrumentKey(instrument, action) || request.instrument.timezone !== instrument.timezone || request.instrument.name !== instrument.name) throw new Error('The clicked instrument changed. Reopen its chart menu.');
}
