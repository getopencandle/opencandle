import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {priceScaleHarness} from './price-scale-harness';
import {reconcileManualScales} from '../../src/chart/price-scale-port';

// Release 6 tour, GME daily beside SPY 1m. The pinned Vela 0.8.4 NativeRenderer and
// RendererControl run every scale change and the autoscale/tick passes below (computeScales and the
// renderer's own axis tick source); bars are a SYNTHETIC ramp from 0.80 to 70.00 shaped like a long daily
// history whose linear autoscale puts the lower margin under zero. No DOM, canvas paint or GUI claim.
const SYNTHETIC_BARS=Array.from({length:400},(_,index)=>{const close=0.8*Math.pow(70/0.8,index/399);return{time:Date.UTC(2020,0,1)+index*86400000,open:close,high:close*1.02,low:close*0.98,close,volume:1000};});
function chart(){
 const h=priceScaleHarness(),r=h.renderer;
 r.animator={active:false,stop(){}};r.bars=SYNTHETIC_BARS;r.scene.bars=SYNTHETIC_BARS;r.coords.setBars(SYNTHETIC_BARS.map(bar=>bar.time));
 r.coords.viewport.barSpacing=2;r.coords.viewport.rightOffset=0;
 const frame=()=>{r.computeScales();const pane=h.pane();return{scale:{...pane.scale},labels:r.chrome.axisTicks.ticksFor(r.scene,pane,r.coords).map((tick:{label:string})=>tick.label) as string[]};};
 return{h,r,frame};
}
/** Vela's wide-range log ticks: only 1-2-5 decade values, at least one decade boundary, never 0.00. */
const logDecades=(labels:string[])=>labels.length>=3&&labels.includes('10.00')&&labels.every(label=>{const value=Number(label);if(!(value>0))return false;const decade=Math.pow(10,Math.floor(Math.log10(value)+1e-9));return [1,2,5].some(m=>Math.abs(value-m*decade)<=1e-9*value);});

describe('BUGFIX-H.1 Logarithmic mode transforms the axis',()=>{
 it('autoscaled: Log turns the window and the labels logarithmic (no 0.00 label)',()=>{
  const {h,frame}=chart();expect(frame().scale.min).toBeLessThan(0);
  expect(h.port.execute('logarithmic')).toEqual({ok:true});
  const after=frame();expect(after.scale.log).toBe(true);expect(after.scale.min).toBeGreaterThan(0);expect(logDecades(after.labels),after.labels.join()).toBe(true);
 });
 it('manual window frozen from a linear autoscale with its bottom under zero: Log still draws a log axis',()=>{
  const {h,frame}=chart();const linear=frame();expect(linear.labels).toContain('0.00');
  expect(h.port.execute('auto')).toEqual({ok:true});expect(h.pane().manualScale.min).toBeLessThan(0);
  expect(h.port.execute('logarithmic')).toEqual({ok:true});
  const after=frame();
  expect(h.port.state().mode).toBe('logarithmic');
  expect(after.scale.log).toBe(true);expect(after.scale.min).toBeGreaterThan(0);
  expect(after.labels).not.toContain('0.00');expect(logDecades(after.labels),after.labels.join()).toBe(true);
 });
 it('a positive manual window keeps its bounds and is tagged log (Vela keeps log and auto independent)',()=>{
  const {h,frame}=chart();h.port.execute('auto');const pane=h.pane();pane.manualScale={min:2,max:60};
  h.port.execute('logarithmic');const after=frame();expect(after.scale).toMatchObject({min:2,max:60,log:true});expect(h.port.state().auto).toBe(false);
 });
 it('Auto off right after Log (before the next frame) freezes a log window, not the stale linear one',()=>{
  const {h,frame}=chart();frame();
  h.port.execute('logarithmic');h.pane().scale={min:5,max:60};// last painted (linear) window, no frame yet
  expect(h.port.execute('auto')).toEqual({ok:true});
  expect(h.pane().manualScale).toEqual({min:5,max:60,log:true});expect(frame().scale.log).toBe(true);
 });
 it('adapter Chart options path: applyConfig(log) then autoScale off leaves a linear manual window; reconcile restores the log axis',()=>{
  const {h,r,frame}=chart();frame();
  r.applyConfig({priceScale:{mode:'price',log:true,invert:false}});h.features.set('autoScale',false);
  expect(h.pane().manualScale.log).toBeUndefined();// the defect: menu reads Log, axis would stay linear
  expect(reconcileManualScales(r)).toBe(true);
  const after=frame();expect(after.scale.log).toBe(true);expect(after.scale.min).toBeGreaterThan(0);expect(logDecades(after.labels),after.labels.join()).toBe(true);
  expect(reconcileManualScales(r)).toBe(false);
 });
 it('a log flag changed outside the port is reconciled on the next viewport change',()=>{
  const {h,r,frame}=chart();frame();
  r.applyConfig({priceScale:{mode:'price',log:true,invert:false}});h.features.set('autoScale',false);
  h.viewportChanged();
  const after=frame();expect(after.scale.log).toBe(true);expect(after.scale.min).toBeGreaterThan(0);expect(logDecades(after.labels),after.labels.join()).toBe(true);
 });
 it('Percent and Indexed to 100 transform the axis labels (auto and manual)',()=>{
  const {h,frame}=chart();frame();
  h.port.execute('percent');const pct=frame();expect(pct.labels.length).toBeGreaterThan(2);expect(pct.labels.every(label=>/^[+-]\d+\.\d\d%$/.test(label))).toBe(true);expect(pct.labels).toContain('+0.00%');
  h.port.execute('indexed');const idx=frame();expect(idx.labels).toContain('0.00');expect(idx.labels.some(label=>Number(label)>=1000)).toBe(true);// 70 / 0.8 * 100 = 8750
  h.port.execute('auto');h.port.execute('percent');const manual=frame();expect(manual.labels.every(label=>label.endsWith('%'))).toBe(true);
  h.port.execute('regular');const back=frame();expect(back.labels).toContain('0.00');expect(back.labels.every(label=>!label.endsWith('%'))).toBe(true);
 });
});

