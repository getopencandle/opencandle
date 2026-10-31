import {describe,expect,it} from 'vitest';
import {planHigherTimeframe,alignHigherTimeframe,chartBarEnd} from '../../src/domain/indicator-resample';
import {calculateIndicator} from '../../src/domain/indicators';
import {parseInterval} from '../../src/domain/intervals';
import type {Bar} from '../../src/domain/types';

// lane. SYNTHETIC bars only. Expected values are hand-computed below (no LV aggregation in the oracle).
const T3M=180*9444444;// a UTC 3-minute boundary
const bar=(time:number,close:number,volume=10):Bar=>({time,open:close,high:close+0.5,low:close-0.5,close,volume});
const identity=(values:readonly Bar[])=>values.map(row=>row.close);

describe('INDX.MTF.FUTURE: six completed 1m bars grouped into 3m (contract literal)',()=>{
 const bars=[1,2,3,4,5,6].map((close,i)=>bar(T3M+60*i,close));
 it('plans two 3m buckets confirmed on their last intrabar',()=>{
  const planned=planHigherTimeframe(bars,'1m','3m');expect(planned.ok).toBe(true);if(!planned.ok)return;
  expect(planned.plan.bars.map(row=>[row.open,row.high,row.low,row.close,row.volume])).toEqual([[1,3.5,0.5,3,30],[4,6.5,3.5,6,30]]);
  expect(planned.plan.confirmedAt).toEqual([2,5]);expect(planned.plan.developing).toBe(false);
 });
 it('wait-close true holds each confirmed value: null,null,3,3,3,6',()=>{
  const planned=planHigherTimeframe(bars,'1m','3m');if(!planned.ok)throw Error(planned.message);
  expect(alignHigherTimeframe(identity(planned.plan.bars),planned.plan,6,true)).toEqual([null,null,3,3,3,6]);
 });
 it('wait-close false holds history: null,null,3,3,3,6',()=>{
  const planned=planHigherTimeframe(bars,'1m','3m');if(!planned.ok)throw Error(planned.message);
  expect(alignHigherTimeframe(identity(planned.plan.bars),planned.plan,6,false)).toEqual([null,null,3,3,3,6]);
 });
 it('changing the unseen sixth close never alters the prefix ending before it (both modes)',()=>{
  for(const wait of [true,false]){
   const run=(sixth:number)=>{const rows=[...bars.slice(0,5),bar(T3M+300,sixth)],planned=planHigherTimeframe(rows,'1m','3m');if(!planned.ok)throw Error(planned.message);return alignHigherTimeframe(identity(planned.plan.bars),planned.plan,6,wait);};
   expect(run(6).slice(0,5)).toEqual(run(99).slice(0,5));
  }
 });
 it('a five-bar prefix: waiting holds the confirmed value and shows no developing value; not waiting shows the developing 3m close (5) on the latest bar only',()=>{
  const planned=planHigherTimeframe(bars.slice(0,5),'1m','3m');if(!planned.ok)throw Error(planned.message);
  expect(planned.plan.developing).toBe(true);expect(planned.plan.confirmedAt).toEqual([2,null]);
  expect(alignHigherTimeframe(identity(planned.plan.bars),planned.plan,5,true)).toEqual([null,null,3,3,3]);
  expect(alignHigherTimeframe(identity(planned.plan.bars),planned.plan,5,false)).toEqual([null,null,3,3,5]);
 });
});

describe(' numeric: SMA(2) on 1D computed from 24/7 1h bars (hand-computed)',()=>{
 const D0=19700*86400;// a UTC midnight
 const hourly=Array.from({length:72},(_,i)=>{const d=Math.floor(i/24),h=i%24;return bar(D0+i*3600,100+d*10+h*0.1);});
 // Daily closes are the 23:00 closes: 102.3, 112.3, 122.3. SMA2 on daily = null, 107.3, 117.3.
 const planned=planHigherTimeframe(hourly,'60m','1D');if(!planned.ok)throw Error(planned.message);
 const daily=calculateIndicator('sma',planned.plan.bars,{length:2,source:'close'}).series[0].values;
 it('daily bars and the daily SMA match the hand values',()=>{
  expect(planned.plan.bars.map(row=>row.close).map(value=>+value.toFixed(10))).toEqual([102.3,112.3,122.3]);
  expect(planned.plan.bars.map(row=>row.time)).toEqual([D0,D0+86400,D0+2*86400]);
  expect(daily[0]).toBeNull();expect(daily[1]).toBeCloseTo(107.3,10);expect(daily[2]).toBeCloseTo(117.3,10);
  expect(planned.plan.confirmedAt).toEqual([23,47,71]);
 });
 it('wait-close true: null until day 2 closes at 23:00, then held until day 3 closes',()=>{
  const out=alignHigherTimeframe(daily,planned.plan,72,true);
  out.forEach((value,i)=>{if(i<47)expect(value).toBeNull();else if(i<71)expect(value).toBeCloseTo(107.3,10);else expect(value).toBeCloseTo(117.3,10);});
 });
 it('wait-close false: null until day 2 closes, then held until day 3 closes',()=>{
  const out=alignHigherTimeframe(daily,planned.plan,72,false);
  out.forEach((value,i)=>{if(i<47)expect(value).toBeNull();else if(i<71)expect(value).toBeCloseTo(107.3,10);else expect(value).toBeCloseTo(117.3,10);});
 });
});

