import type {Bar,NumericSeries} from '../types';

/**
 * Candlestick pattern detection (original code).
 *
 * Each family is written from the standard textbook description of the pattern (Nison, "Japanese Candlestick Charting
 * Techniques"; Bulkowski, "Encyclopedia of Candlestick Charts"). Every numeric threshold below, the
 * trend rule wiring and the marker text are our own choice and exported so tests cite one place.
 *
 * Bar vocabulary: body = |close - open|, range = high - low, upper = high - max(open, close), lower = min(open, close) - low,
 * white = close > open, black = close < open. A bar with a missing or nonfinite price, or a zero range, never takes part in a
 * pattern. avgBody(i) is the mean body of the CANDLE_THRESHOLDS.averageBodyLength bars before bar i (bar i excluded);
 * a bar without a full window has no average, so patterns that need a long or small body are not reported there.
 */
export const CANDLE_THRESHOLDS=Object.freeze({
 /** A doji's body is at most this share of its range. */
 dojiBody:0.05,
 /** A "small" or "missing" shadow is at most this share of the range. */
 smallShadow:0.1,
 /** A hammer-type shadow is at least this many bodies long. */
 longShadowBodies:2,
 /** Long lower or upper shadow: the shadow is at least this share of the range. */
 longShadowRange:2/3,
 /** Bars in the average body window. */
 averageBodyLength:14,
 /** A small (star or inside) body is at most this share of the average body. */
 smallBody:0.5,
 /** Marubozu shadows are each at most this share of the range. */
 marubozuShadow:0.05,
 /** Three white soldiers or black crows close (open) within this share of the range of the extreme. */
 nearExtreme:0.25,
 /** Tweezer extremes and the on-neck close match within this share of the larger range. */
 matchTolerance:0.05,
});

export type CandleDirection='bullish'|'bearish'|'neutral';
/** reversal: bullish needs a prior downtrend, bearish a prior uptrend. continuation: bullish needs an uptrend, bearish a
 *  downtrend. none: the trend rule does not apply (neutral families, and Kicking, which Nison treats as trend-free). Role per family. */
export type CandleTrendRole='reversal'|'continuation'|'none';
export type TrendRule='SMA50'|'SMA50, SMA200'|'No detection';
export const TREND_RULES:readonly TrendRule[]=Object.freeze(['SMA50','SMA50, SMA200','No detection']);
export type PatternType='Bullish'|'Bearish'|'Both';
export const PATTERN_TYPES:readonly PatternType[]=Object.freeze(['Bullish','Bearish','Both']);

export interface CandleSide {code:string;name:string;test(k:CandleMetrics,i:number):boolean}
export interface CandleFamily {id:string;size:number;role:CandleTrendRole;bullish?:CandleSide;bearish?:CandleSide;neutral?:CandleSide;definition:string}

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const T=CANDLE_THRESHOLDS;

