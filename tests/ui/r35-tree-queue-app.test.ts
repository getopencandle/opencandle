import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {ObjectTreePanel} from '../../src/ui/ObjectTreePanel';
import {ObjectTreeDataWindowWidget} from '../../src/ui/ObjectTreePanelWidget';
import {DrawingDialog} from '../../src/ui/DrawingDialog';
import {DrawingEditBar} from '../../src/ui/drawing-edit-bar';
import {DrawingUtilityBlock} from '../../src/ui/DrawingUtilityBlock';
import {MultiSelectionBar} from '../../src/ui/multi-selection-bar';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {objectTreeHarness,event} from './object-tree-panel-harness';

// (fail-first): a drawing edit that lands while the routine background autosave writes was lost. The save holds
// the chart for its write (App.tsx persistLayoutCandidate -> owner.suspend -> adapter.ts suspendTree), and while it is held
// the chart refuses the owner-checked routes (adapter.ts captureDrawingManagerOwner, the duplicate/copy/paste and template
// assertMutable checks: "Drawing manager chart input changed", "... is unavailable while the chart is busy or unavailable")
// and drops the publication of a plain drawing-manager edit (adapter.ts holdAnalysisNotifications: release(publish=false)
// clears drawingDirty), so the workspace never records it. r30b flows: object-tree 39/43, "group rename refused".
// Actual App closures (autosave timer, storage mutation, held-input queue, the real ObjectTreePanel, DrawingDialog and
// MultiSelectionBar handlers) over the actual drawing-manager port and native Vela drawing controller
// (object-tree-panel-harness.ts). The chart hold is modeled on those adapter rules: the grid coordinator's suspend holds the
// chart, owner checks and the busy routes throw while held, and a publication made while held is dropped at release. The
// grid's capture of a chart publication is modeled by committing the chart's saved drawings through the host onChange
// (MultiChartGrid captureCell). SYNTHETIC values only; no DOM, focus engine, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}},useLayoutEffect:()=>{}};
});
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node)){for(const child of node)findAll(child,test,out);}else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}return out;}
const find=(node:any,test:(node:any)=>boolean):any=>findAll(node,test)[0]??null;
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(yes=>resolve=yes);return{resolve,promise};};
const WAIT='The workspace is saving. The drawing change applies when the save finishes.';
const REFUSALS=['chart input changed','unavailable while the chart is busy','A chart transaction is finishing','The chart is busy'];
let disposers:Array<()=>void>=[];
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']});});
afterEach(()=>{for(const dispose of disposers.splice(0))dispose();vi.useRealTimers();vi.unstubAllGlobals();});

