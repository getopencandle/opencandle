import {afterEach,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {publishedSource,flushMtf} from '../fixtures/qualified-nyse-mtf-source';
import {captureAlpacaClosedSnapshot,captureAlpacaSeasonalityFrozenHistoryOrigin,sealAlpacaSeasonalityFrozenHistoryOrigin,releaseAlpacaSeasonalityFrozenHistoryOrigin,isAlpacaSyntheticStub,selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import {captureAlpacaSessionCompletion} from '../../src/domain/live-session-source';
import {sourceContextForDataset,seasonalityDailyContextMode,captureSeasonalityDailyContext} from '../../src/chart/source-context';
import {planNyseDailyTimeframe} from '../../src/domain/indicator-resample';
import {NyseMtfAlertEvaluator,prepareNyseAlertBatch} from '../../src/domain/nyse-mtf-alert-source';
import {captureNyseIndicatorAlertSource} from '../../src/domain/technical-alerts';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {LIVE_CACHED_NOTE,type BarCacheBridge,type BarCacheKey,type BarCacheRecord} from '../../src/domain/live-cache';

const requireActual=createRequire(path.join(process.cwd(),'electron/alpaca-stub.cjs'));
const {AlpacaMarketData}=requireActual('./public-alpaca.cjs'),{alpacaStubTransport}=requireActual('./alpaca-stub.cjs');
const NOW=Date.parse('2026-10-20T16:00:00Z')/1000,keyText=(key:BarCacheKey)=>JSON.stringify([key.provider,key.symbol,key.interval,key.feed,key.adjustment,key.plan]);
const closes:Array<()=>Promise<void>>=[];
afterEach(async()=>{const failures:unknown[]=[];for(const close of closes.splice(0).reverse())try{await close();}catch(error){failures.push(error);}vi.restoreAllMocks();vi.unstubAllGlobals();if(failures.length)throw new AggregateError(failures,'SYNTHETIC observed-cache boundary cleanup failed.');});
function setup(){
 const previous=isAlpacaSyntheticStub();closes.push(async()=>{selectAlpacaSyntheticStub(previous);});selectAlpacaSyntheticStub(true);
 const external=()=>{throw Error('No external transport in SYNTHETIC cache coverage boundary test.');};vi.stubGlobal('fetch',external);vi.stubGlobal('WebSocket',external);
 const records=new Map<string,BarCacheRecord>();
 const cache:BarCacheBridge={async readBarCache({key}){const value=records.get(keyText(key));return{ok:true,value:value?structuredClone(value):null};},async writeBarCache({key,bars}){expect(key.provider).toBe('alpaca-stub');records.set(keyText(key),{schemaVersion:1,key:structuredClone(key),savedAt:new Date().toISOString(),synthetic:true,bars:structuredClone(bars)});return{ok:true,value:{schemaVersion:1,bytes:1,entries:records.size,maxBytes:1}};},async discardBarCache({provider,symbol}){let removed=0;for(const [key,value]of records)if(value.key.provider===provider&&value.key.symbol===symbol){records.delete(key);removed++;}return{ok:true,value:{removed}};}};
 return{records,cache};
}
async function open(cache:BarCacheBridge,holdRefresh=false){
 let release!:()=>void,hold=holdRefresh,disposed=false,p:Awaited<ReturnType<typeof publishedSource>>|undefined;
 const gate=new Promise<void>(resolve=>{release=resolve;}),replies=new Set<Promise<unknown>>(),requests:Array<{timeframe:string;feed:string;start:number;end:number}>=[];
 const transport=alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub',LV_ALPACA_CLOCK:'regular',LV_ALPACA_SCENARIO:'nyse-seasonality-v1'},packaged:false,profile:path.join(os.tmpdir(),'lv-synthetic-cache-consumer-boundaries'),tmpdir:os.tmpdir(),elapsedNow:()=>0});expect(transport.mode).toBe('synthetic');
 const market=new AlpacaMarketData({keys:transport.keys,fetchImpl:transport.fetch,WebSocketImpl:transport.WebSocket,marketNow:()=>NOW*1000,restMinIntervalMs:0,restTimeoutMs:30000,emit:()=>{}});
 const close=async()=>{if(disposed)return;disposed=true;release();const failures:unknown[]=[];for(const action of [()=>p?.dispose(),()=>market.close()])try{action();}catch(error){failures.push(error);}await Promise.allSettled([...replies]);await flushMtf();if(failures.length)throw new AggregateError(failures,'SYNTHETIC cache boundary owner cleanup failed.');};closes.push(close);
 p=await publishedSource({resolution:'1m',now:NOW,plan:'free',cache,reply:request=>{requests.push({timeframe:request.timeframe,feed:request.feed,start:request.start,end:request.end});const pause=hold&&request.timeframe!=='1Day';if(pause)hold=false;const reply=(async()=>{const result=await market.bars(request);if(pause)await gate;return result;})();replies.add(reply);void reply.then(()=>replies.delete(reply),()=>replies.delete(reply));return reply;}});
 return{p,requests,release,close,async ready(){await vi.waitFor(()=>{expect(p!.raw().bars).toHaveLength(300);expect(p!.raw().provenance.state).not.toBe('loading');expect(p!.raw().provenance.notes).not.toContain(LIVE_CACHED_NOTE);},{timeout:5000,interval:10});}};
}
const alertSource=()=>captureNyseIndicatorAlertSource({id:'synthetic-cache-boundary-sma',kind:'sma',...factoryIndicatorDefault('sma'),inputs:{...factoryIndicatorDefault('sma').inputs,length:2,source:'close'},presentation:{...factoryIndicatorDefault('sma').presentation!,timeframe:{schemaVersion:1,interval:'1D',waitForClose:true}}},'sma','standard','synthetic-cache-boundary-snapshot');

it('keeps a real refreshed cached prefix outside closure and frozen-price authority while ordinary live daily mode is recognized',async()=>{
 const {cache,records}=setup(),first=await open(cache);await first.ready();await first.p.provider.flushBarCache();expect(records.size).toBeGreaterThan(0);for(const record of records.values()){expect(record.key.provider).toBe('alpaca-stub');expect(record.synthetic).toBe(true);}await first.close();
 const reopened=await open(cache,true);await vi.waitFor(()=>expect(reopened.p.raw().provenance.notes).toContain(LIVE_CACHED_NOTE),{timeout:5000,interval:10});
 let raw=reopened.p.raw(),context=sourceContextForDataset(raw,raw.bars);expect(seasonalityDailyContextMode(context,'ordinary')).toBe(false);expect(captureAlpacaClosedSnapshot(raw,raw.bars)).toBeNull();
 reopened.release();await reopened.ready();raw=reopened.p.raw();context=sourceContextForDataset(raw,raw.bars);
 expect(seasonalityDailyContextMode(context,'ordinary')).toBe(true);expect(captureSeasonalityDailyContext(context,2016,2026,'ordinary')).not.toBeNull();
 // Existing immutable observation32 forbids any whole closed-snapshot lease
 // for a cache overlap. Record actual public request bounds, never null-lease facts.
 expect(captureAlpacaClosedSnapshot(raw,raw.bars)).toBeNull();
 const requestedFrom=reopened.requests[0].start,requestedThrough=Math.max(...reopened.requests.map(request=>request.end));expect(raw.bars[0].time).toBeLessThan(requestedFrom);
 const regular=reopened.p.regular();expect(captureAlpacaSessionCompletion(regular,regular.bars)).toBeNull();expect(regular.bars[0].time).toBeLessThan(requestedFrom);
 // Pure planner arguments describe the actual request only; they grant no
 // source observation. The real alert producer below must refuse even earlier.
 const planned=planNyseDailyTimeframe(regular.bars,regular.resolution,{completeRows:regular.bars.length,coveredFrom:requestedFrom,closedThrough:requestedThrough});expect(planned).toMatchObject({ok:false,code:'RESAMPLE_UNAVAILABLE'});if(!planned.ok)expect(planned.message).toContain('outside its observed request coverage');
 const evaluator=new NyseMtfAlertEvaluator();closes.push(async()=>{evaluator.dispose();});expect(()=>prepareNyseAlertBatch(evaluator,regular,regular.bars,'ordinary',[alertSource()],regular.instrument.currency,new AbortController().signal)).toThrow('genuine producer completion');
 const origin=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars);try{expect(origin).toBeNull();}finally{if(origin)releaseAlpacaSeasonalityFrozenHistoryOrigin(origin);}
 // The refusal derives from private successful-cache-merge provenance. A
 // substituted public first row cannot erase it or be read as an authority.
 const firstRow=raw.bars[0];let firstRowDescriptorReads=0;raw.bars[0]=new Proxy(firstRow,{getOwnPropertyDescriptor(){firstRowDescriptorReads++;throw Error('Do not inspect an unobserved cached first row.');}});
 try{const hostile=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars);try{expect(hostile).toBeNull();expect(firstRowDescriptorReads).toBe(0);}finally{if(hostile)releaseAlpacaSeasonalityFrozenHistoryOrigin(hostile);}}finally{raw.bars[0]=firstRow;}
 expect(captureAlpacaClosedSnapshot(raw,raw.bars)).toBeNull();expect(seasonalityDailyContextMode(context,'ordinary')).toBe(true);
});

