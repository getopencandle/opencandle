import type {Bar,NumericSeries} from '../types';
import {parseInterval} from '../intervals';

/** Original session-window model with explicit LV policies. Historical geometry is separate from causal prefix plots. */
export interface TradingWindow {enabled:boolean;name:string;start:string;end:string;zone:string;color:string}
export interface TradingSessionRecord {window:number;day:number;name:string;color:string;first:number;last:number;from:number;to:number;count:number;open:number;close:number;high:number;low:number;average:number;rangeTicks:number|null;available:boolean}
export interface TradingSessionsResult {series:readonly NumericSeries[];sessions:readonly Readonly<TradingSessionRecord>[];diagnostics:readonly string[];timezoneReads:number}
export interface TradingSessionsSource {resolution:string|null;exchangeZone?:string|null;style?:string|null;tickSize?:number|null}
const DAY=86400,HOUR=3600,NUMERIC_LIMIT=2000000,STYLES=new Set(['candles','bars','hlcbars','line','linemarkers','step','area','hlcarea','baseline','columns','highlow','hollow','volumecandles']);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
export function sessionMinute(text:string):number{
 if(typeof text!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(text))throw Error('Session times must use HH:mm from 00:00 through 23:59.');
 return Number(text.slice(0,2))*60+Number(text.slice(3));
}
export function sessionZone(text:string,exchangeZone?:string|null):{zone:string;offset:number|null}{
 if(typeof text!=='string'||text.length>80)throw Error('Session time zones must be bounded IANA names or UTC offsets.');
 const zone=text.trim()||(typeof exchangeZone==='string'?exchangeZone.trim():'');if(!zone)throw Error('Choose a session time zone because the source exchange time zone is unavailable.');
 const fixed=/^(?:UTC|GMT)(?:([+-])(\d{1,2})(?::?([0-5]\d))?)?$/.exec(zone);
 if(fixed){const hours=Number(fixed[2]??0),minutes=Number(fixed[3]??0);if(hours>14||hours===14&&minutes!==0)throw Error('Fixed session time zones must be between UTC-14:00 and UTC+14:00.');return{zone,offset:(fixed[1]==='-'?-1:1)*(hours*3600+minutes*60)};}
 try{const formatter=new Intl.DateTimeFormat('en-US',{timeZone:zone});return{zone:formatter.resolvedOptions().timeZone,offset:null};}catch{throw Error('Choose a supported IANA session time zone or a fixed UTC offset.');}
}
export function validateTradingWindow(window:TradingWindow,exchangeZone?:string|null):void{
 if(!window||typeof window!=='object'||typeof window.enabled!=='boolean'||typeof window.name!=='string'||window.name.length>40||typeof window.start!=='string'||typeof window.end!=='string'||typeof window.zone!=='string'||typeof window.color!=='string'||!/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(window.color))throw Error('Session configuration requires a name, times, time zone and hexadecimal color.');
 if(!window.enabled)return;
 if(!window.name.trim())throw Error('Enabled trading sessions need a name.');sessionMinute(window.start);sessionMinute(window.end);sessionZone(window.zone,exchangeZone);
}
/** Cached formatter objects are bounded; each calculation keeps only the current UTC hour per used zone.
 * Offset transitions within an hour are located to the second, including half-hour DST transitions.
 * The IANA/Intl time-zone database has at most one offset transition within a UTC hour. */
const formatters=new Map<string,Intl.DateTimeFormat>();
function formatter(zone:string):Intl.DateTimeFormat{
 let value=formatters.get(zone);if(value)return value;
 value=new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 if(formatters.size>=16)formatters.delete(formatters.keys().next().value!);formatters.set(zone,value);return value;
}
function localClock(zone:{zone:string;offset:number|null},read:()=>void):(time:number)=>{day:number;minute:number}{
 const fixed=zone.offset;let hour=NaN,first=0,second=0,transition=Infinity,lastTime=NaN,lastClock:{day:number;minute:number}|undefined;
 const offsetAt=(time:number)=>{read();const parts=formatter(zone.zone).formatToParts(new Date(time*1000)),values:Record<string,number>={};for(const part of parts)if(part.type!=='literal')values[part.type]=Number(part.value);
  const local=new Date(0);local.setUTCFullYear(values.year,values.month-1,values.day);local.setUTCHours(values.hour,values.minute,values.second,0);const offset=local.getTime()/1000-time;if(!finite(offset)||Math.abs(offset)>DAY)throw Error('The session time zone cannot resolve this timestamp.');return offset;};
 return time=>{if(lastTime===time&&lastClock)return lastClock;let offset=fixed;if(offset===null){const next=Math.floor(time/HOUR)*HOUR;if(next!==hour){hour=next;first=offsetAt(hour);second=offsetAt(hour+HOUR-1);transition=Infinity;if(first!==second){let low=hour,high=hour+HOUR-1;while(high-low>1){const middle=Math.floor((low+high)/2);if(offsetAt(middle)===first)low=middle;else high=middle;}transition=high;}}offset=time<transition?first:second;}
  const local=time+offset,day=Math.floor(local/DAY);lastTime=time;lastClock={day,minute:Math.floor((local-day*DAY)/60)};return lastClock;};
}
export function tradingSessionSourceSeconds(source:TradingSessionsSource):number{
 if(!source||typeof source.resolution!=='string')throw Error('Trading sessions need a declared intraday interval.');
 const interval=parseInterval(source.resolution);if(interval.kind!=='time'||!finite(interval.seconds)||interval.seconds<=0||interval.seconds>=DAY||['day','week','month'].includes(interval.unit))throw Error('Trading sessions are available on intraday time charts only.');
 if(typeof source.style!=='string'||!STYLES.has(source.style))throw Error('Trading sessions need a supported time-based price chart.');return interval.seconds;
}
interface ActiveWindow {index:number;window:TradingWindow;start:number;end:number;zone:string;clock:(time:number)=>{day:number;minute:number};current:TradingSessionRecord|null}
/** Worst-case geometry is accounted separately by the existing indicator batch budget before chart calculation.
 * Missing bars are never filled, and no session final statistic is backfilled into an earlier scalar. */
