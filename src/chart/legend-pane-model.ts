// Per-pane legend grouping and live plot values. Pure data, no chart access.
// Wording and ordering are OpenCandle's own: the price pane's legend comes first, other panes follow in chart order.
export const LEGEND_VALUE_EMPTY='∅';
export interface LegendPaneRow {id:string;paneId:string|null}
export interface LegendPaneGroup<T extends LegendPaneRow> {paneId:string;rows:T[]}
/** Rows grouped by pane. Unmounted rows (no pane yet) join the price group. Price is first when it has rows. */
export function groupLegendByPane<T extends LegendPaneRow>(rows:readonly T[]):LegendPaneGroup<T>[]{
 const groups=new Map<string,T[]>();
 for(const row of rows){const key=row.paneId??'price';(groups.get(key)??groups.set(key,[]).get(key)!).push(row);}
 const out=[...groups].map(([paneId,list])=>({paneId,rows:list}));
 return [...out.filter(group=>group.paneId==='price'),...out.filter(group=>group.paneId!=='price')];
}
export interface LegendValuePart {plot:string;text:string;color:string}
export interface LegendValueSeries {id:string;values:ArrayLike<number>}
export interface LegendPlotStyle {visible?:boolean;legend?:boolean;color:string}
/** Colored values for one indicator at barIndex (the crosshair bar), or at the last bar when barIndex is null.
 * Hidden plots and plots whose legend flag is off are skipped. A gap or an index outside the series reads as the empty glyph. */
export function legendValueParts(result:{series:readonly LegendValueSeries[]},plots:Readonly<Record<string,LegendPlotStyle|undefined>>,barIndex:number|null,format:(value:number)=>string=value=>value.toFixed(2)):LegendValuePart[]{
 const out:LegendValuePart[]=[];
 for(const series of result.series){
  const style=plots[series.id];
  if(!style||style.visible===false||style.legend===false)continue;
  const index=barIndex===null?series.values.length-1:barIndex,value=index>=0&&index<series.values.length?series.values[index]:Number.NaN;
  out.push({plot:series.id,text:Number.isFinite(value)?format(value):LEGEND_VALUE_EMPTY,color:style.color});
 }
 return out;
}
/** Values for one legend row, read from the indicator port. The row's own plot style wins; styleOf supplies the default for a plot
 * the row has not styled. An unmounted or removed instance reads as no values rather than an error in the legend. */
export function indicatorLegendValues(port:{values(id:string):{series:readonly LegendValueSeries[]}},row:{id:string;kind:string;plots?:Readonly<Record<string,LegendPlotStyle|undefined>>},barIndex:number|null,styleOf:(kind:string,plot:string)=>LegendPlotStyle,format?:(value:number)=>string):LegendValuePart[]{
 try{
  const result=port.values(row.id),plots:Record<string,LegendPlotStyle>={};
  for(const series of result.series)plots[series.id]=row.plots?.[series.id]??styleOf(row.kind,series.id);
  return legendValueParts(result,plots,barIndex,format);
 }catch{return[];}
}
