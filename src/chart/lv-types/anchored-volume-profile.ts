// Anchored volume profile on the pinned native `fixedrangevp` class.
//
// One anchor; the profile covers every bar from the anchor to the latest loaded bar and recomputes on every paint,
// so it follows new bars. The volume-profile computation (row binning, POC, value area, developing series) is the
// native fixed-range class's own compute()/layout(): this type only supplies the span (anchor .. latest bar).
// It paints itself through LV-VELA-DRAWING-PAINT-HOOK-1 so that missing or zero volume is shown as a visible notice
// at the anchor instead of a blank, unselectable drawing (no zero substitution for missing volume).
//
// Defaults: the study inputs and styles. No default colors are recorded, so the renderer colors stay.
// Values with no renderer member are listed in ANCHORED_VOLUME_PROFILE_UNAPPLIED.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import type {UnappliedDefault} from '../drawing-factory-defaults';
import {cloneStyle,fail,inherited,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import type {LvPaintTheme} from '../lv-paint-hook';
import {defineLvDrawingToolModule} from './contract';

export const LV_ANCHORED_VOLUME_PROFILE='lvanchoredvp';
export const ANCHORED_VOLUME_PROFILE_FACT='tool.LineToolAnchoredVolumeProfile.status';

type LineStyle='solid'|'dashed'|'dotted';
export interface FrvpSettings{
 rows:number;valueAreaPct:number;widthPct:number;anchor:'left'|'right';
 upColor:string;downColor:string;vaUpColor:string;vaDownColor:string;
 showVah:boolean;vahColor:string;vahStyle:LineStyle;showVal:boolean;valColor:string;valStyle:LineStyle;
 showPoc:boolean;pocColor?:string;pocStyle:LineStyle;
 showDevelopingPoc:boolean;developingPocColor:string;developingPocStyle:LineStyle;
 showDevelopingVa:boolean;developingVaColor:string;developingVaStyle:LineStyle;
}
interface ProfileRow{price:number;up:number;down:number}
export interface ProfileLayout{
 x0:number;x1:number;anchorX:number;maxW:number;grow:1|-1;
 profile:{rows:ProfileRow[];rowH:number;min:number;maxTotal:number;poc:number;vaFrom:number;vaTo:number};
 yEdges:number[];vahY:number|null;valY:number|null;pocY:number|null;
 developingPoc:[number,number][];developingVaHigh:[number,number][];developingVaLow:[number,number][];
}
interface SpanBar{time:number;open:number;high:number;low:number;close:number;volume:number}
export type ProfileState=
 |{state:'ready';bars:SpanBar[];lastTime:number}
 |{state:'no-bars';message:string}
 |{state:'no-volume';code:'DATA_VOLUME_UNAVAILABLE';message:string}
 |{state:'zero-volume';message:string};
export interface AnchoredVolumeProfileModel extends NativeModel{
 frvp:FrvpSettings;
 layout(proj:Projector):ProfileLayout|null;
 profileState(proj:Projector):ProfileState;
 timeExtent():{min:number;max:number}|null;
 lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:LvPaintTheme):void;
}

/** SDD2#tool.LineToolAnchoredVolumeProfile.status mapped onto the renderer `frvp` members:
 *  inputs rows 24 (Rows Layout "Number Of Rows"), vaVolume 70; graphics volumeProfile percentWidth 30, direction
 *  right_to_left (bars grow leftward from the right edge = renderer anchor "right"); POC visible; VAH and VAL not visible;
 *  styles developingPoc / developingVAHigh / developingVALow not visible (one renderer toggle covers both VA lines). */
export const ANCHORED_VOLUME_PROFILE_SEED=Object.freeze({rows:24,valueAreaPct:70,widthPct:30,anchor:'right' as const,showPoc:true,showVah:false,showVal:false,showDevelopingPoc:false,showDevelopingVa:false});
/** graphics POC / VAH / VAL width 2: the renderer paints all three with style.lineWidth. */
export const ANCHORED_VOLUME_PROFILE_LINE_WIDTH=2;
/** styles developingPoc / developingVAHigh / developingVALow linewidth 1 (painted at this width; the renderer has no member for it). */
export const ANCHORED_VOLUME_PROFILE_DEVELOPING_WIDTH=1;

const NOTICE={
 noBars:'No bars from the anchor yet.',
 noVolume:'Volume data is unavailable: this profile needs volume for every bar from the anchor.',
 zeroVolume:'Every volume value from the anchor is 0, so there is no profile to draw.',
} as const;

