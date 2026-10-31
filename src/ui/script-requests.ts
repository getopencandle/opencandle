import {captureScriptRequestOrigin,retainScriptRequestSeriesEvidence,retainResolvedScriptRequestReceipt} from './script-request-export-proof';
import {cellSessionDataset,cellSessionRefusal,rawCellSessionDataset,sameCellSessionFeedBasis,type CellSession} from '../chart/cell-session';
import {sameChartSourceBasis,sourceContextForDataset,sessionRequestSource,type ChartSourceContext} from '../chart/source-context';
import type {Bar,BarDataset} from '../domain/types';
import {chooseIntervalSource,intervalDatasetKey,parseInterval,type AggregationPolicy,type DerivedIntervalDataset,type IntervalResult} from '../domain/intervals';
import {chartBarEnd} from '../domain/indicator-resample';
import {isDerivedStyle} from '../chart/derived/common';
import {parseSymbolMath} from '../domain/symbol-math';
import {sourcePivotCalendar} from '../domain/indicators-ext/r23-catalog';

/**
 * Other symbols and other intervals for CandleScript (`requests` in a script definition, read with ctx.request).
 *
 * Data rules. A request reads only a dataset the app already holds (the loaded universe the chart, compare and interval
 * menus use) and picks its bars with chooseIntervalSource, the same exact-or-aggregated rule the interval menu applies.
 * Nothing is fetched here and no new provider is reached.
 *
 * No lookahead. A requested bar is visible on a chart bar only once the requested bar's own period has ended by the end
 * of that chart bar. A daily bar therefore first appears on the chart bar that closes the day, never on an earlier bar,
 * and a historical chart bar never sees a later requested bar. Periods follow the default UTC calendar policy
 * (chartBarEnd); an aggregated dataset uses its recorded bucket ends instead.
 *
 * When no loaded dataset can serve a request, the app's symbol loader opens it on
 * demand (installScriptSymbolLoader; App backs it with the second-symbol feeds, so the same feed limit, open
 * delay, Alpaca 30-symbol cap and closing apply). Until the series arrives the request fails with the loader's plain
 * "SPY is loading." and the script recalculates when it arrives (notifyScriptRequestData). The alignment and the
 * provenance rules above are unchanged: a loaded series is aligned the same way, and synthetic loaded data makes the run
 * synthetic. Feeds a chart script uses stay open while the script is on a chart (script-request-demand.ts); feeds other
 * runs use (script alerts, editor runs) are kept for SCRIPT_REQUEST_LEASE_MS after their last use.
 */
export const SCRIPT_REQUEST_LIMIT=4;
export const SCRIPT_REQUEST_LEASE_MS=120_000;
export interface ScriptRequestDeclaration {id:string;symbol:string|null;interval:string|null}
/** The chart a script runs on. A null resolution means the chart has no time interval (event or derived bars).
 * `owner:'chart'` marks a run of a script bound to a chart, whose feeds the grid demand keeps open. */
export interface ScriptRequestBase {datasetId:string;resolution:string|null;owner?:'chart';sessionOverride?:CellSession['session'];source?:ChartSourceContext}
/** What the symbol loader has for one symbol and interval. */
export interface ScriptSymbolFeed {state:'ready'|'loading'|'unavailable';message:string|null;dataset:BarDataset|null}
export type ScriptSymbolLoader=(symbol:string,resolution:string)=>ScriptSymbolFeed;
/** The loader key of a request: the canonical symbol (or expression) and the interval, as the second-symbol feeds use. */
export const scriptRequestKey=(symbol:string,resolution:string)=>symbol+'\u0000'+resolution;
/** The canonical text of a requested ticker or symbol math expression, or null when it is neither. */
export function canonicalRequestSymbol(symbol:string):string|null{const parsed=parseSymbolMath(String(symbol??'').trim().toUpperCase());return parsed.ok?parsed.expression.canonical:null;}
export interface ScriptRequestSeries {bars:readonly Bar[];resolution:string;ends?:readonly number[];label:string;fixture:boolean}
export type ScriptRequestResolver=(request:ScriptRequestDeclaration,base:ScriptRequestBase)=>ScriptRequestSeries;
/** What a dataset resolver also knows. `loadedOnly` resolves from the loaded datasets and never opens a feed
 * (ctx.symbol); `calendarFor` is the chart source's session calendar (ctx.timeframe). Both are optional for test resolvers. */
export interface ScriptDatasetResolverExtras {loadedOnly?:ScriptRequestResolver;calendarFor?:(base:ScriptRequestBase)=>'us-equity'|'utc'|null}
export interface ScriptRequestRow {time:number;open:number;high:number;low:number;close:number;volume:number|null}
export interface ResolvedScriptRequests {rows:Record<string,Array<ScriptRequestRow|null>>;labels:string[];fixture:boolean}

