import type {Bar,BarDataset,DataProvenance,Instrument} from './types';
import {rawLiveSessionSource} from './live-session-source';
import {liveLineageOf} from '../chart/bar-input-identity';
import {SEASONALITY_LIMITS} from './indicators-ext/seasonality-types';

/** This is local document ownership only. It proves no calendar, completion, provider finality or export permission. */
interface Family {retired:boolean;graph:WeakRef<Snapshot>|null}
interface Snapshot {values:Float64Array|null;rows:readonly object[]|null;live:boolean}
interface Holder {graph:Snapshot|null}
interface Origin {
 dataset:BarDataset|null;bars:Bar[]|null;instrument:Instrument|null;provenance:DataProvenance|null;
 facts:readonly unknown[];count:number;family:Family;closed:boolean;holder:WeakRef<Holder>|null;
}
export interface LocalCandleAdmission {externalNumericSlots:number;externalOperations:number}
export interface LocalCandleOrigin {
 readonly rows:number;readonly sourceNumericSlots:number;readonly sourceOperations:number;
 readonly evidence:'user-supplied-local-document';readonly calendar:'undeclared';readonly completion:'undeclared';
 assertCurrent(expectedOriginalDataset:unknown):void;
 readRows(expectedOriginalDataset:unknown,start:number,count:number):readonly Readonly<Bar>[];
 dispose():void;
}
const origins=new WeakMap<object,Origin>(),views=new WeakMap<object,{origin:WeakRef<Origin>;holder:Holder}>();
const FIELDS=['time','open','high','low','close','volume'] as const;
const INSTRUMENT=['id','symbol','name','exchange','currency','assetClass','tickSize','lotSize','timezone'] as const;
const PROVENANCE=['providerId','providerName','datasetId','fixture','coverage','asOf','delaySeconds','adjustment','session','timezone','state','license','revision'] as const;
const unavailable=()=>Error('The original local candle document is unavailable. Import it again to create a new source.');
function plain(value:unknown):asserts value is object{if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw unavailable();}
function own(value:unknown,key:PropertyKey):unknown{plain(value);const field=Object.getOwnPropertyDescriptor(value,key);if(!field?.enumerable||!Object.hasOwn(field,'value'))throw unavailable();return field.value;}
function array(value:unknown):asserts value is Bar[]{if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw unavailable();const size=Object.getOwnPropertyDescriptor(value,'length');if(!size||!Object.hasOwn(size,'value')||!Number.isSafeInteger(size.value)||size.value<1||size.value>SEASONALITY_LIMITS.bars)throw unavailable();}
function item(bars:Bar[],index:number):unknown{const field=Object.getOwnPropertyDescriptor(bars,String(index));if(!field?.enumerable||!Object.hasOwn(field,'value'))throw unavailable();return field.value;}
function facts(dataset:BarDataset):unknown[]{
 const instrument=own(dataset,'instrument'),provenance=own(dataset,'provenance'),resolution=own(dataset,'resolution');plain(instrument);plain(provenance);
 if(typeof resolution!=='string'||!resolution.length||resolution.length>40||own(provenance,'providerId')!=='local-import'||own(provenance,'state')!=='ready'||Object.getOwnPropertyDescriptor(dataset,'derivation'))throw unavailable();
 const id=own(provenance,'datasetId');if(typeof id!=='string'||!/^local(?::|-import:)/.test(id))throw unavailable();
 for(const key of INSTRUMENT){const value=own(instrument,key);if(key==='tickSize'||key==='lotSize'){if(typeof value!=='number'||!Number.isFinite(value)||value<=0)throw unavailable();}else if(typeof value!=='string'||!value.length||value.length>4096)throw unavailable();}
 for(const key of PROVENANCE){const value=own(provenance,key);if(key==='fixture'){if(typeof value!=='boolean')throw unavailable();}else if(key==='asOf'){if(typeof value!=='number'||!Number.isFinite(value))throw unavailable();}else if(key==='delaySeconds'){if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<0))throw unavailable();}else if(typeof value!=='string'||!value.length||value.length>4096)throw unavailable();}
 const values=[resolution,...INSTRUMENT.map(key=>own(instrument,key)),...PROVENANCE.map(key=>own(provenance,key))];
 for(const value of values)if(!(value===null||typeof value==='boolean'||typeof value==='string'&&value.length<=4096||typeof value==='number'&&Number.isFinite(value)))throw unavailable();
 if(typeof own(provenance,'fixture')!=='boolean')throw unavailable();return values;
}
function retire(origin:Origin,family=false):void{
 if(family){origin.family.retired=true;const graph=origin.family.graph?.deref();if(graph){graph.live=false;graph.values=null;graph.rows=null;}origin.family.graph=null;}
 const holder=origin.holder?.deref();if(holder)holder.graph=null;
 origin.closed=true;origin.dataset=null;origin.bars=null;origin.instrument=null;origin.provenance=null;origin.facts=[];origin.holder=null;
}
function header(origin:Origin):void{
 if(origin.closed||origin.family.retired){retire(origin);throw unavailable();}
 try{const dataset=origin.dataset!;if(own(dataset,'bars')!==origin.bars||own(dataset,'instrument')!==origin.instrument||own(dataset,'provenance')!==origin.provenance)throw unavailable();const current=facts(dataset);if(current.length!==origin.facts.length||current.some((value,index)=>!Object.is(value,origin.facts[index])))throw unavailable();}
 catch(error){retire(origin);throw error;}
 const bars=origin.bars!;try{array(bars);if(bars.length!==origin.count||liveLineageOf(bars))throw unavailable();}catch(error){retire(origin,true);throw error;}
}
function scalar(row:unknown,key:typeof FIELDS[number]):number{const value=own(row,key);if(typeof value!=='number'||!Number.isFinite(value)||key==='time'&&(!Number.isSafeInteger(value)||value< -62135596800||value>253402300799))throw unavailable();return value;}
function validateRow(row:unknown):number[]{const values=FIELDS.map(key=>scalar(row,key));if(Math.min(values[1],values[2],values[3],values[4])<=0||values[5]<0||values[2]<Math.max(values[1],values[3],values[4])||values[3]>Math.min(values[1],values[2],values[4]))throw unavailable();return values;}
function checkRows(origin:Origin,snapshot:Snapshot,start=0,count=origin.count):void{
 const bars=origin.bars!;try{
  if(!snapshot?.live||!snapshot.values||!snapshot.rows)throw unavailable();const {values,rows}=snapshot;let previous=start?values[(start-1)*6]:-Infinity;
  for(let index=start;index<start+count;index++){const row=item(bars,index);if(row!==rows[index])throw unavailable();for(let field=0;field<6;field++)if(!Object.is(scalar(row,FIELDS[field]),values[index*6+field]))throw unavailable();const time=values[index*6];if(time<=previous)throw unavailable();previous=time;}
 }catch(error){retire(origin,true);throw error;}
}
function state(key:object,expected:unknown):{origin:Origin;graph:Snapshot}{const handle=views.get(key),origin=handle?.origin.deref();if(!origin||origin.closed){if(handle)handle.holder.graph=null;views.delete(key);throw unavailable();}if(expected!==origin.dataset)throw Error('The local candle receipt belongs to another original document.');if(origin.family.retired){retire(origin);throw unavailable();}const graph=handle!.holder.graph;if(!graph?.live||origin.holder?.deref()!==handle!.holder)throw unavailable();return{origin,graph};}
function assertView(key:object,expected:unknown):void{const {origin,graph}=state(key,expected);header(origin);checkRows(origin,graph);header(origin);}
function rowsView(key:object,expected:unknown,start:number,count:number):readonly Readonly<Bar>[]{
 if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(count)||count<0||count>128)throw Error('Read at most 128 supplied local candle rows at a time.');
 const {origin,graph}=state(key,expected);if(start+count>origin.count)throw Error('The local candle row range is outside the captured document.');header(origin);checkRows(origin,graph,start,count);
 const values=graph.values!,out:Readonly<Bar>[]=[];for(let index=start;index<start+count;index++){const at=index*6;out.push(Object.freeze({time:values[at],open:values[at+1],high:values[at+2],low:values[at+3],close:values[at+4],volume:values[at+5]}));}
 header(origin);checkRows(origin,graph,start,count);return Object.freeze(out);
}
function disposeView(key:object):void{views.delete(key);}
/** No closure in a returned view retains the document, arrays, snapshot or Origin strongly. */
function view(key:object,count:number,numericSlots:number,operations:number):LocalCandleOrigin{return Object.freeze({rows:count,sourceNumericSlots:numericSlots,sourceOperations:operations,evidence:'user-supplied-local-document' as const,calendar:'undeclared' as const,completion:'undeclared' as const,assertCurrent(expected:unknown){assertView(key,expected);},readRows(expected:unknown,start:number,count:number){return rowsView(key,expected,start,count);},dispose(){disposeView(key);}});}
function constructed(dataset:BarDataset,family?:Family):BarDataset{
 try{const bars=own(dataset,'bars');array(bars);if(liveLineageOf(bars)||family?.retired)return dataset;const values=facts(dataset);
  origins.set(dataset,{dataset,bars,instrument:dataset.instrument,provenance:dataset.provenance,facts:Object.freeze(values),count:bars.length,family:family??{retired:false,graph:null},closed:false,holder:null});
 }catch{/* Optional membership never changes the existing parser, prepare or restore acceptance. */}return dataset;
}
/** Fixed metadata only: no numerical row read, snapshot, calendar or transferable source capability. */
export function localCandleOriginFacts(dataset:unknown):Readonly<{rows:number}>|null{
 const origin=dataset&&typeof dataset==='object'?origins.get(dataset):undefined;if(!origin)return null;
 try{header(origin);return Object.freeze({rows:origin.count});}catch{return null;}
}
/** Only this constructor's own new plain output can receive membership; supplied objects are never attached. */
export function createParsedLocalCandleDataset(instrument:Instrument,bars:Bar[],resolution:string,provenance:DataProvenance):BarDataset{return constructed({instrument,bars,resolution,provenance});}
/** A preparation can preserve an existing constructor origin; arbitrary caller-created parsed objects cannot grant it. */
export function createPreparedLocalCandleDataset(parsed:BarDataset,instrument:Instrument,resolution:string,provenance:DataProvenance):BarDataset{
 const dataset={instrument,bars:own(parsed,'bars') as Bar[],resolution,provenance},parent=origins.get(parsed);
 if(parent)try{header(parent);if(parent.bars===dataset.bars)return constructed(dataset,parent.family);}catch{/* An observed retired parent remains unqualified. */}return dataset;
}
export function createIdentifiedLocalCandleDataset(source:BarDataset,id:string):BarDataset{
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw Error('Invalid local import identity.');
 const parent=origins.get(source);if(parent)try{header(parent);}catch{/* Legacy value construction still runs; only optional membership is refused. */}
 const dataset={...source,provenance:{...source.provenance,datasetId:'local-import:'+id}};
 return parent&&!parent.closed?constructed(dataset,parent.family):dataset;
}
/** Full workspace validation calls this document constructor; no capability is read from persisted fields. */
export function reconstructLocalCandleDataset(source:BarDataset):BarDataset{
 try{plain(source);const parent=origins.get(source);if(parent)header(parent);const bars=own(source,'bars');array(bars);if(liveLineageOf(bars)||rawLiveSessionSource(source)!==source)return source;facts(source);
  // Return a fresh own document, never attach membership to the caller's already-existing object.
  const fields=Object.getOwnPropertyDescriptors(source);if(Reflect.ownKeys(fields).some(key=>!Object.hasOwn((fields as Record<PropertyKey,PropertyDescriptor>)[key],'value')))return source;
  return constructed(Object.defineProperties({},fields) as BarDataset,parent?.family);
 }catch{return source;}
}
/** Admission precedes every numerical row read/allocation; this routine does not grant calendar/completion semantics. */
export function captureLocalCandleOrigin(dataset:unknown,admission:LocalCandleAdmission):LocalCandleOrigin|null{
 const origin=dataset&&typeof dataset==='object'?origins.get(dataset):undefined;if(!origin)return null;
 const slots=own(admission,'externalNumericSlots'),work=own(admission,'externalOperations');
 if(!Number.isSafeInteger(slots)||!Number.isSafeInteger(work)||(slots as number)<0||(work as number)<0)throw Error('Local candle capture needs the current batch reservation.');
 // Each independent lease additionally reserves16 scalar/reference slots for its view/key/weak-map state.
 const numericSlots=origin.count*7+1536+16,operations=origin.count*1024+16384;
 if((slots as number)+numericSlots>SEASONALITY_LIMITS.numericSlots||(work as number)+operations>SEASONALITY_LIMITS.operations)throw Error('Local candle capture exceeds the existing calculation budget.');
 header(origin);
 try{
  let holder=origin.holder?.deref();const previous=holder?.graph??origin.family.graph?.deref();if(previous?.live){checkRows(origin,previous);header(origin);if(!holder||holder.graph!==previous)holder={graph:previous};}
  else{const values=new Float64Array(origin.count*6),rows:object[]=new Array(origin.count);let previousTime=-Infinity;
   for(let index=0;index<origin.count;index++){const row=item(origin.bars!,index),fields=validateRow(row);if(fields[0]<=previousTime)throw unavailable();previousTime=fields[0];rows[index]=row as object;for(let field=0;field<6;field++)values[index*6+field]=fields[field];}
   const graph={values,rows:Object.freeze(rows),live:true};holder={graph};origin.family.graph=new WeakRef(graph);header(origin);checkRows(origin,graph);
  }
  const key={};origin.holder=new WeakRef(holder!);views.set(key,{origin:new WeakRef(origin),holder:holder!});return view(key,origin.count,numericSlots,operations);
 }catch(error){retire(origin,true);throw error;}
}
