import {NativeRenderer} from '@luxalgo/vela';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import {nativeCoreHarness} from '../chart/native-core-harness';
import {createIndicatorPortWithPrimarySource} from '../../src/chart/indicator-port';
import {createMarketQueue} from '../../src/chart/market-queue';
import {cloneProfileInputBars} from '../../src/chart/profile-input-clone';
import * as sourceContextModule from '../../src/chart/source-context';
const {sourceContextForDataset,sourceContextForInput,localCandleSourceInputMatches}=sourceContextModule;
const producerCompletionSourceInputMatches=sourceContextModule.producerCompletionSourceInputMatches;
import {calculationBarsForStyle} from '../../src/chart/calculation-bars';
import {isDerivedStyle} from '../../src/chart/derived/common';
import type {Bar,BarDataset} from '../../src/domain/types';
import type {OwnedPrimarySourceHost} from '../../src/chart/seasonality-source';
/** Original pinned native core + actual adapter ownership block. Transport scheduling and input writes are controlled;
 * no synthetic source host, SDK painter/mapper replacement or production test-only capability is supplied. */
export async function qualifiedMtfNative(dataset:BarDataset,options:{style?:string;deferInitial?:boolean}={}){
 const h=await nativeCoreHarness(),sdk=await import(/* @vite-ignore */pathToFileURL(resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js')).href);sdk.registerBuiltinChartTypes();
 const nativeApplyBar=h.core.applyBar;const originalAdd=h.chart.addNativeIndicator;let actual:{close():void}|undefined,closed=false;const restoreFactory=()=>{if(h.chart.addNativeIndicator===ownedAdd)h.chart.addNativeIndicator=originalAdd;};
 const ownedAdd:typeof originalAdd=function(this:typeof h.chart,type){const handle=originalAdd.call(this,type),record=h.records.get(handle.id);if(!record?.native?.instance)throw Error('The native test start did not retain its instance.');record.native.started=true;(handle as any).setVisibleState=()=>{};handle.setVisible=value=>h.core.setVisible(handle.id,value);const remove=handle.remove;handle.remove=function(this:typeof handle,...args:Parameters<typeof remove>){let failed=false,failure:unknown,value:ReturnType<typeof remove>;try{value=Reflect.apply(remove,this,args);}catch(error){failed=true;failure=error;}if(this===handle&&h.core.handles.get(handle.id)===handle&&!h.records.has(handle.id)&&!h.native.scene.indicators.has(handle.id))h.core.handles.delete(handle.id);if(failed)throw failure;return value!;};return handle;};
 const cleanup=()=>{if(closed)return;closed=true;const failures:unknown[]=[];for(const release of [()=>actual?.close(),restoreFactory,()=>h.dispose()])try{release();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Qualified MTF native cleanup failed.');};
 try{
  h.chart.addNativeIndicator=ownedAdd;
  h.core.registry.records=h.records;h.native.inputsUI.setTheme=()=>{};h.native.inputsUI.setStatus=()=>{};h.native.animator={active:false,stop(){this.active=false;}};h.renderer.applyConfig({animations:{intro:false}});
  const initialStyle=options.style??'candles',initialBars=dataset.bars;h.core.rawBars=[];h.core.syncBarTransform(initialStyle);
  const writeTo=(core:any,rows:any[])=>{core.setBarSeries(rows,{clearing:true,preserveView:true});core.renderer.coords.setSize(400,200,1);core.notifySessionsBars();};writeTo(h.core,initialBars.map(row=>({...row,time:row.time*1000})));
  let gate:((rows:any[])=>Promise<void>)|null=null,readyResolve=()=>{};const initialReady=options.deferInitial?new Promise<void>(resolve=>{readyResolve=resolve;}):Promise.resolve();
  (h.chart as any).setMarket=function(this:any,{data}:any){const core=this.orchestrator;return gate?gate(data):Promise.resolve().then(()=>writeTo(core,data));};
  const text=readFileSync(resolve(process.env.LV_QUALIFIED_MTF_SOURCE_ROOT??'.','src/chart/adapter.ts'),'utf8').replace(/\r\n/g,'\n'),from=text.indexOf('  // Primary-source ownership is separate'),to=text.indexOf('  const currentBarInterval=',from),intro=text.indexOf('  let primarySourceControl:OwnedPrimarySourceControl|null=null;'),introEnd=text.indexOf('  function createIndicatorPort(...args:',intro),seed=text.split('\n').find(line=>line.includes('const primaryConstructorIdentity=')),publication=text.split('\n').find(line=>line.includes('const analysisPublication:AnalysisPublicationHost='));
  if(from<0||to<0||intro<0||introEnd<0||!seed||!publication)throw Error('The actual primary source block/seed/publication is missing.');
  const wrapperEnd=text.indexOf('  const indicators=createIndicatorPort(',introEnd);if(wrapperEnd<0)throw Error('The actual adapter construction wrapper is missing.');
  const cacheFrom=text.indexOf('  const feedRowsMemo='),cacheEnd=text.indexOf('  /** Rows pushed to vela',cacheFrom),derivedFrom=text.indexOf('  const derivedFeedRows=',cacheEnd),derivedEnd=text.indexOf('  /** Renderer feed:',derivedFrom);if(cacheFrom<0||cacheEnd<0||derivedFrom<0||derivedEnd<0)throw Error('The actual standard calculation cache block is missing.');
  const code=`function build(injected){
   const {chart,bars,sourceContext,initialStyle,initialReady,cloneProfileInputBars,sourceContextForInput,sourceContextForDataset,createMarketQueue,createIndicatorPortWithPrimarySource,calculationBarsForStyle,isDerivedStyle,localCandleSourceInputMatches,producerCompletionSourceInputMatches,claim,NativeRenderer}=injected;
   let disposed=false,analysisUnavailable='',analysisPending=0,marketUpdating=false,requestedStyle=initialStyle,currentExecutionIdentity='ordinary',vwapSourceEpoch={};
   let currentBars=cloneProfileInputBars(bars),currentSource=sourceContextForInput(sourceContext,bars);
   ${text.slice(cacheFrom,cacheEnd)}
   ${text.slice(derivedFrom,derivedEnd)}
   const primaryConstructorSeed={source:new WeakRef(sourceContext),bars:new WeakRef(bars)},primaryConstructorReady=initialReady;
   ${seed}
   ${text.slice(intro,introEnd)}
   const unavailable=message=>{analysisUnavailable=message;};${publication}
   let ownerCheckObserver=null;const captureOwner=analysisPublication.captureOwner.bind(analysisPublication);analysisPublication.captureOwner=()=>{const owner=captureOwner();return {...owner,isCurrent(){ownerCheckObserver?.();return owner.isCurrent();}};};
   const marketQueue=createMarketQueue({read:()=>({bars:currentBars,source:currentSource}),write:next=>{vwapSourceEpoch={};currentBars=next.bars;currentSource=next.source;},disposed:()=>disposed,apply:async next=>{marketUpdating=true;try{await chart.setMarket({data:next.map(row=>({...row,time:row.time*1000}))});}finally{marketUpdating=false;}}});
   ${text.slice(from,to)}
   ${text.slice(introEnd,wrapperEnd)}
   const port=createIndicatorPort(chart,undefined,rows=>sharedFeedRows(rows),()=>currentBars,claim,()=>({style:requestedStyle,resolution:currentSource.resolution}),analysisPublication),owned={port,primary:primarySourceControl};
   const off=marketQueue.subscribeSettled(notifyPrimarySourceSettled);
   return{port:owned.port,primary:owned.primary,host:primarySourceHost,raw:()=>currentBars,source:()=>currentSource,
    apply(data,selected=data.bars,execution='ordinary'){currentExecutionIdentity=execution;return marketQueue.set(selected,sourceContextForDataset(data,selected));},
    stage(data,selected=data.bars,execution='ordinary'){vwapSourceEpoch={};currentExecutionIdentity=execution;currentSource=sourceContextForInput(sourceContextForDataset(data,selected),selected);currentBars=cloneProfileInputBars(selected);},
    applyStaged(){marketUpdating=true;return chart.setMarket({data:currentBars.map(row=>({...row,time:row.time*1000}))}).finally(()=>{marketUpdating=false;notifyPrimarySourceSettled();});},
    // Actual ordinary adapter grow semantics: mutate the existing owned array, publish genuine new
    // context before native callbacks, then invoke the actual SDK core. No clone target is registered.
    stageGrow(data,selected=data.bars){const next=cloneProfileInputBars(selected),from=Math.max(0,currentBars.length-1);vwapSourceEpoch={};currentBars.length=from;for(let index=from;index<next.length;index++)currentBars.push(next[index]);currentSource=sourceContextForInput(sourceContextForDataset(data,selected),selected);return from;},
    async grow(data,after){return marketQueue.exclusive(()=>{const next=cloneProfileInputBars(data.bars),from=Math.max(0,currentBars.length-1);vwapSourceEpoch={};currentBars.length=from;for(let index=from;index<next.length;index++)currentBars.push(next[index]);currentSource=sourceContextForInput(sourceContextForDataset(data),data.bars);marketUpdating=true;try{for(let index=from;index<currentBars.length;index++){const row=currentBars[index];chart.orchestrator.applyBar({...row,time:row.time*1000});after?.(index);}}finally{marketUpdating=false;}});},
    copyRaw(){vwapSourceEpoch={};currentBars=[...currentBars];},
    onOwnerCheck(observer){ownerCheckObserver=observer;},hold(value){analysisPending=value;},wake:notifyPrimarySourceSettled,
    close(){if(disposed)return;disposed=true;const failures=[];for(const release of [off,disposePrimarySource,()=>owned.port.dispose()])try{release();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'MTF source fixture close failed.');}
   };
  }`;
  const build=Function(stripTypeScriptTypes(code,{mode:'transform'})+';return build;')();
  const bound=build({chart:h.chart,bars:initialBars,sourceContext:sourceContextForDataset(dataset,initialBars),initialStyle,initialReady,cloneProfileInputBars,sourceContextForInput,sourceContextForDataset,createMarketQueue,createIndicatorPortWithPrimarySource,calculationBarsForStyle,isDerivedStyle,localCandleSourceInputMatches,producerCompletionSourceInputMatches,claim:h.bridge.claim,NativeRenderer}) as {port:ReturnType<typeof createIndicatorPortWithPrimarySource>['port'];primary:ReturnType<typeof createIndicatorPortWithPrimarySource>['primary'];host:OwnedPrimarySourceHost;raw():Bar[];source():ReturnType<typeof sourceContextForDataset>;apply(data:BarDataset,selected?:Bar[],execution?:string):Promise<unknown>;stage(data:BarDataset,selected?:Bar[],execution?:string):void;applyStaged():Promise<void>;stageGrow(data:BarDataset,selected?:Bar[]):number;grow(data:BarDataset,after?:(index:number)=>void):Promise<unknown>;copyRaw():void;onOwnerCheck(observer:(()=>void)|null):void;hold(value:number):void;wake():void;close():void};actual=bound;
  return{...h,...bound,nativeApplyBar,dispose:cleanup,initialDone(){readyResolve();},setGate(value:((rows:any[])=>Promise<void>)|null){gate=value;},nativeWrite(rows:any[]){writeTo((h.chart as any).orchestrator,rows);}};
 }catch(error){try{cleanup();}catch(failure){throw new AggregateError([error,failure],'Qualified MTF setup and cleanup failed.');}throw error;}
}
