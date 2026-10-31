import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {AlpacaMarketData,subscribeInput,subscribeQuotesInput}=require('../../electron/public-alpaca.cjs');
const {CoinbasePublicFeed}=require('../../electron/public-coinbase.cjs');
const {FeedShare}=require('../../electron/windows.cjs');

// Synthetic key material and a fake socket only. No Alpaca or Coinbase endpoint is called.
const KEY_ID='SYNTHETICKEY0000ABCD',SECRET='SyntheticSecretNotARealKey0000000000000000';
class MemoryKeys{async load(){return{keyId:KEY_ID,secret:SECRET};}}
class FakeSocket{
 static all:FakeSocket[]=[];sent:any[]=[];closed=false;onopen:any;onmessage:any;onclose:any;onerror:any;
 constructor(public url:string){FakeSocket.all.push(this);}
 send(text:string){this.sent.push(JSON.parse(text));}close(){this.closed=true;}
 open(){this.onopen?.({});}message(value:unknown){this.onmessage?.({data:JSON.stringify(value)});}
}
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
const NOW=Date.UTC(2026,9,20,15,0,0);
beforeEach(()=>{FakeSocket.all=[];vi.useFakeTimers();vi.setSystemTime(NOW);});
afterEach(()=>vi.useRealTimers());
async function ready(input:Record<string,unknown>){
 const events:any[]=[],client=new AlpacaMarketData({keys:new MemoryKeys(),WebSocketImpl:FakeSocket,emit:(e:any)=>events.push(e),random:()=>1,fetchImpl:vi.fn()});
 await client.subscribe(input);await flush();const socket=FakeSocket.all.at(-1)!;socket.open();socket.message([{T:'success',msg:'connected'}]);socket.message([{T:'success',msg:'authenticated'}]);
 return {client,socket,events,batches:()=>events.filter(e=>e.kind==='batch')};
}
const iso=(ms:number)=>new Date(ms).toISOString();

describe(' Alpaca quote channel (main process)',()=>{
 it('validates the quotes flag strictly and keeps the old subscribe shape without it',()=>{
  expect(subscribeQuotesInput({symbols:['GME']})).toBe(false);
  expect(subscribeQuotesInput({symbols:['GME'],quotes:true})).toBe(true);
  expect(()=>subscribeInput({symbols:['GME'],quotes:'yes'})).toThrow(/true or false/);
  expect(()=>subscribeInput({symbols:['GME'],extra:1})).toThrow();
 });
 it('subscribes quotes with bars and trades on the same symbols, and toggles them without touching the bar channels',async()=>{
  const {client,socket}=await ready({symbols:['GME','SPY'],quotes:true});
  try{
   expect(socket.sent.at(-1)).toEqual({action:'subscribe',bars:['GME','SPY'],updatedBars:['GME','SPY'],dailyBars:['GME','SPY'],trades:['GME','SPY'],quotes:['GME','SPY']});
   await client.subscribe({symbols:['GME','SPY','GME.WS'],quotes:true});
   expect(socket.sent.at(-1)).toEqual({action:'subscribe',bars:['GME.WS'],updatedBars:['GME.WS'],dailyBars:['GME.WS'],trades:['GME.WS'],quotes:['GME.WS']});
   await client.subscribe({symbols:['GME','GME.WS','SPY']});
   expect(socket.sent.at(-1)).toEqual({action:'unsubscribe',quotes:['GME','GME.WS','SPY']});
  }finally{client.close();}
 });
 it('the SIP stream (paid plan) carries the quote channel too',async()=>{
  const {client,socket}=await ready({symbols:['GME'],feed:'sip',quotes:true});
  try{expect(socket.url).toMatch(/\/v2\/sip$/);expect(socket.sent.at(-1).quotes).toEqual(['GME']);}finally{client.close();}
 });
 it('coalesces to the newest quote per symbol per flush (at most 4 a second) and drops unusable quotes',async()=>{
  const {client,socket,batches}=await ready({symbols:['GME','SPY'],quotes:true});
  try{
   const q=(S:string,ms:number,bp:number,ap:number,extra:Record<string,unknown>={})=>({T:'q',S,bx:'V',bp,bs:3,ax:'V',ap,as:5,t:iso(ms),c:['R'],z:'C',...extra});
   for(let i=0;i<20;i++)socket.message([q('GME',NOW-1000+i,Number((20+i/100).toFixed(2)),Number((20.05+i/100).toFixed(2)))]);
   socket.message([q('SPY',NOW-500,500,500.02),q('SPY',NOW-900,499,499.5)]); // an older quote never replaces a newer one
   socket.message([q('SPY',NOW-100,0,0)]);                                     // no side: dropped
   socket.message([q('SPY',NOW-50,501,500)]);                                  // crossed: dropped
   vi.advanceTimersByTime(250);
   expect(batches()).toHaveLength(1);
   const rows=batches()[0].quotes;
   expect(rows).toEqual([
    {symbol:'GME',time:Math.floor((NOW-981)/1000),timeMs:NOW-981,bid:20.19,ask:20.24,bidSize:3,askSize:5,feed:'iex'},
    {symbol:'SPY',time:Math.floor((NOW-500)/1000),timeMs:NOW-500,bid:500,ask:500.02,bidSize:3,askSize:5,feed:'iex'},
   ]);
   socket.message([q('GME',NOW,0,20.3)]);vi.advanceTimersByTime(250);
   expect(batches()[1].quotes).toEqual([{symbol:'GME',time:Math.floor(NOW/1000),timeMs:NOW,bid:null,ask:20.3,bidSize:null,askSize:5,feed:'iex'}]);
   // A batch without quotes keeps the earlier shape (no quotes key).
   socket.message([{T:'t',S:'GME',i:1,x:'V',p:20.2,s:1,t:iso(NOW),z:'C'}]);vi.advanceTimersByTime(250);
   expect('quotes' in batches()[2]).toBe(false);
  }finally{client.close();}
 });
 it('refuses a quote for an unsubscribed symbol, or any quote when the channel is off',async()=>{
  const {client,socket,batches}=await ready({symbols:['GME']});
  try{
   const before=client.status().counters.rejected;
   socket.message([{T:'q',S:'GME',bp:1,ap:1.01,bs:1,as:1,t:iso(NOW)},{T:'q',S:'AAPL',bp:1,ap:1.01,bs:1,as:1,t:iso(NOW)}]);
   vi.advanceTimersByTime(250);
   expect(client.status().counters.rejected).toBe(before+2);expect(batches()).toHaveLength(0);
  }finally{client.close();}
 });
});

