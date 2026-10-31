import {expect,it} from 'vitest';
import {seasonalityIntradayCoordinates,seasonalityIntradayAxisCost} from '../../src/chart/seasonality-calendar-axis';
const sec=(value:string)=>Date.parse(value)/1000;
it('regular hourly future anchors preserve six ordinary steps plus the short final candle',()=>{
 const value=seasonalityIntradayCoordinates({minutes:60,session:'regular'},sec('2023-03-01T14:30:00Z'),sec('2023-04-01T04:00:00Z'))!;
 expect([...value.times.slice(0,3)]).toEqual(['2023-03-01T15:30:00Z','2023-03-01T20:30:00Z','2023-03-02T14:30:00Z'].map(Date.parse));
 expect([...value.offsets.slice(0,3)]).toEqual([1,6,7]);
 expect(value.times.length).toBeLessThanOrEqual(373);
});
it('Friday-to-Monday boundary keeps the next actual expected bar exactly one ordinal away',()=>{
 const value=seasonalityIntradayCoordinates({minutes:60,session:'regular'},sec('2023-03-31T19:30:00Z'),sec('2023-04-01T04:00:00Z'))!;
 expect([...value.times]).toEqual([Date.parse('2023-04-03T13:30:00Z')]);expect([...value.offsets]).toEqual([1]);
});
it('DST changes clock hours without changing seven regular hourly slots',()=>{
 const value=seasonalityIntradayCoordinates({minutes:60,session:'regular'},sec('2023-03-10T20:30:00Z'),sec('2023-04-01T04:00:00Z'))!;
 expect([...value.times.slice(0,3)]).toEqual(['2023-03-13T13:30:00Z','2023-03-13T19:30:00Z','2023-03-14T13:30:00Z'].map(Date.parse));
 expect([...value.offsets.slice(0,3)]).toEqual([1,7,8]);
});
it('extended hourly geometry resets at each segment and observes the early close',()=>{
 const value=seasonalityIntradayCoordinates({minutes:60,session:'extended'},sec('2023-11-24T09:00:00Z'),sec('2023-12-01T05:00:00Z'))!;
 expect([...value.times.slice(0,6)]).toEqual(['2023-11-24T10:00:00Z','2023-11-24T14:00:00Z','2023-11-24T14:30:00Z','2023-11-24T17:30:00Z','2023-11-24T18:00:00Z','2023-11-24T21:00:00Z'].map(Date.parse));
 expect([...value.offsets.slice(0,6)]).toEqual([1,5,6,9,10,13]);
});
it('one-minute geometry stores sparse anchors rather than a full month of bars',()=>{
 const value=seasonalityIntradayCoordinates({minutes:1,session:'regular'},sec('2023-03-01T14:30:00Z'),sec('2023-04-01T04:00:00Z'))!;
 expect([...value.offsets.slice(0,3)]).toEqual([1,389,390]);expect(value.times.length).toBeLessThan(70);expect(value.offsets.at(-1)).toBe(8969+1);
});
it('tails, session, certified years and month boundary are independent refusal gates',()=>{
 for(const [plan,tail,right]of [
  [{minutes:60,session:'regular'},'2023-03-01T14:45:00Z','2023-04-01T04:00:00Z'],
  [{minutes:60,session:'regular'},'2023-03-01T09:00:00Z','2023-04-01T04:00:00Z'],
  [{minutes:1,session:'regular'},'2023-03-01T14:30:00Z','2023-05-01T04:00:00Z'],
  [{minutes:1,session:'regular'},'2029-03-01T14:30:00Z','2029-04-01T04:00:00Z'],
 ] as const)expect(()=>seasonalityIntradayCoordinates(plan,sec(tail),sec(right))).toThrow();
});
it('fixed overlap cost includes both supplied, new-native and previous-native pairs',()=>{
 expect(seasonalityIntradayAxisCost(1)).toEqual({operations:2048*62+256*373+1024+32768,numericSlots:6*373+24+1024});
 expect(()=>seasonalityIntradayAxisCost(0)).toThrow();
});
