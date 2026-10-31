import {useEffect,useRef,useState} from 'react';
import type {LayoutLibrary} from './layout-library';
import type {MultiChartState} from './MultiChartGrid';
import {layoutTabChange,layoutTabLabel,type LayoutTabQuote} from './layout-tabs';
import {wickPreferencesOf,withWickPreferences,type AppPreferences} from './app-preferences';

// Wick mode shrinks OpenCandle to its row of layout
// tabs, a small frameless strip on top of other windows (electron/wick.cjs). The main window is hidden, not closed: it keeps
// every feed running and sends the strip what its own tab strip shows (wickStripSnapshot), with the active theme's colours.
// The strip window (WickStrip.tsx, the same page with ?window=wick) only draws it and asks main for a tab, the full window or
// its menu. Main decides trust by the sending window, never by this page's URL.

export type WickStripTab={id:string;symbol:string;name:string;active:boolean;price?:string;change?:string;tone?:'up'|'down'|'flat'};
export type WickStripSnapshot={tabs:WickStripTab[];theme:Record<string,string>};
export type WickModeState={active:boolean;alwaysOnTop:boolean;collapseOnBlur:boolean};
/** The same list as electron/wick.cjs THEME_TOKENS. */
export const WICK_THEME_TOKENS:readonly string[]=Object.freeze(['--lv-bg-raised','--lv-bg-surface','--lv-text-primary','--lv-text-secondary','--lv-text-hint','--lv-hover','--lv-hover-strong','--lv-accent','--lv-focus-ring','--lv-positive-text','--lv-negative-text','--lv-border']);
export const WICK_MAX_TABS=50;
export const WICK_LABELS=Object.freeze({
 command:'Wick mode',
 buttonTitle:'Wick mode (Ctrl+Shift+M): shrink OpenCandle to this row of tabs, on top of other windows',
 expand:'Open OpenCandle',
 expandTitle:'Open OpenCandle (Esc or double-click)',
 strip:'OpenCandle tabs',
 waiting:'OpenCandle',
 activeTitle:'Click to open OpenCandle',
 otherTitle:'Click to show this tab',
});
const COLOR=/^(?:#[0-9A-Fa-f]{3,8}|rgba?\(\s*[0-9.]+%?\s*(?:,\s*[0-9.]+%?\s*){2,3}\)|rgba?\(\s*[0-9.]+%?(?:\s+[0-9.]+%?){2}(?:\s*\/\s*[0-9.]+%?)?\s*\))$/;
const LAYOUT_ID=/^[A-Za-z0-9_.:-]{1,200}$/;
const plain=(value:string,max:number)=>value.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max);

/** `?window=wick` (main builds it, electron/wick.cjs stripURL). */
export function isWickStripWindow(search:unknown):boolean{
 if(typeof search!=='string'||!search)return false;
 try{return new URLSearchParams(search).get('window')==='wick';}catch{return false;}
}
/** The theme colours main accepts, read with `read(token)` (getComputedStyle of the main window's root). */
export function wickTheme(read:(token:string)=>string|null|undefined):Record<string,string>{
 const out:Record<string,string>={};
 for(const token of WICK_THEME_TOKENS){let value:string;try{value=String(read(token)??'').trim();}catch{continue;}if(value&&value.length<=60&&COLOR.test(value))out[token]=value;}
 return out;
}
export function documentWickTheme(doc:Document|null|undefined=typeof document==='undefined'?null:document):Record<string,string>{
 try{const root=doc?.documentElement;if(!root||typeof getComputedStyle!=='function')return{};const style=getComputedStyle(root);return wickTheme(token=>style.getPropertyValue(token));}catch{return{};}
}
/** What the strip shows: the open tabs in order with the label each one has in the main window (each tab with its own
 * ticker, price and daily change). null when there is nothing to show (no active tab). */
