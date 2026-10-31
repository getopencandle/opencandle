import {describe,it,expect} from 'vitest';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {createLayoutLibrary,restoreLayoutLibrary,prepareLayoutSave,renameSavedLayout,duplicateSavedLayout,openedLayout,deleteSavedLayout,favoriteSavedLayout,layoutSearch,layoutIsDirty} from '../../src/ui/layout-library';
import {historicalChartWorkspace,changedChartGrid} from '../../src/ui/workspace-history';
import {projectGrid} from '../../src/ui/workspace-grid';
describe('named local layout data ownership',()=>{
 it('migrates only an absent library from the exact legacy grid rather than current defaults',()=>{
  const defaults=createInitialWorkspace(),saved=createInitialWorkspace(),legacy={...saved};delete legacy.layoutLibrary;
  const restored=restoreWorkspace(legacy,defaults);expect(restored.layoutLibrary!.activeId).toBe(saved.grid!.layout.id);expect(restored.layoutLibrary!.entries[0].grid).toEqual(saved.grid);expect(restored.layoutLibrary!.entries[0].grid).not.toBe(saved.grid);
  for(const value of [null,undefined,{}, {schemaVersion:2}])expect(()=>restoreWorkspace({...legacy,layoutLibrary:value} as any,defaults)).toThrow();
  let reads=0;const hostile={...legacy};Object.defineProperty(hostile,'layoutLibrary',{enumerable:true,get(){reads++;return saved.layoutLibrary;}});expect(()=>restoreWorkspace(hostile,defaults)).toThrow();expect(reads).toBe(0);
 });
 it('save candidates do not mutate the old saved snapshot or the working draft',()=>{
  const state=createInitialWorkspace(),book=state.layoutLibrary!,grid=structuredClone(state.grid!);grid.cells[grid.layout.activeCellId].appearance.background='#123456';
  const candidate=prepareLayoutSave(book,grid,100);expect(book.entries[0].savedAt).toBe(0);expect(layoutIsDirty(book,grid)).toBe(true);expect(layoutIsDirty(candidate,grid)).toBe(false);grid.cells[grid.layout.activeCellId].appearance.background='#abcdef';expect(layoutIsDirty(candidate,grid)).toBe(true);expect(candidate.entries[0].grid.cells[grid.layout.activeCellId].appearance.background).toBe('#123456');
 });
 it('duplicate allocates only layout and cell identities and preserves detached opaque graph references',()=>{
  const state=createInitialWorkspace(),grid=state.grid!,cell=grid.cells[grid.layout.activeCellId];cell.drawings={version:1,drawings:[{id:'opaque-one',type:'future-tool',metadata:{pane:'pane-one',pair:'opaque-one'}}]};
  let index=0;const copy=duplicateSavedLayout(state.layoutLibrary!,grid,grid,'Copy',100,()=> 'copy-'+(++index));expect(copy.entry.id).toBe('copy-1');expect(copy.entry.grid.layout.activeCellId).toBe('copy-2');expect(copy.entry.grid.cells['copy-2'].drawings).toEqual(cell.drawings);expect(copy.entry.grid.cells['copy-2'].drawings).not.toBe(cell.drawings);expect(state.layoutLibrary!.entries).toHaveLength(1);
  expect(restoreLayoutLibrary(copy.library,grid).entries).toHaveLength(2);const opened=openedLayout(copy.library,copy.entry.id);expect(opened.grid).not.toBe(copy.entry.grid);expect(opened.library.activeId).toBe(copy.entry.id);expect(deleteSavedLayout(opened.library,grid.layout.id).entries).toHaveLength(1);expect(()=>deleteSavedLayout(opened.library,copy.entry.id)).toThrow('replacement');
 });
 it('names and favorites have deterministic searchable order without mutating chart state',()=>{
  const state=createInitialWorkspace(),grid=state.grid!;let i=0;const duplicated=duplicateSavedLayout(state.layoutLibrary!,grid,grid,'Zebra',100,()=> 'new-'+(++i));const renamed=renameSavedLayout(duplicated.library,grid,grid.layout.id,' Alpha ');expect(renamed.grid.layout.name).toBe('Alpha');expect(renamed.library.entries[0].grid.layout.name).toBe('Alpha');const favorite=favoriteSavedLayout(renamed.library,duplicated.entry.id);expect(layoutSearch(favorite,'').map(row=>row.name)).toEqual(['Zebra','Alpha']);expect(layoutSearch(favorite,'ALP').map(row=>row.name)).toEqual(['Alpha']);for(const name of ['', 'x'.repeat(201),'bad\nname'])expect(()=>renameSavedLayout(favorite,renamed.grid,grid.layout.id,name)).toThrow();
 });
 it('validates inactive chart sources and comparisons, not just the active grid',()=>{
  const state=createInitialWorkspace();let i=0;const copy=duplicateSavedLayout(state.layoutLibrary!,state.grid!,state.grid!,'Other',100,()=> 'other-'+(++i));const next={...state,layoutLibrary:copy.library};copy.entry.grid.cells[copy.entry.grid.layout.activeCellId].datasetId='missing-source';expect(()=>restoreWorkspace(next,state)).toThrow('unavailable');
 });
 it('history restores charts over current globals and library, retaining the renamed active title',()=>{
  const before=createInitialWorkspace(),current={...before,watchlist:['SPY'],news:{...before.news},customGlobal:{newValue:77}};const renamed=renameSavedLayout(before.layoutLibrary!,before.grid!,before.grid!.layout.id,'Renamed');const latest=projectGrid({...current,layoutLibrary:renamed.library},renamed.grid);const historical=historicalChartWorkspace(latest,before);expect(historical.watchlist).toBe(latest.watchlist);expect(historical.news).toBe(latest.news);expect(historical.layoutLibrary).toBe(latest.layoutLibrary);expect(historical.customGlobal).toBe(latest.customGlobal);expect(historical.grid!.layout.name).toBe('Renamed');expect(changedChartGrid(before,{...before,news:current.news})).toBe(false);expect(()=>historicalChartWorkspace(latest,createInitialWorkspace())).toThrow('different layout');
 });
 it('rejects duplicate cross-layout chart IDs and broken active references',()=>{
  const state=createInitialWorkspace(),book=createLayoutLibrary(state.grid!);expect(()=>restoreLayoutLibrary({...book,activeId:'missing'},state.grid!)).toThrow('active');const other=structuredClone(book.entries[0]);other.id='different';other.grid.layout.id='different';expect(()=>restoreLayoutLibrary({...book,entries:[...book.entries,other]},state.grid!)).toThrow('shared');
 });
 it('admits 128 named entries then rejects without allocation or eviction',()=>{
  const state=createInitialWorkspace();let book=state.layoutLibrary!,sequence=0;
  for(let i=1;i<128;i++)book=duplicateSavedLayout(book,state.grid!,state.grid!,'Layout '+i,100,()=> 'capacity-'+(++sequence)).library;
  const before=JSON.stringify(book),calls=sequence;expect(book.entries).toHaveLength(128);expect(()=>duplicateSavedLayout(book,state.grid!,state.grid!,'Too many',100,()=> 'capacity-'+(++sequence))).toThrow('128-layout');expect(sequence).toBe(calls);expect(JSON.stringify(book)).toBe(before);
 });
 it('bounds allocator collisions and rejects aggregate oversized library input before allocation',()=>{
  const state=createInitialWorkspace();let calls=0;expect(()=>duplicateSavedLayout(state.layoutLibrary!,state.grid!,state.grid!,'Copy',100,()=>{calls++;return state.grid!.layout.id;})).toThrow('unique');expect(calls).toBe(8);
  const oversized=structuredClone(state.layoutLibrary!);(oversized.entries[0].grid as any).large='x'.repeat(32*1024*1024);calls=0;expect(()=>duplicateSavedLayout(oversized,state.grid!,state.grid!,'Copy',100,()=>{calls++;return 'new';})).toThrow('32 MiB');expect(calls).toBe(0);expect(oversized.entries).toHaveLength(1);
 });
});
