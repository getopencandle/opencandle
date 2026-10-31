import React, { useEffect, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { isAlpacaStubInstrument } from '../domain/alpaca-live';
/** In a run on the keyless Alpaca stub every US stock order fills on invented prices, so it is labelled SYNTHETIC. */
const stubInstrument = isAlpacaStubInstrument;
/** The fills table symbol, labelled SYNTHETIC in a stub run like the order rows. */
export function paperFillSymbol(account: Pick<PaperAccount, 'orders'>, fill: { orderId: string; instrumentId: string }): string { const order = account.orders.find(row => row.id === fill.orderId); return (order?.instrument.symbol ?? fill.instrumentId) + (order && stubInstrument(order.instrument) ? ' SYNTHETIC' : ''); }
import { formatPaperExpiry, paperPeriodExpiry, paperSessionBound } from '../domain/paper-expiry';
import { PAPER_EARLY_CLOSE } from '../domain/paper-ticket';
import { usMarketSession } from '../domain/us-market-hours';
import { attachPaperPositionExits, cancelPaperExitLevel, cancelPaperOrder, cancelPaperOrders, closePaperPosition, paperCancelCandidates, paperFeeFor, paperSlippageApplies, paperSlippedPrice, reversePaperPosition, configurePaperAccount, modifyPaperExitLevel, modifyPaperExitPlan, modifyPaperOrder, PAPER_NOTICE, PAPER_POLICIES, paperExitTarget, paperPositionExitTarget, paperSummary, previewPaperExitAllocation, processPaperQuote, resetPaperAccount, submitPaperOrder } from '../domain/paper';
import type { PaperAccount, PaperOrder, PaperCommission, PaperExitPlanInput, PaperOrderRequest, PaperOrderType, PaperResult, PaperSide } from '../domain/paper';
import { allocatePaperExitLevels, paperInstrumentKey, validatePaperExitPlan } from '../domain/paper-brackets';
import type { Instrument, Quote } from '../domain/types';
import { materializePaperTicket, paperTicketDayClose, parsePaperExpiryText, previewPaperTicket, type PaperQuoteSource, type PaperSizingBalance, type PaperQuantityInput, type PaperTicketContext, type PaperTicketInput, type PaperTicketPreview, type PaperExitValueInput } from '../domain/paper-ticket';
import {assertContextPriceRequest,contextOrderDraft,type ContextPriceProps,type ContextPriceRequest,type ContextPriceOutcome} from './context-price-request';
import { paperAvailableFunds, paperFillBasisLabel, paperMarginBuffer } from '../domain/paper';
import { createBookAccount, deleteBookAccount, guardPaperState, guardPaperStorage, listBookAccounts, ordersColumnsOf, renameBookAccount, selectBookAccount, setBookPresets, setOrdersColumns, type PaperBook, type PaperBookResult, type PaperState } from '../domain/paper-book';
import { applyPaperPreset, deletePaperPreset, PAPER_PRESET_FIELDS, presetInputFromTicket, presetSummary, savePaperPreset, type PaperPreset, type PaperPresetField } from '../domain/paper-presets';
import { exportPaperCsv, filterJournal, paperExportTable, paperPositionCloses, type PaperExportBridge, type PaperExportKind } from '../domain/paper-export';
import { LAST_IMPORTED_LABEL, UNKNOWN_SESSION_NOTE, isLastImportedQuote } from '../domain/paper-quote';
import './dialog-forms.css';
import { InfoTip } from './dialog-extras';
import { closeAllPaperDockPositions, paperDockPositionsFingerprint, paperPositionPnlPercent } from './PaperTradingDock';
import { chartZoneName, chartZoneOffsetText, formatChartDateTime, type ChartClockHours } from './chart-time-text';
import { openPaperDomPane, PAPER_DOM_PANE_NO_HOST } from './paper-dom-pane';
import {plainErrorText} from './user-error';

/** A new limit ticket opens with Extended hours ticked when the chart shows extended hours (ETH) and the
 * virtual clock is outside 09:30-16:00 New York time on a US equity. Regular-hours charts, regular hours and other instruments: off. */
export function paperExtendedHoursDefault(sessionMode: 'regular' | 'extended' | undefined, instrument: Pick<Instrument, 'assetClass' | 'timezone'>, nowSeconds: number): boolean {
  return sessionMode === 'extended' && paperSessionBound(instrument) && Number.isFinite(nowSeconds) && usMarketSession(nowSeconds * 1000) !== 'regular';
}
export interface PaperPanelProps extends ContextPriceProps { /** A plain reason orders are refused on this chart (a derived symbol); the ticket shows it and places nothing. */ tradingRefusal?: string | null; /** Session mode of the chart the ticket belongs to; absent behaves as regular hours. */ sessionMode?: 'regular' | 'extended'; account: PaperAccount; onAccountChange: (account: PaperAccount, expected?: PaperAccount) => boolean | void; instrument: Instrument; quote: Quote | null; quoteSource?: PaperQuoteSource | null; now: number; paperManager?: PaperManager; exportBridge?: PaperExportBridge; presetSeed?: PaperPresetSeed | null; /** The chart timezone (chartTimeZone) and hour cycle for the times this dialog shows. Default UTC, 24 hours. */ timezone?: string; timeHours?: ChartClockHours; }
export interface PaperTicketDraft { side: 'buy' | 'sell'; type: PaperOrderType; quantity: string; limitPrice: string; stopPrice: string; timeInForce: 'GTC' | 'DAY' | 'GTD' | 'WEEK' | 'MONTH'; expiresAt: string; extendedHours: boolean; quantityMode?: PaperQuantityInput['kind']; balanceBasis?: PaperSizingBalance; limitMode?: 'price' | 'side-ticks'; stopMode?: 'price' | 'side-ticks'; riskStopLevelId?: string; takeProfitOutsideRth?: boolean; expiryChanged?: boolean; /** Trailing stop only: how far the stop trails the best price, as a price distance or a percent. */ trailMode?: 'distance' | 'percent'; trailValue?: string; }
function strictNumber(text: string, name: string): number { if (!text.trim() || !Number.isFinite(Number(text))) throw new Error(`${name} must be a finite number.`); return Number(text); }
export function buildPaperRequest(draft: PaperTicketDraft, instrument: Instrument, exits: PaperExitPlanInput | null = null, now?: number): PaperOrderRequest {
  const period = draft.timeInForce === 'WEEK' ? 'week' : draft.timeInForce === 'MONTH' ? 'month' : null;
  const request: PaperOrderRequest = { instrument, side: draft.side, type: draft.type, quantity: strictNumber(draft.quantity, 'Quantity'), timeInForce: period ? 'GTD' : draft.timeInForce as 'GTC' | 'DAY' | 'GTD', extendedHours: draft.extendedHours };
  if (draft.type === 'trailing-stop') { if (draft.trailMode === 'percent') request.trailPercent = strictNumber(draft.trailValue ?? '', 'Trail percent'); else request.trailDistance = strictNumber(draft.trailValue ?? '', 'Trail distance'); }
  if (draft.type === 'limit' || draft.type === 'stop-limit') request.limitPrice = strictNumber(draft.limitPrice, 'Limit price');
  if (draft.type === 'stop' || draft.type === 'stop-limit') request.stopPrice = strictNumber(draft.stopPrice, 'Stop price');
  if (period) { if (now === undefined) throw new Error('Week and Month need the order time.'); request.expiresAt = paperPeriodExpiry(period, now, instrument, draft.extendedHours, PAPER_EARLY_CLOSE); }
  else if (draft.timeInForce !== 'GTC') { const parsed = Date.parse(draft.expiresAt); if (!Number.isFinite(parsed)) throw new Error('Choose an explicit expiration date and time.'); request.expiresAt = Math.floor(parsed / 1000); }
  if (exits) request.exits = validatePaperExitPlan(exits, instrument, draft.side);
  return request;
}
/**
 * ISO 8601 text on the chart wall clock with its UTC offset ("2026-10-23T09:30:00-04:00", DST-aware), from
 * chart-time-text. UTC keeps the "Z" text. The typed expiry field and the CSV zone columns use it. The text always parses back to the
 * same instant (else the UTC text); '' for a time it cannot show.
 */
export function paperZonedIsoText(seconds: number, zone = 'UTC'): string {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 253402300799) return '';
  const whole = Math.floor(seconds), utc = new Date(whole * 1000).toISOString().replace(/\.000Z$/, 'Z');
  if (zone === 'UTC' || zone === 'Etc/UTC') return utc;
  const wall = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(formatChartDateTime(whole, zone, { hours: '24', seconds: true, zone: false }));
  const offset = /^UTC(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(chartZoneOffsetText(whole, zone));
  if (!wall || !offset) return utc;
  const textValue = `${wall[1]}T${wall[2]}${offset[1] ? `${offset[1]}${offset[2].padStart(2, '0')}:${offset[3] ?? '00'}` : '+00:00'}`;
  return Date.parse(textValue) === whole * 1000 ? textValue : utc;
}
/** The typed expiry text for a stored time: ISO with the chart zone's offset, '' outside the formatPaperExpiry range. */
const expiryText = (seconds: number | undefined, zone = 'UTC') => { const expiry = formatPaperExpiry(seconds); return expiry.kind === 'scheduled' ? zone === 'UTC' ? expiry.text : paperZonedIsoText(seconds!, zone) || expiry.text : ''; };
/** An untouched expiry text shown again in the current chart zone (same instant); text that does not parse is left as it is. */
const rezonedExpiryText = (textValue: string, zone: string) => { try { return expiryText(parsePaperExpiryText(textValue), zone) || textValue; } catch { return textValue; } };
const EXPIRY_PLACEHOLDER_SECONDS = Date.UTC(2026, 9, 15, 12) / 1000;
/** The Day hint uses the ticket's own early-close calendar (paperTicketDayClose), so it names the close the order gets. */
function dayCloseHint(now: number, instrument: Instrument, extendedHours: boolean, shown: (seconds: number | undefined, suffix?: boolean) => string): string {
  const close = paperTicketDayClose(now, instrument, extendedHours), minute = close.closeMinute ?? (extendedHours ? 1200 : 960);
  const clock = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  return `Expires at the ${extendedHours ? 'extended-hours close' : 'regular close'} (${clock} New York time${close.earlyClose ? ', an NYSE early-close day' : ''}): ${shown(close.expiresAt, true)} if submitted now.`;
}
/** The one-line Day expiry under Time in force; dayCloseHint gives the full sentence in the info popover. */
function dayCloseShort(now: number, instrument: Instrument, extendedHours: boolean, shown: (seconds: number | undefined, suffix?: boolean) => string): string {
  const at = shown(paperTicketDayClose(now, instrument, extendedHours).expiresAt, true);
  return at ? `Expires ${at}` : 'Expires at the session close';
}
/** A time this dialog shows, on the chart wall clock ("2026-10-23 09:30:00", with " UTC-4" when `suffix`). The
 * formatPaperExpiry range gate keeps its blank for a missing or unsupported time; the table headers name the zone. */
export function paperPanelTime(seconds: number | undefined, zone = 'UTC', hours: ChartClockHours = '24', suffix = false): string {
  return formatPaperExpiry(seconds).kind === 'scheduled' ? formatChartDateTime(seconds!, zone, { hours, seconds: true, zone: suffix }) : '';
}
function orderExpiryCell(order: Pick<PaperOrder, 'expiresAt' | 'timeInForce'>, zone = 'UTC', hours: ChartClockHours = '24') {
  const expiry = formatPaperExpiry(order.expiresAt);
  const title = expiry.kind === 'unavailable' && expiry.rawSeconds !== undefined ? 'Stored expiry seconds: ' + expiry.rawSeconds : undefined;
  return <td title={title}>{expiry.kind === 'scheduled' ? paperPanelTime(order.expiresAt, zone, hours) : expiry.kind === 'missing' && order.timeInForce === 'GTC' ? 'No scheduled expiry' : 'Expiry unavailable'}</td>;
}
const draftFor = (quote: Quote | null, now: number, zone = 'UTC'): PaperTicketDraft => ({ side: 'buy', type: 'market', quantity: '1', limitPrice: quote ? String(quote.ask) : '', stopPrice: quote ? String(quote.ask) : '', timeInForce: 'DAY', expiresAt: expiryText(now + 86400, zone), extendedHours: false, quantityMode: 'units', balanceBasis: 'realized-balance', limitMode: 'price', stopMode: 'price', riskStopLevelId: '', takeProfitOutsideRth: false, expiryChanged: false });
function representedExits(plan: PaperExitPlanInput | null): PaperTicketInput['exits'] {
  return plan ? { mode: plan.mode, levels: plan.levels.map((level, index) => ({ id: `level-${index + 1}`, quantity: String(level.quantity), takeProfit: level.takeProfit === undefined ? null : { kind: 'price', value: String(level.takeProfit) }, stopLoss: level.stopLoss === undefined ? null : { kind: 'price', value: String(level.stopLoss) } })) } : null;
}
export function buildPaperTicketInput(draft: PaperTicketDraft, instrument: Instrument, exits: PaperTicketInput['exits'], editing: string | null): PaperTicketInput {
  const kind = draft.quantityMode ?? 'units', value = draft.quantity, basis = draft.balanceBasis ?? 'realized-balance';
  const quantity: PaperQuantityInput = kind === 'units' ? { kind, value } : kind === 'notional' ? { kind, value, currency: instrument.currency } : kind === 'balance-percent' ? { kind, value, basis } : kind === 'risk-money' ? { kind, value, currency: instrument.currency, stopLevelId: draft.riskStopLevelId ?? '' } : { kind, value, basis, stopLevelId: draft.riskStopLevelId ?? '' };
  const validity: PaperTicketInput['validity'] = editing && !draft.expiryChanged ? { kind: 'retain-existing', orderId: editing } : draft.timeInForce === 'DAY' && !editing ? { kind: 'day' } : draft.timeInForce === 'GTC' && !editing ? { kind: 'gtc' } : draft.timeInForce === 'WEEK' && !editing ? { kind: 'week' } : draft.timeInForce === 'MONTH' && !editing ? { kind: 'month' } : draft.timeInForce === 'GTD' || editing && draft.timeInForce === 'DAY' ? { kind: 'manual-expiry', expiresAt: parsePaperExpiryText(draft.expiresAt) } : (() => { throw new Error('An edited GTC order keeps its time in force. Cancel it and place a new order to change it.'); })();
  return { schemaVersion: 1, side: draft.side, type: draft.type === 'trailing-stop' ? 'stop' : draft.type, quantity, limit: ['limit', 'stop-limit'].includes(draft.type) ? { kind: draft.limitMode ?? 'price', value: draft.limitPrice } : null, stop: ['stop', 'stop-limit'].includes(draft.type) ? { kind: draft.stopMode ?? 'price', value: draft.stopPrice } : null, validity, entryOutsideRth: draft.extendedHours, takeProfitOutsideRth: draft.takeProfitOutsideRth ?? false, exits };
}
type Confirmation = { title: string; detail: string; execute: () => boolean | void };
export interface ExitLevelDraft { quantity: string; tp: string; sl: string; tpEnabled: boolean; slEnabled: boolean; id?: string; tpMode?: PaperExitValueInput['kind']; slMode?: PaperExitValueInput['kind']; tpBalanceBasis?: PaperSizingBalance; slBalanceBasis?: PaperSizingBalance; }
export function buildExitPlan(mode: PaperExitPlanInput['mode'], levels: ExitLevelDraft[], instrument: Instrument, side: 'buy' | 'sell'): PaperExitPlanInput {
  return validatePaperExitPlan({ schemaVersion: 1, mode, levels: levels.map(level => ({ quantity: strictNumber(level.quantity, 'Exit quantity'), ...(mode === 'multiple' || level.tpEnabled ? { takeProfit: strictNumber(level.tp, 'Take profit price') } : {}), ...(mode === 'multiple' || level.slEnabled ? { stopLoss: strictNumber(level.sl, 'Stop loss price') } : {}) })) }, instrument, side);
}
interface ExitEditor { title: string; instrument: Instrument; side: 'buy' | 'sell'; capacity: number | null; initial: PaperExitPlanInput | null; representations?: PaperTicketInput['exits']; context?: PaperTicketContext; entryPrice?: number; lockedLevel?: boolean; replacementNames?: string[]; preview?: (plan: PaperExitPlanInput) => ReturnType<typeof previewPaperExitAllocation>; apply: (plan: PaperExitPlanInput, representations?: PaperTicketInput['exits']) => boolean; }
const emptyExit = (): ExitLevelDraft => ({ quantity: '', tp: '', sl: '', tpEnabled: true, slEnabled: true, id: crypto.randomUUID(), tpMode: 'price', slMode: 'price', tpBalanceBasis: 'realized-balance', slBalanceBasis: 'realized-balance' });
function PaperExitEditor({ value, close }: { value: ExitEditor; close: () => void }) {
  const [mode, setMode] = useState<PaperExitPlanInput['mode']>(value.initial?.mode ?? 'single');
  const [levels, setLevels] = useState<ExitLevelDraft[]>(() => value.representations?.levels.map(level => ({ id: level.id, quantity: level.quantity, tp: level.takeProfit?.value ?? '', sl: level.stopLoss?.value ?? '', tpEnabled: level.takeProfit !== null, slEnabled: level.stopLoss !== null, tpMode: level.takeProfit?.kind ?? 'price', slMode: level.stopLoss?.kind ?? 'price', tpBalanceBasis: level.takeProfit && 'basis' in level.takeProfit ? level.takeProfit.basis : 'realized-balance', slBalanceBasis: level.stopLoss && 'basis' in level.stopLoss ? level.stopLoss.basis : 'realized-balance' })) ?? value.initial?.levels.map((level, index) => ({ id: `level-${index + 1}`, quantity: String(level.quantity), tp: level.takeProfit === undefined ? '' : String(level.takeProfit), sl: level.stopLoss === undefined ? '' : String(level.stopLoss), tpEnabled: level.takeProfit !== undefined, slEnabled: level.stopLoss !== undefined, tpMode: 'price', slMode: 'price', tpBalanceBasis: 'realized-balance', slBalanceBasis: 'realized-balance' })) ?? [emptyExit()]);
  const [error, setError] = useState(''), [replacementAccepted, setReplacementAccepted] = useState(false); const container = useRef<HTMLDivElement>(null);
  useEffect(() => { const prior = document.activeElement as HTMLElement | null; container.current?.querySelector<HTMLElement>('select,input,button')?.focus(); return () => { if (prior?.isConnected) prior.focus(); }; }, []);
  let coverage: ReturnType<typeof previewPaperExitAllocation> | null = null;
  const represented = (): PaperTicketInput['exits'] => ({ mode, levels: levels.map((level, index) => {
    const field = (leg: 'tp' | 'sl'): PaperExitValueInput | null => {
      if (mode === 'single' && !(leg === 'tp' ? level.tpEnabled : level.slEnabled)) return null;
      const kind = (leg === 'tp' ? level.tpMode : level.slMode) ?? 'price', amount = leg === 'tp' ? level.tp : level.sl;
      return kind === 'money' ? { kind, value: amount, currency: value.instrument.currency } : kind === 'balance-percent' ? { kind, value: amount, basis: (leg === 'tp' ? level.tpBalanceBasis : level.slBalanceBasis) ?? 'realized-balance' } : { kind, value: amount };
    };
    return { id: level.id ?? `level-${index + 1}`, quantity: level.quantity, takeProfit: field('tp'), stopLoss: field('sl') };
  }) });
  const resolvePlan = () => {
    if (!value.context || value.entryPrice === undefined) return buildExitPlan(mode, levels, value.instrument, value.side);
    const input: PaperTicketInput = { schemaVersion: 1, side: value.side, type: 'limit', quantity: { kind: 'units', value: String(value.instrument.lotSize) }, limit: { kind: 'price', value: String(value.entryPrice) }, stop: null, validity: { kind: 'day' }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: represented() };
    const result = previewPaperTicket(input, value.context);
    if (!result.ok) throw new Error(result.diagnostics.map(row => row.message).join(' '));
    return result.value.resolved.exits!;
  };
  let resolvedPlan: PaperExitPlanInput | null = null;
  try { resolvedPlan = resolvePlan(); coverage = value.preview ? value.preview(resolvedPlan) : value.capacity === null ? null : previewPaperExitAllocation(resolvedPlan, value.instrument, value.side, value.capacity); } catch { /* Invalid drafts remain editable; submit supplies the diagnostic. */ }
  const change = (index: number, patch: Partial<ExitLevelDraft>) => setLevels(current => current.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <div className="paper-confirm" onMouseDown={event => event.stopPropagation()}><div ref={container} role="dialog" aria-modal="true" aria-label={value.title} style={{ width: 'min(760px,94vw)', maxWidth: 760, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onKeyDown={event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') { const nodes = container.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'); if (!nodes?.length) return; const first = nodes[0], last = nodes[nodes.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  }}><h3>{value.title}</h3><form style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }} onSubmit={event => { event.preventDefault(); event.stopPropagation(); try { if (value.replacementNames?.length && !replacementAccepted) throw new Error('Confirm the listed group replacement before applying.'); if (value.apply(resolvePlan(), value.context ? represented() : undefined)) close(); else setError('The account or target changed, or the operation failed. Review the account message and reopen this editor.'); } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); } }}>
    <div style={{ overflow: 'auto', minHeight: 0, paddingRight: 8 }}>
      <p className="paper-notice">Up to four exit levels are supported here. Some help pages describe a single exit.</p><p>Virtual exits for {value.instrument.symbol}. Reference quantity: {value.capacity ?? 'unavailable until sizing is valid'}. Prices use the instrument tick size {value.instrument.tickSize}.{value.entryPrice !== undefined && ` Captured entry basis: ${value.entryPrice}.`}</p>
      <label>Exit mode<select aria-label="Exit mode" value={mode} disabled={value.lockedLevel} onChange={event => { const selected = event.target.value as PaperExitPlanInput['mode']; setMode(selected); if (selected === 'single') setLevels(current => current.slice(0, 1)); }}><option value="single">Single protective level</option><option value="multiple">Multiple paired levels</option></select></label>
      {levels.map((level, index) => <fieldset key={index} style={{ margin: '12px 0', display: 'grid', gap: 10 }}><legend>Level {index + 1}</legend>
        <label>Quantity<input aria-label={`Exit ${index + 1} quantity`} type="number" min={value.instrument.lotSize} step={value.instrument.lotSize} value={level.quantity} onChange={event => change(index, { quantity: event.target.value })}/></label>
        {value.context && <>{(['tp', 'sl'] as const).map(leg => <React.Fragment key={leg}><label>{leg === 'tp' ? 'Take profit' : 'Stop loss'} representation<select aria-label={`Exit ${index + 1} ${leg} representation`} value={(leg === 'tp' ? level.tpMode : level.slMode) ?? 'price'} onChange={event => change(index, { [leg === 'tp' ? 'tpMode' : 'slMode']: event.target.value as PaperExitValueInput['kind'] })}><option value="price">Absolute price</option><option value="ticks">Ticks from entry</option><option value="price-percent">Percent of entry price</option><option value="money">Gross P&amp;L ({value.instrument.currency})</option><option value="balance-percent">P&amp;L percent of balance</option></select></label>{(leg === 'tp' ? level.tpMode : level.slMode) === 'balance-percent' && <label>{leg === 'tp' ? 'TP' : 'SL'} denominator<select aria-label={`Exit ${index + 1} ${leg} balance basis`} value={(leg === 'tp' ? level.tpBalanceBasis : level.slBalanceBasis) ?? 'realized-balance'} onChange={event => change(index, { [leg === 'tp' ? 'tpBalanceBasis' : 'slBalanceBasis']: event.target.value as PaperSizingBalance })}><option value="realized-balance">Realized balance</option><option value="cash">Cash ledger</option><option value="equity">Equity with fresh marks</option></select></label>}</React.Fragment>)}</>}
        <label><span><input aria-label={`Exit ${index + 1} enable take profit`} type="checkbox" checked={mode === 'multiple' || level.tpEnabled} disabled={mode === 'multiple'} onChange={event => change(index, { tpEnabled: event.target.checked })}/>Take profit value</span><input aria-label={`Exit ${index + 1} take profit`} type="text" inputMode="decimal" disabled={mode === 'single' && !level.tpEnabled} value={level.tp} onChange={event => change(index, { tp: event.target.value })}/></label>
        <label><span><input aria-label={`Exit ${index + 1} enable stop loss`} type="checkbox" checked={mode === 'multiple' || level.slEnabled} disabled={mode === 'multiple'} onChange={event => change(index, { slEnabled: event.target.checked })}/>Stop loss value</span><input aria-label={`Exit ${index + 1} stop loss`} type="text" inputMode="decimal" disabled={mode === 'single' && !level.slEnabled} value={level.sl} onChange={event => change(index, { sl: event.target.value })}/></label>
        {coverage?.[index] && <small>Requested {coverage[index].coveragePercent?.toFixed(2) ?? 'unavailable'}%; executable now {coverage[index].allocatedQuantity}; capped {coverage[index].cappedQuantity}.</small>}
        {resolvedPlan?.levels[index] && <small>Resolved TP: {resolvedPlan.levels[index].takeProfit ?? 'none'}; SL: {resolvedPlan.levels[index].stopLoss ?? 'none'}.</small>}
        {mode === 'multiple' && !value.lockedLevel && levels.length > 1 && <button type="button" onClick={() => setLevels(current => current.filter((_, i) => i !== index))}>Remove level {index + 1}</button>}
      </fieldset>)}
      {mode === 'multiple' && !value.lockedLevel && <button type="button" disabled={levels.length >= 4} onClick={() => setLevels(current => [...current, emptyExit()])}>Add level ({levels.length}/4)</button>}
      {coverage && <p>Requested total: {coverage.reduce((sum, row) => sum + (row.coveragePercent ?? 0), 0).toFixed(2)}%. Excess coverage is retained in the plan but cannot execute beyond owned exposure.</p>}
      <p className="paper-notice">{value.context ? 'Local conversions use the captured entry and each explicitly entered level quantity. Gross amounts exclude fees, leverage and FX. The ticket preview resolves again before submission.' : 'Existing-group editing accepts prices only.'} OpenCandle uses ordered allocation and activates changed exits only on the next distinct quote. No real funds move.</p>
      {!!value.replacementNames?.length && <label><input type="checkbox" checked={replacementAccepted} onChange={event => setReplacementAccepted(event.target.checked)}/>Replace these current virtual exit groups: {value.replacementNames.join(', ')}</label>}
      {error && <p role="alert">{error}</p>}
    </div><footer style={{ paddingTop: 14, flexShrink: 0 }}><button type="button" onClick={close}>Cancel</button><button type="submit" className="primary">Apply exits</button></footer>
  </form></div></div>;
}

