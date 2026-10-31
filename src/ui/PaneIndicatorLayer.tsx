import React,{useEffect,useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import type {ChartController} from '../chart/adapter';
import {fitAnchoredMenu} from './menu-placement';
import {paneLegendLayout,samePaneLegendLayout,type PaneLegendFrame,type PaneLegendLayout} from './pane-legend-layout';

type NativePane={id:string;bounds:{top:number;height:number};collapsed?:boolean};
type NativePaneRenderer={plot:HTMLElement;input:{el:HTMLElement};coords:{width:number;height:number};scene:{orderedPanes():NativePane[]}};
/** Only small presentation geometry is read. The caller supplies current owner authority independently of these facts. */
export function readPaneLegendFrame(chart:Pick<ChartController,'nativeRenderer'>,renderer:object,host:HTMLElement,isCurrent:()=>boolean):PaneLegendFrame|null{
 const owns=()=>isCurrent()&&chart.nativeRenderer()===renderer&&isCurrent();
 if(!owns())return null;
 const native=renderer as NativePaneRenderer,workspace=host.parentElement;
 if(!workspace||!native.plot?.getBoundingClientRect||!native.input?.el?.getBoundingClientRect||!native.scene?.orderedPanes||!native.coords)return null;
 const origin=host.getBoundingClientRect();if(!owns())return null;
 const plot=native.plot.getBoundingClientRect();if(!owns())return null;
 const input=native.input.el.getBoundingClientRect();if(!owns())return null;
 const dataWidth=native.coords.width,dataHeight=native.coords.height;if(!owns())return null;
 const heading=workspace.querySelector<HTMLElement>(':scope>.chart-heading');
 const headingHeight=heading?.getBoundingClientRect().height??0;if(!owns())return null;
 const ordered=native.scene.orderedPanes();if(!owns()||!Array.isArray(ordered))return null;
 const panes=ordered.map(pane=>({id:pane.id,top:pane.bounds.top,height:pane.bounds.height,collapsed:pane.collapsed===true}));
 return owns()?{origin,plot,dataLeft:input.left,dataWidth,dataHeight,headingHeight,panes}:null;
}

type LayerProps={chart:ChartController|null;ownerKey:string;isCurrent:()=>boolean;host:RefObject<HTMLDivElement|null>;onPriceBottom:(bottom:number)=>void};
const owners=new WeakMap<HTMLElement,object>();
/** Absolute stacks never participate in chart sizing. Native resize handles remain the sole pane-size authority. */
export function PaneIndicatorLayer(props:LayerProps){
 const latest=useRef(props),scheduleRef=useRef<(()=>void)|null>(null);latest.current=props;
 // A legend host that mounts while its owner is transiently not current (an Undo/Redo or history restore
 // holds the workspace transaction while the restored study's legend first renders) retries setup on the next frame
 // instead of staying unpositioned (display:none) until an unrelated owner change.
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const {chart,ownerKey,host}=props,element=host.current;if(!chart||!element)return;
  const retryLater=()=>{const handle=requestAnimationFrame(()=>{if(latest.current.chart===chart&&latest.current.ownerKey===ownerKey&&latest.current.host.current===element)setAttempt(value=>value+1);});return()=>cancelAnimationFrame(handle);};
  if(!props.isCurrent())return retryLater();
  const token={},workspace=element.parentElement;if(!workspace)return;
  let alive=true,frame=0,layout:PaneLegendLayout|null=null,lastBottom:number|null=null;
  // Geometry reads (getBoundingClientRect) force a layout. Pointer moves and viewport changes repaint only when the
  // renderer's own pane geometry, data size or legend structure changed; size observers, structure, indicator and render
  // triggers always re-measure ("dirty"), exactly as before.
  let dirty=true,lastShape='';
  const current=()=>alive&&latest.current.chart===chart&&latest.current.ownerKey===ownerKey&&latest.current.host.current===element&&latest.current.isCurrent();
  if(!current())return retryLater();const renderer=chart.nativeRenderer();if(!renderer||!current())return retryLater();
  const native=renderer as NativePaneRenderer,plot=native.plot;if(!plot||!current())return retryLater();
  const ownedStyles=new Map<HTMLElement,Map<string,{before:string;value:string}>>();
  owners.set(element,token);
  const write=(node:HTMLElement,name:string,value:string)=>{if(!current()||owners.get(element)!==token)return;let entries=ownedStyles.get(node);if(!entries){entries=new Map();ownedStyles.set(node,entries);}const old=entries.get(name);if(!old)entries.set(name,{before:node.style.getPropertyValue(name),value});else old.value=value;if(node.style.getPropertyValue(name)!==value)node.style.setProperty(name,value);};
  const bottom=()=>{if(!current()||chart.nativeRenderer()!==renderer||!current())return;const price=element.querySelector<HTMLElement>('.lv-legend-price-scroll');if(!price)return;const box=price.getBoundingClientRect();if(!current())return;const base=workspace.getBoundingClientRect();const value=box.height>0?Math.max(0,box.bottom-base.top):0;if(current()&&lastBottom!==value){lastBottom=value;latest.current.onPriceBottom(value);}};
  const shape=()=>{const panes=native.scene?.orderedPanes?.(),nodes=element.querySelectorAll<HTMLElement>(':scope>.lv-legend-pane');let key=(native.coords?.width??'')+'x'+(native.coords?.height??'')+'|'+nodes.length;if(Array.isArray(panes))for(const pane of panes)key+='|'+pane.id+':'+pane.bounds?.top+':'+pane.bounds?.height+':'+(pane.collapsed===true);for(const node of nodes)key+='|'+(node.dataset.legendPane??'');return key;};
  const paint=()=>{
   frame=0;if(!current())return;
   const nextShape=shape();if(!dirty&&nextShape===lastShape)return;
   const facts=readPaneLegendFrame(chart,renderer,element,current),next=facts?paneLegendLayout(facts):null;
   if(!next||!current())return;
   {
    const boxes=new Map(next.panes.map(pane=>[pane.id,pane]));
    for(const node of element.querySelectorAll<HTMLElement>(':scope>.lv-legend-pane')){
     const box=boxes.get(node.dataset.legendPane??'');
     const price=node.dataset.legendPane==='price';write(node,'display',price||box&&box.width>0&&box.maxHeight>0?'flex':'none');
     if(!box){if(price)write(node,'max-height','0px');continue;}write(node,'left',box.left+'px');write(node,'top',box.top+'px');write(node,'max-width',box.width+'px');write(node,'max-height',box.maxHeight+'px');
    }
    if(!samePaneLegendLayout(layout,next)){
     const lines=element.querySelector<HTMLElement>(':scope>.lv-pane-legend-separators');
     if(lines){
      write(lines,'background-image',next.separators.map(()=>`linear-gradient(to bottom, var(--lv-divider) 0 1px, transparent 1px 4px, var(--lv-divider) 4px 5px)`).join(',')||'none');
      write(lines,'background-position',next.separators.map(box=>box.left+'px '+box.top+'px').join(',')||'0 0');
      write(lines,'background-size',next.separators.map(box=>box.width+'px '+box.height+'px').join(',')||'0 0');
     }
    }
    write(workspace,'--lv-pane-heading-visibility',next.heading?'visible':'hidden');
    if(next.heading){
     const origin=workspace.getBoundingClientRect();if(!current())return;
     write(workspace,'--lv-pane-heading-top',(next.heading.top-origin.top)+'px');write(workspace,'--lv-pane-heading-left',(next.heading.left-origin.left)+'px');
     write(workspace,'--lv-pane-menu-top',(next.heading.top-origin.top+(facts?.headingHeight??0)+2)+'px');write(workspace,'--lv-pane-menu-left',(next.heading.left-origin.left)+'px');
     write(workspace,'--lv-pane-heading-width',Math.max(0,(facts?.dataWidth??0)-12)+'px');
    }
    if(current()&&workspace.getAttribute('data-pane-legend-ready')!=='true')workspace.setAttribute('data-pane-legend-ready','true');layout=next;dirty=false;lastShape=nextShape;
   }
   bottom();
  };
  const reshape=()=>{if(current()&&!frame)frame=requestAnimationFrame(paint);},schedule=()=>{dirty=true;reshape();};scheduleRef.current=schedule;
  // Crosshair readouts only replace text inside legend rows; such records never move a legend box.
  const structural=(records:MutationRecord[])=>records.some(record=>record.type!=='childList'||!record.addedNodes||!record.removedNodes||[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType!==3));
  // Child-owned study rows can commit without rerendering this direct App layer.
  // Observe only placement/structure; our style writes and scalar text cannot loop.
  let mutation:MutationObserver|null=null,resize:ResizeObserver|null=null;
  const unsubs:Array<()=>void>=[],setupReleases:Array<()=>void>=[];
  try{
   if(typeof MutationObserver==='function'){
    const observer=new MutationObserver(records=>{if(structural(records))schedule();});mutation=observer;setupReleases.push(()=>observer.disconnect());
    observer.observe(element,{childList:true,subtree:true,attributes:true,attributeFilter:['data-legend-pane']});
   }
   const viewport=chart.onViewportChanged(reshape);unsubs.push(viewport);setupReleases.push(viewport);
   const indicators=chart.indicators.subscribe(schedule);unsubs.push(indicators);setupReleases.push(indicators);
   for(const event of ['pointermove','pointerup','lostpointercapture']){plot.addEventListener(event,reshape);setupReleases.push(()=>plot.removeEventListener(event,reshape));}
   if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(schedule);resize=observer;setupReleases.push(()=>observer.disconnect());}
   for(const node of [plot,workspace,workspace.querySelector<HTMLElement>(':scope>.chart-heading'),element.querySelector<HTMLElement>('.lv-legend-price-scroll')])if(node)resize?.observe(node);
   window.addEventListener('resize',schedule);setupReleases.push(()=>window.removeEventListener('resize',schedule));
   window.addEventListener('scroll',schedule,true);setupReleases.push(()=>window.removeEventListener('scroll',schedule,true));schedule();
  }catch(cause){
   // Retire before calling acquired releases: a release can reenter or throw.
   alive=false;if(scheduleRef.current===schedule)scheduleRef.current=null;
   if(owners.get(element)===token)owners.delete(element);
   const failures:unknown[]=[],attempt=(release:()=>void)=>{try{release();}catch(error){failures.push(error);}};
   attempt(()=>cancelAnimationFrame(frame));frame=0;
   for(const release of setupReleases.reverse())attempt(release);
   if(failures.length)throw new AggregateError([cause,...failures],'Pane legend setup and cleanup failed.');
   throw cause;
  }
  return()=>{
   alive=false;cancelAnimationFrame(frame);if(scheduleRef.current===schedule)scheduleRef.current=null;
   mutation?.disconnect();unsubs.forEach(unsubscribe=>unsubscribe());resize?.disconnect();plot.removeEventListener('pointermove',reshape);plot.removeEventListener('pointerup',reshape);plot.removeEventListener('lostpointercapture',reshape);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);
   if(owners.get(element)!==token)return;owners.delete(element);
   for(const [node,entries] of ownedStyles)for(const [name,entry] of entries)if(node.style.getPropertyValue(name)===entry.value){if(entry.before)node.style.setProperty(name,entry.before);else node.style.removeProperty(name);}
   workspace.removeAttribute('data-pane-legend-ready');
  };
 },[props.chart,props.ownerKey,props.host,attempt]);
 // Row changes, move, Undo/Redo and restore are observed even when their counts are unchanged.
 useLayoutEffect(()=>{scheduleRef.current?.();});
 return null;
}

