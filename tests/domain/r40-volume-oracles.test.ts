import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {volumeDeltaInterval} from '../../src/domain/indicators-ext/r40-volume-catalog';
import type {Bar} from '../../src/domain/types';

// SYNTHETIC fixtures. Volumes and expected paths are hand-computed, with no production aggregation in the oracle.
const T=1767225600,D=86400;
const candle=(time:number,open:number,close:number,volume:number):Bar=>({time,open,high:Math.max(open,close),low:Math.min(open,close),close,volume});
const bars=[candle(T,10,11,20),candle(T+300,11,9,20),candle(T+600,9,10,10)];
const fine=[candle(T,10,11,10),candle(T+60,11,10,4),candle(T+120,10,10,3),candle(T+180,10,10,2),candle(T+240,10,11,1),candle(T+300,11,10,6),candle(T+360,10,10,2),candle(T+420,10,11,5),candle(T+480,11,10,3),candle(T+540,10,9,4),candle(T+600,9,10,8),candle(T+660,10,10,2)];
const facts={resolution:'5m',calendar:'utc' as const,lowerTimeframe:{interval:'1m',bars:fine}};
const values=(kind:string,plot:string,options:Parameters<typeof calculateIndicator>[3]=facts,inputs={})=>calculateIndicator(kind,bars,inputs,options).series.find(row=>row.id===plot)!.values;

