import type {ChartController} from '../chart/adapter';
import type {OwnedVwapPrefix} from '../chart/vwap-prefix-source';
import {sourceContextForDataset} from '../chart/source-context';
import type {Bar,BarDataset} from '../domain/types';
import {alertDatasetKey,alertDatasetWithPrefix} from '../domain/alert-observation';
import type {TechnicalVwapRequest} from '../domain/technical-alerts';
import {applicationVwapClient} from '../vwap/application-client';
import {effectiveVwapSettings} from '../vwap/settings';
import type {VwapClient,VwapResultLease} from '../vwap/types';

export type OwnedTechnicalVwapRequest=TechnicalVwapRequest;
export interface TechnicalVwapEvaluator{
 evaluate(request:OwnedTechnicalVwapRequest):Promise<VwapResultLease>;
 assertCurrent():void;
}
const FIELDS=6;
function ownedLeadingRows(prefix:readonly Bar[],bars:readonly Bar[]):number|null{
 if(prefix===bars)return bars.length;
 if(!Array.isArray(prefix)||!prefix.length||prefix.length>bars.length)return null;
 for(let index=0;index<prefix.length;index++)if(prefix[index]!==bars[index])return null;
 return prefix.length;
}
/** The displayed chart supplies authority for raw rows. Frozen alert transforms
 * may differ, but never acquire a different input prefix or execution owner.
 * A request uses the owned rows, or a leading part of them by row identity: the closed-bar prefix that
 * the observer evaluates when a live bar closes. That prefix is a new array of the same row objects; it is shorter when a
 * newer forming bar is present, and as long as the rows when the last bar closed on the wall clock. This is the rule the
 * background evaluator uses. Rows that are not the owned row objects are refused. The chart's owned
 * prefix is packed as before and only its leading rows go to the worker; the kernel is causal, so each value equals the
 * chart's own value at that bar. */
export function createTechnicalVwapEvaluator(options:{chart:ChartController;dataset:BarDataset;bars:readonly Bar[];executionIdentity:string;isCurrent():boolean;client?:()=>VwapClient}):TechnicalVwapEvaluator{
 const {chart,dataset,bars,executionIdentity}=options,expected={bars,source:sourceContextForDataset(alertDatasetWithPrefix(dataset,bars),bars),style:chart.getStyle()},token={};
 const sourceBasis=alertDatasetKey(dataset,2),sourceRevision=dataset.provenance.revision;let proof:OwnedVwapPrefix|null=null;
 const assertCurrent=()=>{
  if(!options.isCurrent()||chart.getExecutionIdentity()!==executionIdentity||!chart.isInputCurrent(expected))throw Error('VWAP alert chart or execution owner changed.');
  proof?.assertCurrent();
  if(!options.isCurrent()||chart.getExecutionIdentity()!==executionIdentity)throw Error('VWAP alert owner changed during capture.');
 };
 return Object.freeze({assertCurrent,async evaluate(request:OwnedTechnicalVwapRequest){
  assertCurrent();const count=ownedLeadingRows(request.prefix,bars);if(count===null||request.sourceBasis!==sourceBasis||request.sourceRevision!==sourceRevision)throw Error('VWAP alert request does not match its owned source prefix.');
  if(!request.signal||request.signal.aborted||request.cancelled())throw Error('VWAP alert calculation is cancelled or has no cancellation owner.');
  const prefix=chart.captureVwapPrefix(expected,executionIdentity);assertCurrent();prefix.assertCurrent();proof??=prefix;
  if(prefix.rows!==bars.length||count>prefix.rows)throw Error('VWAP alert request does not match its owned source prefix.');
  const settings=effectiveVwapSettings(request.inputs,request.transform),check=()=>{assertCurrent();if(request.signal!.aborted||request.cancelled())throw Error('VWAP alert calculation was cancelled.');prefix.assertCurrent();};
  check();const client=(options.client??applicationVwapClient)();check();const job=client.request({rows:count,settings,prepare:async signal=>{const packed=await prefix.prepare(signal);return count===prefix.rows?packed:packed.slice(0,count*FIELDS*Float64Array.BYTES_PER_ELEMENT);}},{token,signal:request.signal,assertCurrent:check});
  try{const lease=await job.result;try{check();job.assertCurrent();lease.assertCurrent();check();return lease;}catch(error){try{lease.release();}catch(cleanup){throw new AggregateError([error,cleanup],'VWAP alert result retirement failed');}throw error;}}
  catch(error){try{job.cancel('VWAP alert observation failed or retired.');}catch(cleanup){throw new AggregateError([error,cleanup],'VWAP alert job retirement failed');}throw error;}
 }});
}
