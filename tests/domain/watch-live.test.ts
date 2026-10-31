import {afterEach,describe,expect,it,vi} from 'vitest';
import {AlpacaLiveProvider,ALPACA_CAP_MESSAGE,ALPACA_IEX_PROVIDER_ID,ALPACA_STUB_PROVIDER_ID,BUSY_RETRIES,isAlpacaSyntheticStub,selectAlpacaSyntheticStub,type AlpacaBridge,type AlpacaEvent,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {COINBASE_PROVIDER_ID} from '../../src/domain/coinbase-live';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {Bar,BarDataset} from '../../src/domain/types';
import type {LiveHandle} from '../../src/domain/live-provider';
import {createListAlert,evaluateListAlerts,type ListAlert} from '../../src/domain/watchlist-alerts';
import {addWatchList,addWatchSymbols,createWatchBook,referenceFromDataset,type WatchBook,type WatchReference} from '../../src/watchlists/model';
import {watchQuote} from '../../src/watchlists/quotes';
import {liveDailyCompanionId,parseWatchLiveId,planWatchFeeds,watchOverCapTitle,watchQuoteDatasets,WATCH_OVER_CAP_TEXT,type WatchFeedPlan} from '../../src/watchlists/live-watch';
import {WatchFeedHost,evaluateLiveListAlerts,listAlertSessionDatasets,liveListAlertStep} from '../../src/ui/background-watch-feeds';
import {watchSourceBadge} from '../../src/watchlists/menus';
import {alertUsesSyntheticStub,planBackgroundAlertFeeds} from '../../src/ui/background-alert-plan';
import {alertOn,liveLike} from '../helpers/background-alert-fixtures';
import {evaluateTechnicalAlertSources,technicalSourceKey} from '../../src/domain/technical-alerts';
import {alertDatasetKey,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {captureDrawingBoundary} from '../../src/chart/drawing-alert-geometry';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {defaultTheme} from '../../src/ui/themes';
import {DEFAULT_STRATEGY_CONFIG} from '../../src/domain/strategy';

// SYNTHETIC bars and a synthetic bridge only: no network, no key.
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const ET=(h:number,m=0,d=21)=>Date.UTC(2026,9,d,h+4,m)/1000; // EDT (UTC-4): a Wednesday session in October 2026
const NY_MIDNIGHT=(d:number)=>Date.UTC(2026,9,d,4)/1000;
const bar=(time:number,close:number,volume=1):Bar=>({time,open:close,high:close,low:close,close,volume});
function alpaca(symbol:string,resolution:string,bars:Bar[],providerId=ALPACA_IEX_PROVIDER_ID):BarDataset{
 const base=fixtureDataset('GME',2),exchange=providerId===ALPACA_IEX_PROVIDER_ID?'US':'COINBASE';
 return{...base,resolution,bars,instrument:{...base.instrument,id:exchange+':'+symbol,symbol,name:'SYNTHETIC '+symbol,exchange,assetClass:'stock',timezone:'America/New_York',currency:'USD'},provenance:{...base.provenance,providerId,providerName:'SYNTHETIC live test feed',datasetId:`live:${providerId}:${symbol}:${resolution}`,fixture:false,session:'unknown',state:'ready',delaySeconds:0,asOf:bars.at(-1)?.time??0}};
}
const status=(symbols:string[]):AlpacaStatus=>({schemaVersion:1,state:'ready',symbols,feed:'iex',attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{}});
function bridge(){
 const bridge={
  fetchAlpacaBars:vi.fn(async(input:any)=>({ok:true as const,value:{schemaVersion:1 as const,symbol:input.symbol,timeframe:input.timeframe,seconds:0,feed:input.feed,bars:[],nextPageToken:null,provenance:{} as any}})),
  subscribeAlpaca:vi.fn(async(input:{symbols:string[]})=>({ok:true as const,value:status(input.symbols)})),
  unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),
  onAlpacaEvent:vi.fn((_fn:(e:AlpacaEvent)=>void)=>()=>undefined),
 } as unknown as AlpacaBridge;
 return bridge;
}
const letters=(i:number)=>String.fromCharCode(65+Math.floor(i/26),65+i%26);
const lastSubscribed=(b:AlpacaBridge)=>{const calls=(b.subscribeAlpaca as any).mock.calls;return calls.at(-1)[0].symbols as string[];};
function bookWith(rows:WatchReference[],extra?:{id:string;rows:WatchReference[]}):WatchBook{
 let book=createWatchBook([]);const list=book.lists[0].id;let n=0;book=addWatchSymbols(book,list,rows,()=>'r'+ ++n);
 if(extra){book=addWatchList(book,extra.id,'Alerted');book=addWatchSymbols(book,extra.id,extra.rows,()=>'x'+ ++n);book={...book,activeId:list};}
 return book;
}
const ref=(dataset:BarDataset):WatchReference=>referenceFromDataset(dataset);

describe('Alpaca slots: watchlist feeds yield to charts, alerts and paper orders',()=>{
 it('a watchlist (yielding) open over the cap is refused; a chart open takes the newest watch-only symbol and tells its owner',async()=>{
  const b=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>ET(10)}),evicted:string[]=[];
  const handles=Array.from({length:30},(_,i)=>provider.open(letters(i),'1m',{yielding:true,onEvicted:()=>evicted.push(letters(i))}));await flush();
  expect(lastSubscribed(b)).toHaveLength(30);
  expect(()=>provider.open('ZZ','1m',{yielding:true})).toThrow(ALPACA_CAP_MESSAGE);
  const chart=provider.open('ZZ','1m');await flush();
  expect(evicted).toEqual([letters(29)]);
  const symbols=lastSubscribed(b);expect(symbols).toHaveLength(30);expect(symbols).toContain('ZZ');expect(symbols).not.toContain(letters(29));
  handles[29].close();expect(evicted).toEqual([letters(29)]); // closing an evicted handle again is harmless
  chart.close();for(const handle of handles)handle.close();
 });
 it('a symbol a chart also holds is never evicted; with only strong holders the cap refuses as before',async()=>{
  const b=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>ET(10)}),evicted:string[]=[];
  const strong=Array.from({length:29},(_,i)=>provider.open(letters(i),'1m'));
  const watch=provider.open('AB','1D',{yielding:true,onEvicted:()=>evicted.push('AB')});
  const lastWatch=provider.open('YY','1m',{yielding:true,onEvicted:()=>evicted.push('YY')});
  // AB is held by a chart too, so the first stronger need takes YY.
  const chart=provider.open('ZZ','1m');expect(evicted).toEqual(['YY']);
  expect(()=>provider.open('ZY','1m')).toThrow(ALPACA_CAP_MESSAGE);expect(evicted).toEqual(['YY']);
  for(const handle of [...strong,watch,lastWatch,chart])handle.close();await flush();
  expect(b.unsubscribeAlpaca).toHaveBeenCalled();
 });
});

