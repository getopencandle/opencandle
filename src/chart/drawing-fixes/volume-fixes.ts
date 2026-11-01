// Fixed range volume profile and Anchored VWAP fixes (OpenCandle 0.8.2) on the pinned native classes. Both replace their native
// registration in place (saved records keep their type ids and props); the Anchored volume profile
// (lv-types/anchored-volume-profile.ts) is built on the fixed-range class AFTER this replacement, so it inherits the row fix.
//
// Fixed range volume profile:
//  * Rows: a bar's volume is spread over the rows from its low to its high, each row receiving the share of the bar's price
//    range it overlaps (a bar whose high equals its low puts all of it in one row). The native class added the bar's full
//    volume to each row its open, high, low or close fell in (up to four times the volume) and nothing to the rows between.
//    Without tick or lower-timeframe data, distributing a bar's volume evenly across its high-low range is the standard
//    volume-at-price approximation (OpenCandle-defined weighting: equal volume per unit of price). Up and down volume still
//    split by close against open. The developing POC and value area use the same rows.
//  * Range end: the end anchor is the end of the end bar's PERIOD on the interval the profile was drawn on (stored as
//    frvp.drawnIntervalMs at placement, refreshed when the end handle is dragged), so a profile drawn on 1D and viewed on 1h
//    still counts every hour of its last day. Saved profiles without the value keep the previous end (the end bar's open).
//    A range START inside a coarser bar starts at that bar (containingBarOpen, LV-VELA-DRAWING-FIXES-1 lvContainingBarOpen).
// Anchored VWAP:
//  * The line starts at the bar containing the anchor (containingBarOpen), so an anchor drawn on a finer interval keeps its bar.
//  * Only bars with volume weigh in. Until the cumulative volume from the anchor is above 0 there is no VWAP, so no line is drawn
//    (the native class drew the raw typical price of leading zero-volume bars, and an equal-weight average labelled VWAP when
//    the whole range had no volume). When no bar from the anchor has volume, a short note says so at the anchor.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import {fail,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import {strokePath,namedPx} from '../lv-types/paint-helpers';
import {FIXED,LINEAR,meta,pinned,probeInit} from './fix-pins';

const DAY=86400000;
/** The props key (inside frvp) holding the bar interval, in ms, of the chart a fixed range profile was drawn on. */
export const FRVP_DRAWN_INTERVAL_KEY='drawnIntervalMs';

export interface ProfileBar{time:number;open:number;high:number;low:number;close:number;volume:number}
export interface ProfileRow{price:number;up:number;down:number}
export interface VolumeProfile{rows:ProfileRow[];rowH:number;min:number;maxTotal:number;poc:number;vaFrom:number;vaTo:number}
export interface ProfileResult{profile:VolumeProfile;developingPoc:{time:number;price:number}[];developingVaHigh:{time:number;price:number}[];developingVaLow:{time:number;price:number}[]}

