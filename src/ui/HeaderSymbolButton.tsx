import React from 'react';
import {InfoIcon,SearchIcon} from './icons';
import type {SymbolSearchOrigin} from './symbol-search';

// The header symbol is a button that opens the symbol search, not a text box with a browser list.
// It keeps the accessible name "Search symbols" so existing flows and screen reader users find the same control.
/** Ctrl+K opens Quick search, so the hint names the key that opens the symbol search now: typing the
 * symbol on the chart (keyboard-shortcuts "Symbol search (type the symbol)", A to Z). */
export const HEADER_SYMBOL_SEARCH_HINT='type the symbol';
export function headerSymbolButtonView(symbol:string):{text:string;label:string;title:string}{
 const text=symbol.trim()||'Symbol';
 return{text,label:'Search symbols',title:'Symbol search: '+text+' ('+HEADER_SYMBOL_SEARCH_HINT+')'};
}
/** With `onInfo`, a right-click on the symbol opens Symbol info, and a small info button beside it does too
 * (entry wording "Symbol info…"; the button placement is our own choice). */
export function HeaderSymbolButton({symbol,onOpen,onInfo}:{symbol:string;onOpen:(query:string,origin:SymbolSearchOrigin)=>void;onInfo?:()=>void}){
 const view=headerSymbolButtonView(symbol);
 const open=<button type="button" className="symbol-search-open symbol-button" aria-label={view.label} title={view.title} onClick={()=>onOpen('','toolbar')} onContextMenu={onInfo?event=>{event.preventDefault();onInfo();}:undefined}><SearchIcon width={18} height={18}/><span className="symbol-button-text">{view.text}</span></button>;
 if(!onInfo)return open;
 return <>{open}<button type="button" className="lv-icon-button" aria-label="Symbol info" title="Symbol info…" onClick={onInfo}><InfoIcon/></button></>;
}
