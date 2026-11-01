import {expect,it} from 'vitest';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort,evaluateDomainIndicator,indicatorInputSchema} from '../../src/chart/indicator-port';
import {applyIndicatorInputEdit,indicatorPlotIds,validateFrozenIndicatorInputs,validateIndicatorInputs,defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
import {defaultPlotStyle,renderIndicatorSeries} from '../../src/chart/indicator-rendering';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {calculateIndicator} from '../../src/domain/indicators';
import {captureIndicatorAlertSource} from '../../src/domain/technical-alerts';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {instantiateIndicatorTemplate,saveIndicatorTemplate,createIndicatorTemplates} from '../../src/ui/indicator-templates';
import type {Bar} from '../../src/domain/types';

// through the port. Design decision (LV rule, not the reference's). SYNTHETIC bars.
const closes:number[]=[];
for(let i=0;i<25;i++)closes.push(120+Math.sin(i/2)*0.5);
for(let i=0;i<10;i++)closes.push(120-i*3.5);// steep fall to 88.5
for(let i=1;i<=14;i++)closes.push(88.5+i*1.5);// bounce
for(let i=0;i<18;i++)closes.push(108-i*1.25);// gentler fall to 86.75: a lower price low with a higher RSI low
for(let i=1;i<=20;i++)closes.push(86.75+i*0.9);
const rows=closes.map((close,i)=>({time:1700000000000+i*86400000,open:close+0.2,high:close+1,low:close-1,close,volume:1000}));
const domainBars:Bar[]=rows.map(row=>({...row,time:row.time/1000}));
async function core(){const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);t.core.bars=rows;return {t,port,close(){port.dispose();t.dispose();}};}
const rsiDefaults=()=>factoryIndicatorDefault('rsi');

it('the schema gains divergence as a bool defaulting to off, labelled for the player, with no internal id in the label',()=>{
 const keys=indicatorInputSchema('rsi').map(row=>row.key);
 expect(keys).toEqual(['length','source','smoothingType','smoothingLength','smoothingMultiplier','divergence','divergenceLeft','divergenceRight','divergenceRangeMin','divergenceRangeMax','divergenceRegularBullish','divergenceRegularBearish','divergenceHiddenBullish','divergenceHiddenBearish','divergenceBodyOnly','divergenceLabels','divergencePricePane','divergenceBackground','divergenceForming']);// RSI options appended
 expect(indicatorInputSchema('rsi').find(row=>row.key==='divergence')).toMatchObject({title:'Calculate divergence',type:'bool',defval:false});
 expect(indicatorPlotIds.rsi).toEqual(['rsi','smooth','smoothUpper','smoothLower','divergenceBullish','divergenceBearish','divergenceHiddenBullish','divergenceHiddenBearish']);
 expect(indicatorInputSchema('sma').some(row=>row.key==='divergence')).toBe(false);
});

it('the domain evaluator now accepts divergence for RSI and still rejects it elsewhere',()=>{
 const on=evaluateDomainIndicator('rsi',domainBars,{divergence:true});
 expect(on.diagnostics).toEqual([]);expect(on.series.map(row=>row.id)).toEqual(['rsi','divergenceBullish','divergenceBearish']);
 expect(evaluateDomainIndicator('sma',domainBars,{divergence:true})).toMatchObject({series:[],diagnostics:['Unsupported indicator inputs: divergence']});
});

it('saved RSI instances, templates and frozen alerts without the key keep identical bytes and identity; nothing writes divergence:false',async()=>{
 const a=await core();
 try{
  const id=a.port.add('rsi',rsiDefaults().inputs,rsiDefaults());
  expect(Object.hasOwn(a.port.list()[0].inputs,'divergence')).toBe(false);
  const bytes=JSON.stringify(a.port.serialize());
  const b=await core();
  try{
   b.port.restore(JSON.parse(bytes));expect(JSON.stringify(b.port.serialize())).toBe(bytes);
   b.port.update(id,{inputs:{length:15}});expect(Object.hasOwn(b.port.list()[0].inputs,'divergence')).toBe(false);expect(b.port.list()[0].series.map(row=>row.id)).toEqual(['rsi','smooth']);/* New RSIs seed the RSI-based MA */
   b.port.update(id,{inputs:{divergence:false}});expect(Object.hasOwn(b.port.list()[0].inputs,'divergence')).toBe(false);// an off request never materializes the key
  }finally{b.close();}
  // template round trip
  let n=0;const saved=JSON.parse(bytes),template=saveIndicatorTemplate(createIndicatorTemplates(),'RSI template',{indicators:saved,scripts:[],rememberSymbol:false,rememberInterval:false,source:null},()=> 'tpl'),copy=instantiateIndicatorTemplate(template.records[0],()=> 'copy-'+ ++n);
  expect(Object.hasOwn(copy.indicators[0].inputs,'divergence')).toBe(false);
  // frozen alert source keeps its identity (no divergence key appears in the captured inputs)
  const settings={id:'rsi-1',kind:'rsi' as const,inputs:{length:14,source:'close'},plots:{},offset:0,visible:true};
  const source=captureIndicatorAlertSource(settings,'rsi','standard','snap');
  expect(Object.hasOwn(source.inputs,'divergence')).toBe(false);
  expect(()=>validateFrozenIndicatorInputs('rsi',{length:14,source:'close'},'rsi')).not.toThrow();
 }finally{a.close();}
});

