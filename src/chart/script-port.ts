import {isDerivedStyle} from './derived/common';
import type {ScriptLogicalPositions} from './script-logical-position';
import {createScriptPresentationPort,freezeScriptPresentationTables,freezeScriptPresentationPlots,captureScriptPresentationNative,scriptPresentationMetadata,type ScriptPresentationHost,type ScriptPresentationLease,type ScriptReadoutSnapshot,type ScriptTablesSnapshot,type ScriptTableNativeState,type ScriptTableNativeTransition} from './script-presentation-proof';
import {inheritScriptCsvJobResult,bindScriptCsvJobModel,retireScriptCsvJobModel} from './script-csv-job-proof';
import {attemptEveryCleanup} from './chart-retirement';
import type {ClaimNativeDescriptor} from './native-full-model';
import { registerNativeIndicator,unregisterNativeIndicator,stableSeriesId,chartType,type Vela,type NativeIndicator,type NativeIndicatorContext,type NativeIndicatorOutput,type IndicatorHandle,type SeriesSpec,type InputValue } from '@luxalgo/vela';
import type { Bar } from '../domain/types';
import {heikinAshiBars} from './calculation-bars';
import { defaultPlotStyle,type IndicatorPlotStyle } from './indicator-port';
import { plotBaseStyle } from './indicator-rendering';
import {createNotificationBatch} from './notification-batch';
import {createPaneRegistry,type PaneRegistry} from './pane-registry';
import {assertIndicatorRecord,validateIndicatorPlotStyle} from './indicator-settings';
import {components as velaCompatComponents} from './vela-compat-patch-plan.json';

