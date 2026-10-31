// Hand-worked oracles for Volatility close-to-close / O-H-L-C / index, MA multiple, EMA cross, SMI ergodic
// oscillator, Ratio, Correlation - Log, Multi-time period charts and Performance. All bars are SYNTHETIC fixtures made up for
// these tests (no market data). Each expected value is worked out in the comment next to it from the rule in the definition.
import {describe,expect,it} from 'vitest';
import {calculateIndicator,type IndicatorId} from '../../src/domain/indicators';
import {catalogDefinition,ALL_CATALOG_INDICATOR_IDS} from '../../src/domain/indicator-catalog';
import {INDGAPS3_INDICATOR_IDS,monthsBefore} from '../../src/domain/indicators-ext/indgaps3-catalog';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import {LV_INDICATOR_PALETTE,LV_HISTOGRAM_COLORS,LV_GUIDE_COLOR,INDICATOR_KINDS,defaultIndicatorPresentation,indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import type {SecondSeries} from '../../src/domain/second-symbol';
import type {Bar} from '../../src/domain/types';

const DAY=86400,HOUR=3600,D0=19700*DAY,N=null;
const bar=(i:number,open:number,high:number,low:number,close:number,time=D0+i*DAY):Bar=>({time,open,high,low,close,volume:100});
const flat=(closes:number[],step=DAY,t0=D0)=>closes.map((c,i)=>bar(i,c,c,c,c,t0+i*step));
const wave=(count:number,step=DAY)=>Array.from({length:count},(_,i)=>{const c=100+10*Math.sin(i/9)+6*Math.sin(i/31)+3*Math.sin(i/2.3)+i*0.02;return bar(i,c-0.3,c+1+(i%3)*0.2,c-1-(i%4)*0.1,c,D0+i*step);});
const ready=(bars:readonly Bar[])=>(():SecondSeries=>({bars,state:'ready',message:null}));
const calc=(kind:string,bars:readonly Bar[],inputs:Record<string,unknown>={},second?:readonly Bar[])=>{
 const result=calculateIndicator(kind as IndicatorId,bars,inputs as never,{resolution:'1D',...(second?{secondSeries:ready(second)}:{})});expect(result.diagnostics,kind).toEqual([]);return result;};
const plot=(result:ReturnType<typeof calc>,id:string)=>result.series.find(row=>row.id===id)!.values;
const close=(got:readonly (number|null)[],want:readonly (number|null)[])=>{expect(got.length).toBe(want.length);want.forEach((value,i)=>{if(value===null)expect(got[i],'index '+i).toBeNull();else expect(got[i] as number,'index '+i).toBeCloseTo(value,9);});};
const settings=(kind:string,inputs:Record<string,unknown>={}):IndicatorInstanceSettings=>({id:'g3',kind:kind as IndicatorId,inputs:{...indicatorDefaults[kind as IndicatorId],...inputs} as never,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind as IndicatorId)});
const SECOND=['ratio','correlationlog'];
const other=(bars:readonly Bar[])=>bars.map(row=>({...row,close:50+row.close*0.3+Math.cos(row.time/DAY/5)}));

