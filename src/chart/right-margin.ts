/** Honour the chart settings right margin (canvas.rightMarginBars) in the pinned renderer.
 * The renderer keeps the margin in scene.style.margins.right (bars, clamped 0 to 200 like its own config path) and uses it for the
 * first fit, the time-axis reset, scroll to latest and the pan bound. A view still sitting at the old margin (a chart just opened,
 * or the user at the live edge) moves to the new margin; a panned or restored view is left where it is.
 * Returns true when the view moved. */
/** The renderer's own cap, in bars. The Chart settings Right margin row accepts the same range. */
export const RIGHT_MARGIN_MAX_BARS=200;
export interface RightMarginRenderer {scene?:{style?:{margins?:{right:number}}};coords?:{barCount:number;getViewport():{barSpacing:number;rightOffset:number}};applyViewport?:(viewport:{barSpacing:number;rightOffset:number})=>void}
export function applyRightMargin(renderer:RightMarginRenderer|null|undefined,bars:number):boolean{
 if(typeof bars!=='number'||!Number.isFinite(bars))throw Error('Enter a right margin in bars.');
 const margins=renderer?.scene?.style?.margins;if(!renderer||!margins)return false;
 const next=Math.round(Math.max(0,Math.min(RIGHT_MARGIN_MAX_BARS,bars))),previous=margins.right;
 if(next===previous)return false;
 renderer.scene!.style!.margins={...margins,right:next};
 const coords=renderer.coords,vp=coords?.getViewport();
 if(!coords||!coords.barCount||!vp||typeof renderer.applyViewport!=='function'||Math.abs(vp.rightOffset-previous)>1e-6)return false;
 renderer.applyViewport({barSpacing:vp.barSpacing,rightOffset:next});return true;
}
