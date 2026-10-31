import {createRequire} from 'node:module';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {ALPACA_CAPABILITIES,AlpacaLiveProvider,alpacaAdjustmentBasis,alpacaSearchDatasets,currentAlpacaAdjustment,preferAlpacaDividendAdjustment,type AlpacaBridge,type AlpacaEvent,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {barsPatternSpanFetcher} from '../../src/chart/lv-types/bars-pattern-resample';
import type {Bar} from '../../src/domain/types';

// Alpaca bars are requested split-adjusted (the reference app's stock default), or split
// and dividend adjusted when "Adjust data for dividends" is on. SYNTHETIC bridge only: invented prices, no key, no network.
const require=createRequire(import.meta.url);
const {barsInput,AlpacaMarketData}=require('../../electron/public-alpaca.cjs');

const DAY=86400;
/** SYNTHETIC "GME-like" daily history: one bar per weekday at 04:00 UTC, a raw price near 160 before an invented 4:1 split on
 * 2022-07-22 and near 40 after it. A $0.50 SYNTHETIC dividend goes ex on 2022-03-01. */
const SPLIT=Date.UTC(2022,6,22,4)/1000,DIV=Date.UTC(2022,2,1,4)/1000;
let splitFactor=4; // a test can declare a second (invented) split to simulate a basis change
function rawClose(time:number):number{return (time<SPLIT?160:40)+Math.sin(time/DAY)*0.5;}
function adjusted(time:number,adjustment:string):number{
 let value=rawClose(time);
 if(adjustment.includes('split')&&time<SPLIT)value/=splitFactor;
 if(adjustment.includes('dividend')&&time<DIV)value*=0.99;
 return value;
}
function daily(start:number,end:number,adjustment:string):Bar[]{
 const out:Bar[]=[];
 for(let t=Math.ceil((start-4*3600)/DAY)*DAY+4*3600;t<=end;t+=DAY){const weekday=new Date(t*1000).getUTCDay();if(weekday===0||weekday===6)continue;const c=adjusted(t,adjustment);out.push({time:t,open:c,high:c+1,low:c-1,close:c,volume:volumeOf(t,adjustment)});}
 return out;
}
function volumeOf(t:number,adjustment:string){return adjustment.includes("split")&&t<SPLIT?1000*splitFactor:1000;}
const status=(state:AlpacaStatus['state']):AlpacaStatus=>({schemaVersion:1,state,symbols:['GME'],feed:'iex',attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{}} as AlpacaStatus);
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function bridge(){
 let listener:((event:AlpacaEvent)=>void)|null=null;
 const value={
  alpacaKeyStatus:vi.fn(async()=>({ok:true as const,value:{configured:true,keyIdHint:'****',encryption:true}})),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn(),
  fetchAlpacaBars:vi.fn(async(input:any)=>({ok:true as const,value:{schemaVersion:1 as const,symbol:input.symbol,timeframe:input.timeframe,seconds:86400,feed:input.feed,bars:input.timeframe==='1Day'?daily(input.start,input.end,input.adjustment??'raw'):[],nextPageToken:null,provenance:{provider:'synthetic',kind:'owner-key' as const,feed:input.feed,delaySeconds:0,sourceUrl:'synthetic',retrievedAt:'',bytes:0,license:''}}})),
  subscribeAlpaca:vi.fn(async()=>({ok:true as const,value:status('ready')})),unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),
  onAlpacaEvent:vi.fn((handler:(event:AlpacaEvent)=>void)=>{listener=handler;return()=>{listener=null;};}),
 } satisfies AlpacaBridge;
 return {bridge:value,emit:(event:AlpacaEvent)=>listener?.(event)};
}
afterEach(()=>{splitFactor=4;preferAlpacaDividendAdjustment(false);});
const maxJump=(bars:Bar[])=>{let worst=1;for(let i=1;i<bars.length;i++)worst=Math.max(worst,bars[i].close/bars[i-1].close,bars[i-1].close/bars[i].close);return worst;};

describe('main process: the adjustment request parameter',()=>{
 const nowS=Math.floor(Date.UTC(2026,9,22,15)/1000),input={requestId:'synthetic',symbol:'GME',timeframe:'1Day',feed:'iex',start:nowS-30*DAY,end:nowS};
 it('accepts raw, split and split,dividend; defaults to raw when absent; rejects anything else',()=>{
  expect(barsInput(input,nowS).adjustment).toBe('raw');
  expect(barsInput({...input,adjustment:'split'},nowS).adjustment).toBe('split');
  expect(barsInput({...input,adjustment:'split,dividend'},nowS).adjustment).toBe('split,dividend');
  for(const bad of ['all','spin-off','SPLIT','split,dividend,spin-off','',1,null,'split&feed=sip'])expect(()=>barsInput({...input,adjustment:bad},nowS),String(bad)).toThrow();
 });
 it('puts the adjustment on the bars URL',()=>{
  const client=new AlpacaMarketData({keys:{load:async()=>null},fetchImpl:vi.fn(),restMinIntervalMs:0});
  const url=(adjustment?:string)=>new URL(client.sourceUrl(barsInput({...input,...(adjustment?{adjustment}:{})},nowS)));
  expect(url('split').searchParams.get('adjustment')).toBe('split');
  expect(url('split,dividend').searchParams.get('adjustment')).toBe('split,dividend');
  expect(url().searchParams.get('adjustment')).toBe('raw');
  expect(url('split').searchParams.getAll('adjustment')).toHaveLength(1);
 });
});

