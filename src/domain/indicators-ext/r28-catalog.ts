import type {NumericSeries} from '../types';
import type {CatalogContext,CatalogDefinition,CatalogInput} from '../indicator-catalog';
import {parseSymbolMath} from '../symbol-math';
import {alignSecondCloses} from '../second-symbol';

/**
 * Indicators that read a second symbol through the new "Symbol" context input. The second series is opened
 * through the same loaders as a chart (a live feed, an import, or a symbol math expression) at the chart's interval and
 * aligned on exact bar times (CatalogChartContext.secondSeries, src/domain/second-symbol.ts).
 *
 * Every name, input title, default, color and
 * width is our own choice and listed in `unknownDefaults`. Formulas are textbook (cited per definition). Calculations are
 * original code.
 */
export const R28_INDICATOR_IDS=['correlation','relstrength','spread'] as const;
export type R28IndicatorId=typeof R28_INDICATOR_IDS[number];

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const zero=(value:number)=>value===0?0:value;
const LENGTH={type:'int' as const,min:1,max:5000,step:1};
const LENGTH_2={type:'int' as const,min:2,max:5000,step:1};
const SOURCE:CatalogInput={key:'source',title:'Source',type:'string',defval:'close',options:['open','high','low','close','hl2','hlc3','ohlc4']};
/** The context input "Symbol": a ticker or a symbol math expression. Default SPY (our own benchmark). */
export const SECOND_SYMBOL_INPUT:CatalogInput={key:'symbol',title:'Symbol',type:'string',defval:'SPY'};
const LV='lv-defined:';
const UNKNOWN='The name, input titles, defaults, colors and widths are OpenCandle-defined.';
const BLUE='#2962ff',ORANGE='#ff6d00',GREY='#787b86';
const SECOND_POLICIES=['The second symbol is loaded at the chart interval through the chart loaders (live feed, import or symbol math) and aligned on exact bar times. A chart bar with no second-symbol bar at the same time is unavailable; nothing is filled or carried forward.','While the second symbol is loading, or when it cannot be opened, the indicator shows why and plots nothing.'];

/** The second series' closes aligned to the chart bars, or a thrown plain message (shown as the indicator diagnostic). */
export function secondCloses(ctx:Pick<CatalogContext,'bars'|'str'|'chart'>):(number|null)[]{
 const symbol=String(ctx.str('symbol')??'').trim().toUpperCase();
 const parsed=parseSymbolMath(symbol);if(!parsed.ok)throw new Error(`Symbol: ${parsed.error}`);
 const lookup=ctx.chart?.secondSeries;if(!lookup)throw new Error(`${symbol} is not loaded. Second symbols load on a chart.`);
 const series=lookup(parsed.expression.canonical);
 if(!series.bars)throw new Error(series.message??(series.state==='loading'?`${symbol} is loading.`:`${symbol} is unavailable.`));
 return alignSecondCloses(ctx.bars,series.bars);
}
/** Pearson correlation of two windows, both complete; null when either is flat. */
export function pearson(a:readonly (number|null)[],b:readonly (number|null)[],index:number,window:number):number|null{
 if(index<window-1)return null;let sa=0,sb=0;
 for(let i=index-window+1;i<=index;i++){const x=a[i],y=b[i];if(!finite(x)||!finite(y))return null;sa+=x;sb+=y;}
 const ma=sa/window,mb=sb/window;let cov=0,va=0,vb=0;
 for(let i=index-window+1;i<=index;i++){const x=(a[i] as number)-ma,y=(b[i] as number)-mb;cov+=x*y;va+=x*x;vb+=y*y;}
 if(va===0||vb===0)return null;const r=cov/Math.sqrt(va*vb);return zero(Math.max(-1,Math.min(1,r)));
}
const pairwise=(a:readonly (number|null)[],b:readonly (number|null)[],f:(x:number,y:number)=>number|null):NumericSeries=>a.map((x,i)=>{const y=b[i];if(!finite(x)||!finite(y))return null;const out=f(x,y);return out===null||!Number.isFinite(out)?null:zero(out);});

