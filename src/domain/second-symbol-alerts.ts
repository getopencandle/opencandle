import type {Bar} from './types';
import type {AlertScalarSource,AlertSourceSnapshot} from './alert-observation';
import type {LocalAlert} from './alerts';
import {catalogDefinition,catalogInputValue} from './indicator-catalog';
import {parseSymbolMath,symbolMathComponentSource} from './symbol-math';
import {ALPACA_SYMBOL} from './alpaca-live';
import type {SecondSeries} from './second-symbol';

/**
 * Alerts on the two-symbol indicators (Correlation coefficient, Relative strength, Spread), on the chart
 * and in the background. Every rule here is our own choice.
 *
 * The second series is opened through the second-symbol registry and App loader (the same feeds, 8-feed LRU,
 * open delay, retry, Alpaca cap and closing rules as indicators and script requests), at the alert's own interval, and
 * aligned on exact bar times. Before a source is evaluated, `secondSymbolAlertGate` decides:
 *
 * - **ready**: every second series it reads is loaded and settled, and has its bar for the endpoint. The calculation then
 *   reads exactly the gated bars, cut at the endpoint time (no lookahead: a later second-symbol bar is never read).
 * - **loading** (the series is opening, backfilling, or cannot open): the alert waits, gapped. It is not evaluated, so no
 *   value is computed on partial data, and its stream is marked as a gap: the first value once the series is ready starts
 *   a fresh crossing baseline (no missed crossing is invented).
 * - **hold** (the series is live but its bar for the endpoint has not arrived, or is still forming while the endpoint bar
 *   has closed): the alert waits without a gap. Its stream keeps its last value, so when the bar arrives the crossing is
 *   evaluated once, against that value.
 *
 * A static second series (an import) never holds: a bar it does not have is unavailable, as on the chart.
 */
export interface SecondSymbolRead {name:string;symbol:string}
export type SecondSymbolGate=
 |{kind:'ready';series:ReadonlyMap<string,readonly Bar[]>}
 |{kind:'loading'|'hold';reason:string};

const scalarOperands=(source:AlertSourceSnapshot):AlertScalarSource[]=>source.kind==='comparison'?[source.left,source.right]:[source];
/** The second symbols (canonical text) a source reads. A frozen symbol that does not parse is left to the calculation,
 *  which reports it as the indicator diagnostic. */
export function alertSecondSymbolReads(source:AlertSourceSnapshot):SecondSymbolRead[]{
 const reads:SecondSymbolRead[]=[];
 for(const operand of scalarOperands(source)){
  if(operand.kind!=='indicator')continue;
  const definition=catalogDefinition(operand.indicator);if(!definition?.secondSymbol)continue;
  let raw:unknown;try{raw=catalogInputValue(definition,operand.inputs??{},'symbol');}catch{continue;}
  const parsed=parseSymbolMath(String(raw??'').trim().toUpperCase());if(!parsed.ok)continue;
  if(!reads.some(row=>row.symbol===parsed.expression.canonical))reads.push({name:definition.name,symbol:parsed.expression.canonical});
 }
 return reads;
}
/** Decide whether a source can be evaluated at the endpoint `endTime` (see the module header). `closed`: the endpoint bar
 *  has closed (a bar-close observation, a replay or a non-live source). */
export function secondSymbolAlertGate(reads:readonly SecondSymbolRead[],input:{endTime:number;closed:boolean;lookup:(symbol:string)=>SecondSeries}):SecondSymbolGate{
 const series=new Map<string,readonly Bar[]>();
 for(const read of reads){
  let found:SecondSeries;try{found=input.lookup(read.symbol);}catch(error){found={bars:null,state:'unavailable',message:error instanceof Error?error.message:String(error)};}
  const waits=`${read.name} waits for ${read.symbol}`;
  if(found.state!=='ready'||!found.bars||!found.bars.length){
   const detail=found.state==='unavailable'&&found.message?found.message:'it is loading.';
   return{kind:'loading',reason:`${waits}: ${detail} The alert resumes when it is ready, from a fresh baseline.`};
  }
  const bars=found.bars,last=bars[bars.length-1];
  if(found.live){
   if(last.time<input.endTime)return{kind:'hold',reason:`${waits}: its bar for this time has not arrived yet.`};
   const forming=typeof found.formingTime==='number'&&Number.isFinite(found.formingTime)?found.formingTime:null;
   if(input.closed&&forming===input.endTime)return{kind:'hold',reason:`${waits}: its bar for this time is still forming.`};
  }
  series.set(read.symbol,last.time<=input.endTime?bars:bars.filter(bar=>bar.time<=input.endTime));
 }
 return{kind:'ready',series};
}
/** The resolution of an alert's bound dataset (from its live dataset id, else the interval of its basis identity). */
export function alertBoundResolution(alert:LocalAlert):string|null{
 const binding=alert.definition.observationBinding;if(!binding||binding.schemaVersion!==2)return null;
 try{
  const key:unknown=JSON.parse(binding.datasetKey);if(!Array.isArray(key))return null;
  const live=typeof key[9]==='string'?/^live:[a-z0-9-]+:[^:]+:([^:]+)$/.exec(key[9]):null;
  if(live)return live[1];
  return typeof key[10]==='string'&&key[10].length<=40?key[10]:null;
 }catch{return null;}
}
const watchable=(alert:LocalAlert)=>['active','waiting-for-data'].includes(alert.status)&&alert.definition.mode==='ordinary';
/** Feed keys (`<symbol>\0<resolution>`, the App loader keys) the saved, running alerts read. A feed no key, chart indicator,
 *  script or lease names is closed (closing when unused). Paused, stopped and expired alerts do not keep a feed open. */
export function alertSecondSymbolDemand(alerts:readonly LocalAlert[]|null|undefined):Set<string>{
 const keys=new Set<string>();
 for(const alert of alerts??[]){
  const source=alert.definition.observationBinding?.source;if(!source||!watchable(alert))continue;
  const reads=alertSecondSymbolReads(source);if(!reads.length)continue;
  const resolution=alertBoundResolution(alert);if(!resolution)continue;
  for(const read of reads)keys.add(read.symbol+'\u0000'+resolution);
 }
 return keys;
}
/** The Alpaca-shaped symbols the second series of a source would stream (a ticker, or each component of an expression),
 *  for the 30-symbol cap. Coinbase products do not count. */
export function alertSecondSymbolAlpaca(source:AlertSourceSnapshot):string[]{
 const symbols=new Set<string>();
 for(const read of alertSecondSymbolReads(source)){
  const parsed=parseSymbolMath(read.symbol);if(!parsed.ok)continue;
  for(const symbol of parsed.expression.symbols)if(symbolMathComponentSource(symbol)==='alpaca-or-import'&&ALPACA_SYMBOL.test(symbol))symbols.add(symbol);
 }
 return [...symbols];
}
