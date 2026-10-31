import {validateSeasonalityCatalogInputs} from '../domain/indicators-ext/seasonality-catalog';
import {validateTradingSessionInputs} from '../domain/indicators-ext/trading-sessions-catalog';
import type {InputSchema,InputValue,LineLikeKind,LineStyle} from '@luxalgo/vela';
import {RSI_MA_NAME,indicatorActivePlotIds,indicatorCalculationWork,indicatorVwapBandSettings,indicatorVwapKernelVersion,VWAP_BAND_DEFAULTS,VOLUME_MA_TYPES,indicatorVolumeMaType,type IndicatorId,type IndicatorInputs} from '../domain/indicators';
export {VWAP_BAND_INPUT_KEYS,indicatorVwapBandSettings,VWAP_KERNEL_INPUT_KEY,indicatorVwapKernelVersion,VOLUME_MA_TYPES,indicatorVolumeMaType,type VolumeMaType} from '../domain/indicators';
import {supportedColor} from './color-validation';
import {VWAP_BAND_MODES} from '../domain/vwap-stdev-bands';
import {RSI_DIVERGENCE_INPUTS,RSI_DIVERGENCE_CREATION_INPUTS,rsiDivergenceSettings} from '../domain/rsi-divergence';
import {parseIndicatorSource,validateIndicatorSourceGraph,INDICATOR_SOURCE_KINDS} from '../domain/indicator-source';
import {CATALOG_INDICATORS,ALL_CATALOG_INDICATOR_IDS,catalogDefinition,catalogInputValue,catalogInputField,catalogStoredBounds,migrateCatalogInputs} from '../domain/indicator-catalog';
import {validateIndicatorIntervalVisibility,type IndicatorIntervalVisibility} from './indicator-visibility';
import {validateIndicatorTimeframe,type IndicatorTimeframe} from './indicator-timeframe';
export type {IndicatorTimeframe} from './indicator-timeframe';

/** The original ten built-ins (historical name, kept for persisted contracts and existing callers). */
export const DOMAIN_INDICATORS:readonly IndicatorId[]=['volume','sma','ema','rsi','macd','bb','vwap','stochastic','atr','obv'];
/** Every LV built-in: the original ten plus the extended catalog (src/domain/indicator-catalog.ts). */
export const INDICATOR_KINDS:readonly IndicatorId[]=[...DOMAIN_INDICATORS,...ALL_CATALOG_INDICATOR_IDS];
export const INDICATOR_MAX_OFFSET=100000;
/**
 * Kinds with a display offset input (integer, default 0, -500..500).
 * For sma, ema and bb the input comes from older descriptors; equality with the current built-in is inferred, not live-verified.
 */
export const INDICATOR_OFFSET_FACT_KINDS:readonly IndicatorId[]=['sma','ema','bb','wma'];
export const INDICATOR_OFFSET_FACT_RANGE=Object.freeze({min:-500,max:500});
/** Display offset accepted from an edit; stored offsets keep the shared range so older workspaces load. */
export function indicatorOffsetBounds(kind:IndicatorId):{min:number;max:number}{return INDICATOR_OFFSET_FACT_KINDS.includes(kind)?{...INDICATOR_OFFSET_FACT_RANGE}:{min:-INDICATOR_MAX_OFFSET,max:INDICATOR_MAX_OFFSET};}
/** True when a stored offset lies outside the fact range of its kind (it still loads; the dialog model flags it). Kinds without a fact are never flagged. */
export function indicatorOffsetOutOfReference(kind:IndicatorId,offset:number):boolean{return INDICATOR_OFFSET_FACT_KINDS.includes(kind)&&Number.isFinite(offset)&&(offset<INDICATOR_OFFSET_FACT_RANGE.min||offset>INDICATOR_OFFSET_FACT_RANGE.max);}
export function assertIndicatorEditOffset(kind:IndicatorId,offset:unknown):void{const {min,max}=indicatorOffsetBounds(kind);if(!Number.isSafeInteger(offset)||(offset as number)<min||(offset as number)>max)throw new Error(`Offset must be an integer from ${min} through ${max} bars.`);}
export const INDICATOR_MAX_INSTANCES=1000;
export const INDICATOR_WORK_LIMIT=20000000;
export const INDICATOR_OUTPUT_LIMIT=2000000;
export const SMOOTHING_INDICATORS:readonly IndicatorId[]=['sma','ema','rsi','obv'];
export const SMOOTHING_INPUT_KEYS=['smoothingType','smoothingLength','smoothingMultiplier'] as const;
/** BullStart/bullEnd and bearStart/bearEnd bound the RSI bull and bear zones. */
export type IndicatorGuideId='upper'|'middle'|'lower'|'zero'|'bullStart'|'bullEnd'|'bearStart'|'bearEnd';
/** 'bearish': the second background of a two-color band (Ichimoku cloud). */
/** 'vpUp' .. 'vpValueDown': the histogram row colors of the profile kinds (outside and inside the value area). */
export type IndicatorFillId='band'|'smoothing'|'band1'|'band2'|'band3'|'bearish'|'bullZone'|'bearZone'|VpFillId;
/** Each zone fill and the two guides that bound it. */
export const RSI_ZONE_GUIDES:Readonly<Record<'bullZone'|'bearZone',readonly [IndicatorGuideId,IndicatorGuideId]>>=Object.freeze({bullZone:['bullStart','bullEnd'],bearZone:['bearStart','bearEnd']});
/** RSI zone defaults: the owner's RSI levels (bull 65 to 80, bear 35 to 20); LV colors (candle jade and coral). */
export const RSI_ZONE_DEFAULTS=Object.freeze({bullStart:65,bullEnd:80,bearStart:35,bearEnd:20});
/** Style tab names of the guides (the original ids keep their historical wording). */
export function indicatorGuideLabel(id:IndicatorGuideId):string{return ({bullStart:'Bull zone start',bullEnd:'Bull zone end',bearStart:'Bear zone start',bearEnd:'Bear zone end'} as Record<string,string>)[id]??id+' guide';}
export const VP_FILL_IDS=['vpUp','vpDown','vpValueUp','vpValueDown'] as const;
export type VpFillId=typeof VP_FILL_IDS[number];
/** Volume profile defaults: #2962ff up and #fbc02d down with transparencies 75 outside
 *  and 30 inside the value area (unverified). The same values the profile drew before they became editable. */
