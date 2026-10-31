import {afterEach,expect,it} from 'vitest';
import {bootSyntheticClock,REGULAR_EPOCH,CLOSED_EPOCH,pause} from '../fixtures/r43-synthetic-clock';
import {AlpacaLiveProvider,alpacaMarketNow,alpacaStatusLabel,selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import {readSyntheticMarketClock} from '../../src/domain/synthetic-market-clock';
import {usMarketSession} from '../../src/domain/us-market-hours';
import {liveQuotes,liveQuoteFresh} from '../../src/domain/live-quotes';
import {paperFeedInput} from '../../src/domain/paper-feed-source';
import {feedPaperBars} from '../../src/domain/paper-bar-feed';
import {createPaperAccount,submitPaperOrder} from '../../src/domain/paper';
import {clearLiveDatasets} from '../../src/ui/live-registry';
import {completedBarsDataset} from '../../src/domain/live-provider';

afterEach(()=>{selectAlpacaSyntheticStub(false);clearLiveDatasets();liveQuotes.reset();});
it('regular clock reaches the real main request validation instead of the host fallback',async()=>{
 const hostTime=REGULAR_EPOCH-3*86400000,main=await bootSyntheticClock('regular',()=>hostTime);
 try{const response=await main.lv.fetchAlpacaBars({requestId:'clock-business-boundary',symbol:'GME',timeframe:'1Min',feed:'iex',start:REGULAR_EPOCH/1000-3600,end:REGULAR_EPOCH/1000});
  // The fixture fallback host clock is three days earlier. The real barsInput must see the admitted regular clock instead.
  expect(response.ok).toBe(true);expect(response.value.bars).toHaveLength(60);expect(response.value.bars.at(-1).time).toBe(REGULAR_EPOCH/1000-60);
  expect(main.feeds[0].marketNow()).toBe(REGULAR_EPOCH);expect(main.feeds[0].now()).toBe(hostTime);
 }finally{await main.close();}
});
it.each(['regular','closed'] as const)('shares the %s clock through actual main, preload, renderer history and paper policy',async scenario=>{
 const main=await bootSyntheticClock(scenario);let provider:AlpacaLiveProvider|null=null;
 try{
  const status=await main.lv.alpacaKeyStatus();expect(status.ok).toBe(true);const start=scenario==='regular'?REGULAR_EPOCH:CLOSED_EPOCH;
  expect(status.value.syntheticClock).toEqual({scenario,nowMs:start});
  const clock=readSyntheticMarketClock(status.value,()=>main.elapsed.ms)!;selectAlpacaSyntheticStub(true,clock);
  provider=new AlpacaLiveProvider(main.lv);const handle=provider.open('GME','1m');
  try{
   for(let turn=0;turn<250&&(!handle.dataset().bars.length||!main.sockets.some(socket=>socket.authenticated&&socket.symbols.size));turn++)await pause(10);
   expect(handle.dataset().bars.length).toBeGreaterThan(0);expect(handle.dataset().bars.at(-1)!.time).toBe(start/1000-60);
   expect(alpacaMarketNow()).toBe(start);expect(usMarketSession(alpacaMarketNow())).toBe(scenario==='regular'?'regular':'closed');
   const first=handle.dataset().bars.at(-1)!.close,before=Date.now();
   const wire=await main.step(2),trade=wire.find(row=>row.T==='t'&&row.S==='GME');expect(trade).toBeTruthy();expect(Date.parse(trade.t)).toBe(start+2000);
   const dataset=handle.dataset();expect(dataset.bars.at(-1)!.close).toBe(trade.p);expect(dataset.bars.at(-1)!.time).toBe(start/1000);
   expect(dataset.provenance.asOf).toBe(start/1000+2);expect(dataset.bars.at(-1)!.time+60).toBeGreaterThan(dataset.provenance.asOf);
   expect(completedBarsDataset(dataset).bars).toEqual(dataset.bars.slice(0,-1));
   expect(dataset.bars.at(-1)!.close).not.toBe(first);expect(dataset.provenance.fixture).toBe(false);expect(dataset.provenance.providerId).toBe('alpaca-stub');
   expect(alpacaStatusLabel(dataset.provenance)).toBe(scenario==='regular'?'Live':'Market closed');
   const quote=liveQuotes.get(dataset.instrument.id);expect(quote).toBeTruthy();expect(quote!.time).toBe(start/1000+2);expect(quote!.receivedAt).toBeGreaterThanOrEqual(before);expect(quote!.receivedAt).toBeLessThanOrEqual(Date.now());expect(liveQuoteFresh(quote,Date.now())).toBe(true);
   const input=paperFeedInput({dataset,bars:dataset.bars,replay:false,fine:null,forming:null})!,fed=feedPaperBars(createPaperAccount(),input);expect(fed.ok).toBe(true);
   const retained=fed.account.quotes[dataset.instrument.id];expect(retained.fixture).toBe(false);expect(retained.session).toBe(scenario==='regular'?'regular':'unknown');
   const order=submitPaperOrder(fed.account,{instrument:dataset.instrument,side:'buy',type:'market',quantity:1},fed.account.clock);expect(order.ok).toBe(true);
   expect(order.account.orders[0].status).toBe(scenario==='regular'?'filled':'working');expect(order.account.fills).toHaveLength(scenario==='regular'?1:0);
  }finally{handle.close();}
 }finally{provider?.dispose();await main.close();}
},60000);
it('uses the same explicit clock for the actual corporate-action cache day and advances status samples',async()=>{
 const main=await bootSyntheticClock('closed');
 try{
  const before=Date.now(),response=await main.lv.fetchAlpacaCorporateActions({requestId:'clock-actions',symbol:'GME'});expect(response.ok).toBe(true);
  expect(main.actions[0].marketNow()).toBe(CLOSED_EPOCH);expect(Date.parse(response.value.retrievedAt)).toBeGreaterThanOrEqual(before);expect(Date.parse(response.value.retrievedAt)).toBeLessThanOrEqual(Date.now());expect((await main.actions[0].readCache('GME')).day).toBe('2026-10-20');
  main.elapsed.ms+=2000;expect((await main.lv.alpacaKeyStatus()).value.syntheticClock).toEqual({scenario:'closed',nowMs:CLOSED_EPOCH+2000});expect(main.actions[0].marketNow()).toBe(CLOSED_EPOCH+2000);
 }finally{await main.close();}
});
it('preserves the ordinary main/preload key-status shape when no clock scenario was requested',async()=>{
 const main=await bootSyntheticClock(undefined,()=>REGULAR_EPOCH);
 try{expect((await main.lv.alpacaKeyStatus()).value).toEqual({configured:true,keyIdHint:'****STUB',encryption:true,synthetic:true});
  const bars=await main.lv.fetchAlpacaBars({requestId:'clock-default-now',symbol:'GME',timeframe:'1Min',feed:'iex',start:REGULAR_EPOCH/1000-3600,end:REGULAR_EPOCH/1000});expect(bars.ok).toBe(true);expect(main.feeds[0].marketNow).toBe(main.feeds[0].now);
 }finally{await main.close();}
});
it('keeps arrival, REST backoff and socket budget windows on the independent receipt clock',async()=>{
 const receipt={ms:Date.now()},main=await bootSyntheticClock('regular',()=>receipt.ms),events:any[]=[];
 const off=main.lv.onAlpacaEvent((event:any)=>events.push(event));
 try{
  await main.lv.subscribeAlpaca({symbols:['GME'],quotes:true});for(let turn=0;turn<200&&!main.sockets.some(socket=>socket.authenticated&&socket.symbols.size);turn++)await pause(5);
  await main.step(1);const feed=main.feeds[0],windowStart=feed.rateWindow.start;
  expect(windowStart).toBe(receipt.ms);expect(feed.status().lastMessageAt).toBe(receipt.ms);expect(events.filter(event=>event.kind==='batch').at(-1).receivedAt).toBe(new Date(receipt.ms).toISOString());
  feed.holdRest();expect(feed.restDeniedUntil).toBe(receipt.ms+60000);
  await main.step(120);expect(feed.marketNow()).toBe(REGULAR_EPOCH+121000);expect(feed.rateWindow.start).toBe(windowStart);expect(feed.status().lastMessageAt).toBe(receipt.ms);
  const request=(id:string)=>main.lv.fetchAlpacaBars({requestId:id,symbol:'GME',timeframe:'1Min',feed:'iex',start:REGULAR_EPOCH/1000-3600,end:Math.floor(feed.marketNow()/1000)});
  expect(await request('clock-backoff-held')).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});
  receipt.ms+=60001;await main.step(1);expect(feed.rateWindow.start).toBe(receipt.ms);expect(feed.status().lastMessageAt).toBe(receipt.ms);
  const response=await request('clock-backoff-ended');expect(response.ok).toBe(true);expect(response.value.provenance.retrievedAt).toBe(new Date(receipt.ms).toISOString());
 }finally{off();await main.close();}
});
it('an explicit options.now provider retains its old status coverage contract under an admitted global fixture',async()=>{
 const receipt=REGULAR_EPOCH+3*86400000,main=await bootSyntheticClock('regular',()=>receipt);let provider:AlpacaLiveProvider|null=null;
 try{
  const status=await main.lv.alpacaKeyStatus();selectAlpacaSyntheticStub(true,readSyntheticMarketClock(status.value,()=>main.elapsed.ms));
  provider=new AlpacaLiveProvider(main.lv,{now:()=>REGULAR_EPOCH});const handle=provider.open('GME','1m');
  try{
   for(let turn=0;turn<250&&(!handle.dataset().bars.length||!main.sockets.some(socket=>socket.authenticated&&socket.symbols.size));turn++)await pause(10);
   expect(handle.dataset().bars.length).toBeGreaterThan(0);expect(handle.dataset().provenance.asOf).toBe(receipt/1000);
   await main.step(1);expect(main.feeds[0].status().lastMessageAt).toBe(receipt);expect(handle.dataset().provenance.asOf).toBe(receipt/1000);
  }finally{handle.close();}
 }finally{provider?.dispose();await main.close();}
});
