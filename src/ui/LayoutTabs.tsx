import React,{useEffect,useRef,useState} from 'react';
import type {MultiChartState} from './MultiChartGrid';
import type {LayoutLibraryAction} from './LayoutLibraryDialog';
import {layoutIsDirty,layoutName,type LayoutLibrary,type SavedLayout} from './layout-library';
import {NEW_TAB_LAYOUT_NAME,canCloseLayoutTab,closeLayoutTab,closingTabSuccessor,cycleLayoutTab,layoutTabChange,layoutTabLabel,moveLayoutTab,type LayoutTabQuote,readLayoutTabs,reconcileLayoutTabs,windowTabSuccessor,withoutElsewhere,writeLayoutTabs} from './layout-tabs';
import {AUTOSAVE_OFF_WINDOW_MESSAGE} from './window-mode';
import {WICK_LABELS,documentWickTheme,revealTab,tabStripWheel,wickStripSnapshot} from './wick-mode';
import {layoutTabQuote} from './layout-tab-quote';
import {liveChartsOf,liveRefOfDatasetId,type LiveChartRef} from './live-workspace';
import {WATCH_LIVE_DAILY,type WatchFeed} from '../watchlists/live-watch';
import {ALPACA_IEX_PROVIDER_ID,ALPACA_MAX_SYMBOLS,ALPACA_STUB_PROVIDER_ID} from '../domain/alpaca-live';
import {COINBASE_PROVIDER_ID} from '../domain/coinbase-live';
import type {BarDataset} from '../domain/types';
import type {WatchBook} from '../watchlists/model';
import {FIXTURE_CAPABILITIES} from '../domain/fixtures';
import {demoIntradaySources} from './workspace-grid';
import './layout-tabs.css';

// The layout tab strip. Every tab command maps to the existing layout library action
// (open, create, rename), so saving, dirty checks, live feeds and Undo clearing are the layout menu's. A render helper
// (layoutTabsView) plus one hook (useLayoutTabs) so the App change stays a few lines.

export interface LayoutTabsUi {editing?:{id:string;name:string};dragging?:string;dropTarget?:string;
 /** Autosave is off and the active layout has unsaved changes: the switch waits for Save or Discard. closeId: the tab
  * that closes once the switch is done. */
 decision?:{action:Extract<LayoutLibraryAction,{kind:'open'|'create'}>;closeId?:string}}
