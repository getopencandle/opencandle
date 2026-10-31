import type {IndicatorResult} from '../domain/indicators';
import type {Bar} from '../domain/types';
import type {OwnedVwapPrefix} from './vwap-prefix-source';
import {VWAP_WORKER_LIMITS,type VwapCalculationSettings,type VwapClient,type VwapJob,type VwapResultLease} from '../vwap/types';
import {assertVwapResultLease} from '../vwap/client';
import {createVwapPresentationPreparation,type PreparedVwapPresentation,type VwapPresentationConfiguration,type VwapPresentationPreparation} from './vwap-presentation';

export interface MaterializedVwap {
 readonly result:IndicatorResult;
 readonly bars:Bar[];
 readonly executionIdentity:string;
 readonly presentation?:PreparedVwapPresentation;
}
export interface VwapIndicatorRun {
 readonly result:Promise<MaterializedVwap>;
 assertCurrent():void;
 assertBeforeEmission():void;
 cancel():void;
}
export class VwapRunCleanupError extends AggregateError {readonly recoveryRequired=true;}
interface Host {
 prefix:OwnedVwapPrefix;
 client:VwapClient;
 settings:VwapCalculationSettings;
 token:object;
 assertCurrent():void;
 /** Admission includes all detached numerical arrays, row copies and native output. */
 assertCapacity(rows:number,plots:number):void;
 /** Only the internal version2/offset0 port supplies this captured presentation owner. */
 presentation?:VwapPresentationConfiguration;
 schedule?:(resume:()=>void)=>()=>void;
 clock?:()=>number;
}

