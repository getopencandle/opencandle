import type {Bar,NumericSeries} from '../types';
import type {CatalogDefinition,CatalogInput} from '../indicator-catalog';
import {parseInterval} from '../intervals';
import {createVwapDeviationAccumulator,vwapDeviationBounds,type VwapBandMode} from '../vwap-stdev-bands';
import {vwapPercentageBounds} from '../vwap-percentage';
import {sessionMinute,tradingSessionClock,tradingSessionDay} from './trading-sessions';
import {TRADING_SESSION_DEFAULT_WINDOWS} from './trading-sessions-catalog';

/**
 * Built-ins: Anchored VWAP (one VWAP from a chosen anchor bar, with deviation or percentage bands), Session VWAPs (one VWAP
 * per Tokyo, London and New York session), Opening range breakout and Relative volume. Calculations are original OpenCandle
 * code written from the cited published definitions; no third-party script source was copied. Anything a cited rule leaves
 * open is our own choice, marked OpenCandle-defined and listed in `unknownDefaults`.
 */
export const VWAP_SESSION_INDICATOR_IDS=['avwap','sessionvwap','orb','relvolume'] as const;
export type VwapSessionIndicatorId=typeof VWAP_SESSION_INDICATOR_IDS[number];

/** LV palette entries (src/chart/indicator-settings.ts LV_INDICATOR_PALETTE / LV_HISTOGRAM_COLORS / LV_GUIDE_COLOR). */
const C=Object.freeze({cyan:'#4fc3d9',amber:'#f5b14c',violet:'#b48cf2',green:'#7fd17a',blue:'#6e9cf2',pink:'#e88ad8',up:'#3fbf8f',down:'#e8605a',guide:'#8a92a6'});
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const nulls=(n:number):(number|null)[]=>new Array<number|null>(n).fill(null);
const DAY=86400;
const SOURCE:CatalogInput={key:'source',title:'Source',type:'string',defval:'hlc3',options:['open','high','low','close','hl2','hlc3','ohlc4']};
const LV='public-indicator-definition:';

/** Seconds of an intraday (second or minute) chart interval; refuses daily and longer, event and undeclared intervals. */
export function intradayIntervalSeconds(resolution:string|null|undefined,name:string):number{
 let spec:ReturnType<typeof parseInterval>|null=null;try{spec=typeof resolution==='string'?parseInterval(resolution):null;}catch{spec=null;}
 if(!spec)throw new Error(`${name} needs a declared intraday interval.`);
 if(spec.kind!=='time'||spec.unit!=='second'&&spec.unit!=='minute'||!finite(spec.seconds)||spec.seconds<=0)throw new Error(`${name} works on intraday charts only and is not available on this interval.`);
 return spec.seconds;
}
/** The exchange clock of a catalog chart: New York for US equities, UTC for 24/7 and unknown sources (the 0.8.1 VWAP rule). */
const exchangeZoneOf=(calendar:string|null|undefined)=>calendar==='us-equity'?'America/New_York':'UTC';

// ---- Anchored VWAP ----
const ANCHOR_TEXT=/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(Z)?)?$/;
/** Legend and data notice of an instance that has no anchor yet (new instances wait for a click on the chart). */
export const AVWAP_UNANCHORED_MESSAGE='Click a bar to set the anchor.';
/** The instant (seconds) of "YYYY-MM-DD", "YYYY-MM-DD HH:mm" or "YYYY-MM-DD HH:mm:ss" read as a wall clock in `zone` (a
 *  trailing Z reads the time in UTC instead); null for a blank anchor (not anchored yet). A wall time skipped by a DST change
 *  resolves to the instant one offset later and a repeated one to its first occurrence (OpenCandle-defined). */
