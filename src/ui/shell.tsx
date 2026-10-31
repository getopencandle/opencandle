// Shell building blocks for the App frame: popup menus and right-rail items.
// These are plain render helpers (not components) so the App's host elements stay in one tree:
// App tests walk that tree and executable flows find the same roles and accessible names.
import React from 'react';
import type {LvIconComponent} from './icons';

/** One popup-menu entry; 'separator' draws a divider. Labels are the accessible names. */
export type ShellMenuItem={label:string;onSelect:()=>void;disabled?:boolean;icon?:LvIconComponent}|'separator';

/** Roving focus inside an open role=menu. close(true) returns focus to the trigger. */
export function menuKeyDown(event:React.KeyboardEvent<HTMLElement>,close:(focusTrigger:boolean)=>void){
 if(event.nativeEvent.isComposing)return;
 const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)'));
 const index=items.indexOf(event.target as HTMLButtonElement);
 const move=(next:number)=>{event.preventDefault();items[(next+items.length)%items.length]?.focus();};
 if(event.key==='ArrowDown')move(index+1);
 else if(event.key==='ArrowUp')move(index<0?items.length-1:index-1);
 else if(event.key==='Home')move(0);
 else if(event.key==='End')move(items.length-1);
 else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
 else if(event.key==='Tab')close(false);
}

/** Focus the first enabled item of a menu element (no-op without a DOM). */
export function focusFirstMenuItem(menu:HTMLElement|null){menu?.querySelector?.<HTMLButtonElement>('[role=menuitem]:not(:disabled)')?.focus?.();}

/**
 * A 260px popup menu (role=menu). It stays in the tree while closed (`hidden`), so assistive tech and the
 * keyboard only reach it when open. Choosing an item closes the menu and returns focus to its trigger
 * before running the action, so a dialog opened by the action returns focus to the trigger on close.
 */
export function shellMenu({id,label,open,items,onClose,menuRef,triggerId,className}:{id:string;label:string;open:boolean;items:readonly ShellMenuItem[];onClose:(focusTrigger:boolean)=>void;menuRef?:React.Ref<HTMLDivElement>;triggerId?:string;className?:string}){
 return <div className={'lv-popup-menu'+(className?' '+className:'')} id={id} role="menu" aria-label={label} hidden={!open} ref={menuRef}
  onKeyDown={event=>menuKeyDown(event,onClose)}
  onBlur={event=>{if(!open)return;const next=event.relatedTarget as HTMLElement|null;if(next&&(event.currentTarget.contains(next)||(triggerId&&next.id===triggerId)))return;onClose(false);}}>
  {items.map((item,index)=>item==='separator'?<div key={'separator-'+index} role="separator" className="lv-popup-separator"/>:
   <button key={item.label} type="button" role="menuitem" tabIndex={-1} disabled={item.disabled} onClick={()=>{onClose(true);item.onSelect();}}>{item.icon?<item.icon/>:<span className="lv-popup-icon-slot" aria-hidden="true"/>}<span>{item.label}</span></button>)}
 </div>;
}

/**
 * A 44x44 right-rail button. The button's only child is its label text (visually hidden by CSS, still its
 * accessible name); the icon is a decorative sibling drawn above the hover plate.
 */
export function railItem({id,icon:Icon,label,title,pressed,onClick,disabled,extra}:{id:string;icon:LvIconComponent;label:string;title?:string;pressed?:boolean;onClick:()=>void;disabled?:boolean;extra?:React.ReactNode}){
 return <div className={'lv-rail-item'+(pressed?' active':'')} key={id} data-rail-item={id}>
  <Icon/>
  <button type="button" className="lv-rail-button" title={title??label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>{label}</button>
  {extra}
 </div>;
}

/**
 * Right-rail panel slot API. A panel owner (watchlist, object tree, data window, ...) supplies one slot;
 * the App renders a rail toggle for it and, while it is active, `render()` inside the widget panel
 * (`aside.right-panel`, 302px). Only one panel is open at a time; pressing the active panel's rail
 * button collapses the widget panel. Slot ids are stable lower-case words and never shown to users.
 */
export interface RailPanelSlot{
 readonly id:string;
 /** Accessible name of the rail button and the panel heading text. */
 readonly label:string;
 readonly icon:LvIconComponent;
 readonly title?:string;
 readonly heading?:string;
 readonly render:()=>React.ReactNode;
 /** Shown beside the rail button (the Alerts unread counter). */
 readonly extra?:React.ReactNode;
}
/** A rail button that runs an action (opens a dialog) instead of hosting a panel. */
export interface RailActionSlot{
 readonly id:string;
 readonly label:string;
 readonly icon:LvIconComponent;
 readonly title?:string;
 readonly pressed?:boolean;
 readonly disabled?:boolean;
 readonly onSelect:()=>void;
 readonly extra?:React.ReactNode;
}

/** The 45px rail: the top group (panel toggles and top actions, in topOrder when given), a flexible gap, then the bottom actions. */
export function rightRail({panels,activePanel,onPanel,topActions,bottomActions,topOrder}:{panels:readonly RailPanelSlot[];activePanel:string|null;onPanel:(id:string)=>void;topActions:readonly RailActionSlot[];bottomActions:readonly RailActionSlot[];topOrder?:readonly string[]}){
 const action=(row:RailActionSlot)=>railItem({id:row.id,icon:row.icon,label:row.label,title:row.title,pressed:row.pressed,disabled:row.disabled,onClick:row.onSelect,extra:row.extra});
 const panel=(row:RailPanelSlot)=>railItem({id:row.id,icon:row.icon,label:row.label,title:row.title,pressed:activePanel===row.id,onClick:()=>onPanel(row.id),extra:row.extra});
 const rank=(id:string)=>{const index=topOrder?.indexOf(id)??-1;return index<0?Number.MAX_SAFE_INTEGER:index;};
 const top=[...panels.map(row=>({id:row.id,node:panel(row)})),...topActions.map(row=>({id:row.id,node:action(row)}))].map((row,index)=>({...row,index})).sort((x,y)=>rank(x.id)-rank(y.id)||x.index-y.index);
 return <nav className="lv-right-rail" data-lv-rail="" aria-label="Right toolbar">
  <div className="lv-rail-group">{top.map(row=>row.node)}</div>
  <div className="lv-rail-spacer"/>
  <div className="lv-rail-group">{bottomActions.map(action)}</div>
 </nav>;
}

/** Next rail state when a panel button is pressed: the active panel collapses, any other opens. */
export function nextRailPanel(active:string|null,pressed:string):string|null{return active===pressed?null:pressed;}
