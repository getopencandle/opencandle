import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {LayoutLibraryDialog} from '../../src/ui/LayoutLibraryDialog';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {patchWorkspace,projectGrid} from '../../src/ui/workspace-grid';
import {prepareLayoutSave,duplicateSavedLayout,layoutIsDirty} from '../../src/ui/layout-library';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {aggregateInterval} from '../../src/domain/intervals';
import {fixtureDataset} from '../../src/domain/fixtures';
import {selectWorkspaceInterval} from '../../src/ui/workspace-intervals';
import {exportLayoutText} from '../../src/ui/layout-transfer';
// Actual root handlers, controlled React/native ports. No DOM, input or packaged GUI proof.
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

async function setup(){
 let state=createInitialWorkspace(),sequence=0;const cell=state.grid!.cells[state.grid!.layout.activeCellId];cell.appearance.background='#123456';cell.indicators=[{id:'sma-gme',kind:'sma',inputs:{length:9,source:'close'},offset:0,visible:true,plots:{},paneId:'price'}];cell.drawings={version:1,drawings:[{id:'line-gme',type:'trendline',paneId:'price',anchors:[{time:1000,price:12},{time:2000,price:30}],locked:true,visible:false,style:{lineColor:'#456789'}}]};state=projectGrid(state,state.grid!);state.layoutLibrary=prepareLayoutSave(state.layoutLibrary!,state.grid!,100);state.layoutLibrary.autosave=false;
 const dailySpy=patchWorkspace(state,{symbol:'SPY',sourceId:null}),spy=selectWorkspaceInterval(dailySpy,aggregateInterval(fixtureDataset('SPY',500),'1W',state.intervals.policy).dataset,state.intervals);state={...state,imports:spy.imports};const spyCell=spy.grid!.cells[spy.grid!.layout.activeCellId];spyCell.appearance={...spyCell.appearance,background:'#abcdef'};spyCell.indicators=[{...spyCell.indicators[0],id:'sma-spy',inputs:{length:17,source:'high'}}];const duplicate=duplicateSavedLayout(state.layoutLibrary!,state.grid!,spy.grid!,'SPY study',100,()=> 'saved-'+(++sequence));state.layoutLibrary=duplicate.library;
 const data=prepareWorkspaceJSON({...state,paper:createPaperAccount({initialBalance:12345}),alerts:[]});let revision=2;
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-14T19:00:00Z',data,storage:{directory:'Synthetic test profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async(input:any)=>({ok:true,value:{revision:++revision,savedAt:'2026-10-14T19:00:00Z'}})),importData:vi.fn(),exportData:vi.fn()};
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});const render=()=>{hooks.cursor=0;return App();};render();const boot=hooks.effects[0];hooks.effects=[];boot();await flush();
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props,button=(name:string)=>find(render(),node=>node.type==='button'&&(node.props['aria-label']===name||text(node)===name));
 const resume=vi.fn(),suspend=vi.fn((_expected:any)=>({isCurrent:()=>true,resume}));grid().onTransactionReady({suspend});
 const transition=vi.fn(async(request:any)=>{expect(request.assertCurrent()).toBe(true);expect(request.next.activeBars).toBe(request.next.datasets.find((dataset:any)=>dataset.provenance.datasetId===request.next.activeDatasetId).bars);request.commitModel(request.next.state,()=>{});return{committed:true,cancelled:false,errors:[] as string[]};});grid().onHostReady({transition,cancel:vi.fn()});
 const dialog=()=>{let node=find(render(),node=>node.type===LayoutLibraryDialog);if(!node){button('Open layouts').props.onClick();node=find(render(),child=>child.type===LayoutLibraryDialog);}return node.props;};
 return{render,grid,button,dialog,bridge,resume,suspend,transition,originalId:state.grid!.layout.id,spyId:duplicate.entry.id};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>vi.unstubAllGlobals());
