import {createRequire} from 'node:module';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {ALPACA_HYBRID_COVERAGE,ALPACA_SIP_LIVE_COVERAGE,AlpacaLiveProvider,currentAlpacaDataPlan,preferAlpacaDataPlan,type AlpacaBridge,type AlpacaEvent,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {newYorkWallTime} from '../../src/domain/us-market-hours';
import {liveDataOf,restoreLiveData} from '../../src/ui/live-workspace';
import {describeStreamStatus} from '../../src/ui/LiveDataSettings';
import type {Bar} from '../../src/domain/types';

// (decision): all-exchange (SIP) history up to 15 minutes ago, IEX for the newest
// 15 minutes and live, the tail re-read from SIP as it ages; a Paid data plan uses SIP for everything. SYNTHETIC bridge only.
const require=createRequire(import.meta.url);
const {barsInput,subscribeInput,subscribeFeedInput,AlpacaMarketData,WS_URL,WS_SIP_URL}=require('../../electron/public-alpaca.cjs');

const DATE='2026-10-21',ET=(h:number,m=0)=>newYorkWallTime(DATE,h*60+m);
/** SYNTHETIC tape: all exchanges print every minute (volume 1000); IEX only on even minutes (volume 30). Same prices. */
const price=(t:number)=>100+((t/60)%17)/10;
function minutes(start:number,end:number,feed:string,step=60):Bar[]{
 const out:Bar[]=[];
 for(let t=Math.ceil(start/step)*step;t<=end;t+=step){
  if(feed==='iex'&&step===60&&(t/60)%2!==0)continue;
  const p=price(t);out.push({time:t,open:p,high:p+0.5,low:p-0.5,close:p,volume:feed==='sip'?1000*step/60:30*step/60});
 }
 return out;
}
const status=(state:AlpacaStatus['state'],feed:'iex'|'sip'='iex'):AlpacaStatus=>({schemaVersion:1,state,symbols:['GME'],feed,attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{}} as AlpacaStatus);
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function bridge(nowS:()=>number,options:{sipError?:string}={}){
 let listener:((event:AlpacaEvent)=>void)|null=null;
 const value={
  alpacaKeyStatus:vi.fn(async()=>({ok:true as const,value:{configured:true,keyIdHint:'****',encryption:true}})),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn(),
  fetchAlpacaBars:vi.fn(async(input:any)=>{
   if(input.feed==='sip'&&input.plan!=='paid'&&input.end>nowS()-900)throw new Error('SIP request past the free-plan delay');
   if(input.feed==='sip'&&options.sipError)return {ok:false as const,error:{code:'FORBIDDEN',message:options.sipError}};
   const step=({'1Min':60,'5Min':300,'15Min':900,'1Hour':3600,'1Day':86400} as Record<string,number>)[input.timeframe];
   return {ok:true as const,value:{schemaVersion:1 as const,symbol:input.symbol,timeframe:input.timeframe,seconds:step,feed:input.feed,bars:minutes(input.start,input.end,input.feed,step),nextPageToken:null,provenance:{provider:'synthetic',kind:'owner-key' as const,feed:input.feed,delaySeconds:0,sourceUrl:'synthetic',retrievedAt:'',bytes:0,license:''}}};
  }),
  subscribeAlpaca:vi.fn(async(input:any)=>({ok:true as const,value:status('ready',input.feed??'iex')})),unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),
  onAlpacaEvent:vi.fn((handler:(event:AlpacaEvent)=>void)=>{listener=handler;return()=>{listener=null;};}),
 } satisfies AlpacaBridge;
 return {bridge:value,emit:(event:AlpacaEvent)=>listener?.(event)};
}
const calls=(b:{fetchAlpacaBars:{mock:{calls:any[][]}}})=>b.fetchAlpacaBars.mock.calls.map(([call])=>call);
const strictlyIncreasing=(bars:Bar[])=>bars.every((bar,i)=>i===0||bar.time>bars[i-1].time);
afterEach(()=>preferAlpacaDataPlan('free'));

