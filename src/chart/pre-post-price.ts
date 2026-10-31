// The pre/post-market price label and line. The price is the close of the latest
// bar of the RAW source (before the regular-hours filter) when that bar is pre-market (04:00-09:30 New York) or post-market
// (16:00-20:00). Overnight bars are skipped; a regular bar after them ends the extended run (no label). Only US equity
// intraday charts carry sessions (sessionsApply). Colors: Chart settings > Scales > Pre/post/night market (pre, post).
import {barIntervalMs,barSessionPhase,sessionsApply} from './session-zones';

export interface PrePostPrice{price:number;phase:'pre'|'post';time:number}
/** Whether a chart can show the label at all: the price scale menu enables its rows only then. */
export function prePostAvailable(instrument:{assetClass?:string;timezone?:string},bars:readonly {time:number}[]):boolean{
 return sessionsApply(instrument.assetClass,instrument.timezone,barIntervalMs(bars));
}
/** The latest extended-hours price, or null when the latest session bar is regular (or nothing is known). */
export function latestPrePostPrice(instrument:{assetClass?:string;timezone?:string},bars:readonly {time:number;close:number}[]):PrePostPrice|null{
 if(!prePostAvailable(instrument,bars))return null;
 for(let index=bars.length-1;index>=0&&index>=bars.length-2000;index--){
  const bar=bars[index],phase=barSessionPhase(bar.time*1000);
  if(phase==='overnight')continue;
  if(phase==='regular')return null;
  return Number.isFinite(bar.close)?{price:bar.close,phase,time:bar.time}:null;
 }
 return null;
}
/** The label color for a phase from the document's [pre, post, overnight] colors. */
export function prePostColor(colors:readonly string[],phase:'pre'|'post'):string{return(phase==='pre'?colors[0]:colors[1])??(phase==='pre'?'#FB8C00':'#2962FF');}