/** Per-bar shape values, computed once per calculation. */
export class CandleMetrics {
 readonly o:number[];readonly h:number[];readonly l:number[];readonly c:number[];readonly ok:boolean[];readonly body:number[];readonly range:number[];readonly upper:number[];readonly lower:number[];readonly avgBody:(number|null)[];
 constructor(bars:readonly Bar[]){
  const n=bars.length;this.o=[];this.h=[];this.l=[];this.c=[];this.ok=[];this.body=[];this.range=[];this.upper=[];this.lower=[];this.avgBody=[];
  for(const bar of bars){
   const valid=[bar.open,bar.high,bar.low,bar.close].every(finite)&&bar.high>=bar.low&&bar.high>=Math.max(bar.open,bar.close)&&bar.low<=Math.min(bar.open,bar.close)&&bar.high>bar.low;
   this.ok.push(valid);this.o.push(bar.open);this.h.push(bar.high);this.l.push(bar.low);this.c.push(bar.close);
   this.body.push(valid?Math.abs(bar.close-bar.open):NaN);this.range.push(valid?bar.high-bar.low:NaN);
   this.upper.push(valid?bar.high-Math.max(bar.open,bar.close):NaN);this.lower.push(valid?Math.min(bar.open,bar.close)-bar.low:NaN);
  }
  const w=T.averageBodyLength;let sum=0,bad=0;
  for(let i=0;i<n;i++){
   // window = bars i-w .. i-1
   if(i>=1){const add=this.body[i-1];if(finite(add))sum+=add;else bad++;}
   if(i>w){const drop=this.body[i-1-w];if(finite(drop))sum-=drop;else bad--;}
   this.avgBody.push(i>=w&&bad===0?sum/w:null);
  }
 }
 /** All bars i-size+1 .. i are usable. */
 usable(i:number,size:number){if(i-size+1<0)return false;for(let k=i-size+1;k<=i;k++)if(!this.ok[k])return false;return true;}
 white(i:number){return this.c[i]>this.o[i];}
 black(i:number){return this.c[i]<this.o[i];}
 top(i:number){return Math.max(this.o[i],this.c[i]);}
 bottom(i:number){return Math.min(this.o[i],this.c[i]);}
 mid(i:number){return (this.o[i]+this.c[i])/2;}
 doji(i:number){return this.body[i]<=T.dojiBody*this.range[i];}
 long(i:number){const avg=this.avgBody[i];return avg!==null&&avg>0&&this.body[i]>avg;}
 small(i:number){const avg=this.avgBody[i];return avg!==null&&avg>0&&this.body[i]<=T.smallBody*avg;}
 marubozu(i:number){return this.long(i)&&this.upper[i]<=T.marubozuShadow*this.range[i]&&this.lower[i]<=T.marubozuShadow*this.range[i];}
}

const side=(code:string,name:string,test:(k:CandleMetrics,i:number)=>boolean):CandleSide=>({code,name,test});
const insideBody=(k:CandleMetrics,i:number,outer:number)=>k.top(i)<=k.top(outer)&&k.bottom(i)>=k.bottom(outer);
const soldier=(k:CandleMetrics,i:number)=>k.white(i)&&k.long(i)&&k.upper[i]<=T.nearExtreme*k.range[i];
const crow=(k:CandleMetrics,i:number)=>k.black(i)&&k.long(i)&&k.lower[i]<=T.nearExtreme*k.range[i];

