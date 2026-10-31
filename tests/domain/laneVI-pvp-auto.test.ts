import {describe,expect,it} from 'vitest';
import {profilePeriods} from '../../src/domain/volume-profile';
import type {Bar} from '../../src/domain/types';

// SYNTHETIC weekday daily bars from 2025-01-02 (Thursday) for 88 calendar days (through Friday 2025-03-28).
const DAY=86400,START=Date.UTC(2025,0,2)/1000;
const bars:Bar[]=Array.from({length:88},(_,i)=>START+i*DAY).filter(time=>![0,6].includes(new Date(time*1000).getUTCDay())).map(time=>({time,open:10,high:11,low:9,close:10,volume:100}));

describe('lane VI: Periodic volume profile Auto period follows the chart interval',()=>{
 it('draws monthly profiles on a daily chart, never one-bar profiles',()=>{
  const runs=profilePeriods(bars,'Auto',{resolution:'1D'});
  expect(runs.length).toBe(3);
  expect(runs.slice(0,-1).every(run=>run.to-run.from+1>=19)).toBe(true);
  expect(profilePeriods(bars,'Day',{resolution:'1D'}).every(run=>run.from===run.to)).toBe(true);
 });
});
