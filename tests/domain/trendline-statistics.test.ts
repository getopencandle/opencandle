import {expect,it,vi} from 'vitest';
import type {Bar} from '../../src/domain/types';
import {calculateTrendlineStatistics as calculate,prepareTrendlineStatisticsGrid as prepare,TRENDLINE_TIME_MIN_MS,TRENDLINE_TIME_MAX_MS,type TrendlineStatistic} from '../../src/domain/trendline-statistics';
const bar=(time:number):Bar=>({time,open:1,high:1,low:1,close:1,volume:1});
const value=<T>(metric:TrendlineStatistic<T>)=>{expect(metric.state).toBe('available');if(metric.state!=='available')throw Error(metric.reason);return metric.value;};

it('signed price/percentage, absolute bar intervals and ordered instants have independent literal definitions',()=>{
 const grid=prepare([0,60,180,86400].map(bar)),anchors=[{time:0,price:100},{time:86400000,price:125}],result=calculate(anchors,{grid,timezone:'UTC'});
 expect(value(result.priceRange)).toBe(25);expect(value(result.percentChange)).toBe(25);expect(value(result.barsRange)).toBe(3);
 expect(value(result.dateTimeRange)).toEqual({startMs:0,endMs:86400000,elapsedMs:86400000});
 expect(value(result.dateTimeLabels)).toEqual({start:'1970-01-01T00:00:00.000+00:00',end:'1970-01-02T00:00:00.000+00:00',timezone:'UTC'});
 const reverse=calculate([...anchors].reverse(),{grid,timezone:'UTC'});expect(value(reverse.priceRange)).toBe(-25);expect(value(reverse.percentChange)).toBe(-20);expect(value(reverse.barsRange)).toBe(3);
 expect(value(reverse.dateTimeRange)).toEqual({startMs:86400000,endMs:0,elapsedMs:86400000});
 expect(value(calculate(anchors,{grid:prepare([0,60,180,86400,90000].map(bar))}).barsRange)).toBe(3);
});

it('fractional logical positions use the supplied irregular grid and never extrapolate future bars',()=>{
 const grid=prepare([0,60,180,86400].map(bar)),fraction=calculate([{time:90000,price:100},{time:86400000,price:125}],{grid});expect(value(fraction.barsRange)).toBe(1.75);
 const outside=calculate([{time:90000,price:100},{time:172800000,price:125}],{grid});expect(outside.barsRange.state).toBe('unavailable');expect(value(outside.priceRange)).toBe(25);expect(value(outside.dateTimeRange).elapsedMs).toBe(172710000);
 const singleton=prepare([bar(0)]);expect(value(calculate([{time:0,price:1},{time:0,price:1}],{grid:singleton}).barsRange)).toBe(0);
 expect(calculate([{time:0,price:1},{time:0,price:1}],{grid:prepare([])}).barsRange.state).toBe('unavailable');
 expect(calculate([{time:0,price:1},{time:Number.MIN_VALUE,price:1}],{grid:prepare([bar(0),bar(1)])}).barsRange.state).toBe('unavailable');
});

it('percentage avoids intermediate overflow and ratio cancellation while final overflow remains unavailable',()=>{
 const percent=(a:number,b:number)=>calculate([{time:0,price:a},{time:1,price:b}]);
 const huge=percent(2**1023,-(2**1023));expect(huge.priceRange.state).toBe('unavailable');expect(value(huge.percentChange)).toBe(-200);
 expect(value(percent(Number.MIN_VALUE,Number.MIN_VALUE*2).percentChange)).toBe(100);
 expect(value(percent(1,1+2**-52).percentChange)).toBe(25*2**-50);
 expect(value(percent(100,100+2**-46).percentChange)).toBe(2**-46);
 expect(value(percent(100,100-2**-46).percentChange)).toBe(-(2**-46));
 expect(percent(Number.MIN_VALUE,Number.MAX_VALUE).percentChange.state).toBe('unavailable');
 expect(Object.is(value(percent(1,1).percentChange),0)).toBe(true);
 for(const first of [0,-0,-1]){const result=percent(first,2);expect(result.percentChange.state).toBe('unavailable');expect(value(result.priceRange)).toBe(2-first);}
 expect(Object.is(value(percent(-0,0).priceRange),0)).toBe(true);
});

