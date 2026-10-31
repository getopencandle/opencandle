// Drawings on derived (non-time) chart types. The canonical document, the native drawing store and every
// host consumer keep anchors in SOURCE time (Unix ms of the original events), so a drawing survives a chart type switch,
// a save/reload and undo unchanged. Only the renderer sees the synthetic logical axis (buildDerivedAxis): rows going down
// to it are mapped source -> native, and the renderer's gesture intents coming up are mapped native -> source.
//
// The map is piecewise linear and strictly increasing. Every run of display bars that share one source time is a knot
// (first display index, source time); the run spans the time up to the next run, so the k-th of n bricks built from one
// source bar sits k/n of the way to the next source event. A trailing knot one source cadence after the last run closes
// the final run; before the first and after the last knot the map extends at one cadence per display bar. This placement
// of in-between times is an LV construction (the reference behaviour is not in the recorded facts).
import type {DerivedAxis} from './derived-axis';

export interface DerivedDrawingTimeMap {
  /** Renderer (synthetic) ms for a source-time ms anchor. */
  toNative(sourceMs:number):number;
  /** Source-time ms for a renderer (synthetic) ms anchor. */
  toSource(nativeMs:number):number;
}

const EXACT_CACHE_LIMIT=20000;

/** The source/native drawing time map for one fed derived axis, or null when the axis cannot carry one (empty,
 * non-finite or decreasing source times, a bad step or cadence): callers keep drawings refused in that case. */
export function createDerivedDrawingTimeMap(axis:DerivedAxis,cadenceSeconds:number):DerivedDrawingTimeMap|null{
  const n=axis.feed.length,step=axis.syntheticStep;
  if(!n||axis.sourceTimes.length!==n||!Number.isFinite(step)||step<=0||!Number.isFinite(cadenceSeconds)||cadenceSeconds<=0)return null;
  const base=axis.feed[0].time;if(!Number.isFinite(base))return null;
  const xs:number[]=[],ts:number[]=[];
  for(let index=0;index<n;index++){
    const time=axis.sourceTimes[index];if(!Number.isFinite(time))return null;
    const last=ts.length?ts[ts.length-1]:-Infinity;if(time<last)return null;
    if(time>last){xs.push(index);ts.push(time);}
  }
  xs.push(n);ts.push(ts[ts.length-1]+cadenceSeconds);
  const k=xs.length-1;
  // Logical index (fractional) -> source seconds.
  const sourceOf=(x:number):number=>{
    if(x<=xs[0])return ts[0]+(x-xs[0])*cadenceSeconds;
    if(x>=xs[k])return ts[k]+(x-xs[k])*cadenceSeconds;
    let low=0,high=k;while(high-low>1){const mid=(low+high)>>1;if(xs[mid]<=x)low=mid;else high=mid;}
    return ts[low]+(x-xs[low])/(xs[high]-xs[low])*(ts[high]-ts[low]);
  };
  // Source seconds -> logical index (fractional).
  const indexOf=(t:number):number=>{
    if(t<=ts[0])return xs[0]+(t-ts[0])/cadenceSeconds;
    if(t>=ts[k])return xs[k]+(t-ts[k])/cadenceSeconds;
    let low=0,high=k;while(high-low>1){const mid=(low+high)>>1;if(ts[mid]<=t)low=mid;else high=mid;}
    return xs[low]+(t-ts[low])/(ts[high]-ts[low])*(xs[high]-xs[low]);
  };
  // Exact round trips: a value that came through one direction maps back to the very number it came from, so an
  // untouched anchor never drifts by a rounding step when the renderer echoes a drawing back.
  const nativeFor=new Map<number,number>(),sourceFor=new Map<number,number>();
  const remember=(cache:Map<number,number>,key:number,value:number)=>{if(cache.size>=EXACT_CACHE_LIMIT)cache.clear();cache.set(key,value);};
  return Object.freeze({
    toNative(sourceMs:number):number{
      if(!Number.isFinite(sourceMs))return sourceMs;const hit=nativeFor.get(sourceMs);if(hit!==undefined)return hit;
      const nativeMs=(base+indexOf(sourceMs/1000)*step)*1000;if(!Number.isFinite(nativeMs))return sourceMs;
      remember(sourceFor,nativeMs,sourceMs);return nativeMs;
    },
    toSource(nativeMs:number):number{
      if(!Number.isFinite(nativeMs))return nativeMs;const hit=sourceFor.get(nativeMs);if(hit!==undefined)return hit;
      const sourceMs=sourceOf((nativeMs/1000-base)/step)*1000;if(!Number.isFinite(sourceMs))return nativeMs;
      remember(nativeFor,sourceMs,nativeMs);return sourceMs;
    },
  });
}

