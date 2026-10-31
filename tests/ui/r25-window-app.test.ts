import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {duplicateSavedLayout} from '../../src/ui/layout-library';
import {OPEN_ELSEWHERE_MESSAGE,SECONDARY_MISSING_LAYOUT,SECONDARY_WINDOW_NOTICE} from '../../src/ui/window-mode';
// The actual App closures (the close-flush-app harness: controlled React hooks, an in-memory bridge, SYNTHETIC demo
// workspace). It shows that a layout window opens its layout, never writes the workspace file and relays its save, and that the
// main window writes a relayed layout through its own save path. No window, DOM or process is exercised.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}};
});
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>findAll(child,test,out));else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}return out;}
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

function twoLayouts(){
 const state=createInitialWorkspace();let n=0;
 const copy=duplicateSavedLayout(state.layoutLibrary!,state.grid!,state.grid!,'Second monitor',100,()=>'r25w-'+(++n));
 return{data:prepareWorkspaceJSON({...state,layoutLibrary:copy.library,paper:createPaperAccount({initialBalance:500}),alerts:[]}),mainId:state.layoutLibrary!.activeId,otherId:copy.entry.id,otherGrid:copy.entry.grid};
}
async function setup(data:Record<string,unknown>,search=''){
 let revision=4;
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-22T00:00:00Z',data,storage:{directory:'Synthetic window profile',backend:'json-atomic'}}})),
  saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:++revision,savedAt:'2026-10-22T00:00:01Z'}})),
  saveLayoutFromWindow:vi.fn(async(_input:any)=>({ok:true,value:{revision:11,savedAt:'2026-10-22T00:00:02Z'}})),
  openLayoutWindow:vi.fn(async(_input:any)=>({ok:true,value:{windowId:1,focused:true}})),
  close:vi.fn(async()=>({ok:true,value:null})),
  onFlushRequest:vi.fn((_handler:()=>Promise<unknown>)=>()=>{}),
  onLayoutSaveRequest:vi.fn((_handler:(request:any)=>Promise<{revision:number}>)=>()=>{}),
  onLayoutWindows:vi.fn((_handler:(value:{layoutIds:string[]})=>void)=>()=>{})};
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 vi.stubGlobal('location',{search});
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 const host=()=>find(render(),node=>node.type===WorkspaceChartHost)?.props;
 host()?.onTransactionReady({suspend:vi.fn(()=>({isCurrent:()=>true,resume:vi.fn()}))});render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports are irrelevant here */}
 for(const effect of hooks.effects.splice(0))try{effect();}catch{/* as above */}
 render();
 const flushHandler=()=>bridge.onFlushRequest.mock.calls.at(-1)?.[0] as (()=>Promise<unknown>);
 const status=()=>{const tree=render();const out=find(tree,node=>node.type==='output');return JSON.stringify(out?.props?.children??'');};
 return{bridge,render,host,flushHandler,status};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>vi.unstubAllGlobals());

describe(' App: layout window and main window',()=>{
 it('a layout window opens its own layout, with no alerts or paper account, and its save is relayed instead of written',async()=>{
  const {data,otherId}=twoLayouts();const ui=await setup(data,'?window=1&layout='+encodeURIComponent(otherId));
  const grid=ui.host()!.state;expect(grid.layout.id).toBe(otherId);expect(ui.status()).toContain(SECONDARY_WINDOW_NOTICE);
  const next=structuredClone(grid);next.cells[next.layout.activeCellId].appearance.background='#123456';expect(ui.host()!.onChange(next)).toBe(true);ui.render();
  await expect(ui.flushHandler()()).resolves.toBe(true);
  expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
  expect(ui.bridge.saveLayoutFromWindow).toHaveBeenCalledOnce();
  const sent=ui.bridge.saveLayoutFromWindow.mock.calls[0][0];expect(sent.layoutId).toBe(otherId);
  expect(sent.grid.layout.id).toBe(otherId);expect(sent.grid.cells[sent.grid.layout.activeCellId].appearance.background).toBe('#123456');
  // The main window's relay handler and layout list are not registered in a layout window.
  expect(ui.bridge.onLayoutSaveRequest).not.toHaveBeenCalled();expect(ui.bridge.onLayoutWindows).not.toHaveBeenCalled();
 });
 it('a layout window whose layout is no longer saved closes without writing',async()=>{
  const {data}=twoLayouts();const ui=await setup(data,'?window=2&layout=deleted-layout');
  expect(ui.bridge.close).toHaveBeenCalledOnce();expect(ui.status()).toContain(SECONDARY_MISSING_LAYOUT);
  expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();expect(ui.bridge.saveLayoutFromWindow).not.toHaveBeenCalled();
 });
 it('the main window writes a relayed layout save through its own save path, never over its own open layout',async()=>{
  const {data,mainId,otherId,otherGrid}=twoLayouts();const ui=await setup(data);
  expect(ui.host()!.state.layout.id).toBe(mainId);
  const accept=ui.bridge.onLayoutSaveRequest.mock.calls.at(-1)?.[0];expect(accept).toBeTypeOf('function');
  const relayed=structuredClone(otherGrid);relayed.cells[relayed.layout.activeCellId].appearance.background='#654321';
  await expect(accept!({layoutId:otherId,grid:relayed})).resolves.toEqual({revision:5});
  expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
  const written=ui.bridge.saveWorkspace.mock.calls[0][0].data,entry=written.layoutLibrary.entries.find((row:any)=>row.id===otherId);
  expect(entry.grid.cells[entry.grid.layout.activeCellId].appearance.background).toBe('#654321');expect(entry.revision).toBeGreaterThan(1);
  expect(written.layoutLibrary.activeId).toBe(mainId);
  await expect(accept!({layoutId:mainId,grid:structuredClone(ui.host()!.state)})).rejects.toThrow('open in the main window');
  expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 });
 it('Open layout in new window saves first, asks main for the window, and the layout leaves this tab strip',async()=>{
  const {data,mainId,otherId}=twoLayouts(),stored=new Map([['lv.layout-tabs.v1',JSON.stringify({schemaVersion:1,open:[mainId,otherId]})]]);
  vi.stubGlobal('localStorage',{getItem:(key:string)=>stored.get(key)??null,setItem:(key:string,value:string)=>{stored.set(key,value);}});
  const ui=await setup(data);
  const tabs=()=>findAll(ui.render(),node=>node.props?.role==='tab').map(node=>node.props.id);
  expect(tabs()).toHaveLength(2);
  const button=find(ui.render(),node=>node.props?.['aria-label']==='Open Second monitor in new window');expect(button).toBeTruthy();
  button.props.onClick();for(let i=0;i<6;i++)await flush();
  expect(ui.bridge.openLayoutWindow).toHaveBeenCalledWith({layoutId:otherId});
  expect(ui.bridge.saveWorkspace.mock.invocationCallOrder[0]).toBeLessThan(ui.bridge.openLayoutWindow.mock.invocationCallOrder[0]);
  expect(tabs()).toHaveLength(1);expect(JSON.parse(stored.get('lv.layout-tabs.v1')!).open).toEqual([mainId]);
  expect(ui.status()).toContain(OPEN_ELSEWHERE_MESSAGE);
  expect(ui.host()!.state.layout.id).toBe(mainId);
 });
});
