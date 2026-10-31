// Horizontal line, vertical line and cross line on the
// pinned native `hline`, `vline` and `crossline` classes.
//
// Each type REPLACES the native registration in place (replacesNative, contract.ts): saved records keep their type id, so no
// migration exists. Placement, hit testing, handles, bounds and undo stay native.
//  * hline / vline paint through LV-VELA-DRAWING-PAINT-HOOK-1 (lvPaint): the line is the native stroke, command for command, and the
//    text label follows ONE OpenCandle member props.lvLineText {schemaVersion:1, vertical, horizontal, orientation}.
//      absent  -> legacy. Saved before this member existed: the native label position (hline: 8 px right of the anchor, above
//                 the line; vline: at the anchor point), and the record serializes byte-identically (no member is written).
//      valid   -> supported: the label sits Top/Middle/Bottom and Left/Center/Right of the line; a vline label can also run along
//                 the line (orientation vertical).
//      invalid -> unavailable. Retained verbatim; the legacy label is painted and the member is not editable.
//    A NEW drawing takes the reference text layout: hline 12 px (size small), Middle / Center (on the line); vline Middle / Center,
//    orientation Vertical. OpenCandle keeps its own text color (no color seed).
//  * crossline keeps the native painter. The reference Cross line has no Text tab, so its schema offers no text fields; a saved
//    text is still read, kept and painted by the native painter.
// Line widths of new drawings are the LV defaults in drawing-factory-defaults.ts (hline and crossline 2 px).
// The vertical line's extension into the other panes is painted by the DWB3 shape layer (dwb3-shape-layer.ts, kind 'vline').
// Vline Extend / Time label and crossline Price label / Time label live in props.lvAxisLine (axis-line-settings.ts);
// absent = all on. The flags are read by the DWB3 layer (extend) and axis-labels.ts (price and time labels).
// Hline Price label lives in the same member (key priceLabel, settings row "Line / Price label").
import type {DrawingTypeMeta,SettingsField} from '@luxalgo/vela';
import type {LvPaintTheme} from '../lv-paint-hook';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import {strokePath,namedPx} from './paint-helpers';
import {defineLvDrawingToolModule} from './contract';
import {AXIS_LINE_FIELD,AXIS_LINE_PREFIX,AXIS_LINE_DIAGNOSTIC,axisLineFields,readAxisLine,validateAxisLine,type AxisLineState,type AxisLineSettings,type AxisLineType} from './axis-line-settings';

export const LINE_TEXT_FIELD='lvLineText';
const PREFIX=LINE_TEXT_FIELD+'.';
export const LINE_TEXT_PATHS=Object.freeze({vertical:PREFIX+'vertical',horizontal:PREFIX+'horizontal',orientation:PREFIX+'orientation'});
export const LINE_TEXT_DIAGNOSTIC='Unsupported line text layout is retained without interpretation.';
export type LineTextVertical='top'|'middle'|'bottom';
export type LineTextHorizontal='left'|'center'|'right';
export type LineTextOrientation='horizontal'|'vertical';
export interface LineTextSettings{readonly schemaVersion:1;readonly vertical:LineTextVertical;readonly horizontal:LineTextHorizontal;readonly orientation:LineTextOrientation}
export type LineTextState={readonly state:'legacy'|'supported';readonly settings:Readonly<LineTextSettings>}|{readonly state:'unavailable';readonly message:string};
const KEYS=['schemaVersion','vertical','horizontal','orientation'] as const;
const VERTICAL:readonly string[]=['top','middle','bottom'],HORIZONTAL:readonly string[]=['left','center','right'],ORIENTATION:readonly string[]=['horizontal','vertical'];

/** Horizontal line text default: 12 px, Middle / Center. */
export const HLINE_TEXT_FACTORY:Readonly<LineTextSettings>=Object.freeze({schemaVersion:1,vertical:'middle',horizontal:'center',orientation:'horizontal'});
export const HLINE_TEXT_SIZE_FACTORY='small';
/** Vertical line text default: Middle / Center, orientation Vertical (text runs along the line). */
export const VLINE_TEXT_FACTORY:Readonly<LineTextSettings>=Object.freeze({schemaVersion:1,vertical:'middle',horizontal:'center',orientation:'vertical'});
/** What the editor shows for a legacy record (the nearest layout to the native label); choosing a value writes the member. */
const HLINE_LEGACY:Readonly<LineTextSettings>=Object.freeze({schemaVersion:1,vertical:'top',horizontal:'left',orientation:'horizontal'});
const VLINE_LEGACY:Readonly<LineTextSettings>=Object.freeze({schemaVersion:1,vertical:'top',horizontal:'right',orientation:'horizontal'});

