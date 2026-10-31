import {describe,it,expect} from 'vitest';
import {calculateIndicator,indicatorActivePlotIds} from '../../src/domain/indicators';
import {assertIndicatorBatchBudget,defaultIndicatorPresentation,indicatorEstimatedSlots,validateFrozenIndicatorInputs,validateIndicatorInputs,validateIndicatorPresentation,validateIndicatorSettings} from '../../src/chart/indicator-settings';
import {validateTechnicalAlertSource,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {evaluateTechnicalAlertSources,technicalSourceKey} from '../../src/domain/technical-alerts';
import type {Bar} from '../../src/domain/types';
import {createIndicatorLibrary,factoryIndicatorDefault,instanceDefaults,restoreIndicatorLibrary,saveIndicatorDefault} from '../../src/ui/indicator-library';
import {createIndicatorTemplates,saveIndicatorTemplate,restoreIndicatorTemplates,instantiateIndicatorTemplate} from '../../src/ui/indicator-templates';
import {restoreScriptBindings} from '../../src/ui/script-library';
import {createScriptPort,renderScriptPlots} from '../../src/chart/script-port';

const bars=(closes:number[],volumes=closes.map(()=>1)):Bar[]=>closes.map((close,i)=>({time:1700000000+i*60,open:close,high:close+1,low:close-1,close,volume:volumes[i]}));
const values=(kind:string,rows:Bar[],inputs:Record<string,unknown>,id:string)=>calculateIndicator(kind,rows,inputs).series.find(row=>row.id===id)!.values;
const close=(actual:(number|null)[],expected:(number|null)[])=>{expect(actual).toHaveLength(expected.length);actual.forEach((value,i)=>expected[i]===null?expect(value).toBeNull():expect(value).toBeCloseTo(expected[i]!,10));};
const style={visible:true,color:'#123456',width:1,lineStyle:'solid' as const,kind:'line' as const,priceScale:true,legend:true,dataWindow:true};
describe('additional indicator controls: independent rational oracles',()=>{
 it('smooths the unshifted base and computes its population-deviation bands',()=>{
  const rows=bars([2,4,8,10]),r=calculateIndicator('sma',rows,{length:2,smoothingType:'SMA+BB',smoothingLength:2,smoothingMultiplier:2});expect(r.diagnostics).toEqual([]);
  close(r.series[0].values,[null,3,6,9]);close(r.series[1].values,[null,null,4.5,7.5]);close(r.series[2].values,[null,null,7.5,10.5]);close(r.series[3].values,[null,null,1.5,4.5]);
 });
 it('covers EMA, Wilder, weighted and volume-weighted smoothing using original fractions',()=>{
  const rows=bars([2,4,8,10],[1,3,2,4]);
  for(const [type,expected] of [['EMA',[2,10/3,58/9,238/27]],['RMA',[null,3,11/2,31/4]],['WMA',[null,10/3,20/3,28/3]],['VWMA',[null,7/2,28/5,28/3]]] as const)close(values('sma',rows,{length:1,smoothingType:type,smoothingLength:2},'smooth'),[...expected]);
  expect(indicatorActivePlotIds('sma',{smoothingType:'None'})).toEqual(['sma']);expect(indicatorActivePlotIds('rsi',{smoothingType:'SMA+BB'})).toEqual(['rsi','smooth','smoothUpper','smoothLower']);
 });
 it('preserves RSI and OBV base values when smoothing is enabled',()=>{
  const rsiRows=bars([10,11,13,12,14,13]);close(values('rsi',rsiRows,{length:3,smoothingType:'SMA',smoothingLength:2},'rsi'),[null,null,null,75,600/7,2400/37]);
  const obv=calculateIndicator('obv',bars([10,11,11,9],[100,20,30,40]),{smoothingType:'SMA',smoothingLength:2});close(obv.series[0].values,[0,20,20,-20]);close(obv.series[1].values,[null,10,20,0]);
 });
 it('keeps a base result when smoothing volume is unavailable, and never invents zero-volume values',()=>{
  const rows=bars([2,4,8],[1,NaN,3]),r=calculateIndicator('sma',rows,{length:1,smoothingType:'VWMA',smoothingLength:2});expect(r.diagnostics).toEqual([]);expect(r.series[0].values).toEqual([2,4,8]);expect(r.series[1].values).toEqual([null,null,null]);expect(r.plotDiagnostics?.smooth[0]).toMatch(/volume/);
  expect(values('sma',bars([2,4,8],[0,0,0]),{length:1,smoothingType:'VWMA',smoothingLength:2},'smooth')).toEqual([null,null,null]);
  expect(calculateIndicator('obv',rows,{smoothingType:'SMA'}).diagnostics[0]).toMatch(/volume/);
  const overflow=calculateIndicator('sma',bars([1e307,2e307],[100,100]),{length:1,smoothingType:'VWMA',smoothingLength:2});expect(overflow.series[0].values.map(value=>value!/1e307)).toEqual([expect.closeTo(1,12),expect.closeTo(2,12)]);expect(overflow.series[1].values).toEqual([null,null]);expect(overflow.plotDiagnostics?.smooth[0]).toMatch(/overflow/);
 });
 it('does not access a future tail and every prefix agrees with its own full-history prefix',()=>{
  const all=bars([2,4,8,10,7,14]);const inputs={length:2,smoothingType:'SMA+BB',smoothingLength:2,smoothingMultiplier:2};const full=calculateIndicator('sma',all,inputs);
  for(let n=1;n<=all.length;n++){const prefix=calculateIndicator('sma',all.slice(0,n),inputs);prefix.series.forEach((plot,i)=>expect(plot.values).toEqual(full.series[i].values.slice(0,n)));}
  let reads=0;Object.defineProperty(all,6,{get(){reads++;throw new Error('future');}});calculateIndicator('sma',all.slice(0,4),inputs);expect(reads).toBe(0);
 });
 it('validates inactive controls and strictly rejects unsupported numeric presentation precision',()=>{
  for(const inputs of [{smoothingType:'None',smoothingLength:0},{smoothingType:'None',smoothingMultiplier:NaN},{smoothingType:'SMA',smoothingLength:1.5},{smoothingType:'UNKNOWN'}])expect(()=>validateIndicatorInputs('sma',inputs)).toThrow();
  expect(()=>validateIndicatorInputs('sma',{smoothingType:'None',smoothingLength:100000,smoothingMultiplier:0})).not.toThrow();
  const presentation=defaultIndicatorPresentation('rsi');expect(()=>validateIndicatorPresentation('rsi',presentation)).not.toThrow();expect(()=>validateIndicatorPresentation('rsi',{...presentation,precision:17})).toThrow(/precision/);
  expect(()=>validateIndicatorPresentation('ema',presentation)).toThrow(/guide/);expect(()=>validateIndicatorPresentation('macd',{...defaultIndicatorPresentation('macd'),guides:{zero:{...presentation.guides.upper,value:1}}})).toThrow();
 });
 it('rejects hidden/accessor settings before reading or copying them',()=>{
  let reads=0;const presentation={...defaultIndicatorPresentation('rsi'),get toJSON(){reads++;return ()=>({});}};expect(()=>validateIndicatorPresentation('rsi',presentation)).toThrow();
  const hidden=defaultIndicatorPresentation('rsi');Object.defineProperty(hidden,'precision',{value:'auto',enumerable:false});expect(()=>validateIndicatorPresentation('rsi',hidden)).toThrow();
  expect(()=>validateIndicatorSettings({id:'one',kind:'sma',inputs:{length:1},plots:{sma:{...style,get opacity(){reads++;return 10;}}},offset:0,visible:true})).toThrow();expect(reads).toBe(0);
 });
 it('pins exact aggregate numeric-slot boundaries before any output is allocated',()=>{
  const inputs={length:1,smoothingType:'SMA+BB',smoothingLength:1,smoothingMultiplier:2},items=[{kind:'sma' as const,inputs,presentation:defaultIndicatorPresentation('sma')},{kind:'sma' as const,inputs},{kind:'sma' as const,inputs}];
  expect(indicatorEstimatedSlots('sma',50000,inputs,items[0].presentation)).toBe(800000);expect(items.reduce((sum,item)=>sum+indicatorEstimatedSlots(item.kind,50000,item.inputs,item.presentation),0)).toBe(2000000);
  // The repaired SMA work estimate now rejects this old slot-only boundary first.
  expect(()=>assertIndicatorBatchBudget(items,50000)).toThrow(/estimated operations/);
  const slotBoundary=Array.from({length:8},()=>({kind:'ema' as const,inputs:{length:1},offset:65000}));
  expect(assertIndicatorBatchBudget(slotBoundary,40000).numericSlots).toBe(2000000);
  expect(()=>assertIndicatorBatchBudget([{...slotBoundary[0],plots:{ema:{...style,trackPrice:true}}},...slotBoundary.slice(1)],40000)).toThrow(/2000001\/2000000/);
  expect(()=>assertIndicatorBatchBudget([{kind:'sma',inputs:{length:1,smoothingType:'WMA',smoothingLength:50000}}],100000)).toThrow(/operations/);
  expect(indicatorEstimatedSlots('sma',1,{length:1},undefined,'render',{},100000)).toBe(200003);
  expect(indicatorEstimatedSlots('sma',1,{length:1},undefined,'calculation',{},100000)).toBe(1);
  expect(()=>assertIndicatorBatchBudget(Array.from({length:10},()=>({kind:'sma' as const,inputs:{length:1},offset:100000})),1)).toThrow(/numeric slots/);
 });
 it('preserves legacy frozen identity while rejecting partially upgraded and disabled plot tuples',async()=>{
  const source:AlertSourceSnapshot={kind:'indicator',indicator:'sma',instanceId:'one',snapshotId:'old',plotId:'sma',inputs:{length:2,source:'close'},inputBasis:'standard-ohlc',transformId:'standard'};
  const serialized=JSON.stringify(source),key=technicalSourceKey(source);validateTechnicalAlertSource(source);expect(JSON.stringify(source)).toBe(serialized);
  expect(()=>validateFrozenIndicatorInputs('sma',{length:2,source:'close',smoothingType:'SMA'},'sma')).toThrow(/explicitly/);expect(()=>validateFrozenIndicatorInputs('sma',{length:2,source:'close'},'smooth')).toThrow(/disabled/);
  const result=await evaluateTechnicalAlertSources(bars([2,4,8]),[source],'USD');expect(result.results.get(key)?.sample.value).toBe(6);expect(JSON.stringify(source)).toBe(serialized);
 });
 it('keeps missing add-on diagnostics local to the selected frozen plot',async()=>{
  const base:AlertSourceSnapshot={kind:'indicator',indicator:'sma',instanceId:'one',snapshotId:'new',plotId:'sma',inputs:{length:1,source:'close',smoothingType:'VWMA',smoothingLength:2,smoothingMultiplier:2},inputBasis:'standard-ohlc',transformId:'standard'};
  const addon={...base,plotId:'smooth'};const result=await evaluateTechnicalAlertSources(bars([2,4,8],[1,NaN,2]),[base,addon],'USD');expect(result.results.get(technicalSourceKey(base))?.sample.value).toBe(8);expect(result.results.get(technicalSourceKey(base))?.diagnostics).toEqual([]);expect(result.results.get(technicalSourceKey(addon))?.sample.value).toBeNull();expect(result.results.get(technicalSourceKey(addon))?.diagnostics[0]).toMatch(/volume/);
 });
 it('copies optional presentation through defaults and templates without assigning ownership or upgrading legacy omission',()=>{
  const factory=factoryIndicatorDefault('rsi');factory.inputs.smoothingType='SMA+BB';factory.plots.rsi.opacity=21;factory.plots.rsi.trackPrice=true;factory.presentation!.guides.upper!.value=72;factory.presentation!.fills.band!.opacity=31;
  const saved=restoreIndicatorLibrary(JSON.parse(JSON.stringify(saveIndicatorDefault(createIndicatorLibrary(),'rsi',factory))));const first=instanceDefaults(saved,'rsi');expect(first).toEqual(factory);first.presentation!.guides.upper!.value=90;expect(instanceDefaults(saved,'rsi').presentation!.guides.upper!.value).toBe(72);
  const row={...factory,id:'original',kind:'rsi' as const,paneId:'oscillator'},library=saveIndicatorTemplate(createIndicatorTemplates(),'Presentation',{indicators:[row],scripts:[],rememberSymbol:false,rememberInterval:false,source:null},()=> 'template');let sequence=0;const result=instantiateIndicatorTemplate(restoreIndicatorTemplates(JSON.parse(JSON.stringify(library))).records[0],()=> 'fresh-'+(++sequence));expect(result.indicators[0].presentation).toEqual(factory.presentation);expect(result.indicators[0].plots).toEqual(factory.plots);expect(result.indicators[0].id).not.toBe(row.id);expect(result.indicators[0].paneId).not.toBe(row.paneId);
  const legacy={inputs:{length:9,source:'close'},plots:{sma:style},offset:0,visible:true};const old=saveIndicatorDefault(createIndicatorLibrary(),'sma',legacy);expect(Object.hasOwn(instanceDefaults(old,'sma'),'presentation')).toBe(false);expect(instanceDefaults(old,'sma').inputs).toEqual(legacy.inputs);
 });
 it('rejects unsupported built-in-only plot presentation on script bindings rather than ignoring it',()=>{
  const binding={id:'script',name:'Example',source:'ctx.plot("close",ctx.bar.close);',pane:'price',documentId:'document',version:1,visible:true,plots:{value:style}};expect(restoreScriptBindings([binding])).toHaveLength(1);
  for(const extra of [{opacity:50},{trackPrice:false}])expect(()=>restoreScriptBindings([{...binding,plots:{value:{...style,...extra}}}])).toThrow(/unsupported/);
  for(const extra of [{opacity:50},{trackPrice:false}])expect(()=>renderScriptPlots('script',[{id:'value',title:'Value',color:'#123456',values:[{time:1,value:2}]}],{value:{...style,...extra}},1)).toThrow(/unsupported/);
  let nativeCalls=0;const port=createScriptPort({addNativeIndicator(){nativeCalls++;throw new Error('Unexpected native mutation');}} as any);for(const extra of [{opacity:50},{trackPrice:false}]){const plots={value:{...style,...extra}};expect(()=>port.add({plots:[]},{plots})).toThrow(/unsupported/);expect(()=>port.style('missing',plots)).toThrow(/unsupported/);expect(()=>port.replaceStyles('missing',plots)).toThrow(/unsupported/);}expect(nativeCalls).toBe(0);port.dispose();
 });
});
