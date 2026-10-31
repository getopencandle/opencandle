import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createLayoutLibrary} from '../../src/ui/layout-library';
import {projectGrid} from '../../src/ui/workspace-grid';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {createPaperAccount} from '../../src/domain/paper';
import {csvRows} from '../../src/domain/data';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {csvModelFixture} from '../fixtures/r42-csv-model';

// Actual App closures with controlled React hooks. No DOM/native dialog or executable UI claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const memo=(fn:()=>any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))hooks.cells[i]={deps,value:fn()};return hooks.cells[i].value;};return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return [hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old[j]))){hooks.cells[i]=deps;hooks.effects.push(fn);}}};});
const cleanups:Array<()=>void>=[];
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>{for(const dispose of cleanups.splice(0).reverse())dispose();vi.unstubAllGlobals();});
function find(node:any,test:(value:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
async function setup(){
 const seed=csvModelFixture(),data=structuredClone(seed.data);seed.dispose();data.provenance.datasetId='local:synthetic-csv-app';
 const initial=createInitialWorkspace(),id=initial.grid!.layout.activeCellId,grid=structuredClone(initial.grid!),defaults=factoryIndicatorDefault('sma');grid.cells[id]={...grid.cells[id],datasetId:data.provenance.datasetId,style:'heikinashi',indicators:[{id:'synthetic-csv-study',kind:'sma',...defaults,inputs:{...defaults.inputs,length:2},paneId:'price'}]};
 const workspace=projectGrid({...initial,imports:[data],layoutLibrary:createLayoutLibrary(grid)},grid),saved=prepareWorkspaceJSON({...workspace,paper:createPaperAccount(),alerts:[]});
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision:1,savedAt:'2026-10-23T00:00:00Z',data:saved,storage:{directory:'Synthetic CSV harness',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async(input:any)=>({ok:true,value:{revision:input.expectedRevision+1,savedAt:'2026-10-23T00:00:01Z'}})),exportData:vi.fn(async(_input:any)=>({ok:true,value:{}})),executeScript:vi.fn()};
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});const render=()=>{hooks.cursor=0;return App();};render();const boot=hooks.effects[0];hooks.effects=[];const unmount=boot();if(typeof unmount==='function')cleanups.push(unmount as ()=>void);await flush();
 const chartHost=()=>find(render(),node=>node.type===WorkspaceChartHost).props,opening=chartHost(),dataset=opening.datasets.find((row:any)=>row.provenance.datasetId===opening.activeDatasetId),native=csvModelFixture(dataset,opening.activeBars,'heikinashi');cleanups.push(()=>native.dispose());
 const series=native.line('SMA',[null,12,13],opening.activeBars.map((row:any)=>row.time)),model=native.add(0,'SMA',[series],{id:'synthetic-csv-study'});opening.onReady(native.chart);
 const target=()=>{const current=chartHost(),snapshot={token:{},treeOwner:{},cellId:current.state.layout.activeCellId,controller:native.chart,instrument:{...dataset.instrument},input:{bars:current.activeBars,source:sourceContextForDataset(dataset,current.activeBars),style:'heikinashi'},executionIdentity:current.activeExecutionIdentity,entity:{kind:'chart'},client:null,local:null,point:{price:12,logical:1,barIndex:1,barTime:current.activeBars[1].time,unit:'price',pane:{kind:'price'}}};let live=true;const release=vi.fn(()=>{live=false;}),lease={snapshot,isCurrent:()=>live,isOwnerCurrent:()=>live,release};return {current,snapshot,lease};};
 return {bridge,render,chartHost,native,series,model,target};
}
it('actual context CSV includes accepted study values and the exact source prefix',async()=>{
 const ui=await setup(),target=ui.target();await expect(target.current.contextActions['source-csv'](target.snapshot,target.lease)).resolves.toMatchObject({ok:true});
 expect(ui.bridge.exportData).toHaveBeenCalledOnce();const rows=csvRows(ui.bridge.exportData.mock.calls[0][0].text);expect(rows).toHaveLength(4);expect(rows[0]).toHaveLength(21);expect(rows[0].at(-1)).toBe('Simple Moving Average: SMA');expect(rows.slice(1).map(row=>row.at(-1))).toEqual(['','12','13']);expect(target.lease.release).toHaveBeenCalledOnce();
});
it('actual Export bars command uses the same accepted graph capture',async()=>{
 const ui=await setup(),button=find(ui.render(),node=>node.type==='button'&&text(node)==='Export bars');expect(button).toBeTruthy();button.props.onClick();await flush();expect(ui.bridge.exportData).toHaveBeenCalledOnce();expect(csvRows(ui.bridge.exportData.mock.calls[0][0].text)[0].at(-1)).toBe('Simple Moving Average: SMA');
});
it('an already captured immutable CSV can finish without publishing status through a retired chart owner',async()=>{
 const ui=await setup(),target=ui.target();let resolve!:(value:any)=>void;ui.bridge.exportData.mockImplementation(()=>new Promise(yes=>{resolve=yes;}));const pending=target.current.contextActions['source-csv'](target.snapshot,target.lease);expect(ui.bridge.exportData).toHaveBeenCalledOnce();
 const captured=ui.bridge.exportData.mock.calls[0][0].text;ui.chartHost().onReady({});resolve({ok:true,value:{}});await expect(pending).resolves.toEqual({ok:true});expect(ui.bridge.exportData.mock.calls[0][0].text).toBe(captured);expect(text(ui.render())).not.toContain('Selected chart source bars exported locally');expect(target.lease.release).toHaveBeenCalledOnce();
});
it('an expected but missing accepted model prevents desktop CSV transport',async()=>{
 const ui=await setup(),target=ui.target();ui.native.records.delete(ui.model.rendererId);await expect(target.current.contextActions['source-csv'](target.snapshot,target.lease)).resolves.toMatchObject({ok:false});expect(ui.bridge.exportData).not.toHaveBeenCalled();expect(target.lease.release).toHaveBeenCalledOnce();
});