it('DST and sub-millisecond time availability stay separate from raw elapsed duration',()=>{
 const anchors=[{time:Date.parse('2026-11-01T05:45:00Z'),price:1},{time:Date.parse('2026-11-01T06:15:00Z'),price:2}],result=calculate(anchors,{timezone:'America/New_York'});
 expect(value(result.dateTimeRange).elapsedMs).toBe(1800000);expect(value(result.dateTimeLabels)).toEqual({start:'2026-11-01T01:45:00.000-04:00',end:'2026-11-01T01:15:00.000-05:00',timezone:'America/New_York'});
 const fraction=calculate([{time:.25,price:1},{time:1.75,price:2}],{timezone:'UTC'});expect(value(fraction.dateTimeRange)).toEqual({startMs:.25,endMs:1.75,elapsedMs:1.5});expect(fraction.dateTimeLabels.state).toBe('unavailable');
 for(const timezone of [undefined,'Not/A_Timezone','x'.repeat(101)]){const row=calculate(anchors,{timezone});expect(row.dateTimeLabels.state).toBe('unavailable');expect(value(row.dateTimeRange).elapsedMs).toBe(1800000);expect(value(row.percentChange)).toBe(100);}
 const edge=calculate([{time:TRENDLINE_TIME_MIN_MS,price:1},{time:TRENDLINE_TIME_MAX_MS,price:2}],{timezone:'UTC'});expect(edge.dateTimeRange.state).toBe('available');expect(value(edge.dateTimeLabels).start.startsWith('0001-01-01T')).toBe(true);
 const localPast=calculate([{time:TRENDLINE_TIME_MIN_MS,price:1},{time:TRENDLINE_TIME_MIN_MS+1000,price:2}],{timezone:'America/New_York'});expect(localPast.dateTimeRange.state).toBe('available');expect(localPast.dateTimeLabels.state).toBe('unavailable');
});

it('invalid metric data does not fabricate zero or discard independently valid metrics',()=>{
 const prices=calculate([{time:0,price:NaN},{time:1000,price:2}],{timezone:'UTC'});expect(prices.priceRange.state).toBe('unavailable');expect(prices.percentChange.state).toBe('unavailable');expect(value(prices.dateTimeRange).elapsedMs).toBe(1000);
 for(const time of [NaN,Infinity,TRENDLINE_TIME_MIN_MS-1,TRENDLINE_TIME_MAX_MS+1]){const result=calculate([{time,price:1},{time:0,price:2}],{timezone:'UTC'});expect(result.dateTimeRange.state).toBe('unavailable');expect(result.dateTimeLabels.state).toBe('unavailable');expect(value(result.priceRange)).toBe(1);}
});

it('private detached grids are immutable snapshots and copied/public-shaped handles have no lookup authority',()=>{
 const rows=[bar(0),bar(60),bar(180)],grid=prepare(rows),anchors=[{time:0,price:1},{time:180000,price:2}];
 rows[1].time=179;Object.defineProperty(rows[2],'time',{get(){throw Error('late source read');}});
 expect(value(calculate(anchors,{grid}).barsRange)).toBe(2);expect(Object.isFrozen(grid)).toBe(true);
 let reads=0;for(const copy of [{...grid},Object.create(grid),{get count(){reads++;return 3;}}])expect(()=>calculate(anchors,{grid:copy as any})).toThrow('privately prepared');expect(reads).toBe(0);
 const output=calculate(anchors,{grid,timezone:'UTC'});expect(Object.isFrozen(output)).toBe(true);expect(Object.isFrozen(output.dateTimeRange)).toBe(true);expect(Object.isFrozen(value(output.dateTimeRange))).toBe(true);
});

