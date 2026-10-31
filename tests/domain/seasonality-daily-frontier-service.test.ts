import {afterEach,expect,it} from 'vitest';
import {acquireAlpacaSeasonalityDailyDemand,prepareAlpacaSeasonalityDailyWindow,releaseAlpacaSeasonalityDailyDemand,captureAlpacaSeasonalityDailyPlan,captureAlpacaSeasonalityGeometryFacts,alpacaSeasonalityGeometryFactsMatch,alpacaSeasonalityDailyUsage,assertAlpacaSeasonalityDailyWindow} from '../../src/domain/alpaca-live';
import {publishedSource,response,fridayMonday,unix,flushMtf,type Request} from '../fixtures/qualified-nyse-mtf-source';
import type {Bar} from '../../src/domain/types';
const cleanups:(()=>void|Promise<void>)[]=[];
afterEach(async()=>{const failures:unknown[]=[];for(const cleanup of cleanups.splice(0).reverse())try{await cleanup();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'SYNTHETIC provider frontier cleanup failed.');});
const FIRST=unix('2024-03-08T14:30:00Z'),FROM=unix('2024-03-01T05:00:00Z');
const bar=(text:string,close=100):Bar=>({time:unix(text),open:close,high:close,low:close,close,volume:1});
// 30m folds the four prior15m rows into EXACTLY two observed bars. The
// destination first-loaded bar is present but is excluded from prefixBars.
const prefix=[bar('2024-03-01T14:30:00Z'),bar('2024-03-01T14:45:00Z'),bar('2024-03-01T15:00:00Z'),bar('2024-03-01T15:15:00Z'),bar('2024-03-08T14:30:00Z')];
const isPrefix=(request:Request)=>request.timeframe==='15Min'&&request.start===FROM&&request.end===FIRST;
function prefixResponse(request:Request,rows:Bar[],next:string|null=null){const result=response(request,rows,{next});if(request.pageToken){const url=new URL(result.value.provenance.sourceUrl);url.searchParams.set('page_token',request.pageToken);result.value.provenance.sourceUrl=url.href;}return result;}
async function fixture(reply?:(request:Request)=>ReturnType<typeof prefixResponse>|Promise<ReturnType<typeof prefixResponse>>){
 const producer=await publishedSource({reply:async request=>{
  if(request.timeframe==='1Day'){const result=response(request,[bar('2024-02-29T05:00:00Z',100),bar('2024-03-08T05:00:00Z',110)]);result.value.seconds=86400;return result;}
  if(isPrefix(request))return reply?reply(request):prefixResponse(request,prefix);
  return response(request,fridayMonday().filter(row=>row.time>=request.start&&row.time<=request.end));
 }});cleanups.push(()=>producer.dispose());const raw=producer.raw(),plan=captureAlpacaSeasonalityDailyPlan(raw,raw.bars,2024,2024)!;expect(plan).not.toBeNull();
 const demand=acquireAlpacaSeasonalityDailyDemand(plan,new AbortController().signal);cleanups.push(()=>releaseAlpacaSeasonalityDailyDemand(demand));return{producer,plan,demand};
}
const request={firstLoadedTime:FIRST,session:'regular' as const};
it('constructs the genuine source interval request and returns only its privately owned folded prefix count',async()=>{
 const f=await fixture(),window=await prepareAlpacaSeasonalityDailyWindow(f.demand,f.plan,new AbortController().signal,request),facts=captureAlpacaSeasonalityGeometryFacts(window);
 expect(facts).toEqual({firstObservedTime:unix('2024-03-01T14:30:00Z'),firstLoadedTime:FIRST,prefixBars:2,session:'regular'});expect(alpacaSeasonalityGeometryFactsMatch(facts!,window)).toBe(true);expect(alpacaSeasonalityGeometryFactsMatch({...facts},window)).toBe(false);
 const actual=f.producer.requests.filter(isPrefix);expect(actual).toHaveLength(1);expect(actual[0]).toMatchObject({symbol:'GME',timeframe:'15Min',feed:'sip',adjustment:'split',start:FROM,end:FIRST,plan:'paid'});
 releaseAlpacaSeasonalityDailyDemand(f.demand);expect(()=>assertAlpacaSeasonalityDailyWindow(window)).toThrow();expect(alpacaSeasonalityGeometryFactsMatch(facts!,window)).toBe(false);expect(alpacaSeasonalityDailyUsage(f.producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
it('keeps EACH actual page and inspection envelope funded until all three retained aliases are consumed',async()=>{
 const seen:number[]=[];let producer:Awaited<ReturnType<typeof publishedSource>>|null=null;
 const f=await fixture(async request=>{await Promise.resolve();seen.push(alpacaSeasonalityDailyUsage(producer!.provider)!.numericSlots);return request.pageToken==='B'?prefixResponse(request,prefix.slice(4)):request.pageToken==='A'?prefixResponse(request,prefix.slice(2,4),'B'):prefixResponse(request,prefix.slice(0,2),'A');});producer=f.producer;
 const window=await prepareAlpacaSeasonalityDailyWindow(f.demand,f.plan,new AbortController().signal,request);expect(captureAlpacaSeasonalityGeometryFacts(window)?.prefixBars).toBe(2);
 expect(seen).toHaveLength(3);expect(seen[0]).toBeGreaterThanOrEqual(100000);expect(seen[1]-seen[0]).toBeGreaterThanOrEqual(165536);expect(seen[2]-seen[1]).toBeGreaterThanOrEqual(165536);
 expect(alpacaSeasonalityDailyUsage(f.producer.provider)!.numericSlots).toBeLessThan(seen[0]);
});
it('never promotes a completed page prefix when the final actual response still has a pagination token',async()=>{
 const f=await fixture(request=>prefixResponse(request,request.pageToken==='B'?prefix.slice(4):request.pageToken==='A'?prefix.slice(2,4):prefix.slice(0,2),request.pageToken==='B'?'C':request.pageToken==='A'?'B':'A'));
 await expect(prepareAlpacaSeasonalityDailyWindow(f.demand,f.plan,new AbortController().signal,request)).rejects.toThrow(/three pages|prefix/i);expect(f.producer.requests.filter(isPrefix)).toHaveLength(3);
 releaseAlpacaSeasonalityDailyDemand(f.demand);expect(alpacaSeasonalityDailyUsage(f.producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
it('source disposal keeps earlier retained pages AND the final uncancellable response charged until settlement',async()=>{
 let settle!:(value:ReturnType<typeof prefixResponse>)=>void,sent!:Request;
 const f=await fixture(request=>request.pageToken?(sent=request,new Promise(resolve=>{settle=resolve;})):prefixResponse(request,prefix.slice(0,4),'A'));
 const pending=prepareAlpacaSeasonalityDailyWindow(f.demand,f.plan,new AbortController().signal,request).then(()=>false,()=>true);await flushMtf();
 cleanups.push(async()=>{settle(prefixResponse(sent,prefix.slice(4)));await flushMtf();});expect(f.producer.requests.filter(isPrefix)).toHaveLength(2);f.producer.dispose();expect(alpacaSeasonalityDailyUsage(f.producer.provider)!.numericSlots).toBeGreaterThanOrEqual(265536);
 settle(prefixResponse(sent,prefix.slice(4)));expect(await pending).toBe(true);expect(alpacaSeasonalityDailyUsage(f.producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
it('a caller timestamp cannot replace the actual selected first-loaded source or cause a prefix request',async()=>{
 const f=await fixture();await expect(prepareAlpacaSeasonalityDailyWindow(f.demand,f.plan,new AbortController().signal,{firstLoadedTime:FIRST+1800,session:'regular'})).rejects.toThrow(/actual selected|first-loaded/i);expect(f.producer.requests.filter(isPrefix)).toHaveLength(0);
 const actual=await prepareAlpacaSeasonalityDailyWindow(f.demand,f.plan,new AbortController().signal,request);expect(captureAlpacaSeasonalityGeometryFacts(actual)?.prefixBars).toBe(2);
});
