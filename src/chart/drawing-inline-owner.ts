import type {SerializedDrawing} from '@luxalgo/vela';
import type {LosslessDrawingDocument} from './contracts';
import {assertNativeDrawingMatchesCanonical} from './drawing-canonical';

interface Slot{owner:object;key:string;descriptor:PropertyDescriptor}
function slot(owner:unknown,key:string,inherited=false):Slot{
 if(!owner||typeof owner!=='object')throw Error('Inline drawing owner unavailable');
 for(let value:object|null=owner;value;value=inherited?Object.getPrototypeOf(value):null){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(descriptor){if(!Object.hasOwn(descriptor,'value'))throw Error('Inline drawing requires data fields: '+key);return{owner:value,key,descriptor};}}
 throw Error('Inline drawing field unavailable: '+key);
}
function unchanged(value:Slot){const next=Object.getOwnPropertyDescriptor(value.owner,value.key),before=value.descriptor;if(!next||next.value!==before.value||next.get!==before.get||next.set!==before.set||next.writable!==before.writable||next.enumerable!==before.enumerable||next.configurable!==before.configurable)throw Error('Inline drawing owner changed: '+value.key);}

/**
 * Trusted adapter bridge for the installed native drawing controller. Geometry separately
 * pins the projected native row graph. Public edit/load/Undo/Redo either replace that graph
 * or advance the canonical epoch. Direct reflective core mutations without sync/edited
 * are outside this boundary. This function does not expose the writable native store.
 */
/** `rendererRowToSource` maps the projected renderer row (synthetic time on a derived chart) to source time
 * before it is compared with the canonical record; omitted, or returning the same row, means no mapping. */
export function captureInlineDrawingOwner(document:LosslessDrawingDocument,facade:object,id:string,projected:Readonly<SerializedDrawing>,assertSource:()=>void,rendererRowToSource?:(row:Readonly<SerializedDrawing>)=>Readonly<SerializedDrawing>):()=>void{
 if(typeof id!=='string'||!id||projected.id!==id)throw Error('Inline drawing ID mismatch');
 assertSource();const canonical=document.captureReadOnlyOwner(),ctrlSlot=slot(facade,'ctrl'),controller=ctrlSlot.descriptor.value,storeSlot=slot(controller,'store'),store=storeSlot.descriptor.value,mapSlot=slot(store,'byId'),map=mapSlot.descriptor.value,getSlot=slot(store,'get',true);
 if(!(map instanceof Map)||Object.getPrototypeOf(map)!==Map.prototype||Object.hasOwn(map,'get')||typeof getSlot.descriptor.value!=='function')throw Error('Inline drawing requires the exact native identity map');
 const model=Map.prototype.get.call(map,id);if(!model||typeof model!=='object')throw Error('Inline native drawing was removed');
 const slots=[ctrlSlot,storeSlot,mapSlot,getSlot,slot(model,'id'),slot(model,'type'),slot(model,'paneId'),slot(model,'serialize',true)],prototypes=[facade,controller,store,model].map(owner=>({owner,prototype:Object.getPrototypeOf(owner)}));
 const serialize=slots.at(-1)!.descriptor.value;if(typeof serialize!=='function')throw Error('Inline drawing serializer unavailable');let retired=false;
 const pure=()=>{canonical.assertCurrent();if(retired)throw Error('Inline drawing owner retired');for(const value of slots)unchanged(value);for(const value of prototypes)if(Object.getPrototypeOf(value.owner)!==value.prototype)throw Error('Inline drawing prototype changed');if(Object.getPrototypeOf(map)!==Map.prototype||Object.hasOwn(map,'get')||Map.prototype.get.call(map,id)!==model)throw Error('Inline native drawing identity changed');if(slot(store,'get',true).owner!==getSlot.owner||slot(model,'serialize',true).owner!==slots.at(-1)!.owner)throw Error('Inline native drawing method ownership changed');};
 const assertCurrent=()=>{try{pure();assertSource();pure();}catch(error){retired=true;throw error;}};
 assertCurrent();const record=document.all().find(value=>value.id===id);assertCurrent();if(!record)throw Error('Inline canonical drawing was removed');
 const native=Reflect.apply(serialize,model,[]) as SerializedDrawing;assertCurrent();assertNativeDrawingMatchesCanonical(record as unknown as SerializedDrawing,native);assertCurrent();let sourceProjected=projected;if(rendererRowToSource){sourceProjected=rendererRowToSource(projected);if(sourceProjected!==projected){if(!sourceProjected||sourceProjected.id!==id||sourceProjected.type!==projected.type)throw Error('Inline drawing time map changed row identity');assertCurrent();}}assertNativeDrawingMatchesCanonical(record as unknown as SerializedDrawing,sourceProjected as SerializedDrawing);assertCurrent();
 return Object.freeze(assertCurrent);
}
