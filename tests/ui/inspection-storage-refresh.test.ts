import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {gridHoverStore} from '../../src/ui/grid-hover';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {ReplayPanel} from '../../src/ui/ReplayPanel';
import {ChartSettingsDialog} from '../../src/ui/chart-settings-dialog';
import {HeaderSymbolButton} from '../../src/ui/HeaderSymbolButton';
import {SymbolSearchDialog} from '../../src/ui/SymbolSearchDialog';
import {switchRequest} from '../../src/ui/symbol-search';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {createPaperAccount} from '../../src/domain/paper';
import {sourceContextForDataset} from '../../src/chart/source-context';

// SYNTHETIC actual App callbacks and actual save/finally/afterStorageWrite path.
// React effects, RAF, storage transport and inspection values are controlled;
// no DOM/native numerical/private proof/executable/reference claim is made.
const hooks=vi.hoisted(()=>({slots:[] as any[],cursor:0}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const same=(a:any[]|undefined,b:any[]|undefined)=>!!a&&!!b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const memo=(create:()=>any,deps:any[])=>{const at=hooks.cursor++,old=hooks.slots[at];if(!old||!same(old.deps,deps))hooks.slots[at]={kind:'memo',deps,value:create()};return hooks.slots[at].value;};
 const effect=(create:()=>unknown,deps?:any[])=>{const at=hooks.cursor++,old=hooks.slots[at];if(old){old.dirty=old.dirty||!same(old.deps,deps);old.deps=deps;old.create=create;}else hooks.slots[at]={kind:'effect',deps,create,dirty:true,cleanup:undefined};};
 return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const at=hooks.cursor++;if(!hooks.slots[at])hooks.slots[at]={kind:'state',value:typeof initial==='function'?initial():initial};return[hooks.slots[at].value,(next:any)=>{hooks.slots[at].value=typeof next==='function'?next(hooks.slots[at].value):next;}];},useRef:(initial:any)=>{const at=hooks.cursor++;if(!hooks.slots[at])hooks.slots[at]={kind:'ref',value:{current:initial}};return hooks.slots[at].value;},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:effect,useLayoutEffect:effect};
});
let frames:Map<number,()=>void>,sequence:number;
const owned:Array<{dispose():void}>=[];
beforeEach(()=>{hooks.slots=[];hooks.cursor=0;frames=new Map();sequence=0;vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']});vi.stubGlobal('requestAnimationFrame',(fn:()=>void)=>{frames.set(++sequence,fn);return sequence;});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));vi.stubGlobal('document',{querySelector:()=>null});});
afterEach(()=>{const failures:unknown[]=[];for(const ui of owned.splice(0).reverse())try{ui.dispose();}catch(error){failures.push(error);}vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();if(failures.length)throw new AggregateError(failures,'Synthetic App fixture cleanup failed.');});
const flush=async()=>{for(let count=0;count<16;count++)await Promise.resolve();};
const gate=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(done=>resolve=done);return{promise,resolve};};
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const hit=find(child,test);if(hit)return hit;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function commit(record:any){if(!record.dirty)return;record.dirty=false;const previous=record.cleanup;record.cleanup=undefined;previous?.();const result=record.create();if(typeof result==='function')record.cleanup=result;}
function selectedEffect(marker:string){const rows=hooks.slots.filter(row=>row?.kind==='effect'&&String(row.create).includes(marker));expect(rows,'one actual App producer effect').toHaveLength(1);return rows[0];}
function drainFrame(){const batch=[...frames.values()];frames.clear();for(const fn of batch)fn();}
async function setup(options:{configure?:(chart:any,api:any)=>void}={}){
 let revision=4,appearance=0,closed=false;
 const initial=prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount({initialBalance:500}),alerts:[]});
 const response=()=>({ok:true,value:{revision:++revision,savedAt:'2026-10-24T10:00:00Z'}});
 const bridge={loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-24T09:00:00Z',data:initial,storage:{directory:'Synthetic inspection profile',backend:'json-atomic'}}})),saveWorkspace:vi.fn(async()=>response()),onFlushRequest:vi.fn(()=>()=>{}),resetWorkspace:vi.fn(async()=>response())};
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const render=()=>{hooks.cursor=0;return App();};
 const dispose=()=>{if(closed)return;closed=true;const errors:unknown[]=[];for(const record of hooks.slots.filter(row=>row?.kind==='effect')){const cleanup=record.cleanup;record.cleanup=undefined;if(cleanup)try{cleanup();}catch(error){errors.push(error);}}if(errors.length)throw new AggregateError(errors,'Synthetic App cleanup failed.');};owned.push({dispose});
 render();const boot=hooks.slots.find(row=>row?.kind==='effect');expect(boot).toBeDefined();commit(boot);await flush();
 let lastHostProps:any;const props=()=>{const host=find(render(),node=>node.type===WorkspaceChartHost);expect(host,'actual loaded App host').not.toBeNull();return lastHostProps=host.props;};
 const coordinator={suspend:vi.fn((_expected:any,_options?:any)=>({isCurrent:()=>true,resume:vi.fn()})),gestureActive:()=>false,transactionActive:()=>false};
 props().onTransactionReady(coordinator);render();
 const autosave=()=>{render();commit(selectedEffect('autosaveDirtySince'));};
 autosave();await vi.advanceTimersByTimeAsync(1300);await flush();render();bridge.saveWorkspace.mockClear();coordinator.suspend.mockClear();
 const currentProps=props(),bars=currentProps.activeBars,dataset=currentProps.datasets.find((row:any)=>row.provenance.datasetId===currentProps.activeDatasetId),source=sourceContextForDataset(dataset,bars),style=currentProps.state.cells[currentProps.state.layout.activeCellId].style;
 expect(bars.length).toBeGreaterThan(483);
 const snapshot=(index:number,hovered=true)=>({pending:false,source,series:{count:bars.length,firstTime:bars[0].time,lastTime:bars.at(-1).time,style},readout:{time:null,ohlc:null,indicators:[]},crosshair:hovered?{time:bars[index].time,price:bars[index].close,paneKind:'price',values:new Map(),ohlc:{...bars[index]}}:null,standard:{index,bar:{...bars[index]},hovered},displayed:{index,bar:{...bars[index]},hovered}});
 let value=snapshot(483);const crosshair=new Set<()=>void>(),market=new Set<()=>void>();
 const chart:any={drawings:{getTool:()=>null,getMode:()=>null},setTool:vi.fn(),setDrawingMode:vi.fn(),onToolChanged:()=>()=>{},onDrawingModeChanged:()=>()=>{},nativeRenderer:()=>null,indicators:{list:()=>[],subscribe:()=>()=>{}},getExecutionIdentity:()=> 'ordinary',getStyle:()=>style,getSourceBars:vi.fn(()=>{throw Error('No inspection history copy');}),getCalculationBars:vi.fn(()=>{throw Error('No inspection calculation copy');}),onCrosshair:vi.fn((fn:()=>void)=>{crosshair.add(fn);return vi.fn(()=>crosshair.delete(fn));}),onMarketApplied:vi.fn((fn:()=>void)=>{market.add(fn);return vi.fn(()=>market.delete(fn));}),getDataWindow:vi.fn(()=>value)};
 const ready=(next:any)=>lastHostProps.onReady(next);
 const button=(label:string)=>{const node=find(render(),row=>row.type==='button'&&(row.props['aria-label']===label||text(row).trim()===label));expect(node,'actual App control '+label).not.toBeNull();return node;};
 const actualInput=()=>hooks.slots.find(row=>row?.kind==='ref'&&row.value.current?.dataset&&row.value.current?.datasets&&row.value.current?.bars&&!('workspace' in row.value.current))?.value.current;
 const api:any={actualInput,render,props,button,bridge,coordinator,chart,crosshair,market,bars,dataset,snapshot,response,ready,autosave,
  inspectionEffect:()=>selectedEffect('chart.onCrosshair'),
  commitInspection(){render();commit(selectedEffect('chart.onCrosshair'));},
  setIndex(index:number,hovered=true){value=snapshot(index,hovered);return value;},
  emit(){expect(crosshair.size).toBe(1);for(const fn of [...crosshair])fn();},
  // The inspection lives in App's hover store (keyed by its gridHost ref), not in App state.
  state(){return api.inspectionStore.inspection;},
  chooseSymbol(symbol:string){const header=find(render(),node=>node.type===HeaderSymbolButton);header.props.onOpen(symbol,'toolbar');const dialog=find(render(),node=>node.type===SymbolSearchDialog);expect(dialog).not.toBeNull();const row=dialog.props.candidates.find((item:any)=>item.symbol===symbol&&!item.unavailableReason);expect(row).toBeDefined();const result=dialog.props.onSelect(switchRequest(row,'toolbar'));expect(result).toBe(true);dialog.props.onClose();},
  change(){const host=props(),next=structuredClone(host.state),id=next.layout.activeCellId;next.cells[id].appearance.background='#'+(++appearance).toString(16).padStart(6,'0');expect(host.onChange(next)).toBe(true);render();},
  async beginWrite(){const pending=gate(),before=bridge.saveWorkspace.mock.calls.length;bridge.saveWorkspace.mockReturnValueOnce(pending.promise);api.change();autosave();await vi.advanceTimersByTimeAsync(1300);await flush();expect(bridge.saveWorkspace).toHaveBeenCalledTimes(before+1);expect(coordinator.suspend.mock.calls.at(-1)?.[1]).toEqual({background:true});render();return pending;},
  async finishWrite(pending:ReturnType<typeof gate>){pending.resolve(response());await flush();},
  dispose,
 };
 options.configure?.(chart,api);ready(chart);render();commit(selectedEffect('chart.onCrosshair'));drainFrame();
 api.inspectionStore=hooks.slots.map(row=>row?.kind==='ref'&&row.value&&typeof row.value==='object'?gridHoverStore(row.value):null).find(store=>(store?.inspection as unknown)===value);expect(api.inspectionStore,'actual App inspection state').toBeDefined();chart.getDataWindow.mockClear();return api;
}

