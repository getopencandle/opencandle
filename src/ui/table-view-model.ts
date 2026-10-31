// The chart menu's "Table view".
// The table is the Data window laid out by bar: the same series rows
// and the same value formatting (data-window-model.ts) for every bar, newest first, with one column per indicator plot that
// the Data window shows. Columns, order and paging are our own choice.
import {formatChange,formatDataWindowDate,formatDataWindowTime,formatIndicatorValue,formatPrice,formatVolume,type DataWindowIndicatorInput,type DataWindowSeriesInput} from './data-window-model';
import {indicatorAcronyms} from './indicator-dialog-model';
import {parseInterval} from '../domain/intervals';
import type {Bar} from '../domain/types';

export interface TableViewColumn{key:string;label:string;color?:string}
export interface TableViewRow{key:string;time:number;cells:string[]}
export interface TableView{columns:TableViewColumn[];rows:TableViewRow[];total:number}
export const TABLE_VIEW_PAGE=200;
function intraday(interval:string):boolean{try{const unit=parseInterval(interval).unit;return unit==='minute'||unit==='second'||unit==='tick'||unit==='range';}catch{return false;}}
export function buildTableView(input:{series:DataWindowSeriesInput;bars:readonly Bar[];timezone:string;indicators:readonly DataWindowIndicatorInput[];limit?:number}):TableView{
 const {series,bars}=input,limit=Math.max(1,Math.floor(input.limit??TABLE_VIEW_PAGE)),withTime=intraday(series.interval);
 const studies=input.indicators.filter(study=>study.visible).map(study=>({study,offset:Number.isSafeInteger(study.offset)?study.offset:0,plots:study.plots.filter(plot=>plot.dataWindow)})).filter(entry=>entry.plots.length>0);
 const columns:TableViewColumn[]=[{key:'date',label:withTime?'Date and time':'Date'},{key:'open',label:'Open'},{key:'high',label:'High'},{key:'low',label:'Low'},{key:'close',label:'Close'},{key:'change',label:'Change'},{key:'vol',label:'Vol'}];
 for(const {study,plots} of studies){const acronym=indicatorAcronyms[study.kind]??study.kind;for(const plot of plots)columns.push({key:study.id+':'+plot.id,label:plot.label&&plot.label!==acronym?acronym+' '+plot.label:acronym,color:plot.color});}
 const rows:TableViewRow[]=[];
 for(let index=bars.length-1;index>=0&&rows.length<limit;index--){
  const bar=bars[index]!,previous=index>0?bars[index-1]:undefined;
  const cells=[formatDataWindowDate(bar.time,input.timezone)+(withTime?' '+formatDataWindowTime(bar.time,input.timezone):''),formatPrice(bar.open,series.tickSize),formatPrice(bar.high,series.tickSize),formatPrice(bar.low,series.tickSize),formatPrice(bar.close,series.tickSize),formatChange(bar.close,previous?.close,series.tickSize),formatVolume(bar.volume)];
  for(const {study,offset,plots} of studies)for(const plot of plots){const source=index-offset,raw=source>=0&&source<plot.values.length?plot.values[source]:null;cells.push(formatIndicatorValue(raw,study.kind,study.precision,series.tickSize));}
  rows.push({key:String(bar.time),time:bar.time,cells});
 }
 return{columns,rows,total:bars.length};
}