export function validateLineText(value:unknown):Readonly<LineTextSettings>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==KEYS.length)throw Error(LINE_TEXT_DIAGNOSTIC);
 const out:Record<string,unknown>={};
 for(const key of KEYS){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!d.enumerable||!Object.hasOwn(d,'value'))throw Error(LINE_TEXT_DIAGNOSTIC);out[key]=d.value;}
 if(out.schemaVersion!==1||!VERTICAL.includes(out.vertical as string)||!HORIZONTAL.includes(out.horizontal as string)||!ORIENTATION.includes(out.orientation as string))throw Error(LINE_TEXT_DIAGNOSTIC);
 return Object.freeze(out) as unknown as Readonly<LineTextSettings>;
}
export function readLineText(props:unknown,legacy:Readonly<LineTextSettings>=HLINE_LEGACY):LineTextState{
 if(!props||typeof props!=='object')return{state:'legacy',settings:legacy};
 const d=Object.getOwnPropertyDescriptor(props,LINE_TEXT_FIELD);if(!d)return{state:'legacy',settings:legacy};
 if(!d.enumerable||!Object.hasOwn(d,'value'))return{state:'unavailable',message:LINE_TEXT_DIAGNOSTIC};
 try{return{state:'supported',settings:validateLineText(d.value)};}catch{return{state:'unavailable',message:LINE_TEXT_DIAGNOSTIC};}
}

const opts=(values:readonly string[],labels:readonly string[])=>values.map((value,index)=>({value,label:labels[index]}));
const VERTICAL_FIELD:SettingsField=Object.freeze({path:LINE_TEXT_PATHS.vertical,label:'Text vertical position',kind:'select' as const,group:'text' as const,options:opts(VERTICAL,['Top','Middle','Bottom'])});
const HORIZONTAL_FIELD:SettingsField=Object.freeze({path:LINE_TEXT_PATHS.horizontal,label:'Text horizontal position',kind:'select' as const,group:'text' as const,options:opts(HORIZONTAL,['Left','Center','Right'])});
const ORIENTATION_FIELD:SettingsField=Object.freeze({path:LINE_TEXT_PATHS.orientation,label:'Text orientation',kind:'select' as const,group:'text' as const,options:opts(['vertical','horizontal'],['Vertical','Horizontal'])});
export const HLINE_TEXT_FIELDS:readonly SettingsField[]=Object.freeze([VERTICAL_FIELD,HORIZONTAL_FIELD]);
export const VLINE_TEXT_FIELDS:readonly SettingsField[]=Object.freeze([VERTICAL_FIELD,HORIZONTAL_FIELD,ORIENTATION_FIELD]);

interface ModelState{readonly read:LineTextState;readonly raw?:unknown}
const STATES=new WeakMap<object,ModelState>();
type Style={lineColor:string;lineWidth:number;lineStyle:string};
type Text={value:string;size?:string;bold?:boolean;italic?:boolean;color?:string};
/** Native labelLineHeight. */
const lineHeightOf=(px:number)=>Math.round(px*1.4);
const isText=(value:unknown):value is Text=>!!value&&typeof value==='object'&&typeof (value as Text).value==='string';

