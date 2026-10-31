// Session volume profile chart type. A time-based type:
// the candles stay (basePainting 'candles') and an LV layer draws one volume profile per session behind them, so the axis,
// drawings, live updates, replay and indicators are those of an ordinary candle chart (indicators compute on the candles).
// Defaults: inputs (profilesSessions All, customSession 0930-1600 exchange time, volume Up/Down /
// Total / Delta, vaVolume 70, extendPocRight / extendVAHRight / extendVALRight false, rowsLayout Number Of Rows, rows 24) and
// styles (volumeProfile showValues false, placement left_to_right, percentWidth 100; POC on solid width 2; VAH and VAL
// off dashed width 2; developing POC and VA off width 1). Colors are LV's (the Session volume profile indicator's histogram
// colors, src/chart/vp-visible-range-presentation.ts, and the TPO level colors); dialog row order is our own choice.
// Construction: the Session volume profile indicator's own code (src/domain/volume-profile.ts buildVolumeProfile,
// developingProfile and sessionProfilePeriods: All = its Extended session, Regular = its Regular session), so for the same
// inputs the rows, POC, VAH and VAL equal the indicator's. Custom sessions use src/domain/profile-sessions.ts. The chart type
// distributes each bar's volume over its own range; it does not load finer bars (the indicator's on-demand
// path belongs to the indicator pipeline), which also keeps it replay-safe: only revealed bars build a profile.
import {registerChartType,registerRendererLayer,type RendererLayerArgs,type RendererLayerInstance} from '@luxalgo/vela';
import type {ChartSettingField} from './chart-settings';
import type {Bar} from '../domain/types';
import {buildVolumeProfile,developingProfile,sessionProfilePeriods,PROFILE_ROWS_LAYOUTS,PROFILE_VOLUME_MODES,type DevelopingLevels,type ProfileOptions,type ProfileRowsLayout,type VolumeProfile} from '../domain/volume-profile';
import {pivotCalendar,type PivotCalendar} from '../domain/indicators-ext/r23-catalog';
import {sessionClockMinutes,sessionRuns,PROFILE_SESSION_MODES,SESSION_CLOCK_OPTIONS,type ProfileSessionMode} from '../domain/profile-sessions';

export const SVP_STYLE='sessionvp';
export const SVP_PLACEMENTS=['Left to right','Right to left'] as const;
const f=(key:string,label:string,kind:ChartSettingField['kind'],extra:Partial<ChartSettingField>={}):ChartSettingField=>({key,label,kind,...extra});
const color=(key:string,label:string)=>f(key,label,'color');
/** Settings rows. Keys follow the reference input and style names where one exists. */
export const SVP_SETTING_FIELDS:readonly ChartSettingField[]=Object.freeze([
 f('profilesSessions','Sessions','select',{options:[...PROFILE_SESSION_MODES]}),
 f('customSessionStart','Custom session start','select',{options:[...SESSION_CLOCK_OPTIONS]}),
 f('customSessionEnd','Custom session end','select',{options:[...SESSION_CLOCK_OPTIONS]}),
 f('rowsLayout','Rows layout','select',{options:[...PROFILE_ROWS_LAYOUTS]}),
 f('rows','Row size','number',{min:1,max:1_000_000,step:1}),
 f('volume','Volume','select',{options:[...PROFILE_VOLUME_MODES]}),
 f('vaVolume','Value area volume (%)','number',{min:0,max:100,step:1}),
 f('percentWidth','Width (%)','number',{min:1,max:100,step:1}),
 f('placement','Placement','select',{options:[...SVP_PLACEMENTS]}),
 f('showValues','Show values','boolean'),
 color('upColor','Up volume color'),color('downColor','Down volume color'),
 color('valueAreaUpColor','Value area up color'),color('valueAreaDownColor','Value area down color'),
 f('poc','POC','boolean'),color('pocColor','POC color'),f('extendPocRight','Extend POC right','boolean'),
 f('vah','VAH','boolean'),f('val','VAL','boolean'),color('valueAreaLineColor','VAH and VAL color'),
 f('extendVAHRight','Extend VAH right','boolean'),f('extendVALRight','Extend VAL right','boolean'),
 f('developingPoc','Developing POC','boolean'),color('developingPocColor','Developing POC color'),
 f('developingVA','Developing VA','boolean'),color('developingVAColor','Developing VA color'),
]);
/** Factory values: behavior defaults from the facts above; colors are LV's (indicator histogram colors with its 25% / 70%
 *  outside / inside value area opacity, TPO POC and value area line colors). */
