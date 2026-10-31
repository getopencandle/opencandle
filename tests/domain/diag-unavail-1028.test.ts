import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {CoinbaseLiveProvider,type CoinbaseBridge,type CoinbaseStatus} from '../../src/domain/coinbase-live';
import {createMarketQueue} from '../../src/chart/market-queue';
import {stampLiveLineage} from '../../src/chart/bar-input-identity';
import {createLiveHoldGate} from '../../src/ui/live-hold-gate';
import type {Bar} from '../../src/domain/types';

// "Chart unavailable: Error: The chart input is held by an owned
// workspace transition." then "Saved locally, but the chart workspace needs recovery" after a live interval switch.
// SYNTHETIC bridges with delayed responses; no network. The App-level repro is tests/ui/diag-unavail-1028-app.test.ts.
const T0=Date.UTC(2026,9,28,12,0,0)/1000;
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const SIZES:Record<string,number>={ONE_MINUTE:60,FIVE_MINUTE:300,FIFTEEN_MINUTE:900,ONE_HOUR:3600,SIX_HOUR:21600,ONE_DAY:86400};
const status=(state:CoinbaseStatus['state']):CoinbaseStatus=>({schemaVersion:1,state,productIds:['BTC-USD'],attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{}} as CoinbaseStatus);
const candles=(size:number,start:number,end:number)=>{const out:Bar[]=[];for(let t=Math.ceil(start/size)*size;t<=end;t+=size)out.push({time:t,open:100,high:101,low:99,close:100,volume:1});return out;};
function coinbase(){
 const gates:Array<{match:(input:any)=>boolean;release:Promise<void>;open:()=>void}>=[];
 const bridge={
  fetchCoinbaseCandles:vi.fn(async(input:any)=>{const gate=gates.find(row=>row.match(input));if(gate){gates.splice(gates.indexOf(gate),1);await gate.release;}const size=SIZES[input.granularity];return{ok:true as const,value:{schemaVersion:1 as const,productId:input.productId,granularity:input.granularity,seconds:size,bars:candles(size,input.start,input.end),provenance:{provider:'synthetic',kind:'public-unauthenticated' as const,sourceUrl:'synthetic',retrievedAt:'',bytes:0,license:''}}};}),
  subscribeCoinbase:vi.fn(async()=>({ok:true as const,value:status('ready')})),unsubscribeCoinbase:vi.fn(async()=>({ok:true as const,value:status('idle')})),onCoinbaseEvent:vi.fn(()=>()=>{}),
 } satisfies CoinbaseBridge;
 /** Hold the next request that matches until the returned release runs (a delayed page response). */
 const hold=(match:(input:any)=>boolean)=>{let open!:()=>void;const release=new Promise<void>(yes=>open=yes);gates.push({match,release,open});return open;};
 return{bridge,hold,provider:new CoinbaseLiveProvider(bridge,{now:()=>T0*1000})};
}

describe('DIAG-UNAVAIL-1028 the failing write',()=>{
 it('repro: a new live revision written while the chart is held is refused with the reported message unless it waits',async()=>{
  const bars=(seq:number,key:string)=>{const out=candles(86400,T0-9*86400,T0);stampLiveLineage(out,key,seq);return out;};
  let current={bars:bars(1,'live:1D|cached'),source:{datasetId:'live:1D',revision:'cached',fixture:false,label:'x'} as any};const applied:number[]=[];
  const queue=createMarketQueue({read:()=>current,write:input=>{current=input;},apply:async next=>{applied.push(next.length);},disposed:()=>false});
  const hold=queue.reserve(),refreshed=bars(1,'live:1D|rest');
  // Before the fix the adapter deferred only growth of the SAME input identity; a REST refresh is a new identity.
  const refused=await queue.set(refreshed,{...current.source,revision:'rest'});
  expect(refused).toEqual({ok:false,diagnostic:expect.objectContaining({code:'CHART_SUSPENDED',message:'The chart input is held by an owned workspace transition.'})});
  // Now every live input waits for the hold and is written once it ends; the last good bars stay meanwhile.
  const waiting=queue.set(refreshed,{...current.source,revision:'rest'},undefined,undefined,{deferWhileHeld:true});
  await flush();expect(applied).toEqual([]);expect(current.source.revision).toBe('cached');
  hold.release();expect(await waiting).toEqual({ok:true});expect(current.source.revision).toBe('rest');expect(applied).toEqual([refreshed.length]);
 });
 it('the adapter defers every live input while held, not only growth of the shown identity (source pin)',()=>{
  const source=readFileSync('src/chart/adapter.ts','utf8'),line=source.split('\n').find(row=>row.includes('setBars:(next:readonly Bar[]'))!;
  expect(line).toContain('live=typeof isLiveInputIdentity===\'function\'&&isLiveInputIdentity(source.inputIdentity);');
  expect(line).toContain('{deferWhileHeld:live}');
 });
});

