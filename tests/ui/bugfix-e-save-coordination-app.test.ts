import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {layoutIsDirty} from '../../src/ui/layout-library';
// Save coordination (BD-R1 (App side: the autosave and an explicit Save wait for a grid
// Source change instead of taking a chart hold inside it), BD-R2 (the timer autosave, the hidden-window flush and an
// explicit Save never save mid-gesture; close still finishes the gesture, then saves) and BD-R3 (an explicit Save clicked
// while the background autosave writes is queued with visible status and runs after it). Actual App closures, autosave
// timer and storage mutation under controlled React hooks and an in-memory bridge; the grid coordinator is a controlled
// port (its real behavior: tests/ui/bugfix-e-grid-hold-owners.test.ts). No DOM, focus engine, GUI or package claim.
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

async function setup(coordinator:Coordinator=port(),layoutAutosave=true){
 let revision=4;const initial=createInitialWorkspace();
 const data=prepareWorkspaceJSON({...initial,layoutLibrary:{...initial.layoutLibrary!,autosave:layoutAutosave},paper:createPaperAccount({initialBalance:500}),alerts:[]});
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-16T00:00:00Z',data,storage:{directory:'Synthetic save-coordination profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:++revision,savedAt:'2026-10-16T00:00:01Z'}})),onFlushRequest:vi.fn((_handler:()=>Promise<unknown>)=>vi.fn())};
 const win={lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()};vi.stubGlobal('window',win);
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady(coordinator);render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports are irrelevant here */}
 const effects=()=>{render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 const button=(name:string)=>{const found=find(render(),node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name));if(!found)throw Error('Missing control '+name);return found;};
 const change=(background:string)=>{const next=structuredClone(grid().state);next.cells[next.layout.activeCellId].appearance.background=background;expect(grid().onChange(next)).toBe(true);render();};
 const shown=()=>text(render());
 const payload=(call:number)=>bridge.saveWorkspace.mock.calls[call][0].data;
 const listener=(type:string)=>win.addEventListener.mock.calls.filter((call:any[])=>call[0]===type).at(-1)?.[1] as ((event?:unknown)=>void)|undefined;
 const closeHandler=()=>bridge.onFlushRequest.mock.calls.at(-1)?.[0] as (()=>Promise<unknown>);
 // Settle the first post-load autosave so the next save is the one under test.
 effects();await vi.advanceTimersByTimeAsync(1300);await flush();effects();bridge.saveWorkspace.mockClear();coordinator.suspend.mockClear();
 return{bridge,render,grid,button,change,effects,coordinator,shown,payload,listener,closeHandler};
}
const background=(ui:Awaited<ReturnType<typeof setup>>,call:number)=>ui.coordinator.suspend.mock.calls[call][1]?.background===true;
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it('BD-R3: Save clicked while the autosave writes is queued with visible status and runs after it (layout autosave off)',async()=>{
 const ui=await setup(port(),false),pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 ui.change('#13579b');ui.effects();await vi.advanceTimersByTimeAsync(1300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(background(ui,0)).toBe(true);// the routine autosave is writing
 ui.button('Save').props.onClick();await flush();
 // Probe 'save': this click used to return false with no message and no queue; the explicit layout save was lost.
 expect(ui.shown()).toContain('Save queued: it runs when the current autosave finishes.');
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 pending.resolve({ok:true,value:{revision:6,savedAt:'2026-10-16T00:00:02Z'}});await flush();ui.effects();
 await vi.advanceTimersByTimeAsync(300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);
 expect(ui.bridge.saveWorkspace.mock.calls[1][0].expectedRevision).toBe(6);expect(background(ui,1)).toBe(false);// the explicit (blocking) save
 const draft=ui.payload(0),saved=ui.payload(1);
 expect(layoutIsDirty(draft.layoutLibrary,draft.grid)).toBe(true);// the recovery draft left the saved layout unchanged
 expect(layoutIsDirty(saved.layoutLibrary,saved.grid)).toBe(false);// the queued explicit save wrote the layout
 expect(saved.grid.cells[saved.grid.layout.activeCellId].appearance.background).toBe('#13579b');
 expect(ui.shown()).toContain('Layout saved locally.');
 await vi.advanceTimersByTimeAsync(3000);await flush();ui.effects();await vi.advanceTimersByTimeAsync(1300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);// queued once, ran once
});

it('BD-R3: Ctrl+S during the background autosave queues the explicit save too (it used to be swallowed by the keyboard guard)',async()=>{
 const ui=await setup(port(),false),pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 ui.change('#2468ac');ui.effects();await vi.advanceTimersByTimeAsync(1300);await flush();expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 vi.stubGlobal('document',{querySelector:()=>null});
 const key={key:'s',ctrlKey:true,metaKey:false,altKey:false,shiftKey:false,isComposing:false,repeat:false,target:{closest:()=>null},preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()};
 ui.listener('keydown')!(key);await flush();
 expect(key.preventDefault).toHaveBeenCalled();expect(ui.shown()).toContain('Save queued');
 pending.resolve({ok:true,value:{revision:6,savedAt:'2026-10-16T00:00:02Z'}});await flush();ui.effects();await vi.advanceTimersByTimeAsync(300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);expect(layoutIsDirty(ui.payload(1).layoutLibrary,ui.payload(1).grid)).toBe(false);
});

it('BD-R2: the timer autosave never saves mid-gesture, however long the gesture stays open (no ~10 s cap)',async()=>{
 let held=false;const ui=await setup(port({gestureActive:vi.fn(()=>held)}));held=true;ui.change('#0a0b0c');ui.effects();
 await vi.advanceTimersByTimeAsync(1300+30000);await flush();
 expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();expect(ui.coordinator.suspend).not.toHaveBeenCalled();
 held=false;await vi.advanceTimersByTimeAsync(300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(background(ui,0)).toBe(true);
 expect(ui.payload(0).grid.cells[ui.payload(0).grid.layout.activeCellId].appearance.background).toBe('#0a0b0c');
});

it('BD-R2: an explicit Save publishes a released gesture first; with a gesture still open it is queued until the gesture ends',async()=>{
 const order:string[]=[];let open=true;
 const released=port({gestureActive:()=>open,flushFrameGesture:vi.fn(()=>{order.push('gesture');open=false;})});
 const ui=await setup(released);released.suspend.mockImplementation(()=>{order.push('hold');return{isCurrent:()=>true,resume:vi.fn()};});
 ui.change('#111111');ui.button('Save').props.onClick();await flush();
 expect(released.flushFrameGesture).toHaveBeenCalledOnce();expect(released.flushFrameGesture!.mock.calls[0][0]?.includeHeld).toBeFalsy();
 expect(order).toEqual(['gesture','hold']);expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.unstubAllGlobals();
 let held=true;const holding=port({gestureActive:()=>held,flushFrameGesture:vi.fn()});
 const second=await setup(holding);second.change('#222222');second.button('Save').props.onClick();await flush();
 expect(holding.suspend).not.toHaveBeenCalled();expect(second.bridge.saveWorkspace).not.toHaveBeenCalled();
 expect(second.shown()).toContain('Save queued: it runs when the chart gesture ends.');
 await vi.advanceTimersByTimeAsync(2000);await flush();expect(second.bridge.saveWorkspace).not.toHaveBeenCalled();
 held=false;await vi.advanceTimersByTimeAsync(300);await flush();
 expect(second.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(holding.suspend.mock.calls[0][1]?.background).toBeFalsy();
 expect(layoutIsDirty(second.payload(0).layoutLibrary,second.payload(0).grid)).toBe(false);expect(second.shown()).toContain('Layout saved locally.');
});

it('BD-R2: hiding the window with a held gesture publishes nothing held and saves only after the gesture ends; close still finishes, then saves',async()=>{
 let held=true;const coordinator=port({gestureActive:()=>held,flushFrameGesture:vi.fn()});
 const ui=await setup(coordinator);ui.change('#2468ac');
 vi.stubGlobal('document',{visibilityState:'hidden'});ui.listener('visibilitychange')!();await flush();await flush();
 expect(coordinator.flushFrameGesture).toHaveBeenLastCalledWith({includeHeld:false});
 expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();// no save (and no hold) while the drag is still held
 await vi.advanceTimersByTimeAsync(1000);await flush();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
 held=false;await vi.advanceTimersByTimeAsync(300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(ui.payload(0).grid.cells[ui.payload(0).grid.layout.activeCellId].appearance.background).toBe('#2468ac');
 // Close: the held gesture is finished by the grid (includeHeld) and the save runs at once, never deferred.
 held=true;ui.effects();ui.change('#abcdef');
 await expect(ui.closeHandler()()).resolves.toBe(true);
 expect(coordinator.flushFrameGesture).toHaveBeenLastCalledWith({includeHeld:true});expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);
});

it('BD-R1: while a grid Source change is finishing the autosave takes no chart hold and an explicit Save is queued; both run after it',async()=>{
 let busy=true;const coordinator=port({transactionActive:()=>busy});
 const ui=await setup(coordinator);ui.change('#13579b');ui.effects();
 await vi.advanceTimersByTimeAsync(1300);await flush();
 expect(coordinator.suspend).not.toHaveBeenCalled();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
 ui.button('Save').props.onClick();await flush();
 expect(coordinator.suspend).not.toHaveBeenCalled();expect(ui.shown()).toContain('Save queued: it runs when the chart source change finishes.');
 await vi.advanceTimersByTimeAsync(2000);await flush();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
 busy=false;await vi.advanceTimersByTimeAsync(300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(background(ui,0)).toBe(false);expect(ui.shown()).toContain('Layout saved locally.');
 ui.effects();await vi.advanceTimersByTimeAsync(1300);await flush();expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();// nothing newer
 // The autosave alone (no explicit Save) also retries until the Source change ends, then saves once.
 busy=true;ui.change('#2468ac');ui.effects();await vi.advanceTimersByTimeAsync(1300+1000);await flush();expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 busy=false;await vi.advanceTimersByTimeAsync(300);await flush();expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);expect(background(ui,1)).toBe(true);
});

it('BD-R3: a close request while an explicit save is queued behind the autosave writes that explicit save',async()=>{
 const ui=await setup(port(),false),pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 ui.change('#0f1e2d');ui.effects();await vi.advanceTimersByTimeAsync(1300);await flush();expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 ui.button('Save').props.onClick();await flush();expect(ui.shown()).toContain('Save queued');
 const closing=ui.closeHandler()();await vi.advanceTimersByTimeAsync(40);expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();// waits for the write
 pending.resolve({ok:true,value:{revision:6,savedAt:'2026-10-16T00:00:02Z'}});await vi.advanceTimersByTimeAsync(40);
 await expect(closing).resolves.toBe(true);
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);expect(layoutIsDirty(ui.payload(1).layoutLibrary,ui.payload(1).grid)).toBe(false);
 await vi.advanceTimersByTimeAsync(1000);await flush();expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);// the queue was consumed
});
