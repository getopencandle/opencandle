import {expect,it} from 'vitest';
import {indicatorIntervalVisibility,makeIndicatorIntervalVisibility,validateIndicatorIntervalVisibility,INDICATOR_VISIBILITY_UNITS,INDICATOR_VISIBILITY_RANGE_BOUNDS,type IndicatorIntervalVisibility,type IndicatorVisibilityRange} from '../../src/chart/indicator-visibility';
import {DOMAIN_INDICATORS,defaultIndicatorPresentation,validateIndicatorPresentation,validateIndicatorSettings,validateIndicatorSnapshots,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {createIndicatorLibrary,factoryIndicatorDefault,instanceDefaults,restoreIndicatorLibrary,saveIndicatorDefault,validateIndicatorDefault} from '../../src/ui/indicator-library';
import {createIndicatorTemplates,saveIndicatorTemplate,restoreIndicatorTemplates,instantiateIndicatorTemplate} from '../../src/ui/indicator-templates';
import {calculateIndicator} from '../../src/domain/indicators';
import {captureIndicatorAlertSource,technicalSourceKey,evaluateTechnicalAlertSources} from '../../src/domain/technical-alerts';
import {createFrameFingerprintCalculator} from '../../src/ui/frame-fingerprints';
import type {MultiChartCellState} from '../../src/ui/MultiChartGrid';

const rule=(mode:IndicatorIntervalVisibility['mode']='include',intervals:string[]=['1m'],ranges:IndicatorVisibilityRange[]=[]):IndicatorIntervalVisibility=>({schemaVersion:1,mode,intervals,ranges});
const bars=Array.from({length:40},(_,i)=>({time:1700000000+i*60,open:10+i,high:12+i,low:9+i,close:11+i,volume:i+1}));

it('matches literal inclusive ranges without converting calendar or event families',()=>{
 const value=rule('include',['12M','1m','100T'],[{unit:'minute',min:60,max:120},{unit:'day',min:2,max:3},{unit:'range',min:10,max:100}]);
 for(const interval of ['1m','60m','90m','120m','2D','3D','12M','100T','10R','100R'])expect(indicatorIntervalVisibility(value,interval).visible,interval).toBe(true);
 for(const interval of ['59m','121m','1440m','1D','4D','1W','1M','10T','1000T','1R','1000R'])expect(indicatorIntervalVisibility(value,interval).visible,interval).toBe(false);
 expect(indicatorIntervalVisibility(rule('include',['1M']),'1m').visible).toBe(false);
 expect(indicatorIntervalVisibility(rule('exclude',['1m'],[{unit:'week',min:1,max:2}]),'2W').visible).toBe(false);
 expect(indicatorIntervalVisibility(rule('exclude',['1m'],[{unit:'week',min:1,max:2}]),'3W').visible).toBe(true);
});

it('defines absent/all and empty include/exclude without inventing an unknown resolution',()=>{
 expect(indicatorIntervalVisibility(undefined,null)).toEqual({visible:true,reason:'all'});
 expect(indicatorIntervalVisibility(rule('all'),null)).toEqual({visible:true,reason:'all'});
 expect(indicatorIntervalVisibility(rule('include',[]),'1D').visible).toBe(false);
 expect(indicatorIntervalVisibility(rule('exclude',[]),'1D').visible).toBe(true);
 for(const resolution of [undefined,null,'','1Y','2T'])for(const mode of ['include','exclude'] as const){const result=indicatorIntervalVisibility(rule(mode,[]),resolution);expect(result.visible).toBe(false);expect(result.reason).toBe('unavailable');expect(result.diagnostic).toMatch(/withheld/);expect(result.diagnostic!.length).toBeLessThan(500);}
 expect(indicatorIntervalVisibility(rule('include',['60m']),'1h').visible).toBe(true);expect(indicatorIntervalVisibility(rule('include',['1D']),'1d').visible).toBe(true);
});

it('canonicalizes only explicit editor aliases and rejects duplicates after normalization',()=>{
 expect(makeIndicatorIntervalVisibility('include',['1h','2.5h','day','1m','1M'],[]).intervals).toEqual(['60m','150m','1D','1m','1M']);
 expect(()=>makeIndicatorIntervalVisibility('include',['1h','60m'],[])).toThrow(/unique canonical/);
 for(const id of ['1h','day','1d',' 1m ',''])expect(()=>validateIndicatorIntervalVisibility(rule('all',[id]))).toThrow();
 expect(()=>makeIndicatorIntervalVisibility('include',['1m','','2m'],[])).toThrow();
});

it('shares exact endpoint admission including sparse second and event labels',()=>{
 const ranges=INDICATOR_VISIBILITY_UNITS.map(unit=>({unit,...INDICATOR_VISIBILITY_RANGE_BOUNDS[unit]}));
 expect(validateIndicatorIntervalVisibility(rule('all',[],ranges)).ranges).toEqual(ranges);
 for(const range of [{unit:'second',min:2,max:5},{unit:'second',min:1,max:60},{unit:'minute',min:1,max:1441},{unit:'day',min:1,max:366},{unit:'week',min:1,max:53},{unit:'month',min:1,max:13},{unit:'tick',min:2,max:10},{unit:'range',min:1,max:1001},{unit:'minute',min:10,max:1},{unit:'minute',min:1.5,max:2}])expect(()=>validateIndicatorIntervalVisibility(rule('all',[],[range as IndicatorVisibilityRange]))).toThrow();
 expect(()=>validateIndicatorIntervalVisibility(rule('all',[],[{unit:'day',min:1,max:2},{unit:'day',min:3,max:4}]))).toThrow(/one supported/);
});

it('rejects malformed dormant rules and exact own-field violations without invoking getters',()=>{
 let reads=0;const getter={get mode(){reads++;return 'all';}};
 const malformed:unknown[]=[null,undefined,{}, {...rule(),schemaVersion:2},{...rule(),mode:1},{...rule(),extra:true},Object.assign(Object.create({mode:'all'}),rule()),{...rule(),intervals:Array(1)},{...rule(),ranges:[{unit:'minute',min:1,max:2,extra:1}]},{...rule(),intervals:Array.from({length:101},(_,i)=>(i+1)+'m')},{...rule(),mode:'all',intervals:['1m','1m']}];
 const hidden=rule();Object.defineProperty(hidden,'mode',{value:'all',enumerable:false});malformed.push(hidden);
 const accessor=rule();Object.defineProperty(accessor,'mode',Object.getOwnPropertyDescriptor(getter,'mode')!);malformed.push(accessor);
 const indexed=rule();Object.defineProperty(indexed.intervals,'0',{enumerable:true,get(){reads++;return '1m';}});malformed.push(indexed);
 const serialized=rule();Object.defineProperty(serialized.ranges,'toJSON',{enumerable:false,get(){reads++;return ()=>[];}});malformed.push(serialized);
 const symbol=rule();Object.defineProperty(symbol,Symbol('unknown'),{value:1});malformed.push(symbol);
 const subclass=rule();Object.setPrototypeOf(subclass.intervals,Object.create(Array.prototype));malformed.push(subclass);
 for(const value of malformed)expect(()=>validateIndicatorIntervalVisibility(value)).toThrow();expect(reads).toBe(0);
 for(const kind of DOMAIN_INDICATORS){expect(()=>validateIndicatorPresentation(kind,{...defaultIndicatorPresentation(kind),visibility:null})).toThrow();expect(()=>validateIndicatorPresentation(kind,{...defaultIndicatorPresentation(kind),visibility:undefined})).toThrow();}
});

it('returns detached rules and preserves absent settings across defaults, snapshots and templates',()=>{
 const original=rule('include',['1m'],[{unit:'minute',min:5,max:60}]),checked=validateIndicatorIntervalVisibility(original);original.intervals[0]='1D';original.ranges[0].min=10;expect(checked).toEqual(rule('include',['1m'],[{unit:'minute',min:5,max:60}]));
 for(const kind of DOMAIN_INDICATORS){
  const factory=factoryIndicatorDefault(kind);expect(Object.hasOwn(factory.presentation!,'visibility')).toBe(false);factory.presentation!.visibility=checked;
  const saved=restoreIndicatorLibrary(JSON.parse(JSON.stringify(saveIndicatorDefault(createIndicatorLibrary(),kind,factory)))),defaults=instanceDefaults(saved,kind);expect(defaults.presentation!.visibility).toEqual(checked);defaults.presentation!.visibility!.intervals[0]='1D';expect(instanceDefaults(saved,kind).presentation!.visibility).toEqual(checked);
  const row={...factory,id:'owned-'+kind,kind,paneId:'study'};validateIndicatorSnapshots([row]);const library=saveIndicatorTemplate(createIndicatorTemplates(),'Intervals '+kind,{indicators:[row],scripts:[],rememberSymbol:false,rememberInterval:false,source:null},()=> 'template-'+kind);let next=0;
  const restored=instantiateIndicatorTemplate(restoreIndicatorTemplates(JSON.parse(JSON.stringify(library))).records[0],()=> 'new-'+(++next));expect(restored.indicators[0].presentation!.visibility).toEqual(checked);expect(restored.indicators[0].id).not.toBe(row.id);
  const legacy={...factory};delete legacy.presentation;const legacySaved=saveIndicatorDefault(createIndicatorLibrary(),kind,legacy);expect(Object.hasOwn(instanceDefaults(legacySaved,kind),'presentation')).toBe(false);
  expect(()=>validateIndicatorDefault(kind,{...factory,visibility:checked})).toThrow();
 }
});

it('retains every numeric plot and frozen alert identity while visibility changes',async()=>{
 const captures=[];const expected=new Map<string,number|null>();
 for(const kind of DOMAIN_INDICATORS){
  const settings:IndicatorInstanceSettings={...factoryIndicatorDefault(kind),id:'instance-'+kind,kind},result=calculateIndicator(kind,bars,settings.inputs),before=structuredClone(result);const plot=result.series[0].id;
  const source=captureIndicatorAlertSource(settings,plot,'standard','same-snapshot'),key=technicalSourceKey(source);captures.push(source);expected.set(key,result.series[0].values.at(-1)!);
  settings.presentation!.visibility=rule('include',[]);validateIndicatorSettings(settings);expect(technicalSourceKey(captureIndicatorAlertSource(settings,plot,'standard','same-snapshot'))).toBe(key);expect(calculateIndicator(kind,bars,settings.inputs)).toEqual(before);
 }
 const evaluated=await evaluateTechnicalAlertSources(bars,captures,'USD');for(const [key,value]of expected)expect(evaluated.results.get(key)?.sample.value).toBe(value);
});

it('keeps portable historical calculation fingerprints unchanged for all ten presentation-only rules',async()=>{
 const indicators=DOMAIN_INDICATORS.map(kind=>({...factoryIndicatorDefault(kind),id:'instance-'+kind,kind,paneId:'price'}));
 const cell={indicators,comparisons:[],scriptBindings:[]} as unknown as MultiChartCellState;const fingerprint=createFrameFingerprintCalculator(),before=await fingerprint(cell,[]);
 const changed={...cell,indicators:indicators.map(row=>({...row,presentation:{...row.presentation!,visibility:rule('exclude',['1m'])}}))};expect(await fingerprint(changed,[])).toEqual(before);
 const malformed={...changed,indicators:changed.indicators.map((row,index)=>index===0?{...row,presentation:{...row.presentation,visibility:rule('all',['invalid'])}}:row)};await expect(fingerprint(malformed,[])).rejects.toThrow();
});
