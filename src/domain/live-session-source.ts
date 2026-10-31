import {alpacaClosedSnapshotInputFacts,captureAlpacaClosedSnapshot,captureAlpacaSeasonalityDailyPlan,type AlpacaSeasonalityDailyPlan,type AlpacaClosedSnapshot} from './alpaca-live';
import type {Bar,BarDataset} from './types';

/** Nonportable ownership of a live session view. Metadata is checked only to retire an existing exact-object proof;
 * it is never used to find, infer or grant a raw source to an unregistered/copy/derived dataset. */
interface OwnedView {completionPins:readonly unknown[]|null;raw:BarDataset;bars:Bar[];rawBars:Bar[];instrument:BarDataset['instrument'];provenance:BarDataset['provenance'];rawInstrument:BarDataset['instrument'];rawProvenance:BarDataset['provenance'];metadata:string;rawMetadata:string;rows:Bar[];values:Float64Array;indices:Uint32Array}
const views=new WeakMap<object,OwnedView>(),FIELDS=['time','open','high','low','close','volume'] as const;
const MAX_BARS=100000;
const COMPLETION_INSTRUMENT=['id','symbol','exchange','assetClass','timezone'] as const,COMPLETION_PROVENANCE=['providerId','datasetId','revision','fixture','adjustment','session','timezone','coverage'] as const;
function completionPins(view:BarDataset):readonly unknown[]{const instrument=data(view,'instrument') as object,provenance=data(view,'provenance') as object;return [data(view,'resolution'),...COMPLETION_INSTRUMENT.map(key=>data(instrument,key)),...COMPLETION_PROVENANCE.map(key=>data(provenance,key))];}
function optionalCompletionPins(view:BarDataset):readonly unknown[]|null{try{return Object.freeze(completionPins(view));}catch{return null;}}
function sameCompletionPins(view:BarDataset,expected:readonly unknown[]|null):boolean{if(!expected)return false;const actual=completionPins(view);return actual.length===expected.length&&actual.every((value,index)=>Object.is(value,expected[index]));}
function data(owner:object,key:PropertyKey):unknown{const property=Object.getOwnPropertyDescriptor(owner,key);if(!property||!('value' in property)||!property.enumerable)throw Error('The live session source requires plain own data.');return property.value;}
function stamp(value:unknown,depth=0):string{
 if(depth>5)throw Error('The live session source metadata is too deeply nested.');
 if(value===null)return 'null';if(value===undefined)return 'undefined';if(typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);if(typeof value==='number')return Object.is(value,-0)?'-0':String(value);
 if(!value||typeof value!=='object'||![Object.prototype,null,Array.prototype].includes(Object.getPrototypeOf(value)))throw Error('The live session source metadata requires plain data.');
 const array=Array.isArray(value),keys=Reflect.ownKeys(value);if(keys.some(key=>typeof key!=='string'))throw Error('The live session source metadata has unsupported fields.');
 if(array){if(keys.length!==value.length+1)throw Error('The live session source metadata requires dense arrays.');return '['+Array.from({length:value.length},(_,index)=>stamp(data(value,String(index)),depth+1)).join(',')+']';}
 return '{'+(keys as string[]).sort().map(key=>JSON.stringify(key)+':'+stamp(data(value,key),depth+1)).join(',')+'}';
}
function metadata(dataset:BarDataset):string{return stamp({instrument:data(dataset,'instrument'),provenance:data(dataset,'provenance'),resolution:data(dataset,'resolution')});}
function provenanceBasis(dataset:BarDataset):string{const provenance=data(dataset,'provenance');if(!provenance||typeof provenance!=='object')throw Error('The live session provenance is unavailable.');return stamp(Object.fromEntries(Reflect.ownKeys(provenance).filter(key=>key!=='session').map(key=>{if(typeof key!=='string')throw Error('The live session provenance has unsupported fields.');return[key,data(provenance,key)];})));}
function arrays(dataset:BarDataset):void{if(!Array.isArray(dataset.bars)||Object.getPrototypeOf(dataset.bars)!==Array.prototype||dataset.bars.length>MAX_BARS||Reflect.ownKeys(dataset.bars).length!==dataset.bars.length+1)throw Error('The live session source has invalid or oversized bars.');}
function plainBar(row:object):void{const keys=Reflect.ownKeys(row);if(![Object.prototype,null].includes(Object.getPrototypeOf(row))||keys.length!==FIELDS.length||keys.some(key=>typeof key!=='string'||!(FIELDS as readonly string[]).includes(key)))throw Error('The raw live session row shape changed.');}
function verify(dataset:BarDataset,record:OwnedView):void{
 if(data(dataset,'bars')!==record.bars||data(dataset,'instrument')!==record.instrument||data(dataset,'provenance')!==record.provenance||data(record.raw,'bars')!==record.rawBars||data(record.raw,'instrument')!==record.rawInstrument||data(record.raw,'provenance')!==record.rawProvenance||metadata(dataset)!==record.metadata||metadata(record.raw)!==record.rawMetadata||record.rawBars.length!==record.rows.length||record.bars.length!==record.indices.length)throw Error('The live session view no longer owns its exact raw source.');
 arrays(dataset);arrays(record.raw);for(let index=0;index<record.rows.length;index++){
  const row=data(record.rawBars,String(index));if(row!==record.rows[index])throw Error('The raw live session rows changed.');
  plainBar(row as object);
  for(let field=0;field<FIELDS.length;field++)if(!Object.is(data(row as Bar,FIELDS[field]),record.values[index*FIELDS.length+field]))throw Error('The raw live session values changed.');
 }
 for(let index=0;index<record.indices.length;index++)if(data(record.bars,String(index))!==record.rows[record.indices[index]])throw Error('The live session view rows were detached or replaced.');
}
/** Unknown/copy values keep the original conservative live behavior; only registered exact objects can unwrap a source. */
export function rawLiveSessionSource<T extends Pick<BarDataset,'bars'|'provenance'>>(dataset:T):T{
 const record=views.get(dataset);if(!record)return dataset;verify(dataset as unknown as BarDataset,record);return record.raw as unknown as T;
}
/** Cache owners may rebuild a retired view from their own private raw source; completion readers never repair a proof. */
export function liveSessionSourceCurrent(dataset:BarDataset):boolean{try{rawLiveSessionSource(dataset);return true;}catch{return false;}}
export function linkLiveSessionSource(view:BarDataset,source:BarDataset):void{
 const owned=views.has(view),priorRaw=rawLiveSessionSource(view),raw=rawLiveSessionSource(source);
 if(owned){if(priorRaw!==raw)throw Error('The live session view cannot replace its exact raw source.');return;}
 if(!raw.provenance.datasetId.startsWith('live:'))return;
 arrays(raw);arrays(view);
 if(view===raw)return;
 if(view.provenance.datasetId!==raw.provenance.datasetId||view.provenance.revision!==raw.provenance.revision||view.resolution!==raw.resolution||view.instrument!==raw.instrument||provenanceBasis(view)!==provenanceBasis(raw))throw Error('The live session view does not belong to this exact raw source.');
 const rows:Bar[]=[],values=new Float64Array(raw.bars.length*FIELDS.length),indices=new Uint32Array(view.bars.length);
 for(let index=0;index<raw.bars.length;index++){
  const row=data(raw.bars,String(index));if(!row||typeof row!=='object')throw Error('The raw live session row is unavailable.');plainBar(row);rows.push(row as Bar);
  for(let field=0;field<FIELDS.length;field++){const value=data(row,FIELDS[field]);if(typeof value!=='number')throw Error('The raw live session row requires numeric fields.');values[index*FIELDS.length+field]=value;}
 }
 let cursor=0;for(let index=0;index<view.bars.length;index++){const row=data(view.bars,String(index));while(cursor<rows.length&&rows[cursor]!==row)cursor++;if(cursor===rows.length)throw Error('The session view is not an exact ordered selection of its raw rows.');indices[index]=cursor++;}
 views.set(view,{completionPins:optionalCompletionPins(view),raw,bars:view.bars,rawBars:raw.bars,instrument:view.instrument,provenance:view.provenance,rawInstrument:raw.instrument,rawProvenance:raw.provenance,metadata:metadata(view),rawMetadata:metadata(raw),rows,values,indices});
}

