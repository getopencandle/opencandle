// Double curve (reference LineToolBezierCubic) on the pinned native `curve` class (SegmentDrawing).
// The native Curve draws a quadratic Bezier through slots p1 / p2 / control, sampled into polyline segments plus one
// fill polygon that the generic segment painter strokes (and fills when a fill color is set). This type adds a second
// control slot and samples a cubic Bezier the same way. Hit testing (segments and fill), handles, bounds, schema,
// serialization and painting stay native: only anchorSchema() and geometry() are overridden.
//
// Slice approximation (decision D1, pending reference observation): the reference anchor count is not recorded
// (static-drawing-defaults#tool.LineToolBezierCubic.creation: pointsCount null, pointsCountKnown false; the gesture is
// one click per point, finishing at the anchor count). OpenCandle places 4 points: the two ends, then the two control
// points, extending the native Curve's p1 / p2 / control slot order. Factory defaults are unknown
// (static-drawing-defaults-2#tool.LineToolBezierCubic.status), so nothing is seeded and the native Curve renderer style
// stays. The floating toolbar facts (line colors, background colors when fill is on, line widths, line styles) map to
// the inherited native fields style.lineColor / style.fillColor / style.lineWidth / style.lineStyle.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import {defineLvDrawingToolModule} from './contract';

export const LV_DOUBLE_CURVE='lvdoublecurve';
export const DOUBLE_CURVE_TOOL_ID='LineToolBezierCubic';
export const DOUBLE_CURVE_ROW='DW.SHAPE.DOUBLE_CURVE';
/** Slot roles in click order: the two ends, then the control points (native Curve order p1, p2, control). */
export const DOUBLE_CURVE_ROLES=Object.freeze(['p1','p2','control1','control2']);
/** Samples per curve, equal to the native Curve's (pinned at registration). */
export const DOUBLE_CURVE_SAMPLES=40;

export const DOUBLE_CURVE_SLICE_APPROXIMATION=Object.freeze({
 toolId:DOUBLE_CURVE_TOOL_ID,type:LV_DOUBLE_CURVE,subject:'anchor count' as const,value:4,
 basis:'Two end points then two control points of a cubic Bezier, extending the native Curve slot order (p1, p2, control).',
 factIds:Object.freeze(['static-drawing-defaults#tool.LineToolBezierCubic.creation','static-drawing-defaults-2#tool.LineToolBezierCubic.status']),
 status:'pending reference observation' as const,
});

type Point=[number,number];
interface Geometry{segments:number[][];fill:Point[]|null}
interface CurveModel extends NativeModel{px(proj:Projector,index:number):Point|null;geometry(proj:Projector):Geometry|null}

/** Cubic Bezier sampled at `samples`+1 points (t = i / samples). */
export function cubicPoints(p0:Point,c1:Point,c2:Point,p3:Point,samples=DOUBLE_CURVE_SAMPLES):Point[]{
 const points:Point[]=[];
 for(let i=0;i<=samples;i++){
  const t=i/samples,u=1-t,a=u*u*u,b=3*u*u*t,c=3*u*t*t,d=t*t*t;
  points.push([a*p0[0]+b*c1[0]+c*c2[0]+d*p3[0],a*p0[1]+b*c1[1]+c*c2[1]+d*p3[1]]);
 }
 return points;
}

const BASE='curve';
function pinCurve(){
 const base=nativeBase(BASE);
 for(const key of ['anchorSchema','px','geometry','hitTest','hitHandle','handlePoints','bounds','priceRange','schema','serialize'])method(base.prototype,key);
 const shape=roles(base.sample);
 if(shape.min!==3||shape.max!==3||shape.roles!=='p1/p2/control')fail('curve anchor schema changed: '+JSON.stringify(shape));
 // The native geometry must still be a 40-sample quadratic through the control point, stroked as segments with one fill polygon.
 const probe=new (base.ctor as unknown as new(init:Init)=>CurveModel)({id:'lv-drawing-type-probe',paneId:'price',createdAt:0,anchors:[{time:0,price:0},{time:40,price:0},{time:20,price:40}]});
 const proj={xOf:(time:number)=>time,yOf:(price:number)=>100-price,width:200,height:200} as unknown as Projector;
 const g=probe.geometry(proj);
 if(!g||!g.fill||g.fill.length!==DOUBLE_CURVE_SAMPLES+1||g.segments.length!==DOUBLE_CURVE_SAMPLES)fail('curve sampling changed');
 const mid=g!.fill![DOUBLE_CURVE_SAMPLES/2];
 if(Math.abs(mid[0]-20)>1e-9||Math.abs(mid[1]-80)>1e-9)fail('curve geometry is no longer a quadratic Bezier');
 return base;
}

function defineDoubleCurve():DrawingTypeMeta{
 const base=pinCurve();
 const Base=base.ctor as unknown as new(init:Init)=>CurveModel;
 class LvDoubleCurve extends Base{
  constructor(init:Init){super(init);(this as {type:string}).type=LV_DOUBLE_CURVE;}
  anchorSchema(){return{min:4,max:4,slots:DOUBLE_CURVE_ROLES.map(role=>({role,free:'both' as const}))};}
  geometry(proj:Projector):Geometry|null{
   // While placing: 2 points are a straight line and 3 points the native quadratic (first control point).
   if(this.anchors.length<4)return super.geometry(proj);
   const p0=this.px(proj,0),p3=this.px(proj,1),c1=this.px(proj,2),c2=this.px(proj,3);
   if(!p0||!p3||!c1||!c2)return null;
   const points=cubicPoints(p0,c1,c2,p3),segments:number[][]=[];
   for(let i=1;i<points.length;i++)segments.push([points[i-1][0],points[i-1][1],points[i][0],points[i][1]]);
   return{segments,fill:points};
  }
 }
 const probe=new LvDoubleCurve({id:'lv-drawing-type-probe',paneId:'price',createdAt:0}),shape=roles(probe);
 if(shape.min!==4||shape.max!==4||shape.roles!==DOUBLE_CURVE_ROLES.join('/'))fail('double curve anchor schema not applied');
 return{type:lvKey(LV_DOUBLE_CURVE),group:base.meta.group,label:'Double curve',icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new LvDoubleCurve(init)};
}

export const DOUBLE_CURVE_MODULE=defineLvDrawingToolModule({
 id:'double-curve',
 types:[{type:LV_DOUBLE_CURVE,base:BASE,define:defineDoubleCurve}],
 unappliedDefaults:[
  Object.freeze({toolId:DOUBLE_CURVE_TOOL_ID,factId:'tool.LineToolBezierCubic.creation',property:'pointsCount',value:null,reason:'unverified' as const,
   note:'The reference anchor count is not recorded (pointsCountKnown false). Slice approximation pending reference observation: OpenCandle places 4 points (two ends, then two control points of a cubic curve). Factory defaults are unknown (static-drawing-defaults-2#tool.LineToolBezierCubic.status), so nothing is seeded and the renderer Curve style (line width 2, solid, no fill) remains; those are OpenCandle renderer defaults.'}),
 ],
 catalog:[{rowId:DOUBLE_CURVE_ROW,type:LV_DOUBLE_CURVE,note:'Click the two end points, then the two control points.'}],
});
