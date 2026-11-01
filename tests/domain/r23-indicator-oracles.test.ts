import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {R23_INDICATOR_IDS,autoPeriodsPerYear,pivotAutoTimeframe,pivotCalendar,pivotPeriodKey,sourcePivotCalendar} from '../../src/domain/indicators-ext/r23-catalog';
import {indicatorDefaults,indicatorLegacyDefaults} from '../../src/chart/indicator-settings';
import type {IndicatorCalculationOptions} from '../../src/domain/indicators';

// numerical oracles. SYNTHETIC bars only. Every expected value was computed by hand from the cited
// textbook / author / public-help formula, independent of the production code.
type Row=[number,number,number,number,number?];// high, low, close, volume, open
const bars=(rows:Row[],step=86400,t0=1704067200)=>rows.map(([high,low,close,volume,open],i)=>({time:t0+i*step,open:open??close,high,low,close,volume}));
const flat=(closes:number[])=>bars(closes.map(close=>[close,close,close,100] as Row));
const run=(kind:string,data:ReturnType<typeof bars>,inputs:Record<string,unknown>,options:IndicatorCalculationOptions={})=>{const result=calculateIndicator(kind,data,inputs,options);expect(result.diagnostics).toEqual([]);return result;};
const series=(kind:string,data:ReturnType<typeof bars>,inputs:Record<string,unknown>,plot:string)=>run(kind,data,inputs).series.find(row=>row.id===plot)!.values;
const near=(actual:(number|null)[],expected:(number|null)[])=>{expect(actual.map(value=>value===null)).toEqual(expected.map(value=>value===null));actual.forEach((value,i)=>{if(value!==null)expect(value).toBeCloseTo(expected[i]!,10);});};
const C=flat([10,12,11,13,16]);
// Bars B (H/L/C/V): the same synthetic set as the oracles.
const B=bars([[10,8,9,100],[12,9,11,200],[11,9,10,150],[15,11,14,300],[16,12,13,250]]);

describe(' catalog shape',()=>{
 it('every kind is a catalog definition with OpenCandle-defined defaults flagged',()=>{
  for(const kind of R23_INDICATOR_IDS){const definition=catalogDefinition(kind)!;expect(definition,kind).toBeDefined();expect(definition.unknownDefaults!.join(' ')).toMatch(/OpenCandle-defined/);expect(definition.provenance.length).toBeGreaterThan(0);}
 });
});

describe('moving averages (synthetic)',()=>{
 it('VWMA = sum(close x volume) / sum(volume)',()=>{
  near(series('vwma',B,{length:2,source:'close'},'vwma'),[null,31/3,74/7,38/3,149/11]);// (9x100+11x200)/300 ...
  const gap=B.map((bar,i)=>i===2?{...bar,close:NaN}:bar);near(series('vwma',gap,{length:2,source:'close'},'vwma'),[null,31/3,null,null,149/11]);// missing close: its windows are unavailable
 });
 it('DEMA / TEMA from SMA-seeded EMAs (0.8.1: was first-value seeded)',()=>{
  // Length 3 (alpha 0.5): EMA1 -,-,11,12,14; EMA2 seeds on bar 4 at (11 + 12 + 14) / 3 = 37/3; DEMA = 28 - 37/3.
  near(series('dema',C,{length:3,source:'close'},'dema'),[null,null,null,null,47/3]);
  // Length 2 (alpha 2/3): EMA1 -,11,11,37/3,133/9; EMA2 -,-,11,107/9,373/27; EMA3 -,-,-,103/9,1055/81.
  near(series('tema',C,{length:2,source:'close'},'tema'),[null,null,null,3*37/3-3*107/9+103/9,3*133/9-3*373/27+1055/81]);
 });
 it('ALMA Gaussian weights, m = offset x (n - 1), s = n / sigma',()=>{
  const w=Math.exp(-0.5);// offset 0.5 sigma 3 length 3: m 1, s 1 -> weights w,1,w
  near(series('alma',C,{length:3,offset:0.5,sigma:3,source:'close'},'alma'),[null,null,(10*w+12+11*w)/(1+2*w),(12*w+11+13*w)/(1+2*w),(11*w+13+16*w)/(1+2*w)]);
  const a=Math.exp(-2),b=Math.exp(-0.5);// offset 1: m 2 -> weights e^-2, e^-0.5, 1
  near(series('alma',C,{length:3,offset:1,sigma:3,source:'close'},'alma'),[null,null,(10*a+12*b+11)/(a+b+1),(12*a+11*b+13)/(a+b+1),(11*a+13*b+16)/(a+b+1)]);
 });
});

