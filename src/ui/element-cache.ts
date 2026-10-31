import {createElement,type ComponentType,type ReactElement} from 'react';

/**
 * Element reuse for hot parents (the chart host and the chart grid re-render on every 1 Hz live App update).
 *
 * React skips a child whose element is the same object as in the previous render (same props object, no own state or
 * context change). `cachedElement` keeps one element per slot and returns the previous element while every non-function
 * prop is the same value (Object.is) and the same props are present. Function props are passed as stable forwarders that
 * call the newest function the parent rendered (the last defined one if a later render left it out), which is what a
 * re-rendered child would have called: every forwarded callback here is read through a "latest" ref or called
 * synchronously by the child, so the forwarders change no behaviour. The element type is unchanged (the child is not
 * wrapped), so shallow trees and direct `element.type(props)` calls see the same component.
 */
const FUNCTION=Symbol('function prop');
type AnyFunction=(...args:unknown[])=>unknown;
interface Entry {type:unknown;keys:string[];values:unknown[];latest:Record<string,unknown>;last:Record<string,AnyFunction>;stable:Record<string,AnyFunction>;element:ReactElement|null}
export type ElementCache=Map<string,Entry>;
export function createElementCache():ElementCache{return new Map();}
export function cachedElement<P extends object>(cache:ElementCache,slot:string,type:ComponentType<P>,props:P):ReactElement{
 let entry=cache.get(slot);
 if(!entry||entry.type!==type){entry={type,keys:[],values:[],latest:{},last:{},stable:{},element:null};cache.set(slot,entry);}
 const owner=entry,record=props as Record<string,unknown>,keys=Object.keys(record),values=keys.map(key=>typeof record[key]==='function'?FUNCTION:record[key]);
 owner.latest=record;for(const key of keys)if(typeof record[key]==='function')owner.last[key]=record[key] as AnyFunction;
 if(owner.element&&keys.length===owner.keys.length&&keys.every((key,index)=>key===owner.keys[index]&&Object.is(values[index],owner.values[index])))return owner.element;
 const next:Record<string,unknown>={};
 for(const key of keys){
  if(typeof record[key]!=='function'){next[key]=record[key];continue;}
  next[key]=owner.stable[key]??=(...args:unknown[])=>{const current=owner.latest[key];return (typeof current==='function'?current as AnyFunction:owner.last[key])(...args);};
 }
 owner.keys=keys;owner.values=values;owner.element=createElement(type,next as P);return owner.element;
}
/** The element form: the parent still writes ordinary JSX, and the freshly built element is swapped for the kept one when
 * its props are unchanged (by the same rule as cachedElement). Keys are not supported (the slot is the identity). */
export function reuseElement(cache:ElementCache,slot:string,element:ReactElement):ReactElement{
 if(element.key!==null)throw new Error('reuseElement takes elements without a key.');
 return cachedElement(cache,slot,element.type as ComponentType<object>,element.props as object);
}
/** Drops the slots that are no longer rendered. */
export function retainElementSlots(cache:ElementCache,slots:Iterable<string>):void{const keep=new Set(slots);for(const slot of [...cache.keys()])if(!keep.has(slot))cache.delete(slot);}

/** One value per slot, rebuilt only when a dependency changes (Object.is); for objects whose closures capture only those values and refs. */
export type ValueCache<T>=Map<string,{deps:readonly unknown[];value:T}>;
export function cachedValue<T>(cache:ValueCache<T>,slot:string,deps:readonly unknown[],make:()=>T):T{
 const entry=cache.get(slot);if(entry&&entry.deps.length===deps.length&&entry.deps.every((value,index)=>Object.is(value,deps[index])))return entry.value;
 const value=make();cache.set(slot,{deps:[...deps],value});return value;
}

/**
 * Element reuse for App's toolbars, watchlist panel, dock and dialogs, which no longer follow every live tick.
 * Same rule as cachedElement (every non-function prop Object.is equal, same props present), plus:
 * - `deps`: render-time values the element's closures capture that are not props (for example the dialog authority);
 *   a change rebuilds the element.
 * - `data`: props compared by plain-data content (JSON) instead of identity, for props App recomputes on every render
 *   (for example the recent-symbol list read from storage). An equal value keeps the kept element.
 * - Keys are supported (part of the identity). A falsy value (a closed dialog) passes through and drops the slot.
 * - A function prop is passed as is while the parent keeps passing the same function (a stable handler keeps its
 *   identity, so two children handed one handler still share it). The first time a slot sees a function prop change while
 *   nothing else changed, the element is rebuilt once with a forwarder for that prop, which calls the newest function
 *   rendered while that element is kept. A handler also named in `deps` is never forwarded: each change rebuilds the
 *   element with the handler as is (used where two children must share one handler's identity).
 * - Forwarders belong to one kept element: a rebuilt element gets new ones, so a callback held from an element that
 *   was replaced (a stale dialog owner, an async continuation) keeps calling the closure of its own element, as without reuse.
 */
interface OwnedEntry {type:unknown;key:string|null;keys:string[];values:unknown[];deps:unknown[];latest:Record<string,unknown>;passed:Record<string,unknown>;forwarded:Set<string>;element:ReactElement}
export type OwnedElementCache=Map<string,OwnedEntry>;
export function createOwnedElementCache():OwnedElementCache{return new Map();}
const sameList=(a:readonly unknown[],b:readonly unknown[])=>a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
function dataKey(value:unknown):unknown{try{return 'json:'+JSON.stringify(value);}catch{return value;}}
export function reuseOwnedElement<E>(cache:OwnedElementCache,slot:string,element:E,deps:readonly unknown[]=[],data:readonly string[]=[]):E{
 if(!element||typeof element!=='object'||!('type' in (element as object))||!('props' in (element as object))){cache.delete(slot);return element;}
 const source=element as unknown as ReactElement,record=source.props as Record<string,unknown>,keys=Object.keys(record);
 const values=keys.map(key=>typeof record[key]==='function'?FUNCTION:data.includes(key)?dataKey(record[key]):record[key]);
 const kept=cache.get(slot),same=!!kept&&kept.type===source.type&&kept.key===source.key&&sameList(kept.keys,keys)&&sameList(kept.values,values)&&sameList(kept.deps,deps);
 const forwarded=new Set(kept?.forwarded??[]);
 // A function is newly forwarded only when it changed while nothing else did; a rebuild for another reason passes it as is.
 if(kept&&same)for(const key of keys)if(typeof record[key]==='function'&&!forwarded.has(key)&&key in kept.passed&&kept.passed[key]!==record[key])forwarded.add(key);
 if(kept&&same&&forwarded.size===kept.forwarded.size){kept.latest=record;return kept.element as unknown as E;}
 const owner:OwnedEntry={type:source.type,key:source.key,keys,values,deps:[...deps],latest:record,passed:{},forwarded,element:source},next:Record<string,unknown>={};
 for(const key of keys){
  const value=record[key];
  if(typeof value!=='function'){next[key]=value;continue;}
  owner.passed[key]=value;
  next[key]=forwarded.has(key)?(...args:unknown[])=>(owner.latest[key] as AnyFunction)(...args):value;
 }
 if(source.key!==null)next.key=source.key;
 owner.element=createElement(source.type as ComponentType<object>,next as object);cache.set(slot,owner);return owner.element as unknown as E;
}
