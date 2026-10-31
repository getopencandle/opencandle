import {expect,it} from 'vitest';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {prepareWorkspaceReplacement} from '../../src/ui/workspace-transfer';
import {createPaperAccount} from '../../src/domain/paper';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';

const data=()=>prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount(),alerts:[]});
const encode=(value:unknown)=>JSON.stringify({schemaVersion:1,data:value});
const imported=()=>{const source=structuredClone(fixtureDataset('GME',500));source.provenance.datasetId='SYNTHETIC-restore-review';source.provenance.providerId='lv-original-review-fixture';return source;};

it('rejects imported source metadata that the actual renderer context cannot consume, before committing any candidate',()=>{
 for(const [field,value] of [['providerId',null],['revision',{}],['coverage',''],['timezone',15]] as const){
  const valueData=data(),source=imported();(source.provenance as unknown as Record<string,unknown>)[field]=value;valueData.imports=[source];
  const grid=valueData.grid as any;grid.cells[grid.layout.activeCellId].datasetId=source.provenance.datasetId;valueData.sourceId=source.provenance.datasetId;
  expect(()=>sourceContextForDataset(source)).toThrow();expect(()=>prepareWorkspaceReplacement(encode(valueData))).toThrow();
 }
});
it('validates unused imported sources too so later selection cannot expose an unreviewed malformed source',()=>{
 const valueData=data(),source=imported();(source.provenance as any).revision=null;valueData.imports=[source];expect(()=>prepareWorkspaceReplacement(encode(valueData))).toThrow();
});
it('retains an unavailable original drawing and explicitly discloses it in the replacement preview',()=>{
 const valueData=data(),grid=valueData.grid as any;grid.cells[grid.layout.activeCellId].drawings.drawings=[{id:'opaque-original',type:'lv-future-original-shape',original:{label:'Synthetic unrendered shape'}}];
 const result=prepareWorkspaceReplacement(encode(valueData));expect(result.workspace.drawings.drawings).toEqual(grid.cells[grid.layout.activeCellId].drawings.drawings);expect(result.summary.join(' ')).toMatch(/1.*(unsupported|unavailable)/i);
});
it('preserves opaque future JSON while rejecting credentials and finite-number overflow before domain reads',()=>{
 const valueData=data();valueData.originalFutureField={label:'Synthetic extension',zero:0};expect(prepareWorkspaceReplacement(encode(valueData)).data.originalFutureField).toEqual(valueData.originalFutureField);
 expect(()=>prepareWorkspaceReplacement(encode({...valueData,nested:{password:'Synthetic forbidden key'}}))).toThrow();expect(()=>prepareWorkspaceReplacement(encode(valueData).replace('"cash":100000','"cash":1e999'))).toThrow();
});