const definitions:CatalogDefinition[]=[
 {id:'correlation',name:'Correlation coefficient',acronym:'CC',overlay:false,secondSymbol:true,sourceSeries:true,
  inputs:[SECOND_SYMBOL_INPUT,SOURCE,{key:'length',title:'Length',defval:20,...LENGTH_2}],
  plots:[{id:'correlation',label:'Correlation',color:BLUE,width:2}],guides:[{id:'upper',value:1,color:GREY},{id:'zero',value:0,color:GREY},{id:'lower',value:-1,color:GREY}],
  provenance:[{url:LV+'pearson-product-moment-correlation',facts:'Pearson correlation of the chart Source and the second symbol close over Length bars: r = sum((x - mean x)(y - mean y)) / sqrt(sum((x - mean x)^2) x sum((y - mean y)^2)).'}],
  unknownDefaults:[UNKNOWN,'Symbol SPY, Length 20 and Source close are OpenCandle-defined.'],
  policies:[...SECOND_POLICIES,'A window with a missing value on either side is unavailable. A flat window (zero variance on either side) is unavailable, not 0.'],
  calculate(ctx){const other=secondCloses(ctx),n=ctx.num('length');return {correlation:ctx.bars.map((_,i)=>pearson(ctx.source,other,i,n))};},
  warmup:value=>value('length'),work:(count,value)=>count*(2*value('length')+4)},
 {id:'relstrength',name:'Relative strength vs benchmark',acronym:'RS',overlay:false,secondSymbol:true,sourceSeries:true,
  inputs:[{...SECOND_SYMBOL_INPUT,title:'Benchmark'},SOURCE,{key:'length',title:'MA length',defval:20,...LENGTH}],
  plots:[{id:'rs',label:'RS',color:BLUE,width:2},{id:'ma',label:'RS MA',color:ORANGE,width:1}],
  provenance:[{url:LV+'comparative-relative-strength',facts:'Comparative relative strength: the chart Source divided by the benchmark close, bar by bar; the MA is the simple moving average of that ratio over MA length bars.'}],
  unknownDefaults:[UNKNOWN,'Benchmark SPY (owner direction), MA length 20 and Source close are OpenCandle-defined. The ratio is not rescaled.'],
  policies:[...SECOND_POLICIES,'A benchmark close of zero makes that bar unavailable.'],
  calculate(ctx){const other=secondCloses(ctx),rs=pairwise(ctx.source,other,(x,y)=>y===0?null:x/y);return {rs,ma:ctx.tk.sma(rs,ctx.num('length'))};},
  warmup:value=>value('length'),work:(count,value)=>count*(value('length')+4)},
 {id:'spread',name:'Spread',acronym:'Spread',overlay:false,secondSymbol:true,sourceSeries:true,
  inputs:[SECOND_SYMBOL_INPUT,SOURCE,{key:'multiplier',title:'Multiplier',type:'float',defval:1,min:-1000000,max:1000000,step:0.1}],
  plots:[{id:'spread',label:'Spread',color:BLUE,width:2}],guides:[{id:'zero',value:0,color:GREY}],
  provenance:[{url:LV+'price-spread',facts:'Spread: the chart Source minus Multiplier times the second symbol close, bar by bar.'}],
  unknownDefaults:[UNKNOWN,'Symbol SPY, Multiplier 1 and Source close are OpenCandle-defined.'],
  policies:[...SECOND_POLICIES],
  calculate(ctx){const other=secondCloses(ctx),m=ctx.num('multiplier');return {spread:pairwise(ctx.source,other,(x,y)=>x-m*y)};},
  warmup:()=>1,work:count=>count*4},
];
export const R28_INDICATORS:readonly CatalogDefinition[]=definitions;
