import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {tradingSessionSourceSeconds} from '../../src/domain/indicators-ext/trading-sessions';
import {TIMEFRAME_BASIS_STYLES} from '../../src/chart/indicator-port';
import {requireTechnicalChart} from '../../src/ui/technical-alert-catalog';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {chartIntervalText,looksLikeRangeInterval,parseRangeInterval,previewChartInterval,rangeSizeOf,RANGE_INTERVAL_DEFAULT,submitChartIntervalEntry,withRangeSize} from '../../src/chart/range-interval';
import {settingsDefaults} from '../../src/chart/chart-settings';
import {typeRowHidden} from '../../src/chart/chart-settings-bindings';
import {derivedCalculationOptions} from '../../src/chart/adapter';
import {createIntervalMenuState,parseInterval,parseIntervalEntry} from '../../src/domain/intervals';
import {IntervalMenu} from '../../src/ui/IntervalMenu';
import {IntervalEntry} from '../../src/ui/IntervalEntry';
import {formatWithPrecision,precisionAxisTicks} from '../../src/chart/symbol-precision';
import {defaultChartSettingsDocument,restoreChartSettingsDocument} from '../../src/chart/chart-settings-document';

describe('CHARTTYPE2-1027 A: HLC bars wherever Bars is accepted',()=>{
 it('trading sessions, the own-timeframe basis and technical alerts accept hlcbars',()=>{
  expect(tradingSessionSourceSeconds({resolution:'5m',style:'hlcbars'})).toBe(300);
  expect(tradingSessionSourceSeconds({resolution:'5m',style:'bars'})).toBe(300);
  expect(TIMEFRAME_BASIS_STYLES.has('hlcbars')).toBe(true);expect(TIMEFRAME_BASIS_STYLES.has('bars')).toBe(true);expect(TIMEFRAME_BASIS_STYLES.has('renko')).toBe(false);
  const dataset=fixtureDataset('GME',3),source=sourceContextForDataset(dataset);let style='hlcbars';
  const chart:any={getAnalysisUnavailable:()=>'',getSourceContext:()=>source,getStyle:()=>style,getDataWindow:()=>({pending:false,series:{count:dataset.bars.length,firstTime:dataset.bars[0].time,lastTime:dataset.bars.at(-1)!.time,style}})};
  expect(requireTechnicalChart(chart,dataset,dataset.bars)).toBe(chart);
  style='renko';expect(()=>requireTechnicalChart(chart,dataset,dataset.bars)).toThrow('not yet an eligible technical alert source');
 });
});

describe('CHARTTYPE2-1027 B: Range size through the R interval',()=>{
 it('parses range intervals with any whole tick count and leaves the time grammar alone',()=>{
  expect(parseRangeInterval('100R')).toEqual({ok:true,size:100,interval:'100R',label:'100 ranges'});
  expect(parseRangeInterval(' 25 ranges ')).toMatchObject({ok:true,size:25,interval:'25R'});
  expect(parseRangeInterval('R')).toMatchObject({ok:true,size:1,label:'1 range'});
  expect(parseRangeInterval('1.5R').ok).toBe(false);expect(parseRangeInterval('0R').ok).toBe(false);expect(parseRangeInterval('100001R').ok).toBe(false);
  expect(looksLikeRangeInterval('5')).toBe(false);expect(looksLikeRangeInterval('1D')).toBe(false);expect(looksLikeRangeInterval('10r')).toBe(true);
  // The intervals model keeps its own R rows and limits (US trading-day work untouched).
  expect(parseInterval('100R')).toMatchObject({id:'100R',unit:'range',kind:'event'});expect(()=>parseInterval('25R')).toThrow();
  expect(previewChartInterval('25R',parseIntervalEntry)).toEqual({ok:true,label:'25 ranges'});
  expect(previewChartInterval('1h',parseIntervalEntry)).toMatchObject({ok:true,label:'1 hour'});
 });
 it('defaults to 100R, reads an old saved Range value and writes the size from the interval',()=>{
  expect(RANGE_INTERVAL_DEFAULT).toBe(100);expect(settingsDefaults('range').range).toBe(100);
  expect(rangeSizeOf(undefined)).toBe(100);expect(rangeSizeOf({})).toBe(100);
  const old={range:{...settingsDefaults('range'),range:10,phantomBars:true}};
  expect(rangeSizeOf(old)).toBe(10);expect(chartIntervalText('range',old,'1D')).toBe('10R');expect(chartIntervalText('candles',old,'1D')).toBe('1D');
  const next=withRangeSize(old,250);expect(next.range).toMatchObject({range:250,phantomBars:true});expect(old.range.range).toBe(10);
  expect(withRangeSize(undefined,40).range).toEqual({...settingsDefaults('range'),range:40});
  expect(()=>withRangeSize(old,0)).toThrow('whole number');
  // The Range construction reads the same value.
  expect(derivedCalculationOptions('range',next.range,0.01,false)?.settings).toMatchObject({range:250});
  expect(derivedCalculationOptions('range',undefined,0.01,false)?.settings).toMatchObject({range:100});
 });
 it('hides the Range settings row (the reference app has none) and keeps the other rows',()=>{
  const values=settingsDefaults('range');
  expect(typeRowHidden('range','range',values)).toBe(true);expect(typeRowHidden('range','phantomBars',values)).toBe(false);
 });
 it('routes typed R intervals to the Range handler and everything else to the interval route',()=>{
  const ranges:number[]=[],times:string[]=[];
  const range=(size:number)=>{ranges.push(size);return{ok:true};},time=(text:string)=>{times.push(text);return{ok:true,interval:'5m',message:null};};
  expect(submitChartIntervalEntry('100R',range,time)).toEqual({ok:true,interval:'100R',message:null});
  expect(submitChartIntervalEntry('5',range,time)).toEqual({ok:true,interval:'5m',message:null});
  expect(submitChartIntervalEntry('0R',range,time).ok).toBe(false);
  expect(submitChartIntervalEntry('7R',()=>({ok:false,message:'Replay refuses Range.'}),time)).toEqual({ok:false,interval:null,message:'Replay refuses Range.'});
  expect(ranges).toEqual([100]);expect(times).toEqual(['5']);
 });
 it('interval menu: R rows are enabled with a Range handler, the current size is checked, a custom size shows',()=>{
  const current=fixtureDataset('GME',10),base={datasets:[current],current,state:createIntervalMenuState(),onApply:()=>{},onEditMenu:()=>{},onAdvanced:()=>{},onClose:()=>{}};
  const row=(markup:string,label:string)=>markup.match(new RegExp('<button[^>]*role="menuitemradio"[^>]*><span>'+label+'</span>'))?.[0]??'';
  const plain=renderToStaticMarkup(React.createElement(IntervalMenu,base));
  expect(row(plain,'100 ranges')).toContain('disabled=""');
  const active=renderToStaticMarkup(React.createElement(IntervalMenu,{...base,onRangeInterval:()=>true,rangeActive:true,rangeSize:100}));
  expect(row(active,'100 ranges')).toContain('aria-checked="true"');expect(row(active,'100 ranges')).not.toContain('disabled=""');
  expect(row(active,'10 ranges')).toContain('aria-checked="false"');expect(row(active,'1 day')).toContain('aria-checked="false"');
  const custom=renderToStaticMarkup(React.createElement(IntervalMenu,{...base,onRangeInterval:()=>true,rangeActive:true,rangeSize:250}));
  expect(row(custom,'250 ranges')).toContain('aria-checked="true"');expect(custom).not.toContain('aria-label="Favorite 250 ranges"');
  const candles=renderToStaticMarkup(React.createElement(IntervalMenu,{...base,onRangeInterval:()=>true,rangeActive:false,rangeSize:100}));
  expect(row(candles,'100 ranges')).toContain('aria-checked="false"');expect(row(candles,'100 ranges')).not.toContain('disabled=""');
 });
 it('interval entry previews a range interval and shows the current R interval',()=>{
  const markup=renderToStaticMarkup(React.createElement(IntervalEntry,{seed:'25R',current:'100R',onSubmit:()=>({ok:true,message:null}),onClose:()=>{}}));
  expect(markup).toContain('now 100R');expect(markup).toContain('25 ranges');
 });
});

