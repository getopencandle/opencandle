import {afterEach,expect,it} from 'vitest';
import {hiddenIndicatorHarness} from './hidden-indicator-harness';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {createRendererContextPort} from '../../src/chart/renderer-context';
import {createChartContextPort} from '../../src/chart/chart-context-port';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {ChartController} from '../../src/chart/adapter';
import type {IndicatorId} from '../../src/domain/indicators';

// The chart right-click context port
// (renderer-context.ts geometry) must accept a listed owner whose native model is genuinely hidden,
// by the same criterion as renderer-frame.ts (no scene model AND a retained finite seriesZ key),
// and keep refusing every other ownership mismatch. Hide = the real indicator port update
// {visible:false} over the pinned core (hidden-indicator-harness.ts). SYNTHETIC native geometry
// (the harness renderer is unmounted); no DOM, canvas or GUI claim.
let cleanup:Array<()=>void>=[];
afterEach(()=>{for(const dispose of cleanup)dispose();cleanup=[];});
const dataset=fixtureDataset('GME',3);
type Harness=Awaited<ReturnType<typeof hiddenIndicatorHarness>>;
/** Settled native geometry for the harness renderer: panes stacked in 300 CSS px, one master axis. */
function geometry(h:Harness){
 const r=h.native,panes=[...r.scene.panes.values()].sort((a,b)=>a.order-b.order),each=300/panes.length;
 panes.forEach((pane:any,index:number)=>Object.assign(pane,{bounds:{top:index*each,height:each},scale:{min:100,max:200},initialized:true}));
 r.coords={times:dataset.bars.map(bar=>bar.time*1000),widthPx:400,dataHeightPx:300,pitchScale:1,viewport:{barSpacing:20,rightOffset:0}};
 r.rightAxisW=64;r.plot={getBoundingClientRect:()=>({left:10,top:20,width:464,height:326})};r.userDrawings=null;
}
async function setup(kind:IndicatorId='volume'){const h=await hiddenIndicatorHarness();cleanup.push(h.dispose);const id=await h.add(kind,factoryIndicatorDefault(kind));geometry(h);return {h,id,port:createRendererContextPort(h.renderer,h.modelAbsence)};}
const click={x:390,y:40};

it('a visible indicator baseline captures, so the geometry setup is valid',async()=>{
 const {h,port}=await setup();
 expect(()=>port.capture(h.inventory(),dataset.bars,click)).not.toThrow();expect(()=>port.signature(h.inventory())).not.toThrow();
});

it('IFACE4 A1/A2 residual: with an indicator hidden the chart context capture and signature do not throw',async()=>{
 const {h,id,port}=await setup();
 h.port.update(id,{visible:false});
 const rendererId=h.row(id).rendererId,inventory=h.inventory();
 expect(inventory.panes.flatMap(pane=>pane.owners.map(owner=>owner.rendererId))).toContain(rendererId);expect(h.native.scene.indicators.has(rendererId)).toBe(false);
 geometry(h);
 expect(()=>port.signature(inventory)).not.toThrow();
 const result=port.capture(inventory,dataset.bars,click);
 expect(result.entity.kind).toBe('chart');expect(result.local).toEqual({x:380,y:20});
 // The hidden owner is not a column: a press on the master axis stays the price axis, and the
 // geometry snapshot (what the menu authority re-reads) is stable while hidden.
 expect(port.capture(inventory,dataset.bars,{x:435,y:40}).entity).toMatchObject({kind:'price-axis',columnOwner:null});
 expect(port.signature(inventory)).toBe(port.signature(inventory));
});

it('the real chart context port opens (captures a menu snapshot) while an indicator is hidden',async()=>{
 const {h,id,port}=await setup('sma');
 h.port.update(id,{visible:false});geometry(h);
 const source=sourceContextForDataset(dataset,dataset.bars),input={bars:dataset.bars,source,style:'candles' as const};
 const chart={isInputCurrent:()=>true,getAnalysisPaneInventory:()=>h.inventory(),getChartOptions:()=>({}),getChartSettingsBook:()=>({}),getStyle:()=>'candles',sourceContext:()=>source,saveDrawings:()=>({drawings:[]})} as unknown as ChartController;
 const context=createChartContextPort(chart,port,()=>false);
 const snapshot=context.capture({cellId:'cell',treeOwner:{},input:input as never,executionIdentity:'ordinary',instrument:dataset.instrument,client:click,ownerCurrent:()=>true});
 expect(snapshot.entity.kind).toBe('chart');expect(context.isCurrent(snapshot)).toBe(true);
});

