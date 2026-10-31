import {expect,it} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createRendererFramePort} from '../../src/chart/renderer-frame';
import {historicalOwnerKey,validateHistoricalFrame} from '../../src/chart/historical-frame';
import type {AnalysisPaneInventory} from '../../src/chart/analysis-transaction';
// Actual pinned NativeScene/NativeRenderer state with a fake scheduler.
// No DOM, GPU/paint, pointer, packaged process or reference observation.
function fixture(){
 const renderer=new NativeRenderer(),native=renderer as any;native.scheduler={invalidate(){}};native.scene.ensurePane('price','price',0,3);native.scene.ensurePane('old-study','study',1,2);native.scene.ensurePane('old-compare','study',2,1);
 native.scene.indicators.set('old-script',{id:'old-script',paneId:'old-study',ownScale:true});native.scene.indicators.set('old-series',{id:'old-series',paneId:'old-compare',ownScale:false});native.scene.indicatorScales.set('old-script',{scale:{min:4,max:9},scaleTarget:{min:4,max:9},manualScale:{min:4,max:9},initialized:true});Object.assign(native.scene.panes.get('price'),{manualScale:{min:101,max:207},scale:{min:101,max:207},scaleTarget:{min:101,max:207}});Object.assign(native.scene.panes.get('old-study'),{manualScale:{min:-7,max:31},scale:{min:-7,max:31},scaleTarget:{min:-7,max:31},invert:true});
 const script={kind:'script' as const,id:'constructor'},comparison={kind:'comparison' as const,id:'__proto__'},inventory:AnalysisPaneInventory={panes:[{paneId:'price',logicalPaneId:'price',replaceable:false,owners:[]},{paneId:'old-study',logicalPaneId:'stable-study',replaceable:true,owners:[{...script,rendererId:'old-script'}]},{paneId:'old-compare',logicalPaneId:null,replaceable:false,owners:[{...comparison,rendererId:'old-series'}]}],occupiedIds:[]},context={source:sourceContextForDataset(fixtureDataset('GME',3)),style:'candles',calculationFingerprints:{[historicalOwnerKey(script)]:'literal-script-v1',[historicalOwnerKey(comparison)]:'literal-series-v1'}},layout=[{id:'price',order:0,collapsed:false,maximized:false},{id:'old-study',order:1,collapsed:false,maximized:false},{id:'old-compare',order:2,collapsed:false,maximized:false}];
 return{native,inventory,context,layout,port:createRendererFramePort(renderer)};
}
function snapshot(s:ReturnType<typeof fixture>){return structuredClone({panes:[...s.native.scene.panes],columns:[...s.native.scene.indicatorScales],scaleMode:s.native.scene.scaleMode,logScale:s.native.scene.logScale,invertScale:s.native.scene.invertScale});}
it('portable capture rejects a layout accessor before invoking it',()=>{
 const s=fixture();let reads=0;Object.defineProperty(s.layout[1],'id',{get(){reads++;return'old-study';},enumerable:true});expect(()=>s.port.captureHistorical(s.inventory,s.context,s.layout)).toThrow();expect(reads).toBe(0);
});
it('portable capture rejects sparse, hidden and customized layout arrays before accepting native observations',()=>{
 for(const kind of ['sparse','hidden','extra']){const s=fixture(),layout=s.layout;if(kind==='sparse')delete (layout as any)[1];else if(kind==='hidden')Object.defineProperty(layout,'1',{value:layout[1],enumerable:false});else(layout as any).unrecognized='Synthetic extra field';expect(()=>s.port.captureHistorical(s.inventory,s.context,layout)).toThrow();}
});
it('literal prototype-looking owners and independent columns restore to recreated native IDs without retained old aliases',()=>{
 const s=fixture(),saved=s.port.captureHistorical(s.inventory,s.context,s.layout);s.native.scene.panes.delete('old-study');s.native.scene.panes.delete('old-compare');s.native.scene.ensurePane('new-study','study',1,1);s.native.scene.ensurePane('new-compare','study',2,1);s.native.scene.indicators.clear();s.native.scene.indicators.set('new-script',{id:'new-script',paneId:'new-study',ownScale:true});s.native.scene.indicators.set('new-series',{id:'new-series',paneId:'new-compare',ownScale:false});s.native.scene.indicatorScales.clear();const inventory={...s.inventory,panes:s.inventory.panes.map(pane=>pane.paneId==='price'?pane:{...pane,paneId:pane.logicalPaneId?'new-study':'new-compare',owners:pane.owners.map(owner=>({...owner,rendererId:owner.kind==='script'?'new-script':'new-series'}))})};
 const mapped=s.port.historicalPaneIds(saved,inventory,s.context);expect([...mapped.values()].sort()).toEqual(['new-compare','new-study','price']);s.port.applyHistorical(saved,inventory,s.context);expect(s.native.scene.panes.get('new-study').manualScale).toEqual({min:-7,max:31,log:false,invert:true});expect([...s.native.scene.indicatorScales.keys()]).toEqual(['new-script']);expect(s.native.scene.indicatorScales.get('new-script').manualScale).toEqual({min:4,max:9,log:false,invert:true});expect(Object.hasOwn(saved.calculationFingerprints,historicalOwnerKey({kind:'script',id:'constructor'}))).toBe(true);
});
it('a structurally valid but altered stable owner graph rejects before native mutation or redraw',()=>{
 const s=fixture(),saved=s.port.captureHistorical(s.inventory,s.context,s.layout),before=snapshot(s);let redraws=0;s.native.scheduler.invalidate=()=>redraws++;saved.panes[1].owners[0].id='different';if(saved.panes[1].key.kind==='owners')saved.panes[1].key.owners[0].id='different';saved.independent[0].owner.id='different';const fingerprints={...saved.calculationFingerprints};delete fingerprints[historicalOwnerKey({kind:'script',id:'constructor'})];fingerprints[historicalOwnerKey({kind:'script',id:'different'})]='literal-script-v1';saved.calculationFingerprints=fingerprints;expect(()=>validateHistoricalFrame(saved)).not.toThrow();expect(()=>s.port.applyHistorical(saved,s.inventory,{...s.context,calculationFingerprints:fingerprints})).toThrow('ownership');expect(snapshot(s)).toEqual(before);expect(redraws).toBe(0);
});
it('saved nested accessors and hidden fingerprints reject with zero reads and no native writes',()=>{
 const s=fixture(),saved=s.port.captureHistorical(s.inventory,s.context,s.layout),before=snapshot(s);let reads=0;Object.defineProperty(saved.panes[0],'manualRange',{get(){reads++;return null;},enumerable:true});expect(()=>s.port.applyHistorical(saved,s.inventory,s.context)).toThrow();expect(reads).toBe(0);expect(snapshot(s)).toEqual(before);const hidden=s.port.captureHistorical(s.inventory,s.context,s.layout);Object.defineProperty(hidden.calculationFingerprints,historicalOwnerKey({kind:'script',id:'constructor'}),{value:'literal-script-v1',enumerable:false});expect(()=>s.port.applyHistorical(hidden,s.inventory,s.context)).toThrow();expect(snapshot(s)).toEqual(before);
});
it('late invalidation failure restores global flags, every pane and independent columns; repeated failure reports incomplete recovery',()=>{
 const s=fixture(),saved=s.port.captureHistorical(s.inventory,s.context,s.layout),before=snapshot(s);saved.panes[0].log=true;saved.panes[0].invert=true;saved.panes[1].manualRange={min:-40,max:50};saved.independent[0].manualRange={min:1,max:5};let calls=0;s.native.scheduler.invalidate=()=>{if(++calls===1)throw Error('Synthetic redraw failure');};expect(()=>s.port.applyHistorical(saved,s.inventory,s.context)).toThrow('Synthetic redraw failure');expect(snapshot(s)).toEqual(before);expect(calls).toBe(2);s.native.scheduler.invalidate=()=>{throw Error('Synthetic permanent redraw failure');};expect(()=>s.port.applyHistorical(saved,s.inventory,s.context)).toThrow('recovery were incomplete');expect(snapshot(s)).toEqual(before);
});
it('portable weights that overflow the pinned renderer layout arithmetic reject before applying them',()=>{
 const s=fixture(),saved=s.port.captureHistorical(s.inventory,s.context,s.layout),before=snapshot(s);saved.panes[0].heightWeight=Number.MAX_VALUE;saved.panes[1].heightWeight=Number.MAX_VALUE;
 // Pinned SDK layoutPanes computes flexHeight * pane.heightWeight / totalWeight.
 // These individually finite weights overflow both its sum and numerator.
 expect(Number.isFinite(600*saved.panes[0].heightWeight/(saved.panes[0].heightWeight+saved.panes[1].heightWeight))).toBe(false);
 expect(()=>validateHistoricalFrame(saved)).toThrow();expect(()=>s.port.applyHistorical(saved,s.inventory,s.context)).toThrow();expect(snapshot(s)).toEqual(before);
});
it('an explicitly persisted logical pane key resolves only with its exact stable owner graph',()=>{
 const s=fixture(),saved=s.port.captureHistorical(s.inventory,s.context,s.layout);saved.panes[1].key={kind:'logical',id:'stable-study'};expect(()=>validateHistoricalFrame(saved)).not.toThrow();expect(s.port.historicalPaneIds(saved,s.inventory,s.context).get(JSON.stringify({kind:'logical',id:'stable-study'}))).toBe('old-study');expect(()=>s.port.applyHistorical(saved,s.inventory,s.context)).not.toThrow();const wrong=structuredClone(saved);wrong.panes[1].key={kind:'logical',id:'foreign-study'};expect(()=>s.port.historicalPaneIds(wrong,s.inventory,s.context)).toThrow();
});
