// Hand-worked oracles for the marker/box/candle built-ins (Gaps, Bollinger bars, Moon phases, the Rob Booker set)
// and Auto fib extension / Auto pitchfork. All bars are SYNTHETIC fixtures made up for these tests (no market data). Each
// expected value is worked out in the comment next to it from the rule in the definition, independent of the production code.
import {describe,expect,it} from 'vitest';
import {calculateIndicator,type IndicatorId} from '../../src/domain/indicators';
import {catalogDefinition,ALL_CATALOG_INDICATOR_IDS} from '../../src/domain/indicator-catalog';
import {INDGAPS2_INDICATOR_IDS,knoxvilleDivergence,moonPhaseTime,moonPhasesBetween} from '../../src/domain/indicators-ext/indgaps2-catalog';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import {LV_INDICATOR_PALETTE,LV_HISTOGRAM_COLORS,LV_GUIDE_COLOR,INDICATOR_KINDS,defaultIndicatorPresentation,indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import type {Bar} from '../../src/domain/types';

const DAY=86400,HOUR=3600,D0=19700*DAY,N=null;// D0 is a Saturday (UTC), so the pivot calendar infers UTC for every prefix.
const bar=(i:number,open:number,high:number,low:number,close:number,time=D0+i*DAY):Bar=>({time,open,high,low,close,volume:100});
const hl=(rows:readonly [number,number][],step=DAY)=>rows.map(([high,low],i)=>bar(i,(high+low)/2,high,low,(high+low)/2,D0+i*step));
const flat=(closes:number[])=>closes.map((c,i)=>bar(i,c,c,c,c));
const calc=(kind:string,bars:readonly Bar[],inputs:Record<string,unknown>={})=>{const result=calculateIndicator(kind as IndicatorId,bars,inputs as never);expect(result.diagnostics,kind).toEqual([]);return result;};
const plot=(result:ReturnType<typeof calc>,id:string)=>result.series.find(row=>row.id===id)!.values;
const close=(got:readonly (number|null)[],want:readonly (number|null)[])=>{expect(got.length).toBe(want.length);want.forEach((value,i)=>{if(value===null)expect(got[i],'index '+i).toBeNull();else expect(got[i] as number,'index '+i).toBeCloseTo(value,9);});};
const wave=(count:number,step=HOUR)=>Array.from({length:count},(_,i)=>{const c=100+10*Math.sin(i/9)+6*Math.sin(i/31)+3*Math.sin(i/2.3)+i*0.02,g=(i%17===0?2.5:0)*(i%34===0?1:-1);return bar(i,c-0.3+g,c+1+(i%3)*0.2+Math.max(g,0),c-1-(i%4)*0.1+Math.min(g,0),c+g,D0+i*step);});
const settings=(kind:string,inputs:Record<string,unknown>={}):IndicatorInstanceSettings=>({id:'g2',kind:kind as IndicatorId,inputs:{...indicatorDefaults[kind as IndicatorId],...inputs} as never,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind as IndicatorId)});
const REPAINTING=['autofibext','autopitchfork'];

