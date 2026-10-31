// WSX Symbol tab precision. Pure options and formatter choice.
// Options are exactly the cited fact values (PRECISION_OPTIONS, Default first). 'default' and an absent value keep
// today's output: the caller's own fallback formatter is returned untouched. Integer and 1 to 15 decimals round half
// away from zero in decimal arithmetic. The 1/N values round to the nearest 1/N and print the decimal value of that
// fraction (: the value prints as a decimal, not in fraction notation).
import Decimal from 'decimal.js';
import {PRECISION_OPTIONS} from './chart-settings-facts';

export type PriceFormatter=(value:number)=>string;
const DECIMAL=/^([1-9]|1[0-5])$/;
const FRACTION=/^1\/(2|4|8|16|32|64|128|320)$/;
const Dec=Decimal.clone({precision:60,rounding:Decimal.ROUND_HALF_UP});
function unknown(value:string):never{throw new Error('Unknown precision value: '+value+'.');}
export function precisionOptions():readonly {value:string;label:string}[]{return PRECISION_OPTIONS.map(row=>({value:row.value,label:row.label}));}
const noNegativeZero=(text:string)=>/^-0(\.0+)?$/.test(text)?text.slice(1):text;
/** Digits after the point needed to print any multiple of 1/N exactly (N has only the factors 2 and 5). */
function fractionDigits(denominator:number):number{
 for(let digits=0;digits<=12;digits++){const scaled=new Dec(10).pow(digits).div(denominator);if(scaled.isInteger())return digits;}
 return 12;
}
/** Format one price with a stored precision value. Throws for a value outside the 25 options (and 'default'). */
export function formatWithPrecision(value:number,precision:string):string{
 if(precision==='integer')return noNegativeZero(new Dec(value).toFixed(0));
 if(DECIMAL.test(precision))return noNegativeZero(new Dec(value).toFixed(Number(precision)));
 const fraction=FRACTION.exec(precision);
 if(fraction){
  const denominator=Number(fraction[1]),units=new Dec(value).mul(denominator).toDecimalPlaces(0,Decimal.ROUND_HALF_UP);
  return noNegativeZero(units.div(denominator).toFixed(fractionDigits(denominator)));
 }
 return unknown(precision);
}
/** The formatter a surface should use. Absent or 'default' returns the fallback itself (byte for byte today's output). */
export function precisionFormatter(precision:string|undefined,fallback:PriceFormatter):PriceFormatter{
 if(precision===undefined||precision==='default')return fallback;
 if(precision!=='integer'&&!DECIMAL.test(precision)&&!FRACTION.test(precision))unknown(precision);
 return value=>typeof value==='number'&&Number.isFinite(value)?formatWithPrecision(value,precision):fallback(value);
}
/** The tick pushed to the renderer price scale (chart.renderer.setPricePrecision). The vela axis is exact only for Default and 1 to 8
 * decimals: it shows 2 decimals for a tick of 1 (Integer), caps at 8 decimals (9 to 15), and prints a 1/N tick without rounding to
 * 1/N. For those values nothing is pushed; the axis tick labels follow the stored value through precisionAxisTicks,
 * and the crosshair and last price chips through LV's runtime seams (precision-crosshair.ts, appearance-painters.ts
 * chipRelabel); the renderer's own data window still uses its decimals. The legend
 * and the data window follow the stored value exactly. The renderer also reads this tick for drawing anchor price fields,
 * its own data window and the last price chip; for 1 to 8 decimals that is accepted on purpose (display only; drawing snap, paper
 * tick validation and alert rounding use the instrument tick size and are untouched). */
export function precisionMintick(precision:string|undefined):number|undefined{
 if(precision===undefined||precision==='default')return undefined;
 if(precision==='integer'||FRACTION.test(precision))return undefined;
 if(DECIMAL.test(precision))return Number(precision)<=AXIS_DECIMAL_LIMIT?Number('1e-'+precision):undefined;
 return unknown(precision);
}
export const AXIS_DECIMAL_LIMIT=8;
/** True when the price scale labels match formatWithPrecision for this value. */
export function precisionAxisExact(precision:string|undefined):boolean{
 if(precision===undefined||precision==='default')return true;
 return DECIMAL.test(precision)&&Number(precision)<=AXIS_DECIMAL_LIMIT;
}
/** Precision for spreads and other derived values: decimals that
 * show a derived value to at least 5 significant digits, max(4, 4 - floor(log10|value|)) capped at 8. 0.0421 shows as
 * 0.042123, 1.2345 as 1.2345, 25.5 as 25.5000. Zero and non-finite values take 4. The instrument tick stays
 * SYMBOL_MATH_TICK_SIZE (the instrument depends on the expression only); the status line uses these decimals (status-line-model.ts statusLinePriceFormat). */
export function derivedPriceDecimals(value:number):number{
 if(!Number.isFinite(value)||value===0)return 4;
 return Math.min(8,Math.max(4,4-Math.floor(Math.log10(Math.abs(value)))));
}
/** The pane facts a price axis tick hook reads (the renderer's PriceAxisTickContext, structurally). */
export interface PrecisionAxisTickContext{pane:{kind:string};mode:string;defaults:readonly {price:number;label:string;major?:boolean}[]}
export type PrecisionAxisTicks=(context:PrecisionAxisTickContext)=>{price:number;label:string;major?:boolean}[]|null;
/** The price scale tick labels for the values the renderer axis cannot print itself (Integer, 9 to 15
 * decimals, 1/N). Through the renderer's public priceAxisTicks feature the main price pane's ticks (price mode) are moved to the
 * nearest multiple of the precision step (1, 1e-N or 1/N; duplicates dropped) and labelled with formatWithPrecision, so the axis
 * reads like the legend. Study panes and percent/indexed modes keep the built-in ticks. Default and 1 to 8 decimals return null:
 * the renderer already prints them through precisionMintick. The crosshair and last price chips follow through their own seams. */
export function precisionAxisTicks(precision:string|undefined):PrecisionAxisTicks|null{
 if(precision===undefined||precision==='default'||precisionAxisExact(precision))return null;
 const fraction=FRACTION.exec(precision);
 if(precision!=='integer'&&!DECIMAL.test(precision)&&!fraction)unknown(precision);
 const unit=precision==='integer'?new Dec(1):fraction?new Dec(1).div(Number(fraction[1])):new Dec(10).pow(-Number(precision));
 return context=>{
  if(context.pane.kind!=='price'||context.mode!=='price')return null;
  const seen=new Set<string>(),out:{price:number;label:string;major?:boolean}[]=[];
  for(const tick of context.defaults){
   if(!Number.isFinite(tick.price))continue;
   const price=new Dec(tick.price).div(unit).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).mul(unit).toNumber(),label=formatWithPrecision(price,precision);
   if(seen.has(label))continue;seen.add(label);out.push(tick.major===undefined?{price,label}:{price,label,major:tick.major});
  }
  return out;
 };
}
