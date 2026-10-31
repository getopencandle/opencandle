/** The separate contract a provider adapter must meet before alerts may treat
 * an observation as measured (a known source publication time and a known completion time), instead of a supplied snapshot.
 *
 * Rules (supplied snapshots keep sourceAvailableAt null):
 *  1. Only a registered adapter produces measured records, through a channel's pull(). Records are branded at that point;
 *     a structurally valid object built anywhere else is not measured (isMeasuredFeedRecord false, accept() refuses it).
 *  2. A supplied, synthetic or replay AlertObservation can never become a measured record (relabeling refusal), whatever its
 *     fields say.
 *  3. Each record carries the adapter id, the contract version and a strictly increasing sequence per channel; clocks must be
 *     ordered: sourceTime <= publishedAt <= receivedAt, and completedAt (when known) between sourceTime and receivedAt.
 *  4. OpenCandle ships no measured adapter today. MEASURED_FEED_STATUS says so, and alerts keep using supplied snapshots. */
import type {AlertObservation} from './alert-observation';

export const MEASURED_FEED_CONTRACT_VERSION=1 as const;
export const MEASURED_FEED_STATUS='No measured feed provider is connected. Alerts evaluate supplied snapshots, whose publication time is unknown.';
export const RELABEL_REFUSAL='A supplied, synthetic or replay snapshot cannot become a measured feed record.';

export interface MeasuredFeedRecord {
 schemaVersion:1;kind:'measured-feed';adapterId:string;contractVersion:typeof MEASURED_FEED_CONTRACT_VERSION;sequence:number;
 datasetKey:string;sourceRevision:string;value:number;
 /** Unix seconds: the bar or tick time, when the provider published it, when it was completed (null = still forming) and when LV received it. */
 sourceTime:number;publishedAt:number;completedAt:number|null;receivedAt:number;
}
/** The provider side: next() returns the next raw record or null when nothing is new. */
export interface MeasuredFeedAdapter {readonly id:string;readonly contractVersion:number;next():unknown}
export interface MeasuredFeedChannel {
 readonly adapterId:string;
 /** Reads one record from the adapter, validates it and returns it branded; null when the adapter has nothing new. Throws on a bad record. */
 pull():MeasuredFeedRecord|null;
 /** Accepts only records this channel produced (rule 1); anything else throws. */
 accept(record:unknown):MeasuredFeedRecord;
 lastSequence():number|null;
}

const KEYS=['schemaVersion','kind','adapterId','contractVersion','sequence','datasetKey','sourceRevision','value','sourceTime','publishedAt','completedAt','receivedAt'] as const;
const branded=new WeakSet<object>();
const adapters=new Map<string,MeasuredFeedAdapter>();
const seconds=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const text=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200;

