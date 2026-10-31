import {describe,expect,it} from 'vitest';
import {createIndicatorTemplates,saveIndicatorTemplate,renameIndicatorTemplate,deleteIndicatorTemplate,resolveTemplateDataset,templateSource,templateName,type IndicatorTemplateContent} from '../../src/ui/indicator-templates';
import {templateIdentityEffect,prepareTemplateSources} from '../../src/ui/template-application';
import {ensureWorkspaceGrid} from '../../src/ui/workspace-grid';
import {defaultTheme} from '../../src/ui/themes';
// The app's demo 1D source is now demoDailyDataset (3,900 bars); a test that stands in for it uses the same dataset, or saved source bases no longer match.
import {fixtureDataset,demoDailyDataset} from '../../src/domain/fixtures';

// evidence for template rename, delete, remember symbol, remember interval and the replay policy.
// SYNTHETIC fixture datasets; no GUI claim. SAVE and APPLY are not claimed by this lane (decision D4 pending).
const content=(extra:Partial<IndicatorTemplateContent>={}):IndicatorTemplateContent=>({indicators:[{id:'rsi-1',kind:'rsi',inputs:{length:14,source:'close'},plots:{},offset:0,visible:true,paneId:'shared'}],scripts:[],rememberSymbol:false,rememberInterval:false,source:null,...extra});
const two=()=>{let library=saveIndicatorTemplate(createIndicatorTemplates(),'Alpha',content(),()=>'a');library=saveIndicatorTemplate(library,'Beta',content(),()=>'b');return library;};

describe('rename',()=>{
 it('keeps the identity and contents, bumps the revision and normalizes the name',()=>{
  const library=two(),next=renameIndicatorTemplate(library,'a',1,'  Café  ');
  expect(next.records[0]).toMatchObject({id:'a',revision:2,name:'Café',indicators:library.records[0].indicators});
  expect(next.records[1]).toEqual(library.records[1]);expect(library.records[0].name).toBe('Alpha');
 });
 it('refuses an empty, over-long, control-character or case-insensitive duplicate name and a stale revision, changing nothing',()=>{
  const library=two(),before=JSON.stringify(library);
  expect(()=>renameIndicatorTemplate(library,'a',1,'   ')).toThrow(/Invalid template text/);
  expect(()=>renameIndicatorTemplate(library,'a',1,'x'.repeat(101))).toThrow(/Invalid template text/);
  expect(()=>renameIndicatorTemplate(library,'a',1,'bad\u0007name')).toThrow(/Invalid template text/);
  expect(()=>renameIndicatorTemplate(library,'a',1,'BETA')).toThrow(/overwrite/);
  expect(()=>renameIndicatorTemplate(library,'a',9,'Fresh')).toThrow(/changed or was removed/);
  expect(()=>renameIndicatorTemplate(library,'missing',1,'Fresh')).toThrow(/changed or was removed/);
  expect(JSON.stringify(library)).toBe(before);
 });
 it('renaming a template to its own name in another case is allowed',()=>{
  expect(renameIndicatorTemplate(two(),'a',1,'ALPHA').records[0]).toMatchObject({name:'ALPHA',revision:2});
  expect(templateName(' x ')).toBe('x');
 });
});

describe('delete',()=>{
 it('removes only the selected template when the revision matches',()=>{
  const library=two(),next=deleteIndicatorTemplate(library,'a',1);
  expect(next.records.map(row=>row.id)).toEqual(['b']);expect(library.records).toHaveLength(2);
 });
 it('refuses a stale revision or unknown identity and leaves the library alone',()=>{
  const library=two(),before=JSON.stringify(library);
  expect(()=>deleteIndicatorTemplate(library,'a',2)).toThrow(/changed or was removed/);
  expect(()=>deleteIndicatorTemplate(library,'zzz',1)).toThrow(/changed or was removed/);
  expect(JSON.stringify(library)).toBe(before);
 });
 it('deleting the last template leaves an empty valid library',()=>{
  const one=saveIndicatorTemplate(createIndicatorTemplates(),'Only',content(),()=>'only');
  expect(deleteIndicatorTemplate(one,'only',1)).toEqual({schemaVersion:1,records:[]});
 });
});

