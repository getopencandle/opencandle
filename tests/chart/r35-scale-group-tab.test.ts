import {afterEach,expect,it,vi} from 'vitest';
import {RendererControl} from '@luxalgo/vela';
import {hiddenIndicatorHarness} from './hidden-indicator-harness';
import {eventTarget} from './price-scale-harness';
import {installPriceScalePort} from '../../src/chart/price-scale-port';
import type {PriceScaleMenuMount} from '../../src/chart/price-scale-menu-view';
import {createGridFrameGesture} from '../../src/chart/grid-frame-gesture';
import {createMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {defaultTheme} from '../../src/ui/themes';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import type {ChartController} from '../../src/chart/adapter';

// (r30b productFindings): after two indicators were pinned to one shared extra scale (legend More menu > Pin to
// scale > an existing scale) and the user then opened Price scale > Merge all scales into one, a New layout tab was refused
// ("Chart tree input or configuration is not settled") and the alert read "The frame gesture cannot be saved: Error: Native
// independent scale is not ready for portable capture".
// ROOT: COMPAT-10 (LV-VELA-SCALE-GROUPS-1) keeps ONE private scale slot per group, keyed by its holder; a member that does
// not hold the slot has none (lvSetScaleGroup drops it, computeScales skips it). The portable frame capture
// (renderer-frame.ts captureHistorical) looked up a slot by every own-scale owner's id, so any grouped member threw. The
// press on the in-cell Price scale menu row opened a grid frame gesture whose opening capture threw; MultiChartGrid then
// quarantined the cell, and the grid tree refused every later tab switch, New tab and save.
// Real pieces: the pinned core, the actual indicator port, the renderer frame port, the adapter analysisInventory source
// (hidden-indicator-harness), the real price scale port on the same NativeRenderer with the adapter's mergeScales binding,
// and the real createGridFrameGesture wired the way MultiChartGrid binds it. The renderer is unmounted, so `paint` runs the
// slot step of NativeRenderer.computeScales (one ensureIndicatorScale per slot holder, through the real scene helpers).
// SYNTHETIC bars and frame values. No GUI claim.
let cleanup:Array<()=>void>=[];
afterEach(()=>{for(const dispose of cleanup)dispose();cleanup=[];vi.unstubAllGlobals();});
type H=Awaited<ReturnType<typeof hiddenIndicatorHarness>>;
const element=()=>({className:'',style:{} as Record<string,string>,attributes:{} as Record<string,string>,children:[] as unknown[],dataset:{} as Record<string,string>,textContent:'' as string|null,
 setAttribute(name:string,value:string){this.attributes[name]=value;},addEventListener(){},appendChild(child:unknown){this.children.push(child);return child;},remove(){}});
/** The slot step of the pinned NativeRenderer.computeScales: one slot per holder, seeded from the pane. */
function paint(h:H){const scene=h.native.scene;for(const pane of scene.orderedPanes())for(const model of scene.lvPrivateScaleIndicatorsForPane(pane.id)){if(scene.lvScaleKey(model.id)!==model.id)continue;scene.ensureIndicatorScale(model.id,pane.scaleTarget);}}
async function setup(){
 vi.stubGlobal('document',{createElement:()=>element()});
 const h=await hiddenIndicatorHarness();cleanup.push(h.dispose);
 const sma=await h.add('sma',factoryIndicatorDefault('sma')),ema=await h.add('ema',factoryIndicatorDefault('ema'));
 const dataset=fixtureDataset('GME',5),state=createMultiChartState(dataset,{appearance:defaultTheme.appearance}),cellId=state.layout.activeCellId,failures:string[]=[],published:unknown[]=[];
 const cell={chart:{captureHistoricalFrame:()=>h.captureHistoricalFrame(),getViewport:()=>({from:1,to:5})} as unknown as ChartController,input:{source:sourceContextForDataset(dataset,dataset.bars),bars:dataset.bars,style:'candles' as const},executionIdentity:'ordinary',fingerprints:{}};
 // MultiChartGrid: a failed gesture quarantines the cell (brokenCells), and the grid tree then refuses New tab and tab switches.
 const quarantined=new Set<string>();
 const gesture=createGridFrameGesture({read:()=>state,cell:target=>target===cellId&&!quarantined.has(target)?cell:null,publish:(next,baseline)=>{published.push({next,baseline});return true;},failed:(ids,message)=>{failures.push(message);if(message.startsWith('Native frame publication')||message.startsWith('The frame gesture cannot be saved'))ids.forEach(id=>quarantined.add(id));}});
 const captureCell=()=>{gesture.invalidate();return !quarantined.has(cellId);};
 // The real price scale port on the harness renderer, with the adapter's mergeScales binding (adapter.ts) and GridCell's host gesture.
 const renderer=h.native;renderer.coords.setSize(800,600,1);renderer.scheduler={invalidate(){},cancel(){}};renderer.input={el:{getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})}};renderer.wrapper={clientWidth:0,clientHeight:0,appendChild(){}};renderer.plot=element();
 const pricePane=renderer.scene.panes.get('price');pricePane.bounds={top:0,height:500};pricePane.scale={min:90,max:110};pricePane.scaleTarget={min:90,max:110};pricePane.initialized=true;
 const doc:any={...eventTarget(),body:{},documentElement:{},activeElement:null},win:any={...eventTarget(),innerWidth:1400,innerHeight:900};doc.defaultView=win;
 const container:any={...eventTarget(),ownerDocument:doc,contains:(node:unknown)=>node===container,closest:()=>null};
 const mount:PriceScaleMenuMount={render(){},focus(){},contains:()=>false,dispose(){}};
 const scale=installPriceScalePort({renderer,features:new RendererControl(renderer) as any,onViewportChanged:()=>()=>{},container,appearance:()=>null,mount:()=>mount,
  mergeScales:rendererIds=>{const rows=h.port.list();for(const rendererId of rendererIds){const row=rows.find(item=>item.rendererId===rendererId);if(!row)throw Error('not an OpenCandle indicator');h.port.setScale(row.id,'shared');}if(!captureCell())throw Error('The workspace refused the indicator scale change.');}});
 scale.bindHost({commitSettings:()=>captureCell(),gesture:{begin:()=>gesture.begin(cellId),finish:()=>gesture.finish(),flush:()=>{gesture.flush();return false;}}});
 /** A left press and release on a row of the in-cell Price scale menu (not grid chrome): opens a frame gesture. */
 const pressMenuRow=()=>{const opened=gesture.begin(cellId);gesture.finish();return opened;};
 /** What New tab / tab switch / save needs from the cell: not quarantined, a frame gesture opens, a checkpoint captures. */
 const tabReady=()=>{const opened=gesture.begin(cellId);gesture.flush();return opened&&!quarantined.has(cellId)&&(()=>{try{h.frames.capture(h.inventory());h.captureHistoricalFrame();return true;}catch{return false;}})();};
 /** Legend More menu > Pin to scale > Pin to new right scale, then > an existing scale (a context menu: no frame gesture). */
 const share=()=>{h.port.setScale(sma,'own');paint(h);h.port.setScale(ema,{scaleOf:sma});expect(captureCell()).toBe(true);paint(h);};
 return {h,sma,ema,gesture,scale,failures,published,quarantined,cellId,pressMenuRow,tabReady,share};
}
const key=(id:string)=>JSON.stringify(['built',id]);

