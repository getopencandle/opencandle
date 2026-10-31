import {hasNyseAlertCalculation} from '../domain/nyse-mtf-alert-source';
import { prepareAlertBatch, applyAlertBatch, assertAlertBatchCurrent, type AlertBatchPlan, type AlertBatchAction } from '../domain/alert-batch-actions';
import { reconcileAlertSelection, transitionAlertSelection, isAlertSelected, type AlertSelectionState, type AlertSelectionIntent } from './alert-selection-state';
import React, { useEffect, useRef, useState } from 'react';
import { trapTabFromDialog, useDialogFocusRetention } from './Modal';
import { ALERT_POLICIES, createLocalAlert, editLocalAlert, LOCAL_ALERT_NOTICE, setLocalAlertPaused,processLocalAlertBatch,validateLocalAlerts } from '../domain/alerts';
import type { AlertConditionKind, AlertDefinition, AlertEvent, AlertFrequency, LocalAlert } from '../domain/alerts';
import { alertObservationDescription, alertSourceId, sameAlertBinding, sameAlertSource, SNAPSHOT_ALERT_POLICIES } from '../domain/alert-observation';
import type { AlertObservationBinding, AlertObservationContext,AlertSourceSnapshot } from '../domain/alert-observation';
import { alertConditionMemberRefusal, ALERT_GROUP_CONDITION_LIMIT } from '../domain/alert-observation';
import { technicalSourceKey, technicalSourceLabel } from '../domain/technical-alerts';
import type { Instrument, PriceSource } from '../domain/types';
import { DEFAULT_ALERT_MANAGER_FILTER, DEFAULT_ALERT_MANAGER_SORT, filterAlertManagerAlerts, sortAlertManagerAlerts, type AlertManagerFilter, type AlertManagerSort } from '../domain/alert-manager-view';
import {assertContextPriceRequest,type ContextPriceProps,type ContextPriceRequest,type ContextPriceOutcome} from './context-price-request';
import {alertHistoryCsv} from '../domain/alert-history-export';
import {ALERT_DELIVERY_POLICY,ALERT_SOUNDS,ALERT_SOUND_REPEAT_LABELS,ALERT_SOUND_REPEAT_SECONDS,ALERT_WEBHOOK_LOCAL_ONLY,LV_DEFAULT_ALERT_DELIVERY,alertDeliveryFor,createAlertDelivery,describeAlertDelivery,sendAlertWebhookTest,type AlertSoundId,type AlertSoundRepeat,type AlertWebhookPort} from '../domain/alert-delivery';
import {defaultAlertWebhookPort,type AlertWebhookBridge} from './alert-delivery-host';
import {sharedAlertSoundPlayer,type AlertSoundPlayer} from './alert-sound';
import {alertUsesSyntheticStub} from './background-alert-plan';
import {ALERT_MESSAGE_PLACEHOLDER_HELP} from '../domain/alert-message';
import {AlertPlaceholderPicker} from './AlertPlaceholderPicker';
import {ALERT_POSITION_POLICY,describePosition,type AlertPositionLevels} from '../domain/alert-position';
import {describeAlertLevels,type AlertLevelSet} from '../domain/alert-levels';
import {drawingAlertDraft,drawingSourceShape,drawingSourceName,drawingConditionText,CHANNEL_ALERT_KINDS} from '../domain/drawing-alert-rules';
import {EMPTY_ALERT_HISTORY_SELECTION,isAlertHistorySelected,reconcileAlertHistorySelection,transitionAlertHistorySelection,type AlertHistorySelection,type AlertHistorySelectionIntent} from './alert-history-selection';
import {alertDisplayClockActive,systemAlertClock,formatAlertTime,formatAlertAccessibleTime,alertExpiryFromInstant,alertExpiryView,alertExpiryForText,editAlertExpiry,alertExpiryCandidates,chooseAlertExpiry,resolveAlertExpiry,ALERT_EXPIRY_PRESETS,alertExpiryPreset,type AlertExpiryDraft} from './alert-time';
import {alertListBackground,alertListStep,reconcileAlertListView,type AlertListView,type AlertListItem} from './alert-list-navigation';
import {CompoundAlertDialogBoundary,CompoundAlertCount,CompoundAlertHistoryCount} from './CompoundAlertDialogBoundary';
import type {CompoundAlertDialogController} from './compound-alert-dialog';

export interface AlertSourceChoice{id:string;label:string;source:AlertSourceSnapshot|null;disabledReason?:string;targetOnly?:boolean;constantOnly?:boolean;position?:AlertPositionLevels;/** A Fib retracement source carries its frozen active levels. */levels?:AlertLevelSet;/** A script condition or ctx.alert source reads 1 when true and 0 otherwise; choosing it presets "Greater than 0". */scriptSignal?:boolean;/** The plot titles of the source's script in plot order, for the placeholder picker. */plotTitles?:string[];/** A strategy order-fill source; choosing it also presets "Once per bar". */strategyFill?:boolean;/** The drawing shape this source watches: a line (compared with the price), a channel (Entering, Exiting, Inside, Outside) or a vertical line (time reaching it). */drawingShape?:'line'|'channel'|'time'}
/** The sources of one added condition (a source, compared with a constant or with another source). */
export interface AlertConditionSelection { readonly sourceId: string; readonly targetId: string; }
/** The operator fields of one added condition, beside its AlertConditionSelection. */
export interface AlertConditionDraft { kind: AlertConditionKind; value: string; lower: string; upper: string; amount: string; bars: string; percent: boolean; }
export function emptyAlertConditionDraft(): AlertConditionDraft { return { kind: 'crossing', value: '', lower: '', upper: '', amount: '1', bars: '1', percent: false }; }
/** Entry request from a toolbar, indicator or drawing control. sourceId is a catalog choice ID such as indicator:<id>:<plot>, drawing:<id> or position:<id>. */
export interface AlertCreateRequest { readonly sourceId?: string; /** Opens this saved alert's own form (the docked Alerts panel's Edit). */ readonly editId?: string; }
export interface ManagerActionAuthority { readonly token: object; readonly assertCurrent: (expectedToken: object) => void }
export interface AlertDialogProps extends ContextPriceProps { /** The draft's added conditions (all must match), owned with the source selection. Absent: one condition only. */ conditionSelections?: readonly AlertConditionSelection[]; onConditionSelectionsChange?: (conditions: readonly AlertConditionSelection[]) => void; readActionTime?: () => number; managerActionAuthority?: ManagerActionAuthority; open: boolean; invalidDrawings?:ReadonlyMap<string,string>; onClose: () => void; alerts: LocalAlert[]; onAlertsChange: (alerts: LocalAlert[],expected?:LocalAlert[]) => boolean|void; instrument: Instrument; now: number; event?: AlertEvent | null; events?:readonly AlertEvent[]; externallyProcessed?:boolean;context?: AlertObservationContext | null; contexts?:readonly AlertObservationContext[]; diagnostics?: string[]; onRequestObservation?: (reason?:'after-save') => void; priceSource?: PriceSource; onPriceSourceChange?: (source: PriceSource) => void; replayAssumeCompletion?: boolean; onReplayAssumeCompletionChange?: (value: boolean) => void; sourceChoices?:readonly AlertSourceChoice[];selectedSourceId?:string;targetSourceId?:string;onSourceChange?:(id:string)=>void;onTargetChange?:(id:string)=>void;sourceSelectionKey?:string;evaluationPending?:boolean;validateCurrentSource?:(binding:AlertObservationBinding)=>void; soundPlayer?:AlertSoundPlayer; /** Send test poster; default is the desktop bridge's postAlertWebhook. */ webhookPort?:AlertWebhookPort|null; /** Rendered whether or not the manager is open, at a stable tree position. */ deliveryHost?:React.ReactNode; /** Optional canonical all-conditions collection; scalar defaults and hook order are unchanged. */ compound?:CompoundAlertDialogController; /** A new object while open starts a new alert draft (top toolbar, indicator or drawing entry). A sourceId preselects that catalog source. */ createRequest?:AlertCreateRequest|null; /** The chart's last close. A price alert whose source has no observed value yet (a 1D chart in Regular hours) opens with this level instead of an empty one. */ readLastPrice?:()=>number|null; /** Escape or Cancel discarded the Create draft; the host resets the source and target it keeps for that draft. */ onDraftDiscarded?:()=>void; /** A requested create or edit was saved and the dialog closes; the host shows this short confirmation. */ onSaved?:(message:string)=>void; }
export interface AlertDraft { expiry?:AlertExpiryDraft; name: string; message: string; kind: AlertConditionKind; value: string; lower: string; upper: string; amount: string; bars: string; percent: boolean; frequency: AlertFrequency; expirationEnabled: boolean; expiresAt: string; popup?: boolean; desktop?: boolean; sound?: AlertSoundId | ''; /** LV-local webhook (this computer only). */ webhookEnabled?: boolean; webhook?: string; /** Sound duration; 0 or absent plays once. */ soundRepeat?: AlertSoundRepeat | 0; /** The added conditions' fields, in order. */ conditions?: AlertConditionDraft[]; }
const expiryDraft=(instant:number)=>alertExpiryFromInstant(instant,systemAlertClock().zone);
const draftExpiry=(draft:AlertDraft)=>draft.expiry&&draft.expiry.value===draft.expiresAt?draft.expiry:alertExpiryForText(draft.expiresAt,draft.expiry?.zone??systemAlertClock().zone);
function initialDraft(instrument: Instrument, now: number, price: number | null): AlertDraft { const expiry=expiryDraft(now+86400);return { name: `${instrument.symbol} price alert`, message: `${instrument.symbol} reached the selected condition.`, kind: 'crossing', value: price === null ? '' : String(price), lower: price === null ? '' : String(price), upper: price === null ? '' : String(price), amount: '1', bars: '1', percent: false, frequency: 'only-once', expirationEnabled: false, expiresAt:expiry.value,expiry, popup: LV_DEFAULT_ALERT_DELIVERY.popup, desktop: LV_DEFAULT_ALERT_DELIVERY.desktop, sound: LV_DEFAULT_ALERT_DELIVERY.sound ?? '' }; }
const number = (text: string, label: string) => { if (!text.trim() || !Number.isFinite(Number(text))) throw new Error(`${label} must be a finite number.`); return Number(text); };
/** An indicator source names the default alert ("AAPL RSI alert"); a price, drawing or other source keeps the plain price name. */
function sourceDefaultText(symbol:string,choice:AlertSourceChoice|undefined):{name:string;message:string}{const label=choice&&choice.id.startsWith('indicator:')&&choice.source?choice.label:null;return label?{name:`${symbol} ${label} alert`,message:`${symbol} ${label} reached the selected condition.`}:{name:`${symbol} price alert`,message:`${symbol} reached the selected condition.`};}
/** Replaces a still-default name and message of `from` with the defaults of `to`. */
function renameDefaultDraft<T extends {name:string;message:string}>(draft:T,symbol:string,from:AlertSourceChoice|undefined,to:AlertSourceChoice|undefined):T{const before=sourceDefaultText(symbol,from),after=sourceDefaultText(symbol,to);let next=draft;if(next.name===before.name&&before.name!==after.name)next={...next,name:after.name};if(next.message===before.message&&before.message!==after.message)next={...next,message:after.message};return next;}
/** The level text a source change reseeds from the new source's current value: price at the instrument tick, other sources at 2 decimals. */
export function reseedLevelText(value:number,tickSize:number|undefined,price:boolean):string{const decimals=price&&tickSize&&tickSize>0?Math.min(8,Math.max(0,Math.ceil(-Math.log10(tickSize)-1e-9))):2;return String(Number(value.toFixed(decimals)));}
export function buildAlertDefinition(draft: AlertDraft, context: { id: string; instrumentId: string; now: number; mode: 'ordinary' | 'replay'; runId: string; sourceId?: string; observationBinding?: AlertObservationBinding; position?: AlertPositionLevels; levels?: AlertLevelSet }): AlertDefinition {
  if (!draft.name.trim() || draft.name.length > 200 || draft.message.length > 4000) throw new Error('Name is required, with at most 200 characters; message limit is 4000.');
  const condition: AlertDefinition['condition'] = { kind: draft.kind };
  const group = context.observationBinding?.source.kind === 'all' ? context.observationBinding.source : null;
  if (group && (context.position || context.levels)) throw new Error('Drawing level alerts cannot have added conditions.');
  if (!group && draft.conditions?.length) throw new Error('The added conditions are still being prepared. Wait for the current source observation before saving.');
  if (context.position) { condition.kind = 'position'; condition.position = structuredClone(context.position); }
  else if (context.levels) { condition.kind = 'level-crossing'; condition.levels = structuredClone(context.levels); }
  else if (draft.kind === 'position') throw new Error('Position alerts require a Long/Short drawing source.');
  else if (draft.kind === 'level-crossing') throw new Error('Fib level alerts require a Fib retracement drawing source.');
  else if (['inside', 'outside', 'entering', 'exiting'].includes(draft.kind)) { condition.lower = number(draft.lower, 'Lower channel'); condition.upper = number(draft.upper, 'Upper channel'); }
  else if (['moving-up', 'moving-down'].includes(draft.kind)) { condition.amount = number(draft.amount, 'Movement'); condition.bars = number(draft.bars, 'Bars'); condition.percent = draft.percent; }
  else condition.value = number(group?.members[0].kind === 'comparison' ? '0' : draft.value, 'Alert level');
  let expiresAt: number | null = null;
  if (draft.expirationEnabled) expiresAt=resolveAlertExpiry(draftExpiry(draft));
  const definition: AlertDefinition = { id: context.id, instrumentId: context.instrumentId, sourceId: context.sourceId ?? 'close', name: draft.name.trim(), message: draft.message, condition, frequency: context.position ? 'every-time' : draft.frequency, createdAt: context.now, expiresAt, mode: context.mode, runId: context.runId };
  if (context.observationBinding) {definition.observationBinding = structuredClone(context.observationBinding);if(context.observationBinding.schemaVersion===2)definition.conditionVersion=2;}
  if (group) {
    const rows = draft.conditions ?? [];
    if (rows.length !== group.members.length - 1) throw new Error('The added conditions changed. Review them before saving.');
    definition.conditions = [structuredClone(condition), ...rows.map((row, index) => buildGroupCondition(row, group.members[index + 1].kind === 'comparison', index + 2))];
  }
  if (draft.popup !== undefined || draft.desktop !== undefined || draft.sound !== undefined || draft.webhookEnabled) definition.delivery = createAlertDelivery(draft.popup ?? LV_DEFAULT_ALERT_DELIVERY.popup, draft.desktop ?? LV_DEFAULT_ALERT_DELIVERY.desktop, draft.sound ? draft.sound : null, draftWebhook(draft), draft.sound && draft.soundRepeat ? draft.soundRepeat : null);
  createLocalAlert(definition);
  return definition;
}
/** One added condition. A condition comparing two sources compares their difference with zero. */
function buildGroupCondition(row: AlertConditionDraft, comparison: boolean, position: number): AlertDefinition['condition'] {
  const label = `Condition ${position}`, condition: AlertDefinition['condition'] = { kind: row.kind };
  if (comparison && !['crossing', 'crossing-up', 'crossing-down', 'greater', 'less'].includes(row.kind)) throw new Error(`${label} compares two sources, so choose crossing, greater than or less than.`);
  if (['inside', 'outside', 'entering', 'exiting'].includes(row.kind)) { condition.lower = number(row.lower, `${label} lower channel`); condition.upper = number(row.upper, `${label} upper channel`); if (condition.lower > condition.upper) throw new Error(`${label} lower channel must not exceed its upper channel.`); }
  else if (['moving-up', 'moving-down'].includes(row.kind)) { condition.amount = number(row.amount, `${label} movement`); condition.bars = number(row.bars, `${label} bars`); condition.percent = row.percent; }
  else if (['crossing', 'crossing-up', 'crossing-down', 'greater', 'less'].includes(row.kind)) condition.value = comparison ? 0 : number(row.value, `${label} level`);
  else throw new Error(`${label} is not supported in an all-conditions alert.`);
  return condition;
}
/** Explicitly create a new session-bound definition. Retain the old record/history separately. */
export function rearmAlertForObservation(alert: LocalAlert, context: AlertObservationContext, now: number, id: string): LocalAlert {
  if (alert.definition.instrumentId !== context.instrumentId) throw new Error('Select the same instrument before rearming its alert.');
  const sourceId = alert.definition.sourceId === 'close' ? 'price:close' : alert.definition.sourceId;
  const oldSource=alert.definition.observationBinding?.source,newSource=context.binding.source;
  const legacyPrice=oldSource?.kind==='price'&&newSource.kind==='price'&&oldSource.field===newSource.field&&newSource.transformId==='standard'&&alert.definition.observationBinding?.schemaVersion===1;
  if (sourceId !== alertSourceId(newSource) || oldSource && !legacyPrice&&!sameAlertSource(oldSource,newSource)) throw new Error('The selected source has different settings or units in its captured definition. Select its saved frozen source or create a new alert.');
  if (id === alert.definition.id) throw new Error('Rearming requires a new alert identity.');
  if (alert.definition.expiresAt !== null && alert.definition.expiresAt <= now) throw new Error('The previous expiry has passed. Create a new alert with a future expiry.');
  return createLocalAlert({ ...structuredClone(alert.definition), id, createdAt: now, instrumentId: context.instrumentId, sourceId: context.sourceId, mode: context.mode, runId: context.runId, observationBinding: structuredClone(context.binding),...(context.binding.schemaVersion===2?{conditionVersion:2 as const}:{}) });
}
/** Pin definition revision; market observations may append history without invalidating a settings draft. */
export function assertAlertDraftCurrent(alerts:readonly LocalAlert[],id:string,revision:number):LocalAlert{const current=alerts.find(alert=>alert.definition.id===id);if(!current||current.revision!==revision)throw new Error('This alert was removed or its settings changed. Reopen the edit or confirmation.');return current;}
export function assertAlertContextCurrent(pinned:AlertObservationBinding|null|undefined,current:AlertObservationContext|null|undefined):void{if(!pinned||!current||!sameAlertBinding(pinned,current.binding))throw new Error('The source changed. Choose Use updated source, then save.');}
function draftFromAlert(alert: LocalAlert, now: number): AlertDraft {
  const definition = alert.definition, condition = definition.condition,expiry=expiryDraft(definition.expiresAt??now+86400);
  return { name: definition.name, message: definition.message, kind: condition.kind, value: String(condition.value ?? ''), lower: String(condition.lower ?? ''), upper: String(condition.upper ?? ''), amount: String(condition.amount ?? 1), bars: String(condition.bars ?? 1), percent: condition.percent ?? false, frequency: definition.frequency, expirationEnabled: definition.expiresAt !== null, expiresAt:expiry.value,expiry, ...deliveryDraft(alertDeliveryFor(definition)), ...(definition.conditions ? { conditions: definition.conditions.slice(1).map(row => ({ kind: row.kind, value: String(row.value ?? ''), lower: String(row.lower ?? ''), upper: String(row.upper ?? ''), amount: String(row.amount ?? 1), bars: String(row.bars ?? 1), percent: row.percent ?? false })) } : {}) };
}
/** The draft's webhook URL, or null when Webhook URL is off; an empty URL with the option on is refused. */
function draftWebhook(draft: AlertDraft): string | null { if (!draft.webhookEnabled) return null; const url = (draft.webhook ?? '').trim(); if (!url) throw new Error('Enter a webhook URL, or turn Webhook URL off.'); return url; }
function deliveryDraft(delivery: ReturnType<typeof alertDeliveryFor>): Pick<AlertDraft, 'popup' | 'desktop' | 'sound' | 'soundRepeat' | 'webhookEnabled' | 'webhook'> { return { popup: delivery.popup, desktop: delivery.desktop, sound: delivery.sound ?? '', soundRepeat: delivery.soundRepeat ?? 0, ...(delivery.webhook ? { webhookEnabled: true, webhook: delivery.webhook } : {}) }; }

