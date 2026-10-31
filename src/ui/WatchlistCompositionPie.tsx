import React from 'react';
import type {AdvancedComposition} from '../watchlists/advanced';

/**
 * Pure presentational pie over the Advanced View composition (equal weight per distinct market).
 * Colors come from LV theme tokens. The text table next to it stays the accessible equivalent.
 */
export interface PieSlice {label:string;count:number;percent:number;startAngle:number;endAngle:number;path:string;color:string}
const TOKENS=['--lv-accent','--lv-accent-secondary','--lv-positive-text','--lv-negative-text','--lv-notice-text','--lv-highlight','--lv-text-secondary'];
const SIZE=120,RADIUS=56,CENTER=SIZE/2;
const point=(angle:number)=>{const radians=(angle-90)*Math.PI/180;return[CENTER+RADIUS*Math.cos(radians),CENTER+RADIUS*Math.sin(radians)] as const;};
function arc(start:number,end:number):string{
 if(end-start>=360-1e-9){const [x,y]=point(0),[ox,oy]=point(180);return `M ${x.toFixed(4)} ${y.toFixed(4)} A ${RADIUS} ${RADIUS} 0 1 1 ${ox.toFixed(4)} ${oy.toFixed(4)} A ${RADIUS} ${RADIUS} 0 1 1 ${x.toFixed(4)} ${y.toFixed(4)} Z`;}
 const [x1,y1]=point(start),[x2,y2]=point(end);return `M ${CENTER} ${CENTER} L ${x1.toFixed(4)} ${y1.toFixed(4)} A ${RADIUS} ${RADIUS} 0 ${end-start>180?1:0} 1 ${x2.toFixed(4)} ${y2.toFixed(4)} Z`;
}
/** Slices in the given order; each sweeps percent/100 of 360 degrees, so the sweeps sum to 360 when the percents sum to 100. */
export function pieSlices(segments:readonly AdvancedComposition[]):PieSlice[]{
 let angle=0,color=0;
 return segments.filter(segment=>segment.count>0).map(segment=>{const sweep=segment.percent/100*360,startAngle=angle,endAngle=angle+sweep;angle=endAngle;return{label:segment.label,count:segment.count,percent:segment.percent,startAngle,endAngle,path:arc(startAngle,endAngle),color:'var('+(segment.label==='Unknown'?'--lv-text-disabled':TOKENS[color++%TOKENS.length])+')'};});
}
/** RECORD: the coverage denominator is disclosed. "Classified" means a slice with a known label. */
export function pieCoverage(segments:readonly AdvancedComposition[]):string{
 const total=segments[0]?.total??0,unknown=segments.find(segment=>segment.label==='Unknown')?.count??0;
 return (total-unknown)+' of '+total+' symbols classified';
}
export function WatchlistCompositionPie(props:{title:string;segments:readonly AdvancedComposition[]}){
 const slices=pieSlices(props.segments);
 return <figure className="wl-pie" aria-label={props.title+' composition'}>
  <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={props.title+' composition: '+slices.map(slice=>slice.label+' '+slice.percent.toFixed(1)+'%').join(', ')}>
   {slices.length===0?<circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="var(--lv-border)"/>:slices.map(slice=><path key={slice.label} d={slice.path} fill={slice.color} stroke="var(--lv-bg-surface)" strokeWidth="1"><title>{slice.label+': '+slice.count+' ('+slice.percent.toFixed(1)+'%)'}</title></path>)}
  </svg>
  <figcaption>{pieCoverage(props.segments)}</figcaption>
 </figure>;
}
