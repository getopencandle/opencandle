import {frameCoords} from './derived-time-labels';
import type {NativeRenderer} from '@luxalgo/vela';
import {latestPricePresentation,realLastPrice} from './appearance-price';
import {formatWithPrecision,precisionAxisExact} from './symbol-precision';
import {axisPriceText,clampChipCenter,countdownTarget,drawingAxisLabels,drawingTimeAxisLabels,paintDrawingTimeLabels,labelTextColor,lastChangePercentText,layoutAxisLabels,previousDayClose,reservedAxisRanges,visibleHighLow,type AxisDrawing,type AxisDrawingLabel,type CountdownSession} from './axis-labels';
import {registerDwb3PaneSource} from './dwb3-shape-layer';
export {latestPricePresentation} from './appearance-price';

type RecordData=Record<string,any>;
type NativeMethod=(this:any,...args:any[])=>any;
const activeInstallations=new WeakMap<object,()=>void>();
const MAX_VISIBLE_BARS=100_000;

function member(owner:object,key:string):unknown{for(let current:object|null=owner;current;current=Object.getPrototypeOf(current)){const descriptor=Object.getOwnPropertyDescriptor(current,key);if(descriptor){if(!('value' in descriptor))throw Error(`Appearance painter requires a data member: ${key}`);return descriptor.value;}}throw Error(`Appearance painter member is unavailable: ${key}`);}
function object(value:unknown,label:string):RecordData{if(value===null||typeof value!=='object')throw Error(`Appearance painter ${label} is unavailable`);return value as RecordData;}
function method(owner:object,key:string):NativeMethod{const value=member(owner,key);if(typeof value!=='function')throw Error(`Appearance painter method changed: ${key}`);if(Object.hasOwn(owner,key))throw Error(`Appearance painter method already has an owner: ${key}`);return value as NativeMethod;}
function ink(value:unknown,fallback:string):string{return typeof value==='string'&&value.length>0&&value.length<=200?value:fallback;}
function effectiveCandle(scene:RecordData,theme:RecordData){const base=scene.style.candle,override=scene.candleOverride??{},read=(key:string)=>override[key]??base[key];const body=read('bodyVisible'),border=read('borderVisible'),wick=read('wickVisible');if(typeof body!=='boolean'||typeof border!=='boolean'||typeof wick!=='boolean')throw Error('Native candle visibility shape changed');return {body,border,wick,up:ink(override.upColor,theme.upColor),down:ink(override.downColor,theme.downColor),wickUp:read('wickUpColor'),wickDown:read('wickDownColor'),borderUp:read('borderUpColor'),borderDown:read('borderDownColor')};}

const CONTINUOUS:CountdownSession=Object.freeze({kind:'continuous',extended:true});
/** What the price-axis labels follow. Read once per frame; a throwing or absent
 * provider leaves only the native chip (clamped, bar countdown). */
export interface AxisLabelContext{
 labels:{symbolName:boolean;prevClose:boolean;highLow:boolean;noOverlap:boolean};
 lines:{prevCloseLine:boolean};
 /** Symbol name for the name tag beside the last price, or null. */
 symbol:string|null;
 /** The drawings in source time (before the derived-chart lens), for the time-axis label text. Optional. */
 sourceDrawings?:()=>readonly AxisDrawing[];
 /** Exchange timezone (previous day boundary). */
 timezone:string;
 session:CountdownSession;
 /** High and low label color ('' or absent: the scale text color). */
 highLowColor?:string;
 drawings():readonly AxisDrawing[];
 selected():readonly string[];
 /** Price-axis tags the DOM overlays (alert lines, paper orders, position, TP and SL) hold this frame, in
  * canvas px. They are fixed for the canvas labels, so those move away from them under "No overlapping labels". */
 overlayRanges?():readonly (readonly [number,number])[];
 /** Receives the canvas-owned fixed ranges of this frame (last price chip and indicator tags), so the overlays can avoid them. */
 onNativeFixed?(ranges:readonly (readonly [number,number])[]):void;
 /** The latest pre-market or post-market price, painted as its own label and line when enabled. */
 prePost?:{price:number;phase:'pre'|'post';label:boolean;line:boolean;color:string}|null;
 /** The live best bid and ask (Chart settings > Scales > Bid and ask): dotted lines and axis labels. */
 bidAsk?:{bid:{price:number;color:string}|null;ask:{price:number;color:string}|null;label:boolean;line:boolean}|null;
 /** Session breaks: epoch-ms times of the first bar of each later trading date (null or absent: no lines). */
 sessionBreaks?:{times:readonly number[];color:string}|null;
 /** Chart settings > Scales > Symbol, "Price and percentage value". The change percentage row is painted
  * under the last price chip (and its countdown), in the chip color. Absent or false: the chip alone. */
 lastChange?:boolean;
 /** The stored Symbol precision (absent: Default). For Integer, 9 to 15 decimals and 1/N the last price chip and
  * these LV labels print price-mode values with formatWithPrecision instead of the renderer decimals. */
 precision?:string;
 /** The chart is a non-time type (Range, Renko, Kagi, Point and figure, Line break). Its bars have no fixed
  * duration, so the last price chip shows no bar countdown (before, it printed a huge time such as "73329:16:5"). */
 derived?:boolean;
}
const SESSION_BREAK_FALLBACK='#4985e7';
/** Index of the bar opening exactly at `time` (epoch ms, ascending bars), or -1. */
function barIndexAt(bars:readonly RecordData[],time:number):number{
 let low=0,high=bars.length-1;
 while(low<=high){const mid=(low+high)>>1,value=bars[mid].time;if(value===time)return mid;if(value<time)low=mid+1;else high=mid-1;}
 return -1;
}
/** Session breaks: dashed vertical lines between the last bar of one session and the first of the next, across
 * one pane, clipped to the plot. A break whose bar is not in the pane's bars (derived chart types) or is the first bar draws
 * nothing. Returns the number of lines painted. */