/** Every family, keyed by id. Order is the "All candlestick patterns" marker order on a bar. */
export const CANDLE_FAMILIES:readonly CandleFamily[]=Object.freeze([
 {id:'doji',size:1,role:'none',definition:'Doji: body at most dojiBody of the range.',
  neutral:side('D','Doji',(k,i)=>k.doji(i))},
 {id:'dojiwings',size:1,role:'reversal',definition:'Dragonfly: a doji whose upper shadow is at most smallShadow of the range. Gravestone: a doji whose lower shadow is at most smallShadow of the range.',
  bullish:side('DD','Dragonfly Doji',(k,i)=>k.doji(i)&&k.upper[i]<=T.smallShadow*k.range[i]),
  bearish:side('GD','Gravestone Doji',(k,i)=>k.doji(i)&&k.lower[i]<=T.smallShadow*k.range[i])},
 {id:'hammer',size:1,role:'reversal',definition:'Not a doji; lower shadow at least longShadowBodies bodies; upper shadow at most smallShadow of the range. After a downtrend it is a Hammer, after an uptrend a Hanging man.',
  bullish:side('H','Hammer',(k,i)=>!k.doji(i)&&k.lower[i]>=T.longShadowBodies*k.body[i]&&k.upper[i]<=T.smallShadow*k.range[i]),
  bearish:side('HM','Hanging man',(k,i)=>!k.doji(i)&&k.lower[i]>=T.longShadowBodies*k.body[i]&&k.upper[i]<=T.smallShadow*k.range[i])},
 {id:'invhammer',size:1,role:'reversal',definition:'Not a doji; upper shadow at least longShadowBodies bodies; lower shadow at most smallShadow of the range. After a downtrend it is an Inverted hammer, after an uptrend a Shooting star.',
  bullish:side('IH','Inverted hammer',(k,i)=>!k.doji(i)&&k.upper[i]>=T.longShadowBodies*k.body[i]&&k.lower[i]<=T.smallShadow*k.range[i]),
  bearish:side('SS','Shooting star',(k,i)=>!k.doji(i)&&k.upper[i]>=T.longShadowBodies*k.body[i]&&k.lower[i]<=T.smallShadow*k.range[i])},
 {id:'engulfing',size:2,role:'reversal',definition:'The second real body covers the first and is larger: bullish = black then white with open <= prior close and close >= prior open; bearish mirrors it.',
  bullish:side('EG','Bullish engulfing',(k,i)=>k.black(i-1)&&k.white(i)&&k.o[i]<=k.c[i-1]&&k.c[i]>=k.o[i-1]&&k.body[i]>k.body[i-1]),
  bearish:side('EG','Bearish engulfing',(k,i)=>k.white(i-1)&&k.black(i)&&k.o[i]>=k.c[i-1]&&k.c[i]<=k.o[i-1]&&k.body[i]>k.body[i-1])},
 {id:'harami',size:2,role:'reversal',definition:'A long first body, then a smaller non-doji body of the opposite color inside it.',
  bullish:side('HR','Bullish harami',(k,i)=>k.black(i-1)&&k.long(i-1)&&k.white(i)&&!k.doji(i)&&insideBody(k,i,i-1)&&k.body[i]<k.body[i-1]),
  bearish:side('HR','Bearish harami',(k,i)=>k.white(i-1)&&k.long(i-1)&&k.black(i)&&!k.doji(i)&&insideBody(k,i,i-1)&&k.body[i]<k.body[i-1])},
 {id:'haramicross',size:2,role:'reversal',definition:'A long first body, then a doji whose body lies inside it. The first body\'s color gives the direction (black = bullish).',
  bullish:side('HC','Bullish harami cross',(k,i)=>k.black(i-1)&&k.long(i-1)&&k.doji(i)&&insideBody(k,i,i-1)),
  bearish:side('HC','Bearish harami cross',(k,i)=>k.white(i-1)&&k.long(i-1)&&k.doji(i)&&insideBody(k,i,i-1))},
 // Nison (Japanese Candlestick Charting Techniques, "Dark-cloud cover" and "Piercing pattern"): the second session opens
 // above the prior session's HIGH (dark cloud) or below its LOW (piercing), not merely beyond its close.
 {id:'piercing',size:2,role:'reversal',definition:'Piercing: a long black body, then a white body opening below its low and closing above its midpoint but below its open. Dark cloud cover mirrors it (opening above the prior high).',
  bullish:side('PL','Piercing',(k,i)=>k.black(i-1)&&k.long(i-1)&&k.white(i)&&k.o[i]<k.l[i-1]&&k.c[i]>k.mid(i-1)&&k.c[i]<k.o[i-1]),
  bearish:side('DC','Dark cloud cover',(k,i)=>k.white(i-1)&&k.long(i-1)&&k.black(i)&&k.o[i]>k.h[i-1]&&k.c[i]<k.mid(i-1)&&k.c[i]>k.o[i-1])},
 {id:'dojistar',size:2,role:'reversal',definition:'A long body, then a doji whose body gaps beyond its close (below after black = bullish, above after white = bearish).',
  bullish:side('DS','Bullish doji star',(k,i)=>k.black(i-1)&&k.long(i-1)&&k.doji(i)&&k.top(i)<k.c[i-1]),
  bearish:side('DS','Bearish doji star',(k,i)=>k.white(i-1)&&k.long(i-1)&&k.doji(i)&&k.bottom(i)>k.c[i-1])},
 {id:'star',size:3,role:'reversal',definition:'Morning star: a long black body, a small non-doji body gapping below its close, then a white body closing above the first body\'s midpoint. Evening star mirrors it.',
  bullish:side('MS','Morning star',(k,i)=>k.black(i-2)&&k.long(i-2)&&k.small(i-1)&&!k.doji(i-1)&&k.top(i-1)<k.c[i-2]&&k.white(i)&&k.c[i]>k.mid(i-2)),
  bearish:side('ES','Evening star',(k,i)=>k.white(i-2)&&k.long(i-2)&&k.small(i-1)&&!k.doji(i-1)&&k.bottom(i-1)>k.c[i-2]&&k.black(i)&&k.c[i]<k.mid(i-2))},
 {id:'dojistar3',size:3,role:'reversal',definition:'Morning Doji star and Evening Doji star: the star pattern with a doji as the middle bar.',
  bullish:side('MDS','Morning Doji star',(k,i)=>k.black(i-2)&&k.long(i-2)&&k.doji(i-1)&&k.top(i-1)<k.c[i-2]&&k.white(i)&&k.c[i]>k.mid(i-2)),
  bearish:side('EDS','Evening Doji star',(k,i)=>k.white(i-2)&&k.long(i-2)&&k.doji(i-1)&&k.bottom(i-1)>k.c[i-2]&&k.black(i)&&k.c[i]<k.mid(i-2))},
 {id:'abandoned',size:3,role:'reversal',definition:'A doji whose whole range gaps away from both neighbours: black, gap-down doji, gap-up white = bullish; the mirror is bearish.',
  bullish:side('AB','Bullish abandoned baby',(k,i)=>k.black(i-2)&&k.doji(i-1)&&k.h[i-1]<k.l[i-2]&&k.white(i)&&k.l[i]>k.h[i-1]),
  bearish:side('AB','Bearish abandoned baby',(k,i)=>k.white(i-2)&&k.doji(i-1)&&k.l[i-1]>k.h[i-2]&&k.black(i)&&k.h[i]<k.l[i-1])},
 {id:'soldiers',size:3,role:'reversal',definition:'Three long white bodies, each closing higher, each opening inside the prior body, each with an upper shadow at most nearExtreme of its range. Three black crows mirror it.',
  bullish:side('3WS','Three white soldiers',(k,i)=>[i-2,i-1,i].every(j=>soldier(k,j))&&k.c[i-1]>k.c[i-2]&&k.c[i]>k.c[i-1]&&k.o[i-1]>k.o[i-2]&&k.o[i-1]<=k.c[i-2]&&k.o[i]>k.o[i-1]&&k.o[i]<=k.c[i-1]),
  bearish:side('3BC','Three black crows',(k,i)=>[i-2,i-1,i].every(j=>crow(k,j))&&k.c[i-1]<k.c[i-2]&&k.c[i]<k.c[i-1]&&k.o[i-1]<k.o[i-2]&&k.o[i-1]>=k.c[i-2]&&k.o[i]<k.o[i-1]&&k.o[i]>=k.c[i-1])},
 // Nison ("Tweezers tops and bottoms"): matching highs or lows of two or more lines, made of real bodies, shadows or
 // doji; colour is not part of the definition, so no colour is required here. The trend rule supplies the "after a rally /
 // decline" context.
 {id:'tweezer',size:2,role:'reversal',definition:'Tweezer bottom: two bars whose lows are equal within matchTolerance of the larger range. Tweezer top: two bars with equal highs. Colour is not required.',
  bullish:side('TB','Tweezer bottom',(k,i)=>Math.abs(k.l[i]-k.l[i-1])<=T.matchTolerance*Math.max(k.range[i],k.range[i-1])),
  bearish:side('TT','Tweezer top',(k,i)=>Math.abs(k.h[i]-k.h[i-1])<=T.matchTolerance*Math.max(k.range[i],k.range[i-1]))},
 {id:'marubozu',size:1,role:'continuation',definition:'A long body whose shadows are each at most marubozuShadow of the range (white = bullish, black = bearish).',
  bullish:side('MW','Marubozu white',(k,i)=>k.white(i)&&k.marubozu(i)),
  bearish:side('MB','Marubozu black',(k,i)=>k.black(i)&&k.marubozu(i))},
 {id:'spinwhite',size:1,role:'none',definition:'Spinning top white: a white non-doji body smaller than each of its shadows.',
  neutral:side('STW','Spinning top white',(k,i)=>k.white(i)&&!k.doji(i)&&k.upper[i]>k.body[i]&&k.lower[i]>k.body[i])},
 {id:'spinblack',size:1,role:'none',definition:'Spinning top black: a black non-doji body smaller than each of its shadows.',
  neutral:side('STB','Spinning top black',(k,i)=>k.black(i)&&!k.doji(i)&&k.upper[i]>k.body[i]&&k.lower[i]>k.body[i])},
 // Nison (Beyond Candlesticks, "Kicker"): the gap between opposite marubozu is decisive whatever the prior trend, so the
 // family is not trend-gated (role none). Saved instances may still carry the old trendRule input (retired, ignored).
 {id:'kicking',size:2,role:'none',definition:'Two marubozu of opposite color with a gap between their ranges: black then gap-up white = bullish; white then gap-down black = bearish. The prior trend is not required.',
  bullish:side('K','Bullish kicking',(k,i)=>k.black(i-1)&&k.marubozu(i-1)&&k.white(i)&&k.marubozu(i)&&k.l[i]>k.h[i-1]),
  bearish:side('K','Bearish kicking',(k,i)=>k.white(i-1)&&k.marubozu(i-1)&&k.black(i)&&k.marubozu(i)&&k.h[i]<k.l[i-1])},
 {id:'threemethods',size:5,role:'continuation',definition:'Rising three methods: a long white bar, three bars with smaller bodies inside its range, then a long white bar closing above the first close. Falling three methods mirrors it.',
  bullish:side('R3M','Rising three methods',(k,i)=>k.white(i-4)&&k.long(i-4)&&[i-3,i-2,i-1].every(j=>k.h[j]<=k.h[i-4]&&k.l[j]>=k.l[i-4]&&k.body[j]<k.body[i-4])&&k.white(i)&&k.long(i)&&k.c[i]>k.c[i-4]),
  bearish:side('F3M','Falling three methods',(k,i)=>k.black(i-4)&&k.long(i-4)&&[i-3,i-2,i-1].every(j=>k.h[j]<=k.h[i-4]&&k.l[j]>=k.l[i-4]&&k.body[j]<k.body[i-4])&&k.black(i)&&k.long(i)&&k.c[i]<k.c[i-4])},
 {id:'tristar',size:3,role:'reversal',definition:'Three dojis whose middle body gaps below both neighbours (bullish) or above both (bearish).',
  bullish:side('TS','Bullish tri-star',(k,i)=>k.doji(i-2)&&k.doji(i-1)&&k.doji(i)&&k.top(i-1)<k.bottom(i-2)&&k.top(i-1)<k.bottom(i)),
  bearish:side('TS','Bearish tri-star',(k,i)=>k.doji(i-2)&&k.doji(i-1)&&k.doji(i)&&k.bottom(i-1)>k.top(i-2)&&k.bottom(i-1)>k.top(i))},
 {id:'tasuki',size:3,role:'continuation',definition:'Upside Tasuki gap: two white bars with a gap up between their ranges, then a black bar opening inside the second body and closing inside the gap. Downside Tasuki gap mirrors it.',
  bullish:side('UTG','Upside Tasuki gap',(k,i)=>k.white(i-2)&&k.white(i-1)&&k.l[i-1]>k.h[i-2]&&k.black(i)&&k.o[i]<k.c[i-1]&&k.o[i]>k.o[i-1]&&k.c[i]<k.l[i-1]&&k.c[i]>k.h[i-2]),
  bearish:side('DTG','Downside Tasuki gap',(k,i)=>k.black(i-2)&&k.black(i-1)&&k.h[i-1]<k.l[i-2]&&k.white(i)&&k.o[i]>k.c[i-1]&&k.o[i]<k.o[i-1]&&k.c[i]>k.h[i-1]&&k.c[i]<k.l[i-2])},
 {id:'window',size:2,role:'continuation',definition:'Rising window: the low is above the prior high. Falling window: the high is below the prior low.',
  bullish:side('RW','Rising window',(k,i)=>k.l[i]>k.h[i-1]),
  bearish:side('FW','Falling window',(k,i)=>k.h[i]<k.l[i-1])},
 {id:'shadow',size:1,role:'reversal',definition:'Long lower shadow: the lower shadow is at least longShadowRange of the range. Long upper shadow: the upper shadow is.',
  bullish:side('LLS','Long lower shadow',(k,i)=>k.lower[i]>=T.longShadowRange*k.range[i]),
  bearish:side('LUS','Long upper shadow',(k,i)=>k.upper[i]>=T.longShadowRange*k.range[i])},
 {id:'onneck',size:2,role:'continuation',definition:'On neck: a long black bar, then a white bar opening below its low and closing at its low (within matchTolerance of its range).',
  bearish:side('ON','On neck',(k,i)=>k.black(i-1)&&k.long(i-1)&&k.white(i)&&k.o[i]<k.l[i-1]&&Math.abs(k.c[i]-k.l[i-1])<=T.matchTolerance*k.range[i-1])},
] as CandleFamily[]);
export const candleFamily=(id:string):CandleFamily=>{const row=CANDLE_FAMILIES.find(family=>family.id===id);if(!row)throw new Error('Unknown candlestick family.');return row;};

