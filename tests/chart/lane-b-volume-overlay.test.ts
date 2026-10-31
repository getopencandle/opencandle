import {describe,expect,it,vi} from 'vitest';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {VOLUME_OVERLAY_MARGINS,setIndicatorScaleMargins} from '../../src/chart/indicator-scale';

// Volume overlays the bottom band of the price pane. Real port on the pinned Vela core.
const rows=Array.from({length:60},(_,i)=>{const close=50+(i%4);return {time:1700000000000+i*60000,open:close-0.5,high:close+1,low:close-1,close,volume:100+(i*13)%50};});
describe('volume overlay',()=>{
 it('a new Volume instance sits on the price pane with its own scale, not in a pane of its own',async()=>{
  const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);t.core.bars=rows;
  try{const factory=factoryIndicatorDefault('volume'),id=port.add('volume',factory.inputs,factory,{volumeOverlay:true});
   expect(port.list().find(row=>row.id===id)!.paneId).toBe('price');
   expect(['own','none']).toContain(port.scale(id).placement??(port.scale(id).ownScale?'own':'shared'));
   expect(port.scale(id).ownScale).toBe(true);
  }finally{port.dispose();t.dispose();}
 });
 it('without the overlay option Volume keeps its own pane (restore and scripted adds)',async()=>{
  const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);t.core.bars=rows;
  try{const factory=factoryIndicatorDefault('volume'),id=port.add('volume',factory.inputs,factory);
   expect(port.list().find(row=>row.id===id)!.paneId).not.toBe('price');
  }finally{port.dispose();t.dispose();}
 });
 it('a saved Volume pane choice is kept',async()=>{
  const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);t.core.bars=rows;
  try{const factory=factoryIndicatorDefault('volume'),id=port.add('volume',factory.inputs,{...factory,paneId:'lv-pane-keep'},{volumeOverlay:true});
   expect(port.list().find(row=>row.id===id)!.paneId).not.toBe('price');
  }finally{port.dispose();t.dispose();}
 });
});
describe('scale margins',()=>{
 it('the overlay band is the bottom fifth',()=>{expect(VOLUME_OVERLAY_MARGINS).toEqual({top:0.8,bottom:0});});
 it('applies margins through the renderer hook and reports false when the renderer has none',()=>{
  const hook=vi.fn(),withHook={orchestrator:{renderer:{lvSetIndicatorScaleMargins:hook}}} as any,without={orchestrator:{renderer:{}}} as any;
  expect(setIndicatorScaleMargins(withHook,'n1',VOLUME_OVERLAY_MARGINS)).toBe(true);expect(hook).toHaveBeenCalledWith('n1',{top:0.8,bottom:0});
  expect(setIndicatorScaleMargins(without,'n1',VOLUME_OVERLAY_MARGINS)).toBe(false);
 });
 it('refuses margins outside 0..1 or that leave no room',()=>{
  expect(()=>setIndicatorScaleMargins({orchestrator:{renderer:{lvSetIndicatorScaleMargins:vi.fn()}}} as any,'n',{top:0.9,bottom:0.2})).toThrow(/margins/);
  expect(()=>setIndicatorScaleMargins({orchestrator:{renderer:{}}} as any,'n',{top:-1,bottom:0})).toThrow(/margins/);
 });
});