export function paintSessionBreaks(ctx:CanvasRenderingContext2D,scene:RecordData,coords:RecordData,pane:RecordData,dataWidth:number,breaks:{times:readonly number[];color:string}|null|undefined):number{
 const bars=scene.bars as readonly RecordData[];if(!breaks||!breaks.times.length||!Array.isArray(bars)||bars.length<2||!(pane.bounds.height>0))return 0;
 const top=pane.bounds.top,height=pane.bounds.height,range=coords.visibleLogicalRange(),xs:number[]=[];
 for(const time of breaks.times){
  const index=barIndexAt(bars,time);if(index<1||index<range.from||index-1>range.to)continue;
  const x=(coords.logicalToX(index-1)+coords.logicalToX(index))/2;if(!Number.isFinite(x)||x<0||x>dataWidth)continue;
  xs.push(Math.round(x)+0.5);
 }
 if(!xs.length)return 0;
 ctx.save();
 try{ctx.beginPath();ctx.rect(0,top,dataWidth,height);ctx.clip();ctx.strokeStyle=ink(breaks.color,SESSION_BREAK_FALLBACK);ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();for(const x of xs){ctx.moveTo(x,top);ctx.lineTo(x,top+height);}ctx.stroke();ctx.setLineDash([]);}
 finally{ctx.restore();}
 return xs.length;
}
/** Previous close price line color (the line width is 1). */
export const PREV_CLOSE_COLOR='#555555';
export interface ChipState{drawn:boolean;y:number;below:number;value:number;color:string}
interface Pending{id:string;y:number;text:string;color:string}
/** Extra price-axis labels after the native chip. Fixed: the chip and any published indicator ranges. Movable, in this order:
 * horizontal drawing labels, selected-drawing labels, previous day close, high, low. */
