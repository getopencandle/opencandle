import { alertSourceId, sameAlertBinding, validateAlertBinding, validateAlertObservation,alertOperandResult } from './alert-observation';
import type { AlertObservation, AlertObservationBinding } from './alert-observation';
import { validateAlertDelivery, type AlertDeliverySettings } from './alert-delivery';
import { ALERT_POSITION_LEVELS, ALERT_POSITION_PHASES, evaluatePositionStep, positionAlertMessage, validateAlertPosition, type AlertPositionLevel, type AlertPositionLevels, type AlertPositionPhase } from './alert-position';
import { crossedAlertLevel, validateAlertLevels, type AlertLevelSet } from './alert-levels';
import { withScriptAlertMessage } from './script-alert-message';
import { drawingConditionError } from './drawing-alert-rules';

export type AlertConditionKind = 'crossing' | 'crossing-up' | 'crossing-down' | 'greater' | 'less' | 'inside' | 'outside' | 'entering' | 'exiting' | 'moving-up' | 'moving-down' | 'position' | 'level-crossing';
export interface AlertCondition { kind: AlertConditionKind; value?: number; lower?: number; upper?: number; amount?: number; percent?: boolean; bars?: number; position?: AlertPositionLevels; /** The frozen active levels of a Fib retracement (level-crossing only). */ levels?: AlertLevelSet; }
export type AlertFrequency = 'only-once' | 'once-per-bar' | 'once-per-bar-close' | 'once-per-minute' | 'every-time';
export interface AlertDefinition {
  id: string; instrumentId: string; sourceId: string; name: string; message: string; condition: AlertCondition;
  frequency: AlertFrequency; createdAt: number; expiresAt: number | null; mode: 'ordinary' | 'replay'; runId: string;
  maxGapSeconds?: number | null;
  observationBinding?: AlertObservationBinding;
  conditionVersion?:1|2;
  /** An all-conditions alert (binding source kind 'all') holds one condition per captured source, all of which must
   *  match on the same observation; `condition` repeats the first. Absent on every other alert. */
  conditions?: AlertCondition[];
  /** Optional presentation actions. Absent on alerts saved before delivery settings existed. */
  delivery?: AlertDeliverySettings;
}
export interface AlertEvent {
  instrumentId: string; sourceId: string; value: number | null; time: number; availableAt: number; sequence: number;
  barId: string; barClosed: boolean; feedState: 'ready' | 'stale' | 'disconnected'; mode: 'ordinary' | 'replay'; runId: string;
  observation?: AlertObservation;
}
export interface AlertNotification { id: string; alertId: string; name: string; message: string; value: number; at: number; barId: string; sequence: number; mode: 'ordinary' | 'replay'; runId: string; local: true; observation?: AlertObservation; positionLevel?: AlertPositionLevel; }
export interface LocalAlert {
  definition: AlertDefinition; revision: number; armedAt: number; status: 'active' | 'paused' | 'stopped' | 'expired' | 'waiting-for-data';
  lastSequence: number | null; lastTime: number | null; lastValue: number | null;
  closedBars: Array<{ id: string; value: number; /** Every condition's value on this completed bar. */ values?: number[] }>; currentBarId: string | null; previousClosedValue: number | null;
  lastTriggeredBar: string | null; lastTriggeredAt: number | null; missedDataGaps: number; history: AlertNotification[];
  lastObservation?: AlertObservation | null;
  /** An all-conditions alert's crossing baselines, one per condition (absent while cleared). */
  lastValues?: number[];
  previousClosedValues?: number[];
  /** Present only for Long/Short position alerts. */
  positionPhase?: AlertPositionPhase;
}
export interface AlertResult { alert: LocalAlert; notification: AlertNotification | null; diagnostics: string[]; }
export const ALERT_HISTORY_LIMIT=100000;
export const LOCAL_ALERT_NOTICE = 'Alerts run locally while OpenCandle receives usable data. Closing the app, sleep or disconnection can miss triggers. No server, email or SMS delivery is configured. Webhooks post only to this computer (localhost).';
export const ALERT_POLICIES = [LOCAL_ALERT_NOTICE, 'New version 2 crossing includes reaching a level from strictly below or above. Retained version 1 alerts keep their previous strict-crossing and inclusive-channel policy.', 'Version 2 channels use strict interior and exterior. Equal boundary values are neither; entering/exiting requires movement from the opposite strict region. This local boundary policy still needs reference comparison.', 'Once-per-bar-close compares completed bars. Once-per-minute uses a rolling 60 seconds, an OpenCandle policy pending reference comparison.', 'Unavailable data clears crossing baselines. Resuming never invents missed ticks or retroactively reports a crossing.', 'Indicator calculation settings are frozen at creation. Supported line drawings are captured frozen. Long/Short position alerts follow their drawing levels and restart, keeping history, when those levels change.'];
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function validateDefinition(definition: AlertDefinition): void {
  if (!definition || ['id', 'instrumentId', 'sourceId', 'runId'].some(key => typeof definition[key as keyof AlertDefinition] !== 'string' || !(definition[key as keyof AlertDefinition] as string).length || (definition[key as keyof AlertDefinition] as string).length > 500)) throw new Error('Alert, instrument, source and run identities are required.');
  if (typeof definition.name !== 'string' || !definition.name.trim() || definition.name.length > 200 || typeof definition.message !== 'string' || definition.message.length > 4000) throw new Error('Invalid alert name or message.');
  if (!Number.isSafeInteger(definition.createdAt) || definition.createdAt < 0 || definition.expiresAt !== null && (!Number.isSafeInteger(definition.expiresAt) || definition.expiresAt <= definition.createdAt)) throw new Error('Alert expiration must be later than its creation time.');
  if (!['only-once', 'once-per-bar', 'once-per-bar-close', 'once-per-minute', 'every-time'].includes(definition.frequency)) throw new Error('Unsupported alert frequency.');
  if (!['ordinary', 'replay'].includes(definition.mode)) throw new Error('Unsupported alert mode.');
  if(definition.conditionVersion!==undefined&&definition.conditionVersion!==1&&definition.conditionVersion!==2)throw new Error('Unsupported alert condition semantics version.');
  if (definition.delivery !== undefined) validateAlertDelivery(definition.delivery);
  if (definition.observationBinding !== undefined) {
    validateAlertBinding(definition.observationBinding);
    if (definition.sourceId !== alertSourceId(definition.observationBinding.source) || definition.runId !== `${definition.mode}:snapshot:${definition.observationBinding.sessionId}` || JSON.parse(definition.observationBinding.datasetKey)[definition.observationBinding.schemaVersion===2?1:0] !== definition.instrumentId || (definition.mode === 'replay') !== (definition.observationBinding.replayRunId !== null)) throw new Error('Alert definition and observation source binding disagree.');
    if (definition.maxGapSeconds != null) throw new Error('Snapshot sessions own observation continuity. A per-alert maximum gap is unsupported for deduplicated snapshots.');
  }
  if (definition.maxGapSeconds !== undefined && definition.maxGapSeconds !== null && (!finite(definition.maxGapSeconds) || definition.maxGapSeconds < 0)) throw new Error('Maximum gap must be nonnegative or unknown.');
  const condition = definition.condition;
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) throw new Error('Alert condition must be an object.');
  if (['crossing', 'crossing-up', 'crossing-down', 'greater', 'less'].includes(condition.kind)) { if (!finite(condition.value)) throw new Error('Alert level must be finite.'); }
  else if (['inside', 'outside', 'entering', 'exiting'].includes(condition.kind)) { if (!finite(condition.lower) || !finite(condition.upper) || condition.lower > condition.upper) throw new Error('Alert channel requires ordered finite lower and upper bounds.'); }
  else if (['moving-up', 'moving-down'].includes(condition.kind)) { if (!finite(condition.amount) || condition.amount < 0 || !Number.isSafeInteger(condition.bars ?? 1) || (condition.bars ?? 1) < 1 || (condition.bars ?? 1) > 10000 || condition.percent !== undefined && typeof condition.percent !== 'boolean') throw new Error('Movement requires a nonnegative amount and 1 to 10000 bars.'); }
  else if (condition.kind === 'level-crossing') {
    validateAlertLevels(condition.levels);
    // A Fib channel's levels are watched through its own drawing source (the price's ratio in the channel);
    // the condition rule of drawing-alert-rules.ts ties the levels to that drawing.
    const fibChannel = condition.levels?.tool === 'fibchannel';
    if (fibChannel ? definition.observationBinding?.source.kind !== 'drawing-boundary' : definition.observationBinding ? definition.observationBinding.source.kind !== 'price' : definition.sourceId !== 'close') throw new Error(fibChannel ? 'Fib channel level alerts watch the Fib channel drawing itself.' : 'Fib level alerts use one price source. Indicator, drawing and comparison sources are unsupported.');
  }
  else if (condition.kind === 'position') {
    validateAlertPosition(condition.position);
    if (definition.frequency !== 'every-time') throw new Error('Position alerts use their own entry and exit lifecycle; frequency must be every eligible update.');
    if (definition.observationBinding ? definition.observationBinding.source.kind !== 'price' : definition.sourceId !== 'close') throw new Error('Position alerts use one price condition. Indicator, drawing and comparison sources are unsupported.');
  }
  else throw new Error('Unsupported alert condition.');
  if (condition.kind !== 'position' && condition.position !== undefined) throw new Error('Position levels belong only to a position alert.');
  if (condition.kind !== 'level-crossing' && condition.levels !== undefined) throw new Error('Fib levels belong only to a level crossing alert.');
  if(definition.observationBinding?.source.kind==='comparison'&&(!['crossing','crossing-up','crossing-down','greater','less'].includes(condition.kind)||condition.value!==0))throw new Error('Two-series comparisons support crossing or strict greater/less against their signed difference of zero.');
  // A channel takes Entering/Exiting/Inside/Outside (bounds 0 and 1); a vertical line takes Crossing 0.
  const drawingRule=drawingConditionError(definition.observationBinding?.source,condition);if(drawingRule)throw new Error(drawingRule);
  validateGroupConditions(definition);
}
const GROUP_KINDS:readonly AlertConditionKind[]=['crossing','crossing-up','crossing-down','greater','less','inside','outside','entering','exiting','moving-up','moving-down'];
const stable=(value:unknown):string=>Array.isArray(value)?'['+value.map(stable).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().filter(key=>(value as Record<string,unknown>)[key]!==undefined).map(key=>JSON.stringify(key)+':'+stable((value as Record<string,unknown>)[key])).join(',')+'}':JSON.stringify(value);
/** An all-conditions alert has one supported condition per captured source. A comparison condition (one source
 * against another) compares their signed difference with zero, as a single comparison alert does. */
