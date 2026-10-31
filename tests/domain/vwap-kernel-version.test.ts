import {expect,it} from 'vitest';
import {calculateIndicator,indicatorCalculationWork,indicatorVwapKernelVersion,VWAP_BAND_DEFAULTS,type IndicatorInputs} from '../../src/domain/indicators';
import {DOMAIN_INDICATORS,indicatorDefaults,indicatorLegacyDefaults,indicatorEstimatedSlots,validateIndicatorInputs,validateIndicatorSettings,validateIndicatorSnapshots,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {captureIndicatorAlertSource,technicalSourceKey} from '../../src/domain/technical-alerts';
import {validateTechnicalAlertSource} from '../../src/domain/alert-observation';
import {effectiveVwapSettings} from '../../src/vwap/settings';
import {createIndicatorLibrary,factoryIndicatorDefault,instanceDefaults,restoreIndicatorLibrary,saveIndicatorDefault} from '../../src/ui/indicator-library';
import {createIndicatorTemplates,instantiateIndicatorTemplate,restoreIndicatorTemplates,saveIndicatorTemplate} from '../../src/ui/indicator-templates';
import type {Bar} from '../../src/domain/types';

const bars:Bar[]=[{time:1000,open:10,high:10,low:10,close:10,volume:1},{time:1001,open:20,high:20,low:20,close:20,volume:3}];
const settings=(version?:number):IndicatorInstanceSettings=>({id:'vwap-owned',kind:'vwap',inputs:{source:'close',anchor:'Century',timezone:'UTC',...(version===undefined?{}:{kernelVersion:version})},plots:{},offset:0,visible:true});

it('preserves omitted and explicit v1 arithmetic and unchanged factory/default bytes',()=>{
 const before=calculateIndicator('vwap',bars,settings().inputs),explicit=calculateIndicator('vwap',bars,settings(1).inputs);
 expect(before).toEqual(explicit);expect(before.series[0].values).toEqual([10,17.5]);
 expect(indicatorLegacyDefaults.vwap).toEqual({anchor:'Session',timezone:'UTC',source:'hlc3'});
 expect(indicatorDefaults.vwap).toEqual({anchor:'Session',timezone:'UTC',source:'hlc3',...VWAP_BAND_DEFAULTS});
 expect(factoryIndicatorDefault('vwap').inputs).not.toHaveProperty('kernelVersion');
 expect(indicatorVwapKernelVersion({})).toBe(1);expect(indicatorVwapKernelVersion({kernelVersion:1})).toBe(1);expect(indicatorVwapKernelVersion({kernelVersion:2})).toBe(2);
});

it('rejects malformed versions, hidden/accessor settings and non-VWAP versions without executing getters',()=>{
 let reads=0;const getter={};Object.defineProperty(getter,'kernelVersion',{enumerable:true,get(){reads++;return 2;}});
 const hidden={};Object.defineProperty(hidden,'kernelVersion',{value:2});
 for(const inputs of [getter,hidden,{kernelVersion:null},{kernelVersion:undefined},{kernelVersion:'2'},{kernelVersion:0},{kernelVersion:3},{kernelVersion:1.5},{kernelVersion:NaN}] as IndicatorInputs[]){
  expect(()=>validateIndicatorInputs('vwap',inputs)).toThrow();expect(()=>indicatorVwapKernelVersion(inputs)).toThrow();
 }
 expect(reads).toBe(0);
 for(const kind of DOMAIN_INDICATORS.filter(kind=>kind!=='vwap')){expect(()=>validateIndicatorInputs(kind,{kernelVersion:2})).toThrow();expect(calculateIndicator(kind,bars,{kernelVersion:2}).series).toEqual([]);}
});

it('refuses v2 inline calculation before inspecting the supplied bar array',()=>{
 let reads=0;const forbidden=new Proxy([] as Bar[],{get(){reads++;throw Error('No inline row access');}});
 const result=calculateIndicator('vwap',forbidden,settings(2).inputs);expect(result.series).toEqual([]);expect(result.diagnostics).toEqual(['VWAP kernel 2 requires the owned asynchronous worker service; no synchronous or legacy fallback was run.']);expect(reads).toBe(0);
});

it('maps exact worker settings once without rewriting saved fields or transform aliases',()=>{
 const inputs={...settings(2).inputs,...VWAP_BAND_DEFAULTS,band2Enabled:true,band2Multiplier:0},before=JSON.stringify(inputs);
 expect(effectiveVwapSettings(inputs,'heikinashi')).toEqual({kernelVersion:2,source:'close',anchor:'Century',timezone:'UTC',transform:'heikin-ashi',...VWAP_BAND_DEFAULTS,band2Enabled:true,band2Multiplier:0});
 expect(effectiveVwapSettings({kernelVersion:2},'standard')).toEqual({kernelVersion:2,source:'hlc3',anchor:'Session',timezone:'UTC',transform:'standard',...VWAP_BAND_DEFAULTS});
 expect(JSON.stringify(inputs)).toBe(before);expect(()=>effectiveVwapSettings(settings(1).inputs,'standard')).toThrow(/explicit kernel version 2/);expect(()=>effectiveVwapSettings(inputs,'other' as never)).toThrow(/transform/);
});

it('charges bounded v2 host work while retaining all output slots and v1 work estimates',()=>{
 const all={...settings(2).inputs,...VWAP_BAND_DEFAULTS,band1Enabled:true,band2Enabled:true,band3Enabled:true};
 expect(indicatorCalculationWork('vwap',100000,all)).toBe(6400000);
 expect(indicatorCalculationWork('vwap',100000,{...all,kernelVersion:1})).toBe(32400000);
 expect(indicatorEstimatedSlots('vwap',100000,all,undefined,'calculation')).toBe(700000);
 expect(indicatorEstimatedSlots('vwap',100000,all)).toBe(2100000);
});

it('preserves omission and explicit versions through defaults, snapshots and templates',()=>{
 for(const version of [undefined,1,2]){
  const row=settings(version),{id:_id,kind:_kind,...defaults}=row;
  const library=restoreIndicatorLibrary(JSON.parse(JSON.stringify(saveIndicatorDefault(createIndicatorLibrary(),'vwap',defaults))));expect(instanceDefaults(library,'vwap').inputs).toEqual(row.inputs);
  const snapshot={...row,paneId:'price'};validateIndicatorSnapshots([snapshot]);
  const templates=saveIndicatorTemplate(createIndicatorTemplates(),'VWAP version',{indicators:[snapshot],scripts:[],rememberSymbol:false,rememberInterval:false,source:null},()=> 'template');
  const restored=instantiateIndicatorTemplate(restoreIndicatorTemplates(JSON.parse(JSON.stringify(templates))).records[0],()=> 'new-instance');expect(restored.indicators[0].inputs).toEqual(row.inputs);
  expect(()=>validateIndicatorSettings({...row,inputs:{...row.inputs,kernelVersion:null}})).toThrow();
 }
});

it('canonicalizes only new v1 captures and retains every validated stored frozen tuple',()=>{
 const omitted=captureIndicatorAlertSource(settings(),'vwap','standard','snapshot'),explicit=captureIndicatorAlertSource(settings(1),'vwap','standard','snapshot'),v2=captureIndicatorAlertSource(settings(2),'vwap','standard','snapshot');
 expect(technicalSourceKey(explicit)).toBe(technicalSourceKey(omitted));expect(omitted.inputs).not.toHaveProperty('kernelVersion');expect(v2.inputs.kernelVersion).toBe(2);expect(technicalSourceKey(v2)).not.toBe(technicalSourceKey(omitted));
 const saved={...omitted,inputs:{...omitted.inputs,kernelVersion:1}},bytes=JSON.stringify(saved);validateTechnicalAlertSource(saved);expect(JSON.stringify(saved)).toBe(bytes);expect(saved.inputs.kernelVersion).toBe(1);
});
