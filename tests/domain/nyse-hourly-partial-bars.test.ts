import {expect,it} from 'vitest';
import type {Bar} from '../../src/domain/types';
import {alignHigherTimeframe,nyseDailyChartInterval,planNyseDailyTimeframe} from '../../src/domain/indicator-resample';
import {heikinAshiBars} from '../../src/chart/calculation-bars';
import {sourceContextForDataset,captureClosedTimeframeContext} from '../../src/chart/source-context';
import {publishedSource} from '../fixtures/qualified-nyse-mtf-source';

// Original synthetic hourly candles. The final regular-session candle is half an hour.
const friday=1709908200,monday=1710163800,fridayClose=1709931600,mondayClose=1710187200;
const day=(start:number,base:number,count=7):Bar[]=>Array.from({length:count},(_,index)=>({time:start+index*3600,open:base-2,high:base+(index===count-1?13:3),low:base-4,close:base+(index===count-1?10:0),volume:index===count-1?5:10}));
const rows=()=>[...day(friday,100),...day(monday,120)];
const plan=(bars:Bar[],closedThrough=mondayClose,completeRows=bars.length)=>planNyseDailyTimeframe(bars,'60m',{coveredFrom:-Infinity,closedThrough,completeRows});

it('admits a session-anchored hourly route without widening other nondividing intervals',()=>{
 expect(nyseDailyChartInterval('60m','1D')).toBe(true);
 expect(nyseDailyChartInterval('120m','1D')).toBe(false);
 expect(nyseDailyChartInterval('60m','1W')).toBe(false);
});
it('confirms literal Friday and DST Monday at their loaded half-hour endpoints',()=>{
 const result=plan(rows());expect(result.ok).toBe(true);if(!result.ok)throw Error(result.message);
 expect(result.plan.buckets.map(row=>[row.start,row.end,row.first,row.last])).toEqual([[friday,fridayClose,0,6],[monday,mondayClose,7,13]]);
 expect(result.plan.confirmedAt).toEqual([6,13]);expect(result.plan.bars.map(row=>[row.open,row.high,row.low,row.close,row.volume])).toEqual([[98,113,96,110,65],[118,133,116,130,65]]);
 expect(alignHigherTimeframe([null,120],result.plan,14,true)).toEqual([null,null,null,null,null,null,null,null,null,null,null,null,null,120]);
});
it('does not infer the half-hour endpoint close from its timestamp or an early observation',()=>{
 const result=plan(rows(),mondayClose-1);expect(result.ok).toBe(true);if(!result.ok)throw Error(result.message);
 expect(result.plan.confirmedAt).toEqual([6,null]);expect(alignHigherTimeframe([null,120],result.plan,14,true).at(-1)).toBeNull();expect(alignHigherTimeframe([null,120],result.plan,14,false).at(-1)).toBe(120);
});
it('does not close an explicitly partial final replay row',()=>{
 const result=plan(rows(),mondayClose,13);expect(result.ok).toBe(true);if(!result.ok)throw Error(result.message);expect(result.plan.confirmedAt).toEqual([6,null]);
});
it('clips the Thanksgiving early-close final hour to its literal 13:00 New York endpoint',()=>{
 const result=plan(day(1732890600,120,4),1732903200);expect(result.ok).toBe(true);if(!result.ok)throw Error(result.message);
 expect(result.plan.buckets.map(row=>[row.start,row.end])).toEqual([[1732890600,1732903200]]);expect(result.plan.confirmedAt).toEqual([3]);
});
it('refuses UTC-clock hourly labels rather than relabelling their OHLC as session bars',()=>{
 const result=plan(rows().map(row=>({...row,time:row.time-1800})));expect(result.ok).toBe(false);
});
it('does not substitute a later session for an absent hourly session endpoint',()=>{
 const bars=rows();bars.splice(6,1);const result=plan(bars);expect(result.ok).toBe(true);if(!result.ok)throw Error(result.message);expect(result.plan.confirmedAt).toEqual([null,12]);
});
it('keeps daily raw aggregation before one Heikin Ashi transform',()=>{
 const result=plan(rows());expect(result.ok).toBe(true);if(!result.ok)throw Error(result.message);
 const daily=heikinAshiBars(result.plan.bars);expect(daily.map(row=>row.close)).toEqual([104.25,124.25]);expect((daily[0].close+daily[1].close)/2).toBe(114.25);
});
it('uses the actual provider hourly fold and its actual observed completion without a permission registrar',async()=>{
 const fixture=await publishedSource({resolution:'60m'});
 try{
  const dataset=fixture.regular();expect(fixture.requests.every(request=>request.timeframe==='15Min')).toBe(true);
  expect(dataset.bars).toHaveLength(14);expect(dataset.bars[6].time).toBe(1709929800);expect(dataset.bars[13].time).toBe(1710185400);
  const context=sourceContextForDataset(dataset),observed=captureClosedTimeframeContext(context,dataset.bars,'ordinary');expect(observed).not.toBeNull();if(!observed)throw Error('Genuine source completion missing.');
  const result=planNyseDailyTimeframe(dataset.bars,'60m',observed);expect(result.ok).toBe(true);if(!result.ok)throw Error(result.message);
  expect(result.plan.confirmedAt).toEqual([6,13]);expect(result.plan.bars.map(row=>row.close)).toEqual([110,130]);expect(alignHigherTimeframe([null,120],result.plan,14,true).at(-1)).toBe(120);
  expect(captureClosedTimeframeContext({...context},dataset.bars,'ordinary')).toBeNull();expect(captureClosedTimeframeContext(context,[...dataset.bars],'ordinary')).toBeNull();observed.assertCurrent();
 }finally{fixture.dispose();}
});
