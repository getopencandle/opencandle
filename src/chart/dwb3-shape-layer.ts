// DWB3 root wiring (R2 piece B): one renderer layer on the price pane that paints the trendline middle point / price labels
// (props.lvTrendlineMarkers), the parallel channel level lines (props.lvChannel) and the Rectangle extension (props.lvBoxExtend). It reads the CANONICAL rows only (the native model drops
// the members) through a payload the adapter pushes with setNativeData; it never creates, edits or removes a drawing row.
// An absent member plans nothing, so a drawing saved before the wave paints exactly as before.
// The Ray, Extended line, Info line and Arrow rows (kind 'line') paint the same markers, plus Distance and Angle.
// A Vertical line (kind 'vline', any pane) crosses every pane (Vertical line Extend on). The native
// painter strokes its own pane; this layer strokes the rest of the plot height. The layer only knows the price pane rectangle, so a
// price-pane line is stroked above and below it, and a line in another pane is stroked over the price pane only.
// A sub-pane line row carries its paneId; the layer reads that pane's live rectangle through a pane source the appearance
// painters register per renderer (keyed by the renderer's CoordinateSystem, which the layer args carry), and strokes everything
// above and below it, so the line crosses every pane. Without a source (or an unknown pane) the default behaviour stays.
import {registerRendererLayer,type RendererLayerArgs,type RendererLayerInstance} from '@luxalgo/vela';
import {readTrendlineMarkers,type TrendlineMarkersSettings} from './trendline-stats-data';
import {readChannelLevels,type ChannelLevelsSettings} from './channel-levels-data';
import {planTrendlineMarkers,paintTrendlineMarkers,isLineMarkerType,type MarkerProjection,type MarkerBounds} from './trendline-markers-painter';
import {planChannelLevels,paintChannelLevels} from './channel-levels-painter';
import {readBoxExtend,type BoxExtendSettings} from './box-extend-data';
import {planBoxExtend,paintBoxExtend} from './box-extend-painter';
import {axisLineFlag} from './lv-types/axis-line-settings';

export const DWB3_SHAPE_LAYER='lv-dwb3-shapes';
export interface Dwb3Anchor {readonly time:number;readonly price:number}
export type Dwb3ShapeRow=
 | {readonly kind:'trendline';readonly anchors:readonly Dwb3Anchor[];readonly markers:TrendlineMarkersSettings;readonly color:string}
 // The other trendline-family tools (ray, extendedline, infoline, arrow). Their Distance and Angle are painted here too.
 | {readonly kind:'line';readonly type:string;readonly anchors:readonly Dwb3Anchor[];readonly markers:TrendlineMarkersSettings;readonly color:string}
 | {readonly kind:'channel';readonly anchors:readonly Dwb3Anchor[];readonly levels:ChannelLevelsSettings;readonly color:string;readonly width:number;readonly style:'solid'|'dashed'|'dotted'}
 // Rectangle Extend (props.lvBoxExtend, box-extend-data.ts).
 | {readonly kind:'box';readonly anchors:readonly Dwb3Anchor[];readonly extend:BoxExtendSettings;readonly color:string;readonly width:number;readonly style:'solid'|'dashed'|'dotted';readonly fill:string|null}
 // The Vertical line extension into the other panes. pricePane: the line sits in the price pane; paneId: its
 // pane when it is not the price pane.
 | {readonly kind:'vline';readonly time:number;readonly pricePane:boolean;readonly paneId?:string;readonly color:string;readonly width:number;readonly style:'solid'|'dashed'|'dotted'};
export interface Dwb3ShapePayload {readonly schemaVersion:1;readonly rows:readonly Dwb3ShapeRow[]}
const MAX_ROWS=10000;
const isAnchor=(value:unknown):value is Dwb3Anchor=>!!value&&typeof value==='object'&&Number.isFinite((value as Dwb3Anchor).time)&&Number.isFinite((value as Dwb3Anchor).price);
const lineStyleOf=(value:unknown):'solid'|'dashed'|'dotted'=>value==='dashed'||value==='dotted'?value:'solid';

