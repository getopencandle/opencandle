// The Chart settings Right margin row accepts only what the pinned renderer draws (its 200-bar cap), so the
// saved setting and the chart agree. Real NativeRenderer state; SYNTHETIC daily bars; no DOM or GUI claim.
import {describe,expect,it} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {factoryAppearance,factoryPriceScale,findRow,writeRow,type ChartSettingsSources} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {applyRightMargin,RIGHT_MARGIN_MAX_BARS} from '../../src/chart/right-margin';

const sources=(extra:Partial<ChartSettingsSources>={}):ChartSettingsSources=>({appearance:factoryAppearance(),document:defaultChartSettingsDocument(),documentConnected:true,priceScale:factoryPriceScale(),ratio:0.5,style:'candles',typeSettings:null,timezone:'UTC',exchangeTimezone:null,scaleMode:{scale:'linear',invert:false,auto:true},...extra});
function renderer(){const r=new NativeRenderer() as any;r.scheduler={invalidate(){}};r.animator={stop(){},start(){}};r.animScroll.set(0);r.coords.setSize(951,700,1);r.coords.setBars(Array.from({length:500},(_,i)=>Date.UTC(2024,0,1)+i*86400000));r.fitContent();return r;}
const rowNumber=(s:ChartSettingsSources)=>(findRow('canvas',s,'canvas.paneRightMargin')!.value as {number:number}).number;

describe('Chart settings Right margin and the renderer cap',()=>{
 it('the cap is 200 bars, the renderer clamps there, and the row accepts it',()=>{
  expect(RIGHT_MARGIN_MAX_BARS).toBe(200);
  const next=writeRow(sources(),'canvas.paneRightMargin',{number:200});
  expect(next.document.canvas.rightMarginBars).toBe(200);
  const r=renderer();applyRightMargin(r,next.document.canvas.rightMarginBars);
  expect(r.scene.style.margins.right).toBe(rowNumber(next));
  applyRightMargin(r,1000);expect(r.scene.style.margins.right).toBe(200);
 });
 it('a margin above the cap is refused with the range in the message',()=>{
  for(const value of [201,500,1000])expect(()=>writeRow(sources(),'canvas.paneRightMargin',{number:value}),String(value)).toThrow('Enter a right margin from 0 to 200 bars.');
  expect(()=>writeRow(sources(),'canvas.paneRightMargin',{number:-1})).toThrow('from 0 to 200');
  expect(writeRow(sources(),'canvas.paneRightMargin',{number:0}).document.canvas.rightMarginBars).toBe(0);
 });
 it('an older saved value above the cap reads as the cap, which is what the chart draws',()=>{
  const document=defaultChartSettingsDocument();document.canvas.rightMarginBars=500;
  const s=sources({document});
  expect(rowNumber(s)).toBe(200);
  const r=renderer();applyRightMargin(r,document.canvas.rightMarginBars);
  expect(r.scene.style.margins.right).toBe(rowNumber(s));
  expect(rowNumber(sources())).toBe(10);
 });
});
