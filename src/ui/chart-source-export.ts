import type {ChartInputSnapshot} from '../chart/input-visibility';
import {validatedChartCsvColumns,type ChartCsvColumn} from '../chart/chart-csv-capture';
import {validateChartSourceBasisIdentity,type ChartSourceContext} from '../chart/source-context';
import {providerTermsApply} from '../domain/provider-capabilities';
import {personalUseNote} from '../domain/live-provider';
import {CHART_CSV_LIMIT as LIMIT,chartCsvBytes,chartCsvTextCell as textCell,chartCsvSourceRow,chartCsvSourceValues,validateChartCsvSourceRow,prepareChartCsvSource} from '../chart/chart-csv-source';

/** A suggested filename is a local label; the export metadata retains the exact symbol. */
export function chartExportBasename(symbol:string,fixture:boolean):string{
 const stem=symbol.replace(/[^A-Za-z0-9 _.-]+/g,'_').replace(/\.{2,}/g,'_').replace(/^[ .]+|[ .]+$/g,'').slice(0,70).replace(/[ .]+$/g,'')||'OpenCandle';
 return stem+(fixture?'-SYNTHETIC':'-LOCAL');
}
/** The provider label whose terms apply to an exported chart source (live, FRED or licensed history), or null for
 *  SYNTHETIC, local and derived data. basis[8] is the provider id. */
export function chartSourceTermsLabel(source:ChartSourceContext):string|null{
 let providerId:unknown;try{providerId=JSON.parse(validateChartSourceBasisIdentity(source.basisIdentity))[8];}catch{providerId=undefined;}
 return providerTermsApply({datasetId:source.datasetId,providerId,fixture:source.fixture})?source.label??'':null;
}
/** Status after a chart data file is saved. The CSV columns stay fixed, so the provider terms line for live, FRED or licensed
 *  rows (the source or a comparison or script column) is stated here. */
export function chartCsvSavedMessage(saved:string,source:ChartSourceContext,captured:{omitted?:readonly string[];personalUse?:readonly string[]}):string{
 const main=chartSourceTermsLabel(source),names=[...new Set([...(main===null?[]:[main]),...(captured.personalUse??[])].filter(Boolean))];
 return saved+(captured.omitted?.length?'. Left out (uses additional history): '+captured.omitted.join(', '):'')+(main!==null||captured.personalUse?.length?'. '+personalUseNote(names.join(', ')):'');
}
/** Original source OHLCV/provenance stays exact. Optional accepted numerical plots join only on real UTC times. */
export function chartSourceCsv(input:ChartInputSnapshot,executionIdentity:string,plotColumns:readonly ChartCsvColumn[]=[],assertCurrent:()=>void=()=>{}):string{
 assertCurrent();
 const {metadata,metadataBytes,header:sourceHeader}=prepareChartCsvSource(input,executionIdentity);
 const plots=validatedChartCsvColumns(plotColumns),positions=plots.map(()=>0),header=[sourceHeader];let bytes=chartCsvBytes(header[0])+2;
 for(const plot of plots){const cell=','+textCell(plot.label);bytes+=chartCsvBytes(cell);if(bytes>LIMIT)throw new Error('Source CSV exceeds the 20 MiB UTF-8 export limit. Choose fewer loaded plots.');header.push(cell);}
 const rows=[header.join('')+'\r\n'];let previous=-Infinity;
 for(let rowIndex=0;rowIndex<input.bars.length;rowIndex++){
  const row=chartCsvSourceRow(input.bars,rowIndex);validateChartCsvSourceRow(row,previous);const time=row[0];previous=time;const values=chartCsvSourceValues(row);bytes+=chartCsvBytes(values)+metadataBytes+3;
  if(bytes>LIMIT)throw new Error('Source CSV exceeds the 20 MiB UTF-8 export limit. Choose a smaller supplied range.');
  const parts=[values+','+metadata];
  for(let index=0;index<plots.length;index++){
   const points=plots[index].points;let at=positions[index];while(at<points.length&&points[at].time<time)at++;positions[index]=at;
   const value=at<points.length&&points[at].time===time?points[at].value:null,cell=','+(value===null?'':String(value));
   bytes+=chartCsvBytes(cell);if(bytes>LIMIT)throw new Error('Source CSV exceeds the 20 MiB UTF-8 export limit. Choose a smaller supplied range or fewer loaded plots.');parts.push(cell);
  }
  rows.push(parts.join('')+'\r\n');
 }
 assertCurrent();return rows.join('');
}