/** The native paintLabel body (font, outline in the theme background, fill), at a resolved position. */
function paintText(ctx:CanvasRenderingContext2D,text:Text,theme:LvPaintTheme,x:number,top:number,align:CanvasTextAlign,rotate?:{cx:number;cy:number;angle:number}){
 const fs=namedPx(text.size),lh=lineHeightOf(fs),lines=text.value.split('\n');
 ctx.save();
 if(rotate){ctx.translate(rotate.cx,rotate.cy);ctx.rotate(rotate.angle);}
 ctx.font=`${text.bold?'bold ':''}${text.italic?'italic ':''}${fs}px ${theme.fontFamily}`;
 ctx.textBaseline='top';ctx.textAlign=align;
 ctx.lineJoin='round';ctx.lineWidth=3;ctx.strokeStyle=theme.background;
 lines.forEach((line,i)=>ctx.strokeText(line,x,top+i*lh));
 ctx.fillStyle=text.color??theme.textColor;
 lines.forEach((line,i)=>ctx.fillText(line,x,top+i*lh));
 ctx.restore();
}
/** Label placement of a horizontal line (pure; exported for tests). */
export function hlineLabelLayout(settings:Readonly<LineTextSettings>|null,anchorX:number,y:number,width:number,lines:number,px:number):{x:number;top:number;align:CanvasTextAlign}{
 const block=lineHeightOf(px)*lines;
 if(!settings)return{x:anchorX+8,top:y-4-block,align:'left'};
 const x=settings.horizontal==='left'?8:settings.horizontal==='right'?width-8:width/2;
 const top=settings.vertical==='top'?y-4-block:settings.vertical==='bottom'?y+4:y-block/2;
 return{x,top,align:settings.horizontal==='left'?'left':settings.horizontal==='right'?'right':'center'};
}
/** Label placement of a vertical line inside its pane rectangle (pure; exported for tests). */
export function vlineLabelLayout(settings:Readonly<LineTextSettings>|null,x:number,anchorY:number,pane:{top:number;height:number},lines:number,px:number):{x:number;top:number;align:CanvasTextAlign;rotate?:{cx:number;cy:number;angle:number}}{
 const block=lineHeightOf(px)*lines;
 if(!settings)return{x,top:anchorY,align:'left'};
 const bottom=pane.top+pane.height;
 if(settings.orientation==='vertical'){
  // Rotated -90 degrees: local +x runs up the line, local +y points right of it.
  const cy=settings.vertical==='top'?pane.top+4:settings.vertical==='bottom'?bottom-4:pane.top+pane.height/2;
  const top=settings.horizontal==='left'?-4-block:settings.horizontal==='right'?4:-block/2;
  return{x:0,top,align:settings.vertical==='top'?'right':settings.vertical==='bottom'?'left':'center',rotate:{cx:x,cy,angle:-Math.PI/2}};
 }
 const top=settings.vertical==='top'?pane.top+4:settings.vertical==='bottom'?bottom-4-block:pane.top+pane.height/2-block/2;
 return settings.horizontal==='left'?{x:x-6,top,align:'right'}:settings.horizontal==='right'?{x:x+6,top,align:'left'}:{x,top,align:'center'};
}

interface AxisModel extends NativeModel{applySettings(patch:Record<string,unknown>):void}
/** Props.lvAxisLine state per model (vline, crossline). */
interface AxisLineModelState{readonly read:AxisLineState;readonly raw?:unknown}
const AXIS_STATES=new WeakMap<object,AxisLineModelState>();
const axisLine={
 init(model:object,type:AxisLineType){if(!AXIS_STATES.has(model))AXIS_STATES.set(model,{read:readAxisLine(type,undefined)});},
 read(model:object,type:AxisLineType,props:Record<string,unknown>){const read=readAxisLine(type,props);AXIS_STATES.set(model,read.state==='unavailable'?{read,raw:structuredClone(Object.getOwnPropertyDescriptor(props,AXIS_LINE_FIELD)?.value)}:{read});},
 write(model:object,props:Record<string,unknown>|undefined):Record<string,unknown>|undefined{const state=AXIS_STATES.get(model);if(!state||state.read.state==='legacy')return props;return{...(props??{}),[AXIS_LINE_FIELD]:state.read.state==='supported'?{...state.read.settings}:structuredClone(state.raw)};},
 fields(model:object,type:AxisLineType):SettingsField[]{return AXIS_STATES.get(model)?.read.state==='unavailable'?[]:axisLineFields(type).map(field=>({...field}));},
 value(model:object):AxisLineSettings|undefined{const read=AXIS_STATES.get(model)?.read;return read&&read.state!=='unavailable'?read.settings:undefined;},
 /** Splits the lvAxisLine.* paths off a settings patch; returns the validated next settings (undefined: none in the patch). */
 take(model:object,type:AxisLineType,patch:Record<string,unknown>):{rest:Record<string,unknown>;next?:AxisLineSettings}{
  const own=Object.keys(patch).filter(path=>path===AXIS_LINE_FIELD||path.startsWith(AXIS_LINE_PREFIX));if(!own.length)return{rest:patch};
  const read=AXIS_STATES.get(model)?.read;if(!read||read.state==='unavailable')throw Error(AXIS_LINE_DIAGNOSTIC);
  const fields=axisLineFields(type),draft:Record<string,unknown>={...read.settings};
  for(const path of own){if(!fields.some(field=>field.path===path))throw Error(AXIS_LINE_DIAGNOSTIC);draft[path.slice(AXIS_LINE_PREFIX.length)]=patch[path];}
  return{rest:Object.fromEntries(Object.entries(patch).filter(([path])=>!own.includes(path))),next:validateAxisLine(type,draft)};
 },
 set(model:object,next:AxisLineSettings){AXIS_STATES.set(model,{read:{state:'supported',settings:next}});},
};
function pin(type:'hline'|'vline'|'crossline'){
 const base=nativeBase(type);
 for(const key of ['anchorSchema','hitTest','handlePoints','bounds','schema','serialize','readProps','writeProps','applySettings'])method(base.prototype,key);
 const sample=base.sample as AxisModel;
 if(typeof (sample as {lvPaint?:unknown}).lvPaint==='function'||STATES.has(sample))fail(type+' is already replaced by another module instance');
 const shape=roles(sample);
 if(shape.min!==1||shape.max!==1||shape.roles!=='p')fail(type+' anchor schema changed: '+JSON.stringify(shape));
 if(sample.serialize().props!==undefined)fail(type+' retained props changed');
 const paths=sample.schema().fields.map(field=>field.path);
 if(paths.some(path=>path.startsWith(PREFIX)||path.startsWith(AXIS_LINE_PREFIX)))fail(type+' already has a line text or axis line setting');
 if(!['text.value','text.size'].every(path=>paths.includes(path)))fail(type+' text fields changed');
 return base;
}
const metaOf=(base:ReturnType<typeof nativeBase>,type:string,create:DrawingTypeMeta['create']):DrawingTypeMeta=>{const meta=base.meta;return{type:lvKey(type),group:meta.group,label:meta.label,icon:meta.icon,defaultStyle:cloneStyle(meta),
 ...(meta.coversSeries!==undefined?{coversSeries:meta.coversSeries}:{}),...(meta.placementHint!==undefined?{placementHint:meta.placementHint}:{}),create};};