async function setup(options:{group?:boolean}={}){
 const h=await objectTreeHarness({drawings:['line-a','line-b','line-c']});disposers.push(h.dispose);
 let groupId='';if(options.group)groupId=h.manager.group(['line-a','line-b'],'Group 1');
 const dataset=fixtureDataset('GME',4),bars=dataset.bars,source=sourceContextForDataset(dataset);
 // The chart hold (see the header): owner checks and busy routes throw while held; a publication made while held is dropped.
 const hold={on:false,dirty:false},subscribers=new Set<()=>void>();
 const publishChart=()=>{if(hold.on){hold.dirty=true;return;}for(const callback of [...subscribers])callback();};
 h.chart.onDrawingsChanged(publishChart);
 const ownerCheck=()=>{if(hold.on)throw Error('Drawing manager chart input changed. Close and reopen this manager.');};
 const busy=(what:string)=>{if(hold.on)throw Error(what+' is unavailable while the chart is busy or unavailable.');};
 const chart:any={...h.chart,
  captureDrawingManagerOwner:()=>{ownerCheck();return ownerCheck;},
  onDrawingsChanged:(callback:()=>void)=>{subscribers.add(callback);return()=>{subscribers.delete(callback);};},
  duplicateDrawings:vi.fn((ids:readonly string[])=>{busy('Drawing Duplicate');h.facade.duplicate([...ids]);return{accepted:true};}),
  setTool:vi.fn(),setDrawingMode:vi.fn(),onToolChanged:()=>()=>{},onDrawingModeChanged:()=>()=>{},isInputOwned:()=>true,isInputCurrent:()=>true,
  saveDrawings:()=>structuredClone(h.doc()),getSourceBars:()=>bars,getSourceContext:()=>source,previewDrawingEdit:vi.fn(),clearDrawingPreview:vi.fn(),
  getDrawingEditor:(id:string)=>{const record=h.nativeRows().find(row=>row.id===id);if(!record)throw Error('Selected drawing no longer exists');return{...drawingEditor(record,bars),recordFingerprint:JSON.stringify(record),sourceResolution:dataset.resolution};},
  updateDrawingEdit:vi.fn((id:string,patch:any,coordinates:any,offset:any)=>{busy('Drawing editing');const record=h.nativeRows().find(row=>row.id===id)!;h.facade.update(id,patchDrawingEdit(record,bars,patch,coordinates,offset) as any);publishChart();return{accepted:true};}),
 };
 const coordinator={suspend:vi.fn((_expected:unknown,_options?:unknown)=>{hold.on=true;return{isCurrent:()=>true,resume:()=>{hold.on=false;hold.dirty=false;}};})};
 let revision=4;const initial=createInitialWorkspace();
 const data=prepareWorkspaceJSON({...initial,paper:createPaperAccount({initialBalance:500}),alerts:[]});
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-23T00:00:00Z',data,storage:{directory:'Synthetic R35 profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:++revision,savedAt:'2026-10-23T00:00:01Z'}})),onFlushRequest:vi.fn((_handler:()=>Promise<unknown>)=>vi.fn())};
 const win={lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()};vi.stubGlobal('window',win);
 vi.stubGlobal('document',{querySelector:vi.fn(()=>null),getElementById:vi.fn(()=>null),addEventListener:vi.fn(),removeEventListener:vi.fn(),activeElement:null});
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 grid().onTransactionReady(coordinator);render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports are irrelevant here */}
 const effects=()=>{render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
 // The grid's capture of a chart drawing publication: the active cell's drawings become the chart's saved document.
 const published:boolean[]=[];
 subscribers.add(()=>{const state=structuredClone(grid().state);state.cells[state.layout.activeCellId].drawings=chart.saveDrawings();published.push(grid().onChange(state));});
 grid().onReady(chart);effects();
 publishChart();published.splice(0);
 const shown=()=>text(render());
 const button=(name:string)=>{const found=find(render(),node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name));if(!found)throw Error('Missing control '+name);return found;};
 const savedDrawings=()=>grid().state.cells[grid().state.layout.activeCellId].drawings;
 const settle=async()=>{effects();await vi.advanceTimersByTimeAsync(1300);await flush();effects();};
 await settle();bridge.saveWorkspace.mockClear();coordinator.suspend.mockClear();
 /** Starts the routine autosave and holds its write open; the returned function ends the write. */
 const startSave=async()=>{
  const pending=deferred();bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
  const state=structuredClone(grid().state);state.cells[state.layout.activeCellId].appearance.background='#13579b';expect(grid().onChange(state)).toBe(true);
  effects();await vi.advanceTimersByTimeAsync(1300);await flush();
  expect(bridge.saveWorkspace,'the routine autosave is writing').toHaveBeenCalledOnce();expect(hold.on,'the chart is held for the write').toBe(true);
  return async()=>{pending.resolve({ok:true,value:{revision:revision+=1,savedAt:'2026-10-23T00:00:02Z'}});await flush();effects();expect(hold.on).toBe(false);};
 };
 // The mounted Object tree page (App's own props, real ObjectTreePanel handlers). Its hooks live past App's in the store.
 const tree=()=>{if(!find(render(),node=>node.type===ObjectTreeDataWindowWidget))button('Object tree and data window').props.onClick();const widget=find(render(),node=>node.type===ObjectTreeDataWindowWidget);if(!widget)throw Error('Missing Object tree page');return widget.props.objectTree;};
 const panel=()=>{const props=tree();hooks.cursor=100000;return ObjectTreePanel(props);};
 const row=(key:string)=>{const found=find(panel(),node=>node.props?.['data-node-key']===key);if(!found)throw Error('Missing tree row '+key);return found;};
 const rowButton=(key:string,name:string)=>find(row(key),node=>node.type==='button'&&node.props['data-name']===name);
 const menuItem=(label:string)=>{const found=find(panel(),node=>node.props?.role==='menuitem'&&node.props['aria-label']===label);if(!found)throw Error('Missing menu item '+label);return found;};
 const renameInput=()=>find(panel(),node=>node.type==='input'&&node.props['aria-label']==='Rename');
 const listener=(type:string)=>win.addEventListener.mock.calls.filter((call:any[])=>call[0]===type).at(-1)?.[1] as ((event:any)=>void);
 const select=(ids:string[])=>{h.facade.select(ids);effects();};
 return{h,chart,hold,bridge,coordinator,render,grid,effects,shown,button,savedDrawings,settle,startSave,published,tree,panel,row,rowButton,menuItem,renameInput,listener,select,groupId};
}
type Ui=Awaited<ReturnType<typeof setup>>;
const native=(ui:Ui,id:string)=>ui.h.nativeRows().find(row=>row.id===id);
const savedRow=(ui:Ui,id:string)=>((ui.savedDrawings() as any).drawings as any[]).find(row=>row.id===id);
const noRefusal=(ui:Ui)=>{const shown=ui.shown();for(const refusal of REFUSALS)expect(shown,'no refusal is shown').not.toContain(refusal);};

