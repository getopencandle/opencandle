import React,{useEffect,useLayoutEffect,useRef} from 'react';
import {LV_ICONS,type LvIconId} from './icons';
import {HIDE_MODE_ORDER,HIDE_ARROW_TOOLTIP,HIDE_HINT,LOCK_ARROW_TOOLTIP,REMOVE_ARROW_TOOLTIP,REMOVE_BUTTON_TITLE,SYNC_ARROW_TOOLTIP,hideActive,hideMenu,hideTooltip,lockActive,lockMenu,lockTooltip,removeMenu,syncMenu,syncTooltip,type DrawingUtility,type HideMode,type LockMode,type RemoveScope,type SyncMode,type UtilityMenuRow} from '../chart/drawing-utility-state';
import './drawing-utility.css';
/** 'magnet' is the Magnets flyout of MagnetControl; App keeps one open toolbar menu at a time. */
export type UtilityMenuName='lock'|'hide'|'sync'|'remove'|'magnet';
/** Pure presentational block over the DWUTIL state model: the host owns state, the open menu and every action.
 * Zoom, Lock, Hide, Sync and Remove, each with its own arrow (classes lv-utility-group and lv-utility-arrow). */
export interface DrawingUtilityBlockProps{
 utility:DrawingUtility;canZoomOut:boolean;zoomArmed:boolean;counts:{drawings:number;indicators:number;removeLocked:boolean};openMenu:UtilityMenuName|null;disabled?:boolean;
 onOpenMenu:(menu:UtilityMenuName|null)=>void;onZoomIn:()=>void;onZoomOut:()=>void;onToggleLock:()=>void;onToggleHide:()=>void;onToggleSync:()=>void;
 onSelectLock:(mode:LockMode)=>void;onSelectHide:(mode:HideMode)=>void;onSelectSync:(mode:SyncMode)=>void;onRemove:(scope:RemoveScope)=>void;onToggleRemoveLocked:()=>void;
}
const icon=(id:LvIconId)=>{const Icon=LV_ICONS[id].Icon;return <i className="lv-utility-icon" data-lv-icon={id} aria-hidden="true"><Icon/></i>;};
/** The toolbar aside scrolls (overflow-y:auto, which also clips x), so a menu placed with position:absolute at
 * left:100% sat outside the aside's clip box: it was painted nowhere and a click at its rows hit the chart. The menu is now
 * position:fixed beside its group, kept inside the viewport. Pure so it can be tested without a DOM. */
export function utilityMenuPosition(group:{right:number;top:number},menuHeight:number,viewportHeight:number):{left:number;top:number}{
 const top=Math.max(4,Math.min(Math.round(group.top),Math.round(viewportHeight-menuHeight-8)));
 return{left:Math.round(group.right+4),top};
}
/** What a key or pointer does to an open utility menu: Escape closes it and returns focus to its arrow; a press outside the
 * group (main button, arrow and menu) closes it. */
