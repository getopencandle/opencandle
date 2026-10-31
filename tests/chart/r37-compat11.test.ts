import {afterEach,describe,expect,it} from 'vitest';
import {deserializeDrawing,rendererLayers,type SerializedDrawing} from '@luxalgo/vela';
import {registerPositionChartContext,chartPositionContext,rendererHoveredDrawingId} from '../../src/chart/lv-types/position-tool';
import {lvDrawingTypeStatus} from '../../src/chart/lv-drawing-types';
import {latestPricePresentation,realLastPrice,HA_REAL_LAST_PRICE_SETTING} from '../../src/chart/appearance-price';
import {APPEARANCE_LAYER,registerAppearanceExtensions,PREVIOUS_CLOSE_HA_STYLE} from '../../src/chart/appearance-layer';
import {normalizeAppearance,serializeAppearance,defaultTheme,themePresets} from '../../src/ui/themes';
import {factoryAppearance,factoryPriceScale,findRow,tabView,writeRow,LV_ROW_KEYS,type ChartSettingsSources} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {applyPreset,openSession} from '../../src/chart/chart-settings-session';
import {renderScriptObjects} from '../../src/chart/script-port';
import {registerTemporalChartTypes,layerBarColors} from '../../src/chart/chart-types';
import {indicatorDisplayHarness} from './indicator-display-harness';
import {commandCanvas,painterFixture,withHexColorProbe} from './chart-paint-harness';

// LV side of LV-VELA-RENDER-LEFTOVERS-1. SYNTHETIC bars, drawings and script outputs; recording canvases. No GUI claim.
let unregister:(()=>void)|null=null;
afterEach(()=>{unregister?.();unregister=null;});

describe('Heikin Ashi "Show real last price"',()=>{
 const view=[{time:1,open:10,high:12,low:9,close:11},{time:2,open:11,high:14,low:10,close:12.5}],raw=[{time:1,open:10,high:12,low:9,close:11},{time:2,open:15,high:16,low:11,close:12}];
 it('reads the raw last bar only on Heikin Ashi with the setting on and aligned raw bars',()=>{
  const on={[HA_REAL_LAST_PRICE_SETTING]:true};
  expect(realLastPrice('heikinashi',on,raw,view)).toEqual({bar:raw[1],previousClose:11});
  expect(realLastPrice(PREVIOUS_CLOSE_HA_STYLE,on,raw,view)?.bar).toBe(raw[1]);
  expect(realLastPrice('candles',on,raw,view)).toBeNull();
  expect(realLastPrice('heikinashi',{},raw,view)).toBeNull();
  expect(realLastPrice('heikinashi',{[HA_REAL_LAST_PRICE_SETTING]:false},raw,view)).toBeNull();
  expect(realLastPrice('heikinashi',on,null,view)).toBeNull();
  expect(realLastPrice('heikinashi',on,raw.slice(1),view)).toBeNull();
  expect(realLastPrice('heikinashi',on,[raw[0],{...raw[1],time:3}],view)).toBeNull();
  const scene={priceStyle:'heikinashi',bars:view,style:{chartTypes:{}},candleOverride:{upColor:'#00ff00',downColor:'#ff0000'}};
  expect(latestPricePresentation(scene,{},{upColor:'#0f0',downColor:'#f00'},{})).toEqual({value:12.5,color:'#00ff00'});
  expect(latestPricePresentation(scene,{},{upColor:'#0f0',downColor:'#f00'},{},realLastPrice('heikinashi',on,raw,view))).toEqual({value:12,color:'#ff0000'});
 });
 it('moves the actual chip and the automatic price line to the raw close; off, both stay on the Heikin Ashi close',async()=>{
  const f=await painterFixture();registerAppearanceExtensions();const layer=rendererLayers().find(row=>row.id===APPEARANCE_LAYER)!.create();layer.mount(f.recording.canvas);
  try{
   const bars=f.native.scene.bars,realBars=[{...bars[0],open:15,close:12}],settings={'mainSeriesProperties.showPriceLine':true,'mainSeriesProperties.priceLineColor':'','mainSeriesProperties.candleStyle.upColor':'#abcdef','mainSeriesProperties.candleStyle.downColor':'#fedcba',lvPriceSource:'close',lvTypeSettings:{}};
   f.native.scene.priceStyle='heikinashi';f.native.scene.candleOverride={upColor:'#abcdef',downColor:'#fedcba'};f.native.lvRealBars=realBars;
   const chip=()=>{f.recording.commands.length=0;withHexColorProbe(()=>f.native.chrome.drawPriceLineAndCountdown(f.recording.ctx,f.native.scene,f.coords,f.native.theme,300,f.pane));return{text:f.recording.commands.filter(row=>row.op==='fillText').map(row=>row.values[0]),fill:f.recording.commands.find(row=>row.op==='fillRect')?.color};};
   const line=(on:boolean)=>{f.recording.commands.length=0;layer.render(f.layerArgs('heikinashi',{...settings,...on?{[HA_REAL_LAST_PRICE_SETTING]:true}:{}},{lvRealBars:realBars} as never));return{y:f.recording.commands.find(row=>row.op==='moveTo')!.values[1],color:f.recording.commands.find(row=>row.op==='stroke')!.color};};
   f.native.scene.style.chartTypes[APPEARANCE_LAYER]={};
   expect(chip()).toEqual({text:['20.00'],fill:'#abcdef'});expect(line(false)).toEqual({y:80,color:'#abcdef'});
   f.native.scene.style.chartTypes[APPEARANCE_LAYER]={[HA_REAL_LAST_PRICE_SETTING]:true};
   expect(chip()).toEqual({text:['12.00'],fill:'#fedcba'});expect(line(true)).toEqual({y:88,color:'#fedcba'});
   // A renderer without COMPAT-11 raw bars keeps the drawn close.
   f.native.lvRealBars=undefined;expect(chip().text).toEqual(['20.00']);
  }finally{layer.destroy?.();f.dispose();}
 });
 it('is an optional appearance field: absent loads and saves unchanged, the Heikin Ashi group offers the row, presets keep it',()=>{
  const plain=serializeAppearance(defaultTheme.appearance);expect(Object.hasOwn(plain,HA_REAL_LAST_PRICE_SETTING)).toBe(false);
  expect(Object.hasOwn(normalizeAppearance(plain),'haShowRealLastPrice')).toBe(false);
  expect(normalizeAppearance({...plain,[HA_REAL_LAST_PRICE_SETTING]:true}).haShowRealLastPrice).toBe(true);
  expect(serializeAppearance({...defaultTheme.appearance,haShowRealLastPrice:false})[HA_REAL_LAST_PRICE_SETTING]).toBe(false);
  expect(()=>normalizeAppearance({...plain,[HA_REAL_LAST_PRICE_SETTING]:'yes'})).toThrow();
  const sources=(style:string):ChartSettingsSources=>({appearance:factoryAppearance(),document:defaultChartSettingsDocument(),documentConnected:true,priceScale:factoryPriceScale(),ratio:null,style,typeSettings:null,timezone:'UTC',exchangeTimezone:null});
  const ha=sources('heikinashi'),row=findRow('symbol',ha,LV_ROW_KEYS.haRealLastPrice)!;
  expect(row).toMatchObject({label:'Real prices on price scale',type:'checkbox',value:{checked:false},availability:{state:'live'}});/* reference wording, first HA row */
  expect(tabView('symbol',ha)[0].rows[0].key).toBe(LV_ROW_KEYS.haRealLastPrice);
  expect(findRow('symbol',sources('candles'),LV_ROW_KEYS.haRealLastPrice)).toBeNull();
  const next=writeRow(ha,LV_ROW_KEYS.haRealLastPrice,{checked:true});expect(next.appearance.haShowRealLastPrice).toBe(true);
  const session=openSession(next,{themeId:defaultTheme.id}),other=themePresets.find(preset=>preset.id!==defaultTheme.id)!;
  expect(applyPreset(session,other).current.appearance.haShowRealLastPrice).toBe(true);
 });
});

