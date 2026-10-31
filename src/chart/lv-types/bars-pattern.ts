// Bars pattern on the pinned native `trendline` class, painted through
// LV-VELA-DRAWING-PAINT-HOOK-1 (lvPaint).
//
// Behavior:
//  * Placement: two click-placed points (source bar range); the
//    copied bars are stored with the drawing (state() includes the pattern), not re-read from the series.
//  * Defaults: mode 0 (HL bars), mirrored false, flipped false,
//    color #2962FF, mode enum Bars 0 .. LineHL2 6, context actions mirror / flip.
//  * Settings: Color, Mode (UI option order), Mirrored, Flipped.
//  * The Coordinates tab is hidden, so tabs are Style + Visibility.
// Geometry, handles, density and line width (bars-pattern-geometry.ts).
// Original extension:
// the source-resolution re-sample (bars-pattern-source.ts) committed through the `lvBarsPatternSource` setting
// (bars-pattern-request.ts). Unused, it changes nothing against the defaults above.
import type {DrawingTypeMeta,SettingsField} from '@luxalgo/vela';
import {TV_BLUE} from '../drawing-default-constants';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import type {LvPaintTheme} from '../lv-paint-hook';
import {defineLvDrawingToolModule} from './contract';
import {BARS_PATTERN_BAR_CAP,BARS_PATTERN_MEMBER,barsPatternFingerprint,readBarsPattern,type BarsPatternMember,type PatternColumns} from './bars-pattern-data';
import {BARS_PATTERN_MODE_OPTIONS,isBarsPatternMode,lastDrawnClose,patternBounds,patternHit,patternPriceRange,patternPrimitives,type PatternFrame,type PatternPrimitives} from './bars-pattern-geometry';
import {capturePlacementBars,placementMember} from './bars-pattern-source';
import {isBarsPatternRequestToken,takeStagedBarsPatternRequest} from './bars-pattern-request';

export const LV_BARS_PATTERN:string='lvbarspattern';
/** Settings path of the OpenCandle source-resolution extension (group behavior: never part of templates or remembered defaults). */
export const BARS_PATTERN_SOURCE_PATH='lvBarsPatternSource';
export const BARS_PATTERN_MODE_PATH='patternMode';

/** Read-only state the dialog and the chip read through the `lvBarsPatternSource` editor value. */
export interface BarsPatternEditorState{
 readonly state:'supported'|'absent'|'unavailable';
 readonly fingerprint:string;
 readonly member:BarsPatternMember|null;
 readonly message:string|null;
}
export function parseBarsPatternEditorState(value:unknown):BarsPatternEditorState|null{
 if(typeof value!=='string')return null;
 try{const parsed=JSON.parse(value) as BarsPatternEditorState;return parsed&&typeof parsed==='object'&&typeof parsed.state==='string'?parsed:null;}catch{return null;}
}

interface State{
 mode:number;mirrored:boolean;flipped:boolean;
 member:BarsPatternMember|null;columns:PatternColumns|null;
 /** Props exactly as read: unknown keys, invalid reference values and an unreadable member are written back untouched. */
 raw:Record<string,unknown>|null;
 valid:{mode:boolean;mirrored:boolean;flipped:boolean};
 memberState:'absent'|'supported'|'unavailable';
 message:string|null;
 cache:{key:string;primitives:PatternPrimitives|null}|null;
}
const fresh=():State=>({mode:0,mirrored:false,flipped:false,member:null,columns:null,raw:null,valid:{mode:true,mirrored:true,flipped:true},memberState:'absent',message:null,cache:null});
const states=new WeakMap<object,State>();
const st=(model:object)=>{let state=states.get(model);if(!state){state=fresh();states.set(model,state);}return state;};

/** Root creation hook: why a just-created Bars pattern record must be refused (it copied no usable bars: none between the two
 *  points, or more than the cap), or null. Root removes the drawing in the same create publication and shows the message;
 *  without that hook the drawing stays as a dashed outline between its anchors (never blank). */
