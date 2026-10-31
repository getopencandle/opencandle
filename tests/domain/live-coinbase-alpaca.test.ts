import {describe,expect,it,vi} from 'vitest';
import {LiveBarSeries} from '../../src/domain/live-bars';
import {CoinbaseLiveProvider,COINBASE_RESOLUTIONS,COINBASE_CAPABILITIES,LIVE_CRYPTO_SETTING,coinbaseSearchDatasets,coinbaseResolution,type CoinbaseBridge,type CoinbaseEvent,type CoinbaseStatus} from '../../src/domain/coinbase-live';
import {AlpacaLiveProvider,ALPACA_RESOLUTIONS,ALPACA_CAPABILITIES,alpacaSearchDatasets,type AlpacaBridge,type AlpacaEvent,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {parseInterval} from '../../src/domain/intervals';
import type {Bar} from '../../src/domain/types';

// Live domain providers over synthetic bridges. No network, no real key.
const T0=Date.UTC(2026,9,20,15,0,0)/1000; // 15:00:00 UTC, a 1h and 15m boundary
const bar=(time:number,close=100,volume=1,high=Math.max(close,100)+1,low=Math.min(close,100)-1):Bar=>({time,open:100,high,low,close,volume});
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const status=(state:CoinbaseStatus['state'],extra:Partial<CoinbaseStatus>={}):CoinbaseStatus=>({schemaVersion:1,state,productIds:['BTC-USD'],attempt:0,lastMessageAt:T0*1000,liveMessages:false,lastError:null,counters:{},...extra});

function coinbaseBridge(handler:(input:any)=>Bar[]){
  let listener:((e:CoinbaseEvent)=>void)|null=null;
  const bridge={
    fetchCoinbaseCandles:vi.fn(async(input:any)=>({ok:true as const,value:{schemaVersion:1 as const,productId:input.productId,granularity:input.granularity,seconds:0,bars:handler(input),provenance:{provider:'synthetic',kind:'public-unauthenticated' as const,sourceUrl:'synthetic',retrievedAt:'',bytes:0,license:''}}})),
    subscribeCoinbase:vi.fn(async(input:{productIds:string[]})=>({ok:true as const,value:status('ready',{productIds:input.productIds})})),
    unsubscribeCoinbase:vi.fn(async()=>({ok:true as const,value:status('idle')})),
    onCoinbaseEvent:vi.fn((fn:(e:CoinbaseEvent)=>void)=>{listener=fn;return()=>{listener=null;};}),
  } satisfies CoinbaseBridge;
  return {bridge,emit:(e:CoinbaseEvent)=>listener?.(e),listening:()=>!!listener};
}
const batch=(candles:Array<Bar&{productId?:string}>,tickers:Array<{time:number;price:number;productId?:string}>=[],gap=false):CoinbaseEvent=>({schemaVersion:1,kind:'batch',candles:candles.map(c=>({productId:'BTC-USD',seconds:300,...c})),tickers:tickers.map(t=>({productId:'BTC-USD',high:t.price,low:t.price,...t})),gap,receivedAt:''});

describe('LiveBarSeries',()=>{
  it('updates the forming bar in place, appends a new bar, never invents gaps, and bumps the revision',()=>{
    const s=new LiveBarSeries({seconds:300,baseSeconds:300,ticks:false,aligned:true});
    s.setBackfill([bar(T0-600),bar(T0-300)]);const r0=s.revision;
    expect(s.applyBase(bar(T0-300,105,4)).changed).toBe(true);
    expect(s.bars.at(-1)).toEqual(bar(T0-300,105,4));expect(s.bars).toHaveLength(2);
    expect(s.applyBase(bar(T0,106,1)).changed).toBe(true);expect(s.bars.map(b=>b.time)).toEqual([T0-600,T0-300,T0]);
    expect(s.applyBase(bar(T0,106,1)).changed).toBe(false);
    expect(s.applyBase(bar(T0+1)).changed).toBe(false);expect(s.applyBase({...bar(T0+300),high:1}).changed).toBe(false);expect(s.rejected).toBe(2);
    expect(s.revision).toBeGreaterThan(r0);expect(s.formingTime).toBe(T0);
  });
  it('aggregates base bars exactly once a bucket is seeded and stays provisional (never shrinking REST values) before that',()=>{
    const s=new LiveBarSeries({seconds:900,baseSeconds:300,ticks:false,aligned:true});
    s.setBackfill([bar(T0-900),{time:T0,open:100,high:103,low:98,close:101,volume:10}]);
    const first=s.applyBase({time:T0+300,open:101,high:102,low:100.5,close:102,volume:2});
    expect(first.seed).toBe(T0);expect(s.provisionalTimes).toEqual([T0]);
    expect(s.bars.at(-1)).toEqual({time:T0,open:100,high:103,low:98,close:102,volume:10});
    s.seedBucket(T0,[{time:T0,open:100,high:103,low:98,close:101,volume:7},{time:T0+300,open:101,high:101.5,low:100.5,close:101,volume:1}]);
    expect(s.provisionalTimes).toEqual([]);
    // Live T0+300 (newer) wins over the REST seed for that 5-minute bucket.
    expect(s.bars.at(-1)).toEqual({time:T0,open:100,high:103,low:98,close:102,volume:9});
    s.applyBase({time:T0+900,open:102,high:104,low:101,close:103,volume:3});
    expect(s.bars.at(-1)).toEqual({time:T0+900,open:102,high:104,low:101,close:103,volume:3});expect(s.provisionalTimes).toEqual([]);
  });
  it('ticks extend the forming bar and open a new one at the boundary; late ticks for closed bars are ignored',()=>{
    const s=new LiveBarSeries({seconds:60,baseSeconds:60,ticks:true,aligned:true});
    s.setBackfill([bar(T0-60),bar(T0,100,5)]);
    s.applyTick({time:T0+10,price:103});s.applyTick({time:T0+20,price:97,size:null});
    expect(s.bars.at(-1)).toEqual({time:T0,open:100,high:103,low:97,close:97,volume:5});
    s.applyTick({time:T0+61,price:98,size:2});expect(s.bars.at(-1)).toEqual({time:T0+60,open:98,high:98,low:98,close:98,volume:2});
    expect(s.applyTick({time:T0+5,price:150}).changed).toBe(false);
    s.reconcile([{time:T0,open:100,high:103,low:97,close:97.5,volume:8}]);expect(s.bars.at(-2)).toEqual({time:T0,open:100,high:103,low:97,close:97.5,volume:8});
  });
});

describe('Coinbase live provider (synthetic bridge)',()=>{
  it('interval ids are the app canonical ids; capabilities are honest; search rows are off by default',()=>{
    for(const id of Object.keys(COINBASE_RESOLUTIONS))expect(parseInterval(id).id).toBe(id);
    expect(coinbaseResolution('1h')).toBe('60m');expect(coinbaseResolution('6h')).toBe('360m');expect(coinbaseResolution('1d')).toBe('1D');expect(coinbaseResolution('2h')).toBe('120m');expect(coinbaseResolution('30s')).toBeNull();
    expect(COINBASE_CAPABILITIES).toMatchObject({streaming:true,delaySeconds:0,requiresKey:false,redistributable:false,verifiedLive:false});
    expect(LIVE_CRYPTO_SETTING).toMatchObject({label:'Live crypto data (Coinbase public feed)',defaultValue:false});
    expect(coinbaseSearchDatasets(false)).toEqual([]);
    const rows=coinbaseSearchDatasets(true,'1h');
    expect(rows.map(r=>r.instrument.symbol)).toEqual(['BTC-USD','ETH-USD','SOL-USD']);
    expect(rows[0].provenance).toMatchObject({providerId:'coinbase-public',datasetId:'live:coinbase-public:BTC-USD:60m',fixture:false,delaySeconds:0,state:'disconnected'});
    expect(rows[0].instrument).toMatchObject({assetClass:'crypto',exchange:'COINBASE'});
  });
  it('backfills, subscribes, goes ready, and live candles update the last bar and append new bars',async()=>{
    const {bridge,emit}=coinbaseBridge(input=>input.granularity==='FIVE_MINUTE'?[bar(T0-600),bar(T0-300)]:[]);
    const provider=new CoinbaseLiveProvider(bridge,{now:()=>T0*1000+30000});
    const handle=provider.open('BTC-USD','5m');const seen:number[]=[];handle.onChange(d=>seen.push(d.bars.length));
    expect(handle.dataset().provenance.state).toBe('loading');
    await flush();
    expect(bridge.fetchCoinbaseCandles).toHaveBeenCalledWith(expect.objectContaining({productId:'BTC-USD',granularity:'FIVE_MINUTE',end:T0+30,start:T0-299*300}));
    expect(bridge.subscribeCoinbase).toHaveBeenCalledWith({productIds:['BTC-USD']});
    let d=handle.dataset();
    expect(d.provenance).toMatchObject({providerId:'coinbase-public',state:'ready',delaySeconds:0,fixture:false,datasetId:'live:coinbase-public:BTC-USD:5m',adjustment:'raw',session:'all'});
    expect(d.provenance.revision).toMatch(/^live-v1:/);expect(d.bars.map(b=>b.time)).toEqual([T0-600,T0-300]);
    emit(batch([{...bar(T0-300,104,9)},{...bar(T0,105,1)},{...bar(T0,1,1),productId:'ETH-USD'}]));
    d=handle.dataset();
    expect(d.bars.map(b=>[b.time,b.close])).toEqual([[T0-600,100],[T0-300,104],[T0,105]]);
    expect(seen.at(-1)).toBe(3);
    expect(handle.formingTime()).toBe(T0);
    expect(handle.dataset()).toBe(handle.dataset());
    emit({schemaVersion:1,kind:'status',status:status('stale')});expect(handle.dataset().provenance.state).toBe('stale');
    emit({schemaVersion:1,kind:'status',status:status('disconnected')});expect(handle.dataset().provenance.state).toBe('disconnected');
    handle.close();await flush();
    expect(bridge.unsubscribeCoinbase).toHaveBeenCalledOnce();
  });
  it('builds 1h bars from 5m candles: seeds the partial bucket from REST, then aggregates exactly',async()=>{
    const now=T0+1200;
    const {bridge,emit}=coinbaseBridge(input=>input.granularity==='ONE_HOUR'?[bar(T0-3600),{time:T0,open:100,high:102,low:99,close:101,volume:6}]:[{time:T0,open:100,high:102,low:99,close:100.5,volume:3},{time:T0+300,open:100.5,high:101,low:100,close:100.8,volume:2},{time:T0+600,open:100.8,high:101.2,low:100.6,close:101,volume:1}]);
    const provider=new CoinbaseLiveProvider(bridge,{now:()=>now*1000});
    const handle=provider.open('BTC-USD','1h');await flush();
    emit(batch([{time:T0+900,open:101,high:104,low:100.9,close:103,volume:0.5}]));
    await flush();
    expect(bridge.fetchCoinbaseCandles).toHaveBeenLastCalledWith(expect.objectContaining({granularity:'FIVE_MINUTE',start:T0,end:now}));
    expect(handle.dataset().bars.at(-1)).toEqual({time:T0,open:100,high:104,low:99,close:103,volume:6.5});
    expect(handle.dataset().provenance.notes.join(' ')).not.toMatch(/Provisional/);
    handle.close();
  });
  it('1m: ticker prices move the forming bar and a minute rollover triggers REST reconciliation',async()=>{
    let calls=0;
    const {bridge,emit}=coinbaseBridge(()=>{calls++;return calls===1?[bar(T0-60),bar(T0,100,4)]:[{time:T0,open:100,high:103,low:99,close:101,volume:9},{time:T0+60,open:101,high:101,low:101,close:101,volume:0.2}];});
    const provider=new CoinbaseLiveProvider(bridge,{now:()=>(T0+30)*1000});
    const handle=provider.open('BTC-USD','1m');await flush();
    emit(batch([],[{time:T0+40,price:102.5}]));
    expect(handle.dataset().bars.at(-1)).toEqual({time:T0,open:100,high:102.5,low:99,close:102.5,volume:4});
    emit(batch([],[{time:T0+61,price:101}]));await flush();
    expect(bridge.fetchCoinbaseCandles).toHaveBeenCalledTimes(2);
    expect(handle.dataset().bars.slice(-2)).toEqual([{time:T0,open:100,high:103,low:99,close:101,volume:9},{time:T0+60,open:101,high:101,low:101,close:101,volume:0.2}]);
    handle.close();
  });
  it('rejects products and intervals outside the allow-list, drops results for series closed mid-request, and shares a subscription',async()=>{
    const {bridge}=coinbaseBridge(()=>[bar(T0)]);
    const provider=new CoinbaseLiveProvider(bridge,{now:()=>T0*1000});
    expect(()=>provider.open('DOGE-USD','5m')).toThrow(/allow-list/);expect(()=>provider.open('BTC-USD','30s')).toThrow();
    const a=provider.open('BTC-USD','5m'),b=provider.open('ETH-USD','15m');a.close();
    await flush();
    expect(a.dataset().bars).toEqual([]);
    expect(bridge.subscribeCoinbase).toHaveBeenLastCalledWith({productIds:['ETH-USD']});
    b.close();provider.dispose();
  });
});

describe('Alpaca live provider (synthetic bridge, owner key never visible here)',()=>{
  const aStatus=(state:AlpacaStatus['state']):AlpacaStatus=>({schemaVersion:1,state,symbols:['AAPL'],feed:'iex',attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{}});
  function alpacaBridge(handler:(input:any)=>{bars:Bar[];nextPageToken?:string|null}){
    let listener:((e:AlpacaEvent)=>void)|null=null;
    const bridge={
      alpacaKeyStatus:vi.fn(async()=>({ok:true as const,value:{configured:true,keyIdHint:'****ABCD',encryption:true}})),
      saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn(),
      fetchAlpacaBars:vi.fn(async(input:any)=>{const page=handler(input);return {ok:true as const,value:{schemaVersion:1 as const,symbol:input.symbol,timeframe:input.timeframe,seconds:0,feed:input.feed,bars:page.bars,nextPageToken:page.nextPageToken??null,provenance:{provider:'synthetic',kind:'owner-key' as const,feed:input.feed,delaySeconds:input.feed==='sip'?900:0,sourceUrl:'',retrievedAt:'',bytes:0,license:''}}};}),
      subscribeAlpaca:vi.fn(async()=>({ok:true as const,value:aStatus('ready')})),
      unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),
      onAlpacaEvent:vi.fn((fn:(e:AlpacaEvent)=>void)=>{listener=fn;return()=>{listener=null;};}),
    } as unknown as AlpacaBridge;
    return {bridge,emit:(e:AlpacaEvent)=>listener?.(e)};
  }
  it('labels IEX-only coverage, real-time delay 0, and hides search rows until a key is saved',()=>{
    for(const id of Object.keys(ALPACA_RESOLUTIONS))expect(parseInterval(id).id).toBe(id);
    expect(ALPACA_CAPABILITIES).toMatchObject({requiresKey:true,redistributable:false,verifiedLive:false,delaySeconds:0});
    expect(alpacaSearchDatasets(false,['AAPL'])).toEqual([]);
    const [row]=alpacaSearchDatasets(true,['AAPL','bad symbol']);
    expect(row.provenance).toMatchObject({providerId:'alpaca-iex',delaySeconds:0,datasetId:'live:alpaca-iex:AAPL:5m'});
    expect(row.provenance.coverage).toMatch(/IEX exchange only/);
  });
  it('backfills IEX with pagination, applies trades to the forming minute and replaces it with the published minute bar',async()=>{
    const {bridge,emit}=alpacaBridge(input=>input.pageToken?{bars:[bar(T0,100,50)]}:{bars:[bar(T0-60)],nextPageToken:'page2'});
    const provider=new AlpacaLiveProvider(bridge,{now:()=>(T0+30)*1000});
    const handle=provider.open('AAPL','1m');await flush();
    // All-exchange history up to 15 minutes ago (two SIP pages, none closed by then), then IEX (two pages).
    expect(bridge.fetchAlpacaBars).toHaveBeenCalledTimes(4);
    expect((bridge.fetchAlpacaBars as any).mock.calls[0][0]).toMatchObject({symbol:'AAPL',timeframe:'1Min',feed:'sip',end:T0+30-900});
    expect((bridge.fetchAlpacaBars as any).mock.calls[2][0]).toMatchObject({symbol:'AAPL',timeframe:'1Min',feed:'iex'});
    expect(handle.dataset().provenance).toMatchObject({providerId:'alpaca-iex',delaySeconds:0,state:'ready'});
    expect(handle.dataset().provenance.notes.join(' ')).toMatch(/IEX exchange only/);
    emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'AAPL',time:T0+65,price:102,high:102.5,low:101.5,size:7}],receivedAt:''});
    expect(handle.dataset().bars.at(-1)).toEqual({time:T0+60,open:102,high:102.5,low:101.5,close:102,volume:7});
    emit({schemaVersion:1,kind:'batch',bars:[{symbol:'AAPL',kind:'minute',seconds:60,time:T0+60,open:101.8,high:102.6,low:101.4,close:102.1,volume:40}],trades:[],receivedAt:''});
    expect(handle.dataset().bars.at(-1)).toEqual({time:T0+60,open:101.8,high:102.6,low:101.4,close:102.1,volume:40});
    emit({schemaVersion:1,kind:'status',status:aStatus('auth-failed')});expect(handle.dataset().provenance.state).toBe('error');
    handle.close();await flush();expect(bridge.unsubscribeAlpaca).toHaveBeenCalled();
  });
  it('SIP history is a static dataset delayed 15 minutes, labelled consolidated and not live',async()=>{
    const {bridge}=alpacaBridge(()=>({bars:[bar(T0-86400*2),bar(T0-86400)]}));
    const provider=new AlpacaLiveProvider(bridge,{now:()=>T0*1000});
    const d=await provider.history('AAPL','1D');
    expect((bridge.fetchAlpacaBars as any).mock.calls[0][0]).toMatchObject({feed:'sip',end:T0-900,timeframe:'1Day'});
    expect(d.provenance).toMatchObject({providerId:'alpaca-sip-delayed',delaySeconds:900,state:'ready'});
    expect(bridge.subscribeAlpaca).not.toHaveBeenCalled();
  });
});
