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
import {axisFrameCoords} from './derived-time-labels';
import {barTimeTicks,type BarTick} from './bar-time-ticks';
import {DEFAULT_TIME_SCALE_SETTINGS,TIME_SCALE_DATE_FORMAT_IDS,formatTimeScaleDate,zonedParts,type TimeScaleSettings} from './time-axis-format';
export type TimeAxisHours='24'|'12';
export interface TimeAxisTickController {set(hours:TimeAxisHours):void;hours():TimeAxisHours;setFormat(settings:TimeScaleSettings):void;format():TimeScaleSettings;dispose():void}
type Method=(this:unknown,...args:unknown[])=>unknown;
const owners=new WeakSet<object>();
const TICK=/^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** "13:05" -> "1:05 PM" ("13:05:30" -> "1:05:30 PM"); null for any other text (a date, month, year or malformed time). */
export function twelveHourTick(label:string):string|null{
 const match=TICK.exec(label);if(!match)return null;
 const hour=Number(match[1]),minute=Number(match[2]);if(hour>23||minute>59||(match[3]!==undefined&&Number(match[3])>59))return null;
 return `${hour%12===0?12:hour%12}:${match[2]}${match[3]!==undefined?':'+match[3]:''} ${hour<12?'AM':'PM'}`;
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

// Tick placement. The renderer's own ticks step evenly through clock time although its x axis is the bar index, so on a
// chart with closed-market gaps they pile up in the gap (bar-time-ticks.ts). Both places that draw them are owned here and
// share one tick set taken from the bars: the labels (chrome drawTimeAxis) and the vertical grid lines (backdrop drawGrid).
// The renderer still draws everything else of each method (axis border line, horizontal grid). A coordinate object that
// cannot be read as bars (a test stub, an empty chart) keeps the renderer's own ticks.
type BarCoords={visibleLogicalRange:()=>{from:number;to:number};logicalToTime:(logical:number)=>number;logicalToX:(logical:number)=>number;timeToX:(ms:number)=>number;barInterval:number;barCount?:number};
const readable=(coords:unknown):coords is BarCoords=>{const c=coords as Record<string,unknown>|null;return !!c&&typeof c==='object'&&typeof c.visibleLogicalRange==='function'&&typeof c.logicalToTime==='function'&&typeof c.logicalToX==='function'&&typeof c.timeToX==='function';};
const HOUR_MS=3600000,offsetCache=new Map<string,Map<number,number>>();
/** The zone's offset at a time, read per clock hour (so a daylight-saving change inside the view is right) and kept. */
function zoneOffsets(zone:string):(ms:number)=>number{
 if(!zone||zone==='UTC')return()=>0;
 let hours=offsetCache.get(zone);if(!hours){hours=new Map();offsetCache.set(zone,hours);}
 const known=hours;let lastHour=NaN,lastOffset=0;
 return ms=>{
  const hour=Math.floor(ms/HOUR_MS);if(hour===lastHour)return lastOffset;
  let offset=known.get(hour);
  if(offset===undefined){const at=hour*HOUR_MS,p=zonedParts(at,zone);offset=p?Date.UTC(p.y,p.m,p.d,p.h,p.min)-at:0;if(known.size>50000)known.clear();known.set(hour,offset);}
  lastHour=hour;lastOffset=offset;return offset;
 };
}
/** Least room between two ticks (CSS px): a label and its gap. */
const TICK_SPACING_PX=80;
interface PlacedTick extends BarTick{x:number}
type TickMemo={key:string;ticks:PlacedTick[]|null};
const memos=new WeakMap<object,TickMemo>();
/** The frame's ticks with their x, or null to keep the renderer's own. `coords` is the axis view (axisFrameCoords). */
function frameTicks(renderer:object,coords:unknown,zone:string,dataW:number):PlacedTick[]|null{
 if(!readable(coords)||!Number.isFinite(dataW)||!(dataW>0))return null;
 try{
  const range=coords.visibleLogicalRange(),interval=Number(coords.barInterval);
  if(!range||!Number.isFinite(range.from)||!Number.isFinite(range.to)||!(interval>0))return null;
  const lo=Math.ceil(range.from),hi=Math.floor(range.to),first=coords.logicalToTime(lo-1),last=coords.logicalToTime(hi),middle=coords.logicalToTime((range.from+range.to)/2);
  const pitch=coords.logicalToX(1)-coords.logicalToX(0);if(!Number.isFinite(pitch)||!(pitch>0))return null;
  const key=[range.from,range.to,first,last,middle,interval,zone,pitch,dataW,Number(coords.barCount)].join('|'),memo=memos.get(renderer);
  if(memo&&memo.key===key)return memo.ticks;
  // A daily or longer bar stamped at UTC midnight is a calendar date, not an instant: it keeps its own date in any zone
  // (a west-of-UTC zone would otherwise read it as the evening before and label it a day, or a month, early).
  const zoned=zoneOffsets(zone),offsetAt=interval>=DAY_MS?(ms:number)=>ms%DAY_MS===0?0:zoned(ms):zoned;
  const found=barTimeTicks({from:range.from,to:range.to,timeAt:logical=>coords.logicalToTime(logical),intervalMs:interval,offsetAt,minBars:TICK_SPACING_PX/pitch});
  // A tick whose time has no x on this axis is dropped (a derived chart type has no dates past its last brick).
  const ticks=found?found.filter(tick=>Number.isFinite(coords.timeToX(tick.time))).map(tick=>({...tick,x:coords.logicalToX(tick.logical)})).filter(tick=>Number.isFinite(tick.x)):null;
  memos.set(renderer,{key,ticks});return ticks;
 }catch{return null;}
}
/** A view of `target` with some properties replaced; methods stay bound to the real object. */
function viewOf<T extends object>(target:T,own:Record<string,unknown>):T{
 return new Proxy(target,{get(real,key){if(typeof key==='string'&&Object.hasOwn(own,key))return own[key];const value=Reflect.get(real,key,real);return typeof value==='function'?value.bind(real):value;}});
}
const LABEL_GAP=12,LABEL_EDGE=20;
function drawTickLabels(ctx:CanvasRenderingContext2D,ticks:readonly PlacedTick[],color:unknown,dataW:number,dataH:number,fullH:number):void{
 if(typeof color==='string')ctx.fillStyle=color;ctx.textAlign='center';
 const y=dataH+(fullH-dataH)/2,placed:{l:number;r:number}[]=[];
 const shown=ticks.filter(tick=>tick.x>=LABEL_EDGE&&tick.x<=dataW-LABEL_EDGE).map(tick=>({...tick,half:ctx.measureText(tick.label).width/2}));
 const put=(tick:typeof shown[number])=>{const l=tick.x-tick.half,r=tick.x+tick.half;if(!placed.every(p=>r+LABEL_GAP<=p.l||l-LABEL_GAP>=p.r))return;placed.push({l,r});ctx.fillText(tick.label,tick.x,y);};
 for(const tick of shown.sort((a,b)=>b.weight-a.weight||a.x-b.x))put(tick);
 ctx.textAlign='start';
}

export function installTimeAxisTicks(renderer:object):TimeAxisTickController{
 const chrome=(renderer as {chrome?:unknown}).chrome;
 const original=chrome&&typeof chrome==='object'?(chrome as {drawTimeAxis?:unknown}).drawTimeAxis:undefined;
 if(!chrome||typeof chrome!=='object'||typeof original!=='function')throw Error('This chart renderer has no time axis to format.');
 if(owners.has(chrome)||Object.hasOwn(chrome,'drawTimeAxis'))throw Error('The time axis tick format is already installed on this chart.');
 let settings:TimeScaleSettings={...DEFAULT_TIME_SCALE_SETTINGS},active=true;
 const owned=function(this:unknown,ctx:unknown,...args:unknown[]){
  // A derived chart type's ticks are placed and labelled in the bricks' source times.
  const rest=args.length>1?[args[0],axisFrameCoords(renderer,args[1]),...args.slice(2)]:args;
  const twelve=settings.timeHours==='12',dates=settings.dateFormat!==DEFAULT_TIME_SCALE_SETTINGS.dateFormat||settings.dayOfWeek!==DEFAULT_TIME_SCALE_SETTINGS.dayOfWeek;
  if((twelve||dates)&&ctx&&typeof ctx==='object'){
   const [scene,coords]=rest as [{timezone?:unknown}|undefined,{visibleTimeRange?:()=>{from:number;to:number}}|undefined];
   let range:{from:number;to:number}|null=null;
   if(dates)try{const visible=coords?.visibleTimeRange?.();if(visible&&Number.isFinite(visible.from)&&Number.isFinite(visible.to))range=visible;}catch{range=null;}
   const zone=typeof scene?.timezone==='string'?scene.timezone:'UTC',shown=settings;
   const rewrite=(text:string)=>(twelve?twelveHourTick(text):null)??(range?dateTick(text,range,zone,shown):null)??text;
   return paint.call(this,rewritingCanvas(ctx,rewrite),rest);
  }
  return paint.call(this,ctx,rest);
 };
 // The labels of one frame: ours from the bars when the axis can be read as bars, else the renderer's own.
 const paint=function(this:unknown,ctx:unknown,rest:unknown[]):unknown{
  const [scene,coords,,dataW,dataH,fullH]=rest as [Record<string,unknown>|undefined,unknown,unknown,number,number,number];
  const zone=typeof scene?.timezone==='string'?scene.timezone:'UTC';
  const ticks=scene&&typeof scene==='object'&&ctx&&typeof ctx==='object'&&Number.isFinite(dataH)&&Number.isFinite(fullH)?frameTicks(renderer,coords,zone,dataW):null;
  if(!ticks)return Reflect.apply(original as Method,this,[ctx,...rest]);
  // The renderer draws the axis border line and stops before its own labels.
  const result=Reflect.apply(original as Method,this,[ctx,viewOf(scene as object,{showAxisLabels:false}),...rest.slice(1)]);
  if(scene!.showAxisLabels)drawTickLabels(ctx as CanvasRenderingContext2D,ticks,(this as {axisTextColor?:unknown}|null)?.axisTextColor,dataW,dataH,fullH);
  return result;
 };
 // Vertical grid lines at the same ticks. The renderer gets a view with an empty time range, so it draws no vertical
 // lines of its own and everything else (horizontal lines, alpha reset) is its own code.
 const backdrop=(renderer as {backdropRenderer?:unknown}).backdropRenderer,originalGrid=backdrop&&typeof backdrop==='object'?(backdrop as {drawGrid?:unknown}).drawGrid:undefined;
 const ownsGrid=!!backdrop&&typeof backdrop==='object'&&typeof originalGrid==='function'&&!Object.hasOwn(backdrop,'drawGrid');
 const ownedGrid=function(this:unknown,ctx:unknown,scene:unknown,coords:unknown,theme:unknown,dataW:unknown,gridAlpha:unknown,...more:unknown[]){
  const s=scene as {showGrid?:unknown;timezone?:unknown;style?:{gridVert?:{visible?:unknown;color?:unknown}}}|null,vert=s?.style?.gridVert;
  const wanted=!!s&&!!s.showGrid&&!!vert&&!!vert.visible&&!!ctx&&typeof ctx==='object'&&!!coords&&typeof coords==='object';
  const ticks=wanted?frameTicks(renderer,axisFrameCoords(renderer,coords),typeof s!.timezone==='string'?s!.timezone:'UTC',Number(dataW)):null;
  if(!ticks)return Reflect.apply(originalGrid as Method,this,[ctx,scene,coords,theme,dataW,gridAlpha,...more]);
  const c=ctx as CanvasRenderingContext2D,color=vert!.color??(theme as {gridColor?:unknown}|null)?.gridColor,height=Number((coords as {height?:unknown}).height);
  if(typeof color==='string'&&Number.isFinite(height)){
   c.lineWidth=1;c.globalAlpha=Number(gridAlpha);c.strokeStyle=color;c.beginPath();
   for(const tick of ticks){const x=Math.round(tick.x)+0.5;if(x<0||x>Number(dataW))continue;c.moveTo(x,0);c.lineTo(x,height);}
   c.stroke();
  }
  return Reflect.apply(originalGrid as Method,this,[ctx,scene,viewOf(coords as object,{visibleTimeRange:()=>({from:0,to:0})}),theme,dataW,gridAlpha,...more]);
 };
 if(ownsGrid)Object.defineProperty(backdrop,'drawGrid',{configurable:true,writable:true,value:ownedGrid});
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
   if(!active)return;active=false;owners.delete(chrome);memos.delete(renderer);
   if(ownsGrid&&(backdrop as {drawGrid?:unknown}).drawGrid===ownedGrid)delete (backdrop as {drawGrid?:unknown}).drawGrid;
   if((chrome as {drawTimeAxis?:unknown}).drawTimeAxis!==owned)throw Error('The time axis tick cleanup found a foreign method and left it in place.');
   delete (chrome as {drawTimeAxis?:unknown}).drawTimeAxis;invalidate();
  },
 };
}
