// Drawing tool reference files: a catalog row's file is named from its row id (DW.TREND.RAY -> dw-trend-ray), else
// the file of the drawing type the row arms (fibretracement, position, ...). The drawing settings dialog knows only
// the drawing type, so a type resolves to its own file first, then to the file of the first row that arms it.
import {DRAWING_TOOL_CATALOG,type DrawingToolLeaf} from './drawing-tool-catalog';
import {referenceFileFor} from './tool-reference';

export const drawingRowFileName=(rowId:string):string=>rowId.toLowerCase().replace(/[._]/g,'-');
export const drawingCatalogRows=():DrawingToolLeaf[]=>DRAWING_TOOL_CATALOG.flatMap(group=>group.sections.flatMap(part=>part.leaves));
export function drawingRowReference(leaf:DrawingToolLeaf):string|null{
 return referenceFileFor(drawingRowFileName(leaf.id))??(leaf.target.kind==='tool'?referenceFileFor(leaf.target.type):null);
}
let byType:Map<string,string>|null=null;
export function drawingTypeReference(type:string):string|null{
 if(typeof type!=='string'||!type)return null;
 const own=referenceFileFor(type);if(own)return own;
 if(!byType){byType=new Map();for(const leaf of drawingCatalogRows()){if(leaf.target.kind!=='tool'||byType.has(leaf.target.type))continue;const file=drawingRowReference(leaf);if(file)byType.set(leaf.target.type,file);}}
 return byType.get(type)??null;
}