describe('watch feed plan (pure)',()=>{
 const gme=alpaca('GME','1m',[]),spy=alpaca('SPY','1m',[]),xyz=alpaca('XYZ','5m',[]),btc=alpaca('BTC-USD','1m',[],COINBASE_PROVIDER_ID);
 const local={symbol:'AAA',exchange:'NYSE',datasetId:'wl:NYSE:AAA',dailyDatasetId:null,synthetic:false},demo={symbol:'GME',exchange:'SYNTH',datasetId:'live:alpaca-iex:GME:1m',dailyDatasetId:null,synthetic:true};
 it('parses live ids and names the daily companion',()=>{
  expect(parseWatchLiveId('live:alpaca-iex:GME.WS:1m')).toEqual({providerId:'alpaca-iex',symbol:'GME.WS',resolution:'1m'});
  expect(parseWatchLiveId('wl:NYSE:AAA')).toBeNull();
  expect(liveDailyCompanionId('live:alpaca-iex:GME:1m')).toBe('live:alpaca-iex:GME:1D');expect(liveDailyCompanionId('live:alpaca-iex:GME:1D')).toBeNull();expect(liveDailyCompanionId(null)).toBeNull();
 });
 it('charts first (taken), then list-alert members, then the watchlist in row order; an over-cap row gets a plain note',()=>{
  const book=bookWith([ref(gme),ref(spy),ref(btc),local,demo],{id:'L2',rows:[ref(xyz)]});
  const alert={status:'active',listId:'L2'} as unknown as ListAlert;
  const plan=planWatchFeeds({book,listAlerts:[alert],taken:new Set(['GME']),charted:new Set(['live:alpaca-iex:GME:1m']),max:2});
  expect(plan.feeds.map(feed=>feed.datasetId+'@'+feed.priority)).toEqual(['live:alpaca-iex:XYZ:5m@alert','live:alpaca-iex:XYZ:1D@alert','live:alpaca-iex:GME:1D@watch',`live:${COINBASE_PROVIDER_ID}:BTC-USD:1m@watch`,`live:${COINBASE_PROVIDER_ID}:BTC-USD:1D@watch`]);
  expect(plan.over).toEqual(['SPY']);
  expect([...plan.notes]).toEqual([['US:SPY',{text:WATCH_OVER_CAP_TEXT,title:watchOverCapTitle(2)}]]);
  expect(watchOverCapTitle(30)).toContain('at most 30 symbols');expect(watchOverCapTitle(30)).toContain('Charts come first, then alerts and paper orders, then the watchlist');
 });
 it('a paused list alert takes no slot, and a symbol both an alert and the watchlist name streams at alert priority',()=>{
  const book=bookWith([ref(spy)],{id:'L2',rows:[ref(spy)]});
  expect(planWatchFeeds({book,listAlerts:[{status:'paused',listId:'L2'} as unknown as ListAlert],taken:new Set()}).feeds.every(feed=>feed.priority==='watch')).toBe(true);
  const plan=planWatchFeeds({book,listAlerts:[{status:'active',listId:'L2'} as unknown as ListAlert],taken:new Set()});
  expect(plan.feeds.map(feed=>feed.datasetId+'@'+feed.priority)).toEqual(['live:alpaca-iex:SPY:1m@alert','live:alpaca-iex:SPY:1D@alert']);
 });
 it('quote datasets take the newest live snapshot and add background feeds no chart holds',()=>{
  const stale=alpaca('GME','1m',[bar(ET(10),20)]),fresh=alpaca('GME','1m',[bar(ET(10),20),bar(ET(10,1),21)]),daily=alpaca('GME','1D',[bar(NY_MIDNIGHT(21),21)]),other=fixtureDataset('AAA',3);
  const rows=watchQuoteDatasets([other,stale],{[fresh.provenance.datasetId]:fresh},[daily,alpaca('GME','1m',[bar(ET(10),1)])]);
  expect(rows).toEqual([other,fresh,daily]);
 });
});

