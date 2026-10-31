import type {Bar} from '../domain/types';
import {cloneBarList} from './bar-clone';
import {cloneMarketInputWithSourceContext,localCandleSourceInputMatches,completionSourceInputMatches,producerCompletionSourceInputMatches,captureClosedTimeframeContext,seasonalityDailyProducerInputValuesMatch,type ClosedTimeframeContext,type ChartSourceContext} from './source-context';

/** Nonportable ancestry for the actual owned clone operations. No caller can register an arbitrary array.
 * One shared six-number snapshot checks both the source and each copy; rollback copies share that snapshot. */
interface Snapshot {original:readonly Bar[];rows:readonly Bar[];values:Float64Array}
interface Copy {snapshot:Snapshot;rows:readonly Bar[]}
const copies=new WeakMap<readonly Bar[],Copy>(),knownCopies=new WeakSet<readonly Bar[]>(),originals=new WeakMap<readonly Bar[],Snapshot>(),retiredSnapshots=new WeakSet<Snapshot>();
const FIELDS=['time','open','high','low','close','volume'] as const,MAX_BARS=100000;
function own(object:object,key:PropertyKey):unknown{const field=Object.getOwnPropertyDescriptor(object,key);if(!field?.enumerable||!Object.hasOwn(field,'value'))throw Error('Profile clone ancestry requires plain own data.');return field.value;}
function array(bars:readonly Bar[]):number{if(!Array.isArray(bars)||Object.getPrototypeOf(bars)!==Array.prototype||bars.length>MAX_BARS||Reflect.ownKeys(bars).length!==bars.length+1)throw Error('Profile clone ancestry requires a bounded dense input.');return bars.length;}
function row(bars:readonly Bar[],index:number):Bar{const value=own(bars,String(index));if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Profile clone row is unavailable.');if(Reflect.ownKeys(value).length!==FIELDS.length)throw Error('Profile clone row shape changed.');return value as Bar;}
function matches(bars:readonly Bar[],values:Float64Array,expected:readonly Bar[]):void{
 const count=array(bars);if(values.length!==count*FIELDS.length||expected.length!==count)throw Error('Profile clone length changed.');
 for(let index=0;index<count;index++){const value=row(bars,index);if(value!==expected[index])throw Error('Profile clone rows were replaced.');for(let field=0;field<FIELDS.length;field++){const scalar=own(value,FIELDS[field]);if(typeof scalar!=='number'||!Object.is(scalar,values[index*FIELDS.length+field]))throw Error('Profile clone values changed.');}}
}
function assertCopy(bars:readonly Bar[],copy:Copy):void{if(retiredSnapshots.has(copy.snapshot))throw Error('Profile clone original is retired.');try{matches(copy.snapshot.original,copy.snapshot.values,copy.snapshot.rows);}catch(error){retiredSnapshots.add(copy.snapshot);throw error;}matches(bars,copy.snapshot.values,copy.rows);}
/** Unregistered raw arrays stay themselves; registered retired copies never become new originals. */
export function profileInputOriginal(bars:readonly Bar[]):readonly Bar[]|null{
 const copy=copies.get(bars);if(!copy)return knownCopies.has(bars)?null:bars;
 try{assertCopy(bars,copy);return copy.snapshot.original;}catch{copies.delete(bars);return null;}
}
function retain(bars:Bar[],input:readonly Bar[]):void{
 if(bars===input)return;knownCopies.add(bars);
 try{const inherited=copies.get(input);if(inherited&&retiredSnapshots.has(inherited.snapshot)){copies.delete(input);return;}if(knownCopies.has(input)&&!inherited)return;
  const count=array(bars);if(array(input)!==count)return;
  // These rows have just been created by our actual existing clone operation; no caller can supply this copy.
  // Read that trusted copy once here. Full descriptor/row/value checks of BOTH arrays remain mandatory at consumption.
  const rows:Bar[]=new Array(count);let proof=inherited?.snapshot;
  if(!proof){const prior=originals.get(input);let originalRows:Bar[]=prior?.rows.length===count?prior.rows as Bar[]:new Array(count),sharedRows=originalRows===prior?.rows,values=prior?.values.length===count*FIELDS.length?prior.values:new Float64Array(count*FIELDS.length),shared=values===prior?.values;
   for(let index=0;index<count;index++){const value=bars[index];if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return;const keys=Object.keys(value);if(keys.length!==FIELDS.length)return;if(keys.some((key,field)=>key!==FIELDS[field])&&FIELDS.some(key=>!keys.includes(key)))return;
    const original=own(input,String(index));if(!original||typeof original!=='object')return;if(sharedRows&&originalRows[index]!==original){originalRows=[...originalRows];sharedRows=false;}if(!sharedRows)originalRows[index]=original as Bar;rows[index]=value;
    for(let field=0;field<FIELDS.length;field++){const scalar=value[FIELDS[field]];if(typeof scalar!=='number')return;const slot=index*FIELDS.length+field;if(shared&&!Object.is(values[slot],scalar)){values=new Float64Array(values);shared=false;}if(!shared)values[slot]=scalar;}}
   proof=prior&&prior.rows===originalRows&&prior.values===values&&!retiredSnapshots.has(prior)?prior:Object.freeze({original:input,rows:Object.freeze(originalRows),values});originals.set(input,proof);
  }else for(let index=0;index<count;index++)rows[index]=bars[index];
  copies.set(bars,{snapshot:proof,rows:Object.freeze(rows)});
 }catch{/* A proof refusal does not change the existing clone result or error semantics. */}
}
/** Same cloning behavior as cloneBarList; authority is minted only inside this exact copy operation. */
export function cloneProfileInputBars(bars:readonly Bar[]):Bar[]{const copy=cloneBarList(bars);retain(copy,bars);return copy;}
/** Queue rollback copies retain ancestry only when their actual incoming clone is still exact. */
export function cloneProfileMarketInput<T extends {bars:readonly Bar[];source:unknown}>(input:T):T{const copy=cloneMarketInputWithSourceContext(input);try{retain(own(copy,'bars') as Bar[],own(input,'bars') as readonly Bar[]);}catch{/* An unprovable result stays a normal unregistered value. */}return copy;}

/** Fixed private transport membership only. This chooses an already-authored
 * incoming clone; full admitted original/copy/native checks still decide values.
 * Unknown copies are rejected before any supplied context or row access. */
export function profileCloneProducerInputMatches(bars:readonly Bar[],context:ChartSourceContext):boolean{
 if(!bars||typeof bars!=='object')return false;const copy=copies.get(bars);
 if(!copy||retiredSnapshots.has(copy.snapshot))return false;const snapshot=copy.snapshot;
 try{return producerCompletionSourceInputMatches(context,snapshot.original)&&copies.get(bars)===copy&&copy.snapshot===snapshot&&!retiredSnapshots.has(snapshot);}catch{return false;}
}

/** Existing private-copy ancestry only. The caller admits this fixed work before invoking it; no own-key enumeration. */
export function localCandleCloneMatches(bars:readonly Bar[],expectedOriginal:unknown,admittedRows:number):boolean{
 if(!Number.isSafeInteger(admittedRows)||admittedRows<1||admittedRows>MAX_BARS||!bars||typeof bars!=='object')return false;
 const copy=copies.get(bars);if(!copy||copy.snapshot.original!==expectedOriginal||retiredSnapshots.has(copy.snapshot))return false;
 if(copy.rows.length!==admittedRows||copy.snapshot.rows.length!==admittedRows||copy.snapshot.values.length!==admittedRows*FIELDS.length)return false;
 const fixedMatches=(input:readonly Bar[],expected:readonly Bar[])=>{
  if(!Array.isArray(input)||Object.getPrototypeOf(input)!==Array.prototype)throw Error('Local candle clone array changed.');const length=Object.getOwnPropertyDescriptor(input,'length');if(!length||!Object.hasOwn(length,'value')||length.value!==admittedRows)throw Error('Local candle clone count changed.');
  for(let index=0;index<admittedRows;index++){const value=own(input,String(index));if(!value||typeof value!=='object'||value!==expected[index])throw Error('Local candle clone row changed.');const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)throw Error('Local candle clone row prototype changed.');
   for(let field=0;field<FIELDS.length;field++){const scalar=own(value,FIELDS[field]);if(typeof scalar!=='number'||!Object.is(scalar,copy.snapshot.values[index*FIELDS.length+field]))throw Error('Local candle clone value changed.');}}
 };
 try{fixedMatches(copy.snapshot.original,copy.snapshot.rows);}catch{retiredSnapshots.add(copy.snapshot);copies.delete(bars);return false;}
 try{fixedMatches(bars,copy.rows);}catch{copies.delete(bars);return false;}
 try{fixedMatches(copy.snapshot.original,copy.snapshot.rows);}catch{retiredSnapshots.add(copy.snapshot);copies.delete(bars);return false;}
 return copies.get(bars)===copy&&!retiredSnapshots.has(copy.snapshot);
}

