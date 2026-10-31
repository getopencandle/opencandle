// Rectangle Extend (props.lvBoxExtend): the two switches of the Rectangle Style row "Extend".
// A checklist dropdown binds extendLeft and extendRight (options "Extend left" and "Extend right"); both default to false. The pinned renderer's box has no extend setting, so the member lives in canonical data only (the native model
// drops it) and the DWB3 shape layer paints the extension (box-extend-painter.ts). An absent member means no extension, so a
// rectangle saved before this setting existed paints exactly as before.
import type {SerializedDrawing} from '@luxalgo/vela';
import {measureWorkspaceJSON} from '../ui/workspace-json';

export const BOX_EXTEND_FIELD='lvBoxExtend';
export interface BoxExtendSettings {schemaVersion:1;left:boolean;right:boolean}
export const BOX_EXTEND_DEFAULTS:Readonly<BoxExtendSettings>=Object.freeze({schemaVersion:1,left:false,right:false});
const fields=['schemaVersion','left','right'] as const;
const message='Saved rectangle extend settings are unreadable and kept as is.';
export type BoxExtendState=
 | {state:'legacy';settings:Readonly<BoxExtendSettings>}
 | {state:'supported';settings:Readonly<BoxExtendSettings>}
 | {state:'unavailable';message:string};
function plain(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
/** Closed shape: exactly schemaVersion 1 and two booleans, own enumerable data properties only. */
export function validateBoxExtend(value:unknown):Readonly<BoxExtendSettings>{
 if(!plain(value))throw Error(message);
 const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!(fields as readonly string[]).includes(key)))throw Error(message);
 const copied:Record<string,unknown>={};
 for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))throw Error(message);copied[key]=descriptor.value;}
 if(copied.schemaVersion!==1||typeof copied.left!=='boolean'||typeof copied.right!=='boolean')throw Error(message);
 return Object.freeze(copied) as unknown as Readonly<BoxExtendSettings>;
}
/** Absent means no extension (legacy). An unreadable member is kept untouched and reported. */
export function readBoxExtend(props:unknown):BoxExtendState{
 if(props===undefined)return{state:'legacy',settings:BOX_EXTEND_DEFAULTS};
 if(!plain(props))return{state:'unavailable',message};
 const descriptor=Object.getOwnPropertyDescriptor(props,BOX_EXTEND_FIELD);
 if(!descriptor)return{state:'legacy',settings:BOX_EXTEND_DEFAULTS};
 if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))return{state:'unavailable',message};
 try{return{state:'supported',settings:validateBoxExtend(descriptor.value)};}
 catch{return{state:'unavailable',message};}
}
/** Pure detached whole-member patch; a semantic no-op returns the exact record. */
export function patchBoxExtend(record:SerializedDrawing,next:unknown):SerializedDrawing{
 const metrics=measureWorkspaceJSON({record});
 if(metrics.bytes>1024*1024||metrics.nodes>50000||metrics.depth>32)throw Error('Rectangle extend record exceeds its local data bound.');
 if(record.type!=='box')throw Error('Extend left and Extend right are available only for Rectangle.');
 const current=readBoxExtend(record.props);if(current.state==='unavailable')throw Error(current.message);
 const settings=validateBoxExtend(next);
 if(current.settings.left===settings.left&&current.settings.right===settings.right)return record;
 const result=structuredClone(record);
 result.props={...(result.props??{}),[BOX_EXTEND_FIELD]:{...settings}};
 return result;
}