/** Optional host wiring for accounts, presets and column settings. Absent means a single account with no preset tools. */
export interface PaperManager {
  book: PaperBook | null;
  selectedPresetId: string | null;
  onSelectPreset: (id: string | null) => void;
  /** Replaces paper and paperBook in one state change. Returns false when the host refuses it. */
  onStateChange: (next: PaperState, expected: PaperState) => boolean | void;
  idFactory?: () => string;
}
export interface PaperPresetSeed { token: number; side: PaperSide; }
/** A ticket draft showing the preset's saved representation. Fields that do not apply were already removed by the preset. */
export function draftFromTicketInput(input: PaperTicketInput, base: PaperTicketDraft, zone = 'UTC'): PaperTicketDraft {
  const quantity = input.quantity, manual = input.validity.kind === 'manual-expiry' ? input.validity.expiresAt : null;
  return { ...base, side: input.side, type: input.type, quantity: quantity.value, quantityMode: quantity.kind, balanceBasis: 'basis' in quantity ? quantity.basis : base.balanceBasis, riskStopLevelId: 'stopLevelId' in quantity ? quantity.stopLevelId : '', limitMode: input.limit?.kind ?? 'price', limitPrice: input.limit?.value ?? base.limitPrice, stopMode: input.stop?.kind ?? 'price', stopPrice: input.stop?.value ?? base.stopPrice, timeInForce: input.validity.kind === 'gtc' ? 'GTC' : manual === null ? 'DAY' : 'GTD', expiresAt: manual === null ? base.expiresAt : expiryText(manual, zone), extendedHours: input.entryOutsideRth, takeProfitOutsideRth: input.takeProfitOutsideRth, expiryChanged: manual !== null };
}
export const REOPEN_FALLBACK_NOTE = 'Reopened in units because the saved entry no longer applies';
/**
 * Editing an existing order reopens the ticket in the representation saved with it when that entry still describes the order
 * (same side, type and instrument, same size, same fixed prices). Otherwise units and prices, with a note. Orders with no saved entry
 * reopen in units and prices as they always have.
 */
