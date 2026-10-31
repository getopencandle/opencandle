import {expect,it} from 'vitest';
import {validatePreparedGridInput} from '../../src/ui/grid-prepared-input';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {workspaceDatasets,selectedDataset} from '../../src/ui/workspace-grid';
import {createReplay,replayPrefix} from '../../src/domain/replay';

it('accepts the existing ordinary active array for a change confined to another cell',()=>{
 const workspace=createInitialWorkspace(),dataset=selectedDataset(workspace),datasets=workspaceDatasets(workspace),grid=workspace.grid!;
 const prepared={nextDatasets:datasets,nextActiveBars:dataset.bars,nextActiveExecutionIdentity:'ordinary',activeCellId:grid.layout.activeCellId,activeDatasetId:dataset.provenance.datasetId,activeResolution:dataset.resolution};
 expect(validatePreparedGridInput(grid,prepared,{dataset,datasets,bars:dataset.bars,replay:null}).bars).toBe(dataset.bars);
 expect(()=>validatePreparedGridInput(grid,{...prepared,nextActiveBars:dataset.bars.map(row=>({...row}))},{dataset,datasets,bars:dataset.bars,replay:null})).toThrow('accepted full input');
});
it('keeps an exact current replay prefix and rejects stale run identities and implicit prefix relabeling',()=>{
 const workspace=createInitialWorkspace(),dataset=selectedDataset(workspace),datasets=workspaceDatasets(workspace),grid=workspace.grid!,replay=createReplay(dataset,4,'independent-run'),bars=replayPrefix(dataset,replay);
 const prepared={nextDatasets:datasets,nextActiveBars:bars,nextActiveExecutionIdentity:replay.runId,activeCellId:grid.layout.activeCellId,activeDatasetId:dataset.provenance.datasetId,activeResolution:dataset.resolution},current={dataset,datasets,bars,replay};
 expect(validatePreparedGridInput(grid,prepared,current).replay).toBe(replay);
 expect(()=>validatePreparedGridInput(grid,{...prepared,nextActiveExecutionIdentity:'old-run'},current)).toThrow('simulation');
 expect(()=>validatePreparedGridInput(grid,{...prepared,nextActiveExecutionIdentity:'ordinary'},current)).toThrow('full input');
 const exact=datasets.find(row=>row.provenance.datasetId===dataset.provenance.datasetId)!;expect(validatePreparedGridInput(grid,{...prepared,nextActiveExecutionIdentity:'ordinary',nextActiveBars:exact.bars},current).replay).toBeNull();
});
