import {catalogDefinition} from '../domain/indicator-catalog';

/** Original display-only policy. Never round a calculation, alert, or exported raw value. */
export type IndicatorPrecision = 'auto' | number;
export const isIndicatorPrecision=(value:unknown):value is IndicatorPrecision=>value==='auto'||typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=16;

/** Fixed binary64 decimals; large finite numbers use bounded exponential notation. */
export function formatIndicatorNumber(value:number,precision:number):string{
 if(typeof value!=='number'||!Number.isFinite(value))throw Error('Indicator formatting requires a finite numerical value.');
 if(typeof precision!=='number'||!isIndicatorPrecision(precision))throw Error('Indicator precision must be an integer from 0 through 16.');
 let text=Math.abs(value)>=1e21?value.toExponential(precision):value.toFixed(precision);
 if(text.startsWith('-')&&Number(text)===0)text=text.slice(1);
 if(!/[eE]/.test(text)){const [integer,fraction]=text.split('.');text=integer.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction===undefined?'':'.'+fraction);}
 if(text.length>80)throw Error('Indicator display text exceeds its bounded format.');
 return text;
}

/** Display suffix a kind's values carry (a percent format type -> "%"). Display only. */
export function indicatorValueSuffix(kind:string):string{return catalogDefinition(kind)?.valueSuffix??'';}
/** Fixed-decimal text with the kind's display suffix; the stored and calculated numbers are never changed. */
export function formatIndicatorValue(value:number,precision:number,kind:string):string{return formatIndicatorNumber(value,precision)+indicatorValueSuffix(kind);}
