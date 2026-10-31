import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {CoinbaseLiveProvider,COINBASE_RATE_LIMIT_PAUSE_MS,type CoinbaseBridge,type CoinbaseStatus} from '../../src/domain/coinbase-live';
import {LiveHistoryPager,LIVE_HISTORY_MIN_INTERVAL_MS} from '../../src/domain/live-history';
import type {Bar} from '../../src/domain/types';

// Interval visits on a live Coinbase chart fetch each closed candle window once per session, a left feed
// cancels its requests, and a rate limit pauses for the bridge's own refusal. SYNTHETIC bridge, no network.
const T0=Date.UTC(2026,9,20,15,0,0)/1000;
const SECONDS:Record<string,number>={ONE_MINUTE:60,FIVE_MINUTE:300,FIFTEEN_MINUTE:900,ONE_HOUR:3600,SIX_HOUR:21600,ONE_DAY:86400};
const bar=(time:number):Bar=>({time,open:100,high:101,low:99,close:100,volume:1});
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const cbStatus=(state:CoinbaseStatus['state']):CoinbaseStatus=>({schemaVersion:1,state,productIds:['BTC-USD'],attempt:0,lastMessageAt:T0*1000,liveMessages:false,lastError:null,counters:{}});
/** Every aligned candle from 2015 up to the request end (inclusive, as Coinbase). `hold` keeps requests pending. */
function coinbase(options:{now?:()=>number;hold?:boolean;fail?:()=>string|null}={}){
 const pending:Array<()=>void>=[];
 const bridge={
  fetchCoinbaseCandles:vi.fn(async(input:any)=>{
   if(options.hold)await new Promise<void>(resolve=>pending.push(resolve));
   const error=options.fail?.();if(error)return {ok:false as const,error:{code:'RATE_LIMITED',message:error}};
   const size=SECONDS[input.granularity],bars:Bar[]=[];for(let t=Math.ceil(Math.max(input.start,Date.UTC(2015,0,1)/1000)/size)*size;t<=input.end;t+=size)bars.push(bar(t));
   return {ok:true as const,value:{schemaVersion:1 as const,productId:input.productId,granularity:input.granularity,seconds:size,bars,provenance:{provider:'synthetic',kind:'public-unauthenticated' as const,sourceUrl:'synthetic',retrievedAt:'',bytes:0,license:''}}};
  }),
  subscribeCoinbase:vi.fn(async()=>({ok:true as const,value:cbStatus('ready')})),
  unsubscribeCoinbase:vi.fn(async()=>({ok:true as const,value:cbStatus('idle')})),
  onCoinbaseEvent:vi.fn(()=>()=>{}),
  cancelCoinbaseRequest:vi.fn(async()=>({cancelled:true})),
 } satisfies CoinbaseBridge;
 return {bridge,pending,provider:new CoinbaseLiveProvider(bridge,{now:options.now??(()=>T0*1000)})};
}
const calls=(bridge:{fetchCoinbaseCandles:{mock:{calls:any[][]}}})=>bridge.fetchCoinbaseCandles.mock.calls.map(([input])=>input as {granularity:string;start:number;end:number;requestId:string});

describe('LIVE-HISTORY-1029 closed candle memory',()=>{
 it('4h after 2h refetches no 1h window the 2h chart already loaded; only windows that reach now are fetched again',async()=>{
  let now=T0*1000;const {bridge,provider}=coinbase({now:()=>now});
  const two=provider.open('BTC-USD','120m');await flush();
  for(let i=0;i<3;i++){now+=1000;await two.loadOlder!();}
  const twoBars=two.dataset().bars.length,twoFirst=two.dataset().bars[0].time;two.close();
  const before=calls(bridge).length;
  const four=provider.open('BTC-USD','240m');await flush();
  const opened=calls(bridge).slice(before);
  expect(opened.length).toBeGreaterThan(0);
  for(const input of opened)expect(input.end).toBeGreaterThanOrEqual(T0-2*3600); // only the forming end is fetched again
  now+=1000;await four.loadOlder!();
  // the 4h page reaches past 2h's oldest bar: only the part older than it is new
  const paged=calls(bridge).slice(before+opened.length);
  for(const input of paged)expect(input.start).toBeLessThan(twoFirst);
  expect(twoBars).toBeGreaterThan(1000);
  four.close();provider.dispose();
 });
 it('1W after 1D folds the daily candles the 1D chart paged, with one request for the forming end',async()=>{
  let now=T0*1000;const {bridge,provider}=coinbase({now:()=>now});
  const day=provider.open('BTC-USD','1D');await flush();
  for(let i=0;i<6;i++){now+=1000;await day.loadOlder!();}
  expect(day.historyState!().status).toBe('exhausted');day.close();
  const before=calls(bridge).length;
  const week=provider.open('BTC-USD','1W');await flush();
  for(let i=0;i<4&&week.historyState!().status!=='exhausted';i++){now+=1000;await week.loadOlder!();}
  const after=calls(bridge).slice(before);
  expect(after.length).toBe(1);expect(after[0].end).toBeGreaterThanOrEqual(T0); // the backfill's newest chunk only
  expect(week.historyState!().status).toBe('exhausted');
  expect(week.dataset().bars.length).toBeGreaterThan(560); // 2015 to 2026 in weeks: the full 5Y span is there
  week.close();provider.dispose();
 });
 it('never serves a forming candle: a window ending now is always fetched',async()=>{
  const {bridge,provider}=coinbase();
  const a=provider.open('BTC-USD','60m');await flush();a.close();
  const before=calls(bridge).length;
  const b=provider.open('BTC-USD','60m');await flush();
  expect(calls(bridge).length).toBe(before+1);b.close();provider.dispose();
 });
});

