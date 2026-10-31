import type {SeasonalityScene} from './indicators-ext/seasonality-types';
import type {TradingSessionRecord} from './indicators-ext/trading-sessions';
import type { Bar, NumericSeries, PriceSource } from './types';
import {vwapPercentageBounds} from './vwap-percentage';
import {isVwapBandMode,vwapDeviationBounds,vwapDeviationSeries,VWAP_STDEV_POLICY,type VwapBandMode} from './vwap-stdev-bands';
import {parseIndicatorSource,INDICATOR_SOURCE_KINDS} from './indicator-source';
import {CATALOG_INDICATORS,catalogDefinition,catalogInputValue,type CatalogIndicatorId,type CatalogToolkit} from './indicator-catalog';
import type {FinerBarsLookup,LowerTimeframeBars,VolumeProfile} from './volume-profile';
import {isVwapEventAnchor,vwapEventAnchorKeys,type VwapEventDate} from './vwap-event-anchors';
import {rsiDivergence,rsiDivergenceSettings,RSI_DIVERGENCE_PLOT_OF,RSI_DIVERGENCE_TITLES,RSI_DIVERGENCE_INPUT_KEYS,RSI_DIVERGENCE_POLICY_ID,type RsiDivergenceSegment} from './rsi-divergence';
import {secondSymbolSeries,type SecondSeries} from './second-symbol';
import {validPatternMarks,type PatternMarks} from './indicators-ext/patterns-catalog';

export type IndicatorId = 'volume' | 'sma' | 'ema' | 'rsi' | 'macd' | 'bb' | 'vwap' | 'stochastic' | 'atr' | 'obv' | CatalogIndicatorId;
export type MovingAverageType = 'SMA' | 'EMA' | 'RMA' | 'WMA' | 'VWMA';
export type IndicatorSmoothingType='None'|'SMA'|'SMA+BB'|'EMA'|'RMA'|'WMA'|'VWMA';
export interface IndicatorSeries { id: string; label: string; values: NumericSeries; }
/** RSI divergence segments: display geometry only; calculation outputs are the sparse marker series. */
export interface IndicatorResult { id: string; series: IndicatorSeries[]; diagnostics: string[]; policies: string[]; plotDiagnostics?:Record<string,string[]>; divergence?:{segments:readonly RsiDivergenceSegment[]}; /** Histogram rows of the profile kinds (display geometry; POC, VAH and VAL are the series). */ profiles?:readonly VolumeProfile[]; /** Values of some plots past the last bar, k = 1.. (display only; series keep one value per bar for alerts and the data window). */ projection?:Readonly<Record<string,NumericSeries>>; /** Pattern markers and boundary lines (display only; the 0/1 signal plots are the series). */ marks?:PatternMarks; sessions?:readonly Readonly<TradingSessionRecord>[]; /** Display payload only; private port receipt grants current source/readout authority. */ seasonality?:Readonly<SeasonalityScene>; }
export type IndicatorInputs = Record<string, unknown>;
/** A projection names known plots only, holds at most 100000 finite-or-null values per plot, and is frozen. */
export function validProjection(plotIds:readonly string[],value:Record<string,NumericSeries>):Readonly<Record<string,NumericSeries>>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('The indicator projection is invalid.');
 const out:Record<string,NumericSeries>={};
 for(const [key,values] of Object.entries(value)){if(!plotIds.includes(key)||!Array.isArray(values)||values.length>100000||values.some(item=>item!==null&&!finite(item)))throw new Error('The indicator projection is invalid.');out[key]=Object.freeze([...values]) as NumericSeries;}
 return Object.freeze(out);
}
export const VWAP_KERNEL_INPUT_KEY='kernelVersion' as const;
/** Omission is historical kernel 1; reading the effective choice never rewrites saved data. */
export function indicatorVwapKernelVersion(inputs:IndicatorInputs):1|2{
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs)||![Object.prototype,null].includes(Object.getPrototypeOf(inputs))||Reflect.ownKeys(inputs).some(key=>typeof key!=='string'||!Object.hasOwn(Object.getOwnPropertyDescriptor(inputs,key)!,'value')||!Object.getOwnPropertyDescriptor(inputs,key)!.enumerable))throw new Error('VWAP kernel inputs require plain own data without hidden fields or accessors.');
 const version=Object.hasOwn(inputs,VWAP_KERNEL_INPUT_KEY)?inputs[VWAP_KERNEL_INPUT_KEY]:1;
 if(version!==1&&version!==2)throw new Error('VWAP kernel version must be the number 1 or 2.');
 return version;
}
export const VOLUME_MA_TYPES=Object.freeze(['SMA','EMA','WMA'] as const);
export type VolumeMaType=typeof VOLUME_MA_TYPES[number];
/** Read the optional Volume choice without rewriting historical settings or defaults. */
export function indicatorVolumeMaType(inputs:IndicatorInputs):VolumeMaType{
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs)||![Object.prototype,null].includes(Object.getPrototypeOf(inputs))||Reflect.ownKeys(inputs).some(key=>typeof key!=='string'||!Object.hasOwn(Object.getOwnPropertyDescriptor(inputs,key)!,'value')||!Object.getOwnPropertyDescriptor(inputs,key)!.enumerable))throw new Error('Volume MA inputs require plain own data without hidden fields or accessors.');
 const type=Object.hasOwn(inputs,'maType')?inputs.maType:'SMA';
 if(typeof type!=='string'||!(VOLUME_MA_TYPES as readonly string[]).includes(type))throw new Error('Volume MA type must be SMA, EMA or WMA.');
 return type as VolumeMaType;
}
type Values = readonly (number | null)[];
const finite = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

function length(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100000) throw new RangeError('Length must be an integer from 1 to 100000.');
  return value;
}

