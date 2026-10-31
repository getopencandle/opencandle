import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {LayoutLibraryDialog} from '../../src/ui/LayoutLibraryDialog';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const memo=(factory:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((value,i)=>!Object.is(value,old.deps[i])))hooks.cells[index]={deps,value:factory()};return hooks.cells[index].value;};return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(effect:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((value,i)=>!Object.is(value,old[i]))){hooks.cells[index]=deps;hooks.effects.push(effect);}}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
async function flush(){for(let index=0;index<12;index++)await Promise.resolve();}
async function setup(){const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision:7,savedAt:'2026-10-14T17:00:00Z',data:null,storage:{directory:'Synthetic layout review profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(),exportData:vi.fn(),executeScript:vi.fn()};vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});const render=()=>{hooks.cursor=0;return App();};render();const boot=hooks.effects.shift()!;hooks.effects=[];boot();await flush();const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props,button=(name:string)=>find(render(),node=>node.type==='button'&&(node.props['aria-label']===name||text(node)===name));return{bridge,render,grid,button,library:()=>find(render(),node=>node.type===LayoutLibraryDialog).props};}
function install(ui:Awaited<ReturnType<typeof setup>>,resume=vi.fn()){
 const opening=ui.grid(),owner={suspend:vi.fn((input:any)=>{expect(input.state).toBe(opening.state);expect(input.datasets).toBe(opening.datasets);expect(input.activeBars).toBe(opening.activeBars);expect(input.activeExecutionIdentity).toBe(opening.activeExecutionIdentity);return{isCurrent:()=>true,resume};})};opening.onTransactionReady(owner);return owner;
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>vi.unstubAllGlobals());
it('holds the exact native owner and keeps the old saved snapshot until one durable receipt',async()=>{
 const ui=await setup(),owner=install(ui);let accept!:(value:any)=>void;ui.bridge.saveWorkspace.mockImplementation(()=>new Promise(resolve=>{accept=resolve;}));ui.button('Open layouts').props.onClick();const old=ui.library().library;
 ui.button('Save').props.onClick();ui.button('Save').props.onClick();await flush();expect(owner.suspend).toHaveBeenCalledOnce();expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();expect(ui.library().library).toBe(old);expect(old.entries[0].savedAt).toBe(0);
 accept({ok:true,value:{revision:8,savedAt:'2026-10-14T19:00:00Z'}});await flush();expect(owner.suspend.mock.results[0].value.resume).toHaveBeenCalledOnce();expect(ui.library().library.entries[0].savedAt).toBeGreaterThan(0);expect(ui.bridge.saveWorkspace.mock.calls[0][0].expectedRevision).toBe(7);
});
it('retains the prior saved snapshot and dirty draft after a rejected CAS receipt',async()=>{
 const ui=await setup(),resume=vi.fn();install(ui,resume);ui.bridge.saveWorkspace.mockResolvedValue({ok:false,error:{code:'REVISION_MISMATCH',message:'Synthetic CAS mismatch'}});ui.button('Open layouts').props.onClick();const old=ui.library().library;
 ui.button('Save').props.onClick();await flush();expect(ui.library().library).toBe(old);expect(text(ui.render())).toContain('Synthetic CAS mismatch');expect(resume).toHaveBeenCalledOnce();expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
});
it('preserves accepted durable revision and snapshot after resume failure without automatic CAS retry',async()=>{
 const ui=await setup();install(ui,vi.fn(()=>{throw Error('Synthetic native resume failure');}));ui.bridge.saveWorkspace.mockResolvedValue({ok:true,value:{revision:8,savedAt:'2026-10-14T19:00:00Z'}});ui.button('Open layouts').props.onClick();
 ui.button('Save').props.onClick();await flush();expect(ui.library().library.entries[0].savedAt).toBeGreaterThan(0);expect(text(ui.render())).toMatch(/Saved locally.*needs recovery/);expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 // An explicitly supplied replacement owner and another manual save use the accepted revision.
 install(ui);ui.bridge.saveWorkspace.mockResolvedValue({ok:true,value:{revision:9,savedAt:'2026-10-14T19:01:00Z'}});ui.button('Save').props.onClick();await flush();expect(ui.bridge.saveWorkspace).toHaveBeenCalledTimes(2);expect(ui.bridge.saveWorkspace.mock.calls[1][0].expectedRevision).toBe(8);
});
it('does not publish late export status after the captured layouts parent closes',async()=>{
 const ui=await setup();let receipt!:(value:any)=>void;ui.bridge.exportData.mockImplementation(()=>new Promise(resolve=>{receipt=resolve;}));ui.button('Open layouts').props.onClick();const opening=ui.library(),pending=opening.onAction({kind:'export'});opening.onClose();const original=text(ui.render());
 receipt({ok:true,value:{fileName:'Synthetic-layout.json',bytes:100}});try{await pending;}catch{/* Retired completion may reject without touching the replacement view. */}expect(text(ui.render())).toBe(original);expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
});
it('rejects retained replay entry during a native disk hold and after its workspace owner changes',async()=>{
 const ui=await setup();install(ui);let receipt!:(value:any)=>void;ui.bridge.saveWorkspace.mockImplementation(()=>new Promise(resolve=>{receipt=resolve;}));
 const replay=find(ui.render(),node=>node.type==='button'&&text(node).endsWith(' Replay')).props.onClick;ui.button('Save').props.onClick();await flush();replay();expect(ui.grid().activeExecutionIdentity).toBe('ordinary');
 receipt({ok:true,value:{revision:8,savedAt:'2026-10-14T19:00:00Z'}});await flush();replay();expect(ui.grid().activeExecutionIdentity).toBe('ordinary');expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
});
