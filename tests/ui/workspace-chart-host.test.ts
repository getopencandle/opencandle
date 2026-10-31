import {expect,it,vi} from 'vitest';
import {createWorkspaceChartHost,type ChartTreeTransition} from '../../src/ui/workspace-chart-host';
import {createMultiChartState,resizeMultiChartState,type GridTreeInput,type MultiChartGridProps} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
// Actual host lifecycle and callback ownership with controlled native leases.
// No DOM rendering or native readiness is asserted by these tests.
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function setup(){
 const dataset=fixtureDataset('GME',4),state=createMultiChartState(dataset,{appearance:defaultTheme.appearance}),controller={synthetic:'old'},nextController={synthetic:'new'};
 let alive=true,current=true,committed=0;
 let props:MultiChartGridProps={state,datasets:[dataset],activeBars:dataset.bars,activeDatasetId:dataset.provenance.datasetId,activeExecutionIdentity:'ordinary',onChange:vi.fn(()=>true),onReady:vi.fn(),onActiveCell:vi.fn(),onTransactionReady:vi.fn(),onScriptResult:vi.fn()};
 const changed=vi.fn(),host=createWorkspaceChartHost({read:()=>props,changed,alive:()=>alive});
 const oldHold={isCurrent:vi.fn(()=>true),resume:vi.fn(),retire:vi.fn(),dispose:vi.fn()},oldCoordinator={suspend:vi.fn(()=>oldHold)};
 host.slots()[0].callbacks.onTransactionReady?.(oldCoordinator as any);host.slots()[0].callbacks.onReady(controller as any);
 const expected:GridTreeInput={state,datasets:props.datasets,activeBars:props.activeBars!,activeDatasetId:props.activeDatasetId!,activeExecutionIdentity:'ordinary'},next={...expected,state:resizeMultiChartState(state,'two-columns')};
 const stageLease={canonicalState:next.state,activeController:nextController as any,isCurrent:vi.fn(()=>true),publish:vi.fn(()=>({publicationErrors:[] as string[]})),dispose:vi.fn()};
 const request:ChartTreeTransition={expected,next,view:{appearance:defaultTheme.appearance},assertCurrent:()=>current,commitModel:(canonical,receipt)=>{committed++;props={...props,state:canonical};receipt();}};
 const stageCoordinator={waitUntilReady:vi.fn(async()=>stageLease)};
 const mount=()=>{const stage=host.slots().at(-1)!;stage.callbacks.onTransactionReady?.(stageCoordinator as any);stage.callbacks.onReady(nextController as any);return stage;};
 return{host,props:()=>props,setProps:(next:MultiChartGridProps)=>{props=next;},oldHold,oldCoordinator,request,stageLease,stageCoordinator,mount,changed,controller,nextController,committed:()=>committed,setCurrent:(value:boolean)=>{current=value;},unmount:()=>{alive=false;host.cancel('Synthetic unmount');}};
}
it('a prepared drawing publication advances only its exact active tree at the workspace marker',()=>{
 const s=setup(),old=s.host.slots()[0],next=structuredClone(s.props().state),id=next.layout.activeCellId;next.cells[id].drawings={version:1,drawings:[{id:'copy',type:'future-drawing'}]};
 let rootState=s.props().state;
 s.setProps({...s.props(),onCaptureDrawingWorkspace:expected=>{
  expect(expected).toBe(rootState);return{assertCurrent:()=>{},prepare:value=>({assertCurrent:()=>{},publish:mark=>{rootState=value;mark();}})};
 }});
 const command=old.callbacks.onCaptureDrawingWorkspace!(rootState),pending=command.prepare(next),mark=vi.fn(()=>expect(old.input.state).toBe(next));
 expect(old.input.state).not.toBe(next);pending.publish(mark);expect(mark).toHaveBeenCalledOnce();expect(old.awaitingProps).toBe(next);pending.assertCurrent();command.assertCurrent();
 s.host.sync();expect(old.input.state).toBe(next);expect(old.callbacks.onChange(next)).toBe(false);
 s.setProps({...s.props(),state:next});s.host.sync();expect(old.awaitingProps).toBeNull();expect(()=>pending.publish(mark)).toThrow('consumed');
});
it('equal input replacement retires a prepared drawing tree before model publication',()=>{
 const s=setup(),slot=s.host.slots()[0],publish=vi.fn();s.setProps({...s.props(),onCaptureDrawingWorkspace:()=>({assertCurrent:()=>{},prepare:()=>({assertCurrent:()=>{},publish})})});
 const pending=slot.callbacks.onCaptureDrawingWorkspace!(s.props().state).prepare(structuredClone(s.props().state));
 s.host.sync();expect(()=>pending.publish(()=>{})).toThrow('replaced');expect(publish).not.toHaveBeenCalled();
});
it('a late drawing acknowledgement cannot rewrite the tree after synchronous publication ended',()=>{
 const s=setup(),slot=s.host.slots()[0],before=slot.input;let retained!:()=>void;
 s.setProps({...s.props(),onCaptureDrawingWorkspace:()=>({assertCurrent:()=>{},prepare:()=>({assertCurrent:()=>{},publish:mark=>{retained=mark;}})})});
 const pending=slot.callbacks.onCaptureDrawingWorkspace!(s.props().state).prepare(structuredClone(s.props().state));
 expect(()=>pending.publish(()=>{})).toThrow('acknowledge synchronously');expect(()=>retained()).toThrow('late or repeated');expect(slot.input).toBe(before);
});
it('accepted drawing state survives a later root view error and repeated markers do not change it',()=>{
 const s=setup(),slot=s.host.slots()[0],next=structuredClone(s.props().state);let retained!:()=>void;
 s.setProps({...s.props(),onCaptureDrawingWorkspace:()=>({assertCurrent:()=>{},prepare:()=>({assertCurrent:()=>{},publish:mark=>{retained=mark;mark();throw Error('Synthetic view failure');}})})});
 const pending=slot.callbacks.onCaptureDrawingWorkspace!(s.props().state).prepare(next),mark=vi.fn();expect(()=>pending.publish(mark)).toThrow('Synthetic view');expect(mark).toHaveBeenCalledOnce();expect(slot.input.state).toBe(next);pending.assertCurrent();
 expect(()=>retained()).toThrow('late or repeated');expect(mark).toHaveBeenCalledOnce();
});
it('a held tree cannot capture a drawing command or dispatch history',async()=>{
 const s=setup(),slot=s.host.slots()[0],capture=vi.fn(),history=vi.fn();s.setProps({...s.props(),onCaptureDrawingWorkspace:capture,onDrawingHistory:history});
 const pending=s.host.controller.transition(s.request);expect(slot.mode).toBe('held');
 expect(()=>slot.callbacks.onCaptureDrawingWorkspace!(s.props().state)).toThrow('retired');expect(()=>slot.callbacks.onDrawingHistory!('undo',s.props().state)).toThrow('replaced');expect(capture).not.toHaveBeenCalled();expect(history).not.toHaveBeenCalled();
 s.mount();await pending;
});
it('holds the old tree, stages hidden callback ownership and commits canonical input once',async()=>{
 const s=setup(),old=s.host.slots()[0],pending=s.host.controller.transition(s.request);
 expect(s.oldCoordinator.suspend).toHaveBeenCalledWith(s.request.expected);expect(old.mode).toBe('held');expect(s.host.slots()).toHaveLength(2);
 expect(old.callbacks.onChange(s.request.expected.state)).toBe(false);const stage=s.mount();expect(stage.mode).toBe('staging');expect(stage.callbacks.onChange(s.request.next.state)).toBe(false);
 expect(s.props().onReady).toHaveBeenCalledTimes(1);
 const result=await pending;expect(result).toEqual({committed:true,cancelled:false,errors:[]});expect(s.committed()).toBe(1);expect(s.oldHold.retire).toHaveBeenCalledOnce();expect(s.oldHold.dispose).toHaveBeenCalledOnce();expect(s.oldHold.resume).not.toHaveBeenCalled();expect(s.host.slots()).toEqual([stage]);
 old.callbacks.onReady(null);old.callbacks.onTransactionReady?.(null);expect(s.props().onReady).toHaveBeenLastCalledWith(s.nextController);expect(s.props().onTransactionReady).toHaveBeenLastCalledWith(s.stageCoordinator);
 s.host.sync();expect(stage.callbacks.onChange(s.request.next.state)).toBe(true);
});
it('cannot adopt old React props between model acceptance and target prop publication',async()=>{
 const s=setup(),original=s.props();s.request.commitModel=(_canonical,receipt)=>receipt();const pending=s.host.controller.transition(s.request),stage=s.mount();await pending;s.host.sync();expect(stage.input.state).toBe(s.request.next.state);expect(stage.callbacks.onChange(original.state)).toBe(false);
 s.setProps({...original,state:s.request.next.state});s.host.sync();expect(stage.callbacks.onChange(s.request.next.state)).toBe(true);
});
it('rejects equal-valued substituted input arrays before acquiring native ownership',async()=>{
 const s=setup();await expect(s.host.controller.transition({...s.request,expected:{...s.request.expected,activeBars:s.request.expected.activeBars.slice()}})).rejects.toThrow('no longer matches');expect(s.oldCoordinator.suspend).not.toHaveBeenCalled();expect(s.host.slots()).toHaveLength(1);
});
it('readiness failure removes staging callbacks and resumes the unchanged original tree',async()=>{
 const s=setup();s.stageCoordinator.waitUntilReady.mockRejectedValueOnce(Error('Synthetic late-cell failure'));const pending=s.host.controller.transition(s.request),stage=s.mount(),result=await pending;
 expect(result).toMatchObject({committed:false,errors:['Synthetic late-cell failure']});expect(s.committed()).toBe(0);expect(s.oldHold.resume).toHaveBeenCalledOnce();expect(s.oldHold.dispose).not.toHaveBeenCalled();expect(stage.mode).toBe('retired');expect(stage.callbacks.onChange(s.request.next.state)).toBe(false);expect(s.host.slots()).toHaveLength(1);
});
it('a rejected root model publication disposes the prepared stage and retains the old owner',async()=>{
 const s=setup();s.request.commitModel=()=>{throw Error('Synthetic capacity rejection');};const pending=s.host.controller.transition(s.request);s.mount();const result=await pending;
 expect(result.committed).toBe(false);expect(s.stageLease.dispose).toHaveBeenCalledOnce();expect(s.oldHold.resume).toHaveBeenCalledOnce();expect(s.stageLease.publish).not.toHaveBeenCalled();
});
it('postcommit old cleanup failure leaves the target quarantined and never resurrects the old tree',async()=>{
 const s=setup();s.oldHold.dispose.mockImplementation(()=>{throw Error('Synthetic old teardown failure');});const pending=s.host.controller.transition(s.request),stage=s.mount(),result=await pending;
 expect(result).toMatchObject({committed:true,errors:['Synthetic old teardown failure']});expect(s.committed()).toBe(1);expect(s.oldHold.resume).not.toHaveBeenCalled();expect(stage.mode).toBe('quarantined');expect(s.props().onReady).toHaveBeenLastCalledWith(null);expect(stage.callbacks.onChange(s.request.next.state)).toBe(false);expect(s.host.slots()).toEqual([stage]);
});
it('native publication error leaves one accepted model and an unavailable target',async()=>{
 const s=setup();s.stageLease.publish.mockReturnValue({publicationErrors:['Synthetic stage publication failure']});const pending=s.host.controller.transition(s.request),stage=s.mount(),result=await pending;
 expect(result.committed).toBe(true);expect(result.errors.join()).toContain('publication failure');expect(s.committed()).toBe(1);expect(stage.mode).toBe('quarantined');expect(s.oldHold.dispose).toHaveBeenCalledOnce();
});
it('unmount cancellation retires late readiness instead of publishing or reviving a stale tree',async()=>{
 const s=setup();let resolve!:(value:any)=>void;s.stageCoordinator.waitUntilReady.mockReturnValueOnce(new Promise(yes=>resolve=yes));const pending=s.host.controller.transition(s.request),stage=s.mount();await tick();s.unmount();const result=await pending;expect(result).toMatchObject({committed:false,cancelled:true});expect(s.oldHold.resume).not.toHaveBeenCalled();expect(s.oldHold.dispose).toHaveBeenCalledOnce();resolve(s.stageLease);await tick();expect(s.stageLease.dispose).toHaveBeenCalledOnce();expect(s.stageLease.publish).not.toHaveBeenCalled();expect(stage.mode).toBe('retired');
});
it('checks exact staged native ownership again after asynchronous readiness',async()=>{
 const s=setup();s.stageLease.isCurrent.mockReturnValue(false);const pending=s.host.controller.transition(s.request);s.mount();const result=await pending;expect(result.committed).toBe(false);expect(s.stageLease.dispose).toHaveBeenCalledOnce();expect(s.oldHold.resume).toHaveBeenCalledOnce();
});
it('forwards menu actions only from the active accepted tree and releases refused handoffs',async()=>{
 const s=setup(),note=vi.fn(()=>true),lease=()=>({snapshot:{} as any,isCurrent:()=>true,isOwnerCurrent:()=>true,release:vi.fn()});
 s.setProps({...s.props(),contextActions:{note}});s.host.sync();const old=s.host.slots()[0],action=old.callbacks.contextActions!.note!,first=lease();
 await expect(action({} as any,first)).resolves.toBe(true);expect(note).toHaveBeenCalledOnce();expect(first.release).not.toHaveBeenCalled();
 const pending=s.host.controller.transition(s.request),held=lease();await expect(action({} as any,held)).resolves.toBe(false);expect(held.release).toHaveBeenCalledOnce();expect(note).toHaveBeenCalledOnce();
 const staged=s.mount();await pending;const retired=lease();await expect(action({} as any,retired)).resolves.toBe(false);expect(retired.release).toHaveBeenCalledOnce();s.host.sync();const accepted=lease();await expect(staged.callbacks.contextActions!.note!({} as any,accepted)).resolves.toBe(true);expect(note).toHaveBeenCalledTimes(2);
 const acceptedAction=staged.callbacks.contextActions!.note!;s.setProps({...s.props(),contextActions:{}});s.host.sync();expect(staged.callbacks.contextActions?.note).toBeUndefined();const removed=lease();await expect(acceptedAction({} as any,removed)).resolves.toBe(false);expect(removed.release).toHaveBeenCalledOnce();expect(note).toHaveBeenCalledTimes(2);
});
it('failed menu callbacks retire their adopted lease while preserving the failure',async()=>{
 const s=setup(),release=vi.fn(),lease={snapshot:{} as any,isCurrent:()=>true,isOwnerCurrent:()=>true,release};s.setProps({...s.props(),contextActions:{note:()=>{throw Error('Synthetic dialog allocation failure');}}});s.host.sync();
 await expect(s.host.slots()[0].callbacks.contextActions!.note!({} as any,lease)).rejects.toThrow('Synthetic dialog allocation failure');expect(release).toHaveBeenCalledOnce();
});
it('only flushes staged script results after the canonical target props become current',async()=>{
 const s=setup(),id=s.request.next.state.layout.activeCellId,binding={id:'synthetic-script',documentId:'d',version:1,name:'Synthetic',source:'({})',pane:'price' as const,visible:true,plots:{}};
 s.request.next.state.cells[id].scriptBindings=[binding];const pending=s.host.controller.transition(s.request),stage=s.mount(),result={bindingId:binding.id,sourceCode:binding.source} as any;stage.callbacks.onScriptResult?.(result,id);expect(s.props().onScriptResult).not.toHaveBeenCalled();await pending;s.host.flushResults();expect(s.props().onScriptResult).not.toHaveBeenCalled();s.host.sync();s.host.flushResults();expect(s.props().onScriptResult).toHaveBeenCalledExactlyOnceWith(result,id);s.host.flushResults();expect(s.props().onScriptResult).toHaveBeenCalledOnce();
});
