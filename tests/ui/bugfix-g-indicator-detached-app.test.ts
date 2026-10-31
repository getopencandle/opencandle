import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {IndicatorDialog} from '../../src/ui/IndicatorDialog';
import {DOMAIN_INDICATORS} from '../../src/chart/indicator-port';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
// R-G1-1 (an Indicators-dialog change queued during the routine
// autosave must survive the dialog closing. Actual App (autosave timer, storage mutation, owner/epoch checks) and the
// actual IndicatorDialog element App renders, each on its own controlled hook store; harness of
// tests/ui/bugfix-g-autosave-app.test.ts with setters bound to their own store. The chart controller is synthetic.
// No DOM, focus engine, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const cells=hooks.cells,index=hooks.cursor++,old=cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))cells[index]={deps,value:fn()};return cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const cells=hooks.cells,index=hooks.cursor++;if(!(index in cells))cells[index]=typeof initial==='function'?initial():initial;return[cells[index],(value:any)=>{cells[index]=typeof value==='function'?value(cells[index]):value;}];},useRef:(initial:any)=>{const cells=hooks.cells,index=hooks.cursor++;if(!(index in cells))cells[index]={current:initial};return cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const cells=hooks.cells,index=hooks.cursor++,old=cells[index];if(!old||!deps||deps.some((v,i)=>!Object.is(v,old[i]))){cells[index]=deps??[];if(cells===appCells.current)hooks.effects.push(fn);}}};
});
const appCells=vi.hoisted(()=>({current:null as any[]|null}));
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(yes=>resolve=yes);return{resolve,promise};};
type Coordinator={suspend:ReturnType<typeof vi.fn>;gestureActive?:()=>boolean;transactionActive?:()=>boolean;flushFrameGesture?:ReturnType<typeof vi.fn>};
const port=(extra:Partial<Coordinator>={}):Coordinator=>({suspend:vi.fn((_expected:unknown,_options?:unknown)=>({isCurrent:()=>true,resume:vi.fn()})),...extra});

async function setup(coordinator:Coordinator=port()){
 let revision=4;const initial=createInitialWorkspace();
 const data=prepareWorkspaceJSON({...initial,paper:createPaperAccount({initialBalance:500}),alerts:[]});
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-16T00:00:00Z',data,storage:{directory:'Synthetic bugfix-f profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:++revision,savedAt:'2026-10-16T00:00:01Z'}})),onFlushRequest:vi.fn((_handler:()=>Promise<unknown>)=>vi.fn())};
 const win={lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()};vi.stubGlobal('window',win);
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady(coordinator);render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports are irrelevant here */}
 const effects=()=>{render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 const alerts=()=>find(render(),node=>node.type===WorkspaceAlerts).props;
 const main=()=>find(render(),node=>node.type==='main').props;
 const button=(name:string)=>{const found=find(render(),node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name));if(!found)throw Error('Missing control '+name);return found;};
 const edited=(background:string)=>{const next=structuredClone(grid().state);next.cells[next.layout.activeCellId].appearance.background=background;return next;};
 const change=(background:string)=>{expect(grid().onChange(edited(background))).toBe(true);render();};
 const shown=()=>text(render());
 const payload=(call:number)=>bridge.saveWorkspace.mock.calls[call][0].data;
 const listener=(type:string)=>win.addEventListener.mock.calls.filter((call:any[])=>call[0]===type).at(-1)?.[1] as ((event?:unknown)=>void)|undefined;
 const closeHandler=()=>bridge.onFlushRequest.mock.calls.at(-1)?.[0] as (()=>Promise<unknown>);
 // Settle the first post-load autosave so the next save is the one under test.
 effects();await vi.advanceTimersByTimeAsync(1300);await flush();effects();bridge.saveWorkspace.mockClear();coordinator.suspend.mockClear();
 return{bridge,render,grid,alerts,main,button,edited,change,effects,coordinator,shown,payload,listener,closeHandler};
}
beforeEach(()=>{hooks.cells=[];appCells.current=hooks.cells;hooks.cursor=0;hooks.effects=[];vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const SAVING='The workspace is saving. This indicator change applies when the save finishes.';
/** SYNTHETIC chart controller: what App and the Indicators dialog read for the Hide row action. */
function nativeChart(rows:any[]){return {drawings:{getTool:()=>null,getMode:()=>null},setTool:vi.fn(),setDrawingMode:vi.fn(),onToolChanged:()=>()=>{},onDrawingModeChanged:()=>()=>{},isInputOwned:()=>true,isInputCurrent:()=>true,indicators:{catalog:DOMAIN_INDICATORS,list:()=>rows,subscribe:vi.fn(()=>()=>{}),update:vi.fn(),remove:vi.fn(),serialize:()=>[]}};}
const row={id:'synthetic-sma',kind:'sma',inputs:{length:9,source:'close'},visible:true,offset:0,plots:{},rendererId:'synthetic-sma',paneId:'price',diagnostics:[],presentationDiagnostics:[],policies:[],series:[],informationBars:3,latestInformationTime:null};

async function queuedHide(){
 const ui=await setup(),chart=nativeChart([row]);ui.grid().onReady(chart);ui.effects();
 ui.button('Indicators').props.onClick();ui.effects();
 // The dialog element App renders, run on its own hook store (its effects only track mount state).
 const dialogCells:any[]=[];
 const dialog=()=>{const element=find(ui.render(),node=>node.type===IndicatorDialog);if(!element)return null;const app=hooks.cells,cursor=hooks.cursor;hooks.cells=dialogCells;hooks.cursor=0;try{return IndicatorDialog(element.props);}finally{hooks.cells=app;hooks.cursor=cursor;}};
 const control=(test:(node:any)=>boolean)=>{const found=find(dialog(),test);if(!found)throw Error('Missing dialog control');return found;};
 const pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 ui.change('#2468ac');ui.effects();await vi.advanceTimersByTimeAsync(1300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();
 control(node=>node.type==='button'&&String(node.props['aria-label']??'').startsWith('Hide ')).props.onClick();
 expect(chart.indicators.update,'nothing applied inside the write').not.toHaveBeenCalled();
 expect(text(dialog())).toContain(SAVING);
 control(node=>node.type==='button'&&text(node)==='Close').props.onClick();ui.effects();
 expect(dialog(),'the dialog is closed before the write ends').toBeNull();
 const end=async()=>{pending.resolve({ok:true,value:{revision:6,savedAt:'2026-10-16T00:00:02Z'}});await flush();ui.effects();};
 return {ui,chart,end};
}

it('R-G1-1: a dialog change queued during the autosave, dialog closed, write ends: applied exactly once and said so',async()=>{
 const {ui,chart,end}=await queuedHide();
 await end();
 expect(chart.indicators.update).toHaveBeenCalledExactlyOnceWith('synthetic-sma',{visible:false});
 expect(ui.shown()).toContain('The indicator change queued during the save was applied.');
 await vi.advanceTimersByTimeAsync(1300);await flush();
 expect(chart.indicators.update,'no second application').toHaveBeenCalledOnce();
});

it('R-G1-1: when the chart was replaced before the write ended, the queued change is not applied and the refusal is shown',async()=>{
 const {ui,chart,end}=await queuedHide();
 const replacement=nativeChart([row]);ui.grid().onReady(replacement);ui.effects();
 await end();
 expect(chart.indicators.update).not.toHaveBeenCalled();
 expect(replacement.indicators.update).not.toHaveBeenCalled();
 expect(ui.shown()).toContain('The indicator change queued during the save was not applied.');
});