export const VP_FILL_DEFAULTS:Readonly<Record<VpFillId,IndicatorFillStyle>>=Object.freeze({vpUp:{visible:true,color:'#2962ff',opacity:25},vpDown:{visible:true,color:'#fbc02d',opacity:25},vpValueUp:{visible:true,color:'#2962ff',opacity:70},vpValueDown:{visible:true,color:'#fbc02d',opacity:70}});
export const isVpFillId=(id:string):id is VpFillId=>(VP_FILL_IDS as readonly string[]).includes(id);
/** LV indicator palette (OpenCandle's own indicator default colors, not a reference's).
 *  Ten hues tuned for the LV Medium Dark chart (#232734); each line color reads at 4.5:1 or better on it and stays
 *  legible on LV Dark. Used only where no cited catalog fact gives a color; user-set and saved colors are never rewritten. */
export const LV_INDICATOR_PALETTE=Object.freeze(['#4fc3d9','#f5b14c','#b48cf2','#f07a7a','#7fd17a','#6e9cf2','#e88ad8','#d9cf6a','#4fbfa3','#c9a27e'] as const);
/** LV momentum histogram and divergence colors: the LV candle jade and coral with their pale companions. */
export const LV_HISTOGRAM_COLORS=Object.freeze({up:'#3fbf8f',upPale:'#a6dfc6',downPale:'#f4b9b4',down:'#e8605a'});
/** LV default guide (level line) color and the RSI band fill. */
export const LV_GUIDE_COLOR='#8a92a6',LV_RSI_FILL='#b48cf2';
/** The Style tab legend of a background. */
export function indicatorFillLabel(kind:IndicatorId,id:IndicatorFillId):string{
 if(isVpFillId(id))return {vpUp:'Up volume',vpDown:'Down volume',vpValueUp:'Value area up',vpValueDown:'Value area down'}[id];
 if(id==='bullZone')return 'Bull zone fill';if(id==='bearZone')return 'Bear zone fill';
 return id==='smoothing'?'Smoothing Bollinger fill':/^band[123]$/.test(id)?'Band '+id.at(-1)+' fill':id==='bearish'?'Bearish fill':indicatorFillIds(kind).includes('bearish')?'Bullish fill':'Band fill';
}
export interface IndicatorGuideStyle {visible:boolean;value:number;color:string;width:number;lineStyle:LineStyle}
export interface IndicatorFillStyle {visible:boolean;color:string;opacity:number}
export interface IndicatorHistogramPalette {nonnegativeRising:string;nonnegativeFalling:string;negativeRising:string;negativeFalling:string}
/** The RSI-based MA (smoothing line) colored by direction: rising where the MA is above its previous value, falling otherwise. */
export interface IndicatorMaPalette {rising:string;falling:string}
export interface IndicatorVolumePalette {schemaVersion:1;mode:'uniform'|'open-close'|'previous-close'|'rising-falling';upColor:string;downColor:string;upRisingColor?:string;upFallingColor?:string;downRisingColor?:string;downFallingColor?:string}
export const VOLUME_FOUR_WAY_DEFAULTS={upRisingColor:'#2fbf9b',upFallingColor:'#8fd9c3',downRisingColor:'#e8566a',downFallingColor:'#f2a7b1'} as const;
export type {IndicatorPrecision} from './indicator-number-format';
import {isIndicatorPrecision,type IndicatorPrecision} from './indicator-number-format';
export interface IndicatorPresentation {schemaVersion:1;precision:IndicatorPrecision;guides:Partial<Record<IndicatorGuideId,IndicatorGuideStyle>>;fills:Partial<Record<IndicatorFillId,IndicatorFillStyle>>;histogramPalette?:IndicatorHistogramPalette;hideOnDaily?:boolean;visibility?:IndicatorIntervalVisibility;volumePalette?:IndicatorVolumePalette;timeframe?:IndicatorTimeframe;
 /** The edited per-bar state colors of a catalog pointPalette (Woodies CCI, Chop zone), one per state in the
  * definition's order. Absent: the definition colors. */
 pointPalette?:readonly string[];
 /** RSI only. Present on new RSIs (seeded at creation); absent = the smoothing plot's single Style color (every RSI saved before the two-color MA). */
 maPalette?:IndicatorMaPalette}
export interface IndicatorPlotStyle {visible:boolean;color:string;width:number;lineStyle:LineStyle;kind:LineLikeKind;priceScale:boolean;legend:boolean;dataWindow:boolean;opacity?:number;trackPrice?:boolean}
export interface IndicatorInstanceSettings {id:string;kind:IndicatorId;inputs:IndicatorInputs;plots:Record<string,IndicatorPlotStyle>;offset:number;visible:boolean;presentation?:IndicatorPresentation}
/** ownScale is present only when the user pinned the scale (true = own scale column, false = shared pane scale). */
export interface IndicatorSnapshot extends IndicatorInstanceSettings {paneId:string|null;ownScale?:boolean;
 /** Present only when pinned to a left scale or no scale (ownScale is then true). */
 scalePlacement?:'left'|'none';
 /** Present only when the pin shares an extra (right or left) scale with other indicators on its pane; the
  * members of one shared scale carry the same id. Absent = the indicator's own scale (every saved workspace before shared scales). */
 scaleGroup?:string}
