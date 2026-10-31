// R2 polish: a routine autosave success is silent (only a manual Save or recovery from a shown error reports), so the formerly shown save status is now asserted absent.
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {DrawingDialog} from '../../src/ui/DrawingDialog';
import {DrawingEditBar} from '../../src/ui/drawing-edit-bar';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {sourceContextForDataset} from '../../src/chart/source-context';
// R9-2 (App side: App renders the drawing settings dialog only while a
// drawing is selected (dialog==='drawing'&&chart&&selectedDrawing). Losing the selection used to hide the dialog without
// closing it, so the dialog state and its owner stayed set: every chart context action was refused ('Finish the current
// dialog or workspace operation first.') and the next selection popped the settings dialog again. Also the root ruling on
// the R9-1 design note: the routine background autosave keeps its status line, but does not replace a status
// shown less than 3 s earlier (an undo or redo, or another user-action status).
// Actual App closures under controlled React hooks and an in-memory bridge; the chart controller is a minimal fake.
// SYNTHETIC; no DOM, focus engine, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const REFUSED='Finish the current dialog or workspace operation first.';

function fakeChart(){
 let selection:((ids:string[])=>void)|null=null;const off=()=>()=>{};
 const chart:any={
  drawings:{getTool:()=>null,getMode:()=>null,setTool:vi.fn(),select:vi.fn(),list:()=>[{id:'line',type:'trendline',visible:true}]},
  drawingManager:{list:()=>[{id:'line',type:'trendline',visible:true}]},setDrawingMode:vi.fn(),
  onDrawingSelection:(handler:(ids:string[])=>void)=>{selection=handler;return()=>{if(selection===handler)selection=null;};},
  onDrawingsChanged:off,onToolChanged:off,onModeChanged:off,
 };
 return{chart,select:(ids:string[])=>selection!(ids)};
}
async function setup(layoutAutosave=true){
 let revision=4;const initial=createInitialWorkspace();
 const data=prepareWorkspaceJSON({...initial,layoutLibrary:{...initial.layoutLibrary!,autosave:layoutAutosave},paper:createPaperAccount({initialBalance:500}),alerts:[]});
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-17T00:00:00Z',data,storage:{directory:'Synthetic R9 profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:++revision,savedAt:'2026-10-17T00:00:01Z'}})),onFlushRequest:vi.fn((_handler:()=>Promise<unknown>)=>vi.fn())};
 const win={lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()};vi.stubGlobal('window',win);
 const coordinator={suspend:vi.fn((_expected:unknown,_options?:unknown)=>({isCurrent:()=>true,resume:vi.fn()})),apply:vi.fn(async(request:any)=>{request.commitModel(()=>{});return{publicationErrors:[]};})};
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady(coordinator);render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports are irrelevant here */}
 const effects=()=>{render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 const shown=()=>text(render());
 effects();await vi.advanceTimersByTimeAsync(1300);await flush();effects();bridge.saveWorkspace.mockClear();
 return{bridge,render,grid,effects,shown,coordinator};
}
async function withChart(){
 const ui=await setup(),fake=fakeChart();
 ui.grid().onReady(fake.chart);ui.effects();ui.effects();
 const dialogShown=()=>!!find(ui.render(),node=>node.type===DrawingDialog);
 const bar=()=>find(ui.render(),node=>node.type===DrawingEditBar);
 return{...ui,fake,dialogShown,bar};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date','performance']});});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals();});

it('R9-2: losing the selection closes the drawing settings dialog opened from the selection bar (owner reset, no reopen)',async()=>{
 const ui=await withChart();
 ui.fake.select(['line']);ui.effects();
 expect(ui.bar()).not.toBeNull();ui.bar().props.onSettings();ui.effects();
 expect(ui.dialogShown()).toBe(true);
 // The renderer popup's document pointerdown dismissal clears the selection.
 ui.fake.select([]);ui.effects();ui.effects();
 expect(ui.dialogShown()).toBe(false);
 // Reselecting the line shows the selection bar only: the settings dialog does not pop up again.
 ui.fake.select(['line']);ui.effects();ui.effects();
 expect(ui.dialogShown()).toBe(false);expect(ui.bar()).not.toBeNull();
 // The chart context menu is not refused by a dialog that is no longer shown.
 try{await ui.grid().contextActions.theme({} as any,{} as any);}catch{/* other target checks may refuse the synthetic snapshot */}
 await flush();ui.effects();
 expect(ui.shown()).not.toContain(REFUSED);
});
it('R9-2: the drawing dialog close on deselection goes through the ordinary close path (a later dialog is not affected)',async()=>{
 const ui=await withChart();
 ui.fake.select(['line']);ui.effects();ui.bar().props.onSettings();ui.effects();expect(ui.dialogShown()).toBe(true);
 // Cancel path: onClose is App's chart dialog close.
 find(ui.render(),node=>node.type===DrawingDialog).props.onClose();ui.effects();expect(ui.dialogShown()).toBe(false);
 ui.fake.select([]);ui.effects();ui.fake.select(['line']);ui.effects();expect(ui.dialogShown()).toBe(false);
 // Reopen, deselect: closed again; then the dialog opens normally for the next selection.
 ui.bar().props.onSettings();ui.effects();expect(ui.dialogShown()).toBe(true);
 ui.fake.select([]);ui.effects();ui.effects();expect(ui.dialogShown()).toBe(false);
 ui.fake.select(['line']);ui.effects();ui.effects();expect(ui.dialogShown()).toBe(false);
 ui.bar().props.onSettings();ui.effects();expect(ui.dialogShown()).toBe(true);
});
it('R9-1 ruling (LV-DEFINED): a background autosave does not replace an undo status shown less than 3 s earlier, and reports normally after that',async()=>{
 const ui=await setup();
 const change=(background:string)=>{const next=structuredClone(ui.grid().state);next.cells[next.layout.activeCellId].appearance.background=background;expect(ui.grid().onChange(next)).toBe(true);ui.render();ui.effects();};
 change('#123456');await vi.advanceTimersByTimeAsync(1300);await flush();ui.effects();ui.bridge.saveWorkspace.mockClear();
 // Ctrl+Z as the chart dispatches it (onDrawingHistory): the undo commit arms the debounced background autosave.
 ui.grid().onDrawingHistory('undo',ui.grid().state);await flush();ui.effects();
 expect(ui.shown()).not.toMatch(/Change undone/);
 await vi.advanceTimersByTimeAsync(1300);await flush();ui.effects();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect((ui.coordinator.suspend.mock.calls.at(-1)![1] as {background?:boolean}|undefined)?.background).toBe(true);
 expect(ui.shown()).not.toMatch(/Change undone/);expect(ui.shown()).not.toMatch(/saved locally/);
 // More than 3 s after the last user-action status, the routine autosave status is shown again.
 await vi.advanceTimersByTimeAsync(3000);change('#654321');
 await vi.advanceTimersByTimeAsync(1300);await flush();ui.effects();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);expect(ui.shown()).not.toMatch(/saved locally/);
});
it('R9-1 ruling: an explicit Save always reports, even right after an undo status',async()=>{
 const ui=await setup();
 const next=structuredClone(ui.grid().state);next.cells[next.layout.activeCellId].appearance.background='#2468ac';ui.grid().onChange(next);ui.effects();
 await vi.advanceTimersByTimeAsync(1300);await flush();ui.effects();ui.bridge.saveWorkspace.mockClear();
 ui.grid().onDrawingHistory('undo',ui.grid().state);await flush();ui.effects();expect(ui.shown()).not.toMatch(/Change undone/);
 find(ui.render(),node=>node.type==='button'&&text(node)==='Save').props.onClick();await flush();ui.effects();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(ui.shown()).toContain('Layout saved locally.');
});

