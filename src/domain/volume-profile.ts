import type {Bar} from './types';
import {pivotCalendar,pivotPeriodKey,type PivotCalendar} from './indicators-ext/r23-catalog';
import {usSessionPhase} from './us-market-hours';
import {parseInterval} from './intervals';

/**
 * Volume profile rows, point of control and value area for the Visible range and Periodic volume profile
 * indicators. Pure: bars in, profile out. Original LV code; no reference source was used.
 *
 * Defaults (shared with the fixed-range volume profile): Rows Layout "Number Of Rows" or "Ticks Per Row", Row Size 24 (1 to 1000000),
 * Volume "Up/Down" / "Total" / "Delta", Value Area Volume 70 (0 to 100), histogram width 30 percent.
 * Everything else here is our own choice and listed in VOLUME_PROFILE_POLICIES.
 */
export const PROFILE_ROWS_LAYOUTS=['Number Of Rows','Ticks Per Row'] as const;
export type ProfileRowsLayout=typeof PROFILE_ROWS_LAYOUTS[number];
export const PROFILE_VOLUME_MODES=['Up/Down','Total','Delta'] as const;
export type ProfileVolumeMode=typeof PROFILE_VOLUME_MODES[number];
export const PROFILE_PLACEMENTS=['Left','Right'] as const;
export type ProfilePlacement=typeof PROFILE_PLACEMENTS[number];
export const PROFILE_PERIODS=['Auto','Session','Day','Week','Month'] as const;
export type ProfilePeriod=typeof PROFILE_PERIODS[number];
/** More rows than this in one profile are refused with a diagnostic instead of drawing thousands of boxes. */
export const PROFILE_MAX_ROWS=2000;

export interface ProfileRow {low:number;high:number;up:number;down:number}
export interface VolumeProfile {
 /** Calculation-bar index range the profile covers (inclusive). */
 from:number;to:number;
 /** Logical x edges of the profile area in bar-index units (pane edges for the visible range, bar edges for a period). */
 left:number;right:number;
 rows:ProfileRow[];rowHeight:number;low:number;high:number;total:number;maxRow:number;
 /** Row indices: point of control and the value area (inclusive). */
 poc:number;vaFrom:number;vaTo:number;
 pocPrice:number;vah:number;val:number;
 /** Chart bars whose volume came from lower-timeframe bars. */
 lowerTimeframeBars:number;
 /** Chart bars with volume and no finer bars whose high-low range crosses a row boundary, so their volume
  *  is spread evenly over more than one row. */
 spreadBars:number;
 /** Set when the profile asked for finer bars on demand and they are not there yet. */
 finer?:{state:'loading'|'unavailable';interval:string;message:string|null};
}
export interface ProfileOptions {rowsLayout:ProfileRowsLayout;rowSize:number;valueAreaPct:number;tickSize?:number|null;lowerTimeframe?:LowerTimeframeBars|null;resolution?:string|null}
/** Finer bars of the same instrument (seconds). The interval must be strictly shorter than the chart interval. */
export interface LowerTimeframeBars {interval:string;bars:readonly Bar[]}
/** What an on-demand finer-bar lookup has for one interval (the chart supplies it; absent = none). */
export interface FinerBarsResult {state:'ready'|'loading'|'unavailable';bars:readonly Bar[]|null;message:string|null}
export type FinerBarsLookup=(interval:string)=>FinerBarsResult;