describe('oscillators (synthetic)',()=>{
 it('Ultimate oscillator 1/2/3: BP 2,1,4,1; TR 3,2,5,4',()=>{
  near(series('uo',B,{fast:1,middle:2,slow:3},'uo'),[null,null,null,3730/49,26300/693]);
 });
 it('Chande momentum oscillator',()=>{
  near(series('cmo',C,{length:2,source:'close'},'cmo'),[null,null,100/3,100/3,100]);// changes 2,-1,2,3
  near(series('cmo',flat([5,5,5,6]),{length:2,source:'close'},'cmo'),[null,null,null,100]);// no change at all is unavailable
 });
 it('TRIX = 100 x 1-bar change of EMA(EMA(EMA(close)))',()=>{
  // 0.8.1 SMA seed. Length 2: E3 -,-,-,103/9,1055/81 (see TEMA above), so the first TRIX is on bar 4.
  near(series('trix',C,{length:2},'trix'),[null,null,null,null,100*(1055/81-103/9)/(103/9)]);
 });
 it('Elder force index = EMA((close - prior close) x volume)',()=>{
  near(series('efi',B,{length:1},'efi'),[null,400,-150,1200,-250]);
  // 0.8.1 SMA seed: raw 400, -150, 1200 seed bar 3 at 1450/3; bar 4 = 0.5 x -250 + 0.5 x 1450/3 = 350/3.
  near(series('efi',B,{length:3},'efi'),[null,null,null,1450/3,350/3]);
 });
});

