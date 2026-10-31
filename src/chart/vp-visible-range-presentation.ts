import type {DrawingBox,DrawingLabel,DrawingLine} from '@luxalgo/vela';
import type {VolumeProfile} from '../domain/volume-profile';
import {indicatorColorOpacity} from './indicator-opacity';

/**
 * The histogram of the Visible range and Periodic volume profile indicators as native boxes (Pine `box.new`
 * shapes, xloc bar_index with fractional logical indices, so a row's length does not depend on session gaps).
 *
 * The row layout is the anchored volume profile painter's rule (src/chart/lv-types/anchored-volume-profile.ts
 * paintProfile): each row's length is its volume over the largest row volume times the maximum width, it grows from the
 * anchor edge, the up part comes first from the row's start and the down part follows it, and rows inside the value
 * area take the value-area colors. The anchored drawing paints on a canvas hook; an indicator can only emit native
 * shapes, so the same layout is emitted as boxes here.
 */
/** Colors: #2962ff up, #fbc02d down with transparencies 75 outside and
 *  30 inside the value area (unverified defaults). */
export const VP_HISTOGRAM_COLORS=Object.freeze({up:'#2962ff',down:'#fbc02d',outsideOpacity:25,insideOpacity:70});
/** At most this many boxes per instance; older periods are dropped first, with a diagnostic. */
export const VP_MAX_BOXES=20000;
/** Each row is inset by this share of its height at the top and the bottom, so neighbouring rows stay apart. */
export const VP_ROW_INSET=0.06;

export interface VpBoxSettings {volume:'Up/Down'|'Total'|'Delta';placement:'Left'|'Right';widthPct:number;
 /** The row colors (opacity already applied); null leaves those rows undrawn. Absent: the default colors. */
 colors?:VpRowColors;
 /** One volume label at the outer end of each row. */
 rowValues?:boolean}
export interface VpRowColors {up:string|null;down:string|null;valueUp:string|null;valueDown:string|null}
/** The default colors as row colors: VP_HISTOGRAM_COLORS with its outside and inside opacities. */
export const VP_DEFAULT_ROW_COLORS:Readonly<VpRowColors>=Object.freeze({up:indicatorColorOpacity(VP_HISTOGRAM_COLORS.up,VP_HISTOGRAM_COLORS.outsideOpacity),down:indicatorColorOpacity(VP_HISTOGRAM_COLORS.down,VP_HISTOGRAM_COLORS.outsideOpacity),valueUp:indicatorColorOpacity(VP_HISTOGRAM_COLORS.up,VP_HISTOGRAM_COLORS.insideOpacity),valueDown:indicatorColorOpacity(VP_HISTOGRAM_COLORS.down,VP_HISTOGRAM_COLORS.insideOpacity)});
/** The row volume label text color. */
export const VP_ROW_LABEL_COLOR='#787b86';
const box=(id:string,left:number,right:number,top:number,bottom:number,color:string):DrawingBox=>({id,paneId:'',xloc:'bar_index',left,right,top,bottom,extend:'none',bgColor:color,borderWidth:0,borderStyle:'solid',textSize:'auto',hAlign:'center',vAlign:'center',wrap:false,fontFamily:'default',bold:false,italic:false});
/** Abbreviated volume (K/M/B, two decimals, trailing zeros removed), the data window's volume style. */
export function compactVolume(value:number):string{
 const a=Math.abs(value),plain=(x:number)=>x.toFixed(2).replace(/\.?0+$/,'');
 return a>=1e9?plain(value/1e9)+' B':a>=1e6?plain(value/1e6)+' M':a>=1e3?plain(value/1e3)+' K':plain(value);
}
const label=(id:string,x:number,y:number,text:string,placement:'Left'|'Right'):DrawingLabel=>({id,paneId:'',xloc:'bar_index',x,y,yloc:'price',text,style:placement==='Left'?'label_left':'label_right',textColor:VP_ROW_LABEL_COLOR,size:'small',textAlign:placement==='Left'?'left':'right',fontFamily:'default',noFill:true});