it('opens the full saved chart through staging and retires old financial actions without replacing globals',async()=>{
 const ui=await setup(),before=ui.grid(),oldAlerts=find(ui.render(),node=>node.type===WorkspaceAlerts).props;
 await ui.dialog().onAction({kind:'open',id:ui.spyId});const after=ui.grid(),cell=after.state.cells[after.state.layout.activeCellId];expect(after.state.layout.id).toBe(ui.spyId);expect(after.state.layout.cells[0].symbol).toBe('SPY');expect(after.state.layout.cells[0].interval).toBe('1W');expect(cell.appearance.background).toBe('#abcdef');expect(cell.indicators[0].inputs).toEqual({length:17,source:'high'});expect(cell.drawingScopes.inactive[0].document.drawings[0]).toMatchObject({id:'line-gme',locked:true,visible:false});expect(ui.transition).toHaveBeenCalledOnce();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();expect(find(ui.render(),node=>node.type===WorkspaceAlerts).props.alerts).toBe(oldAlerts.alerts);expect(oldAlerts.onAlertsChange([])).toBe(false);
 await ui.dialog().onAction({kind:'open',id:ui.originalId});expect(ui.grid().state.cells[ui.grid().state.layout.activeCellId].drawings).toEqual(before.state.cells[before.state.layout.activeCellId].drawings);expect(ui.transition).toHaveBeenCalledTimes(2);
});
it('dirty Save-and-open waits for receipt, retains draft on disk failure and never stages a target',async()=>{
 const ui=await setup(),grid=structuredClone(ui.grid().state);grid.cells[grid.layout.activeCellId].appearance.background='#987654';expect(ui.grid().onChange(grid)).toBe(true);const dialog=ui.dialog();expect(layoutIsDirty(dialog.library,dialog.grid)).toBe(true);await expect(dialog.onAction({kind:'open',id:ui.spyId})).rejects.toThrow('Choose Save');
 ui.bridge.saveWorkspace.mockResolvedValueOnce({ok:false,error:{code:'IO',message:'Synthetic disk failure'}} as any);await expect(dialog.onAction({kind:'open',id:ui.spyId,decision:'save'})).rejects.toThrow('disk failure');expect(ui.transition).not.toHaveBeenCalled();expect(ui.grid().state).toBe(grid);expect(layoutIsDirty(ui.dialog().library,grid)).toBe(true);expect(ui.resume).toHaveBeenCalledOnce();
});
it('same-active Save-and-open uses the newly saved snapshot rather than the pre-save target',async()=>{
 const ui=await setup(),grid=structuredClone(ui.grid().state);grid.cells[grid.layout.activeCellId].appearance.background='#765432';ui.grid().onChange(grid);await ui.dialog().onAction({kind:'open',id:ui.originalId,decision:'save'});expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(ui.transition).toHaveBeenCalledOnce();expect(ui.grid().state.cells[grid.layout.activeCellId].appearance.background).toBe('#765432');expect(ui.dialog().library.entries.find((row:any)=>row.id===ui.originalId).grid.cells[grid.layout.activeCellId].appearance.background).toBe('#765432');
});
it('native rejection retains the original layout and cancelled parent cannot stage after save',async()=>{
 const ui=await setup(),opening=ui.grid().state;ui.transition.mockResolvedValueOnce({committed:false,cancelled:false,errors:['Synthetic stage failure']});await expect(ui.dialog().onAction({kind:'open',id:ui.spyId})).rejects.toThrow('stage failure');expect(ui.grid().state).toBe(opening);expect(text(ui.render())).toContain('Synthetic stage failure');
 const dirty=structuredClone(opening);dirty.cells[dirty.layout.activeCellId].appearance.background='#987654';ui.grid().onChange(dirty);const dialog=ui.dialog(),pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);const operation=dialog.onAction({kind:'open',id:ui.spyId,decision:'save'});dialog.onClose();pending.resolve({ok:true,value:{revision:3,savedAt:'2026-10-14T19:00:00Z'}});await expect(operation).rejects.toThrow('closed or replaced');expect(ui.transition).toHaveBeenCalledOnce();expect(ui.grid().state).toBe(dirty);
});
it('active deletion opens replacement first and preserves original when the separate deletion write fails',async()=>{
 const ui=await setup();ui.bridge.saveWorkspace.mockResolvedValueOnce({ok:false,error:{code:'IO',message:'Synthetic deletion failure'}} as any);await expect(ui.dialog().onAction({kind:'delete',id:ui.originalId,replacementId:ui.spyId})).rejects.toThrow('replacement layout is open');expect(ui.grid().state.layout.id).toBe(ui.spyId);expect(ui.dialog().library.entries.map((row:any)=>row.id)).toContain(ui.originalId);expect(ui.transition).toHaveBeenCalledOnce();
});
it('a successful disk receipt survives failed resume and the next deliberate save advances CAS',async()=>{
 const ui=await setup();ui.resume.mockImplementationOnce(()=>{throw Error('Synthetic native resume failure');});await expect(ui.dialog().onAction({kind:'rename',id:ui.originalId,name:'Receipt accepted'})).rejects.toThrow('Saved locally');expect(text(ui.render())).toContain('Saved locally, but the chart workspace needs recovery.');expect(ui.dialog().library.entries.find((row:any)=>row.id===ui.originalId).name).toBe('Receipt accepted');expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();await ui.dialog().onAction({kind:'save'});expect(ui.bridge.saveWorkspace.mock.calls[1][0].expectedRevision).toBe(3);
});
it('imports only after explicit preview confirmation and preserves virtual funds and current charts',async()=>{
 const ui=await setup(),original=ui.grid().state;ui.bridge.importData.mockResolvedValueOnce({ok:true,value:{text:exportLayoutText(createInitialWorkspace()),format:'json',kind:'layouts',fileName:'layout.json'}});
 await ui.dialog().onAction({kind:'import'});expect(ui.bridge.importData).toHaveBeenCalledWith({kind:'layouts'});expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();expect(ui.grid().state).toBe(original);expect(text(ui.render())).toContain('not a checksum');ui.button('Add saved layout').props.onClick();await flush();expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();const payload=ui.bridge.saveWorkspace.mock.calls[0][0].data;expect(payload.layoutLibrary.entries).toHaveLength(3);expect(payload.paper.cash).toBe(12345);expect(payload.alerts).toEqual([]);expect(ui.grid().state).toBe(original);expect(ui.dialog().library.entries).toHaveLength(3);
});
it('canceling the native layout picker or preview leaves the library unchanged',async()=>{
 const ui=await setup();ui.bridge.importData.mockResolvedValueOnce({ok:false,error:{code:'CANCELLED',message:'Cancelled'}});await ui.dialog().onAction({kind:'import'});expect(ui.dialog().library.entries).toHaveLength(2);expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
 ui.bridge.importData.mockResolvedValueOnce({ok:true,value:{text:exportLayoutText(createInitialWorkspace()),format:'json',kind:'layouts',fileName:'layout.json'}});await ui.dialog().onAction({kind:'import'});ui.button('Cancel').props.onClick();expect(ui.dialog().library.entries).toHaveLength(2);expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
});
it('routes Dot and Ctrl+S through keyboard handlers while excluding editing, IME, dialogs and pending holds',async()=>{
 vi.useFakeTimers();try{const ui=await setup();vi.stubGlobal('document',{querySelector:vi.fn(()=>null)});for(const effect of hooks.effects.splice(0))effect();ui.render();
  const keyboard=(window.addEventListener as any).mock.calls.filter((call:any[])=>call[0]==='keydown').at(-1)[1],event=(key:string,extra:Record<string,unknown>={})=>({key,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,isComposing:false,target:{closest:()=>null},preventDefault:vi.fn(),stopImmediatePropagation:vi.fn(),...extra});
  keyboard(event('.'));expect(find(ui.render(),node=>node.type===LayoutLibraryDialog)).not.toBeNull();find(ui.render(),node=>node.type===LayoutLibraryDialog).props.onClose();ui.render();
  keyboard(event('s',{ctrlKey:true,isComposing:true}));keyboard(event('s',{ctrlKey:true,target:{closest:()=>({})}}));(document.querySelector as any).mockReturnValueOnce({});keyboard(event('s',{ctrlKey:true}));expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
  const replay=ui.button('Replay').props.onClick,pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);keyboard(event('s',{ctrlKey:true}));expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();replay();keyboard(event('.'));expect(ui.grid().activeExecutionIdentity).toBe('ordinary');expect(find(ui.render(),node=>node.type===LayoutLibraryDialog)).toBeNull();pending.resolve({ok:true,value:{revision:3,savedAt:'2026-10-14T19:00:00Z'}});await flush();expect(ui.resume).toHaveBeenCalledOnce();
 }finally{vi.clearAllTimers();vi.useRealTimers();}
});
it('does not automatically repeat a rejected disk write for the same state, but permits explicit retry',async()=>{
 vi.useFakeTimers();try{const ui=await setup();ui.bridge.saveWorkspace.mockResolvedValueOnce({ok:false,error:{code:'CONFLICT',message:'Synthetic CAS failure'}} as any);await expect(ui.dialog().onAction({kind:'save'})).rejects.toThrow('CAS failure');ui.render();const timers=hooks.effects.filter(effect=>effect.toString().includes('1200'));expect(timers.length).toBeGreaterThan(0);for(const effect of timers)effect();await vi.advanceTimersByTimeAsync(1300);expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();await ui.dialog().onAction({kind:'save'});expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);
 }finally{vi.clearAllTimers();vi.useRealTimers();}
});
