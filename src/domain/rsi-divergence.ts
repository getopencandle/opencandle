import type {Bar,NumericSeries} from './types';

/**
 * Divergence rule (internal label; never shown to a player). Pivots on RSI confirmed by LEFT
 * bars on the left and RIGHT bars on the right; each pivot is compared only with the immediately preceding pivot of the
 * same side, when the bars strictly between the two pivots number MIN_BETWEEN through MAX_BETWEEN.
 * Regular bullish: lower price low with a higher RSI low. Regular bearish: higher price high with a lower RSI high.
 * Hidden bullish: higher price low with a lower RSI low. Hidden bearish: lower price high with a higher RSI high.
 * Equal values never qualify. A divergence is reported on the bar where the right confirmation completes, never earlier.
 * The default policy is 5 left, 5 right, 5 to 60 between; the
 * values are editable inputs. "Candle body only" uses min/max(open, close) instead of the wick.
 */
export const RSI_DIVERGENCE_POLICY=Object.freeze({left:5,right:5,minBetween:5,maxBetween:60});
export type RsiDivergencePolicy={left:number;right:number;minBetween:number;maxBetween:number};
export const RSI_DIVERGENCE_POLICY_ID='INDREST-DD-1';
export const RSI_DIVERGENCE_TOOLTIP='Divergence uses OpenCandle pivot rules (5 bars each side, 5 to 60 bars apart).';
export const RSI_DIVERGENCE_KINDS=Object.freeze(['bullish','bearish','hiddenBullish','hiddenBearish'] as const);
export type RsiDivergenceKind=typeof RSI_DIVERGENCE_KINDS[number];
/** Plot id per kind; the order is the plot order (appended after the original two, so native ordinals stay stable). */
export const RSI_DIVERGENCE_PLOT_OF:Readonly<Record<RsiDivergenceKind,string>>=Object.freeze({bullish:'divergenceBullish',bearish:'divergenceBearish',hiddenBullish:'divergenceHiddenBullish',hiddenBearish:'divergenceHiddenBearish'});
export const RSI_DIVERGENCE_PLOTS=Object.freeze(RSI_DIVERGENCE_KINDS.map(kind=>RSI_DIVERGENCE_PLOT_OF[kind]));
export const RSI_DIVERGENCE_TITLES:Readonly<Record<RsiDivergenceKind,string>>=Object.freeze({bullish:'Bullish divergence',bearish:'Bearish divergence',hiddenBullish:'Hidden bullish divergence',hiddenBearish:'Hidden bearish divergence'});
/** Chart label text per kind (LV wording). */
export const RSI_DIVERGENCE_LABELS:Readonly<Record<RsiDivergenceKind,string>>=Object.freeze({bullish:'Bull',bearish:'Bear',hiddenBullish:'H Bull',hiddenBearish:'H Bear'});
export const rsiDivergenceKindOfPlot=(plot:string):RsiDivergenceKind|undefined=>RSI_DIVERGENCE_KINDS.find(kind=>RSI_DIVERGENCE_PLOT_OF[kind]===plot);

/**
 * Divergence inputs. Every key is optional: absent means its default and is never written by defaults, so RSI instances
 * saved before these inputs existed keep identical bytes and identical results (regular bullish and bearish on, hidden off).
 */
export interface RsiDivergenceInputField {key:string;title:string;type:'int'|'bool';defval:number|boolean;min?:number;max?:number}
export const RSI_DIVERGENCE_INPUTS:readonly RsiDivergenceInputField[]=Object.freeze([
 {key:'divergenceLeft',title:'Pivot lookback left',type:'int',defval:5,min:1,max:50},
 {key:'divergenceRight',title:'Pivot lookback right',type:'int',defval:5,min:1,max:50},
 {key:'divergenceRangeMin',title:'Min bars between pivots',type:'int',defval:5,min:0,max:1000},
 {key:'divergenceRangeMax',title:'Max bars between pivots',type:'int',defval:60,min:1,max:1000},
 {key:'divergenceRegularBullish',title:'Regular bullish',type:'bool',defval:true},
 {key:'divergenceRegularBearish',title:'Regular bearish',type:'bool',defval:true},
 {key:'divergenceHiddenBullish',title:'Hidden bullish',type:'bool',defval:false},
 {key:'divergenceHiddenBearish',title:'Hidden bearish',type:'bool',defval:false},
 {key:'divergenceBodyOnly',title:'Candle body only',type:'bool',defval:false},
 {key:'divergenceLabels',title:'Divergence labels',type:'bool',defval:true},
 // Display-only options, off by default (the owner's RSI has both off).
 {key:'divergencePricePane',title:'Price pane divergences',type:'bool',defval:false},
 {key:'divergenceBackground',title:'Background divergences',type:'bool',defval:false},
] as RsiDivergenceInputField[]);
/**
 * Inputs written only when a NEW RSI is created (the factory default), never by the defaults above: absent still
 * means the field default, so RSIs saved before RSI2 keep identical results. The owner's RSI has Candle body only on.
 */