it('one real App crosshair report during the actual autosave publishes current355 after finish without a second pointer',async()=>{
 const h=await setup(),pending=await h.beginWrite(),next=h.setIndex(355);expect(h.state().displayed.index).toBe(483);h.emit();drainFrame();expect(h.chart.getDataWindow).not.toHaveBeenCalled();expect(h.state().displayed.index).toBe(483);
 await h.finishWrite(pending);drainFrame();expect(h.chart.getDataWindow).toHaveBeenCalledOnce();expect(h.state()).toBe(next);
});
it('a RAF that encounters a newly started write defers its actual producer read until finish',async()=>{
 const h=await setup();h.setIndex(355);h.emit();expect(frames.size).toBe(1);const pending=await h.beginWrite();drainFrame();expect(h.chart.getDataWindow).not.toHaveBeenCalled();await h.finishWrite(pending);drainFrame();expect(h.chart.getDataWindow).toHaveBeenCalledOnce();expect(h.state().displayed.index).toBe(355);
});
it('one thousand held reports coalesce without history copies, cloning, worker calls or ordinary-hover source packing',async()=>{
 const h=await setup(),pending=await h.beginWrite(),clone=vi.spyOn(globalThis,'structuredClone'),json=vi.spyOn(JSON,'stringify');
 h.setIndex(355);h.emit();const firstMetadata=json.mock.calls.length;for(let index=0;index<1000;index++)h.emit();expect(json).toHaveBeenCalledTimes(firstMetadata);expect(frames.size).toBe(0);expect(h.chart.getDataWindow).not.toHaveBeenCalled();expect(h.chart.getSourceBars).not.toHaveBeenCalled();expect(h.chart.getCalculationBars).not.toHaveBeenCalled();expect(clone).not.toHaveBeenCalled();clone.mockRestore();json.mockRestore();
 await h.finishWrite(pending);drainFrame();expect(h.chart.getDataWindow).toHaveBeenCalledOnce();h.chart.getDataWindow.mockClear();const ordinaryJson=vi.spyOn(JSON,'stringify');h.setIndex(467);h.emit();drainFrame();expect(ordinaryJson).not.toHaveBeenCalled();ordinaryJson.mockRestore();expect(h.state().displayed.index).toBe(467);
});
it('a nested real write before the spliced waiter runs waits again and reads only after the second finish',async()=>{
 const h=await setup(),first=await h.beginWrite(),microtasks:Array<()=>void>=[];h.setIndex(355);h.emit();vi.stubGlobal('queueMicrotask',(fn:()=>void)=>microtasks.push(fn));await h.finishWrite(first);expect(microtasks.length).toBeGreaterThan(0);
 const second=await h.beginWrite();for(const fn of microtasks.splice(0))fn();drainFrame();expect(h.chart.getDataWindow).not.toHaveBeenCalled();await h.finishWrite(second);for(const fn of microtasks.splice(0))fn();drainFrame();expect(h.chart.getDataWindow).toHaveBeenCalledOnce();expect(h.state().displayed.index).toBe(355);
});
it('a queued leave report rereads current latest rather than replaying a stored hover coordinate',async()=>{
 const h=await setup(),pending=await h.beginWrite();h.setIndex(355);h.emit();const latest=h.setIndex(h.bars.length-1,false);h.emit();await h.finishWrite(pending);drainFrame();expect(h.state()).toBe(latest);expect(h.state().displayed.hovered).toBe(false);
});
it('actual queued source selection retires an old inspection before React input refs catch up',async()=>{
 const h=await setup(),pending=await h.beginWrite();h.chooseSymbol('SPY');h.setIndex(355);h.emit();await h.finishWrite(pending);drainFrame();expect(h.chart.getDataWindow).not.toHaveBeenCalled();expect(h.props().state.layout.cells.find((row:any)=>row.id===h.props().state.layout.activeCellId).symbol).toBe('SPY');
});
it('a wholly unobserved source return is a fresh current read and never replays an old inspection payload',async()=>{
 const h=await setup(),pending=await h.beginWrite();h.setIndex(355);h.emit();await h.finishWrite(pending);expect(frames.size).toBe(1);h.chooseSymbol('SPY');h.chooseSymbol('GME');h.render();const restored=h.actualInput();expect(restored.dataset.instrument.symbol).toBe('GME');expect(restored.dataset).toBe(h.dataset);expect(restored.bars).toBe(h.bars);const fresh=h.setIndex(467);drainFrame();expect(h.state()).toBe(fresh);expect(h.state().displayed.index).toBe(467);
});
it('an actual same-generation controller replacement before cleanup refuses the queued read and retained old callback',async()=>{
 const h=await setup(),pending=await h.beginWrite(),retained=[...h.crosshair][0];h.setIndex(355);h.emit();h.ready({...h.chart,onCrosshair:()=>()=>{}});await h.finishWrite(pending);drainFrame();retained();drainFrame();expect(h.chart.getDataWindow).not.toHaveBeenCalled();
});
it('unmount cancels the owned waiter/frame and retained callbacks cannot perform native reads',async()=>{
 const h=await setup(),pending=await h.beginWrite(),retained=[...h.crosshair][0];h.emit();h.dispose();await h.finishWrite(pending);retained();drainFrame();expect(h.chart.getDataWindow).not.toHaveBeenCalled();expect(h.crosshair.size).toBe(0);expect(h.market.size).toBe(0);expect(frames.size).toBe(0);
});
it('replacement during the current producer read refuses the old result after the callback boundary',async()=>{
 const h=await setup(),pending=await h.beginWrite(),before=h.state();h.setIndex(355);h.emit();h.chart.getDataWindow.mockImplementationOnce(()=>{h.ready({...h.chart,onCrosshair:()=>()=>{}});return h.snapshot(355);});await h.finishWrite(pending);drainFrame();expect(h.chart.getDataWindow).toHaveBeenCalledOnce();expect(h.state()).toBe(before);
});
it.each([false,true])('a crosshair-registration replacement (synchronous report %s) prevents later native registration',async report=>{
 const h=await setup(),previous=h.inspectionEffect();previous.cleanup();previous.cleanup=undefined;h.chart.getDataWindow.mockClear();h.chart.onMarketApplied.mockClear();const release=vi.fn();h.chart.onCrosshair.mockImplementationOnce((fn:()=>void)=>{h.ready({...h.chart,onCrosshair:()=>()=>{}});if(report)fn();return release;});previous.dirty=true;expect(()=>commit(previous)).not.toThrow();expect(release).toHaveBeenCalledOnce();expect(h.chart.onMarketApplied).not.toHaveBeenCalled();expect(h.chart.getDataWindow).not.toHaveBeenCalled();
});
it('partial native subscription failure unwinds the earlier actual acquired unsubscribe',async()=>{
 const h=await setup(),effect=h.inspectionEffect();effect.cleanup();effect.cleanup=undefined;const release=vi.fn(),cause=Error('Synthetic market subscription failed');h.chart.onCrosshair.mockReturnValueOnce(release);h.chart.onMarketApplied.mockImplementationOnce(()=>{throw cause;});effect.dirty=true;expect(()=>commit(effect)).toThrow(cause);expect(release).toHaveBeenCalledOnce();expect(frames.size).toBe(0);
});
it('cleanup attempts both acquired native unsubscriptions even when the first throws',async()=>{
 const h=await setup(),effect=h.inspectionEffect();effect.cleanup();effect.cleanup=undefined;const failure=Error('Synthetic crosshair release failed'),first=vi.fn(()=>{throw failure;}),second=vi.fn();h.chart.onCrosshair.mockReturnValueOnce(first);h.chart.onMarketApplied.mockReturnValueOnce(second);effect.dirty=true;commit(effect);let caught:unknown;try{effect.cleanup();}catch(error){caught=error;}effect.cleanup=undefined;expect(caught).toBeInstanceOf(AggregateError);expect((caught as AggregateError).errors).toEqual([failure]);expect(first).toHaveBeenCalledOnce();expect(second).toHaveBeenCalledOnce();expect(frames.size).toBe(0);
});

