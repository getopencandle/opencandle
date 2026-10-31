import {NativeRenderer,getNativeIndicator} from '@luxalgo/vela';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import {nativeCoreHarness} from '../chart/native-core-harness';
import {createIndicatorPortWithPrimarySource} from '../../src/chart/indicator-port';
import {createMarketQueue} from '../../src/chart/market-queue';
import {cloneProfileInputBars} from '../../src/chart/profile-input-clone';
import {sourceContextForDataset,sourceContextForInput,localCandleSourceInputMatches} from '../../src/chart/source-context';
import {calculationBarsForStyle} from '../../src/chart/calculation-bars';
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
async function calendarBaseFixture(options:{dataset?:BarDataset;style?:string;deferInitial?:boolean}={}){
 const h=await nativeCoreHarness();let acquiredActual:{close():void}|undefined,released=false;
 const originalAddNative=h.chart.addNativeIndicator,ownedAddNative:typeof originalAddNative=type=>{
 // The shared synthetic facade starts every descriptor synchronously. Real Vela
 // skips a restored-hidden native instance. Preserve that actual lifecycle here
 // without executing or fabricating any hidden output: show later runs ORIGINAL
 // core.startNativeIndicator and the restored ORIGINAL model.start.
 const model=getNativeIndicator(type)?.create() as any,hidden=model?.settings?.visible===false,ownStart=hidden?Object.getOwnPropertyDescriptor(model,'start'):undefined;
 if(hidden)model.start=()=>{};
 let handle:ReturnType<typeof originalAddNative>;
 try{handle=originalAddNative.call(h.chart,type);}finally{if(hidden){if(ownStart)Object.defineProperty(model,'start',ownStart);else delete model.start;}}
 const record=h.records.get(handle.id);if(!record?.native?.instance)throw Error('The actual native start did not publish its owned instance.');record.native.started=!hidden;(handle as unknown as {emit(name:string,value:unknown):void}).emit=()=>{};(handle as unknown as {setVisibleState(value:boolean):void}).setVisibleState=()=>{};handle.setVisible=visible=>h.core.setVisible(handle.id,visible);return handle;};
 const restoreHandleFactory=()=>{if(h.chart.addNativeIndicator===ownedAddNative)h.chart.addNativeIndicator=originalAddNative;};
 const cleanup=()=>{if(released)return;released=true;const failures:unknown[]=[];for(const release of [()=>acquiredActual?.close(),restoreHandleFactory,()=>h.dispose()])try{release();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Synthetic Seasonality fixture cleanup failed.');};
 try{
 h.chart.addNativeIndicator=ownedAddNative;
 const sdk=await import(/* @vite-ignore */pathToFileURL(resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js')).href);sdk.registerBuiltinChartTypes();
 h.core.registry.records=h.records;h.native.inputsUI.setTheme=()=>{};h.native.inputsUI.setStatus=()=>{};h.native.animator={active:false,stop(){this.active=false;}};h.renderer.applyConfig({animations:{intro:false}});h.core.readyPromise=Promise.resolve();h.core.config={market:{symbol:'SYNTHETIC',timeframe:'1M'},live:false};h.core.replayQueue=null;h.core.dataControl={};
 const dataset=options.dataset??monthlyLocal(),initialBars=dataset.bars,initialStyle=options.style??'candles';
 const nativeWriteTo=(core:any,data:any[])=>{core.setBarSeries(data,{clearing:true,preserveView:true});core.renderer.coords.setSize(400,200,1);core.notifySessionsBars();},nativeWrite=(data:any[])=>nativeWriteTo(h.core,data);
 h.core.rawBars=[];h.core.syncBarTransform(initialStyle);nativeWrite(initialBars.map(row=>({...row,time:row.time*1000})));
 let gate:((data:any[])=>Promise<void>)|null=null,readyResolve!:()=>void;const initialReady=options.deferInitial?new Promise<void>(resolve=>{readyResolve=resolve;}):Promise.resolve();
 (h.chart as any).ready=()=>initialReady;(h.chart as any).setMarket=function(this:any,{data}:any){const core=this.orchestrator;return gate?gate(data):Promise.resolve().then(()=>nativeWriteTo(core,data));};
 const sourceRoot=process.env.LV_SEASONALITY_CALENDAR_SOURCE_ROOT??'.',text=readFileSync(resolve(sourceRoot,'src/chart/adapter.ts'),'utf8').replace(/\r\n/g,'\n');
 const from=text.indexOf('  // Primary-source ownership is separate'),to=text.indexOf('  const currentBarInterval=',from);if(from<0||to<0)throw Error('Actual primary native observer block is missing.');
 const introFrom=text.indexOf('  let primarySourceControl:OwnedPrimarySourceControl|null=null;'),introTo=text.indexOf('  function createIndicatorPort(...args:',introFrom);if(introFrom<0||introTo<0)throw Error('Actual source host construction is missing.');
 const wrapperTo=text.indexOf('  const indicators=createIndicatorPort(',introTo);if(wrapperTo<0)throw Error('Actual adapter port wrapper is missing.');
 const identitySeed=text.split('\n').find(line=>line.includes('const primaryConstructorIdentity='));if(!identitySeed)throw Error('Actual constructor native seed is missing.');
 const publication=text.split('\n').find(line=>line.includes('const analysisPublication:AnalysisPublicationHost='));if(!publication)throw Error('Actual publication owner is missing.');
 const code=`function build(injected){
 const {chart,bars,sourceContext,initialStyle,initialReady,cloneProfileInputBars,sourceContextForInput,sourceContextForDataset,createMarketQueue,createIndicatorPortWithPrimarySource,calculationBarsForStyle,isDerivedStyle,localCandleSourceInputMatches,claim,NativeRenderer}=injected;
 let disposed=false,analysisUnavailable='',analysisPending=0,marketUpdating=false,requestedStyle=initialStyle,currentExecutionIdentity='ordinary',vwapSourceEpoch={};
 let currentBars=cloneProfileInputBars(bars),currentSource=sourceContextForInput(sourceContext,bars);
 const primaryConstructorSeed={source:new WeakRef(sourceContext),bars:new WeakRef(bars)},primaryConstructorReady=initialReady;
 ${identitySeed}
 ${text.slice(introFrom,introTo)}
 const unavailable=message=>{analysisUnavailable=message;};
 ${publication}
 const marketQueue=createMarketQueue({read:()=>({bars:currentBars,source:currentSource}),write:next=>{vwapSourceEpoch={};currentBars=next.bars;currentSource=next.source;},disposed:()=>disposed,apply:async next=>{marketUpdating=true;try{await chart.setMarket({data:next.map(row=>({...row,time:row.time*1000}))});}finally{marketUpdating=false;}}});
 ${text.slice(from,to)}
 ${text.slice(introTo,wrapperTo)}
 const primaryHost=primarySourceHost;
 const port=createIndicatorPort(chart,undefined,rows=>calculationBarsForStyle(rows,requestedStyle),()=>currentBars,claim,()=>({style:requestedStyle,resolution:currentSource.resolution}),analysisPublication),owned={port,primary:primarySourceControl};
 const off=marketQueue.subscribeSettled(notifyPrimarySourceSettled);
 return{port:owned.port,primary:owned.primary,host:primaryHost,queue:marketQueue,raw:()=>currentBars,source:()=>currentSource,
  async apply(data,selected=data.bars,execution='ordinary'){currentExecutionIdentity=execution;return marketQueue.set(selected,sourceContextForDataset(data,selected));},
  stage(data,selected=data.bars,execution='ordinary'){vwapSourceEpoch={};currentExecutionIdentity=execution;currentSource=sourceContextForInput(sourceContextForDataset(data,selected),selected);currentBars=cloneProfileInputBars(selected);},
  applyStaged(){marketUpdating=true;return chart.setMarket({data:currentBars.map(row=>({...row,time:row.time*1000}))}).finally(()=>{marketUpdating=false;notifyPrimarySourceSettled();});},
  style(value){requestedStyle=value;vwapSourceEpoch={};chart.orchestrator.syncBarTransform(value);owned.port.recompute();},
  hold(value){analysisPending=value;},wake:notifyPrimarySourceSettled,close(){if(disposed)return;disposed=true;off();disposePrimarySource();owned.port.dispose();}
 };
 }`;
 const build=Function(stripTypeScriptTypes(code,{mode:'transform'})+';return build;')();
 const actual=build({chart:h.chart,bars:initialBars,sourceContext:sourceContextForDataset(dataset,initialBars),initialStyle,initialReady,cloneProfileInputBars,sourceContextForInput,sourceContextForDataset,createMarketQueue,createIndicatorPortWithPrimarySource,calculationBarsForStyle,isDerivedStyle,localCandleSourceInputMatches,claim:h.bridge.claim,NativeRenderer}) as {port:ReturnType<typeof createIndicatorPortWithPrimarySource>['port'];primary:ReturnType<typeof createIndicatorPortWithPrimarySource>['primary'];host:OwnedPrimarySourceHost;queue:ReturnType<typeof createMarketQueue>;raw():Bar[];source():ReturnType<typeof sourceContextForDataset>;apply(data:BarDataset,selected?:Bar[],execution?:string):Promise<unknown>;stage(data:BarDataset,selected?:Bar[],execution?:string):void;applyStaged():Promise<void>;style(value:string):void;hold(value:number):void;wake():void;close():void};
 acquiredActual=actual;
 const id=actual.port.add('sma',{length:2});await Promise.resolve();await Promise.resolve();
 return{...h,...actual,id,dataset,initialDone(){readyResolve?.();},nativeWrite,setGate(value:((data:any[])=>Promise<void>)|null){gate=value;},dispose:cleanup};
 }catch(error){try{cleanup();}catch(cause){throw new AggregateError([error,cause],'Synthetic Seasonality setup and cleanup failed.');}throw error;}
}

/** C-local completion of a synthetic facade only. The shared original-core harness omits
 * the handle-map deletion performed by the real SDK removeIndicator. It still owns all
 * actual source/native/model work; this helper neither creates records nor proves values. */
export async function ownedSourceFixture(options:Parameters<typeof calendarBaseFixture>[0]={}){
 const h=await calendarBaseFixture(options),add=h.chart.addNativeIndicator;
 let installed:typeof add|undefined,closed=false;
 const dispose=()=>{
  if(closed)return;closed=true;const failures:unknown[]=[];
  for(const release of [()=>{if(installed&&h.chart.addNativeIndicator===installed)h.chart.addNativeIndicator=add;},()=>h.dispose()])try{release();}catch(error){failures.push(error);}
  if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'C-local synthetic handle cleanup failed.');
 };
 try{
  installed=function(this:typeof h.chart,type){
   const handle=add.call(this,type),record=h.records.get(handle.id);
   if(record?.native?.instance?.settings?.kind!=='seasonality')return handle;
   const core=h.core,renderer=core.renderer,handles=core.handles,remove=handle.remove,id=handle.id;
   if(!(handles instanceof Map)||Object.getPrototypeOf(handles)!==Map.prototype||Map.prototype.get.call(handles,id)!==handle){const error=Error('The actual synthetic C handle was not registered.');try{remove.call(handle);}catch(cleanup){throw new AggregateError([error,cleanup],'Synthetic C acquisition and cleanup failed.');}throw error;}
   handle.remove=function(this:typeof handle){
    let result:ReturnType<typeof remove>|undefined,failure:unknown,failed=false;
    try{result=remove.call(this);}catch(error){failed=true;failure=error;}
    try{
     const models=renderer.scene.indicators;
     // Native work must already have detached. A new record/model/handle at the
     // same id belongs to its replacement and must never be removed here.
     if(core.renderer===renderer&&core.handles===handles&&h.core.registry.records===h.records&&
       models instanceof Map&&Object.getPrototypeOf(models)===Map.prototype&&
       !Map.prototype.has.call(h.records,id)&&!Map.prototype.has.call(models,id)&&
       Map.prototype.get.call(handles,id)===handle)Map.prototype.delete.call(handles,id);
    }catch(error){if(failed)throw new AggregateError([failure,error],'Synthetic native removal and handle completion failed.');throw error;}
    if(failed)throw failure;return result;
   };
   return handle;
  };
  h.chart.addNativeIndicator=installed;
  return{...h,dispose};
 }catch(error){try{dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'C-local fixture setup and cleanup failed.');}throw error;}
}
