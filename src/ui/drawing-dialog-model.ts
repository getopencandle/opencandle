// Pure helpers for the drawing settings dialog: the style preview, template choices, coordinate wording and the levels grid.
import {createDrawing,type DrawingTypeKey} from '@luxalgo/vela';
import {drawingEditor,timeToBarNumber,barNumberToTime} from '../chart/drawing-port';
import type {Bar} from '../domain/types';
import {DRAWING_TOOL_CATALOG} from './drawing-tool-catalog';
import {formatChartDateTime} from './chart-time-text';
export interface DrawingPreview{stroke:string;strokeWidth:number;dash:string;fill:string|null}
const DASH:Readonly<Record<string,string>>={dashed:'6 4',dotted:'1.5 3'};
/** What the dialog's preview strip draws for the current draft. The chart shows the draft live too (drawing-preview.ts); nothing is saved until Apply. */
export function drawingPreview(values:Readonly<Record<string,unknown>>):DrawingPreview{
 const color=values['style.lineColor'],width=values['style.lineWidth'],style=values['style.lineStyle'],fill=values['style.fillColor'];
 return{
  stroke:typeof color==='string'&&color?color:'currentColor',
  strokeWidth:typeof width==='number'&&Number.isFinite(width)&&width>0?Math.min(width,8):1,
  dash:typeof style==='string'&&Object.hasOwn(DASH,style)?DASH[style]:'',
  fill:typeof fill==='string'&&fill?fill:null,
 };
}
export interface TemplateChoice{id:string;name:string;type:string;properties:Readonly<Record<string,unknown>>}
export function templateChoices<T extends TemplateChoice>(templates:readonly T[],type:string):T[]{return templates.filter(row=>row.type===type);}
/** A template changes the draft only for settings this drawing has; the rest of the template is ignored. */
export function applyTemplateToDraft(original:Readonly<Record<string,unknown>>,draft:Readonly<Record<string,unknown>>,properties:Readonly<Record<string,unknown>>):{values:Record<string,unknown>;applied:number}{
 const values={...draft};let applied=0;
 for(const [path,value] of Object.entries(properties))if(Object.hasOwn(original,path)){values[path]=structuredClone(value);applied++;}
 return{values,applied};
}
const pad=(value:string)=>value.padStart(2,'0');
/** "2025-10-20 15:00 UTC": the anchor time in the chart timezone; an unknown timezone falls back to UTC. */
export function anchorTimeLabel(seconds:number,timeZone:string='UTC'):string{
 if(!Number.isFinite(seconds))return'Unavailable';
 const date=new Date(seconds*1000);if(!Number.isFinite(date.getTime()))return'Unavailable';
 const format=(zone:string)=>{const parts=new Map(new Intl.DateTimeFormat('en-US',{timeZone:zone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(date).map(part=>[part.type,part.value]));return parts.get('year')+'-'+pad(parts.get('month')!)+'-'+pad(parts.get('day')!)+' '+pad(parts.get('hour')!)+':'+pad(parts.get('minute')!)+' '+zone;};
 try{return format(timeZone);}catch{return format('UTC');}
}
export const LEVEL_COLUMNS=Object.freeze(['Show','Value','Color','Label'] as const);
export interface LevelGridRow{index:number;ratio:unknown;color:unknown;enabled:unknown;label:unknown}
/** One row per level, with draft edits laid over the saved level. */
export function levelGridRows(levels:readonly Readonly<Record<string,unknown>>[],draft:Readonly<Record<string,unknown>>):LevelGridRow[]{
 return levels.map((level,index)=>{const read=(key:string)=>draft['levels.'+index+'.'+key]??level[key]??'';return{index,ratio:read('ratio'),color:read('color'),enabled:read('enabled'),label:read('label')};});
}
/** Field names on the Coordinates tab. */
export const COORDINATE_LABELS=Object.freeze({bar:'Bar #',price:'Price',date:'Date',time:'Time'} as const);
// Coordinates: each row is "(price, bar)", the price field is a float
// stepping by the symbol price step (1 when the symbol has none), the bar field an integer with step 1 clamped to -50000..15000.
export const COORDINATE_BAR_LIMITS=Object.freeze({min:-50000,max:15000,step:1} as const);
/** A typed bar number: empty or non-numeric stays NaN (Apply reports it); a number is clamped to the recorded range and, the field
 * being an integer field, rounded to the nearest whole bar (our own rounding; the fact records only the integer type). */
export function coordinateBarInput(text:string):number{
 if(text.trim()==='')return NaN;
 const value=Number(text);if(!Number.isFinite(value))return NaN;
 return Math.min(COORDINATE_BAR_LIMITS.max,Math.max(COORDINATE_BAR_LIMITS.min,Math.round(value)));
}
/** The number a Coordinates field shows: the value at 12 significant digits, which strips the binary float noise that a time and bar
 * round trip leaves (346.45800000000054 shows 346.458) while every value a person can type in the field reads back unchanged. A
 * number, not a string, so the number input's own comparison never rewrites text that is still being typed. Not finite: empty. */
export function coordinateDisplayValue(value:number|null|undefined,decimals?:number|null):number|''{
 if(typeof value!=='number'||!Number.isFinite(value))return'';
 // With a known tick size the price shows at its precision (19.0312970139 shows 19.03).
 if(typeof decimals==='number'&&Number.isInteger(decimals)&&decimals>=0&&decimals<=12)return Number(value.toFixed(decimals));
 return Number(value.toPrecision(12));
}
function coordinateTick(source:{basisIdentity?:string}|null|undefined):number|null{
 try{
  if(typeof source?.basisIdentity!=='string')return null;
  const tuple=JSON.parse(source.basisIdentity) as unknown;
  const tick=Array.isArray(tuple)&&tuple[0]===1&&tuple.length===18?tuple[15]:undefined;
  return typeof tick==='number'&&Number.isFinite(tick)&&tick>0?tick:null;
 }catch{return null;}
}
/** The price field step: the instrument tick size carried in the chart source basis identity, else 1. */
export function coordinatePriceStep(source:{basisIdentity?:string}|null|undefined):number{return coordinateTick(source)??1;}
/** The decimals of the instrument tick size (0.01 is 2), or null when the source carries no tick size. */
export function coordinatePriceDecimals(source:{basisIdentity?:string}|null|undefined):number|null{
 const tick=coordinateTick(source);if(tick===null)return null;
 for(let decimals=0;decimals<=10;decimals++){const scaled=tick*10**decimals;if(Math.abs(scaled-Math.round(scaled))<1e-7*Math.max(1,scaled))return decimals;}
 return null;
}
/** The text of a checklist dropdown button: the checked item titles in list order, else the placeholder (our own join). */
export function checklistSummary(items:readonly {label:string;checked:boolean}[],placeholder:string):string{
 const checked=items.filter(item=>item.checked).map(item=>item.label);
 return checked.length?checked.join(', '):placeholder;
}
/** The template list value of the built-in Default entry (the tool's factory settings). */
export const DEFAULT_TEMPLATE_ID='__default';
/** Settings Default never resets: the drawing's own text, its lock and visibility, and a position's side and prices. */
const NOT_TEMPLATE_SETTINGS:ReadonlySet<string>=new Set(['text.value','locked','visible','direction','entryPrice','stopPrice','targetPrice']);
/** The factory settings of a new drawing of `type`, as dialog values (a switch the fresh drawing leaves unset reads off). Null when the type has no editor. */
export function defaultTemplateValues(type:string):Record<string,unknown>|null{
 try{
  const fresh=createDrawing(type as DrawingTypeKey,{paneId:'price'});if(!fresh)return null;
  const editor=drawingEditor(fresh.serialize(),[]),values:Record<string,unknown>={};
  for(const [path,value] of Object.entries(editor.values))if(!NOT_TEMPLATE_SETTINGS.has(path))values[path]=structuredClone(value);
  for(const field of editor.fields)if(field.kind==='boolean'&&values[field.path]===undefined&&!NOT_TEMPLATE_SETTINGS.has(field.path))values[field.path]=false;
  return values;
 }catch{return null;}
}
/** The user-facing tool name for the dialog title, from the left toolbar catalog (the first row that arms the type), never
 * the renderer type id. A type no catalog row arms (an unknown or retired type) reads "Drawing settings". */
export function drawingDialogTitle(type:string):string{
 for(const group of DRAWING_TOOL_CATALOG)for(const section of group.sections)for(const leaf of section.leaves)if(leaf.target.kind==='tool'&&leaf.target.type===type)return leaf.label;
 return'Drawing settings';
}
/** The Template entry "Apply default drawing template" (the tool's factory settings) as a property patch for one applied
 * drawing: only the settings the drawing has and whose value differs. Empty when nothing would change; null when the type has no editor. */
export function defaultTemplatePatch(editor:{type:string;values:Readonly<Record<string,unknown>>}):Record<string,unknown>|null{
 const defaults=defaultTemplateValues(editor.type);if(!defaults)return null;
 const next=applyTemplateToDraft(editor.values,editor.values,defaults).values,patch:Record<string,unknown>={};
 // A switch the drawing leaves unset already reads off, so a factory "off" is no change.
 for(const [path,value] of Object.entries(next))if(JSON.stringify(value)!==JSON.stringify(editor.values[path])&&!(value===false&&editor.values[path]===undefined))patch[path]=value;
 return patch;
}
// Coordinates take a date and a time in the chart timezone. The shown text comes from the shared
// chart-time formatter (src/ui/chart-time-text.ts). The typed-value reader stays here: it takes seconds, answers NaN
// instead of throwing, and resolves a daylight-saving gap to the instant after it, where parseChartDateTimeInput refuses the gap.
const zoneOrUtc=(timeZone:string|undefined):string=>{try{new Intl.DateTimeFormat('en-US',{timeZone:timeZone||'UTC'});return timeZone||'UTC';}catch{return'UTC';}};
function zonedFields(seconds:number,zone:string):{year:number;month:number;day:number;hour:number;minute:number;second:number}{
 const parts=new Map(new Intl.DateTimeFormat('en-US',{timeZone:zone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(seconds*1000)).map(part=>[part.type as string,part.value]));
 const read=(name:string)=>Number(parts.get(name));
 return{year:read('year'),month:read('month'),day:read('day'),hour:read('hour')%24,minute:read('minute'),second:read('second')};
}
/** The date ("2024-01-02") and time ("09:30", or "09:30:15" with seconds) an anchor shows in the chart timezone; empty strings when the
 * time is not finite. An unknown timezone falls back to UTC. */
export function coordinateDateTimeText(seconds:number,timeZone?:string,withSeconds=false):{date:string;time:string}{
 if(!Number.isFinite(seconds)||!Number.isFinite(new Date(seconds*1000).getTime()))return{date:'',time:''};
 const [date,time]=formatChartDateTime(Math.round(seconds),zoneOrUtc(timeZone),{seconds:withSeconds,zone:false}).split(' ');
 return{date,time};
}
/** Epoch seconds of a typed date ("YYYY-MM-DD") and time ("HH:MM" or "HH:MM:SS") read in the chart timezone, or NaN when either is not a
 * valid value. A wall time skipped by a daylight-saving change resolves to the instant just after the gap. */
// Date.UTC maps years 0-99 to 1900-1999 (a typed "0002" became 1902), so every wall-clock reading goes through setUTCFullYear.
function utcSeconds(year:number,month:number,day:number,hour:number,minute:number,second:number):number{
 const at=new Date(Date.UTC(2000,0,1,hour,minute,second));at.setUTCFullYear(year,month,day);return at.getTime()/1000;
}
/** Whether a date field value is final enough to apply: empty (a cleared field) or a full YYYY-MM-DD with a four-digit year
 * (1000 or later). A date input reports its year one digit at a time while it is typed ("0002", "0020", "0202", "2025"); applying each
 * partial year moved the anchor and the preview on every keystroke, so a partial year waits for the next digit, blur or Enter. */
export function coordinateDateComplete(date:string):boolean{
 if(date==='')return true;const day=/^(\d{4})-\d{2}-\d{2}$/.exec(date.trim());return!!day&&Number(day[1])>=1000;
}
export function coordinateDateTimeSeconds(date:string,time:string,timeZone?:string):number{
 const day=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim()),clock=/^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
 if(!day||!clock)return NaN;
 const [year,month,dom,hour,minute,second]=[day[1],day[2],day[3],clock[1],clock[2],clock[3]??'0'].map(Number);
 if(month<1||month>12||dom<1||dom>31||hour>23||minute>59||second>59)return NaN;
 const wall=utcSeconds(year,month-1,dom,hour,minute,second),check=new Date(wall*1000);
 if(check.getUTCDate()!==dom||check.getUTCMonth()!==month-1)return NaN;
 const zone=zoneOrUtc(timeZone),offset=(at:number)=>{const value=zonedFields(at,zone);return utcSeconds(value.year,value.month-1,value.day,value.hour,value.minute,value.second)-at;};
 let guess=wall-offset(wall);guess=wall-offset(guess);
 return Number.isFinite(guess)?guess:NaN;
}
/** The bar a typed date and time lands on: the nearest whole bar (projected past either end of the loaded bars at their cadence),
 * clamped to the Coordinates bar range. NaN when the date or time is invalid or the chart has no time grid. */
export function coordinateBarFromDateTime(bars:readonly Bar[],date:string,time:string,timeZone?:string):number{
 const seconds=coordinateDateTimeSeconds(date,time,timeZone);if(!Number.isFinite(seconds))return NaN;
 try{return coordinateBarInput(String(timeToBarNumber(bars,seconds)));}catch{return NaN;}
}
/** The draft anchor a typed date and time make. Inside the loaded bars (within half a bar of either end) the anchor
 * lands on the nearest whole bar, as before. Past the loaded bars there is no bar to land on, so the anchor takes the typed instant
 * exactly ({timeSeconds}, with the bar number left as it was so the edit is an explicit time). Projecting a bar number at the last
 * bar's cadence in absolute seconds drifted across daylight-saving changes: on a New York daily chart a typed Thu 19 Nov came back as
 * Wed 18 Nov 23:00, the date field changed under the typing and the next keystroke landed one bar further out (owner report: a Fib
 * end moved into late November). Invalid input keeps the NaN bar number the Apply guard refuses. */
export function coordinateAnchorFromDateTime(bars:readonly Bar[],date:string,time:string,timeZone:string|undefined,original:{barNumber:number|null;timeSeconds:number}):{barNumber:number|null;timeSeconds:number}{
 const seconds=coordinateDateTimeSeconds(date,time,timeZone);if(!Number.isFinite(seconds))return{barNumber:NaN,timeSeconds:original.timeSeconds};
 let ordinal:number;try{ordinal=timeToBarNumber(bars,seconds);}catch{return{barNumber:NaN,timeSeconds:original.timeSeconds};}
 if(ordinal>=-0.5&&ordinal<=bars.length-0.5)return{barNumber:coordinateBarInput(String(ordinal)),timeSeconds:original.timeSeconds};
 return{barNumber:original.barNumber,timeSeconds:seconds};
}
/** The instant a draft anchor shows: its explicit time when the draft carries one, else its bar number on the loaded bars; NaN when neither resolves. */
export function coordinateDraftSeconds(bars:readonly Bar[],anchor:{barNumber?:number|null;timeSeconds?:number},original:{timeSeconds:number}):number{
 if(typeof anchor.timeSeconds==='number'&&anchor.timeSeconds!==original.timeSeconds)return anchor.timeSeconds;
 if(typeof anchor.barNumber!=='number')return NaN;
 try{return barNumberToTime(bars,anchor.barNumber);}catch{return NaN;}
}
/** Whether the time field needs seconds: the loaded bars are closer than one minute apart. */
export function coordinateTimeHasSeconds(bars:readonly Bar[]):boolean{return bars.length>=2&&bars[1].time-bars[0].time<60;}