const clampIndex=(k:number,n:number)=>k<0?0:k>=n?n-1:k;
/** Adds one bar's volume to the rows its low..high range covers, each row in proportion to its overlap with that range. */
export function spreadBarVolume(rows:ProfileRow[],min:number,rowH:number,bar:ProfileBar):void{
 const v=bar.volume;if(!(v>0))return;
 const n=rows.length,side=bar.close>=bar.open?'up':'down';
 const lo=Math.min(bar.low,bar.high),hi=Math.max(bar.low,bar.high);if(!Number.isFinite(lo)||!Number.isFinite(hi))return;
 const k0=clampIndex(Math.floor((lo-min)/rowH),n),k1=clampIndex(Math.floor((hi-min)/rowH),n);
 if(!(hi>lo)||k0===k1){rows[k0][side]+=v;return;}
 const span=hi-lo;
 for(let k=k0;k<=k1;k++){
  const bottom=k===k0?lo:min+k*rowH,top=k===k1?hi:min+(k+1)*rowH;
  if(top>bottom)rows[k][side]+=v*(top-bottom)/span;
 }
}
// POC, value area and row layout as the native fixed-range class computes them (ties: lowest POC row; the value area grows one
// row at a time toward the larger neighbour, ties downward).
function findPoc(rows:readonly ProfileRow[]):{poc:number;maxTotal:number}|null{
 let maxTotal=0,poc=0;
 for(let k=0;k<rows.length;k++){const t=rows[k].up+rows[k].down;if(t>maxTotal){maxTotal=t;poc=k;}}
 return maxTotal>0?{poc,maxTotal}:null;
}
function growValueArea(rows:readonly ProfileRow[],poc:number,valueAreaFrac:number):{vaFrom:number;vaTo:number}{
 const n=rows.length;let total=0,maxTotal=0;
 for(let k=0;k<n;k++){const t=rows[k].up+rows[k].down;total+=t;if(t>maxTotal)maxTotal=t;}
 const target=total*Math.min(1,Math.max(0,valueAreaFrac));
 let vaFrom=poc,vaTo=poc,acc=maxTotal;
 while(acc<target&&(vaFrom>0||vaTo<n-1)){
  const below=vaFrom>0?rows[vaFrom-1].up+rows[vaFrom-1].down:-1,above=vaTo<n-1?rows[vaTo+1].up+rows[vaTo+1].down:-1;
  if(above>below){vaTo++;acc+=above;}else{vaFrom--;acc+=below;}
 }
 return{vaFrom,vaTo};
}
/** The volume profile of `bars` in `rowCount` equal price rows over the range of the bars with volume (null without volume). */
export function buildVolumeProfile(bars:readonly ProfileBar[],rowCount:number,valueAreaFrac:number):VolumeProfile|null{
 let min=Infinity,max=-Infinity;
 for(const b of bars){if(!(b.volume>0))continue;if(b.low<min)min=b.low;if(b.high>max)max=b.high;}
 if(!Number.isFinite(min))return null;
 const n=max>min?Math.max(1,Math.round(rowCount)):1,rowH=max>min?(max-min)/n:1;
 const rows=Array.from({length:n},(_,k)=>({price:min+k*rowH,up:0,down:0}));
 for(const b of bars)spreadBarVolume(rows,min,rowH,b);
 const pocInfo=findPoc(rows);if(!pocInfo)return null;
 const {vaFrom,vaTo}=growValueArea(rows,pocInfo.poc,valueAreaFrac);
 return{rows,rowH,min,maxTotal:pocInfo.maxTotal,poc:pocInfo.poc,vaFrom,vaTo};
}
/** The profile plus, when asked, the developing POC and value-area edges bar by bar (same rows as the final profile). */
export function computeVolumeProfile(bars:readonly ProfileBar[],rowCount:number,valueAreaFrac:number,wantDeveloping:boolean):ProfileResult|null{
 const profile=buildVolumeProfile(bars,rowCount,valueAreaFrac);if(!profile)return null;
 const out:ProfileResult={profile,developingPoc:[],developingVaHigh:[],developingVaLow:[]};
 if(!wantDeveloping)return out;
 const {min,rowH}=profile,rows=profile.rows.map((_,k)=>({price:min+k*rowH,up:0,down:0}));
 for(const bar of bars){
  spreadBarVolume(rows,min,rowH,bar);
  const pocInfo=findPoc(rows);if(!pocInfo)continue;
  const {vaFrom,vaTo}=growValueArea(rows,pocInfo.poc,valueAreaFrac);
  out.developingPoc.push({time:bar.time,price:rows[pocInfo.poc].price+rowH/2});
  out.developingVaHigh.push({time:bar.time,price:rows[vaTo].price+rowH});
  out.developingVaLow.push({time:bar.time,price:rows[vaFrom].price});
 }
 return out;
}
/** The last time inside the period of a bar opening at `end` on an interval of `intervalMs` (`end` itself without an interval).
 *  Intervals of 28 days or more are calendar months (UTC), so a monthly end bar covers its whole month. */
export function rangeEndTime(end:number,intervalMs:unknown):number{
 if(typeof intervalMs!=='number'||!(intervalMs>0)||!Number.isFinite(end))return end;
 if(intervalMs>=28*DAY){const d=new Date(end);d.setUTCMonth(d.getUTCMonth()+Math.max(1,Math.round(intervalMs/(30.436875*DAY))));return d.getTime()-1;}
 return end+intervalMs-1;
}
/** The open time of the loaded bar whose period contains `time` (LV-VELA-DRAWING-FIXES-1 lvContainingBarOpen), or `time`. A range
 *  computed from a start bar starts on the bar that contains its start; Position and Bars pattern read plain barsInRange. */
