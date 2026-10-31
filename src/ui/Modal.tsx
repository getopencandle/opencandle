import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
/** The element that had focus when a dialog opened. Read during the first render: a child's
 * autoFocus runs at commit, before any effect, so an effect would record a node inside the dialog. */
export function useDialogOpener():HTMLElement|null{
 const [opener]=useState(()=>typeof document==='undefined'?null:document.activeElement as HTMLElement|null);
 return opener;
}
const DIALOG_CONTROLS='button,input,select,textarea,[tabindex="0"]';
const safeClosest=(node:Element,selector:string):Element|null=>{try{return typeof node.closest==='function'?node.closest(selector):null;}catch{return null;}};
const safeMatches=(node:Element,selector:string)=>{try{return typeof node.matches==='function'&&node.matches(selector);}catch{return false;}};
/** Focus inside a nested aria-modal dialog belongs to that dialog, which keeps its own focus. */
const ownedBy=(root:HTMLElement,node:Element)=>{const modal=safeClosest(node,'[aria-modal="true"]');return !modal||modal===root;};
const usable=(root:HTMLElement,node:HTMLElement)=>node.isConnected&&root.contains(node)&&(node===root||(node as HTMLButtonElement).disabled!==true&&!safeMatches(node,':disabled')&&node.offsetParent!==null)&&!safeClosest(node,'[hidden],[aria-hidden="true"],[inert]');
const lostFocus=(active:Element|null)=>!active||active===document.body||active===document.documentElement;
/** A retention move never lands on a control that closes, cancels or destroys something (Enter would run it).
 * Marked explicitly with data-lv-destructive="true", or a button named Cancel / Close / Discard / Delete / Remove. Fails closed. */
export const DESTRUCTIVE_CONTROL='data-lv-destructive';
const destructive=(node:HTMLElement)=>{try{if(node.getAttribute?.(DESTRUCTIVE_CONTROL)==='true')return true;if(node.tagName!=='BUTTON'&&node.getAttribute?.('role')!=='button')return false;return /^(cancel|close|discard|delete|remove)\b/i.test(String(node.getAttribute?.('aria-label')??node.textContent??'').trim());}catch{return true;}};
/** About 2 s (50 ms polls) for a briefly disabled or hidden control to become usable again before focus moves on. */
const TRANSIENT_POLLS=40;
/** The nearest enabled, tabbable, non-destructive control after the node in document order, else the nearest before it. */
export function dialogNeighbor(root:HTMLElement,origin:HTMLElement):HTMLElement|null{
 const list=Array.from(root.querySelectorAll<HTMLElement>(DIALOG_CONTROLS)).filter(node=>ownedBy(root,node)),index=list.indexOf(origin);
 if(index<0)return null;
 const ok=(node:HTMLElement)=>usable(root,node)&&node.tabIndex>=0&&!destructive(node);
 for(let i=index+1;i<list.length;i++)if(ok(list[i]))return list[i];
 for(let i=index-1;i>=0;i--)if(ok(list[i]))return list[i];
 return null;
}
/** IFACE5 F9/F10 focus retention for an open dialog. When the focused control is removed (row Remove, an editor or
 * preview closing), focus moves to the dialog-specific fallback or the dialog element itself (tabIndex -1), so Escape
 * and the Tab trap keep working. When it is only disabled or hidden, the dialog element holds focus while the
 * same control is awaited (about 2 s); it gets focus back once usable. Only a control that stays unusable hands focus to
 * the nearest enabled control after it (before it at the end), never to a destructive one. When an inert
 * ancestor (a blocking workspace operation) took focus, the same control is focused again once the block ends. Focus
 * the user moved outside the dialog, or into a nested modal dialog, is left alone. The dialog's own focus logic runs
 * first: checks are deferred until after the commit's effects. fallback names a dialog-specific target (for example the
 * row that took a removed row's place); it is consulted before the generic neighbor. */
