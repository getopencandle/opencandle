import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {DrawingToolbar} from '../../src/ui/DrawingToolbar';
import {drawingCatalog} from '../../src/chart/drawing-port';
import {createGridDrawingWorkspaceHost} from '../../src/ui/drawing-workspace';
import {createDrawingErasePointerBridge} from '../../src/ui/drawing-erase-pointer';
import {createMultiChartState,type MultiChartGridProps,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {duplicateAdapterFixture} from '../chart/drawing-duplicate-adapter-harness';
import {annotationRecord} from '../chart/trendline-annotation-native-harness';

// ERASER.ENABLEMENT.GRID_ACTIVE_CHANGE (review finding GRID_INACTIVE_ARMED).
// Actual App closures and toolbar; two cells, each with the current adapter
// setDrawingMode/eraser blocks (shared adapter harness) bound to its own actual Grid
// drawing workspace host; the actual erase pointer bridge makes the press decision
// the Grid makes after a cell's focus capture. The App-facing controller wrapper,
// the Grid-side chart identity, readiness and root callbacks are SYNTHETIC. The
// wrapper's setTool mirrors the adapter's (which the harness does not extract)
// without renderer focus. No DOM, canvas painting, MultiChartGrid render or package.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const cells=hooks.cells,index=hooks.cursor++,old=cells[index];if(!old||deps.length!==old.deps.length||deps.some((v,i)=>!Object.is(v,old.deps[i])))cells[index]={deps,value:fn()};return cells[index].value;};
 return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
  useState:(initial:any)=>{const cells=hooks.cells,index=hooks.cursor++;if(!(index in cells))cells[index]=typeof initial==='function'?initial():initial;return[cells[index],(value:any)=>{cells[index]=typeof value==='function'?value(cells[index]):value;}];},
  useRef:(initial:any)=>{const cells=hooks.cells,index=hooks.cursor++;if(!(index in cells))cells[index]={current:initial};return cells[index];},
  useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),
  useEffect:(fn:()=>unknown,deps:any[])=>{const cells=hooks.cells,index=hooks.cursor++,old=cells[index];if(!old||deps.length!==old.length||deps.some((v,i)=>!Object.is(v,old[i]))){cells[index]=deps;hooks.effects.push(fn);}}
 };
});
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{
 if(Array.isArray(node))for(const child of node)findAll(child,test,out);
 else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}
 return out;
}
const find=(node:any,test:(node:any)=>boolean)=>findAll(node,test)[0]??null;
const ERASER='DW.CURSOR.ERASER';
let toolbarStore:{cells:any[];effects:Array<()=>unknown>};
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];toolbarStore={cells:[],effects:[]};});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

