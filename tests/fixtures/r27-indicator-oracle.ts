// test oracle: kernels of src/domain/indicators.ts exactly as they were before (copied verbatim from the
// pre-lane tree). The rewritten steppers and the incremental engine must reproduce them value for value. Not product code.
import type { Bar, NumericSeries, PriceSource } from '../../src/domain/types';
type Values = readonly (number | null)[];
const finite = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);
function length(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100000) throw new RangeError('Length must be an integer from 1 to 100000.');
  return value;
}

function scaledSourceAverage(values:readonly number[],ordinary:number):number{
 if(!values.every(finite))return ordinary;
 const scale=Math.max(...values.map(Math.abs));
 const result=values.reduce((sum,value)=>sum+value/scale,0)/values.length*scale;
 if(!Number.isFinite(result))throw new Error('Source-average arithmetic is unrepresentable; the indicator is unavailable.');
 return result;
}

export function sourceValues(bars: readonly Bar[], source: PriceSource = 'close'): number[] {
 if (!['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'].includes(source)) throw new Error(`Unsupported source: ${source}`);
 return bars.map(bar=>{
  if(source==='hl2'){const h=bar.high,l=bar.low,result=(h+l)/2;return Number.isFinite(result)?result:scaledSourceAverage([h,l],result);}
  if(source==='hlc3'){const h=bar.high,l=bar.low,c=bar.close,result=(h+l+c)/3;return Number.isFinite(result)?result:scaledSourceAverage([h,l,c],result);}
  if(source==='ohlc4'){const o=bar.open,h=bar.high,l=bar.low,c=bar.close,result=(o+h+l+c)/4;return Number.isFinite(result)?result:scaledSourceAverage([o,h,l,c],result);}
  return bar[source];
 });
}

function twoSum(a:number,b:number):readonly [number,number]|null{
 const sum=a+b;if(!Number.isFinite(sum))return null;
 const virtualB=sum-a,error=(a-(sum-virtualB))+(b-virtualB);
 return Number.isFinite(error)?[sum,error]:null;
}

function exactWindowMean(sum:bigint,period:number):number{
 if(sum===0n)return 0;
 const negative=sum<0n,absolute=negative?-sum:sum,denominator=BigInt(period);
 const bits=absolute.toString(2).length;
 if(bits>2115)throw new Error('SMA exact accumulation exceeded its bounded finite-input range.');
 let exponent=bits-denominator.toString(2).length;
 if(exponent>=0?absolute<(denominator<<BigInt(exponent)):(absolute<<BigInt(-exponent))<denominator)exponent--;
 const shift=Math.max(0,exponent-52),divisor=denominator<<BigInt(shift);
 let quotient=absolute/divisor;
 const remainder=absolute%divisor,twice=remainder*2n;
 if(twice>divisor||(twice===divisor&&(quotient&1n)!==0n))quotient++;
 const value=Number(quotient)*2**(shift-1074);
 if(!Number.isFinite(value))throw new Error('SMA exact mean is unrepresentable; the indicator is unavailable.');
 return negative?-value:value;
}

export function sma(values: Values, period: number): NumericSeries {
  length(period);
  if(!Number.isSafeInteger(values.length)||values.length>100000)throw new RangeError('SMA accepts at most 100000 observations.');
  if(period===1)return values.map(value=>finite(value)?value===0?0:value:null);
  let sum=0,correction=0,valid=0,exact:bigint|null=null,view:DataView|undefined;
  const coefficient=(value:number):bigint=>{
   view??=new DataView(new ArrayBuffer(8));view.setFloat64(0,value,false);
   const bits=view.getBigUint64(0,false),exponent=Number((bits>>52n)&0x7ffn);
   const mantissa=(bits&0xfffffffffffffn)|(exponent?0x10000000000000n:0n);
   const integer=mantissa<<BigInt(exponent?exponent-1:0);
   return bits>>63n?-integer:integer;
  };
  const add=(value:number):boolean=>{
   const first=twoSum(sum,value);if(!first)return false;
   const second=twoSum(correction,first[1]);if(!second||second[1]!==0)return false;
   sum=first[0];correction=second[0];return true;
  };
  const initialize=(index:number)=>{
   exact=0n;
   for(let i=Math.max(0,index-period+1);i<=index;i++){const value=values[i];if(finite(value))exact+=coefficient(value);}
  };
  return values.map((value, index) => {
    const old=index>=period?values[index-period]:null;
    if(finite(value))valid++;
    if(finite(old))valid--;
    if(exact!==null){if(finite(value))exact+=coefficient(value);if(finite(old))exact-=coefficient(old);}
    else if((finite(value)&&!add(value))||(finite(old)&&!add(-old)))initialize(index);
    if(index<period-1||valid!==period)return null;
    if(exact===null&&!Number.isFinite(sum+correction))initialize(index);
    return exact===null?(sum+correction)/period:exactWindowMean(exact,period);
  });
}

