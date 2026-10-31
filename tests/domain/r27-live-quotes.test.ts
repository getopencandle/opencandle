import {afterEach,describe,expect,it,vi} from 'vitest';
import {AlpacaLiveProvider,type AlpacaBridge,type AlpacaEvent,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {CoinbaseLiveProvider,type CoinbaseBridge,type CoinbaseEvent} from '../../src/domain/coinbase-live';
import {bidAskScaleMarks,liveQuotes,LiveQuoteStore,liveQuoteShortSource,normalizeLiveQuote,topOfBookDisplayQuote,type LiveQuote} from '../../src/domain/live-quotes';
import {ticketBookText} from '../../src/ui/PaperOrderTicket';
import type {Quote} from '../../src/domain/types';

// Every bridge here is a SYNTHETIC mock; no Alpaca or Coinbase endpoint is called and no key is used.
const NOW=Date.UTC(2026,9,21,15,0,0),NOW_S=NOW/1000;
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const meta={instrumentId:'US:GME',symbol:'GME',providerId:'alpaca-iex',feed:'iex' as const,synthetic:false,receivedAt:NOW};
const quote=(bid:number|null,ask:number|null,time=NOW_S,extra:Partial<LiveQuote>={}):LiveQuote=>({...meta,bid,ask,bidSize:bid===null?null:3,askSize:ask===null?null:5,time,...extra});
afterEach(()=>{liveQuotes.reset();vi.useRealTimers();});

describe('live quote store',()=>{
 it('re-checks rows from main: no side, crossed and bad times are dropped',()=>{
  expect(normalizeLiveQuote({bid:20,ask:20.05,bidSize:3,askSize:5,time:NOW_S},meta)).toEqual(quote(20,20.05));
  expect(normalizeLiveQuote({bid:null,ask:20.05,bidSize:9,askSize:5,time:NOW_S},meta)).toEqual(quote(null,20.05));
  expect(normalizeLiveQuote({bid:null,ask:null,time:NOW_S},meta)).toBeNull();
  expect(normalizeLiveQuote({bid:21,ask:20,time:NOW_S},meta)).toBeNull();
  expect(normalizeLiveQuote({bid:20,ask:21,time:1.5},meta)).toBeNull();
 });
 it('notifies each instrument at most once every 250 ms, with the newest quote', ()=>{
  vi.useFakeTimers();vi.setSystemTime(NOW);
  const store=new LiveQuoteStore(),seen:Array<number|null>=[],any=vi.fn();
  store.subscribe('US:GME',value=>seen.push(value?.bid??null));store.subscribeAll(any);
  for(let i=0;i<10;i++)store.publish(quote(20+i/100,20.5,NOW_S+i));
  expect(seen).toEqual([20]);
  vi.advanceTimersByTime(249);expect(seen).toEqual([20]);
  vi.advanceTimersByTime(1);expect(seen).toEqual([20,20.09]);
  expect(store.publish(quote(19,20.5,NOW_S))).toBe(false); // older than the held quote
  store.clear(['US:GME']);vi.advanceTimersByTime(250);expect(seen.at(-1)).toBeNull();expect(store.get('US:GME')).toBeNull();
  expect(any).toHaveBeenCalledTimes(3);
 });
 it('display helpers: scale marks in the bid and ask colors, a display-only top of book, the ticket line, and stale quotes hidden',()=>{
  const live=quote(20.01,20.03);
  expect(bidAskScaleMarks(live,['#111111','#222222'],NOW)).toEqual({bid:{price:20.01,color:'#111111'},ask:{price:20.03,color:'#222222'}});
  expect(bidAskScaleMarks({...live,receivedAt:NOW-10*60*1000},['#111111','#222222'],NOW)).toBeNull();
  const base:Quote={instrumentId:'US:GME',bid:20.02,ask:20.02,eventTime:NOW_S,receivedAt:NOW_S,availableAt:NOW_S,sequence:9,session:'regular',fixture:false};
  expect(topOfBookDisplayQuote(live,base,NOW)).toEqual({...base,bid:20.01,ask:20.03,bidSize:3,askSize:5});
  expect(topOfBookDisplayQuote(quote(null,20.03),base,NOW)).toBeNull();
  expect(topOfBookDisplayQuote(live,{...base,instrumentId:'US:SPY'},NOW)).toBeNull();
  expect(ticketBookText(live,2,NOW)).toMatchObject({text:'Live bid 20.01 x 3, ask 20.03 x 5'});
  expect(ticketBookText(live,2,NOW)!.title).toMatch(/IEX quote .*Virtual orders fill at the virtual feed price/);
  expect(ticketBookText(live,2,NOW+10*60*1000)).toBeNull(); // The ticket hides a stale quote too
  expect(liveQuoteShortSource({feed:'sip',synthetic:false})).toBe('SIP');expect(liveQuoteShortSource({feed:'iex',synthetic:true})).toBe('SYNTHETIC');
 });
});

const status=(state:AlpacaStatus['state']):AlpacaStatus=>({schemaVersion:1,state,symbols:['GME'],feed:'iex',attempt:0,lastMessageAt:null,liveMessages:true,lastError:null,counters:{}} as AlpacaStatus);
function alpacaBridge(){
 let listener:((event:AlpacaEvent)=>void)|null=null;
 const bridge={
  alpacaKeyStatus:vi.fn(),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn(),
  fetchAlpacaBars:vi.fn(async(input:any)=>({ok:true as const,value:{schemaVersion:1 as const,symbol:input.symbol,timeframe:input.timeframe,seconds:300,feed:input.feed,bars:[{time:NOW_S-600,open:20,high:21,low:19,close:20.5,volume:10}],nextPageToken:null,provenance:{provider:'synthetic',kind:'owner-key' as const,feed:input.feed,delaySeconds:0,sourceUrl:'https://synthetic.invalid/',retrievedAt:new Date(NOW).toISOString(),bytes:1,license:'synthetic'}}})),
  subscribeAlpaca:vi.fn(async()=>({ok:true as const,value:status('ready')})),unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),
  onAlpacaEvent:vi.fn((handler:(event:AlpacaEvent)=>void)=>{listener=handler;return()=>{listener=null;};}),
 } as unknown as AlpacaBridge;
 return {bridge,emit:(event:AlpacaEvent)=>listener?.(event)};
}