function validateGroupConditions(definition:AlertDefinition):void{
  const source=definition.observationBinding?.source,group=source?.kind==='all'?source:null;
  if(definition.conditions===undefined&&!group)return;
  if(!group)throw new Error('Several conditions need an all-conditions source.');
  const conditions=definition.conditions;
  if(!Array.isArray(conditions)||conditions.length!==group.members.length)throw new Error('An all-conditions alert needs one condition for each of its sources.');
  if(definition.conditionVersion!==2)throw new Error('All-conditions alerts use version 2 condition semantics.');
  conditions.forEach((condition,index)=>{
    const label='Condition '+(index+1);
    if(!condition||typeof condition!=='object'||Array.isArray(condition)||!GROUP_KINDS.includes(condition.kind))throw new Error(label+' is not supported in an all-conditions alert.');
    if(condition.position!==undefined||condition.levels!==undefined)throw new Error(label+' cannot carry drawing levels.');
    if(['crossing','crossing-up','crossing-down','greater','less'].includes(condition.kind)){if(!finite(condition.value))throw new Error(label+' needs a finite value.');}
    else if(['inside','outside','entering','exiting'].includes(condition.kind)){if(!finite(condition.lower)||!finite(condition.upper)||condition.lower>condition.upper)throw new Error(label+' needs ordered finite lower and upper bounds.');}
    else if(!finite(condition.amount)||condition.amount<0||!Number.isSafeInteger(condition.bars??1)||(condition.bars??1)<1||(condition.bars??1)>10000||condition.percent!==undefined&&typeof condition.percent!=='boolean')throw new Error(label+' movement needs a nonnegative amount and 1 to 10000 bars.');
    if(group.members[index].kind==='comparison'&&(!['crossing','crossing-up','crossing-down','greater','less'].includes(condition.kind)||condition.value!==0))throw new Error(label+' compares two sources, so it supports crossing or greater/less only.');
  });
  if(stable(conditions[0])!==stable(definition.condition))throw new Error('The first condition disagrees with the alert condition.');
}
export function createLocalAlert(definition: AlertDefinition): LocalAlert {
  validateDefinition(definition);
  return { definition: structuredClone(definition), revision: 1, armedAt: definition.createdAt, status: 'active', lastSequence: null, lastTime: null, lastValue: null, closedBars: [], currentBarId: null, previousClosedValue: null, lastTriggeredBar: null, lastTriggeredAt: null, missedDataGaps: 0, history: [], ...(definition.condition.kind === 'position' ? { positionPhase: 'waiting-entry' as const } : {}) };
}
function clearBaseline(alert: LocalAlert): void { alert.lastValue = null; alert.previousClosedValue = null; alert.closedBars = []; alert.currentBarId = null; delete alert.lastValues; delete alert.previousClosedValues; }
export function setLocalAlertPaused(alert: LocalAlert, paused: boolean): LocalAlert {
  if (alert.status === 'expired' || alert.status === 'stopped') return alert;
  const next = structuredClone(alert); next.status = paused ? 'paused' : 'active'; clearBaseline(next); return next;
}
export function editLocalAlert(alert: LocalAlert, changes: Partial<Omit<AlertDefinition, 'id' | 'createdAt' | 'mode' | 'runId'>>, now: number): LocalAlert {
  if (!Number.isSafeInteger(now) || now < alert.definition.createdAt) throw new Error('Invalid alert edit time.');
  if (!Number.isSafeInteger(alert.revision) || alert.revision >= Number.MAX_SAFE_INTEGER) throw new Error('Alert revision counter is exhausted. Create a new alert.');
  if (!changes || typeof changes !== 'object' || Object.keys(changes).some(key => !['instrumentId', 'sourceId', 'name', 'message', 'condition', 'conditions', 'frequency', 'expiresAt', 'maxGapSeconds', 'delivery'].includes(key))) throw new Error('Unsupported alert edit field.');
  const definition = { ...alert.definition, ...structuredClone(changes) };
  if (definition.expiresAt !== null && definition.expiresAt <= now) throw new Error('Edited alert expiration must be in the future.');
  const next = createLocalAlert(definition); next.revision = alert.revision + 1; next.armedAt = now; next.history = structuredClone(alert.history); next.missedDataGaps = alert.missedDataGaps; next.lastSequence = alert.lastSequence; next.lastTime = alert.lastTime; return next;
}
/** LV clone policy: copy the saved definition, including its frozen source binding,
 * condition semantics version and delivery settings, under a new identity created now. The copy starts a fresh
 * active lifecycle at revision 1; trigger history, baselines and last-trigger state are not copied. */