export const VOLUME_PROFILE_POLICIES=Object.freeze([
 'OpenCandle-defined volume distribution: a bar\'s volume is spread over its high-low range in proportion to how much of the range each row covers. A bar with no range puts all of its volume in the row holding its price. The reference distribution rule is not captured.',
 'OpenCandle-defined lower timeframe: when finer bars of the same instrument are loaded, each chart bar that has at least one finer bar inside its span is distributed from those finer bars (each over its own high-low range) instead of from its own range. Chart bars without finer bars use their own range. Nothing finer is fetched or invented.',
 'OpenCandle-defined up and down volume: a bar closing above its open is up volume, below its open is down volume, and a bar closing at its open counts as up volume.',
 'OpenCandle-defined value area: starting at the point of control, the next two rows above and the next two rows below are compared and the pair with more volume is added (ties add the upper pair), until the value area holds at least the Value Area Volume percentage of the profile volume (the conventional Market Profile procedure). Reference parity is unverified.',
 'OpenCandle-defined point of control: the row with the most volume; on a tie, the row closest to the middle of the profile price range, then the lower one. VAH is the top of the highest value-area row and VAL the bottom of the lowest.',
 'OpenCandle-defined rows: Number Of Rows splits the profile high-low range into equal rows. Ticks Per Row uses rows of Row Size times the instrument tick size, aligned to multiples of the row height. More than '+PROFILE_MAX_ROWS+' rows are refused.',
]);

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const DAY=86400;
/** floor that treats a value within 1e-9 of the next integer as that integer (row boundaries computed in floating point). */
const snap=(value:number)=>Math.floor(value+1e-9);

/** Seconds of a time interval; null for tick/range or unknown resolutions. Months count 31 days (an upper bound for spans). */
function intervalSeconds(resolution:string|null|undefined):number|null{
 if(typeof resolution!=='string')return null;
 try{const spec=parseInterval(resolution);if(spec.kind!=='time')return null;if(spec.seconds!==null)return spec.seconds;return spec.multiplier*(spec.unit==='day'?DAY:spec.unit==='week'?7*DAY:31*DAY);}catch{return null;}
}

/** Fractional logical index of a time (seconds) over the bar grid, extrapolated by the bar cadence outside the bars
 *  (the same mapping the renderer uses for its time axis). */
export function logicalOfTime(bars:readonly {time:number}[],time:number,cadence?:number|null):number{
 const n=bars.length;if(!n)return 0;
 const step=cadence&&cadence>0?cadence:n>1?bars[n-1].time-bars[n-2].time:60;
 if(time<=bars[0].time)return step>0?(time-bars[0].time)/step:0;
 if(time>=bars[n-1].time)return n-1+(step>0?(time-bars[n-1].time)/step:0);
 let lo=0,hi=n-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(bars[mid].time<=time)lo=mid;else hi=mid;}
 const span=bars[hi].time-bars[lo].time;return lo+(span>0?(time-bars[lo].time)/span:0);
}

interface Source {high:number;low:number;open:number;close:number;volume:number}
/** The volume sources of each chart bar: its finer bars when any lie inside its span, else itself. */
function sources(bars:readonly Bar[],from:number,to:number,ltf:LowerTimeframeBars|null|undefined,resolution:string|null|undefined):{rows:Source[][];lower:number}{
 const out:Source[][]=[];let lower=0;
 const chartStep=intervalSeconds(resolution),fine=ltf?intervalSeconds(ltf.interval):null;
 const usable=!!ltf&&fine!==null&&(chartStep===null||fine<chartStep)&&ltf.bars.length>0;
 let j=0;
 for(let i=from;i<=to;i++){
  const bar=bars[i];
  if(usable){
   // A chart bar spans its declared interval (capped by the next bar): reading up to the next bar's time would pull finer
   // rows from a gap after the bar (overnight, weekend) into it, and only once that next bar exists (a look-ahead).
   const next=i+1<bars.length?bars[i+1].time:Infinity,end=chartStep!==null?Math.min(next,bar.time+chartStep):Number.isFinite(next)?next:bar.time+(i>0?bar.time-bars[i-1].time:fine!);
   const list=ltf!.bars;while(j<list.length&&list[j].time<bar.time)j++;
   const inside:Source[]=[];let k=j,ok=true;
   while(k<list.length&&list[k].time<end){const row=list[k];if(![row.high,row.low,row.open,row.close,row.volume].every(finite)||row.volume<0||row.high<row.low){ok=false;break;}inside.push(row);k++;}
   if(ok&&inside.length){out.push(inside);lower++;j=k;continue;}
  }
  // A chart bar without a finite high-low range has no price to put its volume at; it is skipped (one bad bar
  // must not null the whole profile through Math.min(low, NaN)).
  out.push(finite(bar.high)&&finite(bar.low)&&bar.high>=bar.low?[bar]:[]);
 }
 return {rows:out,lower};
}

