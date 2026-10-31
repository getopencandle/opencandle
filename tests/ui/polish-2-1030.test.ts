import {afterEach,expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRequire} from 'node:module';
import {setDemoDataMode} from '../../src/domain/demo-mode';
import {demoDailyDataset,demoIntradayDatasets,fixtureDataset,isDemoSourceShape,makeFixture,DEMO_DAILY_BARS} from '../../src/domain/fixtures';
import {demoDataset,demoIntradaySources} from '../../src/ui/workspace-grid';
import {createWatchBook,resolveWatchSource,activeWatchList} from '../../src/watchlists/model';
import {adoptLiveWatchSources} from '../../src/watchlists/live-watch';
import {watchSourceBadge} from '../../src/watchlists/menus';
import {NeedsLiveData,needsLiveSize,NEEDS_LIVE_TITLE,NEEDS_LIVE_STOCKS,OPEN_DATA_SOURCES,LOAD_EXAMPLE} from '../../src/ui/NeedsLiveData';
import {SOURCE_FILTER_LABELS} from '../../src/ui/symbol-search';
import {scriptExamples,initialScript} from '../../src/ui/ScriptPanel';
import {SMA_20_EXAMPLE,LEGACY_SMA_EXAMPLE} from '../../src/ui/script-default-example';
import {createScriptLibrary,restoreScriptLibrary} from '../../src/ui/script-library';
import {scriptBarIds,clearScriptBarIdCache} from '../../src/ui/script-input';
import {scriptProvenanceLabel,scriptDataFooter} from '../../src/ui/script-jobs';
import {strategyProvenanceText} from '../../src/ui/StrategyDialog';
import {createTechnicalScriptEvaluator} from '../../src/ui/script-alert-evaluator';
import {alpacaSearchDatasets} from '../../src/domain/alpaca-live';
import {cellSessionDataset} from '../../src/chart/cell-session';
import {builtinStrategy} from '../../src/domain/builtin-strategies/catalog';
import {runReportBacktest} from '../../src/strategy-report/backtest';
import {createInitialWorkspace} from '../../src/ui/workspace-state';

// Example data shapes, live-row loading dash, per-cell needs-live card, notes follow live rows, the default
// script on long histories, strategy wording, alerts on session-override charts and the search filter label.
afterEach(()=>setDemoDataMode('legacy'));
const em=/—/;
const DAY=86400;

it('example BTC and ETH trade every day, and every example ticker sits at a plausible level',()=>{
 setDemoDataMode('example');
 const levels:Record<string,[number,number]>={BTC:[20000,150000],ETH:[1000,10000],SPY:[300,900],GME:[5,80],AAPL:[100,400]};
 for(const [symbol,[low,high]] of Object.entries(levels)){
  const daily=demoDailyDataset(symbol),last=daily.bars.at(-1)!;
  expect(daily.bars.length).toBe(DEMO_DAILY_BARS);expect(isDemoSourceShape(daily)).toBe(true);
  expect(last.close).toBeGreaterThan(low);expect(last.close).toBeLessThan(high);
  for(const bar of daily.bars)expect(bar.low<=Math.min(bar.open,bar.close)&&bar.high>=Math.max(bar.open,bar.close)&&bar.low>0).toBe(true);
  const weekdays=new Set(daily.bars.slice(-14).map(bar=>new Date(bar.time*1000).getUTCDay()));
  const crypto=symbol==='BTC'||symbol==='ETH';
  expect(weekdays.size).toBe(crypto?7:5);
  if(crypto){expect(daily.bars.at(-1)!.time-daily.bars.at(-2)!.time).toBe(DAY);expect(daily.provenance.coverage).toContain('every day of the week');}
  // The watchlist's 500-bar source ends on the same bar as the chart.
  expect(fixtureDataset(symbol,500).bars.at(-1)).toEqual(last);
  for(const intraday of demoIntradayDatasets(symbol)){expect(isDemoSourceShape(intraday)).toBe(true);expect(intraday.bars.length).toBeGreaterThan(0);}
 }
 // Crypto minute bars run around the clock: a full day holds 1,440 one-minute bars.
 const minutes=demoIntradayDatasets('BTC').find(row=>row.resolution==='1m')!.bars,lastDay=Math.floor(minutes.at(-1)!.time/DAY);
 expect(minutes.filter(bar=>Math.floor(bar.time/DAY)===lastDay).length).toBe(1440);
 // The cached chart sources follow the mode: example shapes never leak into legacy, and back.
 const example=demoDataset('BTC').bars.at(-1)!.close;setDemoDataMode('legacy');
 expect(demoDataset('BTC').bars.at(-1)!.close).not.toBe(example);expect(makeFixture('GME',500)).toEqual(makeFixture('GME',500));
 setDemoDataMode('example');expect(demoDataset('BTC').bars.at(-1)!.close).toBe(example);expect(demoIntradaySources('BTC')[0]!.bars.length).toBe(14*1440);
});

