// Fib channel (reference LineToolFibChannel), on the pinned native `fibchannel` class.
// The native model places three anchors (p1, p2, offset), hit-tests and paints one line p1 -> p2 per enabled level,
// shifted by ratio * (offset - p1), with only the ratio as text and no background. This module adds the channel
// presentation a Fib channel needs: filled bands between neighbouring levels (parallelograms, not the rectangles the
// native Fibonacci branch fills), extend left / extend right, and a Levels toggle for the ratio text. They live in ONE
// OpenCandle member props.lvFibChannel {schemaVersion:1, background, opacity, extendLeft, extendRight, showLevels}.
//
// The type REPLACES the native registration in place (replacesNative, contract.ts): saved records keep the type id
// `fibchannel`, so no migration exists. Levels, placement, handles, bounds, body drag and undo stay native. Painting
// goes through LV-VELA-DRAWING-PAINT-HOOK-1 (lvPaint); a legacy record paints with the exact command sequence of the
// native Fibonacci branch (paintFibRatios). Fail closed: when the pin or the paint hook is missing, the native
// registration stays untouched.
//
// Member states (same rules as the other LV members):
//   absent  -> legacy. Saved before this member existed: no bands, no extension, ratios shown (the native picture), and
//              the record serializes byte-identically (no member is written).
//   valid   -> supported.
//   invalid -> unavailable. Retained verbatim; the native picture is painted and the member is not editable.
// Defaults: the values for a NEW drawing are our own choice: background on at 20 percent opaque (the same
// opacity as the Fib retracement default, transparency 80),
// no extension, ratios shown. Level ratios and colors stay the renderer's own.
import type {DrawingTypeMeta,SettingsField} from '@luxalgo/vela';
import type {LvPaintTheme} from '../lv-paint-hook';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import {defineLvDrawingToolModule} from './contract';

export const FIB_CHANNEL_TYPE='fibchannel';
export const FIB_CHANNEL_FIELD='lvFibChannel';
const PREFIX=FIB_CHANNEL_FIELD+'.';
export const FIB_CHANNEL_PATHS=Object.freeze({background:PREFIX+'background',opacity:PREFIX+'opacity',extendLeft:PREFIX+'extendLeft',extendRight:PREFIX+'extendRight',showLevels:PREFIX+'showLevels'});
export const FIB_CHANNEL_DIAGNOSTIC='Unsupported Fib channel presentation is retained without interpretation.';
export interface FibChannelSettings{readonly schemaVersion:1;readonly background:boolean;readonly opacity:number;readonly extendLeft:boolean;readonly extendRight:boolean;readonly showLevels:boolean}
export type FibChannelState={readonly state:'legacy'|'supported';readonly settings:Readonly<FibChannelSettings>}|{readonly state:'unavailable';readonly message:string};
/** Presentation of a NEW Fib channel (the reference defaults are unknown; see the header). */
export const FIB_CHANNEL_FACTORY:Readonly<FibChannelSettings>=Object.freeze({schemaVersion:1,background:true,opacity:20,extendLeft:false,extendRight:false,showLevels:true});
/** A record saved without the member: the native picture (no bands, no extension, ratios shown). */
export const FIB_CHANNEL_LEGACY:Readonly<FibChannelSettings>=Object.freeze({...FIB_CHANNEL_FACTORY,background:false});
const KEYS=['schemaVersion','background','opacity','extendLeft','extendRight','showLevels'] as const;
const EDITABLE:readonly string[]=['background','opacity','extendLeft','extendRight','showLevels'];

/** Exactly the six keys, plain data, booleans, opacity an integer 0..100; anything else throws. */
export function validateFibChannel(value:unknown):Readonly<FibChannelSettings>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==KEYS.length)throw Error(FIB_CHANNEL_DIAGNOSTIC);
 const out:Record<string,unknown>={};
 for(const key of KEYS){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!d.enumerable||!Object.hasOwn(d,'value'))throw Error(FIB_CHANNEL_DIAGNOSTIC);out[key]=d.value;}
 const opacity=out.opacity as number;
 if(out.schemaVersion!==1||!Number.isInteger(opacity)||opacity<0||opacity>100||['background','extendLeft','extendRight','showLevels'].some(key=>typeof out[key]!=='boolean'))throw Error(FIB_CHANNEL_DIAGNOSTIC);
 return Object.freeze(out) as unknown as Readonly<FibChannelSettings>;
}
/** Interpretation of a props bag. An accessor or invalid member is unavailable; an absent member is legacy. */
export function readFibChannel(props:unknown):FibChannelState{
 const legacy:FibChannelState={state:'legacy',settings:FIB_CHANNEL_LEGACY};
 if(!props||typeof props!=='object')return legacy;
 const d=Object.getOwnPropertyDescriptor(props,FIB_CHANNEL_FIELD);if(!d)return legacy;
 if(!d.enumerable||!Object.hasOwn(d,'value'))return{state:'unavailable',message:FIB_CHANNEL_DIAGNOSTIC};
 try{return{state:'supported',settings:validateFibChannel(d.value)};}catch{return{state:'unavailable',message:FIB_CHANNEL_DIAGNOSTIC};}
}

