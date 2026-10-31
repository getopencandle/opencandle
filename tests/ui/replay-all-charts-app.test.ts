import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {ChartTypeMenu} from '../../src/ui/ChartTypeMenu';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {ReplayPanel} from '../../src/ui/ReplayPanel';
import {resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {transitionDrawingScope} from '../../src/ui/drawing-scopes';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {HELD_KEY_BLOCKING} from '../../src/ui/held-key-gate';
// Bar Replay on All charts in the actual App. Harness copied from
// tests/ui/wire-fix-replay-app.test.ts (controlled hook store, SYNTHETIC chart stubs). No DOM, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const cells=hooks.cells,index=hooks.cursor++,old=cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))cells[index]={deps,value:fn()};return cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const cells=hooks.cells,index=hooks.cursor++;if(!(index in cells))cells[index]=typeof initial==='function'?initial():initial;return[cells[index],(value:any)=>{cells[index]=typeof value==='function'?value(cells[index]):value;}];},useRef:(initial:any)=>{const cells=hooks.cells,index=hooks.cursor++;if(!(index in cells))cells[index]={current:initial};return cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const cells=hooks.cells,index=hooks.cursor++,old=cells[index];if(!old||!deps||deps.some((v,i)=>!Object.is(v,old[i]))){cells[index]=deps??[];hooks.effects.push(fn);}}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(yes=>resolve=yes);return{resolve,promise};};
const port=()=>({suspend:vi.fn((_expected:unknown,_options?:unknown)=>({isCurrent:()=>true,resume:vi.fn()}))});

async function setup(){
 let revision=4;const initial=createInitialWorkspace(),coordinator=port();
 const data=prepareWorkspaceJSON({...initial,paper:createPaperAccount({initialBalance:500}),alerts:[]});
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-17T00:00:00Z',data,storage:{directory:'Synthetic wire-fix profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:++revision,savedAt:'2026-10-17T00:00:01Z'}})),onFlushRequest:vi.fn((_handler:()=>Promise<unknown>)=>vi.fn())};
 const win={lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()};vi.stubGlobal('window',win);
 vi.stubGlobal('document',{querySelector:()=>null,getElementById:()=>null,visibilityState:'visible',activeElement:null});
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady(coordinator);render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports are irrelevant here */}
 const effects=()=>{render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 const button=(name:string)=>{const found=find(render(),node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name));if(!found)throw Error('Missing control '+name);return found;};
 const panel=()=>find(render(),node=>node.type===ReplayPanel)?.props??null;
 const replayButton=()=>find(render(),node=>node.type==='button'&&node.props['aria-label']==='Replay');
 const shown=()=>text(render());
 const listener=(type:string)=>win.addEventListener.mock.calls.filter((call:any[])=>call[0]===type).at(-1)?.[1] as ((event?:unknown)=>void);
 const change=(background:string)=>{const next=structuredClone(grid().state);next.cells[next.layout.activeCellId].appearance.background=background;expect(grid().onChange(next)).toBe(true);render();};
 // Settle the first post-load autosave so the next save is the one under test.
 effects();await vi.advanceTimersByTimeAsync(1300);await flush();effects();bridge.saveWorkspace.mockClear();coordinator.suspend.mockClear();
 return{bridge,render,grid,button,panel,replayButton,shown,listener,change,effects};
}
type UI=Awaited<ReturnType<typeof setup>>;
/** RPST start selection: click Replay, then click the chart tree over bar `index` (stub data window), then release the stub chart. */
function startReplay(ui:UI,index=100){
 ui.replayButton().props.onClick();const grid=ui.grid(),bars=grid.activeBars,data=grid.datasets.find((row:any)=>row.provenance.datasetId===grid.activeDatasetId);
 grid.onReady({drawings:{getMode:()=>null,getTool:()=>null},getStyle:()=>grid.state.cells[grid.state.layout.activeCellId].style,sourceContext:()=>sourceContextForDataset(data,bars),getDataWindow:()=>({standard:{hovered:true,bar:bars[Math.min(index,bars.length-1)]}})});
 find(ui.render(),(node:any)=>node.props?.className==='chart-workspace').props.onClickCapture({target:{closest:(selector:string)=>selector==='[data-chart-tree]'?{}:null},preventDefault(){},stopPropagation(){}});
 ui.grid().onReady(null);ui.render();
}
/** A second chart cell on the same synthetic GME source, so a focus change keeps the dataset. */
function twoCells(ui:UI){
 const initial=ui.grid(),multi=resizeMultiChartState(initial.state,'two-columns'),target=multi.layout.cells[1],gme=initial.datasets.find((row:any)=>row.instrument.symbol==='GME');
 const opening=initial.datasets.find((row:any)=>row.provenance.datasetId===multi.cells[target.id].datasetId);target.symbol='GME';target.interval=gme.resolution;multi.cells[target.id]=transitionDrawingScope({...multi.cells[target.id],datasetId:gme.provenance.datasetId},opening,gme);
 expect(initial.onChange(multi)).toBe(true);ui.render();return target.id as string;
}
const key=(name:string)=>({key:name,shiftKey:true,ctrlKey:false,altKey:false,metaKey:false,isComposing:false,target:{closest:(selector:string)=>selector==='.chart-workspace'?{}:null},preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.useFakeTimers({toFake:['setTimeout','clearTimeout','setInterval','clearInterval','Date']});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

/** Time sync on for the layout (the trigger for starting on All charts). */
function timeSync(ui:UI,on:boolean){const state=ui.grid().state;expect(ui.grid().onChange({...state,layout:{...state.layout,sync:{...state.layout.sync,time:on}}})).toBe(true);ui.render();}
const lastTime=(bars:any[])=>bars.at(-1)?.time;

it('with Time sync on, a replay runs on All charts; every chart shows bars up to the one clock and Forward moves all of them',async()=>{
 const ui=await setup(),other=twoCells(ui);timeSync(ui,true);startReplay(ui);
 const panel=ui.panel()!;expect(panel.multiChart).toBe(true);expect(panel.session.scope).toBe('all');expect(panel.session.participants).toHaveLength(2);
 const clock=panel.session.clock,cells=ui.grid().replayCellBars;expect(Object.keys(cells)).toEqual([other]);
 expect(cells[other].length).toBe(ui.grid().activeBars.length);expect(lastTime(cells[other])).toBe(lastTime(ui.grid().activeBars));
 const full=ui.grid().datasets.find((row:any)=>row.provenance.datasetId===ui.grid().activeDatasetId);expect(cells[other].length).toBeLessThan(full.bars.length);
 ui.panel()!.onStep();ui.effects();
 expect(ui.panel()!.session.clock).toBeGreaterThan(clock);expect(ui.grid().replayCellBars[other].length).toBe(cells[other].length+1);
 ui.panel()!.onStepBack();ui.effects();expect(ui.grid().replayCellBars[other].length).toBe(cells[other].length);
 // Jump to real time: every chart returns to its current data.
 ui.panel()!.onRealtime();ui.effects();expect(ui.grid().replayCellBars).toBeUndefined();
});
it('selecting the other chart keeps the All charts run and its replay account; the first chart keeps its replay frame',async()=>{
 const ui=await setup(),other=twoCells(ui);timeSync(ui,true);startReplay(ui);
 const before=ui.grid(),first=before.state.layout.activeCellId,run=ui.panel()!.session.runId,identity=before.activeExecutionIdentity;expect(identity).not.toBe('ordinary');
 expect(before.onChange({...before.state,layout:{...before.state.layout,activeCellId:other}})).toBe(true);ui.effects();
 const after=ui.grid();expect(after.state.layout.activeCellId).toBe(other);
 expect(ui.panel()?.session?.activeCellId).toBe(other);expect(ui.panel()!.session.runId).toBe(run);expect(after.activeExecutionIdentity).toBe(identity);
 expect(ui.shown()).not.toContain('Bar Replay ended because another chart was selected.');
 expect(Object.keys(after.replayCellBars)).toEqual([first]);expect(after.activeBars.length).toBe(after.replayCellBars[first].length);
 expect(ui.panel()!.account).toBeTruthy(); // replay paper trading stays on the replay account
});
it('the scope choice is offered on a multi-chart layout; Current chart replays the active chart only',async()=>{
 const ui=await setup();twoCells(ui);startReplay(ui);
 expect(ui.panel()!.multiChart).toBe(true);expect(ui.panel()!.session.scope).toBe('current');expect(ui.grid().replayCellBars).toBeUndefined();
 ui.panel()!.onScope('all');ui.effects();expect(ui.panel()!.session.scope).toBe('all');expect(Object.keys(ui.grid().replayCellBars)).toHaveLength(1);
 ui.panel()!.onScope('current');ui.effects();expect(ui.grid().replayCellBars).toBeUndefined();
});
