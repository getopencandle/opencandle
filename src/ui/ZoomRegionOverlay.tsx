import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createZoomGesture} from '../chart/drawing-zoom';
import './drawing-utility.css';
/** Escape cancels an armed zoom region (SDT#utility.zoom is momentary); every other key is left alone. */
export const zoomOverlayKey=(event:{key:string}):'cancel'|null=>event.key==='Escape'?'cancel':null;
/** Pointer overlay for Zoom in over one pane. timeAt maps a client x to chart time, onRange receives the dragged span (already at least one bar wide), onCancel ends the mode without change.
 * The host disarms the mode after either callback (momentary tool). Cursor: the CSS zoom-in cursor (SDD#cursor.classes). */
export interface ZoomRegionOverlayProps{active:boolean;timeAt:(clientX:number)=>number|null;barInterval:()=>number;onRange:(from:number,to:number)=>void;onCancel:()=>void}
export function ZoomRegionOverlay(props:ZoomRegionOverlayProps){
 const [span,setSpan]=useState<{from:number;to:number}|null>(null),node=useRef<HTMLDivElement|null>(null),latest=useRef(props);latest.current=props;
 const gesture=useMemo(()=>createZoomGesture({timeAt:x=>latest.current.timeAt(x),barInterval:()=>latest.current.barInterval(),onRange:(a,b)=>{setSpan(null);latest.current.onRange(a,b);},onCancel:()=>{setSpan(null);latest.current.onCancel();}}),[]);
 useEffect(()=>{
  if(!props.active)return;
  const key=(event:KeyboardEvent)=>{if(zoomOverlayKey(event)==='cancel'){event.preventDefault();gesture.escape();setSpan(null);latest.current.onCancel();}};
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[props.active,gesture]);
 if(!props.active)return null;
 const origin=()=>node.current?.getBoundingClientRect().left??0;
 return <div ref={node} className="lv-zoom-region-overlay" data-lv-cursor="zoom-in" style={{cursor:'zoom-in'}}
  onPointerDown={event=>{if(event.button!==0)return;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);gesture.down(event.clientX);setSpan(gesture.span());}}
  onPointerMove={event=>{gesture.move(event.clientX);setSpan(gesture.span());}}
  onPointerUp={event=>{(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);gesture.up(event.clientX);}}
  onPointerCancel={()=>{gesture.escape();setSpan(null);}}>
  {span&&<div className="lv-zoom-region-box" style={{left:span.from-origin(),width:span.to-span.from}}/>}
 </div>;
}
