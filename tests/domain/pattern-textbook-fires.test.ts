import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import type {Bar} from '../../src/domain/types';

// Patterns that never fired on the six example symbols, each built bar by bar from its textbook definition (Nison,
// "Japanese Candlestick Charting Techniques" and "Beyond Candlesticks"; Bulkowski, "Encyclopedia of Chart Patterns").
// SYNTHETIC bars. Each must fire on the completing bar with the right direction, and the near-miss without the defining
// gap must not. They are rare on real data, not broken: a daily crypto chart almost never gaps.
const T0=1700000000;
/** 60 bars of steady trend (close below or above its SMA50 on every later bar), small 0.5 bodies. */
const trend=(up:boolean):Bar[]=>Array.from({length:60},(_,i)=>{const c=up?40+i*0.5:100-i*0.5,o=up?c-0.5:c+0.5;return {time:T0+i*86400,open:o,high:Math.max(o,c)+0.2,low:Math.min(o,c)-0.2,close:c,volume:1000};});
const add=(bars:Bar[],rows:readonly (readonly [number,number,number,number])[])=>[...bars,...rows.map(([open,high,low,close],k)=>({time:T0+(bars.length+k)*86400,open,high,low,close,volume:1000}))];
/** Bars where the plot is 1. */
const fired=(id:string,bars:Bar[],plot:'bullish'|'bearish')=>{const result=calculateIndicator(id,bars,{});expect(result.diagnostics).toEqual([]);return result.series.find(row=>row.id===plot)!.values.flatMap((value,i)=>value===1?[i]:[]);};
const other=(plot:'bullish'|'bearish')=>plot==='bullish'?'bearish':'bullish';

describe('candlestick patterns from the textbook definition (Nison)',()=>{
 const down=trend(false),up=trend(true);
 const cases:Array<[string,'bullish'|'bearish',Bar[],Bar[]]>=[
  // Abandoned baby: a doji whose whole range (shadows too) gaps away from both neighbours.
  ['cdlabandonedbabybull','bullish',add(down,[[70.5,70.7,67.3,67.5],[66,66.5,65.5,66],[67.2,69.7,67,69.5]]),add(down,[[70.5,70.7,67.3,67.5],[66,67.4,65.5,66],[67.2,69.7,67,69.5]])],
  ['cdlabandonedbabybear','bearish',add(up,[[69.5,72.7,69.3,72.5],[74,74.5,73.5,74],[72.8,73,70.3,70.5]]),add(up,[[69.5,72.7,69.3,72.5],[74,74.5,72.6,74],[72.8,73,70.3,70.5]])],
  // Kicking: opposite marubozu with a gap between them; no prior trend is needed.
  ['cdlkickingbull','bullish',add(down,[[70.5,70.5,67.5,67.5],[71,74,71,74]]),add(down,[[70.5,70.5,67.5,67.5],[70,73,70,73]])],
  ['cdlkickingbear','bearish',add(up,[[69.5,72.5,69.5,72.5],[69,69,66,66]]),add(up,[[69.5,72.5,69.5,72.5],[70,70,67,67]])],
  // Tri-star: three dojis, the middle one gapping below (bottom) or above (top) the other two.
  ['cdltristarbull','bullish',add(down,[[68,68.5,67.5,68],[66.5,67,66,66.5],[68,68.5,67.5,68]]),add(down,[[68,68.5,67.5,68],[68.2,68.7,67.7,68.2],[68,68.5,67.5,68]])],
  ['cdltristarbear','bearish',add(up,[[72,72.5,71.5,72],[73.5,74,73,73.5],[72,72.5,71.5,72]]),add(up,[[72,72.5,71.5,72],[71.8,72.3,71.3,71.8],[72,72.5,71.5,72]])],
 ];
 for(const [id,plot,bars,nearMiss] of cases)it(`${id} fires on the completing bar as ${plot}, and not without its gap`,()=>{
  expect(fired(id,bars,plot)).toEqual([bars.length-1]);expect(fired(id,bars,other(plot))).toEqual([]);
  expect(fired(id,nearMiss,plot)).toEqual([]);
 });
 it('the same textbook bars fire inside All candlestick patterns',()=>{
  const bars=cases[0][2],result=calculateIndicator('cdlall',bars,{});
  expect(result.marks?.markers.some(marker=>marker.index===bars.length-1&&marker.plot==='bullish'&&marker.tooltip?.includes('Bullish abandoned baby'))).toBe(true);
 });
});

/** Piecewise-linear closes through [bar, price] keypoints (or `shape` where given); each bar spans its open and close
 *  plus 0.1, so the keypoints are the only zigzag pivots. */
const path=(points:readonly [number,number][],shape?:(i:number)=>number|undefined):Bar[]=>{
 const closes:number[]=[];for(let k=0;k<points.length-1;k++){const [i0,p0]=points[k],[i1,p1]=points[k+1];for(let i=i0;i<i1;i++)closes[i]=p0+(p1-p0)*(i-i0)/(i1-i0);}closes[points.at(-1)![0]]=points.at(-1)![1];
 const close=(i:number)=>shape?.(i)??closes[i];
 return closes.map((_,i)=>{const c=close(i),o=i?close(i-1):c;return {time:T0+i*86400,open:o,high:Math.max(o,c)+0.1,low:Math.min(o,c)-0.1,close:c,volume:1000};});
};
describe('chart patterns from the textbook definition (Bulkowski), Pivot length 5 and Tolerance 2%',()=>{
 it('Bullish pennant: a 40% pole, then converging lower highs and higher lows above the pole midpoint',()=>{
  // Pole low 50 (bar 8) to 70 (bar 16); pennant 64 (22), 68 (28), 66 (34); breakout to 75. Known when the last low is
  // confirmed, five bars after it.
  const bars=path([[0,60],[8,50],[16,70],[22,64],[28,68],[34,66],[42,75]]);
  expect(fired('chpbullpennant',bars,'bullish')).toEqual([39]);
  const marker=calculateIndicator('chpbullpennant',bars,{}).marks!.markers[0];expect(marker).toMatchObject({index:34,plot:'bullish'});
  // A parallel consolidation (equal highs and lows) is a flag, not a pennant.
  expect(fired('chpbullpennant',path([[0,60],[8,50],[16,70],[22,64],[28,70],[34,64],[42,75]]),'bullish')).toEqual([]);
 });
 it('Inverted cup and handle: two equal low rims, a rounded dome, and a short handle rising less than half the dome',()=>{
  // Rim 50 (bar 10), rounded dome to 70 (bar 25), rim 50.5 (bar 40), handle high 55 (bar 46), then the decline.
  const dome=(i:number)=>i>=10&&i<=40?50+20*Math.sqrt(Math.max(0,1-((i-25)/15)**2))+(i>25?0.5*(i-25)/15:0):undefined;
  const bars=path([[0,60],[10,50],[25,70],[40,50.5],[46,55],[54,45]],dome);
  expect(fired('chpinvcuphandle',bars,'bearish')).toEqual([51]);
  expect(calculateIndicator('chpinvcuphandle',bars,{}).marks!.markers[0]).toMatchObject({index:46,plot:'bearish'});
  // A pointed (V-shaped) dome is not a cup.
  expect(fired('chpinvcuphandle',path([[0,60],[10,50],[25,70],[40,50.5],[46,55],[54,45]]),'bearish')).toEqual([]);
 });
});
