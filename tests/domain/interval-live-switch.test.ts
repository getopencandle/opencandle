import {describe,expect,it,vi} from 'vitest';
import {planCoinbaseInterval,planAlpacaInterval,foldBars} from '../../src/domain/live-intervals';
import {CoinbaseLiveProvider,coinbaseResolution,type CoinbaseBridge,type CoinbaseEvent,type CoinbaseStatus} from '../../src/domain/coinbase-live';
import {AlpacaLiveProvider,alpacaResolution,type AlpacaBridge,type AlpacaEvent,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {resolveIntervalSwitch,finestIntervalSource} from '../../src/domain/interval-switch';
import {createIntervalMenuState,editIntervalMenu,restoreIntervalMenuState,sortIntervalIds,STANDARD_INTERVALS,intervalLabel} from '../../src/domain/intervals';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {Bar} from '../../src/domain/types';

const T0=Date.UTC(2026,9,20,15,0,0)/1000;
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const mk=(time:number,close=100,volume=1):Bar=>({time,open:100,high:Math.max(close,100)+1,low:Math.min(close,100)-1,close,volume});

describe('standard set',()=>{
  it('has the reference app seconds, minutes, hours and day-plus intervals',()=>{
    const ids=STANDARD_INTERVALS.map(i=>i.id);
    for(const id of ['1s','5s','10s','15s','30s','1m','2m','3m','5m','10m','15m','30m','45m','60m','120m','180m','240m','1D','1W','1M','3M','6M','12M'])expect(ids).toContain(id);
    expect(['60m','120m','180m','240m'].map(id=>intervalLabel(id))).toEqual(['1 hour','2 hours','3 hours','4 hours']);
  });
});

describe('live interval plans',()=>{
  it('Coinbase: native, folded minute/hour, calendar and refused ones',()=>{
    expect(planCoinbaseInterval('1h')).toMatchObject({ok:true,plan:{id:'60m',native:true}});
    expect(planCoinbaseInterval('2m')).toMatchObject({ok:true,plan:{native:false,backfillSeconds:60,baseSeconds:60,ticks:true}});
    expect(planCoinbaseInterval('10m')).toMatchObject({ok:true,plan:{native:false,backfillSeconds:300,baseSeconds:300}});
    expect(planCoinbaseInterval('4h')).toMatchObject({ok:true,plan:{native:false,backfillSeconds:3600}});
    expect(planCoinbaseInterval('1W')).toMatchObject({ok:true,plan:{calendar:true,backfillSeconds:86400}});
    expect(planCoinbaseInterval('3M')).toMatchObject({ok:true,plan:{calendar:true}});
    const s=planCoinbaseInterval('30s');expect(s.ok).toBe(false);expect(!s.ok&&s.reason).toMatch(/finer than 1 minute/);
    expect(planCoinbaseInterval('10T').ok).toBe(false);
    expect(coinbaseResolution('7m')).toBe('7m');
  });
  it('Alpaca folds from minute/15-minute/daily bars (hours sit on the 09:30 session) and refuses seconds',()=>{
    expect(planAlpacaInterval('2m')).toMatchObject({ok:true,plan:{native:false,backfillSeconds:60,baseSeconds:60}});
    expect(planAlpacaInterval('4h')).toMatchObject({ok:true,plan:{backfillSeconds:900,baseSeconds:60}});
    expect(planAlpacaInterval('1W')).toMatchObject({ok:true,plan:{calendar:true,baseSeconds:86400,ticks:false}});
    expect(planAlpacaInterval('15s').ok).toBe(false);
    expect(alpacaResolution('90m')).toBe('90m');
  });
  it('foldBars uses open first, close last, extremes and summed volume',()=>{
    const out=foldBars([mk(T0,101,1),mk(T0+60,105,2),mk(T0+120,99,3)],t=>Math.floor(t/180)*180);
    expect(out).toHaveLength(1);expect(out[0]).toMatchObject({open:100,close:99,volume:6,high:106,low:98});
  });
});

function coinbaseBridge(){
  let listener:((e:CoinbaseEvent)=>void)|null=null;
  const status=(state:CoinbaseStatus['state'],productIds:string[]=['BTC-USD']):CoinbaseStatus=>({schemaVersion:1,state,productIds,attempt:0,lastMessageAt:T0*1000,liveMessages:false,lastError:null,counters:{}});
  const sizes:Record<string,number>={ONE_MINUTE:60,FIVE_MINUTE:300,FIFTEEN_MINUTE:900,ONE_HOUR:3600,SIX_HOUR:21600,ONE_DAY:86400};
  const bridge={
    fetchCoinbaseCandles:vi.fn(async(input:any)=>{const size=sizes[input.granularity as string];const bars:Bar[]=[];for(let t=Math.ceil(input.start/size)*size;t<=input.end;t+=size)bars.push(mk(t,100+(t/size)%5,1));return {ok:true as const,value:{schemaVersion:1 as const,productId:input.productId,granularity:input.granularity,seconds:size,bars,provenance:{provider:'synthetic',kind:'public-unauthenticated' as const,source:'test',license:'test'} as any}};}),
    subscribeCoinbase:vi.fn(async(input:{productIds:string[]})=>({ok:true as const,value:status('ready',input.productIds)})),
    unsubscribeCoinbase:vi.fn(async()=>({ok:true as const,value:status('idle')})),
    onCoinbaseEvent:vi.fn((fn:(e:CoinbaseEvent)=>void)=>{listener=fn;return()=>{listener=null;};}),
  };
  return {bridge,emit:(e:CoinbaseEvent)=>listener?.(e)};
}

describe('Coinbase live at a non-native interval',()=>{
  it('backfills from the finest native feed into aligned buckets, keeps one subscription across interval switches',async()=>{
    const {bridge,emit}=coinbaseBridge(),provider=new CoinbaseLiveProvider(bridge as unknown as CoinbaseBridge,{now:()=>(T0+30)*1000});
    const h7=provider.open('BTC-USD','7m');await flush();
    expect(bridge.fetchCoinbaseCandles.mock.calls.every(c=>c[0].granularity==='ONE_MINUTE')).toBe(true);
    const ds=h7.dataset();expect(ds.resolution).toBe('7m');expect(ds.bars.length).toBeGreaterThan(20);
    expect(ds.bars.every(b=>b.time%420===0)).toBe(true);
    const forming=ds.bars.at(-1)!;
    emit({schemaVersion:1,kind:'batch',candles:[],tickers:[{productId:'BTC-USD',price:250,time:T0+30,high:250,low:250}],gap:false} as unknown as CoinbaseEvent);
    expect(h7.dataset().bars.at(-1)!.time).toBe(forming.time);expect(h7.dataset().bars.at(-1)!.close).toBe(250);
    expect(h7.formingTime()).toBe(forming.time);
    const h4=provider.open('BTC-USD','4h');h7.close();await flush();
    expect(bridge.subscribeCoinbase).toHaveBeenCalledTimes(1);expect(bridge.unsubscribeCoinbase).not.toHaveBeenCalled();
    expect(h4.dataset().bars.every(b=>b.time%14400===0)).toBe(true);
    const hw=provider.open('BTC-USD','1W');await flush();h4.close();
    expect(hw.dataset().resolution).toBe('1W');expect(hw.dataset().bars.length).toBeGreaterThan(0);
    expect(bridge.subscribeCoinbase).toHaveBeenCalledTimes(1);
    hw.close();expect(bridge.unsubscribeCoinbase).toHaveBeenCalledTimes(1);
  });
  it('5-minute candles fold live into a 10m bar',async()=>{
    const {bridge,emit}=coinbaseBridge(),provider=new CoinbaseLiveProvider(bridge as unknown as CoinbaseBridge,{now:()=>(T0+30)*1000});
    const h=provider.open('BTC-USD','10m');await flush();
    emit({schemaVersion:1,kind:'batch',candles:[{productId:'BTC-USD',seconds:300,...mk(T0,300,5)}],tickers:[],gap:false} as unknown as CoinbaseEvent);
    await flush();
    const last=h.dataset().bars.at(-1)!;expect(last.time).toBe(T0);expect(last.high).toBeGreaterThanOrEqual(301);
  });
  it('refuses a second-level interval with a reason',()=>{
    const {bridge}=coinbaseBridge(),provider=new CoinbaseLiveProvider(bridge as unknown as CoinbaseBridge);
    expect(()=>provider.open('BTC-USD','30s')).toThrow(/finer than 1 minute/);
  });
});

describe('Alpaca live at a non-native interval',()=>{
  it('folds 1-minute history and trades into 3m buckets on one subscription',async()=>{
    let listener:((e:AlpacaEvent)=>void)|null=null;
    const st=(state:AlpacaStatus['state']):AlpacaStatus=>({schemaVersion:1,state,attempt:0,lastMessageAt:T0*1000,liveMessages:false,lastError:null,counters:{},symbols:['AAPL'],feed:'iex'});
    const bridge={
      alpacaKeyStatus:vi.fn(),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn(),
      fetchAlpacaBars:vi.fn(async(input:any)=>{const size=input.timeframe==='1Min'?60:input.timeframe==='1Hour'?3600:86400;const bars:Bar[]=[];for(let t=Math.ceil(input.start/size)*size;t<=input.end;t+=size)bars.push(mk(t,100+(t/size)%3));return {ok:true as const,value:{schemaVersion:1 as const,symbol:input.symbol,timeframe:input.timeframe,seconds:size,feed:input.feed,bars,nextPageToken:null,provenance:{} as any}};}),
      subscribeAlpaca:vi.fn(async()=>({ok:true as const,value:st('ready')})),unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),
      onAlpacaEvent:vi.fn((fn:(e:AlpacaEvent)=>void)=>{listener=fn;return()=>{listener=null;};}),
    };
    const provider=new AlpacaLiveProvider(bridge as unknown as AlpacaBridge,{now:()=>(T0+30)*1000});
    const h=provider.open('AAPL','3m');await flush();
    expect(bridge.fetchAlpacaBars.mock.calls[0][0].timeframe).toBe('1Min');
    expect(h.dataset().bars.every(b=>b.time%180===0)).toBe(true);
    const before=h.dataset().bars.at(-1)!;
    (listener as unknown as (e:unknown)=>void)?.({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'AAPL',time:T0+30,price:400,high:400,low:400,size:3}]});
    expect(h.dataset().bars.at(-1)!.close).toBe(400);expect(h.dataset().bars.at(-1)!.time).toBe(before.time);
    const w=provider.open('AAPL','1W');await flush();h.close();
    expect(bridge.fetchAlpacaBars.mock.calls.some(c=>c[0].timeframe==='1Day')).toBe(true);
    expect(bridge.subscribeAlpaca).toHaveBeenCalledTimes(1);expect(bridge.unsubscribeAlpaca).not.toHaveBeenCalled();
    w.close();
  });
});

