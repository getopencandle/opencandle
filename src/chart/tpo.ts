// Time price opportunity (TPO). A time-based chart type: one market profile per profile period, built from
// the chart's own bars, painted by an LV renderer layer that replaces the price painting. The chart axis, live updates
// (vela's live-bar path) and indicators (the underlying OHLC) are those of an ordinary time chart.
// The chart type menu lists the type as "Time price opportunity" (tpo); colors and construction are our own choice.
// Setting names follow the names reserved in generate-inventory.mjs
// (Profile period, Block size, Row size mode, Ticks per row, Letters, POC, Value area percent, VAH, VAL, Initial balance,
// Single prints, Poor high, Poor low). Also Sessions (profilesSessions All / custom; LV adds Regular), Split by
// blocks (splitByBlocks, mode All / Last) and Merge points (mergePoints, a list of profile starts).
//
// Construction:
//  * Sessions (src/domain/profile-sessions.ts): a profile period Day is one trading date of the chosen session
//    (All: every loaded bar of the date; US equities use the New York date, 24/7 feeds the UTC date; Regular: the regular
//    session only; Custom: an exchange-clock range). Week groups the dates of a Monday week. Blocks count from the session
//    anchor (All: local midnight, Regular: the open, Custom: its start). The low-level tpoProfiles call without a session
//    keeps the UTC rule: Day is the UTC calendar day; Week starts Monday 00:00 UTC.
//  * Merge points: a profile whose start time is listed joins the profile before it (one profile, blocks counted
//    from the earlier start). Points that match no profile start are ignored.
//  * Split by blocks: the profile's letters are drawn as one column per block at the block's own bars instead of
//    stacked at the profile's left edge (mode All: every profile; Last: only the latest). Levels and counts are unchanged.
//  * Block size N minutes: block b of a profile holds the bars with floor((time - profile start) / (N*60)) = b. A chart
//    interval longer than the block makes every bar its own block. The first block with bars is lettered A, and each
//    later block by its distance from it (A..Z, a..z, then again from A), so an empty block skips its letter.
//  * Rows are [k*row, (k+1)*row). A block touches the rows from floor(low/row) to floor(high/row); a row's TPO count is
//    the number of blocks that touch it.
//  * POC is the row with the most TPOs; ties go to the row nearest the profile middle, then to the lower row.
//  * Value area: start at the POC and add the two rows above or the two rows below, whichever pair has more TPOs (ties go
//    up), until the value area holds at least Value area percent of all TPOs. VAH is the top of its highest row and VAL
//    the bottom of its lowest row.
//  * Initial balance: the high and low of the first Initial balance blocks.
//  * Single prints: rows with one TPO, other than the top and bottom rows. Poor high (low): the top (bottom) row holds two
//    or more TPOs.
//  * Row size mode Auto: the median profile range over 30 rows, rounded up to whole ticks when the tick size is known and
//    to a 1, 2 or 5 step otherwise. Ticks per row needs the instrument tick size; without it Auto is used.
import {registerChartType,registerRendererLayer,type RendererLayerArgs,type RendererLayerInstance} from '@luxalgo/vela';
import type {ChartSettingField} from './chart-settings';
import {pivotCalendar,type PivotCalendar} from '../domain/indicators-ext/r23-catalog';
import {sessionAnchor,sessionClockMinutes,sessionSlot,PROFILE_SESSION_MODES,SESSION_CLOCK_OPTIONS,type ProfileSessionMode,type SessionGrouping} from '../domain/profile-sessions';

export const TPO_STYLE='tpo';
export const TPO_LETTERS='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const TPO_AUTO_ROWS=30;
const EPS=1e-9;
const DAY=86_400,WEEK=7*DAY,MONDAY_OFFSET=4*DAY;// 1970-01-01 was a Thursday; Monday 1970-01-05 is 4 days later.