export function containingBarOpen(proj:Projector,time:number):number{
 const read=(proj as {lvContainingBarOpen?:unknown}).lvContainingBarOpen;
 if(typeof read!=='function')return time;
 const open=read(time);return typeof open==='number'&&Number.isFinite(open)?open:time;
}
const projectorInterval=(proj:Projector)=>{const v=(proj as {lvIntervalMs?:unknown}).lvIntervalMs;return typeof v==='number'&&v>0&&Number.isFinite(v)?v:null;};

type RawBar={time:number;open:number;high:number;low:number;close:number;volume?:number};
type Layout={x0:number;x1:number;anchorX:number;maxW:number;grow:1|-1}&Record<string,unknown>;
interface FrvpModel extends NativeModel{
 frvp:Record<string,unknown>&{rows:number;valueAreaPct:number;widthPct:number;showDevelopingPoc:boolean;showDevelopingVa:boolean};
 cachedRange:{min:number;max:number}|null;
 barsInSpan(proj:Projector):ProfileBar[]|null;
 compute(proj:Projector):ProfileResult|null;
 layout(proj:Projector):Layout|null;
 onPlaced(proj:Projector):void;
 constrainHandleDrag(index:number):void;
}
export function defineFixedRangeVolumeProfile():DrawingTypeMeta{
 const base=pinned('fixedrangevp',['barsInSpan','compute','layout','onPlaced','constrainHandleDrag','readProps','writeProps']);
 const Base=base.ctor as unknown as new(init:Init)=>FrvpModel;
 // Pin: the native rows add the full volume to each row an open, high, low or close falls in (rows 0, 1 and 3 of 4 here).
 const sample=new Base(probeInit([{time:0,price:0},{time:10,price:0}]));sample.frvp.rows=4;
 const probe={...LINEAR,barsInRange:()=>[{time:0,open:1,high:4,low:0,close:3,volume:10}]} as unknown as Projector;
 const native=sample.compute(probe)?.profile.rows.map(row=>row.up+row.down).join();
 if(native!=='10,10,0,10')fail('fixed range volume profile rows changed: '+native);
 const endMoved=new WeakSet<object>(),lastTimes=new WeakMap<object,number>();
 class LvFixedRangeVolumeProfile extends Base{
  /** Bars from the start anchor to the end of the end bar's period (see rangeEndTime), volume missing = 0 as natively. */
  barsInSpan(proj:Projector):ProfileBar[]|null{
   const [a,b]=this.anchors;if(!a||!b)return null;
   const interval=projectorInterval(proj);
   if(endMoved.has(this)&&interval!==null){this.frvp[FRVP_DRAWN_INTERVAL_KEY]=interval;endMoved.delete(this);}
   const from=containingBarOpen(proj,Math.min(a.time,b.time)),to=rangeEndTime(Math.max(a.time,b.time),this.frvp[FRVP_DRAWN_INTERVAL_KEY]);
   const raw=(proj.barsInRange?.(from,to)??null) as readonly RawBar[]|null;
   if(!raw||raw.length<1)return null;
   lastTimes.set(this,raw[raw.length-1].time);
   return raw.map(bar=>({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume??0}));
  }
  compute(proj:Projector):ProfileResult|null{
   const bars=this.barsInSpan(proj);if(!bars)return null;
   const s=this.frvp,result=computeVolumeProfile(bars,s.rows,s.valueAreaPct/100,s.showDevelopingPoc||s.showDevelopingVa);
   if(result)this.cachedRange={min:result.profile.min,max:result.profile.min+result.profile.rowH*result.profile.rows.length};
   return result;
  }
  /** The native layout; the right edge reaches the last counted bar when that bar lies past the end anchor (finer interval). */
  layout(proj:Projector):Layout|null{
   lastTimes.delete(this);
   const L=super.layout(proj),last=lastTimes.get(this);if(!L||last===undefined)return L;
   const x=proj.xOf(last);if(!(Number.isFinite(x)&&x>L.x1))return L;
   const maxW=Math.max(1,Math.min(100,Math.max(0,this.frvp.widthPct))/100*(x-L.x0));
   return{...L,x1:x,maxW,anchorX:L.grow===1?L.x0:x};
  }
  /** Records the interval the profile is drawn on. */
  onPlaced(proj:Projector):void{
   super.onPlaced(proj);
   const interval=projectorInterval(proj);if(interval!==null)this.frvp[FRVP_DRAWN_INTERVAL_KEY]=interval;
  }
  /** Dragging the end (later) handle makes the current chart's interval the drawn interval (read on the next paint). */
  constrainHandleDrag(index:number):void{
   super.constrainHandleDrag(index);
   const me=this.anchors[index],other=this.anchors[1-index];
   if(me&&other&&me.time>=other.time)endMoved.add(this);
  }
 }
 Object.defineProperties(LvFixedRangeVolumeProfile.prototype,FIXED);
 return meta(base,init=>new LvFixedRangeVolumeProfile(init));
}

