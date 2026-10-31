import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {StorageDialog} from '../../src/ui/StorageDialog';
import {LocalStorageSection} from '../../src/ui/LocalStorageSection';
import {ChartSettingsDialog} from '../../src/ui/chart-settings-dialog';
import {WorkspaceRestoreDialog} from '../../src/ui/WorkspaceRestoreDialog';
import {WorkspaceChartHost as MultiChartGrid} from '../../src/ui/WorkspaceChartHost';
import {DrawingToolbar} from '../../src/ui/DrawingToolbar';
import {prepareWorkspaceData} from '../../src/ui/workspace-transfer';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{exportInput}=require('../../electron/validation.cjs');
// Actual App/StorageDialog closures with controlled hooks/effects; no DOM,
// native IPC, real filesystem recovery, focus or executable launch evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const memo=(fn:()=>any,deps:any[])=>{const at=hooks.cursor++,old=hooks.cells[at];if(!old||deps.some((value,i)=>!Object.is(value,old.deps[i])))hooks.cells[at]={deps,value:fn()};return hooks.cells[at].value;};return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]=typeof initial==='function'?initial():initial;return[hooks.cells[at],(value:any)=>{hooks.cells[at]=typeof value==='function'?value(hooks.cells[at]):value;}];},useRef:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]={current:initial};return hooks.cells[at];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const at=hooks.cursor++,old=hooks.cells[at];if(!old||deps.some((value,i)=>!Object.is(value,old[i]))){hooks.cells[at]=deps;hooks.effects.push(fn);}}};});
function find(tree:any,match:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const child of tree){const result=find(child,match);if(result)return result;}}else if(tree?.props){if(match(tree))return tree;return find(tree.props.children,match);}return null;}
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
const deferred=()=>{let resolve!:(value:any)=>void,reject!:(error:Error)=>void;const promise=new Promise<any>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const good=()=>prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount({initialBalance:321}),alerts:[]});
const saved=(data:unknown,revision=7)=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-14T14:00:00Z',data,storage:{directory:'Synthetic independent recovery profile',backend:'json-atomic'}}});
function setup(promise:Promise<any>){const bridge={loadWorkspace:vi.fn(()=>promise),saveWorkspace:vi.fn(async(input:any)=>({ok:true,value:{revision:input.expectedRevision+1,savedAt:'2026-10-14T14:00:01Z'}})),resetWorkspace:vi.fn(async(revision:number)=>({ok:true,value:{revision:revision+1,savedAt:'2026-10-14T14:00:01Z'}})),exportWorkspace:vi.fn(async(input:any)=>{exportInput(input);return{ok:true,value:{}};}),executeScript:vi.fn()};vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});const render=()=>{hooks.cursor=0;return App();};render();const boot=hooks.effects[0];hooks.effects=[];const unmount=boot() as ()=>void;const button=(label:string)=>{const row=find(render(),node=>node.type==='button'&&text(node)===label);if(!row)throw Error('Synthetic App control missing:'+label);return row;},storage=()=>{button('Local storage').props.onClick();const recovery=find(render(),node=>node.type===StorageDialog);return recovery?recovery.props:find(render(),node=>node.type===ChartSettingsDialog).props.dataSources.props.storage;},restore=()=>{storage().onRestore();return find(render(),node=>node.type===WorkspaceRestoreDialog).props;};return{bridge,render,button,storage,restore,unmount,grid:()=>find(render(),node=>node.type===MultiChartGrid)};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>vi.unstubAllGlobals());

