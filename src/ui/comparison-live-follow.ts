import type {BarDataset} from '../domain/types';
import {isLiveDatasetId} from '../domain/live-provider';
import {liveDatasetById,subscribeLiveDataset} from './live-registry';
// Compare symbols with live symbols: a comparison of a live source copied its bars
// once, at Add, so its line stopped while the feed went on. This keeps each live comparison on its feed's newest snapshot
// through the live registry channel (the same channel a live chart cell follows). Imports and synthetic data are untouched.

export interface LiveComparisonPort {
 list():readonly {dataset:BarDataset}[];
 subscribe(listener:()=>void):()=>void;
 refreshSource?(dataset:BarDataset):boolean;
}
export interface LiveDatasetFeed {
 latest(datasetId:string):BarDataset|undefined;
 subscribe(datasetId:string,listener:(dataset:BarDataset)=>void):()=>void;
}
const registryFeed:LiveDatasetFeed={latest:liveDatasetById,subscribe:subscribeLiveDataset};

/** Follows every live comparison of one chart. Returns the cleanup. A refresh that throws (for example while the chart's
 * analysis is unavailable) is dropped; the next snapshot tries again. */
export function followLiveComparisons(port:LiveComparisonPort|null|undefined,feed:LiveDatasetFeed=registryFeed):()=>void{
 if(!port||typeof port.refreshSource!=='function'||typeof port.subscribe!=='function'||typeof port.list!=='function')return()=>{};
 const refresh=(dataset:BarDataset)=>{try{port.refreshSource!(dataset);}catch{/* retried on the next snapshot */}};
 const followed=new Map<string,()=>void>();let stopped=false;
 const sync=()=>{
  if(stopped)return;
  let wanted:Set<string>;
  try{wanted=new Set(port.list().map(row=>row.dataset?.provenance?.datasetId).filter((id):id is string=>isLiveDatasetId(id)));}catch{return;}
  for(const [id,off] of followed)if(!wanted.has(id)){followed.delete(id);off();}
  for(const id of wanted){
   if(followed.has(id))continue;
   followed.set(id,feed.subscribe(id,refresh));
   const latest=feed.latest(id);if(latest)refresh(latest);
  }
 };
 const offPort=port.subscribe(sync);sync();
 return()=>{stopped=true;offPort();for(const off of followed.values())off();followed.clear();};
}