describe(' session endpoint without exchange calendars (IND.MTF.U.SESSION_ENDPOINT policy, labelled)',()=>{
 const D0=19700*86400;
 // Seven 1h bars 14:00..20:00 UTC on two days; the last bar of a day ends at 21:00, before the UTC day end.
 const rows=[0,1].flatMap(d=>Array.from({length:7},(_,h)=>bar(D0+d*86400+(14+h)*3600,10+d*10+h)));
 it('a day is confirmed on the first bar of the next day, never earlier; the last day stays developing',()=>{
  const planned=planHigherTimeframe(rows,'60m','1D');if(!planned.ok)throw Error(planned.message);
  expect(planned.plan.confirmedAt).toEqual([7,null]);expect(planned.plan.developing).toBe(true);
  const closes=identity(planned.plan.bars);expect(closes).toEqual([16,26]);
  expect(alignHigherTimeframe(closes,planned.plan,14,true)).toEqual([null,null,null,null,null,null,null,16,16,16,16,16,16,16]);
  expect(alignHigherTimeframe(closes,planned.plan,14,false)).toEqual([null,null,null,null,null,null,null,16,16,16,16,16,16,26]);
 });
 it('chart bar ends follow the UTC day/week/month policy',()=>{
  expect(chartBarEnd(D0+3600,parseInterval('60m'))).toBe(D0+7200);
  expect(chartBarEnd(D0,parseInterval('1D'))).toBe(D0+86400);
  const monday=Date.UTC(2024,0,1)/1000;expect(chartBarEnd(monday,parseInterval('1W'))).toBe(monday+7*86400);
  expect(chartBarEnd(Date.UTC(2024,1,1)/1000,parseInterval('1M'))).toBe(Date.UTC(2024,2,1)/1000);
 });
});

describe(' refusals (never computed on the chart bars instead)',()=>{
 const D0=19700*86400,daily=[0,1,2].map(d=>bar(D0+d*86400,10+d));
 it.each([
  ['lower timeframe','1D','60m','LOWER_TIMEFRAME'],
  ['tick timeframe','1D','1T','EVENT_INTERVAL'],
  ['unknown chart interval',null,'1W','CHART_INTERVAL_UNKNOWN'],
  ['same timeframe','1D','1D','SAME_TIMEFRAME'],
 ] as const)('%s',(_name,chart,target,code)=>{const planned=planHigherTimeframe(daily,chart,target);expect(planned.ok).toBe(false);if(!planned.ok){expect(planned.code).toBe(code);expect(planned.message.length).toBeGreaterThan(10);}});
 it('weekly chart bars cannot be regrouped into months (a week crosses a month boundary)',()=>{
  const weeks=[0,1,2,3,4,5].map(w=>bar(Date.UTC(2024,0,1)/1000+w*7*86400,10+w));
  const planned=planHigherTimeframe(weeks,'1W','1M');expect(planned.ok).toBe(false);if(!planned.ok)expect(planned.code).toBe('RESAMPLE_UNAVAILABLE');
 });
 it('missing volume stays unavailable (NaN), never zero, in the higher-timeframe bar',()=>{
  const rows=[bar(T3M,1),{...bar(T3M+60,2),volume:NaN},bar(T3M+120,3),bar(T3M+180,4),bar(T3M+240,5),bar(T3M+300,6)];
  const planned=planHigherTimeframe(rows,'1m','3m');if(!planned.ok)throw Error(planned.message);
  expect(Number.isNaN(planned.plan.bars[0].volume)).toBe(true);expect(planned.plan.bars[1].volume).toBe(30);
 });
});
