import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {BulkColorMenu} from './multi-selection-bar';
import {LV_ICONS,type LvIconId} from './icons';
import {clampBarPosition,clearBarPosition,navStripInPane,placeBarInPane,placeBarNearDrawing,readBarPosition,writeBarPosition,type BarPosition,type DrawingBox} from './drawing-edit-bar-position';
import {markPressThrough} from './drawing-edit-bar-press';
import {fitAnchoredMenu} from './menu-placement';
/** The floating toolbar shown over the chart for the selected drawing: icon buttons with tooltips for Template, line color, background color
 * (when the drawing has one), text color, line width, line style, font size, Sync, Settings, Lock / unlock, Delete and a More menu (Clone,
 * Copy, Visual order, Visibility on intervals, Hide, Object tree).
 * The pinned renderer's own selection popup listens for `pointerdown` on the document (bubble phase,
 * @luxalgo/vela 0.8.4 dist/chunk-UNUVPQFW.js:16172 and the onOutside handler at :15953) and treats any press outside
 * its own chrome as a dismissal that clears the drawing selection (onPopupDismissed, :17055). The App bar mirrors that
 * selection, so a press on one of its buttons cleared the selection and unmounted the bar before the click arrived:
 * no dialog opened and nothing was deleted. A press inside this bar belongs to the selection, so it stops at the bar.
 * Capture-phase outside-dismiss listeners (menus, flyouts) still see it. */
export interface DrawingEditProperty{id:'lineColor'|'backgroundColor'|'textColor'|'lineWidth'|'lineStyle'|'fontSize';path:string;title:string;options?:readonly(number|string)[]}
export interface DrawingEditProperties{buttons:readonly DrawingEditProperty[];/** Current value at a property path. */read:(path:string)=>unknown;apply:(path:string,value:unknown)=>void}
/** The Template button. */
export interface DrawingEditTemplates{
 /** Saved templates of this drawing's tool. */
 list:readonly {id:string;name:string}[];
 onApply:(id:string)=>void;
 onSave:(name:string)=>void;
 /** The tool's factory settings on this drawing. */
 onApplyDefault?:()=>void;
 /** New drawings of this tool start with this drawing's settings. */
 onSaveDefault?:()=>void;
 onRemove?:(id:string)=>void;
}
export type DrawingSyncScope='layout'|'global';
/** The drawing's sync scope (static-drawing-toolbar#utility.sync wording). Without onChange the rows only show the state. */
export interface DrawingEditSync{scope:DrawingSyncScope|null;onChange?:(scope:DrawingSyncScope|null)=>void}
export interface DrawingOrderDisabled{front:boolean;forward:boolean;backward:boolean;back:boolean}
export interface DrawingEditBarProps{onSettings:()=>void;onLock:()=>void;onDuplicate:()=>void;onDelete:()=>void;/** Type-specific controls shown first (the Bars pattern source-resolution chip; renders nothing for other types). */extra?:React.ReactNode;
 locked?:boolean;onHide?:()=>void;onFront?:()=>void;onBack?:()=>void;properties?:DrawingEditProperties;/** Add alert on this drawing (shown only when given). */onAlert?:()=>void;/** Starting place of the bar; the user can drag it and the place is remembered. */position?:BarPosition;/** Where the drawing is on screen; with no position given the bar opens beside it. box is in pane pixels; origin is the
 pane's top left in client pixels, so the bar is placed in that pane (any grid cell) clear of its legend and price scale. */near?:{box:DrawingBox;viewport:{width:number;height:number};origin?:{left:number;top:number}};
 /** More menu rows (each shown only when given). */
 onCopy?:()=>void;onForward?:()=>void;onBackward?:()=>void;onVisibility?:()=>void;onObjectTree?:()=>void;orderDisabled?:DrawingOrderDisabled;
 /** More > Move to rows; absent when there is no pane on that side. */
 onMoveAbove?:()=>void;onMoveBelow?:()=>void;
 templates?:DrawingEditTemplates;sync?:DrawingEditSync}
