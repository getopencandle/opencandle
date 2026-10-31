import {describe,expect,it,vi} from 'vitest';
import {LiveBarSeries} from '../../src/domain/live-bars';
import {CoinbaseLiveProvider,COINBASE_EARLIEST_HISTORY,COINBASE_RATE_LIMIT_PAUSE_MS,type CoinbaseBridge,type CoinbaseStatus} from '../../src/domain/coinbase-live';
import {AlpacaLiveProvider,type AlpacaBridge,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {holdLiveHistory,LIVE_HISTORY_PAGE_BARS,LIVE_HISTORY_RETRY_MS,LIVE_NO_MORE_DATA,LiveHistoryPager,liveAlertBars,liveAlertView,liveHistoryState,nearHistoryStart,requestLiveHistory} from '../../src/domain/live-history';
import {liveHistoryCorrected} from '../../src/domain/alert-observation';
import {barInputIdentity,liveLineageOf,newerLiveBars,sameBarsInput} from '../../src/chart/bar-input-identity';
import type {Bar,BarDataset} from '../../src/domain/types';

// Lazy older history for live feeds over SYNTHETIC bridges. No network, no key.
const T0=Date.UTC(2026,9,20,15,0,0)/1000;
const bar=(time:number,close=100):Bar=>({time,open:100,high:Math.max(close,100)+1,low:Math.min(close,100)-1,close,volume:1});
const span=(from:number,to:number,step:number)=>{const out:Bar[]=[];for(let t=from;t<to;t+=step)out.push(bar(t));return out;};
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const cbStatus=(state:CoinbaseStatus['state']):CoinbaseStatus=>({schemaVersion:1,state,productIds:['BTC-USD'],attempt:0,lastMessageAt:T0*1000,liveMessages:false,lastError:null,counters:{},});
type CbHandler=(input:{granularity:string;start:number;end:number})=>Bar[]|{error:string};
function coinbase(handler:CbHandler,now=()=>T0*1000){
 const bridge={
  fetchCoinbaseCandles:vi.fn(async(input:any)=>{const out=handler(input);return 'error' in out?{ok:false as const,error:{code:'RATE_LIMITED',message:out.error}}:{ok:true as const,value:{schemaVersion:1 as const,productId:input.productId,granularity:input.granularity,seconds:0,bars:out,provenance:{provider:'synthetic',kind:'public-unauthenticated' as const,sourceUrl:'synthetic',retrievedAt:'',bytes:0,license:''}}};}),
  subscribeCoinbase:vi.fn(async()=>({ok:true as const,value:cbStatus('ready')})),
  unsubscribeCoinbase:vi.fn(async()=>({ok:true as const,value:cbStatus('idle')})),
  onCoinbaseEvent:vi.fn(()=>()=>{}),
 } satisfies CoinbaseBridge;
 return {bridge,provider:new CoinbaseLiveProvider(bridge,{now})};
}
/** SYNTHETIC 5-minute Coinbase history: every aligned bucket exists from `origin` up to the request end (inclusive, as Coinbase). */
const fiveMinute=(origin:number):CbHandler=>input=>input.granularity!=='FIVE_MINUTE'?[]:span(Math.max(origin,Math.ceil(input.start/300)*300),input.end+1,300);

describe('LiveBarSeries.prependHistory',()=>{
 it('adds only bars older than the first loaded bar, dedupes overlap, keeps the origin, and stops at the bar cap',()=>{
  const s=new LiveBarSeries({seconds:60,baseSeconds:60,ticks:true,aligned:true,maxBars:10});
  s.setBackfill(span(T0,T0+5*60,60));const origin=s.originTime,r0=s.revision;
  expect(origin).toBe(T0);
  const result=s.prependHistory([bar(T0-120),bar(T0-60),bar(T0-60,90),bar(T0),bar(T0+60,1),{...bar(T0-180),high:1}]);
  expect(result).toEqual({added:2,capped:false});
  expect(s.bars.map(b=>b.time)).toEqual([T0-120,T0-60,T0,T0+60,T0+120,T0+180,T0+240]);
  expect(s.bars[3].close).toBe(100); // the loaded copy wins over an overlapping REST row
  expect(s.originTime).toBe(origin);expect(s.revision).toBe(r0+1);
  expect(s.prependHistory(span(T0-600,T0-120,60))).toEqual({added:3,capped:true});
  expect(s.bars).toHaveLength(10);expect(s.bars[0].time).toBe(T0-300);
  expect(s.prependHistory([bar(T0-900)])).toEqual({added:0,capped:true});
 });
});

describe('Coinbase lazy history',()=>{
 it('fetches the previous page before the first bar, prepends it on the same source revision and lineage, and alerts see no correction',async()=>{
  const {bridge,provider}=coinbase(fiveMinute(T0-5000*300));
  const handle=provider.open('BTC-USD','5m');await flush();
  const before=handle.dataset(),first=before.bars[0].time;
  expect(before.bars).toHaveLength(300);
  const calls=bridge.fetchCoinbaseCandles.mock.calls.length;
  await expect(handle.loadOlder!()).resolves.toEqual({status:'idle',message:null});
  // A page is LIVE_HISTORY_PAGE_BARS (1000) bars, four 300-candle requests fetched newest first.
  expect(LIVE_HISTORY_PAGE_BARS).toBe(1000);
  expect(bridge.fetchCoinbaseCandles.mock.calls.slice(calls).map(([input])=>[input.start,input.end])).toEqual([[first-300*300,first],[first-600*300,first-300*300],[first-900*300,first-600*300],[first-1000*300,first-900*300]]);
  expect(bridge.fetchCoinbaseCandles.mock.calls.at(-1)![0]).toMatchObject({granularity:'FIVE_MINUTE'});
  const after=handle.dataset();
  expect(after.bars).toHaveLength(1300);expect(after.bars[0].time).toBe(first-1000*300);
  expect(new Set(after.bars.map(b=>b.time)).size).toBe(1300);
  expect(after.bars.every((b,i)=>!i||b.time-after.bars[i-1].time===300)).toBe(true); // no gap at the request seams
  expect(after.bars.slice(1000)).toEqual(before.bars);
  // Same source: revision string, lineage key and chart input identity hold; the snapshot is newer.
  expect(after.provenance.revision).toBe(before.provenance.revision);expect(after.provenance.revision.startsWith('live-v1:')).toBe(true);
  expect(liveLineageOf(after.bars)!.key).toBe(liveLineageOf(before.bars)!.key);
  expect(newerLiveBars(before.bars,after.bars)).toBe(true);expect(sameBarsInput(before.bars,after.bars)).toBe(true);
  expect(barInputIdentity(after.bars)).toBe(barInputIdentity(before.bars));
  expect(after.provenance.coverage).toBe(before.provenance.coverage);
  // Alerts read the subscription from its own first bar: no correction, same history origin, stable view identity.
  expect(liveHistoryCorrected(before.bars,after.bars)).toBe(true); // what an alert observer would see without the view
  const view=liveAlertView(after);
  expect(liveHistoryCorrected(liveAlertView(before).bars,view.bars)).toBe(false);
  expect(view.bars[0].time).toBe(first);expect(view.bars).toEqual(before.bars);
  expect(liveAlertView(after)).toBe(view);expect(liveAlertBars(after.bars)).toBe(view.bars);
  expect(view.provenance.revision).toBe(before.provenance.revision);expect(sameBarsInput(view.bars,after.bars)).toBe(true);
  expect(liveAlertView(before)).toBe(before);
  handle.close();provider.dispose();
 });
 it('one page at a time, spaced, paused after a rate limit, and "No more data" at the start of the provider history',async()=>{
  let now=T0*1000,limited=false;const origin=T0-1450*300;
  const {bridge,provider}=coinbase(input=>limited?{error:'Coinbase denied or limited this public request. No retry was made.'}:fiveMinute(origin)(input),()=>now);
  const handle=provider.open('BTC-USD','5m');await flush();
  const base=bridge.fetchCoinbaseCandles.mock.calls.length;
  const a=handle.loadOlder!(),b=handle.loadOlder!();
  expect(await a).toBe(await b);expect(bridge.fetchCoinbaseCandles.mock.calls.length).toBe(base+4); // one page, four requests
  await handle.loadOlder!();expect(bridge.fetchCoinbaseCandles.mock.calls.length).toBe(base+4); // inside the spacing window
  now+=1000;limited=true;
  await expect(handle.loadOlder!()).resolves.toMatchObject({status:'error'});
  expect(handle.historyState!().message).toMatch(/rate limited/);
  now+=COINBASE_RATE_LIMIT_PAUSE_MS-1;await handle.loadOlder!();expect(bridge.fetchCoinbaseCandles.mock.calls.length).toBe(base+5); // A rate limit waits out the bridge refusal (60 s), not 30 s
  expect(handle.dataset().bars).toHaveLength(1300); // the failed page added nothing (no partial page, no hole)
  now+=1;limited=false;
  await expect(handle.loadOlder!()).resolves.toEqual({status:'idle',message:null}); // the last 150 bars, then empty requests
  expect(handle.dataset().bars[0].time).toBe(origin);expect(handle.dataset().bars).toHaveLength(1451);
  now+=1000;await expect(handle.loadOlder!()).resolves.toEqual({status:'exhausted',message:LIVE_NO_MORE_DATA}); // the page reached the first bucket
  const ended=bridge.fetchCoinbaseCandles.mock.calls.length;
  now+=60_000;await handle.loadOlder!();expect(bridge.fetchCoinbaseCandles.mock.calls.length).toBe(ended);
  expect(handle.historyState!()).toEqual({status:'exhausted',message:'No more data'});
  provider.dispose();
 });
 it('an empty older page ends paging; the bridge earliest time is the provider limit',async()=>{
  const {bridge,provider}=coinbase(input=>input.start<T0-300*300?[]:fiveMinute(0)(input));
  const handle=provider.open('BTC-USD','5m');await flush();
  await expect(handle.loadOlder!()).resolves.toEqual({status:'exhausted',message:LIVE_NO_MORE_DATA});
  expect(handle.dataset().bars).toHaveLength(300);
  provider.dispose();
  const early=COINBASE_EARLIEST_HISTORY+100*300,limit=coinbase(input=>span(Math.max(COINBASE_EARLIEST_HISTORY,Math.ceil(input.start/300)*300),input.end+1,300),()=>(early+299*300)*1000);
  const h=limit.provider.open('BTC-USD','5m');await flush();
  expect(h.dataset().bars[0].time).toBe(early);
  await expect(h.loadOlder!()).resolves.toMatchObject({status:'exhausted'});
  expect(limit.bridge.fetchCoinbaseCandles.mock.calls.at(-1)![0].start).toBe(COINBASE_EARLIEST_HISTORY);
  expect(h.dataset().bars[0].time).toBe(COINBASE_EARLIEST_HISTORY);
  limit.provider.dispose();
 });
 it('a folded interval fetches whole buckets at the backfill size',async()=>{
  const {bridge,provider}=coinbase(input=>input.granularity==='FIFTEEN_MINUTE'?span(Math.ceil(input.start/900)*900,input.end+1,900):[]);
  const handle=provider.open('BTC-USD','30m');await flush();
  const first=handle.dataset().bars[0].time;
  await handle.loadOlder!();
  const call=bridge.fetchCoinbaseCandles.mock.calls.at(-1)![0];
  expect(call.granularity).toBe('FIFTEEN_MINUTE');expect(call.end).toBe(first);
  const bars=handle.dataset().bars;
  expect(bars.every(b=>b.time%1800===0)).toBe(true);expect(bars[0].time).toBeLessThan(first);
  expect(bars.slice(0,bars.findIndex(b=>b.time===first)).every(b=>b.volume===2)).toBe(true); // both 15m halves
  provider.dispose();
 });
 it('registers with the shared history channel while open; imports and closed feeds request nothing',async()=>{
  const {bridge,provider}=coinbase(fiveMinute(0));
  const handle=provider.open('BTC-USD','5m');await flush();
  expect(requestLiveHistory('local:import:abc')).toBe(false);expect(liveHistoryState('local:import:abc')).toBeNull();
  const base=bridge.fetchCoinbaseCandles.mock.calls.length;
  expect(requestLiveHistory(handle.datasetId)).toBe(true);await flush();
  expect(bridge.fetchCoinbaseCandles.mock.calls.length).toBeGreaterThan(base); // the page's first request went out
  await handle.loadOlder!();
  const release=holdLiveHistory(handle.datasetId),again=holdLiveHistory(handle.datasetId);
  expect(requestLiveHistory(handle.datasetId)).toBe(false);release();release();
  expect(requestLiveHistory(handle.datasetId)).toBe(false);again();
  expect(requestLiveHistory(handle.datasetId)).toBe(true);
  handle.close();
  expect(requestLiveHistory(handle.datasetId)).toBe(false);
  provider.dispose();
 });
});

const alStatus=(state:AlpacaStatus['state']):AlpacaStatus=>({schemaVersion:1,state,symbols:['SYNTH'],feed:'iex',attempt:0,lastMessageAt:T0*1000,liveMessages:false,lastError:null,counters:{}});
function alpaca(handler:(input:any)=>{bars:Bar[];nextPageToken?:string}|{error:string}){
 const bridge={
  alpacaKeyStatus:vi.fn(async()=>({ok:true as const,value:{configured:true,keyIdHint:'****',encryption:true}})),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn(),
  fetchAlpacaBars:vi.fn(async(input:any)=>{const page=handler(input);return 'error' in page?{ok:false as const,error:{code:'UPSTREAM',message:page.error}}:{ok:true as const,value:{schemaVersion:1 as const,symbol:input.symbol,timeframe:input.timeframe,seconds:0,feed:input.feed,bars:page.bars,nextPageToken:page.nextPageToken??null,provenance:{provider:'synthetic',kind:'owner-key' as const,feed:input.feed,delaySeconds:0,sourceUrl:'synthetic',retrievedAt:'',bytes:0,license:''}}};}),
  subscribeAlpaca:vi.fn(async()=>({ok:true as const,value:alStatus('ready')})),unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),onAlpacaEvent:vi.fn(()=>()=>{}),
 } satisfies AlpacaBridge;
 return {bridge,provider:new AlpacaLiveProvider(bridge,{now:()=>T0*1000})};
}
describe('Alpaca lazy history',()=>{
 it('fetches one IEX window before the first bar and shows it a page at a time, then "No more data"',async()=>{
  // 15m: a native Alpaca interval (live 1h folds 15-minute bars on New York session buckets).
  const origin=T0-1500*900;
  const {bridge,provider}=alpaca(input=>({bars:span(Math.max(origin,Math.ceil(input.start/900)*900),input.end,900)}));
  const handle=provider.open('SYNTH','15m');await flush();
  const first=handle.dataset().bars[0].time,base=bridge.fetchAlpacaBars.mock.calls.length;
  expect(handle.dataset().bars).toHaveLength(300);
  await handle.loadOlder!();
  expect(bridge.fetchAlpacaBars.mock.calls.length).toBe(base+1);
  // Older history comes from all exchanges (SIP) on the free plan; the window is unchanged.
  expect(bridge.fetchAlpacaBars.mock.calls.at(-1)![0]).toMatchObject({timeframe:'15Min',feed:'sip',start:first-30*86400,end:first,adjustment:'split'});
  expect(handle.dataset().bars).toHaveLength(1300); // Pages of 1000 from the window
  expect(handle.dataset().bars[0].time).toBe(first-1000*900);
  provider.dispose();
 });
 it('never prepends an incomplete window and stops at an empty one',async()=>{
  const {provider}=alpaca(input=>input.end<=T0-299*900?(input.pageToken?{error:'Alpaca limited requests.'}:{bars:span(input.start,input.start+900*10,900),nextPageToken:'p2'}):{bars:span(Math.ceil(input.start/900)*900,input.end,900)});
  const handle=provider.open('SYNTH','15m');await flush();
  await expect(handle.loadOlder!()).resolves.toMatchObject({status:'error'});
  expect(handle.dataset().bars).toHaveLength(300);
  provider.dispose();
  const again=alpaca(input=>input.end<=T0-299*900?{bars:[]}:{bars:span(Math.ceil(input.start/900)*900,input.end,900)});
  const h=again.provider.open('SYNTH','15m');await flush();
  await expect(h.loadOlder!()).resolves.toEqual({status:'exhausted',message:LIVE_NO_MORE_DATA});
  again.provider.dispose();
 });
});

