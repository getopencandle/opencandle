// WSX alert lines: pure rows from the local alert list plus the stored Alerts tab fields (chart settings
// alerts.lines.visible, alerts.lines.color, alerts.activeOnly). The rows feed a main-series pane layer; they are never
// drawing rows, so Hide drawings, Lock all, Remove drawings, the eraser and the object tree never see them.
import type {AlertCondition,LocalAlert} from '../domain/alerts';

export const ALERT_LINES_LAYER='lv-alert-lines';
/** The LV token that colors a line when the chart settings store no color. Alerts have no color of their own. */
export const ALERT_LINE_TOKEN='--lv-alert-line';
export const ALERT_LINE_FALLBACK='#f0a030';
export const ALERT_LABEL_NAME_LIMIT=24;
/** labelsVisible is separate from lines.visible; absent means on. */
export interface AlertLineSettings {lines:{visible:boolean;color:string|null};activeOnly:boolean;labelsVisible?:boolean}
export type AlertLineState='active'|'triggered'|'expired';
/** Label text colors per state use LV theme tokens (warning for triggered, error for expired). */
export const ALERT_STATE_TOKEN:Readonly<Record<Exclude<AlertLineState,'active'>,string>>=Object.freeze({triggered:'--lv-notice-text',expired:'--lv-error-text'});
/** Trigger animation: 2400 ms total, 1200 ms cycle, 600 ms fades, linear: fades out and in twice. */
export const ALERT_BLINK_TOTAL_MS=2400,ALERT_BLINK_CYCLE_MS=1200;
/** Label opacity at the elapsed time since the trigger was first seen; 1 once the animation is over. */
export function alertLabelBlinkAlpha(elapsedMs:number):number{
 if(!(elapsedMs>=0)||elapsedMs>=ALERT_BLINK_TOTAL_MS)return 1;
 const phase=(elapsedMs%ALERT_BLINK_CYCLE_MS)/ALERT_BLINK_CYCLE_MS;
 return Math.abs(1-2*phase);
}
/** Starts a blink when a known alert's trigger mark changes while observed (wall clock, not bar time). The first observation and new alerts never blink. */
export class AlertBlinkTracker{
 private marks=new Map<string,string|null>();private since=new Map<string,number>();private primed=false;
 observe(rows:readonly {alertId:string;triggerMark?:string|null}[],nowMs:number):void{
  const seen=new Set<string>();
  for(const row of rows){
   seen.add(row.alertId);
   if(this.primed&&this.marks.has(row.alertId)&&row.triggerMark!=null&&this.marks.get(row.alertId)!==row.triggerMark)this.since.set(row.alertId,nowMs);
   this.marks.set(row.alertId,row.triggerMark??null);
  }
  for(const id of [...this.marks.keys()])if(!seen.has(id)){this.marks.delete(id);this.since.delete(id);}
  this.primed=true;
 }
 alpha(alertId:string,nowMs:number):number{const at=this.since.get(alertId);if(at===undefined)return 1;if(nowMs-at>=ALERT_BLINK_TOTAL_MS){this.since.delete(alertId);return 1;}return alertLabelBlinkAlpha(nowMs-at);}
 /** Start of the running blink, or null. */
 startedAt(alertId:string,nowMs:number):number|null{const at=this.since.get(alertId);return at!==undefined&&nowMs-at<ALERT_BLINK_TOTAL_MS?at:null;}
 active(nowMs:number):boolean{return [...this.since.values()].some(at=>nowMs-at<ALERT_BLINK_TOTAL_MS);}
}
/** datasetKey: the cell's alert dataset key (alertDatasetKey for observation versions 1 and 2); a price-bound alert for another dataset of the same instrument does not draw. */
export interface AlertLineCell {instrumentId:string;datasetKey?:string|readonly string[]}
export interface AlertLineRow {
 alertId:string;name:string;slot:'level'|'lower'|'upper';price:number;color:string|null;
 dashed:boolean;triggered:boolean;label:string;
 state?:AlertLineState;labelVisible?:boolean;triggerMark?:string|null;
}
export interface AlertLinesPayload {schemaVersion:1;rows:AlertLineRow[]}
const SINGLE:readonly AlertCondition['kind'][]=['crossing','crossing-up','crossing-down','greater','less'];
const PAIR:readonly AlertCondition['kind'][]=['inside','outside','entering','exiting'];
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
function shortName(name:string):string{
 const text=typeof name==='string'?name.trim():'';
 return text.length>ALERT_LABEL_NAME_LIMIT?text.slice(0,ALERT_LABEL_NAME_LIMIT-1)+'…':text;
}
/** An alert draws only when its operand is the main series price: no observation binding, or a price source
 * bound to this cell's dataset. Indicator, drawing, drawing-boundary and comparison sources draw nothing. */
function drawsOnCell(alert:LocalAlert,cell:AlertLineCell):boolean{
 const definition=alert.definition;
 if(definition.instrumentId!==cell.instrumentId||definition.mode!=='ordinary')return false;
 const binding=definition.observationBinding;
 if(binding===undefined)return true;
 if(binding.source.kind!=='price')return false;
 if(cell.datasetKey===undefined)return true;
 return typeof cell.datasetKey==='string'?binding.datasetKey===cell.datasetKey:cell.datasetKey.includes(binding.datasetKey);
}
export function alertLineRows(input:{alerts:readonly LocalAlert[];cell:AlertLineCell;settings:AlertLineSettings;format:(value:number)=>string}):AlertLineRow[]{
 const {alerts,cell,settings,format}=input;
 if(!settings.lines.visible)return[];
 const rows:AlertLineRow[]=[];
 for(const alert of alerts){
  if(settings.activeOnly&&alert.status!=='active')continue;
  if(!drawsOnCell(alert,cell))continue;
  const condition=alert.definition.condition,triggered=alert.lastTriggeredAt!==null&&alert.lastTriggeredAt!==undefined;
  const state:AlertLineState=alert.status==='expired'?'expired':triggered?'triggered':'active',triggerMark=triggered?`${alert.lastTriggeredBar}:${alert.lastTriggeredAt}`:null;
  const levels:[AlertLineRow['slot'],unknown][]=SINGLE.includes(condition.kind)?[['level',condition.value]]:PAIR.includes(condition.kind)?[['lower',condition.lower],['upper',condition.upper]]:[];
  for(const [slot,price] of levels){
   if(!finite(price))continue;
   const name=shortName(alert.definition.name);
   rows.push({alertId:alert.definition.id,name,slot,price,color:settings.lines.color,dashed:triggered,triggered,label:format(price)+'  '+name+(state==='expired'?' expired':triggered?' triggered':''),state,labelVisible:settings.labelsVisible!==false,triggerMark});
  }
 }
 return rows;
}
export function alertLinesPayload(rows:readonly AlertLineRow[]):AlertLinesPayload{return{schemaVersion:1,rows:rows.map(row=>({...row}))};}
