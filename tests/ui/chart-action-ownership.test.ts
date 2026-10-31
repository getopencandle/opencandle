import {expect,it,vi} from 'vitest';
import {captureRootChartAction,type RootChartTarget} from '../../src/ui/chart-action-ownership';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {ChartMenuSnapshot} from '../../src/chart/context-menu';

function setup(){
 const dataset=fixtureDataset('SPY',5),controller={} as any,input={bars:dataset.bars,source:sourceContextForDataset(dataset),style:'candles'};
 let current:RootChartTarget={epoch:3,cellId:'cell-2',controller,input,executionIdentity:'historical-run-1'};
 const snapshot:ChartMenuSnapshot={token:{},treeOwner:{},instrument:dataset.instrument,entity:{kind:'chart'},client:null,local:null,point:{price:null,logical:null,barIndex:null,barTime:null,unit:null,pane:null},cellId:current.cellId,controller,input,executionIdentity:current.executionIdentity},lease={snapshot,isCurrent:vi.fn(()=>true),isOwnerCurrent:vi.fn(()=>true),release:vi.fn()};
 return{current:()=>current,set:(patch:Partial<RootChartTarget>)=>{current={...current,...patch};},snapshot,lease,capture:()=>captureRootChartAction(snapshot,lease,()=>current)};
}
it('adopts only the exact menu lease and releases a dialog once',()=>{
 const s=setup();expect(()=>captureRootChartAction({...s.snapshot},s.lease,s.current)).toThrow('no longer current');const owner=s.capture();owner.assertCurrent();owner.release();owner.release();expect(s.lease.release).toHaveBeenCalledOnce();expect(()=>owner.assertCurrent(false)).toThrow('closed');
});
it.each(['epoch','cell','controller','bars','source','style','run'] as const)('rejects changed %s while preserving the original root target',kind=>{
 const s=setup(),owner=s.capture(),original=s.current();
 if(kind==='epoch')s.set({epoch:4});if(kind==='cell')s.set({cellId:'cell-1'});if(kind==='controller')s.set({controller:{} as any});if(kind==='bars')s.set({input:{...original.input,bars:original.input.bars.slice()}});if(kind==='source')s.set({input:{...original.input,source:{...original.input.source,revision:'2'}}});if(kind==='style')s.set({input:{...original.input,style:'line'}});if(kind==='run')s.set({executionIdentity:'ordinary'});
 expect(()=>owner.assertCurrent()).toThrow('The chart changed. Reopen the menu.');expect(()=>owner.assertCurrent(false)).toThrow('The chart changed. Reopen the menu.');
});
it('checks native ownership before preparation while allowing the native lease to govern its owned mutation',()=>{
 const s=setup(),owner=s.capture();s.lease.isOwnerCurrent.mockReturnValue(false);expect(()=>owner.assertCurrent()).toThrow();expect(()=>owner.assertCurrent(false)).not.toThrow();owner.release();expect(()=>owner.assertCurrent(false)).toThrow();
});
it('rejects a failed initial target and retires the adopted capability',()=>{
 const s=setup();s.set({cellId:'other'});expect(s.capture).toThrow();expect(s.lease.release).toHaveBeenCalledOnce();
});