export function utilityMenuDismiss(event:{type:string;key?:string;isComposing?:boolean;insideGroup:boolean}):'escape'|'outside'|null{
 if(event.type==='keydown')return event.key==='Escape'&&!event.isComposing?'escape':null;
 if(event.type==='pointerdown')return event.insideGroup?null:'outside';
 return null;
}
const useIsoLayoutEffect=typeof window==='undefined'?useEffect:useLayoutEffect;
export interface UtilityMenuProps{label:string;onClose:(returnFocus:boolean)=>void;children?:React.ReactNode}
/** The open menu of one utility group. Owns only its DOM placement and dismissal; the host still owns which menu is open. */
export function UtilityMenu({label,onClose,children}:UtilityMenuProps){
 const ref=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
 useIsoLayoutEffect(()=>{
  const menu=ref.current,group=menu?.parentElement;if(!menu||!group)return;
  const place=()=>{const at=utilityMenuPosition(group.getBoundingClientRect(),menu.getBoundingClientRect().height,window.innerHeight);menu.style.left=at.left+'px';menu.style.top=at.top+'px';};
  place();
  const key=(event:KeyboardEvent)=>{if(utilityMenuDismiss({type:'keydown',key:event.key,isComposing:event.isComposing,insideGroup:true})!=='escape')return;event.preventDefault();event.stopPropagation();close.current(true);(group.querySelector('.lv-utility-arrow') as HTMLElement|null)?.focus();};
  const press=(event:PointerEvent)=>{if(utilityMenuDismiss({type:'pointerdown',insideGroup:event.target instanceof Node&&group.contains(event.target)})==='outside')close.current(false);};
  window.addEventListener('keydown',key,true);window.addEventListener('pointerdown',press,true);window.addEventListener('resize',place);
  return()=>{window.removeEventListener('keydown',key,true);window.removeEventListener('pointerdown',press,true);window.removeEventListener('resize',place);};
 },[]);
 return <div ref={ref} className="lv-utility-menu" role="menu" aria-label={label}>{children}</div>;
}
const LOCK_MODES:LockMode[]=['drawings','indicators','all'];
export function DrawingUtilityBlock(props:DrawingUtilityBlockProps){
 const {utility:u,openMenu,disabled=false}=props,lockOn=lockActive(u),hideOn=hideActive(u);
 const toggleMenu=(menu:UtilityMenuName)=>props.onOpenMenu(openMenu===menu?null:menu);
 const arrow=(menu:UtilityMenuName,label:string)=><button type="button" className="lv-utility-arrow" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={openMenu===menu} disabled={disabled} onClick={()=>toggleMenu(menu)}>{'›'}</button>;
 const closeMenu=()=>props.onOpenMenu(null);
 const modeMenu=(menu:'lock'|'hide'|'sync',label:string,rows:UtilityMenuRow[],choose:(index:number)=>void)=><UtilityMenu label={label} onClose={closeMenu}>{rows.map((row,index)=><button type="button" key={row.id} role="menuitemradio" aria-checked={row.checked===true} className={row.checked?'checked':undefined} data-utility-row={row.id} onClick={()=>{choose(index);props.onOpenMenu(null);}}>{row.label}</button>)}</UtilityMenu>;
 const removeRows=removeMenu(props.counts);
 const removeAction=(id:string):RemoveScope|null=>id==='remove-drawing-tools'?'drawings':id==='remove-studies'?'indicators':id==='remove-all'?'all':null;
 return <div className="lv-utility-groups" role="group" aria-label="Drawing utilities">
  <div className="lv-utility-group" data-utility="zoom">
   <button type="button" aria-label="Zoom in" title="Zoom in" aria-pressed={props.zoomArmed} className={props.zoomArmed?'active':undefined} disabled={disabled} onClick={props.onZoomIn}>{icon('zoom-in')}</button>
  </div>
  {props.canZoomOut&&<div className="lv-utility-group" data-utility="zoom-out">
   <button type="button" aria-label="Zoom out" title="Zoom out" disabled={disabled} onClick={props.onZoomOut}>{icon('zoom-out')}</button>
  </div>}
  <div className="lv-utility-group" data-utility="lock" data-name="lock-all">
   <button type="button" aria-label={lockTooltip(u)} title={lockTooltip(u)} aria-pressed={lockOn} className={lockOn?'active':undefined} disabled={disabled} onClick={props.onToggleLock}>{icon(lockOn?'lock-drawings-locked':'lock-drawings')}</button>
   {arrow('lock',LOCK_ARROW_TOOLTIP)}
   {openMenu==='lock'&&modeMenu('lock',LOCK_ARROW_TOOLTIP,lockMenu(u),index=>props.onSelectLock(LOCK_MODES[index]))}
  </div>
  <div className="lv-utility-group" data-utility="hide" data-name="hide-all">
   <button type="button" aria-label={hideTooltip(u)} title={hideTooltip(u)} aria-pressed={hideOn} aria-keyshortcuts="Control+Alt+H" data-hint={HIDE_HINT} className={hideOn?'active':undefined} disabled={disabled} onClick={props.onToggleHide}>{icon(hideOn?'eye':'hide-drawings')}</button>
   {arrow('hide',HIDE_ARROW_TOOLTIP)}
   {openMenu==='hide'&&modeMenu('hide',HIDE_ARROW_TOOLTIP,hideMenu(u),index=>props.onSelectHide(HIDE_MODE_ORDER[index]))}
  </div>
  <div className="lv-utility-group" data-utility="sync" data-name="sync-drawings">
   <button type="button" aria-label={syncTooltip(u)} title={syncTooltip(u)} aria-pressed={u.syncOn} className={u.syncOn?'active':undefined} disabled={disabled} onClick={props.onToggleSync}>{icon('sync-drawings')}</button>
   {arrow('sync',SYNC_ARROW_TOOLTIP)}
   {openMenu==='sync'&&modeMenu('sync',SYNC_ARROW_TOOLTIP,syncMenu(u),index=>props.onSelectSync(index===0?'layout':'global'))}
  </div>
  <div className="lv-utility-group" data-utility="remove" data-name="removeAllDrawingTools">
   <button type="button" aria-label={REMOVE_BUTTON_TITLE} title={REMOVE_BUTTON_TITLE} aria-haspopup="menu" aria-expanded={openMenu==='remove'} disabled={disabled} onClick={()=>toggleMenu('remove')}>{icon('remove-objects')}</button>
   {arrow('remove',REMOVE_ARROW_TOOLTIP)}
   {openMenu==='remove'&&<UtilityMenu label={REMOVE_BUTTON_TITLE} onClose={closeMenu}>{removeRows.map(row=>{
    if(row.kind==='separator')return <hr key={row.id} role="separator"/>;
    if(row.kind==='switch')return <button type="button" key={row.id} role="menuitemcheckbox" aria-checked={row.checked===true} data-utility-row={row.id} onClick={props.onToggleRemoveLocked}>{row.label}</button>;
    const scope=removeAction(row.id);
    return <button type="button" key={row.id} role="menuitem" disabled={row.disabled} aria-disabled={row.disabled||undefined} data-utility-row={row.id} onClick={()=>{if(row.disabled||!scope)return;props.onRemove(scope);props.onOpenMenu(null);}}>{row.label}</button>;
   })}</UtilityMenu>}
  </div>
 </div>;
}
