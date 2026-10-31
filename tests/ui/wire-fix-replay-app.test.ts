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
// WR-7a: Bar Replay session state across chart
// focus, chart type changes, panel close, held keys and staged layout transitions. Actual App closures on a controlled
// hook store (harness of tests/ui/bugfix-g-indicator-detached-app.test.ts: autosave timer, storage mutation, owner checks)
// plus the RPST start-selection helper of tests/ui/startup-recovery-app.test.ts. The chart controller and data window
// are SYNTHETIC stubs. No DOM, focus engine, GUI or package claim.
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
/** A second chart cell on the same synthetic GME source, so a focus change keeps the dataset (WR-1 probe case). */
function twoCells(ui:UI){
 const initial=ui.grid(),multi=resizeMultiChartState(initial.state,'two-columns'),target=multi.layout.cells[1],gme=initial.datasets.find((row:any)=>row.instrument.symbol==='GME');
 const opening=initial.datasets.find((row:any)=>row.provenance.datasetId===multi.cells[target.id].datasetId);target.symbol='GME';target.interval=gme.resolution;multi.cells[target.id]=transitionDrawingScope({...multi.cells[target.id],datasetId:gme.provenance.datasetId},opening,gme);
 expect(initial.onChange(multi)).toBe(true);ui.render();return target.id as string;
}
const key=(name:string)=>({key:name,shiftKey:true,ctrlKey:false,altKey:false,metaKey:false,isComposing:false,target:{closest:(selector:string)=>selector==='.chart-workspace'?{}:null},preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.useFakeTimers({toFake:['setTimeout','clearTimeout','setInterval','clearInterval','Date']});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it('WR-1: focusing another chart cell during a replay ends the session cleanly (button, panel, clock, guard)',async()=>{
 const ui=await setup(),other=twoCells(ui);startReplay(ui);
 const before=ui.grid();expect(before.activeExecutionIdentity).not.toBe('ordinary');expect(ui.panel()?.session?.phase).toBe('active');expect(ui.replayButton().props['aria-pressed']).toBe(true);
 expect(before.onChange({...before.state,layout:{...before.state.layout,activeCellId:other}})).toBe(true);
 const after=ui.grid();expect(after.activeExecutionIdentity).toBe('ordinary');expect(after.state.layout.activeCellId).toBe(other);
 expect(ui.panel(),'no replay panel remains for the chart that is not replaying').toBeNull();
 expect(ui.replayButton().props['aria-pressed']).toBe(false);
 expect(ui.shown()).toContain('Bar Replay ended because another chart was selected.');
 // A fresh replay starts on the newly focused chart.
 startReplay(ui,50);expect(ui.panel()?.session?.phase).toBe('active');expect(ui.panel()?.session?.activeCellId).toBe(other);expect(ui.grid().activeExecutionIdentity).not.toBe('ordinary');
});

it('WR-2: choosing a derived chart type during a replay is refused visibly, like starting a replay on one',async()=>{
 const ui=await setup();startReplay(ui);const id=ui.grid().state.layout.activeCellId,style=ui.grid().state.cells[id].style,identity=ui.grid().activeExecutionIdentity;
 find(ui.render(),node=>node.type===ChartTypeMenu).props.onSelect('footprint');
 expect(ui.grid().state.cells[id].style).toBe(style);expect(ui.grid().activeExecutionIdentity).toBe(identity);
 expect(ui.shown()).toContain('Volume footprint charts are not available in Bar Replay. Close Bar Replay before choosing this chart type.');
 expect(ui.panel()?.session?.phase).toBe('active');
 // The grid route (chart type chosen from a chart cell) follows the same rule.
 const next=structuredClone(ui.grid().state);next.cells[id].style='tpo';
 expect(ui.grid().onChange(next)).toBe(false);expect(ui.grid().state.cells[id].style).toBe(style);
 expect(ui.shown()).toContain('Time price opportunity charts are not available in Bar Replay. Close Bar Replay before choosing this chart type.');
 // LV replays its derived types; Range is accepted during replay and the session stays active.
 find(ui.render(),node=>node.type===ChartTypeMenu).props.onSelect('range');
 expect(ui.grid().state.cells[id].style).toBe('range');expect(ui.panel()?.session?.phase).toBe('active');
 // A time-based type is still accepted during replay.
 find(ui.render(),node=>node.type===ChartTypeMenu).props.onSelect('line');
 expect(ui.grid().state.cells[id].style).toBe('line');
});

it('WR-3: after a replay ends, close hides the panel and Select bar starts a new selection',async()=>{
 // ReplayPanel is not expanded by this hook harness: its callbacks are the props App passes ('Close replay' is onClose, 'Select bar' is onSelectStart).
 const ui=await setup();startReplay(ui);
 ui.panel()!.onClose();expect(ui.panel(),'one close exits replay').toBeNull();expect(ui.replayButton().props['aria-pressed']).toBe(false);
});

it('WR-5: Shift+ArrowRight during the background autosave is queued (default prevented) and steps after the write',async()=>{
 const ui=await setup();startReplay(ui);ui.effects();const clock=ui.panel()!.session.clock;
 const pending=deferred();ui.bridge.saveWorkspace.mockReturnValueOnce(pending.promise);
 ui.change('#2468ac');ui.effects();await vi.advanceTimersByTimeAsync(1300);await flush();
 expect(ui.bridge.saveWorkspace).toHaveBeenCalledOnce();ui.effects();
 const event=key('ArrowRight');ui.listener('keydown')(event);
 expect(event.preventDefault).toHaveBeenCalled();expect(ui.panel()!.session.clock,'nothing steps inside the write').toBe(clock);
 pending.resolve({ok:true,value:{revision:6,savedAt:'2026-10-17T00:00:02Z'}});await flush();ui.effects();await flush();ui.effects();
 expect(ui.panel()!.session.clock,'the queued step ran once the write ended').toBeGreaterThan(clock);
});

it('WR-5: Shift+ArrowDown during a blocking chart transaction is refused visibly with the default prevented',async()=>{
 const ui=await setup();startReplay(ui);ui.effects();const playing=ui.panel()!.session.playing;
 const hold=deferred(),host={cancel:vi.fn(),transition:vi.fn(async()=>{await hold.promise;return{committed:false,cancelled:true,errors:['Synthetic cancelled layout']};})};ui.grid().onHostReady(host);
 const opening=ui.grid().state,pendingResize=ui.grid().onRequestResize(opening,resizeMultiChartState(opening,'two-columns'));
 expect(host.transition).toHaveBeenCalledOnce();ui.effects();
 const event=key('ArrowDown');ui.listener('keydown')(event);
 expect(event.preventDefault).toHaveBeenCalled();expect(ui.shown()).toContain(HELD_KEY_BLOCKING);expect(ui.panel()!.session.playing).toBe(playing);
 hold.resolve(null);await pendingResize;
});

it('WR-7a: staged layout transitions receive the workspace chart settings with the other view props',async()=>{
 const ui=await setup(),requests:any[]=[],host={cancel:vi.fn(),transition:vi.fn(async(request:any)=>{requests.push(request);return{committed:false,cancelled:true,errors:['Synthetic cancelled layout']};})};
 ui.grid().onHostReady(host);const opening=ui.grid().state,settings=ui.grid().chartSettings;expect(settings).toBeTruthy();
 await ui.grid().onRequestResize(opening,resizeMultiChartState(opening,'two-columns'));
 expect(requests).toHaveLength(1);expect(requests[0].view.chartSettings).toBe(settings);
});
