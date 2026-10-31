// The indicator templates dropdown. Clicking a saved template applies it (the host reviews nothing; it
// offers Undo); "Save indicator template…" and "Manage templates…" open the existing dialog on the matching tab.
import React from 'react';
import {templateMenuItems} from './indicator-template-menu-model';
import type {IndicatorTemplate,IndicatorTemplates} from './indicator-templates';
import {menuDismissRef} from './menu-dismiss';

const TRIGGER='.lv-template-menu-host>button';
const dismiss=(onClose:()=>void)=>menuDismissRef(onClose,TRIGGER);
/** Drops the menu below its toolbar button (position:fixed, so no ancestor clips it) and keeps it inside the window. */
function placeBelowTrigger(node:HTMLElement|null){
 if(!node||typeof window==='undefined')return;
 const trigger=node.parentElement?.querySelector<HTMLElement>(':scope>button');if(!trigger)return;
 const box=trigger.getBoundingClientRect(),width=node.offsetWidth||220;
 node.style.setProperty('--lv-template-menu-top',Math.round(box.bottom+4)+'px');
 node.style.setProperty('--lv-template-menu-left',Math.max(4,Math.min(Math.round(box.left),window.innerWidth-width-4))+'px');
}

export interface IndicatorTemplatesMenuProps {library:IndicatorTemplates;applied:{name:string}|null;onApply:(template:IndicatorTemplate)=>void;onSave:()=>void;onManage:()=>void;onUndo:()=>void;onClose:()=>void}
export function IndicatorTemplatesMenu({library,applied,onApply,onSave,onManage,onUndo,onClose}:IndicatorTemplatesMenuProps){
 const items=templateMenuItems(library,applied);
 const close=dismiss(onClose);
 return <div ref={node=>{placeBelowTrigger(node);return close(node);}} className="lv-template-menu" role="menu" aria-label="Indicator templates" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onClose();}}}>
  {items.map((item,index)=>{
   if(item.kind==='separator')return <div key={'sep'+index} role="separator" className="lv-legend-menu-separator"/>;
   if(item.kind==='empty')return <div key="empty" className="lv-template-menu-empty" role="presentation">{item.label}</div>;
   if(item.kind==='template')return <button key={item.id} type="button" role="menuitemradio" aria-checked={item.applied} data-template-id={item.id} onClick={()=>{onApply(item.template);onClose();}}>{item.label}</button>;
   const run=item.id==='undo'?onUndo:item.id==='save'?onSave:onManage;
   return <button key={item.id} type="button" role="menuitem" data-menu-id={item.id} onClick={()=>{run();onClose();}}>{item.label}</button>;
  })}
 </div>;
}