const icon=(id:LvIconId,fallback:string):React.ReactNode=>{if(Object.hasOwn(LV_ICONS,id)){const Icon=LV_ICONS[id].Icon;return <Icon/>;}return fallback;};
const cap=(text:string)=>text.charAt(0).toUpperCase()+text.slice(1);
const GLYPH:Record<DrawingEditProperty['id'],string>={lineColor:'A',backgroundColor:'▧',textColor:'T',lineWidth:'≡',lineStyle:'┄',fontSize:'Aa'};
const TIP:Record<DrawingEditProperty['id'],string>={lineColor:'Line color',backgroundColor:'Background color',textColor:'Text color',lineWidth:'Line width',lineStyle:'Line style',fontSize:'Font size'};
const COLOR_IDS:ReadonlySet<DrawingEditProperty['id']>=new Set(['lineColor','backgroundColor','textColor']);
/** Closes an open menu on a press outside its slot or on Escape. */
function useMenuDismiss(open:boolean,close:()=>void){
 const root=useRef<HTMLSpanElement>(null);
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))close();};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true);},[open]);
 return root;
}
export function PropertySlot({property,properties}:{property:DrawingEditProperty;properties:DrawingEditProperties}):React.ReactElement{
 const [open,setOpen]=useState(false),root=useMenuDismiss(open,()=>setOpen(false)),tip=TIP[property.id],raw=properties.read(property.path);
 const color=COLOR_IDS.has(property.id);
 const pick=(value:unknown,keepOpen=false)=>{if(!keepOpen)setOpen(false);properties.apply(property.path,value);};
 return <span className="drawing-edit-slot" ref={root} onKeyDown={event=>{if(event.key==='Escape'&&open){event.stopPropagation();setOpen(false);}}}>
  <button type="button" className="drawing-edit-icon" aria-label={tip} title={tip} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(!open)}>
   {color&&typeof raw==='string'?<span className="multi-selection-swatch" style={{background:raw}}/>:GLYPH[property.id]}
  </button>
  {open&&color&&<BulkColorMenu title={tip} fieldKey={property.path} onPick={value=>{pick(value,true);return true;}}/>}
  {open&&!color&&<div className="multi-selection-menu" role="menu" aria-label={tip}>{(property.options??[]).map(option=>{const label=property.id==='lineStyle'||property.id==='fontSize'?cap(String(option)):String(option);return <button type="button" role="menuitem" key={String(option)} aria-label={label} title={label} aria-checked={option===raw} onClick={()=>pick(option)}>{label}</button>;})}</div>}
 </span>;
}
/** The Template button. Save opens a name field inside the menu; the menu stays a plain list of actions. */
export function TemplateSlot({templates}:{templates:DrawingEditTemplates}):React.ReactElement{
 const [open,setOpen]=useState(false),[name,setName]=useState<string|null>(null),root=useMenuDismiss(open,()=>{setOpen(false);setName(null);});
 const done=()=>{setOpen(false);setName(null);};
 const run=(action:()=>void)=>{done();action();};
 return <span className="drawing-edit-slot" ref={root} onKeyDown={event=>{if(event.key==='Escape'&&open){event.stopPropagation();done();}}}>
  <button type="button" className="drawing-edit-icon" aria-label="Template" title="Template" aria-haspopup="menu" aria-expanded={open} onClick={()=>{if(open)done();else setOpen(true);}}>{icon('indicator-templates','⧉')}</button>
  {open&&<div className="multi-selection-menu drawing-edit-more" role="menu" aria-label="Template">
   {name===null?<button type="button" role="menuitem" aria-label="Save drawing template as" onClick={()=>setName('')}>Save drawing template as…</button>
    :<span className="drawing-template-save"><input aria-label="Template name" placeholder="Template name" value={name} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&name.trim()){event.preventDefault();const chosen=name.trim();run(()=>templates.onSave(chosen));}}}/><button type="button" disabled={!name.trim()} onClick={()=>{const chosen=name.trim();if(chosen)run(()=>templates.onSave(chosen));}}>Save</button><button type="button" onClick={()=>setName(null)}>Cancel</button></span>}
   {templates.onApplyDefault&&<button type="button" role="menuitem" aria-label="Apply default drawing template" onClick={()=>run(templates.onApplyDefault!)}>Apply default drawing template</button>}
   {templates.onSaveDefault&&<button type="button" role="menuitem" aria-label="Save as default" title="New drawings of this tool start with these settings." onClick={()=>run(templates.onSaveDefault!)}>Save as default</button>}
   {templates.list.length>0&&<hr/>}
   {templates.list.map(template=><span key={template.id} className="drawing-template-row"><button type="button" role="menuitem" aria-label={'Apply template '+template.name} onClick={()=>run(()=>templates.onApply(template.id))}>{template.name}</button>{templates.onRemove&&<button type="button" className="drawing-edit-icon" aria-label={'Remove template '+template.name} title="Remove template" onClick={()=>run(()=>templates.onRemove!(template.id))}>{'×'}</button>}</span>)}
  </div>}
 </span>;
}
/** static-drawing-toolbar#utility.sync menu wording, worded for one placed drawing. */
export const SYNC_ROWS:readonly {scope:DrawingSyncScope|null;label:string}[]=Object.freeze([{scope:null,label:'Not synced'},{scope:'layout',label:'Sync in layout'},{scope:'global',label:'Sync globally'}]);
export const SYNC_TITLES:Readonly<Record<'off'|DrawingSyncScope,string>>=Object.freeze({off:'Not synced',layout:'Synced in layout: shown on every chart of this layout with the same symbol',global:'Synced globally: shown on every chart in every layout with the same symbol'});
export const SYNC_CHANGE_UNAVAILABLE='A placed drawing keeps the sync it was drawn with. New drawings follow Sync drawings on the left toolbar.';
/** The Sync button shows the drawing's sync scope; the rows change it when the host can. */
export function SyncSlot({sync}:{sync:DrawingEditSync}):React.ReactElement{
 const [open,setOpen]=useState(false),root=useMenuDismiss(open,()=>setOpen(false)),title=SYNC_TITLES[sync.scope??'off'];
 return <span className="drawing-edit-slot" ref={root} onKeyDown={event=>{if(event.key==='Escape'&&open){event.stopPropagation();setOpen(false);}}}>
  <button type="button" className="drawing-edit-icon" aria-label="Sync" title={title} aria-pressed={sync.scope!==null} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(!open)}>{icon('sync-drawings','⇄')}</button>
  {open&&<div className="multi-selection-menu" role="menu" aria-label="Sync">
   {SYNC_ROWS.map(row=><button type="button" role="menuitemradio" key={row.label} aria-label={row.label} aria-checked={row.scope===sync.scope} disabled={!sync.onChange} title={sync.onChange?undefined:SYNC_CHANGE_UNAVAILABLE} onClick={()=>{setOpen(false);if(row.scope!==sync.scope)sync.onChange?.(row.scope);}}>{row.label}</button>)}
   {!sync.onChange&&<small role="note">{SYNC_CHANGE_UNAVAILABLE}</small>}
  </div>}
 </span>;
}
type MoreProps=Pick<DrawingEditBarProps,'onDuplicate'|'onHide'|'onFront'|'onBack'|'onCopy'|'onForward'|'onBackward'|'onVisibility'|'onObjectTree'|'orderDisabled'|'onMoveAbove'|'onMoveBelow'>;
/** More menu rows in the usual drawing menu order (Clone and Copy, then Visual order and Visibility on intervals, then Hide and
 * Object tree). A row without a handler is left out. */
