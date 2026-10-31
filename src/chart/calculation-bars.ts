import { chartType } from '@luxalgo/vela';
import type {Bar} from '../domain/types';
import {computeDerived,isDerivedStyle,type DerivedContext,type DerivedResult} from './derived';
import {CHART_TYPES} from './chart-types';
/** User-visible text names the chart type by its label; the diagnostic code stays on the error (diagnosticCode). */
const chartTypeLabel=(style:string)=>CHART_TYPES.find(([id])=>id===style)?.[1]??'This chart type';
// Time price opportunity is time-based and computes on the standard bars (indicators on the underlying OHLC).
// So is Session volume profile (candles with session profiles behind them).
// Volume footprint is time-based too (indicators on the standard bars).
const derivedTypes=new Set(['renko','kagi','pointfigure','linebreak','range']);
/** Before the first DOM chart registers built-ins, use the same documented HA recurrence. */
export function heikinAshiBars(bars:readonly Bar[]):Bar[]{
  const result:Bar[]=[];
  for(const source of bars){const previous=result.at(-1),close=(source.open+source.high+source.low+source.close)/4,open=previous?(previous.open+previous.close)/2:(source.open+source.close)/2;result.push({...source,open,close,high:Math.max(source.high,open,close),low:Math.min(source.low,open,close)});}
  return result;
}
/** Derived calculation inputs need the type's settings (and the instrument tick size for Range). */
export interface DerivedCalculationOptions extends DerivedContext {settings:Record<string,unknown>}
/** Structured derived construction for callers that render the topology (confirmed + projection). */
export function derivedCalculation(bars:readonly Bar[],style:string,options:DerivedCalculationOptions):DerivedResult{
  if(!isDerivedStyle(style))return {ok:false,diagnostic:{code:'DERIVED_STYLE_UNKNOWN',feature:style,message:'This chart type has no derived construction.',severity:'unavailable'}};
  return computeDerived(style,bars,options.settings,options);
}
/**
 * Bars that indicators and scripts compute on. Derived types compute on their CONFIRMED display bars
 * (one row per brick, line, column, segment or range bar, original event time, volume unavailable);
 * projection bars never feed calculations. Without derived options the call still refuses: no
 * standard-bar substitute is ever supplied.
 */
export function calculationBarsForStyle(bars:readonly Bar[],style:string,derived?:DerivedCalculationOptions):Bar[]{
  if(derivedTypes.has(style)){
    if(!derived||!isDerivedStyle(style))throw new Error(`${chartTypeLabel(style)} calculation inputs are unavailable. No standard-bar substitute is supplied.`);
    const result=derivedCalculation(bars,style,derived);
    if(!result.ok)throw Object.assign(new Error(`${chartTypeLabel(style)} calculation inputs are unavailable: ${result.diagnostic.message}`),{diagnosticCode:result.diagnostic.code});
    return result.value.confirmed.map(({time,open,high,low,close,volume})=>({time,open,high,low,close,volume}));
  }
  if(style!=='heikinashi')return bars.map(bar=>({...bar}));
  const registered=chartType('heikinashi')?.barTransform;
  if(registered)return registered.full(bars.map(bar=>({...bar,time:bar.time*1000}))).map(bar=>({...bar,time:bar.time/1000,volume:bar.volume??NaN}));
  return heikinAshiBars(bars);
}
/** Internal cache; callers must clone returned rows before exposing them to consumers. */
export function createCalculationBarCache(calculate=calculationBarsForStyle){
 let input:readonly Bar[]|null=null,style:string|null=null,result:Bar[]=[];
 return (bars:readonly Bar[],nextStyle:string)=>{if(input!==bars||style!==nextStyle){result=calculate(bars,nextStyle);input=bars;style=nextStyle;}return result;};
}
export function calculationTransformId(style:string){return style==='heikinashi'?'heikinashi':isDerivedStyle(style)?style:'standard';}
