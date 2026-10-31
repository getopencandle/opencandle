import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {applyIndicatorInputEdit,defaultIndicatorPresentation,indicatorInputSchema,migrateIndicatorInputs,mergeStoredIndicatorInputs,indicatorVwapBandSettings,validateIndicatorInputs,indicatorLegacyDefaults} from '../../src/chart/indicator-settings';
import {formatIndicatorValue,indicatorValueSuffix} from '../../src/chart/indicator-number-format';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {calculateVwapWorkerMessage} from '../../src/vwap/worker-core';
import type {Bar} from '../../src/domain/types';

// fact reconciliation. SYNTHETIC bars; facts cited as SBI#<id> = the recorded facts
const bars:Bar[]=Array.from({length:60},(_,i)=>{const close=100+6*Math.sin(i/4)+(i%6)*0.5;return {time:1700000000+i*3600,open:close-0.5,high:close+1.5+(i%3)*0.25,low:close-1.5-(i%4)*0.25,close,volume:500+(i*29)%90};});
const series=(result:ReturnType<typeof calculateIndicator>)=>result.series.map(row=>({id:row.id,values:row.values}));

describe('KC bands style (SBI#kc.input.bands_style) closes KC.TRUE_RANGE and KC.BANDS_STYLE',()=>{
 it('is a text input with average true range / true range / range, default average true range (G1-SMALLS-1028), and the boolean is retired',()=>{
  const field=indicatorInputSchema('kc').find(row=>row.key==='bandsStyle')!;
  expect(field).toMatchObject({type:'string',defval:'average true range',options:['average true range','true range','range']});
  expect(indicatorInputSchema('kc').some(row=>row.key==='trueRange')).toBe(false);
  expect(catalogDefinition('kc')!.retiredInputs!.map(row=>row.key)).toEqual(['trueRange']);
 });
 it.each([[true,'true range'],[false,'range']] as const)('stored Use true range %s migrates to Bands style "%s" with the same numbers',(flag,style)=>{
  const legacy={length:20,multiplier:1,source:'close',exponential:true,trueRange:flag};
  const migrated=migrateIndicatorInputs('kc',legacy);
  expect(migrated.bandsStyle).toBe(style);expect(Object.hasOwn(migrated,'trueRange')).toBe(false);
  expect(series(calculateIndicator('kc',bars,legacy))).toEqual(series(calculateIndicator('kc',bars,migrated)));
  expect(() => validateIndicatorInputs('kc',legacy,true)).not.toThrow();// stored state still loads
  expect(() => validateIndicatorInputs('kc',legacy,false)).toThrow();// but the retired key is not an edit control
 });
 it('the two styles differ numerically and editing Bands style drops the retired key',()=>{
  const range=series(calculateIndicator('kc',bars,{bandsStyle:'range'})),trueRange=series(calculateIndicator('kc',bars,{bandsStyle:'true range'}));
  expect(range).not.toEqual(trueRange);
  const next=applyIndicatorInputEdit('kc',{length:20,trueRange:true},{bandsStyle:'range'});
  expect(next.bandsStyle).toBe('range');expect(Object.hasOwn(next,'trueRange')).toBe(false);
 });
});

describe('ENV single Percent (SBI#env.input.percent) closes ENV.UPPER_PERCENT and ENV.LOWER_PERCENT as evidence only',()=>{
 it('has one shared Percent input, default 10, float and unbounded',()=>{
  const keys=indicatorInputSchema('env').map(row=>row.key);
  expect(keys).toEqual(['length','percent','source','exponential']);
  expect(indicatorInputSchema('env').find(row=>row.key==='percent')).toMatchObject({title:'Percent',type:'float',defval:10});
  expect(indicatorInputSchema('env').find(row=>row.key==='percent')).not.toHaveProperty('max');
 });
 it('equal legacy percentages migrate to Percent; unequal ones are kept and honored until Percent is edited (policy unchanged)',()=>{
  const equal=migrateIndicatorInputs('env',{length:20,upperPercent:5,lowerPercent:5});
  expect(equal).toMatchObject({percent:5});expect(Object.hasOwn(equal,'upperPercent')).toBe(false);
  const unequal={length:20,upperPercent:5,lowerPercent:2};
  expect(migrateIndicatorInputs('env',unequal)).toEqual(unequal);// not rewritten
  const calc=calculateIndicator('env',bars,unequal),basis=calc.series.find(row=>row.id==='basis')!.values,upper=calc.series.find(row=>row.id==='upper')!.values,lower=calc.series.find(row=>row.id==='lower')!.values;
  const i=basis.findIndex(v=>v!==null);expect(upper[i]).toBeCloseTo(basis[i]!*1.05,9);expect(lower[i]).toBeCloseTo(basis[i]!*0.98,9);
  const edited=applyIndicatorInputEdit('env',unequal,{percent:3});
  expect(edited).toEqual({length:20,percent:3});
 });
});

describe('HMA Price label (SBI#hma.input.src) closes HMA.SOURCE as evidence only',()=>{
 it('shows the label Price while the stored key stays source (recorded mapping: fact id src -> stored key source)',()=>{
  expect(indicatorInputSchema('hma').map(row=>[row.key,row.title])).toEqual([['length','Length'],['source','Price']]);
  expect(indicatorInputSchema('hma').find(row=>row.key==='source')).toMatchObject({defval:'close',options:['open','high','low','close','hl2','hlc3','ohlc4']});
  expect(indicatorLegacyDefaults.hma).toEqual({length:9,source:'close'});
 });
});

