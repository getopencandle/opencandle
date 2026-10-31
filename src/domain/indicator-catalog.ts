import {SEASONALITY_IDS,SEASONALITY_DEFINITIONS,type SeasonalityId} from './indicators-ext/seasonality-catalog';
import type {Bar,NumericSeries} from './types';
import {R23_INDICATORS,R23_INDICATOR_IDS,type R23IndicatorId} from './indicators-ext/r23-catalog';
import {VP_INDICATORS,VP_INDICATOR_IDS,type VpIndicatorId} from './indicators-ext/vp-catalog';
import {R27_INDICATORS,R27_INDICATOR_IDS,type R27IndicatorId} from './indicators-ext/r27-catalog';
import {R28_INDICATORS,R28_INDICATOR_IDS,type R28IndicatorId} from './indicators-ext/r28-catalog';
import {R29_INDICATORS,R29_INDICATOR_IDS,type R29IndicatorId} from './indicators-ext/r29-catalog';
import {R40_INDICATORS,R40_INDICATOR_IDS,type R40IndicatorId} from './indicators-ext/r40-catalog';
import {IND1028_COLORS,IND1028_INDICATORS,IND1028_INDICATOR_IDS,SMOOTHING_TYPES,deviation as smoothingDeviation,smoothing as smoothingLine,type Ind1028IndicatorId} from './indicators-ext/ind1028-catalog';
import {IND1030_INDICATORS,IND1030_INDICATOR_IDS,type Ind1030IndicatorId} from './indicators-ext/ind1030-catalog';
import {INDGAPS_INDICATORS,INDGAPS_INDICATOR_IDS,type IndGapsIndicatorId} from './indicators-ext/indgaps-catalog';
import {INDGAPS2_INDICATORS,INDGAPS2_INDICATOR_IDS,type IndGaps2IndicatorId} from './indicators-ext/indgaps2-catalog';
import {INDGAPS3_INDICATORS,INDGAPS3_INDICATOR_IDS,type IndGaps3IndicatorId} from './indicators-ext/indgaps3-catalog';
import {R40_VOLUME_INDICATORS,R40_VOLUME_INDICATOR_IDS,type R40VolumeIndicatorId} from './indicators-ext/r40-volume-catalog';
import {PATTERN_INDICATORS,PATTERN_INDICATOR_IDS,type PatternIndicatorId,type PatternMarks} from './indicators-ext/patterns-catalog';
import {TRADING_SESSION_IDS,TRADING_SESSION_DEFINITIONS,type TradingSessionId} from './indicators-ext/trading-sessions-catalog';
import type {TradingSessionRecord} from './indicators-ext/trading-sessions';
import {AUTO_TRENDLINES_DEFINITION,AUTO_TRENDLINES_ID} from './indicators-ext/auto-trendlines-catalog';
import {AUTO_ELLIOTT_DEFINITION,AUTO_ELLIOTT_ID} from './indicators-ext/auto-elliott-waves';
import type {SecondSeries} from './second-symbol';
import type {FinerBarsLookup,LowerTimeframeBars,VolumeProfile} from './volume-profile';

/**
 * Extended LV built-ins beyond the original ten. Each definition records the public source of its
 * formula and documented defaults. Where a default is not documented, the value is an LV placeholder and is
 * listed in `unknownDefaults` (never presented as the reference default). Calculations are original code.
 */
export const CATALOG_INDICATOR_IDS=['cci','stochrsi','willr','mfi','cmf','mom','roc','ao','aroon','dmi','adx','psar','supertrend','kc','dc','env','lsma','wma','hma','smma'] as const;
/** More built-ins (src/domain/indicators-ext/r23-catalog.ts) share this definition shape; CATALOG_INDICATOR_IDS stays the original twenty. */
export {R23_INDICATOR_IDS};
/** Profile built-ins (src/domain/indicators-ext/vp-catalog.ts): Visible range and Periodic volume profile. */
export {VP_INDICATOR_IDS};
/** Common built-ins (src/domain/indicators-ext/r27-catalog.ts). */
export {R27_INDICATOR_IDS};
/** Second-symbol built-ins (src/domain/indicators-ext/r28-catalog.ts): Correlation coefficient, Relative strength, Spread. */
export {R28_INDICATOR_IDS};
/** Built-ins (src/domain/indicators-ext/r29-catalog.ts): MA Cross, Volatility stop, Chop zone. */
export {R29_INDICATOR_IDS};
/** Built-ins (src/domain/indicators-ext/r40-catalog.ts): BBTrend, Chande Kroll stop, Chandelier exit and others. */
export {R40_INDICATOR_IDS,R40_VOLUME_INDICATOR_IDS};
/** Built-ins (src/domain/indicators-ext/ind1028-catalog.ts): SMI, RCI, Trend strength, TWAP, ASI, AC, Chaikin volatility. */
export {IND1028_INDICATOR_IDS};
/** Built-ins (src/domain/indicators-ext/ind1030-catalog.ts): Sequential 9-13, Hull Suite and KDJ. */
export {IND1030_INDICATOR_IDS};
/** Built-ins of src/domain/indicators-ext/indgaps-catalog.ts: RCI ribbon, 24-hour volume, MA channel, Standard error, MA Hamming, Majority rule, Volatility zero trend, Typical/Average/Median price. */
export {INDGAPS_INDICATOR_IDS};
/** Built-ins of src/domain/indicators-ext/indgaps2-catalog.ts: Gaps, Bollinger bars, Moon phases, the Rob Booker set, Auto fib extension, Auto pitchfork. */
export {INDGAPS2_INDICATOR_IDS};
/** Built-ins of src/domain/indicators-ext/indgaps3-catalog.ts: Volatility close-to-close / O-H-L-C / index, MA multiple, EMA cross, SMI ergodic oscillator, Ratio, Correlation - Log, Multi-time period charts, Performance. */
export {INDGAPS3_INDICATOR_IDS};
/** Pattern built-ins (src/domain/indicators-ext/patterns-catalog.ts): the Patterns tab chart and candlestick patterns. */
export {PATTERN_INDICATOR_IDS};
export type CatalogIndicatorId=typeof CATALOG_INDICATOR_IDS[number]|R23IndicatorId|VpIndicatorId|R27IndicatorId|R28IndicatorId|R29IndicatorId|PatternIndicatorId|R40IndicatorId|R40VolumeIndicatorId|Ind1028IndicatorId|Ind1030IndicatorId|IndGapsIndicatorId|IndGaps2IndicatorId|IndGaps3IndicatorId|TradingSessionId|SeasonalityId|typeof AUTO_TRENDLINES_ID|typeof AUTO_ELLIOTT_ID;
export const ALL_CATALOG_INDICATOR_IDS:readonly CatalogIndicatorId[]=Object.freeze([...CATALOG_INDICATOR_IDS,...R23_INDICATOR_IDS,...VP_INDICATOR_IDS,...R27_INDICATOR_IDS,...R28_INDICATOR_IDS,...R29_INDICATOR_IDS,...PATTERN_INDICATOR_IDS,...R40_INDICATOR_IDS,...R40_VOLUME_INDICATOR_IDS,...IND1028_INDICATOR_IDS,...IND1030_INDICATOR_IDS,...INDGAPS_INDICATOR_IDS,...INDGAPS2_INDICATOR_IDS,...INDGAPS3_INDICATOR_IDS,...TRADING_SESSION_IDS,...SEASONALITY_IDS,AUTO_TRENDLINES_ID,AUTO_ELLIOTT_ID]);
/**
 * min/max absent = unbounded (fact "Number.MAX_VALUE"). storedMin/storedMax are the wider pre-INDFIX LV bounds that
 * saved workspaces, templates and alerts may still hold: stored state within them loads, edits use min/max.
 */