// ---------------------------------------------------------------- anchored VWAP

export interface VwapSample{time:number;mid:number;upper:number;lower:number}
/** Volume-weighted typical price (h + l + c) / 3 from the first bar, with a band of `mult` volume-weighted standard deviations.
 *  Bars without volume add nothing; no sample is written before the cumulative volume is above 0. */
export function anchoredVwapSamples(bars:readonly {time:number;high:number;low:number;close:number;volume?:number}[],mult:number):VwapSample[]{
 let cumW=0,cumPV=0,cumP2V=0;const out:VwapSample[]=[];
 for(const b of bars){
  const v=typeof b.volume==='number'&&b.volume>0&&Number.isFinite(b.volume)?b.volume:0,tp=(b.high+b.low+b.close)/3;
  if(v>0&&Number.isFinite(tp)){cumW+=v;cumPV+=tp*v;cumP2V+=tp*tp*v;}
  if(!(cumW>0))continue;
  const mid=cumPV/cumW,dev=Math.sqrt(Math.max(0,cumP2V/cumW-mid*mid))*mult;
  out.push({time:b.time,mid,upper:mid+dev,lower:mid-dev});
 }
 return out;
}
/** The note shown at the anchor when no bar from it has volume. */
export const ANCHORED_VWAP_NO_VOLUME='No volume from the anchor, so there is no VWAP to draw.';
const NOTE_PX=12;