describe('STOCHRSI bands (SBI#stochrsi.band.*, SBI#stochrsi.fill.bandsBackground) close STOCHRSI.U.BANDS',()=>{
 it('defaults to 80 / 20 dashed #606060 guides and a #9915ff background at 20 percent opacity',()=>{
  const presentation=defaultIndicatorPresentation('stochrsi');
  expect(presentation.guides.upper).toMatchObject({visible:true,value:80,color:'#606060',width:1,lineStyle:'dashed'});
  expect(presentation.guides.lower).toMatchObject({visible:true,value:20,color:'#606060',width:1,lineStyle:'dashed'});
  expect(presentation.fills.band).toMatchObject({visible:true,color:'#9915ff',opacity:20});
 });
 it('draws both guides and the background between them through the presentation path',()=>{
  const result=calculateIndicator('stochrsi',bars,{}),presentation=defaultIndicatorPresentation('stochrsi');
  const out=renderIndicatorPresentation({id:'sr',kind:'stochrsi',inputs:{smoothK:3,smoothD:3,rsiLength:14,stochLength:14,source:'close'},plots:{},offset:0,visible:true,presentation},result,bars);
  expect(out.output.priceLines!.map(row=>row.price).sort((a,b)=>a-b)).toEqual([20,80]);
  expect(out.output.fills!).toHaveLength(1);expect(out.diagnostics).toEqual([]);
 });
});

describe('AROON percent format (SBI#aroon.legacy format percent, precision 2) closes AROON.PRECISION',()=>{
 it('carries precision 2 and the percent suffix in the number formatter',()=>{
  expect(catalogDefinition('aroon')!.precision).toBe(2);
  expect(indicatorValueSuffix('aroon')).toBe('%');
  expect(indicatorValueSuffix('rsi')).toBe('');expect(indicatorValueSuffix('cci')).toBe('');
  expect(formatIndicatorValue(63.5,2,'aroon')).toBe('63.50%');
  expect(formatIndicatorValue(100,2,'aroon')).toBe('100.00%');
  expect(formatIndicatorValue(0,2,'aroon')).toBe('0.00%');
  expect(formatIndicatorValue(63.5,2,'rsi')).toBe('63.50');
  expect(formatIndicatorValue(1234.5,1,'cci')).toBe('1,234.5');
 });
});

describe('VWAP',()=>{
 it('Standard Deviation is offered next to Percentage; an unknown band mode is refused and never silently computes',()=>{
  expect(indicatorInputSchema('vwap').find(row=>row.key==='bandMode')!.options).toEqual(['Percentage','Standard Deviation']);
  // Standard Deviation oracles: tests/domain/r29-indicator-oracles.test.ts.
  const bands={bandMode:'Median',band1Enabled:true,band1Multiplier:1,band2Enabled:false,band2Multiplier:2,band3Enabled:false,band3Multiplier:3};
  expect(()=>indicatorVwapBandSettings(bands)).toThrow('VWAP bands support only the Percentage and Standard Deviation modes.');
  const result=calculateIndicator('vwap',bars,bands);
  expect(result.series).toEqual([]);expect(result.diagnostics[0]).toMatch(/support only the Percentage and Standard Deviation modes/);
 });
 it('the worker kernel (version 2) and the inline kernel (version 1) agree to the last bit on a synthetic exact fixture',()=>{
  // Integer prices and volumes keep every partial sum exact in binary64, so correct rounding is unambiguous for both kernels.
  const rows:Bar[]=Array.from({length:40},(_,i)=>{const price=100+(i*7)%23;return {time:1700000000+i*60,open:price,high:price,low:price,close:price,volume:1+(i*5)%9};});
  const inline=calculateIndicator('vwap',rows,{anchor:'Century',timezone:'UTC',source:'close'}).series[0].values;
  const packed=new Float64Array(rows.flatMap(row=>[row.time,row.open,row.high,row.low,row.close,row.volume])).buffer;
  const message=calculateVwapWorkerMessage({v:1,type:'calculate',job:'indrest',rows:rows.length,settings:{kernelVersion:2,source:'close',anchor:'Century',timezone:'UTC',transform:'standard',bandMode:'Percentage',band1Enabled:false,band1Multiplier:1,band2Enabled:false,band2Multiplier:2,band3Enabled:false,band3Multiplier:3},buffer:packed});
  const worker=Array.from(new Float64Array(message.values)).slice(0,rows.length);
  const bits=(value:number|null)=>{const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,value as number,false);return view.getBigUint64(0,false).toString(16);};
  expect(inline.every(v=>v!==null)).toBe(true);
  expect(worker.map(bits)).toEqual(inline.map(bits));
 });
});

describe('merge of stored inputs does not materialize divergence',()=>{
 it('RSI stored without the key stays without it through the defaults merge',()=>{
  const merged=mergeStoredIndicatorInputs('rsi',indicatorLegacyDefaults.rsi,{length:14,source:'close'});
  expect(Object.hasOwn(merged,'divergence')).toBe(false);
 });
});
