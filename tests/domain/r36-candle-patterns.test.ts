import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {CANDLE_PATTERN_INDICATOR_IDS,PATTERN_INDICATOR_IDS} from '../../src/domain/indicators-ext/patterns-catalog';
import {CANDLE_FAMILIES} from '../../src/domain/indicators-ext/patterns-candles';
import type {Bar} from '../../src/domain/types';

// Oracle tests for every candlestick pattern entry. All bars are SYNTHETIC, hand-built for these tests (no
// market data). Each case is 20 identical filler bars (open 100, high 101.5, low 99.5, close 101: white, body 1, so the
// 14-bar average body is 1) followed by the pattern bars; the expected signal is 1 on the LAST pattern bar and 0 on every
// other bar. Thresholds are the values in patterns-candles.ts (doji body <= 5% of range, long body > average
// body, small body <= half of it, and so on); the comment on each case says why it qualifies.
type C=[number,number,number,number];// open, high, low, close
const D0=19700*86400;
const toBars=(rows:readonly C[]):Bar[]=>rows.map(([open,high,low,close],i)=>({time:D0+i*86400,open,high,low,close,volume:100}));
const FILLER:C=[100,101.5,99.5,101];
const withFiller=(pattern:readonly C[],filler=20)=>toBars([...Array.from({length:filler},()=>FILLER),...pattern]);
const signal=(kind:string,bars:readonly Bar[],plot:string,inputs:Record<string,unknown>={})=>{
 const result=calculateIndicator(kind,bars,inputs);expect(result.diagnostics,kind).toEqual([]);
 const row=result.series.find(series=>series.id===plot);expect(row,kind+' '+plot).toBeDefined();
 return row!.values.flatMap((value,i)=>value===1?[i]:[]);
};
const NO_TREND={trendRule:'No detection'};
const LONG_BLACK:C=[103,103.1,99.9,100],LONG_WHITE:C=[100,103.1,99.9,103];

