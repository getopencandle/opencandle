// SYNTHETIC fixtures only: hand-computed prices
// the pinned renderer's real NativeRenderer and painter bodies, small event-target stand-ins for the chart host.
import {describe,expect,it,vi} from 'vitest';
import {NativeRenderer,getDrawingType} from '@luxalgo/vela';
import {axisMintick,axisPriceText,clampChipCenter,countdownSessionFor,countdownTarget,drawingAxisLabels,labelTextColor,layoutAxisLabels,newYorkTime,previousDayClose,publishReservedAxisRanges,reservedAxisRanges,roundToTick,tickDecimals,visibleHighLow} from '../../src/chart/axis-labels';
import {installAppearancePainters,PREV_CLOSE_COLOR,type AxisLabelContext} from '../../src/chart/appearance-painters';
import {installPriceScalePort,priceScaleFacade} from '../../src/chart/price-scale-port';
import {seriesOnlyWindow,bandScale,defaultPriceScaleSettings} from '../../src/chart/price-scale-state';
import {readFileSync} from 'node:fs';
import {priceScaleMenuEntries,priceScaleLabelItems,priceScaleLineItems} from '../../src/chart/price-scale-menu';
import {pricePlusMenu,pricePlusRequest,PLUS_UNBOUND,type PricePlusViewProps} from '../../src/chart/price-scale-plus';
import {contextTargetPrice} from '../../src/chart/context-price-target';
import {parityDefaultDefinitions,parityDefaultsStatus} from '../../src/chart/drawing-factory-defaults';
import {sourceAxisBasis} from '../../src/chart/adapter';
import {factoryAppearance,factoryPriceScale,findRow,type ChartSettingsSources} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
const settingsSources=():ChartSettingsSources=>({appearance:factoryAppearance(),document:defaultChartSettingsDocument(),documentConnected:true,priceScale:factoryPriceScale(),ratio:0.5,style:'candles',typeSettings:null,timezone:'UTC',exchangeTimezone:'America/New_York'});
import {painterFixture,withHexColorProbe} from './chart-paint-harness';
import {priceScaleHarness,event} from './price-scale-harness';

const NY=(y:number,m:number,d:number,h:number,min:number,s=0)=>newYorkTime(y,m,d,h*60+min)+s*1000;

describe('gap 1: price labels follow the symbol tick',()=>{
 it('tick decimals and axis text use the tick, not the zoom (a $20 stock reads 2 decimals)',()=>{
  expect([tickDecimals(0.01),tickDecimals(0.25),tickDecimals(1),tickDecimals(0.0001)]).toEqual([2,2,0,4]);
  const zoomed={scale:{min:23.30,max:23.45},height:400};
  expect(axisPriceText(23.37,zoomed)).toBe('23.370');
  expect(axisPriceText(23.37,{...zoomed,mintick:0.01})).toBe('23.37');
  expect(axisPriceText(23.37,{...zoomed,mintick:1})).toBe('23.37'); // a tick of 1 still prints 2 decimals on the axis
  expect(axisPriceText(110,{scale:{min:1,max:2},height:100,percent:{baseline:100,indexed:false}})).toBe('+10.00%');
  expect(axisPriceText(110,{scale:{min:1,max:2},height:100,percent:{baseline:100,indexed:true}})).toBe('110.00');
 });
 it('a stored 1 to 8 decimal precision overrides the tick; otherwise the instrument tick is used',()=>{
  expect(axisMintick(undefined,0.01)).toBe(0.01);expect(axisMintick(0.001,0.01)).toBe(0.001);expect(axisMintick(undefined,undefined)).toBeUndefined();expect(axisMintick(undefined,0)).toBeUndefined();
 });
 it('rounds to the tick half away from zero',()=>{
  expect([roundToTick(23.374,0.01),roundToTick(23.375,0.01),roundToTick(-1.125,0.25),roundToTick(10.12,undefined)]).toEqual([23.37,23.38,-1.25,10.12]);
  expect(roundToTick(139.9,0.25)).toBe(140);
 });
 it('the port pushes the instrument tick, a Precision override and the default back to the renderer',()=>{
  const h=priceScaleHarness();h.port.dispose();let tick:number|undefined=0.01;
  const port=installPriceScalePort({renderer:h.renderer,features:h.features as any,onViewportChanged:()=>()=>{},container:h.container,tickSize:()=>tick});
  expect(h.renderer.scene.priceMintick).toBe(0.01);expect(port.priceTick()).toBe(0.01);
  port.setPrecision('4');expect(h.renderer.scene.priceMintick).toBe(0.0001);
  port.setPrecision('default');expect(h.renderer.scene.priceMintick).toBe(0.01);
  port.setPrecision('integer');expect(h.renderer.scene.priceMintick).toBe(0.01); // not representable on the axis: the tick stays
  expect(()=>port.setPrecision('7.5')).toThrow(/Unknown precision/);
  tick=0.5;port.refreshPrecision();expect(h.renderer.scene.priceMintick).toBe(0.5);
  const facade=priceScaleFacade(()=>port);expect(facade.priceTick()).toBe(0.5);port.dispose();
 });
 it('a clicked-price alert or order is prefilled at the tick',()=>{
  expect(contextTargetPrice({point:{price:23.3749},instrument:{tickSize:0.01}} as any)).toBe(23.37);
  expect(contextTargetPrice({point:{price:23.3749},instrument:{}} as any)).toBe(23.3749);
 });
 it('Chart settings Precision is live',()=>{
  expect(findRow('symbol',settingsSources(),'symbol.candleSymbolMinTick')!.availability).toEqual({state:'live'});
 });
});

