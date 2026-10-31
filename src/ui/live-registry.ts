import {createElement,useEffect,useMemo,useState} from 'react';
import type {Bar,BarDataset} from '../domain/types';
import {liveLineageOf,newerLiveBars} from '../chart/bar-input-identity';
import {isLiveDatasetId} from '../domain/live-provider';
import {liveHistoryState,subscribeLiveHistory,type LiveHistoryState} from '../domain/live-history';
import {RTH_LINEAGE_SUFFIX,sessionChartBars,sessionDataset,type SessionMode} from '../chart/session-zones';
import {cellSessionDataset,type CellSession} from '../chart/cell-session';

/** Live datasets are mutable and never stored in a workspace. The active live snapshot is registered here so
 * grid source resolution (workspaceDatasets, selectedDataset, suppliedSourceId) can find it by dataset id. */
const registry=new Map<string,BarDataset>();
export function registerLiveDataset(dataset:BarDataset):void{if(!isLiveDatasetId(dataset.provenance.datasetId))throw new Error('Not a live dataset.');registry.set(dataset.provenance.datasetId,dataset);}
export function unregisterLiveDataset(datasetId:string):void{registry.delete(datasetId);}
export function clearLiveDatasets():void{registry.clear();listeners.clear();}
export function liveDatasetById(datasetId:string|null|undefined):BarDataset|undefined{return typeof datasetId==='string'?registry.get(datasetId):undefined;}
export function registeredLiveDatasets():BarDataset[]{return [...registry.values()];}

/** Every snapshot of a live feed (up to 4 per second) is published here as it arrives. The chart cell of a
 * live source follows this channel so the chart itself updates smoothly, while App-level state (heading, legend, data
 * window, alerts) follows a throttled copy. */
const listeners=new Map<string,Set<(dataset:BarDataset)=>void>>();
export function publishLiveDataset(dataset:BarDataset):void{
 registerLiveDataset(dataset);
 const subscribed=listeners.get(dataset.provenance.datasetId);if(!subscribed)return;
 for(const listener of [...subscribed])try{listener(dataset);}catch{/* a listener failure never stops the feed */}
}
export function subscribeLiveDataset(datasetId:string,listener:(dataset:BarDataset)=>void):()=>void{
 let set=listeners.get(datasetId);if(!set){set=new Set();listeners.set(datasetId,set);}set.add(listener);
 return()=>{const current=listeners.get(datasetId);if(!current)return;current.delete(listener);if(!current.size)listeners.delete(datasetId);};
}
/** The all-sessions bars behind streamed live `bars`: the bars themselves, or for a regular-hours view the
 * newest registered snapshot of its raw feed; null when `bars` are not live or the raw feed is not registered. */
export function liveRawBars(bars:Bar[]):Bar[]|null{
 const key=liveLineageOf(bars)?.key;if(!key)return null;if(!key.endsWith(RTH_LINEAGE_SUFFIX))return bars;
 const rawKey=key.slice(0,-RTH_LINEAGE_SUFFIX.length),raw=liveDatasetById(rawKey.slice(0,rawKey.indexOf('|')));
 return raw&&liveLineageOf(raw.bars)?.key===rawKey?raw.bars:null;
}
/** The newest snapshot of the live subscription that `bars` belongs to (the input itself when it is not live). */
export function useLiveBars(bars:Bar[]):Bar[]{
 const key=liveLineageOf(bars)?.key??null,datasetId=key?key.slice(0,key.indexOf('|')):null;
 const [streamed,setStreamed]=useState<Bar[]|null>(null);
 // Extended trading hours off: a regular-hours view (lineage key + RTH_LINEAGE_SUFFIX) follows its raw feed through the same view.
 useEffect(()=>{if(!datasetId)return;const rth=key!.endsWith(RTH_LINEAGE_SUFFIX),rawKey=rth?key!.slice(0,-RTH_LINEAGE_SUFFIX.length):key;const take=(dataset:BarDataset)=>{if(liveLineageOf(dataset.bars)?.key===rawKey)setStreamed(rth?sessionChartBars(dataset.bars,'regular',dataset.instrument):dataset.bars);};const latest=liveDatasetById(datasetId);if(latest)take(latest);return subscribeLiveDataset(datasetId,take);},[key,datasetId]);
 return streamed&&newerLiveBars(bars,streamed)?streamed:bars;
}
/** Follow the publisher's actual dataset and select its bars in one constructor-owned
 * operation. Subscription keys route updates only; they grant no provider/source
 * permission. Staging and replay keep their exact supplied input and never follow.
 * The stable universe may retain an old dataset object throughout live growth. */
