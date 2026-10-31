import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {PaperPanel} from '../../src/ui/PaperPanel';
import {sourceContextForDataset} from '../../src/chart/source-context';
// Actual App callbacks under controlled hooks, not mounted DOM/native/IPC evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const memo=(fn:()=>any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))hooks.cells[i]={deps,value:fn()};return hooks.cells[i].value;};return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((value,j)=>!Object.is(value,old[j]))){hooks.cells[i]=deps;hooks.effects.push(fn);}}};});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,test);if(result)return result;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
async function setup(){
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision:7,savedAt:'2026-10-14T17:00:00Z',data:null,storage:{directory:'Synthetic review profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(),executeScript:vi.fn()};
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});const render=()=>{hooks.cursor=0;return App();};render();const boot=hooks.effects.shift()!;hooks.effects=[];boot();await flush();
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 const first=grid(),data=first.datasets.find((row:any)=>row.provenance.datasetId===first.activeDatasetId),controller={goToDate:vi.fn(),getStyle:()=>first.state.cells[first.state.layout.activeCellId].style,sourceContext:()=>sourceContextForDataset(data,first.activeBars)};
 first.onReady(controller);const active=grid(),snapshot:any={token:{},treeOwner:{},cellId:active.state.layout.activeCellId,controller,instrument:{...data.instrument},input:{bars:active.activeBars,source:sourceContextForDataset(data,active.activeBars),style:active.state.cells[active.state.layout.activeCellId].style},executionIdentity:active.activeExecutionIdentity,entity:{kind:'chart'},client:null,local:null,point:{price:99.5,logical:1,barIndex:null,barTime:null,unit:'price',pane:{kind:'price'}}};
 let live=true;const release=vi.fn(()=>{live=false;}),lease={snapshot,isCurrent:()=>live,isOwnerCurrent:()=>live,release};
 return{bridge,render,grid,data,snapshot,lease,alerts:()=>find(render(),node=>node.type===WorkspaceAlerts).props,paper:()=>find(render(),node=>node.type===PaperPanel)?.props};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>vi.unstubAllGlobals());

it('a refused coordinate plus release failure preserves the original and cleanup causes',async()=>{
 const ui=await setup();ui.snapshot.point.pane={kind:'logical',id:'rsi'};ui.lease.release.mockImplementation(()=>{throw Error('Synthetic release failure');});
 let error:unknown;try{await ui.grid().contextActions['price-alert'](ui.snapshot,ui.lease);}catch(cause){error=cause;}
 expect(error).toBeInstanceOf(AggregateError);const errors=(error as AggregateError).errors;
 expect(errors.map(value=>String(value)).join(' ')).toContain('coordinate');expect(errors.map(value=>String(value)).join(' ')).toContain('Synthetic release failure');
 expect(ui.lease.release).toHaveBeenCalledOnce();expect(ui.alerts().open).toBe(false);expect(ui.paper()).toBeUndefined();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();
});

it('a geometry seed failure plus release failure cannot replace the seed diagnostic',async()=>{
 const ui=await setup();let checks=0;ui.lease.isCurrent=()=>++checks===1;ui.lease.release.mockImplementation(()=>{throw Error('Synthetic seed cleanup failure');});
 let error:unknown;try{await ui.grid().contextActions['paper-ticket'](ui.snapshot,ui.lease);}catch(cause){error=cause;}
 expect(error).toBeInstanceOf(AggregateError);const messages=(error as AggregateError).errors.map(value=>String(value)).join(' ');
 expect(messages).toContain('geometry');expect(messages).toContain('Synthetic seed cleanup failure');expect(ui.lease.release).toHaveBeenCalledOnce();expect(ui.paper()).toBeUndefined();
});

it('refused or out-of-range price requests do not open a fallback or submit virtual funds',async()=>{
 const ui=await setup();ui.snapshot.point.price=1e15+1;
 const result=await ui.grid().contextActions['paper-ticket'](ui.snapshot,ui.lease);expect(result.ok).toBe(false);expect(ui.paper()).toBeUndefined();expect(ui.alerts().open).toBe(false);expect(ui.lease.release).toHaveBeenCalledOnce();expect(ui.bridge.saveWorkspace).not.toHaveBeenCalled();expect(ui.bridge.executeScript).not.toHaveBeenCalled();
 expect(text(ui.render())).toContain('Clicked price');
});

it('a declared source revision correction invalidates the seeded request without ordinary fallback',async()=>{
 const ui=await setup();await ui.grid().contextActions['price-alert'](ui.snapshot,ui.lease);const old=ui.alerts();
 // App's selected dataset is distinct from its independently generated universe fixture.
 // Correct the actual supplied owner, not the unrelated same-symbol universe object.
 old.dataset.provenance.revision='2';expect(()=>old.assertContextCurrent(old.contextRequest,'use')).toThrow();
 old.onContextComplete(old.contextRequest,'cancelled');expect(ui.lease.release).toHaveBeenCalledOnce();
 const request=ui.grid().contextActions['price-alert'](ui.snapshot,ui.lease);expect((await request).ok).toBe(false);expect(ui.alerts().open).toBe(false);
});