describe('remember symbol and interval (no fallback)',()=>{
 const gme=fixtureDataset('GME',5),spy=fixtureDataset('SPY',5);
 const weekly={...spy,resolution:'1W',provenance:{...spy.provenance,datasetId:'weekly-spy'}};
 const make=(extra:Partial<IndicatorTemplateContent>,source=gme)=>saveIndicatorTemplate(createIndicatorTemplates(),'T',content({source:templateSource(source),...extra}),()=>'t').records[0];
 it('remember symbol recalls the saved symbol and refuses when that symbol is absent',()=>{
  const row=make({rememberSymbol:true});
  expect(resolveTemplateDataset(row,spy,[gme,spy])).toBe(gme);
  expect(()=>resolveTemplateDataset(row,spy,[spy])).toThrow(/unavailable GME 1D history.*No prices were substituted/);
 });
 it('remember interval recalls the saved interval for the current symbol and refuses when it is absent',()=>{
  const row=make({rememberInterval:true},weekly);
  expect(resolveTemplateDataset({...row,source:{...row.source!,instrumentId:spy.instrument.id,symbol:spy.instrument.symbol}},spy,[spy,weekly])).toBe(weekly);
  expect(()=>resolveTemplateDataset(row,spy,[spy])).toThrow(/unavailable/);
 });
 it('neither option set leaves the current source untouched, and the two options are independent',()=>{
  expect(resolveTemplateDataset(make({}),spy,[gme,spy])).toBe(spy);
  const symbolOnly=make({rememberSymbol:true},{...gme,resolution:'1D'});
  expect(resolveTemplateDataset(symbolOnly,weekly,[gme,{...gme,resolution:'1W',provenance:{...gme.provenance,datasetId:'weekly-gme'}},weekly]).resolution).toBe('1W');
 });
 it('a remember option without a recorded source basis is refused when saved',()=>{
  expect(()=>saveIndicatorTemplate(createIndicatorTemplates(),'Bad',content({rememberSymbol:true,source:null}),()=>'x')).toThrow(/source basis/);
  expect(()=>saveIndicatorTemplate(createIndicatorTemplates(),'Bad',content({rememberInterval:true,source:null}),()=>'x')).toThrow(/source basis/);
 });
});

describe('REPLAY_POLICY identity effect',()=>{
 it('a source-changing template retires replay, alert and script identities and gets a fresh execution identity',()=>{
  expect(templateIdentityEffect({sourceChanged:true})).toEqual({retireReplay:true,retireAlerts:true,retireScripts:true,freshExecutionIdentity:true});
 });
 it('a same-source template keeps the replay prefix and the alert and script identities; undo still gets a fresh execution identity',()=>{
  expect(templateIdentityEffect({sourceChanged:false})).toEqual({retireReplay:false,retireAlerts:false,retireScripts:false,freshExecutionIdentity:true});
 });
 it('rejects a malformed decision input',()=>{
  expect(()=>templateIdentityEffect({sourceChanged:'yes'} as never)).toThrow(/sourceChanged/);
 });
 it('follows the real source preparation: remembered symbol on another symbol changes the source, otherwise not',()=>{
  const spy=demoDailyDataset('SPY');
  const basic=ensureWorkspaceGrid({symbol:'GME',sourceId:null,imports:[],chartStyle:'candles',themeId:defaultTheme.id,appearance:defaultTheme.appearance,chartOptions:{source:'close',scale:'linear',auto:true,invert:false,timezone:'UTC'},drawings:{version:1,drawings:[]},indicators:[],comparisons:[],scriptBindings:[]} as never);
  const state=basic;
  const remembered=saveIndicatorTemplate(createIndicatorTemplates(),'R',content({rememberSymbol:true,source:templateSource(spy)}),()=>'r').records[0];
  const plain=saveIndicatorTemplate(createIndicatorTemplates(),'P',content(),()=>'p').records[0];
  expect(templateIdentityEffect(prepareTemplateSources(state,remembered)).retireReplay).toBe(true);
  expect(templateIdentityEffect(prepareTemplateSources(state,plain)).retireReplay).toBe(false);
 });
});
