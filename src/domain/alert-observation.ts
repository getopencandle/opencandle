import {hasNyseAlertCalculation,validateNyseAlertCalculation,nyseAlertKindRefusal,qualifiedNyseSnapshotInput,observeQualifiedNyseAlertSnapshot,type NyseAlertCalculation} from './nyse-mtf-alert-source';
import {SCRIPT_ALERT_MESSAGE_LIMIT} from './script-alert-message';
import type { AlertEvent } from './alerts';
import type { Bar,BarDataset, PriceSource } from './types';
import { isFredDatasetId, isLiveDatasetId } from './live-provider';
import { isConsolidatedBar } from './live-bars';
import { describeSourceRevision, isLegacyLocalRevision, LOCAL_IMPORT_LEGACY_NOTICE } from './data';
import {sourceContextForDataset, validateChartSourceBasisIdentity} from '../chart/source-context';
import {INDICATOR_KINDS,indicatorPlotIds,validateFrozenIndicatorInputs} from '../chart/indicator-settings';
import {indicatorAlertBlock} from './indicator-alertability';
import type {IndicatorId} from './indicators';
import {validateDrawingBoundarySnapshot,type DrawingBoundarySnapshot} from '../chart/drawing-alert-geometry';
import {drawingComparisonError} from './drawing-alert-rules';
import type {StrategyConfig} from './strategy';
import {STRATEGY_FILL_OUTPUT_ID,validateAlertStrategyFill,validateFrozenStrategyConfig,type AlertStrategyFill} from './strategy-alert';
import {catalogDefinition} from './indicator-catalog';
import {isVwapEventAnchor} from './vwap-event-anchors';
import {indicatorVwapKernelVersion} from './indicators';
import {validateFootprintAlertSource,type FootprintAlertSource} from './alert-footprint';

export type AlertSourceInputs = Record<string, number | string | boolean | null>;
/** A settings snapshot, not a pointer to mutable chart state. No visual plot offset belongs in information timing. */
export type AlertScalarSource =
  | { kind: 'price'; field: PriceSource; transformId?: 'standard' | 'heikinashi' }
  | { kind: 'indicator'; instanceId: string; snapshotId: string; indicator: string; plotId: string; inputs: AlertSourceInputs; inputBasis: 'standard-ohlc' | 'chart-prices'; transformId: string; calculation?:NyseAlertCalculation }
  /** 'follow' (version 2 geometry only) reads the drawing's current position (drawing-alert-source.ts). */
  | {kind:'drawing-boundary';instanceId:string;snapshotId:string;geometry:DrawingBoundarySnapshot;mutationPolicy:'frozen'|'follow'}
  | { kind: 'drawing'; instanceId: string; snapshotId: string; tool: string; anchors: Array<{ time: number; price: number }>; settings: AlertSourceInputs; evaluation: 'signed-price-distance'; coordinateModel: 'linear-time-price' | 'linear-time-log-price' }
  /** A script output, frozen like an indicator: the source text and input values at creation are recalculated
   * on each observed prefix. condition = a ctx.alertcondition series (1 true, 0 false), alert = 1 on a bar where
   * ctx.alert(outputId) fired else 0, plot = a ctx.plot series. */
  | { kind: 'script'; instanceId: string; snapshotId: string; title: string; source: string; inputs: AlertSourceInputs; output: 'condition' | 'alert' | 'plot' | 'fill'; outputId: string; transformId: 'standard' | 'heikinashi';
      /** Output 'fill' only. The Strategy tester properties frozen at creation (strategy-alert.ts). */
      strategy?: StrategyConfig }
  /** A Volume footprint metric of the endpoint bar with frozen settings (alert-footprint.ts). */
  | FootprintAlertSource
  | AlertGroupSource;
export type AlertComparisonSource={kind:'comparison';snapshotId:string;left:AlertScalarSource;right:AlertScalarSource};
/** One condition of an all-conditions source: a captured scalar, or a comparison of two (left minus right). */
export type AlertConditionSource=Exclude<AlertScalarSource,AlertGroupSource>|AlertComparisonSource;
/** An all-conditions (AND) source. Each member is evaluated on the same prefix; the definition's `conditions` hold one
 * condition per member. It is listed with the scalar kinds so code that splits a comparison into operands keeps compiling;
 * validation refuses it as a comparison operand or a nested member. */
export interface AlertGroupSource {kind:'all';snapshotId:string;members:AlertConditionSource[]}
export type AlertSourceSnapshot = AlertScalarSource | AlertComparisonSource;
/** An all-conditions source holds 2 to 5 conditions. */
export const ALERT_GROUP_CONDITION_LIMIT=5;
/** Operand values of one condition (left, and right for a comparison). */
export interface AlertConditionOperands {left:AlertOperandValue;right?:AlertOperandValue}
/** An all-conditions observation repeats its first condition in left/right and lists every condition's values. */
export interface AlertOperands extends AlertConditionOperands {conditions?:AlertConditionOperands[]}
export interface AlertObservationBinding { schemaVersion: 1 | 2; datasetKey: string; sessionId: string; replayRunId: string | null; fixture: boolean; completionPolicy: 'unknown' | 'replay-supplied-row' | 'nyse-session-observation'; source: AlertSourceSnapshot; chartId?:string; calculationVersion?:'lv-technical-1'|'lv-nyse-daily-1'|'lv-nyse-period-1'; }
/** One plot of the operand's indicator or script at the endpoint bar, in plot order ({{plot_N}}, {{plot("Title")}}). */
export interface AlertPlotValue {id:string;title:string;value:number|null}
export const ALERT_OPERAND_PLOT_LIMIT=64;
/** `message` is the sanitized dynamic ctx.alert text of a script alert output that fired on the endpoint bar.
 * `plots` are every plot of the same calculation at the endpoint bar; `fill` is a strategy fill there. */