describe('Free plan: all-exchange history, IEX tail and live',()=>{
 it('backfill asks SIP up to 15 minutes ago, then IEX strictly after the last SIP bar; one bar per time, no gap at the seam',async()=>{
  const now=ET(11),{bridge:b}=bridge(()=>now),provider=new AlpacaLiveProvider(b,{now:()=>now*1000});
  expect(currentAlpacaDataPlan()).toBe('free');
  const handle=provider.open('GME','1m');await flush();
  const [sip,iex]=calls(b);
  expect(sip).toMatchObject({feed:'sip',timeframe:'1Min',end:now-900});expect(sip.plan).toBeUndefined();
  // The last SIP bar that closed by 10:45 starts at 10:44; IEX starts one second after it.
  expect(iex).toMatchObject({feed:'iex',timeframe:'1Min',start:ET(10,44)+1,end:now});
  const bars=handle.dataset().bars;
  expect(strictlyIncreasing(bars)).toBe(true);
  for(const bar of bars)expect(bar.volume,String(bar.time)).toBe(bar.time<=ET(10,44)?1000:30);
  expect(bars.filter(bar=>bar.time>ET(10,44)).map(bar=>bar.time)).toEqual([ET(10,46),ET(10,48),ET(10,50),ET(10,52),ET(10,54),ET(10,56),ET(10,58),ET(11)]);
  const data=handle.dataset();
  expect(data.provenance.coverage).toContain(ALPACA_HYBRID_COVERAGE);
  expect(data.provenance.coverage).toContain('History: all exchanges (15 min delayed). Live: IEX.');
  expect(data.provenance.notes.join(' ')).toContain('up to 10:45 New York time');
  handle.close();provider.dispose();
 });
 it('the IEX tail is re-read from all exchanges once it is 15 minutes old: bars replaced, missing minutes filled, forming bar untouched',async()=>{
  let now=ET(11);const {bridge:b,emit}=bridge(()=>now),provider=new AlpacaLiveProvider(b,{now:()=>now*1000});
  const handle=provider.open('GME','1m');await flush();
  now=ET(11,6);const before=calls(b).length;
  emit({schemaVersion:1,kind:'batch',bars:[{symbol:'GME',kind:'minute',seconds:60,time:ET(11,6),open:101,high:101,low:101,close:101,volume:5}],trades:[],receivedAt:''});
  await flush();
  const refresh=calls(b).slice(before);
  expect(refresh).toHaveLength(1);expect(refresh[0]).toMatchObject({feed:'sip',start:ET(10,44)+1,end:ET(10,51)});
  const bars=handle.dataset().bars;
  expect(strictlyIncreasing(bars)).toBe(true);
  // 10:45-10:50 closed by 10:51: now from all exchanges, including the odd minutes IEX never printed.
  expect(bars.filter(bar=>bar.time>=ET(10,45)&&bar.time<=ET(10,50)).map(bar=>[bar.time,bar.volume])).toEqual([45,46,47,48,49,50].map(m=>[ET(10,m),1000]));
  expect(bars.filter(bar=>bar.time>ET(10,50)&&bar.time<ET(11,6)).every(bar=>bar.volume===30)).toBe(true);
  expect(bars.at(-1)).toMatchObject({time:ET(11,6),volume:5});
  expect(handle.dataset().provenance.notes.join(' ')).toContain('up to 10:51 New York time');
  // Within the next five minutes no further re-read is asked for.
  now=ET(11,8);emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:ET(11,8),price:101,high:101,low:101,size:1}],receivedAt:''});await flush();
  expect(calls(b).length).toBe(before+1);
  handle.close();provider.dispose();
 });
 it('1h (folded from 15-minute bars): the re-read replaces only whole hour buckets that closed 15 minutes ago',async()=>{
  let now=ET(11,20);const {bridge:b,emit}=bridge(()=>now),provider=new AlpacaLiveProvider(b,{now:()=>now*1000});
  const handle=provider.open('GME','60m');await flush();
  const [sip,iex]=calls(b);expect(sip).toMatchObject({feed:'sip',timeframe:'15Min',end:ET(11,5)});expect(iex).toMatchObject({feed:'iex',start:ET(10,45)+1});
  now=ET(11,50);const before=calls(b).length;
  emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:ET(11,50),price:101,high:101,low:101,size:1}],receivedAt:''});await flush();
  const refresh=calls(b).slice(before).find(call=>call.feed==='sip');
  expect(refresh).toMatchObject({timeframe:'15Min',start:ET(10,30),end:ET(11,35)});
  const hour=handle.dataset().bars.find(bar=>bar.time===ET(10,30))!;
  expect(hour.volume).toBe(4*15000); // four all-exchange quarter hours, no IEX volume left in the closed bucket
  expect(strictlyIncreasing(handle.dataset().bars)).toBe(true);
  handle.close();provider.dispose();
 });
 it('older pages come from all exchanges',async()=>{
  const now=ET(11),{bridge:b}=bridge(()=>now),provider=new AlpacaLiveProvider(b,{now:()=>now*1000});
  const handle=provider.open('GME','5m');await flush();
  const first=handle.dataset().bars[0].time;
  await handle.loadOlder!();await flush();
  expect(calls(b).at(-1)).toMatchObject({feed:'sip',timeframe:'5Min',end:first});
  expect(strictlyIncreasing(handle.dataset().bars)).toBe(true);
  handle.close();provider.dispose();
 });
 it('refused all-exchange history falls back to IEX for the whole window and says so',async()=>{
  const now=ET(11),{bridge:b}=bridge(()=>now,{sipError:'Your plan does not include SIP history.'}),provider=new AlpacaLiveProvider(b,{now:()=>now*1000});
  const handle=provider.open('GME','1m');await flush();
  const data=handle.dataset();
  expect(calls(b).at(-1)).toMatchObject({feed:'iex',start:now-7*86400});
  expect(data.bars.length).toBeGreaterThan(0);expect(data.bars.every(bar=>bar.volume===30)).toBe(true);
  expect(data.provenance.coverage).not.toContain('all exchanges');
  expect(data.provenance.notes.join(' ')).toContain('All-exchange history is unavailable (Your plan does not include SIP history.)');
  expect(data.provenance.state).not.toBe('error');
  await handle.loadOlder!();await flush();expect(calls(b).at(-1)).toMatchObject({feed:'iex'});
  handle.close();provider.dispose();
 });
});

