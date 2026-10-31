import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {activeWatchList,createWatchBook,referenceFromDataset,type WatchList} from '../../src/watchlists/model';
import {calculateWatchAdvanced,createWatchAdvancedState,prepareWatchAdvancedInput,queryWatchAdvancedEvents,queryWatchAdvancedNews,restoreAdvancedData,restoreWatchAdvancedState,type AdvancedInput,type AdvancedObservation} from '../../src/watchlists/advanced';
function input():AdvancedInput{
 const source=fixtureDataset('GME',2);source.provenance.datasetId='synthetic-independent:GME';source.provenance.session='regular';source.provenance.asOf=200;
 source.bars=[{time:100,open:10,high:12,low:9,close:11,volume:5},{time:200,open:11,high:22,low:10,close:21,volume:7}];
 const state=createWatchAdvancedState(),list:WatchList={...activeWatchList(createWatchBook([])),rows:[{id:'review-row',kind:'symbol',reference:referenceFromDataset(source)}]};
 return{list,datasets:[source],settings:state.settings,data:state.data,now:1000};
}
it('prepared authority cannot be forged by copying its shape or supplying accessor fields',()=>{
 const request=input(),prepared=prepareWatchAdvancedInput(request);let reads=0;const copied={...prepared};Object.defineProperty(copied,'rows',{enumerable:true,get(){reads++;throw Error('Getter executed');}});
 expect(()=>queryWatchAdvancedNews(copied,[])).toThrow(/Prepare/);expect(()=>queryWatchAdvancedEvents(copied,[],'earnings')).toThrow(/Prepare/);
 expect(()=>calculateWatchAdvanced(copied)).toThrow(/Unsafe/);expect(reads).toBe(0);
});
it('owns immutable settings, observations, list membership and numerical cells without freezing caller data',()=>{
 const request=input(),prepared=prepareWatchAdvancedInput(request);request.settings.search='Changed';request.list.name='Outside';request.list.rows.splice(0);request.data.fx.push({id:'outside',revision:1,currency:'EUR',rate:1,valuationDate:'2026-10-14',asOf:1000,availableAt:1000,source:'Synthetic review',fixture:true});
 expect(prepared.list.rows).toHaveLength(1);expect(prepared.list.name).not.toBe('Outside');expect(prepared.settings.search).toBe('');expect(prepared.data.fx).toEqual([]);
 expect(()=>{prepared.rows[0].cells.last.value=999;}).toThrow();expect(()=>{prepared.rows[0].reference.symbol='SPY';}).toThrow();expect(()=>{prepared.list.rows.splice(0);}).toThrow();
 expect(calculateWatchAdvanced(prepared).rows[0].cells.last.value).toBe(21);expect(Object.isFrozen(request.datasets[0])).toBe(false);
});
it('detects a replaced source array, revision and source metadata before prepared overview or associated queries',()=>{
 for(const mutate of [(request:AdvancedInput)=>{request.datasets[0].bars=request.datasets[0].bars.map(bar=>({...bar}));},(request:AdvancedInput)=>{request.datasets[0].provenance.revision+='-new';},(request:AdvancedInput)=>{request.datasets[0].instrument.currency='EUR';}]){
  const request=input(),prepared=prepareWatchAdvancedInput(request);mutate(request);
  expect(()=>calculateWatchAdvanced(prepared)).toThrow(/source changed/);expect(()=>queryWatchAdvancedNews(prepared,[])).toThrow(/source changed/);expect(()=>queryWatchAdvancedEvents(prepared,[],'dividend')).toThrow(/source changed/);
 }
});
it('never rereads source OHLC after preparation when a caller violates immutable same-array ownership',()=>{
 const request=input(),prepared=prepareWatchAdvancedInput(request);let reads=0;Object.defineProperty(request.datasets[0].bars[1],'close',{enumerable:true,get(){reads++;throw Error('Late bar getter executed');}});
 expect(calculateWatchAdvanced(prepared).rows[0].cells.last.value).toBe(21);expect(queryWatchAdvancedNews(prepared,[]).rows).toEqual([]);expect(reads).toBe(0);
 // Same-array in-place correction without revision violates the declared host contract.
 // This test proves detached calculations; it does not promise content-mutation detection.
});
it('cancelled prepared input cannot publish overview, calendar or news even after successful preparation',()=>{
 const controller=new AbortController(),request={...input(),signal:controller.signal},prepared=prepareWatchAdvancedInput(request);controller.abort();
 expect(()=>calculateWatchAdvanced(prepared)).toThrow(/cancelled/);expect(()=>queryWatchAdvancedNews(prepared,[])).toThrow(/cancelled/);expect(()=>queryWatchAdvancedEvents(prepared,[],'earnings')).toThrow(/cancelled/);
});
it('rejects hidden, symbolic, serialization-hook and sparse envelope fields without executing them',()=>{
 let reads=0;const accessor=createWatchAdvancedState();Object.defineProperty(accessor.data,'observations',{enumerable:true,get(){reads++;return [];}});
 const hidden=createWatchAdvancedState();Object.defineProperty(hidden.settings,'search',{value:'',enumerable:false});
 const symbol={...createWatchAdvancedState(),[Symbol('hidden')]:1};const hook=createWatchAdvancedState();Object.defineProperty(hook.data,'toJSON',{enumerable:true,value(){reads++;return {};}});
 const sparse=createWatchAdvancedState();sparse.data.fx=new Array(1);
 for(const value of [accessor,hidden,symbol,hook,sparse])expect(()=>restoreWatchAdvancedState(value)).toThrow();expect(reads).toBe(0);
});
it('financial availability cutoff excludes future revisions and unknown availability without changing native source history',()=>{
 const request=input();request.settings.mode='financials';request.settings.asOf=500;
 const observation=(revision:number,value:number,availableAt:number|null):AdvancedObservation=>({id:'revenue',revision,market:{exchange:'SYNTHETIC',symbol:'GME',synthetic:true},metric:'revenue',value,unit:'currency',currency:'USD',period:{label:'Synthetic annual period',start:100,end:200},asOf:200,availableAt,definition:'Synthetic explicitly supplied annual revenue',source:{label:'Synthetic independent observation',datasetId:null,basisKey:null,fixture:true,adjustment:'unknown'},coverage:'complete-period',state:'ready'});
 request.data.observations=[observation(1,12,400),observation(2,999,501)];const before=JSON.stringify(request.datasets[0].bars);
 expect(calculateWatchAdvanced(request).rows[0].cells.revenue.value).toBe(12);request.data.observations[0].availableAt=null;
 expect(calculateWatchAdvanced(request).rows[0].cells.revenue.value).toBeNull();expect(JSON.stringify(request.datasets[0].bars)).toBe(before);
 expect(()=>restoreAdvancedData({...request.data,fx:[],unexpected:true})).toThrow();
});