export function paintAxisLabels(ctx:CanvasRenderingContext2D,scene:RecordData,coords:RecordData,theme:RecordData,dataWidth:number,pane:RecordData,context:AxisLabelContext,chip:ChipState):number{
 const top=pane.bounds.top,bottom=top+pane.bounds.height,y=(price:number)=>coords.priceToY(price,pane.scale,pane.bounds);
 const mode=pane.kind==='price'?scene.scaleMode:pane.scaleMode,percent=(mode==='percent'||mode==='indexed')&&Number.isFinite(pane.percentBaseline)&&pane.percentBaseline!==0?{baseline:pane.percentBaseline,indexed:mode==='indexed'}:null;
 const text=(price:number)=>axisPriceText(price,{scale:pane.scale,height:pane.bounds.height,mintick:scene.priceMintick,percent,precision:percent?undefined:context.precision});
 const pending:Pending[]=[],fixed:[number,number][]=chip.drawn?[[chip.y-8,chip.y+chip.below]]:[];
 for(const range of reservedAxisRanges(scene))fixed.push([range[0],range[1]]);
 try{context.onNativeFixed?.(fixed.map(([a,b])=>[a,b] as const));}catch{/* The overlay layout is advisory. */}
 try{for(const range of context.overlayRanges?.()??[])if(Number.isFinite(range[0])&&Number.isFinite(range[1]))fixed.push([range[0],range[1]]);}catch{/* No overlay tags this frame. */}
 let drawings:{labels:AxisDrawingLabel[];bands:{id:string;min:number;max:number;color:string}[]}={labels:[],bands:[]};
 try{drawings=drawingAxisLabels(context.drawings(),context.selected());}catch{/* Drawings unreadable this frame: no drawing labels. */}
 ctx.save();
 try{
  for(const band of drawings.bands){const a=y(band.min),b=y(band.max),from=Math.max(top,Math.min(a,b)),to=Math.min(bottom,Math.max(a,b));if(to<from)continue;ctx.globalAlpha=0.25;ctx.fillStyle=band.color;ctx.fillRect(dataWidth+1,from-(a===b?8:0),64,Math.max(to-from,a===b?16:0));ctx.globalAlpha=1;}
  for(const label of drawings.labels)pending.push({id:label.id,y:y(label.price),text:text(label.price),color:label.color});
  // Pre/post-market price line (dotted, across the plot) and label (a movable axis label in the phase color).
  const prePost=context.prePost;
  if(prePost&&Number.isFinite(prePost.price)){const py=y(prePost.price);
   if(prePost.line&&py>=top&&py<=bottom){const yy=Math.round(py)+0.5;ctx.strokeStyle=prePost.color;ctx.lineWidth=1;ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(dataWidth,yy);ctx.stroke();ctx.setLineDash([]);}
   if(prePost.label)pending.push({id:'prePost',y:py,text:text(prePost.price),color:prePost.color});}
  const bidAsk=context.bidAsk;
  if(bidAsk)for(const [id,mark] of [['bid',bidAsk.bid],['ask',bidAsk.ask]] as const){if(!mark||!Number.isFinite(mark.price))continue;const py=y(mark.price);
   if(bidAsk.line&&py>=top&&py<=bottom){const yy=Math.round(py)+0.5;ctx.strokeStyle=mark.color;ctx.lineWidth=1;ctx.setLineDash([1,2]);ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(dataWidth,yy);ctx.stroke();ctx.setLineDash([]);}
   if(bidAsk.label)pending.push({id,y:py,text:text(mark.price),color:mark.color});}
  const prev=context.labels.prevClose||context.lines.prevCloseLine?previousDayClose(scene.bars,Number(coords.barInterval),context.timezone):null;
  if(prev!==null){const py=y(prev);
   if(context.lines.prevCloseLine&&py>=top&&py<=bottom){const yy=Math.round(py)+0.5;ctx.strokeStyle=PREV_CLOSE_COLOR;ctx.lineWidth=1;ctx.setLineDash([1,2]);ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(dataWidth,yy);ctx.stroke();ctx.setLineDash([]);}
   if(context.labels.prevClose)pending.push({id:'prevClose',y:py,text:text(prev),color:PREV_CLOSE_COLOR});}
  if(context.labels.highLow){const range=coords.visibleLogicalRange(),extremes=visibleHighLow(scene.bars,range.from,range.to),color=ink(context.highLowColor,theme.textColor);
   if(extremes){pending.push({id:'high',y:y(extremes.high),text:text(extremes.high),color},{id:'low',y:y(extremes.low),text:text(extremes.low),color});}}
  const placed=layoutAxisLabels(fixed,pending.map(row=>({id:row.id,y:row.y})),{top,bottom},context.labels.noOverlap);
  ctx.font=`${scene.style?.fontSize??12}px ${theme.fontFamily??'sans-serif'}`;ctx.textBaseline='middle';
  let painted=0;
  placed.forEach((spot,index)=>{if(spot.hidden)return;const row=pending[index],w=ctx.measureText(row.text).width+8,x=dataWidth+1;
   if(spot.center!==spot.y){ctx.strokeStyle=row.color;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,spot.y);ctx.lineTo(x+4,spot.center);ctx.stroke();}
   ctx.fillStyle=row.color;ctx.fillRect(x,spot.center-8,w,16);ctx.fillStyle=labelTextColor(row.color);ctx.textAlign='center';ctx.fillText(row.text,x+w/2,spot.center);painted++;});
  // The symbol name tag sits just left of the last price chip, in its color. With the main scale on the
  // left (COMPAT-8 scene.lvMainScaleLeft) it sits at the plot's left edge, next to the left chip. On the left-column pass
  // x=0 translates outside the column clip, so only the main pass paints it.
  if(context.labels.symbolName&&context.symbol&&chip.drawn){const w=ctx.measureText(context.symbol).width+8,x=scene.lvMainScaleLeft===true?0:dataWidth-w;ctx.fillStyle=chip.color;ctx.fillRect(x,chip.y-8,w,16);ctx.fillStyle=labelTextColor(chip.color);ctx.textAlign='center';ctx.fillText(context.symbol,x+w/2,chip.y);painted++;}
  return painted;
 }finally{ctx.restore();}
}