/** [entry id, signal plot, pattern bars, why]. */
const CASES:ReadonlyArray<readonly [string,'bullish'|'bearish'|'neutral',readonly C[],string]>=[
 ['cdldoji','neutral',[[100,101,99,100.02]],'body 0.02 <= 5% of range 2'],
 ['cdldragonfly','bullish',[[101,101.05,99,101]],'doji, upper shadow 0.05 <= 10% of range 2.05'],
 ['cdlgravestone','bearish',[[99,101,98.98,99]],'doji, lower shadow 0.02 <= 10% of range'],
 ['cdlhammer','bullish',[[100.6,101.05,99,101]],'body 0.4 (not doji), lower 1.6 >= 2 bodies, upper 0.05 <= 10% of range'],
 ['cdlhangingman','bearish',[[100.6,101.05,99,101]],'the hammer shape, bearish side'],
 ['cdlinvertedhammer','bullish',[[100,102,99.98,100.4]],'body 0.4, upper 1.6 >= 2 bodies, lower 0.02 <= 10% of range'],
 ['cdlshootingstar','bearish',[[100,102,99.98,100.4]],'the inverted hammer shape, bearish side'],
 ['cdlengulfingbull','bullish',[[101,101.2,99.8,100],[99.9,101.4,99.8,101.3]],'black then white, open 99.9 <= 100, close 101.3 >= 101, body 1.4 > 1'],
 ['cdlengulfingbear','bearish',[[100,101.2,99.8,101],[101.1,101.2,99.6,99.7]],'white then black, open 101.1 >= 101, close 99.7 <= 100, body 1.4 > 1'],
 // Harami and three methods: the second (inner) bodies must be short, at most the average body (TA-Lib BodyShort). With the
 // long first bar in the window that average is (13 x 1 + 3) / 14 = 1.14, so the 0.7 (harami) and 0.4 to 0.7 (three
 // methods) bodies below are deliberately short; the near misses in "short bodies" use 1.2 and 1.5.
 ['cdlharamibull','bullish',[LONG_BLACK,[100.8,101.8,100.5,101.5]],'long black body 3 > average 1, white body 0.7 (short: <= average 1.14) inside 100..103'],
 ['cdlharamibear','bearish',[LONG_WHITE,[102.2,102.5,101.2,101.5]],'long white body 3, black body 0.7 (short) inside 100..103'],
 ['cdlharamicrossbull','bullish',[LONG_BLACK,[101.5,102,101,101.52]],'long black, then a doji inside its body'],
 ['cdlharamicrossbear','bearish',[LONG_WHITE,[101.5,102,101,101.52]],'long white, then a doji inside its body'],
 ['cdlpiercing','bullish',[LONG_BLACK,[99.5,102.1,99.4,102]],'opens 99.5 below close 100, closes 102 above midpoint 101.5 and below open 103'],
 ['cdldarkcloud','bearish',[LONG_WHITE,[103.5,103.6,100.9,101]],'opens 103.5 above close 103, closes 101 below midpoint 101.5 and above open 100'],
 ['cdldojistarbull','bullish',[LONG_BLACK,[99,99.5,98.5,99.02]],'doji body top 99.02 below the black close 100'],
 ['cdldojistarbear','bearish',[LONG_WHITE,[104,104.5,103.5,104.02]],'doji body bottom 104 above the white close 103'],
 ['cdlmorningstar','bullish',[LONG_BLACK,[99.2,99.6,98.8,99.5],[99.8,102.5,99.7,102.3]],'small body 0.3 (<= half the average 1.14, not doji) gapping below 100, white close 102.3 above midpoint 101.5'],
 ['cdleveningstar','bearish',[LONG_WHITE,[103.5,104,103.3,103.8],[103.4,103.5,100.5,100.8]],'small body above 103, black close 100.8 below midpoint 101.5'],
 ['cdlmorningdojistar','bullish',[LONG_BLACK,[99.3,99.6,99,99.31],[99.8,102.5,99.7,102.3]],'the morning star with a doji middle bar'],
 ['cdleveningdojistar','bearish',[LONG_WHITE,[103.6,104,103.3,103.61],[103.4,103.5,100.5,100.8]],'the evening star with a doji middle bar'],
 ['cdlabandonedbabybull','bullish',[LONG_BLACK,[99,99.5,98.5,99.02],[100,101.5,99.8,101.2]],'long black body 3, doji high 99.5 below its low 99.9, white low 99.8 above the doji high, white body 1.2 not small, close 101.2 at least 30% into the black body (above 100.9)'],
 ['cdlabandonedbabybear','bearish',[LONG_WHITE,[104,104.5,103.5,104.02],[103.2,103.4,101,101.5]],'long white body 3, doji low 103.5 above its high 103.1, black high 103.4 below the doji low, black body 1.7, close 101.5 below 102.1 (30% into the white body)'],
 ['cdlthreewhitesoldiers','bullish',[[100,102.2,99.9,102],[101,104.2,100.9,104],[103,106.2,102.9,106]],'three long white bodies, each opening inside the prior body and closing higher, upper shadows 0.2 <= 25% of range'],
 ['cdlthreeblackcrows','bearish',[[106,106.1,103.8,104],[105,105.1,101.8,102],[103,103.1,98.8,99]],'three long black bodies, each opening inside the prior body and closing lower, lower shadows 0.2'],
 ['cdltweezerbottom','bullish',[[101,101.2,99,99.5],[99.6,101,99.02,100.8]],'black then white, lows 99 and 99.02 within 5% of range 2.2'],
 ['cdltweezertop','bearish',[[100,102,99.8,101.8],[101.7,102.03,100.5,100.7]],'white then black, highs 102 and 102.03 within 5% of range'],
 ['cdlmarubozuwhite','bullish',[[100,102,100,102]],'white body 2 > average 1, no shadows'],
 ['cdlmarubozublack','bearish',[[102,102,100,100]],'black body 2 > average 1, no shadows'],
 ['cdlspinningtopwhite','neutral',[[100,101,99,100.3]],'white body 0.3 (not doji), upper 0.7 and lower 1 both longer than the body'],
 ['cdlspinningtopblack','neutral',[[100.3,101,99,100]],'black body 0.3, both shadows longer'],
 ['cdlkickingbull','bullish',[[102,102,100,100],[102.5,104.5,102.5,104.5]],'black marubozu, then a white marubozu whose low 102.5 is above the prior high 102'],
 ['cdlkickingbear','bearish',[[100,102,100,102],[99.5,99.5,97.5,97.5]],'white marubozu, then a black marubozu whose high 99.5 is below the prior low 100'],
 ['cdlrisingthree','bullish',[LONG_WHITE,[102.5,102.8,101.5,101.8],[101.8,102.2,101,101.2],[101.2,101.9,100.8,101.6],[101.6,104.6,101.5,104.4]],'long white, three short bodies (0.7, 0.6, 0.4) inside its range, long white closing 104.4 above 103'],
 ['cdlfallingthree','bearish',[LONG_BLACK,[100.5,101.5,100.2,101.2],[101.2,101.9,100.8,101.8],[101.8,102.2,101.4,101.5],[101.4,101.5,98.5,98.7]],'long black, three short bodies (0.7, 0.6, 0.3) inside its range, long black closing 98.7 below 100'],
 ['cdltristarbull','bullish',[[101,101.5,100.5,101.01],[100,100.5,99.5,100.01],[101,101.5,100.5,101.02]],'three dojis, the middle body below both neighbours'],
 ['cdltristarbear','bearish',[[100,100.5,99.5,100.01],[101,101.5,100.5,101.01],[100,100.5,99.5,100.02]],'three dojis, the middle body above both neighbours'],
 ['cdluptasuki','bullish',[[100,102,99.9,101.8],[102.5,104.2,102.3,104],[103.5,103.6,102.1,102.2]],'white, gap-up white (102.3 > 102), black opening inside the second body and closing 102.2 inside the gap'],
 ['cdldowntasuki','bearish',[[102,102.1,100,100.2],[99.5,99.7,97.8,98],[98.5,99.9,98.4,99.8]],'black, gap-down black (99.7 < 100), white opening inside the second body and closing 99.8 inside the gap'],
 ['cdlrisingwindow','bullish',[[100,101,99.5,100.5],[101.5,102.5,101.2,102]],'low 101.2 above the prior high 101'],
 ['cdlfallingwindow','bearish',[[100,100.5,99,99.5],[98.5,98.8,97.5,98]],'high 98.8 below the prior low 99'],
 ['cdllonglowershadow','bullish',[[100.8,101,98,100.9]],'lower shadow 2.8 >= 2/3 of range 3'],
 ['cdllonguppershadow','bearish',[[100.1,103,100,100.2]],'upper shadow 2.8 >= 2/3 of range 3'],
 ['cdlonneck','bearish',[LONG_BLACK,[99,99.92,98.8,99.9]],'long black, white opening 99 below the low 99.9 and closing at it'],
];

