import React,{useEffect,useRef} from 'react';
import {createDemonstrationTrail,paintDemonstrationTrail,type DemonstrationTrail} from '../chart/demonstration-trail';

/** The Demonstration cursor's temporary drawing over the chart area (model and facts: src/chart/demonstration-trail.ts).
 * While `active`, pointer moves with Alt held draw a fading trail on this canvas. The canvas never takes pointer events, so the
 * chart underneath keeps its crosshair, panning and drawing behaviour; nothing is stored. */
export interface DemonstrationOverlayProps{active:boolean}
export interface DemonstrationPointer{clientX:number;clientY:number;altKey:boolean}
/** Feeds one pointer sample into the trail, relative to the overlay box. A pointer outside the box ends the stroke. */
export function demonstrationSample(trail:DemonstrationTrail,event:DemonstrationPointer,box:{left:number;top:number;width:number;height:number},now:number):boolean{
 const x=event.clientX-box.left,y=event.clientY-box.top,inside=x>=0&&y>=0&&x<=box.width&&y<=box.height;
 trail.add(x,y,now,event.altKey&&inside);
 return event.altKey&&inside;
}
export function DemonstrationOverlay({active}:DemonstrationOverlayProps){
 const canvas=useRef<HTMLCanvasElement|null>(null),trail=useRef<DemonstrationTrail>(createDemonstrationTrail());
 useEffect(()=>{
  if(!active){trail.current.clear();return;}
  let frame=0;const view=globalThis.window;if(!view)return;
  const paint=()=>{
   frame=0;const node=canvas.current;if(!node)return;
   const box=node.getBoundingClientRect(),dpr=view.devicePixelRatio||1,width=Math.round(box.width*dpr),height=Math.round(box.height*dpr);
   if(node.width!==width||node.height!==height){node.width=width;node.height=height;}
   const ctx=node.getContext('2d');if(!ctx)return;
   ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);ctx.scale(dpr,dpr);
   const now=performance.now(),left=trail.current.prune(now);
   paintDemonstrationTrail(ctx,trail.current.strokes(now));
   if(left)frame=view.requestAnimationFrame(paint);
  };
  const schedule=()=>{if(!frame)frame=view.requestAnimationFrame(paint);};
  const move=(event:PointerEvent)=>{const node=canvas.current;if(!node)return;if(demonstrationSample(trail.current,event,node.getBoundingClientRect(),performance.now()))schedule();};
  const key=(event:KeyboardEvent)=>{if(event.key==='Alt'&&event.type==='keyup')trail.current.add(NaN,NaN,performance.now(),false);};
  view.addEventListener('pointermove',move,true);view.addEventListener('keyup',key,true);
  return()=>{view.removeEventListener('pointermove',move,true);view.removeEventListener('keyup',key,true);if(frame)view.cancelAnimationFrame(frame);trail.current.clear();};
 },[active]);
 if(!active)return null;
 return <canvas ref={canvas} className="lv-demonstration-overlay" data-lv-cursor="demonstration" aria-hidden="true" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:5}}/>;
}
