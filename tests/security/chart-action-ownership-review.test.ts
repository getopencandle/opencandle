import {expect,it,vi} from 'vitest';
import {captureRootChartAction,type RootChartTarget} from '../../src/ui/chart-action-ownership';
import {createWorkspaceChartHost} from '../../src/ui/workspace-chart-host';
import {createMultiChartState,type MultiChartGridProps} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {ChartMenuSnapshot} from '../../src/chart/context-menu';
import {defaultTheme} from '../../src/ui/themes';
// Actual pure ownership/host implementations; synthetic ports, no native chart/UI pass.
function rootTarget(){const source=fixtureDataset('GME',4),controller={} as any,input={bars:source.bars,source:sourceContextForDataset(source),style:'candles'};
 const current:RootChartTarget={epoch:1,cellId:'review-cell',controller,input,executionIdentity:'review-replay'};
 const snapshot:ChartMenuSnapshot={token:{},treeOwner:{},cellId:current.cellId,controller,input,executionIdentity:current.executionIdentity,instrument:source.instrument,entity:{kind:'chart'},client:null,local:null,point:{price:null,logical:null,barIndex:null,barTime:null,unit:null,pane:null}};
 const lease={snapshot,isCurrent:()=>true,isOwnerCurrent:()=>true,release:vi.fn()},read=vi.fn(()=>current);return{current,snapshot,lease,read};}
function hostTarget(){const source=fixtureDataset('GME',4),props:MultiChartGridProps={state:createMultiChartState(source,{appearance:defaultTheme.appearance}),datasets:[source],activeBars:source.bars,activeDatasetId:source.provenance.datasetId,activeExecutionIdentity:'ordinary',onChange:()=>true,onReady:()=>{},onActiveCell:()=>{},contextActions:{note:vi.fn(()=>true)}};
 let failure=false;const read=()=>{if(failure)throw new Error('Synthetic host current read failed');return props;};const host=createWorkspaceChartHost({read,changed:()=>{},alive:()=>true});const snapshot={} as ChartMenuSnapshot,lease={snapshot,isCurrent:()=>true,isOwnerCurrent:()=>true,release:vi.fn()};
 return{props,host,lease,snapshot,failRead:()=>{failure=true;}};}
it('adopted root capability is released when the first current target read throws',()=>{
 const s=rootTarget();s.read.mockImplementationOnce(()=>{throw Error('Synthetic root current read failed');});expect(()=>captureRootChartAction(s.snapshot,s.lease,s.read)).toThrow('current read failed');expect(s.lease.release).toHaveBeenCalledOnce();
});
it('initial root read and capability cleanup failures retain both diagnostics',()=>{
 const s=rootTarget();s.read.mockImplementationOnce(()=>{throw Error('Synthetic root read failure');});s.lease.release.mockImplementation(()=>{throw Error('Synthetic root release failure');});
 let failure:any;try{captureRootChartAction(s.snapshot,s.lease,s.read);}catch(error){failure=error;}
 expect(failure).toBeInstanceOf(AggregateError);expect(failure.errors.map(String).join(' ')).toContain('root read failure');expect(failure.errors.map(String).join(' ')).toContain('root release failure');expect(s.lease.release).toHaveBeenCalledOnce();
});
it('root release retires the capability before throwing and cannot revive or release it twice',()=>{
 const s=rootTarget(),owner=captureRootChartAction(s.snapshot,s.lease,s.read);s.lease.release.mockImplementation(()=>{throw Error('Synthetic release failure');});expect(()=>owner.release()).toThrow('release failure');expect(()=>owner.assertCurrent(false)).toThrow('closed');owner.release();expect(s.lease.release).toHaveBeenCalledOnce();
});
it('host current-props read failure still releases the offered menu handoff',async()=>{
 const s=hostTarget(),callback=s.host.slots()[0].callbacks.contextActions!.note!;s.failRead();await expect(callback(s.snapshot,s.lease)).rejects.toThrow('current read failed');expect(s.lease.release).toHaveBeenCalledOnce();expect(s.props.contextActions!.note).not.toHaveBeenCalled();
});
it('host callback and release failures remain distinct after all cleanup is attempted',async()=>{
 const s=hostTarget();s.props.contextActions!.note=()=>{throw Error('Synthetic chart action failed');};s.lease.release.mockImplementation(()=>{throw Error('Synthetic action release failed');});
 let failure:any;try{await s.host.slots()[0].callbacks.contextActions!.note!(s.snapshot,s.lease);}catch(error){failure=error;}
 expect(failure).toBeInstanceOf(AggregateError);expect(failure.errors.map(String).join(' ')).toContain('chart action failed');expect(failure.errors.map(String).join(' ')).toContain('action release failed');expect(s.lease.release).toHaveBeenCalledOnce();
});
