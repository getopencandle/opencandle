import {expect,it,vi} from 'vitest';
import {all,mountControlledComponent,text} from '../helpers/alert-dialog-harness';
import {priceScaleHarness} from '../chart/price-scale-harness';
import {MultiChartGrid,createMultiChartState,type MultiChartState,type MultiChartTransactionCoordinator,type GridFrameEditBaseline} from '../../src/ui/MultiChartGrid';
import {prepareGridFrameHistory} from '../../src/ui/grid-frame-baseline';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {defaultPriceScaleSettings} from '../../src/chart/price-scale-state';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {ScriptBindingsRunner} from '../../src/ui/ScriptBindingsRunner';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';
import type {BarDataset} from '../../src/domain/types';

// Integration-pass finding INT-A-F1 (probe A1). The actual MultiChartGrid
// (frame gesture, captureCell, quarantine) and the actual GridCell (price-scale host binding, settings effects, pointer
// gesture handlers) under the shared controlled hook model, with the real price scale port on the pinned Vela
// NativeRenderer/RendererControl. The chart controller around that port is SYNTHETIC: its historical frame is read from
// the native price pane. No DOM, GUI or packaged-build claim.
const settle=async()=>{for(let turn=0;turn<8;turn++)await new Promise<void>(resolve=>setTimeout(resolve,0));};
const gestureWindow=()=>new Promise<void>(resolve=>setTimeout(resolve,260));// the frame gesture coalesces for 200 ms

function lockChart(dataset:BarDataset,initial:MultiChartState['cells'][string]['chartOptions']){
 const h=priceScaleHarness(),source=sourceContextForDataset(dataset,dataset.bars);let options=structuredClone(initial),viewport={from:0,to:dataset.bars.length-1};
 const frame=(fingerprints:Record<string,string>):HistoricalChartFrame=>{const pane=h.pane(),scene=h.renderer.scene;return{schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{...fingerprints},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:scene.scaleMode,log:scene.logScale,invert:scene.invertScale,manualRange:pane.manualScale?{min:pane.manualScale.min,max:pane.manualScale.max}:null}],independent:[],maximized:null};};
 const chart={h,priceScale:h.port,
  getExecutionIdentity:()=>'ordinary',getAnalysisUnavailable:()=>'',onAvailabilityChanged:()=>()=>{},onDrawingCommandError:()=>()=>{},
  getChartOptions:()=>({...options,auto:h.features.get('autoScale')!==false}),applyChartOptions:(next:typeof options)=>{options=structuredClone(next);h.features.set('autoScale',next.auto);},
  saveDrawings:()=>({}),loadDrawings:()=>{},onDrawingsChanged:()=>()=>{},
  indicators:{restore:()=>{},serialize:()=>[],subscribe:()=>()=>{}},comparisons:{restore:()=>{},list:()=>[],subscribe:()=>()=>{}},
  getViewport:()=>({...viewport}),setViewport:(next:{from:number;to:number})=>{viewport={...next};},onViewportChanged:()=>()=>{},onNavigationCommand:()=>()=>{},applyChartSettingsBook:()=>{},
  drawings:{getMode:()=>null},isDrawingChromeTarget:()=>false,
  isInputCurrent:(input:{bars:unknown;style:string})=>input.bars===dataset.bars&&input.style==='candles',
  scripts:{configurationSnapshot:()=>[]},waitForAnalysisPlacement:async()=>{},
  captureHistoricalFrame:(request:{calculationFingerprints:Record<string,string>})=>frame(request.calculationFingerprints),
  // Startup frame restore applies the saved price window to the native pane (the adapter's frame edit, reduced).
  prepareConfigurationEdit:async(request:{frame:HistoricalChartFrame})=>({isCurrent:()=>true,commit:()=>{const range=request.frame.panes[0].manualRange,pane=h.pane();pane.manualScale=range?{...pane.scale,min:range.min,max:range.max}:null;},seal:()=>{},rollback:async()=>{}}),
 };
 return chart;
}

