import {expect,it} from 'vitest';
import {indicatorDisplayHarness} from './indicator-display-harness';
import {defaultPlotStyle} from '../../src/chart/indicator-port';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
import {VWAP_BAND_DEFAULTS} from '../../src/domain/indicators';
import type {IndicatorId} from '../../src/domain/indicators';
import {withHexColorProbe} from './chart-paint-harness';

it('actual pinned chrome paints only accepted latest numerical labels and respects sparse endpoints',async()=>{
 const t=await indicatorDisplayHarness();try{
  const id=t.port.add('sma',{length:1});expect(t.paintAll().map(row=>row.values[0])).toEqual(['20.00']);expect(t.display.diagnostics()).toEqual([]);
  t.port.update(id,{inputs:{length:3}});expect(t.paint()).toEqual([]);expect(t.port.values(id).series[0].values).toEqual([null,null]);
  t.port.remove(id);t.port.add('rsi',{length:14});expect(t.paint()).toEqual([]);
 }finally{t.dispose();}
});
it('global label and legend switches are independent from tracking, Data Window and numeric state',async()=>{
 const t=await indicatorDisplayHarness();try{
  const id=t.port.add('sma',{length:1}),style={...defaultPlotStyle('sma','sma',0),trackPrice:true};t.port.update(id,{plots:{sma:style}});const view=t.port.list()[0],model=t.native.scene.indicators.get(view.rendererId),numerical=t.port.values(id),original=t.native.readoutRowsFor(model,1,t.pane,'dataWindow');
  t.display.setOptions({labelsVisible:false,valuesVisible:false});expect(t.paint()).toEqual([]);expect(model.priceLines).toHaveLength(1);expect(t.native.readoutRowsFor(model,1,t.pane,'legend')).toEqual([]);expect(t.native.readoutRowsFor(model,1,t.pane,'dataWindow')).toEqual(original);t.native.updateLegendValues();expect(t.seenLegend.at(-1).get(model.id)).toEqual([]);
  t.display.setOptions({labelsVisible:false,valuesVisible:true});expect(t.paint()).toEqual([]);expect(t.native.readoutRowsFor(model,1,t.pane,'legend')).toEqual(original);expect(model.priceLines).toHaveLength(1);
  t.display.setOptions({labelsVisible:true,valuesVisible:false});expect(t.paint()).toHaveLength(1);expect(t.native.readoutRowsFor(model,1,t.pane,'legend')).toEqual([]);expect(t.native.readoutRowsFor(model,1,t.pane,'dataWindow')).toEqual(original);
  t.display.setOptions({labelsVisible:true,valuesVisible:true});expect(t.paint()).toHaveLength(1);expect(t.native.readoutRowsFor(model,1,t.pane,'legend')).toEqual(original);
  t.port.update(id,{plots:{sma:{...style,priceScale:false,legend:false}}});expect(t.paint()).toEqual([]);const changed=t.native.scene.indicators.get(view.rendererId);expect(changed.priceLines).toHaveLength(1);expect(t.native.readoutRowsFor(changed,1,t.pane,'legend')).toEqual([]);expect(t.native.readoutRowsFor(changed,1,t.pane,'dataWindow')).toEqual(original);expect(t.port.values(id)).toEqual(numerical);
 }finally{t.dispose();}
});
it('global legend override applies to unmanaged rows without granting label authority',async()=>{
 const t=await indicatorDisplayHarness();try{
  const unmanaged={id:'unmanaged-script',title:'Unmanaged script',paneId:'price',series:[{id:'external',title:'X',kind:'line',visible:true,display:{legend:true,dataWindow:true,priceScale:true},points:[{time:1,value:7},{time:2,value:8}],style:{color:'#fff'}}]};t.native.scene.indicators.set(unmanaged.id,unmanaged);
  expect(t.native.readoutRowsFor(unmanaged,1,t.pane,'legend')[0].value).toBe('8.00');expect(t.paint()).toEqual([]);t.display.setOptions({labelsVisible:true,valuesVisible:false});expect(t.native.readoutRowsFor(unmanaged,1,t.pane,'legend')).toEqual([]);expect(t.native.readoutRowsFor(unmanaged,1,t.pane,'dataWindow')[0].value).toBe('8.00');
 }finally{t.dispose();}
});
it('actual own-scale placement uses separate columns and withholds missing scale ownership',async()=>{
 const t=await indicatorDisplayHarness();try{
  t.port.add('sma',{length:1});const other=t.port.add('ema',{length:1}),model=t.native.scene.indicators.get(t.port.list().find(row=>row.id===other)!.rendererId);model.ownScale=true;t.native.scene.indicatorScales.set(model.id,{scale:{min:0,max:100},scaleTarget:{min:0,max:100}});
  const labels=t.paint();expect(labels).toHaveLength(2);expect(labels.map(row=>row.values[1])).toEqual([333.5,393.5]);expect(labels[1].values[2]).toBeGreaterThan(labels[0].values[2] as number);
  t.native.scene.indicatorScales.delete(model.id);expect(t.paint()).toHaveLength(1);expect(t.display.diagnostics()[0].message).toContain('missing or ambiguous');
 }finally{t.dispose();}
});
it('inversion, percent, indexed, log and volume labels follow actual resolved geometry',async()=>{
 const t=await indicatorDisplayHarness();try{
  t.port.add('sma',{length:1});t.pane.scale.max=100;expect(t.paint()[0].values[2]).toBe(136);t.pane.scale.invert=true;expect(t.paint()[0].values[2]).toBe(40);
  t.native.scene.scaleMode='percent';t.pane.percentBaseline=10;expect(t.paint()[0].values[0]).toBe('+100.00%');t.native.scene.scaleMode='indexed';expect(t.paint()[0].values[0]).toBe('200.00');
  t.pane.percentBaseline=0;expect(t.paint()).toEqual([]);expect(t.display.diagnostics()[0].message).toContain('baseline');t.native.scene.scaleMode='price';t.pane.scale={min:1,max:100,log:true};expect(t.paint()).toHaveLength(1);t.pane.scale.min=0;expect(t.paint()).toEqual([]);expect(t.display.diagnostics()[0].message).toContain('positive');
  t.pane.scale={min:0,max:10,log:false};expect(t.paint()).toEqual([]);expect(t.display.diagnostics()[0].message).toContain('Offscale');t.pane.scale={min:0,max:100};t.pane.axisFormat='volume';expect(t.paint()[0].values[0]).toBe('20');
 }finally{t.dispose();}
});
it('actual complete chrome retains the main price label while packed labels reserve its footprint',async()=>{
 const t=await indicatorDisplayHarness();try{
  for(let index=0;index<3;index++)t.port.add('sma',{length:1},{id:'collision-'+index});t.native.scene.showPriceLabel=true;
  const labels=withHexColorProbe(()=>t.paintAll());expect(labels).toHaveLength(3);expect(labels.map(row=>row.values[2])).toEqual([72,120,136]);
  const nativeMain=t.recording.commands.filter(row=>row.op==='fillText'&&row.values.length===3&&row.values[0]==='20.00');expect(nativeMain.some(row=>row.values[2]===90)).toBe(true);
  for(const label of labels){const center=label.values[2] as number;expect(center+8<=82||center-8>=98).toBe(true);}
  t.native.scene.showCountdown=true;const countdownReserved=withHexColorProbe(()=>t.paintAll());for(const label of countdownReserved){const center=label.values[2] as number;expect(center+8<=82||center-8>=114).toBe(true);}
 }finally{t.dispose();}
});
it('accepted histogram palette and alpha label the unshifted endpoint after native offset padding',async()=>{
 const t=await indicatorDisplayHarness();try{
  const palette={nonnegativeRising:'#ff0000',nonnegativeFalling:'#00ff00',negativeRising:'#0000ff',negativeFalling:'#ffffff'};
  const id=t.port.add('macd',{fast:1,slow:1,signal:1}),base=defaultIndicatorPresentation('macd');
  t.port.update(id,{offset:3,presentation:{...base,histogramPalette:palette},plots:{macd:{...defaultPlotStyle('macd','macd',0),priceScale:false},signal:{...defaultPlotStyle('macd','signal',1),priceScale:false},histogram:{...defaultPlotStyle('macd','histogram',2),opacity:50}}});
  // The actual native formatter uses the fixture's 0.01 mintick: exactly two decimals.
  const view=t.port.list()[0],model=t.native.scene.indicators.get(view.rendererId),pane=t.native.scene.panes.get(model.paneId);pane.scale={min:-1,max:1};pane.bounds={top:0,height:180};expect(t.paint().map(row=>row.values[0])).toEqual(['0.00']);expect(t.recording.commands.find(row=>row.op==='strokeRect')?.color).toBe('rgba(0,255,0,0.5)');
  const histogram=model.series.find((row:any)=>row.title==='Histogram');expect(histogram.points).toHaveLength(5);expect(t.port.values(id).series.find(row=>row.id==='histogram')?.values).toEqual([0,0]);
 }finally{t.dispose();}
});
it('painting one hundred cached endpoints reads no historical OHLC fields and rejects a replaced prefix',async()=>{
 const t=await indicatorDisplayHarness();try{
  for(let index=0;index<100;index++)t.port.add('sma',{length:1},{id:'cached-'+index});t.pane.bounds.height=2000;let reads=0;
  for(const row of t.core.bars)for(const key of ['open','high','low','close','volume'])Object.defineProperty(row,key,{configurable:true,get(){reads++;throw Error('Historical bars were rescanned during painting.');}});
  expect(t.paint()).toHaveLength(100);expect(reads).toBe(0);t.core.bars=[];expect(t.paint()).toEqual([]);expect(reads).toBe(0);expect(t.display.diagnostics()[0].message).toContain('source prefix');
 }finally{t.dispose();}
});
it('all ten built-ins paint only their numerical endpoints through the actual core and native column hook',async()=>{
 const t=await indicatorDisplayHarness();try{
  const rows=Array.from({length:50},(_,index)=>({time:1700000000000+index*60000,open:index+1,high:index+2,low:index,close:index+1,volume:1}));t.core.bars=rows;t.native.bars=rows;t.native.scene.bars=rows;
  // Volume MA is hidden by default, so only Volume paints.
  const cases:Array<[IndicatorId,Record<string,number|string>,string[]]>=[['volume',{},['1.00']],['sma',{length:1},['50.00']],['ema',{length:1},['50.00']],['rsi',{},['100.00']],['macd',{fast:1,slow:1,signal:1},['0.00','0.00','0.00']],['bb',{},['28.97','40.50','52.03']],['vwap',{source:'close'},['25.50']],['stochastic',{},['93.33','93.33']],['atr',{},['2.00']],['obv',{},['49.00']]];
  for(const [kind,inputs,expected]of cases){const id=t.port.add(kind,inputs),view=t.port.list()[0],model=t.native.scene.indicators.get(view.rendererId),pane=t.native.scene.panes.get(model.paneId);Object.assign(pane,{bounds:{top:0,height:400},scale:{min:-10,max:110},axisFormat:'price'});expect(t.paint().map(row=>String(row.values[0])).sort(),kind).toEqual(expected);expect(t.display.diagnostics(),kind).toEqual([]);t.port.remove(id);}
 }finally{t.dispose();}
});
it('one computation captures the native input prefix once for both numerical values and label ownership',async()=>{
 const t=await indicatorDisplayHarness();try{
  const id=t.port.add('sma',{length:1}),instance=t.instances.get(t.port.list()[0].rendererId),before=instance.ctx.bars;let reads=0;
  instance.ctx.bars=()=>{reads++;return reads===1?t.core.bars:t.core.bars.map((row:any)=>({...row,close:999}));};
  try{t.port.recompute();expect(reads).toBe(1);expect(t.port.values(id).series[0].values).toEqual([10,20]);expect(t.paint().map(row=>row.values[0])).toEqual(['20.00']);}finally{instance.ctx.bars=before;}
 }finally{t.dispose();}
});
it('full-model updates, offset and VWAP resolution hiding update actual labels without helper series',async()=>{
 const t=await indicatorDisplayHarness();try{
  const id=t.port.add('vwap',{source:'close',...VWAP_BAND_DEFAULTS,band1Enabled:true});expect(t.paint()).toHaveLength(3);const expected=t.paint().map(row=>row.values[0]);t.port.update(id,{offset:100});expect(t.paint().map(row=>row.values[0])).toEqual(expected);
  t.port.update(id,{presentation:{...defaultIndicatorPresentation('vwap'),hideOnDaily:true}});t.setResolution('1D');t.port.recompute();expect(t.paint()).toEqual([]);t.setResolution('1m');t.port.recompute();expect(t.paint()).toHaveLength(3);
  const before=t.port.serialize(),mount=t.renderer.mountIndicator.bind(t.renderer);let fail=true;t.renderer.mountIndicator=value=>{const result=mount(value);if(fail){fail=false;throw Error('literal mount fault');}return result;};expect(()=>t.port.update(id,{inputs:{...VWAP_BAND_DEFAULTS,band2Enabled:true}})).toThrow();expect(t.port.serialize()).toEqual(before);expect(t.paint()).toHaveLength(3);expect(t.display.diagnostics()).toEqual([]);
 }finally{t.dispose();}
});
it('options validate before mutation and repaint failure restores prior visibility',async()=>{
 const t=await indicatorDisplayHarness();try{
  t.port.add('sma',{length:1});let reads=0;expect(()=>t.display.setOptions({get labelsVisible(){reads++;return false;},valuesVisible:false})).toThrow();expect(reads).toBe(0);expect(t.paint()).toHaveLength(1);
  t.repaint.failures=1;expect(()=>t.display.setOptions({labelsVisible:false,valuesVisible:false})).toThrow('literal repaint failure');expect(t.paint()).toHaveLength(1);expect(()=>({...t.display}).setOptions({labelsVisible:false,valuesVisible:false})).toThrow(/receiver/);
  t.repaint.failures=2;expect(()=>t.display.setOptions({labelsVisible:false,valuesVisible:false})).toThrow(AggregateError);expect(t.display.diagnostics()[0].message).toContain('recovery failed');expect(()=>t.paint()).toThrow(/retired|changed/);
 }finally{t.dispose();}
});
it('packed labels are stable, bounded and report overflow without modifying history',async()=>{
 const t=await indicatorDisplayHarness();try{
  for(let index=0;index<7;index++)t.port.add('sma',{length:1},{id:'same-'+index});t.pane.bounds.height=64;const original=t.core.bars;
  const labels=t.paint(),again=t.paint();expect(labels).toEqual(again);expect(labels.length).toBe(4);expect(t.display.diagnostics()[0].message).toContain('3 indicator labels');expect(t.core.bars).toBe(original);
  const before={font:t.recording.ctx.font,textAlign:t.recording.ctx.textAlign,globalAlpha:t.recording.ctx.globalAlpha};t.paint();expect({font:t.recording.ctx.font,textAlign:t.recording.ctx.textAlign,globalAlpha:t.recording.ctx.globalAlpha}).toEqual(before);
 }finally{t.dispose();}
});