function checkOptions(options:ProfileOptions):void{
 const {rowsLayout,rowSize,valueAreaPct}=options;
 if(!PROFILE_ROWS_LAYOUTS.includes(rowsLayout))throw new Error('Rows layout must be Number Of Rows or Ticks Per Row.');
 if(!Number.isSafeInteger(rowSize)||rowSize<1)throw new Error('Row size must be a positive integer.');
 if(!finite(valueAreaPct)||valueAreaPct<0||valueAreaPct>100)throw new Error('Value area volume must be from 0 through 100.');
}
/** A profile's row grid. exactTop: the top row's high is the profile high (Number Of Rows), else null. */
interface Grid {start:number;rowHeight:number;count:number;exactTop:number|null}
/** The row grid of a profile spanning [low, high]. */
function profileGrid(low:number,high:number,options:ProfileOptions):Grid{
 let start:number,rowHeight:number,count:number;
 if(options.rowsLayout==='Ticks Per Row'){
  const tick=options.tickSize;
  if(!finite(tick)||tick<=0)throw new Error('Ticks Per Row needs the instrument tick size, and this source does not declare one. Use Number Of Rows.');
  rowHeight=options.rowSize*tick;start=snap(low/rowHeight)*rowHeight;count=Math.max(1,snap((high-start)/rowHeight)+1);
 }else{
  count=options.rowSize;start=low;rowHeight=high>low?(high-low)/count:0;
  if(rowHeight===0){count=1;rowHeight=Math.max(finite(options.tickSize)&&options.tickSize>0?options.tickSize:0,Math.abs(low)*1e-6,1e-12);start=low-rowHeight/2;}
 }
 if(count>PROFILE_MAX_ROWS)throw new Error(`This profile needs ${count} rows; the limit is ${PROFILE_MAX_ROWS}. Use fewer rows or more ticks per row.`);
 return {start,rowHeight,count,exactTop:options.rowsLayout==='Number Of Rows'&&high>low?high:null};
}
const sameGrid=(a:Grid|null,b:Grid)=>!!a&&a.start===b.start&&a.rowHeight===b.rowHeight&&a.count===b.count&&a.exactTop===b.exactTop;
function emptyRows(grid:Grid):ProfileRow[]{
 const {start,rowHeight,count}=grid,rows:ProfileRow[]=Array.from({length:count},(_,k)=>({low:start+k*rowHeight,high:start+(k+1)*rowHeight,up:0,down:0}));
 if(grid.exactTop!==null)rows[count-1].high=grid.exactTop;
 return rows;
}
/** Adds one chart bar's volume sources to the rows. */
function binSources(rows:ProfileRow[],grid:Grid,list:readonly Source[]):void{
 const {start,rowHeight,count}=grid,rowOf=(price:number)=>Math.min(count-1,Math.max(0,snap((price-start)/rowHeight)));
 for(const s of list){
  if(!(s.volume>0))continue;
  const up=s.close>=s.open;
  const add=(k:number,v:number)=>{if(up)rows[k].up+=v;else rows[k].down+=v;};
  if(!(s.high>s.low)){add(rowOf(s.low),s.volume);continue;}
  const a=rowOf(s.low),b=rowOf(s.high),range=s.high-s.low;
  for(let k=a;k<=b;k++){const overlap=Math.min(s.high,rows[k].high)-Math.max(s.low,rows[k].low);if(overlap>0)add(k,s.volume*overlap/range);}
 }
}
/** Chart bars (not their finer bars) with volume whose high-low range touches more than one row of the grid. */
function spreadCount(bars:readonly Bar[],from:number,grouped:readonly (readonly Source[])[],grid:Grid):number{
 const {start,rowHeight,count}=grid,rowOf=(price:number)=>Math.min(count-1,Math.max(0,snap((price-start)/rowHeight)));let spread=0;
 for(let k=0;k<grouped.length;k++){const list=grouped[k],bar=bars[from+k];if(list.length!==1||list[0]!==bar||!(bar.volume>0)||!(bar.high>bar.low))continue;if(rowOf(bar.low)!==rowOf(bar.high))spread++;}
 return spread;
}
/** Point of control and value area of binned rows. */
function profileLevels(rows:readonly ProfileRow[],low:number,high:number,total:number,valueAreaPct:number){
 const count=rows.length,totals=rows.map(row=>row.up+row.down);
 let poc=0,maxRow=-Infinity;const middle=(low+high)/2,center=(k:number)=>Math.abs((rows[k].low+rows[k].high)/2-middle);
 for(let k=0;k<count;k++){const v=totals[k];if(v>maxRow||v===maxRow&&center(k)<center(poc)){maxRow=v;poc=k;}}
 const target=total*valueAreaPct/100;let vaFrom=poc,vaTo=poc,inside=totals[poc];
 while(inside<target&&(vaFrom>0||vaTo<count-1)){
  const above=(vaTo+1<count?totals[vaTo+1]:0)+(vaTo+2<count?totals[vaTo+2]:0),below=(vaFrom-1>=0?totals[vaFrom-1]:0)+(vaFrom-2>=0?totals[vaFrom-2]:0);
  const takeUp=vaTo<count-1&&(vaFrom===0||above>=below);
  if(takeUp){const n=Math.min(2,count-1-vaTo);vaTo+=n;inside+=above;}else{const n=Math.min(2,vaFrom);vaFrom-=n;inside+=below;}
 }
 return {maxRow,poc,vaFrom,vaTo,pocPrice:(rows[poc].low+rows[poc].high)/2,vah:rows[vaTo].high,val:rows[vaFrom].low};
}
/** Build one profile over calculation bars [from, to]. Returns null when the span has no volume. Throws on bad settings. */
export function buildVolumeProfile(bars:readonly Bar[],from:number,to:number,options:ProfileOptions,edges?:{left:number;right:number}):VolumeProfile|null{
 if(!(from>=0&&to<bars.length&&from<=to))return null;
 checkOptions(options);
 const grouped=sources(bars,from,to,options.lowerTimeframe,options.resolution??null);
 let low=Infinity,high=-Infinity,total=0;
 for(const list of grouped.rows)for(const s of list){if(!(s.volume>0))continue;low=Math.min(low,s.low);high=Math.max(high,s.high);total+=s.volume;}
 if(!(total>0)||!finite(low)||!finite(high))return null;
 const grid=profileGrid(low,high,options),rows=emptyRows(grid);
 for(const list of grouped.rows)binSources(rows,grid,list);
 const levels=profileLevels(rows,low,high,total,options.valueAreaPct),box=edges??{left:from-0.5,right:to+0.5};
 return {from,to,left:box.left,right:box.right,rows,rowHeight:grid.rowHeight,low,high,total,...levels,lowerTimeframeBars:grouped.lower,spreadBars:spreadCount(bars,from,grouped.rows,grid)};
}
/** Developing levels: the POC, VAH and VAL of the profile of bars [from, i] for every i in
 *  [from, to] (null until that profile has volume), so each value equals buildVolumeProfile(bars, from, i). The rows are
 *  rebuilt only when the prefix grid changes; otherwise the new bar is added to the same rows in the same order. */