describe(' volume studies: independent synthetic numerical oracles',()=>{
 it('uses the documented automatic intrabar ladder and accepts equal source intervals and refuses coarser/event intervals',()=>{
  expect(['15s','5m','60m','1D','1W','1M'].map(resolution=>volumeDeltaInterval(resolution))).toEqual(['1s','1m','1m','5m','60m','60m']);
  expect(volumeDeltaInterval('1m')).toBe('1m');expect(volumeDeltaInterval('1s')).toBe('1s');
  expect(()=>volumeDeltaInterval('5m',true,'15m')).toThrow(/below the chart/);
  expect(()=>volumeDeltaInterval('1T')).toThrow(/time-based chart/);
  expect(volumeDeltaInterval('5m',true,'15s')).toBe('15s');
 });
 it('Up/Down classifies equal-close dojis up and plots down volume below zero',()=>{
  // First bucket: up=10+3+2+1=16, down=4; second up=2+5=7, down=6+3+4=13.
  expect(values('updownvolume','up')).toEqual([16,7,10]);
  expect(values('updownvolume','down')).toEqual([-4,-13,0]);
  expect(values('updownvolume','delta')).toEqual([12,-6,10]);
 });
 it('Volume delta inherits direction on unchanged dojis and keeps the full intrabar OHLC path',()=>{
  // First path: 10,6,3,1,2. Second path: -6,-8,-3,-6,-10. Third: 8,10.
  expect(values('volumedelta','open')).toEqual([0,0,0]);
  expect(values('volumedelta','high')).toEqual([10,0,10]);
  expect(values('volumedelta','low')).toEqual([0,-10,0]);
  expect(values('volumedelta','close')).toEqual([2,-10,10]);
 });
 it('CVD carries candle endpoints through a period and resets at the next UTC day',()=>{
  expect(values('cvd','open')).toEqual([0,2,-8]);
  expect(values('cvd','high')).toEqual([10,2,2]);
  expect(values('cvd','low')).toEqual([0,-8,-8]);
  expect(values('cvd','close')).toEqual([2,-8,2]);
  const chart=[...bars,candle(T+D,10,9,6)],lower=[...fine,candle(T+D,10,9,6)];
  const result=calculateIndicator('cvd',chart,{}, {...facts,lowerTimeframe:{interval:'1m',bars:lower}});
  expect(result.series.map(row=>row.values.at(-1))).toEqual([0,0,-6,-6]);
 });
 it('missing intrabar coverage creates gaps; CVD remains unknown until its anchor resets',()=>{
  const lower=fine.filter(row=>row.time<T+300||row.time>=T+600),options={...facts,lowerTimeframe:{interval:'1m',bars:lower}};
  expect(values('volumedelta','close',options)).toEqual([2,null,10]);
  expect(values('cvd','close',options)).toEqual([2,null,null]);
  const result=calculateIndicator('volumedelta',bars,{},options);
  expect(result.diagnostics.join(' ')).toMatch(/no intrabar coverage/);
 });
 it('loading and refusal never substitute chart volume or invent zero-valued candles',()=>{
  for(const state of ['loading','unavailable'] as const){
   const requests:string[]=[];
   const result=calculateIndicator('volumedelta',bars,{}, {resolution:'5m',finerBars:interval=>{requests.push(interval);return {state,bars:null,message:'SYNTHETIC provider detail.'};}});
   expect(requests).toEqual(['1m']);expect(result.series.every(row=>row.values.every(value=>value===null))).toBe(true);
   expect(result.diagnostics.join(' ')).toMatch(state==='loading'?/Loading 1m bars/:/Intrabar data is unavailable/);
   expect(result.diagnostics.join(' ')).not.toContain('provider detail');
  }
 });
 it('a ready lookup is used at exactly the requested interval, including custom intervals',()=>{
  const requests:string[]=[];
  const result=calculateIndicator('volumedelta',bars,{useCustomTimeframe:true,timeframe:'1m'},{resolution:'5m',finerBars:interval=>{requests.push(interval);return {state:'ready',bars:fine,message:null};}});
  expect(requests).toEqual(['1m']);expect(result.series.find(row=>row.id==='close')!.values).toEqual([2,-10,10]);
 });
 it('1m-on-1m and 1s-on-1s use actual matching source observations without a chart-volume fallback',()=>{
  for(const [resolution,spacing] of [['1m',60],['1s',1]] as const){
   const source=[candle(T,10,11,10),candle(T+spacing,11,10,4)],requests:string[]=[];
   const result=calculateIndicator('volumedelta',source,{}, {resolution,finerBars:interval=>{requests.push(interval);return {state:'ready',bars:source,message:null};}});
   expect(requests).toEqual([resolution]);expect(result.series.find(row=>row.id==='close')!.values).toEqual([10,-4]);
   expect(result.series.find(row=>row.id==='high')!.values).toEqual([10,0]);
   const absent=calculateIndicator('volumedelta',source,{}, {resolution});
   expect(absent.series.every(row=>row.values.every(value=>value===null))).toBe(true);
  }
 });
 it('rejects unordered intrabars, unavailable volume, overflow and unknown first-doji direction',()=>{
  for(const lower of [[fine[1],fine[0]],[{...fine[0],volume:NaN}],[{...fine[0],volume:Number.MAX_VALUE},{...fine[1],close:12,volume:Number.MAX_VALUE}]]){
   const result=calculateIndicator('volumedelta',bars,{}, {...facts,lowerTimeframe:{interval:'1m',bars:lower}});
   expect(result.diagnostics.length).toBeGreaterThan(0);expect(result.series).toEqual([]);
  }
  const unknown=calculateIndicator('volumedelta',bars,{}, {...facts,lowerTimeframe:{interval:'1m',bars:[candle(T,10,10,3)]}});
  expect(unknown.series.every(row=>row.values[0]===null)).toBe(true);
 });
 it('includes January 30/31 and leap-day intrabars through the actual UTC month end',()=>{
  for(const [start,last,next] of [['2026-01-01','2026-01-31','2026-02-01'],['2024-02-01','2024-02-29','2024-03-01']]){
   const begin=Date.parse(start+'T00:00:00Z')/1000,lastHour=Date.parse(last+'T23:00:00Z')/1000,boundary=Date.parse(next+'T00:00:00Z')/1000;
   const source=[candle(lastHour-86400,10,11,2),candle(lastHour,10,11,3),candle(boundary,10,11,100)];
   const result=calculateIndicator('volumedelta',[candle(begin,10,11,5)],{}, {resolution:'1M',lowerTimeframe:{interval:'60m',bars:source}});
   expect(result.series.find(row=>row.id==='close')!.values).toEqual([5]);
  }
 });
 it('rejects a custom monthly aggregate that crosses a 30-day chart boundary',()=>{
  // January has 31 days: a Jan1-Feb1 monthly aggregate cannot be split into the Jan1-Jan31 30D chart bar.
  const begin=Date.parse('2026-01-01T00:00:00Z')/1000;
  const result=calculateIndicator('volumedelta',[candle(begin,10,11,10)],{useCustomTimeframe:true,timeframe:'1M'}, {resolution:'30D',lowerTimeframe:{interval:'1M',bars:[candle(begin,10,11,10)]}});
  expect(result.series.every(row=>row.values[0]===null)).toBe(true);expect(result.diagnostics.join(' ')).toMatch(/no intrabar coverage/);
 });
 it('clamps a chart bucket to the next actual opening and keeps the existing UTC weekly policy across DST',()=>{
  const shorter=calculateIndicator('volumedelta',[candle(T,10,11,2),candle(T+180,10,11,3)],{}, {resolution:'5m',lowerTimeframe:{interval:'1m',bars:[candle(T+120,10,11,2),candle(T+180,10,11,3)]}});
  expect(shorter.series.find(row=>row.id==='close')!.values).toEqual([2,3]);
  // US DST ends Nov1, but existing higher-interval buckets are explicitly UTC, not inferred exchange-session weeks.
  const monday=Date.parse('2026-10-26T00:00:00Z')/1000,nextMonday=Date.parse('2026-11-02T00:00:00Z')/1000;
  const weekly=calculateIndicator('volumedelta',[candle(monday,10,11,5)],{}, {resolution:'1W',calendar:'us-equity',lowerTimeframe:{interval:'60m',bars:[candle(nextMonday-3600,10,11,5),candle(nextMonday,10,11,100)]}});
  expect(weekly.series.find(row=>row.id==='close')!.values).toEqual([5]);
 });
});

