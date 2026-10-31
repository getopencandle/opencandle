import React,{useEffect,useRef,useState} from 'react';
import type {ButtonsVisibility} from '../chart/chart-settings-document';
import {CHART_EVENT_STYLE} from '../domain/chart-events';
import './chart-commands.css';

// The chart navigation buttons, driven by Chart settings > Canvas > Buttons > Navigation
// (canvas.navButtons: Visible on mouse over, Always visible, Always invisible; the reference default is mouse over).
// Zoom out, zoom in, scroll left, scroll right and reset run the chart's own zoom, pan and Reset chart view commands, so
// each press is one navigation step like the mouse. The cluster's look and the step sizes are our own choice.
export const NAV_ZOOM_FACTOR=1.25,NAV_PAN_FRACTION=0.1;
export interface NavigationTarget{zoom(factor:number):void;pan(fraction:number):void;/** The chart's price pane in client pixels (the adapter's); used to keep clear of the event marker strip. */pricePaneProjection?:()=>{left:number;top:number;width:number;height:number}|null}
/** The gap kept between the cluster and the split/dividend marker strip at the bottom of the price pane. */
export const NAV_MARKER_CLEARANCE_PX=6;
type Rect={top:number;bottom:number;left:number;right:number};
/** The marker strip (ChartEventMarkers: badges of CHART_EVENT_STYLE.size, bottomGap above the price pane bottom) in client
 * pixels, across the pane's width. */
export function eventMarkerStrip(projection:{left:number;top:number;width:number;height:number}):Rect{
 const bottom=projection.top+projection.height,top=bottom-CHART_EVENT_STYLE.size-CHART_EVENT_STYLE.bottomGap;
 return{top,bottom,left:projection.left,right:projection.left+projection.width};
}
/** How far (px) the cluster, whose CSS place (lift 0) is `base`, must move up so it never covers the marker strip (the event
 * markers stay hit-testable under the navigation buttons). 0 when they do not meet. */
export function navigationLift(base:Rect,projection:{left:number;top:number;width:number;height:number}|null):number{
 if(!projection||!(projection.width>0)||!(projection.height>0))return 0;
 const strip=eventMarkerStrip(projection),clearTop=strip.top-NAV_MARKER_CLEARANCE_PX;
 const meets=base.bottom>clearTop&&base.top<strip.bottom&&base.right>strip.left&&base.left<strip.right;
 return meets?Math.max(0,Math.ceil(base.bottom-clearTop)):0;
}
/** One measurement for the cluster element: its CSS place is its box with the current lift taken off. */
export function measureNavigationLift(node:{getBoundingClientRect():Rect}|null,target:NavigationTarget|null,lift:number):number{
 if(!node||!target||typeof target.pricePaneProjection!=='function')return 0;
 let projection:ReturnType<NonNullable<NavigationTarget['pricePaneProjection']>>=null;try{projection=target.pricePaneProjection();}catch{projection=null;}
 const box=node.getBoundingClientRect();
 return navigationLift({top:box.top+lift,bottom:box.bottom+lift,left:box.left,right:box.right},projection);
}
/** Gap kept between the cluster and the bottom edge of the price pane (above the time axis). */
export const NAV_PANE_BOTTOM_GAP_PX=12;
const ANCHOR_VARS=['--lv-nav-left','--lv-price-pane-bottom-gap'] as const;
/** Anchors the cluster (and the scroll-to-latest button, which reads the same variable) to the price pane's bottom centre by
 * writing two CSS variables on the workspace, so an open Trading panel, Strategy tester or Script editor never sits under it. */