export interface DevelopingLevels {poc:(number|null)[];vah:(number|null)[];val:(number|null)[]}
export function developingProfile(bars:readonly Bar[],from:number,to:number,options:ProfileOptions):DevelopingLevels{
 const length=from>=0&&to<bars.length&&from<=to?to-from+1:0,out:DevelopingLevels={poc:Array(length).fill(null),vah:Array(length).fill(null),val:Array(length).fill(null)};
 if(!length)return out;
 checkOptions(options);
 const grouped=sources(bars,from,to,options.lowerTimeframe,options.resolution??null);
 let low=Infinity,high=-Infinity,total=0,grid:Grid|null=null,rows:ProfileRow[]=[];
 for(let i=0;i<length;i++){
  for(const s of grouped.rows[i]){if(!(s.volume>0))continue;low=Math.min(low,s.low);high=Math.max(high,s.high);total+=s.volume;}
  if(!(total>0)||!finite(low)||!finite(high))continue;
  const next=profileGrid(low,high,options);
  if(sameGrid(grid,next))binSources(rows,next,grouped.rows[i]);
  else{grid=next;rows=emptyRows(next);for(let j=0;j<=i;j++)binSources(rows,next,grouped.rows[j]);}
  const levels=profileLevels(rows,low,high,total,options.valueAreaPct);
  out.poc[i]=levels.pocPrice;out.vah[i]=levels.vah;out.val[i]=levels.val;
 }
 return out;
}