/** The expected selected input stays private in its actual context constructor record. */
export function localCandleCloneMatchesContext(bars:readonly Bar[],context:ChartSourceContext,admittedRows:number):boolean{
 const copy=copies.get(bars);if(!copy||!localCandleSourceInputMatches(context,copy.snapshot.original))return false;
 return localCandleCloneMatches(bars,copy.snapshot.original,admittedRows)&&localCandleSourceInputMatches(context,copy.snapshot.original);
}

/** One admitted ancestry pass of the actual selected original and owned copy; no new numeric graph. */
export function captureClonedClosedTimeframe(bars:readonly Bar[],context:ChartSourceContext,admittedRows:number,execution:string):ClosedTimeframeContext|null{
 const copy=copies.get(bars);if(!copy||!completionSourceInputMatches(context,copy.snapshot.original))return null;
 if(!localCandleCloneMatches(bars,copy.snapshot.original,admittedRows))return null;
 const observation=captureClosedTimeframeContext(context,copy.snapshot.original,execution);
 if(!observation||observation.rows!==admittedRows||!completionSourceInputMatches(context,copy.snapshot.original)||!localCandleCloneMatches(bars,copy.snapshot.original,admittedRows))return null;
 observation.assertCurrent();return observation;
}

/** Actual live constructor ancestry only. admittedRows is a traversal bound,
 * never a permission/budget credit; the closed owner funds the full real pass.
 * No original source, row resolver or registration capability is returned. */
