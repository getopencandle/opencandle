import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {nativeCoreHarness} from '../chart/native-core-harness';
import {createScriptPort} from '../../src/chart/script-port';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';
import {executeScriptOnBars,ScriptJobQueue} from '../../src/ui/script-jobs';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset,sameChartSourceBasis} from '../../src/chart/source-context';
import {isLiveInputIdentity,isReplayFrameBars,stampLiveLineage} from '../../src/chart/bar-input-identity';
import {isDerivedStyle,derivedStepPinKey} from '../../src/chart/derived';
import {derivedCalculation,createCalculationBarCache,calculationBarsForStyle} from '../../src/chart/calculation-bars';
import {derivedCalculationOptions,sourceTickSize,toVelaBars,EMPTY_MARKET_MESSAGE,rendererPatchIsNoop} from '../../src/chart/adapter';
import {APPEARANCE_LAYER,PREVIOUS_CLOSE_STYLE,PREVIOUS_CLOSE_HA_STYLE,appearanceBoolean} from '../../src/chart/appearance-layer';
import {buildDerivedAxis} from '../../src/chart/derived/derived-axis';
import {parseInterval} from '../../src/domain/intervals';
import {CHART_TYPES} from '../../src/chart/chart-types';
import {captureScriptPresentationInputFrame,scriptPresentationNumber,retireScriptPresentationPort} from '../../src/chart/script-presentation-proof';
import {createScriptLogicalPositions} from '../../src/chart/script-logical-position';
import type {Bar} from '../../src/domain/types';
import type {ScriptBinding} from '../../src/ui/script-library';
const require=createRequire(import.meta.url),{executeSnapshot}=require(resolve(process.env.LV_DERIVED_SCRIPT_CJS_ROOT??'.','electron/script-runtime.cjs'));
export const logicalSourceRows=(closes=[10,16,17]):Bar[]=>closes.map((close,index)=>({time:40+60*index,open:close,high:close,low:close,close,volume:1}));
/** Actual adapter bodies. The supplied native transport controls completion, never receipt qualification. */
export function adapterDerivedProducer(chart:any,input:any,providedIndicators?:any){
 const text=readFileSync(resolve(process.env.LV_DERIVED_SCRIPT_SOURCE_ROOT??'.','src/chart/adapter.ts'),'utf8');
 const section=(first:string,last:string)=>{const start=text.indexOf(first),end=text.indexOf(last,start);if(start<0||end<start)throw Error('Actual adapter boundary missing: '+first);return text.slice(start,end);};
 const line=(first:string)=>section(first,'\n');
 const memo=section('  type ScriptMarketBasis=','  /** The indicators of one chart share one standard-style calculation copy'),feeds=section('  /** Renderer feed:','  /** Source event time'),host=section('  const scriptPresentationHost:ScriptPresentationHost=','  const scripts=createScriptPort('),receipt=section('    captureScriptCalculationInput:','    getDisplayedPriceValues:'),apply=section('  const applyMarketInput=','  const marketQueue='),style=section('  const applyRequestedStyle=','  const drawingSubscribers=');
 const wrapperBody=section('  const recomputeScriptIndicators=','  // held-drawing-publication.ts: a drawing change held back');
 const code=`function build(chart,input,tools,providedIndicators){
 const {sameChartSourceBasis,isDerivedStyle,captureScriptPresentationInputFrame,scriptPresentationNumber,createScriptLogicalPositions,derivedStepPinKey,isLiveInputIdentity,isReplayFrameBars,derivedCalculationOptions,sourceTickSize,derivedCalculation,calculationBarsForStyle,buildDerivedAxis,parseInterval,CHART_TYPES,createCalculationBarCache,toVelaBars,EMPTY_MARKET_MESSAGE,APPEARANCE_LAYER,PREVIOUS_CLOSE_STYLE,PREVIOUS_CLOSE_HA_STYLE,appearanceBoolean,rendererPatchIsNoop}=tools;
 let currentBars=input.bars,currentSource=input.source,requestedStyle=input.style,currentExecutionIdentity=input.execution??'ordinary',vwapSourceEpoch={},disposed=false,analysisUnavailable=null,analysisPending=0,marketUpdating=false,pending=false,statsSourceEpoch={},lastAppearance=null,livePlan=null;
 const calculationBarCache=createCalculationBarCache(),diagnostics=[],rendererHolder={current:chart.orchestrator?.renderer??null},marketQueue={isPending:()=>pending},indicators=providedIndicators??{invalidateVwap(){},recompute(){}},controller={isInputExact:value=>value.bars===currentBars&&value.style===requestedStyle&&sameChartSourceBasis(currentSource,value.source,true)};
 const analysisPublication={captureOwner(){const bars=currentBars,source=currentSource,style=requestedStyle,epoch=vwapSourceEpoch,execution=currentExecutionIdentity;return{isCurrent:()=>!disposed&&currentBars===bars&&currentSource===source&&requestedStyle===style&&vwapSourceEpoch===epoch&&currentExecutionIdentity===execution};}};
 const unavailable=message=>{analysisUnavailable=message;},reprojectDrawings=()=>{},notifyMarketApplied=()=>{};
 ${line('  const retireStatisticsSource=')}
 ${line('  const applyRendererConfig=')}
 ${line('  const retireVwapSource=')}
 ${memo}
 const derivedFeedRows=${section('  const derivedFeedRows=','  /** Renderer feed:').split('  const derivedFeedRows=')[1]}
 ${feeds}${host}
 controller.getCalculationBars=()=>structuredClone(calculationBars(currentBars,requestedStyle));const receiptController={${receipt}},executionController={${line('    setExecutionIdentity:')}};
 ${apply}${style}${wrapperBody}
 const unsubscribes=[];${line('  unsubscribes.push(()=>{publishDerivedPayload')}
 return{host:scriptPresentationHost,indicators,capture:receiptController.captureScriptCalculationInput,setExecution:executionController.setExecutionIdentity,applyMarket:()=>applyMarketInput(currentBars),busy:()=>marketUpdating,
  application(){const raw=currentBars,ticket=publishDerivedPayload(raw,{kind:'prepare'});return{raw,ticket,memo:derivedMemo};},complete:application=>publishDerivedPayload(application.raw,{kind:'commit',ticket:application.ticket}),release:application=>publishDerivedPayload(application.raw,{kind:'release',ticket:application.ticket}),foreign(ticket){return publishDerivedPayload(currentBars,{kind:'commit',ticket});},
  publicationState:()=>({accepted:acceptedScriptMarket!==null,pending:scriptApplyTicket!==null}),styleOnly(value){requestedStyle=value;vwapSourceEpoch={};},phase(kind){return publishDerivedPayload(currentBars,kind==='default'?undefined:kind==='execution'?{kind,expectedExecution:currentExecutionIdentity}:{kind});},
  renew:()=>publishDerivedPayload(currentBars,{kind:'renew'}),copyWith(copy){controller.getCalculationBars=copy;},hold(value){analysisPending=value;},memo:()=>derivedFor(currentBars),indicatorRows:raw=>derivedFeedRows(raw),calculation:()=>structuredClone(calculationBars(currentBars,requestedStyle)),
  publish(next){publishDerivedPayload(next.bars,{kind:'retire-source'});currentBars=next.bars;currentSource=next.source;requestedStyle=next.style;currentExecutionIdentity=next.execution??'ordinary';vwapSourceEpoch={};derivedMemo=null;},execution(value){currentExecutionIdentity=value;vwapSourceEpoch={};},pending(value){pending=value;},close(){disposed=true;for(const off of unsubscribes.splice(0))off();},input:()=>({bars:currentBars,source:currentSource,style:requestedStyle,execution:currentExecutionIdentity}),error:()=>analysisUnavailable};
 }`;
 return Function(stripTypeScriptTypes(code,{mode:'transform'})+';return build;')()(chart,input,{sameChartSourceBasis,isDerivedStyle,captureScriptPresentationInputFrame,scriptPresentationNumber,createScriptLogicalPositions,derivedStepPinKey,isLiveInputIdentity,isReplayFrameBars,derivedCalculationOptions,sourceTickSize,derivedCalculation,calculationBarsForStyle,buildDerivedAxis,parseInterval,CHART_TYPES,createCalculationBarCache,toVelaBars,EMPTY_MARKET_MESSAGE,APPEARANCE_LAYER,PREVIOUS_CLOSE_STYLE,PREVIOUS_CLOSE_HA_STYLE,appearanceBoolean,rendererPatchIsNoop},providedIndicators);
}
/** Actual restricted worker + Runtime/port/native core. Native setMarket scheduling is controlled; no GUI claim. */
export async function logicalScriptFixture(options:{style?:string;rows?:Bar[];settings?:Record<string,unknown>;live?:boolean}={}){
 const h=await nativeCoreHarness();let acquiredProducer:{close():void}|undefined,acquiredIndicators:{dispose():void}|undefined,acquiredPort:{dispose():void}|undefined,acquiredRuntime:{dispose():void}|undefined,releaseHandleFactory:(()=>void)|undefined,released=false;
 const cleanup=()=>{if(released)return;released=true;const errors:unknown[]=[];for(const release of [()=>acquiredRuntime?.dispose(),()=>acquiredPort?.dispose(),()=>acquiredProducer?.close(),()=>acquiredIndicators?.dispose(),()=>releaseHandleFactory?.(),()=>h.dispose()])try{release();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Synthetic derived fixture cleanup failed.');};
 try{
 // Match actual Vela construction's builtin registry prerequisite, without copying or replacing the SDK transform.
 const sdk=await import(/* @vite-ignore */ pathToFileURL(resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js')).href);sdk.registerBuiltinChartTypes();
 h.core.registry.records=h.records;h.native.animator={active:false,stop(){this.active=false;}};
 const originalAddNative=h.chart.addNativeIndicator,ownedAddNative:typeof originalAddNative=type=>{const handle=originalAddNative.call(h.chart,type),record=h.records.get(handle.id);if(!record?.native?.instance)throw Error('The actual native start did not publish its owned instance.');record.native.started=true;(handle as unknown as {setVisibleState(value:boolean):void}).setVisibleState=()=>{};handle.setVisible=visible=>h.core.setVisible(handle.id,visible);return handle;};
 h.chart.addNativeIndicator=ownedAddNative;releaseHandleFactory=()=>{if(h.chart.addNativeIndicator===ownedAddNative)h.chart.addNativeIndicator=originalAddNative;};
 h.native.inputsUI.setTheme=()=>{};
 h.renderer.applyConfig({animations:{intro:false}});
 const dataset=fixtureDataset('GME',3),style=options.style??'renko',settings={boxMethod:'Traditional',boxSize:2,reversalMethod:'Traditional',reversalAmount:2,source:'close',wicks:false,range:2,phantomBars:true,...options.settings};let rows=(options.rows??logicalSourceRows()).map(row=>({...row}));
 dataset.resolution='1m';dataset.instrument={...dataset.instrument,tickSize:1};dataset.bars=rows;if(options.live){stampLiveLineage(rows,'SYNTHETIC-derived-live',0);dataset.provenance={...dataset.provenance,datasetId:'live:SYNTHETIC-derived',fixture:true};}
 let source=sourceContextForDataset(dataset),execution='ordinary',input={bars:rows,source,style,execution},nativeCalls=0,styleValue=style;const config:any={chartTypes:{[style]:settings}};
 const facade={get:(key:string)=>key==='priceStyle'?styleValue:undefined,getConfig:()=>config,set:(key:string,value:any)=>{if(key==='priceStyle')styleValue=value;},applyConfig:(patch:any)=>{if(patch.chartTypes)for(const[key,value]of Object.entries(patch.chartTypes))config.chartTypes[key]={...config.chartTypes[key],...(value as any)};}};(h.chart as any).renderer=facade;
 const nativeWrite=(data:any[])=>{h.core.rawBars=[];h.core.syncBarTransform(style==='heikinashi'?'heikinashi':'candles');h.core.setBarSeries(data,{clearing:true,preserveView:true});h.native.coords.setSize(400,200,1);};
 let nativeGate:((data:any[])=>Promise<void>)|null=null,latestNative:Promise<void>=Promise.resolve();(h.chart as any).setMarket=({data}:any)=>{nativeCalls++;return latestNative=(async()=>{if(nativeGate)await nativeGate(data);else nativeWrite(data);})();};
 const panes:any={info(handle:any){const row=h.records.get(handle.id);return row?.model?{id:row.model.paneId,indicators:[{id:handle.id,ownScale:false}]}:undefined;},bind(){},renderer:(id:string)=>id,logical:(id:string)=>id};
 let produced:any;const nativeIndicators=createIndicatorPort(h.chart,panes,()=>produced.indicatorRows(rows),()=>rows,h.bridge.claim,()=>({style,resolution:'1m'}));
 acquiredIndicators=nativeIndicators;produced=adapterDerivedProducer(h.chart,input,nativeIndicators);acquiredProducer=produced;await produced.applyMarket();
 const settle=async()=>{for(let index=0;index<8;index++){const latest=latestNative;await latest;await Promise.resolve();if(latestNative!==latest)continue;if(!produced.busy())break;}if(produced.busy())throw Error('Controlled latest native apply has not completed.');if(produced.error())throw Error(produced.error());};
 const port=createScriptPort(h.chart,panes,h.bridge.claim,produced.host);acquiredPort=port;const queue=new ScriptJobQueue(1),statuses:any[]=[],executions:any[]=[],binding:ScriptBinding={id:'SYNTHETIC-logical-study',documentId:'SYNTHETIC-logical-document',name:'Synthetic logical study',version:1,source:'({onBar(ctx){ctx.plot("Close",ctx.bar.close);}})',pane:'price',visible:true,plots:{}};
 let workerCalls=0,notify:((rows:any[])=>void)|undefined;const bridge={async executeScript(value:any){workerCalls++;try{return{ok:true as const,value:await executeSnapshot(value)};}catch(error){return{ok:false as const,error:{code:(error as any).code??'SCRIPT_FAILED',message:String((error as Error).message)}};}},async cancel(){return{ok:true as const,value:{cancelled:true}};}};
 const runtime=new ScriptBindingRuntime(port,value=>{statuses.push(value);notify?.(value);},value=>executions.push(value),value=>executeScriptOnBars({...value,bridge,queue}));acquiredRuntime=runtime;
 const csvOwner={get input(){return input;},get execution(){return execution;},assertCurrent(value:ScriptBinding){if(value.id!==binding.id||value.source!==binding.source)throw Error('Synthetic binding retired');}};
 const context=()=>{const logical=isDerivedStyle(style),receipt=logical?produced.capture({input,execution}):null;if(logical&&(!receipt||!receipt.isCurrent()))throw Error('Synthetic actual native frame is not fully accepted.');return{bars:logical?receipt.bars:produced.calculation(),identity:'SYNTHETIC-script-'+source.revision+style,fixture:true,bindings:[binding],ready:true,csvJobOwner:csvOwner,...(logical?{chartPositionMode:'logical-v1' as const}:{})};};
 const stageInput=(next:Bar[],run=execution)=>{rows=next.map(row=>({...row}));if(options.live)stampLiveLineage(rows,'SYNTHETIC-derived-live',1);dataset.bars=rows;source=sourceContextForDataset(dataset);execution=run;input={bars:rows,source,style,execution};retireScriptPresentationPort(port);produced.publish(input);};
 return{...h,port,runtime,binding,produced,nativeIndicators,settings,statuses,executions,workerCalls:()=>workerCalls,stage:stageInput,setExecution(run:string){execution=run;input={...input,execution};produced.setExecution(run);},apply:async()=>{await produced.applyMarket();for(const model of h.instances.values())model.onBars();},settle,nativeWrite,setNativeGate:(value:typeof nativeGate)=>{nativeGate=value;},nativeCalls:()=>nativeCalls,get rows(){return rows;},get input(){return input;},memo:()=>produced.memo(),context,
  start(code=binding.source){binding.source=code;return new Promise<void>((resolve,reject)=>{notify=value=>{const row=value.find(row=>row.id===binding.id);if(row?.status==='ready'){notify=undefined;resolve();}else if(row?.status==='error'){notify=undefined;reject(Error(row.message));}};runtime.update(context());});},
  record(){const row=port.list().find(row=>row.id===binding.id);if(!row)throw Error('Synthetic script model missing');return h.records.get(row.rendererId);},
  view(){const view=port.captureReadout?.(binding.id);if(view?.state!=='ready')throw Error('Synthetic logical readout unavailable');return view;},
  async replace(next:Bar[],run=execution){stageInput(next,run);await produced.applyMarket();for(const model of h.instances.values())model.onBars();},
  dispose:cleanup,
 };
 }catch(error){try{cleanup();}catch(cleanupError){throw new AggregateError([error,cleanupError],'Synthetic derived fixture setup and cleanup failed.');}throw error;}
}
