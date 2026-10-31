import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition,ALL_CATALOG_INDICATOR_IDS} from '../../src/domain/indicator-catalog';
import {R40_INDICATOR_IDS,bbTrendState,ratingVoteAbove,ratingBucket,levelVote,crossVote,TECH_RATING_COLORS} from '../../src/domain/indicators-ext/r40-catalog';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import type {Bar} from '../../src/domain/types';

// Hand-computed oracles for these built-ins. All bars are SYNTHETIC fixtures made up
// for these tests (no market data). Each expected value is worked out in the comment next to it from the public
// formula cited in the definition, independent of the production arithmetic.
const DAY=86400,D0=19700*DAY;
const bar=(i:number,open:number,high:number,low:number,close:number,volume=100,time=D0+i*DAY):Bar=>({time,open,high,low,close,volume});
/** high = close + 1, low = close - 1, open = close. */
const fromCloses=(closes:number[])=>closes.map((close,i)=>bar(i,close,close+1,close-1,close));
const values=(kind:string,bars:readonly Bar[],inputs:Record<string,unknown>={},plot?:string)=>{
 const result=calculateIndicator(kind,bars,inputs);expect(result.diagnostics,kind).toEqual([]);
 const row=result.series.find(item=>item.id===(plot??result.series[0].id));expect(row,kind+'.'+plot).toBeDefined();return row!.values;
};
const close=(got:readonly (number|null)[],want:readonly (number|null)[])=>{expect(got.length).toBe(want.length);want.forEach((value,i)=>{if(value===null)expect(got[i],'index '+i).toBeNull();else expect(got[i] as number,'index '+i).toBeCloseTo(value,9);});};
const N=null;

describe(' catalog shape (SYNTHETIC)',()=>{
 it('the kinds are catalog built-ins with provenance, OpenCandle-defined unknowns and alert sources',()=>{
  expect([...R40_INDICATOR_IDS]).toEqual(['w52hl','pivotshl','chandelier','kama','pricechannel','lrslope','median','chandekroll','ulcer','bbtrend','guppy','sebands','aroonosc','techrating']);
  for(const kind of R40_INDICATOR_IDS){
   const definition=catalogDefinition(kind)!;expect(definition,kind).toBeDefined();expect(ALL_CATALOG_INDICATOR_IDS).toContain(kind);
   expect(definition.provenance.length,kind).toBeGreaterThan(0);expect(definition.unknownDefaults!.join(' '),kind).toMatch(/OpenCandle-defined/);
   expect(indicatorAlertBlock(kind),kind).toBeNull();
   for(const text of [definition.name,...definition.plots.map(plot=>plot.label),...definition.inputs.map(input=>input.title)])expect(text,kind).not.toMatch(/—|r40|R40/);
  }
  expect(catalogDefinition('bbtrend')!.provenance.some(row=>row.url.startsWith('indicator-list:'))).toBe(true);
 });
 it('every kind calculates its defaults on 600 synthetic daily bars without diagnostics, each plot with a value',()=>{
  const bars=Array.from({length:600},(_,i)=>{const c=100+10*Math.sin(i/9)+6*Math.sin(i/31)+i*0.02;return bar(i,c-0.3,c+1+(i%3)*0.2,c-1-(i%4)*0.1,c,500+(i*37)%250);});
  for(const kind of R40_INDICATOR_IDS){const result=calculateIndicator(kind,bars,{});expect(result.diagnostics,kind).toEqual([]);
   for(const plot of catalogDefinition(kind)!.plots)expect(result.series.find(row=>row.id===plot.id)!.values.some(value=>value!==null),kind+'.'+plot.id).toBe(true);}
 });
});