async function mount(dataset:BarDataset,state:MultiChartState){
 const published:MultiChartState[]=[],frames:Array<{previous:MultiChartState;next:MultiChartState;baseline:GridFrameEditBaseline}>=[];let coordinator:MultiChartTransactionCoordinator|null=null;let props={state,datasets:[dataset],onChange:(next:MultiChartState,_prepared?:unknown,baseline?:GridFrameEditBaseline)=>{if(baseline)frames.push({previous:props.state,next,baseline});published.push(next);props={...props,state:next};return true;},onReady:()=>{},onActiveCell:()=>{},onTransactionReady:(value:MultiChartTransactionCoordinator|null)=>{coordinator=value;}};
 const parent=mountControlledComponent(()=>MultiChartGrid(props));parent.settle();
 const element=()=>all(parent.render(),value=>typeof value.type==='function'&&value.type.name==='GridCell')[0];
 const type=element().type as (input:Record<string,unknown>)=>unknown;
 const cellProps=()=>({...element().props,port:{mount:()=>()=>{}}});
 let current=cellProps();const cell=mountControlledComponent(()=>type(current));
 const id=state.layout.activeCellId,chart=lockChart(dataset,state.cells[id].chartOptions),input={bars:dataset.bars,source:sourceContextForDataset(dataset,dataset.bars),style:'candles'};
 const sync=async()=>{parent.settle();await settle();current=cellProps();cell.settle();await settle();parent.settle();current=cellProps();cell.settle();};
 cell.settle();
 (all(cell.render(),value=>value.type===ChartPanel)[0].props.onReady as (...args:unknown[])=>void)(chart,input,'ordinary');
 (all(cell.render(),value=>value.type===ScriptBindingsRunner)[0].props.onRuntime as (value:unknown)=>void)({configurationStatus:()=>({state:'ready',calculations:'complete',diagnostics:[]}),prepareBindings:()=>{throw Error('SYNTHETIC fixture has no missing script bindings');}});
 await sync();await sync();
 const root=()=>{const tree=cell.render() as {props:Record<string,any>};return tree;};
 const pointer=(phase:'down'|'up')=>{const tree=root(),node=tree.props.ref.current,event={currentTarget:node,target:{closest:()=>null},button:0,eventPhase:2,pointerId:1,clientX:40,clientY:40,preventDefault:vi.fn(),stopPropagation:vi.fn()};if(phase==='down')tree.props.onPointerDownCapture(event);else tree.props.onPointerUp(event);return event;};
 const broken=()=>[element().props.brokenMessage,...all(parent.render(),value=>value.props.role==='alert').map(text)].filter(Boolean).join(' | ');
 return{chart,id,published,frames,parent,cell,sync,pointer,broken,coordinator:()=>coordinator,state:()=>props.state,saved:()=>props.state.cells[id],
  /** A plain click on the chart: one pointer gesture, then the coalesced flush. */
  async click(){const down=pointer('down');pointer('up');await gestureWindow();await sync();return down;},
  /** The workspace writes a saved state into the grid (Settings Ok commit, restart). */
  async write(next:MultiChartState){props={...props,state:next};await sync();},
  dispose(){cell.dispose();parent.dispose();},
 };
}
const fresh=()=>{const gme=fixtureDataset('GME',30);return{gme,state:createMultiChartState(gme,{appearance:defaultTheme.appearance})};};
async function restart(gme:BarDataset,saved:MultiChartState){
 const again=await mount(gme,structuredClone(saved));
 expect(again.broken()).toBe('');expect(again.chart.h.port.settings().lockRatio).toBe(true);expect(again.chart.h.pane().manualScale).toMatchObject({min:100,max:150});
 const down=await again.click();expect(down.preventDefault).not.toHaveBeenCalled();expect(again.broken()).toBe('');
 again.dispose();
}
const lockedSaved=(ui:Awaited<ReturnType<typeof mount>>)=>{const saved=ui.saved();expect(saved.priceScale).toMatchObject({lockRatio:true});expect(saved.priceScale!.ratio).toBeCloseTo(0.6,12);expect(saved.chartOptions.auto).toBe(false);expect(saved.frame?.panes[0].manualRange).toEqual({min:100,max:150});};

it('INT-A-F1 menu Lock: the native price-scale menu lock saves the frame and auto flag with the lock; the next click and a restart do not quarantine',async()=>{
 const {gme,state}=fresh(),ui=await mount(gme,state);expect(ui.broken()).toBe('');
 ui.chart.h.port.openMenu('price',{x:700,y:100});
 ui.pointer('down');// the menu item click reaches the cell's pointer handler first (one open frame gesture)
 ui.chart.h.props()!.onActivate('lockRatio','pointer');
 ui.pointer('up');await gestureWindow();await ui.sync();
 expect(ui.broken()).toBe('');expect(ui.chart.h.port.isMenuOpen()).toBe(false);expect(ui.chart.h.port.settings().lockRatio).toBe(true);
 lockedSaved(ui);
 expect((await ui.click()).preventDefault).not.toHaveBeenCalled();expect(ui.broken()).toBe('');
 const saved=ui.state();
 // Reset price scale (Alt+R) while locked unlocks and returns to auto in the same order: frame first, then the document.
 expect(ui.chart.h.port.execute('reset',{origin:'keyboard'})).toEqual({ok:true});await ui.sync();expect(ui.broken()).toBe('');
 expect(ui.saved().priceScale?.lockRatio).toBe(false);expect(ui.saved().chartOptions.auto).toBe(true);expect(ui.saved().frame?.panes[0].manualRange).toBeNull();
 expect((await ui.click()).preventDefault).not.toHaveBeenCalled();expect(ui.broken()).toBe('');
 ui.dispose();await restart(gme,saved);
});