export function wickStripSnapshot(input:{library:Pick<LayoutLibrary,'activeId'|'entries'>;grid:MultiChartState;open:readonly string[];quote?:LayoutTabQuote|null;quotes?:Readonly<Record<string,LayoutTabQuote|null>>;theme:Record<string,string>}):WickStripSnapshot|null{
 const entries=new Map(input.library.entries.map(row=>[row.id,row])),tabs:WickStripTab[]=[];
 for(const id of input.open){
  const row=entries.get(id);if(!row||!LAYOUT_ID.test(id)||tabs.length>=WICK_MAX_TABS||tabs.some(tab=>tab.id===id))continue;
  const active=id===input.library.activeId,label=layoutTabLabel(row,active?input.grid:undefined),own=active?input.quote:input.quotes?.[id],quote=own?.symbol?own:null,change=quote?layoutTabChange(quote.changePercent):null;
  tabs.push({id,symbol:plain(quote?quote.symbol:label.symbol,40),name:plain(row.name,200),active,...(quote?.priceText?{price:plain(quote.priceText,40)}:{}),...(change?{change:plain(change.text,20),tone:change.tone}:{})});
 }
 return tabs.filter(tab=>tab.active).length===1?{tabs,theme:input.theme}:null;
}
/** The strip's own check of what main forwarded (main validated it already). */
export function validWickSnapshot(value:unknown):WickStripSnapshot|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const raw=value as {tabs?:unknown;theme?:unknown};if(!Array.isArray(raw.tabs)||!raw.tabs.length||raw.tabs.length>WICK_MAX_TABS)return null;
 const tabs:WickStripTab[]=[];
 for(const item of raw.tabs){
  if(!item||typeof item!=='object')return null;const tab=item as Record<string,unknown>;
  if(typeof tab.id!=='string'||!LAYOUT_ID.test(tab.id)||typeof tab.symbol!=='string'||typeof tab.name!=='string'||typeof tab.active!=='boolean')return null;
  const tone=tab.tone==='up'||tab.tone==='down'||tab.tone==='flat'?tab.tone:undefined;
  tabs.push({id:tab.id,symbol:plain(tab.symbol,40),name:plain(tab.name,200),active:tab.active,...(typeof tab.price==='string'?{price:plain(tab.price,40)}:{}),...(typeof tab.change==='string'?{change:plain(tab.change,20)}:{}),...(tone?{tone}:{})});
 }
 const theme=raw.theme&&typeof raw.theme==='object'&&!Array.isArray(raw.theme)?wickTheme(token=>{const v=(raw.theme as Record<string,unknown>)[token];return typeof v==='string'?v:null;}):{};
 return{tabs,theme};
}
/** The tooltip of a strip tab, as the main tab strip words it. */
export function wickTabTitle(tab:WickStripTab):string{
 const quote=tab.symbol?[tab.symbol,tab.price,tab.change].filter(Boolean).join(' ')+' · ':'';
 return quote+tab.name+' · '+(tab.active?WICK_LABELS.activeTitle:WICK_LABELS.otherTitle);
}
/** Tabs keep their full width, so a long row scrolls sideways: the mouse wheel scrolls it (both tab strips). */
export function tabStripWheel(event:{deltaX:number;deltaY:number;currentTarget:{scrollLeft:number;scrollWidth:number;clientWidth:number}}):void{
 const strip=event.currentTarget;if(strip.scrollWidth<=strip.clientWidth||Math.abs(event.deltaX)>=Math.abs(event.deltaY))return;
 strip.scrollLeft+=event.deltaY;
}
/** Scrolls a tab into view inside its strip (no page scroll). */
export function revealTab(tab:{scrollIntoView?(options?:ScrollIntoViewOptions):void}|null|undefined):void{
 try{tab?.scrollIntoView?.({block:'nearest',inline:'nearest'});}catch{/* best effort */}
}

interface WickBridge{
 enterWickMode?():Promise<{ok:boolean;error?:{message:string}}>;exitWickMode?():Promise<unknown>;
 configureWickMode?(input:{alwaysOnTop:boolean;collapseOnBlur:boolean}):Promise<unknown>;
 onWickState?(handler:(state:WickModeState)=>void):()=>void;
}
const bridgeOf=():WickBridge|null=>{try{return typeof window!=='undefined'&&window.lv?(window.lv as unknown as WickBridge):null;}catch{return null;}};
export interface WickModeApi{available:boolean;active:boolean;enter():void;exit():void}
/**
 * The main window's side. Offered only in the desktop main window. Once the workspace has loaded, the two Settings rows are sent
 * to main on every change; main's "Always on top" menu toggle comes back as a state event and is saved into the workspace.
 */
export function useWickMode(options:{enabled:boolean;loaded:boolean;preferences:AppPreferences;onPreferences:(next:AppPreferences)=>void;report:(message:string)=>void}):WickModeApi{
 const bridge=bridgeOf(),available=options.enabled&&typeof bridge?.enterWickMode==='function'&&typeof bridge?.configureWickMode==='function';
 const [active,setActive]=useState(false),latest=useRef(options);latest.current=options;
 const wanted=wickPreferencesOf(options.preferences);
 useEffect(()=>{if(!available||!options.loaded)return;void Promise.resolve(bridge!.configureWickMode!({alwaysOnTop:wanted.alwaysOnTop,collapseOnBlur:wanted.collapseOnBlur})).catch(()=>undefined);},[available,options.loaded,wanted.alwaysOnTop,wanted.collapseOnBlur]);
 useEffect(()=>{
  if(!available||typeof bridge?.onWickState!=='function')return;
  return bridge.onWickState(state=>{
   if(!state||typeof state!=='object')return;setActive(state.active===true);
   const current=latest.current;if(!current.loaded||typeof state.alwaysOnTop!=='boolean')return;
   const now=wickPreferencesOf(current.preferences);if(state.alwaysOnTop!==now.alwaysOnTop)current.onPreferences(withWickPreferences(current.preferences,{...now,alwaysOnTop:state.alwaysOnTop}));
  });
 },[available]);
 const enter=()=>{const lv=bridgeOf();if(typeof lv?.enterWickMode!=='function')return;void lv.enterWickMode().then(result=>{if(result&&result.ok===false&&result.error)latest.current.report(result.error.message);}).catch(()=>undefined);};
 const exit=()=>{const lv=bridgeOf();if(typeof lv?.exitWickMode==='function')void Promise.resolve(lv.exitWickMode()).catch(()=>undefined);};
 return{available,active,enter,exit};
}