export interface AlertOperandValue {value:number|null;unit:string;basis:string;label:string;message?:string;plots?:AlertPlotValue[];fill?:AlertStrategyFill}
export interface AlertObservation {
  schemaVersion: 1 | 2; kind: 'synthetic-fixture' | 'supplied-snapshot' | 'replay-snapshot'; binding: AlertObservationBinding;
  sourceTime: number; sourceRevision: string; sourceAvailableAt: null; observedAt: number;
  completion: 'unknown' | 'simulated-complete' | 'observed-closed'; informationBars: number; informationEndIndex: number; informationEndTime: number;
  correction: boolean; continuity: 'initial' | 'continuous' | 'gap'; reason: 'source-observation' | 'explicit-evaluation';
  operands?:AlertOperands;informationStartTime?:number;
}
export interface AlertObservationContext {
  instrumentId: string; sourceId: string; mode: 'ordinary' | 'replay'; runId: string;
  binding: AlertObservationBinding; description: string; completion: AlertObservation['completion']; warning: string;
}
export interface AlertObservationSession {
  schemaVersion: 1; binding: AlertObservationBinding; instrumentId: string; mode: 'ordinary' | 'replay'; runId: string;
  replayRunId: string | null; assumeReplayCompletion: boolean; startedAt: number; maxObservationGapSeconds: number;
  initialRevision: string;
  sequence: number; lastObservedAt: number | null; lastFingerprint: string | null; lastRevision: string | null; lastBarIndex: number | null;
}
/** Metadata is a contract checked at the boundary, not proof that a caller's calculation was causal. */
export interface AlertSourceSample {
  value: number | null; source: AlertSourceSnapshot; informationBars: number; informationEndIndex: number; informationEndTime: number;
  operands?:AlertOperands;informationStartTime?:number;
}
export interface AlertSnapshotInput {
  dataset: BarDataset; observedAt: number; barIndex?: number; replayRunId?: string;
  sample?: AlertSourceSample; continuity?: 'continuous' | 'gap';
  reason?: 'source-observation' | 'explicit-evaluation';
  correction?:boolean;
  /** LIVE bar close: the supplied dataset ends at a live bar that has just closed (newer bar opened or interval end passed). Ordinary live datasets only. */
  barClosed?:boolean;
}
export interface AlertSnapshotResult {
  session: AlertObservationSession; event: AlertEvent | null; context: AlertObservationContext; diagnostics: string[];
}
export const SNAPSHOT_ALERT_POLICIES = [
  'Snapshot alerts compare values supplied to OpenCandle while it is open. They are not a live market feed or historical tick reconstruction.',
  'Source bar time labels the supplied row. Local observation time records when OpenCandle evaluated it. Source publication time and actual bar completion remain unknown.',
  'Ordinary snapshots cannot satisfy once-per-bar-close or completed-bar movement conditions. Replay may explicitly simulate completed supplied rows in a separate run.',
  'A new session or replay seek requires an explicitly rearmed alert. Source corrections and observed gaps clear crossing baselines; no missed prices are invented.',
  'Replay alert expiry and minute throttling use the local observation clock, not the historical row timestamp. This is an OpenCandle policy.',
];
const fields: PriceSource[] = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'];
const text = (value: unknown, max = 500): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const time = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 253402300799;
const sourceTime = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= -62135596800 && value <= 253402300799;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Reflect.ownKeys(value).some(key => typeof key!=='string'||!allowed.includes(key)) || Object.values(Object.getOwnPropertyDescriptors(value)).some(property => !property.enumerable||!Object.hasOwn(property,'value'))) throw new Error('Unsupported, hidden or accessor-based alert source property.');
}
function inputs(value: unknown): void {
  if (!record(value) || Reflect.ownKeys(value).length > 100||Reflect.ownKeys(value).some(key=>typeof key!=='string')) throw new Error('Alert inputs require at most 100 named scalar settings.');
  for (const [key, property] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!text(key, 100) || ['__proto__', 'constructor', 'prototype'].includes(key) || !property.enumerable||!Object.hasOwn(property,'value')) throw new Error('Invalid alert input key.');
    const item = property.value;
    if (item !== null && typeof item !== 'boolean' && !(typeof item === 'string' && item.length <= 1000) && !finite(item)) throw new Error('Alert source settings must be bounded JSON scalars.');
  }
}
export function validateAlertSource(source: unknown): asserts source is AlertSourceSnapshot {
  if (!record(source)) throw new Error('Alert source must be a settings snapshot.');
  if (Object.values(Object.getOwnPropertyDescriptors(source)).some(property => property.get || property.set)) throw new Error('Alert source accessors are not allowed.');
  if (source.kind === 'price') { keys(source, ['kind', 'field','transformId']); if (!fields.includes(source.field as PriceSource) || source.transformId!==undefined&&!['standard','heikinashi'].includes(source.transformId as string)) throw new Error('Unsupported alert price field or transform.'); return; }
  if(source.kind==='comparison'){
    keys(source,['kind','snapshotId','left','right']);if(!text(source.snapshotId,100))throw new Error('A comparison snapshot identity is required.');
    if(!record(source.left)||!record(source.right))throw new Error('Comparison operands must be captured scalar sources.');
    if(Object.values(Object.getOwnPropertyDescriptors(source.left)).some(p=>p.get||p.set)||Object.values(Object.getOwnPropertyDescriptors(source.right)).some(p=>p.get||p.set))throw new Error('Comparison accessors are not allowed.');
    if(hasNyseAlertCalculation(source.left)||hasNyseAlertCalculation(source.right))throw Error('Daily timeframe alerts currently compare with a constant only.');
    if(source.left.kind==='comparison'||source.right.kind==='comparison')throw new Error('Nested comparison sources are unsupported.');
    if(source.left.kind==='all'||source.right.kind==='all')throw new Error('An all-conditions source cannot be a comparison operand.');
    const drawingError=drawingComparisonError(source.left,source.right);if(drawingError)throw new Error(drawingError);
    validateAlertSource(source.left);validateAlertSource(source.right);return;
  }
  if(source.kind==='all'){
    keys(source,['kind','snapshotId','members']);if(!text(source.snapshotId,100))throw new Error('An all-conditions snapshot identity is required.');
    const members=source.members;
    if(!Array.isArray(members)||Object.getPrototypeOf(members)!==Array.prototype||members.length<2||members.length>ALERT_GROUP_CONDITION_LIMIT||Reflect.ownKeys(members).length!==members.length+1)throw new Error('An all-conditions alert needs 2 to '+ALERT_GROUP_CONDITION_LIMIT+' conditions.');
    for(let index=0;index<members.length;index++){const member=Object.getOwnPropertyDescriptor(members,String(index));if(!member||!Object.hasOwn(member,'value')||!record(member.value))throw new Error('Each condition must be a captured source.');if(member.value.kind==='all')throw new Error('Nested all-conditions sources are unsupported.');validateAlertSource(member.value);}
    return;
  }
  if (!text(source.instanceId, 200) || !text(source.snapshotId, 100)) throw new Error('An immutable instance and settings snapshot identity are required.');
  if(source.kind==='footprint'){validateFootprintAlertSource(source);return;}
  if(source.kind==='drawing-boundary'){
   keys(source,['kind','instanceId','snapshotId','geometry','mutationPolicy']);const geometry=validateDrawingBoundarySnapshot(source.geometry);
   if(source.instanceId!==geometry.drawingId||!(source.mutationPolicy==='frozen'||source.mutationPolicy==='follow'&&geometry.schemaVersion===2))throw new Error('Drawing source identity or mutation policy is unsupported.');return;
  }
  if (source.kind === 'indicator') {
    keys(source, ['kind', 'instanceId', 'snapshotId', 'indicator', 'plotId', 'inputs', 'inputBasis', 'transformId',...(Object.hasOwn(source,'calculation')?['calculation']:[])]);
    if(Object.hasOwn(source,'calculation'))validateNyseAlertCalculation(source.calculation);
    if (!text(source.indicator, 100) || !text(source.plotId, 100) || !text(source.transformId, 200) || !['standard-ohlc', 'chart-prices'].includes(source.inputBasis as string)) throw new Error('Invalid indicator alert source.');
    inputs(source.inputs); return;
  }
  if (source.kind === 'drawing') {
    keys(source, ['kind', 'instanceId', 'snapshotId', 'tool', 'anchors', 'settings', 'evaluation', 'coordinateModel']);
    if (!text(source.tool, 100) || source.evaluation !== 'signed-price-distance' || !['linear-time-price', 'linear-time-log-price'].includes(source.coordinateModel as string) || !Array.isArray(source.anchors) || source.anchors.length < 1 || source.anchors.length > 32) throw new Error('Invalid drawing alert source contract.');
    for (const anchor of source.anchors) { if (!record(anchor)) throw new Error('Invalid drawing anchor.'); keys(anchor, ['time', 'price']); if (!sourceTime(anchor.time) || !finite(anchor.price) || anchor.price <= 0) throw new Error('Drawing anchors require a valid time and positive price.'); }
    inputs(source.settings); return;
  }
  if (source.kind === 'script') {
    keys(source, ['kind', 'instanceId', 'snapshotId', 'title', 'source', 'inputs', 'output', 'outputId', 'transformId', ...(source.output === 'fill' ? ['strategy'] : [])]);
    if (!text(source.title, 200) || typeof source.source !== 'string' || !source.source.trim() || new TextEncoder().encode(source.source).length > 65536 || !['condition', 'alert', 'plot', 'fill'].includes(source.output as string) || !text(source.outputId, 200) || !['standard', 'heikinashi'].includes(source.transformId as string)) throw new Error('Invalid script alert source.');
    // A strategy order-fill source carries its frozen Strategy tester properties, for its own transform.
    if (source.output === 'fill') { if (source.outputId !== STRATEGY_FILL_OUTPUT_ID) throw new Error('Invalid strategy fill alert source.'); validateFrozenStrategyConfig(source.strategy); if ((source.strategy as StrategyConfig).chartType !== (source.transformId === 'heikinashi' ? 'heikin-ashi' : 'standard')) throw new Error('Strategy alert properties belong to another chart transform.'); }
    inputs(source.inputs); return;
  }
  throw new Error('Unsupported alert source kind.');
}
export function alertSourceId(source: AlertSourceSnapshot): string {
  validateAlertSource(source);
  return source.kind === 'price' ? `price:${source.field}${source.transformId&&source.transformId!=='standard'?':'+source.transformId:''}` : source.kind==='comparison'?JSON.stringify(['comparison',source.snapshotId]):source.kind==='all'?JSON.stringify(['all',source.snapshotId]):JSON.stringify([source.kind, source.instanceId, source.snapshotId, source.kind === 'indicator' ? source.plotId : source.kind==='drawing-boundary'?source.geometry.tool:source.kind==='script'?source.output+':'+source.outputId:source.kind==='footprint'?source.metric:source.tool]);
}
/** Version 2 freezes every calculation input. Unknown plots and source graphs cannot become close. */
export function validateTechnicalAlertSource(source:unknown):asserts source is AlertSourceSnapshot{
 validateAlertSource(source);
 if(source.kind==='comparison'){validateTechnicalAlertSource(source.left);validateTechnicalAlertSource(source.right);return;}
 if(source.kind==='all'){for(const member of source.members){validateTechnicalAlertSource(member);const refused=alertConditionMemberRefusal(member);if(refused)throw new Error(refused);}return;}
 if(source.kind==='price'){if(!source.transformId)throw new Error('Technical price source requires an explicit calculation transform.');return;}
 if(source.kind==='indicator'){
  const kind=source.indicator as IndicatorId;
  // Every built-in kind is alertable on each of its plots (the original ten and the catalog), except the
  // Chart-only kinds in indicator-alertability.ts.
  if(!INDICATOR_KINDS.includes(kind)||!indicatorPlotIds[kind].includes(source.plotId))throw new Error('This technical indicator or plot is not supported.');
  const blocked=hasNyseAlertCalculation(source)?nyseAlertKindRefusal(kind,source.inputs):indicatorAlertBlock(kind,source.inputs as Readonly<Record<string,unknown>>);if(blocked)throw new Error(blocked);
  validateFrozenIndicatorInputs(kind,source.inputs,source.plotId);
  if(!['standard','heikinashi'].includes(source.transformId)||source.inputBasis!==(source.transformId==='standard'?'standard-ohlc':'chart-prices'))throw new Error('Unsupported or inconsistent technical calculation transform.');
  return;
 }
 if(source.kind==='drawing-boundary'||source.kind==='script'||source.kind==='footprint')return;
 // The older drawing kind is evaluated against the saved workspace drawing (legacy-drawing-alert.ts).
 if(source.kind==='drawing')return;
 throw new Error('This drawing source has no supported version 2 geometry contract yet.');
}
/** The captured scalar operands of a source, every condition of an all-conditions source included. */
export function alertScalarOperands(source:AlertSourceSnapshot):Exclude<AlertScalarSource,AlertGroupSource>[]{
 if(source.kind==='all')return source.members.flatMap(member=>alertScalarOperands(member));
 if(source.kind==='comparison')return [source.left,source.right].flatMap(side=>alertScalarOperands(side));
 return [source];
}
/** Why a captured source cannot be one condition of an all-conditions alert, or null. Conditions read price or
 * chart-timeframe built-in indicator plots (alone or compared with each other). Sources that need their own evaluation owner
 * (New York session timeframes, VWAP kernel 2 and VWAP dividend/split anchors, two-symbol indicators) and drawings and scripts
 * (which follow their chart objects) still alert on their own. */
