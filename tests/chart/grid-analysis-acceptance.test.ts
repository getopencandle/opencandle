import {expect,it} from 'vitest';
import {createGridAnalysisCoordinator} from '../../src/chart/grid-analysis-coordinator';
import {createMultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {defaultTheme} from '../../src/ui/themes';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {ChartController} from '../../src/chart/adapter';
import type {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';

function setup(){
 const data=fixtureDataset('GME',5),before=resizeMultiChartState(createMultiChartState(data,{appearance:defaultTheme.appearance}),'two-columns'),next=structuredClone(before),calls:string[]=[];
 let model=before,history=0,pending=false;const seals=new Set<string>();
 const coordinator=createGridAnalysisCoordinator({
  read:()=>({state:model,datasets:[data]}),
  controller:id=>({prepareAnalysisSnapshot:async()=>({changed:true,isCurrent:()=>true,commit(){calls.push('native:'+id);},seal(){calls.push('seal:'+id);if(seals.has(id))throw Error('Synthetic seal failure');},async rollback(){calls.push('rollback:'+id);}}),saveDrawings:()=>({version:1,drawings:[]}),indicators:{serialize:()=>[]},getAnalysisUnavailable:()=>''}) as unknown as ChartController,
  runtime:()=>({prepareBindings:()=>({changed:true,pauseAndCapture(){},stage(){},rollback(){},resume(){},abandon(){}})}) as unknown as ScriptBindingRuntime,
  pending(value){pending=value;},holdLinks:()=>({release(){calls.push('release');}}),preparedInputs(){},failed(ids,message){calls.push('failed:'+ids.join(',')+':'+message);},
 });
 const request=(commitModel:(mark:()=>void)=>void)=>({expectedState:model,nextState:next,nextDatasets:[data],assertCurrent:()=>true,commitModel});
 return{coordinator,request,calls,seals,ids:before.layout.cells.map(row=>row.id),write(){model=next;history++;calls.push('model');},state:()=>({model,history,pending}),before,next};
}

it('accepted model then publication throw seals every native lease without false rollback',async()=>{
 const t=setup();t.seals.add(t.ids[0]);let marker:undefined|(()=>void);
 const result=await t.coordinator.apply(t.request(mark=>{t.write();marker=mark;mark();throw Error('Synthetic view publication failed');}));
 expect(t.state()).toEqual({model:t.next,history:1,pending:false});
 expect(t.calls.filter(x=>x.startsWith('rollback:'))).toEqual([]);
 expect(t.calls.filter(x=>x.startsWith('seal:'))).toEqual(t.ids.map(id=>'seal:'+id));
 expect(result.publicationErrors.join(' ')).toContain('view publication failed');expect(result.publicationErrors.join(' ')).toContain('seal failure');
 expect(()=>marker!()).toThrow(/retired/);
});
it('unacknowledged successful return cannot be mistaken for model acceptance',async()=>{
 const t=setup();await expect(t.coordinator.apply(t.request(()=>{}))).rejects.toThrow(/acknowledge/);
 expect(t.state()).toEqual({model:t.before,history:0,pending:false});expect(t.calls.filter(x=>x.startsWith('seal:'))).toEqual([]);
 expect(t.calls.filter(x=>x.startsWith('rollback:'))).toEqual([...t.ids].reverse().map(id=>'rollback:'+id));
});
it('duplicate acknowledgement is an accepted publication failure and cannot reopen rollback',async()=>{
 const t=setup();const result=await t.coordinator.apply(t.request(mark=>{t.write();mark();mark();}));
 expect(t.state().history).toBe(1);expect(t.calls.some(x=>x.startsWith('rollback:'))).toBe(false);expect(result.publicationErrors.join(' ')).toContain('already');
 expect(t.calls.filter(x=>x.startsWith('seal:'))).toHaveLength(2);
});
it('preaccept throw retires a retained marker and releases the next transaction',async()=>{
 const t=setup();let marker:undefined|(()=>void);
 await expect(t.coordinator.apply(t.request(mark=>{marker=mark;throw Error('Synthetic preaccept rejection');}))).rejects.toThrow('preaccept rejection');
 expect(()=>marker!()).toThrow(/retired/);expect(t.state().history).toBe(0);
 const result=await t.coordinator.apply(t.request(mark=>{t.write();mark();}));expect(result.publicationErrors).toEqual([]);expect(t.state().history).toBe(1);
});
