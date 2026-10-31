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

// live smoke (Coinbase BTC-USD, packaged app): the first write of a live source took longer than the gap between
// snapshots, every newer snapshot cancelled the in-flight write and started another, nothing ever committed and the chart
// stayed hidden behind "Updating chart source and bars..." for good. A newer snapshot of the input being written must wait
// for that write (coalesce) instead of cancelling it.
function liveSnapshot(base:BarDataset,bars:Bar[],seq:number):BarDataset{stampLiveLineage(bars,'live:coinbase:SYNTH:1D|live-v1:s:1',seq);return{...base,bars};}
it('SYNTHETIC slow first write under a steady live stream still commits and shows the chart, then writes the newest snapshot',async()=>{
 const demo=fixtureDataset('GME',50),base:BarDataset={...demo,resolution:'1D',provenance:{...demo.provenance,fixture:false,providerId:'coinbase',datasetId:'live:coinbase:SYNTH:1D',revision:'live-v1:s:1',coverage:'SYNTHETIC'}};
 let snapshot=liveSnapshot(base,[...demo.bars],1),applied:readonly Bar[]|null=null,pending=0;const resolvers:(()=>void)[]=[];
 hooks.chart={applyAppearance(){},setStyle:()=>({ok:true}),ready:async()=>{},resize(){},setExecutionIdentity(){},getExecutionIdentity:()=>'ordinary',
  isInputCurrent:(input:{bars:readonly Bar[]})=>pending===0&&sameBarsInput(input.bars,applied),isInputExact:(input:{bars:readonly Bar[]})=>pending===0&&input.bars===applied,
  setBars:vi.fn((bars:readonly Bar[])=>new Promise(resolve=>{pending++;resolvers.push(()=>{applied=bars;pending--;resolve({ok:true});});})),
  waitForAnalysisCalculations:async()=>{},contextMenu:{retire(){},capture:()=>({})},drawingPreferences:{}};
 const ready=vi.fn(),props:any={bars:snapshot.bars,source:sourceContextForDataset(snapshot),appearance:defaultTheme.appearance,style:'candles',onReady:ready};
 const render=()=>{hooks.cursor=0;return ChartPanel(props);},flush=()=>{for(const effect of hooks.effects.splice(0))effect();};
 const visible=(tree:any)=>find(tree,node=>node.props.className==='chart-canvas').props.style.visibility==='visible';
 render();flush();await drain();
 let shownAt=-1;
 for(let tick=0;tick<20;tick++){
  const last=snapshot.bars.at(-1)!;snapshot=liveSnapshot(base,[...snapshot.bars.slice(0,-1),{...last,close:last.close+0.01}],tick+2);
  props.bars=snapshot.bars;props.source=sourceContextForDataset(snapshot);
  const started=resolvers.length;render();flush();await drain();
  // Each write finishes only after the next snapshot has arrived (write slower than the stream).
  for(const finish of resolvers.splice(0,started))finish();
  await drain();render();flush();await drain();
  if(shownAt<0&&visible(render()))shownAt=tick;
 }
 expect(shownAt).toBeGreaterThanOrEqual(0);expect(shownAt).toBeLessThan(3);
 expect(ready).toHaveBeenCalled();
 for(let i=0;i<5&&resolvers.length;i++){for(const finish of resolvers.splice(0))finish();await drain();render();flush();await drain();}
 expect(applied).toBe(snapshot.bars);expect(visible(render())).toBe(true);
});

// live smoke diagnosis: opening a live symbol first hands the panel the not-yet-connected live shell (0 bars, already
// stamped with the feed lineage). Writing 0 bars to the renderer never settles, so the backfill (300 bars) queued behind it
// forever and the chart stayed hidden. An empty live snapshot is never written; the first non-empty one is.
it('SYNTHETIC an empty live shell snapshot is not written; the backfill snapshot commits and shows the chart',async()=>{
 const demo=fixtureDataset('GME',50),base:BarDataset={...demo,resolution:'1D',provenance:{...demo.provenance,fixture:false,providerId:'coinbase',datasetId:'live:coinbase:SYNTH:1D',revision:'live-v1:s:1',coverage:'SYNTHETIC'}};
 let applied:readonly Bar[]|null=null;const written:number[]=[];
 hooks.chart={applyAppearance(){},setStyle:()=>({ok:true}),ready:async()=>{},resize(){},setExecutionIdentity(){},getExecutionIdentity:()=>'ordinary',
  isInputCurrent:(input:{bars:readonly Bar[]})=>sameBarsInput(input.bars,applied),isInputExact:(input:{bars:readonly Bar[]})=>input.bars===applied,
  // The renderer never settles a write of zero bars.
  setBars:vi.fn((bars:readonly Bar[])=>{written.push(bars.length);return bars.length?(applied=bars,Promise.resolve({ok:true})):new Promise(()=>{});}),
  waitForAnalysisCalculations:async()=>{},contextMenu:{retire(){},capture:()=>({})},drawingPreferences:{}};
 const shell=liveSnapshot(base,[],1);
 const ready=vi.fn(),props:any={bars:shell.bars,source:sourceContextForDataset(shell),appearance:defaultTheme.appearance,style:'candles',onReady:ready};
 const render=()=>{hooks.cursor=0;return ChartPanel(props);},flush=()=>{for(const effect of hooks.effects.splice(0))effect();};
 const visible=(tree:any)=>find(tree,node=>node.props.className==='chart-canvas').props.style.visibility==='visible';
 render();flush();await drain();
 expect(visible(render())).toBe(false);
 const filled=liveSnapshot(base,[...demo.bars],2);props.bars=filled.bars;props.source=sourceContextForDataset(filled);
 render();flush();await drain();render();flush();await drain();
 expect(written).toEqual([demo.bars.length]);expect(ready).toHaveBeenCalledTimes(1);expect(visible(render())).toBe(true);
});
