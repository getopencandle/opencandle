import type {Bar} from '../types';
import {zigzagPivots} from './r23-catalog';

/**
 * Swings for the auto Fibonacci kinds (Auto fib retracement, Auto fib multi-scale, Auto fib range volume profile).
 * A swing runs from its start pivot to its end pivot; retracement level 0 sits at the end and level 1 at the start
 * (Fibonacci retracement measured back from the swing end).
 */
export interface FibPoint {index:number;price:number}
export interface FibSwing {start:FibPoint;end:FibPoint}
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);

/** The latest completed leg of the percent-reversal zig zag (the leg before the one still forming; with only one leg,
 *  that leg); null with fewer than two zig zag points. The Auto fib retracement rule. */
export function zigzagFibSwing(bars:readonly Bar[],deviation:number,depth:number):FibSwing|null{
 const points=zigzagPivots(bars,deviation,depth);if(points.length<2)return null;
 const [a,b]=points.length>=3?[points.at(-3)!,points.at(-2)!]:[points[0],points[1]];
 return {start:{index:a.index,price:a.price},end:{index:b.index,price:b.price}};
}
/** OpenCandle-defined lookback swing: the highest high and the lowest low of bars from..to (bars with a missing high or
 *  low are skipped; the latest bar wins a tie). The earlier extreme is the start, the later one the end; when both sit on
 *  one bar the swing counts as rising (low to high). Null when no bar in the window has a high and a low. */
export function lookbackFibSwing(bars:readonly Bar[],from:number,to:number):FibSwing|null{
 let hi=-1,lo=-1;
 for(let i=Math.max(0,from);i<=to&&i<bars.length;i++){const bar=bars[i];if(!finite(bar.high)||!finite(bar.low))continue;if(hi<0||bar.high>=bars[hi].high)hi=i;if(lo<0||bar.low<=bars[lo].low)lo=i;}
 if(hi<0)return null;
 const high={index:hi,price:bars[hi].high},low={index:lo,price:bars[lo].low};
 return hi>=lo?{start:low,end:high}:{start:high,end:low};
}
/** The lookback swing of every bar i over bars max(0, i - length + 1)..i, in one causal pass (monotonic deques, so each
 *  bar costs O(1) amortised). Equal to lookbackFibSwing(bars, i - length + 1, i); null where bar i has no high or low. */
export function rollingFibSwings(bars:readonly Bar[],length:number):(FibSwing|null)[]{
 const out:(FibSwing|null)[]=[],maxQ:number[]=[],minQ:number[]=[];let maxHead=0,minHead=0;
 for(let i=0;i<bars.length;i++){
  const bar=bars[i],from=i-length+1;
  if(finite(bar.high)&&finite(bar.low)){
   while(maxQ.length>maxHead&&bars[maxQ[maxQ.length-1]].high<=bar.high)maxQ.pop();maxQ.push(i);
   while(minQ.length>minHead&&bars[minQ[minQ.length-1]].low>=bar.low)minQ.pop();minQ.push(i);
  }
  while(maxHead<maxQ.length&&maxQ[maxHead]<from)maxHead++;while(minHead<minQ.length&&minQ[minHead]<from)minHead++;
  if(!finite(bar.high)||!finite(bar.low)||maxHead>=maxQ.length){out.push(null);continue;}
  const hi=maxQ[maxHead],lo=minQ[minHead],high={index:hi,price:bars[hi].high},low={index:lo,price:bars[lo].low};
  out.push(hi>=lo?{start:low,end:high}:{start:high,end:low});
 }
 return out;
}
/** The price of retracement `ratio` of a swing (0 at the end, 1 at the start); `reverse` swaps the ends. */
export const fibLevelPrice=(swing:FibSwing,ratio:number,reverse=false)=>{const [zero,one]=reverse?[swing.start.price,swing.end.price]:[swing.end.price,swing.start.price];return zero+(one-zero)*ratio;};
