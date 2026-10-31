import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {ReplayPanel} from '../../src/ui/ReplayPanel';
import {PaperTradingDock} from '../../src/ui/PaperTradingDock';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {barCloseTime} from '../../src/domain/replay-session';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {sourceContextForDataset} from '../../src/chart/source-context';
// App wiring of the floating replay bar (step back, start-point menu, replay account badge). Actual App
// closures on the controlled hook store of tests/ui/wire-fix-replay-app.test.ts (harness copied verbatim). The chart
// controller and data window are SYNTHETIC stubs. No DOM, focus engine, GUI or package claim.
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
const key=(name:string)=>({key:name,shiftKey:true,ctrlKey:false,altKey:false,metaKey:false,isComposing:false,target:{closest:(selector:string)=>selector==='.chart-workspace'?{}:null},preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.useFakeTimers({toFake:['setTimeout','clearTimeout','setInterval','clearInterval','Date']});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const activeData=(ui:UI)=>{const grid=ui.grid();return grid.datasets.find((row:any)=>row.provenance.datasetId===grid.activeDatasetId);};

it('Step back reveals one bar less under a new run and keeps the chart guard in step',async()=>{
 const ui=await setup();startReplay(ui);ui.effects();
 const before=ui.panel()!.session,data=activeData(ui);expect(ui.panel()!.canStepBack).toBe(true);
 ui.panel()!.onStepBack();ui.effects();
 const after=ui.panel()!.session;
 expect(after.clock).toBe(barCloseTime(data.bars[99],data.resolution));expect(after.clock).toBeLessThan(before.clock);
 expect(after.runId).not.toBe(before.runId);expect(after.playing).toBe(false);
 expect(ui.grid().activeExecutionIdentity).toBe(after.runId);
});

it('Start point: First available date and Random bar start (or move) the replay; at the first bar Step back is disabled',async()=>{
 const ui=await setup();startReplay(ui);ui.effects();const data=activeData(ui);
 ui.panel()!.onStartPoint({kind:'first'});ui.effects();
 expect(ui.panel()!.session.phase).toBe('active');expect(ui.panel()!.session.clock).toBe(barCloseTime(data.bars[0],data.resolution));
 expect(ui.panel()!.canStepBack).toBe(false);expect(ui.grid().activeExecutionIdentity).toBe(ui.panel()!.session.runId);
 const random=vi.spyOn(Math,'random').mockReturnValue(0.5);
 try{ui.panel()!.onStartPoint({kind:'random'});ui.effects();}finally{random.mockRestore();}
 const expected=Math.floor(0.5*(data.bars.length-1));
 expect(ui.panel()!.session.clock).toBe(barCloseTime(data.bars[expected],data.resolution));
});

it('Start point with no session (closed with a remembered session) opens a new replay at that point',async()=>{
 // Close hides the bar, so the Replay button reopens it with no active session.
 const ui=await setup();startReplay(ui);ui.panel()!.onClose();expect(ui.panel()).toBeNull();ui.replayButton().props.onClick();expect(ui.panel()?.session?.phase).not.toBe('active');
 const data=activeData(ui);ui.panel()!.onStartPoint({kind:'first'});ui.effects();
 expect(ui.panel()!.session.phase).toBe('active');expect(ui.panel()!.session.clock).toBe(barCloseTime(data.bars[0],data.resolution));
});

it('Start point: a date outside the loaded history is refused visibly and the replay is unchanged',async()=>{
 const ui=await setup();startReplay(ui);ui.effects();const before=ui.panel()!.session;
 ui.panel()!.onStartPoint({kind:'date',time:activeData(ui).bars[0].time-86400*400});ui.effects();
 expect(ui.shown()).toContain('The chosen date is outside the loaded history.');expect(ui.panel()!.session).toBe(before);
});

it('the replay account badge shows the replay account and opens replay trading',async()=>{
 const ui=await setup();startReplay(ui);ui.effects();ui.effects();
 const panel=ui.panel()!;expect(panel.account?.currency).toBeTruthy();expect(panel.account?.equity).toMatch(/\d/);
 const dock=()=>find(ui.render(),node=>node.type===PaperTradingDock)?.props;
 expect(dock()?.replay).toBe(true);expect(dock()?.open).toBe(false);
 panel.onTrading();ui.render();expect(dock()?.open).toBe(true);
});