it('r30b flow: share one extra scale, then Price scale > Merge all scales into one, then New tab is accepted (fail-first)',async()=>{
 const s=await setup();
 s.share();
 expect(s.h.native.scene.indicatorScales.size).toBe(1);expect(s.h.port.scale(s.ema)).toMatchObject({placement:'own',group:s.sma});
 // The press on the menu row opens the gesture; before the fix its opening capture threw and the cell was quarantined.
 expect(s.pressMenuRow()).toBe(true);expect(s.failures).toEqual([]);
 expect(s.scale.execute('mergeRight',{origin:'chart-pointer'})).toEqual({ok:true});
 expect(s.h.port.scale(s.sma).placement).toBe('shared');expect(s.h.port.scale(s.ema).placement).toBe('shared');
 vi.useFakeTimers();try{vi.runAllTimers();}finally{vi.useRealTimers();}
 expect(s.failures).toEqual([]);expect(s.quarantined.size).toBe(0);expect(s.published).toEqual([]);
 expect(s.tabReady()).toBe(true);expect(s.failures).toEqual([]);
});

it('the portable frame lists every member of a shared scale with the shared slot range, and saves restore it (fail-first)',async()=>{
 const s=await setup(),{h}=s;
 s.share();
 const holder=h.row(s.sma).rendererId,member=h.row(s.ema).rendererId;
 expect([...h.native.scene.indicatorScales.keys()]).toEqual([holder]);
 Object.assign(h.native.scene.indicatorScales.get(holder),{manualScale:{min:40,max:60},initialized:true});
 const saved=h.captureHistoricalFrame();
 expect(saved.independent.map(column=>[key(column.owner.id),column.manualRange]).sort()).toEqual([[key(s.ema),{min:40,max:60}],[key(s.sma),{min:40,max:60}]].sort());
 // Checkpoint (undo) capture and restore keep the one holder slot.
 const token=h.frames.capture(h.inventory());expect(token.independentScaleCount).toBe(1);
 h.native.scene.indicatorScales.get(holder).manualScale=null;h.frames.restore(token,h.inventory());
 expect(h.native.scene.indicatorScales.get(holder).manualScale).toEqual({min:40,max:60});expect(h.native.scene.indicatorScales.has(member)).toBe(false);
 // Saved-frame apply (tab switch back, relaunch): the shared slot gets the range, the member gets no private slot.
 h.native.scene.indicatorScales.get(holder).manualScale=null;
 expect(()=>h.frames.historicalPaneIds(saved,h.inventory(),h.context())).not.toThrow();
 h.frames.applyHistorical(saved,h.inventory(),h.context());
 expect([...h.native.scene.indicatorScales.keys()]).toEqual([holder]);expect(h.native.scene.indicatorScales.get(holder).manualScale).toMatchObject({min:40,max:60});
 expect(h.captureHistoricalFrame()).toEqual(saved);
 // A crafted frame whose members of one shared scale disagree is refused before any change.
 const crafted=structuredClone(saved),before=structuredClone([...h.native.scene.indicatorScales]);crafted.independent[0].manualRange={min:1,max:2};
 expect(()=>h.frames.applyHistorical(crafted,h.inventory(),h.context())).toThrow('shared');expect([...h.native.scene.indicatorScales]).toEqual(before);
});