function anchorToPricePane(node:HTMLElement|null,target:NavigationTarget|null):HTMLElement|null{
 const parent=node?.offsetParent;
 if(!node||!(parent instanceof HTMLElement)||!target||typeof target.pricePaneProjection!=='function')return null;
 const pane=target.pricePaneProjection();
 if(!pane||!(pane.width>0)||!(pane.height>0)){clearAnchor(parent);return null;}
 const origin=parent.getBoundingClientRect();
 const values=[Math.round(pane.left+pane.width/2-origin.left)+'px',Math.max(0,Math.round(origin.bottom-(pane.top+pane.height)+NAV_PANE_BOTTOM_GAP_PX))+'px'];
 ANCHOR_VARS.forEach((name,index)=>{if(parent.style.getPropertyValue(name)!==values[index])parent.style.setProperty(name,values[index]!);});
 return parent;
}
function clearAnchor(parent:HTMLElement|null){if(parent)for(const name of ANCHOR_VARS)parent.style.removeProperty(name);}
export type NavigationCommand='zoom-out'|'zoom-in'|'scroll-left'|'scroll-right'|'reset';
export const NAVIGATION_BUTTONS:readonly {command:NavigationCommand;label:string;path:string}[]=Object.freeze([
 {command:'zoom-out',label:'Zoom out',path:'M3 7h8'},
 {command:'zoom-in',label:'Zoom in',path:'M3 7h8M7 3v8'},
 {command:'scroll-left',label:'Scroll to the left',path:'M9 3L5 7l4 4'},
 {command:'scroll-right',label:'Scroll to the right',path:'M5 3l4 4-4 4'},
 {command:'reset',label:'Reset chart view',path:'M3.5 7a3.5 3.5 0 1 0 1-2.5M3.5 2.5v2h2'},
]);
/** Runs one button; false when the chart refused (the caller reports it). */
export function runNavigation(target:NavigationTarget|null,command:NavigationCommand,reset:()=>void):boolean{
 try{
  if(command==='reset'){reset();return true;}
  if(!target)return false;
  if(command==='zoom-in')target.zoom(NAV_ZOOM_FACTOR);else if(command==='zoom-out')target.zoom(1/NAV_ZOOM_FACTOR);
  else target.pan(command==='scroll-left'?-NAV_PAN_FRACTION:NAV_PAN_FRACTION);
  return true;
 }catch{return false;}
}
export function ChartNavigationButtons({visibility,target,onReset,onMessage}:{visibility:ButtonsVisibility;target:NavigationTarget|null;onReset:()=>void;onMessage?:(message:string)=>void}){
 // The cluster follows pan, zoom and resize like the marker overlay (geometry read every frame, state set only
 // when it moves) and is lifted above the event marker strip whenever they would meet.
 const node=useRef<HTMLDivElement|null>(null),latest=useRef(target);latest.current=target;
 const [lift,setLift]=useState(0),liftRef=useRef(0);liftRef.current=lift;
 const shown=visibility!=='never'&&!!target;
 useEffect(()=>{
  if(!shown||typeof requestAnimationFrame!=='function')return;
  let frame=0,anchored:HTMLElement|null=null;
  const step=()=>{try{anchored=anchorToPricePane(node.current,latest.current)??anchored;}catch{/* keep the CSS fallback place */}let next=0;try{next=measureNavigationLift(node.current,latest.current,liftRef.current);}catch{next=0;}if(next!==liftRef.current){liftRef.current=next;setLift(next);}frame=requestAnimationFrame(step);};
  step();return()=>{cancelAnimationFrame(frame);clearAnchor(anchored);};
 },[shown]);
 if(!shown)return null;
 return <div ref={node} className="lv-nav-buttons" role="toolbar" aria-label="Chart navigation" data-visibility={visibility} data-lv-nav-lift={lift||undefined} style={lift?{marginBottom:lift}:undefined}>
  {NAVIGATION_BUTTONS.map(row=><button key={row.command} type="button" aria-label={row.label} title={row.label} onClick={()=>{if(!runNavigation(target,row.command,onReset))onMessage?.('The chart could not move.');}}><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d={row.path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></button>)}
 </div>;
}
