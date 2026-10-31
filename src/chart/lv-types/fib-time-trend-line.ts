// Trend-based fib time (reference LineToolTrendBasedFibTime) trend line, on the pinned native `trendfibtime` class.
// The native model paints and hit-tests only its vertical level lines, which start at the third anchor
// (x = time(p3) + ratio * (time(p2) - time(p1))). This module adds the reference "Trend line" row: a polyline
// p1 -> p2 -> p3 with its own visibility, color, width and style, kept in ONE OpenCandle member
// props.lvFibTimeTrendLine {schemaVersion:1, enabled, color, width, style}.
//
// The type REPLACES the native registration in place (replacesNative, contract.ts): saved records keep the type id
// `trendfibtime`, so no migration exists. Levels, placement, handles, bounds, body drag and undo stay native. Painting
// goes through LV-VELA-DRAWING-PAINT-HOOK-1 (lvPaint): the trend line first, then the level lines with the exact
// command sequence of the native Fibonacci branch (paintFibRatios), which a test compares with the live painter.
// Fail closed: when the pin or the paint hook is missing, the native registration stays untouched (no trend line).
//
// Member states (same rules as the other LV members):
//   absent      -> legacy. The record was saved before this member existed and never painted a trend line, so it stays
//                  hidden and the record serializes byte-identically (no member is written).
//   valid       -> supported. Painted and hit-tested when enabled.
//   invalid     -> unavailable. Retained verbatim, not painted, not hit-tested, not editable.
// Defaults: trendline {visible:true, linewidth:2,
// linestyle:2 (dashed), color:#808080} seeds a NEW drawing (factory definition below), and
// the Trend line setting (a line control) is bound to it.
import type {DrawingTypeMeta,SettingsField} from '@luxalgo/vela';
import type {FactoryDefaultDefinition} from '../drawing-factory-defaults';
import type {LvPaintTheme} from '../lv-paint-hook';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import {supportedColor} from '../color-validation';
import {TREND_BASED_FIB_TIME_FACTORY_LEVELS,cloneFibFactoryLevels} from '../fib-factory-defaults';
import {defineLvDrawingToolModule} from './contract';
import {barStepX} from '../drawing-fixes/geometry';

export const FIB_TIME_TREND_TYPE='trendfibtime';
export const FIB_TIME_TREND_TOOL_ID='LineToolTrendBasedFibTime';
export const FIB_TIME_TREND_LINE_FIELD='lvFibTimeTrendLine';
const PREFIX=FIB_TIME_TREND_LINE_FIELD+'.';
export const FIB_TIME_TREND_LINE_PATHS=Object.freeze({enabled:PREFIX+'enabled',color:PREFIX+'color',width:PREFIX+'width',style:PREFIX+'style'});
export const FIB_TIME_TREND_LINE_DIAGNOSTIC='Unsupported trend-based fib time trend line is retained without interpretation.';
type LineStyle='solid'|'dashed'|'dotted';
export interface FibTimeTrendLineSettings{readonly schemaVersion:1;readonly enabled:boolean;readonly color:string;readonly width:number;readonly style:LineStyle}
export type FibTimeTrendLineState={readonly state:'legacy'|'supported';readonly settings:Readonly<FibTimeTrendLineSettings>}|{readonly state:'unavailable';readonly message:string};
/** tool.LineToolTrendBasedFibTime.defaults trendline: visible true, linewidth 2, linestyle 2 (dashed), color #808080. */
export const FIB_TIME_TREND_LINE_FACTORY:Readonly<FibTimeTrendLineSettings>=Object.freeze({schemaVersion:1,enabled:true,color:'#808080',width:2,style:'dashed'});
/** A record saved without the member: hidden, as it always painted; enabling it starts from the factory line. */
export const FIB_TIME_TREND_LINE_LEGACY:Readonly<FibTimeTrendLineSettings>=Object.freeze({...FIB_TIME_TREND_LINE_FACTORY,enabled:false});
const KEYS=['schemaVersion','enabled','color','width','style'] as const;
const EDITABLE=['enabled','color','width','style'];
const STYLES:readonly string[]=['solid','dashed','dotted'];

