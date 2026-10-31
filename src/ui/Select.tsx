// LV custom dropdown: replaces the native <select> (no OS dropdown is ever shown). A combobox button trigger
// with a .lv-popup-menu listbox. DOM focus stays on the trigger; the highlighted option is exposed through aria-activedescendant.
import React,{useCallback,useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {fitFixedMenu} from './menu-placement';
import './select.css';

export interface SelectOption{value:string;label:string;disabled?:boolean;title?:string}
export interface SelectProps{
 value:string;onChange:(value:string)=>void;options:readonly SelectOption[];disabled?:boolean;
 'aria-label'?:string;'aria-labelledby'?:string;className?:string;id?:string;title?:string;style?:React.CSSProperties;name?:string;
}
const enabledIndexes=(options:readonly SelectOption[])=>options.flatMap((row,index)=>row.disabled?[]:[index]);

export function Select(props:SelectProps){
 const{value,onChange,options,disabled,className,id,title,style,name}=props;
 const uid=useId().replace(/:/g,''),listId='lv-select-list-'+uid;
 const [open,setOpen]=useState(false),[active,setActive]=useState(-1);
 const trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null),typed=useRef({text:'',at:0});
 const selected=options.findIndex(row=>row.value===value),current=selected>=0?options[selected]:undefined;
 const show=useCallback(()=>{if(disabled)return;setActive(selected>=0&&!options[selected]?.disabled?selected:(enabledIndexes(options)[0]??-1));setOpen(true);},[disabled,options,selected]);
 const close=useCallback((refocus:boolean)=>{setOpen(false);if(refocus)trigger.current?.focus();},[]);
 const choose=useCallback((index:number)=>{const row=options[index];if(!row||row.disabled)return;setOpen(false);trigger.current?.focus();if(row.value!==value)onChange(row.value);},[onChange,options,value]);
 useLayoutEffect(()=>{
  if(!open||!trigger.current||!popup.current)return;
  const box=trigger.current.getBoundingClientRect();popup.current.style.minWidth=box.width+'px';
  fitFixedMenu(popup.current,{x:box.left,y:box.bottom+2,flipBottom:box.top-2,flipRight:box.right});
 },[open,options]);
 useEffect(()=>{
  if(!open)return;
  const away=(event:Event)=>{const node=event.target as Node|null;if(node&&(trigger.current?.contains(node)||popup.current?.contains(node)))return;setOpen(false);};
  const dismiss=()=>setOpen(false);
  document.addEventListener('pointerdown',away,true);window.addEventListener('resize',dismiss);window.addEventListener('blur',dismiss);
  return()=>{document.removeEventListener('pointerdown',away,true);window.removeEventListener('resize',dismiss);window.removeEventListener('blur',dismiss);};
 },[open]);
 useEffect(()=>{if(open&&active>=0)popup.current?.querySelector<HTMLElement>('[data-index="'+active+'"]')?.scrollIntoView?.({block:'nearest'});},[open,active]);
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 const move=(from:number,step:1|-1)=>{const list=enabledIndexes(options);if(!list.length)return -1;const at=list.indexOf(from);if(at<0)return step>0?list[0]:list[list.length-1];return list[Math.min(list.length-1,Math.max(0,at+step))];};
 function typeAhead(key:string):number{
  const now=Date.now(),memory=typed.current;memory.text=now-memory.at>700?key.toLowerCase():memory.text+key.toLowerCase();memory.at=now;
  const list=enabledIndexes(options),from=open?active:selected,start=Math.max(0,list.indexOf(from)),repeat=memory.text.length===1||[...memory.text].every(c=>c===memory.text[0]);
  const query=repeat?memory.text[0]:memory.text,cut=start+(repeat?1:0),order=[...list.slice(cut),...list.slice(0,cut)];
  return order.find(index=>options[index].label.toLowerCase().startsWith(query))??-1;
 }
 const onKeyDown=(event:React.KeyboardEvent<HTMLButtonElement>)=>{
  if(event.nativeEvent.isComposing||disabled)return;
  const key=event.key,printable=key.length===1&&key!==' '&&!event.ctrlKey&&!event.metaKey&&!event.altKey;
  if(!open){
   if(key==='ArrowDown'||key==='ArrowUp'||key==='Enter'||key===' '){event.preventDefault();show();}
   else if(printable){const hit=typeAhead(key);if(hit>=0){event.preventDefault();if(options[hit].value!==value)onChange(options[hit].value);}}
   return;
  }
  if(key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
  else if(key==='ArrowDown'){event.preventDefault();setActive(move(active,1));}
  else if(key==='ArrowUp'){event.preventDefault();setActive(move(active,-1));}
  else if(key==='Home'){event.preventDefault();setActive(enabledIndexes(options)[0]??-1);}
  else if(key==='End'){event.preventDefault();setActive(enabledIndexes(options).at(-1)??-1);}
  else if(key==='Enter'||key===' '){event.preventDefault();event.stopPropagation();if(active>=0)choose(active);else close(true);}
  else if(key==='Tab')setOpen(false);
  else if(printable){const hit=typeAhead(key);if(hit>=0){event.preventDefault();setActive(hit);}}
 };
 const popupNode=open&&typeof document!=='undefined'?createPortal(
  <div ref={popup} id={listId} role="listbox" aria-label={props['aria-label']} className="lv-popup-menu lv-select-menu" data-lv-select-menu="true"
   onMouseDown={event=>event.preventDefault()} onKeyDown={event=>{if(event.key==='Escape')event.stopPropagation();}}>
   {options.map((row,index)=><div key={row.value+':'+index} id={listId+'-'+index} data-index={index} role="option" aria-selected={index===selected&&!row.disabled} aria-disabled={row.disabled||undefined}
    title={row.title} className={'lv-select-option'+(index===active?' active':'')} onMouseEnter={()=>{if(!row.disabled)setActive(index);}} onClick={()=>choose(index)}>
    <span className="lv-select-check" aria-hidden="true">{index===selected&&!row.disabled?'✓':''}</span><span className="lv-select-label">{row.label}</span></div>)}
  </div>,document.body):null;
 return <>
  <button ref={trigger} type="button" role="combobox" id={id} name={name} className={'lv-select'+(className?' '+className:'')} style={style} title={title} disabled={disabled}
   aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?listId:undefined}
   aria-activedescendant={open&&active>=0?listId+'-'+active:undefined} data-value={value} onClick={()=>{if(open)close(false);else show();}} onKeyDown={onKeyDown}>
   <span className="lv-select-value">{current?.label??''}</span><span className="lv-select-chevron" aria-hidden="true"/>
  </button>{popupNode}
 </>;
}
export default Select;
