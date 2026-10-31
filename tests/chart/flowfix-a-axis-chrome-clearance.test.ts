import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {NativeRenderer,RendererControl} from '@luxalgo/vela';
import {installPriceScalePort,AXIS_BUTTONS_CLUSTER_PX,CURRENCY_LABEL_PX} from '../../src/chart/price-scale-port';
import {fakeDocument,velaChrome,type VelaChrome} from './scalex-harness';
import {eventTarget} from './price-scale-harness';
import {commandCanvas} from './chart-paint-harness';

// The A/L cluster and the Currency and Unit label covered the lowest price-axis tick labels ("20.80" hidden,
// a clipped "2"). The pinned Vela NativeRenderer chrome paints the axis text through the real port, with the renderer's own
// AxisScaleButtons class and the port's own currency node (scalex-harness element stand-ins). SYNTHETIC bars, 18 to 28.
let chrome:VelaChrome;
beforeAll(async()=>{chrome=await velaChrome();});
afterEach(()=>{vi.unstubAllGlobals();});
const BARS=Array.from({length:200},(_,index)=>{const close=23+4*Math.sin(index/9);return{time:Date.UTC(2025,0,2)+index*86400000,open:close,high:close+0.5,low:close-0.5,close,volume:1};});
function rig(){
 const doc=fakeDocument();vi.stubGlobal('document',doc);
 const r=new NativeRenderer() as any,features=new RendererControl(r);
 const pane=r.scene.ensurePane('price','price',0,1);pane.bounds={top:0,height:500};pane.initialized=true;
 r.coords.setSize(800,600,1);r.animator={active:false,stop(){}};
 r.bars=BARS;r.scene.bars=BARS;r.coords.setBars(BARS.map(bar=>bar.time));r.coords.viewport.barSpacing=4;r.coords.viewport.rightOffset=0;r.computeScales();
 const invalidations:number[]=[];r.scheduler={invalidate(level:number){invalidations.push(level);},cancel(){}};
 r.input={el:{getBoundingClientRect:()=>({left:10,top:20,width:864,height:628})}};
 const plot=doc.createElement('div');r.plot=plot;
 r.axisScaleButtons=new chrome.AxisScaleButtons(plot,{background:'#0F0F0F'},{panes:()=>r.axisScaleViews(),rightAxis:()=>r.rightAxisW,onToggleAuto:()=>{},onToggleLog:()=>{}});
 const container:any={...eventTarget(),ownerDocument:doc,contains:(node:unknown)=>node===container,closest:()=>null};
 const port=installPriceScalePort({renderer:r,features:features as any,onViewportChanged:()=>()=>{},container,mount:()=>({render(){},focus(){},contains:()=>false,dispose(){}})});
 port.bindHost({gesture:{begin:()=>true,finish(){},flush:()=>true},commitSettings:()=>true,data:{prePost:false,bidAsk:false,currency:'USD',unit:null}});
 r.scene.showAxisLabels=true;const recording=commandCanvas();r.chrome.ctx=recording.ctx;r.chrome.canvas={width:864,height:628};
 // Only the price-axis text pass is under test: the other chrome passes (their colors need a DOM canvas) are silenced on this instance.
 for(const key of ['drawPriceLineAndCountdown','drawTimeAxis','drawMarkLane','drawMergedScaleColumns','drawPaneSeparators','renderTrades'])r.chrome[key]=()=>{};
 const dataW=r.coords.width,half=Math.ceil(r.scene.style.fontSize/2)+1,bottom=pane.bounds.top+pane.bounds.height;
 const draw=()=>{recording.commands.length=0;r.chrome.render(r.scene,r.coords,r.theme);return recording.commands.filter((row:any)=>row.op==='fillText'&&row.values[1]===dataW+6).map((row:any)=>({label:String(row.values[0]),y:Number(row.values[2])}));};
 return{r,port,pane,draw,half,bottom,invalidations};
}
describe('FLOWS-AUDIT-1028 #15 scale chrome never covers tick labels',()=>{
 it('A/L shown: no tick label reaches into the cluster rows; hidden: the labels are back',()=>{
  const {r,port,pane,draw,half,bottom,invalidations}=rig(),all=draw(),clusterTop=bottom-AXIS_BUTTONS_CLUSTER_PX;
  expect(all.length).toBeGreaterThan(4);expect(all.some(row=>row.y+half>clusterTop),'the fixture has a label under the cluster').toBe(true);
  invalidations.length=0;port.setChrome({modeButtons:'always',currencyUnit:'never'});
  expect(r.axisScaleButtons.cluster.style.display).toBe('flex');expect(parseFloat(r.axisScaleButtons.cluster.style.top)).toBe(clusterTop);expect(invalidations).toContain(2);
  const covered=draw();expect(covered.every(row=>row.y+half<=clusterTop)).toBe(true);
  expect(covered.map(row=>row.label)).toEqual(all.filter(row=>row.y+half<=clusterTop).map(row=>row.label));
  // Gridlines read the same tick source outside the chrome pass: unchanged.
  expect(r.chrome.axisTicks.ticksFor(r.scene,pane,r.coords).map((tick:any)=>tick.label)).toEqual(expect.arrayContaining(all.map(row=>row.label)));
  port.setChrome({modeButtons:'never'});expect(draw()).toEqual(all);
  port.setChrome({modeButtons:'always'});port.dispose();expect(Object.hasOwn(r.chrome,'render')).toBe(false);expect(Object.hasOwn(r.chrome.axisTicks,'ticksFor')).toBe(false);
 });
 it('the Currency and Unit label above the cluster clears its row too',()=>{
  const {port,draw,half,bottom}=rig(),all=draw(),clusterTop=bottom-AXIS_BUTTONS_CLUSTER_PX,labelTop=clusterTop-CURRENCY_LABEL_PX;
  expect(all.some(row=>row.y+half>labelTop&&row.y-half<clusterTop),'the fixture has a label in the currency row').toBe(true);
  port.setChrome({modeButtons:'always',currencyUnit:'always'});expect(port.chrome().currencyShown).toBe(true);
  const shown=draw();expect(shown.every(row=>row.y+half<=labelTop)).toBe(true);
  expect(shown.map(row=>row.label)).toEqual(all.filter(row=>row.y+half<=labelTop).map(row=>row.label));
  port.setChrome({modeButtons:'never',currencyUnit:'never'});expect(draw()).toEqual(all);
 });
});
