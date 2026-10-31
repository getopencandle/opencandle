// The Take a snapshot toolbar button opens a menu (Download image, Copy image)
// instead of a save dialog. While a download is in flight its row stays disabled, so a second click cannot stack a
// second save dialog (electron main refuses a second dialog as BUSY as well).
import React,{useEffect,useRef,useState} from 'react';
import {SnapshotIcon} from './icons';
import {menuDismissRef} from './menu-dismiss';
import {snapshotMenuRows,type SnapshotMenuCommand} from './top-toolbar-model';

const TRIGGER='.lv-snapshot-menu-host>button';
const dismiss=(onClose:()=>void)=>menuDismissRef(onClose,TRIGGER);
/** Drops the menu below its trigger, right-aligned (the button sits at the right edge of the toolbar), inside the window. */
function placeBelowTrigger(node:HTMLElement|null){
 if(!node||typeof window==='undefined')return;
 const trigger=node.parentElement?.querySelector<HTMLElement>(':scope>button');if(!trigger)return;
 const box=trigger.getBoundingClientRect(),width=node.offsetWidth||220;
 node.style.top=Math.round(box.bottom+4)+'px';
 node.style.left=Math.max(4,Math.min(Math.round(box.right-width),window.innerWidth-width-4))+'px';
}
// `blocked` (optional) is the export refusal of the active chart's data (live data); the rows are disabled with
// it and the menu shows it as a note, instead of a click that only changes the status bar line.
export interface SnapshotMenuProps {disabled:boolean;onDownload:()=>Promise<unknown>|void;onCopy:()=>Promise<unknown>|void;blocked?:string|null}
export function SnapshotMenu({disabled,onDownload,onCopy,blocked}:SnapshotMenuProps){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),alive=useRef(true),busyRef=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 const close=dismiss(()=>setOpen(false));
 const run=(id:SnapshotMenuCommand)=>{
  setOpen(false);
  if(id==='copy-image'){void onCopy();return;}
  if(busyRef.current)return;busyRef.current=true;setBusy(true);
  Promise.resolve().then(onDownload).catch(()=>{}).finally(()=>{busyRef.current=false;if(alive.current)setBusy(false);});
 };
 const rows=snapshotMenuRows({hasChart:!disabled,busy,blocked});
 return <span className="lv-snapshot-menu-host" style={{position:'relative',display:'inline-flex'}}>
  <button type="button" className="lv-icon-button" aria-label="Take a snapshot" title="Take a snapshot" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(value=>!value)} onKeyDown={event=>{if(event.key==='ArrowDown'&&!open){event.preventDefault();setOpen(true);}}}><SnapshotIcon/></button>
  {open&&!disabled&&<div ref={node=>{placeBelowTrigger(node);const off=close(node);if(node&&!node.contains(document.activeElement))(node.querySelector<HTMLElement>('button:not(:disabled)')??node).focus();return off;}} className="lv-popup-menu lv-snapshot-menu" role="menu" aria-label="Take a snapshot" tabIndex={-1} style={{width:'auto',minWidth:220,...(blocked?{maxWidth:300}:{})}} onKeyDown={event=>{
   if(event.key==='Escape'){event.stopPropagation();setOpen(false);return;}
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)'));const at=items.indexOf(document.activeElement as HTMLElement);items[(at+(event.key==='ArrowDown'?1:items.length-1))%items.length]?.focus();}
  }}>
   {blocked&&<div className="lv-snapshot-menu-note" role="note" style={{padding:'6px 12px',fontSize:12,opacity:0.8,whiteSpace:'normal'}}>{blocked}</div>}
   {rows.map(row=><button key={row.id} type="button" role="menuitem" data-menu-id={row.id} disabled={!row.enabled} title={row.reason} aria-keyshortcuts={row.hotkeyHint.replace(/ \+ /g,'+')} onClick={()=>run(row.id)}><span>{row.label}</span><span className="lv-popup-shortcut">{row.hotkeyHint}</span></button>)}
  </div>}
 </span>;
}
