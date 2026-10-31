import {afterEach,expect,it} from 'vitest';
import {planSeasonalityDailyHistory,closedPublishedSeasonalityPoint,inspectSeasonalityDailyEcho,closedSeasonalityDailyPage,type SeasonalityDailySentRequest} from '../../src/domain/seasonality-daily-history';
import {captureAlpacaSeasonalityDailyPlan} from '../../src/domain/alpaca-live';
import {publishedSource,unix,flushMtf} from '../fixtures/qualified-nyse-mtf-source';
const owned:{dispose():void}[]=[];
afterEach(()=>{const errors:unknown[]=[];for(const item of owned.splice(0).reverse())try{item.dispose();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'SYNTHETIC daily provider test cleanup failed.');});
const request:SeasonalityDailySentRequest={symbol:'GME',feed:'sip',adjustment:'split',start:unix('2024-03-01T05:00:00Z'),end:unix('2024-03-12T03:59:59Z')};
function response(rows:unknown[],overrides:Record<string,unknown>={}){
 const url=new URL('https://data.alpaca.markets/v2/stocks/GME/bars');url.searchParams.set('timeframe','1Day');url.searchParams.set('feed','sip');url.searchParams.set('adjustment','split');url.searchParams.set('start',new Date(request.start*1000).toISOString());url.searchParams.set('end',new Date(request.end*1000).toISOString());
 return{schemaVersion:1,symbol:'GME',timeframe:'1Day',seconds:86400,feed:'sip',bars:rows,nextPageToken:null,provenance:{feed:'sip',sourceUrl:url.href},...overrides};
}
it('retains requested1900 and separately declares2015 history floor without claiming IPO history',()=>{
 const plan=planSeasonalityDailyHistory(1900,2028,unix('2024-03-11T19:45:00Z'));
 expect(plan.requestedStartYear).toBe(1900);expect(plan.calendarStartYear).toBe(2015);expect(plan.coveredRequestFrom).toBe(unix('2015-01-01T05:00:00Z'));expect(plan.closedThrough).toBe(unix('2024-03-11T04:00:00Z'));expect(plan.transportNumericSlots).toBe(100000);expect(plan.notices.join(' ')).toContain('not an IPO date');
});
it('finishes a published NY day only after its full observed period including DST',()=>{
 const row={time:unix('2024-03-08T05:00:00Z'),close:110};
 expect(closedPublishedSeasonalityPoint(row,request.start,unix('2024-03-09T04:59:59Z'))).toBeNull();
 expect(closedPublishedSeasonalityPoint(row,request.start,unix('2024-03-09T05:00:00Z'))).toEqual({time:unix('2024-03-08T05:00:00Z'),close:110,availableAt:unix('2024-03-09T05:00:00Z'),finalized:true});
});
it('never reads the eventual close of the actual unclosed day',()=>{
 let reads=0;const row={time:unix('2024-03-11T04:00:00Z'),get close(){reads++;throw Error('Future close must not be consumed.');}};
 expect(closedPublishedSeasonalityPoint(row,request.start,request.end)).toBeNull();expect(reads).toBe(0);
});
it('accepts only the coherent response endpoint/feed/basis and min sent/echo window',()=>{
 const row={time:unix('2024-03-08T05:00:00Z'),close:110},value=response([row]),echo=inspectSeasonalityDailyEcho(value,request);
 expect(echo).toEqual({from:request.start,through:request.end,rows:1,nextPageToken:null});expect(closedSeasonalityDailyPage(value,echo,20)).toEqual([{...row,availableAt:unix('2024-03-09T05:00:00Z'),finalized:true}]);
 for(const override of [{feed:'iex'},{symbol:'SPY'},{timeframe:'1Min'},{nextPageToken:''}])expect(()=>inspectSeasonalityDailyEcho(response([row],override),request)).toThrow();
 const smaller=response([row]);const url=new URL(smaller.provenance.sourceUrl);url.searchParams.set('end','2024-03-09T05:00:00.000Z');smaller.provenance.sourceUrl=url.href;expect(inspectSeasonalityDailyEcho(smaller,request).through).toBe(unix('2024-03-09T05:00:00Z'));
});
it('refuses an oversized page before any row getter or new point array',()=>{
 let reads=0;const rows=new Array(10001);Object.defineProperty(rows,'0',{get(){reads++;throw Error('Do not visit oversized page.');},enumerable:true});
 expect(()=>inspectSeasonalityDailyEcho(response(rows),request)).toThrow(/row bound/);expect(reads).toBe(0);
});
it('rejects non-NY date labels and nontrading daily observations without inventing a missing price',()=>{
 for(const time of [unix('2024-03-08T00:00:00Z'),unix('2024-03-09T05:00:00Z')])expect(()=>closedPublishedSeasonalityPoint({time,close:110},request.start,request.end)).toThrow();
});
it('captures the real provider constructor only and fake/copy/proxy metadata cannot create a plan',async()=>{
 const producer=await publishedSource();owned.push(producer);const actual=producer.raw(),plan=captureAlpacaSeasonalityDailyPlan(actual,actual.bars,2015,2024);expect(plan).not.toBeNull();expect(()=>plan!.assertCurrent()).not.toThrow();
 let traps=0;const proxy=new Proxy(actual,{get(){traps++;throw Error('No fake-source trap');},getOwnPropertyDescriptor(){traps++;throw Error('No fake-source trap');}});
 expect(captureAlpacaSeasonalityDailyPlan({...actual},actual.bars,2015,2024)).toBeNull();expect(captureAlpacaSeasonalityDailyPlan(proxy,actual.bars,2015,2024)).toBeNull();expect(captureAlpacaSeasonalityDailyPlan(actual,[...actual.bars],2015,2024)).toBeNull();expect(traps).toBe(0);
});
it('actual price advancement retires an old plan instead of advancing its saved cutoff',async()=>{
 const producer=await publishedSource();owned.push(producer);const actual=producer.raw(),plan=captureAlpacaSeasonalityDailyPlan(actual,actual.bars,2015,2024)!;expect(plan).not.toBeNull();const before=plan.facts.requestedThrough;
 producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:unix('2024-03-11T19:59:30Z'),price:140,high:140,low:140,size:1}],receivedAt:''});await flushMtf();expect(()=>plan.assertCurrent()).toThrow();expect(plan.facts.requestedThrough).toBe(before);expect(()=>plan.assertCurrent()).toThrow();
});
