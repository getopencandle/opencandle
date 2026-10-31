import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
// Autosave and close (BE-8 (App suspended WorkspaceAlerts during every routine
// background autosave, so the alert context was withdrawn and the contextual "Create local alert" disabled on each write)
// and BE-2 (a close arriving during a grid Source change that outlasted the 2.5 s close bound skipped the save, losing
// the edits made since the last autosave). Actual App closures, autosave timer, storage mutation and close flush under
// controlled React hooks and an in-memory bridge; the grid coordinator is a controlled port. Date is faked with the
// timers so the close bound is measured on the test clock. No DOM, focus engine, GUI or package claim.
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
const background=(ui:Awaited<ReturnType<typeof setup>>,call:number)=>ui.coordinator.suspend.mock.calls[call][1]?.background===true;
const activeBackground=(data:any)=>data.grid.cells[data.grid.layout.activeCellId].appearance.background;
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it('BE-8: a routine background autosave keeps the alert panel live (not suspended); the storage lock on alert writes is unchanged',async()=>{
 const ui=await setup(),pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 expect(ui.alerts().suspended).toBe(false);
 ui.change('#13579b');ui.effects();await vi.advanceTimersByTimeAsync(1300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(background(ui,0)).toBe(true);// the routine autosave is writing
 // Probe: WorkspaceAlerts used to get suspended={workspaceBusy||storageBusy}, so every autosave withdrew the alert
 // context and disabled the contextual "Create local alert" for the write.
 const during=ui.alerts();
 expect(during.suspended).toBe(false);
 expect(during.backgroundSave).toBe(true);// evaluation publication defers to the end of the write instead
 expect(ui.main().inert).toBeFalsy();// main stays interactive, as before
 // Guard unchanged: App still refuses any alert write while the storage mutation holds the lock.
 expect(during.onAlertsChange([],[])).toBe(false);
 expect(ui.shown()).toContain('Wait for the workspace change before changing alerts.');
 pending.resolve({ok:true,value:{revision:6,savedAt:'2026-10-16T00:00:02Z'}});await flush();ui.effects();
 expect(ui.alerts().suspended).toBe(false);expect(ui.alerts().backgroundSave).toBe(false);
});

it('BE-8: operations that make the workspace inert (an explicit Save) still suspend the alert panel',async()=>{
 const ui=await setup(),pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 ui.change('#2468ac');ui.button('Save').props.onClick();await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(background(ui,0)).toBe(false);// the blocking explicit save
 expect(ui.main().inert).toBe(true);
 expect(ui.alerts().suspended).toBe(true);expect(ui.alerts().backgroundSave).toBe(false);
 pending.resolve({ok:true,value:{revision:6,savedAt:'2026-10-16T00:00:02Z'}});await flush();ui.effects();
 expect(ui.alerts().suspended).toBe(false);expect(ui.shown()).toContain('Layout saved locally.');
});

it('BE-2: a close during a Source change that outlasts the 2.5 s bound still saves the committed workspace, without the in-flight change',async()=>{
 let sourceChange=false;const coordinator=port({transactionActive:()=>sourceChange,flushFrameGesture:vi.fn()});
 const ui=await setup(coordinator);ui.change('#0f1e2d');// edited since the last autosave
 sourceChange=true;// a long grid Source change is running (the analysis hold already guards every grid publication)
 const pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 let settled:unknown='pending';const closing=ui.closeHandler()().then(value=>{settled=value;return value;});
 await vi.advanceTimersByTimeAsync(2400);await flush();
 expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();expect(settled).toBe('pending');// still waiting inside the bound
 await vi.advanceTimersByTimeAsync(200);await flush();
 // Probe PROBE_CLOSE_DURING_LONG_SOURCE_CHANGE: closeResult=false, 0 saves; the edit above was lost on close.
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 expect(activeBackground(ui.payload(0))).toBe('#0f1e2d');// the committed workspace; the Source change never committed
 // No chart-tree hold is taken inside the Source change (that exclusion is unchanged); a frame flush, which the transaction
 // would refuse, is not attempted either.
 expect(coordinator.suspend).not.toHaveBeenCalled();expect(coordinator.flushFrameGesture).not.toHaveBeenCalled();
 // The storage lock still refuses a workspace commit (the Source change's own acceptance included) inside the write.
 expect(ui.grid().onChange(ui.edited('#ffffff'))).toBe(false);
 pending.resolve({ok:true,value:{revision:6,savedAt:'2026-10-16T00:00:02Z'}});await flush();
 await expect(closing).resolves.toBe(true);
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
});

it('BE-2: a close whose Source change ends inside the bound saves through the normal held path; hiding never saves mid-transaction',async()=>{
 let sourceChange=false;const coordinator=port({transactionActive:()=>sourceChange,flushFrameGesture:vi.fn()});
 const ui=await setup(coordinator);ui.change('#123456');sourceChange=true;
 const closing=ui.closeHandler()();await vi.advanceTimersByTimeAsync(1000);await flush();
 expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
 sourceChange=false;await vi.advanceTimersByTimeAsync(40);
 await expect(closing).resolves.toBe(true);
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(coordinator.suspend).toHaveBeenCalledOnce();expect(background(ui,0)).toBe(true);
 expect(coordinator.flushFrameGesture).toHaveBeenLastCalledWith({includeHeld:true});
 // Hidden window: still bounded and still no save inside a Source change; the gesture-gated autosave covers it later.
 ui.effects();ui.change('#654321');sourceChange=true;
 vi.stubGlobal('document',{visibilityState:'hidden'});
 const hidden=ui.listener('visibilitychange');expect(hidden).toBeTypeOf('function');hidden!();
 await vi.advanceTimersByTimeAsync(2700);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(coordinator.suspend).toHaveBeenCalledOnce();
 sourceChange=false;ui.effects();await vi.advanceTimersByTimeAsync(1600);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);expect(activeBackground(ui.payload(1))).toBe('#654321');
});
