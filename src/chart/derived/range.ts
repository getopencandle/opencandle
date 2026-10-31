// LV Range bar construction. Inputs and defaults: style.rangeStyle
// (inputs.range 10, phantomBars false, barStyle <RangeBarStyle.Bars>, thinBars true).
// The range is applied in instrument ticks (range * tickSize); the unit is an LV reading, the tick
// size must be explicit, and a missing tick size is a structured unavailable state.
// Construction (LV, OHLC path approximation): a bar completes when its high-low reaches the range;
// the next bar opens at the completing boundary. Between source bars, a gap that would complete the
// forming bar either closes it at its last price and opens a new bar at the gap price (phantom bars
// off) or is walked as a continuous move whose completed bars are marked phantom (phantom bars on).
import type {Bar} from '../../domain/types';
import {canonicalTransformId,derivedBar,ohlcPath,type DerivedBar,type DerivedResult} from './common';

export interface RangeSettings {range:unknown;phantomBars:unknown}
/** A range far smaller than the bars' moves built an unbounded bar list (1R on Coinbase BTC-USD 1D bars is
 * about 8.6 * 10^8 range bars) and the renderer process ran out of memory and crashed. Range bars are now built from the most
 * recent source bars whose moves fit this many range bars; a size that
 * cannot fit even the last source bar is refused with a plain reason. Limit. */
export const RANGE_BARS_MAX=10000;
function travelOf(bar:Bar,from:number):number{let travel=0,last=from;for(const price of ohlcPath(bar)){travel+=Math.abs(price-last);last=price;}return travel;}
/** Upper bound on the range bars `ticks` builds from all of `bars`: the OHLC path travel (gaps included) over the range size. */
export function rangeBarEstimate(bars:readonly Bar[],ticks:number,tick:number):number{
  const size=ticks*tick;if(!(size>0)||!bars.length)return 0;let travel=0;
  bars.forEach((bar,index)=>{travel+=travelOf(bar,index?bars[index-1].close:bar.open);});
  return Math.ceil(travel/size);
}
/** The first source bar the range build uses: 0 when every bar fits RANGE_BARS_MAX, -1 when not even the last bar fits. */
export function rangeStartIndex(bars:readonly Bar[],ticks:number,tick:number):number{
  const size=ticks*tick;if(!(size>0)||!bars.length)return 0;const budget=RANGE_BARS_MAX*size;let travel=0;
  for(let index=bars.length-1;index>=0;index--){travel+=travelOf(bars[index],index?bars[index-1].close:bars[index].open);if(travel>budget)return index===bars.length-1?-1:index+1;}
  return 0;
}
/** Null when `ticks` can be built; otherwise the reason shown in the menu and on the chart. */
export function rangeSizeRefusal(bars:readonly Bar[],ticks:number,tick:number|undefined):string|null{
  if(typeof tick!=='number'||!(tick>0)||!Number.isInteger(ticks)||ticks<1||!bars.length||rangeStartIndex(bars,ticks,tick)>=0)return null;
  const last=bars.slice(-1),fit=Math.max(1,Math.ceil(rangeBarEstimate(last,1,tick)/RANGE_BARS_MAX));
  return `${ticks}R is too small for these bars: one bar alone would build over ${RANGE_BARS_MAX.toLocaleString('en-US')} range bars. Use ${fit}R or larger, or a finer data interval.`;
}
export function rangeBars(bars:readonly Bar[],settings:RangeSettings,context:{tickSize?:number}):DerivedResult{
  const tick=context.tickSize,ticks=Number(settings.range);
  if(typeof tick!=='number'||!Number.isFinite(tick)||tick<=0)return {ok:false,diagnostic:{code:'DERIVED_TICK_SIZE_UNAVAILABLE',feature:'range',message:'Range bars need the instrument tick size.',severity:'unavailable'}};
  if(!Number.isInteger(ticks)||ticks<1)return {ok:false,diagnostic:{code:'DERIVED_SETTING_INVALID',feature:'range',message:'Range must be a positive whole number of ticks.',severity:'unavailable'}};
  if(!bars.length)return {ok:false,diagnostic:{code:'DERIVED_INPUT_EMPTY',feature:'range',message:'No source bars are available for this chart type.',severity:'unavailable'}};
  const refusal=rangeSizeRefusal(bars,ticks,tick);
  if(refusal)return {ok:false,diagnostic:{code:'DERIVED_OUTPUT_LIMIT',feature:'range',message:refusal,severity:'unavailable'}};
  const first=rangeStartIndex(bars,ticks,tick),size=ticks*tick,reach=size*(1-1e-12),phantom=settings.phantomBars===true,confirmed:DerivedBar[]=[];
  let open=bars[first].open,high=open,low=open,close=open,start=first,lastIndex=first;
  const begin=(price:number,index:number)=>{open=high=low=close=price;start=index;};
  const walk=(price:number,index:number,gap:boolean)=>{
    for(;;){
      if(price>=low+reach){const end=low+size;confirmed.push(derivedBar(bars[index].time,open,end,end,low,[start,index],{phantom:gap,confirmedAt:index}));begin(end,index);continue;}
      if(price<=high-reach){const end=high-size;confirmed.push(derivedBar(bars[index].time,open,end,high,end,[start,index],{phantom:gap,confirmedAt:index}));begin(end,index);continue;}
      break;
    }
    high=Math.max(high,price);low=Math.min(low,price);close=price;lastIndex=index;
  };
  bars.forEach((bar,index)=>{
    if(index<first)return;
    const path=ohlcPath(bar);
    if(index>first){
      const gapPrice=path[0];
      if(!phantom&&(gapPrice>=low+reach||gapPrice<=high-reach)){confirmed.push(derivedBar(bars[index].time,open,close,high,low,[start,lastIndex],{phantom:false,confirmedAt:index}));begin(gapPrice,index);lastIndex=index;}
      else walk(gapPrice,index,phantom);
    }
    for(const price of index>first?path.slice(1):path)walk(price,index,false);
  });
  const end=bars.length-1;
  const projection=[derivedBar(bars[end].time,open,close,high,low,[start,end],{projection:true,phantom:false})];
  return {ok:true,value:{style:'range',transformId:canonicalTransformId('range',{size,phantom}),confirmed,projection,step:size,construction:'ohlc-path-approximation'}};
}
