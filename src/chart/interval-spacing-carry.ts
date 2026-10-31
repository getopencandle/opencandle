/** An interval change keeps the bar spacing, right-aligned. The renderer
 * already keeps its spacing across a new feed, but its zoom-out bound (LV-VELA-NAV-1: no more than all bars plus a small
 * margin) raises the spacing when the new interval has few bars (2 years of daily data = ~100 weekly bars). Without a carry,
 * 1D (200 bars) -> 1W (all 101 bars, wider) -> 1D came back at the weekly spacing (~97 bars). The carry remembers the spacing
 * the user chose and restores it on the next interval change, as long as the user has not zoomed since the bound applied. */
export interface SpacingRenderer {coords?:{getViewport():{barSpacing:number;rightOffset:number}|null|undefined};applyViewport?(viewport:{barSpacing:number;rightOffset:number}):void;scene?:{style?:{margins?:{right?:unknown}}}}

/** Median of the newest gaps, in the bars' own time unit. 0 when there are fewer than two bars. */
export function typicalBarStep(times:readonly number[]):number{
 const gaps:number[]=[];for(let index=Math.max(1,times.length-21);index<times.length;index++){const gap=times[index]-times[index-1];if(gap>0)gaps.push(gap);}
 gaps.sort((a,b)=>a-b);return gaps.length?gaps[Math.floor(gaps.length/2)]:0;
}

export function createIntervalSpacingCarry(initialStep=0){
 let step:number|null=initialStep>0?initialStep:null,intent:number|null=null,applied:number|null=null;
 const spacing=(renderer:SpacingRenderer|null|undefined)=>{try{const value=renderer?.coords?.getViewport()?.barSpacing;return typeof value==='number'&&Number.isFinite(value)&&value>0?value:null;}catch{return null;}};
 return {
  /** Before a feed: the spacing to restore after it when the bar step changes (an interval change), else null. */
  begin(renderer:SpacingRenderer|null|undefined,nextStep:number):number|null{
   const previous=step;step=nextStep>0?nextStep:null;const now=spacing(renderer);
   if(previous===null||step===null||previous===step||now===null)return null;
   return intent!==null&&applied!==null&&Math.abs(now-applied)<1e-6?intent:now;
  },
  /** After the feed: apply the carried spacing at the latest bar (the renderer clamps it) and remember both values. */
  finish(renderer:SpacingRenderer|null|undefined,carried:number){
   if(!renderer||typeof renderer.applyViewport!=='function')return;
   const margin=renderer.scene?.style?.margins?.right,rightOffset=typeof margin==='number'&&Number.isFinite(margin)?margin:3;
   renderer.applyViewport({barSpacing:carried,rightOffset});
   intent=carried;applied=spacing(renderer);
  },
  /** A derived chart type or a fitted reset starts a new spacing history; the source bar step is still recorded. */
  reset(nextStep:number){step=nextStep>0?nextStep:null;intent=null;applied=null;},
 };
}
