import {afterEach,describe,expect,it,vi} from 'vitest';
import {AlpacaLiveProvider,type AlpacaBridge,type AlpacaEvent,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {CoinbaseLiveProvider,type CoinbaseBridge,type CoinbaseEvent} from '../../src/domain/coinbase-live';
import {liveQuotes,LiveQuoteStore} from '../../src/domain/live-quotes';

// (F6 renderer side, F8): every bridge is a SYNTHETIC mock. No endpoint is called, no key is used.
const NOW=Date.UTC(2026,9,21,15,0,0),NOW_S=NOW/1000;
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
afterEach(()=>{liveQuotes.reset();vi.useRealTimers();});

const status=(state:AlpacaStatus['state']):AlpacaStatus=>({schemaVersion:1,state,symbols:['GME'],feed:'iex',attempt:0,lastMessageAt:null,liveMessages:true,lastError:null,counters:{}} as AlpacaStatus);
function alpacaBridge(){
 const bridge={
  alpacaKeyStatus:vi.fn(),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn(),
  fetchAlpacaBars:vi.fn(async(input:any)=>({ok:true as const,value:{schemaVersion:1 as const,symbol:input.symbol,timeframe:input.timeframe,seconds:300,feed:input.feed,bars:[{time:NOW_S-600,open:20,high:21,low:19,close:20.5,volume:10}],nextPageToken:null,provenance:{provider:'synthetic',kind:'owner-key' as const,feed:input.feed,delaySeconds:0,sourceUrl:'https://synthetic.invalid/',retrievedAt:new Date(NOW).toISOString(),bytes:1,license:'synthetic'}}})),
  subscribeAlpaca:vi.fn(async()=>({ok:true as const,value:status('ready')})),unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),
  onAlpacaEvent:vi.fn((_handler:(event:AlpacaEvent)=>void)=>()=>undefined),
 } as unknown as AlpacaBridge;
 return bridge;
}
const lastSubscribe=(bridge:AlpacaBridge)=>(bridge.subscribeAlpaca as any).mock.calls.at(-1)[0];

describe('the Alpaca provider tells main which quotes are on screen',()=>{
 it('quotesFor follows the charts and tickets that show a quote, and the watchlist rows; it is absent when none shows one',async()=>{
  const bridge=alpacaBridge(),provider=new AlpacaLiveProvider(bridge as never,{now:()=>NOW});
  try{
   const gme=provider.open('GME','5m'),spy=provider.open('SPY','1m');await flush();
   // Background feeds only (alerts, paper): no quotesFor, so the subscribe shape is unchanged.
   expect(lastSubscribe(bridge)).toEqual({symbols:['GME','SPY'],quotes:true});
   // A chart cell starts showing SPY's bid and ask.
   const off=liveQuotes.subscribe('US:SPY',()=>undefined);await flush();
   expect(lastSubscribe(bridge)).toEqual({symbols:['GME','SPY'],quotes:true,quotesFor:['SPY']});
   // A watchlist row (a yielding feed) shows AAPL.
   const aapl=provider.open('AAPL','1D',{yielding:true});await flush();
   expect(lastSubscribe(bridge)).toEqual({symbols:['AAPL','GME','SPY'],quotes:true,quotesFor:['AAPL','SPY']});
   // Two listeners for one instrument are one change; the last one leaving is another.
   const calls=(bridge.subscribeAlpaca as any).mock.calls.length;
   const second=liveQuotes.subscribe('US:SPY',()=>undefined);await flush();
   expect((bridge.subscribeAlpaca as any).mock.calls.length).toBe(calls);
   off();second();await flush();
   expect(lastSubscribe(bridge)).toEqual({symbols:['AAPL','GME','SPY'],quotes:true,quotesFor:['AAPL']});
   aapl.close();await flush();
   expect(lastSubscribe(bridge)).toEqual({symbols:['GME','SPY'],quotes:true});
   // A listener for a symbol the provider does not stream adds nothing.
   const other=liveQuotes.subscribe('US:MSFT',()=>undefined);await flush();
   expect(lastSubscribe(bridge)).toEqual({symbols:['GME','SPY'],quotes:true});
   other();gme.close();spy.close();
  }finally{provider.dispose();}
 });
 it('the store reports watched instruments and notifies only on the first and last listener',()=>{
  const store=new LiveQuoteStore(),changes=vi.fn(),off=store.onWatchedChange(changes);
  expect(store.isWatched('US:GME')).toBe(false);
  const a=store.subscribe('US:GME',()=>undefined),b=store.subscribe('US:GME',()=>undefined);
  expect(store.isWatched('US:GME')).toBe(true);expect(changes).toHaveBeenCalledTimes(1);
  a();expect(changes).toHaveBeenCalledTimes(1);b();expect(changes).toHaveBeenCalledTimes(2);expect(store.isWatched('US:GME')).toBe(false);
  b();expect(changes).toHaveBeenCalledTimes(2);
  off();store.subscribe('US:SPY',()=>undefined);expect(changes).toHaveBeenCalledTimes(2);
 });
});

describe('Coinbase quotes leave with their product (F8)',()=>{
 it('closing a product clears its quote at once and keeps the others',async()=>{
  let listener:((event:CoinbaseEvent)=>void)|null=null;
  const bridge={fetchCoinbaseCandles:vi.fn(async(input:any)=>({ok:true as const,value:{schemaVersion:1,productId:input.productId,granularity:'FIVE_MINUTE',seconds:300,bars:[],provenance:{}}})),subscribeCoinbase:vi.fn(async(input:{productIds:string[]})=>({ok:true as const,value:{schemaVersion:1,state:'ready',productIds:input.productIds,attempt:0,lastMessageAt:null,liveMessages:true,lastError:null,counters:{}}})),unsubscribeCoinbase:vi.fn(async()=>({ok:true as const,value:null})),onCoinbaseEvent:vi.fn((handler:(event:CoinbaseEvent)=>void)=>{listener=handler;return()=>{listener=null;};})} as unknown as CoinbaseBridge;
  const provider=new CoinbaseLiveProvider(bridge as never),btc=provider.open('BTC-USD','5m'),eth=provider.open('ETH-USD','5m');await flush();
  listener!({schemaVersion:1,kind:'batch',candles:[],tickers:[{productId:'BTC-USD',price:50000.1,time:NOW_S,high:50000.1,low:50000.1,bid:50000,ask:50000.2},{productId:'ETH-USD',price:3000.5,time:NOW_S,high:3000.5,low:3000.5,bid:3000.4,ask:3000.6}],gap:false,receivedAt:new Date(NOW).toISOString()});
  expect(liveQuotes.get('COINBASE:ETH-USD')).toMatchObject({bid:3000.4,ask:3000.6});
  eth.close();
  expect(liveQuotes.get('COINBASE:ETH-USD')).toBeNull();
  expect(liveQuotes.get('COINBASE:BTC-USD')).toMatchObject({bid:50000,ask:50000.2});
  btc.close();
  expect(liveQuotes.get('COINBASE:BTC-USD')).toBeNull();
 });
});
