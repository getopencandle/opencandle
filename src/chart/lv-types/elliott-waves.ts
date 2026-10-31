// Elliott triangle wave, Elliott double combo wave and Elliott triple combo wave (reference LineToolElliottTriangle,
// LineToolElliottDoubleCombo, LineToolElliottTripleCombo) on the pinned native `elliottcorrection` class.
// The native pattern class draws a labelled polyline through its anchors and derives its anchor count from its vertex
// labels, so each type only supplies its labels. Placement, hit testing, handles, serialization and painting stay native.
//
// Anchor count (0.8.1): the reference facts do not record it (static-drawing-defaults#tool.LineToolElliott*.creation:
// pointsCountKnown false). A wave count is drawn from its origin (Frost and Prechter), so each tool places an unlabelled origin
// point and then one labelled point per wave label (triangle 6, double combo 4, triple combo 6), like the native impulse and
// correction tools since 0.8.1 (../drawing-fixes/elliott-origin.ts, which also migrates pre-0.8.1 saved waves).
// Factory defaults are unknown (static-drawing-defaults-2#tool.LineToolElliott*.status), so nothing is seeded: each
// type keeps the sibling Elliott tools' renderer style and label painting unchanged.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel} from '../lv-drawing-pin';
import {defineLvDrawingToolModule} from './contract';
import {nativePatternBase} from '../drawing-fixes/elliott-origin';
import {originWaveClass,withOrigin} from '../drawing-fixes/elliott-origin';

export const LV_ELLIOTT_TRIANGLE='lvelliotttriangle';
export const LV_ELLIOTT_DOUBLE_COMBO='lvelliottdoublecombo';
export const LV_ELLIOTT_TRIPLE_COMBO='lvelliotttriplecombo';

interface ElliottWaveSpec{
 readonly type:string;
 readonly toolId:string;
 readonly rowId:string;
 /** The reference row label (static-drawing-toolbar#tool.<toolId>); its parenthesised part names the wave points. */
 readonly label:string;
 readonly labels:readonly string[];
 readonly note:string;
}
export const ELLIOTT_WAVE_SPECS:readonly ElliottWaveSpec[]=Object.freeze([
 Object.freeze({type:LV_ELLIOTT_TRIANGLE,toolId:'LineToolElliottTriangle',rowId:'DW.ELLIOTT.ELLIOTT_TRIANGLE_WAVE',label:'Elliott triangle wave (A·B·C·D·E)',labels:Object.freeze(['A','B','C','D','E']),note:'Click the origin, then the five wave points A, B, C, D and E.'}),
 Object.freeze({type:LV_ELLIOTT_DOUBLE_COMBO,toolId:'LineToolElliottDoubleCombo',rowId:'DW.ELLIOTT.ELLIOTT_DOUBLE_COMBO_WAVE',label:'Elliott double combo wave (W·X·Y)',labels:Object.freeze(['W','X','Y']),note:'Click the origin, then the three wave points W, X and Y.'}),
 Object.freeze({type:LV_ELLIOTT_TRIPLE_COMBO,toolId:'LineToolElliottTripleCombo',rowId:'DW.ELLIOTT.ELLIOTT_TRIPLE_COMBO_WAVE',label:'Elliott triple combo wave (W·X·Y·X·Z)',labels:Object.freeze(['W','X','Y','X','Z']),note:'Click the origin, then the five wave points W, X, Y, X and Z.'}),
]);

/** Recorded OpenCandle approximations of these tools (not reference facts). */
export interface ElliottSliceApproximation{readonly toolId:string;readonly type:string;readonly subject:'anchor count';readonly value:number;readonly basis:string;readonly factIds:readonly string[];readonly status:'pending reference observation'}
export const ELLIOTT_WAVE_SLICE_APPROXIMATIONS:readonly ElliottSliceApproximation[]=Object.freeze(ELLIOTT_WAVE_SPECS.map(spec=>Object.freeze({
 toolId:spec.toolId,type:spec.type,subject:'anchor count' as const,value:spec.labels.length+1,
 basis:'Standard Elliott count '+spec.labels.join('-')+' drawn from its origin: an unlabelled origin point and one labelled point per wave label, matching the native Elliott impulse (origin and 1-5, 6 points) and correction (origin and A-C, 4 points) tools.',
 factIds:Object.freeze(['static-drawing-defaults#tool.'+spec.toolId+'.creation','static-drawing-toolbar#tool.'+spec.toolId]),
 status:'pending reference observation' as const,
})));

