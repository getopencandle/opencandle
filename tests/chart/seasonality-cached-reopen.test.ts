import {afterEach,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {ownedInputStylePipelineFixture} from '../fixtures/seasonality-input-style-pipeline';
import {publishedSource,flushMtf} from '../fixtures/qualified-nyse-mtf-source';
import {sourceContextForDataset,seasonalityDailyContextMode,captureSeasonalityDailyContext} from '../../src/chart/source-context';
import {seasonalityUsesLiveDailyHistory,type IndicatorSnapshot} from '../../src/chart/indicator-port';
import {LIVE_CACHED_NOTE,type BarCacheBridge,type BarCacheKey,type BarCacheRecord} from '../../src/domain/live-cache';
import {isAlpacaSyntheticStub,selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';

const requireActual=createRequire(path.join(process.cwd(),'electron/alpaca-stub.cjs'));
const {AlpacaMarketData}=requireActual('./public-alpaca.cjs'),{alpacaStubTransport}=requireActual('./alpaca-stub.cjs');
const NOW=Date.parse('2026-10-20T16:00:00Z')/1000;
const FULL={startYear:2016,endYear:2026,meanRow:true,deviationRow:true,positiveFrequencyRow:true,projectionGeometry:true};
const keyText=(key:BarCacheKey)=>JSON.stringify([key.provider,key.symbol,key.interval,key.feed,key.adjustment,key.plan]);
const closes:Array<()=>Promise<void>>=[];
afterEach(async()=>{const failures:unknown[]=[];for(const close of closes.splice(0).reverse())try{await close();}catch(error){failures.push(error);}vi.restoreAllMocks();vi.unstubAllGlobals();if(failures.length)throw new AggregateError(failures,'SYNTHETIC cached-reopen cleanup failed.');});

it('a genuine cached live reopen retains cache refusal then restores saved C through actual accepted-input order',async()=>{
 const previousMode=isAlpacaSyntheticStub();closes.push(async()=>{selectAlpacaSyntheticStub(previousMode);});selectAlpacaSyntheticStub(true);
 const store=new Map<string,BarCacheRecord>(),writes:Array<{rows:number;first:number;last:number}>=[];
 // Only the actual provider's writeBarCache produces records. This is the
 // profile IO stand-in, not a completion/source/native registration seam.
 const cache:BarCacheBridge={
  async readBarCache({key}){const value=store.get(keyText(key));return{ok:true,value:value?structuredClone(value):null};},
  async writeBarCache({key,bars}){store.set(keyText(key),{schemaVersion:1,key:structuredClone(key),savedAt:new Date().toISOString(),synthetic:key.provider==='alpaca-stub',bars:structuredClone(bars)});writes.push({rows:bars.length,first:bars[0].time,last:bars.at(-1)!.time});return{ok:true,value:{schemaVersion:1,bytes:1,entries:store.size,maxBytes:1}};},
  async discardBarCache({provider,symbol}){let removed=0;for(const [key,value]of store)if(value.key.provider===provider&&value.key.symbol===symbol){store.delete(key);removed++;}return{ok:true,value:{removed}};}
 };
 const external=()=>{throw Error('No external network/socket in SYNTHETIC cached-reopen exercise.');};vi.stubGlobal('fetch',external);vi.stubGlobal('WebSocket',external);
 async function open(holdRefresh=false){
  let disposed=false,releaseRefresh!:()=>void,hold=holdRefresh,p:Awaited<ReturnType<typeof publishedSource>>|undefined,f:Awaited<ReturnType<typeof ownedInputStylePipelineFixture>>|undefined;
  const gate=new Promise<void>(resolve=>{releaseRefresh=resolve;}),replies=new Set<Promise<unknown>>(),requests:Array<{timeframe:string;feed:string;start:number;end:number;rows:number}>=[];
  const transport=alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub',LV_ALPACA_CLOCK:'regular',LV_ALPACA_SCENARIO:'nyse-seasonality-v1'},packaged:false,profile:path.join(os.tmpdir(),'lv-synthetic-cached-reopen'),tmpdir:os.tmpdir(),elapsedNow:()=>0});expect(transport.mode).toBe('synthetic');
  const market=new AlpacaMarketData({keys:transport.keys,fetchImpl:transport.fetch,WebSocketImpl:transport.WebSocket,marketNow:()=>NOW*1000,restMinIntervalMs:0,restTimeoutMs:30000,emit:()=>{}});
  const close=async()=>{if(disposed)return;disposed=true;releaseRefresh();const failures:unknown[]=[];for(const release of [()=>f?.dispose(),()=>p?.dispose(),()=>market.close()])try{release();}catch(error){failures.push(error);}await Promise.allSettled([...replies]);await flushMtf();if(failures.length)throw new AggregateError(failures,'SYNTHETIC cached feed did not close.');};closes.push(close);
  p=await publishedSource({resolution:'1m',now:NOW,plan:'free',cache,reply:request=>{const pause=hold&&request.timeframe!=='1Day';if(pause)hold=false;const work=(async()=>{const result=await market.bars(request);if(result.ok)requests.push({timeframe:request.timeframe,feed:request.feed,start:request.start,end:request.end,rows:result.value.bars.length});if(pause)await gate;return result;})();replies.add(work);void work.then(()=>replies.delete(work),()=>replies.delete(work));return work;}});
  const producer=p;
  const facts=()=>{const dataset=producer.raw(),context=sourceContextForDataset(dataset,dataset.bars);return{rows:dataset.bars.length,state:dataset.provenance.state,cached:dataset.provenance.notes.includes(LIVE_CACHED_NOTE),mode:seasonalityDailyContextMode(context,'ordinary'),plan:!!captureSeasonalityDailyContext(context,2016,2026,'ordinary'),requests:[...requests]};};
  const mount=async(saved?:readonly IndicatorSnapshot[])=>{await vi.waitFor(()=>{expect(producer.raw().bars).toHaveLength(300);expect(producer.raw().provenance.state).not.toBe('loading');expect(producer.raw().provenance.notes).not.toContain(LIVE_CACHED_NOTE);},{timeout:5000,interval:10});f=await ownedInputStylePipelineFixture({dataset:producer.raw()});expect((await f.accept(producer.raw())).accepted).toBe(true);f.port.remove(f.id);if(saved){f.port.restore(saved);return saved[0].id;}return f.port.add('seasonality',FULL);};
  const values=async(id:string)=>{const owner=f!;let value=owner.port.captureReadout!(id);await vi.waitFor(()=>{value=owner.port.captureReadout!(id);expect(value.state,JSON.stringify({source:facts(),studies:owner.port.list(),writes})).toBe('ready');},{timeout:10000,interval:20});if(value.state!=='ready')throw Error('The actual cached reopen has no accepted readout.');return value.readAt(owner.raw().at(-1)!.time).plots.map(row=>row.value);};
  return{producer,requests,facts,mount,values,fixture:()=>f!,releaseRefresh,close};
 }
 const first=await open(),id=await first.mount();expect(first.facts()).toMatchObject({cached:false,mode:true,plan:true});expect(await first.values(id)).toEqual([28.125,12.5,0,10]);
 const saved=first.fixture().port.serialize().filter(row=>row.id===id);await first.producer.provider.flushBarCache();expect(writes.length).toBeGreaterThan(0);expect(store.size).toBeGreaterThan(0);for(const record of store.values()){expect(record.key.provider).toBe('alpaca-stub');expect(record.synthetic).toBe(true);}await first.close();
 const reopened=await open(true);await vi.waitFor(()=>expect(reopened.facts()).toMatchObject({cached:true,mode:false,plan:false}),{timeout:5000,interval:10});
 reopened.releaseRefresh();const restoredId=await reopened.mount(saved);
 // Unlike the earlier unmounted cold-start proposal, actual native input is
 // accepted BEFORE saved C restore, matching the GridCell effect's ordering.
 expect(reopened.facts(),JSON.stringify({source:reopened.facts(),writes})).toMatchObject({cached:false,mode:true,plan:true});
 expect(seasonalityUsesLiveDailyHistory(reopened.fixture().port,restoredId)).toBe(true);
 expect(await reopened.values(restoredId)).toEqual([28.125,12.5,0,10]);
});