describe('live quote change from the live daily companion',()=>{
 it('Last moves with the stream; Chg compares it with the previous New York day close; volume is the day bar',()=>{
  const minute=alpaca('GME','1m',[bar(ET(9,30),24),bar(ET(10,15),26.5)]),daily=alpaca('GME','1D',[bar(NY_MIDNIGHT(19),20,5),bar(NY_MIDNIGHT(20),25,7),bar(NY_MIDNIGHT(21),26,9)]);
  const quote=watchQuote(ref(minute),[minute,daily]);
  expect(quote).toMatchObject({last:26.5,change:1.5,changePercent:6,changePercentState:'value',volume:9,dailyBasis:true});
  expect(quote.reason).toContain('previous live daily close');
  const tick=alpaca('GME','1m',[...minute.bars,bar(ET(10,16),24)]);expect(watchQuote(ref(tick),[tick,daily])).toMatchObject({last:24,change:-1});
  expect(watchQuote(ref(minute),[minute])).toMatchObject({last:26.5,change:null,dailyBasis:false});
  // A daily feed from another provider is not a companion.
  const foreign=alpaca('GME','1D',daily.bars,COINBASE_PROVIDER_ID);expect(watchQuote(ref(minute),[minute,{...foreign,provenance:{...foreign.provenance,datasetId:'live:alpaca-iex:GME:1D'}}]).change).toBeNull();
 });
 // merge review #5: a 1W or 1M live row's last bar opens at its period start, so "24 hours before Last" is not the previous
 // trading day. The previous day comes from the companion daily feed's own last two New York dates.
 it('1W and 1M live rows compare Last with the previous New York day close from the daily companion',()=>{
  const daily=alpaca('GME','1D',[bar(NY_MIDNIGHT(19),20,5),bar(NY_MIDNIGHT(20),25,7),bar(NY_MIDNIGHT(21),26,9)]);
  const week=alpaca('GME','1W',[bar(NY_MIDNIGHT(12),18),bar(NY_MIDNIGHT(19),26.5)]),month=alpaca('GME','1M',[bar(NY_MIDNIGHT(1),26.5)]);
  expect(watchQuote(ref(week),[week,daily])).toMatchObject({last:26.5,change:1.5,changePercent:6,volume:9,dailyBasis:true});
  expect(watchQuote(ref(month),[month,daily])).toMatchObject({last:26.5,change:1.5,volume:9});
  // An intraday row whose day has no daily bar yet compares with the latest daily close and shows no day volume.
  const nextDay=alpaca('GME','1m',[bar(ET(10,0,22),27)]);
  expect(watchQuote(ref(nextDay),[nextDay,daily])).toMatchObject({last:27,change:1,volume:null});
 });
});