const unapplied=(property:string,value:unknown,reason:UnappliedDefault['reason'],note:string):UnappliedDefault=>Object.freeze({toolId:'LineToolAnchoredVolumeProfile',factId:ANCHORED_VOLUME_PROFILE_FACT,property,value,reason,note});
/** Default values with no renderer member (or with no recorded value). */
export const ANCHORED_VOLUME_PROFILE_UNAPPLIED:readonly UnappliedDefault[]=Object.freeze([
 unapplied('colors','blanked','unverified','The client defaults registry (key linetoolanchoredvp) blanks the bar, POC, value-area line and histogram box colors; the renderer colors stay and are OpenCandle/renderer values, not reference facts.'),
 unapplied('volumeProfile.transparencies',[75,75],'unverified','Transparency of the up/down bar colors outside the value area. The base colors are blanked, so no verified color exists to carry it; the renderer colors keep their own alpha.'),
 unapplied('valueArea.transparencies',[30,30],'unverified','Transparency of the up/down bar colors inside the value area. The base colors are blanked, so no verified color exists to carry it; the renderer colors keep their own alpha.'),
 unapplied('rowsLayout.options','Ticks Per Row','renderer','The default Number Of Rows is what the renderer does; the Ticks Per Row option has no renderer member.'),
 unapplied('volume.options',['Total','Delta'],'renderer','The default Up/Down split is what the renderer paints; Total and Delta modes have no renderer member.'),
 unapplied('volumeProfile.showValues',false,'intrinsic','The renderer never prints row volume values, which equals the default.'),
 unapplied('volumeProfile.visible / valueArea.visible',true,'intrinsic','The renderer always paints the histogram and its value-area coloring; there is no toggle.'),
 unapplied('histogramBox.transparency',94,'renderer','The renderer has no histogram box behind the profile.'),
 unapplied('developingPoc.linewidth / developingVAHigh.linewidth / developingVALow.linewidth',1,'renderer','Painted at width 1 by this type, but the renderer has no editable member for it.'),
 unapplied('VAH.width / VAL.width / POC.width',2,'renderer','Applied as the drawing line width 2; the renderer has one shared width member, not one per line.'),
]);

type RawBar=NonNullable<ReturnType<NonNullable<Projector['barsInRange']>>>[number];
/** Span rule (LV): the profile starts at the bar that CONTAINS the anchor, i.e. the last bar whose open time is at or before
 *  the anchor (an anchor after the latest bar's open is inside that forming bar); an anchor before the first loaded bar starts
 *  at the first bar. It ends at the latest loaded bar. The full series is read only when the anchor is not on a bar open. */
function spanBars(proj:Projector,anchor:number):readonly RawBar[]|null{
 const range=proj.barsInRange;if(!range)return null;
 const from=range(anchor,Number.POSITIVE_INFINITY);
 if(from.length>0&&from[0].time===anchor)return from;
 const all=range(Number.NEGATIVE_INFINITY,Number.POSITIVE_INFINITY);
 let start=-1;for(let i=0;i<all.length;i++){if(all[i].time<=anchor)start=i;else break;}
 return all.slice(Math.max(0,start));
}

/** Slice approximations (labelled divergences from the reference, rules.slice_approximations style). */
export const ANCHORED_VOLUME_PROFILE_APPROXIMATIONS=Object.freeze([Object.freeze({
 id:'row-volume-distribution',
 note:"Row binning is the inherited native fixed-range computation: each row touched by a bar's open, high, low or close receives that bar's full volume (no split by price range or lower-timeframe data). No reference fact describes how the reference distributes a bar's volume across rows, so row volumes, POC and value area are an approximation.",
})]);

