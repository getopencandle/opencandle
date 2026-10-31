import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import type {Bar} from '../../src/domain/types';

// independent hand-computed oracles for the CCI and Supertrend calculations.
// SYNTHETIC fixtures (not market data). Every expected number below was worked out by hand from the formula text in the
// cited help articles, not by running LV's kernel. The NUM / INV / MISSING / APPEND clauses are each asserted.
const bar=(i:number,high:number,low:number,close:number):Bar=>({time:1700000000+i*86400,open:close,high,low,close,volume:100});

describe('CCI (help 43000502001): (source - SMA) / (0.015 x mean deviation)',()=>{
 // closes 10,12,11,15,14, Length 3.
 // i=2: window 10,12,11 mean 11, deviations 1,1,0 -> mean deviation 2/3; CCI = 0.
 // i=3: window 12,11,15 mean 38/3, deviations 2/3,5/3,7/3 -> mean deviation 14/9; CCI = (7/3)/(0.015*14/9) = 100.
 // i=4: window 11,15,14 mean 40/3, deviations 7/3,5/3,2/3 -> mean deviation 14/9; CCI = (2/3)/(0.015*14/9) = 200/7.
 const closes=[10,12,11,15,14];
 const bars=closes.map((c,i)=>bar(i,c+1,c-1,c));
 const expected=[null,null,0,100,200/7];
 it('NUM: matches the hand-computed values (absolute 1e-9) with exact null positions',()=>{
  const result=calculateIndicator('cci',bars,{length:3});
  expect(result.diagnostics).toEqual([]);
  const values=result.series[0].values;
  expect(values.map(v=>v===null)).toEqual(expected.map(v=>v===null));
  values.forEach((v,i)=>{if(expected[i]!==null)expect(Math.abs((v as number)-(expected[i] as number))).toBeLessThan(1e-9);});
 });
 it('INV: inputs are not mutated and a repeat call is identical',()=>{
  const before=structuredClone(bars),a=calculateIndicator('cci',bars,{length:3}),b=calculateIndicator('cci',bars,{length:3});
  expect(bars).toEqual(before);expect(a.series).toEqual(b.series);
 });
 it('MISSING: a missing close withholds every window that contains it and the series recovers after it leaves the window',()=>{
  const broken=bars.map((row,i)=>i===3?{...row,close:Number.NaN}:row);
  const values=calculateIndicator('cci',broken,{length:3}).series[0].values;
  expect(values[2]).toBe(0);expect(values[3]).toBeNull();expect(values[4]).toBeNull();
  const longer=[...closes,13,16].map((c,i)=>bar(i,c+1,c-1,i===3?Number.NaN:c));
  expect(calculateIndicator('cci',longer,{length:3}).series[0].values[6]).not.toBeNull();// window 4..6 no longer holds the gap
 });
 it('APPEND: adding bars never changes earlier values',()=>{
  const longer=[...bars,bar(5,17,15,16),bar(6,15,13,14)];
  const base=calculateIndicator('cci',bars,{length:3}).series[0].values,more=calculateIndicator('cci',longer,{length:3}).series[0].values;
  expect(more.slice(0,bars.length)).toEqual(base);
 });
 it('a flat window (zero mean deviation) is unavailable, not zero',()=>{
  const flat=[5,5,5,5].map((c,i)=>bar(i,c,c,c));
  expect(calculateIndicator('cci',flat,{length:3}).series[0].values).toEqual([null,null,null,null]);
 });
});

describe('Supertrend (help 43000634738): bands hl2 +/- factor x ATR, Wilder ATR, final-band carry rules',()=>{
 // ATR length 2, factor 1. Bars (high, low, close): (12,8,10) (13,9,12) (14,10,13) (12,8,9) (20,16,19).
 // True range: 4, 4, 4, 5, 11. Wilder ATR (seed = mean of the first two): null, 4, 4, 4.5, 7.75.
 // i=1: mid 11, basic bands 15 / 7; no prior ATR so the trend starts down: down = 15.
 // i=2: mid 12, basic 16 / 8; final upper stays 15 (16 is not lower and prior close 12 is not above 15); close 13 <= 15 so still down: 15.
 // i=3: mid 10, basic 14.5 / 5.5; final upper 14.5 (lower than 15); close 9 <= 14.5: down = 14.5.
 // i=4: mid 18, basic 25.75 / 10.25; final upper stays 14.5, final lower 10.25 (above the prior 8); close 19 > 14.5 flips up: up = 10.25.
 const rows=[[12,8,10],[13,9,12],[14,10,13],[12,8,9],[20,16,19]];
 const bars=rows.map(([h,l,c],i)=>bar(i,h,l,c));
 const expectedUp=[null,null,null,null,10.25],expectedDown=[null,15,15,14.5,null];
 const run=(data:Bar[])=>{const result=calculateIndicator('supertrend',data,{atrLength:2,factor:1});return {result,up:result.series.find(s=>s.id==='upTrend')!.values,down:result.series.find(s=>s.id==='downTrend')!.values};};
 it('NUM: matches the hand-computed up and down trend values (absolute 1e-9) with exact null positions',()=>{
  const {result,up,down}=run(bars);
  expect(result.diagnostics).toEqual([]);
  expect(up.map(v=>v===null)).toEqual(expectedUp.map(v=>v===null));expect(down.map(v=>v===null)).toEqual(expectedDown.map(v=>v===null));
  up.forEach((v,i)=>{if(expectedUp[i]!==null)expect(Math.abs((v as number)-(expectedUp[i] as number))).toBeLessThan(1e-9);});
  down.forEach((v,i)=>{if(expectedDown[i]!==null)expect(Math.abs((v as number)-(expectedDown[i] as number))).toBeLessThan(1e-9);});
 });
 it('INV: inputs are not mutated, a repeat call is identical, and one bar carries at most one of the two plots',()=>{
  const before=structuredClone(bars),a=run(bars),b=run(bars);
  expect(bars).toEqual(before);expect(a.up).toEqual(b.up);expect(a.down).toEqual(b.down);
  a.up.forEach((v,i)=>expect(v!==null&&a.down[i]!==null).toBe(false));
 });
 it('MISSING: a missing high withholds that bar and the trend restarts from the next valid bar',()=>{
  const broken=bars.map((row,i)=>i===2?{...row,high:Number.NaN}:row);
  const {up,down}=run(broken);
  expect(up[2]).toBeNull();expect(down[2]).toBeNull();
  // The state is reset at the gap, so the following bar cannot invent a trend flip from stale bands.
  expect(down[3]).not.toBeNull();expect(up[3]).toBeNull();
 });
 it('APPEND: adding bars never changes earlier values',()=>{
  const longer=[...bars,bar(5,21,17,18),bar(6,19,15,16)];
  const base=run(bars),more=run(longer);
  expect(more.up.slice(0,bars.length)).toEqual(base.up);expect(more.down.slice(0,bars.length)).toEqual(base.down);
 });
});