describe('background watch feed host',()=>{
 function fake(dataset:BarDataset){const listeners=new Set<(d:BarDataset)=>void>();let current=dataset;const handle={datasetId:dataset.provenance.datasetId,dataset:()=>current,formingTime:()=>null,onChange:(fn:(d:BarDataset)=>void)=>{listeners.add(fn);return()=>listeners.delete(fn);},close:vi.fn(),loadOlder:async()=>undefined,historyState:()=>({}) } as unknown as LiveHandle&{close:ReturnType<typeof vi.fn>};return{handle,push:(next:BarDataset)=>{current=next;for(const fn of listeners)fn(next);}};}
 it('opens the plan, notes refused feeds, follows eviction and closes what the plan drops',()=>{
  const book=bookWith([ref(alpaca('GME','1m',[])),ref(alpaca('SPY','1m',[]))]);
  const plan:WatchFeedPlan=planWatchFeeds({book,taken:new Set()});
  const opened=new Map<string,ReturnType<typeof fake>>(),evictors=new Map<string,()=>void>(),published:Array<{ids:string[];notes:Map<string,unknown>}>=[];
  const host=new WatchFeedHost({intervalMs:0,open:(feed,onEvicted)=>{if(feed.symbol==='SPY'&&feed.resolution==='1m')throw new Error(ALPACA_CAP_MESSAGE);const f=fake(alpaca(feed.symbol,feed.resolution,[bar(ET(10),1)]));opened.set(feed.datasetId,f);evictors.set(feed.datasetId,onEvicted);return f.handle;},publish:(datasets,notes)=>published.push({ids:datasets.map(row=>row.provenance.datasetId),notes:new Map(notes)})});
  host.sync(plan);
  expect(published.at(-1)!.ids).toEqual(['live:alpaca-iex:GME:1m','live:alpaca-iex:GME:1D','live:alpaca-iex:SPY:1D']);
  expect(published.at(-1)!.notes.get('US:SPY')).toEqual({text:'NO LIVE',title:watchOverCapTitle(30)});
  opened.get('live:alpaca-iex:GME:1m')!.push(alpaca('GME','1m',[bar(ET(10),1),bar(ET(10,1),2)]));
  expect(host.datasets()[0].bars.at(-1)!.close).toBe(2);
  evictors.get('live:alpaca-iex:GME:1m')!();
  expect(published.at(-1)!.ids).not.toContain('live:alpaca-iex:GME:1m');expect(published.at(-1)!.notes.get('US:GME')).toMatchObject({text:'NO LIVE'});
  host.sync(planWatchFeeds({book:bookWith([]),taken:new Set()}));
  expect(opened.get('live:alpaca-iex:GME:1D')!.handle.close).toHaveBeenCalledTimes(1);expect(published.at(-1)!.ids).toEqual([]);
  host.dispose();host.sync(plan);expect(published.at(-1)!.ids).toEqual([]);
 });
});

