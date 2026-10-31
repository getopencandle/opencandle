import {afterEach,expect,it} from 'vitest';
import {createDrawing,NativeRenderer} from '@luxalgo/vela';
import {readdirSync,readFileSync} from 'node:fs';
import {join,sep} from 'node:path';
import {hiddenIndicatorHarness} from './hidden-indicator-harness';
import {createRendererFramePort,coreModelAbsence} from '../../src/chart/renderer-frame';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {createGridFrameGesture} from '../../src/chart/grid-frame-gesture';
import {createMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {defaultTheme} from '../../src/ui/themes';
import type {ChartController} from '../../src/chart/adapter';
import type {IndicatorId} from '../../src/domain/indicators';

// IFACE4 A1/A2. Hide = the Object tree row / legend Hide route (indicator port
// update {visible:false}); Ctrl+Z / Ctrl+Y = the analysis restore, whose first step captures the
// renderer frame (adapter captureAnalysis: rendererFrames.capture(analysisInventory())), whose
// apply is indicators.restore and whose settle is the adapter's waitPlacement. Actual pinned
// core hide/show/remount, actual indicator port and renderer frame port, current adapter
// analysisInventory/waitPlacement source (see hidden-indicator-harness.ts). No DOM or GUI claim.
let cleanup:Array<()=>void>=[];
afterEach(()=>{for(const dispose of cleanup)dispose();cleanup=[];});
async function setup(kind:IndicatorId='volume'){const h=await hiddenIndicatorHarness();cleanup.push(h.dispose);const id=await h.add(kind,factoryIndicatorDefault(kind));return {h,id};}
const owners=(h:Awaited<ReturnType<typeof hiddenIndicatorHarness>>)=>h.inventory().panes.flatMap(pane=>pane.owners.map(owner=>owner.rendererId));

it('the actual pinned core drops a hidden indicator model from the scene while chart.panes still lists its owner',async()=>{
 const {h,id}=await setup(),rendererId=h.row(id).rendererId;
 expect(h.model(id)).toBeDefined();expect(owners(h)).toContain(rendererId);
 h.port.update(id,{visible:false});
 expect(h.row(id).visible).toBe(false);expect(h.record(id).hidden).toBe(true);expect(h.native.scene.indicators.has(rendererId)).toBe(false);expect(owners(h)).toContain(rendererId);
});

it('A1 undo: the frame checkpoint accepts a hidden owner and the restore shows the indicator exactly',async()=>{
 const {h,id}=await setup(),visible=h.port.serialize();
 h.port.update(id,{visible:false});
 const token=h.frames.capture(h.inventory()),historical=h.captureHistoricalFrame();
 expect(token.independentScaleCount).toBe(0);expect(historical.panes.flatMap(pane=>pane.owners)).toContainEqual({kind:'built',id});expect(historical.independent).toEqual([]);
 h.port.restore(visible);await h.waitPlacement();
 expect(h.row(id).visible).toBe(true);expect(h.record(id).hidden).toBeFalsy();expect(h.model(id)?.series.length).toBeGreaterThan(0);expect(h.port.serialize()).toEqual(visible);
 expect(()=>h.frames.capture(h.inventory())).not.toThrow();
});

it('A1 redo: reapplying the hidden snapshot settles its saved pane, and a rollback restores the hidden-time checkpoint',async()=>{
 const {h,id}=await setup();
 h.port.update(id,{visible:false});const hidden=h.port.serialize(),token=h.frames.capture(h.inventory()),opening=h.captureHistoricalFrame();
 h.port.update(id,{visible:true});await h.settle();
 h.port.restore(hidden);await h.waitPlacement();
 expect(h.row(id).visible).toBe(false);expect(h.record(id).hidden).toBe(true);expect(h.model(id)).toBeUndefined();expect(h.port.serialize()).toEqual(hidden);
 expect(()=>h.frames.restore(token,h.inventory())).not.toThrow();
 expect(h.captureHistoricalFrame()).toEqual(opening);
});

it('A1 show after redo: a restored-hidden instance starts, remounts and stays visible',async()=>{
 const {h,id}=await setup();
 h.port.update(id,{visible:false});const hidden=h.port.serialize();h.port.update(id,{visible:true});await h.settle();
 h.port.restore(hidden);await h.waitPlacement();
 h.port.update(id,{visible:true});await h.settle();
 expect(h.row(id).visible).toBe(true);expect(h.record(id).hidden).toBe(false);expect(h.model(id)?.series.length).toBeGreaterThan(0);expect(h.row(id).diagnostics).toEqual([]);
 expect(()=>h.frames.capture(h.inventory())).not.toThrow();await h.waitPlacement();
});

it('ownership guards stay exact: a removed, misplaced or unlisted native model is still refused',async()=>{
 const {h,id}=await setup('sma');
 h.port.update(id,{visible:false});const rendererId=h.row(id).rendererId,stale=h.inventory();
 expect(()=>h.frames.capture(stale)).not.toThrow();
 // The renderer forgets a removed indicator's z key: a listed owner without model or z is not hidden.
 const z=h.native.scene.seriesZ.get(rendererId);h.native.scene.seriesZ.delete(rendererId);
 expect(()=>h.frames.capture(stale)).toThrow('Pinned renderer model ownership mismatch');
 h.native.scene.seriesZ.set(rendererId,z);
 // A visible owner whose model sits on another pane.
 h.port.update(id,{visible:true});await h.settle();const shown=h.inventory();
 h.model(id).paneId='elsewhere';expect(()=>h.frames.capture(shown)).toThrow('Pinned renderer model ownership mismatch');h.model(id).paneId='price';
 // A scene model the inventory does not list.
 h.native.scene.indicators.set('foreign',{id:'foreign',paneId:'price',ownScale:false});expect(()=>h.frames.capture(shown)).toThrow('Pinned renderer model inventory is not settled');h.native.scene.indicators.delete('foreign');
 // A private scale slot for an owner that is neither mounted nor hidden.
 h.native.scene.indicatorScales.set('foreign',{scale:{min:0,max:1},scaleTarget:{min:0,max:1},initialized:false,manualScale:null});expect(()=>h.frames.capture(shown)).toThrow('Pinned renderer independent scale has no stable owner');h.native.scene.indicatorScales.delete('foreign');
 expect(()=>h.frames.capture(shown)).not.toThrow();
});

it('a hidden own-scale owner keeps its retained private scale slot through a checkpoint restore and contributes no column',async()=>{
 const {h,id}=await setup();
 h.port.setScale(id,'own');const rendererId=h.row(id).rendererId;
 h.native.scene.ensureIndicatorScale(rendererId,{min:0,max:5000});Object.assign(h.native.scene.indicatorScales.get(rendererId),{manualScale:{min:10,max:4000},initialized:true});
 h.port.update(id,{visible:false});const retained=structuredClone(h.native.scene.indicatorScales.get(rendererId));
 const token=h.frames.capture(h.inventory());expect(token.independentScaleCount).toBe(0);expect(h.captureHistoricalFrame().independent).toEqual([]);
 h.native.scene.indicatorScales.get(rendererId).manualScale=null;h.frames.restore(token,h.inventory());
 expect(h.native.scene.indicatorScales.get(rendererId)).toEqual(retained);
 h.port.update(id,{visible:true});await h.settle();expect(h.model(id).ownScale).toBe(true);expect(h.frames.capture(h.inventory()).independentScaleCount).toBe(1);
});

it('A2: a trend line drawn while an indicator is hidden leaves the chart functional; show and undo still work',async()=>{
 const {h,id}=await setup();
 const dataset=fixtureDataset('GME',5),state=createMultiChartState(dataset,{appearance:defaultTheme.appearance}),cellId=state.layout.activeCellId,failures:string[]=[],published:unknown[]=[];
 const cell={chart:{captureHistoricalFrame:()=>h.captureHistoricalFrame(),getViewport:()=>({from:1,to:5})} as unknown as ChartController,input:{source:sourceContextForDataset(dataset,dataset.bars),bars:dataset.bars,style:'candles'},executionIdentity:'ordinary',fingerprints:{}};
 const gesture=createGridFrameGesture({read:()=>state,cell:target=>target===cellId?cell:null,publish:(next,baseline)=>{published.push({next,baseline});return true;},failed:(_ids,message)=>failures.push(message)});
 h.port.update(id,{visible:false});const hidden=h.port.serialize(),drawingsBefore=h.drawing.controller.toJSON();
 // Alt+T arms the tool; the first canvas press opens the linked frame gesture; two clicks place the line.
 h.drawing.controller.onIntent({kind:'arm',type:'trendline'});
 expect(gesture.begin(cellId)).toBe(true);expect(failures).toEqual([]);
 const doc=createDrawing('trendline',{paneId:'price',anchors:[{time:1000000,price:100},{time:1240000,price:110}],style:{lineColor:'#123456',lineWidth:2,lineStyle:'solid'}})!.serialize();
 h.drawing.controller.onIntent({kind:'create',doc});gesture.flush();
 expect(failures).toEqual([]);expect(published).toEqual([]);expect(h.drawing.controller.all().map((row:any)=>row.type)).toEqual(['trendline']);
 // The chart stays usable: frame/configuration capture, another gesture, then Show.
 expect(()=>h.frames.capture(h.inventory())).not.toThrow();expect(gesture.begin(cellId)).toBe(true);gesture.flush();expect(failures).toEqual([]);
 h.port.update(id,{visible:true});await h.settle();expect(h.row(id).visible).toBe(true);expect(h.model(id)?.series.length).toBeGreaterThan(0);
 // Undo the show, then the drawing (one workspace step each): hidden again, no line; the chart still accepts gestures.
 h.port.restore(hidden);await h.waitPlacement();expect(h.row(id).visible).toBe(false);
 h.drawing.controller.fromJSON(drawingsBefore);expect(h.drawing.controller.all()).toEqual([]);
 expect(gesture.begin(cellId)).toBe(true);gesture.flush();expect(failures).toEqual([]);
 h.port.update(id,{visible:true});await h.settle();expect(h.model(id)?.series.length).toBeGreaterThan(0);
});

// A listed owner without a scene model is accepted only on the core registry's word (record.hidden, or a
// shown native instance whose start is still pending) plus the retained finite z key. The z key alone is not enough.
it('BFABC-R2 probe A: a core-visible listed owner whose scene model was deleted (z retained) is refused',async()=>{
 const {h,id}=await setup('sma'),rendererId=h.row(id).rendererId;
 expect(h.record(id).hidden).toBeFalsy();expect(h.record(id).native.started).toBe(true);
 h.native.scene.indicators.delete(rendererId);expect(Number.isFinite(h.native.scene.seriesZ.get(rendererId))).toBe(true);
 expect(()=>h.frames.capture(h.inventory())).toThrow('Pinned renderer model ownership mismatch');
 expect(()=>h.captureHistoricalFrame()).toThrow('Pinned renderer model ownership mismatch');
});
it('BFABC-R2 probe B: a removed owner listed by a stale inventory is refused even when its z key is re-created',async()=>{
 const {h,id}=await setup('sma');h.port.update(id,{visible:false});const rendererId=h.row(id).rendererId,stale=h.inventory();
 expect(()=>h.frames.capture(stale)).not.toThrow();
 h.port.remove(id);expect(h.native.scene.seriesZ.has(rendererId)).toBe(false);expect(h.core.registry.get(rendererId)).toBeUndefined();
 h.native.scene.seriesZ.set(rendererId,-1);
 expect(()=>h.frames.capture(stale)).toThrow('Pinned renderer model ownership mismatch');
});
it('BFABC-R2: a frame port without the core authority refuses every model-less owner',async()=>{
 const {h,id}=await setup('sma');h.port.update(id,{visible:false});
 const bare=createRendererFramePort(h.renderer);
 expect(()=>h.frames.capture(h.inventory())).not.toThrow();
 expect(()=>bare.capture(h.inventory())).toThrow('Pinned renderer model ownership mismatch');
 expect(()=>bare.captureHistorical(h.inventory(),h.context(),h.layout())).toThrow('Pinned renderer model ownership mismatch');
});
it('BFABC-R2: a shown restored-hidden instance whose native start is pending is accepted (core start-pending, z retained)',async()=>{
 const {h,id}=await setup('sma');
 h.port.update(id,{visible:false});const hidden=h.port.serialize();h.port.update(id,{visible:true});await h.settle();
 h.port.restore(hidden);await h.waitPlacement();h.port.update(id,{visible:true});
 const record=h.record(id),rendererId=h.row(id).rendererId;
 expect(record.hidden).toBe(false);expect(record.native.started).not.toBe(true);expect(h.native.scene.indicators.has(rendererId)).toBe(false);
 expect(()=>h.frames.capture(h.inventory())).not.toThrow();
 await h.settle();expect(h.model(id)).toBeDefined();expect(()=>h.frames.capture(h.inventory())).not.toThrow();
});
it('BFABC-R2: the core authority answers from the pinned registry record, bound to its own renderer, and fails closed',async()=>{
 const {h,id}=await setup('sma'),rendererId=h.row(id).rendererId;
 expect(h.modelAbsence(rendererId)).toBe(false);// visible and started: the model must be mounted
 expect(h.modelAbsence('synthetic-unknown')).toBe(false);
 h.port.update(id,{visible:false});expect(h.modelAbsence(rendererId)).toBe(true);
 expect(coreModelAbsence(h.chart,new NativeRenderer())(rendererId)).toBe(false);// another renderer's port
 const record=h.record(id);Object.defineProperty(record,'hidden',{get:()=>true,enumerable:true,configurable:true});expect(h.modelAbsence(rendererId)).toBe(false);
 Object.defineProperty(record,'hidden',{value:true,writable:true,enumerable:true,configurable:true});expect(h.modelAbsence(rendererId)).toBe(true);
 h.port.remove(id);expect(h.modelAbsence(rendererId)).toBe(false);
});
it('BFABC-R2: every production renderer frame/context port is constructed with the core authority (adapter wiring)',()=>{
 const files=readdirSync('src',{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile()&&/[.]tsx?$/.test(entry.name)).map(entry=>join(entry.parentPath,entry.name).split(sep).join('/'));
 const pattern=/(?<!function )create(?:RendererFramePort|RendererContextPort)[(][^()]*(?:[(][^()]*[)][^()]*)*[)]/g;
 const calls=files.flatMap(file=>[...readFileSync(file,'utf8').matchAll(pattern)].map(match=>({file,call:match[0]})));
 expect(calls).toEqual([
  {file:'src/chart/adapter.ts',call:'createRendererFramePort(rendererHolder.current,coreModelAbsence(chart,rendererHolder.current))'},
  {file:'src/chart/adapter.ts',call:'createRendererContextPort(rendererHolder.current,coreModelAbsence(chart,rendererHolder.current))'},
 ]);
});
