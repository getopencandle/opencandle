// Triangle pattern and Three drives pattern (reference LineToolTrianglePattern, LineToolThreeDrivers) on the
// pinned native `elliottcorrection` class (PatternDrawing), like the Elliott wave module. The native pattern class draws a
// labelled polyline through its anchors, tints its fill triangles, shows leg ratios when asked, and derives its anchor
// count from its vertex labels. Placement, hit testing, handles, serialization, undo and painting stay native.
//
// Slice approximation (pending reference observation): the facts record neither anchor count nor geometry
// (static-drawing-defaults#tool.<id>.creation pointsCountKnown false; static-drawing-defaults-2#tool.<id>.status
// factoryDefaults unknown). Triangle pattern: 4 points A, B, C, D with the two triangles A-B-C and B-C-D tinted (the native
// fill and line fields). Three drives: 6 points (an unlabelled origin, then drives 1, 2, 3 with the corrections A and B
// between them) with the native consecutive-leg ratios shown, since a three drives reading is a ratio reading. Nothing is
// seeded: the native pattern style stays.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel} from '../lv-drawing-pin';
import {defineLvDrawingToolModule} from './contract';

export const LV_TRIANGLE_PATTERN='lvtrianglepattern';
export const LV_THREE_DRIVES='lvthreedrives';

interface ChartPatternSpec{
 readonly type:string;readonly toolId:string;readonly rowId:string;readonly label:string;
 readonly labels:readonly string[];readonly fillTriangles:readonly (readonly [number,number,number])[];readonly legRatios:boolean;
 readonly note:string;readonly shape:string;
}
export const CHART_PATTERN_SPECS:readonly ChartPatternSpec[]=Object.freeze([
 Object.freeze({type:LV_TRIANGLE_PATTERN,toolId:'LineToolTrianglePattern',rowId:'DW.PATTERN.TRIANGLE_PATTERN',label:'Triangle pattern',labels:Object.freeze(['A','B','C','D']),
  fillTriangles:Object.freeze([Object.freeze([0,1,2] as const),Object.freeze([1,2,3] as const)]),legRatios:false,note:'Click the four swing points A, B, C and D.',shape:'a labelled A-B-C-D polyline with the triangles A-B-C and B-C-D tinted'}),
 Object.freeze({type:LV_THREE_DRIVES,toolId:'LineToolThreeDrivers',rowId:'DW.PATTERN.THREE_DRIVES_PATTERN',label:'Three drives pattern',labels:Object.freeze(['','1','A','2','B','3']),
  fillTriangles:Object.freeze([]),legRatios:true,note:'Click the start, then drive 1, correction A, drive 2, correction B and drive 3.',shape:'a polyline through the start, drives 1 to 3 and corrections A and B, with each leg ratio shown'}),
]);

interface PatternModel extends NativeModel{vertexLabels():string[];legRatios():boolean;fillTriangles():number[][];necklineIndices():[number,number]|null;valid():boolean|null;patternName():string|null}
const BASE='elliottcorrection';
const BASE_MEMBERS=['vertexLabels','legRatios','fillTriangles','necklineIndices','valid','patternName','ratioAt','anchorSchema','handlePoints','hitTest','hitHandle','bounds','priceRange','schema','serialize','translateBody'];

function pinPattern(){
 const base=nativeBase(BASE);
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
 const probe=new LvChartPattern({id:'lv-drawing-type-probe',paneId:'price',createdAt:0}),shape=roles(probe);
 if(shape.min!==labels.length||shape.max!==labels.length||shape.roles!==labels.map((_,index)=>'p'+index).join('/'))fail('pattern anchor schema no longer follows the vertex labels: '+JSON.stringify(shape));
 // The native schema adds the fill field exactly when the pattern tints triangles.
 if(probe.schema().fields.some(field=>field.path==='style.fillColor')!==(triangles.length>0))fail('pattern fill field no longer follows the fill triangles');
 return{type:lvKey(spec.type),group:base.meta.group,label:spec.label,icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new LvChartPattern(init)};
}

export const CHART_PATTERNS_MODULE=defineLvDrawingToolModule({
 id:'chart-patterns',
 types:CHART_PATTERN_SPECS.map(spec=>({type:spec.type,base:BASE,define:()=>defineChartPattern(spec)})),
 unappliedDefaults:CHART_PATTERN_SPECS.map(spec=>Object.freeze({toolId:spec.toolId,factId:'tool.'+spec.toolId+'.creation',property:'pointsCount',value:null,reason:'unverified' as const,
  note:'The reference anchor count is not recorded (pointsCountKnown false). Slice approximation pending reference observation: OpenCandle places '+spec.labels.length+' points and draws '+spec.shape+'. Factory defaults are unknown (static-drawing-defaults-2#tool.'+spec.toolId+'.status), so nothing is seeded and the native pattern style (line width 1, solid, bold 12 px labels) remains; those are OpenCandle renderer defaults.'})),
 catalog:CHART_PATTERN_SPECS.map(spec=>({rowId:spec.rowId,type:spec.type,note:spec.note})),
});
