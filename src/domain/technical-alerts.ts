import {hasNyseAlertCalculation,isNyseAlertInterval,validateNyseAlertCalculation,nyseAlertKindRefusal,nyseAlertBatchEstimatedWork,nyseAlertBatchEstimatedSlots,prepareNyseAlertBatch,type NyseMtfAlertEvaluator,type NyseIndicatorAlertSource,type NyseAlertPrepared} from './nyse-mtf-alert-source';
import type {Bar,BarDataset} from './types';
import {REGRESSION_ALERT_WORK_PER_ROW} from '../chart/regression-alert-fit';
import {isPatternIndicator} from './indicators-ext/patterns-catalog';
import {catalogAlertTitles,indicatorAlertBlock} from './indicator-alertability';
import {catalogDefinition} from './indicator-catalog';
import {calculateIndicator,sourceValues,indicatorVolumeMaType,indicatorVwapKernelVersion,type IndicatorId} from './indicators';
import {indicatorDefaults,indicatorLegacyDefaults,indicatorEstimatedWork,indicatorEstimatedSlots,INDICATOR_OUTPUT_LIMIT,validateIndicatorSettings,type IndicatorInstanceSettings} from '../chart/indicator-settings';
import {indicatorTimeframeAlertBlock} from '../chart/indicator-timeframe';
import {heikinAshiBars} from '../chart/calculation-bars';
import {prepareDrawingBoundaryGrid,evaluateDrawingBoundary,type PreparedDrawingBoundaryGrid} from '../chart/drawing-alert-geometry';
import {validateTechnicalAlertSource,alertScalarOperands,type AlertScalarSource as CapturedScalarSource,type AlertGroupSource,type AlertConditionSource,type AlertSourceSnapshot,type AlertSourceSample,type AlertOperandValue,type AlertSourceInputs} from './alert-observation';
/** One calculated operand: every scalar kind except an all-conditions group, which is evaluated condition by condition. */
type AlertScalarSource=Exclude<CapturedScalarSource,AlertGroupSource>;
import {assertVwapResultLease,releaseVwapResultLease} from '../vwap/client';
import {effectiveVwapSettings} from '../vwap/settings';
import {errorText} from '../vwap/protocol';
import {sanitizeScriptAlertMessage} from './script-alert-message';
import {ALERT_OPERAND_PLOT_LIMIT,type AlertPlotValue} from './alert-observation';
import {strategyFillAtEndpoint} from './strategy-alert';
import {VWAP_WORKER_LIMITS,type VwapResultLease} from '../vwap/types';
import {legacyDrawingDistance} from './legacy-drawing-alert';
import {evaluateDrawingAlertSource} from './drawing-alert-source';
import type {VwapEventDate} from './vwap-event-anchors';
import type {SecondSeries} from './second-symbol';
import {footprintAlertSourceLabel,footprintAlertUnit,footprintAlertValue,FOOTPRINT_ALERT_POLICY} from './alert-footprint';

export const TECHNICAL_ALERT_LIMITS={bars:100000,expressions:256,operations:20000000,numericSlots:INDICATOR_OUTPUT_LIMIT} as const;
export type TechnicalTransform='standard'|'heikinashi';
export interface TechnicalAlertSampleResult{sample:AlertSourceSample;diagnostics:string[]}
export interface TechnicalAlertBatch{results:Map<string,TechnicalAlertSampleResult>;estimatedWork:number;cancelled:boolean;timeframe?:NyseAlertPrepared}
export interface TechnicalVwapRequest {
 readonly inputs:Readonly<AlertSourceInputs>;readonly transform:TechnicalTransform;
 /** Exact observer-owned reference for the injected host's correlation, never an immutable certificate. */
 readonly prefix:readonly Bar[];readonly sourceBasis?:string;readonly sourceRevision?:string;
 readonly signal:AbortSignal;readonly cancelled:()=>boolean;
}
/** One restricted-worker run of a frozen script source on the supplied (or Heikin Ashi) prefix. */
export interface TechnicalScriptRequest {readonly source:string;readonly inputs:Readonly<Record<string,number|string|boolean>>;readonly bars:readonly Bar[];readonly signal:AbortSignal;readonly cancelled:()=>boolean}
export interface TechnicalScriptOutputs {
 plots:ReadonlyArray<{id:string;values:ReadonlyArray<{time:number;value:number|null}>}>;
 conditions:ReadonlyArray<{title:string;values:ReadonlyArray<{time:number;value:number}>}>;
 alerts:ReadonlyArray<Record<string,unknown>>;
 /** Virtual order proposals and the run's bar identities, for strategy fill sources. */
 orders?:ReadonlyArray<Record<string,unknown>>;barIds?:readonly string[];
}
/** The restricted script runtime accepts at most 5,000 bars per run; script alerts follow the same bound. */
export const SCRIPT_ALERT_BARS=5000;
/** resolution and calendar: the observed source's chart facts for catalog kinds (indicator-alertability.ts
 *  alertChartFacts); absent = unknown, and a kind falls back to its bar-based inference as on a chart without them. */