describe('position stats on hover',()=>{
 const T0=1_700_000_000_000,T1=T0+10*86_400_000;
 const saved={id:'r37-position',type:'position',paneId:'price',anchors:[{time:T0,price:100},{time:T1,price:90},{time:T1,price:120}],style:{lineColor:'#808080',lineWidth:1,lineStyle:'solid'},locked:false,visible:true,zIndex:0,createdAt:1,props:{accountBalance:1000,riskPercent:25}} as unknown as SerializedDrawing;
 const proj={xOf:(t:number)=>(t-T0)/86_400_000*20+10,yOf:(p:number)=>400-p*2,pxToPoint:()=>({time:T0,price:100}),paneIdAtY:()=>'price'} as never;
 const theme={fontFamily:'sans-serif',textColor:'#000',background:'#fff'};
 const paint=(model:any,canvas:object)=>{const texts:string[]=[];const ctx:any={canvas,globalAlpha:1,save(){},restore(){},beginPath(){},stroke(){},fill(){},rect(){},fillRect(){},moveTo(){},lineTo(){},setLineDash(){},measureText:(s:string)=>({width:s.length*7}),fillText:(s:string)=>{texts.push(s);}};model.lvPaint(ctx,proj,theme);return texts;};
 it('with Always show stats off, the plates show while the position is hovered or selected, through the COMPAT-11 hover reader',()=>{
  expect(lvDrawingTypeStatus().length).toBeGreaterThan(0);
  const canvas={},selected:string[]=[],renderer:{lvHoveredDrawingId?:()=>unknown}={},model=deserializeDrawing(saved)! as any;
  unregister=registerPositionChartContext(chartPositionContext({container:{contains:(node:unknown)=>node===canvas},tickSize:()=>0.05,selectedIds:()=>selected,hoveredId:()=>rendererHoveredDrawingId(renderer)}));
  expect(paint(model,canvas)).toEqual([]);
  // A renderer without the reader (no COMPAT-11) never reports a hover: selection only, as before.
  renderer.lvHoveredDrawingId=()=>model.id;expect(paint(model,canvas)[0]).toBe('Target: 20.00 (20.00%) 400, Amount: 500.00');
  renderer.lvHoveredDrawingId=()=>'another';expect(paint(model,canvas)).toEqual([]);
  renderer.lvHoveredDrawingId=()=>{throw Error('SYNTHETIC reader failure');};expect(paint(model,canvas)).toEqual([]);
  selected.push(model.id);expect(paint(model,canvas)).toHaveLength(4);
  expect(rendererHoveredDrawingId(null)).toBeNull();expect(rendererHoveredDrawingId({lvHoveredDrawingId:()=>3})).toBeNull();
 });
});