const f=(key:string,label:string,kind:ChartSettingField['kind'],extra:Partial<ChartSettingField>={}):ChartSettingField=>({key,label,kind,...extra});
const color=(key:string,label:string)=>f(key,label,'color');
/** Settings rows (LV schema; labels are the reserved reference names). */
export const TPO_SETTING_FIELDS:readonly ChartSettingField[]=Object.freeze([
 f('profilePeriod','Profile period','select',{options:['Day','Week']}),
 f('periodsNum','Number of periods','number',{min:1,max:50,step:1}),
 // profilesSessions (All, custom ranges); Regular is LV's US equity regular session. Exchange clock.
 f('profilesSessions','Sessions','select',{options:[...PROFILE_SESSION_MODES]}),
 f('customSessionStart','Custom session start','select',{options:[...SESSION_CLOCK_OPTIONS]}),
 f('customSessionEnd','Custom session end','select',{options:[...SESSION_CLOCK_OPTIONS]}),
 f('blockSize','Block size','select',{options:['5m','10m','15m','30m','60m']}),
 f('rowSizeMode','Row size mode','select',{options:['Auto','Ticks per row']}),
 f('ticksPerRow','Ticks per row','number',{min:1,max:100000,step:1}),
 f('blocks','Blocks','boolean'),f('letters','Letters','boolean'),
 // splitByBlocks (default off) and splitByBlocksMode (All / Last).
 f('splitByBlocks','Split by blocks','boolean'),f('splitByBlocksMode','Split profiles','select',{options:['All','Last']}),
 color('valueAreaColor','Value area color'),color('outsideColor','Outside value area color'),
 // nonVaOpacity (default 30): opacity of the rows outside the value area.
 f('outsideOpacity','Outside value area opacity (%)','number',{min:0,max:100,step:1}),
 f('poc','POC','boolean'),color('pocColor','POC color'),
 f('valueAreaPercent','Value area percent','number',{min:1,max:100,step:1}),
 f('vah','VAH','boolean'),f('val','VAL','boolean'),color('valueAreaLineColor','VAH and VAL color'),
 // Midpoint / open / close levels (default off); LV colors.
 f('midpoint','Midpoint','boolean'),color('midpointColor','Midpoint color'),
 f('openLevel','Open price','boolean'),color('openLevelColor','Open price color'),
 f('closeLevel','Close price','boolean'),color('closeLevelColor','Close price color'),
 f('initialBalance','Initial balance','boolean'),f('initialBalanceBlocks','Initial balance blocks','number',{min:1,max:52,step:1}),color('initialBalanceColor','Initial balance color'),
 f('singlePrints','Single prints','boolean'),color('singlePrintColor','Single prints color'),
 f('poorHigh','Poor high','boolean'),f('poorLow','Poor low','boolean'),color('poorColor','Poor high and low color'),
 f('volumeProfile','Volume profile','boolean'),f('volumeProfileValues','Volume profile values','boolean'),color('volumeProfileColor','Volume profile color'),
 f('summary','Summary','boolean'),
 // mergePoints (default []): profile start times (Unix seconds) that join the profile before them.
 f('mergePoints','Merge points','list'),
]);
/** Factory values: behavior defaults for the inputs and styles; colors are LV's own. */
export const TPO_LV_DEFAULTS:Readonly<Record<string,unknown>>=Object.freeze({
 profilePeriod:'Day',periodsNum:1,profilesSessions:'All',customSessionStart:'09:30',customSessionEnd:'16:00',splitByBlocks:false,splitByBlocksMode:'All',mergePoints:Object.freeze([]) as unknown as number[],blockSize:'30m',rowSizeMode:'Auto',ticksPerRow:100,blocks:true,letters:true,valueAreaColor:'#2962FF',outsideColor:'#787B86',outsideOpacity:30,
 poc:true,pocColor:'#F23645',valueAreaPercent:70,vah:true,val:true,valueAreaLineColor:'#2962FF',
 midpoint:false,midpointColor:'#FF9800',openLevel:false,openLevelColor:'#089981',closeLevel:false,closeLevelColor:'#F23645',
 initialBalance:true,initialBalanceBlocks:2,initialBalanceColor:'#089981',singlePrints:false,singlePrintColor:'#FF9800',poorHigh:false,poorLow:false,poorColor:'#F23645',
 volumeProfile:true,volumeProfileValues:true,volumeProfileColor:'#787B86',summary:false,
});
export const TPO_UNRESOLVED:readonly string[]=Object.freeze([
 'Colors, dialog row order and the construction rules are OpenCandle-defined.',
 'Sessions: All groups every loaded bar by its trading date (New York date for US equities, UTC date for 24/7 feeds); Regular keeps the US equity regular session; Custom uses an exchange-clock range (default 09:30 to 16:00, the reference customSession). The reference grouping rules beyond those defaults are not captured (TPO-SVP-1).',
 'Merge points are kept as profile start times; the chart gesture that adds them is not offered yet, and the Merge points row clears them. Split by blocks draws one letter column per block (TPO-SVP-2/3, OpenCandle construction).',
 'Midpoint is the middle of the profile high and low; Open and Close price are the first open and last close of the profile (OpenCandle construction).',
]);