export const SVP_LV_DEFAULTS:Readonly<Record<string,unknown>>=Object.freeze({
 profilesSessions:'All',customSessionStart:'09:30',customSessionEnd:'16:00',rowsLayout:'Number Of Rows',rows:24,volume:'Up/Down',vaVolume:70,
 percentWidth:100,placement:'Left to right',showValues:false,
 upColor:'#2962FF40',downColor:'#FBC02D40',valueAreaUpColor:'#2962FFB3',valueAreaDownColor:'#FBC02DB3',
 poc:true,pocColor:'#F23645',extendPocRight:false,vah:false,val:false,valueAreaLineColor:'#2962FF',extendVAHRight:false,extendVALRight:false,
 developingPoc:false,developingPocColor:'#FF9800',developingVA:false,developingVAColor:'#2962FF',
});
export const SVP_UNRESOLVED:readonly string[]=Object.freeze([
 'Colors, dialog row order and the Regular session choice are OpenCandle-defined.',
 'Rows, POC and value area are the Session volume profile indicator\'s (All = its Extended session). Each bar\'s volume is spread over its own high-low range: the chart type does not load finer bars, so its rows can differ from the reference where the reference reads lower-timeframe volume.',
 'Price alerts on POC, VAH and VAL come from the Session volume profile indicator; the chart type itself offers no alert sources yet.',
]);
/** Native-data payload on the sessionvp channel (all optional): instrument tick size (Ticks Per Row), declared calendar, exchange zone, chart resolution. */
export interface SvpLayerPayload {tickSize?:number|null;calendar?:PivotCalendar|null;timeZone?:string|null;resolution?:string|null}
export interface SvpProfile {profile:VolumeProfile;developing:DevelopingLevels|null}
export interface SvpResult {profiles:SvpProfile[];error:string|null}

