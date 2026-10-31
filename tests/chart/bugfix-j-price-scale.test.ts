import {describe,expect,it} from 'vitest';
import {priceScaleHarness} from './price-scale-harness';
import {reconcileManualScales} from '../../src/chart/price-scale-port';

// PRE-R7-2 (with no bars, Log plus Auto off releases the window
// (nothing to fit, the earlier policy kept) but the state is no longer silent: the port reports it, the scale menu shows it,
// and the saved Auto off is applied once bars arrive. The pinned Vela 0.8.4 NativeRenderer + RendererControl run
// the scale passes over a SYNTHETIC ramp. No DOM layout, canvas paint, GUI or packaged-build claim.
const SYNTHETIC_BARS=Array.from({length:400},(_,index)=>{const close=0.8*Math.pow(70/0.8,index/399);return{time:Date.UTC(2020,0,1)+index*86400000,open:close,high:close*1.02,low:close*0.98,close,volume:1000};});
function empty(){
 const h=priceScaleHarness({panes:[{id:'price',kind:'price',top:0,height:500,scale:{min:-5,max:50}}]}),r=h.renderer;
 r.animator={active:false,stop(){}};
 /** What src/chart/adapter.ts applyChartOptions does: config, autoScale, reconcile. */
 const apply=(auto:boolean)=>{r.applyConfig({priceScale:{mode:'price',log:true,invert:false}});h.features.set('autoScale',auto);reconcileManualScales(r);};
 const barsArrive=()=>{r.bars=SYNTHETIC_BARS;r.scene.bars=SYNTHETIC_BARS;r.coords.setBars(SYNTHETIC_BARS.map(bar=>bar.time));r.coords.viewport.barSpacing=2;r.coords.viewport.rightOffset=0;r.computeScales();h.viewportChanged();};
 const liveAuto=()=>h.features.get('autoScale')!==false;
 return {h,r,apply,barsArrive,liveAuto};
}

describe('PRE-R7-2 no bars: Log with Auto off is visible and converges on the saved options',()=>{
 it('the released window is reported by the port and in the scale menu status, not silent',()=>{
  const {h,apply}=empty();
  expect(h.port.scaleNotice()).toBeNull();
  apply(false);
  expect(h.pane().manualScale).toBeNull();// Earlier policy kept: nothing to fit yet
  expect(h.port.scaleNotice()).toMatch(/Auto scale is on until bars load/);
  h.port.openMenu('price',{x:10,y:10});
  expect(h.props()!.status).toMatch(/Auto scale is on until bars load/);
  h.port.closeMenu();
 });
 it('when bars arrive the saved Auto off is applied on a positive log window, and the notice clears',()=>{
  const {h,apply,barsArrive,liveAuto}=empty();apply(false);
  barsArrive();
  expect(liveAuto(),'live chart agrees with the saved auto:false').toBe(false);
  expect(h.port.state().auto).toBe(false);expect(h.port.state().mode).toBe('logarithmic');
  const manual=h.pane().manualScale;expect(manual.log).toBe(true);expect(manual.min).toBeGreaterThan(0);expect(manual.max).toBeGreaterThan(manual.min);
  expect(h.port.scaleNotice()).toBeNull();
 });
 it('an explicit Auto on (Chart options) before bars arrive cancels the pending manual window',()=>{
  const {h,apply,barsArrive,liveAuto}=empty();apply(false);apply(true);
  expect(h.port.scaleNotice()).toBeNull();
  barsArrive();expect(liveAuto()).toBe(true);expect(h.pane().manualScale).toBeNull();
 });
 it('Reset price scale and leaving Logarithmic also cancel it',()=>{
  const reset=empty();reset.apply(false);expect(reset.h.port.execute('reset').ok).toBe(true);
  expect(reset.h.port.scaleNotice()).toBeNull();reset.barsArrive();expect(reset.liveAuto()).toBe(true);
  const linear=empty();linear.apply(false);expect(linear.h.port.execute('logarithmic').ok).toBe(true);
  expect(linear.h.port.state().mode).toBe('regular');expect(linear.h.port.scaleNotice()).toBeNull();
  linear.barsArrive();expect(linear.h.pane().manualScale?.log??false).toBe(false);
 });
});
