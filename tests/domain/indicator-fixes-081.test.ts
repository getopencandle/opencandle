import {describe,expect,it} from 'vitest';
import {calculateIndicator,vwapAnchorZone,VWAP_EXCHANGE_ZONE} from '../../src/domain/indicators';
import {indicatorDefaults,indicatorLegacyDefaults,validateIndicatorInputs} from '../../src/chart/indicator-settings';
import type {Bar} from '../../src/domain/types';

// SYNTHETIC fixtures (no market data). Expected values are hand-computed or come from a direct transcription of the
// author's published formula in this file.
const D0=19700*86400;
const bar=(i:number,open:number,high:number,low:number,close:number,volume=100,time=D0+i*86400):Bar=>({time,open,high,low,close,volume});
const wave=(count:number)=>Array.from({length:count},(_,i)=>{const c=100+8*Math.sin(i/5)+0.3*i;return bar(i,c-0.4,c+1+(i%3)*0.3,c-1-(i%4)*0.2,c,300+(i*53)%200);});
const plot=(kind:string,bars:readonly Bar[],inputs:Record<string,unknown>,id:string,options={})=>{const result=calculateIndicator(kind,bars,inputs,options);expect(result.diagnostics,kind).toEqual([]);return result.series.find(row=>row.id===id)!.values;};
const near=(got:readonly (number|null)[],want:readonly (number|null)[],digits=9)=>{expect(got.length).toBe(want.length);want.forEach((value,i)=>{if(value===null)expect(got[i],'index '+i).toBeNull();else expect(got[i] as number,'index '+i).toBeCloseTo(value,digits);});};

/** Ehlers, "Using the Fisher Transform" (TASC 2002), transcribed: Price = (H+L)/2; MaxH/MinL = Highest/Lowest(Price, Len). */
function ehlersFisher(bars:readonly Bar[],len:number):(number|null)[]{
 const price=bars.map(b=>(b.high+b.low)/2),out:(number|null)[]=[];let value1=0,fish=0;
 for(let i=0;i<bars.length;i++){
  if(i<len-1){out.push(null);continue;}
  const window=price.slice(i-len+1,i+1),maxH=Math.max(...window),minL=Math.min(...window);
  value1=.33*2*((price[i]-minL)/(maxH-minL)-.5)+.67*value1;
  if(value1>.99)value1=.999;if(value1<-.99)value1=-.999;
  fish=.5*Math.log((1+value1)/(1-value1))+.5*fish;out.push(fish);
 }
 return out;
}

describe('Fisher transform (finding 1)',()=>{
 it('matches Ehlers: highest/lowest of hl2, not highest high/lowest low',()=>{
  const bars=wave(40);near(plot('fisher',bars,{length:9},'fisher'),ehlersFisher(bars,9));
 });
 it('clamps a value above 0.99 to 0.999 (not to min(0.999, value))',()=>{
  // A steady ramp: hl2 is always the window high, so value1 = 0.33 + 0.67 x value1 climbs past 0.99 on bar 12.
  const bars=Array.from({length:16},(_,i)=>bar(i,10+i,11+i,9+i,10+i)),want=ehlersFisher(bars,2),got=plot('fisher',bars,{length:2},'fisher');
  near(got,want);
  let v=0;for(let i=1;i<=12;i++)v=0.33+0.67*v;expect(v).toBeGreaterThan(0.99);expect(v).toBeLessThan(0.999);// the old Math.min clamp kept v here
 });
});

