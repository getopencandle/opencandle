import React,{useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {cursorTimeLock,type CursorTimeLockStore} from './cursor-time-lock';

// The locked vertical cursor line (cursor-time-lock.ts) over the active chart's price pane. Like the event markers
// it is a DOM overlay that takes no pointer events; it follows pan, zoom and resize by reading the geometry every frame while
// a lock is shown, and renders nothing when the locked time is off screen or the chart has no time axis.
export interface LockedTimeLineProps{
 cellId:string|null;
 projection:()=>{left:number;top:number;width:number;height:number}|null;
 timeToX:(seconds:number)=>number|null;
 store?:CursorTimeLockStore;
}
type Geometry={x:number;top:number;height:number};
export function lockedLineGeometry(time:number,projection:{left:number;top:number;width:number;height:number}|null,x:number|null):Geometry|null{
 if(!projection||x===null||!Number.isFinite(x))return null;
 if(x<projection.left||x>projection.left+projection.width)return null;
 return{x:Math.round(x),top:projection.top,height:projection.height};
}
export function LockedTimeLine({cellId,projection,timeToX,store=cursorTimeLock}:LockedTimeLineProps){
 const lock=useSyncExternalStore(store.subscribe,store.get,store.get);
 const time=lock&&cellId&&lock.cellId===cellId?lock.time:null;
 const latest=useRef({projection,timeToX});latest.current={projection,timeToX};
 const [geometry,setGeometry]=useState<Geometry|null>(null);
 useEffect(()=>{
  if(time===null){setGeometry(null);return;}
  let frame=0,previous='';
  const step=()=>{let next:Geometry|null=null;try{next=lockedLineGeometry(time,latest.current.projection(),latest.current.timeToX(time));}catch{next=null;}const key=JSON.stringify(next);if(key!==previous){previous=key;setGeometry(next);}frame=requestAnimationFrame(step);};
  step();return()=>cancelAnimationFrame(frame);
 },[time]);
 if(time===null||!geometry)return null;
 return <div className="lv-locked-time-line" data-lv-locked-time={time} aria-hidden="true" style={{left:geometry.x,top:geometry.top,height:geometry.height}}/>;
}
