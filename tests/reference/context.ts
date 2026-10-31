/** Deterministic chart context for the timing guardrails: a second symbol and finer (6-hour) bars derived from the chart bars. */
import type {Bar} from '../../src/domain/types';
import type {IndicatorCalculationOptions} from '../../src/domain/indicators';
import type {SecondSeries} from '../../src/domain/second-symbol';
import {definitionOf} from './harness';

/** A second instrument on the same timestamps: a smooth deterministic transform, so correlation-type kinds have data. */
export function secondSymbolBars(bars:readonly Bar[]):Bar[]{
 return bars.map((bar,i)=>{const f=1+0.1*Math.sin(i/7);const o=bar.open*f*0.5,c=bar.close*f*0.5,h=Math.max(o,c,bar.high*f*0.5),l=Math.min(o,c,bar.low*f*0.5);return {time:bar.time,open:o,high:h,low:l,close:c,volume:bar.volume+1};});
}
/** Four 6-hour bars per daily bar following open, low, high, close; volume split evenly. */
export function finerBars(bars:readonly Bar[]):Bar[]{
 const out:Bar[]=[];
 for(const bar of bars){const path=[bar.open,bar.low,bar.high,bar.close];
  for(let k=0;k<4;k++){const o=k?path[k-1]:bar.open,c=path[k];out.push({time:bar.time+k*21600,open:o,high:Math.max(o,c),low:Math.min(o,c),close:c,volume:bar.volume/4});}}
 return out;
}
/** Calculation options for `bars` (a daily prefix): every context source is cut at the same prefix, so it never reveals later data. */
export function optionsFor(id:string,bars:readonly Bar[],resolution='1D',calendar:'utc'|'us-equity'='utc'):IndicatorCalculationOptions{
 const definition=definitionOf(id),options:IndicatorCalculationOptions={resolution,calendar};
 if(!definition)return options;
 const last=bars.length?bars[bars.length-1].time:0;
 if(definition.secondSymbol){const second=secondSymbolBars(bars);options.secondSeries=():SecondSeries=>({bars:second,state:'ready',message:null});}
 if(definition.finerBars||definition.profile||definition.dailyHistory){const fine=finerBars(bars).filter(bar=>bar.time<=last+86400);if(definition.profile)options.lowerTimeframe={interval:'6h',bars:fine};
  // Any requested finer interval is answered with the 6-hour bars (each lies inside its chart bar), daily history with the chart bars.
  options.finerBars=interval=>({state:'ready',bars:interval==='1D'?bars:fine,message:null});}
 if(definition.profile||definition.viewport)options.visibleRange={from:bars.length?bars[0].time:0,to:last};
 if(definition.tradingSessions){options.exchangeZone='UTC';options.tickSize=0.01;}
 return options;
}
import type {BarDataset} from '../../src/domain/types';
/** A plain (non-live, non-derived) dataset around fixture bars. */
export function datasetOf(bars:readonly Bar[],resolution:string,options:{id?:string;symbol?:string;timezone?:string;exchange?:string;assetClass?:'stock'|'crypto'}={}):BarDataset{
 const id=options.id??'reference-'+resolution;
 return {instrument:{id:'reference-instrument',symbol:options.symbol??'REF',name:'Reference fixture',exchange:options.exchange??'SYNTHETIC',currency:'USD',assetClass:options.assetClass??'stock',tickSize:0.01,lotSize:1,timezone:options.timezone??'UTC'},
  bars:bars.map(bar=>({...bar})),resolution,
  provenance:{providerId:'reference-fixture',providerName:'Reference fixture',datasetId:id,fixture:true,coverage:'',asOf:0,delaySeconds:null,adjustment:'raw',session:'extended',timezone:options.timezone??'UTC',state:'ready',license:'local',revision:'r1',notes:[]}};
}