export function alertConditionMemberRefusal(source:AlertSourceSnapshot):string|null{
 if(source.kind==='all')return 'An all-conditions alert cannot contain another all-conditions alert.';
 for(const operand of alertScalarOperands(source)){
  if(operand.kind==='price'||operand.kind==='footprint')continue;
  if(operand.kind==='indicator'){
   if(hasNyseAlertCalculation(operand))return 'An indicator on its own 1D, 1W or 1M timeframe alerts on its own. Create a separate alert for it.';
   if(catalogDefinition(operand.indicator)?.secondSymbol)return 'An indicator that reads a second symbol alerts on its own. Create a separate alert for it.';
   if(operand.indicator==='vwap'){let exact=true;try{exact=indicatorVwapKernelVersion(operand.inputs)===2;}catch{exact=true;}if(exact||isVwapEventAnchor(operand.inputs.anchor))return 'This VWAP alerts on its own. Create a separate alert for it, or use a session-anchored VWAP.';}
   continue;
  }
  return operand.kind==='script'?'Script outputs alert on their own. Create a separate alert for them.':'Drawings alert on their own. Create a separate alert for them.';
 }
 return null;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function sameAlertBinding(a: AlertObservationBinding, b: AlertObservationBinding): boolean { return canonical(a) === canonical(b); }
export function sameAlertSource(a: AlertSourceSnapshot, b: AlertSourceSnapshot): boolean { return canonical(a) === canonical(b); }
/** Copy only metadata data properties. A complete dataset's bars accessor is never consulted behind a replay prefix. */
export function alertDatasetWithPrefix(dataset:BarDataset,bars:readonly Bar[]):BarDataset{
 if(!record(dataset))throw new Error('Alert dataset metadata must be a plain record.');
 const selected:Record<string,unknown>={};for(const key of ['instrument','provenance','resolution']){const descriptor=Object.getOwnPropertyDescriptor(dataset,key);if(!descriptor||!Object.hasOwn(descriptor,'value'))throw new Error('Alert source metadata cannot use accessors.');selected[key]=descriptor.value;}
 return{instrument:selected.instrument as BarDataset['instrument'],provenance:selected.provenance as BarDataset['provenance'],resolution:selected.resolution as string,bars:bars as Bar[]};
}
export function alertDatasetKey(dataset: BarDataset,version:1|2=1): string {
  if(version===2)return sourceContextForDataset(alertDatasetWithPrefix(dataset,[])).basisIdentity!;
  const values = [dataset.instrument.id, dataset.provenance.providerId, dataset.provenance.datasetId, dataset.resolution, dataset.instrument.currency, dataset.provenance.adjustment, dataset.provenance.session, dataset.provenance.timezone];
  if (values.some(value => !text(value, 4096))) throw new Error('A complete bounded source identity and price basis are required for alerts.');
  const key = JSON.stringify(values); if (key.length > 20000) throw new Error('Alert source identity exceeds local limits.'); return key;
}
/** Calculation identity only: never passed to a chart/context ownership API. */
export function alertSourceDatasetKey(dataset:BarDataset,source:AlertSourceSnapshot,version:1|2=2):string{
 const actual=alertDatasetKey(dataset,version);if(version!==2||!hasNyseAlertCalculation(source))return actual;validateTechnicalAlertSource(source);const tuple=JSON.parse(actual) as unknown[];tuple[12]='nyse-regular';return JSON.stringify(tuple);
}

/** Display label for a stored observation's revision. The dataset id comes from the persisted binding key. */
export function alertObservationRevisionLabel(observation: Pick<AlertObservation, 'sourceRevision' | 'binding'>): string {
  let datasetId: string | null = null;
  try { const key: unknown = JSON.parse(observation.binding.datasetKey); const value = Array.isArray(key) ? key[observation.binding.schemaVersion === 2 ? 9 : 2] : null; datasetId = typeof value === 'string' ? value : null; } catch { datasetId = null; }
  return describeSourceRevision(observation.sourceRevision, datasetId);
}
export function validateAlertBinding(binding: unknown): asserts binding is AlertObservationBinding {
  if (!record(binding)) throw new Error('Invalid alert observation binding.');
  keys(binding, ['schemaVersion', 'datasetKey', 'sessionId', 'replayRunId', 'fixture', 'completionPolicy', 'source',...(binding.schemaVersion===2?['chartId','calculationVersion']:[])]);
  if (![1,2].includes(binding.schemaVersion as number) || !text(binding.datasetKey, 100000) || !text(binding.sessionId, 128) || binding.replayRunId !== null && !text(binding.replayRunId, 4096) || typeof binding.fixture !== 'boolean' || !['unknown', 'replay-supplied-row','nyse-session-observation'].includes(binding.completionPolicy as string) || binding.completionPolicy === 'replay-supplied-row' && binding.replayRunId === null) throw new Error('Invalid alert observation binding identity.');
  let parts: unknown; try { parts = JSON.parse(binding.datasetKey); } catch { throw new Error('Invalid alert dataset key.'); }
  if(binding.schemaVersion===1){if (!Array.isArray(parts) || parts.length !== 8 || parts.some(part => !text(part, 4096)) || JSON.stringify(parts) !== binding.datasetKey) throw new Error('Invalid alert dataset key components.');}
  else {validateChartSourceBasisIdentity(binding.datasetKey);if(!text(binding.chartId,200)||binding.calculationVersion!==technicalCalculationVersion(binding.source)||(parts as unknown[])[17]!==binding.fixture)throw new Error('Invalid technical chart, calculation version or fixture identity.');}
  validateAlertSource(binding.source);
  if((binding.completionPolicy==='nyse-session-observation')!==hasNyseAlertCalculation(binding.source)||hasNyseAlertCalculation(binding.source)&&(binding.schemaVersion!==2||(parts as unknown[])[12]!=='nyse-regular'))throw Error('Daily alert declaration and observation policy disagree.');
  if(binding.schemaVersion===2)validateTechnicalAlertSource(binding.source);
  if(binding.schemaVersion===2){const operands=alertScalarOperands(binding.source);if(operands.some(source=>source.kind==='drawing-boundary'&&source.geometry.sourceBasis!==binding.datasetKey))throw new Error('Drawing geometry belongs to another exact price source basis.');}
  if(binding.schemaVersion===1&&(binding.source.kind==='comparison'||binding.source.kind==='all'||binding.source.kind==='drawing-boundary'||binding.source.kind==='price'&&binding.source.transformId!==undefined))throw new Error('Version 1 source semantics cannot be upgraded implicitly.');
}
export function validateAlertObservation(observation: unknown): asserts observation is AlertObservation {
  if (!record(observation)) throw new Error('Invalid alert observation.');
  keys(observation, ['schemaVersion', 'kind', 'binding', 'sourceTime', 'sourceRevision', 'sourceAvailableAt', 'observedAt', 'completion', 'informationBars', 'informationEndIndex', 'informationEndTime', 'correction', 'continuity', 'reason',...(observation.schemaVersion===2?['operands','informationStartTime']:[])]);
  validateAlertBinding(observation.binding);
  if (observation.completion !== (observation.binding.completionPolicy==='nyse-session-observation'?(observation.completion==='unknown'?'unknown':observation.kind==='replay-snapshot'?'simulated-complete':'observed-closed'):observation.binding.completionPolicy === 'replay-supplied-row' ? 'simulated-complete' : observation.completion === 'observed-closed' && observation.kind === 'supplied-snapshot' ? 'observed-closed' : 'unknown') || (observation.kind === 'replay-snapshot') !== (observation.binding.replayRunId !== null) || observation.kind !== 'replay-snapshot' && (observation.kind === 'synthetic-fixture') !== observation.binding.fixture) throw new Error('Observation labels disagree with the captured fixture, completion or replay policy.');
  if (observation.schemaVersion !== observation.binding.schemaVersion || !['synthetic-fixture', 'supplied-snapshot', 'replay-snapshot'].includes(observation.kind as string) || !sourceTime(observation.sourceTime) || !text(observation.sourceRevision, 4096) || observation.sourceAvailableAt !== null || !time(observation.observedAt) || observation.sourceTime > observation.observedAt || !['unknown', 'simulated-complete', 'observed-closed'].includes(observation.completion as string) || observation.completion === 'simulated-complete' && observation.kind !== 'replay-snapshot' || !Number.isSafeInteger(observation.informationBars) || (observation.informationBars as number) < 1 || (observation.informationBars as number) > 100000 || observation.informationEndIndex !== (observation.informationBars as number) - 1 || observation.informationEndTime !== observation.sourceTime || typeof observation.correction !== 'boolean' || !['initial', 'continuous', 'gap'].includes(observation.continuity as string) || !['source-observation', 'explicit-evaluation'].includes(observation.reason as string)) throw new Error('Invalid, future or unsupported snapshot observation basis.');
  if(observation.schemaVersion===2){
    if(!sourceTime(observation.informationStartTime)||observation.informationStartTime>observation.sourceTime)throw new Error('Technical source history origin is required.');
    validateSourceOperands(observation.operands,observation.binding.source);
  }
}
/** Validate recorded operands against the shape of their source (scalar, comparison or all-conditions). */
export function validateSourceOperands(value:unknown,source:AlertSourceSnapshot):asserts value is AlertOperands{
 if(source.kind!=='all'){validateAlertOperands(value,source.kind==='comparison');return;}
 validateAlertOperands(value,source.members[0].kind==='comparison',source.members.map(member=>member.kind==='comparison'));
}
export function validateAlertOperands(value:unknown,comparison:boolean,conditions?:readonly boolean[]):asserts value is AlertOperands{
 if(!record(value))throw new Error('Technical observation operand values are required.');keys(value,['left',...(comparison?['right']:[]),...(conditions?['conditions']:[])]);
 if(conditions){
  const rows=value.conditions;
  if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype||rows.length!==conditions.length||Reflect.ownKeys(rows).length!==rows.length+1)throw new Error('Every condition of an all-conditions observation needs its operand values.');
  rows.forEach((row,index)=>validateAlertOperands(row,conditions[index]));
  if(canonical({left:value.left,...(comparison?{right:value.right}:{})})!==canonical(rows[0]))throw new Error('The first condition operands disagree with the all-conditions observation.');
 }
 for(const side of comparison?['left','right']:['left']){const operand=value[side];if(!record(operand))throw new Error('Missing technical operand.');keys(operand,['value','unit','basis','label','message','plots','fill']);if(operand.value!==null&&!finite(operand.value)||!text(operand.unit,200)||!text(operand.basis,1000)||!text(operand.label,500)||Object.hasOwn(operand,'message')&&!text(operand.message,SCRIPT_ALERT_MESSAGE_LIMIT))throw new Error('Invalid technical operand metadata.');
  if(Object.hasOwn(operand,'plots'))validateAlertPlots(operand.plots);
  if(Object.hasOwn(operand,'fill'))validateAlertStrategyFill(operand.fill);}
}
function validateAlertPlots(value:unknown):asserts value is AlertPlotValue[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>ALERT_OPERAND_PLOT_LIMIT||Reflect.ownKeys(value).length!==value.length+1)throw new Error('Invalid technical operand plot values.');
 for(const plot of value){if(!record(plot))throw new Error('Invalid technical operand plot value.');keys(plot,['id','title','value']);if(!text(plot.id,200)||!text(plot.title,200)||plot.value!==null&&!finite(plot.value))throw new Error('Invalid technical operand plot value.');}
}
/** The value an observation reports. An all-conditions observation reports its first condition's value, and no
 * value (unavailable) unless every condition has one. */
