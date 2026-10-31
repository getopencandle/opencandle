import {expect,it} from 'vitest';
import {VWAP_BAND_DEFAULTS} from '../../src/domain/indicators';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources,technicalSourceKey} from '../../src/domain/technical-alerts';
import {validateTechnicalAlertSource} from '../../src/domain/alert-observation';
import {defaultIndicatorPresentation,indicatorLegacyDefaults,type IndicatorSnapshot} from '../../src/chart/indicator-settings';
import {createIndicatorLibrary,saveIndicatorDefault,restoreIndicatorLibrary} from '../../src/ui/indicator-library';
import {createIndicatorTemplates,saveIndicatorTemplate,restoreIndicatorTemplates,instantiateIndicatorTemplate} from '../../src/ui/indicator-templates';
const legacy=():IndicatorSnapshot=>({id:'old-vwap',kind:'vwap',inputs:{...indicatorLegacyDefaults.vwap},plots:{},offset:0,visible:true,paneId:'price'});
const portable=(snapshot:IndicatorSnapshot)=>{const {paneId,...settings}=snapshot;return settings;};
it('captures legacy VWAP without rewriting its historical tuple and rejects inactive new plot captures',()=>{
 const saved=legacy(),source=captureIndicatorAlertSource(portable(saved),'vwap','standard','saved');expect(source.inputs).toEqual(indicatorLegacyDefaults.vwap);const bytes=JSON.stringify(source);validateTechnicalAlertSource(JSON.parse(bytes));expect(JSON.stringify(source)).toBe(bytes);expect(()=>captureIndicatorAlertSource(portable(saved),'upper1','standard','bad')).toThrow();
 const invalid={...source,inputs:{...source.inputs,bandMode:'Percentage'}};expect(()=>validateTechnicalAlertSource(invalid)).toThrow();
});
it('keeps frozen enabled bands independent of visible instance disable, hide and offset edits',async()=>{
 const saved=legacy();saved.inputs={...saved.inputs,source:'close',...VWAP_BAND_DEFAULTS,band1Enabled:true};saved.presentation={...defaultIndicatorPresentation('vwap'),hideOnDaily:true};saved.offset=100;
 const source=captureIndicatorAlertSource(portable(saved),'upper1','standard','enabled'),before=technicalSourceKey(source);saved.inputs.band1Enabled=false;saved.presentation.hideOnDaily=false;saved.offset=-100;
 expect(()=>captureIndicatorAlertSource(portable(saved),'upper1','standard','disabled')).toThrow();const bars=[10,20,30].map((close,i)=>({time:1700000000+i*60,open:close,high:close,low:close,close,volume:[1,3,2][i]}));const batch=await evaluateTechnicalAlertSources(bars,[source],'USD');expect(batch.results.get(before)?.sample.value).toBeCloseTo(1313/60,12);expect(technicalSourceKey(source)).toBe(before);expect(source).not.toHaveProperty('presentation');expect(source).not.toHaveProperty('offset');
});
it('preserves full new settings and exact legacy omissions through library/template export and fresh ownership',()=>{
 const old=legacy(),next={...legacy(),id:'new-vwap',inputs:{...indicatorLegacyDefaults.vwap,...VWAP_BAND_DEFAULTS,band2Enabled:true,band2Multiplier:0},presentation:{...defaultIndicatorPresentation('vwap'),hideOnDaily:false}};next.presentation.fills.band2={visible:false,color:'#123456',opacity:41};
 const {id,kind,paneId,...defaults}=next;const library=saveIndicatorDefault(createIndicatorLibrary(),'vwap',defaults);expect(restoreIndicatorLibrary(JSON.parse(JSON.stringify(library)))).toEqual(library);
 const templates=saveIndicatorTemplate(createIndicatorTemplates(),'VWAP original',{indicators:[old,next],scripts:[],rememberSymbol:false,rememberInterval:false,source:null},()=> 'template-one');const restored=restoreIndicatorTemplates(JSON.parse(JSON.stringify(templates)));expect(restored).toEqual(templates);let sequence=0;const instances=instantiateIndicatorTemplate(restored.records[0],()=>`fresh-${++sequence}`);expect(instances.indicators[0]).toEqual({...old,id:'fresh-1'});expect(instances.indicators[1]).toEqual({...next,id:'fresh-2'});
});
