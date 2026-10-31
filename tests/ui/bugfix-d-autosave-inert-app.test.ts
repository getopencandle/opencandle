import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {ChartSettingsDialog} from '../../src/ui/chart-settings-dialog';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
// About 1.3 s after a committed change the debounced autosave made `main.workspace`
// inert, so Chromium dropped focus from the open dialog (a typed alert message lost its tail). Actual App closures
// and autosave timer under controlled React hooks and an in-memory bridge. No DOM, focus engine or package claim:
// the assertion is on the rendered `inert` / `aria-busy` of the dialog's ancestors while the save is in flight.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
/** The chain of rendered elements from the root down to the first element matching the test. */
function path(node:any,test:(node:any)=>boolean,trail:any[]=[]):any[]|null{if(Array.isArray(node)){for(const child of node){const found=path(child,test,trail);if(found)return found;}return null;}if(!node?.props)return null;const next=[...trail,node];if(test(node))return next;return path(node.props.children,test,next);}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(yes=>resolve=yes);return{resolve,promise};};

async function setup(coordinator:any={suspend:vi.fn((_expected:unknown,_options?:unknown)=>({isCurrent:()=>true,resume:vi.fn()}))}){
 let revision=4;
 const data=prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount({initialBalance:500}),alerts:[]});
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-16T00:00:00Z',data,storage:{directory:'Synthetic autosave profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:++revision,savedAt:'2026-10-16T00:00:01Z'}})),onFlushRequest:vi.fn(()=>vi.fn())};
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady(coordinator);render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports are irrelevant here */}
 /** Runs the effects React would run after the latest commit (those whose dependencies changed). */
 const effects=()=>{render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 const button=(name:string)=>{const found=find(render(),node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name));if(!found)throw Error('Missing control '+name);return found;};
 const change=(background:string)=>{const next=structuredClone(grid().state);next.cells[next.layout.activeCellId].appearance.background=background;expect(grid().onChange(next)).toBe(true);render();};
 // Settle the first post-load autosave so the next save is the routine one under test.
 effects();await vi.advanceTimersByTimeAsync(1300);await flush();effects();bridge.saveWorkspace.mockClear();coordinator.suspend.mockClear();
 return{bridge,render,grid,button,change,effects,coordinator};
}
const dialogAncestors=(tree:any)=>path(tree,node=>node.type===ChartSettingsDialog);
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it('F9: a routine autosave about 1.2 s after a committed change never makes the open dialog\'s workspace inert or busy',async()=>{
 const ui=await setup();
 ui.button('Local storage').props.onClick();expect(dialogAncestors(ui.render())).not.toBeNull();
 const pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 ui.change('#13579b');ui.effects();
 await vi.advanceTimersByTimeAsync(1100);expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(200);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();// the background write is in flight
 const during=ui.render(),chain=dialogAncestors(during)!;
 expect(chain).not.toBeNull();// the dialog is still mounted under main.workspace
 const main=chain.find((node:any)=>node.type==='main');expect(main.props.className).toContain('workspace');
 for(const node of chain)expect(node.props.inert,'no ancestor of the open dialog is inert during a background save').toBeFalsy();
 expect(main.props['aria-busy']).toBeFalsy();
 // The open dialog's own handlers still work during the save (Escape and Close end in this onClose).
 const storage=find(during,node=>node.type===ChartSettingsDialog).props;expect(typeof storage.onCancel).toBe('function');
 pending.resolve({ok:true,value:{revision:6,savedAt:'2026-10-16T00:00:02Z'}});await flush();ui.effects();
 expect(dialogAncestors(ui.render())).not.toBeNull();
 storage.onCancel();expect(dialogAncestors(ui.render())).toBeNull();
});

