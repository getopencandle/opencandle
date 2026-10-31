import {describe,expect,it} from 'vitest';
import {planHigherTimeframe,alignHigherTimeframe} from '../../src/domain/indicator-resample';
import {evaluateIndicatorOnTimeframe} from '../../src/chart/indicator-timeframe';
import {newYorkWallTime} from '../../src/domain/us-market-hours';
import type {Bar} from '../../src/domain/types';

// Own-timeframe buckets follow New York sessions on US equity charts. SYNTHETIC prices.
const bar=(time:number,n:number):Bar=>({time,open:100+n,high:101+n,low:99+n,close:100+n,volume:10});
const at=(date:string,minute:number)=>newYorkWallTime(date,minute);
/** step-second bars from a New York wall minute, count rows, closes numbered from start. */
const session=(date:string,fromMinute:number,count:number,step:number,start=0)=>Array.from({length:count},(_,i)=>bar(at(date,fromMinute)+i*step,start+i));
const plan=(bars:Bar[],chart:string,target:string,calendar?:'us-equity'|'utc'|null)=>{const value=planHigherTimeframe(bars,chart,target,calendar===undefined?{}:{calendar});if(!value.ok)throw Error(value.message);return value.plan;};
const daily=(dates:string[])=>dates.map((date,i)=>bar(Date.parse(date+'T00:00:00Z')/1000+4*3600,i));

describe('L4 session-calendar indicator timeframes (SYNTHETIC)',()=>{
 it('confirms 1D at the regular close across the DST change, where the UTC policy waits a bar or stays developing',()=>{
  const rows=[...session('2024-03-08',570,26,900),...session('2024-03-11',570,26,900,100)];
  const ny=plan(rows,'15m','1D','us-equity'),utc=plan(rows,'15m','1D');
  expect(ny.confirmedAt).toEqual([25,51]);expect(ny.developing).toBe(false);
  expect(utc.confirmedAt).toEqual([26,null]);
  expect(ny.bars.map(row=>[row.open,row.close,row.volume])).toEqual([[100,125,260],[200,225,260]]);
  const held=alignHigherTimeframe([1,2],ny,52,true);expect([held[24],held[25],held[50],held[51]]).toEqual([null,1,1,2]);
  expect(ny.policies[0]).toMatch(/New York trading sessions/);
 });
 it('handles 60m to 1D on session-anchored hourly bars, including the 13:00 early close',()=>{
  const rows=[...session('2024-11-27',570,7,3600),...session('2024-11-29',570,4,3600,10)];// 09:30..15:30 (last ends 16:00), then 09:30..12:30 (13:00 close)
  const value=plan(rows,'60m','1D','us-equity');expect(value.confirmedAt).toEqual([6,10]);expect(value.buckets.map(row=>row.end)).toEqual([at('2024-11-27',960),at('2024-11-29',780)]);
 });
 it('uses the after-hours close when the chart has extended-hours bars',()=>{
  const pre=[240,300,360,420,480,540].map((m,i)=>bar(at('2024-03-12',m),i)),regular=session('2024-03-12',570,7,3600,10),post=[960,1020,1080,1140].map((m,i)=>bar(at('2024-03-12',m),20+i));
  const next=[bar(at('2024-03-13',240),30)],rows=[...pre,...regular,...post,...next],value=plan(rows,'60m','1D','us-equity');
  expect(value.buckets[0]).toMatchObject({first:0,last:16,end:at('2024-03-12',1200)});expect(value.confirmedAt[0]).toBe(16);
 });
 it('closes a week on its last trading day (Good Friday 2024) and a month on its last session',()=>{
  const days=['2024-03-25','2024-03-26','2024-03-27','2024-03-28','2024-04-01','2024-04-02','2024-04-03','2024-04-04','2024-04-05'];
  const weekly=plan(daily(days),'1D','1W','us-equity');expect(weekly.buckets.map(row=>[row.first,row.last])).toEqual([[0,3],[4,8]]);expect(weekly.confirmedAt).toEqual([3,8]);
  expect(plan(daily(days),'1D','1W').confirmedAt).toEqual([4,null]);
  const june=daily(['2024-06-27','2024-06-28','2024-07-01']);// June 30 is a Sunday: the month closes on Friday the 28th
  expect(plan(june,'1D','1M','us-equity').confirmedAt).toEqual([1,null]);expect(plan(june,'1D','1M').confirmedAt).toEqual([2,null]);
 });
 it('closes a weekly bucket from intraday bars at the Friday close',()=>{
  const rows=[...session('2024-04-04',570,26,900),...session('2024-04-05',570,26,900,100),...session('2024-04-08',570,2,900,200)];
  expect(plan(rows,'15m','1W','us-equity').confirmedAt).toEqual([51,null]);
 });
 it('anchors intraday timeframes at the 09:30 session open',()=>{
  const rows=session('2024-03-12',570,8,900),value=plan(rows,'15m','60m','us-equity');
  expect(value.buckets.map(row=>[row.first,row.last])).toEqual([[0,3],[4,7]]);expect(value.confirmedAt).toEqual([3,7]);
  expect(plan(rows,'15m','60m').buckets.map(row=>[row.first,row.last])).toEqual([[0,1],[2,5],[6,7]]);
 });
 it('leaves the UTC calendar unchanged and keeps multi-day targets and weekly charts on it',()=>{
  const rows=[...session('2024-03-08',570,26,900),...session('2024-03-11',570,26,900,100)];
  expect(plan(rows,'15m','1D','utc')).toEqual(plan(rows,'15m','1D'));expect(plan(rows,'15m','1D',null)).toEqual(plan(rows,'15m','1D'));
  expect(plan(daily(['2024-03-25','2024-03-26','2024-03-27']),'1D','2D','us-equity').policies[0]).toMatch(/UTC calendar aggregation/);
  expect(planHigherTimeframe(rows,'60m','15m',{calendar:'us-equity'})).toMatchObject({ok:false,code:'LOWER_TIMEFRAME'});
 });
 it('passes the chart calendar through the own-timeframe evaluation',()=>{
  const rows=[...session('2024-03-08',570,26,900),...session('2024-03-11',570,26,900,100)],settings={kind:'sma',inputs:{},presentation:{timeframe:{schemaVersion:1 as const,interval:'1D',waitForClose:true}}};
  const evaluate=(input:readonly Bar[])=>({id:'sma',series:[{id:'close',values:input.map(row=>row.close)}],diagnostics:[],policies:[]});
  const run=(calendar?:'us-equity')=>evaluateIndicatorOnTimeframe(settings,'15m',rows,rows,input=>[...input],evaluate as never,undefined,calendar).series[0].values;
  expect(run('us-equity')[25]).toBe(125);expect(run()[25]).toBeNull();expect(run()[26]).toBe(125);
 });
});
