// The Vertical line Extend / Time label and Cross line Price label / Time label checkboxes
// (all on by default).
// Horizontal line Price label (on by default).
// Pure data (no renderer import) so the DWB3 layer and the axis-label code can read it; the model side lives in axis-lines.ts.
// ONE OpenCandle member props.lvAxisLine {schemaVersion:1, <the type's two keys>}:
//   absent  -> legacy: every flag on (the behaviour before the member existed, and the reference factory default).
//   valid   -> supported: an explicit false turns that part off.
//   invalid -> unavailable: retained verbatim, read as legacy (all on), not editable.
import type {SettingsField} from '@luxalgo/vela';

export const AXIS_LINE_FIELD='lvAxisLine';
export const AXIS_LINE_PREFIX=AXIS_LINE_FIELD+'.';
export const AXIS_LINE_DIAGNOSTIC='Unsupported axis line settings are retained without interpretation.';
export type AxisLineKey='extend'|'priceLabel'|'timeLabel';
export type AxisLineType='hline'|'vline'|'crossline';
export const AXIS_LINE_KEYS:Readonly<Record<AxisLineType,readonly AxisLineKey[]>>=Object.freeze({hline:Object.freeze(['priceLabel'] as AxisLineKey[]),vline:Object.freeze(['extend','timeLabel'] as AxisLineKey[]),crossline:Object.freeze(['priceLabel','timeLabel'] as AxisLineKey[])});
export type AxisLineSettings={readonly schemaVersion:1}&Readonly<Partial<Record<AxisLineKey,boolean>>>;
export type AxisLineState={readonly state:'legacy'|'supported';readonly settings:AxisLineSettings}|{readonly state:'unavailable';readonly message:string};
const LABELS:Readonly<Record<AxisLineKey,string>>={extend:'Extend',priceLabel:'Price label',timeLabel:'Time label'};
const isType=(type:unknown):type is AxisLineType=>type==='hline'||type==='vline'||type==='crossline';

export function axisLineDefaults(type:AxisLineType):AxisLineSettings{return Object.freeze({schemaVersion:1,...Object.fromEntries(AXIS_LINE_KEYS[type].map(key=>[key,true]))}) as AxisLineSettings;}
export function validateAxisLine(type:AxisLineType,value:unknown):AxisLineSettings{
 const keys=['schemaVersion',...AXIS_LINE_KEYS[type]];
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length)throw Error(AXIS_LINE_DIAGNOSTIC);
 const out:Record<string,unknown>={};
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!d.enumerable||!Object.hasOwn(d,'value'))throw Error(AXIS_LINE_DIAGNOSTIC);out[key]=d.value;}
 if(out.schemaVersion!==1||AXIS_LINE_KEYS[type].some(key=>typeof out[key]!=='boolean'))throw Error(AXIS_LINE_DIAGNOSTIC);
 return Object.freeze(out) as AxisLineSettings;
}
export function readAxisLine(type:AxisLineType,props:unknown):AxisLineState{
 if(!props||typeof props!=='object')return{state:'legacy',settings:axisLineDefaults(type)};
 const d=Object.getOwnPropertyDescriptor(props,AXIS_LINE_FIELD);if(!d)return{state:'legacy',settings:axisLineDefaults(type)};
 if(!d.enumerable||!Object.hasOwn(d,'value'))return{state:'unavailable',message:AXIS_LINE_DIAGNOSTIC};
 try{return{state:'supported',settings:validateAxisLine(type,d.value)};}catch{return{state:'unavailable',message:AXIS_LINE_DIAGNOSTIC};}
}
/** Whether a part is on for a saved row: only a supported member with an explicit false turns it off. Other types: on. */
export function axisLineFlag(type:unknown,props:unknown,key:AxisLineKey):boolean{
 if(!isType(type)||!AXIS_LINE_KEYS[type].includes(key))return true;
 const read=readAxisLine(type,props);
 return read.state!=='supported'||read.settings[key]!==false;
}
export function axisLineFields(type:AxisLineType):readonly SettingsField[]{
 return Object.freeze(AXIS_LINE_KEYS[type].map(key=>Object.freeze({path:AXIS_LINE_PREFIX+key,label:LABELS[key],kind:'boolean' as const,group:'line' as const})));
}