/** Editor fields (settings paths into the model getter below). Group `line`: Style tab and templates. */
export const FIB_CHANNEL_FIELDS:readonly SettingsField[]=Object.freeze([
 Object.freeze({path:FIB_CHANNEL_PATHS.extendLeft,label:'Extend left',kind:'boolean' as const,group:'line' as const}),
 Object.freeze({path:FIB_CHANNEL_PATHS.extendRight,label:'Extend right',kind:'boolean' as const,group:'line' as const}),
 Object.freeze({path:FIB_CHANNEL_PATHS.showLevels,label:'Levels',kind:'boolean' as const,group:'line' as const}),
 Object.freeze({path:FIB_CHANNEL_PATHS.background,label:'Background',kind:'boolean' as const,group:'line' as const}),
 Object.freeze({path:FIB_CHANNEL_PATHS.opacity,label:'Background opacity',kind:'number' as const,min:0,max:100,step:1,group:'line' as const}),
]);

interface Entry{color:string;label?:string;x1:number;y1:number;x2:number;y2:number;numberText:string;numberX:number;numberY:number;numberAlign:CanvasTextAlign;labelX:number;labelY:number}
interface Level{ratio:number;color:string;enabled:boolean;label?:string}
interface FibChannelModel extends NativeModel{
 levels:Level[];numbersSize:string;labelsSize:string;
 entryLines(proj:Projector):Entry[]|null;fillBands(proj:Projector):unknown[];
 applySettings(patch:Record<string,unknown>):void;
}
interface ModelState{readonly read:FibChannelState;readonly raw?:unknown}
/** Per-model member state; also the brand of a model built by this module. */
const STATES=new WeakMap<object,ModelState>();
const settingsOf=(model:object):Readonly<FibChannelSettings>=>{const read=STATES.get(model)?.read;return read&&read.state!=='unavailable'?read.settings:FIB_CHANNEL_LEGACY;};

// Transcription of the native stroke helper and named font sizes (DrawingPainter.stroke / dashPattern / namedFontSize).
const dash=(style:string,width:number)=>{const w=Math.max(1,width);return style==='dotted'?[w,w*2]:style==='dashed'?[w*4,w*3]:[];};
const NAMED_PX:Readonly<Record<string,number>>=Object.freeze({tiny:10,small:12,normal:14,large:18,huge:28});
const namedPx=(size:string)=>Object.hasOwn(NAMED_PX,size)?NAMED_PX[size]:0;
function stroke(ctx:CanvasRenderingContext2D,style:{lineColor:string;lineWidth:number;lineStyle:string},path:()=>void){
 ctx.strokeStyle=style.lineColor;ctx.lineWidth=style.lineWidth;ctx.setLineDash(dash(style.lineStyle,style.lineWidth));
 ctx.beginPath();path();ctx.stroke();ctx.setLineDash([]);
}

/** Moves the left end of a non-vertical segment to x = 0 and/or its right end to x = width, along its own slope. */
export function extendSegment(line:{x1:number;y1:number;x2:number;y2:number},width:number,left:boolean,right:boolean):{x1:number;y1:number;x2:number;y2:number}{
 const dx=line.x2-line.x1;if((!left&&!right)||Math.abs(dx)<1e-9)return{x1:line.x1,y1:line.y1,x2:line.x2,y2:line.y2};
 const slope=(line.y2-line.y1)/dx,at=(x:number)=>line.y1+slope*(x-line.x1);
 const firstIsLeft=line.x1<=line.x2;
 let lx=firstIsLeft?line.x1:line.x2,rx=firstIsLeft?line.x2:line.x1;
 if(left)lx=Math.min(lx,0);if(right)rx=Math.max(rx,width);
 const [ax,bx]=firstIsLeft?[lx,rx]:[rx,lx];
 return{x1:ax,y1:at(ax),x2:bx,y2:at(bx)};
}
/** Even-odd point-in-polygon test (pixels). */
function inside(px:number,py:number,points:readonly (readonly [number,number])[]):boolean{
 let hit=false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){const [xi,yi]=points[i],[xj,yj]=points[j];if(yi>py!==yj>py&&px<(xj-xi)*(py-yi)/(yj-yi)+xi)hit=!hit;}
 return hit;
}

