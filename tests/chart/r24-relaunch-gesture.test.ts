import {expect,it,vi} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {createMultiChartState,resizeMultiChartState,type GridFrameEditBaseline} from '../../src/ui/MultiChartGrid';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createGridFrameGesture} from '../../src/chart/grid-frame-gesture';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';
import type {ChartController} from '../../src/chart/adapter';

// a pointer press on the inactive cell of a two-column grid opens a frame gesture, and the same press focuses that cell, so the
// workspace changes (activeCellId) before the gesture settles. flush() threw "Workspace changed during the native frame
// gesture" even though the press moved nothing, quarantined both charts, and every later save (autosave, Ctrl+S, the close
// flush) was refused with "Chart tree input or configuration is not settled", so the relaunch showed the last good save.
// Harness copied from grid-frame-gesture.test.ts; synthetic fixture data only.
function harness(){let external:any=null;const dataset=fixtureDataset('GME',5);let state=resizeMultiChartState(createMultiChartState(dataset,{appearance:defaultTheme.appearance}),'two-columns');state.layout.sync.time=true;const source=sourceContextForDataset(dataset,dataset.bars),frames=new Map<string,HistoricalChartFrame>(),viewports=new Map<string,{from:number;to:number}>(),owners=new Map<string,any>(),published:Array<{next:typeof state;baseline:GridFrameEditBaseline}>=[],failures:string[]=[];let accept=true;for(const row of state.layout.cells){frames.set(row.id,{schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null});viewports.set(row.id,{from:1,to:5});owners.set(row.id,{chart:{captureHistoricalFrame:()=>structuredClone(frames.get(row.id)!),getViewport:()=>viewports.get(row.id)} as unknown as ChartController,input:{source,bars:dataset.bars,style:'candles'},executionIdentity:'ordinary',fingerprints:{}});}const gesture=createGridFrameGesture({read:()=>external??state,cell:id=>owners.get(id)??null,publish:(next,baseline)=>{published.push({next,baseline});if(accept){state=next;external=null;}return accept;},failed:(ids,message)=>failures.push(message)});return{gesture,state:()=>external??state,commit:(next:any)=>{external=next;},frames,viewports,owners,published,failures,reject:()=>accept=false};}

