import type {Bar,BarDataset} from '../domain/types';
import {liveLineageOf} from '../chart/bar-input-identity';

export type EmptyLiveInputNotice=Readonly<{kind:'loading'|'error'|'no-data';role:'status'|'alert';message:string}>;
const notices:Readonly<Record<EmptyLiveInputNotice['kind'],EmptyLiveInputNotice>>=Object.freeze({
 loading:Object.freeze({kind:'loading',role:'status',message:'Loading live chart data…'}),
 error:Object.freeze({kind:'error',role:'alert',message:'Live chart data could not be loaded. Check Data sources or choose another symbol or interval.'}),
 'no-data':Object.freeze({kind:'no-data',role:'status',message:'No live bars are available for this symbol and trading session. Check Data sources or choose another symbol, interval, or session.'}),
});
function data(value:object,key:PropertyKey):unknown{const field=Object.getOwnPropertyDescriptor(value,key);return field&&Object.hasOwn(field,'value')?field.value:undefined;}
/** Descriptive UI only. This never qualifies rows, supplies a source context,
 * initiates producer work, writes an empty native input, or changes acceptance.
 * The caller passes the exact dataset/array currently selected by GridCell. */
export function emptyLiveInputNotice(dataset:BarDataset,bars:readonly Bar[],executionIdentity:string):EmptyLiveInputNotice|null{
 try{
  if(executionIdentity!=='ordinary'||bars.length!==0||data(dataset,'bars')!==bars)return null;
  const lineage=liveLineageOf(bars),provenance=data(dataset,'provenance');if(!lineage||!provenance||typeof provenance!=='object')return null;
  const id=data(provenance,'datasetId'),state=data(provenance,'state');
  if(typeof id!=='string'||id.length>4096||!id.startsWith('live:')||!lineage.key.startsWith(id+'|'))return null;
  if(state==='loading')return notices.loading;
  if(state==='error'||state==='unavailable'||state==='disconnected')return notices.error;
  if(state==='ready'||state==='stale')return notices['no-data'];
  return null;
 }catch{return null;}
}
