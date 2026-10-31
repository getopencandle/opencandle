import type {Bar} from './types';

/**
 * The second series of a two-symbol indicator (Correlation coefficient, Relative strength, Spread).
 *
 * The application installs one loader (setSecondSymbolLoader). It opens the series through the same loaders as a chart
 * (an Alpaca or Coinbase live feed, an import, or a symbol math expression) at the chart's interval, and calls
 * `notifySecondSymbols` when a series arrives or changes, so indicators that read it recalculate. Calculations only
 * read: a lookup of a series that is not open yet asks the loader to open it and reports "loading" now.
 * Without a loader (tests, a secondary window) every lookup is unavailable with a plain message.
 */
export interface SecondSeries {bars:readonly Bar[]|null;state:'ready'|'loading'|'unavailable';message:string|null;
 /** The series is a live feed (its last bar may be forming); absent = unknown, treated as not live. */
 live?:boolean;
 /** The time of the live feed's forming bar; null or absent = none. */
 formingTime?:number|null}
export interface SecondSymbolLoader {series(symbol:string,resolution:string):SecondSeries;
 /** An alert lookup. It opens the feed like a script request (never superseded by typing) and reports
  *  live and forming facts; absent = `series`. */
 alertSeries?(symbol:string,resolution:string):SecondSeries}
let loader:SecondSymbolLoader|null=null;
/** How long an alert lookup keeps its feed open without another lookup (as script leases). */
export const ALERT_SECOND_SYMBOL_LEASE_MS=120000;
const alertLeases=new Map<string,number>();
/** The second series for an alert evaluation (chart or background): the application loader, with a lease on the feed key
 *  (`<symbol>\0<resolution>`) renewed on every lookup. Without a loader the series is unavailable with a plain message. */
export function alertSecondSymbolSeries(symbol:string,resolution:string|null|undefined,now=Date.now()):SecondSeries{
 const text=String(symbol??'').trim().toUpperCase();
 if(!text)return{bars:null,state:'unavailable',message:'Enter a symbol.'};
 if(typeof resolution!=='string'||!resolution)return{bars:null,state:'unavailable',message:'The alert interval is unknown, so the second symbol cannot be loaded.'};
 if(!loader)return{bars:null,state:'unavailable',message:`${text} is not loaded. Second symbols load in the main chart window.`};
 const key=text+'\u0000'+resolution;alertLeases.delete(key);alertLeases.set(key,now);while(alertLeases.size>64)alertLeases.delete(alertLeases.keys().next().value!);
 try{return (loader.alertSeries??loader.series).call(loader,text,resolution);}catch(error){return{bars:null,state:'unavailable',message:error instanceof Error?error.message:String(error)};}
}
/** Feed keys an alert looked up within ALERT_SECOND_SYMBOL_LEASE_MS; expired leases are dropped. */
export function leasedAlertSecondSymbolKeys(now=Date.now()):Set<string>{const keys=new Set<string>();for(const [key,at] of [...alertLeases]){if(now-at<ALERT_SECOND_SYMBOL_LEASE_MS)keys.add(key);else alertLeases.delete(key);}return keys;}
const listeners=new Set<()=>void>();
export function setSecondSymbolLoader(next:SecondSymbolLoader|null):void{loader=next;notifySecondSymbols();}
export function secondSymbolSeries(symbol:string,resolution:string|null|undefined):SecondSeries{
 const text=String(symbol??'').trim().toUpperCase();
 if(!text)return{bars:null,state:'unavailable',message:'Enter a symbol.'};
 if(typeof resolution!=='string'||!resolution)return{bars:null,state:'unavailable',message:'The chart interval is unknown, so the second symbol cannot be loaded.'};
 if(!loader)return{bars:null,state:'unavailable',message:`${text} is not loaded. Second symbols load in the main chart window.`};
 try{return loader.series(text,resolution);}catch(error){return{bars:null,state:'unavailable',message:error instanceof Error?error.message:String(error)};}
}
export function subscribeSecondSymbols(listener:()=>void):()=>void{listeners.add(listener);return()=>{listeners.delete(listener);};}
export function notifySecondSymbols():void{for(const listener of [...listeners]){try{listener();}catch{/* one failure never stops the others */}}}

/** The second series' closes on the chart's bar times (exact times only; null where it has no bar). */
export function alignSecondCloses(chart:readonly Bar[],second:readonly Bar[]):(number|null)[]{
 const byTime=new Map<number,number>();for(const bar of second)if(bar&&Number.isFinite(bar.close))byTime.set(bar.time,bar.close);
 return chart.map(bar=>byTime.get(bar.time)??null);
}