export function barsPatternPlacementRefusal(record:{type?:unknown;props?:unknown;anchors?:unknown}):string|null{
 if(record.type!==LV_BARS_PATTERN)return null;
 const read=readBarsPattern(record.props);
 if(read.state!=='absent')return null;
 // The placement's own reason (bar count over the cap, no bars, unusable bars), recorded by onPlaced under its anchors: the
 // native create re-assigns the id, and the reason is never written into the stored record.
 const key=placementKey(record.anchors),reason=key===null?undefined:placementRefusals.get(key);
 if(key!==null)placementRefusals.delete(key);
 return reason??'No usable bars between the two points (none, or more than '+BARS_PATTERN_BAR_CAP.toLocaleString('en-US')+'). Nothing was placed.';
}
/** Recent refused placements by anchor span (bounded; read once by barsPatternPlacementRefusal). */
const placementRefusals=new Map<string,string>();
function placementKey(anchors:unknown):string|null{
 if(!Array.isArray(anchors)||anchors.length!==2)return null;
 const [a,b]=anchors as Array<{time?:unknown;price?:unknown}>;
 return [a?.time,b?.time,a?.price].every(value=>typeof value==='number'&&Number.isFinite(value))?a.time+'|'+b.time+'|'+a.price:null;
}
function recordPlacementRefusal(anchors:unknown,message:string):void{
 const key=placementKey(anchors);if(key===null)return;
 placementRefusals.delete(key);placementRefusals.set(key,/Nothing was placed.$/.test(message)?message:message+' Nothing was placed.');
 while(placementRefusals.size>32)placementRefusals.delete(placementRefusals.keys().next().value!);
}

const dprOf=(ctx:CanvasRenderingContext2D)=>{try{const a=typeof ctx.getTransform==='function'?Math.abs(ctx.getTransform().a):1;return Number.isFinite(a)&&a>0?a:1;}catch{return 1;}};

