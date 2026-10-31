import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const alpaca=require('../../electron/public-alpaca.cjs');
const {AlpacaMarketData,subscribeInput,subscribeQuotesForInput,quoteOnlyFrame}=alpaca;
const {CoinbasePublicFeed}=require('../../electron/public-coinbase.cjs');
const {FeedShare}=require('../../electron/windows.cjs');

// Synthetic key material and a fake socket only. No Alpaca or Coinbase endpoint is
// called and no real key is read. Every frame below is invented.
const KEY_ID='SYNTHETICKEY0000ABCD',SECRET='SyntheticSecretNotARealKey0000000000000000';
class MemoryKeys{async load(){return{keyId:KEY_ID,secret:SECRET};}}
class FakeSocket{
 static all:FakeSocket[]=[];sent:any[]=[];closed=false;onopen:any;onmessage:any;onclose:any;onerror:any;
 constructor(public url:string){FakeSocket.all.push(this);}
 send(text:string){this.sent.push(JSON.parse(text));}close(){this.closed=true;}
 open(){this.onopen?.({});}message(value:unknown){this.onmessage?.({data:typeof value==='string'?value:JSON.stringify(value)});}
}
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
const NOW=Date.UTC(2026,9,20,15,0,0);
beforeEach(()=>{FakeSocket.all=[];vi.useFakeTimers();vi.setSystemTime(NOW);});
afterEach(()=>vi.useRealTimers());
async function ready(input:Record<string,unknown>){
 const events:any[]=[],client=new AlpacaMarketData({keys:new MemoryKeys(),WebSocketImpl:FakeSocket,emit:(e:any)=>events.push(e),random:()=>1,fetchImpl:vi.fn()});
 await client.subscribe(input);await settle();const socket=FakeSocket.all.at(-1)!;socket.open();socket.message([{T:'success',msg:'connected'}]);socket.message([{T:'success',msg:'authenticated'}]);
 return {client,socket,events,batches:()=>events.filter(e=>e.kind==='batch')};
}
const iso=(ms:number)=>new Date(ms).toISOString();
const quoteFrame=(S:string,ms:number,bp:number)=>JSON.stringify([{T:'q',S,bx:'V',bp,bs:3,ax:'V',ap:Number((bp+0.02).toFixed(2)),as:5,t:iso(ms),c:['R'],z:'C'}]);
const tradeFrame=(S:string,ms:number,i:number)=>JSON.stringify([{T:'t',S,i,x:'V',p:20+(i%7)/100,s:1,t:iso(ms),c:['@'],z:'C'}]);
// A closed minute bar with its own (past) minute, so every bar frame is a distinct row in the batches.
const MINUTE=Math.floor(NOW/60000)*60;
const barFrame=(S:string,k:number)=>JSON.stringify([{T:'b',S,o:20,h:20.5,l:19.5,c:20.1,v:100+k,n:3,vw:20.05,t:iso((MINUTE-60*(k+1))*1000)}]);
const elapsedMs=(start:bigint)=>Number(process.hrtime.bigint()-start)/1e6;

/** One simulated second of a busy open: `quotesPerSecond` quote-only frames spread over the second (SPY most), a trade
 * frame every 20 ms per symbol (150 a second), and one closed-bar frame per symbol at mid-second. Returns the counts sent
 * and the wall time spent inside the socket handler. */
