import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {priceScaleHarness} from './price-scale-harness';
import {reconcileManualScales} from '../../src/chart/price-scale-port';

// Price scale and legend regressions.
// The pinned Vela 0.8.4 NativeRenderer + RendererControl run the scale passes over a SYNTHETIC ramp
// (0.80 to 70.00) whose linear autoscale puts the lower margin under zero. The legend checks read
// src/ui/styles.css rules. No DOM layout, canvas paint, GUI or packaged-build claim.
const SYNTHETIC_BARS=Array.from({length:400},(_,index)=>{const close=0.8*Math.pow(70/0.8,index/399);return{time:Date.UTC(2020,0,1)+index*86400000,open:close,high:close*1.02,low:close*0.98,close,volume:1000};});
function chart(){
 const h=priceScaleHarness(),r=h.renderer;
 r.animator={active:false,stop(){}};r.bars=SYNTHETIC_BARS;r.scene.bars=SYNTHETIC_BARS;r.coords.setBars(SYNTHETIC_BARS.map(bar=>bar.time));
 r.coords.viewport.barSpacing=2;r.coords.viewport.rightOffset=0;
 const frame=()=>{r.computeScales();const pane=h.pane();return{scale:{...pane.scale},labels:r.chrome.axisTicks.ticksFor(r.scene,pane,r.coords).map((tick:{label:string})=>tick.label) as string[]};};
 return{h,r,frame};
}
/** What src/chart/adapter.ts applyChartOptions does for {scale:'logarithmic',auto:false} (config, autoScale, reconcile). */
function applyLogManualOptions(h:ReturnType<typeof chart>['h'],r:any){
 r.applyConfig({priceScale:{mode:'price',log:true,invert:false}});h.features.set('autoScale',false);reconcileManualScales(r);
}
/** adapter getChartOptions().auto reads renderer.get('autoScale'). */
const liveAuto=(h:ReturnType<typeof chart>['h'])=>h.features.get('autoScale')!==false;

describe('GH-H1 Chart options Log with auto off stays auto off on a positive log window',()=>{
 it('a last painted window with min <= 0 does not switch the chart back to auto',()=>{
  const {h,r,frame}=chart();expect(frame().scale.min).toBeLessThan(0);
  applyLogManualOptions(h,r);
  expect(liveAuto(h)).toBe(false);// saved options say auto off; the live chart agrees
  expect(h.port.state().auto).toBe(false);expect(h.port.state().mode).toBe('logarithmic');
  const manual=h.pane().manualScale;expect(manual.log).toBe(true);expect(manual.min).toBeGreaterThan(0);expect(manual.max).toBeGreaterThan(manual.min);
 });
 it('the derived manual window is the renderer\'s own log fit of the visible data, and it stays frozen',()=>{
  const fit=chart();fit.frame();fit.h.port.execute('logarithmic');const auto=fit.frame().scale;
  const {h,r,frame}=chart();frame();applyLogManualOptions(h,r);
  expect(h.pane().manualScale.min).toBeCloseTo(auto.min,9);expect(h.pane().manualScale.max).toBeCloseTo(auto.max,9);
  r.coords.viewport.barSpacing=6;const after=frame();// a later viewport change does not refit a manual window
  expect(after.scale.min).toBeCloseTo(auto.min,9);expect(after.scale.log).toBe(true);expect(after.labels).not.toContain('0.00');
  expect(reconcileManualScales(r)).toBe(false);
 });
 it('GH-H2: a restored frame with a log manual range under zero keeps manual on the next viewport change',()=>{
  const {h,frame}=chart();frame();
  h.port.execute('logarithmic');h.port.execute('auto');h.pane().manualScale={min:-1,max:70,log:true};
  h.viewportChanged();
  expect(h.port.state().auto).toBe(false);expect(h.pane().manualScale.min).toBeGreaterThan(0);expect(frame().scale.log).toBe(true);
 });
 it('with no bars to fit, an unloggable window is still released to autoscale (nothing to derive from)',()=>{
  const h=priceScaleHarness({panes:[{id:'price',kind:'price',top:0,height:500,scale:{min:-5,max:50}}]}),r=h.renderer;
  r.applyConfig({priceScale:{mode:'price',log:true,invert:false}});h.features.set('autoScale',false);
  expect(reconcileManualScales(r)).toBe(true);expect(h.pane().manualScale).toBeNull();
 });
});