describe('Add alert on list over live Alpaca feeds (one alert, one trigger per symbol)',()=>{
 const minutes=(closes:number[],start=ET(9,30))=>closes.map((close,i)=>bar(start+i*60,close));
 it('regular list alerts read regular-session bars; extended ones read every bar',()=>{
  const gme=alpaca('GME','1m',[bar(ET(8),30),...minutes([9,9,9])]);
  const [regular]=listAlertSessionDatasets([gme],'regular'),[extended]=listAlertSessionDatasets([gme],'extended');
  // The forming 09:32 bar stays last for the evaluation's own closed view to remove; the 08:00 pre-market bar is not regular.
  expect(regular.bars.map(row=>row.time)).toEqual([ET(9,30),ET(9,31),ET(9,32)]);expect(regular.provenance.session).toBe('regular');
  expect(extended.bars.map(row=>row.time)).toEqual([ET(8),ET(9,30),ET(9,31),ET(9,32)]);expect(extended.provenance.session).toBe('all');
  const after=alpaca('GME','1m',[...minutes([9,9]),bar(ET(16,5),9)]);expect(listAlertSessionDatasets([after],'regular')[0].bars.map(row=>row.time)).toEqual([ET(9,30),ET(9,31),ET(16,5)]);
  const local=fixtureDataset('AAA',3);expect(listAlertSessionDatasets([local],'regular')[0]).toBe(local);
 });
 it('fires once for each member that crosses, on completed bars only',()=>{
  const gme=alpaca('GME','1m',minutes([9,9,9])),spy=alpaca('SPY','1m',minutes([9,9,9])),ws=alpaca('GME.WS','1m',minutes([9,9,9]));
  const book=bookWith([],{id:'L',rows:[ref(gme),ref(spy),ref(ws)]});
  const alert=createListAlert({id:'la',listId:'L',name:'SYNTHETIC cross 10',message:'Level reached',condition:{kind:'crossing-up',value:10},frequency:'once-per-bar',session:'regular',createdAt:ET(9),expiresAt:null},[],book,listAlertSessionDatasets([gme,spy,ws],'regular'));
  let batch=evaluateLiveListAlerts([alert],book,[gme,spy,ws]);expect(batch.notifications).toEqual([]);
  // Raw Alpaca bars carry no session field, so the plain evaluation cannot run a regular list alert on them.
  expect(evaluateListAlerts(batch.alerts,book,[gme,spy,ws]).alerts[0].members.map(row=>row.reason)).toEqual(Array(3).fill('This source does not separate regular-session bars.'));
  const grow=(d:BarDataset,closes:number[])=>alpaca(d.instrument.symbol,'1m',[...d.bars,...minutes(closes,d.bars.at(-1)!.time+60)]);
  // GME and SPY cross on the next completed minute; GME.WS only on its forming bar, which never counts.
  batch=evaluateLiveListAlerts(batch.alerts,book,[grow(gme,[11,11]),grow(spy,[12,12]),grow(ws,[9,30])]);
  expect(batch.changed).toBe(true);
  expect(batch.notifications.map(row=>row.memberKey+'='+row.value)).toEqual(['US:GME=11','US:SPY=12']);
  expect(batch.alerts).toHaveLength(1);
  const again=evaluateLiveListAlerts(batch.alerts,book,[grow(gme,[11,11]),grow(spy,[12,12]),grow(ws,[9,30])]);expect(again.notifications).toEqual([]);expect(again.changed).toBe(false);expect(again.alerts).toBe(batch.alerts);
 });
});