function busySecond(socket:FakeSocket,second:number,quotesPerSecond:number,quoted:string[]=['SPY','GME','AAPL']){
 const symbols=['SPY','GME','AAPL'];let trades=0,bars=0,quotes=0,handlerMs=0;const newest:Record<string,number>={};
 const perMs=quotesPerSecond/1000;let owed=0;
 for(let ms=0;ms<1000;ms++){
  const at=NOW+second*1000+ms,start=process.hrtime.bigint();
  owed+=perMs;
  while(owed>=1){owed--;const symbol=quoted.length?(quotes%10<7?quoted[0]:quoted[quotes%quoted.length]):null;if(symbol){const bp=Number((20+(quotes%500)/100).toFixed(2));socket.message(quoteFrame(symbol,at,bp));newest[symbol]=bp;}quotes++;}
  if(ms%20===0)for(const symbol of symbols){socket.message(tradeFrame(symbol,at,second*1000+ms));trades++;}
  if(ms===500)for(const symbol of symbols){socket.message(barFrame(symbol,second));bars++;}
  handlerMs+=elapsedMs(start);
  vi.advanceTimersByTime(1);
 }
 return {trades,bars,quotes,handlerMs,newest};
}
const tradeSize=(batches:any[])=>batches.reduce((sum,b)=>sum+b.trades.reduce((s:number,t:any)=>s+t.size,0),0);
const barRows=(batches:any[])=>new Set(batches.flatMap(b=>b.bars.map((row:any)=>row.symbol+'|'+row.time))).size;