/** Pure: canonical rows to the layer payload. Rows with an absent/unavailable member, hidden rows, non-price panes and rows without finite anchors are left out.
 * `visible` is the set of ids the renderer paints (interval visibility, Hide all drawings and unavailable drawings already applied); a row outside it plans nothing. Omitted = canonical visibility only. */
export function dwb3ShapePayload(rows:readonly Record<string,unknown>[],visible?:ReadonlySet<string>):Dwb3ShapePayload{
 const out:Dwb3ShapeRow[]=[];
 for(const row of rows.slice(0,MAX_ROWS)){
  try{
   if(row.type==='vline'){
    // Extend off (props.lvAxisLine.extend false): the line stays in its own pane.
    if(row.visible===false||(visible&&!visible.has(String(row.id)))||!axisLineFlag('vline',row.props,'extend'))continue;
    const anchor=Array.isArray(row.anchors)?row.anchors[0] as {time?:unknown}|undefined:undefined,time=Number(anchor?.time);
    const style=(row.style&&typeof row.style==='object'?row.style:{}) as Record<string,unknown>;
    const pricePane=row.paneId===undefined||row.paneId==='price';
    if(anchor&&typeof anchor.time==='number'&&Number.isFinite(time))out.push({kind:'vline',time,pricePane,...(pricePane?{}:{paneId:String(row.paneId)}),color:typeof style.lineColor==='string'?style.lineColor:'#9aa0a6',width:Number.isFinite(style.lineWidth)?Number(style.lineWidth):1,style:lineStyleOf(style.lineStyle)});
    continue;
   }
   if(row.visible===false||(visible&&!visible.has(String(row.id)))||(!isLineMarkerType(row.type)&&row.type!=='parallelchannel'&&row.type!=='box')||(row.paneId!==undefined&&row.paneId!=='price'))continue;
   const anchors=Array.isArray(row.anchors)?row.anchors.filter(isAnchor).map(anchor=>({time:anchor.time,price:anchor.price})):[];
   const style=(row.style&&typeof row.style==='object'?row.style:{}) as Record<string,unknown>,color=typeof style.lineColor==='string'?style.lineColor:'#9aa0a6';
   if(row.type==='trendline'){
    const markers=readTrendlineMarkers(row.props);
    if(markers.state==='supported'&&anchors.length>=2&&(markers.settings.middlePoint||markers.settings.priceLabels))out.push({kind:'trendline',anchors,markers:markers.settings,color});
   }else if(isLineMarkerType(row.type)){
    const markers=readTrendlineMarkers(row.props),settings=markers.state==='supported'?markers.settings:null;
    if(settings&&anchors.length>=2&&(settings.middlePoint||settings.priceLabels||settings.distance||settings.angle))out.push({kind:'line',type:String(row.type),anchors:anchors.slice(0,2),markers:settings,color});
   }else if(row.type==='box'){
    const extend=readBoxExtend(row.props);
    if(extend.state==='supported'&&anchors.length>=2&&(extend.settings.left||extend.settings.right))out.push({kind:'box',anchors,extend:extend.settings,color,width:Number.isFinite(style.lineWidth)?Number(style.lineWidth):1,style:lineStyleOf(style.lineStyle),fill:typeof style.fillColor==='string'&&style.fillColor?style.fillColor:null});
   }else{
    const levels=readChannelLevels(row.props);
    if(levels.state==='supported'&&anchors.length>=3)out.push({kind:'channel',anchors,levels:levels.settings,color,width:Number.isFinite(style.lineWidth)?Number(style.lineWidth):1,style:lineStyleOf(style.lineStyle)});
   }
  }catch{/* One unreadable row paints nothing. */}
 }
 return {schemaVersion:1,rows:out};
}
const isPayload=(value:unknown):value is Dwb3ShapePayload=>!!value&&typeof value==='object'&&(value as Dwb3ShapePayload).schemaVersion===1&&Array.isArray((value as Dwb3ShapePayload).rows);