export function alertOperandResult(value:AlertOperands):number|null{
 if(value.conditions){const results=value.conditions.map(row=>alertOperandResult(row));return results.some(result=>result===null)?null:results[0];}
 const left=value.left.value,right=value.right?.value;
 if(left===null||right===null)return null;const result=value.right?left-right!:left;return Number.isFinite(result)?result:null;
}
export function alertObservationDescription(observation: Pick<AlertObservation, 'kind' | 'completion'> & { binding?: Pick<AlertObservationBinding, 'fixture'> }): string {
  const kind = observation.kind === 'replay-snapshot' ? observation.binding?.fixture ? 'Replay of synthetic fixture snapshots' : 'Replay of supplied snapshots' : observation.kind === 'synthetic-fixture' ? 'Synthetic fixture snapshot' : 'Supplied historical snapshot';
  return `${kind}; ${observation.completion === 'simulated-complete' ? 'row completion is simulated' : observation.completion === 'observed-closed' ? 'live bar close observed' : 'actual bar completion is unknown'}`;
}
/** The calculation version of a version 2 binding. 1D keeps its original daily version; 1W and 1M are the
 * session-period calculation built on that daily plan. */
function technicalCalculationVersion(source:unknown):'lv-technical-1'|'lv-nyse-daily-1'|'lv-nyse-period-1'{
  if(!hasNyseAlertCalculation(source))return 'lv-technical-1';
  return (source.calculation as {interval?:unknown}).interval==='1D'?'lv-nyse-daily-1':'lv-nyse-period-1';
}
function nyseCompletionText(source:AlertSourceSnapshot,completion:AlertObservation['completion'],mode:'ordinary'|'replay'):string{
  const interval=hasNyseAlertCalculation(source)?source.calculation.interval:'1D',word=interval==='1W'?'weekly':interval==='1M'?'monthly':'daily',period=interval==='1W'?'Week':interval==='1M'?'Month':'Daily session';
  if(completion==='unknown')return 'Developing '+word+' values from the observed prefix.';
  return mode==='replay'?period+' completed by the isolated replay clock.':period+(interval==='1D'?' close':"'s last session close")+' confirmed by the current producer observation.';
}
export function alertObservationContext(session: AlertObservationSession, dataset: BarDataset): AlertObservationContext {
  const completion = session.mode === 'replay' && session.assumeReplayCompletion ? 'simulated-complete' : 'unknown';
  return { instrumentId: session.instrumentId, sourceId: alertSourceId(session.binding.source), mode: session.mode, runId: session.runId, binding: structuredClone(session.binding), completion,
    description: alertObservationDescription({ kind: session.mode === 'replay' ? 'replay-snapshot' : dataset.provenance.fixture ? 'synthetic-fixture' : 'supplied-snapshot', completion, binding: session.binding }),
    warning: hasNyseAlertCalculation(session.binding.source)?'Daily completion requires the current producer observation or isolated replay clock. Prices can be revised; this is not exchange finality or a point-in-time archive.':'No live prices or measured historical publication times. Closed-bar conditions wait unless replay row completion is explicitly simulated.' };
}
export function createAlertObservationSession(dataset: BarDataset, options: { sessionId: string; mode: 'ordinary' | 'replay'; startedAt: number; replayRunId?: string; assumeReplayCompletion?: boolean; source?: AlertSourceSnapshot; maxObservationGapSeconds?: number;version?:1|2;chartId?:string }): AlertObservationSession {
  if (!text(options.sessionId, 128) || !time(options.startedAt) || !['ordinary', 'replay'].includes(options.mode) || options.mode === 'replay' && !text(options.replayRunId, 4096) || options.mode === 'ordinary' && (options.replayRunId !== undefined || options.assumeReplayCompletion === true) || options.assumeReplayCompletion !== undefined && typeof options.assumeReplayCompletion !== 'boolean') throw new Error('Invalid snapshot session or replay completion policy.');
  const source = options.source ?? { kind: 'price', field: 'close',...(options.version===2?{transformId:'standard' as const}:{}) }, maxObservationGapSeconds = options.maxObservationGapSeconds ?? 60;
  validateAlertSource(source); if (!Number.isSafeInteger(maxObservationGapSeconds) || maxObservationGapSeconds < 1 || maxObservationGapSeconds > 86400) throw new Error('Snapshot gap threshold must be 1 to 86400 seconds.');
  if (typeof dataset.provenance.fixture !== 'boolean') throw new Error('An explicit synthetic or supplied source label is required.');
  const version=options.version??1,qualified=hasNyseAlertCalculation(source);
  const binding: AlertObservationBinding = { schemaVersion: version, datasetKey: alertSourceDatasetKey(dataset,source,version), sessionId: options.sessionId, replayRunId: options.replayRunId ?? null, fixture: dataset.provenance.fixture, completionPolicy: qualified?'nyse-session-observation':options.assumeReplayCompletion ? 'replay-supplied-row' : 'unknown', source: structuredClone(source),...(version===2?{chartId:options.chartId,calculationVersion:technicalCalculationVersion(source)}:{}) };
  validateAlertBinding(binding);
  if (!text(dataset.provenance.revision, 4096)) throw new Error('Snapshot revision is required.');
  return { schemaVersion: 1, binding, instrumentId: dataset.instrument.id, mode: options.mode, runId: `${options.mode}:snapshot:${options.sessionId}`, replayRunId: options.replayRunId ?? null, assumeReplayCompletion: qualified?false:options.assumeReplayCompletion ?? false, startedAt: options.startedAt, initialRevision: dataset.provenance.revision, maxObservationGapSeconds, sequence: 0, lastObservedAt: null, lastFingerprint: null, lastRevision: null, lastBarIndex: null };
}
function price(dataset: BarDataset, index: number, field: PriceSource): number {
  const bar = dataset.bars[index];
  if (field === 'hl2') return bar.high / 2 + bar.low / 2;
  if (field === 'hlc3') return bar.high / 3 + bar.low / 3 + bar.close / 3;
  if (field === 'ohlc4') return bar.open / 4 + bar.high / 4 + bar.low / 4 + bar.close / 4;
  return bar[field];
}
/** Pure boundary: no timers, randomness, persistence, network or chart state are read here. */
export function observeAlertSnapshot(session: AlertObservationSession, input: AlertSnapshotInput): AlertSnapshotResult {
  let context = alertObservationContext(session, input.dataset);const fail = (message: string): AlertSnapshotResult => ({ session, event: null, context, diagnostics: [message] });
  validateAlertBinding(session.binding);
  let qualifiedInput:ReturnType<typeof qualifiedNyseSnapshotInput>=null;
  if(hasNyseAlertCalculation(session.binding.source)){try{qualifiedInput=qualifiedNyseSnapshotInput(input);if(!qualifiedInput)return observeQualifiedNyseAlertSnapshot(session,input);}catch(error){return fail(error instanceof Error?error.message:String(error));}}
  if (session.binding.replayRunId !== session.replayRunId || (session.mode === 'replay') !== (session.binding.replayRunId !== null) || session.assumeReplayCompletion !== (session.binding.completionPolicy === 'replay-supplied-row')) return fail('Session and persisted replay/completion binding disagree.');
  if (input.dataset.provenance.fixture !== session.binding.fixture) return fail('Synthetic versus supplied source labeling changed. Start a separate session.');
  if (alertSourceDatasetKey(input.dataset,session.binding.source,session.binding.schemaVersion) !== session.binding.datasetKey || input.dataset.instrument.id !== session.instrumentId) return fail('Snapshot belongs to another exact source or price basis. Start a separate alert session.');
  if (session.mode === 'replay' && input.replayRunId !== session.replayRunId || session.mode === 'ordinary' && input.replayRunId !== undefined) return fail('Replay seek/run mismatch. Start a new isolated alert session.');
  // A session started on a local import before content revisions existed (legacy '1') has an
  // unknown basis. It continues on the loaded data under the current revision, with one plain notice; the adopted
  // revision only commits with a successful observation, so a refused one keeps the notice pending.
  const legacyRevision = isLegacyLocalRevision(session.initialRevision, input.dataset);
  const base: AlertObservationSession = legacyRevision ? { ...session, initialRevision: input.dataset.provenance.revision } : session;
  if (base.mode === 'replay' && input.dataset.provenance.revision !== base.initialRevision) return fail('Replay source revision changed. Start a new isolated replay session.');
  if (input.continuity !== undefined && !['continuous', 'gap'].includes(input.continuity)) return fail('Unsupported snapshot continuity policy.');
  if (input.reason !== undefined && !['source-observation', 'explicit-evaluation'].includes(input.reason)) return fail('Unsupported snapshot observation reason.');
  if(input.correction!==undefined&&typeof input.correction!=='boolean')return fail('Invalid source correction marker.');
  if (!time(input.observedAt) || input.observedAt < session.startedAt || session.lastObservedAt !== null && input.observedAt < session.lastObservedAt || !Number.isSafeInteger(session.sequence) || session.sequence < 0 || session.sequence >= Number.MAX_SAFE_INTEGER) return fail('Invalid, backward or exhausted local observation clock.');
  if (!Array.isArray(input.dataset.bars) || input.dataset.bars.length > 100000) return fail('Snapshot exceeds the 100000 supplied-bar limit.');
  const index = input.barIndex ?? input.dataset.bars.length - 1;
  if (!Number.isSafeInteger(index) || index < 0 || index >= input.dataset.bars.length) return fail('No supplied bar is available at this replay position.');
  if (session.mode === 'ordinary' && index !== input.dataset.bars.length - 1) return fail('Historical row selection requires an explicit replay session.');
  if (session.lastBarIndex !== null && index < session.lastBarIndex) return fail('Backward navigation requires a new isolated replay session.');
  const bar = input.dataset.bars[index], revision = input.dataset.provenance.revision;
  if (!sourceTime(bar.time) || bar.time > input.observedAt || ['open', 'high', 'low', 'close',...(session.binding.schemaVersion===1?['volume']:[])].some(key => !finite(bar[key as keyof typeof bar])) || Math.min(bar.open, bar.high, bar.low, bar.close) <= 0 || finite(bar.volume)&&bar.volume < 0 || bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close) || !text(revision, 4096)) return fail('Supplied alert row is invalid or has a future event timestamp.');
  const source = session.binding.source;
  let value: number | null;
  if (source.kind === 'price'&&session.binding.schemaVersion===1) value = price(input.dataset, index, source.field);
  else {
    const sample = input.sample;
    if (!sample) return fail('This indicator or drawing snapshot has no prefix-bounded calculated value. No approximate source was substituted.');
    try { validateAlertSource(sample.source); } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    if (canonical(sample.source) !== canonical(source) || sample.informationBars !== index + 1 || sample.informationEndIndex !== index || sample.informationEndTime !== bar.time || sample.value !== null && !finite(sample.value)) return fail('Alert source settings changed or its value uses a different information prefix. Rebind explicitly.');
    value = sample.value;
    if(session.binding.schemaVersion===2){try{validateSourceOperands(sample.operands,source);if(sample.value!==alertOperandResult(sample.operands))throw new Error('Technical sample value disagrees with its operand values.');if(!sourceTime(sample.informationStartTime)||sample.informationStartTime!==input.dataset.bars[0].time)throw new Error('Technical source history origin differs.');}catch(error){return fail(error instanceof Error?error.message:String(error));}}
  }
  if (input.barClosed !== undefined && typeof input.barClosed !== 'boolean') return fail('Invalid bar-close marker.');
  if (input.barClosed && (session.mode !== 'ordinary' || input.dataset.provenance.fixture || !isLiveDatasetId(input.dataset.provenance.datasetId) || index !== input.dataset.bars.length - 1)) return fail('A bar-close observation needs an ordinary live source ending at the closed bar.');
  const completion: AlertObservation['completion'] = qualifiedInput?(qualifiedInput.closed?(session.mode==='replay'?'simulated-complete':'observed-closed'):'unknown'):input.barClosed ? 'observed-closed' : context.completion, state = input.dataset.provenance.state;
  if (!['ready', 'loading', 'stale', 'disconnected', 'unavailable', 'error'].includes(state)) return fail('Unknown supplied-data state.');
  const feedState: AlertEvent['feedState'] = state === 'ready' ? 'ready' : state === 'stale' ? 'stale' : 'disconnected';
  const fingerprint = canonical([revision, index, bar, value, feedState, completion]);
  const gap = input.continuity === 'gap' || !qualifiedInput?.closedCalendarGapExempt && session.lastObservedAt !== null && input.observedAt - session.lastObservedAt > session.maxObservationGapSeconds;
  if (fingerprint === session.lastFingerprint && !gap && !input.correction && input.reason !== 'explicit-evaluation') return { session: base.lastObservedAt === input.observedAt && !legacyRevision ? session : { ...base, lastObservedAt: input.observedAt }, event: null, context, diagnostics: legacyRevision ? [LOCAL_IMPORT_LEGACY_NOTICE] : [] };
  // A live forming bar updates in place with a new provider revision on every tick; that is not a history rewrite.
  // The observer (which holds the prior bars) reports true corrections through input.correction for live datasets.
  // A FRED series has no forming bar; a revised daily history (CPI, payrolls) is a correction, as for an import refresh.
  const liveForming = session.mode === 'ordinary' && !input.dataset.provenance.fixture && isLiveDatasetId(input.dataset.provenance.datasetId) && !isFredDatasetId(input.dataset.provenance.datasetId);
  const correction = input.correction===true||!liveForming&&session.lastRevision !== null && (session.lastRevision !== revision || session.lastBarIndex === index && session.lastFingerprint !== fingerprint);
  const observation: AlertObservation = { schemaVersion: session.binding.schemaVersion, kind: session.mode === 'replay' ? 'replay-snapshot' : input.dataset.provenance.fixture ? 'synthetic-fixture' : 'supplied-snapshot', binding: structuredClone(session.binding), sourceTime: bar.time, sourceRevision: revision, sourceAvailableAt: null, observedAt: input.observedAt, completion, informationBars: index + 1, informationEndIndex: index, informationEndTime: bar.time, correction, continuity: session.lastObservedAt === null ? 'initial' : gap ? 'gap' : 'continuous', reason: input.reason ?? 'source-observation',...(session.binding.schemaVersion===2?{operands:structuredClone(input.sample!.operands),informationStartTime:input.sample!.informationStartTime}:{}) };
  validateAlertObservation(observation);
  if(qualifiedInput){try{qualifiedInput.assertCurrent();context={...context,completion,description:nyseCompletionText(session.binding.source,completion,session.mode),warning:'Source prices can be revised; this is not exchange finality or a point-in-time archive.'};}catch(error){return fail(error instanceof Error?error.message:String(error));}}
  const next = { ...base, sequence: session.sequence + 1, lastObservedAt: input.observedAt, lastFingerprint: fingerprint, lastRevision: revision, lastBarIndex: index };
  return { session: next, context, diagnostics: [...(legacyRevision ? [LOCAL_IMPORT_LEGACY_NOTICE] : []), ...(correction ? ['Source correction observed. Crossing history must restart; this is not an observed market tick.'] : gap ? ['Observation gap detected. Missed market events are unknown.'] : [])], event: {
    instrumentId: session.instrumentId, sourceId: context.sourceId, value, time: input.observedAt,
    // Availability here is availability to the local evaluator, not source publication. The latter remains null in observation.
    availableAt: input.observedAt, sequence: next.sequence, barId: qualifiedInput?.barId??`row:${index}:${bar.time}`, barClosed: completion !== 'unknown', feedState,
    mode: session.mode, runId: session.runId, observation,
  } };
}

