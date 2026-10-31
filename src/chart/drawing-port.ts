// OpenCandle drawing types must register before any drawingTypes() snapshot.
import './lv-drawing-types';
import { deserializeDrawing, createDrawing, drawingTypes, type Drawing, type SerializedDrawing, type SettingsField } from '@luxalgo/vela';
import type { Bar } from '../domain/types';
import {measureWorkspaceJSON} from '../ui/workspace-json';
import { supportedColor } from './color-validation';
import {projectNativeDrawingRecord} from './drawing-canonical';
import {assertFibLevelFormatRegistration,nativeFibTrendLineDefaults} from './fib-level-format-native';
import {FIB_LEVEL_FORMAT_FIELD,FIB_LEVEL_FORMAT_DIAGNOSTIC,assertFibLevelFormatPatchValues,readFibLevelFormat} from './fib-level-format';
import {assertFibTrendLinePatchValues,readFibTrendLine} from './fib-trend-line-data';
import {assertFibLevelPresentationPatchValues,readFibBackground,readFibText} from './fib-level-presentation-data';
import {validateFibLevelLabelChange} from './fib-level-text-policy';
import {readTrendlineAnnotation,patchTrendlineAnnotation,TRENDLINE_ANNOTATION_PATH} from './trendline-annotation-data';
import {readTrendlineStats,patchTrendlineStats,readTrendlineMarkers,patchTrendlineMarkers,validateTrendlineMarkers,TRENDLINE_MARKERS_FIELD,type TrendlineStatsSettings,type TrendlineMarkersSettings} from './trendline-stats-data';
import {LINE_MARKER_TYPES,isLineMarkerType} from './trendline-markers-painter';
import {FIB_LAYOUT_FIELD,FIB_LABEL_FONT_SIZES,readFibLayout,patchFibLayoutProps,type FibLayoutSettings} from './fib-level-presentation-data';
import {CHANNEL_LEVELS_FIELD,CHANNEL_LEVEL_ROWS,CHANNEL_LEVEL_RATIO_MIN,CHANNEL_LEVEL_RATIO_MAX,CHANNEL_LEVELS_LEGACY,readChannelLevels,validateChannelLevels,deriveChannelBackground,composeChannelFill,type ChannelLevelsSettings} from './channel-levels-data';
import {BOX_EXTEND_FIELD,readBoxExtend,patchBoxExtend,type BoxExtendSettings} from './box-extend-data';
import {POSITION_INPUTS_FIELD,POSITION_PRECISION_MAX,readPositionInputs,patchPositionInputs,validatePositionInputs,riskDisplayValue,riskPercentFromDisplay,type PositionInputsSettings} from './position-inputs';
import {editorAnchors,validateCoordinatePatch,barNumberToTime,timeToBarNumber,type DrawingCoordinatePatch,type DrawingCoordinateDraft,type DrawingCoordinateContext} from './drawing-coordinates';
import {isPositionDrawing} from '../domain/position-drawing';
export {barNumberToTime,timeToBarNumber} from './drawing-coordinates';
export type {DrawingCoordinateDraft,DrawingCoordinatePatch,DrawingEditorAnchor,DrawingCoordinateContext} from './drawing-coordinates';

export interface DrawingCoordinate {barNumber:number;timeSeconds:number;price:number}
export function assertDrawingRecordUnchanged(expected:string,current:string):void{if(expected!==current)throw new Error('This drawing changed while settings were open. Close and reopen before Apply.');}
function pathValue(target:unknown,path:string):unknown {return path.split('.').reduce((value:any,key)=>value?.[key],target);}
const statsPrefix='props.lvTrendlineStats.';
export const TRENDLINE_STATS_EDITOR_FIELDS:readonly SettingsField[]=Object.freeze([
 ...[['priceRange','Price range'],['percentChange','Percent change'],['barsRange','Bars range'],['dateTimeRange','Date/time range'],['alwaysShow','Always show stats']].map(([key,label])=>Object.freeze({path:statsPrefix+key,label,kind:'boolean' as const,group:'behavior' as const})),
 Object.freeze({path:statsPrefix+'position',label:'Stats position',kind:'select' as const,group:'behavior' as const,options:[{value:'left',label:'Left'},{value:'center',label:'Center'},{value:'right',label:'Right'},{value:'auto',label:'Auto'}]}),
]);
/** A saved above/below position stays valid (it paints as stored); the editor shows it as Center. */
const STATS_POSITION_PATH=statsPrefix+'position';
const editorStatsPosition=(value:unknown)=>value==='above'||value==='below'?'center':value;
const storedStatsPosition=(path:string,value:unknown)=>path===STATS_POSITION_PATH&&(value==='above'||value==='below');
export function isTrendlineStatsPath(path:string):boolean{return TRENDLINE_STATS_EDITOR_FIELDS.some(field=>field.path===path);}
const markersPrefix='props.lvTrendlineMarkers.';
/** Middle point and price labels. Distance and angle sit in the same new member so the closed lvTrendlineStats shape stays untouched. */
export const TRENDLINE_MARKERS_EDITOR_FIELDS:readonly SettingsField[]=Object.freeze([['middlePoint','Middle point','line'],['priceLabels','Price labels','line'],['distance','Distance','behavior'],['angle','Angle','behavior']].map(([key,label,group])=>Object.freeze({path:markersPrefix+key,label,kind:'boolean' as const,group:group as 'line'|'behavior'})));
/** Trendline only; the stats painter shows it for forex pairs. */
export const TRENDLINE_PIPS_FIELD:SettingsField=Object.freeze({path:markersPrefix+'pips',label:'Change in pips',kind:'boolean' as const,group:'behavior' as const});
export function isTrendlineMarkersPath(path:string):boolean{return path===TRENDLINE_PIPS_FIELD.path||TRENDLINE_MARKERS_EDITOR_FIELDS.some(field=>field.path===path);}
/** The trendline-family tools that offer the four marker rows (trendline first); see trendline-markers-painter.ts. */
export {LINE_MARKER_TYPES} from './trendline-markers-painter';
/** On the line tools other than trendline every marker row is painted by the DWB3 shape layer (Distance and Angle
 * included; the trendline statistics painter is trendline only). The adapter sets every shape-layer flag from one installation result,
 * so the layer's own flags stand for it: the dot for Middle point, the price-label text flag for the three text rows. */