export interface ScriptPlot {id:string;title:string;color:string;values:Array<{time:number;value:number|null;index?:number}>}
/** Script visual outputs (ctx.hline, ctx.fill, ctx.bgcolor, ctx.plotshape, ctx.plotchar), validated by the host. */
export interface ScriptVisuals {
  hlines:Array<{title:string;price:number;color:string;lineStyle:'solid'|'dashed'|'dotted';width:number}>;
  /** Between 'hlines' names two hline titles; colors holds the bars whose colour differs from color. */
  fills:Array<{title:string;from:string;to:string;color:string;between?:'hlines';colors?:ScriptColorRows}>;
  backgrounds:Array<{time:number;color:string;index?:number}>;
  markers:Array<{title:string;time:number;index?:number;shape:string;location:'abovebar'|'belowbar'|'top'|'bottom';color:string;text:string;size:'tiny'|'small'|'normal'|'large'|'huge'}>;
  /** Script-declared plot style options and per-point colours, by plot title. */
  plotStyles?:ScriptPlotStyle[];
}
/** Per-bar colours: palette index per row (-1 means no colour on that bar), bar time in seconds, logical index when logical. */
export interface ScriptColorRows {palette:string[];times:number[];indices?:number[];values:number[]}
export type ScriptPlotStyleName='line'|'stepline'|'histogram'|'columns'|'circles'|'cross'|'area'|'areabr'|'linebr';
/** One ctx.plot title's script defaults. colors (palette indices, -1 none) align with that plot's values. */
export interface ScriptPlotStyle {title:string;style:ScriptPlotStyleName;linewidth:number|null;offset:number;display:{pane:boolean;priceScale:boolean;legend:boolean;dataWindow:boolean};palette:string[]|null;colors:number[]|null}
/** Ctx.barcolor rows and the live drawing objects at the end of a run, validated by the host. */
export interface ScriptObjects {
  /** The first bar of the run: index-based x values count from base.index at base.time (seconds). */
  base:{index:number;time:number}|null;
  barcolors:Array<{time:number;color:string;index?:number}>;
  labels:Array<{id:number;xloc:'index'|'time';x:number;y:number;yloc:'price'|'abovebar'|'belowbar';text:string;style:string;color:string|null;textColor:string|null;size:'auto'|'tiny'|'small'|'normal'|'large'|'huge';textAlign:'left'|'center'|'right';tooltip:string}>;
  lines:Array<{id:number;xloc:'index'|'time';x1:number;y1:number;x2:number;y2:number;extend:'none'|'left'|'right'|'both';color:string|null;style:'solid'|'dashed'|'dotted'|'arrowleft'|'arrowright'|'arrowboth';width:number}>;
  boxes:Array<{id:number;xloc:'index'|'time';left:number;top:number;right:number;bottom:number;extend:'none'|'left'|'right'|'both';borderColor:string|null;borderWidth:number;borderStyle:'solid'|'dashed'|'dotted';bgColor:string|null;text:string;textColor:string|null;textSize:'auto'|'tiny'|'small'|'normal'|'large'|'huge';hAlign:'left'|'center'|'right';vAlign:'top'|'center'|'bottom'}>;
  /** Ctx.linefill (line ids of this output) and ctx.polyline rows. */
  linefills?:Array<{id:number;line1:number;line2:number;color:string|null}>;
  polylines?:Array<{id:number;xloc:'index'|'time';curved:boolean;closed:boolean;lineColor:string|null;fillColor:string|null;lineWidth:number;lineStyle:'solid'|'dashed'|'dotted'|'arrowleft'|'arrowright'|'arrowboth';points:Array<{x:number;y:number}>}>;
  tables:Array<{id:number;position:'top_left'|'top_center'|'top_right'|'middle_left'|'middle_center'|'middle_right'|'bottom_left'|'bottom_center'|'bottom_right';columns:number;rows:number;bgColor:string|null;frameColor:string|null;frameWidth:number;borderColor:string|null;borderWidth:number;cells:Array<{column:number;row:number;text:string;textColor:string|null;bgColor:string|null;hAlign:'left'|'center'|'right';vAlign:'top'|'center'|'bottom';textSize:'auto'|'tiny'|'small'|'normal'|'large'|'huge';tooltip:string}>}>;
}
/** Ctx.log rows of the last accepted run (bar time in seconds, bar index) and how many the cap dropped. */
export interface ScriptLogs {entries:Array<{time:number;index:number;level:'info'|'warn'|'error';message:string}>;dropped:number}
export interface ScriptRenderResult {plots:ScriptPlot[];visuals?:ScriptVisuals;objects?:ScriptObjects;logs?:ScriptLogs;diagnostics?:unknown[];provenance?:unknown;provisional?:boolean}
/** Small management metadata, independent of calculation/readout readiness. Native pane may be unavailable. */
export interface ScriptPresentationMetadataRow {readonly id:string;readonly title:string;readonly visible:boolean;readonly actualPaneId:string|null;readonly plots:readonly {readonly id:string;readonly title:string;readonly color:string;readonly visible:boolean;readonly legend:boolean;readonly dataWindow:boolean}[];readonly stylesAvailable:boolean;readonly renderedPlots:Readonly<Record<string,IndicatorPlotStyle>>;readonly renderedVisuals:Readonly<Record<string,IndicatorPlotStyle>>}
export interface ScriptRenderSettings {id:string;title:string;pane:'price'|'new';paneId?:string|null;ownScale?:boolean;tablePlacement?:'bottom';visible:boolean;plots:Record<string,IndicatorPlotStyle>}
export interface ScriptTableDestinationLease {assertCurrent():void;apply(destination:'chart'|'bottom'):void;rollback():void;release():void}
function tablePlacementMode(settings:object):'chart'|'bottom'{const field=Object.getOwnPropertyDescriptor(settings,'tablePlacement');if(!field)return'chart';if(!Object.hasOwn(field,'value')||field.value!=='bottom')throw Error('Invalid script table destination.');return'bottom';}
function tablePlacementMatches(settings:object,expected:'chart'|'bottom'|null):boolean{try{return expected!==null&&tablePlacementMode(settings)===expected;}catch{return false;}}
interface TableDestinationState {current():boolean;move(destination:'chart'|'bottom',rollback?:boolean):void;before:'chart'|'bottom';release?():void}
/** Methods close outside the producer activation. Release retires before any later operation and clears held references. */
function preparedTableDestination(state:TableDestinationState|null):ScriptTableDestinationLease{
 let held=state,busy=false,retired=false,phase:'created'|'applied'|'failed'|'rolledback'='created';state=null;
 const owned=()=>{const value=held;if(!value||retired||busy||!value.current())throw Error('The prepared script table owner changed.');return value;};
 return Object.freeze({assertCurrent(){owned();},apply(destination:'chart'|'bottom'){const value=owned();if(phase!=='created')throw Error('The prepared table destination was already used.');busy=true;try{value.move(destination);if(retired||held!==value||!value.current())throw Error('The script source changed during table history restoration.');phase='applied';}catch(error){phase='failed';throw error;}finally{busy=false;if(retired)held=null;}},
  rollback(){if(phase==='rolledback')return;const value=owned();busy=true;try{value.move(value.before,true);if(retired||held!==value||!value.current())throw Error('The script source changed during table history recovery.');phase='rolledback';}finally{busy=false;if(retired)held=null;}},
  release(){if(retired)return;retired=true;const value=held;held=null;value?.release?.();},
 });
}
/** Opaque, local-only checkpoint; callers cannot manufacture numerical result authority. */
export interface ScriptResultsCheckpoint {readonly count:number}
/** Keep the one existing whole-result clone, including aliases. UI proof adds only bounded in-place freezing. */
function indexedScriptPlots(plots:unknown):boolean{try{const first=Object.getOwnPropertyDescriptor(plots as object,'0'),values=first&&'value'in first?Object.getOwnPropertyDescriptor(first.value,'values'):undefined,point=values&&'value'in values?Object.getOwnPropertyDescriptor(values.value,'0'):undefined;return!!point&&'value'in point&&Object.hasOwn(point.value,'index');}catch{return false;}}
function validateIndexedScriptPlots(plots:unknown,positions:ScriptLogicalPositions):void{
 const fail=()=>{throw Error('Script logical plots require genuine bounded engine bar positions.');};
 const data=(object:unknown,key:string):any=>{const field=object&&typeof object==='object'?Object.getOwnPropertyDescriptor(object,key):undefined;if(!field||!Object.hasOwn(field,'value'))return fail();return field.value;};
 if(!Array.isArray(plots)||Object.getPrototypeOf(plots)!==Array.prototype||plots.length>10000||Reflect.ownKeys(plots).length!==plots.length+1)fail();let total=0;const ids=new Set<string>();
 for(let p=0;p<(plots as unknown[]).length;p++){positions.assertCurrent();const plot=data(plots,String(p));if(Reflect.ownKeys(plot).length!==4)fail();const id=data(plot,'id'),title=data(plot,'title'),color=data(plot,'color'),values=data(plot,'values');if(typeof id!=='string'||!id||ids.has(id)||typeof title!=='string'||typeof color!=='string'||!Array.isArray(values)||Object.getPrototypeOf(values)!==Array.prototype||values.length>10000-total||Reflect.ownKeys(values).length!==values.length+1)fail();ids.add(id);total+=values.length;let previous=-1;
  for(let index=0;index<values.length;index++){const point=data(values,String(index));if(Reflect.ownKeys(point).length!==3)fail();const at=positions.assertEmission(data(point,'index'),data(point,'time')),value=data(point,'value');if(at<=previous||value!==null&&(typeof value!=='number'||!Number.isFinite(value)))fail();previous=at;}
 }positions.assertCurrent();
}
function copyOwnedScriptResult(result:ScriptRenderResult,positions?:ScriptLogicalPositions|null):{value:ScriptRenderResult;numeric:boolean}{
 const indexed=!!positions&&indexedScriptPlots(result.plots);let ownNumeric=false;if(indexed){validateIndexedScriptPlots(result.plots,positions!);ownNumeric=true;}else validateScriptPlots(result.plots,value=>{ownNumeric=value;});
 validateScriptVisuals(result.visuals);validateScriptObjects(result.objects,positions??undefined);validateScriptLogs(result.logs);
 if(Object.values(Object.getOwnPropertyDescriptors(result)).some(field=>!('value' in field)))ownNumeric=false;
 const value=structuredClone(result);return{value,numeric:ownNumeric&&freezeScriptPresentationPlots(value.plots,indexed?positions!:undefined)!==null};
}
function validateScriptStyles(styles:unknown):asserts styles is Record<string,IndicatorPlotStyle>{
  assertIndicatorRecord(styles);for(const value of Object.values(styles)){validateIndicatorPlotStyle(value);if(Object.hasOwn(value,'opacity')||Object.hasOwn(value,'trackPrice'))throw new Error('Script opacity and track-price styles are unsupported by the current script renderer.');}
}
export function validateScriptPlots(plots:readonly ScriptPlot[],readoutOwn?:(eligible:boolean)=>void):void{
  const ids=new Set<string>();let eligible=!!readoutOwn,total=0;
  const record=(value:unknown,keys:readonly string[])=>!!value&&typeof value==='object'&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{const field=Object.getOwnPropertyDescriptor(value,key);return!!field&&'value' in field;});
  if(readoutOwn&&(!Array.isArray(plots)||Object.getPrototypeOf(plots)!==Array.prototype||plots.length>10000||Reflect.ownKeys(plots).length!==plots.length+1))eligible=false;
  for(const plot of plots){
    if(eligible&&!record(plot,['id','title','color','values']))eligible=false;
    if(!plot.id||ids.has(plot.id)||typeof plot.title!=='string'||typeof plot.color!=='string'||!Array.isArray(plot.values))throw new Error('Script plots require unique IDs, title, color and values');ids.add(plot.id);
    if(eligible){const values=plot.values;if(Object.getPrototypeOf(values)!==Array.prototype||values.length>10000-total||Reflect.ownKeys(values).length!==values.length+1)eligible=false;total+=values.length;}
    let previous=-Infinity;for(const point of plot.values){if(eligible&&!record(point,['time','value']))eligible=false;if(!Number.isFinite(point.time)||point.time<=previous||(point.value!==null&&!Number.isFinite(point.value)))throw new Error('Script plot times must increase and values must be finite or null');previous=point.time;}
  }
  readoutOwn?.(eligible);
}
const VISUAL_COLOR=/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;
export function validateScriptVisuals(visuals:ScriptVisuals|undefined):void{
  if(visuals===undefined)return;
  const fail=()=>{throw new Error('Script visual outputs are invalid');};
  if(!visuals||typeof visuals!=='object'||![visuals.hlines,visuals.fills,visuals.backgrounds,visuals.markers].every(Array.isArray))fail();
  for(const row of visuals.hlines)if(!Number.isFinite(row.price)||!VISUAL_COLOR.test(row.color))fail();
  const colorRows=(rows:ScriptColorRows|undefined)=>rows===undefined||!!rows&&Array.isArray(rows.palette)&&rows.palette.every(color=>typeof color==='string'&&VISUAL_COLOR.test(color))&&Array.isArray(rows.times)&&Array.isArray(rows.values)&&rows.values.length===rows.times.length&&rows.times.every(Number.isFinite)&&rows.values.every(value=>Number.isSafeInteger(value)&&value>=-1&&value<rows.palette.length)&&(rows.indices===undefined||Array.isArray(rows.indices)&&rows.indices.length===rows.times.length&&rows.indices.every(Number.isSafeInteger));
  for(const row of visuals.fills)if(typeof row.from!=='string'||typeof row.to!=='string'||!VISUAL_COLOR.test(row.color)||row.between!==undefined&&row.between!=='hlines'||!colorRows(row.colors))fail();
  for(const row of [...visuals.backgrounds,...visuals.markers])if(!Number.isFinite(row.time)||!VISUAL_COLOR.test(row.color))fail();
  if(visuals.plotStyles!==undefined){if(!Array.isArray(visuals.plotStyles))fail();for(const row of visuals.plotStyles){const d=row?.display;if(!row||typeof row.title!=='string'||!Object.hasOwn(SCRIPT_PLOT_KINDS,row.style)||!(row.linewidth===null||Number.isInteger(row.linewidth)&&row.linewidth>=1&&row.linewidth<=10)||!Number.isInteger(row.offset)||Math.abs(row.offset)>500||!d||![d.pane,d.priceScale,d.legend,d.dataWindow].every(value=>typeof value==='boolean')||(row.palette===null)!==(row.colors===null)||row.palette!==null&&!colorRows({palette:row.palette,times:row.colors!.map(()=>0),values:row.colors!}))fail();}}
}
/** Renderer-side shape check of drawing objects (the host already re-checked every row). */
export function validateScriptObjects(objects:ScriptObjects|undefined,positions?:ScriptLogicalPositions):void{
  if(objects===undefined)return;
  const fail=()=>{throw new Error('Script drawing objects are invalid');};
  if(!objects||typeof objects!=='object'||![objects.barcolors,objects.labels,objects.lines,objects.boxes,objects.tables].every(Array.isArray))fail();
  const colour=(value:string|null)=>value===null||VISUAL_COLOR.test(value);
  let previous=-Infinity;for(const row of objects.barcolors){if(positions&&row.index!==undefined){const index=positions.assertEmission(row.index,row.time);if(index<=previous||!VISUAL_COLOR.test(row.color))fail();previous=index;}else{if(!Number.isFinite(row.time)||row.time<=previous||!VISUAL_COLOR.test(row.color))fail();previous=row.time;}}
  for(const row of objects.labels)if(![row.x,row.y].every(Number.isFinite)||!colour(row.color)||!colour(row.textColor))fail();
  for(const row of objects.lines)if(![row.x1,row.y1,row.x2,row.y2].every(Number.isFinite)||!colour(row.color))fail();
  for(const row of objects.boxes)if(![row.left,row.top,row.right,row.bottom].every(Number.isFinite)||!colour(row.bgColor)||!colour(row.borderColor)||!colour(row.textColor))fail();
  const lineIds=new Set(objects.lines.map(row=>row.id));
  if(objects.linefills!==undefined&&(!Array.isArray(objects.linefills)||objects.linefills.some(row=>!lineIds.has(row.line1)||!lineIds.has(row.line2)||!colour(row.color))))fail();
  if(objects.polylines!==undefined&&(!Array.isArray(objects.polylines)||objects.polylines.some(row=>!Array.isArray(row.points)||row.points.length<2||row.points.some(point=>![point.x,point.y].every(Number.isFinite))||!colour(row.lineColor)||!colour(row.fillColor)||!Number.isInteger(row.lineWidth))))fail();
  for(const row of objects.tables)if(!Number.isInteger(row.columns)||!Number.isInteger(row.rows)||!Array.isArray(row.cells)||row.cells.some(cell=>!Number.isInteger(cell.column)||!Number.isInteger(cell.row)||cell.column<0||cell.row<0||cell.column>=row.columns||cell.row>=row.rows))fail();
  if((objects.labels.length||objects.lines.length||objects.boxes.length||objects.polylines?.length)&&!objects.base)fail();
}
export function validateScriptLogs(logs:ScriptLogs|undefined):void{
  if(logs===undefined)return;
  if(!logs||!Array.isArray(logs.entries)||!Number.isSafeInteger(logs.dropped)||logs.entries.some(row=>!Number.isFinite(row.time)||!['info','warn','error'].includes(row.level)||typeof row.message!=='string'))throw new Error('Script logs are invalid');
}
/** Style tab overrides for hlines and fills live in the binding's plot-style map under these keys. */
export const scriptHlineStyleId=(title:string)=>'lvhline:'+title;
export const scriptFillStyleId=(title:string)=>'lvfill:'+title;
export const isScriptVisualStyleId=(id:string)=>id.startsWith('lvhline:')||id.startsWith('lvfill:');
/** The title a person sees for a script style key ("lvplot:Fast" is "Fast", "lvhline:Zero" is "Line: Zero"); internal prefixes never show. */
export function scriptStyleTitle(id:string):string{if(id.startsWith('lvplot:'))return id.slice(7)||'Plot';if(id.startsWith('lvhline:'))return 'Line: '+id.slice(8);if(id.startsWith('lvfill:'))return 'Fill: '+id.slice(7);return id;}
/** The editable default of each hline and fill, as a plot style (colour, width, line style, visible). */
export function scriptVisualStyles(visuals:ScriptVisuals|undefined):Record<string,IndicatorPlotStyle>{
  const out:Record<string,IndicatorPlotStyle>={};if(!visuals)return out;
  const style=(color:string,width:number,lineStyle:IndicatorPlotStyle['lineStyle']):IndicatorPlotStyle=>({visible:true,color:visualColor(color),width,lineStyle,kind:'line',priceScale:true,legend:true,dataWindow:true});
  for(const row of visuals.hlines)out[scriptHlineStyleId(row.title)]=style(row.color,row.width,row.lineStyle);
  for(const row of visuals.fills)out[scriptFillStyleId(row.title)]=style(row.color,1,'solid');
  return out;
}
/** Ctx.plot style names to the native series kinds. LV lines and areas always break at a null value, so
 *  linebr and areabr draw as line and area (: Pine's line/area bridge gaps; LV does not). */