/** Fractional logical bar index for an epoch-ms anchor time (renderer bars carry ms), or null when the bars cannot place it. */
export function logicalIndexOf(bars:ReadonlyArray<{time:number}>,time:number):number|null{
 if(!bars.length||!Number.isFinite(time))return null;
 let low=0,high=bars.length-1,found=-1;
 while(low<=high){const mid=(low+high)>>1;if(bars[mid].time<=time){found=mid;low=mid+1;}else high=mid-1;}
 if(found<0){const step=bars.length>1?bars[1].time-bars[0].time:0;return step>0?(time-bars[0].time)/step:null;}
 if(found===bars.length-1){const step=bars.length>1?bars[found].time-bars[found-1].time:0;return step>0?found+(time-bars[found].time)/step:found;}
 const span=bars[found+1].time-bars[found].time;return span>0?found+(time-bars[found].time)/span:found;
}

/** The vertical spans a Vertical line row strokes on this layer (plot y ranges), outside the pane the native painter covers. */
export function vlineExtensionSpans(pricePane:boolean,bounds:{top:number;bottom:number},height:number):readonly (readonly [number,number])[]{
 const spans:[number,number][]=pricePane?[[0,bounds.top],[bounds.bottom,height]]:[[Math.max(0,bounds.top),Math.min(height,bounds.bottom)]];
 return spans.filter(([from,to])=>Number.isFinite(from)&&Number.isFinite(to)&&to>from);
}
export interface Dwb3PaneRect {readonly top:number;readonly height:number}
export type Dwb3PaneSource=(paneId:string)=>Dwb3PaneRect|null;
const PANE_SOURCES=new WeakMap<object,Dwb3PaneSource>();
/** Registers the live pane rectangles of one renderer, keyed by its CoordinateSystem (RendererLayerArgs.coords). Returns the unregister. */
export function registerDwb3PaneSource(coords:object,source:Dwb3PaneSource):()=>void{
 PANE_SOURCES.set(coords,source);
 return()=>{if(PANE_SOURCES.get(coords)===source)PANE_SOURCES.delete(coords);};
}
/** The registered pane source of a renderer's coords (the layer's lookup; exported for tests). */
export function dwb3PaneSourceFor(coords:object):Dwb3PaneSource|null{return PANE_SOURCES.get(coords)??null;}
/** The spans of one vline row. A sub-pane row with a readable own pane rectangle covers everything above and below that
 * pane; otherwise the default spans (price pane line: outside the price pane; other: over the price pane). */
export function vlineRowSpans(row:Extract<Dwb3ShapeRow,{kind:'vline'}>,priceBounds:{top:number;bottom:number},height:number,source?:Dwb3PaneSource|null):readonly (readonly [number,number])[]{
 if(!row.pricePane&&row.paneId&&source){
  let rect:Dwb3PaneRect|null=null;try{rect=source(row.paneId);}catch{rect=null;}
  if(rect&&Number.isFinite(rect.top)&&Number.isFinite(rect.height)&&rect.height>=0)return vlineExtensionSpans(true,{top:rect.top,bottom:rect.top+rect.height},height);
 }
 return vlineExtensionSpans(row.pricePane,priceBounds,height);
}
const DASHES={solid:[] as number[],dashed:[6,4],dotted:[2,3]};
/** Strokes a Vertical line row over its extension spans; returns the number of strokes. */
export function paintVlineExtension(ctx:CanvasRenderingContext2D,row:Extract<Dwb3ShapeRow,{kind:'vline'}>,x:number,spans:readonly (readonly [number,number])[]):number{
 if(!Number.isFinite(x)||!spans.length)return 0;
 ctx.save();
 try{
  ctx.strokeStyle=row.color;ctx.lineWidth=row.width;ctx.setLineDash(DASHES[row.style]);
  ctx.beginPath();for(const [from,to] of spans){ctx.moveTo(x,from);ctx.lineTo(x,to);}ctx.stroke();
 }finally{ctx.restore();}
 return spans.length;
}