describe('DIAG-UNAVAIL-1028 live hold gate',()=>{
 it('publishes nothing while held, then only the newest waiting snapshot per feed after the last release',()=>{
  const runs:Array<()=>void>=[],gate=createLiveHoldGate(run=>runs.push(run)),out:string[]=[];
  expect(gate.offer('a',()=>out.push('a0'))).toBe(false);
  const outer=gate.hold(),inner=gate.hold();
  expect(gate.offer('a',()=>out.push('a1'))).toBe(true);gate.offer('b',()=>out.push('b1'));gate.offer('a',()=>out.push('a2'));
  inner();inner();expect(runs).toEqual([]);expect(gate.held()).toBe(true);
  outer();expect(gate.held()).toBe(false);runs.splice(0).forEach(run=>run());
  expect(out.sort()).toEqual(['a2','b1']);
 });
 it('a publication that throws does not stop another feed',()=>{
  const runs:Array<()=>void>=[],gate=createLiveHoldGate(run=>runs.push(run)),out:string[]=[];const release=gate.hold();
  gate.offer('a',()=>{throw Error('x');});gate.offer('b',()=>out.push('b'));release();runs.splice(0).forEach(run=>run());expect(out).toEqual(['b']);
 });
});

describe('DIAG-UNAVAIL-1028 in-flight history pages are tagged with their feed',()=>{
 it('a page in flight when its feed closes and reopens (4h -> 1D -> 1W -> 4h) never fetches on or lands in the new feed',async()=>{
  const {bridge,hold,provider}=coinbase();
  const h1=provider.open('BTC-USD','240m');await flush();const first=h1.dataset().bars[0].time;expect(h1.dataset().bars.length).toBeGreaterThan(10);
  const release=hold(input=>input.end<=first);void h1.loadOlder!();await flush();
  h1.close();const h2=provider.open('BTC-USD','1D');await flush();const h3=provider.open('BTC-USD','1W');await flush();h2.close();h3.close();
  const h4=provider.open('BTC-USD','240m');await flush();
  const before=h4.dataset(),calls=bridge.fetchCoinbaseCandles.mock.calls.length;
  release();await flush();
  expect(bridge.fetchCoinbaseCandles.mock.calls.length,'the stale page stops instead of fetching on').toBe(calls);
  expect(h4.dataset().bars).toBe(before.bars);
  const steps=new Set(h4.dataset().bars.slice(1).map((bar,i)=>bar.time-h4.dataset().bars[i].time));expect([...steps]).toEqual([4*3600]);
  // The reopened feed pages on its own pager.
  void h4.loadOlder!();await flush();const after=h4.dataset().bars;
  expect(after.length).toBeGreaterThan(before.bars.length);expect(new Set(after.slice(1).map((bar,i)=>bar.time-after[i].time))).toEqual(new Set([4*3600]));
  h4.close();provider.dispose();
 });
 it('a page in flight when its feed switches interval never lands in the other interval',async()=>{
  const {hold,provider}=coinbase();
  const day=provider.open('BTC-USD','1D');await flush();const first=day.dataset().bars[0].time,dayBars=day.dataset().bars.length;
  const release=hold(input=>input.granularity==='ONE_DAY'&&input.end<=first);void day.loadOlder!();await flush();
  const week=provider.open('BTC-USD','1W');await flush();day.close();const weekBars=week.dataset().bars;
  release();await flush();
  expect(week.dataset().bars).toBe(weekBars);expect(new Set(weekBars.slice(1).map((bar,i)=>bar.time-weekBars[i].time))).toEqual(new Set([7*86400]));
  expect(dayBars).toBeGreaterThan(0);week.close();provider.dispose();
 });
});
