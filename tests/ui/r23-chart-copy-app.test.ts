import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {PaperPanel} from '../../src/ui/PaperPanel';
import {sourceContextForDataset} from '../../src/chart/source-context';
// harness copied from tests/security/context-price-app-review.test.ts.
// Actual App callbacks under controlled hooks, not mounted DOM/native/IPC evidence. A synthetic PNG stands in for the composite.
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const memo=(fn:()=>any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))hooks.cells[i]={deps,value:fn()};return hooks.cells[i].value;};return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((value,j)=>!Object.is(value,old[j]))){hooks.cells[i]=deps;hooks.effects.push(fn);}}};});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,test);if(result)return result;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
async function setup(copy:(input:any)=>Promise<any>){
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision:7,savedAt:'2026-10-14T17:00:00Z',data:null,storage:{directory:'Synthetic review profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(),executeScript:vi.fn(),copyChartImage:vi.fn(copy),exportChart:vi.fn()};
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});const render=()=>{hooks.cursor=0;return App();};render();const boot=hooks.effects.shift()!;hooks.effects=[];boot();await flush();
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 const first=grid(),data=first.datasets.find((row:any)=>row.provenance.datasetId===first.activeDatasetId),controller={goToDate:vi.fn(),getStyle:()=>first.state.cells[first.state.layout.activeCellId].style,sourceContext:()=>sourceContextForDataset(data,first.activeBars),exportChartImage:vi.fn(()=>({ok:true,dataUrl:PNG,width:1,height:1,policies:[]}))};
 first.onReady(controller);const active=grid(),snapshot:any={token:{},treeOwner:{},cellId:active.state.layout.activeCellId,controller,instrument:{...data.instrument},input:{bars:active.activeBars,source:sourceContextForDataset(data,active.activeBars),style:active.state.cells[active.state.layout.activeCellId].style},executionIdentity:active.activeExecutionIdentity,entity:{kind:'chart'},client:null,local:null,point:{price:99.5,logical:1,barIndex:null,barTime:null,unit:'price',pane:{kind:'price'}}};
 let live=true;const release=vi.fn(()=>{live=false;}),lease={snapshot,isCurrent:()=>live,isOwnerCurrent:()=>live,release};
 return{bridge,render,grid,data,snapshot,lease,alerts:()=>find(render(),node=>node.type===WorkspaceAlerts).props,paper:()=>find(render(),node=>node.type===PaperPanel)?.props};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>vi.unstubAllGlobals());

it('Copy chart image sends the composite to the clipboard bridge and succeeds only after the write',async()=>{
 const ui=await setup(async()=>({ok:true,value:{bytes:70,width:1,height:1}}));
 expect(typeof ui.grid().contextActions['png-copy']).toBe('function');
 const result=await ui.grid().contextActions['png-copy'](ui.snapshot,ui.lease);
 expect(result).toEqual({ok:true});
 expect(ui.bridge.copyChartImage).toHaveBeenCalledWith({pngDataUrl:PNG});expect(ui.bridge.exportChart).not.toHaveBeenCalled();
 expect(ui.lease.release).toHaveBeenCalledOnce();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
});
it('a failed clipboard write is reported as a failure, never as copied',async()=>{
 const ui=await setup(async()=>({ok:false,error:{code:'OPERATION_FAILED',message:'Local operation failed.'}}));
 const result=await ui.grid().contextActions['png-copy'](ui.snapshot,ui.lease);
 expect(result).toMatchObject({ok:false,message:'Local operation failed.'});
 expect(ui.lease.release).toHaveBeenCalledOnce();
});