describe('left-placed indicator value labels',()=>{
 it('a left-pinned indicator labels its value on its left gutter column; the right columns and the diagnostics stay clean',async()=>{
  const t=await indicatorDisplayHarness();try{
   const id=t.port.add('sma',{length:1});t.port.setScale(id,'left');
   const rendererId=t.port.list().find((row:any)=>row.id===id)!.rendererId,model=t.native.scene.indicators.get(rendererId);
   expect(t.native.scene.lvLeftScaleIndicatorsForPane('price')).toEqual([model]);
   t.native.scene.indicatorScales.set(rendererId,{scale:{min:0,max:40},scaleTarget:{min:0,max:40},initialized:true,manualScale:null});
   const left=commandCanvas();t.native.chrome.lvLeftScale={canvas:left.canvas,width:64};
   const right=t.paintAll();expect(right).toEqual([]);
   const labels=left.commands.filter(row=>row.op==='fillText'&&row.values[3]===53);
   expect(labels.map(row=>row.values.slice(0,3))).toEqual([['20.00',30.5,88]]);
   expect(left.commands.find(row=>row.op==='strokeRect')!.values).toEqual([2.5,80.5,56,15]);
   expect(t.display.diagnostics()).toEqual([]);
   // Labels off: nothing on the gutter beyond the native ticks.
   t.display.setOptions({labelsVisible:false,valuesVisible:true});left.commands.length=0;t.paintAll();expect(left.commands.filter(row=>row.op==='fillText'&&row.values[3]===53)).toEqual([]);
  }finally{t.dispose();}
 });
});

describe('coloured hollow candles',()=>{
 const bars=[0,1,2].map(i=>({time:(1_700_000_000+i*60)*1000,open:10+i,high:13+i,low:9+i,close:12+i,volume:1}));
 const objects={base:null,lines:[],boxes:[],labels:[],tables:[],barcolors:[{time:1_700_000_060,color:'#ff00ff'}]} as never;
 it('Hollow candles use native bar colours; other styles keep the overlay series and state empty model colours',()=>{
  const hollow=renderScriptObjects('s',objects,bars,'hollow',true);expect(hollow.barSeries).toBeNull();expect(hollow.barColors).toEqual([{time:bars[1].time,color:'#ff00ff'}]);
  const candles=renderScriptObjects('s',objects,bars,'candles',true);expect(candles.barSeries).not.toBeNull();expect(candles.barColors).toEqual([]);
  const old=renderScriptObjects('s',objects,bars,'hollow',false);expect(old.barSeries).not.toBeNull();expect(old.barColors).toBeNull();
  expect(renderScriptObjects('s',{...(objects as object),barcolors:[]} as never,bars,'hollow',true).barColors).toBeNull();
 });
 it('a coloured up bar stays hollow: outline and wick in the script colour, no body fill; uncoloured bars are unchanged',async()=>{
  const f=await painterFixture(false);registerTemporalChartTypes();const layer=rendererLayers().find(row=>row.id==='hollow')!.create();layer.mount(f.recording.canvas);
  try{
   const args=(colours:Map<number,string>|undefined)=>f.layerArgs('hollow',{},{bars,coords:{...f.coords,visibleLogicalRange:()=>({from:0,to:2})},...colours?{lvBarColors:colours}:{}} as never);
   const draw=(colours?:Map<number,string>)=>{f.recording.commands.length=0;layer.render(args(colours));return f.recording.commands.filter(row=>['fillRect','strokeRect','stroke'].includes(row.op)).map(row=>row.op+':'+row.color);};
   const plain=draw(),coloured=draw(new Map([[bars[1].time,'#ff00ff']]));
   expect(layerBarColors(args(new Map()))).toBeNull();expect(draw(new Map())).toEqual(plain);
   expect(plain.filter(row=>row.startsWith('fillRect'))).toEqual([]);// up bars of a rising series are hollow
   expect(coloured.filter(row=>row.includes('#ff00ff'))).toEqual(['stroke:#ff00ff','strokeRect:#ff00ff']);
   expect(coloured.filter(row=>row.startsWith('fillRect'))).toEqual([]);
   expect([coloured[0],coloured[1],coloured[4],coloured[5]]).toEqual([plain[0],plain[1],plain[4],plain[5]]);
  }finally{layer.destroy?.();f.dispose();}
 });
});