describe('drawing alerts run in the background when their geometry is saved',()=>{
 const day=1704153600,close:AlertSourceSnapshot={kind:'price',field:'close',transformId:'standard'};
 function daily(values:number[],times:number[]):BarDataset{const base=fixtureDataset('GME',5);return{...base,bars:values.map((value,i)=>({time:times[i],open:value,high:value+1,low:Math.max(.01,value-1),close:value,volume:100}))};}
 const record={id:'original-line',type:'trendline',paneId:'price',anchors:[{time:day*1000,price:100},{time:(day+240)*1000,price:120}],style:{extendRight:true}};
 it('a frozen drawing boundary keeps its value when the feed starts earlier by whole bars; any other change still refuses',async()=>{
  const data=daily([100,100,119],[day,day+60,day+240]);
  const captured=captureDrawingBoundary(record,data.bars,{source:sourceContextForDataset(data),style:'candles',scale:'linear'});if(!captured.ok)throw new Error(captured.diagnostics.join(' '));
  const boundary:AlertSourceSnapshot={kind:'drawing-boundary',instanceId:record.id,snapshotId:'g',geometry:captured.snapshot,mutationPolicy:'frozen'},source:AlertSourceSnapshot={kind:'comparison',snapshotId:'c',left:close,right:boundary};
  const basis={sourceBasis:alertDatasetKey(data,2),sourceRevision:data.provenance.revision};
  const next={time:day+10000,open:140,high:141,low:139,close:140,volume:100};
  const value=async(bars:Bar[])=>(await evaluateTechnicalAlertSources(bars,[source],'USD',basis)).results.get(technicalSourceKey(source))!;
  const same=await value([...data.bars,next]);expect(same.sample.value).toBe(10);
  const earlier=await value([{...data.bars[0],time:day-60},{...data.bars[0],time:day-30},...data.bars,next]);
  expect(earlier.diagnostics).toEqual([]);expect(earlier.sample.value).toBe(10);
  const inserted=await value([data.bars[0],{...data.bars[1],time:day+30},...data.bars.slice(1),next]);
  expect(inserted.sample.value).toBeNull();expect(inserted.diagnostics.join(' ')).toContain('grid changed');
 });
 it('the background plan keeps a saved drawing boundary and, since, the older drawing kind too',()=>{
  const feed=liveLike('GME','5m');
  const captured=captureDrawingBoundary(record,daily([100,100,119],[day,day+60,day+240]).bars,{source:sourceContextForDataset(feed),style:'candles',scale:'linear'});if(!captured.ok)throw new Error(captured.diagnostics.join(' '));
  const boundary:AlertSourceSnapshot={kind:'drawing-boundary',instanceId:record.id,snapshotId:'g',geometry:captured.snapshot,mutationPolicy:'frozen'};
  const legacy:AlertSourceSnapshot={kind:'drawing',instanceId:'line',snapshotId:'d',tool:'trendline',anchors:[{time:day,price:1},{time:day+60,price:2}],settings:{},evaluation:'signed-price-distance',coordinateModel:'linear-time-price'};
  // The older 'drawing' kind can no longer be created; it only exists in alerts saved before geometry was frozen.
  const old=structuredClone(alertOn(feed,'legacy'));(old.definition.observationBinding as {source:AlertSourceSnapshot}).source=legacy;
  const plan=planBackgroundAlertFeeds({alerts:[alertOn(feed,'boundary',{condition:{kind:'crossing',value:0}},{kind:'comparison',snapshotId:'c',left:close,right:boundary}),old],activeInstrumentId:'other',openAlpacaSymbols:new Set()});
  // The older kind is checked against the drawing saved in the workspace (legacy-drawing-alert.ts).
  expect(plan.feeds.map(row=>row.alertIds)).toEqual([['boundary','legacy']]);
  expect(plan.skipped).toEqual([]);
 });
});

describe('workspace keeps list alerts',()=>{
 it('restores a saved listAlerts collection and refuses a malformed one',()=>{
  const gme=alpaca('GME','1m',[bar(ET(9,30),9),bar(ET(9,31),9)]),book=bookWith([],{id:'L',rows:[ref(gme)]});
  const alert=createListAlert({id:'la',listId:'L',name:'SYNTHETIC',message:'',condition:{kind:'crossing-up',value:10},frequency:'only-once',session:'extended',createdAt:ET(9),expiresAt:null},[],book,[gme]);
  const original:any={version:1,symbol:'GME',chartStyle:'candles',themeId:defaultTheme.id,appearance:defaultTheme.appearance,watchlist:['GME'],drawings:{version:1,drawings:[]},indicators:[],imports:[],sourceId:null,script:{id:'test',name:'Test',source:'({onBar(){}})',pane:'price'},chartOptions:{source:'close',scale:'linear',auto:true,invert:false,timezone:'UTC'},strategy:DEFAULT_STRATEGY_CONFIG};
  const screenConfiguration={columns:[{id:'symbol',metric:'symbol'}],filters:[],sort:{columnId:'symbol',direction:'asc'},universe:{resolution:'1D',currency:'USD',assets:['stock','etf'],excludedInstrumentIds:[],sourceChoices:{}},filtersHidden:false,view:'table'};
  original.screener={...screenConfiguration,schemaVersion:2,name:'Loaded stocks and ETFs',activeScreenId:'local-default-screen',screens:[{id:'local-default-screen',name:'Loaded stocks and ETFs',configuration:structuredClone(screenConfiguration),revision:1,savedAt:0}],recentIds:['local-default-screen'],autosave:false};
  expect((restoreWorkspace({...original,listAlerts:[alert]},original) as any).listAlerts).toEqual([alert]);
  expect('listAlerts' in (restoreWorkspace(original,original) as any)).toBe(false);
  expect(()=>restoreWorkspace({...original,listAlerts:[{...alert,extra:1}]},original)).toThrow();
 });
});

