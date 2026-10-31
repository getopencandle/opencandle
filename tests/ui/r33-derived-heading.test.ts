import {afterEach,expect,it} from 'vitest';
import {chartHeadingLabels} from '../../src/ui/chart-heading-label';
import {SymbolMathProvider,staticComponentHandle,symbolMathComponentsOf,symbolMathPlaceholder} from '../../src/domain/symbol-math-live';
import {selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import type {LiveHandle} from '../../src/domain/live-provider';
import type {Bar,BarDataset} from '../../src/domain/types';

// Chart heading badge and title. Every bar is a SYNTHETIC fixture made up for this test; component
// feeds are mock LiveHandles (no network, no key).
const bar=(time:number,close:number):Bar=>({time,open:close,high:close,low:close,close,volume:1});
const OPEN_NY=Date.UTC(2026,9,21,15,0);// Wed 11:00 New York (regular session)
const CLOSED_NY=Date.UTC(2026,9,24,15,0);// Sat 11:00 New York (market closed)
function feed(symbol:string,options:{providerId?:string;providerName?:string;state?:BarDataset['provenance']['state'];delaySeconds?:number|null}={}):LiveHandle{
 const dataset:BarDataset={instrument:{id:'US:'+symbol,symbol,name:symbol,exchange:'US',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'America/New_York'},bars:[bar(1,10),bar(2,20)],resolution:'1D',
  provenance:{providerId:options.providerId??'alpaca-iex',providerName:options.providerName??'Alpaca Market Data (owner key, Basic plan)',datasetId:`live:${options.providerId??'alpaca-iex'}:${symbol}:1D`,fixture:false,coverage:'c',asOf:2,delaySeconds:options.delaySeconds??0,adjustment:'split-adjusted',session:'unknown',timezone:'America/New_York',state:options.state??'ready',license:'L',revision:'r:'+symbol,notes:[]}};
 return{datasetId:dataset.provenance.datasetId,dataset:()=>dataset,formingTime:()=>null,onChange:()=>()=>{},close:()=>{}};
}
afterEach(()=>selectAlpacaSyntheticStub(false));

it('a real-key derived chart names GME and SPY and their Alpaca source and reports Live / Market closed (was LOCAL IMPORT, No live connection)',()=>{
 const handle=new SymbolMathProvider(symbol=>feed(symbol)).open('GME/SPY','1D');
 const p=handle.dataset().provenance;
 expect(chartHeadingLabels(p,2,OPEN_NY)).toEqual({badge:'DERIVED · LIVE',title:'Derived (symbol math) GME/SPY · from GME and SPY: Alpaca Market Data (owner key, Basic plan) · 2 bars · split-adjusted adjustment; unknown session · Live'});
 expect(chartHeadingLabels(p,2,CLOSED_NY).badge).toBe('DERIVED · MARKET CLOSED');
 expect(chartHeadingLabels(p,2,CLOSED_NY).title).toMatch(/ · Market closed$/);
 handle.close();
 expect(symbolMathComponentsOf(p.datasetId)).toBeNull();
});

it('a keyless stub derived chart says SYNTHETIC in badge and title and names the stub',()=>{
 selectAlpacaSyntheticStub(true);
 const stub=(symbol:string)=>feed(symbol,{providerId:'alpaca-stub',providerName:'SYNTHETIC Alpaca stub (invented prices)'});
 const handle=new SymbolMathProvider(stub).open('(GME+SPY)/2','1D');
 const labels=chartHeadingLabels(handle.dataset().provenance,2,CLOSED_NY);
 expect(labels.badge).toBe('SYNTHETIC DERIVED · MARKET CLOSED');
 expect(labels.title).toBe('SYNTHETIC Derived (symbol math) (GME+SPY)/2 · from GME and SPY: SYNTHETIC Alpaca stub (invented prices) · 2 bars · split-adjusted adjustment; unknown session · Synthetic Market closed');
 handle.close();
});

it('mixed sources are grouped per source; a non-Alpaca mix uses the plain live rule; worst state wins',()=>{
 const imported=staticComponentHandle({...feed('AAA').dataset(),provenance:{...feed('AAA').dataset().provenance,providerId:'local-import',providerName:'Local import',datasetId:'import:AAA',delaySeconds:null}});
 const handle=new SymbolMathProvider(symbol=>symbol==='AAA'?imported:feed(symbol,{state:symbol==='QQQ'?'stale':'ready'})).open('AAA/SPY+QQQ','1D');
 const labels=chartHeadingLabels(handle.dataset().provenance,2,CLOSED_NY);
 expect(labels.title).toContain(' · from AAA: Local import; SPY and QQQ: Alpaca Market Data (owner key, Basic plan) · ');
 expect(labels.badge).toBe('DERIVED · DELAYED');
 handle.close();
});

it('a derived restore stand-in names the expression tickers and says Connecting / Disconnected, never No live connection',()=>{
 const connecting=chartHeadingLabels(symbolMathPlaceholder('GME/SPY','1D','loading').provenance,0);
 expect(connecting).toEqual({badge:'DERIVED · CONNECTING',title:'Derived (symbol math) GME/SPY · from GME and SPY: component feeds not open · 0 bars · unknown adjustment; unknown session · Connecting'});
 expect(chartHeadingLabels(symbolMathPlaceholder('GME/SPY','1D','disconnected','off').provenance,0).badge).toBe('DERIVED · DISCONNECTED');
});

it('non-derived headings keep the exact pre- text',()=>{
 const base=feed('GME').dataset().provenance;
 expect(chartHeadingLabels({...base,providerId:'local-import',providerName:'Local import',datasetId:'import:GME'},3)).toEqual({badge:'LOCAL IMPORT',title:'Local import · 3 bars · split-adjusted adjustment; unknown session · No live connection'});
 expect(chartHeadingLabels({...base,fixture:true,providerId:'lv-fixture',datasetId:'lv-fixture:GME'},500)).toEqual({badge:'DEMO',title:'Synthetic demo data, not market data · 500 bars · split-adjusted adjustment; unknown session · No live connection'});
 expect(chartHeadingLabels({...base,providerId:'coinbase-public',datasetId:'live:coinbase-public:BTC-USD:5m'},1234)).toEqual({badge:'LIVE',title:'Live data · 1,234 bars · split-adjusted adjustment; unknown session · Live'});
 expect(chartHeadingLabels(base,2,CLOSED_NY)).toEqual({badge:'MARKET CLOSED',title:'Live data · 2 bars · split-adjusted adjustment; unknown session · Market closed'});
});