export function anchorInstant(text:string,zone:string):number|null{
 if(typeof text!=='string'||text.length>40)throw new Error('The anchor must be YYYY-MM-DD or YYYY-MM-DD HH:mm.');
 const trimmed=text.trim();if(!trimmed)return null;
 const match=ANCHOR_TEXT.exec(trimmed);if(!match)throw new Error('The anchor must be YYYY-MM-DD or YYYY-MM-DD HH:mm, or click a bar to set it.');
 const [y,m,d,h,mi,se]=[1,2,3,4,5,6].map(k=>Number(match[k]??0));
 if(m<1||m>12||d<1||d>31||h>23||mi>59||se>59)throw new Error('The anchor date or time is out of range.');
 const date=new Date(0);date.setUTCFullYear(y,m-1,d);date.setUTCHours(h,mi,se,0);
 if(date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw new Error('The anchor date does not exist.');
 const wall=date.getTime()/1000;if(match[7])return wall;
 const clock=tradingSessionClock(zone),offsetAt=(time:number)=>{const local=clock(time);return local.day*DAY+local.minute*60-Math.floor(time/60)*60;};
 const first=wall-offsetAt(wall);return wall-offsetAt(first);
}
/** The anchor text of the bar opening at `time` (a clicked bar): its wall clock in `zone`, "YYYY-MM-DD HH:mm" plus ":ss" when
 *  the bar opens off the minute. anchorInstant reads it back to the same instant, so the anchor bar is that bar; a bar in the
 *  hour a DST change repeats, whose wall time would read back to the first occurrence, is written in UTC with a Z. */
export function anchorTextAt(time:number,zone:string):string{
 if(!finite(time))throw new Error('The anchor bar has no time.');
 const local=tradingSessionClock(zone)(time),seconds=((Math.floor(time)%60)+60)%60,date=new Date(local.day*DAY*1000),pad=(value:number)=>String(value).padStart(2,'0');
 const text=`${String(date.getUTCFullYear()).padStart(4,'0')}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())} ${pad(Math.floor(local.minute/60))}:${pad(local.minute%60)}`;
 const wall=seconds?text+':'+pad(seconds):text;
 if(anchorInstant(wall,zone)===Math.floor(time))return wall;
 const utc=new Date(Math.floor(time)*1000).toISOString();return utc.slice(0,10)+' '+utc.slice(11,seconds?19:16)+'Z';
}
/** The exchange clock the anchor text of a chart is read in (New York for US equities, UTC otherwise). */
export const anchorZoneOf=(calendar:string|null|undefined)=>exchangeZoneOf(calendar);
/** End (exclusive, seconds) of the chart bar opening at `time` for the declared interval; null when the length is unknown. */
function barEnd(time:number,resolution:string|null|undefined):number|null{
 let spec:ReturnType<typeof parseInterval>;try{if(typeof resolution!=='string')return null;spec=parseInterval(resolution);}catch{return null;}
 if(spec.kind!=='time')return null;
 if(spec.seconds!==null)return time+spec.seconds;
 if(spec.unit==='day')return time+spec.multiplier*DAY;
 if(spec.unit==='week')return time+spec.multiplier*7*DAY;
 const date=new Date(time*1000);date.setUTCMonth(date.getUTCMonth()+spec.multiplier);return date.getTime()/1000;
}
/** The anchor bar: the bar holding the anchor instant, or the first bar after it when the instant falls in a gap; the first
 *  bar at or after the instant when the bar length is unknown; bars.length (nothing drawn) for a blank anchor or when no
 *  loaded bar is at or after it. It depends only on the bar's own time, so a prefix finds the same bar (no look-ahead), and
 *  older history loaded before the anchor never moves it. */
export function anchoredVwapIndex(bars:readonly Bar[],anchor:number|null,resolution:string|null|undefined):number{
 if(anchor===null)return bars.length;
 for(let i=0;i<bars.length;i++){const time=bars[i].time,end=barEnd(time,resolution);if(end===null?time>=anchor:anchor<end)return i;}
 return bars.length;
}
export interface VwapBand {enabled:boolean;multiplier:number}
export interface AnchoredVwapSeries {vwap:NumericSeries;upper1:NumericSeries;lower1:NumericSeries;upper2:NumericSeries;lower2:NumericSeries;upper3:NumericSeries;lower3:NumericSeries}
/**
 * VWAP = sum(price x volume) / sum(volume) from the anchor bar on (Berkowitz, Logue and Noser 1988), summed exactly as the
 * VWAP built-in sums its session. Standard Deviation bands use the shared volume-weighted population deviation around the
 * anchored VWAP (src/domain/vwap-stdev-bands.ts, West's weighted update); Percentage bands are VWAP +/- |VWAP| x multiplier / 100
 * (src/domain/vwap-percentage.ts). A bar with an unusable price or volume is unavailable and the sums continue past it.
 */
export function anchoredVwapSeries(bars:readonly Bar[],prices:readonly (number|null)[],from:number,mode:VwapBandMode,bands:readonly VwapBand[]):AnchoredVwapSeries{
 const n=bars.length,out:AnchoredVwapSeries={vwap:nulls(n),upper1:nulls(n),lower1:nulls(n),upper2:nulls(n),lower2:nulls(n),upper3:nulls(n),lower3:nulls(n)};
 const deviation=createVwapDeviationAccumulator(),uppers=[out.upper1,out.upper2,out.upper3],lowers=[out.lower1,out.lower2,out.lower3];
 let volume=0,weighted=0;
 for(let i=Math.max(0,from);i<n;i++){
  const price=prices[i],size=bars[i].volume,sd=mode==='Standard Deviation'?deviation.push(price??NaN,size,i===from):null;
  if(!finite(price)||!finite(size)||size<0)continue;
  volume+=size;weighted+=price*size;if(volume===0)continue;
  const value=weighted/volume;out.vwap[i]=value;
  bands.forEach((band,k)=>{if(!band.enabled)return;let pair:{upper:number;lower:number}|null=null;
   try{pair=mode==='Standard Deviation'?vwapDeviationBounds(value,sd,band.multiplier):vwapPercentageBounds(value,band.multiplier);}catch{pair=null;}
   if(pair){uppers[k][i]=pair.upper;lowers[k][i]=pair.lower;}});
 }
 return out;
}

// ---- Session VWAPs ----
export interface SessionVwapWindow {start:string;end:string;zone:string}
/** One session VWAP: restarts on the first bar of each session and is unavailable outside the window. Membership is the
 *  tradingsessions rule (bar open time in the window's own clock, start-inclusive, end-exclusive, DST-aware). With `band`,
 *  the band is VWAP +/- band x the volume-weighted population deviation of the session. */
export function sessionVwapSeries(bars:readonly Bar[],prices:readonly (number|null)[],window:SessionVwapWindow,band:number|null):{vwap:NumericSeries;upper:NumericSeries;lower:NumericSeries}{
 const n=bars.length,vwap=nulls(n),upper=nulls(n),lower=nulls(n),clock=tradingSessionClock(window.zone),start=sessionMinute(window.start),end=sessionMinute(window.end),deviation=createVwapDeviationAccumulator();
 let session:number|null=null,volume=0,weighted=0;
 for(let i=0;i<n;i++){
  const local=clock(bars[i].time),day=tradingSessionDay(local.day,local.minute,start,end);if(day===null)continue;
  const reset=day!==session;if(reset){session=day;volume=0;weighted=0;}
  const price=prices[i],size=bars[i].volume,sd=band!==null?deviation.push(price??NaN,size,reset):null;
  if(!finite(price)||!finite(size)||size<0)continue;
  volume+=size;weighted+=price*size;if(volume===0)continue;
  const value=weighted/volume;vwap[i]=value;
  if(band!==null){const pair=vwapDeviationBounds(value,sd,band);if(pair){upper[i]=pair.upper;lower[i]=pair.lower;}}
 }
 return {vwap,upper,lower};
}
const SESSION_KEYS=['tokyo','london','newYork'] as const;

// ---- Opening range breakout ----
export interface OpeningRangeSeries {high:NumericSeries;low:NumericSeries;mid:NumericSeries;up1:NumericSeries;up2:NumericSeries;down1:NumericSeries;down2:NumericSeries;breakUp:NumericSeries;breakDown:NumericSeries}
/**
 * Opening range in the common charting convention: the high and low of the bars that open in the first `duration` minutes of
 * the session, and a breakout as the first close beyond that range. This is not Crabel's original method, which enters by
 * stop orders one "stretch" (the 10-day average of |open - nearest extreme of the day|) beyond the opening, with no wait for a
 * close; no stretch is used here. The lines
 * start on the first session bar opening at or after the range end (the range bars have all closed by then, so no look-ahead)
 * and run to the session end. Midpoint = (high + low) / 2; targets = high + k x range and low - k x range (k = 1, 2).
 * Breakout up (down) is the first close of the session above the high (below the low) after the range, valued at that close.
 * A range bar with an invalid price leaves that session without lines (OpenCandle-defined).
 */
export function openingRangeSeries(bars:readonly Bar[],session:{start:number;end:number;zone:string},duration:number):OpeningRangeSeries{
 const n=bars.length,out:OpeningRangeSeries={high:nulls(n),low:nulls(n),mid:nulls(n),up1:nulls(n),up2:nulls(n),down1:nulls(n),down2:nulls(n),breakUp:nulls(n),breakDown:nulls(n)};
 const clock=tradingSessionClock(session.zone);let day:number|null=null,high=-Infinity,low=Infinity,count=0,bad=false,up=false,down=false;
 for(let i=0;i<n;i++){
  const bar=bars[i],local=clock(bar.time),current=tradingSessionDay(local.day,local.minute,session.start,session.end);if(current===null)continue;
  if(current!==day){day=current;high=-Infinity;low=Infinity;count=0;bad=false;up=false;down=false;}
  const offset=((local.minute-session.start)%1440+1440)%1440;
  if(offset<duration){count++;if(finite(bar.high)&&finite(bar.low)&&bar.high>=bar.low){high=Math.max(high,bar.high);low=Math.min(low,bar.low);}else bad=true;continue;}
  if(!count||bad)continue;
  const range=high-low;out.high[i]=high;out.low[i]=low;out.mid[i]=(high+low)/2;out.up1[i]=high+range;out.up2[i]=high+2*range;out.down1[i]=low-range;out.down2[i]=low-2*range;
  if(finite(bar.close)){if(!up&&bar.close>high){up=true;out.breakUp[i]=bar.close;}if(!down&&bar.close<low){down=true;out.breakDown[i]=bar.close;}}
 }
 return out;
}
export const ORB_DURATIONS=['5','15','30','60'] as const;
export const ORB_SESSIONS=['Exchange','Custom'] as const;

// ---- Relative volume ----
/** RVOL = volume / the SMA of the `length` bars with volume before the current bar (the cited rule: volume against the average
 *  of the preceding bars; OpenCandle-defined (common practice) beyond that, the ratio has no single author). The current bar is
 *  left out of its own baseline, so a spike is measured against normal volume and RVOL is not capped at `length`. `ma` is that
 *  same prior-bars average, so the line and the ratio agree. `high` is 1 when RVOL >= threshold, else 0; a bar with missing
 *  volume or a zero average is unavailable. */
export function relativeVolumeSeries(volumes:readonly (number|null)[],sma:(values:readonly (number|null)[],period:number)=>NumericSeries,length:number,threshold:number):{volume:NumericSeries;ma:NumericSeries;rvol:NumericSeries;high:NumericSeries}{
 const volume=volumes.map(value=>finite(value)&&value>=0?value:null),rolling=sma(volume,length),ma=nulls(volume.length);
 // The SMA at the latest earlier bar with volume covers exactly the `length` valid volumes before bar i.
 let prior:number|null=null;
 for(let i=0;i<volume.length;i++){if(volume[i]===null)continue;ma[i]=prior;const mean=rolling[i];prior=finite(mean)?mean:null;}
 const rvol=volume.map((value,i)=>{const mean=ma[i];return value!==null&&finite(mean)&&mean>0?value/mean:null;});
 return {volume,ma,rvol,high:rvol.map(value=>value===null?null:value>=threshold?1:0)};
}

const BAND_INPUTS:CatalogInput[]=[1,2,3].flatMap(n=>[{key:`band${n}Enabled`,title:`Band ${n}`,type:'bool' as const,defval:n===1},{key:`band${n}Multiplier`,title:`Band ${n} multiplier`,type:'float' as const,defval:n,min:0,max:100000,step:0.5}]);
const definitions:readonly CatalogDefinition[]=[
 {id:'avwap',name:'Anchored VWAP',acronym:'AVWAP',overlay:true,requiresVolume:true,
  keywords:['anchored','VWAP','AVWAP','volume weighted average price','anchor','bands','standard deviation'],
  inputs:[{key:'anchor',title:'Anchor date and time (YYYY-MM-DD HH:mm, or click a bar on the chart)',type:'string',defval:''},SOURCE,
   {key:'bandMode',title:'Bands calculation mode',type:'string',defval:'Standard Deviation',options:['Standard Deviation','Percentage']},...BAND_INPUTS],
  plots:[{id:'vwap',label:'VWAP',color:C.blue,width:2},
   ...[1,2,3].flatMap(n=>[{id:`upper${n}`,label:`Upper band ${n}`,color:[C.green,C.amber,C.pink][n-1],width:1},{id:`lower${n}`,label:`Lower band ${n}`,color:[C.green,C.amber,C.pink][n-1],width:1}])],
  provenance:[{url:LV+'vwap-berkowitz-logue-noser-1988',facts:'Berkowitz, Logue and Noser, "The Total Cost of Transactions on the NYSE", Journal of Finance 43(1), 1988: VWAP = sum(price x volume) / sum(volume) over the period.'},
   {url:LV+'anchored-vwap-shannon-2023',facts:'B. Shannon, Maximum Trading Gains with Anchored VWAP (2023): the VWAP is started at a chosen anchor bar (an event such as a high, low, gap or earnings) and accumulated from there.'}],
  unknownDefaults:['The anchor is placed by the user (OpenCandle-defined): adding the study asks for a click on the anchor bar, which stores the open time of that bar, and an instance without an anchor draws nothing until one is set. There is no automatic anchor, so loading older history, new bars and interval changes never move it. The anchor text is read in the exchange clock (New York for US equities, UTC otherwise).','Source hlc3, band mode Standard Deviation, band 1 on at 1 and bands 2 and 3 off at 2 and 3 are OpenCandle-defined defaults matching the VWAP built-in. Colors are OpenCandle\'s own palette.'],
  policies:['The anchor bar is the bar that holds the anchor instant, or the first bar after it when the instant falls between bars. Bars before the anchor are unavailable; an anchor after the last loaded bar draws nothing yet.','Sums run exactly as the VWAP built-in sums its session. A bar with a missing price or volume is unavailable and the sums continue past it.','Standard Deviation bands use the volume-weighted population deviation around the anchored VWAP (West\'s weighted update). Percentage bands are VWAP +/- |VWAP| x multiplier / 100. A band that is switched off is unavailable.','Every value reads only the anchor bar through the current bar.'],
  calculate({bars,source,num,str,bool,chart,diagnostic}){
   const anchor=anchorInstant(str('anchor'),exchangeZoneOf(chart?.calendar));if(anchor===null)diagnostic?.(AVWAP_UNANCHORED_MESSAGE);
   const from=anchoredVwapIndex(bars,anchor,chart?.resolution);
   const mode=str('bandMode');if(mode!=='Standard Deviation'&&mode!=='Percentage')throw new Error('Anchored VWAP bands support only the Standard Deviation and Percentage modes.');
   return {...anchoredVwapSeries(bars,source,from,mode,[1,2,3].map(n=>({enabled:bool(`band${n}Enabled`),multiplier:num(`band${n}Multiplier`)})))};},
  warmup:()=>1,work:count=>count*24},
 {id:'sessionvwap',name:'Session VWAPs',acronym:'Session VWAP',overlay:true,requiresVolume:true,
  keywords:['session','VWAP','Tokyo','Asia','London','New York','trading sessions'],
  inputs:[...TRADING_SESSION_DEFAULT_WINDOWS.map((window,index)=>({key:SESSION_KEYS[index]+'Enabled',title:`${window.name} (${window.start}-${window.end} ${window.zone})`,type:'bool' as const,defval:true})),
   SOURCE,{key:'showBands',title:'Standard deviation band',type:'bool',defval:false},{key:'bandMultiplier',title:'Band multiplier',type:'float',defval:1,min:0,max:100000,step:0.5}],
  plots:TRADING_SESSION_DEFAULT_WINDOWS.flatMap((window,index)=>{const key=SESSION_KEYS[index];return [{id:key,label:`${window.name} VWAP`,color:window.color,width:2},{id:key+'Upper',label:`${window.name} upper band`,color:window.color,width:1},{id:key+'Lower',label:`${window.name} lower band`,color:window.color,width:1}];}),
  provenance:[{url:LV+'vwap-berkowitz-logue-noser-1988',facts:'Berkowitz, Logue and Noser (1988): VWAP = sum(price x volume) / sum(volume) over the period; here each period is one trading session.'},
   {url:LV+'trading-sessions',facts:'Session windows are the Trading sessions built-in defaults: Tokyo 09:00-15:00 Asia/Tokyo, London 08:00-16:30 Europe/London, New York 09:30-16:00 America/New_York.'}],
  unknownDefaults:['All three sessions on, source hlc3, band off at 1 standard deviation and the session colors (the Trading sessions colors) are OpenCandle-defined defaults.'],
  policies:['Each VWAP restarts on the first bar of its session and is unavailable outside it. A bar belongs to a session when it opens inside the window in that session\'s own clock (start-inclusive, end-exclusive, daylight saving changes followed), the Trading sessions rule.','Intraday charts only: on daily and longer intervals the study shows a notice and no values.','The band is VWAP +/- multiplier x the volume-weighted population deviation of the session so far. A bar with a missing price or volume is unavailable and the session continues past it. Every value reads only the session bars up to the current bar.'],
  calculate({bars,source,num,bool,chart}){
   intradayIntervalSeconds(chart?.resolution,'Session VWAPs');
   const band=bool('showBands')?num('bandMultiplier'):null,out:Record<string,NumericSeries>={};
   TRADING_SESSION_DEFAULT_WINDOWS.forEach((window,index)=>{const key=SESSION_KEYS[index];
    const series=bool(key+'Enabled')?sessionVwapSeries(bars,source,window,band):{vwap:nulls(bars.length),upper:nulls(bars.length),lower:nulls(bars.length)};
    out[key]=series.vwap;out[key+'Upper']=series.upper;out[key+'Lower']=series.lower;});
   return out;},
  warmup:()=>1,work:count=>count*48},
 {id:'orb',name:'Opening range breakout',acronym:'ORB',overlay:true,
  keywords:['ORB','opening range','breakout','Crabel','first minutes','range'],
  inputs:[{key:'session',title:'Session',type:'string',defval:'Exchange',options:ORB_SESSIONS},{key:'start',title:'Custom start (HH:mm)',type:'string',defval:'09:30'},{key:'end',title:'Custom end (HH:mm)',type:'string',defval:'16:00'},
   {key:'zone',title:'Custom time zone',type:'string',defval:'America/New_York'},{key:'duration',title:'Range duration (minutes)',type:'string',defval:'5',options:ORB_DURATIONS},
   {key:'showMid',title:'Show midpoint',type:'bool',defval:true},{key:'showTargets',title:'Show targets (range x1 and x2)',type:'bool',defval:false}],
  plots:[{id:'high',label:'OR high',color:C.up,width:2},{id:'low',label:'OR low',color:C.down,width:2},{id:'mid',label:'OR midpoint',color:C.guide,width:1},
   {id:'up1',label:'Target up x1',color:C.green,width:1},{id:'up2',label:'Target up x2',color:C.green,width:1},{id:'down1',label:'Target down x1',color:C.pink,width:1},{id:'down2',label:'Target down x2',color:C.pink,width:1},
   {id:'breakUp',label:'Breakout up',kind:'cross',color:C.up,width:4},{id:'breakDown',label:'Breakout down',kind:'cross',color:C.down,width:4}],
  provenance:[{url:LV+'opening-range-breakout-crabel-1990',facts:'T. Crabel, Day Trading with Short Term Price Patterns and Opening Range Breakout (1990): the opening range is the high and low of the first minutes of the session; a move beyond it is a breakout in that direction. The original entries are stop orders one "stretch" (the 10-day average of the distance from the open to the nearer extreme of the day) beyond the opening; this study is the common charting convention instead (the range of the first N minutes and the first close beyond it, no stretch).'}],
  unknownDefaults:['Session Exchange = 09:30-16:00 New York for US equities and 00:00-24:00 UTC for 24/7 and other sources (the 0.8.1 session VWAP rule); duration 5 minutes, midpoint on, targets off are OpenCandle-defined defaults. Custom uses the start, end and time zone fields.','Targets at the range high plus 1 and 2 ranges and the range low minus 1 and 2 ranges, a breakout as the first close beyond the range (once per side per session), and markers at that close are OpenCandle-defined. Colors are OpenCandle\'s own palette.'],
  policies:['The range covers the session bars that open in its first Duration minutes; on a chart interval longer than the duration it is the whole first bar. Lines start on the first session bar opening at or after the range end, so they appear only once the range is complete, and stop at the session end.','Breakout up (down) is valued at the close of the first bar after the range that closes above the high (below the low), once per side per session. Every value reads only the current session bars up to the current bar.','Intraday charts only: on daily and longer intervals the study shows a notice and no values. A session with no bar inside the range window, or a range bar with an invalid price, draws no lines.'],
  calculate({bars,str,bool,chart,diagnostic}){
   intradayIntervalSeconds(chart?.resolution,'Opening range breakout');const duration=Number(str('duration'));
   if(!(ORB_DURATIONS as readonly string[]).includes(str('duration')))throw new Error('Choose an opening range duration of 5, 15, 30 or 60 minutes.');
   const custom=str('session')==='Custom';if(!custom&&str('session')!=='Exchange')throw new Error('Choose the Exchange or Custom session.');
   const us=chart?.calendar==='us-equity',session=custom?{start:sessionMinute(str('start')),end:sessionMinute(str('end')),zone:str('zone').trim()||'UTC'}:{start:us?570:0,end:us?960:0,zone:us?'America/New_York':'UTC'};
   if(!custom&&!chart?.calendar)diagnostic?.('The exchange session of this symbol is unknown, so the range starts at 00:00 UTC. Choose Custom to set the session open.');
   const out=openingRangeSeries(bars,session,duration),off=nulls(bars.length);
   return {...out,mid:bool('showMid')?out.mid:off,up1:bool('showTargets')?out.up1:off,up2:bool('showTargets')?out.up2:off,down1:bool('showTargets')?out.down1:off,down2:bool('showTargets')?out.down2:off};},
  warmup:()=>2,work:count=>count*24},
 {id:'relvolume',name:'Relative volume',acronym:'RVOL',overlay:false,requiresVolume:true,
  keywords:['RVOL','relative volume','volume ratio','unusual volume','volume spike'],
  inputs:[{key:'length',title:'MA length',type:'int',defval:20,min:1,max:5000,step:1},{key:'threshold',title:'Highlight threshold',type:'float',defval:2,min:0,max:1000,step:0.1}],
  plots:[{id:'volume',label:'Volume',kind:'histogram',color:C.blue,width:1},{id:'ma',label:'Volume MA',color:C.amber,width:1},{id:'rvol',label:'RVOL',color:C.violet,width:1,visible:false},{id:'high',label:'Above threshold',color:C.guide,width:1,visible:false}],
  pointPalette:{plot:'volume',colors:[C.pink],labels:['Above threshold'],state:values=>values('high').map(value=>value===1?0:null)},
  provenance:[{url:LV+'relative-volume-common-practice',facts:'Relative volume (RVOL) = volume / average volume of the preceding bars; a ratio of 2 or more is commonly read as unusual activity. The ratio has no single author.'}],
  unknownDefaults:['OpenCandle-defined (common practice): a simple average of the previous MA length bars with volume (the current bar is not part of its own baseline), length 20, threshold 2.0, the highlight color and the hidden RVOL and Above threshold plots (shown in the legend, data window and alerts; turn them on in the Style tab).'],
  policies:['RVOL = volume / the simple average volume of the MA length bars before it; Volume MA plots that same average. Above threshold is 1 when RVOL is at or above the threshold, else 0. A volume bar is colored with the Above threshold color when RVOL reaches the threshold.','A bar with missing volume is unavailable at that bar only; the average skips it and resumes from the bars with volume. A zero average leaves the bar unavailable. Every value reads only the current and earlier bars.'],
  calculate({bars,tk,num}){return relativeVolumeSeries(bars.map(bar=>bar.volume),tk.sma,num('length'),num('threshold'));},
  warmup:value=>value('length')+1,work:count=>count*12},
];
export const VWAP_SESSION_INDICATORS:readonly CatalogDefinition[]=definitions;
