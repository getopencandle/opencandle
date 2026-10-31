// Triangle pattern and Three drives pattern (reference LineToolTrianglePattern, LineToolThreeDrivers) on the
// pinned native `elliottcorrection` class (PatternDrawing), like the Elliott wave module. The native pattern class draws a
// labelled polyline through its anchors, tints its fill triangles, shows leg ratios when asked, and derives its anchor
// count from its vertex labels. Placement, hit testing, handles, serialization, undo and painting stay native.
//
// Slice approximation (pending reference observation): the facts record neither anchor count nor geometry
// (static-drawing-defaults#tool.<id>.creation pointsCountKnown false; static-drawing-defaults-2#tool.<id>.status
// factoryDefaults unknown). Triangle pattern: 4 points A, B, C, D with the two triangles A-B-C and B-C-D tinted (the native
// fill and line fields), plus (0.8.1) the two boundary trend lines A-C and B-D extended to their apex, as a triangle is read
// (Bulkowski: two converging trend lines through the alternating highs and lows); the type paints itself through
// LV-VELA-DRAWING-PAINT-HOOK-1 to draw them. Three drives: 6 points (an unlabelled origin, then drives 1, 2, 3 with the corrections A and B
// between them) with the native consecutive-leg ratios shown, since a three drives reading is a ratio reading. Nothing is
// seeded: the native pattern style stays.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import type {LvPaintTheme} from '../lv-paint-hook';
import {defineLvDrawingToolModule} from './contract';
import {nativePatternBase} from '../drawing-fixes/elliott-origin';
import {strokePath} from './paint-helpers';
import {lineIntersection,segmentDistance} from '../drawing-fixes/geometry';

type Pt=readonly [number,number];
export interface TrianglePatternPlan{
 /** Upper and lower boundary lines: A through C, B through D, each running to the apex (or to the last point's bar when the lines
  *  do not converge ahead of the pattern, a broadening shape). */
 readonly lines:readonly (readonly [number,number,number,number])[];
 /** Where the two boundary lines meet, or null when they are parallel. */
 readonly apex:readonly [number,number]|null;
 /** True when the apex lies ahead of the last point in the drawn direction (a converging triangle). */
 readonly converging:boolean;
}
/** The boundary lines of a 4-point triangle pattern A, B, C, D in pixels. */
export function trianglePatternPlan(points:readonly Pt[]):TrianglePatternPlan|null{
 if(points.length<4)return null;
 const [A,B,C,D]=points,apex=lineIntersection(A,C,B,D);
 const dir=Math.sign(D[0]-A[0])||1,lastX=dir>0?Math.max(C[0],D[0]):Math.min(C[0],D[0]);
 const converging=apex!==null&&(apex[0]-lastX)*dir>0;
 const at=(p:Pt,q:Pt,x:number):[number,number]=>{const dx=q[0]-p[0];return Math.abs(dx)<1e-9?[q[0],q[1]]:[x,p[1]+(q[1]-p[1])*(x-p[0])/dx];};
 const endX=converging?apex![0]:lastX;
 const upper=converging?[A[0],A[1],apex![0],apex![1]] as const:[A[0],A[1],...at(A,C,endX)] as const;
 const lower=converging?[B[0],B[1],apex![0],apex![1]] as const:[B[0],B[1],...at(B,D,endX)] as const;
 return{lines:[upper,lower],apex:apex?[apex[0],apex[1]]:null,converging};
}

export const LV_TRIANGLE_PATTERN='lvtrianglepattern';
export const LV_THREE_DRIVES='lvthreedrives';

interface ChartPatternSpec{
 readonly type:string;readonly toolId:string;readonly rowId:string;readonly label:string;
 readonly labels:readonly string[];readonly fillTriangles:readonly (readonly [number,number,number])[];readonly legRatios:boolean;
 readonly note:string;readonly shape:string;
}
export const CHART_PATTERN_SPECS:readonly ChartPatternSpec[]=Object.freeze([
 Object.freeze({type:LV_TRIANGLE_PATTERN,toolId:'LineToolTrianglePattern',rowId:'DW.PATTERN.TRIANGLE_PATTERN',label:'Triangle pattern',labels:Object.freeze(['A','B','C','D']),
  fillTriangles:Object.freeze([Object.freeze([0,1,2] as const),Object.freeze([1,2,3] as const)]),legRatios:false,note:'Click the four swing points A, B, C and D.',shape:'a labelled A-B-C-D polyline with the triangles A-B-C and B-C-D tinted and the boundary lines A-C and B-D drawn to their apex'}),
 Object.freeze({type:LV_THREE_DRIVES,toolId:'LineToolThreeDrivers',rowId:'DW.PATTERN.THREE_DRIVES_PATTERN',label:'Three drives pattern',labels:Object.freeze(['','1','A','2','B','3']),
  fillTriangles:Object.freeze([]),legRatios:true,note:'Click the start, then drive 1, correction A, drive 2, correction B and drive 3.',shape:'a polyline through the start, drives 1 to 3 and corrections A and B, with each leg ratio shown'}),
]);

interface PatternModel extends NativeModel{vertexLabels():string[];legRatios():boolean;fillTriangles():number[][];necklineIndices():[number,number]|null;valid():boolean|null;patternName():string|null}
const BASE='elliottcorrection';
const BASE_MEMBERS=['vertexLabels','legRatios','fillTriangles','necklineIndices','valid','patternName','ratioAt','anchorSchema','handlePoints','hitTest','hitHandle','bounds','priceRange','schema','serialize','translateBody'];