describe('EMA cross (finding 2)',()=>{
 it('marks no cross before both EMAs are seeded, and its lines are the EMA indicator',()=>{
  // A rising series: with a shared first-value seed the short EMA rose above the long one on bar 1 (a false cross up).
  const bars=Array.from({length:40},(_,i)=>bar(i,10+i,11+i,9+i,10+i)),inputs={shortLength:9,longLength:26,source:'close'};
  const up=plot('emacross',bars,inputs,'crossUp'),down=plot('emacross',bars,inputs,'crossDown');
  expect(up.every(value=>value===null)).toBe(true);expect(down.every(value=>value===null)).toBe(true);
  expect(plot('emacross',bars,inputs,'short')).toEqual(plot('ema',bars,{length:9,source:'close'},'ema'));
  expect(plot('emacross',bars,inputs,'long')).toEqual(plot('ema',bars,{length:26,source:'close'},'ema'));
  expect(plot('emacross',bars,inputs,'long').findIndex(value=>value!==null)).toBe(25);
 });
 it('still marks a real cross once both lines exist',()=>{
  // Closes 10 x 4, then 4, 16. EMA2 (SMA seed) -,10,10,10,6,38/3; EMA3 -,-,10,10,7,11.5: down on bar 4, up on bar 5.
  const bars=[10,10,10,10,4,16].map((c,i)=>bar(i,c,c+1,c-1,c)),inputs={shortLength:2,longLength:3,source:'close'};
  near(plot('emacross',bars,inputs,'crossDown'),[null,null,null,null,6,null]);
  near(plot('emacross',bars,inputs,'crossUp'),[null,null,null,null,null,38/3]);
 });
});

describe('volume gaps (finding 3)',()=>{
 const base=wave(60),gap=20,withGap=base.map((row,i)=>i===gap?{...row,volume:NaN}:row),without=base.filter((_,i)=>i!==gap);
 it('Volume, OBV and VWAP are unavailable only at the bar without volume',()=>{
  const volume=plot('volume',withGap,{length:3},'volume');expect(volume[gap]).toBeNull();expect(volume.filter(value=>value===null)).toHaveLength(1);
  const obv=plot('obv',withGap,{},'obv');expect(obv[gap]).toBeNull();expect(obv.filter(value=>value===null)).toHaveLength(1);
  const vwap=plot('vwap',withGap,{anchor:'Year',timezone:'UTC',source:'hlc3'},'vwap');expect(vwap[gap]).toBeNull();expect(vwap.filter(value=>value===null)).toHaveLength(1);
 });
 it('every bar-wise volume kind plots, gaps that bar and resumes from the last bar with volume',()=>{
  for(const [kind,id] of [['mfi','mfi'],['cmf','cmf'],['vwma','vwma'],['efi','efi'],['eom','eom'],['klinger','kvo'],['pvt','pvt'],['ad','ad'],['chaikinosc','osc'],['vo','vo'],['netvol','netvol']] as const){
   const result=calculateIndicator(kind,withGap,{},{calendar:'utc'});expect(result.diagnostics,kind).toEqual([]);expect(result.series.length,kind).toBeGreaterThan(0);
   const got=result.series.find(row=>row.id===id)??result.series[0],reference=calculateIndicator(kind,without,{},{calendar:'utc'}).series.find(row=>row.id===got.id)!.values;
   expect(got.values[gap],kind).toBeNull();
   expect(got.values.filter((_,i)=>i!==gap),kind).toEqual(reference);
  }
 });
 it('a series with no usable volume is still refused',()=>{
  const none=base.map(row=>({...row,volume:NaN}));
  for(const kind of ['volume','obv','mfi'])expect(calculateIndicator(kind,none,{}).diagnostics).toEqual(['This base indicator requires available nonnegative source volume.']);
 });
});