/** Exactly the five keys, plain data, width an integer 1..10, a supported color and a known style; anything else throws. */
export function validateFibTimeTrendLine(value:unknown):Readonly<FibTimeTrendLineSettings>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==KEYS.length)throw Error(FIB_TIME_TREND_LINE_DIAGNOSTIC);
 const out:Record<string,unknown>={};
 for(const key of KEYS){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!d.enumerable||!Object.hasOwn(d,'value'))throw Error(FIB_TIME_TREND_LINE_DIAGNOSTIC);out[key]=d.value;}
 const width=out.width as number;
 if(out.schemaVersion!==1||typeof out.enabled!=='boolean'||!supportedColor(out.color)||!Number.isInteger(width)||width<1||width>10||!STYLES.includes(out.style as string))throw Error(FIB_TIME_TREND_LINE_DIAGNOSTIC);
 return Object.freeze(out) as unknown as Readonly<FibTimeTrendLineSettings>;
}
/** Interpretation of a props bag. An accessor or invalid member is unavailable; an absent member is legacy. */
export function readFibTimeTrendLine(props:unknown):FibTimeTrendLineState{
 const legacy:FibTimeTrendLineState={state:'legacy',settings:FIB_TIME_TREND_LINE_LEGACY};
 if(!props||typeof props!=='object')return legacy;
 const d=Object.getOwnPropertyDescriptor(props,FIB_TIME_TREND_LINE_FIELD);if(!d)return legacy;
 if(!d.enumerable||!Object.hasOwn(d,'value'))return{state:'unavailable',message:FIB_TIME_TREND_LINE_DIAGNOSTIC};
 try{return{state:'supported',settings:validateFibTimeTrendLine(d.value)};}catch{return{state:'unavailable',message:FIB_TIME_TREND_LINE_DIAGNOSTIC};}
}

const LINE_STYLE_OPTIONS=[{value:'solid',label:'Solid'},{value:'dashed',label:'Dashed'},{value:'dotted',label:'Dotted'}];
/** Editor fields (settings paths into the model getter below). Group `line`: they sit on the Style tab and in templates. */
export const FIB_TIME_TREND_LINE_FIELDS:readonly SettingsField[]=Object.freeze([
 Object.freeze({path:FIB_TIME_TREND_LINE_PATHS.enabled,label:'Trend line',kind:'boolean' as const,group:'line' as const}),
 Object.freeze({path:FIB_TIME_TREND_LINE_PATHS.color,label:'Trend line color',kind:'color' as const,group:'line' as const}),
 Object.freeze({path:FIB_TIME_TREND_LINE_PATHS.width,label:'Trend line width',kind:'number' as const,min:1,max:10,step:1,group:'line' as const}),
 Object.freeze({path:FIB_TIME_TREND_LINE_PATHS.style,label:'Trend line style',kind:'lineStyle' as const,options:LINE_STYLE_OPTIONS,group:'line' as const}),
]);

interface Entry{color:string;label?:string;x1:number;y1:number;x2:number;y2:number;numberText:string;numberX:number;numberY:number;numberAlign:CanvasTextAlign;labelX:number;labelY:number}
interface Band{color:string;x:number;y:number;w:number;h:number}
interface FibTimeModel extends NativeModel{
 levels:{ratio:number;color:string;enabled:boolean;label?:string}[];numbersSize:string;labelsSize:string;
 entryLines(proj:Projector):Entry[]|null;fillBands(proj:Projector):Band[];
 applySettings(patch:Record<string,unknown>):void;
}
interface ModelState{readonly read:FibTimeTrendLineState;readonly raw?:unknown}
/** Per-model member state. Also the brand of a model built by this module (the factory seed checks it). */
const STATES=new WeakMap<object,ModelState>();