describe('gap 7: last price chip and countdown',()=>{
 it('clamps the chip inside the pane only when the price is outside',()=>{
  expect(clampChipCenter(-30,0,100)).toEqual({y:8,clamped:true});expect(clampChipCenter(130,0,100,24)).toEqual({y:76,clamped:true});expect(clampChipCenter(50,0,100)).toEqual({y:50,clamped:false});
 });
 it('continuous instruments count to the bar end',()=>{
  const session=countdownSessionFor('crypto','UTC','all');expect(session.kind).toBe('continuous');
  expect(countdownTarget(1000,60_000,30_000,session)).toBe(61_000);expect(countdownTarget(1000,60_000,62_000,session)).toBeNull();
 });
 it('US equities: intraday stops at the 16:00 close and hides while the market is closed',()=>{
  const session=countdownSessionFor('stock','America/New_York','regular');expect(session).toEqual({kind:'us-equity',extended:false});
  const bar=NY(2026,10,20,15,57); // Tuesday
  expect(countdownTarget(bar,300_000,NY(2026,10,20,15,59,30),session)).toBe(NY(2026,10,20,16,0));
  expect(countdownTarget(NY(2026,10,20,10,0),60_000,NY(2026,10,20,10,0,20),session)).toBe(NY(2026,10,20,10,1));
  expect(countdownTarget(NY(2026,10,20,17,0),60_000,NY(2026,10,20,17,0,20),session)).toBeNull(); // after hours, regular data
  expect(countdownTarget(NY(2026,10,20,17,0),60_000,NY(2026,10,20,17,0,20),{kind:'us-equity',extended:true})).toBe(NY(2026,10,20,17,1));
  expect(countdownTarget(NY(2026,10,24,11,0),60_000,NY(2026,10,24,11,0,20),session)).toBeNull(); // Saturday
 });
 it('US equities: daily, weekly and monthly bars count to the session close of their last trading day',()=>{
  const session=countdownSessionFor('etf','America/New_York','regular'),now=NY(2026,10,20,11,0);
  expect(countdownTarget(Date.UTC(2026,9,20),86_400_000,now,session)).toBe(NY(2026,10,20,16,0));
  expect(countdownTarget(Date.UTC(2026,9,19),7*86_400_000,now,session)).toBe(NY(2026,10,23,16,0));
  expect(countdownTarget(Date.UTC(2026,9,1),30*86_400_000,now,session)).toBe(NY(2026,10,30,16,0));
  expect(countdownTarget(Date.UTC(2026,2,30),7*86_400_000,NY(2026,4,1,11,0),session)).toBe(NY(2026,4,2,16,0)); // Good Friday week ends Thursday
  expect(countdownTarget(Date.UTC(2026,9,20),86_400_000,NY(2026,10,20,8,0),session)).toBeNull(); // before the open
  expect(countdownTarget(Date.UTC(2026,8,1),86_400_000,now,session)).toBeNull(); // stale daily bar
 });
});