export interface Dwb3PaintTheme {readonly fontFamily:string;readonly background?:string;readonly textColor?:string}
/** Plans and paints one payload row; returns the number of painted operations. The layer's render calls it per row. */
export function paintDwb3Row(ctx:CanvasRenderingContext2D,row:Dwb3ShapeRow,proj:MarkerProjection,bounds:MarkerBounds,theme:Dwb3PaintTheme):number{
 // A vline row paints outside the price pane clip (paintVlineExtension in render), not here.
 if(row.kind==='vline')return 0;
 if(row.kind==='trendline'||row.kind==='line'){const ops=planTrendlineMarkers(row.markers,row.anchors,proj,bounds,{color:row.color,statistics:row.kind==='line'});paintTrendlineMarkers(ctx,ops,theme);return ops.length;}
 if(row.kind==='box'){const ops=planBoxExtend(row.extend,row.anchors,proj,bounds,{lineColor:row.color,lineWidth:row.width,lineStyle:row.style,fillColor:row.fill});paintBoxExtend(ctx,ops);return ops.length;}
 const ops=planChannelLevels(row.levels,row.anchors,proj,bounds,{color:row.color,width:row.width,style:row.style});paintChannelLevels(ctx,ops);return ops.length;
}

class Dwb3ShapeLayer implements RendererLayerInstance {
 private canvas:HTMLCanvasElement|null=null;
 mount(canvas:HTMLCanvasElement){this.canvas=canvas;canvas.dataset.lvLayer=DWB3_SHAPE_LAYER;}
 render(args:RendererLayerArgs){
  const canvas=this.canvas;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const rows=isPayload(args.data)?args.data.rows:[];let painted=0;
  const proj:MarkerProjection={
   xOf:(time:number)=>{const index=logicalIndexOf(args.bars,time);if(index===null)return NaN;try{return args.coords.logicalToX(index);}catch{return NaN;}},
   yOf:(price:number)=>{try{return args.coords.priceToY(price,args.scale,args.bounds);}catch{return NaN;}},
   indexOf:(time:number)=>logicalIndexOf(args.bars,time),
  };
  const bounds={left:0,right:args.coords.width,top:args.bounds.top,bottom:args.bounds.top+args.bounds.height};
  const theme={fontFamily:args.theme.fontFamily,background:args.theme.background,textColor:args.theme.textColor};
  // The vertical line extensions paint outside the price pane clip.
  ctx.save();ctx.scale(args.coords.dpr,args.coords.dpr);
  try{
   const source=dwb3PaneSourceFor(args.coords as object);
   for(const row of rows)if(row.kind==='vline'){
    try{painted+=paintVlineExtension(ctx,row,proj.xOf(row.time),vlineRowSpans(row,bounds,args.coords.height,source));}
    catch{/* A row that cannot paint is skipped; the frame continues. */}
   }
  }finally{ctx.restore();}
  ctx.save();ctx.scale(args.coords.dpr,args.coords.dpr);ctx.beginPath();ctx.rect(0,bounds.top,args.coords.width,args.bounds.height);ctx.clip();
  try{
   for(const row of rows){
    try{painted+=paintDwb3Row(ctx,row,proj,bounds,theme);}
    catch{/* A row that cannot paint is skipped; the frame continues. */}
   }
  }finally{ctx.restore();}
  canvas.dataset.lvDwb3Shapes=String(painted);
 }
 destroy(){this.canvas=null;}
}
let registered=false;
/** Idempotent. Renderers mounted after registration pick the layer up, so call it before the chart is created. */
export function registerDwb3ShapeLayer():void{
 if(registered)return;registered=true;
 registerRendererLayer({id:DWB3_SHAPE_LAYER,placement:'above-data',create:()=>new Dwb3ShapeLayer()});
}