/** Fixed ownership facts, not numerical proof. Real producer membership is checked inside this module;
 * neither a caller callback nor a source-ID join can qualify an owned session selection. */
export function alpacaSessionCompletionInputFacts(dataset:BarDataset,expectedRows:readonly Bar[]):Readonly<{sourceRows:number;inputRows:number}>|null{
 try{const record=views.get(dataset);if(!record)return alpacaClosedSnapshotInputFacts(dataset,expectedRows);
  if(!sameCompletionPins(dataset,record.completionPins)||data(dataset,'bars')!==expectedRows||record.bars!==expectedRows||data(dataset,'instrument')!==record.instrument||data(dataset,'provenance')!==record.provenance||data(record.raw,'bars')!==record.rawBars||data(record.raw,'instrument')!==record.rawInstrument||data(record.raw,'provenance')!==record.rawProvenance||Object.getOwnPropertyDescriptor(record.bars,'length')?.value!==record.indices.length||record.rawBars.length!==record.rows.length)return null;
  const actual=alpacaClosedSnapshotInputFacts(record.raw,record.rawBars);return actual?Object.freeze({sourceRows:actual.sourceRows,inputRows:record.indices.length}):null;
 }catch{return null;}
}
function selectedCompletionCurrent(dataset:BarDataset,expectedRows:readonly Bar[],record:OwnedView):void{if(views.get(dataset)!==record||!alpacaSessionCompletionInputFacts(dataset,expectedRows))throw Error('The actual session completion input retired.');}
/** Admitted fixed-index validation; no own-key enumeration, additional numeric graph or returned raw source. */
export function captureAlpacaSessionCompletion(dataset:BarDataset,expectedRows:readonly Bar[]):AlpacaClosedSnapshot|null{
 try{const record=views.get(dataset);if(!record)return captureAlpacaClosedSnapshot(dataset,expectedRows);selectedCompletionCurrent(dataset,expectedRows,record);
  const observation=captureAlpacaClosedSnapshot(record.raw,record.rawBars);if(!observation)return null;
  for(let index=0;index<record.rows.length;index++){const row=data(record.rawBars,String(index));if(row!==record.rows[index]||!row||typeof row!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(row)))throw Error('The actual raw session row changed.');for(let field=0;field<FIELDS.length;field++)if(!Object.is(data(row,FIELDS[field]),record.values[index*FIELDS.length+field]))throw Error('The actual raw session value changed.');}
  for(let index=0;index<record.indices.length;index++)if(data(record.bars,String(index))!==record.rows[record.indices[index]])throw Error('The actual selected session row changed.');
  observation.assertCurrent();selectedCompletionCurrent(dataset,expectedRows,record);
  const selected=new WeakRef(dataset),input=new WeakRef(expectedRows),lease=new WeakRef(record);let alive=true;
  return Object.freeze({rows:record.indices.length,coveredFrom:observation.coveredFrom,coveredThrough:observation.coveredThrough,assertCurrent(){if(!alive)throw Error('The session completion observation retired.');try{const dataset=selected.deref(),rows=input.deref(),owned=lease.deref();if(!dataset||!rows||!owned)throw Error('The session completion observation retired.');selectedCompletionCurrent(dataset,rows,owned);observation.assertCurrent();}catch(error){alive=false;throw error;}}});
 }catch{return null;}
}