function pinPattern(){
 const base=nativePatternBase(BASE);
 for(const key of BASE_MEMBERS)method(base.prototype,key);
 const sample=base.sample as PatternModel,shape=roles(sample);
 if(sample.vertexLabels().join()!=='A,B,C'||shape.min!==3||shape.max!==3||shape.roles!=='p0/p1/p2')fail('elliott correction pattern shape changed: '+JSON.stringify(shape));
 if(sample.legRatios()!==false||sample.fillTriangles().length!==0||sample.necklineIndices()!==null||sample.valid()!==null||sample.patternName()!==null)fail('pattern extras changed');
 const fields=sample.schema().fields.map(field=>field.path).join();
 if(fields!=='style.lineColor,style.lineWidth,style.lineStyle')fail('pattern settings changed: '+fields);
 return base;
}

function defineChartPattern(spec:ChartPatternSpec):DrawingTypeMeta{
 const base=pinPattern();
 const labels=Object.freeze([...spec.labels]),triangles=spec.fillTriangles.map(triple=>[...triple]);
 const Base=base.ctor as unknown as new(init:Init)=>PatternModel;
 class LvChartPattern extends Base{
  constructor(init:Init){super(init);(this as {type:string}).type=spec.type;}
  vertexLabels():string[]{return [...labels];}
  legRatios():boolean{return spec.legRatios;}
  fillTriangles():number[][]{return triangles.map(triple=>[...triple]);}
 }
 if(spec.type===LV_TRIANGLE_PATTERN){
  class LvTrianglePattern extends LvChartPattern{
   hitTest(px:number,py:number,proj:Projector,tol:number):boolean{
    if(super.hitTest(px,py,proj,tol))return true;
    const plan=trianglePatternPlan(this.handlePoints(proj));
    return !!plan&&plan.lines.some(l=>segmentDistance(px,py,l[0],l[1],l[2],l[3])<=tol);
   }
   /** The native pattern picture (tinted triangles, the A-B-C-D polyline, vertex labels), then the two boundary lines. */
   lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:LvPaintTheme):void{
    const pts=this.handlePoints(proj) as [number,number][];if(pts.length<2)return;
    const style=this.style as {lineColor:string;lineWidth:number;lineStyle:string;fillColor?:string};
    ctx.save();
    for(const [i,j,k] of this.fillTriangles()){
     const a=pts[i],b=pts[j],c=pts[k];if(!a||!b||!c)continue;
     ctx.save();ctx.globalAlpha=(style.fillColor?1:0.1)*ctx.globalAlpha;ctx.fillStyle=style.fillColor??style.lineColor;
     ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.lineTo(c[0],c[1]);ctx.closePath();ctx.fill();ctx.restore();
    }
    strokePath(ctx,style,()=>{ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);});
    const plan=trianglePatternPlan(pts);
    if(plan)for(const l of plan.lines)strokePath(ctx,style,()=>{ctx.moveTo(l[0],l[1]);ctx.lineTo(l[2],l[3]);});
    const names=this.vertexLabels();
    ctx.fillStyle=theme.textColor;ctx.font=`bold 12px ${theme.fontFamily}`;ctx.textAlign='center';
    pts.forEach((p,i)=>{const name=names[i];if(!name)return;const ny=((pts[i-1]?.[1]??p[1])+(pts[i+1]?.[1]??p[1]))/2,above=p[1]<=ny;ctx.textBaseline=above?'bottom':'top';ctx.fillText(name,p[0],above?p[1]-7:p[1]+7);});
    ctx.restore();
   }
  }
  const probe=new LvTrianglePattern({id:'lv-drawing-type-probe',paneId:'price',createdAt:0});
  if(roles(probe).max!==labels.length)fail('triangle pattern anchor schema changed');
  return{type:lvKey(spec.type),group:base.meta.group,label:spec.label,icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new LvTrianglePattern(init)};
 }
 const probe=new LvChartPattern({id:'lv-drawing-type-probe',paneId:'price',createdAt:0}),shape=roles(probe);
 if(shape.min!==labels.length||shape.max!==labels.length||shape.roles!==labels.map((_,index)=>'p'+index).join('/'))fail('pattern anchor schema no longer follows the vertex labels: '+JSON.stringify(shape));
 // The native schema adds the fill field exactly when the pattern tints triangles.
 if(probe.schema().fields.some(field=>field.path==='style.fillColor')!==(triangles.length>0))fail('pattern fill field no longer follows the fill triangles');
 return{type:lvKey(spec.type),group:base.meta.group,label:spec.label,icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new LvChartPattern(init)};
}

export const CHART_PATTERNS_MODULE=defineLvDrawingToolModule({
 id:'chart-patterns',
 types:CHART_PATTERN_SPECS.map(spec=>({type:spec.type,base:BASE,define:()=>defineChartPattern(spec),...(spec.type===LV_TRIANGLE_PATTERN?{requiresPaintHook:true}:{})})),
 unappliedDefaults:CHART_PATTERN_SPECS.map(spec=>Object.freeze({toolId:spec.toolId,factId:'tool.'+spec.toolId+'.creation',property:'pointsCount',value:null,reason:'unverified' as const,
  note:'The reference anchor count is not recorded (pointsCountKnown false). Slice approximation pending reference observation: OpenCandle places '+spec.labels.length+' points and draws '+spec.shape+'. Factory defaults are unknown (static-drawing-defaults-2#tool.'+spec.toolId+'.status), so nothing is seeded and the native pattern style (line width 1, solid, bold 12 px labels) remains; those are OpenCandle renderer defaults.'})),
 catalog:CHART_PATTERN_SPECS.map(spec=>({rowId:spec.rowId,type:spec.type,note:spec.note})),
});
