import type {AdjustmentBasis,Bar,BarDataset,DataState,Instrument} from './types';
import type {LiveHandle} from './live-provider';
import {ALPACA_CAP_MESSAGE,ALPACA_MAX_SYMBOLS,ALPACA_STUB_PROVIDER_ID,ALPACA_STUB_PROVIDER_NAME,isAlpacaSyntheticStub} from './alpaca-live';
import {stampLiveLineage} from '../chart/bar-input-identity';
import {LIVE_NO_MORE_DATA,LiveHistoryPager,liveAlertBars,recordLiveOrigin,registerLiveHistory,unregisterLiveHistory,type LiveHistoryPage,type LiveHistoryState} from './live-history';
import {combineSymbolMathBars,parseSymbolMath,symbolMathComponentSource,type SymbolMathExpression} from './symbol-math';

/**
 * A derived (symbol math) series is a live source of its own, built from component feeds. It implements the
 * same LiveHandle contract as the Alpaca and Coinbase providers, so the chart, legend, data window, indicators,
 * drawings, alerts and the live registry treat it like any other live chart. Each component's own feed drives updates:
 * every component snapshot recomputes the derived bars. Pure renderer code: the component feeds are opened through the
 * caller's opener (the app's normal loaders); nothing here fetches.
 *
 * Labels: the symbol is the canonical expression (GME/SPY); the source reads "Derived: <expression> from
 * <component sources>". Derived bars are computed from real feeds, so they are never synthetic-fixture data. In a keyless
 * stub run every component is the SYNTHETIC Alpaca stub: the source then says SYNTHETIC first and `fixture` is set. A mix of
 * synthetic and real components is refused.
 */
export const SYMBOL_MATH_PROVIDER_ID='lv-symbol-math';
export const SYMBOL_MATH_EXCHANGE='DERIVED';
/** `live:lv-symbol-math:<canonical>:<interval>`. The canonical text never contains a colon. */
export const symbolMathDatasetId=(canonical:string,resolution:string)=>`live:${SYMBOL_MATH_PROVIDER_ID}:${canonical}:${resolution}`;
export const isSymbolMathDatasetId=(datasetId:unknown):boolean=>typeof datasetId==='string'&&datasetId.startsWith(`live:${SYMBOL_MATH_PROVIDER_ID}:`);
/** The expression and interval of a derived dataset id, or null. */
export function symbolMathRefOf(datasetId:unknown):{expression:SymbolMathExpression;resolution:string}|null{
 if(!isSymbolMathDatasetId(datasetId))return null;
 const rest=(datasetId as string).slice(`live:${SYMBOL_MATH_PROVIDER_ID}:`.length),cut=rest.lastIndexOf(':');if(cut<1)return null;
 const parsed=parseSymbolMath(rest.slice(0,cut));if(!parsed.ok||parsed.expression.canonical!==rest.slice(0,cut))return null;
 const resolution=rest.slice(cut+1);return resolution?{expression:parsed.expression,resolution}:null;
}
export const SYMBOL_MATH_TICK_SIZE=0.0001;
/** Derived price decimals (chart/symbol-precision.ts derivedPriceDecimals). */
export {derivedPriceDecimals} from '../chart/symbol-precision';
export const SYMBOL_MATH_COVERAGE='Computed bar by bar from its component feeds; only bar times that every component has';
export const SYMBOL_MATH_NOTES:readonly string[]=Object.freeze([
 'Derived series (symbol math): open and close apply the expression to the component opens and closes; high and low are the largest and smallest of the expression of the opens, highs, lows and closes.',
 'Only bar times present in every component are shown. Nothing is filled or carried forward. A division by zero leaves that bar out.',
 'A derived series has no volume.',
]);

/** The derived instrument depends on the expression only, so the stand-in and the live series are the same instrument:
 * US tickers give a New York 'stock' (sessions and Extended trading hours apply), Coinbase products a UTC
 * 'crypto' instrument, a mix 'other' in UTC. Currency is USD for every live source here; values are never converted. */