export interface LayoutTabsViewProps {
 library:LayoutLibrary;grid:MultiChartState;open:readonly string[];ui:LayoutTabsUi;disabled?:boolean;
 onUi:(next:LayoutTabsUi)=>void;
 /** Runs a library action (open or create); with closeId the tab closes after it succeeded. */
 onSwitch:(action:Extract<LayoutLibraryAction,{kind:'open'|'create'}>,closeId?:string)=>void;
 onClose:(id:string)=>void;onRename:(id:string,name:string)=>void;onMove:(fromId:string,toId:string)=>void;
 /** Open layout in new window (desktop app only). */
 onNewWindow?:(id:string)=>void;
 /** The active chart's ticker and daily change for the active tab (the layout name moves to the tooltip). */
 quote?:LayoutTabQuote|null;
 /** Each inactive tab's own quote (its main chart's live price), by layout id. */
 quotes?:Readonly<Record<string,LayoutTabQuote|null>>;
 /** Shrink the app to this row of tabs (desktop main window only). */
 onWick?:()=>void;
}
export function layoutTabsView(props:LayoutTabsViewProps){
 const {library,grid,open,ui}=props,dirty=layoutIsDirty(library,grid),entries=new Map(library.entries.map(row=>[row.id,row]));
 const switching=(action:Extract<LayoutLibraryAction,{kind:'open'|'create'}>,closeId?:string)=>{
  if(dirty&&!library.autosave){props.onUi({decision:{action,...(closeId?{closeId}:{})}});return;}
  props.onUi({});props.onSwitch(action,closeId);
 };
 const close=(id:string)=>{
  if(!canCloseLayoutTab(open,id))return;const successor=closingTabSuccessor(open,id,library.activeId);
  if(successor)switching({kind:'open',id:successor},id);else props.onClose(id);
 };
 const finishRename=(commit:boolean)=>{const editing=ui.editing;props.onUi({});if(!commit||!editing)return;const old=entries.get(editing.id);if(old&&editing.name.trim()!==old.name)props.onRename(editing.id,editing.name);};
 const tabKeys=(raw:React.KeyboardEvent<HTMLElement>,id:string)=>{
  // Handled keys stop here, so the chart shortcuts on the window (Delete removes a drawing) never see them.
  const event={key:raw.key,ctrlKey:raw.ctrlKey,metaKey:raw.metaKey,shiftKey:raw.shiftKey,preventDefault:()=>{raw.preventDefault();raw.stopPropagation();}};
  const at=open.indexOf(id),focus=(to:string|undefined)=>{if(to&&typeof document!=='undefined')document.getElementById?.(tabDomId(to))?.focus?.();};
  if((event.ctrlKey||event.metaKey)&&event.shiftKey&&(event.key==='PageUp'||event.key==='PageDown')){event.preventDefault();const to=open[at+(event.key==='PageUp'?-1:1)];if(to)props.onMove(id,to);return;}
  if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();focus(open[(at+(event.key==='ArrowRight'?1:-1)+open.length)%open.length]);return;}
  if(event.key==='Home'||event.key==='End'){event.preventDefault();focus(event.key==='Home'?open[0]:open[open.length-1]);return;}
  if(event.key==='F2'){event.preventDefault();const row=entries.get(id);if(row)props.onUi({editing:{id,name:row.name}});return;}
  if(event.key==='Delete'&&canCloseLayoutTab(open,id)){event.preventDefault();close(id);}
 };
 const decision=ui.decision,activeName=entries.get(library.activeId)?.name??'';
 return <div className="lv-layout-tabs" data-layout-tabs="">
  <div role="tablist" aria-label="Layout tabs" className="lv-layout-tabs-list" onWheel={tabStripWheel}>
   {open.map(id=>{const row=entries.get(id);if(!row)return null;const active=id===library.activeId,label=layoutTabLabel(row,active?grid:undefined),editing=ui.editing?.id===id,quote=(active?props.quote:props.quotes?.[id])?.symbol?(active?props.quote:props.quotes?.[id])??null:null,change=quote?layoutTabChange(quote.changePercent):null;
    return <div key={id} className="lv-layout-tab" data-active={active?'true':undefined} data-drop-target={ui.dropTarget===id&&ui.dragging!==id?'true':undefined}
     draggable={!editing&&!props.disabled} onDragStart={event=>{event.dataTransfer?.setData?.('text/plain',row.name);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';props.onUi({dragging:id});}}
     onDragOver={event=>{if(!ui.dragging)return;event.preventDefault();if(ui.dropTarget!==id)props.onUi({dragging:ui.dragging,dropTarget:id});}}
     onDrop={event=>{event.preventDefault();const from=ui.dragging;props.onUi({});if(from&&from!==id)props.onMove(from,id);}}
     onDragEnd={()=>{if(ui.dragging)props.onUi({});}}>
     {editing?<input className="lv-layout-tab-rename" aria-label="Layout name" value={ui.editing!.name} maxLength={200} autoFocus
       onChange={event=>props.onUi({editing:{id,name:event.target.value}})} onBlur={()=>finishRename(true)}
       onKeyDown={event=>{if(event.nativeEvent?.isComposing)return;if(event.key==='Enter'){event.preventDefault();finishRename(true);}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finishRename(false);}}}/>
     :<button type="button" role="tab" id={tabDomId(id)} className="lv-layout-tab-button" aria-selected={active} tabIndex={active?0:-1} disabled={props.disabled}
       title={(quote?quote.symbol+(quote.priceText?' '+quote.priceText:'')+(change?' '+change.text:'')+' · ':'')+row.name+(active&&dirty?' · Unsaved changes':'')+' · Double-click to rename'}
       onClick={()=>{if(!active)switching({kind:'open',id});}} onDoubleClick={()=>props.onUi({editing:{id,name:row.name}})} onKeyDown={event=>tabKeys(event,id)}
       onAuxClick={event=>{if(event.button===1){event.preventDefault();close(id);}}}>
       {quote?<><span className="lv-layout-tab-symbol">{quote.symbol}</span>{quote.priceText&&<span className="lv-layout-tab-price">{quote.priceText}</span>}{change&&<span className="lv-layout-tab-change" data-tone={change.tone}>{change.text}</span>}<span className="lv-layout-tab-name lv-visually-hidden">{label.name}</span></>:<>{label.symbol&&<span className="lv-layout-tab-symbol">{label.symbol}</span>}{label.symbol&&<span className="lv-layout-tab-sep" aria-hidden="true">/</span>}<span className="lv-layout-tab-name">{label.name}</span></>}{active&&(dirty?<span className="lv-layout-tab-dirty" aria-label="Unsaved changes">*</span>:<span className="lv-layout-tab-dirty" data-clean="" aria-hidden="true"/>)}
      </button>}
     {props.onNewWindow&&!editing&&(open.length>1||!active)&&<button type="button" className="lv-layout-tab-window" aria-label={'Open '+row.name+' in new window'} title="Open layout in new window" tabIndex={-1} disabled={props.disabled} onClick={()=>props.onNewWindow!(id)}><span aria-hidden="true">⧉</span></button>}
     {canCloseLayoutTab(open,id)&&!editing&&<button type="button" className="lv-layout-tab-close" aria-label={'Close tab '+row.name} title="Close tab" tabIndex={-1} disabled={props.disabled} onClick={()=>close(id)}>×</button>}
    </div>;})}
  </div>
  <button type="button" className="lv-layout-tab-new" aria-label="New tab" title="New tab (Ctrl+T)" disabled={props.disabled} onClick={()=>switching({kind:'create',name:NEW_TAB_LAYOUT_NAME})}>+</button>
  {props.onWick&&<button type="button" className="lv-layout-tab-wick" aria-label={WICK_LABELS.command} title={WICK_LABELS.buttonTitle} onClick={props.onWick}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 1.5v3M8 11.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><rect x="5" y="4.5" width="6" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg></button>}
  {decision&&<section role="alertdialog" aria-label="Unsaved layout" className="lv-layout-tabs-prompt"><span>Save changes to “{activeName}” first?</span>
   <button type="button" autoFocus onClick={()=>props.onUi({})}>Cancel</button>
   <button type="button" onClick={()=>{props.onUi({});props.onSwitch({...decision.action,decision:'save'},decision.closeId);}}>Save and switch</button>
   <button type="button" onClick={()=>{props.onUi({});props.onSwitch({...decision.action,decision:'discard'},decision.closeId);}}>Discard and switch</button>
  </section>}
 </div>;
}
/** The live source a layout tab's main chart reads: the selected cell of the layout (the cell its label names), on a live stock or
 * crypto feed. A saved layout loaded from disk carries its live chart as a saved reference (workspace liveCharts, by cell id).
 * Demo, imported and FRED charts have none, so their tab keeps its plain label. */