export function MoreSlot({onDuplicate,onHide,onFront,onBack,onCopy,onForward,onBackward,onVisibility,onObjectTree,orderDisabled,onMoveAbove,onMoveBelow}:MoreProps):React.ReactElement{
 const [open,setOpen]=useState(false),[orderOpen,setOrderOpen]=useState(false),[moveOpen,setMoveOpen]=useState(false),root=useMenuDismiss(open,()=>{setOpen(false);setOrderOpen(false);setMoveOpen(false);});
 const item=(label:string,run:(()=>void)|undefined,name=label,disabled=false)=>run?<button type="button" role="menuitem" key={name} aria-label={name} disabled={disabled} onClick={()=>{setOpen(false);setOrderOpen(false);setMoveOpen(false);run();}}>{label}</button>:null;
 const move=[item('Existing pane above',onMoveAbove),item('Existing pane below',onMoveBelow)].filter(Boolean);
 const order=[item('Bring to front',onFront,undefined,orderDisabled?.front),item('Bring forward',onForward,undefined,orderDisabled?.forward),item('Send backward',onBackward,undefined,orderDisabled?.backward),item('Send to back',onBack,undefined,orderDisabled?.back)].filter(Boolean);
 return <span className="drawing-edit-slot" ref={root} onKeyDown={event=>{if(event.key==='Escape'&&open){event.stopPropagation();setOpen(false);}}}>
  <button type="button" className="drawing-edit-icon" aria-label="More" title="More" aria-haspopup="menu" aria-expanded={open} onClick={()=>{setOpen(!open);setOrderOpen(false);}}>{icon('more-horizontal','…')}</button>
  {open&&<div className="multi-selection-menu drawing-edit-more" role="menu" aria-label="More">
   {item('Clone',onDuplicate,'Duplicate')}{item('Copy',onCopy)}
   {/* Visual order is a submenu row (hover or click opens it beside the menu), as the reference drawing menu. */}
   {order.length>0&&<div className="drawing-edit-submenu" onMouseEnter={()=>setOrderOpen(true)} onMouseLeave={()=>setOrderOpen(false)}>
    <button type="button" role="menuitem" aria-label="Visual order" aria-haspopup="menu" aria-expanded={orderOpen} onClick={()=>setOrderOpen(!orderOpen)} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'||event.key==='Enter'){event.preventDefault();setOrderOpen(true);}}}><span>Visual order</span><span aria-hidden="true">›</span></button>
    {/* Opens to the right like its chevron; fitAnchoredMenu flips it left only when the right has no room. */}
    {orderOpen&&<div ref={node=>{fitAnchoredMenu(node,'right');}} className="multi-selection-menu drawing-edit-more drawing-edit-submenu-list" role="menu" aria-label="Visual order">{order}</div>}
   </div>}
   {move.length>0&&<div className="drawing-edit-submenu" onMouseEnter={()=>setMoveOpen(true)} onMouseLeave={()=>setMoveOpen(false)}>
    <button type="button" role="menuitem" aria-label="Move to" aria-haspopup="menu" aria-expanded={moveOpen} onClick={()=>setMoveOpen(!moveOpen)} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'||event.key==='Enter'){event.preventDefault();setMoveOpen(true);}}}><span>Move to</span><span aria-hidden="true">›</span></button>
    {moveOpen&&<div ref={node=>{fitAnchoredMenu(node,'right');}} className="multi-selection-menu drawing-edit-more drawing-edit-submenu-list" role="menu" aria-label="Move to">{move}</div>}
   </div>}
   {item('Visibility on intervals…',onVisibility,'Visibility on intervals')}
   {item('Hide',onHide)}
   {item('Object tree…',onObjectTree,'Object tree')}
  </div>}
 </span>;
}
/** Drag handle. It moves its parent bar directly (no state) so the bar itself stays a plain function; the place is saved on release. */
export function BarHandle():React.ReactElement{
 const ref=useRef<HTMLButtonElement>(null),drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
 const storage=():Storage|null=>{try{return window.localStorage;}catch{return null;}};
 const place=(position:BarPosition):BarPosition|null=>{
  const bar=ref.current?.parentElement as HTMLElement|null;if(!bar)return null;const host=bar.offsetParent as HTMLElement|null;
  const next=clampBarPosition(position,{width:bar.offsetWidth,height:bar.offsetHeight},{width:host?.clientWidth||window.innerWidth,height:host?.clientHeight||window.innerHeight});
  bar.style.left=next.left+'px';bar.style.top=next.top+'px';bar.style.right='auto';return next;
 };
 useEffect(()=>{const saved=readBarPosition(storage());if(saved)place(saved);},[]);
 // L2b: a smaller window keeps the bar reachable instead of leaving it past the edge.
 useEffect(()=>{const keep=()=>{const bar=ref.current?.parentElement as HTMLElement|null;if(bar)place({left:bar.offsetLeft,top:bar.offsetTop});};window.addEventListener('resize',keep);return()=>window.removeEventListener('resize',keep);},[]);
 const here=():BarPosition=>{const bar=ref.current?.parentElement as HTMLElement|null;return{left:bar?.offsetLeft??0,top:bar?.offsetTop??0};};
 return <button type="button" ref={ref} className="drawing-edit-icon drawing-edit-handle" aria-label="Move drawing toolbar" title="Drag to move. Double-click to reset its place."
  onDoubleClick={()=>{clearBarPosition(storage());const bar=ref.current?.parentElement as HTMLElement|null;if(bar){bar.style.left='';bar.style.top='';bar.style.right='';}}}
  onPointerDown={event=>{const at=here();drag.current={x:event.clientX,y:event.clientY,...at};try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* Capture is optional. */}}}
  onPointerMove={event=>{const start=drag.current;if(start)place({left:start.left+event.clientX-start.x,top:start.top+event.clientY-start.y});}}
  onPointerUp={()=>{if(!drag.current)return;drag.current=null;writeBarPosition(storage(),here());}}
  onKeyDown={event=>{const step=event.shiftKey?40:10,move={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[event.key as string];if(!move)return;event.preventDefault();const at=here(),next=place({left:at.left+move[0],top:at.top+move[1]});if(next)writeBarPosition(storage(),next);}}>{'⠇'}</button>;
}
/** Places its parent bar inside the drawing's pane (pane pixels to the bar's offset parent), measured, clear of the
 * legend band and the price scale. Like BarHandle it moves the bar directly, so the bar itself stays a plain function. A place the
 * user dragged to (remembered) still wins. */