export function tradingSessions(bars:readonly Bar[],windows:readonly TradingWindow[],source:TradingSessionsSource):TradingSessionsResult{
 if(!Array.isArray(bars)||bars.length>100000||!Array.isArray(windows)||windows.length!==3)throw Error('Trading sessions require at most 100,000 bars and exactly three window configurations.');
 const seconds=tradingSessionSourceSeconds(source);let timezoneReads=0;const series:NumericSeries[]=windows.map(()=>Array(bars.length).fill(null)),sessions:Readonly<TradingSessionRecord>[]=[],diagnostics:string[]=[],clocks=new Map<string,(time:number)=>{day:number;minute:number}>(),active:ActiveWindow[]=[];
 windows.forEach((window,index)=>{validateTradingWindow(window,source.exchangeZone);if(!window.enabled)return;const zone=sessionZone(window.zone,source.exchangeZone),key=zone.offset===null?zone.zone:'fixed:'+zone.offset;let clock=clocks.get(key);if(!clock){clock=localClock(zone,()=>{timezoneReads++;});clocks.set(key,clock);}active.push({index,window,start:sessionMinute(window.start),end:sessionMinute(window.end),zone:key,clock,current:null});});
 if(!active.length)diagnostics.push('Configure and enable a trading session window to draw its observations.');
 const finish=(state:ActiveWindow)=>{if(state.current){if(bars.length*3+(sessions.length+1)*13>NUMERIC_LIMIT)throw Error('Trading session statistics exceed the local indicator output limit. Reduce history or enabled windows.');sessions.push(Object.freeze(state.current));state.current=null;}};
 let previous=-Infinity;const tick=finite(source.tickSize)&&source.tickSize>0?source.tickSize:null;
 for(let index=0;index<bars.length;index++){
  const bar=bars[index];if(!bar||!Number.isSafeInteger(bar.time)||bar.time<=previous||bar.time<-62135596800||bar.time>253402300799-seconds)throw Error('Trading sessions require strictly increasing valid opening timestamps.');previous=bar.time;
  for(const state of active){const {day,minute}=state.clock(bar.time),{start,end}=state;
   if(start<end?minute<start||minute>=end:start>end?minute<start&&minute>=end:false)continue;
   const sessionDay=day-(start>=end&&minute<start?1:0);if(state.current?.day!==sessionDay)finish(state);
   const valid=[bar.open,bar.high,bar.low,bar.close].every(finite)&&bar.low<=Math.min(bar.open,bar.close)&&bar.high>=Math.max(bar.open,bar.close);
   let current=state.current;if(!current){current={window:state.index,day:sessionDay,name:state.window.name.trim(),color:state.window.color,first:index,last:index,from:bar.time,to:bar.time+seconds,count:0,open:valid?bar.open:NaN,close:NaN,high:valid?bar.high:NaN,low:valid?bar.low:NaN,average:0,rangeTicks:null,available:true};state.current=current;}
   current.count++;current.last=index;current.to=bar.time+seconds;current.available=current.available&&valid;
   if(current.available){current.close=bar.close;current.high=Math.max(current.high,bar.high);current.low=Math.min(current.low,bar.low);current.average=current.average*((current.count-1)/current.count)+bar.close/current.count;current.rangeTicks=tick===null?null:(current.high-current.low)/tick;if(!finite(current.average)||!finite(current.high-current.low)||current.rangeTicks!==null&&!finite(current.rangeTicks))current.available=false;}
   if(current.available)series[state.index][index]=current.average;
  }
 }
 active.forEach(finish);if(sessions.some(session=>!session.available))diagnostics.push('A session has invalid supplied prices, so its box and statistics are unavailable.');
 if(tick===null&&sessions.length)diagnostics.push('Session range in ticks is unavailable because the source tick size is unknown.');
 return Object.freeze({series:Object.freeze(series.map(values=>Object.freeze(values) as unknown as NumericSeries)),sessions:Object.freeze(sessions),diagnostics:Object.freeze(diagnostics),timezoneReads});
}
