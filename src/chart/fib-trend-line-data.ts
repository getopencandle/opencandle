import {supportedColor} from './color-validation';
import {measureWorkspaceJSON} from '../ui/workspace-json';

export const FIB_TREND_LINE_FIELD='lvFibTrendLine';
export const FIB_TREND_LINE_PREFIX=FIB_TREND_LINE_FIELD+'.';
export const FIB_TREND_LINE_COLOR_PATH=FIB_TREND_LINE_PREFIX+'color';
export const FIB_TREND_LINE_DIAGNOSTIC='Unsupported Fibonacci trend line is retained. Trend-line editing and rendering are unavailable; individual levels remain separate.';
export interface FibTrendLineSettings {readonly schemaVersion:1;readonly enabled:boolean;readonly color:string;readonly width:number;readonly style:'solid'|'dashed'|'dotted'}
export type FibTrendLineState={readonly state:'legacy'|'supported';readonly settings:Readonly<FibTrendLineSettings>}|{readonly state:'unavailable';readonly message:string};
const keys=['schemaVersion','enabled','color','width','style'];
function plain(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
function member(value:unknown,key:string):PropertyDescriptor|undefined{if(!plain(value))return;return Object.getOwnPropertyDescriptor(value,key);}
export function validateFibTrendLineSettings(value:unknown):Readonly<FibTrendLineSettings>{
 if(!plain(value)||Reflect.ownKeys(value).length!==keys.length)throw Error(FIB_TREND_LINE_DIAGNOSTIC);
 const out:Record<string,unknown>={};
 for(const key of keys){const d=member(value,key);if(!d||!d.enumerable||!Object.hasOwn(d,'value'))throw Error(FIB_TREND_LINE_DIAGNOSTIC);out[key]=d.value;}
 if(out.schemaVersion!==1||typeof out.enabled!=='boolean'||!supportedColor(out.color)||!Number.isInteger(out.width)||Number(out.width)<1||Number(out.width)>10||!['solid','dashed','dotted'].includes(out.style as string))throw Error(FIB_TREND_LINE_DIAGNOSTIC);
 return Object.freeze(out) as unknown as Readonly<FibTrendLineSettings>;
}
export function readFibTrendLine(props:unknown,defaults:Readonly<FibTrendLineSettings>):FibTrendLineState{
 const unavailable=():FibTrendLineState=>({state:'unavailable',message:FIB_TREND_LINE_DIAGNOSTIC});
 if(props===undefined)return{state:'legacy',settings:validateFibTrendLineSettings(defaults)};
 if(!plain(props))return unavailable();const d=member(props,FIB_TREND_LINE_FIELD);
 if(!d)return{state:'legacy',settings:validateFibTrendLineSettings(defaults)};
 if(!d.enumerable||!Object.hasOwn(d,'value'))return unavailable();
 try{return{state:'supported',settings:validateFibTrendLineSettings(d.value)};}catch{return unavailable();}
}
export function assertFibTrendLinePatchValues(patch:Readonly<Record<string,unknown>>):void{
 for(const key of Reflect.ownKeys(patch)){
  if(typeof key!=='string'||key!==FIB_TREND_LINE_FIELD&&!key.startsWith(FIB_TREND_LINE_PREFIX))continue;
  const d=Object.getOwnPropertyDescriptor(patch,key);if(!d||!d.enumerable||!Object.hasOwn(d,'value'))throw Error(FIB_TREND_LINE_DIAGNOSTIC);
  const value=d.value,path=key.slice(FIB_TREND_LINE_PREFIX.length);
  if(path==='enabled'?typeof value!=='boolean':path==='color'?!supportedColor(value):path==='width'?!Number.isInteger(value)||value<1||value>10:path==='style'?!['solid','dashed','dotted'].includes(value):true)throw Error(FIB_TREND_LINE_DIAGNOSTIC);
 }
}
/** Validation precedes copying; optional object undefined and signed zero are semantic data here. */
export function cloneFibTrendLineMember(value:unknown):unknown{
 measureWorkspaceJSON({member:value});
 function copy(item:unknown):unknown{if(!item||typeof item!=='object')return item;const result:any=Array.isArray(item)?[]:{};for(const key of Reflect.ownKeys(item)){if(key==='length'&&Array.isArray(item))continue;const d=Object.getOwnPropertyDescriptor(item,key)!;Object.defineProperty(result,key,{value:copy(d.value),enumerable:true,writable:true,configurable:true});}return result;}
 return copy(value);
}
export function retainFibTrendLineMember<T>(rawRow:unknown,preparedRow:T):T{
 if(member(rawRow,'type')?.value!=='fibretracement')return preparedRow;
 const rawProps=member(rawRow,'props')?.value,d=member(rawProps,FIB_TREND_LINE_FIELD);if(!d)return preparedRow;
 if(!d.enumerable||!Object.hasOwn(d,'value'))throw Error(FIB_TREND_LINE_DIAGNOSTIC);
 if(member(preparedRow,'type')?.value!=='fibretracement'||!Object.is(member(rawRow,'id')?.value,member(preparedRow,'id')?.value))throw Error('Fibonacci trend-line projection row identity changed.');
 const preparedProps=member(preparedRow,'props')?.value;if(preparedProps!==undefined&&!plain(preparedProps))throw Error(FIB_TREND_LINE_DIAGNOSTIC);
 return{...preparedRow,props:{...preparedProps,[FIB_TREND_LINE_FIELD]:cloneFibTrendLineMember(d.value)}};
}
export function sameFibTrendLineInterpretation(leftProps:unknown,rightProps:unknown,defaults:Readonly<FibTrendLineSettings>):boolean{
 const left=readFibTrendLine(leftProps,defaults),right=readFibTrendLine(rightProps,defaults);
 if(left.state==='unavailable'||right.state==='unavailable')return false;
 return keys.every(key=>Object.is(left.settings[key as keyof FibTrendLineSettings],right.settings[key as keyof FibTrendLineSettings]));
}
export function fibTrendLineDraftColor(state:FibTrendLineState,values:Readonly<Record<string,unknown>>):string|undefined{
 if(state.state==='unavailable')return;const d=Object.getOwnPropertyDescriptor(values,FIB_TREND_LINE_COLOR_PATH);if(!d)return state.settings.color;
 return Object.hasOwn(d,'value')&&supportedColor(d.value)?d.value:'';
}
export function withFibTrendLineDraftColor<T extends Record<string,unknown>>(state:FibTrendLineState,values:T,color:string):T{
 if(state.state==='unavailable'||!supportedColor(color))throw Error(FIB_TREND_LINE_DIAGNOSTIC);
 return fibTrendLineDraftColor(state,values)===color?values:{...values,[FIB_TREND_LINE_COLOR_PATH]:color};
}