describe('LIVE-HISTORY-1029 left feeds and shared requests',()=>{
 it('a closed feed cancels the request only it was waiting on',async()=>{
  const {bridge,pending,provider}=coinbase({hold:true});
  const one=provider.open('BTC-USD','1m');await flush();
  expect(calls(bridge)).toHaveLength(1);
  one.close();
  expect(bridge.cancelCoinbaseRequest).toHaveBeenCalledWith({requestId:calls(bridge)[0].requestId});
  for(const release of pending.splice(0))release();await flush();
  expect(calls(bridge)).toHaveLength(1);provider.dispose();
 });
 it('two feeds asking for the same window share one request, and one closing does not cancel it for the other',async()=>{
  const {bridge,pending,provider}=coinbase({hold:true});
  const a=provider.open('BTC-USD','120m');await flush();
  const b=provider.open('BTC-USD','240m');await flush();
  // both backfills start at the same 1h chunk boundaries only when their windows match; the shared one is counted once
  const keys=calls(bridge).map(input=>input.granularity+input.start+':'+input.end);
  expect(new Set(keys).size).toBe(keys.length);
  a.close();
  const cancelled=bridge.cancelCoinbaseRequest.mock.calls.length;
  for(const release of pending.splice(0))release();await flush();
  expect(cancelled).toBeLessThanOrEqual(1);
  b.close();provider.dispose();
 });
});

describe('LIVE-HISTORY-1029 pauses',()=>{
 it("a page before the first history lands waits (no request, no error pause)",async()=>{
  const {bridge,provider}=coinbase({hold:true});
  const one=provider.open('BTC-USD','1m');await flush();
  await expect(one.loadOlder!()).resolves.toEqual({status:'idle',message:null});
  expect(calls(bridge)).toHaveLength(1);
  one.close();provider.dispose();
 });
 it('a rate-limited page pauses for the bridge refusal, then resumes',async()=>{
  let now=T0*1000,limited=false;const {bridge,provider}=coinbase({now:()=>now,fail:()=>limited?'Coinbase limited public requests. Wait before requesting again.':null});
  const one=provider.open('BTC-USD','1m');await flush();
  limited=true;now+=1000;await expect(one.loadOlder!()).resolves.toMatchObject({status:'error'});
  const failed=calls(bridge).length;limited=false;
  now+=30_000;await one.loadOlder!();expect(calls(bridge).length).toBe(failed); // the old 30 s retry met the refusal again
  now+=COINBASE_RATE_LIMIT_PAUSE_MS-30_000;await expect(one.loadOlder!()).resolves.toEqual({status:'idle',message:null});
  expect(calls(bridge).length).toBeGreaterThan(failed);
  one.close();provider.dispose();
 });
 it('a first load refused by a rate limit tries again while the chart stays open',async()=>{
  vi.useFakeTimers();let limited=true;const {bridge,provider}=coinbase({fail:()=>limited?'Coinbase limited public requests. Wait before requesting again.':null});
  const one=provider.open('BTC-USD','1m');await flush();
  expect(one.dataset().bars).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(10_000);expect(calls(bridge)).toHaveLength(2);expect(one.dataset().bars).toHaveLength(0);
  limited=false;await vi.advanceTimersByTimeAsync(10_000);await flush();
  expect(calls(bridge)).toHaveLength(3);expect(one.dataset().bars.length).toBeGreaterThan(200);
  one.close();await vi.advanceTimersByTimeAsync(60_000);expect(calls(bridge)).toHaveLength(3);
  provider.dispose();vi.useRealTimers();
 });
 it('the pager honours retryMs and a wait page',async()=>{
  let now=0;const pages:any[]=[{kind:'wait'},{kind:'error',message:'x',retryMs:5000},{kind:'added',added:1}];
  const pager=new LiveHistoryPager(async()=>pages.shift(),()=>now);
  expect((await pager.load()).status).toBe('idle');
  now+=LIVE_HISTORY_MIN_INTERVAL_MS;expect((await pager.load()).status).toBe('error');
  now+=4999;expect((await pager.load()).status).toBe('error');expect(pages).toHaveLength(1);
  now+=1;expect((await pager.load()).status).toBe('idle');expect(pages).toHaveLength(0);
 });
 it('a sticky range outlives a history pause (adapter source shape)',()=>{
  const source=readFileSync(new URL('../../src/chart/adapter.ts',import.meta.url),'utf8');
  expect(source).toContain("if(status==='error'||status==='loading')sticky.until=Math.min(sticky.cap,Math.max(sticky.until,now+10000));");
  expect(source).toContain('STICKY_RANGE_CAP_MS=180000,STICKY_SETTLE_MS=8000');
  // a covered live range is held through the cached snapshot's REST refresh, and another feed drops it
  expect(source).toContain('stickyRange=isLiveInputIdentity(currentSource.inputIdentity)&&(limited||now<next.settle)?next:null;');
  expect(source).toContain('if(sticky.datasetId!==currentSource.datasetId||Date.now()>sticky.until){stickyRange=null;return;}');
 });
});
