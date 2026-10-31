import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {sameBarsInput,stampLiveLineage} from '../../src/chart/bar-input-identity';
import {defaultTheme} from '../../src/ui/themes';
import type {Bar,BarDataset} from '../../src/domain/types';

// Same hook harness as chart-panel-execution.test.ts: the actual ChartPanel body with a controlled chart controller.
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

function liveSnapshot(base:BarDataset,bars:Bar[],seq:number):BarDataset{stampLiveLineage(bars,'live:alpaca-iex:SYNTH:1m|live-v1:s:1',seq);return{...base,bars};}
it('SYNTHETIC 4 Hz live growth keeps the canvas visible, writes every snapshot and never closes the context menu',async()=>{
 const demo=fixtureDataset('GME',50),base:BarDataset={...demo,resolution:'1m',provenance:{...demo.provenance,fixture:false,providerId:'alpaca-iex',datasetId:'live:alpaca-iex:SYNTH:1m',revision:'live-v1:s:1',coverage:'SYNTHETIC'}};
 let snapshot=liveSnapshot(base,[...demo.bars],1),applied:readonly Bar[]=[];const writes:number[]=[],retired=vi.fn();
 hooks.chart={applyAppearance(){},setStyle:()=>({ok:true}),ready:async()=>{},resize(){},setExecutionIdentity(){},getExecutionIdentity:()=>'ordinary',
  isInputCurrent:(input:{bars:readonly Bar[]})=>sameBarsInput(input.bars,applied),isInputExact:(input:{bars:readonly Bar[]})=>input.bars===applied,
  setBars:vi.fn(async(bars:readonly Bar[])=>{applied=bars;writes.push(bars.length);return{ok:true};}),waitForAnalysisCalculations:async()=>{},contextMenu:{retire:retired,capture:()=>({})},drawingPreferences:{}};
 const ready=vi.fn(),props:any={bars:snapshot.bars,source:sourceContextForDataset(snapshot),appearance:defaultTheme.appearance,style:'candles',onReady:ready};
 const render=()=>{hooks.cursor=0;return ChartPanel(props);},flush=()=>{for(const effect of hooks.effects.splice(0))effect();};
 render();flush();await drain();render();flush();expect(ready).toHaveBeenCalledTimes(1);
 const retiredAtStart=retired.mock.calls.length;
 for(let tick=0;tick<4*60;tick++){
  const last=snapshot.bars.at(-1)!,grown=tick%40===39?[...snapshot.bars,{...last,time:last.time+60}]:[...snapshot.bars.slice(0,-1),{...last,close:last.close+0.01}];
  snapshot=liveSnapshot(base,grown,tick+2);props.bars=snapshot.bars;props.source=sourceContextForDataset(snapshot);
  const tree=render();
  expect(find(tree,node=>node.props.className==='chart-canvas').props.style.visibility).toBe('visible');
  expect(find(tree,node=>node.props.role==='status')).toBeNull();
  flush();await drain();
 }
 expect(writes).toHaveLength(1+4*60);expect(applied).toBe(snapshot.bars);
 expect(retired.mock.calls.length).toBe(retiredAtStart);
});