export function seasonalityLiveCloneMatchesContext(bars:readonly Bar[],context:ChartSourceContext,admittedRows:number):boolean{
 const copy=copies.get(bars);if(!copy||!completionSourceInputMatches(context,copy.snapshot.original))return false;
 return localCandleCloneMatches(bars,copy.snapshot.original,admittedRows)&&completionSourceInputMatches(context,copy.snapshot.original);
}

/** Closed live comparison only. Actual clone/context membership precedes any
 * supplied row/native access. No source/native receipt or registration is minted.
 * The actual source owner separately admits all work and owns assertCurrent.
 * Two producer passes and the unchanged original/copy/original pre/post checks
 * surround native comparison against the existing private canonical snapshot.
 * No new N/M snapshot exists; its values never escape this module. */
export function seasonalityLiveNativeInputMatches(bars:readonly Bar[],context:ChartSourceContext,admittedRows:number,nativeRaw:readonly unknown[],native:readonly unknown[],shown:readonly unknown[],style:string,nativeTimes:readonly number[],assertCurrent:()=>void,emitGrid?:(times:readonly number[])=>void):boolean{
 if(emitGrid!==undefined){if(typeof emitGrid!=='function')return false;const times=seasonalityLiveNativeInputGrid(bars,context,admittedRows,nativeRaw,native,shown,style,nativeTimes,assertCurrent);if(!times)return false;emitGrid(times);return true;}
 if(!Number.isSafeInteger(admittedRows)||admittedRows<1||admittedRows>MAX_BARS||!bars||typeof bars!=='object'||typeof style!=='string')return false;
 const copy=copies.get(bars);if(!copy||retiredSnapshots.has(copy.snapshot)||!completionSourceInputMatches(context,copy.snapshot.original))return false;
 const snapshot=copy.snapshot,original=snapshot.original;
 if(copy.rows.length!==admittedRows||snapshot.rows.length!==admittedRows||snapshot.values.length!==admittedRows*FIELDS.length)return false;
 const header=(input:readonly unknown[])=>{if(!Array.isArray(input)||Object.getPrototypeOf(input)!==Array.prototype)return false;const length=Object.getOwnPropertyDescriptor(input,'length');return !!length&&Object.hasOwn(length,'value')&&length.value===admittedRows;};
 for(const input of [original,bars,nativeRaw,native,shown,nativeTimes])if(!header(input))return false;
 // Keep both the ordering and terminal shared-snapshot effects of the old
 // comparator, including an observed original mismatch before producer refusal.
 if(!localCandleCloneMatches(bars,original,admittedRows)||!seasonalityDailyProducerInputValuesMatch(context,original,admittedRows))return false;
 const finite=(value:unknown):number=>{if(typeof value!=='number'||!Number.isFinite(value))throw Error('Current live native input requires finite numbers.');return value;};
 let previous=-Infinity,haOpen:number|undefined,haClose:number|undefined;
 for(let index=0;index<admittedRows;index++){
  assertCurrent();
  const values:number[]=[];
  for(let field=0;field<FIELDS.length;field++)values.push(finite(snapshot.values[index*FIELDS.length+field]));
  const [time,o,h,l,c,volume]=values;
  if(time<=previous||Math.min(o,h,l,c)<=0||volume<0||h<Math.max(o,l,c)||l>Math.min(o,h,c))return false;previous=time;
  if(!Object.is(finite(own(nativeTimes,String(index))),time*1000))return false;
  let nextOpen=o,nextClose=c;
  if(style==='heikinashi'){nextOpen=haOpen===undefined?(o+c)/2:(haOpen+haClose!)/2;nextClose=(o+h+l+c)/4;}
  const expected=style==='heikinashi'?[time*1000,nextOpen,Math.max(h,nextOpen,nextClose),Math.min(l,nextOpen,nextClose),nextClose,volume]:[time*1000,o,h,l,c,volume];
  const base=own(nativeRaw,String(index)),paint=own(native,String(index)),display=own(shown,String(index));
  if(!base||typeof base!=='object'||!paint||typeof paint!=='object'||!display||typeof display!=='object')return false;
  for(let field=0;field<FIELDS.length;field++){
   if(!Object.is(finite(own(base,FIELDS[field])),field?values[field]:time*1000)||!Object.is(finite(own(paint,FIELDS[field])),expected[field])||!Object.is(finite(own(display,FIELDS[field])),expected[field]))return false;
  }
  haOpen=nextOpen;haClose=nextClose;assertCurrent();
 }
 // A later native descriptor or owner callback may have changed an earlier
 // clone row. Preserve the entire old comparator and its retirement effects.
 if(!header(nativeTimes))return false;
 for(let index=0;index<admittedRows;index++)if(!Object.is(finite(own(nativeTimes,String(index))),snapshot.values[index*FIELDS.length]*1000))return false;
 if(!localCandleCloneMatches(bars,original,admittedRows))return false;
 if(!seasonalityDailyProducerInputValuesMatch(context,original,admittedRows))return false;assertCurrent();
 return copies.get(bars)===copy&&!retiredSnapshots.has(snapshot)&&completionSourceInputMatches(context,original);
}

