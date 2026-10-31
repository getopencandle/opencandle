import {expect,it,vi} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {createMultiChartState,resizeMultiChartState,type GridFrameEditBaseline} from '../../src/ui/MultiChartGrid';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createGridFrameGesture} from '../../src/chart/grid-frame-gesture';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';
import type {ChartController} from '../../src/chart/adapter';
function harness(){const dataset=fixtureDataset('GME',5);let state=resizeMultiChartState(createMultiChartState(dataset,{appearance:defaultTheme.appearance}),'two-columns');state.layout.sync.time=true;const source=sourceContextForDataset(dataset,dataset.bars),frames=new Map<string,HistoricalChartFrame>(),viewports=new Map<string,{from:number;to:number}>(),owners=new Map<string,any>(),published:Array<{next:typeof state;baseline:GridFrameEditBaseline}>=[],failures:string[]=[];let accept=true;for(const row of state.layout.cells){frames.set(row.id,{schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null});viewports.set(row.id,{from:1,to:5});owners.set(row.id,{chart:{captureHistoricalFrame:()=>structuredClone(frames.get(row.id)!),getViewport:()=>viewports.get(row.id)} as unknown as ChartController,input:{source,bars:dataset.bars,style:'candles'},executionIdentity:'ordinary',fingerprints:{}});}const gesture=createGridFrameGesture({read:()=>state,cell:id=>owners.get(id)??null,publish:(next,baseline)=>{published.push({next,baseline});if(accept)state=next;return accept;},failed:(ids,message)=>failures.push(message)});return{gesture,state:()=>state,frames,viewports,owners,published,failures,reject:()=>accept=false};}
it('first native pan captures observed opening viewports even when no saved viewport exists; every changed linked target has an opening baseline',()=>{const h=harness(),before=h.state(),ids=before.layout.cells.map(row=>row.id);expect(before.cells[ids[0]].viewport).toBeUndefined();expect(h.gesture.begin(ids[0])).toBe(true);for(const id of ids)h.viewports.set(id,{from:2,to:6});expect(h.gesture.interceptsViewport()).toBe(true);h.gesture.flush();expect(h.published).toHaveLength(1);const {next,baseline}=h.published[0];expect(baseline.expectedGrid).toBe(before);expect(Object.keys(baseline.frames)).toEqual(ids);expect(Object.keys(baseline.inputs)).toEqual(ids);expect(baseline.viewports[ids[0]]).toEqual({from:1,to:5});expect(next.cells[ids[0]].viewport).toEqual({from:2,to:6});expect(h.failures).toEqual([]);});
it('unchanged linked targets are omitted and manual scale aliases come from the accepted closing price frame',()=>{const h=harness(),id=h.state().layout.activeCellId;h.gesture.begin(id);h.frames.get(id)!.panes[0].manualRange={min:10,max:40};h.frames.get(id)!.panes[0].invert=true;h.gesture.flush();expect(Object.keys(h.published[0].baseline.frames)).toEqual([id]);expect(h.published[0].next.cells[id].chartOptions).toMatchObject({auto:false,invert:true,scale:'linear'});});
it('missing linked opening observation refuses the entire gesture rather than inventing a viewport',()=>{const h=harness(),ids=h.state().layout.cells.map(row=>row.id);h.owners.delete(ids[1]);expect(h.gesture.begin(ids[0])).toBe(false);h.gesture.flush();expect(h.published).toEqual([]);// Still refused, but as a temporary refusal: no failure report, no quarantine, no sticky marker.
 expect(h.failures).toEqual([]);expect(h.gesture.interceptsViewport()).toBe(false);});