function defineBarsPattern():DrawingTypeMeta{
 const base=nativeBase('trendline');
 for(const key of ['anchorSchema','serialize','readProps','writeProps','applySettings','applyProps','schema','hitTest','hitHandle','handlePoints','bounds','priceRange','onPlaced','constrainHandleDrag','translateBody','timeExtent'])method(base.prototype,key);
 const shape=roles(base.sample);
 if(shape.min!==2||shape.max!==2||shape.roles!=='p1/p2')fail('trendline anchor schema changed: '+JSON.stringify(shape));
 if(base.sample.placementMode()!=='click')fail('trendline placement is no longer click');
 if(base.sample.serialize().props!==undefined)fail('trendline now writes props of its own');
 const Base=base.ctor as unknown as new(init:Init)=>NativeModel;
 class LvBarsPattern extends Base{
  constructor(init:Init){super(init);(this as {type:string}).type=LV_BARS_PATTERN;st(this);}
  // ---- reference fields (accessors over the per-instance state, so the base constructor's readProps is kept)
  get patternMode():string{return String(st(this).mode);}
  set patternMode(value:string){const mode=Number(value);if(!BARS_PATTERN_MODE_OPTIONS.some(option=>option.value===value)||!isBarsPatternMode(mode))throw Error('Unsupported bars pattern mode.');const s=st(this);s.mode=mode;s.valid.mode=true;s.cache=null;}
  get mirrored():boolean{return st(this).mirrored;}
  set mirrored(value:boolean){if(typeof value!=='boolean')throw Error('Mirrored must be on or off.');const s=st(this);s.mirrored=value;s.valid.mirrored=true;s.cache=null;}
  get flipped():boolean{return st(this).flipped;}
  set flipped(value:boolean){if(typeof value!=='boolean')throw Error('Flipped must be on or off.');const s=st(this);s.flipped=value;s.valid.flipped=true;s.cache=null;}
  // ---- OpenCandle extension: read = compact state, write = an Apply token staged by the dialog or the chip
  get lvBarsPatternSource():string{const s=st(this);return JSON.stringify({state:s.memberState,fingerprint:barsPatternFingerprint(s.member),member:s.member,message:s.message} satisfies BarsPatternEditorState);}
  set lvBarsPatternSource(token:string){
   if(!isBarsPatternRequestToken(token))throw Error('Choose an interval from the list.');
   const s=st(this);if(s.memberState==='unavailable')throw Error(s.message??'Pattern data unavailable.');
   const next=takeStagedBarsPatternRequest(token,s.member),read=readBarsPattern({[BARS_PATTERN_MEMBER]:next});
   if(read.state!=='supported')throw Error('The re-sampled pattern is not valid. The current pattern is kept.');
   s.member=read.member;s.columns=read.columns;s.memberState='supported';s.message=null;s.cache=null;
  }
  anchorSchema(){return{min:2,max:2,slots:[{role:'start',free:'both' as const},{role:'end',free:'x' as const}]};}
  // ---- placement: copy the bars between the two clicks
  onPlaced(proj:Projector):void{
   const s=st(this),[first,second]=this.anchors;if(!first||!second)return;
   const from=Math.min(first.time,second.time),to=Math.max(first.time,second.time),refPrice=first.price;
   const result=placementMember(capturePlacementBars(proj.barsInRange?.(from,to)??[]),refPrice);
   const read=result.ok?readBarsPattern({[BARS_PATTERN_MEMBER]:result.member}):null;
   if(!read||read.state!=='supported'){s.member=null;s.columns=null;s.memberState='absent';s.cache=null;this.anchors=[{time:from,price:refPrice},{time:to,price:refPrice}];recordPlacementRefusal(this.anchors,result.ok?'The copied bars are not usable.':result.message);return;}
   s.member=read.member;s.columns=read.columns;s.memberState='supported';s.cache=null;
   // Anchors sit on the first and last copied bar, so the pattern overlays its own source bars exactly.
   const c=read.columns;this.anchors=[{time:c.time[0]*1000,price:refPrice},{time:c.time[c.count-1]*1000,price:refPrice}];
   this.anchors[1].price=lastDrawnClose(c,this.frameBasis());
  }
  /** Handle 1 is free; handle 2 is x-only and keeps the pattern's derived end price. The handles never cross. */
  constrainHandleDrag(index:number):void{
   const [a,b]=this.anchors;if(!a||!b)return;
   if(index===1&&b.time<a.time)b.time=a.time;
   if(index===0&&a.time>b.time)a.time=b.time;
   const c=st(this).columns;if(c)b.price=lastDrawnClose(c,this.frameBasis());
  }
  frameBasis(){const s=st(this);return{anchorPrice:this.anchors[0]?.price??0,refPrice:s.member?.source.refPrice??0,flipped:s.flipped,mirrored:s.mirrored,mode:s.mode};}
  /** Pixel pitch of one chart bar slot (logical bar), or null when the projector cannot say (then the pattern spans its anchors). */
  slotPitch(proj:Projector):number|null{
   const [a,b]=this.anchors,between=proj.barsBetween;if(!a||typeof between!=='function')return null;
   const x0=proj.xOf(a.time);
   let probe=b&&b.time!==a.time?b.time:null,d=probe===null?0:between(a.time,probe);
   if(!(d>1e-9)){try{probe=proj.pxToPoint(x0+100,0,this.paneId).time;d=probe===a.time?0:between(a.time,probe);}catch{d=0;}}
   if(!(d>1e-9)||probe===null)return null;
   const pitch=Math.abs(proj.xOf(probe)-x0)/d;
   return Number.isFinite(pitch)&&pitch>0?pitch:null;
  }
  /** Owner spec 2026-10-21 (standard Bars pattern): bar i sits i chart bar slots right of anchor 1, so the pattern keeps one bar
   *  per slot wherever it is moved and its length follows its bar count. One bar takes most of its own slot. */
  frame(proj:Projector,dpr=1):PatternFrame|null{
   const [a,b]=this.anchors;if(!a||!b)return null;
   const paneId=this.paneId,n=st(this).columns?.count??0,pitch=n?this.slotPitch(proj):null,x0=proj.xOf(a.time);
   const span=pitch===null?{x0,x1:proj.xOf(b.time)}:n===1?{x0:x0-pitch*0.35,x1:x0+pitch*0.35}:{x0,x1:x0+(n-1)*pitch};
   return{...this.frameBasis(),...span,dpr,yOf:price=>proj.yOf(price,paneId)};
  }
  /** Never culled by its stored anchors: the drawn length comes from the bar count, not from anchor 2. */
  timeExtent(){return null;}
  /** Outline box of a pattern without usable data (or the placement ghost). */
  outline(proj:Projector){
   const [a,b]=this.anchors;if(!a)return null;
   const ya=proj.yOf(a.price,this.paneId),yb=b?proj.yOf(b.price,this.paneId):ya;if(ya==null||yb==null)return null;
   const xa=proj.xOf(a.time),xb=b?proj.xOf(b.time):xa,h=Math.max(Math.abs(yb-ya),24);
   return{x:Math.min(xa,xb),y:Math.min(ya,yb)-(h-Math.abs(yb-ya))/2,w:Math.max(Math.abs(xb-xa),1),h};
  }
  hitTest(px:number,py:number,proj:Projector,tol:number):boolean{
   const c=st(this).columns,frame=this.frame(proj);
   if(c&&frame)return patternHit(c,frame,px,py,tol);
   const r=this.outline(proj);return !!r&&px>=r.x-tol&&px<=r.x+r.w+tol&&py>=r.y-tol&&py<=r.y+r.h+tol;
  }
  handlePoints(proj:Projector):Array<[number,number]>{
   const [a,b]=this.anchors;if(!a||!b)return[];
   const ya=proj.yOf(a.price,this.paneId),c=st(this).columns,yb=proj.yOf(c?lastDrawnClose(c,this.frameBasis()):b.price,this.paneId);
   const pitch=c?this.slotPitch(proj):null,xb=pitch===null?proj.xOf(b.time):proj.xOf(a.time)+(c!.count-1)*pitch;
   return ya==null||yb==null?[]:[[proj.xOf(a.time),ya],[xb,yb]];
  }
  /** Handle 1 moves the start freely. With one bar per slot the end handle only marks the end: grabbing it drags the body. */
  hitHandle(px:number,py:number,proj:Projector,tol:number):number{
   const points=this.handlePoints(proj),fixed=st(this).columns!==null&&this.slotPitch(proj)!==null;
   for(let i=0;i<points.length;i++)if(Math.hypot(px-points[i][0],py-points[i][1])<=tol+3)return i===1&&fixed?-1:i;return -1;
  }
  bounds(proj:Projector){const c=st(this).columns,frame=this.frame(proj);return c&&frame?patternBounds(c,frame):this.outline(proj);}
  priceRange(){
   const c=st(this).columns;if(c&&this.anchors[0])return patternPriceRange(c,this.frameBasis());
   const [a,b]=this.anchors;return a&&b?{min:Math.min(a.price,b.price),max:Math.max(a.price,b.price)}:null;
  }
  schema(){
   const fields:SettingsField[]=[
    {path:'style.lineColor',label:'Color',kind:'color',group:'line'},
    {path:BARS_PATTERN_MODE_PATH,label:'Mode',kind:'select',group:'line',options:BARS_PATTERN_MODE_OPTIONS.map(option=>({...option}))},
    {path:'mirrored',label:'Mirrored',kind:'boolean',group:'line'},
    {path:'flipped',label:'Flipped',kind:'boolean',group:'line'},
    {path:BARS_PATTERN_SOURCE_PATH,label:'Interval',kind:'text',group:'behavior'},
   ];
   return{fields};
  }
  protected readProps(props:Record<string,unknown>):void{
   const s=st(this),next=fresh();
   next.raw=props&&typeof props==='object'?structuredClone(props):null;
   if(Object.hasOwn(props??{},'mode')){if(isBarsPatternMode(props.mode))next.mode=props.mode;else next.valid.mode=false;}
   for(const key of ['mirrored','flipped'] as const)if(Object.hasOwn(props??{},key)){if(typeof props[key]==='boolean')next[key]=props[key] as boolean;else next.valid[key]=false;}
   const read=readBarsPattern(props);
   if(read.state==='supported'){next.member=read.member;next.columns=read.columns;next.memberState='supported';}
   else if(read.state==='unavailable'){next.memberState='unavailable';next.message=read.message;}
   Object.assign(s,next);
  }
  protected writeProps():Record<string,unknown>{
   const s=st(this),out:Record<string,unknown>=s.raw?structuredClone(s.raw):{};
   if(s.valid.mode)out.mode=s.mode;
   if(s.valid.mirrored)out.mirrored=s.mirrored;
   if(s.valid.flipped)out.flipped=s.flipped;
   if(s.memberState==='supported'&&s.member)out[BARS_PATTERN_MEMBER]=s.member;
   return out;
  }
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:LvPaintTheme):void{
   const s=st(this),color=String(this.style.lineColor??TV_BLUE),dpr=dprOf(ctx),frame=this.frame(proj,dpr);
   if(s.columns&&frame){
    // Memo per frame inputs; the price-scale state enters through y probes at the drawn extremes and their midpoint.
    const span=patternPriceRange(s.columns,frame),key=[s.member?.bars.data.length,s.columns.count,frame.x0,frame.x1,dpr,s.mode,s.mirrored,s.flipped,frame.anchorPrice,frame.refPrice,proj.height,frame.yOf(span.min),frame.yOf(span.max),frame.yOf((span.min+span.max)/2)].join('|');
    const primitives=s.cache?.key===key?s.cache.primitives:patternPrimitives(s.columns,frame);
    s.cache={key,primitives};
    if(!primitives)return;
    ctx.save();ctx.strokeStyle=color;ctx.lineWidth=primitives.aggregated?1/dpr:1;ctx.beginPath();
    if(primitives.kind==='bars'){
     const seg=primitives.segments,min=1/dpr;
     if(primitives.box){const left=Math.min(primitives.box.x0,primitives.box.x1),w=Math.abs(primitives.box.x1-primitives.box.x0),top=seg[1];ctx.rect(left,top,w,Math.max(seg[2]-top,min));}
     else for(let i=0;i<seg.length;i+=3){const x=seg[i],top=seg[i+1],bottom=Math.max(seg[i+2],top+min);ctx.moveTo(x,top);ctx.lineTo(x,bottom);}
    }else{
     const p=primitives.points;if(p.length>=2)ctx.moveTo(p[0],p[1]);
     for(let i=2;i<p.length;i+=2)ctx.lineTo(p[i],p[i+1]);
     if(p.length===2)ctx.lineTo(p[0]+1/dpr,p[1]);
    }
    ctx.stroke();ctx.restore();
    return;
   }
   // No usable bars: a thin dashed outline between the anchors (never blank), plus the reason when the stored data is unreadable.
   const r=this.outline(proj);if(!r)return;
   ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1;ctx.setLineDash?.([4,3]);ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);ctx.stroke();ctx.setLineDash?.([]);
   if(s.memberState==='unavailable'){ctx.fillStyle=theme.textColor;ctx.font='12px '+theme.fontFamily;ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText('Pattern data unavailable',r.x+4,r.y+4);}
   ctx.restore();
  }
 }
 // 0.8.1: a new pattern starts above the price series (coversSeries), so the copied bars show over their own source candles
 // instead of hiding under them (the gallery saw nothing after placement).
 return{type:lvKey(LV_BARS_PATTERN),group:base.meta.group,label:'Bars pattern',icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),coversSeries:true,create:init=>new LvBarsPattern(init)};
}