describe(' candlestick pattern entries (SYNTHETIC)',()=>{
 it('every candlestick entry is a Patterns tab overlay with fact or OpenCandle-defined provenance, and has an oracle case',()=>{
  expect(CANDLE_PATTERN_INDICATOR_IDS.length).toBe(45);
  const covered=new Set(CASES.map(row=>row[0]));
  for(const kind of CANDLE_PATTERN_INDICATOR_IDS){
   const definition=catalogDefinition(kind)!;expect(definition.pattern,kind).toBe('candlestick');expect(definition.overlay,kind).toBe(true);
   expect(definition.provenance.some(row=>row.url.startsWith('indicator-list:patterns')),kind).toBe(true);
   expect(definition.unknownDefaults!.join(' '),kind).toMatch(/OpenCandle-defined/);
   if(kind!=='cdlall')expect(covered.has(kind),kind+' has an oracle case').toBe(true);
  }
  expect(PATTERN_INDICATOR_IDS.length).toBe(62);// +6 chart entries.
 });
 it.each(CASES.map(row=>[row[0],row[1],row[2],row[3]] as const))('%s fires on the last pattern bar only (%s): %s',(kind,plot,pattern,why)=>{
  const bars=withFiller(pattern);
  // 0.8.1 (Nison): tweezers need matching lows (highs), not opposite colours, so with No detection every pair of the
  // identical filler bars (1..19) is a tweezer too; the pattern's first bar does not match the filler.
  const filler=kind==='cdltweezerbottom'||kind==='cdltweezertop'?Array.from({length:19},(_,i)=>i+1):[];
  expect(signal(kind,bars,plot,catalogDefinition(kind)!.inputs.some(input=>input.key==='trendRule')?NO_TREND:{}),why).toEqual([...filler,bars.length-1]);
 });
 it('the filler alone, and a near miss, give no signal',()=>{
  expect(signal('cdlengulfingbull',withFiller([]),'bullish',NO_TREND)).toEqual([]);
  // Close 100.9 < prior open 101: the white body does not cover the black one.
  expect(signal('cdlengulfingbull',withFiller([[101,101.2,99.8,100],[99.9,101,99.8,100.9]]),'bullish',NO_TREND)).toEqual([]);
  // Body 0.2 is above 5% of range 2 (0.1): not a doji.
  expect(signal('cdldoji',withFiller([[100,101,99,100.2]]),'neutral')).toEqual([]);
  // Lower shadow 0.6 < 2 bodies (0.8): not a hammer.
  expect(signal('cdlhammer',withFiller([[100.6,101.05,100,101]]),'bullish',NO_TREND)).toEqual([]);
 });
 it('a bar with a missing price takes no part in a pattern',()=>{
  const bars=withFiller([[101,101.2,99.8,100],[99.9,101.4,99.8,101.3]]);bars[bars.length-2]={...bars[bars.length-2],low:Number.NaN};
  expect(signal('cdlengulfingbull',bars,'bullish',NO_TREND)).toEqual([]);
 });
});