describe('IND-GAPS3 catalog shape (SYNTHETIC)',()=>{
 it('the new kinds are registered, alertable, OpenCandle-colored, with provenance and OpenCandle-defined unknowns',()=>{
  expect([...INDGAPS3_INDICATOR_IDS]).toEqual(['volcc','volohlc','volindex','mamultiple','emacross','smiergodicosc','ratio','correlationlog','mtfcandles','performance']);
  const lv=new Set<string>([...LV_INDICATOR_PALETTE,...Object.values(LV_HISTOGRAM_COLORS),LV_GUIDE_COLOR]);
  for(const kind of INDGAPS3_INDICATOR_IDS){
   const definition=catalogDefinition(kind)!;expect(definition,kind).toBeDefined();expect(ALL_CATALOG_INDICATOR_IDS).toContain(kind);expect(INDICATOR_KINDS).toContain(kind);
   expect(definition.provenance.some(row=>row.url.startsWith('public-indicator-definition:')),kind).toBe(true);
   expect(definition.unknownDefaults!.join(' '),kind).toMatch(/OpenCandle-defined/);expect(indicatorAlertBlock(kind),kind).toBeNull();
   for(const row of definition.plots)expect(lv.has(row.color!),kind+'.'+row.id).toBe(true);
   for(const guide of definition.guides??[])expect(lv.has(guide.color!),kind+'.'+guide.id).toBe(true);
   for(const color of Object.values(definition.histogramColors??{}))expect(lv.has(color),kind).toBe(true);
   for(const text of [definition.name,...definition.plots.map(row=>row.label),...definition.inputs.map(input=>input.title)])expect(text,kind).not.toMatch(/—|GAPS/);
  }
  expect(INDGAPS3_INDICATOR_IDS.filter(kind=>catalogDefinition(kind)!.secondSymbol)).toEqual(SECOND);
  expect(INDGAPS3_INDICATOR_IDS.filter(kind=>catalogDefinition(kind)!.pattern)).toEqual(['mtfcandles']);
 });
 it('every kind calculates its defaults on 600 synthetic daily bars with a value in every plot',()=>{
  const bars=wave(600);
  for(const kind of INDGAPS3_INDICATOR_IDS){const result=calc(kind,bars,{},SECOND.includes(kind)?other(bars):undefined);
   for(const row of catalogDefinition(kind)!.plots)expect(plot(result,row.id).some(value=>value!==null),kind+'.'+row.id).toBe(true);}
 });
 it('replay: every kind is prefix-invariant at three cuts (daily and hourly)',()=>{
  for(const step of [DAY,HOUR]){const bars=wave(400,step),second=other(bars);
   for(const kind of INDGAPS3_INDICATOR_IDS){const inputs=kind==='mtfcandles'&&step===HOUR?{interval:'240m'}:{},full=calc(kind,bars,inputs,second);
    for(const cut of [1,37,250]){const part=calc(kind,bars.slice(0,cut),inputs,second);
     for(const row of part.series)expect(row.values,kind+'.'+row.id+'@'+cut+'/'+step).toEqual(plot(full,row.id).slice(0,cut));}}}
 });
 it('a second-symbol kind without a loaded series says why and plots nothing',()=>{
  const result=calculateIndicator('ratio' as IndicatorId,flat([1,2]),{} as never,{resolution:'1D'});
  expect(result.diagnostics.join(' ')).toMatch(/not loaded/);
 });
});

describe('Volatility estimators (SYNTHETIC)',()=>{
 it('close-to-close is the sample deviation of log returns (equal to Historical volatility)',()=>{
  // closes 100, 110, 99: r1 = ln 1.1, r2 = ln 0.9; n = 2 -> sd = |r1 - r2| / sqrt 2; annual 1.
  const bars=flat([100,110,99]),want=100*Math.abs(Math.log(1.1)-Math.log(0.9))/Math.SQRT2;
  close(plot(calc('volcc',bars,{length:2,annual:1}),'volatility'),[N,N,want]);
  const w=wave(200);expect(plot(calc('volcc',w),'volatility')).toEqual(plot(calc('hv',w,{length:10,periodsPerYear:252}),'hv'));
 });
 it('O-H-L-C is Garman-Klass',()=>{
  // O100 H110 L90 C105: 0.5 ln(110/90)^2 - (2 ln 2 - 1) ln(1.05)^2; n = 1, annual 1.
  const u=0.5*Math.log(110/90)**2-(2*Math.LN2-1)*Math.log(1.05)**2;
  close(plot(calc('volohlc',[bar(0,100,110,90,105)],{length:1,annual:1}),'volatility'),[100*Math.sqrt(u)]);
  // n = 2 over two bars: the mean of both bar terms. Bar 1: O10 H12 L10 C11.
  const u2=0.5*Math.log(1.2)**2-(2*Math.LN2-1)*Math.log(1.1)**2;
  close(plot(calc('volohlc',[bar(0,100,110,90,105),bar(1,10,12,10,11)],{length:2,annual:4}),'volatility'),[N,100*Math.sqrt((u+u2)/2*4)]);
 });
 it('Volatility index is the Williams VIX Fix',()=>{
  // closes 10, 12, 11 with lows 9.5, 11, 9; n = 3: highest close 12, low 9 -> 100 x 3 / 12 = 25.
  const bars=[bar(0,10,10.5,9.5,10),bar(1,12,12.5,11,12),bar(2,11,11.5,9,11)];
  close(plot(calc('volindex',bars,{length:3}),'index'),[N,N,25]);
  close(plot(calc('volindex',bars,{length:1}),'index'),[5,100*1/12,100*2/11]);
 });
});