describe('IND-GAPS2 catalog shape (SYNTHETIC)',()=>{
 it('the new kinds are registered, alertable, OpenCandle-colored, with provenance and OpenCandle-defined unknowns',()=>{
  expect([...INDGAPS2_INDICATOR_IDS]).toEqual(['gaps','bbars','moonphases','rbintrapivots','rbknoxville','rbmissedpivots','rbreversal','rbzivpivots','autofibext','autopitchfork']);
  const lv=new Set<string>([...LV_INDICATOR_PALETTE,...Object.values(LV_HISTOGRAM_COLORS),LV_GUIDE_COLOR]);
  for(const kind of INDGAPS2_INDICATOR_IDS){
   const definition=catalogDefinition(kind)!;expect(definition,kind).toBeDefined();expect(ALL_CATALOG_INDICATOR_IDS).toContain(kind);expect(INDICATOR_KINDS).toContain(kind);
   expect(definition.provenance.some(row=>row.url.startsWith('public-indicator-definition:')),kind).toBe(true);
   expect(definition.unknownDefaults!.join(' '),kind).toMatch(/OpenCandle-defined/);expect(definition.overlay,kind).toBe(true);
   expect(indicatorAlertBlock(kind),kind).toBeNull();
   for(const row of definition.plots)expect(lv.has(row.color!),kind+'.'+row.id).toBe(true);
   for(const text of [definition.name,...definition.plots.map(row=>row.label),...definition.inputs.map(input=>input.title)])expect(text,kind).not.toMatch(/—|GAPS/);
  }
  // Marker kinds take the marks path; the pivot and auto-drawing kinds are ordinary line plots.
  expect(INDGAPS2_INDICATOR_IDS.filter(kind=>catalogDefinition(kind)!.pattern)).toEqual(['gaps','bbars','moonphases','rbknoxville','rbmissedpivots','rbreversal']);
 });
 it('every kind calculates its defaults on 600 synthetic hourly bars; signal kinds report at least one event',()=>{
  const bars=wave(600);
  for(const kind of INDGAPS2_INDICATOR_IDS){const result=calc(kind,bars);
   for(const row of catalogDefinition(kind)!.plots){const values=plot(result,row.id);expect(values.some(value=>value!==null),kind+'.'+row.id).toBe(true);}}
  for(const kind of ['gaps','bbars','rbknoxville','rbmissedpivots'])expect(calc(kind,bars).marks,kind).toBeDefined();
 });
 it('replay: every non-repainting kind is prefix-invariant (signals and pivots)',()=>{
  const bars=wave(400);
  for(const kind of INDGAPS2_INDICATOR_IDS){if(REPAINTING.includes(kind))continue;const full=calc(kind,bars);
   for(const cut of [1,37,250]){const part=calc(kind,bars.slice(0,cut));
    for(const row of part.series)expect(row.values,kind+'.'+row.id+'@'+cut).toEqual(plot(full,row.id).slice(0,cut));}}
 });
});

describe('Gaps (SYNTHETIC)',()=>{
 // 0: H10 L9. 1: L11 > 10 -> gap up, zone 10..11. 2: L10.5 (not filled). 3: L9.8 <= 10 fills it. 4: H8 < 9.8 -> gap down 8..9.8.
 const bars=hl([[10,9],[12,11],[11.5,10.5],[10.5,9.8],[8,7]]);
 it('signals on the gap bar and boxes from the gap bar to the filling bar (open gaps extend right)',()=>{
  const result=calc('gaps',bars);close(plot(result,'bullish'),[N,1,0,0,0]);close(plot(result,'bearish'),[N,0,0,0,1]);
  expect(result.marks!.boxes).toEqual([{plot:'bullish',from:{index:1,price:11},to:{index:3,price:10}},{plot:'bearish',from:{index:4,price:9.8},to:{index:4,price:8},extendRight:true}]);
  // Gap up is 1 / 10 = 10 %, gap down 1.8 / 9.8 = 18.4 %: a 15 % minimum keeps only the gap down.
  close(plot(calc('gaps',bars,{minDeviation:15}),'bullish'),[N,0,0,0,0]);
  expect(calc('gaps',bars,{showFilled:false}).marks!.boxes!.map(box=>box.plot)).toEqual(['bearish']);
 });
 it('draws native boxes in the plot colors (fill at 20% opacity)',()=>{
  const {output}=renderIndicatorPresentation(settings('gaps'),calc('gaps',bars),bars,{resolution:'1D'});
  expect(output.boxes!.map(box=>[box.left,box.top,box.bottom,box.extend,box.borderColor])).toEqual([[bars[1].time*1000,11,10,'none','#3fbf8f'],[bars[4].time*1000,9.8,8,'right','#e8605a']]);
  expect(output.series!.every(series=>series.visible===false)).toBe(true);
 });
});

describe('Bollinger bars (SYNTHETIC)',()=>{
 it('hollow when close > open, colored by close against the prior close',()=>{
  // 0: O10 C11 (first bar: 11 >= open 10 -> up; hollow). 1: O12 C11.5 (>= 11 -> up; filled). 2: O11 C11.2 (< 11.5 -> down; hollow).
  const bars=[bar(0,10,11.5,9.5,11),bar(1,12,12.5,11,11.5),bar(2,11,11.5,10.8,11.2)],result=calc('bbars',bars);
  close(plot(result,'up'),[1,1,0]);close(plot(result,'down'),[0,0,1]);
  expect(result.marks!.candles).toEqual([{index:0,plot:'up',hollow:true},{index:1,plot:'up'},{index:2,plot:'down',hollow:true}]);
  const {output}=renderIndicatorPresentation(settings('bbars'),result,bars,{resolution:'1D'}),candles=output.series!.find(series=>series.kind==='candle') as {bars:unknown[];barColors:{color:string;borderColor:string}[]};
  expect(candles.bars).toHaveLength(3);expect(candles.barColors.map(row=>[row.color,row.borderColor])).toEqual([['rgba(0,0,0,0)','#3fbf8f'],['#3fbf8f','#3fbf8f'],['rgba(0,0,0,0)','#e8605a']]);
 });
});