export const SCRIPT_PLOT_KINDS:Readonly<Record<ScriptPlotStyleName,IndicatorPlotStyle['kind']>>=Object.freeze({line:'line',linebr:'line',stepline:'step',histogram:'histogram',columns:'columns',circles:'circles',cross:'cross',area:'area',areabr:'area'});
const scriptPlotStyleRow=(visuals:ScriptVisuals|undefined,title:string):ScriptPlotStyle|undefined=>visuals?.plotStyles?.find(row=>row.title===title);
/** The editable default of a script plot: the script's style, linewidth, display and first colour. A saved
 *  Style tab entry replaces it (script values are defaults; user edits win). */
export function scriptPlotDefaultStyle(plot:{id:string;color:string},index:number,row?:ScriptPlotStyle):IndicatorPlotStyle{
  const base={...defaultPlotStyle('sma',plot.id,index),color:plot.color};if(!row)return base;
  return {...base,kind:SCRIPT_PLOT_KINDS[row.style],width:row.linewidth??base.width,visible:row.display.pane,priceScale:row.display.priceScale,legend:row.display.legend,dataWindow:row.display.dataWindow};
}
const sameColor=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const NO_COLOR='rgba(0,0,0,0)';
/** Per-bar colour of a palette index (-1 is no colour: drawn transparent). */
const paletteColor=(palette:readonly string[],value:number)=>value<0?NO_COLOR:visualColor(palette[value]);
/** Shifts index-aligned points by offset bars (positive: later). Time-mode points extend past the last time by its cadence. */
function shiftPoints(points:Array<{time:number;value:number|null;color?:string}>,offset:number,dense:boolean):Array<{time:number;value:number|null;color?:string}>{
  if(!offset||!points.length)return points;const length=dense?points.length:points.length+offset;if(length<=0)return [];
  const last=points[points.length-1].time,step=points.length>1?last-points[points.length-2].time:60000,time=(m:number)=>m<points.length?points[m].time:last+(m-points.length+1)*step;
  return Array.from({length},(_,m)=>{const source=points[m-offset];return source?{time:time(m),value:source.value,...(source.color?{color:source.color}:{})}:{time:time(m),value:null};});
}
/** Price styles whose bars ctx.barcolor recolours (other chart types keep their own colours). */
const BARCOLOR_STYLES=new Set(['candles','bars','hollow','heikinashi','lv-candles-previous-close','lv-heikinashi-previous-close']);
/** With LV-VELA-RENDER-LEFTOVERS-1 (COMPAT-11) a native output keeps its barColors, so Hollow candles colour bars
 * through vela's own bar-colour path and the hollow layer keeps hollow bodies hollow. Without it the overlay series is used. */
export const NATIVE_HOLLOW_BARCOLORS=(velaCompatComponents as readonly string[]).includes('LV-VELA-RENDER-LEFTOVERS-1');
/** Chart bar index of a time in seconds: the bar at that time, else the first later bar (null past the end). */
function chartIndexOf(barTimes:readonly number[],time:number):number|null{let low=0,high=barTimes.length;while(low<high){const middle=(low+high)>>1;if(barTimes[middle]<time)low=middle+1;else high=middle;}return low<barTimes.length?low:null;}
/**
 * The drawing objects through vela's native indicator outputs (lines, boxes, labels, tables), so
 * they are indicator output: read-only, never in the drawing store and gone with the script. Index-based x values are
 * moved onto chart bar indices through objects.base. ctx.barcolor is drawn as a candle series over the main bars
 * (colour per bar, uncoloured bars transparent) on the price pane even from a separate-pane script, only for the bar-type
 * price styles.
 */
export function renderScriptObjects(instanceId:string,objects:ScriptObjects|undefined,bars:ReadonlyArray<{time:number;open:number;high:number;low:number;close:number;volume?:number}>,priceStyle:string,nativeHollow=NATIVE_HOLLOW_BARCOLORS,positions?:ScriptLogicalPositions,onUnavailable?:(message:string)=>void,suppressTables=false):Required<Pick<NativeIndicatorOutput,'lines'|'boxes'|'labels'|'tables'|'polylines'|'linefills'>>&{barSeries:SeriesSpec|null;barColors:Array<{time:number;color:string}>|null}{
  if(!objects)return {lines:[],boxes:[],labels:[],tables:[],polylines:[],linefills:[],barSeries:null,barColors:null};
  validateScriptObjects(objects,positions);positions?.assertCurrent();
  const times=positions?[]:bars.map(bar=>bar.time/1000),start=positions?objects.base&&objects.base.index===0&&Object.is(objects.base.time,positions.eventTime(0))?0:null:objects.base?chartIndexOf(times,objects.base.time):null,shift=start===null||!objects.base?null:start-objects.base.index;
  const xloc=(kind:'index'|'time')=>kind==='index'?'bar_index' as const:'bar_time' as const,x=(kind:'index'|'time',value:number)=>kind==='index'?value+(shift??0):positions?positions.nativeTime(positions.uniqueEventIndex(value)!)*1000:value*1000;
  const positioned=(kind:'index'|'time',...values:number[])=>{if(kind==='index'||!positions)return true;const valid=values.every(value=>positions.uniqueEventIndex(value)!==null);if(!valid)onUnavailable?.('A script time anchor matches more than one chart bar or no confirmed chart bar. Use a bar index for an exact position.');return valid;};
  const indexOk=(kind:'index'|'time')=>kind==='time'||shift!==null;
  const colour=(value:string|null)=>value===null?undefined:visualColor(value);
  const lines=objects.lines.filter(row=>indexOk(row.xloc)&&positioned(row.xloc,row.x1,row.x2)).map(row=>({id:instanceId+':line:'+row.id,paneId:'',xloc:xloc(row.xloc),x1:x(row.xloc,row.x1),y1:row.y1,x2:x(row.xloc,row.x2),y2:row.y2,extend:row.extend,color:colour(row.color),invisible:row.color===null,width:row.width,style:(row.style.startsWith('arrow')?'solid':row.style) as 'solid'|'dashed'|'dotted',arrowLeft:row.style==='arrowleft'||row.style==='arrowboth',arrowRight:row.style==='arrowright'||row.style==='arrowboth'}));
  // A linefill draws between its two rendered lines (a line that cannot be placed takes its fill with it).
  const lineById=new Map(objects.lines.map(row=>[row.id,lines.find(line=>line.id===instanceId+':line:'+row.id)]));
  const linefills=(objects.linefills??[]).flatMap(row=>{const line1=lineById.get(row.line1),line2=lineById.get(row.line2);return line1&&line2&&row.color!==null?[{id:instanceId+':linefill:'+row.id,paneId:'',line1,line2,color:visualColor(row.color)}]:[];});
  const polylines=(objects.polylines??[]).filter(row=>indexOk(row.xloc)&&positioned(row.xloc,...row.points.map(point=>point.x))).map(row=>({id:instanceId+':polyline:'+row.id,paneId:'',points:row.points.map(point=>({xloc:xloc(row.xloc),x:x(row.xloc,point.x),price:point.y})),curved:row.curved,closed:row.closed,lineColor:colour(row.lineColor),fillColor:colour(row.fillColor),lineWidth:row.lineWidth,lineStyle:(row.lineStyle.startsWith('arrow')?'solid':row.lineStyle) as 'solid'|'dashed'|'dotted',arrowLeft:row.lineStyle==='arrowleft'||row.lineStyle==='arrowboth',arrowRight:row.lineStyle==='arrowright'||row.lineStyle==='arrowboth'}));
  const boxes=objects.boxes.filter(row=>indexOk(row.xloc)&&positioned(row.xloc,row.left,row.right)).map(row=>({id:instanceId+':box:'+row.id,paneId:'',xloc:xloc(row.xloc),left:x(row.xloc,row.left),top:row.top,right:x(row.xloc,row.right),bottom:row.bottom,extend:row.extend,bgColor:colour(row.bgColor),borderColor:colour(row.borderColor),borderWidth:row.borderWidth,borderStyle:row.borderStyle,text:row.text||undefined,textColor:colour(row.textColor),textSize:row.textSize,hAlign:row.hAlign,vAlign:row.vAlign,wrap:false,fontFamily:'default' as const,bold:false,italic:false}));
  const labels=objects.labels.filter(row=>indexOk(row.xloc)&&positioned(row.xloc,row.x)).map(row=>({id:instanceId+':label:'+row.id,paneId:'',xloc:xloc(row.xloc),x:x(row.xloc,row.x),y:row.y,yloc:row.yloc,text:row.text||undefined,style:row.style as never,color:colour(row.color),noFill:row.color===null,textColor:colour(row.textColor),size:row.size,textAlign:row.textAlign,tooltip:row.tooltip||undefined,fontFamily:'default' as const}));
  const tables=suppressTables?[]:objects.tables.map(row=>{const cells:Array<Array<NonNullable<NonNullable<NativeIndicatorOutput['tables']>[number]['cells'][number][number]>|null>>=Array.from({length:row.rows},()=>Array.from({length:row.columns},()=>null));
    for(const cell of row.cells)cells[cell.row][cell.column]={text:cell.text||undefined,textColor:colour(cell.textColor),bgColor:colour(cell.bgColor),hAlign:cell.hAlign,vAlign:cell.vAlign,textSize:cell.textSize,fontFamily:'default',tooltip:cell.tooltip||undefined,bold:false,italic:false};
    return {id:instanceId+':table:'+row.id,paneId:'',position:row.position,columns:row.columns,rows:row.rows,bgColor:colour(row.bgColor),frameColor:colour(row.frameColor),frameWidth:row.frameWidth,borderColor:colour(row.borderColor),borderWidth:row.borderWidth,cells,merges:[]};});
  if(positions&&objects.barcolors.length&&isDerivedStyle(priceStyle))onUnavailable?.('Script bar colors on derived main bars are not yet supported.');
  let barSeries:SeriesSpec|null=null,barColors:Array<{time:number;color:string}>|null=null;
  // A script with barcolor rows always states its model bar colours (empty off Hollow candles), so a style change
  // clears them through the value patch. On Hollow candles they are the bar colours themselves (bars of the chart only).
  const hollowNative=nativeHollow&&priceStyle==='hollow';
  if(nativeHollow&&objects.barcolors.length){const shown=new Set(bars.map(bar=>bar.time));barColors=hollowNative?objects.barcolors.map(row=>({time:row.time*1000,color:visualColor(row.color)})).filter(row=>shown.has(row.time)):[];}
  if(!hollowNative&&objects.barcolors.length&&bars.length&&BARCOLOR_STYLES.has(priceStyle)){
    const colours=new Map(objects.barcolors.map(row=>[row.time*1000,visualColor(row.color)]));
    const heikin=priceStyle.includes('heikinashi')?chartType('heikinashi')?.barTransform?.full(bars.map(bar=>({...bar})))??heikinAshiBars(bars.map(bar=>({...bar,volume:bar.volume??0}))):undefined;
    const drawn=(heikin&&heikin.length===bars.length?heikin:bars).map((bar,index)=>({time:bars[index].time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bars[index].volume??0}));
    if(drawn.some(bar=>colours.has(bar.time)))barSeries={id:stableSeriesId({instanceId,kind:'candle',title:'script:barcolor',ordinal:0}),title:'Bar color',paneId:'',kind:priceStyle==='bars'?'bar':'candle',visible:true,overlay:true,
      display:{pane:true,priceScale:false,legend:false,dataWindow:false},bars:drawn,style:{up:'rgba(0,0,0,0)',down:'rgba(0,0,0,0)'},barColors:drawn.map(bar=>{const color=colours.get(bar.time);return color?{color,wickColor:color,borderColor:color}:null;})} as SeriesSpec;
  }
  return {lines,boxes,labels,tables,polylines,linefills,barSeries,barColors};
}
/** #RRGGBBAA becomes rgba(); #RRGGBB passes through. */
function visualColor(color:string):string{if(color.length!==9)return color;const part=(at:number)=>Number.parseInt(color.slice(at,at+2),16);return `rgba(${part(1)},${part(3)},${part(5)},${Math.round(part(7)/255*1000)/1000})`;}
const plotSeriesId=(instanceId:string,plotId:string)=>stableSeriesId({instanceId,kind:'line',title:`script:${plotId}`,ordinal:0});
/**
 * The non-series part of a script render, through the same native output the plots use: hlines as
 * price lines, fills between two plot series (by plot title), bgcolor as bar-span backgrounds and plotshape or
 * plotchar as bar-anchored labels. Times beyond availableThrough are not drawn, as for plots. barTimes (seconds,
 * ascending) give each background its span up to the next chart bar.
 */
