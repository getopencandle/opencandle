// Bars pattern geometry: pure functions, unit-testable without a canvas.
//
//  * Horizontal: ordinal and pixel-linear. Slot i sits at x0 + i*(x1-x0)/(n-1) (n=1: the one bar owns the whole span: bar modes draw ONE bar whose
//    body spans x0 to x1 (box), line modes a flat line x0 to x1; a pattern of any bar count spans anchor to anchor; owner rule 2026-10-17). Source gaps are not reproduced,
//    like the chart's own gapless bar axis, so at placement every bar lands on its own source bar.
//  * Vertical: y(p) = yOf(A.price + s*(p - ref)), s = flipped ? -1 : 1 (flip mirrors about anchor 1's price).
//  * Mirrored: bar i is drawn at slot n-1-i (time reversal).
//  * Density (section 3.6): pitch p = |x1-x0|*dpr/(n-1) device px. p >= 3: one segment per bar at its centre;
//    1 <= p < 3: one segment per bar snapped to whole device px; p < 1: per-device-pixel-column aggregation
//    (HL: [min low, max high]; OC: [min(firstOpen,lastClose), max(...)]; line modes: per-column min/max decimation, the two
//    extremes emitted in the order they occur so neighbouring columns join in time order; the envelope is preserved and a
//    column costs at most 2 segments).
// Scaling rule (2026-10-16): a source-resolution change keeps both anchors, so x0/x1 and the projected width are
// unchanged and finer bars are compressed into the same span. Nothing here special-cases it: n changes, the pitch shrinks.
import type {PatternColumns} from './bars-pattern-data';

/** Mode enum, stored 1:1. */
export const BARS_PATTERN_MODES=Object.freeze({Bars:0,Line:1,OpenClose:2,LineOpen:3,LineHigh:4,LineLow:5,LineHL2:6} as const);
/** Dialog options in UI order,
 *  which is NOT numeric order, mapped onto the stored enum. */
export const BARS_PATTERN_MODE_OPTIONS:readonly {readonly value:string;readonly label:string}[]=Object.freeze([
 {value:'0',label:'HL bars'},{value:'2',label:'OC bars'},{value:'1',label:'Line - close'},{value:'3',label:'Line - open'},
 {value:'4',label:'Line - high'},{value:'5',label:'Line - low'},{value:'6',label:'Line - HL/2'},
].map(option=>Object.freeze(option)));
export const isBarsPatternMode=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=6;
export const isLineMode=(mode:number)=>mode!==BARS_PATTERN_MODES.Bars&&mode!==BARS_PATTERN_MODES.OpenClose;

export interface PatternFrame{
 readonly x0:number;readonly x1:number;
 /** Price of anchor 1 (A) and the stored reference price (price of placement click 1). */
 readonly anchorPrice:number;readonly refPrice:number;
 readonly mirrored:boolean;readonly flipped:boolean;readonly mode:number;
 /** Device pixel ratio of the canvas (1 when unknown). */
 readonly dpr:number;
 readonly yOf:(price:number)=>number|null;
}
export type PatternPrimitives=
 |{readonly kind:'bars';readonly aggregated:boolean;readonly pitch:number;readonly segments:Float64Array;
   /** n=1 only: the one bar's body spans anchor to anchor (x0 to x1); segments holds its single (x, top, bottom) entry. */
   readonly box?:{readonly x0:number;readonly x1:number}}
 |{readonly kind:'line';readonly aggregated:boolean;readonly pitch:number;readonly points:Float64Array};

/** Slot x. n=1 line modes draw two points of the same bar (0 at x0, 1 at x1) so the line spans the stored width. */
export const slotX=(slot:number,n:number,x0:number,x1:number)=>n<=1?(slot<=0?x0:x1):x0+slot*(x1-x0)/(n-1);
export const barAtSlot=(slot:number,n:number,mirrored:boolean)=>mirrored?n-1-slot:slot;
export const mapPrice=(price:number,frame:Pick<PatternFrame,'anchorPrice'|'refPrice'|'flipped'>)=>frame.anchorPrice+(frame.flipped?-1:1)*(price-frame.refPrice);
/** Device-pixel pitch between neighbouring slots (Infinity for one bar). */
export const devicePitch=(n:number,x0:number,x1:number,dpr:number)=>n<=1?Infinity:Math.abs(x1-x0)*dpr/(n-1);