export interface TpoBar {time:number;open:number;high:number;low:number;close:number;volume?:number}
export interface TpoRow {index:number;low:number;high:number;letters:string[];count:number;volume:number}
/** One block of a profile, for Split by blocks: its letter, its bars and the rows it touches. */
export interface TpoColumn {block:number;letter:string;firstIndex:number;lastIndex:number;lowRow:number;highRow:number}
export interface TpoProfile {
 start:number;firstIndex:number;lastIndex:number;rowSize:number;blocks:number;
 /** Rows bottom to top. */
 rows:TpoRow[];
 poc:number;pocPrice:number;vah:number;val:number;valueRows:[number,number];
 ibHigh:number;ibLow:number;singlePrints:number[];poorHigh:boolean;poorLow:boolean;open:number;close:number;
 /** The blocks in time order. */
 columns:TpoColumn[];
}
export interface TpoOptions {profilePeriod:'Day'|'Week';blockMinutes:number;rowSize:number;valueAreaPercent:number;initialBalanceBlocks:number;intervalSeconds?:number;periodsNum?:number;
 /** Session grouping; absent keeps the UTC-day rule. */
 session?:SessionGrouping|null;
 /** Profile starts (seconds) that join the profile before them. */
 mergePoints?:readonly number[];}

/** Start of the profile holding the time; periods > 1 groups that many consecutive periods into one profile. */
export function tpoProfileStart(time:number,period:'Day'|'Week',periods=1):number{
 const n=Number.isInteger(periods)&&periods>=1?periods:1;
 if(period==='Day')return Math.floor(time/(DAY*n))*DAY*n;
 return Math.floor((time-MONDAY_OFFSET)/(WEEK*n))*WEEK*n+MONDAY_OFFSET;
}
/** The profile start of a bar under a session grouping (null outside the session). The trading date's day number
 *  is grouped like the UTC-day rule groups days (periods of n days from 1970-01-01, Monday weeks), and the start is the
 *  session anchor of the group's first date, so a UTC calendar with All gives exactly the UTC-day starts. */
export function tpoSessionProfileStart(time:number,period:'Day'|'Week',periods:number,session:SessionGrouping,anchors?:Map<number,number>):number|null{
 const slot=sessionSlot(time,session);if(!slot)return null;
 const n=Number.isInteger(periods)&&periods>=1?periods:1;
 const first=period==='Day'?Math.floor(slot.day/n)*n:Math.floor((slot.day-4)/(7*n))*7*n+4;
 const hit=anchors?.get(first);if(hit!==undefined)return hit;
 const anchor=sessionAnchor(first,session);anchors?.set(first,anchor);return anchor;
}
interface TpoRun {start:number;first:number;last:number}
/** Profile runs: consecutive bars with one profile start (bars outside the session are skipped inside a run), then merged at
 *  the merge points. */