export function cloneLocalAlert(alert: LocalAlert, id: string, now: number): LocalAlert {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid alert clone time.');
  if (typeof id !== 'string' || !id.length || id === alert.definition.id) throw new Error('A cloned alert requires a new identity.');
  if (alert.status === 'expired' || alert.definition.expiresAt !== null && alert.definition.expiresAt <= now) throw new Error('An expired alert cannot be cloned. Create a new alert with a future expiry.');
  return createLocalAlert({ ...structuredClone(alert.definition), id, createdAt: now });
}
/** Expiration follows the local evaluation clock even when no new price arrives. No missed observations are generated. */
export function advanceLocalAlertClock(alert: LocalAlert, now: number): LocalAlert {
  if (!Number.isSafeInteger(now) || now < alert.armedAt || alert.lastTime !== null && now < alert.lastTime) throw new Error('Invalid alert clock.');
  return !['expired', 'stopped'].includes(alert.status) && alert.definition.expiresAt !== null && now >= alert.definition.expiresAt ? { ...alert, status: 'expired' } : alert;
}
function conditionMatches(alert: LocalAlert, current: number, previous: number | null): boolean {
  return conditionHolds(alert.definition.condition, alert.definition.conditionVersion === 2, current, previous, bars => alert.closedBars.filter(bar => bar.id !== alert.currentBarId).at(-bars)?.value);
}
/** One condition on one value. `base` reads the completed-bar value `bars` bars back (movement conditions). */
function conditionHolds(condition: AlertCondition, modern: boolean, current: number, previous: number | null, base: (bars: number) => number | undefined): boolean {
  const level = condition.value!;
  const up = previous !== null && (modern?previous<level&&current>=level:previous <= level && current > level), down = previous !== null && (modern?previous>level&&current<=level:previous >= level && current < level);
  if (condition.kind === 'level-crossing') return crossedAlertLevel(condition.levels!, previous, current, modern) !== null;
  if (condition.kind === 'crossing') return up || down;
  if (condition.kind === 'crossing-up') return up;
  if (condition.kind === 'crossing-down') return down;
  if (condition.kind === 'greater') return current > level;
  if (condition.kind === 'less') return current < level;
  const inside = (value: number) => modern?value>condition.lower!&&value<condition.upper!:value >= condition.lower! && value <= condition.upper!;
  const outside=(value:number)=>modern?value<condition.lower!||value>condition.upper!:!inside(value);
  if (condition.kind === 'inside') return inside(current);
  if (condition.kind === 'outside') return outside(current);
  if (condition.kind === 'entering') return previous !== null && outside(previous) && inside(current);
  if (condition.kind === 'exiting') return previous !== null && inside(previous) && outside(current);
  const start = base(condition.bars ?? 1);
  if (!finite(start) || condition.percent && start === 0) return false;
  const move = condition.percent ? 100 * (current - start) / Math.abs(start) : current - start;
  return condition.kind === 'moving-up' ? move >= condition.amount! : move <= -condition.amount!;
}