it('native owner replacement and same-count array corrections invalidate the opening authority',()=>{for(const mode of ['owner','array']){const h=harness(),id=h.state().layout.activeCellId;h.gesture.begin(id);const before=h.owners.get(id);h.owners.set(id,mode==='owner'?{...before,chart:{...before.chart}}:{...before,input:{...before.input,bars:before.input.bars.map((row:any)=>({...row}))}});h.viewports.set(id,{from:2,to:6});h.gesture.flush();expect(h.published).toEqual([]);expect(h.failures[0]).toContain('owner changed');}});
it('rejected publication leaves saved model unchanged and exposes recovery without reporting success',()=>{const h=harness(),before=h.state(),id=before.layout.activeCellId;h.gesture.begin(id);h.viewports.set(id,{from:2,to:6});h.reject();h.gesture.flush();expect(h.state()).toBe(before);expect(h.failures[0]).toContain('rejected');});
it('autofit/resizing without user gesture cannot create frame history; finish coalesces multiple callbacks once',async()=>{vi.useFakeTimers();try{const h=harness(),id=h.state().layout.activeCellId;h.viewports.set(id,{from:2,to:6});h.gesture.flush();expect(h.published).toEqual([]);h.gesture.begin(id);h.viewports.set(id,{from:3,to:7});h.gesture.finish();h.gesture.finish();await vi.advanceTimersByTimeAsync(200);expect(h.published).toHaveLength(1);h.gesture.dispose();expect(vi.getTimerCount()).toBe(0);}finally{vi.useRealTimers();}});
it('dirty cancellation cannot discard an observed pan while unchanged cancellation is benign',()=>{const dirty=harness(),id=dirty.state().layout.activeCellId;dirty.gesture.begin(id);dirty.viewports.set(id,{from:2,to:6});dirty.gesture.invalidate();expect(dirty.published).toEqual([]);expect(dirty.failures[0]).toContain('dirty gesture');const unchanged=harness();unchanged.gesture.begin(unchanged.state().layout.activeCellId);unchanged.gesture.invalidate();expect(unchanged.failures).toEqual([]);});

// A wheel turn that arrived after the 200 ms save but before the
// grid's asynchronous fingerprint cache caught up found no cell; begin set a sticky `blocked` marker and reported "cannot
// be saved" (quarantine), and only a flush (never run after a refused begin) cleared it, so every later wheel, pointer and
// key gesture on that chart was refused. A missing cell is now a temporary refusal (no marker, no failure), a failed begin
// never leaves the marker behind, and the next gesture opens from the just-saved state (continuous undo baselines).
it('FREEZE-A: a begin refused by a temporarily unavailable cell after a saved gesture is not sticky and reports nothing',async()=>{vi.useFakeTimers();try{
 const h=harness(),ids=h.state().layout.cells.map(row=>row.id),id=ids[0];
 expect(h.gesture.begin(id)).toBe(true);h.viewports.set(id,{from:2,to:6});h.gesture.finish();
 await vi.advanceTimersByTimeAsync(201);expect(h.published).toHaveLength(1);const saved=h.published[0].next;expect(h.state()).toBe(saved);
 const owner=h.owners.get(id);h.owners.delete(id);// the fingerprint cache has not caught up with the saved cell yet
 expect(h.gesture.begin(id)).toBe(false);
 expect(h.failures,'a temporary refusal reports no failure and quarantines nothing').toEqual([]);
 expect(h.gesture.interceptsViewport(),'no sticky blocked marker').toBe(false);
 h.owners.set(id,owner);
 expect(h.gesture.begin(id),'the next turn is accepted').toBe(true);h.viewports.set(id,{from:3,to:7});h.gesture.finish();
 await vi.advanceTimersByTimeAsync(201);expect(h.published).toHaveLength(2);
 expect(h.published[1].baseline.expectedGrid,'undo baselines chain: the second gesture opens from the first one\'s saved state').toBe(saved);
 expect(h.published[1].baseline.viewports[id]).toEqual({from:2,to:6});expect(h.failures).toEqual([]);
}finally{vi.useRealTimers();}});
it('FREEZE-A: a begin that fails for a real reason reports once but does not refuse every later gesture',()=>{
 const h=harness(),id=h.state().layout.cells[0].id,viewport=h.viewports.get(id)!;
 h.viewports.delete(id);expect(h.gesture.begin(id)).toBe(false);expect(h.failures).toHaveLength(1);expect(h.failures[0]).toContain('cannot be saved');
 h.viewports.set(id,viewport);expect(h.gesture.begin(id),'a failed begin leaves no marker that refuses the next one').toBe(true);
 h.viewports.set(id,{from:2,to:6});h.gesture.flush();expect(h.published).toHaveLength(1);expect(h.failures).toHaveLength(1);
});