const BASE=FIB_CHANNEL_TYPE;
function pinFibChannel(){
 const base=nativeBase(BASE);
 for(const key of ['anchorSchema','entryLines','fillBands','hitTest','handlePoints','bounds','schema','serialize','readProps','writeProps','applySettings','editableLevels'])method(base.prototype,key);
 const sample=base.sample as FibChannelModel;
 if(typeof (sample as {lvPaint?:unknown}).lvPaint==='function'||STATES.has(sample))fail('fib channel is already replaced by another module instance');
 const shape=roles(sample);
 if(shape.min!==3||shape.max!==3||shape.roles!=='p1/p2/offset')fail('fib channel anchor schema changed: '+JSON.stringify(shape));
 const written=sample.serialize().props;
 if(!written||Object.keys(written).sort().join()!=='labelsSize,levels,numbersSize')fail('fib channel retained props changed');
 if(sample.schema().fields.some(field=>field.path.startsWith(PREFIX)))fail('fib channel already has a channel setting');
 // One entry per enabled level, in level order: p1 -> p2 shifted by ratio * (offset - p1); the ratio as text; no fill bands.
 const probe=new (base.ctor as unknown as new(init:Init)=>FibChannelModel)({id:'lv-drawing-type-probe',paneId:'price',createdAt:0,anchors:[{time:0,price:50},{time:10,price:60},{time:0,price:40}]});
 const proj={xOf:(time:number)=>time,yOf:(price:number)=>100-price,width:200,height:100} as unknown as Projector;
 const lines=probe.entryLines(proj)??[],enabled=probe.levels.filter(level=>level.enabled),bands=probe.fillBands(proj);
 if(lines.length===0||lines.length!==enabled.length||!Array.isArray(bands)||bands.length!==0)fail('fib channel level geometry changed');
 for(let i=0;i<lines.length;i++){const l=lines[i],r=enabled[i].ratio;if(l.x1!==0||l.x2!==10||Math.abs(l.y1-(50+10*r))>1e-9||Math.abs(l.y2-(40+10*r))>1e-9||l.numberText!==String(r)||l.color!==enabled[i].color)fail('fib channel level geometry changed');}
 return base;
}