describe('Paid plan: all exchanges for everything',()=>{
 it('history to now, seeding and the stream all use SIP; requests carry plan paid',async()=>{
  const now=ET(11,7),{bridge:b}=bridge(()=>now),provider=new AlpacaLiveProvider(b,{now:()=>now*1000,plan:'paid'});
  const handle=provider.open('GME','15m');await flush();
  expect(calls(b)[0]).toMatchObject({feed:'sip',plan:'paid',end:now});
  expect(calls(b).every(call=>call.feed==='sip')).toBe(true);
  expect(b.subscribeAlpaca.mock.calls[0][0]).toEqual({symbols:['GME'],feed:'sip',quotes:true});
  expect(handle.dataset().provenance.coverage).toContain(ALPACA_SIP_LIVE_COVERAGE);
  expect(describeStreamStatus(status('ready','sip'),now*1000)).toBe('Live stream connected (all exchanges).');
  handle.close();provider.dispose();
 });
 it('switching the Data plan resubscribes on the other feed and reloads open feeds; Free again restores IEX live',async()=>{
  const now=ET(11),{bridge:b}=bridge(()=>now),provider=new AlpacaLiveProvider(b,{now:()=>now*1000});
  const handle=provider.open('GME','1m');await flush();
  expect(b.subscribeAlpaca.mock.calls[0][0]).toEqual({symbols:['GME'],quotes:true});
  const free=handle.dataset();
  preferAlpacaDataPlan('paid');await flush();
  expect(b.subscribeAlpaca.mock.calls.at(-1)![0]).toEqual({symbols:['GME'],feed:'sip',quotes:true});
  const paid=handle.dataset();
  expect(paid.provenance.revision).not.toBe(free.provenance.revision);
  expect(paid.bars.every(bar=>bar.volume===1000)).toBe(true);
  preferAlpacaDataPlan('free');await flush();
  expect(b.subscribeAlpaca.mock.calls.at(-1)![0]).toEqual({symbols:['GME'],quotes:true});
  expect(handle.dataset().provenance.coverage).toContain(ALPACA_HYBRID_COVERAGE);
  handle.close();provider.dispose();
 });
 it('the choice is saved with the live data settings only when Paid; Free is the default',()=>{
  expect(liveDataOf({})).toEqual({coinbase:false,alpacaSymbols:[]});
  expect(liveDataOf({liveData:{coinbase:false,alpacaSymbols:['GME'],alpacaPlan:'paid'}})).toEqual({coinbase:false,alpacaSymbols:['GME'],alpacaPlan:'paid'});
  expect(restoreLiveData({coinbase:false,alpacaSymbols:[],alpacaPlan:'paid'})).toEqual({coinbase:false,alpacaSymbols:[],alpacaPlan:'paid'});
  expect(restoreLiveData({coinbase:false,alpacaSymbols:[],alpacaPlan:'free'})).toEqual({coinbase:false,alpacaSymbols:[]});
  expect(()=>restoreLiveData({coinbase:false,alpacaSymbols:[],alpacaPlan:'pro'})).toThrow();
 });
});

