import {expect,it} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {formatIndicatorNumber} from '../../src/chart/indicator-number-format';
import {defaultIndicatorPresentation,validateIndicatorPresentation,validateIndicatorSnapshots,type IndicatorSnapshot} from '../../src/chart/indicator-settings';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {indicatorDisplayHarness} from './indicator-display-harness';
import {DataWindow} from '../../src/ui/DataWindow';
import {factoryIndicatorDefault,createIndicatorLibrary,saveIndicatorDefault,restoreIndicatorLibrary,instanceDefaults} from '../../src/ui/indicator-library';
import {createIndicatorTemplates,saveIndicatorTemplate,restoreIndicatorTemplates,instantiateIndicatorTemplate} from '../../src/ui/indicator-templates';
import {createFrameFingerprintCalculator} from '../../src/ui/frame-fingerprints';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {VWAP_BAND_DEFAULTS,type IndicatorId} from '../../src/domain/indicators';

it('formats independent fixed-number literals without modifying the binary64 value',()=>{
 const cases:Array<[number,number,string]>=[[12.375,2,'12.38'],[-12.375,2,'-12.38'],[2.675,2,'2.67'],[-.0001,2,'0.00'],[1234.5,2,'1,234.50'],[1e21,2,'1.00e+21'],[Number.MIN_VALUE,16,'0.0000000000000000'],[Number.MAX_VALUE,16,'1.7976931348623157e+308'],[-0,0,'0'],[12.375,0,'12']];
 for(const [value,precision,expected]of cases){expect(formatIndicatorNumber(value,precision)).toBe(expected);expect(formatIndicatorNumber(value,precision).length).toBeLessThanOrEqual(80);}
 for(const value of [NaN,Infinity,-Infinity])expect(()=>formatIndicatorNumber(value,2)).toThrow();for(const value of [-1,17,1.5,NaN,'2',null,undefined])expect(()=>formatIndicatorNumber(1,value as number)).toThrow();
});

it('validates numeric presentation strictly and preserves defaults, templates and legacy omission',()=>{
 const factory=factoryIndicatorDefault('sma');for(const precision of ['auto',0,2,8,16] as const)expect(()=>validateIndicatorPresentation('sma',{...factory.presentation,precision})).not.toThrow();
 for(const precision of [-1,17,1.5,'2',null,undefined])expect(()=>validateIndicatorPresentation('sma',{...factory.presentation,precision})).toThrow();
 let reads=0;expect(()=>validateIndicatorPresentation('sma',{...factory.presentation,get precision(){reads++;return 2;}})).toThrow();expect(reads).toBe(0);
 factory.presentation!.precision=16;const library=restoreIndicatorLibrary(JSON.parse(JSON.stringify(saveIndicatorDefault(createIndicatorLibrary(),'sma',factory))));expect(instanceDefaults(library,'sma').presentation?.precision).toBe(16);
 const snapshot:IndicatorSnapshot={...factory,id:'literal',kind:'sma',paneId:'price'};const templates=saveIndicatorTemplate(createIndicatorTemplates(),'Precision',{indicators:[snapshot],scripts:[],rememberSymbol:false,rememberInterval:false,source:null},()=> 'template');let next=0;
 expect(instantiateIndicatorTemplate(restoreIndicatorTemplates(JSON.parse(JSON.stringify(templates))).records[0],()=> 'new-'+(++next)).indicators[0].presentation?.precision).toBe(16);
 const legacy={...snapshot};delete legacy.presentation;const bytes=JSON.stringify(legacy);validateIndicatorSnapshots([legacy]);expect(JSON.stringify(legacy)).toBe(bytes);
});