/** Stochastic NEW instances default smoothK 1 (14/1/3); saved ones keep the legacy 3 below. */
/** Persisted historical contract: new defaults must not change old required alert inputs. */
export const indicatorLegacyDefaults:Record<IndicatorId,Record<string,InputValue>>={volume:{length:20},sma:{length:9,source:'close'},ema:{length:9,source:'close'},rsi:{length:14,source:'close'},macd:{fast:12,slow:26,signal:9,source:'close',oscillatorType:'EMA',signalType:'EMA'},bb:{length:20,multiplier:2,basisType:'SMA',source:'close'},vwap:{anchor:'Session',timezone:'UTC',source:'hlc3'},stochastic:{length:14,smoothK:3,smoothD:3},atr:{length:14,smoothing:'RMA'},obv:{},...Object.fromEntries(CATALOG_INDICATORS.map(definition=>[definition.id,Object.fromEntries(definition.inputs.filter(input=>!input.legacyOmit).map(input=>[input.key,input.legacyDefval??input.defval]))]))} as unknown as Record<IndicatorId,Record<string,InputValue>>;
export const indicatorLegacyInputKeys:Record<IndicatorId,readonly string[]>=Object.fromEntries(INDICATOR_KINDS.map(kind=>[kind,Object.keys(indicatorLegacyDefaults[kind])])) as unknown as Record<IndicatorId,readonly string[]>;
/** Catalog inputs whose new-instance default differs from the saved-instance base (legacyOmit / legacyDefval). */
const CATALOG_NEW_DEFAULTS:Record<string,Record<string,InputValue>>=Object.fromEntries(CATALOG_INDICATORS.map(definition=>[definition.id,Object.fromEntries(definition.inputs.filter(input=>input.legacyOmit||input.legacyDefval!==undefined).map(input=>[input.key,input.defval as InputValue]))]));
export const indicatorDefaults:Record<IndicatorId,Record<string,InputValue>>=Object.fromEntries(INDICATOR_KINDS.map(kind=>[kind,{...indicatorLegacyDefaults[kind],...CATALOG_NEW_DEFAULTS[kind],...(kind==='obv'?{source:'close'}:{}),...(SMOOTHING_INDICATORS.includes(kind)?{smoothingType:'None',smoothingLength:14,smoothingMultiplier:2}:{}),...(kind==='stochastic'?{smoothK:1}:{}),...(kind==='vwap'?VWAP_BAND_DEFAULTS:{})}])) as Record<IndicatorId,Record<string,InputValue>>;
export const indicatorPlotIds:Record<IndicatorId,readonly string[]>={volume:['volume','ma'],sma:['sma','smooth','smoothUpper','smoothLower'],ema:['ema','smooth','smoothUpper','smoothLower'],rsi:['rsi','smooth','smoothUpper','smoothLower','divergenceBullish','divergenceBearish','divergenceHiddenBullish','divergenceHiddenBearish'],macd:['macd','signal','histogram'],bb:['basis','upper','lower'],vwap:['vwap','upper1','lower1','upper2','lower2','upper3','lower3'],stochastic:['k','d'],atr:['atr'],obv:['obv','smooth','smoothUpper','smoothLower'],...Object.fromEntries(CATALOG_INDICATORS.map(definition=>[definition.id,definition.plots.map(plot=>plot.id)]))} as unknown as Record<IndicatorId,readonly string[]>;
export {indicatorActivePlotIds};
const titles:Record<string,string>={length:'Length',source:'Source',smoothingType:'Smoothing type',divergence:'Calculate divergence',smoothingLength:'Smoothing length',smoothingMultiplier:'BB standard deviations',smoothK:'K smoothing',smoothD:'D length',fast:'Fast length',slow:'Slow length',signal:'Signal length',oscillatorType:'Oscillator MA type',signalType:'Signal MA type',basisType:'Basis MA type',multiplier:'Standard deviations',anchor:'Anchor period',timezone:'Calendar anchor time zone',smoothing:'Smoothing',bandMode:'Band calculation mode',band1Enabled:'Band 1 enabled',band1Multiplier:'Band 1 percentage multiplier',band2Enabled:'Band 2 enabled',band2Multiplier:'Band 2 percentage multiplier',band3Enabled:'Band 3 enabled',band3Multiplier:'Band 3 percentage multiplier'};
const floatInput=(key:string)=>['multiplier','smoothingMultiplier','band1Multiplier','band2Multiplier','band3Multiplier'].includes(key);
export function indicatorInputSchema(kind:IndicatorId):InputSchema[]{const definition=catalogDefinition(kind);if(definition)return definition.inputs.map(input=>({key:input.key,title:input.title,type:input.type,defval:input.defval,...(input.min!==undefined?{min:input.min}:{}),...(input.max!==undefined?{max:input.max}:{}),...(input.step!==undefined?{step:input.step}:{}),...(input.options?{options:[...input.options]}:{})} as InputSchema));const fields:InputSchema[]=Object.entries(indicatorDefaults[kind]).map(([key,defval])=>({key,title:kind==='volume'&&key==='length'?'MA Length':titles[key]??key,type:typeof defval==='boolean'?'bool':typeof defval==='number'?(floatInput(key)?'float':'int'):'string',defval,
 ...(typeof defval==='number'?{min:floatInput(key)?0:1,max:100000,step:floatInput(key)?0.1:1}:{}),
 ...(key==='source'?{options:['open','high','low','close','hl2','hlc3','ohlc4']}:{}),
 ...(key==='basisType'?{options:['SMA','EMA','RMA','WMA','VWMA']}:{}),
 ...(key==='smoothing'?{options:['RMA','SMA','EMA','WMA']}:{}),
 ...(key==='smoothingType'?{options:['None','SMA','SMA+BB','EMA','RMA','WMA','VWMA']}:{}),
 ...(key==='oscillatorType'||key==='signalType'?{options:['SMA','EMA']}:{}),
 ...(key==='anchor'?{options:['Session','Week','Month','Quarter','Year','Decade','Century','Dividends','Splits','Earnings']}:{}),
 ...(key==='bandMode'?{options:[...VWAP_BAND_MODES]}:{}),
}));if(kind==='volume')fields.push({key:'maType',title:'Volume MA type',type:'string',defval:'SMA',options:[...VOLUME_MA_TYPES]});if(kind==='vwap')fields.push({key:'kernelVersion',title:'Calculation method',type:'int',defval:1,min:1,max:2,step:1,options:['1','2']});
 // A historical RSI has no divergence key; absent means off and is never written by defaults.
 // The RSI smoothing reads as the RSI-based MA (titles only; keys unchanged).
 if(kind==='rsi')for(const field of fields){const title=RSI_MA_INPUT_TITLES[field.key];if(title)field.title=title;}
 // Bollinger Bands: an optional display toggle; absent means off and is never written by defaults.
 if(kind==='bb')fields.push({key:'colorByExpansion',title:'Color by expansion',type:'bool',defval:false});
 if(kind==='rsi'){fields.push({key:'divergence',title:'Calculate divergence',type:'bool',defval:false});for(const field of RSI_DIVERGENCE_INPUTS)fields.push({...field} as InputSchema);}return fields;}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)!,'value')&&Object.getOwnPropertyDescriptor(value,key)!.enumerable);
export function assertIndicatorRecord(value:unknown):asserts value is Record<string,unknown>{if(!object(value))throw new Error('Indicator settings require a plain scalar record without accessors or hidden fields.');}
const identity=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0&&value.length<=200&&!/[\u0000-\u001f\u007f]/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
function keys(value:Record<string,unknown>,allowed:readonly string[],description:string,required:readonly string[]=[]){if(Reflect.ownKeys(value).some(key=>typeof key!=='string'||!allowed.includes(key))||required.some(key=>!Object.hasOwn(value,key)))throw new Error('Unsupported or missing '+description+' field.');}
/**
 * Edit validation by default. stored=true validates saved state (workspaces, templates, alerts, library defaults):
 * it also accepts retired catalog inputs and the wider pre-fix bounds, so older saved settings still load.
 */