export interface CatalogInput {key:string;title:string;type:'int'|'float'|'bool'|'string';defval:number|boolean|string;min?:number;max?:number;step?:number;options?:readonly string[];storedMin?:number;storedMax?:number;
 /** An input added after instances were saved. legacyOmit: saved instances never gain the key (absent = defval);
  *  legacyDefval: the value a saved instance without the key keeps (the old default), while new instances get defval. */
 legacyOmit?:boolean;legacyDefval?:number|boolean|string}
/** An input removed from the editor that stored state may still carry; the kernel keeps honoring it. */
export interface CatalogRetiredInput extends CatalogInput {replacedBy?:string}
/** color/width: default plot style. */
/** visible: default plot visibility (absent = shown). */
export interface CatalogPlot {id:string;label:string;kind?:'line'|'histogram'|'cross';color?:string;width?:number;visible?:boolean}
export interface CatalogToolkit {
 sma(values:readonly (number|null)[],period:number):NumericSeries;ema(values:readonly (number|null)[],period:number):NumericSeries;
 /** EMA seeded by the SMA of its first period finite values (the reference EMA). */
 emaSmaSeed(values:readonly (number|null)[],period:number):NumericSeries;
 rma(values:readonly (number|null)[],period:number):NumericSeries;wma(values:readonly (number|null)[],period:number):NumericSeries;
 rsi(values:readonly (number|null)[],period:number):NumericSeries;trueRange(bars:readonly Bar[]):NumericSeries;
}
/** Chart facts a calculation may use when the caller supplies them: the declared resolution and the session calendar. Absent or null = unknown (the kind falls back to the bars). */
/** VisibleRange (seconds, the pane edges), tickSize (the instrument tick) and lowerTimeframe (finer bars of the same
 *  instrument) are supplied by the chart when known; absent or null = unknown. Only the profile kinds read them. */
export interface CatalogChartContext {resolution:string|null;calendar:'us-equity'|'utc'|null;visibleRange?:{from:number;to:number}|null;tickSize?:number|null;exchangeZone?:string|null;style?:string|null;lowerTimeframe?:LowerTimeframeBars|null;
 /** Finer bars on demand for the profile kinds; absent = only `lowerTimeframe`. */
 finerBars?:FinerBarsLookup|null;
 /** The second series of a two-symbol kind (secondSymbol), at the interval being calculated; absent = none loaded. */
 secondSeries?:(symbol:string)=>SecondSeries}
export interface CatalogContext {bars:readonly Bar[];source:readonly (number|null)[];num(key:string):number;bool(key:string):boolean;str(key:string):string;has(key:string):boolean;tk:CatalogToolkit;chart?:CatalogChartContext;
 /** Profile kinds hand their histogram rows to the result (IndicatorResult.profiles) for the presentation. */
 profiles?(profiles:readonly VolumeProfile[]):void;
 /** Projecting kinds hand the values of their plots past the last bar to the result (IndicatorResult.projection). */
 projection?(values:Record<string,NumericSeries>):void;
 /** Pattern kinds hand their markers and boundary lines to the result (IndicatorResult.marks; display only). */
 marks?(value:PatternMarks):void;
 /** Observed session geometry is visual-only; scalar series remain causal prefixes. */
 sessions?(value:readonly Readonly<TradingSessionRecord>[]):void;
 /** Chart-data studies publish loading and coverage notices without inventing values. */
 diagnostic?(message:string):void}
