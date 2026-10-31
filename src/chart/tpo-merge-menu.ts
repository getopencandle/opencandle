import type {Bar} from '../domain/types';
import {sourcePivotCalendar} from '../domain/indicators-ext/r23-catalog';
import {sourceAxisBasis,sourceExchangeTimeZone,sourceTickSize} from './adapter';
import type {ChartSourceContext} from './source-context';
import {TPO_LV_DEFAULTS,tpoMergePoints,tpoProfilesForSettings,tpoToggleMergePoint} from './tpo';

/**
 * The chart gesture for TPO merge points. Right-clicking inside a profile offers
 * "Merge with previous profile" (adds that profile's start to mergePoints) and, inside a merged profile, "Unmerge profile"
 * (removes the merge points it holds). The profiles are computed exactly as the TPO layer computes them (same settings,
 * tick size, session calendar and exchange time zone), so the row names the profile the user sees.
 */
export interface TpoMergeChoice {start:number;canMerge:boolean;merged:number[];merge:{mergePoints:number[]}|null;unmerge:{mergePoints:number[]}|null}
export function tpoMergeChoiceAt(bars:readonly Bar[],settings:Record<string,unknown>|undefined,source:Pick<ChartSourceContext,'basisIdentity'>|null|undefined,time:number|null):TpoMergeChoice|null{
 if(time===null||!Number.isFinite(time)||!bars.length)return null;
 const values={...TPO_LV_DEFAULTS,...(settings??{})},basis=sourceAxisBasis(source);
 const profiles=tpoProfilesForSettings(bars,values,sourceTickSize(source)??null,{calendar:sourcePivotCalendar(basis?.assetClass,basis?.timezone)??null,timeZone:sourceExchangeTimeZone(source)??null});
 const index=profiles.findIndex(profile=>bars[profile.firstIndex]&&bars[profile.lastIndex]&&bars[profile.firstIndex].time<=time&&time<=bars[profile.lastIndex].time);
 if(index<0)return null;
 const profile=profiles[index],last=bars[profile.lastIndex].time,points=tpoMergePoints(values.mergePoints),merged=points.filter(point=>point>profile.start&&point<=last);
 const canMerge=index>0&&!points.includes(profile.start);
 let unmerge:{mergePoints:number[]}|null=null;if(merged.length){let next:Record<string,unknown>=values;for(const point of merged)next={...next,...tpoToggleMergePoint(next,point)};unmerge={mergePoints:tpoMergePoints(next.mergePoints)};}
 return{start:profile.start,canMerge,merged,merge:canMerge?tpoToggleMergePoint(values,profile.start):null,unmerge};
}