describe('gaps 4 and 15: label layout, previous close and high/low',()=>{
 it('no overlapping labels moves movable labels to the nearest free slot; fixed ranges never move',()=>{
  const placed=layoutAxisLabels([[72,88]],[{id:'a',y:85},{id:'b',y:40},{id:'c',y:44},{id:'d',y:70}],{top:0,bottom:100},true);
  // d moves up off the fixed chip and pushes c and b up in order (a stack of 16 px rows); a is boxed in between the chip and the pane bottom.
  expect(placed.map(row=>[row.id,Math.round(row.center*100)/100,row.hidden])).toEqual([['a',85,true],['b',32,false],['c',48,false],['d',64,false]]);
  expect(layoutAxisLabels([[72,88]],[{id:'a',y:85}],{top:0,bottom:100},false)[0].center).toBe(85);
  expect(layoutAxisLabels([],[{id:'off',y:-4}],{top:0,bottom:100},true)[0].hidden).toBe(true);
  expect(layoutAxisLabels([[0,100]],[{id:'full',y:50}],{top:0,bottom:100},true)[0].hidden).toBe(true);
 });
 it('previous day close: intraday uses the last bar of the prior exchange date; daily the prior bar; weekly none',()=>{
  const bars=[{time:NY(2026,10,19,15,59),close:10},{time:NY(2026,10,19,16,0),close:11},{time:NY(2026,10,20,9,30),close:12},{time:NY(2026,10,20,9,31),close:13}];
  expect(previousDayClose(bars,60_000,'America/New_York')).toBe(11);
  expect(previousDayClose(bars.slice(2),60_000,'America/New_York')).toBeNull();
  expect(previousDayClose([{time:0,close:5},{time:86_400_000,close:6}],86_400_000,'UTC')).toBe(5);
  expect(previousDayClose([{time:0,close:5},{time:604_800_000,close:6}],604_800_000,'UTC')).toBeNull();
  expect(visibleHighLow([{high:5,low:1},{high:9,low:3},{high:7,low:2}],0.4,1.6)).toEqual({high:9,low:3});
 });
 it('reserved ranges from other painters are read back per scene and owner',()=>{
  const scene={};publishReservedAxisRanges(scene,'indicators',[[10,26],[Number.NaN,3] as any]);expect(reservedAxisRanges(scene)).toEqual([[10,26]]);
  publishReservedAxisRanges(scene,'indicators',[]);expect(reservedAxisRanges(scene)).toEqual([]);
 });
 it('label text is black on light and white on dark backgrounds',()=>{expect([labelTextColor('#ffffff'),labelTextColor('#131722'),labelTextColor('rgba(255, 235, 59, 1)'),labelTextColor('#555555')]).toEqual(['#000000','#ffffff','#000000','#ffffff']);});
});

