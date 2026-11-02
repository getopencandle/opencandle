import type {NumericSeries} from '../types';
import type {CatalogContext,CatalogDefinition} from '../indicator-catalog';
import {parseInterval} from '../intervals';
import {FUNDAMENTALS_TEXT,type FundamentalsState} from '../fundamentals-source';
import {PIT_METRICS,computeFundamentalSeries,createPeBands,emptyPitSeries,type PitCompany} from '../../fundamentals/pit-metrics';
import type {PeBandsEngine} from '../../fundamentals/pit-metrics';
import type {PeBandsRequest,PitChart,PitDisplay,PitMetricKey,PitMetricSpec,PitPeriod,PitRevisions,PitStamps} from '../../fundamentals/pit-types';

/**
 * Company fundamentals on the chart, from SEC company filings (src/fundamentals/pit-*.ts): `fundamental` plots one metric
 * in its own pane, `pebands` draws P/E bands on price. Values step forward from the moment each filing became public and
 * are never interpolated. Every name, input, default and color is OpenCandle-defined.
 */
export const FUNDAMENTALS_INDICATOR_IDS=['fundamental','pebands'] as const;
export type FundamentalsIndicatorId=typeof FUNDAMENTALS_INDICATOR_IDS[number];
export const isFundamentalsIndicator=(id:string):boolean=>(FUNDAMENTALS_INDICATOR_IDS as readonly string[]).includes(id);

/** What the calculation reports besides its plots (IndicatorResult.fundamentals). fundamentalStamps.index[i] is the
 *  stamp row of bar i (-1 none); gapNotes[i] says why bar i is empty; reason is set when the whole series is empty. */
export interface FundamentalsOutput {fundamentalStamps:PitStamps;gapNotes:(string|null)[];reason:string|null;notes:string[];state:FundamentalsState['state']}

const METRIC_KEYS=PIT_METRICS.map(row=>row.key);
const metricSpec=(key:string):PitMetricSpec|undefined=>PIT_METRICS.find(row=>row.key===key);
/** Ratios (and FCF per share) always use trailing twelve months and their own value. */
export const fundamentalUsesTtm=(metric:unknown):boolean=>{const row=metricSpec(String(metric));return !!row&&(row.ratio||row.key==='fcf_ps');};
export const FUNDAMENTAL_TTM_TITLE='Ratios always use TTM';
export const FUNDAMENTAL_YOY_TITLE='Year over year growth applies to statement values only';
/** The text each stored option key shows in the settings. */
export const FUNDAMENTALS_OPTION_LABELS:Readonly<Record<string,Readonly<Record<string,string>>>>=Object.freeze({
 metric:Object.freeze(Object.fromEntries(PIT_METRICS.map(row=>[row.key,row.label]))),
 period:Object.freeze({ttm:'TTM',quarterly:'Quarterly',annual:'Annual'}),
 display:Object.freeze({value:'Value',yoy:'YoY %'}),
 revisions:Object.freeze({first:'First filed',latest:'Latest filed'}),
 mode:Object.freeze({own:'Own history',multiples:'Multiples'}),
 bands:Object.freeze({percentile:'Percentiles 25/75',sigma:'Plus or minus 1 sigma'}),
});
const PERIOD_SHORT:Readonly<Record<string,string>>={ttm:'TTM',quarterly:'Q',annual:'FY'};
/** Legend title of a `fundamental` instance: the metric's short name ("P/E", "Revenue"). */
export function fundamentalLegendTitle(inputs:Record<string,unknown>):string{return metricSpec(String(inputs.metric??'pe'))?.short??'Fundamental';}
/** Legend arguments: "TTM", "Q YoY %", "FY latest filed"; P/E bands: "5y" or "15 20 25". */
export function fundamentalsLegendArguments(kind:string,inputs:Record<string,unknown>):string[]{
 if(kind==='pebands'){
  const mode=String(inputs.mode??'own'),latest=inputs.revisions==='latest'?['latest filed']:[];
  if(mode==='multiples')return [...[inputs.multiple1??15,inputs.multiple2??20,inputs.multiple3??25].map(value=>String(value)),...latest];
  return [String(inputs.lookback??5)+'y',...latest];
 }
 const metric=String(inputs.metric??'pe'),ttm=fundamentalUsesTtm(metric),chosen=String(inputs.period??'ttm');
 // Point-in-time values (market cap, P/B, balance sheet amounts, share counts) are never trailing twelve months: ratios on
 // them carry no period, and balance values only say FY when limited to fiscal year ends.
 const period=POINT_IN_TIME_METRICS.has(metric)?(ttm||chosen!=='annual'?[]:['FY']):[ttm?'TTM':PERIOD_SHORT[chosen]??'TTM'];
 return [...period,...(!ttm&&inputs.display==='yoy'?['YoY %']:[]),...(inputs.revisions==='latest'?['latest filed']:[])];
}
/** Metrics measured at one date (a balance sheet instant, or price times one), not over a period. */
export const POINT_IN_TIME_METRICS:ReadonlySet<string>=new Set(['mcap','pb','shares','current_ratio','liab_equity']);
/** The name an instance is shown by (On this chart, settings titles, data window): the legend title and arguments,
 *  for example "P/E TTM", "Revenue Q YoY %", "Market cap" or "P/E bands 5y". */