async function setup(){
 const listeners=new Map<string,Function>();
 vi.stubGlobal('window',{addEventListener:vi.fn((name:string,fn:Function)=>listeners.set(name,fn)),removeEventListener:vi.fn((name:string,fn:Function)=>{if(listeners.get(name)===fn)listeners.delete(name);})});
 vi.stubGlobal('document',{querySelector:vi.fn(()=>null)});
 const render=()=>{hooks.cursor=0;return App();};
 render();const boot=hooks.effects[0];hooks.effects=[];boot();for(let i=0;i<5;i++)await Promise.resolve();
 const appProps=()=>find(render(),row=>row.type===DrawingToolbar).props;
 const toolbar=()=>{const props=appProps(),appCells=hooks.cells,appEffects=hooks.effects,appCursor=hooks.cursor;hooks.cells=toolbarStore.cells;hooks.effects=toolbarStore.effects;hooks.cursor=0;try{return DrawingToolbar(props);}finally{hooks.cells=appCells;hooks.effects=appEffects;hooks.cursor=appCursor;}};
 const button=(label:string)=>find(toolbar(),node=>node.type==='button'&&node.props['aria-label']===label);
 const item=(id:string)=>find(toolbar(),node=>node.props['data-requirement']===id);
 /** Opens a group flyout by label prefix, so catalog copy changes (e.g. Trend line tools/Trend tools) do not matter here. */
 const open=(label:string)=>{const rows=findAll(toolbar(),node=>node.type==='button'&&String(node.props['aria-label']??'').startsWith('Open '+label));expect(rows).toHaveLength(1);rows[0].props.onClick();};
 const runEffect=(marker:string)=>{const index=hooks.effects.findIndex(fn=>String(fn).includes(marker));if(index<0)throw Error('Missing scheduled App effect: '+marker);return hooks.effects.splice(index,1)[0]();};
 /** The Grid's active(id) -> onReady(controller) -> App.setChartReady, then App re-subscribes. */
 const focus=(controller:object)=>{find(render(),row=>row.type===WorkspaceChartHost).props.onReady(controller);hooks.effects=[];render();runEffect('onToolChanged');};
 const cursorsMain=()=>{const rows=findAll(toolbar(),node=>node.type==='button'&&String(node.props.title??'').startsWith('Cursors:'));expect(rows).toHaveLength(1);return rows[0];};
 const eraserChecked=()=>{open('Cursors');const checked=item(ERASER).props['aria-checked'];open('Cursors');return checked;};
 return{appProps,button,item,open,focus,cursorsMain,eraserChecked};
}
/** Two-cell root workspace (drawing sync off) shared by both cells' actual Grid hosts. */
function root(){
 const data=fixtureDataset('GME',5),state=resizeMultiChartState(createMultiChartState(data,{appearance:defaultTheme.appearance}),'two-columns');state.layout.sync.drawings=false;
 const status={input:{bars:data.bars,source:sourceContextForDataset(data),style:'candles'},settled:true,error:''};
 const charts=new Map<string,object>(),history:Array<{direction:string;cell:string;armed:Array<string|null>}>=[],armedModes:Array<()=>string|null>=[];
 let props:MultiChartGridProps;
 const upstream=vi.fn((expected:typeof state)=>({assertCurrent:()=>{if(props.state!==expected)throw Error('SYNTHETIC root workspace replaced.');},prepare:()=>{throw Error('SYNTHETIC: this test never publishes an erase.');}}));
 const accept=vi.fn();
 props={state,datasets:[data],activeBars:data.bars,activeDatasetId:data.provenance.datasetId,activeExecutionIdentity:'ordinary',onChange:vi.fn(()=>true),onReady:vi.fn(),onActiveCell:vi.fn(),onCaptureDrawingWorkspace:upstream,drawingHistoryStatus:()=>({canUndo:true,canRedo:false}),
  onDrawingHistory:vi.fn((direction:'undo'|'redo')=>{history.push({direction,cell:current,armed:armedModes.map(mode=>mode())});})};
 let current='';
 const host=(id:string)=>{const chart={getExecutionIdentity:()=>'ordinary',isInputCurrent:()=>true};charts.set(id,chart);return createGridDrawingWorkspaceHost(id,chart as any,{read:()=>props,alive:()=>true,blocked:()=>false,controller:key=>charts.get(key) as any,readiness:()=>status as any,accept});};
 return{ids:state.layout.cells.map(cell=>cell.id),host,upstream,accept,history,armedModes,dispatching:(id:string)=>{current=id;}};
}
async function cell(grid:ReturnType<typeof root>,index:number){
 const id=grid.ids[index],f=await duplicateAdapterFixture([{...annotationRecord(),id:'SYNTHETIC-'+index,lvPaneBinding:{schemaVersion:1,target:{kind:'price'}}}] as any);
 try{f.controller.bindDrawingWorkspaceHost(grid.host(id));}catch(error){f.dispose();throw error;}
 const facade=f.f.facade as any,on=(name:string,fn:(value:any)=>void)=>f.f.native.on(name,fn);
 const app={drawingCatalog:()=>drawingCatalog(),drawings:facade,setTool:(type:string|null)=>{facade.setTool(type);},setDrawingMode:f.controller.setDrawingMode,beginDrawingEraseGesture:f.controller.beginDrawingEraseGesture,
  onToolChanged:(fn:(type:string|null)=>void)=>on('drawing:tool',({type})=>fn(type)),onDrawingModeChanged:(fn:(mode:any)=>void)=>on('drawing:mode',({mode})=>fn(mode)),indicators:{list:()=>[],subscribe:()=>()=>{}}};
 grid.armedModes.push(()=>facade.getMode());
 const canvas:any={closest:(selector:string)=>selector==='.chart-canvas'?canvas:null},node:any={isConnected:true,contains:(target:unknown)=>target===canvas},source={},reports:string[]=[];
 const bridge=createDrawingErasePointerBridge({read:()=>({chart:app,node,source,ready:true}),flushViewport:()=>{},report:message=>{reports.push(message);},defer:callback=>queueMicrotask(callback)});
 /** The Grid's erase capture for a primary mouse press on this cell's canvas, with a live native dispatch. */
 const press=()=>bridge.down({pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:1,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,target:canvas,nativeEvent:{eventPhase:2,currentTarget:node},eventPhase:2,currentTarget:node});
 return{id,f,app,facade,press,reports,native:f.f.paint.controller};
}
function expectCursor(ui:Awaited<ReturnType<typeof setup>>){
 const main=ui.cursorsMain();expect(main.props['aria-label']).toBe('Cursor');expect(main.props.title).toBe('Cursors: Cross');expect(main.props['aria-pressed']).toBe(true);
 expect(ui.button('Eraser')).toBeNull();expect(ui.eraserChecked()).toBe(false);
}

