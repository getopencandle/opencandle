import {expect,it} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {createRendererFramePort} from '../../src/chart/renderer-frame';
import type {AnalysisPaneInventory} from '../../src/chart/analysis-transaction';

// Actual pinned NativeRenderer/NativeScene data; scheduler is a controlled fake.
// No DOM, real scheduler paint, mouse gesture or packaged GUI is exercised.
function scene(){const renderer=new NativeRenderer(),native=renderer as any;native.scheduler={invalidate:()=>{}};native.scene.ensurePane('price','price',0,3);native.scene.ensurePane('study','study',1,1);native.scene.indicators.set('native-study',{id:'native-study',paneId:'study',ownScale:true});const inventory:AnalysisPaneInventory={panes:[{paneId:'price',logicalPaneId:'price',replaceable:false,owners:[]},{paneId:'study',logicalPaneId:'stable-study',replaceable:true,owners:[{kind:'built',id:'local-study',rendererId:'native-study'}]}],occupiedIds:[]};return{renderer,native,inventory,port:createRendererFramePort(renderer)};}

it('rejects unexpected nested behavior in primitive pane fields before any structured clone can invoke it',()=>{
 for(const key of ['heightWeight','percentBaseline','scaleMode','logScale','invert']){
  const test=scene();let reads=0;const unknown={};Object.defineProperty(unknown,'behavior',{enumerable:true,get(){reads++;return 2;}});test.native.scene.panes.get('price')[key]=unknown;
  expect(()=>test.port.capture(test.inventory)).toThrow();expect(reads).toBe(0);
 }
});
it('scheduler capability probing does not execute an unexpected invalidate accessor',()=>{
 const test=scene();let reads=0;Object.defineProperty(test.native.scheduler,'invalidate',{get(){reads++;return()=>{};},configurable:true});expect(()=>test.port.assertAvailable(test.inventory)).toThrow();expect(reads).toBe(0);
});
it('inventory preflight rejects behavior, duplicate panes and aliased native owner IDs without cloning or reading accessors',()=>{
 const test=scene();let reads=0;const bad=structuredClone(test.inventory);Object.defineProperty(bad.panes[1],'logicalPaneId',{get(){reads++;return'stable-study';},enumerable:true});expect(()=>test.port.capture(bad)).toThrow();expect(reads).toBe(0);
 const duplicate=structuredClone(test.inventory);duplicate.panes[1]={...duplicate.panes[0]};expect(()=>test.port.capture(duplicate)).toThrow();
 const aliases=structuredClone(test.inventory);aliases.panes[1].owners.push({kind:'script',id:'another-local',rendererId:'native-study'});expect(()=>test.port.capture(aliases)).toThrow();
});
it('independent-scale ownership must resolve to its native model in the declared pane',()=>{
 const test=scene();test.native.scene.indicatorScales.set('native-study',{scale:{min:3,max:7},scaleTarget:{min:4,max:6},manualScale:{min:3,max:7},initialized:true});test.native.scene.indicators.get('native-study').paneId='price';expect(()=>test.port.capture(test.inventory)).toThrow();
});
it('restoration of a frozen late target fails without publishing or changing previously validated panes',()=>{
 const test=scene(),price=test.native.scene.panes.get('price'),study=test.native.scene.panes.get('study');price.heightWeight=7;const token=test.port.capture(test.inventory);price.heightWeight=3;const before=structuredClone(price);Object.freeze(study);let published=0;test.native.scheduler.invalidate=()=>{published++;};expect(()=>test.port.restore(token,test.inventory)).toThrow();expect(price).toEqual(before);expect(published).toBe(0);
});
it('inventory accepts only dense enumerable arrays and bounded unique ownership',()=>{
 const test=scene(),hidden=structuredClone(test.inventory);Object.defineProperty(hidden.panes,'1',{value:hidden.panes[1],enumerable:false,writable:true,configurable:true});expect(()=>test.port.capture(hidden)).toThrow();
 const wide=structuredClone(test.inventory);wide.occupiedIds=Array(20001).fill('Synthetic reserved identity');expect(()=>test.port.capture(wide)).toThrow();
 const sameLogical=structuredClone(test.inventory);sameLogical.panes[1].logicalPaneId='price';expect(()=>test.port.capture(sameLogical)).toThrow();
});
it('a complete rollback checkpoint rejects an extra target pane before reporting restoration succeeded',()=>{
 const test=scene(),token=test.port.capture(test.inventory);test.native.scene.ensurePane('unexpected-extra','study',2,1);const target:AnalysisPaneInventory={...test.inventory,panes:[...test.inventory.panes,{paneId:'unexpected-extra',logicalPaneId:'unexpected-extra',replaceable:false,owners:[]}]};
 const before=structuredClone(test.native.scene.panes.get('price'));expect(()=>test.port.restore(token,target)).toThrow();expect(test.native.scene.panes.get('price')).toEqual(before);
});
