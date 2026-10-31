import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {ChartContextMenu} from '../../src/ui/ChartContextMenu';
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

// (Alerts receipt 20261017T073653658Z step chart-context-menu-seeds-exact-clicked-price: a
// right-click on the chart right after closing the alert dialog opened no menu within 4 s). Root cause: the cell's
// beforeOpen (src/ui/MultiChartGrid.tsx, contextOwner) refuses while analysisActive, which is true for ANY chart-tree hold
// including the routine background autosave (syncHolds: analysisActive=!!owners.tree||owners.analysis), so a right-click
// landing inside an autosave was refused ("Context target is not ready...") and never opened. Fix: the panel defers a
// right-click refused only by a background hold (contextOwner.afterHold, wired by the grid; diff in
// and opens it, with every check again, when the hold ends. Actual ChartPanel handlers under
// a hook model; no DOM, GUI or package claim.
function setup(){const dataset=fixtureDataset('GME',3),bars=dataset.bars,source=sourceContextForDataset(dataset,bars),ready=vi.fn();
 const capture=vi.fn((request:any)=>({request}));
 hooks.chart={applyAppearance(){},setStyle:()=>({ok:true}),ready:async()=>{},resize(){},setExecutionIdentity(){},getExecutionIdentity:()=>'ordinary',isInputCurrent:()=>true,setBars:vi.fn(async()=>({ok:true})),waitForAnalysisCalculations:()=>Promise.resolve(),contextMenu:{capture,retire(){}}};
 // The grid's hold state: a background tree hold (the routine autosave) refuses beforeOpen; waiters run when it ends.
 const hold={background:false,blocking:false,waiters:[] as Array<()=>void>,superseded:[] as Array<()=>void>};
 const contextOwner:any={cellId:'cell',treeOwner:{},instrument:dataset.instrument,executionIdentity:'ordinary',beforeOpen:()=>!hold.background&&!hold.blocking,ownerCurrent:()=>true,
  afterHold:(retry:()=>void,supersede?:()=>void)=>{if(!hold.background||hold.blocking)return null;hold.waiters.push(retry);if(supersede)hold.superseded.push(supersede);return()=>{const i=hold.waiters.indexOf(retry);if(i>=0)hold.waiters.splice(i,1);};}};
 const props:any={bars,source,appearance:defaultTheme.appearance,style:'candles',onReady:ready,contextActions:{},contextOwner};
 const render=()=>{hooks.cursor=0;return ChartPanel(props);},flush=()=>{for(const effect of hooks.effects.splice(0))effect();};
 const rightClick=()=>{const tree=render();find(tree,node=>node.props.className==='chart-canvas').ref.current={contains:()=>true};tree.props.onContextMenu({defaultPrevented:false,target:{},preventDefault(){},clientX:40,clientY:50});};
 const menu=()=>find(render(),node=>node.type===ChartContextMenu);
 const error=()=>{const node=find(render(),node=>node.type==='output'&&node.props.role==='alert');return node?String(node.props.children):'';};
 const end=()=>{hold.background=false;hold.blocking=false;for(const run of hold.waiters.splice(0))run();};
 return{props,render,flush,rightClick,menu,error,hold,end,capture,contextOwner,panelTree:render};
}
const ready=async()=>{const f=setup();f.render();f.flush();await drain();expect(f.render().props['aria-busy']).toBe(false);return f;};
it('a right-click during the routine autosave hold opens the menu at the clicked point once the hold ends',async()=>{
 const f=await ready();
 f.hold.background=true;
 f.rightClick();
 expect(f.menu(),'not opened inside the hold').toBeNull();
 expect(f.error(),'no refusal is shown for a deferred open').toBe('');
 f.end();
 expect(f.menu(),'opens when the hold ends').not.toBeNull();
 expect(f.capture).toHaveBeenCalledOnce();expect(f.capture.mock.calls[0][0].client).toEqual({x:40,y:50});
});
it('outside a hold the menu opens at once; a blocking hold still refuses visibly and defers nothing',async()=>{
 const f=await ready();
 f.rightClick();expect(f.menu()).not.toBeNull();
 const g=await ready();
 g.hold.blocking=true;g.rightClick();
 expect(g.menu()).toBeNull();expect(g.error()).toContain('Context target is not ready');
 g.end();expect(g.menu(),'a blocking refusal is not replayed').toBeNull();expect(g.capture).not.toHaveBeenCalled();
});
it('a deferred open is cancelled by a newer right-click and by an input change',async()=>{
 const f=await ready();
 f.hold.background=true;f.rightClick();f.rightClick();
 expect(f.hold.waiters).toHaveLength(1);
 f.props.style='line';f.render();f.flush();
 expect(f.hold.waiters,'the input change cancels the deferred open').toHaveLength(0);
 f.end();expect(f.capture).not.toHaveBeenCalled();
});

