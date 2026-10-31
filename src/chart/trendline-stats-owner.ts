import type {SerializedDrawing} from '@luxalgo/vela';
import type {OwnedDrawingEditAcceptance} from './contracts';
import {assertNativeDrawingMatchesCanonical} from './drawing-canonical';

interface Slot {
 readonly key:string;
 readonly descriptor:PropertyDescriptor;
 readonly path:readonly {owner:object;prototype:object|null}[];
}

const mapPrototype=Map.prototype;
const mapGet=Map.prototype.get;
const localOwners=new WeakMap<Function,{canonicalOwner:OwnedDrawingEditAcceptance;source:()=>void;local:()=>void}>();

/** Internal component of a genuinely minted binding; never accepts public-shaped status. */
export function resolveTrendlineStatisticsNativeOwner(full:()=>void,canonicalOwner:OwnedDrawingEditAcceptance,source:()=>void):()=>void{
 const proof=localOwners.get(full);if(!proof||proof.canonicalOwner!==canonicalOwner||proof.source!==source)throw Error('Statistics native local proof has another owner.');
 proof.local();return proof.local;
}

/** Resolve a native data field without invoking an accessor or a delegated get(). */
function slot(root:unknown,key:string,inherited=false):Slot {
 if(!root||typeof root!=='object')throw Error('Statistics drawing owner unavailable: '+key);
 const path:{owner:object;prototype:object|null}[]=[];
 for(let owner:object|null=root;owner;owner=inherited?Object.getPrototypeOf(owner):null){
  if(path.length===32)throw Error('Statistics native prototype chain is unsupported.');
  const prototype=Object.getPrototypeOf(owner),descriptor=Object.getOwnPropertyDescriptor(owner,key);
  path.push({owner,prototype});
  if(descriptor){
   if(!Object.hasOwn(descriptor,'value'))throw Error('Statistics drawing requires a data field: '+key);
   return{key,descriptor,path};
  }
 }
 throw Error('Statistics drawing field unavailable: '+key);
}

function unchanged(field:Slot):void {
 for(let index=0;index<field.path.length;index++){
  const {owner,prototype}=field.path[index];
  if(Object.getPrototypeOf(owner)!==prototype)throw Error('Statistics drawing prototype changed: '+field.key);
  const next=Object.getOwnPropertyDescriptor(owner,field.key);
  if(index<field.path.length-1){
   if(next)throw Error('Statistics drawing method ownership changed: '+field.key);
  }else{
   const before=field.descriptor;
   if(!next||!Object.is(next.value,before.value)||next.get!==before.get||next.set!==before.set||next.writable!==before.writable||next.enumerable!==before.enumerable||next.configurable!==before.configurable)throw Error('Statistics drawing owner changed: '+field.key);
  }
 }
}

/**
 * Trusted internal adapter boundary, not authentication of public-shaped arguments.
 * The private canonical index supplies its exact detached row and genuine document
 * receipt. This helper never reads/clones the document or exposes the native store.
 * The annotation installation separately owns the exact renderer/anchor tuple.
 * Supported native mutators replace these identities or retire the canonical epoch;
 * unsignalled reflective native edits are outside that supported boundary.
 */
export function captureTrendlineStatisticsNativeOwner(
 facade:object,
 canonical:Readonly<SerializedDrawing>,
 projected:Readonly<SerializedDrawing>,
 canonicalOwner:OwnedDrawingEditAcceptance,
 assertSource:()=>void,
):()=>void {
 if(typeof assertSource!=='function')throw Error('Statistics source assertion unavailable.');
 const canonicalId=slot(canonical,'id'),canonicalType=slot(canonical,'type'),projectedId=slot(projected,'id'),projectedType=slot(projected,'type');
 const id=canonicalId.descriptor.value;
 if(typeof id!=='string'||!id||canonicalType.descriptor.value!=='trendline'||projectedId.descriptor.value!==id||projectedType.descriptor.value!=='trendline')throw Error('Statistics drawing identity requires the exact Trendline.');
 const receiptSlot=slot(canonicalOwner,'assertCurrent'),receiptMethod=receiptSlot.descriptor.value;
 if(typeof receiptMethod!=='function')throw Error('Statistics canonical receipt unavailable.');
 const ctrlSlot=slot(facade,'ctrl'),controller=ctrlSlot.descriptor.value,storeSlot=slot(controller,'store'),store=storeSlot.descriptor.value;
 const mapSlot=slot(store,'byId'),map=mapSlot.descriptor.value,getSlot=slot(store,'get',true),mapGetSlot=slot(mapPrototype,'get');
 if(!map||typeof map!=='object'||Object.getPrototypeOf(map)!==mapPrototype||Object.hasOwn(map,'get')||mapGetSlot.descriptor.value!==mapGet||typeof getSlot.descriptor.value!=='function')throw Error('Statistics drawing requires the exact native identity map.');
 const model=Reflect.apply(mapGet,map,[id]);
 if(!model||typeof model!=='object')throw Error('Statistics native drawing was removed.');
 const modelId=slot(model,'id'),modelType=slot(model,'type'),paneSlot=slot(model,'paneId'),serializeSlot=slot(model,'serialize',true),serialize=serializeSlot.descriptor.value;
 if(modelId.descriptor.value!==id||modelType.descriptor.value!=='trendline'||typeof serialize!=='function')throw Error('Statistics native drawing identity or serializer changed.');
 const fields=[canonicalId,canonicalType,projectedId,projectedType,receiptSlot,ctrlSlot,storeSlot,mapSlot,getSlot,mapGetSlot,modelId,modelType,paneSlot,serializeSlot];
 let retired=false,checking=false;
 const structural=()=>{
  if(retired)throw Error('Statistics drawing owner retired.');
  for(const field of fields)unchanged(field);
  if(Object.getPrototypeOf(map)!==mapPrototype||Object.hasOwn(map,'get')||Reflect.apply(mapGet,map,[id])!==model)throw Error('Statistics native drawing identity changed.');
 };
 const receipt=()=>{structural();Reflect.apply(receiptMethod,canonicalOwner,[]);structural();};
 const assertCurrent=()=>{
  if(retired)throw Error('Statistics drawing owner retired.');
  if(checking){retired=true;throw Error('Statistics drawing ownership assertion reentered.');}
  checking=true;
  try{receipt();assertSource();receipt();}
  catch(error){retired=true;throw error;}
  finally{checking=false;}
 };
 assertCurrent();
 // Reject malformed/mismatched detached projections before calling native code.
 assertNativeDrawingMatchesCanonical(canonical as SerializedDrawing,projected as SerializedDrawing);assertCurrent();
 const native=Reflect.apply(serialize,model,[]) as SerializedDrawing;assertCurrent();
 assertNativeDrawingMatchesCanonical(canonical as SerializedDrawing,native);assertCurrent();
 const local=()=>{if(checking){retired=true;throw Error('Statistics drawing ownership assertion reentered.');}checking=true;try{structural();}catch(error){retired=true;throw error;}finally{checking=false;}};
 localOwners.set(assertCurrent,{canonicalOwner,source:assertSource,local});
 return Object.freeze(assertCurrent);
}
