import Decimal from 'decimal.js';

export const FIB_LEVEL_FORMAT_FIELD='lvFibLevelFormat';
export type FibLevelFormat='coefficient'|'percent';
export const FIB_LEVEL_FORMAT_DIAGNOSTIC='Unsupported Fibonacci level format is retained. Level-value labels and format editing are unavailable; prices and custom text remain separate.';
const PercentDecimal=Decimal.clone({precision:40,toExpNeg:-7,toExpPos:21});
export function isFibLevelFormat(value:unknown):value is FibLevelFormat{return value==='coefficient'||value==='percent';}
/** Inspect a bounded plain patch before JSON omission can hide an invalid input. */
export function assertFibLevelFormatPatchValues(patch:Record<string,unknown>):void{
 const member=Object.getOwnPropertyDescriptor(patch,FIB_LEVEL_FORMAT_FIELD);
 if(member&&(!member.enumerable||!Object.hasOwn(member,'value')||!isFibLevelFormat(member.value)))throw Error(FIB_LEVEL_FORMAT_DIAGNOSTIC);
}
export type FibLevelFormatState={state:'legacy'|'supported';format:FibLevelFormat}|{state:'unavailable';message:string};
export function readFibLevelFormat(props:unknown):FibLevelFormatState{
 if(props===undefined)return{state:'legacy',format:'coefficient'};
 if(!props||typeof props!=='object'||Array.isArray(props)||![Object.prototype,null].includes(Object.getPrototypeOf(props)))return{state:'unavailable',message:FIB_LEVEL_FORMAT_DIAGNOSTIC};
 const member=Object.getOwnPropertyDescriptor(props,FIB_LEVEL_FORMAT_FIELD);
 if(!member)return{state:'legacy',format:'coefficient'};
 if(!member.enumerable||!Object.hasOwn(member,'value')||!isFibLevelFormat(member.value))return{state:'unavailable',message:FIB_LEVEL_FORMAT_DIAGNOSTIC};
 return{state:'supported',format:member.value};
}
/** Display conversion only: stored ratios and geometry never pass through this function. */
export function formatFibLevelRatio(ratio:number,format:FibLevelFormat):string{
 if(typeof ratio!=='number'||!Number.isFinite(ratio))throw Error('Fibonacci level ratio must be finite.');
 if(!isFibLevelFormat(format))throw Error('Unsupported Fibonacci level format.');
 return format==='coefficient'?String(ratio):new PercentDecimal(String(ratio)).times(100).toString()+'%';
}
type Row=Record<string,unknown>;
function dataMember(value:unknown,key:string):PropertyDescriptor|undefined{
 if(!value||typeof value!=='object'||Array.isArray(value))return;
 const member=Object.getOwnPropertyDescriptor(value,key);
 return member&&member.enumerable&&Object.hasOwn(member,'value')?member:undefined;
}
/** After the caller's existing JSON validation, retain this semantic presence
 * bit in detached internal drawing data. All other JSON normalization stays
 * unchanged. Disk JSON still cannot represent an explicit undefined member. */
export function retainFibLevelFormatPresence<T>(source:unknown,prepared:T):T{
 if(dataMember(source,'type')?.value!=='fibretracement')return prepared;
 const member=dataMember(dataMember(source,'props')?.value,FIB_LEVEL_FORMAT_FIELD);
 if(!member||member.value!==undefined)return prepared;
 if(dataMember(prepared,'type')?.value!=='fibretracement'||!Object.is(dataMember(source,'id')?.value,dataMember(prepared,'id')?.value))throw Error('Fibonacci format projection row identity changed.');
 const props=dataMember(prepared,'props')?.value;
 if(props!==undefined&&(!props||typeof props!=='object'||Array.isArray(props)))throw Error('Fibonacci format projection props are unavailable.');
 return{...prepared,props:{...props as Row|undefined,[FIB_LEVEL_FORMAT_FIELD]:undefined}};
}

/** Level price from the two anchors. Linear unless the log-scale option is on.
 * In log space the level is exp(log(p1) + r * (log(p2) - log(p1))). The reference fact names only the toggle
 * (fibLevelsBasedOnLogScale), not this formula. Log space needs positive prices; otherwise the result is NaN so the caller can fall back or refuse. */
export function fibLevelPrice(p1:number,p2:number,ratio:number,logScale:boolean):number{
 if(![p1,p2,ratio].every(Number.isFinite))return NaN;
 if(!logScale)return p1+ratio*(p2-p1);
 if(!(p1>0&&p2>0))return NaN;
 return Math.exp(Math.log(p1)+ratio*(Math.log(p2)-Math.log(p1)));
}
