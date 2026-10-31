// Parallel channel levels, extends and background (props.lvChannel).
//
// Every default and range in this module is a design decision.
//
// Saved drawings are never changed: an absent member reads as the legacy settings (no levels, no extension, the native fill as it is).
// The LV defaults are written only by seedNewChannel, which the creation path calls for a channel created after the update.
import type {SerializedDrawing} from '@luxalgo/vela';
import {measureWorkspaceJSON} from '../ui/workspace-json';
import {supportedColor} from './color-validation';
import {parseColorValue,colorRGBHex} from '../ui/color-value';

export const CHANNEL_LEVELS_FIELD='lvChannel';
export const CHANNEL_LEVELS_DIAGNOSTIC='Saved channel level settings are unreadable and kept as is.';
export const CHANNEL_LEVEL_ROWS=4;
export const CHANNEL_LEVEL_RATIO_MIN=-10;
export const CHANNEL_LEVEL_RATIO_MAX=10;
export type ChannelLineStyle='solid'|'dashed'|'dotted';
export interface ChannelLevel {readonly enabled:boolean;readonly ratio:number;readonly color:string;readonly opacity:number;readonly width:number;readonly style:ChannelLineStyle}
export interface ChannelBackground {readonly enabled:boolean;readonly color:string;readonly opacity:number}
export interface ChannelLevelsSettings {readonly schemaVersion:1;readonly levels:readonly ChannelLevel[];readonly extendLeft:boolean;readonly extendRight:boolean;readonly background:ChannelBackground}

const level=(enabled:boolean,ratio:number):ChannelLevel=>Object.freeze({enabled,ratio,color:'#2962FF',opacity:100,width:1,style:'dashed' as const});
/** One midline at ratio 0.5 on, three spare rows off, extend off, background on at the native fill color (#2962FF at alpha 0x1a, 10 percent; the drawing blue since 0.8.1, drawing-fixes/contrast-defaults.ts). */
export const CHANNEL_LEVELS_FACTORY_DEFAULTS:Readonly<ChannelLevelsSettings>=Object.freeze({
 schemaVersion:1,
 levels:Object.freeze([level(true,0.5),level(false,0.25),level(false,0.75),level(false,1.25)]),
 extendLeft:false,extendRight:false,
 background:Object.freeze({enabled:true,color:'#2962ff',opacity:10}),
});
/** What a channel saved before this wave means: no levels, no extension. The background here mirrors the factory color only for the editor; the native fill stays the authority until a member exists. */
export const CHANNEL_LEVELS_LEGACY:Readonly<ChannelLevelsSettings>=Object.freeze({
 schemaVersion:1,
 levels:Object.freeze(CHANNEL_LEVELS_FACTORY_DEFAULTS.levels.map(row=>Object.freeze({...row,enabled:false}))),
 extendLeft:false,extendRight:false,
 background:CHANNEL_LEVELS_FACTORY_DEFAULTS.background,
});

export type ChannelLevelsState=
 | {state:'legacy';settings:Readonly<ChannelLevelsSettings>}
 | {state:'supported';settings:Readonly<ChannelLevelsSettings>}
 | {state:'unavailable';message:string};