it('retains genuine fully fresh source coverage and frozen-origin capture without requiring the forming tail to close',async()=>{
 const {cache}=setup(),fresh=await open(cache);await fresh.ready();const raw=fresh.p.raw(),observed=captureAlpacaClosedSnapshot(raw,raw.bars);expect(observed).not.toBeNull();if(!observed)throw Error('Fresh observation missing.');expect(raw.bars[0].time).toBeGreaterThanOrEqual(observed.coveredFrom);
 const context=sourceContextForDataset(raw,raw.bars);expect(seasonalityDailyContextMode(context,'ordinary')).toBe(true);
 const regular=fresh.p.regular(),selected=captureAlpacaSessionCompletion(regular,regular.bars);expect(selected).not.toBeNull();if(!selected)throw Error('Fresh selected observation missing.');expect(planNyseDailyTimeframe(regular.bars,regular.resolution,{completeRows:regular.bars.length,coveredFrom:selected.coveredFrom,closedThrough:selected.coveredThrough}).ok).toBe(true);
 const origin=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars);expect(origin).not.toBeNull();if(!origin)throw Error('Genuine fresh origin missing.');try{expect(sealAlpacaSeasonalityFrozenHistoryOrigin(origin)).toBe(true);}finally{releaseAlpacaSeasonalityFrozenHistoryOrigin(origin);}
 expect(captureAlpacaSeasonalityFrozenHistoryOrigin({...raw},raw.bars)).toBeNull();
});