const smoothingKinds=new Set<string>(['sma','ema','rsi','obv']);
/** The player-facing name of the RSI smoothing (the common wording); stored keys stay smoothing*. */
export const RSI_MA_NAME='RSI-based MA';
const basePlotIds:Record<IndicatorId,readonly string[]>={volume:['volume','ma'],sma:['sma'],ema:['ema'],rsi:['rsi'],macd:['macd','signal','histogram'],bb:['basis','upper','lower'],vwap:['vwap'],stochastic:['k','d'],atr:['atr'],obv:['obv'],...Object.fromEntries(CATALOG_INDICATORS.map(definition=>[definition.id,definition.plots.map(plot=>plot.id)]))} as unknown as Record<IndicatorId,readonly string[]>;
export const VWAP_BAND_INPUT_KEYS=['bandMode','band1Enabled','band1Multiplier','band2Enabled','band2Multiplier','band3Enabled','band3Multiplier'] as const;
export interface IndicatorVwapBandSettings {bandMode:VwapBandMode;band1Enabled:boolean;band1Multiplier:number;band2Enabled:boolean;band2Multiplier:number;band3Enabled:boolean;band3Multiplier:number}
export const VWAP_BAND_DEFAULTS:Readonly<IndicatorVwapBandSettings>=Object.freeze({bandMode:'Percentage',band1Enabled:false,band1Multiplier:1,band2Enabled:false,band2Multiplier:2,band3Enabled:false,band3Multiplier:3});
/** Omitted legacy tuples stay omitted at their storage boundary; this function only returns effective values. */
export function indicatorVwapBandSettings(inputs:IndicatorInputs):IndicatorVwapBandSettings{
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs)||![Object.prototype,null].includes(Object.getPrototypeOf(inputs))||Reflect.ownKeys(inputs).some(key=>typeof key!=='string'||!Object.hasOwn(Object.getOwnPropertyDescriptor(inputs,key)!,'value')||!Object.getOwnPropertyDescriptor(inputs,key)!.enumerable))throw new Error('VWAP band inputs require plain own data.');
 const count=VWAP_BAND_INPUT_KEYS.filter(key=>Object.hasOwn(inputs,key)).length;
 if(count===0)return {...VWAP_BAND_DEFAULTS};
 if(count!==VWAP_BAND_INPUT_KEYS.length)throw new Error('Every VWAP band input must be explicit, or all omitted for a legacy snapshot.');
 if(!isVwapBandMode(inputs.bandMode))throw new Error('VWAP bands support only the Percentage and Standard Deviation modes.');
 for(const n of [1,2,3] as const){const enabled=inputs[`band${n}Enabled`],multiplier=inputs[`band${n}Multiplier`];if(typeof enabled!=='boolean'||typeof multiplier!=='number'||!Number.isFinite(multiplier)||multiplier<0||multiplier>100000)throw new Error('VWAP bands require explicit booleans and finite multipliers from 0 through 100000.');}
 return Object.fromEntries(VWAP_BAND_INPUT_KEYS.map(key=>[key,inputs[key]])) as unknown as IndicatorVwapBandSettings;
}
/** Absent means off and is never materialized (the VWAP kernel rule); anything but a boolean is refused. */
export function rsiDivergenceEnabled(inputs:IndicatorInputs):boolean{
 if(!Object.hasOwn(inputs,'divergence'))return false;
 if(typeof inputs.divergence!=='boolean')throw new Error('Calculate divergence must be on or off.');
 return inputs.divergence;
}
export function indicatorSmoothingSettings(inputs:IndicatorInputs):{type:IndicatorSmoothingType;length:number;multiplier:number}{
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs)||![Object.prototype,null].includes(Object.getPrototypeOf(inputs))||Reflect.ownKeys(inputs).some(key=>typeof key!=='string'||!Object.hasOwn(Object.getOwnPropertyDescriptor(inputs,key)!,'value')||!Object.getOwnPropertyDescriptor(inputs,key)!.enumerable))throw new Error('Smoothing inputs require plain own data.');
 const type=Object.hasOwn(inputs,'smoothingType')?inputs.smoothingType:'None',period=Object.hasOwn(inputs,'smoothingLength')?inputs.smoothingLength:14,multiplier=Object.hasOwn(inputs,'smoothingMultiplier')?inputs.smoothingMultiplier:2;
 if(typeof type!=='string'||!['None','SMA','SMA+BB','EMA','RMA','WMA','VWMA'].includes(type))throw new Error('Unsupported additional smoothing type.');
 if(typeof period!=='number')throw new Error('Smoothing length must be numeric.');length(period);
 if(typeof multiplier!=='number'||!Number.isFinite(multiplier)||multiplier<0||multiplier>100000)throw new Error('Smoothing band multiplier must be from 0 through 100000.');
 return {type:type as IndicatorSmoothingType,length:period,multiplier};
}
export function indicatorActivePlotIds(kind:IndicatorId,inputs:IndicatorInputs={}):string[]{
 if(!Object.hasOwn(basePlotIds,kind))throw new Error('Unsupported indicator.');
 if(kind==='vwap')indicatorVwapKernelVersion(inputs);else if(Object.hasOwn(inputs,VWAP_KERNEL_INPUT_KEY))throw new Error('Kernel version is available only for VWAP.');
 if(kind==='volume')indicatorVolumeMaType(inputs);
 const plots=[...basePlotIds[kind]];if(smoothingKinds.has(kind)){const smoothing=indicatorSmoothingSettings(inputs);if(smoothing.type!=='None')plots.push('smooth');if(smoothing.type==='SMA+BB')plots.push('smoothUpper','smoothLower');}if(kind==='rsi'&&rsiDivergenceEnabled(inputs))plots.push(...rsiDivergenceSettings(inputs).kinds.map(k=>RSI_DIVERGENCE_PLOT_OF[k]));if(kind==='vwap'){const bands=indicatorVwapBandSettings(inputs);for(const n of [1,2,3] as const)if(bands[`band${n}Enabled`])plots.push(`upper${n}`,`lower${n}`);}return plots;
}
/** Local operation estimate, not a CPU bound; callers add rendering/copying work separately. */
export function indicatorCalculationWork(kind:IndicatorId,barCount:number,inputs:IndicatorInputs={}):number{
 if(!Object.hasOwn(basePlotIds,kind)||!Number.isSafeInteger(barCount)||barCount<0||barCount>100000)throw new Error('Invalid indicator or bar count.');
 if(kind==='vwap')indicatorVwapKernelVersion(inputs);else if(Object.hasOwn(inputs,VWAP_KERNEL_INPUT_KEY))throw new Error('Kernel version is available only for VWAP.');
 const volumeMaType=kind==='volume'?indicatorVolumeMaType(inputs):null;
 const definition=catalogDefinition(kind);if(definition)return barCount*32+definition.work(barCount,key=>catalogInputValue(definition,inputs,key) as number);
 const periods:Partial<Record<IndicatorId,number>>={volume:20,sma:9,ema:9,rsi:14,bb:20,stochastic:14,atr:14};
 const period=inputs.length??periods[kind]??1;if(typeof period!=='number')throw new Error('Length must be numeric.');length(period);
 const windows=Math.max(0,barCount-period+1)*period;let work=barCount*32,smaLegs=0;
 if(kind==='rsi'&&rsiDivergenceEnabled(inputs)){const {policy}=rsiDivergenceSettings(inputs);work+=barCount*(policy.left+policy.right+1)*2;}
 const averageLegs=(type:unknown)=>type==='SMA'?1:type==='VWMA'?2:0;
 if(kind==='sma'||volumeMaType==='SMA')smaLegs++;
 if(kind==='bb'){work+=windows*(inputs.basisType==='WMA'?7:6);smaLegs+=averageLegs(inputs.basisType??'SMA');}
 if(kind==='stochastic')work+=windows*2;
 if(kind==='stochastic')smaLegs+=2;
 if(kind==='macd')smaLegs+=(inputs.oscillatorType==='SMA'?2:0)+(inputs.signalType==='SMA'?1:0);
 if(kind==='atr')smaLegs+=averageLegs(inputs.smoothing??'RMA');
 if(kind==='atr'&&inputs.smoothing==='WMA')work+=windows;
 if(volumeMaType==='WMA')work+=windows;
 if(kind==='vwap'){const bands=indicatorVwapBandSettings(inputs),activePairs=[1,2,3].filter(n=>bands[`band${n}Enabled` as keyof IndicatorVwapBandSettings]).length;work+=barCount*(indicatorVwapKernelVersion(inputs)===2?8+activePairs*8:100+activePairs*64);}
 if(smoothingKinds.has(kind)){
  const smoothing=indicatorSmoothingSettings(inputs),extraWindows=Math.max(0,barCount-smoothing.length+1)*smoothing.length;
  if(smoothing.type!=='None')work+=barCount*16;
  if(smoothing.type==='WMA')work+=extraWindows;
  if(smoothing.type==='SMA+BB')work+=extraWindows*6;
  smaLegs+=smoothing.type==='SMA+BB'?1:averageLegs(smoothing.type);
 }
 return work+barCount*64*smaLegs;
}

