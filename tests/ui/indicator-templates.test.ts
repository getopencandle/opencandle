import {expect,it} from 'vitest';
import {createIndicatorTemplates,saveIndicatorTemplate,renameIndicatorTemplate,copyIndicatorTemplate,deleteIndicatorTemplate,restoreIndicatorTemplates,instantiateIndicatorTemplate,importIndicatorTemplates,templateSource,resolveTemplateDataset,INDICATOR_TEMPLATE_BYTES,type IndicatorTemplateContent} from '../../src/ui/indicator-templates';
import {fixtureDataset} from '../../src/domain/fixtures';
const collection=():IndicatorTemplateContent=>({indicators:[{id:'rsi-instance',kind:'rsi',inputs:{length:14,source:'close'},plots:{},offset:0,visible:true,paneId:'shared'},{id:'atr-instance',kind:'atr',inputs:{length:14,smoothing:'RMA'},plots:{},offset:0,visible:true,paneId:'shared'}],scripts:[{id:'script-instance',documentId:'script-file',version:2,name:'Original',source:'({onBar(ctx){ctx.plot("One",1)}})',pane:'new',paneId:'shared',ownScale:true,visible:true,plots:{}}],rememberSymbol:false,rememberInterval:false,source:templateSource(fixtureDataset('GME',5))});
it('stores only portable settings and uses explicit overwrite identity/revisions with normalized names',()=>{
 const empty=createIndicatorTemplates(),first=saveIndicatorTemplate(empty,'  Cafe\u0301  ',collection(),()=> 'template-one');expect(first.records[0].name).toBe('Café');expect(empty.records).toEqual([]);
 expect(()=>saveIndicatorTemplate(first,'CAFÉ',collection(),()=> 'other')).toThrow(/overwrite/);
 const overwrite=saveIndicatorTemplate(first,'Café',{...collection(),rememberSymbol:true},()=>{throw new Error('Must retain ID');},{id:'template-one',expectedRevision:1});expect(overwrite.records[0]).toMatchObject({id:'template-one',revision:2,rememberSymbol:true});
 expect(()=>deleteIndicatorTemplate(overwrite,'template-one',1)).toThrow(/changed/);expect(renameIndicatorTemplate(overwrite,'template-one',2,'Renamed').records[0]).toMatchObject({id:'template-one',revision:3,name:'Renamed'});
 expect(copyIndicatorTemplate(overwrite,'template-one',2,'Copy',()=> 'template-two').records[1]).toMatchObject({id:'template-two',revision:1,name:'Copy'});
});
it('fresh instance and pane identities preserve shared built-in/script placement and source snapshots',()=>{
 const template=saveIndicatorTemplate(createIndicatorTemplates(),'Shared',collection(),()=> 'template-one').records[0];let sequence=0;
 const fresh=instantiateIndicatorTemplate(template,()=> 'fresh-'+ ++sequence);expect(fresh.indicators.map(row=>row.id)).toEqual(['fresh-1','fresh-3']);expect(fresh.scripts[0].id).toBe('fresh-4');expect(fresh.indicators[0].paneId).toBe('lv-template-pane-fresh-2');expect(fresh.indicators[1].paneId).toBe(fresh.scripts[0].paneId);expect(fresh.scripts[0].documentId).toBe('script-file');expect(fresh.scripts[0].version).toBe(2);expect(template.indicators[0].id).toBe('rsi-instance');
 expect(()=>instantiateIndicatorTemplate(template,()=> 'rsi-instance')).toThrow(/collision/);
});
it('imports fresh template IDs and rejects name conflict, large JSON, malformed graphs and callbacks atomically',()=>{
 const library=saveIndicatorTemplate(createIndicatorTemplates(),'One',collection(),()=> 'one'),text=JSON.stringify(library),empty=createIndicatorTemplates();
 expect(importIndicatorTemplates(empty,text,()=> 'imported').records[0].id).toBe('imported');expect(()=>importIndicatorTemplates(library,text,()=> 'two')).toThrow(/overwrite/);expect(library.records).toHaveLength(1);
 expect(()=>importIndicatorTemplates(empty,' '.repeat(INDICATOR_TEMPLATE_BYTES+1),()=> 'x')).toThrow(/8 MiB/);
 const malformed=structuredClone(library);malformed.records[0].indicators[0].inputs.source={instanceId:'missing',plot:'one'};expect(()=>restoreIndicatorTemplates(malformed)).toThrow();
 let executed=0;expect(()=>restoreIndicatorTemplates({schemaVersion:1,records:[],toJSON(){executed++;return empty;}})).toThrow();expect(executed).toBe(0);
});
it('remember options require source provenance and collision checks include cross-kind ownership',()=>{
 expect(()=>saveIndicatorTemplate(createIndicatorTemplates(),'No source',{...collection(),source:null,rememberInterval:true},()=> 'one')).toThrow(/source basis/);
 const value=collection();value.scripts[0].id=value.indicators[0].id;expect(()=>saveIndicatorTemplate(createIndicatorTemplates(),'Overlap',value,()=> 'one')).toThrow(/overlap/);
 const template=saveIndicatorTemplate(createIndicatorTemplates(),'Valid',collection(),()=> 'one');expect(restoreIndicatorTemplates(JSON.parse(JSON.stringify(template)))).toEqual(template);
});
it('resolves symbol and interval independently using the exact supplied price basis',()=>{
 const gme=fixtureDataset('GME',5),spy=fixtureDataset('SPY',5),weekly={...spy,resolution:'1W',provenance:{...spy.provenance,datasetId:'weekly-spy'}};
 const template=saveIndicatorTemplate(createIndicatorTemplates(),'GME',collection(),()=> 'one').records[0];
 expect(resolveTemplateDataset(template,spy,[gme,spy])).toBe(spy);
 expect(resolveTemplateDataset({...template,rememberSymbol:true},spy,[gme,spy])).toBe(gme);
 const intervalOnly={...template,rememberInterval:true,source:{...template.source!,resolution:'1W'}};
 expect(resolveTemplateDataset(intervalOnly,spy,[gme,spy,weekly])).toBe(weekly);
 expect(()=>resolveTemplateDataset(intervalOnly,spy,[{...weekly,provenance:{...weekly.provenance,coverage:'another venue'}}])).toThrow(/unavailable/);
 expect(()=>resolveTemplateDataset(intervalOnly,spy,[weekly,{...weekly,provenance:{...weekly.provenance,datasetId:'other-weekly'}}])).toThrow(/More than one data source/);
 expect(()=>resolveTemplateDataset({...template,rememberSymbol:true},weekly,[gme,spy,weekly])).toThrow(/unavailable/);
});
