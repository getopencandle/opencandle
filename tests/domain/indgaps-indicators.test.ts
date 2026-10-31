// Hand-computed oracles for the added built-ins (RCI ribbon, 24-hour volume, Moving average channel, Standard error,
// Moving average Hamming, Majority rule, Volatility zero trend close-to-close, Typical, Average and Median price). All bars are
// SYNTHETIC fixtures made up for these tests (no market data). Each expected value is worked out in the comment next to it from
// the formula cited in the definition, independent of the production arithmetic.
import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition,ALL_CATALOG_INDICATOR_IDS} from '../../src/domain/indicator-catalog';
import {INDGAPS_INDICATOR_IDS,hammingWeights} from '../../src/domain/indicators-ext/indgaps-catalog';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import {LV_INDICATOR_PALETTE,LV_HISTOGRAM_COLORS,LV_GUIDE_COLOR,INDICATOR_KINDS} from '../../src/chart/indicator-settings';
import type {Bar} from '../../src/domain/types';

const DAY=86400,HOUR=3600,D0=19700*DAY,N=null;
const bar=(i:number,open:number,high:number,low:number,close:number,volume=100,time=D0+i*DAY):Bar=>({time,open,high,low,close,volume});
const flat=(closes:number[])=>closes.map((c,i)=>bar(i,c,c,c,c));
const values=(kind:string,bars:readonly Bar[],inputs:Record<string,unknown>={},plot?:string)=>{
 const result=calculateIndicator(kind as never,bars,inputs as never);expect(result.diagnostics,kind).toEqual([]);
 const row=result.series.find(item=>item.id===(plot??result.series[0].id));expect(row,kind+'.'+plot).toBeDefined();return row!.values;
};
const close=(got:readonly (number|null)[],want:readonly (number|null)[])=>{expect(got.length).toBe(want.length);want.forEach((value,i)=>{if(value===null)expect(got[i],'index '+i).toBeNull();else expect(got[i] as number,'index '+i).toBeCloseTo(value,9);});};
const wave=(count:number,step=DAY)=>Array.from({length:count},(_,i)=>{const c=100+10*Math.sin(i/9)+6*Math.sin(i/31)+i*0.02;return bar(i,c-0.3,c+1+(i%3)*0.2,c-1-(i%4)*0.1,c,500+(i*37)%250,D0+i*step);});

describe('IND-GAPS catalog shape (SYNTHETIC)',()=>{
 it('the new kinds are catalog built-ins and indicator kinds, with provenance, OpenCandle-defined unknowns, OpenCandle colors and alert operands',()=>{
  expect([...INDGAPS_INDICATOR_IDS]).toEqual(['rciribbon','vol24h','machannel','stderror','mahamming','majority','volzt','typprice','avgprice','medprice']);
  const lv=new Set<string>([...LV_INDICATOR_PALETTE,...Object.values(LV_HISTOGRAM_COLORS),LV_GUIDE_COLOR]);
  for(const kind of INDGAPS_INDICATOR_IDS){
   const definition=catalogDefinition(kind)!;expect(definition,kind).toBeDefined();expect(ALL_CATALOG_INDICATOR_IDS).toContain(kind);expect(INDICATOR_KINDS).toContain(kind);
   expect(definition.provenance.some(row=>row.url.startsWith('public-indicator-definition:')),kind).toBe(true);
   expect(definition.unknownDefaults!.join(' '),kind).toMatch(/OpenCandle-defined/);
   expect(indicatorAlertBlock(kind),kind).toBeNull();
   for(const plot of definition.plots)expect(lv.has(plot.color!),kind+'.'+plot.id).toBe(true);
   for(const guide of definition.guides??[])expect(lv.has(guide.color!),kind+'.'+guide.id).toBe(true);
   if(definition.fill)expect(lv.has(definition.fill.color),kind).toBe(true);
   for(const text of [definition.name,...definition.plots.map(plot=>plot.label),...definition.inputs.map(input=>input.title)])expect(text,kind).not.toMatch(/—|GAPS/);
  }
  // Pane placement: price-scale kinds overlay the price pane, the oscillators and volume get their own pane.
  expect(INDGAPS_INDICATOR_IDS.filter(kind=>catalogDefinition(kind)!.overlay)).toEqual(['machannel','mahamming','typprice','avgprice','medprice']);
 });
 it('every new kind calculates its defaults on 600 synthetic hourly bars without diagnostics, each plot with a value',()=>{
  const bars=wave(600,HOUR);
  for(const kind of INDGAPS_INDICATOR_IDS){const result=calculateIndicator(kind,bars,{});expect(result.diagnostics,kind).toEqual([]);
   for(const plot of catalogDefinition(kind)!.plots)expect(result.series.find(row=>row.id===plot.id)!.values.some(value=>value!==null),kind+'.'+plot.id).toBe(true);}
 });
 it('replay: every kind is prefix-invariant (a revealed prefix computes the same values as the full history)',()=>{
  const bars=wave(300,HOUR);
  for(const kind of INDGAPS_INDICATOR_IDS){const full=calculateIndicator(kind,bars,{});
   for(const cut of [1,37,180]){const part=calculateIndicator(kind,bars.slice(0,cut),{});
    for(const row of part.series)expect(row.values,kind+'.'+row.id+'@'+cut).toEqual(full.series.find(item=>item.id===row.id)!.values.slice(0,cut));}}
 });
});

