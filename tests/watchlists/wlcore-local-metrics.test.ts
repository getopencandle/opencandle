import {describe,expect,it} from 'vitest';
import type {Bar} from '../../src/domain/types';
import {LV_METRIC_LABEL,betaMetric,momentumMetric,performanceMetric,volatilityMetric} from '../../src/watchlists/local-metrics';

// SYNTHETIC hand-computed oracles for the formulas. These are OpenCandle's own definitions, not reference values.
const DAY=86400,utc=(y:number,m:number,d:number)=>Date.UTC(y,m-1,d)/1000;
const bar=(time:number,close:number,extra:Partial<Bar>={}):Bar=>({time,open:close,high:close,low:close,close,volume:1,...extra});
const series=(rows:Array<[number,number,number,number]>)=>rows.map(([y,m,d,close])=>bar(utc(y,m,d),close));

describe('performance (close_last / close_base - 1) * 100',()=>{
 it('1W: 100 on the same date 7 days earlier and 110 now gives 10.00',()=>{
  const bars=Array.from({length:10},(_,i)=>bar(utc(2026,1,1)+i*DAY,i===2?100:i===9?110:105));
  expect(performanceMetric(bars,'week',{firstBarIsListingStart:false}).value).toBeCloseTo(10,12);
 });
 it('uses the last bar on or before the base date when that date has no bar, and is unavailable when the series does not reach it',()=>{
  const bars=series([[2026,1,1,90],[2026,1,2,100],[2026,1,5,120],[2026,1,10,110]]);
  // base date is Jan 3 (no bar); the last bar on or before it is Jan 2 at 100
  expect(performanceMetric(bars,'week',{firstBarIsListingStart:false}).value).toBeCloseTo(10,12);
  const short=series([[2026,1,5,120],[2026,1,10,110]]);const result=performanceMetric(short,'week',{firstBarIsListingStart:false});expect(result.value).toBeNull();expect(result.reason).toContain('does not reach');
 });
 it('month arithmetic clamps to the last day of the earlier month (1M, 3M, 1Y, 5Y)',()=>{
  expect(performanceMetric(series([[2026,2,28,50],[2026,3,2,99],[2026,3,31,55]]),'month',{firstBarIsListingStart:false}).value).toBeCloseTo(10,12);
  expect(performanceMetric(series([[2026,2,28,80],[2026,3,2,95],[2026,5,31,100]]),'threeMonths',{firstBarIsListingStart:false}).value).toBeCloseTo(25,12);
  expect(performanceMetric(series([[2027,2,28,200],[2027,3,1,999],[2028,2,29,150]]),'year',{firstBarIsListingStart:false}).value).toBeCloseTo(-25,12);
  expect(performanceMetric(series([[2023,2,28,40],[2023,3,1,999],[2028,2,29,100]]),'fiveYears',{firstBarIsListingStart:false}).value).toBeCloseTo(150,12);
  // A later bar just after the clamped date would be picked if the date overflowed into the next month, so these cases fail without the clamp.
  // leap day: one month before 2024-03-31 is 2024-02-29
  expect(performanceMetric(series([[2024,2,29,10],[2024,3,31,12]]),'month',{firstBarIsListingStart:false}).value).toBeCloseTo(20,12);
 });
 it('YTD uses the last close of the previous calendar year; unavailable without one',()=>{
  const bars=series([[2025,12,30,200],[2025,12,31,100],[2026,1,2,105],[2026,3,1,110]]);
  expect(performanceMetric(bars,'ytd',{firstBarIsListingStart:false}).value).toBeCloseTo(10,12);
  const none=performanceMetric(series([[2026,1,2,105],[2026,3,1,110]]),'ytd',{firstBarIsListingStart:false});expect(none.value).toBeNull();expect(none.reason).toContain('previous calendar year');
 });
 it('All time uses the first bar only when the dataset declares it as the listing start',()=>{
  const bars=series([[2000,1,3,50],[2010,1,4,70],[2026,1,2,150]]);
  expect(performanceMetric(bars,'allTime',{firstBarIsListingStart:true}).value).toBeCloseTo(200,12);
  const unknown=performanceMetric(bars,'allTime',{firstBarIsListingStart:false});expect(unknown.value).toBeNull();expect(unknown.reason).toContain('listing start');
 });
 it('a non-positive base close or a single bar is unavailable', ()=>{
  expect(performanceMetric(series([[2026,1,1,0],[2026,1,10,5]]),'week',{firstBarIsListingStart:false}).value).toBeNull();
  expect(performanceMetric([bar(utc(2026,1,1),5)],'week',{firstBarIsListingStart:false}).value).toBeNull();expect(performanceMetric([],'ytd',{firstBarIsListingStart:false}).value).toBeNull();
 });
});

