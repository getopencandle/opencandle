import React,{useEffect,useState} from 'react';
import {WICK_LABELS,WICK_THEME_TOKENS,revealTab,tabStripWheel,validWickSnapshot,wickTabTitle,type WickStripSnapshot,type WickStripTab} from './wick-mode';
import './layout-tabs.css';
import './wick-strip.css';

// The Wick mode strip window. It draws the tab strip the main window sends (through main) with the main
// window's theme colours, in the same tab styles. The empty part of the strip drags the window; a tab click shows that tab
// (the active tab opens the full window); the expand button, a double-click and Esc open the full window; a right-click opens
// the strip menu (Open OpenCandle, Always on top, Exit Wick mode, Quit). It has no data, feed or workspace access of its own.

interface StripBridge{
 wickStripReady?():Promise<{ok:boolean;value?:unknown}>;onWickSnapshot?(handler:(value:unknown)=>void):()=>void;
 wickRestore?():Promise<unknown>;wickSelectTab?(input:{id:string}):Promise<unknown>;wickMenu?():Promise<unknown>;
}
const bridge=():StripBridge|null=>{try{return typeof window!=='undefined'&&window.lv?(window.lv as unknown as StripBridge):null;}catch{return null;}};
const quietly=(value:unknown)=>{void Promise.resolve(value).catch(()=>undefined);};

/** The theme colours as inline custom properties on the root (tokens the snapshot leaves out keep the stylesheet value). */
export function applyWickTheme(root:{style:{setProperty(name:string,value:string):void;removeProperty(name:string):void}}|null|undefined,theme:Record<string,string>):void{
 if(!root)return;
 for(const token of WICK_THEME_TOKENS){try{if(theme[token])root.style.setProperty(token,theme[token]);else root.style.removeProperty(token);}catch{/* best effort */}}
}
export function WickStripTabs({snapshot,onSelect,onRestore}:{snapshot:WickStripSnapshot|null;onSelect:(tab:WickStripTab)=>void;onRestore:()=>void}){
 return <div className="lv-wick" data-wick-strip="" onDoubleClick={onRestore}>
  <div role="tablist" aria-label={WICK_LABELS.strip} className="lv-layout-tabs-list lv-wick-tabs" onWheel={tabStripWheel}>
   {snapshot?snapshot.tabs.map(tab=><div key={tab.id} className="lv-layout-tab" data-active={tab.active?'true':undefined}>
    <button type="button" role="tab" className="lv-layout-tab-button" aria-selected={tab.active} title={wickTabTitle(tab)} onClick={()=>onSelect(tab)}>
     {tab.symbol&&<span className="lv-layout-tab-symbol">{tab.symbol}</span>}
     {tab.price&&<span className="lv-layout-tab-price">{tab.price}</span>}
     {tab.change&&<span className="lv-layout-tab-change" data-tone={tab.tone}>{tab.change}</span>}
     {!tab.price&&!tab.change&&<>{tab.symbol&&<span className="lv-layout-tab-sep" aria-hidden="true">/</span>}<span className="lv-layout-tab-name">{tab.name}</span></>}
    </button>
   </div>):<span className="lv-wick-waiting">{WICK_LABELS.waiting}</span>}
  </div>
  <div className="lv-wick-grip" aria-hidden="true"/>
  <button type="button" className="lv-wick-expand" aria-label={WICK_LABELS.expand} title={WICK_LABELS.expandTitle} onClick={onRestore}>
   <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </button>
 </div>;
}
export function WickStrip(){
 const [snapshot,setSnapshot]=useState<WickStripSnapshot|null>(null);
 useEffect(()=>{
  const lv=bridge();let live=true;
  const off=typeof lv?.onWickSnapshot==='function'?lv.onWickSnapshot(value=>{const next=validWickSnapshot(value);if(next&&live)setSnapshot(next);}):undefined;
  if(typeof lv?.wickStripReady==='function')void lv.wickStripReady().then(result=>{const next=result&&result.ok?validWickSnapshot(result.value):null;if(next&&live)setSnapshot(current=>current??next);}).catch(()=>undefined);
  const keys=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();quietly(bridge()?.wickRestore?.());}};
  const menu=(event:MouseEvent)=>{event.preventDefault();quietly(bridge()?.wickMenu?.());};
  window.addEventListener('keydown',keys);window.addEventListener('contextmenu',menu);
  return()=>{live=false;off?.();window.removeEventListener('keydown',keys);window.removeEventListener('contextmenu',menu);};
 },[]);
 useEffect(()=>{applyWickTheme(typeof document!=='undefined'?document.documentElement:null,snapshot?.theme??{});},[snapshot?.theme]);
 // Tabs keep their full width; the active one is kept in view when the row is longer than the strip.
 const activeId=snapshot?.tabs.find(tab=>tab.active)?.id??'';
 useEffect(()=>{if(activeId&&typeof document!=='undefined')revealTab(document.querySelector?.('.lv-wick-tabs .lv-layout-tab[data-active=true]') as HTMLElement|null);},[activeId,snapshot?.tabs.length]);
 const restore=()=>quietly(bridge()?.wickRestore?.());
 const select=(tab:WickStripTab)=>{if(tab.active)restore();else quietly(bridge()?.wickSelectTab?.({id:tab.id}));};
 return <WickStripTabs snapshot={snapshot} onSelect={select} onRestore={restore}/>;
}