export const BARS_PATTERN_MODULE=defineLvDrawingToolModule({
 id:'bars-pattern',
 types:[{type:LV_BARS_PATTERN,base:'trendline',define:defineBarsPattern,requiresPaintHook:true}],
 // Factory defaults: color #2962FF, mode 0, mirrored false, flipped false.
 factoryDefaults:[{type:LV_BARS_PATTERN,toolId:'LineToolBarsPattern',factId:'tool.LineToolBarsPattern.defaults',style:{lineColor:TV_BLUE},
  probe:sample=>{const model=sample as unknown as {patternMode:unknown;mirrored:unknown;flipped:unknown};return model.patternMode==='0'&&model.mirrored===false&&model.flipped===false?undefined:'bars pattern mode or flags changed';},
  seed:model=>{const m=model as unknown as {patternMode:string;mirrored:boolean;flipped:boolean};m.patternMode='0';m.mirrored=false;m.flipped=false;}}],
 retiresUnapplied:[{toolId:'LineToolBarsPattern',reason:'no-type'}],
 unappliedDefaults:[Object.freeze({toolId:'LineToolBarsPattern',factId:'tool.LineToolBarsPattern.defaults',property:'contextActions',value:['mirror bars pattern','flip bars pattern'],reason:'renderer',note:'The chart context menu is root-owned (App); the Mirror and Flip entries are not wired yet. The dialog Mirrored and Flipped settings carry the same values.'})],
 catalog:[{rowId:'DW.FORECAST.BARS_PATTERN',type:LV_BARS_PATTERN,note:'Click the first and last bar to copy, then drag the copy.'}],
 // visual-drawing-dialogs#dialog.LineToolBarsPattern.style.1-4, tabs corrected to Style + Visibility
 // (static-drawing-defaults-2#answer.LineToolText.coordinates sameRuleAlsoFor LineToolBarsPattern).
 dialog:[{toolId:'LineToolBarsPattern',types:[LV_BARS_PATTERN],tabs:['Style','Visibility'],paths:{
  'dialog.LineToolBarsPattern.style.1':{color:'style.lineColor'},
  'dialog.LineToolBarsPattern.style.2':{mode:BARS_PATTERN_MODE_PATH},
  'dialog.LineToolBarsPattern.style.3':{mirrored:'mirrored'},
  'dialog.LineToolBarsPattern.style.4':{flipped:'flipped'},
 }}],
});
