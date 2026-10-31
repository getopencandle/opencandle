import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {contextMenuKeyAction} from '../chart/context-menu-focus';
import {fitFixedMenu} from './menu-placement';
import './chart-commands.css';
import {EXAMPLE_SYMBOLS} from '../domain/demo-mode';
import './needs-live-data.css';

/** User-facing text of the chart's needs-live-data card and the example banner (plain words, no em dashes). */
export const NEEDS_LIVE_TITLE='This chart needs live data to display properly.';
export const NEEDS_LIVE_STOCKS='For real-time US stocks and ETFs, add a free Alpaca key in Data sources. A free Alpaca account is all you need.';
export const NEEDS_LIVE_CRYPTO='For crypto we recommend Coinbase. It is free and needs no account or key. Turn it on in Data sources.';
export const NEEDS_LIVE_EXAMPLE_ONLY='Example data covers only '+EXAMPLE_SYMBOLS.slice(0,-1).join(', ')+' and '+EXAMPLE_SYMBOLS.at(-1)+'.';
export const EXAMPLE_BANNER_TEXT='Example data. These prices are invented, not real market prices.';
export const OPEN_DATA_SOURCES='Open Data sources',LOAD_EXAMPLE='Load example data',LEAVE_EXAMPLE='Leave example mode';
export const showLiveLabel=(symbol:string)=>'Show live '+symbol;

export interface NeedsLiveDataProps {
 symbol:string;crypto:boolean;
 /** The recommended source is already set up: the card offers to open the live chart instead. */
 liveReady:boolean;
 /** Example mode is on (the symbol is not one of the example tickers). */
 example:boolean;
 onOpenLive:()=>void;onOpenDataSources:()=>void;onLoadExample:()=>void;
}
/** How much of the card fits a chart cell. 'full' shows everything, 'compact' drops the paragraphs (the tooltip
 * keeps them) and uses smaller type, 'tiny' keeps only the title and the main button. */
export type NeedsLiveSize='full'|'compact'|'tiny';
export function needsLiveSize(width:number,height:number):NeedsLiveSize{
 if(!(width>0&&height>0))return 'full';
 if(width<240||height<170)return 'tiny';
 if(width<420||height<300)return 'compact';
 return 'full';
}
/** Centered on an empty chart: why there are no bars, the source we recommend, and what to do next. */
export function NeedsLiveData(props:NeedsLiveDataProps&{size?:NeedsLiveSize;style?:React.CSSProperties;cellId?:string}){
 const size=props.size??'full',advice=props.crypto?NEEDS_LIVE_CRYPTO:NEEDS_LIVE_STOCKS;
 if(size!=='full')return <div className={'lv-needs-live lv-needs-live-'+size} data-lv-needs-live="" data-lv-needs-live-cell={props.cellId} style={props.style}>
  <section className="lv-needs-live-card" role="status" aria-label="No live data" title={advice+(props.example?' '+NEEDS_LIVE_EXAMPLE_ONLY:'')}>
   <h2>{NEEDS_LIVE_TITLE}</h2>
   <div className="lv-needs-live-actions">
    {props.liveReady?<button type="button" className="primary" onClick={props.onOpenLive}>{showLiveLabel(props.symbol)}</button>:<button type="button" className="primary" onClick={props.onOpenDataSources}>{OPEN_DATA_SOURCES}</button>}
    {size==='compact'&&!props.example&&<button type="button" onClick={props.onLoadExample}>{LOAD_EXAMPLE}</button>}
   </div>
  </section>
 </div>;
 return <div className="lv-needs-live" data-lv-needs-live="" data-lv-needs-live-cell={props.cellId} style={props.style}>
  <section className="lv-needs-live-card" role="status" aria-label="No live data">
   <svg className="lv-needs-live-icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M4 19h16M6 15l4-5 3 3 5-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
   <h2>{NEEDS_LIVE_TITLE}</h2>
   <p>{advice}</p>
   {props.example&&<p className="lv-needs-live-quiet">{NEEDS_LIVE_EXAMPLE_ONLY}</p>}
   <div className="lv-needs-live-actions">
    {props.liveReady?<button type="button" className="primary" onClick={props.onOpenLive}>{showLiveLabel(props.symbol)}</button>:<button type="button" className="primary" onClick={props.onOpenDataSources}>{OPEN_DATA_SOURCES}</button>}
    {props.liveReady&&<button type="button" onClick={props.onOpenDataSources}>{OPEN_DATA_SOURCES}</button>}
    {!props.example&&<button type="button" onClick={props.onLoadExample}>{LOAD_EXAMPLE}</button>}
   </div>
  </section>
 </div>;
}
/** Top of the chart while example mode is on. The first-run fallback (first-run.ts) passes its own text and a
 * "Try live again" button in place of "Leave example mode". */
