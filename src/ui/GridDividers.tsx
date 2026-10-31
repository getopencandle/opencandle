import React,{useEffect,useRef} from 'react';
import {dividerPlacement,dividerSegments,dragDivider,gridTemplates,keyboardDivider,normalizeTracks,paintedTracks,resetDivider,withTracks,type DividerSegment,type LayoutTracks} from '../chart/layout-tracks';
import {publishGridState} from '../chart/grid-publication';

// Resizable borders between the charts of a multi-chart layout (drag the border between two
// charts; double-click returns the pair to equal sizes). The model is layout-tracks.ts; this file is the pointer and keyboard
// surface. During a drag the grid template is written straight to the grid element (no React render per pointer move); the
// end of a drag writes the painted template back first, then publishes once, so React and the DOM never disagree.

export interface GridDividersProps {
 presetId:string;
 /** The stored block on the grid state (MultiChartState.tracks); absent means equal tracks. */
 tracks?:unknown;
 /** Called once per finished gesture: the stored form (undefined when every track is equal again). */
 onCommit:(tracks:LayoutTracks|undefined)=>void;
 /** Charts re-measure their canvas (at most once per animation frame while dragging, and after a commit). */
 onLayout?:()=>void;
}
interface DragSession {pointerId:number;segment:DividerSegment;start:LayoutTracks;origin:number;size:number;grid:HTMLElement;handle:HTMLElement;last:LayoutTracks}

const KEYS:Record<'columns'|'rows',{decrease:string;increase:string}>={columns:{decrease:'ArrowLeft',increase:'ArrowRight'},rows:{decrease:'ArrowUp',increase:'ArrowDown'}};
/** A keyboard step on a divider: the stored form after the move, or null when the key is not this divider's. */
export function dividerKeyStep(tracks:LayoutTracks,presetId:string,segment:DividerSegment,key:string):{tracks:LayoutTracks|undefined}|null{
 const keys=KEYS[segment.axis],direction=key===keys.increase?'increase':key===keys.decrease?'decrease':null;
 if(!direction)return null;return{tracks:normalizeTracks(keyboardDivider(tracks,segment.axis,segment.index,direction),presetId)};
}
/** A double-click on a divider: the two charts beside it share their space equally. */
export function dividerReset(tracks:LayoutTracks,presetId:string,segment:DividerSegment):LayoutTracks|undefined{
 const next=resetDivider(tracks,segment.axis,segment.index);return next===undefined?undefined:normalizeTracks(next,presetId);
}
/** The tracks after a pointer moved `distance` px along an axis `size` px long. */
export function dividerDragAt(start:LayoutTracks,segment:DividerSegment,distance:number,size:number):LayoutTracks{
 return size>0&&Number.isFinite(distance)?dragDivider(start,segment.axis,segment.index,distance/size):start;
}
/** Publishes a tracks change through the grid's normal publication path (undo, autosave, layout library all see it). */
export function publishGridTracks<State extends {presetId:string;tracks?:LayoutTracks}>(port:{previous:State;tracks:LayoutTracks|undefined;staging?:boolean;notify:(next:State)=>boolean|void;accepted:(next:State)=>void;rejected:(message:string)=>void}):boolean{
 if(port.staging)return false;const next=withTracks(port.previous,port.tracks);
 if(JSON.stringify(next)===JSON.stringify(port.previous))return true;
 return publishGridState({previous:port.previous,next,notify:port.notify,accepted:port.accepted,rejected:port.rejected});
}

const handleStyle=(segment:DividerSegment,place:{at:number;start:number;length:number}):React.CSSProperties=>segment.axis==='columns'
 ?{position:'absolute',left:`calc(${place.at}% - 3px)`,top:`${place.start}%`,width:6,height:`${place.length}%`,cursor:'col-resize'}
 :{position:'absolute',top:`calc(${place.at}% - 3px)`,left:`${place.start}%`,height:6,width:`${place.length}%`,cursor:'row-resize'};