/** Boxes (and, with rowValues, labels) for one profile. `idOf(role)` must give an instance-owned id. */
export function profileShapes(profile:VolumeProfile,settings:VpBoxSettings,idOf:(role:string)=>string):{boxes:DrawingBox[];labels:DrawingLabel[]}{
 const {volume,placement,widthPct}=settings,out:DrawingBox[]=[],labels:DrawingLabel[]=[],palette=settings.colors??VP_DEFAULT_ROW_COLORS;
 const span=profile.right-profile.left,maxW=span*widthPct/100;
 if(!(maxW>0))return {boxes:out,labels};
 const grow=placement==='Left'?1:-1,anchor=placement==='Left'?profile.left:profile.right;
 const scale=volume==='Delta'?Math.max(0,...profile.rows.map(row=>Math.abs(row.up-row.down))):profile.maxRow;
 if(!(scale>0))return {boxes:out,labels};
 const colors=(inVa:boolean)=>inVa?{up:palette.valueUp,down:palette.valueDown}:{up:palette.up,down:palette.down};
 const at=(from:number,length:number):[number,number]=>{const a=anchor+grow*from,b=anchor+grow*(from+length);return a<b?[a,b]:[b,a];};
 const push=(id:string,from:number,length:number,top:number,bottom:number,color:string|null)=>{if(color===null)return;const [l,r]=at(from,length);out.push(box(idOf(id),l,r,top,bottom,color));};
 profile.rows.forEach((row,k)=>{
  const inset=(row.high-row.low)*VP_ROW_INSET,top=row.high-inset,bottom=row.low+inset,c=colors(k>=profile.vaFrom&&k<=profile.vaTo),total=row.up+row.down;
  const tag=(length:number,value:number)=>{if(settings.rowValues)labels.push(label(idOf(`row:${k}:value`),anchor+grow*length,(row.low+row.high)/2,compactVolume(value),placement));};
  if(volume==='Delta'){const delta=row.up-row.down;if(delta===0)return;const length=Math.abs(delta)/scale*maxW;push(`row:${k}:delta`,0,length,top,bottom,delta>0?c.up:c.down);tag(length,delta);return;}
  if(!(total>0))return;
  const w=total/scale*maxW;
  if(volume==='Total'){push(`row:${k}:total`,0,w,top,bottom,c.up);tag(w,total);return;}
  const upW=row.up/total*w;
  if(upW>0)push(`row:${k}:up`,0,upW,top,bottom,c.up);
  if(w-upW>0)push(`row:${k}:down`,upW,w-upW,top,bottom,c.down);
  tag(w,total);
 });
 return {boxes:out,labels};
}
/** The chart notice when profile bars were distributed from their own high-low range because no finer
 *  bars of the instrument are loaded for them; null when every profile bar used finer bars. */
export function profileDetailNotice(profiles:readonly VolumeProfile[]):string|null{
 let bars=0,lower=0;for(const p of profiles){bars+=p.to-p.from+1;lower+=Math.min(p.lowerTimeframeBars,p.to-p.from+1);}
 if(!bars||lower>=bars)return null;
 if(!lower)return 'No shorter interval of this symbol is loaded, so the volume of each bar is spread evenly over its high-low range. Open the same symbol on a shorter interval to profile real volume at each price.';
 return `Volume at each price comes from finer bars for ${lower} of ${bars} profile bars. No finer bars are loaded for the rest, so their volume is spread evenly over their high-low range.`;
}
/** The pending notice while finer bars load on demand, for every profile kind; null otherwise. An
 *  unavailable answer adds nothing here (the fallback notice covers it). */
export function profileFinerNotice(profiles:readonly VolumeProfile[]):string|null{
 const pending=profiles.find(p=>p.finer?.state==='loading');
 return pending?`Loading ${pending.finer!.interval} bars to place the volume at each price. Until they arrive, the volume of a bar that spans more than one row is spread evenly over its high-low range.`:null;
}
/** Boxes for one profile (labels dropped). */
export function profileBoxes(profile:VolumeProfile,settings:VpBoxSettings,idOf:(role:string)=>string):DrawingBox[]{return profileShapes(profile,settings,idOf).boxes;}

/** Boxes and labels for every profile of an instance, newest kept when the shape cap is reached. */
export function profilesBoxes(profiles:readonly VolumeProfile[],settings:VpBoxSettings,idOf:(role:string)=>string):{boxes:DrawingBox[];labels:DrawingLabel[];diagnostics:string[]}{
 const groups:Array<{boxes:DrawingBox[];labels:DrawingLabel[]}>=[];let count=0,dropped=0;
 for(let p=profiles.length-1;p>=0;p--){const shapes=profileShapes(profiles[p],settings,role=>idOf(`vp:${profiles[p].from}:${role}`)),size=shapes.boxes.length+shapes.labels.length;if(count+size>VP_MAX_BOXES){dropped=p+1;break;}groups.unshift(shapes);count+=size;}
 return {boxes:groups.flatMap(g=>g.boxes),labels:groups.flatMap(g=>g.labels),diagnostics:dropped?[`${dropped} older profile${dropped===1?' is':'s are'} not drawn: the histogram is limited to ${VP_MAX_BOXES} rows. POC, VAH and VAL values remain.`]:[]};
}

/** Extend POC right. `visibleRange`: the one Visible range profile continues to the right edge.
 *  Periodic: each POC continues from its period's last bar to the first later bar whose high-low range reaches it, or to
 *  the right edge when none does. */
export function pocExtensionLines(profiles:readonly VolumeProfile[],bars:readonly {high:number;low:number}[],visibleRange:boolean,style:{color:string;width:number;lineStyle:'solid'|'dashed'|'dotted'},idOf:(role:string)=>string):DrawingLine[]{
 const out:DrawingLine[]=[];
 for(const p of profiles){
  let end=-1;
  if(!visibleRange)for(let i=p.to+1;i<bars.length;i++){const b=bars[i];if(Number.isFinite(b.high)&&Number.isFinite(b.low)&&b.low<=p.pocPrice&&p.pocPrice<=b.high){end=i;break;}}
  out.push({id:idOf(`vp:${p.from}:poc-extension`),paneId:'',xloc:'bar_index',x1:p.to,y1:p.pocPrice,x2:end>=0?end:p.to+1,y2:p.pocPrice,extend:end>=0?'none':'right',color:style.color,invisible:false,width:style.width,style:style.lineStyle,arrowLeft:false,arrowRight:false});
 }
 return out;
}
