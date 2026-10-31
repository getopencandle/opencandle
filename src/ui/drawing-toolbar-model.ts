// Left drawing toolbar model: helpers over the reference catalog (src/ui/drawing-tool-catalog.ts) mapped
// onto the renderer's registered drawing types. A leaf only selects a tool when the renderer registers an
// equivalent type; every other leaf carries an explicit unavailable reason instead of a substitute.
import {DRAWING_TOOL_CATALOG,type DrawingMode,type DrawingToolGroup,type DrawingToolLeaf} from './drawing-tool-catalog';
import {LV_OWNED_DRAWING_TYPE} from './drawing-favorites';
import {CURSOR_PATCH_ABSENT,type CursorKind} from '../chart/cursor-kind';
export type {DrawingHotkey,DrawingMode,DrawingToolGroup,DrawingToolLeaf,DrawingToolSection,DrawingToolTarget} from './drawing-tool-catalog';
export interface DrawingCatalogRow{type:string;label:string;group:string}
/** modes: true enables every renderer mode; a list enables only those (e.g. measure while eraser awaits review). */
export interface DrawingToolContext{modes:boolean|readonly DrawingMode[];/** Cursor kinds the host has connected to the renderer (Cross needs none). */cursorKinds?:readonly CursorKind[]}
export type LeafState={state:'available'}|{state:'unavailable';reason:string;alternative?:string};
/** Toolbar groups plus the groups that stay reachable off the toolbar (the All drawing tools dialog,
 * favorites and labels) without being rendered as a left-toolbar group. */
export type DrawingToolGroupList=DrawingToolGroup[]&{readonly offToolbar?:readonly DrawingToolGroup[]};

/** Reference taxonomy in reference order (8 groups: 7 tool groups and Icons). */
export const REFERENCE_DRAWING_GROUPS:readonly DrawingToolGroup[]=DRAWING_TOOL_CATALOG;

/** DW.UTILITY.MEASURE is a standalone toolbar control, not a flyout leaf. */
export const MEASURE_LEAF:DrawingToolLeaf=Object.freeze<DrawingToolLeaf>({id:'DW.UTILITY.MEASURE',label:'Measure',hint:'Shift + Click on the chart',target:{kind:'mode',mode:'measure'},note:'Transient ruler; nothing is saved.'});
export const ADDITIONAL_GROUP_ID='additional';
/** Readable section titles for renderer group keys in the additional group. */
const EXTRA_SECTION_LABELS:Readonly<Record<string,string>>=Object.freeze({lines:'Lines',shapes:'Shapes',annotations:'Annotations',channels:'Channels',pitchforks:'Pitchforks',stamps:'Stamps',fibonacci:'Fibonacci',geometry:'Geometry',patterns:'Harmonic patterns',measure:'Measure',priceaction:'Price action'});
/** Accessible name of a group's main button: the tool it arms ("Trendline", "Fib retracement"), or "Cursor" for the cross cursor. */
export const mainButtonName=(leaf:DrawingToolLeaf)=>leaf.target.kind==='cursor'&&!leaf.target.cursor?'Cursor':leaf.label;

const referencedTypes=(groups:readonly DrawingToolGroup[])=>new Set(groups.flatMap(group=>group.sections.flatMap(row=>row.leaves.flatMap(leaf=>leaf.target.kind==='tool'?[leaf.target.type]:leaf.target.kind==='unavailable'&&leaf.target.alternative?[leaf.target.alternative]:[]))));
/** The reference groups for the left toolbar. Tool leaves whose type the renderer does not register
 * become unavailable rather than silently disappearing. Renderer types outside the reference inventory
 * are returned in `offToolbar` (one explicitly labelled group) so they stay selectable from the All
 * drawing tools dialog and keep working as favorites, without adding a ninth toolbar group. */