it('Object tree: a group rename during the background autosave waits for the write, then renames the group in one step',async()=>{
 const ui=await setup({group:true}),group='group:'+ui.groupId;
 const finish=await ui.startSave();
 ui.row(group).props.onContextMenu(event());ui.menuItem('Rename').props.onClick();
 ui.renameInput().props.onChange({target:{value:'Levels'}});const input=ui.renameInput();input.props.onKeyDown(event({key:'Enter'}));input.props.onBlur();
 expect(ui.h.manager.state().groups[0].name,'nothing is applied inside the write').toBe('Group 1');
 expect(ui.shown()).toContain(WAIT);noRefusal(ui);
 await finish();
 expect(ui.h.manager.state().groups[0].name).toBe('Levels');
 expect(ui.published,'one publication: one workspace step').toEqual([true]);
 expect((ui.savedDrawings() as any).lvDrawingManager.groups[0].name).toBe('Levels');
 expect(ui.shown()).not.toContain(WAIT);noRefusal(ui);
 // The next autosave writes it.
 await ui.settle();expect(JSON.stringify(ui.bridge.saveWorkspace.mock.calls.at(-1)?.[0])).toContain('Levels');
});

it('Object tree: Lock, Remove and Rename made during the write apply in order; an edit whose drawing went meanwhile says so',async()=>{
 const ui=await setup();
 const finish=await ui.startSave();
 ui.rowButton('drawing:line-a','lock').props.onClick(event());
 ui.rowButton('drawing:line-b','remove').props.onClick(event());
 // line-b is still listed (its removal is queued); its Hide is queued behind the removal.
 ui.rowButton('drawing:line-b','hide').props.onClick(event());
 ui.row('drawing:line-c').props.onContextMenu(event());ui.menuItem('Rename').props.onClick();
 ui.renameInput().props.onChange({target:{value:'Support'}});ui.renameInput().props.onKeyDown(event({key:'Enter'}));
 expect(native(ui,'line-a')!.locked,'nothing is applied inside the write').not.toBe(true);expect(native(ui,'line-b')).toBeTruthy();
 expect(ui.shown()).toContain(WAIT);noRefusal(ui);
 await finish();
 expect(native(ui,'line-a')!.locked).toBe(true);expect(native(ui,'line-b')).toBeUndefined();
 expect((ui.h.doc().drawings as any[]).find(row=>row.id==='line-c').lvName).toBe('Support');
 expect(ui.published,'three applied edits, three steps').toEqual([true,true,true]);
 expect(ui.shown()).toContain('The drawing you changed during the save no longer exists, so that change was not applied.');
 expect(savedRow(ui,'line-a').locked).toBe(true);expect(savedRow(ui,'line-b')).toBeUndefined();expect(savedRow(ui,'line-c').lvName).toBe('Support');
});

it('Object tree then Ctrl+Z during the write: the held key runs after the queued edit and is not refused as stale',async()=>{
 const ui=await setup(),order:string[]=[];
 // Ctrl+Z goes to the chart's history route (App undo -> chart.drawings.undo); the routed workspace history is not modeled here.
 const undo=vi.spyOn(ui.h.facade,'undo').mockImplementation(function(this:any){order.push('undo');return this;});
 const finish=await ui.startSave();
 ui.rowButton('drawing:line-a','hide').props.onClick(event());
 const press={key:'z',ctrlKey:true,metaKey:false,altKey:false,shiftKey:false,isComposing:false,repeat:false,target:{tagName:'BODY',closest:()=>null},preventDefault:vi.fn(),stopImmediatePropagation:vi.fn(),stopPropagation:vi.fn()};
 ui.listener('keydown')(press);expect(press.preventDefault,'the held key is taken').toHaveBeenCalled();
 expect(undo).not.toHaveBeenCalled();
 const length=ui.published.length;ui.h.chart.onDrawingsChanged(()=>order.push('hide published'));
 await finish();
 expect(ui.published.slice(length)).toEqual([true]);
 expect(order,'the hide made first applies first, then the key').toEqual(['hide published','undo']);
 expect(ui.shown()).not.toContain('The key pressed during the save was not applied');
});

it('floating drawing toolbar: Lock during the write is applied and saved when the write ends (it was kept unpublished)',async()=>{
 const ui=await setup();ui.select(['line-a']);
 const bar=()=>{const found=find(ui.render(),node=>node.type===DrawingEditBar);if(!found)throw Error('Missing drawing toolbar');return found.props;};
 const finish=await ui.startSave();
 bar().onLock();
 expect(native(ui,'line-a')!.locked,'nothing is applied inside the write').not.toBe(true);
 expect(ui.shown()).toContain(WAIT);
 await finish();
 expect(native(ui,'line-a')!.locked).toBe(true);expect(ui.published).toEqual([true]);expect(savedRow(ui,'line-a').locked).toBe(true);
});