/** LV wording: a level crossing notification names the level it crossed. */
function levelCrossingMessage(definition: AlertDefinition, previous: number | null, current: number): string {
  const condition = definition.condition;
  if (condition.kind !== 'level-crossing' || !condition.levels) return definition.message;
  const level = crossedAlertLevel(condition.levels, previous, current, definition.conditionVersion === 2);
  return level ? (condition.levels.tool === 'fibchannel' ? `${definition.message} (level ${level.ratio})` : `${definition.message} (level ${level.ratio} at ${level.price})`).slice(0, 4000) : definition.message;
}
export function processAlertEvent(alert: LocalAlert, event: AlertEvent): AlertResult {
  const result = (value: LocalAlert, diagnostics: string[] = [], notification: AlertNotification | null = null): AlertResult => ({ alert: value, notification, diagnostics });
  const definition = alert.definition;
  if (event.instrumentId !== definition.instrumentId || event.sourceId !== definition.sourceId) return result(alert);
  if (event.runId !== definition.runId || event.mode !== definition.mode) return result(alert, ['Alert event belongs to a different ordinary or replay run.']);
  if (!Number.isSafeInteger(event.time) || event.time < alert.armedAt || !Number.isSafeInteger(event.availableAt) || event.availableAt > event.time || !Number.isSafeInteger(event.sequence) || event.sequence < 0 || !event.barId || typeof event.barClosed !== 'boolean' || !['ready', 'stale', 'disconnected'].includes(event.feedState)) return result(alert, ['Invalid or future alert event.']);
  if (event.observation !== undefined || definition.observationBinding !== undefined) {
    try {
      validateAlertObservation(event.observation);
      if(event.observation.schemaVersion===2&&event.value!==alertOperandResult(event.observation.operands!))return result(alert,['Technical event value disagrees with its recorded operands.']);
      if (!definition.observationBinding || !sameAlertBinding(definition.observationBinding, event.observation.binding) || event.observation.observedAt !== event.time || event.availableAt !== event.time || event.barClosed !== (event.observation.completion !== 'unknown') || (event.mode === 'replay') !== (event.observation.kind === 'replay-snapshot')) return result(alert, ['Snapshot source, completion policy or session binding differs. Rearm explicitly for this source.']);
    } catch (error) { return result(alert, [error instanceof Error ? error.message : String(error)]); }
  }
  if (alert.lastSequence !== null && event.sequence <= alert.lastSequence || alert.lastTime !== null && event.time < alert.lastTime) return result(alert, ['Duplicate or out-of-order alert event ignored.']);
  if (event.barId !== alert.currentBarId && alert.closedBars.some(bar => bar.id === event.barId)) return result(alert, ['A previously completed bar cannot be replayed into an active local alert. Start a separate replay run.']);
  if (['stopped', 'expired'].includes(alert.status)) return result(alert);
  const next = structuredClone(alert);
  next.lastSequence = event.sequence; next.lastTime = event.time;
  if (event.observation) next.lastObservation = structuredClone(event.observation);
  if (definition.expiresAt !== null && event.time >= definition.expiresAt) { next.status = 'expired'; return result(next); }
  if (alert.status === 'paused') return result(alert);
  if (event.feedState !== 'ready' || !finite(event.value)) { if (next.status !== 'waiting-for-data') next.missedDataGaps++; next.status = 'waiting-for-data'; clearBaseline(next); return result(next, ['Alert is waiting for usable data; crossing history was cleared.']); }
  const gap = event.observation?.continuity === 'gap' || definition.maxGapSeconds != null && alert.lastTime !== null && event.time - alert.lastTime > definition.maxGapSeconds;
  const correction = event.observation?.correction === true;
  const qualifiedCorrection=correction&&event.observation?.binding.completionPolicy==='nyse-session-observation';
  if (gap || correction) { if (gap) next.missedDataGaps++; clearBaseline(next); }
  next.status = 'active';
  // An all-conditions alert evaluates every condition on its own value from the same observation.
  const conditions = definition.conditions, values = conditions ? event.observation?.operands?.conditions?.map(row => alertOperandResult(row)) : undefined;
  if (conditions && (!values || values.length !== conditions.length || values.some(value => !finite(value)))) return result(alert, ['All-conditions observation has no value for every condition.']);
  if (next.currentBarId !== event.barId) { next.currentBarId = event.barId; next.previousClosedValue = next.closedBars.at(-1)?.value ?? null; if (conditions) { const closed = next.closedBars.at(-1)?.values; if (closed) next.previousClosedValues = [...closed]; else delete next.previousClosedValues; } }
  const previous = definition.frequency === 'once-per-bar-close' ? next.previousClosedValue : next.lastValue;
  const eligible = definition.frequency !== 'once-per-bar-close' || event.barClosed;
  const frequencyAllowed = !['once-per-bar', 'once-per-bar-close'].includes(definition.frequency) || next.lastTriggeredBar !== event.barId;
  const minuteAllowed = definition.frequency !== 'once-per-minute' || next.lastTriggeredAt === null || event.time - next.lastTriggeredAt >= 60;
  const position = definition.condition.kind === 'position' ? definition.condition.position! : null;
  const step = position&&!qualifiedCorrection ? evaluatePositionStep(position, next.positionPhase ?? 'waiting-entry', next.lastValue, event.value) : null;
  const groupMatches = () => { const prior = definition.frequency === 'once-per-bar-close' ? next.previousClosedValues : next.lastValues, completed = next.closedBars.filter(bar => bar.id !== next.currentBarId); return conditions!.every((condition, index) => conditionHolds(condition, true, values![index] as number, prior?.[index] ?? null, bars => completed.at(-bars)?.values?.[index])); };
  const matches = !qualifiedCorrection&&(step ? step.level !== null : eligible && frequencyAllowed && minuteAllowed && (conditions ? groupMatches() : conditionMatches(next, event.value, previous)));
  if (step && !matches) next.positionPhase = step.phase;
  next.lastValue = event.value;
  if (values) next.lastValues = values as number[];
  if (event.barClosed) {
    if (next.closedBars.at(-1)?.id === event.barId) { next.closedBars[next.closedBars.length - 1].value = event.value; if (values) next.closedBars[next.closedBars.length - 1].values = [...values as number[]]; }
    else next.closedBars.push({ id: event.barId, value: event.value, ...(values ? { values: [...values as number[]] } : {}) });
    if (next.closedBars.length > 10001) next.closedBars.splice(0, next.closedBars.length - 10001);
  }
  if (!matches) return result(next, [...(step?.diagnostic ? [step.diagnostic] : []), ...(correction ? ['Corrected source snapshot observed. Crossing history restarted; no market tick was inferred.'] : gap ? ['Data gap observed. No missed ticks were reconstructed.'] : [])]);
  const notification: AlertNotification = { id: `${definition.id}:${definition.runId}:revision-${next.revision}:${event.sequence}`, alertId: definition.id, name: definition.name, message: step && position ? positionAlertMessage(definition.message, position, step.level!, event.value) : withScriptAlertMessage(levelCrossingMessage(definition, previous, event.value), event.observation?.operands?.left.message), value: event.value, at: event.time, barId: event.barId, sequence: event.sequence, mode: definition.mode, runId: definition.runId, local: true };
  if(next.history.length>=ALERT_HISTORY_LIMIT){next.status='paused';clearBaseline(next);return result(next,['Alert history is full, so this alert is paused. Export or clear history, then turn it back on.']);}
  if (event.observation) notification.observation = structuredClone(event.observation);
  if (step) { notification.positionLevel = step.level!; next.positionPhase = step.phase; if (step.phase === 'exited') next.status = 'stopped'; }
  next.lastTriggeredBar = event.barId; next.lastTriggeredAt = event.time; next.history.push(notification);
  if (definition.frequency === 'only-once') next.status = 'stopped';
  return result(next, [], notification);
}

