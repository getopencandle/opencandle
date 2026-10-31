import {describe,expect,it,vi} from 'vitest';
import {createGridDrawingWorkspaceHost} from '../../src/ui/drawing-workspace';
import {createMultiChartState,type MultiChartGridProps,type MultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';
import {annotationRecord} from '../chart/trendline-annotation-native-harness';
import {LINKED_DRAWING_LIMIT_MESSAGE,LINKED_PEER_UNAVAILABLE_MESSAGE} from '../../src/chart/drawing-linked-plan';

// (spec 3.7, 3.8): the grid-level linked transaction through the actual Grid
// drawing workspace host. Six cells: A (origin), B and C share the drawing scope key, D is
// another symbol, E is the same symbol with another adjustment, F is another symbol.
// Root history, the App keyboard Undo/Redo seam (App.tsx undo/redo -> chart.drawings.undo ->
// router -> host.history -> onDrawingHistory), native peer charts and quarantine are SYNTHETIC
// controls. No React painting, DOM or packaged build is exercised.
type Row=Record<string,unknown>;
const row=(id:string,scope?:'layout'|'global'):Row=>({...annotationRecord(),id,...(scope?{lvSyncScope:scope}:{})});
const doc=(rows:Row[],members:string[]):Row=>({version:1,drawings:rows,lvDrawingManager:{schemaVersion:1,groups:[{id:'SYNTHETIC-G',name:'SYNTHETIC group',memberIds:members}],templates:[]}});
const ids=(value:Row)=>(value.drawings as Row[]).map(item=>item.id);
type Options={prepareFailure?:boolean;unmounted?:string[];unavailable?:string[];forwardFailure?:string;publishFailure?:boolean;noLinkedPort?:boolean;scoped?:number};
function linkedGrid(options:Options={}){
 const gme=fixtureDataset('GME',5),amc=fixtureDataset('AMC',5),split={...gme,provenance:{...gme.provenance,datasetId:gme.provenance.datasetId+':SYNTHETIC-split',adjustment:'split-adjusted' as const}};
 let n=0;const base=createMultiChartState(gme,{appearance:defaultTheme.appearance}),state:MultiChartState=resizeMultiChartState(base,'six',()=>'cell-'+(++n));
 const order=state.layout.cells.map(cell=>cell.id),[A,B,C,D,E,F]=order,names:Record<string,string>={[A]:'A',[B]:'B',[C]:'C',[D]:'D',[E]:'E',[F]:'F'};
 const source:Record<string,typeof gme>={[A]:gme,[B]:gme,[C]:gme,[D]:amc,[E]:split,[F]:amc};
 state.layout.sync.drawings=true;
 const extra=Array.from({length:options.scoped??0},(_,i)=>row('S-extra-'+i,'layout'));
 for(const id of order){
  const layoutRow=state.layout.cells.find(cell=>cell.id===id)!;layoutRow.symbol=source[id].instrument.symbol;
  state.cells[id]={...state.cells[id],datasetId:source[id].provenance.datasetId,drawings:doc([row('S1','layout'),row('L-'+names[id]),...extra],['S1','L-'+names[id]])};
 }
 const unmounted=new Set((options.unmounted??[]).map(name=>order[' ABCDEF'.indexOf(name)-1]));
 const unavailable=new Set((options.unavailable??[]).map(name=>order[' ABCDEF'.indexOf(name)-1]));
 const charts=new Map<string,object>(),natives=new Map<string,Row>(),history=createWorkspaceHistory<{grid:MultiChartState}>();
 for(const id of order)if(!unmounted.has(id)){charts.set(id,{getExecutionIdentity:()=>'ordinary',isInputCurrent:()=>true});natives.set(id,structuredClone(state.cells[id].drawings));}
 const status=Object.fromEntries(order.map(id=>[id,{input:{bars:source[id].bars,source:sourceContextForDataset(source[id]),style:'candles'},settled:true,error:''}]));
 const forwards:string[]=[],quarantines:Array<{cells:string[];message:string}>=[];let writes=0,prepares=0;
 let props:MultiChartGridProps;
 const onDrawingHistory=vi.fn((direction:'undo'|'redo',expected:MultiChartState)=>{
  if(props.state!==expected)throw Error('SYNTHETIC history owner changed.');
  const entry=direction==='undo'?history.undo({grid:props.state},null):history.redo({grid:props.state},null);if(!entry)throw Error('SYNTHETIC history is empty.');
  props={...props,state:entry.workspace.grid};
  // App restoreHistory reloads every mounted chart from the restored grid.
  for(const id of natives.keys())natives.set(id,structuredClone(props.state.cells[id].drawings));
 });
 props={state,datasets:[gme,amc,split],activeBars:gme.bars,activeDatasetId:gme.provenance.datasetId,activeExecutionIdentity:'ordinary',onChange:vi.fn(()=>true),onReady:vi.fn(),onActiveCell:vi.fn(),onDrawingHistory,
  drawingHistoryStatus:()=>({canUndo:history.status().undo>0,canRedo:history.status().redo>0}),
  onCaptureDrawingWorkspace:vi.fn((expected:MultiChartState)=>{
   let owner=expected;const assertCurrent=()=>{if(props.state!==owner)throw Error('SYNTHETIC root workspace replaced.');};
   return{assertCurrent,prepare:(next:MultiChartState)=>{assertCurrent();if(options.prepareFailure)throw Error('SYNTHETIC root preparation failure');prepares++;const record=history.prepareRecord({grid:props.state},null);return{assertCurrent,publish:(mark:()=>void)=>{assertCurrent();if(options.publishFailure)throw Error('SYNTHETIC root publication failure');record.commit();writes++;owner=next;mark();}};}};
  })};
 const linked={
  forward:(cellId:string,drawings:Row)=>{forwards.push(names[cellId]);if(options.forwardFailure===names[cellId])throw Error('SYNTHETIC forward failure');natives.set(cellId,structuredClone(drawings));},
  quarantine:(cells:string[],message:string)=>{quarantines.push({cells:cells.map(id=>names[id]),message});},
  unavailable:(cellId:string)=>unavailable.has(cellId),
 };
 const host=(id:string)=>createGridDrawingWorkspaceHost(id,charts.get(id) as any,{read:()=>props,alive:()=>true,blocked:()=>false,controller:key=>charts.get(key) as any,readiness:key=>status[key] as any,accept:next=>{props={...props,state:next};},...(options.noLinkedPort?{}:{linked})});
 const hosts=Object.fromEntries(order.filter(id=>charts.has(id)).map(id=>[names[id],host(id)]));
 /** App keyboard Undo/Redo: the active chart's drawings.undo routes to its bound Grid host history. */
 const keyboard=(direction:'undo'|'redo',active:string)=>hosts[active].history(direction,()=>{});
 const cell=(name:string)=>props.state.cells[order[' ABCDEF'.indexOf(name)-1]];
 const native=(name:string)=>natives.get(order[' ABCDEF'.indexOf(name)-1]);
 return{hosts,keyboard,cell,native,props:()=>props,replaceRoot:()=>{props={...props,state:structuredClone(props.state)};},history,forwards,quarantines,writes:()=>writes,prepares:()=>prepares,origin:A};
}
type Grid=ReturnType<typeof linkedGrid>;
/** The origin chart's own canonical candidate for each action, as its owned publisher prepares it. */
function candidate(g:Grid,kind:'erase'|'clone'|'paste'|'remove'):Row{
 const before=structuredClone(g.cell('A').drawings),rows=before.drawings as Row[],manager=before.lvDrawingManager as any;
 if(kind==='erase'||kind==='remove')return{...before,drawings:rows.filter(item=>item.id!=='S1'),lvDrawingManager:{...manager,groups:[{...manager.groups[0],memberIds:['L-A']}]}};
 return{...before,drawings:[...rows,row(kind==='clone'?'S1-clone':'S1-paste','layout')]};
}
const purpose={erase:'erase',clone:'duplicate',paste:'paste',remove:'remove'} as const;
function run(g:Grid,kind:'erase'|'clone'|'paste'|'remove'){const command=g.hosts.A.capture(purpose[kind] as any),pending=command.prepare(candidate(g,kind));pending.publish(()=>{});}
const untouched=(g:Grid,before:MultiChartState)=>{for(const name of ['D','E','F'])expect(g.cell(name)).toEqual(before.cells[g.props().state.layout.cells[' ABCDEF'.indexOf(name)-1].id]);};

describe('LINKED.WORKSPACE',()=>{
 it.each(['erase','clone','paste','remove'] as const)('DWUTIL.LINKED.WORKSPACE.ONE_STEP %s across three same-scope cells is one history step and Undo restores all three',kind=>{
  const g=linkedGrid(),before=g.props().state;
  run(g,kind);
  expect(g.writes()).toBe(1);expect(g.prepares()).toBe(1);expect(g.history.status().undo).toBe(1);expect(g.forwards).toEqual(['B','C']);expect(g.quarantines).toEqual([]);
  const expected=kind==='erase'||kind==='remove'?(name:string)=>['L-'+name]:(name:string)=>['S1','L-'+name,kind==='clone'?'S1-clone':'S1-paste'];
  for(const name of ['A','B','C'])expect(ids(g.cell(name).drawings)).toEqual(expected(name));
  for(const name of ['B','C'])expect(g.native(name)).toEqual(g.cell(name).drawings);
  if(kind==='erase'||kind==='remove')for(const name of ['B','C'])expect((g.cell(name).drawings.lvDrawingManager as any).groups[0].memberIds).toEqual(['L-'+name]);
  untouched(g,before);
  g.keyboard('undo','A');expect(g.props().state).toBe(before);for(const name of ['B','C'])expect(g.native(name)).toEqual(before.cells[g.props().state.layout.cells[' ABCDEF'.indexOf(name)-1].id].drawings);
 });
 it('LINKED.WORKSPACE.KEYBOARD Undo and Redo through the App keyboard seam work with the origin active and then with a peer active',()=>{
  const g=linkedGrid(),before=g.props().state;run(g,'erase');const after=g.props().state;
  g.keyboard('undo','A');expect(g.props().state).toBe(before);
  g.keyboard('redo','A');expect(g.props().state).toBe(after);for(const name of ['A','B','C'])expect(ids(g.cell(name).drawings)).toEqual(['L-'+name]);
  g.keyboard('undo','B');expect(g.props().state).toBe(before);for(const name of ['A','B','C'])expect(ids(g.cell(name).drawings)).toEqual(['S1','L-'+name]);
  g.keyboard('redo','C');expect(g.props().state).toBe(after);expect(g.native('B')).toEqual(after.cells[after.layout.cells[1].id].drawings);
  expect(g.props().onDrawingHistory).toHaveBeenCalledTimes(4);expect(g.writes()).toBe(1);
 });
 it('LINKED.WORKSPACE.SCOPE a different-symbol cell and a same-symbol cell with another adjustment are untouched even with the same drawing id',()=>{
  const g=linkedGrid(),before=g.props().state;run(g,'erase');
  untouched(g,before);expect(ids(g.cell('D').drawings)).toContain('S1');expect(ids(g.cell('E').drawings)).toContain('S1');expect(g.forwards).not.toContain('D');expect(g.forwards).not.toContain('E');
 });
 it('LINKED.WORKSPACE.UNMOUNTED an unmounted peer (maximized origin) receives a canonical-only candidate in the same step',()=>{
  const g=linkedGrid({unmounted:['C']});run(g,'erase');
  expect(g.forwards).toEqual(['B']);expect(g.native('C')).toBeUndefined();expect(ids(g.cell('C').drawings)).toEqual(['L-C']);expect(g.writes()).toBe(1);expect(g.history.status().undo).toBe(1);
 });
 it.each(['unavailable','quarantined'] as const)('DWUTIL.LINKED.WORKSPACE.UNAVAILABLE a %s peer refuses the whole action before forwarding',()=>{
  const g=linkedGrid({unavailable:['C']}),before=g.props().state,command=g.hosts.A.capture('erase');
  expect(()=>command.prepare(candidate(g,'erase'))).toThrow(LINKED_PEER_UNAVAILABLE_MESSAGE);
  expect(g.props().state).toBe(before);expect(g.forwards).toEqual([]);expect(g.prepares()).toBe(0);expect(g.history.status().undo).toBe(0);expect(g.quarantines).toEqual([]);
 });
 it('LINKED.WORKSPACE.ROUTE a mounted peer without the linked forwarding route refuses before forwarding',()=>{
  const g=linkedGrid({noLinkedPort:true}),before=g.props().state;
  expect(()=>g.hosts.A.capture('erase').prepare(candidate(g,'erase'))).toThrow(LINKED_PEER_UNAVAILABLE_MESSAGE);expect(g.props().state).toBe(before);
 });
 it('LINKED.WORKSPACE.LIMIT more than 128 candidates across cells refuses with the DD-29 text',()=>{
  const g=linkedGrid({scoped:42}),before=g.props().state,origin=structuredClone(g.cell('A').drawings);
  // 43 scoped rows removed in each of 3 cells = 129 candidate rows.
  const next={...origin,drawings:(origin.drawings as Row[]).filter(item=>!item.lvSyncScope),lvDrawingManager:{...(origin.lvDrawingManager as any),groups:[{...(origin.lvDrawingManager as any).groups[0],memberIds:['L-A']}]}};
  expect(()=>g.hosts.A.capture('remove' as any).prepare(next)).toThrow(LINKED_DRAWING_LIMIT_MESSAGE);expect(g.props().state).toBe(before);expect(g.forwards).toEqual([]);
 });
 it.each(['prepare','replaced'] as const)('DWUTIL.LINKED.WORKSPACE.BEFORE_FORWARD an injected %s failure before forwarding changes nothing',kind=>{
  const g=linkedGrid(kind==='prepare'?{prepareFailure:true}:{}),saved=g.props().state,natives=['B','C'].map(name=>structuredClone(g.native(name)));
  if(kind==='prepare')expect(()=>g.hosts.A.capture('erase').prepare(candidate(g,'erase'))).toThrow('SYNTHETIC root preparation failure');
  else{const pending=g.hosts.A.capture('erase').prepare(candidate(g,'erase'));g.replaceRoot();expect(()=>pending.publish(()=>{})).toThrow();}
  expect(g.forwards).toEqual([]);expect(g.quarantines).toEqual([]);expect(g.history.status().undo).toBe(0);expect(g.writes()).toBe(0);
  expect(['B','C'].map(name=>g.native(name))).toEqual(natives);for(const name of ['A','B','C'])expect(ids(g.cell(name).drawings)).toEqual(['S1','L-'+name]);
  if(kind==='prepare')expect(g.props().state).toBe(saved);
 });
 it.each(['forward','publish'] as const)('DWUTIL.LINKED.WORKSPACE.AFTER_FORWARD a %s failure after forwarding quarantines the cells and Reopen restores the saved workspace',kind=>{
  const g=linkedGrid(kind==='forward'?{forwardFailure:'C'}:{publishFailure:true}),saved=g.props().state;
  expect(()=>run(g,'erase')).toThrow(/SYNTHETIC/);
  expect(g.props().state).toBe(saved);expect(g.history.status().undo).toBe(0);expect(g.writes()).toBe(0);
  expect(g.quarantines).toHaveLength(1);expect(g.quarantines[0].cells).toEqual(['A','B','C']);expect(g.quarantines[0].message).toMatch(/Reopen/);
  expect(ids(g.native('B')!)).toEqual(['L-B']);// B was forwarded: an unpublished native intermediate state
  // Reopen: each quarantined chart reloads the authoritative saved workspace.
  for(const name of ['A','B','C'])expect(ids(g.cell(name).drawings)).toEqual(['S1','L-'+name]);
 });
 it('LINKED.WORKSPACE.LOCAL an unscoped drawing keeps the single-chart route with no peer forwarding',()=>{
  const g=linkedGrid(),before=structuredClone(g.cell('A').drawings);
  g.hosts.A.capture('erase').prepare({...before,drawings:(before.drawings as Row[]).filter(item=>item.id!=='L-A'),lvDrawingManager:{...(before.lvDrawingManager as any),groups:[{...(before.lvDrawingManager as any).groups[0],memberIds:['S1']}]}}).publish(()=>{});
  expect(g.forwards).toEqual([]);expect(ids(g.cell('A').drawings)).toEqual(['S1']);expect(ids(g.cell('B').drawings)).toEqual(['S1','L-B']);expect(g.history.status().undo).toBe(1);
 });
});