// BLR-1/4/5 and the BLR-3 token: a deferred open never opens at a stale position, is bounded, defers only a
// background-hold refusal, and a retry whose deferral was cancelled or replaced between the grid's copy and its microtask
// does nothing.
function fakeDom(){const doc=new EventTarget(),win=new EventTarget();vi.stubGlobal('document',doc);vi.stubGlobal('window',win);return{doc,win,key:(key:string)=>Object.assign(new Event('keydown'),{key})};}
const cancels:Array<[string,(d:ReturnType<typeof fakeDom>,f:Awaited<ReturnType<typeof ready>>)=>void]>=[
 ['a click elsewhere',d=>{d.doc.dispatchEvent(new Event('pointerdown'));}],
 ['Escape',d=>{d.doc.dispatchEvent(d.key('Escape'));}],
 ['window blur',d=>{d.win.dispatchEvent(new Event('blur'));}],
 ['scroll',d=>{d.doc.dispatchEvent(new Event('scroll'));}],
 ['resize',d=>{d.win.dispatchEvent(new Event('resize'));}],
 ['panel blur',(_d,f)=>{f.panelTree().props.onBlur({});}],
];
for(const [name,cancel] of cancels)it('BLR-1: '+name+' cancels a deferred open; it never opens late at the old position',async()=>{
 const d=fakeDom(),f=await ready();
 f.hold.background=true;f.rightClick();expect(f.hold.waiters).toHaveLength(1);
 cancel(d,f);
 expect(f.hold.waiters,'the grid waiter is released').toHaveLength(0);
 f.end();expect(f.menu()).toBeNull();expect(f.capture).not.toHaveBeenCalled();expect(f.error()).toBe('');
});
it('BLR-1: other keys do not cancel; a new right-click replaces the deferral',async()=>{
 const d=fakeDom(),f=await ready();
 f.hold.background=true;f.rightClick();d.doc.dispatchEvent(d.key('Shift'));expect(f.hold.waiters).toHaveLength(1);
 f.end();expect(f.menu()).not.toBeNull();
});
it('BLR-4: a hold that does not end within 10 s ends in a visible refusal',async()=>{
 fakeDom();const f=await ready();vi.useFakeTimers();try{
  f.hold.background=true;f.rightClick();
  vi.advanceTimersByTime(9999);expect(f.error()).toBe('');expect(f.hold.waiters).toHaveLength(1);
  vi.advanceTimersByTime(2);expect(f.error()).toContain('still saving');expect(f.error(),'neutral wording: the open may come from the keyboard').not.toMatch(/right-click/i);expect(f.error()).not.toMatch(/—/);
  expect(f.hold.waiters,'the waiter is released').toHaveLength(0);
  f.end();expect(f.capture).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
});
it('BLR-4: the timer is cleared when the hold ends in time',async()=>{
 fakeDom();const f=await ready();vi.useFakeTimers();try{
  f.hold.background=true;f.rightClick();f.end();expect(f.menu()).not.toBeNull();
  vi.advanceTimersByTime(20000);expect(f.error()).toBe('');
 }finally{vi.useRealTimers();}
});
it('BLR-5: only a refusal caused by the hold is deferred; a stale owner refuses at once',async()=>{
 fakeDom();const f=await ready();
 f.hold.background=true;f.contextOwner.beforeOpen=()=>true;f.contextOwner.ownerCurrent=()=>false;
 f.rightClick();
 expect(f.error()).toContain('Context target is not ready');expect(f.hold.waiters).toHaveLength(0);
 f.end();expect(f.capture).not.toHaveBeenCalled();
});
it('BLR-3: a retry whose deferral was cancelled after the grid copied it does nothing',async()=>{
 fakeDom();const f=await ready();
 f.hold.background=true;f.rightClick();
 const copied=[...f.hold.waiters];
 f.props.style='line';f.render();f.flush();// input change cancels the deferral
 f.hold.background=false;for(const run of copied)run();
 expect(f.capture).not.toHaveBeenCalled();expect(f.menu()).toBeNull();
});
it('BLR-3: a retry of a replaced deferral does nothing; unmount between copy and run does nothing',async()=>{
 fakeDom();const f=await ready();
 f.hold.background=true;f.rightClick();const first=[...f.hold.waiters];
 f.rightClick();
 f.hold.background=false;for(const run of first)run();
 expect(f.capture,'the older retry is stale').not.toHaveBeenCalled();
 f.hold.background=true;f.rightClick();const copied=[...f.hold.waiters];
 for(const cell of [...hooks.cells].reverse())cell?.off?.();// unmount
 f.hold.background=false;for(const run of copied)run();
 expect(f.capture).not.toHaveBeenCalled();
});
it('BLR-2: a superseded deferral is cancelled by the grid through supersede',async()=>{
 fakeDom();const f=await ready();
 f.hold.background=true;f.rightClick();expect(f.hold.superseded).toHaveLength(1);
 f.hold.superseded[0]();// the grid registered a newer waiter
 f.hold.waiters.splice(0);f.end();expect(f.capture).not.toHaveBeenCalled();expect(f.error()).toBe('');
});
it('BLR-10: a blur that moves focus to a child inside the panel does not cancel the pending open; one leaving the panel does',async()=>{
 fakeDom();const f=await ready();
 f.hold.background=true;f.rightClick();
 const inside={};const tree=f.panelTree();find(tree,node=>node.props.className==='chart-canvas').ref.current={contains:()=>true};
 const panelEl=f.props.panelEl={contains:(node:any)=>node===inside};
 const panelNode=find(f.panelTree(),node=>node.props['data-testid']==='chart-panel');panelNode.ref.current=panelEl;
 panelNode.props.onBlur({relatedTarget:inside});
 expect(f.hold.waiters,'focus moved inside the panel').toHaveLength(1);
 panelNode.props.onBlur({relatedTarget:{}});
 expect(f.hold.waiters,'focus left the panel').toHaveLength(0);
});