describe('renderer: split-adjusted by default',()=>{
 const NOW=Date.UTC(2023,2,1,15)*1;
 it('backfill, paging, seeding and SIP history all ask for adjustment=split, and provenance says split-adjusted',async()=>{
  const {bridge:b}=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>NOW});
  expect(currentAlpacaAdjustment()).toBe('split');
  const handle=provider.open('GME','1D');await flush();
  expect(b.fetchAlpacaBars.mock.calls.every(([call])=>call.adjustment==='split')).toBe(true);
  const data=handle.dataset();expect(data.provenance.adjustment).toBe('split-adjusted');
  await handle.loadOlder!();await flush();
  expect(b.fetchAlpacaBars.mock.calls.every(([call])=>call.adjustment==='split')).toBe(true);
  const sip=await provider.history('GME','1D');expect(sip.provenance.adjustment).toBe('split-adjusted');
  expect(b.fetchAlpacaBars.mock.calls.at(-1)![0]).toMatchObject({feed:'sip',adjustment:'split'});
  expect(ALPACA_CAPABILITIES.adjustmentBases).toEqual(['split-adjusted','total-return']);
  expect(alpacaSearchDatasets(true,['GME'],'1D')[0].provenance.adjustment).toBe('split-adjusted');
  handle.close();provider.dispose();
 });
 it('the July 2022 split is not a cliff: backfill and paged history stitch with no gap, duplicate or jump',async()=>{
  const {bridge:b}=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>NOW});
  const handle=provider.open('GME','1D');await flush();
  const before=handle.dataset().bars;expect(before[0].time).toBeLessThan(SPLIT);
  for(let i=0;i<3;i++){await handle.loadOlder!();await flush();}
  const bars=handle.dataset().bars;
  expect(bars.length).toBeGreaterThan(before.length);
  expect(maxJump(bars)).toBeLessThan(1.05);
  // Every weekday between the first and last bar is present exactly once (the page seam neither drops nor repeats a bar).
  const expected=daily(bars[0].time,bars.at(-1)!.time,'split').map(bar=>bar.time);
  expect(bars.map(bar=>bar.time)).toEqual(expected);
  // Split adjustment also scales volume (Alpaca: "adjust price and volume").
  expect(bars.find(bar=>bar.time<SPLIT)!.volume).toBe(4000);
  handle.close();provider.dispose();
 });
 it('live stream bars for today merge as published (unadjusted is today\'s basis)',async()=>{
  const {bridge:b,emit}=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>NOW});
  const handle=provider.open('GME','1D');await flush();
  const last=handle.dataset().bars.at(-1)!;
  emit({schemaVersion:1,kind:'batch',bars:[{symbol:'GME',kind:'daily',seconds:86400,time:last.time,open:last.open,high:last.high+2,low:last.low,close:last.close+1.5,volume:last.volume+10}],trades:[],receivedAt:''});
  const updated=handle.dataset().bars.at(-1)!;
  expect(updated.time).toBe(last.time);expect(updated.close).toBeCloseTo(last.close+1.5,9);expect(updated.high).toBeCloseTo(last.high+2,9);
  expect(maxJump(handle.dataset().bars)).toBeLessThan(1.05);
  handle.close();provider.dispose();
 });
});