it('a hidden own-scale owner contributes no axis column while its retained scale slot is ignored',async()=>{
 const {h,id,port}=await setup();
 h.port.setScale(id,'own');const rendererId=h.row(id).rendererId;
 h.native.scene.ensureIndicatorScale(rendererId,{min:0,max:5000});
 h.port.update(id,{visible:false});geometry(h);
 expect(h.native.scene.indicatorScales.has(rendererId)).toBe(true);
 const inventory=h.inventory();
 expect(()=>port.signature(inventory)).not.toThrow();
 expect(port.capture(inventory,dataset.bars,{x:435,y:40}).entity).toMatchObject({kind:'price-axis',columnOwner:null});
 // Showing it again restores the independent column (one master axis plus one own-scale column).
 h.port.update(id,{visible:true});await h.settle();geometry(h);h.native.rightAxisW=64+56;h.native.plot={getBoundingClientRect:()=>({left:10,top:20,width:520,height:326})};
 expect(h.model(id).ownScale).toBe(true);
 expect(()=>port.signature(h.inventory())).not.toThrow();
});

it('ownership checks still refuse genuine mismatches while another indicator is hidden',async()=>{
 const {h,id,port}=await setup('sma');
 h.port.update(id,{visible:false});geometry(h);
 const rendererId=h.row(id).rendererId,hiddenInventory=h.inventory();
 expect(()=>port.signature(hiddenInventory)).not.toThrow();
 // The renderer forgets a removed indicator's z key: a listed owner without model or z is not hidden.
 const z=h.native.scene.seriesZ.get(rendererId);h.native.scene.seriesZ.delete(rendererId);
 expect(()=>port.signature(hiddenInventory)).toThrow('Native context owner inventory changed');
 expect(()=>port.capture(hiddenInventory,dataset.bars,click)).toThrow('Native context owner inventory changed');
 // A non-finite retained z key is not the hidden signature either.
 h.native.scene.seriesZ.set(rendererId,Number.NaN);expect(()=>port.signature(hiddenInventory)).toThrow('Native context owner inventory changed');
 h.native.scene.seriesZ.set(rendererId,z);expect(()=>port.signature(hiddenInventory)).not.toThrow();
 // A scene model the inventory does not list.
 h.native.scene.indicators.set('foreign',{id:'foreign',paneId:'price',ownScale:false});expect(()=>port.signature(hiddenInventory)).toThrow('Native context owner inventory changed');h.native.scene.indicators.delete('foreign');
 // A visible owner whose model sits on another pane.
 h.port.update(id,{visible:true});await h.settle();geometry(h);const shown=h.inventory();
 expect(()=>port.signature(shown)).not.toThrow();
 h.model(id).paneId='elsewhere';expect(()=>port.signature(shown)).toThrow('Native context owner placement changed');h.model(id).paneId=shown.panes.find(pane=>pane.owners.some(owner=>owner.rendererId===rendererId))!.paneId;
 // A visible owner whose scene model identity differs.
 const model=h.model(id),previousId=model.id;model.id='other';expect(()=>port.signature(shown)).toThrow();model.id=previousId;
 expect(()=>port.signature(shown)).not.toThrow();
});

// The context port takes the same core authority as the frame port: a model-less listed owner is hidden only
// on the core registry's word plus a retained finite z key.
it('BFABC-R2 probe A: a core-visible listed owner whose scene model was deleted (z retained) is refused',async()=>{
 const {h,id,port}=await setup('sma'),rendererId=h.row(id).rendererId;
 expect(h.record(id).hidden).toBeFalsy();
 h.native.scene.indicators.delete(rendererId);expect(Number.isFinite(h.native.scene.seriesZ.get(rendererId))).toBe(true);geometry(h);
 expect(()=>port.signature(h.inventory())).toThrow('Native context owner inventory changed');
 expect(()=>port.capture(h.inventory(),dataset.bars,click)).toThrow('Native context owner inventory changed');
});
it('BFABC-R2 probe B: a removed owner listed by a stale inventory is refused even when its z key is re-created',async()=>{
 const {h,id,port}=await setup('sma');h.port.update(id,{visible:false});geometry(h);const rendererId=h.row(id).rendererId,stale=h.inventory();
 expect(()=>port.signature(stale)).not.toThrow();
 h.port.remove(id);h.native.scene.seriesZ.set(rendererId,-1);geometry(h);
 expect(()=>port.signature(stale)).toThrow('Native context owner inventory changed');
});
it('BFABC-R2: a context port without the core authority refuses a hidden owner; with it the hidden owner is accepted',async()=>{
 const {h,id,port}=await setup('sma');h.port.update(id,{visible:false});geometry(h);
 expect(()=>port.signature(h.inventory())).not.toThrow();
 expect(()=>createRendererContextPort(h.renderer).signature(h.inventory())).toThrow('Native context owner inventory changed');
});