function defineAnchoredVolumeProfile():DrawingTypeMeta{
 const base=nativeBase('fixedrangevp');
 for(const key of ['anchorSchema','barsInSpan','compute','layout','hitTest','handlePoints','hitHandle','bounds','priceRange','timeExtent','readProps','writeProps','schema','serialize'])method(base.prototype,key);
 const shape=roles(base.sample);
 if(shape.min!==2||shape.max!==2||shape.roles!=='start/end')fail('fixed range volume profile anchor schema changed: '+JSON.stringify(shape));
 const sample=base.sample as unknown as AnchoredVolumeProfileModel;
 const native=sample.frvp as unknown as Record<string,unknown>|undefined;
 const members=['rows','valueAreaPct','widthPct','anchor','showPoc','showVah','showVal','showDevelopingPoc','showDevelopingVa','upColor','downColor','vaUpColor','vaDownColor'];
 if(!native||members.some(key=>!(key in native)))fail('fixed range volume profile settings changed');
 const written=sample.serialize().props as Record<string,unknown>|undefined;
 if(!written||Object.keys(written).sort().join()!==Object.keys(native!).sort().join())fail('fixed range volume profile retained props changed');
 const anchors=Object.getOwnPropertyDescriptor(sample,'anchors');
 if(!anchors||!Object.hasOwn(anchors,'value')||!anchors.writable||!Array.isArray(anchors.value))fail('drawing anchors are not a writable own array');
 if(typeof inherited(base.prototype,'layout').value!=='function')fail('fixed range volume profile layout changed');
 const seeded=()=>({...structuredClone(native!),...ANCHORED_VOLUME_PROFILE_SEED}) as unknown as FrvpSettings;
 const Base=base.ctor as unknown as new(init:Init)=>AnchoredVolumeProfileModel;

 class LvAnchoredVolumeProfile extends Base{
  constructor(init:Init){
   super(init);(this as {type:string}).type=LV_ANCHORED_VOLUME_PROFILE;
   if(init.props===undefined)this.frvp=seeded();
  }
  anchorSchema(){return{min:1,max:1,slots:[{role:'anchor',free:'x' as const}]};}
  /** Missing keys of a retained or partial props bag come from the anchored seeds, not the fixed-range defaults. */
  readProps(props:Record<string,unknown>){(Base.prototype as unknown as {readProps(p:unknown):void}).readProps.call(this,{...seeded(),...props});}
  /** The bars from the anchor to the latest loaded bar, and whether they carry usable volume. */
  profileState(proj:Projector):ProfileState{
   const a=this.anchors[0];
   const raw=a?spanBars(proj,a.time):null;
   if(!raw||raw.length<1)return{state:'no-bars',message:NOTICE.noBars};
   const bars:SpanBar[]=[];let any=false;
   for(const bar of raw){
    const volume=bar.volume;
    if(typeof volume!=='number'||!Number.isFinite(volume)||volume<0)return{state:'no-volume',code:'DATA_VOLUME_UNAVAILABLE',message:NOTICE.noVolume};
    if(volume>0)any=true;
    bars.push({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume});
   }
   if(!any)return{state:'zero-volume',message:NOTICE.zeroVolume};
   return{state:'ready',bars,lastTime:bars[bars.length-1].time};
  }
  /** Native compute() reads its bars here: only bars with complete volume, from the anchor on. */
  barsInSpan(proj:Projector){const s=this.profileState(proj);return s.state==='ready'?s.bars:null;}
  /** The native fixed-range layout over the span anchor .. latest bar (the end anchor is supplied for the call only). */
  layout(proj:Projector):ProfileLayout|null{
   const a=this.anchors[0];if(!a)return null;
   const s=this.profileState(proj);if(s.state!=='ready')return null;
   const own=this.anchors;
   this.anchors=[own[0],{time:s.lastTime,price:own[0].price}];
   try{
    const L=(Base.prototype as unknown as {layout(p:Projector):ProfileLayout|null}).layout.call(this,proj);
    if(L)extents.set(this,{min:a.time,max:s.lastTime});
    return L;
   }finally{this.anchors=own;}
  }
  timeExtent(){const a=this.anchors[0];if(!a)return null;return extents.get(this)??{min:a.time,max:a.time};}
  handlePoints(proj:Projector):[number,number][]{
   const a=this.anchors[0];if(!a)return [];
   const L=this.layout(proj),y=L?.pocY??proj.yOf(a.price,this.paneId);
   return y==null?[]:[[proj.xOf(a.time),y]];
  }
  hitTest(px:number,py:number,proj:Projector,tol:number):boolean{
   if(this.layout(proj))return super.hitTest(px,py,proj,tol);
   const n=this.notice(proj);if(!n)return false;
   if(Math.abs(px-n.x)<=tol&&py>=n.top-tol&&py<=n.top+n.height+tol)return true;
   return px>=n.x&&px<=n.x+n.textWidth+8&&py>=n.top&&py<=n.top+24;
  }
  bounds(proj:Projector){
   if(this.layout(proj))return super.bounds(proj);
   const n=this.notice(proj);return n?{x:n.x,y:n.top,w:n.textWidth+8,h:n.height}:null;
  }
  private notice(proj:Projector){
   const a=this.anchors[0];if(!a)return null;
   const s=this.profileState(proj);if(s.state==='ready')return null;
   const pane=proj.paneRect?.(this.paneId),top=pane?.top??0,height=pane?.height??proj.height;
   return{x:proj.xOf(a.time),top,height,message:s.message,textWidth:s.message.length*7};
  }
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:LvPaintTheme){
   const L=this.layout(proj);
   if(!L){paintNotice(ctx,this.notice(proj),theme);return;}
   paintProfile(ctx,L,this.frvp,Number(this.style.lineWidth)||1,theme);
  }
 }
 const extents=new WeakMap<object,{min:number;max:number}>();
 return{type:lvKey(LV_ANCHORED_VOLUME_PROFILE),group:base.meta.group,label:'Anchored volume profile',icon:base.meta.icon,
  defaultStyle:{...cloneStyle(base.meta),lineWidth:ANCHORED_VOLUME_PROFILE_LINE_WIDTH},create:init=>new LvAnchoredVolumeProfile(init)};
}

