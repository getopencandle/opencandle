// Quick search (Ctrl+K and the toolbar magnifier). One search box over symbols, commands,
// indicators, drawing tools, intervals, chart types, layouts and Chart settings (model: quick-search-model.ts). The keys follow
// the WAI-ARIA combobox pattern with a listbox: Up and Down move, Home and End jump, Page Up and Page Down move by eight, Enter
// runs the highlighted row, Escape closes. Choosing a row closes the palette; App then runs the row the same way the menu,
// toolbar or dialog it stands for would. Layout and wording are our own choice.
import React,{useMemo,useRef,useState} from 'react';
import {Modal} from './Modal';
import {QUICK_SEARCH_FILTERS,quickSearchView,readQuickSearchRecent,rememberQuickSearch,stepQuickSearch,type QuickSearchFilter,type QuickSearchItem,type QuickSearchStorage} from './quick-search-model';
import type {SymbolSearchCandidate} from './symbol-search';
import './chart-commands.css';

export interface QuickSearchDialogProps{
 index:readonly QuickSearchItem[];
 candidates:readonly SymbolSearchCandidate[];
 storage:QuickSearchStorage|null;
 initialQuery?:string;
 /** Runs the chosen row after the palette has closed. */
 onRun:(row:QuickSearchItem)=>void;
 onClose:()=>void;
}
export const QUICK_SEARCH_EMPTY:Readonly<Record<'no-match'|'no-recent',string>>=Object.freeze({'no-match':'Nothing matches. Try another word.','no-recent':'Type a symbol to search.'});
export function QuickSearchDialog({index,candidates,storage,initialQuery='',onRun,onClose}:QuickSearchDialogProps){
 const [query,setQuery]=useState(initialQuery),[filter,setFilter]=useState<QuickSearchFilter>('All'),[active,setActive]=useState(0);
 const recent=useMemo(()=>readQuickSearchRecent(storage),[storage]);
 const view=useMemo(()=>quickSearchView(index,{query,filter,recent,candidates}),[index,query,filter,recent,candidates]);
 const done=useRef(false),list=useRef<HTMLDivElement>(null);
 const highlighted=view.items.length?Math.min(Math.max(active,0),view.items.length-1):-1;
 const choose=(row:QuickSearchItem|undefined)=>{if(!row||done.current)return;done.current=true;rememberQuickSearch(storage,row);onRun(row);};
 const show=(next:number)=>{setActive(next);try{list.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView?.({block:'nearest'});}catch{/* layout only */}};
 const optionId=(row:QuickSearchItem)=>'lv-qs-'+row.id.replace(/[^A-Za-z0-9_-]/g,'_');
 let position=-1;
 return <Modal title="Quick search" onClose={onClose} wide>
  <div className="lv-quick-search">
   <input autoFocus className="lv-quick-search-input" role="combobox" aria-label="Quick search" aria-expanded="true" aria-controls="lv-quick-search-results" aria-autocomplete="list" aria-activedescendant={highlighted>=0?optionId(view.items[highlighted]!):undefined} placeholder="Search symbols, actions, tools and settings" value={query} spellCheck={false}
    onChange={event=>{setQuery(event.target.value);setActive(0);}}
    onKeyDown={event=>{if(event.nativeEvent.isComposing)return;
     if(event.key==='Enter'){event.preventDefault();choose(view.items[highlighted]);return;}
     if(['ArrowDown','ArrowUp','PageDown','PageUp'].includes(event.key)||(event.key==='Home'||event.key==='End')&&event.ctrlKey){event.preventDefault();const next=stepQuickSearch(view.items.length,highlighted,event.key);if(next!==null)show(next);}}}/>
   <div className="lv-quick-search-filters" role="group" aria-label="Show">{QUICK_SEARCH_FILTERS.map(name=><button key={name} type="button" aria-pressed={filter===name} className={filter===name?'active':''} onClick={()=>{setFilter(name);setActive(0);}}>{name}</button>)}</div>
   <div className="lv-quick-search-results" id="lv-quick-search-results" role="listbox" aria-label="Results" ref={list}>
    {view.sections.map(section=><div key={section.title} role="group" aria-label={section.title}>
     <div className="lv-quick-search-heading" role="presentation">{section.title}</div>
     {section.items.map(row=>{position++;const at=position;return <div key={row.id} id={optionId(row)} data-index={at} role="option" aria-selected={at===highlighted} className={'lv-quick-search-row'+(at===highlighted?' active':'')} onMouseMove={()=>{if(at!==highlighted)setActive(at);}} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(row)}>
      <span className="lv-quick-search-label">{row.label}</span>
      {row.detail&&<span className="lv-quick-search-detail">{row.detail}</span>}
      {row.hotkey&&<kbd className="lv-quick-search-key">{row.hotkey}</kbd>}
     </div>;})}
    </div>)}
    {view.empty&&<p className="lv-quick-search-empty" role="status">{QUICK_SEARCH_EMPTY[view.empty]}</p>}
   </div>
  </div>
 </Modal>;
}
