// What a Fib channel alert reads from a saved Fib channel record, without loading the renderer.
// Data-only mirror of two renderer reads, so the alert watches exactly what the chart paints:
//  - the levels: @luxalgo/vela 0.8.4 FibRatios.readProps keeps each saved level with a number ratio and a string color
//    (enabled unless enabled === false); when no saved level survives, the Fib channel's own defaults apply (0, 0.236, 0.382,
//    0.5, 0.618, 0.786, 1, 1.618, 2.618, all enabled);
//  - Extend left / Extend right: the OpenCandle member props.lvFibChannel (src/chart/lv-types/fib-channel.ts readFibChannel).
//    Absent: no extension (the legacy picture). Unreadable: refused, as the parallel channel and rectangle alerts refuse an
//    unreadable extension member.
// tests/chart/draw-alerts-1028.test.ts pins both reads against the renderer modules.
export const FIB_CHANNEL_DEFAULT_RATIOS=Object.freeze([0,0.236,0.382,0.5,0.618,0.786,1,1.618,2.618]);
export const FIB_CHANNEL_ALERT_DIAGNOSTIC='Saved Fib channel extend settings are unreadable, so the alert cannot follow the drawn lines.';
const MEMBER='lvFibChannel',MEMBER_KEYS=['schemaVersion','background','opacity','extendLeft','extendRight','showLevels'];
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
export interface FibChannelAlertSettings {
 /** The enabled level ratios in level order (finite only; a non-finite ratio paints nothing usable). */
 readonly enabledRatios:readonly number[];
 readonly extendLeft:boolean;readonly extendRight:boolean;
}
function readLevels(props:Record<string,unknown>):number[]{
 const saved=Array.isArray(props.levels)?props.levels.filter(level=>!!level&&typeof level==='object'&&typeof (level as {ratio?:unknown}).ratio==='number'&&typeof (level as {color?:unknown}).color==='string') as Array<{ratio:number;enabled?:unknown}>:[];
 const levels=saved.length?saved.map(level=>({ratio:level.ratio,enabled:level.enabled!==false})):FIB_CHANNEL_DEFAULT_RATIOS.map(ratio=>({ratio,enabled:true}));
 return levels.filter(level=>level.enabled&&Number.isFinite(level.ratio)).map(level=>level.ratio);
}
function readExtend(props:Record<string,unknown>):{left:boolean;right:boolean}{
 const descriptor=Object.getOwnPropertyDescriptor(props,MEMBER);
 if(!descriptor)return{left:false,right:false};
 const value=descriptor.value;
 if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value')||!plain(value)||Reflect.ownKeys(value).length!==MEMBER_KEYS.length)throw new Error(FIB_CHANNEL_ALERT_DIAGNOSTIC);
 const read:Record<string,unknown>={};
 for(const key of MEMBER_KEYS){const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!field.enumerable||!Object.hasOwn(field,'value'))throw new Error(FIB_CHANNEL_ALERT_DIAGNOSTIC);read[key]=field.value;}
 const opacity=read.opacity as number;
 if(read.schemaVersion!==1||!Number.isInteger(opacity)||opacity<0||opacity>100||['background','extendLeft','extendRight','showLevels'].some(key=>typeof read[key]!=='boolean'))throw new Error(FIB_CHANNEL_ALERT_DIAGNOSTIC);
 return{left:read.extendLeft===true,right:read.extendRight===true};
}
/** The levels and extension a Fib channel alert uses. Throws when the extension member is unreadable. */
export function readFibChannelAlert(props:unknown):FibChannelAlertSettings{
 const bag=plain(props)?props:{};
 const extend=readExtend(bag);
 return Object.freeze({enabledRatios:Object.freeze(readLevels(bag)),extendLeft:extend.left,extendRight:extend.right});
}
