import {expect,it} from 'vitest';
import {parseCsv,parseJson} from '../../src/domain/data';
import {exampleDraft,IMPORT_EXAMPLES,SEASONALITY_IMPORT_EXAMPLES,findImportExample,prepareImportDraft} from '../../src/domain/data-setup';
import {captureLocalCandleOrigin,reconstructLocalCandleDataset} from '../../src/domain/local-candle-origin';
import {identifyLocalImport} from '../../src/ui/workspace-intervals';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {ensureWorkspaceGrid,patchWorkspace,selectedDataset} from '../../src/ui/workspace-grid';
import {chooseIntervalSource,intervalDatasetKey} from '../../src/domain/intervals';
const CSV='date,open,high,low,close,volume\n2024-01-02,10,14,6,12,10\n2024-01-03,12,20,8,16,20\n2024-01-04,16,22,12,18,30';
const NOW=1792022400,admission={externalNumericSlots:0,externalOperations:0};
function original(){const parsed=parseCsv(CSV);expect(parsed.ok).toBe(true);return parsed.dataset!;}
function capture(dataset:unknown){const value=captureLocalCandleOrigin(dataset,admission);expect(value).not.toBeNull();return value!;}
it('actual CSV construction retains exact selected original values without claiming a calendar or completion',()=>{
 const data=original(),source=capture(data);expect(source.rows).toBe(3);expect(source.evidence).toBe('user-supplied-local-document');expect([source.calendar,source.completion]).toEqual(['undeclared','undeclared']);
 expect(source.readRows(data,0,3)).toEqual([{time:1704153600,open:10,high:14,low:6,close:12,volume:10},{time:1704240000,open:12,high:20,low:8,close:16,volume:20},{time:1704326400,open:16,high:22,low:12,close:18,volume:30}]);
 expect(data.provenance.fixture).toBe(false);expect(data.provenance.session).toBe('unknown');source.dispose();
});
it('actual JSON construction preserves parser result shape and exact own bar aliases',()=>{
 const parsed=parseJson(JSON.stringify([{time:1704153600,open:10,high:14,low:6,close:12,volume:10}]));expect(parsed.ok).toBe(true);expect(parsed.dataset!.bars).toBe(parsed.bars);expect(Object.keys(parsed.dataset!)).toEqual(['instrument','bars','resolution','provenance']);
 const source=capture(parsed.dataset);expect(source.readRows(parsed.dataset,0,1)[0].close).toBe(12);source.dispose();
});
it('real preparation and identity construction retain exact local membership without promoting a copied result',()=>{
 const prepared=prepareImportDraft(exampleDraft('gme-daily-csv'),{now:NOW});expect(prepared.preview.state).toBe('ready');const data=prepared.dataset!,identified=identifyLocalImport(data,'seasonality-new-original');
 expect(identified.bars).toBe(data.bars);expect(identified).not.toBe(data);const source=capture(identified);expect(source.readRows(identified,0,1)[0].close).toBe(20.5);expect(()=>source.assertCurrent(data)).toThrow('another original');
 expect(captureLocalCandleOrigin({...identified},admission)).toBeNull();source.assertCurrent(identified);source.dispose();
});
it('wrong-original refusal leaves a genuine source valid and never reads the expected lookalike',()=>{
 const data=original(),source=capture(data);let reads=0;const wrong=Object.defineProperty({},'bars',{get(){reads++;throw Error('No getter');}});
 expect(()=>source.assertCurrent(wrong)).toThrow('another original');expect(reads).toBe(0);source.assertCurrent(data);source.dispose();
});
it('a returned scalar chunk is detached and frozen while actual source rows remain mutable',()=>{
 const data=original(),source=capture(data),rows=source.readRows(data,0,1);expect(rows[0]).not.toBe(data.bars[0]);expect(Object.isFrozen(rows)).toBe(true);expect(Object.isFrozen(rows[0])).toBe(true);expect(Object.isFrozen(data.bars)).toBe(false);expect(Object.isFrozen(data.bars[0])).toBe(false);source.dispose();
});
it('invalid/out-of-range queries refuse only the query and never retire valid original ownership',()=>{
 const data=original(),source=capture(data);for(const [start,count]of [[-1,1],[0,-1],[0,129],[3,1],[NaN,1],[0,Infinity]])expect(()=>source.readRows(data,start,count)).toThrow();
 expect(source.readRows(data,2,1)[0].close).toBe(18);source.assertCurrent(data);source.dispose();
});
it('disposed views remain unavailable after a fresh admitted capture of the unchanged owned original',()=>{
 const data=original(),old=capture(data);old.dispose();const current=capture(data);expect(current).not.toBe(old);expect(()=>old.assertCurrent(data)).toThrow();expect(current.readRows(data,2,1)[0].close).toBe(18);current.dispose();
});
it('identifying an observed retired source preserves the legacy renamed value without granting membership',()=>{
 const data=original(),source=capture(data);data.bars[0].close=13;expect(()=>source.assertCurrent(data)).toThrow();data.bars[0].close=12;
 const identified=identifyLocalImport(data,'retired-value-still-renames');expect(identified).toEqual({...data,provenance:{...data.provenance,datasetId:'local-import:retired-value-still-renames'}});expect(identified.bars).toBe(data.bars);expect(captureLocalCandleOrigin(identified,admission)).toBeNull();expect(()=>identifyLocalImport(data,'invalid id')).toThrow('Invalid local import identity');
});
it('independent captures dispose separately and never revive earlier released readers',()=>{
 const data=original(),a=capture(data),b=capture(data);expect(a).not.toBe(b);a.dispose();a.dispose();expect(()=>a.assertCurrent(data)).toThrow();expect(b.readRows(data,1,1)[0].close).toBe(16);b.dispose();
 const c=capture(data);expect(()=>a.assertCurrent(data)).toThrow();expect(()=>b.assertCurrent(data)).toThrow();expect(c.readRows(data,2,1)[0].close).toBe(18);c.dispose();
});
it('full workspace restoration creates a new exact local original without deserializing a capability',()=>{
 const local=identifyLocalImport(prepareImportDraft(exampleDraft('gme-daily-csv'),{now:NOW}).dataset!,'seasonality-restore'),base=createInitialWorkspace();
 const workspace=patchWorkspace(ensureWorkspaceGrid(base),{imports:[local],symbol:'GME',sourceId:local.provenance.datasetId}),document=JSON.parse(JSON.stringify(workspace)),oldDocument=document.imports[0];
 expect(captureLocalCandleOrigin(oldDocument,admission)).toBeNull();const restored=restoreWorkspace(document,createInitialWorkspace()),data=selectedDataset(restored as never);expect(restored.imports).toEqual([local]);expect(data).not.toBe(oldDocument);expect(data).not.toBe(local);
 const source=capture(data);expect(source.readRows(data,0,1)[0].close).toBe(20.5);expect(()=>source.assertCurrent(local)).toThrow('another original');source.dispose();
});
it('actual locally aggregated monthly data never acquires original daily/monthly membership by relabeling',()=>{
 const daily=prepareImportDraft(exampleDraft('seasonality-equity-csv'),{now:NOW}).dataset!;const choice=chooseIntervalSource([daily],{instrumentId:daily.instrument.id,target:'1M',sourceKey:intervalDatasetKey(daily)});expect(choice.ok).toBe(true);if(!choice.ok)throw Error(choice.message);
 expect(choice.kind).not.toBe('exact');expect(captureLocalCandleOrigin(choice.dataset,admission)).toBeNull();expect(captureLocalCandleOrigin(identifyLocalImport(choice.dataset,'derived-cannot-grant'),admission)).toBeNull();
 expect(captureLocalCandleOrigin(reconstructLocalCandleDataset(choice.dataset),admission)).toBeNull();
});
it('the additional user-selectable synthetic group keeps all four established examples exact',()=>{
 expect(IMPORT_EXAMPLES.map(row=>row.id)).toEqual(['gme-daily-csv','spy-daily-json','lvdemo-5m-csv','practice-mistakes-csv']);expect(SEASONALITY_IMPORT_EXAMPLES).toHaveLength(1);
 const example=findImportExample('seasonality-equity-csv')!;expect(example).toBe(SEASONALITY_IMPORT_EXAMPLES[0]);expect(example.title).toBe('Multi-year equity history (synthetic)');expect(example.draft.text).toContain('SYNTHETIC EXAMPLE - not market data');
 const prepared=prepareImportDraft(exampleDraft(example.id),{now:NOW});expect(prepared.preview.state).toBe('ready');expect(prepared.dataset!.provenance.fixture).toBe(true);expect(prepared.preview.first).toBe('2015-12-01');expect(prepared.preview.last).toBe('2023-12-29');
});
it('the real multi-year example has literal month endpoints and holiday gaps, including the preceding December seed',()=>{
 const data=prepareImportDraft(exampleDraft('seasonality-equity-csv'),{now:NOW}).dataset!,at=(date:string)=>data.bars.find(row=>row.time===Date.parse(date+'T00:00:00Z')/1000);
 expect(at('2015-12-31')?.close).toBe(125);expect(at('2016-01-29')?.close).toBe(110);expect(at('2016-02-29')?.close).toBe(120);expect(at('2016-03-31')?.close).toBe(115);expect(at('2023-12-29')?.close).toBe(205);
 for(const date of ['2015-12-25','2016-01-01','2016-02-15','2016-03-25','2018-12-05','2022-06-20','2023-12-25'])expect(at(date)).toBeUndefined();
 expect(at('2015-12-24')).toBeDefined();expect(at('2023-11-24')).toBeDefined();expect(data.bars.length).toBeGreaterThan(2000);
 const source=capture(data);expect(source.calendar).toBe('undeclared');source.dispose();
});