describe('quotes never use up the bar and trade budget (F6)',()=>{
 it('2,000 quote frames a second plus a steady stream of bars and trades: zero bars or trades lost, quotes coalesced, main responsive',async()=>{
  const {client,socket,batches}=await ready({symbols:['AAPL','GME','SPY'],quotes:true});
  try{
   let sentTrades=0,sentBars=0,worstSecondMs=0;let newest:Record<string,number>={};
   for(let second=0;second<3;second++){const run=busySecond(socket,second,2000);sentTrades+=run.trades;sentBars+=run.bars;worstSecondMs=Math.max(worstSecondMs,run.handlerMs);newest=run.newest;}
   vi.advanceTimersByTime(250);
   const out=batches();
   // Nothing that carries a bar or a trade was dropped.
   expect(client.status().counters.dropped).toBe(0);
   expect(tradeSize(out)).toBe(sentTrades);
   expect(barRows(out)).toBe(sentBars);
   // At this rate no quote frame was shed either, and nothing was unsubscribed.
   expect(client.status().counters.quotesDropped).toBe(0);
   expect(client.status().quoteLevel).toBe('all');
   expect(socket.sent.filter(m=>m.action==='unsubscribe')).toEqual([]);
   // Coalesced: one quote per symbol per 250 ms flush at most, and the last one is the newest sent.
   for(const batch of out)if(batch.quotes){const symbols=batch.quotes.map((q:any)=>q.symbol);expect(new Set(symbols).size).toBe(symbols.length);}
   const quoteBatches=out.filter(b=>b.quotes);
   expect(quoteBatches.length).toBeLessThanOrEqual(3*4+1);
   expect(quoteBatches.at(-1).quotes.find((q:any)=>q.symbol==='SPY').bid).toBe(newest.SPY);
   // 6,000 quotes reached the renderer as at most 3 rows per flush.
   expect(quoteBatches.reduce((n,b)=>n+b.quotes.length,0)).toBeLessThanOrEqual(quoteBatches.length*3);
   // Responsive: one simulated second of this traffic costs main far less than one 250 ms flush interval.
   expect(worstSecondMs).toBeLessThan(250);
  }finally{client.close();}
 });

 it('quote overload sheds quotes first (off-screen symbols, then every quote), never bars or trades, and recovers a level later',async()=>{
  const {client,socket,batches,events}=await ready({symbols:['AAPL','GME','SPY'],quotes:true,quotesFor:['SPY']});
  try{
   expect(socket.sent.at(-1)).toEqual({action:'subscribe',bars:['AAPL','GME','SPY'],updatedBars:['AAPL','GME','SPY'],dailyBars:['AAPL','GME','SPY'],trades:['AAPL','GME','SPY'],quotes:['AAPL','GME','SPY']});
   let sentTrades=0,sentBars=0;
   // Second 0: 6,000 quote frames, over the quote budget.
   let run=busySecond(socket,0,6000);sentTrades+=run.trades;sentBars+=run.bars;
   expect(client.status().counters.quotesDropped).toBeGreaterThan(0);
   // Second 1 begins: the stream sheds the off-screen symbols' quotes, with a quote-only message.
   run=busySecond(socket,1,6000,['SPY']);sentTrades+=run.trades;sentBars+=run.bars;
   expect(socket.sent).toContainEqual({action:'unsubscribe',quotes:['AAPL','GME']});
   expect(client.status().quoteLevel).not.toBe('all');
   // Still over budget on SPY alone: second 2 sheds every quote.
   run=busySecond(socket,2,0);sentTrades+=run.trades;sentBars+=run.bars;
   expect(socket.sent).toContainEqual({action:'unsubscribe',quotes:['SPY']});
   expect(client.status().quoteLevel).toBe('none');
   expect(client.status().counters.quoteSheds).toBe(2);
   vi.advanceTimersByTime(250);
   // The bar and trade channels were never unsubscribed, and every bar and trade arrived.
   expect(socket.sent.filter(m=>m.bars||m.trades||m.updatedBars||m.dailyBars).length).toBe(1);
   expect(client.status().counters.dropped).toBe(0);
   expect(tradeSize(batches())).toBe(sentTrades);
   expect(barRows(batches())).toBe(sentBars);
   expect(events.some(e=>e.kind==='status'&&e.status.quoteLevel==='none')).toBe(true);
   // Five quiet minutes later the next frame steps back one level: on-screen quotes (SPY) return.
   vi.advanceTimersByTime(5*60*1000);
   socket.message(tradeFrame('GME',Date.now(),99999));
   expect(socket.sent.at(-1)).toEqual({action:'subscribe',quotes:['SPY']});
   expect(client.status().quoteLevel).toBe('shown');
   // A symbol added while shed gets bars and trades, and a quote channel only if it is on screen.
   await client.subscribe({symbols:['AAPL','GME','MSFT','SPY'],quotes:true,quotesFor:['SPY']});
   expect(socket.sent.at(-1)).toEqual({action:'subscribe',bars:['MSFT'],updatedBars:['MSFT'],dailyBars:['MSFT'],trades:['MSFT']});
   await client.subscribe({symbols:['AAPL','GME','MSFT','SPY'],quotes:true,quotesFor:['MSFT','SPY']});
   expect(socket.sent.at(-1)).toEqual({action:'subscribe',quotes:['MSFT']});
  }finally{client.close();}
 });

 it('a bar or trade frame dropped by its own budget while quotes flow also sheds quotes',async()=>{
  const {client,socket}=await ready({symbols:['GME','SPY'],quotes:true});
  try{
   // The two sign-in frames of this second count too: 198 trade frames fit the 200 a second bar and trade budget.
   for(let i=0;i<250;i++)socket.message(tradeFrame('GME',NOW,i));
   expect(client.status().counters.dropped).toBe(250-(alpaca.WS_MAX_MESSAGES_PER_SECOND-2));
   vi.advanceTimersByTime(1000);socket.message(tradeFrame('GME',Date.now(),1000));
   // No symbol is on screen (no quotesFor), so the on-screen level keeps no quote at all.
   expect(socket.sent.at(-1)).toEqual({action:'unsubscribe',quotes:['GME','SPY']});
   expect(client.status().quoteLevel).toBe('shown');
  }finally{client.close();}
 });

 it('the hard cap still bounds a broken or hostile stream (frames and bytes), quote-only or not',async()=>{
  const {client,socket}=await ready({symbols:['GME','SPY'],quotes:true});
  try{
   let start=process.hrtime.bigint();
   for(let i=0;i<50000;i++)socket.message('[{"T":"x","S":"GME"}]');
   const junkMs=elapsedMs(start);
   expect(client.status().counters.dropped).toBe(50000-(alpaca.WS_MAX_MESSAGES_PER_SECOND-2));
   expect(junkMs).toBeLessThan(1000);
   vi.advanceTimersByTime(1000);
   // Half-megabyte quote-only frames: the quote byte budget lets only a few be parsed each second.
   const item=JSON.parse(quoteFrame('SPY',Date.now(),20))[0],big=JSON.stringify(Array.from({length:1000},()=>item));
   const huge='['+Array.from({length:Math.ceil(512*1024/big.length)},()=>big.slice(1,-1)).join(',')+']';
   const before=client.status().counters.quotesDropped;
   start=process.hrtime.bigint();
   for(let i=0;i<20;i++)socket.message(huge);
   expect(client.status().counters.quotesDropped-before).toBeGreaterThanOrEqual(20-Math.ceil(alpaca.WS_MAX_QUOTE_BYTES_PER_SECOND/huge.length));
   expect(elapsedMs(start)).toBeLessThan(1000);
   expect(alpaca.WS_HARD_MESSAGES_PER_SECOND).toBeGreaterThan(alpaca.WS_MAX_QUOTE_MESSAGES_PER_SECOND+alpaca.WS_MAX_MESSAGES_PER_SECOND);
   expect(alpaca.WS_HARD_BYTES_PER_SECOND).toBeGreaterThan(alpaca.WS_MAX_QUOTE_BYTES_PER_SECOND);
  }finally{client.close();}
 });

 it('classifies frames conservatively: only a frame whose every type is a quote is quote-only',()=>{
  expect(quoteOnlyFrame('[{"T":"q","S":"SPY"},{"T":"q","S":"GME"}]')).toBe(true);
  expect(quoteOnlyFrame('[{"T" : "q","S":"SPY"}]')).toBe(true);
  expect(quoteOnlyFrame('[{"T":"q","S":"SPY"},{"T":"t","S":"SPY"}]')).toBe(false);
  expect(quoteOnlyFrame('[{"T":"b","S":"SPY"}]')).toBe(false);
  expect(quoteOnlyFrame('[{"T":"success","msg":"authenticated"}]')).toBe(false);
  expect(quoteOnlyFrame('[{"S":"SPY"}]')).toBe(false);
  // An escape could hide a type key ("T" is T): never quote-only.
  expect(quoteOnlyFrame('[{"T":"q","S":"SPY"},{"\\u0054":"b","S":"SPY"}]')).toBe(false);
  // AT&T's symbol is T: a value is not a key.
  expect(quoteOnlyFrame('[{"T":"q","S":"T"}]')).toBe(true);
  expect(quoteOnlyFrame('[{"T":"q","S":"T"},{"T":"t","S":"T"}]')).toBe(false);
 });

 it('validates quotesFor strictly: subscribed symbols only, no duplicates, and it never adds a subscription',async()=>{
  expect(subscribeQuotesForInput({symbols:['GME']})).toEqual([]);
  expect(subscribeQuotesForInput({symbols:['GME','SPY'],quotesFor:['SPY','GME']})).toEqual(['GME','SPY']);
  expect(subscribeInput({symbols:['GME','SPY'],quotes:true,quotesFor:['SPY']})).toEqual(['GME','SPY']);
  expect(()=>subscribeInput({symbols:['GME'],quotesFor:['SPY']})).toThrow(/subscribed symbols/);
  expect(()=>subscribeInput({symbols:['GME'],quotesFor:'GME'})).toThrow(/at most 30/);
  expect(()=>subscribeInput({symbols:['GME'],quotesFor:['GME','GME']})).toThrow(/Duplicate/);
  expect(()=>subscribeInput({symbols:['GME'],quotesFor:['../x']})).toThrow();
  const {client,socket}=await ready({symbols:['GME','SPY'],quotes:true,quotesFor:['SPY']});
  try{
   const sent=socket.sent.length;
   await client.subscribe({symbols:['GME','SPY'],quotes:true,quotesFor:['GME']});
   expect(socket.sent.length).toBe(sent); // nothing is shed, so a new on-screen list sends nothing
  }finally{client.close();}
 });

 it('the window feed share sends the union of every window\'s on-screen quote symbols, and drops a window\'s on release',async()=>{
  const feed={subscribe:vi.fn(async()=>({ok:true,value:{symbols:[]}})),status:()=>({symbols:[]}),unsubscribe:vi.fn()};
  const share=new FeedShare({listKey:'symbols',itemKey:'symbol',max:30,rows:['bars','trades','quotes'],priorityKey:'quotesFor',validate:(raw:any)=>({list:raw.symbols,extra:raw.quotes?{quotes:true}:{},priority:raw.quotesFor??[]}),feed:()=>feed,existing:()=>feed});
  await share.subscribe('a',{symbols:['GME','SPY'],quotes:true,quotesFor:['GME']});
  await share.subscribe('b',{symbols:['AAPL'],quotes:true,quotesFor:['AAPL']});
  expect(feed.subscribe).toHaveBeenLastCalledWith({symbols:['AAPL','GME','SPY'],quotes:true,quotesFor:['AAPL','GME']});
  await share.release('b');
  expect(feed.subscribe).toHaveBeenLastCalledWith({symbols:['GME','SPY'],quotes:true,quotesFor:['GME']});
  await share.subscribe('a',{symbols:['GME','SPY'],quotes:true});
  expect(feed.subscribe).toHaveBeenLastCalledWith({symbols:['GME','SPY'],quotes:true});
  const source=require('node:fs').readFileSync(require.resolve('../../electron/windows.cjs'),'utf8');
  expect(source).toContain("priorityKey: 'quotesFor'");
  const main=require('node:fs').readFileSync(require.resolve('../../electron/main.cjs'),'utf8');
  expect(main).toContain('priority:Array.isArray(raw.quotesFor)?[...raw.quotesFor].sort():[]');
 });
});