it('all ten actual managed models format native legend, native and OpenCandle Data Window, and endpoint labels',async()=>{
 const t=await indicatorDisplayHarness();try{
  const bars=Array.from({length:50},(_,index)=>({time:1700000000000+index*60000,open:index+1,high:index+2,low:index,close:index+1,volume:1}));t.core.bars=bars;t.native.bars=bars;t.native.scene.bars=bars;t.coords.barCount=50;
  // Volume MA is hidden by default, so only Volume paints.
  const cases:Array<[IndicatorId,Record<string,number|string>,string[]]>=[['volume',{},['1.000']],['sma',{length:1},['50.000']],['ema',{length:1},['50.000']],['rsi',{},['100.000']],['macd',{fast:1,slow:1,signal:1},['0.000','0.000','0.000']],['bb',{},['28.967','40.500','52.033']],['vwap',{source:'close'},['25.500']],['stochastic',{},['93.333','93.333']],['atr',{},['2.000']],['obv',{},['49.000']]];
  for(const [kind,inputs,expected]of cases){
   const id=t.port.add(kind,inputs),before=structuredClone(t.port.values(id));t.port.update(id,{presentation:{...defaultIndicatorPresentation(kind),precision:3}});
   const view=t.port.list()[0],model=t.native.scene.indicators.get(view.rendererId),pane=t.native.scene.panes.get(model.paneId);Object.assign(pane,{bounds:{top:0,height:400},scale:{min:-10,max:110},axisFormat:kind==='volume'||kind==='obv'?'volume':'price'});
   expect(t.paint().map(row=>String(row.values[0])).sort(),kind).toEqual(expected);expect(t.display.diagnostics(),kind).toEqual([]);
   const readout=t.native.getDataWindowReadout();expect(readout.groups.flatMap((group:any)=>group.rows.map((row:any)=>row.value)).sort(),kind).toEqual(kind==='volume'?['1.000','1.000']:expected);// the native Data Window still lists the hidden Volume MA row
   t.native.updateLegendValues();expect(t.seenLegend.at(-1).get(model.id).map((row:any)=>row.value).sort(),kind).toEqual(kind==='volume'?['1.000','1.000']:expected);// the legend also keeps the hidden Volume MA row (renderer behavior)
   const bar={...bars.at(-1)!,time:bars.at(-1)!.time/1000};const markup=renderToStaticMarkup(React.createElement(DataWindow,{symbol:'SYNTHETIC',fallback:bar,transformed:false,snapshot:{readout,displayed:{bar,hovered:false}} as any}));for(const text of expected)expect(markup,kind).toContain('>'+text+'</b>');
   expect(t.port.values(id),kind).toEqual(before);t.port.remove(id);
  }
 }finally{t.dispose();}
});

it('actual private-column painter uses exact raw ticks and independent precision even at duplicate prices',async()=>{
 const t=await indicatorDisplayHarness();try{
  for(const [order,[kind,precision]]of ([['sma',4],['ema',1]] as const).entries()){const id=t.port.add(kind,{length:1});t.port.update(id,{presentation:{...defaultIndicatorPresentation(kind),precision}});const model=t.native.scene.indicators.get(t.port.list().find(row=>row.id===id)!.rendererId);model.ownScale=true;t.native.scene.seriesZ.set(model.id,order);t.native.scene.indicatorScales.set(model.id,{scale:{min:0,max:40},scaleTarget:{min:0,max:40}});}
  t.paint();const first=t.recording.commands.filter(row=>row.op==='fillText'&&row.values[1]===369),second=t.recording.commands.filter(row=>row.op==='fillText'&&row.values[1]===425);
  expect(first.map(row=>row.values[0])).toEqual(['10.0000','20.0000','30.0000']);expect(second.map(row=>row.values[0])).toEqual(['10.0','20.0','30.0']);expect(first.map(row=>row.values[2])).toEqual(second.map(row=>row.values[2]));expect(t.display.diagnostics()).toEqual([]);
 }finally{t.dispose();}
});