const fresh=(init:Init)=>(init as {type?:unknown}).type===undefined;

function defineTextLine(type:'hline'|'vline'):DrawingTypeMeta{
 const base=pin(type);
 const Base=base.ctor as unknown as new(init:Init)=>AxisModel;
 const legacy=type==='hline'?HLINE_LEGACY:VLINE_LEGACY,factory=type==='hline'?HLINE_TEXT_FACTORY:VLINE_TEXT_FACTORY,fields=type==='hline'?HLINE_TEXT_FIELDS:VLINE_TEXT_FIELDS;
 class LvTextLine extends Base{
  // No class fields: the base constructor calls readProps before they would be initialized.
  constructor(init:Init){super(init);if(!STATES.has(this))STATES.set(this,{read:{state:'legacy',settings:legacy}});axisLine.init(this,type);}
  /** Vline Extend / Time label; Hline Price label (settings paths lvAxisLine.*). */
  get lvAxisLine():AxisLineSettings|undefined{return axisLine.value(this);}
  /** Effective layout for the editor (settings paths lvLineText.*); undefined while the member is unavailable. */
  get lvLineText():Readonly<LineTextSettings>|undefined{const read=STATES.get(this)?.read;return read&&read.state!=='unavailable'?read.settings:undefined;}
  protected readProps(props:Record<string,unknown>):void{
   super.readProps(props);
   const read=readLineText(props,legacy);
   STATES.set(this,read.state==='unavailable'?{read,raw:structuredClone(Object.getOwnPropertyDescriptor(props,LINE_TEXT_FIELD)?.value)}:{read});
   axisLine.read(this,type,props);
  }
  protected writeProps():Record<string,unknown>|undefined{
   const native=super.writeProps(),props=axisLine.write(this,native),state=STATES.get(this);
   if(!state||state.read.state==='legacy')return props;
   return{...(props??{}),[LINE_TEXT_FIELD]:state.read.state==='supported'?{...state.read.settings}:structuredClone(state.raw)};
  }
  schema(){
   const own=[...super.schema().fields,...axisLine.fields(this,type)];
   return{fields:STATES.get(this)?.read.state==='unavailable'?own:[...own,...fields.map(field=>({...field}))]} as ReturnType<NativeModel['schema']>;
  }
  applySettings(input:Record<string,unknown>):void{
   const axis=axisLine.take(this,type,input),patch=axis.rest;
   const own=Object.keys(patch).filter(path=>path===LINE_TEXT_FIELD||path.startsWith(PREFIX));
   let next:Readonly<LineTextSettings>|undefined;
   if(own.length){
    const read=STATES.get(this)?.read;if(!read||read.state==='unavailable')throw Error(LINE_TEXT_DIAGNOSTIC);
    const draft:Record<string,unknown>={...read.settings};
    for(const path of own){const key=path.slice(PREFIX.length);if(!fields.some(field=>field.path===path))throw Error(LINE_TEXT_DIAGNOSTIC);draft[key]=patch[path];}
    next=validateLineText(draft);
   }
   const rest=Object.fromEntries(Object.entries(patch).filter(([path])=>!own.includes(path)));
   if(Object.keys(rest).length)super.applySettings(rest);
   if(next)STATES.set(this,{read:{state:'supported',settings:next}});
   if(axis.next)axisLine.set(this,axis.next);
  }
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:LvPaintTheme):void{
   const pts=this.handlePoints(proj);if(pts.length===0)return;
   const [px,py]=pts[0],style=this.style as unknown as Style;
   // The native hline / vline branch.
   if(type==='hline')strokePath(ctx,style,()=>{ctx.moveTo(0,py);ctx.lineTo(proj.width,py);});
   else strokePath(ctx,style,()=>{ctx.moveTo(px,0);ctx.lineTo(px,proj.height);});
   const text=this.text as unknown;if(!isText(text)||!text.value)return;
   const read=STATES.get(this)?.read,settings=read?.state==='supported'?read.settings:null;
   const lines=text.value.split('\n').length,fs=namedPx(text.size);
   if(type==='hline'){const at=hlineLabelLayout(settings,px,py,proj.width,lines,fs);paintText(ctx,text,theme,at.x,at.top,at.align);return;}
   const pane=(proj as {paneRect?:(id:string)=>{top:number;height:number}|null}).paneRect?.(this.paneId)??{top:0,height:proj.height};
   const at=vlineLabelLayout(settings,px,py,pane,lines,fs);paintText(ctx,text,theme,at.x,at.top,at.align,at.rotate);
  }
 }
 return metaOf(base,type,init=>{
  const model=new LvTextLine(init);
  if(fresh(init)){
   if(init.props===undefined)STATES.set(model,{read:{state:'supported',settings:factory}});
   // hline: 12 px text for a fresh drawing; a carried text keeps every key it has.
   if(type==='hline'&&init.text===undefined)(model as {text?:unknown}).text={value:'',size:HLINE_TEXT_SIZE_FACTORY,bold:false,italic:false,hAlign:'center',vAlign:'center'};
  }
  return model;
 });
}