export function reopenDraftFor(order: PaperOrder): { draft: Partial<PaperTicketDraft>; exits: PaperTicketInput['exits']; note: string | null } {
  const canonical: Partial<PaperTicketDraft> = { quantityMode: 'units', balanceBasis: 'realized-balance', limitMode: 'price', stopMode: 'price', riskStopLevelId: '' };
  const ticket = order.ticket;
  if (!ticket) return { draft: canonical, exits: null, note: null };
  const input = ticket.input;
  const fixed = (field: typeof input.limit, value: number | undefined) => field === null ? value === undefined : field.kind !== 'price' || Number(field.value) === value;
  const valid = input.side === order.side && input.type === order.type && (ticket.quote === null || ticket.quote.instrumentId === order.instrument.id) && ticket.sizing.quantity === order.quantity && fixed(input.limit, order.limitPrice) && fixed(input.stop, order.stopPrice);
  if (!valid) return { draft: canonical, exits: null, note: REOPEN_FALLBACK_NOTE };
  const quantity = input.quantity;
  return { draft: { quantityMode: quantity.kind, quantity: quantity.value, balanceBasis: 'basis' in quantity ? quantity.basis : 'realized-balance', riskStopLevelId: 'stopLevelId' in quantity ? quantity.stopLevelId : '', limitMode: input.limit?.kind ?? 'price', limitPrice: input.limit?.value ?? (order.limitPrice === undefined ? '' : String(order.limitPrice)), stopMode: input.stop?.kind ?? 'price', stopPrice: input.stop?.value ?? (order.stopPrice === undefined ? '' : String(order.stopPrice)) }, exits: 'stopLevelId' in quantity ? input.exits : null, note: null };
}

interface FirstSeed { draft: PaperTicketDraft; plan: PaperExitPlanInput | null; exits: PaperTicketInput['exits']; notes: string[]; message: string; dirty: boolean; }
/** The ticket state a preset seed produces, computed once for the first render. Null when there is no seed. */
function initialPresetSeed(seed: PaperPresetSeed | null | undefined, manager: PaperManager | undefined, account: PaperAccount, instrument: Instrument, quote: Quote | null, quoteSource: PaperQuoteSource | null, now: number, zone = 'UTC'): FirstSeed | null {
  if (!seed) return null;
  const chosen = manager?.book?.presets?.find(row => row.id === manager.selectedPresetId);
  if (!chosen) return { draft: { ...draftFor(quote, now, zone), side: seed.side }, plan: null, exits: null, notes: [], message: '', dirty: false };
  try {
    const applied = applyPaperPreset(chosen, seed.side, now);
    let plan: PaperExitPlanInput | null = null;
    if (applied.input.exits) { try { const preview = previewPaperTicket(applied.input, { account, instrument, quote, quoteSource, now }); if (preview.ok) plan = preview.value.resolved.exits ?? null; } catch { /* The ticket shows the diagnostic. */ } }
    return { draft: draftFromTicketInput(applied.input, draftFor(quote, now, zone), zone), plan, exits: applied.input.exits, notes: applied.notes, message: `Preset applied to the ticket: ${presetSummary(chosen)}. No order was submitted.`, dirty: true };
  } catch { return null; }
}

