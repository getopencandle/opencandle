import {alignOwnedLiveSeasonality} from '../domain/indicators-ext/seasonality-live-input';
import {stableSeriesId,type DrawingBox,type DrawingTable,type TableCell,type LineLikeSeries} from '@luxalgo/vela';
import type {IndicatorInstanceSettings} from './indicator-settings';
import {defaultPlotStyle} from './indicator-rendering';
import type {Bar,NumericSeries} from '../domain/types';
import type {IndicatorResult} from '../domain/indicators';
import type {SeasonalityScene,SeasonalityCell,SeasonalityResult} from '../domain/indicators-ext/seasonality-types';
import type {SeasonalityCalendarContract} from '../domain/indicators-ext/seasonality-months';
import {SEASONALITY_PLOTS} from '../domain/indicators-ext/seasonality-catalog';
import {newYorkClock} from '../domain/us-market-hours';
import {indicatorColorOpacity} from './indicator-opacity';
export interface SeasonalityDisplay {positiveColor:string;negativeColor:string;intensityCutoff:number;tablePosition:'Left'|'Center'|'Right';tableWidth:number;tableHeight:number;meanRow:boolean;deviationRow:boolean;positiveFrequencyRow:boolean;projectionGeometry:boolean}
const alignedResults=new WeakMap<object,{scene:WeakRef<object>;bars:WeakRef<object>;series:object;times:readonly number[]}>();
/** Readonly constructor membership only; source/native permission is independently required by the closed port. */
export function seasonalityAlignedResultMatches(result:IndicatorResult,scene:Readonly<SeasonalityScene>,bars:readonly Bar[]):boolean{const record=alignedResults.get(result);return !!record&&record.scene.deref()===scene&&record.bars.deref()===bars&&record.series===result.series&&result.seasonality===scene;}
const MONTHS=Object.freeze(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']);
const text=(value:number|null,suffix='%')=>value===null?'Unavailable':(Object.is(value,-0)?'0':value.toFixed(2))+suffix;
/** Pure display assembly; only the actual source-owned port can authenticate this result for publication/readout. */
export function seasonalityAlignedResult(scene:Readonly<SeasonalityScene>,bars:readonly Bar[],contract:Pick<SeasonalityCalendarContract,'calendar'|'dateLabels'>):IndicatorResult{
 const byMonth=new Map(scene.projections.map(row=>[row.month,row]));
 const values=Array.from({length:4},()=>Array<number|null>(bars.length).fill(null));
 const times:number[]=[];
 for(let i=0;i<bars.length;i++){
  const field=Object.getOwnPropertyDescriptor(bars[i],'time');if(!field||!Object.hasOwn(field,'value')||typeof field.value!=='number'||!Number.isSafeInteger(field.value))throw Error('Seasonality needs the exact accepted time grid.');const time=field.value;if(i&&time<=times[i-1])throw Error('Seasonality needs distinct increasing accepted times.');times.push(time);if(time>scene.asOf)continue;const date=contract.calendar==='nyse'&&contract.dateLabels==='calendar-midnight'?newYorkClock(time).date:new Date(time*1000).toISOString().slice(0,10),row=byMonth.get(date.slice(0,7));
  if(!row||row.state==='excluded')continue;values[0][i]=row.price;values[1][i]=row.statistics.mean;values[2][i]=row.statistics.deviation;values[3][i]=row.statistics.count||null;
 }
 const labels=['Expected price for current month','Historical average for current month (%)','Historical standard deviation for current month (%)','Months used in current average'];
 const series=Object.freeze(SEASONALITY_PLOTS.map((id,index)=>Object.freeze({id,label:labels[index],values:Object.freeze(values[index]) as NumericSeries})));
 const result:IndicatorResult={id:'seasonality',series:series as unknown as IndicatorResult['series'],diagnostics:[],policies:['Local user-supplied logical-close calculations; supplied corrections are not archived point-in-time history.','Historical inspection uses statistics frozen at month opening; current heatmap summaries may differ.'],seasonality:scene};Object.defineProperty(result,'series',{value:series,writable:false,configurable:false});Object.defineProperty(result,'seasonality',{value:scene,writable:false,configurable:false});alignedResults.set(result,{scene:new WeakRef(scene),bars:new WeakRef(bars),series,times:Object.freeze(times)});return result;
}
/** Owned OUTPUT time grid; never original-dataset resolution, copied source rows or source authority. */
export function seasonalityAlignedTimes(result:IndicatorResult):readonly number[]|null{return alignedResults.get(result)?.times??null;}
/** Deliberately avoids the generic global points cache; only this calculation's actual native output retains these points. */
export function seasonalityNativeSeries(settings:IndicatorInstanceSettings,result:IndicatorResult):LineLikeSeries[]{
 const record=alignedResults.get(result);if(!record||record.series!==result.series||record.scene.deref()!==result.seasonality)throw Error('Seasonality requires its constructor-owned aligned output.');
 return result.series.map((row,index)=>{
  const style=settings.plots[row.id]??defaultPlotStyle(settings.kind,row.id,index);
  const points=record.times.map((time,ordinal)=>Object.freeze({time:time*1000,value:row.values[ordinal]}));Object.freeze(points);
  return{id:stableSeriesId({instanceId:settings.id,kind:'line',title:settings.kind+':'+row.id,ordinal:index}),title:row.label,paneId:'',kind:'line',visible:false,display:{pane:false,priceScale:false,legend:style.visible&&style.legend,dataWindow:style.visible&&style.dataWindow},style:{color:style.color,width:style.width,lineStyle:style.lineStyle},points};
 });
}
/** A bounded original native table and price-overlay boxes, with no React/DOM/native ownership grant. */
export function seasonalityShapes(scene:Readonly<SeasonalityScene>,display:SeasonalityDisplay,id:(role:string)=>string):{tables:DrawingTable[];boxes:DrawingBox[]}{
 const rowCount=scene.years.length+1+Number(display.meanRow)+Number(display.deviationRow)+Number(display.positiveFrequencyRow),width=display.tableWidth===0?undefined:display.tableWidth/13,height=display.tableHeight===0?undefined:display.tableHeight/rowCount;
 const cell=(value:string,bgColor?:string,tooltip?:string,bold=false):TableCell=>({text:value,textColor:'#e6e8eb',...(bgColor?{bgColor}:{}),hAlign:'center',vAlign:'center',textSize:11,fontFamily:'default',bold,italic:false,...(width===undefined?{}:{width}),...(height===undefined?{}:{height}),...(tooltip?{tooltip}:{})});
 const signed=(value:number|null)=>value===null||value===0?undefined:indicatorColorOpacity(value>0?display.positiveColor:display.negativeColor,Math.min(100,Math.abs(value)/display.intensityCutoff*100));
 const describe=(value:Readonly<SeasonalityCell>)=>value.state==='closed'||value.state==='developing'?text(value.value)+(value.state==='developing'?' *':''):({absent:'No data',future:'Future',excluded:'Ignored',unavailable:'Unavailable'} as const)[value.state];
 const cells:Array<Array<TableCell|null>>=[[cell('Year',undefined,undefined,true),...MONTHS.map(month=>cell(month,undefined,undefined,true))]];
 for(const year of scene.years)cells.push([cell(String(year.year),undefined,undefined,true),...year.cells.map(value=>cell(describe(value),signed(value.value),[value.reason,value.state==='developing'?'Developing local observation; excluded from closed historical pools.':null,'Coverage: '+value.coverage+'. '+value.observedSessions+' observed'+(value.expectedSessions===null?'':' / '+value.expectedSessions+' expected')+' sessions.'].filter(Boolean).join(' ')))]);
 if(display.meanRow)cells.push([cell('Avgs',undefined,undefined,true),...scene.summaries.map(row=>cell(text(row.mean),signed(row.mean),row.count+' eligible observations; developing '+row.developingCount+', sparse '+row.sparseCount+'.'))]);
 if(display.deviationRow)cells.push([cell('StDev',undefined,undefined,true),...scene.summaries.map(row=>cell(text(row.deviation),undefined,'Population deviation; '+row.count+' eligible observations.'))]);
 if(display.positiveFrequencyRow)cells.push([cell('Pos%',undefined,undefined,true),...scene.summaries.map(row=>cell(text(row.positiveFrequency),undefined,'Positive means strictly greater than zero; '+row.count+' eligible observations.'))]);
 const tables:DrawingTable[]=[{id:id('heatmap'),paneId:'',position:display.tablePosition==='Left'?'middle_left':display.tablePosition==='Right'?'middle_right':'middle_center',columns:13,rows:rowCount,bgColor:'#151b26',frameColor:'#596474',frameWidth:1,borderColor:'#343f50',borderWidth:1,cells,merges:[]}],boxes:DrawingBox[]=[];
 if(display.projectionGeometry)for(const row of scene.projections){const geometry=row.geometry;if(!geometry||row.state!=='ready'||row.statistics.mean===null)continue;const color=row.statistics.mean>0?display.positiveColor:row.statistics.mean<0?display.negativeColor:'#8c99aa';boxes.push({id:id('month:'+row.month),paneId:'',overlay:true,xloc:'bar_time',left:geometry.left*1000,right:geometry.right*1000,top:Math.max(geometry.baseline,geometry.price),bottom:Math.min(geometry.baseline,geometry.price),extend:'none',bgColor:indicatorColorOpacity(color,15),borderColor:color,borderWidth:1,borderStyle:'solid',text:text(row.statistics.mean),textColor:color,textSize:'small',hAlign:'center',vAlign:'center',wrap:false,fontFamily:'default',bold:false,italic:false});}
 return{tables,boxes};
}

/** Closed source calls this only after authenticating the SAME consumed result,
 * reservation, raw frame and frozen seconds grid. This is arithmetic/output
 * construction, never a new source/native authority or a time-grid resolver. */
export function seasonalityAlignedOwnedLiveResult(source:Readonly<SeasonalityResult>,bars:readonly Bar[],times:readonly number[]):IndicatorResult{
 if(source.status!=='ready')throw Error('The owned live scene is unavailable.');
 const values=alignOwnedLiveSeasonality(source,times);if(bars.length!==times.length)throw Error('The current live alignment extent changed.');
 const labels=['Expected price for current month','Historical average for current month (%)','Historical standard deviation for current month (%)','Months used in current average'];
 const series=Object.freeze(SEASONALITY_PLOTS.map((id,index)=>Object.freeze({id,label:labels[index],values:values[index] as NumericSeries})));
 const result:IndicatorResult={id:'seasonality',series:series as unknown as IndicatorResult['series'],diagnostics:[],policies:['Local user-supplied logical-close calculations; supplied corrections are not archived point-in-time history.','Historical inspection uses statistics frozen at month opening; current heatmap summaries may differ.'],seasonality:source.scene};
 Object.defineProperty(result,'series',{value:series,writable:false,configurable:false});Object.defineProperty(result,'seasonality',{value:source.scene,writable:false,configurable:false});
 // This is the actual already-compared consumed grid, not another M copy.
 alignedResults.set(result,{scene:new WeakRef(source.scene),bars:new WeakRef(bars),series,times});return result;
}
