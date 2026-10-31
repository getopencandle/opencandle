import {expect,it} from 'vitest';
import {compileLiveSeasonalityDays,calculateLiveSeasonality,calculateOwnedLiveSeasonality,alignOwnedLiveSeasonality,ownedLiveAlignmentCost,type SeasonalityLiveMonthCache} from '../../src/domain/indicators-ext/seasonality-live-input';
import {seasonalityAlignedResult,seasonalityAlignedOwnedLiveResult,seasonalityAlignedTimes} from '../../src/chart/seasonality-presentation';
import {newYorkWallTime,usSessionDay} from '../../src/domain/us-market-hours';
import type {SeasonalitySettings,SeasonalityResult} from '../../src/domain/indicators-ext/seasonality-types';
import type {SeasonalitySourcePoint} from '../../src/domain/indicators-ext/seasonality-months';

// Pure supplied SYNTHETIC arithmetic equality only. No provider, native receipt,
// source-result registrar or altered cap is manufactured by this test.
const settings:SeasonalitySettings={startYear:2023,endYear:2025,excludedMonths:'',includeDevelopingInSummaries:false,meanRow:true,deviationRow:true,positiveFrequencyRow:true,projectionGeometry:true,externalNumericSlots:0};
const asOf=newYorkWallTime('2025-10-25',12*60),source='SYNTHETIC invented daily prices; numerical comparison only.';
function cache(options:SeasonalitySettings=settings,clock=asOf):Readonly<SeasonalityLiveMonthCache>{
 const points:SeasonalitySourcePoint[]=[];
 for(let time=Date.UTC(2022,11,1)/1000;time<=clock;time+=86400){
  const date=new Date(time*1000).toISOString().slice(0,10),day=usSessionDay(date);if(day.weekend||day.holiday)continue;
  const opening=newYorkWallTime(date,0),availableAt=newYorkWallTime(date,day.postClose);if(availableAt>clock)continue;
  const month=Number(date.slice(0,4))*12+Number(date.slice(5,7));points.push({time:opening,close:100+(month-2022*12)*2,availableAt,finalized:true});
 }
 return compileLiveSeasonalityDays(points,options,clock,source);
}
function compare(stamps:readonly number[],options:SeasonalitySettings=settings,clock=asOf,compiled=cache(options,clock),firstObserved=stamps[0]){
 const times=Object.freeze([...stamps]),grid=Object.freeze({times,firstObservedTime:firstObserved}),old=calculateLiveSeasonality(compiled,null,grid,options,clock,source),owned=calculateOwnedLiveSeasonality(compiled,null,grid,options,clock,source);
 expect(owned.result).toEqual(old);expect(owned.result.status).toBe('ready');if(owned.result.status!=='ready'||old.status!=='ready')throw Error('SYNTHETIC comparison did not produce scenes.');
 const bars=times.map(time=>({time,open:1,high:1,low:1,close:1,volume:1})),legacy=seasonalityAlignedResult(old.scene,bars,{calendar:'nyse',dateLabels:'calendar-midnight'}),aligned=seasonalityAlignedOwnedLiveResult(owned.result,bars,times);
 expect(aligned.series).toEqual(legacy.series);expect(aligned.seasonality).toEqual(legacy.seasonality);expect(aligned.policies).toEqual(legacy.policies);expect(seasonalityAlignedTimes(aligned)).toBe(times);
 for(const row of aligned.series)expect(Object.isFrozen(row.values)).toBe(true);
 return{old,owned:owned.result,times,aligned};
}
it('matches NY civil labels across spring DST and autumn DST rather than UTC months',()=>{
 compare(['2023-03-01','2023-03-10','2023-03-13','2023-04-03','2023-11-01','2023-11-03','2023-11-06','2023-12-01'].map(day=>newYorkWallTime(day,4*60)));
});
it('matches December to January roll and omits grid months outside requested years',()=>{
 const result=compare(['2022-12-30','2023-01-03','2023-12-29','2024-01-02','2025-10-24'].map(day=>newYorkWallTime(day,9*60+30)));
 expect(result.aligned.series.every(row=>row.values[0]===null)).toBe(true);
});
it('keeps premarket before first RTH in its actual civil month for extended and regular grids',()=>{
 for(const minutes of [4*60,9*60+30]){
  const first=newYorkWallTime('2024-04-01',minutes),stamps=[first,newYorkWallTime('2024-04-02',minutes),newYorkWallTime('2024-05-01',minutes)];
  const result=compare(stamps,settings,asOf,cache(),newYorkWallTime('2024-04-01',minutes));
  expect(result.owned.scene.projections.find(row=>row.month==='2024-04')?.geometry?.left).toBe(first);
 }
});
it('preserves the genuine oldest-month frontier earlier than the first loaded selected row',()=>{
 const firstObserved=newYorkWallTime('2024-04-01',4*60),result=compare([newYorkWallTime('2024-04-10',4*60),newYorkWallTime('2024-05-01',4*60)],settings,asOf,cache(),firstObserved);
 expect(result.owned.scene.projections.find(row=>row.month==='2024-04')?.geometry?.left).toBe(firstObserved);
});
it('keeps excluded-month statistics and four scalar outputs exact',()=>{
 const options={...settings,excludedMonths:'2024-03, 2025-01'},result=compare(['2024-03-01','2024-04-01','2025-01-02','2025-02-03'].map(day=>newYorkWallTime(day,4*60)),options);
 expect(result.aligned.series.every(row=>row.values[0]===null&&row.values[2]===null)).toBe(true);
});
it('preserves negative information-clock behavior without applying the NYSE year certification to grid labels',()=>{
 const options={...settings,startYear:2023,endYear:2023},compiled=compileLiveSeasonalityDays([],options,-1,source);
 compare([-3600,-1],options,-1,compiled,-3600);
});
it('matches separately observed developing close semantics with a frozen consumed grid',()=>{
 const clock=newYorkWallTime('2025-10-24',12*60),compiled=cache(settings,clock),times=Object.freeze([newYorkWallTime('2025-10-01',4*60),newYorkWallTime('2025-10-24',9*60+30)]),grid={times,firstObservedTime:times[0]},point={time:newYorkWallTime('2025-10-24',0),close:999,availableAt:clock,finalized:false};
 const old=calculateLiveSeasonality(compiled,point,grid,settings,clock,source),owned=calculateOwnedLiveSeasonality(compiled,point,grid,settings,clock,source);expect(owned.result).toEqual(old);
 expect(owned.result.status).toBe('ready');if(owned.result.status!=='ready')throw Error(owned.result.diagnostic);const october=owned.result.scene.years.find(row=>row.year===2025)!.cells.find(row=>row.month==='2025-10')!;expect(october.state).toBe('developing');expect(october.value).toBeCloseTo((999/190-1)*100,12);
});
it('requires the exact result and same frozen grid before derived scalar construction',()=>{
 const {owned,times}=compare([newYorkWallTime('2024-04-01',4*60),newYorkWallTime('2024-05-01',4*60)]);let traps=0;
 const foreign=new Proxy({},{get(){traps++;throw Error('Foreign result access');},getOwnPropertyDescriptor(){traps++;throw Error('Foreign result descriptor');}}) as SeasonalityResult;
 expect(()=>alignOwnedLiveSeasonality(foreign,times)).toThrow();expect(traps).toBe(0);expect(()=>alignOwnedLiveSeasonality(owned,Object.freeze([...times]))).toThrow();
 expect(ownedLiveAlignmentCost(133)).toEqual({operations:280576,numericSlots:527});
});
