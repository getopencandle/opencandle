/**
 * VWAP Standard Deviation bands (the VWAP "Bands Calculation Mode" option next to Percentage).
 *
 * Deviation (our own choice among the published forms): the
 * volume-weighted population standard deviation of the source price around its anchored VWAP,
 *   sd = sqrt(sum(v x (p - mean)^2) / sum(v)),
 * restarted at every anchor, the same period the VWAP itself uses. Band k = VWAP +/- multiplier_k x sd. It is updated with
 * D. H. D. West's weighted incremental algorithm (Communications of the ACM 22(9), 1979), which avoids the cancellation of
 * the sum(v p^2) / sum(v) - mean^2 form. The bands are centered on the plotted VWAP of the kernel in use.
 */
export const VWAP_BAND_MODES=['Percentage','Standard Deviation'] as const;
export type VwapBandMode=typeof VWAP_BAND_MODES[number];
export const isVwapBandMode=(value:unknown):value is VwapBandMode=>(VWAP_BAND_MODES as readonly unknown[]).includes(value);
export const VWAP_STDEV_POLICY='Standard Deviation bands use the volume-weighted population deviation of the source around the anchored VWAP (West\'s weighted update), restarted with the anchor. A bar with no volume yet in its anchor period has no band.';

export interface VwapDeviationAccumulator {
 /** One bar. `reset` starts a new anchor period first. Returns the deviation, or null while the period has no volume
  *  or when the price or volume is unusable (that bar is skipped and the period continues). */
 push(price:number,volume:number,reset:boolean):number|null;
}
export function createVwapDeviationAccumulator():VwapDeviationAccumulator{
 let weight=0,mean=0,squares=0;
 return {push(price,volume,reset){
  if(reset){weight=0;mean=0;squares=0;}
  if(!Number.isFinite(price)||!Number.isFinite(volume)||volume<0)return null;
  if(volume>0){
   const total=weight+volume,delta=price-mean,step=delta*volume/total;
   mean+=step;squares+=weight*delta*step;weight=total;
   if(!Number.isFinite(mean)||!Number.isFinite(squares))throw new Error('VWAP standard deviation arithmetic overflowed; the bands are unavailable.');
  }
  return weight>0?Math.sqrt(Math.max(0,squares/weight)):null;
 }};
}

/** The deviation series of the inline kernel: same prices, volumes and anchor keys as `vwap()`. */
export function vwapDeviationSeries(prices:readonly (number|null)[],volumes:readonly (number|null)[],keys:readonly string[]):(number|null)[]{
 if(prices.length!==volumes.length||keys.length!==prices.length)throw new Error('VWAP deviation inputs must match the bar count.');
 const accumulator=createVwapDeviationAccumulator();let last:string|undefined;
 return prices.map((price,i)=>{const key=keys[i],reset=key!==last;last=key;return accumulator.push(price??NaN,volumes[i]??NaN,reset);});
}

/** Plain binary64 source price of the worker kernel's (possibly transformed) bar. */
export function vwapSourcePrice(source:string,open:number,high:number,low:number,close:number):number{
 switch(source){
  case 'open':return open;case 'high':return high;case 'low':return low;case 'close':return close;
  case 'hl2':return (high+low)/2;case 'hlc3':return (high+low+close)/3;case 'ohlc4':return (open+high+low+close)/4;
  default:throw new Error(`Unsupported source: ${source}`);
 }
}

/** VWAP +/- multiplier x deviation; null when the deviation is unavailable. Throws on an unrepresentable boundary. */
export function vwapDeviationBounds(base:number,deviation:number|null|undefined,multiplier:number):{upper:number;lower:number}|null{
 if(!Number.isFinite(base)||!Number.isFinite(multiplier)||multiplier<0||multiplier>100000)throw new Error('VWAP standard deviation bands require a finite base and a multiplier from 0 through 100000.');
 if(typeof deviation!=='number'||!Number.isFinite(deviation))return null;
 const distance=multiplier*deviation,upper=base+distance,lower=base-distance;
 if(!Number.isFinite(upper)||!Number.isFinite(lower))throw new Error('VWAP standard deviation boundary overflowed and is not representable.');
 return {upper,lower};
}
