import {expect,it} from 'vitest';
import {createGridAnalysisCoordinator} from '../../src/chart/grid-analysis-coordinator';
import {createMultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {defaultTheme} from '../../src/ui/themes';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {ChartController} from '../../src/chart/adapter';
import type {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';

// Actual coordinator with controlled native leases. This exercises publication
// ordering and ownership, not a mounted renderer or executable interface.
it.each((['drawings','indicators','prepared-inputs'] as const).flatMap(boundary=>[
 {boundary,owner:'request' as const},{boundary,owner:'second-native-lease' as const},
]))(
 '$owner retirement during $boundary cannot reach the workspace model callback',async({boundary,owner})=>{
  const data=fixtureDataset('GME',5),before=resizeMultiChartState(createMultiChartState(data,{appearance:defaultTheme.appearance,scriptBindings:[]}),'two-columns'),next=structuredClone(before);
  let current=true,retired=false,commits=0,pending=false;
  const nativeOwners=new Map(before.layout.cells.map(row=>[row.id,true]));
  const calls:string[]=[],laterReads:string[]=[];
  const read=(kind:string,id?:string)=>{
   calls.push(kind+(id?':'+id:''));
   if(retired)laterReads.push(kind);
   if(kind===boundary&&!retired){retired=true;if(owner==='request')current=false;else nativeOwners.set(before.layout.cells[1].id,false);}
  };
  const coordinator=createGridAnalysisCoordinator({
   read:()=>({state:before,datasets:[data]}),
   controller:id=>({
    prepareAnalysisSnapshot:async()=>({changed:true,isCurrent:()=>nativeOwners.get(id)===true,commit(){calls.push('native-commit:'+id);},seal(){calls.push('seal:'+id);},async rollback(){calls.push('rollback:'+id);}}),
    saveDrawings(){read('drawings',id);return{version:1,drawings:[]};},
    indicators:{serialize(){read('indicators',id);return[];}},
    getAnalysisUnavailable:()=>'',
   }) as unknown as ChartController,
   runtime:()=>({prepareBindings:()=>({changed:true,pauseAndCapture(){},stage(){},rollback(){},resume(){},abandon(){}})}) as unknown as ScriptBindingRuntime,
   pending(value){pending=value;},holdLinks:()=>({release(){calls.push('release');}}),
   preparedInputs(){read('prepared-inputs');},failed(){},
  });
  let failure:unknown;
  try{await coordinator.apply({expectedState:before,nextState:next,nextDatasets:[data],assertCurrent:()=>current,commitModel(){commits++;calls.push('workspace-commit');}});}catch(error){failure=error;}
  expect(retired).toBe(true);
  expect(current).toBe(owner!=='request');
  expect(commits).toBe(0);
  expect(failure).toBeDefined();
  expect(laterReads).toEqual([]);
  expect(calls.some(value=>value.startsWith('seal:'))).toBe(false);
  expect(pending).toBe(false);
 });