it('moving focus to another cell disarms the previous eraser: its next press cannot erase, Undo in the new cell runs with no armed chart, and the toolbar shows Cursor',async()=>{
 const ui=await setup(),grid=root(),a=await cell(grid,0),b=await cell(grid,1);
 try{
  ui.focus(a.app);ui.open('Cursors');ui.item(ERASER).props.onClick();
  expect(a.facade.getMode()).toBe('eraser');expect(a.native.eraserMode).toBe(true);expect(grid.upstream).toHaveBeenCalledOnce();
  const focusesA=a.f.focuses(),focusesB=b.f.focuses();
  ui.focus(b.app);
  expect(a.facade.getMode()).toBe(null);expect(a.native.eraserMode).toBe(false);
  expect(a.f.focuses()).toBe(focusesA);expect(b.f.focuses()).toBe(focusesB);
  expect(ui.appProps().chart).toBe(b.app);expectCursor(ui);
  grid.dispatching(b.id);expect(()=>b.facade.undo()).not.toThrow();
  expect(grid.history).toEqual([{direction:'undo',cell:b.id,armed:[null,null]}]);
  // A press in A: the cell focus capture runs first, then the erase capture reads A's own mode.
  ui.focus(a.app);expect(a.press()).toBe('ordinary');
  expect(()=>a.app.beginDrawingEraseGesture(()=>{})).toThrow();expect(a.native.eraserMode).toBe(false);
  expect(a.f.f.document.ids()).toEqual(['SYNTHETIC-0']);expect(grid.accept).not.toHaveBeenCalled();expect(a.reports).toEqual([]);
  expect(ui.appProps().chart).toBe(a.app);expectCursor(ui);
  // Eraser can be chosen again in A, and leaving A again disarms it.
  ui.open('Cursors');ui.item(ERASER).props.onClick();expect(a.facade.getMode()).toBe('eraser');expect(ui.cursorsMain().props['aria-label']).toBe('Eraser');
  ui.focus(b.app);expect(a.facade.getMode()).toBe(null);expect(a.native.eraserMode).toBe(false);expectCursor(ui);
 }finally{a.f.dispose();b.f.dispose();}
});
it('moving focus disarms a drawing tool or Measure on the previous chart without focusing it',async()=>{
 const ui=await setup(),grid=root(),a=await cell(grid,0),b=await cell(grid,1);
 try{
  ui.focus(a.app);ui.open('Trend');ui.item('DW.TREND.RAY').props.onClick();expect(a.facade.getTool()).toBe('ray');
  let focusesA=a.f.focuses();ui.focus(b.app);
  expect(a.facade.getTool()).toBe(null);expect(a.facade.getMode()).toBe(null);expect(a.f.focuses()).toBe(focusesA);expect(b.facade.getTool()).toBe(null);
  ui.focus(a.app);ui.button('Measure').props.onClick();expect(a.facade.getMode()).toBe('measure');
  focusesA=a.f.focuses();ui.focus(b.app);
  expect(a.facade.getMode()).toBe(null);expect(a.f.focuses()).toBe(focusesA);expect(ui.appProps().activeMode).toBe(null);expect(ui.button('Measure').props['aria-pressed']).toBe(false);
 }finally{a.f.dispose();b.f.dispose();}
});