describe('Coinbase keeps the price when the best bid and ask are unusable (F7)',()=>{
 it('a crossed or malformed best bid and ask drops only the quote fields, and is still counted as rejected',()=>{
  const emitted:any[]=[],feed=new CoinbasePublicFeed({emit:(e:any)=>emitted.push(e),WebSocketImpl:FakeSocket,fetchImpl:vi.fn(),now:()=>NOW});
  try{
   (feed as any).products=['BTC-USD','ETH-USD'];
   const ticker=(seq:number,rows:Array<Record<string,unknown>>)=>JSON.stringify({channel:'ticker',timestamp:iso(NOW),sequence_num:seq,events:[{type:'update',tickers:rows}]});
   (feed as any).receive(ticker(1,[{product_id:'BTC-USD',price:'50000.10',best_bid:'50001.00',best_ask:'50000.00'},{product_id:'ETH-USD',price:'3000.50',best_bid:'3000.40',best_ask:'3000.60'}]));
   (feed as any).flush();
   const rows=emitted.at(-1).tickers;
   expect(rows.find((r:any)=>r.productId==='BTC-USD')).toEqual({productId:'BTC-USD',price:50000.1,time:Math.floor(NOW/1000),high:50000.1,low:50000.1});
   expect(rows.find((r:any)=>r.productId==='ETH-USD')).toMatchObject({price:3000.5,bid:3000.4,ask:3000.6});
   expect(feed.status().counters.rejected).toBe(1);
   (feed as any).receive(ticker(2,[{product_id:'BTC-USD',price:'50000.20',best_bid:'not a number',best_ask:'50000.30'}]));
   (feed as any).flush();
   expect(emitted.at(-1).tickers).toEqual([{productId:'BTC-USD',price:50000.2,time:Math.floor(NOW/1000),high:50000.2,low:50000.2}]);
   expect(feed.status().counters.rejected).toBe(2);
   // A bad price still refuses the ticker, as before.
   (feed as any).receive(ticker(3,[{product_id:'BTC-USD',price:'-1',best_bid:'1',best_ask:'2'}]));
   (feed as any).flush();
   expect(emitted.at(-1).tickers[0].price).toBe(50000.2);
   expect(feed.status().counters.rejected).toBe(3);
  }finally{feed.close?.();}
 });
});