function menuAnchorVisible(row:HTMLElement):boolean{
 if(!row.isConnected)return false;const box=row.getBoundingClientRect();let left=box.left,right=box.right,top=box.top,bottom=box.bottom;
 if(right<=left||bottom<=top)return false;
 for(let node:HTMLElement|null=row;node;node=node.parentElement){const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;
  const x=/^(auto|scroll|hidden|clip)$/.test(style.overflowX),y=/^(auto|scroll|hidden|clip)$/.test(style.overflowY);if(!x&&!y)continue;
  const rect=node.getBoundingClientRect(),sx=node.offsetWidth>0?rect.width/node.offsetWidth:1,sy=node.offsetHeight>0?rect.height/node.offsetHeight:1;
  if(x){left=Math.max(left,rect.left+node.clientLeft*sx);right=Math.min(right,rect.left+(node.clientLeft+node.clientWidth)*sx);}
  if(y){top=Math.max(top,rect.top+node.clientTop*sy);bottom=Math.min(bottom,rect.top+(node.clientTop+node.clientHeight)*sy);}
  if(right<=left||bottom<=top)return false;
 }
 return true;
}

/** The real menu escapes each pane's scroll viewport while retaining the existing anchored-menu positioning rules. */
export function PaneLegendMenu({children,isCurrent}:{children:ReactNode;isCurrent:()=>boolean}){
 const marker=useRef<HTMLSpanElement|null>(null),popup=useRef<HTMLDivElement|null>(null),latest=useRef(isCurrent),scheduleRef=useRef<(()=>void)|null>(null);latest.current=isCurrent;
 useLayoutEffect(()=>{
  const row=marker.current?.parentElement,anchor=popup.current;if(!row||!anchor)return;let alive=true,frame=0,focused=false;
  const document=row.ownerDocument,active=document.activeElement,opener=row.contains(active)?active as HTMLElement:null;
  const update=()=>{
   frame=0;if(!alive||!latest.current()||!row.isConnected){anchor.style.visibility='hidden';return;}
   if(!menuAnchorVisible(row)){anchor.style.visibility='hidden';frame=requestAnimationFrame(update);return;}
   const box=row.getBoundingClientRect();if(!alive||!latest.current()){anchor.style.visibility='hidden';return;}
   Object.assign(anchor.style,{visibility:'visible',left:box.left+'px',top:box.top+'px',width:box.width+'px',height:box.height+'px'});
   const menu=anchor.firstElementChild as HTMLElement|null;fitAnchoredMenu(menu,'below');menu?.querySelectorAll<HTMLElement>(':scope>.lv-legend-menu-entry>.lv-legend-submenu').forEach(node=>fitAnchoredMenu(node,'right'));
   if(!focused){focused=true;const active=document.activeElement;if(active===opener||active===document.body){const item=[...anchor.querySelectorAll<HTMLElement>('[role^=menuitem]')].find(node=>!(node as HTMLButtonElement).disabled&&node.getAttribute('aria-disabled')!=='true'&&node.getClientRects().length>0);item?.focus({preventScroll:true});}}
   if(alive&&latest.current())frame=requestAnimationFrame(update);
  };
  const schedule=()=>{if(alive&&latest.current()&&!frame)frame=requestAnimationFrame(update);};
  scheduleRef.current=schedule;update();window.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;resize?.observe(row);
  return()=>{alive=false;cancelAnimationFrame(frame);if(scheduleRef.current===schedule)scheduleRef.current=null;resize?.disconnect();window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);const active=document.activeElement;if(active&&anchor.contains(active)&&!active.matches('input,textarea,select')&&!active.closest('[role=dialog],[aria-modal=true]')&&latest.current()&&opener?.isConnected&&menuAnchorVisible(row))opener.focus({preventScroll:true});};
 // One opening owns focus. Fresh children update geometry/handlers without closing and reopening focus.
 },[]);
 useLayoutEffect(()=>{scheduleRef.current?.();});
 const guard=(event:React.SyntheticEvent)=>{const row=marker.current?.parentElement;if(!latest.current()||!row||!menuAnchorVisible(row)){event.preventDefault();event.stopPropagation();if(popup.current)popup.current.style.visibility='hidden';}};
 return <><span ref={marker} aria-hidden="true" className="lv-pane-menu-marker"/>{typeof document!=='undefined'&&document.body?createPortal(<div ref={popup} className="lv-pane-menu-anchor" onClickCapture={guard} onPointerDownCapture={guard} onKeyDownCapture={guard}>{children}</div>,document.body):null}</>;
}
