import {expect,it} from 'vitest';
import {createGridAnalysisCoordinator} from '../../src/chart/grid-analysis-coordinator';
import {createMultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {defaultTheme} from '../../src/ui/themes';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {ChartController} from '../../src/chart/adapter';
import type {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';

// Literal failure injection into the actual coordinator, no renderer or native API.
function setup(){
 const data=fixtureDataset('GME',5),state=resizeMultiChartState(createMultiChartState(data,{appearance:defaultTheme.appearance,scriptBindings:[]}), 'three-columns'),ids=state.layout.cells.map(row=>row.id),next=structuredClone(state);
 const calls:string[]=[],failed:string[]=[],throwSeal=new Set<string>();let model=0,history=0,throwPrepare='',throwRelease=false,throwHold=false,throwFailureSink=false,current=state;
 const port={read:()=>({state:current,datasets:[data]}),controller:(id:string)=>({prepareAnalysisSnapshot:async()=>{calls.push('prepare:'+id);if(id===throwPrepare)throw new Error('Synthetic prepare failure');return {changed:true,isCurrent:()=>true,commit:()=>calls.push('commit:'+id),seal:()=>{calls.push('seal:'+id);if(throwSeal.has(id))throw new Error('Synthetic seal failure');},rollback:async()=>{calls.push('rollback:'+id);}};},saveDrawings:()=>({version:1,drawings:[]}),indicators:{serialize:()=>[]},getAnalysisUnavailable:()=>''}) as unknown as ChartController,runtime:()=>({prepareBindings:()=>({changed:true,pauseAndCapture(){},stage(){},rollback(){},resume(){},abandon(){}})}) as unknown as ScriptBindingRuntime,pending:(active:boolean)=>{calls.push('pending:'+active);},holdLinks:()=>{calls.push('hold');if(throwHold)throw new Error('Synthetic hold failure');return {release:()=>{calls.push('release');if(throwRelease)throw new Error('Synthetic release failure');}};},preparedInputs:()=>{calls.push('inputs');},failed:(targets:string[])=>{failed.push(...targets);if(throwFailureSink)throw new Error('Synthetic diagnostic sink failure');}};
 const coordinator=createGridAnalysisCoordinator(port),request=()=>({expectedState:current,nextState:next,nextDatasets:[data],assertCurrent:()=>true,commitModel:(mark:()=>void)=>{model++;history++;current=next;mark();calls.push('model');}});
 return {coordinator,request,calls,failed,ids,throwSeal,setPrepare:(id:string)=>throwPrepare=id,setRelease:(value:boolean)=>throwRelease=value,setHold:(value:boolean)=>throwHold=value,setFailureSink:(value:boolean)=>throwFailureSink=value,counts:()=>({model,history})};
}
it('a second-chart seal failure attempts every seal and commits model/history once without a false rollback',async()=>{
 const t=setup();t.throwSeal.add(t.ids[1]);const result=await t.coordinator.apply(t.request());
 expect(t.counts()).toEqual({model:1,history:1});expect(t.calls.filter(call=>call.startsWith('seal:'))).toEqual(t.ids.map(id=>'seal:'+id));expect(t.calls.filter(call=>call.startsWith('rollback:'))).toEqual([]);expect(result.publicationErrors).toHaveLength(1);expect(t.failed).toEqual([t.ids[1]]);expect(t.calls.slice(-2)).toEqual(['release','pending:false']);
});
it('a preparation failure rolls back earlier native leases and never advances model or history',async()=>{
 const t=setup();t.setPrepare(t.ids[1]);await expect(t.coordinator.apply(t.request())).rejects.toThrow('prepare failure');expect(t.counts()).toEqual({model:0,history:0});expect(t.calls.filter(call=>call.startsWith('rollback:'))).toEqual(['rollback:'+t.ids[0]]);expect(t.calls).not.toContain('model');expect(t.calls.slice(-2)).toEqual(['release','pending:false']);
});
it('a postcommit link-release failure is a publication diagnostic and still clears pending ownership',async()=>{
 const t=setup();t.setRelease(true);const result=await t.coordinator.apply(t.request());expect(result.publicationErrors.join(' ')).toContain('release');expect(t.counts()).toEqual({model:1,history:1});expect(t.calls).toContain('pending:false');expect(t.calls.some(call=>call.startsWith('rollback:'))).toBe(false);
 t.setRelease(false);await expect(t.coordinator.apply(t.request())).resolves.toHaveProperty('publicationErrors');
});
it('a failed diagnostic sink cannot skip a later seal or falsely turn an already committed action into rollback',async()=>{
 const t=setup();t.throwSeal.add(t.ids[1]);t.setFailureSink(true);const result=await t.coordinator.apply(t.request());expect(result.publicationErrors.join(' ')).toContain('diagnostic');expect(t.calls.filter(call=>call.startsWith('seal:'))).toEqual(t.ids.map(id=>'seal:'+id));expect(t.counts()).toEqual({model:1,history:1});expect(t.calls.some(call=>call.startsWith('rollback:'))).toBe(false);
});
it('failed link acquisition releases the busy guard before a subsequent authorized attempt',async()=>{
 const t=setup();t.setHold(true);await expect(t.coordinator.apply(t.request())).rejects.toThrow('hold failure');expect(t.counts()).toEqual({model:0,history:0});t.setHold(false);await expect(t.coordinator.apply(t.request())).resolves.toHaveProperty('publicationErrors');expect(t.counts()).toEqual({model:1,history:1});
});