describe('52 week high/low (SYNTHETIC)',()=>{
 it('highest high and lowest low over the trailing weeks by time, unavailable until the history covers the window',()=>{
  // Lookback 1 week: the window is (t - 7 days, t], i.e. bars i-6..i; it is full once bar 0 is at most t - 6 days (i >= 6).
  const b=fromCloses([5,7,6,9,4,3,8,2,1,10]),inputs={weeks:1};
  // i6: closes 5,7,6,9,4,3,8 -> high 9+1, low 3-1; i7: 7..2 -> 10, 1; i8: 6..1 -> 10, 0; i9: 9..10 -> 11, 0
  close(values('w52hl',b,inputs,'high'),[N,N,N,N,N,N,10,10,10,11]);
  close(values('w52hl',b,inputs,'low'),[N,N,N,N,N,N,2,1,0,0]);
  // Close source: i6 9/3, i7 9/2, i8 9/1, i9 10/1
  close(values('w52hl',b,{...inputs,extremes:'Close'},'high'),[N,N,N,N,N,N,9,9,9,10]);
  close(values('w52hl',b,{...inputs,extremes:'Close'},'low'),[N,N,N,N,N,N,3,2,1,1]);
 });
 it('the window follows bar times, not bar counts (a gap drops the older bars)',()=>{
  // Days 0, 1, 2, 10, 11. Day 10: window (3, 10] holds only day 10 (close 3 -> high 4, low 2); day 11: days 10 and 11.
  const b=[5,9,1,3,4].map((c,i)=>bar(i,c,c+1,c-1,c,100,D0+[0,1,2,10,11][i]*DAY));
  close(values('w52hl',b,{weeks:1},'high'),[N,N,N,4,5]);
  close(values('w52hl',b,{weeks:1},'low'),[N,N,N,2,2]);
 });
});

describe('Pivot points high/low (SYNTHETIC)',()=>{
 it('a pivot high is a high above the Left highs before and the Right highs after it, placed on its own bar',()=>{
  // highs 2,4,3,3,6,5,5.5,2 / lows 0,2,1,1,4,3,3.5,0. Left = Right = 1: highs at 1 (4), 4 (6), 6 (5.5); low at 5 (3).
  const b=fromCloses([1,3,2,2,5,4,4.5,1]),one={leftHigh:1,rightHigh:1,leftLow:1,rightLow:1};
  close(values('pivotshl',b,one,'high'),[N,4,N,N,6,N,5.5,N]);
  // lows: bar 2 (1) ties bar 3 (1) and bar 3 ties bar 2, so neither is a pivot (strict comparisons)
  close(values('pivotshl',b,one,'low'),[N,N,N,N,N,3,N,N]);
  // Left 2: bar 1 has one bar before it; bar 6 (5.5) is below bar 4 (6)
  close(values('pivotshl',b,{...one,leftHigh:2},'high'),[N,N,N,N,6,N,N,N]);
 });
});

describe('Chandelier exit (SYNTHETIC)',()=>{
 it('trailing long and short stops from the extreme close -/+ Multiplier x ATR, with the direction switch markers',()=>{
  // closes 10,12,11,8,9,13 (high/low = close +/- 1). TR: 2, 3, 2, 4, 2, 5 = ATR (Length 1). Raw long = close - ATR:
  // 8,9,9,4,7,8; raw short = close + ATR: 12,15,13,12,11,18.
  // i0 long 8 short 12 up. i1 long max(9,8)=9, short min(15,12)=12, up. i2 long 9, short 13 (prior close 12 not below 12), up.
  // i3 long max(4,9)=9, short min(12,13)=12; close 8 < prior long 9 -> down (sell at 12). i4 prior close 8 not above 9 -> long 7;
  // short min(11,12)=11, down. i5 long max(8,7)=8, short min(18,11)=11; close 13 > prior short 11 -> up (buy at 8).
  const b=fromCloses([10,12,11,8,9,13]),inputs={length:1,multiplier:1};
  close(values('chandelier',b,inputs,'long'),[8,9,9,N,N,8]);
  close(values('chandelier',b,inputs,'short'),[N,N,N,12,11,N]);
  close(values('chandelier',b,inputs,'buy'),[N,N,N,N,N,8]);
  close(values('chandelier',b,inputs,'sell'),[N,N,N,12,N,N]);
  // Extremes from high and low instead: i0 long = 11 - 2 = 9
  expect(values('chandelier',b,{...inputs,useClose:false},'long')[0]).toBeCloseTo(9,12);
 });
});