/** Bars inside a visible range (seconds): every bar whose slot overlaps the pane, i.e. logical index within half a bar of the edges. */
export function visibleProfileSpan(bars:readonly Bar[],range:{from:number;to:number}|null|undefined,resolution?:string|null):{from:number;to:number;left:number;right:number}|null{
 if(!bars.length)return null;
 if(!range||!finite(range.from)||!finite(range.to)||range.to<range.from)return{from:0,to:bars.length-1,left:-0.5,right:bars.length-0.5};
 const cadence=intervalSeconds(resolution),left=logicalOfTime(bars,range.from,cadence),right=logicalOfTime(bars,range.to,cadence);
 const from=Math.max(0,Math.ceil(left-0.5)),to=Math.min(bars.length-1,Math.floor(right+0.5));
 if(from>to)return null;
 return {from,to,left,right};
}

/** Period groups for the Periodic volume profile: contiguous index runs [from, to] that share a period key. Session on
 *  US equity intraday bars keeps only regular-session bars; on daily bars, or a UTC calendar, Session equals Day. */
export function profilePeriods(bars:readonly Bar[],period:ProfilePeriod,options:{resolution?:string|null;calendar?:PivotCalendar|null}={}):{from:number;to:number}[]{
 if(!PROFILE_PERIODS.includes(period))throw new Error('Period must be Auto, Session, Day, Week or Month.');
 if(period==='Auto')return periodRuns(bars,autoProfileTimeframe(bars,options.resolution),false,options);
 return periodRuns(bars,period==='Week'?'Weekly':period==='Month'?'Monthly':'Daily',period==='Session',options);
}
/** Auto period of the Periodic volume profile: one profile per trading day on intraday charts, per month on 1D up to 1W,
 *  per quarter on 1W up to 1M and per year on longer charts, so every profile spans enough bars to read (a daily chart with
 *  Day periods drew one-bar-wide profiles). Same ladder as the Auto anchor of the Auto anchored volume profile. */
function autoProfileTimeframe(bars:readonly Bar[],resolution:string|null|undefined):RunTimeframe{
 const period=autoAnchorPeriod(bars,resolution);
 return period==='Session'?'Daily':period==='Week'?'Weekly':period==='Month'?'Monthly':period==='Quarter'?'Quarterly':'Yearly';
}
/** True when the bars are daily or longer: the declared resolution, else a smallest spacing of 20 hours or more. */
function barsAreDaily(bars:readonly Bar[],resolution:string|null|undefined):boolean{
 const step=intervalSeconds(resolution);if(step!==null)return step>=DAY;
 let spacing=Infinity;for(let i=1;i<bars.length;i++){const d=bars[i].time-bars[i-1].time;if(d>0)spacing=Math.min(spacing,d);}return spacing>=72000;
}
type RunTimeframe='Daily'|'Weekly'|'Monthly'|'Quarterly'|'Yearly';
/** Contiguous index runs sharing a period key. regularOnly drops US equity intraday bars outside the regular session. */
function periodRuns(bars:readonly Bar[],timeframe:RunTimeframe,regularOnly:boolean,options:{resolution?:string|null;calendar?:PivotCalendar|null}):{from:number;to:number}[]{
 const daily=barsAreDaily(bars,options.resolution);
 const calendar=pivotCalendar(bars,options.resolution??null,options.calendar??null);
 const out:{from:number;to:number}[]=[];let key:string|null=null;
 for(let i=0;i<bars.length;i++){
  const time=bars[i].time;
  if(regularOnly&&calendar==='us-equity'&&!daily&&usSessionPhase(time)!=='regular'){key=null;continue;}
  const next=pivotPeriodKey(time,timeframe,calendar,daily);
  if(next===null){key=null;continue;}
  if(next===key&&out.length)out[out.length-1].to=i;else{out.push({from:i,to:i});key=next;}
 }
 return out;
}