export function useLiveChartInput(dataset:BarDataset,bars:Bar[],cell:CellSession,workspaceSession:SessionMode,follow:boolean):Readonly<{dataset:BarDataset;bars:Bar[]}>{
 const lineage=liveLineageOf(bars),key=follow?lineage?.key??null:null,rawKey=key?.endsWith(RTH_LINEAGE_SUFFIX)?key.slice(0,-RTH_LINEAGE_SUFFIX.length):key,datasetId=rawKey?rawKey.slice(0,rawKey.indexOf('|')):null;
 const [published,setPublished]=useState<BarDataset|null>(null);
 useEffect(()=>{
  if(!datasetId||!rawKey){setPublished(null);return;}
  let current=true;
  const take=(snapshot:BarDataset)=>{if(current&&liveLineageOf(snapshot.bars)?.key===rawKey)setPublished(snapshot);};
  const latest=liveDatasetById(datasetId);if(latest)take(latest);
  const off=subscribeLiveDataset(datasetId,take);return()=>{current=false;off();};
 },[datasetId,rawKey]);
 return useMemo(()=>{
  const actual=published&&liveLineageOf(published.bars);
  if(!follow||!lineage||!published||!actual||actual.key!==rawKey||actual.seq<lineage.seq)return{dataset,bars};
  // One effective session constructor: an explicit cell mode supersedes the
  // workspace mode. Never make a new raw source by copying stale metadata.
  const selected=cell.session===undefined?sessionDataset(published,workspaceSession):cellSessionDataset(published,cell);
  return{dataset:selected,bars:selected.bars};
 },[dataset,bars,published,follow,rawKey,lineage?.seq,cell.session,workspaceSession]);
}
/** The older-history paging state of a live chart's feed ("No more data" once the provider's limit is reached);
 * null for imports, synthetic data and closed feeds. */
export function useLiveHistoryState(datasetId:string|null|undefined):LiveHistoryState|null{
 const [state,setState]=useState<LiveHistoryState|null>(()=>liveHistoryState(datasetId));
 useEffect(()=>{setState(liveHistoryState(datasetId));if(typeof datasetId!=='string')return;return subscribeLiveHistory(datasetId,setState);},[datasetId]);
 return state;
}
/** True when the oldest loaded bar is inside (or right of) the view's left edge. */
export function historyStartInView(viewport:{from:number;to:number}|null,firstTime:number|null):boolean{return !!viewport&&firstTime!==null&&Number.isFinite(viewport.from)&&viewport.from<=firstTime;}
/** The plain state at the left edge of a live chart: "No more data" once the feed reached its provider's limit and
 * the oldest bar is in view, or the plain retry message after a failed page. Nothing for imports and synthetic data. */
export function LiveHistoryEdge({chart,datasetId,firstTime}:{chart:{getViewport():{from:number;to:number}|null;onViewportChanged(fn:()=>void):unknown}|null;datasetId:string|null|undefined;firstTime:number|null}){
 const state=useLiveHistoryState(datasetId);const [inView,setInView]=useState(false);
 useEffect(()=>{if(!chart){setInView(false);return;}const update=()=>{try{setInView(historyStartInView(chart.getViewport(),firstTime));}catch{setInView(false);}};update();const off=chart.onViewportChanged(update);return()=>{if(typeof off==='function')(off as ()=>void)();};},[chart,firstTime]);
 if(!state||!inView||(state.status!=='exhausted'&&state.status!=='error')||!state.message)return null;
 return createElement('div',{className:'lv-history-edge',role:'status'},state.message);
}