/** Horizontal line (and selected drawing) price labels on the axis of each indicator pane, like the main pane.
 * The native chip pass runs for the price pane only, so these run after the whole chrome (the mark lane). Returns the count. */
export function paintSubPaneDrawingLabels(ctx:CanvasRenderingContext2D,scene:RecordData,coords:RecordData,theme:RecordData,dataWidth:number,context:AxisLabelContext):number{
 const panes=typeof scene.orderedPanes==='function'?scene.orderedPanes() as RecordData[]:[];let painted=0;
 for(const pane of panes){
  if(!pane||pane.kind==='price'||pane.collapsed||!(pane.bounds?.height>0)||typeof pane.id!=='string')continue;
  let drawings:{labels:AxisDrawingLabel[];bands:{id:string;min:number;max:number;color:string}[]};
  try{drawings=drawingAxisLabels(context.drawings(),context.selected(),pane.id);}catch{continue;}
  if(!drawings.labels.length&&!drawings.bands.length)continue;
  const top=pane.bounds.top,bottom=top+pane.bounds.height,y=(price:number)=>coords.priceToY(price,pane.scale,pane.bounds);
  const text=(price:number)=>axisPriceText(price,{scale:pane.scale,height:pane.bounds.height,mintick:scene.priceMintick,percent:null,precision:undefined});
  const fixed:[number,number][]=reservedAxisRanges(scene,pane.id).map(range=>[range[0],range[1]]);
  ctx.save();
  try{
   ctx.beginPath();ctx.rect(dataWidth,top,Math.max(0,Number(coords.width)+200),pane.bounds.height);ctx.clip();
   for(const band of drawings.bands){const a=y(band.min),b=y(band.max),from=Math.max(top,Math.min(a,b)),to=Math.min(bottom,Math.max(a,b));if(to<from)continue;ctx.globalAlpha=0.25;ctx.fillStyle=band.color;ctx.fillRect(dataWidth+1,from-(a===b?8:0),64,Math.max(to-from,a===b?16:0));ctx.globalAlpha=1;}
   const pending=drawings.labels.map(label=>({id:label.id,y:y(label.price),text:text(label.price),color:label.color}));
   const placed=layoutAxisLabels(fixed,pending.map(row=>({id:row.id,y:row.y})),{top,bottom},context.labels.noOverlap);
   ctx.font=`${scene.style?.fontSize??12}px ${theme.fontFamily??'sans-serif'}`;ctx.textBaseline='middle';
   placed.forEach((spot,index)=>{if(spot.hidden)return;const row=pending[index],w=ctx.measureText(row.text).width+8,x=dataWidth+1;
    ctx.fillStyle=row.color;ctx.fillRect(x,spot.center-8,w,16);ctx.fillStyle=labelTextColor(row.color);ctx.textAlign='center';ctx.fillText(row.text,x+w/2,spot.center);painted++;});
  }finally{ctx.restore();}
 }
 return painted;
}

/** One 16 px row under the chip (center y+below+8), at the price-axis x the other LV labels use. */
function paintLastChange(ctx:CanvasRenderingContext2D,scene:RecordData,theme:RecordData,dataWidth:number,chip:{y:number;below:number;value:number;color:string},text:string|null):boolean{
 if(text===null)return false;
 ctx.save();
 try{ctx.font=`${scene.style?.fontSize??12}px ${theme.fontFamily??'sans-serif'}`;ctx.textBaseline='middle';const w=ctx.measureText(text).width+8,x=dataWidth+1,center=chip.y+chip.below+8;
  ctx.fillStyle=chip.color;ctx.fillRect(x,center-8,w,16);ctx.fillStyle=labelTextColor(chip.color);ctx.textAlign='center';ctx.fillText(text,x+w/2,center);}
 finally{ctx.restore();}
 return true;
}
/** A view of a 2D context whose fillText and measureText print `to` wherever the native painter writes exactly
 * `from`. Everything else (state, other calls) goes to the real context. Used for the one native chip call only. */
