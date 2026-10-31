import {expect,it} from 'vitest';
import {createIndicatorTemplates,saveIndicatorTemplate,restoreIndicatorTemplates,importIndicatorTemplates,instantiateIndicatorTemplate,resolveTemplateDataset,templateSource,type IndicatorTemplateContent} from '../../src/ui/indicator-templates';
import {fixtureDataset} from '../../src/domain/fixtures';

// Original synthetic data; these cases do not execute a renderer or native dialog.
const content=():IndicatorTemplateContent=>({indicators:[{id:'original-sma',kind:'sma',inputs:{length:7,source:'close'},plots:{},offset:0,visible:true,paneId:'shared-original'}],scripts:[{id:'original-script',documentId:'original-document',version:3,name:'Original synthetic example',source:'({onBar(ctx){ctx.plot("Synthetic",ctx.close)}})',pane:'new',paneId:'shared-original',ownScale:false,visible:true,plots:{}}],rememberSymbol:false,rememberInterval:false,source:templateSource(fixtureDataset('GME',5))});
const one=()=>saveIndicatorTemplate(createIndicatorTemplates(),'Original',content(),()=> 'original-template');

it('rejects hidden object fields so validated source metadata cannot disappear during JSON or structured copying',()=>{
 const hiddenRequired=one();Object.defineProperty(hiddenRequired.records[0].source!,'timezone',{value:'UTC',enumerable:false});
 expect(()=>restoreIndicatorTemplates(hiddenRequired)).toThrow();
 const hiddenUnknown=one();Object.defineProperty(hiddenUnknown.records[0],'unsupported',{value:'hidden',enumerable:false});
 expect(()=>restoreIndicatorTemplates(hiddenUnknown)).toThrow();
});

it('rejects deep accessor behavior, unknown data fields, sparse arrays and unsupported source dependencies before evaluating getters',()=>{
 const valid=one();let calls=0;
 const getter=structuredClone(valid);Object.defineProperty(getter.records[0].scripts[0],'source',{enumerable:true,get(){calls++;return 'not executed';}});
 expect(()=>restoreIndicatorTemplates(getter)).toThrow(/accessors/);expect(calls).toBe(0);
 const sourceGetter=structuredClone(valid);Object.defineProperty(sourceGetter.records[0].source!,'timezone',{enumerable:true,get(){calls++;return 'UTC';}});
 expect(()=>restoreIndicatorTemplates(sourceGetter)).toThrow(/accessors/);expect(calls).toBe(0);
 const extra=structuredClone(valid) as any;extra.records[0].source.url='https://example.invalid';expect(()=>restoreIndicatorTemplates(extra)).toThrow(/Unsupported/);
 const dependency=structuredClone(valid) as any;dependency.records[0].indicators[0].inputs.source={instanceId:'original-script',plot:'Synthetic'};expect(()=>restoreIndicatorTemplates(dependency)).toThrow(/type/);
 const sparse=structuredClone(valid);sparse.records.length=2;expect(()=>restoreIndicatorTemplates(sparse)).toThrow(/Sparse/);
 const deep:any={};let cursor=deep;for(let i=0;i<26;i++)cursor=cursor.next={};expect(()=>restoreIndicatorTemplates(deep)).toThrow(/structure/);
});

it('a rejected multi-record merge cannot publish earlier allocations or overwrite the reviewed original',()=>{
 const original=one(),before=JSON.stringify(original),incoming=one();incoming.records[0].id='external-first';incoming.records[0].name='Accepted first';
 incoming.records.push({...structuredClone(incoming.records[0]),id:'external-second',name:'ORIGINAL'});
 let allocated=0;expect(()=>importIndicatorTemplates(original,JSON.stringify(incoming),()=> 'allocated-'+ ++allocated)).toThrow(/overwrite/);
 expect(allocated).toBe(1);expect(JSON.stringify(original)).toBe(before);expect(original.records).toHaveLength(1);
 const duplicateIds=one();duplicateIds.records.push({...structuredClone(duplicateIds.records[0]),name:'Other'});expect(()=>restoreIndicatorTemplates(duplicateIds)).toThrow(/Duplicate/);
 const count=one();count.records=Array.from({length:201},(_,i)=>({...structuredClone(count.records[0]),id:'row-'+i,name:'Row '+i}));expect(()=>restoreIndicatorTemplates(count)).toThrow(/library/);
 const tooMany=one();tooMany.records[0].indicators=Array.from({length:101},(_,i)=>({...structuredClone(tooMany.records[0].indicators[0]),id:'indicator-'+i}));expect(()=>restoreIndicatorTemplates(tooMany)).toThrow(/instance limit/);
});

it('instance remapping preserves immutable script identity/version and shared panes while rejecting reused or prefixed collisions',()=>{
 const template=one().records[0],before=JSON.stringify(template);let i=0;
 const mapped=instantiateIndicatorTemplate(template,()=> 'fresh-'+ ++i);
 expect(mapped.indicators[0].paneId).toBe(mapped.scripts[0].paneId);expect(mapped.indicators[0].paneId).toBe('lv-template-pane-fresh-2');
 expect(mapped.scripts[0]).toMatchObject({documentId:'original-document',version:3,source:template.scripts[0].source});
 expect(JSON.stringify(template)).toBe(before);
 expect(()=>instantiateIndicatorTemplate(template,()=> 'price')).toThrow(/collision/);
 expect(()=>instantiateIndicatorTemplate(template,()=> 'current-instance',['current-instance'])).toThrow(/collision/);
 const occupiedIds=['fresh-instance','candidate'];expect(()=>instantiateIndicatorTemplate(template,()=> occupiedIds.shift()!,['lv-template-pane-candidate'])).toThrow(/pane identity collision/);
 expect(()=>instantiateIndicatorTemplate(template,()=> 'new',Array(20001).fill('existing'))).toThrow(/ownership inventory/);
 const collide={...template,indicators:[{...template.indicators[0],id:'lv-template-pane-candidate'}]};const ids=['fresh-instance','candidate'];
 expect(()=>instantiateIndicatorTemplate(collide,()=> ids.shift()!)).toThrow(/pane identity collision/);expect(JSON.stringify(template)).toBe(before);
});

it('remembered source resolution never falls through to matching-symbol prices from an incompatible basis',()=>{
 const current=fixtureDataset('SPY',5),saved=fixtureDataset('GME',5),template={...one().records[0],rememberSymbol:true};
 const variations=[{...saved,instrument:{...saved.instrument,exchange:'OTHER'}},{...saved,instrument:{...saved.instrument,currency:'EUR'}},{...saved,provenance:{...saved.provenance,providerId:'other-provider'}},{...saved,provenance:{...saved.provenance,fixture:false}},{...saved,provenance:{...saved.provenance,session:'regular' as const}},{...saved,provenance:{...saved.provenance,adjustment:'split-adjusted' as const}},{...saved,provenance:{...saved.provenance,timezone:'America/New_York'}},{...saved,provenance:{...saved.provenance,coverage:'different declared history'}},{...saved,resolution:'1W'}];
 for(const dataset of variations)expect(()=>resolveTemplateDataset(template,current,[dataset,current])).toThrow(/unavailable/);
 expect(resolveTemplateDataset(template,current,[...variations,saved])).toBe(saved);
 expect(()=>resolveTemplateDataset(template,current,[saved,structuredClone(saved)])).toThrow(/More than one data source matches/);
});
