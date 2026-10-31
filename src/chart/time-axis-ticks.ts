// The time hours format (options
// 24-hours / 12-hours) on the time-axis tick labels. The pinned renderer (@luxalgo/vela 0.8.4, chrome drawTimeAxis) builds
// intraday tick text as "HH:MM" from the chart-zone wall clock and has no tick hook. Rather than a new package patch, this
// owns one instance method of the renderer's chrome layer (the same seam as indicator-display.ts): while 12-hours is
// selected, drawTimeAxis receives a canvas wrapper whose fillText and measureText turn a label of the exact "HH:MM" shape
// into "h:mm AM" (the crosshair label pattern of formatTimeOfDay). Measuring the drawn text keeps the renderer's own
// collision spacing honest. Dates, months and years pass through unchanged. 24-hours calls the native method untouched.
// The 12-hour tick text pattern is our own choice: no cited fact shows the reference's 12-hour tick labels.
// Date format and Day of week (scales.dateFormat, scales.dayOfWeek) reach the day ticks
// too, as in the reference. The renderer's day tick is "Oct 21" (a day boundary); with a date format other than the
// factory one, or Day of week off, it is redrawn as the crosshair date text for that day ("2026-10-21", "Wed 21 Oct '26";
// formatTimeScaleDate). The year comes from the visible range. Month ("Oct") and year ("2026") ticks pass through. The
// factory settings (format-3 with Day of week) keep the renderer's own "Oct 21" ticks, as the crosshair keeps its native
// stamp (rendererDrawsTimeScale); that rule and the redrawn tick text are our own choice.
import {frameCoords} from './derived-time-labels';
import {DEFAULT_TIME_SCALE_SETTINGS,TIME_SCALE_DATE_FORMAT_IDS,formatTimeScaleDate,zonedParts,type TimeScaleSettings} from './time-axis-format';
export type TimeAxisHours='24'|'12';
export interface TimeAxisTickController {set(hours:TimeAxisHours):void;hours():TimeAxisHours;setFormat(settings:TimeScaleSettings):void;format():TimeScaleSettings;dispose():void}
type Method=(this:unknown,...args:unknown[])=>unknown;
const owners=new WeakSet<object>();
const TICK=/^(\d{2}):(\d{2})$/;

/** "13:05" -> "1:05 PM"; null for any other text (a date, month, year or malformed time). */
export function twelveHourTick(label:string):string|null{
 const match=TICK.exec(label);if(!match)return null;
 const hour=Number(match[1]),minute=Number(match[2]);if(hour>23||minute>59)return null;
 return `${hour%12===0?12:hour%12}:${match[2]} ${hour<12?'AM':'PM'}`;
}

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_TICK=/^([A-Z][a-z]{2}) (\d{1,2})$/,DAY_MS=86400000;
/** "Oct 21" in the visible range `range` (epoch ms) of `zone` -> that day in the date format; null for any other text. */
export function dateTick(label:string,range:{from:number;to:number},zone:string,settings:Pick<TimeScaleSettings,'dayOfWeek'|'dateFormat'>):string|null{
 const match=DAY_TICK.exec(label);if(!match)return null;
 const month=MONTHS.indexOf(match[1]),day=Number(match[2]);if(month<0)return null;
 const first=zonedParts(range.from,zone),last=zonedParts(range.to,zone);if(!first||!last)return null;
 const from=Date.UTC(first.y,first.m,first.d)-DAY_MS,to=Date.UTC(last.y,last.m,last.d)+DAY_MS;
 for(let year=first.y-1;year<=last.y+1;year++){
  const at=Date.UTC(year,month,day);if(new Date(at).getUTCDate()!==day||at<from||at>to)continue;
  return formatTimeScaleDate(at+DAY_MS/2,'UTC',{dayOfWeek:settings.dayOfWeek,dateFormat:settings.dateFormat,timeHours:'24'});
 }
 return null;
}

