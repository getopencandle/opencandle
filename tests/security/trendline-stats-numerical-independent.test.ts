import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {calculateTrendlineStatistics,prepareTrendlineStatisticsGrid} from '../../src/domain/trendline-statistics';
import type {Bar} from '../../src/domain/types';

const corpus=JSON.parse(readFileSync('tests/security/trendline-stats-fraction-oracles.json','utf8')) as {cases:{label:string;firstBits:string;secondBits:string;expectedPercentBits:string|null;expectedStatus:string}[]};
const number=(bits:string)=>Buffer.from(bits,'hex').readDoubleBE(0);
const bits=(value:number)=>{const buffer=Buffer.alloc(8);buffer.writeDoubleBE(value);return buffer.toString('hex');};
it.each(corpus.cases)('independent Fraction percentage bits: $label',row=>{
 const result=calculateTrendlineStatistics([{time:0,price:number(row.firstBits)},{time:1000,price:number(row.secondBits)}]).percentChange;
 expect(result.state).toBe(row.expectedStatus);if(result.state==='available')expect(bits(result.value)).toBe(row.expectedPercentBits);else expect(result.reason.length).toBeGreaterThan(0);
});

it('fractional-millisecond raw duration is independent of unavailable timezone labels and bar mapping',()=>{
 const result=calculateTrendlineStatistics([{time:0.25,price:2},{time:1.75,price:3}],{timezone:'America/New_York'});
 expect(result.dateTimeRange).toEqual({state:'available',value:{startMs:0.25,endMs:1.75,elapsedMs:1.5}});expect(result.dateTimeLabels.state).toBe('unavailable');expect(result.barsRange.state).toBe('unavailable');expect(result.priceRange).toEqual({state:'available',value:1});expect(result.percentChange).toEqual({state:'available',value:50});
});

it('a detached irregular grid ignores later input mutations while no copied handle authorizes it',()=>{
 const row=(time:number):Bar=>({time,open:1,high:2,low:0,close:1,volume:1}),input=[0,60,180,86400].map(row),grid=prepareTrendlineStatisticsGrid(input),anchors=[{time:90000,price:10},{time:86400000,price:20}];
 input[1].time=100000;input.push(row(100001));expect(calculateTrendlineStatistics(anchors,{grid}).barsRange).toEqual({state:'available',value:1.75});expect(()=>calculateTrendlineStatistics(anchors,{grid:{...grid}})).toThrow(/privately prepared/);
 const outside=calculateTrendlineStatistics([{time:0,price:10},{time:172800000,price:20}],{grid});expect(outside.barsRange.state).toBe('unavailable');expect(outside.dateTimeRange).toEqual({state:'available',value:{startMs:0,endMs:172800000,elapsedMs:172800000}});expect(outside.percentChange).toEqual({state:'available',value:100});
});
