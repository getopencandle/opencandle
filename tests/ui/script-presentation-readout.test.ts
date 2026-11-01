import {afterEach,expect,it} from 'vitest';
import {scriptPresentationFixture,SYNTHETIC_BINDING,syntheticRows,syntheticResult,settle} from '../fixtures/script-presentation';
import {assertScriptCsvJobModel,assertScriptCsvJobDependencies} from '../../src/chart/script-csv-job-proof';
import type {ScriptReadoutSnapshot} from '../../src/chart/script-presentation-proof';
const fixtures:ReturnType<typeof scriptPresentationFixture>[]=[];
afterEach(()=>{for(const fixture of fixtures.splice(0).reverse())fixture.close();});
const fixture=(options:Parameters<typeof scriptPresentationFixture>[0]={})=>{const value=scriptPresentationFixture(options);fixtures.push(value);return value;};
function snapshot(f:ReturnType<typeof fixture>,id=SYNTHETIC_BINDING.id):ScriptReadoutSnapshot{return f.port.captureReadout?.(id)??{state:'unavailable',message:'No accepted script UI readout is retained.'};}
function ready(f:ReturnType<typeof fixture>,id=SYNTHETIC_BINDING.id){const view=snapshot(f,id);expect(view.state).toBe('ready');if(view.state!=='ready')throw Error(view.message);return view;}
async function accepted(f:ReturnType<typeof fixture>){const runtime=f.runtime();runtime.update(f.context());f.complete();await settle();return runtime;}