/** Version 1 VWAP retains its historical source arithmetic, including its extreme-range gaps. */
function legacySourceValues(bars: readonly Bar[], source: PriceSource): number[] {
  if (!['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'].includes(source)) throw new Error(`Unsupported source: ${source}`);
  return bars.map(bar => source === 'hl2' ? (bar.high + bar.low) / 2 : source === 'hlc3' ? (bar.high + bar.low + bar.close) / 3 : source === 'ohlc4' ? (bar.open + bar.high + bar.low + bar.close) / 4 : bar[source]);
}

function scaledSourceAverage(values:readonly number[],ordinary:number):number{
 if(!values.every(finite))return ordinary;
 const scale=Math.max(...values.map(Math.abs));
 const result=values.reduce((sum,value)=>sum+value/scale,0)/values.length*scale;
 if(!Number.isFinite(result))throw new Error('Source-average arithmetic is unrepresentable; the indicator is unavailable.');
 return result;
}

export function sourceValues(bars: readonly Bar[], source: PriceSource = 'close'): number[] {
 if (!['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'].includes(source)) throw new Error(`Unsupported source: ${source}`);
 const value=sourceValueOf(source);
 return bars.map(bar=>value(bar));
}
/** The per-bar source rule of sourceValues (the branch is chosen once per call; the arithmetic per bar is the same). */
export function sourceValueOf(source:PriceSource):(bar:Bar)=>number{
 if(source==='hl2')return bar=>{const h=bar.high,l=bar.low,result=(h+l)/2;return Number.isFinite(result)?result:scaledSourceAverage([h,l],result);};
 if(source==='hlc3')return bar=>{const h=bar.high,l=bar.low,c=bar.close,result=(h+l+c)/3;return Number.isFinite(result)?result:scaledSourceAverage([h,l,c],result);};
 if(source==='ohlc4')return bar=>{const o=bar.open,h=bar.high,l=bar.low,c=bar.close,result=(o+h+l+c)/4;return Number.isFinite(result)?result:scaledSourceAverage([o,h,l,c],result);};
 return bar=>bar[source];
}

/** Round an exact sum in units 2^-1074 divided by a positive period, nearest/ties-even. */
function exactWindowMean(sum:bigint,period:number):number{
 if(sum===0n)return 0;
 const negative=sum<0n,absolute=negative?-sum:sum,denominator=BigInt(period);
 const bits=absolute.toString(2).length;
 if(bits>2115)throw new Error('SMA exact accumulation exceeded its bounded finite-input range.');
 let exponent=bits-denominator.toString(2).length;
 if(exponent>=0?absolute<(denominator<<BigInt(exponent)):(absolute<<BigInt(-exponent))<denominator)exponent--;
 const shift=Math.max(0,exponent-52),divisor=denominator<<BigInt(shift);
 let quotient=absolute/divisor;
 const remainder=absolute%divisor,twice=remainder*2n;
 if(twice>divisor||(twice===divisor&&(quotient&1n)!==0n))quotient++;
 const value=Number(quotient)*2**(shift-1074);
 if(!Number.isFinite(value))throw new Error('SMA exact mean is unrepresentable; the indicator is unavailable.');
 return negative?-value:value;
}

/**
 * The moving-average kernels are written as steppers: `step` takes one observation and its index, reads earlier
 * observations only through `at`, and keeps everything else it needs in a small state that `copy` duplicates exactly. The
 * array kernels below run their stepper over the whole series, so a caller that saves a copied state after some bar and
 * steps on from it (src/domain/indicator-incremental.ts) performs exactly the operations a full run performs.
 */
export type SeriesAt=(index:number)=>number|null|undefined;
export interface Stepper<S> {create():S;copy(state:S):S;step(state:S,value:number|null|undefined,index:number,at:SeriesAt):number|null}
const coefficientView=new DataView(new ArrayBuffer(8));
/** The exact value of a finite double in units of 2^-1074. */
function exactCoefficient(value:number):bigint{
 coefficientView.setFloat64(0,value,false);
 const bits=coefficientView.getBigUint64(0,false),exponent=Number((bits>>52n)&0x7ffn);
 const mantissa=(bits&0xfffffffffffffn)|(exponent?0x10000000000000n:0n);
 const integer=mantissa<<BigInt(exponent?exponent-1:0);
 return bits>>63n?-integer:integer;
}
interface SmaState {sum:number;correction:number;valid:number;exact:bigint|null}
const smaUnit=(value:number|null|undefined):number|null=>finite(value)?value===0?0:value:null;
/** SMA stepper (period already validated). Period 1 is the exact elementwise copy with -0 as 0. */
export function smaStepper(period:number):Stepper<SmaState>{
 if(period===1)return {create:()=>({sum:0,correction:0,valid:0,exact:null}),copy:state=>({...state}),step:(_state,value)=>smaUnit(value)};
 // Error-free two-component addition (twoSum) inlined, no tuple per bar: sum+value and its error, then the correction plus
 // that error; refused when either step overflows or the correction cannot absorb the error exactly.
 const add=(state:SmaState,value:number):boolean=>{
  const sum=state.sum,correction=state.correction;
  const first=sum+value;if(!Number.isFinite(first))return false;
  const firstVirtual=first-sum,firstError=(sum-(first-firstVirtual))+(value-firstVirtual);if(!Number.isFinite(firstError))return false;
  const second=correction+firstError;if(!Number.isFinite(second))return false;
  const secondVirtual=second-correction,secondError=(correction-(second-secondVirtual))+(firstError-secondVirtual);if(!Number.isFinite(secondError)||secondError!==0)return false;
  state.sum=first;state.correction=second;return true;
 };
 const initialize=(state:SmaState,index:number,at:SeriesAt)=>{
  let exact=0n;
  for(let i=Math.max(0,index-period+1);i<=index;i++){const value=at(i);if(finite(value))exact+=exactCoefficient(value);}
  state.exact=exact;
 };
 return {create:()=>({sum:0,correction:0,valid:0,exact:null}),copy:state=>({...state}),step:(state,value,index,at)=>{
  const old=index>=period?at(index-period):null;
  if(finite(value))state.valid++;
  if(finite(old))state.valid--;
  if(state.exact!==null){if(finite(value))state.exact+=exactCoefficient(value);if(finite(old))state.exact-=exactCoefficient(old);}
  else if((finite(value)&&!add(state,value))||(finite(old)&&!add(state,-old)))initialize(state,index,at);
  if(index<period-1||state.valid!==period)return null;
  if(state.exact===null&&!Number.isFinite(state.sum+state.correction))initialize(state,index,at);
  return state.exact===null?(state.sum+state.correction)/period:exactWindowMean(state.exact,period);
 }};
}
function runStepper<S>(stepper:Stepper<S>,values:Values):NumericSeries{
 const state=stepper.create(),at:SeriesAt=index=>values[index];
 return values.map((value,index)=>stepper.step(state,value,index,at));
}
/** Full finite windows only. At most one exact-window initialization; no adaptive rescans. */
export function sma(values: Values, period: number): NumericSeries {
  length(period);
  if(!Number.isSafeInteger(values.length)||values.length>100000)throw new RangeError('SMA accepts at most 100000 observations.');
  if(period===1)return values.map(value=>smaUnit(value));
  return runStepper(smaStepper(period),values);
}