export function symbolMathInstrument(canonical:string):Instrument{
 const parsed=parseSymbolMath(canonical),sources=new Set(parsed.ok?parsed.expression.symbols.map(symbolMathComponentSource):[]);
 const kind=sources.size!==1?'other':sources.has('coinbase')?'crypto':'stock';
 return{id:`${SYMBOL_MATH_EXCHANGE}:${canonical}`,symbol:canonical,name:`Derived: ${canonical}`,exchange:SYMBOL_MATH_EXCHANGE,currency:'USD',assetClass:kind,tickSize:SYMBOL_MATH_TICK_SIZE,lotSize:1,timezone:kind==='stock'?'America/New_York':'UTC'};
}
/** An empty, labelled derived dataset (connecting or disconnected stand-in) under the id the feed will use. */
export function symbolMathPlaceholder(canonical:string,resolution:string,state:DataState,message?:string):BarDataset{
 const instrument=symbolMathInstrument(canonical);
 return{instrument,bars:[],resolution,provenance:{providerId:SYMBOL_MATH_PROVIDER_ID,providerName:`Derived: ${canonical}`,datasetId:symbolMathDatasetId(canonical,resolution),fixture:false,
  coverage:state==='loading'?'Connecting to the component feeds':'Disconnected: '+(message??'the component feeds are not open'),asOf:0,delaySeconds:null,adjustment:'unknown',session:'unknown',timezone:instrument.timezone,state,
  license:'Derived from the component sources; each source license applies.',revision:'derived-v1:not-connected',notes:message?[message,...SYMBOL_MATH_NOTES]:[...SYMBOL_MATH_NOTES]}};
}

const STATE_RANK:Record<DataState,number>={ready:0,loading:1,stale:2,unavailable:3,disconnected:4,error:5};
const syntheticSource=(dataset:BarDataset)=>dataset.provenance.fixture===true||dataset.provenance.providerId==='alpaca-stub'||/^SYNTHETIC/.test(dataset.provenance.providerName);
/** The one synthetic component a derived chart may use: the labelled keyless Alpaca stub of this run. */
const stubComponent=(dataset:BarDataset)=>isAlpacaSyntheticStub()&&dataset.provenance.providerId===ALPACA_STUB_PROVIDER_ID&&dataset.provenance.providerName===ALPACA_STUB_PROVIDER_NAME&&dataset.provenance.fixture===false;
/** No silent substitution. A derived chart is computed from real feeds only, or (keyless stub
 * run) from the SYNTHETIC Alpaca stub only; any other mix is refused when it opens. */
export const SYNTHETIC_DERIVED_MIX_REFUSAL='A derived chart cannot mix SYNTHETIC stub data with other data. Every component must be the SYNTHETIC Alpaca stub, or none of them.';
export const SYNTHETIC_DERIVED_PREFIX='SYNTHETIC · ';
/** A derived feed computed only from the labelled keyless stub (fixture set, SYNTHETIC label), in a stub run.
 * The strict-source gate (workspace-grid suppliedSourceId) accepts this one kind of synthetic live source. */
export function isStubDerivedDataset(dataset:BarDataset|null|undefined):boolean{
 if(!dataset?.provenance||!dataset.instrument)return false;
 const p=dataset.provenance;
 return isAlpacaSyntheticStub()&&p.providerId===SYMBOL_MATH_PROVIDER_ID&&isSymbolMathDatasetId(p.datasetId)&&p.fixture===true&&typeof p.providerName==='string'&&p.providerName.startsWith(SYNTHETIC_DERIVED_PREFIX+'Derived: ')&&dataset.instrument.exchange===SYMBOL_MATH_EXCHANGE;
}
/** The mix refusal for a set of component snapshots, or null when they are all real or all the labelled stub. */
function syntheticMixError(datasets:readonly BarDataset[]):string|null{
 const synthetic=datasets.filter(syntheticSource);
 if(!synthetic.length)return null;
 return synthetic.length===datasets.length&&datasets.every(stubComponent)?null:SYNTHETIC_DERIVED_MIX_REFUSAL;
}
/** A component that never changes (an import): a LiveHandle with no updates. */
export function staticComponentHandle(dataset:BarDataset):LiveHandle{
 return{datasetId:dataset.provenance.datasetId,dataset:()=>dataset,formingTime:()=>null,onChange:()=>()=>{},close:()=>{}};
}
/** Opens one component feed (or a static import) for the derived series. Throws a plain message when it cannot. */
export type SymbolMathComponentOpener=(symbol:string,resolution:string)=>LiveHandle;
export interface SymbolMathProviderOptions {
 /** Dash tickers the parser takes whole (imports such as BRK-B). */
 known?:(symbol:string)=>boolean;
 /** Which of these component tickers would open an Alpaca stream (not an import, not Coinbase). */
 alpacaComponents?:(symbols:readonly string[],resolution:string)=>string[];
 /** Alpaca symbols streaming now (every chart, comparison and background feed). */
 openAlpacaSymbols?:()=>ReadonlySet<string>;
 maxAlpacaSymbols?:number;
 now?:()=>number;
}
/** The Alpaca cap check for an expression: every component counts, a symbol already streaming does not count again. */
export function symbolMathCapError(canonical:string,alpacaComponents:readonly string[],open:ReadonlySet<string>,max=ALPACA_MAX_SYMBOLS):string|null{
 const added=alpacaComponents.filter(symbol=>!open.has(symbol));
 if(open.size+added.length<=max)return null;
 return `${canonical} needs ${alpacaComponents.length} Alpaca symbol${alpacaComponents.length===1?'':'s'} (${alpacaComponents.join(', ')}); ${added.length} more would go above the limit. ${ALPACA_CAP_MESSAGE}`;
}