/** True when a live dataset's history was rewritten. The newest LIVE_FINALIZATION_BARS bars of the
 * previous snapshot may change in place (same time, any OHLCV). That is bar finalization: the forming
 * bar, and the just-closed bar that the provider finalizes after the close (Coinbase 1m REST reconcile of volume and small
 * H/L revisions, Alpaca minute bars that arrive after the next minute's first trade). Older bars changed, removed bars or
 * a time that moved (backwards or forwards) in the previous snapshot are corrections. */
const ALL_BAR_FIELDS = ['open', 'high', 'low', 'close', 'volume'] as const;
export type LiveBarField = typeof ALL_BAR_FIELDS[number];
/**
 * A live feed re-read its closed bars from a fuller source (Alpaca: IEX bars replaced by all-exchange bars
 * once they are 15 minutes old, LiveBarSeries.replaceClosed). Bars are matched by time, not position, because the re-read
 * can insert minutes the earlier source never printed. A replaced or inserted bar is not a correction, so crossing
 * baselines are kept and the forming and new bars are evaluated as usual. Anything else (a removed bar, an inserted bar the
 * re-read did not supply, or another settled bar that changed) is still a correction.
 * When a re-read changes a bar that an already evaluated crossing used, that crossing is neither fired again nor
 * retracted. Alerts act on what was observed at the time.
 */
