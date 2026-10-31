import type {ChartController} from './adapter';
import type {ChartInputSnapshot} from './input-visibility';
import type {HistoricalPaneKey,HistoricalFrameOwner} from './historical-frame';
import type {Instrument} from '../domain/types';
export type RootChartMenuAction='tpo-merge'|'tpo-unmerge'|'note'|'theme'|'indicator'|'objects'|'interval'|'date'|'source-csv'|'png-save'|'png-copy'|'price-alert'|'paper-ticket'|'drawing-settings'|'reset-view'|'chart-type-focus'|'remove-drawings'|'remove-indicators'|'drawing-clone'|'drawing-lock'|'drawing-hide'|'drawing-front'|'drawing-back'|'drawing-remove'|'drawing-alert'|'drawing-copy'|'drawing-forward'|'drawing-backward'|'drawing-template'|'drawing-visibility'|'drawing-mirror'|'drawing-flip'|'drawing-cut'|'paste'|'copy-price'|'cursor-lock'|'table-view'
 /** The indicator menu on a clicked plot, the main series rows on the candles. */
 |'indicator-settings'|'indicator-hide'|'indicator-remove'|'indicator-alert'|'indicator-add-on'|'indicator-intervals'|'indicator-copy'|'indicator-order'|'indicator-move'|'indicator-pin'|'series-hide'|'series-pin'
 /** Chart-body rows Add {symbol} to watchlist, Draw horizontal line at {price}, Hide marks on bars, and Paste of a copied indicator. */
 |'watchlist-add'|'hline'|'hide-marks'|'indicator-paste'
 /** Copy the chart's symbol (handled by the menu itself), and app commands run from the menu (options.item names the command). */
 |'copy-symbol'|'command';
/** The context Reset chart view row runs the price scale port's own reset command (the one Alt + R runs); no new reset logic. */
export const CONTEXT_RESET_COMMAND='resetChart' as const;
export const CONTEXT_RESET_HINT='Alt + R';
export type ChartContextEntity={kind:'chart'}|{kind:'time-axis'}|{kind:'corner'}|{kind:'price-axis';pane:HistoricalPaneKey;columnOwner:HistoricalFrameOwner|null;unit:'price'|'indicator'}|{kind:'series';owner:'main'|HistoricalFrameOwner}|{kind:'indicator';id:string;rendererId:string}|{kind:'drawing';ids:readonly string[];fingerprints:Readonly<Record<string,string>>};
export interface ChartMenuSnapshot{readonly token:object;readonly cellId:string;readonly controller:ChartController;readonly treeOwner:object;readonly input:ChartInputSnapshot;readonly executionIdentity:string;readonly instrument:Instrument;readonly entity:ChartContextEntity;readonly client:Readonly<{x:number;y:number}>|null;readonly local:Readonly<{x:number;y:number}>|null;readonly point:Readonly<{price:number|null;logical:number|null;barIndex:number|null;barTime:number|null;unit:'price'|'indicator'|null;pane:HistoricalPaneKey|null}>}
export interface ChartMenuActionLease{readonly snapshot:ChartMenuSnapshot;isCurrent:()=>boolean;isOwnerCurrent:()=>boolean;release:()=>void}
export type ChartContextActionResult=boolean|{ok:boolean;message?:string};
/** Optional per-open presets. `order` applies to the paper-ticket action only (the price scale + menu rows). */
export interface ChartContextActionOptions{order?:{side:'buy'|'sell';orderType:'limit'|'stop'};/** The submenu item a row with a submenu ran (Visual order, Move to, Pin to scale). */item?:string}
export type ChartContextActions=Partial<Record<RootChartMenuAction,(context:ChartMenuSnapshot,lease:ChartMenuActionLease,options?:ChartContextActionOptions)=>ChartContextActionResult|Promise<ChartContextActionResult>>>;
/** No imported/copied snapshot is an authority, even when its visible token matches. */
export function createChartMenuAuthority(port:{current:(snapshot:ChartMenuSnapshot)=>boolean;ownerCurrent?:(snapshot:ChartMenuSnapshot)=>boolean;signature:()=>string}){
 const issued=new WeakMap<ChartMenuSnapshot,{signature:string;generation:number;adopted:boolean}>();let generation=0,disposed=false;
 return{issue(value:Omit<ChartMenuSnapshot,'token'>):ChartMenuSnapshot{if(disposed)throw Error('Chart menu owner is retired');const snapshot=Object.freeze({...value,token:Object.freeze({}),input:Object.freeze({...value.input,source:Object.freeze({...value.input.source})}),instrument:Object.freeze({...value.instrument}),entity:deepFreeze(structuredClone(value.entity)),client:value.client?Object.freeze({...value.client}):null,local:value.local?Object.freeze({...value.local}):null,point:Object.freeze({...value.point})});if(!port.current(snapshot))throw Error('Chart menu input or controller changed before opening');issued.set(snapshot,{signature:port.signature(),generation:++generation,adopted:false});return snapshot;},isCurrent(snapshot:ChartMenuSnapshot){if(disposed||!snapshot||typeof snapshot!=='object')return false;const record=issued.get(snapshot);if(!record||record.generation!==generation)return false;try{return port.current(snapshot)&&port.signature()===record.signature;}catch{return false;}},handoff(snapshot:ChartMenuSnapshot):ChartMenuActionLease{const record=issued.get(snapshot);if(disposed||!record||record.adopted||record.generation!==generation||!port.current(snapshot)||port.signature()!==record.signature)throw Error('Chart menu target was retired or already used');record.adopted=true;let active=true;return{snapshot,isCurrent(){if(!active||disposed)return false;try{return port.current(snapshot)&&port.signature()===record.signature;}catch{return false;}},isOwnerCurrent(){if(!active||disposed)return false;try{return(port.ownerCurrent??port.current)(snapshot);}catch{return false;}},release(){active=false;}};},retire(){generation++;},dispose(){disposed=true;generation++;}};
}
function deepFreeze<T>(value:T):T{if(value&&typeof value==='object'){for(const key of Object.keys(value))deepFreeze((value as Record<string,unknown>)[key]);Object.freeze(value);}return value;}