it('actual sole-study master ticks update with identical geometry while main, shared and custom axes stay native',async()=>{
 const t=await indicatorDisplayHarness();try{
  const id=t.port.add('atr',{length:1}),model=t.native.scene.indicators.get(t.port.list()[0].rendererId),pane=t.native.scene.panes.get(model.paneId);Object.assign(pane,{bounds:{top:180,height:180},scale:{min:0,max:40},axisFormat:'price'});t.coords.height=360;
  const ticks=()=>{t.recording.commands.length=0;t.native.chrome.drawPriceAxes(t.recording.ctx,t.native.scene,t.coords,t.native.theme,300,[t.pane,pane]);return t.recording.commands.filter(row=>row.op==='fillText');};
  t.port.update(id,{presentation:{...defaultIndicatorPresentation('atr'),precision:4}});let values=ticks();expect(values.filter(row=>(row.values[2] as number)>180).map(row=>row.values[0])).toEqual(['10.0000','20.0000','30.0000']);expect(values.filter(row=>(row.values[2] as number)<180).map(row=>row.values[0])).toEqual(['10.00','20.00','30.00']);
  t.port.update(id,{presentation:{...defaultIndicatorPresentation('atr'),precision:1}});expect(ticks().filter(row=>(row.values[2] as number)>180).map(row=>row.values[0])).toEqual(['10.0','20.0','30.0']);
  const other={id:'unmanaged',paneId:pane.id,series:[]};t.native.scene.indicators.set(other.id,other);expect(ticks().filter(row=>(row.values[2] as number)>180).map(row=>row.values[0])).toEqual(['10.00','20.00','30.00']);t.native.scene.indicators.delete(other.id);
  t.native.chrome.axisTicks.setHook(()=>[{price:20,label:'CUSTOM'}]);expect(ticks().map(row=>row.values[0])).toEqual(['CUSTOM','CUSTOM']);expect(t.display.diagnostics()).toEqual([]);
 }finally{t.dispose();}
});

it('indexes the exact offset and sparse plot without future native-point reads or title-based matching',async()=>{
 const t=await indicatorDisplayHarness();try{
  const rows=[10.125,20.375,30.625].map((close,index)=>({time:1700000000000+index*60000,open:close,high:close+1,low:close-1,close,volume:1}));t.core.bars=rows;t.native.bars=rows;t.native.scene.bars=rows;t.coords.barCount=3;
  const id=t.port.add('sma',{length:2});t.port.update(id,{offset:1,presentation:{...defaultIndicatorPresentation('sma'),precision:3}});let model=t.native.scene.indicators.get(t.port.list()[0].rendererId);
  expect(t.native.readoutRowsFor(model,0,t.pane,'dataWindow')).toEqual([]);expect(t.native.readoutRowsFor(model,1,t.pane,'dataWindow')).toEqual([]);expect(t.native.readoutRowsFor(model,2,t.pane,'dataWindow')[0].value).toBe('15.250');
  let reads=0;Object.defineProperty(model.series[0].points,3,{configurable:true,get(){reads++;throw Error('future point');}});expect(t.native.readoutRowsFor(model,3,t.pane,'dataWindow')).toEqual([]);expect(reads).toBe(0);
  t.port.update(id,{offset:-1});model=t.native.scene.indicators.get(t.port.list()[0].rendererId);expect(t.native.readoutRowsFor(model,0,t.pane,'dataWindow')[0].value).toBe('15.250');expect(t.native.readoutRowsFor(model,1,t.pane,'dataWindow')[0].value).toBe('25.500');t.port.remove(id);
  const bb=t.port.add('bb',{length:2,multiplier:1});t.port.update(bb,{presentation:{...defaultIndicatorPresentation('bb'),precision:2}});model=t.native.scene.indicators.get(t.port.list()[0].rendererId);for(const plot of model.series)plot.title='Duplicate';expect(t.native.readoutRowsFor(model,2,t.pane,'dataWindow').map((row:any)=>row.value)).toEqual(['25.50','30.63','20.38']);
 }finally{t.dispose();}
});

it('keeps frame calculation identity and automatic serialized omission unchanged under precision edits',async()=>{
 const workspace=createInitialWorkspace(),cell=workspace.grid!.cells[workspace.grid!.layout.activeCellId],calculate=createFrameFingerprintCalculator();cell.indicators=[{...factoryIndicatorDefault('sma'),id:'precision',kind:'sma',paneId:'price'}];const before=await calculate(cell,[]);
 for(const precision of [0,2,8,16]){cell.indicators[0].presentation!.precision=precision;expect(await calculate(cell,[])).toEqual(before);}
 const original=JSON.stringify(cell.indicators[0].inputs);expect(JSON.stringify(cell.indicators[0].inputs)).toBe(original);
});

