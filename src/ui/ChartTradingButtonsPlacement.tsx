import React,{cloneElement,useLayoutEffect,useRef,type CSSProperties,type HTMLAttributes,type ReactElement,type Ref} from 'react';
import type {ChartController} from '../chart/adapter';
import {readPaneLegendFrame} from './PaneIndicatorLayer';
import {paneLegendLayout} from './pane-legend-layout';

/** Presentation ownership only; no source, account, numerical or command authority is created here. */
export interface ChartTradingPlacement {chart:ChartController|null;owner:object;isCurrent:()=>boolean}
type DivElement=ReactElement<HTMLAttributes<HTMLDivElement>&{ref?:Ref<HTMLDivElement>}>;
type StyleValue={value:string;priority:string};
type Owner={baseline:Map<string,StyleValue>;last:Map<string,StyleValue>};
const owners=new WeakMap<HTMLElement,Owner>();
/** A retiring mount whose restore waits one microtask, so a successor mount on the same element (an owner change in the
 * same commit) adopts its placement instead of the group flashing hidden and the legend rows jumping. */
type Retiring={shown:boolean;host:HTMLElement|null};
const retiring=new WeakMap<HTMLElement,Retiring>();
const finite=(...values:number[])=>values.every(Number.isFinite);
export const TRADE_OFFSET_VAR='--lv-trade-buttons-h';
function visibleBox(element:HTMLElement,current:()=>boolean):{left:number;right:number;top:number;bottom:number}|null{
 if(!current()||!element.isConnected||element.closest('[hidden],[aria-hidden="true"],[inert]'))return null;
 const box=element.getBoundingClientRect();if(!current())return null;
 let left=box.left,right=box.right,top=box.top,bottom=box.bottom;
 for(let node:HTMLElement|null=element;node;node=node.parentElement){
  if(!current())return null;const style=getComputedStyle(node);if(!current()||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0)return null;
  const x=/^(auto|scroll|hidden|clip)$/.test(style.overflowX),y=/^(auto|scroll|hidden|clip)$/.test(style.overflowY);if(!x&&!y)continue;
  const clip=node.getBoundingClientRect();if(!current())return null;const sx=node.offsetWidth>0?clip.width/node.offsetWidth:1,sy=node.offsetHeight>0?clip.height/node.offsetHeight:1;
  if(x){left=Math.max(left,clip.left+node.clientLeft*sx);right=Math.min(right,clip.left+(node.clientLeft+node.clientWidth)*sx);}
  if(y){top=Math.max(top,clip.top+node.clientTop*sy);bottom=Math.min(bottom,clip.top+(node.clientTop+node.clientHeight)*sy);}
 }
 return finite(left,right,top,bottom)&&right>left&&bottom>top?{left,right,top,bottom}:null;
}
/** The same DOM div remains the complete root. Only its own placement styles are owned. */
type PlacementProps={placement:ChartTradingPlacement;gap:number;children:DivElement};
type LocalRef<T>={current:T};
/** Retained native callbacks capture only these clearable refs and fixed geometry state. */
function mountPlacement(elementRef:LocalRef<HTMLDivElement|null>,latest:LocalRef<PlacementProps|null>,scheduleRef:LocalRef<(()=>void)|null>){
  let initial=latest.current;if(!initial)return;const owner=initial.placement.owner,gap=initial.gap;
  let element:HTMLElement|null=elementRef.current,chart:ChartController|null=initial.placement.chart,renderer:object|null=null,frame=0,alive=true,subscribed=false,acquisitionFailed=false,resize:ResizeObserver|null=null;let observed:HTMLElement[]=[];initial=null;
  if(!element)return;const handoff=retiring.get(element);if(handoff)retiring.delete(element);const previous=owners.get(element),state:Owner={baseline:new Map(previous?.baseline??[]),last:new Map(previous?.last??[])},releases:Array<()=>void>=[];
  owners.set(element,state);
  const own=()=>alive&&!!element&&owners.get(element)===state&&elementRef.current===element&&latest.current?.placement.owner===owner&&latest.current.placement.chart===chart;
  const current=()=>own()&&!!chart&&latest.current!.placement.isCurrent()&&own();
  const write=(name:string,value:string,ownerOnly=false)=>{const node=element;if(!node||!(ownerOnly?own():current()))return;if(!state.baseline.has(name))state.baseline.set(name,{value:node.style.getPropertyValue(name),priority:node.style.getPropertyPriority(name)});const last={value,priority:'important'};state.last.set(name,last);if(node.style.getPropertyValue(name)!==value||node.style.getPropertyPriority(name)!==last.priority)node.style.setProperty(name,value,last.priority);};
  // The group sits directly under the series heading (as in the reference) and publishes its height on the chart
  // workspace as --lv-trade-buttons-h, which moves the price-pane legend rows below it. Adding an indicator no longer moves it.
  let offsetHost:HTMLElement|null=null;
  const clearOffset=()=>{try{offsetHost?.style.removeProperty(TRADE_OFFSET_VAR);}catch{/* best effort */}offsetHost=null;};
  // Shown is true while this mount has the group visible. A paint that finds the owner only transiently not
  // current (a background autosave write, a tick between the ref update and its commit) keeps the last placement instead of
  // hiding: hiding also cleared --lv-trade-buttons-h, so the legend rows jumped up under the box and back a frame later.
  let shown=false;
  if(handoff){shown=handoff.shown;offsetHost=handoff.host;}
  const hide=()=>{shown=false;clearOffset();write('visibility','hidden',true);};
  const release=()=>{subscribed=false;resize=null;observed=[];for(const off of releases.splice(0))try{off();}catch{/* Attempt every release; optional placement never changes trading state. */}};
  const stop=()=>{
   if(!alive)return;const clearLatest=latest.current?.placement.owner===owner&&latest.current.placement.chart===chart&&latest.current.gap===gap;alive=false;const node=element,pending=frame;element=null;chart=null;renderer=null;frame=0;
   if(scheduleRef.current===schedule)scheduleRef.current=null;if(clearLatest)latest.current=null;
   const attempt=(run:()=>void)=>{try{run();}catch{/* Retired optional geometry still releases every resource. */}};
   attempt(()=>cancelAnimationFrame(pending));const host=offsetHost;offsetHost=null;
   const restore=()=>{attempt(()=>host?.style.removeProperty(TRADE_OFFSET_VAR));if(node&&owners.get(node)===state){for(const [name,last]of state.last)attempt(()=>{if(owners.get(node)!==state||node.style.getPropertyValue(name)!==last.value||node.style.getPropertyPriority(name)!==last.priority)return;const before=state.baseline.get(name);if(before?.value)node.style.setProperty(name,before.value,before.priority);else node.style.removeProperty(name);});if(owners.get(node)===state)owners.delete(node);}};
   // A still-connected element may be adopted by the next mount in this same commit; otherwise restore on the microtask.
   if(node&&node.isConnected&&owners.get(node)===state){const entry:Retiring={shown,host};retiring.set(node,entry);queueMicrotask(()=>{if(retiring.get(node)!==entry)return;retiring.delete(node);restore();});}else restore();
   release();
  };
  const paint=()=>{
   frame=0;try{
    if(shown&&element&&chart&&own()&&!current())return;
    if(!current()||!element||!chart){hide();return;}acquire();if(!current()||acquisitionFailed||!subscribed||!element||!chart){hide();return;}
    const actual=chart.nativeRenderer();if(!current()||!actual){hide();return;}if(renderer&&actual!==renderer){hide();return;}renderer=actual;
    const parent=element.parentElement,plot=(renderer as {plot?:HTMLElement}).plot;
    if(!parent||!plot||!parent.contains(plot)||!visibleBox(plot,current)||!current()){hide();return;}
    const facts=readPaneLegendFrame(chart,renderer,element,current),layout=facts?paneLegendLayout(facts):null;
    if(!facts||!layout?.heading||!current()){hide();return;}
    const price=facts.panes.find(pane=>pane.id==='price'&&!pane.collapsed&&pane.height>0),heading=parent.querySelector<HTMLElement>(':scope>.chart-heading');
    if(!price||!heading||!current()){hide();return;}
    const origin=parent.getBoundingClientRect();if(!current()){hide();return;}
    const headingBox=visibleBox(heading,current);if(!current()){hide();return;}
    const paneTop=facts.plot.top+price.top,paneBottom=facts.plot.top+Math.min(facts.dataHeight,price.top+price.height);
    let floor=Math.max(paneTop+4,headingBox?.bottom??layout.heading.top+facts.headingHeight);
    if(resize){const targets=[element,parent,plot,heading];if(targets.length!==observed.length||targets.some((node,index)=>observed[index]!==node)){resize.disconnect();observed=targets;for(const node of targets){if(!current())break;resize.observe(node);}}}if(!current()){hide();return;}
    const left=facts.dataLeft+6-origin.left,top=floor+gap-origin.top,width=Math.max(0,facts.dataWidth-12);
    if(!finite(left,top,width,paneBottom,origin.top)||width<=0){hide();return;}
    write('left',left+'px');write('top',top+'px');write('max-width',width+'px');if(!current()||!element){hide();return;}
    const group=element.getBoundingClientRect();if(!current()||!finite(group.height)||group.height<=0||group.bottom>paneBottom+0.5){hide();return;}
    write('visibility','visible');shown=true;
    const offset=Math.round(group.height+gap)+'px';if(parent.style.getPropertyValue(TRADE_OFFSET_VAR)!==offset)parent.style.setProperty(TRADE_OFFSET_VAR,offset);offsetHost=parent;
   }catch{hide();}
  };
  const schedule=()=>{if(own()&&!frame)frame=requestAnimationFrame(paint);};scheduleRef.current=schedule;if(!shown)hide();
  const take=(receiver:unknown,name:string)=>{
   if(!current()||!receiver)return;const subscribe=(receiver as Record<string,unknown>)[name];if(!current())return;if(typeof subscribe!=='function')throw Error('Trading placement subscription unavailable.');
   const off=Reflect.apply(subscribe,receiver,[schedule]);if(typeof off!=='function')throw Error('Trading placement subscription unavailable.');
   if(!current()){try{off();}catch{}release();return;}releases.push(off);
  };
  const acquire=()=>{
   if(subscribed||acquisitionFailed||!current()||!chart)return;subscribed=true;
   try{
    take(chart,'onViewportChanged');if(!current()||!chart){release();return;}
    const indicators=chart.indicators;if(!current()){release();return;}take(indicators,'subscribe');if(!current()||!chart){release();return;}
    take(chart,'onMarketApplied');if(!current()||!chart){release();return;}
    renderer=chart.nativeRenderer();if(!current()||!renderer){release();return;}
    const plot=(renderer as {plot?:HTMLElement}).plot,parent=element?.parentElement;if(!current()||!plot||!parent){release();return;}
    if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(schedule);resize=observer;releases.push(()=>observer.disconnect());}
    if(typeof MutationObserver==='function'){const observer=new MutationObserver(schedule);releases.push(()=>observer.disconnect());observer.observe(parent,{childList:true,subtree:true});}
    if(current()){window.addEventListener('resize',schedule);releases.push(()=>window.removeEventListener('resize',schedule));window.addEventListener('scroll',schedule,true);releases.push(()=>window.removeEventListener('scroll',schedule,true));}
    if(!current())release();
   }catch{acquisitionFailed=true;release();hide();}
  };
  // Place synchronously in the layout effect, before the browser paints. The App owner token changes on every
  // live tick (it follows bars), so this mount is torn down and rebuilt about once a second; deferring the first placement to
  // the next frame showed one frame hidden with the legend rows shifted up, then a frame at React's own top (over the BB and
  // Ichimoku rows). A synchronous paint makes the handoff invisible. Retained listeners still repaint on the next frame.
  paint();
  return stop;
}
export function ChartTradingButtonsPlacement(props:PlacementProps){
 const elementRef=useRef<HTMLDivElement|null>(null),latest=useRef<PlacementProps|null>(props),scheduleRef=useRef<(()=>void)|null>(null);latest.current=props;
 useLayoutEffect(()=>mountPlacement(elementRef,latest,scheduleRef),[props.placement.chart,props.placement.owner,props.gap]);
 useLayoutEffect(()=>{scheduleRef.current?.();});
 return cloneElement(props.children,{ref:elementRef,style:{...props.children.props.style,visibility:'hidden'} as CSSProperties});
}
