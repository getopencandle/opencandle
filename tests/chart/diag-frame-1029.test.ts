import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {createMultiChartState,resizeMultiChartState,type GridFrameEditBaseline} from '../../src/ui/MultiChartGrid';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createGridFrameGesture,SETTLE_LIMIT_MS,SETTLE_POLL_MS} from '../../src/chart/grid-frame-gesture';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';
import type {ChartController} from '../../src/chart/adapter';
// "Native frame publication is unavailable ... Chart input or native owner
// changed during the frame gesture" after a layout change and a SPY -> GME switch. SYNTHETIC fixture bars and a controlled
// native port: the chart refuses a frame capture against an input it no longer shows, as the adapter does.

beforeEach(()=>{vi.useFakeTimers();});
afterEach(()=>{vi.useRealTimers();});

function harness(layout:'single'|'two-columns'='single'){
 const spy=fixtureDataset('SPY',5),gme=fixtureDataset('GME',5);let state=resizeMultiChartState(createMultiChartState(spy,{appearance:defaultTheme.appearance}),layout);
 const inputOf=(dataset:typeof spy)=>({source:sourceContextForDataset(dataset,dataset.bars),bars:dataset.bars,style:'candles' as const});
 const frameOf=(input:ReturnType<typeof inputOf>):HistoricalChartFrame=>({schemaVersion:1,basis:{basisIdentity:input.source.basisIdentity!,revision:input.source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null});
 const shown=new Map<string,ReturnType<typeof inputOf>>(),frames=new Map<string,HistoricalChartFrame>(),viewports=new Map<string,{from:number;to:number}>(),charts=new Map<string,ChartController>(),observable=new Map<string,boolean>(),busy=new Map<string,boolean>(),published:Array<{next:typeof state;baseline:GridFrameEditBaseline}>=[],failures:string[]=[];
 for(const row of state.layout.cells){const input=inputOf(spy);shown.set(row.id,input);frames.set(row.id,frameOf(input));viewports.set(row.id,{from:1,to:5});observable.set(row.id,true);
  charts.set(row.id,{isInputCurrent:(input:{bars:unknown})=>!busy.get(row.id)&&input.bars===shown.get(row.id)!.bars,captureHistoricalFrame:({expected}:{expected:{bars:unknown}})=>{if(busy.get(row.id)||expected.bars!==shown.get(row.id)!.bars)throw Error('Chart input changed or is pending before frame capture');return structuredClone(frames.get(row.id)!);},getViewport:()=>viewports.get(row.id)} as unknown as ChartController);}
 const gesture=createGridFrameGesture({read:()=>state,cell:id=>observable.get(id)&&charts.get(id)?{chart:charts.get(id)!,input:shown.get(id)!,executionIdentity:'ordinary',fingerprints:{}}:null,publish:(next,baseline)=>{published.push({next,baseline});state=next;return true;},failed:(_ids,message)=>failures.push(message)});
 // MultiChartGrid captureCell: invalidate, then the cell change is published.
 const capture=(id:string,patch:Record<string,unknown>)=>{gesture.invalidate();if(failures.length)return;state={...state,cells:{...state.cells,[id]:{...state.cells[id],...patch} as any}};};
 // App: the symbol box / watchlist replaces the chart input (same native chart), the chart reloads with the saved controls.
 const switchTo=(id:string)=>{const input=inputOf(gme);shown.set(id,input);frames.set(id,frameOf(input));viewports.set(id,{from:0,to:4});state={...state,cells:{...state.cells,[id]:{...state.cells[id],viewport:{from:0,to:4}} as any}};};
 return{gesture,state:()=>state,frames,viewports,observable,busy,published,failures,capture,switchTo};
}

it('owner repro: a held clean gesture kept open by a cell change, then SPY -> GME and a layout flush: closed quietly, no card',()=>{
 const h=harness(),id=h.state().layout.activeCellId;
 expect(h.gesture.begin(id)).toBe(true);
 h.capture(id,{drawings:{lv:'cell change while held'}});// The gesture stays open (stale)
 expect(h.gesture.interceptsViewport()).toBe(true);
 h.switchTo(id);
 h.gesture.flush();// MultiChartGrid publish: the layout snapshot changed (cell symbol)
 expect(h.failures,'fail-first: "Chart input or native owner changed during the frame gesture"').toEqual([]);
 expect(h.published).toEqual([]);expect(h.gesture.interceptsViewport()).toBe(false);
 // The next press on the new chart opens normally (the old card blocked it with "This chart has an unsaved error").
 expect(h.gesture.begin(id)).toBe(true);h.gesture.finish();h.gesture.flush();expect(h.failures).toEqual([]);
});
it('a press whose release never reached the grid (held stays set) meets the symbol switch: closed quietly',()=>{
 const h=harness(),id=h.state().layout.activeCellId;
 h.gesture.begin(id);// no finish
 h.switchTo(id);h.gesture.flush();
 expect(h.failures).toEqual([]);expect(h.published).toEqual([]);expect(h.gesture.interceptsViewport()).toBe(false);
});
it('the switch lands while the new chart is still loading (not observable): closed quietly, the next press re-checks',()=>{
 const h=harness(),id=h.state().layout.activeCellId;
 h.gesture.begin(id);h.capture(id,{drawings:{lv:'x'}});h.switchTo(id);h.observable.set(id,false);h.gesture.flush();
 expect(h.failures).toEqual([]);expect(h.published).toEqual([]);expect(h.gesture.interceptsViewport(),'the save waits for the chart to settle').toBe(true);
 expect(h.gesture.begin(id),'still loading: a temporary refusal').toBe(false);expect(h.failures).toEqual([]);
 h.observable.set(id,true);vi.advanceTimersByTime(SETTLE_POLL_MS);
 expect(h.failures).toEqual([]);expect(h.published).toEqual([]);expect(h.gesture.interceptsViewport()).toBe(false);
 expect(h.gesture.begin(id)).toBe(true);
});
it('a cell change after the switch (captureCell invalidate) is not a dirty interrupted gesture',()=>{
 const h=harness(),id=h.state().layout.activeCellId;
 h.gesture.begin(id);h.switchTo(id);h.capture(id,{drawings:{lv:'y'}});
 expect(h.failures).toEqual([]);
});
it('a genuine unsaved frame change is still refused: the chart moved on its opening input and cannot be observed',()=>{
 const h=harness(),id=h.state().layout.activeCellId;
 h.gesture.begin(id);h.viewports.set(id,{from:2,to:6});h.observable.set(id,false);h.gesture.finish();h.gesture.flush();
 expect(h.failures,'waits for the chart first').toEqual([]);
 vi.advanceTimersByTime(SETTLE_LIMIT_MS+SETTLE_POLL_MS);
 expect(h.published).toEqual([]);expect(h.failures[0]).toContain('Chart input or native owner changed during the frame gesture');
});
it('a switch that leaves the native price frame disagreeing with the saved scale controls still warns',()=>{
 const h=harness(),id=h.state().layout.activeCellId;
 h.gesture.begin(id);h.switchTo(id);h.frames.get(id)!.panes[0].manualRange={min:10,max:20};// native manual, saved auto
 h.gesture.flush();
 expect(h.failures[0]).toContain('Chart input or native owner changed during the frame gesture');
});
it('two cells: the switched cell is dropped quietly and the other cell\'s pan is still published with its baseline',()=>{
 const h=harness('two-columns'),[a,b]=h.state().layout.cells.map(row=>row.id);
 const before=h.state();before.layout.sync.time=true;
 expect(h.gesture.begin(a)).toBe(true);
 h.viewports.set(b,{from:2,to:6});h.gesture.finish();
 h.switchTo(a);// the switched cell's saved state changed, the other cell's did not
 h.gesture.flush();
 expect(h.failures).toEqual([]);expect(h.published).toHaveLength(1);
 const {next,baseline}=h.published[0];expect(next.cells[b].viewport).toEqual({from:2,to:6});expect(Object.keys(baseline.frames)).toEqual([b]);expect(next.cells[a].viewport).toEqual({from:0,to:4});
});
it('F1 (FIX-TEXT-1029) unchanged: a held stale gesture on the same input still saves the scale going manual',()=>{
 const h=harness(),id=h.state().layout.activeCellId;
 h.gesture.begin(id);h.capture(id,{drawings:{lv:'text'}});h.frames.get(id)!.panes[0].manualRange={min:18,max:28};
 h.gesture.finish();h.gesture.flush();
 expect(h.failures).toEqual([]);expect(h.published).toHaveLength(1);expect(h.published[0].next.cells[id].chartOptions.auto).toBe(false);
});

// Real-app cause: a live chart applies each feed snapshot asynchronously, and for that moment
// isInputCurrent is false and a frame capture throws "Chart input changed or is pending before frame capture".
it('begin on a chart that is applying a pending input is a temporary refusal: no card, the next press opens',()=>{
 const h=harness(),id=h.state().layout.activeCellId;
 h.busy.set(id,true);
 expect(h.gesture.begin(id),'fail-first: quarantined with "The frame gesture cannot be saved"').toBe(false);
 expect(h.failures).toEqual([]);expect(h.gesture.interceptsViewport()).toBe(false);
 h.busy.set(id,false);expect(h.gesture.begin(id)).toBe(true);h.gesture.finish();vi.advanceTimersByTime(250);expect(h.failures).toEqual([]);
});
it('a pan whose save meets a pending input waits for the chart and then saves the pan',()=>{
 const h=harness(),id=h.state().layout.activeCellId;
 expect(h.gesture.begin(id)).toBe(true);h.viewports.set(id,{from:2,to:6});h.gesture.finish();
 h.busy.set(id,true);vi.advanceTimersByTime(200);
 expect(h.failures,'fail-first: "Native frame publication is unavailable ... pending before frame capture"').toEqual([]);expect(h.published).toEqual([]);
 expect(h.gesture.begin(id),'a new press waits for the save').toBe(false);
 h.busy.set(id,false);vi.advanceTimersByTime(SETTLE_POLL_MS);
 expect(h.failures).toEqual([]);expect(h.published).toHaveLength(1);expect(h.published[0].next.cells[id].viewport).toEqual({from:2,to:6});
 expect(h.gesture.interceptsViewport()).toBe(false);expect(h.gesture.begin(id)).toBe(true);
});
it('a cell change while the chart applies a pending input is not a dirty interrupted gesture; the pan is saved after it',()=>{
 const h=harness(),id=h.state().layout.activeCellId;
 h.gesture.begin(id);h.viewports.set(id,{from:2,to:6});h.gesture.finish();
 h.busy.set(id,true);h.capture(id,{drawings:{lv:'placed'}});
 expect(h.failures,'fail-first: "a dirty gesture was interrupted"').toEqual([]);
 h.busy.set(id,false);vi.advanceTimersByTime(250);
 expect(h.failures).toEqual([]);expect(h.published).toHaveLength(1);
 const next=h.published[0].next.cells[id] as unknown as {viewport:unknown;drawings:unknown};expect(next.viewport).toEqual({from:2,to:6});expect(next.drawings).toEqual({lv:'placed'});
});
it('a chart that never settles still reports the unsaved pan after SETTLE_LIMIT_MS',()=>{
 const h=harness(),id=h.state().layout.activeCellId;
 h.gesture.begin(id);h.viewports.set(id,{from:2,to:6});h.gesture.finish();h.busy.set(id,true);
 vi.advanceTimersByTime(200+SETTLE_LIMIT_MS+SETTLE_POLL_MS);
 expect(h.published).toEqual([]);expect(h.failures[0]).toContain('Native frame publication is unavailable');
});
it('a clean released gesture meeting a pending input closes quietly once the chart settles',()=>{
 const h=harness(),id=h.state().layout.activeCellId;
 h.gesture.begin(id);h.gesture.finish();h.busy.set(id,true);vi.advanceTimersByTime(200);
 h.busy.set(id,false);vi.advanceTimersByTime(SETTLE_POLL_MS);
 expect(h.failures).toEqual([]);expect(h.published).toEqual([]);expect(h.gesture.interceptsViewport()).toBe(false);
});
// MultiChartGrid wiring (source pins, like tests/ui/fix-ui-1029.test.ts): a layout pick right after a wheel or pan saves the
// open frame gesture first and is queued while that save is still open or not rendered yet (it was rejected or dropped).
it('wiring: a layout pick saves the open frame gesture first and queues behind it, keeping the pick time',async()=>{
 const {readFileSync}=await import('node:fs');const grid=readFileSync('src/ui/MultiChartGrid.tsx','utf8');
 expect(grid).toContain('if(frameGesture.interceptsViewport())frameGesture.flush();if(!frameGesture.interceptsViewport()&&latest.current.state===resizeOwner.state)return false;layoutPickQueue.pending={layoutId,at:pickedAt};setTimeout(()=>layoutPickQueue.notify(),SETTLE_POLL_MS);return true;');
 expect(grid).toContain('if(queueBehindFrame())return;if(!ownsResize())return;');
 expect(grid).toContain('void resizeLayout(pick.layoutId,pick.at);');
 expect(grid).toContain('layoutPickQueue.pending={layoutId,at:Date.now()};return;');// Queue unchanged
});
