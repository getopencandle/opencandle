import type {Bar} from '../domain/types';
/**
 * Exact fast copies of chart bar arrays.
 *
 * The market queue copied every input with structuredClone, about 30 ms for 20,000 bars, twice per live tick and chart.
 * These helpers return a value equal to what structuredClone returns (same keys in the same order, same numbers including
 * -0 and NaN, fresh objects, no shared references), but only for the common shape: a dense array of plain objects whose own
 * enumerable values are all numbers, with strictly increasing numeric `time` (so no object appears twice). Anything else
 * (holes, extra array fields, prototypes, nested objects, accessors that change between reads, symbols, duplicates) falls
 * back to structuredClone itself, so the result and every error stay exactly as before.
 */
const OBJECT=Object.prototype,ARRAY=Array.prototype;
const consumedMarketSources=new WeakMap<object,WeakRef<object>>();
/** Historical constructor observation only: no source lookup, attachment, row or publication authority. */
export function marketInputCloneConsumedSourceMatches(output:unknown,expectedSource:unknown):boolean{return !!output&&typeof output==='object'&&!!expectedSource&&typeof expectedSource==='object'&&consumedMarketSources.get(output)?.deref()===expectedSource;}
/** One bar, or null when it is not the plain all-number shape. */
function plainBar(bar:unknown):Record<string,number>|null{
 if(bar===null||typeof bar!=='object'||Object.getPrototypeOf(bar)!==OBJECT)return null;
 const source=bar as Record<string,unknown>,keys=Object.keys(source);
 if(keys.length===6&&keys[0]==='time'&&keys[1]==='open'&&keys[2]==='high'&&keys[3]==='low'&&keys[4]==='close'&&keys[5]==='volume'){
  const time=source.time,open=source.open,high=source.high,low=source.low,close=source.close,volume=source.volume;
  if(typeof time!=='number'||typeof open!=='number'||typeof high!=='number'||typeof low!=='number'||typeof close!=='number'||typeof volume!=='number')return null;
  return {time,open,high,low,close,volume};
 }
 if(keys.length>64)return null;
 const copy:Record<string,number>={};
 for(const key of keys){const value=source[key];if(typeof value!=='number')return null;copy[key]=value;}
 return copy;
}
/** A fresh copy of a dense bar list, or null when the fast shape does not hold. */
function plainBars(bars:readonly unknown[]):Bar[]|null{
 const count=bars.length,out:Bar[]=new Array(count);let previous=-Infinity;
 for(let index=0;index<count;index++){
  const copy=plainBar(bars[index]);if(!copy)return null;
  const time=copy.time;if(typeof time!=='number'||!(time>previous))return null;previous=time;
  // The copy is re-read: a getter that returned different values between the shape check and the copy is caught here.
  if((bars[index] as Record<string,unknown>).time!==time)return null;
  out[index]=copy as unknown as Bar;
 }
 return out;
}
/** Same value as `structuredClone([...bars])`. */
export function cloneBarList(bars:readonly Bar[]):Bar[]{
 const spread=[...bars];
 return plainBars(spread)??structuredClone(spread);
}
/** Same value as `structuredClone(bars)` for a bar array (holes or extra array fields take the structuredClone path). */
export function cloneBarArray(bars:readonly Bar[]):Bar[]{
 if(Array.isArray(bars)&&Object.getPrototypeOf(bars)===ARRAY&&Object.keys(bars).length===bars.length){const copy=plainBars(bars);if(copy)return copy;}
 return structuredClone(bars) as Bar[];
}
/** Same value as `structuredClone(value)` for a `{bars, source}` market input. */
export function cloneMarketInput<T extends {bars:readonly Bar[];source:unknown}>(value:T):T{
 if(value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===OBJECT){
  const keys=Object.keys(value),bars=value.bars;
  if(keys.length===2&&keys[0]==='bars'&&keys[1]==='source'&&Array.isArray(bars)&&Object.getPrototypeOf(bars)===ARRAY&&Object.keys(bars).length===bars.length){
   const copy=plainBars(bars);
   if(copy){const source=value.source,output={bars:copy,source:structuredClone(source)} as unknown as T;try{if(source&&typeof source==='object')consumedMarketSources.set(output,new WeakRef(source));}catch{/* Optional weak observation cannot change clone values or errors. */}return output;}
  }
 }
 return structuredClone(value);
}