export function layoutTabLiveSource(entry:Pick<SavedLayout,'id'|'grid'>,workspace?:object|null):{providerId:string;symbol:string;datasetIds:string[]}|null{
 const grid=entry.grid,cellId=grid.layout.activeCellId,row=grid.layout.cells.find(cell=>cell.id===cellId)??grid.layout.cells[0];if(!row)return null;
 const cell=grid.cells[row.id];let ref:LiveChartRef|null=cell?liveRefOfDatasetId(cell.datasetId):null;
 if(!ref&&workspace){
  try{const saved=liveChartsOf(workspace)[row.id];if(saved){const context=saved.layouts?.find(item=>item.layoutId===entry.id);ref=context?('live' in context?null:context):saved;}}catch{ref=null;}
 }
 if(!ref||(row.symbol&&ref.symbol!==row.symbol))return null;
 const alpaca=ref.providerId===ALPACA_STUB_PROVIDER_ID||ref.providerId==='alpaca-iex'||ref.providerId===ALPACA_IEX_PROVIDER_ID,providerId=alpaca?ALPACA_IEX_PROVIDER_ID:ref.providerId;
 if(!alpaca&&providerId!==COINBASE_PROVIDER_ID)return null;
 const daily='live:'+providerId+':'+ref.symbol+':'+WATCH_LIVE_DAILY,intraday='live:'+providerId+':'+ref.symbol+':'+ref.interval;
 return{providerId,symbol:ref.symbol,datasetIds:intraday===daily?[daily]:[intraday,daily]};
}
/** The quote of an inactive tab, from the quote datasets the watchlist reads (an open chart's feed or a background daily feed).
 * Example, imported and FRED charts (and a live chart whose feeds are not open yet) read their main chart's own loaded dataset:
 * its last close, and the change the active tab would show for it (the watchlist's row for the same market included, from the
 * workspace's watch book). null: none of these is loaded (the tab shows its plain label). */