describe('gap 3: drawing axis labels',()=>{
 const drawings=[
  {id:'h',type:'hline',paneId:'price',anchors:[{price:12}],style:{lineColor:'#ff9800'}},
  {id:'r',type:'hray',paneId:'price',anchors:[{price:14}],style:{lineColor:'#00bcd4'}},
  {id:'hidden',type:'hline',paneId:'price',anchors:[{price:15}],style:{lineColor:'#ffffff'},visible:false},
  {id:'study',type:'hline',paneId:'rsi',anchors:[{price:70}],style:{lineColor:'#ffffff'}},
  {id:'t',type:'trendline',paneId:'price',anchors:[{price:5},{price:9}],style:{lineColor:'#2962ff'}},
  {id:'p',type:'position',paneId:'price',anchors:[{price:20},{price:18},{price:25}],style:{lineColor:'#787b86'},props:{profitColor:'#089981',lossColor:'#f23645'}},
 ];
 it('horizontal line and ray always label their price in the line color; hidden and other panes do not',()=>{
  const out=drawingAxisLabels(drawings,[]);expect(out.labels).toEqual([{id:'h:price',price:12,color:'#ff9800'},{id:'r:price',price:14,color:'#00bcd4'}]);expect(out.bands).toEqual([]);
 });
 it('a selected drawing highlights its price range; a selected position labels entry, target and stop',()=>{
  const out=drawingAxisLabels(drawings,['t','p']);
  expect(out.bands).toEqual([{id:'t',min:5,max:9,color:'#2962ff'},{id:'p',min:18,max:25,color:'#787b86'}]);
  expect(out.labels.slice(2)).toEqual([{id:'t:max',price:9,color:'#2962ff'},{id:'t:min',price:5,color:'#2962ff'},{id:'p:entry',price:20,color:'#787b86'},{id:'p:target',price:25,color:'#089981'},{id:'p:stop',price:18,color:'#f23645'}]);
 });
 it('new horizontal lines and rays are solid and thin (parity defaults, kept apart from reference facts)',()=>{
  // hline and crossline use the observed 2 px solid default; hray keeps its parity row.
  expect(parityDefaultsStatus().map(row=>[row.type,row.state])).toEqual([['hline','applied'],['hray','applied'],['crossline','applied']]);
  const expected:Record<string,[string,number]>={hline:['parity:observed-2px-solid',2],hray:['parity:observed-1px-solid',1],crossline:['parity:observed-2px-solid',2]};
  for(const row of parityDefaultDefinitions()){expect(row.source).toBe(expected[row.type][0]);const meta=getDrawingType(row.type as any)!;expect(meta.defaultStyle).toMatchObject({lineStyle:'solid',lineWidth:expected[row.type][1]});}
 });
});

function context(over:Partial<AxisLabelContext>={}):AxisLabelContext{
 return{labels:{symbolName:false,prevClose:false,highLow:false,noOverlap:true},lines:{prevCloseLine:false},symbol:'SYNTH',timezone:'America/New_York',session:{kind:'continuous',extended:true},drawings:()=>[],selected:()=>[],...over};
}
async function labelled(ctx:()=>AxisLabelContext){const f=await painterFixture(false);const dispose=installAppearancePainters(f.renderer,ctx);
 f.native.scene.priceStyle='line';f.native.scene.style.line.color='#22ab94';f.native.scene.showCountdown=false;f.native.scene.showPriceLabel=true;f.native.theme={...f.native.theme,background:'#131722',textColor:'#d1d4dc'};
 const paint=()=>{f.recording.commands.length=0;withHexColorProbe(()=>f.native.chrome.drawPriceLineAndCountdown(f.recording.ctx,f.native.scene,f.coords,f.native.theme,300,f.pane));return f.recording.commands.filter(row=>row.op==='fillText').map(row=>[row.values[0],row.values[2]]);};
 return{f,paint,dispose:()=>{dispose();f.dispose();}};}