// Plot hit-testing for the chart menu. A right-click on an indicator plot opens that
// indicator's own menu and a right-click on the candles opens the main series menu; anywhere else the
// chart menu stays. The renderer reports the clicked pane's geometry (renderer-context.ts `plot`) and the chart context port
// asks plotHitEntity once per opening. The distance rule (4 px, the plot line between the two bars around the pointer, the
// bar's high to low for the candles, the first listed indicator on a tie) is our own choice.
export const PLOT_HIT_TOLERANCE_PX=4;
export interface PlotHitScale{min:number;max:number;log:boolean;invert:boolean}
export interface PlotHitPane{paneId:string;kind:'price'|'study';top:number;height:number;scale:PlotHitScale;columns:readonly {owner:{kind:string;id:string};scale:PlotHitScale}[];owners:readonly {kind:string;id:string;rendererId:string}[]}
export interface PlotHitIndicator{id:string;rendererId:string;values:readonly ArrayLike<number|null|undefined>[]}
export interface PlotHitInput{y:number;logical:number|null;barIndex:number|null;pane:PlotHitPane;bar:{high:number;low:number}|null;indicators:readonly PlotHitIndicator[];tolerance?:number}
/** The pane y (client px from the plot top) of a value on a scale; the inverse of the capture's y-to-price rule. Null: off the scale's domain. */
export function priceToPaneY(pane:{top:number;height:number},scale:PlotHitScale,price:number):number|null{
 if(!Number.isFinite(price)||!(scale.max>scale.min))return null;
 let t:number;
 if(scale.log){if(price<=0||scale.min<=0)return null;t=(Math.log(price)-Math.log(scale.min))/(Math.log(scale.max)-Math.log(scale.min));}
 else t=(price-scale.min)/(scale.max-scale.min);
 if(!Number.isFinite(t))return null;
 return pane.top+(scale.invert?t:1-t)*pane.height;
}
function plotDistance(values:ArrayLike<number|null|undefined>,index:number,logical:number|null,toY:(value:number)=>number|null,y:number):number|null{
 const at=(k:number)=>{if(k<0||k>=values.length)return null;const value=values[k];return typeof value==='number'&&Number.isFinite(value)?toY(value):null;};
 const here=at(index);if(here===null)return null;
 let distance=Math.abs(y-here);
 if(logical!==null&&Number.isFinite(logical)&&logical!==index){const there=at(logical>index?index+1:index-1);if(there!==null){const share=Math.min(1,Math.abs(logical-index));distance=Math.min(distance,Math.abs(y-(here+(there-here)*share)));}}
 return distance;
}
/** The indicator or main series under the pointer, or null (the chart menu). */
export function contextPlotHit(input:PlotHitInput):ChartContextEntity|null{
 const tolerance=input.tolerance??PLOT_HIT_TOLERANCE_PX,index=input.barIndex,pane=input.pane,y=input.y;
 if(index===null||!Number.isInteger(index)||index<0||!Number.isFinite(y))return null;
 let best:{distance:number;entity:ChartContextEntity}|null=null;
 for(const row of input.indicators){
  if(!pane.owners.some(owner=>owner.kind==='built'&&owner.id===row.id&&owner.rendererId===row.rendererId))continue;
  const scale=pane.columns.find(column=>column.owner.kind==='built'&&column.owner.id===row.id)?.scale??pane.scale;
  for(const values of row.values){const distance=plotDistance(values,index,input.logical,value=>priceToPaneY(pane,scale,value),y);if(distance!==null&&distance<=tolerance&&(!best||distance<best.distance))best={distance,entity:{kind:'indicator',id:row.id,rendererId:row.rendererId}};}
 }
 if(best)return best.entity;
 if(pane.kind==='price'&&input.bar){const high=priceToPaneY(pane,pane.scale,input.bar.high),low=priceToPaneY(pane,pane.scale,input.bar.low);if(high!==null&&low!==null&&y>=Math.min(high,low)-tolerance&&y<=Math.max(high,low)+tolerance)return{kind:'series',owner:'main'};}
 return null;
}
/** What the context port reads for a hit: the chart's indicator rows (legend order) and their plot values (per calculation bar). */
export interface PlotHitIndicators{list():readonly {id:string;rendererId:string;visible:boolean}[];values(id:string):{series:readonly {values:ArrayLike<number|null|undefined>}[]}}
/** The refined entity for a capture, or null to keep the capture's own. Only a chart-body capture with reported plot geometry
 * is refined; a plot series whose length is not the input bar count is skipped (its index would not name the clicked bar). */