/** One-entry memo: the row size and the profiles of one settings call share the runs (same bars, session and merge objects). */
let lastRuns:{bars:readonly TpoBar[];length:number;lastTime:number|undefined;period:string;periods:number;session:SessionGrouping|null|undefined;mergePoints?:readonly number[];out:{runs:TpoRun[];starts:(number|null)[]}}|null=null;
function tpoRuns(bars:readonly TpoBar[],period:'Day'|'Week',periods:number,session:SessionGrouping|null|undefined,mergePoints?:readonly number[]):{runs:TpoRun[];starts:(number|null)[]}{
 const memo=lastRuns;if(memo&&memo.bars===bars&&memo.length===bars.length&&memo.lastTime===bars.at(-1)?.time&&memo.period===period&&memo.periods===periods&&memo.session===session&&memo.mergePoints===mergePoints)return memo.out;
 const out=buildRuns(bars,period,periods,session,mergePoints);lastRuns={bars,length:bars.length,lastTime:bars.at(-1)?.time,period,periods,session,mergePoints,out};return out;
}
function buildRuns(bars:readonly TpoBar[],period:'Day'|'Week',periods:number,session:SessionGrouping|null|undefined,mergePoints?:readonly number[]):{runs:TpoRun[];starts:(number|null)[]}{
 const anchors=new Map<number,number>(),starts=bars.map(bar=>session?tpoSessionProfileStart(bar.time,period,periods,session,anchors):tpoProfileStart(bar.time,period,periods));
 const runs:TpoRun[]=[];
 for(let i=0;i<bars.length;i++){const start=starts[i];if(start===null)continue;const last=runs.at(-1);if(last&&last.start===start)last.last=i;else runs.push({start,first:i,last:i});}
 if(!mergePoints?.length)return {runs,starts};
 const points=new Set(mergePoints),merged:TpoRun[]=[];
 for(const run of runs){const previous=merged.at(-1);if(previous&&points.has(run.start))previous.last=run.last;else merged.push({...run});}
 for(const run of merged)for(let i=run.first;i<=run.last;i++)if(starts[i]!==null)starts[i]=run.start;
 return {runs:merged,starts};
}
/** Block minutes from '30m' (or the older bare '30'). */
export function tpoBlockMinutes(value:unknown):number{const n=Number.parseFloat(String(value));return n>0?n:30;}
export function tpoLetter(block:number):string{return TPO_LETTERS[((block%TPO_LETTERS.length)+TPO_LETTERS.length)%TPO_LETTERS.length];}
const rowOf=(price:number,size:number)=>Math.floor(price/size+EPS);
/** Smallest 1, 2 or 5 times a power of ten at or above the value. */
export function niceStep(value:number):number{
 if(!(value>0)||!Number.isFinite(value))return 1;
 const power=Math.pow(10,Math.floor(Math.log10(value)));
 for(const mult of [1,2,5,10])if(mult*power>=value*(1-1e-12))return mult*power;
 return 10*power;
}
/** Row size (price) for the bars and settings; null when nothing can be built. */
export function tpoRowSize(bars:readonly TpoBar[],period:'Day'|'Week',mode:string,ticksPerRow:number,tickSize:number|null|undefined,periods=1,session?:SessionGrouping|null,mergePoints?:readonly number[]):number|null{
 const tick=typeof tickSize==='number'&&Number.isFinite(tickSize)&&tickSize>0?tickSize:null;
 if(mode==='Ticks per row'&&tick&&Number.isInteger(ticksPerRow)&&ticksPerRow>=1)return ticksPerRow*tick;
 const {runs,starts}=tpoRuns(bars,period,periods,session,mergePoints),ranges:number[]=[];
 for(const run of runs){let high=-Infinity,low=Infinity;for(let i=run.first;i<=run.last;i++){if(starts[i]===null)continue;high=Math.max(high,bars[i].high);low=Math.min(low,bars[i].low);}if(Number.isFinite(high)&&Number.isFinite(low))ranges.push(high-low);}
 if(!ranges.length)return null;
 ranges.sort((a,b)=>a-b);const median=ranges.length%2?ranges[(ranges.length-1)/2]:(ranges[ranges.length/2-1]+ranges[ranges.length/2])/2;
 const target=median/TPO_AUTO_ROWS;
 if(tick)return Math.max(1,Math.ceil(target/tick-EPS))*tick;
 return niceStep(target>0?target:Math.abs(bars.at(-1)?.close??1)/1000||1);
}
/** Value area rows [low, high] by the two-row rule; see the header. */
export function tpoValueArea(counts:readonly number[],poc:number,percent:number):[number,number]{
 const total=counts.reduce((sum,count)=>sum+count,0),target=total*percent/100;
 let low=poc,high=poc,inside=counts[poc];
 while(inside<target-EPS&&(low>0||high<counts.length-1)){
  const upRows=[high+1,high+2].filter(index=>index<counts.length),downRows=[low-1,low-2].filter(index=>index>=0);
  const up=upRows.reduce((sum,index)=>sum+counts[index],0),down=downRows.reduce((sum,index)=>sum+counts[index],0);
  if(upRows.length&&(up>=down||!downRows.length)){high=upRows.at(-1)!;inside+=up;}else{low=downRows.at(-1)!;inside+=down;}
 }
 return [low,high];
}
/** Profiles of the bars (seconds), oldest first. */
export function tpoProfiles(bars:readonly TpoBar[],options:TpoOptions):TpoProfile[]{
 const size=options.rowSize;if(!(size>0)||!Number.isFinite(size))throw new Error('TPO row size must be a positive price');
 const blockSeconds=Math.max(options.blockMinutes*60,options.intervalSeconds??0),profiles:TpoProfile[]=[];
 const {runs,starts}=tpoRuns(bars,options.profilePeriod,options.periodsNum??1,options.session,options.mergePoints);
 for(const run of runs){
  const start=run.start;
  const blocks=new Map<number,{high:number;low:number;first:number;last:number}>(),volumeByRow=new Map<number,number>();
  let first=-1,last=-1;
  for(let index=run.first;index<=run.last;index++){
   if(starts[index]===null)continue;
   const bar=bars[index],block=Math.floor((bar.time-start)/blockSeconds),row=blocks.get(block);
   if(first<0)first=index;last=index;
   if(bar.volume&&bar.volume>0){const lo=rowOf(bar.low,size),hi=rowOf(bar.high,size),share=bar.volume/(hi-lo+1);for(let k=lo;k<=hi;k++)volumeByRow.set(k,(volumeByRow.get(k)??0)+share);}
   if(row){row.high=Math.max(row.high,bar.high);row.low=Math.min(row.low,bar.low);row.last=index;}else blocks.set(block,{high:bar.high,low:bar.low,first:index,last:index});
  }
  const order=[...blocks.keys()].sort((a,b)=>a-b);
  let bottom=Infinity,top=-Infinity;for(const block of order){const range=blocks.get(block)!;bottom=Math.min(bottom,rowOf(range.low,size));top=Math.max(top,rowOf(range.high,size));}
  const rows:TpoRow[]=[];for(let k=bottom;k<=top;k++)rows.push({index:k,low:k*size,high:(k+1)*size,letters:[],count:0,volume:0});
  const columns:TpoColumn[]=[];
  for(const block of order){const range=blocks.get(block)!,letter=tpoLetter(block-order[0]),lowRow=rowOf(range.low,size),highRow=rowOf(range.high,size);for(let k=lowRow;k<=highRow;k++){const row=rows[k-bottom];row.letters.push(letter);row.count++;}columns.push({block,letter,firstIndex:range.first,lastIndex:range.last,lowRow,highRow});}
  for(const row of rows)row.volume=volumeByRow.get(row.index)??0;
  const counts=rows.map(row=>row.count),most=Math.max(...counts),middle=(rows.length-1)/2;
  let poc=0;for(let k=0;k<rows.length;k++){if(counts[k]!==most)continue;if(counts[poc]!==most||Math.abs(k-middle)<Math.abs(poc-middle)-EPS)poc=k;}
  const [vaLow,vaHigh]=tpoValueArea(counts,poc,options.valueAreaPercent);
  const ib=order.filter(block=>block<order[0]+options.initialBalanceBlocks).map(block=>blocks.get(block)!);
  profiles.push({start,firstIndex:first,lastIndex:last,rowSize:size,blocks:order.length,rows,
   poc:rows[poc].index,pocPrice:(rows[poc].low+rows[poc].high)/2,vah:rows[vaHigh].high,val:rows[vaLow].low,valueRows:[rows[vaLow].index,rows[vaHigh].index],
   ibHigh:Math.max(...ib.map(row=>row.high)),ibLow:Math.min(...ib.map(row=>row.low)),
   singlePrints:rows.filter((row,k)=>row.count===1&&k>0&&k<rows.length-1).map(row=>row.index),
   poorHigh:rows.length>1&&rows.at(-1)!.count>=2,poorLow:rows.length>1&&rows[0].count>=2,open:bars[first].open,close:bars[last].close,columns});
 }
 return profiles;
}