const dash=(style:LineStyle,width:number)=>{const w=Math.max(1,width);return style==='dotted'?[w,w*2]:style==='dashed'?[w*4,w*3]:[];};
function transparent(color:string){const c=color.trim().toLowerCase();if(/^#[0-9a-f]{8}$/.test(c))return c.endsWith('00');const m=/rgba?\([^)]*,\s*([\d.]+)\s*\)$/.exec(c);return m?parseFloat(m[1])===0:false;}
/** Black or white ink against the pane background (POC color left unset = theme contrast, as the fixed-range tool). */
function contrast(background:string){
 const hex=/^#([0-9a-f]{6})/i.exec(background.trim());
 let r=0,g=0,b=0;
 if(hex){const v=parseInt(hex[1],16);r=v>>16&255;g=v>>8&255;b=v&255;}
 else{const m=/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(background);if(!m)return '#000000';r=+m[1];g=+m[2];b=+m[3];}
 return (0.299*r+0.587*g+0.114*b)/255>0.55?'#000000':'#ffffff';
}
function line(ctx:CanvasRenderingContext2D,color:string|undefined,width:number,style:LineStyle,points:readonly (readonly [number,number])[]){
 if(!color||points.length<2||transparent(color))return;
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash(style,width));
 ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.stroke();ctx.setLineDash([]);
}
function paintProfile(ctx:CanvasRenderingContext2D,L:ProfileLayout,s:FrvpSettings,width:number,theme:LvPaintTheme){
 const {profile,maxW,anchorX,grow,yEdges}=L;
 if(profile.maxTotal<=0||maxW<=0)return;
 profile.rows.forEach((row,k)=>{
  const total=row.up+row.down;if(total<=0)return;
  const yA=yEdges[k],yB=yEdges[k+1],top=Math.min(yA,yB),h=Math.max(1,Math.abs(yB-yA)-1);
  const w=total/profile.maxTotal*maxW,upW=row.up/total*w,inVa=k>=profile.vaFrom&&k<=profile.vaTo;
  const x=grow===1?anchorX:anchorX-w;
  if(upW>0){ctx.fillStyle=inVa?s.vaUpColor:s.upColor;ctx.fillRect(x,top,upW,h);}
  if(w-upW>0){ctx.fillStyle=inVa?s.vaDownColor:s.downColor;ctx.fillRect(x+upW,top,w-upW,h);}
 });
 const across=(y:number|null):[number,number][]=>y==null?[]:[[L.x0,y],[L.x1,y]];
 ctx.save();
 if(s.showVah)line(ctx,s.vahColor,width,s.vahStyle,across(L.vahY));
 if(s.showVal)line(ctx,s.valColor,width,s.valStyle,across(L.valY));
 if(s.showPoc)line(ctx,s.pocColor??contrast(theme.background),width,s.pocStyle,across(L.pocY));
 const dev=ANCHORED_VOLUME_PROFILE_DEVELOPING_WIDTH;
 if(s.showDevelopingPoc)line(ctx,s.developingPocColor,dev,s.developingPocStyle,L.developingPoc);
 if(s.showDevelopingVa){line(ctx,s.developingVaColor,dev,s.developingVaStyle,L.developingVaHigh);line(ctx,s.developingVaColor,dev,s.developingVaStyle,L.developingVaLow);}
 ctx.restore();
}
/** Missing data stays visible: a dashed guide at the anchor and a one-line notice beside it. */
function paintNotice(ctx:CanvasRenderingContext2D,n:{x:number;top:number;height:number;message:string}|null,theme:LvPaintTheme){
 if(!n)return;
 ctx.save();
 ctx.strokeStyle=theme.textColor;ctx.lineWidth=1;ctx.setLineDash([4,4]);
 ctx.beginPath();ctx.moveTo(n.x,n.top);ctx.lineTo(n.x,n.top+n.height);ctx.stroke();ctx.setLineDash([]);
 ctx.font='12px '+theme.fontFamily;ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=theme.textColor;
 ctx.fillText(n.message,n.x+4,n.top+6);
 ctx.restore();
}

export const ANCHORED_VOLUME_PROFILE_MODULE=defineLvDrawingToolModule({
 id:'anchored-volume-profile',
 types:[{type:LV_ANCHORED_VOLUME_PROFILE,base:'fixedrangevp',define:defineAnchoredVolumeProfile,requiresPaintHook:true}],
 catalog:[{rowId:'DW.VOLUME.ANCHORED_VOLUME_PROFILE',type:LV_ANCHORED_VOLUME_PROFILE,note:'Click to set a point. The profile covers the bars from that point to the latest bar and updates as new bars arrive. Needs volume data.'}],
});
