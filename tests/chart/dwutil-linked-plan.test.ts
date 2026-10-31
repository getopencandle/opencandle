import {describe,expect,it} from 'vitest';
import {planLinkedDrawingAction,linkedDrawingChange,stampNewDrawings,drawingSyncScope,LINKED_DRAWING_CANDIDATE_LIMIT,LINKED_DRAWING_LIMIT_MESSAGE,LINKED_PEER_UNAVAILABLE_MESSAGE} from '../../src/chart/drawing-linked-plan';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';

// (spec 3.7): the pure linked planner. Rows are SYNTHETIC opaque records
// the planner never interprets drawing geometry, so an unknown type keeps the cases exact.
type Row=Record<string,unknown>;
const scoped=(id:string,scope:'layout'|'global'='layout'):Row=>({id,type:'future-drawing',paneId:'price',lvSyncScope:scope,opaque:{zero:-0}});
const local=(id:string):Row=>({id,type:'future-drawing',paneId:'price'});
const doc=(rows:Row[],members:string[]|null=null):Row=>({version:1,drawings:rows,...(members?{lvDrawingManager:{schemaVersion:1,groups:[{id:'SYNTHETIC-G',name:'SYNTHETIC group',memberIds:members,future:'keep'},{id:'SYNTHETIC-H',name:'SYNTHETIC empty',memberIds:[]}],templates:[]}}:{})});
/** A, B, C share one scope key; D is another symbol; E is the same symbol with another adjustment. */
function grid(extra:(cell:string)=>Row[]=()=>[]){
 const ids=['A','B','C','D','E'],keys:Record<string,string>={A:'GME|raw',B:'GME|raw',C:'GME|raw',D:'AMC|raw',E:'GME|split-adjusted'};
 const cells:Record<string,{drawings:Row}>=Object.fromEntries(ids.map(id=>[id,{drawings:doc([scoped('S1'),local('L-'+id),...extra(id)],['S1','L-'+id])}]));
 return{layout:{cells:ids.map(id=>({id}))},cells,scopeKey:(id:string)=>keys[id],mounted:(id:string)=>id!=='C',available:(_id:string)=>true};
}
const ids=(value:Row)=>(value.drawings as Row[]).map(row=>row.id);

describe('LINKED.PLAN',()=>{
 it('LINKED.PLAN.ERASE erases a scoped target in every same-scope peer, prunes each group, and leaves other scope keys untouched',()=>{
  const g=grid(),before=structuredClone(g.cells);
  const plan=planLinkedDrawingAction({...g,kind:'erase',originId:'A',targetIds:['S1']});
  expect(plan.affectedCellIds).toEqual(['A','B','C']);expect(plan.candidates).toBe(3);
  expect(plan.peers.map(peer=>[peer.cellId,peer.mode,peer.removedIds,peer.addedIds])).toEqual([['B','native',['S1'],[]],['C','canonical-only',['S1'],[]]]);
  const b=plan.peers[0].drawings;expect(ids(b)).toEqual(['L-B']);
  expect((b.lvDrawingManager as any).groups).toEqual([{id:'SYNTHETIC-G',name:'SYNTHETIC group',memberIds:['L-B'],future:'keep'},{id:'SYNTHETIC-H',name:'SYNTHETIC empty',memberIds:[]}]);
  expect(g.cells).toEqual(before);expect(Object.is((g.cells.B.drawings.drawings as any)[0].opaque.zero,-0)).toBe(true);
 });
 it('LINKED.PLAN.LOCAL a drawing without a sync scope stays local',()=>{
  const g=grid();expect(planLinkedDrawingAction({...g,kind:'remove',originId:'A',targetIds:['L-A']}).peers).toEqual([]);
 });
 it('LINKED.PLAN.REMOVE removes several scoped targets and counts every candidate row',()=>{
  const g=grid(()=>[scoped('S2','global')]);
  const plan=planLinkedDrawingAction({...g,kind:'remove',originId:'A',targetIds:['S1','S2','L-A']});
  expect(plan.peers.map(peer=>[peer.cellId,peer.removedIds])).toEqual([['B',['S1','S2']],['C',['S1','S2']]]);expect(plan.candidates).toBe(7);
 });
 it.each(['clone','paste'] as const)('DWUTIL.LINKED.PLAN.%s adds scoped new rows to each same-scope peer only',kind=>{
  const g=grid(),row=scoped('NEW');
  const plan=planLinkedDrawingAction({...g,kind,originId:'A',addRows:[row,local('LOCAL-NEW')]});
  expect(plan.peers.map(peer=>[peer.cellId,peer.mode,peer.addedIds])).toEqual([['B','native',['NEW']],['C','canonical-only',['NEW']]]);
  expect(ids(plan.peers[0].drawings)).toEqual(['S1','L-B','NEW']);expect(plan.peers[0].drawings.lvDrawingManager).toEqual(g.cells.B.drawings.lvDrawingManager);
  expect(plan.peers[0].drawings.drawings).not.toContain(row);
 });
 it('LINKED.PLAN.UNAVAILABLE refuses before any candidate when a same-scope peer is unavailable or quarantined',()=>{
  const g=grid();
  expect(()=>planLinkedDrawingAction({...g,available:id=>id!=='C',kind:'erase',originId:'A',targetIds:['S1']})).toThrow(LINKED_PEER_UNAVAILABLE_MESSAGE);
  // An unavailable chart with another scope key is not a peer and does not block.
  expect(planLinkedDrawingAction({...g,available:id=>id!=='D',kind:'erase',originId:'A',targetIds:['S1']}).peers).toHaveLength(2);
  const broken=grid();broken.cells.B.drawings={version:1,drawings:'corrupt'};
  expect(()=>planLinkedDrawingAction({...broken,kind:'erase',originId:'A',targetIds:['S1']})).toThrow(LINKED_PEER_UNAVAILABLE_MESSAGE);
  const future=grid();future.cells.B.drawings={...future.cells.B.drawings,lvDrawingManager:{schemaVersion:2,groups:[]}};
  expect(()=>planLinkedDrawingAction({...future,kind:'erase',originId:'A',targetIds:['S1']})).toThrow(LINKED_PEER_UNAVAILABLE_MESSAGE);
  const scopeless=grid();expect(()=>planLinkedDrawingAction({...scopeless,scopeKey:id=>{if(id==='B')throw Error('SYNTHETIC missing source');return'GME|raw';},kind:'erase',originId:'A',targetIds:['S1']})).toThrow(LINKED_PEER_UNAVAILABLE_MESSAGE);
  const collision=grid(id=>id==='B'?[local('NEW')]:[]);
  expect(()=>planLinkedDrawingAction({...collision,kind:'clone',originId:'A',addRows:[scoped('NEW')]})).toThrow(LINKED_PEER_UNAVAILABLE_MESSAGE);
 });
 it('LINKED.PLAN.LIMIT caps candidates at 128 rows across all cells with the DD-29 text',()=>{
  expect(LINKED_DRAWING_CANDIDATE_LIMIT).toBe(128);expect(LINKED_DRAWING_LIMIT_MESSAGE).toBe('Too many synchronized drawings to change at once.');
  const rows=(n:number)=>Array.from({length:n},(_,i)=>scoped('N'+i));
  expect(planLinkedDrawingAction({...grid(),kind:'paste',originId:'A',addRows:rows(42)}).candidates).toBe(126);
  expect(()=>planLinkedDrawingAction({...grid(),kind:'paste',originId:'A',addRows:rows(43)})).toThrow(LINKED_DRAWING_LIMIT_MESSAGE);
 });
 it('LINKED.PLAN.KIND refuses a candidate whose change does not match the action',()=>{
  expect(()=>planLinkedDrawingAction({...grid(),kind:'erase',originId:'A',addRows:[scoped('X')]})).toThrow();
  expect(()=>planLinkedDrawingAction({...grid(),kind:'clone',originId:'A',targetIds:['S1']})).toThrow();
  expect(()=>planLinkedDrawingAction({...grid(),kind:'erase',originId:'Z',targetIds:['S1']})).toThrow();
 });
 it('LINKED.PLAN.CHANGE derives removed ids and new rows from the origin candidate',()=>{
  const before=doc([scoped('S1'),local('L')]),after=doc([local('L'),scoped('NEW')]);
  expect(linkedDrawingChange(before,after)).toEqual({removeIds:['S1'],addRows:[scoped('NEW')],originChanged:2});
  expect(drawingSyncScope(scoped('x','global'))).toBe('global');expect(drawingSyncScope(local('x'))).toBe(null);expect(drawingSyncScope({lvSyncScope:'everywhere'})).toBe(null);
 });
});

