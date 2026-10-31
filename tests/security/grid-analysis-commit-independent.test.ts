import {expect,it} from 'vitest';
import {createGridAnalysisCoordinator} from '../../src/chart/grid-analysis-coordinator';
import {createMultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {defaultTheme} from '../../src/ui/themes';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {ChartController} from '../../src/chart/adapter';
import type {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';

// Real coordinator; controlled chart-lease callbacks. This does not prove native
// mutation recovery, accepted-after-write handling or GUI interaction.
it.each(['request','other-lease'] as const)('a native commit retiring %s prevents later commits and candidate readback',async retirement=>{
 const dataset=fixtureDataset('GME',5);
 const before=resizeMultiChartState(createMultiChartState(dataset,{appearance:defaultTheme.appearance,scriptBindings:[]}),'two-columns');
 const ids=before.layout.cells.map(cell=>cell.id),current=new Map(ids.map(id=>[id,true]));
 let requestCurrent=true,pending=false,released=0;
 const commits:string[]=[],readbacks:string[]=[],seals:string[]=[],modelCommits:string[]=[];
 const coordinator=createGridAnalysisCoordinator({
  read:()=>({state:before,datasets:[dataset]}),
  controller:id=>({
   prepareAnalysisSnapshot:async()=>({changed:true,isCurrent:()=>current.get(id)===true,
    commit(){commits.push(id);if(id===ids[0]){if(retirement==='request')requestCurrent=false;else current.set(ids[1],false);}},
    seal(){seals.push(id);},async rollback(){/* Native lease owns its recovery authority. */}}),
   saveDrawings(){readbacks.push('drawings:'+id);return{version:1,drawings:[]};},
   indicators:{serialize(){readbacks.push('indicators:'+id);return[];}},getAnalysisUnavailable:()=>'',
  }) as unknown as ChartController,
  runtime:()=>({prepareBindings:()=>({changed:true,pauseAndCapture(){},stage(){},rollback(){},resume(){},abandon(){}})}) as unknown as ScriptBindingRuntime,
  pending(value){pending=value;},holdLinks:()=>({release(){released++;}}),
  preparedInputs(){readbacks.push('prepared-inputs');},failed(){},
 });
 await expect(coordinator.apply({expectedState:before,nextState:structuredClone(before),nextDatasets:[dataset],assertCurrent:()=>requestCurrent,
  commitModel(){modelCommits.push('accepted');}})).rejects.toThrow(/superseded/);
 expect(commits).toEqual([ids[0]]);expect(readbacks).toEqual([]);expect(modelCommits).toEqual([]);expect(seals).toEqual([]);
 expect(released).toBe(1);expect(pending).toBe(false);
 if(retirement==='other-lease')expect(requestCurrent).toBe(true);
});