function defineCrossLine():DrawingTypeMeta{
 const base=pin('crossline');
 const Base=base.ctor as unknown as new(init:Init)=>AxisModel;
 class LvCrossLine extends Base{
  /** No Text tab on the Cross line: text fields are not offered; a saved text is kept and painted natively. */
  schema(){return{fields:[...super.schema().fields.filter(field=>!field.path.startsWith('text.')),...axisLine.fields(this,'crossline')]} as ReturnType<NativeModel['schema']>;}
  // Price label / Time label (props.lvAxisLine).
  constructor(init:Init){super(init);axisLine.init(this,'crossline');}
  get lvAxisLine():AxisLineSettings|undefined{return axisLine.value(this);}
  protected readProps(props:Record<string,unknown>):void{super.readProps(props);axisLine.read(this,'crossline',props);}
  protected writeProps():Record<string,unknown>|undefined{return axisLine.write(this,super.writeProps());}
  applySettings(patch:Record<string,unknown>):void{const axis=axisLine.take(this,'crossline',patch);if(Object.keys(axis.rest).length)super.applySettings(axis.rest);if(axis.next)axisLine.set(this,axis.next);}
 }
 return metaOf(base,'crossline',init=>new LvCrossLine(init));
}

export const AXIS_LINES_MODULE=defineLvDrawingToolModule({
 id:'axis-lines',
 types:[
  {type:'hline',base:'hline',define:()=>defineTextLine('hline'),requiresPaintHook:true,replacesNative:true},
  {type:'vline',base:'vline',define:()=>defineTextLine('vline'),requiresPaintHook:true,replacesNative:true},
  {type:'crossline',base:'crossline',define:defineCrossLine,replacesNative:true},
 ],
});