/** EMA stepper (period already validated). smaSeed: the EMA is seeded by the mean of its first
 * period finite values, so EMA 9 is unavailable on bars 0-7 and starts on bar 8 at the SMA 9, and MACD 12/26/9 starts on
 * bar 25 with the signal on bar 33. The SMA seed is the consensus convention every EMA-based indicator uses: StockCharts
 * ChartSchool ("Moving Averages": a simple moving average is used as the previous period's EMA in the first
 * calculation), TA-Lib (TA_EMA, default classic seed = SMA of the first period values) and Wilder's own RMA seed. The
 * first-value seed (smaSeed false) is kept only for the exported ema() kernel, which no indicator uses. */
export function emaStepper(period:number,smaSeed=false):Stepper<{previous:number|null;sum:number;count:number}>{
 const alpha = 2 / (period + 1);
 return {create:()=>({previous:null,sum:0,count:0}),copy:state=>({...state}),step:(state,value)=>{
  if (!finite(value)) return null;
  if (state.previous === null && smaSeed) { state.sum += value; state.count++; if (state.count === period) state.previous = state.sum / period; return state.previous; }
  state.previous = state.previous === null ? value : alpha * value + (1 - alpha) * state.previous;
  return state.previous;
 }};
}
/** First-finite-value seed. No indicator uses it (every EMA takes emaSmaSeed); missing values emit null and retain the
 * accumulator. */
export function ema(values: Values, period: number): NumericSeries {
  length(period);
  return runStepper(emaStepper(period),values);
}
/** The SMA-seeded EMA, unavailable until period finite values, then seeded by their mean (as rma). Used by every EMA in
 * the app: the EMA and MACD indicators, the EMA choice of each MA type input and every catalog kind (the toolkit's ema). */
export function emaSmaSeed(values: Values, period: number): NumericSeries {
  length(period);
  return runStepper(emaStepper(period,true),values);
}

/** RMA stepper (period already validated). */
export function rmaStepper(period:number):Stepper<{sum:number;count:number;previous:number|null}>{
 return {create:()=>({sum:0,count:0,previous:null}),copy:state=>({...state}),step:(state,value)=>{
  if (!finite(value)) return null;
  if (state.previous === null) {
   state.sum += value; state.count++;
   if (state.count === period) state.previous = state.sum / period;
   return state.previous;
  }
  state.previous = (state.previous * (period - 1) + value) / period;
  return state.previous;
 }};
}
/** Wilder average, seeded by the mean of the first period finite observations. */
export function rma(values: Values, period: number): NumericSeries {
  length(period);
  return runStepper(rmaStepper(period),values);
}

/** WMA stepper (period already validated): no state, each value reads its own window. */
export function wmaStepper(period:number):Stepper<null>{
 const denominator = period * (period + 1) / 2;
 return {create:()=>null,copy:()=>null,step:(_state,_value,index,at)=>{
  if (index < period - 1) return null;
  let sum = 0;
  for (let k = 0; k < period; k++) { const value = at(index - period + 1 + k); if (!finite(value)) return null; sum += value * (k + 1); }
  return sum / denominator;
 }};
}
export function wma(values: Values, period: number): NumericSeries {
  length(period);
  return runStepper(wmaStepper(period),values);
}

export function vwma(values: Values, volumes: Values, period: number): NumericSeries {
  if (values.length !== volumes.length) throw new Error('Price and volume lengths differ.');
  const weighted = values.map((v, i) => {if(!finite(v)||!finite(volumes[i]))return null;const product=v*(volumes[i] as number);if(!Number.isFinite(product))throw new Error('Volume-weighted arithmetic overflowed; VWMA is unavailable.');return product;});
  const numerator = sma(weighted, period), denominator = sma(volumes, period);
  if(numerator.some(value=>value!==null&&!finite(value))||denominator.some(value=>value!==null&&!finite(value)))throw new Error('Volume-weighted accumulation overflowed; VWMA is unavailable.');
  return numerator.map((v, i) => finite(v) && finite(denominator[i]) && denominator[i] !== 0 ? v / (denominator[i] as number) : null);
}

export function movingAverage(values: Values, period: number, kind: MovingAverageType = 'SMA', volumes?: Values): NumericSeries {
  if (kind === 'SMA') return sma(values, period);
  // The EMA choice of every MA type input (Volume MA, ATR smoothing, BB basis, additional smoothing) is SMA-seeded like the
  // EMA indicator (see emaStepper); indicator-incremental.ts and the dialog warm-up model mirror it.
  if (kind === 'EMA') return emaSmaSeed(values, period);
  if (kind === 'RMA') return rma(values, period);
  if (kind === 'WMA') return wma(values, period);
  if (kind === 'VWMA' && volumes) return vwma(values, volumes, period);
  throw new Error(`Unsupported or unavailable moving average: ${kind}`);
}

/** The per-bar RSI, MACD and band expressions, shared by the full kernels below and the
 * incremental engine (src/domain/indicator-incremental.ts), so both paths compute every branch with the same code. */
export function rsiGainAt(i: number, value: number | null | undefined, prior: number | null | undefined): number | null {
  return i && finite(value) && finite(prior) ? Math.max(value - prior, 0) : null;
}
export function rsiLossAt(i: number, value: number | null | undefined, prior: number | null | undefined): number | null {
  return i && finite(value) && finite(prior) ? Math.max(prior - value, 0) : null;
}
export function rsiValue(gain: number | null | undefined, loss: number | null | undefined): number | null {
  if (!finite(gain) || !finite(loss)) return null;
  if (gain === 0 && loss === 0) return null; // 0/0: Wilder's RS is undefined; references disagree (TA-Lib 0, some charting tools 100), so it stays unavailable.
  if (loss === 0) return 100;
  if (gain === 0) return 0;
  return 100 - 100 / (1 + gain / loss);
}
/** a - b when both are finite (the MACD line and histogram). */
export function finiteDifference(a: number | null | undefined, b: number | null | undefined): number | null {
  return finite(a) && finite(b) ? a - b : null;
}
export function bandUpper(basis: number | null | undefined, deviation: number | null | undefined, multiplier: number): number | null {
  return finite(basis) && finite(deviation) ? basis + multiplier * deviation : null;
}
export function bandLower(basis: number | null | undefined, deviation: number | null | undefined, multiplier: number): number | null {
  return finite(basis) && finite(deviation) ? basis - multiplier * deviation : null;
}
export function rsi(values: Values, period = 14): NumericSeries {
  const gains = values.map((value, i) => rsiGainAt(i, value, values[i - 1]));
  const losses = values.map((value, i) => rsiLossAt(i, value, values[i - 1]));
  const up = rma(gains, period), down = rma(losses, period);
  return up.map((gain, i) => rsiValue(gain, down[i]));
}