export function buildDrawingToolGroups(catalog:readonly DrawingCatalogRow[]):DrawingToolGroupList{
 const known=new Set(catalog.map(row=>row.type));
 const full=REFERENCE_DRAWING_GROUPS.map(group=>({...group,sections:group.sections.map(row=>({...row,leaves:row.leaves.map(leaf=>leaf.target.kind==='tool'&&!known.has(leaf.target.type)?{...leaf,target:{kind:'unavailable' as const,reason:'This renderer build does not register the "'+leaf.target.type+'" drawing type.'}}:leaf.target.kind==='unavailable'&&leaf.target.alternative&&!known.has(leaf.target.alternative)?{...leaf,target:{kind:'unavailable' as const,reason:leaf.target.reason}}:leaf)}))}));
 // Leaves the renderer cannot run are hidden from the toolbar (the catalog keeps them for fidelity tracking); emptied sections and groups go too.
 const groups:DrawingToolGroupList=full.map(group=>({...group,sections:group.sections.map(row=>({...row,leaves:row.leaves.filter(leaf=>leaf.target.kind!=='unavailable')})).filter(row=>row.leaves.length)})).filter(group=>group.sections.length);
 const used=referencedTypes(REFERENCE_DRAWING_GROUPS),extra=catalog.filter(row=>!used.has(row.type)),title=(name:string)=>EXTRA_SECTION_LABELS[name]??name.charAt(0).toUpperCase()+name.slice(1);
 const offToolbar:DrawingToolGroup[]=[];
 if(extra.length){const sections=[...new Set(extra.map(row=>row.group))].map(name=>({id:'LV.EXTRA.'+name.toUpperCase(),label:title(name),leaves:extra.filter(row=>row.group===name).map(row=>({id:'LV.EXTRA.'+row.type,label:row.label,target:{kind:'tool' as const,type:row.type},note:'OpenCandle renderer tool outside the reference inventory.'}))}));offToolbar.push({id:ADDITIONAL_GROUP_ID,label:'More OpenCandle tools',glyph:'⋯',sections});}
 Object.defineProperty(groups,'offToolbar',{value:Object.freeze(offToolbar),enumerable:false});
 return groups;
}
/** Toolbar groups followed by the off-toolbar groups (dialog order). */
export const dialogGroups=(groups:DrawingToolGroupList|readonly DrawingToolGroup[]):DrawingToolGroup[]=>[...groups,...((groups as DrawingToolGroupList).offToolbar??[])];
/** Formatted reference shortcut of a leaf, when this build performs it. */
export const leafShortcut=(leaf:DrawingToolLeaf):string|null=>leaf.hotkey?.bound?leaf.hotkey.keys:null;

export function leafState(leaf:DrawingToolLeaf,context:DrawingToolContext):LeafState{
 const target=leaf.target;
 if(target.kind==='unavailable')return{state:'unavailable',reason:target.reason,...target.alternative?{alternative:target.alternative}:{}};
 if(target.kind==='mode'&&!(context.modes===true||(Array.isArray(context.modes)&&context.modes.includes(target.mode))))return{state:'unavailable',reason:'Coming soon.'};
 if(target.kind==='cursor'&&target.cursor&&target.cursor!=='cross'&&!(context.cursorKinds??[]).includes(target.cursor))return{state:'unavailable',reason:CURSOR_PATCH_ABSENT};
 return{state:'available'};
}
/** Every leaf of the toolbar groups and of any off-toolbar groups (see DrawingToolGroupList). */
export const allLeaves=(groups:DrawingToolGroupList|readonly DrawingToolGroup[])=>dialogGroups(groups).flatMap(group=>group.sections.flatMap(row=>row.leaves.map(leaf=>({group,section:row,leaf}))));
export function leafIsActive(leaf:DrawingToolLeaf,activeTool:string|null,activeMode:DrawingMode|null,activeCursor:CursorKind='cross'){const target=leaf.target;return target.kind==='tool'?activeTool===target.type&&!activeMode:target.kind==='mode'?activeMode===target.mode:target.kind==='cursor'?!activeTool&&!activeMode&&(target.cursor??'cross')===activeCursor:false;}
export function groupOfTool(groups:readonly DrawingToolGroup[],type:string|null):string|null{if(!type)return null;return allLeaves(groups).find(row=>row.leaf.target.kind==='tool'&&row.leaf.target.type===type)?.group.id??null;}
export function toolLabel(groups:readonly DrawingToolGroup[],type:string):string|null{return allLeaves(groups).find(row=>row.leaf.target.kind==='tool'&&row.leaf.target.type===type)?.leaf.label??null;}
/** Leaf the main group button acts on: the session's last chosen available leaf, else the first available one. */
export function groupDefaultLeaf(group:DrawingToolGroup,lastLeafId:string|undefined,context:DrawingToolContext):DrawingToolLeaf|null{
 const leaves=group.sections.flatMap(row=>row.leaves),usable=(leaf:DrawingToolLeaf)=>leafState(leaf,context).state==='available';
 return leaves.find(leaf=>leaf.id===lastLeafId&&usable(leaf))??leaves.find(usable)??null;
}
const normalize=(value:string)=>value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9+]+/g,' ').trim();
/** Case/punctuation-insensitive search; every whitespace-separated term must match the label, aliases, section or group. */
export function searchDrawingTools(groups:readonly DrawingToolGroup[],query:string){
 const terms=normalize(query).split(' ').filter(Boolean);
 return allLeaves(groups).filter(({group,section,leaf})=>{const haystack=normalize([leaf.label,...leaf.aliases??[],section.label,group.label,leaf.target.kind==='tool'?leaf.target.type:''].join(' '));return terms.every(term=>haystack.includes(term));});
}
/** Roving focus inside a flyout: wraps on arrows, Home/End jump; other keys keep the index. */
export function nextFocusIndex(count:number,current:number,key:string):number{
 if(count<=0)return -1;
 if(key==='ArrowDown')return current<0?0:(current+1)%count;
 if(key==='ArrowUp')return current<0?count-1:(current-1+count)%count;
 if(key==='Home')return 0;
 if(key==='End')return count-1;
 return current;
}
/** Favorites are kept as tool types; unknown or unavailable types are dropped and duplicates removed. */
export function normalizeFavorites(groups:readonly DrawingToolGroup[],favorites:readonly unknown[]):string[]{
 const usable=new Set(allLeaves(groups).flatMap(row=>row.leaf.target.kind==='tool'?[row.leaf.target.type]:[]));
 return [...new Set(favorites.filter((value):value is string=>typeof value==='string'&&usable.has(value)))];
}
/** The saved favorites a change must carry forward: available tools plus retained OpenCandle-owned ids whose
 * type is not registered in this build (inert, removable; see restoreDrawingFavorites). Order is kept. */