export function ExampleDataBanner(props:{onLeave:()=>void;text?:string;leaveLabel?:string}){
 return <div className="lv-example-banner" role="status" data-lv-example-banner=""><strong>EXAMPLE</strong><span>{props.text??EXAMPLE_BANNER_TEXT}</span><button type="button" onClick={props.onLeave}>{props.leaveLabel??LEAVE_EXAMPLE}</button></div>;
}

/** One card per chart cell that has no live data, placed over that cell (sized to it) instead of over the whole
 * chart area. The layer measures the visible chart tree's cells (data-lv-cell-id) and follows their size. */
export interface NeedsLiveCell {cellId:string;symbol:string;crypto:boolean;liveReady:boolean;example:boolean}
interface CellBox {left:number;top:number;width:number;height:number}
/** App commands the empty chart's right-click menu can run (the host runs them as its command palette does). */
export type NeedsLiveMenuCommand='symbol-search'|'change-interval'|'open-layouts'|'chart-settings';
export type NeedsLiveMenuRowId='live'|'example'|'sources'|NeedsLiveMenuCommand;
export interface NeedsLiveMenuRow {id:NeedsLiveMenuRowId;label:string;hint?:string;group:number}
/** The reduced chart menu of a cell with no live data: the card's own actions first, then the chart commands that work
 * without bars. */