it('a row moved to live shows a quiet loading dash until its first snapshot, and notes move with it',()=>{
 const book=createWatchBook(['GME','BTC']),list=book.lists[0]!;
 const symbolRow=(symbol:string)=>list.rows.find(row=>row.kind==='symbol'&&row.reference.symbol===symbol)!;
 const notes=[{id:'n1',market:{exchange:'SYNTHETIC',symbol:'GME',synthetic:true},text:'Earnings soon',createdAt:1,updatedAt:1,revision:1},
  {id:'n2',market:{exchange:'SYNTHETIC',symbol:'BTC',synthetic:true},text:'Halving',createdAt:1,updatedAt:1,revision:1},
  {id:'n3',market:null,text:'Loose note',createdAt:1,updatedAt:1,revision:1}];
 expect(symbolRow('GME')).toBeTruthy();
 const moved=adoptLiveWatchSources({...book,notes},{stocks:true,crypto:true});
 expect(moved.notes!.map(note=>note.market)).toEqual([{exchange:'US',symbol:'GME',synthetic:false},{exchange:'COINBASE',symbol:'BTC-USD',synthetic:false},null]);
 // Only notes move when every row is already live.
 const onlyNotes=adoptLiveWatchSources({...moved,notes},{stocks:true,crypto:true});
 expect(onlyNotes.notes!.map(note=>note.market?.exchange??null)).toEqual(['US','COINBASE',null]);
 const gme=activeWatchList(moved).rows.find(row=>row.kind==='symbol'&&row.reference.symbol==='GME');
 if(!gme||gme.kind!=='symbol')throw new Error('GME row missing');
 expect(resolveWatchSource(gme.reference,[])).toBeNull();
 const badge=watchSourceBadge(gme.reference,null,false)!;
 expect(badge).toEqual({text:'-',title:'Loading GME. The price appears when the live feed sends it.',quiet:true});
 expect(badge.text).not.toBe('SOURCE MISSING');
 // An import that is not loaded still says SOURCE MISSING.
 expect(watchSourceBadge({symbol:'GME',exchange:'NYSE',datasetId:'not-loaded',dailyDatasetId:null,synthetic:false},null,false)?.text).toBe('SOURCE MISSING');
});

it('the needs-live card fits its chart cell: full, compact or tiny',()=>{
 expect(needsLiveSize(900,600)).toBe('full');expect(needsLiveSize(400,500)).toBe('compact');expect(needsLiveSize(500,250)).toBe('compact');
 expect(needsLiveSize(230,400)).toBe('tiny');expect(needsLiveSize(600,160)).toBe('tiny');expect(needsLiveSize(0,0)).toBe('full');
 const base={symbol:'GME',crypto:false,liveReady:false,example:false,onOpenLive:vi.fn(),onOpenDataSources:vi.fn(),onLoadExample:vi.fn()};
 const compact=renderToStaticMarkup(React.createElement(NeedsLiveData,{...base,size:'compact',cellId:'c2'}));
 expect(compact).toContain(NEEDS_LIVE_TITLE);expect(compact).toContain(OPEN_DATA_SOURCES);expect(compact).toContain(LOAD_EXAMPLE);
 expect(compact).toContain('data-lv-needs-live-cell="c2"');expect(compact).not.toContain('<p>');expect(compact).toContain('title="'+NEEDS_LIVE_STOCKS);
 const tiny=renderToStaticMarkup(React.createElement(NeedsLiveData,{...base,size:'tiny'}));
 expect(tiny).toContain(OPEN_DATA_SOURCES);expect(tiny).not.toContain(LOAD_EXAMPLE);expect(tiny).toContain('lv-needs-live-tiny');
 for(const html of [compact,tiny])expect(html).not.toMatch(em);
});

