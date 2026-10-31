import type {SerializedDrawing} from '@luxalgo/vela';
import {measureWorkspaceJSON} from '../ui/workspace-json';
export const TRENDLINE_ANNOTATION_PATH='text.lvAnnotation.enabled';
export interface LVAnnotationV1{schemaVersion:1;enabled:boolean}
export interface TrendlineAnnotationState{state:'legacy'|'supported'|'unavailable';enabled:boolean;member?:object;message?:string}
/** Reads data descriptors only. Unknown plain versions stay opaque; imported identity grants no painter claim. */
export function readTrendlineAnnotation(text:unknown):TrendlineAnnotationState{
 if(text===undefined)return{state:'legacy',enabled:true};
 const unavailable=()=>({state:'unavailable' as const,enabled:true,message:'Unknown or invalid text.lvAnnotation retained without interpretation.'});
 if(!text||typeof text!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(text)))return unavailable();
 const field=Object.getOwnPropertyDescriptor(text,'lvAnnotation');if(!field||Object.hasOwn(field,'value')&&field.value===undefined)return{state:'legacy',enabled:true};
 if(!field.enumerable||!Object.hasOwn(field,'value'))return unavailable();const member=field.value;
 if(!member||typeof member!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(member)))return unavailable();
 const keys=Reflect.ownKeys(member);if(keys.length!==2||!keys.includes('schemaVersion')||!keys.includes('enabled'))return unavailable();
 const version=Object.getOwnPropertyDescriptor(member,'schemaVersion')!,enabled=Object.getOwnPropertyDescriptor(member,'enabled')!;
 if(!version.enumerable||!enabled.enumerable||!Object.hasOwn(version,'value')||!Object.hasOwn(enabled,'value')||version.value!==1||typeof enabled.value!=='boolean')return unavailable();
 return{state:'supported',enabled:enabled.value,member};
}
/** Pure whole-member replacement avoids native core/renderer/default/draft shallow-copy aliases. */
export function patchTrendlineAnnotation(record:SerializedDrawing,enabled:unknown):SerializedDrawing{
 measureWorkspaceJSON({record});if(record.type!=='trendline')throw Error('Text enabled is available only for Trendline');if(typeof enabled!=='boolean')throw Error('Text enabled must be a boolean');
 const current=readTrendlineAnnotation(record.text);if(current.state==='unavailable')throw Error(current.message);if(current.enabled===enabled)return record;
 const next=structuredClone(record),text=next.text?structuredClone(next.text):{value:''};
 // The actual native model admits omitted formatting fields; avoid inventing persisted defaults.
 const replacement={...text,lvAnnotation:{schemaVersion:1 as const,enabled}};next.text=replacement as NonNullable<SerializedDrawing['text']>;return next;
}