/** Trend at each bar from the close and the trend rule (our own wiring of the rule names):
 *  SMA50: up when close > SMA50, down when close < SMA50. SMA50, SMA200: up when close > SMA50 > SMA200, down when
 *  close < SMA50 < SMA200. No detection: both. A bar without the averages has no trend. */
export function trendStates(bars:readonly Bar[],rule:TrendRule,sma:(values:readonly (number|null)[],period:number)=>NumericSeries):{up:boolean[];down:boolean[]}{
 if(rule==='No detection')return {up:bars.map(()=>true),down:bars.map(()=>true)};
 const close=bars.map(bar=>finite(bar.close)?bar.close:null),fast=sma(close,50),slow=rule==='SMA50, SMA200'?sma(close,200):null;
 const up:boolean[]=[],down:boolean[]=[];
 bars.forEach((_,i)=>{
  const c=close[i],f=fast[i],s=slow?slow[i]:null;
  if(!finite(c)||!finite(f)||slow&&!finite(s)){up.push(false);down.push(false);return;}
  up.push(c>f&&(!slow||f>(s as number)));down.push(c<f&&(!slow||f<(s as number)));
 });
 return {up,down};
}

export interface CandleHit {index:number;direction:CandleDirection;family:string;code:string;name:string}
/** Hits of one family on every bar. `trend` gates the directional sides by the family role, read on the bar before the
 *  pattern's first bar (: "preceded by a trend"); the first bars without a prior bar have no trend unless the rule
 *  is No detection. `types` selects the directional sides; neutral sides are always reported. */