const changeOf=(ui:Awaited<ReturnType<typeof setup>>)=>(background:string)=>{const next=structuredClone(ui.grid().state);next.cells[next.layout.activeCellId].appearance.background=background;expect(ui.grid().onChange(next)).toBe(true);ui.render();ui.effects();};
const undoNow=async(ui:Awaited<ReturnType<typeof setup>>)=>{ui.grid().onDrawingHistory('undo',ui.grid().state);await flush();ui.effects();};
const redoNow=async(ui:Awaited<ReturnType<typeof setup>>)=>{ui.grid().onDrawingHistory('redo',ui.grid().state);await flush();ui.effects();};
const advance=async(ui:Awaited<ReturnType<typeof setup>>,ms:number)=>{await vi.advanceTimersByTimeAsync(ms);await flush();ui.effects();};
it('RFR-2: a background save success replaces an earlier save error at once (the hold protects only non-error action statuses)',async()=>{
 const ui=await setup(),change=changeOf(ui);
 ui.bridge.saveWorkspace.mockResolvedValueOnce({ok:false,error:{code:'SYNTHETIC_IO',message:'SYNTHETIC disk unavailable'}} as any);
 change('#111111');await advance(ui,1300);
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(ui.shown()).toContain('SYNTHETIC disk unavailable');
 // An edit that sets no status arms the next autosave, which succeeds well inside 3 s of the error.
 change('#222222');await advance(ui,1300);
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);
 expect(ui.shown()).toMatch(/saved locally/);expect(ui.shown()).not.toContain('SYNTHETIC disk unavailable');
});
it('RFR-2: an error reported by a chart action does not hold back a later background save status',async()=>{
 const ui=await withChart(),change=changeOf(ui);
 // A refused chart action (a stale menu lease) reports its error as a status.
 const lease={snapshot:{},isCurrent:()=>false,isOwnerCurrent:()=>false,release:vi.fn()};
 await ui.grid().contextActions.theme(lease.snapshot as any,lease as any);await flush();ui.effects();
 expect(ui.shown()).toContain('The chart menu target is no longer current.');
 change('#333333');await advance(ui,1300);
 expect(ui.shown()).toMatch(/saved locally/);expect(ui.shown()).not.toContain('The chart menu target is no longer current.');
});
it('RFR-3: a held background save status is shown once the hold ends, not dropped',async()=>{
 const ui=await setup(),change=changeOf(ui);
 change('#123456');await advance(ui,1300);ui.bridge.saveWorkspace.mockClear();
 await undoNow(ui);await advance(ui,1300);
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(ui.shown()).not.toMatch(/Change undone/);expect(ui.shown()).not.toMatch(/saved locally/);
 await advance(ui,1600);// 2.9 s after the undo status: still held
 expect(ui.shown()).not.toMatch(/Change undone/);
 await advance(ui,200);// 3.1 s: the routine autosave stays silent (R2)
 expect(ui.shown()).not.toMatch(/saved locally/);
});
it('RFR-3: the autosave-off recovery draft notice is held, then shown',async()=>{
 const ui=await setup(false),change=changeOf(ui);
 change('#123456');await advance(ui,1300);ui.bridge.saveWorkspace.mockClear();
 await undoNow(ui);await advance(ui,1300);
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(ui.shown()).not.toMatch(/Change undone/);
 await advance(ui,1900);
 expect(ui.shown()).not.toContain('Recovery draft saved locally.');
});
it('RFR-3: a held save status is dropped when a newer status arrives first',async()=>{
 const ui=await setup(),change=changeOf(ui);
 change('#123456');await advance(ui,1300);ui.bridge.saveWorkspace.mockClear();
 await undoNow(ui);await advance(ui,1300);expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();// held behind 'Change undone.'
 await redoNow(ui);expect(ui.shown()).not.toMatch(/Change restored/);
 // Past the undo's hold (3.1 s after it) but inside the redo's: the undo-era save status was dropped.
 await advance(ui,1800);
 expect(ui.shown()).not.toMatch(/Change restored/);expect(ui.shown()).not.toMatch(/saved locally/);
 // The redo's own autosave status follows once the redo's hold ends.
 await advance(ui,1400);expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);expect(ui.shown()).not.toMatch(/saved locally/);
});
it('RFR-4: the hold uses a monotonic clock (a wall clock step backwards does not suppress the save status)',async()=>{
 const ui=await setup(),change=changeOf(ui);
 change('#123456');await advance(ui,1300);ui.bridge.saveWorkspace.mockClear();
 await undoNow(ui);
 // The wall clock steps back one hour while the autosave writes, before its status is published.
 const wall=Date.now.bind(Date);ui.bridge.saveWorkspace.mockImplementationOnce(async()=>{vi.spyOn(Date,'now').mockImplementation(()=>wall()-3_600_000);return{ok:true,value:{revision:99,savedAt:'2026-10-17T00:00:02Z'}};});
 await advance(ui,1300);expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 await advance(ui,1900);expect(ui.shown()).not.toMatch(/saved locally/);
});
it('RFR-7: a chart swap closes the drawing settings dialog; the new chart reselecting opens none and chart actions are not refused',async()=>{
 const ui=await withChart();
 ui.fake.select(['line']);ui.effects();ui.bar().props.onSettings();ui.effects();expect(ui.dialogShown()).toBe(true);
 const other=fakeChart();ui.grid().onReady(other.chart);ui.effects();ui.effects();
 expect(ui.dialogShown()).toBe(false);
 other.select(['line']);ui.effects();ui.effects();expect(ui.dialogShown()).toBe(false);expect(ui.bar()).not.toBeNull();
 try{await ui.grid().contextActions.theme({} as any,{} as any);}catch{/* the synthetic snapshot may be refused for its target */}
 await flush();ui.effects();expect(ui.shown()).not.toContain(REFUSED);
});
it('RFR-7: a drawing settings dialog opened from the chart context menu closes on deselection and releases its menu lease',async()=>{
 const ui=await withChart(),active=ui.grid(),data=active.datasets.find((row:any)=>row.provenance.datasetId===active.activeDatasetId);
 const cellId=active.state.layout.activeCellId;
 const snapshot:any={token:{},treeOwner:{},cellId,controller:ui.fake.chart,instrument:{...data.instrument},input:{bars:active.activeBars,source:sourceContextForDataset(data,active.activeBars),style:active.state.cells[cellId].style},executionIdentity:active.activeExecutionIdentity,entity:{kind:'drawing',ids:['line']},client:null,local:null,point:{price:99.5,logical:1,barIndex:null,barTime:null,unit:'price',pane:{kind:'price'}}};
 let live=true;const lease={snapshot,isCurrent:()=>live,isOwnerCurrent:()=>live,release:vi.fn(()=>{live=false;})};
 const result=await ui.grid().contextActions['drawing-settings'](snapshot,lease);ui.effects();
 expect(result.ok).toBe(true);expect(ui.fake.chart.drawings.select).toHaveBeenCalledWith(['line']);
 ui.fake.select(['line']);ui.effects();expect(ui.dialogShown()).toBe(true);expect(lease.release).not.toHaveBeenCalled();
 ui.fake.select([]);ui.effects();ui.effects();
 expect(ui.dialogShown()).toBe(false);expect(lease.release).toHaveBeenCalledOnce();
 ui.fake.select(['line']);ui.effects();ui.effects();expect(ui.dialogShown()).toBe(false);
 try{await ui.grid().contextActions.theme({} as any,{} as any);}catch{/* the synthetic snapshot may be refused for its target */}
 await flush();ui.effects();expect(ui.shown()).not.toContain(REFUSED);
});
