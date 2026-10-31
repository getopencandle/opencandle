import {expect,it} from 'vitest';
import {seasonalityCalendarSpine,seasonalityCalendarAxisCost} from '../../src/chart/seasonality-calendar-axis';
import type {SeasonalityCalendarContract} from '../../src/domain/indicators-ext/seasonality-months';
const second=(date:string)=>Date.parse(date)/1000;
const contract=(kind:'daily'|'monthly'='daily',ny=false):SeasonalityCalendarContract=>({calendar:ny?'nyse':'utc-continuous',session:ny?'regular':'continuous',dateLabels:ny?'calendar-midnight':'utc-date',kind});
// Original synthetic geometry labels, no OHLC/source/publication authority.
it.each([
 ['2022-02-01T00:00:00Z','2022-03-01T00:00:00Z'],
 ['2020-02-01T00:00:00Z','2020-03-01T00:00:00Z'],
 ['2022-04-01T00:00:00Z','2022-05-01T00:00:00Z'],
])('monthly calendar advances exactly one qualified label from %s to %s',(tail,right)=>{
 const value=seasonalityCalendarSpine(contract('monthly'),second(tail),second(right));expect(Array.from(value!)).toEqual([Date.parse(right)]);
});
it('NY monthly labels retain actual midnight offset across the March DST month',()=>{
 const value=seasonalityCalendarSpine(contract('monthly',true),second('2017-03-01T05:00:00Z'),second('2017-04-01T04:00:00Z'));
 expect(Array.from(value!)).toEqual([Date.parse('2017-04-01T04:00:00Z')]);
});
it('continuous daily future labels include the next calendar date',()=>{
 const value=seasonalityCalendarSpine(contract(),second('2017-03-31T00:00:00Z'),second('2017-04-01T00:00:00Z'));
 expect(Array.from(value!)).toEqual([Date.parse('2017-04-01T00:00:00Z')]);
});
it('NY daily month edge brackets Saturday April1 by the genuine Monday April3 label',()=>{
 const value=seasonalityCalendarSpine(contract('daily',true),second('2017-03-31T04:00:00Z'),second('2017-04-01T04:00:00Z'));
 expect(Array.from(value!)).toEqual([Date.parse('2017-04-03T04:00:00Z')]);
});
it('February24 to March1 has three future NYSE sessions rather than five elapsed days',()=>{
 const value=seasonalityCalendarSpine(contract('daily',true),second('2017-02-24T05:00:00Z'),second('2017-03-01T05:00:00Z'));
 expect(Array.from(value!)).toEqual(['2017-02-27T05:00:00Z','2017-02-28T05:00:00Z','2017-03-01T05:00:00Z'].map(Date.parse));
});
it('the NY daily spine crosses the spring weekend with literal71-hour label spacing',()=>{
 const tail=second('2017-03-10T05:00:00Z'),value=seasonalityCalendarSpine(contract('daily',true),tail,second('2017-04-01T04:00:00Z'))!;
 expect(value[0]).toBe(Date.parse('2017-03-13T04:00:00Z'));expect(value[0]/1000-tail).toBe(71*3600);expect(value[value.length-1]).toBe(Date.parse('2017-04-03T04:00:00Z'));expect(value.length).toBeLessThanOrEqual(62);expect(value.buffer.byteLength).toBe(62*8);
});
it('a NYSE holiday is not invented as an observed future daily slot',()=>{
 const value=seasonalityCalendarSpine(contract('daily',true),second('2017-12-22T05:00:00Z'),second('2018-01-01T05:00:00Z'))!;
 expect(value[0]).toBe(Date.parse('2017-12-26T05:00:00Z'));expect(value[value.length-1]).toBe(Date.parse('2018-01-02T05:00:00Z'));expect(Array.from(value)).not.toContain(Date.parse('2017-12-25T05:00:00Z'));
});
it('already loaded right edges allocate no future spine and arbitrary later targets refuse',()=>{
 const tail=second('2017-03-31T00:00:00Z');expect(seasonalityCalendarSpine(contract(),tail,tail)).toBeNull();
 expect(()=>seasonalityCalendarSpine(contract(),tail,second('2017-05-01T00:00:00Z'))).toThrow(/future calendar/i);
});
it('uncertified next-year NYSE sessions and nonlabel daily tails refuse',()=>{
 expect(()=>seasonalityCalendarSpine(contract('daily',true),second('2028-12-29T05:00:00Z'),second('2029-01-01T05:00:00Z'))).toThrow(/future calendar/i);
 expect(()=>seasonalityCalendarSpine(contract(),second('2017-03-31T12:00:00Z'),second('2017-04-01T00:00:00Z'))).toThrow(/future calendar/i);
});
it('cost admits all three bounded buffers and private owner facts before constructing labels',()=>{
 expect(seasonalityCalendarAxisCost(1)).toEqual({operations:88320,numericSlots:722});expect(seasonalityCalendarAxisCost(1000)).toEqual({operations:599808,numericSlots:24698});
 for(const count of [0,1001,NaN,1.5])expect(()=>seasonalityCalendarAxisCost(count)).toThrow();
});
it('NYSE UTC-date labels remain literalUTC midnight rather than borrowing exchange-midnight transport',()=>{
 const declared:SeasonalityCalendarContract={...contract('daily',true),dateLabels:'utc-date'};
 const value=seasonalityCalendarSpine(declared,second('2017-03-31T00:00:00Z'),second('2017-04-01T00:00:00Z'))!;
 expect(Array.from(value)).toEqual([Date.parse('2017-04-03T00:00:00Z')]);expect(value[0]).not.toBe(Date.parse('2017-04-03T04:00:00Z'));
});
