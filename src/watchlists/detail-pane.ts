/**
 * List-over-details split of the watchlist panel.
 * The right-sidebar page stacks the Watchlist widget and then the Details
 * widget below it. Rows are 30px and the column header 28px. The divider
 * thickness, step sizes and default height are LV choices.
 */
export interface DetailPane {height:number;collapsed:boolean}
export const DETAIL_PANE_LIMITS={
 /** Column header 28 + three 30px rows = 118; rounded up. */
 listMin:120,
 /** Fallback floor when the details header cannot be measured. */
 detailsMin:72,
 /** Persisted bound; real use is bounded by the measured panel. */
 max:4000,
 defaultHeight:320,
 divider:5,
 step:16,
 page:64,
} as const;
export function defaultDetailPane():DetailPane{return{height:DETAIL_PANE_LIMITS.defaultHeight,collapsed:false};}
/** Strict restore for the persisted workspace record: exactly {height,collapsed}. */
export function restoreDetailPane(value:unknown):DetailPane{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw Error('Invalid watchlist details pane.');
 const keys=Object.keys(value);if(keys.length!==2||!keys.includes('height')||!keys.includes('collapsed'))throw Error('Invalid watchlist details pane.');
 const record=value as Record<string,unknown>,height=record.height;
 if(typeof height!=='number'||!Number.isInteger(height)||height<DETAIL_PANE_LIMITS.detailsMin||height>DETAIL_PANE_LIMITS.max||typeof record.collapsed!=='boolean')throw Error('Invalid watchlist details pane.');
 return{height,collapsed:record.collapsed};
}
/**
 * Clamp a requested details height (px, divider excluded).
 * available: px shared by list and details below the list's top edge (divider
 * excluded), or null when unmeasured. headerMin: the measured details header.
 * The list keeps listMin first; the details never go below their header.
 * When both cannot fit the details keep the header and the list takes what remains.
 */
export function clampDetailPaneHeight(requested:number,available:number|null,headerMin:number=DETAIL_PANE_LIMITS.detailsMin):number{
 const floor=Math.min(DETAIL_PANE_LIMITS.max,Math.max(DETAIL_PANE_LIMITS.detailsMin,Math.ceil(Number.isFinite(headerMin)?headerMin:0)));
 const wanted=Number.isFinite(requested)?Math.round(requested):DETAIL_PANE_LIMITS.defaultHeight;
 const ceiling=available!==null&&Number.isFinite(available)?Math.floor(available)-DETAIL_PANE_LIMITS.listMin:DETAIL_PANE_LIMITS.max;
 return Math.max(floor,Math.min(wanted,ceiling,DETAIL_PANE_LIMITS.max));
}
/** Pointer drag: moving the divider up (smaller clientY) grows the details. */
export function dragDetailPaneHeight(startHeight:number,startY:number,currentY:number,available:number|null,headerMin?:number):number{
 return clampDetailPaneHeight(startHeight+(startY-currentY),available,headerMin);
}
/** Keyboard on the separator. Returns null for keys it does not handle. */
export function keyDetailPaneHeight(height:number,key:string,available:number|null,headerMin?:number):number|null{
 const {step,page,max}=DETAIL_PANE_LIMITS;
 const next=key==='ArrowUp'?height+step:key==='ArrowDown'?height-step:key==='PageUp'?height+page:key==='PageDown'?height-page:key==='Home'?max:key==='End'?0:null;
 return next===null?null:clampDetailPaneHeight(next,available,headerMin);
}