export interface CatalogDefinition {
 id:CatalogIndicatorId;name:string;acronym:string;overlay:boolean;requiresVolume?:boolean;
 /** The kind reads every timestamped row, including rows with missing volume, and decides availability itself (a
  *  wall-clock window holding an unknown volume is unavailable), so those rows are not removed before it runs. */
 keepsVolumeGaps?:boolean;
 /** Extra search terms (indicator picker and quick search); never displayed. */
 keywords?:readonly string[];
 /** True when the Source input feeds one series that may also be another indicator's plot. */
 sourceSeries?:boolean;
 inputs:readonly CatalogInput[];plots:readonly CatalogPlot[];
 /** Pre-INDFIX inputs accepted only in stored state (see CatalogRetiredInput). */
 retiredInputs?:readonly CatalogRetiredInput[];
 /** Lossless rewrite of stored inputs into the current shape; lossy cases keep the retired keys. */
 migrate?(inputs:Record<string,unknown>):Record<string,unknown>;
 guides?:readonly {id:'upper'|'lower'|'zero';value:number;color?:string}[];
 /** Background between plots upper/lower ('plots') or between the upper/lower guides ('guides'). */
 band?:'plots'|'guides';histogramPalette?:boolean;
 /** Default background color and opacity percent (100 - fact transparency). */
 fill?:{color:string;opacity:number};
 /** Two-color band: bars where plot upper is not above plot lower use this second background (its own 'bearish' fill style); `fill` colors the others. */
 bearishFill?:{color:string;opacity:number};
 /** Plots are piecewise constant per period: a value change starts a new horizontal segment (the joining stroke is transparent). */
 segmented?:boolean;
 /** Many same-colored levels (Pivots: P, R1-R5, S1-S5): the legend names each value with its plot label ("P 24.03"). */
 legendNames?:boolean;
 /** The calculation depends on the visible range, so the chart recalculates it after each pan or zoom. */
 viewport?:boolean;
 /** A volume profile kind (Profiles tab; histogram boxes from IndicatorResult.profiles). */
 profile?:boolean;
 /** Chart-only configured clock windows with observed boxes and statistics. */
 tradingSessions?:boolean;
 /** Requires the private original daily/monthly source service; never generic bars-only calculation. */
 seasonality?:boolean;
 /** Requires actual lower-interval history rather than a chart-bar approximation. */
 finerBars?:boolean;
 /** Reads daily history on intraday charts for the trailing yearly range. */
 dailyHistory?:boolean;
 /** Numerical open/high/low/close plots are presented as native candles. */
 volumeDelta?:boolean;
 /** The kind reads a second symbol (its "symbol" input) through CatalogChartContext.secondSeries. */
 secondSymbol?:boolean;
 /** The kind projects some plots past the last loaded bar (IndicatorResult.projection; chart display only). */
 projects?:boolean;
 /** A Patterns tab kind. Its plots are 0/1 signals drawn as labelled markers (IndicatorResult.marks), not lines.
  *  Any marker kind sets it (the Patterns tab itself lists PATTERN_INDICATOR_IDS only); its marks may also carry
  *  shaped markers, boxes and candles. */
 pattern?:'candlestick'|'chart';
 /** Plots a segmented kind draws as continuous lines (broken only where a profile starts). */
 continuousPlots?:readonly string[];
 /** Per-bar colors of one plot (chart display only). `state` maps the calculated plot values (on the
  *  drawn bars) to an index into `colors`, or null to keep the plot's own style color. */
 pointPalette?:{plot:string;colors:readonly string[];state(values:(plotId:string)=>readonly (number|null)[]):readonly (number|null)[];
  /** The Style tab row name of each state, in `colors` order. */
  labels?:readonly string[]};
 /** Default growing/falling histogram colors (two-color palette). */
 histogramColors?:{growing:string;falling:string};
 /** Default fixed precision from the legacy format fact; absent = auto. */
 precision?:number;
 /** Display suffix from the legacy format fact (format type percent -> '%'); display only, never part of a stored or calculated value. */
 valueSuffix?:'%';
 provenance:readonly {url:string;facts:string}[];unknownDefaults?:readonly string[];policies:readonly string[];
 calculate(ctx:CatalogContext):Record<string,NumericSeries>;
 warmup(value:(key:string)=>number):number;work(barCount:number,value:(key:string)=>number):number;
}
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
/** LV placeholder bound, kept only where no fact exists (adx, supertrend, lsma, smma). */
const LENGTH={type:'int' as const,min:1,max:100000,step:1};
/** Fact bounds (legacy descriptor "max 2000" / "max 10000" / "max 50"); pre-fix LV bound 100000 stays loadable. */
const LENGTH_2000={type:'int' as const,min:1,max:2000,step:1,storedMax:100000};
const LENGTH_10000={type:'int' as const,min:1,max:10000,step:1,storedMax:100000};
const LENGTH_50={type:'int' as const,min:1,max:50,step:1,storedMax:100000};
const SOURCE:CatalogInput={key:'source',title:'Source',type:'string',defval:'close',options:['open','high','low','close','hl2','hlc3','ohlc4']};
const F='builtin-defaults:';
const HELP='public-indicator-definition:';
const AC='public-indicator-definition:default-overrides';
/** Highest/lowest of finite values over the window ending at index (inclusive); null when any value is missing. */
function extreme(values:readonly number[],index:number,window:number,pick:'max'|'min'):number|null{
 if(index<window-1)return null;let out=pick==='max'?-Infinity:Infinity;
 for(let i=index-window+1;i<=index;i++){const value=values[i];if(!finite(value))return null;out=pick==='max'?Math.max(out,value):Math.min(out,value);}return out;
}
function windowSum(values:readonly (number|null)[],index:number,window:number):number|null{
 if(index<window-1)return null;let sum=0;for(let i=index-window+1;i<=index;i++){const value=values[i];if(!finite(value))return null;sum+=value;}return sum;
}
const zero=(value:number)=>value===0?0:value;// normalize -0 for readouts and comparisons
const highs=(bars:readonly Bar[])=>bars.map(bar=>bar.high),lows=(bars:readonly Bar[])=>bars.map(bar=>bar.low);
function directional(ctx:CatalogContext){
 const {bars,tk}=ctx,di=ctx.num('diLength'),adxLength=ctx.num('adxSmoothing');
 const plus:NumericSeries=[],minus:NumericSeries=[],tr:NumericSeries=[];
 bars.forEach((bar,i)=>{
  if(!i){plus.push(null);minus.push(null);tr.push(null);return;}const prior=bars[i-1];
  if(![bar.high,bar.low,prior.high,prior.low,prior.close].every(finite)){plus.push(null);minus.push(null);tr.push(null);return;}
  const up=bar.high-prior.high,down=prior.low-bar.low;
  plus.push(up>down&&up>0?up:0);minus.push(down>up&&down>0?down:0);tr.push(Math.max(bar.high-bar.low,Math.abs(bar.high-prior.close),Math.abs(bar.low-prior.close)));
 });
 const str=tk.rma(tr,di),splus=tk.rma(plus,di),sminus=tk.rma(minus,di);
 const plusDI=str.map((value,i)=>finite(value)&&value>0&&finite(splus[i])?100*(splus[i] as number)/value:null);
 const minusDI=str.map((value,i)=>finite(value)&&value>0&&finite(sminus[i])?100*(sminus[i] as number)/value:null);
 const dx=plusDI.map((value,i)=>{const other=minusDI[i];if(!finite(value)||!finite(other)||value+other===0)return null;return 100*Math.abs(value-other)/(value+other);});
 return {adx:tk.rma(dx,adxLength),plusDI,minusDI};
}
const DMI_SOURCES=[{url:HELP+'directional-movement-dmi',facts:'+DM/-DM selection rules; +DI/-DI = 100 x smoothed DM / ATR; ADX = smoothed |+DI - -DI| / (+DI + -DI) x 100; inputs ADX smoothing 14 and DI Length 14.'},{url:HELP+'average-directional-index-adx',facts:'True range = greatest of high-low, |high-prior close|, |low-prior close|; Wilder smoothing (first value = sum of first x readings, then prior - prior/x + current); ADX = ((prior ADX x 13) + DX) / 14.'},{url:AC,facts:'directional movement / average directional index: adx smoothing 14, di length 14.'}];
const DMI_POLICIES=['Wilder smoothing (RMA seeded with the mean of the first window) starts on the second bar because +DM, -DM and true range need the prior bar.','DX is unavailable when +DI + -DI is zero; ADX skips unavailable DX values.'];
/** dmi.input.ADX_smoothing (max 50) and dmi.input.DI_Length (label "DI Length", max 2000). */
const DMI_INPUTS:readonly CatalogInput[]=[{key:'adxSmoothing',title:'ADX smoothing',defval:14,...LENGTH_50},{key:'diLength',title:'DI Length',defval:14,...LENGTH_2000}];
/** ADX: no ADX input facts exist (only adx.std); the LV labels and placeholder bounds stay as they were. */
const ADX_INPUTS:readonly CatalogInput[]=[{key:'adxSmoothing',title:'ADX smoothing',defval:14,...LENGTH},{key:'diLength',title:'DI length',defval:14,...LENGTH}];
const BAND_DASH='width 1, dashed';
export const CATALOG_INDICATORS:readonly CatalogDefinition[]=Object.freeze([
 {id:'cci',name:'Commodity channel index',acronym:'CCI',overlay:false,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:20,...LENGTH_2000},{...SOURCE,defval:'hlc3',legacyDefval:'close'},
  // The Smoothing section. Saved CCIs never gain these keys.
  // New CCIs default to source hlc3 and a CCI-based MA (SMA 14); saved CCIs keep close / no MA.
  {key:'maType',title:'Smoothing type',type:'string',defval:'SMA',options:SMOOTHING_TYPES,legacyOmit:true,legacyDefval:'None'},{key:'maLength',title:'Smoothing length',defval:14,...LENGTH,legacyOmit:true},{key:'bbMult',title:'BB StdDev',type:'float',defval:2,min:0.5,max:50,step:0.5,legacyOmit:true}],
  plots:[{id:'cci',label:'CCI',color:'#996a15',width:1},{id:'ma',label:'CCI-based MA',color:IND1028_COLORS.amber,width:1},{id:'bbUpper',label:'Upper Bollinger band',color:IND1028_COLORS.up,width:1},{id:'bbLower',label:'Lower Bollinger band',color:IND1028_COLORS.up,width:1}],
  guides:[{id:'upper',value:100,color:'#c0c0c0'},{id:'lower',value:-100,color:'#c0c0c0'}],band:'guides',fill:{color:'#996a15',opacity:10},precision:2,
  provenance:[{url:F+'cci.std',facts:'name Commodity channel index, short title CCI.'},{url:F+'cci.input.length',facts:'Length 20, 1..2000 (legacy descriptor).'},{url:F+'cci.plot.CCI',facts:'CCI #996a15 width 1.'},{url:F+'cci.band.Upper_Band',facts:'100 #c0c0c0 '+BAND_DASH+'; Lower_Band -100.'},{url:F+'cci.fill.bandsBackground',facts:'#996a15 transparency 90.'},{url:F+'cci.legacy',facts:'price format precision 2.'},{url:HELP+'commodity-channel-index-cci',facts:'CCI = (source - SMA(source, Length)) / (0.015 x mean deviation); mean deviation = mean of |source - SMA| over Length; Length default 20; new OpenCandle instances default to Source hlc3.'},{url:AC,facts:'commodity channel index.length: 20.'}],
  unknownDefaults:['Smoothing section: type None, length 14 and BB StdDev 2 are the common CCI defaults; the smoothing plot colors are OpenCandle-defined.'],
  policies:['A zero mean deviation (flat window) is unavailable, not zero.','Smoothing: the CCI-based MA is the chosen average of the CCI over the smoothing length (None leaves it empty); SMA + Bollinger Bands adds the SMA plus and minus BB StdDev population standard deviations of the CCI.'],
  calculate(ctx){const {source,tk,num,str}=ctx,n=num('length'),mean=tk.sma(source,n);const cci=source.map((value,i)=>{const average=mean[i];if(!finite(value)||!finite(average))return null;let deviation=0;for(let j=i-n+1;j<=i;j++)deviation+=Math.abs((source[j] as number)-average);deviation/=n;return deviation===0?null:zero((value-average)/(0.015*deviation));});
   const type=str('maType'),m=num('maLength'),k=num('bbMult'),ma=type==='None'?cci.map(()=>null):smoothingLine(ctx,cci,type,m),bands=type==='SMA + Bollinger Bands',band=(sign:1|-1)=>ma.map((value,i)=>{if(!bands||!finite(value))return null;const sd=smoothingDeviation(cci,i,m);return sd===null?null:value+sign*k*sd;});
   return {cci,ma,bbUpper:band(1),bbLower:band(-1)};},
  warmup:value=>value('length'),work:(count,value)=>count*(value('length')*3+value('maLength')*4)},
 {id:'stochrsi',name:'Stochastic RSI',acronym:'Stoch RSI',overlay:false,sourceSeries:true,inputs:[{key:'smoothK',title:'K',defval:3,...LENGTH_10000},{key:'smoothD',title:'D',defval:3,...LENGTH_10000},{key:'rsiLength',title:'RSI Length',defval:14,...LENGTH_10000},{key:'stochLength',title:'Stochastic Length',defval:14,...LENGTH_10000},{...SOURCE,title:'RSI Source'}],plots:[{id:'k',label:'K',color:'#0094ff',width:1},{id:'d',label:'D',color:'#ff6a00',width:1}],
  guides:[{id:'upper',value:80,color:'#606060'},{id:'lower',value:20,color:'#606060'}],band:'guides',fill:{color:'#9915ff',opacity:20},precision:2,
  provenance:[{url:F+'stochrsi.input.K',facts:'inputs K 3, D 3, RSI Length 14, Stochastic Length 14 (1..10000), RSI Source close.'},{url:F+'stochrsi.plot.K',facts:'K #0094ff, D #ff6a00, width 1.'},{url:F+'stochrsi.band.Upper_Band',facts:'80 / 20 #606060 '+BAND_DASH+'.'},{url:F+'stochrsi.fill.bandsBackground',facts:'#9915ff transparency 80.'},{url:F+'stochrsi.legacy',facts:'price format precision 2.'},{url:HELP+'stochastic-rsi-stoch-rsi',facts:'Stoch RSI = (RSI - lowest RSI) / (highest RSI - lowest RSI) over the stochastic length; K and D default 3; RSI Source default Close.'},{url:AC,facts:'stochastic rsi: lengthrsi 14, lengthstoch 14, smoothk 3, smoothd 3.'}],
  policies:['OpenCandle scales the ratio to 0-100 like the built-in Stochastic; %K = SMA(100 x ratio, K smoothing), %D = SMA(%K, D smoothing). A flat RSI window is unavailable.'],
  calculate({source,tk,num}){const r=tk.rsi(source,num('rsiLength')),window=num('stochLength'),raw=r.map((value,i)=>{if(!finite(value))return null;const hi=extreme(r as number[],i,window,'max'),lo=extreme(r as number[],i,window,'min');if(hi===null||lo===null||hi===lo)return null;return 100*(value-lo)/(hi-lo);});const k=tk.sma(raw,num('smoothK'));return {k,d:tk.sma(k,num('smoothD'))};},
  warmup:value=>value('rsiLength')+value('stochLength')+value('smoothK')+value('smoothD')-2,work:(count,value)=>count*(value('stochLength')*2+64)},
 {id:'willr',name:'Williams percent range',acronym:'Williams %R',overlay:false,inputs:[{key:'length',title:'Length',defval:14,...LENGTH_2000},SOURCE],plots:[{id:'r',label:'%R',color:'#3a6ca8',width:1}],guides:[{id:'upper',value:-20,color:'#606060'},{id:'lower',value:-80,color:'#606060'}],band:'guides',fill:{color:'#9915ff',opacity:10},precision:2,
  provenance:[{url:F+'willr.std',facts:'name Williams percent range, short title Williams %R.'},{url:F+'willr.input.length',facts:'Length 14, 1..2000.'},{url:F+'willr.plot.PercentRange',facts:'%R #3a6ca8 width 1.'},{url:F+'willr.band.Upper_Band',facts:'-20 / -80 #606060 '+BAND_DASH+'.'},{url:F+'willr.fill.bandsBackground',facts:'#9915ff transparency 90.'},{url:F+'willr.legacy',facts:'price format precision 2.'},{url:HELP+'williams-r-r',facts:'%R = (highest high - source) / (highest high - lowest low) x -100 over Length; Length default 14; Source default Close; upper band -20, lower band -80.'}],
  policies:['A window whose highest high equals its lowest low is unavailable.'],
  calculate({bars,source,num}){const n=num('length'),h=highs(bars),l=lows(bars);return {r:source.map((value,i)=>{const hi=extreme(h,i,n,'max'),lo=extreme(l,i,n,'min');if(!finite(value)||hi===null||lo===null||hi===lo)return null;return zero((hi-value)/(hi-lo)*-100);})};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')*2},
 {id:'mfi',name:'Money flow index',acronym:'MFI',overlay:false,requiresVolume:true,inputs:[{key:'length',title:'Length',defval:14,...LENGTH_2000}],plots:[{id:'mfi',label:'MF',color:'#459915',width:1}],
  guides:[{id:'upper',value:80,color:'#c0c0c0'},{id:'lower',value:20,color:'#c0c0c0'}],band:'guides',fill:{color:'#9915ff',opacity:10},precision:2,
  provenance:[{url:F+'mfi.std',facts:'name Money flow index, short title MFI.'},{url:F+'mfi.input.length',facts:'Length 14, 1..2000.'},{url:F+'mfi.plot.MoneyFlow',facts:'MF #459915 width 1.'},{url:F+'mfi.band.Overbought',facts:'Overbought 80 / Oversold 20 #c0c0c0 '+BAND_DASH+'.'},{url:F+'mfi.fill.bandsBackground',facts:'#9915ff transparency 90.'},{url:F+'mfi.legacy',facts:'price format precision 2.'},{url:HELP+'money-flow-mfi',facts:'Typical price (H+L+C)/3; raw money flow = typical price x volume; positive/negative flow summed over Length by typical price rising/falling versus the prior bar; MFI = 100 - 100/(1 + positive/negative); Length default 14.'},{url:AC,facts:'money flow index.length: 14.'}],
  policies:['An unchanged typical price adds to neither flow. No negative flow gives 100, no positive flow gives 0; a window with neither is unavailable.'],
  calculate({bars,num}){const n=num('length'),tp=bars.map(bar=>(bar.high+bar.low+bar.close)/3),pos:NumericSeries=[],neg:NumericSeries=[];
   bars.forEach((bar,i)=>{if(!i||!finite(tp[i])||!finite(tp[i-1])||!finite(bar.volume)){pos.push(null);neg.push(null);return;}const flow=tp[i]*bar.volume;pos.push(tp[i]>tp[i-1]?flow:0);neg.push(tp[i]<tp[i-1]?flow:0);});
   return {mfi:bars.map((_,i)=>{const p=windowSum(pos,i,n),q=windowSum(neg,i,n);if(p===null||q===null||p+q===0)return null;if(q===0)return 100;return 100-100/(1+p/q);})};},
  warmup:value=>value('length')+1,work:(count,value)=>count*value('length')*2},
 {id:'cmf',name:'Chaikin money flow',acronym:'CMF',overlay:false,requiresVolume:true,inputs:[{key:'length',title:'Length',defval:20,...LENGTH_2000}],plots:[{id:'cmf',label:'MF',color:'#459915',width:1}],guides:[{id:'zero',value:0,color:'#606060'}],precision:2,
  provenance:[{url:F+'cmf.std',facts:'name Chaikin money flow, short title CMF.'},{url:F+'cmf.input.length',facts:'Length 20, 1..2000.'},{url:F+'cmf.plot.ChaikinMoneyFlow',facts:'MF #459915 width 1.'},{url:F+'cmf.band.Zero',facts:'0 #606060 '+BAND_DASH+'.'},{url:F+'cmf.legacy',facts:'price format precision 2.'},{url:HELP+'chaikin-money-flow-cmf',facts:'Money flow multiplier = ((close - low) - (high - close)) / (high - low); money flow volume = multiplier x volume; CMF = sum(money flow volume) / sum(volume) over Length; Zero line plotted; the article\'s example uses 21 periods.'},{url:AC,facts:'chaikin money flow.length: 20.'}],
  policies:['A bar whose high equals its low contributes a zero multiplier. A window with zero total volume is unavailable.'],
  calculate({bars,num}){const n=num('length'),mfv=bars.map(bar=>{if(![bar.high,bar.low,bar.close,bar.volume].every(finite))return null;const range=bar.high-bar.low;return range===0?0:((bar.close-bar.low)-(bar.high-bar.close))/range*bar.volume;}),volume=bars.map(bar=>bar.volume);
   return {cmf:bars.map((_,i)=>{const a=windowSum(mfv,i,n),b=windowSum(volume,i,n);return a===null||b===null||b===0?null:zero(a/b);})};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')*2},
 {id:'mom',name:'Momentum',acronym:'Mom',overlay:false,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:10,...LENGTH_2000},SOURCE],plots:[{id:'mom',label:'MOM',color:'#999915',width:1}],
  provenance:[{url:F+'mom.input.length',facts:'Length 10, 1..2000.'},{url:F+'mom.plot.Momentum',facts:'MOM #999915 width 1.'},{url:AC,facts:'momentum.length: 10; momentum.source: close.'},{url:HELP+'momentum',facts:'Conceptual article only; no formula is published there.'}],
  policies:['Momentum = source - source Length bars earlier (conventional definition; the public definition publishes no formula, so reference parity is unverified).'],
  calculate({source,num}){const n=num('length');return {mom:source.map((value,i)=>i>=n&&finite(value)&&finite(source[i-n])?zero(value-(source[i-n] as number)):null)};},
  warmup:value=>value('length')+1,work:count=>count*4},
 {id:'roc',name:'Rate of change',acronym:'ROC',overlay:false,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:9,...LENGTH_2000},SOURCE],plots:[{id:'roc',label:'ROC',color:'#156a99',width:1}],guides:[{id:'zero',value:0,color:'#c0c0c0'}],precision:2,
  provenance:[{url:F+'roc.std',facts:'name Rate of change, short title ROC.'},{url:F+'roc.input.length',facts:'Length 9, 1..2000.'},{url:F+'roc.plot.ROC',facts:'ROC #156a99 width 1.'},{url:F+'roc.band.Zero_Line',facts:'Zero Line 0 #c0c0c0 '+BAND_DASH+'.'},{url:F+'roc.legacy',facts:'price format precision 2.'},{url:HELP+'rate-of-change-roc',facts:'ROC = (current source - source n periods ago) / (source n periods ago) x 100; Length default 9; Source default Close.'},{url:AC,facts:'rate of change.length: 9.'}],
  policies:['A zero base value is unavailable.'],
  calculate({source,num}){const n=num('length');return {roc:source.map((value,i)=>{const base=i>=n?source[i-n]:null;return finite(value)&&finite(base)&&base!==0?zero((value-base)/base*100):null;})};},
  warmup:value=>value('length')+1,work:count=>count*4},
 {id:'ao',name:'Awesome oscillator',acronym:'AO',overlay:false,inputs:[],
  // ao.legacy has inputCount 0: the editor shows no inputs. Stored pre-fix Fast/Slow lengths still load and are honored.
  retiredInputs:[{key:'fast',title:'Fast length',defval:5,...LENGTH},{key:'slow',title:'Slow length',defval:34,...LENGTH}],
  migrate(inputs){const out={...inputs};if((out.fast??5)===5&&(out.slow??34)===34){delete out.fast;delete out.slow;}return out;},
  plots:[{id:'histogram',label:'OA',kind:'histogram',color:'#ff006e',width:1}],histogramPalette:true,histogramColors:{growing:'#007f0e',falling:'#872323'},
  provenance:[{url:HELP+'awesome-oscillator-ao',facts:'AO = SMA(hl2, 5) - SMA(hl2, 34); the two periods default to 5 and 34; Growing and Falling bar colors.'},{url:F+'ao.std',facts:'name Awesome oscillator, short title AO.'},{url:F+'ao.legacy',facts:'inputCount 0; format inherit.'},{url:F+'ao.plot.ao',facts:'plot title OA (sic, as recorded), histogram #ff006e width 1.'},{url:F+'ao.palette.pal.0',facts:'Growing #007f0e; pal.1 Falling #872323.'}],
  policies:['Bars rising versus the prior value use the growing colors and other bars the falling colors, for both signs.','The periods are fixed at 5 and 34 (no inputs, per the legacy descriptor); a saved pre-fix instance keeps its stored Fast/Slow lengths.'],
  calculate({bars,tk,num}){const hl2=bars.map(bar=>(bar.high+bar.low)/2),a=tk.sma(hl2,num('fast')),b=tk.sma(hl2,num('slow'));return {histogram:a.map((value,i)=>finite(value)&&finite(b[i])?zero(value-(b[i] as number)):null)};},
  warmup:value=>Math.max(value('fast'),value('slow')),work:count=>count*140},
 {id:'aroon',name:'Aroon',acronym:'Aroon',overlay:false,inputs:[{key:'length',title:'Length',defval:14,...LENGTH_2000}],plots:[{id:'up',label:'Aroon Up',color:'#ff6a00',width:1},{id:'down',label:'Aroon Down',color:'#0094ff',width:1}],precision:2,valueSuffix:'%',
  provenance:[{url:F+'aroon.input.length',facts:'Length 14, 1..2000.'},{url:F+'aroon.plot.AroonUp',facts:'Aroon Up #ff6a00, Aroon Down #0094ff, width 1.'},{url:F+'aroon.legacy',facts:'percent format, precision 2 (OpenCandle applies precision 2 and the percent sign through the number formatter, valueSuffix).'},{url:HELP+'aroon-indicator',facts:'Aroon-Up = ((Length - bars since Length-period high) / Length) x 100; Aroon-Down likewise with the low.'},{url:AC,facts:'aroon.length: 14.'}],
  policies:['The window is the current bar plus Length prior bars so that values span 0-100; on ties the most recent extreme is used.'],
  calculate({bars,num}){const n=num('length'),h=highs(bars),l=lows(bars),since=(values:number[],i:number,pick:'max'|'min')=>{if(i<n)return null;let best=i;for(let j=i;j>=i-n;j--){const value=values[j];if(!finite(value))return null;if(pick==='max'?value>values[best]:value<values[best])best=j;}return i-best;};
   const series=(values:number[],pick:'max'|'min')=>bars.map((_,i)=>{const d=since(values,i,pick);return d===null?null:(n-d)/n*100;});return {up:series(h,'max'),down:series(l,'min')};},
  warmup:value=>value('length')+1,work:(count,value)=>count*value('length')*2},
 {id:'dmi',name:'Directional movement index',acronym:'DMI',overlay:false,inputs:DMI_INPUTS,plots:[{id:'adx',label:'ADX',color:'#ff006e',width:1},{id:'plusDI',label:'+DI',color:'#0094ff',width:1},{id:'minusDI',label:'-DI',color:'#ff6a00',width:1}],precision:4,
  provenance:[...DMI_SOURCES,{url:F+'dmi.std',facts:'name Directional movement index, short title DMI.'},{url:F+'dmi.input.ADX_smoothing',facts:'ADX smoothing 14 (1..50); DI Length 14 (1..2000).'},{url:F+'dmi.plot.ADX',facts:'ADX #ff006e, +DI #0094ff, -DI #ff6a00, width 1.'},{url:F+'dmi.legacy',facts:'price format precision 4.'}],policies:DMI_POLICIES,
  calculate:ctx=>directional(ctx),warmup:value=>value('diLength')+value('adxSmoothing'),work:count=>count*40},
 {id:'adx',name:'Average directional index',acronym:'ADX',overlay:false,inputs:ADX_INPUTS,plots:[{id:'adx',label:'ADX'}],provenance:[...DMI_SOURCES,{url:F+'adx.std',facts:'name Average directional index, short title ADX (inputs, plots and styles not cached).'}],policies:DMI_POLICIES,
  calculate:ctx=>({adx:directional(ctx).adx}),warmup:value=>value('diLength')+value('adxSmoothing'),work:count=>count*40},
 {id:'psar',name:'Parabolic SAR',acronym:'SAR',overlay:true,inputs:[{key:'start',title:'Start',type:'float',defval:0.02},{key:'increment',title:'Increment',type:'float',defval:0.02},{key:'maximum',title:'Max value',type:'float',defval:0.2}],plots:[{id:'sar',label:'ParabolicSAR',kind:'cross',color:'#3a6ca8',width:1}],
  provenance:[{url:F+'psar.input.start',facts:'Start 0.02, Increment 0.02, Max value 0.2; float, unbounded, no step (the OpenCandle key "maximum" is kept for stored state).'},{url:F+'psar.plot.ParabolicSAR',facts:'ParabolicSAR cross #3a6ca8 width 1.'},{url:HELP+'parabolic-sar-sar',facts:'SAR = prior SAR + prior AF x (prior EP - prior SAR); AF starts at Start (0.02), grows by Increment (0.02) at each new extreme, capped at Max Value (0.20); uptrend SAR never above the two prior lows, downtrend SAR never below the two prior highs; a strict penetration reverses and the prior EP becomes the SAR; no value on the first bar; the second bar takes direction from the first two closes (downtrend uses the first high, uptrend the first low); Cross style.'},{url:AC,facts:'parabolic sar: start 0.02, increment 0.02, maximum 0.2.'}],
  policies:['Initialization: the second bar starts an uptrend at the first low when its close is above the first close, otherwise a downtrend at the first high, with the second bar as the extreme point. Every bar, the second included, steps the SAR, then reverses when the bar crosses it (the SAR moves to the farther of the prior extreme point and the bar high/low, AF resets), otherwise updates the extreme point and AF, then clamps to the two prior lows (uptrend) or highs (downtrend). A bar with missing prices is unavailable and restarts initialization. AF starts at the smaller of Start and Maximum.'],
  calculate({bars,num}){const start=num('start'),increment=num('increment'),cap=num('maximum'),out:NumericSeries=[];let state:{up:boolean;sar:number;ep:number;af:number}|null=null,seed:number|null=null;
   bars.forEach((bar,i)=>{
    if(![bar.high,bar.low,bar.close].every(finite)){out.push(null);state=null;seed=null;return;}
    if(seed===null){seed=i;out.push(null);return;}
    // The reference sequence (initialize, step, reverse or extend, clamp) runs on every bar from the second.
    const p1=bars[i-1],p2=i-2>=seed?bars[i-2]:p1;let turned=false;
    if(!state){const first=bars[seed],up=bar.close>first.close;state=up?{up,sar:first.low,ep:bar.high,af:Math.min(start,cap)}:{up,sar:first.high,ep:bar.low,af:Math.min(start,cap)};turned=true;}
    let sar=state.sar+state.af*(state.ep-state.sar);
    if(state.up&&sar>bar.low){turned=true;state.up=false;sar=Math.max(bar.high,state.ep);state.ep=bar.low;state.af=Math.min(start,cap);}
    else if(!state.up&&sar<bar.high){turned=true;state.up=true;sar=Math.min(bar.low,state.ep);state.ep=bar.high;state.af=Math.min(start,cap);}
    if(!turned){if(state.up&&bar.high>state.ep){state.ep=bar.high;state.af=Math.min(state.af+increment,cap);}else if(!state.up&&bar.low<state.ep){state.ep=bar.low;state.af=Math.min(state.af+increment,cap);}}
    state.sar=state.up?Math.min(sar,p1.low,p2.low):Math.max(sar,p1.high,p2.high);
    out.push(state.sar);
   });return {sar:out};},
  warmup:()=>2,work:count=>count*16},
 {id:'supertrend',name:'Supertrend',acronym:'Supertrend',overlay:true,inputs:[{key:'atrLength',title:'ATR length',defval:10,...LENGTH},{key:'factor',title:'Factor',type:'float',defval:3,min:0,max:100000,step:0.1}],plots:[{id:'upTrend',label:'Up trend'},{id:'downTrend',label:'Down trend'}],
  provenance:[{url:HELP+'supertrend',facts:'Basic bands = hl2 +/- multiplier x ATR; final upper band takes the basic band when it is lower than the prior final band or the prior close was above it, otherwise carries forward (mirror rule for the lower band); trend is down while the prior ATR is not yet calculated; after an upper-band Supertrend the trend is up when close > upper band, otherwise down when close < lower band; Supertrend plots the lower band in an uptrend and the upper band in a downtrend; green uptrend, red downtrend.'}],
  unknownDefaults:['ATR length 10 and Factor 3 are OpenCandle placeholders: the public definition does not document the defaults.','The ATR averaging method is not stated in the article; OpenCandle uses the Wilder average (as the OpenCandle ATR default).'],
  policies:['ATR = Wilder average of true range (first true range = high - low).'],
  calculate({bars,tk,num}){const atr=tk.rma(tk.trueRange(bars),num('atrLength')),factor=num('factor'),up:NumericSeries=[],down:NumericSeries=[];let upper:number|null=null,lower:number|null=null,previous:number|null=null,lastClose=NaN;
   // A missing bar (or its missing ATR) is a gap only: the final bands, the trend and the prior close carry across it.
   bars.forEach((bar,i)=>{const a=atr[i],priorClose=lastClose;if(finite(bar.close))lastClose=bar.close;if(!finite(a)||![bar.high,bar.low,bar.close].every(finite)){up.push(null);down.push(null);return;}
    const mid=(bar.high+bar.low)/2,basicUpper=mid+factor*a,basicLower=mid-factor*a;
    const priorUpper=upper,priorLower=lower;
    upper=priorUpper===null||basicUpper<priorUpper||priorClose>priorUpper?basicUpper:priorUpper;
    lower=priorLower===null||basicLower>priorLower||priorClose<priorLower?basicLower:priorLower;
    let trendUp:boolean;if(previous===null)trendUp=false;else if(previous===priorUpper)trendUp=bar.close>upper;else trendUp=!(bar.close<lower);
    const value=trendUp?lower:upper;previous=value;up.push(trendUp?value:null);down.push(trendUp?null:value);});
   return {upTrend:up,downTrend:down};},
  warmup:value=>value('atrLength'),work:count=>count*48},
 {id:'kc',name:'Keltner channels',acronym:'KC',overlay:true,inputs:[{key:'length',title:'Length',defval:20,...LENGTH_2000},{key:'multiplier',title:'Multiplier',type:'float',defval:2,legacyDefval:1},SOURCE,{key:'exponential',title:'Exponential',type:'bool',defval:true},{key:'bandsStyle',title:'Bands style',type:'string',defval:'average true range',options:['average true range','true range','range'],legacyDefval:'true range'},{key:'atrLength',title:'ATR length',defval:10,...LENGTH_2000,legacyOmit:true}],
  // Pre-fix boolean "Use true range" (true = "true range"); stored instances are rewritten to Bands style on load.
  retiredInputs:[{key:'trueRange',title:'Use true range',type:'bool',defval:true,replacedBy:'bandsStyle'}],
  migrate(inputs){const out={...inputs};if(typeof out.trueRange==='boolean'){if(!Object.hasOwn(out,'bandsStyle'))out.bandsStyle=out.trueRange?'true range':'range';delete out.trueRange;}return out;},
  plots:[{id:'upper',label:'Upper',color:'#0094ff',width:1},{id:'basis',label:'Basis',color:'#0094ff',width:1},{id:'lower',label:'Lower',color:'#0094ff',width:1}],band:'plots',fill:{color:'#0094ff',opacity:5},
  provenance:[{url:F+'kc.std',facts:'name Keltner channels, short title KC.'},{url:F+'kc.input.length',facts:'inputs Length 20 (1..2000), Multiplier 1 (unbounded), Source close, Exponential true, Bands style [range, true range] = true range.'},{url:F+'kc.plot.KeltnerUpper',facts:'Upper, Basis, Lower all #0094ff width 1.'},{url:F+'kc.fill.areaBackground',facts:'#0094ff transparency 95.'},{url:HELP+'keltner-channels-kc',facts:'Basis = moving average of Source over Length (simple or exponential); bands = basis +/- multiplier x range average (ATR or high-low range); Length default 20; Source default Close; the article example uses a 20-period EMA and multiplier 2.'},{url:AC,facts:'keltner channels: length 20, mult 1, usetruerange true.'}],
  unknownDefaults:['Multiplier 1 is the common default; the article example uses 2. Use exponential MA = true follows the article example.','Bands style Average True Range and ATR length 10 are the defaults for new instances; KCs saved before keep true range.'],
  policies:['Average true range = Wilder RMA of the true range (first bar high - low) over ATR length. True range and range = the basis MA type over true range or high - low over Length (the OpenCandle reading kept for saved KCs).'],
  calculate({bars,source,tk,num,bool,str,has}){const n=num('length'),average=bool('exponential')?tk.emaSmaSeed:tk.sma,basis=average(source,n),style=!has('bandsStyle')&&has('trueRange')?(bool('trueRange')?'true range':'range'):str('bandsStyle'),width=style==='average true range'?tk.rma(tk.trueRange(bars),num('atrLength')):average(style==='true range'?tk.trueRange(bars):bars.map(bar=>bar.high-bar.low),n),m=num('multiplier');
   return {upper:basis.map((value,i)=>finite(value)&&finite(width[i])?value+m*(width[i] as number):null),basis,lower:basis.map((value,i)=>finite(value)&&finite(width[i])?value-m*(width[i] as number):null)};},
  warmup:value=>Math.max(value('length'),value('atrLength')),work:(count,value)=>count*(value('length')*2+32)},
 {id:'dc',name:'Donchian channels',acronym:'DC',overlay:true,inputs:[{key:'length',title:'Length',defval:20,...LENGTH_2000}],plots:[{id:'basis',label:'Basis',color:'#ff6a00',width:1},{id:'upper',label:'Upper',color:'#0094ff',width:1},{id:'lower',label:'Lower',color:'#0094ff',width:1}],band:'plots',fill:{color:'#0094ff',opacity:5},
  provenance:[{url:F+'dc.std',facts:'name Donchian channels, short title DC.'},{url:F+'dc.input.length',facts:'Length 20, 1..2000.'},{url:F+'dc.plot.DonchianBasis',facts:'Basis #ff6a00, Upper/Lower #0094ff, width 1.'},{url:F+'dc.fill.areaBackground',facts:'#0094ff transparency 95.'},{url:HELP+'donchian-channels-dc',facts:'Upper = highest high over Length; Lower = lowest low; Basis = (upper + lower) / 2; Length default 20; Offset default 0.'},{url:AC,facts:'donchian channels: length 20, offset 0.'}],
  policies:['Offset uses the shared OpenCandle display offset.'],
  calculate({bars,num}){const n=num('length'),h=highs(bars),l=lows(bars),upper=bars.map((_,i)=>extreme(h,i,n,'max')),lower=bars.map((_,i)=>extreme(l,i,n,'min'));return {basis:upper.map((value,i)=>value!==null&&lower[i]!==null?(value+(lower[i] as number))/2:null),upper,lower};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')*2},
 {id:'env',name:'Envelope',acronym:'Env',overlay:true,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:20,...LENGTH_2000},{key:'percent',title:'Percent',type:'float',defval:10},SOURCE,{key:'exponential',title:'Exponential',type:'bool',defval:false}],
  // Pre-fix independent upper/lower percentages. Equal stored values are rewritten to Percent on load; unequal ones are kept and honored until Percent is edited.
  retiredInputs:[{key:'upperPercent',title:'Upper percentage',type:'float',defval:10,min:0,max:100000,step:0.1,replacedBy:'percent'},{key:'lowerPercent',title:'Lower percentage',type:'float',defval:10,min:0,max:100,step:0.1,replacedBy:'percent'}],
  migrate(inputs){const out={...inputs};if(!Object.hasOwn(out,'upperPercent')&&!Object.hasOwn(out,'lowerPercent'))return out;const upper=out.upperPercent??10,lower=out.lowerPercent??10;if(upper===lower&&(!Object.hasOwn(out,'percent')||out.percent===upper)){delete out.upperPercent;delete out.lowerPercent;out.percent=upper;}return out;},
  plots:[{id:'basis',label:'Basis',color:'#ff6a00',width:1},{id:'upper',label:'Upper',color:'#0094ff',width:1},{id:'lower',label:'Lower',color:'#0094ff',width:1}],band:'plots',fill:{color:'#0094ff',opacity:5},
  provenance:[{url:HELP+'envelope-env',facts:'Basis = moving average of Source over Length; upper = basis + basis x percent; lower = basis - basis x percent (example 20-period SMA, 10%); Length default 20; Source default Close; Exponential selects the MA.'},{url:F+'env.std',facts:'name Envelope, short title Env.'},{url:F+'env.input.percent',facts:'inputs in order Length 20 (1..2000), Percent 10 (float, unbounded), Source close, Exponential false.'},{url:F+'env.plot.envbasis',facts:'Basis #ff6a00, Upper/Lower #0094ff, width 1.'},{url:F+'env.fill.areaBackground',facts:'#0094ff transparency 95.'}],
  policies:['One Percent offsets both bands. A saved pre-fix instance with different upper and lower percentages keeps them until Percent is edited.'],
  calculate({source,tk,num,bool,has}){const basis=(bool('exponential')?tk.emaSmaSeed:tk.sma)(source,num('length')),u=(has('upperPercent')?num('upperPercent'):num('percent'))/100,d=(has('lowerPercent')?num('lowerPercent'):num('percent'))/100;return {basis,upper:basis.map(value=>finite(value)?value*(1+u):null),lower:basis.map(value=>finite(value)?value*(1-d):null)};},
  warmup:value=>value('length'),work:count=>count*80},
 {id:'lsma',name:'Least squares moving average',acronym:'LSMA',overlay:true,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:25,...LENGTH},{key:'regressionOffset',title:'Regression offset',type:'int',defval:0,min:-100000,max:100000,step:1},SOURCE],plots:[{id:'lsma',label:'LSMA'}],
  provenance:[{url:F+'lsma.std',facts:'name Least squares moving average, short title LSMA (inputs and styles not cached).'},{url:HELP+'least-squares-moving-average',facts:'A linear regression is fitted to Source over Length on each bar; Length default 25, Offset default 0, Source default close; overlay.'},{url:AC,facts:'least squares moving average: length 25, offset 0.'}],
  policies:['Least-squares line over bars 0..Length-1 of the window, evaluated at position Length - 1 - offset (offset 0 = the current bar).'],
  calculate({source,num}){const n=num('length'),offset=num('regressionOffset');return {lsma:source.map((_,i)=>{if(i<n-1)return null;let sx=0,sy=0,sxx=0,sxy=0;for(let k=0;k<n;k++){const y=source[i-n+1+k];if(!finite(y))return null;sx+=k;sy+=y;sxx+=k*k;sxy+=k*y;}const denominator=n*sxx-sx*sx,slope=denominator===0?0:(n*sxy-sx*sy)/denominator,intercept=(sy-slope*sx)/n;return intercept+slope*(n-1-offset);})};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')*4},
 {id:'wma',name:'Weighted moving average',acronym:'WMA',overlay:true,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:9,...LENGTH_10000},SOURCE],plots:[{id:'wma',label:'MA',color:'#3a61a5',width:1}],
  provenance:[{url:F+'wma.std',facts:'name Weighted moving average, short title WMA.'},{url:F+'wma.input.length',facts:'Length 9 (1..10000); Offset 0 (-500..500, wma.input.offset).'},{url:F+'wma.plot.MovAvgWeighted',facts:'MA #3a61a5 width 1.'},{url:HELP+'weighted-moving-average',facts:'Recent prices receive more weight (formula published as an image).'},{url:AC,facts:'moving average weighted: length 9, offset 0, source close.'}],
  policies:['Linear weights 1..Length, newest heaviest, divided by Length x (Length + 1) / 2.'],
  calculate({source,tk,num}){return {wma:tk.wma(source,num('length'))};},warmup:value=>value('length'),work:(count,value)=>count*value('length')},
 {id:'hma',name:'Hull moving average',acronym:'HMA',overlay:true,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:9,...LENGTH_10000},{...SOURCE,title:'Price'}],plots:[{id:'hma',label:'Hull MA',color:'#674ea7',width:1}],
  provenance:[{url:F+'hma.std',facts:'name Hull moving average, short title HMA.'},{url:F+'hma.input.src',facts:'Length 9 (1..10000); source label Price (fact input id src; the OpenCandle key source is kept for stored state and indicator-on-indicator sources).'},{url:F+'hma.plot.hma',facts:'Hull MA #674ea7 width 1.'},{url:HELP+'hull-moving-average',facts:'HMA = WMA(2 x WMA(n/2) - WMA(n), sqrt(n)).'},{url:AC,facts:'hull moving average.length: 9.'}],
  policies:['n/2 and sqrt(n) are rounded down (minimum 1); the rounding is not stated in the article.'],
  calculate({source,tk,num}){const n=num('length'),half=tk.wma(source,Math.max(1,Math.floor(n/2))),full=tk.wma(source,n),raw=half.map((value,i)=>finite(value)&&finite(full[i])?2*value-(full[i] as number):null);return {hma:tk.wma(raw,Math.max(1,Math.floor(Math.sqrt(n))))};},
  warmup:value=>value('length')+Math.max(1,Math.floor(Math.sqrt(value('length'))))-1,work:(count,value)=>count*value('length')*3},
 {id:'smma',name:'Smoothed moving average',acronym:'Smoothed MA',overlay:true,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:7,...LENGTH,legacyDefval:9},SOURCE],plots:[{id:'smma',label:'SMMA'}],
  provenance:[{url:F+'smma.std',facts:'name Smoothed moving average, short title Smoothed MA (inputs and styles not cached).'},{url:HELP+'smoothed-moving-average',facts:'Default period 9; default source close.'},{url:AC,facts:'smoothed moving average: length 7, source close (differs from the article).'}],
  unknownDefaults:['Length 7 is the default for new instances; saved instances without a stored length keep 9.'],
  policies:['Wilder smoothing (the OpenCandle SMMA/RMA): first value = SMA of the first Length values, then (prior x (Length - 1) + value) / Length. The article\'s wording of the recurrence is ambiguous.'],
  calculate({source,tk,num}){return {smma:tk.rma(source,num('length'))};},warmup:value=>value('length'),work:count=>count*8},
 ...R23_INDICATORS,
 ...VP_INDICATORS,
 ...R27_INDICATORS,
 ...R28_INDICATORS,
 ...R29_INDICATORS,
 ...PATTERN_INDICATORS,
 ...R40_INDICATORS,...R40_VOLUME_INDICATORS,...IND1028_INDICATORS,...IND1030_INDICATORS,...INDGAPS_INDICATORS,...INDGAPS2_INDICATORS,...INDGAPS3_INDICATORS,...TRADING_SESSION_DEFINITIONS,...SEASONALITY_DEFINITIONS,
 AUTO_TRENDLINES_DEFINITION,AUTO_ELLIOTT_DEFINITION,
] as CatalogDefinition[]);
/** An id index over the frozen catalog (the first row of an id wins, as find() did). The indicator port's source assertion
 * calls this many times per calculation; the linear find cost about 4 ms per symbol switch with three indicators. */
