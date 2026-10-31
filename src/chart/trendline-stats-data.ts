import type {SerializedDrawing} from '@luxalgo/vela';
import {measureWorkspaceJSON} from '../ui/workspace-json';

/** Trendline Stats position Left/Center/Right/Auto, default Right. above/below are the earlier
 * OpenCandle positions: saved records keep them valid and they paint as before; the editor offers only those four. */
export type TrendlineStatsPosition='above'|'below'|'left'|'center'|'right'|'auto';
export const TRENDLINE_STATS_POSITIONS:readonly TrendlineStatsPosition[]=Object.freeze(['above','below','left','center','right','auto']);
export interface TrendlineStatsSettings {
 schemaVersion:1;
 priceRange:boolean;
 percentChange:boolean;
 barsRange:boolean;
 dateTimeRange:boolean;
 alwaysShow:boolean;
 position:TrendlineStatsPosition;
}
export const TRENDLINE_STATS_DEFAULTS:Readonly<TrendlineStatsSettings>=Object.freeze({schemaVersion:1,priceRange:false,percentChange:false,barsRange:false,dateTimeRange:false,alwaysShow:false,position:'right'});
const fields=['schemaVersion','priceRange','percentChange','barsRange','dateTimeRange','alwaysShow','position'] as const;
const message='Unknown or invalid props.lvTrendlineStats is retained without interpretation.';
export type TrendlineStatsState=
 | {state:'legacy';settings:Readonly<TrendlineStatsSettings>}
 | {state:'supported';settings:Readonly<TrendlineStatsSettings>;member:object}
 | {state:'unavailable';message:string};

function plain(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
/** Strict known member only; absence is handled by readTrendlineStats, never by default coercion. */
export function validateTrendlineStatsSettings(value:unknown):Readonly<TrendlineStatsSettings>{
 if(!plain(value))throw Error(message);
 const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!(fields as readonly string[]).includes(key)))throw Error(message);
 const copied:Record<string,unknown>={};
 for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))throw Error(message);copied[key]=descriptor.value;}
 if(copied.schemaVersion!==1||!(TRENDLINE_STATS_POSITIONS as readonly string[]).includes(copied.position as string)||typeof copied.position!=='string')throw Error(message);
 for(const key of ['priceRange','percentChange','barsRange','dateTimeRange','alwaysShow'] as const)if(typeof copied[key]!=='boolean')throw Error(message);
 return Object.freeze(copied) as unknown as Readonly<TrendlineStatsSettings>;
}

/** A plain persisted member grants no native model, source or renderer authority. */
export function readTrendlineStats(props:unknown):TrendlineStatsState{
 if(props===undefined)return{state:'legacy',settings:TRENDLINE_STATS_DEFAULTS};
 if(!plain(props))return{state:'unavailable',message};
 const descriptor=Object.getOwnPropertyDescriptor(props,'lvTrendlineStats');
 if(!descriptor)return{state:'legacy',settings:TRENDLINE_STATS_DEFAULTS};
 if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))return{state:'unavailable',message};
 try{return{state:'supported',settings:validateTrendlineStatsSettings(descriptor.value),member:descriptor.value};}
 catch{return{state:'unavailable',message};}
}

/** Pure detached whole-member patch; semantic no-op preserves exact legacy omission and identity. */
export function patchTrendlineStats(record:SerializedDrawing,next:unknown):SerializedDrawing{
 const metrics=measureWorkspaceJSON({record});
 if(metrics.bytes>1024*1024||metrics.nodes>50000||metrics.depth>32)throw Error('Trendline statistics record exceeds its local data bound.');
 if(record.type!=='trendline')throw Error('Statistics are available only for Trendline.');
 const current=readTrendlineStats(record.props);if(current.state==='unavailable')throw Error(current.message);
 const settings=validateTrendlineStatsSettings(next);
 if(fields.every(key=>current.settings[key]===settings[key]))return record;
 const result=structuredClone(record);
 result.props={...(result.props??{}),lvTrendlineStats:{...settings}};
 return result;
}

