import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceRestoreDialog} from '../../src/ui/WorkspaceRestoreDialog';
import {ChartSettingsDialog} from '../../src/ui/chart-settings-dialog';
import {WorkspaceChartHost as MultiChartGrid} from '../../src/ui/WorkspaceChartHost';
import {DrawingToolbar} from '../../src/ui/DrawingToolbar';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {PaperPanel} from '../../src/ui/PaperPanel';
import {PaperTradingDock} from '../../src/ui/PaperTradingDock';
// The Paper trading button opens only the bottom Trading panel; the floating dialog is reached from the panel (Open floating).
const openPaperDialog=(ui:{button:(label:string)=>any;render:()=>any})=>{ui.button('Paper trading').props.onClick();find(ui.render(),(node:any)=>node.type===PaperTradingDock).props.onOpenTicket(null);};
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {patchWorkspace} from '../../src/ui/workspace-grid';
import {transitionDrawingScope} from '../../src/ui/drawing-scopes';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {createPaperAccount} from '../../src/domain/paper';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{saveInput}=require('../../electron/validation.cjs');
// Exercise actual App closures with controlled hook state. No DOM, native input,
// IPC transport, paint, effect scheduling or packaged interface is certified.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(yes=>resolve=yes);return{resolve,promise};};
const exportText=()=>JSON.stringify({schemaVersion:1,data:prepareWorkspaceJSON({...patchWorkspace(createInitialWorkspace(),{symbol:'SPY',sourceId:null}),paper:createPaperAccount({initialBalance:54321}),alerts:[]})});
// Required drawing observation surface of the real controller. Callbacks stay
// retained after replacement so App ownership must refuse them before cleanup.
const drawingContract=(listeners:Record<string,()=>void>)=>({drawings:{getTool:vi.fn(()=>null),getMode:vi.fn(()=>null)},onToolChanged:(fn:(type:string|null)=>void)=>{listeners.tool=()=>fn('retired-tool');return()=>{};},onDrawingModeChanged:(fn:(mode:'measure'|'eraser'|null)=>void)=>{listeners.mode=()=>fn('measure');return()=>{};}});
async function setup(){
 let revision=2;
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:null,data:null,storage:{directory:'Synthetic profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async(input:any)=>{saveInput(input);return{ok:true,value:{revision:++revision,savedAt:'2026-10-14T13:00:00.000Z'}};}),resetWorkspace:vi.fn(),executeScript:vi.fn(),importData:vi.fn(),exportWorkspace:vi.fn()};
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const render=()=>{hooks.cursor=0;return App();};
 render();const boot=hooks.effects[0];hooks.effects=[];boot();await flush();
 const button=(name:string)=>find(render(),node=>node.type==='button'&&text(node)===name);
 button('Local storage').props.onClick();find(render(),node=>node.type===ChartSettingsDialog).props.dataSources.props.storage.onRestore();
 const dialog=()=>find(render(),node=>node.type===WorkspaceRestoreDialog).props;
 const grid=()=>find(render(),node=>node.type===MultiChartGrid);
 return{bridge,render,button,dialog,grid};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>vi.unstubAllGlobals());

it('actual App preview does not save or execute scripts, then installs only after successful persistence',async()=>{
 const ui=await setup(),old=ui.grid(),pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 const review=ui.dialog().onPreview(exportText());expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();const applying=review.apply();expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(ui.grid().props.state.layout.cells[0].symbol).toBe('GME');
 const saved=ui.bridge.saveWorkspace.mock.calls[0][0];expect(saved.expectedRevision).toBe(2);expect(saved.data.paper.cash).toBe(54321);expect(()=>saveInput(saved)).not.toThrow();
 pending.resolve({ok:true,value:{revision:3,savedAt:'2026-10-14T13:00:00.000Z'}});await applying;
 // Old native callbacks fire before React cleanup and must already be retired.
 old.props.onChange(old.props.state);expect(ui.grid().props.state.layout.cells[0].symbol).toBe('SPY');expect(ui.grid().key).not.toBe(old.key);expect(ui.bridge.executeScript).not.toHaveBeenCalled();await expect(review.apply()).rejects.toThrow('already committed');
});
it('CAS/write rejection preserves workspace and allows a deliberate retry without clearing old ownership',async()=>{
 const ui=await setup(),old=ui.grid(),review=ui.dialog().onPreview(exportText());ui.bridge.saveWorkspace.mockResolvedValueOnce({ok:false,error:{code:'CONFLICT',message:'Synthetic revision conflict'}} as any);
 await expect(review.apply()).rejects.toThrow('revision conflict');expect(ui.grid().key).toBe(old.key);expect(ui.grid().props.state).toBe(old.props.state);expect(()=>review.assertCurrent()).not.toThrow();await review.apply();expect(ui.grid().props.state.layout.cells[0].symbol).toBe('SPY');
});
it('simultaneous confirmations use a synchronous guard and dispatch only one native save',async()=>{
 const ui=await setup(),pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);const review=ui.dialog().onPreview(exportText()),first=review.apply();await expect(review.apply()).rejects.toThrow('finishing');expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();pending.resolve({ok:true,value:{revision:3,savedAt:'2026-10-14T13:00:00.000Z'}});await first;
});
it('changed workspace, saved revision or alert collection invalidates an existing preview',async()=>{
 const ui=await setup(),review=ui.dialog().onPreview(exportText());const alerts=find(ui.render(),node=>node.type===WorkspaceAlerts);alerts.props.onAlertsChange([]);ui.render();expect(()=>review.assertCurrent()).toThrow('changed after preview');expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
 const savedReview=ui.dialog().onPreview(exportText()),opening=ui.grid().props,resume=vi.fn();
 // Local Save now requires the exact mounted chart suspension seam. This is
 // controlled source evidence, not a native renderer or executable test.
 opening.onTransactionReady({suspend:(input:any)=>{expect(input.state).toBe(opening.state);expect(input.datasets).toBe(opening.datasets);expect(input.activeBars).toBe(opening.activeBars);return{isCurrent:()=>true,resume};}});
 ui.button('Save').props.onClick();await flush();expect(resume).toHaveBeenCalledOnce();expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(()=>savedReview.assertCurrent()).toThrow('changed after preview');
});
it('storage mutation pauses alert observation and rejects old financial callbacks while awaiting disk',async()=>{
 const ui=await setup(),pending=deferred(),oldAlerts=find(ui.render(),node=>node.type===WorkspaceAlerts);ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);const review=ui.dialog().onPreview(exportText()),applying=review.apply();expect(oldAlerts.props.onAlertsChange([{invalid:'must not publish'}])).toBe(false);const held=find(ui.render(),node=>node.type===WorkspaceAlerts).props;expect(held.enabled).toBe(true);expect(held.suspended).toBe(true);expect(held.alerts).toEqual([]);pending.resolve({ok:true,value:{revision:3,savedAt:'2026-10-14T13:00:00.000Z'}});await applying;expect(oldAlerts.props.onAlertsChange([{invalid:'retired'}])).toBe(false);const restored=find(ui.render(),node=>node.type===WorkspaceAlerts).props;expect(restored.alerts).toEqual([]);expect(restored.enabled).toBe(true);expect(restored.suspended).toBe(false);
});
it('malformed restore never reaches disk and cancelled native choice returns no replacement',async()=>{
 const ui=await setup();expect(()=>ui.dialog().onPreview('{"schemaVersion":2,"data":{}}')).toThrow();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();ui.bridge.importData.mockResolvedValue({ok:false,error:{code:'CANCELLED',message:'Import cancelled'}});expect(await ui.dialog().onChoose()).toBeNull();expect(ui.bridge.importData).toHaveBeenCalledWith({kind:'workspace'});
});
it('retired direct native subscriptions and a queued animation frame cannot read the old chart after commit',async()=>{
 const ui=await setup(),listeners:Record<string,()=>void>={},frames:Array<()=>void>=[];vi.stubGlobal('requestAnimationFrame',(fn:()=>void)=>{frames.push(fn);return frames.length;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
 const fake={...drawingContract(listeners),drawingManager:{list:vi.fn(()=>[])},onDrawingsChanged:(fn:()=>void)=>{listeners.draw=fn;return()=>{};},onDrawingSelection:(fn:(ids:string[])=>void)=>{listeners.selection=()=>fn(['retired-selection']);return()=>{};},indicators:{list:vi.fn(()=>[]),subscribe:(fn:()=>void)=>{listeners.indicators=fn;return()=>{};}},onCrosshair:(fn:()=>void)=>{listeners.crosshair=fn;return()=>{};},getDataWindow:vi.fn(()=>null)};
 hooks.effects=[];ui.grid().props.onReady(fake);ui.render();hooks.effects.splice(0).forEach(fn=>fn());ui.render();expect(frames.length).toBeGreaterThan(0);expect(fake.drawings.getTool).toHaveBeenCalledOnce();expect(fake.drawings.getMode).toHaveBeenCalledOnce();expect(Object.keys(listeners)).toEqual(expect.arrayContaining(['tool','mode']));
 const oldReads={draw:fake.drawingManager.list.mock.calls.length,indicators:fake.indicators.list.mock.calls.length};const review=ui.dialog().onPreview(exportText());await review.apply();Object.values(listeners).forEach(fn=>fn());frames.forEach(fn=>fn());
 expect(fake.drawingManager.list).toHaveBeenCalledTimes(oldReads.draw);expect(fake.indicators.list).toHaveBeenCalledTimes(oldReads.indicators);expect(fake.getDataWindow).not.toHaveBeenCalled();expect(hooks.cells).not.toContain('retired-selection');expect(ui.grid().props.state.layout.cells[0].symbol).toBe('SPY');
 const toolbar=find(ui.render(),node=>node.type===DrawingToolbar);expect(toolbar.props.activeTool).toBeNull();expect(toolbar.props.activeMode).toBeNull();
});
it('actual App financial publication rejects stale pre-render bases and preserves a rejected account',async()=>{
 const ui=await setup();openPaperDialog(ui);const panel=()=>find(ui.render(),node=>node.type===PaperPanel).props,first=panel(),original=first.account;
 const accepted=createPaperAccount({initialBalance:43210}),stale=createPaperAccount({initialBalance:98765});
 expect(first.onAccountChange(accepted,original)).toBe(true);
 // No render occurs before this competing callback: the synchronous owner must win.
 expect(first.onAccountChange(stale,original)).toBe(false);expect(panel().account).toBe(accepted);
 const excessive={...accepted,name:'x'.repeat(20*1024*1024)};expect(panel().onAccountChange(excessive,accepted)).toBe(false);expect(panel().account).toBe(accepted);
 expect(panel().onAccountChange(createPaperAccount({mode:'replay-paper',runId:'wrong'}),accepted)).toBe(false);expect(panel().account).toBe(accepted);
});
it('financial callbacks reject pending storage replacement and retired callbacks return false',async()=>{
 const ui=await setup();openPaperDialog(ui);const previous=find(ui.render(),node=>node.type===PaperPanel).props;
 ui.button('Local storage').props.onClick();find(ui.render(),node=>node.type===ChartSettingsDialog).props.dataSources.props.storage.onRestore();
 const pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);const applying=ui.dialog().onPreview(exportText()).apply();
 expect(previous.onAccountChange(createPaperAccount({initialBalance:1}),previous.account)).toBe(false);
 pending.resolve({ok:true,value:{revision:3,savedAt:'2026-10-14T13:00:00.000Z'}});await applying;
 expect(previous.onAccountChange(createPaperAccount({initialBalance:2}),previous.account)).toBe(false);
 openPaperDialog(ui);expect(find(ui.render(),node=>node.type===PaperPanel).props.account.cash).toBe(54321);
});
it('linked-source model publication retains the exact arrays already prepared by native charts',async()=>{
 const ui=await setup(),old=ui.grid(),next=structuredClone(old.props.state),id=next.layout.activeCellId,dataset=old.props.datasets.find((row:any)=>row.instrument.symbol==='SPY');
 next.layout.cells.find((row:any)=>row.id===id).symbol='SPY';next.cells[id]=transitionDrawingScope({...next.cells[id],datasetId:dataset.provenance.datasetId},old.props.datasets.find((row:any)=>row.provenance.datasetId===old.props.state.cells[id].datasetId),dataset);
 const prepared={nextDatasets:old.props.datasets,nextActiveBars:dataset.bars,nextActiveExecutionIdentity:'ordinary',activeCellId:id,activeDatasetId:dataset.provenance.datasetId,activeResolution:dataset.resolution};
 expect(old.props.onChange(next,prepared)).toBe(true);expect(ui.grid().props.activeBars).toBe(dataset.bars);expect(ui.grid().props.datasets).toBe(old.props.datasets);
 expect(ui.grid().props.activeDatasetId).toBe(dataset.provenance.datasetId);
});
it('a stale prepared universe or equal-valued unowned bars cannot change the App model',async()=>{
 const ui=await setup(),old=ui.grid(),next=structuredClone(old.props.state),id=next.layout.activeCellId,dataset=old.props.datasets.find((row:any)=>row.instrument.symbol==='SPY');
 next.layout.cells.find((row:any)=>row.id===id).symbol='SPY';next.cells[id]=transitionDrawingScope({...next.cells[id],datasetId:dataset.provenance.datasetId},old.props.datasets.find((row:any)=>row.provenance.datasetId===old.props.state.cells[id].datasetId),dataset);
 const prepared={nextDatasets:old.props.datasets,nextActiveBars:dataset.bars,nextActiveExecutionIdentity:'ordinary',activeCellId:id,activeDatasetId:dataset.provenance.datasetId,activeResolution:dataset.resolution};
 expect(old.props.onChange(next,{...prepared,nextDatasets:[...prepared.nextDatasets]})).toBe(false);
 expect(old.props.onChange(next,{...prepared,nextActiveBars:[...prepared.nextActiveBars]})).toBe(false);expect(ui.grid().props.state).toBe(old.props.state);
});
it('same-grid controller replacement retires old direct observations before React cleanup',async()=>{
 const ui=await setup(),listeners:Record<string,()=>void>={},frames:Array<()=>void>=[];vi.stubGlobal('requestAnimationFrame',(fn:()=>void)=>{frames.push(fn);return frames.length;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
 const previous={...drawingContract(listeners),drawingManager:{list:vi.fn(()=>[])},onDrawingsChanged:(fn:()=>void)=>{listeners.draw=fn;return()=>{};},onDrawingSelection:(fn:(ids:string[])=>void)=>{listeners.select=()=>fn(['retired-selection']);return()=>{};},indicators:{list:vi.fn(()=>[]),subscribe:(fn:()=>void)=>{listeners.indicators=fn;return()=>{};}},onCrosshair:(fn:()=>void)=>{listeners.crosshair=fn;return()=>{};},getDataWindow:vi.fn(()=>null)};
 hooks.effects=[];const opening=ui.grid();opening.props.onReady(previous);ui.render();hooks.effects.splice(0).forEach(fn=>fn());ui.render();expect(previous.drawings.getTool).toHaveBeenCalledOnce();expect(previous.drawings.getMode).toHaveBeenCalledOnce();expect(Object.keys(listeners)).toEqual(expect.arrayContaining(['tool','mode']));const counts=[previous.drawingManager.list.mock.calls.length,previous.indicators.list.mock.calls.length];
 opening.props.onReady({...drawingContract({}),synthetic:'replacement'});Object.values(listeners).forEach(fn=>fn());frames.forEach(fn=>fn());
 expect(previous.drawingManager.list).toHaveBeenCalledTimes(counts[0]);expect(previous.indicators.list).toHaveBeenCalledTimes(counts[1]);expect(previous.getDataWindow).not.toHaveBeenCalled();expect(hooks.cells).not.toContain('retired-selection');expect(ui.grid().key).toBe(opening.key);
 const toolbar=find(ui.render(),node=>node.type===DrawingToolbar);expect(toolbar.props.activeTool).toBeNull();expect(toolbar.props.activeMode).toBeNull();
});