function plain(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
function closed(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!plain(value))throw Error(CHANNEL_LEVELS_DIAGNOSTIC);
 const own=Reflect.ownKeys(value);if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key)))throw Error(CHANNEL_LEVELS_DIAGNOSTIC);
 const out:Record<string,unknown>={};
 for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))throw Error(CHANNEL_LEVELS_DIAGNOSTIC);out[key]=descriptor.value;}
 return out;
}
const percent=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
function validateLevel(value:unknown):ChannelLevel{
 const row=closed(value,['enabled','ratio','color','opacity','width','style']);
 if(typeof row.enabled!=='boolean'||typeof row.ratio!=='number'||!Number.isFinite(row.ratio)||row.ratio<CHANNEL_LEVEL_RATIO_MIN||row.ratio>CHANNEL_LEVEL_RATIO_MAX||!supportedColor(row.color)||!percent(row.opacity)||!Number.isInteger(row.width)||(row.width as number)<1||(row.width as number)>10||!['solid','dashed','dotted'].includes(row.style as string))throw Error(CHANNEL_LEVELS_DIAGNOSTIC);
 return Object.freeze({...row}) as unknown as ChannelLevel;
}
export function validateChannelLevels(value:unknown):Readonly<ChannelLevelsSettings>{
 const data=closed(value,['schemaVersion','levels','extendLeft','extendRight','background']);
 if(data.schemaVersion!==1||typeof data.extendLeft!=='boolean'||typeof data.extendRight!=='boolean'||!Array.isArray(data.levels)||data.levels.length!==CHANNEL_LEVEL_ROWS)throw Error(CHANNEL_LEVELS_DIAGNOSTIC);
 const rows=Object.freeze(Array.from({length:CHANNEL_LEVEL_ROWS},(_,index)=>{const d=Object.getOwnPropertyDescriptor(data.levels,String(index));if(!d||!Object.hasOwn(d,'value'))throw Error(CHANNEL_LEVELS_DIAGNOSTIC);return validateLevel(d.value);}));
 const bg=closed(data.background,['enabled','color','opacity']);
 if(typeof bg.enabled!=='boolean'||!supportedColor(bg.color)||!percent(bg.opacity))throw Error(CHANNEL_LEVELS_DIAGNOSTIC);
 return Object.freeze({schemaVersion:1,levels:rows,extendLeft:data.extendLeft,extendRight:data.extendRight,background:Object.freeze({...bg}) as unknown as ChannelBackground});
}
export function readChannelLevels(props:unknown):ChannelLevelsState{
 if(props===undefined)return{state:'legacy',settings:CHANNEL_LEVELS_LEGACY};
 if(!plain(props))return{state:'unavailable',message:CHANNEL_LEVELS_DIAGNOSTIC};
 const descriptor=Object.getOwnPropertyDescriptor(props,CHANNEL_LEVELS_FIELD);
 if(!descriptor)return{state:'legacy',settings:CHANNEL_LEVELS_LEGACY};
 if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))return{state:'unavailable',message:CHANNEL_LEVELS_DIAGNOSTIC};
 try{return{state:'supported',settings:validateChannelLevels(descriptor.value)};}
 catch{return{state:'unavailable',message:CHANNEL_LEVELS_DIAGNOSTIC};}
}

// Background <-> native fill. The member is the authority once a background field is edited; the native style.fillColor is then its derived output.
// Any supported color form is read (rgba(), rgb(), hsl(), #rgb, #rrggbb, #rrggbbaa, named). The fill is rewritten ONLY when a background field changed:
// seeding, level edits and extend edits never touch it, whatever its format.
export function composeChannelFill(background:Readonly<ChannelBackground>):string{
 const base=parseColorValue(background.color);
 if(!base)throw Error(CHANNEL_LEVELS_DIAGNOSTIC);
 const alpha=background.enabled?Math.round(background.opacity/100*255):0;
 return colorRGBHex(base).toLowerCase()+alpha.toString(16).padStart(2,'0');
}
/** Reads any supported fill into the editor's enabled, base color and opacity percent. Undefined when the fill is not a supported color. */
export function deriveChannelBackground(fill:unknown):Readonly<ChannelBackground>|undefined{
 const parsed=parseColorValue(fill);
 if(!parsed)return;
 return Object.freeze({enabled:parsed.alpha>0,color:colorRGBHex(parsed),opacity:Math.round(parsed.alpha*100)});
}

function withMember(record:SerializedDrawing,settings:Readonly<ChannelLevelsSettings>):SerializedDrawing{
 const result=structuredClone(record);
 result.props={...(result.props??{}),[CHANNEL_LEVELS_FIELD]:structuredClone(settings)};
 return result;
}
const sameSettings=(a:Readonly<ChannelLevelsSettings>,b:Readonly<ChannelLevelsSettings>)=>JSON.stringify(a)===JSON.stringify(b);
/** Whole-member patch. A semantic no-op returns the exact record, so a saved channel is never touched by an unchanged dialog. */
export function patchChannelLevels(record:SerializedDrawing,next:unknown):SerializedDrawing{
 const metrics=measureWorkspaceJSON({record});
 if(metrics.bytes>1024*1024||metrics.nodes>50000||metrics.depth>32)throw Error('Channel record exceeds its local data bound.');
 if(record.type!=='parallelchannel')throw Error('Channel levels are available only for Parallel channel.');
 const current=readChannelLevels(record.props);if(current.state==='unavailable')throw Error(current.message);
 const settings=validateChannelLevels(next);
 if(sameSettings(current.settings,settings))return record;
 return withMember(record,settings);
}
/** A channel created after the update gets the LV defaults. A record that already has the member (or any unreadable one) is returned as is. */
export function seedNewChannel(record:SerializedDrawing):SerializedDrawing{
 if(record.type!=='parallelchannel')return record;
 const current=readChannelLevels(record.props);if(current.state!=='legacy')return record;
 return withMember(record,CHANNEL_LEVELS_FACTORY_DEFAULTS);
}