export function fundamentalsInstanceTitle(kind:string,inputs:Record<string,unknown>):string{
 return [kind==='fundamental'?fundamentalLegendTitle(inputs):'P/E bands',...fundamentalsLegendArguments(kind,inputs)].join(' ');
}
/** How a metric's values read: compact money and counts (K, M, B, T), a % suffix for percentages and growth, x for ratios. */
export function fundamentalValueFormat(kind:string,inputs:Record<string,unknown>):{suffix:string;compact:boolean}{
 if(kind!=='fundamental')return {suffix:'',compact:false};
 const row=metricSpec(String(inputs.metric??'pe'));if(!row)return {suffix:'',compact:false};
 const yoy=!fundamentalUsesTtm(row.key)&&inputs.display==='yoy';
 return {suffix:yoy||row.measure==='percent'?'%':row.measure==='ratio'?'x':'',compact:!yoy&&(row.measure==='money'||row.measure==='count')};
}
const COMPACT_UNITS=[[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']] as const;
/** A `fundamental` value as text: "466.82B", "28.41x", "45.20%", "8.71" (decimals: 2 unless the instance sets them). */
export function formatFundamentalValue(value:number,kind:string,inputs:Record<string,unknown>,decimals=2):string{
 const format=fundamentalValueFormat(kind,inputs),magnitude=Math.abs(value),unit=format.compact?COMPACT_UNITS.find(([scale])=>magnitude>=scale):undefined;
 let text=(unit?value/unit[0]:value).toFixed(decimals);if(text.startsWith('-')&&Number(text)===0)text=text.slice(1);
 return text+(unit?unit[1]:'')+format.suffix;
}
/** A price-scale label for a `fundamental` pane: one unit (K, M, B, T) for the whole visible range [low, high], with just
 *  enough decimals to tell neighbouring ticks apart ("4.8T", "5.0T", "5.2T"); % and x suffixes for ratio metrics. */
export function formatFundamentalAxisValue(value:number,kind:string,inputs:Record<string,unknown>,low:number,high:number):string{
 const format=fundamentalValueFormat(kind,inputs),reach=Math.max(Math.abs(low),Math.abs(high)),unit=format.compact?COMPACT_UNITS.find(([scale])=>reach>=scale):undefined;
 const step=(Math.abs(high-low)/(unit?unit[0]:1))/4,decimals=Number.isFinite(step)&&step>0?Math.min(3,Math.max(0,Math.ceil(-Math.log10(step)-1e-9))):2;
 let text=(unit?value/unit[0]:value).toFixed(decimals);if(text.startsWith("-")&&Number(text)===0)text=text.slice(1);
 return text+(unit?unit[1]:"")+format.suffix;
}
/** Statement values draw as steps (Columns is offered in Style); ratios draw as a line. */
export const fundamentalPlotKind=(metric:unknown):'step'|'line'=>{const row=metricSpec(String(metric));return row&&!row.ratio&&row.key!=='fcf_ps'?'step':'line';};

/** Plot colors, measured against the light chart background #ffffff and the dark ones #232734 and #0f0f0f (WCAG
 *  contrast): value #3d8bd4 3.59 / 4.14 / 5.33; median #c2771f 3.53 / 4.22 / 5.43; bands #7f8a9e 3.48 / 4.27 / 5.51;
 *  multiples #3a9a6c 3.49 / 4.26 / 5.49, #c2771f, #c45fa0 3.82 / 3.89 / 5.01; Graham #9b6bd6 3.84 / 3.87 / 4.99. */
export const FUNDAMENTALS_COLORS=Object.freeze({value:'#3d8bd4',median:'#c2771f',band:'#7f8a9e',m1:'#3a9a6c',m2:'#c2771f',m3:'#c45fa0',graham:'#9b6bd6'});
const LV='lv-defined:';
const UNKNOWN='The names, inputs, defaults, colors and widths are OpenCandle-defined.';
const POLICIES=['A value is shown from the first bar that ends after the filing was accepted by SEC (or, when the acceptance time is unknown, after the next New York session following the filing date). Values step forward and are never interpolated.','Ratios use each bar\'s own close and trailing twelve months of filings. Nothing is converted between currencies, and ratios are not computed on total-return prices.','Without company data loaded on the chart, the plots stay empty and the reason is shown.'];
const nulls=(n:number):NumericSeries=>new Array(n).fill(null);
function chartOf(ctx:CatalogContext):PitChart|string{
 const resolution=ctx.chart?.resolution??null;let interval;try{if(!resolution)throw new Error();interval=parseInterval(resolution);}catch{return FUNDAMENTALS_TEXT.interval;}
 const facts=ctx.chart?.fundamentals?.facts;
 return {bars:ctx.bars,interval,adjustment:facts?.adjustment??'unknown',currency:facts?.currency??null};
}
/** The company for this calculation, or the reason there is none. */
function companyOf(ctx:CatalogContext):{company:PitCompany;state:FundamentalsState}|{reason:string;state:FundamentalsState['state']}{
 const lookup=ctx.chart?.fundamentals;if(!lookup)return {reason:FUNDAMENTALS_TEXT.noService,state:'unavailable'};
 let state:FundamentalsState;try{state=lookup.company();}catch(error){return {reason:error instanceof Error?error.message:String(error),state:'unavailable'};}
 if(!state.company)return {reason:state.reason??FUNDAMENTALS_TEXT.noService,state:state.state==='ready'?'unavailable':state.state};
 return {company:state.company,state};
}
function publish(ctx:CatalogContext,output:FundamentalsOutput){
 ctx.fundamentals?.(output);
 if(output.reason)ctx.diagnostic?.(output.reason);
}
const str=<T extends string>(ctx:CatalogContext,key:string)=>ctx.str(key) as T;
const engines=new WeakMap<PitCompany,Map<string,PeBandsEngine>>();
/** One band engine per company, settings and interval, so its per-date window is reused across recalculations. */
function bandEngine(company:PitCompany,request:PeBandsRequest,resolution:string|null):PeBandsEngine{
 let byKey=engines.get(company);if(!byKey){byKey=new Map();engines.set(company,byKey);}
 const key=JSON.stringify([request,resolution]);let engine=byKey.get(key);
 if(!engine){engine=createPeBands(company,request);byKey.set(key,engine);if(byKey.size>32)byKey.delete(byKey.keys().next().value!);}
 return engine;
}
const BAND_PLOTS=['median','upper','lower','m1','m2','m3','graham'] as const;
/** The data window note on a bar where a P/E band line is left empty because it is far from the close. */
export const OFF_SCALE='Off scale';

const definitions:CatalogDefinition[]=[
 {id:'fundamental',name:'Company fundamental',acronym:'Fundamental',overlay:false,fundamentals:true,
  keywords:['fundamentals','sec','filing','earnings','eps','revenue','pe','ratio','valuation','margin','cash flow','dividend','market cap'],
  inputs:[
   {key:'metric',title:'Metric',type:'string',defval:'pe',options:METRIC_KEYS},
   {key:'period',title:'Period',type:'string',defval:'ttm',options:['ttm','quarterly','annual']},
   {key:'display',title:'Display',type:'string',defval:'value',options:['value','yoy']},
   {key:'revisions',title:'Revisions',type:'string',defval:'first',options:['first','latest']},
  ],
  plots:[{id:'value',label:'Value',color:FUNDAMENTALS_COLORS.value,width:2}],
  provenance:[{url:LV+'sec-company-fundamentals',facts:'One company metric per bar from SEC company filings: statement values (reported, year to date differences, full year less nine months, sums of four quarters) and price ratios on the bar close (P/E = close / TTM diluted EPS; P/S, P/B and P/FCF on close x shares outstanding).'}],
  unknownDefaults:[UNKNOWN,'P/E, TTM, Value and First filed are the defaults for a new instance.'],
  policies:POLICIES,
  calculate(ctx){
   const n=ctx.bars.length,found=companyOf(ctx);
   if('reason' in found){publish(ctx,{...emptyPitSeries(n,found.reason),state:found.state});return {value:nulls(n)};}
   const chart=chartOf(ctx);if(typeof chart==='string'){publish(ctx,{...emptyPitSeries(n,chart),state:'unavailable'});return {value:nulls(n)};}
   const metric=str<PitMetricKey>(ctx,'metric'),ttm=fundamentalUsesTtm(metric);
   const series=computeFundamentalSeries(found.company,chart,{metric,period:ttm?'ttm':str<PitPeriod>(ctx,'period'),display:ttm?'value':str<PitDisplay>(ctx,'display'),revisions:str<PitRevisions>(ctx,'revisions')});
   publish(ctx,{fundamentalStamps:series.fundamentalStamps,gapNotes:series.gapNotes,reason:series.reason,notes:series.notes,state:series.reason?'unavailable':'ready'});
   return {value:series.values};
  },
  warmup:()=>1,work:count=>count*40},
 {id:'pebands',name:'P/E bands',acronym:'P/E bands',overlay:true,fundamentals:true,
  keywords:['fundamentals','sec','pe','price earnings','valuation','bands','graham'],
  inputs:[
   {key:'mode',title:'Mode',type:'string',defval:'own',options:['own','multiples']},
   {key:'lookback',title:'Lookback (years)',type:'int',defval:5,min:1,max:30,step:1},
   {key:'bands',title:'Bands',type:'string',defval:'percentile',options:['percentile','sigma']},
   {key:'multiple1',title:'Multiple 1',type:'float',defval:15,min:0.1,max:1000,step:0.5},
   {key:'multiple2',title:'Multiple 2',type:'float',defval:20,min:0.1,max:1000,step:0.5},
   {key:'multiple3',title:'Multiple 3',type:'float',defval:25,min:0.1,max:1000,step:0.5},
   {key:'graham',title:'Graham number (TTM variant)',type:'bool',defval:false},
   {key:'revisions',title:'Revisions',type:'string',defval:'first',options:['first','latest']},
  ],
  plots:[
   {id:'median',label:'Median',color:FUNDAMENTALS_COLORS.median,width:1,lineStyle:'dotted'},
   {id:'upper',label:'Upper band',color:FUNDAMENTALS_COLORS.band,width:1,lineStyle:'dotted',priceScale:false},
   {id:'lower',label:'Lower band',color:FUNDAMENTALS_COLORS.band,width:1,lineStyle:'dotted',priceScale:false},
   {id:'m1',label:'Multiple 1',color:FUNDAMENTALS_COLORS.m1,width:1,lineStyle:'dotted',priceScale:false},
   {id:'m2',label:'Multiple 2',color:FUNDAMENTALS_COLORS.m2,width:1,lineStyle:'dotted',priceScale:false},
   {id:'m3',label:'Multiple 3',color:FUNDAMENTALS_COLORS.m3,width:1,lineStyle:'dotted',priceScale:false},
   {id:'graham',label:'Graham number',color:FUNDAMENTALS_COLORS.graham,width:1,lineStyle:'dotted',priceScale:false},
  ],
  provenance:[{url:LV+'pe-bands',facts:'Own history: the 25th, 50th and 75th percentiles (or mean plus or minus one standard deviation) of one P/E per New York date over the trailing lookback, times TTM diluted EPS. Multiples: each multiple times TTM diluted EPS. Graham number (TTM variant) = square root of 22.5 x TTM EPS x book value per share.'}],
  unknownDefaults:[UNKNOWN,'Own history, 5 years, percentiles 25/75, multiples 15/20/25 and Graham off are the defaults for a new instance.'],
  policies:[...POLICIES,'Own-history bands use only P/E values known at each bar (dates with negative EPS are skipped) and need one year of them first.','A band, multiple or Graham line beyond half to twice the bar close is left empty there (the data window says Off scale) so it does not squash the price scale.'],
  calculate(ctx){
   const n=ctx.bars.length,empty=()=>Object.fromEntries(BAND_PLOTS.map(id=>[id,nulls(n)])) as Record<string,NumericSeries>,found=companyOf(ctx);
   if('reason' in found){publish(ctx,{...emptyPitSeries(n,found.reason),state:found.state});return empty();}
   const chart=chartOf(ctx);if(typeof chart==='string'){publish(ctx,{...emptyPitSeries(n,chart),state:'unavailable'});return empty();}
   const request:PeBandsRequest={mode:str<'own'|'multiples'>(ctx,'mode'),lookbackYears:ctx.num('lookback'),bands:str<'percentile'|'sigma'>(ctx,'bands'),multiples:[ctx.num('multiple1'),ctx.num('multiple2'),ctx.num('multiple3')],graham:ctx.bool('graham'),revisions:str<PitRevisions>(ctx,'revisions')};
   const result=bandEngine(found.company,request,ctx.chart?.resolution??null).compute(chart),gapNotes=[...result.gapNotes],m1=[...result.m1],m2=[...result.m2],m3=[...result.m3];
   // Display only: a line far from the close (an own-history band, a multiple or the Graham number) would stretch the
   // price scale, so it is left empty there and the data window says "Off scale".
   const median=[...result.median],upper=[...result.upper],lower=[...result.lower],graham=[...result.graham];
   for(let i=0;i<n;i++){const close=ctx.bars[i].close;let off=false;for(const line of [median,upper,lower,m1,m2,m3,graham]){const v=line[i];if(v!==null&&(v<close*0.5||v>close*2)){line[i]=null;off=true;}}if(off&&gapNotes[i]===null)gapNotes[i]=OFF_SCALE;}
   publish(ctx,{fundamentalStamps:result.fundamentalStamps,gapNotes,reason:result.reason,notes:result.notes,state:result.reason?'unavailable':'ready'});
   return {median,upper,lower,m1,m2,m3,graham};
  },
  warmup:()=>1,work:count=>count*60},
];
export const FUNDAMENTALS_INDICATORS:readonly CatalogDefinition[]=definitions;