/** One component of an open derived feed, for labels (the heading names each component's source). */
export interface SymbolMathComponentRow {symbol:string;providerId:string;providerName:string;state:DataState}
/** The latest component rows per open derived dataset id. Written by the provider that owns the feed, removed on release. */
const componentRowsById=new Map<string,{owner:object;rows:readonly SymbolMathComponentRow[]}>();
/** The components of an open derived feed (symbol, source id and name, state), or null when no derived
 * feed with this id is open (a restore stand-in, a closed feed). */
export function symbolMathComponentsOf(datasetId:unknown):readonly SymbolMathComponentRow[]|null{return typeof datasetId==='string'?componentRowsById.get(datasetId)?.rows??null:null;}
interface Entry {key:string;canonical:string;resolution:string;expression:SymbolMathExpression;components:Map<string,LiveHandle>;offs:Array<()=>void>;refs:number;listeners:Set<(dataset:BarDataset)=>void>;cached:BarDataset|null;seq:number;incarnation:number;dirty:boolean;history:LiveHistoryPager|null}
let incarnations=0;

export class SymbolMathProvider {
 private entries=new Map<string,Entry>();
 private disposed=false;
 constructor(private openComponent:SymbolMathComponentOpener,private options:SymbolMathProviderOptions={}){}
 /** The canonical expression and dataset id for text, or the plain parse error. */
 resolve(expression:string,resolution:string):{ok:true;canonical:string;datasetId:string;symbols:string[]}|{ok:false;error:string}{
  const parsed=parseSymbolMath(expression,this.options.known);if(!parsed.ok)return parsed;
  return{ok:true,canonical:parsed.expression.canonical,datasetId:symbolMathDatasetId(parsed.expression.canonical,resolution),symbols:parsed.expression.symbols};
 }
 open(expression:string,resolution:string):LiveHandle{
  if(this.disposed)throw new Error('The symbol math provider is closed.');
  const parsed=parseSymbolMath(expression,this.options.known);if(!parsed.ok)throw new Error(parsed.error);
  const canonical=parsed.expression.canonical,key=symbolMathDatasetId(canonical,resolution);
  let entry=this.entries.get(key);
  if(!entry){
   const symbols=parsed.expression.symbols;
   if(this.options.alpacaComponents&&this.options.openAlpacaSymbols){const cap=symbolMathCapError(canonical,this.options.alpacaComponents(symbols,resolution),this.options.openAlpacaSymbols(),this.options.maxAlpacaSymbols);if(cap)throw new Error(cap);}
   const components=new Map<string,LiveHandle>();
   try{for(const symbol of symbols){let handle:LiveHandle;try{handle=this.openComponent(symbol,resolution);}catch(cause){throw new Error(`${canonical}: ${symbol} could not be opened. ${cause instanceof Error?cause.message:String(cause)}`);}components.set(symbol,handle);}
    const mix=syntheticMixError([...components.values()].map(handle=>handle.dataset()));if(mix)throw new Error(`${canonical}: ${mix}`);}
   catch(error){for(const handle of components.values()){try{handle.close();}catch{/* best effort */}}throw error;}
   const created:Entry={key,canonical,resolution,expression:parsed.expression,components,offs:[],refs:0,listeners:new Set(),cached:null,seq:0,incarnation:++incarnations,dirty:true,history:null};
   for(const handle of components.values())created.offs.push(handle.onChange(()=>{created.dirty=true;this.notify(created);}));
   this.entries.set(key,created);entry=created;
   // Older history for the derived chart, paged through the component feeds' own pagers.
   created.history=new LiveHistoryPager(()=>this.pageOlder(created),this.options.now);registerLiveHistory(key,created.history);
  }
  entry.refs++;
  const owned=entry,mine=new Set<(dataset:BarDataset)=>void>();let closed=false;
  return{
   datasetId:key,
   dataset:()=>this.dataset(owned),
   formingTime:()=>this.formingTime(owned),
   onChange:listener=>{owned.listeners.add(listener);mine.add(listener);return()=>{owned.listeners.delete(listener);mine.delete(listener);};},
   close:()=>{if(closed)return;closed=true;for(const listener of mine)owned.listeners.delete(listener);if(--owned.refs<=0)this.release(owned);},
   loadOlder:()=>owned.history!.load(),
   historyState:()=>owned.history!.state(),
  };
 }
 /** Component tickers of every open derived series (for the Alpaca symbol count). */
 componentSymbols():string[]{return [...new Set([...this.entries.values()].flatMap(entry=>[...entry.components.keys()]))];}
 dispose():void{if(this.disposed)return;this.disposed=true;for(const entry of [...this.entries.values()])this.release(entry);}
 private release(entry:Entry){if(this.entries.get(entry.key)!==entry)return;this.entries.delete(entry.key);if(componentRowsById.get(entry.key)?.owner===entry)componentRowsById.delete(entry.key);if(entry.history)unregisterLiveHistory(entry.key,entry.history);entry.listeners.clear();for(const off of entry.offs){try{off();}catch{/* best effort */}}for(const handle of entry.components.values()){try{handle.close();}catch{/* best effort */}}}
 private notify(entry:Entry){if(!entry.listeners.size||this.entries.get(entry.key)!==entry)return;const dataset=this.dataset(entry);for(const listener of [...entry.listeners]){try{listener(dataset);}catch{/* a listener failure never stops the feed */}}}
 /**
  * One older page for a derived series. The derived series starts at the
  * latest first bar among its components, so only those limiting components are paged, each through its own feed pager
  * (one page in flight, spaced requests, the pause after a rate limit). Their prepends arrive as ordinary
  * component updates and the bars are recomputed with the same exact-time alignment. A limiting component at its limit
  * (or an import, which cannot page) ends paging with "No more data"; a failed component page is reported as failed.
  */
 private async pageOlder(entry:Entry):Promise<LiveHistoryPage>{
  if(this.entries.get(entry.key)!==entry)return{kind:'exhausted'};
  const rows=[...entry.components.values()].map(handle=>({handle,first:handle.dataset().bars[0]?.time}));
  if(!rows.length||rows.some(row=>row.first===undefined))return{kind:'error',message:'A component has no bars yet.'};
  const start=Math.max(...rows.map(row=>row.first!)),limiting=rows.filter(row=>row.first===start);
  const before=this.dataset(entry).bars[0]?.time??Infinity;
  const states=await Promise.all(limiting.map(row=>row.handle.loadOlder?row.handle.loadOlder().catch((cause):LiveHistoryState=>({status:'error',message:cause instanceof Error?cause.message:String(cause)})):Promise.resolve<LiveHistoryState>({status:'exhausted',message:LIVE_NO_MORE_DATA})));
  if(this.entries.get(entry.key)!==entry)return{kind:'exhausted'};
  let grew=false,ended=false,failure:string|null=null;
  for(let index=0;index<limiting.length;index++){const first=limiting[index].handle.dataset().bars[0]?.time,state=states[index];if(first!==undefined&&first<start)grew=true;else if(state.status==='exhausted')ended=true;else if(state.status==='error')failure=state.message??'Could not load older data.';}
  if(ended)return{kind:'exhausted'};
  if(failure!==null)return{kind:'error',message:failure,rateLimited:/rate limit/i.test(failure)};
  if(grew)entry.dirty=true;
  const bars=this.dataset(entry).bars;let added=0;while(added<bars.length&&bars[added].time<before)added++;
  return{kind:'added',added};
 }
 private formingTime(entry:Entry):number|null{const last=this.dataset(entry).bars.at(-1);if(!last)return null;return [...entry.components.values()].some(handle=>handle.formingTime()!==null)?last.time:null;}
 private dataset(entry:Entry):BarDataset{
  if(entry.cached&&!entry.dirty)return entry.cached;
  const snapshots=[...entry.components.entries()].map(([symbol,handle])=>({symbol,dataset:handle.dataset()}));
  const bars:Bar[]=combineSymbolMathBars(entry.expression.ast,new Map(snapshots.map(row=>[row.symbol,row.dataset.bars])));
  const synthetic=snapshots.some(row=>syntheticSource(row.dataset));
  const sources=[...new Set(snapshots.map(row=>row.dataset.provenance.providerName))];
  const state=snapshots.reduce<DataState>((worst,row)=>STATE_RANK[row.dataset.provenance.state]>STATE_RANK[worst]?row.dataset.provenance.state:worst,'ready');
  const adjustments=[...new Set(snapshots.map(row=>row.dataset.provenance.adjustment))];
  const delays=snapshots.map(row=>row.dataset.provenance.delaySeconds);
  const revision=`derived-v1:${entry.incarnation}:${snapshots.map(row=>row.dataset.provenance.revision).join('|')}`.slice(0,1024);

  const providerName=(synthetic?SYNTHETIC_DERIVED_PREFIX:'')+`Derived: ${entry.canonical} from ${sources.join(' + ')}`;
  const datasetId=entry.key;
  const notes=[...SYMBOL_MATH_NOTES,`${bars.length} bars computed from ${snapshots.map(row=>`${row.symbol} (${row.dataset.bars.length} bars, ${row.dataset.provenance.state})`).join(', ')}.`];
  for(const row of snapshots)if(row.dataset.provenance.state!=='ready'&&row.dataset.provenance.notes[0])notes.push(`${row.symbol}: ${row.dataset.provenance.notes[0]}`);
  try{stampLiveLineage(bars,`${datasetId}|${revision}`,++entry.seq);}catch{/* an unstampable array stays an ordinary input */}
  // Alerts read from the subscription's own first bar, the latest own first bar among the components, so
  // older pages are never read as a correction (liveAlertView).
  const origins=snapshots.map(row=>liveAlertBars(row.dataset.bars)[0]?.time);
  if(origins.length&&origins.every(time=>time!==undefined))recordLiveOrigin(bars,Math.max(...(origins as number[])));
  const instrument=symbolMathInstrument(entry.canonical);
  entry.cached={instrument,bars,resolution:entry.resolution,provenance:{
   providerId:SYMBOL_MATH_PROVIDER_ID,providerName,datasetId,fixture:synthetic,coverage:SYMBOL_MATH_COVERAGE,
   asOf:Math.max(0,...snapshots.map(row=>row.dataset.provenance.asOf||0)),
   delaySeconds:delays.every(value=>value===null)?null:Math.max(...delays.map(value=>value??0)),
   adjustment:(adjustments.length===1?adjustments[0]:'unknown') as AdjustmentBasis,session:'unknown',timezone:instrument.timezone,state,
   license:[...new Set(snapshots.map(row=>row.dataset.provenance.license))].join(' '),revision,notes}};
  if(this.entries.get(entry.key)===entry)componentRowsById.set(datasetId,{owner:entry,rows:Object.freeze(snapshots.map(row=>Object.freeze({symbol:row.symbol,providerId:row.dataset.provenance.providerId,providerName:row.dataset.provenance.providerName,state:row.dataset.provenance.state})))});
  entry.dirty=false;
  return entry.cached;
 }
}

/** A derived series is not a tradable market, so paper trading
 * (order ticket, Buy/Sell buttons, DOM, + menu orders, Trade at a price, Shift+B/S) is refused on it with this reason. */
export const PAPER_DERIVED_REFUSAL='Paper trading is not available on derived symbols.';
export function isDerivedInstrument(instrument:{id?:unknown;exchange?:unknown}|null|undefined):boolean{return !!instrument&&instrument.exchange===SYMBOL_MATH_EXCHANGE&&typeof instrument.id==='string'&&instrument.id.startsWith(SYMBOL_MATH_EXCHANGE+':');}
/** The refusal for a chart's instrument (or its dataset id), or null when paper trading is allowed. */
export function derivedPaperRefusal(source:{instrument?:{id?:unknown;exchange?:unknown}|null;datasetId?:unknown}|null|undefined):string|null{return source&&(isDerivedInstrument(source.instrument)||isSymbolMathDatasetId(source.datasetId))?PAPER_DERIVED_REFUSAL:null;}