export function BarNearPlacement({near}:{near:{box:DrawingBox;viewport:{width:number;height:number};origin:{left:number;top:number}}}):React.ReactElement{
 const ref=useRef<HTMLSpanElement>(null),key=JSON.stringify(near);
 useLayoutEffect(()=>{
  const bar=ref.current?.parentElement as HTMLElement|null,parent=bar?.offsetParent as HTMLElement|null|undefined;if(!bar||!parent)return;
  let saved:BarPosition|null=null;try{saved=readBarPosition(window.localStorage);}catch{saved=null;}if(saved)return;
  const size={width:bar.offsetWidth,height:bar.offsetHeight},rect=parent.getBoundingClientRect(),inPane=placeBarInPane(near.box,size,near.viewport,undefined,undefined,navStripInPane(bar,near.origin,near.viewport) /* Clear of the nav strip */);
  const next=clampBarPosition({left:Math.round(near.origin.left-rect.left-parent.clientLeft+inPane.left),top:Math.round(near.origin.top-rect.top-parent.clientTop+inPane.top)},size,{width:parent.clientWidth,height:parent.clientHeight});
  bar.style.left=next.left+'px';bar.style.top=next.top+'px';bar.style.right='auto';
 },[key]);
 return <span ref={ref} hidden aria-hidden="true" data-lv-bar-placement=""/>;
}
/** Typical bar size before it is measured. */
const BAR_SIZE={width:300,height:36};
export function DrawingEditBar(props:DrawingEditBarProps):React.ReactElement{
 const {properties}=props,place=props.position??(props.near&&!props.near.origin?placeBarNearDrawing(props.near.box,BAR_SIZE,props.near.viewport):undefined);
 // A bar mounted by the press that selected the drawing lets that press through (drawing-edit-bar-press.ts).
 return <div ref={markPressThrough} className="drawing-edit-bar" role="toolbar" aria-label="Drawing" style={place?{left:place.left,top:place.top,right:'auto'}:undefined} onPointerDown={event=>event.stopPropagation()}>{props.extra}<BarHandle/>{!props.position&&props.near?.origin&&<BarNearPlacement near={props.near as Required<NonNullable<DrawingEditBarProps['near']>>}/>}
  {props.templates&&<TemplateSlot templates={props.templates}/>}
  {properties?.buttons.map(property=><PropertySlot key={property.id} property={property} properties={properties}/>)}
  {props.sync&&<SyncSlot sync={props.sync}/>}
  {props.onAlert&&<button type="button" className="drawing-edit-icon" aria-label="Add alert" title="Add alert" onClick={props.onAlert}>{icon('alert','🔔')}</button>}
  <button type="button" className="drawing-edit-icon" aria-label="Settings" title="Settings" onClick={props.onSettings}>{icon('settings','⚙')}</button>
  <button type="button" className="drawing-edit-icon" aria-label="Lock / unlock" title={props.locked?'Unlock':'Lock'} aria-pressed={props.locked===undefined?undefined:props.locked} onClick={props.onLock}>{icon(props.locked?'lock-drawings-locked':'lock-drawings','\u{1F512}')}</button>
  <button type="button" className="drawing-edit-icon" aria-label="Delete" title="Delete" onClick={props.onDelete}>{icon('remove-objects','\u{1F5D1}')}</button>
  <MoreSlot onDuplicate={props.onDuplicate} onHide={props.onHide} onFront={props.onFront} onBack={props.onBack} onCopy={props.onCopy} onForward={props.onForward} onBackward={props.onBackward} onVisibility={props.onVisibility} onObjectTree={props.onObjectTree} orderDisabled={props.orderDisabled} onMoveAbove={props.onMoveAbove} onMoveBelow={props.onMoveBelow}/>
 </div>;
}