describe('volatility (synthetic)',()=>{
 it('Standard deviation, population estimator',()=>{
  near(series('stddev',C,{length:3,source:'close'},'stddev'),[null,null,Math.sqrt(2/3),Math.sqrt(2/3),Math.sqrt(38)/3]);
 });
 it('Historical volatility: 100 x sample sd of log returns x sqrt(periods per year)',()=>{
  const r=[Math.log(12/10),Math.log(11/12),Math.log(13/11),Math.log(16/13)],sd2=(a:number,b:number)=>Math.abs(a-b)/Math.SQRT2;// n = 2 sample sd
  near(series('hv',C,{length:2,periodsPerYear:1},'hv'),[null,null,100*sd2(r[0],r[1]),100*sd2(r[1],r[2]),100*sd2(r[2],r[3])]);
  near(series('hv',C,{length:2,periodsPerYear:4},'hv').slice(2),[200*sd2(r[0],r[1]),200*sd2(r[1],r[2]),200*sd2(r[2],r[3])]);
  const gap=C.map((bar,i)=>i===2?{...bar,close:NaN}:bar);expect(series('hv',gap,{length:2,periodsPerYear:1},'hv')).toEqual([null,null,null,null,null]);// returns 2 and 3 are unavailable
 });
 it('Historical volatility Auto annualisation follows the interval and market; saved instances keep their number',()=>{
  const day=[{time:Date.UTC(2024,0,8)/1000},{time:Date.UTC(2024,0,9)/1000}];// Monday, Tuesday: no weekend bar
  expect(autoPeriodsPerYear(day,'1D','us-equity')).toBe(252);expect(autoPeriodsPerYear(day,'1W','us-equity')).toBe(52);expect(autoPeriodsPerYear(day,'1M','us-equity')).toBe(12);
  expect(autoPeriodsPerYear(day,'5','us-equity')).toBe(252*78);expect(autoPeriodsPerYear(day,'60','us-equity')).toBe(252*7);// 390 / 60 = 6.5: the last hour bar is short
  expect(autoPeriodsPerYear(day,'2D','us-equity')).toBe(126);
  expect(autoPeriodsPerYear(day,'1D','utc')).toBe(365);expect(autoPeriodsPerYear(day,'60','utc')).toBe(365*24);expect(autoPeriodsPerYear(day,'5','utc')).toBe(365*288);expect(autoPeriodsPerYear(day,'1W','utc')).toBeCloseTo(365/7,12);
  // No resolution: bar spacing (daily bars, inferred US equity) and a 24/7 feed inferred from a weekend bar.
  expect(autoPeriodsPerYear(day,null,null)).toBe(252);expect(autoPeriodsPerYear([{time:Date.UTC(2024,0,6)/1000},{time:Date.UTC(2024,0,7)/1000}],null,null)).toBe(365);
  // New instances default to Auto; a saved instance (no annualization key) keeps its stored Periods per year.
  expect(indicatorDefaults.hv.annualization).toBe('Auto');expect(Object.hasOwn(indicatorLegacyDefaults.hv,'annualization')).toBe(false);
  const r=[Math.log(12/10),Math.log(11/12),Math.log(13/11),Math.log(16/13)],sd2=(a:number,b:number)=>Math.abs(a-b)/Math.SQRT2;
  near(series('hv',C,{length:2,periodsPerYear:252},'hv').slice(2),r.slice(1).map((value,i)=>100*sd2(r[i],value)*Math.sqrt(252)));// saved: stored 252
  const weekly=run('hv',C,{length:2,annualization:'Auto',periodsPerYear:252},{resolution:'1W',calendar:'us-equity'}).series[0].values;
  near(weekly.slice(2),r.slice(1).map((value,i)=>100*sd2(r[i],value)*Math.sqrt(52)));
  const crypto=run('hv',C,{length:2,annualization:'Auto'},{resolution:'60',calendar:'utc'}).series[0].values;
  near(crypto.slice(2),r.slice(1).map((value,i)=>100*sd2(r[i],value)*Math.sqrt(365*24)));
  near(run('hv',C,{length:2,annualization:'Manual',periodsPerYear:4},{resolution:'1W',calendar:'utc'}).series[0].values.slice(2),r.slice(1).map((value,i)=>200*sd2(r[i],value)));
 });
 it('Linear regression channel over the latest Count bars',()=>{
  const sd=Math.sqrt(1/18);// closes 11,13,16: line 65/6 + 2.5k, residuals 1/6,-2/6,1/6
  near(series('lrc',C,{length:3,upperDeviation:2,lowerDeviation:1,source:'close'},'basis'),[null,null,65/6,40/3,95/6]);
  near(series('lrc',C,{length:3,upperDeviation:2,lowerDeviation:1,source:'close'},'upper'),[null,null,65/6+2*sd,40/3+2*sd,95/6+2*sd]);
  near(series('lrc',C,{length:3,upperDeviation:2,lowerDeviation:1,source:'close'},'lower'),[null,null,65/6-sd,40/3-sd,95/6-sd]);
  // fewer bars than Count: fit all loaded bars (closes 10,12,11,13,16: slope 1.3, intercept 9.8)
  near(series('lrc',C,{length:10,upperDeviation:0,lowerDeviation:0,source:'close'},'basis'),[9.8,11.1,12.4,13.7,15]);
  const gap=C.map((bar,i)=>i===3?{...bar,close:NaN}:bar);expect(series('lrc',gap,{length:3,upperDeviation:2,lowerDeviation:2,source:'close'},'basis')).toEqual([null,null,null,null,null]);
 });
});