it('INT-A-F1 Settings Ok: the lock routed through the chart scale gesture (as App Ok does) then the Ok commit; the next click and a restart do not quarantine',async()=>{
 const {gme,state}=fresh(),ui=await mount(gme,state);
 // App.applyChartSettings: the lock-on row runs as the chart's own scale action first...
 const result=ui.chart.h.port.execute('lockRatio',{origin:'toolbar'});await ui.sync();expect(ui.broken()).toBe('');expect(result).toEqual({ok:true});
 // ...then the rest of the Ok writes the cell (here: the price scale document with that lock) in one workspace commit.
 const current=ui.state(),priceScale={...ui.chart.h.port.settings(),labels:{...ui.chart.h.port.settings().labels,symbolLast:false}};
 await ui.write({...current,cells:{...current.cells,[ui.id]:{...current.cells[ui.id],priceScale}}});
 expect(ui.broken()).toBe('');lockedSaved(ui);expect(ui.saved().priceScale!.labels.symbolLast).toBe(false);
 expect((await ui.click()).preventDefault).not.toHaveBeenCalled();expect(ui.broken()).toBe('');
 const saved=ui.state();ui.dispose();await restart(gme,saved);
});

// FX-F1 (Reset while locked used to publish the frame (auto frame, saved
// auto=true, lock still on) and then the unlocked document as two undo steps. One Undo then restored lock on with saved
// auto=true; after a restart and one viewport notification the lock made the pane manual and the next click quarantined.
// The reviewer's exact sequence: lock, Reset while locked, one Undo, restart, one viewport update, click.
async function lockedByMenu(){
 const {gme,state}=fresh(),ui=await mount(gme,state);
 ui.chart.h.port.openMenu('price',{x:700,y:100});ui.pointer('down');ui.chart.h.props()!.onActivate('lockRatio','pointer');ui.pointer('up');await gestureWindow();await ui.sync();
 expect(ui.broken()).toBe('');lockedSaved(ui);return{gme,ui};
}
it.each([['reset','keyboard'],['reset','toolbar'],['resetChart','keyboard']] as const)('FX-F1 %s (%s) while locked is ONE undo step; Undo, restart, a viewport update and a click do not quarantine',async(command,origin)=>{
 const {gme,ui}=await lockedByMenu(),before=ui.published.length,locked=ui.state();
 expect(ui.chart.h.port.execute(command,{origin})).toEqual({ok:true});await ui.sync();expect(ui.broken()).toBe('');
 expect(ui.published.length-before).toBe(1);
 const reset=ui.saved();expect(reset.priceScale?.lockRatio).toBe(false);expect(reset.chartOptions.auto).toBe(true);expect(reset.frame?.panes[0].manualRange).toBeNull();
 // One Undo returns to the state before the single step: the locked frame, never an intermediate.
 const undo=ui.published.at(-2)??locked;expect(undo.cells[ui.id].priceScale?.lockRatio).toBe(true);expect(undo.cells[ui.id].chartOptions.auto).toBe(false);expect(undo.cells[ui.id].frame?.panes[0].manualRange).toEqual({min:100,max:150});
 await ui.write(structuredClone(undo));expect(ui.broken()).toBe('');ui.dispose();
 const again=await mount(gme,structuredClone(undo));expect(again.broken()).toBe('');
 again.chart.h.viewportChanged();await again.sync();
 const down=await again.click();expect(down.preventDefault).not.toHaveBeenCalled();expect(again.broken()).toBe('');
 again.dispose();
});

// The close flush cannot wait for the 200 ms coalescing timer. The grid's transaction coordinator (forwarded to
// App only for the active chart tree) exposes flushFrameGesture, which runs the same flush the timer would.
it('BFABC-R3: the grid coordinator publishes a pending frame gesture at once, through the same flush as the timer, exactly once',async()=>{
 const {gme,state}=fresh(),ui=await mount(gme,state);expect(ui.broken()).toBe('');
 const flushNow=ui.coordinator()?.flushFrameGesture;expect(flushNow).toBeTypeOf('function');
 const before=ui.published.length;
 ui.pointer('down');const pane=ui.chart.h.pane();pane.manualScale={...pane.scale,min:100,max:150};ui.pointer('up');
 expect(ui.published.length).toBe(before);// still inside the 200 ms window
 flushNow!();
 expect(ui.published.length).toBe(before+1);const saved=ui.published.at(-1)!.cells[ui.id];expect(saved.frame?.panes[0].manualRange).toEqual({min:100,max:150});expect(saved.chartOptions.auto).toBe(false);
 await gestureWindow();await ui.sync();expect(ui.published.length).toBe(before+1);expect(ui.broken()).toBe('');
 flushNow!();expect(ui.published.length).toBe(before+1);// nothing pending: a no-op
 ui.dispose();
});