export function plotHitEntity(capture:{entity:ChartContextEntity;point:{logical:number|null;barIndex:number|null};local:{x:number;y:number}|null;plot?:PlotHitPane|null},bars:readonly {high:number;low:number}[],indicators:PlotHitIndicators):ChartContextEntity|null{
 if(capture.entity.kind!=='chart'||!capture.plot||!capture.local)return null;
 const plot=capture.plot,owned=new Set(plot.owners.filter(owner=>owner.kind==='built').map(owner=>owner.id));
 const rows:PlotHitIndicator[]=[];
 for(const row of indicators.list()){if(!row.visible||!owned.has(row.id))continue;let values:ArrayLike<number|null|undefined>[]=[];try{values=indicators.values(row.id).series.map(series=>series.values).filter(series=>series.length===bars.length);}catch{values=[];}rows.push({id:row.id,rendererId:row.rendererId,values});}
 const index=capture.point.barIndex;
 return contextPlotHit({y:capture.local.y,logical:capture.point.logical,barIndex:index,pane:plot,bar:index!==null&&index>=0&&index<bars.length?bars[index]!:null,indicators:rows});
}
/** An indicator target stays current while the chart still lists that instance with the same renderer id. */
export function indicatorEntityCurrent(entity:ChartContextEntity,rows:readonly {id:string;rendererId:string}[]):boolean{
 return entity.kind!=='indicator'||rows.some(row=>row.id===entity.id&&row.rendererId===entity.rendererId);
}

// "Hide marks on bars". The chart menu row hides the event marks (dividends, splits) on
// that chart until the row (then "Show marks on bars") is chosen again. Per chart cell, kept for the session only (never saved),
// like the vertical cursor lock. Which marks count as marks on bars (the event marks only; strategy and paper marks keep their
// own settings) is our own choice.
export const BAR_MARKS_HIDE_LABEL='Hide marks on bars',BAR_MARKS_SHOW_LABEL='Show marks on bars';
export function createBarMarksVisibility(){
 const hidden=new Set<string>(),listeners=new Set<()=>void>();
 const emit=()=>{for(const listener of [...listeners]){try{listener();}catch{/* a listener failure never blocks the others */}}};
 return{
  hiddenFor:(cellId:string)=>hidden.has(cellId),
  /** Hides the marks on `cellId`, or shows them when they are hidden. Returns true when they are now hidden. */
  toggle(cellId:string):boolean{if(typeof cellId!=='string'||!cellId)throw new Error('The chart is unavailable.');if(hidden.delete(cellId)){emit();return false;}hidden.add(cellId);emit();return true;},
  clear(){if(hidden.size){hidden.clear();emit();}},
  subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
 };
}
export type BarMarksVisibility=ReturnType<typeof createBarMarksVisibility>;
export const barMarksVisibility:BarMarksVisibility=createBarMarksVisibility();
