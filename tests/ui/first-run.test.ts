import {afterEach,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
import {setDemoDataMode} from '../../src/domain/demo-mode';
import {isDemoPlaceholder} from '../../src/domain/fixtures';
import {createInitialWorkspace,createFirstRunWorkspace} from '../../src/ui/workspace-state';
import {selectedDataset} from '../../src/ui/workspace-grid';
import {liveDataOf,persistableWorkspace} from '../../src/ui/live-workspace';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {prepareWorkspaceData} from '../../src/ui/workspace-transfer';
import {createPaperAccount} from '../../src/domain/paper';
import {liveOpenTargetFor,cryptoProductFor} from '../../src/watchlists/live-watch';
import {NeedsLiveData,ExampleDataBanner,EXAMPLE_BANNER_TEXT,NEEDS_LIVE_STOCKS} from '../../src/ui/NeedsLiveData';
import {isFreshProfile,firstRunVerdict,FIRST_RUN_DATASET_ID,FIRST_RUN_PRODUCT,FIRST_RUN_INTERVAL,FIRST_RUN_EXAMPLE_SYMBOL,FIRST_RUN_LIVE_WAIT_MS,FIRST_RUN_OPEN_WAIT_MS,
 FIRST_RUN_LIVE_MESSAGE,FIRST_RUN_FALLBACK_MESSAGE,FIRST_RUN_BANNER_TEXT,FIRST_RUN_RETRY_LABEL} from '../../src/ui/first-run';

afterEach(()=>setDemoDataMode('legacy'));
const FRESH={revision:0,savedAt:null,data:null};
const payload=(workspace:ReturnType<typeof createInitialWorkspace>)=>prepareWorkspaceJSON({...persistableWorkspace(workspace),paper:createPaperAccount(),alerts:[]});
const liveData=(bars:number,state:'loading'|'ready'|'error'|'disconnected',id=FIRST_RUN_DATASET_ID)=>({bars:Array.from({length:bars},(_,i)=>({time:i*86400,open:1,high:1,low:1,close:1,volume:1})),provenance:{datasetId:id,state}}) as never;

it('a fresh profile opens on Coinbase BTC-USD daily, with Coinbase on and no Alpaca symbols',()=>{
 expect(isFreshProfile(FRESH,false)).toBe(true);
 expect(FIRST_RUN_DATASET_ID).toBe('live:coinbase-public:BTC-USD:1D');
 expect([FIRST_RUN_PRODUCT,FIRST_RUN_INTERVAL]).toEqual(['BTC-USD','1D']);
 setDemoDataMode('off');
 const first=createFirstRunWorkspace(),grid=first.grid!,cell=grid.layout.cells.find(row=>row.id===grid.layout.activeCellId)!;
 expect(first.symbol).toBe(FIRST_RUN_EXAMPLE_SYMBOL);expect(cell.symbol).toBe('BTC');expect(cell.interval).toBe('1D');
 expect(liveDataOf(first)).toEqual({coinbase:true,alpacaSymbols:[]});
 // The app's start-on-placeholder step opens the placeholder's live source: Coinbase BTC-USD, never Alpaca.
 const chart=selectedDataset(first);expect(isDemoPlaceholder(chart)).toBe(true);
 expect(liveOpenTargetFor(chart.instrument.symbol,{stocks:false,crypto:liveDataOf(first).coinbase})).toEqual({providerId:'coinbase-public',symbol:'BTC-USD'});
 // The rest is the factory workspace: same watchlist, layouts and settings.
 const factory=createInitialWorkspace();
 expect(first.watchlist).toEqual(factory.watchlist);expect(first.chartSettings).toEqual(factory.chartSettings);expect(first.layoutLibrary!.entries.length).toBe(factory.layoutLibrary!.entries.length);
 // The first-run workspace saves and restores like any other.
 const restored=prepareWorkspaceData(payload(first)).workspace;
 expect(restored.symbol).toBe('BTC');expect(liveDataOf(restored).coinbase).toBe(true);
});

it('offline: a Coinbase failure or an empty wait falls back to example data, with a one-line message and a retry',()=>{
 const base={chartSourceId:FIRST_RUN_DATASET_ID,placeholder:false,opened:true};
 expect(firstRunVerdict({...base,dataset:liveData(300,'ready'),elapsedMs:900})).toBe('live');
 expect(firstRunVerdict({...base,dataset:liveData(300,'disconnected'),elapsedMs:900})).toBe('live'); // cached bars still count
 expect(firstRunVerdict({...base,dataset:liveData(0,'error'),elapsedMs:200})).toBe('fallback');
 expect(firstRunVerdict({...base,dataset:liveData(0,'loading'),elapsedMs:FIRST_RUN_LIVE_WAIT_MS-1})).toBe('wait');
 expect(firstRunVerdict({...base,dataset:liveData(0,'loading'),elapsedMs:FIRST_RUN_LIVE_WAIT_MS})).toBe('fallback');
 expect(firstRunVerdict({...base,dataset:null,elapsedMs:FIRST_RUN_LIVE_WAIT_MS})).toBe('fallback');
 // Still on the BTC placeholder (the live chart never opened): waits for the key check, then falls back.
 expect(firstRunVerdict({chartSourceId:null,placeholder:true,opened:false,dataset:null,elapsedMs:FIRST_RUN_OPEN_WAIT_MS-1})).toBe('wait');
 expect(firstRunVerdict({chartSourceId:null,placeholder:true,opened:false,dataset:null,elapsedMs:FIRST_RUN_OPEN_WAIT_MS})).toBe('fallback');
 expect(FIRST_RUN_LIVE_WAIT_MS).toBeLessThanOrEqual(8000);
 // The fallback banner: one line, says why, offers Try live again.
 const banner=renderToStaticMarkup(React.createElement(ExampleDataBanner,{text:FIRST_RUN_BANNER_TEXT,leaveLabel:FIRST_RUN_RETRY_LABEL,onLeave:()=>{}}));
 expect(banner).toContain('Coinbase could not be reached');expect(banner).toContain('>Try live again</button>');expect(banner).not.toContain('Leave example mode');
 expect(FIRST_RUN_FALLBACK_MESSAGE).toMatch(/example data/);expect(FIRST_RUN_FALLBACK_MESSAGE.split(/[.!?]\s/).length).toBe(1);
 // The ordinary example banner is unchanged.
 expect(renderToStaticMarkup(React.createElement(ExampleDataBanner,{onLeave:()=>{}}))).toContain(EXAMPLE_BANNER_TEXT);
});

it('the user moving the chart first is never overridden',()=>{
 expect(firstRunVerdict({chartSourceId:'live:coinbase-public:ETH-USD:1D',placeholder:false,opened:true,dataset:liveData(0,'loading','live:coinbase-public:ETH-USD:1D'),elapsedMs:60000})).toBe('abandon');
 expect(firstRunVerdict({chartSourceId:null,placeholder:false,opened:false,dataset:null,elapsedMs:60000})).toBe('abandon');
});

it('an existing workspace is untouched: only a never-saved profile is a first run',()=>{
 expect(isFreshProfile({revision:4,savedAt:'2026-10-01T00:00:00.000Z',data:{}},false)).toBe(false);
 expect(isFreshProfile({revision:1,savedAt:'2026-10-01T00:00:00.000Z',data:null},false)).toBe(false); // saved, then emptied
 expect(isFreshProfile({revision:0,savedAt:null,data:{symbol:'GME'}},false)).toBe(false); // copied LarryVision data
 expect(isFreshProfile(FRESH,true)).toBe(false); // a layout window
 expect(isFreshProfile(null,false)).toBe(false);
 // A saved factory workspace (GME, Coinbase off) restores exactly as saved.
 const saved=payload(createInitialWorkspace()),before=JSON.stringify(saved),restored=prepareWorkspaceData(saved).workspace;
 expect(JSON.stringify(saved)).toBe(before);expect(restored.symbol).toBe('GME');expect(liveDataOf(restored).coinbase).toBe(false);
 // Reset and recovery keep the factory workspace (no live source switched on).
 expect(createInitialWorkspace().liveData).toBeUndefined();expect(createInitialWorkspace().symbol).toBe('GME');
});

it('no Alpaca prompt on first run, and stock charts keep a plain hint about the free key',()=>{
 for(const text of [FIRST_RUN_LIVE_MESSAGE,FIRST_RUN_FALLBACK_MESSAGE,FIRST_RUN_BANNER_TEXT,FIRST_RUN_RETRY_LABEL]){expect(text).not.toMatch(/alpaca/i);expect(text).not.toMatch(/—/);}
 // Even the BTC chart's own card (if it ever showed) would recommend Coinbase, not Alpaca.
 expect(cryptoProductFor('BTC')).toBe('BTC-USD');
 const crypto=renderToStaticMarkup(React.createElement(NeedsLiveData,{symbol:'BTC-USD',crypto:true,liveReady:true,example:false,onOpenLive:()=>{},onOpenDataSources:()=>{},onLoadExample:()=>{}}));
 expect(crypto).not.toMatch(/alpaca/i);
 const stock=renderToStaticMarkup(React.createElement(NeedsLiveData,{symbol:'SPY',crypto:false,liveReady:false,example:false,onOpenLive:()=>{},onOpenDataSources:()=>{},onLoadExample:()=>{}}));
 expect(stock).toContain(NEEDS_LIVE_STOCKS);expect(NEEDS_LIVE_STOCKS).toMatch(/real-time US stocks/);expect(NEEDS_LIVE_STOCKS).toMatch(/free Alpaca key/);
});
