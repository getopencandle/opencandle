import React,{useEffect,useState} from 'react';
import type {ChartController} from '../chart/adapter';

// After the chart is scrolled back, a button jumps to the most recent bar. It uses the chart's own Go to
// date route (a navigation command, so the grid saves the new viewport like any other navigation) and keeps the span.

type Viewport={from:number;to:number};
/** Bars of space left between the last bar and the right edge after the jump. */
export const SCROLL_TO_LATEST_MARGIN_BARS=3;
/** True when the last bar lies beyond the right edge by more than half a bar. */
export function scrollToLatestVisible(viewport:Viewport|null,lastTime:number|null,barSeconds:number):boolean{
 if(!viewport||lastTime===null||!Number.isFinite(lastTime)||!Number.isFinite(viewport.to))return false;
 return viewport.to<lastTime-Math.max(0,barSeconds)/2;
}
/** The time Go to date centers so the last bar ends SCROLL_TO_LATEST_MARGIN_BARS from the right edge, keeping the span. */
export function scrollToLatestCenter(viewport:Viewport,lastTime:number,barSeconds:number,marginBars:number=SCROLL_TO_LATEST_MARGIN_BARS):number{
 const span=viewport.to-viewport.from,margin=Number.isInteger(marginBars)&&marginBars>=0?marginBars:SCROLL_TO_LATEST_MARGIN_BARS;return lastTime+margin*barSeconds-span/2;
}
/** The jump behind both the button and Ctrl+Alt+Q (reset time scale). The margin is the chart setting
 * "right margin (bars)"; the span stays as the user left it. */
export function scrollToLatestNow(chart:(Pick<ChartController,'getViewport'|'goToDate'>&Partial<Pick<ChartController,'scrollToLatest'>>)|null,lastTime:number|null,barSeconds:number,marginBars?:number):{ok:true}|{ok:false;message:string}{
 try{
  if(!chart)return{ok:false,message:'There is no chart to move.'};
  // The renderer's own bar-index scroll puts the latest bar at the right margin.
  // The calendar-seconds centering below stays only as the fallback (weekends and derived types skew it).
  if(typeof chart.scrollToLatest==='function'&&chart.scrollToLatest())return{ok:true};
  if(lastTime===null||!Number.isFinite(lastTime))return{ok:false,message:'There is no latest bar to move to.'};
  const viewport=chart.getViewport();if(!viewport)return{ok:false,message:'The chart has no visible range yet.'};
  const result=chart.goToDate(scrollToLatestCenter(viewport,lastTime,barSeconds,marginBars));
  return result.ok?{ok:true}:{ok:false,message:result.diagnostic.message};
 }catch(error){return{ok:false,message:error instanceof Error?error.message:String(error)};}
}
export function ScrollToLatestButton({chart,lastTime,barSeconds,marginBars,onMessage}:{chart:ChartController|null;lastTime:number|null;barSeconds:number;/** Chart settings right margin (bars); default 3. */marginBars?:number;onMessage?:(message:string)=>void}){
 const [shown,setShown]=useState(false);
 useEffect(()=>{
  if(!chart){setShown(false);return;}
  const update=()=>{try{const hidden=typeof chart.latestBarHidden==='function'?chart.latestBarHidden():null;setShown(hidden??scrollToLatestVisible(chart.getViewport(),lastTime,barSeconds));}catch{setShown(false);}};
  update();const off=chart.onViewportChanged(update);
  return()=>{if(typeof off==='function')off();};
 },[chart,lastTime,barSeconds]);
 if(!shown||!chart||lastTime===null)return null;
 const jump=()=>{const result=scrollToLatestNow(chart,lastTime,barSeconds,marginBars);if(!result.ok)onMessage?.(result.message);};
 return <button type="button" className="lv-scroll-latest" aria-label="Scroll to the most recent bar" title="Scroll to the most recent bar" onClick={jump}><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l4 4-4 4M8 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></button>;
}
