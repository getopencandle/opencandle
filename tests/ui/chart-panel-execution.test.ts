import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {defaultTheme} from '../../src/ui/themes';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as (()=>void)[],chart:null as any,dispose:vi.fn()}));
vi.mock('../../src/chart/adapter',()=>({createChartProbe:()=>({controller:hooks.chart,dispose:hooks.dispose})}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const n=hooks.cursor++,old=hooks.cells[n];if(!old||deps.some((value,index)=>!Object.is(value,old.deps[index])))hooks.cells[n]={deps,value:fn()};return hooks.cells[n].value;};
 const effect=(fn:()=>any,deps:any[])=>{const n=hooks.cursor++,old=hooks.cells[n];if(!old||deps.some((value,index)=>!Object.is(value,old.deps[index]))){const next={deps,off:undefined as undefined|(()=>void)};hooks.cells[n]=next;hooks.effects.push(()=>{old?.off?.();next.off=fn();});}};
 const useCallback=(fn:any,deps:any[])=>memo(()=>fn,deps);
 return{...actual,default:{...actual.default,useCallback},useCallback,useMemo:memo,useEffect:effect,useLayoutEffect:effect,useRef:(value:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]={current:value};return hooks.cells[n];},useState:(value:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]=typeof value==='function'?value():value;return[hooks.cells[n],(next:any)=>{hooks.cells[n]=typeof next==='function'?next(hooks.cells[n]):next;}];}};
});
const drain=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
function find(tree:any,predicate:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const child of tree){const result=find(child,predicate);if(result)return result;}}else if(tree?.props){if(predicate(tree))return tree;return find(tree.props.children,predicate);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.dispose.mockClear();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});});
afterEach(()=>{for(const cell of [...hooks.cells].reverse())cell?.off?.();vi.unstubAllGlobals();});
function setup(){const dataset=fixtureDataset('GME',3),bars=dataset.bars,source=sourceContextForDataset(dataset,bars),ready=vi.fn();let execution='ordinary';
 const waiting=new Map<string,{promise:Promise<void>;resolve():void;reject(error:Error):void}>(),retirements:string[]=[];
 hooks.chart={applyAppearance(){},setStyle:()=>({ok:true}),ready:async()=>{},resize(){},setExecutionIdentity(next:string){if(execution!==next)retirements.push(next);execution=next;},getExecutionIdentity:()=>execution,isInputCurrent:()=>true,setBars:vi.fn(async()=>({ok:true})),waitForAnalysisCalculations:()=>waiting.get(execution)?.promise??Promise.resolve(),contextMenu:{retire(){}}};
 const props={bars,source,appearance:defaultTheme.appearance,style:'candles',onReady:ready,contextOwner:{cellId:'cell',treeOwner:{},instrument:dataset.instrument,executionIdentity:'ordinary',beforeOpen:()=>true,ownerCurrent:()=>true}};
 const render=()=>{hooks.cursor=0;return ChartPanel(props);},flush=()=>{for(const effect of hooks.effects.splice(0))effect();};
 const wait=(run:string)=>{let resolve!:()=>void,reject!:(e:Error)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});waiting.set(run,{promise,resolve,reject});return{resolve,reject};};
 return{props,render,flush,wait,ready,retirements};
}
it('actual ChartPanel hides unchanged bars for a new replay owner and waits before tagging readiness',async()=>{
 const f=setup();f.render();f.flush();await drain();expect(f.ready).toHaveBeenCalledTimes(1);expect(f.render().props['aria-busy']).toBe(false);
 const pending=f.wait('replay:2');f.props.contextOwner={...f.props.contextOwner,executionIdentity:'replay:2'};const opening=f.render();expect(opening.props['aria-busy']).toBe(true);expect(find(opening,node=>node.props.className==='chart-canvas').props.style.visibility).toBe('hidden');f.flush();await drain();expect(f.ready).toHaveBeenCalledTimes(1);expect(f.retirements).toEqual(['replay:2']);pending.resolve();await drain();expect(f.ready).toHaveBeenCalledTimes(2);expect(f.render().props['aria-busy']).toBe(false);expect(hooks.chart.setBars).not.toHaveBeenCalled();
});
it('a retired pending effect cannot overwrite a newer same-prefix execution readiness',async()=>{
 const f=setup();f.render();f.flush();await drain();const old=f.wait('replay:old');f.props.contextOwner={...f.props.contextOwner,executionIdentity:'replay:old'};f.render();f.flush();await drain();f.props.contextOwner={...f.props.contextOwner,executionIdentity:'replay:new'};f.render();f.flush();await drain();expect(f.ready).toHaveBeenCalledTimes(2);old.resolve();await drain();expect(f.ready).toHaveBeenCalledTimes(2);expect(f.render().props['aria-busy']).toBe(false);
});
it('unconfirmed calculation publication shows an error and never invokes the ready callback',async()=>{
 const f=setup(),pending=f.wait('ordinary');f.render();f.flush();await drain();pending.reject(Error('Native calculation publication unconfirmed'));await drain();expect(f.ready).not.toHaveBeenCalled();const alert=find(f.render(),node=>node.props.role==='alert');expect(alert).not.toBeNull();expect(JSON.stringify(alert.props.children)).toContain('unconfirmed');
});