describe('Kaufman adaptive moving average (SYNTHETIC)',()=>{
 it('efficiency ratio scaled between the fast and slow constants, squared, seeded with the previous source',()=>{
  // Length 2, fast 1 (2/2 = 1), slow 3 (2/4 = 0.5): sc = (ER x 0.5 + 0.5)^2.
  // i2: ER |13-10| / (1+2) = 1, sc 1: 11 + (13-11) = 13. i3: ER 1/3, sc 4/9: 13 - 4/9 = 113/9. i4: ER 1/1, sc 1: 12.
  // i5: ER 4/4: 16. i6: ER 2/6 = 1/3, sc 4/9: 16 - 8/9 = 136/9. i7: ER 0/4 = 0, sc 1/4: 136/9 + (16 - 136/9)/4 = 138/9.
  const b=fromCloses([10,11,13,12,12,16,14,16]);
  close(values('kama',b,{length:2,fastLength:1,slowLength:3}),[N,N,13,113/9,12,16,136/9,138/9]);
  // A flat window has no volatility: ER 0, sc 1/4, and the average stays on the flat price.
  close(values('kama',fromCloses([5,5,5,5]),{length:2,fastLength:1,slowLength:3}),[N,N,5,5]);
 });
});

describe('Price channel (SYNTHETIC)',()=>{
 it('highest high and lowest low of the Length bars before the current one, and their midpoint',()=>{
  // highs 6,8,7,10,5 / lows 4,6,5,8,3, Length 2: i2 8/4, i3 8/5, i4 10/5; center 6, 6.5, 7.5
  const b=fromCloses([5,7,6,9,4]);
  close(values('pricechannel',b,{length:2},'upper'),[N,N,8,8,10]);
  close(values('pricechannel',b,{length:2},'lower'),[N,N,4,5,5]);
  close(values('pricechannel',b,{length:2},'center'),[N,N,6,6.5,7.5]);
 });
});

describe('Linear regression slope (SYNTHETIC)',()=>{
 it('least-squares slope per bar over Length',()=>{
  // Length 3, x = 0,1,2: i2 y 1,2,4: (3 x 10 - 3 x 7) / (3 x 5 - 9) = 1.5; i3 y 2,4,7: (3 x 18 - 3 x 13) / 6 = 2.5
  close(values('lrslope',fromCloses([1,2,4,7]),{length:3}),[N,N,1.5,2.5]);
 });
});

describe('Median (SYNTHETIC)',()=>{
 it('rolling median, its EMA and ATR bands',()=>{
  // close source, Length 3: medians i2 med(5,1,3) = 3, i3 med(1,3,8) = 3, i4 med(3,8,9) = 8.
  // EMA 3 (alpha 0.5, first-value seed): 3, 3, 5.5. TR (ATR 1): 2, 5, 3, 6, 2. Bands = median +/- 2 x ATR.
  const b=fromCloses([5,1,3,8,9]),inputs={source:'close',length:3,atrLength:1,multiplier:2};
  close(values('median',b,inputs,'median'),[N,N,3,3,8]);
  close(values('median',b,inputs,'ema'),[N,N,3,3,5.5]);
  close(values('median',b,inputs,'upper'),[N,N,9,15,12]);
  close(values('median',b,inputs,'lower'),[N,N,-3,-9,4]);
  // Even length: the mean of the two middle values. Length 2: (5+1)/2, (1+3)/2, (3+8)/2, (8+9)/2
  close(values('median',b,{...inputs,length:2},'median'),[N,3,2,5.5,8.5]);
 });
});