describe('Alpaca provider publishes stream quotes',()=>{
 it('asks for the quote channel, publishes quotes of its own symbols only, and clears them when the stream drops',async()=>{
  const {bridge,emit}=alpacaBridge(),provider=new AlpacaLiveProvider(bridge as never,{now:()=>NOW});
  const handle=provider.open('GME','5m');await flush();
  expect((bridge.subscribeAlpaca as any).mock.calls.at(-1)[0]).toEqual({symbols:['GME'],quotes:true});
  emit({schemaVersion:1,kind:'batch',bars:[],trades:[],quotes:[{symbol:'GME',time:NOW_S,bid:20.01,ask:20.04,bidSize:2,askSize:7,feed:'iex'},{symbol:'AAPL',time:NOW_S,bid:1,ask:2,bidSize:1,askSize:1,feed:'iex'}],receivedAt:new Date(NOW).toISOString()});
  expect(liveQuotes.get('US:GME')).toMatchObject({bid:20.01,ask:20.04,bidSize:2,askSize:7,feed:'iex',providerId:'alpaca-iex',synthetic:false});
  expect(liveQuotes.get('US:AAPL')).toBeNull();
  emit({schemaVersion:1,kind:'status',status:status('disconnected')});
  expect(liveQuotes.get('US:GME')).toBeNull();
  handle.close();
 });
});

describe('Coinbase provider publishes the ticker best bid and ask',()=>{
 it('maps the product to its instrument and ignores tickers without a book',async()=>{
  let listener:((event:CoinbaseEvent)=>void)|null=null;
 // The candles result carries bars (CoinbaseCandlesValue); live history remembers result.value.bars, so the old candles:[] mock leaked an unhandled rejection.
  const bridge={fetchCoinbaseCandles:vi.fn(async()=>({ok:true as const,value:{schemaVersion:1,productId:'BTC-USD',granularity:'FIVE_MINUTE',seconds:300,bars:[],provenance:{}}})),subscribeCoinbase:vi.fn(async()=>({ok:true as const,value:{schemaVersion:1,state:'ready',productIds:['BTC-USD'],attempt:0,lastMessageAt:null,liveMessages:true,lastError:null,counters:{}}})),unsubscribeCoinbase:vi.fn(async()=>({ok:true as const,value:null})),onCoinbaseEvent:vi.fn((handler:(event:CoinbaseEvent)=>void)=>{listener=handler;return()=>{listener=null;};})} as unknown as CoinbaseBridge;
  const provider=new CoinbaseLiveProvider(bridge as never),handle=provider.open('BTC-USD','5m');await flush();
  listener!({schemaVersion:1,kind:'batch',candles:[],tickers:[{productId:'BTC-USD',price:50000.1,time:NOW_S,high:50000.1,low:50000.1,bid:50000,ask:50000.2,bidSize:0.5,askSize:0.25},{productId:'ETH-USD',price:1,time:NOW_S,high:1,low:1,bid:1,ask:2}],gap:false,receivedAt:new Date(NOW).toISOString()});
  expect(liveQuotes.get('COINBASE:BTC-USD')).toMatchObject({bid:50000,ask:50000.2,feed:'coinbase',bidSize:0.5,askSize:0.25});
  expect(liveQuotes.get('COINBASE:ETH-USD')).toBeNull();
  handle.close();
 });
});