export function renderScriptVisuals(instanceId:string,visuals:ScriptVisuals|undefined,plots:readonly ScriptPlot[],availableThrough:number,barTimes:readonly number[],styles:Record<string,IndicatorPlotStyle>={},positions?:ScriptLogicalPositions):Omit<NativeIndicatorOutput,'series'>{
  if(!visuals)return {fills:[],backgrounds:[],priceLines:[],labels:[]};
  validateScriptVisuals(visuals);
  positions?.assertCurrent();
  const logicalIndex=(row:{time:number;index?:number})=>positions!.assertEmission(row.index,row.time);
  const coordinate=(row:{time:number;index?:number})=>{if(!positions)return row.time;const index=logicalIndex(row);if(index<0)throw Error('Script visual output has no owned logical bar position.');return positions.nativeTime(index);};
  const ids=new Set(plots.map(plot=>plot.id)),lineTitles=new Set(visuals.hlines.map(row=>row.title));
  // Position m of the first endpoint: a logical index, the plot's own m-th point, or the m-th chart bar (hline anchors).
  const fillColors=(row:ScriptVisuals['fills'][number],plot:ScriptPlot|null):Array<string|null>=>{
    const rows=row.colors!,base=visualColor(row.color),byKey=new Map<number,number>();for(let i=0;i<rows.times.length;i++)byKey.set(positions?rows.indices?.[i]??-1:rows.times[i],rows.values[i]);
    const keys=positions?Array.from({length:positions.count},(_,m)=>m):plot?plot.values.filter(point=>point.time<=availableThrough).map(point=>point.time):barTimes.filter(time=>time<=availableThrough);
    return keys.map(key=>{const value=byKey.get(key);return value===undefined?base:value<0?null:visualColor(rows.palette[value]);});
  };
  const next=(time:number)=>{let low=0,high=barTimes.length;while(low<high){const middle=(low+high)>>1;if(barTimes[middle]<=time)low=middle+1;else high=middle;}if(low<barTimes.length)return barTimes[low];const step=barTimes.length>1?barTimes[barTimes.length-1]-barTimes[barTimes.length-2]:60;return time+Math.max(1,step);};
  return {
    // A Style tab override (visible, colour, width, line style) replaces the script's own hline style.
    priceLines:visuals.hlines.map((row,index)=>{const style=Object.hasOwn(styles,scriptHlineStyleId(row.title))?styles[scriptHlineStyleId(row.title)]:undefined;return style?.visible===false?null:{id:`${instanceId}:hline:${index}`,paneId:'',price:row.price,color:style?visualColor(style.color):visualColor(row.color),lineStyle:style?.lineStyle??row.lineStyle,width:style?Math.max(1,Math.min(4,Math.round(style.width))):row.width,title:row.title};}).filter(<T,>(row:T|null):row is T=>row!==null),
    // Hline fills run between hidden anchor series (renderScriptHlineAnchors); per-bar colours align with the
    // first endpoint's points, unless a Style tab colour other than the script's own replaces them with one colour.
    fills:visuals.fills.filter(row=>row.between==='hlines'?lineTitles.has(row.from)&&lineTitles.has(row.to):ids.has('lvplot:'+row.from)&&ids.has('lvplot:'+row.to)).map((row,index)=>{const style=Object.hasOwn(styles,scriptFillStyleId(row.title))?styles[scriptFillStyleId(row.title)]:undefined;if(style?.visible===false)return null;
      const endpoint=(title:string)=>row.between==='hlines'?plotSeriesId(instanceId,scriptHlineStyleId(title)):plotSeriesId(instanceId,'lvplot:'+title);
      const flat=style&&!sameColor(style.color,visualColor(row.color))&&!sameColor(style.color,row.color),colors=row.colors&&!flat?fillColors(row,row.between==='hlines'?null:plots.find(plot=>plot.id==='lvplot:'+row.from)??null):undefined;
      return {id:`${instanceId}:fill:${index}`,paneId:'',fromSeriesId:endpoint(row.from),toSeriesId:endpoint(row.to),color:style?visualColor(style.color):visualColor(row.color),...(colors?{colors}:{})};}).filter(<T,>(row:T|null):row is T=>row!==null),
    backgrounds:visuals.backgrounds.filter(row=>positions||row.time<=availableThrough).map((row,index)=>({id:`${instanceId}:bg:${index}`,paneId:'',from:coordinate(row)*1000,to:(positions?positions.spanEnd(logicalIndex(row)):next(row.time))*1000,color:visualColor(row.color)})),
    labels:visuals.markers.filter(row=>positions||row.time<=availableThrough).map((row,index)=>({id:`${instanceId}:shape:${index}`,paneId:'',xloc:'bar_time' as const,x:coordinate(row)*1000,y:0,yloc:row.location,text:row.text||undefined,style:row.shape as never,color:visualColor(row.color),textColor:visualColor(row.color),size:row.size,textAlign:'center' as const,fontFamily:'default' as const,tooltip:row.title})),
  };
}
/** Hidden constant series at each hline that a between-hlines fill uses (off every surface, so they never
 *  stretch the scale or show a value). One point per chart bar (or logical position). */
