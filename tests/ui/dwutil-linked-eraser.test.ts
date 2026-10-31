import {describe,expect,it,vi} from 'vitest';
import {duplicateAdapterFixture} from '../chart/drawing-duplicate-adapter-harness';
import {annotationRecord} from '../chart/trendline-annotation-native-harness';
import {createGridDrawingWorkspaceHost} from '../../src/ui/drawing-workspace';
import {createMultiChartState,type MultiChartGridProps,type MultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';

// (spec 3.8): .CURSOR.ERASER.LINKED through the current adapter erase block
// (shared adapter harness: real native facade, hit test, canonical document and router) bound
// to the actual Grid drawing workspace host in a three-chart linked layout. B is a mounted peer,
// C is unmounted (canonical-only). Root history, peer native charts and quarantine are SYNTHETIC.
// The EXIT, HISTORY, PERSIST and RECOVERY behaviours are rerun here in the linked layout.
type Row=Record<string,unknown>;
const scoped=(id='SYNTHETIC-S'):Row=>({...annotationRecord(),id,lvPaneBinding:{schemaVersion:1,target:{kind:'price'}},lvSyncScope:'layout'});
const HISTORY_REFUSAL='Press Escape or choose Cursor before using Undo or Redo with the eraser.';
async function linkedEraser(options:{forwardFailure?:boolean;unmountC?:boolean}={unmountC:true}){
 const f=await duplicateAdapterFixture([scoped()] as any);
 try{
  const data=fixtureDataset('GME',5);let n=0;
  const state:MultiChartState=resizeMultiChartState(createMultiChartState(data,{appearance:defaultTheme.appearance}),'three-columns',()=>'cell-'+(++n));
  const [A,B,C]=state.layout.cells.map(cell=>cell.id);state.layout.sync.drawings=true;
  const origin=f.f.document.serialize();
  for(const id of [A,B,C])state.cells[id]={...state.cells[id],drawings:structuredClone(origin)};
  const history=createWorkspaceHistory<{grid:MultiChartState}>(),natives=new Map<string,Row>([[B,structuredClone(origin)]]),forwards:string[]=[],quarantines:string[][]=[];let writes=0;
  const status={input:{bars:data.bars,source:sourceContextForDataset(data),style:'candles'},settled:true,error:''};
  const chartA={getExecutionIdentity:()=>'ordinary',isInputCurrent:()=>true},chartB={...chartA},charts=new Map<string,object>([[A,chartA],[B,chartB],...(options.unmountC?[]:[[C,{...chartA}] as [string,object]])]);
  if(!options.unmountC)natives.set(C,structuredClone(origin));
  let props:MultiChartGridProps;
  const onDrawingHistory=vi.fn((direction:'undo'|'redo',expected:MultiChartState)=>{
   if(props.state!==expected)throw Error('SYNTHETIC history owner changed.');
   const entry=direction==='undo'?history.undo({grid:props.state},null):history.redo({grid:props.state},null);if(!entry)throw Error('SYNTHETIC history is empty.');
   props={...props,state:entry.workspace.grid};f.f.document.load(structuredClone(props.state.cells[A].drawings) as any);
   for(const id of natives.keys())natives.set(id,structuredClone(props.state.cells[id].drawings));
  });
  props={state,datasets:[data],activeBars:data.bars,activeDatasetId:data.provenance.datasetId,activeExecutionIdentity:'ordinary',onChange:vi.fn(()=>true),onReady:vi.fn(),onActiveCell:vi.fn(),onDrawingHistory,
   drawingHistoryStatus:()=>({canUndo:history.status().undo>0,canRedo:history.status().redo>0}),
   onCaptureDrawingWorkspace:vi.fn((expected:MultiChartState)=>{
    let owner=expected;const assertCurrent=()=>{if(props.state!==owner)throw Error('SYNTHETIC root workspace replaced.');};
    return{assertCurrent,prepare:(next:MultiChartState)=>{assertCurrent();const record=history.prepareRecord({grid:props.state},null);return{assertCurrent,publish:(mark:()=>void)=>{assertCurrent();record.commit();writes++;owner=next;mark();}};}};
   })};
  const linked={forward:(cellId:string,drawings:Row)=>{forwards.push(cellId);if(options.forwardFailure)throw Error('SYNTHETIC peer forward failure');natives.set(cellId,structuredClone(drawings));},quarantine:(cells:string[])=>{quarantines.push(cells);},unavailable:()=>false};
  const host=createGridDrawingWorkspaceHost(A,chartA as any,{read:()=>props,alive:()=>true,blocked:()=>false,controller:(key:string)=>charts.get(key) as any,readiness:()=>status as any,accept:(next:MultiChartState)=>{props={...props,state:next};},linked});
  f.controller.bindDrawingWorkspaceHost(host);
  const ids=(id:string)=>((props.state.cells[id].drawings as Row).drawings as Row[]).map(row=>row.id);
  const hit=()=>{const lease=f.controller.beginDrawingEraseGesture(()=>{});f.f.paint.controller.pointerDown(20,200);return lease;};
  return{f,A,B,C,host,history,natives,forwards,quarantines,writes:()=>writes,props:()=>props,ids,hit,onDrawingHistory};
 }catch(error){f.dispose();throw error;}
}

describe('LINKED.ERASER',()=>{
 it('LINKED.ERASER.ATOMIC arming succeeds and one hit erases every same-scope copy in one history step; Undo restores all copies',async()=>{
  const g=await linkedEraser();
  try{
   const before=g.props().state;g.f.controller.setDrawingMode('eraser');expect(g.f.f.facade.getMode()).toBe('eraser');
   const lease=g.hit();lease.assertCurrent();
   expect(g.ids(g.A)).toEqual([]);expect(g.ids(g.B)).toEqual([]);expect(g.ids(g.C)).toEqual([]);
   expect(g.f.f.native.controller.all()).toEqual([]);expect(g.forwards).toEqual([g.B]);expect((g.natives.get(g.B)!.drawings as Row[])).toEqual([]);
   expect(g.writes()).toBe(1);expect(g.history.status().undo).toBe(1);expect(g.quarantines).toEqual([]);
   lease.finish();g.f.controller.setDrawingMode(null);
   g.host.history('undo',()=>{});expect(g.props().state).toBe(before);
   for(const id of [g.A,g.B,g.C])expect(g.ids(id)).toEqual(['SYNTHETIC-S']);expect((g.natives.get(g.B)!.drawings as Row[]).map(row=>row.id)).toEqual(['SYNTHETIC-S']);
  }finally{g.f.dispose();}
 });
 it('LINKED.ERASER.EXIT Escape or Cursor stops future hits and does not restore committed linked removals',async()=>{
  const g=await linkedEraser();
  try{
   g.f.controller.setDrawingMode('eraser');const lease=g.hit();lease.finish();const after=g.props().state;
   g.f.controller.setDrawingMode(null);expect(g.f.f.facade.getMode()).toBe(null);expect(g.f.f.paint.controller.eraserMode).toBe(false);
   expect(()=>g.f.controller.beginDrawingEraseGesture(()=>{})).toThrow();expect(g.props().state).toBe(after);expect(g.history.status().undo).toBe(1);
   for(const id of [g.A,g.B,g.C])expect(g.ids(id)).toEqual([]);
  }finally{g.f.dispose();}
 });
 it('LINKED.ERASER.HISTORY Undo while armed is refused with the exit copy; after exit one Undo restores every copy',async()=>{
  const g=await linkedEraser();
  try{
   g.f.controller.setDrawingMode('eraser');g.hit().finish();
   expect(()=>g.f.f.facade.undo()).toThrow(HISTORY_REFUSAL);expect(g.onDrawingHistory).not.toHaveBeenCalled();expect(g.history.status().undo).toBe(1);
   g.f.controller.setDrawingMode(null);g.f.f.facade.undo();expect(g.onDrawingHistory).toHaveBeenCalledOnce();
   for(const id of [g.A,g.B,g.C])expect(g.ids(id)).toEqual(['SYNTHETIC-S']);
   g.f.f.facade.redo();for(const id of [g.A,g.B,g.C])expect(g.ids(id)).toEqual([]);
  }finally{g.f.dispose();}
 });
 it('LINKED.ERASER.PERSIST Save stores only the acknowledged linked state and a reload is byte-stable',async()=>{
  const g=await linkedEraser();
  try{
   g.f.controller.setDrawingMode('eraser');g.hit().finish();g.f.controller.setDrawingMode(null);
   const saved=JSON.stringify(g.props().state);expect(g.f.controller.saveDrawings()).toEqual(g.props().state.cells[g.A].drawings);
   expect(JSON.stringify(JSON.parse(saved))).toBe(saved);expect(g.f.f.facade.getMode()).toBe(null);
   for(const id of [g.A,g.B,g.C])expect(JSON.parse(saved).cells[id].drawings.drawings).toEqual([]);
  }finally{g.f.dispose();}
 });
 it('LINKED.ERASER.RECOVERY a peer failure after forwarding quarantines the linked charts and keeps the saved workspace',async()=>{
  const g=await linkedEraser({forwardFailure:true,unmountC:true});
  try{
   const saved=g.props().state;g.f.controller.setDrawingMode('eraser');
   expect(()=>g.hit()).toThrow(/SYNTHETIC peer forward failure/);
   expect(g.props().state).toBe(saved);expect(g.history.status().undo).toBe(0);expect(g.writes()).toBe(0);
   expect(g.quarantines).toEqual([[g.A,g.B]]);expect(g.f.state().analysisUnavailable).not.toBe('');expect(()=>g.f.controller.saveDrawings()).toThrow();
   for(const id of [g.A,g.B,g.C])expect(g.ids(id)).toEqual(['SYNTHETIC-S']);
  }finally{g.f.dispose();}
 });
});
