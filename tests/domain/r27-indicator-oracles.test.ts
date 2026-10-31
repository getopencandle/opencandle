import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {R27_INDICATOR_IDS} from '../../src/domain/indicators-ext/r27-catalog';
import type {Bar} from '../../src/domain/types';

// Hand-computed oracles for the built-ins. All bars below are SYNTHETIC fixtures made up for these
// tests (no market data). Each expected value is worked out in the comment next to it from the published formula.
const D0=19700*86400;
const bar=(i:number,open:number,high:number,low:number,close:number,volume=100):Bar=>({time:D0+i*86400,open,high,low,close,volume});
const fromCloses=(closes:number[])=>closes.map((close,i)=>bar(i,close,close+1,close-1,close));
const values=(kind:string,bars:readonly Bar[],inputs:Record<string,unknown>={},plot?:string,options={})=>{
 const result=calculateIndicator(kind,bars,inputs,options);expect(result.diagnostics,kind).toEqual([]);
 return result.series.find(row=>row.id===(plot??result.series[0].id))!.values;
};
const close=(got:readonly (number|null)[],want:readonly (number|null)[])=>{expect(got.length).toBe(want.length);want.forEach((value,i)=>{if(value===null)expect(got[i],'index '+i).toBeNull();else expect(got[i] as number,'index '+i).toBeCloseTo(value,6);});};

describe(' catalog shape (SYNTHETIC)',()=>{
 it('every kind is in the catalog with provenance and OpenCandle-defined unknowns',()=>{
  expect(R27_INDICATOR_IDS.length).toBe(32);
  for(const kind of R27_INDICATOR_IDS){const definition=catalogDefinition(kind)!;expect(definition,kind).toBeDefined();expect(definition.provenance.length,kind).toBeGreaterThan(0);expect(definition.unknownDefaults!.join(' '),kind).toMatch(/OpenCandle-defined/);}
 });
 it('names recorded in the Indicators dialog fact are used as written',()=>{
  const expected:Record<string,string>={ad:'Accumulation/distribution',autofib:'Auto fib retracement',adr:'Average daily range',bop:'Balance of power',bbpb:'Bollinger Bands %b',bbw:'Bollinger BandWidth',bbpower:'Bull bear power',chaikinosc:'Chaikin oscillator',chop:'Choppiness index',crsi:'Connors RSI',coppock:'Coppock curve'};
  for(const [kind,name] of Object.entries(expected))expect(catalogDefinition(kind)!.name).toBe(name);
 });
 it('every kind calculates its defaults on 400 synthetic bars without diagnostics, and every visible plot has values',()=>{
  const bars=Array.from({length:400},(_,i)=>{const c=100+10*Math.sin(i/9)+i*0.02;return {time:D0+i*3600,open:c-0.3,high:c+1+(i%3)*0.2,low:c-1-(i%4)*0.1,close:c,volume:500+(i*37)%250};});
  for(const kind of R27_INDICATOR_IDS){const result=calculateIndicator(kind,bars,{},{calendar:'utc'});expect(result.diagnostics,kind).toEqual([]);
   for(const plot of catalogDefinition(kind)!.plots)expect(result.series.find(row=>row.id===plot.id)!.values.some(value=>value!==null),kind+'.'+plot.id).toBe(true);}
 });
});

