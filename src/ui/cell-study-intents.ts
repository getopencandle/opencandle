import type {ChartController} from '../chart/adapter';
import type {ChartInputSnapshot} from '../chart/input-visibility';
import type {IndicatorMoveWhere} from './indicator-move-targets';
import type {IndicatorInstanceView} from '../chart/indicator-port';
import {indicatorEditFingerprint} from './indicator-library';
import type {ScriptBinding} from './script-library';
import type {LayoutSnapshot} from '../chart/layout-port';
import type {Bar} from '../domain/types';
import {isDerivedStyle} from '../chart/derived/common';

export type CellStudyAction=
 |{kind:'series';command:'title'|'interval'|'flag'|'show'|'menu'}
 |{kind:'tables';destination:'chart'|'bottom'}
 |{kind:'settings';tab?:string}|{kind:'visibility'}|{kind:'remove'}
 |{kind:'move';where:IndicatorMoveWhere}
 |{kind:'scale';placement:Parameters<ChartController['indicators']['setScale']>[1]}
 |{kind:'order';step:'front'|'back'|'forward'|'backward'}
 |{kind:'copy'}|{kind:'favorite'}|{kind:'alert'}|{kind:'add-indicator'}|{kind:'object-tree'};
export type CellStudySubject={kind:'builtin'|'script';id:string;fingerprint:string}|{kind:'series';id:'main';fingerprint:string};
export interface CellStudyIntent {
 readonly target:{readonly cellId:string;readonly controller:ChartController;readonly input:ChartInputSnapshot;readonly executionIdentity:string};
 readonly subject:CellStudySubject;readonly action:CellStudyAction;
 /** These assertions are supplied by the actual mounted cell/host, never from public source labels. */
 readonly assertCellCurrent:()=>void;readonly assertTreeCurrent?:()=>void;
}
export const builtinStudyFingerprint=(row:IndicatorInstanceView)=>indicatorEditFingerprint(row);
export const scriptStudyFingerprint=(row:ScriptBinding)=>JSON.stringify([row.id,row.documentId,row.version,row.name,row.source,row.inputs??null,row.visible,row.pane,row.paneId??null,row.ownScale??false,row.plots,...(row.tablePlacement?[row.tablePlacement]:[])]);
export function assertCellStudyIntent(intent:CellStudyIntent):void{intent.assertTreeCurrent?.();intent.assertCellCurrent();intent.assertTreeCurrent?.();}

/** One pending UI intent. Consumed before execution, so a callback cannot repeat a native mutation. */
export function createCellStudyIntentQueue(){
 let pending:{intent:CellStudyIntent;epoch:number;dialog:object;workspace:object}|null=null;
 return{
  enqueue(intent:CellStudyIntent,epoch:number,dialog:object,workspace:object){assertCellStudyIntent(intent);pending={intent,epoch,dialog,workspace};},
  peek:()=>pending,
  cancel(){pending=null;},
  drain(ready:(entry:NonNullable<typeof pending>)=>boolean,run:(intent:CellStudyIntent)=>void):'empty'|'waiting'|'consumed'{
   const entry=pending;if(!entry)return'empty';
   try{assertCellStudyIntent(entry.intent);if(!ready(entry))return'waiting';assertCellStudyIntent(entry.intent);}catch(error){if(pending===entry)pending=null;throw error;}
   if(pending!==entry)return'empty';pending=null;run(entry.intent);return'consumed';
  },
 };
}

