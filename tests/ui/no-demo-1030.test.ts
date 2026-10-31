import {afterEach,expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {setDemoDataMode,demoDataMode,EXAMPLE_SYMBOLS,demoSymbolAllowed} from '../../src/domain/demo-mode';
import {demoDataset,demoIntradaySources,workspaceDatasets,selectedDataset,suppliedSourceId} from '../../src/ui/workspace-grid';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {isDemoPlaceholder,isDemoSourceShape,DEMO_DAILY_BARS} from '../../src/domain/fixtures';
import {createWatchBook,resolveWatchSource,activeWatchList,watchSymbols} from '../../src/watchlists/model';
import {adoptLiveWatchSources,cryptoProductFor,liveWatchReferenceFor,noLiveSourceNote} from '../../src/watchlists/live-watch';
import {watchQuote} from '../../src/watchlists/quotes';
import {syntheticGenerationCandidate} from '../../src/ui/symbol-search';
import {startupPrewarmSteps} from '../../src/ui/startup-prewarm';
import {chartHeadingLabels} from '../../src/ui/chart-heading-label';
import {NeedsLiveData,ExampleDataBanner,NEEDS_LIVE_TITLE,NEEDS_LIVE_STOCKS,NEEDS_LIVE_CRYPTO} from '../../src/ui/NeedsLiveData';
import {DATA_NEEDS} from '../../src/domain/data-source-settings';

// No generated prices outside the example screen in normal use. The module default stays 'legacy' for older tests.
afterEach(()=>setDemoDataMode('legacy'));
const em=/—/;

it('defaults to legacy, so the synthetic provider and older tests are unchanged',()=>{
 expect(demoDataMode()).toBe('legacy');
 expect(demoDataset('GME').bars.length).toBe(DEMO_DAILY_BARS);
 expect(workspaceDatasets(createInitialWorkspace()).some(row=>row.instrument.symbol==='MSFT'&&row.provenance.fixture)).toBe(true);
});

it('normal mode: charts get a placeholder with no bars, and no demo symbol joins the universe',()=>{
 setDemoDataMode('off');
 const workspace=createInitialWorkspace(),chart=selectedDataset(workspace);
 expect(isDemoPlaceholder(chart)).toBe(true);expect(chart.bars).toEqual([]);
 expect(isDemoSourceShape(chart)).toBe(true);expect(suppliedSourceId(workspace,chart)).toBeNull();
 const universe=workspaceDatasets(workspace);
 expect(universe.filter(row=>row.provenance.fixture).map(row=>row.instrument.symbol)).toEqual(['GME']);
 expect(universe.every(row=>!row.provenance.fixture||row.bars.length===0)).toBe(true);
 expect(demoIntradaySources('GME').every(row=>row.bars.length===0)).toBe(true);
 expect(startupPrewarmSteps()).toEqual([]);
 expect(syntheticGenerationCandidate('TSLA',[])).toBeNull();
 expect(chartHeadingLabels(chart.provenance,0).badge).toBe('NO DATA');
});

it('a fresh workspace holds the five example tickers in its watchlist, with no prices in normal mode',()=>{
 setDemoDataMode('off');
 const workspace=createInitialWorkspace();
 expect(watchSymbols(workspace.watchBook)).toEqual(['BTC','ETH','SPY','GME','AAPL']);
 expect(workspace.watchlist).toEqual(['BTC','ETH','SPY','GME','AAPL']);
 for(const row of activeWatchList(workspace.watchBook).rows){if(row.kind!=='symbol')continue;
  const source=resolveWatchSource(row.reference,[]);expect(source&&isDemoPlaceholder(source)).toBe(true);
  expect(watchQuote(row.reference,[]).last).toBeNull();}
});

it('example mode: generated prices for exactly BTC, ETH, SPY, GME and AAPL',()=>{
 setDemoDataMode('example');
 expect([...EXAMPLE_SYMBOLS]).toEqual(['BTC','ETH','SPY','GME','AAPL']);
 for(const symbol of EXAMPLE_SYMBOLS){expect(demoSymbolAllowed(symbol)).toBe(true);expect(demoDataset(symbol).bars.length).toBe(DEMO_DAILY_BARS);}
 expect(demoSymbolAllowed('MSFT')).toBe(false);expect(demoDataset('MSFT').bars).toEqual([]);
 const workspace={...createInitialWorkspace(),symbol:'GME'};
 const demo=workspaceDatasets(workspace).filter(row=>row.provenance.fixture&&row.bars.length).map(row=>row.instrument.symbol).sort();
 expect(demo).toEqual(['AAPL','BTC','ETH','GME','SPY']);
 expect(chartHeadingLabels(demoDataset('GME').provenance,DEMO_DAILY_BARS).badge).toBe('EXAMPLE');
 setDemoDataMode('off');
 expect(demoDataset('GME').bars).toEqual([]);
});

it('demo watchlist rows move to the live source: stocks to Alpaca, crypto to Coinbase',()=>{
 const book=createWatchBook(['BTC','ETH','SPY','GME','AAPL']);
 expect(adoptLiveWatchSources(book,{stocks:false,crypto:false})).toBe(book);
 const stocks=adoptLiveWatchSources(book,{stocks:true,crypto:false}),refs=activeWatchList(stocks).rows.flatMap(row=>row.kind==='symbol'?[row.reference]:[]);
 expect(refs.map(ref=>ref.exchange+':'+ref.symbol)).toEqual(['SYNTHETIC:BTC','SYNTHETIC:ETH','US:SPY','US:GME','US:AAPL']);
 expect(refs.find(ref=>ref.symbol==='GME')).toEqual({symbol:'GME',exchange:'US',datasetId:'live:alpaca-iex:GME:1D',dailyDatasetId:null,synthetic:false});
 const both=adoptLiveWatchSources(stocks,{stocks:true,crypto:true});
 expect(activeWatchList(both).rows.flatMap(row=>row.kind==='symbol'?[row.reference.datasetId]:[]).slice(0,2)).toEqual(['live:coinbase-public:BTC-USD:1D','live:coinbase-public:ETH-USD:1D']);
 expect(adoptLiveWatchSources(both,{stocks:true,crypto:true})).toBe(both);
 expect(cryptoProductFor('btc')).toBe('BTC-USD');expect(cryptoProductFor('GME')).toBeNull();
 expect(liveWatchReferenceFor({symbol:'GME',exchange:'US',datasetId:'live:alpaca-iex:GME:1D',dailyDatasetId:null,synthetic:false},{stocks:true,crypto:true})).toBeNull();
});

it('a duplicate live twin in the same list replaces the demo row instead of doubling it',()=>{
 let book=createWatchBook(['GME']);
 const list=book.lists[0];book={...book,lists:[{...list,rows:[...list.rows,{id:'live-row',kind:'symbol',reference:{symbol:'GME',exchange:'US',datasetId:'live:alpaca-iex:GME:1D',dailyDatasetId:null,synthetic:false}}]}]};
 const next=adoptLiveWatchSources(book,{stocks:true,crypto:false});
 expect(activeWatchList(next).rows.map(row=>row.id)).toEqual(['live-row']);
});

it('the needs-live-data card and example banner use plain, short text',()=>{
 const base={liveReady:false,example:false,onOpenLive:vi.fn(),onOpenDataSources:vi.fn(),onLoadExample:vi.fn()};
 const stock=renderToStaticMarkup(React.createElement(NeedsLiveData,{...base,symbol:'GME',crypto:false}));
 expect(stock).toContain(NEEDS_LIVE_TITLE);expect(stock).toContain('This chart needs live data to display properly.');expect(stock).toContain(NEEDS_LIVE_STOCKS);
 expect(stock).toContain('Open Data sources');expect(stock).toContain('Load example data');
 const crypto=renderToStaticMarkup(React.createElement(NeedsLiveData,{...base,symbol:'BTC-USD',crypto:true,liveReady:true}));
 expect(crypto).toContain(NEEDS_LIVE_CRYPTO);expect(crypto).toContain('Show live BTC-USD');
 const inExample=renderToStaticMarkup(React.createElement(NeedsLiveData,{...base,symbol:'MSFT',crypto:false,example:true}));
 expect(inExample).not.toContain('Load example data');expect(inExample).toContain('BTC, ETH, SPY, GME and AAPL');
 const banner=renderToStaticMarkup(React.createElement(ExampleDataBanner,{onLeave:vi.fn()}));
 expect(banner).toContain('Example data. These prices are invented');expect(banner).toContain('Leave example mode');
 for(const html of [stock,crypto,inExample,banner,noLiveSourceNote('GME').title,noLiveSourceNote('BTC').title,DATA_NEEDS.find(row=>row.id==='demo')!.gives])expect(html).not.toMatch(em);
 expect(DATA_NEEDS.find(row=>row.id==='demo')!.title).toBe('Example charts');
});

import {liveOpenTargetFor} from '../../src/watchlists/live-watch';
import {alpacaSearchDatasets} from '../../src/domain/alpaca-live';
import {buildSymbolSearchCandidates} from '../../src/ui/symbol-search';
it('watchlist click: a demo row opens the live source when one is set up, never the demo series',()=>{
 setDemoDataMode('off');
 const book=createWatchBook(['GME','SPY','BTC']),rows=activeWatchList(book).rows.flatMap(row=>row.kind==='symbol'?[row.reference]:[]);
 // Before the book is moved to live sources, the panel resolves the row to the placeholder; App routes that to the live feed.
 const clicked=resolveWatchSource(rows[0]!,[])!;expect(isDemoPlaceholder(clicked)).toBe(true);
 expect(liveOpenTargetFor(clicked.instrument.symbol,{stocks:true,crypto:false})).toEqual({providerId:'alpaca-iex',symbol:'GME'});
 expect(liveOpenTargetFor('BTC',{stocks:true,crypto:true})).toEqual({providerId:'coinbase-public',symbol:'BTC-USD'});
 expect(liveOpenTargetFor('GME',{stocks:false,crypto:true})).toBeNull();
 // After the move, the row is bound to the live Alpaca feed and resolves to it.
 const moved=adoptLiveWatchSources(book,{stocks:true,crypto:false}),gme=activeWatchList(moved).rows.find(row=>row.kind==='symbol'&&row.reference.symbol==='GME');
 const live=alpacaSearchDatasets(true,['GME'],'1D');
 expect(gme&&gme.kind==='symbol'&&resolveWatchSource(gme.reference,live)).toBe(live[0]);
});
it('outside example mode, symbol search lists no demo rows, even next to a live source',()=>{
 setDemoDataMode('off');
 const universe=workspaceDatasets(createInitialWorkspace()).filter(row=>!isDemoPlaceholder(row));
 const candidates=buildSymbolSearchCandidates([...universe,...alpacaSearchDatasets(true,['GME','SPY'],'1D')],[]);
 expect(candidates.some(row=>row.synthetic)).toBe(false);expect(candidates.map(row=>row.symbol).sort()).toEqual(['GME','SPY']);
});