export function macd(values: Values, fast = 12, slow = 26, signalPeriod = 9, oscillatorType: 'EMA' | 'SMA' = 'EMA', signalType: 'EMA' | 'SMA' = 'EMA') {
  // EMA averages use the SMA seed (the MACD line starts on bar slow-1, the signal signal-1 bars later).
  const average = (series: Values, period: number, kind: 'EMA' | 'SMA') => kind === 'EMA' ? emaSmaSeed(series, period) : movingAverage(series, period, kind);
  const a = average(values, fast, oscillatorType), b = average(values, slow, oscillatorType);
  const line = a.map((value, i) => finiteDifference(value, b[i]));
  const signal = average(line, signalPeriod, signalType);
  const histogram = line.map((value, i) => finiteDifference(value, signal[i]));
  return { line, signal, histogram };
}

/** Two-pass population variance avoids catastrophic sum-of-squares cancellation. */
export function standardDeviation(values: Values, period: number): NumericSeries {
  length(period);
  return values.map((_, index) => index < period - 1 ? null : windowDeviation(values.slice(index - period + 1, index + 1), period));
}
/** One value of standardDeviation from its window (the incremental engine passes the same window values). */
export function windowDeviation(window: readonly (number|null|undefined)[], period: number): number|null {
  {
    if (!window.every(finite)) return null;
    const origin = window[0] as number;
    let scale=0;
    const meanOffset = (window as number[]).reduce((sum, value) => {const offset=value-origin;scale=Math.max(scale,Math.abs(offset));return sum+offset;}, 0) / period;
    const variance = (window as number[]).reduce((sum, value) => sum + ((value - origin) - meanOffset) ** 2, 0) / period;
    if(!Number.isFinite(meanOffset)||!Number.isFinite(variance))throw new Error('Standard-deviation arithmetic overflowed; the bands are unavailable.');
    if(scale>0&&variance<2**-1022){
      const normalizedMean=(window as number[]).reduce((sum,value)=>sum+(value-origin)/scale,0)/period;
      const normalizedVariance=(window as number[]).reduce((sum,value)=>sum+((value-origin)/scale-normalizedMean)**2,0)/period;
      const deviation=Math.sqrt(normalizedVariance)*scale;
      if(deviation===0)throw new Error('Positive standard deviation underflowed; the bands are unavailable.');
      if(!Number.isFinite(deviation))throw new Error('Standard-deviation arithmetic is unrepresentable; the bands are unavailable.');
      return deviation;
    }
    return Math.sqrt(Math.max(0, variance));
  }
}

export function bollingerBands(values: Values, period = 20, multiplier = 2, basisType: MovingAverageType = 'SMA', volumes?: Values) {
  if (!Number.isFinite(multiplier) || multiplier < 0) throw new RangeError('Band multiplier must be finite and nonnegative.');
  const basis = movingAverage(values, period, basisType, volumes), deviation = standardDeviation(values, period);
  const upper = basis.map((value, i) => bandUpper(value, deviation[i], multiplier));
  const lower = basis.map((value, i) => bandLower(value, deviation[i], multiplier));
  return { basis, upper, lower };
}

export function trueRange(bars: readonly Bar[]): NumericSeries {
  return bars.map((bar, i) => trueRangeAt(bar, i, bars));
}
/** One trueRange value (shared with the incremental engine). */
export function trueRangeAt(bar: Bar, i: number, bars: readonly Bar[]): number {
  return i ? Math.max(bar.high - bar.low, Math.abs(bar.high - bars[i - 1].close), Math.abs(bar.low - bars[i - 1].close)) : bar.high - bar.low;
}

export function atr(bars: readonly Bar[], period = 14, smoothing: MovingAverageType = 'RMA'): NumericSeries {
  return movingAverage(trueRange(bars), period, smoothing, bars.map(b => b.volume));
}

export function stochastic(bars: readonly Bar[], period = 14, smoothK = 3, smoothD = 3) {
  length(period);
  const raw = bars.map((bar, index) => stochasticRawAt(bar, index, bars, period));
  const k = sma(raw, smoothK), d = sma(k, smoothD);
  return { k, d };
}
/** One raw %K value of stochastic (shared with the incremental engine; period already validated). */
export function stochasticRawAt(bar: Bar, index: number, bars: readonly Bar[], period: number): number | null {
  {
    if (index < period - 1) return null;
    let high = -Infinity, low = Infinity;
    for (let i = index - period + 1; i <= index; i++) { high = Math.max(high, bars[i].high); low = Math.min(low, bars[i].low); }
    if(!finite(high)||!finite(low)||!finite(bar.close)||high===low)return null;
    const numerator=bar.close-low,denominator=high-low;
    if(!Number.isFinite(numerator)||!Number.isFinite(denominator))throw new Error('Stochastic range arithmetic overflowed; the indicator is unavailable.');
    const scaled=100*numerator,result=Number.isFinite(scaled)?scaled/denominator:numerator/denominator*100;
    if(!Number.isFinite(result))throw new Error('Stochastic ratio arithmetic is unrepresentable; the indicator is unavailable.');
    return result;
  }
}

/** OBV (close above/below/equal to the prior close adds/subtracts/keeps the current volume).
 * LV policies (the standard definition states neither): the first valid bar seeds 0; a bar whose close or volume is missing is
 * unavailable (null, never a carried total or zero), and the next valid bar resumes with "Previous OBV" and
 * "Prior Closing Price" both taken from the most recent valid bar. */
export function obv(bars: readonly Bar[], source: PriceSource = 'close'): NumericSeries {
  const state: ObvState = { accumulator: 0, priorClose: null }, price = sourceValueOf(source);
  return bars.map(bar => obvStep(state, bar, price(bar)));
}
export interface ObvState { accumulator: number; priorClose: number | null }
/** One OBV step (shared with the incremental engine). `price` is the selected Source value (default close); the field name priorClose holds the prior Source value. */
export function obvStep(state: ObvState, bar: Bar, price: number = bar.close): number | null {
  if (!finite(price) || !finite(bar.volume) || bar.volume < 0) return null;
  if (state.priorClose !== null && price > state.priorClose) state.accumulator += bar.volume;
  else if (state.priorClose !== null && price < state.priorClose) state.accumulator -= bar.volume;
  state.priorClose = price;
  return state.accumulator;
}