/** The qualified-source note names the period of a 1D, 1W or 1M New York regular-session source. */
export function qualifiedSourceNote(source:AlertSourceSnapshot):string{
 const interval=hasNyseAlertCalculation(source)?source.calculation.interval:'1D',word=interval==='1W'?'weekly':interval==='1M'?'monthly':'daily',period=interval==='1W'?'the week':interval==='1M'?'the month':'the daily session';
 return `This frozen source uses New York regular-session ${word} prices. Once per bar refers to ${period}. Once per bar close waits for a genuine observed close of ${period}; developing values do not advance its completed-bar baseline. Source values can be revised. Compare with a constant value.`;
}
const ALERT_CONDITION_KINDS:readonly (readonly [AlertConditionKind,string])[]=[['crossing','Crossing'],['crossing-up','Crossing up'],['crossing-down','Crossing down'],['greater','Greater than'],['less','Less than'],['inside','Inside channel'],['outside','Outside channel'],['entering','Entering channel'],['exiting','Exiting channel'],['moving-up','Moving up'],['moving-down','Moving down']];
const plainError=(error:unknown):string=>(error instanceof Error?error.message:String(error)).replace(/^(?:[A-Za-z]*Error):\s*/,'');
/** The observer tags each source diagnostic with its internal source kind ("comparison: ..."); the dialog shows
 * the sentence only. Indicator tags (the indicator id) are kept, since they name which indicator spoke. */
export const alertDiagnosticText=(message:string):string=>message.replace(/^(?:comparison|all|price|drawing-boundary|drawing|script|position|levels|tpo):\s+/,'');
/** The plain line shown when the chart has no source an alert can read (replaces internal source errors such as
 * "The chart trading session request proof does not match its source basis."). */
export const ALERT_NO_SOURCE_TEXT='Alerts need live data for this symbol. Set up a data source to use alerts here.';
/** The plain line for a developer-worded failure while other sources are still offered. */
export const ALERT_SOURCE_FAILED_TEXT='This source could not be read for alerts. Choose another source.';
/** True for a source failure worded for developers (proof, basis, identity...), which a user cannot act on. */
export const alertTechnicalDiagnostic=(message:string):boolean=>/\b(?:proof|basis|identity|tuple|request source|information prefix|inspection|committed|controller|lineage|immutable|catalog|native input|schema|binding|invariant|undefined|null|NaN|transform|snapshot|is not a function|Cannot read propert(?:y|ies))\b/i.test(message);
/** The plain line while the chart is still loading or switching (the capture waits for the chart). */
export const ALERT_WAIT_TEXT='The chart is still loading. Alerts are ready in a moment.';
/** Internal "waiting" lines (the chart has not caught up with its input yet). Shown as ALERT_WAIT_TEXT. */
export const alertWaitDiagnostic=(message:string):boolean=>/information prefix is changing|has not committed this exact information prefix|not ready for technical alert capture|paused until a fresh workspace observation|Local source observation is not enabled/i.test(message);
/** Other internal lines with a fixed plain wording. */
const PLAIN_DIAGNOSTICS:readonly (readonly [RegExp,string])[]=[[/saved alerts are inactive, paused, or bound to a retired source/i,'Some saved alerts are paused or no longer match this chart.']];
/** The diagnostics line a user reads. Developer wording becomes ALERT_NO_SOURCE_TEXT (once); the rest is unchanged.
 *  Waiting lines read ALERT_WAIT_TEXT (once, and not the no-source line, since the source is only loading), and a
 *  wider set of developer words (inspection, committed, information prefix, snapshot...) is caught. */
export function alertDiagnosticsLine(diagnostics:readonly string[],noSource:boolean):string{
 const out:string[]=[];let plain=false,wait=false;
 for(const message of diagnostics){
  if(alertWaitDiagnostic(message)){if(!wait)out.push(ALERT_WAIT_TEXT);wait=true;continue;}
  const fixed=PLAIN_DIAGNOSTICS.find(([pattern])=>pattern.test(message));if(fixed){if(!out.includes(fixed[1]))out.push(fixed[1]);continue;}
  if(alertTechnicalDiagnostic(message)){plain=true;continue;}out.push(alertDiagnosticText(message));
 }
 if(noSource&&!wait&&(plain||!out.length))out.unshift(ALERT_NO_SOURCE_TEXT);else if(plain)out.unshift(ALERT_SOURCE_FAILED_TEXT);
 return out.join(' ');
}
const CONDITION_LABELS:Record<string,string>={crossing:'crossing','crossing-up':'crossing up','crossing-down':'crossing down',greater:'greater than',less:'less than',inside:'inside channel',outside:'outside channel',entering:'entering channel',exiting:'exiting channel','moving-up':'moving up','moving-down':'moving down',position:'position','level-crossing':'active level crossing'};
const FREQUENCY_LABELS:Record<string,string>={'only-once':'Only once','once-per-bar':'Once per bar','once-per-bar-close':'Once per bar close','once-per-minute':'Once per minute','every-time':'Every time'};
const STATUS_LABELS:Record<string,string>={active:'Active',paused:'Paused',stopped:'Stopped',expired:'Expired','waiting-for-data':'Waiting for data',triggered:'Triggered'};
const srOnly:React.CSSProperties={position:'absolute',width:1,height:1,overflow:'hidden',clip:'rect(0 0 0 0)',whiteSpace:'nowrap'};
/** One condition of an all-conditions alert in the list ("RSI / RSI crossing up 30", "Close crossing EMA / EMA"). */
function groupConditionText(source:AlertSourceSnapshot,c:AlertDefinition['condition']):string{
 const kind=CONDITION_LABELS[c.kind]??c.kind;
 if(source.kind==='comparison')return `${technicalSourceLabel(source.left)} ${kind} ${technicalSourceLabel(source.right)}`;
 return `${technicalSourceLabel(source)} ${kind} ${c.value??(c.lower!==undefined?`${c.lower} to ${c.upper}`:`${c.amount}${c.percent?'%':''} in ${c.bars} bars`)}`;
}
function alertRowSummary(alert:LocalAlert,instrument:Instrument,sourceChoices?:readonly AlertSourceChoice[]):string{
 const d=alert.definition,c=d.condition,symbol=d.instrumentId===instrument.id?instrument.symbol:d.instrumentId;
 const group=d.observationBinding?.source.kind==='all'?d.observationBinding.source:null;
 if(group&&d.conditions?.length===group.members.length)return `${symbol}, ${group.members.map((member,index)=>groupConditionText(member,d.conditions![index])).join(' and ')}, ${FREQUENCY_LABELS[d.frequency]??d.frequency}`;
 const sid=d.sourceId,source=sid==='close'||sid.startsWith('price:')?'Price':sourceChoices?.find(choice=>choice.id===sid)?.label??'Custom source';
 // A drawing alert says the drawing it watches ("Crossing up Trend line"), even after the drawing is gone.
 const drawing=c.kind!=='position'&&c.kind!=='level-crossing'?drawingConditionText(d.observationBinding?.source,c):null;
 if(drawing)return `${symbol}, ${drawing}, ${FREQUENCY_LABELS[d.frequency]??d.frequency}`;
 const detail=c.kind==='position'&&c.position?describePosition(c.position):c.kind==='level-crossing'?`active level crossing ${c.levels?.levels.length??0} levels`:`${CONDITION_LABELS[c.kind]??c.kind} ${c.value??(c.lower!==undefined?`${c.lower} to ${c.upper}`:`${c.amount}${c.percent?'%':''} in ${c.bars} bars`)}`;
 return `${symbol}, ${c.kind==='position'?detail:`${source} ${detail}`}, ${FREQUENCY_LABELS[d.frequency]??d.frequency}`;
}
const selectedActionLabel=(action:AlertBatchAction)=>action==='pause'?'Pause selected':action==='resume'?'Resume selected':action==='clone'?'Clone selected':'Delete selected';
/** Keep mounted when closed if event is supplied. This is local processing, with no external delivery. */
interface DeleteConfirmation {kind:'row';id:string;revision:number;view:object;identity:object;}
interface BatchAuthority { publisher:AlertDialogProps['onAlertsChange']; observe:AlertDialogProps['onRequestObservation']; readTime:()=>number; token:object|undefined; assert:ManagerActionAuthority['assertCurrent']|undefined; source:string; selected:string|undefined; target:string|undefined; instrumentId:string; }
interface BatchConfirmation { kind:'batch'; view:AlertListView; selection:AlertSelectionState; opening:object; interaction:number; authority:BatchAuthority; plan:AlertBatchPlan; names:readonly string[]; trigger:HTMLElement|null; identity:object; }
type AlertConfirmation=DeleteConfirmation|BatchConfirmation;
interface BatchReceipt { owner:BatchConfirmation; base:LocalAlert[]; candidate:LocalAlert[]; epoch:number; interaction:number; from:Element|null; outcome:'pending'|'accepted'|'rejected'|'indeterminate'; candidateObserved:boolean; followUpConsumed:boolean; awaitingFocus:boolean; }
const localAlertActionTime=()=>Math.floor(Date.now()/1000);
function sameBatchAuthority(a:BatchAuthority,b:BatchAuthority):boolean { return a.publisher===b.publisher&&a.observe===b.observe&&a.readTime===b.readTime&&a.token===b.token&&a.assert===b.assert&&a.source===b.source&&a.selected===b.selected&&a.target===b.target&&a.instrumentId===b.instrumentId; }
type AlertPublicationReceipt={kind:'accepted'}|{kind:'rejected'}|{kind:'indeterminate';error:unknown};
function recordAlertPublication(publisher:AlertDialogProps['onAlertsChange'],next:LocalAlert[],base:LocalAlert[]):AlertPublicationReceipt {
 try { const result:unknown=publisher(next,base); return result===false?{kind:'rejected'}:result===true||result===undefined?{kind:'accepted'}:{kind:'indeterminate',error:new Error('The publisher did not return a synchronous acknowledgement.')}; }
 catch(error){return{kind:'indeterminate',error};}
}
interface RowBinding {node:HTMLElement;identity:object;id:string;view:AlertListView;}
interface SelectionPointer {view:AlertListView;state:AlertSelectionState;opening:object;interaction:number;binding:RowBinding;pointerId:number;button:number;shift:boolean;ctrl:boolean;meta:boolean;fallbackId?:string;released:boolean;focusPending:boolean;}
interface SelectionFocus {view:AlertListView;state:AlertSelectionState;opening:object;interaction:number;origin:RowBinding;target:RowBinding;}
interface PlainSelectionFocus {view:AlertListView;state:AlertSelectionState;opening:object;interaction:number;node:HTMLElement;}
interface MenuBase {row:LocalAlert;view:object;status:LocalAlert['status'];trigger:HTMLElement|null;}
interface SingleAlertMenu extends MenuBase {kind:'row';}
interface SelectedAlertMenu extends MenuBase {kind:'selection';blockingDelete:DeleteConfirmation|null;list:AlertListView;selection:AlertSelectionState;opening:object;interaction:number;authority:BatchAuthority;targets:readonly {id:string;revision:number;status:LocalAlert['status']}[];origin:{node:HTMLElement;identity:object;key:string};}
type AlertRowMenu=SingleAlertMenu|SelectedAlertMenu;
type RowFocusRequest={kind:'batch';owner:BatchConfirmation;from:Element|null}|{kind:'batch-result';receipt:BatchReceipt}|{kind:'menu';owner:AlertRowMenu}|{kind:'edit';id:string;generation:number;from:Element|null}|{kind:'delete';owner:DeleteConfirmation;from:Element|null}|{kind:'deleted';opening:object;from:Element|null}|{kind:'create-cancelled';from:Element|null}|{kind:'return';view:object;trigger:HTMLElement|null;from:Element|null;selection?:{view:AlertListView;state:AlertSelectionState;opening:object;interaction:number}};
const rowInteractive='button,a,input,select,textarea,label,summary,[contenteditable]:not([contenteditable="false"]),[role="menu"],[role="menuitem"],[role="alertdialog"]';
function rowBackground(event:{target:EventTarget|null;currentTarget:EventTarget|null}):boolean{
 const target=event.target as Element|null;return !target?.closest?.(rowInteractive);
}