export function PaperPanel({ account, onAccountChange, instrument, quote, quoteSource = null, now,contextRequest=null,assertContextCurrent,onContextComplete, paperManager, exportBridge, presetSeed, sessionMode, tradingRefusal = null, timezone = 'UTC', timeHours = '24' }: PaperPanelProps) {
  // Plain strings from App, so a zone or hour-cycle change re-renders every time below (no memo here).
  const zoneName = chartZoneName(timezone), shownTime = (seconds: number | undefined, suffix = false) => paperPanelTime(seconds, timezone, timeHours, suffix);
  const extendedDefault = () => paperExtendedHoursDefault(sessionMode, latest.current.instrument, latest.current.now);
  // The first draft is built from the preset seed so the ticket never shows an unseeded market buy for a frame.
  const [firstSeed] = useState(() => initialPresetSeed(presetSeed, paperManager, account, instrument, quote, quoteSource, now, timezone));
  const [tab, setTab] = useState('Orders'), [draft, setDraft] = useState<PaperTicketDraft>(() => firstSeed?.draft ?? draftFor(quote, now, timezone)), [editing, setEditing] = useState<string | null>(null), [message, setMessageState] = useState(() => firstSeed?.message ?? ''), [confirmation, setConfirmationState] = useState<Confirmation | null>(null);
  const [resetBalance, setResetBalance] = useState(String(account.settings.initialBalance)), [leverage, setLeverage] = useState(String(account.settings.leverage)), [feeKind, setFeeKind] = useState<PaperCommission['kind']>(account.settings.commission.kind), [feeValue, setFeeValue] = useState(String(account.settings.commission.value));
  const [slippageTicks, setSlippageTicks] = useState(String(account.settings.slippageTicks ?? 0)), [quoteAge, setQuoteAge] = useState(String(account.settings.maxQuoteAgeSeconds)), [resetCurrency, setResetCurrency] = useState(account.settings.currency), [closeQuantities, setCloseQuantities] = useState<Record<string, string>>({});
  const [exitPlan, setExitPlan] = useState<PaperExitPlanInput | null>(() => firstSeed?.plan ?? null), [exitEditor, setExitEditor] = useState<ExitEditor | null>(null);
  const [exitRepresentations, setExitRepresentations] = useState<PaperTicketInput['exits']>(() => firstSeed?.exits ?? null);
  const [journalQuery, setJournalQuery] = useState(''), [columnsOpen, setColumnsOpen] = useState(false), [localExpiry, setLocalExpiry] = useState(true);
  const [newName, setNewName] = useState(''), [newBalance, setNewBalance] = useState(''), [newCurrency, setNewCurrency] = useState('USD'), [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
  const [presetFields, setPresetFields] = useState<PaperPresetField[]>(() => PAPER_PRESET_FIELDS.map(row => row.id));
  const [presetName, setPresetName] = useState(''), [presetNotes, setPresetNotes] = useState<string[]>(() => firstSeed?.notes ?? []);
  const recentSubmit = useRef<{ fingerprint: string; commandId: string } | null>(null), seededPreset = useRef<number | null>(firstSeed && presetSeed ? presetSeed.token : null), columnsButton = useRef<HTMLButtonElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ account, now, instrument, quote, quoteSource, draft, editing, exitPlan, exitRepresentations,contextRequest,assertContextCurrent,onContextComplete, manager: paperManager }); latest.current = { account, now, instrument, quote, quoteSource, draft, editing, exitPlan, exitRepresentations,contextRequest,assertContextCurrent,onContextComplete, manager: paperManager };
  const mounted=useRef(true),closed=useRef(false),seeded=useRef<ContextPriceRequest|null>(null),dirty=useRef(firstSeed?.dirty ?? false);
  const confirmationAuthority=useRef<Confirmation|null>(null),executingConfirmation=useRef(false);
  const [replacement,setReplacement]=useState<{request:ContextPriceRequest;fingerprint:string}|null>(null),replacementRef=useRef<typeof replacement>(null);
  const active=()=>mounted.current&&!closed.current&&latest.current.contextRequest===contextRequest;
  const setConfirmation=(value:Confirmation|null)=>{if(!active())return;confirmationAuthority.current=value;setConfirmationState(value);};
  const cancelConfirmation=(expected:Confirmation|null)=>{if(!active()||confirmationAuthority.current!==expected)return;setConfirmation(null);};
  const setMessage=(value:string)=>{if(active())setMessageState(value);};
  const assertRequest=(phase:'seed'|'use'='use',requireSeed=true)=>{
    if(!active())throw new Error('This virtual ticket was closed or replaced.');
    if(contextRequest){const live=latest.current;assertContextPriceRequest(live,contextRequest,'paper-ticket',live.instrument,phase);const owner=contextRequest.paperOwner;if(!owner||owner.id!==live.account.id||owner.mode!==live.account.mode||owner.runId!==live.account.runId)throw new Error('The clicked virtual account or replay run changed.');if(!live.quoteSource||live.quoteSource.key!==contextRequest.sourceKey)throw new Error('The clicked quote source changed or is unavailable.');if(requireSeed&&seeded.current!==contextRequest)throw new Error('Review the pending clicked-price ticket replacement first.');}
  };
  const finish=(outcome:ContextPriceOutcome)=>{if(!active())return;closed.current=true;confirmationAuthority.current=null;replacementRef.current=null;if(contextRequest)onContextComplete?.(contextRequest,outcome);};
  // Extended hours is a limit-entry option only (paper-ticket session policy); a + menu stop preset never inherits it.
  const contextualDraft=(request:ContextPriceRequest)=>{const preset=contextOrderDraft(request);return{...draftFor(latest.current.quote,latest.current.now),...preset,limitPrice:request.priceText,stopPrice:request.priceText,extendedHours:preset.type==='limit'&&extendedDefault()};};
  const draftFingerprint=()=>JSON.stringify([latest.current.draft,latest.current.editing,latest.current.exitPlan,latest.current.exitRepresentations]);
  const seedRequest=(request:ContextPriceRequest)=>{assertRequest('seed',false);if(request!==latest.current.contextRequest)throw new Error('The requested ticket was replaced.');seeded.current=request;dirty.current=false;setDraft(contextualDraft(request));setEditing(null);setExitPlan(null);setExitRepresentations(null);setExitEditor(null);setConfirmation(null);replacementRef.current=null;setReplacement(null);setTab('Orders');setMessage(request.order?`Clicked price captured exactly. ${request.order.side==='buy'?'Buy':'Sell'} ${request.order.orderType==='stop'?'Stop':'Limit'} from the price scale menu and one unit are local draft defaults. Review side, type and quantity before submitting.`:'Clicked price captured exactly. Buy Limit and one unit are local draft defaults. Review side, type and quantity before submitting.');};
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;confirmationAuthority.current=null;};},[]);
  useEffect(()=>{if(!contextRequest||seeded.current===contextRequest||!active())return;confirmationAuthority.current=null;try{assertRequest('use',false);if(dirty.current||editing||exitEditor||confirmation){const value={request:contextRequest,fingerprint:draftFingerprint()};replacementRef.current=value;setReplacement(value);return;}seedRequest(contextRequest);}catch(error){setMessage(error instanceof Error?error.message:String(error));}},[contextRequest]);
  const contextFor = (live: typeof latest.current): PaperTicketContext => ({ account: live.account, instrument: live.instrument, quote: live.quote, quoteSource: live.quoteSource, now: live.now, ...(live.editing ? { editOrderId: live.editing } : {}) });
  const inputFor = (live: typeof latest.current) => buildPaperTicketInput(live.draft, live.instrument, live.exitRepresentations ?? representedExits(live.exitPlan), live.editing);
  let ticketPreview: PaperTicketPreview | null = null, ticketError = '';
  try {if(contextRequest)assertRequest(); const result = draft.type === 'trailing-stop' ? null : previewPaperTicket(inputFor(latest.current), contextFor(latest.current)); if (result && result.ok) ticketPreview = result.value; else if (result) ticketError = result.diagnostics.map(row => row.message).join(' '); } catch (error) { ticketError = error instanceof Error ? error.message : String(error); }
  const summary = paperSummary(account, now), working = account.orders.filter(order => ['working', 'triggered'].includes(order.status)), buffer = paperMarginBuffer(summary);
  const money = (amount: number | null) => amount === null ? 'Unavailable' : amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const apply = (result: PaperResult, success: string, base: PaperAccount) => {
    try{assertRequest();}catch(error){setMessage(plainErrorText(error));return false;}
    if (paperManager && result.ok && result.account !== base) { const guard = guardPaperStorage({ paper: base, book: paperManager.book }, result.account); if (!guard.ok) { setMessage(guard.message); return false; } }
    const accepted=result.account===base?true:onAccountChange(result.account, base);
    if(contextRequest){try{assertRequest();}catch{closed.current=true;return false;}}if(!active())return false;
    if (accepted === false) {
      setMessage('The virtual account change was rejected. Existing account state and this draft were retained. Review the workspace message before retrying.'); return false;
    }
    setMessage(result.diagnostics.length ? result.diagnostics.map(d => d.message).join(' ') : result.ok ? success : 'Virtual action failed.'); return result.ok;
  };
  const resetKey = useRef<string | null>(null), thisKey = `${paperInstrumentKey(instrument)}|${account.id}|${account.runId}`;
  useEffect(() => {if(contextRequest)return;const first = resetKey.current === null; resetKey.current = thisKey; if (first && firstSeed) return;dirty.current=false; setDraft(draftFor(quote, now, timezone)); setEditing(null); setExitPlan(null); setExitRepresentations(null); setExitEditor(null); }, [paperInstrumentKey(instrument), account.id, account.runId]);
  // A ticket reset while this account had no quote yet (a new or just switched account: the bar feed sets its quote right
  // after) starts with empty prices; the first quote fills them, unless the user already edited the ticket.
  const hasQuote = quote !== null;
  useEffect(() => {if(!hasQuote||contextRequest||dirty.current||editing)return;const ask=String(quote!.ask);setDraft(current => current.limitPrice===''&&current.stopPrice===''?{ ...current, limitPrice: ask, stopPrice: ask }:current);}, [hasQuote, paperInstrumentKey(instrument), account.id, account.runId]);
  useEffect(() => {
    if (!quote || quote.instrumentId !== instrument.id || account.quotes[quote.instrumentId]?.sequence === quote.sequence) return;
    try{assertRequest('use',false);const result = processPaperQuote(account, quote, now, account.runId, instrument);
    if (paperManager && result.ok && result.account !== account) { const guard = guardPaperStorage({ paper: account, book: paperManager.book }, result.account); if (!guard.ok) { setMessage(guard.message); return; } }
    const accepted=result.account===account?true:onAccountChange(result.account, account);if(contextRequest){try{assertRequest('use',false);}catch{closed.current=true;return;}}if(!active())return;
    if (accepted === false) setMessage('The virtual quote update was rejected. Existing account state was retained.');
    else if (!result.ok) setMessage(result.diagnostics.map(d => d.message).join(' '));}catch(error){setMessage(plainErrorText(error));}
  }, [quote, now, account, onAccountChange, instrument.id]);
  const settingsKey = JSON.stringify([account.id, account.runId, account.settings]);
  useEffect(() => { setResetBalance(String(account.settings.initialBalance)); setLeverage(String(account.settings.leverage)); setFeeKind(account.settings.commission.kind); setFeeValue(String(account.settings.commission.value)); setSlippageTicks(String(account.settings.slippageTicks ?? 0)); setQuoteAge(String(account.settings.maxQuoteAgeSeconds)); setResetCurrency(account.settings.currency); }, [settingsKey]);
  useEffect(() => { if (!confirmation) return; const previous = document.activeElement as HTMLElement | null; confirmationRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); return () => { if (previous?.isConnected) previous.focus(); }; }, [confirmation]);
  const confirm = (title: string, detail: string, execute: () => boolean | void, always = false) => {
    try{assertRequest();}catch(error){setMessage(plainErrorText(error));return;}
    const accountId = account.id, runId = account.runId;
    const guarded = () => {try{assertRequest();}catch(error){setMessage(plainErrorText(error));return false;} if (latest.current.account.id !== accountId || latest.current.account.runId !== runId) { setMessage('The virtual account or replay run changed. Review the action again.'); return false; } return execute(); };
    if (account.settings.oneClick && !always&&!contextRequest) guarded(); else {
      const owned:Confirmation={title,detail,execute:()=>{if(confirmationAuthority.current!==owned||executingConfirmation.current||!active())return false;executingConfirmation.current=true;try{const result=guarded();if(result!==false&&confirmationAuthority.current===owned){confirmationAuthority.current=null;if(active())setConfirmationState(null);}return result;}finally{executingConfirmation.current=false;}}};
      setConfirmation(owned);
    }
  };
  const set = <K extends keyof PaperTicketDraft>(key: K, field: PaperTicketDraft[K]) => {try{assertRequest();dirty.current=true;setConfirmation(null);setDraft(current => ({ ...current, [key]: field, ...(key === 'type' && field !== 'limit' && !editing ? { extendedHours: false } : {}),...(key === 'type' && field === 'limit' && current.type !== 'limit' && !editing ? { extendedHours: extendedDefault() } : {}),...(contextRequest&&key==='type'?(field==='limit'?{limitMode:'price',limitPrice:contextRequest.priceText}:field==='stop'?{stopMode:'price',stopPrice:contextRequest.priceText}:field==='stop-limit'?{stopMode:'price',stopPrice:contextRequest.priceText,limitMode:'price',limitPrice:''}:{}):{}),...(contextRequest&&key==='limitMode'?{limitPrice:field==='price'?contextRequest.priceText:''}:{}),...(contextRequest&&key==='stopMode'?{stopPrice:field==='price'?contextRequest.priceText:''}:{}) }));}catch(error){setMessage(plainErrorText(error));}};
  const resetTicket = () => {try{assertRequest();dirty.current=false;setEditing(null); setDraft(contextRequest?contextualDraft(contextRequest):draftFor(quote, now, timezone)); setExitPlan(null); setExitRepresentations(null);setConfirmation(null); setMessage('Order ticket reset. No virtual order was changed.');}catch(error){setMessage(plainErrorText(error));}};
  const submitTrailing = () => {
    const request = buildPaperRequest(editing ? { ...draft, timeInForce: 'GTC' } : draft, instrument, null, now);
    const detail = `${request.side.toUpperCase()} ${request.quantity} ${instrument.symbol} | trailing stop | trail ${request.trailPercent !== undefined ? `${request.trailPercent}%` : request.trailDistance}. The stop follows the best price and sends a market order when reached. All funds are virtual.`;
    const preview = editing ? modifyPaperOrder(account, editing, { quantity: request.quantity, ...(request.trailPercent !== undefined ? { trailPercent: request.trailPercent } : { trailDistance: request.trailDistance }) }, now) : submitPaperOrder(account, request, now);
    if (!preview.ok) { apply(preview, '', account); return; }
    const action = () => {
      try{assertRequest();}catch(error){setMessage(plainErrorText(error));return false;}
      const live = latest.current, commandId = `panel-${crypto.randomUUID()}`;
      const fresh = buildPaperRequest(editing ? { ...live.draft, timeInForce: 'GTC' } : live.draft, live.instrument, null, live.now);
      const result = editing ? modifyPaperOrder(live.account, editing, { quantity: fresh.quantity, ...(fresh.trailPercent !== undefined ? { trailPercent: fresh.trailPercent } : { trailDistance: fresh.trailDistance }) }, live.now) : submitPaperOrder(live.account, { ...fresh, commandId }, live.now);
      if (!apply(result, editing ? 'Virtual order modified.' : 'Virtual order submitted.', live.account)) return false;
      dirty.current=false; setEditing(null); return true;
    };
    confirm(editing ? 'Confirm order modification' : 'Confirm virtual order', detail, action);
  };
  const submit = () => {
    try {
      if (tradingRefusal) throw new Error(tradingRefusal);
      assertRequest();
      if (draft.type === 'trailing-stop') { submitTrailing(); return; }
      const input = inputFor(latest.current), resolved = previewPaperTicket(input, contextFor(latest.current));
      if (!resolved.ok) throw new Error(resolved.diagnostics.map(row => row.message).join(' '));
      const captured = resolved.value, built = materializePaperTicket(captured, input, contextFor(latest.current));
      if (!built.ok) throw new Error(built.diagnostics.map(row => row.message).join(' '));
      const request = built.value;
      const preview = editing ? modifyPaperOrder(account, editing, { quantity: request.quantity, limitPrice: request.limitPrice, stopPrice: request.stopPrice, expiresAt: request.expiresAt, extendedHours: request.extendedHours }, now) : submitPaperOrder(account, request, now);
      if (!preview.ok) { apply(preview, '', account); return; }
      const wouldReject = preview.orderId ? preview.account.orders.find(row => row.id === preview.orderId) : undefined;
      if (wouldReject?.status === 'rejected') { setMessage(`Not submitted. The virtual engine would reject this order now: ${wouldReject.rejectionReason ?? 'rejected'} No virtual order was created.`); return; }
      const action = () => {
        try{assertRequest();}catch(error){setMessage(plainErrorText(error));return false;}
        const live = latest.current; let currentInput: PaperTicketInput;
        try { currentInput = inputFor(live); } catch (error) { setMessage(plainErrorText(error)); return false; }
        const current = materializePaperTicket(captured, currentInput, contextFor(live));
        if (!current.ok) { setMessage(current.diagnostics.map(row => row.message).join(' ')); return false; }
        const accepted = current.value;
        // One user action places one order: an identical ticket is ignored until the short re-entry window closes, and the engine also
        // recognizes a repeated command identity.
        const fingerprint = JSON.stringify([currentInput, live.account.id, live.account.runId]), commandId = `panel-${crypto.randomUUID()}`;
        if (!editing && recentSubmit.current?.fingerprint === fingerprint) { setMessage('That order was just submitted. It was not sent again.'); return false; }
        const currentResult = editing ? modifyPaperOrder(live.account, editing, { quantity: accepted.quantity, limitPrice: accepted.limitPrice, stopPrice: accepted.stopPrice, expiresAt: accepted.expiresAt, extendedHours: accepted.extendedHours, ticket: accepted.ticket }, live.now) : submitPaperOrder(live.account, { ...accepted, commandId }, live.now);
        if (!apply(currentResult, editing ? 'Virtual order modified.' : 'Virtual order submitted.', live.account)) return false;
        if (!editing) { recentSubmit.current = { fingerprint, commandId }; setTimeout(() => { if (recentSubmit.current?.commandId === commandId) recentSubmit.current = null; }, 750); }
        if(contextRequest){finish('saved');return true;}dirty.current=false;
        setEditing(null); if (!editing) { setExitPlan(null); setExitRepresentations(null); } return true;
      };
      confirm(editing ? 'Confirm order modification' : 'Confirm virtual order', `${request.side.toUpperCase()} ${request.quantity} ${instrument.symbol} | ${request.type}${request.limitPrice ? ` | limit ${request.limitPrice}` : ''}${request.stopPrice ? ` | stop ${request.stopPrice}` : ''}. Gross notional ${captured.sizing.grossNotional} ${instrument.currency}; sizing excludes fees, leverage and FX. Estimated virtual fee ${paperFeeFor(account.settings, request.quantity, paperSlippedPrice(account.settings, request, captured.sizing.entryPrice))} ${account.settings.currency} at the entry basis after configured slippage.${paperSlippageApplies(request) && (account.settings.slippageTicks ?? 0) > 0 ? ` Virtual slippage of ${account.settings.slippageTicks} tick(s) applies to this fill.` : ''} ${input.validity.kind === 'day' ? (paperSessionBound(instrument) ? 'Day expires at the session close.' : 'Day expires 24 hours after accepted placement.') : input.validity.kind === 'gtc' ? 'GTC has no expiry: the order stays working until it fills or is cancelled.' : 'Existing or explicitly chosen expiry is retained.'} All funds are virtual.`, action);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const startEdit = (id: string) => {
    try{assertRequest();}catch(error){setMessage(plainErrorText(error));return;}
    const order = account.orders.find(item => item.id === id)!;
    if (order.bracket) { openExitLevel(order.bracket.groupId, order.bracket.levelId); return; }
    if (order.instrument.id !== instrument.id) { setMessage("Select the order's instrument in the chart before modifying its ticket."); return; }
    const reopened = reopenDraftFor(order);
    setConfirmation(null);dirty.current=true;setEditing(id); setTab('Orders'); setDraft({ side: order.side, type: order.type, quantity: String(order.quantity), limitPrice: order.limitPrice === undefined ? '' : String(order.limitPrice), stopPrice: order.stopPrice === undefined ? '' : String(order.stopPrice), timeInForce: order.timeInForce ?? 'GTC', expiresAt: expiryText(order.expiresAt, timezone), extendedHours: order.extendedHours ?? false, trailMode: order.trailPercent !== undefined ? 'percent' : 'distance', trailValue: String(order.trailPercent ?? order.trailDistance ?? ''), quantityMode: 'units', balanceBasis: 'realized-balance', limitMode: 'price', stopMode: 'price', riskStopLevelId: '', takeProfitOutsideRth: order.sessionPolicy?.takeProfitOutsideRth ?? order.extendedHours ?? false, expiryChanged: false, ...reopened.draft });
    setExitPlan(order.exits ?? null); setExitRepresentations(reopened.exits); setPresetNotes([]); if (reopened.note) setMessage(reopened.note);
  };
  const openTicketExits = () => {
    try {assertRequest();
      const pinned = JSON.stringify([account.id, account.runId, paperInstrumentKey(instrument), draft, editing]), capturedContext = contextFor(latest.current);
      const basisInput = buildPaperTicketInput({ ...draft, quantity: String(instrument.lotSize), quantityMode: 'units', takeProfitOutsideRth: false }, instrument, null, null), captured = previewPaperTicket(basisInput, capturedContext);
      if (!captured.ok) throw new Error(captured.diagnostics.map(row => row.message).join(' '));
      setExitEditor({ title: 'Configure virtual ticket exits', instrument, side: draft.side, capacity: ticketPreview?.sizing.quantity ?? null, initial: exitPlan, representations: exitRepresentations, context: capturedContext, entryPrice: captured.value.sizing.entryPrice, apply: (plan: PaperExitPlanInput, representations?: PaperTicketInput['exits']) => {
        const live = latest.current;try{assertRequest();}catch(error){setMessage(plainErrorText(error));return false;}
        if (JSON.stringify([live.account.id, live.account.runId, paperInstrumentKey(live.instrument), live.draft, live.editing]) !== pinned || !materializePaperTicket(captured.value, basisInput, contextFor(live)).ok) { setMessage('The underlying ticket, quote, source or account changed. Reopen the exit editor.'); return false; }
        dirty.current=true;setConfirmation(null);setExitPlan(plan); setExitRepresentations(representations ?? null); if (!plan.levels.some(level => level.takeProfit !== undefined)) set('takeProfitOutsideRth', false);
        setMessage('Exit configuration saved to the ticket draft. No order submitted.'); return true;
      } });
    } catch (error) { setMessage(plainErrorText(error)); }
  };
  const openPendingExits = (orderId: string) => {
    try {assertRequest(); const order = account.orders.find(row => row.id === orderId)!, target = paperExitTarget(account, 'parent', orderId);
      setExitEditor({ title: 'Edit pending virtual exits', instrument: order.instrument, side: order.side, capacity: order.quantity, initial: order.exits ?? null, apply: plan => apply(modifyPaperExitPlan(latest.current.account, target, plan, latest.current.now), 'Pending virtual exits modified.', latest.current.account) });
    } catch (error) { setMessage(plainErrorText(error)); }
  };
  const openExitLevel = (groupId: string, levelId: string) => {
    try {assertRequest(); const group = account.brackets!.groups.find(row => row.id === groupId)!, level = group.levels.find(row => row.id === levelId)!, target = paperExitTarget(account, 'group', groupId);
      const capacity = account.brackets!.lots.filter(lot => lot.groupId === groupId).reduce((sum, lot) => sum + lot.remainingQuantity, 0);
      setExitEditor({ title: `Replace virtual exit level ${level.ordinal + 1}`, instrument: group.instrument, side: group.direction, capacity, lockedLevel: true, initial: { schemaVersion: 1, mode: group.mode, levels: [{ quantity: level.requestedQuantity, ...(level.takeProfit === undefined ? {} : { takeProfit: level.takeProfit }), ...(level.stopLoss === undefined ? {} : { stopLoss: level.stopLoss }) }] }, preview: plan => [allocatePaperExitLevels(group.levels.map(row => row.status !== 'active' ? 0 : row.id === levelId ? plan.levels[0].quantity : row.requestedQuantity - row.filledQuantity), capacity, group.instrument.lotSize)[level.ordinal]], apply: plan => apply(modifyPaperExitLevel(latest.current.account, target, levelId, plan.levels[0], latest.current.now), 'Virtual exit level replaced. It becomes eligible at the next distinct quote.', latest.current.account) });
    } catch (error) { setMessage(plainErrorText(error)); }
  };
  const openPositionExits = (instrumentId: string) => {
    try {assertRequest(); const position = account.positions[instrumentId], target = paperPositionExitTarget(account, instrumentId);
      setExitEditor({ title: 'Manage current virtual position exits', instrument: position.instrument, side: position.quantity > 0 ? 'buy' : 'sell', capacity: Math.abs(position.quantity), initial: null, replacementNames: target.owners.map(row => row.id), apply: plan => apply(attachPaperPositionExits(latest.current.account, target, plan, target.owners.map(row => row.id), latest.current.now), 'Current-position exit snapshot saved. Later entries are not automatically included.', latest.current.account) });
    } catch (error) { setMessage(plainErrorText(error)); }
  };
  const confirmCancelOrder = (orderId: string) => {
    try{assertRequest();}catch(error){setMessage(plainErrorText(error));return;}
    const order = account.orders.find(row => row.id === orderId); if (!order) return;
    const fingerprint = JSON.stringify(order);
    confirm('Confirm cancellation', `Cancel ${order.side} ${order.quantity} ${order.instrument.symbol}? Filled orders are unaffected.${order.bracket ? ' Cancelling this exit also cancels its paired sibling.' : ''}`, () => {
      const live = latest.current;
      if (JSON.stringify(live.account.orders.find(row => row.id === orderId)) !== fingerprint) { setMessage('The virtual order changed after confirmation opened. Review its current parameters.'); return false; }
      return apply(cancelPaperOrder(live.account, orderId, live.now), 'Virtual order cancelled.', live.account);
    });
  };
  const confirmClosePosition = (instrumentId: string) => {
    try {assertRequest();
      const position = account.positions[instrumentId], target = JSON.stringify(paperPositionExitTarget(account, instrumentId));
      confirm('Confirm position close', `Close ${Math.abs(position.quantity)} units of the ${position.instrument.symbol} virtual position at an eligible quote?`, () => {
        const live = latest.current;
        if (!live.account.positions[instrumentId] || JSON.stringify(paperPositionExitTarget(live.account, instrumentId)) !== target) { setMessage('The virtual position exposure changed after confirmation opened. Review the current position.'); return false; }
        return apply(closePaperPosition(live.account, instrumentId, live.now, Math.abs(position.quantity)), 'Virtual closing order submitted.', live.account);
      });
    } catch (error) { setMessage(plainErrorText(error)); }
  };
  const confirmScopedCancel = (side?: PaperSide) => {
    try { assertRequest(); } catch (error) { setMessage(plainErrorText(error)); return; }
    const scope = { instrumentId: instrument.id, ...(side ? { side } : {}) }, targets = paperCancelCandidates(account, scope);
    if (!targets.length) { setMessage(`No working virtual ${side ? `${side} ` : ''}orders for ${instrument.symbol}.`); return; }
    const fingerprint = JSON.stringify(targets);
    confirm(side ? `Cancel ${side} orders` : 'Cancel all orders', `Cancel ${targets.length} working virtual ${side ? `${side} ` : ''}order(s) for ${instrument.symbol}? Exit pairs are excluded and stay managed per level. Filled orders are unaffected.`, () => {
      const live = latest.current;
      if (JSON.stringify(paperCancelCandidates(live.account, scope)) !== fingerprint) { setMessage('The matching virtual orders changed after confirmation opened. Review them again.'); return false; }
      const result = cancelPaperOrders(live.account, scope, live.now), cancelled = result.ok ? result.account.orders.filter(order => order.status === 'cancelled' && live.account.orders.some(prior => prior.id === order.id && ['working', 'triggered'].includes(prior.status))).length : 0;
      return apply(result, `${cancelled} virtual order(s) cancelled.${cancelled < targets.length ? ` ${targets.length - cancelled} expired before cancellation.` : ''}`, live.account);
    });
  };
  /** Close all positions, always through the in-app confirmation (one account change; a refused close changes nothing). */
  const confirmCloseAll = () => {
    try { assertRequest();
      const rows = Object.values(account.positions), fingerprint = paperDockPositionsFingerprint(account);
      if (!rows.length) { setMessage('No open virtual positions.'); return; }
      confirm('Close all positions', `Close ${rows.length} virtual position${rows.length === 1 ? '' : 's'}? Each one closes with a reduce-only market order at an eligible quote: ${rows.map(position => `${position.instrument.symbol} ${position.quantity > 0 ? 'long' : 'short'} ${Math.abs(position.quantity)}`).join(', ')}. All funds are virtual.`, () => {
        const live = latest.current;
        if (paperDockPositionsFingerprint(live.account) !== fingerprint) { setMessage('The open virtual positions changed after the confirmation opened. Review them again.'); return false; }
        const result = closeAllPaperDockPositions(live.account, live.now);
        if (!result.ok) { setMessage(result.message); return false; }
        return apply({ ok: true, account: result.account, diagnostics: [] }, result.message, live.account);
      }, true);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const confirmPartialClose = (instrumentId: string) => {
    try { assertRequest();
      const position = account.positions[instrumentId], quantity = strictNumber(closeQuantities[instrumentId] ?? '', 'Close quantity'), target = JSON.stringify(paperPositionExitTarget(account, instrumentId));
      if (!(quantity > 0) || quantity >= Math.abs(position.quantity)) throw new Error('Partial close quantity must be positive and smaller than the position. Use Close position for the full amount.');
      confirm('Confirm partial close', `Close ${quantity} of ${Math.abs(position.quantity)} units of the ${position.instrument.symbol} virtual position with a reduce-only market order? It cannot reverse the position.`, () => {
        const live = latest.current;
        if (!live.account.positions[instrumentId] || JSON.stringify(paperPositionExitTarget(live.account, instrumentId)) !== target) { setMessage('The virtual position exposure changed after confirmation opened. Review the current position.'); return false; }
        return apply(closePaperPosition(live.account, instrumentId, live.now, quantity), 'Virtual partial closing order submitted.', live.account);
      });
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const confirmReverse = (instrumentId: string) => {
    try { assertRequest();
      const position = account.positions[instrumentId], target = JSON.stringify(paperPositionExitTarget(account, instrumentId));
      confirm('Confirm position reverse', `Reverse the ${position.quantity > 0 ? 'long' : 'short'} ${Math.abs(position.quantity)} ${position.instrument.symbol} virtual position with one market order to ${position.quantity > 0 ? 'sell' : 'buy'} ${Math.abs(position.quantity) * 2} units. OpenCandle policy: it fills or rejects as a whole; exits owned by the closed exposure are cancelled. All funds are virtual.`, () => {
        const live = latest.current;
        if (!live.account.positions[instrumentId] || JSON.stringify(paperPositionExitTarget(live.account, instrumentId)) !== target) { setMessage('The virtual position exposure changed after confirmation opened. Review the current position.'); return false; }
        return apply(reversePaperPosition(live.account, instrumentId, live.now), 'Virtual reversing order submitted.', live.account);
      });
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const exportAccount = async () => {try{assertRequest();if (!window.lv) { setMessage('Account JSON export needs the desktop app.'); return; } const result = await window.lv.exportWorkspace({ schemaVersion: 1, data: { kind: 'virtual-paper-account', account } });if(!active())return;assertRequest();setMessage(result.ok ? 'Virtual account exported to a local JSON file.' : result.error.message);}catch(error){setMessage(plainErrorText(error));}};
  const currentState = (): PaperState => ({ paper: latest.current.account, book: latest.current.manager?.book ?? null });
  const applyState = (result: PaperBookResult, success: string, expected: PaperState) => {
    try { assertRequest(); } catch (error) { setMessage(plainErrorText(error)); return false; }
    if (!result.ok) { setMessage(result.message); return false; }
    const manager = latest.current.manager;
    if (!manager) { setMessage('Account tools are unavailable here.'); return false; }
    const cap = guardPaperState(expected, result.state);
    if (!cap.ok) { setMessage(cap.message); return false; }
    const accepted = manager.onStateChange(result.state, expected);
    if (!active()) return false;
    if (accepted === false) { setMessage('The virtual account change was rejected. Existing accounts were retained. Review the workspace message before retrying.'); return false; }
    setMessage(success); return true;
  };
  const expiryVisible = paperManager ? ordersColumnsOf(currentState()).expiry : localExpiry;
  const presets: PaperPreset[] = paperManager?.book?.presets ?? [], selectedPreset = presets.find(row => row.id === paperManager?.selectedPresetId) ?? null;
  const accountRows = paperManager ? listBookAccounts(currentState()) : [];
  const exportTable = async (kind: PaperExportKind) => {
    try {
      assertRequest();
      // A chart zone other than UTC adds ISO offset twins of the time columns; the UTC columns stay as they were.
      const table = paperExportTable(latest.current.account, kind, { ordersColumns: { expiry: expiryVisible }, journalQuery, ...(zoneName === 'UTC' ? {} : { zone: { name: zoneName, iso: (seconds: number) => paperZonedIsoText(seconds, timezone) } }) });
      const result = await exportPaperCsv(table, exportBridge ?? (typeof window !== 'undefined' ? (window.lv as unknown as PaperExportBridge | undefined) : undefined));
      if (!active()) return;
      setMessage(result.ok ? `Saved ${table.rows.length} row(s) to a local CSV file.` : result.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const setExpiryColumn = (visible: boolean) => {
    if (!paperManager) { setLocalExpiry(visible); return; }
    applyState({ ok: true, state: setOrdersColumns(currentState(), { expiry: visible }) }, visible ? 'Expiry column shown.' : 'Expiry column hidden.', currentState());
  };
  const applyPreset = (preset: PaperPreset, side: PaperSide) => {
    try {
      assertRequest();
      const live = latest.current;
      let base: ReturnType<typeof inputFor> | undefined; if (preset.fields && !live.editing) { try { base = inputFor(live); } catch { base = undefined; } }
      const applied = applyPaperPreset(preset, side, live.now, base);
      dirty.current = true; setConfirmation(null); setEditing(null);
      setDraft(draftFromTicketInput(applied.input, draftFor(live.quote, live.now, timezone), timezone));
      let plan: PaperExitPlanInput | null = null;
      if (applied.input.exits) { try { const preview = previewPaperTicket(applied.input, contextFor({ ...live, editing: null })); if (preview.ok) plan = preview.value.resolved.exits ?? null; } catch { /* The ticket shows the diagnostic. */ } }
      setExitPlan(plan); setExitRepresentations(applied.input.exits); setPresetNotes(applied.notes); setTab('Orders');
      setMessage(`Preset applied to the ticket: ${presetSummary(preset)}. No order was submitted.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const seedToken = presetSeed?.token ?? null;
  useEffect(() => {
    if (seedToken === null || seededPreset.current === seedToken) return;
    seededPreset.current = seedToken;
    const chosen = paperManager?.book?.presets?.find(row => row.id === paperManager.selectedPresetId);
    if (chosen && presetSeed) applyPreset(chosen, presetSeed.side);
    else if (presetSeed) { setTab('Orders'); setDraft(current => ({ ...current, side: presetSeed.side })); } // no preset: the ticket opens on the chosen side
  }, [seedToken]);
  const saveTicketAsPreset = (replace = false) => {
    try {
      assertRequest();
      const live = latest.current, manager = live.manager;
      if (!manager) throw new Error('Presets are unavailable here.');
      if (live.editing) throw new Error('Finish or cancel the order edit before saving a preset.');
      const saved = savePaperPreset(manager.book?.presets ?? [], { name: presetName, side: live.draft.side, input: presetInputFromTicket(inputFor(live)), fields: presetFields }, { replace, ...(manager.idFactory ? { idFactory: manager.idFactory } : {}) });
      if (!saved.ok) {
        if (saved.needsConfirmation) { confirm('Replace preset', saved.message, () => saveTicketAsPreset(true), true); return; }
        setMessage(saved.message); return;
      }
      if (applyState({ ok: true, state: setBookPresets(currentState(), saved.presets) }, saved.replaced ? 'Preset replaced.' : 'Preset saved.', currentState())) manager.onSelectPreset(saved.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const confirmDeletePreset = () => {
    try {
      assertRequest();
      const manager = latest.current.manager, chosen = selectedPreset;
      if (!manager || !chosen) return;
      confirm('Delete preset', `Delete the preset ${chosen.name}?`, () => {
        const outcome = deletePaperPreset(latest.current.manager?.book?.presets ?? [], chosen.id, latest.current.manager?.selectedPresetId ?? null);
        const done = applyState({ ok: true, state: setBookPresets(currentState(), outcome.presets) }, 'Preset deleted.', currentState());
        if (done) latest.current.manager?.onSelectPreset(outcome.selectedId);
        return done;
      }, true);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const selectAccount = (id: string) => {
    try { assertRequest(); } catch (error) { setMessage(plainErrorText(error)); return; }
    const run = () => applyState(selectBookAccount(currentState(), id), 'Switched virtual account. Orders, positions, settings and history now belong to the chosen account.', currentState());
    if (dirty.current || latest.current.editing) confirm('Switch virtual account', 'Switching accounts discards the unsaved ticket draft. Switch anyway?', run, true); else run();
  };
  const confirmDeleteAccount = (id: string, name: string) => {
    try { assertRequest(); } catch (error) { setMessage(plainErrorText(error)); return; }
    confirm('Delete virtual account', `Delete ${name} and its virtual history?`, () => applyState(deleteBookAccount(currentState(), id), 'Virtual account deleted.', currentState()), true);
  };
  const createAccount = () => {
    try {
      assertRequest();
      const balance = newBalance.trim() ? strictNumber(newBalance, 'Starting balance') : undefined;
      const created = applyState(createBookAccount(currentState(), { name: newName, ...(balance === undefined ? {} : { initialBalance: balance }), currency: newCurrency.trim().toUpperCase() || 'USD' }, latest.current.now, latest.current.manager?.idFactory), 'Virtual account created. It has its own orders, positions, history and settings.', currentState());
      if (created) { setNewName(''); setNewBalance(''); }
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const saveRename = () => {
    if (!renaming) return;
    if (applyState(renameBookAccount(currentState(), renaming.id, renaming.text), 'Virtual account renamed. Its history is unchanged.', currentState())) setRenaming(null);
  };
  const accountsSection = paperManager ? <section aria-label="Virtual accounts"><strong>Virtual accounts</strong>
    <ul>{accountRows.map(row => <li key={row.id}>{renaming?.id === row.id
      ? <><input aria-label="Account name" type="text" maxLength={64} value={renaming.text} onChange={event => setRenaming({ id: row.id, text: event.target.value })}/><button type="button" onClick={saveRename}>Save name</button><button type="button" onClick={() => setRenaming(null)}>Cancel rename</button></>
      : <><span>{row.name} ({row.currency}){row.active ? ' | Active' : ''}</span><button type="button" disabled={row.active} onClick={() => selectAccount(row.id)}>Use {row.name}</button><button type="button" onClick={() => setRenaming({ id: row.id, text: row.name })}>Rename {row.name}</button><button type="button" disabled={accountRows.length <= 1} title={accountRows.length <= 1 ? 'Keep at least one virtual account' : undefined} onClick={() => confirmDeleteAccount(row.id, row.name)}>Delete {row.name}</button></>}</li>)}</ul>
    {accountRows.length <= 1 && <small>Keep at least one virtual account</small>}
    <label>New account name<input aria-label="New account name" type="text" maxLength={64} value={newName} onChange={event => setNewName(event.target.value)}/></label>
    <label>Starting balance<input aria-label="New account balance" type="text" inputMode="decimal" placeholder="100000" value={newBalance} onChange={event => setNewBalance(event.target.value)}/></label>
    <label>Currency<input aria-label="New account currency" type="text" maxLength={3} value={newCurrency} onChange={event => setNewCurrency(event.target.value)}/></label>
    <button type="button" onClick={createAccount}>Create account</button>
    <small>Each account is separate and local. Money is virtual. Currencies are never converted, so an order needs an instrument in the account currency.</small>
  </section> : null;
  const presetsSection = paperManager ? <fieldset aria-label="Order presets"><legend>Order presets</legend>
    <label>Chart preset<select aria-label="Chart order preset" value={paperManager.selectedPresetId ?? ''} onChange={event => paperManager.onSelectPreset(event.target.value || null)}><option value="">None</option>{presets.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    {selectedPreset && <small>{presetSummary(selectedPreset)}</small>}
    <button type="button" disabled={!selectedPreset || Boolean(editing)} onClick={() => selectedPreset && applyPreset(selectedPreset, selectedPreset.side)}>Apply preset to ticket</button>
    <label>Preset name<input aria-label="Preset name" type="text" maxLength={64} value={presetName} onChange={event => setPresetName(event.target.value)}/></label>
    <fieldset aria-label="Fields to save"><legend>Fields the preset applies in the ticket</legend>{PAPER_PRESET_FIELDS.map(row => <label key={row.id}><input type="checkbox" checked={presetFields.includes(row.id)} onChange={event => setPresetFields(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))}/>{row.label}</label>)}<small>Order type is always saved. Fields left out keep the ticket's values when you apply the preset; the chart Buy and Sell buttons always place the whole saved order.</small></fieldset>
    <button type="button" disabled={Boolean(editing)} onClick={() => saveTicketAsPreset()}>Save ticket as preset</button>
    <button type="button" disabled={!selectedPreset} onClick={confirmDeletePreset}>Delete preset</button>
    {presetNotes.length > 0 && <ul aria-label="Preset notes">{presetNotes.map(note => <li key={note}>{note}</li>)}</ul>}
    <small>The chart Buy and Sell buttons use the selected preset. This ticket starts from its own defaults and does not inherit it.</small>
  </fieldset> : null;
  const ordersToolbar = <div role="group" aria-label="Orders table tools" onMouseDown={event => event.stopPropagation()}>
    <button type="button" ref={columnsButton} aria-haspopup="menu" aria-expanded={columnsOpen} onClick={() => setColumnsOpen(open => !open)}>Columns</button>
    {columnsOpen && <div role="menu" aria-label="Orders columns" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setColumnsOpen(false); columnsButton.current?.focus(); } }}>
      <button type="button" role="menuitemcheckbox" aria-checked={expiryVisible} onClick={() => setExpiryColumn(!expiryVisible)}>Expiry</button>
    </div>}
    <button type="button" onClick={() => exportTable('orders')}>Export orders CSV</button>
  </div>;
  const closes = tab === 'History' ? paperPositionCloses(account).slice().reverse() : [];
  const journalRows = tab === 'History' ? filterJournal(account.events, journalQuery) : [];
  return <section className="lv-paper" aria-label="Virtual Paper Trading" onMouseDown={() => { if (columnsOpen) setColumnsOpen(false); }}>
    <style>{`.lv-paper{container-type:inline-size;background:var(--lv-bg-raised);color:var(--lv-text-primary);border-top:1px solid var(--lv-border);max-height:65vh;overflow:auto;padding:12px;font-size:12px}.lv-paper button{padding:6px 10px;border:1px solid var(--lv-border);border-radius:var(--lv-radius-plate,6px)}.lv-paper header,.lv-paper nav,.lv-paper .paper-summary{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.lv-paper header strong{font-size:16px}.lv-paper small{color:var(--lv-text-secondary)}.lv-paper .paper-summary>div{min-width:98px}.lv-paper .paper-summary b{display:block;font-variant-numeric:tabular-nums;margin-top:4px}.lv-paper .paper-grid{display:grid;grid-template-columns:245px minmax(0,1fr);gap:16px}.lv-paper .paper-ticket{display:flex;flex-direction:column;gap:10px}.lv-paper label{display:flex;justify-content:space-between;align-items:center;gap:10px}.lv-paper input:not([type=checkbox]),.lv-paper select{max-width:145px;width:145px}.lv-paper .paper-side{display:flex;gap:6px}.lv-paper .paper-side button{flex:1}.lv-paper table{width:100%;border-collapse:collapse;white-space:nowrap;font-variant-numeric:tabular-nums}.lv-paper td,.lv-paper th{padding:8px;text-align:right;border-bottom:1px solid var(--lv-border-panel)}.lv-paper td:first-child,.lv-paper th:first-child{text-align:left}.lv-paper .paper-table{overflow:auto;min-width:0}.lv-paper .paper-notice{font-size:11px;color:var(--lv-notice-text);margin:8px 0;line-height:1.5}.lv-paper .paper-clock{display:flex;flex-wrap:wrap;align-items:center;gap:4px 16px;margin:0 0 12px;font-size:11px;color:var(--lv-text-secondary);font-variant-numeric:tabular-nums}.lv-paper .paper-hint{display:flex;align-items:center;gap:4px}.lv-paper .lv-info-btn{min-width:18px;height:18px;padding:0;font-size:11px;margin-left:4px}.lv-paper .paper-tip-end .lv-info-tip{left:auto;right:0}.lv-paper [role=group]{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:8px}.lv-paper output{display:block;padding:9px 0;color:var(--lv-notice-text)}.lv-paper .paper-account{max-width:500px;display:flex;flex-direction:column;gap:12px}.lv-paper .paper-confirm{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:150;display:grid;place-items:center}.lv-paper .paper-confirm>div{background:var(--lv-bg-surface);border:1px solid var(--lv-border-hover);box-shadow:var(--lv-shadow);padding:24px;max-width:480px;border-radius:8px}.lv-paper .paper-confirm h3{margin-top:0}.lv-paper .paper-confirm p{line-height:1.6}.lv-paper .paper-confirm footer{display:flex;justify-content:flex-end;gap:10px}.lv-paper .paper-grid>*{min-width:0}.lv-paper th{white-space:normal;vertical-align:bottom;padding:6px}.lv-paper td{padding:6px}.lv-paper .paper-table{max-width:100%}.lv-paper .paper-table td:last-child button{margin:2px 0 2px 4px}.lv-paper fieldset>.paper-exits-status{display:block;flex-basis:100%;margin-top:6px}@container (max-width:900px){.lv-paper .paper-grid{grid-template-columns:1fr}.lv-paper .paper-ticket{max-width:400px}}@media(max-width:850px){.lv-paper .paper-grid{grid-template-columns:1fr}.lv-paper .paper-ticket{max-width:400px}}`}</style>
    <header><strong>Paper Trading</strong><span className="synthetic-badge">VIRTUAL FUNDS</span><InfoTip label="About virtual funds">{PAPER_NOTICE} All amounts here are virtual {account.settings.currency}. Unavailable means a required quote or order price is missing, not zero.</InfoTip><small>{account.name} | {account.settings.currency} | {account.mode === 'replay-paper' ? 'Separate replay account' : 'Ordinary local account'}</small><button type="button" title="Open the order ladder (DOM) in its own floating pane" onClick={() => { if (!openPaperDomPane('ticket')) setMessage(PAPER_DOM_PANE_NO_HOST); }}>Open DOM pane</button></header>
    <div className="paper-summary">{[['Balance', summary.balance], ['Equity', summary.equity], ['Cash', summary.cash], ['Unrealized P&L', summary.unrealized], ['Realized P&L after fees', summary.netRealized], ['Fees paid', summary.fees], ['Account margin', summary.marginUsed], ['Orders margin', summary.reservedMargin], ['Available funds', paperAvailableFunds(summary)], ['Buying power', summary.buyingPower]].map(([label, amount]) => <div key={String(label)}><small>{label}</small><b>{money(amount as number | null)}</b></div>)}<div><small>Margin buffer (%)</small><b title={buffer.reason ?? undefined}>{buffer.text}</b></div></div>
    {summary.staleMarks.length > 0 && <p role="alert">Stale marks: {summary.staleMarks.join(', ')}. Values are not current.</p>}
    <div className="paper-clock" aria-label="Paper simulation time"><span>Simulation clock ({zoneName}): {shownTime(account.clock, true) || 'Unavailable'}</span><span>Current ticket time ({zoneName}): {shownTime(now, true) || 'Unavailable'}</span><InfoTip label="About simulation time">Order expiry follows simulation time. Viewing this panel does not advance orders. Expiry processing stops when OpenCandle is closed.</InfoTip></div>
    {!contextRequest&&<nav aria-label="Paper trading tabs">{['Orders', 'Positions', 'History', 'Account'].map(name => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}{name === 'Orders' ? ` (${working.length})` : ''}</button>)}</nav>}
    {contextRequest&&<section aria-label="Clicked virtual ticket"><p className="paper-notice">Clicked level {contextRequest.priceText} {instrument.currency}<InfoTip label="About the clicked-price ticket">Buy Limit, one unit and regular-session entry are OpenCandle draft defaults. All funds are virtual; no order is submitted by opening this ticket.</InfoTip>{draft.type==='market'?' Market orders use the current bid/ask, not the clicked price.':''}</p><button type="button" onClick={()=>finish('cancelled')}>Cancel clicked-price ticket</button></section>}
    {replacement&&<div role="alertdialog" aria-label="Replace ticket draft"><p>A ticket or editor is already open. Replace its unsaved fields with this clicked-price request?</p><button type="button" onClick={()=>{try{if(replacementRef.current!==replacement||latest.current.contextRequest!==replacement.request||draftFingerprint()!==replacement.fingerprint)throw new Error('The pending request or ticket draft changed. Review it again.');seedRequest(replacement.request);}catch(error){setMessage(plainErrorText(error));}}}>Replace ticket</button><button type="button" onClick={()=>finish('cancelled')}>Cancel replacement</button></div>}
    {tab === 'Orders' && tradingRefusal && <p className="paper-notice" role="status">{tradingRefusal}</p>}
    {tab === 'Orders' && <div className="paper-grid"><form className="paper-ticket" aria-label="Virtual order ticket" onSubmit={event => { event.preventDefault(); submit(); }} onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.stopPropagation();if(!active()||confirmationAuthority.current!==confirmation)return;if(confirmation){cancelConfirmation(confirmation);}else if(contextRequest)finish('cancelled');else resetTicket(); } }}>
      <strong>{editing ? 'Modify working order' : 'New virtual order'} | {instrument.symbol}</strong><div className="paper-side"><button type="button" aria-pressed={draft.side === 'buy'} disabled={Boolean(editing)} className={draft.side === 'buy' ? 'primary' : ''} onClick={() => set('side', 'buy')}>Buy {quote ? quote.ask.toFixed(2) : ''}</button><button type="button" aria-pressed={draft.side === 'sell'} disabled={Boolean(editing)} className={draft.side === 'sell' ? 'primary' : ''} onClick={() => set('side', 'sell')}>Sell {quote ? quote.bid.toFixed(2) : ''}</button></div>
      <label>Order type<select aria-label="Order type" value={draft.type} disabled={Boolean(editing)} onChange={event => set('type', event.target.value as PaperOrderType)}>{[['market', 'Market'], ['limit', 'Limit'], ['stop', 'Stop'], ['stop-limit', 'Stop-limit'], ['trailing-stop', 'Trailing stop']].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Quantity basis<select aria-label="Quantity representation" value={draft.quantityMode ?? 'units'} onChange={event => set('quantityMode', event.target.value as PaperQuantityInput['kind'])}><option value="units">Units</option><option value="notional">Gross notional ({instrument.currency})</option><option value="balance-percent">Percent of selected balance</option><option value="risk-money">Gross risk ({instrument.currency})</option><option value="risk-percent">Risk percent of selected balance</option></select></label>
      <label>{draft.quantityMode === 'notional' || draft.quantityMode === 'risk-money' ? `Amount (${instrument.currency})` : draft.quantityMode === 'balance-percent' || draft.quantityMode === 'risk-percent' ? 'Percentage' : 'Quantity'}<input aria-label="Order quantity" type="text" inputMode="decimal" value={draft.quantity} onChange={event => set('quantity', event.target.value)}/></label>
      {(draft.quantityMode === 'balance-percent' || draft.quantityMode === 'risk-percent') && <label>Percentage denominator<select aria-label="Sizing balance basis" value={draft.balanceBasis ?? 'realized-balance'} onChange={event => set('balanceBasis', event.target.value as PaperSizingBalance)}><option value="realized-balance">Realized balance</option><option value="cash">Cash ledger</option><option value="equity">Equity with fresh marks</option></select></label>}
      {(draft.quantityMode === 'risk-money' || draft.quantityMode === 'risk-percent') && <label>Risk stop<select aria-label="Risk sizing stop" value={draft.riskStopLevelId ?? ''} onChange={event => set('riskStopLevelId', event.target.value)}><option value="">Choose a stop explicitly</option>{(exitRepresentations ?? representedExits(exitPlan))?.levels.filter(level => level.stopLoss).map((level, index) => <option key={level.id} value={level.id}>Level {index + 1}: {level.stopLoss!.value} {level.stopLoss!.kind}</option>)}</select></label>}
      {(draft.type === 'limit' || draft.type === 'stop-limit') && <><label>Limit representation<select aria-label="Limit representation" value={draft.limitMode ?? 'price'} onChange={event => set('limitMode', event.target.value as 'price' | 'side-ticks')}><option value="price">Absolute price</option><option value="side-ticks">Signed ticks from {draft.side === 'buy' ? 'ask' : 'bid'}</option></select></label><label>Limit value<input aria-label="Limit price" type="text" inputMode="decimal" value={draft.limitPrice} onChange={event => set('limitPrice', event.target.value)}/></label></>}
      {draft.type === 'trailing-stop' && <><label>Trail by<select aria-label="Trail by" value={draft.trailMode ?? 'distance'} onChange={event => set('trailMode', event.target.value as 'distance' | 'percent')}><option value="distance">Price distance</option><option value="percent">Percent of the best price</option></select></label><label>{(draft.trailMode ?? 'distance') === 'percent' ? 'Trail percent' : 'Trail distance'}<input aria-label="Trail amount" type="text" inputMode="decimal" value={draft.trailValue ?? ''} onChange={event => set('trailValue', event.target.value)}/></label><small>The stop follows the best price ({draft.side === 'sell' ? 'highest bid' : 'lowest ask'}) and never moves back. When the market reaches it, a market order is sent.</small></>}
      {(draft.type === 'stop' || draft.type === 'stop-limit') && <><label>Stop representation<select aria-label="Stop representation" value={draft.stopMode ?? 'price'} onChange={event => set('stopMode', event.target.value as 'price' | 'side-ticks')}><option value="price">Absolute price</option><option value="side-ticks">Signed ticks from {draft.side === 'buy' ? 'ask' : 'bid'}</option></select></label><label>Stop value<input aria-label="Stop price" type="text" inputMode="decimal" value={draft.stopPrice} onChange={event => set('stopPrice', event.target.value)}/></label></>}
      <label>Time in force<select aria-label="Time in force" value={draft.timeInForce} disabled={Boolean(editing)} onChange={event => set('timeInForce', event.target.value as PaperTicketDraft['timeInForce'])}><option value="DAY">{paperSessionBound(instrument) ? 'Day: until the session close' : 'Day: 24 hours'}</option><option value="GTC">Good till cancelled (GTC)</option><option value="GTD">Explicit expiry (local policy)</option><option value="WEEK">Week: until the last session close of the week</option><option value="MONTH">Month: until the last session close of the month</option></select></label>
      {(draft.timeInForce === 'GTD' || editing && draft.timeInForce === 'DAY') && <label>{`Expiry with UTC offset${zoneName === 'UTC' ? '' : ` (${zoneName} time)`}`}<input aria-label="Order expiration" type="text" placeholder={expiryText(EXPIRY_PLACEHOLDER_SECONDS, timezone)} value={draft.expiryChanged ? draft.expiresAt : rezonedExpiryText(draft.expiresAt, timezone)} onChange={event => {try{assertRequest();dirty.current=true;setConfirmation(null);setDraft(current => ({ ...current, expiresAt: event.target.value, expiryChanged: true }));}catch(error){setMessage(plainErrorText(error));}}}/></label>}
      {(draft.timeInForce === 'WEEK' || draft.timeInForce === 'MONTH') && <small className="paper-hint">{`Ends at the ${draft.timeInForce === 'WEEK' ? 'week' : 'month'}'s last close`}<InfoTip label="About this expiry">{`Expires at the last ${paperSessionBound(instrument) ? 'US session close' : 'UTC day'} of the ${draft.timeInForce === 'WEEK' ? 'week' : 'month'}; after that close the next ${draft.timeInForce === 'WEEK' ? 'week' : 'month'} applies.`}</InfoTip></small>}
      {draft.timeInForce === 'GTC' && <small className="paper-hint">{editing ? 'Time in force is fixed' : 'No expiry'}<InfoTip label="About this expiry">{editing ? 'This order is good till cancelled. Its time in force stays fixed.' : 'No expiry: the order stays working until it fills or is cancelled.'}</InfoTip></small>}
      {draft.timeInForce === 'DAY' && <small className="paper-hint">{editing ? 'Expiry unchanged unless edited' : paperSessionBound(instrument) ? dayCloseShort(now, instrument, draft.type === 'limit' && draft.extendedHours, shownTime) : 'Expires in 24 hours'}<InfoTip label="About this expiry">{editing ? 'Original expiry stays fixed unless you explicitly change it.' : (paperSessionBound(instrument) ? dayCloseHint(now, instrument, draft.type === 'limit' && draft.extendedHours, shownTime) : 'Expires 86400 seconds after accepted submission.') + ' The preview does not renew existing orders.'}</InfoTip></small>}
      {(draft.type === 'limit' || editing && !account.orders.find(order => order.id === editing)?.sessionPolicy) && <label><input aria-label="Entry outside regular hours" type="checkbox" disabled={Boolean(editing && !account.orders.find(order => order.id === editing)?.sessionPolicy)} checked={draft.extendedHours} onChange={event => set('extendedHours', event.target.checked)}/>Extended hours: the limit entry may also fill 04:00-09:30 and 16:00-20:00 New York time</label>}
      {Boolean(editing && !account.orders.find(order => order.id === editing)?.sessionPolicy) && <small>Legacy shared session flag retained. This edit does not convert existing exits.</small>}
      <fieldset><legend>Exits</legend><button type="button" disabled={Boolean(editing)} onClick={openTicketExits}>{exitPlan ? `Configure ${exitPlan.levels.length} exit level(s)` : exitRepresentations ? `Configure ${exitRepresentations.levels.length} exit level(s)` : 'Add take profit / stop loss'}</button>{exitPlan && !editing && <button type="button" onClick={() => {try{assertRequest();dirty.current=true;setExitPlan(null);setExitRepresentations(null);set('takeProfitOutsideRth',false);}catch(error){setMessage(plainErrorText(error));}}}>Remove ticket exits</button>}<small className="paper-exits-status">{editing ? 'Edit a working parent plan using Edit planned exits below. Main order modifications preserve it.' : exitPlan ? 'Saved in this ticket draft. Exits activate after the opening fill and a new eligible quote.' : 'No protective exits configured.'}</small></fieldset>
      {exitPlan?.levels.some(level => level.takeProfit !== undefined) && <label><input aria-label="Take profit outside regular hours" type="checkbox" disabled={Boolean(editing)} checked={draft.takeProfitOutsideRth ?? false} onChange={event => set('takeProfitOutsideRth', event.target.checked)}/>Take profit outside regular hours</label>}
      {presetsSection}
      <section aria-label="Ticket calculation preview"><strong>Calculation preview<InfoTip label="About the calculation preview">Local gross sizing excludes fees, leverage and FX. Budgets round down to the lot. Off-grid prices reject. Stop direction and equality checks are disclosed OpenCandle policies.</InfoTip></strong>{ticketPreview?.notices.filter(note => note === UNKNOWN_SESSION_NOTE || note.includes(LAST_IMPORTED_LABEL)).map(note => <small key={note}>{note}</small>)}{ticketPreview ? <><p>{ticketPreview.sizing.quantity} units | gross {money(ticketPreview.sizing.grossNotional)} {instrument.currency}</p><small>Entry basis: {ticketPreview.sizing.entryBasis} {ticketPreview.sizing.entryPrice}.{ticketPreview.sizing.balanceBasis && ` ${ticketPreview.sizing.balanceBasis}: ${ticketPreview.sizing.balanceValue}.`} {ticketPreview.sizing.riskStopLevelId && `Risk stop ${ticketPreview.sizing.riskStopLevelId}: ${ticketPreview.sizing.riskStopPrice}.`}</small>{ticketPreview.resolved.exits?.levels.map((level, index) => <p key={index}>Exit {index + 1}: {level.quantity} units; TP {level.takeProfit ?? 'none'}; SL {level.stopLoss ?? 'none'}.</p>)}</> : <p>{ticketError}</p>}{ticketPreview && <small>Estimated virtual fee at entry basis after slippage: {money(paperFeeFor(account.settings, ticketPreview.sizing.quantity, paperSlippedPrice(account.settings, { type: draft.type, side: draft.side, instrument }, ticketPreview.sizing.entryPrice)))} {account.settings.currency}. Slippage: {paperSlippageApplies({ type: draft.type }) ? `${account.settings.slippageTicks ?? 0} tick(s) on this fill` : 'none for limit-priced fills'}. Buying power after reservations: {money(summary.buyingPower)} virtual {account.settings.currency}.</small>}{account.positions[instrument.id] ? <small>Current virtual position: {account.positions[instrument.id].quantity} {instrument.symbol} at average {account.positions[instrument.id].averagePrice}.</small> : <small>No current virtual position in {instrument.symbol}.</small>}</section>
      <button className="primary" type="submit" disabled={Boolean(contextRequest&&(seeded.current!==contextRequest||replacement))}>{editing ? 'Apply modification' : `${draft.side === 'buy' ? 'Buy' : 'Sell'} with virtual funds`}</button><button type="button" onClick={resetTicket}>{editing ? 'Cancel edit' : 'Reset ticket'}</button>
      <small>{quote?.fixture ? 'Synthetic bid/ask for demonstration.' : quote && isLastImportedQuote(quote) ? `Price shown is the ${LAST_IMPORTED_LABEL} from the imported file.` : quote ? 'Provider bid/ask supplied by the workspace.' : 'No quote available. Market orders wait for usable data.'}</small>
    </form><div className="paper-table" hidden={Boolean(contextRequest)}><div role="group" aria-label="Scoped virtual cancellation"><button type="button" onClick={() => confirmScopedCancel()}>Cancel all {instrument.symbol} orders</button><button type="button" onClick={() => confirmScopedCancel('buy')}>Cancel buy orders</button><button type="button" onClick={() => confirmScopedCancel('sell')}>Cancel sell orders</button><InfoTip label="About scoped cancellation" className="paper-tip-end">Current chart instrument only. Exit pairs are excluded.</InfoTip></div>{ordersToolbar}<table><thead><tr><th>Symbol</th><th>Side / type</th><th>Quantity</th><th>Limit / stop</th><th>Instruction</th><th>Status</th>{expiryVisible && <th>{`Expiry (${zoneName})`}</th>}<th>Actions</th></tr></thead><tbody>{working.map(order => <tr key={order.id}><td>{order.instrument.symbol}{stubInstrument(order.instrument) ? ' SYNTHETIC' : ''}</td><td>{order.side} {order.type}</td><td>{order.quantity}</td><td>{order.limitPrice ?? 'None'} / {order.stopPrice ?? 'None'}</td><td>{order.sessionPolicy || order.bracket && account.brackets?.groups.find(group => group.id === order.bracket!.groupId)?.sessionPolicy ? order.extendedHours ? 'Outside RTH eligible' : 'Regular session only' : order.extendedHours ? 'Legacy: outside enabled' : 'Legacy: outside disabled'}</td><td>{order.status}</td>{expiryVisible && orderExpiryCell(order, timezone, timeHours)}<td><button onClick={() => startEdit(order.id)}>Modify</button><button onClick={() => confirmCancelOrder(order.id)}>Cancel order</button></td></tr>)}</tbody></table>{working.length === 0 && <p>No working virtual orders.</p>}</div></div>}
    {tab === 'Positions' && <div className="paper-table"><button type="button" onClick={() => exportTable('positions')}>Export positions CSV</button>{Object.keys(account.positions).length > 0 && <button type="button" onClick={confirmCloseAll}>Close all positions</button>}<table><thead><tr><th>Symbol</th><th>Side</th><th>Quantity</th><th>Average price</th><th>Mark</th><th>Unrealized P&L</th><th>P&L %</th><th>Realized gross</th><th>Actions</th></tr></thead><tbody>{Object.values(account.positions).map(position => { const markQuote = account.quotes[position.instrument.id], mark = markQuote ? position.quantity > 0 ? markQuote.bid : markQuote.ask : null, stale = summary.staleMarks.includes(position.instrument.id); return <tr key={position.instrument.id}><td>{position.instrument.symbol}</td><td>{position.quantity > 0 ? 'Long' : 'Short'}</td><td>{position.quantity}</td><td>{money(position.averagePrice)}</td><td>{money(mark)}{mark !== null && ` (${position.quantity > 0 ? 'bid' : 'ask'}${stale ? ', stale' : ''}${markQuote?.fixture ? ', synthetic' : ''}${markQuote && isLastImportedQuote(markQuote) ? ', ' + LAST_IMPORTED_LABEL : ''})`}</td><td>{money(mark === null ? null : new Decimal(mark).sub(position.averagePrice).mul(position.quantity).toDecimalPlaces(10).toNumber())}</td><td>{mark === null ? 'Unavailable' : paperPositionPnlPercent(new Decimal(mark).sub(position.averagePrice).mul(position.quantity).toNumber(), position.averagePrice, position.quantity) ?? 'Unavailable'}</td><td>{money(position.realizedGross)}</td><td><input aria-label={`Close quantity ${position.instrument.symbol}`} type="text" inputMode="decimal" placeholder={String(Math.abs(position.quantity))} value={closeQuantities[position.instrument.id] ?? ''} onChange={event => { const value = event.target.value; setCloseQuantities(current => ({ ...current, [position.instrument.id]: value })); }}/><button onClick={() => confirmPartialClose(position.instrument.id)}>Close quantity</button><button onClick={() => confirmClosePosition(position.instrument.id)}>Close position</button><button onClick={() => confirmReverse(position.instrument.id)}>Reverse</button></td></tr>; })}</tbody></table>{Object.keys(account.positions).length === 0 && <p>No open virtual positions.</p>}</div>}
    {tab === 'History' && <div className="paper-table" aria-label="Virtual order history"><strong>Order history</strong><button type="button" onClick={() => exportTable('history')}>Export order history CSV</button><table><thead><tr><th>{`Updated (${zoneName})`}</th><th>Symbol</th><th>Side / type</th><th>Quantity</th><th>Limit / stop</th><th>Status</th><th>Average fill</th><th>Reason</th></tr></thead><tbody>{account.orders.filter(order => !['working', 'triggered'].includes(order.status)).slice().reverse().map(order => <tr key={order.id}><td>{shownTime(order.updatedAt)}</td><td>{order.instrument.symbol}{stubInstrument(order.instrument) ? ' SYNTHETIC' : ''}</td><td>{order.side} {order.type}{order.bracket ? ` (${order.bracket.leg === 'tp' ? 'take profit' : 'stop loss'})` : ''}</td><td>{order.quantity}</td><td>{order.limitPrice ?? 'None'} / {order.stopPrice ?? 'None'}</td><td>{order.status}</td><td>{order.averageFillPrice ?? 'None'}</td><td>{order.rejectionReason ?? ''}</td></tr>)}</tbody></table>{!account.orders.some(order => !['working', 'triggered'].includes(order.status)) && <p>No filled, cancelled, expired or rejected virtual orders.</p>}</div>}
    {tab === 'History' && <div className="paper-table" aria-label="Virtual fills and realized results"><strong>Fills and realized results</strong><table><thead><tr><th>{`Time (${zoneName})`}</th><th>Symbol</th><th>Side</th><th>Quantity</th><th>Fill price</th><th>Fill basis</th><th>Quote price</th><th>Slippage</th><th>Virtual fee</th><th>Realized gross</th><th>Quote source</th></tr></thead><tbody>{account.fills.slice().reverse().map(fill => <tr key={fill.id}><td>{shownTime(fill.at)}</td><td>{paperFillSymbol(account, fill)}</td><td>{fill.side}</td><td>{fill.quantity}</td><td>{fill.price}</td><td>{paperFillBasisLabel(fill.basis)}</td><td>{fill.quotePrice ?? fill.price}</td><td>{fill.slippage ?? 0}</td><td>{fill.commission}</td><td>{fill.realizedGross}</td><td>{fill.fixture ? 'Synthetic' : 'Provider'} #{fill.quoteSequence}</td></tr>)}</tbody></table>{account.fills.length === 0 && <p>No virtual fills.</p>}<small>Realized gross excludes fees; fees are listed per fill. Positions use weighted-average cost.</small></div>}
    {tab === 'History' && <div className="paper-table"><strong>Journal</strong><label>Search journal<input aria-label="Search journal" type="text" value={journalQuery} onChange={event => setJournalQuery(event.target.value)}/></label><button type="button" onClick={() => exportTable('journal')}>Export journal CSV</button><table><thead><tr><th>{`Time (${zoneName})`}</th><th>Order</th><th>Event</th><th>Details</th></tr></thead><tbody>{journalRows.slice().reverse().map(event => <tr key={event.id}><td>{shownTime(event.at)}</td><td>{event.orderId}</td><td>{event.type}</td><td>{event.message}</td></tr>)}</tbody></table>{account.events.length === 0 && <p>No virtual account events.</p>}{account.events.length > 0 && journalRows.length === 0 && <p>No journal events match this search.</p>}</div>}
    {tab === 'History' && <div className="paper-table" aria-label="Virtual account history by position"><strong>Account history by position</strong><button type="button" onClick={() => exportTable('account-history')}>Export account history CSV</button><table><thead><tr><th>Position</th><th>Direction</th><th>{`Opened (${zoneName})`}</th><th>{`Closed (${zoneName})`}</th><th>Fills</th><th>Realized gross</th><th>Virtual fees</th><th>Net realized</th></tr></thead><tbody>{closes.map(group => <React.Fragment key={group.index}><tr><td>{group.symbol} #{group.index}</td><td>{group.direction}</td><td>{shownTime(group.openedAt)}</td><td>{group.closedAt === null ? 'Open' : shownTime(group.closedAt)}</td><td>{group.fills.length}</td><td>{group.realizedGross}</td><td>{group.fees}</td><td>{group.netRealized}</td></tr>{group.fills.map(fill => <tr key={fill.id}><td colSpan={2}>{fill.side} {fill.quantity} at {fill.price}</td><td colSpan={2}>{shownTime(fill.at)}</td><td colSpan={4}>{group.opensFromReversal && fill === group.fills[0] ? 'Reversing fill, counted under the position it closed' : 'Fill'}</td></tr>)}</React.Fragment>)}</tbody></table>{closes.length === 0 && <p>No positions yet.</p>}<small>One group per position from its first fill until it returns to zero or reverses. A reversing fill appears under both positions.</small></div>}
    {tab === 'Account' && <div className="paper-account">{accountsSection}<label>One-click actions<input aria-label="One-click virtual actions" type="checkbox" checked={account.settings.oneClick ?? false} onChange={event => apply(configurePaperAccount(account, { oneClick: event.target.checked }, now), event.target.checked ? 'Virtual actions now skip confirmation.' : 'Virtual action confirmations enabled.', account)}/></label><small>When enabled, order placement, modification, cancellation and closing skip their confirmation.</small><label>Virtual leverage<input aria-label="Virtual leverage" type="number" min="1" max="100" step="1" value={leverage} onChange={event => setLeverage(event.target.value)}/></label><label>Virtual commission<select aria-label="Commission model" value={feeKind} onChange={event => setFeeKind(event.target.value as PaperCommission['kind'])}><option value="fixed">Per filled order</option><option value="percent">Percent of notional</option><option value="per-unit">Per unit</option></select></label><label>Commission amount<input aria-label="Commission amount" type="number" min="0" step="0.01" value={feeValue} onChange={event => setFeeValue(event.target.value)}/></label><label>Virtual slippage (ticks)<input aria-label="Virtual slippage ticks" type="number" min="0" max="10000" step="1" value={slippageTicks} onChange={event => setSlippageTicks(event.target.value)}/></label><small className="paper-hint">Market and stop fills only<InfoTip label="About virtual slippage">OpenCandle local policy, default 0: market and stop fills (including stop-loss exits) move adversely by whole ticks of {instrument.symbol} ({instrument.tickSize}). Limit, stop-limit and take-profit fills never slip. This is a local simulation policy, not a documented exchange setting.</InfoTip></small><label>Maximum quote age (seconds)<input aria-label="Maximum quote age seconds" type="number" min="0" step="1" value={quoteAge} onChange={event => setQuoteAge(event.target.value)}/></label><small>Older quotes do not fill orders or support ticket previews; working orders wait for a fresh quote.</small><button onClick={() => { try { apply(configurePaperAccount(account, { leverage: strictNumber(leverage, 'Leverage'), commission: { kind: feeKind, value: strictNumber(feeValue, 'Commission') }, slippageTicks: strictNumber(slippageTicks, 'Slippage ticks'), maxQuoteAgeSeconds: strictNumber(quoteAge, 'Maximum quote age') }, now), 'Settings applied to future virtual fills. Existing fill history is unchanged.', account); } catch (error) { setMessage(plainErrorText(error)); } }}>Apply simulation settings</button><small>Current: commission {account.settings.commission.kind} {account.settings.commission.value}; slippage {account.settings.slippageTicks ?? 0} tick(s); leverage {account.settings.leverage}; maximum quote age {account.settings.maxQuoteAgeSeconds} seconds.</small><button onClick={() => void exportAccount()}>Export account JSON</button><label>Reset balance<input aria-label="Reset virtual balance" type="number" min="0.01" step="0.01" value={resetBalance} onChange={event => setResetBalance(event.target.value)}/></label><label>Reset currency<input aria-label="Reset virtual currency" type="text" maxLength={3} value={resetCurrency} onChange={event => setResetCurrency(event.target.value)}/></label><small>Changing currency requires a reset; history is never converted. Orders need an instrument in the same currency because FX conversion is unavailable.</small><button onClick={() => { try { const balance = strictNumber(resetBalance, 'Reset balance'), currency = resetCurrency.trim().toUpperCase(), changes = { initialBalance: balance, currency }; resetPaperAccount(account, changes, now); const counts = `${account.orders.filter(order => ['working', 'triggered'].includes(order.status)).length} working order(s), ${Object.keys(account.positions).length} position(s) and ${account.fills.length} fill(s)`; confirm('Reset virtual account', `Set the balance to ${money(balance)} virtual ${currency} and delete this account's ${counts} plus its trading history? Commission, slippage, leverage and quote-age settings are kept. Cancel keeps everything unchanged.`, () => { const live = latest.current; return apply({ ok: true, account: resetPaperAccount(live.account, changes, live.now), diagnostics: [] }, `Virtual account reset to ${money(balance)} ${currency}. No real money moved.`, live.account); }, true); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } }}>Reset virtual account</button><details><summary>Execution assumptions and current limitations</summary>{PAPER_POLICIES.map(policy => <p key={policy}>{policy}</p>)}<p>Working orders and their exits move by dragging their lines on the chart.</p></details></div>}
    {!contextRequest&&(tab === 'Orders' || tab === 'Positions') && <section aria-label="Virtual exit groups" style={{ marginTop: 14 }}><h3>Virtual exits</h3>
      {tab === 'Orders' && account.orders.filter(order => order.exits && ['working', 'triggered'].includes(order.status)).map(order => <p key={order.id}>{order.instrument.symbol} pending {order.side} {order.quantity} <button onClick={() => openPendingExits(order.id)}>Edit planned exits</button></p>)}
      {Object.values(account.positions).map(position => <p key={position.instrument.id}>{position.instrument.symbol}: {Math.abs(position.quantity)} units <button onClick={() => openPositionExits(position.instrument.id)}>Manage current position exits</button></p>)}
      {account.brackets?.groups.filter(group => group.status === 'active').map(group => <div key={group.id} className="paper-table"><strong>{group.instrument.symbol} {group.owner === 'entry' ? 'Entry exits' : 'Position snapshot exits'} ({group.direction === 'buy' ? 'long' : 'short'})</strong><table><thead><tr><th>Level</th><th>Requested</th><th>Executable</th><th>TP / SL</th><th>Status</th><th>Actions</th></tr></thead><tbody>{group.levels.map(level => <tr key={level.id}><td>{level.ordinal + 1}</td><td>{level.requestedQuantity}</td><td>{level.allocation}</td><td>{level.takeProfit ?? 'None'} / {level.stopLoss ?? 'None'}</td><td>{level.status === 'active' && level.allocation === 0 ? 'Dormant, capped' : level.status}</td><td><button disabled={level.status !== 'active'} onClick={() => openExitLevel(group.id, level.id)}>Edit level</button><button disabled={level.status !== 'active'} onClick={() => { const target = paperExitTarget(account, 'group', group.id); confirm('Cancel virtual exit pair', 'Cancel this level and both of its active children? Position exposure stays open.', () => apply(cancelPaperExitLevel(latest.current.account, target, level.id, latest.current.now), 'Virtual exit pair cancelled.', latest.current.account)); }}>Cancel pair</button></td></tr>)}</tbody></table><small>Requested excess is retained. FIFO manual reductions and ordered level allocations are OpenCandle policies. Changes activate on the next distinct quote.</small></div>)}
      {!account.brackets?.groups.some(group => group.status === 'active') && <p>No active virtual exit groups.</p>}
    </section>}
    {tab === 'History' && !!account.brackets?.groups.length && <details><summary>Exit allocation history</summary>{account.brackets.groups.map(group => <div key={group.id}><p>{group.instrument.symbol}: {group.id}, generation {group.generation}, {group.status}</p>{group.levels.map(level => <p key={level.id}>Level {level.ordinal + 1}: requested {level.requestedQuantity}, filled {level.filledQuantity}, allocated {level.allocation}, {level.status}. Next eligible sequence greater than {level.activationSequence}. Children: {level.childIds.join(', ') || 'none'}.</p>)}</div>)}</details>}
    {tab === 'History' && account.orders.some(order => order.ticket) && <details><summary>Ticket conversion snapshots</summary><p>Recorded local sizing inputs and bases. Current canonical order fields govern execution; edits to exit groups do not rewrite these snapshots.</p>{account.orders.filter(order => order.ticket).map(order => <p key={order.id}>{order.id}: {order.ticket!.input.quantity.kind} {order.ticket!.input.quantity.value}; resolved {order.ticket!.sizing.quantity} units, entry basis {order.ticket!.sizing.entryBasis} {order.ticket!.sizing.entryPrice}, gross notional {order.ticket!.sizing.grossNotional} {order.instrument.currency}. {order.ticket!.sizing.balanceBasis && `${order.ticket!.sizing.balanceBasis}: ${order.ticket!.sizing.balanceValue}.`} Captured {shownTime(order.ticket!.preparedAt, true)}, submitted {shownTime(order.ticket!.submittedAt, true)}. {order.ticket!.quote?.fixture ? 'Synthetic quote.' : 'Supplied quote or explicit pending price.'}</p>)}</details>}
    <output role="status" aria-live="polite">{message}</output>
    {exitEditor && <PaperExitEditor value={exitEditor} close={() => {if(active())setExitEditor(null);}}/>}
    {confirmation && <div className="paper-confirm" onMouseDown={event => event.stopPropagation()}><div ref={confirmationRef} role="alertdialog" aria-modal="true" aria-labelledby="paper-confirm-title" onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); cancelConfirmation(confirmation); } else if (event.key === 'Tab'&&active()&&confirmationAuthority.current===confirmation) { const buttons = confirmationRef.current?.querySelectorAll<HTMLButtonElement>('button'); if (!buttons?.length) return; const first = buttons[0], last = buttons[buttons.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }}><h3 id="paper-confirm-title">{confirmation.title}</h3><p>{confirmation.detail}</p><footer><button onClick={() => cancelConfirmation(confirmation)}>Cancel</button><button className="primary" onClick={() => {if(active())confirmation.execute();}}>Confirm</button></footer></div></div>}
  </section>;
}