export function savedFavoriteList(groups:readonly DrawingToolGroup[],favorites:readonly unknown[]):string[]{
 const usable=new Set(allLeaves(groups).flatMap(row=>row.leaf.target.kind==='tool'?[row.leaf.target.type]:[]));
 return [...new Set(favorites.filter((value):value is string=>typeof value==='string'&&(usable.has(value)||LV_OWNED_DRAWING_TYPE.test(value))))];
}
export function toggleFavorite(groups:readonly DrawingToolGroup[],favorites:readonly string[],type:string):string[]{
 const current=savedFavoriteList(groups,favorites);if(!normalizeFavorites(groups,[type]).length&&!current.includes(type))throw new Error('Only available drawing tools can be favorites: '+type);
 return current.includes(type)?current.filter(value=>value!==type):[...current,type];
}
/** Removes one saved favorite (available or not), keeping every other entry in order. */
export function removeFavorite(groups:readonly DrawingToolGroup[],favorites:readonly string[],type:string):string[]{return savedFavoriteList(groups,favorites).filter(value=>value!==type);}
/** Label for a saved favorite: the toolbar/dialog label, else the reference row label of an unregistered
 * OpenCandle type, else a neutral name (never the raw id). */
export function favoriteLabel(groups:readonly DrawingToolGroup[],type:string):string{
 return toolLabel(groups,type)??allLeaves(REFERENCE_DRAWING_GROUPS).find(row=>row.leaf.target.kind==='tool'&&row.leaf.target.type===type)?.leaf.label??'Unavailable drawing tool';
}
/** Pointer-down outside the toolbar dismisses an open flyout. Returns the cleanup. */
export function installOutsideDismiss(doc:Pick<Document,'addEventListener'|'removeEventListener'>,root:{contains(node:Node|null):boolean}|null,dismiss:()=>void):()=>void{
 const handler=(event:Event)=>{if(!root||!root.contains(event.target as Node|null))dismiss();};
 doc.addEventListener('pointerdown',handler,true);return()=>doc.removeEventListener('pointerdown',handler,true);
}
/** Short, mutually distinct glyphs for the favorites strip: word initials, extended with more letters, then a number. */
export function favoriteGlyphs(labels:readonly string[]):string[]{
 const words=labels.map(label=>label.split(/[\s/&()-]+/).filter(Boolean)),base=words.map(list=>list.slice(0,3).map(word=>word[0]!.toUpperCase()).join('')||'?');
 const out=base.map((glyph,index)=>{if(base.filter(other=>other===glyph).length===1)return glyph;const last=words[index]!.at(-1)??'';return glyph+last.slice(1,3).toLowerCase();});
 return out.map((glyph,index)=>out.filter(other=>other===glyph).length===1?glyph:glyph+(out.slice(0,index).filter(other=>other===glyph).length+1));
}
