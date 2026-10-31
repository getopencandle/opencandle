import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {calculateIndicator,indicatorCalculationWork,indicatorVolumeMaType,VOLUME_MA_TYPES,type IndicatorInputs} from '../../src/domain/indicators';
import {DOMAIN_INDICATORS,indicatorDefaults,indicatorLegacyDefaults,indicatorInputSchema,indicatorActivePlotIds,validateIndicatorInputs,validateIndicatorSettings,validateIndicatorSnapshots,assertIndicatorBatchBudget,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {createIndicatorLibrary,factoryIndicatorDefault,saveIndicatorDefault,restoreIndicatorLibrary,instanceDefaults} from '../../src/ui/indicator-library';
import {createIndicatorTemplates,saveIndicatorTemplate,restoreIndicatorTemplates,instantiateIndicatorTemplate} from '../../src/ui/indicator-templates';
import {captureIndicatorAlertSource,technicalSourceKey,evaluateTechnicalAlertSources,technicalAlertEstimatedWork} from '../../src/domain/technical-alerts';
import {validateTechnicalAlertSource} from '../../src/domain/alert-observation';
import {createFrameFingerprintCalculator} from '../../src/ui/frame-fingerprints';
import type {MultiChartCellState} from '../../src/ui/MultiChartGrid';
import type {Bar} from '../../src/domain/types';

const volumes=[3,9,6,12];
const bars:Bar[]=volumes.map((volume,index)=>({time:1700000000+index*60,open:10,high:12,low:9,close:11,volume}));
const settings=(maType?:string):IndicatorInstanceSettings=>({...factoryIndicatorDefault('volume'),id:'volume-owned',kind:'volume',inputs:{length:3,...(maType===undefined?{}:{maType})}});
const expected={SMA:[null,null,6,9],EMA:[3,6,6,9],WMA:[null,null,6.5,9.5]};

it('matches literal equal, exponential and weighted sums without changing Volume or old defaults',()=>{
 expect(VOLUME_MA_TYPES).toEqual(['SMA','EMA','WMA']);expect(Object.isFrozen(VOLUME_MA_TYPES)).toBe(true);
 expect(indicatorDefaults.volume).toEqual({length:20});expect(indicatorLegacyDefaults.volume).toEqual({length:20});expect(factoryIndicatorDefault('volume').inputs).toEqual({length:20});
 expect(indicatorInputSchema('volume').find(field=>field.key==='maType')).toEqual({key:'maType',title:'Volume MA type',type:'string',defval:'SMA',options:['SMA','EMA','WMA']});
 const legacy=calculateIndicator('volume',bars,{length:3});expect(calculateIndicator('volume',bars,{length:3,maType:'SMA'})).toEqual(legacy);
 for(const maType of VOLUME_MA_TYPES){const result=calculateIndicator('volume',bars,{length:3,maType});expect(result.diagnostics).toEqual([]);expect(result.series.map(row=>row.id)).toEqual(['volume','ma']);expect(result.series[0].values).toEqual(volumes);expect(result.series[1].values).toEqual(expected[maType]);}
});

it('keeps prefix agreement, full-window warmup, first-value EMA and zero-volume semantics explicit',()=>{
 for(const maType of VOLUME_MA_TYPES){
  const full=calculateIndicator('volume',bars,{length:3,maType});
  for(let count=0;count<=bars.length;count++){let futureReads=0;const prefix=new Proxy(bars.slice(0,count),{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key)&&Number(key)>=count){futureReads++;throw Error('Future row read');}return Reflect.get(target,key,receiver);}});expect(calculateIndicator('volume',prefix,{length:3,maType}).series.map(row=>row.values)).toEqual(full.series.map(row=>row.values.slice(0,count)));expect(futureReads).toBe(0);}
  expect(calculateIndicator('volume',bars,{length:1,maType}).series[1].values).toEqual(volumes);
  expect(calculateIndicator('volume',bars.map(row=>({...row,volume:0})),{length:2,maType}).series[1].values).toEqual(maType==='EMA'?[0,0,0,0]:[null,0,0,0]);
 }
 expect(calculateIndicator('volume',bars,{length:7,maType:'EMA'}).series[1].values).toEqual([3,4.5,4.875,6.65625]);
 for(const maType of ['SMA','WMA'])expect(calculateIndicator('volume',bars,{length:7,maType}).series[1].values).toEqual([null,null,null,null]);
});