const LINE_SHAPE_LAYER_CONSUMERS:Readonly<Record<string,string>>=Object.freeze({middlePoint:'trendline.middlePoint',priceLabels:'trendline.priceLabels',distance:'trendline.priceLabels',angle:'trendline.priceLabels'});
/** Whole-member patch of props.lvTrendlineMarkers on a line tool other than trendline (the same rules as patchTrendlineMarkers). */
function patchLineMarkers(record:SerializedDrawing,next:unknown):SerializedDrawing{
 measureWorkspaceJSON({record});
 if(!isLineMarkerType(record.type)||record.type==='trendline')throw Error('Markers are available only for the trendline tools.');
 const current=readTrendlineMarkers(record.props);if(current.state==='unavailable')throw Error(current.message);
 const settings=validateTrendlineMarkers(next);
 if((['middlePoint','priceLabels','distance','angle'] as const).every(key=>current.settings[key]===settings[key]))return record;
 const result=structuredClone(record);
 result.props={...(result.props??{}),[TRENDLINE_MARKERS_FIELD]:{...settings}};
 return result;
}
// Fib layout rows (props.lvFibLayout). Font sizes are the recorded list exactly (dialog.common.fontSizes.fib), as string options.
const fibLayoutPrefix=FIB_LAYOUT_FIELD+'.';
const ALIGN_H_OPTIONS=[{value:'left',label:'Left'},{value:'center',label:'Center'},{value:'right',label:'Right'}];
const ALIGN_V_OPTIONS=[{value:'top',label:'Top'},{value:'middle',label:'Middle'},{value:'bottom',label:'Bottom'}];
const FIB_LAYOUT_FIELDS:readonly SettingsField[]=Object.freeze([
 Object.freeze({path:fibLayoutPrefix+'fontSize',label:'Font size',kind:'select' as const,group:'text' as const,options:FIB_LABEL_FONT_SIZES.map(size=>({value:String(size),label:String(size)}))}),
 Object.freeze({path:fibLayoutPrefix+'labelHorz',label:'Labels horizontal',kind:'select' as const,group:'text' as const,options:ALIGN_H_OPTIONS}),
 Object.freeze({path:fibLayoutPrefix+'labelVert',label:'Labels vertical',kind:'select' as const,group:'text' as const,options:ALIGN_V_OPTIONS}),
 Object.freeze({path:fibLayoutPrefix+'textHorz',label:'Text horizontal',kind:'select' as const,group:'text' as const,options:ALIGN_H_OPTIONS}),
 Object.freeze({path:fibLayoutPrefix+'textVert',label:'Text vertical',kind:'select' as const,group:'text' as const,options:ALIGN_V_OPTIONS}),
 Object.freeze({path:fibLayoutPrefix+'logScale',label:'Levels based on log scale',kind:'boolean' as const,group:'line' as const}),
]);
export const FIB_LOG_SCALE_UNAVAILABLE_REASON='Available only when the price scale is logarithmic.';
// Parallel channel rows (props.lvChannel).
const channelPrefix='props.'+CHANNEL_LEVELS_FIELD+'.';
const CHANNEL_FIELDS:readonly SettingsField[]=Object.freeze([
 ...Array.from({length:CHANNEL_LEVEL_ROWS},(_,index)=>{const base=`props.lvChannel.levels.${index}.`,n=index+1;return[
  Object.freeze({path:base+'enabled',label:`Level ${n}`,kind:'boolean' as const,group:'line' as const}),
  Object.freeze({path:base+'ratio',label:`Level ${n} ratio`,kind:'number' as const,group:'line' as const,min:CHANNEL_LEVEL_RATIO_MIN,max:CHANNEL_LEVEL_RATIO_MAX,step:0.05}),
  Object.freeze({path:base+'color',label:`Level ${n} color`,kind:'color' as const,group:'line' as const}),
  Object.freeze({path:base+'opacity',label:`Level ${n} opacity`,kind:'number' as const,group:'line' as const,min:0,max:100,step:1}),
  Object.freeze({path:base+'width',label:`Level ${n} thickness`,kind:'number' as const,group:'line' as const,min:1,max:10,step:1}),
  Object.freeze({path:base+'style',label:`Level ${n} style`,kind:'lineStyle' as const,group:'line' as const}),
 ];}).flat(),
 Object.freeze({path:'props.lvChannel.extendLeft',label:'Extend left',kind:'boolean' as const,group:'line' as const}),
 Object.freeze({path:'props.lvChannel.extendRight',label:'Extend right',kind:'boolean' as const,group:'line' as const}),
 Object.freeze({path:'props.lvChannel.background.enabled',label:'Background',kind:'boolean' as const,group:'fill' as const}),
 Object.freeze({path:'props.lvChannel.background.color',label:'Background color',kind:'color' as const,group:'fill' as const}),
 Object.freeze({path:'props.lvChannel.background.opacity',label:'Background opacity',kind:'number' as const,group:'fill' as const,min:0,max:100,step:1}),
]);
// Long and Short position inputs (props.lvPositionInputs).
const positionPrefix='props.'+POSITION_INPUTS_FIELD+'.';
const POSITION_FIELDS:readonly SettingsField[]=Object.freeze([
 Object.freeze({path:'props.lvPositionInputs.lotSize',label:'Lot size',kind:'number' as const,group:'behavior' as const,min:0,max:1e12}),
 Object.freeze({path:'props.lvPositionInputs.leverage',label:'Leverage',kind:'number' as const,group:'behavior' as const,min:0,max:1e12}),
 Object.freeze({path:'props.lvPositionInputs.riskMode',label:'Risk display',kind:'select' as const,group:'behavior' as const,options:[{value:'percentage',label:'Percents'},{value:'money',label:'Money'}]}),
 Object.freeze({path:'props.lvPositionInputs.riskDisplay',label:'Risk',kind:'number' as const,group:'behavior' as const,min:0,max:1e12}),
 Object.freeze({path:'props.lvPositionInputs.precision',label:'Decimal places',kind:'number' as const,group:'behavior' as const,min:0,max:POSITION_PRECISION_MAX,step:1}),
 Object.freeze({path:'props.lvPositionInputs.compactStats',label:'Compact stats',kind:'boolean' as const,group:'behavior' as const}),
 Object.freeze({path:'props.lvPositionInputs.currency',label:'Account currency',kind:'text' as const,group:'behavior' as const}),
]);
// Rectangle Extend (props.lvBoxExtend). Labels are the option titles ("Extend left", "Extend right").
const boxExtendPrefix='props.'+BOX_EXTEND_FIELD+'.';
export const BOX_EXTEND_EDITOR_FIELDS:readonly SettingsField[]=Object.freeze([['left','Extend left'],['right','Extend right']].map(([key,label])=>Object.freeze({path:boxExtendPrefix+key,label,kind:'boolean' as const,group:'line' as const})));
const isPrefixed=(path:string,prefix:string)=>path.startsWith(prefix);