describe('BUGFIX-H.2 a price scale menu choice is saved at once',()=>{
 it('a non-document scale command flushes the bound frame gesture immediately instead of leaving a 200 ms timer',()=>{
  const {h}=chart(),trace:string[]=[];
  h.port.bindHost({gesture:{begin(){trace.push('begin');return true;},finish(){trace.push('finish');},flush(settings?:unknown){trace.push('flush:'+(settings===undefined?'frame':'document'));return false;}}});
  h.port.openMenu('price',{x:700,y:100});h.props()!.onActivate('logarithmic','pointer');
  expect(trace).toEqual(['begin','flush:frame']);expect(h.port.isMenuOpen()).toBe(false);
 });
 it('a gesture host without flush still gets finish',()=>{
  const {h}=chart(),finish=vi.fn();h.port.bindHost({gesture:{begin:()=>true,finish}});
  expect(h.port.execute('logarithmic')).toEqual({ok:true});expect(finish).toHaveBeenCalledTimes(1);
 });
});

describe('BUGFIX-H.3 chart legend never covers a cell header',()=>{
 const css=readFileSync('src/ui/styles.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 const rule=(selector:string)=>{const out:string[]=[];for(const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))if(match[1].split(',').map(part=>part.trim()).includes(selector))out.push(match[2]);return out.join(';');};
 const px=(body:string,key:string)=>{const found=[...body.matchAll(new RegExp('(?:^|;)'+key+':(-?\\d+)px','g'))].at(-1);return found?Number(found[1]):null;};
 it('the legend title row stays one 24px row (visual-layout-spec legend.titleRow), so it cannot grow into the header below it',()=>{
  const heading=rule('.chart-heading');expect(heading).toMatch(/flex-wrap:nowrap/);expect(heading).toMatch(/overflow:hidden/);expect(heading).toMatch(/(?:^|;)height:24px/);
  const singleHeader=rule('.lv-multichart>div:last-child>div:only-child>div:first-child');expect(px(singleHeader,'top')).toBeGreaterThanOrEqual(px(heading,'top')!+24+4);
 });
 it('in a multi-chart layout (or a maximized cell) the legend sits below the in-flow cell header row',()=>{
  const multi=rule('.chart-workspace:has(.lv-multichart>div:last-child>div+div) .chart-heading');
  // Cell header row: 3px padding + 22px controls + 3px padding, plus the 1px cell border.
  expect(px(multi,'top')).toBeGreaterThanOrEqual(1+3+22+3+4);
  const legend=rule('.chart-workspace:has(.lv-multichart>div:last-child>div+div) .indicator-legend');expect(px(legend,'top')).toBeGreaterThanOrEqual(px(multi,'top')!+24+4);
 });
});