describe('painter: labels on the price scale',()=>{
 it('previous day close label and line, moved off the last price chip under No overlapping labels',async()=>{
  let ctx=context({labels:{symbolName:false,prevClose:true,highLow:false,noOverlap:true},lines:{prevCloseLine:true}});const t=await labelled(()=>ctx);
  try{t.f.native.scene.bars=[{time:NY(2026,10,19,15,59),open:24,high:26,low:24,close:25,volume:1},{time:NY(2026,10,20,9,30),open:19,high:22,low:18,close:20,volume:1}];t.f.coords.barInterval=60_000;
   expect(t.paint()).toEqual([['20.00',80],['25.00',64]]);
   const line=t.f.recording.commands.filter(row=>row.op==='stroke'&&row.color===PREV_CLOSE_COLOR);expect(line).toHaveLength(2); // the dotted line and the label's leader
   expect(t.f.recording.commands.some(row=>row.op==='setLineDash'&&JSON.stringify(row.values)==='[[1,2]]')).toBe(true);
   ctx={...ctx,labels:{...ctx.labels,noOverlap:false}};expect(t.paint()).toEqual([['20.00',80],['25.00',75]]);
  }finally{t.dispose();}
 });
 it('high and low labels of the visible bars, horizontal line labels in their color, and the symbol name tag',async()=>{
  const ctx=context({labels:{symbolName:true,prevClose:false,highLow:true,noOverlap:true},highLowColor:'#ffeb3b',drawings:()=>[{id:'h',type:'hline',paneId:'price',anchors:[{price:40}],style:{lineColor:'#ff9800'}},{id:'h2',type:'hline',paneId:'price',anchors:[{price:150}],style:{lineColor:'#ff9800'}}] as any});
  const t=await labelled(()=>ctx);
  try{t.f.native.scene.bars=[{time:1700000000000,open:10,high:60,low:5,close:45,volume:1}];
   // Chip at 55 (fixed 47..63). The line at 40 (y 60) moves down off it, the high (y 40) moves up 1 px, the low (y 95) holds at the pane bottom; 150 is off the pane.
   expect(t.paint()).toEqual([['45.00',55],['40.00',71],['60.00',39],['5.00',92],['SYNTH',55]]);
   const fills=t.f.recording.commands.filter(row=>row.op==='fillRect').map(row=>row.color);expect(fills).toEqual(['#2962FF','#ff9800','#ffeb3b','#ffeb3b','#2962FF']); // chip and name tag in the line type's default color
  }finally{t.dispose();}
 });
 it('an off-screen close keeps the chip at the edge; a closed US equity session hides the countdown',async()=>{
  const ctx=context({session:{kind:'us-equity',extended:false}});const t=await labelled(()=>ctx);const clock=vi.spyOn(Date,'now');
  try{t.f.native.scene.showCountdown=true;t.f.coords.barInterval=60_000;
   t.f.native.scene.bars=[{time:NY(2026,10,20,10,0),open:10,high:12,low:9,close:11,volume:1}];clock.mockReturnValue(NY(2026,10,20,10,0,30));
   expect(t.paint()).toEqual([['11.00',89],['00:30',105]]); // on screen: the native chip position
   t.f.coords.priceToY=()=>-50;expect(t.paint()).toEqual([['11.00',8],['00:30',24]]);
   clock.mockReturnValue(NY(2026,10,24,10,0,30));t.f.native.scene.bars=[{time:NY(2026,10,24,10,0),open:10,high:12,low:9,close:11,volume:1}];expect(t.paint()).toEqual([['11.00',8]]);
  }finally{clock.mockRestore();t.dispose();}
 });
 it('a throwing context leaves the native chip only',async()=>{const t=await labelled(()=>{throw Error('SYNTHETIC');});try{expect(t.paint()).toEqual([['20.00',80]]);}finally{t.dispose();}});
});

