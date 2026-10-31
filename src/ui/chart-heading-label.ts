import type {BarDataset} from '../domain/types';
import {demoDataMode} from '../domain/demo-mode';
import {ALPACA_IEX_PROVIDER_ID,ALPACA_STUB_PROVIDER_ID,alpacaStatusLabel} from '../domain/alpaca-live';
import {isLiveProviderId,liveStatusLabel} from '../domain/live-provider';
import {FRED_PROVIDER_ID} from '../domain/fred';
import {SYMBOL_MATH_PROVIDER_ID,isSymbolMathDatasetId,symbolMathComponentsOf,symbolMathRefOf} from '../domain/symbol-math-live';

type Provenance=BarDataset['provenance'];

/** The live status word of a heading. An Alpaca feed (owner key or the keyless stub) outside US trading hours says "Market
 * closed"; the stub says "Synthetic" first. Moved unchanged from App.tsx (headingLiveLabel). */
export function headingLiveLabel(provenance:Provenance,nowMs?:number):string{
 const synthetic=provenance.providerId===ALPACA_STUB_PROVIDER_ID?'Synthetic ':'';
 if(provenance.providerId===ALPACA_IEX_PROVIDER_ID){const alpaca=alpacaStatusLabel(provenance,nowMs);if(alpaca!=='Live')return synthetic+alpaca;}
 return synthetic+liveStatusLabel(provenance);
}

const isAlpacaProviderId=(providerId:string)=>providerId===ALPACA_IEX_PROVIDER_ID||providerId===ALPACA_STUB_PROVIDER_ID||providerId==='alpaca-iex';
/** "GME", "GME and SPY", "GME, SPY and QQQ". */
const listText=(items:readonly string[])=>items.length<2?items.join(''):items.slice(0,-1).join(', ')+' and '+items.at(-1);

/**
 * A derived chart's heading
 * names the expression and the source of each component, and reports the live state of its component feeds.
 * - Status: the derived feed's own state (the worst component state, the largest delay). When every component is an
 *   Alpaca feed (owner key or the keyless stub), the Alpaca rule applies, so a closed US market says "Market closed".
 * - SYNTHETIC: a derived feed of SYNTHETIC stub components (fixture set, SYNTHETIC label) says SYNTHETIC in the badge and
 *   the title.
 * Returns null for any other dataset.
 */
export function derivedHeadingLabels(provenance:Provenance,barCount:number,nowMs?:number):{badge:string;title:string}|null{
 if(provenance.providerId!==SYMBOL_MATH_PROVIDER_ID||!isSymbolMathDatasetId(provenance.datasetId))return null;
 const ref=symbolMathRefOf(provenance.datasetId),canonical=ref?.expression.canonical??'derived series';
 const synthetic=provenance.fixture===true||/^SYNTHETIC/.test(provenance.providerName);
 const rows=symbolMathComponentsOf(provenance.datasetId);
 // Components grouped by source, in expression order. Without an open feed (restore stand-in), the expression's tickers.
 let from:string;
 if(rows&&rows.length){
  const groups=new Map<string,string[]>();for(const row of rows){const list=groups.get(row.providerName)??[];list.push(row.symbol);groups.set(row.providerName,list);}
  from=[...groups].map(([source,symbols])=>`${listText(symbols)}: ${source}`).join('; ');
 }else from=listText(ref?.expression.symbols??[])+': component feeds not open';
 let status:string;
 if(rows&&rows.length&&rows.every(row=>isAlpacaProviderId(row.providerId))){const alpaca=alpacaStatusLabel(provenance,nowMs);status=alpaca!=='Live'?alpaca:liveStatusLabel(provenance);}
 else status=liveStatusLabel(provenance);
 const mark=synthetic?'SYNTHETIC ':'';
 return{
  badge:`${mark}DERIVED · ${status.toUpperCase()}`,
  title:`${mark}Derived (symbol math) ${canonical} · from ${from} · ${barCount.toLocaleString()} bars · ${provenance.adjustment} adjustment; ${provenance.session} session · ${synthetic?'Synthetic ':''}${status}`,
 };
}

/** A FRED economic series is neither a live feed nor a local import. Its status says whether the
 * shown values are the day's copy, an older saved copy, still loading, or not loaded. */
export function fredHeadingStatus(provenance:Pick<Provenance,'state'>):'Updated on open'|'Saved copy'|'Loading'|'Not loaded'{
 if(provenance.state==='stale')return 'Saved copy';
 if(provenance.state==='loading')return 'Loading';
 if(provenance.state==='disconnected'||provenance.state==='error')return 'Not loaded';
 return 'Updated on open';
}
/** The chart heading badge and title. Every non-derived, non-FRED dataset keeps its standard text. */
export function chartHeadingLabels(provenance:Provenance,barCount:number,nowMs?:number):{badge:string;title:string}{
 const derived=derivedHeadingLabels(provenance,barCount,nowMs);if(derived)return derived;
 if(provenance.providerId===FRED_PROVIDER_ID){const status=fredHeadingStatus(provenance);return{
  badge:status==='Updated on open'?'FRED':'FRED · '+status.toUpperCase(),
  title:'FRED economic data, daily, updated on open · '+barCount.toLocaleString()+' bars · '+provenance.adjustment+' adjustment; '+provenance.session+' session · '+status,
 };}
 const live=isLiveProviderId(provenance.providerId);
 // Outside the legacy mode a demo source is either a placeholder with no bars (normal use) or example data.
 const mode=demoDataMode();
 if(provenance.fixture&&mode!=='legacy'&&!live)return barCount===0||mode==='off'?{badge:'NO DATA',title:'No data. This chart needs a live data source.'}:{badge:'EXAMPLE',title:'Example data: invented prices, not real market prices · '+barCount.toLocaleString()+' bars'};
 return{
  badge:provenance.fixture?'DEMO':live?headingLiveLabel(provenance,nowMs).toUpperCase():'LOCAL IMPORT',
  title:(provenance.fixture?'Synthetic demo data, not market data':live?'Live data':'Local import')+' · '+barCount.toLocaleString()+' bars · '+provenance.adjustment+' adjustment; '+provenance.session+' session · '+(live?headingLiveLabel(provenance,nowMs):'No live connection'),
 };
}
