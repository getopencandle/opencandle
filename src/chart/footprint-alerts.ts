// The Volume footprint alert sources a footprint chart offers (src/domain/alert-footprint.ts). The row
// size is the chart's current one (Auto or Ticks per row), frozen into each source with the imbalance settings.
import {footprintRowSize} from '../domain/footprint';
import {footprintAlertInputs,footprintAlertSource,footprintAlertSourceLabel,isFootprintSignalMetric,FOOTPRINT_ALERT_METRICS,type FootprintAlertSource} from '../domain/alert-footprint';
import {FOOTPRINT_LV_DEFAULTS} from './footprint';

export interface FootprintAlertChoice {id:string;label:string;source:FootprintAlertSource|null;signal:boolean;disabledReason?:string}
type Ohlcv={open:number;high:number;low:number;close:number;volume?:number};
export function footprintAlertChoices(bars:readonly Ohlcv[],settings:Record<string,unknown>,tickSize:number|null):FootprintAlertChoice[]{
 const values={...FOOTPRINT_LV_DEFAULTS,...settings};
 const hasVolume=bars.some(bar=>typeof bar.volume==='number'&&Number.isFinite(bar.volume)&&bar.volume>0);
 const size=bars.length?footprintRowSize(bars,values,tickSize):{rowSize:null,note:null};
 const reason=!bars.length?'The chart has no bars yet.':!hasVolume?'Volume footprint alerts need bar volume, which this source does not have.':size.rowSize===null?'The footprint row size is not available for these bars.':null;
 return FOOTPRINT_ALERT_METRICS.map(metric=>{
  const id=`footprint:${metric}`,label=footprintAlertSourceLabel({metric}),signal=isFootprintSignalMetric(metric);
  if(reason)return {id,label,source:null,signal,disabledReason:reason};
  try{return {id,label,source:footprintAlertSource(metric,footprintAlertInputs(values,size.rowSize!)),signal};}
  catch(error){return {id,label,source:null,signal,disabledReason:error instanceof Error?error.message:String(error)};}
 });
}
