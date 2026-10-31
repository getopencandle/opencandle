// Logical x axis for derived (non-time) topologies. Several display bars can come from one source
// event, so display time is not an axis key. The renderer is fed strictly increasing synthetic times
// (one fixed step per display bar); every axis label, crosshair readout and data-window time maps
// back through the index to the original source event time. The reference time-axis presentation for
// these types is not in the recorded facts: this mapping is an LV construction.
import type {Bar} from '../../domain/types';
import {identifyDisplayBars,type DisplayBar} from '../contracts';
import type {DerivedBar,DerivedSeries} from './common';

export interface DerivedAxis {
  /** Confirmed bars then projection bars, in display order. */
  bars:readonly DerivedBar[];
  /** Index of the first projection bar (equals bars.length when there is none). */
  projectionFrom:number;
  /** Renderer feed: same prices, synthetic strictly increasing time (seconds). */
  feed:Bar[];
  /** Original source event time per display index. */
  sourceTimes:number[];
  syntheticStep:number;
}
export function buildDerivedAxis(series:DerivedSeries,syntheticStep:number):DerivedAxis{
  if(!Number.isFinite(syntheticStep)||syntheticStep<=0)throw new Error('Derived axis step must be a positive number of seconds');
  const bars=[...series.confirmed,...series.projection],base=bars[0]?.time??0;
  return {bars,projectionFrom:series.confirmed.length,syntheticStep,sourceTimes:bars.map(bar=>bar.time),
    feed:bars.map((bar,index)=>({time:base+index*syntheticStep,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume}))};
}
/** Logical index for a synthetic feed time, or null off the axis. */
export function derivedIndexForTime(axis:DerivedAxis,time:number):number|null{
  if(!axis.feed.length)return null;const index=Math.round((time-axis.feed[0].time)/axis.syntheticStep);
  return index>=0&&index<axis.feed.length?index:null;
}
/** Original source time shown for a logical index (axis label, crosshair, data window). */
export function derivedAxisSourceTime(axis:DerivedAxis,logicalIndex:number):number|null{
  const index=Math.round(logicalIndex);return index>=0&&index<axis.sourceTimes.length?axis.sourceTimes[index]:null;
}
/** Stable display identities: confirmed bars keep ordinal ids; projection rows get a separate transform id so repainting never reuses a confirmed id. */
export function derivedDisplayBars(axis:DerivedAxis,series:Pick<DerivedSeries,'transformId'>,meta:{datasetId:string;revision:string}):DisplayBar[]{
  const plain=(rows:readonly DerivedBar[])=>rows.map(({time,open,high,low,close,volume})=>({time,open,high,low,close,volume}));
  const confirmed=axis.bars.slice(0,axis.projectionFrom),projection=axis.bars.slice(axis.projectionFrom);
  const first=identifyDisplayBars(plain(confirmed),{...meta,transformId:series.transformId},confirmed.map(bar=>bar.span));
  const rest=identifyDisplayBars(plain(projection),{...meta,transformId:series.transformId+':projection'},projection.map(bar=>bar.span)).map((row,index)=>({...row,logicalIndex:axis.projectionFrom+index}));
  return [...first,...rest];
}