/** Only time-based chart styles can align requests. Derived styles (Renko, Kagi and the like) have no period per bar. */
export function scriptRequestBase(source:{datasetId:string;resolution?:string;basisIdentity?:string;revision?:string;fixture?:boolean;label?:string;sessionOverride?:CellSession['session']},style:string):ScriptRequestBase{return{datasetId:source.datasetId,resolution:isDerivedStyle(style)?null:source.resolution??null,...(source.sessionOverride?{sessionOverride:source.sessionOverride,source:sessionRequestSource(source as ChartSourceContext)}:{})};}
/** Cheap gate for the declaration pass. A script without the word `requests` cannot declare any. */
export function declaresScriptRequests(source:string):boolean{return/\b(requests|timeframes|symbols)\b/.test(source);}

function timeSpec(resolution:string,what:string){
 let spec;try{spec=parseInterval(resolution);}catch{throw new Error(what+' interval '+resolution+' is not a supported time interval.');}
 if(spec.kind!=='time')throw new Error(what+' uses '+spec.id+' event bars. Script requests need time intervals.');
 return spec;
}
/** The end of each requested bar's period (its recorded bucket end, else the UTC calendar end). */
export function scriptRequestEnds(series:ScriptRequestSeries):number[]{return requestEnds(series);}
function requestEnds(series:ScriptRequestSeries):number[]{
 if(series.ends){if(series.ends.length!==series.bars.length)throw new Error('Requested bucket ends do not match the requested bars.');return[...series.ends];}
 const spec=timeSpec(series.resolution,'The requested');return series.bars.map(bar=>chartBarEnd(bar.time,spec));
}
/** One row per chart bar: the last requested bar whose period ended by the end of that chart bar, else null. */
export function alignScriptRequest(chartBars:readonly Bar[],chartResolution:string|null,series:ScriptRequestSeries):Array<ScriptRequestRow|null>{
 if(!chartResolution)throw new Error('Script requests need a chart with a time interval. This chart style or source has none.');
 const chart=timeSpec(chartResolution,'The chart'),ends=requestEnds(series),bars=series.bars;
 for(let i=1;i<bars.length;i++)if(!(bars[i].time>bars[i-1].time)||ends[i]<ends[i-1])throw new Error('Requested bars must have strictly increasing times.');
 const rows:Array<ScriptRequestRow|null>=[];let j=-1;
 for(const bar of chartBars){
  const end=chartBarEnd(bar.time,chart);
  while(j+1<bars.length&&ends[j+1]<=end)j++;
  const row=j<0?null:bars[j];
  rows.push(row?{time:row.time,open:row.open,high:row.high,low:row.low,close:row.close,volume:Number.isFinite(row.volume)&&row.volume>=0?row.volume:null}:null);
 }
 return rows;
}
export function resolveScriptRequests(declarations:readonly ScriptRequestDeclaration[],chartBars:readonly Bar[],base:ScriptRequestBase,resolver:ScriptRequestResolver):ResolvedScriptRequests{
 if(declarations.length>SCRIPT_REQUEST_LIMIT)throw new Error('A script may declare at most '+SCRIPT_REQUEST_LIMIT+' requests.');
 const rows:Record<string,Array<ScriptRequestRow|null>>=Object.create(null),labels:string[]=[],entries:Array<{id:string;series:ScriptRequestSeries}>=[];let fixture=false;
 for(const declaration of declarations){
  let series:ScriptRequestSeries;
  try{series=resolver(declaration,base);}catch(error){throw new Error('Request '+declaration.id+': '+(error instanceof Error?error.message:String(error)));}
  rows[declaration.id]=alignScriptRequest(chartBars,base.resolution,series);entries.push({id:declaration.id,series});labels.push(declaration.id+' = '+series.label+(series.fixture?' (synthetic)':''));fixture||=series.fixture;
 }
 const result={rows:{...rows},labels,fixture};retainResolvedScriptRequestReceipt(result,declarations,base,entries);return result;
}
const nominalSeconds=(resolution:string)=>{try{const spec=parseInterval(resolution);return spec.seconds??(spec.unit==='day'?86400:spec.unit==='week'?604800:2419200)*spec.multiplier;}catch{return Infinity;}};
/**
 * Resolve a request from loaded datasets. The symbol matches an instrument symbol (any case) or an exact instrument id;
 * no symbol means the chart's own instrument. The interval defaults to the chart interval. When no exact interval is
 * loaded, one original finer source of the same provider is aggregated; sources from different providers are refused
 * as ambiguous, never picked for the user.
 */
