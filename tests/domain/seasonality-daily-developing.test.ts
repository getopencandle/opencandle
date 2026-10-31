import {afterEach,expect,it} from 'vitest';
import {acquireAlpacaSeasonalityDailyDemand,prepareAlpacaSeasonalityDailyWindow,consumeAlpacaSeasonalityDailyWindow,assertAlpacaSeasonalityDailyWindow,releaseAlpacaSeasonalityDailyDemand,subscribeAlpacaSeasonalityDailyDemand,captureAlpacaSeasonalityDailyPlan,alpacaSeasonalityDailyUsage} from '../../src/domain/alpaca-live';
import {publishedSource,response,fridayMonday,unix,flushMtf,type Request} from '../fixtures/qualified-nyse-mtf-source';
import type {SeasonalityResult} from '../../src/domain/indicators-ext/seasonality-types';

const owned:(()=>void)[]=[];
afterEach(()=>{const errors:unknown[]=[];for(const cleanup of owned.splice(0).reverse())try{cleanup();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'SYNTHETIC developing-source cleanup failed.');});
const settings={startYear:2024,endYear:2024,excludedMonths:'',includeDevelopingInSummaries:false,meanRow:false,deviationRow:false,positiveFrequencyRow:false,projectionGeometry:false};
async function source(){
 const producer=await publishedSource({reply:async(request:Request)=>{
  if(request.timeframe!=='1Day')return response(request,fridayMonday().filter(row=>row.time>=request.start&&row.time<=request.end));
  const value=response(request,[['2024-02-29T05:00:00Z',100],['2024-03-08T05:00:00Z',110]].map(([date,price])=>({time:unix(date as string),open:price as number,high:price as number,low:price as number,close:price as number,volume:1})));value.value.seconds=86400;return value;
 }});owned.push(()=>producer.dispose());
 const raw=producer.raw(),plan=captureAlpacaSeasonalityDailyPlan(raw,raw.bars,2024,2024)!;expect(plan).not.toBeNull();
 const demand=acquireAlpacaSeasonalityDailyDemand(plan,new AbortController().signal);owned.push(()=>releaseAlpacaSeasonalityDailyDemand(demand));return{producer,demand};
}
type DevelopingFixture=Awaited<ReturnType<typeof source>>;
async function calculate(live:DevelopingFixture){
 const raw=live.producer.raw(),plan=captureAlpacaSeasonalityDailyPlan(raw,raw.bars,2024,2024)!;expect(plan).not.toBeNull();
 const window=await prepareAlpacaSeasonalityDailyWindow(live.demand,plan,new AbortController().signal),times=raw.bars.map(row=>row.time);
 return{window,result:consumeAlpacaSeasonalityDailyWindow(window,{times,firstObservedTime:times[0]},settings)};
}
function march(result:SeasonalityResult){expect(result.status).toBe('ready');if(result.status!=='ready')throw Error(result.diagnostic);return result.scene.years.find(year=>year.year===2024)!.cells.find(cell=>cell.month==='2024-03')!;}
function trade(live:DevelopingFixture,price:number,time='2024-03-11T19:59:30Z'){
 live.producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:unix(time),price,high:price,low:price,size:1}],receivedAt:''});
}
it('uses an actually received current-day trade independently of closed historical daily prices',async()=>{
 const live=await source(),before=await calculate(live);expect(march(before.result).value).toBeCloseTo(10,12);
 trade(live,140);await flushMtf();expect(()=>assertAlpacaSeasonalityDailyWindow(before.window)).toThrow();
 const next=await calculate(live);expect(march(next.result)).toMatchObject({state:'developing',observedSessions:2});expect(march(next.result).value).toBeCloseTo(40,12);
 if(next.result.status==='ready')expect(next.result.scene.sourceKeyDescription).toContain('separately observed SIP stream close');
 expect(live.producer.requests.filter(request=>request.timeframe==='1Day')).toHaveLength(1);
});
it('actual daily-only receipt wakes the demand and retires the old D lease even when intraday bar revision stays unchanged',async()=>{
 const live=await source(),before=await calculate(live),revision=live.producer.raw().provenance.revision;let notices=0;const wake=()=>{notices++;};owned.push(subscribeAlpacaSeasonalityDailyDemand(live.demand,wake));
 live.producer.emit({schemaVersion:1,kind:'batch',bars:[{symbol:'GME',kind:'daily',seconds:86400,time:unix('2024-03-11T04:00:00Z'),open:120,high:135,low:115,close:130,volume:1}],trades:[],receivedAt:''});await flushMtf();
 expect(notices).toBe(1);expect(live.producer.raw().provenance.revision).toBe(revision);expect(()=>assertAlpacaSeasonalityDailyWindow(before.window)).toThrow();expect(march((await calculate(live)).result).value).toBeCloseTo(30,12);
});
it('an untimed daily aggregate cannot overwrite a separately timed trade or create a consolidated price seam',async()=>{
 const live=await source();await calculate(live);trade(live,140);await flushMtf();
 live.producer.emit({schemaVersion:1,kind:'batch',bars:[{symbol:'GME',kind:'daily',seconds:86400,time:unix('2024-03-11T04:00:00Z'),open:90,high:90,low:90,close:90,volume:1}],trades:[],receivedAt:''});await flushMtf();
 expect(march((await calculate(live)).result).value).toBeCloseTo(40,12);
});
it('retired clients do not receive later stream wakes and release their funded monthly/window graphs',async()=>{
 const live=await source();await calculate(live);let notices=0;const wake=()=>{notices++;};const off=subscribeAlpacaSeasonalityDailyDemand(live.demand,wake);owned.push(off);
 releaseAlpacaSeasonalityDailyDemand(live.demand);trade(live,140);await flushMtf();expect(notices).toBe(0);expect(alpacaSeasonalityDailyUsage(live.producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
