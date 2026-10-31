import {sameChartSourceBasis,type ChartSourceContext} from '../chart/source-context';

interface InlineDialogChart {
 finishInlineText():boolean;
 getSourceContext():ChartSourceContext;
 getStyle():string;
 getAnalysisUnavailable():string;
 captureInlineTextSourceOwner?():()=>void;
}

/** Commit an owned inline draft, then recheck the separate dialog action authority. */
export function finishInlineDialogTransfer(chart:InlineDialogChart,assertAction:()=>void,onOwner?:(assertCurrent:()=>void)=>void):boolean {
 assertAction();const privateOwner=chart.captureInlineTextSourceOwner?.();assertAction();
 const base=()=>{assertAction();privateOwner?.();assertAction();};
 const checked=<T>(read:()=>T)=>{base();const value=read();base();return value;};
 const source=checked(()=>chart.getSourceContext()),style=checked(()=>chart.getStyle());
 const assertCurrent=()=>{
  const current=checked(()=>chart.getSourceContext()),currentStyle=checked(()=>chart.getStyle());
  if(!sameChartSourceBasis(source,current,true)||source.inputIdentity!==current.inputIdentity||style!==currentStyle)throw Error('The chart changed while finishing inline text. Open drawing settings again.');
  base();
 };
 // Error reporting and the final dialog handoff retain this same source owner.
 onOwner?.(assertCurrent);base();
 if(!checked(()=>chart.finishInlineText()))return false;
 assertCurrent();
 const unavailable=checked(()=>chart.getAnalysisUnavailable());if(unavailable)throw Error(unavailable);
 assertCurrent();return true;
}