export function ema(values: Values, period: number): NumericSeries {
  length(period);
  const alpha = 2 / (period + 1);
  let previous: number | null = null;
  return values.map(value => {
    if (!finite(value)) return null;
    previous = previous === null ? value : alpha * value + (1 - alpha) * previous;
    return previous;
  });
}

/** The reference EMA (the reference app EMA 9 on ARM 1D starts on bar 8 at the SMA 9): null until period finite
 * values, seeded by their mean, then the usual recursion; missing values stay null and keep the state. */
export function emaSmaSeed(values: Values, period: number): NumericSeries {
  length(period);
  const alpha = 2 / (period + 1);
  let sum = 0, count = 0, previous: number | null = null;
  return values.map(value => {
    if (!finite(value)) return null;
    if (previous === null) { sum += value; count++; if (count === period) previous = sum / period; return previous; }
    previous = alpha * value + (1 - alpha) * previous;
    return previous;
  });
}
export function rma(values: Values, period: number): NumericSeries {
  length(period);
  let sum = 0, count = 0, previous: number | null = null;
  return values.map(value => {
    if (!finite(value)) return null;
    if (previous === null) {
      sum += value; count++;
      if (count === period) previous = sum / period;
      return previous;
    }
    previous = (previous * (period - 1) + value) / period;
    return previous;
  });
}

export function wma(values: Values, period: number): NumericSeries {
  length(period);
  const denominator = period * (period + 1) / 2;
  return values.map((_, index) => {
    if (index < period - 1) return null;
    let sum = 0;
    for (let k = 0; k < period; k++) { const value = values[index - period + 1 + k]; if (!finite(value)) return null; sum += value * (k + 1); }
    return sum / denominator;
  });
}

export function standardDeviation(values: Values, period: number): NumericSeries {
  length(period);
  return values.map((_, index) => {
    if (index < period - 1) return null;
    const window = values.slice(index - period + 1, index + 1);
    if (!window.every(finite)) return null;
    const origin = window[0] as number;
    let scale=0;
    const meanOffset = (window as number[]).reduce((sum, value) => {const offset=value-origin;scale=Math.max(scale,Math.abs(offset));return sum+offset;}, 0) / period;
    const variance = (window as number[]).reduce((sum, value) => sum + ((value - origin) - meanOffset) ** 2, 0) / period;
    if(!Number.isFinite(meanOffset)||!Number.isFinite(variance))throw new Error('Standard-deviation arithmetic overflowed; the bands are unavailable.');
    if(scale>0&&variance<2**-1022){
      const normalizedMean=(window as number[]).reduce((sum,value)=>sum+(value-origin)/scale,0)/period;
      const normalizedVariance=(window as number[]).reduce((sum,value)=>sum+((value-origin)/scale-normalizedMean)**2,0)/period;
      const deviation=Math.sqrt(normalizedVariance)*scale;
      if(deviation===0)throw new Error('Positive standard deviation underflowed; the bands are unavailable.');
      if(!Number.isFinite(deviation))throw new Error('Standard-deviation arithmetic is unrepresentable; the bands are unavailable.');
      return deviation;
    }
    return Math.sqrt(Math.max(0, variance));
  });
}

export function trueRange(bars: readonly Bar[]): NumericSeries {
  return bars.map((bar, i) => i ? Math.max(bar.high - bar.low, Math.abs(bar.high - bars[i - 1].close), Math.abs(bar.low - bars[i - 1].close)) : bar.high - bar.low);
}

export function stochastic(bars: readonly Bar[], period = 14, smoothK = 3, smoothD = 3) {
  length(period);
  const raw = bars.map((bar, index) => {
    if (index < period - 1) return null;
    let high = -Infinity, low = Infinity;
    for (let i = index - period + 1; i <= index; i++) { high = Math.max(high, bars[i].high); low = Math.min(low, bars[i].low); }
    if(!finite(high)||!finite(low)||!finite(bar.close)||high===low)return null;
    const numerator=bar.close-low,denominator=high-low;
    if(!Number.isFinite(numerator)||!Number.isFinite(denominator))throw new Error('Stochastic range arithmetic overflowed; the indicator is unavailable.');
    const scaled=100*numerator,result=Number.isFinite(scaled)?scaled/denominator:numerator/denominator*100;
    if(!Number.isFinite(result))throw new Error('Stochastic ratio arithmetic is unrepresentable; the indicator is unavailable.');
    return result;
  });
  const k = sma(raw, smoothK), d = sma(k, smoothD);
  return { k, d };
}

export function obv(bars: readonly Bar[]): NumericSeries {
  let accumulator = 0, priorClose: number | null = null;
  return bars.map(bar => {
    if (!finite(bar.close) || !finite(bar.volume) || bar.volume < 0) return null;
    if (priorClose !== null && bar.close > priorClose) accumulator += bar.volume;
    else if (priorClose !== null && bar.close < priorClose) accumulator -= bar.volume;
    priorClose = bar.close;
    return accumulator;
  });
}