export type DialogFocusFallback=(root:HTMLElement)=>HTMLElement|null|undefined;
export function useDialogFocusRetention(ref:React.RefObject<HTMLElement|null>,active=true,fallback?:DialogFocusFallback){
 const preferred=useRef(fallback);preferred.current=fallback;
 useEffect(()=>{
  const root=ref.current;if(!active||!root||typeof document==='undefined')return;
  let last:HTMLElement|null=null,timer:ReturnType<typeof setTimeout>|null=null,waits=0,retired=false,parked:{origin:HTMLElement;polls:number}|null=null;
  // Focus the user (or a dialog's own logic) moves to another control ends a parked wait; the dialog element taking focus does not.
  const remember=(node:unknown)=>{if(node&&node!==document.body&&root.contains(node as Node)&&ownedBy(root,node as Element)){last=node as HTMLElement;if(node!==root)parked=null;}};
  remember(document.activeElement);
  const schedule=(delay=0)=>{if(retired||timer!==null)return;timer=setTimeout(()=>{timer=null;retain();},delay);};
  const retain=()=>{
   if(retired||!root.isConnected)return;
   const current=document.activeElement as HTMLElement|null,lost=lostFocus(current);let origin:HTMLElement|null;
   if(!lost){if(!root.contains(current)||!ownedBy(root,current!)){parked=null;return;}if(current===root&&parked)origin=parked.origin;else if(usable(root,current!)){if(current!==root)parked=null;last=current;waits=0;return;}else origin=current;}
   else origin=parked?.origin??last;
   if(!origin)return;
   // A blocking workspace state made the whole dialog inert: nothing inside can take focus until it ends.
   if(safeClosest(root,'[inert]')){if(++waits<=1200)schedule(50);return;}
   waits=0;
   const kept=origin.isConnected&&root.contains(origin);let target:HTMLElement|null=kept&&usable(root,origin)?origin:null;
   if(target)parked=null;
   else if(kept&&origin!==root){
    // Disabled or hidden but still present (an evaluation tick, a background save suspending the dialog's source).
    // The dialog element holds focus (Escape and the Tab trap work, Enter activates nothing) until the same control is
    // usable again; only one that stays unusable past the bound hands focus on, never to a destructive control.
    if(parked?.origin!==origin)parked={origin,polls:0};
    if(parked.polls++<TRANSIENT_POLLS){if(current!==root)root.focus({preventScroll:true});schedule(50);return;}
    parked=null;
   }else parked=null;
   if(!target){let named:HTMLElement|null|undefined=null;try{named=preferred.current?.(root);}catch{named=null;}target=named&&usable(root,named)&&!destructive(named)?named:kept?dialogNeighbor(root,origin)??root:root;}
   if(target===current)return;
   target.focus({preventScroll:true});if(document.activeElement===target&&target!==root)last=target;
  };
  const focusIn=(event:Event)=>remember(event.target);
  const focusOut=(event:Event)=>{const related=(event as FocusEvent).relatedTarget;if(!related&&(event.target===last||root.contains(event.target as Node)))schedule();};
  document.addEventListener?.('focusin',focusIn,true);document.addEventListener?.('focusout',focusOut,true);
  const observer=typeof MutationObserver==='function'?new MutationObserver(()=>schedule()):null;
  observer?.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','hidden','inert','aria-hidden']});
  return()=>{retired=true;if(timer!==null)clearTimeout(timer);observer?.disconnect();document.removeEventListener?.('focusin',focusIn,true);document.removeEventListener?.('focusout',focusOut,true);};
 },[active]);
}
/** focus() on an opener under an inert ancestor (a blocking workspace operation overlapping the close) does
 * nothing, which left focus on the body. Retry until the block ends, unless the user has focused something else. */
/** True when the opener holds focus without a keyboard focus ring (it was clicked). Read at open. */
function pointerOpened(opener:HTMLElement|null):boolean{
 try{return !!opener&&typeof opener.matches==='function'&&document.activeElement===opener&&!opener.matches(':focus-visible');}catch{return false;}
}
/** Focus returns to a clicked opener without a focus ring (Esc is a key, so the browser would draw one); the next key
 * on it, or leaving it, brings the ring back. */