interface PatternModel extends NativeModel{
 vertexLabels():string[];legRatios():boolean;fillTriangles():number[][];necklineIndices():[number,number]|null;valid():boolean|null;patternName():string|null;
}
const BASE='elliottcorrection';
const BASE_MEMBERS=['vertexLabels','legRatios','fillTriangles','necklineIndices','valid','patternName','ratioAt','anchorSchema','handlePoints','hitTest','hitHandle','bounds','priceRange','schema','serialize','onPlaced','translateBody'];

/** Proves a native Elliott sibling still has `labels` as its vertex labels, one anchor each, and no harmonic extras. */
function pinSibling(type:string,labels:readonly string[]){
 const base=nativePatternBase(type);
 for(const key of BASE_MEMBERS)method(base.prototype,key);
 const sample=base.sample as PatternModel,shape=roles(sample),expectedRoles=labels.map((_,index)=>'p'+index).join('/');
 if(sample.vertexLabels().join()!==labels.join())fail(type+' vertex labels changed: '+JSON.stringify(sample.vertexLabels()));
 if(shape.min!==labels.length||shape.max!==labels.length||shape.roles!==expectedRoles)fail(type+' anchor schema changed: '+JSON.stringify(shape));
 if(sample.legRatios()!==false||sample.fillTriangles().length!==0||sample.necklineIndices()!==null||sample.valid()!==null||sample.patternName()!==null)fail(type+' pattern extras changed');
 return base;
}

function defineElliottWave(spec:ElliottWaveSpec):DrawingTypeMeta{
 const base=pinSibling(BASE,['A','B','C']);
 // The convention basis: the native impulse wave is 5 labelled points with no origin point.
 pinSibling('elliottimpulse',['1','2','3','4','5']);
 const labels=Object.freeze(withOrigin(spec.labels));
 const Base=base.ctor as unknown as new(init:Init)=>PatternModel;
 const LvElliottWave=originWaveClass(Base,spec.type,spec.labels);
 // The native anchor schema must follow the vertex labels (one free point per label).
 const probe=new LvElliottWave({id:'lv-drawing-type-probe',paneId:'price',createdAt:0}),shape=roles(probe);
 if(shape.min!==labels.length||shape.max!==labels.length||shape.roles!==labels.map((_,index)=>'p'+index).join('/'))fail('pattern anchor schema no longer follows the vertex labels: '+JSON.stringify(shape));
 if(probe.anchorSchema().slots.some(slot=>slot.free!=='both'))fail('pattern anchor slots are no longer free points');
 return{type:lvKey(spec.type),group:base.meta.group,label:spec.label,icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new LvElliottWave(init)};
}

export const ELLIOTT_WAVES_MODULE=defineLvDrawingToolModule({
 id:'elliott-waves',
 types:ELLIOTT_WAVE_SPECS.map(spec=>({type:spec.type,base:BASE,define:()=>defineElliottWave(spec)})),
 unappliedDefaults:ELLIOTT_WAVE_SPECS.map(spec=>Object.freeze({
  toolId:spec.toolId,factId:'tool.'+spec.toolId+'.creation',property:'pointsCount',value:null,reason:'unverified' as const,
  note:'The reference anchor count is not recorded (pointsCountKnown false). OpenCandle places '+(spec.labels.length+1)+' points (an origin, then '+spec.labels.join(', ')+'), the wave count drawn from its origin, like the native Elliott impulse and correction tools. Factory defaults are unknown (static-drawing-defaults-2#tool.'+spec.toolId+'.status), so nothing is seeded and the sibling Elliott tools\' renderer style (line color, width 1, solid, bold 12 px labels) remains; those are OpenCandle renderer defaults.',
 })),
 catalog:ELLIOTT_WAVE_SPECS.map(spec=>({rowId:spec.rowId,type:spec.type,note:spec.note})),
});