// Transcription of the native stroke helper and named font sizes (DrawingPainter.stroke / dashPattern / namedFontSize).
const dash=(style:string,width:number)=>{const w=Math.max(1,width);return style==='dotted'?[w,w*2]:style==='dashed'?[w*4,w*3]:[];};
const NAMED_PX:Readonly<Record<string,number>>=Object.freeze({tiny:10,small:12,normal:14,large:18,huge:28});
const namedPx=(size:string)=>Object.hasOwn(NAMED_PX,size)?NAMED_PX[size]:0;
function stroke(ctx:CanvasRenderingContext2D,style:{lineColor:string;lineWidth:number;lineStyle:string},path:()=>void){
 ctx.strokeStyle=style.lineColor;ctx.lineWidth=style.lineWidth;ctx.setLineDash(dash(style.lineStyle,style.lineWidth));
 ctx.beginPath();path();ctx.stroke();ctx.setLineDash([]);
}
/** Point-to-segment distance in pixels. */
export function segmentDistance(px:number,py:number,ax:number,ay:number,bx:number,by:number):number{
 const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy;if(len2<=1e-9)return Math.hypot(px-ax,py-ay);
 const t=Math.min(1,Math.max(0,((px-ax)*dx+(py-ay)*dy)/len2));return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
}

const BASE=FIB_TIME_TREND_TYPE;
function pinTrendFibTime(){
 const base=nativeBase(BASE);
 for(const key of ['anchorSchema','entryLines','fillBands','hitTest','handlePoints','bounds','schema','serialize','readProps','writeProps','applySettings'])method(base.prototype,key);
 const sample=base.sample as FibTimeModel;
 if(typeof (sample as {lvPaint?:unknown}).lvPaint==='function'||STATES.has(sample))fail('trend-based fib time is already replaced by another module instance');
 const shape=roles(sample);
 if(shape.min!==3||shape.max!==3||shape.roles!=='p1/p2/p3')fail('trend-based fib time anchor schema changed: '+JSON.stringify(shape));
 const written=sample.serialize().props;
 if(!written||Object.keys(written).sort().join()!=='labelsSize,levels,numbersSize')fail('trend-based fib time retained props changed');
 if(sample.schema().fields.some(field=>field.path.startsWith(PREFIX)))fail('trend-based fib time already has a trend line setting');
 // The 0 level is the full-height vertical line through the third anchor; one time unit is time(p2) - time(p1); no fill bands.
 const probe=new (base.ctor as unknown as new(init:Init)=>FibTimeModel)({id:'lv-drawing-type-probe',paneId:'price',createdAt:0,anchors:[{time:0,price:0},{time:10,price:5},{time:20,price:0}]});
 const proj={xOf:(time:number)=>time,yOf:(price:number)=>100-price,width:200,height:100} as unknown as Projector;
 const lines=probe.entryLines(proj),zero=lines?.[0],bands=probe.fillBands(proj);
 if(!zero||zero.x1!==20||zero.x2!==20||zero.y1!==0||zero.y2!==100||typeof zero.numberText!=='string'||!Array.isArray(bands)||bands.length!==0)fail('trend-based fib time level geometry changed');
 return base;
}