export function validateIndicatorInputs(kind:IndicatorId,inputs:unknown,stored=false,crossField=true):asserts inputs is IndicatorInputs{
 if(!INDICATOR_KINDS.includes(kind)||!object(inputs))throw new Error('Invalid indicator inputs.');
 const fields=indicatorInputSchema(kind),definition=catalogDefinition(kind);
 for(const [key,value] of Object.entries(inputs)){
  const catalogField=definition?catalogInputField(definition,key):undefined,retired=!!catalogField&&!definition!.inputs.includes(catalogField);
  const field=retired?(stored?catalogField:undefined):fields.find(candidate=>candidate.key===key);if(!field)throw new Error(`Unsupported indicator input: ${key}`);
  if(typeof value!==typeof field.defval)throw new Error(`Invalid input type: ${key}`);
  const {min,max}=stored&&catalogField?catalogStoredBounds(catalogField):{min:field.min,max:field.max};
  if(typeof value==='number'&&(!Number.isFinite(value)||(field.type==='int'&&!Number.isSafeInteger(value))||(min!==undefined&&value<min)||(max!==undefined&&value>max)))throw new Error(`Invalid numeric input: ${key}${field.type==='int'?' (integer)':''}${min!==undefined&&max!==undefined?` must be from ${min} through ${max}`:min!==undefined?` must be at least ${min}`:max!==undefined?` must be at most ${max}`:' must be finite'}`);
  const reference=key==='source'&&INDICATOR_SOURCE_KINDS.includes(kind)?parseIndicatorSource(value):null;
  if(typeof value==='string'&&value.length>(reference?620:200))throw new Error(`Oversized input: ${key}`);
  if(field.options&&!field.options.includes(String(value))&&!reference)throw new Error(`Unsupported input option: ${key}`);
  if(key==='timezone')new Intl.DateTimeFormat('en',{timeZone:String(value)});
 }
 if(!crossField)return;
 if(kind==='vwap'){indicatorVwapKernelVersion(inputs);indicatorVwapBandSettings(inputs);}
 if(kind==='rsi')rsiDivergenceSettings(inputs);
 if(kind==='volume')indicatorVolumeMaType(inputs);
 if(definition?.tradingSessions)validateTradingSessionInputs(key=>catalogInputValue(definition,inputs,key));
 if(definition?.seasonality){validateSeasonalityCatalogInputs(key=>catalogInputValue(definition,inputs,key));for(const key of ['positiveColor','negativeColor'])if(!supportedColor(catalogInputValue(definition,inputs,key)))throw Error('Choose a supported Seasonality color.');}
}
/** Legacy complete tuples remain untouched; new captures must include the whole add-on tuple. */
export function validateFrozenIndicatorInputs(kind:IndicatorId,inputs:unknown,plotId:string):asserts inputs is IndicatorInputs{
 validateIndicatorInputs(kind,inputs,true);
 if(parseIndicatorSource(inputs.source))throw new Error('Alerts cannot capture an indicator that uses another indicator as its source.');
 // A key replaced by a retired pre-fix input (ENV Percent, KC Bands style) is captured when its predecessor is.
 const replaced=(key:string)=>catalogDefinition(kind)?.retiredInputs?.some(row=>row.replacedBy===key&&Object.hasOwn(inputs,row.key))??false;
 if(indicatorLegacyInputKeys[kind].some(key=>!Object.hasOwn(inputs,key)&&!replaced(key)))throw new Error('Every historical base calculation input must be captured explicitly.');
 if(SMOOTHING_INDICATORS.includes(kind)){const count=SMOOTHING_INPUT_KEYS.filter(key=>Object.hasOwn(inputs,key)).length;if(count!==0&&count!==3)throw new Error('Every smoothing calculation input must be captured explicitly, or all omitted for a legacy None snapshot.');}
 if(!indicatorActivePlotIds(kind,inputs).includes(plotId))throw new Error('This indicator plot is disabled by its captured calculation inputs.');
}
export function indicatorGuideIds(kind:IndicatorId):readonly IndicatorGuideId[]{const definition=catalogDefinition(kind);if(definition)return (definition.guides??[]).map(guide=>guide.id);return kind==='rsi'?['upper','middle','lower','bullStart','bullEnd','bearStart','bearEnd']:kind==='stochastic'?['upper','lower']:kind==='macd'?['zero']:[];}
export function indicatorFillIds(kind:IndicatorId):readonly IndicatorFillId[]{return [...(['rsi','stochastic','bb'].includes(kind)||catalogDefinition(kind)?.band?['band' as const]:[]),...(SMOOTHING_INDICATORS.includes(kind)?['smoothing' as const]:[]),...(kind==='rsi'?['bullZone' as const,'bearZone' as const]:[]),...(kind==='vwap'?['band1' as const,'band2' as const,'band3' as const]:[]),...(catalogDefinition(kind)?.bearishFill?['bearish' as const]:[]),...(catalogDefinition(kind)?.profile?VP_FILL_IDS:[])];}
export function validateIndicatorVolumePalette(value:unknown):asserts value is IndicatorVolumePalette{
 assertIndicatorRecord(value);const base=['schemaVersion','mode','upColor','downColor'],four=['upRisingColor','upFallingColor','downRisingColor','downFallingColor'];keys(value,[...base,...four],'Volume palette',value.mode==='rising-falling'?[...base,...four]:base);
 if(four.some(key=>Object.hasOwn(value,key)&&!supportedColor(value[key])))throw new Error('Volume rising and falling colors must be supported colors.');
 if(value.schemaVersion!==1||typeof value.mode!=='string'||!['uniform','open-close','previous-close','rising-falling'].includes(value.mode)||!supportedColor(value.upColor)||!supportedColor(value.downColor))throw new Error('Volume palette requires version 1, an explicit supported mode and two supported colors.');
}
export function validateIndicatorPresentation(kind:IndicatorId,value:unknown):asserts value is IndicatorPresentation{
 assertIndicatorRecord(value);keys(value,['schemaVersion','precision','guides','fills','histogramPalette','hideOnDaily','visibility','volumePalette','timeframe','pointPalette','maPalette'],'indicator presentation',['schemaVersion','precision','guides','fills']);
 if(value.schemaVersion!==1||!isIndicatorPrecision(value.precision))throw new Error('Indicator presentation requires version 1 and precision auto or an integer from 0 through 16.');
 assertIndicatorRecord(value.guides);assertIndicatorRecord(value.fills);
 for(const [id,style] of Object.entries(value.guides)){
  if(!indicatorGuideIds(kind).includes(id as IndicatorGuideId))throw new Error('Unsupported indicator guide: '+id);
  assertIndicatorRecord(style);keys(style,['visible','value','color','width','lineStyle'],'guide',['visible','value','color','width','lineStyle']);
  if(typeof style.visible!=='boolean'||typeof style.value!=='number'||!Number.isFinite(style.value)||kind==='macd'&&style.value!==0||!supportedColor(style.color)||typeof style.width!=='number'||!Number.isFinite(style.width)||style.width<=0||style.width>20||typeof style.lineStyle!=='string'||!['solid','dashed','dotted'].includes(style.lineStyle))throw new Error('Invalid indicator guide style.');
 }
 for(const [id,style] of Object.entries(value.fills)){
  if(!indicatorFillIds(kind).includes(id as IndicatorFillId))throw new Error('Unsupported indicator fill: '+id);
  assertIndicatorRecord(style);keys(style,['visible','color','opacity'],'fill',['visible','color','opacity']);
  if(typeof style.visible!=='boolean'||!supportedColor(style.color)||typeof style.opacity!=='number'||!Number.isFinite(style.opacity)||style.opacity<0||style.opacity>100)throw new Error('Invalid indicator fill style.');
 }
 if(Object.hasOwn(value,'histogramPalette')){
  if(kind!=='macd'&&!catalogDefinition(kind)?.histogramPalette)throw new Error('A momentum histogram palette is only supported for MACD and the Awesome Oscillator.');
  assertIndicatorRecord(value.histogramPalette);const names=['nonnegativeRising','nonnegativeFalling','negativeRising','negativeFalling'];keys(value.histogramPalette,names,'histogram palette',names);
  if(Object.values(value.histogramPalette).some(color=>!supportedColor(color)))throw new Error('Invalid histogram palette color.');
 }
 if(Object.hasOwn(value,'hideOnDaily')&&(kind!=='vwap'||typeof value.hideOnDaily!=='boolean'))throw new Error('Hide on daily and above requires an explicit VWAP presentation boolean.');
 if(Object.hasOwn(value,'visibility'))validateIndicatorIntervalVisibility(value.visibility);
 if(Object.hasOwn(value,'timeframe'))validateIndicatorTimeframe(value.timeframe);
 if(Object.hasOwn(value,'pointPalette')){const palette=catalogDefinition(kind)?.pointPalette;if(!palette)throw new Error('Per-bar state colors are only supported for indicators with a state palette.');const colors=value.pointPalette;if(!Array.isArray(colors)||colors.length!==palette.colors.length||colors.some(color=>!supportedColor(color)))throw new Error('Per-bar state colors need one supported color for each of the '+palette.colors.length+' states.');}
 if(Object.hasOwn(value,'maPalette')){if(kind!=='rsi')throw new Error('Rising and falling MA colors are only supported for RSI.');assertIndicatorRecord(value.maPalette);const names=['rising','falling'];keys(value.maPalette,names,'MA palette',names);if(Object.values(value.maPalette).some(color=>!supportedColor(color)))throw new Error('Invalid MA palette color.');}
 if(Object.hasOwn(value,'volumePalette')){if(kind!=='volume')throw new Error('A Volume direction palette is only supported for Volume.');validateIndicatorVolumePalette(value.volumePalette);}
}
/** The state colors drawn: the Style tab's edited colors when they fit the definition, else the definition's. */
export function pointPaletteColors(kind:IndicatorId,presentation:IndicatorPresentation|undefined):readonly string[]{
 const palette=catalogDefinition(kind)?.pointPalette;if(!palette)return [];
 const edited=presentation?.pointPalette;return edited&&edited.length===palette.colors.length?edited:palette.colors;
}
/** Player-facing names of the RSI smoothing inputs and plots (the RSI-based MA). */
export const RSI_MA_INPUT_TITLES:Readonly<Record<string,string>>=Object.freeze({smoothingType:RSI_MA_NAME+' type',smoothingLength:RSI_MA_NAME+' length',smoothingMultiplier:RSI_MA_NAME+' BB standard deviations'});
export const RSI_MA_PLOT_LABELS:Readonly<Record<string,string>>=Object.freeze({smooth:RSI_MA_NAME,smoothUpper:RSI_MA_NAME+' upper band',smoothLower:RSI_MA_NAME+' lower band'});
/** LV rising/falling MA colors (the LV candle jade and coral). */
export const RSI_MA_PALETTE_DEFAULTS:Readonly<IndicatorMaPalette>=Object.freeze({rising:LV_HISTOGRAM_COLORS.up,falling:LV_HISTOGRAM_COLORS.down});
/** New RSIs start with the owner's RSI-based MA (SMA 21) and Candle body only on; the multiplier keeps its default
 *  (the smoothing keys are stored as one tuple). */
