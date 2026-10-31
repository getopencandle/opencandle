import {expect,it} from 'vitest';
import {DOMAIN_INDICATORS,VOLUME_NEW_INSTANCE_PALETTE,defaultIndicatorPresentation,indicatorInputSchema,validateIndicatorPresentation,validateIndicatorSettings,validateIndicatorSnapshots,validateIndicatorVolumePalette,assertIndicatorBatchBudget,type IndicatorVolumePalette,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {createIndicatorLibrary,factoryIndicatorDefault,instanceDefaults,restoreIndicatorLibrary,saveIndicatorDefault,validateIndicatorDefault} from '../../src/ui/indicator-library';
import {createIndicatorTemplates,saveIndicatorTemplate,restoreIndicatorTemplates,instantiateIndicatorTemplate} from '../../src/ui/indicator-templates';
import {calculateIndicator} from '../../src/domain/indicators';
import {captureIndicatorAlertSource,technicalSourceKey,evaluateTechnicalAlertSources} from '../../src/domain/technical-alerts';
import {createFrameFingerprintCalculator} from '../../src/ui/frame-fingerprints';
import type {MultiChartCellState} from '../../src/ui/MultiChartGrid';

const palette=(mode:IndicatorVolumePalette['mode']='previous-close'):IndicatorVolumePalette=>({schemaVersion:1,mode,upColor:'#00ff00',downColor:'#ff0000'});
const settings=():IndicatorInstanceSettings=>({...factoryIndicatorDefault('volume'),id:'owned-volume',kind:'volume',inputs:{length:2}});
const opens=[10,12,9,14],closes=[11,11,10,12],volumes=[100,0,300,200];
const bars=closes.map((close,i)=>({time:1700000000+i*60,open:opens[i],high:Math.max(opens[i],close)+1,low:Math.min(opens[i],close)-1,close,volume:volumes[i]}));

it('requires the exact complete scalar tuple even for uniform and rejects getters without reading them',()=>{
 let reads=0;const malformed:unknown[]=[null,undefined,{},[],{...palette(),schemaVersion:2},{...palette(),mode:'previous'},{...palette(),upColor:null},{...palette('uniform'),downColor:'var(--color)'},{...palette(),extra:true}];
 const missing={...palette()} as any;delete missing.downColor;malformed.push(missing);
 const hidden=palette();Object.defineProperty(hidden,'upColor',{value:'#00ff00',enumerable:false});malformed.push(hidden);
 const accessor=palette();Object.defineProperty(accessor,'downColor',{enumerable:true,get(){reads++;return '#ff0000';}});malformed.push(accessor);
 const symbolic=palette();Object.defineProperty(symbolic,Symbol('extra'),{value:1});malformed.push(symbolic);
 const inherited=Object.assign(Object.create({untrusted:true}),palette());malformed.push(inherited);
 for(const value of malformed)expect(()=>validateIndicatorVolumePalette(value)).toThrow();expect(reads).toBe(0);
 for(const mode of ['uniform','open-close','previous-close'] as const)expect(()=>validateIndicatorVolumePalette(palette(mode))).not.toThrow();
 for(const kind of DOMAIN_INDICATORS.filter(kind=>kind!=='volume'))expect(()=>validateIndicatorPresentation(kind,{...defaultIndicatorPresentation(kind),volumePalette:palette()})).toThrow(/only supported for Volume/);
 for(const value of [null,undefined])expect(()=>validateIndicatorPresentation('volume',{...defaultIndicatorPresentation('volume'),volumePalette:value})).toThrow();
});

it('rejects directional area across live, dormant, default, snapshot and template boundaries',()=>{
 const row=settings();row.plots.volume.kind='area';row.visible=false;row.plots.volume.visible=false;row.presentation!.volumePalette=palette();
 expect(()=>validateIndicatorSettings(row)).toThrow(/area plots/);expect(()=>validateIndicatorSnapshots([{...row,paneId:'study'}])).toThrow(/area plots/);
 const defaults={inputs:row.inputs,plots:row.plots,offset:row.offset,visible:row.visible,presentation:row.presentation};
 expect(()=>validateIndicatorDefault('volume',defaults)).toThrow(/area plots/);expect(()=>saveIndicatorDefault(createIndicatorLibrary(),'volume',defaults)).toThrow(/area plots/);
 expect(()=>saveIndicatorTemplate(createIndicatorTemplates(),'Invalid area',{indicators:[{...row,paneId:'study'}],scripts:[],rememberSymbol:false,rememberInterval:false,source:null},()=> 'template')).toThrow(/area plots/);
 row.presentation!.volumePalette=palette('uniform');expect(()=>validateIndicatorSettings(row)).not.toThrow();expect(()=>validateIndicatorDefault('volume',{...defaults,presentation:row.presentation})).not.toThrow();
});

it('roundtrips palette fields through defaults and templates while preserving exact legacy omission',()=>{
 // 0.8.1: a new (factory) Volume carries the candle-direction palette; a saved instance without presentation stays omitted.
 const factory=factoryIndicatorDefault('volume');expect(factory.presentation!.volumePalette).toEqual(VOLUME_NEW_INSTANCE_PALETTE);const legacy=structuredClone(factory);delete legacy.presentation;
 expect(Object.hasOwn(instanceDefaults(saveIndicatorDefault(createIndicatorLibrary(),'volume',legacy),'volume'),'presentation')).toBe(false);
 factory.presentation!.volumePalette=palette();const library=restoreIndicatorLibrary(JSON.parse(JSON.stringify(saveIndicatorDefault(createIndicatorLibrary(),'volume',factory))));
 const detached=instanceDefaults(library,'volume');expect(detached.presentation!.volumePalette).toEqual(palette());detached.presentation!.volumePalette!.upColor='#123456';expect(instanceDefaults(library,'volume').presentation!.volumePalette!.upColor).toBe('#00ff00');
 const row={...factory,id:'volume-original',kind:'volume' as const,paneId:'study'};const templates=saveIndicatorTemplate(createIndicatorTemplates(),'Volume colors',{indicators:[row],scripts:[],rememberSymbol:false,rememberInterval:false,source:null},()=> 'template-volume');let n=0;
 const restored=instantiateIndicatorTemplate(restoreIndicatorTemplates(JSON.parse(JSON.stringify(templates))).records[0],()=> 'new-'+(++n));expect(restored.indicators[0].presentation!.volumePalette).toEqual(palette());expect(restored.indicators[0].id).not.toBe(row.id);
});

it('preserves literal Volume and MA calculations, frozen alerts and frame identity for every palette mode',async()=>{
 const row=settings(),base=calculateIndicator('volume',bars,row.inputs);expect(base.series.map(plot=>plot.values)).toEqual([[100,0,300,200],[null,50,150,250]]);
 expect(calculateIndicator('volume',bars,{length:3}).series[1].values).toEqual([null,null,400/3,500/3]);
 const frozen=captureIndicatorAlertSource(row,'ma','standard','fixed source'),key=technicalSourceKey(frozen),fingerprint=createFrameFingerprintCalculator(),cell={indicators:[{...row,paneId:'study'}],comparisons:[],scriptBindings:[]} as unknown as MultiChartCellState,before=await fingerprint(cell,[]);
 for(const mode of ['uniform','open-close','previous-close'] as const){const changed={...row,presentation:{...row.presentation!,volumePalette:palette(mode)}};validateIndicatorSettings(changed);expect(calculateIndicator('volume',bars,changed.inputs)).toEqual(base);expect(technicalSourceKey(captureIndicatorAlertSource(changed,'ma','standard','fixed source'))).toBe(key);expect(await fingerprint({...cell,indicators:[{...changed,paneId:'study'}]},[])).toEqual(before);}
 const result=await evaluateTechnicalAlertSources(bars,[frozen],'USD');expect(result.results.get(key)?.sample.value).toBe(250);
});

it('retains existing MA bounds and accounts for the extra presentation pass independently of calculations',()=>{
 expect(indicatorInputSchema('volume')[0]).toMatchObject({key:'length',title:'MA Length',defval:20,min:1,max:100000});expect(indicatorInputSchema('sma')[0].title).toBe('Length');
 // The factory row now carries a direction palette (0.8.1), so the single-color baseline removes it explicitly.
 const row=settings();delete row.presentation!.volumePalette;const ordinary=assertIndicatorBatchBudget([row],100);row.presentation!.volumePalette=palette();const directional=assertIndicatorBatchBudget([row],100);expect(directional.numericSlots).toBe(ordinary.numericSlots);expect(directional.operations-ordinary.operations).toBe(400);
 row.visible=false;row.presentation!.visibility={schemaVersion:1,mode:'include',intervals:[],ranges:[]};expect(assertIndicatorBatchBudget([row],100)).toEqual(directional);
});