describe('CHARTTYPE2-1027 C: price scale precision beyond the renderer axis',()=>{
 const defaults=[{price:101.2,label:'101.20'},{price:101.4,label:'101.40'},{price:101.6,label:'101.60',major:true},{price:101.8,label:'101.80'}];
 it('relabels main price pane ticks for Integer, 9 to 15 decimals and 1/N; leaves exact values to the renderer',()=>{
  for(const value of [undefined,'default','1','2','8'])expect(precisionAxisTicks(value),String(value)).toBeNull();
  expect(()=>precisionAxisTicks('1/3')).toThrow('Unknown precision');
  const price={pane:{kind:'price'},mode:'price',defaults};
  expect(precisionAxisTicks('integer')!(price)).toEqual([{price:101,label:'101'},{price:102,label:'102',major:true}]);
  expect(precisionAxisTicks('1/4')!(price)).toEqual([{price:101.25,label:'101.25'},{price:101.5,label:'101.50'},{price:101.75,label:'101.75'}]);
  expect(precisionAxisTicks('12')!(price)?.map(tick=>tick.label)).toEqual(['101.200000000000','101.400000000000','101.600000000000','101.800000000000']);
  expect(precisionAxisTicks('integer')!({...price,mode:'percent'})).toBeNull();
  expect(precisionAxisTicks('integer')!({...price,pane:{kind:'study'}})).toBeNull();
 });
 it('the real renderer draws the hook labels through its public priceAxisTicks feature',()=>{
  const renderer:any=new NativeRenderer();renderer.scheduler={invalidate(){}};
  expect(renderer.features).toContain('priceAxisTicks');
  const pane=renderer.scene.ensurePane('price','price',0,3);pane.scale={min:90,max:110,log:false,invert:false};pane.bounds={top:0,height:400,left:0,width:100};
  renderer.applyFeature('priceAxisTicks',precisionAxisTicks('1/32'));
  const ticks=renderer.priceAxisTicks.ticksFor(renderer.scene,pane,{priceToY:()=>0}) as {price:number;label:string}[];
  expect(ticks.length).toBeGreaterThan(2);
  for(const tick of ticks){expect(tick.label).toBe(formatWithPrecision(tick.price,'1/32'));expect(Number.isInteger(tick.price*32)).toBe(true);}
  renderer.applyFeature('priceAxisTicks',null);
  expect((renderer.priceAxisTicks.ticksFor(renderer.scene,pane,{priceToY:()=>0}) as {label:string}[]).every(tick=>!/^\d+\.\d{5}$/.test(tick.label))).toBe(true);
 });
 it('a stored precision this build does not offer reads as Default instead of refusing the settings',()=>{
  const document=defaultChartSettingsDocument() as any;document.symbol.precision='1/256';
  expect(restoreChartSettingsDocument(JSON.parse(JSON.stringify(document))).symbol.precision).toBe('default');
  document.symbol.precision='1/32';expect(restoreChartSettingsDocument(JSON.parse(JSON.stringify(document))).symbol.precision).toBe('1/32');
  document.symbol.precision=5;expect(()=>restoreChartSettingsDocument(JSON.parse(JSON.stringify(document)))).toThrow();
 });
});
