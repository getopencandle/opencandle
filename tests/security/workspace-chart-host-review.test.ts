import {expect,it,vi} from 'vitest';
import {createWorkspaceChartHost,type ChartTreeTransition} from '../../src/ui/workspace-chart-host';
import {createMultiChartState,resizeMultiChartState,type GridTreeInput,type MultiChartGridProps} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
// Actual pure host/callback ownership, controlled native hold/ready lease.
// No DOM, inertness/focus, native readiness or rendering is established here.
function fixture(){
 const dataset=fixtureDataset('GME',3),state=createMultiChartState(dataset,{appearance:defaultTheme.appearance}),hold={isCurrent:()=>true,resume:vi.fn(),retire:vi.fn(),dispose:vi.fn()},changed=vi.fn();let props:MultiChartGridProps={state,datasets:[dataset],activeBars:dataset.bars,activeDatasetId:dataset.provenance.datasetId,activeExecutionIdentity:'ordinary',onChange:vi.fn(()=>true),onReady:vi.fn(),onActiveCell:vi.fn(),onTransactionReady:vi.fn(),onScriptResult:vi.fn()};
 const host=createWorkspaceChartHost({read:()=>props,changed,alive:()=>true}),old=host.slots()[0],oldCoordinator={suspend:vi.fn(()=>hold)};old.callbacks.onTransactionReady!(oldCoordinator as any);
 const expected:GridTreeInput={state,datasets:props.datasets,activeBars:dataset.bars,activeDatasetId:dataset.provenance.datasetId,activeExecutionIdentity:'ordinary'},next={...expected,state:resizeMultiChartState(state,'two-rows')},lease={canonicalState:next.state,activeController:{synthetic:'prepared'} as any,isCurrent:()=>true,publish:vi.fn(()=>({publicationErrors:[] as string[]})),dispose:vi.fn()},coordinator={waitUntilReady:vi.fn(async()=>lease)},committed=vi.fn(),request:ChartTreeTransition={expected,next,view:{},assertCurrent:()=>true,commitModel:(canonical,mark)=>{committed();props={...props,state:canonical};mark();}},mount=()=>{const stage=host.slots().at(-1)!;stage.callbacks.onTransactionReady!(coordinator as any);return stage;};
 return{host,old,oldCoordinator,hold,changed,expected,request,lease,coordinator,committed,mount,props:()=>props};
}
it('a view notification failure after acquiring the old hold resumes and releases it before returning rejection',async()=>{
 const s=fixture();s.changed.mockImplementationOnce(()=>{throw Error('Synthetic held-view failure');});const result=await s.host.controller.transition(s.request);expect(result.committed).toBe(false);expect(s.hold.resume).toHaveBeenCalledOnce();expect(s.old.mode).toBe('active');expect(s.host.slots()).toEqual([s.old]);expect(s.committed).not.toHaveBeenCalled();
});
it('a view notification failure while allocating stage removes its partial slot and preserves the old owner',async()=>{
 const s=fixture();s.changed.mockImplementationOnce(()=>{}).mockImplementationOnce(()=>{throw Error('Synthetic staged-view failure');});const result=await s.host.controller.transition(s.request);expect(result.committed).toBe(false);expect(s.host.slots()).toEqual([s.old]);expect(s.old.mode).toBe('active');expect(s.hold.resume).toHaveBeenCalledOnce();expect(s.committed).not.toHaveBeenCalled();
});
it('reentrant callbacks during native hold acquisition cannot publish a chart edit',async()=>{
 const s=fixture();let forwarded:unknown;s.oldCoordinator.suspend.mockImplementation(()=>{forwarded=s.old.callbacks.onChange(s.expected.state);s.old.callbacks.onActiveCell('Synthetic cell',s.expected.state.cells[s.expected.state.layout.activeCellId]);return s.hold;});const running=s.host.controller.transition(s.request);s.mount();await running;expect(forwarded).toBe(false);expect(s.props().onChange).not.toHaveBeenCalled();expect(s.props().onActiveCell).not.toHaveBeenCalled();
});
it('postcommit callback publication faults quarantine the target and never restore old authority',async()=>{
 const s=fixture();(s.props().onReady as any).mockImplementation(()=>{throw Error('Synthetic ready publication failure');});const running=s.host.controller.transition(s.request),stage=s.mount(),result=await running;expect(result.committed).toBe(true);expect(s.committed).toHaveBeenCalledOnce();expect(stage.mode).toBe('quarantined');expect(s.hold.resume).not.toHaveBeenCalled();expect(s.hold.dispose).toHaveBeenCalledOnce();expect(s.host.slots()).toEqual([stage]);expect(stage.callbacks.onChange(s.request.next.state)).toBe(false);
});
it('a throwing quarantined-view notification cannot prevent clearing both published native pointers after commit',async()=>{
 const s=fixture();s.lease.publish.mockReturnValue({publicationErrors:['Synthetic native publication failure']});s.changed.mockImplementation(()=>{if(s.committed.mock.calls.length)throw Error('Synthetic recovery-view failure');});const running=s.host.controller.transition(s.request);s.mount();const result=await running;expect(result.committed).toBe(true);expect(s.hold.dispose).toHaveBeenCalledOnce();expect(s.props().onReady).toHaveBeenLastCalledWith(null);expect(s.props().onTransactionReady).toHaveBeenLastCalledWith(null);expect(s.host.slots()[0].mode).toBe('quarantined');
});
