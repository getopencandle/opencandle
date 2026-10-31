import {describe,it,expect} from 'vitest';
import {planNyseDailyTimeframe,planHigherTimeframe,alignHigherTimeframe} from '../../src/domain/indicator-resample';
import {evaluateIndicatorOnTimeframe} from '../../src/chart/indicator-timeframe';
import {heikinAshiBars} from '../../src/chart/calculation-bars';
import {calculateIndicator} from '../../src/domain/indicators';
import {syntheticSession,fridayMonday,unix} from '../fixtures/qualified-nyse-mtf-source';
import type {Bar} from '../../src/domain/types';
const plan=(rows:Bar[],closedThrough:number,completeRows=rows.length)=>planNyseDailyTimeframe(rows,'30m',{coveredFrom:-Infinity,closedThrough,completeRows});
const halfHours=(rows:Bar[])=>rows.filter((_,index)=>index%2===0);
describe('qualified NYSE daily pure calendar plan (not source authority)',()=>{
 it('confirms Friday and DST Monday at loaded endpoint indices, with literal close instants',()=>{
  const rows=halfHours(fridayMonday()),value=plan(rows,unix('2024-03-11T20:00:00Z'));expect(value.ok).toBe(true);if(!value.ok)throw Error(value.message);
  expect(value.plan.buckets.map(row=>[row.start,row.end])).toEqual([[1709908200,1709931600],[1710163800,1710187200]]);expect(value.plan.confirmedAt).toEqual([12,25]);expect(value.plan.bars.map(row=>row.close)).toEqual([110,130]);
  expect(alignHigherTimeframe([null,120],value.plan,26,true).at(-1)).toBe(120);
 });
 it('does not close the final loaded row from its timestamp or a later response arrival',()=>{const rows=halfHours(fridayMonday()),value=plan(rows,unix('2024-03-11T19:59:59Z'));expect(value.ok).toBe(true);if(!value.ok)throw Error(value.message);expect(value.plan.confirmedAt).toEqual([12,null]);expect(alignHigherTimeframe([null,120],value.plan,26,true).at(-1)).toBeNull();expect(alignHigherTimeframe([null,120],value.plan,26,false).at(-1)).toBe(120);});
 it('does not promote an explicitly partial replay endpoint',()=>{const rows=halfHours(fridayMonday()),value=plan(rows,unix('2024-03-11T20:00:00Z'),25);expect(value.ok).toBe(true);if(!value.ok)throw Error(value.message);expect(value.plan.confirmedAt).toEqual([12,null]);});
 it('uses Thanksgiving early close rather than midnight or the following Monday',()=>{const rows=[...syntheticSession('2024-11-27T14:30:00Z',13,100,1800),...syntheticSession('2024-11-29T14:30:00Z',7,120,1800)],value=plan(rows,unix('2024-11-29T18:00:00Z'));expect(value.ok).toBe(true);if(!value.ok)throw Error(value.message);expect(value.plan.buckets).toHaveLength(2);expect(value.plan.buckets[1].end).toBe(1732903200);expect(value.plan.confirmedAt).toEqual([12,19]);expect(alignHigherTimeframe([null,110],value.plan,20,true)[19]).toBe(110);});
 it('rejects holiday rows and unsupported 60-minute endpoint grids',()=>{const holiday=syntheticSession('2024-11-28T14:30:00Z',1,100,1800);expect(plan(holiday,unix('2024-11-29T18:00:00Z')).ok).toBe(false);expect(planNyseDailyTimeframe(holiday,'60m',{completeRows:1,coveredFrom:-Infinity,closedThrough:1732903200}).ok).toBe(false);});
 it('never substitutes next-session information for a missing loaded endpoint',()=>{const rows=halfHours(fridayMonday());rows.splice(12,1);const value=plan(rows,unix('2024-03-11T20:00:00Z'));expect(value.ok).toBe(true);if(!value.ok)throw Error(value.message);expect(value.plan.confirmedAt).toEqual([null,24]);});
 it('rejects accessor times without invoking them',()=>{const rows=halfHours(fridayMonday());let reads=0;Object.defineProperty(rows[1],'time',{get(){reads++;return 1;},enumerable:true});expect(plan(rows,1710187200).ok).toBe(false);expect(reads).toBe(0);});
 it('builds raw daily OHLC before one HA transform, with an independent literal result',()=>{const rows:Bar[]=[{time:1709908200,open:10,high:14,low:6,close:12,volume:1},{time:1709910000,open:12,high:20,low:8,close:16,volume:2},{time:1709929800,open:20,high:30,low:16,close:24,volume:3}],value=plan(rows,1709931600);expect(value.ok).toBe(true);if(!value.ok)throw Error(value.message);const result=evaluateIndicatorOnTimeframe({kind:'sma',inputs:{length:1,source:'close'},presentation:{timeframe:{schemaVersion:1,interval:'1D',waitForClose:true}}},'30m',rows,heikinAshiBars(rows),heikinAshiBars,bars=>calculateIndicator('sma',bars,{length:1,source:'close'}),value.plan);expect(result.series[0].values).toEqual([null,null,17.5]);});
 it('leaves the existing UTC route and its lower-timeframe refusal intact',()=>{const rows=halfHours(fridayMonday()),utc=planHigherTimeframe(rows,'30m','1D');expect(utc.ok).toBe(true);if(!utc.ok)throw Error(utc.message);expect(utc.plan.policies.join(' ')).toContain('UTC');expect(utc.plan.confirmedAt).toEqual([13,null]);expect(planHigherTimeframe(rows,'30m','5m')).toMatchObject({ok:false,code:'LOWER_TIMEFRAME'});});
 it('marks an overflowing finite-volume sum unavailable instead of emitting Infinity',()=>{const rows:Bar[]=[{time:1709908200,open:10,high:14,low:6,close:12,volume:Number.MAX_VALUE},{time:1709929800,open:12,high:20,low:8,close:16,volume:Number.MAX_VALUE}],value=plan(rows,1709931600);expect(value.ok).toBe(true);if(!value.ok)throw Error(value.message);expect(Number.isNaN(value.plan.bars[0].volume)).toBe(true);expect(value.plan.bars[0].close).toBe(16);});

});