function defineFibChannel():DrawingTypeMeta{
 const base=pinFibChannel();
 const Base=base.ctor as unknown as new(init:Init)=>FibChannelModel;
 class LvFibChannel extends Base{
  // No class fields: the base constructor calls readProps before they would be initialized.
  constructor(init:Init){super(init);if(!STATES.has(this))STATES.set(this,{read:{state:'legacy',settings:FIB_CHANNEL_LEGACY}});}
  /** Effective settings for the editor (settings paths lvFibChannel.*); undefined while the member is unavailable. */
  get lvFibChannel():Readonly<FibChannelSettings>|undefined{const read=STATES.get(this)?.read;return read&&read.state!=='unavailable'?read.settings:undefined;}
  /** Record-faithful: every props bag (load, store edit, undo restore, tool defaults) sets the member state it describes. */
  protected readProps(props:Record<string,unknown>):void{
   super.readProps(props);
   const read=readFibChannel(props);
   STATES.set(this,read.state==='unavailable'?{read,raw:structuredClone(Object.getOwnPropertyDescriptor(props,FIB_CHANNEL_FIELD)?.value)}:{read});
  }
  protected writeProps():Record<string,unknown>|undefined{
   const props=super.writeProps(),state=STATES.get(this);
   if(!state||state.read.state==='legacy')return props;
   return{...(props??{}),[FIB_CHANNEL_FIELD]:state.read.state==='supported'?{...state.read.settings}:structuredClone(state.raw)};
  }
  schema(){
   const fields=super.schema().fields;
   return{fields:STATES.get(this)?.read.state==='unavailable'?fields:[...fields,...FIB_CHANNEL_FIELDS.map(field=>({...field}))]} as ReturnType<NativeModel['schema']>;
  }
  /** Channel paths are validated as one whole member before anything changes; the rest is the native patch. */
  applySettings(patch:Record<string,unknown>):void{
   const own=Object.keys(patch).filter(path=>path===FIB_CHANNEL_FIELD||path.startsWith(PREFIX));
   let next:Readonly<FibChannelSettings>|undefined;
   if(own.length){
    const read=STATES.get(this)?.read;if(!read||read.state==='unavailable')throw Error(FIB_CHANNEL_DIAGNOSTIC);
    const draft:Record<string,unknown>={...read.settings};
    for(const path of own){const key=path.slice(PREFIX.length);if(!EDITABLE.includes(key))throw Error(FIB_CHANNEL_DIAGNOSTIC);draft[key]=patch[path];}
    next=validateFibChannel(draft);
   }
   const rest=Object.fromEntries(Object.entries(patch).filter(([path])=>!own.includes(path)));
   if(Object.keys(rest).length)super.applySettings(rest);
   if(next)STATES.set(this,{read:{state:'supported',settings:next}});
  }
  /** Native level lines, extended along their slope when asked. Text positions stay at the unextended ends. */
  entryLines(proj:Projector):Entry[]|null{
   const lines=super.entryLines(proj);if(!lines)return lines;
   const s=settingsOf(this);if(!s.extendLeft&&!s.extendRight)return lines;
   return lines.map(line=>({...line,...extendSegment(line,proj.width,s.extendLeft,s.extendRight)}));
  }
  /** Bands between neighbouring enabled levels (by ratio), as pixel quadrilaterals, each in the upper level's color. */
  channelBands(proj:Projector):{color:string;points:[number,number][]}[]{
   const s=settingsOf(this);if(!s.background)return[];
   const lines=this.entryLines(proj),enabled=this.levels.filter(level=>level.enabled);
   if(!lines||lines.length!==enabled.length||lines.length<2)return[];
   const sorted=lines.map((line,index)=>({line,ratio:enabled[index].ratio})).sort((a,b)=>a.ratio-b.ratio);
   const out:{color:string;points:[number,number][]}[]=[];
   for(let i=1;i<sorted.length;i++){const a=sorted[i-1].line,b=sorted[i].line;out.push({color:b.color,points:[[a.x1,a.y1],[a.x2,a.y2],[b.x2,b.y2],[b.x1,b.y1]]});}
   return out;
  }
  hitTest(px:number,py:number,proj:Projector,tol:number):boolean{
   if(super.hitTest(px,py,proj,tol))return true;
   return this.channelBands(proj).some(band=>inside(px,py,band.points));
  }
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:LvPaintTheme):void{
   const lines=this.entryLines(proj);if(!lines||lines.length===0)return;
   const s=settingsOf(this);
   for(const band of this.channelBands(proj)){
    ctx.save();ctx.globalAlpha=(s.opacity/100)*ctx.globalAlpha;ctx.fillStyle=band.color;
    ctx.beginPath();ctx.moveTo(band.points[0][0],band.points[0][1]);for(const [x,y] of band.points.slice(1))ctx.lineTo(x,y);ctx.closePath();ctx.fill();
    ctx.restore();
   }
   // Level lines and text: the native Fibonacci branch, command for command (no fill bands: the native model has none).
   ctx.textBaseline='middle';
   const numFont=`${namedPx(this.numbersSize)}px ${theme.fontFamily}`,lblFont=`${namedPx(this.labelsSize)}px ${theme.fontFamily}`;
   for(const l of lines){
    stroke(ctx,{...(this.style as {lineColor:string;lineWidth:number;lineStyle:string}),lineColor:l.color},()=>{ctx.moveTo(l.x1,l.y1);ctx.lineTo(l.x2,l.y2);});
    if(s.showLevels){ctx.fillStyle=l.color;ctx.font=numFont;ctx.textAlign=l.numberAlign;ctx.fillText(l.numberText,l.numberX,l.numberY);}
    if(l.label){ctx.fillStyle=l.color;ctx.font=lblFont;ctx.textAlign='center';ctx.fillText(l.label,l.labelX,l.labelY);}
   }
   ctx.textAlign='left';ctx.textBaseline='alphabetic';
  }
 }
 const meta=base.meta;
 return{type:lvKey(BASE),group:meta.group,label:meta.label,icon:meta.icon,defaultStyle:cloneStyle(meta),
  ...(meta.coversSeries!==undefined?{coversSeries:meta.coversSeries}:{}),...(meta.placementHint!==undefined?{placementHint:meta.placementHint}:{}),
  // A fresh drawing (no retained record, no carried props) takes the presentation; saved records stay as saved.
  create:init=>{const model=new LvFibChannel(init);if((init as {type?:unknown}).type===undefined&&init.props===undefined)STATES.set(model,{read:{state:'supported',settings:FIB_CHANNEL_FACTORY}});return model;}};
}

export const FIB_CHANNEL_MODULE=defineLvDrawingToolModule({
 id:'fib-channel',
 types:[{type:FIB_CHANNEL_TYPE,base:BASE,define:defineFibChannel,requiresPaintHook:true,replacesNative:true}],
});