export function renderScriptHlineAnchors(instanceId:string,visuals:ScriptVisuals|undefined,availableThrough:number,barTimes:readonly number[],positions?:ScriptLogicalPositions):SeriesSpec[]{
  if(!visuals)return [];const used=new Set<string>();for(const row of visuals.fills)if(row.between==='hlines'){used.add(row.from);used.add(row.to);}
  return visuals.hlines.filter(row=>used.has(row.title)).map(row=>({id:plotSeriesId(instanceId,scriptHlineStyleId(row.title)),title:row.title,paneId:'',kind:'line',visible:false,display:{pane:false,priceScale:false,legend:false,dataWindow:false},
    points:positions?Array.from({length:positions.count},(_,index)=>({time:positions.nativeTime(index)*1000,value:row.price})):barTimes.filter(time=>time<=availableThrough).map(time=>({time:time*1000,value:row.price})),style:{color:NO_COLOR,width:1,lineStyle:'solid'}}) as SeriesSpec);
}
// src/chart/native-full-model.ts enforces this existing per-array ceiling on value updates.
const LOGICAL_NATIVE_OUTPUT_ROWS=2048;
interface LogicalPaintBudget {emitted:number;dense:number;other:number;total:number}
function logicalPaintBudget(result:ScriptRenderResult,positions:ScriptLogicalPositions,styles:Record<string,IndicatorPlotStyle>,suppressTables=false):LogicalPaintBudget{
 const fail=()=>{throw Error('Logical script geometry exceeds the existing 10000 output-record allowance.');};
 const data=(value:unknown,key:string):any=>{if(!value||typeof value!=='object')return undefined;const field=Object.getOwnPropertyDescriptor(value,key);if(field&&!Object.hasOwn(field,'value'))return fail();return field?.value;};
 const length=(rows:unknown):number=>{if(rows===undefined)return 0;if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype||!Number.isSafeInteger(rows.length)||rows.length>10000)return fail();return rows.length;};
 const anchorCount=(()=>{const visuals=data(result,'visuals'),rows=data(visuals,'fills'),used=new Set<string>();for(let index=0;index<length(rows);index++){const row=data(rows,String(index));if(data(row,'between')==='hlines'){used.add(data(row,'from'));used.add(data(row,'to'));}}return used.size;})();
 const N=positions.count,P=length(result.plots),dense=N*(P+anchorCount);if(P>LOGICAL_NATIVE_OUTPUT_ROWS)throw Error('Logical script geometry exceeds the existing 2048 native output-row allowance.');if(!Number.isSafeInteger(dense)||dense>10000)fail();let emitted=0,other=0;
 for(let index=0;index<P;index++){emitted+=length(data(data(result.plots,String(index)),'values'));if(emitted>10000)fail();}
 const visuals=data(result,'visuals'),objects=data(result,'objects'),logs=data(result,'logs');
 other+=length(data(visuals,'hlines'))+length(data(visuals,'fills'))+2*length(data(visuals,'backgrounds'))+length(data(visuals,'markers'));
 other+=length(data(objects,'barcolors'))+length(data(objects,'labels'))+2*length(data(objects,'lines'))+2*length(data(objects,'boxes'))+length(data(objects,'linefills'));
 const polylineRows=data(objects,'polylines');for(let index=0;index<length(polylineRows);index++)other+=1+length(data(data(polylineRows,String(index)),'points'));
 const tables=data(objects,'tables');if(!suppressTables){other+=length(tables);for(let index=0;index<length(tables);index++){const table=data(tables,String(index)),rows=data(table,'rows'),columns=data(table,'columns'),slots=rows*columns;if(!Number.isSafeInteger(rows)||!Number.isSafeInteger(columns)||rows<1||columns<1||!Number.isSafeInteger(slots)||slots>10000)fail();other+=slots;}}
 other+=length(data(logs,'entries'))+length(data(result,'alerts'))+length(data(result,'orders'));const conditions=data(result,'conditions');for(let index=0;index<length(conditions);index++)other+=length(data(data(conditions,String(index)),'values'));
 const total=dense+other;if(!Number.isSafeInteger(total)||total>10000)fail();
 const nativeFail=()=>{throw Error('Logical script geometry exceeds the existing 2048 native output-row allowance.');};
 if(length(data(visuals,'backgrounds'))>LOGICAL_NATIVE_OUTPUT_ROWS)nativeFail();
 const shown=(key:string)=>!Object.hasOwn(styles,key)||data(data(styles,key),'visible')!==false;let priceLines=0,fills=0;
 const hlines=data(visuals,'hlines');for(let index=0;index<length(hlines);index++)if(shown(scriptHlineStyleId(data(data(hlines,String(index)),'title')))&&++priceLines>LOGICAL_NATIVE_OUTPUT_ROWS)nativeFail();
 const fillRows=data(visuals,'fills');if(length(fillRows)){const ids=new Set<string>();for(let index=0;index<P;index++)ids.add(data(data(result.plots,String(index)),'id'));for(let index=0;index<length(fillRows);index++){const row=data(fillRows,String(index));if(ids.has('lvplot:'+data(row,'from'))&&ids.has('lvplot:'+data(row,'to'))&&shown(scriptFillStyleId(data(row,'title')))&&++fills>LOGICAL_NATIVE_OUTPUT_ROWS)nativeFail();}}
 positions.assertCurrent();return{emitted,dense,other,total};
}
export function renderScriptPlots(instanceId:string,plots:readonly ScriptPlot[],styles:Record<string,IndicatorPlotStyle>,availableThrough:number,scriptTitle?:string,positions?:ScriptLogicalPositions,visuals?:ScriptVisuals):SeriesSpec[]{
  if(positions){validateIndexedScriptPlots(plots,positions);if(!Number.isSafeInteger(positions.count*plots.length)||positions.count*plots.length>10000)throw Error('Logical script plot conversion exceeds the existing output limit.');}else validateScriptPlots(plots);validateScriptStyles(styles);positions?.assertCurrent();
  return plots.map((plot,index)=>{
    // Script style options are the defaults; per-point colours apply unless a saved Style tab colour differs
    // from the script's own first colour; the offset shifts the points by whole bars.
    const row=scriptPlotStyleRow(visuals,plot.title),fallback=scriptPlotDefaultStyle(plot,index,row),override=Object.hasOwn(styles,plot.id)?styles[plot.id]:undefined,style=override??fallback;
    const tints=row?.colors&&row.palette&&row.colors.length===plot.values.length&&(!override||sameColor(override.color,plot.color))?row.colors.map(value=>paletteColor(row.palette!,value)):null;
    let logicalPoints:Array<{time:number;value:number|null;color?:string}>|undefined;
    if(positions){logicalPoints=Array.from({length:positions.count},(_,index)=>({time:positions.nativeTime(index)*1000,value:null}));for(let at=0;at<plot.values.length;at++){const point=plot.values[at],index=positions.assertEmission(point.index,point.time);logicalPoints[index].value=point.value;if(tints)logicalPoints[index].color=tints[at];}positions.assertCurrent();}
    const points=logicalPoints??plot.values.flatMap((point,at)=>point.time<=availableThrough?[tints?{time:point.time*1000,value:point.value,color:tints[at]}:{time:point.time*1000,value:point.value}]:[]);
    return {id:plotSeriesId(instanceId,plot.id),title:scriptTitle?`${scriptTitle} · ${plot.title}`:plot.title,paneId:'',kind:style.kind,visible:style.visible,
      display:{pane:style.visible,priceScale:style.visible&&style.priceScale,legend:style.legend,dataWindow:style.dataWindow},
      points:row?.offset?shiftPoints(points,row.offset,!!positions):points,style:{color:style.color,width:style.width,lineStyle:style.lineStyle,...plotBaseStyle(style.kind)},
    } as SeriesSpec;
  });
}
class ScriptRenderingIndicator implements NativeIndicator{
  #tableNative:ScriptTableNativeState;
  #retireTableNative(){const state=this.#tableNative;state.epoch={};state.output=null;state.native=null;state.active=null;state.mounted=null;state.input=null;state.result=null;state.expectedPlacement=null;}
  ctx:NativeIndicatorContext|null=null;handle:IndicatorHandle|null=null;removed=false;readoutInput:object={};positionProblem:string|undefined;paintAccepted=false;tablePlacementPending=false;paintedTableSource:ScriptObjects['tables']|null=null;paintedTables:readonly object[]|null=null;paintedSeries:readonly SeriesSpec[]|null=null;paintedPlots:readonly {native:object;points:readonly object[];tail:object|null}[]|null=null;paintBudget:LogicalPaintBudget|undefined;
  constructor(public settings:ScriptRenderSettings,public result:ScriptRenderResult,private changed:()=>void,private inputsChanged:(id:string,bars:Bar[])=>void,private priceStyle:()=>string=()=>'candles',private retireReadout:()=>void=()=>{},private presentation:()=>ScriptPresentationLease|null=()=>null,private owned:()=>boolean=()=>true,tableNative:ScriptTableNativeState={epoch:{},output:null,native:null,active:null,mounted:null,input:null,result:null,expectedPlacement:null}){this.#tableNative=tableNative;}
  start(ctx:NativeIndicatorContext){this.#retireTableNative();this.readoutInput={};this.retireReadout();this.ctx=ctx;this.removed=false;this.render();}
  onBars(){this.#retireTableNative();if(!this.owned()||this.removed||!this.ctx)return;this.readoutInput={};this.retireReadout();this.render();const ctx=this.ctx;if(ctx&&this.owned()&&!this.removed){const rows=ctx.bars();if(this.ctx===ctx&&this.owned()&&!this.removed)this.inputsChanged(this.settings.id,rows.map(bar=>({...bar,time:bar.time/1000,volume:bar.volume??NaN})));}}
  onViewport(){}
  setInputs(){this.#retireTableNative();this.paintedTables=null;this.paintedTableSource=null;this.paintedSeries=null;this.paintedPlots=null;this.readoutInput={};this.retireReadout();}
  suspend(){this.#retireTableNative();this.paintedTables=null;this.paintedTableSource=null;this.paintedSeries=null;this.paintedPlots=null;this.settings.visible=false;this.changed();}
  resume(){this.settings.visible=true;this.render();}
  stop(){this.#retireTableNative();this.paintedTables=null;this.paintedTableSource=null;this.paintedPlots=null;this.paintedSeries=null;this.paintAccepted=false;this.readoutInput={};this.retireReadout();this.ctx=null;this.changed();}
  render(){
   this.#retireTableNative();const nativeState=this.#tableNative,outputEpoch=nativeState.epoch;
   const ctx=this.ctx,result=this.result,settings=this.settings,input=this.readoutInput,styles=settings.plots,title=settings.title,visible=settings.visible,tablePlacement=settings.tablePlacement,tableObjects=result.objects,tableSource=tableObjects?.tables??null;
   const current=()=>!!ctx&&this.owned()&&!this.removed&&nativeState.epoch===outputEpoch&&this.ctx===ctx&&this.result===result&&this.settings===settings&&this.readoutInput===input&&settings.plots===styles&&settings.title===title&&settings.visible===visible&&settings.tablePlacement===tablePlacement&&(tablePlacement!=='bottom'||result.objects===tableObjects&&(result.objects?.tables??null)===tableSource);
   if(!current())return;const priceStyle=this.priceStyle();if(!current())return;const proof=this.presentation(),positions=proof?.logicalPositions;if(!current())return;this.paintAccepted=false;this.paintedTables=null;this.paintedTableSource=null;this.paintedSeries=null;this.paintedPlots=null;this.paintBudget=undefined;
   const empty=()=>{if(!current())return;const tables:NonNullable<NativeIndicatorOutput['tables']>=[],output:NativeIndicatorOutput={series:[],fills:[],priceLines:[],backgrounds:[],labels:[],lines:[],boxes:[],polylines:[],linefills:[],tables};ctx!.emit(output);if(current()){nativeState.output=output;this.paintedTables=tables;this.changed();}};
   if(isDerivedStyle(priceStyle)&&!proof){this.positionProblem='Derived script geometry is waiting for an owned logical chart position.';empty();return;}
   try{
    if(proof&&!proof.isCurrent()||!current())return;positions?.assertCurrent();if(!current())return;const budget=positions?logicalPaintBudget(result,positions,styles,tablePlacement==='bottom'):undefined;if(proof&&!proof.isCurrent()||!current())return;this.paintBudget=budget;const bars=ctx!.bars();positions?.assertCurrent();if(proof&&!proof.isCurrent()||!current())return;
    const available=(bars.at(-1)?.time??-Infinity)/1000;this.positionProblem=undefined;
    const {barSeries,barColors,...objects}=renderScriptObjects(settings.id,result.objects,bars,priceStyle,NATIVE_HOLLOW_BARCOLORS,positions??undefined,message=>{if(current())this.positionProblem=message;},tablePlacement==='bottom');
    const visuals=renderScriptVisuals(settings.id,result.visuals,result.plots,available,positions?[]:bars.map(bar=>bar.time/1000),styles,positions??undefined);
    if(positions&&[result.plots,visuals.fills??[],visuals.backgrounds??[],visuals.priceLines??[]].some(rows=>rows.length>LOGICAL_NATIVE_OUTPUT_ROWS))throw Error('Logical script geometry exceeds the existing 2048 native output-row allowance.');
    const series=renderScriptPlots(settings.id,result.plots,styles,available,title,positions??undefined,result.visuals),anchors=renderScriptHlineAnchors(settings.id,result.visuals,available,positions?[]:bars.map(bar=>bar.time/1000),positions??undefined);
    positions?.assertCurrent();if(proof&&!proof.isCurrent()||!current())return;const paintedSeries=[...series,...anchors,...(barSeries?[barSeries]:[])],paintedPlots=series.length<=2048?Object.freeze(series.map(native=>{const points=(native as unknown as {points:object[]}).points;return Object.freeze({native,points,tail:points.at(-1)??null});})):null;const output={series:paintedSeries,...visuals,...objects,...(barColors?{barColors}:{}),labels:[...(visuals.labels??[]),...objects.labels]} as NativeIndicatorOutput;ctx!.emit(output);positions?.assertCurrent();if(current()&&(!proof||proof.isCurrent())&&current()){nativeState.output=output;this.paintedSeries=paintedSeries;this.paintedPlots=paintedPlots;this.paintedTables=objects.tables;this.paintedTableSource=tableSource;this.tablePlacementPending=false;this.paintAccepted=true;this.changed();}
   }catch(error){if(!positions&&!isDerivedStyle(priceStyle))throw error;if(!current())return;this.positionProblem=error instanceof Error&&/output|10000/.test(error.message)?error.message:'Derived script geometry is unavailable for the current confirmed chart positions.';empty();}
  }
}
let sequence=0;
export type ScriptInteraction={kind:'removed';id:string}|{kind:'visibility';id:string;visible:boolean}|{kind:'moved';id:string;pane:'price'|'new';paneId:string;ownScale:boolean};
export function createScriptPort(chart:Vela,panes:PaneRegistry=createPaneRegistry(chart),claimNative?:ClaimNativeDescriptor,presentationHost?:ScriptPresentationHost){
 return createScriptPresentationPort(presentationHost,presentation=>{
  const prefix=`lv-script-render-${++sequence}`;const models=new Map<string,{type:string;model:ScriptRenderingIndicator;tableState:ScriptTableNativeState;release?:()=>void;descriptor?:object}>();const subscribers=new Set<()=>void>();const inputSubscribers=new Set<(id:string,bars:Bar[])=>void>();const interactions=new Set<(event:ScriptInteraction)=>void>(),pendingPanes=new Map<string,string>();let commandDepth=0,externalDepth=0;let remounting:{entry:object;model:ScriptRenderingIndicator;handle:IndicatorHandle}|null=null;
  const checkpoints=new WeakMap<ScriptResultsCheckpoint,Array<{settings:ScriptRenderSettings;result:ScriptRenderResult}>>();
  // Ctx.barcolor follows the renderer's current price style (a style change re-runs scripts).
  const priceStyle=()=>{try{const style=(chart as unknown as {renderer?:{get?:(key:string)=>unknown}}).renderer?.get?.('priceStyle');return typeof style==='string'?style:'candles';}catch{return 'candles';}};
  const notifications=createNotificationBatch(()=>{for(const fn of subscribers)fn();}),changed=notifications.changed;presentation.setNotifier(changed);const inputsChanged=(id:string,bars:Bar[])=>{if(!externalDepth)for(const fn of inputSubscribers)fn(id,structuredClone(bars));};
  const command=<T,>(action:()=>T)=>{commandDepth++;try{return notifications.transaction(action);}finally{commandDepth--;}};
  const external=(event:ScriptInteraction)=>{if(!commandDepth&&!externalDepth)for(const fn of interactions)fn(event);};
  const mount=(type:string,model:ScriptRenderingIndicator)=>{const descriptor={type,title:model.settings.title,shortTitle:model.settings.title,paneHint:model.settings.pane,overlay:model.settings.pane==='price'&&model.settings.ownScale!==true,inputsSchema:()=>[],defaultInputs:()=>({} as Record<string,InputValue>),create:()=>model};registerNativeIndicator(descriptor);models.get(model.settings.id)!.descriptor=descriptor;models.get(model.settings.id)!.release=claimNative?.(descriptor);model.handle=chart.addNativeIndicator(type);if(!model.settings.visible)model.handle.setVisible(false);};
  const removeForRemount=(entry:{model:ScriptRenderingIndicator})=>{const previous=remounting,model=entry.model,handle=model.handle!;remounting={entry,model,handle};try{handle.remove();}finally{remounting=previous;}};
  const bindPending=(model:ScriptRenderingIndicator)=>{const desired=pendingPanes.get(model.settings.id);if(!desired||!model.handle||!panes.info(model.handle))return;pendingPanes.delete(model.settings.id);command(()=>{panes.bind(model.handle!,desired,model.settings.ownScale);model.settings.paneId=desired;});};
  const retireTableNativeMetadata=(model:ScriptRenderingIndicator)=>{const state=models.get(model.settings.id)?.tableState;if(state){state.epoch={};state.native=null;state.active=null;state.expectedPlacement=null;}};
  const bindReadout=(model:ScriptRenderingIndicator)=>{
   const settings=Object.getOwnPropertyDescriptor(model,'settings'),id=settings&&'value' in settings?Object.getOwnPropertyDescriptor(settings.value,'id'):undefined,result=Object.getOwnPropertyDescriptor(model,'result');
   if(!id||!('value' in id)||typeof id.value!=='string'||!result||!('value' in result)){presentation.dropModel(model);return;}
   const key=id.value,entry=models.get(key);if(!entry||entry.model!==model||model.removed){presentation.dropModel(model);return;}
   presentation.bind({id:key,model,result:result.value,paintedSeries:model.paintedSeries,paintedPlots:model.paintedPlots,paintedTables:model.paintedTables,tableSource:model.paintedTableSource,tableState:entry.tableState,paintAccepted:model.paintAccepted,native:()=>models.get(key)===entry?captureScriptPresentationNative(chart as unknown as object,model,entry.descriptor):null,metadata:()=>scriptPresentationMetadata(model)});
   if(models.get(key)!==entry)presentation.dropModel(model);
  };

  const applyTableDestination=(id:string,destination:'chart'|'bottom',native:ScriptTableNativeTransition,restore?:NativeIndicatorOutput)=>{
   if(destination!=='chart'&&destination!=='bottom')throw Error('Invalid script table destination.');const entry=models.get(id),model=entry?.model;if(!entry||!model||model.removed)throw Error('Unknown script instance');
   if(tablePlacementMode(model.settings)===destination&&!model.tablePlacementPending)return;
   return command(()=>{
    const settings=model.settings,previous=tablePlacementMode(settings)==='bottom'?'bottom':undefined,result=model.result,input=model.readoutInput,state=entry.tableState,epoch=state.epoch,active=state.active,previousOutput=state.output,source=result.objects?.tables??null;
    const cohort=()=>models.get(id)===entry&&model.settings===settings&&model.result===result&&model.readoutInput===input&&!model.removed&&state.epoch===epoch&&state.active===active&&tablePlacementMatches(settings,state.expectedPlacement);
    if(!previousOutput||!cohort()||!native.isCurrent())throw Error('The script table source changed before its destination could apply.');
    if(destination==='bottom'&&!native.emptyOnly)freezeScriptPresentationTables(result,settings.title);
    const positions=!native.emptyOnly?presentation.positionsFor(result,id):null;if(destination==='chart'&&positions)logicalPaintBudget(result,positions,settings.plots);
    if(!cohort()||!native.isCurrent())throw Error('The script table source changed during native admission.');
    model.tablePlacementPending=true;if(destination==='bottom')settings.tablePlacement='bottom';else delete settings.tablePlacement;state.expectedPlacement=destination;
    try{
     if(destination==='chart'&&positions)logicalPaintBudget(result,positions,settings.plots);
     const tables=restore?.tables??(native.emptyOnly||destination==='bottom'?[]:renderScriptObjects(settings.id,{base:null,barcolors:[],labels:[],lines:[],boxes:[],tables:source??[]},[],'candles').tables),output=restore??{...previousOutput,tables};
     if(!cohort()||!native.isCurrent())throw Error('Script table source changed before native publication.');native.emit(output);
     if(!cohort()||!native.isCurrent())throw Error('Script table owner changed during native publication.');model.paintedTables=tables??[];model.paintedTableSource=source;model.tablePlacementPending=false;bindReadout(model);if(!cohort()||!native.isCurrent())throw Error('Script table source changed during accepted binding.');changed();
    }catch(error){
     // A thrown-after-apply candidate is still recoverable, but an unrelated/native B is never an A recovery target.
     if(cohort()&&native.canRecover()){
      if(previous===undefined)delete settings.tablePlacement;else settings.tablePlacement=previous;state.expectedPlacement=previous??'chart';
      try{native.recover(previousOutput);if(!cohort()||!native.isCurrent())throw Error('Native table recovery was not accepted.');model.paintedTables=previousOutput.tables??[];model.paintedTableSource=source;model.tablePlacementPending=false;bindReadout(model);}catch(rollback){throw new AggregateError([error,rollback],'Script table destination and recovery were incomplete');}
     }
     throw error;
    }
   });
  };
  const prepareDestinationBinding=(id:string,destination?:'chart'|'bottom'):ScriptTableDestinationLease=>{
   const entry=models.get(id),model=entry?.model;if(!entry||!model||model.removed||model.tablePlacementPending)throw Error('Wait for the current script tables before restoring their destination.');
   const result=model.result,settings=model.settings,input=model.readoutInput,state=entry.tableState,epoch=state.epoch,original=state.output,before=tablePlacementMode(settings);
   const create=presentation.tableNativeTransition;if(!create)throw Error('This renderer cannot prepare owned table native transitions.');const native=create.call(presentation,model,destination),active=state.active;
   const current=()=>models.get(id)===entry&&!model.removed&&model.result===result&&model.settings===settings&&model.readoutInput===input&&state.epoch===epoch&&state.active===active&&tablePlacementMatches(settings,state.expectedPlacement)&&native.isCurrent();
   try{if(!original||!current())throw Error('Wait for current accepted script tables before restoring their destination.');return preparedTableDestination({current,before,move:(target,rollback)=>{if(!current())throw Error('The script source changed.');applyTableDestination(id,target,native,rollback?original:undefined);if(!current())throw Error('The script source changed during table destination publication.');},release:()=>native.release()});}catch(error){native.release();throw error;}
  };
  const port={
    captureReadout(id:string):ScriptReadoutSnapshot{return presentation.capture(models.get(id)?.model??null);},
    captureTables(id:string):ScriptTablesSnapshot{return presentation.captureTables(models.get(id)?.model??null);},
    prepareTableDestination(id:string,destination?:'chart'|'bottom'):ScriptTableDestinationLease{return prepareDestinationBinding(id,destination);},
    tableInventory(){if(models.size>100)throw Error('Script table inventory exceeds the existing binding limit.');return Object.freeze([...models.values()].filter(({model})=>!model.removed).map(({model})=>{const count=model.result.objects?.tables.length??0;if(!Number.isSafeInteger(count)||count<0||count>9)throw Error('Script tables exceed the existing nine-table limit.');return Object.freeze({id:model.settings.id,title:model.settings.title,visible:model.settings.visible,placement:model.settings.tablePlacement??'chart',count});}));},
    placeTables(id:string,destination:'chart'|'bottom'){const model=models.get(id)?.model;if(!model||model.removed)throw Error('Unknown script instance');if(tablePlacementMode(model.settings)===destination&&!model.tablePlacementPending)return;const lease=prepareDestinationBinding(id,destination);try{lease.apply(destination);}finally{lease.release();}},
    /** Bounded management/settings metadata; never copies numerical arrays or provenance. */
    presentationMetadata():readonly ScriptPresentationMetadataRow[]{
      const rows:ScriptPresentationMetadataRow[]=[];
      const data=(value:unknown,key:string,optional=false):unknown=>{if(!value||typeof value!=='object')throw Error('Script management metadata is unavailable.');const field=Object.getOwnPropertyDescriptor(value,key);if(!field&&optional)return undefined;if(!field||!('value' in field))throw Error('Script management metadata requires data fields.');return field.value;};
      const array=(value:unknown):unknown[]=>{if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>10000)throw Error('Script metadata exceeds the existing plot limit.');return value;};
      const textValue=(value:unknown,maximum:number):string=>{if(typeof value!=='string'||value.length>maximum)throw Error('Script label metadata is invalid.');return value;};
      const colorValue=(value:unknown):string=>{if(typeof value!=='string'||!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value))throw Error('Script style color is invalid.');return value;};
      const empty=Object.freeze(Object.create(null)) as Readonly<Record<string,IndicatorPlotStyle>>;
      for(const [id,entry]of models){
        const model=entry.model;let title='Script',visible=true,actualPaneId:string|null=null,stylesAvailable=false,native:ReturnType<typeof captureScriptPresentationNative>=null;
        let plots:ScriptPresentationMetadataRow['plots']=Object.freeze([]),renderedPlots:Readonly<Record<string,IndicatorPlotStyle>>=empty,renderedVisuals:Readonly<Record<string,IndicatorPlotStyle>>=empty;
        try{
          if(data(model,'removed')!==false||models.get(id)!==entry)continue;
          const metadata=scriptPresentationMetadata(model);title=textValue(metadata.title,200);visible=metadata.visible;
          native=captureScriptPresentationNative(chart as unknown as object,model,entry.descriptor);if(!model.paintAccepted)throw Error('Script native geometry is unavailable.');const result=data(model,'result'),source=array(data(result,'plots')),styles=metadata.styles,visuals=data(result,'visuals',true);
          const hlines=visuals===undefined?[]:array(data(visuals,'hlines')),fills=visuals===undefined?[]:array(data(visuals,'fills'));
          // Script plot style defaults (style, linewidth, display), read as data fields only.
          const plotStyleRows=new Map<string,ScriptPlotStyle>(),styleSource=visuals===undefined?undefined:data(visuals,'plotStyles',true);
          if(styleSource!==undefined){const rows=array(styleSource);if(rows.length>10000)throw Error('Script metadata exceeds the existing output limit.');for(let index=0;index<rows.length;index++){const row=data(rows,String(index)),shown=data(row,'display'),name=data(row,'style'),width=data(row,'linewidth');
            if(typeof name!=='string'||!Object.hasOwn(SCRIPT_PLOT_KINDS,name)||!(width===null||typeof width==='number'))throw Error('Script plot style metadata is invalid.');
            plotStyleRows.set(textValue(data(row,'title'),128),{title:'',style:name as ScriptPlotStyleName,linewidth:width,offset:0,display:{pane:data(shown,'pane')===true,priceScale:data(shown,'priceScale')===true,legend:data(shown,'legend')===true,dataWindow:data(shown,'dataWindow')===true},palette:null,colors:null});}}
          // Count all metadata rows before walking them; then admit point lengths without reading a point.
          if(source.length+hlines.length+fills.length>10000)throw Error('Script metadata exceeds the existing output limit.');
          let count=hlines.length+fills.length;for(let index=0;index<source.length;index++){const values=array(data(data(source,String(index)),'values'));count+=values.length;if(count>10000)throw Error('Script metadata exceeds the existing output limit.');}
          const numeric:Record<string,IndicatorPlotStyle>=Object.create(null),visual:Record<string,IndicatorPlotStyle>=Object.create(null),snapshot:Array<ScriptPresentationMetadataRow['plots'][number]>=[];
          const copyStyle=(key:string,fallback:IndicatorPlotStyle):IndicatorPlotStyle=>{
            const field=Object.getOwnPropertyDescriptor(styles,key);if(field&&!('value' in field))throw Error('Script style metadata requires data fields.');
            const source=field?.value??fallback,copy:Record<string,unknown>=Object.create(null);
            for(const name of ['visible','color','width','lineStyle','kind','priceScale','legend','dataWindow'])copy[name]=data(source,name);
            validateIndicatorPlotStyle(copy);return Object.freeze(copy) as unknown as IndicatorPlotStyle;
          };
          for(let index=0;index<source.length;index++){
            const plot=data(source,String(index)),key=textValue(data(plot,'id'),135),label=textValue(data(plot,'title'),128),color=colorValue(data(plot,'color'));
            if(!key)throw Error('Script plot identity is unavailable.');
            const style=copyStyle(key,scriptPlotDefaultStyle({id:key,color},index,plotStyleRows.get(label)));numeric[key]=style;snapshot.push(Object.freeze({id:key,title:label,color:style.color,visible:style.visible,legend:style.legend,dataWindow:style.dataWindow}));
          }
          for(let index=0;index<hlines.length;index++){
            const row=data(hlines,String(index)),label=textValue(data(row,'title'),128),price=data(row,'price'),width=data(row,'width'),lineStyle=data(row,'lineStyle');
            if(typeof price!=='number'||!Number.isFinite(price)||typeof width!=='number'||!Number.isFinite(width))throw Error('Script line metadata is invalid.');
            const color=colorValue(data(row,'color'));if(lineStyle!=='solid'&&lineStyle!=='dashed'&&lineStyle!=='dotted')throw Error('Script line metadata is invalid.');
            const key=scriptHlineStyleId(label);visual[key]=copyStyle(key,{visible:true,color:visualColor(color),width,lineStyle,kind:'line',priceScale:true,legend:true,dataWindow:true});
          }
          for(let index=0;index<fills.length;index++){
            const row=data(fills,String(index)),label=textValue(data(row,'title'),128),color=colorValue(data(row,'color'));textValue(data(row,'from'),135);textValue(data(row,'to'),135);
            const key=scriptFillStyleId(label);visual[key]=copyStyle(key,{visible:true,color:visualColor(color),width:1,lineStyle:'solid',kind:'line',priceScale:true,legend:true,dataWindow:true});
          }
          if(models.get(id)!==entry||data(model,'result')!==result)throw Error('Script management owner changed.');
          plots=Object.freeze(snapshot);renderedPlots=Object.freeze(numeric);renderedVisuals=Object.freeze(visual);
          stylesAvailable=true;
        }catch{/* Keep management available while style/numeric/native evidence is unavailable. */}
        if(native?.isCurrent()&&models.get(id)===entry)actualPaneId=native.paneId;else stylesAvailable=false;if(!stylesAvailable){plots=Object.freeze([]);renderedPlots=empty;renderedVisuals=empty;}
        if(models.get(id)===entry)rows.push(Object.freeze({id,title,visible,actualPaneId,plots,stylesAvailable,renderedPlots,renderedVisuals}));
      }
      return Object.freeze(rows);
    },
    beginExternalTransaction(){externalDepth++;const hold=notifications.beginExternalTransaction();let released=false;return{release(publish:boolean){if(released)throw new Error('Script transaction already released');if(typeof publish!=='boolean')throw new Error('Explicit script transaction outcome required');released=true;externalDepth--;hold.release(publish);}};},
    captureAcceptedResults():ScriptResultsCheckpoint{const token=Object.freeze({count:models.size});checkpoints.set(token,[...models.values()].map(({model})=>(()=>{const copied=copyOwnedScriptResult(model.result,presentation.positionsFor(model.result,model.settings.id)),result=copied.value;inheritScriptCsvJobResult(result,model.result);presentation.inherit(result,model.result,copied.numeric);return {settings:structuredClone(model.settings),result};})()));return token;},
    restoreAcceptedResults(token:ScriptResultsCheckpoint){const saved=checkpoints.get(token);if(!saved)throw new Error('Foreign script result checkpoint');const prior=port.captureAcceptedResults(),restore=(rows:typeof saved)=>{for(const id of [...models.keys()])port.remove(id);for(const row of rows)port.add(row.result,row.settings);};return command(()=>{try{restore(saved);}catch(error){try{restore(checkpoints.get(prior)!);}catch(rollback){throw new AggregateError([error,rollback],'Script results restore failed and native rollback was incomplete');}throw error;}});},
    placementStatus(){const diagnostics:string[]=[];for(const {model} of models.values()){const info=model.handle?panes.info(model.handle):undefined,logical=model.settings.paneId,actual=info?.indicators.find(row=>row.id===model.handle?.id);if(!info||!logical||panes.renderer(logical)!==info.id||actual?.ownScale!==(model.settings.ownScale??false))diagnostics.push('Script placement is not ready: '+model.settings.id);}return{ready:diagnostics.length===0,diagnostics};},
    subscribe(fn:()=>void){subscribers.add(fn);return ()=>subscribers.delete(fn);},
    onInteraction(fn:(event:ScriptInteraction)=>void){interactions.add(fn);return()=>{interactions.delete(fn);};},
    onInputChanged(fn:(id:string,bars:Bar[])=>void){inputSubscribers.add(fn);return ()=>inputSubscribers.delete(fn);},
    invalidateResults(){return notifications.transaction(()=>{for(const {model} of models.values()){retireScriptCsvJobModel(model);presentation.dropModel(model,true);model.result={plots:[],diagnostics:['Chart input changed; script results require recalculation.']};model.render();}if(models.size)changed();});},
    /** The ctx.log rows of each live script instance's last accepted run. */
    logs(){return [...models.values()].filter(({model})=>!model.removed).map(({model})=>({id:model.settings.id,title:model.settings.title,entries:structuredClone(model.result.logs?.entries??[]),dropped:model.result.logs?.dropped??0}));},
    list(){return [...models.values()].filter(({model})=>!model.removed).map(({model})=>({...structuredClone(model.settings),rendererId:model.handle?.id??'',visualStyles:Object.fromEntries(Object.entries(scriptVisualStyles(model.result.visuals)).map(([id,style])=>[id,Object.hasOwn(model.settings.plots,id)?{...style,...model.settings.plots[id]}:style])),diagnostics:[...structuredClone(model.result.diagnostics??[]),...(model.positionProblem?[{code:'SCRIPT_POSITION_UNAVAILABLE',message:model.positionProblem}]:[])],provenance:structuredClone(model.result.provenance),provisional:model.result.provisional??false,plots:Object.fromEntries(model.result.plots.map((plot,index)=>[plot.id,Object.assign(defaultPlotStyle('sma',plot.id,index),{color:plot.color},Object.hasOwn(model.settings.plots,plot.id)?model.settings.plots[plot.id]:{})])),plotDescriptors:model.result.plots.map(({values,...plot})=>plot),informationBars:model.ctx?.bars().length??0}));},
    configurationSnapshot():ScriptRenderSettings[]{return [...models.values()].filter(({model})=>!model.removed&&model.handle!==null).map(({model})=>structuredClone(model.settings));},
    add(result:ScriptRenderResult,options:Partial<ScriptRenderSettings>={}){
      return command(()=>{
      if(Object.hasOwn(options,'presentation')||Object.hasOwn(options,'visibility'))throw new Error('Built-in indicator presentation and interval visibility are unsupported on scripts.');
      const id=options.id??crypto.randomUUID(),copied=copyOwnedScriptResult(result,presentation.positionsFor(result,id));if(models.has(id))throw new Error('Duplicate script instance ID');
      if(Object.hasOwn(options,'tablePlacement')&&options.tablePlacement!=='bottom')throw Error('Invalid script table destination.');if(options.tablePlacement==='bottom')freezeScriptPresentationTables(copied.value,options.title??'CandleScript');
      const settings:ScriptRenderSettings={...(options.tablePlacement==='bottom'?{tablePlacement:'bottom' as const}:{}),id,title:options.title??'CandleScript',pane:options.pane??'price',paneId:options.paneId??null,ownScale:options.ownScale??false,visible:options.visible??true,plots:options.plots??{}};if(settings.paneId!==null&&(typeof settings.paneId!=='string'||!settings.paneId||settings.paneId.length>200)||typeof settings.ownScale!=='boolean')throw new Error('Invalid script placement');
      validateScriptStyles(settings.plots);const type=`${prefix}:${id}`,tableState:ScriptTableNativeState={epoch:{},output:null,native:null,active:null,mounted:null,input:null,result:null,expectedPlacement:null},model:ScriptRenderingIndicator=new ScriptRenderingIndicator(settings,copied.value,()=>{const entry=models.get(id),result=model.result,input=model.readoutInput,settings=model.settings,current=()=>!!entry&&models.get(id)===entry&&entry.model===model&&!model.removed&&model.result===result&&model.readoutInput===input&&model.settings===settings;if(!current())return;bindPending(model);if(!current())return;bindReadout(model);if(current())changed();},inputsChanged,priceStyle,()=>presentation.dropModel(model),()=>models.get(id)?.model===model?presentation.presentationFor(model.result,id):null,()=>models.get(id)?.model===model&&!model.removed,tableState);models.set(id,{type,model,tableState});pendingPanes.set(id,settings.paneId??(settings.pane==='price'?'price':`lv-pane-${crypto.randomUUID()}`));
      inheritScriptCsvJobResult(model.result,result);presentation.inherit(model.result,result,copied.numeric);
      try{mount(type,model);bindScriptCsvJobModel(model,model.result);bindPending(model);bindReadout(model);changed();return id;}
      catch(error){try{model.handle?.remove();}finally{models.get(id)?.release?.();unregisterNativeIndicator(type);presentation.dropModel(model,true);models.delete(id);pendingPanes.delete(id);}throw error;}
      });
    },
    update(id:string,result:ScriptRenderResult){const copied=copyOwnedScriptResult(result,presentation.positionsFor(result,id));const model=models.get(id)?.model;if(!model||model.removed)throw new Error('Unknown script instance');if(model.settings.tablePlacement==='bottom')freezeScriptPresentationTables(copied.value,model.settings.title);const previous=model.result;presentation.dropModel(model);model.result=copied.value;inheritScriptCsvJobResult(model.result,result);presentation.inherit(model.result,result,copied.numeric);retireScriptCsvJobModel(model);try{model.render();bindScriptCsvJobModel(model,model.result);bindReadout(model);presentation.releaseReplacedResult(model,previous);}catch(error){const attempted=model.result;model.result=previous;try{model.render();bindScriptCsvJobModel(model,previous);bindReadout(model);}catch(rollback){throw new AggregateError([error,rollback],'Script output update and native recovery were incomplete');}finally{presentation.releaseReplacedResult(model,attempted);}throw error;}},
    rename(id:string,title:string){if(typeof title!=='string'||!title.trim()||title.length>200)throw new Error('Invalid script title');const model=models.get(id)?.model;if(!model||model.removed)throw new Error('Unknown script instance');return notifications.transaction(()=>{model.settings.title=title;model.render();bindReadout(model);changed();});},
    style(id:string,plots:Record<string,IndicatorPlotStyle>){validateScriptStyles(plots);const model=models.get(id)?.model;if(!model||model.removed)throw new Error('Unknown script instance');return port.replaceStyles(id,{...model.settings.plots,...plots});},
    replaceStyles(id:string,plots:Record<string,IndicatorPlotStyle>){validateScriptStyles(plots);const model=models.get(id)?.model;if(!model||model.removed)throw new Error('Unknown script instance');return command(()=>{const previous=model.settings.plots;model.settings.plots=structuredClone(plots);try{model.render();bindReadout(model);}catch(error){model.settings.plots=previous;try{model.render();bindReadout(model);}catch(rollback){throw new AggregateError([error,rollback],'Script style replacement and recovery were incomplete');}throw error;}});},
    show(id:string,visible:boolean){const model=models.get(id)?.model;if(!model?.handle)throw new Error('Unknown script instance');return command(()=>{retireTableNativeMetadata(model);model.settings.visible=visible;model.handle!.setVisible(visible);bindReadout(model);});},
    move(id:string,target:Parameters<IndicatorHandle['moveTo']>[0]){const model=models.get(id)?.model;if(!model?.handle)throw new Error('Unknown script instance');return command(()=>{retireTableNativeMetadata(model);model.handle!.moveTo(target);bindReadout(model);changed();});},
    place(id:string,placement:{pane:'price'|'new';paneId?:string|null;ownScale?:boolean}){const entry=models.get(id);if(!entry?.model.handle)throw new Error('Unknown script instance');const model=entry.model,previous=structuredClone(model.settings),next={...previous,...placement};if(!['price','new'].includes(next.pane)||next.paneId!==null&&next.paneId!==undefined&&(typeof next.paneId!=='string'||!next.paneId||next.paneId.length>200)||next.ownScale!==undefined&&typeof next.ownScale!=='boolean')throw new Error('Invalid script placement');return command(()=>{const reconfigure=previous.pane!==next.pane||next.pane==='price'&&previous.ownScale!==next.ownScale;const desired=next.paneId??(next.pane==='price'?'price':`lv-pane-${crypto.randomUUID()}`);retireTableNativeMetadata(model);model.settings=next;pendingPanes.set(id,desired);try{if(reconfigure){removeForRemount(entry);models.set(id,entry);pendingPanes.set(id,desired);mount(entry.type,model);}else if(next.pane==='new'&&next.paneId==null&&previous.paneId!=null)model.handle!.moveTo({newPane:true});bindPending(model);bindScriptCsvJobModel(model,model.result);bindReadout(model);changed();}catch(error){model.settings=previous;pendingPanes.set(id,previous.paneId??(previous.pane==='price'?'price':`lv-pane-${crypto.randomUUID()}`));if(!models.has(id)||!model.handle||!panes.info(model.handle)){models.set(id,entry);mount(entry.type,model);}bindPending(model);bindScriptCsvJobModel(model,model.result);bindReadout(model);throw error;}});},
    remove(id:string){return command(()=>{const entry=models.get(id);if(!entry)return;retireScriptCsvJobModel(entry.model);presentation.dropModel(entry.model,true);try{entry.model.handle?.remove();}finally{entry.release?.();unregisterNativeIndicator(entry.type);}models.delete(id);pendingPanes.delete(id);changed();});},
    dispose(){presentation.dispose();subscribers.clear();inputSubscribers.clear();interactions.clear();try{attemptEveryCleanup([...nativeUnsubscribes,...[...models.keys()].map(id=>()=>port.remove(id))],'Script disposal was incomplete');}finally{for(const {model,release,tableState}of models.values()){tableState.epoch={};tableState.output=null;tableState.native=null;tableState.active=null;tableState.mounted=null;tableState.input=null;tableState.result=null;tableState.expectedPlacement=null;retireScriptCsvJobModel(model);release?.();model.ctx=null;model.removed=true;}models.clear();pendingPanes.clear();}},
  };
  const nativeUnsubscribes=typeof chart.on==='function'?[
   chart.on('indicator:removed',({id})=>{for(const [key,entry]of models)if(entry.model.handle?.id===id){retireScriptCsvJobModel(entry.model);presentation.dropModel(entry.model,!(remounting?.entry===entry&&remounting.model===entry.model&&remounting.handle===entry.model.handle&&remounting.handle.id===id));models.delete(key);pendingPanes.delete(key);entry.release?.();unregisterNativeIndicator(entry.type);external({kind:'removed',id:key});changed();}}),
   chart.on('indicator:visibility',({id,visible})=>{for(const [key,entry]of models)if(entry.model.handle?.id===id){retireTableNativeMetadata(entry.model);entry.model.settings.visible=visible;external({kind:'visibility',id:key,visible});if(models.get(key)===entry)bindReadout(entry.model);changed();}}),
   chart.on('indicator:moved',({id,paneId})=>{for(const [key,entry]of models)if(entry.model.handle?.id===id){retireTableNativeMetadata(entry.model);const settings=entry.model.settings,logical=panes.logical(paneId)!,ownScale=panes.info(entry.model.handle!)?.indicators.find(row=>row.id===id)?.ownScale??false;settings.pane=paneId==='price'?'price':'new';settings.paneId=logical;settings.ownScale=ownScale;external({kind:'moved',id:key,pane:settings.pane,paneId:logical,ownScale});if(models.get(key)===entry)bindReadout(entry.model);changed();}}),
  ]:[];const exposed:Omit<typeof port,'captureReadout'|'presentationMetadata'|'captureTables'|'tableInventory'|'placeTables'|'prepareTableDestination'>&{captureReadout?:(id:string)=>ScriptReadoutSnapshot;presentationMetadata?:()=>readonly ScriptPresentationMetadataRow[];captureTables?:typeof port.captureTables;tableInventory?:typeof port.tableInventory;placeTables?:typeof port.placeTables;prepareTableDestination?:typeof port.prepareTableDestination}=port;return exposed;
 },chart as unknown as object);
}