it('explicit precision preserves percent/indexed axis units while native legend values stay raw',async()=>{
 const t=await indicatorDisplayHarness();try{Object.assign(t.core.bars[1],{open:11,close:11,high:12,low:10});const id=t.port.add('atr',{length:1});t.port.update(id,{presentation:{...defaultIndicatorPresentation('atr'),precision:4}});const model=t.native.scene.indicators.get(t.port.list()[0].rendererId),pane=t.native.scene.panes.get(model.paneId);Object.assign(pane,{bounds:{top:0,height:180},scale:{min:0,max:4},scaleMode:'percent',percentBaseline:1});
  const ticks=()=>{t.recording.commands.length=0;t.native.chrome.drawPriceAxes(t.recording.ctx,t.native.scene,t.coords,t.native.theme,300,[pane]);return t.recording.commands.filter(row=>row.op==='fillText').map(row=>row.values[0]);};
  expect(ticks()).toEqual(['+0.0000%','+100.0000%','+200.0000%']);expect(t.paint().map(row=>row.values[0])).toEqual(['+100.0000%']);expect(t.native.readoutRowsFor(model,1,t.pane,'legend')[0].value).toBe('2.0000');
  pane.scaleMode='indexed';expect(ticks()).toEqual(['100.0000','200.0000','300.0000']);expect(t.paint().map(row=>row.values[0])).toEqual(['200.0000']);
 }finally{t.dispose();}
});

it('explicit volume numeric override replaces compact owned labels but Auto retains its earlier native behavior',async()=>{
 const t=await indicatorDisplayHarness();try{for(const row of t.core.bars)row.volume=1234.5;const id=t.port.add('volume',{length:1});t.port.update(id,{plots:{ma:{...defaultPlotStyle('volume','ma',1),visible:true}}});const model=t.native.scene.indicators.get(t.port.list()[0].rendererId),pane=t.native.scene.panes.get(model.paneId);Object.assign(pane,{bounds:{top:0,height:180},scale:{min:0,max:2000},axisFormat:'volume'});
  const original=t.native.readoutRowsFor(model,1,t.pane,'dataWindow');expect(t.paint().map(row=>row.values[0])).toEqual(['1.23K','1.23K']);t.port.update(id,{presentation:{...defaultIndicatorPresentation('volume'),precision:4}});expect(t.paint().map(row=>row.values[0])).toEqual(['1,234.5000','1,234.5000']);
  const current=t.native.scene.indicators.get(t.port.list()[0].rendererId);expect(t.native.readoutRowsFor(current,1,t.pane,'dataWindow').map((row:any)=>row.value)).toEqual(['1,234.5000','1,234.5000']);
  t.port.update(id,{presentation:{...defaultIndicatorPresentation('volume'),precision:'auto'}});expect(t.paint().map(row=>row.values[0])).toEqual(['1.23K','1.23K']);expect(t.native.readoutRowsFor(t.native.scene.indicators.get(current.id),1,t.pane,'dataWindow')).toEqual(original);
 }finally{t.dispose();}
});

it('numeric own-scale log and inversion preserve actual native tick coordinates',async()=>{
 const t=await indicatorDisplayHarness();try{const id=t.port.add('atr',{length:1});t.port.move(id,'price');const model=t.native.scene.indicators.get(t.port.list()[0].rendererId);expect(model.ownScale).toBe(true);t.native.scene.indicatorScales.set(model.id,{scale:{min:1,max:100,log:true,invert:true},scaleTarget:{min:1,max:100,log:true,invert:true}});
  t.paint();const positions=()=>t.recording.commands.filter(row=>row.op==='fillText'&&row.values[1]===369).map(row=>[row.values[1],row.values[2]]);const before=positions();expect(before.length).toBeGreaterThan(0);
  t.port.update(id,{presentation:{...defaultIndicatorPresentation('atr'),precision:4}});t.paint();expect(positions()).toEqual(before);expect(t.recording.commands.filter(row=>row.op==='fillText'&&row.values[1]===369).every(row=>/^\d+\.\d{4}$/.test(String(row.values[0])))).toBe(true);expect(t.paint().map(row=>row.values[0])).toEqual(['11.0000']);
 }finally{t.dispose();}
});

