import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {DrawingTemplateBatchError} from '../../src/chart/drawing-template-batch';
import {DrawingEditRecoveryError} from '../../src/chart/drawing-edit-transaction';
import {templateAdapterHarness} from '../chart/drawing-template-adapter-harness';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>,cleanup:[] as Array<()=>void>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:(fn:()=>any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))hooks.cells[i]={deps,value:fn()};return hooks.cells[i].value;},useEffect:(fn:()=>unknown,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old[j]))){hooks.cells[i]=deps;hooks.effects.push(fn);}}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.cleanup=[];});
afterEach(()=>{for(const cleanup of hooks.cleanup.reverse())cleanup();vi.unstubAllGlobals();});

// Actual GridCell draw-event callback and native capture authority call the current
// extracted adapter save/notification/template host bodies plus real native core.
// Hook scheduling, non-drawing chart ports and persistence remain controlled.
function connectGrid(f:Awaited<ReturnType<typeof templateAdapterHarness>>,publish:(value:any)=>boolean){
 const dataset=fixtureDataset('GME',3),state=createMultiChartState(dataset,{appearance:defaultTheme.appearance}),id=state.layout.activeCellId;
 const grid=MultiChartGrid({state,datasets:[dataset],onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}),cell=find(grid,node=>typeof node.type==='function'&&node.type.name==='GridCell');expect(cell).not.toBeNull();
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];const accepted={bars:dataset.bars,source:sourceContextForDataset(dataset,dataset.bars),style:'candles'};
 const chart={getExecutionIdentity:()=> 'ordinary',getAnalysisUnavailable:()=>f.state().analysisUnavailable,onAvailabilityChanged:()=>()=>{},getChartOptions:()=>state.cells[id].chartOptions,applyChartOptions:()=>{},saveDrawings:f.save,loadDrawings:()=>{},indicators:{restore:()=>{},serialize:()=>[],subscribe:()=>()=>{}},comparisons:{restore:()=>{},list:()=>[],subscribe:()=>()=>{}},onDrawingsChanged:f.subscribe,getViewport:()=>null,onViewportChanged:()=>()=>{},onNavigationCommand:()=>()=>{},applyChartSettingsBook:()=>{},priceScale:{bindHost:()=>()=>{},settings:()=>({}),applySettings:(value:unknown)=>value},isInputCurrent:(input:any)=>!f.state().analysisUnavailable&&input.bars===accepted.bars&&input.source.datasetId===accepted.source.datasetId};
 const props={...cell.props,saved:{...cell.props.saved,drawings:f.document.serialize()},onCapture:publish,onReady:()=>{},onStatus:()=>{},port:{mount:()=>()=>{}}};
 const render=()=>{hooks.cursor=0;return cell.type(props);},flush=()=>{for(const effect of hooks.effects.splice(0)){const cleanup=effect();if(typeof cleanup==='function')hooks.cleanup.push(cleanup as ()=>void);}};
 let tree=render();flush();find(tree,node=>node.type===ChartPanel).props.onReady(chart,accepted,'ordinary');tree=render();flush();render();flush();
}


for(const rejection of [false,true])it(`actual Grid capture ${rejection?'rejects publication after accepted template values':'saves accepted template without reconciling its canonical epoch'}`,async()=>{
 const f=await templateAdapterHarness();try{
  const captures=vi.fn((..._arguments:any[])=>!rejection);connectGrid(f,captures);captures.mockClear();
  const initialReconciliations=f.state().reconciliations;let siblings=0;f.subscribe(()=>{siblings++;});
  const action=()=>f.batches.commit(f.batches.prepare(f.rows.map(row=>row.id),'synthetic-template'));
  if(rejection)expect(action).toThrow(DrawingTemplateBatchError);else expect(action).not.toThrow();
  expect(captures).toHaveBeenCalledOnce();expect(captures.mock.calls[0][0].drawings).toEqual(f.document.serialize());expect(siblings).toBe(1);
  expect(f.state()).toMatchObject({notifications:1,reconciliations:initialReconciliations,drawingBatch:0,nativeDrawingReconciliationHold:0});
  expect(f.document.all().every(row=>(row.style as any).lineColor==='#abcdef')).toBe(true);
  expect(f.native.controller.all().every((row:any)=>row.style.lineColor==='#abcdef')).toBe(true);
  if(rejection)expect(f.state().analysisUnavailable).toContain('accepted');else expect(f.state().analysisUnavailable).toBe('');
  expect(f.document.undo()).toBe(true);expect(f.document.all()).toEqual(f.rows);expect(f.document.undo()).toBe(false);
  expect(f.batches.captureReadOnly()).toBeUndefined();
 }finally{f.native.dispose();}
});

for(const rejection of [false,true])it(`actual Grid capture ${rejection?'rejects an accepted single edit without losing its command':'saves a single edit to an unselected target with one owned command'}`,async()=>{
 const f=await templateAdapterHarness();try{
  const captures=vi.fn((..._arguments:any[])=>!rejection);connectGrid(f,captures);captures.mockClear();f.select([f.rows[1].id]);
  const initialReconciliations=f.state().reconciliations;let siblings=0;f.subscribe(()=>{siblings++;});
  const action=()=>f.edit(f.rows[0].id,{'style.lineWidth':4});
  if(rejection){let failure:unknown;try{action();}catch(error){failure=error;}expect(failure).toBeInstanceOf(DrawingEditRecoveryError);expect((failure as DrawingEditRecoveryError).accepted).toBe(true);}else expect(action()).toEqual({accepted:true,changed:true});
  expect(captures).toHaveBeenCalledOnce();expect(captures.mock.calls[0][0].drawings).toEqual(f.document.serialize());expect(siblings).toBe(1);
  expect(f.state()).toMatchObject({notifications:1,reconciliations:initialReconciliations,drawingBatch:0,nativeDrawingReconciliationHold:0});
  expect((f.document.all()[0].style as any).lineWidth).toBe(4);expect(f.native.controller.store.get(f.rows[0].id).style.lineWidth).toBe(4);expect(f.native.selection()).toEqual([f.rows[1].id]);
  if(rejection)expect(f.state().analysisUnavailable).toContain('drawing changed');else expect(f.state().analysisUnavailable).toBe('');
  expect(f.document.undo()).toBe(true);expect(f.document.all()).toEqual(f.rows);expect(f.document.undo()).toBe(false);expect(f.batches.captureReadOnly()).toBeUndefined();
 }finally{f.native.dispose();}
});