describe('LiveHistoryPager reserve pages and nearHistoryStart',()=>{
 it('Alpaca reserve: later pages come from the fetched window without another request',async()=>{
  const origin=T0-1500*900;let now=T0*1000;
  const bridge=alpaca(input=>({bars:span(Math.max(origin,Math.ceil(input.start/900)*900),input.end,900)}));
  const provider=new AlpacaLiveProvider(bridge.bridge,{now:()=>now});
  const handle=provider.open('SYNTH','15m');await flush();
  const base=bridge.bridge.fetchAlpacaBars.mock.calls.length;
  await handle.loadOlder!();
  expect(handle.dataset().bars).toHaveLength(1300);
  now+=1000;await handle.loadOlder!();
  expect(bridge.bridge.fetchAlpacaBars.mock.calls.length).toBe(base+1);
  expect(handle.dataset().bars).toHaveLength(1500);expect(handle.dataset().bars[0].time).toBe(origin);
  expect(new Set(handle.dataset().bars.map(b=>b.time)).size).toBe(1500);
  now+=1000;await expect(handle.loadOlder!()).resolves.toEqual({status:'exhausted',message:LIVE_NO_MORE_DATA});
  provider.dispose();
 });
 it('the view nears the start within 20 loaded bars; a pager error is reported plainly',async()=>{
  const bars=span(T0,T0+100*60,60);
  expect(nearHistoryStart(T0+20*60,bars)).toBe(true);expect(nearHistoryStart(T0-3600,bars)).toBe(true);
  expect(nearHistoryStart(T0+21*60,bars)).toBe(false);expect(nearHistoryStart(Number.NaN,bars)).toBe(false);expect(nearHistoryStart(T0,[bar(T0)])).toBe(false);
  const pager=new LiveHistoryPager(async()=>{throw new Error('boom');},()=>0);
  await expect(pager.load()).resolves.toEqual({status:'error',message:'Could not load older data. Try again in a moment.'});
 });
 it('non-live datasets pass through the alert view unchanged',()=>{
  const dataset={bars:span(T0,T0+600,60),provenance:{datasetId:'local:x'}} as unknown as BarDataset;
  expect(liveAlertView(dataset)).toBe(dataset);expect(liveAlertBars(dataset.bars)).toBe(dataset.bars);
 });
});
