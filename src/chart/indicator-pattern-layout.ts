// Readable pattern labels and an honest price scale for indicator decorations (chart patterns, candlestick patterns,
// Sequential, Auto trendlines). Two runtime seams on the pinned renderer, in the precision-crosshair style (instance
// methods wrapped, no upstream source rewrite, no COMPAT step):
//  - The indicator drawing slices' `drawLabels(ctx, W, H, xOf, yOf)`: pattern text bubbles are laid out in pixels at paint
//    time, so they never cover one another or the chart legend at any zoom. A bubble that would overlap moves out from its
//    bar (above the bar upward, below the bar downward), stacking like a lane; one that would leave the pane or meet the
//    legend tries the other side of its bar. Nothing is removed and the stored labels are never changed.
//  - The chrome's `drawingsRange(set, vr, offset)` (the drawing part of the pane autoscale): an OpenCandle decoration line
//    contributes only the part of its anchored segment inside the visible bars; its projection (extend right, drawn on to
//    the edge) never counts. The renderer folds both endpoints of any line that crosses the window, so a ray from an old
//    off-screen pivot (Auto trendlines) lifted the scale, and a steep ray's projection would stretch it the other way.
import type {NativeRenderer} from '@luxalgo/vela';

type Row=Record<string,any>;
export interface LayoutRect {left:number;top:number;right:number;bottom:number}
/** A pattern bubble in pane pixels: px is the bar's x, py the pointer tip, side the natural side of its bar. */
export interface LayoutBubble {key:number;px:number;py:number;width:number;height:number;side:'above'|'below';flipPy:number}
export interface LayoutResult {key:number;py:number;side:'above'|'below';moved:boolean}

const DECORATION='lv-decoration:';
/** A pattern marker of an indicator (indicatorDecorationId(instance, 'pattern:marker:N')). */
export const isPatternMarkerLabel=(id:unknown)=>typeof id==='string'&&id.startsWith(DECORATION)&&id.includes('"pattern:marker:');
const POINTER=7,PAD=2;

/** The pixel box of a bubble whose pointer tip is at (px, py): above the bar the box sits over the tip, below it under. */
export function bubbleRect(px:number,py:number,width:number,height:number,side:'above'|'below'):LayoutRect{
 return side==='above'?{left:px-width/2,top:py-height-POINTER,right:px+width/2,bottom:py}:{left:px-width/2,top:py,right:px+width/2,bottom:py+POINTER+height};
}
const hit=(a:LayoutRect,b:LayoutRect)=>a.left<b.right+PAD&&b.left<a.right+PAD&&a.top<b.bottom+PAD&&b.top<a.bottom+PAD;

/**
 * Greedy layout in bar order (then input order). Each bubble keeps its place when free; otherwise it moves out from its bar
 * past every box it meets. When that leaves the pane (0..height) the other side of the bar is tried the same way; when
 * both fail it stays where the first side put it, clamped into the pane. `blocked` boxes (the legend) are never covered
 * when a free place exists.
 */
