import React from 'react';
import {flushSync} from 'react-dom';
import {createRoot,type Root} from 'react-dom/client';
import type {PriceScaleActionId,PriceScaleMenuItem,PriceScaleMenuSeparator,PriceScaleSubmenu} from './price-scale-menu';
import {fitFixedMenu} from '../ui/menu-placement';
import './price-scale-menu-view.css';

export type PriceScaleSubmenuId=PriceScaleSubmenu['id'];
export type PriceScaleMenuOrigin='pointer'|'keyboard';
/** The same view draws the time scale menu (time-scale-port.ts). Rows have the price scale menu shape with
 * that menu's own ids; the defaults keep every price scale use unchanged. */
export type ScaleMenuItem<I extends string>=Omit<PriceScaleMenuItem,'id'>&{id:I};
export interface ScaleMenuSubmenu<I extends string,S extends string>{kind:'submenu';id:S;factId:string;label:string;items:(ScaleMenuItem<I>|PriceScaleMenuSeparator)[];disabled?:string}
export type ScaleMenuEntry<I extends string,S extends string>=ScaleMenuItem<I>|PriceScaleMenuSeparator|ScaleMenuSubmenu<I,S>;
/** Which menu the view draws: its accessible name and the root data attribute the flows select. */
export type ScaleMenuKind='price'|'time';
const MENU_NAMES:Record<ScaleMenuKind,string>={price:'Price scale menu',time:'Time scale menu'};
/** Everything the menu shows; the port owns this state. The view is a pure function of these props. */
export interface PriceScaleMenuViewProps<I extends string=PriceScaleActionId,S extends string=PriceScaleSubmenuId> {
 entries:readonly ScaleMenuEntry<I,S>[];
 /** The click point (viewport coordinates). When given, the measured menu is placed from it (flip up or
  * left when there is no room, else clamp; scroll when taller than the window); left/top stay the first, estimated position. */
 client?:{x:number;y:number};
 /** Default 'price'. */
 kind?:ScaleMenuKind;
 left:number;top:number;
 openSubmenu:S|null;
 /** Key of the focused entry: an action id, or 'submenu:<id>' for a submenu parent. */
 focusKey:string|null;
 status:string;
 onActivate:(id:I,origin:PriceScaleMenuOrigin)=>void;
 onSubmenu:(id:S|null,focusFirst:boolean)=>void;
 onFocusKey:(key:string)=>void;
 onKeyDown:(event:{key:string;preventDefault():void;stopPropagation():void;nativeEvent?:{isComposing?:boolean}})=>void;
}
export const submenuKey=(id:string)=>'submenu:'+id;
const MENU_WIDTH=280,ROW_HEIGHT=32;
const rowAttrs=(focused:boolean,disabled:boolean)=>({className:'lv-scale-menu-row','data-active':focused&&!disabled?'true':undefined});

function Separator({row}:{row:PriceScaleMenuSeparator}){return <div role="separator" data-lv-fact={row.factId} className="lv-scale-menu-sep"/>;}

/** A menu that opens (or flips up) under a pointer that has not moved keeps keyboard focus on its first row. Chromium
 * re-targets a still pointer to the new rows with zero movement; hover moves focus only for pointer events that really move
 * (or after one has moved over the open menu). Rows called without an event (unit tests) act as before. */
const pointerMoved=new WeakSet<Element>();
const movedEvent=(event:React.PointerEvent<HTMLElement>)=>event.movementX!==0||event.movementY!==0;
function trackMenuPointer(event:React.PointerEvent<HTMLElement>){if(movedEvent(event))pointerMoved.add(event.currentTarget);}
function pointerArmed(event?:React.PointerEvent<HTMLElement>):boolean{if(!event||movedEvent(event))return true;const root=event.currentTarget?.closest?.('[data-lv-price-scale-menu],[data-lv-time-scale-menu]');return !root||pointerMoved.has(root);}
/** How far a submenu that would run past the bottom of the window moves up (never above its top margin). A menu opened
 * from the time axis sits at the bottom of the chart, so its long lists (timezones, date formats) open upward and scroll. */
export const SUBMENU_MARGIN_PX=4;
export function submenuShift(rect:{top:number;bottom:number},viewportHeight:number,margin=SUBMENU_MARGIN_PX):number{
 const overflow=rect.bottom-(viewportHeight-margin);if(!(overflow>0))return 0;
 return Math.max(0,Math.min(overflow,rect.top-margin));
}
const SUBMENU_TOP=-6;
function fitSubmenu(node:HTMLDivElement|null){
 if(!node||typeof node.getBoundingClientRect!=='function')return;const height=node.ownerDocument?.defaultView?.innerHeight;if(!height)return;
 node.style.top=SUBMENU_TOP+'px';node.style.maxHeight=Math.max(0,height-2*SUBMENU_MARGIN_PX)+'px';
 const shift=submenuShift(node.getBoundingClientRect(),height);if(shift)node.style.top=(SUBMENU_TOP-shift)+'px';
}


