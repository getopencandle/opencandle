import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {IndicatorDialog} from '../../src/ui/IndicatorDialog';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
// App wiring for 7a and F14. Actual App closures, autosave timer, storage mutation
// and explicit Save under controlled React hooks and an in-memory bridge (harness of tests/ui/bugfix-f-autosave-close-app.test.ts);
// the grid coordinator and chart controller are controlled synthetic ports. No DOM, focus engine, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(yes=>resolve=yes);return{resolve,promise};};
type Coordinator={suspend:ReturnType<typeof vi.fn>;gestureActive?:()=>boolean;transactionActive?:()=>boolean;flushFrameGesture?:ReturnType<typeof vi.fn>};
const port=(extra:Partial<Coordinator>={}):Coordinator=>({suspend:vi.fn((_expected:unknown,_options?:unknown)=>({isCurrent:()=>true,resume:vi.fn()})),...extra});

async function setup(coordinator:Coordinator=port()){
 let revision=4;const initial=createInitialWorkspace();
 const data=prepareWorkspaceJSON({...initial,paper:createPaperAccount({initialBalance:500}),alerts:[]});
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-16T00:00:00Z',data,storage:{directory:'Synthetic bugfix-f profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:++revision,savedAt:'2026-10-16T00:00:01Z'}})),onFlushRequest:vi.fn((_handler:()=>Promise<unknown>)=>vi.fn())};
 const win={lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()};vi.stubGlobal('window',win);
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady(coordinator);render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports are irrelevant here */}
 const effects=()=>{render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 const alerts=()=>find(render(),node=>node.type===WorkspaceAlerts).props;
 const main=()=>find(render(),node=>node.type==='main').props;
 const button=(name:string)=>{const found=find(render(),node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name));if(!found)throw Error('Missing control '+name);return found;};
 const edited=(background:string)=>{const next=structuredClone(grid().state);next.cells[next.layout.activeCellId].appearance.background=background;return next;};
 const change=(background:string)=>{expect(grid().onChange(edited(background))).toBe(true);render();};
 const shown=()=>text(render());
 const payload=(call:number)=>bridge.saveWorkspace.mock.calls[call][0].data;
 const listener=(type:string)=>win.addEventListener.mock.calls.filter((call:any[])=>call[0]===type).at(-1)?.[1] as ((event?:unknown)=>void)|undefined;
 const closeHandler=()=>bridge.onFlushRequest.mock.calls.at(-1)?.[0] as (()=>Promise<unknown>);
 // Settle the first post-load autosave so the next save is the one under test.
 effects();await vi.advanceTimersByTimeAsync(1300);await flush();effects();bridge.saveWorkspace.mockClear();coordinator.suspend.mockClear();
 return{bridge,render,grid,alerts,main,button,edited,change,effects,coordinator,shown,payload,listener,closeHandler};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
/** SYNTHETIC chart controller: only what App reads to show the chart toolbar and the Indicators dialog. */
function nativeChart(rows:any[]=[]){return {drawings:{getTool:()=>null,getMode:()=>null},setTool:vi.fn(),setDrawingMode:vi.fn(),onToolChanged:()=>()=>{},onDrawingModeChanged:()=>()=>{},isInputOwned:()=>true,isInputCurrent:()=>true,indicators:{list:()=>rows,subscribe:vi.fn(()=>()=>{}),update:vi.fn(),remove:vi.fn(),serialize:()=>[]}};}
const BUSY='The active chart changed or is busy.';