const RSI_CREATION_INPUTS=Object.freeze({smoothingType:'SMA',smoothingLength:21,...RSI_DIVERGENCE_CREATION_INPUTS});
/** The inputs of a NEW instance (factory creation): the defaults plus creation-only seeds that absent keys never imply
 *  (RSI: Candle body only on). Saved instances never pass through here, so their results stay identical. */
export function indicatorCreationInputs(kind:IndicatorId):Record<string,InputValue>{return {...structuredClone(indicatorDefaults[kind]),...(kind==='rsi'?RSI_CREATION_INPUTS:{})};}
/** Legacy drafts preserve absent decorations; factory creation opts in explicitly. */
export function defaultIndicatorPresentation(kind:IndicatorId,legacy=false):IndicatorPresentation{
 // Catalog guide/fill colors, opacity, precision and AO colors come from the definition's cited facts (src/domain/indicator-catalog.ts).
 const definition=catalogDefinition(kind),catalogGuides=definition?.guides,guides:IndicatorPresentation['guides']={};for(const id of indicatorGuideIds(kind)){const guide=catalogGuides?.find(row=>row.id===id);guides[id]={visible:!legacy&&!(id in RSI_ZONE_DEFAULTS),value:guide?guide.value:id in RSI_ZONE_DEFAULTS?RSI_ZONE_DEFAULTS[id as keyof typeof RSI_ZONE_DEFAULTS]:id==='zero'?0:id==='middle'?50:id==='upper'?(kind==='stochastic'?80:70):(kind==='stochastic'?20:30),color:guide?.color??LV_GUIDE_COLOR,width:1,lineStyle:'dashed'};}
 const fills:IndicatorPresentation['fills']={};for(const id of indicatorFillIds(kind)){if(isVpFillId(id)){fills[id]={...VP_FILL_DEFAULTS[id]};continue;}if(id==='bullZone'||id==='bearZone'){fills[id]={visible:!legacy,color:id==='bullZone'?LV_HISTOGRAM_COLORS.up:LV_HISTOGRAM_COLORS.down,opacity:12};continue;}const source=id==='bearish'?definition?.bearishFill:definition?.fill;fills[id]={visible:!legacy,color:source?.color??(kind==='rsi'?LV_RSI_FILL:LV_INDICATOR_PALETTE[0]),opacity:source?.opacity??10};}
 const colors=definition?.histogramColors??{growing:LV_HISTOGRAM_COLORS.up,falling:LV_HISTOGRAM_COLORS.down};
 return {schemaVersion:1,precision:definition?.precision??'auto',guides,fills,...(kind==='macd'&&!legacy?{histogramPalette:{nonnegativeRising:LV_HISTOGRAM_COLORS.up,nonnegativeFalling:LV_HISTOGRAM_COLORS.upPale,negativeRising:LV_HISTOGRAM_COLORS.downPale,negativeFalling:LV_HISTOGRAM_COLORS.down}}:definition?.histogramPalette&&!legacy?{histogramPalette:{nonnegativeRising:colors.growing,nonnegativeFalling:colors.falling,negativeRising:colors.growing,negativeFalling:colors.falling}}:{}),...(kind==='rsi'&&!legacy?{maPalette:{...RSI_MA_PALETTE_DEFAULTS}}:{})};
}
/** Lossless migration of stored inputs (ENV equal upper/lower percentages to Percent, KC Use true range to Bands style, default AO lengths dropped). */
export function migrateIndicatorInputs(kind:IndicatorId,inputs:IndicatorInputs):IndicatorInputs{return migrateCatalogInputs(kind,inputs) as IndicatorInputs;}
/**
 * Stored inputs over a defaults base: each layer is migrated, and a successor default (ENV Percent, KC Bands style)
 * is not merged while its retired predecessor is still present, so a kept legacy pair is never shadowed.
 */