describe('Chande Kroll stop (SYNTHETIC)',()=>{
 it('first stops from the P-bar extremes and ATR, then the Q-bar extreme of those',()=>{
  // P 1, X 1, Q 2, closes 10,12,11,8,9. ATR(1) = TR: 2,3,2,4,2. First high stop = high - ATR: 9,10,10,5,8;
  // first low stop = low + ATR: 11,14,12,11,10. Stop short = highest of 2: -,10,10,10,8. Stop long = lowest of 2: -,11,12,11,10.
  const b=fromCloses([10,12,11,8,9]),inputs={atrLength:1,atrCoef:1,stopLength:2};
  close(values('chandekroll',b,inputs,'stopShort'),[N,10,10,10,8]);
  close(values('chandekroll',b,inputs,'stopLong'),[N,11,12,11,10]);
 });
});

describe('Ulcer index (SYNTHETIC)',()=>{
 it('root mean square of the percent drawdown from the Length-bar highest close',()=>{
  // Length 2, closes 10,8,8,12,6. Highest close: -,10,8,12,12. Drawdown %: -,-20,0,0,-50.
  // UI: i2 sqrt((400 + 0) / 2), i3 0, i4 sqrt((0 + 2500) / 2)
  close(values('ulcer',fromCloses([10,8,8,12,6]),{length:2}),[N,N,Math.sqrt(200),0,Math.sqrt(1250)]);
 });
});

describe('BBTrend (SYNTHETIC)',()=>{
 it('(|short lower - long lower| - |short upper - long upper|) / short middle x 100, population deviation',()=>{
  // Short 2, long 3, StdDev 1, closes 1,3,2,6.
  // i2: short mean 2.5 sd 0.5; long mean 2 sd sqrt(2/3). Lower gap 0.5 - (0.5 - sqrt(2/3)) = sqrt(2/3); upper gap 1 - sqrt(2/3).
  //     (2 sqrt(2/3) - 1) / 2.5 x 100.
  // i3: short mean 4 sd 2; long mean 11/3 sd sqrt(26)/3. a = 1/3, b = 2 - sqrt(26)/3: (|a - b| - |a + b|) / 4 x 100 = -2b x 25.
  const got=values('bbtrend',fromCloses([1,3,2,6]),{shortLength:2,longLength:3,stdDev:1});
  close(got,[N,N,40*(2*Math.sqrt(2/3)-1),-50*(2-Math.sqrt(26)/3)]);
  // Column states: 0 positive and rising (or first), 1 positive and falling, 2 negative and falling, 3 negative and rising.
  expect(bbTrendState([null,5,3,-1,-4,-2,0])).toEqual([null,0,1,2,2,3,null]);
 });
});

describe('Guppy multiple moving average (SYNTHETIC)',()=>{
 it('twelve EMAs with their own lengths',()=>{
  // Length 1 = the source; EMA 3 (alpha 0.5, first-value seed) of 2,4,8: 2, 3, 5.5.
  const b=fromCloses([2,4,8]);
  close(values('guppy',b,{short1:1},'short1'),[2,4,8]);
  close(values('guppy',b,{long1:3},'long1'),[2,3,5.5]);
  expect(catalogDefinition('guppy')!.plots).toHaveLength(12);
 });
});

describe('Standard error bands (SYNTHETIC)',()=>{
 it('linear regression endpoint +/- Multiplier x standard error, smoothed by an SMA',()=>{
  // Length 3, closes 1,2,4,7. i2: slope 1.5, intercept 5/6, endpoint 23/6, residuals 1/6, -1/3, 1/6: SE = sqrt((1/6)/1).
  // i3: slope 2.5, intercept 11/6, endpoint 41/6, the same residuals.
  const b=fromCloses([1,2,4,7]),se=Math.sqrt(1/6);
  close(values('sebands',b,{length:3,smoothing:1,multiplier:1},'middle'),[N,N,23/6,41/6]);
  close(values('sebands',b,{length:3,smoothing:1,multiplier:1},'upper'),[N,N,23/6+se,41/6+se]);
  close(values('sebands',b,{length:3,smoothing:1,multiplier:1},'lower'),[N,N,23/6-se,41/6-se]);
  // Smoothing 2: i3 middle (23/6 + 41/6) / 2 = 32/6
  close(values('sebands',b,{length:3,smoothing:2,multiplier:1},'middle'),[N,N,N,32/6]);
  close(values('sebands',b,{length:3,smoothing:2,multiplier:1},'upper'),[N,N,N,32/6+se]);
 });
});

