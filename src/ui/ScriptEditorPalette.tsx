import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {paletteResults,type PaletteResult} from './script-editor-intel';
import './script-editor-extras.css';

/** Command palette of the script editor: type to filter, arrows to move, Enter to run, ":N" to go to a line. */
export function ScriptEditorPalette({lineCount,onRun,onClose}:{lineCount:number;onRun:(result:PaletteResult)=>void;onClose:()=>void}){
 const [query,setQuery]=useState(''),[active,setActive]=useState(0),input=useRef<HTMLInputElement>(null),uid=useId().replace(/:/g,''),list='script-palette-'+uid;
 const results=useMemo(()=>paletteResults(query,lineCount),[query,lineCount]);
 useEffect(()=>{input.current?.focus();},[]);
 useEffect(()=>setActive(0),[query]);
 const run=(result:PaletteResult|undefined)=>{if(result)onRun(result);};
 return <div className="script-palette" role="dialog" aria-label="Script editor commands" onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}
  else if(event.key==='ArrowDown'){event.preventDefault();setActive(Math.min(active+1,results.length-1));}
  else if(event.key==='ArrowUp'){event.preventDefault();setActive(Math.max(active-1,0));}
  else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();run(results[active]);}
 }}>
  <input ref={input} role="combobox" aria-expanded="true" aria-controls={list} aria-activedescendant={results.length?list+'-'+active:undefined} aria-label="Type a command or :line number" placeholder="Type a command, or :42 to go to a line" value={query} onChange={event=>setQuery(event.target.value)}/>
  <ul id={list} role="listbox">{results.length===0&&<li className="script-palette-empty">No matching command.</li>}
   {results.map((row,index)=>row.kind==='line'
    ?<li key="line" id={list+'-'+index} role="option" aria-selected={index===active} className={index===active?'active':''} onMouseDown={event=>{event.preventDefault();run(row);}}><span>Go to line {row.line}</span></li>
    :<li key={row.command.action} id={list+'-'+index} role="option" aria-selected={index===active} className={index===active?'active':''} title={row.command.hint} onMouseDown={event=>{event.preventDefault();run(row);}}><span>{row.command.label}</span>{row.command.keys&&<kbd>{row.command.keys}</kbd>}</li>)}
  </ul>
 </div>;
}
