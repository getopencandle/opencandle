import {describe,expect,it,vi} from 'vitest';
import {assertGridTracks,isStaleTracks} from '../../src/chart/layout-tracks';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {createLayoutLibrary,duplicateSavedLayout,prepareLayoutSave,restoreLayoutLibrary} from '../../src/ui/layout-library';

// SYNTHETIC fixture workspaces only. No app/profile, keys or provider calls.
function workspace(tracks?:unknown){
 const state=createInitialWorkspace(),grid=resizeMultiChartState(state.grid!,'two-columns');
 if(tracks!==undefined)(grid as any).tracks=structuredClone(tracks);
 return {...state,grid,layoutLibrary:createLayoutLibrary(grid)};
}
const valid={schemaVersion:1,columns:[0.6,0.4],rows:[1]};
describe(' persisted divider tracks',()=>{
 it('preserves valid fractional geometry byte-for-byte on working and saved recovery',()=>{
  const input=workspace(valid),before=JSON.stringify(input),restored=restoreWorkspace(input,createInitialWorkspace());
  expect(JSON.stringify(restored.grid!.tracks)).toBe(JSON.stringify(valid));
  expect(JSON.stringify(restored.layoutLibrary!.entries[0].grid.tracks)).toBe(JSON.stringify(valid));
  expect(JSON.stringify(input)).toBe(before);
 });
 it('does not add tracks to older workspaces or their saved entries',()=>{
  const restored=restoreWorkspace(workspace(),createInitialWorkspace());
  expect(Object.hasOwn(restored.grid!,'tracks')).toBe(false);
  expect(Object.hasOwn(restored.layoutLibrary!.entries[0].grid,'tracks')).toBe(false);
 });
 it('preserves a valid stale-preset block under the established compatibility policy',()=>{
  const stale={schemaVersion:1,columns:[0.6,0.4],rows:[0.5,0.5]},input=workspace(stale);
  const restored=restoreWorkspace(input,createInitialWorkspace());
  expect(isStaleTracks(stale,'two-columns')).toBe(true);
  expect(restored.grid!.tracks).toEqual(stale);expect(restored.layoutLibrary!.entries[0].grid.tracks).toEqual(stale);
 });
 it.each([
  {schemaVersion:1,columns:[1,Number.NaN],rows:[0.5,0.5]},
  {schemaVersion:1,columns:[0.95,0.05],rows:[0.5,0.5]},
  {schemaVersion:1,columns:[0.6,0.6],rows:[0.5,0.5]},
  {schemaVersion:1,columns:[0.6,'0.4'],rows:[0.5,0.5]},
  {schemaVersion:1,columns:[],rows:[1]},
  {schemaVersion:1,columns:[1],rows:[Infinity]},
  {schemaVersion:2,columns:[1],rows:[1]},
  {schemaVersion:1,columns:[1],rows:[1],extra:1},
 ])('refuses malformed working tracks before recovering or publishing case %#',tracks=>{
  const state=createInitialWorkspace(),grid=resizeMultiChartState(state.grid!,'two-columns');
  const input={...state,grid:{...grid,tracks}};
  expect(()=>restoreWorkspace(input,createInitialWorkspace())).toThrow(/Layout tracks/);
  expect(isStaleTracks(tracks,'two-columns')).toBe(false);
 });
 it('refuses malformed tracks in an inactive saved layout',()=>{
  const state=workspace(valid);let id=0;
  const duplicate=duplicateSavedLayout(state.layoutLibrary!,state.grid!,state.grid!,'SYNTHETIC inactive',1,()=>`track-${++id}`);
  (duplicate.entry.grid as any).tracks={schemaVersion:1,columns:[1],rows:[0.9,0.2]};
  expect(()=>restoreWorkspace({...state,layoutLibrary:duplicate.library},createInitialWorkspace())).toThrow(/Layout tracks/);
 });
 it('checks direct library restore and save boundaries as well as workspace recovery',()=>{
  const state=workspace(),bad={...state.grid!,tracks:{schemaVersion:1 as const,columns:[0.3,0.3],rows:[1]}};
  expect(()=>prepareLayoutSave(state.layoutLibrary!,bad,100)).toThrow(/Layout tracks/);
  const library=structuredClone(state.layoutLibrary!);library.entries[0].grid=bad;
  expect(()=>restoreLayoutLibrary(library,state.grid!)).toThrow(/Layout tracks/);
 });
 it('rejects an own tracks getter before legacy drawing-utility migration can spread the grid',()=>{
  const state=createInitialWorkspace(),read=vi.fn(()=>valid),input=structuredClone(state);
  delete (input as any).drawingUtility;
  Object.defineProperty(input.grid!,'tracks',{enumerable:true,configurable:true,get:read});
  expect(()=>restoreWorkspace(input,createInitialWorkspace())).toThrow(/Layout tracks/);
  expect(read).not.toHaveBeenCalled();
 });
 it('rejects getters without invoking them, including a stale axis dimension',()=>{
  const read=vi.fn(()=>[1]),record={schemaVersion:1,columns:[1]} as any;
  Object.defineProperty(record,'rows',{enumerable:true,get:read});
  expect(()=>assertGridTracks({presetId:'two-columns',tracks:record})).toThrow(/Layout tracks/);
  expect(read).not.toHaveBeenCalled();
  const grid={presetId:'two-columns'};Object.defineProperty(grid,'tracks',{enumerable:true,get:read});
  expect(()=>assertGridTracks(grid)).toThrow(/Layout tracks/);expect(read).not.toHaveBeenCalled();
  const axis=[0.6,0.4];Object.defineProperty(axis,'1',{enumerable:true,get:read});
  expect(()=>assertGridTracks({presetId:'two-columns',tracks:{schemaVersion:1,columns:axis,rows:[0.5,0.5]}})).toThrow(/Layout tracks/);
  expect(read).not.toHaveBeenCalled();
 });
 it('rejects holes, extra axis fields and inherited schema fields',()=>{
  const sparse=new Array(2);sparse[0]=1;const extra=Object.assign([0.6,0.4],{extra:1});
  for(const columns of [sparse,extra])expect(()=>assertGridTracks({presetId:'two-columns',tracks:{schemaVersion:1,columns,rows:[1]}})).toThrow(/Layout tracks/);
  const inherited=Object.create(valid);expect(()=>assertGridTracks({presetId:'two-columns',tracks:inherited})).toThrow(/Layout tracks/);
 });
});