describe('Aroon oscillator (SYNTHETIC)',()=>{
 it('Aroon Up minus Aroon Down over the current bar and Length prior bars',()=>{
  // Length 2, highs 2,4,3,2 / lows 0,2,1,0. i2: high 2 bars... high at bar 1 (1 bar ago): up 50; low at bar 0 (2 ago): down 0.
  // i3: high at bar 1 (2 ago): up 0; low at bar 3 (0 ago): down 100.
  close(values('aroonosc',fromCloses([1,3,2,1]),{length:2}),[N,N,50,-100]);
 });
});

describe('Technical ratings (SYNTHETIC)',()=>{
 it('moving-average votes, the rating buckets and the column colors',()=>{
  // A moving average below the price votes buy (+1), above votes sell (-1), equal or missing is neutral (0) / unavailable.
  expect([ratingVoteAbove(10,9),ratingVoteAbove(10,11),ratingVoteAbove(10,10),ratingVoteAbove(10,null)]).toEqual([1,-1,0,null]);
  // Buckets: strong sell <= -0.5 < sell <= -0.1 < neutral < 0.1 <= buy < 0.5 <= strong buy (index 0 = strong buy).
  expect([1,0.5,0.49,0.1,0.09,0,-0.09,-0.1,-0.49,-0.5,-1,null].map(ratingBucket)).toEqual([0,0,1,1,2,2,2,3,3,4,4,null]);
  expect(TECH_RATING_COLORS).toHaveLength(5);
  // RSI-style rule (30/70): 25 after 20 is below 30 and rising: buy; 75 after 80 above 70 and falling: sell; 25 after 28: 0.
  const rsi=[20,25,80,75,28,25];
  expect([1,3,5].map(i=>levelVote(rsi,i,30,70))).toEqual([1,-1,0]);expect(levelVote(rsi,0,30,70)).toBeNull();
  // %K/%D rule (20/80): K 15 > D 10, both below 20: buy; K 85 < D 90, both above 80: sell; K 15 with D 25: 0.
  expect([crossVote([15],[10],0,20,80),crossVote([85],[90],0,20,80),crossVote([15],[25],0,20,80),crossVote([null],[25],0,20,80)]).toEqual([1,-1,0,null]);
 });
 it('a steady rise rates every moving average a buy; a steady fall rates them a sell',()=>{
  const up=fromCloses(Array.from({length:300},(_,i)=>50+i+0.01*i*i)),down=fromCloses(Array.from({length:300},(_,i)=>2000-i-0.01*i*i));
  // On an accelerating rise every moving average lags below the close (the Hull average included, which tracks a straight
  // line exactly), and the base line (highest high + lowest low of 26) / 2 too: 15 buy votes of 15 -> 1. The fall mirrors it.
  expect(values('techrating',up,{},'ma').at(-1)).toBeCloseTo(1,12);
  expect(values('techrating',down,{},'ma').at(-1)).toBeCloseTo(-1,12);
  // The rating column is the mean of the moving-average and oscillator ratings (default "All").
  const rating=values('techrating',up,{},'rating').at(-1)!,osc=values('techrating',up,{},'osc').at(-1)!;
  expect(rating).toBeCloseTo((1+osc)/2,12);
  expect(values('techrating',up,{ratingsUse:'Moving averages'},'rating').at(-1)).toBeCloseTo(1,12);
  expect(values('techrating',up,{ratingsUse:'Oscillators'},'rating').at(-1)).toBeCloseTo(osc,12);
 });
});