export function relabelContext(ctx:CanvasRenderingContext2D,from:string,to:string):CanvasRenderingContext2D{
 if(from===to)return ctx;
 const swap=(text:unknown)=>text===from?to:text;
 return new Proxy(ctx as unknown as object,{
  get(target,key){
   if(key==='fillText')return (text:unknown,...rest:unknown[])=>Reflect.apply((target as RecordData).fillText,target,[swap(text),...rest]);
   if(key==='measureText')return (text:unknown)=>Reflect.apply((target as RecordData).measureText,target,[swap(text)]);
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  },
  set(target,key,value){return Reflect.set(target,key,value,target);},
 }) as CanvasRenderingContext2D;
}
/** The native last price chip text and the stored-precision text for it, or null when the renderer text stands
 * (Default, 1 to 8 decimals, percent and indexed modes). The native text mirrors vela's formatAxisValue (axisPriceText). */
export function chipRelabel(value:number,scene:RecordData,pane:RecordData,precision:string|undefined):{from:string;to:string}|null{
 if(precision===undefined||precisionAxisExact(precision)||!Number.isFinite(value))return null;
 const mode=pane.kind==='price'?scene.scaleMode:pane.scaleMode;if(mode==='percent'||mode==='indexed')return null;
 const from=axisPriceText(value,{scale:pane.scale,height:pane.bounds.height,mintick:scene.priceMintick,percent:null});
 return{from,to:formatWithPrecision(value,precision)};
}
/** The main price axis tick labels whose text box meets the last price chip box (`y` - 8 to `y` + `below`, plus
 * 1px), as {y,label}. The renderer skips ticks within 6px of the pane top and 4px of its bottom; those are skipped here too. */
export function collidingTickLabels(ticks:readonly {price:number;label:string}[],priceToY:(price:number)=>number,pane:{top:number;height:number},chipY:number,below:number,fontSize:number):{y:number;label:string}[]{
 const half=Math.ceil(fontSize/2)+1,out:{y:number;label:string}[]=[];
 for(const tick of ticks){
  if(!tick.label)continue;const ty=priceToY(tick.price);
  if(!Number.isFinite(ty)||ty<pane.top+6||ty>pane.top+pane.height-4)continue;
  if(ty+half>chipY-9&&ty-half<chipY+below+1)out.push({y:ty,label:tick.label});
 }
 return out;
}
/** Paints the axis surface over the colliding tick labels (drawn earlier in the same chrome frame), so the chip never sits on
 * a half covered number. With no axis surface the gutter is transparent on this canvas, so the text box is cleared instead. */
function hideCollidingTickLabels(ctx:CanvasRenderingContext2D,scene:RecordData,coords:RecordData,dataWidth:number,pane:RecordData,chipY:number,below:number,axisSurface:unknown,host:RecordData):void{
 if(pane.kind!=='price'||!scene.showAxisLabels)return;
 const axisTicks=member(member(host,'chrome') as object,'axisTicks') as RecordData|undefined,ticksFor=axisTicks?member(axisTicks,'ticksFor'):undefined;
 if(typeof ticksFor!=='function')return;
 const ticks=Reflect.apply(ticksFor,axisTicks,[scene,pane,coords]) as {price:number;label:string}[];if(!Array.isArray(ticks)||!ticks.length)return;
 const fontSize=Number(scene.style?.fontSize)||12,hits=collidingTickLabels(ticks,price=>coords.priceToY(price,pane.scale,pane.bounds),pane.bounds,chipY,below,fontSize);if(!hits.length)return;
 let background:string|null=null;if(typeof axisSurface==='function'){try{const surface=Reflect.apply(axisSurface,host,[]) as {background?:unknown}|null;background=typeof surface?.background==='string'?surface.background:null;}catch{background=null;}}
 const half=Math.ceil(fontSize/2)+1,previousFill=ctx.fillStyle;ctx.save();
 try{if(background)ctx.fillStyle=background;for(const hit of hits){const width=Math.ceil(ctx.measureText(hit.label).width)+6,x=dataWidth+4,top=hit.y-half;ctx.clearRect(x,top,width,half*2);if(background){ctx.beginPath();ctx.rect(x,top,width,half*2);ctx.fill();}}}
 finally{ctx.restore();ctx.fillStyle=previousFill;}
}
/** Original compatibility seam for the pinned Canvas2D/chrome painters. No upstream mutation or source rewrite.
 * `labelContext` feeds the LV price-axis labels drawn after the native chip (absent: the chip only). */