it('a shared scale saved on one chart restores on a fresh chart (indicators, then the saved frame) and captures the same frame (fail-first)',async()=>{
 const s=await setup(),{h}=s;
 s.share();Object.assign(h.native.scene.indicatorScales.get(h.row(s.sma).rendererId),{manualScale:{min:41,max:59},initialized:true});
 const snapshot=JSON.parse(JSON.stringify(h.port.serialize())),saved=h.captureHistoricalFrame();
 const next=await hiddenIndicatorHarness();cleanup.push(next.dispose);
 next.port.restore(snapshot);await next.waitPlacement();await next.settle();
 expect(next.port.scale(s.ema)).toMatchObject({placement:'own',group:s.sma});
 next.frames.applyHistorical(saved,next.inventory(),next.context());paint(next as H);
 const holder=next.row(s.sma).rendererId;
 expect([...next.native.scene.indicatorScales.keys()]).toEqual([holder]);expect(next.native.scene.indicatorScales.get(holder).manualScale).toMatchObject({min:41,max:59});
 expect(next.captureHistoricalFrame()).toEqual(saved);
});

it('every scale-group operation leaves the chart ready for a tab switch, New tab or save (fail-first)',async()=>{
 const s=await setup(),{h}=s,steps:Array<[string,()=>void]>=[
  ['join',()=>s.share()],
  ['holder to a new right scale',()=>h.port.setScale(s.sma,'own')],
  ['rejoin',()=>h.port.setScale(s.sma,{scaleOf:s.ema})],
  ['member to the left',()=>h.port.setScale(s.sma,'left')],
  ['join the left scale',()=>h.port.setScale(s.ema,{scaleOf:s.sma})],
  ['hide the holder',()=>h.port.update(s.sma,{visible:false})],
  ['show the holder',()=>h.port.update(s.sma,{visible:true})],
  ['hide the member',()=>h.port.update(s.ema,{visible:false})],
  ['show the member',()=>h.port.update(s.ema,{visible:true})],
  ['member to no scale',()=>h.port.setScale(s.ema,'none')],
  ['join again',()=>{h.port.setScale(s.ema,'left');paint(h);h.port.setScale(s.ema,{scaleOf:s.sma});}],
  ['holder to the pane scale',()=>h.port.setScale(s.sma,'shared')],
 ];
 for(const [name,step] of steps){step();await h.settle();paint(h);expect([name,s.tabReady(),s.failures]).toEqual([name,true,[]]);}
 // and Merge from the menu after rejoining
 h.port.setScale(s.sma,'own');paint(h);h.port.setScale(s.ema,{scaleOf:s.sma});paint(h);
 expect(s.pressMenuRow()).toBe(true);expect(s.scale.execute('mergeLeft',{origin:'chart-pointer'})).toEqual({ok:true});
 expect(s.failures).toEqual([]);expect(s.tabReady()).toBe(true);
});
