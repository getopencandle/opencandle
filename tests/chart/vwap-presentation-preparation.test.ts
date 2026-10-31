import {describe,expect,it} from 'vitest';
import type {LineLikeKind,LineLikeSeries} from '@luxalgo/vela';
import type {Bar} from '../../src/domain/types';
import type {IndicatorResult} from '../../src/domain/indicators';
import {VWAP_BAND_DEFAULTS} from '../../src/domain/indicators';
import {defaultIndicatorPresentation,assertIndicatorBatchBudget,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {renderIndicatorPresentation,type IndicatorPresentationContext} from '../../src/chart/indicator-presentation';
import {consumeVwapPresentation,createVwapPresentationPreparation,type PreparedVwapPresentation} from '../../src/chart/vwap-presentation';

const ids=['vwap','upper1','lower1','upper2','lower2','upper3','lower3'];
const settings=():IndicatorInstanceSettings=>({id:'prepared-vwap',kind:'vwap',inputs:{...VWAP_BAND_DEFAULTS,kernelVersion:2,band1Enabled:true,band2Enabled:true,band3Enabled:true},plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('vwap')});
const row=(ordinal:number):Bar=>({time:1700000000+ordinal*60,open:100,high:100,low:100,close:100,volume:1});
function fixture(count=129,saved=settings(),context:IndicatorPresentationContext|undefined={resolution:'1m'},names=ids){
 const bars:Bar[]=[],series=names.map(id=>({id,label:'Literal '+id,values:[] as Array<number|null>}));
 let current=true,callback=()=>{};
 const plan=createVwapPresentationPreparation({settings:saved,context,rows:count,bars,series,assertCurrent(){if(!current)throw Error('literal source retired');callback();}});
 const result:IndicatorResult={id:'vwap',series,diagnostics:['literal retained calculation diagnostic'],policies:['literal retained calculation policy'],plotDiagnostics:{upper1:['literal point-local gap']}};
 const append=(start:number,size:number,value:(plot:number,index:number)=>number|null=(plot,index)=>index===0?null:100+plot)=>{
  for(let index=start;index<start+size;index++)bars.push(row(index));
  for(let plot=0;plot<series.length;plot++)for(let index=start;index<start+size;index++)series[plot].values.push(value(plot,index));
  plan.append(start,size);
 };
 return{plan,bars,series,result,saved,context,append,retireSource(){current=false;},restoreSource(){current=true;},onAssert(next:()=>void){callback=next;},consume(receipt:PreparedVwapPresentation){return consumeVwapPresentation(receipt,{settings:saved,context,result,bars});}};
}

describe('bounded private VWAP native presentation',()=>{
 for(const count of [1,128,129])it(`preserves the complete generic output and distinct point ownership at ${count} rows`,()=>{
  const f=fixture(count);for(let start=0;start<count;start+=128)f.append(start,Math.min(128,count-start));
  const before=structuredClone(f.result),expected=renderIndicatorPresentation(f.saved,f.result,f.bars,f.context),receipt=f.plan.complete(f.result),actual=f.consume(receipt);
  expect(actual).toEqual(expected);expect(f.result).toEqual(before);expect(actual.output.series).toHaveLength(13);expect(actual.output.fills).toHaveLength(3);
  const plots=actual.output.series as LineLikeSeries[];expect(new Set(plots.map(plot=>plot.points)).size).toBe(13);expect(new Set(plots.map(plot=>plot.points.at(-1))).size).toBe(13);
  f.plan.retire();expect(actual).toEqual(expected);expect(()=>f.consume(receipt)).toThrow(/retired|consumed/);
 });
 for(const kind of ['line','area','step','histogram','columns','circles','cross'] as LineLikeKind[])it(`keeps ${kind} style, alpha, endpoint and display metadata exact`,()=>{
  const saved=settings();saved.plots.vwap={...defaultPlotStyle('vwap','vwap',0),kind,color:'rgba(10,20,30,0.5)',opacity:40,trackPrice:true,legend:false,dataWindow:false};saved.plots.upper1={...defaultPlotStyle('vwap','upper1',1),visible:false};saved.presentation!.precision=16;saved.presentation!.fills.band2!.visible=false;
  const f=fixture(2,saved);f.append(0,2,(_plot,index)=>index===0?12:-0);const expected=renderIndicatorPresentation(saved,f.result,f.bars,f.context),actual=f.consume(f.plan.complete(f.result));
  expect(actual).toEqual(expected);expect(actual.output.priceLines).toHaveLength(1);expect(Object.is(actual.output.priceLines![0].price,-0)).toBe(true);expect(actual.display[0].color).toBe('rgba(10,20,30,0.2)');expect(actual.output.series).toHaveLength(11);expect(actual.output.fills).toHaveLength(2);
 });
 it('uses the exact null endpoint without borrowing an earlier finite label or tracking value',()=>{
  const saved=settings();saved.plots.vwap={...defaultPlotStyle('vwap','vwap',0),trackPrice:true};const f=fixture(2,saved);f.append(0,2,()=>null);
  const actual=f.consume(f.plan.complete(f.result));expect(actual).toEqual(renderIndicatorPresentation(saved,f.result,f.bars,f.context));expect(actual.display).toEqual([]);expect(actual.output.priceLines).toEqual([]);
 });
 it('keeps incomplete pair diagnostics and absent-pair fill policy without erasing real gaps',()=>{
  const f=fixture(2,settings(),{resolution:'1m'},['vwap','lower1']);f.append(0,2,(_plot,index)=>index===0?3:null);const actual=f.consume(f.plan.complete(f.result));
  expect(actual).toEqual(renderIndicatorPresentation(f.saved,f.result,f.bars,f.context));expect(actual.output.series).toHaveLength(2);expect(actual.output.fills).toEqual([]);expect(actual.diagnostics).toEqual(['band1 fill is unavailable because its required boundaries are absent or unavailable.']);
 });
 for(const mode of ['hidden','daily','unknown','interval'] as const)it(`retains ${mode} withholding and original early numerical-validation behavior`,()=>{
  const saved=settings();let context:IndicatorPresentationContext|undefined={resolution:'1m'};
  if(mode==='hidden')saved.visible=false;
  if(mode==='daily'||mode==='unknown'){saved.presentation!.hideOnDaily=true;context={resolution:mode==='daily'?'1D':null};}
  if(mode==='interval')saved.presentation!.visibility={schemaVersion:1,mode:'include',intervals:['5m'],ranges:[]};
  const f=fixture(1,saved,context);f.bars.push({...row(0),time:NaN});for(const plot of f.series)plot.values.push(NaN);f.plan.append(0,1);
  const actual=f.consume(f.plan.complete(f.result));expect(actual).toEqual(renderIndicatorPresentation(saved,f.result,f.bars,context));expect(actual.output).toEqual({series:[],fills:[],priceLines:[]});
 });
 it('admits all full-history slots before touching private numerical arrays',()=>{
  const saved=settings();expect(assertIndicatorBatchBudget([saved],60606).numericSlots).toBe(1999998);
  let reads=0;const host={settings:saved,rows:100000,bars:[],series:[],assertCurrent(){}};Object.defineProperty(host,'series',{get(){reads++;throw Error('must not read series before quota');}});
  expect(()=>createVwapPresentationPreparation(host)).toThrow(/local limits/);expect(reads).toBe(0);
 });
 it('rejects nonzero offsets, version1 and empty preparation while the run retains their fallback paths',()=>{
  for(const change of [{offset:1},{offset:-1},{inputs:{...settings().inputs,kernelVersion:1}}])expect(()=>fixture(1,{...settings(),...change})).toThrow(/version2 with zero offset/);
  expect(()=>fixture(0)).toThrow(/row count/);
 });
 it('requires exact chunk bounds and complete result identity',()=>{
  const f=fixture(129);expect(()=>f.plan.append(0,129)).toThrow(/chunk/);expect(()=>f.plan.complete(f.result)).toThrow();
  const g=fixture(129);g.append(0,128);expect(()=>g.plan.complete(g.result)).toThrow(/partial/);expect(()=>g.plan.append(128,1)).toThrow();
  const h=fixture(1);h.append(0,1);expect(()=>h.plan.complete({...h.result,series:[...h.series]})).toThrow(/foreign/);
 });
 it('rejects accessor values without invoking them and permanently retires the candidate',()=>{
  const f=fixture(1);let reads=0;f.bars.push(row(0));for(const plot of f.series)plot.values.push(1);Object.defineProperty(f.series[0].values,'0',{get(){reads++;return 1;}});
  expect(()=>f.plan.append(0,1)).toThrow(/data fields/);expect(reads).toBe(0);expect(()=>f.plan.complete(f.result)).toThrow();
 });
 it('rejects nonfinite values and unsafe coordinates before exposing a completed receipt',()=>{
  const f=fixture(1);expect(()=>f.append(0,1,()=>Infinity)).toThrow(/numerical/);expect(()=>f.plan.complete(f.result)).toThrow();
  const g=fixture(1);g.bars.push({...row(0),time:253402300800});for(const plot of g.series)plot.values.push(1);expect(()=>g.plan.append(0,1)).toThrow(/coordinates/);
 });
 it('foreign receivers and receipt copies cannot consume or retire the genuine preparation',()=>{
  const f=fixture(1);expect(()=>f.plan.append.call({...f.plan},0,1)).toThrow(/Foreign/);expect(()=>f.plan.retire.call({...f.plan})).toThrow(/Foreign/);f.append(0,1);const receipt=f.plan.complete(f.result);
  expect(()=>f.consume({...receipt})).toThrow(/foreign/);expect(f.consume(receipt).output.series).toHaveLength(13);expect(()=>f.consume(receipt)).toThrow(/consumed/);
 });
 for(const change of ['settings','result','bars','context'] as const)it(`refuses mismatched ${change} bindings permanently`,()=>{
  const f=fixture(1);f.append(0,1);const receipt=f.plan.complete(f.result),bindings={settings:f.saved,result:f.result,bars:f.bars,context:f.context};
  if(change==='settings')bindings.settings=structuredClone(f.saved);if(change==='result')bindings.result={...f.result};if(change==='bars')bindings.bars=[...f.bars];if(change==='context')bindings.context={resolution:'5m'};
  expect(()=>consumeVwapPresentation(receipt,bindings)).toThrow(/bindings/);expect(()=>f.consume(receipt)).toThrow(/retired/);
 });
 it('keeps source retirement permanent even after the source callback is restored',()=>{
  const f=fixture(1);f.append(0,1);const receipt=f.plan.complete(f.result);f.retireSource();expect(()=>f.consume(receipt)).toThrow(/source retired/);f.restoreSource();expect(()=>f.consume(receipt)).toThrow(/retired/);
 });
 it('revokes a completed unconsumed receipt when its run is cancelled',()=>{
  const f=fixture(1);f.append(0,1);const receipt=f.plan.complete(f.result);f.plan.retire();expect(()=>f.consume(receipt)).toThrow(/retired/);f.plan.retire();
 });
 it('rejects swallowed reentry and final callback retirement on completion and consumption',()=>{
  const f=fixture(1);f.bars.push(row(0));for(const plot of f.series)plot.values.push(1);let once=true;f.onAssert(()=>{if(once){once=false;try{f.plan.append(0,1);}catch{}}});expect(()=>f.plan.append(0,1)).toThrow(/retired/);
  const g=fixture(1);g.append(0,1);let checks=0;g.onAssert(()=>{if(++checks===2)g.plan.retire();});expect(()=>g.plan.complete(g.result)).toThrow(/retired/);
  const h=fixture(1);h.append(0,1);const receipt=h.plan.complete(h.result);checks=0;h.onAssert(()=>{if(++checks===2)h.plan.retire();});expect(()=>h.consume(receipt)).toThrow(/retired/);expect(()=>h.consume(receipt)).toThrow(/retired/);
 });
 it('rejects accessor resolution without reading it',()=>{
  let reads=0;const context=Object.defineProperty({},'resolution',{get(){reads++;return'1m';},enumerable:true});expect(()=>fixture(1,settings(),context as IndicatorPresentationContext)).toThrow();expect(reads).toBe(0);
 });
});