describe('main process: plan and stream feed',()=>{
 const nowS=Math.floor(Date.UTC(2026,9,21,15)/1000),input={requestId:'synthetic',symbol:'GME',timeframe:'1Min',feed:'sip',start:nowS-3600,end:nowS};
 it('SIP history ends 15 minutes ago on the free plan and at the requested end on a paid plan',()=>{
  expect(barsInput(input,nowS)).toMatchObject({end:nowS-900,plan:'free'});
  expect(barsInput({...input,plan:'paid'},nowS)).toMatchObject({end:nowS,plan:'paid'});
  for(const bad of ['pro','',1,null])expect(()=>barsInput({...input,plan:bad},nowS),String(bad)).toThrow();
 });
 it('the stream feed is iex unless a paid plan asks for sip, which connects to the SIP stream URL',async()=>{
  expect(subscribeInput({symbols:['GME']})).toEqual(['GME']);expect(subscribeFeedInput({symbols:['GME']})).toBe('iex');
  expect(subscribeFeedInput({symbols:['GME'],feed:'sip'})).toBe('sip');
  for(const bad of ['delayed_sip','otc','SIP',1])expect(()=>subscribeInput({symbols:['GME'],feed:bad}),String(bad)).toThrow();
  expect(WS_URL).toBe('wss://stream.data.alpaca.markets/v2/iex');expect(WS_SIP_URL).toBe('wss://stream.data.alpaca.markets/v2/sip');
  const opened:string[]=[];
  class FakeSocket{url:string;onopen:any;onmessage:any;onclose:any;onerror:any;binaryType='';constructor(url:string){this.url=url;opened.push(url);}send(){}close(){}}
  const client=new AlpacaMarketData({keys:{load:async()=>({keyId:'SYNTHETICKEY0000ABCD',secret:'SyntheticSecretNotARealKey0000000000000000'})},fetchImpl:vi.fn(),WebSocketImpl:FakeSocket,restMinIntervalMs:0});
  try{
   expect((await client.subscribe({symbols:['GME']})).value.feed).toBe('iex');await flush();
   expect(opened).toEqual([WS_URL]);
   expect((await client.subscribe({symbols:['GME'],feed:'sip'})).value.feed).toBe('sip');await flush();
   expect(opened).toEqual([WS_URL,WS_SIP_URL]);
  }finally{client.close();}
 });
});