describe('Ichimoku cloud (synthetic)',()=>{
 it('lines from highest-high / lowest-low midpoints, spans shifted by displacement - 1',()=>{
  const inputs={conversionLength:1,baseLength:2,spanBLength:3,displacement:2},plot=(id:string)=>series('ichimoku',B,inputs,id);
  near(plot('conversion'),[9,10.5,10,13,14]);
  near(plot('base'),[null,10,10.5,12,13.5]);
  near(plot('upper'),[null,null,10.25,10.25,12.5]);// (conversion + base) / 2 of the prior bar
  near(plot('lower'),[null,null,null,10,12]);// 3-bar midpoint of the prior bar
  near(plot('lagging'),[11,10,14,13,null]);// close one bar later
 });
 it('a missing high blanks every window that contains it',()=>{
  const gap=B.map((bar,i)=>i===1?{...bar,high:NaN}:bar);
  near(series('ichimoku',gap,{conversionLength:1,baseLength:2,spanBLength:3,displacement:2},'base'),[null,null,null,12,13.5]);
 });
});

describe('Pivot points standard (synthetic, help 43000521824 formulas)',()=>{
 // UTC calendar (declared, as for crypto). Two hourly bars per UTC day. Day 1 aggregates O10 H13 L9 C12; day 2 opens at 12.
 const D0=1704067200,day=(d:number,rows:Row[])=>rows.map(([h,l,c,v,o],i)=>({time:D0+d*86400+i*3600,open:o!,high:h,low:l,close:c,volume:v}));
 const P=[...day(0,[[12,9,11,100,10],[13,10,12,100,11]]),...day(1,[[14,11,13,100,12],[15,12,14,100,13]])];
 const levels=(type:string,data=P,extra:Record<string,unknown>={})=>{const result=run('pivots',data,{type,timeframe:'Daily',pivotsBack:15,...extra},{calendar:'utc'});return Object.fromEntries(result.series.map(row=>[row.id,row.values]));};
 const day2=(type:string,expected:Record<string,number|null>)=>{const got=levels(type);for(const [id,value] of Object.entries(expected)){near(got[id],[null,null,value,value]);}};
 it('Traditional',()=>day2('Traditional',{p:34/3,r1:41/3,s1:29/3,r2:46/3,s2:22/3,r3:53/3,s3:17/3,r4:20,s4:4,r5:67/3,s5:7/3}));
 it('Fibonacci',()=>day2('Fibonacci',{p:34/3,r1:34/3+0.382*4,s1:34/3-0.382*4,r2:34/3+0.618*4,s2:34/3-0.618*4,r3:46/3,s3:22/3,r4:null,s4:null,r5:null,s5:null}));
 it('Woodie (current open 12)',()=>day2('Woodie',{p:11.5,r1:14,s1:10,r2:15.5,s2:7.5,r3:18,s3:6,r4:22,s4:2,r5:null,s5:null}));
 it('Classic',()=>day2('Classic',{p:34/3,r1:41/3,s1:29/3,r2:46/3,s2:22/3,r3:34/3+8,s3:34/3-8,r4:34/3+12,s4:34/3-12,r5:null,s5:null}));
 it('DM (prior close above prior open: X = 2H + L + C = 47)',()=>day2('DM',{p:47/4,r1:29/2,s1:21/2,r2:null,s2:null,r3:null,r4:null,r5:null}));
 it('Camarilla',()=>day2('Camarilla',{p:34/3,r1:12+4.4/12,s1:12-4.4/12,r2:12+4.4/6,s2:12-4.4/6,r3:12+1.1,s3:12-1.1,r4:12+2.2,s4:12-2.2,r5:52/3,s5:20/3}));
 it('missing prices are skipped inside a period; Number of pivots back limits the shown periods',()=>{
  const gap=[...day(0,[[12,9,11,100,10],[NaN,NaN,NaN,100,NaN],[13,10,12,100,11]]),...day(1,[[14,11,13,100,12]])];
  expect(levels('Traditional',gap).p.slice(3)).toEqual([34/3]);expect(levels('Traditional',gap).p.slice(0,3)).toEqual([null,null,null]);
  const three=[...P,...day(2,[[16,13,15,100,14]])];// day 2 aggregates O12 H15 L11 C14 -> P 40/3
  near(levels('Traditional',three,{pivotsBack:1}).p,[null,null,null,null,40/3]);
  near(levels('Traditional',three,{pivotsBack:2}).p,[null,null,34/3,34/3,40/3]);
 });
 it('Auto timeframe: 1D up to 15 minutes, 1W below 1 day, 1M from 1 day, 1Y from 1 week; Monday weeks',()=>{
  const spaced=(step:number)=>[{time:0},{time:step}];
  expect(pivotAutoTimeframe(spaced(900))).toBe('Daily');expect(pivotAutoTimeframe(spaced(3600))).toBe('Weekly');
  expect(pivotAutoTimeframe(spaced(86400))).toBe('Monthly');expect(pivotAutoTimeframe(spaced(82800))).toBe('Monthly');// DST-shortened daily bar
  // ChartSchool: weekly and monthly charts use the prior year's data. Spacing of 6 days or more counts as weekly.
  expect(pivotAutoTimeframe(spaced(5*86400))).toBe('Monthly');expect(pivotAutoTimeframe(spaced(6*86400))).toBe('Yearly');expect(pivotAutoTimeframe(spaced(7*86400))).toBe('Yearly');expect(pivotAutoTimeframe(spaced(28*86400))).toBe('Yearly');
  const sunday=Date.UTC(2024,0,7)/1000,monday=Date.UTC(2024,0,8)/1000,nextSunday=Date.UTC(2024,0,14,23)/1000;
  expect(pivotPeriodKey(sunday,'Weekly')).not.toBe(pivotPeriodKey(monday,'Weekly'));expect(pivotPeriodKey(monday,'Weekly')).toBe(pivotPeriodKey(nextSunday,'Weekly'));
  expect(pivotPeriodKey(Date.UTC(2024,2,31)/1000,'Quarterly')).not.toBe(pivotPeriodKey(Date.UTC(2024,3,1)/1000,'Quarterly'));
  // Auto on the two-day hourly fixture is Weekly: both days share one week, so no prior period exists.
  expect(run('pivots',P,{type:'Traditional',timeframe:'Auto',pivotsBack:15},{calendar:'utc'}).series[0].values).toEqual([null,null,null,null]);
 });
});