it('bounds only owned numeric tick commands without shortening the full sixteen-digit value',async()=>{
 const t=await indicatorDisplayHarness();try{
  const id=t.port.add('atr',{length:1}),initial=t.native.scene.indicators.get(t.port.list()[0].rendererId),pane=t.native.scene.panes.get(initial.paneId);Object.assign(pane,{bounds:{top:180,height:180},scale:{min:0,max:40},axisFormat:'price'});t.coords.height=360;
  const masterTicks=()=>{t.recording.commands.length=0;t.native.chrome.drawPriceAxes(t.recording.ctx,t.native.scene,t.coords,t.native.theme,300,[t.pane,pane]);return t.recording.commands.filter(row=>row.op==='fillText');};
  const auto=masterTicks();expect(auto.every(row=>row.values.length===3)).toBe(true);
  t.port.update(id,{presentation:{...defaultIndicatorPresentation('atr'),precision:16}});const fixed=masterTicks(),owned=fixed.filter(row=>(row.values[2] as number)>180),main=fixed.filter(row=>(row.values[2] as number)<180);
  expect(owned.map(row=>row.values[0])).toEqual(['10.0000000000000000','20.0000000000000000','30.0000000000000000']);expect(owned.every(row=>row.values.length===4&&row.values[3]===54)).toBe(true);expect(main.map(row=>row.values)).toEqual(auto.filter(row=>(row.values[2] as number)<180).map(row=>row.values));
  t.port.move(id,'price');Object.assign(t.pane,{bounds:{top:0,height:180}});t.coords.height=180;const privateModel=t.native.scene.indicators.get(t.port.list()[0].rendererId);t.native.scene.indicatorScales.set(privateModel.id,{scale:{min:0,max:40},scaleTarget:{min:0,max:40}});t.paint();const privateFixed=t.recording.commands.filter(row=>row.op==='fillText'&&row.values[1]===369);
  expect(privateFixed.map(row=>row.values[0])).toEqual(['10.0000000000000000','20.0000000000000000','30.0000000000000000']);expect(privateFixed.every(row=>row.values.length===4&&row.values[3]===46)).toBe(true);
  t.port.update(id,{presentation:{...defaultIndicatorPresentation('atr'),precision:'auto'}});t.paint();const privateAuto=t.recording.commands.filter(row=>row.op==='fillText'&&row.values[1]===369);expect(privateAuto.map(row=>row.values[0])).toEqual(['10.00','20.00','30.00']);expect(privateAuto.every(row=>row.values.length===3)).toBe(true);expect(privateAuto.map(row=>row.values.slice(1))).toEqual(privateFixed.map(row=>row.values.slice(1,3)));expect(t.display.diagnostics()).toEqual([]);
 }finally{t.dispose();}
});