function consolidatedHistoryCorrected(previous: readonly Bar[], current: readonly Bar[], fields: readonly LiveBarField[]): boolean {
  const byTime = new Map(current.map(bar => [bar.time, bar] as const)), seen = new Set<number>();
  const settled = Math.max(0, previous.length - LIVE_FINALIZATION_BARS);
  for (let i = 0; i < previous.length; i++) {
    const a = previous[i], b = byTime.get(a.time);
    if (!b) return true;
    seen.add(a.time);
    if (i < settled && !isConsolidatedBar(b) && !fields.every(key => Object.is(a[key], b[key]))) return true;
  }
  const last = previous[previous.length - 1].time;
  return current.some(bar => bar.time <= last && !seen.has(bar.time) && !isConsolidatedBar(bar));
}
/** Bar fields a price alert source reads: a change to any other field cannot change an earlier observed value. */
export function priceSourceFields(source: PriceSource): readonly LiveBarField[] {
  switch (source) { case 'hl2': return ['high', 'low']; case 'hlc3': return ['high', 'low', 'close']; case 'ohlc4': return ['open', 'high', 'low', 'close']; default: return [source]; }
}
/** Newest bars of a live snapshot that may still be revised in place: the forming bar and the just-closed bar. */
export const LIVE_FINALIZATION_BARS = 2;
export function liveHistoryCorrected(previous: readonly Bar[] | null, current: readonly Bar[], fields: readonly LiveBarField[] = ALL_BAR_FIELDS): boolean {
  if (!previous || previous === current || !previous.length) return false;
  if (current.length < previous.length) return true;
  if (current.some(isConsolidatedBar)) return consolidatedHistoryCorrected(previous, current, fields);
  const settled = Math.max(0, previous.length - LIVE_FINALIZATION_BARS);
  for (let i = 0; i < previous.length; i++) {
    const a = previous[i], b = current[i];
    if (!b || !Object.is(a.time, b.time)) return true;
    if (i < settled && !fields.every(key => Object.is(a[key], b[key]))) return true;
  }
  return false;
}