// DOM-node weak keys retain no owner/row/source graph after a menu is removed.
const scalePlacements=new WeakMap<HTMLElement,{x:number;y:number;width:number;height:number;shape:string}>();
const keyboardScrolling=new WeakSet<Element>();
function fitScaleRoot<I extends string,S extends string>(node:HTMLDivElement|null,props:PriceScaleMenuViewProps<I,S>){
 if(!node)return;
 const origin=props.client??{x:props.left,y:props.top},view=node.ownerDocument?.defaultView;
 // Only in-flow labels/hints/status affect root size. Submenu rows and hover
 // checks do not remeasure/reposition their parent under a moving pointer.
 const shape=JSON.stringify([props.entries.map(row=>row.kind==='separator'?['separator']:row.kind==='submenu'?['submenu',row.label]:['item',row.label,row.shortcut??'',row.hint??'']),props.status]);
 const width=view?.innerWidth??0,height=view?.innerHeight??0,prior=scalePlacements.get(node);
 if(prior&&prior.x===origin.x&&prior.y===origin.y&&prior.width===width&&prior.height===height&&prior.shape===shape)return;
 fitFixedMenu(node,origin,{ownFlow:true});scalePlacements.set(node,{x:origin.x,y:origin.y,width,height,shape});
}
/** Scroll only the nearest menu scrollbox; never document/chart ancestors. */
function scrollFocusedMenuRow(target:HTMLElement){
 const scroller=target.closest<HTMLElement>('[role="menu"]');if(!scroller||scroller===target)return;
 const box=scroller.getBoundingClientRect(),row=target.getBoundingClientRect(),top=box.top+scroller.clientTop,left=box.left+scroller.clientLeft,bottom=top+scroller.clientHeight,right=left+scroller.clientWidth;
 if(row.top<top)scroller.scrollTop+=row.top-top;else if(row.bottom>bottom)scroller.scrollTop+=row.bottom-bottom;
 if(row.left<left)scroller.scrollLeft+=row.left-left;else if(row.right>right)scroller.scrollLeft+=row.right-right;
}

function Item<I extends string,S extends string>({row,props}:{row:ScaleMenuItem<I>;props:PriceScaleMenuViewProps<I,S>}){
 const focused=props.focusKey===row.id,disabled=!!row.disabled,checkable=row.role!=='menuitem';
 return <div role={row.role} tabIndex={-1} aria-label={row.label} aria-checked={checkable?!!row.checked:undefined} aria-disabled={disabled||undefined} aria-keyshortcuts={row.shortcut?row.shortcut.replace(/ \+ /g,'+'):undefined} title={row.disabled} data-lv-key={row.id} data-lv-fact={row.factId} {...rowAttrs(focused,disabled)}
  onPointerEnter={event=>{if(!disabled&&pointerArmed(event))props.onFocusKey(row.id);}}
  onPointerMove={event=>{if(!disabled&&!focused&&pointerArmed(event))props.onFocusKey(row.id);}}
  onClick={event=>{event.stopPropagation();if(!disabled)props.onActivate(row.id,'pointer');}}>
  <span aria-hidden="true" className="lv-scale-menu-check">{checkable&&row.checked?'✓':''}</span>
  <span>{row.label}</span>
  {(row.shortcut||row.hint)&&<span aria-hidden="true" className="lv-scale-menu-side">{row.shortcut??row.hint}</span>}
 </div>;
}

