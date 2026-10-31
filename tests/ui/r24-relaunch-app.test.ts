import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(yes=>resolve=yes);return{resolve,promise};};

import {resizeMultiChartState} from '../../src/ui/MultiChartGrid';
// once the chart tree refused
// its save hold ("Chart tree input or configuration is not settled"), the background autosave never retried and the close flush
// skipped the save, so the relaunch silently showed the last good save. Harness copied from close-flush-app.test.ts: the real
// App closures under controlled React hooks, an in-memory synthetic store, a mocked chart coordinator. No DOM, no launch.
const REFUSAL='Chart tree input or configuration is not settled: synthetic-cell.';
async function setup(){
 const store={revision:4,data:prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount({initialBalance:500}),alerts:[]}) as any};const hold={refuse:true};
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision:store.revision,savedAt:'2026-10-16T00:00:00Z',data:JSON.parse(JSON.stringify(store.data)),storage:{directory:'Synthetic relaunch profile',backend:'json-atomic'}}})),
  saveWorkspace:vi.fn(async(input:any)=>{if(input.expectedRevision!==store.revision)return{ok:false,error:{code:'REVISION_CONFLICT',message:'conflict'}};store.revision++;store.data=JSON.parse(JSON.stringify(input.data));return{ok:true,value:{revision:store.revision,savedAt:'2026-10-16T00:00:01Z'}};}),
  onFlushRequest:vi.fn((_handler:()=>Promise<unknown>)=>()=>{})};
 const mount=async()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
  const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
  const suspend=vi.fn(()=>{if(hold.refuse)throw new Error(REFUSAL);return{isCurrent:()=>true,resume:vi.fn()};});
  find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady({suspend});render();
  for(const effect of mounted.slice(1))try{effect();}catch{/* absent DOM ports */}
  const effects=()=>{render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
  const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
  const status=()=>{const node=find(render(),(n:any)=>n.type==='output');const text=(v:any):string=>typeof v==='string'?v:Array.isArray(v)?v.map(text).join(''):v?.props?text(v.props.children):'';return node?text(node):'';};
  return{render,effects,grid,status,suspend,handler:()=>bridge.onFlushRequest.mock.calls.at(-1)?.[0] as ()=>Promise<unknown>};};
 return{store,hold,bridge,mount};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it('the close flush writes the two-chart layout although the chart tree refuses its hold, and the relaunch restores it',async()=>{
 const t=await setup(),ui=await t.mount();
 const two=resizeMultiChartState(ui.grid().state,'two-columns');expect(ui.grid().onChange(two)).toBe(true);ui.render();
 expect(t.bridge.saveWorkspace).not.toHaveBeenCalled();
 await expect(ui.handler()()).resolves.toBe(true);// fail-first: false, nothing written
 expect(ui.suspend).toHaveBeenCalled();expect(t.bridge.saveWorkspace).toHaveBeenCalledOnce();
 expect(t.store.data.grid.layout.cells).toHaveLength(2);
 // Same profile, new process: the saved two-chart layout comes back (not the factory one-chart workspace).
 const again=await t.mount();await flush();again.effects();await flush();
 expect(again.grid().state.layout.cells.map((row:any)=>row.id)).toEqual(two.layout.cells.map(row=>row.id));
 expect(again.status()).toBe('Local workspace restored');
});
it('a background autosave refused by the chart hold is retried once the charts settle, without a workspace change',async()=>{
 const t=await setup(),ui=await t.mount();
 const two=resizeMultiChartState(ui.grid().state,'two-columns');expect(ui.grid().onChange(two)).toBe(true);ui.effects();
 await new Promise(resolve=>setTimeout(resolve,1300));await flush();ui.effects();await flush();
 expect(ui.suspend).toHaveBeenCalled();expect(t.bridge.saveWorkspace,'a refused hold never writes from a background autosave').not.toHaveBeenCalled();
 // Was toContain('not settled'). A background save that will retry stays quiet (quick live interval
 // switches flashed "The chart is not settled yet" each time); the refusal is shown only once the 120 retries run out.
 expect(ui.status()).not.toContain('not settled');
 t.hold.refuse=false;// the chart settled; nothing else changes in the workspace
 await new Promise(resolve=>setTimeout(resolve,1100));await flush();ui.effects();await flush();
 expect(t.bridge.saveWorkspace).toHaveBeenCalledOnce();// fail-first: never retried
 expect(t.store.data.grid.layout.cells).toHaveLength(2);
},15000);