describe('GH-H3 the legend header keeps OHLC values in narrow cells',()=>{
 const css=readFileSync('src/ui/styles.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 /** Rules at top level (at=null), or inside an at-rule block whose prelude contains `at`. */
 const scoped=(at:string|null)=>{const out:Array<{scope:string|null;selector:string;body:string}>=[];let depth=0,buffer='',scope:string|null=null,selector='';
  for(const ch of css){if(ch==='{'){const head=buffer.trim();buffer='';if(depth===0&&head.startsWith('@'))scope=head;else selector=head;depth++;continue;}
   if(ch==='}'){if(depth===2||(depth===1&&scope===null))out.push({scope,selector,body:buffer.trim()});else if(depth===1)scope=null;depth--;buffer='';continue;}
   buffer+=ch;}
  return out.filter(row=>at===null?row.scope===null:(row.scope??'').includes(at));};
 const rule=(selector:string,at:string|null=null)=>scoped(at).filter(row=>row.selector.split(',').map(part=>part.trim()).includes(selector)).map(row=>row.body).join(';');
 const px=(body:string,key:string)=>{const found=[...body.matchAll(new RegExp('(?:^|;)\\s*'+key+':(-?\\d+)px','g'))].at(-1);return found?Number(found[1]):null;};
 it('OHLC never shrinks; the title descriptor gives way first with an ellipsis (symbol and SYNTHETIC badge kept)',()=>{
  expect(rule('.chart-heading>.ohlc')+';'+rule('.chart-heading .ohlc')).toMatch(/flex-shrink:0|flex:0 0 auto/);
  const title=rule('.chart-heading>div:first-child');expect(title).toMatch(/min-width:0/);expect(title).toMatch(/flex:0 1 auto|flex-shrink:1/);
  const descriptor=rule('.chart-heading>div:first-child>span');expect(descriptor).toMatch(/text-overflow:ellipsis/);expect(descriptor).toMatch(/min-width:0/);
  expect(rule('.chart-heading strong')+';'+rule('.chart-heading .synthetic-badge')).toMatch(/flex-shrink:0/);
 });
 it('the chart workspace is a size container, and a narrow one puts the OHLC values on their own second row (visual-dialogs-legend series.parts: OHLC row follows the 24px title row)',()=>{
  expect(rule('.chart-workspace')).toMatch(/container:\s*lv-chart\s*\/\s*inline-size|container-type:inline-size/);
  const narrow=rule('.chart-heading','@container lv-chart');expect(narrow).toMatch(/flex-wrap:wrap/);expect(px(narrow,'height')).toBe(48);
  expect(rule('.chart-heading>.ohlc','@container lv-chart')).toMatch(/flex-basis:100%|width:100%/);
 });
 it('in the narrow two-row mode nothing below is covered (single cell header, indicator legend, multi-cell offsets)',()=>{
  const at='@container lv-chart',heading=px(rule('.chart-heading'),'top')!,rows=px(rule('.chart-heading',at),'height')!;
  const singleHeader=px(rule('.lv-multichart>div:last-child>div:only-child>div:first-child',at),'top')!;expect(singleHeader).toBeGreaterThanOrEqual(heading+rows+4);
  expect(px(rule('.indicator-legend',at),'top')).toBeGreaterThanOrEqual(singleHeader+24+4);
  const multi=px(rule('.chart-workspace:has(.lv-multichart>div:last-child>div+div) .chart-heading'),'top')!;
  expect(px(rule('.chart-workspace:has(.lv-multichart>div:last-child>div+div) .indicator-legend',at),'top')).toBeGreaterThanOrEqual(multi+rows+4);
 });
 it('the wide one-row mode is unchanged (H.3 multi-cell non-overlap fix kept)',()=>{
  const heading=rule('.chart-heading');expect(heading).toMatch(/flex-wrap:nowrap/);expect(heading).toMatch(/(?:^|;)height:24px/);
  expect(px(rule('.chart-workspace:has(.lv-multichart>div:last-child>div+div) .chart-heading'),'top')).toBe(34);
  expect(px(rule('.chart-workspace:has(.lv-multichart>div:last-child>div+div) .indicator-legend'),'top')).toBe(64);
 });
});