/** Smallest positive spacing between bar times (seconds), the chart interval reading of the layer. */
export function tpoIntervalSeconds(bars:readonly TpoBar[]):number{
 let best=Infinity;for(let index=1;index<bars.length;index++){const step=bars[index].time-bars[index-1].time;if(step>0&&step<best)best=step;}
 return Number.isFinite(best)?best:0;
}
/** Native-data payload the adapter pushes on the tpo channel: the instrument tick size when known, plus the
 *  declared session calendar and the exchange time zone (both optional: absent, the calendar is inferred from the bars). */
export interface TpoLayerPayload {tickSize:number|null;calendar?:PivotCalendar|null;timeZone?:string|null}
/** The session grouping of the settings (Sessions, custom range) for the bars; the calendar is the declared one
 *  or inferred from the bars (pivotCalendar), and daily or longer bars (spacing of 20 hours or more) read one date per bar. */
export function tpoSessionGrouping(bars:readonly {time:number}[],settings:Record<string,unknown>,context:{calendar?:PivotCalendar|null;timeZone?:string|null}={}):SessionGrouping{
 const values={...TPO_LV_DEFAULTS,...settings},mode=(PROFILE_SESSION_MODES as readonly string[]).includes(String(values.profilesSessions))?values.profilesSessions as ProfileSessionMode:'All';
 const calendar=pivotCalendar(bars,null,context.calendar??null),spacing=tpoIntervalSeconds(bars as readonly TpoBar[]);
 return {mode,calendar,timeZone:context.timeZone??null,customStart:sessionClockMinutes(values.customSessionStart)??570,customEnd:sessionClockMinutes(values.customSessionEnd)??960,daily:spacing>=72_000};
}
/** A valid merge point list (finite numbers), else empty. */
export function tpoMergePoints(value:unknown):number[]{return Array.isArray(value)?value.filter((point):point is number=>typeof point==='number'&&Number.isFinite(point)):[];}
/** The settings patch that merges the profile starting at `start` into the profile before it (or splits it out
 *  again when it is already merged). For the chart gesture; the dialog row only clears the list. */
