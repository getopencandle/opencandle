import {afterEach,describe,expect,it,vi} from 'vitest';
import {AlpacaLiveProvider,alpacaStatusLabel,preferAlpacaDataPlan,preferAlpacaDividendAdjustment,selectAlpacaSyntheticStub,type AlpacaBridge,type AlpacaEvent,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {LIVE_CACHED_NOTE,cacheOverlapMatches,closedBarsForCache,mergeCachedHistory,type BarCacheBridge,type BarCacheKey,type BarCacheRecord} from '../../src/domain/live-cache';
import {liveStatusLabel} from '../../src/domain/live-provider';
import {newYorkWallTime} from '../../src/domain/us-market-hours';
import type {Bar} from '../../src/domain/types';

// A launch shows cached closed bars at once and fetches only the gap plus an overlap.
// SYNTHETIC bridge and tape only: no key, no network, no file system (the cache is an in-memory stand-in for main).
const DATE='2026-10-21',ET=(h:number,m=0,date=DATE)=>newYorkWallTime(date,h*60+m);
const price=(t:number,scale=1)=>(100+((t/60)%17)/10)*scale;
function tape(start:number,end:number,feed:string,step:number,scale=1):Bar[]{
 const out:Bar[]=[];
 for(let t=Math.ceil(start/step)*step;t<=end;t+=step){
  if(feed==='iex'&&step===60&&(t/60)%2!==0)continue;
  const p=price(t,scale);out.push({time:t,open:p,high:p+0.5,low:p-0.5,close:p,volume:feed==='sip'?1000*step/60:30*step/60});
 }
 return out;
}
const status=(state:AlpacaStatus['state'],feed:'iex'|'sip'='iex'):AlpacaStatus=>({schemaVersion:1,state,symbols:['GME'],feed,attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{}} as AlpacaStatus);
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const STEP:Record<string,number>={'1Min':60,'5Min':300,'15Min':900,'1Hour':3600,'1Day':86400};
const keyText=(key:BarCacheKey)=>JSON.stringify([key.provider,key.symbol,key.interval,key.feed,key.adjustment,key.plan]);

/** A SYNTHETIC Alpaca bridge plus an in-memory cache with main's key semantics. `gate` holds every bars request until released. */
function harness(nowS:()=>number,options:{scale?:()=>number;fail?:()=>string|null}={}){
 let listener:((event:AlpacaEvent)=>void)|null=null;let release:(()=>void)|null=null;let gate:Promise<void>|null=null;
 const store=new Map<string,BarCacheRecord>();
 const bridge={
  alpacaKeyStatus:vi.fn(),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn(),
  fetchAlpacaBars:vi.fn(async(input:any)=>{
   if(gate)await gate;
   if(input.feed==='sip'&&input.plan!=='paid'&&input.end>nowS()-900)throw new Error('SIP request past the free-plan delay');
   const failure=options.fail?.();if(failure)return {ok:false as const,error:{code:'UNAVAILABLE',message:failure}};
   const step=STEP[input.timeframe];
   return {ok:true as const,value:{schemaVersion:1 as const,symbol:input.symbol,timeframe:input.timeframe,seconds:step,feed:input.feed,bars:tape(input.start,input.end,input.feed,step,options.scale?.()??1),nextPageToken:null,provenance:{provider:'synthetic',kind:'owner-key' as const,feed:input.feed,delaySeconds:0,sourceUrl:'synthetic',retrievedAt:'',bytes:0,license:''}}};
  }),
  subscribeAlpaca:vi.fn(async(input:any)=>({ok:true as const,value:status('ready',input.feed??'iex')})),unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),
  onAlpacaEvent:vi.fn((handler:(event:AlpacaEvent)=>void)=>{listener=handler;return()=>{listener=null;};}),
  readBarCache:vi.fn(async({key}:{key:BarCacheKey})=>({ok:true as const,value:store.get(keyText(key))??null})),
  writeBarCache:vi.fn(async({key,bars}:{key:BarCacheKey;bars:Bar[]})=>{store.set(keyText(key),{schemaVersion:1,key,savedAt:'synthetic',synthetic:key.provider==='alpaca-stub',bars:bars.map(bar=>({...bar}))});return {ok:true as const,value:{schemaVersion:1 as const,bytes:1,entries:store.size,maxBytes:1}};}),
  discardBarCache:vi.fn(async({provider,symbol}:{provider:string;symbol:string})=>{let removed=0;for(const [name,record] of [...store])if(record.key.provider===provider&&record.key.symbol===symbol){store.delete(name);removed++;}return {ok:true as const,value:{removed}};}),
 } satisfies AlpacaBridge&BarCacheBridge;
 return {bridge,store,emit:(event:AlpacaEvent)=>listener?.(event),hold:()=>{gate=new Promise(resolve=>{release=()=>{gate=null;resolve();};});},release:()=>release?.()};
}
const calls=(b:{fetchAlpacaBars:{mock:{calls:any[][]}}})=>b.fetchAlpacaBars.mock.calls.map(([call])=>call);
const KEY:BarCacheKey={provider:'alpaca-iex',symbol:'GME',interval:'5m',feed:'sip',adjustment:'split',plan:'free'};
const ascending=(bars:Bar[])=>bars.every((bar,i)=>!i||bar.time>bars[i-1].time);
afterEach(()=>{preferAlpacaDataPlan('free');preferAlpacaDividendAdjustment(false);selectAlpacaSyntheticStub(false);});

