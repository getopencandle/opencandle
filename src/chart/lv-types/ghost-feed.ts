// Ghost feed (reference LineToolGhostFeed) on the pinned native `polyline` class (PathDrawing).
// Fact: static-drawing-defaults#tool.LineToolGhostFeed.creation records the gesture "click per point, variable anchors,
// explicit finish" with pointsCount -1 (variable), and static-drawing-defaults#creation.variablePoints lists the tool among
// the explicit-finish tools with "unknown gesture" for it. The native polyline is exactly a variable click-per-point tool;
// it finishes with the native double-click or Enter (our own for this tool, since the reference finish is unknown).
// Placement, hit testing along the path, handles, drag, serialization and undo stay native.
//
// Painting goes through LV-VELA-DRAWING-PAINT-HOOK-1 (lvPaint): instead of the path line, the drawing shows synthetic
// "ghost" candles that walk the path, one per bar where the renderer can count bars (proj.barsBetween), else one per 8 px.
// Candle shape (the reference look is not recorded): each candle opens at the previous close and closes on the
// path; wicks reach half the body beyond it (at least 1 px); rising candles are hollow, falling candles filled, in the
// line color at 60 percent opacity. Nothing is random, so a saved ghost feed always paints the same candles.
// Factory defaults are unknown (static-drawing-defaults-2#tool.LineToolGhostFeed.status), so nothing is seeded.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import type {LvPaintTheme} from '../lv-paint-hook';
import {defineLvDrawingToolModule} from './contract';
import {anchorPoints,type Point} from './segment-tool-base';

export const LV_GHOST_FEED='lvghostfeed';
export const GHOST_FEED_TOOL_ID='LineToolGhostFeed';
const BASE='polyline';
export const GHOST_FALLBACK_BAR_PX=8;
export const GHOST_MAX_CANDLES=2000;
export const GHOST_ALPHA=0.6;

export interface GhostCandle{readonly x:number;readonly width:number;readonly open:number;readonly close:number;readonly high:number;readonly low:number;readonly rising:boolean}
/** Candles along the pixel path. `barsPerLeg[i]` is the bar count of leg i (null: the fallback spacing). */
export function ghostCandles(points:readonly Point[],barsPerLeg:readonly (number|null)[]):GhostCandle[]{
 const out:GhostCandle[]=[];
 for(let i=1;i<points.length&&out.length<GHOST_MAX_CANDLES;i++){
  const [x0,y0]=points[i-1],[x1,y1]=points[i],dx=x1-x0;
  const bars=barsPerLeg[i-1],count=Math.max(1,Math.round(bars!=null&&Number.isFinite(bars)&&bars>=1?bars:Math.abs(dx)/GHOST_FALLBACK_BAR_PX));
  const step=dx/count,width=Math.max(1,Math.abs(step)*0.6);
  for(let j=0;j<count&&out.length<GHOST_MAX_CANDLES;j++){
   const open=y0+(y1-y0)*j/count,close=y0+(y1-y0)*(j+1)/count,wick=Math.max(1,Math.abs(close-open)/2);
   out.push({x:x0+step*(j+0.5),width,open,close,high:Math.min(open,close)-wick,low:Math.max(open,close)+wick,rising:close<open});
  }
 }
 return out;
}

interface PathModel extends NativeModel{geometry(proj:Projector):{segments:number[][];fill:unknown}|null}
function pinPolyline(){
 const base=nativeBase(BASE);
 for(const key of ['anchorSchema','geometry','hitTest','hitHandle','handlePoints','bounds','priceRange','schema','serialize','placementMode'])method(base.prototype,key);
 const sample=base.sample as PathModel&{placementMode():string},shape=roles(sample);
 if(shape.min!==2||shape.max<64||shape.roles!==''||sample.placementMode()!=='click')fail('polyline anchor schema changed: '+JSON.stringify(shape));
 const fields=sample.schema().fields.map(field=>field.path);
 if(!fields.includes('style.lineColor')||!fields.includes('style.lineWidth'))fail('polyline settings changed');
 return base;
}

function defineGhostFeed():DrawingTypeMeta{
 const base=pinPolyline();
 const Base=base.ctor as unknown as new(init:Init)=>PathModel;
 class LvGhostFeed extends Base{
  constructor(init:Init){super(init);(this as {type:string}).type=LV_GHOST_FEED;}
  candles(proj:Projector):GhostCandle[]{
   const points=anchorPoints(this,proj);if(!points||points.length<2)return[];
   const bars=this.anchors.slice(1).map((anchor,i)=>typeof proj.barsBetween==='function'?proj.barsBetween(this.anchors[i].time,anchor.time):null);
   return ghostCandles(points,bars);
  }
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,_theme:LvPaintTheme):void{
   const candles=this.candles(proj);if(!candles.length)return;
   const color=String(this.style.lineColor);
   ctx.save();ctx.globalAlpha=GHOST_ALPHA*ctx.globalAlpha;ctx.setLineDash([]);ctx.lineWidth=1;ctx.strokeStyle=color;ctx.fillStyle=color;
   for(const c of candles){
    const top=Math.min(c.open,c.close),h=Math.max(1,Math.abs(c.close-c.open)),left=c.x-c.width/2;
    ctx.beginPath();ctx.moveTo(c.x,c.high);ctx.lineTo(c.x,top);ctx.moveTo(c.x,top+h);ctx.lineTo(c.x,c.low);ctx.stroke();
    if(c.rising){ctx.beginPath();ctx.rect(left,top,c.width,h);ctx.stroke();}else ctx.fillRect(left,top,c.width,h);
   }
   ctx.restore();
  }
 }
 const probe=new LvGhostFeed({id:'lv-drawing-type-probe',paneId:'price',createdAt:0});
 if(roles(probe).min!==2)fail('ghost feed anchor schema changed');
 return{type:lvKey(LV_GHOST_FEED),group:base.meta.group,label:'Ghost feed',icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new LvGhostFeed(init)};
}

export const GHOST_FEED_MODULE=defineLvDrawingToolModule({
 id:'ghost-feed',
 types:[{type:LV_GHOST_FEED,base:BASE,define:defineGhostFeed,requiresPaintHook:true}],
 unappliedDefaults:[Object.freeze({toolId:GHOST_FEED_TOOL_ID,factId:'creation.variablePoints',property:'finish',value:'unknown gesture',reason:'unverified' as const,
  note:'The reference finish gesture of this tool is unknown. OpenCandle finishes it like the native polyline (double-click or Enter). Candle shape and colors are OpenCandle-defined; factory defaults are unknown (static-drawing-defaults-2#tool.LineToolGhostFeed.status), so nothing is seeded and the renderer Polyline style remains; those are OpenCandle renderer defaults.'})],
 catalog:[{rowId:'DW.FORECAST.GHOST_FEED',type:LV_GHOST_FEED,note:'Click points along the path the price may take; double-click or press Enter to finish. Candles follow the path.'}],
});