export function detectCandleFamily(k:CandleMetrics,family:CandleFamily,trend:{up:boolean[];down:boolean[]},types:{bullish:boolean;bearish:boolean},noDetection:boolean):CandleHit[]{
 const out:CandleHit[]=[];const n=k.c.length;
 const trendOk=(direction:'bullish'|'bearish',i:number)=>{
  if(noDetection||family.role==='none')return true;
  const at=i-family.size;if(at<0)return false;
  const needUp=family.role==='reversal'?direction==='bearish':direction==='bullish';
  return needUp?trend.up[at]:trend.down[at];
 };
 for(let i=0;i<n;i++){
  if(!k.usable(i,family.size))continue;
  if(family.neutral&&family.neutral.test(k,i))out.push({index:i,direction:'neutral',family:family.id,code:family.neutral.code,name:family.neutral.name});
  if(family.bullish&&types.bullish&&trendOk('bullish',i)&&family.bullish.test(k,i))out.push({index:i,direction:'bullish',family:family.id,code:family.bullish.code,name:family.bullish.name});
  if(family.bearish&&types.bearish&&trendOk('bearish',i)&&family.bearish.test(k,i))out.push({index:i,direction:'bearish',family:family.id,code:family.bearish.code,name:family.bearish.name});
 }
 return out;
}