describe('Moon phases (SYNTHETIC bars, published phase times)',()=>{
 const at=(iso:string)=>Date.parse(iso)/1000,MIN=60;
 it('Meeus phase instants match published new and full moons within 10 minutes',()=>{
  expect(Math.abs(moonPhaseTime(0)-at('2000-01-06T18:14Z'))).toBeLessThan(10*MIN);// Meeus example 49.a epoch new moon
  const april=moonPhasesBetween(at('2024-04-01T00:00Z'),at('2024-05-01T00:00Z'));
  expect(april.map(row=>row.full)).toEqual([false,true]);
  expect(Math.abs(april[0].time-at('2024-04-08T18:21Z'))).toBeLessThan(10*MIN);// total solar eclipse new moon
  expect(Math.abs(april[1].time-at('2024-04-23T23:49Z'))).toBeLessThan(10*MIN);
 });
 it('marks the bar whose period holds the phase; a weekend phase goes to the next bar',()=>{
  // Daily bars Thu 2024-03-07, Fri 03-08, Mon 03-11. New moon 2024-03-10 09:00 UTC (Sunday): Fri covers Fri..Sat, Mon covers Sat..Tue.
  const times=['2024-03-07','2024-03-08','2024-03-11'].map(day=>at(day+'T00:00Z')),bars=times.map((time,i)=>bar(i,1,1,1,1,time));
  const result=calc('moonphases',bars);close(plot(result,'newmoon'),[0,0,1]);close(plot(result,'fullmoon'),[0,0,0]);
  expect(result.marks!.markers.map(row=>[row.index,row.plot,row.position,row.shape])).toEqual([[2,'newmoon','below','circle']]);
  expect(result.marks!.markers[0].tooltip).toMatch(/^New moon 2024-03-10 0[89]:\d\d UTC$/);
  const {output}=renderIndicatorPresentation(settings('moonphases'),result,bars,{resolution:'1D'});
  expect(output.labels!.map(label=>[label.style,label.yloc,label.color])).toEqual([['circle','belowbar','#8a92a6']]);
 });
});

describe('Rob Booker pivots (SYNTHETIC)',()=>{
 // UTC day 1 (hourly bars 0..2): H 12, L 8, last close 10 -> P 10, R1 12, S1 8, R2 14, S2 6, R3 16, S3 4. Day 2 bars carry them.
 const rows:[number,number,number][]=[[11,9,10.5],[12,9.5,11],[11,8,10],[10.5,9.5,10],[11,10,10.8]];
 const bars=rows.map(([h,l,c],i)=>bar(i,c,h,l,c,D0+(i<3?i*HOUR:DAY+(i-3)*HOUR)));
 it('Intraday pivot points: previous period traditional levels',()=>{
  const result=calc('rbintrapivots',bars);
  for(const [id,value] of [['p',10],['r1',12],['s1',8],['r2',14],['s2',6],['r3',16],['s3',4]] as const)close(plot(result,id),[N,N,N,value,value]);
  // 4 hours blocks: bars 0..2 share block 0 (00:00-04:00), so 4 hours gives the same levels here.
  close(plot(calc('rbintrapivots',bars,{timeframe:'4 hours'}),'p'),[N,N,N,10,10]);
 });
 it('Ziv ghost pivots: the current period so far',()=>{
  // Bar 0: H11 L9 C10.5 -> P 10.1667. Bar 1: H12 L9 C11 -> P 32/3. Bar 3 starts day 2: H10.5 L9.5 C10 -> P 10, R1 10.5, S1 9.5.
  const result=calc('rbzivpivots',bars);close(plot(result,'p'),[30.5/3,32/3,10,10,(11+9.5+10.8)/3]);close(plot(result,'r1'),[2*30.5/3-9,2*32/3-9,2*10-8,10.5,2*(31.3/3)-9.5]);
 });
});