export function mergeStoredIndicatorInputs(kind:IndicatorId,base:Record<string,unknown>,...layers:(IndicatorInputs|undefined)[]):IndicatorInputs{
 const migrated=layers.filter((layer):layer is IndicatorInputs=>!!layer).map(layer=>migrateIndicatorInputs(kind,layer)),next:Record<string,unknown>={...base};
 for(const layer of migrated)Object.assign(next,layer);
 for(const row of catalogDefinition(kind)?.retiredInputs??[])if(row.replacedBy&&Object.hasOwn(next,row.key)&&!migrated.some(layer=>Object.hasOwn(layer,row.replacedBy!)))delete next[row.replacedBy];
 return next as IndicatorInputs;
}
/**
 * Merge an edit into stored inputs. The patch is validated with edit bounds; retired keys are allowed only when
 * unchanged (a dialog draft carries them through). Editing a successor (ENV Percent, KC Bands style) drops the
 * retired keys it replaces.
 */
export function applyIndicatorInputEdit(kind:IndicatorId,current:IndicatorInputs,patch:IndicatorInputs):IndicatorInputs{
 const definition=catalogDefinition(kind),retired=definition?.retiredInputs??[];assertIndicatorRecord(patch);
 // Only changed fields meet the edit bounds: an unchanged stored value (a retired key, or a pre-fix value
 // above a fact bound such as CCI length 5000) never blocks an unrelated edit; changing it requires the fact bound.
 // The merged result is still validated as stored state by the caller.
 const edit=Object.fromEntries(Object.entries(patch).filter(([key,value])=>!(Object.hasOwn(current,key)&&Object.is(current[key],value))));
 validateIndicatorInputs(kind,edit,false,false);// changed fields: edit bounds; tuple rules (VWAP bands, Volume MA type) below on the result
 const next:Record<string,unknown>={...current,...edit};for(const row of retired)if(row.replacedBy&&Object.hasOwn(edit,row.replacedBy))delete next[row.key];
 // Switching divergence off on an instance that never had the key is not a stored change; never materialize it.
 if(kind==='rsi'&&next.divergence===false&&!Object.hasOwn(current,'divergence'))delete next.divergence;
 // A divergence option set to its default on an instance that never had the key is not a stored change either.
 if(kind==='rsi')for(const field of RSI_DIVERGENCE_INPUTS)if(!Object.hasOwn(current,field.key)&&Object.is(next[field.key],field.defval))delete next[field.key];
 validateIndicatorInputs(kind,next,true);
 return next as IndicatorInputs;
}
/**
 * New input versus restored legacy. A value equal to the one held by a stored base (the instance it was
 * copied from, the saved default it replaces, the factory default) is restored state and keeps the stored bounds;
 * any other value is new input and meets the fact (edit) bounds. Retired keys have no current control, so they can
 * only come from stored state; they stay under the stored validation that follows (and migrate there).
 */
export function assertIndicatorNewInputs(kind:IndicatorId,inputs:unknown,bases:readonly (Record<string,unknown>|undefined)[]):void{
 assertIndicatorRecord(inputs);const retired=new Set((catalogDefinition(kind)?.retiredInputs??[]).map(row=>row.key));
 const fresh=Object.fromEntries(Object.entries(inputs).filter(([key,value])=>!retired.has(key)&&!bases.some(base=>!!base&&Object.hasOwn(base,key)&&Object.is(base[key],value))));
 validateIndicatorInputs(kind,fresh,false,false);
}
/** A display offset that no stored base holds is new input and meets the per-kind edit bound. */
export function assertIndicatorNewOffset(kind:IndicatorId,offset:unknown,bases:readonly (number|undefined)[]):void{
 if(!bases.some(base=>base!==undefined&&Object.is(base,offset)))assertIndicatorEditOffset(kind,offset);
}
export function validateIndicatorPlotStyle(value:unknown):asserts value is IndicatorPlotStyle{
 if(!object(value))throw new Error('Invalid plot style.');
 keys(value,['visible','color','width','lineStyle','kind','priceScale','legend','dataWindow','opacity','trackPrice'],'plot style');
 if(!['visible','priceScale','legend','dataWindow'].every(key=>typeof value[key]==='boolean')||!supportedColor(value.color)||typeof value.width!=='number'||!Number.isFinite(value.width)||value.width<=0||value.width>20||typeof value.lineStyle!=='string'||typeof value.kind!=='string'||!['solid','dashed','dotted'].includes(value.lineStyle)||!['line','area','step','histogram','columns','circles','cross'].includes(value.kind))throw new Error('Invalid plot style. Use supported CSS colors, widths above 0 through 20, and explicit display flags.');
 if(Object.hasOwn(value,'opacity')&&(typeof value.opacity!=='number'||!Number.isFinite(value.opacity)||value.opacity<0||value.opacity>100)||Object.hasOwn(value,'trackPrice')&&typeof value.trackPrice!=='boolean')throw new Error('Invalid plot opacity or track-price flag.');
}
/** Settings that passed validation, by exact content (exactBudgetKey) and snapshot flag. Validation is a pure
 * function of that content, so a repeat of the same content (every live recalculation) skips the walk. Failures are never kept. */
