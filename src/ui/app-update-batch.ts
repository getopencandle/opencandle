/**
 * Coalesces App state updates that chart callbacks publish while one symbol switch is still running. A switch used to
 * render App four times inside one click task: the click, the chart ready callback (inspection epoch), three indicator list
 * refreshes when the new symbol's indicators finish computing, and a second ready callback. Queued jobs run together in one
 * task posted after the click task (a MessageChannel message, as React's own scheduler uses; setTimeout where there is none),
 * so React renders them once, at default priority, outside the click's long task and before the next frame. A microtask is
 * not enough: microtasks run between the click's pointer events and inside React's synchronous flush, at discrete priority.
 *
 * Rules: one job per key, the newest job for a key replaces the older one (last writer wins, as with direct setState calls),
 * jobs run in first-queued order, and `cancel(key)` drops a pending job when a direct write supersedes it.
 */
export interface AppUpdateBatch {queue(key:string,job:()=>void):void;cancel(key:string):void;pending(key:string):boolean;flush():void;
 /** The last value App wrote for a key (for setters that would otherwise re-render App with an unchanged value). */
 readonly written:Map<string,unknown>}
export function postTask(run:()=>void):void{
 if(typeof MessageChannel==='function'){const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();run();};channel.port2.postMessage(null);return;}
 setTimeout(run,0);
}
export function createAppUpdateBatch(schedule:(run:()=>void)=>void=postTask):AppUpdateBatch{
 const jobs=new Map<string,()=>void>();let queued=false;
 const flush=()=>{queued=false;const run=[...jobs.values()];jobs.clear();const failures:unknown[]=[];for(const job of run)try{job();}catch(error){failures.push(error);}if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Batched App updates failed.');};
 return{
  queue(key,job){jobs.set(key,job);if(!queued){queued=true;schedule(()=>{if(queued)flush();});}},
  cancel(key){jobs.delete(key);},
  pending(key){return jobs.has(key);},
  flush(){if(queued)flush();},
  written:new Map(),
 };
}
const batches=new WeakMap<object,AppUpdateBatch>();
/** One batch per App instance; `owner` is a ref object that lives as long as the App (its workspace ref). */
export function appUpdateBatch(owner:object):AppUpdateBatch{let batch=batches.get(owner);if(!batch){batch=createAppUpdateBatch();batches.set(owner,batch);}return batch;}
