import {describe,expect,it} from 'vitest';
import {priceScaleHarness} from './price-scale-harness';
import {axisPriceText} from '../../src/chart/axis-labels';
import {chipRelabel} from '../../src/chart/appearance-painters';
import {crosshairChipText} from '../../src/chart/precision-crosshair';

// SYNTHETIC: SPY (tick 0.01) printed its last price chip as 142.6 while the close was 142.63. Root
// cause: after every completed load vela's EngineOrchestrator.refreshPriceFormat() calls renderer.setPricePrecision with the
// feed's symbolInfo mintick, which LV's feed does not supply, so the renderer fell back to its zoom decimals (1 on SPY's range)
// until the next viewport change re-synced the port. The port now owns that native call.
const vela=(renderer:any)=>renderer.setPricePrecision(undefined);// what refreshPriceFormat() does with no symbolInfo
const SPY={min:115,max:160};

describe('Default precision for a 0.01-tick instrument',()=>{
 it('survives the renderer\'s post-load price format refresh',()=>{
  const h=priceScaleHarness({panes:[{id:'price',kind:'price',top:0,height:700,scale:SPY}],tickSize:()=>0.01});
  try{
   expect(h.renderer.scene.priceMintick).toBe(0.01);
   vela(h.renderer);
   expect(h.renderer.scene.priceMintick).toBe(0.01);
   const pane=h.pane(),context={scale:pane.scale,height:pane.bounds.height,mintick:h.renderer.scene.priceMintick};
   // Last price chip and crosshair chip: renderer text stands for Default (no relabel), formatted at the tick.
   expect(chipRelabel(142.63,h.renderer.scene,pane,undefined)).toBeNull();
   expect(crosshairChipText(142.63,h.renderer.scene,pane,undefined)).toBeNull();
   expect(crosshairChipText(142.63,h.renderer.scene,pane,'default')).toBeNull();
   expect(axisPriceText(142.63,context)).toBe('142.63');
   // Axis ticks print two decimals, not 160.0.
   expect(axisPriceText(160,context)).toBe('160.00');expect(axisPriceText(155,context)).toBe('155.00');
   // Crosshair at an arbitrary pointer price.
   expect(axisPriceText(160.2149,context)).toBe('160.21');
   // The renderer's own formatter (data window) agrees.
   expect(h.renderer.dataWindowFmt(142.63,pane)).toBe('142.63');
  }finally{h.port.dispose();}
 });
 it('an explicit stored decimal precision still wins over the refresh, and an unknown tick lets the native value through',()=>{
  let tick:number|undefined=0.01;
  const h=priceScaleHarness({panes:[{id:'price',kind:'price',top:0,height:700,scale:SPY}],tickSize:()=>tick});
  try{
   h.port.setPrecision('4');vela(h.renderer);expect(h.renderer.scene.priceMintick).toBe(0.0001);
   h.port.setPrecision(undefined);tick=undefined;h.renderer.setPricePrecision(0.5);expect(h.renderer.scene.priceMintick).toBe(0.5);
  }finally{h.port.dispose();}
 });
 it('dispose removes the seam',()=>{
  const h=priceScaleHarness({tickSize:()=>0.01});
  expect(Object.hasOwn(h.renderer,'setPricePrecision')).toBe(true);
  h.port.dispose();
  expect(Object.hasOwn(h.renderer,'setPricePrecision')).toBe(false);
  vela(h.renderer);expect(h.renderer.scene.priceMintick).toBeUndefined();
 });
});