export function vwap(bars: readonly Bar[], sessions?: readonly string[], source: PriceSource = 'hlc3'): NumericSeries {
  if (sessions && sessions.length !== bars.length) throw new Error('Anchor keys must match bar count.');
  const prices = legacySourceValues(bars, source);
  let cumulativeVolume = 0, weighted = 0, lastKey: string | undefined;
  return bars.map((bar, i) => {
    const key = sessions?.[i] ?? 'all';
    if (key !== lastKey) { cumulativeVolume = 0; weighted = 0; lastKey = key; }
    if (!finite(bar.volume) || bar.volume < 0 || !finite(prices[i])) return null;
    cumulativeVolume += bar.volume;
    weighted += prices[i] * bar.volume;
    return cumulativeVolume === 0 ? null : weighted / cumulativeVolume;
  });
}

/** The VWAP anchor time zone. 'Exchange' (the new-instance default; src/vwap/settings.ts resolves it the same way for kernel 2) is the source exchange zone, so a US equity session
 * day runs on New York dates and after-hours bars stay in their session; 24/7 (UTC calendar) sources and sources without
 * a declared zone use UTC 00:00. A saved explicit zone (older instances were saved with 'UTC') is used as is. */
export const VWAP_EXCHANGE_ZONE='Exchange';
export function vwapAnchorZone(timezone:unknown,options:Pick<IndicatorCalculationOptions,'exchangeZone'|'calendar'>={}):string{
 const zone=String(timezone??'UTC');if(zone!==VWAP_EXCHANGE_ZONE)return zone;
 const exchange=options.exchangeZone;if(options.calendar==='utc'||typeof exchange!=='string'||!exchange.trim())return 'UTC';
 try{new Intl.DateTimeFormat('en',{timeZone:exchange});return exchange;}catch{return 'UTC';}
}
/** The VWAP period key of every bar (a key change is an anchor reset). Display code uses it to break the line at a reset. */
export function vwapAnchorKeys(bars: readonly Bar[], anchor: string, timezone: string, events?: readonly VwapEventDate[] | null): string[] { return anchorKeys(bars, anchor, timezone, events); }
function anchorKeys(bars: readonly Bar[], anchor: string, timezone: string, events?: readonly VwapEventDate[] | null): string[] {
  // Dividends and Splits periods start at the corporate-action ex-dates (vwap-event-anchors.ts).
  if (isVwapEventAnchor(anchor)) return vwapEventAnchorKeys(bars, anchor, events);
  if (!['Session', 'Week', 'Month', 'Quarter', 'Year', 'Decade', 'Century'].includes(anchor)) throw new Error(`Anchor ${anchor} requires corporate-event data and is unavailable for this dataset.`);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return bars.map(bar => {
    const parts = Object.fromEntries(formatter.formatToParts(bar.time * 1000).map(p => [p.type, p.value]));
    const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day);
    if (anchor === 'Year') return String(year);
    if (anchor === 'Decade') return String(Math.floor(year / 10));
    if (anchor === 'Century') return String(Math.floor(year / 100));
    if (anchor === 'Quarter') return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
    if (anchor === 'Month') return `${year}-${month}`;
    const date=new Date(0);date.setUTCFullYear(year,month-1,day);date.setUTCHours(0,0,0,0);const midnight=date.getTime();
    if (anchor === 'Week') return String(midnight - ((new Date(midnight).getUTCDay() + 6) % 7) * 86400000);
    return `${year}-${month}-${day}`;
  });
}

/** sourceValues supplies the calculated plot an indicator-on-indicator Source input refers to. */
/** resolution/calendar: the chart's declared interval and session calendar (used by pivots); absent or null = unknown, and
 * the kind falls back to the bars. Other kinds ignore them. */
/** VisibleRange (seconds), tickSize and lowerTimeframe feed the profile kinds only; absent or null = unknown. */
export interface IndicatorCalculationOptions {sourceValues?:NumericSeries;resolution?:string|null;calendar?:'us-equity'|'utc'|null;visibleRange?:{from:number;to:number}|null;tickSize?:number|null;exchangeZone?:string|null;style?:string|null;lowerTimeframe?:LowerTimeframeBars|null;
  /** The chart's on-demand finer-bar lookup for the profile kinds; absent = none (alerts, tests). */
  finerBars?:FinerBarsLookup|null;
  /** The second-symbol lookup for two-symbol kinds; absent = the application loader (second-symbol.ts) at `resolution`. */
  secondSeries?:(symbol:string)=>SecondSeries;
  /** The symbol's split and dividend ex-dates for the VWAP Dividends and Splits anchors; absent or null = not loaded. */
  corporateActions?:readonly VwapEventDate[]|null}