/** Fixed actual constructor/selection membership only, before source admission.
 * The opaque daily plan owns no M/native publication. Actual C consumption must
 * separately compare the full admitted selected original/native M input. */
export function captureAlpacaSessionSeasonalityDailyPlan(dataset:BarDataset,expectedRows:readonly Bar[],startYear:number,endYear:number):AlpacaSeasonalityDailyPlan|null{
 try{
  const record=views.get(dataset);if(!record)return captureAlpacaSeasonalityDailyPlan(dataset,expectedRows,startYear,endYear);
  selectedCompletionCurrent(dataset,expectedRows,record);
  const plan=captureAlpacaSeasonalityDailyPlan(record.raw,record.rawBars,startYear,endYear);if(!plan)return null;
  selectedCompletionCurrent(dataset,expectedRows,record);plan.assertCurrent();return plan;
 }catch{return null;}
}
/** Full admitted original selection comparison, no source resolver/return.
 * Real view membership + immutable construction pins are mandatory; copied,
 * detached or mutated arrays cannot become an actual original by value alone. */
export function alpacaSeasonalitySessionInputValuesMatch(dataset:BarDataset,expectedRows:readonly Bar[]):boolean{
 try{
  const record=views.get(dataset);if(!record)return !!alpacaClosedSnapshotInputFacts(dataset,expectedRows);
  selectedCompletionCurrent(dataset,expectedRows,record);
  for(let index=0;index<record.rows.length;index++){
   const row=data(record.rawBars,String(index));if(row!==record.rows[index]||!row||typeof row!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(row)))return false;
   for(let field=0;field<FIELDS.length;field++)if(!Object.is(data(row,FIELDS[field]),record.values[index*FIELDS.length+field]))return false;
  }
  for(let index=0;index<record.indices.length;index++)if(data(record.bars,String(index))!==record.rows[record.indices[index]])return false;
  selectedCompletionCurrent(dataset,expectedRows,record);return true;
 }catch{return false;}
}
