import {describe,expect,it} from 'vitest';
import {priceScaleHarness} from './price-scale-harness';
import {calculateIndicator} from '../../src/domain/indicators';
import {defaultIndicatorPresentation,indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';

// Hiding RSI from the legend left its pane on the renderer's placeholder 0..1 window (a 0.20-0.80 axis).
// The pinned NativeRenderer runs computeScales through the real price-scale port. SYNTHETIC bars.
const BARS=Array.from({length:200},(_,index)=>{const close=23+4*Math.sin(index/7);return{time:1700000000+index*86400,open:close,high:close+0.5,low:close-0.5,close,volume:1};});
function rig(){
 const h=priceScaleHarness({panes:[{id:'price',kind:'price',top:0,height:400,scale:{min:0,max:1}},{id:'study',kind:'study',top:403,height:150,scale:{min:0,max:1}}]}),r=h.renderer;r.animator={active:false,stop(){}};
 const ms=BARS.map(bar=>({...bar,time:bar.time*1000}));r.bars=ms;r.scene.bars=ms;r.coords.setBars(ms.map(bar=>bar.time));r.coords.viewport.barSpacing=4;r.coords.viewport.rightOffset=0;
 const saved:IndicatorInstanceSettings={id:'instance-rsi',kind:'rsi',inputs:{...indicatorDefaults.rsi},plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('rsi')};
 const mount=(visible:boolean)=>{const output=renderIndicatorPresentation({...saved,visible},calculateIndicator('rsi',BARS,saved.inputs),BARS).output;
  r.scene.indicators.set('rsi',{id:'rsi',paneId:'study',overlay:false,ownScale:false,series:(output.series??[]).map((s:any)=>({...s,paneId:'study'})),priceLines:output.priceLines??[],fills:output.fills??[],lines:[],boxes:[],labels:[],polylines:[]});r.computeScales();return {...h.pane('study').scaleTarget};};
 return{h,mount};
}
describe('FLOWS-AUDIT-1028 #17 a hidden study keeps its pane scale',()=>{
 it('hide keeps the last fitted window, show fits again',()=>{
  const {h,mount}=rig(),shown=mount(true);expect(shown.max-shown.min).toBeGreaterThan(10);
  const hidden=mount(false);expect(hidden).toEqual(shown);expect(h.pane('study').scale).toEqual(shown);
  expect(mount(true)).toEqual(shown);
 });
 it('a pane hidden from the start keeps the renderer fallback, and a manual window is never touched',()=>{
  const {h,mount}=rig();expect(mount(false)).toEqual({min:0,max:1});
  mount(true);h.pane('study').manualScale={min:-5,max:5};expect(mount(false)).toEqual({min:-5,max:5});
 });
});
