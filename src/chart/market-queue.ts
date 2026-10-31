import type {Bar} from '../domain/types';
import {copyChartSourceContext} from './source-context';
import type {ChartSourceContext} from './adapter';
import type {ChartDiagnostic} from './contracts';
import {cloneProfileInputBars,cloneProfileMarketInput} from './profile-input-clone';
export interface MarketInput {bars:Bar[];source:ChartSourceContext}
export type MarketOutcome={ok:true}|{ok:false;diagnostic:ChartDiagnostic};
export interface MarketTransactionOwner {isCurrent:()=>boolean}
/** Serialize renderer mutations, pairing data/provenance before synchronous native callbacks fire. */
export function createMarketQueue(options:{read:()=>MarketInput;write:(input:MarketInput)=>void;apply:(bars:Bar[])=>Promise<unknown>;disposed:()=>boolean;validate?:((bars:Bar[])=>ChartDiagnostic|null)}){
 let pending=Promise.resolve(),generation=0n,activeGeneration=0n,queued=0,reserved:bigint|null=null;
 const options_disposed=()=>options.disposed();
 const settledSubscribers=new Set<()=>void>();
 const settled=()=>{if(!settledSubscribers.size||queued||reserved!==null)return;const current=()=>{try{return !queued&&reserved===null&&!options.disposed();}catch{return false;}};if(!current())return;for(const callback of [...settledSubscribers]){if(!current())break;try{callback();}catch{/* An optional source subscriber cannot change a completed market transaction. */}}};
 // Live growth that arrives while an owned transition holds the input waits for the release. Only the
 // newest waiting snapshot is written; older ones resolve as superseded by it (same live input, newer bars).
 let deferred:{run:()=>void;supersede:()=>void}|null=null;
 const releaseDeferred=()=>{const next=deferred;deferred=null;next?.run();};
 const queue={set(bars:readonly Bar[],source?:ChartSourceContext,guard?:()=>boolean,capture?:((previous:MarketInput,owner:bigint)=>void),setOptions?:{deferWhileHeld?:boolean}):Promise<MarketOutcome>{if(reserved!==null&&setOptions?.deferWhileHeld&&!options_disposed())return new Promise<MarketOutcome>(resolve=>{deferred?.supersede();deferred={run:()=>{queue.set(bars,source,guard,capture,setOptions).then(resolve,error=>resolve({ok:false,diagnostic:{code:'MARKET_INPUT_FAILED',feature:'market input',severity:'unavailable',message:error instanceof Error?error.message:String(error)}}));},supersede:()=>resolve({ok:true})};});if(reserved!==null)return Promise.resolve({ok:false,diagnostic:{code:'CHART_SUSPENDED',feature:'market input',severity:'unavailable',message:'The chart input is held by an owned workspace transition.'}});const capturedBars=cloneProfileInputBars(bars),capturedSource=source?copyChartSourceContext(source):null;
  queued++;const work=pending.then(async()=>{
   if(options.disposed())return{ok:false as const,diagnostic:{code:'CHART_DISPOSED',feature:'market input',severity:'unavailable' as const,message:'The chart was disposed before this queued input could be applied.'}};
   if(guard&&!guard())return{ok:false as const,diagnostic:{code:'MARKET_ROLLBACK_SUPERSEDED',feature:'market rollback',severity:'warning' as const,message:'A newer market input superseded this transaction. Stale rollback was withheld.'}};
   const diagnostic=options.validate?.(capturedBars);if(diagnostic)return{ok:false as const,diagnostic};
   const previous=cloneProfileMarketInput(options.read()),previousGeneration=activeGeneration,next={bars:capturedBars,source:capturedSource??previous.source},owner=++generation;capture?.(previous,owner);activeGeneration=owner;
   try{options.write(next);await options.apply(next.bars);return{ok:true as const};}
   catch(error){activeGeneration=previousGeneration;try{options.write(previous);}catch(writeError){throw new AggregateError([error,writeError],'Market input failed and source-state rollback was incomplete.');}if(!options.disposed())try{await options.apply(previous.bars);}catch(restoreError){throw new AggregateError([error,restoreError],'Market input failed and renderer rollback was incomplete; source state was restored.');}throw error;}
  });const completion=work.finally(()=>{queued--;settled();});pending=completion.then(()=>{},()=>{});return completion;
 },subscribeSettled(listener:()=>void){if(options.disposed())throw Error('Chart input is disposed.');settledSubscribers.add(listener);return()=>{settledSubscribers.delete(listener);};},setWithRollback(bars:readonly Bar[],source?:ChartSourceContext):{result:Promise<MarketOutcome>;rollback:()=>Promise<MarketOutcome>}{let snapshot:MarketInput|null=null,owner:bigint|null=null,consumed=false;
  const result=queue.set(bars,source,undefined,(previous,assigned)=>{snapshot=previous;owner=assigned;});
  return{result,rollback(){if(consumed)return Promise.reject(new Error('Market rollback checkpoint already consumed'));consumed=true;if(!snapshot||owner===null)return Promise.reject(new Error('Market rollback checkpoint is not available before its transaction starts'));return queue.set(snapshot.bars,snapshot.source,()=>activeGeneration===owner);}};
 },reserve(){if(queued||reserved!==null||options.disposed())throw Error('Chart input cannot be suspended while updating or retired');const owner=++generation;activeGeneration=owner;reserved=owner;let released=false;return{isCurrent:()=>!released&&!options.disposed()&&reserved===owner&&activeGeneration===owner,release(){if(released)throw Error('Chart suspension ownership already released');released=true;if(reserved===owner){reserved=null;releaseDeferred();settled();}}};},isPending:()=>queued>0||reserved!==null,exclusive<T>(operation:(owner:MarketTransactionOwner)=>Promise<T>|T,guard?:()=>boolean):Promise<T>{if(reserved!==null)return Promise.reject(new Error('Chart input is suspended by an owned workspace transition'));queued++;const work=pending.then(async()=>{if(options.disposed())throw new Error('Chart disposed before its analysis transaction');if(guard&&!guard())throw new Error('Analysis transaction was superseded by a newer chart mutation');const prior=activeGeneration,owner=++generation;activeGeneration=owner;try{return await operation({isCurrent:()=>!options.disposed()&&activeGeneration===owner});}catch(error){activeGeneration=prior;throw error;}});const completion=work.finally(()=>{queued--;settled();});pending=completion.then(()=>{},()=>{});return completion;}
 };
 return queue;
}