/** The session runs (calculation-bar index ranges) for the settings. */
export function svpSessionRuns(bars:readonly Bar[],settings:Record<string,unknown>,context:SvpLayerPayload={}):{from:number;to:number}[]{
 const values={...SVP_LV_DEFAULTS,...settings},mode=(PROFILE_SESSION_MODES as readonly string[]).includes(String(values.profilesSessions))?values.profilesSessions as ProfileSessionMode:'All';
 const options={resolution:context.resolution??null,calendar:context.calendar??null};
 if(mode!=='Custom')return sessionProfilePeriods(bars,mode==='All'?'Extended':'Regular',options);
 let spacing=Infinity;for(let i=1;i<bars.length;i++){const d=bars[i].time-bars[i-1].time;if(d>0)spacing=Math.min(spacing,d);}
 return sessionRuns(bars,{mode,calendar:pivotCalendar(bars,context.resolution??null,context.calendar??null),timeZone:context.timeZone??null,customStart:sessionClockMinutes(values.customSessionStart)??570,customEnd:sessionClockMinutes(values.customSessionEnd)??960,daily:spacing>=72_000});
}
/** The indicator's ProfileOptions for the settings. */
export function svpProfileOptions(settings:Record<string,unknown>,context:SvpLayerPayload={}):ProfileOptions{
 const values={...SVP_LV_DEFAULTS,...settings};
 return {rowsLayout:String(values.rowsLayout) as ProfileRowsLayout,rowSize:Number(values.rows),valueAreaPct:Number(values.vaVolume),tickSize:context.tickSize??null,lowerTimeframe:null,resolution:context.resolution??null};
}
/** Profiles (bars in seconds). A settings error (Ticks Per Row without a tick size, too many rows) is returned, not thrown. */
export function svpProfilesForSettings(bars:readonly Bar[],settings:Record<string,unknown>,context:SvpLayerPayload={}):SvpResult{
 const values={...SVP_LV_DEFAULTS,...settings},options=svpProfileOptions(values,context),developing=values.developingPoc===true||values.developingVA===true;
 try{
  const profiles:SvpProfile[]=[];
  for(const run of svpSessionRuns(bars,values,context)){const profile=buildVolumeProfile(bars,run.from,run.to,options);if(profile)profiles.push({profile,developing:developing?developingProfile(bars,run.from,run.to,options):null});}
  return {profiles,error:null};
 }catch(error){return {profiles:[],error:error instanceof Error?error.message:String(error)};}
}
const compact=(value:number)=>{const a=Math.abs(value);return a>=1e9?(value/1e9).toFixed(2)+'B':a>=1e6?(value/1e6).toFixed(2)+'M':a>=1e3?(value/1e3).toFixed(2)+'K':String(Math.round(value));};
/** The histogram segments of one row: [length share 0..1 of the widest row, color] in drawing order. */
export function svpRowSegments(row:{up:number;down:number},maxRow:number,mode:string,inside:boolean,settings:Record<string,unknown>):{share:number;color:string}[]{
 if(!(maxRow>0))return [];
 const up=String(inside?settings.valueAreaUpColor:settings.upColor),down=String(inside?settings.valueAreaDownColor:settings.downColor);
 if(mode==='Total')return [{share:(row.up+row.down)/maxRow,color:up}];
 if(mode==='Delta'){const delta=row.up-row.down;return delta===0?[]:[{share:Math.abs(delta)/maxRow,color:delta>0?up:down}];}
 return [{share:row.up/maxRow,color:up},{share:row.down/maxRow,color:down}];
}