/** Day one: a 5m chart backfills from the network and writes its closed all-exchange bars to the cache. */
async function seedDayOne(h:ReturnType<typeof harness>,now:number){
 const provider=new AlpacaLiveProvider(h.bridge,{now:()=>now*1000});
 const handle=provider.open('GME','5m');await flush();await provider.flushBarCache();
 handle.close();provider.dispose();await flush();
}

describe('miss: backfill as before, then cache only closed all-exchange bars',()=>{
 it('a miss reads the key, backfills the whole window, and writes closed SIP bars only (no forming bar, no IEX tail)',async()=>{
  const now=ET(11),h=harness(()=>now),provider=new AlpacaLiveProvider(h.bridge,{now:()=>now*1000});
  const handle=provider.open('GME','5m');await flush();
  expect(h.bridge.readBarCache).toHaveBeenCalledWith({key:KEY});
  const [sip,iex]=calls(h.bridge);
  expect(sip).toMatchObject({feed:'sip',start:now-14*86400,end:now-900});expect(iex).toMatchObject({feed:'iex',start:ET(10,40)+1});
  expect(handle.dataset().provenance.notes).not.toContain(LIVE_CACHED_NOTE);
  await provider.flushBarCache();
  expect(h.bridge.writeBarCache).toHaveBeenCalledTimes(1);
  const [{key,bars}]=h.bridge.writeBarCache.mock.calls[0];
  expect(key).toEqual(KEY);
  // Closed by the 10:45 all-exchange cut: the last cached 5m bar starts 10:40. The IEX bars after it and the forming bar are not cached.
  expect(bars.at(-1)!.time).toBe(ET(10,40));expect(bars.every(bar=>bar.volume===5000)).toBe(true);
  expect(handle.dataset().bars.at(-1)!.time).toBe(now);
  expect(ascending(bars)).toBe(true);
  handle.close();provider.dispose();
 });
 it('without cache calls on the bridge (tests, older bridges) nothing is read or written and behaviour is unchanged',async()=>{
  const now=ET(11),h=harness(()=>now),{readBarCache:_r,writeBarCache:_w,discardBarCache:_d,...plain}=h.bridge;
  const provider=new AlpacaLiveProvider(plain as AlpacaBridge,{now:()=>now*1000});
  const handle=provider.open('GME','5m');await flush();await provider.flushBarCache();
  expect(calls(h.bridge)).toHaveLength(2);expect(h.bridge.readBarCache).not.toHaveBeenCalled();expect(h.bridge.writeBarCache).not.toHaveBeenCalled();
  expect(handle.dataset().bars.length).toBeGreaterThan(200);
  handle.close();provider.dispose();
 });
});

