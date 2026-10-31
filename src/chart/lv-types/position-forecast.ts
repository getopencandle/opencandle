// Position forecast (reference LineToolPrediction) on the shared segment base (pinned native `triangle`).
// The native segment model supplies placement, hit testing of the forecast line, handles, body and handle drag,
// serialization and undo. Painting goes through LV-VELA-DRAWING-PAINT-HOOK-1 (lvPaint) because the forecast shows
// computed labels: the line is stroked with the native stroke rules, then a source plate at the first point (its price)
// and a target plate at the second (price change, percent change and, when the renderer can count them, the bars between).
// Both plates are hit-testable.
//
// Slice approximation (pending reference observation): no anchor count, geometry, label set or default is
// recorded (static-drawing-defaults#tool.LineToolPrediction.creation pointsCountKnown false; static-drawing-defaults-2#
// tool.LineToolPrediction.status factoryDefaults unknown). Nothing is seeded; the renderer Triangle line style remains.
// Plate colors: the line color behind white text.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import type {LvPaintTheme} from '../lv-paint-hook';
import type {Init,Projector} from '../lv-drawing-pin';
import {defineLvDrawingToolModule} from './contract';
import {anchorPx,defineSegmentTool,segmentToolUnapplied,SEGMENT_BASE,type Point,type SegmentToolModel,type SegmentToolSpec} from './segment-tool-base';
import {approxTextWidth,formatPlatePrice,inRect,lineHeight,paintPlate,strokePath,type Rect} from './paint-helpers';

export const LV_POSITION_FORECAST='lvpositionforecast';
const PLATE_PX=12,PLATE_GAP=14,PLATE_TEXT='#ffffff';

/** Target plate lines: signed change and percent, then the bar count when known (LV wording). */
export function forecastLabels(from:number,to:number,bars:number|null):string[]{
 const change=to-from,sign=change>0?'+':change<0?'-':'';
 const percent=from!==0?Math.abs(change/from*100).toFixed(2)+'%':'';
 const lines=[sign+formatPlatePrice(Math.abs(change))+(percent?' ('+sign+percent+')':'')];
 if(bars!=null&&Number.isFinite(bars))lines.push(Math.round(Math.abs(bars))+' bars');
 return lines;
}
interface Plates{readonly source:Rect;readonly target:Rect|null}
/** Plate rectangles (same metrics as the painter, text width approximated) for hit testing. */
function plateRects(lines:{source:string[];target:string[]|null},a:Point,b:Point|null):Plates{
 const rect=(text:readonly string[],cx:number,cy:number):Rect=>{const w=Math.max(...text.map(line=>approxTextWidth(line,PLATE_PX)))+12,h=text.length*lineHeight(PLATE_PX)+8;return{x:cx-w/2,y:cy-h/2,w,h};};
 // The source plate sits on the side away from the target; the target plate beyond the target in the direction of travel.
 const rising=b!=null&&b[1]<a[1];
 const at=(p:Point,text:readonly string[],down:boolean)=>{const h=text.length*lineHeight(PLATE_PX)+8;return rect(text,p[0],p[1]+(down?1:-1)*(PLATE_GAP+h/2));};
 return{source:at(a,lines.source,rising),target:b&&lines.target?at(b,lines.target,!rising):null};
}

export const POSITION_FORECAST_SPEC:SegmentToolSpec=Object.freeze({type:LV_POSITION_FORECAST,toolId:'LineToolPrediction',rowId:'DW.FORECAST.POSITION_FORECAST',label:'Position forecast',
 roles:Object.freeze(['source','target']),fill:false,
 geometry:(points:readonly Point[])=>{const [a,b]=points;if(!a)return null;return{segments:b?[[a[0],a[1],b[0],b[1]]]:[],fill:null};},
 note:'Click the current point, then the forecast target. The target shows the change, percent and bars.'});

type ForecastModel=SegmentToolModel;
function defineForecast():DrawingTypeMeta{
 return defineSegmentTool(POSITION_FORECAST_SPEC,Base=>{
  class LvPositionForecast extends (Base as unknown as new(init:Init)=>ForecastModel){
   labels(proj:Projector){
    const a=this.anchors[0],b=this.anchors[1];
    const bars=a&&b&&typeof proj.barsBetween==='function'?proj.barsBetween(a.time,b.time):null;
    return{source:[a?formatPlatePrice(a.price):''],target:a&&b?forecastLabels(a.price,b.price,bars):null};
   }
   plates(proj:Projector):Plates|null{
    const a=anchorPx(this,proj,0);if(!a)return null;
    return plateRects(this.labels(proj),a,anchorPx(this,proj,1));
   }
   hitTest(px:number,py:number,proj:Projector,tol:number):boolean{
    if(super.hitTest(px,py,proj,tol))return true;
    if(this.anchors.length<2)return false;
    const plates=this.plates(proj);
    return !!plates&&(inRect(px,py,plates.source)||(plates.target!=null&&inRect(px,py,plates.target)));
   }
   lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:LvPaintTheme):void{
    const a=anchorPx(this,proj,0),b=anchorPx(this,proj,1);if(!a)return;
    if(b)strokePath(ctx,this.style,()=>{ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);});
    ctx.fillStyle=this.style.lineColor;
    for(const p of b?[a,b]:[a]){ctx.beginPath();ctx.arc(p[0],p[1],3,0,Math.PI*2);ctx.fill();}
    if(!b)return;
    const plates=this.plates(proj)!,labels=this.labels(proj),font=PLATE_PX+'px '+theme.fontFamily;
    paintPlate(ctx,labels.source,plates.source.x+plates.source.w/2,plates.source.y+plates.source.h/2,{font,px:PLATE_PX,fill:this.style.lineColor,text:PLATE_TEXT});
    if(plates.target&&labels.target)paintPlate(ctx,labels.target,plates.target.x+plates.target.w/2,plates.target.y+plates.target.h/2,{font,px:PLATE_PX,fill:this.style.lineColor,text:PLATE_TEXT});
   }
  }
  return LvPositionForecast as unknown as new(init:Init)=>SegmentToolModel;
 });
}

export const POSITION_FORECAST_MODULE=defineLvDrawingToolModule({
 id:'position-forecast',
 types:[{type:LV_POSITION_FORECAST,base:SEGMENT_BASE,define:defineForecast,requiresPaintHook:true}],
 unappliedDefaults:[segmentToolUnapplied(POSITION_FORECAST_SPEC,'a forecast line with a source price plate and a target plate (change, percent, bars)')],
 catalog:[{rowId:POSITION_FORECAST_SPEC.rowId,type:LV_POSITION_FORECAST,note:POSITION_FORECAST_SPEC.note}],
});