export function createDatasetRequestResolver(input:{datasets:readonly BarDataset[];policy?:AggregationPolicy;load?:ScriptSymbolLoader|null;now?:()=>number}):ScriptRequestResolver&ScriptDatasetResolverExtras{
 const resolver:ScriptRequestResolver&ScriptDatasetResolverExtras=datasetRequestResolver(input);
 // The same rules over the same loaded datasets with the on-demand loader switched off.
 if(input.load!==null)resolver.loadedOnly=datasetRequestResolver({...input,load:null});else resolver.loadedOnly=resolver;
 resolver.calendarFor=base=>{const matches=input.datasets.filter(row=>row.provenance.datasetId===base.datasetId);if(matches.length!==1)return null;return sourcePivotCalendar(matches[0].instrument.assetClass,matches[0].instrument.timezone)??null;};
 return resolver;
}
function datasetRequestResolver(input:{datasets:readonly BarDataset[];policy?:AggregationPolicy;load?:ScriptSymbolLoader|null;now?:()=>number}):ScriptRequestResolver{
 return(request,base)=>{
  const supplied=input.datasets,chartMatches=supplied.filter(row=>row.provenance.datasetId===base.datasetId);
  if(base.sessionOverride&&chartMatches.length!==1)throw Error('The exact chart session source is missing or ambiguous.');
  const chartDataset=chartMatches[0]??null;
  const ownChartSymbol=!!chartDataset&&(request.symbol===null||request.symbol===chartDataset.instrument.id||canonicalRequestSymbol(request.symbol)===canonicalRequestSymbol(chartDataset.instrument.symbol));
  if(base.sessionOverride&&(!chartDataset||!base.source||!sameChartSourceBasis(sourceContextForDataset(cellSessionDataset(chartDataset,{session:base.sessionOverride})),base.source,true)))throw Error('The chart trading session source changed before this request.');
  if(base.sessionOverride&&base.source)sessionRequestSource(base.source);
  const datasets=base.sessionOverride?supplied.map(rawCellSessionDataset):supplied;
  const requestView=(dataset:BarDataset)=>base.sessionOverride?cellSessionDataset(dataset,{session:base.sessionOverride}):dataset;
  const target=request.interval??base.resolution;
  // Open the series through the symbol loader when the loaded data cannot serve it. Without a loader
  // (tests, a secondary window) the plain refusal stays.
  const loadOnDemand=(symbol:string|null,refusal:string):ScriptRequestSeries=>{
   const load=input.load===undefined?installedLoader:input.load,canonical=symbol===null?null:base.sessionOverride&&ownChartSymbol&&chartDataset?canonicalRequestSymbol(chartDataset.instrument.symbol):canonicalRequestSymbol(symbol);
   if(!load||!canonical||!target)throw new Error(refusal);
   if(base.owner!=='chart')leaseRequest(scriptRequestKey(canonical,target),(input.now??Date.now)());
   const feed=load(canonical,target);
   if(feed.state!=='ready'||!feed.dataset)throw new Error(feed.message??canonical+' is loading.');
   const raw=feed.dataset;
   if(base.sessionOverride&&chartDataset&&ownChartSymbol&&!sameCellSessionFeedBasis(raw,chartDataset))throw Error('The loaded history does not match this chart source.');
   const origin=captureScriptRequestOrigin(raw),dataset=requestView(raw),provenance=dataset.provenance;
   if(dataset.resolution!==target)throw new Error(canonical+' was loaded at '+dataset.resolution+', not at the requested interval '+target+'.');
   const synthetic=provenance.fixture===true||provenance.providerId==='alpaca-stub'||/^SYNTHETIC/.test(provenance.providerName);
   const series={bars:dataset.bars,resolution:dataset.resolution,label:dataset.instrument.symbol+' '+dataset.resolution+' from '+provenance.providerName,fixture:synthetic};retainScriptRequestSeriesEvidence(series,dataset,origin);return series;
  };
  let instrumentId:string;
  if(request.symbol===null){if(!chartDataset)throw new Error('The chart source is not among the loaded datasets.');instrumentId=chartDataset.instrument.id;}
  else{
   const wanted=request.symbol.toUpperCase(),ids=[...new Set(datasets.filter(row=>row.instrument.id===request.symbol||row.instrument.symbol.toUpperCase()===wanted).map(row=>row.instrument.id))];
   if(!ids.length)return loadOnDemand(request.symbol,'No loaded data for '+request.symbol+'. Open, import or compare it first; scripts read only data the app already has.');
   if(ids.length>1&&!(chartDataset&&ids.includes(chartDataset.instrument.id)))throw new Error('More than one loaded instrument is called '+request.symbol+'. Use its exact instrument id.');
   instrumentId=ids.length>1?chartDataset!.instrument.id:ids[0];
  }
  if(!target)throw new Error('The chart has no time interval, so the request needs an explicit interval.');
  const candidates=base.sessionOverride&&ownChartSymbol&&chartDataset?datasets.filter(row=>sameCellSessionFeedBasis(row,chartDataset)):datasets;
  const requestDatasets=base.sessionOverride?candidates.filter(row=>cellSessionRefusal(row,base.sessionOverride)===null).map(requestView):candidates;
  const choose=(selection:{instrumentId:string;target:string;sourceKey?:string;policy?:AggregationPolicy})=>{
   let origin:ReturnType<typeof captureScriptRequestOrigin>=null;
   try{const canonical=(value:string)=>{try{return parseInterval(value).id;}catch{return value;}},matches=requestDatasets.filter(dataset=>dataset.instrument.id===selection.instrumentId&&(selection.sourceKey?intervalDatasetKey(dataset)===selection.sourceKey:canonical(dataset.resolution)===canonical(selection.target)));
    // Retain the actual original source BEFORE interval selection clones or replaces its provenance.
    origin=matches.length===1?captureScriptRequestOrigin(matches[0]):null;
   }catch{/* An unavailable export proof never changes interval selection or loading behavior. */}
   return {result:chooseIntervalSource(requestDatasets,selection),origin};
  };
  let selected=choose({instrumentId,target,policy:input.policy}),result:IntervalResult=selected.result,origin=selected.origin;
  if(!result.ok&&result.code==='SOURCE_REQUIRED'){
   const built=result.candidates.filter(choice=>!choice.derived&&!choice.exact).map(choice=>({choice,...choose({instrumentId,target,sourceKey:choice.key,policy:input.policy})})).filter(row=>row.result.ok);
   // intervalDatasetKey is [instrument, provider, dataset, resolution].
   const providers=new Set(built.map(row=>String(JSON.parse(row.choice.key)[1])));
   if(built.length&&providers.size===1){const chosen=built.sort((a,b)=>nominalSeconds(b.choice.resolution)-nominalSeconds(a.choice.resolution))[0];result=chosen.result;origin=chosen.origin;}
   else if(built.length>1)throw new Error('Several loaded sources could build '+target+' for '+(request.symbol??'this symbol')+'. Load the exact interval so no source is picked automatically.');
  }
  // A loaded symbol at an interval nothing loaded can build is opened at that interval. The chart's own symbol (no symbol
  // given) is opened only for a live chart, so an imported chart never streams for its own requests.
  if(!result.ok)return loadOnDemand(request.symbol??(chartDataset&&chartDataset.provenance.datasetId.startsWith('live:')?chartDataset.instrument.symbol:null),result.message);
  const dataset=result.dataset,derivation=(dataset as DerivedIntervalDataset).derivation;
  const series={bars:dataset.bars,resolution:dataset.resolution,...(derivation?.buckets?.length===dataset.bars.length?{ends:derivation.buckets.map(row=>row.end)}:{}),label:dataset.instrument.symbol+' '+dataset.resolution+' from '+dataset.provenance.providerName,fixture:dataset.provenance.fixture};retainScriptRequestSeriesEvidence(series,dataset,origin);return series;
 };
}

