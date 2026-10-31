import {afterEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {alpacaSearchDatasets,ALPACA_IEX_PROVIDER_ID,ALPACA_STUB_PROVIDER_ID} from '../../src/domain/alpaca-live';
import {coinbaseSearchDatasets,COINBASE_PROVIDER_ID} from '../../src/domain/coinbase-live';
import type {BarDataset} from '../../src/domain/types';
import {clearLiveDatasets,registerLiveDataset} from '../../src/ui/live-registry';
import {liveRefDependsOn,moveSourceChartsOff} from '../../src/ui/live-workspace';
import {patchWorkspace} from '../../src/ui/workspace-grid';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {SYMBOL_MATH_PROVIDER_ID,symbolMathDatasetId,symbolMathPlaceholder} from '../../src/domain/symbol-math-live';
import {openReplay,replayParticipantSupport,REPLAY_DERIVED_REFUSAL,type ReplayParticipant} from '../../src/domain/replay-session';
import {freezeLiveDataset} from '../../src/domain/replay-live-snapshot';
import {activeWatchList,createWatchBook,resolveWatchSource,restoreWatchBook} from '../../src/watchlists/model';
import {adoptDerivedWatchLabels,derivedWatchReference,planWatchFeeds} from '../../src/watchlists/live-watch';
import {watchSourceBadge} from '../../src/watchlists/menus';

// All bars are SYNTHETIC and made up for these tests; no feed opens, no key is read.
const t0=1_700_000_000,bars=[0,1,2].map(i=>({time:t0+i*300,open:10+i,high:11+i,low:9+i,close:10.5+i,volume:100}));
function alpaca(symbol:string):BarDataset{const shell=alpacaSearchDatasets(true,[symbol],'5m').find(row=>row.instrument.symbol===symbol)!;const data={...shell,bars};registerLiveDataset(data);return data;}
function coinbase(symbol:string):BarDataset{const shell=coinbaseSearchDatasets(true,'5m').find(row=>row.instrument.symbol===symbol)!;const data={...shell,bars};registerLiveDataset(data);return data;}
const settings={mode:'percent' as const,color:'#ffb74d',width:2,visible:true,baseline:'first-visible-match' as const};
function chartWith(main:BarDataset,compare:BarDataset[]){
 const opened=patchWorkspace(createInitialWorkspace(),{symbol:main.instrument.symbol,sourceId:main.provenance.datasetId});
 const ws=patchWorkspace(opened,{comparisons:compare.map((row,i)=>({id:'cmp-'+i,datasetId:row.provenance.datasetId,...settings}))} as never);
 return{ws,cell:ws.grid!.layout.activeCellId};
}
afterEach(()=>clearLiveDatasets());

describe(' 1: a source turned off changes only the charts that depend on it',()=>{
 it('names the dependent feeds: Coinbase charts and Coinbase-derived for Coinbase; Alpaca (both namespaces) and Alpaca-derived for the key',()=>{
  expect(liveRefDependsOn({providerId:COINBASE_PROVIDER_ID,symbol:'BTC-USD'},'coinbase')).toBe(true);
  expect(liveRefDependsOn({providerId:ALPACA_IEX_PROVIDER_ID,symbol:'GME'},'coinbase')).toBe(false);
  expect(liveRefDependsOn({providerId:SYMBOL_MATH_PROVIDER_ID,symbol:'GME/SPY'},'coinbase')).toBe(false);
  expect(liveRefDependsOn({providerId:SYMBOL_MATH_PROVIDER_ID,symbol:'BTC-USD/GME'},'coinbase')).toBe(true);
  expect(liveRefDependsOn({providerId:ALPACA_IEX_PROVIDER_ID,symbol:'GME'},'alpaca')).toBe(true);
  expect(liveRefDependsOn({providerId:ALPACA_STUB_PROVIDER_ID,symbol:'GME'},'alpaca')).toBe(true);
  expect(liveRefDependsOn({providerId:COINBASE_PROVIDER_ID,symbol:'BTC-USD'},'alpaca')).toBe(false);
  expect(liveRefDependsOn({providerId:SYMBOL_MATH_PROVIDER_ID,symbol:'BTC-USD/ETH-USD'},'alpaca')).toBe(false);
  expect(liveRefDependsOn({providerId:SYMBOL_MATH_PROVIDER_ID,symbol:'BTC-USD/GME'},'alpaca')).toBe(true);
 });
 it('Coinbase off: an Alpaca chart stays live and keeps its Alpaca comparison; only its Coinbase comparison goes',()=>{
  const gme=alpaca('GME'),spy=alpaca('SPY'),btc=coinbase('BTC-USD'),{ws,cell}=chartWith(gme,[btc,spy]);
  const grid=moveSourceChartsOff(ws,'coinbase')!;
  expect(grid.cells[cell].datasetId).toBe(gme.provenance.datasetId);
  expect(grid.cells[cell].comparisons.map(row=>row.datasetId)).toEqual([spy.provenance.datasetId]);
  // Nothing on Alpaca's side depends on Coinbase once the comparison is gone: the same grid comes back.
  const {ws:plain}=chartWith(gme,[spy]);expect(moveSourceChartsOff(plain,'coinbase')).toBe(plain.grid);
 });
 it('Coinbase off: a Coinbase chart moves to its saved-file fallback, but its Alpaca comparison stays live',()=>{
  const btc=coinbase('BTC-USD'),spy=alpaca('SPY'),{ws,cell}=chartWith(btc,[spy]);
  const grid=moveSourceChartsOff(ws,'coinbase')!;
  expect(grid.cells[cell].datasetId).not.toMatch(/^live:/);
  expect(grid.cells[cell].comparisons.map(row=>row.datasetId)).toEqual([spy.provenance.datasetId]);
 });
 it('a derived chart is never moved to the fallback here (it gets the Disconnected stand-in in App)',()=>{
  const derived={...symbolMathPlaceholder('BTC-USD/GME','5m','ready'),bars};registerLiveDataset(derived);
  const {ws,cell}=chartWith(derived,[]);
  expect(moveSourceChartsOff(ws,'coinbase')!.cells[cell].datasetId).toBe(derived.provenance.datasetId);
 });
 it('App: Coinbase off uses the Coinbase-only move, and removing the Alpaca key closes only Alpaca-dependent feeds to stand-ins',()=>{
  const app=readFileSync('src/ui/App.tsx','utf8').replace(/\r\n/g,'\n');// Line-ending agnostic (App.tsx is LF now)
  expect(app).toContain("const ws=current.current,safe=moveSourceChartsOff(ws,'coinbase');if(safe&&safe!==ws.grid&&!commit({grid:safe}))moved=false;");
  expect(app).not.toContain('const safe=persistableWorkspace(current.current);if(safe!==current.current&&!commit({grid:safe.grid!}))moved=false;');
  expect(app).toContain("useEffect(()=>{if(alpacaKeyConfigured)return;\n  for(const id of [...liveHandles.current.keys()]){const ref=liveRefOfDatasetId(id);if(!ref||!liveRefDependsOn(ref,'alpaca'))continue;closeLiveHandle(id);const holder=liveChartPlaceholder(ref,false);if(holder&&holder.provenance.datasetId===id){registerLiveDataset(holder);setLiveDatasets(prior=>({...prior,[id]:holder}));}}\n },[alpacaKeyConfigured]);");
 });
});

describe(' 2: Bar Replay treats every derived chart the same',()=>{
 const row=(symbol:string,datasetId?:string)=>({chartType:'candles',symbol,interval:'5m',...(datasetId?{datasetId}:{})});
 it('a derived chart replays whatever operator its expression uses',()=>{
  for(const symbol of ['GME/SPY','GME-SPY','GME*2','(GME+SPY)/2'])expect(replayParticipantSupport(row(symbol,symbolMathDatasetId(symbol,'5m'))),symbol).toEqual({supported:true});
 });
 it('expression text off a derived chart is refused with one reason; dash-only text is a ticker',()=>{
  for(const symbol of ['GME/SPY','GME*2','(GME+SPY)/2','GME - SPY'])expect(replayParticipantSupport(row(symbol,'fixture:'+symbol)),symbol).toEqual({supported:false,reason:REPLAY_DERIVED_REFUSAL});
  for(const symbol of ['BRK-B','BTC-USD','GME-SPY'])expect(replayParticipantSupport(row(symbol)),symbol).toEqual({supported:true});
 });
 it('opens on the frozen copy of a derived chart (the live-replay path)',()=>{
  const derived={...symbolMathPlaceholder('GME-SPY','5m','ready'),bars},frozen=freezeLiveDataset(derived)!;
  expect(frozen.provenance.datasetId).toBe(symbolMathDatasetId('GME-SPY','5m'));expect(frozen.provenance.revision).toContain('|replay-snapshot:');
  const participant:ReplayParticipant={cellId:'a',instrumentId:frozen.instrument.id,symbol:'GME-SPY',interval:'5m',chartType:'candles',datasetId:frozen.provenance.datasetId,revision:frozen.provenance.revision};
  expect(openReplay({participants:[participant],activeCellId:'a',sessionId:'s'}).phase).toBe('selecting-start');
  const slash={...participant,symbol:'GME/SPY',datasetId:symbolMathDatasetId('GME/SPY','5m')};
  expect(openReplay({participants:[slash],activeCellId:'a',sessionId:'s'}).phase).toBe('selecting-start');
 });
});

describe(' 3: a keyless-stub derived watch row adopts the SYNTHETIC labelling and quotes',()=>{
 const stubFeed=()=>{const base=symbolMathPlaceholder('GME/SPY','1D','ready');return{...base,bars,provenance:{...base.provenance,fixture:true,providerName:'SYNTHETIC · Derived: GME/SPY from SYNTHETIC Alpaca stub (invented prices)'}} as BarDataset;};
 const bookWithDerived=()=>{const base=createWatchBook(['GME']),list=activeWatchList(base);return restoreWatchBook({...base,lists:[{...list,rows:[...list.rows,{id:'d1',kind:'symbol',reference:derivedWatchReference('GME/SPY')}]}],flags:[{reference:derivedWatchReference('GME/SPY'),color:'red'}]});};
 it('the typed row (non-synthetic) did not resolve on the SYNTHETIC feed; after adoption it does, with the SYNTHETIC badge',()=>{
  const book=bookWithDerived(),feed=stubFeed(),typed=activeWatchList(book).rows.at(-1)!;
  if(typed.kind!=='symbol')throw new Error('row');
  expect(resolveWatchSource(typed.reference,[feed])).toBeNull();
  const next=adoptDerivedWatchLabels(book,[feed]),row=activeWatchList(next).rows.at(-1)!;if(row.kind!=='symbol')throw new Error('row');
  expect(row.reference.synthetic).toBe(true);expect(next.flags[0].reference.synthetic).toBe(true);
  expect(resolveWatchSource(row.reference,[feed])).toBe(feed);
  expect(watchSourceBadge(row.reference,feed,false)?.text).toBe('DEMO');
  // The adopted row still streams its derived feed, and adoption is stable.
  expect(planWatchFeeds({book:next,taken:new Set()}).feeds.map(item=>item.datasetId)).toEqual([symbolMathDatasetId('GME/SPY','1D')]);
  expect(adoptDerivedWatchLabels(next,[feed])).toBe(next);
  // A real (keyed) derived feed turns it back; non-derived rows are never touched.
  const real={...feed,provenance:{...feed.provenance,fixture:false,providerName:'Derived: GME/SPY from Alpaca IEX'}};
  const back=adoptDerivedWatchLabels(next,[real]),again=activeWatchList(back).rows.at(-1)!;if(again.kind!=='symbol')throw new Error('row');
  expect(again.reference.synthetic).toBe(false);expect(watchSourceBadge(again.reference,real,false)).toBeNull();
  expect(activeWatchList(back).rows[0]).toBe(activeWatchList(book).rows[0]);
  expect(adoptDerivedWatchLabels(book,[])).toBe(book);
 });
 it('App adopts the labels from the quote datasets',()=>{
  expect(readFileSync('src/ui/App.tsx','utf8')).toContain('const book=current.current.watchBook,next=adoptDerivedWatchLabels(book,watchQuotes);if(next!==book)commit({watchBook:next});},[loaded,workspace.watchBook,watchQuotes]);');
 });
});