function quietFocus(opener:HTMLElement){
 try{opener.setAttribute('data-lv-quiet-focus','');const clear=()=>{try{opener.removeAttribute('data-lv-quiet-focus');}catch{/* gone */}opener.removeEventListener('keydown',clear);opener.removeEventListener('blur',clear);};opener.addEventListener('keydown',clear);opener.addEventListener('blur',clear);}catch{/* display only */}
}
function restoreOpener(opener:HTMLElement,quiet=false){
 let tries=0;if(quiet)quietFocus(opener);
 // The first attempt keeps the caller's checks; a retry only acts while focus is still lost.
 const attempt=(first:boolean)=>{if(!opener.isConnected)return;if(!first){const active=document.activeElement;if(active===opener||active&&active!==document.body&&active!==document.documentElement)return;}if(quiet)opener.focus({focusVisible:false} as FocusOptions);else opener.focus();if(document.activeElement!==opener&&++tries<=1200)setTimeout(()=>attempt(false),50);};
 attempt(true);
}
/** Tab / Shift+Tab while the dialog element itself holds focus (after a retention fallback) stay inside it. */
export function trapTabFromDialog(event:{key:string;shiftKey:boolean;preventDefault():void},root:HTMLElement|null,targets:HTMLElement[]):boolean{
 if(event.key!=='Tab'||!root||document.activeElement!==root)return false;
 const target=event.shiftKey?targets.at(-1):targets[0];if(!target)return false;event.preventDefault();target.focus();return true;
}
// A dialog moves by its title bar. Pointer
// capture on the header; never from a header button or field; the dialog stays on screen (its header never leaves the top
// edge); the position is remembered per dialog key for the session (module memory, nothing persisted); a double-click on
// the title bar recenters. The offset is the CSS `translate` property, which the overlay open transition does not animate.
export type DialogOffset={x:number;y:number};
export type DialogBox={left:number;top:number;width:number;height:number};
const dialogOffsets=new Map<string,DialogOffset>();
/** Test seam: the remembered offsets of this session. */
export const rememberedDialogOffsets=():ReadonlyMap<string,DialogOffset>=>dialogOffsets;
const DRAG_EXEMPT='button,input,select,textarea,a,[role=button],[contenteditable="true"]';
/** Clamps an offset so the dialog (box = its rect at offset 0) stays inside the viewport. Too wide: either edge may hide, never
 * both; too tall: the top (the title bar) stays at the top edge. */
export function clampDialogOffset(offset:DialogOffset,box:DialogBox,viewport:{width:number;height:number}):DialogOffset{
 const spareX=viewport.width-box.width,spareY=viewport.height-box.height;
 const clamp=(value:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,value));
 const left=clamp(box.left+offset.x,Math.min(0,spareX),Math.max(0,spareX)),top=clamp(box.top+offset.y,0,Math.max(0,spareY));
 return{x:Math.round(left-box.left),y:Math.round(top-box.top)};
}
export function isDialogDragStart(event:{button:number;target:EventTarget|null}):boolean{
 if(event.button!==0)return false;const target=event.target as Element|null;
 return !(target&&safeClosest(target,DRAG_EXEMPT));
}
/** Header handlers for a draggable dialog. key names the dialog for the session memory. */
export function useDialogDrag(ref:React.RefObject<HTMLElement|null>,key:string){
 const offset=useRef<DialogOffset>(dialogOffsets.get(key)??{x:0,y:0}),drag=useRef<{pointer:number;startX:number;startY:number;from:DialogOffset;box:DialogBox}|null>(null);
 const css=(next:DialogOffset)=>next.x||next.y?next.x+'px '+next.y+'px':'';
 const paint=(next:DialogOffset)=>{offset.current=next;const node=ref.current;if(node)node.style.translate=css(next);};
 const viewport=()=>({width:window.innerWidth,height:window.innerHeight});
 const box=():DialogBox|null=>{const node=ref.current;if(!node)return null;const rect=node.getBoundingClientRect();return{left:rect.left-offset.current.x,top:rect.top-offset.current.y,width:rect.width,height:rect.height};};
 return{
  /** The dialog's style: the current offset (a reopened dialog starts where it was left and re-clamps on the next drag). */
  style:{translate:css(offset.current)||undefined} as React.CSSProperties,
  onPointerDown(event:React.PointerEvent<HTMLElement>){if(!isDialogDragStart(event))return;const base=box();if(!base)return;event.preventDefault();drag.current={pointer:event.pointerId,startX:event.clientX,startY:event.clientY,from:offset.current,box:base};try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* capture is a convenience */}},
  onPointerMove(event:React.PointerEvent<HTMLElement>){const state=drag.current;if(!state||state.pointer!==event.pointerId)return;paint(clampDialogOffset({x:state.from.x+event.clientX-state.startX,y:state.from.y+event.clientY-state.startY},state.box,viewport()));},
  onPointerUp(event:React.PointerEvent<HTMLElement>){const state=drag.current;if(!state||state.pointer!==event.pointerId)return;drag.current=null;try{event.currentTarget.releasePointerCapture(event.pointerId);}catch{/* already released */}if(offset.current.x||offset.current.y)dialogOffsets.set(key,offset.current);else dialogOffsets.delete(key);},
  onPointerCancel(){const state=drag.current;if(!state)return;drag.current=null;paint(state.from);},
  onDoubleClick(event:React.MouseEvent<HTMLElement>){if(!isDialogDragStart(event))return;drag.current=null;paint({x:0,y:0});dialogOffsets.delete(key);},
 };
}
/** A press that starts and ends on the dimmed backdrop closes a dialog that opts in
 * (such as the Indicators dialog). A drag that starts inside the dialog and ends on the shade never does. */
