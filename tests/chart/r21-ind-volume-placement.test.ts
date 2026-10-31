import {describe,expect,it,vi} from 'vitest';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {VOLUME_OVERLAY_MARGINS} from '../../src/chart/indicator-scale';

// A new Volume overlays the bottom band of the price pane (
// the recorded facts "overlay at the bottom of the main pane"; the fresh-layout Vol row reads
// "Pin to scale (now no scale)", the recorded facts). Move rule: a
// Volume moved out of the price pane drops the bottom band (full height in its new pane); a Volume moved back into the
// price pane is the bottom-band overlay again, as a new one would be. Real port on the pinned Vela core. SYNTHETIC bars.
const rows=Array.from({length:60},(_,i)=>{const close=50+(i%4);return {time:1700000000000+i*60000,open:close-0.5,high:close+1,low:close-1,close,volume:100+(i*13)%50};});
async function setup(){
 const t=await nativeCoreHarness(),margins=vi.fn();(t.core.renderer as any).lvSetIndicatorScaleMargins=margins;
 const port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);t.core.bars=rows;
 const factory=factoryIndicatorDefault('volume'),id=port.add('volume',factory.inputs,factory,{volumeOverlay:true});
 const nativeId=port.list().find(row=>row.id===id)!.rendererId;
 return {t,port,id,nativeId,margins,pane:()=>port.list().find(row=>row.id===id)!.paneId,dispose:()=>{port.dispose();t.dispose();}};
}
describe(' Volume pane placement on move',()=>{
 it('moving the overlay Volume to a new pane clears its bottom band and its overlay pin',async()=>{
  const s=await setup();
  try{
   const fresh=s.port.scale(s.id);expect(s.pane()).toBe('price');expect(fresh.pinned).toBe(true);
   expect(s.margins).toHaveBeenCalledWith(s.nativeId,VOLUME_OVERLAY_MARGINS);s.margins.mockClear();
   s.port.move(s.id,{newPane:true});
   expect(s.pane()).not.toBe('price');
   expect(s.margins).toHaveBeenCalledWith(s.nativeId,{top:0,bottom:0});
   expect(s.port.scale(s.id).pinned).toBe(false);
  }finally{s.dispose();}
 });
 it('moving Volume back to the price pane restores the bottom-band overlay a new Volume gets',async()=>{
  const s=await setup();
  try{
   const fresh=s.port.scale(s.id);
   s.port.move(s.id,{newPane:true});s.margins.mockClear();
   s.port.move(s.id,'price');
   expect(s.pane()).toBe('price');
   expect(s.margins).toHaveBeenCalledWith(s.nativeId,VOLUME_OVERLAY_MARGINS);
   const back=s.port.scale(s.id);expect(back.pinned).toBe(true);expect(back.placement).toBe(fresh.placement);expect(back.ownScale).toBe(fresh.ownScale);
   // The restored overlay is saved like a new one, so a reload keeps it.
   const saved=s.port.serialize().find(row=>row.id===s.id)!;expect(saved.paneId).toBe('price');
  }finally{s.dispose();}
 });
 it('other kinds moved into the price pane keep the renderer natural scale (no overlay band)',async()=>{
  const t=await nativeCoreHarness(),margins=vi.fn();(t.core.renderer as any).lvSetIndicatorScaleMargins=margins;
  const port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);t.core.bars=rows;
  try{const factory=factoryIndicatorDefault('rsi'),id=port.add('rsi',factory.inputs,factory);
   port.move(id,'price');expect(port.list().find(row=>row.id===id)!.paneId).toBe('price');
   expect(margins).not.toHaveBeenCalled();expect(port.scale(id).pinned).toBe(false);
  }finally{port.dispose();t.dispose();}
 });
});