export function tpoToggleMergePoint(settings:Record<string,unknown>,start:number):{mergePoints:number[]}{
 const points=tpoMergePoints(settings.mergePoints);return {mergePoints:points.includes(start)?points.filter(point=>point!==start):[...points,start].sort((a,b)=>a-b)};
}
const settingsKey=(settings:Record<string,unknown>,tick:number|null,payload?:TpoLayerPayload)=>JSON.stringify([settings.profilePeriod,settings.periodsNum,settings.blockSize,settings.rowSizeMode,settings.ticksPerRow,settings.valueAreaPercent,settings.initialBalanceBlocks,tick,settings.profilesSessions,settings.customSessionStart,settings.customSessionEnd,settings.mergePoints,payload?.calendar??null,payload?.timeZone??null]);
/** Profiles for renderer bars (seconds) and the type settings. */
export function tpoProfilesForSettings(bars:readonly TpoBar[],settings:Record<string,unknown>,tickSize:number|null,context:{calendar?:PivotCalendar|null;timeZone?:string|null}={}):TpoProfile[]{
 const values={...TPO_LV_DEFAULTS,...settings},period=values.profilePeriod==='Week'?'Week':'Day',session=tpoSessionGrouping(bars,values,context),mergePoints=tpoMergePoints(values.mergePoints);
 const periodsNum=Math.max(1,Math.round(Number(values.periodsNum)||1)),rowSize=tpoRowSize(bars,period,String(values.rowSizeMode),Number(values.ticksPerRow),tickSize,periodsNum,session,mergePoints);if(rowSize===null)return [];
 return tpoProfiles(bars,{profilePeriod:period,blockMinutes:tpoBlockMinutes(values.blockSize),periodsNum,rowSize,valueAreaPercent:Number(values.valueAreaPercent)||70,initialBalanceBlocks:Math.max(1,Math.round(Number(values.initialBalanceBlocks)||2)),intervalSeconds:tpoIntervalSeconds(bars),session,mergePoints});
}
/** Whether a profile is drawn split by blocks. */
export function tpoSplitApplies(settings:Record<string,unknown>,index:number,count:number):boolean{return settings.splitByBlocks===true&&(settings.splitByBlocksMode!=='Last'||index===count-1);}