it('BFF-R1: the alert panel reads the storage lock itself, ahead of the backgroundSave render',async()=>{
 const ui=await setup(),pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 ui.change('#13579b');ui.effects();
 // Props of the last render before the autosave timer fires: App takes the lock synchronously, the render comes later.
 const before=ui.alerts();expect(before.backgroundSave).toBe(false);
 expect(typeof before.isStorageLocked,'WorkspaceAlerts receives a lock reader').toBe('function');
 expect(before.isStorageLocked()).toBe(false);
 await vi.advanceTimersByTimeAsync(1300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 expect(before.backgroundSave,'the stale render still says no write').toBe(false);
 expect(before.isStorageLocked(),'the lock reader sees the write at once').toBe(true);
 pending.resolve({ok:true,value:{revision:6,savedAt:'2026-10-16T00:00:02Z'}});await flush();
 expect(before.isStorageLocked()).toBe(false);
});

it('F14: the Indicators dialog gets the storage write: background for the routine autosave, blocking for an explicit Save, and waiters run after the write',async()=>{
 const ui=await setup();
 ui.grid().onReady(nativeChart());ui.render();
 ui.button('Indicators').props.onClick();
 const dialog=()=>{const found=ui.render() as any;const node=(function find(value:any):any{if(Array.isArray(value)){for(const child of value){const hit=find(child);if(hit)return hit;}return null;}if(!value?.props)return null;if(value.type===IndicatorDialog)return value;return find(value.props.children);})(found);if(!node)throw Error('Missing IndicatorDialog');return node.props;};
 const write=dialog().storageWrite;
 expect(write,'IndicatorDialog receives the storage write').toBeTruthy();
 expect(write.state()).toBe('idle');expect(()=>dialog().assertEditable()).not.toThrow();
 // The routine autosave.
 const pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 ui.change('#2468ac');ui.effects();await vi.advanceTimersByTimeAsync(1300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 expect(write.state()).toBe('background');
 // Indicator input stays editable during the routine write (App used to refuse it here).
 expect(()=>dialog().assertEditable()).not.toThrow();
 const ran=vi.fn(()=>write.state());write.afterWrite(ran);
 const cancelled=vi.fn();write.afterWrite(cancelled)();
 await flush();expect(ran).not.toHaveBeenCalled();
 pending.resolve({ok:true,value:{revision:6,savedAt:'2026-10-16T00:00:02Z'}});await flush();
 expect(ran,'the waiter runs once the write ends, with the lock released').toHaveBeenCalledOnce();expect(ran).toHaveLastReturnedWith('idle');
 expect(cancelled).not.toHaveBeenCalled();
 // An explicit Save blocks.
 ui.effects();const explicit=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(explicit.promise);
 ui.change('#abcdef');ui.button('Save').props.onClick();await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);
 expect(write.state()).toBe('blocking');
 expect(()=>dialog().assertEditable(),'blocking operations still refuse').toThrow(BUSY);
 explicit.resolve({ok:true,value:{revision:7,savedAt:'2026-10-16T00:00:03Z'}});await flush();
 expect(write.state()).toBe('idle');
});

it('F14: a legend Hide during the routine autosave is announced and applied once the write ends',async()=>{
 const ui=await setup(),row={id:'synthetic-sma',kind:'sma',inputs:{length:9,source:'close'},visible:true,offset:0,plots:{},rendererId:'synthetic-sma',paneId:'price',diagnostics:[],presentationDiagnostics:[],policies:[],series:[],informationBars:3,latestInformationTime:null};
 const chart=nativeChart([row]);ui.grid().onReady(chart);ui.effects();
 const hide=()=>{const found=(function find(value:any):any{if(Array.isArray(value)){for(const child of value){const hit=find(child);if(hit)return hit;}return null;}if(!value?.props)return null;if(value.type==='button'&&String(value.props['aria-label']??'').startsWith('Hide '))return value;return find(value.props.children);})(ui.render());if(!found)throw Error('Missing legend Hide');return found;};
 hide();
 const pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 ui.change('#0a0b0c');ui.effects();await vi.advanceTimersByTimeAsync(1300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 hide().props.onClick();
 expect(chart.indicators.update,'nothing applied inside the write').not.toHaveBeenCalled();
 expect(ui.shown()).toContain('The workspace is saving. The indicator change applies when the save finishes.');
 expect(ui.shown()).not.toContain(BUSY);
 pending.resolve({ok:true,value:{revision:6,savedAt:'2026-10-16T00:00:02Z'}});await flush();
 expect(chart.indicators.update).toHaveBeenCalledExactlyOnceWith('synthetic-sma',{visible:false});
 expect(ui.shown()).not.toContain('The workspace is saving.');
});
