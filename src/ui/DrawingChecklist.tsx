// Checklist dropdown of the drawing settings dialog.
// Used by the trend line Stats row and the rectangle Extend row (placeholder "Don't extend"): a "checklist dropdown"
// is one button that opens a list of switches.
// The button shows the checked titles (or the placeholder), the list opens below it, Escape or a press outside closes it,
// Up and Down move between the items, Space or Enter toggles one. The items are the caller's own checkbox inputs (role
// menuitemcheckbox) passed as children, so the dialog keeps owning their values and handlers; while the list is closed they stay in the
// tree, hidden.
import React,{useEffect,useRef,useState} from 'react';
import './drawing-checklist.css';

export interface DrawingChecklistProps {
 /** Row title (the menu's accessible name). */
 label:string;
 /** Button text: checked item titles, or the placeholder. */
 summary:string;
 disabled?:boolean;
 /** Why the control is disabled (tooltip and visible note). */
 reason?:string;
 children?:React.ReactNode;
}
const ITEMS='input[role="menuitemcheckbox"]:not(:disabled)';
export function DrawingChecklist({label,summary,disabled=false,reason,children}:DrawingChecklistProps){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement|null>(null),button=useRef<HTMLButtonElement|null>(null);
 const shown=open&&!disabled;
 const items=()=>Array.from(root.current?.querySelectorAll<HTMLInputElement>(ITEMS)??[]);
 useEffect(()=>{
  if(!shown)return;
  items()[0]?.focus();
  const press=(event:PointerEvent)=>{const target=event.target as Node|null;if(root.current&&target&&!root.current.contains(target))setOpen(false);};
  document.addEventListener('pointerdown',press,true);
  return()=>document.removeEventListener('pointerdown',press,true);
 },[shown]);
 const close=()=>{setOpen(false);button.current?.focus();};
 const onKeyDown=(event:React.KeyboardEvent<HTMLDivElement>)=>{
  if(event.nativeEvent.isComposing)return;
  if(!shown){if(event.key==='ArrowDown'&&event.target===button.current&&!disabled){event.preventDefault();setOpen(true);}return;}
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();const list=items();if(!list.length)return;
   const index=list.indexOf(document.activeElement as HTMLInputElement);
   list[event.key==='ArrowDown'?(index+1)%list.length:index<=0?list.length-1:index-1].focus();return;
  }
  // In a menu Enter toggles the focused item; it must not submit the settings form.
  const target=event.target as HTMLElement|null;
  if(event.key==='Enter'&&target?.getAttribute?.('role')==='menuitemcheckbox'){event.preventDefault();target.click();}
 };
 return <div className="lv-checklist" ref={root} onKeyDown={onKeyDown} onBlur={event=>{const next=event.relatedTarget as Node|null;if(shown&&next&&root.current&&!root.current.contains(next))setOpen(false);}}>
  <button type="button" ref={button} aria-haspopup="menu" aria-expanded={shown} aria-label={label+': '+summary} disabled={disabled} title={disabled?reason:summary} onClick={()=>setOpen(value=>!value)}><span className="lv-checklist-summary">{summary}</span><svg aria-hidden="true" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg></button>
  <div role="menu" aria-label={label} hidden={!shown}>{children}</div>
  {disabled&&reason&&<small className="lv-checklist-reason">{reason}</small>}
 </div>;
}