it('frozen inputs: a divergence plot needs the captured toggle on',()=>{
 expect(()=>validateFrozenIndicatorInputs('rsi',{length:14,source:'close',divergence:true},'divergenceBullish')).not.toThrow();
 expect(()=>validateFrozenIndicatorInputs('rsi',{length:14,source:'close'},'divergenceBullish')).toThrow(/disabled by its captured calculation inputs/);
 expect(()=>validateFrozenIndicatorInputs('rsi',{length:14,source:'close',divergence:false},'divergenceBearish')).toThrow(/disabled/);
});

it('edit rules: turning the toggle off never writes the key for an instance that never had it; a saved true can be switched off explicitly',()=>{
 expect(Object.hasOwn(applyIndicatorInputEdit('rsi',{length:14,source:'close'},{divergence:false}),'divergence')).toBe(false);
 expect(applyIndicatorInputEdit('rsi',{length:14,source:'close'},{divergence:true})).toMatchObject({divergence:true});
 expect(applyIndicatorInputEdit('rsi',{length:14,source:'close',divergence:true},{divergence:false})).toMatchObject({divergence:false});
 expect(()=>validateIndicatorInputs('rsi',{divergence:'yes'},false)).toThrow(/Invalid input type: divergence/);
});

it('the toggle through the port: on adds the two plots, off removes them, the RSI values never change, and serialize/restore keeps it',async()=>{
 const a=await core();
 try{
  const id=a.port.add('rsi',rsiDefaults().inputs,rsiDefaults()),off=JSON.stringify(a.port.values(id).series[0].values);
  a.port.update(id,{inputs:{divergence:true}});
  expect(a.port.list()[0].series.map(row=>row.id)).toEqual(['rsi','smooth','divergenceBullish','divergenceBearish']);// New RSIs seed the RSI-based MA
  expect(JSON.stringify(a.port.values(id).series[0].values)).toBe(off);
  const result=a.port.values(id) as any;expect(result.divergence.segments.length).toBeGreaterThan(0);
  const saved=JSON.parse(JSON.stringify(a.port.serialize()));expect(saved[0].inputs.divergence).toBe(true);
  const b=await core();
  try{b.port.restore(saved);expect(b.port.list()[0].series.map(row=>row.id)).toEqual(['rsi','smooth','divergenceBullish','divergenceBearish']);expect(b.port.serialize()).toEqual(saved);expect(b.port.values(id)).toEqual(a.port.values(id));}finally{b.close();}
  a.port.update(id,{inputs:{divergence:false}});expect(a.port.list()[0].series.map(row=>row.id)).toEqual(['rsi','smooth']);expect(JSON.stringify(a.port.values(id).series[0].values)).toBe(off);
 }finally{a.close();}
});

it('rendering uses the native line path: a straight segment between the two RSI pivots, OpenCandle palette colors, results unchanged',()=>{
 const result=calculateIndicator('rsi',domainBars,{length:14,divergence:true}),before=structuredClone(result);
 const segment=(result as any).divergence.segments[0];
 const series=renderIndicatorSeries('inst','rsi',result,domainBars,{},0);
 expect(series.map(row=>row.title)).toEqual(['RSI','Bullish divergence','Bearish divergence']);
 const bull=series[1].points.map((p:any)=>p.value) as (number|null)[];
 if(segment.kind==='bullish'){
  expect(bull[segment.fromIndex-1]).toBeNull();expect(bull[segment.fromIndex]).toBe(segment.fromRsi);expect(bull[segment.toIndex]).toBe(segment.toRsi);expect(bull[segment.toIndex+1]).toBeNull();
  const mid=segment.fromIndex+1;expect(bull[mid]).toBeCloseTo(segment.fromRsi+(segment.toRsi-segment.fromRsi)/(segment.toIndex-segment.fromIndex),9);
 }
 expect(result).toEqual(before);// display values are never written back to the calculation
 // Palette: divergence lines use the LV histogram jade and coral.
 expect(defaultPlotStyle('rsi','divergenceBullish',4)).toMatchObject({color:'#3fbf8f',width:2,visible:true,lineStyle:'solid',kind:'line'});
 expect(defaultPlotStyle('rsi','divergenceBearish',5)).toMatchObject({color:'#e8605a',width:2,visible:true,lineStyle:'solid',kind:'line'});
 const out=renderIndicatorPresentation({id:'inst',kind:'rsi',inputs:{length:14,source:'close',divergence:true},plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('rsi')},result,domainBars);
 expect(out.diagnostics).toEqual([]);expect(out.output.series!.slice(0,3).map(row=>row.title)).toEqual(['RSI','Bullish divergence','Bearish divergence']);
});
