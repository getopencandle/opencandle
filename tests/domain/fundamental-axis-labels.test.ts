import {describe,expect,it} from 'vitest';
import {formatFundamentalAxisValue,formatFundamentalValue} from '../../src/domain/indicators-ext/fundamentals-catalog';
import {withIndicatorTickPrecision} from '../../src/chart/indicator-precision-native';
import {installIndicatorDisplay} from '../../src/chart/indicator-display';
import {acquireIndicatorDisplayPort,registerIndicatorDisplayPort} from '../../src/chart/indicator-display-source';
import {indicatorDisplayHarness} from '../chart/indicator-display-harness';

const cap={metric:'mcap'};
describe('fundamentals price-scale labels',()=>{
 it('use one compact unit for the whole visible range',()=>{
  const low=4.8e12,high=5.2e12,labels=[4.8e12,5.0e12,5.2e12].map(v=>formatFundamentalAxisValue(v,'fundamental',cap,low,high));
  expect(labels).toEqual(['4.8T','5.0T','5.2T']);
  expect(formatFundamentalAxisValue(5029.59e9,'fundamental',cap,4.8e12,5.2e12)).toBe('5.0T');
 });
 it('keeps the unit of the range maximum so a low tick is not re-unit',()=>{
  expect(formatFundamentalAxisValue(500e9,'fundamental',cap,0,2e12)).toBe('0.5T');
 });
 it('uses percent and x suffixes for ratio metrics',()=>{
  
  expect(formatFundamentalAxisValue(28.4,'fundamental',{metric:'pe'},20,40).endsWith('x')).toBe(true);
 });
 it('the tick painter uses the axis label when one is supplied',()=>{
  const drawn:string[]=[];
  const coords={priceToY:(price:number)=>100-price/1e11};
  const ctx={fillText(label:string){drawn.push(label);}} as unknown as CanvasRenderingContext2D;
  const axis={scale:{},bounds:{},x:5,maxWidth:60,precision:0,signed:false,suffix:'',transform:(v:number)=>v,label:(v:number)=>formatFundamentalAxisValue(v,'fundamental',cap,4.8e12,5.2e12),assertCurrent(){}};
  withIndicatorTickPrecision(ctx,coords as never,[axis],()=>{},(context,coordinates)=>{
   const y=(coordinates as any).priceToY(5.0e12,axis.scale,axis.bounds);
   (context as any).fillText('5000B',5,y,60);
  });
  expect(drawn).toEqual(['5.0T']);
 });
 // The real painters: the native master-axis ticks read the axis label also under a host tick hook (the app installs one
 // whenever a value tag is drawn), a tick the hook blanked stays blank, and the value tag reads the full legend value.
 it('pane ticks use the compact axis label while the value tag keeps the full value',async()=>{
  const t=await indicatorDisplayHarness(false);let metric={metric:'pe'},compact=false;
  t.port.add('atr',{length:1});const model=t.native.scene.indicators.get(t.port.list()[0].rendererId),pane=t.native.scene.panes.get(model.paneId);Object.assign(pane,{bounds:{top:180,height:180},scale:{min:0,max:40},axisFormat:'price'});t.coords.height=360;
  const real=acquireIndicatorDisplayPort(t.port,t.chart),view={},release=registerIndicatorDisplayPort(view,t.chart,()=>real.read().map(row=>({...row,compact,axisLabel:(value:number,low:number,high:number)=>formatFundamentalAxisValue(value,'fundamental',metric,low,high),valueLabel:(value:number)=>formatFundamentalValue(value,'fundamental',metric)})));
  const display=installIndicatorDisplay(t.renderer,t.chart,view);
  const ticks=()=>{t.recording.commands.length=0;t.native.chrome.drawPriceAxes(t.recording.ctx,t.native.scene,t.coords,t.native.theme,300,[pane]);return t.recording.commands.filter(row=>row.op==='fillText').map(row=>row.values[0]);};
  try{
   expect(ticks()).toEqual(['10x','20x','30x']);
   t.native.chrome.axisTicks.setHook((context:any)=>context.defaults);expect(ticks()).toEqual(['10x','20x','30x']);
   t.native.chrome.axisTicks.setHook((context:any)=>context.defaults.map((tick:any)=>tick.price===20?{...tick,label:''}:tick));expect(ticks()).toEqual(['10x','','30x']);
   expect(t.paint().map(row=>row.values[0])).toEqual(['11.00x']);// ATR(1) ends at 11: the tag is the legend value, not the tick "11x"
   metric={metric:'mcap'};compact=true;Object.assign(pane,{scale:{min:0,max:4e13}});delete pane.axisFormat;t.native.chrome.axisTicks.setHook((context:any)=>context.defaults);
   expect(ticks()).toEqual(['10T','20T','30T']);expect(pane.axisFormat).toBe('volume');expect(display.diagnostics()).toEqual([]);
  }finally{display.dispose();release();t.dispose();}
 });
});