type Row=Record<string,unknown>;
/** A drawing row with every finite anchor time passed through `map`; rows without anchors are returned as they are. */
export function mapDrawingRowTimes<T>(row:T,map:(ms:number)=>number):T{
  if(!row||typeof row!=='object')return row;const anchors=(row as Row).anchors;if(!Array.isArray(anchors))return row;
  return {...row,anchors:anchors.map(anchor=>anchor&&typeof anchor==='object'&&typeof (anchor as Row).time==='number'&&Number.isFinite((anchor as Row).time)?{...anchor,time:map((anchor as {time:number}).time)}:anchor)} as T;
}
/** The renderer intents that carry drawing geometry, mapped through `map`; every other intent is returned as it is. */
export function mapDrawingIntentTimes<T>(intent:T,map:(ms:number)=>number):T{
  if(!intent||typeof intent!=='object')return intent;const value=intent as Row;
  if((value.kind==='create'||value.kind==='edit'||value.kind==='draft')&&value.doc&&typeof value.doc==='object')return {...value,doc:mapDrawingRowTimes(value.doc,map)} as T;
  if((value.kind==='edit-many'||value.kind==='clone')&&Array.isArray(value.docs))return {...value,docs:value.docs.map(doc=>mapDrawingRowTimes(doc,map))} as T;
  return intent;
}
/** Intents that would write renderer geometry into the store: refused on a derived chart without a usable time map. */
export function isGeometryIntent(intent:unknown):boolean{
  if(!intent||typeof intent!=='object')return false;const kind=(intent as Row).kind;return kind==='create'||kind==='edit'||kind==='edit-many'||kind==='clone';
}
/** Source cadence (seconds per source bar) for the map's ends: the last positive bar spacing, else the fallback. */
export function sourceCadenceSeconds(bars:readonly {time:number}[],fallback:number):number{
  for(let index=bars.length-1;index>0;index--){const delta=bars[index].time-bars[index-1].time;if(Number.isFinite(delta)&&delta>0)return delta;}
  return Number.isFinite(fallback)&&fallback>0?fallback:60;
}

/** One chart's renderer-side view of drawing time. It follows what the renderer was actually FED (not the requested
 * style), so a gesture that lands while a chart type switch is still applying maps through the axis on screen. */
export interface DerivedDrawingLens {
  /** Record the feed the renderer now shows: a time feed, or a derived axis built from `sourceBars`. */
  fed(axis:DerivedAxis|null,derived:boolean,sourceBars:readonly {time:number}[],fallbackCadence:number):void;
  /** True while the renderer shows a derived axis. */
  derived():boolean;
  /** True while the renderer shows a derived axis that has no usable time map (drawing geometry is refused). */
  refused():boolean;
  /** Store/canonical row (source time) -> the row the renderer paints. */
  toNativeRow<T>(row:T):T;
  /** Row the renderer holds (synthetic time) -> store/canonical row (source time), for owners that compare a renderer
   * row with a stored one. The very same row on a time feed or a refused derived feed, mirroring toNativeRow. */
  toSourceRow<T>(row:T):T;
  /** Renderer intent -> store intent (source time); null when the intent must be refused. */
  intentToSource<T>(intent:T):T|null;
  /** Source seconds -> renderer seconds; null on a refused derived feed. */
  toNativeSeconds(seconds:number):number|null;
  /** Renderer seconds -> source seconds; null on a refused derived feed. */
  toSourceSeconds(seconds:number):number|null;
}
export const DERIVED_DRAWING_REFUSED='Drawings are unavailable until this chart type has built its bars.';
export function createDerivedDrawingLens():DerivedDrawingLens{
  const maps=new WeakMap<DerivedAxis,{cadence:number;map:DerivedDrawingTimeMap|null}>();
  let state:{derived:false}|{derived:true;map:DerivedDrawingTimeMap|null}={derived:false};
  const map=()=>state.derived?state.map:null;
  return {
    fed(axis,derived,sourceBars,fallbackCadence){
      if(!derived){state={derived:false};return;}
      if(!axis){state={derived:true,map:null};return;}
      const cadence=sourceCadenceSeconds(sourceBars,fallbackCadence),hit=maps.get(axis);
      if(hit&&hit.cadence===cadence){state={derived:true,map:hit.map};return;}
      const built=createDerivedDrawingTimeMap(axis,cadence);maps.set(axis,{cadence,map:built});state={derived:true,map:built};
    },
    derived:()=>state.derived,
    refused:()=>state.derived&&!map(),
    toNativeRow(row){const current=map();return current?mapDrawingRowTimes(row,current.toNative):row;},
    toSourceRow(row){const current=map();return current?mapDrawingRowTimes(row,current.toSource):row;},
    intentToSource(intent){if(!state.derived)return intent;const current=map();if(!current)return isGeometryIntent(intent)||(intent as {kind?:unknown}|null)?.kind==='draft'?null:intent;return mapDrawingIntentTimes(intent,current.toSource);},
    toNativeSeconds(seconds){if(!state.derived)return seconds;const current=map();return current?current.toNative(seconds*1000)/1000:null;},
    toSourceSeconds(seconds){if(!state.derived)return seconds;const current=map();return current?current.toSource(seconds*1000)/1000:null;},
  };
}