describe(' Visible average price: synthetic visible-window arithmetic',()=>{
 const chart=[candle(T,10,10,1),candle(T+300,20,20,1),candle(T+600,30,30,1)];
 it('averages only visible source values and recalculates when the range changes',()=>{
  const compute=(from:number,to:number)=>calculateIndicator('visibleavg',chart,{source:'close'},{resolution:'5m',visibleRange:{from,to}}).series[0].values;
  expect(compute(T,T+300)).toEqual([15,15,null]);
  expect(compute(T+300,T+600)).toEqual([null,25,25]);
  expect(compute(T+900,T+1200)).toEqual([null,null,null]);
  expect(calculateIndicator('visibleavg',chart,{source:'close'}).series[0].values).toEqual([20,20,20]);
 });
 it('uses the selected source and refuses a nonfinite visible sample',()=>{
  const result=calculateIndicator('visibleavg',chart.map((row,i)=>({...row,high:row.close+2+i,low:row.close})),{source:'hl2'});
  expect(result.series[0].values).toEqual([21.5,21.5,21.5]);
  expect(calculateIndicator('visibleavg',[{...chart[0],close:NaN}],{source:'close'}).diagnostics.join(' ')).toMatch(/finite visible source/);
 });
});

describe(' 52-week high/low on intraday charts: synthetic daily history without future data',()=>{
 const daily=Array.from({length:11},(_,i)=>({...candle(T+i*D,75+i,75+i,1),high:i===8?9999:100+i,low:i===8?1:50-i}));
 const chart=[{...candle(T+8*D+3600,90,109,1),high:110,low:60},{...candle(T+8*D+7200,109,111,1),high:112,low:109}];
 it('requests daily history, excludes the unfinished daily candle, and includes the observed chart-day extremes',()=>{
  const requests:string[]=[];
  const options={resolution:'60m',calendar:'utc' as const,finerBars:(interval:string)=>{requests.push(interval);return {state:'ready' as const,bars:daily,message:null};}};
  const result=calculateIndicator('w52hl',chart,{weeks:1},options);
  expect(requests).toEqual(['1D']);expect(result.diagnostics).toEqual([]);
  expect(result.series.find(row=>row.id==='high')!.values).toEqual([110,112]);
  expect(result.series.find(row=>row.id==='low')!.values).toEqual([43,43]);
  const close=calculateIndicator('w52hl',chart,{weeks:1,extremes:'Close'},options);
  expect(close.series.find(row=>row.id==='high')!.values).toEqual([109,111]);
  expect(close.series.find(row=>row.id==='low')!.values).toEqual([77,77]);
 });
 it('loading daily history shows a pending diagnostic and no short intraday approximation',()=>{
  const result=calculateIndicator('w52hl',chart,{weeks:1},{resolution:'60m',finerBars:()=>({state:'loading',bars:null,message:null})});
  expect(result.series.every(row=>row.values.every(value=>value===null))).toBe(true);
  expect(result.diagnostics.join(' ')).toMatch(/Loading daily history/);
 });
});