/** Rule 2: true for anything shaped like an alert observation (supplied, synthetic or replay). */
export function isAlertObservationLike(value:unknown):value is Pick<AlertObservation,'kind'>{
 if(!value||typeof value!=='object')return false;const kind=(value as {kind?:unknown}).kind;
 return kind==='supplied-snapshot'||kind==='synthetic-fixture'||kind==='replay-snapshot'||Object.hasOwn(value,'sourceAvailableAt')||Object.hasOwn(value,'binding');
}
/** Structural check of one raw record (rule 3). Returns a frozen copy; throws with a plain reason. */
export function validateMeasuredFeedRecord(value:unknown,adapterId:string):MeasuredFeedRecord{
 if(isAlertObservationLike(value))throw new Error(RELABEL_REFUSAL);
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error('A measured feed record must be a plain object.');
 const record=value as Record<string,unknown>,keys=Object.keys(record);
 if(keys.length!==KEYS.length||!KEYS.every(key=>Object.hasOwn(record,key)))throw new Error('A measured feed record has missing or extra fields.');
 if(record.schemaVersion!==1||record.kind!=='measured-feed')throw new Error('Unknown measured feed record kind.');
 if(record.contractVersion!==MEASURED_FEED_CONTRACT_VERSION)throw new Error('Unsupported measured feed contract version.');
 if(record.adapterId!==adapterId)throw new Error('The record names a different adapter.');
 if(!seconds(record.sequence)||record.sequence<1)throw new Error('The record sequence must be a positive integer.');
 if(!text(record.datasetKey)||!text(record.sourceRevision))throw new Error('The record needs a dataset key and a source revision.');
 if(typeof record.value!=='number'||!Number.isFinite(record.value))throw new Error('The measured value must be a finite number.');
 if(!seconds(record.sourceTime)||!seconds(record.publishedAt)||!seconds(record.receivedAt))throw new Error('Measured clocks must be whole Unix seconds.');
 if(record.completedAt!==null&&!seconds(record.completedAt))throw new Error('Completion time must be whole Unix seconds or null.');
 if(record.publishedAt<record.sourceTime||record.receivedAt<record.publishedAt)throw new Error('Measured clocks are out of order.');
 if(record.completedAt!==null&&(record.completedAt<record.sourceTime||record.completedAt>record.receivedAt))throw new Error('Completion time is outside the source and receive times.');
 return Object.freeze(Object.fromEntries(KEYS.map(key=>[key,record[key]]))) as unknown as MeasuredFeedRecord;
}
export function isMeasuredFeedRecord(value:unknown):value is MeasuredFeedRecord{return !!value&&typeof value==='object'&&branded.has(value);}
/** Completion basis an alert may use: observed-closed only for a branded record with a completion time; unknown otherwise. */
export function measuredCompletion(value:unknown):'observed-closed'|'unknown'{return isMeasuredFeedRecord(value)&&value.completedAt!==null?'observed-closed':'unknown';}
/** Rule 2 as an explicit entry point: always refuses. */
export function measuredFromObservation(_observation:AlertObservation):never{throw new Error(RELABEL_REFUSAL);}

export function registerMeasuredFeedAdapter(adapter:MeasuredFeedAdapter):void{
 if(!adapter||!text(adapter.id)||typeof adapter.next!=='function')throw new Error('A measured feed adapter needs an id and next().');
 if(adapter.contractVersion!==MEASURED_FEED_CONTRACT_VERSION)throw new Error('Unsupported measured feed contract version.');
 if(adapters.has(adapter.id)&&adapters.get(adapter.id)!==adapter)throw new Error('Another adapter already uses this id.');
 adapters.set(adapter.id,adapter);
}
export function unregisterMeasuredFeedAdapter(id:string):void{adapters.delete(id);}
export function measuredFeedAdapters():string[]{return [...adapters.keys()].sort();}
export function measuredFeedStatus():string{const ids=measuredFeedAdapters();return ids.length?`Measured feed providers: ${ids.join(', ')}.`:MEASURED_FEED_STATUS;}

export function openMeasuredFeedChannel(adapterId:string):MeasuredFeedChannel{
 const adapter=adapters.get(adapterId);if(!adapter)throw new Error('No measured feed adapter is registered under this id.');
 let last:number|null=null;const own=new WeakSet<object>();
 return {
  adapterId,
  pull(){
   if(adapters.get(adapterId)!==adapter)throw new Error('The measured feed adapter was unregistered.');
   const raw=adapter.next();if(raw===null||raw===undefined)return null;
   const record=validateMeasuredFeedRecord(raw,adapterId);
   if(last!==null&&record.sequence<=last)throw new Error('The measured feed sequence went backwards or repeated.');
   last=record.sequence;branded.add(record);own.add(record);return record;
  },
  accept(record){
   if(isAlertObservationLike(record))throw new Error(RELABEL_REFUSAL);
   if(!record||typeof record!=='object'||!own.has(record))throw new Error('Only records pulled from this measured feed channel are measured.');
   return record as MeasuredFeedRecord;
  },
  lastSequence:()=>last,
 };
}
