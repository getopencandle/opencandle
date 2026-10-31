// Pure model of the floating drawing toolbar for one selected drawing (buttons, write routes, sync scope, templates).
// The host (App, ROOT) supplies the chart calls; nothing here touches the chart.
import {BULK_PROPERTY_PATHS,NO_TOOLBAR_DRAWING_TYPES} from '../chart/drawing-template-batch';
import {drawingSyncScope} from '../chart/drawing-linked-plan';
import type {DrawingEditProperty,DrawingSyncScope} from './drawing-edit-bar';
import {templateChoices} from './drawing-dialog-model';

interface EditorField{readonly path:string;readonly kind:string;readonly options?:readonly {value:string}[]}
const TEXT_COLOR:DrawingEditProperty={id:'textColor',path:'text.color',title:'Line tool text colors'};
/** static-drawing-defaults-2#list.fontSizes.floatingToolbar names a "Font size" button for the text tools. The renderer stores named sizes
 * (Small, Normal, Large, Huge), not the reference pixel list 8..40, so the button lists the renderer's own options. */
const FONT_SIZE_PATH='text.size';
/** The tools the fact gives a font size button: Text, Anchored text, Comment, Callout, Price label, Note, Pin and Signpost (Balloon has no renderer type). */
export const FONT_SIZE_TYPES:ReadonlySet<string>=new Set(['text','lvanchoredtext','comment','callout','pricelabel','note','lvpin','signpost']);
/** The single-drawing toolbar buttons: the shared property bar's buttons (rule.floatingToolbar.defaultButtons), plus text color when the
 * drawing has a text color the bar left out, plus Font size for the text tools that have a named text size. Tweet, Idea and Image get none
 * (rule.floatingToolbar.defaultButtons noToolbarWhileSelectedTool). */
export function editBarButtons(bulk:readonly DrawingEditProperty[],fields:readonly EditorField[]|null|undefined,type?:string):DrawingEditProperty[]{
 if(type!==undefined&&NO_TOOLBAR_DRAWING_TYPES.includes(type))return [];
 const out=bulk.map(button=>({...button}));
 const has=(path:string,kind:string)=>(fields??[]).find(field=>field.path===path&&field.kind===kind);
 if(!out.some(button=>button.id==='textColor')&&has(TEXT_COLOR.path,'color')){const at=out.findIndex(button=>button.id==='lineWidth'||button.id==='lineStyle');out.splice(at<0?out.length:at,0,{...TEXT_COLOR});}
 const size=type===undefined||FONT_SIZE_TYPES.has(type)?has(FONT_SIZE_PATH,'select'):undefined;
 if(size?.options?.length)out.push({id:'fontSize',path:FONT_SIZE_PATH,title:'Font size',options:size.options.map(option=>option.value)});
 return out;
}
/** Whether a toolbar write goes through the shared property batch (the five bulk paths) or the drawing's own settings edit. */
export function editBarUsesBulk(path:string):boolean{return BULK_PROPERTY_PATHS.includes(path);}
/** The value a toolbar button shows: the saved row first, else the settings editor's value (a renderer default such as Normal size). */
export function editBarRead(row:Readonly<Record<string,unknown>>,editorValues:Readonly<Record<string,unknown>>|null|undefined,path:string):unknown{
 const saved=path.split('.').reduce<unknown>((value,key)=>value&&typeof value==='object'?(value as Record<string,unknown>)[key]:undefined,row);
 return saved!==undefined?saved:editorValues?.[path];
}
/** The drawing's sync stamp (lvSyncScope), or null when it is not synced. */
export function editBarSyncScope(row:unknown):DrawingSyncScope|null{return drawingSyncScope(row);}
/** The Sync rows' change route for the selected drawing (enables the rows). `write` is the host's one-step write of the
 * drawing's stamp (drawingManager.setSyncScope); without it, or without a drawing, the rows stay disabled with the reason. Picking the
 * scope the drawing already has writes nothing. */
export function editBarSyncChange(row:unknown,write:((scope:DrawingSyncScope|null)=>void)|null|undefined):((scope:DrawingSyncScope|null)=>void)|undefined{
 if(typeof write!=='function'||!row||typeof row!=='object'||typeof (row as {id?:unknown}).id!=='string')return undefined;
 const current=drawingSyncScope(row);
 return scope=>{if(scope!==null&&scope!=='layout'&&scope!=='global')throw Error('Unsupported drawing sync scope');if(scope!==current)write(scope);};
}
/** Saved templates of the drawing's tool, as Template menu rows. */
export function editBarTemplateRows(templates:readonly {id:string;name:string;type:string;properties:Readonly<Record<string,unknown>>}[],type:string):{id:string;name:string}[]{
 return templateChoices(templates,type).map(template=>({id:template.id,name:template.name}));
}