describe('the keyless stub is labelled SYNTHETIC everywhere (live:alpaca-stub:*)',()=>{
 afterEach(()=>selectAlpacaSyntheticStub(false));
 it('once main reports the stub, Alpaca datasets use the stub namespace and provider name; fixture stays false',async()=>{
  expect(isAlpacaSyntheticStub()).toBe(false);
  selectAlpacaSyntheticStub();
  expect(ALPACA_IEX_PROVIDER_ID).toBe(ALPACA_STUB_PROVIDER_ID);
  const provider=new AlpacaLiveProvider(bridge(),{now:()=>ET(10)}),handle=provider.open('GME','1m');await flush();
  const data=handle.dataset();
  expect(data.provenance).toMatchObject({providerId:'alpaca-stub',providerName:'SYNTHETIC Alpaca stub (invented prices)',datasetId:'live:alpaca-stub:GME:1m',fixture:false});
  handle.close();provider.dispose();
  selectAlpacaSyntheticStub(false);expect(ALPACA_IEX_PROVIDER_ID).toBe('alpaca-iex');
 });
 it('watchlist badge and reason, the cap plan, list-alert triggers and alert history all say SYNTHETIC',()=>{
  selectAlpacaSyntheticStub();
  const minute=alpaca('GME','1m',[bar(ET(9,30),24),bar(ET(10),26.5)],ALPACA_STUB_PROVIDER_ID),daily=alpaca('GME','1D',[bar(NY_MIDNIGHT(20),25),bar(NY_MIDNIGHT(21),26)],ALPACA_STUB_PROVIDER_ID);
  const instrument={...minute.instrument,exchange:'US',id:'US:GME'};const stub={...minute,instrument},stubDaily={...daily,instrument};
  expect(watchSourceBadge(ref(stub),stub,false)).toMatchObject({text:'DEMO',title:expect.stringContaining('invented prices from the keyless test stub')});
  const quote=watchQuote(ref(stub),[stub,stubDaily]);expect(quote.reason.startsWith('SYNTHETIC (keyless Alpaca stub, invented prices). ')).toBe(true);expect(quote.change).toBe(1.5);
  // The cap counts stub symbols like Alpaca ones.
  const plan=planWatchFeeds({book:bookWith([ref(stub),ref(alpaca('SPY','1m',[],ALPACA_STUB_PROVIDER_ID))]),taken:new Set(['QQQ']),max:2});
  expect(plan.over).toEqual(['SPY']);expect(plan.feeds.map(feed=>feed.datasetId)).toEqual(['live:alpaca-stub:GME:1m','live:alpaca-stub:GME:1D']);
  // Session views treat stub bars like Alpaca IEX bars.
  expect(listAlertSessionDatasets([alpaca('GME','1m',[bar(ET(8),1),bar(ET(9,30),2),bar(ET(9,31),3)],ALPACA_STUB_PROVIDER_ID)],'regular')[0].bars.map(row=>row.time)).toEqual([ET(9,30),ET(9,31)]);
  const local=liveLike('GME','5m',ALPACA_STUB_PROVIDER_ID),real=liveLike('GME','5m');
  expect(alertUsesSyntheticStub(alertOn(local,'s'))).toBe(true);expect(alertUsesSyntheticStub(alertOn(real,'r'))).toBe(false);
 });
});