describe('volatility (population standard deviation of daily log returns, times 100, not annualized)',()=>{
 const fromLogReturns=(returns:number[],start=100)=>{let close=start;const bars=[bar(utc(2026,1,1),close)];returns.forEach((x,i)=>{close*=Math.exp(x);bars.push(bar(utc(2026,1,2)+i*DAY,close));});return bars;};
 it('1D is the last daily bar range over its close: (110 - 100) / 105 * 100',()=>{
  const bars=[bar(1,100),bar(2,105,{high:110,low:100})];expect(volatilityMetric(bars,'1d').value).toBeCloseTo(9.523809523809524,10);
  expect(volatilityMetric([bar(1,100,{high:0,low:0,close:0})],'1d').value).toBeNull();expect(volatilityMetric([],'1d').value).toBeNull();
 });
 it('1W: five returns 0.01, 0.03, 0.01, 0.03, 0.02 have mean 0.02 and population sd sqrt(8e-5), so 0.894427191',()=>{
  expect(volatilityMetric(fromLogReturns([0.01,0.03,0.01,0.03,0.02]),'1w').value).toBeCloseTo(0.8944271909999159,9);
  expect(volatilityMetric(fromLogReturns([0.01,0.03,0.01,0.03]),'1w').value).toBeNull();
 });
 it('1M: 21 alternating returns (11 of +0.01, 10 of -0.01) give sqrt(440)/21 percent; only the last 21 returns count',()=>{
  const alternating=Array.from({length:21},(_,i)=>i%2===0?0.01:-0.01);
  expect(volatilityMetric(fromLogReturns(alternating),'1m').value).toBeCloseTo(Math.sqrt(440)/21,9);
  expect(volatilityMetric(fromLogReturns([0.5,...alternating]),'1m').value).toBeCloseTo(Math.sqrt(440)/21,9);
  expect(volatilityMetric(fromLogReturns(alternating.slice(0,20)),'1m').value).toBeNull();
 });
});

describe('momentum 10 (close_last - close_10_bars_ago)',()=>{
 it('a 1..20 ramp gives 10; ten bars or fewer is unavailable',()=>{
  const ramp=Array.from({length:20},(_,i)=>bar(1+i,i+1));expect(momentumMetric(ramp).value).toBe(10);
  expect(momentumMetric(ramp.slice(0,11)).value).toBe(10);expect(momentumMetric(ramp.slice(0,10)).value).toBeNull();expect(momentumMetric([]).value).toBeNull();
  expect(momentumMetric([...ramp.slice(0,15),bar(100,12.5)]).value).toBeCloseTo(12.5-6,12);
 });
});

describe('beta cov(r_s, r_b) / var(r_b) over shared dates',()=>{
 const build=(returns:number[],start=100,t0=utc(2026,1,1))=>{let close=start;const bars=[bar(t0,close)];returns.forEach((r,i)=>{close*=1+r;bars.push(bar(t0+(i+1)*DAY,close));});return bars;};
 it('hand-computed oracle: 5 returns give 0.00216 / 0.00172 = 54/43',()=>{
  const benchmark=build([0.01,-0.02,0.03,-0.01,0.02]),subject=build([0.02,-0.01,0.05,-0.03,0.01],50);
  expect(betaMetric(subject,benchmark,5).value).toBeCloseTo(54/43,12);
 });
 it('a series that moves exactly twice the benchmark has beta 2 over a full 252-return window',()=>{
  const returns=Array.from({length:252},(_,i)=>0.01*Math.sin(i/3)+0.002*((i*7)%5-2)),benchmark=build(returns),subject=build(returns.map(r=>2*r),30);
  expect(betaMetric(subject,benchmark,252).value).toBeCloseTo(2,12);expect(betaMetric(subject.slice(1),benchmark,252).value).toBeNull();
 });
 it('needs at least 80 percent of the returns on shared dates; a flat benchmark has no beta',()=>{
  const returns=[0.01,-0.02,0.03,-0.01,0.02,0.01,-0.01,0.02,-0.02,0.01],benchmark=build(returns),subject=build(returns.map(r=>3*r));
  expect(betaMetric(subject,benchmark,10).value).toBeCloseTo(3,12);
  // dropping one benchmark date removes the two returns around it: 8 of 10 remain (exactly 80 percent)
  const dropped=benchmark.filter((_,i)=>i!==4),ok=betaMetric(subject,dropped,10);expect(ok.value).not.toBeNull();
  const two=benchmark.filter((_,i)=>i!==3&&i!==7),short=betaMetric(subject,two,10);expect(short.value).toBeNull();expect(short.reason).toContain('80 percent');
  const flat=Array.from({length:6},(_,i)=>bar(utc(2026,1,1)+i*DAY,10));expect(betaMetric(build([0.01,0.02,0.01,0.02,0.01]),flat,5).value).toBeNull();
 });
 it('shares the wording used for the cell tooltip',()=>{expect(LV_METRIC_LABEL).toBe('OpenCandle calculation from imported daily bars');});
});

describe('beta full windows (3Y and 5Y)',()=>{
 const build=(returns:number[],start:number)=>{let close=start;const bars=[bar(utc(2020,1,1),close)];returns.forEach((r,i)=>{close*=1+r;bars.push(bar(utc(2020,1,1)+(i+1)*DAY,close));});return bars;};
 for(const [label,count] of [['3Y',756],['5Y',1260]] as const)it(label+': a series at three times the benchmark moves over '+count+' returns has beta 3, and one bar short is unavailable',()=>{
  const returns=Array.from({length:count},(_,i)=>0.01*Math.sin(i/5)+0.002*((i*3)%7-3)),benchmark=build(returns,100),subject=build(returns.map(r=>3*r),20);
  expect(betaMetric(subject,benchmark,count).value).toBeCloseTo(3,11);expect(betaMetric(subject.slice(1),benchmark,count).value).toBeNull();
 });
});