function defineFibTimeTrendLine():DrawingTypeMeta{
 const base=pinTrendFibTime();
 const Base=base.ctor as unknown as new(init:Init)=>FibTimeModel;
 class LvTrendFibTime extends Base{
  // No class fields: the base constructor calls readProps before they would be initialized.
  constructor(init:Init){super(init);if(!STATES.has(this))STATES.set(this,{read:{state:'legacy',settings:FIB_TIME_TREND_LINE_LEGACY}});}
  /** Effective settings for the editor (settings paths lvFibTimeTrendLine.*); undefined while the member is unavailable. */
  get lvFibTimeTrendLine():Readonly<FibTimeTrendLineSettings>|undefined{const read=STATES.get(this)?.read;return read&&read.state!=='unavailable'?read.settings:undefined;}
  /** Record-faithful: every props bag (load, store edit, undo restore, tool defaults) sets the member state it describes. */
  protected readProps(props:Record<string,unknown>):void{
   super.readProps(props);
   const read=readFibTimeTrendLine(props);
   STATES.set(this,read.state==='unavailable'?{read,raw:structuredClone(Object.getOwnPropertyDescriptor(props,FIB_TIME_TREND_LINE_FIELD)?.value)}:{read});
  }
  protected writeProps():Record<string,unknown>|undefined{
   const props=super.writeProps(),state=STATES.get(this);
   if(!state||state.read.state==='legacy')return props;
   return{...(props??{}),[FIB_TIME_TREND_LINE_FIELD]:state.read.state==='supported'?{...state.read.settings}:structuredClone(state.raw)};
  }
  schema(){
   const fields=super.schema().fields;
   return{fields:STATES.get(this)?.read.state==='unavailable'?fields:[...fields,...FIB_TIME_TREND_LINE_FIELDS.map(field=>({...field}))]} as ReturnType<NativeModel['schema']>;
  }
  /** Trend line paths are validated as one whole member before anything changes; the rest is the native patch. */
  applySettings(patch:Record<string,unknown>):void{
   const own=Object.keys(patch).filter(path=>path===FIB_TIME_TREND_LINE_FIELD||path.startsWith(PREFIX));
   let next:Readonly<FibTimeTrendLineSettings>|undefined;
   if(own.length){
    const read=STATES.get(this)?.read;if(!read||read.state==='unavailable')throw Error(FIB_TIME_TREND_LINE_DIAGNOSTIC);
    const draft:Record<string,unknown>={...read.settings};
    for(const path of own){const key=path.slice(PREFIX.length);if(!EDITABLE.includes(key))throw Error(FIB_TIME_TREND_LINE_DIAGNOSTIC);draft[key]=patch[path];}
    next=validateFibTimeTrendLine(draft);
   }
   const rest=Object.fromEntries(Object.entries(patch).filter(([path])=>!own.includes(path)));
   if(Object.keys(rest).length)super.applySettings(rest);
   if(next)STATES.set(this,{read:{state:'supported',settings:next}});
  }
  /** 0.8.1: level n sits n bar units after the third point, one unit being the bar distance p1 -> p2 (the native model added
   *  calendar time, so weekends and session gaps moved the levels). Counted on the logical bar axis, where x is linear. */
  entryLines(proj:Projector):Entry[]|null{
   const rows=super.entryLines(proj),[a,b,c]=this.anchors;if(!rows||!a||!b||!c)return rows;
   const xa=proj.xOf(a.time),xb=proj.xOf(b.time),xc=proj.xOf(c.time),levels=this.levels.filter(level=>level.enabled);
   if(![xa,xb,xc].every(Number.isFinite)||rows.length!==levels.length)return rows;
   return rows.map((row,i)=>{const x=barStepX(xc,xc+(xb-xa),levels[i].ratio);return{...row,x1:x,x2:x,numberX:x,labelX:x};});
  }
  /** Pixel polyline p1 -> p2 -> p3 (two points while placing), or null when hidden, unavailable or off the pane. */
  trendLinePoints(proj:Projector):[number,number][]|null{
   const read=STATES.get(this)?.read;if(!read||read.state==='unavailable'||!read.settings.enabled)return null;
   const points:[number,number][]=[];
   for(const anchor of this.anchors.slice(0,3)){const x=proj.xOf(anchor.time),y=proj.yOf(anchor.price,this.paneId);if(y==null||!Number.isFinite(x)||!Number.isFinite(y))return null;points.push([x,y]);}
   return points.length>=2?points:null;
  }
  hitTest(px:number,py:number,proj:Projector,tol:number):boolean{
   if(super.hitTest(px,py,proj,tol))return true;
   const points=this.trendLinePoints(proj);if(!points)return false;
   for(let i=1;i<points.length;i++)if(segmentDistance(px,py,points[i-1][0],points[i-1][1],points[i][0],points[i][1])<=tol)return true;
   return false;
  }
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:LvPaintTheme):void{
   const read=STATES.get(this)?.read,points=this.trendLinePoints(proj);
   if(points&&read&&read.state!=='unavailable'){const s=read.settings;stroke(ctx,{lineColor:s.color,lineWidth:s.width,lineStyle:s.style},()=>{ctx.moveTo(points[0][0],points[0][1]);for(const [x,y] of points.slice(1))ctx.lineTo(x,y);});}
   // Level lines: the native Fibonacci branch, command for command.
   const lines=this.entryLines(proj);if(!lines||lines.length===0)return;
   for(const band of this.fillBands(proj)){ctx.save();ctx.globalAlpha=0.06*ctx.globalAlpha;ctx.fillStyle=band.color;ctx.fillRect(band.x,band.y,band.w,band.h);ctx.restore();}
   ctx.textBaseline='middle';
   const numFont=`${namedPx(this.numbersSize)}px ${theme.fontFamily}`,lblFont=`${namedPx(this.labelsSize)}px ${theme.fontFamily}`;
   for(const l of lines){
    stroke(ctx,{...(this.style as {lineColor:string;lineWidth:number;lineStyle:string}),lineColor:l.color},()=>{ctx.moveTo(l.x1,l.y1);ctx.lineTo(l.x2,l.y2);});
    ctx.fillStyle=l.color;ctx.font=numFont;ctx.textAlign=l.numberAlign;ctx.fillText(l.numberText,l.numberX,l.numberY);
    if(l.label){ctx.font=lblFont;ctx.textAlign='center';ctx.fillText(l.label,l.labelX,l.labelY);}
   }
   ctx.textAlign='left';ctx.textBaseline='alphabetic';
  }
 }
 const meta=base.meta;
 return{type:lvKey(BASE),group:meta.group,label:meta.label,icon:meta.icon,defaultStyle:cloneStyle(meta),
  ...(meta.coversSeries!==undefined?{coversSeries:meta.coversSeries}:{}),...(meta.placementHint!==undefined?{placementHint:meta.placementHint}:{}),
  create:init=>new LvTrendFibTime(init)};
}