describe('gap 24: scale price chart only',()=>{
 it('fits the main series alone with the renderer margins and log space',()=>{
  const bars=[{high:12,low:8},{high:14,low:10},{high:100,low:1}];
  expect(seriesOnlyWindow(bars,0,1,{top:10,bottom:10},false)).toEqual({min:8-6*0.125,max:14+6*0.125});
  expect(seriesOnlyWindow([{high:10,low:10}],0,0,{top:10,bottom:10},false)).toEqual({min:9,max:11,log:false});
  const log=seriesOnlyWindow(bars,0,1,{top:0,bottom:0},true)!;expect(log.log).toBe(true);expect(log.min).toBeCloseTo(8);expect(log.max).toBeCloseTo(14);
  expect(seriesOnlyWindow([],0,0,{top:10,bottom:10},false)).toBeNull();
 });
 it('the port refits the main pane after the renderer fit only while the setting is on, and restores computeScales on dispose',()=>{
  const h=priceScaleHarness();h.port.dispose();const renderer=h.renderer;
  renderer.bars=[{time:0,open:10,high:12,low:8,close:11},{time:60000,open:11,high:14,low:10,close:13}];renderer.coords.setBars([0,60000]);
  const pane=h.pane();const calls:number[]=[];const fit=function(){calls.push(1);pane.scaleTarget={min:0,max:200};pane.scale={min:0,max:200};};
  Object.defineProperty(Object.getPrototypeOf(renderer),'computeScales',{configurable:true,writable:true,value:fit});
  try{
   const port=installPriceScalePort({renderer,features:h.features as any,onViewportChanged:()=>()=>{},container:h.container});
   expect(Object.hasOwn(renderer,'computeScales')).toBe(true);
   renderer.computeScales();expect(pane.scale).toEqual({min:0,max:200});
   port.applySettings({...defaultPriceScaleSettings(),scaleSeriesOnly:true});renderer.computeScales();
   expect(pane.scale.min).toBeCloseTo(8-6*0.125);expect(pane.scale.max).toBeCloseTo(14+6*0.125);expect(calls).toHaveLength(2);
   pane.manualScale={min:1,max:2};renderer.computeScales();expect(pane.scale).toEqual({min:0,max:200}); // the stub ignores manual; the port never touches it
   port.dispose();expect(Object.hasOwn(renderer,'computeScales')).toBe(false);
  }finally{delete (Object.getPrototypeOf(renderer) as any).computeScales;}
 });
 it('the menu entry is enabled and the other new label and line entries are enabled too',()=>{
  const ctx={pane:{paneId:'price',kind:'price' as const,mode:'regular' as const,auto:true,invert:false},settings:defaultPriceScaleSettings(),ratio:null,scaleCount:1,host:{appearance:true,openSettings:true}};
  const root=priceScaleMenuEntries(ctx).filter(row=>row.kind==='item') as any[];expect(root.find(row=>row.id==='scaleSeriesOnly').disabled).toBeUndefined();expect(root.find(row=>row.id==='plusButton').disabled).toBeUndefined();
  const labels=priceScaleLabelItems(ctx).filter(row=>row.kind==='item') as any[];for(const id of ['labels.symbolName','labels.prevClose','labels.highLow','labels.indName','labels.indValue','labels.noOverlap'])expect(labels.find(row=>row.id===id).disabled,id).toBeUndefined();
  expect((priceScaleLineItems(ctx).find((row:any)=>row.id==='lines.prevCloseLine') as any).disabled).toBeUndefined();
 });
});