// The app installs one resolver over its loaded datasets. Chart scripts and script alerts read it at run time.
let installed:{resolver:ScriptRequestResolver}|null=null,revision=0;const listeners=new Set<()=>void>();
const notify=()=>{revision++;for(const listener of [...listeners])try{listener();}catch{/* a listener failure never blocks the others */}};
export function installScriptRequestResolver(resolver:ScriptRequestResolver):()=>void{const token={resolver};installed=token;notify();return()=>{if(installed===token){installed=null;notify();}};}
export function currentScriptRequestResolver():ScriptRequestResolver|null{return installed?.resolver??null;}
/** Changes whenever the installed resolver (and so the loaded data behind it) changes. */
export function scriptRequestRevision():number{return revision;}
export function subscribeScriptRequestResolver(listener:()=>void):()=>void{listeners.add(listener);return()=>{listeners.delete(listener);};}

// The on-demand symbol loader (App installs one in the main window) and the leases of non-chart lookups.
let installedLoader:ScriptSymbolLoader|null=null;const leases=new Map<string,number>();
function leaseRequest(key:string,at:number){leases.delete(key);leases.set(key,at);while(leases.size>64)leases.delete(leases.keys().next().value!);}
export function installScriptSymbolLoader(loader:ScriptSymbolLoader):()=>void{installedLoader=loader;return()=>{if(installedLoader===loader)installedLoader=null;};}
/** A series a script requested arrived or changed: scripts with requests recalculate. */
export function notifyScriptRequestData():void{notify();}
/** Loader keys a script alert or an editor run used within SCRIPT_REQUEST_LEASE_MS; expired leases are dropped. */
export function leasedScriptRequestKeys(now=Date.now()):Set<string>{const keys=new Set<string>();for(const [key,at] of [...leases]){if(now-at<SCRIPT_REQUEST_LEASE_MS)keys.add(key);else leases.delete(key);}return keys;}
