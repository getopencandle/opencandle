import {describe,expect,it,vi} from 'vitest';
import {CoinbaseLiveProvider,coinbaseCacheKey,type CoinbaseBridge,type CoinbaseEvent,type CoinbaseStatus} from '../../src/domain/coinbase-live';
import {LIVE_CACHED_NOTE,type BarCacheBridge,type BarCacheKey,type BarCacheRecord} from '../../src/domain/live-cache';
import {liveStatusLabel} from '../../src/domain/live-provider';
import type {Bar} from '../../src/domain/types';

// (follow-up): Coinbase feeds use the local bar cache with the Alpaca rules: closed bars only
// a keyed namespace, a launch shows cached bars at once and fetches only the gap plus an overlap; a changed overlap bar
// discards the product's cache and reloads the window. SYNTHETIC bridge and in-memory cache only: no network, no files.
const T0=Date.UTC(2026,9,21,12,0,0)/1000;
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const SIZES:Record<string,number>={ONE_MINUTE:60,FIVE_MINUTE:300,FIFTEEN_MINUTE:900,ONE_HOUR:3600,SIX_HOUR:21600,ONE_DAY:86400};
const px=(t:number,scale:number)=>(60000+((t/60)%23))*scale;
const keyText=(key:BarCacheKey)=>JSON.stringify([key.provider,key.symbol,key.interval,key.feed,key.adjustment,key.plan]);
const status=(state:CoinbaseStatus['state']):CoinbaseStatus=>({schemaVersion:1,state,productIds:['BTC-USD'],attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{}} as CoinbaseStatus);
function harness(options:{scale?:()=>number;fail?:()=>boolean;cache?:boolean}={}){
 let listener:((event:CoinbaseEvent)=>void)|null=null;
 const store=new Map<string,BarCacheRecord>();
 const bridge:any={
  fetchCoinbaseCandles:vi.fn(async(input:any)=>{
   if(options.fail?.())return {ok:false as const,error:{code:'UNAVAILABLE',message:'offline (synthetic)'}};
   const size=SIZES[input.granularity],bars:Bar[]=[];
   // Like the public REST candles: the bucket that contains `end` is included (it is still forming).
   for(let t=Math.ceil(input.start/size)*size;t<=input.end;t+=size){const p=px(t,options.scale?.()??1);bars.push({time:t,open:p,high:p+5,low:p-5,close:p+1,volume:2});}
   return {ok:true as const,value:{schemaVersion:1 as const,productId:input.productId,granularity:input.granularity,seconds:size,bars,provenance:{provider:'synthetic',kind:'public-unauthenticated' as const,sourceUrl:'synthetic',retrievedAt:'',bytes:0,license:''}}};
  }),
  subscribeCoinbase:vi.fn(async()=>({ok:true as const,value:status('ready')})),unsubscribeCoinbase:vi.fn(async()=>({ok:true as const,value:status('idle')})),
  onCoinbaseEvent:vi.fn((handler:(event:CoinbaseEvent)=>void)=>{listener=handler;return()=>{listener=null;};}),
 };
 if(options.cache!==false)Object.assign(bridge,{
  readBarCache:vi.fn(async({key}:{key:BarCacheKey})=>({ok:true as const,value:store.get(keyText(key))??null})),
  writeBarCache:vi.fn(async({key,bars}:{key:BarCacheKey;bars:Bar[]})=>{store.set(keyText(key),{schemaVersion:1,key,savedAt:'synthetic',synthetic:false,bars:bars.map(bar=>({...bar}))});return {ok:true as const,value:{schemaVersion:1 as const,bytes:1,entries:store.size,maxBytes:1}};}),
  discardBarCache:vi.fn(async({provider,symbol}:{provider:string;symbol:string})=>{let removed=0;for(const [name,record] of [...store])if(record.key.provider===provider&&record.key.symbol===symbol){store.delete(name);removed++;}return {ok:true as const,value:{removed}};}),
 } satisfies BarCacheBridge);
 return {bridge:bridge as CoinbaseBridge&BarCacheBridge,raw:bridge,store,emit:(event:CoinbaseEvent)=>listener?.(event)};
}
const KEY:BarCacheKey={provider:'coinbase-public',symbol:'BTC-USD',interval:'5m',feed:'spot',adjustment:'raw',plan:'public'};
const requests=(h:ReturnType<typeof harness>)=>h.raw.fetchCoinbaseCandles.mock.calls.map(([call]:any[])=>call);
async function seed(h:ReturnType<typeof harness>,now:number,resolution='5m'){
 const provider=new CoinbaseLiveProvider(h.bridge,{now:()=>now*1000});
 const handle=provider.open('BTC-USD',resolution);await flush();await provider.flushBarCache();handle.close();provider.dispose();await flush();
}