// Hardening follow-up: a cell with no stored price scale document runs on the factory defaults. After the
// first document change is undone (the cell has no document again) the chart must return to those defaults, so a later
// Lock folds exactly defaults + lock into the frame publication and the narrowed root guard accepts it.
it('R1 follow-up: first price-scale change, Undo, then Lock: defaults are restored, the lock is accepted by root, and a click and a restart do not quarantine',async()=>{
 const {gme,state}=fresh(),ui=await mount(gme,state);expect(ui.broken()).toBe('');
 const opening=ui.state();expect(ui.saved().priceScale).toBeUndefined();
 expect(ui.chart.h.port.execute('labels.symbolLast',{origin:'chart-pointer'}).ok).toBe(true);await ui.sync();
 expect(ui.saved().priceScale?.labels.symbolLast).toBe(false);
 await ui.write(opening);// Undo: the workspace writes the prior state back, with no stored document
 expect(ui.saved().priceScale).toBeUndefined();expect(ui.chart.h.port.settings()).toEqual(defaultPriceScaleSettings());
 ui.chart.h.port.openMenu('price',{x:700,y:100});ui.pointer('down');ui.chart.h.props()!.onActivate('lockRatio','pointer');ui.pointer('up');await gestureWindow();await ui.sync();
 expect(ui.broken()).toBe('');lockedSaved(ui);expect(ui.saved().priceScale).toEqual({...defaultPriceScaleSettings(),lockRatio:true,ratio:ui.saved().priceScale!.ratio});
 // Root acceptance of that frame publication (App.acceptGrid -> prepareGridFrameHistory, narrowed).
 const lock=ui.frames.at(-1)!;expect(lock.next.cells[ui.id].priceScale?.lockRatio).toBe(true);
 const workspace={...createInitialWorkspace(),grid:lock.previous};
 expect(()=>prepareGridFrameHistory(workspace,lock.next,lock.baseline,{datasets:[gme],dataset:gme,bars:gme.bars,replay:null})).not.toThrow();
 const down=await ui.click();expect(down.preventDefault).not.toHaveBeenCalled();expect(ui.broken()).toBe('');
 const saved=structuredClone(ui.state());ui.dispose();await restart(gme,saved);
});

// Hardening review, probe S5: the visibility-hidden save flush must not end a gesture whose pointer is still held.
// Default flushFrameGesture() publishes only a finished gesture; the held drag's own release publishes it. The close
// request passes {includeHeld:true} and finishes a held gesture before the save (the window then closes).
it('HD-R1: a hidden-window flush mid-drag leaves the held gesture alone; its release publishes it once and the next click is accepted',async()=>{
 const {gme,state}=fresh(),ui=await mount(gme,state);expect(ui.broken()).toBe('');
 const before=ui.published.length;
 ui.pointer('down');
 ui.coordinator()!.flushFrameGesture!();// minimized while the pointer is held
 expect(ui.published.length).toBe(before);
 const pane=ui.chart.h.pane();pane.manualScale={...pane.scale,min:100,max:150};// the drag continues and changes the scale
 ui.pointer('up');await gestureWindow();await ui.sync();
 expect(ui.published.length).toBe(before+1);expect(ui.saved().frame?.panes[0].manualRange).toEqual({min:100,max:150});expect(ui.saved().chartOptions.auto).toBe(false);
 const down=await ui.click();expect(down.preventDefault).not.toHaveBeenCalled();expect(ui.broken()).toBe('');
 ui.dispose();
});
it('HD-R1: the close flush (includeHeld) finishes a held gesture before the save, once, without a later refusal',async()=>{
 const {gme,state}=fresh(),ui=await mount(gme,state);expect(ui.broken()).toBe('');
 const before=ui.published.length;
 ui.pointer('down');const pane=ui.chart.h.pane();pane.manualScale={...pane.scale,min:100,max:150};
 ui.coordinator()!.flushFrameGesture!({includeHeld:true});
 expect(ui.published.length).toBe(before+1);expect(ui.published.at(-1)!.cells[ui.id].frame?.panes[0].manualRange).toEqual({min:100,max:150});
 ui.pointer('up');await gestureWindow();await ui.sync();expect(ui.published.length).toBe(before+1);expect(ui.broken()).toBe('');
 ui.dispose();
});
