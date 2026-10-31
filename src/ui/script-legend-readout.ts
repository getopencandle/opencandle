import type {ChartController} from '../chart/adapter';
import {isDerivedStyle} from '../chart/derived/common';
import {readScriptReadoutPosition,type ScriptReadoutSnapshot} from '../chart/script-presentation-proof';
import type {CellStudyPositionAddress} from './cell-study-intents';
import type {Inspection} from './DataWindow';
import type {GridHover,HoverGrid} from './grid-hover';
import {DATA_WINDOW_EMPTY} from './data-window-model';

export type ScriptLegendPosition=CellStudyPositionAddress;
/** Live snapshots keep their lineage identity; a semantic context change creates a new dialog owner. */
export interface ScriptLegendContext {
 readonly datasetId:string;readonly basisIdentity?:string;readonly inputIdentity?:string;
 readonly resolution?:string;readonly sessionOverride?:'regular'|'extended';readonly style:string;
 readonly execution:string;readonly cellId?:string;readonly treeEpoch:number;
}
export function sameScriptLegendContext(left:ScriptLegendContext|undefined,right:ScriptLegendContext|undefined):boolean{
 if(!left||!right)return left===right;
 return left.datasetId===right.datasetId&&left.basisIdentity===right.basisIdentity&&left.inputIdentity===right.inputIdentity&&left.resolution===right.resolution&&left.sessionOverride===right.sessionOverride&&left.style===right.style&&left.execution===right.execution&&left.cellId===right.cellId&&left.treeEpoch===right.treeEpoch;
}
const unavailable=():ScriptLegendPosition=>({kind:'unavailable'});
/** Address only. The App has already produced/qualified this inspection; never recapture its history here. */
export function activeScriptLegendPosition(value:{chart:ChartController|null;inspection:Inspection|null;hover:GridHover|null;grid:HoverGrid|null|undefined;style:string;current:boolean}):ScriptLegendPosition{
 const {chart,inspection,hover,grid,style}=value;
 if(!value.current||!chart||!inspection||inspection.pending)return unavailable();
 const selected=grid?.layout.activeCellId;
 if(hover&&hover.cellId===selected&&hover.controller!==chart)return unavailable();
 const ownTime=inspection.crosshair?.time;
 if(ownTime!==undefined&&ownTime!==null)return Number.isFinite(ownTime)?{kind:'axis-time',time:ownTime}:unavailable();
 if(hover&&grid&&hover.cellId!==selected&&grid.layout.sync?.crosshair&&grid.layout.maximizedCellId===null){
  const source=grid.layout.cells.find(cell=>cell.id===hover.cellId),target=grid.layout.cells.find(cell=>cell.id===selected);
  if(source&&target&&source.group===target.group){
   // Native logical axes are private to their chart. An unrelated chart's coordinate is never a latest request.
   if(inspection.pending||hover.inspection.pending||isDerivedStyle(style)||isDerivedStyle(hover.inspection.series.style))return unavailable();
   const time=inspection.displayed.hovered?inspection.displayed.bar?.time:undefined;
   return typeof time==='number'&&Number.isFinite(time)?{kind:'axis-time',time}:unavailable();
  }
 }
 return{kind:'latest'};
}

export interface ScriptLegendValuePart {readonly ordinal:number;readonly label:string;readonly color:string;readonly text:string}
/** App supplies its main-series display formatter. Declaration/per-plot format metadata is not inferred. */
export function scriptLegendValueParts(view:ScriptReadoutSnapshot|undefined,position:ScriptLegendPosition|undefined,isCurrent:()=>boolean,formatValue:(value:number)=>string=value=>value.toFixed(2)):readonly ScriptLegendValuePart[]|null{
 try{
  if(!isCurrent()||!position||position.kind==='unavailable'||!view)return null;
  // The free reader authenticates private membership before even consulting snapshot fields.
  const value=readScriptReadoutPosition(view,position);if(view.state!=='ready')return null;view.assertCurrent();
  if(!isCurrent())return null;
  const parts=value.plots.map((plot,ordinal)=>({ordinal,label:plot.label,color:plot.color,text:typeof plot.value==='number'&&Number.isFinite(plot.value)?formatValue(plot.value):DATA_WINDOW_EMPTY}));
  if(!isCurrent())return null;
  // Formatting and even the final UI guard can reenter source/native publication.
  view.assertCurrent();return parts;
 }catch{return null;}
}