it('rejects malformed optional values and descriptor tricks before executing accessors',()=>{
 let reads=0;const bad:IndicatorInputs[]=[{maType:undefined},{maType:null},{maType:false},{maType:2},{maType:'ema'},{maType:'VWMA'},{maType:new String('SMA')},{maType:'SMA',extra:true}];
 const hidden={};Object.defineProperty(hidden,'maType',{value:'EMA',enumerable:false});bad.push(hidden);
 const getter={};Object.defineProperty(getter,'maType',{enumerable:true,get(){reads++;return 'EMA';}});bad.push(getter);
 const symbol={maType:'SMA'};Object.defineProperty(symbol,Symbol('hidden'),{value:1});bad.push(symbol);
 for(const input of bad){expect(()=>validateIndicatorInputs('volume',input)).toThrow();const result=calculateIndicator('volume',bars,input);expect(result.series).toEqual([]);expect(result.diagnostics.length).toBe(1);}
 for(const input of bad.filter(input=>!Object.hasOwn(input,'extra'))){expect(()=>indicatorVolumeMaType(input)).toThrow();expect(()=>indicatorActivePlotIds('volume',input)).toThrow();expect(()=>indicatorCalculationWork('volume',4,input)).toThrow();}
 expect(reads).toBe(0);expect(indicatorVolumeMaType({length:3})).toBe('SMA');
 for(const kind of DOMAIN_INDICATORS.filter(kind=>kind!=='volume')){expect(()=>validateIndicatorInputs(kind,{maType:'SMA'})).toThrow();expect(calculateIndicator(kind,bars,{maType:'SMA'}).series).toEqual([]);}
});

it('gaps only the bar with missing volume, refuses a series with no volume, and distinguishes finite WMA overflow from quota failure',()=>{
 // 0.8.1: a missing or negative volume is unavailable at that bar (the obvStep rule), not the whole series.
 for(const maType of VOLUME_MA_TYPES)for(const volume of [undefined,null,NaN,Infinity,-Infinity,-1]){
  const input=bars.map(row=>({...row}));input[1].volume=volume as number;const result=calculateIndicator('volume',input,{length:3,maType});expect(result.diagnostics).toEqual([]);
  expect(result.series[0].values).toEqual([3,null,6,12]);expect(result.series[1].values).toEqual(maType==='EMA'?[3,null,4.5,8.25]:[null,null,null,null]);// windowed MAs gap while the window holds the gap; the EMA skips it
  const none=calculateIndicator('volume',bars.map(row=>({...row,volume:volume as number})),{length:3,maType});expect(none.series).toEqual([]);expect(none.diagnostics).toEqual(['This base indicator requires available nonnegative source volume.']);
 }
 const huge=bars.slice(0,2).map(row=>({...row,volume:1e308})),result=calculateIndicator('volume',huge,{length:2,maType:'WMA'});expect(indicatorCalculationWork('volume',2,{length:2,maType:'WMA'})).toBe(66);expect(result.series).toEqual([]);expect(result.diagnostics[0]).toContain('ma calculation overflowed');expect(result.diagnostics[0]).not.toContain('estimated operations');
});

it('preflights adjacent quota-boundary histories and aggregate hidden chart/alert work before row reads',async()=>{
 // For length 1000: 32*N + 1000*(N-999). Adjacent histories straddle the fixed ceiling.
 expect(indicatorCalculationWork('volume',20347,{length:1000,maType:'WMA'})).toBe(19999104);
 expect(indicatorCalculationWork('volume',20348,{length:1000,maType:'WMA'})).toBe(20000136);
 expect(indicatorCalculationWork('volume',10,{length:100000,maType:'WMA'})).toBe(320);
 let reads=0;const forbidden=Array<Bar>(20348);Object.defineProperty(forbidden,'0',{get(){reads++;throw Error('No rows may be read before quota rejection');}});
 const refused=calculateIndicator('volume',forbidden,{length:1000,maType:'WMA'});expect(refused.series).toEqual([]);expect(refused.diagnostics[0]).toContain('20000136 estimated operations');expect(reads).toBe(0);
 const hidden=settings('WMA');hidden.inputs.length=1000;hidden.visible=false;hidden.plots.ma.visible=false;
 expect(assertIndicatorBatchBudget([hidden,hidden],10000)).toEqual({operations:19122000,numericSlots:120000});expect(()=>assertIndicatorBatchBudget([hidden,hidden,hidden],10000)).toThrow(/batch exceeds/);
 const a=captureIndicatorAlertSource(hidden,'ma','standard','a'),b=captureIndicatorAlertSource({...hidden,id:'other',inputs:{length:1001,maType:'WMA'}},'ma','standard','b');expect(technicalAlertEstimatedWork(15000,[a,b])).toBeGreaterThan(20000000);
 const alertRows=Array<Bar>(15000);Object.defineProperty(alertRows,'0',{get(){reads++;throw Error('Alert quota must precede row validation');}});await expect(evaluateTechnicalAlertSources(alertRows,[a,b],'USD')).rejects.toThrow(/estimated operations/);expect(reads).toBe(0);
});