export function GridDividers(props:GridDividersProps){
 const latest=useRef(props);latest.current=props;
 const session=useRef<DragSession|null>(null),frame=useRef(0);
 const tracks=paintedTracks({presetId:props.presetId,tracks:props.tracks}),segments=dividerSegments(props.presetId);
 const layoutSoon=()=>{if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;latest.current.onLayout?.();});};
 const paint=(grid:HTMLElement,value:LayoutTracks)=>{const templates=gridTemplates({presetId:latest.current.presetId,tracks:value});grid.style.gridTemplateColumns=templates.columns;grid.style.gridTemplateRows=templates.rows;};
 const finish=(commit:boolean)=>{
  const active=session.current;if(!active)return;session.current=null;
  // The DOM goes back to what React painted before the store decides; a committed change then re-renders from props.
  const painted=paintedTracks({presetId:latest.current.presetId,tracks:latest.current.tracks});paint(active.grid,painted);
  const place=dividerPlacement(painted,active.segment),style=handleStyle(active.segment,place);active.handle.style.left=String(style.left);active.handle.style.top=String(style.top);
  try{active.handle.releasePointerCapture?.(active.pointerId);}catch{/* already released */}
  if(commit){let stored:LayoutTracks|undefined;try{stored=normalizeTracks(active.last,latest.current.presetId);}catch{stored=undefined;}latest.current.onCommit(stored);}
  layoutSoon();
 };
 // A restore or undo while a drag is open (new tracks or preset from props) ends the drag without publishing it.
 const storedKey=JSON.stringify(props.tracks??null);
 useEffect(()=>{if(session.current)finish(false);},[props.presetId,storedKey]);
 useEffect(()=>()=>{if(frame.current)cancelAnimationFrame(frame.current);frame.current=0;},[]);
 const coordinate=(segment:DividerSegment,event:{clientX:number;clientY:number})=>segment.axis==='columns'?event.clientX:event.clientY;
 return <>{segments.map(segment=>{
  const place=dividerPlacement(tracks,segment),key=segment.axis+':'+segment.index+':'+segment.from;
  return <div key={key} role="separator" tabIndex={0} className="lv-grid-divider" data-axis={segment.axis} data-index={segment.index}
   aria-orientation={segment.axis==='columns'?'vertical':'horizontal'} aria-label={segment.axis==='columns'?'Resize chart columns':'Resize chart rows'}
   aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(place.at)} title="Drag to resize the charts. Double-click to make them equal."
   style={{...handleStyle(segment,place),zIndex:4,touchAction:'none',background:'transparent'}}
   onPointerDown={event=>{
    if(event.button!==0||session.current)return;const handle=event.currentTarget as HTMLElement,grid=handle.parentElement;if(!grid)return;
    const box=grid.getBoundingClientRect(),size=segment.axis==='columns'?box.width:box.height;if(!(size>0))return;
    event.preventDefault();event.stopPropagation();try{handle.setPointerCapture?.(event.pointerId);}catch{/* capture is optional */}
    const start=paintedTracks({presetId:latest.current.presetId,tracks:latest.current.tracks});
    session.current={pointerId:event.pointerId,segment,start,origin:coordinate(segment,event),size,grid,handle,last:start};
   }}
   onPointerMove={event=>{
    const active=session.current;if(!active||active.pointerId!==event.pointerId)return;
    const next=dividerDragAt(active.start,active.segment,coordinate(active.segment,event)-active.origin,active.size);active.last=next;paint(active.grid,next);
    const style=handleStyle(active.segment,dividerPlacement(next,active.segment));active.handle.style.left=String(style.left);active.handle.style.top=String(style.top);layoutSoon();
   }}
   onPointerUp={event=>{if(session.current?.pointerId===event.pointerId)finish(true);}}
   onPointerCancel={event=>{if(session.current?.pointerId===event.pointerId)finish(false);}}
   onLostPointerCapture={event=>{if(session.current?.pointerId===event.pointerId)finish(false);}}
   onDoubleClick={event=>{event.preventDefault();event.stopPropagation();const current=paintedTracks({presetId:latest.current.presetId,tracks:latest.current.tracks});latest.current.onCommit(dividerReset(current,latest.current.presetId,segment));layoutSoon();}}
   onKeyDown={event=>{const current=paintedTracks({presetId:latest.current.presetId,tracks:latest.current.tracks}),step=dividerKeyStep(current,latest.current.presetId,segment,event.key);if(!step)return;event.preventDefault();event.stopPropagation();latest.current.onCommit(step.tracks);layoutSoon();}}
  />;
 })}</>;
}
