// Hand-computed oracles for the added built-ins (SMI, RCI, Trend strength, TWAP, ASI, AC, Chaikin
// volatility). All bars are SYNTHETIC fixtures made up for these tests (no market data). Each expected value is worked out in
// the comment next to it from the formula cited in the definition, independent of the production arithmetic.
import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition,ALL_CATALOG_INDICATOR_IDS} from '../../src/domain/indicator-catalog';
import {IND1028_INDICATOR_IDS,tieAveragedRanks,twapPeriodKey} from '../../src/domain/indicators-ext/ind1028-catalog';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import {LV_INDICATOR_PALETTE,LV_HISTOGRAM_COLORS,LV_GUIDE_COLOR,INDICATOR_KINDS,indicatorDefaults,defaultIndicatorPresentation,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {indicatorWarmupBars} from '../../src/ui/indicator-dialog-model';
import type {Bar} from '../../src/domain/types';

const DAY=86400,D0=19700*DAY,N=null;
const bar=(i:number,open:number,high:number,low:number,close:number,volume=100,time=D0+i*DAY):Bar=>({time,open,high,low,close,volume});
const flat=(closes:number[],step=DAY)=>closes.map((c,i)=>bar(i,c,c,c,c,100,D0+i*step));
const values=(kind:string,bars:readonly Bar[],inputs:Record<string,unknown>={},plot?:string)=>{
 const result=calculateIndicator(kind as never,bars,inputs as never);expect(result.diagnostics,kind).toEqual([]);
 const row=result.series.find(item=>item.id===(plot??result.series[0].id));expect(row,kind+'.'+plot).toBeDefined();return row!.values;
};
const close=(got:readonly (number|null)[],want:readonly (number|null)[])=>{expect(got.length).toBe(want.length);want.forEach((value,i)=>{if(value===null)expect(got[i],'index '+i).toBeNull();else expect(got[i] as number,'index '+i).toBeCloseTo(value,9);});};

describe('IND-REPLAY-1028 catalog shape (SYNTHETIC)',()=>{
 it('the new kinds are catalog built-ins and indicator kinds, with provenance, OpenCandle-defined unknowns, OpenCandle colors and alert operands',()=>{
  expect([...IND1028_INDICATOR_IDS]).toEqual(['smi','rci','trendstrength','twap','asi','accelosc','chaikinvol']);
  const lv=new Set<string>([...LV_INDICATOR_PALETTE,...Object.values(LV_HISTOGRAM_COLORS),LV_GUIDE_COLOR]);
  for(const kind of IND1028_INDICATOR_IDS){
   const definition=catalogDefinition(kind)!;expect(definition,kind).toBeDefined();expect(ALL_CATALOG_INDICATOR_IDS).toContain(kind);expect(INDICATOR_KINDS).toContain(kind);
   expect(definition.provenance.some(row=>row.url.startsWith('public-indicator-definition:')),kind).toBe(true);
   expect(definition.unknownDefaults!.join(' '),kind).toMatch(/OpenCandle-defined/);
   expect(indicatorAlertBlock(kind),kind).toBeNull();
   for(const plot of definition.plots)expect(lv.has(plot.color!),kind+'.'+plot.id).toBe(true);
   for(const guide of definition.guides??[])expect(lv.has(guide.color!),kind+'.'+guide.id).toBe(true);
   for(const colors of [definition.pointPalette?.colors??[]])for(const color of colors)expect(lv.has(color),kind).toBe(true);
   for(const text of [definition.name,...definition.plots.map(plot=>plot.label),...definition.inputs.map(input=>input.title)])expect(text,kind).not.toMatch(/—|1028/);
  }
 });
 it('every new kind calculates its defaults on 600 synthetic daily bars without diagnostics, each plot with a value',()=>{
  const bars=Array.from({length:600},(_,i)=>{const c=100+10*Math.sin(i/9)+6*Math.sin(i/31)+i*0.02;return bar(i,c-0.3,c+1+(i%3)*0.2,c-1-(i%4)*0.1,c,500+(i*37)%250);});
  for(const kind of IND1028_INDICATOR_IDS){const inputs=kind==='rci'?{maType:'SMA + Bollinger Bands'}:{},result=calculateIndicator(kind,bars,inputs);expect(result.diagnostics,kind).toEqual([]);
   for(const plot of catalogDefinition(kind)!.plots)expect(result.series.find(row=>row.id===plot.id)!.values.some(value=>value!==null),kind+'.'+plot.id).toBe(true);}
  // Smoothing type None (the default) draws no smoothing line.
  expect(calculateIndicator('rci',bars,{}).series.find(row=>row.id==='ma')!.values.every(value=>value===null)).toBe(true);
 });
});

describe('Stochastic momentum index (SYNTHETIC)',()=>{
 it('200 x (close - range midpoint) / range, double-smoothed; lengths 1 make every EMA the value itself',()=>{
  // h 12, l 8, c 11: midpoint 10, rel 1, range 4 -> 200 x 1/4 = 50. h 10, l 6, c 6: midpoint 8, rel -2, range 4 -> -100.
  const b=[bar(0,10,12,8,11),bar(1,8,10,6,6)];
  close(values('smi',b,{lengthK:1,lengthD:1,lengthEMA:1},'smi'),[50,-100]);close(values('smi',b,{lengthK:1,lengthD:1,lengthEMA:1},'ema'),[50,-100]);
  // %K length 2 on bar 1: hh 12, ll 6, midpoint 9, rel -3, range 6 -> -100; bar 0 has no full window.
  close(values('smi',b,{lengthK:2,lengthD:1,lengthEMA:1},'smi'),[N,-100]);
 });
 it('bars needed = K + 2D + E - 3 (16 at the defaults 10/3/3), the first bar of the signal line',()=>{
  // The window is full at index K - 1; each SMA-seeded EMA adds its length - 1: 9 + 2 + 2 + 2 = index 15, 16 bars.
  const b=Array.from({length:40},(_,i)=>bar(i,100+Math.sin(i),101+Math.sin(i)+(i%3)*0.3,99+Math.sin(i)-(i%2)*0.2,100+Math.cos(i)));
  expect(indicatorWarmupBars('smi' as never,{})).toBe(16);
  for(const inputs of [{},{lengthK:5,lengthD:4,lengthEMA:2},{lengthK:1,lengthD:1,lengthEMA:1}]){
   const ema=values('smi',b,inputs,'ema');expect(ema.findIndex(value=>value!==null)+1,JSON.stringify(inputs)).toBe(indicatorWarmupBars('smi' as never,inputs));
  }
 });
});

describe('Rank correlation index (SYNTHETIC)',()=>{
 it('ties share the mean of their positions (Help Center example)',()=>{expect(tieAveragedRanks([10,12,15,12])).toEqual([0,1.5,3,1.5]);});
 it('100 x correlation of price ranks with bar positions',()=>{
  // Window 1,3,2: ranks 0,2,1 vs positions 0,1,2; deviations (-1,1,0) and (-1,0,1): cov 1, variances 2 and 2 -> 0.5 -> 50.
  close(values('rci',flat([1,3,2]),{length:3}),[N,N,50]);
  // Rising -> +100, falling -> -100; a flat window has no correlation.
  close(values('rci',flat([1,2,3,4]),{length:3}),[N,N,100,100]);close(values('rci',flat([4,3,2,1]),{length:3}),[N,N,-100,-100]);
  close(values('rci',flat([5,5,5]),{length:3}),[N,N,N]);
  // Ties: 1,2,2 -> ranks 0,1.5,1.5; deviations (-1,0.5,0.5) and (-1,0,1): cov 1.5, var 1.5 and 2 -> 1.5/sqrt(3) = 0.8660254 -> 86.60254.
  close(values('rci',flat([1,2,2]),{length:3}),[N,N,100*1.5/Math.sqrt(3)]);
 });
 it('SMA smoothing with Bollinger bands of the RCI',()=>{
  // RCI of 1,2,3,4,3 (length 3): N, N, 100, 100, 50 (window 3,4,3: ranks 0.5,2,0.5 -> deviations (-0.5,1,-0.5): cov 0, so 0).
  const rci=values('rci',flat([1,2,3,4,3]),{length:3});close(rci,[N,N,100,100,0]);
  // SMA 2 of the RCI: N, N, N, 100, 50; population sd over 2: 0, 50 -> bands 100 +/- 0, 50 +/- 2 x 50.
  const inputs={length:3,maType:'SMA + Bollinger Bands',maLength:2,bbMult:2},b=flat([1,2,3,4,3]);
  close(values('rci',b,inputs,'ma'),[N,N,N,100,50]);close(values('rci',b,inputs,'bbUpper'),[N,N,N,100,150]);close(values('rci',b,inputs,'bbLower'),[N,N,N,100,-50]);
  // Plain SMA draws no bands.
  close(values('rci',b,{...inputs,maType:'SMA'},'bbUpper'),[N,N,N,N,N]);
 });
});

describe('Trend strength index (SYNTHETIC)',()=>{
 it('Pearson correlation of the close with the bar index',()=>{
  // 1,3,2 vs 0,1,2: deviations (-1,1,0) and (-1,0,1): cov 1, variances 2, 2 -> 0.5.
  close(values('trendstrength',flat([1,3,2]),{length:3}),[N,N,0.5]);
  close(values('trendstrength',flat([1,2,4,8]),{length:2}),[N,1,1,1]);close(values('trendstrength',flat([3,3,3]),{length:2}),[N,N,N]);
  const states=catalogDefinition('trendstrength')!.pointPalette!.state(()=>[N,0.5,-0.2,0]);expect(states).toEqual([N,0,1,0]);
 });
});

describe('Time weighted average price (SYNTHETIC)',()=>{
 it('the running mean of the source over the anchor period, reset at each period (UTC without a chart calendar)',()=>{
  // Hourly bars from 22:00 UTC: three on day 1 (22h, 23h... ) then day 2 from 00:00. ohlc4 of a flat bar is its close.
  const start=D0+22*3600,b=[1,2,10,20,30].map((c,i)=>bar(i,c,c,c,c,100,start+i*3600));
  // Day keys: 22h, 23h -> day 1; 00h, 01h, 02h -> day 2. Means: 1, 1.5 | 10, 15, 20.
  expect(indicatorDefaults.twap).toEqual({anchor:'1D',source:'ohlc4'});const defaults={...indicatorDefaults.twap};
  close(values('twap',b,defaults),[1,1.5,10,15,20]);
  // 1h anchor resets every bar.
  close(values('twap',b,{...defaults,anchor:'1h'}),[1,2,10,20,30]);
  // Close source on bars whose ohlc4 differs: o 0, h 4, l 0, c 4 -> ohlc4 2, close 4.
  const c=[bar(0,0,4,0,4,100,D0),bar(1,0,4,0,4,100,D0+3600)];close(values('twap',c,defaults),[2,2]);close(values('twap',c,{source:'close'}),[4,4]);
 });
 it('day and longer periods follow the given calendar; weeks start Monday',()=>{
  // 2024-01-01 is a Monday. 03:00 UTC on Monday is still Sunday in New York.
  const monday=Date.UTC(2024,0,1,3)/1000;
  expect(twapPeriodKey(monday,'1W','UTC')).not.toBe(twapPeriodKey(monday-86400,'1W','UTC'));
  expect(twapPeriodKey(monday,'1W','America/New_York')).toBe(twapPeriodKey(monday-86400,'1W','America/New_York'));
  expect(twapPeriodKey(monday,'1D','America/New_York')).toBe(twapPeriodKey(monday-3*3600,'1D','America/New_York'));
  expect(twapPeriodKey(Date.UTC(2024,2,31)/1000,'3M','UTC')).not.toBe(twapPeriodKey(Date.UTC(2024,3,1)/1000,'3M','UTC'));
  expect(twapPeriodKey(Date.UTC(2024,0,1)/1000,'12M','UTC')).toBe(twapPeriodKey(Date.UTC(2024,11,31)/1000,'12M','UTC'));
 });
});

describe('Accumulative swing index (SYNTHETIC)',()=>{
 it('Wilder swing index accumulated from the second bar',()=>{
  // Prior O 10 C 10; bar O 10 H 12 L 10 C 11, T 10: |H-Cy| 2, |L-Cy| 0, |H-L| 2, |Cy-Oy| 0, K 2. |H-Cy| largest -> R = 2 - 0 + 0 = 2.
  // SI = 50 x (1 + 0.5 x 1 + 0) / 2 x 2/10 = 7.5.
  // Next bar O 11 H 11 L 8 C 9 vs prior O 10 C 11: |H-Cy| 0, |L-Cy| 3, |H-L| 3, |Cy-Oy| 1, K 3. |L-Cy| largest (ties go to it before H-L) ->
  // R = 3 - 0 + 0.25 = 3.25. SI = 50 x ((9-11) + 0.5 x (9-11) + 0.25 x (11-10)) / 3.25 x 3/10 = 50 x (-2.75) / 3.25 x 0.3 = -12.6923077.
  const b=[bar(0,10,11,9,10),bar(1,10,12,10,11),bar(2,11,11,8,9)];
  close(values('asi',b),[N,7.5,7.5+50*-2.75/3.25*0.3]);
  // Limit move 20 halves every swing.
  close(values('asi',b,{limit:20}),[N,3.75,(7.5+50*-2.75/3.25*0.3)/2]);
 });
});

describe('Accelerator oscillator (SYNTHETIC)',()=>{
 it('AO minus its 5-bar SMA; a steady trend has a constant AO, so AC is 0 from bar 37',()=>{
  // hl2 = i: SMA5 = i - 2, SMA34 = i - 16.5, AO = 14.5 from bar 33; SMA5 of AO from bar 37; AC = 0.
  const b=Array.from({length:40},(_,i)=>bar(i,i,i+1,i-1,i));const ac=values('accelosc',b);
  expect(ac.slice(0,37).every(value=>value===null)).toBe(true);close(ac.slice(37),[0,0,0]);
  // First bar falling; an equal bar keeps the prior color (the Awesome oscillator rule); a gap restarts at falling.
  expect(catalogDefinition('accelosc')!.pointPalette!.state(()=>[N,1,2,1.5,1.5])).toEqual([N,1,0,1,1]);
  expect(catalogDefinition('accelosc')!.pointPalette!.state(()=>[N,1,2,2,N,3])).toEqual([N,1,0,0,N,1]);
 });
});

describe('Awesome oscillator (SYNTHETIC)',()=>{
 it('legend label AO, plot id unchanged; an equal bar keeps the prior color, as on the Accelerator oscillator',()=>{
  const b=Array.from({length:6},(_,i)=>bar(i,10,11,9,10)),result=calculateIndicator('ao',b);
  expect(result.series.map(row=>[row.id,row.label])).toEqual([['histogram','AO']]);
  // Presentation over given histogram values: first falling, rising, equal (keeps rising), falling, equal (keeps falling).
  const shaped={...result,series:[{...result.series[0],values:[N,1,2,2,1.5,1.5]}]};
  const settings:IndicatorInstanceSettings={id:'ao1',kind:'ao',inputs:{...indicatorDefaults.ao} as never,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('ao')};
  const {output}=renderIndicatorPresentation(settings,shaped as never,b,{resolution:'1D'});
  const colors=(output.series!.find(row=>(row as {points?:unknown}).points) as unknown as {points:{color?:string}[]}).points.map(point=>point.color);
  expect(colors[2]).not.toBe(colors[1]);expect(colors[3]).toBe(colors[2]);expect(colors[4]).toBe(colors[1]);expect(colors[5]).toBe(colors[4]);
 });
});

describe('Chaikin volatility (SYNTHETIC)',()=>{
 it('100 x the change of the EMA of high - low over the lookback',()=>{
  // Periods 1: the EMA is the range itself. Ranges 1, 2, 4, 4: lookback 1 -> N, 100, 100, 0; lookback 2 -> N, N, 300, 100.
  const b=[bar(0,5,5.5,4.5,5),bar(1,5,6,4,5),bar(2,5,7,3,5),bar(3,5,7,3,5)];
  close(values('chaikinvol',b,{periods:1,lookback:1}),[N,100,100,0]);close(values('chaikinvol',b,{periods:1,lookback:2}),[N,N,300,100]);
 });
});