export function layoutPatternBubbles(bubbles:readonly LayoutBubble[],paneHeight:number,blocked:readonly LayoutRect[]=[]):LayoutResult[]{
 const placed:LayoutRect[]=[...blocked],out:LayoutResult[]=[];
 const order=[...bubbles].sort((a,b)=>a.px-b.px||a.key-b.key);
 const settle=(bubble:LayoutBubble,side:'above'|'below',start:number)=>{
  let py=start;
  for(let guard=0;guard<=placed.length+1;guard++){
   const rect=bubbleRect(bubble.px,py,bubble.width,bubble.height,side),other=placed.find(row=>hit(rect,row));
   if(!other)return {py,rect,inside:rect.top>=0&&rect.bottom<=paneHeight};
   py=side==='above'?other.top-PAD-1:other.bottom+PAD+1;
  }
  return {py,rect:bubbleRect(bubble.px,py,bubble.width,bubble.height,side),inside:false};
 };
 for(const bubble of order){
  const first=settle(bubble,bubble.side,bubble.py);let side=bubble.side,chosen=first;
  if(!first.inside){
   const otherSide=bubble.side==='above'?'below':'above',second=settle(bubble,otherSide,bubble.flipPy);
   if(second.inside){side=otherSide;chosen=second;}
   else{// Neither side has room: stay at the bar, moved only as far as needed to remain on the pane (may overlap).
    const natural=bubbleRect(bubble.px,bubble.py,bubble.width,bubble.height,side),py=natural.top<0?bubble.py-natural.top:natural.bottom>paneHeight?bubble.py-(natural.bottom-paneHeight):bubble.py;
    chosen={py,rect:bubbleRect(bubble.px,py,bubble.width,bubble.height,side),inside:false};
   }
  }
  placed.push(chosen.rect);out.push({key:bubble.key,py:chosen.py,side,moved:side!==bubble.side||Math.abs(chosen.py-bubble.py)>0.5});
 }
 return out.sort((a,b)=>a.key-b.key);
}

/** The price at pixel y for a monotonic price-to-pixel map (linear or log), by bracketing and bisection. */
export function priceAtPixel(yOf:(price:number)=>number|null,y:number,near:number):number|null{
 const at=(price:number)=>{const value=yOf(price);return typeof value==='number'&&Number.isFinite(value)?value:null;};
 const y0=at(near);if(y0===null)return null;if(y0===y)return near;
 let step=Math.max(Math.abs(near)*0.01,1e-9),a=near,b=near;const up=y<y0;// smaller pixel y is a higher price
 for(let i=0;i<200;i++){b=up?near+step:near-step;const value=at(b);if(value===null)return null;if(up?value<=y:value>=y)break;a=b;step*=2;if(i===199)return null;}
 for(let i=0;i<64;i++){const mid=(a+b)/2,value=at(mid);if(value===null)return null;if(up?value>y:value<y)a=mid;else b=mid;}
 return (a+b)/2;
}

/** The visible part [lo, hi] (logical bars) of a decoration line, as a plain segment in the same price space; null when
 *  none of it is visible. Rays (extend right/left/both) are cut at the window; vertical lines are kept as they are. */
export function clipLineToWindow(a:number,b:number,y1:number,y2:number,extend:string,lo:number,hi:number):{x1:number;x2:number;y1:number;y2:number}|null{
 if(a===b)return a>=lo&&a<=hi?{x1:a,x2:b,y1,y2}:null;
 const left=extend==='left'||extend==='both'?-Infinity:Math.min(a,b),right=extend==='right'||extend==='both'?Infinity:Math.max(a,b);
 const from=Math.max(left,lo),to=Math.min(right,hi);if(!(from<=to))return null;
 const at=(x:number)=>y1+(y2-y1)*(x-a)/(b-a);return {x1:from,x2:to,y1:at(from),y2:at(to)};
}

/** The drawing set the autoscale reads: each decoration line reduced to the visible part of its anchored segment (the
 *  projection of a ray is not data; a line with no visible anchored part is left out). Other drawings are unchanged. */
export function scaleDrawingSet(set:Row,lo:number,hi:number,indexOffset:number,logicalOf:(xloc:string,x:number)=>number):Row{
 const lines=set?.lines;if(!Array.isArray(lines)||!lines.some(line=>typeof line?.id==='string'&&line.id.startsWith(DECORATION)))return set;
 const next:Row[]=[];
 for(const line of lines){
  if(typeof line?.id!=='string'||!line.id.startsWith(DECORATION)||line.invisible){next.push(line);continue;}
  const a=logicalOf(line.xloc,line.x1),b=logicalOf(line.xloc,line.x2);if(!Number.isFinite(a)||!Number.isFinite(b)){next.push(line);continue;}
  const cut=clipLineToWindow(a,b,line.y1,line.y2,'none',Math.min(lo,hi),Math.max(lo,hi));if(!cut)continue;
  next.push({...line,xloc:'bar_index',x1:cut.x1-indexOffset,x2:cut.x2-indexOffset,y1:cut.y1,y2:cut.y2,extend:'none'});
 }
 return {...set,lines:next};
}