it('multi-selection toolbar: Delete during the write removes both drawings in one step when the write ends',async()=>{
 const ui=await setup();ui.select(['line-a','line-b']);
 const props=()=>{const found=find(ui.render(),node=>node.type===MultiSelectionBar);if(!found)throw Error('Missing selection toolbar');return found.props;};
 const finish=await ui.startSave();
 hooks.cursor=200000;const bar=MultiSelectionBar(props());
 find(bar,node=>node.type==='button'&&node.props['aria-label']==='Delete').props.onClick();
 expect(native(ui,'line-a'),'nothing is applied inside the write').toBeTruthy();
 await finish();
 expect(native(ui,'line-a')).toBeUndefined();expect(native(ui,'line-b')).toBeUndefined();
 expect(ui.published).toEqual([true]);expect(savedRow(ui,'line-a')).toBeUndefined();expect(savedRow(ui,'line-b')).toBeUndefined();
});

it('chart context menu: Hide during the write is applied and saved when the write ends',async()=>{
 const ui=await setup();
 const actions=ui.grid().contextActions;
 const finish=await ui.startSave();
 const result=await actions['drawing-hide']({controller:ui.chart,entity:{kind:'drawing',ids:['line-a']}},{release:vi.fn()});
 expect(result,'the menu row is accepted (the menu closes)').toBe(true);
 expect(native(ui,'line-a')!.visible,'nothing is applied inside the write').not.toBe(false);
 await finish();
 expect(native(ui,'line-a')!.visible).toBe(false);expect(ui.published).toEqual([true]);expect(savedRow(ui,'line-a').visible).toBe(false);
});

it('Delete key on the chart during the write: the selection is removed and saved when the write ends',async()=>{
 const ui=await setup();ui.select(['line-c']);
 const finish=await ui.startSave();
 const press={key:'Delete',ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,isComposing:false,repeat:false,target:{tagName:'BODY',closest:()=>null},preventDefault:vi.fn(),stopImmediatePropagation:vi.fn(),stopPropagation:vi.fn()};
 ui.listener('keydown')(press);
 expect(press.preventDefault,'the native delete (it would stay unpublished) is held back').toHaveBeenCalled();
 expect(native(ui,'line-c')).toBeTruthy();expect(ui.shown()).toContain(WAIT);
 await finish();
 expect(native(ui,'line-c')).toBeUndefined();expect(ui.published).toEqual([true]);expect(savedRow(ui,'line-c')).toBeUndefined();
});

it('drawing settings dialog: Apply during the write waits, then applies the draft and closes',async()=>{
 const ui=await setup();ui.select(['line-a']);
 find(ui.render(),node=>node.type===DrawingEditBar).props.onSettings();ui.effects();
 const dialogProps=()=>{const found=find(ui.render(),node=>node.type===DrawingDialog);return found?.props??null;};
 expect(dialogProps(),'the settings dialog is open').toBeTruthy();
 const dialog=()=>{hooks.cursor=300000;return DrawingDialog(dialogProps());};
 const finish=await ui.startSave();
 find(dialog(),node=>node.props?.['data-property']==='style.lineWidth').props.onChange({target:{value:'1'}});
 find(dialog(),node=>node.type==='form').props.onSubmit({preventDefault(){},nativeEvent:{isComposing:false}});
 expect(ui.chart.updateDrawingEdit,'nothing is applied inside the write').not.toHaveBeenCalled();
 expect(text(dialog())).not.toContain('unavailable while the chart is busy');
 await finish();
 expect(ui.chart.updateDrawingEdit).toHaveBeenCalledTimes(1);expect(ui.chart.updateDrawingEdit.mock.calls[0][1]).toEqual({'style.lineWidth':1});
 expect((native(ui,'line-a') as any).style.lineWidth).toBe(1);expect(ui.published).toEqual([true]);
 expect(dialogProps(),'the dialog closed after Apply').toBeNull();
});

it('drawing utility toolbar: Lock all drawings during the write is applied when the write ends',async()=>{
 const ui=await setup();
 const block=()=>find(ui.render(),node=>node.type===DrawingUtilityBlock).props;
 expect(block().utility.drawingsLocked).toBe(false);
 const finish=await ui.startSave();
 block().onToggleLock();
 expect(block().utility.drawingsLocked,'nothing is applied inside the write').toBe(false);noRefusal(ui);
 await finish();
 expect(block().utility.drawingsLocked).toBe(true);
});