// The toolkit ema is the SMA-seeded EMA (the consensus seed, see emaStepper), so every catalog EMA matches the EMA indicator.
const CATALOG_TOOLKIT:CatalogToolkit={sma,ema:emaSmaSeed,emaSmaSeed,rma,wma,rsi:(values,period)=>rsi(values,period),trueRange};
export function calculateIndicator(id: IndicatorId | string, bars: readonly Bar[], inputs: IndicatorInputs = {}, options: IndicatorCalculationOptions = {}): IndicatorResult {
  const result: IndicatorResult = { id, series: [], diagnostics: [], policies: ['EMA averages use an SMA seed (StockCharts, TA-Lib); RMA uses initial SMA; missing values remain gaps.', 'Offsets belong to rendering and never change signal values.'] };
  const num = (key: string, fallback: number) => { const v = Object.hasOwn(inputs,key)?inputs[key]:fallback; if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${key} must be a finite number.`); return v; };
  const plot = (key: string, label: string, values: NumericSeries) => {if(values.some(value=>value!==null&&!finite(value)))throw new Error(`The ${key} calculation overflowed or has an invalid numeric input.`);result.series.push({ id: key, label, values });};
  try {
    if(!inputs||typeof inputs!=='object'||Array.isArray(inputs)||![Object.prototype,null].includes(Object.getPrototypeOf(inputs))||Reflect.ownKeys(inputs).some(key=>typeof key!=='string'||!Object.hasOwn(Object.getOwnPropertyDescriptor(inputs,key)!,'value')||!Object.getOwnPropertyDescriptor(inputs,key)!.enumerable))throw new Error('Indicator inputs must be plain own data without hidden fields or accessors.');
    const kind=(id==='stoch'?'stochastic':id.toLowerCase()) as IndicatorId;
    const allowed:Record<IndicatorId,readonly string[]>={volume:['length','maType'],sma:['length','source'],ema:['length','source'],rsi:['length','source','divergence',...RSI_DIVERGENCE_INPUT_KEYS],macd:['source','fast','slow','signal','oscillatorType','signalType'],bb:['source','length','multiplier','basisType','colorByExpansion'],vwap:['source','anchor','timezone',VWAP_KERNEL_INPUT_KEY,...VWAP_BAND_INPUT_KEYS],stochastic:['length','smoothK','smoothD'],atr:['length','smoothing'],obv:['source'],...Object.fromEntries(CATALOG_INDICATORS.map(definition=>[definition.id,[...definition.inputs,...definition.retiredInputs??[]].map(input=>input.key)]))} as unknown as Record<IndicatorId,readonly string[]>;// retired catalog inputs stay calculable for stored state
    if(!Object.hasOwn(allowed,kind)||Object.keys(inputs).some(key=>!allowed[kind].includes(key)&&!(smoothingKinds.has(kind)&&['smoothingType','smoothingLength','smoothingMultiplier'].includes(key))))throw new Error('Unsupported indicator calculation input.');
    if(kind==='vwap'&&indicatorVwapKernelVersion(inputs)===2){indicatorVwapBandSettings(inputs);throw new Error('VWAP kernel 2 requires the owned asynchronous worker service; no synchronous or legacy fallback was run.');}
    const work=indicatorCalculationWork(kind,bars.length,inputs);if(work>20000000)throw new Error(`Indicator calculation requires ${work} estimated operations, above the local 20000000 limit.`);
    // An omitted Source is the kind's own default (hlc3 for CCI, hl2 for Median, ohlc4 for TWAP...), not close, so alerts,
    // scripts and partial inputs calculate what a new instance shows.
    const rawSource=Object.hasOwn(inputs,'source')?inputs.source:(catalogDefinition(kind)?.inputs.find(input=>input.key==='source')?.defval??'close'),reference=parseIndicatorSource(rawSource);
    if(reference){if(!INDICATOR_SOURCE_KINDS.includes(kind))throw new Error('This indicator does not accept another indicator as its source.');if(!options.sourceValues)throw new Error('The selected source indicator is unavailable.');if(!Array.isArray(options.sourceValues)||options.sourceValues.length!==bars.length)throw new Error('The source indicator series does not match the chart bars.');}
    const source = (reference?'close':rawSource) as PriceSource;
    if(source!==undefined&&!['open','high','low','close','hl2','hlc3','ohlc4'].includes(source))throw new Error(`Unsupported source: ${source}`);
    // A bar with missing or negative volume is unavailable at that bar only (the obvStep rule); the next valid bar resumes.
    // Only a series with no usable volume at all is refused.
    const validVolume=(value:number)=>finite(value)&&value>=0,volumes:NumericSeries = bars.map(b => validVolume(b.volume)?b.volume:null),volumeGaps=volumes.some(value=>value===null),noVolume=volumes.length>0&&volumes.every(value=>value===null);
    if((['volume','vwap','obv'].includes(kind)||inputs.basisType==='VWMA')&&noVolume)throw new Error('This base indicator requires available nonnegative source volume.');
    const values:readonly (number|null)[] = ['sma','ema','rsi','macd','bb'].includes(kind)?(reference?options.sourceValues!.map(value=>finite(value)?value:null):sourceValues(bars, source)):[];
    const definition=catalogDefinition(kind);
    if(definition){
      if(definition.requiresVolume&&noVolume)throw new Error('This base indicator requires available nonnegative source volume.');
      // Bar-wise volume kinds with gaps run on the bars that have volume and the gap bars stay unavailable (the obvStep rule:
      // the next valid bar resumes from the last valid one). Profile, finer-bar and other chart-context kinds keep the
      // whole-series volume requirement, since their geometry is tied to every chart bar.
      const compactable=!definition.profile&&!definition.viewport&&!definition.finerBars&&!definition.dailyHistory&&!definition.projects&&!definition.pattern&&!definition.tradingSessions&&!definition.secondSymbol;
      if(definition.requiresVolume&&volumeGaps&&!compactable)throw new Error('This base indicator requires available nonnegative source volume.');
      const kept=definition.requiresVolume&&volumeGaps&&!definition.keepsVolumeGaps?volumes.flatMap((value,i)=>value===null?[]:[i]):null;
      const hasSource=definition.inputs.some(input=>input.key==='source'),fullSeries:readonly (number|null)[]=!hasSource?[]:reference?options.sourceValues!.map(value=>finite(value)?value:null):sourceValues(bars,source),series=kept&&hasSource?kept.map(i=>fullSeries[i]):fullSeries,calcBars=kept?kept.map(i=>bars[i]):bars;
      const resolution=options.resolution??null,calendar=options.calendar??null;
      if(resolution!==null&&(typeof resolution!=='string'||resolution.length>40)||calendar!==null&&calendar!=='us-equity'&&calendar!=='utc')throw new Error('The chart resolution or session calendar supplied to the calculation is invalid.');
      const visibleRange=options.visibleRange??null,tickSize=options.tickSize??null,lowerTimeframe=options.lowerTimeframe??null,finerBars=options.finerBars??null;
      if(visibleRange!==null&&!(typeof visibleRange==='object'&&Number.isFinite(visibleRange.from)&&Number.isFinite(visibleRange.to))||tickSize!==null&&!(typeof tickSize==='number'&&Number.isFinite(tickSize)&&tickSize>0)||lowerTimeframe!==null&&!(typeof lowerTimeframe==='object'&&typeof lowerTimeframe.interval==='string'&&Array.isArray(lowerTimeframe.bars))||finerBars!==null&&typeof finerBars!=='function')throw new Error('The visible range, tick size or lower-timeframe bars supplied to the calculation are invalid.');
      const raw=definition.calculate({diagnostic:message=>{result.diagnostics.push(message);},bars:calcBars,source:series,num:key=>catalogInputValue(definition,inputs,key) as number,bool:key=>catalogInputValue(definition,inputs,key) as boolean,str:key=>catalogInputValue(definition,inputs,key) as string,has:key=>Object.hasOwn(inputs,key),tk:CATALOG_TOOLKIT,chart:{resolution,calendar,...(definition.tradingSessions?{exchangeZone:options.exchangeZone??null,style:options.style??null,tickSize}:{}),...((definition.profile||definition.viewport||definition.finerBars||definition.dailyHistory)?{visibleRange,tickSize,lowerTimeframe,...(finerBars?{finerBars}:{})}:{}),...(definition.secondSymbol?{secondSeries:options.secondSeries??((symbol:string)=>secondSymbolSeries(symbol,resolution))}:{})},...(definition.tradingSessions?{sessions:(value:readonly Readonly<TradingSessionRecord>[])=>{result.sessions=value;}}:{}),...(definition.profile?{profiles:(value:readonly VolumeProfile[])=>{result.profiles=value;}}:{}),...(definition.projects?{projection:(value:Record<string,NumericSeries>)=>{result.projection=validProjection(definition.plots.map(item=>item.id),value);}}:{}),...(definition.pattern?{marks:(value:PatternMarks)=>{result.marks=validPatternMarks(value,bars.length,definition.plots.map(item=>item.id));}}:{})});
      const output:Record<string,NumericSeries>=kept?Object.fromEntries(definition.plots.map(item=>{const full:(number|null)[]=Array(bars.length).fill(null),values=raw[item.id];if(values)kept.forEach((index,j)=>{full[index]=values[j]??null;});return [item.id,full];})):raw;
      for(const item of definition.plots)plot(item.id,item.label,output[item.id]);result.policies.push(...definition.policies);
      if(kept)result.policies.push('Bars with missing volume are unavailable; the calculation resumes from the last bar with volume.');
    }else switch (id.toLowerCase()) {
      case 'volume': plot('volume', 'Volume', volumes); plot('ma', 'Volume MA', movingAverage(volumes, num('length', 20),indicatorVolumeMaType(inputs))); result.policies.push('Volume MA20 is an OpenCandle default; current reference default remains unverified.'); break;
      case 'sma': plot('sma', 'SMA', sma(values, num('length', 9))); break;
      case 'ema': plot('ema', 'EMA', emaSmaSeed(values, num('length', 9))); break;
      case 'rsi': plot('rsi', 'RSI', rsi(values, num('length', 14))); result.policies.push('Flat RSI with zero gain and loss is unavailable, not an invented midpoint.'); break;
      case 'macd': { const m = macd(values, num('fast', 12), num('slow', 26), num('signal', 9), (inputs.oscillatorType ?? 'EMA') as 'EMA' | 'SMA', (inputs.signalType ?? 'EMA') as 'EMA' | 'SMA'); plot('macd', 'MACD', m.line); plot('signal', 'Signal', m.signal); plot('histogram', 'Histogram', m.histogram); break; }
      case 'bb': { const b = bollingerBands(values, num('length', 20), num('multiplier', 2), (inputs.basisType ?? 'SMA') as MovingAverageType, volumes); plot('basis', 'Basis', b.basis); plot('upper', 'Upper', b.upper); plot('lower', 'Lower', b.lower); result.policies.push('Population standard deviation; independent reference comparison pending.','Basis MA type changes only the middle line: the bands are the basis plus or minus the standard deviation of the source over the same Length window around its simple average (TA-Lib BBANDS convention).'); break; }
      case 'vwap': {
        const bands=indicatorVwapBandSettings(inputs),keys=anchorKeys(bars,String(inputs.anchor??'Session'),vwapAnchorZone(inputs.timezone,options),options.corporateActions),base=vwap(bars,keys,(inputs.source??'hlc3') as PriceSource);plot('vwap','VWAP',base);
        // Standard Deviation mode (src/domain/vwap-stdev-bands.ts).
        const deviation=bands.bandMode==='Standard Deviation'?vwapDeviationSeries(legacySourceValues(bars,(inputs.source??'hlc3') as PriceSource),bars.map(bar=>bar.volume),keys):null;if(deviation)result.policies.push(VWAP_STDEV_POLICY);
        for(const n of [1,2,3] as const)if(bands[`band${n}Enabled`]){
          const upper:NumericSeries=[],lower:NumericSeries=[];let failure:string|null=null;
          for(const [i,value] of base.entries()){if(value===null){upper.push(null);lower.push(null);continue;}try{const pair=deviation?vwapDeviationBounds(value,deviation[i],bands[`band${n}Multiplier`]):vwapPercentageBounds(value,bands[`band${n}Multiplier`]);upper.push(pair?pair.upper:null);lower.push(pair?pair.lower:null);}catch(cause){failure??=(cause instanceof Error?cause.message:String(cause)).slice(0,1000);upper.push(null);lower.push(null);}}
          if(failure){result.plotDiagnostics??={};result.plotDiagnostics[`upper${n}`]=[failure];result.plotDiagnostics[`lower${n}`]=[failure];}
          plot(`upper${n}`,`Upper band ${n}`,upper);plot(`lower${n}`,`Lower band ${n}`,lower);
        }
        result.policies.push('Session anchor uses calendar date in the supplied timezone; overnight exchange sessions require explicit session keys. Percentage distance uses abs(VWAP) times the multiplier divided by 100, including negative bases under an explicit OpenCandle policy. A nonrepresentable pair is unavailable; the base and other pairs remain. Earnings anchors and independent timeframes are unavailable; Dividends and Splits anchors start at the ex-dates of the symbol.');break;
      }
      case 'stochastic': case 'stoch': { const s = stochastic(bars, num('length', 14), num('smoothK', 3), num('smoothD', 3)); plot('k', '%K', s.k); plot('d', '%D', s.d); break; }
      case 'atr': plot('atr', 'ATR', atr(bars, num('length', 14), (inputs.smoothing ?? 'RMA') as MovingAverageType)); break;
      case 'obv': plot('obv', 'OBV', obv(bars, source)); result.policies.push('OBV starts at zero; absolute seed reference comparison pending. A bar with a missing close is unavailable; the next valid bar resumes from the last valid total and close.'); break;
      default: throw new Error(`Unsupported indicator: ${id}`);
    }
    if(smoothingKinds.has(kind)){
      const smoothing=indicatorSmoothingSettings(inputs),rsiMa=kind==='rsi';// The RSI smoothing is named RSI-based MA (labels only; ids unchanged)
      if(smoothing.type!=='None'){
        const ids=smoothing.type==='SMA+BB'?['smooth','smoothUpper','smoothLower']:['smooth'];
        try{
          if(smoothing.type==='VWMA'&&noVolume)throw new Error('VWMA smoothing requires available nonnegative volume; the base indicator is unchanged.');
          const base=result.series[0].values;
          if(smoothing.type==='SMA+BB'){const bands=bollingerBands(base,smoothing.length,smoothing.multiplier);plot('smooth',rsiMa?RSI_MA_NAME:'Smoothing SMA',bands.basis);plot('smoothUpper',rsiMa?RSI_MA_NAME+' upper band':'Smoothing upper band',bands.upper);plot('smoothLower',rsiMa?RSI_MA_NAME+' lower band':'Smoothing lower band',bands.lower);}
          else plot('smooth',rsiMa?RSI_MA_NAME:`Smoothing ${smoothing.type}`,movingAverage(base,smoothing.length,smoothing.type,volumes));
        }catch(cause){
          result.series=result.series.filter(series=>!ids.includes(series.id));result.plotDiagnostics??={};const message=(cause instanceof Error?cause.message:String(cause)).slice(0,1000);
          for(const key of ids){result.series.push({id:key,label:(rsiMa?RSI_MA_NAME:'Smoothing')+(key==='smooth'?'':key==='smoothUpper'?' upper band':' lower band'),values:Array(bars.length).fill(null)});result.plotDiagnostics[key]=[message];}
        }
      }
      result.policies.push('Additional smoothing uses the unshifted base series. None is an explicit OpenCandle default; per-indicator reference defaults remain unverified. Smoothing bands use population deviation of the base series.');
    }
    if(kind==='rsi'&&rsiDivergenceEnabled(inputs)){
      const settings=rsiDivergenceSettings(inputs),{policy}=settings,found=rsiDivergence(result.series[0].values,bars,policy,{kinds:settings.kinds,bodyOnly:settings.bodyOnly});
      for(const k of settings.kinds)plot(RSI_DIVERGENCE_PLOT_OF[k],RSI_DIVERGENCE_TITLES[k],found[k]);result.divergence={segments:found.segments};
      result.policies.push(`${RSI_DIVERGENCE_POLICY_ID}: OpenCandle RSI divergence rule. Pivots need ${policy.left} bars on the left and ${policy.right} on the right; compared pivots are ${policy.minBetween} to ${policy.maxBetween} bars apart; equal values never qualify; a divergence is reported on the bar where the right confirmation completes.`);
    }
  } catch (cause) { result.series = []; delete result.profiles; delete result.projection; delete result.marks; delete result.sessions; result.diagnostics.push(cause instanceof Error ? cause.message : String(cause)); }
  return result;
}
