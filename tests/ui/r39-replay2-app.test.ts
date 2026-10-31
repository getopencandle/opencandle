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
import {submitPaperOrder} from '../../src/domain/paper';
import {REPLAY_PAPER_REWIND_NOTICE} from '../../src/ui/replay-paper-carry';
// App wiring of the replay account across seeks (kept forward, rewound back), Shift+Left and Jump to real time. Actual App
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

const dock=(ui:UI)=>find(ui.render(),(node:any)=>node.type===PaperTradingDock)?.props;
/** A synthetic market buy on the replay account through the dock's own account route, at the account clock. */
function buyOnReplay(ui:UI){
 const before=dock(ui).account,result=submitPaperOrder(before,{instrument:dock(ui).instrument,type:'market',side:'buy',quantity:1} as never,before.clock);
 expect(result.ok,JSON.stringify(result.diagnostics)).toBe(true);expect(dock(ui).onAccountChange(result.account,before)).toBe(true);ui.effects();ui.effects();
 return dock(ui).account;
}

it('a seek forward keeps the replay account: same orders and cash under the new run',async()=>{
 const ui=await setup();startReplay(ui,60);ui.effects();ui.effects();
 const traded=buyOnReplay(ui),data=activeData(ui),run=ui.panel()!.session.runId;
 expect(traded.orders.length).toBe(1);
 ui.panel()!.onStartPoint({kind:'date',time:data.bars[120].time});ui.effects();ui.effects();
 const after=dock(ui).account;
 expect(ui.panel()!.session.runId).not.toBe(run);expect(after.runId).toBe(ui.panel()!.session.runId);
 expect(after.id).toBe(traded.id);expect(after.orders.map((row:any)=>row.id)).toEqual(traded.orders.map((row:any)=>row.id));
});

it('Step back before a replay trade undoes it and says so; ordinary paper is untouched',async()=>{
 const ui=await setup();startReplay(ui,60);ui.effects();ui.effects();
 ui.panel()!.onStep();ui.effects();ui.effects();
 const traded=buyOnReplay(ui);expect(traded.orders.length).toBe(1);
 ui.panel()!.onStepBack();ui.effects();ui.effects();
 expect(dock(ui).account.orders).toEqual([]);expect(dock(ui).account.runId).toBe(ui.panel()!.session.runId);
 expect(ui.shown()).toContain(REPLAY_PAPER_REWIND_NOTICE);
});

it('Shift+Left steps back with chart focus',async()=>{
 const ui=await setup();startReplay(ui,60);ui.effects();const clock=ui.panel()!.session.clock;
 const event=key('ArrowLeft');ui.listener('keydown')(event);ui.effects();ui.effects();
 expect(event.preventDefault).toHaveBeenCalled();expect(ui.panel()!.session.clock).toBeLessThan(clock);
});

it('Jump to real time parks the replay account; starting again in the session brings it back',async()=>{
 const ui=await setup();startReplay(ui,60);ui.effects();ui.effects();
 const traded=buyOnReplay(ui),data=activeData(ui);
 ui.panel()!.onRealtime();ui.effects();ui.effects();
 expect(ui.panel()!.session.phase).toBe('realtime');expect(dock(ui)?.replay).not.toBe(true);
 ui.panel()!.onStartPoint({kind:'date',time:data.bars[120].time});ui.effects();ui.effects();
 expect(dock(ui).account.orders.map((row:any)=>row.id)).toEqual(traded.orders.map((row:any)=>row.id));
});

it('Close and Continue still start a fresh replay account',async()=>{
 const ui=await setup();startReplay(ui,60);ui.effects();ui.effects();
 // One Close exits replay and hides the bar (Continue shows only after a layout
 // switch), so the next replay starts from the Replay button; it must still get a fresh replay account.
 buyOnReplay(ui);ui.panel()!.onClose();ui.effects();expect(ui.panel()).toBeNull();
 startReplay(ui,60);ui.effects();ui.effects();
 expect(ui.panel()!.session.phase).toBe('active');expect(dock(ui).account.orders).toEqual([]);
});
