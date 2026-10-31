import {describe,expect,it} from 'vitest';
import {TRACK_FLOOR,assertGridTracks,dragDivider,dropTracksOnResize,dropStaleTracks,effectiveTracks,equalTracks,gridTemplates,isStaleTracks,keyboardDivider,normalizeTracks,resetDivider,validateLayoutTracks,withTracks,type LayoutTracks} from '../../src/chart/layout-tracks';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {prepareLayoutSave,openedLayout,layoutIsDirty} from '../../src/ui/layout-library';
import {createMultiChartState,resizeMultiChartState,MultiChartGrid} from '../../src/ui/MultiChartGrid';
import {exportLayoutText,previewLayoutText} from '../../src/ui/layout-transfer';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
// LV geometry. Pure model plus the existing save/open/export/import paths. No executable UI evidence.
const sum=(values:number[])=>values.reduce((a,b)=>a+b,0);
describe('layout tracks model',()=>{
 it('equal tracks sum to one with the last track as the remainder, rounded to 1e-6',()=>{
  expect(equalTracks('single')).toEqual({schemaVersion:1,columns:[1],rows:[1]});
  expect(equalTracks('two-columns')).toEqual({schemaVersion:1,columns:[0.5,0.5],rows:[1]});
  const three=equalTracks('three-columns');expect(three.columns).toEqual([0.333333,0.333333,0.333334]);expect(Math.abs(sum(three.columns)-1)).toBeLessThan(1e-9);
  expect(equalTracks('sixteen').columns).toHaveLength(4);expect(equalTracks('ten').columns).toHaveLength(5);expect(equalTracks('ten').rows).toHaveLength(2);
 });
 it('dragging a divider moves only the two adjacent tracks',()=>{
  const start=equalTracks('four');const next=dragDivider(start,'columns',0,0.1);
  expect(next.columns).toEqual([0.6,0.4]);expect(next.rows).toEqual(start.rows);
  const six=dragDivider(equalTracks('six'),'columns',1,0.1);expect(six.columns[0]).toBe(0.333333);expect(six.columns[1]).toBeCloseTo(0.433333,6);expect(six.columns[2]).toBeCloseTo(0.233334,6);expect(sum(six.columns)).toBeCloseTo(1,9);
  const rows=dragDivider(equalTracks('twelve'),'rows',0,-0.05);expect(rows.rows[0]).toBeCloseTo(0.283333,6);expect(rows.rows[1]).toBeCloseTo(0.383333,6);expect(rows.rows[2]).toBeCloseTo(0.333334,6);
 });
 it('the 0.1 floor clamps a drag instead of refusing it',()=>{
  expect(TRACK_FLOOR).toBe(0.1);
  const clamped=dragDivider(equalTracks('two-columns'),'columns',0,0.9);expect(clamped.columns).toEqual([0.9,0.1]);
  const other=dragDivider(equalTracks('two-columns'),'columns',0,-0.9);expect(other.columns).toEqual([0.1,0.9]);
  for(const track of [...clamped.columns,...other.columns])expect(track).toBeGreaterThanOrEqual(0.1);
 });
 it('rounds every stored fraction to 1e-6 and keeps the last track as 1 minus the others',()=>{
  const dragged=dragDivider(equalTracks('three-columns'),'columns',0,0.0123456789);
  for(const value of dragged.columns)expect(Math.round(value*1e6)/1e6).toBe(value);
  expect(dragged.columns[2]).toBe(Math.round((1-dragged.columns[0]-dragged.columns[1])*1e6)/1e6);
  expect(Math.abs(sum(dragged.columns)-1)).toBeLessThanOrEqual(1e-6);
 });
 it('keyboard steps use 0.05',()=>{
  const start=equalTracks('two-rows');
  expect(keyboardDivider(start,'rows',0,'increase').rows).toEqual([0.55,0.45]);expect(keyboardDivider(start,'rows',0,'decrease').rows).toEqual([0.45,0.55]);
 });
 it('double-click resets the two adjacent tracks to equal shares; all equal deletes the tracks',()=>{
  const dragged=dragDivider(equalTracks('three-columns'),'columns',0,0.1);
  const reset=resetDivider(dragged,'columns',0);
  expect(reset).toBeUndefined();
  const twoMoves=dragDivider(dragDivider(equalTracks('three-columns'),'columns',0,0.1),'columns',1,0.1);
  const partial=resetDivider(twoMoves,'columns',0);expect(partial).toBeDefined();expect(partial!.columns[0]).toBeCloseTo(partial!.columns[1],6);
  const both=dragDivider(dragDivider(equalTracks('four'),'columns',0,0.1),'rows',0,0.1);
  const half=resetDivider(both,'columns',0);expect(half).toBeDefined();expect(half!.columns).toEqual([0.5,0.5]);expect(half!.rows).toEqual([0.6,0.4]);
  expect(resetDivider(half!,'rows',0)).toBeUndefined();
 });
 it('validation refuses wrong lengths, non-finite values, values under 0.1, sums off by more than 1e-6 and wrong schema',()=>{
  const ok:LayoutTracks={schemaVersion:1,columns:[0.5,0.5],rows:[1]};
  expect(()=>validateLayoutTracks(ok,'two-columns')).not.toThrow();
  expect(()=>validateLayoutTracks({...ok,columns:[0.5,0.25,0.25]},'two-columns')).toThrow('Layout tracks');
  expect(()=>validateLayoutTracks({...ok,columns:[0.5,Number.NaN]},'two-columns')).toThrow('finite');
  expect(()=>validateLayoutTracks({...ok,columns:[Infinity,0.5]},'two-columns')).toThrow('finite');
  expect(()=>validateLayoutTracks({...ok,columns:[0.95,0.05]},'two-columns')).toThrow('at least 0.1');
  expect(()=>validateLayoutTracks({...ok,columns:[0.5,0.5001]},'two-columns')).toThrow('sum to 1');
  expect(()=>validateLayoutTracks({...ok,columns:[0.5,0.5000005]},'two-columns')).not.toThrow();
  expect(()=>validateLayoutTracks({...ok,schemaVersion:2 as 1},'two-columns')).toThrow('schema');
  expect(()=>validateLayoutTracks({...ok,extra:1} as never,'two-columns')).toThrow('Layout tracks');
  expect(()=>validateLayoutTracks({...ok,rows:[0.5,0.5]},'two-columns')).toThrow('Layout tracks');
  expect(()=>validateLayoutTracks(null as never,'two-columns')).toThrow('Layout tracks');
  expect(()=>validateLayoutTracks(ok,'unknown-preset')).toThrow('preset');
 });
 it('absent tracks mean today\'s equal tracks and today\'s exact CSS',()=>{
  const grid={presetId:'six'};
  expect(effectiveTracks(grid)).toEqual(equalTracks('six'));
  expect(gridTemplates(grid)).toEqual({columns:'repeat(3,minmax(0,1fr))',rows:'repeat(2,minmax(0,1fr))'});
  expect(gridTemplates({presetId:'two-rows'})).toEqual({columns:'repeat(1,minmax(0,1fr))',rows:'repeat(2,minmax(0,1fr))'});
  const dragged=withTracks(grid,dragDivider(equalTracks('six'),'columns',0,0.1));
  expect(gridTemplates(dragged).columns).toBe('minmax(0,0.433333fr) minmax(0,0.233333fr) minmax(0,0.333334fr)');
  expect(gridTemplates(dragged).rows).toBe('repeat(2,minmax(0,1fr))');
  expect(Object.hasOwn(withTracks(dragged,undefined),'tracks')).toBe(false);
  expect(()=>assertGridTracks(grid)).not.toThrow();expect(()=>assertGridTracks({presetId:'six',tracks:{schemaVersion:1,columns:[1],rows:[1],extra:1}})).toThrow('Layout tracks');
 });
 it('normalizeTracks stores undefined for equal tracks and the block otherwise',()=>{
  expect(normalizeTracks(equalTracks('six'),'six')).toBeUndefined();
  const dragged=dragDivider(equalTracks('six'),'columns',0,0.1);expect(normalizeTracks(dragged,'six')).toEqual(dragged);
  expect(()=>normalizeTracks({schemaVersion:1,columns:[1],rows:[1]},'six')).toThrow('Layout tracks');
 });
 it('a stale block from another preset (an older build changed the preset) is tolerated on load and treated as absent (WSX review R-5)',()=>{
  const stale={schemaVersion:1 as const,columns:[0.6,0.4],rows:[0.5,0.5]};
  const grid={presetId:'six',tracks:stale};
  expect(isStaleTracks(stale,'six')).toBe(true);expect(isStaleTracks(stale,'four')).toBe(false);
  expect(()=>assertGridTracks(grid)).not.toThrow();
  expect(effectiveTracks(grid)).toEqual(equalTracks('six'));
  expect(gridTemplates(grid)).toEqual(gridTemplates({presetId:'six'}));
  const dropped=dropStaleTracks(grid);expect(Object.hasOwn(dropped,'tracks')).toBe(false);expect(dropStaleTracks({presetId:'four',tracks:stale})).toEqual({presetId:'four',tracks:stale});
  // malformed stays a strict refusal, also when the counts disagree
  for(const bad of [{schemaVersion:1,columns:[0.6,'x'],rows:[1]},{schemaVersion:2,columns:[0.6,0.4],rows:[1]},{columns:[0.6,0.4],rows:[1]},{schemaVersion:1,columns:[0.95,0.05],rows:[1]},null,[1]])
   expect(()=>assertGridTracks({presetId:'two-columns',tracks:bad as never}),JSON.stringify(bad)).toThrow('Layout tracks');
 });
 it('a library entry grid carrying a stale block still saves, opens and round-trips unchanged',()=>{
  const state=createInitialWorkspace(),six:any=resizeMultiChartState(state.grid!,'six');
  const grid={...six,tracks:{schemaVersion:1,columns:[0.6,0.4],rows:[0.5,0.5]}};
  const saved=prepareLayoutSave(state.layoutLibrary!,grid,100);
  expect(JSON.stringify(openedLayout(saved,saved.activeId).grid)).toBe(JSON.stringify(grid));
  expect(()=>assertGridTracks(grid)).not.toThrow();expect(Object.hasOwn(dropStaleTracks(grid),'tracks')).toBe(false);
 });
 it('a preset change drops the tracks',()=>{
  const dragged=withTracks({presetId:'four'},dragDivider(equalTracks('four'),'columns',0,0.1));
  expect(Object.hasOwn(dropTracksOnResize(dragged),'tracks')).toBe(false);expect(dropTracksOnResize(dragged).presetId).toBe('four');
  const state=createMultiChartState(fixtureDataset('GME',3),{appearance:defaultTheme.appearance}),two=resizeMultiChartState(state,'two-columns') as typeof state&{tracks?:LayoutTracks};
  const withDivider=withTracks(two,dragDivider(equalTracks('two-columns'),'columns',0,0.1));
  const resized=dropTracksOnResize(resizeMultiChartState(withDivider as typeof state,'four'));
  expect(Object.hasOwn(resized,'tracks')).toBe(false);expect(resized.layout.maximizedCellId).toBeNull();
 });
 it('resizing the layout clears the maximized cell (MAXIMIZE_ACTIVE_CHART)',()=>{
  const state=createMultiChartState(fixtureDataset('GME',3),{appearance:defaultTheme.appearance}),two=resizeMultiChartState(state,'two-columns');
  const maximized={...two,layout:{...two.layout,maximizedCellId:two.layout.activeCellId}};
  expect(maximized.layout.maximizedCellId).not.toBeNull();expect(resizeMultiChartState(maximized,'four').layout.maximizedCellId).toBeNull();
 });
});
describe('layout tracks persistence on the existing paths',()=>{
 const make=()=>{const state=createInitialWorkspace();return{state,grid:structuredClone(state.grid!) as any};};
 it('a layout without tracks saves and opens exactly as before and never gains a tracks key',()=>{
  const {state,grid}=make();const before=JSON.stringify(grid);
  const saved=prepareLayoutSave(state.layoutLibrary!,grid,100);expect(JSON.stringify(saved.entries[0].grid)).toBe(before);expect(Object.hasOwn(saved.entries[0].grid,'tracks')).toBe(false);
  expect(JSON.stringify(openedLayout(saved,saved.activeId).grid)).toBe(before);
 });
 it('tracks survive save then open and round-trip through layout export and import byte-identically',()=>{
  const {state,grid}=make();
  const resized=resizeMultiChartState(grid,'two-columns');
  const tracked:any=withTracks(resized,dragDivider(equalTracks('two-columns'),'columns',0,0.1));
  const saved=prepareLayoutSave(state.layoutLibrary!,tracked,200);
  expect(JSON.stringify(saved.entries[0].grid)).toBe(JSON.stringify(tracked));
  const opened=openedLayout(saved,saved.activeId);expect(JSON.stringify(opened.grid)).toBe(JSON.stringify(tracked));expect(opened.grid).not.toBe(saved.entries[0].grid);
  const workspace:any={...state,grid:tracked,layoutLibrary:saved};
  const text=exportLayoutText(workspace);const preview=previewLayoutText(text,workspace);
  expect(JSON.stringify(preview.file.grid)).toBe(JSON.stringify(tracked));
  expect(()=>assertGridTracks(preview.file.grid as any)).not.toThrow();
  expect(JSON.parse(text).grid.tracks).toEqual({schemaVersion:1,columns:[0.6,0.4],rows:[1]});
 });
 it('a divider drag marks the layout dirty and resetting it clears the mark',()=>{
  const {state,grid}=make();const resized=resizeMultiChartState(grid,'two-columns');
  const book=prepareLayoutSave(state.layoutLibrary!,resized,100);
  expect(layoutIsDirty(book,resized)).toBe(false);
  const tracked:any=withTracks(resized,dragDivider(equalTracks('two-columns'),'columns',0,0.1));
  expect(layoutIsDirty(book,tracked)).toBe(true);
  const reset:any=withTracks(tracked,resetDivider(effectiveTracks(tracked),'columns',0));
  expect(Object.hasOwn(reset,'tracks')).toBe(false);expect(layoutIsDirty(book,reset)).toBe(false);
 });
 it('a library entry or layout file with an invalid tracks block is refused with the validator message',()=>{
  const {grid}=make();const resized:any=resizeMultiChartState(grid,'two-columns');
  expect(()=>assertGridTracks({...resized,tracks:{schemaVersion:1,columns:[0.95,0.05],rows:[1]}})).toThrow('Layout tracks must be at least 0.1');
  expect(()=>assertGridTracks({...resized,tracks:{schemaVersion:1,columns:[0.4,0.4],rows:[1]}})).toThrow('Layout tracks must sum to 1');
 });
 it("absent tracks paint exactly today's grid markup (saved workspaces unchanged)",()=>{
  const {grid}=make();const dataset=fixtureDataset('GME',3);
  const resized=resizeMultiChartState(grid,'two-columns');
  const markup=renderToStaticMarkup(React.createElement(MultiChartGrid,{state:resized,datasets:[dataset],onChange:()=>{},onReady:()=>{},onActiveCell:()=>{}}));
  expect(markup).toContain('grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(1,minmax(0,1fr))');
 });
});
