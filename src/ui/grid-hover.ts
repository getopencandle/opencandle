import {cellSessionDataset,type CellSession} from '../chart/cell-session';
import React,{useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {ChartController} from '../chart/adapter';
import type {LayoutSnapshot} from '../chart/layout-port';
import {isDerivedStyle} from '../chart/derived/common';
import type {Bar,BarDataset} from '../domain/types';
import type {Inspection} from './DataWindow';
import type {DataWindowPanelProps} from './DataWindowPanel';
import type {IndicatorInstanceView} from '../chart/indicator-port';
import {chartTimeZone} from './chart-time-text';
import {sameChartSourceBasis,sourceContextForDataset,type ChartSourceContext} from '../chart/source-context';

// In a multi-chart layout the Data window shows the chart under the crosshair; when the pointer leaves every chart
// it falls back to the active chart. With crosshair sync on, the active chart's legend values follow the synced crosshair
// time of the hovered chart (the ghost crosshair vela paints never re-emits a crosshair event, so the legend was stuck on
// the last bar). Everything here reads the hovered chart's own controller; the Data window model and panel are unchanged.

/** The chart surface the hover path reads. Test fakes provide only these members. */
export type HoverChart=Pick<ChartController,'getDataWindow'|'getSourceBars'|'getCalculationBars'|'getStyle'|'onCrosshair'|'indicators'>&Partial<Pick<ChartController,'comparisons'|'scripts'|'onMarketApplied'>>;
/** The chart cell under the crosshair, with the inspection read in the same animation frame. */
export interface GridHover {readonly cellId:string;readonly controller:HoverChart;readonly time:number;readonly inspection:Inspection}
export type CellCrosshairListener=(cellId:string,chart:HoverChart|null,time:number|null)=>void;
/** The Data window props App passes for the active chart (ObjectTreeDataWindowWidget's dataWindow). */
export type DataWindowFeed=Omit<DataWindowPanelProps,'active'|'activeSourceKey'>;
/** The grid parts the hover path reads (MultiChartState). */
export interface HoverGrid {readonly layout:Pick<LayoutSnapshot,'activeCellId'|'maximizedCellId'|'cells'|'sync'>;readonly cells:Readonly<Record<string,({datasetId:string;chartOptions?:{timezone?:unknown}}&CellSession)|undefined>>}

/**
 * One crosshair subscription per mounted grid cell. `attach(cellId, null)` (a chart retired) and `retain` (a cell left the
 * layout) unsubscribe and report the cell as left, so a removed or replaced chart never stays the hovered one. Events from
 * a controller that is no longer the cell's current one are dropped. `dispose` is not terminal: React may mount again.
 */
export function createCellCrosshairWatch(emit:CellCrosshairListener){
 const watched=new Map<string,{chart:HoverChart;off:()=>void}>();
 const detach=(cellId:string)=>{const row=watched.get(cellId);if(!row)return;watched.delete(cellId);try{row.off();}catch(error){console.error('A chart crosshair subscription could not be removed: '+String(error));}emit(cellId,null,null);};
 return{
  attach(cellId:string,chart:HoverChart|null){
   if(watched.get(cellId)?.chart===chart)return;detach(cellId);if(!chart)return;
   // A chart without a crosshair feed (a test double, a failed mount) is simply not followed.
   if(typeof chart.onCrosshair!=='function')return;let off:()=>void;
   try{off=chart.onCrosshair(event=>{if(watched.get(cellId)?.chart===chart)emit(cellId,chart,event.time);});}catch(error){console.error('A chart crosshair subscription could not be added: '+String(error));return;}
   watched.set(cellId,{chart,off});
  },
  retain(ids:Iterable<string>){const keep=new Set(ids);for(const id of [...watched.keys()])if(!keep.has(id))detach(id);},
  dispose(){for(const id of [...watched.keys()])detach(id);},
  watching:()=>[...watched.keys()],
 };
}

const watches=new WeakMap<object,ReturnType<typeof createCellCrosshairWatch>>();
/** The watch of one grid instance, keyed by an object the grid owns for its lifetime (a ref), so the grid adds no hook. The
 * first caller's `emit` is kept; pass one that reads the grid's latest props. */
export function cellCrosshairWatch(owner:object,emit:CellCrosshairListener){let watch=watches.get(owner);if(!watch){watch=createCellCrosshairWatch(emit);watches.set(owner,watch);}return watch;}

/** Applies one crosshair report. A leave clears only the cell that left; an enter or move reads the chart's inspection. */
export function nextGridHover(current:GridHover|null,cellId:string,chart:HoverChart|null,time:number|null):GridHover|null{
 if(!chart||time===null||!Number.isFinite(time))return current?.cellId===cellId?null:current;
 let inspection:Inspection;try{inspection=chart.getDataWindow();}catch{return current?.cellId===cellId?null:current;}
 return{cellId,controller:chart,time,inspection};
}

/** Crosshair sync puts a ghost on the active chart at the hovered chart's time when both are in one link group. */
export function legendGhostTime(grid:Pick<HoverGrid,'layout'>|undefined|null,hover:GridHover|null):number|null{
 if(!grid||!hover)return null;const layout=grid.layout;
 if(hover.cellId===layout.activeCellId||!layout.sync?.crosshair||layout.maximizedCellId!==null)return null;
 const source=layout.cells.find(cell=>cell.id===hover.cellId),target=layout.cells.find(cell=>cell.id===layout.activeCellId);
 if(!source||!target||source.group!==target.group)return null;
 try{
  // A source/layout restore can clear the native crosshair without a mouse event. Its old timestamp must not
  // keep driving another chart's legend, even though the Data window may still follow this cell's current bars.
  const current=hover.controller.getDataWindow();
  if(current.pending||!current.displayed.hovered||current.series.style!==hover.inspection.series.style||!sameChartSourceBasis(current.source,hover.inspection.source,true))return null;
  const time=current.crosshair?.time??hover.time;return Number.isFinite(time)?time:null;
 }catch{return null;}
}

const lastAtOrBefore=(bars:readonly Bar[],time:number)=>{let low=0,high=bars.length-1,found=-1;while(low<=high){const middle=(low+high)>>1;if(bars[middle].time<=time){found=middle;low=middle+1;}else high=middle-1;}return found;};
const barCopy=(bar:Bar)=>({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume});
/**
 * The active chart's inspection at a synced crosshair time: the bar containing that time (floor, as vela snaps its ghost).
 * Unchanged when there is no ghost, the active chart has its own crosshair, the style is a derived (non-time) chart type, the
 * time is before the first bar, or the owner check already refused the inspection (null).
 */
export function syncedLegendInspection(inspection:Inspection|null,calculationBars:readonly Bar[],sourceBars:readonly Bar[],style:string,time:number|null):Inspection|null{
 if(!inspection||time===null||inspection.displayed.hovered||inspection.standard.hovered||isDerivedStyle(style))return inspection;
 const index=lastAtOrBefore(calculationBars,time);if(index<0)return inspection;
 const bar=calculationBars[index],source=sourceBars.findIndex(row=>row.time===bar.time);
 return{...inspection,standard:{index:source,bar:source>=0?barCopy(sourceBars[source]):null,hovered:source>=0},displayed:{index,bar:barCopy(bar),hovered:true}};
}

/**
 * The owner check for a hovered chart's inspection. App's matchingInspection compares input identity with App's own bar
 * array; the hovered bars here are the controller's copies, read under the same source and series key as the inspection,
 * so the check is that they describe the same series: not pending, the same style, count and ends, and the inspected bar
 * at its index. Anything else shows the last bar (null), never a bar of another load.
 */
export function hoveredInspection(snapshot:Inspection|null,sourceBars:readonly Bar[],bars:readonly Bar[],style:string):Inspection|null{
 if(!snapshot||snapshot.pending||snapshot.series.style!==style)return null;
 if(snapshot.series.count!==sourceBars.length||snapshot.series.firstTime!==(sourceBars[0]?.time??null)||snapshot.series.lastTime!==(sourceBars.at(-1)?.time??null))return null;
 const shown=snapshot.displayed;if(shown.bar&&shown.index>=0&&bars[shown.index]?.time!==shown.bar.time&&!isDerivedStyle(style))return null;
 if(shown.index>=bars.length)return null;
 return snapshot;
}

/**
 * Builds the Data window props for the hovered chart cell, falling back to the active chart's props. Bars and indicator
 * views are read from the hovered controller once per change, not per crosshair frame: the key is the controller object plus
 * its source context and series (every bar load, live update, Source change, layout restore and undo moves one of them),
 * and an indicator notification (add, edit, remove, restore) marks the views stale. A new controller drops the entry.
 */
export function createHoverFeedCache(invalidated:()=>void=()=>{}){
 let entry:{chart:HoverChart;key:string;bars:Bar[];sourceBars:Bar[];views:readonly IndicatorInstanceView[];viewsStale:boolean;off:()=>void}|null=null;
 const bases=new WeakMap<BarDataset,ChartSourceContext>();
 const drop=()=>{const row=entry;entry=null;if(row)try{row.off();}catch{/* a retired chart has no subscription left */}};
 const own=(chart:HoverChart)=>{
  if(entry?.chart===chart)return entry;
  drop();const row={chart,key:'',bars:[] as Bar[],sourceBars:[] as Bar[],views:[] as readonly IndicatorInstanceView[],viewsStale:true,off:()=>{}};entry=row;
  const subscriptions:Array<()=>void>=[],changed=()=>{if(entry!==row)return;row.viewsStale=true;invalidated();};
  try{subscriptions.push(chart.indicators.subscribe(changed));}catch{/* no indicator notifications */}
  try{if(chart.onMarketApplied)subscriptions.push(chart.onMarketApplied(()=>{row.key='';changed();}));}catch{/* a failed chart cannot notify */}
  row.off=()=>{for(const off of subscriptions)try{off();}catch{/* all subscriptions must retire */}};return row;
 };
 const read=(chart:HoverChart,inspection:Inspection)=>{
  const key=JSON.stringify([inspection.source,inspection.series]),row=own(chart);
  if(row.key!==key){row.sourceBars=chart.getSourceBars();row.bars=chart.getCalculationBars();row.key=key;}
  if(row.viewsStale){row.views=chart.indicators.list();row.viewsStale=false;}
  return row;
 };
 return{
  feed(active:DataWindowFeed,hover:GridHover|null,grid:HoverGrid|undefined|null,datasets:readonly BarDataset[],defaultChoice?:string|null):DataWindowFeed{
   if(!hover||!grid||hover.cellId===grid.layout.activeCellId||!grid.layout.cells.some(cell=>cell.id===hover.cellId)){drop();return active;}
   if(grid.layout.maximizedCellId!==null&&grid.layout.maximizedCellId!==hover.cellId){drop();return active;}
   const cell=grid.cells[hover.cellId],supplied=cell&&datasets.find(row=>row.provenance.datasetId===cell.datasetId);
   if(!cell||!supplied){drop();return active;}
   try{
    const dataset=cellSessionDataset(supplied,cell);
    // A stationary pointer keeps its cell, not a frozen inspection. Undo, redo, source edits and layout restore can
    // update this controller without a mouse event. Only reread its small inspection; bars stay cached by identity.
    own(hover.controller);const current=hover.controller.getDataWindow();
    let expected=bases.get(dataset);if(!expected){expected=sourceContextForDataset(dataset);bases.set(dataset,expected);}
    if(!sameChartSourceBasis(current.source,expected,true))return active;
    const row=read(hover.controller,current),style=hover.controller.getStyle();
    const inspection=hoveredInspection(current,row.sourceBars,row.bars,style);
    return{...active,chart:hover.controller,dataset,bars:row.bars,sourceBars:row.sourceBars,inspection,indicators:row.views,timezone:chartTimeZone(cell.chartOptions?.timezone,{defaultChoice,instrument:dataset.instrument})};
   }catch{drop();return active;}
  },
  dispose:drop,
  cachedChart:()=>entry?.chart??null,
 };
}

/** App's hover state for one App instance (see gridHoverStore). */
export interface GridHoverStore {
 /** The hovered cell, or null. Read during render; it changes only in an animation frame callback. */
 readonly hover:GridHover|null;
 /** The active chart's crosshair inspection (formerly App state). Only HoverSlot subscribers re-render on it. */
 readonly inspection:Inspection|null;
 /** Increments on every hover or inspection change, so a slot can cache per change. */
 readonly version:number;
 /** Same identity bail-out as a React state setter. Notifies subscribers synchronously. */
 setInspection(next:Inspection|null):void;
 onCellCrosshair:CellCrosshairListener;
 /** The hover-aware Data window props (the active chart's props when no other cell is hovered). */
 feed(active:DataWindowFeed,grid:HoverGrid|undefined|null,datasets:readonly BarDataset[],defaultChoice?:string|null):DataWindowFeed;
 subscribe(fn:()=>void):()=>void;
 /** Cancels a queued frame and drops pending reports and the feed cache; not terminal (React may mount again). */
 dispose():void;
}
/**
 * MultiChartGrid reports every cell's crosshair through `onCellCrosshair`; reports are applied once per animation frame in
 * arrival order (so a leave from one cell and an enter on another in one frame both land), and never during a render.
 */
export function createGridHoverStore(frames:{request:(fn:()=>void)=>number;cancel:(id:number)=>void}={request:fn=>requestAnimationFrame(fn),cancel:id=>cancelAnimationFrame(id)}):GridHoverStore{
 let hover:GridHover|null=null,inspection:Inspection|null=null,version=0,frame=0,dirty=false;const pending=new Map<string,{chart:HoverChart|null;time:number|null}>(),subscribers=new Set<()=>void>();
 const notify=()=>{version++;for(const fn of [...subscribers])fn();};
 const flush=()=>{frame=0;const reports=[...pending],changed=dirty;dirty=false;pending.clear();let next=hover;for(const [cellId,report] of reports)next=nextGridHover(next,cellId,report.chart,report.time);if(next===hover&&!changed)return;hover=next;notify();};
 const feeds=createHoverFeedCache(()=>{dirty=true;if(!frame)frame=frames.request(flush);});
 return{
  get hover(){return hover;},
  get inspection(){return inspection;},
  get version(){return version;},
  setInspection:(next:Inspection|null)=>{if(next===inspection)return;inspection=next;notify();},
  onCellCrosshair(cellId,chart,time){pending.delete(cellId);pending.set(cellId,{chart,time});if(!frame)frame=frames.request(flush);},
  feed:(active,grid,datasets,defaultChoice)=>feeds.feed(active,hover,grid,datasets,defaultChoice),
  subscribe(fn){subscribers.add(fn);return()=>{subscribers.delete(fn);};},
  dispose(){if(frame)frames.cancel(frame);frame=0;dirty=false;hover=null;pending.clear();feeds.dispose();},
 };
}
const stores=new WeakMap<object,GridHoverStore>();
/**
 * The store of one App instance, keyed by an object App owns for its lifetime (a ref). App reads it during render; only
 * HoverSlot children subscribe to it, so a crosshair move never re-renders App itself.
 */
export function gridHoverStore(owner:object):GridHoverStore{let store=stores.get(owner);if(!store){store=createGridHoverStore();stores.set(owner,store);}return store;}
/** Disposes the store's frame and cache on unmount. It no longer re-renders the caller; HoverSlot children do. */
export function useGridHoverRender(store:GridHoverStore):void{
 useEffect(()=>()=>store.dispose(),[store]);
}
/**
 * A narrow subscriber. It re-renders only itself when the store changes (or, with `select`, when the selected
 * primitive changes) and calls the parent's latest `render`, so the hovered values update without re-rendering the parent.
 * The parent still re-renders it on its own renders. It adds no DOM. `children` is the content the parent already built at
 * store `version`; while the store is still at that version it is shown as is (no second build), otherwise `render` runs.
 */
type HoverSlotProps={store:GridHoverStore;render:()=>React.ReactNode;select?:()=>unknown;version?:number;children?:React.ReactNode};
export function HoverSlot({store,render,select,version,children}:HoverSlotProps):React.ReactElement{
 useSyncExternalStore(store.subscribe,select??(()=>store.version));
 return React.createElement(React.Fragment,null,version!==undefined&&version===store.version?children:render());
}
/** A HoverSlot that re-renders once the store has been quiet for `settle` ms (see useSettledSelect). */
export function SettledHoverSlot({store,render,select,version,children,settle}:HoverSlotProps&{settle:number}):React.ReactElement{
 useSettledSelect(store,select??(()=>store.version),settle);
 return React.createElement(React.Fragment,null,version!==undefined&&version===store.version?children:render());
}
/** A SettledHoverSlot re-renders once the store has been quiet for `delay` ms, not on every change. Its consumers
 * (the snapshot overlay publishers) only matter when a snapshot is taken; while the pointer keeps moving they would otherwise
 * republish (and force a layout) on every frame. A snapshot within that settle window reports that the overlays are updating. */
function useSettledSelect(store:GridHoverStore,select:()=>unknown,delay:number){
 const latest=useRef(select);latest.current=select;const [,setSeen]=useState<unknown>(select);
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  const apply=()=>{timer=undefined;const value=latest.current();setSeen(()=>value);};
  const off=store.subscribe(()=>{if(timer!==undefined)clearTimeout(timer);timer=setTimeout(apply,delay);});
  return()=>{off();if(timer!==undefined)clearTimeout(timer);};
 },[store,delay]);
}
