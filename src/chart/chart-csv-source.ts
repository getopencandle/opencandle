import type {ChartInputSnapshot} from './input-visibility';
import {validateChartSourceBasisIdentity} from './source-context';
import {isLiveDatasetId,exportNoticeFor} from '../domain/live-provider';
import {exportRightsRefusal} from '../domain/provider-capabilities';

export const CHART_CSV_LIMIT=20*1024*1024;
export const CHART_SOURCE_CSV_COLUMNS=Object.freeze(['time','open','high','low','close','volume','symbol','exchange','currency','provider','provider_id','dataset_id','resolution','session','adjustment','revision','synthetic','execution','chart_style','data_view']);
const encoder=new TextEncoder();
export const chartCsvBytes=(value:string):number=>encoder.encode(value).length;
/** The existing chart CSV quoted/formula-safe text rule, shared by source cells and appended human headers. */
export function chartCsvTextCell(value:string):string{const safe=/^(?:\s*[=+\-@]|[\t\r\n])/.test(value)?"'"+value:value;return '"'+safe.replaceAll('"','""')+'"';}
export function chartCsvSourceRow(bars:readonly unknown[],index:number):readonly number[]{
 const item=Object.getOwnPropertyDescriptor(bars,String(index));if(!item||!Object.hasOwn(item,'value')||!item.value||typeof item.value!=='object')throw Error('Source CSV contains invalid or unordered OHLCV.');
 const row=item.value;return ['time','open','high','low','close','volume'].map(key=>{const field=Object.getOwnPropertyDescriptor(row,key);if(!field||!Object.hasOwn(field,'value'))throw Error('Source CSV requires own numerical OHLCV data.');return field.value;});
}
export function chartCsvSourceValues(values:readonly number[]):string{return [values[0],values[1],values[2],values[3],values[4],Number.isNaN(values[5])?'':values[5]].join(',');}
export function validateChartCsvSourceRow(values:readonly number[],previous:number):void{
 const [time,open,high,low,close,volume]=values;
 if(!Number.isSafeInteger(time)||time<=previous||![open,high,low,close].every(Number.isFinite)||low>Math.min(open,close)||high<Math.max(open,close)||low>high||!Number.isFinite(volume)&&!Number.isNaN(volume)||volume<0)throw Error('Source CSV contains invalid or unordered OHLCV.');
}
/** Exact base affordability, with one temporary scalar row string at a time and no output or numerical proof allocation. */
export function prepareChartCsvSource(input:ChartInputSnapshot,executionIdentity:string):{metadata:string;metadataBytes:number;baseBytes:number;header:string}{
 if(isLiveDatasetId(input.source?.datasetId))throw Error(exportNoticeFor(input.source?.datasetId));
 if(!Array.isArray(input.bars)||!input.bars.length||input.bars.length>1000000)throw Error('Source CSV requires 1 through 1,000,000 supplied bars.');
 if(typeof executionIdentity!=='string'||!executionIdentity||executionIdentity.length>100000||typeof input.style!=='string'||!input.style||input.style.length>100)throw Error('Source CSV requires a bounded execution identity and chart style.');
 const source=input.source,basis=JSON.parse(validateChartSourceBasisIdentity(source.basisIdentity));
 const refusal=exportRightsRefusal(basis[8],source.fixture);if(refusal)throw Error(refusal);// Export rights gate (basis[8] is the provider id)
 if(source.datasetId!==basis[9]||source.fixture!==basis[17]||typeof source.label!=='string'||source.label.length>4096||typeof source.revision!=='string'||!source.revision||source.revision.length>4096)throw Error('Source CSV metadata disagrees with its declared source basis.');
 const metadata=[basis[2],basis[4],basis[5],source.label,basis[8],basis[9],source.resolution??basis[10],basis[12],basis[11],source.revision,source.fixture?'true':'false',executionIdentity,input.style,'source OHLCV'].map(chartCsvTextCell).join(','),metadataBytes=chartCsvBytes(metadata),header=CHART_SOURCE_CSV_COLUMNS.join(',');
 let baseBytes=header.length+2,previous=-Infinity;
 for(let index=0;index<input.bars.length;index++){
  const values=chartCsvSourceRow(input.bars,index);validateChartCsvSourceRow(values,previous);previous=values[0];baseBytes+=chartCsvSourceValues(values).length+metadataBytes+3;
  if(baseBytes>CHART_CSV_LIMIT)throw Error('Source CSV exceeds the 20 MiB UTF-8 export limit. Choose a smaller supplied range.');
 }
 return {metadata,metadataBytes,baseBytes,header};
}