export interface LocalAlertsValidation { ok: boolean; alerts?: LocalAlert[]; errors: string[]; }
export function validateLocalAlerts(input: unknown): LocalAlertsValidation {
  const errors: string[] = [];
  try {
    const pending: Array<{ item: unknown; depth: number }> = [{ item: input, depth: 0 }]; let count = 0,bytes=0;
    while (pending.length) {
      const { item, depth } = pending.pop()!;
      if (++count > 500000 || depth > 40) throw new Error('Alert state exceeds record or nesting limits.');
      if(typeof item==='string'){if(item.length>100000)throw new Error('Alert text exceeds local string limits.');bytes+=new TextEncoder().encode(JSON.stringify(item)).length;if(bytes>20*1024*1024)throw new Error('Alert state exceeds local byte limits.');continue;}
      if (item === null || typeof item === 'boolean') continue;
      if (typeof item === 'number') { if (!finite(item)) throw new Error('Alert state contains nonfinite numbers.'); continue; }
      if(typeof item!=='object')throw new Error('Alert state must contain plain JSON values only.');
      const array=Array.isArray(item);
      if (array?Object.getPrototypeOf(item)!==Array.prototype:![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw new Error('Alert state must contain plain JSON values only.');
      const own=Reflect.ownKeys(item);
      if(array&&(item.length>500000||own.length!==item.length+1))throw new Error('Alert arrays cannot be sparse or contain extra properties.');
      for (const key of own) {
        if(typeof key!=='string')throw new Error('Alert state cannot contain symbol properties.');const descriptor=Object.getOwnPropertyDescriptor(item,key)!;
        if(array&&key==='length')continue;
        if (!Object.hasOwn(descriptor,'value') || !descriptor.enumerable || ['__proto__', 'prototype', 'constructor'].includes(key) || array&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=item.length)) throw new Error('Alert state contains unsafe or hidden properties.');
        bytes+=new TextEncoder().encode(JSON.stringify(key)).length+2;if(bytes>20*1024*1024)throw new Error('Alert state exceeds local byte limits.');
        pending.push({ item: descriptor.value, depth: depth + 1 });
      }
    }
    if (!Array.isArray(input) || input.length > 10000 || new TextEncoder().encode(JSON.stringify(input)).byteLength > 20 * 1024 * 1024) throw new Error('Expected an alert array within local resource limits.');
    const alerts = input as LocalAlert[], ids = new Set<string>(), notificationIds = new Set<string>();
    const nullableFinite = (value: unknown) => value === null || finite(value);
    for (const alert of alerts) {
      validateDefinition(alert.definition);
      if (ids.has(alert.definition.id)) throw new Error('Duplicate alert identity.'); ids.add(alert.definition.id);
      if (!Number.isSafeInteger(alert.revision) || alert.revision < 1 || !Number.isSafeInteger(alert.armedAt) || alert.armedAt < alert.definition.createdAt || !['active', 'paused', 'stopped', 'expired', 'waiting-for-data'].includes(alert.status) || !Number.isSafeInteger(alert.missedDataGaps) || alert.missedDataGaps < 0) throw new Error('Invalid persisted alert lifecycle state.');
      if (alert.lastObservation != null) {
        validateAlertObservation(alert.lastObservation);
        if (!alert.definition.observationBinding || !sameAlertBinding(alert.definition.observationBinding, alert.lastObservation.binding) || alert.lastObservation.observedAt !== alert.lastTime || (alert.definition.mode === 'replay') !== (alert.lastObservation.kind === 'replay-snapshot')) throw new Error('Persisted alert observation belongs to another source, run or clock.');
      }
      if (alert.lastSequence !== null && (!Number.isSafeInteger(alert.lastSequence) || alert.lastSequence < 0) || alert.lastTime !== null && (!Number.isSafeInteger(alert.lastTime) || alert.lastTime < alert.definition.createdAt) || !nullableFinite(alert.lastValue) || !nullableFinite(alert.previousClosedValue) || alert.currentBarId !== null && (typeof alert.currentBarId !== 'string' || !alert.currentBarId) || alert.lastTriggeredBar !== null && (typeof alert.lastTriggeredBar !== 'string' || !alert.lastTriggeredBar) || alert.lastTriggeredAt !== null && (!Number.isSafeInteger(alert.lastTriggeredAt) || alert.lastTriggeredAt < alert.definition.createdAt || alert.lastTime === null || alert.lastTriggeredAt > alert.lastTime)) throw new Error('Invalid persisted alert observation clock or baseline.');
      if (!Array.isArray(alert.closedBars) || alert.closedBars.length > 10001 || new Set(alert.closedBars.map(bar => bar.id)).size !== alert.closedBars.length || alert.closedBars.some(bar => !bar || typeof bar.id !== 'string' || !bar.id || !finite(bar.value))) throw new Error('Invalid persisted completed-bar history.');
      if (!Array.isArray(alert.history) || alert.history.length > 100000) throw new Error('Invalid alert notification history.');
      let lastSequence = -1, lastTime = alert.definition.createdAt;
      for (const notification of alert.history) {
        if (!notification || typeof notification.id !== 'string' || !notification.id || notificationIds.has(notification.id) || notification.alertId !== alert.definition.id || notification.runId !== alert.definition.runId || notification.mode !== alert.definition.mode || notification.local !== true || typeof notification.name !== 'string' || notification.name.length > 200 || typeof notification.message !== 'string' || notification.message.length > 4000 || !finite(notification.value) || typeof notification.barId !== 'string' || !notification.barId || !Number.isSafeInteger(notification.sequence) || notification.sequence <= lastSequence || alert.lastSequence === null || notification.sequence > alert.lastSequence || !Number.isSafeInteger(notification.at) || notification.at < lastTime || alert.lastTime === null || notification.at > alert.lastTime) throw new Error('Invalid, duplicated or cross-run alert notification.');
        if (notification.observation !== undefined || alert.definition.observationBinding !== undefined) {
          validateAlertObservation(notification.observation);
          if (!alert.definition.observationBinding || !sameAlertBinding(alert.definition.observationBinding, notification.observation.binding) || notification.observation.observedAt !== notification.at || (notification.mode === 'replay') !== (notification.observation.kind === 'replay-snapshot')) throw new Error('Alert history has a mismatched source, observation clock or replay basis.');
          if(notification.observation.schemaVersion===2&&notification.value!==alertOperandResult(notification.observation.operands!))throw new Error('Technical history value disagrees with its recorded operands.');
        }
        notificationIds.add(notification.id); lastSequence = notification.sequence; lastTime = notification.at;
      }
      if (alert.lastTriggeredAt !== null && !alert.history.some(item => item.at === alert.lastTriggeredAt && item.barId === alert.lastTriggeredBar)) throw new Error('Alert trigger state has no matching notification.');
      if (alert.definition.condition.kind === 'position' ? !ALERT_POSITION_PHASES.includes(alert.positionPhase as AlertPositionPhase) : alert.positionPhase !== undefined) throw new Error('Invalid persisted position alert phase.');
      if (alert.history.some(item => item.positionLevel !== undefined && (alert.definition.condition.kind !== 'position' || !ALERT_POSITION_LEVELS.includes(item.positionLevel)))) throw new Error('Invalid position alert history level.');
      if (alert.status === 'waiting-for-data' && (alert.lastValue !== null || alert.closedBars.length || alert.lastValues !== undefined)) throw new Error('Waiting alert retained an invalid crossing baseline.');
      const count = alert.definition.conditions?.length ?? null, groupValues = (value: unknown) => Array.isArray(value) && value.length === count && value.every(finite);
      if (alert.lastValues !== undefined && (count === null || !groupValues(alert.lastValues)) || alert.previousClosedValues !== undefined && (count === null || !groupValues(alert.previousClosedValues)) || alert.closedBars.some(bar => bar.values !== undefined && (count === null || !groupValues(bar.values)))) throw new Error('Invalid persisted all-conditions baseline.');
    }
    return { ok: true, alerts: structuredClone(alerts), errors };
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); return { ok: false, errors }; }
}
export function restoreLocalAlerts(input: unknown): LocalAlert[] { const result = validateLocalAlerts(input); if (!result.ok || !result.alerts) throw new Error(result.errors.join(' ')); return result.alerts; }