describe('renderer: Adjust data for dividends',()=>{
 const NOW=Date.UTC(2023,2,1,15);
 it('turning it on refetches every open feed with split,dividend, as a new revision with total-return provenance',async()=>{
  const {bridge:b}=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>NOW});
  const handle=provider.open('GME','1D');await flush();
  const split=handle.dataset(),seen:string[]=[];handle.onChange(next=>seen.push(next.provenance.adjustment));
  preferAlpacaDividendAdjustment(true);
  expect(currentAlpacaAdjustment()).toBe('split,dividend');
  await flush();
  const total=handle.dataset();
  expect(total.provenance.adjustment).toBe('total-return');
  expect(total.provenance.revision).not.toBe(split.provenance.revision);
  expect(b.fetchAlpacaBars.mock.calls.at(-1)![0]).toMatchObject({adjustment:'split,dividend'});
  // Every bar comes from the new basis: no split-only bar survives next to dividend-adjusted ones.
  const pre=total.bars.find(bar=>bar.time<DIV)!;expect(pre.close).toBeCloseTo(adjusted(pre.time,'split,dividend'),9);
  expect(seen).not.toContain('split-adjusted');
  await handle.loadOlder!();await flush();
  expect(b.fetchAlpacaBars.mock.calls.at(-1)![0]).toMatchObject({adjustment:'split,dividend'});
  expect(handle.dataset().bars.every(bar=>Math.abs(bar.close-adjusted(bar.time,'split,dividend'))<1e-9)).toBe(true);
  // Off again: back to split only.
  preferAlpacaDividendAdjustment(false);await flush();
  expect(handle.dataset().provenance.adjustment).toBe('split-adjusted');
  expect(handle.dataset().bars.every(bar=>Math.abs(bar.close-adjusted(bar.time,'split'))<1e-9)).toBe(true);
  handle.close();provider.dispose();
 });
 it('a backfill still in flight on the old basis is dropped, never shown',async()=>{
  const {bridge:b}=bridge();let release:(()=>void)|null=null;
  const original=b.fetchAlpacaBars.getMockImplementation()!;
  b.fetchAlpacaBars.mockImplementationOnce(async(input:any)=>{await new Promise<void>(resolve=>{release=resolve;});return original(input);});
  const provider=new AlpacaLiveProvider(b,{now:()=>NOW}),handle=provider.open('GME','1D');
  preferAlpacaDividendAdjustment(true);await flush();
  release!();await flush();
  const data=handle.dataset();
  expect(data.provenance.adjustment).toBe('total-return');
  expect(data.bars.every(bar=>Math.abs(bar.close-adjusted(bar.time,'split,dividend'))<1e-9)).toBe(true);
  handle.close();provider.dispose();
 });
 it('a provider made while the setting is on starts dividend-adjusted, and the bars-pattern span fetch follows the same basis',async()=>{
  preferAlpacaDividendAdjustment(true);
  const {bridge:b}=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>NOW});
  const handle=provider.open('GME','1D');await flush();
  expect(b.fetchAlpacaBars.mock.calls[0][0]).toMatchObject({adjustment:'split,dividend'});
  const fetcher=barsPatternSpanFetcher({alpaca:b});
  await fetcher({providerId:'alpaca-iex',symbol:'GME',resolution:'1D',start:SPLIT-10*DAY,end:SPLIT} as any);
  expect(b.fetchAlpacaBars.mock.calls.at(-1)![0]).toMatchObject({adjustment:'split,dividend'});
  expect(alpacaAdjustmentBasis('split')).toBe('split-adjusted');expect(alpacaAdjustmentBasis('split,dividend')).toBe('total-return');
  handle.close();provider.dispose();
 });
});

describe('renderer: a new corporate action while a chart is open',()=>{
 it('paging detects the changed basis at the seam and reloads the feed instead of stitching two bases',async()=>{
  const NOW=Date.UTC(2023,2,1,15);
  const {bridge:b}=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>NOW});
  const handle=provider.open('GME','1D');await flush();
  const first=handle.dataset(),calls=b.fetchAlpacaBars.mock.calls.length;
  splitFactor=8; // SYNTHETIC: Alpaca now reports every pre-split bar on a new basis
  await handle.loadOlder!();await flush();
  const after=handle.dataset();
  expect(b.fetchAlpacaBars.mock.calls.length).toBeGreaterThan(calls+1); // the page, then a full reload
  expect(after.provenance.revision).not.toBe(first.provenance.revision);
  expect(after.bars.every(bar=>Math.abs(bar.close-adjusted(bar.time,'split'))<1e-9)).toBe(true);
  handle.close();provider.dispose();
 });
 it('the first live message of a new New York day re-checks the oldest loaded bar and reloads on a changed basis',async()=>{
  let now=Date.UTC(2023,2,1,15);
  const {bridge:b,emit}=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>now});
  const handle=provider.open('GME','1D');await flush();
  const first=handle.dataset(),oldest=first.bars[0].time;
  const batch=(t:number):AlpacaEvent=>({schemaVersion:1,kind:'batch',bars:[{symbol:'GME',kind:'daily',seconds:86400,time:t,open:40,high:41,low:39,close:40,volume:1}],trades:[],receivedAt:''});
  emit(batch(first.bars.at(-1)!.time));await flush();
  expect(b.fetchAlpacaBars.mock.calls.some(([call])=>call.start===oldest&&call.end===oldest)).toBe(false); // same day: no check
  now+=DAY*1000;splitFactor=8;
  emit(batch(Date.UTC(2023,2,2,4)/1000));await flush();
  expect(b.fetchAlpacaBars.mock.calls.some(([call])=>call.start===oldest&&call.end===oldest&&call.adjustment==='split')).toBe(true);
  expect(handle.dataset().provenance.revision).not.toBe(first.provenance.revision);
  expect(handle.dataset().bars.filter(bar=>bar.time<SPLIT).every(bar=>Math.abs(bar.close-adjusted(bar.time,'split'))<1e-9)).toBe(true);
  handle.close();provider.dispose();
 });
});