describe('hit: cached bars at once, then the gap plus an overlap',()=>{
 it('shows cached bars labelled Cached before any network answer; fetches only from the overlap start; merges with no duplicate or gap',async()=>{
  const h=harness(()=>now);let now=ET(11);
  await seedDayOne(h,now);
  const cached=h.store.get(keyText(KEY))!.bars;
  // Mark the cached bars older than the overlap, so the merge provably keeps them instead of downloading them again.
  h.store.get(keyText(KEY))!.bars=cached.map((bar,i)=>i<cached.length-5?{...bar,volume:4999}:bar);
  now=ET(11,30);h.bridge.fetchAlpacaBars.mockClear();h.hold();
  const provider=new AlpacaLiveProvider(h.bridge,{now:()=>now*1000});
  const handle=provider.open('GME','5m');await flush();
  const shown=handle.dataset();
  expect(calls(h.bridge)).toHaveLength(1);                         // the request is held: nothing has arrived yet
  expect(shown.bars.at(-1)!.time).toBe(ET(10,40));expect(shown.bars.length).toBe(Math.min(300,cached.length));
  expect(shown.provenance.notes[0]).toBe(LIVE_CACHED_NOTE);
  expect(shown.provenance.state).toBe('loading');                   // never 'ready': paper tickets and alerts wait
  expect(alpacaStatusLabel(shown.provenance,ET(11,30)*1000)).toBe('Cached');expect(liveStatusLabel(shown.provenance)).toBe('Cached');
  const cachedRevision=shown.provenance.revision;
  h.release();await flush();
  const [sip,iex]=calls(h.bridge);
  // Gap fill: from the oldest of the last five cached bars (10:20), not the 14-day window start.
  expect(sip).toMatchObject({feed:'sip',timeframe:'5Min',start:ET(10,20),end:now-900});
  expect(iex).toMatchObject({feed:'iex',start:ET(11,10)+1,end:now});
  const fresh=handle.dataset();
  expect(fresh.provenance.notes).not.toContain(LIVE_CACHED_NOTE);expect(fresh.provenance.state).toBe('ready');
  expect(fresh.provenance.revision).not.toBe(cachedRevision);       // the refreshed series is a new source for alerts
  expect(ascending(fresh.bars)).toBe(true);
  const times=fresh.bars.map(bar=>bar.time);
  for(let t=ET(10,40);t<=now;t+=300)expect(times,String(t)).toContain(t);
  expect(fresh.bars.filter(bar=>bar.time<ET(10,20)).every(bar=>bar.volume===4999)).toBe(true);
  expect(fresh.bars.filter(bar=>bar.time>=ET(10,20)&&bar.time<=ET(11,10)).every(bar=>bar.volume===5000)).toBe(true);
  await provider.flushBarCache();
  const written=h.store.get(keyText(KEY))!.bars;
  expect(written.at(-1)!.time).toBe(ET(11,10));expect(written.length).toBeGreaterThan(cached.length);
  handle.close();provider.dispose();
 });
 it('older cached bars serve history paging without a download',async()=>{
  const h=harness(()=>now);let now=ET(11);
  await seedDayOne(h,now);
  const record=h.store.get(keyText(KEY))!;
  // A cache that holds 120 more (older) bars than the chart shows, as after paging back yesterday.
  record.bars=[...tape(record.bars[0].time-120*300,record.bars[0].time-1,'sip',300),...record.bars];
  now=ET(11,30);
  const provider=new AlpacaLiveProvider(h.bridge,{now:()=>now*1000});
  const handle=provider.open('GME','5m');await flush();
  const before=calls(h.bridge).length,first=handle.dataset().bars[0].time;
  const state=await handle.loadOlder!();await flush();
  expect(calls(h.bridge).length).toBe(before);
  expect(state.message).toBeNull();expect(state.status).not.toBe('error');
  const paged=handle.dataset().bars;
  expect(paged[0].time).toBeLessThan(first);expect(paged.length).toBeGreaterThan(300);expect(ascending(paged)).toBe(true);
  handle.close();provider.dispose();
 });
 it('a refresh that fails (offline) keeps the cached bars on screen, still labelled Cached, with the reason',async()=>{
  let offline=false;const h=harness(()=>now,{fail:()=>offline?'Alpaca is unreachable.':null});let now=ET(11);
  await seedDayOne(h,now);
  now=ET(11,30);offline=true;
  const provider=new AlpacaLiveProvider(h.bridge,{now:()=>now*1000});
  const handle=provider.open('GME','5m');await flush();
  const data=handle.dataset();
  expect(data.bars.at(-1)!.time).toBe(ET(10,40));expect(data.bars.length).toBeGreaterThan(200);
  expect(data.provenance.notes).toContain(LIVE_CACHED_NOTE);expect(data.provenance.notes.join(' ')).toContain('Alpaca is unreachable.');
  expect(alpacaStatusLabel(data.provenance,now*1000)).toBe('Cached');
  await provider.flushBarCache();
  expect(h.bridge.writeBarCache).toHaveBeenCalledTimes(1);           // only day one wrote; cached bars are never re-written as fresh
  handle.close();provider.dispose();
 });
 it('a cache older than the backfill window is a miss: the whole window is fetched',async()=>{
  const h=harness(()=>now);let now=ET(11);
  await seedDayOne(h,now);
  now=ET(11,0,'2026-11-20');h.bridge.fetchAlpacaBars.mockClear();
  const provider=new AlpacaLiveProvider(h.bridge,{now:()=>now*1000});
  const handle=provider.open('GME','5m');await flush();
  expect(calls(h.bridge)[0]).toMatchObject({feed:'sip',start:now-14*86400});
  expect(handle.dataset().provenance.notes).not.toContain(LIVE_CACHED_NOTE);
  handle.close();provider.dispose();
 });
});

