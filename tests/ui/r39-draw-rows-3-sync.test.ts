// (fail-first): toolbar Sync for a placed drawing. Not synced / Sync in layout / Sync globally write the drawing's
// lvSyncScope in ONE workspace undo step (actual adapter drawing manager, native Vela controller and createWorkspaceHistory through the
// object tree history harness), and turning sync off removes the synced copies from the other charts (actual layout-port replication).
// SYNTHETIC fixtures only.
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {objectTreeHistoryHarness} from './object-tree-history-harness';
import {replicateScopedDrawings} from '../../src/chart/layout-port';
import {editBarSyncChange,editBarSyncScope} from '../../src/ui/drawing-edit-bar-model';

let disposers:Array<()=>void>=[];
afterEach(()=>{for(const dispose of disposers)dispose();disposers=[];});
async function mount(){const h=await objectTreeHistoryHarness({drawings:['line-a','line-b']});disposers.push(h.dispose);return h;}
type Harness=Awaited<ReturnType<typeof mount>>;
const rows=(h:Harness)=>(h.committed().drawings as {drawings:Array<Record<string,unknown>>}).drawings;
const scopeOf=(h:Harness,id:string)=>rows(h).find(row=>row.id===id)?.lvSyncScope;
const hasStamp=(h:Harness,id:string)=>Object.hasOwn(rows(h).find(row=>row.id===id)!,'lvSyncScope');

describe('drawingManager.setSyncScope: one undo step, exact undo and redo',()=>{
 it('Sync in layout, then Not synced: each is one history step and undo/redo restore the stamp exactly',async()=>{
  const h=await mount(),start=h.history.status().undo;
  expect(hasStamp(h,'line-a')).toBe(false);
  expect(h.chart.drawingManager.setSyncScope('line-a','layout')).toBe(true);
  expect(h.history.status().undo).toBe(start+1);expect(scopeOf(h,'line-a')).toBe('layout');expect(hasStamp(h,'line-b')).toBe(false);
  const synced=h.committed();
  expect(h.restore('undo')).toBe(true);expect(hasStamp(h,'line-a')).toBe(false);expect(h.history.status()).toMatchObject({undo:start,redo:1});
  expect(h.restore('redo')).toBe(true);expect(h.committed()).toEqual(synced);expect(scopeOf(h,'line-a')).toBe('layout');
  expect(h.chart.drawingManager.setSyncScope('line-a',null)).toBe(true);
  expect(h.history.status().undo).toBe(start+2);expect(hasStamp(h,'line-a')).toBe(false);
  expect(h.restore('undo')).toBe(true);expect(scopeOf(h,'line-a')).toBe('layout');
  expect(h.restore('redo')).toBe(true);expect(hasStamp(h,'line-a')).toBe(false);
  expect(h.adapter.unavailable()).toBe('');
 });
 it('Sync globally replaces the layout stamp in one step; the geometry, style and native row are untouched',async()=>{
  const h=await mount();h.chart.drawingManager.setSyncScope('line-a','layout');
  const before=rows(h).find(row=>row.id==='line-a')!,nativeBefore=h.nativeRows().find(row=>row.id==='line-a'),steps=h.history.status().undo;
  h.chart.drawingManager.setSyncScope('line-a','global');
  expect(h.history.status().undo).toBe(steps+1);
  expect(rows(h).find(row=>row.id==='line-a')).toEqual({...before,lvSyncScope:'global'});
  expect(h.nativeRows().find(row=>row.id==='line-a')).toEqual(nativeBefore);
  expect(h.restore('undo')).toBe(true);expect(scopeOf(h,'line-a')).toBe('layout');
 });
 it('the stamp survives a later native edit of the same drawing',async()=>{
  const h=await mount();h.chart.drawingManager.setSyncScope('line-b','global');
  h.chart.drawingManager.set(['line-b'],{locked:true});
  expect(rows(h).find(row=>row.id==='line-b')).toMatchObject({locked:true,lvSyncScope:'global'});
 });
 it('the scope the drawing already has, an unknown scope or a missing drawing write nothing',async()=>{
  const h=await mount(),before=h.committed(),steps=h.history.status().undo;
  expect(h.chart.drawingManager.setSyncScope('line-a',null)).toBe(false);
  expect(()=>h.chart.drawingManager.setSyncScope('line-a','everywhere' as never)).toThrow('Unsupported drawing sync scope');
  expect(()=>h.chart.drawingManager.setSyncScope('missing','layout')).toThrow('no longer exists');
  expect(h.history.status().undo).toBe(steps);expect(h.committed()).toEqual(before);
 });
});