describe('Zig zag (synthetic)',()=>{
 const Z=flat([100,110,104,120,90,95]);
 it('deviation 5%, depth 1: every reversal of at least 5% is a pivot; the last leg runs to the current extreme',()=>{
  near(series('zigzag',Z,{deviation:5,depth:1},'zigzag'),[100,110,104,120,90,95]);
 });
 it('depth 2 ignores pivots closer than 2 bars; the line interpolates between pivots',()=>{
  // The bar after the current extreme (90) is the last-leg extension to the newest close (95), not empty.
  near(series('zigzag',Z,{deviation:5,depth:2},'zigzag'),[100,100+20/3,100+40/3,120,90,95]);
  near(series('zigzag',Z,{deviation:20,depth:1},'zigzag'),[100,100+20/3,100+40/3,120,90,95]);
 });
 it('a bar with a missing high or low is unavailable and changes no state',()=>{
  const gap=Z.map((bar,i)=>i===2?{...bar,high:NaN,low:NaN}:bar);
  near(series('zigzag',gap,{deviation:5,depth:1},'zigzag'),[100,100+20/3,null,120,90,95]);// 110 -> 120 is no reversal, so 110 is never a pivot and the line runs 100 -> 120
 });
 it('the last leg extends from the current extreme to the newest bar close (OpenCandle-defined), so the newest bar is never empty',()=>{
  // 100 low, 120 high (pivot), then 90 is the current extreme of the down leg; 93, 96 and 99 are too small to reverse (deviation 20%).
  const R=flat([100,110,120,90,93,96,99]);
  const values=series('zigzag',R,{deviation:20,depth:1},'zigzag');
  near(values,[100,110,120,90,93,96,99]);// 90 -> 99 over three bars: 93, 96, 99
  expect(values.at(-1)).toBe(99);
  // The extension ends on the newest bar with a high, low and close; a missing newest bar stays empty and the line stops at the bar before.
  const tail=R.map((bar,i)=>i===6?{...bar,high:NaN,low:NaN,close:NaN}:bar);
  near(series('zigzag',tail,{deviation:20,depth:1},'zigzag'),[100,110,120,90,93,96,null]);
  // No first swing yet: nothing is drawn, and nothing is extended.
  expect(series('zigzag',flat([100,101,102]),{deviation:20,depth:1},'zigzag')).toEqual([null,null,null]);
  // Uneven closes: the extension is a straight line to the newest close, not the bars in between.
  const U=bars([[100,100,100,1],[120,120,120,1],[90,90,90,1],[95,91,92,1],[97,94,96,1]]);
  near(series('zigzag',U,{deviation:20,depth:1},'zigzag'),[100,120,90,93,96]);
 });
});