export const TRENDLINE_MARKERS_FIELD='lvTrendlineMarkers';
const markersMessage='Saved trendline marker settings are unreadable and kept as is.';
/** Middle point, price labels, and the two new statistics rows distance and angle. Defaults are false
 * (showMiddlePoint, showPriceLabels, showDistance, showAngle). Distance and angle live here, not in lvTrendlineStats, because that member's closed
 * seven-key shape is pinned by saved documents and by existing tests; this member is new, so it can carry them from the start. */
/** pips: optional and additive, so saved five-key members read unchanged. */
export interface TrendlineMarkersSettings {schemaVersion:1;middlePoint:boolean;priceLabels:boolean;distance:boolean;angle:boolean;pips?:boolean}
export const TRENDLINE_MARKERS_DEFAULTS:Readonly<TrendlineMarkersSettings>=Object.freeze({schemaVersion:1,middlePoint:false,priceLabels:false,distance:false,angle:false});
const markerFields=['schemaVersion','middlePoint','priceLabels','distance','angle'] as const;
export type TrendlineMarkersState=
 | {state:'legacy';settings:Readonly<TrendlineMarkersSettings>}
 | {state:'supported';settings:Readonly<TrendlineMarkersSettings>}
 | {state:'unavailable';message:string};
export function validateTrendlineMarkers(value:unknown):Readonly<TrendlineMarkersSettings>{
 if(!plain(value))throw Error(markersMessage);
 const keys=Reflect.ownKeys(value),pips=Object.hasOwn(value,'pips');if(keys.length!==markerFields.length+(pips?1:0)||keys.some(key=>typeof key!=='string'||key!=='pips'&&!(markerFields as readonly string[]).includes(key)))throw Error(markersMessage);
 const copied:Record<string,unknown>={};
 for(const key of markerFields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))throw Error(markersMessage);copied[key]=descriptor.value;}
 if(pips){const descriptor=Object.getOwnPropertyDescriptor(value,'pips');if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='boolean')throw Error(markersMessage);copied.pips=descriptor.value;}
 if(copied.schemaVersion!==1||markerFields.slice(1).some(key=>typeof copied[key]!=='boolean'))throw Error(markersMessage);
 return Object.freeze(copied) as unknown as Readonly<TrendlineMarkersSettings>;
}
/** Absent means the behaviour before this wave: no markers. */
export function readTrendlineMarkers(props:unknown):TrendlineMarkersState{
 if(props===undefined)return{state:'legacy',settings:TRENDLINE_MARKERS_DEFAULTS};
 if(!plain(props))return{state:'unavailable',message:markersMessage};
 const descriptor=Object.getOwnPropertyDescriptor(props,TRENDLINE_MARKERS_FIELD);
 if(!descriptor)return{state:'legacy',settings:TRENDLINE_MARKERS_DEFAULTS};
 if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))return{state:'unavailable',message:markersMessage};
 try{return{state:'supported',settings:validateTrendlineMarkers(descriptor.value)};}
 catch{return{state:'unavailable',message:markersMessage};}
}
/** Pure detached whole-member patch; a semantic no-op returns the exact record. */
export function patchTrendlineMarkers(record:SerializedDrawing,next:unknown):SerializedDrawing{
 const metrics=measureWorkspaceJSON({record});
 if(metrics.bytes>1024*1024||metrics.nodes>50000||metrics.depth>32)throw Error('Trendline marker record exceeds its local data bound.');
 if(record.type!=='trendline')throw Error('Markers are available only for Trendline.');
 const current=readTrendlineMarkers(record.props);if(current.state==='unavailable')throw Error(current.message);
 const settings=validateTrendlineMarkers(next);
 if(markerFields.every(key=>current.settings[key]===settings[key])&&(current.settings.pips===true)===(settings.pips===true))return record;
 const result=structuredClone(record);
 result.props={...(result.props??{}),[TRENDLINE_MARKERS_FIELD]:{...settings}};
 return result;
}