/** Detached conversion only. Native emission and accepted publication stay in the port. */
export function startVwapIndicatorRun(host:Host):VwapIndicatorRun {
 const prefix=host.prefix,client=host.client,settings=host.settings,assertOwner=host.assertCurrent,presentation=host.presentation;
 const schedule=host.schedule??((resume:()=>void)=>{const timer=setTimeout(resume,0);return()=>clearTimeout(timer);});
 const clock=host.clock??(()=>performance.now()),controller=new AbortController();
 let phase:'active'|'complete'|'retired'='active',job:VwapJob|undefined,lease:VwapResultLease|undefined;
 let preparation:VwapPresentationPreparation|undefined;
 let pending:{cleanup?:()=>void;reject:(error:unknown)=>void;consumed:boolean}|undefined;
 let resolve!:(value:MaterializedVwap)=>void,reject!:(error:unknown)=>void,lastClock=-Infinity;
 const result=new Promise<MaterializedVwap>((yes,no)=>{resolve=yes;reject=no;});
 const now=()=>{const value=clock();if(!Number.isFinite(value)||value<0||value<lastClock)throw Error('VWAP conversion clock is unavailable.');lastClock=value;return value;};
 const admitted=now(),deadline=admitted+VWAP_WORKER_LIMITS.totalMs;
 const local=()=>{if(phase==='retired'||controller.signal.aborted)throw Error('VWAP native conversion was retired.');};
 const check=()=>{local();assertOwner();local();prefix.assertCurrent();local();assertOwner();local();if(phase==='active'&&now()>=deadline)throw Error('VWAP calculation and conversion exceeded their shared deadline.');local();};
 function cleanup(cause?:unknown):unknown[] {
  const failures:unknown[]=cause===undefined?[]:[cause];
  const waiting=pending;pending=undefined;
  if(waiting){waiting.consumed=true;try{waiting.cleanup?.();}catch(error){failures.push(error);}waiting.reject(cause??Error('VWAP conversion was cancelled.'));}
  const ownedPreparation=preparation;preparation=undefined;try{ownedPreparation?.retire();}catch(error){failures.push(error);}
  const ownedJob=job;job=undefined;try{ownedJob?.cancel();}catch(error){failures.push(error);}
  try{controller.abort();}catch(error){failures.push(error);}
  const ownedLease=lease;lease=undefined;try{ownedLease?.release();}catch(error){failures.push(error);}
  return failures;
 }
 function retire(cause:unknown):void {
  if(phase==='retired')return;phase='retired';clearTimeout(timer);
  const failures=cleanup(cause);reject(failures.length===1?cause:new VwapRunCleanupError(failures,'VWAP conversion and cleanup failed.'));
 }
 const timer=setTimeout(()=>retire(Error('VWAP calculation and conversion exceeded their shared deadline.')),VWAP_WORKER_LIMITS.totalMs);
 function pause():Promise<void> {
  check();return new Promise<void>((yes,no)=>{
   const task={cleanup:undefined as (()=>void)|undefined,reject:no,consumed:false};pending=task;
   let acquiring=true,synchronous=false;
   const resume=()=>{if(task.consumed||pending!==task)return;task.consumed=true;if(acquiring){synchronous=true;return;}pending=undefined;try{task.cleanup?.();check();yes();}catch(error){no(error);}};
   try{check();const acquired=schedule(resume);acquiring=false;if(typeof acquired!=='function')throw Error('VWAP conversion scheduler did not return cleanup.');task.cleanup=acquired;
    if(phase==='retired'||pending!==task){acquired();return;}
    check();if(synchronous)throw Error('VWAP conversion scheduler must yield asynchronously.');
   }catch(error){acquiring=false;if(pending===task)pending=undefined;try{task.cleanup?.();}catch(cleanupError){error=new AggregateError([error,cleanupError],'VWAP scheduler acquisition cleanup failed.');}no(error);}
  });
 }
 const run:VwapIndicatorRun=Object.freeze({
  result,
  assertCurrent(this:VwapIndicatorRun){if(this!==run)throw Error('Foreign VWAP native run receiver.');check();},
  assertBeforeEmission(this:VwapIndicatorRun){if(this!==run)throw Error('Foreign VWAP native run receiver.');check();if(now()>=deadline)throw Error('VWAP calculation and conversion exceeded their shared deadline before native emission.');local();},
  cancel(this:VwapIndicatorRun){if(this!==run)throw Error('Foreign VWAP native run receiver.');if(phase==='retired')return;phase='retired';clearTimeout(timer);const error=Error('VWAP native run was cancelled.'),failures=cleanup();reject(error);if(failures.length)throw new AggregateError(failures,'VWAP native run cleanup failed.');},
 });
 void (async()=>{
  try{
   check();
   if(!Number.isSafeInteger(prefix.rows)||prefix.rows<0||prefix.rows>VWAP_WORKER_LIMITS.rows)throw Error('VWAP native prefix is outside its row limit.');
   if(prefix.rows===0){check();phase='complete';clearTimeout(timer);resolve({result:{id:'vwap',series:[],diagnostics:['VWAP is unavailable until the current prefix contains bars.'],policies:[]},bars:[],executionIdentity:prefix.executionIdentity});return;}
   check();job=client.request({rows:prefix.rows,settings,prepare:signal=>{check();const value=prefix.prepare(signal);check();return value;}},{token:host.token,signal:controller.signal,assertCurrent:check});check();
   const acquired=await job.result;
   // A late lease is still owned cleanup even when acquisition retired this run.
   lease=acquired;check();assertVwapResultLease(acquired,{rows:prefix.rows,settings});check();
   if(acquired.rows!==prefix.rows||acquired.plots.length<1||acquired.plots.length>7)throw Error('VWAP native result has an invalid shape.');
   host.assertCapacity(prefix.rows,acquired.plots.length);check();
   const bars:Bar[]=[],series=acquired.plots.map(plot=>({id:plot.id,label:plot.label,values:[] as Array<number|null>}));check();
   if(presentation){preparation=createVwapPresentationPreparation({...presentation,rows:prefix.rows,bars,series,assertCurrent:check});check();}
   for(let start=0;start<prefix.rows;start+=VWAP_WORKER_LIMITS.chunkRows){
    check();const count=Math.min(VWAP_WORKER_LIMITS.chunkRows,prefix.rows-start),rows=prefix.readRows(start,count);check();
    if(rows.length!==count)throw Error('VWAP native prefix returned an incomplete row chunk.');
    for(const row of rows)bars.push(row);
    for(const plot of series){check();const chunk=acquired.readChunk(plot.id,start,count);check();if(chunk.length!==count)throw Error('VWAP native result returned an incomplete value chunk.');for(const value of chunk)plot.values.push(value);}
    preparation?.append(start,count);
    check();if(start+count<prefix.rows)await pause();
   }
   check();const plotDiagnostics:Record<string,string[]>={};for(const diagnostic of acquired.diagnostics)(plotDiagnostics[diagnostic.plotId]??=[]).push(diagnostic.message);
   const result:IndicatorResult={id:'vwap',series,diagnostics:[],policies:[...acquired.policies],...(Object.keys(plotDiagnostics).length?{plotDiagnostics}:{})};
   const prepared=preparation?.complete(result);check();
   const output:MaterializedVwap={result,bars,executionIdentity:prefix.executionIdentity,...(prepared?{presentation:prepared}:{})};
   check();lease=undefined;try{acquired.release();}catch(error){throw new VwapRunCleanupError([error],'VWAP result release failed.');}check();job=undefined;phase='complete';clearTimeout(timer);resolve(output);
  }catch(error){if(isRetired()){const failures=cleanup();if(failures.length)reject(new AggregateError([error,...failures],'Retired VWAP acquisition cleanup failed.'));return;}retire(error);}
 })();
 return run;
 function isRetired(){return phase==='retired';}
}
