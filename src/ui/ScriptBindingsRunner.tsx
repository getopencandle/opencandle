import {scriptCsvBindingKey,type ScriptCsvJobOwner} from '../chart/script-csv-job-proof';
import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {calculationBarsForStyle,type ChartController,type ChartSourceContext} from '../chart/adapter';
import {isDerivedStyle} from '../chart/derived/common';
import {isLiveInputIdentity} from '../chart/bar-input-identity';
import type {Bar} from '../domain/types';
import {scriptExecutionIdentity} from './script-input';
import type {ScriptBinding} from './script-library';
import {ScriptBindingRuntime,type ScriptConfigurationContext,type BindingStatus,type ScriptBindingExecution} from './script-binding-runtime';
import {scriptRequestBase,scriptRequestRevision,subscribeScriptRequestResolver} from './script-requests';
export type {ScriptBindingExecution} from './script-binding-runtime';
export function ScriptBindingsRunner({chart,bars,source,style,bindings,ready,executionIdentity='ordinary',onResult,onBindingsChange,onRuntime}:{chart:ChartController|null;bars:Bar[];source:ChartSourceContext;style:string;bindings:ScriptBinding[];ready:boolean;executionIdentity?:string;onResult?:(value:ScriptBindingExecution)=>void;onBindingsChange?:(value:ScriptBinding[])=>boolean|void;onRuntime?:(runtime:ScriptBindingRuntime|null)=>void}){
 const runtime=useRef<ScriptBindingRuntime|null>(null),latestResult=useRef(onResult);latestResult.current=onResult;const [status,setStatus]=useState<BindingStatus[]>([]),[attempt,setAttempt]=useState(0);
 const latest=useRef({bindings,onBindingsChange,onRuntime});latest.current={bindings,onBindingsChange,onRuntime};
 const latestConfiguration=useRef<{chart:ChartController|null;context:ScriptConfigurationContext;execution:string}|null>(null);
 const currentChart=useRef(chart);currentChart.current=chart;
 // Interaction and derived-market observers acquire before runtime publication/update in the same layout phase.
 useLayoutEffect(()=>{
  if(!chart)return;let owned=true,retryTimer:ReturnType<typeof setTimeout>|null=null;const releases:Array<()=>void>=[];
  const current=()=>owned&&currentChart.current===chart;
  const stop=()=>{owned=false;if(retryTimer!==null){clearTimeout(retryTimer);retryTimer=null;}const failures:unknown[]=[];for(const release of releases.splice(0))try{release();}catch(error){failures.push(error);}return failures;};
  const throwCleanup=(failures:unknown[])=>{if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Script observer cleanup failed.');};
  const acquire=(release:()=>void)=>{if(typeof release!=='function')throw Error('Script observer did not return cleanup.');releases.push(release);if(!current())throwCleanup(stop());};
  try{
   if(current()){
    const scripts=chart.scripts;if(current()){const subscribe=scripts.onInteraction;if(current())acquire(subscribe.call(scripts,event=>{if(!owned||currentChart.current!==chart||!latest.current.bindings.some(binding=>binding.id===event.id))return;runtime.current?.interact(event);const next=event.kind==='removed'?latest.current.bindings.filter(binding=>binding.id!==event.id):latest.current.bindings.map(binding=>binding.id!==event.id?binding:event.kind==='visibility'?{...binding,visible:event.visible}:{...binding,pane:event.pane,paneId:event.paneId,ownScale:event.ownScale});if(latest.current.onBindingsChange?.(next)===false)return;latest.current={...latest.current,bindings:next};}));}
   }
   // Preserve early derived completion delivery, including synchronous events during owner/update publication.
   if(current()&&(isDerivedStyle(style)||(executionIdentity==='ordinary'&&isLiveInputIdentity(source.inputIdentity)))){const subscribe=chart.onMarketApplied;if(current())acquire(subscribe.call(chart,()=>{
    if(!current())return;if(isDerivedStyle(style)){setAttempt(value=>value+1);return;}
    // Market notification precedes queue settlement. Recheck the native receipt in a later task.
    if(retryTimer!==null)return;retryTimer=setTimeout(()=>{retryTimer=null;const latest=latestConfiguration.current,owner=runtime.current;if(!current()||!latest||latest.chart!==chart||!owner||latest.execution!=='ordinary'||!isLiveInputIdentity(latest.context.csvJobOwner?.input.source.inputIdentity))return;const input=latest.context.csvJobOwner!.input;try{if(!chart.isInputExact(input)||!current()||latestConfiguration.current!==latest||!chart.isInputCurrent(input)||!current()||latestConfiguration.current!==latest||chart.getExecutionIdentity()!=='ordinary'||!current()||runtime.current!==owner)return;const status=owner.configurationStatus(latest.context);if(current()&&runtime.current===owner&&latestConfiguration.current===latest&&status.state==='pending')setAttempt(value=>value+1);}catch{/* A retired native input cannot schedule script work. */}},0);
   }));}
  }catch(error){const failures=stop();if(failures.length)throw new AggregateError([error,...failures],'Script observer acquisition and cleanup failed.');throw error;}
  return()=>throwCleanup(stop());
 },[chart,style,executionIdentity,isLiveInputIdentity(source.inputIdentity)]);
 // CTX 2b: derived styles compute on their confirmed rows with the cell's type settings; an unavailable construction gives no rows (never standard bars).
 const typeSettings=isDerivedStyle(style)?chart?.getChartSettingsBook()?.[style]:undefined,typeKey=JSON.stringify(typeSettings??null);
 const calculation=useMemo(()=>{
  if(!isDerivedStyle(style))return{bars:calculationBarsForStyle(bars,style),qualified:true};
  if(!chart||!ready)return{bars:[],qualified:false};const input={bars,source,style};
  const current=()=>{if(currentChart.current!==chart)return false;const exact=chart.isInputCurrent(input);if(!exact||currentChart.current!==chart)return false;const execution=chart.getExecutionIdentity();return currentChart.current===chart&&execution===executionIdentity;};
  try{if(!current())return{bars:[],qualified:false};const receipt=chart.captureScriptCalculationInput({input,execution:executionIdentity});if(!current()||!receipt||!receipt.isCurrent()||!current())return{bars:[],qualified:false};return{bars:receipt.bars,qualified:true};}catch{return{bars:[],qualified:false};}
 },[chart,bars,style,typeKey,source.datasetId,source.revision,source.fixture,source.label,source.resolution,source.basisIdentity,source.inputIdentity,source.sessionOverride,ready,executionIdentity,attempt]);
 const displayed=calculation.bars,identity=scriptExecutionIdentity(source,style,executionIdentity),calculationReady=ready&&calculation.qualified;

 useLayoutEffect(()=>{
  if(!chart)return;
  const owner=new ScriptBindingRuntime(chart.scripts,setStatus,result=>latestResult.current?.(result),undefined,()=>setAttempt(value=>value+1));
  runtime.current=owner;
  try{latest.current.onRuntime?.(owner);}catch(error){
   if(runtime.current===owner)runtime.current=null;
   try{owner.dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'Script runtime publication and cleanup failed.');}
   throw error;
  }
  return()=>{
   const failures:unknown[]=[];
   if(runtime.current===owner){runtime.current=null;try{latest.current.onRuntime?.(null);}catch(error){failures.push(error);}}
   try{owner.dispose();}catch(error){failures.push(error);}
   if(failures.length===1)throw failures[0];
   if(failures.length)throw new AggregateError(failures,'Script runtime cleanup failed.');
  };
 },[chart]);
 // Scripts that declare requests recalculate when the loaded data behind ctx.request changes.
 const [requestRevision,setRequestRevision]=useState(scriptRequestRevision);
 useEffect(()=>subscribeScriptRequestResolver(()=>setRequestRevision(scriptRequestRevision())),[]);
 // Chart-owned, so the feeds it loads on demand stay open while the script is on a chart.
 const requestBase=useMemo(()=>({...scriptRequestBase(source,style),owner:'chart' as const}),[source.datasetId,source.resolution,source.basisIdentity,source.revision,source.label,source.sessionOverride,style]);
 useLayoutEffect(()=>{
  const input={bars,source,style},csvJobOwner:ScriptCsvJobOwner={input,execution:executionIdentity,assertCurrent(binding){const current=latest.current.bindings.find(row=>row.id===binding.id);if(!chart||currentChart.current!==chart||!chart.isInputCurrent(input)||chart.getExecutionIdentity()!==executionIdentity||!current||scriptCsvBindingKey(current)!==scriptCsvBindingKey(binding))throw Error('Script calculation source or binding changed.');}};
  const context={bars:displayed,identity,fixture:source.fixture,bindings,ready:calculationReady,...(isDerivedStyle(style)&&calculation.qualified?{chartPositionMode:'logical-v1' as const}:{}),requestBase,requestRevision,csvJobOwner};
  latestConfiguration.current={chart,context,execution:executionIdentity};runtime.current?.update(context);
 },[chart,bars,source,style,executionIdentity,displayed,identity,source.fixture,bindings,calculationReady,attempt,requestBase,requestRevision]);
 useEffect(()=>{if(!chart)setStatus([]);},[chart]);
 const errors=status.filter(row=>row.status==='error'),waiting=status.filter(row=>row.status==='running'||row.status==='waiting');
 return <>{waiting.length>0&&<output className="script-binding-status" role="status">Calculating {waiting.length} chart script{waiting.length===1?'':'s'}…</output>}{errors.length>0&&<div className="script-binding-errors" role="alert">{errors.map(row=><p key={row.id}>{row.name}: {row.message}</p>)}<button onClick={()=>{runtime.current?.retry();setAttempt(value=>value+1);}}>Retry chart scripts</button></div>}</>;
}