describe('VWAP session zone (finding 4)',()=>{
 // 2024-01-02: 14:30 UTC (09:30 New York), 21:30 UTC (16:30, after hours), 2024-01-03 00:30 UTC (19:30 on Jan 2 in New York).
 const t=Date.UTC(2024,0,2)/1000,bars=[bar(0,10,10,10,10,1,t+52200),bar(1,20,20,20,20,1,t+77400),bar(2,30,30,30,30,1,t+88200)];
 const inputs=(timezone:string)=>({anchor:'Session',timezone,source:'close'});
 it('accepts the Exchange zone choice; saved instances keep their stored zone',()=>{
  expect(indicatorLegacyDefaults.vwap.timezone).toBe('UTC');expect(indicatorDefaults.vwap.timezone).toBe('UTC');// flipping the new-instance default waits on the kernel 2 worker (src/vwap/settings.ts)
  expect(()=>validateIndicatorInputs('vwap',inputs(VWAP_EXCHANGE_ZONE))).not.toThrow();
 });
 it('US after-hours bars stay in their exchange session',()=>{
  near(plot('vwap',bars,inputs(VWAP_EXCHANGE_ZONE),'vwap',{exchangeZone:'America/New_York',calendar:'us-equity'}),[10,15,20]);
  // A saved 'UTC' instance keeps the UTC 00:00 reset.
  near(plot('vwap',bars,inputs('UTC'),'vwap',{exchangeZone:'America/New_York',calendar:'us-equity'}),[10,15,30]);
 });
 it('24/7 and undeclared sources reset at UTC 00:00',()=>{
  near(plot('vwap',bars,inputs(VWAP_EXCHANGE_ZONE),'vwap',{exchangeZone:'America/New_York',calendar:'utc'}),[10,15,30]);
  near(plot('vwap',bars,inputs(VWAP_EXCHANGE_ZONE),'vwap'),[10,15,30]);
  expect(vwapAnchorZone(VWAP_EXCHANGE_ZONE,{exchangeZone:'Not/AZone'})).toBe('UTC');expect(vwapAnchorZone('Europe/London',{exchangeZone:'America/New_York'})).toBe('Europe/London');
 });
});

describe('Supertrend gap (finding 5)',()=>{
 it('keeps the trend and bands across a missing bar',()=>{
  const bars=Array.from({length:40},(_,i)=>bar(i,10+i,11+i,9+i,10.5+i)),gap=30,withGap=bars.map((row,i)=>i===gap?{...row,high:NaN,low:NaN,close:NaN}:row);
  const up=plot('supertrend',withGap,{atrLength:5,factor:3},'upTrend'),down=plot('supertrend',withGap,{atrLength:5,factor:3},'downTrend');
  expect(up[gap]).toBeNull();expect(down[gap]).toBeNull();
  // The bars after the gap continue the uptrend (before 0.8.1 the state was cleared and the next bar was forced down).
  for(let i=gap+1;i<40;i++){if(up[i]===null&&down[i]===null)continue;expect(down[i],'bar '+i).toBeNull();expect(up[i],'bar '+i).not.toBeNull();}
  expect(up.slice(gap+1).some(value=>value!==null)).toBe(true);
 });
});

describe('one EMA seed for every EMA kind (finding 6)',()=>{
 const bars=wave(80),ema=(n:number)=>plot('ema',bars,{length:n,source:'close'},'ema');
 it('catalog EMAs equal the EMA indicator (SMA seed)',()=>{
  expect(plot('guppy',bars,{},'long1')).toEqual(ema(30));
  expect(plot('maribbon',bars,{maType:'EMA',length1:20},'ma1')).toEqual(ema(20));
  expect(plot('env',bars,{exponential:true,length:20},'basis')).toEqual(ema(20));
 });
 it('DEMA starts on bar 2 x (Length - 1) at its hand value',()=>{
  // Closes 10, 12, 11, 13, 16, Length 3: EMA -,-,11,12,14; EMA(EMA) seeds on bar 4 at 37/3; DEMA = 2 x 14 - 37/3.
  const b=[10,12,11,13,16].map((c,i)=>bar(i,c,c,c,c));near(plot('dema',b,{length:3,source:'close'},'dema'),[null,null,null,null,47/3]);
 });
});

describe('Connors RSI percent rank (finding 7)',()=>{
 it('counts earlier rates of change strictly below the current one (ties do not count)',()=>{
  // Closes 10, 11, 20, 22: ROC -, 10, 81.8, 10. With rank length 2 the last ROC (10) ties the first and is below the
  // second, so no earlier value is strictly below it: rank 0 (a <= rule would give 50).
  const b=[10,11,20,22].map((c,i)=>bar(i,c,c+1,c-1,c));
  const crsi=plot('crsi',b,{rsiLength:1,streakLength:1,rankLength:2,source:'close'},'crsi');
  // RSI(1) of a rise = 100; the streak 1, 2, 3 rises, so its RSI(1) = 100.
  near([crsi[3]],[(100+100+0)/3],6);
 });
});