it('actual replay controls are refused during a storage hold and do not lose the pending fresh inspection',async()=>{
 const h=await setup(),pending=await h.beginWrite();h.setIndex(355);h.emit();h.button('Replay').props.onClick();expect(find(h.render(),node=>node.type===ReplayPanel)).toBeNull();await h.finishWrite(pending);drainFrame();expect(h.chart.getDataWindow).toHaveBeenCalledOnce();expect(h.state().displayed.index).toBe(355);
});
it('an actual replay start after unlock retires the old ordinary inspection before its queued frame',async()=>{
 const h=await setup(),pending=await h.beginWrite();h.setIndex(355);h.emit();await h.finishWrite(pending);expect(frames.size).toBe(1);h.button('Replay').props.onClick();const panel=find(h.render(),node=>node.type===ReplayPanel);expect(panel).not.toBeNull();panel.props.onStartPoint({kind:'date',time:h.bars[300].time});expect(h.props().activeExecutionIdentity).not.toBe('ordinary');drainFrame();expect(h.chart.getDataWindow).not.toHaveBeenCalled();
});
it('an actual financial workspace reset after unlock retires the old queued inspection',async()=>{
 const h=await setup(),pending=await h.beginWrite();h.emit();await h.finishWrite(pending);expect(frames.size).toBe(1);h.button('Local storage').props.onClick();const dialog=find(h.render(),node=>node.type===ChartSettingsDialog);expect(dialog).not.toBeNull();const storage=dialog.props.dataSources.props.storage;expect(typeof storage.onReset).toBe('function');await storage.onReset();await flush();expect(h.bridge.resetWorkspace).toHaveBeenCalledOnce();drainFrame();expect(h.chart.getDataWindow).not.toHaveBeenCalled();
});
