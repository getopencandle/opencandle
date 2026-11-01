// The chart menu's "Table view".
// The table is the Data window laid out by bar: the same series rows
// and the same value formatting (data-window-model.ts) for every bar, newest first, with one column per indicator plot that
// the Data window shows. Columns, order and paging are our own choice.
import {formatChange,formatDataWindowDate,formatDataWindowTime,formatPrice,indicatorPlotTextAt,formatVolume,type DataWindowIndicatorInput,type DataWindowSeriesInput} from './data-window-model';
import {indicatorAcronyms} from './indicator-dialog-model';
import {parseInterval} from '../domain/intervals';
import type {Bar} from '../domain/types';

export interface TableViewColumn{key:string;label:string;color?:string}
export interface TableViewRow{key:string;time:number;cells:string[]}
export interface TableView{columns:TableViewColumn[];rows:TableViewRow[];total:number}
export const TABLE_VIEW_PAGE=200;
/**
 * The date (and time) text of each bar, as formatDataWindowDate / formatDataWindowTime give it, without formatting every
 * bar: zone offsets are whole quarter hours and change only on a quarter hour (UTC), so inside one UTC quarter hour the
 * local date is constant and the local time is the quarter's start plus whole minutes. One quarter is formatted and its
 * bars reuse it; a quarter whose local start is not on a quarter hour (an old local mean time) formats each bar itself.
 */
export function tableViewTimeText(timezone:string,withTime:boolean):(seconds:number)=>string{
 const direct=(seconds:number)=>formatDataWindowDate(seconds,timezone)+(withTime?' '+formatDataWindowTime(seconds,timezone):'');
 const quarters=new Map<number,{date:string;hour:string;minute:number}|null>();
 return seconds=>{
  if(!Number.isFinite(seconds))return direct(seconds);
  const start=Math.floor(seconds/900)*900;let quarter=quarters.get(start);
  if(quarter===undefined){
   const date=formatDataWindowDate(start,timezone),match=/^(\d{2}):(\d{2})$/.exec(withTime?formatDataWindowTime(start,timezone):'00:00');
   quarter=match&&Number(match[2])%15===0?{date,hour:match[1],minute:Number(match[2])}:null;quarters.set(start,quarter);
  }
  if(!quarter)return direct(seconds);if(!withTime)return quarter.date;
  return quarter.date+' '+quarter.hour+':'+String(quarter.minute+Math.floor((seconds-start)/60)).padStart(2,'0');
 };
}
function intraday(interval:string):boolean{try{const unit=parseInterval(interval).unit;return unit==='minute'||unit==='second'||unit==='tick'||unit==='range';}catch{return false;}}
export interface TableViewModel{columns:TableViewColumn[];total:number;
 /** Rows shown: the newest `limit` bars (or all of them). */
 count:number;
 /** Row `i` (0 = the newest bar), formatted on first use and kept. */
 row(i:number):TableViewRow}
/** The table without formatting any row up front: the dialog formats only the rows on screen, so a long table (Show more up
 *  to every bar) stays responsive while live bars arrive. */
export function tableViewModel(input:{series:DataWindowSeriesInput;bars:readonly Bar[];timezone:string;indicators:readonly DataWindowIndicatorInput[];limit?:number}):TableViewModel{
 const {series,bars}=input,limit=Math.max(1,Math.floor(input.limit??TABLE_VIEW_PAGE)),withTime=intraday(series.interval);
 const studies=input.indicators.filter(study=>study.visible).map(study=>({study,plots:study.plots.filter(plot=>plot.dataWindow)})).filter(entry=>entry.plots.length>0);
 const columns:TableViewColumn[]=[{key:'date',label:withTime?'Date and time':'Date'},{key:'open',label:'Open'},{key:'high',label:'High'},{key:'low',label:'Low'},{key:'close',label:'Close'},{key:'change',label:'Change'},{key:'vol',label:'Vol'}];
 for(const {study,plots} of studies){const acronym=indicatorAcronyms[study.kind]??study.kind;for(const plot of plots)columns.push({key:study.id+':'+plot.id,label:plot.label&&plot.label!==acronym?acronym+' '+plot.label:acronym,color:plot.color});}
 const timeText=tableViewTimeText(input.timezone,withTime),readings=studies.map(({study,plots})=>plots.map(plot=>({values:plot.values,reading:{...study,plot:plot.id}}))).flat(),made=new Map<number,TableViewRow>();
 const count=Math.min(limit,bars.length);
 const row=(i:number):TableViewRow=>{
  let hit=made.get(i);if(hit)return hit;
  const index=bars.length-1-i,bar=bars[index]!,previous=index>0?bars[index-1]:undefined;
  const cells=[timeText(bar.time),formatPrice(bar.open,series.tickSize),formatPrice(bar.high,series.tickSize),formatPrice(bar.low,series.tickSize),formatPrice(bar.close,series.tickSize),formatChange(bar.close,previous?.close,series.tickSize),formatVolume(bar.volume)];
  // The shared reader of the data window and the legend (display offset, precision, tick size).
  for(const {values,reading} of readings)cells.push(indicatorPlotTextAt(values,index,reading,series.tickSize));
  hit={key:String(bar.time),time:bar.time,cells};made.set(i,hit);return hit;
 };
 return{columns,total:bars.length,count,row};
}
export function buildTableView(input:{series:DataWindowSeriesInput;bars:readonly Bar[];timezone:string;indicators:readonly DataWindowIndicatorInput[];limit?:number}):TableView{
 const model=tableViewModel(input);
 return{columns:model.columns,rows:Array.from({length:model.count},(_,i)=>model.row(i)),total:model.total};
}