let catalogIndex:Map<string,CatalogDefinition>|null=null;
export const catalogDefinition=(kind:string):CatalogDefinition|undefined=>{if(!catalogIndex){catalogIndex=new Map();for(const row of CATALOG_INDICATORS)if(!catalogIndex.has(row.id))catalogIndex.set(row.id,row);}return typeof kind==='string'?catalogIndex.get(kind):CATALOG_INDICATORS.find(row=>row.id===kind);};
/** The search keywords of a catalog kind joined by spaces ('' when none). */
export const catalogKeywords=(kind:string):string=>catalogDefinition(kind)?.keywords?.join(' ')??'';
/** Current and retired inputs (retired ones are accepted only from stored state). */
export const catalogInputField=(definition:CatalogDefinition,key:string):CatalogInput|CatalogRetiredInput|undefined=>definition.inputs.find(row=>row.key===key)??definition.retiredInputs?.find(row=>row.key===key);
/** Bounds a stored value may hold: the edit bounds widened by storedMin/storedMax. Undefined = unbounded. */
export const catalogStoredBounds=(field:CatalogInput):{min?:number;max?:number}=>({min:field.storedMin??field.min,max:field.storedMax??field.max});
const boundsText=(min?:number,max?:number)=>min===undefined&&max===undefined?'':min===undefined?` no greater than ${max}`:max===undefined?` no less than ${min}`:` from ${min} through ${max}`;
/** Effective input value (stored-state bounds); omission means the documented/LV default. */
export function catalogInputValue(definition:CatalogDefinition,inputs:Record<string,unknown>,key:string):number|boolean|string{
 const field=catalogInputField(definition,key);if(!field)throw new Error(`Unsupported ${definition.acronym} input: ${key}`);
 const value=Object.hasOwn(inputs,key)?inputs[key]:field.legacyOmit&&field.legacyDefval!==undefined?field.legacyDefval:field.defval;// legacyOmit + legacyDefval: a stored instance without the key keeps the old value while new instances get defval
 if(field.type==='bool'){if(typeof value!=='boolean')throw new Error(`${field.title} must be true or false.`);return value;}
 if(field.type==='string'){if(typeof value!=='string'||field.options&&!field.options.includes(value))throw new Error(`${field.title} must be one of ${field.options?.join(', ')}.`);return value;}
 const {min,max}=catalogStoredBounds(field);
 if(typeof value!=='number'||!Number.isFinite(value)||field.type==='int'&&!Number.isSafeInteger(value)||min!==undefined&&value<min||max!==undefined&&value>max)throw new Error(`${field.title} must be ${field.type==='int'?'an integer':'a finite number'}${boundsText(min,max)}.`);
 return value;
}
/** Lossless rewrite of stored inputs into the current input shape (identity for kinds without retired inputs). */
export function migrateCatalogInputs(kind:string,inputs:Record<string,unknown>):Record<string,unknown>{const definition=catalogDefinition(kind);return definition?.migrate?definition.migrate(inputs):inputs;}