describe('Moving averages and crosses (SYNTHETIC)',()=>{
 it('MA multiple: each line is its own average of the Source',()=>{
  // closes 1, 2, 4, 8. SMA 2: -, 1.5, 3, 6. WMA 2: (c[i-1] + 2 c[i]) / 3 -> -, 5/3, 10/3, 20/3.
  const bars=flat([1,2,4,8]),lengths={length1:2,length2:1,length3:3,length4:4,length5:4,length6:4};
  const sma=calc('mamultiple',bars,lengths);close(plot(sma,'ma1'),[N,1.5,3,6]);close(plot(sma,'ma2'),[1,2,4,8]);close(plot(sma,'ma3'),[N,N,7/3,14/3]);close(plot(sma,'ma4'),[N,N,N,15/4]);
  close(plot(calc('mamultiple',bars,{...lengths,maType:'WMA'}),'ma1'),[N,5/3,10/3,20/3]);
 });
 it('EMA cross marks up and down crosses on the short EMA',()=>{
  // Short 1 = the close. The long 3 EMA (alpha 0.5) and the cross tests are taken from the plotted lines.
  const bars=flat([10,10,12,8,8,13]),result=calc('emacross',bars,{shortLength:1,longLength:3});
  const s=plot(result,'short') as number[],l=plot(result,'long');close(s,[10,10,12,8,8,13]);
  const up:(number|null)[]=[],down:(number|null)[]=[];
  s.forEach((v,i)=>{const lv=l[i],pl=l[i-1];if(!i||lv===null||pl===null){up.push(N);down.push(N);return;}const d=v-lv,p=s[i-1]-pl;up.push(d>0&&p<=0?v:N);down.push(d<0&&p>=0?v:N);});
  close(plot(result,'crossUp'),up);close(plot(result,'crossDown'),down);
  expect(up.filter(v=>v!==null).length).toBeGreaterThan(0);expect(down.filter(v=>v!==null).length).toBeGreaterThan(0);
 });
 it('SMI ergodic oscillator equals the combined kind\'s oscillator plot',()=>{
  const bars=wave(300);expect(plot(calc('smiergodicosc',bars),'oscillator')).toEqual(plot(calc('smiergodic',bars),'oscillator'));
 });
});

describe('Second symbol (SYNTHETIC)',()=>{
 it('Ratio divides the Source by the aligned second close; a missing second bar is unavailable',()=>{
  // chart 10, 20, 30; second 5, 4 and no bar at time 2 -> 2, 5, unavailable.
  const bars=flat([10,20,30]),second=flat([5,4]);close(plot(calc('ratio',bars,{},second),'ratio'),[2,5,N]);
 });
 it('Correlation - Log is +1 for a squared series and -1 for the reciprocal (log returns 2x and -x)',()=>{
  const bars=flat([10,11,10.5,12,11.5,13]),sq=bars.map(row=>({...row,close:row.close**2})),inv=bars.map(row=>({...row,close:1/row.close}));
  close(plot(calc('correlationlog',bars,{length:3},sq),'correlation'),[N,N,N,1,1,1]);
  close(plot(calc('correlationlog',bars,{length:3},inv),'correlation'),[N,N,N,-1,-1,-1]);
 });
});