describe(' window feed share and Coinbase best bid and ask',()=>{
 it('each window receives only the quotes of its own symbols',async()=>{
  const feed={subscribe:vi.fn(async()=>({ok:true,value:{symbols:[]}})),status:()=>({symbols:[]}),unsubscribe:vi.fn()};
  const share=new FeedShare({listKey:'symbols',itemKey:'symbol',max:30,rows:['bars','trades','quotes'],validate:(raw:any)=>({list:raw.symbols,extra:raw.quotes?{quotes:true}:{}}),feed:()=>feed,existing:()=>feed});
  await share.subscribe('a',{symbols:['GME'],quotes:true});await share.subscribe('b',{symbols:['SPY'],quotes:true});
  expect(feed.subscribe).toHaveBeenLastCalledWith({symbols:['GME','SPY'],quotes:true});
  const event={schemaVersion:1,kind:'batch',bars:[],trades:[],quotes:[{symbol:'GME',bid:1},{symbol:'SPY',bid:2}],receivedAt:iso(NOW)};
  expect(share.eventFor('a',event).quotes).toEqual([{symbol:'GME',bid:1}]);
  expect(share.eventFor('b',event).quotes).toEqual([{symbol:'SPY',bid:2}]);
  const source=require('node:fs').readFileSync(require.resolve('../../electron/windows.cjs'),'utf8');
  expect(source).toContain("rows: ['bars', 'trades', 'quotes']");
 });
 it('carries the ticker best bid and ask when present and refuses a crossed pair',()=>{
  const emitted:any[]=[],feed=new CoinbasePublicFeed({emit:(e:any)=>emitted.push(e),WebSocketImpl:FakeSocket,fetchImpl:vi.fn(),now:()=>NOW});
  try{
   (feed as any).products=['BTC-USD'];
   const ticker=(fields:Record<string,unknown>)=>({channel:'ticker',timestamp:iso(NOW),sequence_num:1,events:[{type:'update',tickers:[{product_id:'BTC-USD',price:'50000.10',...fields}]}]});
   (feed as any).acceptTicker(ticker({best_bid:'50000.00',best_bid_quantity:'0.5',best_ask:'50000.20',best_ask_quantity:'0.25'}));
   (feed as any).acceptTicker(ticker({}));
   (feed as any).flush();
   expect(emitted.at(-1).tickers[0]).toMatchObject({productId:'BTC-USD',price:50000.1,bid:50000,ask:50000.2,bidSize:0.5,askSize:0.25});
   expect(()=>(feed as any).acceptTicker(ticker({best_bid:'50001.00',best_ask:'50000.00'}))).toThrow(/crossed/);
  }finally{feed.close?.();}
 });
});