/** Uses the cell's already owned time grid; no inspection/history copy or linear scan. */
export function cellStudyInspectionTime(bars:readonly Pick<Bar,'time'>[],style:string,time:number|null,ghost:boolean,isCurrent:()=>boolean):number|null{
 if(!isCurrent()||!bars.length)return null;
 if(time===null){const last=bars[bars.length-1].time;return isCurrent()&&Number.isFinite(last)?last:null;}
 if(typeof time!=='number'||!Number.isFinite(time))return null;
 if(isDerivedStyle(style))return !ghost&&isCurrent()?time:null;
 let low=0,high=bars.length-1,index=-1;while(low<=high){const middle=(low+high)>>>1,value=bars[middle].time;if(!Number.isFinite(value))return null;if(value<=time){index=middle;low=middle+1;}else high=middle-1;}
 return index>=0&&isCurrent()?bars[index].time:null;
}
/** Address-only shared presentation cursor. Each producer must independently prove its own row/units. */
export type CellStudyPositionAddress={readonly kind:'latest'}|{readonly kind:'axis-time';readonly time:number}|{readonly kind:'unavailable'};
export interface CellStudyResolvedPosition {readonly chart:unknown;readonly owner:object;readonly address:CellStudyPositionAddress}
export interface CellStudyInspectionEndpoint {readonly chart:unknown;readonly owner:object;isCurrent():boolean;resolve(time:number|null,ghost:boolean):number|null;resolvePosition?:(time:number|null,ghost:boolean,resolved:number|null)=>CellStudyPositionAddress}
/** Presentation-only routing of the existing grid-hover feed. Scalar readers retain numerical authority. */
export function createCellStudyInspectionStream(){
 const listeners=new Map<string,Set<(chart:unknown,time:number|null)=>void>>(),positionListeners=new Map<string,Set<(value:CellStudyResolvedPosition)=>void>>();
 type Entry={endpoint:CellStudyInspectionEndpoint;callback:(time:number|null)=>void;positionCallback?:((value:CellStudyResolvedPosition)=>void)|undefined;active:boolean;blocked:number};
 const cells=new Map<string,Entry>();let layout:Pick<LayoutSnapshot,'id'|'cells'|'sync'|'maximizedCellId'>|null=null,layoutOwner:object|null=null,layoutKey='',visible=true,sequence=0;
 let hovered:{id:string;entry:Entry;time:number;sequence:number}|null=null;
 const current=(entry:Entry)=>{try{return entry.active&&entry.endpoint.isCurrent();}catch{return false;}};
 const dispatch=(only?:string)=>{
  if(hovered&&(!current(hovered.entry)||cells.get(hovered.id)!==hovered.entry))hovered=null;
  const source=hovered,sourceCell=source&&layout?.cells.find(cell=>cell.id===source.id);
  for(const [id,entry]of [...cells]){if(only!==undefined&&id!==only)continue;if(!current(entry)){entry.blocked=source?.sequence??-1;continue;}
   let time:number|null=null,ghost=false;
   if(visible&&source&&entry.blocked!==source.sequence){if(id===source.id)time=source.time;else if(layout?.sync.crosshair&&layout.maximizedCellId===null&&sourceCell&&layout.cells.some(cell=>cell.id===id&&cell.group===sourceCell.group)){time=source.time;ghost=true;}}
   try{const value=entry.endpoint.resolve(time,ghost),sourceCurrent=hovered===source&&(!source||current(source.entry));if(!sourceCurrent&&hovered===source)hovered=null;if(cells.get(id)===entry&&current(entry)&&sourceCurrent){entry.callback(value);if(cells.get(id)!==entry||!current(entry)||hovered!==source||source&&!current(source.entry))continue;const address=entry.endpoint.resolvePosition?.(time,ghost,value)??(time===null&&!ghost?{kind:'latest' as const}:value===null?{kind:'unavailable' as const}:{kind:'axis-time' as const,time:value});if(cells.get(id)!==entry||!current(entry)||hovered!==source||source&&!current(source.entry))continue;const position=Object.freeze({chart:entry.endpoint.chart,owner:entry.endpoint.owner,address:Object.freeze(address)});entry.positionCallback?.(position);for(const callback of [...positionListeners.get(id)??[]]){if(cells.get(id)!==entry||!current(entry)||hovered!==source||source&&!current(source.entry))break;try{callback(position);}catch{/* One address observer cannot publish through another owner. */}}}}catch{/* A retired endpoint never publishes through a replacement. */}
  }
 };
 return{
  emit(cellId:string,chart:unknown,time:number|null){for(const callback of [...listeners.get(cellId)??[]])try{callback(chart,time);}catch{/* Other cell listeners must still run. */}const entry=cells.get(cellId);if(time!==null&&chart!==null&&entry&&entry.endpoint.chart===chart&&current(entry))hovered={id:cellId,entry,time,sequence:++sequence};else if(hovered?.id===cellId)hovered=null;dispatch();},
  subscribe(cellId:string,callback:(chart:unknown,time:number|null)=>void){const rows=listeners.get(cellId)??new Set();rows.add(callback);listeners.set(cellId,rows);return()=>{rows.delete(callback);if(!rows.size)listeners.delete(cellId);};},
  subscribeResolvedPosition(cellId:string,callback:(value:CellStudyResolvedPosition)=>void){const rows=positionListeners.get(cellId)??new Set();rows.add(callback);positionListeners.set(cellId,rows);dispatch(cellId);return()=>{rows.delete(callback);if(!rows.size)positionListeners.delete(cellId);};},
  register(cellId:string,endpoint:CellStudyInspectionEndpoint,callback:(time:number|null)=>void,positionCallback?:(value:CellStudyResolvedPosition)=>void){const prior=cells.get(cellId);if(prior){prior.active=false;if(hovered?.entry===prior)hovered=null;}const entry:Entry={endpoint,callback,positionCallback,active:true,blocked:hovered?.sequence??-1};cells.set(cellId,entry);dispatch();return()=>{entry.active=false;if(cells.get(cellId)===entry)cells.delete(cellId);if(hovered?.entry===entry)hovered=null;dispatch();};},
  configure(next:typeof layout,shown=true){const key=JSON.stringify([shown,next?.id,next?.maximizedCellId,next?.sync.crosshair,next?.cells.map(cell=>[cell.id,cell.group])]);if(layoutOwner===next&&layoutKey===key)return;layoutOwner=next;layout=next;layoutKey=key;visible=shown;hovered=null;dispatch();},
  refresh(cellId:string,owner:object){if(cells.get(cellId)?.endpoint.owner===owner)dispatch(cellId);},
  invalidate(cellId:string,owner:object){const entry=cells.get(cellId);if(!entry||entry.endpoint.owner!==owner)return;if(hovered?.entry===entry)hovered=null;else entry.blocked=hovered?.sequence??-1;dispatch();},
  dispose(){hovered=null;for(const entry of cells.values())entry.active=false;cells.clear();listeners.clear();positionListeners.clear();layout=null;layoutOwner=null;},
 };
}
export type CellStudyInspectionStream=ReturnType<typeof createCellStudyInspectionStream>;