/** Session volume profile sessions. Regular keeps only regular-session bars of each trading date (the
 *  Periodic profile's Session period); Extended keeps every loaded bar of the trading date (its Day period). */
export const PROFILE_SESSIONS=['Regular','Extended'] as const;
export type ProfileSession=typeof PROFILE_SESSIONS[number];
export function sessionProfilePeriods(bars:readonly Bar[],session:ProfileSession,options:{resolution?:string|null;calendar?:PivotCalendar|null}={}):{from:number;to:number}[]{
 if(!PROFILE_SESSIONS.includes(session))throw new Error('Session must be Regular or Extended.');
 return periodRuns(bars,'Daily',session==='Regular',options);
}

/** Auto anchored volume profile anchors. */
export const AUTO_ANCHORS=['Auto','Highest High','Lowest Low','Highest Volume','Session','Week','Month','Quarter','Year'] as const;
export type AutoAnchor=typeof AUTO_ANCHORS[number];
export type AutoAnchorPeriod='Session'|'Week'|'Month'|'Quarter'|'Year';
/** Auto: intraday charts anchor at the Session, 1D up to 1W at the Month, 1W up to 1M at the
 *  Quarter, 1M and longer at the Year. Without a declared resolution the bar spacing decides (20 hours or more: daily). */
export function autoAnchorPeriod(bars:readonly Bar[],resolution?:string|null):AutoAnchorPeriod{
 const step=intervalSeconds(resolution);
 if(step===null)return barsAreDaily(bars,resolution)?'Month':'Session';
 return step<DAY?'Session':step<7*DAY?'Month':step<28*DAY?'Quarter':'Year';
}
/** The first calculation bar of the auto anchored profile (it always ends at the last bar); null without bars.
 * Highest High, Lowest Low and Highest Volume look back over the last `length` bars (the last bar
 *  included) and anchor at the bar with the extreme value, the latest such bar on a tie. Bars without a finite value are
 *  skipped; when none has one the anchor is the first bar of the window. Period anchors start at the first bar of the
 *  period that holds the last bar (Session: its trading date, every loaded bar of it). */
export function autoAnchorStart(bars:readonly Bar[],anchor:AutoAnchor,length:number,options:{resolution?:string|null;calendar?:PivotCalendar|null}={}):number|null{
 if(!AUTO_ANCHORS.includes(anchor))throw new Error('Anchor must be one of '+AUTO_ANCHORS.join(', ')+'.');
 if(!Number.isSafeInteger(length)||length<1)throw new Error('Length must be a positive integer.');
 const n=bars.length;if(!n)return null;
 if(anchor==='Highest High'||anchor==='Lowest Low'||anchor==='Highest Volume'){
  const first=Math.max(0,n-length),value=(bar:Bar)=>anchor==='Highest High'?bar.high:anchor==='Lowest Low'?-bar.low:bar.volume;
  let best=first,top=-Infinity;
  for(let i=first;i<n;i++){const v=value(bars[i]);if(finite(v)&&v>=top){top=v;best=i;}}
  return best;
 }
 const period=anchor==='Auto'?autoAnchorPeriod(bars,options.resolution):anchor;
 const timeframe:RunTimeframe=period==='Session'?'Daily':period==='Week'?'Weekly':period==='Month'?'Monthly':period==='Quarter'?'Quarterly':'Yearly';
 const runs=periodRuns(bars,timeframe,false,options),last=runs.at(-1);
 return last&&last.to===n-1?last.from:n-1;
}