describe('turning sync off removes the synced copies elsewhere',()=>{
 // A second chart of the same drawing scope: a replicated copy of line-a plus its own local drawing (SYNTHETIC).
 const peerOf=(origin:Record<string,unknown>)=>{const copy=structuredClone((origin.drawings as Array<Record<string,unknown>>).find(row=>row.id==='line-a')!);return {...origin,drawings:[copy,{id:'peer-local',type:'trendline',paneId:'price',anchors:[{time:1,price:1},{time:2,price:2}]}]};};
 it('a synced drawing reaches the peer; Not synced drops the peer copy and keeps the drawing here and the peer\'s own drawings',async()=>{
  const h=await mount();
  const unsyncedPeer={version:1,drawings:[{id:'peer-local',type:'trendline',paneId:'price',anchors:[{time:1,price:1},{time:2,price:2}]}]};
  expect(replicateScopedDrawings(h.committed().drawings,unsyncedPeer)).toBeNull();
  h.chart.drawingManager.setSyncScope('line-a','layout');
  const reached=replicateScopedDrawings(h.committed().drawings,unsyncedPeer)!;
  expect((reached.drawings as Array<Record<string,unknown>>).map(row=>row.id)).toEqual(['peer-local','line-a']);
  const peer=peerOf(h.committed().drawings);
  h.chart.drawingManager.setSyncScope('line-a',null);
  const next=replicateScopedDrawings(h.committed().drawings,peer)!;
  expect((next.drawings as Array<Record<string,unknown>>).map(row=>row.id)).toEqual(['peer-local']);
  expect(rows(h).map(row=>row.id)).toEqual(['line-a','line-b']);expect(hasStamp(h,'line-a')).toBe(false);
  // Undo brings the stamp back, so the next replication restores the copy.
  expect(h.restore('undo')).toBe(true);
  const restored=replicateScopedDrawings(h.committed().drawings,next)!;
  expect((restored.drawings as Array<Record<string,unknown>>).map(row=>row.id)).toEqual(['peer-local','line-a']);
 });
 it('switching layout to global updates the peer copy in place instead of removing it',async()=>{
  const h=await mount();h.chart.drawingManager.setSyncScope('line-a','layout');
  const peer=peerOf(h.committed().drawings);h.chart.drawingManager.setSyncScope('line-a','global');
  const next=replicateScopedDrawings(h.committed().drawings,peer)!;
  expect((next.drawings as Array<Record<string,unknown>>).map(row=>[row.id,row.lvSyncScope])).toEqual([['line-a','global'],['peer-local',undefined]]);
 });
});

describe('toolbar Sync rows',()=>{
 it('are enabled with a write route and write only a different scope',()=>{
  const write=vi.fn();
  expect(editBarSyncChange({id:'a'},undefined)).toBeUndefined();expect(editBarSyncChange(undefined,write)).toBeUndefined();expect(editBarSyncChange({},write)).toBeUndefined();
  const change=editBarSyncChange({id:'a',lvSyncScope:'layout'},write)!;
  change('layout');expect(write).not.toHaveBeenCalled();
  change(null);change('global');expect(write.mock.calls).toEqual([[null],['global']]);
  expect(()=>change('bogus' as never)).toThrow('Unsupported drawing sync scope');
  expect(editBarSyncScope({id:'a',lvSyncScope:'global'})).toBe('global');
 });
 it('ROOT: App passes the change route through the queued drawing action to drawingManager.setSyncScope',()=>{
  const app=readFileSync('src/ui/App.tsx','utf8');
  expect(app).toContain('sync={{scope:editBarSyncScope(drawings.find(x=>x.id===selectedDrawing)),onChange:editBarSyncChange(drawings.find(x=>x.id===selectedDrawing),chart?scope=>drawingAction(()=>{chart.drawingManager.setSyncScope(selectedDrawing,scope);},[selectedDrawing]):null)}}');
 });
});