describe('list alerts write the workspace only when something changed',()=>{
 afterEach(()=>selectAlpacaSyntheticStub(false));
 it('10 forming-bar ticks make 0 commits; a newly completed bar makes 1; a stub trigger is named SYNTHETIC',()=>{
  selectAlpacaSyntheticStub();
  const minutes=(closes:number[],start=ET(9,30))=>closes.map((close,i)=>bar(start+i*60,close));
  const feed=(closes:number[],forming:number)=>alpaca('GME','1m',[...minutes(closes),bar(ET(9,30)+closes.length*60,forming)],ALPACA_STUB_PROVIDER_ID);
  const book=bookWith([],{id:'L',rows:[ref(feed([9,9],9))]});
  let saved=[createListAlert({id:'la',listId:'L',name:'Cross 10',message:'',condition:{kind:'crossing-up',value:10},frequency:'once-per-bar',session:'extended',createdAt:ET(9),expiresAt:null},[],book,[feed([9,9],9)])];
  let commits=0;const run=(data:BarDataset)=>{const step=liveListAlertStep(saved,book,[data]);if(step){commits++;saved=step.alerts;}return step;};
  run(feed([9,9],9));commits=0; // members took their baseline
  for(let tick=0;tick<10;tick++)expect(run(feed([9,9],9+tick*0.05))).toBeNull();
  expect(commits).toBe(0);
  const step=run(feed([9,9,11],11.2));
  expect(commits).toBe(1);expect(step!.deliveries.map(item=>item.notification.name)).toEqual(['SYNTHETIC Cross 10 (US:GME)']);
  for(let tick=0;tick<10;tick++)run(feed([9,9,11],11+tick*0.01));
  expect(commits).toBe(1);
  expect(liveListAlertStep(undefined,book,[])).toBeNull();expect(liveListAlertStep([],book,[])).toBeNull();
 });
});

describe('cold start: a full main request queue is retried, not left empty',()=>{
 it('a BUSY backfill retries with backoff and then fills; a closed feed stops retrying',async()=>{
  vi.useFakeTimers();
  try{
   let busy=2;const b=bridge();
   (b.fetchAlpacaBars as any).mockImplementation(async(input:any)=>busy-->0?{ok:false,error:{code:'BUSY',message:'Too many Alpaca requests are queued.'}}:{ok:true,value:{schemaVersion:1,symbol:input.symbol,timeframe:input.timeframe,seconds:0,feed:'iex',bars:[bar(ET(9,30),5),bar(ET(9,31),6)],nextPageToken:null,provenance:{}}});
   const provider=new AlpacaLiveProvider(b,{now:()=>ET(10)*1000}),handle=provider.open('GME','1m');
   await vi.advanceTimersByTimeAsync(0);
   expect(handle.dataset().bars).toHaveLength(0);expect(handle.dataset().provenance.state).not.toBe('error');
   await vi.advanceTimersByTimeAsync(4000);
   expect(handle.dataset().bars.map(row=>row.close)).toEqual([5,6]);
   // Two BUSY answers, then the all-exchange history request and the IEX tail request.
   expect((b.fetchAlpacaBars as any).mock.calls.length).toBe(4);
   // Always BUSY: it gives up after BUSY_RETRIES and says so; a closed feed never retries.
   busy=1e9;const stuck=provider.open('SPY','1m');await vi.advanceTimersByTimeAsync(120000);
   expect(stuck.dataset().provenance.state).toBe('error');
   const calls=(b.fetchAlpacaBars as any).mock.calls.filter((call:any)=>call[0].symbol==='SPY').length;expect(calls).toBe(BUSY_RETRIES+1);
   const gone=provider.open('QQQ','1m');gone.close();const before=(b.fetchAlpacaBars as any).mock.calls.length;await vi.advanceTimersByTimeAsync(60000);
   expect((b.fetchAlpacaBars as any).mock.calls.length).toBe(before);
   handle.close();stuck.close();provider.dispose();
  }finally{vi.useRealTimers();}
 });
});