const validSettingsCache=new Set<string>(),VALID_SETTINGS_CACHE_LIMIT=512;
export function validateIndicatorSettings(value:unknown,snapshot=false):asserts value is IndicatorInstanceSettings{
 const out:string[]=[snapshot===true?'s':snapshot===false?'o':''];const key=out[0]&&exactBudgetKey(value,out)?out.join(''):null;
 if(key!==null&&validSettingsCache.has(key))return;
 validateIndicatorSettingsFull(value,snapshot);
 if(key!==null){if(validSettingsCache.size>=VALID_SETTINGS_CACHE_LIMIT)validSettingsCache.delete(validSettingsCache.values().next().value!);validSettingsCache.add(key);}
}
function validateIndicatorSettingsFull(value:unknown,snapshot:boolean):asserts value is IndicatorInstanceSettings{
 if(!object(value)||!identity(value.id)||!INDICATOR_KINDS.includes(value.kind as IndicatorId)||!Number.isSafeInteger(value.offset)||Math.abs(value.offset as number)>INDICATOR_MAX_OFFSET||typeof value.visible!=='boolean'||!object(value.plots))throw new Error('Invalid indicator snapshot.');
 keys(value,['id','kind','inputs','plots','offset','visible','presentation',...(snapshot?['paneId','ownScale','scalePlacement','scaleGroup']:[])],'indicator');
 if(snapshot&&Object.hasOwn(value,'ownScale')&&typeof value.ownScale!=='boolean')throw new Error('Indicator scale placement must be a boolean.');
 if(snapshot&&Object.hasOwn(value,'scalePlacement')&&(value.scalePlacement!=='left'&&value.scalePlacement!=='none'||value.ownScale!==true))throw new Error('Indicator scale side must be left or none on its own scale.');
 if(snapshot&&Object.hasOwn(value,'scaleGroup')&&(!identity(value.scaleGroup)||value.ownScale!==true||value.scalePlacement==='none'))throw new Error('Indicator scale group must name an own right or left scale.');
 const kind=value.kind as IndicatorId;validateIndicatorInputs(kind,value.inputs,true);
 if(kind==='seasonality'&&value.offset!==0)throw new Error('Seasonality uses exact source-calendar months; display offset must be zero.');
 for(const [plot,style] of Object.entries(value.plots)){if(!indicatorPlotIds[kind].includes(plot))throw new Error('Unsupported indicator plot: '+plot);validateIndicatorPlotStyle(style);}
 if(Object.hasOwn(value,'presentation'))validateIndicatorPresentation(kind,value.presentation);
 if(kind==='seasonality'&&((value.presentation as IndicatorPresentation|undefined)?.timeframe?.interval??null)!==null)throw new Error('Seasonality uses its owned original daily/monthly source; choose the Chart timeframe.');
  if(kind==='autotrendlines'&&((value.presentation as IndicatorPresentation|undefined)?.timeframe?.interval??null)!==null)throw new Error('Auto trendlines draws on the chart bars only; choose the Chart timeframe.');
  if(kind==='autoelliott'&&((value.presentation as IndicatorPresentation|undefined)?.timeframe?.interval??null)!==null)throw new Error('Auto Elliott waves draws on the chart bars only; choose the Chart timeframe.');
 if(kind==='vwap'&&(value.inputs as IndicatorInputs).kernelVersion===2&&((value.presentation as IndicatorPresentation|undefined)?.timeframe?.interval??null)!==null)throw new Error('An independent timeframe is unavailable for the Extended precision VWAP method. Choose the Chart timeframe or the Original method.');
 if(kind==='volume'&&(value.presentation as IndicatorPresentation|undefined)?.volumePalette?.mode!==undefined&&(value.presentation as IndicatorPresentation).volumePalette!.mode!=='uniform'&&(value.plots.volume as IndicatorPlotStyle|undefined)?.kind==='area')throw new Error('Directional Volume colors are unavailable for area plots. Select Single color or another Volume plot style.');
 if(snapshot&&value.paneId!==null&&!identity(value.paneId))throw new Error('Invalid logical pane identity.');
}
export function validateIndicatorSnapshots(value:unknown):asserts value is IndicatorSnapshot[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>INDICATOR_MAX_INSTANCES||Reflect.ownKeys(value).length!==value.length+1)throw new Error('Invalid indicator collection.');
 const ids=new Set<string>();for(let i=0;i<value.length;i++){const property=Object.getOwnPropertyDescriptor(value,String(i));if(!property||!property.enumerable||!Object.hasOwn(property,'value'))throw new Error('Indicator collections cannot contain holes or accessors.');const row=property.value;validateIndicatorSettings(row,true);if(ids.has(row.id))throw new Error('Duplicate indicator snapshot ID.');ids.add(row.id);}
 validateIndicatorSourceGraph(value as IndicatorSnapshot[],{allowMissing:true,plots:kind=>indicatorPlotIds[kind as IndicatorId]??[]});
}
/** Conservative loop estimate for the current calculators, not a frame-time claim. */
export function indicatorEstimatedWork(kind:IndicatorId,barCount:number,inputs:IndicatorInputs):number{
 validateIndicatorInputs(kind,inputs,true);return indicatorCalculationWork(kind,barCount,inputs);
}
export interface IndicatorBudgetItem {kind:IndicatorId;inputs:IndicatorInputs;presentation?:IndicatorPresentation;plots?:Record<string,IndicatorPlotStyle>;offset?:number}
/** Result values plus native time/value pairs and two private anchor series per active fill. */
export function indicatorEstimatedSlots(kind:IndicatorId,barCount:number,inputs:IndicatorInputs,presentation?:IndicatorPresentation,scope:'render'|'calculation'='render',plots:Record<string,IndicatorPlotStyle>={},offset=0):number{
 validateIndicatorInputs(kind,inputs,true);if(!Number.isSafeInteger(barCount)||barCount<0||barCount>100000)throw new Error('Invalid indicator bar count.');if(presentation!==undefined)validateIndicatorPresentation(kind,presentation);
 if(!Number.isSafeInteger(offset)||Math.abs(offset)>INDICATOR_MAX_OFFSET)throw new Error('Invalid indicator display offset.');
 const active=indicatorActivePlotIds(kind,inputs);let slots=barCount*active.length;const definition=catalogDefinition(kind),sessionWindows=definition?.tradingSessions?[1,2,3].filter(index=>catalogInputValue(definition,inputs,`session${index}Enabled`)===true).length:0;
 // Each bar may be the only observation of a distinct session: account for retained statistics and native geometry conservatively.
 slots+=barCount*sessionWindows*(scope==='calculation'?13:36);
 if(definition?.seasonality){const get=(key:string)=>catalogInputValue(definition,inputs,key),years=(get('endYear') as number)-(get('startYear') as number)+1,F=years*12+1,T=(years+1+Number(get('meanRow'))+Number(get('deviationRow'))+Number(get('positiveFrequencyRow')))*13;/* Retained pure scene + aligned arrays + native cells/boxes/layout, even without an optional readout lease. */slots+=4*barCount+128*F+64*T+4096;}if(scope==='calculation')return slots;
 const nativeCount=barCount+Math.max(0,offset);slots+=nativeCount*active.length*2;
 for(const id of indicatorFillIds(kind)){if(isVpFillId(id))continue;const fill=presentation?.fills[id],enabled=id==='smoothing'?inputs.smoothingType==='SMA+BB':/^band[123]$/.test(id)?active.includes('upper'+id.at(-1)):true;if(fill?.visible&&enabled&&id!=='bullZone'&&id!=='bearZone')slots+=nativeCount*4;}// An RSI zone is one native box (no numeric slots, like labels)
 slots+=Object.values(presentation?.guides??{}).filter(guide=>guide?.visible).length;
 for(const id of active)if(plots[id]?.visible&&plots[id]?.trackPrice)slots++;
 return slots;
}
/** Exact structural key of a scalar record tree (plain objects and dense plain arrays of strings, finite or
 * non-finite numbers, booleans, null and undefined; key order and -0 kept). null when the value is anything else (an
 * accessor, a symbol key, a non-enumerable key, a prototype, a function, a hole), so the caller takes the uncached path. */