describe('validity: overlap mismatch, basis and corruption',()=>{
 it('an overlap bar that differs (a 4:1 split re-adjusted history) discards the symbol cache and reloads the whole window',async()=>{
  let scale=1;const h=harness(()=>now,{scale:()=>scale});let now=ET(11);
  await seedDayOne(h,now);
  h.store.set(keyText({...KEY,interval:'1D'}),{...h.store.get(keyText(KEY))!,key:{...KEY,interval:'1D'}});
  now=ET(11,30);scale=0.25;h.bridge.fetchAlpacaBars.mockClear();
  const provider=new AlpacaLiveProvider(h.bridge,{now:()=>now*1000});
  const handle=provider.open('GME','5m');await flush();
  expect(h.bridge.discardBarCache).toHaveBeenCalledWith({provider:'alpaca-iex',symbol:'GME'});
  const requests=calls(h.bridge);
  expect(requests[0]).toMatchObject({feed:'sip',start:ET(10,20)});          // the gap fill that found the mismatch
  expect(requests.some(call=>call.feed==='sip'&&call.start===now-14*86400)).toBe(true); // then the whole window
  const data=handle.dataset();
  expect(data.provenance.notes).not.toContain(LIVE_CACHED_NOTE);
  // Every bar is on the new basis: nothing from the old cache was stitched in.
  for(const bar of data.bars)expect(bar.open,String(bar.time)).toBeCloseTo(price(bar.time,0.25),9);
  expect(h.store.has(keyText({...KEY,interval:'1D'}))).toBe(false);          // every record of the symbol went
  await provider.flushBarCache();
  expect(h.store.get(keyText(KEY))!.bars.every(bar=>Math.abs(bar.open-price(bar.time,0.25))<1e-9)).toBe(true);
  handle.close();provider.dispose();
 });
 it('the adjustment and data plan are part of the key: dividends and the paid plan never read split-only free bars',async()=>{
  const h=harness(()=>now);const now=ET(11);
  await seedDayOne(h,now);
  preferAlpacaDividendAdjustment(true);
  let provider=new AlpacaLiveProvider(h.bridge,{now:()=>now*1000});let handle=provider.open('GME','5m');await flush();
  expect(h.bridge.readBarCache).toHaveBeenLastCalledWith({key:{...KEY,adjustment:'split,dividend'}});
  expect(handle.dataset().provenance.notes).not.toContain(LIVE_CACHED_NOTE);
  await provider.flushBarCache();expect(h.store.has(keyText({...KEY,adjustment:'split,dividend'}))).toBe(true);
  handle.close();provider.dispose();preferAlpacaDividendAdjustment(false);
  preferAlpacaDataPlan('paid');
  provider=new AlpacaLiveProvider(h.bridge,{now:()=>now*1000});handle=provider.open('GME','5m');await flush();
  expect(h.bridge.readBarCache).toHaveBeenLastCalledWith({key:{...KEY,plan:'paid'}});
  await provider.flushBarCache();
  const paid=h.store.get(keyText({...KEY,plan:'paid'}))!.bars;
  expect(paid.at(-1)!.time).toBeLessThan(now);                               // the forming bar is never cached
  expect(paid.every(bar=>bar.volume===5000)).toBe(true);
  handle.close();provider.dispose();
 });
 it('a seam check that finds a new basis while paging reloads and discards the symbol cache',async()=>{
  let scale=1;const h=harness(()=>now,{scale:()=>scale});const now=ET(11);
  const provider=new AlpacaLiveProvider(h.bridge,{now:()=>now*1000});
  const handle=provider.open('GME','5m');await flush();
  scale=0.25;await handle.loadOlder!();await flush();
  expect(h.bridge.discardBarCache).toHaveBeenCalledWith({provider:'alpaca-iex',symbol:'GME'});
  handle.close();provider.dispose();
 });
 it('an unreadable, invalid or foreign record is a miss',async()=>{
  const now=ET(11);
  for(const answer of [
   {ok:false,error:{code:'OPERATION_FAILED',message:'Local operation failed.'}},
   {ok:true,value:{schemaVersion:1,key:KEY,savedAt:'x',synthetic:false,bars:[{time:'x'}]}},
   {ok:true,value:{schemaVersion:1,key:{...KEY,symbol:'SPY'},savedAt:'x',synthetic:false,bars:tape(ET(9),ET(10),'sip',300)}},
   {ok:true,value:{schemaVersion:1,key:KEY,savedAt:'x',synthetic:true,bars:tape(ET(9),ET(10),'sip',300)}},
   'throw',
  ]){
   const h=harness(()=>now);
   h.bridge.readBarCache.mockImplementation((async()=>{if(answer==='throw')throw new Error('IPC closed');return answer;}) as any);
   const provider=new AlpacaLiveProvider(h.bridge,{now:()=>now*1000});
   const handle=provider.open('GME','5m');await flush();
   expect(calls(h.bridge)[0],JSON.stringify(answer)).toMatchObject({feed:'sip',start:now-14*86400});
   expect(handle.dataset().provenance.notes).not.toContain(LIVE_CACHED_NOTE);
   handle.close();provider.dispose();
  }
 });
});