class SvpLayer implements RendererLayerInstance{
 private canvas:HTMLCanvasElement|null=null;
 private memo:{bars:readonly unknown[];key:string;length:number;last:unknown;lastJson:string;result:SvpResult}|null=null;
 mount(canvas:HTMLCanvasElement){this.canvas=canvas;canvas.dataset.lvChartType=SVP_STYLE;}
 render(args:RendererLayerArgs){
  const canvas=this.canvas;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);
  if(args.priceStyle!==SVP_STYLE||!args.bars.length){canvas.dataset.lvPaintedProfiles='0';return;}
  const settings={...SVP_LV_DEFAULTS,...args.settings},payload=(args.data??{}) as SvpLayerPayload;
  const key=JSON.stringify([settings.profilesSessions,settings.customSessionStart,settings.customSessionEnd,settings.rowsLayout,settings.rows,settings.vaVolume,settings.developingPoc,settings.developingVA,payload.tickSize??null,payload.calendar??null,payload.timeZone??null,payload.resolution??null]);
  const lastBar=args.bars.at(-1),lastJson=JSON.stringify(lastBar);
  if(!this.memo||this.memo.bars!==args.bars||this.memo.key!==key||this.memo.length!==args.bars.length||this.memo.last!==lastBar||this.memo.lastJson!==lastJson){
   const seconds:Bar[]=args.bars.map(bar=>({time:bar.time/1000,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:Number((bar as {volume?:number}).volume??NaN)}));
   this.memo={bars:args.bars,key,length:args.bars.length,last:lastBar,lastJson,result:svpProfilesForSettings(seconds,settings,payload)};
  }
  canvas.dataset.lvSvpError=this.memo.result.error??'';
  const range=args.coords.visibleLogicalRange(),from=Math.floor(range.from)-1,to=Math.ceil(range.to)+1;
  const x=(index:number)=>args.coords.logicalToX(index),y=(price:number)=>args.coords.priceToY(price,args.scale,args.bounds),spacing=Math.max(1,args.coords.bodySpacing());
  const widthPct=Math.max(1,Math.min(100,Number(settings.percentWidth)||100))/100,rightToLeft=settings.placement==='Right to left',mode=String(settings.volume),chartRight=args.coords.width;
  ctx.save();ctx.scale(args.coords.dpr,args.coords.dpr);ctx.beginPath();ctx.rect(0,args.bounds.top,args.coords.width,args.bounds.height);ctx.clip();
  let painted=0;
  const line=(price:number,ink:unknown,x0:number,x1:number,width:number,dash:number[])=>{const yy=Math.round(y(price))+0.5;ctx.save();ctx.strokeStyle=String(ink);ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x0,yy);ctx.lineTo(x1,yy);ctx.stroke();ctx.restore();};
  const steps=(values:readonly (number|null)[],first:number,ink:unknown)=>{ctx.save();ctx.strokeStyle=String(ink);ctx.lineWidth=1;ctx.beginPath();let open=false;values.forEach((value,k)=>{if(value===null){open=false;return;}const x0=x(first+k)-spacing/2,x1=x(first+k)+spacing/2,yy=Math.round(y(value))+0.5;if(open)ctx.lineTo(x0,yy);else ctx.moveTo(x0,yy);ctx.lineTo(x1,yy);open=true;});ctx.stroke();ctx.restore();};
  for(const {profile,developing} of this.memo.result.profiles){
   if(profile.to<from||profile.from>to)continue;painted++;
   const left=x(profile.from)-spacing/2,right=x(profile.to)+spacing/2,room=Math.max(1,(right-left)*widthPct);
   for(let k=0;k<profile.rows.length;k++){
    const row=profile.rows[k],inside=k>=profile.vaFrom&&k<=profile.vaTo,top=Math.min(y(row.low),y(row.high)),height=Math.max(1,Math.abs(y(row.low)-y(row.high))-1);
    let offset=0;
    for(const segment of svpRowSegments(row,profile.maxRow,mode,inside,settings)){const w=segment.share*room;if(!(w>0))continue;ctx.fillStyle=segment.color;ctx.fillRect(rightToLeft?right-offset-w:left+offset,top,w,height);offset+=w;}
    if(settings.showValues===true&&height>=7){const total=mode==='Delta'?row.up-row.down:row.up+row.down;if(total!==0){ctx.save();ctx.fillStyle=args.theme.textColor??'#787B86';ctx.font=`${Math.max(6,Math.min(10,Math.floor(height)))}px ${args.theme.fontFamily}`;ctx.textBaseline='middle';ctx.textAlign=rightToLeft?'right':'left';ctx.fillText(compact(total),rightToLeft?right-offset-2:left+offset+2,top+height/2);ctx.restore();}}
   }
   if(settings.poc!==false)line(profile.pocPrice,settings.pocColor,left,settings.extendPocRight===true?chartRight:right,2,[]);
   if(settings.vah===true)line(profile.vah,settings.valueAreaLineColor,left,settings.extendVAHRight===true?chartRight:right,2,[6,4]);
   if(settings.val===true)line(profile.val,settings.valueAreaLineColor,left,settings.extendVALRight===true?chartRight:right,2,[6,4]);
   if(developing&&settings.developingPoc===true)steps(developing.poc,profile.from,settings.developingPocColor);
   if(developing&&settings.developingVA===true){steps(developing.vah,profile.from,settings.developingVAColor);steps(developing.val,profile.from,settings.developingVAColor);}
  }
  ctx.restore();canvas.dataset.lvPaintedProfiles=String(painted);canvas.dataset.lvFrames=String(Number(canvas.dataset.lvFrames??0)+1);
 }
 destroy(){this.canvas=null;this.memo=null;}
}
let registered=false;
/** Registers the Session volume profile type (candles kept) and its layer. Idempotent. */
export function registerSessionVolumeProfileChartType(){if(registered)return;registered=true;registerChartType({id:SVP_STYLE,label:'Session volume profile',basePainting:'candles'});registerRendererLayer({id:SVP_STYLE,placement:'below-data',create:()=>new SvpLayer()});}