describe('SYNC.STAMP ()',()=>{
 it('SYNC.STAMP.PLACEMENT stamps a new drawing with the toolbar scope and keeps unchanged rows identical',()=>{
  const prev=[local('OLD')],next=[local('OLD'),local('NEW')];
  const stamped=stampNewDrawings(prev,next,'layout');
  expect(stamped).toEqual([local('OLD'),{...local('NEW'),lvSyncScope:'layout'}]);expect(next[1]).toEqual(local('NEW'));
  expect(stampNewDrawings(prev,next,null)).toEqual(next);
 });
 it('SYNC.STAMP.DRAG a native edit keeps the row lvSyncScope even when the native record dropped it',()=>{
  const prev=[scoped('S1','global')],moved=[{...local('S1'),anchors:[{time:2,price:3}]}];
  expect(stampNewDrawings(prev,moved,null)).toEqual([{...moved[0],lvSyncScope:'global'}]);
  expect(stampNewDrawings([local('L')],[{...local('L'),lvSyncScope:'layout'}],'layout')).toEqual([local('L')]);
 });
 it('SYNC.STAMP.COPY paste and clone take the current toolbar stamp, not the source row stamp',()=>{
  const prev=[scoped('SRC')],copy={...scoped('COPY'),lvSyncScope:'layout'};
  expect(stampNewDrawings(prev,[...prev,copy],null)[1]).not.toHaveProperty('lvSyncScope');
  expect(stampNewDrawings(prev,[...prev,copy],'global')[1]).toMatchObject({id:'COPY',lvSyncScope:'global'});
 });
 it('SYNC.STAMP.ONE_STEP the stamp rides the placement record: one history step, and Undo removes the drawing with its stamp',()=>{
  const history=createWorkspaceHistory<{drawings:Row}>(),empty={drawings:doc([])};let workspace=empty;
  // The reconcile pass that first sees the new id produces the stamped canonical rows; one prepared record publishes it.
  const native=[local('PLACED')],record=history.prepareRecord(workspace,null),next={drawings:doc(stampNewDrawings(workspace.drawings.drawings as Row[],native,'layout'))};
  record.commit();workspace=next;
  expect(history.status().undo).toBe(1);expect((workspace.drawings.drawings as Row[])[0].lvSyncScope).toBe('layout');
  const undone=history.undo(workspace,null)!.workspace;expect(undone).toBe(empty);expect(history.status().undo).toBe(0);
 });
});