/** Publish a whole local observation batch or retain all history and pause. No oldest-history pruning is hidden. */
export function processLocalAlertBatch(alerts:readonly LocalAlert[],events:readonly AlertEvent[],now:number):{alerts:LocalAlert[];diagnostics:string[]}{
 let changed=false;const diagnostics:string[]=[];
 const next=alerts.map(alert=>{let current=now>=alert.armedAt&&(alert.lastTime===null||now>=alert.lastTime)?advanceLocalAlertClock(alert,now):alert;for(const event of events){const result=processAlertEvent(current,event);current=result.alert;diagnostics.push(...result.diagnostics);}if(current!==alert)changed=true;return current;});
 if(!changed)return{alerts:alerts as LocalAlert[],diagnostics:[...new Set(diagnostics)]};
 const checked=validateLocalAlerts(next);if(checked.ok)return{alerts:next,diagnostics:[...new Set(diagnostics)]};
 const retained=alerts.map(alert=>{const timed=now>=alert.armedAt&&(alert.lastTime===null||now>=alert.lastTime)?advanceLocalAlertClock(alert,now):alert;return ['active','waiting-for-data'].includes(timed.status)?setLocalAlertPaused(timed,true):timed;});
 return{alerts:retained,diagnostics:[...new Set([...diagnostics,'Alerts could not be saved, so active alerts were paused. History is unchanged.',...checked.errors])]};
}
