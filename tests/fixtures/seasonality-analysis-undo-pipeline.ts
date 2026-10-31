import {captureSeasonalityNativeOrigin} from '../../src/chart/seasonality-native-origin';
import {NativeRenderer,getNativeIndicator,chartTypes,RendererControl} from '@luxalgo/vela';
import {commitChartStyle} from '../../src/chart/style-transaction';
import {APPEARANCE_LAYER,PREVIOUS_CLOSE_STYLE,PREVIOUS_CLOSE_HA_STYLE,appearanceBoolean} from '../../src/chart/appearance-layer';
import {acceptChartInput} from '../../src/chart/input-lifecycle';
import {createPaneRegistry} from '../../src/chart/pane-registry';
import {createRendererFramePort,coreModelAbsence} from '../../src/chart/renderer-frame';
import {createAnalysisTransactionEngine} from '../../src/chart/analysis-transaction';
import type {IndicatorSnapshot} from '../../src/chart/indicator-settings';
import {historicalPaneKey,type HistoricalChartFrame} from '../../src/chart/historical-frame';
import {CHART_TYPES} from '../../src/chart/chart-types';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import {nativeCoreHarness} from '../chart/native-core-harness';
import {createIndicatorPortWithPrimarySource} from '../../src/chart/indicator-port';
import {createMarketQueue} from '../../src/chart/market-queue';
import {cloneProfileInputBars,profileCloneProducerInputMatches} from '../../src/chart/profile-input-clone';
import {sourceContextForDataset,sourceContextForInput,localCandleSourceInputMatches,producerCompletionSourceInputMatches,sameChartSourceBasis} from '../../src/chart/source-context';
import {calculationBarsForStyle,createCalculationBarCache} from '../../src/chart/calculation-bars';
import {barInputIdentity,isLiveInputIdentity} from '../../src/chart/bar-input-identity';
import {requireVolume} from '../../src/chart/contracts';
import {isDerivedStyle} from '../../src/chart/derived/common';
import {createImportDraft,prepareImportDraft,exampleDraft} from '../../src/domain/data-setup';
import type {Bar,BarDataset} from '../../src/domain/types';
import type {PrimarySourceRequest,OwnedPrimarySourceHost} from '../../src/chart/seasonality-source';
export const stamp=(date:string)=>Date.parse(date+'T00:00:00Z')/1000;
export function monthlyLocal(){
 const dates=['2015-12',...Array.from({length:12},(_,i)=>'2016-'+String(i+1).padStart(2,'0')),'2017-01'],closes=[125,110,120,115,130,125,120,130,140,135,140,130,135,142];
 const text='date,symbol,open,high,low,close,volume,label\n'+dates.map((date,index)=>{const c=closes[index];return `${date}-01,SYNTHETIC,${c-10},${c+40},${c-20},${c},100,SYNTHETIC EXAMPLE - not market data`;}).join('\n');
 const draft={...createImportDraft(),text,symbol:'SYNTHETIC',exchange:'SYNTHETIC-EXAMPLE',resolution:'1M',adjustment:'raw' as const,session:'unknown' as const,sourceLabel:'SYNTHETIC monthly source exercise'};
 const result=prepareImportDraft(draft,{now:stamp('2024-01-01')});if(!result.dataset)throw Error(result.preview.headline);return result.dataset;
}
export function dailyLocal(){const result=prepareImportDraft(exampleDraft('seasonality-equity-csv'),{now:stamp('2024-01-01')});if(!result.dataset)throw Error(result.preview.headline);return result.dataset;}
export function sourceRequest(signal=new AbortController().signal):PrimarySourceRequest{return{calendar:'utc-continuous',session:'continuous',dateLabels:'utc-date',closedThrough:stamp('2024-01-01'),startYear:2016,endYear:2017,excludedMonths:'',includeDevelopingInSummaries:false,meanRow:true,deviationRow:true,positiveFrequencyRow:true,projectionGeometry:true,signal};}

/** Actual adapter source/native observer block, actual port, actual queue and pinned native core.
 * Only SDK async transport scheduling and the adapter's private input writes are controlled in memory.
 * No DOM, owner data, public registrar or capture-for-tests production method is involved. */
