import {afterEach,expect,it} from 'vitest';
import {acquireAlpacaSeasonalityDailyDemand,prepareAlpacaSeasonalityDailyWindow,assertAlpacaSeasonalityDailyWindow,releaseAlpacaSeasonalityDailyWindow,releaseAlpacaSeasonalityDailyDemand,captureAlpacaSeasonalityDailyPlan,alpacaSeasonalityDailyUsage,type AlpacaSeasonalityDailyPlan} from '../../src/domain/alpaca-live';
import {publishedSource,response,fridayMonday,unix,flushMtf,type Request} from '../fixtures/qualified-nyse-mtf-source';
import type {Bar} from '../../src/domain/types';

// Actual constructor + explicit invented bridge responses. No request reaches
// an account/network, and no fixture can attach a private source/window owner.
const cleanups:(()=>void|Promise<void>)[]=[];
afterEach(async()=>{const errors:unknown[]=[];for(const cleanup of cleanups.splice(0).reverse())try{await cleanup();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'SYNTHETIC daily service cleanup failed.');});
const daily=[['2024-03-07T05:00:00Z',100],['2024-03-08T05:00:00Z',110]].map(([date,price])=>({time:unix(date as string),open:price as number,high:price as number,low:price as number,close:price as number,volume:1}));
function dailyResponse(request:Request,rows:Bar[]=daily,next:string|null=null){
 const result=response(request,rows,{next});result.value.seconds=86400;
 if(request.pageToken){const url=new URL(result.value.provenance.sourceUrl);url.searchParams.set('page_token',request.pageToken);result.value.provenance.sourceUrl=url.href;}
 return result;
}
function planned(producer:Awaited<ReturnType<typeof publishedSource>>):AlpacaSeasonalityDailyPlan{
 const raw=producer.raw(),plan=captureAlpacaSeasonalityDailyPlan(raw,raw.bars,2024,2024);expect(plan).not.toBeNull();return plan!;
}
async function source(reply?:(request:Request)=>ReturnType<typeof dailyResponse>|Promise<ReturnType<typeof dailyResponse>>){
 const producer=await publishedSource({reply:async request=>request.timeframe==='1Day'?(reply?reply(request):dailyResponse(request)):response(request,fridayMonday().filter(row=>row.time>=request.start&&row.time<=request.end))});
 cleanups.push(()=>producer.dispose());return producer;
}
function demand(producer:Awaited<ReturnType<typeof publishedSource>>,plan=planned(producer)){
 const controller=new AbortController(),key=acquireAlpacaSeasonalityDailyDemand(plan,controller.signal);cleanups.push(()=>releaseAlpacaSeasonalityDailyDemand(key));return{key,plan,controller};
}
it('uses the actual provider request and shares one completed daily cache between current model demands',async()=>{
 const producer=await source(),a=demand(producer),b=demand(producer,a.plan),signal=new AbortController().signal;
 const [first,second]=await Promise.all([prepareAlpacaSeasonalityDailyWindow(a.key,a.plan,signal),prepareAlpacaSeasonalityDailyWindow(b.key,b.plan,signal)]);
 cleanups.push(()=>releaseAlpacaSeasonalityDailyWindow(first),()=>releaseAlpacaSeasonalityDailyWindow(second));
 expect(first).not.toBe(second);expect(()=>assertAlpacaSeasonalityDailyWindow(first)).not.toThrow();expect(()=>assertAlpacaSeasonalityDailyWindow(second)).not.toThrow();
 const requests=producer.requests.filter(row=>row.timeframe==='1Day');expect(requests).toHaveLength(1);expect(requests[0]).toMatchObject({symbol:'GME',feed:'sip',adjustment:'split',plan:'paid',start:unix('2023-12-01T05:00:00Z'),end:unix('2024-03-11T20:00:00Z')});
 releaseAlpacaSeasonalityDailyDemand(a.key);expect(()=>assertAlpacaSeasonalityDailyWindow(first)).toThrow();expect(()=>assertAlpacaSeasonalityDailyWindow(second)).not.toThrow();
 releaseAlpacaSeasonalityDailyDemand(b.key);expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
it('does not authenticate copied or proxy demand/provider objects or execute their supplied getters',async()=>{
 const producer=await source();let traps=0;const fake=new Proxy({},{get(){traps++;throw Error('Untrusted getter');},getOwnPropertyDescriptor(){traps++;throw Error('Untrusted descriptor');}});
 expect(alpacaSeasonalityDailyUsage(fake as typeof producer.provider)).toBeNull();
 expect(()=>prepareAlpacaSeasonalityDailyWindow(fake as ReturnType<typeof acquireAlpacaSeasonalityDailyDemand>,planned(producer),new AbortController().signal)).toThrow();expect(traps).toBe(0);
});
it('one cancelled frame cannot cancel another current model sharing the actual pending response',async()=>{
 let settle!:(value:ReturnType<typeof dailyResponse>)=>void,request!:Request;
 const producer=await source(sent=>{request=sent;return new Promise(resolve=>{settle=resolve;});}),a=demand(producer),b=demand(producer,a.plan),frame=new AbortController();
 cleanups.push(async()=>{settle(dailyResponse(request));await flushMtf();});
 const first=prepareAlpacaSeasonalityDailyWindow(a.key,a.plan,frame.signal).then(()=>false,()=>true),second=prepareAlpacaSeasonalityDailyWindow(b.key,b.plan,new AbortController().signal);
 expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBeGreaterThanOrEqual(100000);frame.abort();settle(dailyResponse(request));expect(await first).toBe(true);
 const accepted=await second;cleanups.push(()=>releaseAlpacaSeasonalityDailyWindow(accepted));expect(()=>assertAlpacaSeasonalityDailyWindow(accepted)).not.toThrow();expect(producer.requests.filter(row=>row.timeframe==='1Day')).toHaveLength(1);
});
it('disposal retires authority immediately but retains the uncancellable page charge until actual settlement',async()=>{
 let settle!:(value:ReturnType<typeof dailyResponse>)=>void,request!:Request;
 const producer=await source(sent=>{request=sent;return new Promise(resolve=>{settle=resolve;});}),a=demand(producer);
 cleanups.push(async()=>{settle(dailyResponse(request));await flushMtf();});
 const pending=prepareAlpacaSeasonalityDailyWindow(a.key,a.plan,new AbortController().signal).then(()=>false,()=>true);
 producer.dispose();expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBeGreaterThanOrEqual(100000);expect(()=>acquireAlpacaSeasonalityDailyDemand(a.plan,new AbortController().signal)).toThrow();
 settle(dailyResponse(request));expect(await pending).toBe(true);expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
it('does not promote a completed first page when the actual next response changes adjustment basis',async()=>{
 const producer=await source(request=>{
  if(!request.pageToken)return dailyResponse(request,[daily[0]],'next');
  const value=dailyResponse(request,[daily[1]]),url=new URL(value.value.provenance.sourceUrl);url.searchParams.set('adjustment','split,dividend');value.value.provenance.sourceUrl=url.href;return value;
 }),a=demand(producer);
 await expect(prepareAlpacaSeasonalityDailyWindow(a.key,a.plan,new AbortController().signal)).rejects.toThrow();
 expect(producer.requests.filter(row=>row.timeframe==='1Day')).toHaveLength(2);releaseAlpacaSeasonalityDailyDemand(a.key);expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
it('source basis reload terminally retires an accepted old lease and does not revive it on return to the old basis',async()=>{
 const producer=await source(),a=demand(producer),window=await prepareAlpacaSeasonalityDailyWindow(a.key,a.plan,new AbortController().signal);cleanups.push(()=>releaseAlpacaSeasonalityDailyWindow(window));
 producer.provider.setDividendAdjustment(true);await flushMtf();expect(()=>assertAlpacaSeasonalityDailyWindow(window)).toThrow();
 producer.provider.setDividendAdjustment(false);await flushMtf();expect(()=>assertAlpacaSeasonalityDailyWindow(window)).toThrow();expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
it('ordinary price ticks retire the old frame plan while preserving admitted daily history for a fresh actual frame',async()=>{
 const producer=await source(),a=demand(producer),window=await prepareAlpacaSeasonalityDailyWindow(a.key,a.plan,new AbortController().signal);cleanups.push(()=>releaseAlpacaSeasonalityDailyWindow(window));
 producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:unix('2024-03-11T19:59:30Z'),price:140,high:140,low:140,size:1}],receivedAt:''});await flushMtf();expect(()=>assertAlpacaSeasonalityDailyWindow(window)).toThrow();
 const fresh=planned(producer),replacement=await prepareAlpacaSeasonalityDailyWindow(a.key,fresh,new AbortController().signal);cleanups.push(()=>releaseAlpacaSeasonalityDailyWindow(replacement));expect(()=>assertAlpacaSeasonalityDailyWindow(replacement)).not.toThrow();expect(producer.requests.filter(row=>row.timeframe==='1Day')).toHaveLength(1);
});