describe('gap 10: the plus button',()=>{
 it('menu rows follow the reference side rule and the OpenCandle wording',()=>{
  const above=pricePlusMenu({price:105,text:'105.00',last:100,symbol:'SYN',host:true,line:true});
  expect(above.map(row=>[row.id,row.label])).toEqual([['alert','Add alert SYN at 105.00'],['sell-limit','Paper sell limit SYN at 105.00'],['buy-stop','Paper buy stop SYN at 105.00'],['hline','Draw horizontal line at 105.00']]);
  expect(pricePlusMenu({price:95,text:'95.00',last:100,symbol:null,host:false,line:false}).map(row=>[row.id,row.disabled??''])).toEqual([['alert',PLUS_UNBOUND],['buy-limit',PLUS_UNBOUND],['sell-stop',PLUS_UNBOUND],['hline','This chart cannot draw a horizontal line here.']]);
  expect(pricePlusRequest('buy-stop',105,{x:1,y:2},'price')).toEqual({action:'order',side:'buy',orderType:'stop',price:105,client:{x:1,y:2},paneId:'price'});
  expect(pricePlusRequest('hline',105,{x:1,y:2},'price')).toBeNull();
 });
 function plusPort(){
  const h=priceScaleHarness();h.port.dispose();const renders:Array<PricePlusViewProps|null>=[],lines:number[]=[];
  const port=installPriceScalePort({renderer:h.renderer,features:h.features as any,onViewportChanged:()=>()=>{},container:h.container,tickSize:()=>0.25,instrument:()=>({symbol:'SYN',last:120}),drawHorizontalLine:price=>{lines.push(price);return{ok:true};},plusMount:()=>({render:props=>{renders.push(props);},contains:target=>(target as unknown)==='inside-plus',dispose(){}})});
  return{h,port,renders,lines};
 }
 it('hovering the main scale shows + at the pointer price rounded to the tick; leaving hides it',()=>{
  const {h,port,renders}=plusPort();
  h.container.dispatch('pointermove',event({clientX:840,clientY:121}));expect(port.plus()).toEqual({paneId:'price',price:140,text:'140.00',top:101,menuOpen:false});
  expect(renders.at(-1)).toMatchObject({left:800-14,top:101,text:'140.00',items:null}); // Inside the plot, flush against the scale edge
  h.container.dispatch('pointermove',event({clientX:803,clientY:123}));expect(port.plus()?.top).toBe(101); // on the + itself: it stays put to be clicked
  h.container.dispatch('pointermove',event({clientX:809,clientY:121,target:'inside-plus'}));expect(port.plus()?.top).toBe(101);
  h.container.dispatch('pointermove',event({clientX:400,clientY:121}));expect(port.plus()).toBeNull();expect(renders.at(-1)).toBeNull();
  h.container.dispatch('pointermove',event({clientX:840,clientY:121}));h.container.dispatch('pointerleave',event());expect(port.plus()).toBeNull();
  port.execute('plusButton');h.container.dispatch('pointermove',event({clientX:840,clientY:121}));expect(port.plus()).toBeNull(); // Plus button off
  port.dispose();
 });
 it('the menu draws a horizontal line through the chart and routes alerts and paper orders to the host',()=>{
  const {h,port,renders,lines}=plusPort(),requests:unknown[]=[];
  h.container.dispatch('pointermove',event({clientX:840,clientY:121}));renders.at(-1)!.onOpen();
  expect(port.plus()?.menuOpen).toBe(true);expect(renders.at(-1)!.items!.map(row=>[row.id,row.disabled??''])).toEqual([['alert',PLUS_UNBOUND],['sell-limit',PLUS_UNBOUND],['buy-stop',PLUS_UNBOUND],['hline','']]);
  h.container.dispatch('pointermove',event({clientX:840,clientY:300}));expect(port.plus()?.price).toBe(140); // an open menu keeps its price
  expect(port.plusActivate('alert')).toEqual({ok:false,message:PLUS_UNBOUND});
  renders.at(-1)!.onActivate('hline');expect(lines).toEqual([140]);expect(port.plus()).toBeNull();
  port.bindHost({plusAction:request=>{requests.push(request);return true;}});
  h.container.dispatch('pointermove',event({clientX:840,clientY:121}));port.plusOpen({x:840,y:121});expect(port.plusActivate('buy-stop')).toEqual({ok:true});
  expect(requests).toEqual([{action:'order',side:'buy',orderType:'stop',price:140,client:{x:840,y:121},paneId:'price'}]);
  h.container.dispatch('pointermove',event({clientX:840,clientY:121}));port.plusOpen({x:840,y:121});h.doc.dispatch('pointerdown',{target:'elsewhere'});expect(port.plus()).toBeNull();
  port.dispose();
 });
 it('the chart panel binds its own plus handler (it owns the context capture), apart from the grid host',()=>{
  const {h,port,renders}=plusPort(),requests:unknown[]=[];
  const release=port.bindPlus(request=>{requests.push(request);return{ok:true};});
  expect(()=>port.bindPlus(()=>true)).toThrow(/already bound/);
  h.container.dispatch('pointermove',event({clientX:840,clientY:121}));renders.at(-1)!.onOpen();
  expect(renders.at(-1)!.items!.find(row=>row.id==='alert')!.disabled).toBeUndefined();
  expect(port.plusActivate('alert')).toEqual({ok:true});expect(requests).toEqual([{action:'alert',price:140,client:{x:840,y:121},paneId:'price'}]);
  release();h.container.dispatch('pointermove',event({clientX:840,clientY:121}));renders.at(-1)!.onOpen();expect(port.plusActivate('alert')).toEqual({ok:false,message:PLUS_UNBOUND});
  expect(typeof priceScaleFacade(()=>port).bindPlus).toBe('function');
  port.dispose();
 });
});