const installed=new WeakMap<object,()=>void>();
function ownMethod(owner:Row,key:string):(this:any,...args:any[])=>any{
 if(Object.hasOwn(owner,key))throw Error(`Pattern layout method already has an owner: ${key}`);
 const value=owner[key];if(typeof value!=='function')throw Error(`Pattern layout method changed: ${key}`);return value;
}
const FONT_PX:Record<string,number>={tiny:10,small:12,normal:14,large:18,huge:28,auto:12};

/** Installs both seams on a renderer. `blocked()` returns the legend boxes in plot pixels (read once per slice paint; a
 *  throw reads as none). Returns the uninstaller. */
export function installPatternLabelLayout(renderer:NativeRenderer,blocked:()=>readonly LayoutRect[]=()=>[]):()=>void{
 const host=renderer as unknown as Row,scene=host?.indicatorSlices?.drawScene,chrome=host?.chrome;
 if(!scene||typeof scene!=='object'||!chrome||typeof chrome!=='object')throw Error('The renderer drawing scenes are unavailable');
 if(installed.has(scene))throw Error('The pattern label layout is already installed');
 const originalLabels=ownMethod(scene,'drawLabels'),originalRange=ownMethod(chrome,'drawingsRange');let active=true;
 const drawLabels=function(this:Row,ctx:CanvasRenderingContext2D,W:number,H:number,xOf:(logical:number)=>number,yOf:(price:number)=>number|null){
  const set=this.set,labels:Row[]|undefined=set?.labels;
  if(!active||!Array.isArray(labels)||!labels.some(label=>isPatternMarkerLabel(label?.id)))return Reflect.apply(originalLabels,this,[ctx,W,H,xOf,yOf]);
  let next:Row[]|null=null;
  try{
   let rects:readonly LayoutRect[]=[];try{const t=ctx.getTransform(),top=t.a?t.f/t.a:0;rects=blocked().map(row=>({left:row.left,right:row.right,top:row.top-top,bottom:row.bottom-top})).filter(row=>row.bottom>0&&row.top<H);}catch{rects=[];}
   const bubbles:LayoutBubble[]=[],source=new Map<number,{label:Row;high:number;low:number}>(),flips=new Map<number,Row>();
   labels.forEach((label,key)=>{
    if(!isPatternMarkerLabel(label?.id))return;
    const logical=this.logicalOf(label.xloc,label.x),px=xOf(logical);if(!Number.isFinite(px)||px< -50||px>W+50)return;
    const bar=this.deps?.barAt?.(logical);if(!bar)return;const high=yOf(bar.high),low=yOf(bar.low);if(typeof high!=='number'||typeof low!=='number')return;
    if(label.style==='none'&&(label.yloc==='abovebar'||label.yloc==='belowbar')){
     // A plain count (Sequential 1-8) under the legend reads on the other side of its bar instead (its color keeps its side).
     const fontPx=FONT_PX[label.size]??12,font=this.labelFont(label,fontPx),lines=String(label.text??'').split(String.fromCharCode(10)),width=Math.max(1,...lines.map(line=>this.measure(ctx,font,line))),height=fontPx*1.25*lines.length;
     const box=(cy:number):LayoutRect=>({left:px-width/2,right:px+width/2,top:cy-height/2,bottom:cy+height/2}),above=label.yloc==='abovebar',here=box(above?high-14:low+14),there=box(above?low+14:high-14);
     if(rects.some(rect=>hit(here,rect))&&!rects.some(rect=>hit(there,rect))&&there.top>=0&&there.bottom<=H)flips.set(key,{...label,yloc:above?'belowbar':'abovebar'});
     return;
    }
    if(label.style!=='label_up'&&label.style!=='label_down')return;
    const side=label.style==='label_down'?'above':'below';
    const py=label.yloc==='price'?yOf(label.y):label.yloc==='abovebar'?high-14:label.yloc==='belowbar'?low+14:null;if(typeof py!=='number'||!Number.isFinite(py))return;
    const fontPx=FONT_PX[label.size]??12,font=this.labelFont(label,fontPx),lines=String(label.text??'').split('\n');
    const width=Math.max(1,...lines.map(line=>this.measure(ctx,font,line)))+12,height=fontPx*1.25*lines.length+8;
    bubbles.push({key,px,py,width,height,side,flipPy:side==='above'?low+14:high-14});source.set(key,{label,high:bar.high,low:bar.low});
   });
   const moved=layoutPatternBubbles(bubbles,H,rects).filter(row=>row.moved);
   if(moved.length||flips.size){
    next=[...labels];for(const [key,label] of flips)next[key]=label;
    for(const row of moved){const {label,high,low}=source.get(row.key)!,price=priceAtPixel(yOf,row.py,row.side==='above'?high:low);if(price===null)continue;next[row.key]={...label,yloc:'price',y:price,style:row.side==='above'?'label_down':'label_up'};}
   }
  }catch{next=null;}
  if(!next)return Reflect.apply(originalLabels,this,[ctx,W,H,xOf,yOf]);
  this.set={...set,labels:next};try{return Reflect.apply(originalLabels,this,[ctx,W,H,xOf,yOf]);}finally{this.set=set;}
 };
 const drawingsRange=function(this:Row,set:Row,vr:Row,indexOffset=0,...rest:unknown[]){
  if(!active)return Reflect.apply(originalRange,this,[set,vr,indexOffset,...rest]);
  let shown=set;
  try{const from=Number(vr?.from),to=Number(vr?.to),drawScene=this.drawScene;if(Number.isFinite(from)&&Number.isFinite(to)&&drawScene&&typeof drawScene.logicalOf==='function'){
   const previous=drawScene.indexOffset;drawScene.indexOffset=indexOffset;
   try{shown=scaleDrawingSet(set,from,to,indexOffset,(xloc,x)=>drawScene.logicalOf(xloc,x));}finally{drawScene.indexOffset=previous;}
  }}catch{shown=set;}
  return Reflect.apply(originalRange,this,[shown,vr,indexOffset,...rest]);
 };
 Object.defineProperty(scene,'drawLabels',{configurable:true,writable:true,value:drawLabels});
 Object.defineProperty(chrome,'drawingsRange',{configurable:true,writable:true,value:drawingsRange});
 const dispose=()=>{
  if(!active)return;active=false;installed.delete(scene);
  for(const [owner,key,value] of [[scene,'drawLabels',drawLabels],[chrome,'drawingsRange',drawingsRange]] as const){const own=Object.getOwnPropertyDescriptor(owner,key);if(own&&'value' in own&&own.value===value)delete (owner as Row)[key];}
 };
 installed.set(scene,dispose);return dispose;
}

/** The chart heading (symbol and OHLC line), legend rows and trading buttons over a plot canvas, in plot pixels (DOM boxes that intersect the canvas). */
export function legendBoxesOver(canvas:unknown):LayoutRect[]{
 if(typeof Element==='undefined'||!(canvas instanceof Element))return [];
 const base=canvas.getBoundingClientRect(),doc=canvas.ownerDocument,out:LayoutRect[]=[];
 for(const element of doc.querySelectorAll('.chart-heading > *, .lv-legend-pane[data-legend-pane="price"] > *, .lv-trade-buttons')){
  const box=element.getBoundingClientRect();if(!box.width||!box.height)continue;
  if(box.right<=base.left||box.left>=base.right||box.bottom<=base.top||box.top>=base.bottom)continue;
  out.push({left:box.left-base.left,top:box.top-base.top,right:box.right-base.left,bottom:box.bottom-base.top});
 }
 return out;
}
