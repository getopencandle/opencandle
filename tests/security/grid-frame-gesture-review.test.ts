import {expect,it,vi} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {defaultTheme} from '../../src/ui/themes';
import {createMultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {createGridFrameGesture,type FrameGestureCell} from '../../src/chart/grid-frame-gesture';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';
import type {ChartController} from '../../src/chart/adapter';
// Actual gesture owner helper; native capture/viewport are deterministic ports.
// No native pointer capture, timer responsiveness, DOM or paint evidence.
function fixture(){const dataset=fixtureDataset('GME',3);let state=resizeMultiChartState(createMultiChartState(dataset,{appearance:defaultTheme.appearance}),'two-rows');const source=sourceContextForDataset(dataset),frames=new Map<string,HistoricalChartFrame>(),ranges=new Map<string,{from:number;to:number}>(),owners=new Map<string,FrameGestureCell>(),published:any[]=[],failures:Array<{ids:string[];message:string}>=[];for(const cell of state.layout.cells){frames.set(cell.id,{schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null});ranges.set(cell.id,{from:100,to:200});owners.set(cell.id,{chart:{captureHistoricalFrame:()=>structuredClone(frames.get(cell.id)!),getViewport:()=>ranges.get(cell.id)} as unknown as ChartController,input:{bars:dataset.bars,source,style:'candles'},executionIdentity:'ordinary',fingerprints:{}});}const gesture=createGridFrameGesture({read:()=>state,cell:id=>owners.get(id)??null,publish:(next,baseline)=>{published.push({next,baseline});state=next;return true;},failed:(ids,message)=>failures.push({ids,message})});return{gesture,state:()=>state,frames,ranges,owners,published,failures};}
it('unrelated capture invalidation cannot silently discard an already changed observed viewport',()=>{
 const s=fixture(),id=s.state().layout.activeCellId;expect(s.gesture.begin(id)).toBe(true);s.ranges.set(id,{from:120,to:220});s.gesture.invalidate();expect(s.published).toEqual([]);expect(s.failures.length).toBeGreaterThan(0);expect(s.failures.some(row=>row.ids.includes(id))).toBe(true);s.gesture.dispose();
});
it('unchanged gesture invalidation is benign and cancels any buffered timer',()=>{
 vi.useFakeTimers();try{const s=fixture(),id=s.state().layout.activeCellId;s.gesture.begin(id);s.gesture.finish();s.gesture.invalidate();expect(vi.getTimerCount()).toBe(0);s.gesture.flush();expect(s.published).toEqual([]);expect(s.failures).toEqual([]);s.gesture.dispose();}finally{vi.useRealTimers();}
});
it('a second unlinked chart gesture cannot be coalesced under only the first chart opening authority',()=>{
 const s=fixture(),[first,second]=s.state().layout.cells.map(row=>row.id);s.gesture.begin(first);s.ranges.set(first,{from:110,to:210});s.gesture.finish();const accepted=s.gesture.begin(second);if(accepted)s.ranges.set(second,{from:140,to:240});s.gesture.flush();if(accepted){const covered=new Set(s.published.flatMap(row=>Object.keys(row.baseline.frames)));expect(covered.has(first)).toBe(true);expect(covered.has(second)).toBe(true);}else expect(s.failures.length).toBeGreaterThan(0);s.gesture.dispose();
});
it('linked changes carry exact separate opening viewports without touching original saved state',()=>{
 const s=fixture(),before=s.state(),ids=before.layout.cells.map(row=>row.id);before.layout.sync.dateRange=true;s.ranges.set(ids[1],{from:300,to:400});s.gesture.begin(ids[0]);s.ranges.set(ids[0],{from:130,to:230});s.ranges.set(ids[1],{from:330,to:430});s.gesture.flush();expect(s.published).toHaveLength(1);const {next,baseline}=s.published[0];expect(baseline.viewports[ids[0]]).toEqual({from:100,to:200});expect(baseline.viewports[ids[1]]).toEqual({from:300,to:400});expect(next.cells[ids[1]].viewport).toEqual({from:330,to:430});expect(before.cells[ids[0]].viewport).toBeUndefined();expect(before.cells[ids[1]].viewport).toBeUndefined();s.gesture.dispose();
});
it('disposed helpers ignore retained flush callbacks and never publish buffered observations',async()=>{
 vi.useFakeTimers();try{const s=fixture(),id=s.state().layout.activeCellId;s.gesture.begin(id);s.ranges.set(id,{from:150,to:250});s.gesture.finish();s.gesture.dispose();await vi.advanceTimersByTimeAsync(500);s.gesture.flush();expect(s.published).toEqual([]);expect(s.failures).toEqual([]);expect(vi.getTimerCount()).toBe(0);}finally{vi.useRealTimers();}
});
