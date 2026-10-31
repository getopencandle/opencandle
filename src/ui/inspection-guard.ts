import type {Bar} from '../domain/types';
import type {Inspection} from './DataWindow';
import {barInputIdentity,isLiveInputIdentity} from '../chart/bar-input-identity';
import {sameChartSourceBasis,type ChartSourceContext} from '../chart/source-context';
/** A chart can finish an asynchronous source change after React has selected a new replay prefix. */
export function matchingInspection(snapshot:Inspection|null,bars:readonly Bar[],source:ChartSourceContext,style:string):Inspection|null{
 if(!snapshot||snapshot.pending||!sameChartSourceBasis(snapshot.source,source,true)||snapshot.source.inputIdentity!==barInputIdentity(bars)||snapshot.series.style!==style)return null;
 // The chart can hold a newer snapshot of the same live input than the throttled UI bars.
 if(!isLiveInputIdentity(snapshot.source.inputIdentity)&&(snapshot.series.count!==bars.length||snapshot.series.firstTime!==(bars[0]?.time??null)||snapshot.series.lastTime!==(bars.at(-1)?.time??null)))return null;
 if(isLiveInputIdentity(snapshot.source.inputIdentity))return snapshot;
 const displayed=snapshot.displayed.bar;if(displayed&&!bars.some(bar=>bar.time===displayed.time))return null;return snapshot;
}
