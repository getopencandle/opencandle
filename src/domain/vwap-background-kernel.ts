// VWAP kernel 2 alerts evaluated off-chart, from a background live feed.
// The chart's evaluator (src/ui/vwap-alert-evaluator.ts) takes its rows from the chart's owned prefix. A background feed has no
// chart, so this one packs the feed's own rows (the forming view the watcher passes, or the closed-bar prefix of it that the
// observer evaluates when a live bar closes: the same row objects, fewer of them) and runs the same exact worker kernel
// through the same application VWAP service. The kernel resets at the alert's frozen anchor (Session, Week, ...) in its frozen
// timezone, so the values are session-anchored the same way the chart computes them from the same feed rows. Nothing here is cached: each request packs a fresh copy of the rows.
import type {Bar} from './types';
import type {TechnicalVwapRequest} from './technical-alerts';
import {effectiveVwapSettings} from '../vwap/settings';
import type {VwapClient,VwapResultLease} from '../vwap/types';

export interface BackgroundVwapEvaluator {evaluate(request:TechnicalVwapRequest):Promise<VwapResultLease>;assertCurrent():void}
export interface BackgroundVwapOptions {
 /** The feed rows the observer evaluates. A request must use these rows, or a leading part of them (a closed-bar prefix). */
 bars:readonly Bar[];sourceBasis:string;sourceRevision:string;
 /** False once the feed or its watch is gone; a pending result is then refused. */
 isCurrent:()=>boolean;
 client:()=>VwapClient;
}
const FIELDS=6;
function pack(bars:readonly Bar[]):ArrayBuffer{
 const data=new Float64Array(bars.length*FIELDS);
 bars.forEach((bar,index)=>{const at=index*FIELDS;data[at]=bar.time;data[at+1]=bar.open;data[at+2]=bar.high;data[at+3]=bar.low;data[at+4]=bar.close;data[at+5]=typeof bar.volume==='number'?bar.volume:NaN;});
 return data.buffer;
}
export function createBackgroundVwapEvaluator(options:BackgroundVwapOptions):BackgroundVwapEvaluator{
 const {bars,sourceBasis,sourceRevision}=options;
 const assertCurrent=()=>{if(!options.isCurrent())throw new Error('The background VWAP feed changed or closed.');};
 return Object.freeze({assertCurrent,async evaluate(request:TechnicalVwapRequest){
  assertCurrent();
  const prefix=request.prefix;
  if(!Array.isArray(prefix)||!prefix.length||prefix.length>bars.length||prefix.some((row,index)=>row!==bars[index])||request.sourceBasis!==sourceBasis||request.sourceRevision!==sourceRevision)throw new Error('The VWAP alert request does not match its background feed rows.');
  if(!request.signal||request.signal.aborted||request.cancelled())throw new Error('The background VWAP calculation was cancelled.');
  const settings=effectiveVwapSettings(request.inputs,request.transform),rows=pack(prefix);
  const check=()=>{assertCurrent();if(request.signal.aborted||request.cancelled())throw new Error('The background VWAP calculation was cancelled.');};
  const job=options.client().request({rows:prefix.length,settings,prepare:()=>{check();return rows;}},{token:{},signal:request.signal,assertCurrent:check});
  try{const lease=await job.result;try{check();lease.assertCurrent();return lease;}catch(error){try{lease.release();}catch{/* the lease is already gone */}throw error;}}
  catch(error){try{job.cancel('Background VWAP observation failed or retired.');}catch{/* the job is already retired */}throw error;}
 }});
}