function exactBudgetKey(value:unknown,out:string[],depth=0):boolean{
 if(depth>8)return false;
 if(value===undefined){out.push('u');return true;}if(value===null){out.push('n');return true;}
 const type=typeof value;
 if(type==='string'){out.push(JSON.stringify(value));return true;}
 if(type==='number'){out.push(Object.is(value,-0)?'d-0':'d'+String(value));return true;}
 if(type==='boolean'){out.push(value?'t':'f');return true;}
 if(type!=='object')return false;
 const record=value as Record<string,unknown>,proto=Object.getPrototypeOf(record),array=Array.isArray(record);
 if(array?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)return false;
 const names=Reflect.ownKeys(record);if(array&&names.length!==(record as unknown as unknown[]).length+1)return false;
 out.push(array?'[':proto===null?'{0':'{');
 for(const name of names){if(typeof name!=='string')return false;if(array&&name==='length')continue;const property=Object.getOwnPropertyDescriptor(record,name);if(!property||!property.enumerable||!Object.hasOwn(property,'value'))return false;if(!array)out.push(JSON.stringify(name),':');if(!exactBudgetKey(property.value,out,depth+1))return false;out.push(',');}
 out.push(array?']':'}');return true;
}
const BUDGET_ITEM_FIELDS=['kind','inputs','presentation','plots','offset'] as const;
function budgetItemKey(item:unknown,barCount:number):string|null{
 if(typeof barCount!=='number'||!item||typeof item!=='object')return null;const out:string[]=[Object.is(barCount,-0)?'-0':String(barCount)];
 for(const name of BUDGET_ITEM_FIELDS){const property=Object.getOwnPropertyDescriptor(item,name);let value:unknown;if(property){if(!Object.hasOwn(property,'value'))return null;value=property.value;}else if(name in (item as object))return null;out.push('|');if(!exactBudgetKey(value,out))return null;}
 return out.join('');
}
/** Per-item slot and work estimates of validated budget items, keyed by the exact item content and bar count.
 * The estimate is a pure function of that content (validation included), so a hit returns what the full path would.
 * Only successful estimates are kept; a failing item always runs the full path and throws its own error. */
const budgetItemCache=new Map<string,{slots:number;work:number}>(),BUDGET_ITEM_CACHE_LIMIT=512;
export function clearIndicatorBudgetCache():void{budgetItemCache.clear();validSettingsCache.clear();}
export function assertIndicatorBatchBudget(items:readonly IndicatorBudgetItem[],barCount:number):{operations:number;numericSlots:number}{
 if(!Array.isArray(items)||items.length>INDICATOR_MAX_INSTANCES)throw new Error('Invalid indicator budget collection.');let operations=0,numericSlots=0;
 for(const item of items){
  const key=budgetItemKey(item,barCount),cached=key===null?undefined:budgetItemCache.get(key);
  if(cached){numericSlots+=cached.slots;operations+=cached.work;}
  else{const slots=indicatorEstimatedSlots(item.kind,barCount,item.inputs,item.presentation,'render',item.plots,item.offset);numericSlots+=slots;const palette=item.kind==='volume'?item.presentation?.volumePalette:undefined;const work=indicatorEstimatedWork(item.kind,barCount,item.inputs)+slots*4+(palette&&palette.mode!=='uniform'?barCount*4:0);operations+=work;
   if(key!==null){if(budgetItemCache.size>=BUDGET_ITEM_CACHE_LIMIT)budgetItemCache.delete(budgetItemCache.keys().next().value!);budgetItemCache.set(key,{slots,work});}}
  if(numericSlots>INDICATOR_OUTPUT_LIMIT||operations>INDICATOR_WORK_LIMIT)throw new Error(`Indicator batch exceeds local limits (${numericSlots}/${INDICATOR_OUTPUT_LIMIT} numeric slots, ${operations}/${INDICATOR_WORK_LIMIT} estimated operations). Reduce history or instances.`);}
 return {operations,numericSlots};
}
