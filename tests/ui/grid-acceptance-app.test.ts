import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {transitionGridDrawingScopes} from '../../src/ui/workspace-grid';
import {createWorkspaceChartHost} from '../../src/ui/workspace-chart-host';
import {createGridDrawingWorkspaceHost} from '../../src/ui/drawing-workspace';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {duplicateAdapterFixture} from '../chart/drawing-duplicate-adapter-harness';
import {annotationRecord} from '../chart/trendline-annotation-native-harness';

// Actual App publication closures with controlled React scheduling. No native
// window, desktop input, effects beyond startup, or pixels are exercised.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>,failWorkspace:false}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{if(hooks.failWorkspace&&value?.grid)throw Error('Synthetic React workspace publication failure');hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.failWorkspace=false;});afterEach(()=>vi.unstubAllGlobals());
async function setup(){
 vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const render=()=>{hooks.cursor=0;return App();};render();const boot=hooks.effects[0];hooks.effects=[];boot();for(let i=0;i<5;i++)await Promise.resolve();
 return{render,grid:()=>find(render(),node=>node.type===WorkspaceChartHost).props};
}
function changeSource(grid:any){
 const spy=grid.datasets.find((row:any)=>row.instrument.symbol==='SPY'&&row.resolution==='1D'),candidate=structuredClone(grid.state),id=candidate.layout.activeCellId;
 candidate.layout.cells.find((row:any)=>row.id===id).symbol='SPY';candidate.cells[id].datasetId=spy.provenance.datasetId;
 const next=transitionGridDrawingScopes(grid.state,candidate,grid.datasets,grid.datasets);
 return{next,spy,prepared:{nextDatasets:grid.datasets,nextActiveBars:spy.bars,nextActiveExecutionIdentity:'ordinary',activeCellId:id,activeDatasetId:spy.provenance.datasetId,activeResolution:spy.resolution}};
}
it('linked source acknowledges authoritative model/history/input refs before a failing view write',async()=>{
 const ui=await setup(),grid=ui.grid(),{next,spy,prepared}=changeSource(grid);hooks.failWorkspace=true;
 let observed:unknown;
 const accepted=vi.fn(()=>{
  const refs=hooks.cells.filter(row=>row&&Object.hasOwn(row,'current')).map(row=>row.current);
  const history=refs.find(row=>typeof row?.peekUndo==='function');
  observed={model:refs.some(row=>row?.grid===next&&row.symbol==='SPY'),committedInput:refs.some(row=>row?.workspace?.grid===next&&row.dataset===spy&&row.bars===spy.bars),input:refs.some(row=>row?.datasets===grid.datasets&&row.dataset===spy&&row.bars===spy.bars),priorSymbol:history?.peekUndo()?.workspace.symbol};
 });
 expect(grid.onChange(next,prepared,undefined,accepted)).toBe(false);expect(accepted).toHaveBeenCalledOnce();
 // A source change is navigation and records no undo step, so there is no prior-symbol entry.
 expect(observed).toEqual({model:true,committedInput:true,input:true,priorSymbol:undefined});
});
it('invalid source publication rejects without acknowledgement or history mutation',async()=>{
 const ui=await setup(),grid=ui.grid(),{next,prepared}=changeSource(grid),accepted=vi.fn();next.cells[next.layout.activeCellId].datasetId='unavailable-synthetic-source';
 expect(grid.onChange(next,prepared,undefined,accepted)).toBe(false);expect(accepted).not.toHaveBeenCalled();
 const refs=hooks.cells.filter(row=>row&&Object.hasOwn(row,'current')).map(row=>row.current),history=refs.find(row=>typeof row?.peekUndo==='function');
 expect(history.peekUndo()).toBeNull();expect(ui.grid().state).toBe(grid.state);
});
it('ordinary accepted grid write still records one undo step and acknowledges once',async()=>{
 const ui=await setup(),grid=ui.grid(),next=structuredClone(grid.state),accepted=vi.fn();next.cells[next.layout.activeCellId].appearance.background='#123456';
 expect(grid.onChange(next,undefined,undefined,accepted)).toBe(true);expect(accepted).toHaveBeenCalledOnce();expect(ui.grid().state).toBe(next);
 const history=hooks.cells.map(row=>row?.current).find(row=>typeof row?.peekUndo==='function');expect(history.peekUndo()).not.toBeNull();
});
it('Duplicate prepares full workspace/history capacity without writing, then preserves exact drawing values in memory',async()=>{
 const ui=await setup(),grid=ui.grid(),command=grid.onCaptureDrawingWorkspace(grid.state),next={...grid.state,cells:{...grid.state.cells}};
 const id=next.layout.activeCellId,row={id:'copy-proof',type:'future-drawing',anchors:[],opaque:{missing:undefined,negativeZero:-0}};
 next.cells[id]={...next.cells[id],drawings:{version:1,drawings:[row]}};
 const pending=command.prepare(next),history=hooks.cells.map(row=>row?.current).find(row=>typeof row?.peekUndo==='function');
 expect(history.status().undo).toBe(0);expect(ui.grid().state).toBe(grid.state);
 const accepted=vi.fn(()=>{expect(history.status().undo).toBe(1);expect(hooks.cells.some(value=>value?.current?.grid===next)).toBe(true);});
 pending.publish(accepted);expect(accepted).toHaveBeenCalledOnce();pending.assertCurrent();command.assertCurrent();
 const actual=ui.grid().state.cells[id].drawings.drawings[0];expect(Object.hasOwn(actual.opaque,'missing')).toBe(true);expect(Object.is(actual.opaque.negativeZero,-0)).toBe(true);expect(actual).toBe(row);
 expect(()=>pending.publish(accepted)).toThrow('The drawing changed. Try again.');expect(history.status().undo).toBe(1);
});
it('Duplicate acknowledges model/history acceptance before React failure and cannot be replayed',async()=>{
 const ui=await setup(),grid=ui.grid(),next=structuredClone(grid.state),id=next.layout.activeCellId;
 next.cells[id].drawings={version:1,drawings:[{id:'accepted-copy',type:'future-drawing'}]};
 const pending=grid.onCaptureDrawingWorkspace(grid.state).prepare(next),accepted=vi.fn();hooks.failWorkspace=true;
 expect(()=>pending.publish(accepted)).toThrow('Synthetic React');expect(accepted).toHaveBeenCalledOnce();
 const refs=hooks.cells.map(row=>row?.current),history=refs.find(row=>typeof row?.peekUndo==='function');expect(refs.some(value=>value?.grid===next)).toBe(true);expect(history.status().undo).toBe(1);pending.assertCurrent();
 expect(()=>pending.publish(accepted)).toThrow('The drawing changed. Try again.');
});
it('Duplicate rejects a replaced workspace or oversized candidate before recording its undo step',async()=>{
 const ui=await setup(),grid=ui.grid(),candidate=structuredClone(grid.state),id=candidate.layout.activeCellId;
 candidate.cells[id].drawings={version:1,drawings:[],opaque:'x'.repeat(33*1024*1024)};
 expect(()=>grid.onCaptureDrawingWorkspace(grid.state).prepare(candidate)).toThrow(/32 MiB/);
 const history=hooks.cells.map(row=>row?.current).find(row=>typeof row?.peekUndo==='function');expect(history.status().undo).toBe(0);
 const replacement=structuredClone(grid.state),pending=grid.onCaptureDrawingWorkspace(grid.state).prepare(structuredClone(grid.state));replacement.cells[id].appearance.background='#010203';
 expect(grid.onChange(replacement)).toBe(true);const ack=vi.fn();expect(()=>pending.publish(ack)).toThrow(/changed|retired/);expect(ack).not.toHaveBeenCalled();expect(history.status().undo).toBe(1);
});
it('actual App, tree, Grid and extracted adapter publish a genuine native duplicate with exactly one new workspace undo step',async()=>{
 const ui=await setup(),original=annotationRecord(),native=await duplicateAdapterFixture([{...original,lvPaneBinding:{schemaVersion:1,target:{kind:'price'}},future:{missing:undefined,negativeZero:-0},props:{...original.props,lvTrendlineStats:{schemaVersion:1,priceRange:true,percentChange:false,barsRange:true,dateTimeRange:false,alwaysShow:true,position:'below'}}} as any]);try{
  let rootProps=ui.grid();const before=structuredClone(rootProps.state),id=before.layout.activeCellId;
  before.cells[id].drawings=native.controller.saveDrawings();expect(rootProps.onChange(before)).toBe(true);rootProps=ui.grid();
  const tree=createWorkspaceChartHost({read:()=>rootProps,changed:()=>{},alive:()=>true}),slot=tree.slots()[0];
  let gridProps={...rootProps,...slot.input,...slot.callbacks};
  const chart=Object.assign(native.controller,{getExecutionIdentity:()=>'ordinary',isInputCurrent:()=>true});
  const data=gridProps.datasets.find((row:any)=>row.provenance.datasetId===gridProps.activeDatasetId),status={input:{bars:gridProps.activeBars,source:sourceContextForDataset(data,gridProps.activeBars),style:gridProps.state.cells[id].style},settled:true,error:''};
  chart.bindDrawingWorkspaceHost(createGridDrawingWorkspaceHost(id,chart,{read:()=>gridProps,alive:()=>true,blocked:()=>false,controller:()=>chart,readiness:()=>status,accept:state=>{gridProps={...gridProps,state};}}));
  const history=hooks.cells.map(row=>row?.current).find(row=>typeof row?.peekUndo==='function'),startingSteps=history.status().undo;
  const receipt=chart.duplicateDrawings([native.rows[0].id]);expect(receipt).toMatchObject({nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:true});expect(history.status().undo).toBe(startingSteps+1);
  expect(slot.input.state).toBe(gridProps.state);expect(slot.awaitingProps).toBe(gridProps.state);rootProps=ui.grid();expect(rootProps.state).toBe(gridProps.state);tree.sync();expect(slot.awaitingProps).toBeNull();
  const rows=rootProps.state.cells[id].drawings.drawings;expect(rows).toHaveLength(2);expect(rows[1].id).toBe(receipt.ids[0]);expect({...rows[1],id:rows[0].id,zIndex:rows[0].zIndex}).toStrictEqual(rows[0]);expect(rows[1].props.lvTrendlineStats.priceRange).toBe(true);expect(Object.hasOwn(rows[1].future,'missing')).toBe(true);expect(Object.is(rows[1].future.negativeZero,-0)).toBe(true);expect(native.controller.saveDrawings()).toStrictEqual(rootProps.state.cells[id].drawings);
 }finally{native.dispose();}
});