describe(' volume kinds (SYNTHETIC)',()=>{
 const v=[bar(0,10,12,8,11,100),bar(1,10,10,10,10,50),bar(2,12,13,9,10,200)];
 it('Accumulation/distribution: cumulative CLV x volume, a flat bar adds 0',()=>{
  // CLV0 = ((11-8)-(12-11))/4 = 0.5 -> 50; flat bar +0 -> 50; CLV2 = ((10-9)-(13-10))/4 = -0.5 -> -100 -> -50
  close(values('ad',v),[50,50,-50]);
 });
 it('Chaikin oscillator: EMA(AD, fast) - EMA(AD, slow)',()=>{
  // EMA1 = AD; EMA2 (alpha 2/3): 50, 50, (2/3)(-50) + (1/3)(50) = -50/3 -> osc 0, 0, -50 + 50/3 = -100/3
  close(values('chaikinosc',v,{fast:1,slow:2}),[0,0,-100/3]);
 });
 it('Price volume trend: cumulative (C - C1)/C1 x V from the second bar',()=>{
  const b=[bar(0,10,11,9,10,100),bar(1,10,12,10,11,100),bar(2,11,12,9,9.9,200)];
  // +1/10 x 100 = 10; -1.1/11 x 200 = -20 -> -10
  close(values('pvt',b),[null,10,-10]);
 });
 it('Net volume: volume signed by the close change, unchanged closes add 0',()=>{
  const b=[10,11,11,9].map((c,i)=>bar(i,c,c+1,c-1,c,100*(i+1)));
  close(values('netvol',b),[null,200,0,-400]);
 });
 it('Volume oscillator: (EMA short - EMA long) / EMA long x 100',()=>{
  // EMA2 of 100, 200 = 100, 166.667 -> (200 - 166.667) / 166.667 x 100 = 20
  close(values('vo',[bar(0,1,2,0,1,100),bar(1,1,2,0,1,200)],{shortLength:1,longLength:2}),[0,20]);
 });
 it('Ease of movement: midpoint move x range / (volume / divisor), averaged; zero volume is unavailable',()=>{
  const b=[bar(0,10,12,8,10,100),bar(1,12,14,10,12,200),bar(2,12,14,10,12,0)];
  // (12 - 10) x 4 / (200 / 10000) = 400
  close(values('eom',b,{length:1}),[null,400,null]);
 });
 it('Klinger oscillator: MetaStock volume force with |2 x (dm/cm - 1)|, EMA(VF, fast) - EMA(VF, slow)',()=>{
  const b=[bar(0,10,12,8,10,100),bar(1,11,13,9,12,100),bar(2,11,12,10,11,200),bar(3,12,14,10,13,100)];
  // hlc3 10, 11.333, 11, 12.333 -> trend +1, -1, +1; dm 4, 4, 2, 4; cm 8, 6, 6
  // VF 10000, -80000/3, 20000/3; EMA2: 10000, -130000/9, -10000/27 -> KVO 0, -110000/9, 190000/27
  close(values('klinger',b,{fastLength:1,slowLength:2,signalLength:1}),[null,0,-110000/9,190000/27]);
 });
 it('Relative volume at time: cumulative and regular, against the same time of day in prior sessions (UTC calendar)',()=>{
  const vols=[100,200,300,100,200,600],b=vols.map((volume,i)=>({time:D0+Math.floor(i/2)*86400+(i%2)*43200,open:10,high:11,low:9,close:10,volume}));
  // cumulative day 2: 200 / mean(100, 300) = 1; 800 / mean(300, 400) = 2.285714
  close(values('rvat',b,{length:2},'rvol',{calendar:'utc'}),[null,null,null,null,1,800/350]);
  // regular: 200 / mean(100, 300) = 1; 600 / mean(200, 100) = 4
  close(values('rvat',b,{length:2,mode:'Regular'},'rvol',{calendar:'utc'}),[null,null,null,null,1,4]);
 });
});