describe(' trend rule and pattern type (SYNTHETIC)',()=>{
 // 60 falling black bars (close 160 down to 101, body 1), then a bullish engulfing whose first bar closes 100.
 const falling=(count:number):C[]=>Array.from({length:count},(_,k)=>{const close=100+count-k;return [close+1,close+1.5,close-0.5,close] as C;});
 const rising=(count:number):C[]=>Array.from({length:count},(_,k)=>{const close=40+k;return [close-1,close+0.5,close-1.5,close] as C;});
 const ENGULF:C[]=[[101,101.2,99.8,100],[99.9,101.4,99.8,101.3]];
 it('SMA50 (default): a reversal needs close < SMA50 on the bar before the pattern',()=>{
  const down=toBars([...falling(60),...ENGULF]);expect(catalogDefinition('cdlengulfingbull')!.inputs.find(row=>row.key==='trendRule')!.defval).toBe('SMA50');
  expect(signal('cdlengulfingbull',down,'bullish')).toEqual([61]);
  // After a rise (close 99 above its SMA50 of 74.5), the same two bars are not a bullish reversal.
  const up=toBars([...rising(60),...ENGULF]);
  expect(signal('cdlengulfingbull',up,'bullish')).toEqual([]);
  expect(signal('cdlengulfingbull',up,'bullish',NO_TREND)).toEqual([61]);
 });
 it('SMA50, SMA200: needs close < SMA50 < SMA200; too little history means no trend',()=>{
  expect(signal('cdlengulfingbull',toBars([...falling(60),...ENGULF]),'bullish',{trendRule:'SMA50, SMA200'})).toEqual([]);
  expect(signal('cdlengulfingbull',toBars([...falling(210),...ENGULF]),'bullish',{trendRule:'SMA50, SMA200'})).toEqual([211]);
 });
 it('continuation patterns need the same trend (Rising window after a rise)',()=>{
  const gap:C[]=[[100,101,99.5,100.5],[101.5,102.5,101.2,102]];
  expect(signal('cdlrisingwindow',toBars([...rising(60),...gap]),'bullish')).toEqual([61]);
  expect(signal('cdlrisingwindow',toBars([...falling(60),...gap]),'bullish')).toEqual([]);
 });
 it('Pattern type selects the family direction: Bullish, Bearish or Both',()=>{
  const bars=withFiller([[101,101.2,99.8,100],[99.9,101.4,99.8,101.3],[101.4,101.5,99.6,99.8]]);// bull engulfing at 21, bear at 22
  expect(signal('cdlengulfingbull',bars,'bullish',NO_TREND)).toEqual([21]);
  expect(signal('cdlengulfingbull',bars,'bearish',NO_TREND)).toEqual([]);
  expect(signal('cdlengulfingbull',bars,'bearish',{...NO_TREND,patternType:'Both'})).toEqual([22]);
  expect(signal('cdlengulfingbull',bars,'bullish',{...NO_TREND,patternType:'Bearish'})).toEqual([]);
  expect(signal('cdlengulfingbear',bars,'bearish',NO_TREND)).toEqual([22]);
  expect(catalogDefinition('cdldoji')!.inputs).toEqual([]);// neutral: nothing to choose
  expect(catalogDefinition('cdlonneck')!.inputs.map(row=>row.key)).toEqual(['trendRule']);// one direction only
 });
 it('markers carry the pattern code below (bullish) or above (bearish) and its name',()=>{
  const bars=withFiller([[101,101.2,99.8,100],[99.9,101.4,99.8,101.3],[101.4,101.5,99.6,99.8]]);
  const result=calculateIndicator('cdlengulfingbull',bars,{...NO_TREND,patternType:'Both'});
  expect(result.marks!.markers).toEqual([{index:21,plot:'bullish',text:'EG',tooltip:'Bullish engulfing'},{index:22,plot:'bearish',text:'EG',tooltip:'Bearish engulfing'}]);
  expect(result.marks!.lines).toEqual([]);
 });
});

