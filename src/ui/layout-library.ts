import type {MultiChartState} from './MultiChartGrid';
import {assertGridTracks} from '../chart/layout-tracks';
import {measureWorkspaceJSON} from './workspace-json';
import {sameWorkspace} from './workspace-grid';

export const LAYOUT_LIBRARY_LIMIT=128;
export interface SavedLayout {id:string;name:string;revision:number;createdAt:number;savedAt:number;favorite:boolean;grid:MultiChartState}
export interface LayoutLibrary {schemaVersion:1;activeId:string;autosave:boolean;entries:SavedLayout[]}
export type LayoutGridValidator=(grid:MultiChartState)=>void;
const fail=(message:string):never=>{throw new Error(message);};
const identifier=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(value);
function keys(value:unknown,expected:string[],label:string):asserts value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('Invalid '+label+'.');
 const actual=Reflect.ownKeys(value as object);if(actual.length!==expected.length||actual.some(key=>typeof key!=='string'||!expected.includes(key)))fail('Unsupported '+label+' fields.');
 for(const key of actual){const descriptor=Object.getOwnPropertyDescriptor(value,key)!;if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail('Invalid '+label+' property.');}
}
export function layoutName(value:unknown):string{
 if(typeof value!=='string')fail('Enter a layout name.');const name=(value as string).trim();
 if(!name||name.length>200||/[\u0000-\u001f\u007f]/.test(name))fail('Use a layout name of 1 to 200 characters without control characters.');return name;
}
function timestamp(value:number):number{if(!Number.isSafeInteger(value)||value<0||value>8640000000000000)fail('Invalid layout timestamp.');return value;}
function nextRevision(value:number):number{if(!Number.isSafeInteger(value)||value<1||value>=Number.MAX_SAFE_INTEGER)fail('The layout revision cannot advance safely.');return value+1;}
function assertGridShape(grid:MultiChartState):void{
 if(!grid||grid.schemaVersion!==1||!grid.layout||!identifier(grid.layout.id)||!Array.isArray(grid.layout.cells)||grid.layout.cells.length<1||grid.layout.cells.length>16||!grid.cells||typeof grid.cells!=='object')fail('Invalid saved layout grid.');
 assertGridTracks(grid);
 const ids=grid.layout.cells.map(row=>row.id);if(ids.some(id=>!identifier(id))||new Set(ids).size!==ids.length||Object.keys(grid.cells).length!==ids.length||ids.some(id=>!Object.hasOwn(grid.cells,id))||!ids.includes(grid.layout.activeCellId)||grid.layout.maximizedCellId!==null&&!ids.includes(grid.layout.maximizedCellId))fail('Invalid saved chart identities.');
}
/** Missing-only migration. Callers must first validate the exact legacy chart grid. */
export function createLayoutLibrary(grid:MultiChartState):LayoutLibrary{
 measureWorkspaceJSON({grid});assertGridShape(grid);const name=layoutName(grid.layout.name),copy=structuredClone(grid);copy.layout.name=name;
 return{schemaVersion:1,activeId:copy.layout.id,autosave:true,entries:[{id:copy.layout.id,name,revision:1,createdAt:0,savedAt:0,favorite:false,grid:copy}]};
}
export function restoreLayoutLibrary(value:unknown,working:MultiChartState,validateGrid:LayoutGridValidator=assertGridShape):LayoutLibrary{
 measureWorkspaceJSON({library:value,working});keys(value,['schemaVersion','activeId','autosave','entries'],'layout library');
 if(value.schemaVersion!==1||!identifier(value.activeId)||typeof value.autosave!=='boolean'||!Array.isArray(value.entries)||value.entries.length<1||value.entries.length>LAYOUT_LIBRARY_LIMIT)fail('Invalid layout library.');
 const layouts=new Set<string>(),cells=new Set<string>();
 for(const candidate of value.entries as unknown[]){keys(candidate,['id','name','revision','createdAt','savedAt','favorite','grid'],'saved layout');const row=candidate as unknown as SavedLayout;
  if(!identifier(row.id)||layouts.has(row.id)||layoutName(row.name)!==row.name||!Number.isSafeInteger(row.revision)||row.revision<1||typeof row.favorite!=='boolean'||timestamp(row.savedAt)<timestamp(row.createdAt))fail('Invalid or duplicate saved layout.');
  layouts.add(row.id);assertGridShape(row.grid);if(row.grid.layout.id!==row.id||row.grid.layout.name!==row.name)fail('Saved layout identity or name disagrees with its grid.');validateGrid(row.grid);
  for(const cell of row.grid.layout.cells){if(cells.has(cell.id))fail('A chart identity is shared by different saved layouts.');cells.add(cell.id);}
 }
 const book=value as unknown as LayoutLibrary,active=book.entries.find(row=>row.id===book.activeId);assertGridShape(working);
 if(!active||working.layout.id!==book.activeId||working.layout.name!==active.name)fail('The active layout is missing or disagrees with the working grid.');
 const inactive=new Set(book.entries.filter(row=>row.id!==book.activeId).flatMap(row=>row.grid.layout.cells.map(cell=>cell.id)));
 if(working.layout.cells.some(cell=>inactive.has(cell.id)))fail('The working chart belongs to another saved layout.');
 return structuredClone(book);
}
export function activeSavedLayout(book:LayoutLibrary):SavedLayout{return book.entries.find(row=>row.id===book.activeId)??fail('The active saved layout is missing.');}
export function layoutIsDirty(book:LayoutLibrary,working:MultiChartState):boolean{const saved=activeSavedLayout(book);return saved.savedAt===0||!sameWorkspace({grid:saved.grid},{grid:working});}
export function layoutSearch(book:LayoutLibrary,query:string):SavedLayout[]{const match=query.trim().toLocaleLowerCase('en-US');return book.entries.filter(row=>row.name.toLocaleLowerCase('en-US').includes(match)).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||(a.name<b.name?-1:a.name>b.name?1:0)||(a.id<b.id?-1:a.id>b.id?1:0));}
function replace(book:LayoutLibrary,row:SavedLayout):LayoutLibrary{return{...book,entries:book.entries.map(old=>old.id===row.id?row:old)};}
export function prepareLayoutSave(book:LayoutLibrary,working:MultiChartState,now:number):LayoutLibrary{
 measureWorkspaceJSON({book,working});assertGridShape(working);const old=activeSavedLayout(book);if(working.layout.id!==old.id||working.layout.name!==old.name)fail('The layout changed before saving.');
 const savedAt=timestamp(now);if(savedAt<old.createdAt||savedAt<old.savedAt)fail('The save timestamp precedes the last saved layout. Check the local clock and retry.');
 const next=replace(book,{...old,revision:nextRevision(old.revision),savedAt,grid:structuredClone(working)});measureWorkspaceJSON({book:next,working});return next;
}
export function renameSavedLayout(book:LayoutLibrary,working:MultiChartState,id:string,name:unknown):{library:LayoutLibrary;grid:MultiChartState}{
 const normalized=layoutName(name),old=book.entries.find(row=>row.id===id)??fail('The layout no longer exists.');
 const row={...old,name:normalized,revision:nextRevision(old.revision),grid:{...old.grid,layout:{...old.grid.layout,name:normalized}}};
 return{library:replace(book,row),grid:working.layout.id===id?{...working,layout:{...working.layout,name:normalized}}:working};
}
export function favoriteSavedLayout(book:LayoutLibrary,id:string):LayoutLibrary{const old=book.entries.find(row=>row.id===id)??fail('The layout no longer exists.');return replace(book,{...old,favorite:!old.favorite,revision:nextRevision(old.revision)});}
export function deleteSavedLayout(book:LayoutLibrary,id:string):LayoutLibrary{
 if(id===book.activeId)fail('Open a replacement layout before deleting the active layout.');if(!book.entries.some(row=>row.id===id))fail('The layout no longer exists.');return{...book,entries:book.entries.filter(row=>row.id!==id)};
}
/** Clone before invoking an allocator. Unknown cell-local identities remain intact. */
export function duplicateSavedLayout(book:LayoutLibrary,working:MultiChartState,source:MultiChartState,name:unknown,now:number,makeId:()=>string):{library:LayoutLibrary;entry:SavedLayout}{
 measureWorkspaceJSON({book,working,source});if(book.entries.length>=LAYOUT_LIBRARY_LIMIT)fail('The local layout library has reached its 128-layout resource limit. Export or delete a layout first.');
 const normalized=layoutName(name),time=timestamp(now),owned=structuredClone(book),grid=structuredClone(source),current=structuredClone(working);assertGridShape(grid);
 const occupied=new Set([grid.layout.id,...grid.layout.cells.map(row=>row.id),current.layout.id,...current.layout.cells.map(row=>row.id),...owned.entries.flatMap(row=>[row.id,...row.grid.layout.cells.map(cell=>cell.id)])]);
 const allocate=()=>{for(let i=0;i<8;i++){const id=makeId();if(identifier(id)&&!occupied.has(id)){occupied.add(id);return id;}}return fail('Could not allocate a unique layout identity.');};
 const id=allocate(),remap=new Map(grid.layout.cells.map(row=>[row.id,allocate()]));
 grid.cells=Object.fromEntries(grid.layout.cells.map(row=>[remap.get(row.id)!,grid.cells[row.id]]));
 grid.layout={...grid.layout,id,name:normalized,cells:grid.layout.cells.map(row=>({...row,id:remap.get(row.id)!})),activeCellId:remap.get(grid.layout.activeCellId)!,maximizedCellId:grid.layout.maximizedCellId===null?null:remap.get(grid.layout.maximizedCellId)!};
 const entry:SavedLayout={id,name:normalized,revision:1,createdAt:time,savedAt:time,favorite:false,grid};
 const library={...owned,entries:[...owned.entries,entry]};measureWorkspaceJSON({library,working:current});return{library,entry};
}
export function openedLayout(book:LayoutLibrary,id:string):{library:LayoutLibrary;grid:MultiChartState}{const row=book.entries.find(entry=>entry.id===id)??fail('The saved layout no longer exists.');return{library:{...book,activeId:id},grid:structuredClone(row.grid)};}
export function layoutOwnedCounts(grid:MultiChartState){const cells=Object.values(grid.cells);return{charts:cells.length,drawings:cells.reduce((sum,cell)=>sum+(cell.drawings.drawings as unknown[]).length+(cell.drawingScopes?.inactive??[]).reduce((n,row)=>n+(row.document.drawings as unknown[]).length,0),0),studies:cells.reduce((sum,cell)=>sum+cell.indicators.length+(cell.scriptBindings?.length??0),0)};}
