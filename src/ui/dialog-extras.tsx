import React,{useId,useState} from 'react';
import {menuDismissRef} from './menu-dismiss';
// Shared dialog chrome: an "i" info button whose explanation stays in the DOM (aria-describedby) and an overflow menu for
// secondary actions. Both are plain function components so the dialogs keep their existing handlers untouched.
export function InfoTip({label,children,className}:{label:string;children:React.ReactNode;className?:string}){
 const id=useId();
 return <span className={'lv-info'+(className?' '+className:'')}><button type="button" className="lv-info-btn" aria-label={label} aria-describedby={id}>i</button><span id={id} role="tooltip" className="lv-info-tip">{children}</span></span>;
}
export function OverflowMenu({label='More actions',children}:{label?:string;children:React.ReactNode}){
 const [open,setOpen]=useState(false);
 const id=useId();
 return <span className="lv-ovf"><button type="button" className="lv-ovf-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(!open)}>⋯</button>
 {open&&<div id={id} role="menu" aria-label={label} className="lv-popup-menu lv-ovf-menu" ref={menuDismissRef(()=>setOpen(false),'.lv-ovf-btn')} onClick={()=>setOpen(false)}>{children}</div>}</span>;
}
