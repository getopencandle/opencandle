// Chart panel right-click: harness shared with bugfix-l-chart-context-menu.test.ts (ChartPanel under a hook model).
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ChartPanel,CONTEXT_MENU_INPUT_WAIT_MS,CONTEXT_MENU_LOADING_TEXT,CONTEXT_MENU_NOTICE_STYLE} from '../../src/ui/ChartPanel';
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

// Right-click while the chart input is still being written: the open waits for the write instead of being refused,
// and a refusal is shown above the canvas instead of under it.
it('a right-click during an input write opens once the write commits',async()=>{
 const f=setup();f.render();f.flush();
 expect(f.render().props['aria-busy']).toBe(true);
 f.rightClick();
 expect(f.menu(),'not opened while the write is in flight').toBeNull();
 expect(f.error(),'no refusal while waiting').toBe('');
 await drain();f.render();f.flush();f.render();f.flush();
 expect(f.menu(),'opens after the commit').not.toBeNull();
 expect(f.capture).toHaveBeenCalledOnce();expect(f.capture.mock.calls[0][0].client).toEqual({x:40,y:50});
});
it('a wait that outlasts CONTEXT_MENU_INPUT_WAIT_MS gives up with a visible message',async()=>{
 vi.useFakeTimers();
 try{
  const f=setup();hooks.chart.setBars=vi.fn(()=>new Promise(()=>{}));f.render();f.flush();
  f.rightClick();expect(f.menu()).toBeNull();
  vi.advanceTimersByTime(CONTEXT_MENU_INPUT_WAIT_MS+1);
  expect(f.error()).toBe(CONTEXT_MENU_LOADING_TEXT);
 }finally{vi.useRealTimers();}
});
it('the refusal notice is positioned above the canvas and marked so a right-click on it is ignored',async()=>{
 const f=await ready();
 f.hold.blocking=true;f.rightClick();
 const node=find(f.render(),item=>item.type==='output'&&item.props.role==='alert');
 expect(node.props.style).toMatchObject({position:'absolute',zIndex:20,pointerEvents:'none'});
 expect(node.props['data-lv-chart-menu-notice']).toBe('');
 expect(CONTEXT_MENU_NOTICE_STYLE.zIndex).toBeGreaterThan(10);
});
it('a right-click outside the canvas element (the loading or error box) is still the chart menu',async()=>{
 const f=await ready();
 const tree=f.render();
 tree.props.onContextMenu({defaultPrevented:false,target:{closest:()=>null},preventDefault(){},clientX:5,clientY:6});
 expect(f.menu()).not.toBeNull();
 const g=await ready();
 g.render().props.onContextMenu({defaultPrevented:false,target:{closest:(selector:string)=>selector.includes('data-lv-context-menu')?{}:null},preventDefault(){},clientX:5,clientY:6});
 expect(g.menu(),'a right-click inside the open menu is left to the menu').toBeNull();
});
