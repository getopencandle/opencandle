import {CATALOG_INDICATORS} from './indicator-catalog';
/**
 * Indicator-on-indicator sources. A source input may name another built-in instance's calculated plot
 * on the same chart instead of a price field. The reference is a plain string so it travels through
 * native inputs, snapshots and templates unchanged: `lv-plot:["<instance id>","<plot id>"]`.
 * Values are the referenced plot's calculated (unshifted) series; display offset never applies.
 */
export const INDICATOR_SOURCE_PREFIX='lv-plot:';
/** Built-ins whose Source input accepts another indicator's plot. */
export const INDICATOR_SOURCE_KINDS:readonly string[]=Object.freeze(['sma','ema','rsi','macd','bb',...CATALOG_INDICATORS.filter(definition=>definition.sourceSeries).map(definition=>definition.id)]);
/** Longest accepted chain (A uses B uses C ...), bounding recomputation work. */
export const INDICATOR_SOURCE_MAX_DEPTH=8;
export interface IndicatorSourceRef {instance:string;plot:string}
const identity=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0&&value.length<=200&&!/[\u0000-\u001f\u007f]/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
export function encodeIndicatorSource(instance:string,plot:string):string{
 if(!identity(instance)||!identity(plot))throw new Error('An indicator source needs a valid instance and plot identity.');
 return INDICATOR_SOURCE_PREFIX+JSON.stringify([instance,plot]);
}
/** Strict parse: only the exact canonical encoding is a reference; anything else is not. */
export function parseIndicatorSource(value:unknown):IndicatorSourceRef|null{
 if(typeof value!=='string'||!value.startsWith(INDICATOR_SOURCE_PREFIX)||value.length>INDICATOR_SOURCE_PREFIX.length+420)return null;
 try{const parsed:unknown=JSON.parse(value.slice(INDICATOR_SOURCE_PREFIX.length));if(Array.isArray(parsed)&&parsed.length===2&&identity(parsed[0])&&identity(parsed[1])&&encodeIndicatorSource(parsed[0],parsed[1])===value)return {instance:parsed[0],plot:parsed[1]};}catch{/* not a reference */}
 return null;
}
interface SourceRow {id:string;inputs:Record<string,unknown>;kind?:string}
const refOf=(row:SourceRow)=>Object.hasOwn(row.inputs,'source')?parseIndicatorSource(row.inputs.source):null;
/**
 * Reject self references, cycles and over-deep chains across one chart's instances. Missing targets
 * are allowed only where the caller keeps an explicitly unavailable dependent (allowMissing).
 */
export function validateIndicatorSourceGraph(rows:readonly SourceRow[],options:{allowMissing:boolean;plots?:(kind:string)=>readonly string[]}):void{
 const byId=new Map(rows.map(row=>[row.id,row]));
 for(const row of rows){
  let current:SourceRow|undefined=row,depth=0;const seen=new Set<string>([row.id]);
  while(current){
   const ref=refOf(current);if(!ref)break;
   if(ref.instance===current.id)throw new Error('An indicator cannot use its own plot as its source.');
   if(seen.has(ref.instance))throw new Error('This indicator source would create a calculation cycle.');
   if(++depth>INDICATOR_SOURCE_MAX_DEPTH)throw new Error(`Indicator source chains are limited to ${INDICATOR_SOURCE_MAX_DEPTH} levels.`);
   const next=byId.get(ref.instance);if(!next){if(!options.allowMissing)throw new Error('An indicator source refers to an indicator that is not present.');break;}
   if(options.plots&&next.kind!==undefined&&!options.plots(next.kind).includes(ref.plot))throw new Error('An indicator source refers to a plot that its indicator does not produce.');
   seen.add(ref.instance);current=next;
  }
 }
}
/** Every instance that (directly or transitively) calculates from `id`, nearest first. */
export function indicatorSourceDependents(rows:readonly SourceRow[],id:string):string[]{
 const out:string[]=[],queue=[id],seen=new Set([id]);
 while(queue.length){const target=queue.shift()!;for(const row of rows){const ref=refOf(row);if(ref?.instance===target&&!seen.has(row.id)){seen.add(row.id);out.push(row.id);queue.push(row.id);}}}
 return out;
}
/** Stable dependency order: every source precedes the instances calculated from it; unrelated rows keep their order. */
export function orderIndicatorSourceGraph<T extends SourceRow>(rows:readonly T[]):T[]{
 const ids=new Set(rows.map(row=>row.id)),placed=new Set<string>(),out:T[]=[];
 while(out.length<rows.length){const before=out.length;for(const row of rows){if(placed.has(row.id))continue;const ref=refOf(row);if(ref&&ids.has(ref.instance)&&!placed.has(ref.instance))continue;placed.add(row.id);out.push(row);}if(out.length===before)throw new Error('This indicator source would create a calculation cycle.');}
 return out;
}
/** Rewrite references through an identity map (template instantiation). Unmapped targets are rejected. */
export function remapIndicatorSource(value:unknown,ids:ReadonlyMap<string,string>):unknown{
 const ref=parseIndicatorSource(value);if(!ref)return value;
 const next=ids.get(ref.instance);if(!next)throw new Error('A template indicator source refers to an indicator outside the template.');
 return encodeIndicatorSource(next,ref.plot);
}