describe('Multi-time period charts (SYNTHETIC)',()=>{
 // 6-hourly bars starting at UTC midnight: bars 0-3 are day 0, bars 4-5 day 1. Interval 1D.
 const rows:[number,number,number,number][]=[[10,12,9,11],[11,13,10,12],[12,12.5,8,9],[9,10,8.5,9.5],[9.5,11,9,10.5],[10.5,14,10,13]];
 const bars=rows.map(([o,h,l,c],i)=>bar(i,o,h,l,c,D0+i*6*HOUR));
 it('each bar carries its higher bar so far (developing)',()=>{
  const result=calc('mtfcandles',bars);
  close(plot(result,'open'),[10,10,10,10,9.5,9.5]);close(plot(result,'high'),[12,13,13,13,11,14]);close(plot(result,'low'),[9,9,8,8,9,9]);close(plot(result,'close'),[11,12,9,9.5,10.5,13]);
  close(plot(result,'up'),[1,1,0,0,1,1]);close(plot(result,'down'),[0,0,1,1,0,0]);
  // Day 0: O10 C9.5 (down) body 10..9.5 over bars 0..3, wick at bar 1 from 13 to 8. Day 1 (developing): O9.5 C13 up, wick at bar 4.
  expect(result.marks!.boxes).toEqual([{plot:'down',from:{index:0,price:10},to:{index:3,price:9.5}},{plot:'up',from:{index:4,price:13},to:{index:5,price:9.5}}]);
  expect(result.marks!.lines).toEqual([{plot:'down',from:{index:1,price:13},to:{index:1,price:8}},{plot:'up',from:{index:4,price:14},to:{index:4,price:9}}]);
  expect(calc('mtfcandles',bars,{maxCandles:1}).marks!.boxes!.map(box=>box.plot)).toEqual(['up']);
 });
 it('draws native boxes and wick lines in the candle colors',()=>{
  const result=calc('mtfcandles',bars),{output}=renderIndicatorPresentation(settings('mtfcandles'),result,bars,{resolution:'360m'});
  expect(output.boxes!.map(box=>[box.left,box.top,box.bottom,box.borderColor])).toEqual([[bars[0].time*1000,10,9.5,'#e8605a'],[bars[4].time*1000,13,9.5,'#3fbf8f']]);
  expect(output.lines!).toHaveLength(2);expect(output.series!.every(series=>series.visible===false)).toBe(true);
 });
});

describe('Performance (SYNTHETIC)',()=>{
 it('calendar month steps clamp to the month end',()=>{
  const t=Date.UTC(2024,2,31,12)/1000;expect(monthsBefore(t,1)).toBe(Date.UTC(2024,1,29,12)/1000);expect(monthsBefore(t,12)).toBe(Date.UTC(2023,2,31,12)/1000);
  expect(monthsBefore(Date.UTC(2024,0,15)/1000,3)).toBe(Date.UTC(2023,9,15)/1000);
 });
 it('returns against the newest close at or before each reference instant; YTD against the last close of the prior year',()=>{
  // Daily closes from 2023-12-29 (index 0): 100, 101, 102 (Dec 31), then 110 on 2024-01-01 ... close = 100 + i except i >= 3.
  const t0=Date.UTC(2023,11,29)/1000,closes=Array.from({length:40},(_,i)=>i<3?100+i:110+i),bars=flat(closes,DAY,t0),result=calc('performance',bars);
  const w1=plot(result,'w1'),ytd=plot(result,'ytd'),m1=plot(result,'m1');
  // 1W at index 7 (Jan 5): reference Dec 29 (index 0) = 100 -> 117 / 100 - 1 = 17 %. Index 6: reference before the first bar.
  expect(w1[6]).toBeNull();expect(w1[7]).toBeCloseTo(17,9);
  // YTD at index 3 (Jan 1): reference Dec 31 = 102 -> 113 / 102 - 1. Index 2 (Dec 31): no bar before 2023-01-01 -> unavailable.
  expect(ytd[2]).toBeNull();expect(ytd[3]).toBeCloseTo(100*(113/102-1),9);
  // 1M at index 31 (Jan 29): reference Dec 29 (index 0) -> 141 / 100 - 1 = 41 %; index 30 (Jan 28) has no reference.
  expect(m1[30]).toBeNull();expect(m1[31]).toBeCloseTo(41,9);
  expect(plot(result,'y1').every(value=>value===null)).toBe(true);
 });
});