/** A new field is emitted only after the consumer that makes it do something is installed. Every flag starts off, so the dialog field list of
 * each tool is exactly what it was before this wave. Root turns a flag on per field during the adapter wiring. */
export const DRAWING_FIELD_CONSUMER_NAMES:readonly string[]=Object.freeze([
 'trendline.middlePoint','trendline.priceLabels','trendline.distance','trendline.angle',
 'fib.fontSize','fib.labelHorz','fib.labelVert','fib.textHorz','fib.textVert','fib.logScale',
 'channel.levels','channel.extend','channel.background',
 'position.lotSize','position.leverage','position.riskMode','position.precision','position.compactStats','position.currency',
 // The Rectangle extension, painted by the DWB3 shape layer (root turns it on with the other shape-layer flags).
 'box.extend',
 // Trendline Change in pips, painted by the trendline statistics painter.
 'trendline.pips',
]);
const consumers=new Set<string>();
/** Per-chart consumer flags: each chart owns its own set, so one grid cell's layer never turns a field on for a cell whose layer failed.
 * The editor of a chart reads only its own set. Patch validation, which is not chart-bound, accepts a field any live chart (or the module-level switch) has on. */
export interface DrawingFieldConsumerSet {set(name:string,installed?:boolean):void;has(name:string):boolean;names():readonly string[];dispose():void}
const instances=new Set<DrawingFieldConsumerSet>();
export function createDrawingFieldConsumerSet():DrawingFieldConsumerSet{
 const own=new Set<string>();
 const handle:DrawingFieldConsumerSet={
  set(name,installed=true){if(!DRAWING_FIELD_CONSUMER_NAMES.includes(name))throw Error('Unknown drawing field consumer: '+name);if(installed)own.add(name);else own.delete(name);},
  has:name=>own.has(name),names:()=>[...own].sort(),
  dispose(){own.clear();instances.delete(handle);},
 };
 instances.add(handle);return handle;
}
const anyInstalled=(name:string)=>consumers.has(name)||[...instances].some(set=>set.has(name));
export function setDrawingFieldConsumer(name:string,installed=true):void{
 if(!DRAWING_FIELD_CONSUMER_NAMES.includes(name))throw Error('Unknown drawing field consumer: '+name);
 if(installed)consumers.add(name);else consumers.delete(name);
}
export function drawingFieldConsumers():readonly string[]{return [...consumers].sort();}
function consumerOf(path:string,type?:string):string|undefined{
 const last=path.split('.').pop()!;
 if(isPrefixed(path,markersPrefix))return type!==undefined&&type!=='trendline'&&isLineMarkerType(type)?LINE_SHAPE_LAYER_CONSUMERS[last]??'trendline.'+last:'trendline.'+last;
 if(isPrefixed(path,fibLayoutPrefix))return 'fib.'+last;
 if(isPrefixed(path,channelPrefix))return path.includes('.levels.')?'channel.levels':path.includes('.background.')?'channel.background':'channel.extend';
 if(isPrefixed(path,positionPrefix))return 'position.'+(last==='riskDisplay'?'riskMode':last);
 if(isPrefixed(path,boxExtendPrefix))return 'box.extend';
 return undefined;
}
/** Whether a drawing of `type` can ever offer the LV member setting at `path` (the same tool conditions as drawingFields,
 * consumer flags and saved-member state aside). Paths outside the LV members are the renderer's own and answer true. The dialog uses it to
 * tell "this tool has the setting, but not on this chart right now" (shown disabled with a reason) from "this tool has no such setting". */
