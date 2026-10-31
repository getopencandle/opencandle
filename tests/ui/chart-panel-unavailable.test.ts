import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {defaultTheme} from '../../src/ui/themes';

// Actual ChartPanel body under the same synthetic hook model as
// chart-panel-execution.test.ts; createChartProbe is replaced (SYNTHETIC; no DOM
// or GUI claim). A panel whose chart never constructs reports the failure to
// its owner, the only party that can show it.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as (()=>void)[],failure:null as Error|null,ready:null as Promise<void>|null,appearanceFailure:null as Error|null,calculations:[] as Array<()=>Promise<void>>,inputs:0}));
vi.mock('../../src/chart/adapter',()=>({createChartProbe:()=>{if(hooks.failure)throw hooks.failure;let execution='ordinary';return{controller:{applyAppearance(){const failure=hooks.appearanceFailure;hooks.appearanceFailure=null;if(failure)throw failure;},setStyle:()=>({ok:true}),ready:()=>hooks.ready??Promise.resolve(),resize(){},setExecutionIdentity(next:string){hooks.inputs++;execution=next;},getExecutionIdentity:()=>execution,isInputCurrent:()=>true,setBars:async()=>({ok:true}),waitForAnalysisCalculations:()=>hooks.calculations.shift()?.()??Promise.resolve(),contextMenu:{retire(){}}},dispose(){}};}}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const n=hooks.cursor++,old=hooks.cells[n];if(!old||deps.some((value,index)=>!Object.is(value,old.deps[index])))hooks.cells[n]={deps,value:fn()};return hooks.cells[n].value;};
 const effect=(fn:()=>any,deps:any[])=>{const n=hooks.cursor++,old=hooks.cells[n];if(!old||deps.some((value,index)=>!Object.is(value,old.deps[index]))){const next={deps,off:undefined as undefined|(()=>void)};hooks.cells[n]=next;hooks.effects.push(()=>{old?.off?.();next.off=fn();});}};
 const useCallback=(fn:any,deps:any[])=>memo(()=>fn,deps);
 return{...actual,default:{...actual.default,useCallback},useCallback,useMemo:memo,useEffect:effect,useLayoutEffect:effect,useRef:(value:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]={current:value};return hooks.cells[n];},useState:(value:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]=typeof value==='function'?value():value;return[hooks.cells[n],(next:any)=>{hooks.cells[n]=typeof next==='function'?next(hooks.cells[n]):next;}];}};
});
const drain=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
function find(tree:any,predicate:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const child of tree){const result=find(child,predicate);if(result)return result;}}else if(tree?.props){if(predicate(tree))return tree;return find(tree.props.children,predicate);}return null;}
const words=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(words).join(''):node?.props?words(node.props.children):'';
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.failure=null;hooks.ready=null;hooks.appearanceFailure=null;hooks.calculations=[];hooks.inputs=0;vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});});
afterEach(()=>{for(const cell of [...hooks.cells].reverse())cell?.off?.();vi.unstubAllGlobals();});
function setup(){
 const dataset=fixtureDataset('GME',3),messages:string[]=[];
 const props:Parameters<typeof ChartPanel>[0]={bars:dataset.bars,source:sourceContextForDataset(dataset,dataset.bars),appearance:defaultTheme.appearance,style:'candles',onReady:vi.fn(),onUnavailable:(message:string)=>{messages.push(message);}};
 const render=()=>{hooks.cursor=0;return ChartPanel(props);},flush=()=>{for(const effect of hooks.effects.splice(0))effect();};
 return{messages,render,flush,ready:props.onReady,props};
}
it('ChartPanel reports a construction failure to its owner once, with the exact message',()=>{
 hooks.failure=Error('Drawing command member unavailable: drawings');
 const f=setup();f.render();f.flush();f.render();f.flush();
 expect(f.messages).toEqual(['Drawing command member unavailable: drawings']);expect(f.ready).not.toHaveBeenCalled();
 expect(words(find(f.render(),node=>node.props.role==='alert'))).toBe('Chart unavailable: Drawing command member unavailable: drawings');
});
it('a constructed chart never reports unavailable through the creation channel',async()=>{
 hooks.ready=Promise.resolve();
 const f=setup();f.render();f.flush();await drain();
 expect(f.messages).toEqual([]);
});
it('a rejected first readiness is reported once and is terminal: no later input acceptance or onReady',async()=>{
 hooks.ready=Promise.reject(Error('SYNTHETIC first paint failed'));hooks.ready.catch(()=>{});
 const f=setup();f.render();f.flush();await drain();
 expect(f.messages).toEqual(['Error: SYNTHETIC first paint failed']);expect(f.ready).not.toHaveBeenCalled();
 expect(words(find(f.render(),node=>node.props.role==='alert'))).toBe('Chart unavailable: SYNTHETIC first paint failed');
 const attempts=hooks.inputs;f.props.style='line';f.render();f.flush();await drain();
 expect(hooks.inputs).toBe(attempts);expect(f.ready).not.toHaveBeenCalled();expect(f.messages).toHaveLength(1);
 expect(words(find(f.render(),node=>node.props.role==='alert'))).toBe('Chart unavailable: SYNTHETIC first paint failed');
});
it('a rejected first input acceptance is reported; a later accepted input still reaches onReady',async()=>{
 hooks.calculations.push(()=>Promise.reject(Error('SYNTHETIC calculations failed')));
 const f=setup();f.render();f.flush();await drain();
 expect(f.messages).toEqual(['Error: SYNTHETIC calculations failed']);expect(f.ready).not.toHaveBeenCalled();
 f.props.style='line';f.render();f.flush();await drain();
 expect(f.ready).toHaveBeenCalledTimes(1);expect(f.messages).toHaveLength(1);
});
it('an appearance failure after a successful build is reported but not terminal: the first accepted input still calls onReady',async()=>{
 hooks.appearanceFailure=Error('SYNTHETIC appearance failed');
 const f=setup();f.render();f.flush();await drain();
 expect(f.messages).toEqual(['SYNTHETIC appearance failed']);expect(f.ready).toHaveBeenCalledTimes(1);
});
it('a failure after the first accepted input is not reported through the creation channel',async()=>{
 const f=setup();f.render();f.flush();await drain();expect(f.ready).toHaveBeenCalledTimes(1);
 hooks.calculations.push(()=>Promise.reject(Error('SYNTHETIC later calculations failed')));
 f.props.style='line';f.render();f.flush();await drain();
 expect(f.messages).toEqual([]);expect(words(find(f.render(),node=>node.props.role==='alert'))).toBe('Chart unavailable: SYNTHETIC later calculations failed');
});