export function inactiveTabQuote(entry:Pick<SavedLayout,'id'|'grid'>,datasets:readonly BarDataset[],workspace?:object|null):LayoutTabQuote|null{
 const source=layoutTabLiveSource(entry,workspace),useful=(quote:LayoutTabQuote|null)=>!!quote&&(!!quote.priceText||quote.changePercent!==null);
 if(source)for(const id of source.datasetIds){const dataset=datasets.find(row=>row.provenance.datasetId===id);if(!dataset)continue;const quote=layoutTabQuote(dataset,datasets);if(useful(quote))return quote;}
 const grid=entry.grid,row=grid.layout.cells.find(cell=>cell.id===grid.layout.activeCellId)??grid.layout.cells[0],datasetId=row?grid.cells[row.id]?.datasetId:undefined;
 // An example chart on an intraday interval: its series is generated only for the active layout's charts (not in the universe),
 // so it is taken from the same cache (placeholders without bars when example data is hidden).
 const demo=typeof datasetId==='string'?DEMO_INTRADAY_ID.exec(datasetId):null;
 const dataset=datasetId?datasets.find(item=>item.provenance.datasetId===datasetId)??(demo?demoIntradaySources(demo[1]!).find(item=>item.provenance.datasetId===datasetId):undefined):undefined;
 if(!dataset||(row?.symbol&&dataset.instrument.symbol!==row.symbol))return null;
 let book:WatchBook|null=null;try{const held=(workspace as {watchBook?:WatchBook}|null|undefined)?.watchBook;book=held&&typeof held==='object'?held:null;}catch{book=null;}
 const quote=layoutTabQuote(dataset,datasets,book);if(!quote||!useful(quote))return null;
 // The change is the daily change: an intraday example series has no daily companion, so the symbol's daily example series gives it.
 if(quote.changePercent===null&&demo){const daily=datasets.find(item=>item.provenance.datasetId===FIXTURE_CAPABILITIES.id+':'+demo[1]&&item.instrument.symbol===dataset.instrument.symbol),change=daily?layoutTabQuote(daily,datasets,book)?.changePercent??null:null;if(change!==null)return{...quote,changePercent:change};}
 return quote;
}
/** An intraday example source id (the same shape workspace-grid gives the generated series). */
const DEMO_INTRADAY_ID=/^lv-synthetic-v1:(.+):(1m|5m|15m|60m)$/;
/** The background daily feeds that give the inactive tabs their quotes. They come after everything else: a stock symbol that is
 * not streaming yet is added only while the Alpaca limit leaves a free slot after charts, alerts, paper orders and the watchlist
 * (`planned`, `taken`), so a tab never takes a slot from a symbol the owner chose. A tab left out shows no price. */