export const RSI_DIVERGENCE_CREATION_INPUTS:Readonly<Record<string,boolean>>=Object.freeze({divergenceBodyOnly:true});
export const RSI_DIVERGENCE_INPUT_KEYS=Object.freeze(RSI_DIVERGENCE_INPUTS.map(field=>field.key));
const KIND_INPUT:Readonly<Record<RsiDivergenceKind,string>>=Object.freeze({bullish:'divergenceRegularBullish',bearish:'divergenceRegularBearish',hiddenBullish:'divergenceHiddenBullish',hiddenBearish:'divergenceHiddenBearish'});
export interface RsiDivergenceSettings {policy:RsiDivergencePolicy;kinds:readonly RsiDivergenceKind[];bodyOnly:boolean;labels:boolean;pricePane:boolean;background:boolean}
/** Reads and validates the divergence inputs (absent = default). Throws on a wrong type, an out-of-range value or min above max. */
export function rsiDivergenceSettings(inputs:Readonly<Record<string,unknown>>):RsiDivergenceSettings{
 const value=(key:string)=>{
  const field=RSI_DIVERGENCE_INPUTS.find(row=>row.key===key)!,raw=Object.hasOwn(inputs,key)?inputs[key]:field.defval;
  if(field.type==='bool'){if(typeof raw!=='boolean')throw new Error(`${field.title} must be on or off.`);return raw;}
  if(typeof raw!=='number'||!Number.isSafeInteger(raw)||raw<field.min!||raw>field.max!)throw new Error(`${field.title} must be a whole number from ${field.min} through ${field.max}.`);
  return raw;
 };
 const policy={left:value('divergenceLeft') as number,right:value('divergenceRight') as number,minBetween:value('divergenceRangeMin') as number,maxBetween:value('divergenceRangeMax') as number};
 if(policy.minBetween>policy.maxBetween)throw new Error('Min bars between pivots must not exceed Max bars between pivots.');
 return {policy,kinds:RSI_DIVERGENCE_KINDS.filter(kind=>value(KIND_INPUT[kind])===true),bodyOnly:value('divergenceBodyOnly') as boolean,labels:value('divergenceLabels') as boolean,pricePane:value('divergencePricePane') as boolean,background:value('divergenceBackground') as boolean};
}

export interface RsiDivergenceSegment {kind:RsiDivergenceKind;fromIndex:number;toIndex:number;confirmIndex:number;fromRsi:number;toRsi:number}
export interface RsiDivergenceResult {
 /** Marker series: the later pivot's RSI on its confirmation bar only; null everywhere else. No earlier bar ever holds a value. */
 bullish:NumericSeries;bearish:NumericSeries;hiddenBullish:NumericSeries;hiddenBearish:NumericSeries;segments:readonly RsiDivergenceSegment[];
}
/** kinds: absent = the two regular kinds (the original contract). */
export interface RsiDivergenceOptions {kinds?:readonly RsiDivergenceKind[];bodyOnly?:boolean}
const finite=(value:number|null|undefined):value is number=>typeof value==='number'&&Number.isFinite(value);