const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
async function run(source:string,bars:readonly Record<string,unknown>[]){const jobs=new ScriptJobs();try{return await jobs.run({requestId:'polish-2',source,bars,chartPositionMode:'logical-v1'});}finally{jobs.close();}}

it('the default script runs on 3,900 and 5,000 bars inside the 512 KiB output budget',{timeout:60000},async()=>{
 expect(initialScript.name).toBe('SMA 20');expect(initialScript.source).toBe(SMA_20_EXAMPLE.source);expect(scriptExamples['SMA 20']).toBe(SMA_20_EXAMPLE.source);
 expect(Object.keys(scriptExamples)).not.toContain('SMA and close');
 const plain=makeFixture('GME',500),bars=Array.from({length:5000},(_,index)=>{const bar=plain[index%500]!;return{...bar,time:1500000000+index*DAY};});
 clearScriptBarIdCache();const ids=await scriptBarIds('polish-2-identity',bars);
 expect(ids[0]).toMatch(/^b:[0-9a-f]{32}$/);
 for(const count of [3900,5000]){
  const result=await run(SMA_20_EXAMPLE.source,bars.slice(0,count).map((bar,index)=>({id:ids[index],revision:1,...bar})));
  expect(result.ok,result.error?.message).toBe(true);
  expect(new TextEncoder().encode(JSON.stringify(result.value)).length).toBeLessThan(512*1024);
  const sma=result.value.plots.find((plot:any)=>plot.title==='SMA 20');expect(sma.values).toHaveLength(count);
  const last=sma.values.at(-1).value;expect(Math.round(last*100)/100).toBe(last);
 }
});

it('a saved copy of the former default script is upgraded; edited copies are kept',()=>{
 const library=createScriptLibrary({id:'lv-example-sma',name:LEGACY_SMA_EXAMPLE.name,source:LEGACY_SMA_EXAMPLE.source,pane:'price'});
 const saved=JSON.parse(JSON.stringify({...library,preferences:library.preferences??{wrap:false,fontSize:13}}));
 const restored=restoreScriptLibrary(saved);
 expect(restored.documents[0]).toMatchObject({id:'lv-example-sma',name:'SMA 20',source:SMA_20_EXAMPLE.source});
 saved.documents[0].source=LEGACY_SMA_EXAMPLE.source+' ';
 expect(restoreScriptLibrary(saved).documents[0]).toMatchObject({name:LEGACY_SMA_EXAMPLE.name,source:LEGACY_SMA_EXAMPLE.source+' '});
});

it('built-in strategies make trades on example data, and the tester says Example data',{timeout:60000},async()=>{
 setDemoDataMode('example');
 const daily=demoDailyDataset('GME').bars,identity='polish-2-strategy';clearScriptBarIdCache();const ids=await scriptBarIds(identity,daily);
 const config=createInitialWorkspace().strategy;
 for(const id of ['macd','moving-average-crossover','rsi']){
  const result=await run(builtinStrategy(id).source,daily.map((bar,index)=>({id:ids[index],revision:1,...bar})));
  expect(result.ok,id+': '+result.error?.message).toBe(true);
  const report=runReportBacktest({bars:daily,barIds:ids,proposals:result.value.orders,config});
  expect(report.trades.length,id).toBeGreaterThan(0);
 }
 expect(scriptProvenanceLabel('synthetic','x')).toBe('Example data · x');expect(scriptDataFooter('synthetic')).toBe('Example data');
 const label=scriptProvenanceLabel('synthetic',JSON.stringify(['lv-synthetic-v1:GME','1','1D',true,'basis','OpenCandle synthetic demo data','candles','ordinary']));
 expect(strategyProvenanceText(label)).toBe('Example data · 1D');
 expect(strategyProvenanceText('Synthetic demo history · '+JSON.stringify(['x','1','1D',true,'b','OpenCandle synthetic demo data','candles','ordinary']))).toBe('Example data · 1D');
 expect(strategyProvenanceText(label)).not.toMatch(/synthetic/i);
});