describe(' All candlestick patterns (SYNTHETIC)',()=>{
 it('runs every family; patterns on one bar share a marker; neutral patterns only with Both',()=>{
  expect(CANDLE_FAMILIES.length).toBe(24);
  // Bar 20 is a doji and a dragonfly doji (and a long lower shadow): one bullish marker, one neutral marker.
  const bars=withFiller([[101,101.05,99,101]]);
  const both=calculateIndicator('cdlall',bars,NO_TREND);expect(both.diagnostics).toEqual([]);
  const at=(plot:string)=>both.marks!.markers.filter(row=>row.index===20&&row.plot===plot);
  expect(at('bullish')).toEqual([{index:20,plot:'bullish',text:'DD\nLLS',tooltip:'Dragonfly Doji, Long lower shadow'}]);
  expect(at('neutral')).toEqual([{index:20,plot:'neutral',text:'D',tooltip:'Doji'}]);
  expect(both.series.find(row=>row.id==='neutral')!.values[20]).toBe(1);
  const bullish=calculateIndicator('cdlall',bars,{...NO_TREND,patternType:'Bullish'});
  expect(bullish.series.find(row=>row.id==='neutral')!.values.every(value=>value===0)).toBe(true);
  expect(bullish.series.find(row=>row.id==='bearish')!.values.every(value=>value===0)).toBe(true);
  expect(bullish.series.find(row=>row.id==='bullish')!.values[20]).toBe(1);
 });
 it('20,000 bars stay inside the calculation budget',()=>{
  const bars=toBars(Array.from({length:20000},(_,i)=>{const base=100+Math.sin(i/7)*5;return [base,base+1+(i%3),base-1-(i%5)*0.3,base+((i%4)-1.5)*0.4] as C;}));
  const started=performance.now(),result=calculateIndicator('cdlall',bars,{});
  expect(result.diagnostics).toEqual([]);expect(result.series.map(row=>row.values.length)).toEqual([20000,20000,20000]);
  expect(performance.now()-started).toBeLessThan(5000);
 });
});

