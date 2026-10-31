import {NativeRenderer,getNativeIndicator,type NativeIndicatorDescriptor,type IndicatorRenderHandle,type ScenePatch,type IndicatorModel} from '@luxalgo/vela';

function own(object:unknown,key:string):unknown{if(!object||typeof object!=='object')throw Error('Native full-model owner unavailable: '+key);const field=Object.getOwnPropertyDescriptor(object,key);if(!field||!Object.hasOwn(field,'value'))throw Error('Native full-model field must be data: '+key);return field.value;}
// Captured fixed intrinsics; method observation never walks a supplied chain.
const nativeMethodDescriptor=Object.getOwnPropertyDescriptor,nativeMethodPrototype=Object.getPrototypeOf,nativeMethodHasOwn=Object.hasOwn,nativeMethodApply=Reflect.apply;
function method(object:unknown,key:string):(...args:any[])=>any{
 if(!object||typeof object!=='object')throw Error('Native full-model method owner unavailable: '+key);
 const parent=nativeMethodPrototype(object),own=nativeMethodDescriptor(object,key),owner=own?object:parent;
 if(!owner)throw Error('Native full-model bounded method missing: '+key);
 const field=own??nativeMethodDescriptor(owner,key),ownerParent=nativeMethodPrototype(owner);
 if(!field||!nativeMethodHasOwn(field,'value')||typeof field.value!=='function')throw Error('Native full-model bounded data method unavailable: '+key);
 const value=field.value,writable=field.writable,enumerable=field.enumerable,configurable=field.configurable;let live=true;
 const current=()=>{
  if(!live)throw Error('Native full-model method observation retired: '+key);
  try{
   if(nativeMethodPrototype(object)!==parent||nativeMethodPrototype(owner)!==ownerParent||owner!==object&&nativeMethodDescriptor(object,key)!==undefined)throw Error('Native full-model method chain changed: '+key);
   const now=nativeMethodDescriptor(owner,key);
   if(!now||!nativeMethodHasOwn(now,'value')||now.value!==value||now.writable!==writable||now.enumerable!==enumerable||now.configurable!==configurable)throw Error('Native full-model method changed: '+key);
   // Repeat direct pins after descriptor callbacks. Neither step visits a grandparent.
   if(nativeMethodPrototype(object)!==parent||nativeMethodPrototype(owner)!==ownerParent||owner!==object&&nativeMethodDescriptor(object,key)!==undefined)throw Error('Native full-model method chain retired during observation: '+key);
   const post=nativeMethodDescriptor(owner,key);
   if(!post||!nativeMethodHasOwn(post,'value')||post.value!==value||post.writable!==writable||post.enumerable!==enumerable||post.configurable!==configurable)throw Error('Native full-model method retired during observation: '+key);
  }catch(error){live=false;throw error;}
 };
 current();return(...args:any[])=>{
  current();let result:any,failed=false,failure:unknown;
  try{result=nativeMethodApply(value,object,args);}catch(error){failed=true;failure=error;}
  try{current();}catch(error){if(failed)throw new AggregateError([failure,error],'Native full-model callback and method observation failed.');throw error;}
  if(failed)throw failure;return result;
 };
}
function text(value:unknown):string{if(typeof value!=='string'||!value||value.length>4096)throw Error('Native full-model identity unavailable');return value;}
function dense(value:unknown,maximum:number):unknown[]{if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>maximum||Reflect.ownKeys(value).length!==value.length+1)throw Error('Native full-model array unavailable');for(let index=0;index<value.length;index++){const field=Object.getOwnPropertyDescriptor(value,String(index));if(!field||!field.enumerable||!Object.hasOwn(field,'value'))throw Error('Native full-model array contains behavior or holes');}return value;}
export interface NativeFullModelBridge {claim(descriptor:NativeIndicatorDescriptor):()=>void;update(handle:IndicatorRenderHandle,patch:ScenePatch):boolean;dispose():void}
export type ClaimNativeDescriptor=NativeFullModelBridge['claim'];
/** Original guarded compatibility seam for the pinned 0.8.4 native value-only update path. */
export function createNativeFullModelBridge(chart:object,renderer:NativeRenderer):NativeFullModelBridge{
 if(!(renderer instanceof NativeRenderer))throw Error('Native full-model renderer mismatch');
 const active=new Set<NativeIndicatorDescriptor>(),retired=new WeakSet<object>();let disposed=false;
 const bridge:NativeFullModelBridge={
  claim(descriptor){if(disposed)throw Error('Native full-model bridge is disposed');const type=text(own(descriptor,'type'));if(getNativeIndicator(type)!==descriptor||active.has(descriptor)||retired.has(descriptor))throw Error('Native descriptor claim is not current');active.add(descriptor);let released=false;return()=>{if(released)return;released=true;active.delete(descriptor);retired.add(descriptor);};},
  update(handle,patch){
   if(disposed)throw Error('Native full-model bridge is disposed');if(own(patch,'kind')!=='value')return false;const id=text(own(handle,'id'));if(text(own(patch,'indicatorId'))!==id)throw Error('Native full-model patch identity changed');
   const core=own(chart,'orchestrator'),registry=own(core,'registry'),get=method(registry,'get'),record=get(id);if(!record)return false;
   const nativeField=Object.getOwnPropertyDescriptor(record,'native');if(!nativeField)return false;if(!Object.hasOwn(nativeField,'value'))throw Error('Native descriptor owner is not data');const native=nativeField.value;if(!native)return false;
   const descriptor=own(native,'descriptor');if(!descriptor||typeof descriptor!=='object')throw Error('Native descriptor identity unavailable');if(retired.has(descriptor))throw Error('Native descriptor claim is retired');if(!active.has(descriptor as NativeIndicatorDescriptor))return false;
   const type=text(own(native,'type'));if(getNativeIndicator(type)!==descriptor||own(descriptor,'type')!==type)throw Error('Native descriptor claim was replaced');
   if(own(core,'renderer')!==renderer)throw Error('Native renderer ownership changed');
   const renderHandle=own(record,'renderHandle');if(renderHandle!==handle||own(renderHandle,'id')!==id)throw Error('Native render handle ownership changed');
   const model=own(record,'model'),modelNative=own(model,'native');if(own(model,'id')!==id||own(modelNative,'type')!==type)throw Error('Native model ownership changed');
   const pane=text(own(model,'paneId')),scene=own(renderer,'scene'),models=own(scene,'indicators'),panes=own(scene,'panes');
   if(!(models instanceof Map)||Object.getPrototypeOf(models)!==Map.prototype||!(panes instanceof Map)||Object.getPrototypeOf(panes)!==Map.prototype||!panes.has(pane))throw Error('Native model pane is unavailable');
   const paneOwner=panes.get(pane);
   const independent=(value:unknown)=>{const field=Object.getOwnPropertyDescriptor(value as object,'ownScale');if(!field)return false;if(!Object.hasOwn(field,'value')||field.value!==undefined&&typeof field.value!=='boolean')throw Error('Native model independent scale flag unavailable');return field.value===true;};
   const previous=models.get(id);if(!previous||own(previous,'id')!==id||own(previous,'paneId')!==pane||independent(previous)!==independent(model))throw Error('Native model placement changed');
   // The port owns these already-budgeted arrays; preflight the small scene graph,
   // not another full clone of every numerical point on every live update.
   const ids=new Set<string>();for(const field of ['series','fills','backgrounds','priceLines'] as const){for(const row of dense(own(model,field),2048)){const rowId=text(own(row,'id'));if(ids.has(rowId))throw Error('Native model output identity collision');ids.add(rowId);const target=text(own(row,'paneId')),overlay=Object.getOwnPropertyDescriptor(row as object,'overlay');if(overlay&&!Object.hasOwn(overlay,'value'))throw Error('Native model overlay must be data');if(target!==(overlay?.value===true?'price':pane))throw Error('Native output pane changed');}}
   const mount=method(renderer,'mountIndicator');
   const current=(acceptedScene:unknown[])=>get(id)===record&&getNativeIndicator(type)===descriptor&&!disposed&&own(chart,'orchestrator')===core&&own(core,'registry')===registry&&own(core,'renderer')===renderer&&own(record,'native')===native&&own(native,'descriptor')===descriptor&&own(record,'model')===model&&own(record,'renderHandle')===renderHandle&&own(renderer,'scene')===scene&&own(scene,'indicators')===models&&own(scene,'panes')===panes&&acceptedScene.includes(models.get(id))&&panes.get(pane)===paneOwner&&active.has(descriptor as NativeIndicatorDescriptor);
   if(!current([previous]))throw Error('Native full-model owner changed during validation');
   try{mount(model as IndicatorModel);if(!current([model]))throw Error('Native full-model owner changed during publication');}
   catch(error){try{
    if(!current([previous,model]))throw Error('Native full-model owner changed before recovery');
    mount(previous);
    if(!current([previous]))throw Error('Native full-model owner changed during recovery');
    Object.defineProperty(record,'model',{value:previous,writable:true,configurable:true,enumerable:true});
   }catch(rollback){throw new AggregateError([error,rollback],'Native full-model update and recovery were incomplete');}throw error;}
   return true;
  },
  dispose(){disposed=true;for(const descriptor of active)retired.add(descriptor);active.clear();},
 };
 return bridge;
}