export function layoutTabFeeds(input:{library:Pick<LayoutLibrary,'activeId'|'entries'>;open:readonly string[];workspace?:object|null;taken:ReadonlySet<string>;planned:readonly WatchFeed[];charted:ReadonlySet<string>;max?:number}):WatchFeed[]{
 const max=input.max??ALPACA_MAX_SYMBOLS,used=new Set(input.taken),have=new Set([...input.charted,...input.planned.map(feed=>feed.datasetId)]),out:WatchFeed[]=[];
 for(const feed of input.planned)if(feed.providerId===ALPACA_IEX_PROVIDER_ID)used.add(feed.symbol);
 const entries=new Map(input.library.entries.map(row=>[row.id,row]));
 for(const id of input.open){
  const entry=entries.get(id);if(!entry||id===input.library.activeId)continue;
  const source=layoutTabLiveSource(entry,input.workspace);if(!source)continue;
  const daily=source.datasetIds[source.datasetIds.length-1];if(have.has(daily))continue;
  if(source.providerId===ALPACA_IEX_PROVIDER_ID&&!used.has(source.symbol)){if(used.size>=max)continue;used.add(source.symbol);}
  have.add(daily);out.push({datasetId:daily,providerId:source.providerId,symbol:source.symbol,resolution:WATCH_LIVE_DAILY,priority:'watch',marketKey:'layout-tab:'+source.symbol});
 }
 return out;
}
export const tabDomId=(id:string)=>'lv-layout-tab-'+id.replace(/[^A-Za-z0-9_-]/g,'_');