describe('Rob Booker - Knoxville divergence (SYNTHETIC)',()=>{
 it('a higher high with lower momentum after an overbought RSI draws a KD line from the earlier swing high',()=>{
  // Highs 5 6 10 7 6 8 11, lows one below. Bar 2 is a swing high (10 >= 6 and 7). Bar 6: 11 > 8, nothing above 11 back to bar 2,
  // momentum(1) close 8.5 - 8 = 0.5 < bar 2's 10 - 6 = 4, and the RSI peaked at 75 in 2..6 -> bearish on bar 6. Bar 5: 8 > 6 but
  // bar 2 (10) is above it, so no divergence.
  const highs=[5,6,10,7,6,8,11],closes=[5,6,10,7,6,8,8.5],bars=highs.map((h,i)=>bar(i,closes[i],h,h-1,closes[i]));
  const rsi=[N,N,75,50,50,50,50],out=knoxvilleDivergence(bars,rsi,150,1);
  close(out.bearish,[N,0,0,0,0,0,1]);close(out.bullish,[N,0,0,0,0,0,0]);
  expect(out.lines).toEqual([{plot:'bearish',from:{index:2,price:10},to:{index:6,price:11}}]);expect(out.markers.map(row=>[row.index,row.text])).toEqual([[6,'KD']]);
  // Without the overbought reading there is no divergence.
  close(knoxvilleDivergence(bars,[N,N,65,50,50,50,50],150,1).bearish,[N,0,0,0,0,0,0]);
 });
});

describe('Rob Booker - Missed pivot points (SYNTHETIC)',()=>{
 it('two pivot highs in a row report the low between them as missed',()=>{
  // Lookback 1/1. (high, low): 0 (2,1), 1 (5,3), 2 (3.5,3.2), 3 (6,4), 4 (4,3.5). Pivot highs at 1 and 3 (confirmed on 2 and 4),
  // no pivot low (bar 2's 3.2 is above bar 1's 3). The missed low is bar 2, reported on bar 4.
  const bars=hl([[2,1],[5,3],[3.5,3.2],[6,4],[4,3.5]]),result=calc('rbmissedpivots',bars,{leftBars:1,rightBars:1});
  close(plot(result,'bullish'),[N,N,0,0,1]);close(plot(result,'bearish'),[N,N,0,0,0]);
  expect(result.marks!.markers.map(row=>[row.index,row.plot,row.position,row.shape])).toEqual([[2,'bullish','below','xcross']]);
 });
});

describe('Rob Booker - Reversal (SYNTHETIC)',()=>{
 it('MACD crossing its signal line with %K beyond a band',()=>{
  // Fast 1, slow 3 (alpha 0.5, first-value seed), signal 3. Closes 10 10 10 8 12: EMA3 10 10 10 9 10.5; MACD 0 0 0 -1 1.5;
  // signal 0 0 0 -0.5 0.5. Bar 3 crosses down, bar 4 crosses up. Stochastic 1/1: %K = 100 (C - L) / (H - L): bar 3 (8.5, 6, 8)
  // = 80 (>= 80 -> bearish), bar 4 (30, 10, 12) = 10 (<= 20 -> bullish).
  const bars=[bar(0,10,11,9,10),bar(1,10,11,9,10),bar(2,10,11,9,10),bar(3,8,8.5,6,8),bar(4,12,30,10,12)];
  const result=calc('rbreversal',bars,{fastLength:1,slowLength:3,signalLength:3,stochLength:1,smoothK:1});
  close(plot(result,'bullish'),[N,0,0,0,1]);close(plot(result,'bearish'),[N,0,0,1,0]);
  expect(result.marks!.markers.map(row=>[row.index,row.shape])).toEqual([[3,'arrowdown'],[4,'arrowup']]);
 });
});

describe('Auto fib extension and Auto pitchfork (SYNTHETIC; repaint like the reference drawings)',()=>{
 // Closes 10 20 15 18 with Deviation 1 %, Depth 1: zig zag 10@0, 20@1, 15@2, forming 18@3 -> A 10@0, B 20@1, C 15@2.
 const bars=flat([10,20,15,18]),inputs={deviation:1,depth:1};
 it('extension levels C + ratio x (B - A) from C to the newest bar',()=>{
  const result=calc('autofibext',bars,inputs);
  close(plot(result,'e0'),[N,N,15,15]);close(plot(result,'e5'),[N,N,20,20]);close(plot(result,'e1'),[N,N,25,25]);close(plot(result,'e1618'),[N,N,31.18,31.18]);
 });
 it('median from A through the B-C midpoint, tines through B and C',()=>{
  // Midpoint (1.5, 17.5): slope 7.5 / 1.5 = 5. Median 10 + 5i; upper (B) 20 + 5(i - 1); lower (C) 15 + 5(i - 2).
  const result=calc('autopitchfork',bars,inputs);
  close(plot(result,'median'),[10,15,20,25]);close(plot(result,'upper'),[N,20,25,30]);close(plot(result,'lower'),[N,N,15,20]);
 });
});