describe(' oscillators (SYNTHETIC)',()=>{
 it('Balance of power: (C - O) / (H - L); a flat bar is unavailable',()=>{
  close(values('bop',[bar(0,10,12,8,11),bar(1,10,10,10,10),bar(2,12,13,9,10)]),[0.25,null,-0.5]);
 });
 it('Bollinger Bands %b and BandWidth on population deviation',()=>{
  const b=fromCloses([1,3,2,2]);
  // i1: mean 2, sd 1 -> bands 3/1 -> %b 1, width 2/2 = 1; i2: mean 2.5, sd 0.5 -> 3/2 -> %b 0, width 1/2.5 = 0.4; i3 flat
  close(values('bbpb',b,{length:2,multiplier:1}),[null,1,0,null]);
  close(values('bbw',b,{length:2,multiplier:1}),[null,1,0.4,0]);
 });
 it('Average daily range: SMA of high - low',()=>{close(values('adr',[bar(0,10,12,8,10),bar(1,10,10,10,10),bar(2,10,12,8,10)],{length:2}),[null,2,2]);});
 it('Choppiness index: 100 x log10(sum TR / (HH - LL)) / log10(n)',()=>{
  // TR 2, 2, 2; HH 12, LL 9 -> 100 x log2(4/3) = 41.50375
  close(values('chop',[bar(0,10,11,9,10),bar(1,11,12,10,11),bar(2,10,11,9,10)],{length:2}),[null,41.50374992788437,41.50374992788437]);
 });
 it('Coppock curve: WMA(ROC long + ROC short)',()=>{
  // ROC1 10, 10, 0; ROC2 21, 10 -> sums 31, 10 -> WMA2 = (31 + 2 x 10) / 3 = 17
  close(values('coppock',fromCloses([100,110,121,121]),{wmaLength:2,longRocLength:2,shortRocLength:1}),[null,null,null,17]);
 });
 it('Connors RSI: mean of RSI(close), RSI(streak) and the percent rank of the 1-bar ROC',()=>{
  // RSI1 100, 100, 0, 100; streak 1, 2, -1, 1 -> RSI1 100, 0, 100; ROC1 10, 9.09, -4.17, 4.35 -> rank2 at i4 = 50
  close(values('crsi',fromCloses([10,11,12,11.5,12]),{rsiLength:1,streakLength:1,rankLength:2}),[null,null,null,0,(100+100+50)/3]);
 });
 it('Detrended price oscillator: not centered and centered',()=>{
  // n 2 -> k = 2; SMA2 = -, 2, 4, 6, 8
  close(values('dpo',fromCloses([1,3,5,7,9]),{length:2}),[null,null,null,5,5]);
  close(values('dpo',fromCloses([1,3,5,7,9]),{length:2,centered:true}),[-3,-3,-3,null,null]);
 });
 it('Fisher transform (Ehlers): smoothed normalized midpoint, trigger = prior Fisher',()=>{
  const b=[bar(0,9,10,8,9),bar(1,11,12,10,11),bar(2,10,11,9,10)];
  close(values('fisher',b,{length:2}),[null,0.16652232057447272,0.08381116034269476]);
  close(values('fisher',b,{length:2},'trigger'),[null,null,0.16652232057447272]);
 });
 it('Know sure thing: weighted sum of smoothed ROCs, signal SMA',()=>{
  // ROC1 10, ROC2 21 -> 10 + 2 x 21 + 3 x 10 + 4 x 10 = 122
  const inputs={roc1:1,roc2:2,roc3:1,roc4:1,sma1:1,sma2:1,sma3:1,sma4:1,signalLength:1};
  close(values('kst',fromCloses([100,110,121]),inputs),[null,null,122]);
  close(values('kst',fromCloses([100,110,121]),inputs,'signal'),[null,null,122]);
 });
 it('Mass index: sum of EMA(range) / EMA(EMA(range))',()=>{
  // ranges 4, 2, 4 -> ratios 1, 6/7, 24/23 -> sums 13/7, 306/161
  close(values('mass',[bar(0,10,12,8,10),bar(1,10,11,9,10),bar(2,10,12,8,10)],{emaLength:2,sumLength:2}),[null,13/7,306/161]);
 });
 it('McGinley dynamic: MD + (P - MD) / (N x (P / MD)^4), seeded with the first value',()=>{close(values('mcginley',fromCloses([10,12,11]),{length:2}),[10,10.482253086419753,10.69572234770982]);});
 it('Price oscillator: EMA percent difference, signal, histogram',()=>{
  // EMA2 of 10, 13 = 10, 12 -> (13 - 12) / 12 x 100
  close(values('ppo',fromCloses([10,13]),{fastLength:1,slowLength:2,signalLength:1}),[0,100/12]);
  close(values('ppo',fromCloses([10,13]),{fastLength:1,slowLength:2,signalLength:1},'histogram'),[0,0]);
 });
 it('Relative vigor index: symmetric-weighted (C - O) over (H - L)',()=>{
  const b=[bar(0,10,12,9,11),bar(1,11,13,10,12),bar(2,12,12,9,10),bar(3,10,14,10,13)];
  // num = (3 - 4 + 2 + 1) / 6, den = (4 + 6 + 6 + 3) / 6 -> 2/19
  close(values('rvgi',b,{length:1}),[null,null,null,2/19]);
  close(values('rvgi',b,{length:1},'signal'),[null,null,null,null]);
 });
 it('Relative volatility index (Dorsey): deviation routed by the close change, Wilder smoothed',()=>{
  // sd 1, 0.5, 0 with changes +2, -1, 0 -> 100, 0, unavailable
  close(values('rvi',fromCloses([1,3,2,2]),{stdLength:2,smoothLength:1}),[null,100,0,null]);
 });
 it('True strength index and SMI ergodic: double-smoothed momentum ratio',()=>{
  // changes 2, -1: EMA2 2, 0; |change| EMA2 2, 4/3 -> 100, 0
  close(values('tsi',fromCloses([1,3,2]),{longLength:2,shortLength:1,signalLength:1}),[null,100,0]);
  close(values('smiergodic',fromCloses([1,3,2]),{longLength:2,shortLength:1,signalLength:1}),[null,100,0]);
  close(values('smiergodic',fromCloses([1,3,2]),{longLength:2,shortLength:1,signalLength:1},'oscillator'),[null,0,0]);
 });
 it('Vortex indicator: sum |H - L1| and |L - H1| over sum TR',()=>{
  const b=[bar(0,10,11,9,10),bar(1,11,12,10,11),bar(2,12,13,10,12)];
  close(values('vortex',b,{length:2},'viPlus'),[null,null,1.2]);
  close(values('vortex',b,{length:2},'viMinus'),[null,null,0.6]);
 });
 it('Woodies CCI: CCI and turbo CCI of hlc3',()=>{
  const b=[1,3,5].map((c,i)=>bar(i,c,c,c,c));
  close(values('woodiescci',b,{cciLength:2,turboLength:3},'cci'),[null,200/3,200/3]);
  close(values('woodiescci',b,{cciLength:2,turboLength:3},'turbo'),[null,null,100]);
 });
 it('Bull bear power: high and low against the EMA, histogram = their sum',()=>{
  close(values('bbpower',[bar(0,10,12,8,11)],{length:1},'power'),[-2]);
  close(values('bbpower',[bar(0,10,12,8,11)],{length:1},'bull'),[1]);
  close(values('bbpower',[bar(0,10,12,8,11)],{length:1},'bear'),[-3]);
 });
});