class TpoLayer implements RendererLayerInstance{
 private canvas:HTMLCanvasElement|null=null;
 private memo:{bars:readonly unknown[];key:string;length:number;last:unknown;lastJson:string;profiles:TpoProfile[]}|null=null;
 mount(canvas:HTMLCanvasElement){this.canvas=canvas;canvas.dataset.lvChartType=TPO_STYLE;}
 render(args:RendererLayerArgs){
  const canvas=this.canvas;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);
  if(args.priceStyle!==TPO_STYLE||!args.bars.length)return;
  const settings={...TPO_LV_DEFAULTS,...args.settings},payload=args.data as TpoLayerPayload|undefined,tick=typeof payload?.tickSize==='number'?payload.tickSize:null,key=settingsKey(settings,tick,payload);
  const lastBar=args.bars.at(-1),lastJson=JSON.stringify(lastBar);
  // The live path appends a bar, replaces the forming bar object or revises it in place: length, the last object or its values change.
  if(!this.memo||this.memo.bars!==args.bars||this.memo.key!==key||this.memo.length!==args.bars.length||this.memo.last!==lastBar||this.memo.lastJson!==lastJson){
   const seconds=args.bars.map(bar=>({time:bar.time/1000,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:(bar as {volume?:number}).volume}));
   this.memo={bars:args.bars,key,length:args.bars.length,last:lastBar,lastJson,profiles:tpoProfilesForSettings(seconds,settings,tick,{calendar:payload?.calendar??null,timeZone:payload?.timeZone??null})};
  }
  const range=args.coords.visibleLogicalRange(),from=Math.floor(range.from)-1,to=Math.ceil(range.to)+1;
  const x=(index:number)=>args.coords.logicalToX(index),y=(price:number)=>args.coords.priceToY(price,args.scale,args.bounds),spacing=Math.max(1,args.coords.bodySpacing());
  ctx.save();ctx.scale(args.coords.dpr,args.coords.dpr);ctx.beginPath();ctx.rect(0,args.bounds.top,args.coords.width,args.bounds.height);ctx.clip();
  let painted=0;
  const profiles=this.memo.profiles;
  for(let profileIndex=0;profileIndex<profiles.length;profileIndex++){
   const profile=profiles[profileIndex];
   if(profile.lastIndex<from||profile.firstIndex>to)continue;painted++;
   // Split profiles draw each block at its own bars.
   const split=tpoSplitApplies(settings,profileIndex,profiles.length);
   const left=x(profile.firstIndex)-spacing/2,right=x(profile.lastIndex)+spacing/2,width=Math.max(1,right-left);
   const most=Math.max(...profile.rows.map(row=>row.count)),rowHeight=Math.abs(y(profile.rows[0].low)-y(profile.rows[0].high)),cell=Math.max(1,Math.min(width/Math.max(1,most),Math.max(4,rowHeight)));
   const blocksOn=settings.blocks!==false,letters=settings.letters!==false&&rowHeight>=8&&cell>=6,fontSize=Math.max(6,Math.min(12,Math.floor(rowHeight-1)));
   if(letters){ctx.font=`${fontSize}px ${args.theme.fontFamily}`;ctx.textAlign='center';ctx.textBaseline='middle';}
   for(const row of profile.rows){
    const inside=row.index>=profile.valueRows[0]&&row.index<=profile.valueRows[1],single=settings.singlePrints!==false&&profile.singlePrints.includes(row.index);
    const ink=String(single?settings.singlePrintColor:inside?settings.valueAreaColor:settings.outsideColor),top=Math.min(y(row.low),y(row.high)),height=Math.max(1,rowHeight-1);
    ctx.fillStyle=ink;
    // Rows outside the value area (not single prints) take the outside opacity.
    const rowAlpha=!inside&&!single?Math.max(0,Math.min(100,Number(settings.outsideOpacity??30)))/100:1;
    ctx.save();ctx.globalAlpha=rowAlpha;
    const columns=split?profile.columns.filter(column=>column.lowRow<=row.index&&row.index<=column.highRow):null;
    row.letters.forEach((letter,index)=>{const column=columns?.[index],cx=column?x(column.firstIndex)-spacing/2:left+index*cell,w=column?Math.max(1,x(column.lastIndex)-x(column.firstIndex)+spacing):cell;if(blocksOn){ctx.save();ctx.globalAlpha=rowAlpha*(letters?0.3:1);ctx.fillRect(cx,top,Math.max(1,w-1),height);ctx.restore();}if(letters)ctx.fillText(letter,cx+w/2,top+rowHeight/2);});
    ctx.restore();
   }
   if(settings.volumeProfile!==false){
    const peak=Math.max(...profile.rows.map(row=>row.volume));
    if(peak>0){const room=Math.max(12,Math.min(60,width*0.25));ctx.save();ctx.fillStyle=String(settings.volumeProfileColor);ctx.globalAlpha=0.45;
     for(const row of profile.rows){if(!(row.volume>0))continue;const top=Math.min(y(row.low),y(row.high)),w=Math.max(1,row.volume/peak*room);ctx.fillRect(right+2,top,w,Math.max(1,rowHeight-1));}
     ctx.globalAlpha=1;if(settings.volumeProfileValues!==false&&rowHeight>=8){ctx.font=`${Math.max(6,Math.min(10,Math.floor(rowHeight-1)))}px ${args.theme.fontFamily}`;ctx.textAlign='left';ctx.textBaseline='middle';for(const row of profile.rows)if(row.volume>0)ctx.fillText(String(Math.round(row.volume)),right+4,Math.min(y(row.low),y(row.high))+rowHeight/2);}
     ctx.restore();}
   }
   if(settings.summary===true){const lines=[`POC ${profile.pocPrice}`,`VAH ${profile.vah}`,`VAL ${profile.val}`,`IB ${profile.ibLow} - ${profile.ibHigh}`];ctx.save();ctx.fillStyle=String(settings.outsideColor);ctx.font=`10px ${args.theme.fontFamily}`;ctx.textAlign='left';ctx.textBaseline='top';const base=Math.max(y(profile.rows[0].low),y(profile.rows[0].high))+4;lines.forEach((text,i)=>ctx.fillText(text,left,base+i*12));ctx.restore();}
   const line=(price:number,ink:unknown,dash:number[],lineWidth=1)=>{const yy=Math.round(y(price))+0.5;ctx.save();ctx.strokeStyle=String(ink);ctx.lineWidth=lineWidth;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.restore();};
   if(settings.poc!==false)line(profile.pocPrice,settings.pocColor,[],1);
   if(settings.vah!==false)line(profile.vah,settings.valueAreaLineColor,[4,3]);
   if(settings.val!==false)line(profile.val,settings.valueAreaLineColor,[4,3]);
   if(settings.midpoint===true){let high=-Infinity,low=Infinity;for(let index=profile.firstIndex;index<=profile.lastIndex;index++){const bar=args.bars[index];if(bar){high=Math.max(high,bar.high);low=Math.min(low,bar.low);}}if(Number.isFinite(high)&&Number.isFinite(low))line((high+low)/2,settings.midpointColor,[1,2]);}
   if(settings.openLevel===true)line(profile.open,settings.openLevelColor,[]);
   if(settings.closeLevel===true)line(profile.close,settings.closeLevelColor,[]);
   if(settings.initialBalance!==false){ctx.save();ctx.strokeStyle=String(settings.initialBalanceColor);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(left-2,y(profile.ibHigh));ctx.lineTo(left-2,y(profile.ibLow));ctx.stroke();ctx.restore();}
   const poor=(row:TpoRow,edge:number)=>{ctx.save();ctx.strokeStyle=String(settings.poorColor);ctx.lineWidth=1;ctx.setLineDash([2,2]);const yy=Math.round(y(edge))+0.5;ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(left+row.count*cell,yy);ctx.stroke();ctx.restore();};
   if(settings.poorHigh!==false&&profile.poorHigh){const row=profile.rows.at(-1)!;poor(row,row.high);}
   if(settings.poorLow!==false&&profile.poorLow){const row=profile.rows[0];poor(row,row.low);}
  }
  ctx.restore();canvas.dataset.lvPaintedProfiles=String(painted);canvas.dataset.lvFrames=String(Number(canvas.dataset.lvFrames??0)+1);
 }
 destroy(){this.canvas=null;this.memo=null;}
}
let registered=false;
/** Registers the TPO type (base painting replaced) and its layer. Idempotent. */
export function registerTpoChartType(){if(registered)return;registered=true;registerChartType({id:TPO_STYLE,label:'Time price opportunity',basePainting:'none'});registerRendererLayer({id:TPO_STYLE,placement:'below-data',create:()=>new TpoLayer()});}
