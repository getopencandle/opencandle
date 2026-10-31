import {expect,it} from 'vitest';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createLayoutLibrary,restoreLayoutLibrary,duplicateSavedLayout,prepareLayoutSave,renameSavedLayout,favoriteSavedLayout,layoutIsDirty,openedLayout,deleteSavedLayout} from '../../src/ui/layout-library';

const fixture=()=>{const grid=createInitialWorkspace().grid!;return {grid,book:createLayoutLibrary(grid)};};
it('rejects explicit malformed libraries without invoking a grid validator or any getters',()=>{
 const {grid,book}=fixture();let reads=0,validations=0;
 const getter={...book};Object.defineProperty(getter,'entries',{enumerable:true,get(){reads++;return book.entries;}});
 const hidden={...book};Object.defineProperty(hidden,'autosave',{value:true,enumerable:false});
 const sparse={...book,entries:new Array(1)};
 for(const value of [null,undefined,{},getter,hidden,sparse,{...book,activeId:'missing'},{...book,schemaVersion:2}])expect(()=>restoreLayoutLibrary(value,grid,()=>{validations++;})).toThrow();
 expect(reads).toBe(0);expect(validations).toBeLessThanOrEqual(1);
});
it('duplicates globally fresh cells while retaining detached cell-local opaque identities',()=>{
 const {grid,book}=fixture(),cell=grid.layout.cells[0].id;
 grid.cells[cell].drawings={version:1,drawings:[{id:'dw-opaque',type:'future-tool',paneId:'pane-local',future:{owner:'study-local',drawing:'dw-opaque'}}],lvDrawingManager:{schemaVersion:1,groups:[{id:'group-local',memberIds:['dw-opaque']}],templates:[]}};
 const original=structuredClone(grid),ids=[grid.layout.id,cell,'layout-copy',cell,'cell-copy'];let calls=0;
 const copy=duplicateSavedLayout(book,grid,grid,'Copied',10,()=>{calls++;if(calls===1){Object.defineProperty(grid.cells[cell].drawings,'late',{enumerable:true,get(){throw Error('Allocator must not reach detached source');}});}return ids.shift()!;});
 expect(copy.entry.id).toBe('layout-copy');expect(copy.entry.grid.layout.cells[0].id).toBe('cell-copy');expect(copy.entry.grid.layout.activeCellId).toBe('cell-copy');
 expect(copy.entry.grid.cells['cell-copy'].drawings).toEqual(original.cells[cell].drawings);expect(copy.entry.grid.cells['cell-copy'].drawings).not.toBe(original.cells[cell].drawings);
 expect(copy.library.entries[0]).toEqual(book.entries[0]);expect(book.entries).toHaveLength(1);
});
it('keeps a recovery draft dirty until a proposed saved snapshot is durably accepted by its caller',()=>{
 const {grid,book}=fixture();expect(layoutIsDirty(book,grid)).toBe(true);
 const candidate=prepareLayoutSave(book,grid,100);expect(layoutIsDirty(candidate,grid)).toBe(false);expect(layoutIsDirty(book,grid)).toBe(true);
 const working=structuredClone(grid);working.cells[working.layout.activeCellId].themeId='changed';expect(layoutIsDirty(candidate,working)).toBe(true);expect(openedLayout(candidate,candidate.activeId).grid).toEqual(grid);
 expect(()=>deleteSavedLayout(candidate,candidate.activeId)).toThrow();
});
it('rejects exhausted entry revisions before returning save rename or favorite candidates',()=>{
 const {grid,book}=fixture();book.entries[0].revision=Number.MAX_SAFE_INTEGER;
 for(const operation of [()=>prepareLayoutSave(book,grid,100),()=>renameSavedLayout(book,grid,book.activeId,'New'),()=>favoriteSavedLayout(book,book.activeId)])expect(operation).toThrow();
 expect(book.entries[0].revision).toBe(Number.MAX_SAFE_INTEGER);expect(book.entries[0].name).toBe(grid.layout.name);
});
it('rejects a save timestamp preceding the existing entry creation time without changing prior data',()=>{
 const {grid,book}=fixture();book.entries[0].createdAt=100;book.entries[0].savedAt=100;
 const original=structuredClone(book);expect(()=>prepareLayoutSave(book,grid,99)).toThrow();expect(book).toEqual(original);
});
it('refuses aggregate active plus saved duplication capacity before invoking an ID allocator',()=>{
 const grid=createInitialWorkspace().grid!,metadata='x'.repeat(11*1024*1024);grid.cells[grid.layout.activeCellId].drawings.futureMetadata=metadata;
 const book=createLayoutLibrary(grid);let allocations=0;
 expect(()=>duplicateSavedLayout(book,grid,grid,'Over capacity',100,()=>{allocations++;return 'must-not-allocate';})).toThrow(/32 MiB|limit/i);
 expect(allocations).toBe(0);expect(book.entries).toHaveLength(1);expect(book.entries[0].grid.cells[grid.layout.activeCellId].drawings.futureMetadata).toBe(metadata);
});