export function drawingFieldPathPossible(type:string,path:string):boolean{
 if(isPrefixed(path,statsPrefix))return type==='trendline';
 if(path===TRENDLINE_PIPS_FIELD.path)return type==='trendline';
 if(isPrefixed(path,markersPrefix))return LINE_MARKER_TYPES.includes(type);
 if(isPrefixed(path,boxExtendPrefix))return type==='box';
 if(isPrefixed(path,fibLayoutPrefix))return type==='fibretracement';
 if(isPrefixed(path,channelPrefix))return type==='parallelchannel';
 if(isPrefixed(path,positionPrefix))return isPositionDrawing(type);
 return true;
}
const installedOnly=(fields:readonly SettingsField[],own?:DrawingFieldConsumerSet,type?:string):SettingsField[]=>fields.filter(field=>{const name=consumerOf(field.path,type);return name===undefined||(own?own.has(name):anyInstalled(name));});
/** Inspect before JSON preparation can omit an explicit undefined setting. */
export function assertTrendlineStatsPatchValues(patch:Record<string,unknown>):void{
 measureWorkspaceJSON({patch});
 for(const path of Object.keys(patch))if(path.startsWith(statsPrefix)){
  const field=TRENDLINE_STATS_EDITOR_FIELDS.find(field=>field.path===path);
  if(!field)throw Error('Unsupported Trendline statistics property: '+path);
  const value=Object.getOwnPropertyDescriptor(patch,path)!.value;
  // The earlier above/below positions are still accepted (a template or reset carries the stored value).
  if(storedStatsPosition(path,value))continue;
  validateField(field,value);
 }
}
function editorValue(drawing:Drawing,path:string,canonical?:SerializedDrawing):unknown {
 if(drawing.type==='trendline'){
  if(isTrendlineStatsPath(path)){const stats=readTrendlineStats(canonical?.props);if(stats.state==='unavailable')return undefined;const value=stats.settings[path.slice(statsPrefix.length) as keyof TrendlineStatsSettings];return path===STATS_POSITION_PATH?editorStatsPosition(value):value;}
  if(isTrendlineMarkersPath(path)){const markers=readTrendlineMarkers(canonical?.props);return markers.state==='unavailable'?undefined:markers.settings[path.slice(markersPrefix.length) as keyof TrendlineMarkersSettings];}
  if(path===TRENDLINE_ANNOTATION_PATH)return readTrendlineAnnotation(drawing.text).enabled;
  const fallback:Record<string,string>={'text.size':'normal','text.place':'middle','text.side':'above'};
  if(Object.hasOwn(fallback,path))return pathValue(drawing,path)??fallback[path];
 }
 if(drawing.type!=='trendline'&&isLineMarkerType(drawing.type)&&isTrendlineMarkersPath(path)){const markers=readTrendlineMarkers(canonical?.props);return markers.state==='unavailable'?undefined:markers.settings[path.slice(markersPrefix.length) as keyof TrendlineMarkersSettings];}
 if(drawing.type==='fibretracement'&&isPrefixed(path,fibLayoutPrefix)){
  const layout=readFibLayout(canonical?.props);if(layout.state==='unavailable')return undefined;
  const value=layout.settings[path.slice(fibLayoutPrefix.length) as keyof FibLayoutSettings];return path.endsWith('.fontSize')?String(value):value;
 }
 if(drawing.type==='parallelchannel'&&isPrefixed(path,channelPrefix))return channelEditorValue(path,canonical);
 if(drawing.type==='box'&&isPrefixed(path,boxExtendPrefix)){const extend=readBoxExtend(canonical?.props);return extend.state==='unavailable'?undefined:extend.settings[path.slice(boxExtendPrefix.length) as keyof BoxExtendSettings];}
 if(isPositionDrawing(drawing.type)&&isPrefixed(path,positionPrefix)){
  const inputs=readPositionInputs(canonical?.props);if(inputs.state==='unavailable')return undefined;
  if(path.endsWith('.riskDisplay'))return riskDisplayValue(inputs.settings.riskMode,Number(pathValue(drawing,'riskPercent')),Number(pathValue(drawing,'accountBalance')));
  return inputs.settings[path.slice(positionPrefix.length) as keyof PositionInputsSettings];
 }
 return pathValue(drawing,path);
}
/** Effective channel settings for the editor and for edits. A saved channel (no member) reads as legacy, with its background taken from the native fill so the dialog tells the truth. */
function channelSettings(canonical?:SerializedDrawing):Readonly<ChannelLevelsSettings>|undefined{
 const state=readChannelLevels(canonical?.props);if(state.state==='unavailable')return undefined;
 if(state.state==='supported')return state.settings;
 const derived=deriveChannelBackground(canonical?.style?.fillColor);
 return derived?{...CHANNEL_LEVELS_LEGACY,background:derived}:CHANNEL_LEVELS_LEGACY;
}
function channelEditorValue(path:string,canonical?:SerializedDrawing):unknown{
 const settings=channelSettings(canonical);if(!settings)return undefined;
 const parts=path.slice(channelPrefix.length).split('.');
 if(parts[0]==='levels')return (settings.levels[Number(parts[1])] as unknown as Record<string,unknown>|undefined)?.[parts[2]];
 if(parts[0]==='background')return (settings.background as unknown as Record<string,unknown>)[parts[1]];
 return (settings as unknown as Record<string,unknown>)[parts[0]];
}
/** Raw admission before optional undefined properties can disappear in JSON copying.
 * The target-aware Fib length/line check is performed later against its own level.
 */