it('retains accepted live UI scalars, and the live job is accepted for a personal-use CSV export',async()=>{
 const f=fixture({live:true});await accepted(f);expect(f.port.list()).toHaveLength(1);
 expect(()=>assertScriptCsvJobModel(f.model(),f.model().result,f.input,'ordinary',SYNTHETIC_BINDING.id)).not.toThrow();
 const value=ready(f).readAt(100);expect(value.title).toBe('Synthetic study');expect(value.paneId).toBe('price');expect(value.plots).toEqual([{label:'Value',color:'#123456',value:7}]);
});
it('keeps a requested accepted UI result independent of missing dependency export receipts',async()=>{
 const f=fixture();f.setBindings([{...SYNTHETIC_BINDING,source:"({requests:{daily:{interval:'1D'}},onBar(ctx){ctx.request('daily')}})"}]);await accepted(f);
 expect(()=>assertScriptCsvJobDependencies(f.model(),f.model().result,[{id:'daily',interval:'1D'}])).toThrow();expect(ready(f).readAt(220).plots[0].value).toBe(11);
});
it('withholds values until owned native and runtime acceptance completes',async()=>{
 const f=fixture();f.runtime().update(f.context());expect(snapshot(f).state).toBe('unavailable');f.complete();await settle();expect(ready(f).readAt(160).plots[0].value).toBeNull();
});
it('preserves warmup, exact point gaps and scalar nulls without repeating the latest value',async()=>{
 const f=fixture();f.runtime().update(f.context());f.complete(0,syntheticResult([[100,null],[220,11]]));await settle();const view=ready(f);
 expect(view.readAt(100).plots[0].value).toBeNull();expect(view.readAt(160).plots[0].value).toBeNull();expect(view.readAt(220).plots[0].value).toBe(11);
});
it('invalid, absent and future query times refuse only that query and preserve the valid snapshot',async()=>{
 const f=fixture();await accepted(f);const view=ready(f);for(const time of [NaN,Infinity,undefined,null,'100',130,999])expect(()=>view.readAt(time as number)).toThrow();
 expect(()=>view.assertCurrent()).not.toThrow();expect(view.readAt(100).plots[0].value).toBe(7);
});
it('native old-result reemission never renews authority for a corrected same-count input',async()=>{
 const f=fixture({live:true});await accepted(f);const view=ready(f),rows=syntheticRows();rows[1].close=17;f.nativeOnly(rows);
 expect(()=>view.readAt(100)).toThrow();expect(snapshot(f).state).toBe('unavailable');f.nativeOnly(syntheticRows());expect(()=>view.assertCurrent()).toThrow();
});
it('a private source publication retires the old view before a same-time value correction is recalculated',async()=>{
 const f=fixture();const runtime=await accepted(f),view=ready(f),rows=syntheticRows();rows[1].close=17;f.publish(rows);
 expect(()=>view.assertCurrent()).toThrow();expect(snapshot(f).state).toBe('unavailable');runtime.update(f.context());f.complete(1,syntheticResult([[100,17],[160,null],[220,19]]));await settle();
 expect(ready(f).readAt(220).plots[0].value).toBe(19);expect(()=>view.readAt(100)).toThrow();
});
it('a late first live job cannot adopt the newer native source despite sharing dataset metadata',async()=>{
 const f=fixture({live:true});f.runtime().update(f.context());const rows=syntheticRows();rows[2].close=19;f.publish(rows);f.complete();await settle();
 expect(snapshot(f).state).toBe('unavailable');
});
it('an older exact live snapshot cannot acquire authority after a newer one becomes current',async()=>{
 const f=fixture({live:true}),old=f.context(),rows=syntheticRows();rows[2].close=19;f.publish(rows);f.runtime().update(old);f.complete();await settle();expect(snapshot(f).state).toBe('unavailable');
});
it('preserves HA calculation units and refuses a standard-bar substitution',async()=>{
 const f=fixture({style:'heikinashi'});expect(f.context().bars[0].close).toBe(10.5);expect(f.context().bars[1].open).toBe(10.75);await accepted(f);expect(ready(f).readAt(100).plots[0].value).toBe(7);
 const g=fixture({style:'heikinashi'});g.runtime().update({...g.context(),bars:g.input.bars});g.complete();await settle();expect(snapshot(g).state).toBe('unavailable');expect(g.port.list()).toHaveLength(1);
});
it('missing actual derived confirmation proof withholds readout while normal calculation remains possible',async()=>{
 const f=fixture({style:'renko'});await accepted(f);expect(f.port.list()).toHaveLength(1);expect(snapshot(f).state).toBe('unavailable');
});
it('metadata-only owned rendering creates a new view without recalculating the numeric job',async()=>{
 const f=fixture();await accepted(f);const view=ready(f);f.port.rename(SYNTHETIC_BINDING.id,'Renamed synthetic study');
 expect(()=>view.assertCurrent()).toThrow();expect(ready(f).readAt(100).title).toBe('Renamed synthetic study');expect(f.pending).toHaveLength(1);
});
it('a same-model native pane move retires the old view even when the old pane remains',async()=>{
 const f=fixture();await accepted(f);const view=ready(f),mounted=[...f.core.renderer.scene.indicators.values()][0];f.move();
 expect([...f.core.renderer.scene.indicators.values()][0]).toBe(mounted);expect(f.core.renderer.scene.panes.has('price')).toBe(true);expect(()=>view.assertCurrent()).toThrow();expect(ready(f).readAt(100).paneId).toBe('synthetic-other-pane');
});
it('hide/show refuses unmounted scalar output then qualifies a fresh current incarnation',async()=>{
 const f=fixture();await accepted(f);const view=ready(f);f.port.show(SYNTHETIC_BINDING.id,false);expect(()=>view.assertCurrent()).toThrow();expect(snapshot(f).state).toBe('unavailable');
 f.port.show(SYNTHETIC_BINDING.id,true);expect(ready(f).readAt(100).visible).toBe(true);expect(()=>view.assertCurrent()).toThrow();
});
it('an external model/render-handle replacement cannot borrow an accepted job using matching strings',async()=>{
 const f=fixture();await accepted(f);const view=ready(f),record=[...f.core.registry.records.values()][0],old=record.model;record.model={...old};f.core.renderer.scene.indicators.set(old.id,record.model);
 expect(()=>view.readAt(100)).toThrow();record.model=old;f.core.renderer.scene.indicators.set(old.id,old);expect(()=>view.readAt(100)).toThrow();
});
it('failed native update restores a freshly qualified previous accepted result instead of reviving the old view',async()=>{
 const f=fixture();await accepted(f);const view=ready(f);f.fail();expect(()=>f.port.update(SYNTHETIC_BINDING.id,syntheticResult([[100,999]]))).toThrow('Synthetic native emission failed');
 expect(()=>view.assertCurrent()).toThrow();expect(ready(f).readAt(100).plots[0].value).toBe(7);
});
it('owned accepted checkpoints reprove the current producer and reject foreign tokens',async()=>{
 const f=fixture();await accepted(f);const view=ready(f),saved=f.port.captureAcceptedResults();f.port.remove(SYNTHETIC_BINDING.id);expect(()=>view.assertCurrent()).toThrow();f.port.restoreAcceptedResults(saved);
 expect(ready(f).readAt(220).plots[0].value).toBe(11);expect(()=>view.assertCurrent()).toThrow();expect(()=>f.port.restoreAcceptedResults({count:1})).toThrow('Foreign');
});
it('runtime rollback reproves a settled job without reviving its old aborted signal or view',async()=>{
 const f=fixture(),runtime=await accepted(f),view=ready(f),saved=f.port.captureAcceptedResults(),lease=runtime.prepareBindings([{...SYNTHETIC_BINDING,inputs:{period:3}}],f.context());
 lease.pauseAndCapture();lease.stage();f.port.restoreAcceptedResults(saved);lease.rollback();lease.resume(false);
 expect(ready(f).readAt(100).plots[0].value).toBe(7);expect(()=>view.assertCurrent()).toThrow();expect(f.pending).toHaveLength(1);
});
it('the actual rejected-input handler reproves unchanged accepted rows under a new owner',async()=>{
 const f=fixture();await accepted(f);const view=ready(f);await f.produced.rejectInput();expect(()=>view.assertCurrent()).toThrow();expect(ready(f).readAt(100).plots[0].value).toBe(7);expect(f.pending).toHaveLength(1);
});
it('a changed source basis cannot renew an old owned checkpoint by matching consumed numbers',async()=>{
 const f=fixture({live:true});await accepted(f);const saved=f.port.captureAcceptedResults();f.publish(syntheticRows(),{...f.input.source,basisIdentity:f.input.source.basisIdentity?.replace('USD','EUR')});
 f.port.restoreAcceptedResults(saved);expect(snapshot(f).state).toBe('unavailable');
});
it('remove, abort and disposal leave retained views terminal without using an old native context',async()=>{
 const f=fixture();const runtime=await accepted(f),view=ready(f);runtime.update({...f.context(),bindings:[]});expect(()=>view.assertCurrent()).toThrow();expect(snapshot(f).state).toBe('unavailable');
 runtime.update(f.context());runtime.dispose();f.complete(1);await settle();expect(f.port.list()).toEqual([]);expect(()=>view.readAt(100)).toThrow();
});
it('missing producer authority leaves normal calculations intact and refuses only UI readout',async()=>{
 const f=fixture({host:false});await accepted(f);expect(f.port.list()).toHaveLength(1);expect(snapshot(f).state).toBe('unavailable');
});
it('a reentrant publication change after native output but before runtime acceptance cannot activate UI proof',async()=>{
 const f=fixture({live:true}),rows=syntheticRows();rows[2].close=19;const runtime=f.runtime(()=>f.publish(rows));runtime.update(f.context());f.complete();await settle();expect(snapshot(f).state).toBe('unavailable');
});
it('effective binding changes with the same instance ID require a freshly accepted numeric job',async()=>{
 const f=fixture(),runtime=await accepted(f),view=ready(f);f.setBindings([{...SYNTHETIC_BINDING,inputs:{period:3}}]);runtime.update(f.context());expect(()=>view.assertCurrent()).toThrow();expect(snapshot(f).state).toBe('unavailable');
 f.complete(1,syntheticResult([[100,21],[160,null],[220,31]]));await settle();expect(ready(f).readAt(100).plots[0].value).toBe(21);
 f.port.add(f.model().result,{id:'synthetic-unowned-copy'});expect(snapshot(f,'synthetic-unowned-copy').state).toBe('unavailable');
});
it('a reentrant metadata observer cannot see a ready old job after new effective inputs were requested',async()=>{
 const f=fixture(),runtime=await accepted(f),states:string[]=[],off=f.port.subscribe(()=>states.push(snapshot(f).state));
 try{f.setBindings([{...SYNTHETIC_BINDING,inputs:{period:3}}]);runtime.update(f.context());expect(states.length).toBeGreaterThan(0);expect(states.every(state=>state==='unavailable')).toBe(true);}finally{off();}
});
it('a different execution owner cannot lend its retained values to a renamed view',async()=>{
 const f=fixture();await accepted(f);const view=ready(f);f.produced.setExecution('synthetic-replay');expect(()=>view.assertCurrent()).toThrow();f.port.rename(SYNTHETIC_BINDING.id,'Synthetic replay study');expect(snapshot(f).state).toBe('unavailable');
});
it('repeated scalar reads use no bars/list/clone/worker path and keep owned numeric arrays unchanged',async()=>{
 const f=fixture();await accepted(f);const view=ready(f),plots=f.model().result.plots,before=f.barReads,jobs=f.pending.length;
 expect(Object.isFrozen(plots)).toBe(true);expect(Object.isFrozen(plots[0].values)).toBe(true);expect(Object.isFrozen(plots[0].values[0])).toBe(true);
 const oldList=f.port.list;f.port.list=()=>{throw Error('Full list read from scalar path.');};try{for(let index=0;index<1000;index++)expect(view.readAt(index%2?100:220).plots[0].value).toBe(index%2?7:11);}finally{f.port.list=oldList;}
 expect(f.barReads).toBe(before);expect(f.pending).toHaveLength(jobs);expect(f.model().result.plots).toBe(plots);
});

it('a numeric request queued inside a ready metadata observer immediately retires the prior accepted view',async()=>{
 const f=fixture(),runtime=await accepted(f),old=ready(f);let nested=false,inside='not-called',oldRejected=false;
 const off=f.port.subscribe(()=>{if(nested)return;nested=true;f.setBindings([{...SYNTHETIC_BINDING,inputs:{period:3}}]);runtime.update(f.context());inside=snapshot(f).state;try{old.assertCurrent();}catch{oldRejected=true;}});
 try{f.setBindings([{...SYNTHETIC_BINDING,name:'Synthetic renamed study'}]);runtime.update(f.context());}finally{off();}
 expect(nested).toBe(true);expect(inside).toBe('unavailable');expect(oldRejected).toBe(true);expect(snapshot(f).state).toBe('unavailable');
 f.complete(1,syntheticResult([[100,29],[160,null],[220,37]]));await settle();expect(ready(f).readAt(100).plots[0].value).toBe(29);expect(()=>old.assertCurrent()).toThrow();
});