export function needsLiveMenuRows(cell:Pick<NeedsLiveCell,'symbol'|'liveReady'|'example'>,host:{commands:boolean}):NeedsLiveMenuRow[]{
 const rows:NeedsLiveMenuRow[]=[];
 if(cell.liveReady&&cell.symbol)rows.push({id:'live',label:showLiveLabel(cell.symbol),group:0});
 if(!cell.example)rows.push({id:'example',label:LOAD_EXAMPLE,group:0});
 rows.push({id:'sources',label:OPEN_DATA_SOURCES,group:0});
 if(host.commands)rows.push({id:'symbol-search',label:'Change symbol…',group:1},{id:'change-interval',label:'Change interval',hint:',',group:1},{id:'open-layouts',label:'Open layouts',hint:'.',group:1},{id:'chart-settings',label:'Chart settings…',group:2});
 return rows;
}
/** The id of the empty cell under a viewport point. Boxes are relative to the layer, whose viewport rect is `base`. */
export function needsLiveCellAt(boxes:Readonly<Record<string,CellBox>>,base:{left:number;top:number},x:number,y:number):string|null{
 for(const [cellId,box] of Object.entries(boxes)){const left=base.left+box.left,top=base.top+box.top;if(x>=left&&x<left+box.width&&y>=top&&y<top+box.height)return cellId;}
 return null;
}
/** The reduced chart menu: the chart menu's look, keys (arrows, Home, End, Escape) and placement. */
export function NeedsLiveMenu({rows,at,onRun,onClose}:{rows:readonly NeedsLiveMenuRow[];at:{x:number;y:number};onRun:(id:NeedsLiveMenuRowId)=>void;onClose:()=>void}){
 const host=useRef<HTMLDivElement|null>(null),latestClose=useRef(onClose);latestClose.current=onClose;
 useEffect(()=>{host.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const outside=(event:PointerEvent)=>{if(!host.current?.contains(event.target as Node))latestClose.current();},close=()=>latestClose.current();
  document.addEventListener('pointerdown',outside,true);window.addEventListener('blur',close);window.addEventListener('resize',close);
  return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('blur',close);window.removeEventListener('resize',close);};},[]);
 const place=(node:HTMLDivElement|null)=>{host.current=node;fitFixedMenu(node,{x:at.x,y:at.y});};
 return <div ref={place} data-lv-context-menu="true" data-lv-needs-live-menu="" tabIndex={-1} role="menu" aria-label="Chart context menu" className="lv-popup-menu lv-chart-context-menu" style={{left:at.x,top:at.y}} onContextMenu={event=>event.preventDefault()} onKeyDown={event=>{event.stopPropagation();const action=contextMenuKeyAction(event.key,event.nativeEvent.isComposing);
  if(action==='ignore'){event.preventDefault();return;}if(action==='dismiss'){event.preventDefault();onClose();return;}
  if(action==='navigate'){event.preventDefault();const buttons=[...host.current?.querySelectorAll<HTMLButtonElement>('button')??[]];if(!buttons.length)return;const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
   const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?(index+1)%buttons.length:(index<=0?buttons.length-1:index-1);buttons[next]!.focus();}}}>
  {rows.map((row,index)=><React.Fragment key={row.id}>{index>0&&rows[index-1]!.group!==row.group&&<hr role="separator" className="lv-popup-separator"/>}<button type="button" role="menuitem" aria-keyshortcuts={row.hint} onClick={()=>onRun(row.id)}><span className="lv-popup-icon-slot" aria-hidden="true"/><span>{row.label}</span>{row.hint&&<span className="lv-popup-shortcut">{row.hint}</span>}</button></React.Fragment>)}
 </div>;
}
export function NeedsLiveCells(props:{cells:readonly NeedsLiveCell[];single:boolean;onOpenLive:(cellId:string)=>void;onOpenDataSources:()=>void;onLoadExample:()=>void;/** Runs an app command from the right-click menu (absent: those rows are left out). */onCommand?:(id:NeedsLiveMenuCommand)=>void}){
 const layer=useRef<HTMLDivElement|null>(null),[boxes,setBoxes]=useState<Record<string,CellBox>>({});
 const [menu,setMenu]=useState<{cellId:string;x:number;y:number}|null>(null),latestBoxes=useRef(boxes);latestBoxes.current=boxes;
 // A right-click anywhere over an empty cell (the card or the empty chart around it) opens the reduced chart menu. The
 // layer itself lets pointer events through, so the click is matched against the measured cell boxes.
 useEffect(()=>{if(typeof window==='undefined')return;const open=(event:MouseEvent)=>{if(event.defaultPrevented)return;const node=layer.current;if(!node)return;const target=event.target as Element|null;if(target?.closest?.('[data-lv-context-menu]'))return;const cellId=needsLiveCellAt(latestBoxes.current,node.getBoundingClientRect(),event.clientX,event.clientY);if(!cellId)return;event.preventDefault();setMenu({cellId,x:event.clientX,y:event.clientY});};window.addEventListener('contextmenu',open);return()=>window.removeEventListener('contextmenu',open);},[]);
 /* A single chart is measured too, so its card stays inside the chart and never covers the range bar or an open bottom panel. */
 const key=props.cells.map(cell=>cell.cellId).join('|');
 useLayoutEffect(()=>{
  if(typeof window==='undefined')return;
  const node=layer.current;if(!node)return;
  let frame=0,tries=0,stopped=false;const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>schedule()):null,watched=new Set<Element>();
  function measure(){
   frame=0;if(stopped||!node)return;
   const root=node.parentElement,tree=root?.querySelector('[data-chart-tree]:not([inert])')??root?.querySelector('[data-chart-tree]');
   const base=node.getBoundingClientRect(),next:Record<string,CellBox>={};let missing=false;
   for(const cell of props.cells){
    const element=[...tree?.querySelectorAll<HTMLElement>('[data-lv-cell-id]')??[]].find(item=>item.getAttribute('data-lv-cell-id')===cell.cellId);
    if(!element){missing=true;continue;}
    if(observer&&!watched.has(element)){observer.observe(element);watched.add(element);}
    const rect=element.getBoundingClientRect();if(rect.width<=0||rect.height<=0)continue;
    const strip=element.querySelector<HTMLElement>('.lv-grid-strip'),stripHeight=strip&&!strip.hidden?strip.getBoundingClientRect().height:0;
    next[cell.cellId]={left:rect.left-base.left,top:rect.top-base.top+stripHeight,width:rect.width,height:Math.max(0,rect.height-stripHeight)};
   }
   setBoxes(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
   if(missing&&tries++<120)schedule();
  }
  function schedule(){if(!frame&&!stopped)frame=requestAnimationFrame(measure);}
  observer?.observe(node);measure();
  return()=>{stopped=true;if(frame)cancelAnimationFrame(frame);observer?.disconnect();};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 return <div ref={layer} className="lv-needs-live-layer" data-lv-needs-live-layer="">{props.cells.map(cell=>{const box=boxes[cell.cellId];if(!box)return null;
  return <NeedsLiveData key={cell.cellId} {...cell} cellId={cell.cellId} size={needsLiveSize(box.width,box.height)} style={{inset:'auto',left:box.left,top:box.top,width:box.width,height:box.height}} onOpenLive={()=>props.onOpenLive(cell.cellId)} onOpenDataSources={props.onOpenDataSources} onLoadExample={props.onLoadExample}/>;})}{menu&&(()=>{const cell=props.cells.find(item=>item.cellId===menu.cellId);if(!cell)return null;const rows=needsLiveMenuRows(cell,{commands:!!props.onCommand});const run=(id:NeedsLiveMenuRowId)=>{setMenu(null);if(id==='live')props.onOpenLive(cell.cellId);else if(id==='example')props.onLoadExample();else if(id==='sources')props.onOpenDataSources();else props.onCommand?.(id);};const element=<NeedsLiveMenu rows={rows} at={menu} onRun={run} onClose={()=>setMenu(null)}/>;/* The layer lets pointer events through to the chart (pointer-events:none, inherited) and clips, so the menu renders on the body like the chart menu; otherwise its clicks reach the card or chart under it. */return typeof document!=='undefined'&&document.body?createPortal(element,document.body):element;})()}</div>;
}