/** Pure separation rule: number of bars strictly between two pivots. */
export function rsiDivergenceSeparationAccepted(earlierIndex:number,laterIndex:number,policy:RsiDivergencePolicy=RSI_DIVERGENCE_POLICY):boolean{
 const between=laterIndex-earlierIndex-1;return between>=policy.minBetween&&between<=policy.maxBetween;
}
/** Pure pair rule shared by the scanner and its boundary tests. Equal prices or equal RSI never qualify. */
export function rsiDivergencePairQualifies(kind:RsiDivergenceKind,earlier:{price:number;rsi:number},later:{price:number;rsi:number}):boolean{
 switch(kind){
  case 'bullish':return later.price<earlier.price&&later.rsi>earlier.rsi;
  case 'bearish':return later.price>earlier.price&&later.rsi<earlier.rsi;
  case 'hiddenBullish':return later.price>earlier.price&&later.rsi<earlier.rsi;
  case 'hiddenBearish':return later.price<earlier.price&&later.rsi>earlier.rsi;
 }
}
function isPivot(values:readonly (number|null)[],index:number,left:number,right:number,low:boolean):boolean{
 const center=values[index];if(!finite(center)||index<left||index+right>=values.length)return false;
 for(let i=index-left;i<=index+right;i++){
  if(i===index)continue;const other=values[i];if(!finite(other))return false;
  if(low?!(center<other):!(center>other))return false;
 }
 return true;
}
/** The price a pivot compares: the wick (low/high), or with Candle body only min/max(open, close). Shared with the price-pane lines. */
export function rsiDivergencePivotPrice(bar:Bar,low:boolean,bodyOnly:boolean):number{return bodyOnly?(low?Math.min(bar.open,bar.close):Math.max(bar.open,bar.close)):low?bar.low:bar.high;}
export const rsiDivergenceIsBullish=(kind:RsiDivergenceKind)=>kind==='bullish'||kind==='hiddenBullish';
export function rsiDivergence(rsiValues:readonly (number|null)[],bars:readonly Bar[],policy:RsiDivergencePolicy=RSI_DIVERGENCE_POLICY,options:RsiDivergenceOptions={}):RsiDivergenceResult{
 if(rsiValues.length!==bars.length)throw new Error('RSI divergence needs one RSI value per bar.');
 const kinds=new Set<RsiDivergenceKind>(options.kinds??['bullish','bearish']),body=options.bodyOnly===true;
 const empty=()=>Array<number|null>(bars.length).fill(null);
 const markers:Record<RsiDivergenceKind,(number|null)[]>={bullish:empty(),bearish:empty(),hiddenBullish:empty(),hiddenBearish:empty()},segments:RsiDivergenceSegment[]=[];
 const lowOf=(bar:Bar)=>rsiDivergencePivotPrice(bar,true,body),highOf=(bar:Bar)=>rsiDivergencePivotPrice(bar,false,body);
 let previousLow:number|null=null,previousHigh:number|null=null;
 const last=bars.length-policy.right-1;
 const pair=(low:boolean,before:number,index:number,confirmIndex:number)=>{
  const price=low?lowOf(bars[index]):highOf(bars[index]),earlierPrice=low?lowOf(bars[before]):highOf(bars[before]),rsi=rsiValues[index] as number,earlierRsi=rsiValues[before] as number;
  if(!finite(earlierPrice)||!rsiDivergenceSeparationAccepted(before,index,policy))return;
  for(const kind of (low?['bullish','hiddenBullish']:['bearish','hiddenBearish']) as RsiDivergenceKind[]){
   if(!kinds.has(kind)||!rsiDivergencePairQualifies(kind,{price:earlierPrice,rsi:earlierRsi},{price,rsi}))continue;
   markers[kind][confirmIndex]=rsi;segments.push({kind,fromIndex:before,toIndex:index,confirmIndex,fromRsi:earlierRsi,toRsi:rsi});
  }
 };
 for(let index=policy.left;index<=last;index++){
  const confirmIndex=index+policy.right;
  if(isPivot(rsiValues,index,policy.left,policy.right,true)&&finite(lowOf(bars[index]))){if(previousLow!==null)pair(true,previousLow,index,confirmIndex);previousLow=index;}
  if(isPivot(rsiValues,index,policy.left,policy.right,false)&&finite(highOf(bars[index]))){if(previousHigh!==null)pair(false,previousHigh,index,confirmIndex);previousHigh=index;}
 }
 return {...markers,segments};
}
/**
 * Display-only values for the native line plot: each segment is a straight line between its two RSI pivots, so a
 * line series can draw it across the bars between them. Values exist only once the segment is confirmed (the caller
 * passes segments computed from the visible prefix); this is never a calculation output.
 */
export function rsiDivergenceDisplayValues(segments:readonly RsiDivergenceSegment[],kind:RsiDivergenceKind,length:number):NumericSeries{
 const out:(number|null)[]=Array(length).fill(null);
 for(const segment of segments){
  if(segment.kind!==kind||segment.toIndex>=length)continue;
  const span=segment.toIndex-segment.fromIndex;
  for(let i=segment.fromIndex;i<=segment.toIndex;i++)out[i]=i===segment.fromIndex?segment.fromRsi:i===segment.toIndex?segment.toRsi:segment.fromRsi+(segment.toRsi-segment.fromRsi)*(i-segment.fromIndex)/span;
 }
 return out;
}