type Pt=[number,number];
interface VwapStyle{midColor:string;midStyle:string;multiplier:number;upperColor:string;upperStyle:string;lowerColor:string;lowerStyle:string;bandFill:string}
interface VwapModel extends NativeModel{
 vwap:VwapStyle;cachedRange:{min:number;max:number}|null;cachedExtent:{min:number;max:number}|null;
 series(proj:Projector):VwapSample[]|null;
 layout(proj:Projector):{mid:Pt[];upper:Pt[];lower:Pt[]}|null;
 hitTest(px:number,py:number,proj:Projector,tol:number):boolean;
 bounds(proj:Projector):{x:number;y:number;w:number;h:number}|null;
 handlePoints(proj:Projector):Pt[];
}
function transparent(color:string){const c=color.trim().toLowerCase();if(/^#[0-9a-f]{8}$/.test(c))return c.endsWith('00');const m=/rgba?\([^)]*,\s*([\d.]+)\s*\)$/.exec(c);return m?parseFloat(m[1])===0:false;}
function polyline(ctx:CanvasRenderingContext2D,pts:readonly Pt[],style:{lineColor:string;lineWidth:number;lineStyle:string}){
 if(pts.length<2||transparent(style.lineColor))return;
 strokePath(ctx,style,()=>{ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);});
}
export function defineAnchoredVwap():DrawingTypeMeta{
 const base=pinned('anchoredvwap',['series','layout','hitTest','handlePoints','bounds','priceRange','timeExtent']);
 const Base=base.ctor as unknown as new(init:Init)=>VwapModel;
 // Pin: with no volume at all the native series still returns a line (an equal-weight average).
 const flat=[0,1].map(i=>({time:i,open:100,high:110,low:90,close:100+i,volume:0}));
 const sample=new Base(probeInit([{time:0,price:100}]));
 if(!sample.vwap||typeof sample.vwap.multiplier!=='number'||(sample.series({...LINEAR,barsInRange:()=>flat} as unknown as Projector)?.length??0)!==2)fail('anchored vwap series changed');
 const noVolume=new WeakSet<object>();
 class LvAnchoredVwap extends Base{
  series(proj:Projector):VwapSample[]|null{
   noVolume.delete(this);
   const a=this.anchors[0];if(!a)return null;
   const bars=(proj.barsInRange?.(containingBarOpen(proj,a.time),Number.POSITIVE_INFINITY)??null) as readonly RawBar[]|null;
   if(!bars||bars.length<1)return null;
   const pts=anchoredVwapSamples(bars,this.vwap.multiplier);
   if(pts.length<1){noVolume.add(this);this.cachedRange=null;return null;}
   let min=Infinity,max=-Infinity;for(const p of pts){if(p.lower<min)min=p.lower;if(p.upper>max)max=p.upper;}
   this.cachedRange={min,max};this.cachedExtent={min:pts[0].time,max:pts[pts.length-1].time};
   return pts;
  }
  /** The note box at the anchor when the range has no volume, else null. */
  private note(proj:Projector):{x:number;y:number;w:number;h:number}|null{
   if(this.layout(proj)||!noVolume.has(this))return null;
   const a=this.anchors[0],y=a?proj.yOf(a.price,this.paneId):null;if(!a||y==null)return null;
   return{x:proj.xOf(a.time)+6,y:y-NOTE_PX/2-2,w:ANCHORED_VWAP_NO_VOLUME.length*NOTE_PX*0.6,h:NOTE_PX+4};
  }
  hitTest(px:number,py:number,proj:Projector,tol:number):boolean{
   if(super.hitTest(px,py,proj,tol))return true;
   const n=this.note(proj);return !!n&&px>=n.x-tol&&px<=n.x+n.w+tol&&py>=n.y-tol&&py<=n.y+n.h+tol;
  }
  bounds(proj:Projector){return super.bounds(proj)??this.note(proj);}
  /** The native Anchored VWAP painting (band fill, band edges, VWAP line) and its text label, or the no-volume note. */
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:{fontFamily:string;textColor:string;background:string}):void{
   const L=this.layout(proj);
   if(!L){
    const n=this.note(proj);if(!n)return;
    ctx.save();ctx.font=`${NOTE_PX}px ${theme.fontFamily}`;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=theme.textColor;
    ctx.fillText(ANCHORED_VWAP_NO_VOLUME,n.x,n.y+n.h/2);ctx.restore();return;
   }
   const s=this.vwap,w=Number(this.style.lineWidth)||1;
   if(L.upper.length>=2&&s.bandFill){
    ctx.save();ctx.fillStyle=s.bandFill;ctx.beginPath();ctx.moveTo(L.upper[0][0],L.upper[0][1]);
    for(let i=1;i<L.upper.length;i++)ctx.lineTo(L.upper[i][0],L.upper[i][1]);
    for(let i=L.lower.length-1;i>=0;i--)ctx.lineTo(L.lower[i][0],L.lower[i][1]);
    ctx.closePath();ctx.fill();ctx.restore();
   }
   polyline(ctx,L.upper,{lineColor:s.upperColor,lineWidth:w,lineStyle:s.upperStyle});
   polyline(ctx,L.lower,{lineColor:s.lowerColor,lineWidth:w,lineStyle:s.lowerStyle});
   polyline(ctx,L.mid,{lineColor:s.midColor,lineWidth:w,lineStyle:s.midStyle});
   // The text label as the native painter writes it for this type: left-aligned from the first handle, with a halo.
   const text=this.text as {value?:string;size?:string;bold?:boolean;italic?:boolean;color?:string}|undefined,at=this.handlePoints(proj)[0];
   if(!text?.value||!at)return;
   const fs=namedPx(text.size),lh=Math.round(fs*1.4),lines=text.value.split('\n');
   ctx.save();ctx.font=`${text.bold?'bold ':''}${text.italic?'italic ':''}${fs}px ${theme.fontFamily}`;ctx.textBaseline='top';ctx.textAlign='left';
   ctx.lineJoin='round';ctx.lineWidth=3;ctx.strokeStyle=theme.background;lines.forEach((line,i)=>ctx.strokeText(line,at[0],at[1]+i*lh));
   ctx.fillStyle=text.color??theme.textColor;lines.forEach((line,i)=>ctx.fillText(line,at[0],at[1]+i*lh));
   ctx.restore();
  }
 }
 Object.defineProperties(LvAnchoredVwap.prototype,FIXED);
 return meta(base,init=>new LvAnchoredVwap(init));
}