async function nativePipelineBaseFixture(options:{dataset?:BarDataset;style?:string;deferInitial?:boolean}={}){
 const h=await nativeCoreHarness();let acquiredActual:{close():void}|undefined,released=false;
 const originalAddNative=h.chart.addNativeIndicator;
 // ORIGINAL SDK add -> await readyPromise -> startNativeIndicator is used;
 // neither native start nor the accepted model is fabricated synchronously.
 const ownedAddNative:typeof originalAddNative=type=>h.core.addNativeIndicator(type);
 const restoreHandleFactory=()=>{if(h.chart.addNativeIndicator===ownedAddNative)h.chart.addNativeIndicator=originalAddNative;};
 const cleanup=()=>{if(released)return;released=true;const failures:unknown[]=[];for(const release of [()=>acquiredActual?.close(),restoreHandleFactory,()=>h.dispose()])try{release();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Synthetic Seasonality fixture cleanup failed.');};
 try{
 h.chart.addNativeIndicator=ownedAddNative;
 const sdkPath=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),sdk=await import(/* @vite-ignore */pathToFileURL(sdkPath).href);sdk.registerBuiltinChartTypes();
 const installed=readFileSync(sdkPath,'utf8'),registryFrom=installed.indexOf('var IndicatorRegistry = class {'),registryTo=installed.indexOf(String.fromCharCode(10)+'};',registryFrom)+3;
 if(registryFrom<0||registryTo<=registryFrom)throw Error('Actual pinned registry class boundary missing.');
 const registryText=installed.slice(registryFrom,registryTo),Registry=Function(registryText+';return IndicatorRegistry;')(),registry=new Registry();registry.records=h.records;h.core.registry=registry;
 const panesFrom=installed.indexOf('var PanesControl = class {'),panesTo=installed.indexOf(String.fromCharCode(10)+'};',panesFrom)+3;if(panesFrom<0||panesTo<=panesFrom)throw Error('Actual pinned panes control boundary missing.');
 const Panes=Function(installed.slice(panesFrom,panesTo)+';return PanesControl;')();(h.chart as unknown as {panes:unknown}).panes=new Panes(h.core);
 h.core.registry.records=h.records;h.native.inputsUI.setTheme=()=>{};h.native.inputsUI.setStatus=()=>{};h.native.animator={active:false,stop(){this.active=false;}};h.renderer.applyConfig({animations:{intro:false}});h.core.readyPromise=Promise.resolve();h.core.config={market:{symbol:'SYNTHETIC',timeframe:'1M'},live:false};h.core.replayQueue=null;h.core.dataControl={};
 if(!options.dataset)throw Error('The live fixture requires the genuine synthetic provider dataset.');const dataset=options.dataset,initialBars=dataset.bars,initialStyle=options.style??'candles';
 const nativeWriteTo=(core:any,data:any[])=>{core.setBarSeries(data,{clearing:true,preserveView:true});core.renderer.coords.setSize(400,200,1);core.notifySessionsBars();},nativeWrite=(data:any[])=>nativeWriteTo(h.core,data);
 Object.assign(h.core,{generation:0,supersedeWaiters:[],replayCarrying:null,typeEngines:new Map(),resolveHistoryComplete(){},feed:{},stopLive(){},startLive(){},loadMarket:async()=>{nativeWriteTo(h.core,h.core.config.market.data);}});
 (h.chart as unknown as {renderer:RendererControl}).renderer=new RendererControl(h.renderer);
 h.core.rawBars=[];h.core.syncBarTransform(initialStyle);nativeWrite(initialBars.map(row=>({...row,time:row.time*1000})));
 const routes={reloads:0,grows:0},applyBar=h.core.applyBar;
 h.core.applyBar=function(this:unknown,...args:unknown[]){routes.grows++;return Reflect.apply(applyBar,this,args);};
 let gate:((data:any[])=>Promise<void>)|null=null,readyResolve!:()=>void;const initialReady=options.deferInitial?new Promise<void>(resolve=>{readyResolve=resolve;}):Promise.resolve();
 (h.chart as any).ready=()=>initialReady;(h.chart as any).setMarket=function(this:any,{data}:any){routes.reloads++;const core=this.orchestrator;return gate?gate(data):core.setMarket({data});};
 const sourceRoot=process.env.LV_SEASONALITY_PIPELINE_SOURCE_ROOT??'.',text=readFileSync(resolve(sourceRoot,'src/chart/adapter.ts'),'utf8').replace(/\r\n/g,'\n');
 const from=text.indexOf('  // Primary-source ownership is separate'),to=text.indexOf('  const currentBarInterval=',from);if(from<0||to<0)throw Error('Actual primary native observer block is missing.');
 const introFrom=text.indexOf('  let primarySourceControl:OwnedPrimarySourceControl|null=null;'),introTo=text.indexOf('  function createIndicatorPort(...args:',introFrom);if(introFrom<0||introTo<0)throw Error('Actual source host construction is missing.');
 const wrapperTo=text.indexOf('  const indicators=createIndicatorPort(',introTo);if(wrapperTo<0)throw Error('Actual adapter port wrapper is missing.');
 const identitySeed=text.split('\n').find(line=>line.includes('const primaryConstructorIdentity='));if(!identitySeed)throw Error('Actual constructor native seed is missing.');
 const publication=text.split('\n').find(line=>line.includes('const analysisPublication:AnalysisPublicationHost='));if(!publication)throw Error('Actual publication owner is missing.');
 const writeFrom=text.indexOf('  const writeMarketInput='),writeTo=text.indexOf('  let lastCrosshair:',writeFrom),setBars=text.split('\n').find(line=>line.includes('    setBars:')),toVela=text.split('\n').find(line=>line.startsWith('export function toVelaBars('));
 if(writeFrom<0||writeTo<=writeFrom||!setBars||!toVela)throw Error('Actual full market pipeline boundary missing.');
 // applyRendererConfig calls the module-level rendererPatchIsNoop (with its plainRecord/sameConfigValue
 // helpers); take the actual helper block that sits just above toVelaBars.
 const patchFrom=text.indexOf('const plainRecord='),patchTo=text.indexOf('\nexport function toVelaBars(',patchFrom),rendererPatch=text.slice(patchFrom,patchTo).replace('export function rendererPatchIsNoop(','function rendererPatchIsNoop(');
 if(patchFrom<0||patchTo<=patchFrom||!rendererPatch.includes('function rendererPatchIsNoop('))throw Error('Actual renderer patch helper is missing.');
 const styleFrom=text.indexOf('    setStyle: (style: string) => {'),styleTo=text.indexOf('    setRange:',styleFrom),applyStyleFrom=text.indexOf('  const applyRequestedStyle=()=>{'),applyStyleTo=text.indexOf('  const drawingSubscribers=',applyStyleFrom);
 const inputMethods=['isInputExact:','isInputOwned:','isInputCurrent:','getStyle:'].map(marker=>text.split('\n').find(line=>line.trimStart().startsWith(marker)));
 const rendererConfig=text.split('\n').find(line=>line.startsWith('  const applyRendererConfig=')),label=text.split('\n').find(line=>line.startsWith('  const chartTypeLabel='));
 if(styleFrom<0||styleTo<=styleFrom||applyStyleFrom<0||applyStyleTo<=applyStyleFrom||inputMethods.some(line=>!line)||!rendererConfig||!label)throw Error('Actual style/input controller boundary missing.');
 const inventory=text.split('\n').find(line=>line.startsWith('  const analysisInventory=')),placement=text.split('\n').find(line=>line.startsWith('  const waitPlacement=')),layout=text.split('\n').find(line=>line.startsWith('  const applyPaneLayout=')),historical=text.split('\n').find(line=>line.startsWith('  const applyHistorical='));
 if(!inventory||!placement||!layout||!historical)throw Error('Actual analysis/native snippets missing.');
 const code=`function build(injected){
 const {chart,bars,sourceContext,initialStyle,initialReady,cloneProfileInputBars,profileCloneProducerInputMatches,sourceContextForInput,sourceContextForDataset,createMarketQueue,createIndicatorPortWithPrimarySource,calculationBarsForStyle,isDerivedStyle,localCandleSourceInputMatches,producerCompletionSourceInputMatches,sameChartSourceBasis,barInputIdentity,isLiveInputIdentity,createCalculationBarCache,requireVolume,claim,NativeRenderer,captureSeasonalityNativeOrigin,chartTypes,commitChartStyle,APPEARANCE_LAYER,PREVIOUS_CLOSE_STYLE,PREVIOUS_CLOSE_HA_STYLE,appearanceBoolean,acceptChartInput,CHART_TYPES,createPaneRegistry,createRendererFramePort,coreModelAbsence,createAnalysisTransactionEngine,historicalPaneKey}=injected;
 let disposed=false,analysisUnavailable='',analysisPending=0,marketUpdating=false,requestedStyle=initialStyle,currentExecutionIdentity='ordinary',vwapSourceEpoch={},lastCrosshair=null,fedDerivedKey=null,derivedMemo=null,calculationBarCache=createCalculationBarCache();
 let currentBars=cloneProfileInputBars(bars),currentSource=sourceContextForInput(sourceContext,bars),lastAppearance=null;
 const primaryConstructorSeed={source:new WeakRef(sourceContext),bars:new WeakRef(bars)},primaryConstructorReady=initialReady;
 ${identitySeed}
 ${text.slice(introFrom,introTo)}
 const unavailable=message=>{analysisUnavailable=message;};
 ${publication}
 // These empty-owner notification sinks have no statistics/scripts/VWAP,
 // derived chart or drawings in this SYNTHETIC Candles fixture. Source/native
 // ownership, exact write/apply/queue and all numerical proofs remain actual.
 const scripts={invalidateResults(){},list:()=>[],placementStatus:()=>({ready:true})},retireStatisticsSource=()=>{},retireVwapSource=()=>{vwapSourceEpoch={};port.invalidateVwap();},queueInlineRefresh=()=>{},reprojectDrawings=()=>{},publishDerivedPayload=()=>{},derivedFeedKey=()=>null,velaFeed=rows=>calculationBarsForStyle(rows,requestedStyle),restoreRejectedVwapInput=result=>result,EMPTY_MARKET_MESSAGE='SYNTHETIC empty pipeline input';
 ${toVela.replace('export ','')}
 ${rendererPatch}
 ${text.slice(writeFrom,writeTo)}
 ${text.slice(from,to)}
 ${text.slice(introTo,wrapperTo)}
 const primaryHost=primarySourceHost;
 const paneRegistry=createPaneRegistry(chart);
 const port=createIndicatorPort(chart,paneRegistry,rows=>calculationBarsForStyle(rows,requestedStyle),()=>currentBars,claim,()=>({style:requestedStyle,resolution:currentSource.resolution}),analysisPublication),owned={port,primary:primarySourceControl};const indicators=port;
 ${rendererConfig}
 ${label}
 ${text.slice(applyStyleFrom,applyStyleTo)}
 const controller={${setBars}
 ${text.slice(styleFrom,styleTo)}
 ${inputMethods.join('\n')}
 ready:()=>chart.ready()};
 const comparisons={list:()=>[]},document={all:()=>[]},rendererFrames=createRendererFramePort(chart.orchestrator.renderer,coreModelAbsence(chart,chart.orchestrator.renderer)),undoEvents=[];
 ${inventory}
 ${placement}
 ${layout}
 ${historical}
 const snapshot=(fingerprints)=>({indicators:port.serialize(),frame:rendererFrames.captureHistorical(analysisInventory(),{source:currentSource,style:requestedStyle,calculationFingerprints:fingerprints},chart.panes.list().map(({id,order,collapsed,maximized})=>({id,order,collapsed,maximized})))});
 const engine=createAnalysisTransactionEngine({exclusive:marketQueue.exclusive,validate:()=>rendererFrames.assertAvailable(analysisInventory()),noOp:()=>false,
 capture:()=>({indicators:port.serialize(),frame:rendererFrames.capture(analysisInventory()),inventory:analysisInventory(),aliases:paneRegistry.snapshot(),serialized:port.serialize()}),
 hold:()=>port.beginExternalTransaction(),
 apply:async target=>{undoEvents.push({phase:'apply-before',inventory:analysisInventory(),aliases:paneRegistry.snapshot(),serialized:port.serialize()});port.restore(target.indicators);undoEvents.push({phase:'apply-after',inventory:analysisInventory(),aliases:paneRegistry.snapshot(),serialized:port.serialize()});},
 settle:async target=>{await waitPlacement();undoEvents.push({phase:'before-historical',inventory:analysisInventory(),aliases:paneRegistry.snapshot(),serialized:port.serialize()});try{applyHistorical(target.frame,target.fingerprints);}catch(error){undoEvents.push({phase:'historical-error',error:String(error),inventory:analysisInventory(),aliases:paneRegistry.snapshot(),serialized:port.serialize()});throw error;}},
 restore:async prior=>{undoEvents.push({phase:'restore-before',inventory:analysisInventory(),aliases:paneRegistry.snapshot(),serialized:port.serialize()});port.restore(prior.indicators);await waitPlacement();undoEvents.push({phase:'restore-frame',before:prior.inventory,inventory:analysisInventory(),aliases:paneRegistry.snapshot(),serialized:port.serialize()});rendererFrames.restore(prior.frame,analysisInventory());},
 scripts:()=>({changed:false,pauseAndCapture(){},stage(){},rollback(){},resume(){},abandon(){}}),pending:active=>{analysisPending+=active?1:-1;undoEvents.push({phase:'pending',value:analysisPending});},broken:message=>{analysisUnavailable=message;undoEvents.push({phase:'broken',message});}});
 const off=marketQueue.subscribeSettled(notifyPrimarySourceSettled);
 return{port:owned.port,primary:owned.primary,host:primaryHost,queue:marketQueue,raw:()=>currentBars,source:()=>currentSource,
  controller,undoEvents,inventory:analysisInventory,snapshot,prepareUndo:(target,fingerprints)=>engine.prepare({...target,fingerprints}),
  accept(data,selected=data.bars){return acceptChartInput(controller,{bars:selected,source:sourceContextForDataset(data,selected),style:requestedStyle},()=>!disposed);},
  async apply(data,selected=data.bars,execution='ordinary'){currentExecutionIdentity=execution;return this.controller.setBars(selected,sourceContextForDataset(data,selected));},
  stage(data,selected=data.bars,execution='ordinary'){vwapSourceEpoch={};currentExecutionIdentity=execution;currentSource=sourceContextForInput(sourceContextForDataset(data,selected),selected);currentBars=cloneProfileInputBars(selected);},
  reloadCurrent(){return marketQueue.exclusive(()=>applyMarketInput(currentBars));},
  applyStaged(){marketUpdating=true;return chart.setMarket({data:currentBars.map(row=>({...row,time:row.time*1000}))}).finally(()=>{marketUpdating=false;notifyPrimarySourceSettled();});},
  style(value){requestedStyle=value;vwapSourceEpoch={};chart.orchestrator.syncBarTransform(value);owned.port.recompute();},
  hold(value){analysisPending=value;},wake:notifyPrimarySourceSettled,close(){if(disposed)return;disposed=true;off();disposePrimarySource();owned.port.dispose();}
 };
 }`;
 const build=Function(stripTypeScriptTypes(code,{mode:'transform'})+';return build;')();
 const actual=build({chart:h.chart,bars:initialBars,sourceContext:sourceContextForDataset(dataset,initialBars),initialStyle,initialReady,cloneProfileInputBars,profileCloneProducerInputMatches,sourceContextForInput,sourceContextForDataset,createMarketQueue,createIndicatorPortWithPrimarySource,calculationBarsForStyle,isDerivedStyle,localCandleSourceInputMatches,producerCompletionSourceInputMatches,sameChartSourceBasis,barInputIdentity,isLiveInputIdentity,createCalculationBarCache,requireVolume,claim:h.bridge.claim,NativeRenderer,captureSeasonalityNativeOrigin,chartTypes,commitChartStyle,APPEARANCE_LAYER,PREVIOUS_CLOSE_STYLE,PREVIOUS_CLOSE_HA_STYLE,appearanceBoolean,acceptChartInput,CHART_TYPES,createPaneRegistry,createRendererFramePort,coreModelAbsence,createAnalysisTransactionEngine,historicalPaneKey}) as {port:ReturnType<typeof createIndicatorPortWithPrimarySource>['port'];primary:ReturnType<typeof createIndicatorPortWithPrimarySource>['primary'];host:OwnedPrimarySourceHost;queue:ReturnType<typeof createMarketQueue>;controller:Parameters<typeof acceptChartInput>[0];undoEvents:unknown[];inventory():import('../../src/chart/analysis-transaction').AnalysisPaneInventory;snapshot(fingerprints:Record<string,string>):{indicators:IndicatorSnapshot[];frame:HistoricalChartFrame};prepareUndo(target:{indicators:IndicatorSnapshot[];frame:HistoricalChartFrame},fingerprints:Record<string,string>):Promise<import('../../src/chart/analysis-transaction').PreparedAnalysisLease>;accept(data:BarDataset,selected?:Bar[]):ReturnType<typeof acceptChartInput>;raw():Bar[];source():ReturnType<typeof sourceContextForDataset>;apply(data:BarDataset,selected?:Bar[],execution?:string):ReturnType<ReturnType<typeof createMarketQueue>['set']>;stage(data:BarDataset,selected?:Bar[],execution?:string):void;reloadCurrent():Promise<unknown>;applyStaged():Promise<void>;style(value:string):void;hold(value:number):void;wake():void;close():void};
 acquiredActual=actual;
 const id=actual.port.add('sma',{length:2});for(let index=0;index<40;index++)await Promise.resolve();
 return{...h,...actual,id,dataset,routes,initialDone(){readyResolve?.();},nativeWrite,setGate(value:((data:any[])=>Promise<void>)|null){gate=value;},dispose:cleanup};
 }catch(error){try{cleanup();}catch(cause){throw new AggregateError([error,cause],'Synthetic Seasonality setup and cleanup failed.');}throw error;}
}

/** NEW actual pipeline fixture. The installed SDK owns native add/start/stop,
 * restart, setMarket and applyBar; controlled loading supplies only local rows.
 * This is executable source/native coverage, not DOM/Electron evidence. */
export const ownedAnalysisUndoPipelineFixture=nativePipelineBaseFixture;