function rewritingCanvas(ctx:object,rewriteText:(text:string)=>string):object{
 const rewrite=(text:unknown)=>typeof text==='string'?rewriteText(text):text;
 const bound=new Map<PropertyKey,Method>();
 return new Proxy(ctx,{
  get(target,key){
   if(key==='fillText')return (text:unknown,...rest:unknown[])=>Reflect.apply(Reflect.get(target,key) as Method,target,[rewrite(text),...rest]);
   if(key==='measureText')return (text:unknown)=>Reflect.apply(Reflect.get(target,key) as Method,target,[rewrite(text)]);
   const value=Reflect.get(target,key);if(typeof value!=='function')return value;
   let fn=bound.get(key);if(!fn||(fn as {lvSource?:unknown}).lvSource!==value){const source=value as Method;fn=Object.assign((...args:unknown[])=>Reflect.apply(source,target,args),{lvSource:value});bound.set(key,fn);}
   return fn;
  },
  set(target,key,value){return Reflect.set(target,key,value);},
 });
}

export function installTimeAxisTicks(renderer:object):TimeAxisTickController{
 const chrome=(renderer as {chrome?:unknown}).chrome;
 const original=chrome&&typeof chrome==='object'?(chrome as {drawTimeAxis?:unknown}).drawTimeAxis:undefined;
 if(!chrome||typeof chrome!=='object'||typeof original!=='function')throw Error('This chart renderer has no time axis to format.');
 if(owners.has(chrome)||Object.hasOwn(chrome,'drawTimeAxis'))throw Error('The time axis tick format is already installed on this chart.');
 let settings:TimeScaleSettings={...DEFAULT_TIME_SCALE_SETTINGS},active=true;
 const owned=function(this:unknown,ctx:unknown,...args:unknown[]){
  // A derived chart type's ticks are placed and labelled in the bricks' source times.
  const rest=args.length>1?[args[0],frameCoords(renderer,args[1]),...args.slice(2)]:args;
  const twelve=settings.timeHours==='12',dates=settings.dateFormat!==DEFAULT_TIME_SCALE_SETTINGS.dateFormat||settings.dayOfWeek!==DEFAULT_TIME_SCALE_SETTINGS.dayOfWeek;
  if((twelve||dates)&&ctx&&typeof ctx==='object'){
   const [scene,coords]=rest as [{timezone?:unknown}|undefined,{visibleTimeRange?:()=>{from:number;to:number}}|undefined];
   let range:{from:number;to:number}|null=null;
   if(dates)try{const visible=coords?.visibleTimeRange?.();if(visible&&Number.isFinite(visible.from)&&Number.isFinite(visible.to))range=visible;}catch{range=null;}
   const zone=typeof scene?.timezone==='string'?scene.timezone:'UTC',shown=settings;
   const rewrite=(text:string)=>(twelve?twelveHourTick(text):null)??(range?dateTick(text,range,zone,shown):null)??text;
   return Reflect.apply(original as Method,this,[rewritingCanvas(ctx,rewrite),...rest]);
  }
  return Reflect.apply(original as Method,this,[ctx,...rest]);
 };
 Object.defineProperty(chrome,'drawTimeAxis',{configurable:true,writable:true,value:owned});owners.add(chrome);
 const invalidate=()=>{try{(renderer as {scheduler?:{invalidate?:(level:number)=>void}|null}).scheduler?.invalidate?.(4);}catch{/* the next frame repaints */}};
 return{
  set(next){if(!active)throw Error('The time axis tick format is retired.');if(next!=='12'&&next!=='24')throw Error('Time hours format must be 12 or 24.');if(next===settings.timeHours)return;settings={...settings,timeHours:next};invalidate();},
  hours:()=>settings.timeHours,
  setFormat(next){
   if(!active)throw Error('The time axis tick format is retired.');
   if(!next||(next.timeHours!=='12'&&next.timeHours!=='24'))throw Error('Time hours format must be 12 or 24.');
   if(typeof next.dayOfWeek!=='boolean')throw Error('Day of week on labels must be on or off.');
   if(!TIME_SCALE_DATE_FORMAT_IDS.includes(next.dateFormat))throw Error('Unknown Date format: '+String(next.dateFormat));
   if(next.timeHours===settings.timeHours&&next.dayOfWeek===settings.dayOfWeek&&next.dateFormat===settings.dateFormat)return;
   settings={dayOfWeek:next.dayOfWeek,dateFormat:next.dateFormat,timeHours:next.timeHours};invalidate();
  },
  format:()=>({...settings}),
  dispose(){
   if(!active)return;active=false;owners.delete(chrome);
   if((chrome as {drawTimeAxis?:unknown}).drawTimeAxis!==owned)throw Error('The time axis tick cleanup found a foreign method and left it in place.');
   delete (chrome as {drawTimeAxis?:unknown}).drawTimeAxis;invalidate();
  },
 };
}
