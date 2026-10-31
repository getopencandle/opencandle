// Visual gallery: read-only catalog facts, imported in the page through the Vite dev server so every module is the
// same instance the app uses. Nothing here changes app state; it only lists indicators and drawing tools and asks each
// drawing type for its anchor schema on a throwaway instance that is never added to a chart.
import {createDrawing} from '@luxalgo/vela';
import {INDICATOR_KINDS} from '../../src/chart/indicator-settings';
import {indicatorNames,indicatorAcronyms} from '../../src/ui/indicator-dialog-model';
import {selectorCategoryOf} from '../../src/domain/indicator-selector-catalog';
import {DRAWING_TOOL_CATALOG} from '../../src/ui/drawing-tool-catalog';

export function galleryCatalog(){
 const indicators=(INDICATOR_KINDS as readonly string[]).map(id=>({id,name:(indicatorNames as Record<string,string>)[id]??id,acronym:(indicatorAcronyms as Record<string,string>)[id]??'',category:selectorCategoryOf({id})}));
 const drawings:Array<Record<string,unknown>>=[];
 for(const group of DRAWING_TOOL_CATALOG)for(const section of group.sections)for(const leaf of section.leaves){
  if(leaf.target.kind!=='tool')continue;
  const type=leaf.target.type;let schema:{min:number;max:number}|null=null,mode:string|null=null,error:string|null=null;
  try{const drawing=createDrawing(type as never,{paneId:'gallery-probe'});if(drawing){const s=drawing.anchorSchema();schema={min:s.min,max:s.max};mode=drawing.placementMode();}else error='createDrawing returned null';}
  catch(cause){error=String(cause instanceof Error?cause.message:cause);}
  drawings.push({id:leaf.id,label:leaf.label,type,group:group.label,groupId:group.id,section:section.label,opensFlyout:!!group.opensFlyout,schema,mode,error});
 }
 return {indicators,drawings};
}