it('preserves default/template/snapshot omission and explicit choices without normalizing saved data',()=>{
 for(const maType of [undefined,...VOLUME_MA_TYPES]){
  const row=settings(maType),{id:_id,kind:_kind,...defaults}=row;
  const library=restoreIndicatorLibrary(JSON.parse(JSON.stringify(saveIndicatorDefault(createIndicatorLibrary(),'volume',defaults))));expect(instanceDefaults(library,'volume').inputs).toEqual(row.inputs);
  const snapshot={...row,paneId:'study'};validateIndicatorSnapshots([snapshot]);const templates=saveIndicatorTemplate(createIndicatorTemplates(),'Volume type',{indicators:[snapshot],scripts:[],rememberSymbol:false,rememberInterval:false,source:null},()=> 'template');let sequence=0;
  const restored=instantiateIndicatorTemplate(restoreIndicatorTemplates(JSON.parse(JSON.stringify(templates))).records[0],()=> 'new-'+(++sequence));expect(restored.indicators[0].inputs).toEqual(row.inputs);expect(restored.indicators[0].id).not.toBe(row.id);
  const invalid={...row,visible:false,inputs:{...row.inputs,maType:null}};expect(()=>validateIndicatorSettings(invalid)).toThrow();expect(()=>saveIndicatorDefault(library,'volume',{...defaults,inputs:invalid.inputs})).toThrow();expect(instanceDefaults(library,'volume').inputs).toEqual(row.inputs);
 }
});

it('keeps historical SMA descriptor bytes and binds only explicit alternative calculations',async()=>{
 const fingerprint=createFrameFingerprintCalculator(),row=settings(),cell={indicators:[{...row,paneId:'study'}],comparisons:[],scriptBindings:[]} as unknown as MultiChartCellState;
 const literal=[1,'built','volume',[['length',3]],0,[['ma','line'],['volume','columns']]],oldHash='sha256:'+createHash('sha256').update(JSON.stringify(literal)).digest('hex');
 const before=await fingerprint(cell,[]);expect(before['["built","volume-owned"]']).toBe(oldHash);
 const explicit={...cell,indicators:[{...row,inputs:{length:3,maType:'SMA'},paneId:'study'}]};expect(await fingerprint(explicit,[])).toEqual(before);
 for(const maType of ['EMA','WMA']){const changed={...cell,indicators:[{...row,inputs:{length:3,maType},paneId:'study'}]};const descriptor=[1,'built','volume',[['length',3],['maType',maType]],0,[['ma','line'],['volume','columns']]];expect((await fingerprint(changed,[]))['["built","volume-owned"]']).toBe('sha256:'+createHash('sha256').update(JSON.stringify(descriptor)).digest('hex'));}
});

it('canonicalizes only new SMA captures and keeps frozen alternative type/source values isolated',async()=>{
 const row=settings(),legacy=captureIndicatorAlertSource(row,'ma','standard','snapshot'),key=technicalSourceKey(legacy);expect(legacy.inputs).toEqual({length:3});
 expect(technicalSourceKey(captureIndicatorAlertSource(settings('SMA'),'ma','standard','snapshot'))).toBe(key);
 const frozen=VOLUME_MA_TYPES.map(maType=>captureIndicatorAlertSource(settings(maType),'ma','standard','snapshot'));
 expect(new Set(frozen.map(technicalSourceKey)).size).toBe(3);row.inputs.maType='EMA';
 const evaluated=await evaluateTechnicalAlertSources(bars,frozen,'USD');expect(frozen.map(source=>evaluated.results.get(technicalSourceKey(source))!.sample.value)).toEqual([9,9,9.5]);
 const explicitSaved={...legacy,inputs:{length:3,maType:'SMA'}},serialized=JSON.stringify(explicitSaved);validateTechnicalAlertSource(explicitSaved);expect(JSON.stringify(explicitSaved)).toBe(serialized);expect(Object.hasOwn(explicitSaved.inputs,'maType')).toBe(true);
 const prefix=await evaluateTechnicalAlertSources(bars.slice(0,2),frozen,'USD');expect(frozen.map(source=>prefix.results.get(technicalSourceKey(source))!.sample.value)).toEqual([null,6,null]);expect(legacy.inputs).toEqual({length:3});
});