export function assertDrawingLevelPatchValues(patch:Record<string,unknown>):void{
 measureWorkspaceJSON({patch});
 for(const path of Object.keys(patch))if(path==='levels'||path.startsWith('levels.')){
  if(!/^levels\.(0|[1-9]\d*)\.(ratio|color|enabled|label)$/.test(path))throw Error('Edit individual drawing level properties; bulk or unsupported level settings are unavailable.');
  if(path.endsWith('.label')&&typeof Object.getOwnPropertyDescriptor(patch,path)!.value!=='string')throw Error('Drawing level text must be a string.');
 }
}
function channelMidpoint(record:SerializedDrawing):number{
 const value=(record.anchors[0].price+record.anchors[1].price)/2;
 if(!Number.isFinite(value))throw new Error('Channel midpoint overflow is not representable by this renderer.');return value;
}
function channelOffset(record:SerializedDrawing):number{
 const value=record.anchors[2].price-channelMidpoint(record);
 if(!Number.isFinite(value))throw new Error('Channel price offset overflow.');return value;
}
export function drawingFields(drawing:Drawing,canonical?:SerializedDrawing,own?:DrawingFieldConsumerSet):SettingsField[]{
  // Highlighter thickness lists 8..96 px;
  // the native field stops at 60. Only the upper bound is raised so every saved width stays editable.
  const fields=drawing.schema().fields.map(field=>drawing.type==='highlighter'&&field.path==='style.lineWidth'?{...field,label:'Thickness',max:96}:field);
  const extra:SettingsField[]=[{path:'locked',label:'Locked',kind:'boolean',group:'behavior'},{path:'visible',label:'Visible',kind:'boolean',group:'behavior'}];
  if(drawing.type==='trendline')extra.push({path:'style.arrowLeft',label:'Left arrow',kind:'boolean',group:'line'});
  if(drawing.type==='trendline'&&readTrendlineStats(canonical?.props).state!=='unavailable')extra.push(...TRENDLINE_STATS_EDITOR_FIELDS);
  if(isLineMarkerType(drawing.type)&&readTrendlineMarkers(canonical?.props).state!=='unavailable')extra.push(...installedOnly(TRENDLINE_MARKERS_EDITOR_FIELDS,own,drawing.type));
  if(drawing.type==='trendline'&&readTrendlineMarkers(canonical?.props).state!=='unavailable')extra.push(...installedOnly([TRENDLINE_PIPS_FIELD],own,drawing.type));
  if(drawing.type==='fibretracement'&&readFibLayout(canonical?.props).state!=='unavailable')extra.push(...installedOnly(FIB_LAYOUT_FIELDS,own));
  if(drawing.type==='parallelchannel'&&channelSettings(canonical))extra.push(...installedOnly(CHANNEL_FIELDS,own));
  if(isPositionDrawing(drawing.type)&&readPositionInputs(canonical?.props).state!=='unavailable')extra.push(...installedOnly(POSITION_FIELDS,own));
  if(drawing.type==='box'&&readBoxExtend(canonical?.props).state!=='unavailable')extra.push(...installedOnly(BOX_EXTEND_EDITOR_FIELDS,own));
  if(drawing.type==='trendline'&&readTrendlineAnnotation(drawing.text).state!=='unavailable')extra.push({path:TRENDLINE_ANNOTATION_PATH,label:'Text enabled',kind:'boolean',group:'text'});
  if(['trendline','ray','extendedline','infoline','trendangle'].includes(drawing.type))extra.push({path:'text.place',label:'Text position',kind:'select',group:'text',options:[{value:'start',label:'Start'},{value:'middle',label:'Middle'},{value:'end',label:'End'}]},{path:'text.side',label:'Text side',kind:'select',group:'text',options:[{value:'above',label:'Above'},{value:'below',label:'Below'}]});
  if(drawing.type==='fibretracement')extra.push(
    ...['reverse','showPrices','showRatios','background'].map(path=>({path,label:{reverse:'Reverse',showPrices:'Show prices',showRatios:'Show levels',background:'Background'}[path]!,kind:'boolean' as const,group:(path==='background'?'fill':path==='reverse'?'line':'text') as SettingsField['group']})),
    {path:'labelSide',label:'Number position',kind:'select',group:'text',options:[{value:'left',label:'Left'},{value:'right',label:'Right'}]},
    ...['numbersSize','labelsSize'].map(path=>({path,label:path==='numbersSize'?'Number size':'Custom label size',kind:'select' as const,group:'text' as const,options:['small','normal','large','huge'].map(value=>({value,label:value}))})),
  );
  return [...fields,...extra.filter(field=>!fields.some(existing=>existing.path===field.path))];
}
/** options.priceScaleLog: whether the pane's price scale is logarithmic right now (fib log-scale control, VDD style.12). */
export interface DrawingEditorOptions {readonly priceScaleLog?:boolean;readonly consumers?:DrawingFieldConsumerSet}
export function drawingEditor(record:SerializedDrawing,bars:readonly Bar[],context?:DrawingCoordinateContext,options?:DrawingEditorOptions){
  measureWorkspaceJSON({record});validateRetainedFibLevels(record);const drawing=deserializeDrawing(record);if(!drawing)throw new Error(`No property editor for drawing type ${record.type}`);
  validateRetainedFibLevels(record);const scaleLog=options?.priceScaleLog===true;const fields=drawingFields(drawing,record,options?.consumers).filter(field=>scaleLog||field.path!==fibLayoutPrefix+'logScale'),levels=drawing.editableLevels()?.map((level,index)=>({...level,label:level.label??'',labelPresent:Array.isArray(record.props?.levels)&&Object.hasOwn(record.props!.levels[index],'label')}))??null;
  const values=Object.fromEntries(fields.map(field=>[field.path,editorValue(drawing,field.path,record)]));for(const [index,level]of (levels??[]).entries())for(const key of ['ratio','color','enabled','label'] as const)values[`levels.${index}.${key}`]=level[key];
  const annotation=record.type==='trendline'?readTrendlineAnnotation(record.text):undefined;
  const stats=record.type==='trendline'?readTrendlineStats(record.props):undefined;
  const fibFormat=record.type==='fibretracement'?readFibLevelFormat(record.props):undefined;
  const fibTrendLine=record.type==='fibretracement'?readFibTrendLine(record.props,nativeFibTrendLineDefaults()):undefined;
  const fibBackground=record.type==='fibretracement'?readFibBackground(record.props):undefined;
  const fibText=record.type==='fibretracement'?readFibText(record.props):undefined;
  const boxExtend=record.type==='box'?readBoxExtend(record.props):undefined;
  return {id:record.id,type:record.type,paneId:record.paneId,fields,values,
    anchors:editorAnchors(record,bars,context),canonicalAnchors:structuredClone(record.anchors),
    anchorSchema:drawing.anchorSchema(),levels,showOn:record.showOn,
    ...(annotation?.state==='unavailable'?{annotationDiagnostic:annotation.message}:{}),
    ...(stats?.state==='unavailable'?{statsDiagnostic:stats.message}:{}),
    ...(fibFormat?.state==='unavailable'?{fibFormatDiagnostic:fibFormat.message}:{}),
    ...(fibTrendLine?{fibTrendLine}:{}),
    ...(fibTrendLine?.state==='unavailable'?{fibTrendLineDiagnostic:fibTrendLine.message}:{}),
    ...(fibBackground?.state==='unavailable'?{fibBackgroundDiagnostic:fibBackground.message}:{}),
    ...(fibText?.state==='unavailable'?{fibTextDiagnostic:fibText.message}:{}),
    ...(boxExtend?.state==='unavailable'?{boxExtendDiagnostic:boxExtend.message}:{}),
    ...(record.type==='fibretracement'?{fibLogScale:options?.priceScaleLog===true?{enabled:true as const}:{enabled:false as const,reason:FIB_LOG_SCALE_UNAVAILABLE_REASON}}:{}),
    ...(record.type==='parallelchannel'&&record.anchors.length>=3?{priceOffset:channelOffset(record)}:{}),
  };
}
function validateField(field:SettingsField,value:unknown){
  if(field.kind==='number'||field.kind==='opacity'){
    if(typeof value!=='number'||!Number.isFinite(value)||field.min!==undefined&&value<field.min||field.max!==undefined&&value>field.max)throw new Error(`Invalid value for ${field.label}`);
  }else if(field.kind==='boolean'&&typeof value!=='boolean')throw new Error(`Invalid boolean for ${field.label}`);
  else if(['color','text','select','lineStyle'].includes(field.kind)&&typeof value!=='string')throw new Error(`Invalid text value for ${field.label}`);
  if(field.options&&!field.options.some(option=>option.value===value))throw new Error(`Unsupported option for ${field.label}`);
  if(field.kind==='color'&&!supportedColor(value))throw new Error(`Unsupported color for ${field.label}`);
  if(field.kind==='lineStyle'&&!['solid','dashed','dotted'].includes(String(value)))throw new Error(`Unsupported line style for ${field.label}`);
  if(field.kind==='text'&&typeof value==='string'&&value.length>20000)throw new Error(`Text exceeds the OpenCandle 20000-character limit for ${field.label}`);
}
export function drawingFieldApplicable(field:SettingsField,values:Record<string,unknown>):boolean{return !field.when||field.when.in.some(value=>value===values[field.when!.path]);}
function validateRetainedFibLevels(record:SerializedDrawing){
 if(record.type!=='fibretracement')return;assertFibLevelFormatRegistration();const props=record.props;
 if(props!==undefined&&(!props||typeof props!=='object'||Array.isArray(props)))throw Error('Fib props require a plain retained record');
 for(const key of ['reverse','showPrices','showRatios','background'])if(props?.[key]!==undefined&&typeof props[key]!=='boolean')throw Error('Retained Fib '+key+' must be boolean');
 if(props?.labelSide!==undefined&&!['left','right'].includes(String(props.labelSide)))throw Error('Retained Fib label side is unavailable');
 for(const key of ['numbersSize','labelsSize'])if(props?.[key]!==undefined&&!['small','normal','large','huge'].includes(String(props[key])))throw Error('Retained Fib named font size is unavailable');
 const levels=props?.levels;if(levels===undefined)return;if(!Array.isArray(levels)||!levels.length||levels.length>2048)throw Error('Fib levels require bounded ordinal slots');
 for(const level of levels){if(!level||typeof level!=='object'||typeof level.ratio!=='number'||!Number.isFinite(level.ratio)||!supportedColor(level.color)||level.enabled!==undefined&&typeof level.enabled!=='boolean'||level.label!==undefined&&(typeof level.label!=='string'||level.label.length>20000))throw Error('Every retained Fib level requires a finite ratio, supported color and valid enabled/label values');}
}
/** Only deliberate coordinate edits may override geometry changed by a style/settings setter. */
export function changedDrawingCoordinates(record:SerializedDrawing,bars:readonly Bar[],coordinates:readonly DrawingCoordinatePatch[],context?:DrawingCoordinateContext){
 measureWorkspaceJSON({record,coordinates});validateRetainedFibLevels(record);if(coordinates.length!==record.anchors.length)throw new Error('Coordinate count must match this tool anchors');
 return coordinates.map((input,index)=>{validateCoordinatePatch(record.type,index,input);if(context?.timeCoordinatesAvailable===false&&('barNumber' in input||'timeSeconds' in input))throw Error(context.diagnostic??'Time coordinates are unavailable for this display topology.');const original=record.anchors[index],next:DrawingCoordinatePatch={};
  if(input.price!==undefined&&input.price!==original.price)next.price=input.price;
  if(input.barNumber!==undefined&&input.barNumber!==timeToBarNumber(bars,original.time/1000))next.barNumber=input.barNumber;
  else if(input.timeSeconds!==undefined&&input.timeSeconds!==original.time/1000)next.timeSeconds=input.timeSeconds;
  return next;
 });
}
export function drawingDraftChanges(original:ReturnType<typeof drawingEditor>,values:Record<string,unknown>,anchors:readonly DrawingCoordinateDraft[],offset?:number){
 const properties=Object.fromEntries(Object.entries(values).filter(([path,value])=>JSON.stringify(value)!==JSON.stringify(original.values[path])));
 if(anchors.length!==original.anchors.length)throw Error('Coordinate count must match this tool anchors');
 const coordinates=anchors.map((input,index)=>{const before=original.anchors[index],next:DrawingCoordinatePatch={};if(input.price!==undefined&&input.price!==before.price){if(!before.editablePrice)throw Error('Unsupported coordinate price axis');next.price=input.price;}if(input.barNumber!==undefined&&input.barNumber!==before.barNumber){if(!before.editableTime||input.barNumber===null)throw Error('Time coordinate is unavailable');next.barNumber=input.barNumber;}else if(input.timeSeconds!==undefined&&input.timeSeconds!==before.timeSeconds){if(!before.editableTime)throw Error('Time coordinate is unavailable');next.timeSeconds=input.timeSeconds;}return next;});
 return {properties,coordinates:coordinates.some(input=>Object.keys(input).length)?coordinates:undefined,priceOffset:offset!==original.priceOffset?offset:undefined};
}
export function patchDrawingProperties(record:SerializedDrawing,patch:Record<string,unknown>):SerializedDrawing{
  measureWorkspaceJSON({record});validateRetainedFibLevels(record);const drawing=deserializeDrawing(record);if(!drawing)throw new Error(`Unsupported drawing editor: ${record.type}`);
  validateRetainedFibLevels(record);const fields=drawingFields(drawing,record);
  assertTrendlineStatsPatchValues(patch);
  assertFibLevelFormatPatchValues(patch);
  assertFibTrendLinePatchValues(patch);
  assertFibLevelPresentationPatchValues(patch);
  if(record.type==='fibretracement')assertDrawingLevelPatchValues(patch);
  if(Object.hasOwn(patch,FIB_LEVEL_FORMAT_FIELD)&&record.type==='fibretracement'&&readFibLevelFormat(record.props).state==='unavailable')throw Error(FIB_LEVEL_FORMAT_DIAGNOSTIC);
  const validatedPatch=Object.fromEntries(Object.entries(patch).filter(([,value])=>value!==undefined));
  for(const [path,value] of Object.entries(validatedPatch)){
    const field=fields.find(candidate=>candidate.path===path);
    if(field){if(!storedStatsPosition(path,value))validateField(field,value);}
    else if(/^levels\.\d+\.(ratio|color|enabled|label)$/.test(path)){
      const [,index,property]=path.split('.');const levels=drawing.editableLevels();if(!levels?.[Number(index)])throw new Error('Unknown drawing level');
      if(property==='ratio'&&(typeof value!=='number'||!Number.isFinite(value)))throw new Error('Level ratio must be finite');
      if(property==='enabled'&&typeof value!=='boolean')throw new Error('Level enable must be boolean');
      if((property==='color'||property==='label')&&typeof value!=='string')throw new Error('Level color/label must be text');
      if(property==='color'&&!supportedColor(value))throw new Error('Unsupported drawing level color');
      if(property==='label'&&typeof value==='string'&&value.length>20000)throw new Error('Drawing level label exceeds the OpenCandle 20000-character limit');
      if(property==='label'&&record.type==='fibretracement')validateFibLevelLabelChange(levels[Number(index)].label,value);
    }else throw new Error(`Property is not supported by this tool: ${path}`);
  }
  const effectivePatch=Object.fromEntries(Object.entries(validatedPatch).filter(([path,value])=>JSON.stringify(value)!==JSON.stringify(editorValue(drawing,path,record)??(path.endsWith('.label')?'':undefined))));
  if(!Object.keys(effectivePatch).length)return record;
  let canonical=record;const statsEntries=Object.entries(effectivePatch).filter(([path])=>isTrendlineStatsPath(path));
  if(statsEntries.length){const stats=readTrendlineStats(record.props);if(stats.state==='unavailable')throw Error(stats.message);canonical=patchTrendlineStats(record,{...stats.settings,...Object.fromEntries(statsEntries.map(([path,value])=>[path.slice(statsPrefix.length),value]))});for(const[path]of statsEntries)delete effectivePatch[path];}
  // DWB3 members. Each is a whole-member patch of canonical data; the pinned native model never sees them.
  const markerEntries=Object.entries(effectivePatch).filter(([path])=>isTrendlineMarkersPath(path));
  if(markerEntries.length){const markers=readTrendlineMarkers(canonical.props);if(markers.state==='unavailable')throw Error(markers.message);canonical=(canonical.type==='trendline'?patchTrendlineMarkers:patchLineMarkers)(canonical,{...markers.settings,...Object.fromEntries(markerEntries.map(([path,value])=>[path.slice(markersPrefix.length),value]))});for(const[path]of markerEntries)delete effectivePatch[path];}
  const layoutEntries=Object.entries(effectivePatch).filter(([path])=>isPrefixed(path,fibLayoutPrefix));
  if(layoutEntries.length){
   const changes=Object.fromEntries(layoutEntries.map(([path,value])=>{const key=path.slice(fibLayoutPrefix.length);return[key,key==='fontSize'?Number(value):value];}));
   const props=patchFibLayoutProps(canonical.props,changes);
   if(props!==canonical.props){canonical=structuredClone(canonical);canonical.props=props as Record<string,unknown>;}
   for(const[path]of layoutEntries)delete effectivePatch[path];
  }
  const boxEntries=Object.entries(effectivePatch).filter(([path])=>isPrefixed(path,boxExtendPrefix));
  if(boxEntries.length){const extend=readBoxExtend(canonical.props);if(extend.state==='unavailable')throw Error(extend.message);canonical=patchBoxExtend(canonical,{...extend.settings,...Object.fromEntries(boxEntries.map(([path,value])=>[path.slice(boxExtendPrefix.length),value]))});for(const[path]of boxEntries)delete effectivePatch[path];}
  const channelEntries=Object.entries(effectivePatch).filter(([path])=>isPrefixed(path,channelPrefix));
  if(record.type==='parallelchannel'){
   const writeChannel=(base:SerializedDrawing,settings:unknown)=>{const next=structuredClone(base);next.props={...(next.props??{}),[CHANNEL_LEVELS_FIELD]:structuredClone(settings)};return next;};
   if(channelEntries.length){
    const settings=channelSettings(canonical);if(!settings)throw Error('Unknown or invalid channel settings are retained without interpretation.');
    const draft=JSON.parse(JSON.stringify(settings));
    for(const[path,value]of channelEntries){const parts=path.slice(channelPrefix.length).split('.');if(parts[0]==='levels')draft.levels[Number(parts[1])][parts[2]]=value;else if(parts[0]==='background')draft.background[parts[1]]=value;else draft[parts[0]]=value;}
    const valid=validateChannelLevels(draft);
    const backgroundTouched=channelEntries.some(([path])=>isPrefixed(path,channelPrefix+'background.'));
    canonical=writeChannel(canonical,valid);
    // The native fill is rewritten only when a background field changed; a level or extend edit leaves it byte identical, in any color format.
    if(backgroundTouched)effectivePatch['style.fillColor']=composeChannelFill(valid.background);
    for(const[path]of channelEntries)delete effectivePatch[path];
   }else if(Object.hasOwn(effectivePatch,'style.fillColor')){
    const state=readChannelLevels(canonical.props);
    if(state.state==='supported'){
     const derived=deriveChannelBackground(effectivePatch['style.fillColor']);
     if(!derived)throw Error('Unsupported channel background color.');
     canonical=writeChannel(canonical,{...JSON.parse(JSON.stringify(state.settings)),background:{...derived}});
    }
   }
  }
  const positionEntries=Object.entries(effectivePatch).filter(([path])=>isPrefixed(path,positionPrefix));
  if(positionEntries.length){
   const inputs=readPositionInputs(canonical.props);if(inputs.state==='unavailable')throw Error(inputs.message);
   const changes=Object.fromEntries(positionEntries.filter(([path])=>!path.endsWith('.riskDisplay')).map(([path,value])=>[path.slice(positionPrefix.length),value]));
   const next=validatePositionInputs({...inputs.settings,...changes}),risk=positionEntries.find(([path])=>path.endsWith('.riskDisplay'));
   if(risk){
    const account=Number(Object.hasOwn(effectivePatch,'accountBalance')?effectivePatch.accountBalance:pathValue(drawing,'accountBalance')),percent=riskPercentFromDisplay(next.riskMode,Number(risk[1]),account);
    if(!Number.isFinite(percent)||percent<0||percent>100)throw Error('Risk is outside the allowed range for this account size.');
    effectivePatch.riskPercent=percent;
   }
   canonical=patchPositionInputs(canonical,next);
   // The LV position model serializes the member itself, so a native edit in the same Apply must start from the patched member.
   if(canonical.props)drawing.applyProps(canonical.props as Record<string,unknown>);
   for(const[path]of positionEntries)delete effectivePatch[path];
  }
  if(!Object.keys(effectivePatch).length)return canonical;
  if(Object.hasOwn(effectivePatch,TRENDLINE_ANNOTATION_PATH)){drawing.text=structuredClone(patchTrendlineAnnotation(record,effectivePatch[TRENDLINE_ANNOTATION_PATH]).text);delete effectivePatch[TRENDLINE_ANNOTATION_PATH];}
  if(Object.keys(effectivePatch).some(path=>path.startsWith('text.'))&&!drawing.text)drawing.text={value:'',size:'normal',hAlign:'center',vAlign:'center'};
  if(Object.keys(effectivePatch).length)drawing.applySettings(effectivePatch);const result=drawing.serialize();if(result.anchors.some(anchor=>!Number.isFinite(anchor.price)||!Number.isFinite(new Date(anchor.time).getTime())))throw new Error('Drawing settings produced invalid or overflowing coordinates');
  for(const field of fields)if(['number','opacity'].includes(field.kind)){const value=pathValue(drawing,field.path);if(value!==undefined)validateField(field,value);}
  if(drawing.type==='fibretracement'){const range=drawing.priceRange();if(range&&(!Number.isFinite(range.min)||!Number.isFinite(range.max)))throw Error('Fib level geometry overflow');}
  return projectNativeDrawingRecord(canonical as unknown as Record<string,unknown>,result as unknown as Record<string,unknown>) as unknown as SerializedDrawing;
}
export function patchDrawingCoordinates(record:SerializedDrawing,bars:readonly Bar[],coordinates:readonly DrawingCoordinatePatch[],priceOffset?:number,context?:DrawingCoordinateContext):SerializedDrawing{
  measureWorkspaceJSON({coordinates});if(coordinates.length!==record.anchors.length)throw new Error('Coordinate count must match this tool anchors');
  const changes=changedDrawingCoordinates(record,bars,coordinates,context);if(!changes.some(row=>Object.keys(row).length)&&(priceOffset===undefined||record.type==='parallelchannel'&&priceOffset===channelOffset(record)))return record;
  const next=structuredClone(record);
  next.anchors=record.anchors.map((anchor,index)=>{
    const input=changes[index],price=input.price??anchor.price;if(!Number.isFinite(price))throw new Error('Coordinate price must be finite');
    const seconds=input.barNumber!==undefined?barNumberToTime(bars,input.barNumber):input.timeSeconds??anchor.time/1000;if(!Number.isFinite(seconds)||!Number.isFinite(new Date(seconds*1000).getTime()))throw new Error('Coordinate time must be finite and representable');
    return {...structuredClone(anchor),time:seconds*1000,price};
  });
  if(priceOffset!==undefined&&(record.type!=='parallelchannel'||next.anchors.length<3||!Number.isFinite(priceOffset)))throw new Error('Price offset is specific to parallel channel');
  if(record.type==='parallelchannel'&&next.anchors.length>=3){if(Object.keys(changes[2]).length)throw new Error('Edit channel level 1 with price offset, not a third coordinate');const offset=priceOffset??channelOffset(record);next.anchors[2]={...record.anchors[2],time:record.anchors[2].time,price:channelMidpoint(next)+offset};if(!Number.isFinite(next.anchors[2].price)||!Number.isFinite(next.anchors[0].price+offset)||!Number.isFinite(next.anchors[1].price+offset))throw new Error('Channel price offset overflow');}
  if(record.type==='arc'&&next.anchors.length===3&&changes.slice(0,2).some(row=>Object.keys(row).length)){next.anchors[2].time=next.anchors[0].time/2+next.anchors[1].time/2;}
  if(isPositionDrawing(record.type)&&next.anchors.length===3){const changed=changes.map((input,index)=>input.price!==undefined?index:-1).filter(index=>index>=0);if(changed.length===1){const drawing=deserializeDrawing(next)!;drawing.constrainHandleDrag(changed[0]);next.anchors=drawing.serialize().anchors.map((anchor,index)=>({...record.anchors[index],...anchor}));}else if(changed.length>1&&Math.sign(next.anchors[1].price-next.anchors[0].price)*Math.sign(next.anchors[2].price-next.anchors[0].price)>0)throw new Error('Stop and target must be on opposite sides of entry; simultaneous conflicting edits are unavailable');}
  if(next.anchors.some(anchor=>!Number.isFinite(anchor.price)||!Number.isFinite(anchor.time)))throw new Error('Drawing coordinate transformation overflow');
  if(next.type==='fibretracement'){const range=deserializeDrawing(next)!.priceRange();if(range&&(!Number.isFinite(range.min)||!Number.isFinite(range.max)))throw Error('Fib level geometry overflow');}
  return next;
}
export function patchDrawingEdit(record:SerializedDrawing,bars:readonly Bar[],patch:Record<string,unknown>,coordinates?:readonly DrawingCoordinatePatch[],priceOffset?:number,context?:DrawingCoordinateContext){
 const changes=coordinates?changedDrawingCoordinates(record,bars,coordinates,context):undefined;
 if(isPositionDrawing(record.type)&&changes?.some(input=>input.price!==undefined)&&Object.keys(patch).some(path=>['direction','entryPrice','stopPrice','targetPrice'].includes(path)&&patch[path]!==undefined))throw new Error('Edit position price settings or price coordinates in one Apply, not both');
 let next=patchDrawingProperties(record,patch);if(changes||priceOffset!==undefined)next=patchDrawingCoordinates(next,bars,changes??next.anchors.map(()=>({})),priceOffset,context);return next;
}
export function drawingCatalog(){return drawingTypes().map(meta=>{const drawing=createDrawing(meta.type,{paneId:'price'});return {type:meta.type,label:meta.label,group:meta.group,anchorSchema:drawing?.anchorSchema(),fields:drawing?drawingFields(drawing):[],referenceCompared:false};});}