function Submenu<I extends string,S extends string>({row,props}:{row:ScaleMenuSubmenu<I,S>;props:PriceScaleMenuViewProps<I,S>}){
 const key=submenuKey(row.id),open=props.openSubmenu===row.id,focused=props.focusKey===key,disabled=!!row.disabled;
 return <div className="lv-scale-menu-sub-host">
  <div role="menuitem" tabIndex={-1} aria-label={row.label} aria-haspopup="menu" aria-expanded={open} aria-disabled={disabled||undefined} title={row.disabled} data-lv-key={key} data-lv-fact={row.factId} {...rowAttrs(focused||open,disabled)}
   onPointerEnter={event=>{if(disabled||!pointerArmed(event))return;props.onFocusKey(key);props.onSubmenu(row.id,false);}}
   onPointerMove={event=>{if(disabled||focused&&open||!pointerArmed(event))return;props.onFocusKey(key);props.onSubmenu(row.id,false);}}
   onClick={event=>{event.stopPropagation();if(!disabled)props.onSubmenu(row.id,false);}}>
   <span aria-hidden="true" className="lv-scale-menu-check"/>
   <span>{row.label}</span>
   <span aria-hidden="true" className="lv-scale-menu-side">›</span>
  </div>
  {open&&<div role="menu" aria-label={row.label} ref={fitSubmenu} className="lv-scale-menu lv-scale-menu-sub">
   {row.items.map((item,index)=>item.kind==='separator'?<Separator key={'s'+index} row={item}/>:<Item key={item.id} row={item} props={props}/>)}
  </div>}
 </div>;
}

/** Price scale context menu: reference order, checkmarks, shortcut hints and disabled reasons. With kind 'time', the time scale menu. */
export function PriceScaleMenuView<I extends string=PriceScaleActionId,S extends string=PriceScaleSubmenuId>(props:PriceScaleMenuViewProps<I,S>){
 const kind=props.kind??'price',root=kind==='time'?{'data-lv-time-scale-menu':'true'}:{'data-lv-price-scale-menu':'true'};
 return <div role="menu" aria-label={MENU_NAMES[kind]} {...root} tabIndex={-1} ref={node=>{fitScaleRoot(node,props);}} className="lv-scale-menu" style={{position:'fixed',left:props.left,top:props.top}}
  onContextMenu={event=>{event.preventDefault();event.stopPropagation();}}
  onPointerMove={trackMenuPointer}
  onWheel={event=>event.stopPropagation()}
  onKeyDown={event=>{const root=event.currentTarget;if(!root){props.onKeyDown(event);return;}keyboardScrolling.add(root);try{props.onKeyDown(event);}finally{keyboardScrolling.delete(root);}}}>
  {props.entries.map((row,index)=>row.kind==='separator'?<Separator key={'s'+index} row={row}/>:row.kind==='submenu'?<Submenu key={row.id} row={row} props={props}/>:<Item key={row.id} row={row} props={props}/>)}
  {props.status&&<div role="status" className="lv-scale-menu-status">{props.status}</div>}
 </div>;
}

/** Keeps the menu inside the viewport (approximate height from the row count). */
export function placePriceScaleMenu(client:{x:number;y:number},viewport:{width:number;height:number},rows:number):{left:number;top:number}{
 const height=rows*ROW_HEIGHT+12;
 return{left:Math.max(0,Math.min(client.x,viewport.width-MENU_WIDTH-4)),top:Math.max(0,Math.min(client.y,viewport.height-height-4))};
}

export interface PriceScaleMenuMount<I extends string=PriceScaleActionId,S extends string=PriceScaleSubmenuId> {/** null removes the menu. */render(props:PriceScaleMenuViewProps<I,S>|null):void;focus(key:string|null):void;contains(target:EventTarget|null):boolean;dispose():void}
/** Mounts the view in its own root inside the chart host, so pointer input stays inside the chart cell. */
export function mountPriceScaleMenu(host:HTMLElement):PriceScaleMenuMount{return mountScaleMenu(host,'price');}
/** The time scale menu mounts the same view; its host node is marked for the time menu. */
export function mountScaleMenu<I extends string,S extends string>(host:HTMLElement,kind:ScaleMenuKind):PriceScaleMenuMount<I,S>{
 const node=host.ownerDocument.createElement('div');if(kind==='time')node.dataset.lvTimeScaleMenuHost='true';else node.dataset.lvPriceScaleMenuHost='true';host.appendChild(node);
 let root:Root|null=createRoot(node);
 return{
  render(props){if(!root)return;const owned=root;flushSync(()=>owned.render(props?<PriceScaleMenuView<I,S> {...props} kind={kind}/>:null));},
  // A focused row in a long (scrolling) submenu is scrolled into view inside that submenu.
  focus(key){if(!key)return;const target=[...node.querySelectorAll<HTMLElement>('[data-lv-key]')].find(element=>element.dataset.lvKey===key);target?.focus({preventScroll:true});const menu=target?.closest('[data-lv-price-scale-menu],[data-lv-time-scale-menu]');if(target&&menu&&keyboardScrolling.has(menu))scrollFocusedMenuRow(target);},
  contains(target){return target instanceof Node&&node.contains(target);},
  dispose(){const owned=root;root=null;if(!owned)return;queueMicrotask(()=>{try{owned.unmount();}finally{node.remove();}});},
 };
}
