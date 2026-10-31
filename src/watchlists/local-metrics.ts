import type {Bar} from '../domain/types';

/**
 * OpenCandle's own definitions of the Advanced View performance, volatility, momentum and beta metrics
 * They are formulas over imported daily bars, not reference or vendor values,
 * and the cell tooltip says so. Pure functions: bars in, a number or an honest reason out.
 */
export const LV_METRIC_LABEL='OpenCandle calculation from imported daily bars';
export type PerformancePeriod='week'|'month'|'threeMonths'|'ytd'|'year'|'fiveYears'|'allTime';
export type VolatilityWindow='1d'|'1w'|'1m';
export interface MetricResult {value:number|null;reason:string}
const none=(reason:string):MetricResult=>({value:null,reason});
const ok=(value:number):MetricResult=>Number.isFinite(value)?{value,reason:''}:none('The result is not a finite number.');
const dayOf=(seconds:number)=>Math.floor(seconds/86400);
const daysInMonth=(year:number,month:number)=>new Date(Date.UTC(year,month+1,0)).getUTCDate();
/** Same calendar date `months` earlier; month arithmetic clamps to the last day of that month. */
function monthsBefore(day:number,months:number):number{const date=new Date(day*86400000),total=date.getUTCFullYear()*12+date.getUTCMonth()-months,year=Math.floor(total/12),month=total-year*12;return Date.UTC(year,month,Math.min(date.getUTCDate(),daysInMonth(year,month)))/86400000;}
const MONTHS:Partial<Record<PerformancePeriod,number>>={month:1,threeMonths:3,year:12,fiveYears:60};
/** (close_last / close_base - 1) * 100. close_base is the close of the last bar on or before the base date. */
export function performanceMetric(bars:readonly Bar[],period:PerformancePeriod,options:{firstBarIsListingStart:boolean}):MetricResult{
 if(bars.length<2)return none('At least two daily bars are needed.');
 const last=bars.at(-1)!,first=bars[0],lastDay=dayOf(last.time);
 let base:Bar|undefined;
 if(period==='allTime'){if(!options.firstBarIsListingStart)return none('The dataset does not declare that its first bar is the listing start.');base=first;}
 else if(period==='ytd'){const year=new Date(last.time*1000).getUTCFullYear(),cutoff=Date.UTC(year,0,1)/1000;for(let i=bars.length-1;i>=0;i--)if(bars[i].time<cutoff){base=bars[i];break;}if(!base)return none('No bar from the previous calendar year is available.');}
 else{
  const target=period==='week'?lastDay-7:monthsBefore(lastDay,MONTHS[period]!);
  if(dayOf(first.time)>target)return none('The series does not reach the base date.');
  for(let i=bars.length-1;i>=0;i--)if(dayOf(bars[i].time)<=target){base=bars[i];break;}
 }
 if(!base||!Number.isFinite(base.close)||base.close<=0||!Number.isFinite(last.close))return none('The base close is missing or not positive.');
 return ok((last.close/base.close-1)*100);
}
/** 1D: (high - low) / close * 100 of the last daily bar. 1W and 1M: population standard deviation of the last 5 or 21 daily log returns, times 100. */
export function volatilityMetric(bars:readonly Bar[],window:VolatilityWindow):MetricResult{
 const last=bars.at(-1);if(!last)return none('No daily bars are available.');
 if(window==='1d'){if(!(last.close>0)||!Number.isFinite(last.high)||!Number.isFinite(last.low))return none('The last bar needs a positive close and a high and low.');return ok((last.high-last.low)/last.close*100);}
 const count=window==='1w'?5:21;if(bars.length<count+1)return none('At least '+(count+1)+' daily bars are needed.');
 const slice=bars.slice(-(count+1)),returns:number[]=[];
 for(let i=1;i<slice.length;i++){if(!(slice[i].close>0)||!(slice[i-1].close>0))return none('Log returns need positive closes.');returns.push(Math.log(slice[i].close/slice[i-1].close));}
 const mean=returns.reduce((sum,value)=>sum+value,0)/count,variance=returns.reduce((sum,value)=>sum+(value-mean)*(value-mean),0)/count;
 return ok(Math.sqrt(variance)*100);
}
/** close_last - close_10_bars_ago, in currency per share. */
export function momentumMetric(bars:readonly Bar[]):MetricResult{if(bars.length<11)return none('At least eleven daily bars are needed.');return ok(bars.at(-1)!.close-bars.at(-11)!.close);}
export const BETA_RETURNS={beta1y:252,beta3y:756,beta5y:1260} as const;
/**
 * cov(r_s, r_b) / var(r_b) over the subject's last `returns` daily simple returns whose two dates both carry a benchmark bar.
 * At least 80 percent of those returns must be shared, otherwise the beta is unavailable.
 */
export function betaMetric(subject:readonly Bar[],benchmark:readonly Bar[],returns:number):MetricResult{
 if(subject.length<returns+1)return none('At least '+(returns+1)+' daily bars are needed.');
 const closeByDay=new Map<number,number>();for(const bar of benchmark)closeByDay.set(dayOf(bar.time),bar.close);
 const window=subject.slice(-(returns+1)),s:number[]=[],b:number[]=[];
 for(let i=1;i<window.length;i++){const before=closeByDay.get(dayOf(window[i-1].time)),after=closeByDay.get(dayOf(window[i].time));if(before===undefined||after===undefined||!(before>0)||!(window[i-1].close>0))continue;s.push(window[i].close/window[i-1].close-1);b.push(after/before-1);}
 if(s.length<Math.ceil(returns*0.8))return none('The benchmark shares fewer than 80 percent of the return dates.');
 const n=s.length,meanS=s.reduce((a,v)=>a+v,0)/n,meanB=b.reduce((a,v)=>a+v,0)/n;let cov=0,variance=0;
 for(let i=0;i<n;i++){cov+=(b[i]-meanB)*(s[i]-meanS);variance+=(b[i]-meanB)*(b[i]-meanB);}
 if(!(variance>1e-18))return none('The benchmark does not vary over the window.');
 return ok(cov/variance);
}