/** Session volume profile HD rows: the row height is the visible price range (the high-low range of
 *  the bars that overlap the pane, else of every bar) divided by Row Size, shared by every session, so zooming in gives
 *  finer rows. The height is raised where needed so no session needs more than the row limit. Returns null when no bar
 *  has a positive range. */
export function hdRowHeight(bars:readonly Bar[],visible:{from:number;to:number}|null,rows:number,sessions:readonly {from:number;to:number}[]):number|null{
 if(!Number.isSafeInteger(rows)||rows<1)throw new Error('Row size must be a positive integer.');
 const span=visible??{from:0,to:bars.length-1};let low=Infinity,high=-Infinity;
 for(let i=Math.max(0,span.from);i<=Math.min(bars.length-1,span.to);i++){const b=bars[i];if(finite(b.low)&&finite(b.high)){low=Math.min(low,b.low);high=Math.max(high,b.high);}}
 if(!(high>low))return null;
 let height=(high-low)/rows;
 for(const run of sessions){let lo=Infinity,hi=-Infinity;for(let i=run.from;i<=run.to;i++){const b=bars[i];if(finite(b.low)&&finite(b.high)){lo=Math.min(lo,b.low);hi=Math.max(hi,b.high);}}if(hi>lo)height=Math.max(height,(hi-lo)/(PROFILE_MAX_ROWS-2));}
 return height;
}

/** Finer interval: the interval a profile asks for on demand, by chart interval: 1W and longer read
 *  1D bars, 1D up to 1W read 30m, 1h up to 1D read 5m, and 2m up to 1h read 1m. 1m and shorter charts, and event or
 *  range bars, ask for nothing. No reference fact records the interval the reference profiles read. */
export const PROFILE_FINER_INTERVALS:readonly (readonly [minimumSeconds:number,interval:string])[]=Object.freeze([[7*DAY,'1D'],[DAY,'30m'],[3600,'5m'],[120,'1m']]);
export function profileFinerInterval(resolution:string|null|undefined):string|null{
 const step=intervalSeconds(resolution);if(step===null)return null;
 return PROFILE_FINER_INTERVALS.find(([minimum])=>step>=minimum)?.[1]??null;
}
/** On demand: `build` makes the profiles with the given finer bars. When some profile still spreads
 *  a bar over more than one row, the finer interval is asked for once. Ready bars build the profiles again, and the build
 *  that spreads fewer bars is kept (the first one on a tie). While the bars load, or when they cannot be read, the first
 *  profiles stay and the ones that spread a bar carry `finer`. Returns the finer bars the kept profiles used. */
export function withFinerBars<T extends {profiles:VolumeProfile[]}>(build:(lowerTimeframe:LowerTimeframeBars|null)=>T,loaded:LowerTimeframeBars|null,lookup:FinerBarsLookup|null|undefined,resolution:string|null|undefined):T&{lowerTimeframe:LowerTimeframeBars|null}{
 const first=build(loaded),spread=(out:T)=>out.profiles.reduce((sum,p)=>sum+p.spreadBars,0);
 const interval=lookup?profileFinerInterval(resolution):null;
 if(!lookup||!interval||!spread(first))return {...first,lowerTimeframe:loaded};
 let found:FinerBarsResult;
 try{found=lookup(interval);}catch(error){found={state:'unavailable',bars:null,message:error instanceof Error?error.message:String(error)};}
 if(found.state==='ready'&&Array.isArray(found.bars)&&found.bars.length){
  const fetched={interval,bars:found.bars};let second:T|null=null;
  try{second=build(fetched);}catch{second=null;}// finer bars that cannot build a profile (a row limit) keep the first build
  return second&&spread(second)<spread(first)?{...second,lowerTimeframe:fetched}:{...first,lowerTimeframe:loaded};
 }
 const state=found.state==='ready'?'unavailable':found.state,finer={state,interval,message:found.message??null} as const;
 return {...first,profiles:first.profiles.map(p=>p.spreadBars>0?{...p,finer}:p),lowerTimeframe:loaded};
}