describe('stub isolation and the IEX tail',()=>{
 it('a SYNTHETIC stub run reads and writes only the alpaca-stub namespace, flagged synthetic',async()=>{
  selectAlpacaSyntheticStub(true);
  const now=ET(11),h=harness(()=>now),provider=new AlpacaLiveProvider(h.bridge,{now:()=>now*1000});
  const handle=provider.open('GME','5m');await flush();await provider.flushBarCache();
  const stubKey={...KEY,provider:'alpaca-stub'};
  expect(h.bridge.readBarCache).toHaveBeenCalledWith({key:stubKey});
  expect(h.bridge.writeBarCache.mock.calls.map(([call])=>call.key)).toEqual([stubKey]);
  expect([...h.store.values()].every(record=>record.key.provider==='alpaca-stub'&&record.synthetic)).toBe(true);
  handle.close();provider.dispose();
 });
 it('the IEX tail re-read moves the cached boundary forward; IEX bars newer than it are still never cached',async()=>{
  let now=ET(11);const h=harness(()=>now),provider=new AlpacaLiveProvider(h.bridge,{now:()=>now*1000});
  const handle=provider.open('GME','1m');await flush();await provider.flushBarCache();
  const key={...KEY,interval:'1m'};
  expect(h.store.get(keyText(key))!.bars.at(-1)!.time).toBe(ET(10,44));
  now=ET(11,6);
  h.emit({schemaVersion:1,kind:'batch',bars:[{symbol:'GME',kind:'minute',seconds:60,time:ET(11,6),open:101,high:101,low:101,close:101,volume:5}],trades:[],receivedAt:''});
  await flush();await provider.flushBarCache();
  const bars=h.store.get(keyText(key))!.bars;
  expect(bars.at(-1)!.time).toBe(ET(10,50));expect(bars.every(bar=>bar.volume===1000)).toBe(true);
  expect(handle.dataset().bars.some(bar=>bar.time>ET(10,50)&&bar.volume===30)).toBe(true);  // IEX tail on screen, not cached
  handle.close();provider.dispose();
 });
 it('pure rules: closed bars stop before the forming bar and the boundary; overlap and merge',()=>{
  const bars=tape(ET(10),ET(10,30),'sip',300);
  expect(closedBarsForCache(bars,ET(10,30),t=>t+300).map(bar=>bar.time)).toEqual([0,5,10,15,20,25].map(m=>ET(10,m)));
  expect(closedBarsForCache(bars,ET(10,15),t=>t+300).map(bar=>bar.time)).toEqual([0,5,10].map(m=>ET(10,m)));
  expect(closedBarsForCache(bars,ET(11),t=>t+300,[ET(10,25)]).map(bar=>bar.time)).not.toContain(ET(10,25));
  expect(cacheOverlapMatches(bars,bars,ET(10,20))).toBe(true);
  expect(cacheOverlapMatches(bars,bars.map(bar=>bar.time===ET(10,25)?{...bar,volume:bar.volume+1}:bar),ET(10,20))).toBe(false);
  expect(cacheOverlapMatches(bars,bars.filter(bar=>bar.time!==ET(10,25)),ET(10,20))).toBe(false);
  expect(mergeCachedHistory(bars.slice(0,5),bars.slice(3),ET(10,15)).map(bar=>bar.time)).toEqual(bars.map(bar=>bar.time));
 });
});
