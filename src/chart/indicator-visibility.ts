import {parseInterval,type IntervalUnit} from '../domain/intervals';

export const INDICATOR_VISIBILITY_UNITS=['second','minute','day','week','month','tick','range'] as const;
export type IndicatorVisibilityUnit=typeof INDICATOR_VISIBILITY_UNITS[number];
export type IndicatorVisibilityMode='all'|'include'|'exclude';
export interface IndicatorVisibilityRange {unit:IndicatorVisibilityUnit;min:number;max:number}
export interface IndicatorIntervalVisibility {schemaVersion:1;mode:IndicatorVisibilityMode;intervals:string[];ranges:IndicatorVisibilityRange[]}
export const INDICATOR_VISIBILITY_RANGE_BOUNDS:Readonly<Record<IndicatorVisibilityUnit,Readonly<{min:number;max:number}>>>=Object.freeze({
 second:Object.freeze({min:1,max:45}),minute:Object.freeze({min:1,max:1440}),day:Object.freeze({min:1,max:365}),week:Object.freeze({min:1,max:52}),month:Object.freeze({min:1,max:12}),tick:Object.freeze({min:1,max:1000}),range:Object.freeze({min:1,max:1000})
});
export interface IndicatorVisibilityDecision {visible:boolean;reason:'all'|'matched'|'not-matched'|'unavailable';diagnostic?:string}
const suffix:Record<IntervalUnit,string>={second:'s',minute:'m',day:'D',week:'W',month:'M',tick:'T',range:'R'};
function record(value:unknown,keys:readonly string[],label:string):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error(`${label} requires a plain record.`);
 const names=Reflect.ownKeys(value);if(names.length!==keys.length||names.some(key=>typeof key!=='string'||!keys.includes(key)))throw Error(`${label} has unsupported or missing fields.`);
 const output:Record<string,unknown>={};for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value'in descriptor))throw Error(`${label} requires enumerable data fields without accessors.`);output[key]=descriptor.value;}return output;
}
function array(value:unknown,maximum:number,label:string):unknown[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>maximum)throw Error(`${label} requires a bounded plain array.`);
 const names=Reflect.ownKeys(value);if(names.length!==value.length+1||names.some(key=>typeof key!=='string'||key!=='length'&&!/^(?:0|[1-9]\d*)$/.test(key)))throw Error(`${label} cannot contain extra fields, holes or custom serializers.`);
 const output:unknown[]=[];for(let index=0;index<value.length;index++){const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor?.enumerable||!('value'in descriptor))throw Error(`${label} requires dense enumerable data entries.`);output.push(descriptor.value);}return output;
}
function ranges(value:unknown):IndicatorVisibilityRange[]{
 const seen=new Set<string>();return array(value,INDICATOR_VISIBILITY_UNITS.length,'Visibility ranges').map(item=>{
  const row=record(item,['unit','min','max'],'Visibility range');if(typeof row.unit!=='string'||!INDICATOR_VISIBILITY_UNITS.includes(row.unit as IndicatorVisibilityUnit)||seen.has(row.unit))throw Error('Visibility ranges require one supported unit family each.');
  const unit=row.unit as IndicatorVisibilityUnit;
  if(typeof row.min!=='number'||typeof row.max!=='number'||!Number.isSafeInteger(row.min)||!Number.isSafeInteger(row.max)||row.min<1||row.min>row.max)throw Error('Visibility range endpoints must be ordered positive integers.');
  // Share the exact declared interval catalog, including sparse seconds/event counts.
  parseInterval(`${row.min}${suffix[unit]}`);parseInterval(`${row.max}${suffix[unit]}`);seen.add(unit);return{unit,min:row.min,max:row.max};
 });
}
/** Strict recovery boundary: saved aliases are rejected rather than silently rewritten. */
export function validateIndicatorIntervalVisibility(value:unknown):IndicatorIntervalVisibility{
 const row=record(value,['schemaVersion','mode','intervals','ranges'],'Indicator interval visibility');
 if(row.schemaVersion!==1||typeof row.mode!=='string'||!['all','include','exclude'].includes(row.mode))throw Error('Unsupported indicator interval visibility version or mode.');
 const seen=new Set<string>(),intervals=array(row.intervals,100,'Visibility intervals').map(value=>{
  if(typeof value!=='string')throw Error('Visibility intervals require canonical text.');const canonical=parseInterval(value).id;
  if(canonical!==value||seen.has(canonical))throw Error('Visibility intervals must be unique canonical identifiers.');seen.add(canonical);return canonical;
 });
 return{schemaVersion:1,mode:row.mode as IndicatorVisibilityMode,intervals,ranges:ranges(row.ranges)};
}
/** Only an explicit editor action canonicalizes aliases. Canonical duplicates still reject. */
export function makeIndicatorIntervalVisibility(mode:IndicatorVisibilityMode,intervals:readonly string[],inputRanges:readonly IndicatorVisibilityRange[]):IndicatorIntervalVisibility{
 const canonical=array(intervals,100,'Visibility editor intervals').map(value=>{if(typeof value!=='string')throw Error('Visibility intervals require text.');return parseInterval(value).id;});
 return validateIndicatorIntervalVisibility({schemaVersion:1,mode,intervals:canonical,ranges:ranges(inputRanges)});
}
/** A display filter never substitutes chart cadence or calculates another timeframe. */
export function indicatorIntervalVisibility(rule:IndicatorIntervalVisibility|undefined,resolution:string|null|undefined):IndicatorVisibilityDecision{
 if(rule===undefined)return{visible:true,reason:'all'};
 const checked=validateIndicatorIntervalVisibility(rule);if(checked.mode==='all')return{visible:true,reason:'all'};
 let interval:ReturnType<typeof parseInterval>;
 try{if(typeof resolution!=='string')throw Error('The committed source has no declared resolution.');interval=parseInterval(resolution);}
 catch(cause){return{visible:false,reason:'unavailable',diagnostic:'Indicator native output is withheld because its interval visibility rule cannot classify the committed source. '+(cause instanceof Error?cause.message:'Unsupported declared resolution.')};}
 const matched=checked.intervals.includes(interval.id)||checked.ranges.some(range=>range.unit===interval.unit&&interval.multiplier>=range.min&&interval.multiplier<=range.max);
 return{visible:checked.mode==='include'?matched:!matched,reason:matched?'matched':'not-matched'};
}