describe('stricter candlestick rules (SYNTHETIC)',()=>{
 /** Every prefix reports exactly the full run's signals up to its own last bar (nothing depends on later bars). */
 const causal=(kind:string,bars:readonly Bar[],plot:string)=>{const full=signal(kind,bars,plot,NO_TREND);
  for(let end=1;end<=bars.length;end++)expect(signal(kind,bars.slice(0,end),plot,NO_TREND),kind+' prefix '+end).toEqual(full.filter(i=>i<end));};
 const DOJI_DOWN:C=[99,99.5,98.5,99.02],DOJI_UP:C=[104,104.5,103.5,104.02];
 it('abandoned baby (TA-Lib ta_CDLABANDONEDBABY.c): a long first body, a third body that is not small, closing 30% into the first body',()=>{
  // Used to fire: a tiny black bar (body 0.2), a gapped doji and a tiny white bar (body 0.2).
  expect(signal('cdlabandonedbabybull',withFiller([[100.2,100.3,99.9,100],DOJI_DOWN,[100,100.5,99.8,100.2]]),'bullish',NO_TREND)).toEqual([]);
  // Only the first bar fails: its body 0.2 is not long (above the average body).
  expect(signal('cdlabandonedbabybull',withFiller([[100.2,100.3,99.9,100],DOJI_DOWN,[100,101.5,99.8,101.2]]),'bullish',NO_TREND)).toEqual([]);
  // Third body 0.2 is small (half the average is about 0.54), though its close 101 is past 100.9.
  expect(signal('cdlabandonedbabybull',withFiller([LONG_BLACK,DOJI_DOWN,[100.8,101.2,99.8,101]]),'bullish',NO_TREND)).toEqual([]);
  // Third body 1 is not small, but its close 100.8 is short of 100.9 (30% into the black body 100..103).
  expect(signal('cdlabandonedbabybull',withFiller([LONG_BLACK,DOJI_DOWN,[99.8,100.9,99.7,100.8]]),'bullish',NO_TREND)).toEqual([]);
  expect(signal('cdlabandonedbabybear',withFiller([LONG_WHITE,DOJI_UP,[103.2,103.4,102.1,102.2]]),'bearish',NO_TREND)).toEqual([]);// close 102.2 above 102.1
  // The textbook case still fires, and the result does not depend on later bars.
  const bull=withFiller([LONG_BLACK,DOJI_DOWN,[100,101.5,99.8,101.2]]);expect(signal('cdlabandonedbabybull',bull,'bullish',NO_TREND)).toEqual([22]);
  causal('cdlabandonedbabybull',bull,'bullish');causal('cdlabandonedbabybear',withFiller([LONG_WHITE,DOJI_UP,[103.2,103.4,101,101.5]]),'bearish');
 });
 it('harami (Nison, TA-Lib ta_CDLHARAMI.c): the second body must be short, not just smaller than the first',()=>{
  // Used to fire: body 1.2 is inside the 3-point first body and smaller than it, but above the average body 1.14.
  expect(signal('cdlharamibull',withFiller([LONG_BLACK,[100.5,102,100.3,101.7]]),'bullish',NO_TREND)).toEqual([]);
  expect(signal('cdlharamibear',withFiller([LONG_WHITE,[102.5,102.7,101.1,101.3]]),'bearish',NO_TREND)).toEqual([]);
  const bull=withFiller([LONG_BLACK,[100.8,101.8,100.5,101.5]]);expect(signal('cdlharamibull',bull,'bullish',NO_TREND)).toEqual([21]);
  causal('cdlharamibull',bull,'bullish');causal('cdlharamibear',withFiller([LONG_WHITE,[102.2,102.5,101.2,101.5]]),'bearish');
 });
 it('rising and falling three methods (Nison, TA-Lib ta_CDLRISEFALL3METHODS.c): each inner body must be short',()=>{
  // Used to fire: the first inner body 1.5 is smaller than the 3-point first body but above the average body 1.14.
  expect(signal('cdlrisingthree',withFiller([LONG_WHITE,[102.8,103,101,101.3],[101.8,102.2,101,101.2],[101.2,101.9,100.8,101.6],[101.6,104.6,101.5,104.4]]),'bullish',NO_TREND)).toEqual([]);
  expect(signal('cdlfallingthree',withFiller([LONG_BLACK,[100.2,102,100,101.7],[101.2,101.9,100.8,101.8],[101.8,102.2,101.4,101.5],[101.4,101.5,98.5,98.7]]),'bearish',NO_TREND)).toEqual([]);
  const rising=withFiller([LONG_WHITE,[102.5,102.8,101.5,101.8],[101.8,102.2,101,101.2],[101.2,101.9,100.8,101.6],[101.6,104.6,101.5,104.4]]);
  expect(signal('cdlrisingthree',rising,'bullish',NO_TREND)).toEqual([24]);causal('cdlrisingthree',rising,'bullish');
  causal('cdlfallingthree',withFiller([LONG_BLACK,[100.5,101.5,100.2,101.2],[101.2,101.9,100.8,101.8],[101.8,102.2,101.4,101.5],[101.4,101.5,98.5,98.7]]),'bearish');
 });
 it('the definitions state the short-body and penetration rules',()=>{
  const text=(kind:string)=>catalogDefinition(kind)!.policies!.join(' ');
  expect(text('cdlharamibull')).toMatch(/at most shortBody of the average body/);expect(text('cdlrisingthree')).toMatch(/at most shortBody of the average body/);
  expect(text('cdlabandonedbabybull')).toMatch(/not small and closes at least abandonedPenetration into the first body/);
 });
});