// Fixed intrinsic references only; no source/native owner is retained here.
const seasonalityGridDefineProperty=Object.defineProperty,seasonalityGridDescriptor=Object.getOwnPropertyDescriptor,seasonalityGridPrototype=Object.getPrototypeOf,seasonalityGridIsFrozen=Object.isFrozen,seasonalityGridHasOwn=Object.hasOwn,seasonalityGridIs=Object.is,seasonalityGridKey=String,seasonalityGridArrayPrototype=Array.prototype,seasonalityGridPreventExtensions=Object.preventExtensions;

/** Derived seconds only. The actual source owner admits the complete operation
 * before calling. This does not return source/native/publication permission.
 * The existing boolean comparator remains unchanged for its current callers. */
export function seasonalityLiveNativeInputGrid(bars:readonly Bar[],context:ChartSourceContext,admittedRows:number,nativeRaw:readonly unknown[],native:readonly unknown[],shown:readonly unknown[],style:string,nativeTimes:readonly number[],assertCurrent:()=>void):readonly number[]|null{
 if(!Number.isSafeInteger(admittedRows)||admittedRows<1||admittedRows>MAX_BARS||!bars||typeof bars!=='object'||typeof style!=='string')return null;
 const copy=copies.get(bars);if(!copy||retiredSnapshots.has(copy.snapshot)||!completionSourceInputMatches(context,copy.snapshot.original))return null;
 const snapshot=copy.snapshot,original=snapshot.original;
 if(copy.rows.length!==admittedRows||snapshot.rows.length!==admittedRows||snapshot.values.length!==admittedRows*FIELDS.length)return null;
 const header=(input:readonly unknown[])=>{if(!Array.isArray(input)||Object.getPrototypeOf(input)!==Array.prototype)return false;const length=Object.getOwnPropertyDescriptor(input,'length');return !!length&&Object.hasOwn(length,'value')&&length.value===admittedRows;};
 for(const input of [original,bars,nativeRaw,native,shown,nativeTimes])if(!header(input))return null;
 // Preserve original->copy->original terminal effects before producer refusal.
 if(!localCandleCloneMatches(bars,original,admittedRows)||!seasonalityDailyProducerInputValuesMatch(context,original,admittedRows))return null;
 const finite=(value:unknown):number=>{if(typeof value!=='number'||!Number.isFinite(value))throw Error('Current live native input requires finite numbers.');return value;};
 const times:number[]=[],gridField={value:0,enumerable:true,writable:true,configurable:true};
 let previous=-Infinity,haOpen:number|undefined,haClose:number|undefined;
 for(let index=0;index<admittedRows;index++){
  assertCurrent();
  const time=finite(snapshot.values[index*FIELDS.length]),o=finite(snapshot.values[index*FIELDS.length+1]),h=finite(snapshot.values[index*FIELDS.length+2]),l=finite(snapshot.values[index*FIELDS.length+3]),c=finite(snapshot.values[index*FIELDS.length+4]),volume=finite(snapshot.values[index*FIELDS.length+5]);
  if(time<=previous||Math.min(o,h,l,c)<=0||volume<0||h<Math.max(o,l,c)||l>Math.min(o,h,c))return null;previous=time;
  if(!Object.is(finite(own(nativeTimes,String(index))),time*1000))return null;
  let nextOpen=o,nextClose=c,expectedHigh=h,expectedLow=l,expectedTime:number;
  if(style==='heikinashi'){nextOpen=haOpen===undefined?(o+c)/2:(haOpen+haClose!)/2;nextClose=(o+h+l+c)/4;expectedTime=time*1000;expectedHigh=Math.max(h,nextOpen,nextClose);expectedLow=Math.min(l,nextOpen,nextClose);}else expectedTime=time*1000;
  const base=own(nativeRaw,String(index)),paint=own(native,String(index)),display=own(shown,String(index));
  if(!base||typeof base!=='object'||!paint||typeof paint!=='object'||!display||typeof display!=='object')return null;
  if(!Object.is(finite(own(base,'time')),expectedTime)||!Object.is(finite(own(paint,'time')),expectedTime)||!Object.is(finite(own(display,'time')),expectedTime))return null;
  if(!Object.is(finite(own(base,'open')),o)||!Object.is(finite(own(paint,'open')),nextOpen)||!Object.is(finite(own(display,'open')),nextOpen))return null;
  if(!Object.is(finite(own(base,'high')),h)||!Object.is(finite(own(paint,'high')),expectedHigh)||!Object.is(finite(own(display,'high')),expectedHigh))return null;
  if(!Object.is(finite(own(base,'low')),l)||!Object.is(finite(own(paint,'low')),expectedLow)||!Object.is(finite(own(display,'low')),expectedLow))return null;
  if(!Object.is(finite(own(base,'close')),c)||!Object.is(finite(own(paint,'close')),nextClose)||!Object.is(finite(own(display,'close')),nextClose))return null;
  if(!Object.is(finite(own(base,'volume')),volume)||!Object.is(finite(own(paint,'volume')),volume)||!Object.is(finite(own(display,'volume')),volume))return null;
  // Own writes avoid inherited indexed setters; this is the sole retained grid.
  gridField.value=time;seasonalityGridDefineProperty(times,seasonalityGridKey(index),gridField);
  haOpen=nextOpen;haClose=nextClose;assertCurrent();
 }
 // Preserve ALL old final comparisons and terminal shared-snapshot effects
 // BEFORE invoking the observable freeze at the old post-comparison phase.
 if(!header(nativeTimes))return null;
 for(let index=0;index<admittedRows;index++)if(!Object.is(finite(own(nativeTimes,String(index))),snapshot.values[index*FIELDS.length]*1000))return null;
 if(!localCandleCloneMatches(bars,original,admittedRows))return null;
 if(!seasonalityDailyProducerInputValuesMatch(context,original,admittedRows))return null;assertCurrent();
 if(!(copies.get(bars)===copy&&!retiredSnapshots.has(snapshot)&&completionSourceInputMatches(context,original)))return null;
 // The private array has not escaped. Prevent extra own properties/graphs
 // before exposing it to the old observable freeze; index edits stay detectable.
 seasonalityGridPreventExtensions(times);
 Object.freeze(times);assertCurrent();
 const length=seasonalityGridDescriptor(times,'length');
 if(seasonalityGridPrototype(times)!==seasonalityGridArrayPrototype||!seasonalityGridIsFrozen(times)||!length||!seasonalityGridHasOwn(length,'value')||length.value!==admittedRows||length.writable!==false)return null;
 // Captured intrinsics only: no input/owner/native callback in this M pass.
 for(let index=0;index<admittedRows;index++){
  const value=seasonalityGridDescriptor(times,seasonalityGridKey(index));
  if(!value||!seasonalityGridHasOwn(value,'value')||value.enumerable!==true||value.writable!==false||value.configurable!==false||!seasonalityGridIs(value.value,snapshot.values[index*FIELDS.length]))return null;
 }
 return copies.get(bars)===copy&&!retiredSnapshots.has(snapshot)&&completionSourceInputMatches(context,original)?times:null;
}
