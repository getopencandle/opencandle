import {describe,expect,it} from 'vitest';
import {priceScaleHarness} from './price-scale-harness';
import {calculateIndicator,type IndicatorId} from '../../src/domain/indicators';
import {defaultIndicatorPresentation,indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {renderScriptPlots} from '../../src/chart/script-port';

// A price-pane overlay (BB, EMA, SMA, a script plot) pulled the main autoscale down to 0 because every
// line-like plot carried style.base:0, which the pinned Vela autoscale folds into the pane range. The real NativeRenderer +
// RendererControl (price-scale harness) run computeScales over SYNTHETIC bars that trade between 18 and 28.
const BARS=Array.from({length:300},(_,index)=>{const close=23+4*Math.sin(index/9);return{time:1700000000+index*86400,open:close,high:close+0.6,low:close-0.6,close,volume:1000};});
const lo=Math.min(...BARS.map(bar=>bar.low)),hi=Math.max(...BARS.map(bar=>bar.high));
function chart(){
 const h=priceScaleHarness({panes:[{id:'price',kind:'price',top:0,height:500,scale:{min:0,max:1}}]}),r=h.renderer;
 r.animator={active:false,stop(){}};
 const ms=BARS.map(bar=>({...bar,time:bar.time*1000}));r.bars=ms;r.scene.bars=ms;r.coords.setBars(ms.map(bar=>bar.time));r.coords.viewport.barSpacing=2;r.coords.viewport.rightOffset=0;
 const mount=(id:string,output:{series?:unknown[];priceLines?:unknown[];fills?:unknown[]})=>{r.scene.indicators.set(id,{id,paneId:'price',overlay:true,ownScale:false,series:(output.series??[]).map((s:any)=>({...s,paneId:'price'})),priceLines:output.priceLines??[],fills:output.fills??[],lines:[],boxes:[],labels:[],polylines:[]});r.computeScales();return h.pane().scaleTarget as {min:number;max:number};};
 r.computeScales();return {h,r,mount,base:{...h.pane().scaleTarget}};
}
const fitted=(scale:{min:number;max:number})=>{expect(scale.min).toBeGreaterThan(lo-(hi-lo)*0.5);expect(scale.max).toBeLessThan(hi+(hi-lo)*0.5);expect(scale.min).toBeGreaterThan(10);};

describe('FLOWS-AUDIT-1028 #2 overlays autoscale with price, warmup excluded',()=>{
 it('the candles alone fit 18..28',()=>{const {base}=chart();fitted(base);});
 for(const kind of ['bb','ema','sma'] as IndicatorId[])it(`${kind} on the price pane keeps the axis fitted to price`,()=>{
  const {mount}=chart();
  const saved:IndicatorInstanceSettings={id:`instance-${kind}`,kind,inputs:{...indicatorDefaults[kind]},plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind)};
  const result=calculateIndicator(kind,BARS,saved.inputs);expect(result.series[0].values.slice(0,30).every(value=>value===null||value>10),'warmup is null, never 0').toBe(true);
  const output=renderIndicatorPresentation(saved,result,BARS).output;
  for(const series of output.series as any[])if(series.kind!=='histogram'&&series.kind!=='columns')expect(series.style.base).toBeUndefined();
  fitted(mount(saved.id,output));
 });
 it('a script plot with warmup nulls keeps the axis fitted to price',()=>{
  const {mount}=chart();
  const plots=[{id:'lvplot:Fast',title:'Fast',color:'#6fa8ff',values:BARS.map((bar,index)=>({time:bar.time,value:index<20?null:bar.close+0.2}))}];
  fitted(mount('script-a',{series:renderScriptPlots('script-a',plots,{},BARS.at(-1)!.time)}));
 });
 it('histogram and columns plots still own their zero base',()=>{
  const {mount}=chart();
  const saved:IndicatorInstanceSettings={id:'instance-macd',kind:'macd',inputs:{...indicatorDefaults.macd},plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('macd')};
  const output=renderIndicatorPresentation(saved,calculateIndicator('macd',BARS,saved.inputs),BARS).output,histogram=(output.series as any[]).find(series=>series.kind==='histogram');
  expect(histogram.style.base).toBe(0);expect(defaultPlotStyle('macd','histogram',2).kind).toBe('histogram');
  expect(mount(saved.id,output).min).toBeLessThanOrEqual(0);
 });
});