it('grid bounds and descriptor-safe admission reject malformed histories without executing indexed or row getters',()=>{
 let reads=0;const indexed=[bar(0)];Object.defineProperty(indexed,'0',{get(){reads++;return bar(0);}});expect(()=>prepare(indexed)).toThrow('data');
 const row=bar(0);Object.defineProperty(row,'time',{get(){reads++;return 0;}});expect(()=>prepare([row])).toThrow('data');
 const oversized=new Array(100001);Object.defineProperty(oversized,'0',{get(){reads++;return bar(0);}});expect(()=>prepare(oversized)).toThrow('bound');
 for(const times of [[0,0],[1,0],[0,.5],[NaN],[Infinity],[-62135596801],[253402300800]])expect(()=>prepare(times.map(bar))).toThrow();
 const extra=[bar(0)] as any;extra.toJSON=()=>{reads++;return[];};expect(()=>prepare(extra)).toThrow('extra');
 const sparse=new Array(1);expect(()=>prepare(sparse)).toThrow('sparse');expect(reads).toBe(0);
});

it('anchor/context boundaries reject hidden, accessor, sparse and custom containers before evaluation',()=>{
 let reads=0;const anchors=[{time:0,price:1},{time:1,price:2}];Object.defineProperty(anchors,'0',{get(){reads++;return{time:0,price:1};}});expect(()=>calculate(anchors)).toThrow('data');
 const point={time:0,price:1};Object.defineProperty(point,'price',{get(){reads++;return 1;}});expect(()=>calculate([point,{time:1,price:2}])).toThrow('data');
 const hidden={time:0,price:1};Object.defineProperty(hidden,'time',{enumerable:false});expect(()=>calculate([hidden,{time:1,price:2}])).toThrow('data');
 const ordinary=[{time:0,price:1},{time:1,price:2}];expect(()=>calculate(ordinary,{get timezone(){reads++;return'UTC';}})).toThrow('context');
 expect(()=>calculate(new Array(2))).toThrow('sparse');expect(()=>calculate(ordinary,Object.assign(Object.create({}),{timezone:'UTC'}))).toThrow('plain');expect(reads).toBe(0);
});

it('strict requested metric lists skip inactive rational/Intl work and leave explicit not-requested outputs',()=>{
 const anchors=[{time:0,price:Number.MIN_VALUE},{time:1000,price:Number.MAX_VALUE}],grid=prepare([bar(0),bar(1)]),format=vi.spyOn(Intl,'DateTimeFormat'),binary=vi.spyOn(globalThis,'DataView');
 try{const result=calculate(anchors,{grid,timezone:'UTC',requested:['priceRange','barsRange']});expect(value(result.priceRange)).toBe(Number.MAX_VALUE);expect(value(result.barsRange)).toBe(1);expect(result.percentChange).toEqual({state:'unavailable',reason:'Metric not requested.'});expect(result.dateTimeRange).toEqual({state:'unavailable',reason:'Metric not requested.'});expect(result.dateTimeLabels).toEqual({state:'unavailable',reason:'Metric not requested.'});expect(format).not.toHaveBeenCalled();expect(binary).not.toHaveBeenCalled();
  const empty=calculate(anchors,{requested:[]});for(const result of Object.values(empty))expect(result).toEqual({state:'unavailable',reason:'Metric not requested.'});
 }finally{format.mockRestore();binary.mockRestore();}
 let reads=0;const getter=['priceRange'];Object.defineProperty(getter,'0',{get(){reads++;return'priceRange';}});
 for(const requested of [undefined,null,['priceRange','priceRange'],['price'],[1],getter,new Array(1),['priceRange','percentChange','barsRange','dateTimeRange','priceRange']])expect(()=>calculate(anchors,{requested:requested as any})).toThrow();expect(reads).toBe(0);
 expect(value(calculate([{time:0,price:1},{time:1,price:2}]).percentChange)).toBe(100);
});