it.each(['truncated','missing-source','paper-null','alerts-null','drawing-null'])('startup %s cannot silently become synthetic/default recovered state',async kind=>{
 const raw:any=good();if(kind==='truncated'){for(const key of Object.keys(raw))if(key!=='version')delete raw[key];}else if(kind==='missing-source')delete raw.sourceId;else if(kind==='paper-null')raw.paper=null;else if(kind==='alerts-null')raw.alerts=null;else raw.drawingPreferences=null;
 expect(()=>prepareWorkspaceData(raw)).toThrow();const before=JSON.stringify(raw),ui=setup(Promise.resolve(saved(raw)));await flush();expect(ui.grid()).toBeNull();expect(ui.storage().startup.phase).toBe('recoverable');await ui.storage().onExport();expect(ui.bridge.exportWorkspace).toHaveBeenCalledWith({schemaVersion:1,data:raw});expect(JSON.stringify(raw)).toBe(before);expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();expect(ui.bridge.executeScript).not.toHaveBeenCalled();
});
it('retained reset confirmation cannot reset a newer recovery owner even at the same saved revision',async()=>{
 const a={...good(),version:999},b={...good(),paper:null},ui=setup(Promise.resolve(saved(a,7)));await flush();const old=ui.storage().onReset;ui.bridge.loadWorkspace.mockResolvedValueOnce(saved(b,7));ui.button('Retry loading').props.onClick();await flush();await expect(old()).rejects.toThrow('changed after reset');expect(ui.bridge.resetWorkspace).not.toHaveBeenCalled();expect(ui.storage().startup.data).toBe(b);await ui.storage().onReset();expect(ui.bridge.resetWorkspace).toHaveBeenCalledWith(7);expect(ui.grid()).not.toBeNull();
});
it('loading Retry cannot enqueue a second read or retire the initial response',async()=>{
 const pending=deferred(),ui=setup(pending.promise);ui.storage().onRetry();expect(ui.bridge.loadWorkspace).toHaveBeenCalledOnce();expect(ui.grid()).toBeNull();pending.resolve(saved(good(),9));await flush();expect(ui.grid()).not.toBeNull();expect(ui.storage().startup.phase).toBe('ready');expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
});
it('enabled recovery Retry retires its owner immediately and old callbacks cannot enqueue reads or erase the accepted workspace',async()=>{
 const ui=setup(Promise.resolve(saved({...good(),version:999},7)));await flush();const retry=ui.storage().onRetry,latest=deferred();ui.bridge.loadWorkspace.mockReturnValueOnce(latest.promise);retry();retry();expect(ui.bridge.loadWorkspace).toHaveBeenCalledTimes(2);expect(ui.storage().startup.phase).toBe('loading');latest.resolve(saved(good(),9));await flush();const grid=ui.grid();expect(grid).not.toBeNull();retry();await flush();expect(ui.bridge.loadWorkspace).toHaveBeenCalledTimes(2);expect(ui.grid().key).toBe(grid.key);expect(ui.storage().startup.phase).toBe('ready');expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
});
it('unknown envelope failure cannot offer a retained payload or guessed revision even after an earlier valid recovery owner',async()=>{
 const ui=setup(Promise.resolve(saved({...good(),version:999},7)));await flush();ui.bridge.loadWorkspace.mockResolvedValueOnce({ok:false,error:{code:'STORAGE_INVALID',message:'Synthetic unreadable envelope'}});ui.button('Retry loading').props.onClick();await flush();const storage=ui.storage();expect(storage.startup.phase).toBe('unavailable');await expect(storage.onReset()).rejects.toThrow('unavailable');expect(await storage.onExport()).toContain('unavailable');expect(()=>ui.restore().onPreview(JSON.stringify({schemaVersion:1,data:good()}))).toThrow('unavailable');expect(ui.bridge.resetWorkspace).not.toHaveBeenCalled();expect(ui.bridge.exportWorkspace).not.toHaveBeenCalled();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
});
it('an unmounted load rejection cannot publish errors into a retired startup owner',async()=>{
 const pending=deferred(),ui=setup(pending.promise);ui.unmount();pending.reject(new Error('Synthetic after-unmount read failure'));await flush();expect(text(ui.render())).not.toContain('after-unmount read failure');expect(ui.grid()).toBeNull();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
});
it('shared startup preflight rejects hidden accessors and malformed optional fields without invoking behavior',()=>{
 let calls=0;const raw=good();Object.defineProperty(raw,'paper',{enumerable:true,get(){calls++;return createPaperAccount();}});expect(()=>prepareWorkspaceData(raw)).toThrow('accessors');expect(calls).toBe(0);
 const bad=good();bad.indicatorLibrary=null;expect(()=>prepareWorkspaceData(bad)).toThrow();
});
it('Saved work section pins the original reset callback across same-owner rerender and Retry invalidates retained confirm handler',async()=>{
 const startup={phase:'recoverable' as const,error:'Synthetic domain failure',data:{version:999}},old=vi.fn(async()=>{}),newer=vi.fn(async()=>{}),props={directory:'Synthetic profile',startup,onReset:old,onExport:vi.fn(async()=>{}),onRetry:vi.fn(),onResetDone:vi.fn()},render=()=>{hooks.cursor=0;return LocalStorageSection(props);},button=(label:string)=>find(render(),node=>node.type==='button'&&text(node)===label);
 render();hooks.effects.splice(0).forEach(effect=>effect());button('Reset…').props.onClick();props.onReset=newer;button('Reset now').props.onClick();await flush();expect(old).toHaveBeenCalledOnce();expect(newer).not.toHaveBeenCalled();
 button('Reset…').props.onClick();const retained=button('Reset now').props.onClick;button('Try again').props.onClick();retained();await flush();expect(newer).not.toHaveBeenCalled();expect(props.onRetry).toHaveBeenCalledOnce();
});
it('a same-generation controller swap retires old native listeners and queued crosshair reads before React cleanup',async()=>{
 vi.useFakeTimers();const cleanups:Array<()=>void>=[];try{const ui=setup(Promise.resolve(saved(good())));await flush();const callbacks:Record<string,()=>void>={},frames:Array<()=>void>=[];vi.stubGlobal('requestAnimationFrame',(fn:()=>void)=>{frames.push(fn);return frames.length;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
  // The real controller exposes current drawing state and both subscriptions.
  // Retain callbacks after swap so App ownership, rather than cleanup, must refuse them.
  const drawingContract=(retained:Record<string,()=>void>)=>({drawings:{getTool:vi.fn(()=>null),getMode:vi.fn(()=>null)},onToolChanged:(fn:(type:string|null)=>void)=>{retained.tool=()=>fn('Synthetic retired tool');return()=>{};},onDrawingModeChanged:(fn:(mode:'measure'|'eraser'|null)=>void)=>{retained.mode=()=>fn('measure');return()=>{};}});
  const old={...drawingContract(callbacks),drawingManager:{list:vi.fn(()=>[])},onDrawingsChanged:(fn:()=>void)=>{callbacks.drawings=fn;return()=>{};},onDrawingSelection:(fn:(ids:string[])=>void)=>{callbacks.selection=()=>fn(['Synthetic retired selection']);return()=>{};},indicators:{list:vi.fn(()=>[]),subscribe:(fn:()=>void)=>{callbacks.indicators=fn;return()=>{};}},onCrosshair:(fn:()=>void)=>{callbacks.crosshair=fn;return()=>{};},getDataWindow:vi.fn(()=>null)};
  hooks.effects=[];ui.grid().props.onReady(old);ui.render();for(const effect of hooks.effects.splice(0)){const cleanup=effect();if(typeof cleanup==='function')cleanups.push(cleanup as ()=>void);}expect(frames.length).toBeGreaterThan(0);expect(old.drawings.getTool).toHaveBeenCalledOnce();expect(old.drawings.getMode).toHaveBeenCalledOnce();expect(Object.keys(callbacks)).toEqual(expect.arrayContaining(['tool','mode']));const reads={drawings:old.drawingManager.list.mock.calls.length,indicators:old.indicators.list.mock.calls.length},key=ui.grid().key;
  ui.grid().props.onReady({...drawingContract({}),synthetic:'accepted replacement controller'});ui.render();expect(ui.grid().key).toBe(key);Object.values(callbacks).forEach(fn=>fn());frames.forEach(fn=>fn());expect(old.drawingManager.list).toHaveBeenCalledTimes(reads.drawings);expect(old.indicators.list).toHaveBeenCalledTimes(reads.indicators);expect(old.getDataWindow).not.toHaveBeenCalled();expect(hooks.cells).not.toContain('Synthetic retired selection');
  const toolbar=find(ui.render(),node=>node.type===DrawingToolbar);expect(toolbar.props.activeTool).toBeNull();expect(toolbar.props.activeMode).toBeNull();
 }finally{for(const cleanup of cleanups)cleanup();vi.clearAllTimers();vi.useRealTimers();}
});