describe('RCI ribbon (SYNTHETIC)',()=>{
 it('three RCI lines; each matches the Rank correlation index of its length',()=>{
  // Window 1,3,2: ranks 0,2,1 vs positions 0,1,2 -> correlation 0.5 -> 50. Window 3,2,4: ranks 1,0,2 -> 0.5 -> 50.
  const b=flat([1,3,2,4]),inputs={shortLength:3,middleLength:2,longLength:4};
  close(values('rciribbon',b,inputs,'short'),[N,N,50,50]);
  // Length 2: up +100, down -100. Length 4 on 1,3,2,4: ranks 0,2,1,3 vs 0..3: cov 4, variances 5 -> 0.8 -> 80.
  close(values('rciribbon',b,inputs,'middle'),[N,100,-100,100]);close(values('rciribbon',b,inputs,'long'),[N,N,N,80]);
  const bars=wave(200);for(const [plot,length] of [['short',10],['middle',30],['long',50]] as const)expect(values('rciribbon',bars,{},plot)).toEqual(values('rci',bars,{length}));
 });
});

describe('24-hour volume (SYNTHETIC)',()=>{
 it('sums the volume of the bars opened in the trailing 24 hours',()=>{
  // Hourly bars with volume i + 1: index 23 holds bars 0..23 -> 1 + ... + 24 = 300; index 24 drops bar 0 -> 2 + ... + 25 = 324.
  const hourly=Array.from({length:30},(_,i)=>bar(i,1,1,1,1,i+1,D0+i*HOUR)),got=values('vol24h',hourly);
  expect(got[0]).toBe(1);expect(got[1]).toBe(3);expect(got[23]).toBe(300);expect(got[24]).toBe(324);expect(got[29]).toBe((7+30)*24/2);// bars 6..29 -> volumes 7..30 = 444
  // Daily bars: the 24-hour window is the bar's own volume.
  close(values('vol24h',[bar(0,1,1,1,1,5),bar(1,1,1,1,1,7)]),[5,7]);
 });
});

describe('Moving average channel (SYNTHETIC)',()=>{
 it('SMA of highs and SMA of lows, each shifted forward by its offset',()=>{
  // Highs 2,4,6 -> SMA2 3, 5; lows 1,1,4 -> SMA2 1, 2.5. Upper offset 1 moves the upper line one bar right.
  const b=[bar(0,1,2,1,1),bar(1,1,4,1,1),bar(2,5,6,4,5)];
  close(values('machannel',b,{upperLength:2,lowerLength:2},'upper'),[N,3,5]);close(values('machannel',b,{upperLength:2,lowerLength:2},'lower'),[N,1,2.5]);
  close(values('machannel',b,{upperLength:2,lowerLength:2,upperShift:1},'upper'),[N,N,3]);
 });
});

describe('Standard error (SYNTHETIC)',()=>{
 it('sqrt(sum of squared residuals around the regression line / (n - 2))',()=>{
  // 1,2,4 on x 0,1,2: slope (3 x 10 - 3 x 7) / (3 x 5 - 9) = 1.5, intercept (7 - 4.5) / 3 = 5/6; fits 5/6, 7/3, 23/6;
  // residuals 1/6, -1/3, 1/6 -> squares sum 1/6 -> / (3 - 2) -> sqrt(1/6) = 0.408248...
  close(values('stderror',flat([1,2,4]),{length:3}),[N,N,Math.sqrt(1/6)]);
  // A straight line has no residual.
  close(values('stderror',flat([3,5,7,9]),{length:3}),[N,N,0,0]);
 });
});

describe('Moving average Hamming (SYNTHETIC)',()=>{
 it('Hamming-window weighted mean',()=>{
  // n 3: weights 0.54 - 0.46 cos(0) = 0.08, 0.54 - 0.46 cos(pi) = 1, 0.08. (0.08 x 1 + 1 x 2 + 0.08 x 4) / 1.16 = 2.4 / 1.16.
  hammingWeights(3).forEach((w,i)=>expect(w).toBeCloseTo([0.08,1,0.08][i],12));
  close(values('mahamming',flat([1,2,4]),{length:3}),[N,N,2.4/1.16]);close(values('mahamming',flat([5,6]),{length:1}),[5,6]);
 });
});

describe('Majority rule (SYNTHETIC)',()=>{
 it('percentage of up closes in the rolling period',()=>{
  // Closes 1,2,2,3: up flags -,1,0,1. Period 2: index 2 (1 + 0) / 2 = 50, index 3 (0 + 1) / 2 = 50; index 1 lacks a full window.
  close(values('majority',flat([1,2,2,3]),{length:2}),[N,N,50,50]);close(values('majority',flat([1,2,3]),{length:2}),[N,N,100]);
 });
});

describe('Volatility zero trend close-to-close (SYNTHETIC)',()=>{
 it('100 x root mean square of log returns x sqrt(annual)',()=>{
  // ln(110 / 100) = 0.0953101798 -> length 1, annual 1 -> 9.53101798.
  close(values('volzt',flat([100,110]),{length:1,annual:1}),[N,100*Math.log(1.1)]);
  // Returns +1 and -1 (1, e, 1): mean square 1 -> 100 x 1 x sqrt(4) = 200 (a mean-subtracted estimator would differ).
  close(values('volzt',flat([1,Math.E,1]),{length:2,annual:4}),[N,N,200]);
 });
});

describe('Typical, Average and Median price (SYNTHETIC)',()=>{
 it('hlc3, ohlc4 and hl2',()=>{
  // O 1, H 4, L 0, C 2: typical (4 + 0 + 2) / 3 = 2, average (1 + 4 + 0 + 2) / 4 = 1.75, median (4 + 0) / 2 = 2.
  const b=[bar(0,1,4,0,2)];close(values('typprice',b),[2]);close(values('avgprice',b),[1.75]);close(values('medprice',b),[2]);
 });
});