export function backdropCloses(down:EventTarget|null,up:EventTarget|null,shade:EventTarget|null,button:number):boolean{
 return button===0&&!!shade&&down===shade&&up===shade;
}
export function Modal({title,onClose,children,wide=false,focusFallback,portal=false,dragKey,closeOnBackdrop=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean;focusFallback?:DialogFocusFallback;portal?:boolean;dragKey?:string;closeOnBackdrop?:boolean}){
 const ref=useRef<HTMLDivElement>(null),opener=useDialogOpener(),shadeDown=useRef<EventTarget|null>(null),[quiet]=useState(()=>typeof document!=='undefined'&&pointerOpened(opener));
 const {style:dragStyle,...headerHandlers}=useDialogDrag(ref,dragKey??title);
 useEffect(()=>{const previous=opener,modal=ref.current;if(!modal?.contains(document.activeElement))(modal?.querySelector<HTMLElement>('input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled)')??modal?.querySelector<HTMLElement>(':scope>:not(header) button:not(:disabled)')??modal?.querySelector<HTMLElement>('button'))?.focus();
  // The first field can be unfocusable (News and filings: the paste box inside a closed "Paste JSON"), which left
  // focus on the rail button so Esc did nothing. Try the next candidates, then the dialog itself (tabIndex -1), so Esc closes it.
  if(modal&&typeof document!=='undefined'&&!modal.contains(document.activeElement)){const fields=typeof modal.querySelectorAll==='function'?[...modal.querySelectorAll<HTMLElement>('input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled),:scope>:not(header) button:not(:disabled)')]:[];for(const node of fields){node.focus?.();if(modal.contains(document.activeElement))break;}if(!modal.contains(document.activeElement))modal.focus?.();}
  return()=>{if(previous?.isConnected&&!modal?.contains(previous)&&(document.activeElement===document.body||!document.activeElement||modal?.contains(document.activeElement)))restoreOpener(previous,quiet);};},[]);
 useDialogFocusRetention(ref,true,focusFallback);
 const shade=<div className="modal-shade" onPointerDown={closeOnBackdrop?e=>{shadeDown.current=e.button===0?e.target:null;}:undefined} onClick={closeOnBackdrop?e=>{const down=shadeDown.current;shadeDown.current=null;if(backdropCloses(down,e.target,e.currentTarget,e.button))onClose();}:undefined}><div className={'lv-modal '+(wide?'wide':'')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={dragStyle} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='Tab'){const list=Array.from(ref.current!.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(x=>x.offsetParent!==null);if(trapTabFromDialog(e,ref.current,list))return;if(e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0]?.focus();}}}}><header className="lv-modal-drag" style={{userSelect:'none',touchAction:'none',cursor:'move'}} {...headerHandlers}><h2>{title}</h2><button type="button" aria-label={'Close '+title} data-lv-destructive="true" onClick={onClose}>×</button></header>{children}</div></div>;
 // A script dialog escapes legend hit-testing/stacking while staying under workspace inert/theme state.
 if(!portal||typeof document==='undefined')return shade;
 const connected=(node:HTMLElement|null|undefined):node is HTMLElement=>!!node&&node.nodeType===1&&node.isConnected&&node.ownerDocument===document;
 const nearest=opener?.closest<HTMLElement>('main.workspace');let host:HTMLElement|null=connected(nearest)?nearest:null;
 if(!host)for(const workspace of document.querySelectorAll<HTMLElement>('main.workspace'))if(connected(workspace)){if(host)return shade;host=workspace;}
 if(!host&&connected(document.body))host=document.body;
 return host?createPortal(shade,host):shade;
}