export function AlertDialog({ readActionTime=localAlertActionTime,managerActionAuthority,open, invalidDrawings, onClose, alerts, onAlertsChange, instrument, now, event,events, externallyProcessed=false,context,contexts, diagnostics = [], onRequestObservation, priceSource = 'close', onPriceSourceChange, replayAssumeCompletion = false, onReplayAssumeCompletionChange,sourceChoices,selectedSourceId,targetSourceId='constant',onSourceChange,onTargetChange,sourceSelectionKey='',evaluationPending=false,validateCurrentSource,contextRequest=null,readLastPrice,assertContextCurrent,onContextComplete,soundPlayer,webhookPort,deliveryHost,compound,createRequest=null,onSaved,onDraftDiscarded,conditionSelections,onConditionSelectionsChange }: AlertDialogProps) {
  const clock=systemAlertClock();
  /** The last Send test result line, shown under the webhook URL. */
  const [webhookTest,setWebhookTest]=useState<{text:string;pending:boolean;failed?:boolean}|null>(null);
  const [tab, setTabState] = useState('Alerts'), [draft, setDraftState] = useState<AlertDraft>(() => initialDraft(instrument, now, event?.value ?? null)), [editing, setEditing] = useState<string | null>(null), [message, setMessageState] = useState(''), [deleting, setDeleting] = useState<AlertConfirmation|null>(null);
  const confirmation=useRef<AlertConfirmation|null>(null),menuOwner=useRef<AlertRowMenu|null>(null),[rowMenu,setRowMenu]=useState<AlertRowMenu|null>(null);
  const [historySelectionState,setHistorySelectionState]=useState<AlertHistorySelection>(EMPTY_ALERT_HISTORY_SELECTION);
  const confirmationEpoch=useRef(0),menuEpoch=useRef(0);
  const pointerSelection=useRef<SelectionPointer|null>(null),rangeFocus=useRef<SelectionFocus|null>(null),plainFocus=useRef<PlainSelectionFocus|null>(null);
  const rowBindings=useRef(new WeakMap<HTMLElement,RowBinding>()),controlBindings=useRef(new WeakMap<HTMLElement,{key:string;identity:object}>());
  const clearGestures=()=>{pointerSelection.current=null;rangeFocus.current=null;plainFocus.current=null;};
  const selectionRef=useRef<AlertSelectionState|null>(null),interactionEpoch=useRef(0),batchReceipt=useRef<BatchReceipt|null>(null),batchDispatch=useRef<BatchConfirmation|null>(null);
  const batchPreparation=useRef<object|null>(null);
  const [,notifySelection]=useState(0);
  const batchNotice=useRef('');
  const releaseBatchReceipt=(receipt:BatchReceipt)=>{if(batchReceipt.current===receipt&&receipt.outcome==='accepted'&&receipt.candidateObserved&&receipt.followUpConsumed&&!receipt.awaitingFocus)batchReceipt.current=null;};
  const selectionControls=useRef(new Map<string,{node:HTMLElement;registration:object;identity:object}>());
  const currentBatchAuthority:BatchAuthority={publisher:onAlertsChange,observe:onRequestObservation,readTime:readActionTime,token:managerActionAuthority?.token,assert:managerActionAuthority?.assertCurrent,source:sourceSelectionKey,selected:selectedSourceId,target:targetSourceId,instrumentId:instrument.id};
  const latestBatchAuthority=useRef(currentBatchAuthority),priorBatchAuthority=useRef<BatchAuthority|null>(null);latestBatchAuthority.current=currentBatchAuthority;
  const retireSelection=()=>{clearGestures();batchPreparation.current=null;selectionRef.current=null;interactionEpoch.current++;batchReceipt.current=null;batchNotice.current='';if(confirmation.current?.kind==='batch'){confirmation.current=null;confirmationEpoch.current++;}};
  const managerNavigation=useRef<AlertListView|null>(null),historyNavigation=useRef<AlertListView|null>(null);
  const navigationOpening=useRef({open,tab,contextRequest,token:{}});
  const focusedListRow=useRef<{kind:'Alerts'|'History';id:string;node:HTMLElement;opening:object}|null>(null);
  const listFallback=useRef<{kind:'Alerts'|'History';view:AlertListView;node:HTMLElement;opening:object}|null>(null);
  const retireListNavigation=()=>{retireSelection();navigationOpening.current.token={};focusedListRow.current=null;listFallback.current=null;managerNavigation.current=null;historyNavigation.current=null;};
  if(navigationOpening.current.open!==open||navigationOpening.current.tab!==tab||navigationOpening.current.contextRequest!==contextRequest){navigationOpening.current={open,tab,contextRequest,token:{}};focusedListRow.current=null;listFallback.current=null;}
  const menuElement=useRef<{owner:AlertRowMenu;node:HTMLDivElement;registration:object}|null>(null),confirmationElement=useRef<{owner:AlertConfirmation;node:HTMLDivElement}|null>(null),pendingFocus=useRef<RowFocusRequest|null>(null);
  const menuRef=(owner:AlertRowMenu)=>{const registration={};return(node:HTMLDivElement|null)=>{if(node&&menuOwner.current===owner)menuElement.current={owner,node,registration};else if(!node&&menuElement.current?.owner===owner&&menuElement.current.registration===registration)menuElement.current=null;};};
  const clearConfirmation=()=>{clearGestures();batchPreparation.current=null;confirmationEpoch.current++;confirmation.current=null;setDeleting(null);};
  const clearMenu=()=>{clearGestures();batchPreparation.current=null;menuEpoch.current++;menuOwner.current=null;pendingFocus.current=null;setRowMenu(null);};
  const [managerFilter,setManagerFilter]=useState<AlertManagerFilter>(()=>({...DEFAULT_ALERT_MANAGER_FILTER}));
  const [managerSort,setManagerSort]=useState<AlertManagerSort>(()=>({...DEFAULT_ALERT_MANAGER_SORT}));
  const searchInput=useRef<HTMLInputElement>(null),historyTab=useRef<HTMLButtonElement>(null);
  const [historyExport,setHistoryExport]=useState<object|null>(null);
  const exportInFlight=useRef<object|null>(null);
  const historyOpening=useRef({open,tab,contextRequest,token:{}});
  if(historyOpening.current.open!==open||historyOpening.current.tab!==tab||historyOpening.current.contextRequest!==contextRequest){historyOpening.current={open,tab,contextRequest,token:{}};exportInFlight.current=null;}
  const historyToken=historyOpening.current.token;
  const managerView=useRef({open,tab,contextRequest,filter:managerFilter,sort:managerSort,membership:'',token:{}});
  const setTab=(next:string)=>{clearMenu();clearConfirmation();retireListNavigation();managerView.current.token={};historyOpening.current.token={};exportInFlight.current=null;setHistoryExport(null);setHistorySelectionState(EMPTY_ALERT_HISTORY_SELECTION);setTabState(next);/* The view token was replaced above; re-render even when the tab is unchanged so the visible row controls carry it (a same-tab click otherwise left them stale). */notifySelection(value=>value+1);};
  let matchingAlerts:readonly LocalAlert[]=[],filterError='',sortError='';
  try{matchingAlerts=filterAlertManagerAlerts(alerts,managerFilter);}catch(error){filterError=error instanceof Error?error.message:String(error);}
  if(!filterError)try{matchingAlerts=sortAlertManagerAlerts(matchingAlerts,managerSort);}catch(error){matchingAlerts=[];sortError=error instanceof Error?error.message:String(error);}
  const membership=JSON.stringify(matchingAlerts.map(row=>[row.definition.id,row.revision]));
  const openingChanged=managerView.current.open!==open||managerView.current.contextRequest!==contextRequest;
  if(openingChanged){clearGestures();confirmationEpoch.current++;confirmation.current=null;menuEpoch.current++;menuOwner.current=null;pendingFocus.current=null;}
  if(openingChanged||managerView.current.tab!==tab||managerView.current.filter!==managerFilter||managerView.current.sort!==managerSort||managerView.current.membership!==membership){managerView.current={open,tab,contextRequest,filter:managerFilter,sort:managerSort,membership,token:{}};}
  const viewToken=managerView.current.token;
  const observedMenu=menuOwner.current;
  if(observedMenu){const current=alerts.find(row=>row.definition.id===observedMenu.row.definition.id);if(!open||contextRequest||tab!=='Alerts'||observedMenu.view!==viewToken||!current||current.revision!==observedMenu.row.revision||current.status!==observedMenu.status){
    if(open&&!contextRequest&&tab==='Alerts'&&menuElement.current?.owner===observedMenu&&menuElement.current.node.contains(document.activeElement))pendingFocus.current={kind:'return',view:viewToken,trigger:current?.revision===observedMenu.row.revision&&current.status===observedMenu.status&&matchingAlerts.some(row=>row.definition.id===current.definition.id)?observedMenu.trigger:null,from:document.activeElement};
    clearGestures();menuEpoch.current++;menuOwner.current=null;
  }}
  let visibleMenu=rowMenu&&menuOwner.current===rowMenu?rowMenu:null;
  const visibleConfirmation=deleting?.kind==='row'&&confirmation.current===deleting?deleting:null;
  const editRevision=useRef<number|null>(null),pinnedContext=useRef<AlertObservationBinding|null>(null),captureRequested=useRef(false),reseedSource=useRef<AlertSourceSnapshot|null>(null);
  const dialog = useRef<HTMLDivElement>(null), previousFocus = useRef<HTMLElement | null>(null);
  const latest = useRef({ alerts, now,open,contextRequest,assertContextCurrent,onContextComplete,instrument,draft,editing,tab,clock }); latest.current = { alerts, now,open,contextRequest,assertContextCurrent,onContextComplete,instrument,draft,editing,tab,clock };
  const draftGeneration=useRef(0),renderDraftGeneration=draftGeneration.current;
  const setDraft=(value:React.SetStateAction<AlertDraft>)=>{draftGeneration.current++;setDraftState(value);};
  const mounted=useRef(true),closed=useRef(false),seeded=useRef<ContextPriceRequest|null>(null),dirty=useRef(false),rawCapture=useRef(false);
  const active=()=>mounted.current&&!closed.current&&latest.current.open&&latest.current.contextRequest===contextRequest;
  const setMessage=(value:string)=>{if(active())setMessageState(value);};
  const manual=()=>{if(!active())throw new Error('This alert editor was closed or replaced.');if(contextRequest){assertContextPriceRequest(latest.current,contextRequest,'price-alert',latest.current.instrument);if(seeded.current!==contextRequest)throw new Error('The clicked-price draft is not ready. Reopen its chart menu.');}};
  const perform=(operation:()=>void)=>{try{manual();operation();}catch(error){setMessage(plainError(error));}};
  const finish=(outcome:ContextPriceOutcome)=>{if(!active())return;clearMenu();clearConfirmation();retireListNavigation();closed.current=true;if(contextRequest)onContextComplete?.(contextRequest,outcome);else onClose();};
  const publish=(next:LocalAlert[],base:LocalAlert[])=>{manual();const accepted=onAlertsChange(next,base);if(contextRequest){try{assertContextPriceRequest(latest.current,contextRequest,'price-alert',latest.current.instrument);}catch{closed.current=true;throw new Error('The alert editor closed while saving.');}}if(!active())throw new Error('The alert editor closed while saving.');if(accepted===false)throw new Error('The alert change was rejected. Saved alerts and this draft were retained. Review the workspace message before retrying.');};
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;menuEpoch.current++;menuOwner.current=null;confirmationEpoch.current++;confirmation.current=null;pendingFocus.current=null;retireListNavigation();};},[]);
  useEffect(()=>{if(open)closed.current=false;},[open]);
  useEffect(()=>{
    if(!open||!contextRequest||seeded.current===contextRequest||!mounted.current)return;
    try{if(dirty.current||editing)throw new Error('An unsaved alert draft is open. Cancel it before opening another clicked-price request.');assertContextPriceRequest(latest.current,contextRequest,'price-alert',instrument,'seed');
      seeded.current=contextRequest;rawCapture.current=true;pinnedContext.current=null;captureRequested.current=true;editRevision.current=null;setEditing(null);setDeleting(null);setDraft({...initialDraft(instrument,now,contextRequest.price),value:contextRequest.priceText,lower:contextRequest.priceText,upper:contextRequest.priceText,kind:'crossing'});setTab('Create');setMessage('Clicked price captured exactly. Crossing, Only once and no expiry are local defaults.');
    }catch(error){setMessage(plainError(error));}
  },[contextRequest,open]);
  useEffect(() => {
    if(externallyProcessed)return;
    const result=processLocalAlertBatch(alerts,events??(event?[event]:[]),now);
    if(result.alerts!==alerts&&onAlertsChange(result.alerts,alerts)===false){setMessage('The alert observation could not be saved. Its existing state and history were retained.');return;}
    const failures=result.diagnostics.filter(item=>item.includes('limit')||item.includes('publication'));
    if(failures.length)setMessage(failures.join(' '));
  }, [event,events, alerts, onAlertsChange, now,externallyProcessed]);
  useEffect(() => { if (!open) return; previousFocus.current = document.activeElement as HTMLElement | null; dialog.current?.querySelector<HTMLButtonElement>('button')?.focus(); return () => previousFocus.current?.focus(); }, [open]);
  // A focused control that is removed or disabled (Escape clearing a selection,
  // a preview closing) hands focus to a neighbor or this dialog instead of the body, so the next Escape still arrives.
  useDialogFocusRetention(dialog, open);
  useEffect(()=>{if(!open){requestedFlow.current=false;setEditing(null);setDeleting(null);setTab('Alerts');setManagerFilter({...DEFAULT_ALERT_MANAGER_FILTER});setManagerSort({...DEFAULT_ALERT_MANAGER_SORT});pinnedContext.current=null;captureRequested.current=false;seeded.current=null;dirty.current=false;}},[open]);
  useEffect(() => { if (!editing&&!contextRequest) setDraft(initialDraft(instrument, now, event?.value ?? priceFallback())); }, [instrument.id]);
  const set = <K extends keyof AlertDraft>(key: K, value: AlertDraft[K]) => {try{manual();
    if((key==='expiresAt'||key==='expiry')&&(latest.current.clock.zone!==clock.zone||latest.current.draft!==draft||draftGeneration.current!==renderDraftGeneration))throw Error('The alert draft or timezone changed. Review the current expiration field.');
    dirty.current=true;setDraft(current =>key==='expiresAt'?{...current,expiresAt:String(value),expiry:editAlertExpiry(draftExpiry(current),clock.zone,String(value))}:({ ...current, [key]: value }));
  }catch(error){setMessage(plainError(error));}};
  const previewSound=()=>perform(()=>{const id=latest.current.draft.sound;if(!id)return;(soundPlayer??sharedAlertSoundPlayer()).play(id).then(()=>setMessage('Played the selected local alert sound once.'),error=>setMessage(`Sound preview failed: ${error instanceof Error?error.message:String(error)}`));});
  const sendWebhookTest=()=>{const current=latest.current.draft,url=(current.webhook??'').trim();setWebhookTest({text:'Sending test...',pending:true});
    const port=webhookPort===undefined?defaultAlertWebhookPort((globalThis as unknown as {lv?:AlertWebhookBridge}).lv):webhookPort;
    void sendAlertWebhookTest(port,url,current.message).then(result=>setWebhookTest({text:result.text,pending:false,failed:!result.delivered}));};
  // With no observed value, a price source starts at the chart's last close, as the other sessions and intervals do.
  const priceFallback=():number|null=>{const choice=selectedSourceId?sourceChoices?.find(row=>row.id===selectedSourceId):undefined,source=context?.binding.source??choice?.source;if(source&&source.kind!=='price')return null;if(choice&&(choice.drawingShape||choice.position||choice.levels||choice.scriptSignal||choice.constantOnly))return null;const lastPrice=readLastPrice?.()??null;return typeof lastPrice==='number'&&Number.isFinite(lastPrice)?Number(reseedLevelText(lastPrice,instrument.tickSize,true)):null;};
  const createNew = () => {try{manual();if(conditionSelections?.length){captureRequested.current=true;onConditionSelectionsChange?.([]);}setEditing(null);editRevision.current=null;pinnedContext.current=context?structuredClone(context.binding):null;captureRequested.current=!context;setDraft(contextRequest?{...initialDraft(instrument,now,contextRequest.price),value:contextRequest.priceText,kind:'crossing'}:initialDraft(instrument, now, context?.binding.source.kind==='comparison'?0:event?.value ?? priceFallback()));dirty.current=false; setTab('Create'); setMessage('');}catch(error){setMessage(plainError(error));}};
  const handledCreate=useRef<object|null>(null),requestedFlow=useRef(false);
  useEffect(()=>{if(!open||!createRequest||contextRequest||handledCreate.current===createRequest)return;handledCreate.current=createRequest;requestedFlow.current=true;if(dirty.current||editing){setMessage('An unsaved alert draft is open. Finish or cancel it before starting another alert.');setTabState('Create');return;}if(createRequest.editId){const found=alerts.find(row=>row.definition.id===createRequest.editId);if(found){manual();clearMenu();dirty.current=true;setEditing(found.definition.id);editRevision.current=found.revision;setDraft(draftFromAlert(found,latest.current.now));setTab('Create');setMessage('');}return;}createNew();if(createRequest.sourceId&&createRequest.sourceId!==selectedSourceId){pinnedContext.current=null;captureRequested.current=true;rawCapture.current=false;}
   // A create that arrives with a value source already chosen (Object tree, Add alert on RSI) seeds the level from that
   // source's latest value once it is observed, as a source change does; it used to keep the price (22.22 on an RSI at 38.83).
   const requested=createRequest.sourceId?sourceChoices?.find(choice=>choice.id===createRequest.sourceId):undefined;
   reseedSource.current=requested?.source&&requested.source.kind!=='price'&&!requested.scriptSignal&&!requested.drawingShape&&!requested.position&&!requested.levels&&!requested.constantOnly&&!drawingSourceShape(requested.source)&&(targetSourceId??'constant')==='constant'?requested.source:null;},[open,createRequest]);
  useEffect(()=>{if(captureRequested.current&&context&&!evaluationPending&&active()){if(rawCapture.current&&(context.binding.schemaVersion!==2||context.binding.chartId!==contextRequest?.chartId||context.binding.source.kind!=='price'||context.binding.source.field!=='close'||context.binding.source.transformId!=='standard'))return;pinnedContext.current=structuredClone(context.binding);captureRequested.current=false;rawCapture.current=false;}const reseed=reseedSource.current;if(reseed&&context&&!evaluationPending&&active()){let same=false;try{same=technicalSourceKey(reseed)===technicalSourceKey(context.binding.source);}catch{same=false;}if(same){reseedSource.current=null;const value=event?.value;if(typeof value==='number'&&Number.isFinite(value)){const text=reseedLevelText(value,instrument.tickSize,reseed.kind==='price');setDraft(current=>['crossing','crossing-up','crossing-down','greater','less'].includes(current.kind)?{...current,value:text}:current);}}}},[context,event,evaluationPending,sourceSelectionKey,contextRequest]);
  // A create started on an indicator (Object tree, Add alert on RSI) arrives with that source already selected, so no
  // source change renamed the fresh "GME price alert" default; a still-default price name follows the selected indicator ("GME RSI alert").
  const selectedChoiceLabel=sourceChoices?.find(choice=>choice.id===selectedSourceId)?.label;
  // No choice an alert can read (the chart's source failed, or none is set up) shows one plain line instead of developer text.
  const noUsableSource=!!sourceChoices&&!sourceChoices.some(choice=>!choice.targetOnly&&!!choice.source&&!choice.disabledReason);
  // When the selected source is not offered but a usable one is, pick it (price first) instead of showing an empty Source.
  // A create that names its source (Object tree, Add alert on RSI) is left alone until its source arrives.
  useEffect(()=>{if(!open||editing||!sourceChoices||!onSourceChange||noUsableSource)return;if(sourceChoices.some(choice=>choice.id===selectedSourceId))return;if(createRequest?.sourceId&&createRequest.sourceId===selectedSourceId)return;
   const usable=sourceChoices.filter(choice=>!choice.targetOnly&&!!choice.source&&!choice.disabledReason),pick=usable.find(choice=>choice.source?.kind==='price')??usable[0];if(pick)onSourceChange(pick.id);},[open,editing,sourceChoices,selectedSourceId,noUsableSource]);
  useEffect(()=>{if(!open||editing)return;const choice=sourceChoices?.find(row=>row.id===selectedSourceId);if(!choice||!choice.id.startsWith('indicator:')||!choice.source)return;const current=latest.current.draft;if(renameDefaultDraft(current,instrument.symbol,undefined,choice)!==current)setDraft(draft=>renameDefaultDraft(draft,instrument.symbol,undefined,choice));},[open,editing,selectedSourceId,selectedChoiceLabel,instrument.symbol]);
  // The rename above goes through an updater; it used to set the render-time draft, which overwrote the level the reseed
  // effect had just set in the same commit (an Object tree RSI alert kept 22.22, the price, instead of 38.83).
  const changeSource=(id:string,target=false)=>{try{manual();retireSelection();dirty.current=true;rawCapture.current=false;captureRequested.current=true;pinnedContext.current=null;if(target)onTargetChange?.(id);else{onSourceChange?.(id);const picked=sourceChoices?.find(choice=>choice.id===id);if((picked?.position||picked?.levels||picked?.constantOnly)&&targetSourceId!=='constant')onTargetChange?.('constant');}const signal=!target&&sourceChoices?.find(choice=>choice.id===id)?.scriptSignal===true,fills=signal&&sourceChoices?.find(choice=>choice.id===id)?.strategyFill===true;if(signal&&targetSourceId!=='constant')onTargetChange?.('constant');const pickedChoice=target?undefined:sourceChoices?.find(choice=>choice.id===id),previousChoice=target?undefined:sourceChoices?.find(choice=>choice.id===selectedSourceId);
   // A plain value source (price or indicator, compared with a constant) reseeds the level from its current value once observed.
   reseedSource.current=!target&&!signal&&pickedChoice?.source&&!pickedChoice.drawingShape&&!pickedChoice.position&&!pickedChoice.levels&&!pickedChoice.constantOnly&&!drawingSourceShape(pickedChoice.source)&&targetSourceId==='constant'?pickedChoice.source:null;
   if(active())setDraft(current=>signal?{...current,kind:'greater',value:'0',...(fills?{frequency:'once-per-bar' as AlertFrequency}:{})}:target?drawingAlertDraft({...current,value:id!=='constant'?'0':current.value,kind:['crossing','crossing-up','crossing-down','greater','less'].includes(current.kind)||pickedChoice?.drawingShape==='channel'?current.kind:'crossing'},{shape:pickedChoice?.drawingShape??drawingSourceShape(pickedChoice?.source),symbol:instrument.symbol,name:drawingSourceName(pickedChoice?.source),previousName:drawingSourceName(previousChoice?.source)}):renameDefaultDraft(drawingAlertDraft(renameDefaultDraft({...current,kind:['crossing','crossing-up','crossing-down','greater','less'].includes(current.kind)||pickedChoice?.drawingShape==='channel'?current.kind:'crossing'},instrument.symbol,previousChoice,undefined),{shape:pickedChoice?.drawingShape??drawingSourceShape(pickedChoice?.source),symbol:instrument.symbol,name:drawingSourceName(pickedChoice?.source),previousName:drawingSourceName(previousChoice?.source)}),instrument.symbol,undefined,pickedChoice));}catch(error){setMessage(plainError(error));}};
  const save = () => {
    try {
      manual();
      if(draftGeneration.current!==renderDraftGeneration||latest.current.draft!==draft||latest.current.editing!==editing||latest.current.tab!=='Create')throw new Error('This alert draft changed. Review the current fields before saving.');
      const current = editing ? assertAlertDraftCurrent(latest.current.alerts,editing,editRevision.current!) : undefined;
      if (editing && !current) throw new Error('This alert was removed. Create a new alert.');
      if (!current && !context && !event) throw new Error('This chart has no eligible local alert source. Import a valid source or load example data first.');
      if(contextRequest&&(!context||context.binding.schemaVersion!==2||context.binding.chartId!==contextRequest.chartId||context.instrumentId!==contextRequest.instrument.id||context.binding.replayRunId!==(contextRequest.executionIdentity==='ordinary'?null:contextRequest.executionIdentity)))throw new Error('The clicked chart source context is not ready or changed.');
      if(!current&&context?.binding.schemaVersion===2){assertAlertContextCurrent(pinnedContext.current,context);validateCurrentSource?.(context.binding);}
      if(evaluationPending)throw new Error('Wait for the current source observation before saving.');
      const source=current?.definition.observationBinding?.source??context?.binding.source;
      // A channel's bounds are its own lines (0 and 1); a vertical line fires at its time (0).
      const savingShape=drawingSourceShape(source),savingDraft=source?.kind==='comparison'||source?.kind==='all'&&source.members[0].kind==='comparison'||savingShape==='time'?{...draft,value:'0'}:savingShape==='channel'?{...draft,lower:'0',upper:'1'}:draft;
      const definition = buildAlertDefinition(savingDraft, { id: current?.definition.id ?? crypto.randomUUID(), instrumentId: current?.definition.instrumentId ?? context?.instrumentId ?? instrument.id, now: latest.current.now, mode: current?.definition.mode ?? context?.mode ?? event?.mode ?? 'ordinary', runId: current?.definition.runId ?? context?.runId ?? event?.runId ?? 'ordinary', sourceId: current?.definition.sourceId ?? context?.sourceId ?? event?.sourceId ?? 'close', observationBinding: current?.definition.observationBinding ?? context?.binding ?? event?.observation?.binding, position: current ? (current.definition.condition.kind === 'position' ? current.definition.condition.position : undefined) : sourceChoices?.find(choice => choice.id === selectedSourceId)?.position, levels: current ? (current.definition.condition.kind === 'level-crossing' ? current.definition.condition.levels : undefined) : sourceChoices?.find(choice => choice.id === selectedSourceId)?.levels });
      const saved = current ? editLocalAlert(current, { name: definition.name, message: definition.message, condition: definition.condition, ...(definition.conditions ? { conditions: definition.conditions } : {}), frequency: definition.frequency, expiresAt: definition.expiresAt, ...(definition.delivery ? { delivery: definition.delivery } : {}) }, latest.current.now) : createLocalAlert(definition);
      const next=current ? latest.current.alerts.map(alert => alert.definition.id === current.definition.id ? saved : alert) : [...latest.current.alerts, saved];const checked=validateLocalAlerts(next);if(!checked.ok)throw new Error(checked.errors.join(' '));publish(next,latest.current.alerts);
      if (!current || inCurrentSession(current)) onRequestObservation?.('after-save');
      // Like the reference, Create (or Save of an edit opened from the Alerts panel) closes the dialog and a short
      // toast confirms it. The manager's own "Create alert" / Edit inside the open manager still returns to its list.
      const savedText=current?`Alert updated on ${instrument.symbol}.`:`Alert created on ${instrument.symbol}.`;
      if(contextRequest){dirty.current=false;onSaved?.(savedText);finish('saved');return;}
      if(requestedFlow.current&&onSaved){dirty.current=false;requestedFlow.current=false;setEditing(null);onSaved(savedText);finish('saved');return;}
      dirty.current=false;
      setMessage(current ? 'Local alert updated. Numerical baselines restart from new data.' : 'Local alert created. It can trigger only while usable input arrives.'); setEditing(null); setTab('Alerts');
    } catch (error) { setMessage(plainError(error)); }
  };
  const assertManagerView=(expected:object=viewToken)=>{manual();if(managerView.current.token!==expected||latest.current.tab!=='Alerts')throw new Error('This alert list changed. Use its current controls.');};
  const updateManagerFilter=(next:AlertManagerFilter,focus=false)=>perform(()=>{assertManagerView();retireSelection();clearMenu();clearConfirmation();managerView.current.token={};setManagerFilter(next);if(focus)searchInput.current?.focus();});
  const updateManagerSort=(next:AlertManagerSort)=>perform(()=>{assertManagerView();retireSelection();clearMenu();clearConfirmation();managerView.current.token={};setManagerSort(next);});
  const currentVisibleAlert=(rendered:LocalAlert,expected:object=viewToken)=>{
    manual();const current=assertAlertDraftCurrent(latest.current.alerts,rendered.definition.id,rendered.revision);
    assertManagerView(expected);
    if(filterAlertManagerAlerts([current],managerView.current.filter).length!==1)throw new Error('This alert no longer matches the current filters.');
    return current;
  };
  const exportHistory=async()=>{
    const viewCurrent=()=>active()&&latest.current.tab==='History'&&historyOpening.current.token===historyToken;
    if(!viewCurrent()||exportInFlight.current)return;
    if(!latest.current.alerts.some(alert=>alert.history.length)){setMessage('No local alert triggers to export.');return;}
    if(typeof window==='undefined'||!window.lv){setMessage('History export needs the desktop app.');return;}
    const request={};exportInFlight.current=request;setHistoryExport(request);
    const requestCurrent=()=>viewCurrent()&&exportInFlight.current===request;
    try{
      const text=alertHistoryCsv(latest.current.alerts);
      if(!requestCurrent())return;
      const result=await window.lv.exportData({text,suggestedName:'OpenCandle-local-alert-history.csv',format:'csv'});
      if(requestCurrent())setMessage(result.ok?'Alert history saved locally.':result.error.code==='CANCELLED'?'Alert history export cancelled.':result.error.message);
    }catch(error){if(requestCurrent())setMessage(plainError(error));}
    finally{if(exportInFlight.current===request){exportInFlight.current=null;if(viewCurrent())setHistoryExport(null);}}
  };
  const history = alerts.flatMap(alert => alert.history).sort((a, b) => b.at - a.at || b.sequence - a.sequence);
  // History recorded on the synthetic Alpaca stub is labelled SYNTHETIC.
  const syntheticAlertIds = new Set(alerts.filter(alertUsesSyntheticStub).map(alert => alert.definition.id));
  // Only IDs, scalar identity and source ordinals enter these navigation views.
  // Retained observation payloads and export ownership are not traversed here.
  const alertPositions=new Map<string,number>(),historyPositions=new Map<string,{sourceIndex:number;historyIndex:number}>();let duplicateAlerts=false,duplicateHistory=false;
  alerts.forEach((alert,sourceIndex)=>{if(alertPositions.has(alert.definition.id))duplicateAlerts=true;alertPositions.set(alert.definition.id,sourceIndex);alert.history.forEach((item,historyIndex)=>{if(historyPositions.has(item.id))duplicateHistory=true;historyPositions.set(item.id,{sourceIndex,historyIndex});});});
  const managerItems:AlertListItem[]=matchingAlerts.map(alert=>({id:alert.definition.id,identity:[alert.definition.id,alert.revision],sourceIndex:alertPositions.get(alert.definition.id)!}));
  const historyItems:AlertListItem[]=history.map(item=>({id:item.id,identity:[item.id,item.alertId,item.mode,item.runId,item.at,item.sequence],...historyPositions.get(item.id)!}));
  const navigationToken=navigationOpening.current.token;
  const managerList=reconcileAlertListView(managerNavigation.current,viewToken,managerItems,duplicateAlerts),historyList=reconcileAlertListView(historyNavigation.current,navigationToken,historyItems,duplicateHistory);
  managerNavigation.current=managerList;historyNavigation.current=historyList;
  const historySelection=historyList.ambiguous?EMPTY_ALERT_HISTORY_SELECTION:reconcileAlertHistorySelection(historySelectionState,historyList.items);
  const observedReceipt=batchReceipt.current;
  if(observedReceipt){if(alerts!==observedReceipt.base&&alerts!==observedReceipt.candidate)batchReceipt.current=null;else if(alerts===observedReceipt.candidate)observedReceipt.candidateObserved=true;}
  if(priorBatchAuthority.current&&!sameBatchAuthority(priorBatchAuthority.current,currentBatchAuthority))retireSelection();
  priorBatchAuthority.current=currentBatchAuthority;
  const priorSelection=selectionRef.current,selection=reconcileAlertSelection(priorSelection,managerList);
  if(priorSelection&&priorSelection!==selection){
   const receipt=batchReceipt.current,ownPublication=receipt&&(receipt.outcome==='pending'||receipt.outcome==='accepted')&&alerts===receipt.candidate&&sameBatchAuthority(receipt.owner.authority,currentBatchAuthority)&&receipt.owner.opening===navigationOpening.current.token&&receipt.interaction===interactionEpoch.current;
   if(!ownPublication)retireSelection();else if(confirmation.current?.kind==='batch'){confirmation.current=null;confirmationEpoch.current++;}
  }
  selectionRef.current=selection;
  if(observedReceipt)releaseBatchReceipt(observedReceipt);
  const oldFocused=focusedListRow.current;
  if(oldFocused&&oldFocused.opening===navigationOpening.current.token&&open&&!contextRequest&&tab===oldFocused.kind){const current=tab==='Alerts'?managerList:historyList;if(!current.byId.has(oldFocused.id)){if(document.activeElement===oldFocused.node||!oldFocused.node.isConnected&&(document.activeElement===document.body||!document.activeElement))listFallback.current={kind:oldFocused.kind,view:current,node:oldFocused.node,opening:navigationOpening.current.token};focusedListRow.current=null;}}
  const sourceNote = context?.description ?? (event?.observation ? alertObservationDescription(event.observation) : event ? 'Legacy local source; observation basis was not recorded' : 'No eligible local alert source');
  // A dialog opened straight into Create (toolbar Alert, Alt+A, context menu) closes on Cancel;
  // a Create tab reached from the manager still returns to the manager.
  const cancelCreate=()=>{if(requestedFlow.current){requestedFlow.current=false;setEditing(null);dirty.current=false;onDraftDiscarded?.();finish('cancelled');return;}requestedFlow.current=false;const from=document.activeElement;setTab('Alerts');setEditing(null);dirty.current=false;setMessage('Alert edit cancelled. Saved alerts are unchanged.');pendingFocus.current={kind:'create-cancelled',from};onDraftDiscarded?.();};
  const editingAlert = editing ? alerts.find(alert => alert.definition.id === editing) : undefined;
  const formSourceNote = editingAlert ? `${editingAlert.definition.instrumentId} / ${editingAlert.definition.sourceId}. ${editingAlert.lastObservation ? alertObservationDescription(editingAlert.lastObservation) : 'Saved source session; no recorded observation basis yet.'}` : sourceNote;
  const inCurrentSession = (alert: LocalAlert) => (contexts??(context?[context]:[])).some(candidate=>alert.definition.runId === candidate.runId && !!alert.definition.observationBinding && sameAlertBinding(alert.definition.observationBinding, candidate.binding));
  const togglePaused=(rendered:LocalAlert,expectedView:object=viewToken)=>{
    try{const current=currentVisibleAlert(rendered,expectedView),resuming=rendered.status==='paused';
      batchReceipt.current=null;
      if(['expired','stopped'].includes(current.status))throw new Error('This alert has expired or stopped. Create or rearm it explicitly.');
      if(resuming!==(current.status==='paused'))throw new Error('This alert status changed. Use its current Pause or Resume control.');
      const next=setLocalAlertPaused(current,!resuming);publish(latest.current.alerts.map(row=>row.definition.id===current.definition.id?next:row),latest.current.alerts);
      if(resuming){onRequestObservation?.('after-save');setMessage('Alert resumed. A new local snapshot evaluation was requested. Crossing history starts again; missed observations are not reconstructed.');}
      else setMessage('Alert paused. Its saved source and history are retained.');
    }catch(error){setMessage(plainError(error));}
  };
  const formSource=editingAlert?.definition.observationBinding?.source??context?.binding.source;
  const comparison=formSource?.kind==='comparison'||formSource?.kind==='all'&&formSource.members[0].kind==='comparison';
  // Added conditions. Creating, their sources follow conditionSelections; editing, the saved sources are fixed.
  const savedGroup=editingAlert?.definition.observationBinding?.source.kind==='all'?editingAlert.definition.observationBinding.source:null;
  const conditionRows:{selection:AlertConditionSelection|null;member:AlertSourceSnapshot|null;draft:AlertConditionDraft}[]=editingAlert?(savedGroup?savedGroup.members.slice(1).map((member,index)=>({selection:null,member,draft:draft.conditions?.[index]??emptyAlertConditionDraft()})):[]):(onConditionSelectionsChange?conditionSelections??[]:[]).map((selection,index)=>({selection,member:null,draft:draft.conditions?.[index]??emptyAlertConditionDraft()}));
  const conditionChoices=(sourceChoices??[]).filter(choice=>!choice.targetOnly&&!choice.position&&!choice.levels&&!choice.drawingShape&&!!choice.source&&!choice.disabledReason&&choice.source.kind!=='comparison'&&!alertConditionMemberRefusal(choice.source));
  // Added conditions list every source; the ones that alert on their own show disabled with the reason.
  const conditionRefusals=(sourceChoices??[]).flatMap(choice=>{if(choice.targetOnly||!choice.source||choice.disabledReason||conditionChoices.includes(choice))return[];const reason=choice.position||choice.levels||choice.drawingShape||choice.source.kind==='comparison'?'Drawings alert on their own. Create a separate alert for them.':alertConditionMemberRefusal(choice.source)??'This source alerts on its own. Create a separate alert for it.';return[{id:choice.id,label:choice.label,reason}];});
  const mainChoice=sourceChoices?.find(choice=>choice.id===selectedSourceId),mainTarget=targetSourceId==='constant'?null:sourceChoices?.find(choice=>choice.id===targetSourceId);
  const addConditionRefusal=!onConditionSelectionsChange||editing!==null?null:noUsableSource?'Conditions need a data source for this symbol.':!mainChoice?.source||mainChoice.position||mainChoice.levels||mainChoice.drawingShape?'Conditions compare prices or indicators. Choose a price or an indicator in Source first.':alertConditionMemberRefusal(mainChoice.source)??(mainTarget?.source?alertConditionMemberRefusal(mainTarget.source):null);
  const conditionsChanged=()=>{retireSelection();dirty.current=true;rawCapture.current=false;captureRequested.current=true;pinnedContext.current=null;};
  const setConditionDraft=(index:number,patch:Partial<AlertConditionDraft>)=>perform(()=>{dirty.current=true;setDraft(current=>{const rows=conditionRows.map((_row,i)=>current.conditions?.[i]??emptyAlertConditionDraft());rows[index]={...rows[index],...patch};return{...current,conditions:rows};});});
  const setConditionSelection=(index:number,patch:Partial<AlertConditionSelection>)=>perform(()=>{const rows=conditionSelections??[];if(!onConditionSelectionsChange||!rows[index])return;conditionsChanged();onConditionSelectionsChange(rows.map((row,i)=>i===index?{...row,...patch}:row));if(patch.targetId!==undefined&&patch.targetId!=='constant')setDraft(current=>{const drafts=rows.map((_row,i)=>current.conditions?.[i]??emptyAlertConditionDraft());if(!['crossing','crossing-up','crossing-down','greater','less'].includes(drafts[index].kind))drafts[index]={...drafts[index],kind:'crossing'};return{...current,conditions:drafts};});});
  const addCondition=()=>perform(()=>{const rows=conditionSelections??[];if(!onConditionSelectionsChange||addConditionRefusal||rows.length+1>=ALERT_GROUP_CONDITION_LIMIT)return;const first=conditionChoices.find(choice=>choice.id===selectedSourceId)??conditionChoices.find(choice=>choice.source?.kind==='price')??conditionChoices[0];if(!first)throw new Error('No price or indicator source is available for another condition.');conditionsChanged();onConditionSelectionsChange([...rows,{sourceId:first.id,targetId:'constant'}]);setDraft(current=>({...current,conditions:[...rows.map((_row,i)=>current.conditions?.[i]??emptyAlertConditionDraft()),emptyAlertConditionDraft()]}));});
  const removeCondition=(index:number)=>perform(()=>{const rows=conditionSelections??[];if(!onConditionSelectionsChange||!rows[index])return;conditionsChanged();onConditionSelectionsChange(rows.filter((_row,i)=>i!==index));setDraft(current=>({...current,conditions:rows.map((_row,i)=>current.conditions?.[i]??emptyAlertConditionDraft()).filter((_row,i)=>i!==index)}));});
  const formLevels:AlertLevelSet|null=editingAlert?(editingAlert.definition.condition.kind==='level-crossing'?editingAlert.definition.condition.levels??null:null):sourceChoices?.find(choice=>choice.id===selectedSourceId)?.levels??null;
  const formChoice=sourceChoices?.find(choice=>choice.id===selectedSourceId),formDrawingShape=editingAlert?drawingSourceShape(editingAlert.definition.observationBinding?.source):formChoice?.drawingShape??drawingSourceShape(formChoice?.source);
  const formPosition:AlertPositionLevels|null=editingAlert?(editingAlert.definition.condition.kind==='position'?editingAlert.definition.condition.position??null:null):sourceChoices?.find(choice=>choice.id===selectedSourceId)?.position??null;
  const rearm = (alert: LocalAlert) => {
    if (!context) return;
    try {
      currentVisibleAlert(alert);batchReceipt.current=null;validateCurrentSource?.(context.binding);const current=currentVisibleAlert(alert),next = rearmAlertForObservation(current, context, latest.current.now, crypto.randomUUID());
      const rearmed=[...latest.current.alerts.map(item => item.definition.id === alert.definition.id ? setLocalAlertPaused(item, true) : item), next],checked=validateLocalAlerts(rearmed);if(!checked.ok)throw new Error(checked.errors.join(' '));publish(rearmed,latest.current.alerts);
      onRequestObservation?.('after-save');
      setMessage('New alert armed for this source session. The previous alert and its history were retained.');
    } catch (error) { setMessage(plainError(error)); }
  };
  const beginEdit=(rendered:LocalAlert,expectedView:object=viewToken)=>perform(()=>{
    const current=currentVisibleAlert(rendered,expectedView),from=document.activeElement;clearMenu();dirty.current=true;setEditing(current.definition.id);editRevision.current=current.revision;setDraft(draftFromAlert(current,latest.current.now));setTab('Create');setMessage('');pendingFocus.current={kind:'edit',id:current.definition.id,generation:draftGeneration.current,from};
  });
  const beginDelete=(rendered:LocalAlert,expectedView:object=viewToken)=>perform(()=>{
    const current=currentVisibleAlert(rendered,expectedView),from=document.activeElement;batchReceipt.current=null;clearMenu();clearGestures();listFallback.current=null;focusedListRow.current=null;const next:DeleteConfirmation={kind:'row',id:current.definition.id,revision:current.revision,view:expectedView,identity:{}};confirmationEpoch.current++;confirmation.current=next;setDeleting(next);pendingFocus.current={kind:'delete',owner:next,from};
  });
  const rowNode=(id:string)=>Array.from(dialog.current?.querySelectorAll<HTMLElement>('.alert-row[data-alert-id]')??[]).find(node=>node.getAttribute('data-alert-id')===id)??null;
  const cancelDelete=(owner:DeleteConfirmation)=>{
    if(!active()||confirmation.current!==owner)return;clearConfirmation();const current=latest.current.alerts.find(row=>row.definition.id===owner.id);pendingFocus.current={kind:'return',view:managerView.current.token,trigger:current?.revision===owner.revision?rowNode(owner.id):null,from:document.activeElement};
  };
  const confirmDelete=(owner:DeleteConfirmation)=>{
    if(!active()||confirmation.current!==owner)return;
    try{
      currentVisibleAlert({definition:{id:owner.id},revision:owner.revision} as LocalAlert,owner.view);
      const base=latest.current.alerts,publisher=onAlertsChange,from=document.activeElement,opening=historyOpening.current.token,consumedVersion=++confirmationEpoch.current;confirmation.current=null;setDeleting(null);
      const receipt=recordAlertPublication(publisher,base.filter(row=>row.definition.id!==owner.id),base);
      const current=()=>active()&&latest.current.tab==='Alerts'&&historyOpening.current.token===opening&&confirmationEpoch.current===consumedVersion&&!confirmation.current&&!menuOwner.current&&latestBatchAuthority.current.publisher===publisher;
      if(receipt.kind==='accepted'){if(current())pendingFocus.current={kind:'deleted',opening,from};return;}
      if(!current())return;
      if(receipt.kind==='rejected'&&managerView.current.token===owner.view){
        try{assertAlertDraftCurrent(latest.current.alerts,owner.id,owner.revision);const restored:DeleteConfirmation={...owner,identity:{}};confirmationEpoch.current++;confirmation.current=restored;setDeleting(restored);setMessage('The alert deletion was rejected. Review the alert before confirming again.');}catch{/* A removed/replaced target does not regain confirmation authority. */}
      }else setMessage('The deletion outcome is unknown. Review the current alerts before starting a new action.');
    }catch(error){
      if(confirmation.current===owner)setMessage(plainError(error));
    }
  };
  const assertMenu=(owner:AlertRowMenu)=>{
    if(menuOwner.current!==owner)throw Error('This alert menu was closed or replaced.');
    const current=currentVisibleAlert(owner.row,owner.view);if(current.status!==owner.status||owner.kind==='selection'&&!selectedMenuBasis(owner))throw Error('This alert selection changed. Open its current menu.');return current;
  };
  const focusable=(exclude?:HTMLElement)=>Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]),input:not(:disabled):not([tabindex="-1"]),select:not(:disabled):not([tabindex="-1"]),textarea:not(:disabled):not([tabindex="-1"]),[tabindex="0"]:not(:disabled):not([aria-disabled="true"])')??[]).filter(node=>node.offsetParent!==null&&!node.closest('[hidden],[aria-hidden="true"]')&&!exclude?.contains(node));
  // The dialog element holding focus is the retention fallback for a lost control: it counts as lost focus here.
  const focusAllowed=(from:Element|null)=>document.activeElement===from||(!from?.isConnected&&(document.activeElement===document.body||!document.activeElement||document.activeElement===dialog.current));
  const dismissMenu=(owner:AlertRowMenu,restore=false,direction?:number)=>{
    if(menuOwner.current!==owner||!active())return;
    const element=menuElement.current?.owner===owner?menuElement.current.node:undefined,from=document.activeElement,wasInside=!!element?.contains(from);
    const targets=direction?focusable(element):[],index=targets.indexOf(owner.trigger!);
    clearMenu();
    if(owner.view!==managerView.current.token||latest.current.tab!=='Alerts')return;
    if(direction){const origin=index<0?(direction>0?-1:0):index,next=(origin+direction+targets.length)%targets.length,target=targets[next];
      if(target?.isConnected&&dialog.current?.contains(target)){target.focus();assertManagerView(owner.view);}return;}
    if(restore&&(wasInside||from===owner.trigger))pendingFocus.current={kind:'return',view:owner.view,trigger:owner.trigger,from,...(owner.kind==='selection'?{selection:{view:owner.list,state:owner.selection,opening:owner.opening,interaction:owner.interaction}}:{})};
  };
  const openMenu=(rendered:LocalAlert,trigger:HTMLElement|null)=>perform(()=>{
    const current=currentVisibleAlert(rendered);if(contextRequest)throw Error('Row menus are unavailable in a contextual alert draft.');
    const state=selectionRef.current,list=managerNavigation.current;let owner:AlertRowMenu;
    if(state&&list&&isAlertSelected(state,list,current.definition.id)){
      const row=trigger&&rowBindings.current.get(trigger),control=selectionControls.current.get('more:'+current.definition.id);
      const origin=row&&row.view===list&&row.id===current.definition.id&&list.nodes.get(row.id)?.node===trigger?{node:trigger!,identity:row.identity,key:'row:'+row.id}:control&&control.node===trigger?{node:trigger!,identity:control.identity,key:'more:'+current.definition.id}:null;
      if(!origin||!origin.node.isConnected||!dialog.current?.contains(origin.node))throw Error('This alert menu trigger changed. Use its current control.');
      const byId=new Map(latest.current.alerts.map(alert=>[alert.definition.id,alert]));
      const targets=state.selectedIds.map(id=>{const alert=byId.get(id);if(!alert)throw Error('A selected alert was removed.');return{id,revision:alert.revision,status:alert.status};});
      owner={kind:'selection',blockingDelete:confirmation.current?.kind==='row'?confirmation.current:null,row:current,view:viewToken,status:current.status,trigger,list,selection:state,opening:navigationOpening.current.token,interaction:interactionEpoch.current,authority:latestBatchAuthority.current,targets,origin};
    }else owner={kind:'row',row:current,view:viewToken,status:current.status,trigger};
    if(confirmation.current?.kind==='batch')clearConfirmation();clearMenu();listFallback.current=null;focusedListRow.current=null;batchReceipt.current=null;menuEpoch.current++;menuOwner.current=owner;setRowMenu(owner);pendingFocus.current={kind:'menu',owner};
  });
  const menuAction=(owner:AlertRowMenu,action:'edit'|'toggle'|'delete')=>{
    if(owner.kind!=='row')return;
    try{const current=assertMenu(owner);clearMenu();
      if(action==='edit')beginEdit(current,owner.view);else if(action==='delete')beginDelete(current,owner.view);else togglePaused(owner.row,owner.view);
    }catch(error){if(menuOwner.current===owner){clearMenu();setMessage(plainError(error));}}
  };
  const menuKey=(owner:AlertRowMenu,event:React.KeyboardEvent)=>{
    if(event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();return;}
    if(event.key==='Enter'||event.key===' '){event.stopPropagation();return;}
    if(!['ArrowDown','ArrowUp','Home','End','Escape','Tab'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    try{
      if(event.key==='Escape'){dismissMenu(owner,true);return;}if(event.key==='Tab'){dismissMenu(owner,false,event.shiftKey?-1:1);return;}
      assertMenu(owner);const element=menuElement.current?.owner===owner?menuElement.current.node:null,items=Array.from(element?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')??[]),index=items.indexOf(document.activeElement as HTMLButtonElement);
      if(!items.length)return;
      const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?(index+1)%items.length:(index<=0?items.length:index)-1;
      items[next]?.focus();assertMenu(owner);
    }catch(error){if(menuOwner.current===owner){clearMenu();setMessage(plainError(error));}}
  };
  const listView=(kind:'Alerts'|'History')=>kind==='Alerts'?managerNavigation.current:historyNavigation.current;
  const listCurrent=(kind:'Alerts'|'History',owner:AlertListView)=>active()&&!contextRequest&&latest.current.tab===kind&&listView(kind)===owner&&!owner.ambiguous&&owner.key===(kind==='Alerts'?managerView.current.token:navigationOpening.current.token)&&(kind!=='Alerts'||!menuOwner.current&&!confirmation.current);
  const listItemCurrent=(kind:'Alerts'|'History',owner:AlertListView,id:string)=>{
    if(!listCurrent(kind,owner))return false;const index=owner.byId.get(id),item=index===undefined?undefined:owner.items[index];if(!item)return false;
    const alert=latest.current.alerts[item.sourceIndex];if(!alert)return false;
    if(kind==='Alerts'){if(alert.definition.id!==item.identity[0]||alert.revision!==item.identity[1])return false;try{return filterAlertManagerAlerts([alert],managerView.current.filter).length===1;}catch{return false;}}
    const notification=item.historyIndex===undefined?undefined:alert.history[item.historyIndex];return !!notification&&alert.definition.id===item.identity[1]&&notification.id===item.identity[0]&&notification.alertId===item.identity[1]&&notification.mode===item.identity[2]&&notification.runId===item.identity[3]&&notification.at===item.identity[4]&&notification.sequence===item.identity[5];
  };
  const listNodeCurrent=(kind:'Alerts'|'History',owner:AlertListView,id:string,node:HTMLElement)=>listItemCurrent(kind,owner,id)&&owner.nodes.get(id)?.node===node&&node.isConnected&&dialog.current?.contains(node)&&node.offsetParent!==null&&!node.closest('[hidden],[aria-hidden="true"],[inert]');
  const listRef=(kind:'Alerts'|'History',owner:AlertListView,id:string)=>{const registration={};return(node:HTMLElement|null)=>{if(node){if(listView(kind)===owner&&owner.byId.has(id)&&!owner.ambiguous){owner.nodes.set(id,{node,registration});const prior=rowBindings.current.get(node);if(!prior||prior.view!==owner||prior.id!==id)rowBindings.current.set(node,{node,view:owner,id,identity:{}});}}else if(owner.nodes.get(id)?.registration===registration)owner.nodes.delete(id);};};
  const bindingCurrent=(binding:RowBinding)=>rowBindings.current.get(binding.node)===binding&&listNodeCurrent('Alerts',binding.view,binding.id,binding.node);
  const pointerCurrent=(owner:SelectionPointer)=>pointerSelection.current===owner&&selectionCurrent(owner.view,owner.state)&&owner.opening===navigationOpening.current.token&&owner.interaction===interactionEpoch.current&&bindingCurrent(owner.binding);
  const rangeCurrent=(owner:SelectionFocus)=>rangeFocus.current===owner&&selectionCurrent(owner.view,owner.state)&&owner.opening===navigationOpening.current.token&&owner.interaction===interactionEpoch.current&&bindingCurrent(owner.origin)&&bindingCurrent(owner.target);
  const listFocus=(kind:'Alerts'|'History',owner:AlertListView,id:string,event:React.FocusEvent<HTMLElement>)=>{
    if(event.target!==event.currentTarget||!listNodeCurrent(kind,owner,id,event.currentTarget))return;
    listFallback.current=null;focusedListRow.current={kind,id,node:event.currentTarget,opening:navigationOpening.current.token};
    if(kind!=='Alerts')return;
    const pointer=pointerSelection.current,range=rangeFocus.current;
    if(pointer&&pointerCurrent(pointer)&&pointer.binding.node===event.currentTarget&&pointer.focusPending&&document.activeElement===event.currentTarget){pointer.focusPending=false;return;}
    if(range&&rangeCurrent(range)&&range.target.node===event.currentTarget&&document.activeElement===event.currentTarget){rangeFocus.current=null;return;}
    clearGestures();if(selectionRef.current&&installSelection(owner,selectionRef.current,{kind:'focus-anchor',id})&&document.activeElement===event.currentTarget)plainFocus.current={view:owner,state:selectionRef.current!,opening:navigationOpening.current.token,interaction:interactionEpoch.current,node:event.currentTarget};
  };
  const listBlur=(event:React.FocusEvent<HTMLElement>)=>{
    if(event.target===event.currentTarget&&focusedListRow.current?.node===event.currentTarget&&event.relatedTarget)focusedListRow.current=null;
    if(event.relatedTarget&&event.relatedTarget!==pointerSelection.current?.binding.node&&event.relatedTarget!==rangeFocus.current?.target.node)clearGestures();
  };
  const pointerDown=(view:AlertListView,id:string,event:React.PointerEvent<HTMLElement>)=>{
    clearGestures();const state=selectionRef.current,binding=rowBindings.current.get(event.currentTarget);
    if(event.defaultPrevented||(event.nativeEvent as PointerEvent & {isComposing?:boolean}).isComposing||event.altKey||!alertListBackground(event.target)||!state||!binding||!selectionCurrent(view,state)||!bindingCurrent(binding))return;
    if(event.button!==2&&(event.button!==0||!event.shiftKey&&!event.ctrlKey&&!event.metaKey))return;
    if(!Number.isSafeInteger(event.pointerId))return;
    const focused=Array.from(view.nodes.entries()).find(([,record])=>record.node===document.activeElement),fallbackId=focused&&listNodeCurrent('Alerts',view,focused[0],focused[1].node)?focused[0]:undefined;
    pointerSelection.current={view,state,opening:navigationOpening.current.token,interaction:interactionEpoch.current,binding,pointerId:event.pointerId,button:event.button,shift:event.shiftKey,ctrl:event.ctrlKey,meta:event.metaKey,fallbackId,released:false,focusPending:true};
  };
  const releasePointer=(event:{pointerId:number;button:number;target:EventTarget|null;defaultPrevented?:boolean;shiftKey:boolean;ctrlKey:boolean;metaKey:boolean;altKey:boolean})=>{
    const owner=pointerSelection.current;if(!owner)return;
    if(event.defaultPrevented||event.altKey||event.shiftKey!==owner.shift||event.ctrlKey!==owner.ctrl||event.metaKey!==owner.meta||event.pointerId!==owner.pointerId||event.button!==owner.button||!pointerCurrent(owner)||!owner.binding.node.contains(event.target as Node)||!alertListBackground(event.target)){pointerSelection.current=null;return;}owner.released=true;
  };
  const pointerMatches=(owner:SelectionPointer,event:React.MouseEvent<HTMLElement>,contextMenu=false)=>{
    const id=(event.nativeEvent as MouseEvent & {pointerId?:number}).pointerId;
    return pointerCurrent(owner)&&event.currentTarget===owner.binding.node&&!event.defaultPrevented&&!event.altKey&&event.button===owner.button&&event.shiftKey===owner.shift&&event.ctrlKey===owner.ctrl&&event.metaKey===owner.meta&&alertListBackground(event.target)&&(id===undefined?owner.released||contextMenu:id===owner.pointerId)&&(contextMenu||owner.released);
  };
  const listClick=(kind:'Alerts'|'History',owner:AlertListView,id:string,event:React.MouseEvent<HTMLElement>)=>{
    const pointer=pointerSelection.current,retirePointer=()=>{if(pointer&&pointerSelection.current===pointer&&pointer.view===owner&&pointer.binding.node===event.currentTarget)pointerSelection.current=null;};
    if(event.defaultPrevented||event.button!==0||event.altKey||(event.nativeEvent as MouseEvent & {isComposing?:boolean})?.isComposing||!alertListBackground(event.target)||!listNodeCurrent(kind,owner,id,event.currentTarget)){retirePointer();return;}
    if(kind==='Alerts'&&(event.shiftKey||event.ctrlKey||event.metaKey)){
      if(!pointer||!pointerMatches(pointer,event)){retirePointer();return;}
      pointerSelection.current=null;event.preventDefault();event.stopPropagation();
      const transition=transitionAlertSelection(pointer.state,owner,event.shiftKey?{kind:'range',id,fallbackAnchorId:pointer.fallbackId}:{kind:'toggle',id});
      if(installTransition(owner,pointer.state,transition.state))focusSelection(owner,transition.state,pointer.binding,pointer.binding);return;
    }
    const priorFocus=plainFocus.current,anchored=priorFocus?.view===owner&&priorFocus.node===event.currentTarget&&priorFocus.state===selectionRef.current&&priorFocus.opening===navigationOpening.current.token&&priorFocus.interaction===interactionEpoch.current;
    clearGestures();const focused=document.activeElement===event.currentTarget;event.currentTarget.focus();
    if(kind==='Alerts'&&focused&&!anchored&&listNodeCurrent(kind,owner,id,event.currentTarget)&&selectionRef.current)installSelection(owner,selectionRef.current,{kind:'focus-anchor',id});
  };
  const listKey=(kind:'Alerts'|'History',owner:AlertListView,id:string,event:React.KeyboardEvent<HTMLElement>)=>{
    const step=alertListStep(event),origin=event.currentTarget;if(step===null||!alertListBackground(event.target)||document.activeElement!==origin||!listNodeCurrent(kind,owner,id,origin))return false;
    const index=owner.byId.get(id)!,target=owner.items[Math.max(0,Math.min(owner.items.length-1,index+step))],node=owner.nodes.get(target.id)?.node;
    if(!node||!listNodeCurrent(kind,owner,target.id,node))return false;event.preventDefault();event.stopPropagation();if(!step||node===origin){if(kind==='Alerts'&&selectionRef.current)installSelection(owner,selectionRef.current,{kind:'focus-anchor',id});return true;}
    // Native focus may synchronously open another view or move focus elsewhere.
    // After it returns, no old owner writes state or attempts a fallback.
    node.focus();if(!listNodeCurrent(kind,owner,id,origin)||!listNodeCurrent(kind,owner,target.id,node))return true;return true;
  };
  const installHistorySelection=(intent:AlertHistorySelectionIntent)=>{
    try{if(!active()||contextRequest||latest.current.tab!=='History'||historyNavigation.current!==historyList||historyList.ambiguous)return false;setHistorySelectionState(transitionAlertHistorySelection(historySelection,historyList.items,intent));return true;}
    catch(error){setMessage(plainError(error));return false;}
  };
  const historyClick=(id:string,event:React.MouseEvent<HTMLElement>)=>{
    if(event.defaultPrevented||event.button!==0||event.altKey||!(event.ctrlKey||event.metaKey||event.shiftKey)||(event.nativeEvent as MouseEvent & {isComposing?:boolean})?.isComposing||!alertListBackground(event.target)||!listNodeCurrent('History',historyList,id,event.currentTarget))return false;
    event.preventDefault();event.stopPropagation();if(installHistorySelection(event.shiftKey?{kind:'range',id}:{kind:'toggle',id}))event.currentTarget.focus();return true;
  };
  const historyKey=(id:string,event:React.KeyboardEvent<HTMLElement>)=>{
    if(event.nativeEvent.isComposing||event.altKey||event.shiftKey||!(event.ctrlKey||event.metaKey)||event.key.toLowerCase()!=='a'||!alertListBackground(event.target)||document.activeElement!==event.currentTarget||!listNodeCurrent('History',historyList,id,event.currentTarget))return false;
    event.preventDefault();event.stopPropagation();installHistorySelection({kind:'all'});return true;
  };
  const selectionControlRef=(key:string)=>{const registration={};return(node:HTMLElement|null)=>{if(node){let binding=controlBindings.current.get(node);if(!binding||binding.key!==key){binding={key,identity:{}};controlBindings.current.set(node,binding);}selectionControls.current.set(key,{node,registration,identity:binding.identity});}else if(selectionControls.current.get(key)?.registration===registration)selectionControls.current.delete(key);};};
  const selectionControlCurrent=(key:string,node:HTMLElement)=>selectionControls.current.get(key)?.node===node&&node.isConnected&&dialog.current?.contains(node)&&node.offsetParent!==null&&!node.closest('[hidden],[aria-hidden="true"],[inert]');
  const selectionCurrent=(view:AlertListView,state:AlertSelectionState)=>listCurrent('Alerts',view)&&selectionRef.current===state&&state.enabled;
  const installTransition=(view:AlertListView,state:AlertSelectionState,next:AlertSelectionState)=>{
    if(!selectionCurrent(view,state))return false;clearGestures();selectionRef.current=next;interactionEpoch.current++;batchReceipt.current=null;batchNotice.current='';notifySelection(value=>value+1);return true;
  };
  const installSelection=(view:AlertListView,state:AlertSelectionState,intent:AlertSelectionIntent)=>selectionCurrent(view,state)&&installTransition(view,state,transitionAlertSelection(state,view,intent).state);
  const focusSelection=(view:AlertListView,state:AlertSelectionState,origin:RowBinding,target:RowBinding)=>{
    if(!selectionCurrent(view,state)||!bindingCurrent(origin)||!bindingCurrent(target))return;
    const owner:SelectionFocus={view,state,opening:navigationOpening.current.token,interaction:interactionEpoch.current,origin,target};rangeFocus.current=owner;
    try{target.node.focus();/* Native callbacks may retire this intent. Never write old state afterward. */}
    finally{if(rangeFocus.current===owner)rangeFocus.current=null;}
  };
  const selectionKey=(view:AlertListView,id:string,event:React.KeyboardEvent<HTMLElement>)=>{
    if(event.defaultPrevented||event.nativeEvent.isComposing||event.altKey||!alertListBackground(event.target)||document.activeElement!==event.currentTarget||!listNodeCurrent('Alerts',view,id,event.currentTarget))return false;
    const state=selectionRef.current;if(!state||!selectionCurrent(view,state))return false;
    if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&event.key.toLowerCase()==='a'){event.preventDefault();event.stopPropagation();installSelection(view,state,{kind:'all'});return true;}
    if(!event.shiftKey||event.ctrlKey||event.metaKey||!['ArrowUp','ArrowDown'].includes(event.key))return false;
    const transition=transitionAlertSelection(state,view,{kind:'extend',originId:id,direction:event.key==='ArrowDown'?1:-1}),origin=rowBindings.current.get(event.currentTarget),targetNode=transition.focusId?view.nodes.get(transition.focusId)?.node:undefined,target=targetNode&&rowBindings.current.get(targetNode);
    if(!origin||!target||!bindingCurrent(origin)||!bindingCurrent(target))return false;
    event.preventDefault();event.stopPropagation();if(installTransition(view,state,transition.state))focusSelection(view,transition.state,origin,target);return true;
  };
  const contextMenuRow=(alert:LocalAlert,event:React.MouseEvent<HTMLElement>)=>{
    const pointer=pointerSelection.current,selected=selectionRef.current&&isAlertSelected(selectionRef.current,managerList,alert.definition.id);
    const retirePointer=()=>{if(pointer&&pointerSelection.current===pointer&&pointer.view===managerList&&pointer.binding.node===event.currentTarget)pointerSelection.current=null;};
    if(event.defaultPrevented||!alertListBackground(event.target)){retirePointer();return;}
    if(pointer){if(pointer.button!==2||!pointerMatches(pointer,event,true)){retirePointer();return;}pointerSelection.current=null;}
    else if(selected)return;
    event.preventDefault();event.stopPropagation();openMenu(alert,event.currentTarget);
  };
  const pointerRelease=useRef(releasePointer);pointerRelease.current=releasePointer;
  useEffect(()=>{
    const pointerUp=(event:PointerEvent)=>pointerRelease.current(event),pointerCancel=()=>clearGestures(),pointerStart=()=>clearGestures(),keyStart=()=>clearGestures();
    const focusStart=(event:FocusEvent)=>{if(event.target!==pointerSelection.current?.binding.node&&event.target!==rangeFocus.current?.target.node)clearGestures();};
    const hidden=()=>{if(document.hidden)clearGestures();},blur=()=>clearGestures();
    document.addEventListener?.('pointerdown',pointerStart,true);document.addEventListener?.('pointerup',pointerUp,true);document.addEventListener?.('pointercancel',pointerCancel,true);document.addEventListener?.('keydown',keyStart,true);document.addEventListener?.('focusin',focusStart,true);document.addEventListener?.('visibilitychange',hidden);
    if(typeof window!=='undefined')window.addEventListener?.('blur',blur);
    return()=>{document.removeEventListener?.('pointerdown',pointerStart,true);document.removeEventListener?.('pointerup',pointerUp,true);document.removeEventListener?.('pointercancel',pointerCancel,true);document.removeEventListener?.('keydown',keyStart,true);document.removeEventListener?.('focusin',focusStart,true);document.removeEventListener?.('visibilitychange',hidden);if(typeof window!=='undefined')window.removeEventListener?.('blur',blur);};
  },[]);
  const selectFromControl=(view:AlertListView,state:AlertSelectionState,intent:AlertSelectionIntent,key:string,event:React.SyntheticEvent<HTMLElement>)=>{
    if(event.defaultPrevented||(event.nativeEvent as KeyboardEvent).isComposing||!selectionControlCurrent(key,event.currentTarget)||!selectionCurrent(view,state))return;
    if(intent.kind==='toggle'){const row=view.nodes.get(intent.id)?.node;if(!row||!listNodeCurrent('Alerts',view,intent.id,row)||!row.contains(event.currentTarget))return;}
    installSelection(view,state,intent);
  };
  const batchAuthorityPresent=(authority:BatchAuthority)=>!!authority.token&&typeof authority.token==='object'&&typeof authority.assert==='function';
  const selectedMenuBasis=(owner:SelectedAlertMenu)=>{
    if(!active()||contextRequest||owner.blockingDelete&&confirmation.current!==owner.blockingDelete||latest.current.tab!=='Alerts'||managerNavigation.current!==owner.list||managerView.current.token!==owner.view||selectionRef.current!==owner.selection||navigationOpening.current.token!==owner.opening||interactionEpoch.current!==owner.interaction||!sameBatchAuthority(owner.authority,latestBatchAuthority.current)||!owner.origin.node.isConnected||!dialog.current?.contains(owner.origin.node)||owner.origin.node.offsetParent===null||owner.origin.node.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
    if(owner.origin.key.startsWith('row:')){const binding=rowBindings.current.get(owner.origin.node);if(!binding||binding.identity!==owner.origin.identity||binding.view!==owner.list||binding.id!==owner.row.definition.id||owner.list.nodes.get(binding.id)?.node!==binding.node)return false;}
    else{const record=selectionControls.current.get(owner.origin.key);if(record?.node!==owner.origin.node||record.identity!==owner.origin.identity)return false;}
    const rows=new Map(latest.current.alerts.map(alert=>[alert.definition.id,alert]));
    return owner.targets.length===owner.selection.selectedIds.length&&owner.targets.every((target,index)=>{const alert=rows.get(target.id);return target.id===owner.selection.selectedIds[index]&&alert?.revision===target.revision&&alert.status===target.status;});
  };
  if(visibleMenu?.kind==='selection'&&!selectedMenuBasis(visibleMenu)){
    const owner=visibleMenu,from=document.activeElement,inside=menuElement.current?.owner===owner&&menuElement.current.node.contains(from);
    if(menuOwner.current===owner){menuOwner.current=null;menuEpoch.current++;batchPreparation.current=null;clearGestures();if(inside)pendingFocus.current={kind:'return',view:managerView.current.token,trigger:owner.trigger,from};}visibleMenu=null;
  }
  const preparedCurrent=(owner:BatchConfirmation)=>active()&&!contextRequest&&latest.current.tab==='Alerts'&&confirmation.current===owner&&!menuOwner.current&&managerNavigation.current===owner.view&&managerView.current.token===owner.view.key&&selectionRef.current===owner.selection&&navigationOpening.current.token===owner.opening&&interactionEpoch.current===owner.interaction&&sameBatchAuthority(owner.authority,latestBatchAuthority.current);
  const batchTime=(owner:BatchConfirmation)=>{
    if(!preparedCurrent(owner)||!batchAuthorityPresent(owner.authority))throw Error('This selected alert preview is no longer current.');
    owner.authority.assert!(owner.authority.token!);
    if(!preparedCurrent(owner))throw Error('The alert source changed. Open a new preview.');
    const time=owner.authority.readTime();
    if(!preparedCurrent(owner))throw Error('The selected alert action changed while reading its clock.');
    owner.authority.assert!(owner.authority.token!);
    if(!preparedCurrent(owner))throw Error('The alert source changed while validating its action clock.');return time;
  };
  const prepareSelectedCore=(action:AlertBatchAction,view:AlertListView,state:AlertSelectionState,trigger:HTMLElement|null,originCurrent:()=>boolean,menu?:SelectedAlertMenu)=>{
    if(!selectionCurrent(view,state)||!state.selectedIds.length||batchDispatch.current||!originCurrent())return;
    const authority=latestBatchAuthority.current,opening=navigationOpening.current.token,interaction=interactionEpoch.current,menuVersion=menuEpoch.current,confirmationVersion=confirmationEpoch.current,preparation={menu};batchPreparation.current=preparation;
    const current=()=>batchPreparation.current===preparation&&menuEpoch.current===menuVersion&&confirmationEpoch.current===confirmationVersion&&selectionCurrent(view,state)&&navigationOpening.current.token===opening&&interactionEpoch.current===interaction&&sameBatchAuthority(authority,latestBatchAuthority.current)&&originCurrent();
    try{
      if(!batchAuthorityPresent(authority))throw Error('Selected alert actions are unavailable until the local source is ready.');
      authority.assert!(authority.token!);if(!current())return;
      const time=authority.readTime();if(!current())return;
      authority.assert!(authority.token!);if(!current())return;
      const plan=prepareAlertBatch(latest.current.alerts,state.selectedIds,action,time);if(!current())return;
      const names=plan.selectedIds.slice(0,5).map(id=>latest.current.alerts.find(row=>row.definition.id===id)!.definition.name);
      const from=document.activeElement;clearMenu();clearConfirmation();batchReceipt.current=null;batchNotice.current='';
      const owner:BatchConfirmation={kind:'batch',view,selection:state,opening,interaction,authority,plan,names,trigger,identity:{}};
      confirmation.current=owner;setDeleting(owner);pendingFocus.current={kind:'batch',owner,from};
    }catch(error){if(current()){batchNotice.current=error instanceof Error?error.message:String(error);setMessage(batchNotice.current);}}
    finally{if(batchPreparation.current===preparation)batchPreparation.current=null;}
  };
  const prepareSelected=(action:AlertBatchAction,view:AlertListView,state:AlertSelectionState,key:string,event:React.MouseEvent<HTMLButtonElement>)=>{
    if(event.defaultPrevented||(event.nativeEvent as MouseEvent & {isComposing?:boolean})?.isComposing)return;const trigger=event.currentTarget;
    prepareSelectedCore(action,view,state,trigger,()=>!!selectionControlCurrent(key,trigger));
  };
  const prepareMenuSelected=(owner:SelectedAlertMenu,action:AlertBatchAction,event:React.MouseEvent<HTMLButtonElement>)=>{
    if(event.defaultPrevented||(event.nativeEvent as MouseEvent & {isComposing?:boolean})?.isComposing||owner.blockingDelete||menuOwner.current!==owner||!selectedMenuBasis(owner)||!batchAuthorityPresent(owner.authority)||!selectionControlCurrent('menu:'+action,event.currentTarget)||menuElement.current?.owner!==owner||!menuElement.current.node.contains(event.currentTarget))return;
    clearMenu();prepareSelectedCore(action,owner.list,owner.selection,owner.trigger,()=>selectedMenuBasis(owner),owner);
  };
  const cancelSelected=(owner:BatchConfirmation)=>{
    if(!preparedCurrent(owner))return;const from=document.activeElement;clearConfirmation();pendingFocus.current={kind:'return',view:owner.view.key,trigger:owner.trigger,from,selection:{view:owner.view,state:owner.selection,opening:owner.opening,interaction:owner.interaction}};
  };
  const receiptCurrent=(receipt:BatchReceipt)=>batchReceipt.current===receipt&&active()&&!contextRequest&&latest.current.tab==='Alerts'&&navigationOpening.current.token===receipt.owner.opening&&interactionEpoch.current===receipt.interaction&&confirmationEpoch.current===receipt.epoch&&!confirmation.current&&!menuOwner.current&&sameBatchAuthority(receipt.owner.authority,latestBatchAuthority.current)&&(latest.current.alerts===receipt.base||latest.current.alerts===receipt.candidate);
  const assertReceiptCurrent=(receipt:BatchReceipt)=>{if(!receiptCurrent(receipt))return false;receipt.owner.authority.assert!(receipt.owner.authority.token!);return receiptCurrent(receipt);};
  const applySelected=(owner:BatchConfirmation)=>{
    if(batchDispatch.current||!preparedCurrent(owner)||!owner.plan.eligibleIds.length)return;
    const beforeEpoch=confirmationEpoch.current;
    try{
      const time=batchTime(owner),base=latest.current.alerts,result=applyAlertBatch(owner.plan,base,time,owner.plan.action==='clone'?()=>crypto.randomUUID():undefined);
      if(!preparedCurrent(owner)||latest.current.alerts!==base||!result.changed)return;
      const candidate=[...result.candidate],from=document.activeElement;
      const receipt:BatchReceipt={owner,base,candidate,epoch:++confirmationEpoch.current,interaction:interactionEpoch.current,from,outcome:'pending',candidateObserved:false,followUpConsumed:false,awaitingFocus:false};
      confirmation.current=null;setDeleting(null);batchReceipt.current=receipt;batchDispatch.current=owner;
      const publication=recordAlertPublication(owner.authority.publisher,candidate,base);receipt.outcome=publication.kind;
      if(publication.kind!=='accepted'){
        if(receiptCurrent(receipt)){setMessage(publication.kind==='rejected'?'The selected changes were rejected. Review the current alerts and open a new preview.':'The save outcome is unknown. Review the current alerts before starting a new action.');pendingFocus.current={kind:'return',view:managerView.current.token,trigger:owner.trigger,from};}
        if(batchReceipt.current===receipt)batchReceipt.current=null;return;
      }
      // Acceptance is final. Source/readiness and follow-up failures cannot undo it.
      try{
        if(!assertReceiptCurrent(receipt))return;
        setMessage(`${result.eligibleIds.length} selected alert${result.eligibleIds.length===1?'':'s'} ${owner.plan.action==='delete'?'deleted':owner.plan.action==='pause'?'paused':owner.plan.action==='clone'?'cloned. Copies start a new lifecycle without trigger history':'resumed'}.`);
        if((owner.plan.action==='resume'||owner.plan.action==='clone')&&owner.authority.observe){
          if(!assertReceiptCurrent(receipt))return;owner.authority.observe('after-save');
        }
        if(receiptCurrent(receipt)){receipt.awaitingFocus=true;pendingFocus.current={kind:'batch-result',receipt};}
      }catch{if(receiptCurrent(receipt))setMessage('The selected changes were saved, but local reevaluation or follow-up could not finish.');}
      finally{receipt.followUpConsumed=true;releaseBatchReceipt(receipt);}
    }catch(error){
      if(confirmation.current===owner&&confirmationEpoch.current===beforeEpoch){confirmation.current=null;confirmationEpoch.current++;setDeleting(null);batchNotice.current=error instanceof Error?error.message:String(error);setMessage(batchNotice.current);}
    }finally{if(batchDispatch.current===owner)batchDispatch.current=null;}
  };
  let visibleBatch=deleting?.kind==='batch'&&confirmation.current===deleting?deleting:null;
  if(visibleBatch){const owner=visibleBatch,epoch=confirmationEpoch.current;try{assertAlertBatchCurrent(owner.plan,latest.current.alerts,batchTime(owner));if(!preparedCurrent(owner))visibleBatch=null;}catch(error){
    if(confirmation.current===owner&&confirmationEpoch.current===epoch){confirmation.current=null;confirmationEpoch.current++;batchNotice.current=error instanceof Error?error.message:String(error);}visibleBatch=null;
  }}
  useEffect(()=>{
    const request=listFallback.current,expected=request?.kind==='Alerts'?managerList:historyList;
    if(!request||request.view!==expected||request.opening!==navigationToken)return;listFallback.current=null;
    const current=()=>active()&&!contextRequest&&latest.current.tab===request.kind&&listView(request.kind)===request.view&&request.view.key===(request.kind==='Alerts'?managerView.current.token:navigationOpening.current.token)&&navigationOpening.current.token===request.opening&&!menuOwner.current&&!confirmation.current;
    if(!current()||request.node.isConnected||document.activeElement!==request.node&&document.activeElement!==document.body&&document.activeElement!==dialog.current&&!!document.activeElement)return;
    const target=(request.kind==='Alerts'?searchInput.current:historyTab.current)??closeButton.current;
    if(!target?.isConnected||!dialog.current?.contains(target))return;target.focus();current();
  },[managerList,historyList,navigationToken,open,tab]);
  useEffect(()=>{
    if(!visibleMenu)return;const owner=visibleMenu;
    const outside=(event:PointerEvent)=>{if(menuOwner.current!==owner)return;const element=menuElement.current?.owner===owner?menuElement.current.node:null;if(!element?.contains(event.target as Node))dismissMenu(owner);};
    document.addEventListener?.('pointerdown',outside,true);return()=>document.removeEventListener?.('pointerdown',outside,true);
  },[visibleMenu]);
  useEffect(()=>{
    const request=pendingFocus.current;if(!request||!active())return;pendingFocus.current=null;
    try{
      if(request.kind==='batch'){if(!preparedCurrent(request.owner)||!focusAllowed(request.from))return;if(confirmationElement.current?.owner===request.owner)confirmationElement.current.node.querySelector<HTMLButtonElement>('button')?.focus();return;}
      if(request.kind==='batch-result'){const receipt=request.receipt;try{if(!receiptCurrent(receipt)||!focusAllowed(receipt.from))return;(searchInput.current??closeButton.current)?.focus();}finally{receipt.awaitingFocus=false;releaseBatchReceipt(receipt);}return;}
      if(request.kind==='menu'){assertMenu(request.owner);const element=menuElement.current?.owner===request.owner?menuElement.current.node:null;(element?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')??element)?.focus();assertMenu(request.owner);return;}
      if(request.kind==='edit'){if(latest.current.tab!=='Create'||latest.current.editing!==request.id||draftGeneration.current!==request.generation||!focusAllowed(request.from))return;dialog.current?.querySelector<HTMLInputElement>('[aria-label="Alert name"]')?.focus();return;}
      if(request.kind==='delete'){if(confirmation.current!==request.owner||!focusAllowed(request.from))return;currentVisibleAlert({definition:{id:request.owner.id},revision:request.owner.revision} as LocalAlert,request.owner.view);if(confirmationElement.current?.owner===request.owner)confirmationElement.current.node.querySelector<HTMLButtonElement>('button')?.focus();return;}
      if(request.kind==='create-cancelled'){if(latest.current.tab!=='Alerts'||confirmation.current||menuOwner.current||!focusAllowed(request.from))return;(searchInput.current??closeButton.current)?.focus();return;}
      if(request.kind==='deleted'){if(latest.current.tab!=='Alerts'||historyOpening.current.token!==request.opening||confirmation.current||menuOwner.current||!focusAllowed(request.from))return;(searchInput.current??closeButton.current)?.focus();return;}
      if(latest.current.tab!=='Alerts'||managerView.current.token!==request.view||!focusAllowed(request.from))return;
      const target=request.trigger?.isConnected&&dialog.current?.contains(request.trigger)?request.trigger:searchInput.current??closeButton.current;
      if(request.selection){
        const selected=request.selection;if(managerNavigation.current!==selected.view||selectionRef.current!==selected.state||!selected.state.enabled||navigationOpening.current.token!==selected.opening||interactionEpoch.current!==selected.interaction)return;
        const binding=target&&rowBindings.current.get(target);
        if(binding){if(!bindingCurrent(binding))return;focusSelection(selected.view,selected.state,binding,binding);return;}
        const control=target&&controlBindings.current.get(target),preservedDelete=confirmation.current?.kind==='row'&&control?.key.startsWith('more:')&&!!target&&selectionControlCurrent(control.key,target);
        if(!selectionCurrent(selected.view,selected.state)&&!preservedDelete)return;
      }
      target?.focus();assertManagerView(request.view);
    }catch{/* Focus callbacks cannot revive an invalidated menu or confirmation. */}
  },[visibleMenu,visibleConfirmation,visibleBatch,tab,editing,viewToken,draft]);
  // A drawing source chosen before its choices arrived (the toolbar, the menu, Alt+A) still gets a condition
  // its shape takes. Only an incompatible condition is changed, so a user's choice stays.
  useEffect(()=>{if(editing||!open||!formDrawingShape)return;const preset={shape:formDrawingShape,symbol:instrument.symbol,name:drawingSourceName(formChoice?.source),previousName:null};setDraft(current=>drawingAlertDraft(current,preset));},[formDrawingShape,selectedSourceId,editing,open]);
  /** A new alert opens with focus in its first field (as the reference), not on the close button.
   * Runs once per create entry, unless the user already moved focus to another control inside the dialog. */
  const createFocused=useRef<unknown>(null),closeButton=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{
    if(!open||tab!=='Create'||editing!==null){if(!open||tab!=='Create')createFocused.current=null;return;}
    const key=createRequest??contextRequest??'create';if(createFocused.current===key)return;createFocused.current=key;
    const place=(late:boolean)=>{const root=dialog.current;if(!root)return;const active=document.activeElement;
      // The late pass only corrects focus an outer opener put on the close button; anything else is the user's or the dialog focus fallback's.
      if(late?active!==closeButton.current:active&&active!==document.body&&active!==root&&active!==closeButton.current&&active.isConnected&&root.contains(active))return;
      [...root.querySelectorAll<HTMLInputElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')].find(node=>node.type!=='checkbox'&&node.type!=='hidden'&&node.type!=='search')?.focus();};
    place(false);const timer=setTimeout(()=>place(true),0);return()=>clearTimeout(timer);
  },[open,tab,editing,createRequest,contextRequest]);
  const expiry=alertExpiryView(draftExpiry(draft),clock.zone);let expiryChoices:number[]=[];
  if(draft.expirationEnabled&&expiry.edited)try{expiryChoices=alertExpiryCandidates(expiry.value,expiry.zone);}catch{/* Strict errors are shown on submission; incomplete text remains editable. */}
  if (!open) return deliveryHost ? <>{deliveryHost}{null}</> : null;
  const modal = <div className="modal-shade" onMouseDown={event => event.stopPropagation()}><div className="settings-modal lv-alert-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="local-alert-title" tabIndex={-1} onKeyDownCapture={()=>clearGestures()} onKeyDown={event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault();event.stopPropagation();if(menuOwner.current){dismissMenu(menuOwner.current,true);return;}if(contextRequest){finish('cancelled');return;}if(visibleConfirmation)cancelDelete(visibleConfirmation);else if(visibleBatch)cancelSelected(visibleBatch);else if(tab==='Alerts'&&selectionRef.current?.selectedIds.length)installSelection(managerList,selectionRef.current,{kind:'clear'});else if(tab==='History'&&historySelection.ids.length)setHistorySelectionState(EMPTY_ALERT_HISTORY_SELECTION);else if(tab==='Create')cancelCreate();else finish('cancelled'); }
    if (event.key === 'Tab') {if(menuOwner.current){event.preventDefault();event.stopPropagation();dismissMenu(menuOwner.current,false,event.shiftKey?-1:1);return;}const targets=focusable(),first=targets[0],last=targets.at(-1);if(trapTabFromDialog(event,dialog.current,targets))return;if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  }}>
    <style>{`.lv-alert-dialog .alert-content{padding:18px 22px;overflow:auto;flex:1;min-height:0}.lv-alert-dialog nav{display:flex;gap:8px;padding:12px 22px;border-bottom:1px solid var(--lv-border)}.lv-alert-dialog nav button,.lv-alert-dialog .alert-row button{padding:7px 11px}.lv-alert-dialog .alert-form{display:flex;flex-direction:column;gap:15px;max-width:640px;margin-top:20px}.lv-alert-dialog .alert-form-title{display:block;font-size:15px;line-height:1.4}.lv-alert-dialog .alert-form label,.lv-alert-dialog .alert-content>label{display:grid;grid-template-columns:120px minmax(0,1fr);align-items:center;gap:12px}.lv-alert-dialog .alert-form label input:not([type=checkbox]),.lv-alert-dialog .alert-form label select,.lv-alert-dialog .alert-content>label select{width:100%;min-width:0;box-sizing:border-box}.lv-alert-dialog .alert-form label>input[type=checkbox]{justify-self:start;margin:0}.lv-alert-dialog .alert-content>label{max-width:640px;margin-bottom:12px}.lv-alert-dialog label[hidden]{display:none}.lv-alert-dialog .alert-content{position:relative;mask-image:linear-gradient(to bottom,#000 calc(100% - 20px),transparent);-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 20px),transparent)}.lv-alert-dialog .alert-info{float:right;position:relative;margin:0 0 4px 8px}.lv-alert-dialog .alert-content:has(>label:not([hidden])>select[aria-label="Technical alert source"])>.alert-info:not([open]){float:none;position:absolute;top:24px;left:calc(22px + 640px + 10px);margin:0}.lv-alert-dialog .alert-info summary{list-style:none;width:20px;height:20px;border-radius:50%;border:1px solid var(--lv-border,#3d3d3d);color:var(--lv-text-secondary,#8c8c8c);font-size:12px;display:flex;align-items:center;justify-content:center;cursor:pointer}.lv-alert-dialog .alert-info[open]{float:none;margin:0 0 12px}.lv-alert-dialog .alert-info[open] summary{margin-bottom:8px}.lv-alert-dialog textarea{width:100%;min-height:80px;background:var(--lv-bg-input);color:inherit;border:1px solid var(--lv-border);padding:9px;border-radius:4px;font:inherit}.lv-alert-dialog .alert-row{border:1px solid var(--lv-border);border-radius:5px;padding:13px;margin:9px 0}.lv-alert-dialog .alert-row strong{font-size:13px}.lv-alert-dialog .alert-row p{color:var(--lv-text-secondary);line-height:1.5;margin:7px 0}.lv-alert-dialog .alert-row small{color:var(--lv-notice-text)}.lv-alert-dialog .alert-state{float:right;font-size:11px;color:var(--lv-accent)}.lv-alert-dialog .alert-note{font-size:11px;color:var(--lv-notice-text);line-height:1.6;margin:0 0 12px}.lv-alert-dialog .alert-filters{margin:16px 0;padding:12px;border:1px solid var(--lv-border);border-radius:5px}.lv-alert-dialog .alert-filter-selectors{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}.lv-alert-dialog .alert-filter-selectors label{display:flex;flex-direction:column;align-items:flex-start;gap:4px}.lv-alert-dialog .alert-filter-selectors select{width:auto;max-width:100%}.lv-alert-dialog .alert-filters>label{align-items:flex-start;flex-direction:column;gap:6px}.lv-alert-dialog .alert-filters>label input{width:100%;max-width:100%}.lv-alert-dialog .alert-actions{display:flex;gap:6px;flex-wrap:wrap}.lv-alert-dialog .alert-row:focus-visible{outline:2px solid var(--lv-accent);outline-offset:2px}.lv-alert-dialog .alert-row-menu{display:flex;flex-direction:column;gap:3px;max-width:250px;margin-top:8px;padding:5px;border:1px solid var(--lv-border-hover);background:var(--lv-bg-input);border-radius:4px}.lv-alert-dialog .alert-row-menu button{text-align:left}.lv-alert-dialog .alert-delete{border:1px solid var(--lv-error-border);background:var(--lv-error-bg);padding:12px;margin-top:10px}.lv-alert-dialog table{width:100%;border-collapse:collapse;font-size:11px}.lv-alert-dialog td,.lv-alert-dialog th{padding:10px;text-align:left;border-bottom:1px solid var(--lv-border)}.lv-alert-dialog output{display:block;color:var(--lv-notice-text);font-size:12px;line-height:1.5}.lv-alert-dialog .alert-condition-row{display:flex;flex-direction:column;gap:15px;border-top:1px solid var(--lv-border);padding-top:12px}.lv-alert-dialog .alert-condition-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.lv-alert-dialog .alert-condition-head strong{font-size:12px;letter-spacing:.04em;color:var(--lv-accent)}.lv-alert-dialog .alert-condition-source{margin:0;color:var(--lv-text-secondary);line-height:1.5}.lv-alert-dialog .alert-condition-add{align-self:flex-start}`}</style>
    <header><h2 id="local-alert-title">{editing?`Edit alert on ${instrument.symbol}`:`Create alert on ${instrument.symbol}`}</h2><button ref={closeButton} aria-label={tab==='Create'?'Close':'Close alerts'} data-lv-destructive="true" onClick={()=>finish('cancelled')}>×</button></header>
    {/* The create/edit flow shows no manager tabs (the Alerts panel has them); the nav returns with the list. */}{!contextRequest&&<nav aria-label="Alert manager tabs" hidden={tab==='Create'} style={tab==='Create'?{display:'none'}:undefined}><button className={tab === 'Alerts' ? 'active' : ''} onClick={()=>perform(()=>{setTab('Alerts');setEditing(null);})}>{compound?<CompoundAlertCount controller={compound} scalarCount={alerts.length}/>:<>Alerts ({alerts.length})</>}</button><button ref={historyTab} className={tab === 'History' ? 'active' : ''} onClick={()=>perform(()=>setTab('History'))}>{compound?<CompoundAlertHistoryCount controller={compound} scalarCount={history.length}/>:<>History ({history.length})</>}</button><button className={tab === 'Create' ? 'active' : ''} onClick={createNew}>Create alert</button></nav>}
    <div className="alert-content"><details className="alert-info"><summary aria-label="About these alerts" title="About these alerts">i</summary><p className="alert-note">Alerts run while OpenCandle is open.</p><p className="alert-note" aria-label="Alert timezone">Alert times use {alertDisplayClockActive()?'the chart timezone':'your system timezone'}: {clock.zone}. CSV uses UTC.</p><p className="alert-note" data-testid="alert-source-basis"><strong>{sourceNote}</strong></p></details>{contextRequest&&<p className="alert-note" aria-label="Clicked alert origin">Alert at {contextRequest.priceText} {instrument.currency}.</p>}
      {(diagnostics.length > 0 || noUsableSource) && <output className="alert-observation-diagnostic" role="status" aria-live="polite">{alertDiagnosticsLine(diagnostics, noUsableSource)}</output>}
      {sourceChoices&&onSourceChange&&<><label hidden={tab!=='Create'}>Source<select aria-label="Technical alert source" value={selectedSourceId??''} disabled={editing!==null} onChange={event=>changeSource(event.target.value)}>{!sourceChoices.some(choice=>choice.id===selectedSourceId)&&<option value={selectedSourceId??''}>{noUsableSource?'No data source':'Choose a source'}</option>}{sourceChoices.filter(choice=>!choice.targetOnly&&(choice.id===selectedSourceId||choice.source&&!choice.disabledReason)).map(choice=><option key={choice.id} value={choice.id} disabled={!choice.source||!!choice.disabledReason}>{choice.label}</option>)}</select></label>{onTargetChange&&<label hidden={tab!=='Create'}>Value<select aria-label="Technical alert target" value={targetSourceId} disabled={editing!==null||!!sourceChoices.find(choice=>choice.id===selectedSourceId)?.position||!!sourceChoices.find(choice=>choice.id===selectedSourceId)?.levels||!!sourceChoices.find(choice=>choice.id===selectedSourceId)?.constantOnly} onChange={event=>changeSource(event.target.value,true)}><option value="constant">Constant value</option>{sourceChoices.filter(choice=>!choice.constantOnly&&choice.source?.kind!=='comparison'&&(choice.id===targetSourceId||choice.source&&!choice.disabledReason)).map(choice=><option key={choice.id} value={choice.id} disabled={!choice.source||!!choice.disabledReason}>{choice.label}</option>)}</select></label>}</>}
      {onPriceSourceChange && <label hidden={tab!=='Create'}>Price source<select aria-label="Alert price source" value={priceSource} disabled={editing !== null} onChange={event=>perform(()=>{retireSelection();onPriceSourceChange(event.target.value as PriceSource);})}>{[['open', 'Open'], ['high', 'High'], ['low', 'Low'], ['close', 'Close'], ['hl2', 'HL2'], ['hlc3', 'HLC3'], ['ohlc4', 'OHLC4']].map(([field, label]) => <option key={field} value={field}>{label}</option>)}</select></label>}
      {context?.mode === 'replay' && onReplayAssumeCompletionChange && <label><input aria-label="Simulate completed rows in replay" type="checkbox" checked={replayAssumeCompletion} disabled={editing !== null} onChange={event=>perform(()=>{retireSelection();pinnedContext.current=null;captureRequested.current=true;onReplayAssumeCompletionChange(event.target.checked);})}/>Simulate completed rows in replay</label>}
            {onRequestObservation && <details><summary>More</summary><p><button disabled={!context||evaluationPending} onClick={()=>perform(()=>{onRequestObservation();if(active())setMessage('Checking alerts against the current data.');})}>{evaluationPending?'Checking…':'Check alerts now'}</button></p></details>}
      {tab==='Alerts' && matchingAlerts.some(alert => !!context && !inCurrentSession(alert)) && <details><summary>Alerts for other sessions</summary>{matchingAlerts.filter(alert => !inCurrentSession(alert)).map(alert => <p key={alert.definition.id}>{alert.definition.name} <button disabled={alert.definition.instrumentId !== context?.instrumentId} onClick={() => rearm(alert)}>Restart</button></p>)}</details>}
      {tab === 'Alerts' && <><section className="alert-filters" aria-label="Filter saved alerts" onKeyDown={event=>{if(event.key!=='Escape'&&event.key!=='Tab')event.stopPropagation();if(event.key==='Enter'&&!event.nativeEvent.isComposing)event.preventDefault();}}>
        <label>Search alerts<input ref={searchInput} type="search" aria-label="Search alerts" value={managerFilter.query} aria-invalid={!!filterError} aria-describedby={filterError?'alert-filter-error':undefined} placeholder="Name, symbol, message or saved source" onChange={event=>updateManagerFilter({...managerFilter,query:event.target.value})}/></label>
        <div className="alert-filter-selectors">
          <label>Status<select aria-label="Alert status filter" value={managerFilter.status} onChange={event=>updateManagerFilter({...managerFilter,status:event.target.value as AlertManagerFilter['status']})}>{[['all','All statuses'],['active','Active'],['paused','Paused'],['stopped','Stopped'],['expired','Expired'],['waiting-for-data','Waiting for data']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>Source type<select aria-label="Alert source type filter" value={managerFilter.sourceType} onChange={event=>updateManagerFilter({...managerFilter,sourceType:event.target.value as AlertManagerFilter['sourceType']})}>{[['all','All sources'],['price','Price'],['indicator','Indicator'],['drawing','Drawing'],['comparison','Comparison'],['legacy','Legacy']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>Mode<select aria-label="Alert mode filter" value={managerFilter.mode} onChange={event=>updateManagerFilter({...managerFilter,mode:event.target.value as AlertManagerFilter['mode']})}>{[['all','All modes'],['ordinary','Ordinary'],['replay','Replay']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <button type="button" onClick={()=>updateManagerFilter({...DEFAULT_ALERT_MANAGER_FILTER},true)}>Clear filters</button>
        </div>
        <div className="alert-filter-selectors">
          <label>Sort by<select aria-label="Sort alerts by" value={managerSort.key} aria-invalid={!!sortError} onChange={event=>updateManagerSort({...managerSort,key:event.target.value as AlertManagerSort['key']})}>{[['original','Original order'],['ticker','Ticker'],['name','Name'],['message','Message'],['created','Date created'],['triggered','Time triggering']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>Direction<select aria-label="Alert sort direction" value={managerSort.direction} disabled={managerSort.key==='original'} aria-invalid={!!sortError} onChange={event=>updateManagerSort({...managerSort,direction:event.target.value as AlertManagerSort['direction']})}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
          <button type="button" onClick={()=>updateManagerSort({...DEFAULT_ALERT_MANAGER_SORT})}>Reset sort</button>
        </div>
                <p aria-label="Matching alerts" aria-live="polite">{matchingAlerts.length} of {alerts.length} alerts</p>
        {filterError&&<p id="alert-filter-error" role="alert">{filterError} Correct the filter or choose Clear filters.</p>}
        {sortError&&<p role="alert">{sortError} Choose Reset sort to restore the saved order.</p>}
      </section>
      <div role="group" aria-label="Selected alert actions" className="alert-actions">
        <span role="status" aria-label="Selected alert count">{selection.selectedIds.length} selected</span>
        <button type="button" ref={selectionControlRef('all')} disabled={!selection.enabled||!managerList.items.length||!!confirmation.current||!!menuOwner.current} onClick={event=>selectFromControl(managerList,selection,{kind:'all'},'all',event)}>Select all shown</button>
        <button type="button" ref={selectionControlRef('clear')} disabled={!selection.selectedIds.length||!!confirmation.current||!!menuOwner.current} onClick={event=>selectFromControl(managerList,selection,{kind:'clear'},'clear',event)}>Clear selection</button>
        {(['pause','resume','delete','clone'] as const).map(action=><button type="button" key={action} ref={selectionControlRef(action)} disabled={!selection.enabled||!selection.selectedIds.length||!!confirmation.current||!!menuOwner.current||!batchAuthorityPresent(currentBatchAuthority)} onClick={event=>prepareSelected(action,managerList,selection,action,event)}>{selectedActionLabel(action)}</button>)}
      </div>
      {!batchAuthorityPresent(currentBatchAuthority)&&<p className="alert-note">Selected alert actions are unavailable until the local source is ready.</p>}
      {batchNotice.current&&<p role="status">{batchNotice.current}</p>}
      {visibleBatch&&<div className="alert-delete" role={visibleBatch.plan.action==='delete'?'alertdialog':'region'} aria-label={visibleBatch.plan.action==='delete'?'Delete selected local alerts':'Selected alert action preview'} ref={node=>{if(node&&confirmation.current===visibleBatch)confirmationElement.current={owner:visibleBatch,node};else if(!node&&confirmationElement.current?.owner===visibleBatch)confirmationElement.current=null;}}>
        <p>{visibleBatch.plan.selectedCount} selected; {visibleBatch.plan.eligibleIds.length} eligible; {visibleBatch.plan.unchanged.length} unchanged.</p>
        <p>{visibleBatch.names.join(', ')}{visibleBatch.plan.selectedCount>visibleBatch.names.length?` and ${visibleBatch.plan.selectedCount-visibleBatch.names.length} more`:''}</p>
        {visibleBatch.plan.action==='delete'?<p>Delete these alerts and {visibleBatch.plan.removedHistoryCount} retained local trigger records?</p>:visibleBatch.plan.action==='clone'?<p>Create {visibleBatch.plan.eligibleIds.length} cop{visibleBatch.plan.eligibleIds.length===1?'y':'ies'} with new identities? Each copy keeps its saved source, condition, frequency, expiration, message and notifications, starts a new active lifecycle and does not copy trigger history. Originals are unchanged. This is an OpenCandle clone policy.</p>:<p>Saved sources and trigger history are retained. Resume begins new crossing history and does not reconstruct missed observations.</p>}
        {visibleBatch.plan.unchanged.length>0&&<ul>{Array.from(new Set(visibleBatch.plan.unchanged.map(item=>item.reason))).map(reason=><li key={reason}>{reason.replaceAll('-',' ')}: {visibleBatch!.plan.unchanged.filter(item=>item.reason===reason).length}</li>)}</ul>}
        <button type="button" onClick={()=>cancelSelected(visibleBatch!)}>Cancel</button><button type="button" disabled={!visibleBatch.plan.eligibleIds.length} onClick={()=>applySelected(visibleBatch!)}>{visibleBatch.plan.action==='delete'?'Confirm delete selected':visibleBatch.plan.action==='pause'?'Apply pause':visibleBatch.plan.action==='clone'?'Apply clone':'Apply resume'}</button>
      </div>}
      <p id="alert-manager-keyboard-hint" style={srOnly}>Use checkboxes or Ctrl/Cmd-click to select alerts. Shift-click selects a range. Focus a row, then use Shift+Up/Down to extend selection or Ctrl/Cmd+A to select shown alerts. Arrow keys and Space move focus; Shift+Space moves back. Selected-row menus act on the selection.</p>{managerList.ambiguous&&<p role="alert">Alert row identities are ambiguous. Keyboard navigation is unavailable; saved alerts are unchanged.</p>}{alerts.length>0&&matchingAlerts.length===0&&!filterError&&!sortError&&<p>No alerts match these filters. Change the search or choose Clear filters.</p>}{alerts.length === 0 && <p>No local alerts. Choose Create alert to add one for {instrument.symbol}.</p>}{matchingAlerts.map(alert => {
        const invalidDrawing=invalidDrawings?.get(alert.definition.id),rowStatus=invalidDrawing?'Invalid':STATUS_LABELS[alert.status]??alert.status;
        const ownConfirmation=visibleConfirmation?.id===alert.definition.id?visibleConfirmation:null,ownMenu=visibleMenu?.row.definition.id===alert.definition.id?visibleMenu:null;
        return <article className="alert-row" key={alert.definition.id} data-alert-id={alert.definition.id} tabIndex={0} aria-label={`Alert ${alert.definition.name}, ${alert.definition.mode}, ${invalidDrawing?'Invalid':alert.status}`} aria-describedby="alert-manager-keyboard-hint" ref={listRef('Alerts',managerList,alert.definition.id)} onFocus={event=>listFocus('Alerts',managerList,alert.definition.id,event)} onBlur={listBlur}
          onPointerDown={event=>pointerDown(managerList,alert.definition.id,event)} onPointerUp={releasePointer} onPointerCancel={()=>clearGestures()}
          onClick={event=>listClick('Alerts',managerList,alert.definition.id,event)}
          onDoubleClick={event=>{if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||(event.nativeEvent as MouseEvent & {isComposing?:boolean})?.isComposing||!alertListBackground(event.target))return;event.preventDefault();event.stopPropagation();beginEdit(alert);}}
          onContextMenu={event=>contextMenuRow(alert,event)}
          onKeyDown={event=>{if(selectionKey(managerList,alert.definition.id,event)||listKey('Alerts',managerList,alert.definition.id,event))return;if(event.defaultPrevented||event.nativeEvent.isComposing||event.ctrlKey||event.metaKey||event.altKey||!alertListBackground(event.target)||document.activeElement!==event.currentTarget||!listNodeCurrent('Alerts',managerList,alert.definition.id,event.currentTarget)||!(event.key==='ContextMenu'&&!event.shiftKey||event.key==='F10'&&event.shiftKey))return;event.preventDefault();event.stopPropagation();openMenu(alert,event.currentTarget);}}>
          <input type="checkbox" aria-label={`Select alert ${alert.definition.name}`} ref={selectionControlRef('row:'+alert.definition.id)} checked={isAlertSelected(selection,managerList,alert.definition.id)} disabled={!selection.enabled||!!confirmation.current||!!menuOwner.current} onChange={event=>selectFromControl(managerList,selection,{kind:'toggle',id:alert.definition.id},'row:'+alert.definition.id,event)}/><strong>{alert.definition.name}</strong><span className="alert-state">{rowStatus}{!inCurrentSession(alert)&&context?' (other session)':''}</span><p>{alertRowSummary(alert,instrument,sourceChoices)}</p>{invalidDrawing&&<p className="alert-invalid-drawing">{invalidDrawing}</p>}{alert.definition.message&&<p>{alert.definition.message}</p>}<small>{alert.definition.expiresAt === null ? 'No expiration' : `Expires ${formatAlertTime(alert.definition.expiresAt,clock)}`} · {describeAlertDelivery(alertDeliveryFor(alert.definition))}</small>
          <div className="alert-actions"><button onClick={()=>beginEdit(alert)}>Edit</button><button disabled={alert.status==='stopped'||alert.status==='expired'} onClick={()=>togglePaused(alert)}>{alert.status==='paused'?'Resume':'Pause'}</button><button onClick={()=>beginDelete(alert)}>Delete</button><button type="button" ref={selectionControlRef('more:'+alert.definition.id)} aria-label={`More alert actions for ${alert.definition.name}`} aria-haspopup="menu" aria-expanded={!!ownMenu} onClick={event=>{event.stopPropagation();openMenu(alert,event.currentTarget);}}>More</button></div>
          {ownMenu&&<div className="alert-row-menu" role="menu" tabIndex={-1} aria-label={ownMenu.kind==='selection'?`Actions for ${ownMenu.targets.length} selected alerts`:`Actions for ${alert.definition.name}`} ref={menuRef(ownMenu)} onKeyDown={event=>menuKey(ownMenu,event)}>
            {ownMenu.kind==='selection'?<>{(['pause','resume','delete','clone'] as const).map(action=><button type="button" role="menuitem" tabIndex={-1} key={action} ref={selectionControlRef('menu:'+action)} disabled={!batchAuthorityPresent(ownMenu.authority)||!!ownMenu.blockingDelete} onClick={event=>prepareMenuSelected(ownMenu,action,event)}>{selectedActionLabel(action)}</button>)}{!batchAuthorityPresent(ownMenu.authority)&&<p>Selected actions are unavailable for this source.</p>}{ownMenu.blockingDelete&&<p>Finish the open alert deletion before acting on selected alerts.</p>}</>:<>
            <button type="button" role="menuitem" tabIndex={-1} onClick={()=>menuAction(ownMenu,'edit')}>Edit</button>
            <button type="button" role="menuitem" tabIndex={-1} disabled={alert.status==='stopped'||alert.status==='expired'} title={alert.status==='stopped'||alert.status==='expired'?'Stopped or expired alerts cannot resume from this menu.':undefined} onClick={()=>menuAction(ownMenu,'toggle')}>{ownMenu.status==='paused'?'Resume':'Pause'}</button>
            <button type="button" role="menuitem" tabIndex={-1} onClick={()=>menuAction(ownMenu,'delete')}>Delete</button>
            </>}
          </div>}
          {ownConfirmation&&<div className="alert-delete" role="alertdialog" aria-label="Delete local alert" ref={node=>{if(node&&confirmation.current===ownConfirmation)confirmationElement.current={owner:ownConfirmation,node};else if(!node&&confirmationElement.current?.owner===ownConfirmation)confirmationElement.current=null;}}><p>Delete this alert and its local trigger history?</p><button onClick={()=>cancelDelete(ownConfirmation)}>Cancel</button><button onClick={()=>confirmDelete(ownConfirmation)}>Confirm delete</button></div>}
        </article>;
      })}</>}
      {tab === 'History' && <><button type="button" onClick={exportHistory} disabled={history.length===0||!!(historyExport&&exportInFlight.current===historyExport)||typeof window==='undefined'||!window.lv}>Export alert history CSV</button><p id="alert-history-keyboard-hint" style={srOnly}>Focus a recorded row, then use arrow keys or Space to move. Shift+Space moves back. This does not change the chart or export.</p><div role="group" aria-label="Selected history events" className="alert-actions"><span role="status" aria-label="Selected history event count">{historySelection.ids.length} of {history.length} events selected</span><button type="button" disabled={!historySelection.ids.length} onClick={()=>perform(()=>{if(latest.current.tab==='History')setHistorySelectionState(EMPTY_ALERT_HISTORY_SELECTION);})}>Clear event selection</button></div>{historyList.ambiguous&&<p role="alert">History row identities are ambiguous. Keyboard navigation is unavailable; retained history is unchanged.</p>}{history.length === 0 ? <p>No local alert triggers recorded.</p> : <table><thead><tr><th>Time</th><th>Alert</th><th>Value</th><th>Message</th></tr></thead><tbody>{history.map(item => <tr key={item.id} className="alert-history-row" data-alert-history-id={item.id} tabIndex={0} aria-label={`Recorded alert ${item.name}, ${formatAlertAccessibleTime(item.at,clock)}, ${item.mode}`} aria-describedby="alert-history-keyboard-hint" ref={listRef('History',historyList,item.id)} onFocus={event=>listFocus('History',historyList,item.id,event)} onBlur={listBlur} aria-selected={isAlertHistorySelected(historySelection,item.id)} style={isAlertHistorySelected(historySelection,item.id)?{background:'var(--lv-selected)'}:undefined} onClick={event=>{if(historyClick(item.id,event))return;listClick('History',historyList,item.id,event);}} onKeyDown={event=>{if(historyKey(item.id,event))return;listKey('History',historyList,item.id,event);}}><td>{formatAlertTime(item.at,clock)}</td><td>{syntheticAlertIds.has(item.alertId)?'SYNTHETIC ':''}{item.name}</td><td>{item.value}</td><td>{item.message}</td></tr>)}</tbody></table>}</>}
      {tab === 'Create' && <form className="alert-form" id="local-alert-form" onSubmit={event => { event.preventDefault(); save(); }}>{hasNyseAlertCalculation(context?.binding.source)&&<p className="alert-note">{qualifiedSourceNote(context!.binding.source)}</p>}{!editing&&context?.binding.schemaVersion===2&&<p hidden={!!pinnedContext.current&&sameAlertBinding(pinnedContext.current,context.binding)}>The source changed. <button type="button" disabled={evaluationPending} onClick={()=>{try{manual();validateCurrentSource?.(context.binding);pinnedContext.current=structuredClone(context.binding);captureRequested.current=false;rawCapture.current=false;setMessage('Now using the updated source.');}catch(error){setMessage(plainError(error));}}}>Use updated source</button></p>}<label>Alert name<input aria-label="Alert name" value={draft.name} maxLength={200} onChange={event => set('name', event.target.value)}/></label>{formPosition?<><p aria-label="Position alert levels"><strong>Long/Short position alert</strong><br/>{describePosition(formPosition)}</p></>:<>{formLevels&&<p aria-label="Fib alert levels"><strong>Active level crossing</strong><br/>{describeAlertLevels(formLevels)}</p>}{!formLevels&&<><label>Condition<select aria-label="Alert condition" value={draft.kind} onChange={event => set('kind', event.target.value as AlertConditionKind)}>{[['crossing', 'Crossing'], ['crossing-up', 'Crossing up'], ['crossing-down', 'Crossing down'], ['greater', 'Greater than'], ['less', 'Less than'], ['inside', 'Inside channel'], ['outside', 'Outside channel'], ['entering', 'Entering channel'], ['exiting', 'Exiting channel'], ['moving-up', 'Moving up'], ['moving-down', 'Moving down']].filter(([id])=>formDrawingShape==='channel'?(CHANNEL_ALERT_KINDS as readonly string[]).includes(id):formDrawingShape==='time'?id==='crossing-up':!comparison||['crossing','crossing-up','crossing-down','greater','less'].includes(id)).map(([id, label]) => <option key={id} value={id}>{formDrawingShape==='time'?'Reaching the line':label}</option>)}</select></label>
        {formDrawingShape==='channel'?<p data-lv-drawing-channel="">The channel is the area between the drawing's lines, and it follows the drawing when you move it.</p>:formDrawingShape==='time'?<p data-lv-drawing-time="">Fires on the first bar at or after the vertical line's time, and follows the line when you move it.</p>:['inside', 'outside', 'entering', 'exiting'].includes(draft.kind) ? <><label>Lower<input aria-label="Alert lower bound" type="number" step="any" value={draft.lower} onChange={event => set('lower', event.target.value)}/></label><label>Upper<input aria-label="Alert upper bound" type="number" step="any" value={draft.upper} onChange={event => set('upper', event.target.value)}/></label></> : ['moving-up', 'moving-down'].includes(draft.kind) ? <><label>Movement<input aria-label="Alert movement" type="number" min="0" step="any" value={draft.amount} onChange={event => set('amount', event.target.value)}/></label><label>Bars<input aria-label="Alert movement bars" type="number" min="1" max="10000" step="1" value={draft.bars} onChange={event => set('bars', event.target.value)}/></label><label>Percent movement<input type="checkbox" checked={draft.percent} onChange={event => set('percent', event.target.checked)}/></label></> : comparison?<p>Compares the first source with the second.</p>:<label>Level<input aria-label="Alert level" type="number" step="any" value={draft.value} onChange={event => set('value', event.target.value)}/></label>}</>}
        {conditionRows.map((row,index)=>{const n=index+2,rowComparison=row.member?row.member.kind==='comparison':row.selection!.targetId!=='constant',kinds=ALERT_CONDITION_KINDS.filter(([id])=>!rowComparison||['crossing','crossing-up','crossing-down','greater','less'].includes(id));return <div key={index} className="alert-condition-row" role="group" aria-label={`Condition ${n}`}>
          <div className="alert-condition-head"><strong>AND</strong>{row.selection&&<button type="button" aria-label={`Remove condition ${n}`} onClick={()=>removeCondition(index)}>Remove</button>}</div>
          {row.member?<p className="alert-condition-source" aria-label={`Condition ${n} source`}>{row.member.kind==='comparison'?`${technicalSourceLabel(row.member.left)} compared with ${technicalSourceLabel(row.member.right)}`:technicalSourceLabel(row.member)}</p>:<>
           <label>Source<select aria-label={`Condition ${n} source`} value={row.selection!.sourceId} onChange={event=>setConditionSelection(index,{sourceId:event.target.value})}>{!conditionChoices.some(choice=>choice.id===row.selection!.sourceId)&&<option value={row.selection!.sourceId}>Choose a source</option>}{conditionChoices.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}{conditionRefusals.map(choice=><option key={choice.id} value={choice.id} disabled title={choice.reason}>{choice.label} (separate alert only)</option>)}</select></label>
           <label>Value<select aria-label={`Condition ${n} target`} value={row.selection!.targetId} onChange={event=>setConditionSelection(index,{targetId:event.target.value})}><option value="constant">Constant value</option>{row.selection!.targetId!=='constant'&&!conditionChoices.some(choice=>choice.id===row.selection!.targetId)&&<option value={row.selection!.targetId}>Choose a source</option>}{conditionChoices.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label></>}
          <label>Condition<select aria-label={`Condition ${n} operator`} value={row.draft.kind} onChange={event=>setConditionDraft(index,{kind:event.target.value as AlertConditionKind})}>{kinds.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          {['inside','outside','entering','exiting'].includes(row.draft.kind)?<><label>Lower<input aria-label={`Condition ${n} lower bound`} type="number" step="any" value={row.draft.lower} onChange={event=>setConditionDraft(index,{lower:event.target.value})}/></label><label>Upper<input aria-label={`Condition ${n} upper bound`} type="number" step="any" value={row.draft.upper} onChange={event=>setConditionDraft(index,{upper:event.target.value})}/></label></>:['moving-up','moving-down'].includes(row.draft.kind)?<><label>Movement<input aria-label={`Condition ${n} movement`} type="number" min="0" step="any" value={row.draft.amount} onChange={event=>setConditionDraft(index,{amount:event.target.value})}/></label><label>Bars<input aria-label={`Condition ${n} movement bars`} type="number" min="1" max="10000" step="1" value={row.draft.bars} onChange={event=>setConditionDraft(index,{bars:event.target.value})}/></label><label>Percent movement<input aria-label={`Condition ${n} percent movement`} type="checkbox" checked={row.draft.percent} onChange={event=>setConditionDraft(index,{percent:event.target.checked})}/></label></>:rowComparison?<p className="alert-condition-source">Compares the source with the second source.</p>:<label>Level<input aria-label={`Condition ${n} level`} type="number" step="any" value={row.draft.value} onChange={event=>setConditionDraft(index,{value:event.target.value})}/></label>}
         </div>;})}
        {onConditionSelectionsChange&&editing===null&&!contextRequest&&<><button type="button" className="alert-condition-add" aria-label="Add condition" disabled={!!addConditionRefusal||1+conditionRows.length>=ALERT_GROUP_CONDITION_LIMIT} onClick={addCondition}>+ Add condition</button>{addConditionRefusal?<p className="alert-note">{addConditionRefusal}</p>:conditionRows.length>0&&<p className="alert-note">All {1+conditionRows.length} conditions must match on the same bar update. One trigger setting applies to the whole alert.</p>}</>}
        <label>Trigger<select aria-label="Alert frequency" value={draft.frequency} onChange={event => set('frequency', event.target.value as AlertFrequency)}>{[['only-once', 'Only once'], ['once-per-bar', 'Once per bar'], ['once-per-bar-close', 'Once per bar close'], ['once-per-minute', 'Once per minute'], ['every-time', 'Every time']].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></>}<label>Expiration<input type="checkbox" aria-label="Alert expiration enabled" checked={draft.expirationEnabled} onChange={event => set('expirationEnabled', event.target.checked)}/></label>{draft.expirationEnabled && <><label>Expires on ({expiry.zone})<input aria-label="Alert expiration" aria-describedby="alert-expiry-zone-policy" type="datetime-local" value={expiry.value} onChange={event => set('expiresAt', event.target.value)}/></label><span className="alert-expiry-presets" role="group" aria-label="Quick expiration">{ALERT_EXPIRY_PRESETS.map(preset=><button type="button" key={preset.id} aria-label={`Expire in ${preset.label}`} title={`Expire ${preset.label} from now`} onClick={()=>perform(()=>{const next=alertExpiryPreset(readActionTime(),preset.seconds,clock.zone);manual();dirty.current=true;setDraft(current=>({...current,expirationEnabled:true,expiresAt:next.value,expiry:next}));})}>{preset.label}</button>)}</span><p id="alert-expiry-zone-policy" className="alert-note">{expiry.edited&&expiry.zone!==clock.zone?`This expiration is being edited in ${expiry.zone}. The ${alertDisplayClockActive()?'chart':'system'} timezone is now ${clock.zone}.`:`Times are in ${expiry.zone}.`}</p>{expiryChoices.length>1&&<label>Repeated time<select aria-label="Alert expiration occurrence" value={expiry.choice??''} onChange={event=>perform(()=>set('expiry',event.target.value===''?{...draftExpiry(draft),choice:null}:chooseAlertExpiry(draftExpiry(draft),Number(event.target.value))))}><option value="">Choose an occurrence</option>{expiryChoices.map((instant,index)=><option key={instant} value={instant}>{index===0?'First':'Second'}: {formatAlertTime(instant,{...clock,zone:expiry.zone})}</option>)}</select></label>}</>}<label htmlFor="local-alert-message">Message</label><textarea id="local-alert-message" aria-label="Alert message" value={draft.message} maxLength={4000} onChange={event => set('message', event.target.value)}/><AlertPlaceholderPicker textareaId="local-alert-message" value={draft.message} onChange={value => set('message', value)} plotTitles={sourceChoices?.find(choice => choice.id === selectedSourceId)?.plotTitles}/><details><summary>About placeholders</summary><small>{ALERT_MESSAGE_PLACEHOLDER_HELP}</small></details><fieldset className="alert-delivery" aria-label="Alert notifications"><legend>Notifications</legend><label>Show popup<input type="checkbox" aria-label="Alert popup" checked={draft.popup ?? LV_DEFAULT_ALERT_DELIVERY.popup} onChange={event => set('popup', event.target.checked)}/></label><label style={{whiteSpace:'nowrap'}}>Desktop notification<input type="checkbox" aria-label="Alert desktop notification" checked={draft.desktop ?? LV_DEFAULT_ALERT_DELIVERY.desktop} onChange={event => set('desktop', event.target.checked)}/></label><label>Sound<select aria-label="Alert sound" value={draft.sound ?? ''} onChange={event => set('sound', event.target.value as AlertSoundId | '')}><option value="">No sound</option>{ALERT_SOUNDS.map(sound => <option key={sound.id} value={sound.id}>{sound.label}</option>)}</select></label><label>Sound duration<select aria-label="Alert sound duration" disabled={!draft.sound} value={draft.soundRepeat || ''} onChange={event => set('soundRepeat', (Number(event.target.value) || 0) as AlertSoundRepeat | 0)}><option value="">Once</option>{ALERT_SOUND_REPEAT_SECONDS.map(seconds => <option key={seconds} value={seconds}>{ALERT_SOUND_REPEAT_LABELS[seconds]}</option>)}</select></label><p><button type="button" disabled={!draft.sound} onClick={previewSound}>Preview sound</button></p><label>Webhook URL<input type="checkbox" aria-label="Alert webhook" checked={!!draft.webhookEnabled} onChange={event => set('webhookEnabled', event.target.checked)}/></label>{draft.webhookEnabled && <label className="alert-webhook">URL<input type="url" aria-label="Alert webhook URL" placeholder="http://127.0.0.1:8080/alert" maxLength={2048} value={draft.webhook ?? ''} onChange={event => set('webhook', event.target.value)}/></label>}{draft.webhookEnabled && <p className="alert-note">{ALERT_WEBHOOK_LOCAL_ONLY} The message is sent as the request body (JSON when it is valid JSON).</p>}{draft.webhookEnabled && <p className="alert-webhook-test"><button type="button" disabled={!(draft.webhook ?? '').trim() || !!webhookTest?.pending} onClick={sendWebhookTest}>Send test</button>{webhookTest && <span role="status" aria-label="Webhook test result" style={webhookTest.failed?{color:'var(--lv-error-text)'}:undefined}> {webhookTest.text}</span>}</p>}</fieldset></form>}
      {compound&&<CompoundAlertDialogBoundary controller={compound} tab={tab} scalarDraft={draft} sourceChoices={sourceChoices??[]} selectedSourceId={selectedSourceId} managerAuthority={managerActionAuthority} requestKey={createRequest??contextRequest} allowCreate={!contextRequest&&editing===null&&targetSourceId==='constant'&&!onConditionSelectionsChange} filter={managerFilter} sort={managerSort} onSaved={()=>{if(requestedFlow.current&&onSaved){requestedFlow.current=false;dirty.current=false;onSaved(`Alert created on ${instrument.symbol}.`);finish('saved');return;}setTab('Alerts');}}/>}
    </div><footer><output role="status" aria-live="polite" style={{ flex: 1 }}>{message}</output>{tab === 'Create' ? <><button data-lv-destructive="true" onClick={() => {if(contextRequest){finish('cancelled');return;}if(!active())return;cancelCreate();}}>Cancel</button><button className="primary" type="submit" form="local-alert-form" disabled={Boolean(contextRequest&&(!context||evaluationPending||seeded.current!==contextRequest||!pinnedContext.current))}>{editing ? 'Apply alert changes' : 'Create'}</button></> : <button data-lv-destructive="true" onClick={()=>finish('cancelled')}>Close</button>}</footer>
  </div></div>;
  return deliveryHost ? <>{deliveryHost}{modal}</> : modal;
}