describe('Pivot points on US equities: New York trading dates and the regular session (synthetic)',()=>{
 // 2026-03-02 (Mon) .. 2026-03-05 (Thu), EST (UTC-5). Pre-market 08:00 = 13:00Z, 09:30 = 14:30Z, 10:00 = 15:00Z, after-hours 16:30 = 21:30Z.
 const at=(day:number,hour:number,minute:number)=>Date.UTC(2026,2,day,hour,minute)/1000;
 const bar=(time:number,o:number,h:number,l:number,c:number)=>({time,open:o,high:h,low:l,close:c,volume:100});
 const NY=[
  bar(at(2,13,0),50,200,1,50),// day 1 pre-market extremes: excluded
  bar(at(2,14,30),10,12,9,11),bar(at(2,15,0),11,13,10,12),// day 1 regular session: O10 H13 L9 C12
  bar(at(2,21,30),50,300,0.5,60),// day 1 after-hours extremes: excluded
  bar(at(3,13,0),12.5,14,12,13),// day 2 pre-market: belongs to day 2
  bar(at(3,14,30),12,14,11,13),// day 2 regular: O12 H14 L11 C13
 ];
 const p=(data:typeof NY,inputs:Record<string,unknown>,options:IndicatorCalculationOptions)=>run('pivots',data as any,{type:'Traditional',timeframe:'Daily',pivotsBack:15,...inputs},options).series.find(row=>row.id==='p')!.values;
 it('a daily pivot uses the prior regular session high, low and close; pre-market bars already show the new day',()=>{
  near(p(NY,{},{calendar:'us-equity'}),[null,null,null,null,34/3,34/3]);
  near(p(NY,{},{}),[null,null,null,null,34/3,34/3]);// inferred: weekdays only, every bar inside 04:00-20:00 New York
 });
 it('Woodie uses the current regular-session open, so pre-market bars have no Woodie levels',()=>{
  near(p(NY,{type:'Woodie'},{calendar:'us-equity'}),[null,null,null,null,null,11.5]);// (13 + 9 + 2 x 12) / 4
 });
 it('crypto (UTC calendar) counts every bar of the UTC day',()=>{
  near(p(NY,{},{calendar:'utc'}),[null,null,null,null,360.5/3,360.5/3]);// O50 H300 L0.5 C60
 });
 it('a date without regular-session bars is skipped: the next date uses the latest complete session',()=>{
  const data=[...NY,bar(at(4,13,0),13,13.5,12.5,13),bar(at(5,14,30),13,14,12,13.5)];// day 3 pre-market only
  near(p(data,{},{calendar:'us-equity'}),[null,null,null,null,34/3,34/3,38/3,38/3]);// day 2 regular O12 H14 L11 C13
 });
 it('Auto uses the declared interval; without one it falls back to bar spacing',()=>{
  const auto=(options:IndicatorCalculationOptions)=>p(NY,{timeframe:'Auto'},{calendar:'us-equity',...options});
  near(auto({resolution:'5m'}),[null,null,null,null,34/3,34/3]);// 1D pivots
  expect(auto({resolution:'1h'})).toEqual(Array(6).fill(null));// 1W: both dates share one week
  expect(auto({resolution:'1D'})).toEqual(Array(6).fill(null));// 1M
  expect(auto({})).toEqual(Array(6).fill(null));// smallest spacing 30 minutes -> 1W
  expect(pivotAutoTimeframe([{time:0},{time:300}],'1D')).toBe('Monthly');expect(pivotAutoTimeframe([{time:0},{time:86400}],'15')).toBe('Daily');
  expect(pivotAutoTimeframe([{time:0},{time:86400}],'100T')).toBe('Monthly');// tick interval: spacing fallback
  expect(pivotAutoTimeframe([{time:0},{time:86400}],'1W')).toBe('Yearly');expect(pivotAutoTimeframe([{time:0},{time:86400}],'1M')).toBe('Yearly');expect(pivotAutoTimeframe([{time:0},{time:86400}],'3M')).toBe('Yearly');
  expect(pivotAutoTimeframe([{time:0},{time:86400}],'5D')).toBe('Monthly');// 1D up to below 1W stays Monthly
 });
 it('Auto on a weekly chart uses the prior calendar year',()=>{
  // SYNTHETIC weekly bars (UTC calendar): 2023 has H20 L5 C12; every 2024 bar carries P = (20 + 5 + 12) / 3.
  const t2023=Date.UTC(2023,10,6)/1000,t2024=Date.UTC(2024,0,8)/1000,w=7*86400;
  const weekly=[bar(t2023,15,20,10,15),bar(t2023+w,15,15,5,12),bar(t2024,28,30,25,28),bar(t2024+w,29,31,26,29)];
  near(run('pivots',weekly,{type:'Traditional',timeframe:'Auto',pivotsBack:15},{resolution:'1W',calendar:'utc'}).series[0].values,[null,null,37/3,37/3]);
 });
 it('daily bars land on their trading date whether stamped at New York or UTC midnight; weeks start on Monday in New York',()=>{
  const nyMidnight=Date.UTC(2026,2,2,5)/1000,utcMidnight=Date.UTC(2026,2,2)/1000;
  expect(pivotPeriodKey(nyMidnight,'Daily','us-equity',true)).toBe(pivotPeriodKey(utcMidnight,'Daily','us-equity',true));
  expect(pivotPeriodKey(at(6,14,30),'Weekly','us-equity')).not.toBe(pivotPeriodKey(at(9,13,30),'Weekly','us-equity'));
  expect(pivotPeriodKey(at(2,14,30),'Weekly','us-equity')).toBe(pivotPeriodKey(at(6,20,59),'Weekly','us-equity'));
  // 2026-03-31 19:30 New York is 2026-04-01 UTC: the New York quarter is still Q1.
  expect(pivotPeriodKey(Date.UTC(2026,3,1,0,30)/1000,'Quarterly','us-equity')).toBe('2026-Q0');expect(pivotPeriodKey(Date.UTC(2026,3,1,0,30)/1000,'Quarterly','utc')).toBe('2026-Q1');
 });
 it('calendar inference and the source mapping',()=>{
  expect(pivotCalendar([{time:at(7,15,0)}])).toBe('utc');// Saturday
  expect(pivotCalendar([{time:at(2,3,0)},{time:at(2,3,30)}])).toBe('utc');// 22:00 New York: outside the extended session
  expect(pivotCalendar(NY)).toBe('us-equity');expect(pivotCalendar(NY,null,'utc')).toBe('utc');expect(pivotCalendar([])).toBe('utc');
  expect(sourcePivotCalendar('crypto','UTC')).toBe('utc');expect(sourcePivotCalendar('stock','America/New_York')).toBe('us-equity');expect(sourcePivotCalendar('etf','America/New_York')).toBe('us-equity');
  expect(sourcePivotCalendar('stock','UTC')).toBeUndefined();expect(sourcePivotCalendar('forex','America/New_York')).toBeUndefined();
 });
 it('an invalid declared calendar or resolution is refused, not guessed',()=>{
  expect(calculateIndicator('pivots',NY as any,{},{calendar:'nyse' as any}).diagnostics.join(' ')).toMatch(/session calendar/);
  expect(calculateIndicator('pivots',NY as any,{},{resolution:7 as any}).diagnostics.join(' ')).toMatch(/resolution/);
 });
});
