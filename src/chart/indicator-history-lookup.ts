import type {ChartSourceContext} from './source-context';
import type {FinerBarsLookup} from '../domain/volume-profile';
import {parseInterval} from '../domain/intervals';
import {currentScriptRequestResolver} from '../ui/script-requests';

/** A chart-owned request for actual same-symbol history, including equal-interval volume and coarser daily history. */
export function indicatorHistoryLookup(datasetId:string|undefined,resolution:string|null|undefined,onLoading?:()=>void,_resolver?:unknown,requestSource?:ChartSourceContext):FinerBarsLookup|null{
 if(!datasetId||typeof resolution!=='string'||!resolution)return null;
 return interval=>{
  const resolver=currentScriptRequestResolver();if(!resolver)return {state:'unavailable',bars:null,message:null};
  try{
   // The resolver enforces this dataset's instrument/provider identity and source coverage; no cross-symbol fallback.
   const requested=parseInterval(interval).id,series=resolver({id:'indicator-history',symbol:null,interval:requested},{datasetId,resolution,owner:'chart',...(requestSource?{source:requestSource,sessionOverride:requestSource.sessionOverride}:{})});
   if(parseInterval(series.resolution).id!==requested)return {state:'unavailable',bars:null,message:'History at the requested interval is unavailable.'};
   return {state:'ready',bars:series.bars,message:null};
  }catch(cause){
   if(/\bloading\b/i.test(cause instanceof Error?cause.message:String(cause))){onLoading?.();return {state:'loading',bars:null,message:null};}
   return {state:'unavailable',bars:null,message:null};
  }
 };
}