describe('interval switch resolution',()=>{
  it('demo: aggregates from the finest original source, including custom forms; finer is refused with a reason',()=>{
    const d=fixtureDataset('GME',3);
    for(const id of ['1W','1M','3M','6M','12M','3D','2W','5D']){const r=resolveIntervalSwitch([d],d,id);expect(r.ok,id).toBe(true);}
    const finer=resolveIntervalSwitch([d],d,'5m');expect(finer.ok).toBe(false);expect(!finer.ok&&finer.reason).toMatch(/finer/);
    const weekly=resolveIntervalSwitch([d],d,'1W');if(!weekly.ok||weekly.kind!=='local')throw new Error('x');
    expect(finestIntervalSource([d,weekly.result.dataset],weekly.result.dataset)).toBe(d);
    const monthly=resolveIntervalSwitch([d,weekly.result.dataset],weekly.result.dataset,'1M');expect(monthly.ok).toBe(true);
  });
  it('live: plans instead of local datasets',()=>{
    const base=fixtureDataset('BTC-USD',3);
    const live={...base,provenance:{...base.provenance,providerId:'coinbase-public',datasetId:'live:coinbase-public:BTC-USD:5m'}};
    expect(resolveIntervalSwitch([live],live,'7m')).toMatchObject({ok:true,kind:'live',interval:'7m'});
    expect(resolveIntervalSwitch([live],live,'1W')).toMatchObject({ok:true,kind:'live'});
    expect(resolveIntervalSwitch([live],live,'5s')).toMatchObject({ok:false});
  });
});