/** A fresh drawing of this module's model takes the factory trend line; a native fallback model has no member and is left alone. */
export function seedFibTimeTrendLine(model:object):void{if(STATES.has(model))STATES.set(model,{read:{state:'supported',settings:FIB_TIME_TREND_LINE_FACTORY}});}

interface LevelModel{levels:{ratio:number;color:string;enabled:boolean}[]}
/** Trend-based fib time (older cached build): level lines linewidth 2, solid; per-level colors and visibility; the trend line.
 *  Moved here from drawing-factory-defaults.ts DEFINITIONS so it wraps the replacing registration (same values, same probe). */
const FACTORY:FactoryDefaultDefinition=Object.freeze({type:FIB_TIME_TREND_TYPE,toolId:FIB_TIME_TREND_TOOL_ID,factId:'tool.LineToolTrendBasedFibTime.defaults',style:Object.freeze({lineWidth:2,lineStyle:'solid'}),
 probe:(sample:object)=>{const levels=(sample as Partial<LevelModel>).levels;return Array.isArray(levels)&&levels.length===TREND_BASED_FIB_TIME_FACTORY_LEVELS.length&&levels.every((level,index)=>level.ratio===TREND_BASED_FIB_TIME_FACTORY_LEVELS[index].ratio)?undefined:'trend-based fib time level ratios changed';},
 seed:(model:object)=>{(model as LevelModel).levels=cloneFibFactoryLevels(TREND_BASED_FIB_TIME_FACTORY_LEVELS);seedFibTimeTrendLine(model);}});

export const FIB_TIME_TREND_LINE_MODULE=defineLvDrawingToolModule({
 id:'fib-time-trend-line',
 types:[{type:FIB_TIME_TREND_TYPE,base:BASE,define:defineFibTimeTrendLine,requiresPaintHook:true,replacesNative:true}],
 factoryDefaults:[FACTORY],
 // The spec already drives `trendfibtime`, so the binding adds no type; it maps the Trend line row onto the member.
 dialog:[{toolId:FIB_TIME_TREND_TOOL_ID,types:[],paths:{['dialog.'+FIB_TIME_TREND_TOOL_ID+'.style.1']:{'trendline.visible':FIB_TIME_TREND_LINE_PATHS.enabled,'trendline.color':FIB_TIME_TREND_LINE_PATHS.color,'trendline.linestyle':FIB_TIME_TREND_LINE_PATHS.style,'trendline.linewidth':FIB_TIME_TREND_LINE_PATHS.width}}}],
});
