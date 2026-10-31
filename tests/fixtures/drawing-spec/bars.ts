// Drawing spec fixture (OpenCandle 0.8.1): a deterministic bar timeline with weekend gaps and fixed price scales.
// SYNTHETIC. Bar index i of the daily series is Monday 2024-01-01 + i trading days (Saturdays and Sundays skipped), so a
// calendar-day count and a bar count differ whenever a level crosses a weekend.
export const DAY=86400000,HOUR=3600000;
export const MONDAY=Date.UTC(2024,0,1);
/** Daily bars loaded on the chart. */
export const DAILY_BARS=60;
/** Pixel layout: bar i is drawn at x = X0 + PX_PER_BAR * i, so bars 0..59 sit at 100..690 on an 800 px wide pane; the
 *  right 110 px are future time slots. The vertical mirror of bar i around x = 400 is bar MIRROR - i. */
export const X0=100,PX_PER_BAR=10,WIDTH=800,HEIGHT=1000,MIRROR=60;
let daily:number[]|undefined,hourly:number[]|undefined;
export function dailyTimes():number[]{
 return daily??=Array.from({length:DAILY_BARS},(_,i)=>MONDAY+(Math.floor(i/5)*7+i%5)*DAY);
}
/** 1h bars 09:00..16:00 on the same trading days (8 per day). */
export function hourlyTimes():number[]{
 return hourly??=dailyTimes().flatMap(day=>Array.from({length:8},(_,h)=>day+(9+h)*HOUR));
}
export interface Anchor{bar:number;price:number}
/** Price scales. `base`: 0..1000 maps 1:1 onto the 1000 px pane (y = 1000 - price). `fx`: a EURUSD-like 1.00..1.20 pane
 *  (tick 0.00001). `band`: 140..160 (tick 0.001), used to check printed price precision: every number printed in that band is a
 *  price. `logbase`: 10..1000 for the log-scale checks. */
export const SCALES={base:{min:0,max:1000},fx:{min:1,max:1.2},band:{min:140,max:160},logbase:{min:10,max:1000}} as const;
export type ScaleId=keyof typeof SCALES;
export const TICK:Record<ScaleId,number>={base:0.01,fx:0.00001,band:0.001,logbase:0.01};
/** Maps a base-scale price onto the same pixel height in another scale (linear scales only). */
export function rescale(price:number,to:ScaleId):number{const s=SCALES[to];return s.min+(s.max-s.min)*price/1000;}
export interface OhlcvBar{time:number;open:number;high:number;low:number;close:number;volume:number}
/** OHLCV for the daily bars: a rising zigzag close (500 + 4 i, +-10 on odd/even bars), high/low 8 around the close,
 *  open 3 under it, volume 100, 150, 200 repeating. Typical price (h + l + c) / 3 equals the close. */
export function dailyBars():OhlcvBar[]{
 return dailyTimes().map((time,i)=>{const close=500+4*i+(i%2?10:-10);return{time,open:close-3,high:close+8,low:close-8,close,volume:100+50*(i%3)};});
}
export function hourlyBars():OhlcvBar[]{
 return hourlyTimes().map((time,i)=>{const close=500+0.5*i+(i%2?2:-2);return{time,open:close-1,high:close+3,low:close-3,close,volume:100+50*(i%3)};});
}
