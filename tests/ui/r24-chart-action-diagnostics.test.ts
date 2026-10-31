import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {captureRootChartAction,ChartActionStaleError,CHART_ACTION_STALE_MESSAGE,type RootChartTarget} from '../../src/ui/chart-action-ownership';
import {sameDatasetInput,sameDatasetsInput,stampLiveLineage} from '../../src/chart/bar-input-identity';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {ChartMenuSnapshot} from '../../src/chart/context-menu';
import type {BarDataset} from '../../src/domain/types';

// and 5: the root chart-action ownership compares bars by live lineage, and a stale target names the
// failed term in its diagnostic while the user message stays plain. SYNTHETIC fixtures only.
function setup(bars=fixtureDataset('SPY',5).bars){
 const dataset={...fixtureDataset('SPY',5),bars},controller={} as any,input={bars,source:sourceContextForDataset(dataset,bars),style:'candles'};
 let current:RootChartTarget={epoch:3,cellId:'cell-2',controller,input,executionIdentity:'ordinary'};
 const snapshot={token:{},treeOwner:{},instrument:dataset.instrument,entity:{kind:'chart'},client:null,local:null,point:{price:null,logical:null,barIndex:null,barTime:null,unit:null,pane:null},cellId:current.cellId,controller,input,executionIdentity:current.executionIdentity} as unknown as ChartMenuSnapshot;
 const lease={snapshot,isCurrent:vi.fn(()=>true),isOwnerCurrent:vi.fn(()=>true),release:vi.fn()};
 return{dataset,lease,original:current,set:(patch:Partial<RootChartTarget>)=>{current={...current,...patch};},owner:captureRootChartAction(snapshot,lease,()=>current)};
}
const failure=(run:()=>void)=>{try{run();}catch(error){return error;}throw Error('expected a refusal');};

it.each([
 ['epoch',(s:ReturnType<typeof setup>)=>s.set({epoch:4})],
 ['owner',(s:ReturnType<typeof setup>)=>s.set({cellId:'cell-1'})],
 ['owner',(s:ReturnType<typeof setup>)=>s.set({controller:{} as any})],
 ['bars',(s:ReturnType<typeof setup>)=>s.set({input:{...s.original.input,bars:s.original.input.bars.slice()}})],
 ['style',(s:ReturnType<typeof setup>)=>s.set({input:{...s.original.input,style:'line'}})],
 ['execution',(s:ReturnType<typeof setup>)=>s.set({executionIdentity:'replay-run'})],
 ['source',(s:ReturnType<typeof setup>)=>s.set({input:{...s.original.input,source:{...s.original.input.source,revision:'2'}}})],
 ['owner',(s:ReturnType<typeof setup>)=>s.lease.isOwnerCurrent.mockReturnValue(false)],
] as const)('a stale %s is named in the diagnostic; the message stays plain',(term,change)=>{
 const s=setup();expect(()=>s.owner.assertCurrent()).not.toThrow();change(s);
 const error=failure(()=>s.owner.assertCurrent()) as ChartActionStaleError;
 expect(error).toBeInstanceOf(ChartActionStaleError);expect(error).toBeInstanceOf(Error);
 expect(error.message).toBe(CHART_ACTION_STALE_MESSAGE);expect(error.message).toBe('The chart changed. Reopen the menu.');
 expect(error.term).toBe(term);expect(error.diagnostic).toContain('stale: '+term+' (');expect(error.message).not.toContain('stale');
});
it('live bars: another snapshot of the captured lineage stays current; another lineage is refused as bars',()=>{
 const base=fixtureDataset('SPY',5).bars,first=base.slice(0,4);stampLiveLineage(first,'live:synthetic:SPY|live-v1:a:1',1);
 const s=setup(first),grown=base.slice();stampLiveLineage(grown,'live:synthetic:SPY|live-v1:a:1',2);
 s.set({input:{...s.original.input,bars:grown}});expect(()=>s.owner.assertCurrent()).not.toThrow();
 const renewed=base.slice();stampLiveLineage(renewed,'live:synthetic:SPY|live-v1:a:2',3);// a re-adjusted reload: a new revision
 s.set({input:{...s.original.input,bars:renewed}});expect((failure(()=>s.owner.assertCurrent()) as ChartActionStaleError).term).toBe('bars');
 const plain=base.slice();s.set({input:{...s.original.input,bars:plain}});expect((failure(()=>s.owner.assertCurrent()) as ChartActionStaleError).term).toBe('bars');
});
it('sameDatasetInput / sameDatasetsInput: exact objects or one live lineage with the same id, revision, instrument and resolution',()=>{
 const fixture=fixtureDataset('GME',4),live=(bars:BarDataset['bars'],seq:number,revision='live-v1:s:1'):BarDataset=>{const copy=bars.slice();stampLiveLineage(copy,'live:synthetic:GME|'+revision,seq);return {...fixture,bars:copy,provenance:{...fixture.provenance,datasetId:'live:synthetic:GME',revision}};};
 const a=live(fixture.bars,1),b=live([...fixture.bars,{...fixture.bars[3],time:fixture.bars[3].time+86400}],2);
 expect(sameDatasetInput(fixture,fixture)).toBe(true);expect(sameDatasetInput(fixture,{...fixture})).toBe(false);
 expect(sameDatasetInput(a,b)).toBe(true);
 expect(sameDatasetInput(a,live(fixture.bars,3,'live-v1:s:2'))).toBe(false);
 expect(sameDatasetInput(a,{...b,resolution:'1h'})).toBe(false);
 expect(sameDatasetInput(a,{...b,instrument:{...b.instrument,id:'other'}})).toBe(false);
 expect(sameDatasetsInput([fixture,a],[fixture,b])).toBe(true);expect(sameDatasetsInput([fixture,a],[fixture])).toBe(false);expect(sameDatasetsInput([fixture,a],[{...fixture},b])).toBe(false);
});
it('App drawing capture (captureDrawingWorkspace) compares the opening input by lineage, not array identity',()=>{
 const app=readFileSync('src/ui/App.tsx','utf8'),start=app.indexOf('const captureDrawingWorkspace='),body=app.slice(start,app.indexOf('return Object.freeze',start));
 expect(start).toBeGreaterThan(0);
 expect(body).toContain('!sameDatasetInput(now.dataset,openingInput.dataset)||!sameDatasetsInput(now.datasets,openingInput.datasets)||!sameBarsInput(now.bars,openingInput.bars)');
 expect(body).not.toMatch(/now\.(bars|dataset|datasets)!==openingInput\./);
});
