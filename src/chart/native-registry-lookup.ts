/** Method observation only. The closed native owner must authenticate its
 * actual registry/model/source separately before supplying this receiver.
 * Neither this helper nor a successful read grants native/source authority. */
export interface NativeRegistryLookup {
 read(receiver:object):Readonly<{owner:object;descriptor:PropertyDescriptor}>|null;
}

const descriptor=Object.getOwnPropertyDescriptor,prototype=Object.getPrototypeOf,hasOwn=Object.hasOwn,freeze=Object.freeze;
interface LookupState {
 receiver:WeakRef<object>;owner:WeakRef<object>;parent:WeakRef<object>|null;ownerParent:WeakRef<object>|null;
 method:WeakRef<Function>;own:boolean;enumerable:boolean;configurable:boolean;writable:boolean;live:boolean;
}
function weak(value:object|null):WeakRef<object>|null{return value===null?null:new WeakRef(value);}
function sameParent(actual:object|null,expected:WeakRef<object>|null):boolean{return expected===null?actual===null:actual===expected.deref();}
function dataMethod(value:PropertyDescriptor|undefined):value is PropertyDescriptor&{value:Function}{return !!value&&hasOwn(value,'value')&&typeof value.value==='function';}
function matches(value:PropertyDescriptor|undefined,state:LookupState):value is PropertyDescriptor{
 return dataMethod(value)&&value.value===state.method.deref()&&value.enumerable===state.enumerable&&value.configurable===state.configurable&&value.writable===state.writable;
}
// Separate factory: retained methods close over weak state only, never the
// capture activation's receiver, descriptor/function or native model graph.
function methods(state:LookupState):NativeRegistryLookup{return freeze({read(receiver:object){
 if(!state.live||receiver!==state.receiver.deref())return null;
 try{
  const owner=state.owner.deref();if(!owner)throw Error('Registry lookup owner retired.');
  // These are direct identity checks, never a prototype-chain walk. Check
  // again at EVERY pre/post callback lookup in the closed native proof.
  if(!sameParent(prototype(receiver),state.parent)||!sameParent(prototype(owner),state.ownerParent))throw Error('Registry lookup prototype changed.');
  const own=descriptor(receiver,'get');if(!state.own&&own!==undefined)throw Error('Registry lookup was shadowed.');
  const value=state.own?own:descriptor(owner,'get');if(!matches(value,state))throw Error('Registry lookup method changed.');
  // Repeat fixed pins after descriptor reads, so a reentrant supplied trap
  // cannot change the observed chain during this bounded operation.
  if(!sameParent(prototype(receiver),state.parent)||!sameParent(prototype(owner),state.ownerParent)||!state.own&&descriptor(receiver,'get')!==undefined||!matches(descriptor(owner,'get'),state))throw Error('Registry lookup changed during observation.');
  return{owner,descriptor:value};
 }catch{state.live=false;return null;}
}});}

/** At most the receiver and its immediate prototype are inspected. A get
 * farther away is unavailable; no fallback traversal or refresh exists.
 * Prototype/descriptor calls are bounded; arbitrary Proxy-trap bodies are
 * not a CPU bound or an authentication mechanism for unknown input objects. */
export function captureNativeRegistryLookup(receiver:object):NativeRegistryLookup|null{
 if(!receiver||typeof receiver!=='object')return null;
 try{
  const parent=prototype(receiver),own=descriptor(receiver,'get');
  if(own!==undefined&&!dataMethod(own))return null;
  const owner=own===undefined?parent:receiver;if(!owner)return null;
  const found=own??descriptor(owner,'get');if(!dataMethod(found))return null;
  const state:LookupState={receiver:new WeakRef(receiver),owner:new WeakRef(owner),parent:weak(parent),ownerParent:weak(prototype(owner)),method:new WeakRef(found.value),own:owner===receiver,enumerable:found.enumerable!,configurable:found.configurable!,writable:found.writable!,live:true};
  const lookup=methods(state);return lookup.read(receiver)?lookup:null;
 }catch{return null;}
}