it('script alert sources work on a chart cell with a session override (dormant on 1D, active intraday)',()=>{
 const daily=alpacaSearchDatasets(true,['GME'],'1D')[0]!,dormant=cellSessionDataset(daily,{session:'regular'});
 expect(dormant).toBe(daily);
 expect(()=>createTechnicalScriptEvaluator({dataset:dormant,sessionOverride:'regular'})).not.toThrow();
 expect(()=>createTechnicalScriptEvaluator({dataset:fixtureDataset('GME'),sessionOverride:'extended'})).not.toThrow();
 const intraday=cellSessionDataset(alpacaSearchDatasets(true,['GME'],'5m')[0]!,{session:'regular'});
 expect(intraday.provenance.session).toBe('regular');
 expect(()=>createTechnicalScriptEvaluator({dataset:intraday,sessionOverride:'regular'})).not.toThrow();
 expect(()=>createTechnicalScriptEvaluator({dataset:{...intraday},sessionOverride:'regular'})).not.toThrow();
});

it('the search source filter says Example',()=>{
 expect(SOURCE_FILTER_LABELS.synthetic).toBe('Example');
});

import {renderToStaticMarkup as renderTabs} from 'react-dom/server';
import {layoutTabsView} from '../../src/ui/LayoutTabs';
import {layoutTabChange} from '../../src/ui/layout-tabs';
import {layoutTabQuote} from '../../src/ui/layout-tab-quote';
import {duplicateSavedLayout} from '../../src/ui/layout-library';
it('the active layout tab reads the ticker and its daily change, coloured by direction',()=>{
 expect(layoutTabChange(-5.0449)).toEqual({text:'-5.04%',tone:'down'});expect(layoutTabChange(3.2)).toEqual({text:'+3.20%',tone:'up'});
 expect(layoutTabChange(0.001)).toEqual({text:'0.00%',tone:'flat'});expect(layoutTabChange(null)).toBeNull();expect(layoutTabChange(Number.NaN)).toBeNull();
 // The change is the watchlist's Chg% for the active chart's source.
 const gme=fixtureDataset('GME',500),bars=gme.bars,expected=(bars.at(-1)!.close-bars.at(-2)!.close)/bars.at(-2)!.close*100;
 const quote=layoutTabQuote(gme,[gme])!;expect(quote.symbol).toBe('GME');expect(quote.changePercent!).toBeCloseTo(expected,8);
 // No data: the ticker alone.
 setDemoDataMode('off');const empty=layoutTabQuote(demoDataset('GME'),[])!;expect(empty).toEqual({symbol:'GME',changePercent:null,last:null,priceText:null});setDemoDataMode('legacy');
 const state=createInitialWorkspace();let n=0;const second=duplicateSavedLayout(state.layoutLibrary!,state.grid!,state.grid!,'Swing',100,()=>'tab-'+(++n));
 const library={...second.library,autosave:true,entries:second.library.entries.map(row=>({...row,savedAt:100}))},open=[library.entries[0]!.id,second.entry.id];
 const view=(q:{symbol:string;changePercent:number|null}|null)=>renderTabs(layoutTabsView({library,grid:library.entries.find(row=>row.id===library.activeId)!.grid,open,ui:{},quote:q,onUi:()=>{},onSwitch:()=>{},onClose:()=>{},onRename:()=>{},onMove:()=>{}}));
 const down=view({symbol:'GME',changePercent:-5.04});
 expect(down).toContain('<span class="lv-layout-tab-symbol">GME</span><span class="lv-layout-tab-change" data-tone="down">-5.04%</span>');
 expect(down).toContain('title="GME -5.04% · ');expect(down).not.toMatch(em);
 expect(view({symbol:'BTC',changePercent:1.5})).toContain('data-tone="up">+1.50%');
 const bare=view({symbol:'GME',changePercent:null});expect(bare).toContain('lv-layout-tab-symbol">GME</span>');expect(bare).not.toContain('lv-layout-tab-change');
 // Inactive tabs keep "SYMBOL / layout name".
 expect(down).toContain('lv-layout-tab-sep');
});