it('F9: after a background save settles the debounce re-arms, so a later change is still saved once',async()=>{
 const ui=await setup(),pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 ui.change('#111111');ui.effects();await vi.advanceTimersByTimeAsync(1300);await flush();expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 pending.resolve({ok:true,value:{revision:6,savedAt:'2026-10-16T00:00:02Z'}});await flush();ui.effects();
 ui.change('#222222');ui.effects();await vi.advanceTimersByTimeAsync(1300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);expect(ui.bridge.saveWorkspace.mock.calls[1][0].expectedRevision).toBe(6);
 const payload=ui.bridge.saveWorkspace.mock.calls[1][0].data;expect(payload.grid.cells[payload.grid.layout.activeCellId].appearance.background).toBe('#222222');
});

it('F9: an explicit Save is still a blocking operation (workspace inert while it writes), unlike the background autosave',async()=>{
 const ui=await setup(),pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 ui.button('Save').props.onClick();await flush();expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 const main=find(ui.render(),node=>node.type==='main');expect(main.props.inert).toBe(true);expect(main.props['aria-busy']).toBe(true);
 pending.resolve({ok:true,value:{revision:6,savedAt:'2026-10-16T00:00:02Z'}});await flush();
 const after=find(ui.render(),node=>node.type==='main');expect(after.props.inert).toBeFalsy();
});

// Follow-up (chart grid): the save's chart-tree hold is requested as a background hold for the routine autosave, so the
// grid stays visible and interactive (tests/ui/bugfix-d-grid-autosave-hold.test.ts); explicit saves keep the blocking hold.
it('F9 grid: the autosave requests a background chart-tree hold; an explicit Save requests the blocking one',async()=>{
 const ui=await setup();ui.change('#13579b');ui.effects();await vi.advanceTimersByTimeAsync(1300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(ui.coordinator.suspend).toHaveBeenCalledOnce();
 expect(ui.coordinator.suspend.mock.calls[0][1]).toEqual({background:true});
 ui.effects();ui.change('#2468ac');ui.button('Save').props.onClick();await flush();
 expect(ui.coordinator.suspend).toHaveBeenCalledTimes(2);expect(ui.coordinator.suspend.mock.calls[1][1]?.background).toBeFalsy();
});

it('F9 grid: an in-progress chart gesture is not interrupted: the autosave waits until the gesture is published',async()=>{
 let gesture=true;const coordinator={suspend:vi.fn((_expected:unknown,_options?:unknown)=>({isCurrent:()=>true,resume:vi.fn()})),gestureActive:vi.fn(()=>gesture)};
 const ui=await setup(coordinator);
 ui.change('#13579b');ui.effects();await vi.advanceTimersByTimeAsync(1300);await flush();
 expect(coordinator.gestureActive).toHaveBeenCalled();expect(coordinator.suspend).not.toHaveBeenCalled();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1000);await flush();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();// still held: keeps waiting
 gesture=false;await vi.advanceTimersByTimeAsync(300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(coordinator.suspend).toHaveBeenCalledOnce();expect(coordinator.suspend.mock.calls[0][1]).toEqual({background:true});
 const payload=ui.bridge.saveWorkspace.mock.calls[0][0].data;expect(payload.grid.cells[payload.grid.layout.activeCellId].appearance.background).toBe('#13579b');
});

// Superseded by a later fix: the former ~10 s cap saved mid-gesture and, with a write slower than the 200 ms frame
// window, quarantined the cell. The timer autosave now waits for the gesture's end however long it stays open.
it('F9 grid (BD-R2): a gesture that stays open keeps deferring the autosave; it saves once the gesture ends',async()=>{
 let held=false;const coordinator={suspend:vi.fn((_expected:unknown,_options?:unknown)=>({isCurrent:()=>true,resume:vi.fn()})),gestureActive:vi.fn(()=>held)};
 const ui=await setup(coordinator);held=true;ui.change('#0a0b0c');ui.effects();
 await vi.advanceTimersByTimeAsync(1300+9000);await flush();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(2000);await flush();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();expect(coordinator.suspend).not.toHaveBeenCalled();
 held=false;await vi.advanceTimersByTimeAsync(300);await flush();expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
});