/** The value a line mode draws for bar i. */
export function lineValue(columns:PatternColumns,i:number,mode:number):number{
 switch(mode){
  case BARS_PATTERN_MODES.LineOpen:return columns.open[i];
  case BARS_PATTERN_MODES.LineHigh:return columns.high[i];
  case BARS_PATTERN_MODES.LineLow:return columns.low[i];
  case BARS_PATTERN_MODES.LineHL2:return (columns.high[i]+columns.low[i])/2;
  default:return columns.close[i];
 }
}
/** The [lo, hi] price pair a bar mode draws for bar i (HL bars: low/high; OC bars: open/close). */
function barPair(columns:PatternColumns,i:number,mode:number):[number,number]{
 return mode===BARS_PATTERN_MODES.OpenClose?[columns.open[i],columns.close[i]]:[columns.low[i],columns.high[i]];
}

const snap=(x:number,dpr:number)=>(Math.floor(x*dpr)+0.5)/dpr;

/** Builds the drawn primitives in CSS px. Returns null when the pane is gone (yOf null). Cost O(n) once; output O(min(n, width*dpr)). */
export function patternPrimitives(columns:PatternColumns,frame:PatternFrame):PatternPrimitives|null{
 const n=columns.count,{x0,x1,dpr,mode,mirrored}=frame,pitch=devicePitch(n,x0,x1,dpr),line=isLineMode(mode);
 const y=(price:number)=>frame.yOf(mapPrice(price,frame));
 if(pitch>=1){
  const snapped=pitch<3,m=n===1&&line?2:n,out=new Float64Array(m*(line?2:3));
  for(let slot=0;slot<m;slot++){
   const i=n===1?0:barAtSlot(slot,n,mirrored),raw=slotX(slot,n,x0,x1),x=snapped?snap(raw,dpr):raw;
   if(line){const v=y(lineValue(columns,i,mode));if(v==null)return null;out[slot*2]=x;out[slot*2+1]=v;}
   else{const [lo,hi]=barPair(columns,i,mode),a=y(lo),b=y(hi);if(a==null||b==null)return null;out[slot*3]=x;out[slot*3+1]=Math.min(a,b);out[slot*3+2]=Math.max(a,b);}
  }
  return line?{kind:'line',aggregated:false,pitch,points:out}:{kind:'bars',aggregated:false,pitch,segments:out,...n===1?{box:{x0:snap(x0,dpr),x1:snap(x1,dpr)}}:{}};
 }
 // p < 1: per device-pixel column. Slot x is monotonic in slot order, so each column is one run of consecutive slots.
 const left=Math.min(x0,x1),values:number[]=[];
 let column=Number.NaN,lo=Infinity,hi=-Infinity,loAt=0,hiAt=0,firstOpen=0,lastClose=0;
 const flush=()=>{
  if(Number.isNaN(column))return true;
  const x=left+(column+0.5)/dpr;
  if(line){const a=y(lo),b=y(hi);if(a==null||b==null)return false;if(loAt<=hiAt)values.push(x,a,x,b);else values.push(x,b,x,a);}
  else{
   const top=mode===BARS_PATTERN_MODES.OpenClose?Math.max(firstOpen,lastClose):hi,bottom=mode===BARS_PATTERN_MODES.OpenClose?Math.min(firstOpen,lastClose):lo;
   const a=y(bottom),b=y(top);if(a==null||b==null)return false;values.push(x,Math.min(a,b),Math.max(a,b));
  }
  return true;
 };
 for(let slot=0;slot<n;slot++){
  const i=barAtSlot(slot,n,mirrored),col=Math.floor((slotX(slot,n,x0,x1)-left)*dpr);
  if(col!==column){if(!flush())return null;column=col;lo=Infinity;hi=-Infinity;firstOpen=columns.open[i];}
  if(line){const v=lineValue(columns,i,mode);if(v<lo){lo=v;loAt=slot;}if(v>hi){hi=v;hiAt=slot;}}
  else{if(columns.low[i]<lo)lo=columns.low[i];if(columns.high[i]>hi)hi=columns.high[i];lastClose=columns.close[i];}
 }
 if(!flush())return null;
 const out=Float64Array.from(values);
 return line?{kind:'line',aggregated:true,pitch,points:out}:{kind:'bars',aggregated:true,pitch,segments:out};
}