type Storage_={getItem(key:string):string|null;setItem(key:string,value:string):void};
const defaultStorage=():Storage_|null=>{try{return globalThis.localStorage??null;}catch{return null;}};
const same=(a:readonly string[]|null,b:readonly string[])=>!!a&&a.length===b.length&&a.every((id,index)=>id===b[index]);
export interface UseLayoutTabsOptions {
 /** False until the saved workspace is in: the tab list is neither read nor written before (a fresh start would prune it). */
 loaded:boolean;library:LayoutLibrary|undefined;grid:MultiChartState|undefined;
 /** The App's layout action from the header menu path (layoutAction(action,'menu')). */
 run:(action:LayoutLibraryAction)=>Promise<void>;onError:(error:unknown)=>void;
 /** Ctrl+T and Ctrl+Tab are live (no dialog open). */
 keyboard:boolean;disabled?:boolean;storage?:Storage_|null;
 /** Layouts open in other windows (they have no tab here), and Open layout in new window (null: not offered). */
 elsewhere?:readonly string[];openWindow?:((id:string)=>Promise<void>)|null;
 /** While loading, render an empty strip of the same height, so the UI does not move down when the tabs arrive. */
 reserve?:boolean;
 /** The active chart's ticker and daily change, shown on the active tab. */
 quote?:LayoutTabQuote|null;
 /** Wick mode (App useWickMode). While it is on, this strip sends main what it shows, for the strip window,
  * and a tab the strip window asks for opens here. null: not offered. */
 wick?:{active:boolean;enter():void;exit():void}|null;
 /** Every inactive tab shows its own main chart's live quote, read from these quote datasets (the watchlist's: open chart feeds
  * and background feeds, see layoutTabFeeds). workspace: the saved live chart references of layouts loaded from disk. */
 tabQuotes?:{datasets:readonly BarDataset[];workspace?:object|null}|null;
 /** The open tabs after each change (App plans the inactive tabs' quote feeds from them). */
 onOpenTabs?:(ids:readonly string[])=>void;
}
/** The tab strip element, or null while the workspace is loading (an empty placeholder strip with `reserve`). */
export function useLayoutTabs(options:UseLayoutTabsOptions):React.ReactElement|null{
 const {loaded,library,grid}=options,storage=options.storage===undefined?defaultStorage():options.storage;
 const [open,setOpen]=useState<string[]|null>(null),[ui,setUi]=useState<LayoutTabsUi>({});
 const openRef=useRef<string[]|null>(null),prevActive=useRef<string|null>(null),sessionStart=useRef(Date.now()),latest=useRef(options);latest.current=options;
 const commitOpen=(next:string[])=>{if(same(openRef.current,next))return;openRef.current=next;setOpen(next);writeLayoutTabs(storage,next);};
 // The active layout always has a tab. A layout made in this session (New tab, Make a copy, Create new layout, import)
 // opens as a new tab after the current one; an older layout opened from the layout menu or dialog loads into the
 // current tab (our own rule for the split).
 useEffect(()=>{
  if(!loaded||!library)return;const first=openRef.current===null,base=openRef.current??readLayoutTabs(storage)??[];
  const entry=library.entries.find(row=>row.id===library.activeId),fresh=!!entry&&entry.createdAt>=sessionStart.current;
  const next=reconcileLayoutTabs(base,library,first?null:prevActive.current,fresh?'insert':'replace');prevActive.current=library.activeId;commitOpen(next);
 },[loaded,library]);
 const run=(action:LayoutLibraryAction)=>latest.current.run(action).catch(error=>{latest.current.onError(error);throw error;});
 const onSwitch=(action:Extract<LayoutLibraryAction,{kind:'open'|'create'}>,closeId?:string)=>{run(action).then(()=>{if(closeId&&openRef.current)commitOpen(closeLayoutTab(openRef.current,closeId));},()=>{/* reported */});};
 useEffect(()=>{
  // On the document (it sees the key just before the window chart shortcuts, which leave Ctrl+T and Ctrl+Tab alone).
  const host=typeof document!=='undefined'&&typeof document.addEventListener==='function'?document:null;if(!options.keyboard||!host)return;
  const keys=(event:KeyboardEvent)=>{
   if(!(event.ctrlKey||event.metaKey)||event.altKey||event.isComposing||event.defaultPrevented)return;
   const target=event.target as HTMLElement|null;if(target?.closest?.('input,textarea,select,[contenteditable=true],[role=dialog],[role=alertdialog]'))return;
   const current=latest.current,book=current.library,tabs=openRef.current;if(!current.loaded||current.disabled||!book||!tabs||!current.grid)return;
   const dirtyBlock=layoutIsDirty(book,current.grid)&&!book.autosave;
   if(!event.shiftKey&&event.key.toLowerCase()==='t'){event.preventDefault();if(dirtyBlock)setUi({decision:{action:{kind:'create',name:NEW_TAB_LAYOUT_NAME}}});else void run({kind:'create',name:NEW_TAB_LAYOUT_NAME}).catch(()=>{});return;}
   if(event.key==='Tab'){const to=cycleLayoutTab(tabs,book.activeId,event.shiftKey?-1:1);if(!to||to===book.activeId)return;event.preventDefault();if(dirtyBlock)setUi({decision:{action:{kind:'open',id:to}}});else void run({kind:'open',id:to}).catch(()=>{});}
  };
  host.addEventListener('keydown',keys);return()=>host.removeEventListener('keydown',keys);
 },[options.keyboard]);
 // A layout open in another window leaves this strip: the detached tab moves to its window.
 const elsewhere=options.elsewhere??[],elsewhereKey=elsewhere.join('|');
 useEffect(()=>{if(!loaded||!library||!openRef.current)return;commitOpen(withoutElsewhere(openRef.current,elsewhere,library.activeId));},[loaded,library,elsewhereKey]);
 const openInWindow=(id:string)=>{
  const current=latest.current,book=current.library,tabs=openRef.current,openWindow=current.openWindow;if(!openWindow||!book||!tabs||!current.grid)return;
  void (async()=>{
   const next=windowTabSuccessor(tabs,id,book.activeId);
   if(next){if(layoutIsDirty(book,current.grid!)&&!book.autosave)throw new Error(AUTOSAVE_OFF_WINDOW_MESSAGE);await latest.current.run({kind:'open',id:next});}
   await openWindow(id);
   const after=latest.current.library;if(openRef.current&&after)commitOpen(withoutElsewhere(openRef.current,[id],after.activeId));
  })().catch(error=>latest.current.onError(error));
 };
 // While Wick mode is on, each change of what this strip shows (tabs, the active quote, the theme) goes to the
 // strip window. Unchanged text is not sent again.
 const openKey=open?open.join('|'):'';
 useEffect(()=>{if(open)latest.current.onOpenTabs?.(open);},[openKey]);
 // Tabs never shrink: past the strip's width the row scrolls, and the active tab is kept in view.
 const activeId=library?.activeId??'';
 useEffect(()=>{if(activeId&&typeof document!=='undefined')revealTab(document.getElementById?.(tabDomId(activeId)));},[activeId,openKey,loaded]);
 const quoteSource=options.tabQuotes,tabQuotes:Record<string,LayoutTabQuote|null>={};
 if(quoteSource&&library&&open)for(const id of open){if(id===library.activeId)continue;const entry=library.entries.find(row=>row.id===id);if(entry)tabQuotes[id]=inactiveTabQuote(entry,quoteSource.datasets,quoteSource.workspace);}
 const wickActive=options.wick?.active===true,wickSent=useRef('');
 useEffect(()=>{
  if(!wickActive){wickSent.current='';return;}
  const lv=typeof window!=='undefined'?window.lv:undefined;if(!loaded||!library||!grid||!open||typeof lv?.publishWickStrip!=='function')return;
  const snapshot=wickStripSnapshot({library,grid,open,quote:options.quote??null,quotes:tabQuotes,theme:documentWickTheme()});if(!snapshot)return;
  const text=JSON.stringify(snapshot);if(text===wickSent.current)return;wickSent.current=text;
  void Promise.resolve(lv.publishWickStrip(snapshot)).catch(()=>undefined);
 });
 // A tab clicked in the strip window opens here (the strip follows). With Autosave off and unsaved changes the
 // full window comes back first, so the Save or Discard question is seen.
 const wickOffered=!!options.wick;
 useEffect(()=>{
  const lv=typeof window!=='undefined'?window.lv:undefined;if(!wickOffered||typeof lv?.onWickTabRequest!=='function')return;
  return lv.onWickTabRequest(request=>{
   const current=latest.current,book=current.library,tabs=openRef.current,id=request&&typeof request.id==='string'?request.id:'';
   if(!current.loaded||current.disabled||!book||!tabs||!current.grid||!tabs.includes(id)||id===book.activeId)return;
   if(layoutIsDirty(book,current.grid)&&!book.autosave){setUi({decision:{action:{kind:'open',id}}});current.wick?.exit();return;}
   void run({kind:'open',id}).catch(()=>{});
  });
 },[wickOffered]);
 if(!loaded||!library||!grid||!open)return options.reserve?<div className="lv-layout-tabs" data-layout-tabs="" aria-hidden="true"/>:null;
 return layoutTabsView({library,grid,open,ui,disabled:options.disabled,quote:options.quote??null,quotes:tabQuotes,onUi:setUi,onSwitch,...(options.wick?{onWick:options.wick.enter}:{}),...(options.openWindow?{onNewWindow:openInWindow}:{}),
  onClose:id=>{if(openRef.current)commitOpen(closeLayoutTab(openRef.current,id));},
  onMove:(from,to)=>{if(openRef.current)commitOpen(moveLayoutTab(openRef.current,from,to));},
  onRename:(id,name)=>{let clean:string;try{clean=layoutName(name);}catch(error){latest.current.onError(error);return;}void run({kind:'rename',id,name:clean}).catch(()=>{});}});
}