describe('favorites and custom',()=>{
  it('favorites follow ascending duration regardless of click order and persist',()=>{
    let s=createIntervalMenuState();
    for(const id of ['1D','5m','4h','1W','1m'])s=editIntervalMenu(s,{type:'favorite',interval:id});
    expect(s.favorites).toEqual(['1m','5m','240m','1D','1W']);
    expect(restoreIntervalMenuState(JSON.parse(JSON.stringify(s))).favorites).toEqual(s.favorites);
    expect(sortIntervalIds(['1M','1W','30s','120m'])).toEqual(['30s','120m','1W','1M']);
  });
  it('custom intervals (7m, 90m, 3D, 2W) are added, starred and removed; presets are not custom',()=>{
    let s=createIntervalMenuState();
    for(const text of ['7m','90m','2h','3D','2W','45'])s=editIntervalMenu(s,{type:'add',interval:text});
    expect(s.custom).toEqual(['7m','90m','3D','2W']);
    s=editIntervalMenu(s,{type:'favorite',interval:'7m'});expect(s.favorites).toEqual(['7m']);
    s=editIntervalMenu(s,{type:'remove',interval:'7m'});
    expect(s.custom).not.toContain('7m');expect(s.favorites).toEqual([]);
    expect(()=>editIntervalMenu(s,{type:'remove',interval:'5m'})).toThrow(/custom/);
  });
});