/** Data-space extremes of what the mode draws (memoised per columns object and mode). */
const extremesCache=new WeakMap<PatternColumns,Map<number,{min:number;max:number}>>();
export function drawnExtremes(columns:PatternColumns,mode:number):{min:number;max:number}{
 let byMode=extremesCache.get(columns);if(!byMode){byMode=new Map();extremesCache.set(columns,byMode);}
 const hit=byMode.get(mode);if(hit)return hit;
 let min=Infinity,max=-Infinity;
 for(let i=0;i<columns.count;i++){
  if(isLineMode(mode)){const v=lineValue(columns,i,mode);if(v<min)min=v;if(v>max)max=v;}
  else{const [a,b]=barPair(columns,i,mode);min=Math.min(min,a,b);max=Math.max(max,a,b);}
 }
 const result={min,max};byMode.set(mode,result);return result;
}
/** Mapped data-space price range of the drawn pattern. */
export function patternPriceRange(columns:PatternColumns,frame:Pick<PatternFrame,'anchorPrice'|'refPrice'|'flipped'|'mode'>):{min:number;max:number}{
 const {min,max}=drawnExtremes(columns,frame.mode),a=mapPrice(min,frame),b=mapPrice(max,frame);
 return{min:Math.min(a,b),max:Math.max(a,b)};
}
/** Pixel bounds of the drawn pattern (selection box), or null when the pane is gone. */
export function patternBounds(columns:PatternColumns,frame:PatternFrame):{x:number;y:number;w:number;h:number}|null{
 const range=patternPriceRange(columns,frame),a=frame.yOf(range.min),b=frame.yOf(range.max);
 if(a==null||b==null)return null;
 const left=Math.min(frame.x0,frame.x1),top=Math.min(a,b);
 return{x:left,y:top,w:Math.abs(frame.x1-frame.x0),h:Math.abs(b-a)};
}
/** Mapped close of the last drawn slot: the derived price of handle 2. */
export function lastDrawnClose(columns:PatternColumns,frame:Pick<PatternFrame,'anchorPrice'|'refPrice'|'flipped'|'mirrored'>):number{
 const n=columns.count;return mapPrice(columns.close[barAtSlot(n-1,n,frame.mirrored)],frame);
}

function distToSegment(px:number,py:number,ax:number,ay:number,bx:number,by:number){
 const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;let t=len?((px-ax)*dx+(py-ay)*dy)/len:0;t=Math.max(0,Math.min(1,t));
 return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
}
/** Hit test: inside the per-column envelope of the bars within tol px horizontally (+-tol vertically), or within tol of a
 *  sparse line mode's polyline. */
export function patternHit(columns:PatternColumns,frame:PatternFrame,px:number,py:number,tol:number):boolean{
 const n=columns.count,{x0,x1,mode,mirrored}=frame,left=Math.min(x0,x1),right=Math.max(x0,x1);
 if(px<left-tol||px>right+tol)return false;
 const y=(price:number)=>frame.yOf(mapPrice(price,frame));
 let lo=0,hi=n-1;
 if(n>1&&x1!==x0){
  const pitch=Math.abs(x1-x0)/(n-1),s=(px-x0)/(x1-x0)*(n-1),reach=tol/pitch;
  lo=Math.max(0,Math.floor(s-reach));hi=Math.min(n-1,Math.ceil(s+reach));
  if(isLineMode(mode)&&pitch>=1){
   for(let slot=Math.max(0,lo-1);slot<Math.min(n-1,hi+1);slot++){
    const a=y(lineValue(columns,barAtSlot(slot,n,mirrored),mode)),b=y(lineValue(columns,barAtSlot(slot+1,n,mirrored),mode));
    if(a==null||b==null)return false;
    if(distToSegment(px,py,slotX(slot,n,x0,x1),a,slotX(slot+1,n,x0,x1),b)<=tol)return true;
   }
   return false;
  }
 }
 if(lo>hi)return false;
 let min=Infinity,max=-Infinity;
 for(let slot=lo;slot<=hi;slot++){
  const i=barAtSlot(slot,n,mirrored);
  if(isLineMode(mode)){const v=lineValue(columns,i,mode);if(v<min)min=v;if(v>max)max=v;}
  else{const [a,b]=barPair(columns,i,mode);min=Math.min(min,a,b);max=Math.max(max,a,b);}
 }
 const a=y(min),b=y(max);if(a==null||b==null)return false;
 return py>=Math.min(a,b)-tol&&py<=Math.max(a,b)+tol;
}
