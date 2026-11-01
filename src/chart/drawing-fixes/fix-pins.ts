// Shared pin helpers for the drawing fixes that replace native registrations in place (./native-fixes.ts,
// ./volume-fixes.ts, ./pattern-fixes.ts). Nothing here registers anything.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import {cloneStyle,fail,lvKey,method,nativeBase,type Init,type NativeBase,type NativeModel,type Projector} from '../lv-drawing-pin';

export type Anchor={time:number;price:number};
/** A linear test projector (x = time, y = 1000 - price) for the pins. */
export const LINEAR={xOf:(time:number)=>time,yOf:(price:number)=>1000-price,width:2000,height:1000,pxToPoint:(x:number,y:number)=>({time:x,price:1000-y}),barsBetween:(a:number,b:number)=>Math.abs(b-a)} as unknown as Projector;
export const probeInit=(anchors:Anchor[]):Init=>({id:'lv-drawing-type-probe',paneId:'price',createdAt:0,anchors});

export function meta(base:NativeBase,create:(init:Init)=>NativeModel):DrawingTypeMeta{
 const m=base.meta;
 return{...m,type:lvKey(m.type),defaultStyle:cloneStyle(m),create:init=>create(init)} as DrawingTypeMeta;
}
/** The native base of `type` with these members, refused when another module instance already fixed it. */
export function pinned(type:string,members:readonly string[]):NativeBase{
 const base=nativeBase(type);
 if(Object.hasOwn(base.prototype,'lvDrawingFix081'))fail(type+' is already fixed by another module instance');
 for(const key of members)method(base.prototype,key);
 return base;
}
/** Marks a fixed prototype (see pinned). */
export const FIXED={lvDrawingFix081:{value:true,enumerable:false}} as const;
