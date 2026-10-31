// Pin helpers for OpenCandle drawing types built on pinned native Vela classes (src/chart/lv-types/*.ts).
// A type's `define()` uses these to prove the installed native class still has the exact shape it was written
// against. Any mismatch throws PinError, and the registration loop in lv-drawing-types.ts then leaves the type
// unregistered with a reason (fail closed). Nothing here registers anything.
import {Drawing,getDrawingType,type DrawingTypeKey,type DrawingTypeMeta,type SerializedDrawing} from '@luxalgo/vela';

export type Init=Partial<SerializedDrawing>&{paneId:string};
export type Projector=Parameters<Drawing['onPlaced']>[0];

export class PinError extends Error{}
export const fail=(message:string):never=>{throw new PinError(message);};

export function dataFunction(owner:object,key:string):Function{
 const d=Object.getOwnPropertyDescriptor(owner,key);
 if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='function')fail('missing data function '+key);
 return d!.value as Function;
}
/** Walks the prototype chain (bounded) and returns the first own descriptor of `key`. */
export function inherited(prototype:object,key:string):PropertyDescriptor{
 let owner:object|null=prototype;
 for(let depth=0;owner&&depth<16;depth++){const d=Object.getOwnPropertyDescriptor(owner,key);if(d)return d;owner=Object.getPrototypeOf(owner);}
 return fail('missing inherited member '+key);
}
export const method=(prototype:object,key:string)=>{const d=inherited(prototype,key);if(!Object.hasOwn(d,'value')||typeof d.value!=='function')fail('member is not a method: '+key);};
export const roles=(model:Drawing)=>{const s=model.anchorSchema();return{min:s.min,max:s.max,roles:(s.slots??[]).map(slot=>slot.role).join('/')};};

export interface NativeBase{meta:DrawingTypeMeta;ctor:new(init:Init)=>Drawing;sample:Drawing;prototype:object}
/** The pinned native concrete class of `type`, obtained through its public registry entry. */
export function nativeBase(type:string):NativeBase{
 const meta=getDrawingType(type as DrawingTypeKey);
 if(!meta||meta.type!==type)fail('native type is not registered: '+type);
 const create=dataFunction(meta!,'create') as DrawingTypeMeta['create'];
 const sample=create({id:'lv-drawing-type-probe',paneId:'price',createdAt:0});
 if(!(sample instanceof Drawing)||sample.type!==type)fail('native factory returned an unexpected model for '+type);
 const prototype=Object.getPrototypeOf(sample) as object;
 const ctor=dataFunction(prototype,'constructor');
 if(ctor.prototype!==prototype)fail('native constructor is not the model prototype owner for '+type);
 return{meta:meta!,ctor:ctor as new(init:Init)=>Drawing,sample,prototype};
}
export function cloneStyle(meta:DrawingTypeMeta){return structuredClone(meta.defaultStyle);}

/** The pinned native concrete classes, described at the admitted boundary (geometry stays inherited). */
export interface NativeModel extends Drawing{
 readonly type:Drawing['type'];
 anchorSchema():ReturnType<Drawing['anchorSchema']>;
 hitTest(...args:Parameters<Drawing['hitTest']>):ReturnType<Drawing['hitTest']>;
 hitHandle(...args:Parameters<Drawing['hitHandle']>):ReturnType<Drawing['hitHandle']>;
 handlePoints(...args:Parameters<Drawing['handlePoints']>):ReturnType<Drawing['handlePoints']>;
 bounds(...args:Parameters<Drawing['bounds']>):ReturnType<Drawing['bounds']>;
 priceRange():ReturnType<Drawing['priceRange']>;
 schema():ReturnType<Drawing['schema']>;
}
/** Vela types its registry key as a closed union of its own ids; the runtime registry is keyed by any string. */
export const lvKey=(type:string)=>type as DrawingTypeKey;