describe('adapter helpers',()=>{
 it('the source basis names the symbol, asset class, timezone and session for the labels',()=>{
  const tuple=[1,'id','SYN','Synthetic','LV','USD','stock','America/New_York','p','d','1D','raw','regular','America/New_York','full',0.01,1,true];
  expect(sourceAxisBasis({basisIdentity:JSON.stringify(tuple)})).toEqual({symbol:'SYN',assetClass:'stock',timezone:'America/New_York',session:'regular'});
  expect(sourceAxisBasis({})).toBeNull();expect(sourceAxisBasis({basisIdentity:'not json'})).toBeNull();
 });
 it('Chart settings rows for overlap, plus, name and high/low labels are live',()=>{
  const s=settingsSources();for(const id of ['scales.noOverlappingLabels','scales.addPlusButton'])expect(findRow('scales',s,id)!.availability,id).toEqual({state:'live'});
  expect(findRow('scales',s,'scales.symbolLabelsLines')!.itemAvailability!.name).toEqual({state:'live'});expect(findRow('scales',s,'scales.highLowLabelsLines')!.itemAvailability!.value).toEqual({state:'live'});
 });
});
describe('lane B handoff: indicator scale margins and the renderer legend',()=>{
 it('a band squeezes a scale into the pane fraction between the margins',()=>{
  // Volume 0..100 with top 0.8 and bottom 0: the data fills the bottom fifth, so the scale spans 0..500.
  const volume=bandScale({min:0,max:100},{top:0.8,bottom:0});expect(volume.min).toBe(0);expect(volume.max).toBeCloseTo(500,9);
  const mid=bandScale({min:10,max:20},{top:0.25,bottom:0.25});expect(mid.min).toBeCloseTo(5,9);expect(mid.max).toBeCloseTo(25,9);
  expect(bandScale({min:10,max:20,log:true},{top:0,bottom:0})).toEqual({min:10,max:20,log:true});
 });
 it('the port installs lvSetIndicatorScaleMargins and remaps that private scale after the renderer fit',()=>{
  const h=priceScaleHarness();h.port.dispose();const renderer=h.renderer as any;
  const scales=new Map<string,any>();const scene=renderer.scene??(renderer.scene={});const priorScales=scene.indicatorScales;scene.indicatorScales=scales;
  const fit=function(){scales.set('vol',{scaleTarget:{min:0,max:100},scale:{min:0,max:100},initialized:true,manualScale:null});scales.set('rsi',{scaleTarget:{min:0,max:100},scale:{min:0,max:100},initialized:true,manualScale:null});};
  Object.defineProperty(Object.getPrototypeOf(renderer),'computeScales',{configurable:true,writable:true,value:fit});
  try{
   const port=installPriceScalePort({renderer,features:h.features as any,onViewportChanged:()=>()=>{},container:h.container});
   expect(typeof renderer.lvSetIndicatorScaleMargins).toBe('function');
   renderer.lvSetIndicatorScaleMargins('vol',{top:0.8,bottom:0});renderer.computeScales();
   expect(scales.get('vol').scaleTarget.max).toBeCloseTo(500,9);expect(scales.get('vol').scale).toEqual(scales.get('vol').scaleTarget);expect(scales.get('rsi').scale).toEqual({min:0,max:100});
   expect(()=>renderer.lvSetIndicatorScaleMargins('vol',{top:0.9,bottom:0.2})).toThrow(/fractions/);
   port.dispose();expect(Object.hasOwn(renderer,'lvSetIndicatorScaleMargins')).toBe(false);
  }finally{delete (Object.getPrototypeOf(renderer) as any).computeScales;scene.indicatorScales=priorScales;}
 });
 it('the adapter turns the renderer legend (indicator titles) off because OpenCandle draws its own pane legend',()=>{
  const source=readFileSync('src/chart/adapter.ts','utf8');
  expect(source).toMatch(/renderer\.set\('indicatorTitles',false\)/);
 });
});
void NativeRenderer;