it('actual full-output changes format new smoothing and VWAP bands without exposing private fill anchors',async()=>{
 const t=await indicatorDisplayHarness();try{
  const bars=[10,20,30,40].map((close,index)=>({time:1700000000000+index*60000,open:close,high:close+1,low:close-1,close,volume:1}));t.core.bars=bars;t.native.bars=bars;t.native.scene.bars=bars;t.coords.barCount=4;t.pane.scale={min:0,max:60};
  const rows=(id:string)=>{const view=t.port.list().find(row=>row.id===id)!,model=t.native.scene.indicators.get(view.rendererId);return t.native.readoutRowsFor(model,3,t.native.scene.panes.get(model.paneId),'dataWindow').map((row:any)=>row.value).sort();};
  const sma=t.port.add('sma',{length:1});t.port.update(sma,{presentation:{...defaultIndicatorPresentation('sma'),precision:2}});expect(rows(sma)).toEqual(['40.00']);
  t.port.update(sma,{inputs:{smoothingType:'SMA+BB',smoothingLength:2,smoothingMultiplier:2},plots:{sma:{...defaultPlotStyle('sma','sma',0),kind:'histogram'}}});expect(rows(sma)).toEqual(['25.00','35.00','40.00','45.00']);expect(t.paint().map(row=>row.values[0]).sort()).toEqual(['25.00','35.00','40.00','45.00']);t.port.remove(sma);
  const vwap=t.port.add('vwap',{source:'close',...VWAP_BAND_DEFAULTS,band1Enabled:true,band2Enabled:true,band3Enabled:true});t.port.update(vwap,{presentation:{...defaultIndicatorPresentation('vwap'),precision:2}});
  const expected=['24.25','24.50','24.75','25.00','25.25','25.50','25.75'];expect(rows(vwap)).toEqual(expected);expect(t.paint().map(row=>row.values[0]).sort()).toEqual(expected);
  const numerical=structuredClone(t.port.values(vwap).series);t.port.update(vwap,{presentation:{...defaultIndicatorPresentation('vwap'),precision:2,hideOnDaily:true}});t.setResolution('1D');t.port.recompute();expect(rows(vwap)).toEqual([]);expect(t.paint()).toEqual([]);expect(t.port.values(vwap).series).toEqual(numerical);
  t.setResolution('1m');t.port.recompute();expect(rows(vwap)).toEqual(expected);expect(t.paint().map(row=>row.values[0]).sort()).toEqual(expected);expect(t.display.diagnostics()).toEqual([]);
 }finally{t.dispose();}
});

it('a volume-unit study pane keeps its K/M/B format after the axis paint, so the crosshair price chip reads abbreviated too',async()=>{
 const t=await indicatorDisplayHarness();try{
  for(const row of t.core.bars)row.volume=2500000;
  const id=t.port.add('obv',{}),model=t.native.scene.indicators.get(t.port.list()[0].rendererId),pane=t.native.scene.panes.get(model.paneId);
  Object.assign(pane,{bounds:{top:180,height:180},scale:{min:0,max:40000000}});delete pane.axisFormat;t.coords.height=360;
  t.recording.commands.length=0;t.native.chrome.drawPriceAxes(t.recording.ctx,t.native.scene,t.coords,t.native.theme,300,[t.pane,pane]);
  const ticks=t.recording.commands.filter(row=>row.op==='fillText'&&(row.values[2] as number)>180).map(row=>String(row.values[0]));
  expect(ticks.length).toBeGreaterThan(0);expect(ticks.every(text=>/[KMB]$/.test(text.trim()))).toBe(true);
  // Retained for the crosshair layer (cursor frames reuse the pane state; computeScales resets it on the next full frame).
  expect(pane.axisFormat).toBe('volume');
  const layer=t.native.crosshairLayer,chips:string[]=[];
  if(layer&&typeof layer.lvAxisChip==='function'){
   const original=layer.lvAxisChip;const stop=Error('chip read');layer.lvAxisChip=function(...args:any[]){chips.push(String(args[4]));throw stop;};
   try{t.native.scene.crosshair={x:10,y:270};layer.ctx=t.recording.ctx;layer.canvas={width:600,height:720};const coords=Object.assign(Object.create(t.coords),{width:300,height:360,dpr:1,xToLogical:()=>0,logicalToX:()=>10,yToPrice:(y:number,scale:any,bounds:any)=>scale.max-(y-bounds.top)/bounds.height*(scale.max-scale.min)});try{layer.render(t.native.scene,coords,t.native.theme,null,null);}catch(error){if(error!==stop)throw error;}}finally{layer.lvAxisChip=original;}
   expect(chips.length).toBeGreaterThan(0);expect(chips[0].trim()).toMatch(/[KMB]$/);
  }
  t.port.remove(id);
 }finally{t.dispose();}
});