export interface TechnicalAlertOptions {timeframe?:{evaluator:NyseMtfAlertEvaluator;dataset:BarDataset;bars:readonly Bar[];execution:string};resolution?:string|null;calendar?:'us-equity'|'utc'|null;cancelled?:()=>boolean;yieldControl?:()=>Promise<void>;sourceBasis?:string;sourceRevision?:string;signal?:AbortSignal;evaluateVwap?:(request:TechnicalVwapRequest)=>Promise<VwapResultLease>;evaluateScript?:(request:TechnicalScriptRequest)=>Promise<TechnicalScriptOutputs>;
 /** The saved workspace drawings of this symbol, for the older 'drawing' alert kind (legacy-drawing-alert.ts). */
 drawings?:readonly unknown[]|null;
 /** Split and dividend ex-dates for the VWAP Dividends and Splits anchors (vwap-event-anchors.ts). */
 corporateActions?:readonly VwapEventDate[]|null;
 /** The gated second series of the two-symbol kinds (second-symbol-alerts.ts). Absent: unavailable; an
  *  alert evaluation never opens a feed through the chart indicator lookup. */
 secondSeries?:(symbol:string)=>SecondSeries}
const unsuppliedSecondSeries=(symbol:string):SecondSeries=>({bars:null,state:'unavailable',message:`${symbol} has no loaded data for this alert.`});
/** Canonical settings identity only. No getter, renderer series or display offset is consulted. */
export function technicalSourceKey(source:AlertSourceSnapshot):string{
 validateTechnicalAlertSource(source);
 const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable((value as Record<string,unknown>)[key])])):value;
 return JSON.stringify(stable(source));
}
export function captureIndicatorAlertSource(settings:IndicatorInstanceSettings,plotId:string,transform:TechnicalTransform,snapshotId:string):Extract<AlertScalarSource,{kind:'indicator'}>{
 validateIndicatorSettings(settings);
 const timeframeBlock=indicatorTimeframeAlertBlock(settings);if(timeframeBlock)throw new Error(timeframeBlock);// Inputs are chart-timeframe only; never capture an MTF instance as chart-timeframe
 const defaults=settings.kind==='vwap'?indicatorLegacyDefaults.vwap:indicatorDefaults[settings.kind];
 const source:Extract<AlertScalarSource,{kind:'indicator'}>={kind:'indicator',instanceId:settings.id,snapshotId,indicator:settings.kind,plotId,inputs:{...defaults,...settings.inputs} as AlertSourceInputs,inputBasis:transform==='standard'?'standard-ohlc':'chart-prices',transformId:transform};
 // A saved instance without a legacyOmit key computes with legacyDefval (legacy CCI: maType None), so the
 // capture freezes that effective value, not the new-instance default the merge above wrote.
 for(const input of catalogDefinition(settings.kind)?.inputs??[])if(input.legacyOmit&&input.legacyDefval!==undefined&&!Object.hasOwn(settings.inputs??{},input.key))(source.inputs as Record<string,unknown>)[input.key]=input.legacyDefval;
 if(settings.kind==='volume'&&indicatorVolumeMaType(settings.inputs)==='SMA')delete source.inputs.maType;
 if(settings.kind==='vwap'&&indicatorVwapKernelVersion(settings.inputs)===1)delete source.inputs.kernelVersion;
 if(settings.kind==='rsi'&&source.inputs.divergence!==true)delete source.inputs.divergence;
 validateTechnicalAlertSource(source);return structuredClone(source);
}
export function captureNyseIndicatorAlertSource(settings:IndicatorInstanceSettings,plotId:string,transform:TechnicalTransform,snapshotId:string):NyseIndicatorAlertSource{
 validateIndicatorSettings(settings);const presentation=settings.presentation,timeframe=presentation?.timeframe;
 const interval=timeframe?.interval;if(!presentation||!timeframe||!isNyseAlertInterval(interval))throw Error('Qualified session alerts require an applied 1D, 1W or 1M indicator timeframe.');
 const refused=nyseAlertKindRefusal(settings.kind,settings.inputs);if(refused)throw Error(refused);
 const ordinary=captureIndicatorAlertSource({...settings,presentation:{...presentation,timeframe:{schemaVersion:1,interval:null,waitForClose:timeframe.waitForClose}}},plotId,transform,snapshotId);
 const source:NyseIndicatorAlertSource={...ordinary,calculation:{schemaVersion:1,interval,calendar:'nyse-regular',sampling:'observed-prefix',waitForClose:timeframe.waitForClose}};
 validateTechnicalAlertSource(source);return structuredClone(source);
}
export function technicalSourceLabel(source:AlertSourceSnapshot):string{
 if(source.kind==='all')return source.members.map(member=>technicalSourceLabel(member)).join(' and ');
 if(source.kind==='comparison')return `${technicalSourceLabel(source.left)} compared with ${technicalSourceLabel(source.right)}`;
 if(source.kind==='price')return `${source.field.toUpperCase()} (${source.transformId??'standard'})`;
 if(source.kind==='footprint')return footprintAlertSourceLabel(source);
 if(source.kind==='indicator'&&hasNyseAlertCalculation(source))return `${source.indicator.toUpperCase()} / ${source.plotId} (${source.calculation.interval==='1W'?'weekly':source.calculation.interval==='1M'?'monthly':'daily'}, New York regular session, ${source.transformId})`;
 if(source.kind==='indicator'){const titles=catalogAlertTitles(source.indicator,source.plotId);return titles?`${titles.name} / ${titles.plot} (${source.transformId})`:`${source.indicator.toUpperCase()} / ${source.plotId} (${source.transformId})`;}
 // A version 2 drawing is named as the alert list names it, never by its internal id.
 if(source.kind==='drawing-boundary')return source.geometry.schemaVersion===2?`${source.geometry.name}${source.mutationPolicy==='follow'?'':' (frozen geometry)'}`:`Captured ${source.geometry.tool} boundary (frozen geometry)`;
 if(source.kind==='script')return `Script ${source.title}: ${source.output==='condition'?`condition "${source.outputId}"`:source.output==='alert'?`ctx.alert "${source.outputId}"`:source.output==='fill'?'strategy order fills':`plot ${source.outputId.replace(/^lvplot:/,'')}`}${source.transformId==='heikinashi'?' (heikinashi)':''}`;
 return `${source.tool}`;
}
export function validateTechnicalPrefix(prefix:readonly Bar[]):void{
 if(!Array.isArray(prefix)||prefix.length<1||prefix.length>TECHNICAL_ALERT_LIMITS.bars)throw new Error('Technical alerts require 1 to 100000 supplied prefix rows.');
 let previous=-Infinity;
 for(let index=0;index<prefix.length;index++){
  const descriptor=Object.getOwnPropertyDescriptor(prefix,String(index));if(!descriptor||!Object.hasOwn(descriptor,'value'))throw new Error('Prefix rows cannot be sparse or accessor-based.');
  const bar=descriptor.value as Bar;
  if(!bar||typeof bar!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(bar))||Reflect.ownKeys(bar).some(key=>typeof key!=='string'||!Object.hasOwn(Object.getOwnPropertyDescriptor(bar,key)!,'value')))throw new Error('Technical rows require plain numeric data.');
  if(!Number.isSafeInteger(bar.time)||bar.time< -62135596800||bar.time>253402300799||bar.time<=previous||!['open','high','low','close'].every(key=>typeof bar[key as keyof Bar]==='number'&&Number.isFinite(bar[key as keyof Bar])&&bar[key as keyof Bar]>0)||bar.low>Math.min(bar.open,bar.close)||bar.high<Math.max(bar.open,bar.close)||bar.low>bar.high)throw new Error('Technical rows require strictly increasing valid timestamps and positive finite OHLC.');
  if(bar.volume!==undefined&&!(typeof bar.volume==='number'&&(Number.isNaN(bar.volume)||Number.isFinite(bar.volume)&&bar.volume>=0)))throw new Error('Source volume must be nonnegative finite or explicitly unavailable.');
  previous=bar.time;
 }
}
function operands(source:AlertSourceSnapshot):AlertScalarSource[]{return alertScalarOperands(source);}
function calculationKey(source:AlertScalarSource):string{
 if(hasNyseAlertCalculation(source))return JSON.stringify([source.indicator,source.transformId,Object.entries(source.inputs).sort(([a],[b])=>a.localeCompare(b)),source.calculation]);
 if(source.kind==='indicator')return JSON.stringify([source.indicator,source.transformId,Object.entries(source.inputs).sort(([a],[b])=>a.localeCompare(b))]);
 // One script run serves every output of the same frozen source, inputs and transform.
 if(source.kind==='script')return JSON.stringify(['script',source.source,source.transformId,Object.entries(source.inputs).sort(([a],[b])=>a.localeCompare(b))]);
 return JSON.stringify(source);
}
/** Includes shared validation/copy/continuity work even when the caller has cached those steps. */
export function technicalAlertEstimatedWork(prefixLength:number,sources:readonly AlertSourceSnapshot[],sourceRows=prefixLength):number{
 if(!Number.isSafeInteger(prefixLength)||prefixLength<1||prefixLength>TECHNICAL_ALERT_LIMITS.bars||sources.length>TECHNICAL_ALERT_LIMITS.expressions)throw new Error('Technical alert prefix or expression count exceeds local limits.');
 const qualified=sources.filter(hasNyseAlertCalculation);let work=prefixLength*32+sources.length*1000+(qualified.length?nyseAlertBatchEstimatedWork(sourceRows,prefixLength,qualified):0);const calculated=new Set<string>(),transforms=new Set<string>();
 for(const source of sources){validateTechnicalAlertSource(source);work+=technicalSourceKey(source).length*2;for(const operand of operands(source)){
  // The older drawing kind is one line evaluation against the saved workspace drawing.
  if(operand.kind==='drawing'){work+=200;continue;}
  const key=calculationKey(operand);if(calculated.has(key))continue;calculated.add(key);
  if(operand.kind==='drawing-boundary'){if(!transforms.has('drawing-grid')){work+=prefixLength*32;transforms.add('drawing-grid');}work+=200;if(operand.geometry.tool==='regressionchannel')work+=prefixLength*(REGRESSION_ALERT_WORK_PER_ROW+(operand.geometry.transform==='heikinashi'?20:0));continue;}
  // The script itself runs in the restricted worker under its own limits; this counts the copy and alignment here.
  if(operand.kind==='script'){work+=Math.min(prefixLength,SCRIPT_ALERT_BARS)*64;continue;}
  if(operand.transformId==='heikinashi'&&!transforms.has('heikinashi')){work+=prefixLength*20;transforms.add('heikinashi');}
  work+=operand.kind==='indicator'?indicatorEstimatedWork(operand.indicator as IndicatorId,prefixLength,operand.inputs):prefixLength*4;
 }}return work;
}
export function technicalAlertEstimatedSlots(prefixLength:number,sources:readonly AlertSourceSnapshot[],sourceRows=prefixLength):number{
 if(!Number.isSafeInteger(prefixLength)||prefixLength<1||prefixLength>TECHNICAL_ALERT_LIMITS.bars||!Array.isArray(sources)||sources.length>TECHNICAL_ALERT_LIMITS.expressions)throw new Error('Invalid technical alert allocation request.');
 const calculated=new Set<string>(),qualified=sources.filter(hasNyseAlertCalculation);let slots=qualified.length?nyseAlertBatchEstimatedSlots(sourceRows,prefixLength,qualified):0;
 for(const source of sources){validateTechnicalAlertSource(source);for(const operand of operands(source)){
  const key=calculationKey(operand);if(calculated.has(key))continue;calculated.add(key);
  if(operand.kind==='indicator')slots+=indicatorEstimatedSlots(operand.indicator as IndicatorId,prefixLength,operand.inputs,undefined,'calculation');
  else if(operand.kind==='price'||operand.kind==='script'||operand.kind==='footprint')slots+=prefixLength;
 }}return slots;
}
/** Compare saved observations, not timestamps alone. A correction to any earlier seed invalidates continuity. */
export function technicalPrefixChanged(previous:readonly Bar[]|null,current:readonly Bar[]):boolean{
 if(!previous)return false;if(previous===current)return false;if(current.length<previous.length)return true;
 for(let i=0;i<previous.length;i++){const a=previous[i],b=current[i];if(!b||!['time','open','high','low','close','volume'].every(key=>Object.is(a[key as keyof Bar],b[key as keyof Bar])))return true;}return false;
}
function unit(source:AlertScalarSource,currency:string):string{
 if(source.kind==='footprint')return footprintAlertUnit(source.metric);
 if(source.kind==='script')return source.output==='plot'?'script plot units':source.output==='fill'?'strategy order fill (1 filled on this bar, 0 none)':'script signal (1 true, 0 false)';
 if(source.kind==='indicator'&&['volume','obv'].includes(source.indicator))return 'source volume units';
 if(source.kind==='indicator'&&source.indicator==='rsi')return 'RSI points';
 if(source.kind==='indicator'&&source.indicator==='stochastic')return 'oscillator percent';
 if(source.kind==='indicator'&&isPatternIndicator(source.indicator))return 'pattern signal (1 appeared on this bar, 0 none)';
 return currency;
}
/** Only the supplied prefix enters this API. The complete historical dataset is deliberately absent. */
export async function evaluateTechnicalAlertSources(prefix:readonly Bar[],sources:readonly AlertSourceSnapshot[],currency:string,options:TechnicalAlertOptions={}):Promise<TechnicalAlertBatch>{
 if(!Array.isArray(sources)||sources.length>TECHNICAL_ALERT_LIMITS.expressions)throw new Error('Technical alert expression count exceeds the local 256-group limit.');
 if(sources.some(hasNyseAlertCalculation)){if(technicalAlertEstimatedWork(prefix.length,sources)>TECHNICAL_ALERT_LIMITS.operations||technicalAlertEstimatedSlots(prefix.length,sources)>TECHNICAL_ALERT_LIMITS.numericSlots)throw Error('The daily alert request exceeds the shared batch limit before declaration copies.');}
 const unique=[...new Map(sources.map(source=>[technicalSourceKey(source),structuredClone(source)])).values()];
 const estimatedWork=technicalAlertEstimatedWork(prefix.length,unique);
 if(estimatedWork>TECHNICAL_ALERT_LIMITS.operations)throw new Error(`Technical alert batch requires ${estimatedWork} estimated operations; local limit is ${TECHNICAL_ALERT_LIMITS.operations}. Reduce history or active expressions.`);
 const numericSlots=technicalAlertEstimatedSlots(prefix.length,unique);if(numericSlots>TECHNICAL_ALERT_LIMITS.numericSlots)throw new Error(`Technical alert batch requires ${numericSlots} numeric slots; local limit is ${TECHNICAL_ALERT_LIMITS.numericSlots}. Reduce history or active expressions.`);
 if(typeof currency!=='string'||!currency||currency.length>200)throw new Error('Technical source currency is required.');
 const cancelledCallback=options.cancelled,signal=options.signal,yieldControl=options.yieldControl,evaluateVwap=options.evaluateVwap,evaluateScript=options.evaluateScript,sourceBasis=options.sourceBasis,sourceRevision=options.sourceRevision;
 const cancelled=()=>signal?.aborted===true||cancelledCallback?.()===true;
 validateTechnicalPrefix(prefix);if(cancelled())return{results:new Map(),estimatedWork,cancelled:true};
 if(unique.some(hasNyseAlertCalculation)){
  if(!unique.every(hasNyseAlertCalculation)||!options.timeframe||!signal)throw Error('Qualified daily alerts require their owned original observation and a separate evaluation group.');
  const frame=options.timeframe,prepared=prepareNyseAlertBatch(frame.evaluator,frame.dataset,frame.bars,frame.execution,unique,currency,signal);
  try{if(cancelled())throw Error('Qualified daily alert cancelled.');prepared.assertCurrent();const results=new Map<string,TechnicalAlertSampleResult>();for(const row of prepared.samples)results.set(technicalSourceKey(row.source),{sample:row.sample,diagnostics:row.diagnostics});return{results,estimatedWork:prepared.estimatedWork,cancelled:false,timeframe:prepared};}catch(error){prepared.release();throw error;}
 }
 const informationBars=prefix.length,informationStartTime=prefix[0].time,informationEndTime=prefix[prefix.length-1].time;
 const transforms=new Map<string,readonly Bar[]>([['standard',prefix]]),calculated=new Map<string,{values:readonly(number|null)[];diagnostics:string[]}>(),results=new Map<string,TechnicalAlertSampleResult>(),scriptMessages=new Map<string,string>();
 // Each calculation's plots in plot order (ids and titles), and each script run's order proposals.
 const plotLists=new Map<string,ReadonlyArray<{id:string;title:string;valueKey:string}>>(),scriptRuns=new Map<string,{orders:ReadonlyArray<Record<string,unknown>>;barIds:readonly string[]|null;bars:readonly Bar[]}>(),strategyFills=new Map<string,ReturnType<typeof strategyFillAtEndpoint>>();
 const endpointPlots=(key:string):AlertPlotValue[]|undefined=>{const list=plotLists.get(key);if(!list?.length)return undefined;return list.slice(0,ALERT_OPERAND_PLOT_LIMIT).map(plot=>{const value=calculated.get(plot.valueKey)?.values[informationBars-1];return{id:plot.id.slice(0,200),title:(plot.title||plot.id).slice(0,200),value:typeof value==='number'&&Number.isFinite(value)?value:null};});};
 let drawingGrid:PreparedDrawingBoundaryGrid|null=null;
 if(unique.some(source=>operands(source).some(operand=>operand.kind==='drawing-boundary'))){
  if(!sourceBasis||!sourceRevision)throw new Error('Drawing alert evaluation requires the current exact source basis and revision.');
  const grid=prepareDrawingBoundaryGrid(prefix,{source:{datasetId:'technical-prefix',revision:sourceRevision,fixture:false,label:'Current technical prefix',basisIdentity:sourceBasis},style:'candles',scale:'linear'});
  if(!grid.ok)throw new Error(grid.diagnostics.join(' '));drawingGrid=grid.grid;
 }
 const materializeVwap=async(source:Extract<AlertScalarSource,{kind:'indicator'}>,key:string):Promise<{values:readonly(number|null)[];diagnostics:string[]}>=>{
  if(!evaluateVwap)throw new Error('Captured VWAP kernel 2 requires the owned asynchronous source evaluator.');
  const transform=source.transformId as TechnicalTransform,settings=effectiveVwapSettings(source.inputs,transform),controller=new AbortController(),started=performance.now();
  let live=true,lease:VwapResultLease|undefined,rejectDeadline!:(cause:unknown)=>void;
  const expired=new Promise<never>((_resolve,reject)=>{rejectDeadline=reject;});
  const timeout=setTimeout(()=>{controller.abort();rejectDeadline(new Error('Technical VWAP calculation and materialization exceeded their shared deadline.'));},VWAP_WORKER_LIMITS.totalMs);
  const onAbort=()=>{controller.abort();rejectDeadline(new Error('Technical VWAP evaluation was cancelled.'));};
  const check=()=>{if(!live||cancelled())throw new Error('Technical VWAP evaluation was cancelled.');if(performance.now()-started>=VWAP_WORKER_LIMITS.totalMs)throw new Error('Technical VWAP calculation and materialization exceeded their shared deadline.');};
  let failed=false,failure:unknown;
  try{
   signal?.addEventListener('abort',onAbort,{once:true});check();
   const request:TechnicalVwapRequest=Object.freeze({inputs:Object.freeze({...source.inputs}),transform,prefix,sourceBasis,sourceRevision,signal:controller.signal,cancelled:()=>cancelled()||controller.signal.aborted});
   const acquisition=Promise.resolve().then(()=>{check();return evaluateVwap(request);}).then(value=>{if(!live){releaseVwapResultLease(value);throw new Error('Technical VWAP lease arrived after retirement.');}lease=value;return value;});
   await Promise.race([acquisition,expired]);check();assertVwapResultLease(lease,{rows:informationBars,settings});
   const copied=new Map<string,{values:(number|null)[];diagnostics:string[]}>();
   for(const plot of lease.plots)copied.set(key+':'+plot.id,{values:[],diagnostics:lease.diagnostics.filter(row=>row.plotId===plot.id).map(row=>row.message)});
   plotLists.set(key,lease.plots.map(plot=>({id:plot.id,title:plot.label,valueKey:key+':'+plot.id})));
   for(let start=0;start<informationBars;start+=VWAP_WORKER_LIMITS.chunkRows){
    check();lease.assertCurrent();const count=Math.min(VWAP_WORKER_LIMITS.chunkRows,informationBars-start);
    for(const plot of lease.plots){check();const chunk=lease.readChunk(plot.id,start,count);check();if(chunk.length!==count)throw new Error('Technical VWAP returned an incomplete value chunk.');copied.get(key+':'+plot.id)!.values.push(...chunk);}
    check();if(start+count<informationBars)await Promise.race([yieldControl?.()??new Promise<void>(resolve=>setTimeout(resolve,0)),expired]);
   }
   check();lease.assertCurrent();for(const [id,result] of copied)calculated.set(id,result);
  }catch(cause){failed=true;failure=cause;}
  finally{
   live=false;clearTimeout(timeout);const cleanup:unknown[]=[];
   try{signal?.removeEventListener('abort',onAbort);}catch(cause){cleanup.push(cause);}
   try{controller.abort();}catch(cause){cleanup.push(cause);}
   if(lease)try{releaseVwapResultLease(lease);}catch(cause){cleanup.push(cause);}
   if(cleanup.length){failure=new Error([...(failed?[errorText(failure)]:[]),...cleanup.map(errorText)].join(' | ').slice(0,2048));failed=true;}
  }
  if(failed)throw failure;
  return{values:[],diagnostics:[]};
 };
 type ScalarResult={operand:AlertOperandValue;diagnostics:string[]};
 const finish=(source:Exclude<AlertScalarSource,{kind:'drawing'|'drawing-boundary'}>,key:string,result:{values:readonly(number|null)[];diagnostics:string[]}):ScalarResult=>{
  const plot=source.kind==='indicator'?(calculated.get(key+':'+source.plotId)??result):result,value=plot.values[informationBars-1];
  const available=typeof value==='number'&&Number.isFinite(value);
  const plots=source.kind==='indicator'?endpointPlots(key):undefined;
  return{operand:{value:available?value:null,unit:unit(source,currency),basis:source.transformId==='heikinashi'?'Heikin Ashi calculation from supplied standard OHLC':'Supplied standard OHLC',label:technicalSourceLabel(source),...(plots?{plots}:{})},diagnostics:plot.diagnostics.length?plot.diagnostics:available?[]:['The captured source has no finite value at this endpoint. Its warmup or required inputs are incomplete.']};
 };
 type ScriptSource=Extract<AlertScalarSource,{kind:'script'}>;
 const scriptOutputKey=(source:ScriptSource)=>source.output+':'+source.outputId;
 /** Run the frozen script once per calculation key and keep every output aligned to the prefix rows. */
 const materializeScript=async(source:ScriptSource,key:string):Promise<void>=>{
  if(informationBars>SCRIPT_ALERT_BARS){calculated.set(key,{values:[],diagnostics:[`Script alerts follow the ${SCRIPT_ALERT_BARS}-bar script limit; this prefix has ${informationBars} bars.`]});return;}
  if(!evaluateScript)throw new Error('Script alert sources require the owned script evaluator.');
  const bars=source.transformId==='heikinashi'?(transforms.get('heikinashi')??(()=>{const built=heikinAshiBars(prefix);transforms.set('heikinashi',built);return built;})()):prefix;
  const inputs=Object.fromEntries(Object.entries(source.inputs).filter((entry):entry is [string,number|string|boolean]=>entry[1]!==null));
  const controller=new AbortController(),onAbort=()=>controller.abort();signal?.addEventListener('abort',onAbort,{once:true});
  let outputs:TechnicalScriptOutputs;
  try{outputs=await evaluateScript(Object.freeze({source:source.source,inputs:Object.freeze(inputs),bars,signal:controller.signal,cancelled:()=>cancelled()||controller.signal.aborted}));}
  catch(error){if(cancelled())throw error;calculated.set(key,{values:[],diagnostics:['Script calculation failed: '+(error instanceof Error?error.message:String(error)).slice(0,500)]});return;}
  finally{signal?.removeEventListener('abort',onAbort);}
  const index=new Map(bars.map((bar,row)=>[bar.time,row])),aligned=(points:ReadonlyArray<{time:number;value:number|null}>)=>{const values:(number|null)[]=new Array(informationBars).fill(null);for(const point of points){const row=index.get(point.time);if(row!==undefined)values[row]=typeof point.value==='number'&&Number.isFinite(point.value)?point.value:null;}return values;};
  for(const plot of outputs.plots)calculated.set(key+':plot:'+plot.id,{values:aligned(plot.values),diagnostics:[]});
  plotLists.set(key,outputs.plots.map(plot=>({id:plot.id,title:plot.id.replace(/^lvplot:/,''),valueKey:key+':plot:'+plot.id})));
  scriptRuns.set(key,{orders:outputs.orders??[],barIds:outputs.barIds??null,bars});
  for(const condition of outputs.conditions)calculated.set(key+':condition:'+condition.title,{values:aligned(condition.values),diagnostics:[]});
  const fired=new Map<string,(number|null)[]>();
  for(const alert of outputs.alerts){const name=alert.name,event=alert.event as {time?:unknown}|undefined,row=typeof event?.time==='number'?index.get(event.time):undefined;if(typeof name!=='string'||row===undefined)continue;let values=fired.get(name);if(!values){values=new Array(informationBars).fill(0);fired.set(name,values);}values[row]=1;
   // The dynamic ctx.alert text of the endpoint bar (the latest call wins), sanitized, travels with the sample.
   if(row===informationBars-1){const text=sanitizeScriptAlertMessage(alert.message);if(text)scriptMessages.set(key+':alert:'+name,text);else scriptMessages.delete(key+':alert:'+name);}}
  for(const [name,values] of fired)calculated.set(key+':alert:'+name,{values,diagnostics:[]});
  calculated.set(key,{values:[],diagnostics:[]});
 };
 const finishScript=(source:ScriptSource,key:string):ScalarResult=>{
  const base=calculated.get(key)!;
  if(source.output==='fill')return finishFill(source,key,base.diagnostics);
  const own=calculated.get(key+':'+scriptOutputKey(source));
  // A ctx.alert name that did not fire in this calculation reads 0, not unavailable.
  const plot=own??(source.output==='alert'&&!base.diagnostics.length?{values:new Array(informationBars).fill(0),diagnostics:[]}:null);
  const value=plot?.values[informationBars-1],available=typeof value==='number'&&Number.isFinite(value);
  const diagnostics=base.diagnostics.length?base.diagnostics:!plot?['The script did not produce this output in its latest calculation.']:available?[]:['The script output has no finite value at this endpoint.'];
  const message=source.output==='alert'&&value===1?scriptMessages.get(key+':'+scriptOutputKey(source)):undefined,plots=endpointPlots(key);
  return{operand:{value:available?value!:null,unit:unit(source,currency),basis:`CandleScript recalculated on supplied ${source.transformId==='heikinashi'?'Heikin Ashi':'standard OHLC'} rows`,label:technicalSourceLabel(source),...(message?{message}:{}),...(plots?{plots}:{})},diagnostics};
 };
 /** Backtest the run's virtual order proposals with the frozen properties; 1 when an order filled on the endpoint bar. */
 const finishFill=(source:ScriptSource,key:string,failed:readonly string[]):ScalarResult=>{
  const run=scriptRuns.get(key),basis=`CandleScript strategy backtested on supplied ${source.transformId==='heikinashi'?'Heikin Ashi':'standard OHLC'} rows with frozen properties`,plots=endpointPlots(key);
  const unavailable=(diagnostics:readonly string[]):ScalarResult=>({operand:{value:null,unit:unit(source,currency),basis,label:technicalSourceLabel(source),...(plots?{plots}:{})},diagnostics:[...diagnostics]});
  if(failed.length||!run)return unavailable(failed.length?failed:['The script did not produce order proposals in its latest calculation.']);
  if(!run.barIds||run.barIds.length!==run.bars.length)return unavailable(['The script run did not report its bar identities, so its order proposals cannot be backtested.']);
  const cacheKey=key+':fill:'+JSON.stringify(source.strategy);let found=strategyFills.get(cacheKey);
  if(!found){found=strategyFillAtEndpoint({orders:run.orders,bars:run.bars,barIds:run.barIds,standardBars:prefix,config:source.strategy!});strategyFills.set(cacheKey,found);}
  if(found.diagnostics.length)return unavailable(found.diagnostics);
  return{operand:{value:found.fill?1:0,unit:unit(source,currency),basis,label:technicalSourceLabel(source),...(plots?{plots}:{}),...(found.fill?{fill:{...found.fill}}:{})},diagnostics:[]};
 };
 const isAsyncVwap=(source:AlertScalarSource)=>source.kind==='script'||source.kind==='indicator'&&source.indicator==='vwap'&&indicatorVwapKernelVersion(source.inputs)===2;
 const evaluate=(source:AlertScalarSource):ScalarResult|Promise<ScalarResult>=>{
  if(source.kind==='drawing'){const last=prefix[informationBars-1],result=legacyDrawingDistance(source,options.drawings,last.time,last.close);return{operand:{value:result.value,unit:currency,basis:'Close minus the saved drawing line ('+source.coordinateModel+')',label:technicalSourceLabel(source)},diagnostics:result.diagnostics};}
  if(source.kind==='script'){const key=calculationKey(source);return calculated.has(key)?finishScript(source,key):materializeScript(source,key).then(()=>finishScript(source,key));}
  if(source.kind==='drawing-boundary'){
   // Version 2 geometry (lines, channels, the vertical line; frozen or following the drawing).
   if(source.geometry.schemaVersion===2)return evaluateDrawingAlertSource(source,{prefix,grid:drawingGrid,sourceBasis,drawings:options.drawings,currency,label:technicalSourceLabel(source),heikinAshi:()=>{let built=transforms.get('heikinashi');if(!built){built=heikinAshiBars(prefix);transforms.set('heikinashi',built);}return built;}});
   const geometry=source.geometry,diagnostics:string[]=[];
   if(geometry.sourceBasis!==sourceBasis)diagnostics.push('Captured drawing belongs to another exact source basis.');
   // A feed opened later (a background alert feed, a reopened chart) starts at another bar, so the grid may be
   // shifted by whole bars. The frozen geometry still applies when every anchor sits the same whole number of bars later
   // (or earlier) than when captured: the bars between the anchors are then the captured ones. Any other change refuses.
   const shifts=geometry.anchors.map(anchor=>{const position=drawingGrid!.logicalPosition(anchor.time);return position===null?null:position-anchor.logical;}),shift=shifts[0];
   if(shift===null||shift===undefined||!Number.isInteger(shift)||shifts.some(value=>value!==shift))diagnostics.push('The captured drawing time grid changed or an anchor is beyond this prefix. Recapture its geometry explicitly.');
   const result=diagnostics.length?null:evaluateDrawingBoundary(geometry,informationBars-1-shift!);
   if(result&&!result.ok)diagnostics.push(...result.diagnostics);
   return{operand:{value:result?.ok?result.boundaryPrice:null,unit:currency,basis:`Frozen ${geometry.transform} drawing geometry in logical-bar linear-price coordinates`,label:technicalSourceLabel(source)},diagnostics};
  }
  // The endpoint bar's footprint metric with the frozen settings (alert-footprint.ts).
  if(source.kind==='footprint'){const result=footprintAlertValue(prefix,source);return{operand:{value:result.value,unit:unit(source,currency),basis:FOOTPRINT_ALERT_POLICY,label:technicalSourceLabel(source)},diagnostics:result.diagnostics};}
  // Existing intraday daily-range alerts must report their missing history, never silently diverge from the chart.
  if(source.kind==='indicator'){const historyBlock=indicatorAlertBlock(source.indicator,source.inputs,options.resolution);if(historyBlock)return {operand:{value:null,unit:unit(source,currency),basis:'Background calculation has no required chart history',label:technicalSourceLabel(source)},diagnostics:[historyBlock]};}
  const key=calculationKey(source);let result=calculated.get(key);
  if(!result){
   if(source.kind==='indicator'&&isAsyncVwap(source))return materializeVwap(source,key).then(computed=>{calculated.set(key,computed);return finish(source,key,computed);});
   let bars=transforms.get(source.transformId??'standard');if(!bars){bars=heikinAshiBars(prefix);transforms.set('heikinashi',bars);}
   if(source.kind==='price')result={values:sourceValues(bars,source.field),diagnostics:[]};
   else{
    const needsVolume=['volume','vwap','obv'].includes(source.indicator)||source.inputs.basisType==='VWMA';
    if(needsVolume&&bars.some(bar=>typeof bar.volume!=='number'||!Number.isFinite(bar.volume)||bar.volume<0))result={values:[],diagnostics:['This captured indicator requires volume, which is unavailable in the supplied prefix.']};
    else{const computed=calculateIndicator(source.indicator as IndicatorId,bars,source.inputs,source.indicator==='vwap'?{corporateActions:options.corporateActions??null}:catalogDefinition(source.indicator)?{resolution:options.resolution??null,calendar:options.calendar??null,secondSeries:options.secondSeries??unsuppliedSecondSeries}:{});for(const plot of computed.series)calculated.set(key+':'+plot.id,{values:plot.values,diagnostics:[...computed.diagnostics,...(computed.plotDiagnostics?.[plot.id]??[])]});plotLists.set(key,computed.series.map(plot=>({id:plot.id,title:plot.label,valueKey:key+':'+plot.id})));result={values:[],diagnostics:computed.diagnostics};}
   }
   calculated.set(key,result);
  }
  return finish(source,key,result);
 };
 try{
 // Copy ordinary dependencies before the first worker yield. The public prefix
 // reference is only a host correlation token and is not an immutable lease.
 if(unique.some(source=>operands(source).some(isAsyncVwap)))for(const source of unique)for(const operand of operands(source))if(!isAsyncVwap(operand))evaluate(operand);
 /** One condition: a scalar, or a comparison reported as left minus right. */
 const condition=async(member:AlertConditionSource)=>{
  const leftResult=evaluate((member.kind==='comparison'?member.left:member) as AlertScalarSource),left=leftResult instanceof Promise?await leftResult:leftResult;
  const rightResult=member.kind==='comparison'?evaluate(member.right as AlertScalarSource):null,right=rightResult instanceof Promise?await rightResult:rightResult;
  const value=left.operand.value===null||right?.operand.value===null?null:right?left.operand.value!-right.operand.value!:left.operand.value;
  return{value:value!==null&&Number.isFinite(value)?value:null,operands:{left:left.operand,...(right?{right:right.operand}:{})},diagnostics:[...left.diagnostics,...(right?.diagnostics??[]),...(value!==null&&!Number.isFinite(value)?['Compared source difference overflowed; no value was substituted.']:[])]};
 };
 for(const source of unique){
  if(cancelled())return{results:new Map(),estimatedWork,cancelled:true};
  if(source.kind==='all'){
   // Every condition is calculated on the same prefix; the sample reports the first condition's value and none
   // unless every condition has one. A condition's diagnostics name its position in the alert.
   const rows=[];for(const member of source.members){rows.push(await condition(member));if(cancelled())return{results:new Map(),estimatedWork,cancelled:true};}
   const value=rows.some(row=>row.value===null)?null:rows[0].value;
   results.set(technicalSourceKey(source),{sample:{value,source:structuredClone(source),informationBars,informationEndIndex:informationBars-1,informationEndTime,informationStartTime,operands:{...rows[0].operands,conditions:rows.map(row=>row.operands)}},diagnostics:[...new Set(rows.flatMap((row,index)=>row.diagnostics.map(text=>'Condition '+(index+1)+': '+text)))]});
   await (yieldControl?.()??Promise.resolve());continue;
  }
  const row=await condition(source);
  if(cancelled())return{results:new Map(),estimatedWork,cancelled:true};
  results.set(technicalSourceKey(source),{sample:{value:row.value,source:structuredClone(source),informationBars,informationEndIndex:informationBars-1,informationEndTime,informationStartTime,operands:row.operands},diagnostics:[...new Set(row.diagnostics)]});
  await (yieldControl?.()??Promise.resolve());
 }}catch(cause){if(cancelled())return{results:new Map(),estimatedWork,cancelled:true};throw cause;}
 return cancelled()?{results:new Map(),estimatedWork,cancelled:true}:{results,estimatedWork,cancelled:false};
}