describe('Coinbase cache key and miss',()=>{
 it('the key is the coinbase-public namespace, product, interval, spot feed, raw prices and the public plan',()=>{
  expect(coinbaseCacheKey('BTC-USD','5m')).toEqual(KEY);
 });
 it('a miss backfills as before and writes closed bars only: never the forming bucket',async()=>{
  const now=T0+130,h=harness(),provider=new CoinbaseLiveProvider(h.bridge,{now:()=>now*1000});
  const handle=provider.open('BTC-USD','5m');await flush();
  expect(h.raw.readBarCache).toHaveBeenCalledWith({key:KEY});
  expect(handle.dataset().bars.at(-1)!.time).toBe(T0);
  await provider.flushBarCache();
  const record=h.store.get(keyText(KEY))!;
  expect(record.bars.length).toBe(299);expect(record.bars.at(-1)!.time).toBe(T0-300);
  expect(record.bars.every(bar=>bar.time+300<=now)).toBe(true);
  handle.close();provider.dispose();
 });
 it('a bridge without cache calls behaves exactly as before',async()=>{
  const h=harness({cache:false}),provider=new CoinbaseLiveProvider(h.bridge,{now:()=>(T0+130)*1000});
  const handle=provider.open('BTC-USD','5m');await flush();
  expect(handle.dataset().bars).toHaveLength(300);expect(requests(h)).toHaveLength(1);
  await provider.flushBarCache();handle.close();provider.dispose();
 });
});

describe('Coinbase cache hit',()=>{
 it('shows cached bars at once, labelled Cached and not ready, then fetches only from the overlap start and merges',async()=>{
  const h=harness();await seed(h,T0+130);
  const later=T0+3600+130;h.raw.fetchCoinbaseCandles.mockClear();
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const original=h.raw.fetchCoinbaseCandles.getMockImplementation();
  h.raw.fetchCoinbaseCandles.mockImplementation(async(input:any)=>{await gate;return original(input);});
  const provider=new CoinbaseLiveProvider(h.bridge,{now:()=>later*1000}),handle=provider.open('BTC-USD','5m');await flush();
  const shown=handle.dataset();
  expect(shown.provenance.notes).toContain(LIVE_CACHED_NOTE);expect(liveStatusLabel(shown.provenance)).toBe('Cached');expect(shown.provenance.state).toBe('loading');
  expect(shown.bars.at(-1)!.time).toBe(T0-300);
  const call=requests(h)[0];expect(call.start).toBe(T0-300*5);expect(call.granularity).toBe('FIVE_MINUTE');
  release();await flush();
  const fresh=handle.dataset();
  expect(fresh.provenance.notes).not.toContain(LIVE_CACHED_NOTE);
  expect(fresh.bars.at(-1)!.time).toBe(T0+3600);
  expect(fresh.bars.every((bar,i)=>!i||bar.time-fresh.bars[i-1].time===300)).toBe(true);
  expect(fresh.bars[0].time).toBe(shown.bars[0].time);
  expect(fresh.provenance.revision).not.toBe(shown.provenance.revision);
  handle.close();provider.dispose();
 });
 it('a changed overlap bar discards every record of the product and reloads the whole window',async()=>{
  let scale=1;const h=harness({scale:()=>scale});await seed(h,T0+130);await seed(h,T0+130,'15m');
  expect(h.store.size).toBe(2);
  scale=1.01;h.raw.fetchCoinbaseCandles.mockClear();
  const later=T0+600+130,provider=new CoinbaseLiveProvider(h.bridge,{now:()=>later*1000}),handle=provider.open('BTC-USD','5m');await flush();
  expect(h.raw.discardBarCache).toHaveBeenCalledWith({provider:'coinbase-public',symbol:'BTC-USD'});
  const bars=handle.dataset().bars;
  expect(bars).toHaveLength(300);expect(bars[0].open).toBeCloseTo(px(bars[0].time,1.01),6);
  expect(handle.dataset().provenance.notes).not.toContain(LIVE_CACHED_NOTE);
  expect(requests(h).at(-1).start).toBe(T0+600-299*300);
  handle.close();provider.dispose();
 });
 it('an offline refresh keeps the cached bars on screen, still labelled Cached, and writes nothing over them',async()=>{
  let offline=false;const h=harness({fail:()=>offline});await seed(h,T0+130);
  const before=JSON.stringify(h.store.get(keyText(KEY)));offline=true;h.raw.writeBarCache.mockClear();
  const provider=new CoinbaseLiveProvider(h.bridge,{now:()=>(T0+900)*1000}),handle=provider.open('BTC-USD','5m');await flush();
  expect(handle.dataset().bars.length).toBe(299);expect(handle.dataset().provenance.notes).toContain(LIVE_CACHED_NOTE);
  await provider.flushBarCache();expect(h.raw.writeBarCache).not.toHaveBeenCalled();expect(JSON.stringify(h.store.get(keyText(KEY)))).toBe(before);
  handle.close();provider.dispose();
 });
 it('a record older than the backfill window, a foreign key or a synthetic record is a miss',async()=>{
  const h=harness();await seed(h,T0+130);
  const record=h.store.get(keyText(KEY))!;
  for(const variant of [{...record,synthetic:true},{...record,key:{...KEY,symbol:'ETH-USD'}}]){
   h.store.set(keyText(KEY),variant as BarCacheRecord);h.raw.fetchCoinbaseCandles.mockClear();
   const provider=new CoinbaseLiveProvider(h.bridge,{now:()=>(T0+430)*1000}),handle=provider.open('BTC-USD','5m');await flush();
   expect(requests(h)[0].start).toBe(T0+300-299*300);handle.close();provider.dispose();await flush();
  }
  h.store.set(keyText(KEY),record);h.raw.fetchCoinbaseCandles.mockClear();
  const late=T0+400*300,provider=new CoinbaseLiveProvider(h.bridge,{now:()=>late*1000}),handle=provider.open('BTC-USD','5m');await flush();
  expect(requests(h)[0].start).toBe(Math.floor(late/300)*300-299*300);handle.close();provider.dispose();
 });
});
