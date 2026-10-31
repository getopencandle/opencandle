import {createHash} from 'node:crypto';
import {createDrawing,drawingTypes,getDrawingType} from '@luxalgo/vela';
import {lvDrawingTypeStatus} from '../../src/chart/lv-drawing-types';
import {FACTORY_DEFAULTS_UNAPPLIED,factoryDefaultDefinitions,factoryDefaultsStatus} from '../../src/chart/drawing-factory-defaults';
import {drawingCatalog} from '../../src/chart/drawing-port';
import {DRAWING_TOOL_CATALOG} from '../../src/ui/drawing-tool-catalog';
import {DIALOG_SPECS,DIALOG_UNAVAILABLE,dialogSpecFor,dialogTabsFor} from '../../src/ui/drawing-dialog-spec';

// equivalence snapshot: the complete effective output of the drawing catalog, factory defaults, dialog
// specs and type registration (SYNTHETIC probe records, fixed ids and times). Captured before the per-tool
// registry refactor and compared after it (tests/chart/lv-drawing-registry-equivalence.test.ts).
const plain=(value:unknown)=>JSON.parse(JSON.stringify(value,(_key,item)=>item===undefined?'__undefined__':item));
export function drawingRegistrySnapshot(){
 const types=drawingTypes().map(meta=>String(meta.type));
 const registered=types.map(type=>{
  const meta=getDrawingType(type as never)!;
  const sample=createDrawing(type as never,{id:'dwgap0-probe',paneId:'price',createdAt:0} as never);
  const anchors=sample?.anchorSchema();
  return{type,group:meta.group,label:meta.label,icon:meta.icon,defaultStyle:meta.defaultStyle,
   sample:sample?sample.serialize():null,anchorSchema:anchors?{min:anchors.min,max:anchors.max,roles:(anchors.slots??[]).map(slot=>slot.role)}:null,
   schema:sample?sample.schema():null,dialogTabs:dialogTabsFor(type),dialogTool:dialogSpecFor(type)?.toolId??null};
 });
 return plain({
  catalog:DRAWING_TOOL_CATALOG,
  factoryDefinitions:factoryDefaultDefinitions(),factoryUnapplied:FACTORY_DEFAULTS_UNAPPLIED,factoryStatus:factoryDefaultsStatus(),
  dialogSpecs:DIALOG_SPECS,dialogUnavailable:DIALOG_UNAVAILABLE,
  lvStatus:lvDrawingTypeStatus(),
  portCatalog:drawingCatalog(),
  registered,
 });
}
export const snapshotSha256=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
