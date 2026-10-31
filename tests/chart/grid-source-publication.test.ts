import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createMultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {defaultTheme} from '../../src/ui/themes';
import {createGridAnalysisCoordinator} from '../../src/chart/grid-analysis-coordinator';
import type {ChartController} from '../../src/chart/adapter';
import type {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';
it('rejected linked source publication restores all native leases, saved source/model and pending state without success or seal',async()=>{
 const beforeData=fixtureDataset('GME',5),nextData=fixtureDataset('SPY',5),before=resizeMultiChartState(createMultiChartState(beforeData,{appearance:defaultTheme.appearance}),'two-columns'),next=structuredClone(before),native=new Map(before.layout.cells.map(cell=>[cell.id,beforeData.provenance.datasetId])),events:string[]=[];let saved=before,pending=false,history=0;
 for(const cell of next.layout.cells){cell.symbol='SPY';next.cells[cell.id].datasetId=nextData.provenance.datasetId;}
 const coordinator=createGridAnalysisCoordinator({read:()=>({state:saved,datasets:[beforeData,nextData]}),controller:id=>({prepareAnalysisSnapshot:async(request:any)=>{const prior=native.get(id)!;native.set(id,request.next.source.datasetId);events.push('apply:'+id);return{changed:true,isCurrent:()=>true,commit(){events.push('commit:'+id);},seal(){events.push('seal:'+id);},async rollback(){native.set(id,prior);events.push('rollback:'+id);}};},saveDrawings:()=>({version:1,drawings:[]}),indicators:{serialize:()=>[]},getAnalysisUnavailable:()=>''}) as unknown as ChartController,runtime:()=>({prepareBindings:()=>({changed:true,pauseAndCapture(){},stage(){},rollback(){},resume(){},abandon(){}})}) as unknown as ScriptBindingRuntime,pending:value=>{pending=value;},holdLinks:()=>({release(){events.push('release');}}),preparedInputs(){},failed(){throw Error('Unexpected incomplete recovery');}});
 await expect(coordinator.apply({expectedState:before,nextState:next,nextDatasets:[beforeData,nextData],activeBars:beforeData.bars,nextActiveBars:nextData.bars,assertCurrent:()=>saved===before,commitModel(){events.push('rejected');throw Error('Workspace capacity rejected proposed state');}})).rejects.toThrow('capacity rejected');
 expect(saved).toBe(before);expect(history).toBe(0);expect(pending).toBe(false);expect([...native.values()]).toEqual([beforeData.provenance.datasetId,beforeData.provenance.datasetId]);expect(events.some(value=>value.startsWith('seal:'))).toBe(false);expect(events.filter(value=>value.startsWith('rollback:'))).toEqual(before.layout.cells.map(cell=>'rollback:'+cell.id).reverse());expect(events.at(-1)).toBe('release');
});
