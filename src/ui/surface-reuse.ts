import type {BarDataset} from '../domain/types';
import {isLiveDatasetId} from '../domain/live-provider';

/**
 * The last surfaces off the live tick. App still renders once per flush of the
 * active chart's own feed; these helpers let it hand the same values to surfaces that do not show the bars, so the kept
 * elements of reuseOwnedElement hold:
 * - `keepLiveIdentity`: one dataset object per live identity (instrument, provenance apart from asOf, resolution). Live
 *   growth (new or changed bars) keeps the object, so a reader of the identity only (Symbol info, the interval menu and
 *   dialog, the object tree) keeps its element. Non-live datasets pass through unchanged (their bars can matter there).
 * - `stableProps`: a props object (a section's handlers and values) kept while its values are unchanged, with function
 *   members forwarded to the newest closure; for nested prop objects (the Data sources sections, the object tree).
 * - `holdWhile`: a value held while the reader cannot show it (the closed Script editor's bars, while only the live feed
 *   grew).
 * - `onceWhile`: a value computed once per dependency list (Chart settings' chart reads, taken when the dialog opens).
 * The caches hang off App's kept-element cache (`surfaceCaches`), so App gains no hook.
 */
type AnyFunction=(...args:unknown[])=>unknown;
const FUNCTION=Symbol('function member');

/** The dataset fields an identity reader shows: everything but the bars and the as-of time (live growth moves both). */
export function liveIdentityKey(dataset:BarDataset):string{
 const {asOf:_asOf,...provenance}=dataset.provenance;
 return JSON.stringify([dataset.instrument,provenance,dataset.resolution]);
}
export interface IdentityCell {dataset:BarDataset|null;key:string}
export function keepLiveIdentity(cell:IdentityCell,next:BarDataset):BarDataset{
 if(!isLiveDatasetId(next.provenance.datasetId)){cell.dataset=next;cell.key='';return next;}
 const key=liveIdentityKey(next);
 if(cell.dataset&&cell.key===key)return cell.dataset;
 cell.dataset=next;cell.key=key;return next;
}

/** Plain-data content (JSON) or null when the value holds a function (never compared by content). */
function plainKey(value:unknown):string|null{
 if(value===null||typeof value!=='object')return null;
 try{return JSON.stringify(value,(_key,item)=>{if(typeof item==='function')throw FUNCTION;return item;});}catch{return null;}
}
function sameValue(a:unknown,b:unknown):boolean{
 if(Object.is(a,b))return true;
 const left=plainKey(a);return left!==null&&left===plainKey(b);
}
interface PropsEntry {keys:string[];values:unknown[];deps:unknown[];latest:Record<string,unknown>;value:Record<string,unknown>}
export type StablePropsCache=Map<string,PropsEntry>;
/** The same object while every key is present again, every value is Object.is equal or equal plain data, and `deps` are
 * unchanged. Function members are forwarders owned by that object: they call the newest function passed while the object
 * is kept (what a re-rendered child would call); an object that was replaced keeps calling its own last closures. */
export function stableProps<T extends object>(cache:StablePropsCache,slot:string,value:T,deps:readonly unknown[]=[]):T{
 const record=value as Record<string,unknown>,keys=Object.keys(record),values=keys.map(key=>typeof record[key]==='function'?FUNCTION:record[key]);
 const kept=cache.get(slot);
 if(kept&&kept.keys.length===keys.length&&keys.every((key,index)=>key===kept.keys[index]&&sameValue(values[index],kept.values[index]))&&kept.deps.length===deps.length&&deps.every((dep,index)=>Object.is(dep,kept.deps[index]))){
  kept.latest=record;return kept.value as T;
 }
 const entry:PropsEntry={keys,values,deps:[...deps],latest:record,value:{}};
 for(const key of keys){
  const item=record[key];
  entry.value[key]=typeof item==='function'?(...args:unknown[])=>(entry.latest[key] as AnyFunction)(...args):item;
 }
 cache.set(slot,entry);return entry.value as T;
}

export interface HoldCell<T> {value:T|undefined;set:boolean}
/** While `hold` is true the reader cannot show the value: the last value is kept (the first one when there is none), as
 * long as `same` says the new value is the same input (by default any value is). */
export function holdWhile<T>(cell:HoldCell<T>,hold:boolean,value:T,same:(kept:T,next:T)=>boolean=()=>true):T{
 if(hold&&cell.set&&same(cell.value as T,value))return cell.value as T;
 cell.value=value;cell.set=true;return value;
}

export interface OnceCell<T> {deps:readonly unknown[]|null;value:T|undefined}
/** `make()` runs once per dependency list (Object.is); the value is kept while the list is unchanged. */
export function onceWhile<T>(cell:OnceCell<T>,deps:readonly unknown[],make:()=>T):T{
 if(cell.deps&&cell.deps.length===deps.length&&cell.deps.every((dep,index)=>Object.is(dep,deps[index])))return cell.value as T;
 const value=make();cell.deps=[...deps];cell.value=value;return value;
}

export interface SurfaceCaches {
 props:StablePropsCache;
 identity:IdentityCell;
 scriptBars:HoldCell<{bars:unknown;key:readonly unknown[]}>;
 chartReads:OnceCell<unknown>;
}
const caches=new WeakMap<object,SurfaceCaches>();
/** One set of caches per owner (App passes its kept-element cache, so every App instance has its own). */
export function surfaceCaches(owner:object):SurfaceCaches{
 let found=caches.get(owner);
 if(!found){found={props:new Map(),identity:{dataset:null,key:''},scriptBars:{value:undefined,set:false},chartReads:{deps:null,value:undefined}};caches.set(owner,found);}
 return found;
}