const focusOn=(state:any,id:string)=>({...state,layout:{...state.layout,activeCellId:id}});
it('a press that only focused the other cell publishes nothing and reports nothing (fail-first: it quarantined both charts)',()=>{
 const h=harness(),before=h.state(),other=before.layout.cells.find((row:any)=>row.id!==before.layout.activeCellId)!.id;
 expect(h.gesture.begin(other)).toBe(true);
 h.commit(focusOn(before,other));// the same press focused the cell (a workspace commit outside the gesture)
 h.gesture.flush();
 expect(h.failures).toEqual([]);expect(h.published).toEqual([]);expect(h.gesture.interceptsViewport()).toBe(false);
});
it('a pan that also focused the cell is published on top of the focus change, with the focused grid as its undo baseline',()=>{
 const h=harness(),before=h.state(),other=before.layout.cells.find((row:any)=>row.id!==before.layout.activeCellId)!.id;
 expect(h.gesture.begin(other)).toBe(true);
 const focused=focusOn(before,other);h.commit(focused);
 for(const row of before.layout.cells)h.viewports.set(row.id,{from:2,to:6});// sync.time: both linked cells moved
 h.gesture.flush();
 expect(h.failures).toEqual([]);expect(h.published).toHaveLength(1);
 const {next,baseline}=h.published[0];
 expect(baseline.expectedGrid).toBe(focused);expect(next.layout).toBe(focused.layout);expect(next.layout.activeCellId).toBe(other);
 for(const row of before.layout.cells){expect(next.cells[row.id].viewport).toEqual({from:2,to:6});expect(baseline.viewports[row.id]).toEqual({from:1,to:5});}
});
it('a gesture whose own chart changed underneath it is still refused (no silent overwrite of the other change)',()=>{
 const h=harness(),before=h.state(),id=before.layout.activeCellId;
 expect(h.gesture.begin(id)).toBe(true);
 h.commit({...before,cells:{...before.cells,[id]:{...before.cells[id],seriesHidden:true}}});
 h.viewports.set(id,{from:2,to:6});h.gesture.flush();
 expect(h.published).toEqual([]);expect(h.failures[0]).toContain('Workspace changed during the native frame gesture');
});
it('a gesture is refused when the viewport links changed underneath it',()=>{
 const h=harness(),before=h.state(),id=before.layout.activeCellId;
 expect(h.gesture.begin(id)).toBe(true);
 h.commit({...before,layout:{...before.layout,sync:{...before.layout.sync,time:false}}});
 h.viewports.set(id,{from:2,to:6});h.gesture.flush();
 expect(h.published).toEqual([]);expect(h.failures[0]).toContain('Workspace changed during the native frame gesture');
});
it('a released press that moved nothing settles at once, so a source change typed within 200 ms cannot quarantine the cell',async()=>{vi.useFakeTimers();try{
 const h=harness(),before=h.state(),other=before.layout.cells.find((row:any)=>row.id!==before.layout.activeCellId)!.id;
 expect(h.gesture.begin(other)).toBe(true);
 const focused=focusOn(before,other);h.commit(focused);
 h.gesture.finish();// pointer released without moving the chart
 expect(h.gesture.interceptsViewport(),'the 200 ms window still runs (BD-R2)').toBe(true);
 // The header symbol change lands before the old 200 ms window ends: new source for the focused cell, new chart input.
 const owner=h.owners.get(other);h.owners.set(other,{...owner,input:{...owner.input,bars:owner.input.bars.map((row:any)=>({...row}))}});
 h.commit({...focused,cells:{...focused.cells,[other]:{...focused.cells[other],seriesHidden:true}}});
 await vi.advanceTimersByTimeAsync(250);
 expect(h.failures).toEqual([]);expect(h.published).toEqual([]);
}finally{vi.useRealTimers();}});
it('a released pan still coalesces for 200 ms and publishes once',async()=>{vi.useFakeTimers();try{
 const h=harness(),id=h.state().layout.activeCellId;
 expect(h.gesture.begin(id)).toBe(true);h.viewports.set(id,{from:2,to:6});h.gesture.finish();
 expect(h.gesture.interceptsViewport()).toBe(true);await vi.advanceTimersByTimeAsync(200);
 expect(h.published).toHaveLength(1);expect(h.failures).toEqual([]);
}finally{vi.useRealTimers();}});
// follow-up (price-scale-extended receipts 20261022T231953749Z and 233103728Z, step axis-a-button...): a native frame
// change that lands after the release of a press that moved nothing (vela applies the axis double-click reset in its dblclick
// handler, after the second pointerup) was dropped by the release-time "clean" decision. The saved scale controls stayed
// behind the native price frame, and the next press refused with "Opening price frame and saved scale controls disagree"
// and quarantined the chart. The flush now checks again: a chart that still shows its opening input but moved is published.
it('a frame change made after a clean release (the axis double-click reset) is still published, and the next press opens',async()=>{vi.useFakeTimers();try{
 const h=harness(),id=h.state().layout.activeCellId;
 expect(h.gesture.begin(id)).toBe(true);
 h.gesture.finish();// released without moving anything
 h.frames.get(id)!.panes[0].manualRange={min:1,max:2};// the click-time native change (Auto off), after the release
 await vi.advanceTimersByTimeAsync(250);
 expect(h.failures).toEqual([]);expect(h.published).toHaveLength(1);
 expect(h.published[0].next.cells[id].chartOptions.auto).toBe(false);
 expect(h.gesture.begin(id),'the next press opens on the saved Auto off').toBe(true);expect(h.failures).toEqual([]);
}finally{vi.useRealTimers();}});
