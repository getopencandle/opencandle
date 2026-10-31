import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
// F2 (iface2): actual App flush handler with controlled React hooks and an in-memory bridge. The main
// process holds a window close until this flush settles (tests/desktop/close-flush-main.test.ts). No DOM,
// window close or packaged restart is exercised here.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(yes=>resolve=yes);return{resolve,promise};};

async function setup(data:Record<string,unknown>=prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount({initialBalance:500}),alerts:[]})){
 let revision=4;const unsubscribe=vi.fn();
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-16T00:00:00Z',data,storage:{directory:'Synthetic flush profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:++revision,savedAt:'2026-10-16T00:00:01Z'}})),onFlushRequest:vi.fn((_handler:()=>Promise<unknown>)=>unsubscribe)};
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady({suspend:vi.fn(()=>({isCurrent:()=>true,resume:vi.fn()}))});render();
 // Run every mount-time effect except the boot effect (already run), as React would after the first commit.
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports are irrelevant here */}
 const handler=()=>bridge.onFlushRequest.mock.calls.at(-1)?.[0] as (()=>Promise<unknown>)|undefined;
 const change=(background:string)=>{const next=structuredClone(grid().state);next.cells[next.layout.activeCellId].appearance.background=background;expect(grid().onChange(next)).toBe(true);render();};
 const savedBackground=(call:number)=>{const payload=bridge.saveWorkspace.mock.calls[call][0].data;return payload.grid.cells[payload.grid.layout.activeCellId].appearance.background;};
 return{bridge,render,grid,handler,change,savedBackground,unsubscribe};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>vi.unstubAllGlobals());

it('a change made just before close is written by the flush handler, before the debounce fires',async()=>{
 const ui=await setup();expect(ui.handler()).toBeTypeOf('function');
 ui.change('#13579b');expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
 await expect(ui.handler()!()).resolves.toBe(true);
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(ui.savedBackground(0)).toBe('#13579b');
 await ui.handler()!();expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
});
it('a flush during an in-flight autosave waits for its receipt and then writes the newer change',async()=>{
 const ui=await setup(),pending=deferred();ui.change('#111111');ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 const firstFlush=ui.handler()!();await flush();expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 // A further change while the first write is in flight is refused by the storage hold, so change after it settles.
 const secondFlush=ui.handler()!();let settled=false;void secondFlush.then(()=>{settled=true;});await flush();expect(settled).toBe(false);
 pending.resolve({ok:true,value:{revision:5,savedAt:'2026-10-16T00:00:02Z'}});await firstFlush;await secondFlush;
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(ui.bridge.saveWorkspace.mock.calls[0][0].expectedRevision).toBe(4);
 ui.render();ui.change('#222222');await ui.handler()!();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);expect(ui.savedBackground(1)).toBe('#222222');expect(ui.bridge.saveWorkspace.mock.calls[1][0].expectedRevision).toBe(5);
});
it('hiding the window flushes the pending change',async()=>{
 const ui=await setup();ui.change('#2468ac');
 const listener=(window.addEventListener as any).mock.calls.find((call:any[])=>call[0]==='visibilitychange')?.[1];expect(listener).toBeTypeOf('function');
 vi.stubGlobal('document',{visibilityState:'visible'});listener();await flush();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
 vi.stubGlobal('document',{visibilityState:'hidden'});listener();await flush();await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(ui.savedBackground(0)).toBe('#2468ac');
});
it('a flush with nothing newer than the last write does not write, and a startup-recovery workspace is never overwritten by it',async()=>{
 // The first autosave after load records the loaded state once (existing timer behavior); a later flush is a no-op.
 const clean=await setup();await clean.handler()!();expect(clean.bridge.saveWorkspace).toHaveBeenCalledOnce();await clean.handler()!();expect(clean.bridge.saveWorkspace).toHaveBeenCalledOnce();
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.unstubAllGlobals();
 const broken=await setup({...prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount({initialBalance:500}),alerts:[]}),version:999});
 expect(broken.handler()).toBeTypeOf('function');await expect(broken.handler()!()).resolves.toBe(false);expect(broken.bridge.saveWorkspace).not.toHaveBeenCalled();
});

// A viewport edit released within the grid's 200 ms frame-gesture window is still in that timer at close. The
// close flush first finishes it through the active grid coordinator (the same flush as the timer; App only ever holds the
// active chart tree's coordinator), then saves, so the save carries the gesture.
it('BFABC-R3: the close flush finishes a pending frame gesture through the active grid coordinator before saving',async()=>{
 const ui=await setup(),order:string[]=[];
 const gesture=vi.fn(()=>{order.push('gesture');const next=structuredClone(ui.grid().state);next.cells[next.layout.activeCellId].appearance.background='#abcdef';expect(ui.grid().onChange(next)).toBe(true);});
 ui.grid().onTransactionReady({suspend:vi.fn(()=>({isCurrent:()=>true,resume:vi.fn()})),flushFrameGesture:gesture});ui.render();
 const save=ui.bridge.saveWorkspace.getMockImplementation()!;ui.bridge.saveWorkspace.mockImplementation(async(input:any)=>{order.push('save');return save(input);});
 await expect(ui.handler()!()).resolves.toBe(true);
 expect(gesture).toHaveBeenCalledOnce();expect(gesture).toHaveBeenCalledWith({includeHeld:true});expect(order).toEqual(['gesture','save']);expect(ui.savedBackground(0)).toBe('#abcdef');
});
it('BFABC-R3: a retired grid coordinator is not flushed, and a failing gesture flush still lets the save run',async()=>{
 const ui=await setup(),retired=vi.fn();
 ui.grid().onTransactionReady({suspend:vi.fn(()=>({isCurrent:()=>true,resume:vi.fn()})),flushFrameGesture:retired});
 const failing=vi.fn(()=>{throw Error('Synthetic gesture flush failure');});
 ui.grid().onTransactionReady({suspend:vi.fn(()=>({isCurrent:()=>true,resume:vi.fn()})),flushFrameGesture:failing});ui.render();
 ui.change('#0a0b0c');
 await expect(ui.handler()!()).resolves.toBe(true);
 expect(retired).not.toHaveBeenCalled();expect(failing).toHaveBeenCalledOnce();expect(ui.savedBackground(0)).toBe('#0a0b0c');
});

// Hiding the window flushes only a finished frame gesture (a held drag is left to its own release); the close
// request finishes a held one too (includeHeld), since the window closes after that save.
it('HD-R1: the visibility-hidden flush asks the grid for finished gestures only; the close request includes a held one',async()=>{
 const ui=await setup(),gesture=vi.fn();
 ui.grid().onTransactionReady({suspend:vi.fn(()=>({isCurrent:()=>true,resume:vi.fn()})),flushFrameGesture:gesture});ui.render();
 const listener=(window.addEventListener as any).mock.calls.find((call:any[])=>call[0]==='visibilitychange')?.[1];
 vi.stubGlobal('document',{visibilityState:'hidden'});listener();await flush();await flush();
 expect(gesture).toHaveBeenCalledOnce();expect(gesture).toHaveBeenLastCalledWith({includeHeld:false});
 await ui.handler()!();expect(gesture).toHaveBeenCalledTimes(2);expect(gesture).toHaveBeenLastCalledWith({includeHeld:true});
});