export function installAppearancePainters(renderer:NativeRenderer,labelContext?:()=>AxisLabelContext|null):()=>void{
 const host=object(renderer,'renderer');if(activeInstallations.has(host))throw Error('Appearance painters are already installed');
 const chrome=object(member(host,'chrome'),'chrome'),backend=object(member(host,'backend'),'backend');if(member(backend,'kind')!=='canvas2d')throw Error('Appearance painters require the selected Canvas2D backend');
 const originalChip=method(chrome,'drawPriceLineAndCountdown'),originalMarkLane=method(chrome,'drawMarkLane'),originalCandles=method(backend,'drawCandles'),aggregate=member(backend,'drawCandlesAggregated');if(typeof aggregate!=='function')throw Error('Native candle aggregation is unavailable');
 let active=true;
 const chip:NativeMethod=function(ctx:CanvasRenderingContext2D,scene:RecordData,coords:RecordData,theme:RecordData,dataWidth:number,pane:RecordData){
  assertOwner(this,chrome);
  if(!pane||!scene.bars.length||scene.candlesHidden||pane.collapsed||pane.bounds.height<=0)return Reflect.apply(originalChip,chrome,[ctx,scene,coords,theme,dataWidth,pane]);
  // Heikin Ashi "Show real last price" puts the chip at the raw close (COMPAT-11 lvRealBars on the renderer).
  const presentation=latestPricePresentation(scene,coords,theme,pane,realLastPrice(scene.priceStyle,scene.style?.chartTypes?.['lv-appearance'],Object.getOwnPropertyDescriptor(host,'lvRealBars')?.value,scene.bars)),context=readContext();
  const last=scene.bars.at(-1),view=Object.create(scene);
  if(presentation){const style=Object.create(scene.style);Object.assign(style,{line:{color:presentation.color}});Object.assign(view,{bars:[{...last,close:presentation.value}],priceStyle:'line',style});}
  const value=presentation?.value??last.close,top=pane.bounds.top,bottom=top+pane.bounds.height;
  // Gap 7: the bar countdown follows the instrument session; null hides it.
  const now=Date.now(),barMs=Number(coords.barInterval),target=context?.derived?null:countdownTarget(last.time,barMs,now,context?.session??CONTINUOUS);
  const countdown=!!scene.showCountdown&&target!==null,label=!!scene.showPriceLabel;
  const actualY=coords.priceToY(value,pane.scale,pane.bounds),offscreen=actualY<top||actualY>bottom;
  // Gap 7: an off-screen close keeps its chip clamped at the pane edge (the price line itself is off-screen).
  // The change row (Price and percentage value) sits under the chip, so a clamped chip leaves room for it.
  let changeText:string|null=null;if(context?.lastChange&&label){try{changeText=lastChangePercentText(scene.bars,barMs,context.timezone,value);}catch{changeText=null;}}
  const y=offscreen?clampChipCenter(actualY,top,bottom,(label&&countdown?24:8)+(changeText===null?0:16)).y:actualY;
  const viewCoords=Object.create(coords);Object.defineProperty(viewCoords,'priceToY',{value:(price:number,scale:unknown,bounds:unknown)=>price===value&&scale===pane.scale&&bounds===pane.bounds?y:coords.priceToY(price,scale,bounds)});
  if(target!==null)Object.defineProperty(viewCoords,'barInterval',{value:target-last.time});
  Object.defineProperty(view,'showCountdown',{value:countdown});if(offscreen)Object.defineProperty(view,'showPriceLine',{value:false});
  // Like the reference, a price axis tick label that the last price chip would cover is not shown.
  if(label||countdown){try{hideCollidingTickLabels(ctx,scene,coords,dataWidth,pane,y,(label&&countdown?24:8)+(changeText===null?0:16),member(host,'axisSurface'),host);}catch{/* Advisory: the tick labels stay. */}}
  let chipCtx=ctx;try{const relabel=label?chipRelabel(value,scene,pane,context?.precision):null;if(relabel)chipCtx=relabelContext(ctx,relabel.from,relabel.to);}catch{chipCtx=ctx;}
  const result=Reflect.apply(originalChip,chrome,[chipCtx,view,viewCoords,theme,dataWidth,pane]);
  if(context?.sessionBreaks){try{paintSessionBreaks(ctx,scene,coords,pane,dataWidth,context.sessionBreaks);}catch{/* The lines are advisory. */}}
  let below=label&&countdown?24:8;
  if(changeText!==null){try{if(paintLastChange(ctx,scene,theme,dataWidth,{y,below,value,color:presentation?.color??nativeColor(scene,coords,theme,last)},changeText))below+=16;}catch{/* The row is advisory. */}}
  if(context)paintAxisLabels(ctx,scene,coords,theme,dataWidth,pane,context,{drawn:label||countdown,y,below,value,color:presentation?.color??nativeColor(scene,coords,theme,last)});
  return result;
 };
 // Vertical line and cross line time labels (Time label on). The native chrome draws the mark lane
 // right after the time axis, so wrapping drawMarkLane paints them over the finished axis strip (its tick text never lands on them)
 // without touching drawTimeAxis, which time-axis-ticks.ts owns. A missing context or unreadable drawings paint nothing.
 const markLane:NativeMethod=function(ctx:CanvasRenderingContext2D,scene:RecordData,coords:RecordData,theme:RecordData,dataWidth:number,dataHeight:number){
  assertOwner(this,chrome);
  const result=Reflect.apply(originalMarkLane,chrome,[ctx,scene,coords,theme,dataWidth,dataHeight]);
  const context=readContext();
  if(context&&scene.showAxisLabels!==false){try{
   const canvas=member(chrome,'canvas') as {height?:unknown}|null,fullHeight=Number(canvas?.height)/Number(coords.dpr);if(!(fullHeight>dataHeight))return result;
   const labels=drawingTimeAxisLabels(context.drawings());
   // On a derived chart the drawing rows carry the synthetic logical time; the label text shows the source time
   // (derived-time-labels.ts, as the time axis ticks and the crosshair do). x stays on the renderer's own coordinates.
   // The drawing's own source time comes first (sourceDrawings); the brick under the line is the fallback.
   const shown=frameCoords(renderer as object,coords);let own:Map<string,number>|null=null;
   if(shown!==coords&&context.sourceDrawings)try{own=new Map();for(const row of drawingTimeAxisLabels(context.sourceDrawings()))own.set(row.id,row.time);}catch{own=null;}
   const textTime=shown===coords?undefined:(time:number,id:string)=>own?.get(id)??Number(shown.logicalToTime(coords.timeToLogical(time)));
   if(labels.length)paintDrawingTimeLabels(ctx,labels,{xOf:time=>coords.timeToX(time),...(textTime?{textTime}:{}),timezone:typeof scene.timezone==='string'&&scene.timezone?scene.timezone:'UTC',intervalMs:Number(coords.barInterval),dataWidth,top:dataHeight,height:fullHeight-dataHeight,font:`${scene.style?.fontSize??12}px ${theme.fontFamily??'sans-serif'}`});
  }catch{/* The labels are advisory. */}
   try{paintSubPaneDrawingLabels(ctx,scene,coords,theme,dataWidth,context);}catch{/* The labels are advisory. */}}
  return result;
 };
 const nativeColor=(scene:RecordData,coords:RecordData,theme:RecordData,last:RecordData):string=>{try{const pick=member(chrome,'priceElementColor');return typeof pick==='function'?ink(Reflect.apply(pick,chrome,[scene,coords,theme,last]),theme.textColor):theme.textColor;}catch{return ink(theme.textColor,'#787b86');}};
 const readContext=():AxisLabelContext|null=>{if(!labelContext)return null;try{return labelContext();}catch{return null;}};
 const candles:NativeMethod=function(ctx:CanvasRenderingContext2D,scene:RecordData,bars:RecordData[],first:number,last:number,coords:RecordData,pane:RecordData,theme:RecordData,barColors:Map<number,string>){
  assertOwner(this,backend);
  if(coords.bodySpacing()>=1)return Reflect.apply(originalCandles,backend,[ctx,scene,bars,first,last,coords,pane,theme,barColors]);
  const paint=effectiveCandle(scene,theme);if(!paint.body&&!paint.border&&!paint.wick)return;
  if(!Number.isInteger(first)||!Number.isInteger(last)||first<0||last>=bars.length||last-first+1>MAX_VISIBLE_BARS)throw Error('Aggregate candle window exceeds the accepted source bound');if(last<first)return;
  const viewCoords={logicalToX:(index:number)=>coords.logicalToX(index+first),priceToY:(value:number,scale:unknown,bounds:unknown)=>coords.priceToY(value,scale,bounds)};
  const visible=bars.slice(first,last+1),bodies=paint.body||paint.border?visible.map(bar=>({...bar,high:Math.max(bar.open,bar.close),low:Math.min(bar.open,bar.close)})):[];
  const bodyColor=(bar:RecordData)=>barColors.get(bar.time)??(bar.close>=bar.open?paint.up:paint.down);
  const draw=(rows:RecordData[],color:(bar:RecordData)=>string,alpha:number,pointBodies:boolean)=>{ctx.save();try{ctx.globalAlpha=alpha;Reflect.apply(aggregate,backend,[ctx,rows,0,rows.length-1,viewCoords,pane,color]);if(pointBodies)for(let index=0;index<rows.length;index++)if(rows[index].high===rows[index].low){ctx.fillStyle=color(rows[index]);ctx.fillRect(Math.round(viewCoords.logicalToX(index)),viewCoords.priceToY(rows[index].close,pane.scale,pane.bounds)-.5,1,1);}}finally{ctx.restore();}};
  if(paint.wick)draw(visible,bar=>ink(bar.close>=bar.open?paint.wickUp:paint.wickDown,bodyColor(bar)),backend.candleStructureAlpha,false);
  if(paint.body)draw(bodies,bodyColor,backend.candleBodyAlpha,true);
  if(paint.border)draw(bodies,bar=>ink(bar.close>=bar.open?paint.borderUp:paint.borderDown,bodyColor(bar)),backend.candleStructureAlpha,true);
 };
 function assertOwner(receiver:unknown,expected:object){const currentChip=Object.getOwnPropertyDescriptor(chrome,'drawPriceLineAndCountdown'),currentLane=Object.getOwnPropertyDescriptor(chrome,'drawMarkLane'),currentCandles=Object.getOwnPropertyDescriptor(backend,'drawCandles');if(!active||receiver!==expected||member(host,'chrome')!==chrome||member(host,'backend')!==backend||!currentChip||!('value' in currentChip)||currentChip.value!==chip||!currentLane||!('value' in currentLane)||currentLane.value!==markLane||!currentCandles||!('value' in currentCandles)||currentCandles.value!==candles)throw Error('Appearance painter ownership retired or changed');}
 // All shape checks precede either write. A failed second write removes our first wrapper.
 Object.defineProperty(chrome,'drawPriceLineAndCountdown',{configurable:true,writable:true,value:chip});try{Object.defineProperty(chrome,'drawMarkLane',{configurable:true,writable:true,value:markLane});Object.defineProperty(backend,'drawCandles',{configurable:true,writable:true,value:candles});}catch(error){active=false;const failures:unknown[]=[error];for(const [key,expected] of [['drawPriceLineAndCountdown',chip],['drawMarkLane',markLane]] as const){const owned=Object.getOwnPropertyDescriptor(chrome,key);if(owned&&'value' in owned&&owned.value===expected){try{delete chrome[key];}catch(cleanup){failures.push(cleanup);}}else if(owned||key==='drawPriceLineAndCountdown')failures.push(Error('Failed painter installation lost its chrome ownership'));}throw failures.length===1?error:new AggregateError(failures,'Appearance painter installation and cleanup failed');}
 // Live pane rectangles for the DWB3 layer (a sub-pane Vertical line crosses every pane). Collapsed or missing: null.
 let offPanes:()=>void=()=>{};
 try{const coords=member(host,'coords');if(coords&&typeof coords==='object')offPanes=registerDwb3PaneSource(coords,paneId=>{
  const panes=(member(host,'scene') as RecordData|null)?.panes,pane=panes instanceof Map?panes.get(paneId):null;
  if(!pane||pane.collapsed===true||!pane.bounds)return null;const top=Number(pane.bounds.top),height=Number(pane.bounds.height);
  return Number.isFinite(top)&&Number.isFinite(height)?{top,height}:null;
 });}catch{/* The vline extension falls back to the price pane only. */}
 const dispose=()=>{if(!active)return;active=false;activeInstallations.delete(host);offPanes();const errors:Error[]=[];for(const [owner,key,expected] of [[chrome,'drawPriceLineAndCountdown',chip],[chrome,'drawMarkLane',markLane],[backend,'drawCandles',candles]] as const){const descriptor=Object.getOwnPropertyDescriptor(owner,key);if(descriptor&&'value' in descriptor&&descriptor.value===expected){try{delete owner[key];}catch(error){errors.push(error instanceof Error?error:Error(String(error)));}}else errors.push(Error(`Appearance painter cleanup did not replace another owner: ${key}`));}if(errors.length)throw new AggregateError(errors,'Appearance painter cleanup was incomplete');};activeInstallations.set(host,dispose);return dispose;
}
