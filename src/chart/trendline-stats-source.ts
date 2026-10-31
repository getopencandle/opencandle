import type {Bar} from '../domain/types';
import {prepareTrendlineStatisticsGrid,type PreparedTrendlineStatisticsGrid} from '../domain/trendline-statistics';

export type TrendlineStatisticsGridRead=
 | Readonly<{state:'available';grid:PreparedTrendlineStatisticsGrid;identity:object}>
 | Readonly<{state:'unavailable';reason:string}>;
export interface TrendlineStatisticsSource {
 readonly identity:object;
 readonly pricePaneId:string;
 readonly timezone?:string;
 assertCurrent():void;
 readGrid():TrendlineStatisticsGridRead;
}
export interface TrendlineStatisticsSourceBasis {
 /** Trusted adapter epoch changes before every supported source/style/timezone mutation, including rollback. */
 readonly epoch:object;
 readonly source:object;
 readonly bars:readonly Bar[];
 readonly style:string;
 readonly temporal:boolean;
 readonly disposed:boolean;
}
export interface TrendlineStatisticsSourceHost {
 readonly renderer:object;
 readBasis():TrendlineStatisticsSourceBasis;
}
interface Slot {owner:object;key:string;descriptor:PropertyDescriptor|undefined}
function slot(owner:object,key:string,optional=false):Slot {
 const descriptor=Object.getOwnPropertyDescriptor(owner,key);
 if(!descriptor&&!optional||descriptor&&!Object.hasOwn(descriptor,'value'))throw Error('Statistics source requires native data fields: '+key);
 return{owner,key,descriptor};
}
function unchanged(value:Slot):void {
 const current=Object.getOwnPropertyDescriptor(value.owner,value.key),before=value.descriptor;
 if(!current&&!before)return;
 if(!current||!before||current.value!==before.value||current.writable!==before.writable||current.enumerable!==before.enumerable||current.configurable!==before.configurable||!Object.hasOwn(current,'value'))throw Error('Statistics native source field changed: '+value.key);
}
function object(value:unknown):value is object{return value!==null&&typeof value==='object';}

/** Internal read-only source bridge. The adapter, not a caller-supplied saved record, owns its epoch. */
export function createTrendlineStatisticsSource(host:TrendlineStatisticsSourceHost) {
 const readSlot=slot(host,'readBasis'),rendererSlot=slot(host,'renderer'),read=readSlot.descriptor!.value,renderer=rendererSlot.descriptor!.value;
 if(typeof read!=='function'||!object(renderer))throw Error('Statistics source host is unavailable.');
 let disposed=false,capturing=false,cached:TrendlineStatisticsSource|undefined;
 const installation=()=>{if(disposed)throw Error('Statistics source bridge is disposed.');unchanged(readSlot);unchanged(rendererSlot);};
 const readBasis=()=>{
  installation();const raw=Reflect.apply(read,host,[]);installation();
  if(!object(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw Error('Statistics source basis requires plain data.');
  const value={} as Record<keyof TrendlineStatisticsSourceBasis,any>;
  for(const key of ['epoch','source','bars','style','temporal','disposed'] as const){const field=Object.getOwnPropertyDescriptor(raw,key);if(!field?.enumerable||!Object.hasOwn(field,'value'))throw Error('Statistics source basis requires data: '+key);value[key]=field.value;}
  if(!object(value.epoch)||!object(value.source)||!Array.isArray(value.bars)||typeof value.style!=='string'||typeof value.temporal!=='boolean'||typeof value.disposed!=='boolean'||value.disposed)throw Error('Statistics chart source is unavailable.');
  // The trusted adapter provides ordinary data. Keep a detached tuple, never its mutable wrapper.
  return{epoch:value.epoch,source:value.source,bars:value.bars,style:value.style,temporal:value.temporal};
 };
 return Object.freeze({
  capture():TrendlineStatisticsSource {
   installation();if(capturing)throw Error('Statistics source capture is already active.');capturing=true;
   try{
   if(cached)try{cached.assertCurrent();return cached;}catch{cached=undefined;}
   const basis=readBasis(),sceneSlot=slot(renderer,'scene'),scene=sceneSlot.descriptor!.value;
   if(!object(scene))throw Error('Statistics native scene is unavailable.');
   const zoneSlot=slot(scene,'timezone',true),zone=zoneSlot.descriptor?.value,rendererPrototype=Object.getPrototypeOf(renderer),scenePrototype=Object.getPrototypeOf(scene);
   let live=true,readingGrid=false,grid:TrendlineStatisticsGridRead|undefined;
   const nativeCurrent=()=>{unchanged(sceneSlot);unchanged(zoneSlot);if(Object.getPrototypeOf(renderer)!==rendererPrototype||Object.getPrototypeOf(scene)!==scenePrototype)throw Error('Statistics native source prototype changed.');};
   const assert=()=>{
    if(!live)throw Error('Statistics source lease retired.');
    try{
     installation();nativeCurrent();
     const current=readBasis();
     if(current.epoch!==basis.epoch||current.source!==basis.source||current.bars!==basis.bars||current.style!==basis.style||current.temporal!==basis.temporal)throw Error('Statistics source prefix or topology changed.');
     installation();nativeCurrent();
    }catch(error){live=false;throw error;}
   };
   const lease:TrendlineStatisticsSource=Object.freeze({
    identity:Object.freeze({}),pricePaneId:'price',...(typeof zone==='string'?{timezone:zone}:{}),
    assertCurrent(this:TrendlineStatisticsSource){if(this!==lease)throw Error('Foreign statistics source receiver.');assert();},
    readGrid(this:TrendlineStatisticsSource):TrendlineStatisticsGridRead {
     if(this!==lease)throw Error('Foreign statistics grid receiver.');assert();
     if(grid)return grid;if(readingGrid)throw Error('Statistics grid preparation is already active.');
     readingGrid=true;
     try{
      if(!basis.temporal){grid=Object.freeze({state:'unavailable',reason:'This display topology has no admitted time-to-bar grid.'});return grid;}
      let next:TrendlineStatisticsGridRead;
      try{const prepared=prepareTrendlineStatisticsGrid(basis.bars);assert();next=Object.freeze({state:'available',grid:prepared,identity:Object.freeze({})});}
      catch(error){
       assert();let reason='Statistics bar grid could not be prepared.';
       try{reason=String(error).slice(0,240);}catch{/* Preserve an explicit bounded unavailable result. */}
       assert();next=Object.freeze({state:'unavailable',reason});
      }
      assert();grid=next;return next;
     }finally{readingGrid=false;}
    },
   });
   assert();cached=lease;return lease;
   }finally{capturing=false;}
  },
  dispose(){disposed=true;cached=undefined;},
 });
}