describe(' overlays (SYNTHETIC)',()=>{
 it('Moving average ribbon: four averages of one type',()=>{
  const b=fromCloses([1,2,3,4]);
  close(values('maribbon',b,{length1:1,length2:2,length3:3,length4:4},'ma2'),[null,1.5,2.5,3.5]);
  close(values('maribbon',b,{length1:1,length2:2,length3:3,length4:4,maType:'EMA'},'ma2'),[1,5/3,23/9,95/27]);
  close(values('maribbon',b,{length1:1,length2:2,length3:3,length4:4},'ma4'),[null,null,null,2.5]);
 });
 it('Williams alligator: SMMA(hl2) shifted forward, with the shifted tail projected past the last bar',()=>{
  const b=[10,12,14].map((c,i)=>bar(i,c,c+1,c-1,c));
  const result=calculateIndicator('alligator',b,{jawLength:1,jawOffset:1,teethLength:1,teethOffset:0,lipsLength:2,lipsOffset:0});
  expect(result.diagnostics).toEqual([]);
  close(result.series.find(row=>row.id==='jaw')!.values,[null,10,12]);
  close(result.series.find(row=>row.id==='teeth')!.values,[10,12,14]);
  close(result.series.find(row=>row.id==='lips')!.values,[null,11,12.5]);
  expect(result.projection?.jaw).toEqual([14]);
 });
 it('Williams fractals: strict highs and lows with Periods bars on each side; the newest Periods bars are unconfirmed',()=>{
  const highsIn=[1,3,2,4,3],lowsIn=[5,4,6,3,7],b=highsIn.map((h,i)=>bar(i,h,h,lowsIn[i],h));
  close(values('fractals',b,{periods:1},'up'),[null,3,null,4,null]);
  close(values('fractals',b,{periods:1},'down'),[null,4,null,3,null]);
 });
 it('Auto fib retracement: the latest completed zig zag swing, 0 at its end and 1 at its start, from the swing start on',()=>{
  const b=[bar(0,100,101,100,100.5),bar(1,106,110,105,108),bar(2,116,120,115,118),bar(3,116,118,112,113)];
  // pivots: low 100 (bar 0), high 120 (bar 2), running low 112 -> swing 100 -> 120
  close(values('autofib',b,{deviation:5,depth:1},'l0'),[120,120,120,120]);
  close(values('autofib',b,{deviation:5,depth:1},'l1'),[100,100,100,100]);
  close(values('autofib',b,{deviation:5,depth:1},'l618'),[107.64,107.64,107.64,107.64]);
  close(values('autofib',b,{deviation:5,depth:1,reverse:true},'l0'),[100,100,100,100]);
 });
});
