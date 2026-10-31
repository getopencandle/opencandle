import {expect,it,vi} from 'vitest';
import {createWorkspaceChartHost,type ChartTreeTransition} from '../../src/ui/workspace-chart-host';
import {createMultiChartState,type GridTreeInput,type MultiChartGridProps,type MultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import type {CellStudyIntent} from '../../src/ui/cell-study-intents';
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function setup(){
 const data=fixtureDataset('GME',4),base=createMultiChartState(data,{appearance:defaultTheme.appearance}),states=Object.fromEntries(['A','B'].map(id=>[id,{...base,layout:{...base.layout,id}}])) as Record<string,MultiChartState>;
 const trees=Object.fromEntries(['A','B'].map(id=>{const hold={isCurrent:()=>true,resume:vi.fn(),retire:vi.fn(),dispose:vi.fn()},lease={canonicalState:states[id],activeController:{synthetic:id} as any,isCurrent:()=>true,publish:()=>({publicationErrors:[] as string[]}),dispose:vi.fn()},coordinator={suspend:()=>hold,inventory(){throw Error('Unrelated inventory must not be read.');},async apply(){throw Error('Unrelated input transaction must not run.');},waitUntilReady:vi.fn(async(next:GridTreeInput)=>{lease.canonicalState=next.state;return lease;})};return[id,{hold,lease,coordinator}];}));
 const accepted:CellStudyIntent[]=[],callback=vi.fn((intent:CellStudyIntent)=>{accepted.push(intent);return true;});let alive=true,props:MultiChartGridProps={state:states.A,datasets:[data],activeBars:data.bars,activeDatasetId:data.provenance.datasetId,activeExecutionIdentity:'ordinary',onChange:()=>true,onReady:()=>{},onActiveCell:()=>{},onStudyIntent:callback};
 const host=createWorkspaceChartHost({read:()=>props,changed:()=>{},alive:()=>alive}),first=host.slots()[0];first.callbacks.onTransactionReady?.(trees.A.coordinator);
 const input=(state:MultiChartState):GridTreeInput=>({state,datasets:props.datasets,activeBars:props.activeBars!,activeDatasetId:props.activeDatasetId!,activeExecutionIdentity:'ordinary'});
 const request=(id:string):ChartTreeTransition=>({expected:input(props.state),next:input(states[id]),view:{appearance:defaultTheme.appearance},assertCurrent:()=>true,park:true,commitModel(state,mark){props={...props,state};mark();}});
 async function go(id:string){const before=new Set(host.slots()),pending=host.controller.transition(request(id));await tick();const stage=host.slots().find(slot=>slot.mode==='staging')!;if(before.has(stage))host.rendered();else stage.callbacks.onTransactionReady?.(trees[id].coordinator);const result=await pending;host.sync();return result;}
 const intent:CellStudyIntent={target:{cellId:base.layout.activeCellId,controller:trees.A.lease.activeController,input:{} as any,executionIdentity:'ordinary'},subject:{kind:'builtin',id:'synthetic-study',fingerprint:'synthetic'},action:{kind:'settings'},assertCellCurrent(){}};
 return{host,first,trees,accepted,callback,intent,request,go,unmount(){alive=false;host.cancel('Synthetic unmount');}};
}
it('terminally revokes the pending active intent across parked and reused native tree identity',async()=>{
 const h=setup();expect(h.first.callbacks.onStudyIntent?.(h.intent)).toBe(true);const old=h.accepted[0];expect(old.assertTreeCurrent).not.toThrow();await h.go('B');expect(h.first.mode).toBe('parked');expect(old.assertTreeCurrent).toThrow('previous');expect(h.first.callbacks.onStudyIntent?.(h.intent)).toBe(false);
 await h.go('A');expect(h.host.slots().find(slot=>slot.mode==='active')).toBe(h.first);expect(h.first.callbacks.onStudyIntent?.(h.intent)).toBe(true);expect(h.accepted.at(-1)!.assertTreeCurrent).not.toThrow();expect(old.assertTreeCurrent).toThrow('previous');h.unmount();
});
it('held and staging trees cannot dispatch; a failed switch cannot resurrect the old captured intent',async()=>{
 const h=setup();h.first.callbacks.onStudyIntent?.(h.intent);const captured=h.accepted[0],pending=h.host.controller.transition(h.request('B'));expect(h.first.mode).toBe('held');expect(h.first.callbacks.onStudyIntent?.(h.intent)).toBe(false);await tick();const stage=h.host.slots().find(slot=>slot.mode==='staging')!;expect(stage.callbacks.onStudyIntent?.(h.intent)).toBe(false);h.trees.B.coordinator.waitUntilReady.mockRejectedValueOnce(Error('Synthetic staging refusal'));stage.callbacks.onTransactionReady?.(h.trees.B.coordinator);const result=await pending;expect(result.committed).toBe(false);expect(h.first.mode).toBe('active');expect(captured.assertTreeCurrent).toThrow('previous');expect(h.first.callbacks.onStudyIntent?.(h.intent)).toBe(true);h.unmount();
});
it('accepted native publication failure quarantines the target and never reauthorizes held callbacks',async()=>{
 const h=setup();h.first.callbacks.onStudyIntent?.(h.intent);const captured=h.accepted[0];h.trees.B.lease.publish=()=>({publicationErrors:['Synthetic accepted native publication failed']});const result=await h.go('B');expect(result.committed).toBe(true);expect(h.host.slots().find(slot=>slot.mode==='quarantined')?.callbacks.onStudyIntent?.(h.intent)).toBe(false);expect(captured.assertTreeCurrent).toThrow('previous');expect(h.first.callbacks.onStudyIntent?.(h.intent)).toBe(false);h.unmount();
});
