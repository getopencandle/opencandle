import {afterEach,expect,it} from 'vitest';
import {ownedSourceFixture,monthlyLocal,dailyLocal,sourceRequest,stamp} from '../fixtures/seasonality-owned-source';
import type {PrimarySourceView} from '../../src/chart/seasonality-source';
const fixtures:Awaited<ReturnType<typeof ownedSourceFixture>>[]=[];
async function fixture(options:Parameters<typeof ownedSourceFixture>[0]={}){const h=await ownedSourceFixture(options);fixtures.push(h);return h;}
afterEach(()=>{for(const h of fixtures.splice(0))h.dispose();});
function scene(view:PrimarySourceView){const value=view.read();expect(value.status).toBe('ready');if(value.status!=='ready')throw Error(value.diagnostic);return value.scene;}

it('real ordinary factory compiles literal raw month endpoints and the frozen prior-year projection',async()=>{
 const h=await fixture(),view=await h.primary.prepare(h.id,sourceRequest()),value=scene(view);
 expect(h.dataset.provenance.fixture).toBe(true);expect(value.years[0].year).toBe(2016);expect(value.years[0].cells[0].value).toBeCloseTo(-12,12);expect(value.years[0].cells[1].value).toBeCloseTo(100*(120/110-1),12);
 expect(value.projections.find(row=>row.month==='2017-01')).toMatchObject({state:'ready',baseline:135,price:118.8});expect(value.years[0].cells[0].coverage).toBe('unknown');expect(Object.isFrozen(value)).toBe(true);
 expect((h.port as any).primary).toBeUndefined();expect((h.port as any).captureSource).toBeUndefined();
});
it('actual pinned native HA transform changes displayed monthly prices while source returns use raw closes once',async()=>{
 const h=await fixture({style:'heikinashi'}),view=await h.primary.prepare(h.id,sourceRequest()),value=scene(view);
 expect(h.core.rawBars[0].close).toBe(125);expect(h.core.bars[0].close).toBe(127.5);expect(h.core.bars[1].close).toBe(112.5);expect(value.years[0].cells[0].value).toBeCloseTo(-12,12);expect(value.years[0].cells[0].value).not.toBeCloseTo(100*(112.5/127.5-1),8);expect(h.core.rawBars).not.toBe(h.core.bars);
});
it('the actual multi-year daily chooser source preserves holiday gaps and sparse/complete distinctions',async()=>{
 const h=await fixture({dataset:dailyLocal()}),request={...sourceRequest(),calendar:'nyse' as const,session:'regular' as const,endYear:2023},view=await h.primary.prepare(h.id,request),value=scene(view);
 expect(value.years[0].cells[0]).toMatchObject({state:'closed',coverage:'complete',observedSessions:19,expectedSessions:19});expect(value.years[0].cells[0].value).toBeCloseTo(-12,12);expect(value.years[0].cells[1].value).toBeCloseTo(100*(120/110-1),12);
});
it('genuine constructor readiness wakes one reserved request without accepting equal native rows prematurely',async()=>{
 const h=await fixture({deferInitial:true}),basis=h.host.capture()!;expect(basis.phase).toBe('pending');expect(h.host.accepted(basis.basis)).toBeNull();let settled=false;
 const pending=h.primary.prepare(h.id,sourceRequest()).then(value=>{settled=true;return value;});await Promise.resolve();expect(settled).toBe(false);h.initialDone();const view=await pending;expect(scene(view).years[0].cells[0].value).toBeCloseTo(-12,12);
});
it('a new-basis pending request survives the actual incoming scalar recompute and native acceptance handoff',async()=>{
 const h=await fixture();h.stage(monthlyLocal());let complete!:()=>void;h.setGate(data=>new Promise<void>(resolve=>{complete=()=>{h.nativeWrite(data);resolve();};}));const application=h.applyStaged(),pending=h.primary.prepare(h.id,sourceRequest());let resolved=false;void pending.then(()=>{resolved=true;},()=>{});await Promise.resolve();expect(resolved).toBe(false);complete();await application;const view=await pending;expect(scene(view).years[0].cells[0].value).toBeCloseTo(-12,12);
});
it('real queue hold permits calculation but withholds presentation until its actual settled event',async()=>{
 const h=await fixture(),hold=h.queue.reserve();let events=0;const off=h.host.subscribeSettled(()=>{events++;});const view=await h.primary.prepare(h.id,sourceRequest());view.assertCurrent();expect(()=>view.read()).toThrow('settling');expect(events).toBe(0);hold.release();await Promise.resolve();expect(events).toBe(1);expect(scene(view).years[0].cells[0].value).toBeCloseTo(-12,12);off();
});
it('equal-valued source B cannot borrow source A native completion before actual B application',async()=>{
 const h=await fixture(),a=await h.primary.prepare(h.id,sourceRequest()),basisA=h.host.capture()!,b=monthlyLocal();h.stage(b);const basisB=h.host.capture()!;
 expect(basisB.basis).not.toBe(basisA.basis);expect(basisB.phase).toBe('pending');expect(h.host.accepted(basisA.basis)).toBeNull();expect(h.host.accepted(basisB.basis)).toBeNull();expect(()=>a.assertCurrent()).toThrow();
 await h.applyStaged();const fresh=await h.primary.prepare(h.id,sourceRequest());expect(scene(fresh).years[0].cells[0].value).toBeCloseTo(-12,12);expect(()=>a.read()).toThrow();
});
it('initial source A ready completion cannot qualify equal-valued replacement B',async()=>{
 const h=await fixture({deferInitial:true});h.stage(monthlyLocal());h.initialDone();await Promise.resolve();await Promise.resolve();const b=h.host.capture()!;expect(b.phase).toBe('pending');expect(h.host.accepted(b.basis)).toBeNull();await h.applyStaged();expect(scene(await h.primary.prepare(h.id,sourceRequest())).years[0].cells[0].value).toBeCloseTo(-12,12);
});
it('same-source style transition re-proves a genuine HA frame and never revives an older ordinary view',async()=>{
 const h=await fixture(),old=await h.primary.prepare(h.id,sourceRequest());h.style('heikinashi');expect(()=>old.read()).toThrow();const fresh=await h.primary.prepare(h.id,sourceRequest());expect(h.core.bars[1].close).toBe(112.5);expect(scene(fresh).years[0].cells[0].value).toBeCloseTo(-12,12);expect(()=>old.assertCurrent()).toThrow();
});
it('full private input with a shorter native frame remains pending instead of consuming future rows',async()=>{
 const h=await fixture();h.nativeWrite(h.core.rawBars.slice(0,-1));const basis=h.host.capture()!;expect(basis.phase).toBe('pending');expect(h.host.accepted(basis.basis)).toBeNull();
});
it('replay forming tail contributes an observed anchor but never its original future close',async()=>{
 const h=await fixture(),selected=h.dataset.bars.map(row=>({...row}));selected[selected.length-1]={...selected[selected.length-1],close:139};h.stage(h.dataset,selected,'SYNTHETIC-replay');await h.applyStaged();
 const value=scene(await h.primary.prepare(h.id,sourceRequest()));expect(value.asOf).toBe(stamp('2017-01-01'));expect(value.years[1].cells[0]).toMatchObject({state:'absent',value:null,observedSessions:0});expect(value.projections.find(row=>row.month==='2017-01')).toMatchObject({price:118.8,baseline:135});expect(value.projections.find(row=>row.month==='2017-01')!.geometry?.left).toBe(stamp('2017-01-01'));
});
it('a declared cutoff excludes all later completed closes without pretending they were unavailable native rows',async()=>{
 const h=await fixture(),value=scene(await h.primary.prepare(h.id,{...sourceRequest(),closedThrough:stamp('2016-03-01')}));expect(value.years[0].cells[0].value).toBeCloseTo(-12,12);expect(value.years[0].cells[1].value).toBeCloseTo(100*(120/110-1),12);expect(value.years[0].cells[2].value).toBeNull();expect(value.asOf).toBe(stamp('2016-03-01'));
});
it('actual source change while waiting rejects A rather than upgrading its pending basis to B',async()=>{
 const h=await fixture({deferInitial:true}),pending=h.primary.prepare(h.id,sourceRequest()).then(()=>null,error=>error);h.stage(monthlyLocal());h.initialDone();expect(await pending).toBeInstanceOf(Error);await h.applyStaged();expect(scene(await h.primary.prepare(h.id,sourceRequest())).years[0].cells[0].value).toBeCloseTo(-12,12);
});
it('pending cancellation releases its exact state and does not block a fresh independent request',async()=>{
 const h=await fixture({deferInitial:true}),controller=new AbortController(),pending=h.primary.prepare(h.id,sourceRequest(controller.signal)).then(()=>null,error=>error);controller.abort();expect(await pending).toBeInstanceOf(Error);h.initialDone();await Promise.resolve();await Promise.resolve();const fresh=await h.primary.prepare(h.id,sourceRequest());expect(scene(fresh).years[0].cells[0].value).toBeCloseTo(-12,12);
});
it('dispose, hide and remove invalidate returned source views without a public service on the normal port',async()=>{
 const h=await fixture(),view=await h.primary.prepare(h.id,sourceRequest());view.dispose();expect(()=>view.read()).toThrow();const shown=await h.primary.prepare(h.id,sourceRequest());h.port.remove(h.id);expect(()=>shown.assertCurrent()).toThrow();expect((h.port as any).primarySourceControl).toBeUndefined();
});
it('actual failed queue application rolls back through fresh clones and requires a new source proof',async()=>{
 const h=await fixture(),old=await h.primary.prepare(h.id,sourceRequest());h.setGate(async()=>{h.setGate(null);throw Error('SYNTHETIC rejected native application');});await expect(h.apply(monthlyLocal())).rejects.toThrow('SYNTHETIC rejected native application');expect(()=>old.read()).toThrow();const fresh=await h.primary.prepare(h.id,sourceRequest());expect(scene(fresh).years[0].cells[0].value).toBeCloseTo(-12,12);expect(()=>old.assertCurrent()).toThrow();
});
it('late A success and cleanup cannot clear B when the actual current native frame remains B',async()=>{
 const h=await fixture();let completeA!:()=>void;h.stage(monthlyLocal());h.setGate(()=>new Promise<void>(resolve=>{completeA=resolve;}));const a=h.applyStaged();h.setGate(null);h.stage(monthlyLocal());await h.applyStaged();const b=await h.primary.prepare(h.id,sourceRequest());completeA();await a;await Promise.resolve();b.assertCurrent();expect(scene(b).years[0].cells[0].value).toBeCloseTo(-12,12);
});
it('a late physical native replacement retires B rather than attributing A bars to B',async()=>{
 const h=await fixture();let completeA!:()=>void;h.stage(monthlyLocal());h.setGate(data=>new Promise<void>(resolve=>{completeA=()=>{h.nativeWrite(data);resolve();};}));const a=h.applyStaged();h.setGate(null);h.stage(monthlyLocal());await h.applyStaged();const b=await h.primary.prepare(h.id,sourceRequest());completeA();await a;expect(()=>b.read()).toThrow();const current=h.host.capture()!;expect(h.host.accepted(current.basis)).toBeNull();
});
it('same-values orchestrator replacement during the actual SDK await cannot inherit its completion ticket',async()=>{
 const h=await fixture(),original=(h.chart as any).orchestrator;h.stage(monthlyLocal());let complete!:()=>void;h.setGate(data=>new Promise<void>(resolve=>{complete=()=>{h.nativeWrite(data);(h.chart as any).orchestrator=Object.assign(Object.create(Object.getPrototypeOf(h.core)),h.core);resolve();};}));const application=h.applyStaged();complete();await application;const pending=h.host.capture()!;expect(pending.phase).toBe('pending');expect(h.host.accepted(pending.basis)).toBeNull();(h.chart as any).orchestrator=original;
});
it('a pre-await pending basis cannot upgrade from core A to a genuinely applied equal-values core B',async()=>{
 const h=await fixture({deferInitial:true}),a=h.host.capture()!,pending=h.primary.prepare(h.id,sourceRequest()).then(view=>view,error=>error),original=(h.chart as any).orchestrator;
 (h.chart as any).orchestrator=Object.assign(Object.create(Object.getPrototypeOf(h.core)),h.core);const b=h.host.capture()!;await h.applyStaged();expect(await pending).toBeInstanceOf(Error);expect(b.basis).not.toBe(a.basis);expect(scene(await h.primary.prepare(h.id,sourceRequest())).years[0].cells[0].value).toBeCloseTo(-12,12);(h.chart as any).orchestrator=original;
});
it('a borrowed receiver preserves its original promise and cannot retire lexical A values',async()=>{
 const h=await fixture(),foreign=await fixture(),view=await h.primary.prepare(h.id,sourceRequest()),promise=Promise.resolve();h.setGate(()=>promise);const result=Reflect.apply(h.chart.setMarket,foreign.chart,[{data:foreign.core.rawBars}]);expect(result).toBe(promise);await result;view.assertCurrent();expect(scene(view).years[0].cells[0].value).toBeCloseTo(-12,12);
 const fault=Error('SYNTHETIC foreign receiver failure');h.setGate(()=>{throw fault;});expect(()=>Reflect.apply(h.chart.setMarket,foreign.chart,[{data:foreign.core.rawBars}])).toThrow(fault);view.assertCurrent();
});
it('a borrowed foreign SDK application cannot mint a pending lexical A source from equal old rows',async()=>{
 const h=await fixture(),foreign=await fixture();h.stage(monthlyLocal());const before=h.host.capture()!;expect(before.phase).toBe('pending');await Reflect.apply(h.chart.setMarket,foreign.chart,[{data:h.raw().map(row=>({...row,time:row.time*1000}))}]);const after=h.host.capture()!;expect(after.basis).toBe(before.basis);expect(after.phase).toBe('pending');expect(h.host.accepted(after.basis)).toBeNull();
});
it('a borrowed transform runs on B and preserves the unchanged accepted lexical A source',async()=>{
 const h=await fixture(),foreign=await fixture(),view=await h.primary.prepare(h.id,sourceRequest());Reflect.apply(h.core.syncBarTransform,foreign.core,['heikinashi']);expect(foreign.core.bars[1].close).toBe(112.5);expect(h.core.bars[1].close).toBe(110);view.assertCurrent();expect(scene(view).years[0].cells[0].value).toBeCloseTo(-12,12);
});
it('actual native-owner capture reentry between settled acceptance and preparation cannot upgrade A to B',async()=>{
 const h=await fixture(),get=h.core.registry.get;let calls=0;h.core.registry.get=function(id:string){if(!calls++){h.stage(monthlyLocal());}return Reflect.apply(get,this,[id]);};await expect(h.primary.prepare(h.id,sourceRequest())).rejects.toThrow();expect(calls).toBeGreaterThan(0);h.core.registry.get=get;await h.applyStaged();expect(scene(await h.primary.prepare(h.id,sourceRequest())).years[0].cells[0].value).toBeCloseTo(-12,12);
});
it('a real same-model native remount retires the accepted source view permanently',async()=>{
 const h=await fixture(),old=await h.primary.prepare(h.id,sourceRequest()),id=h.port.list()[0].rendererId!,record=h.records.get(id),before=record.model;record.model={...before};h.native.scene.indicators.set(id,record.model);expect(()=>old.assertCurrent()).toThrow();record.model=before;h.native.scene.indicators.set(id,before);expect(()=>old.read()).toThrow();
});
it('hiding an actual model retires its source graph before ordinary publication completes',async()=>{
 const h=await fixture(),old=await h.primary.prepare(h.id,sourceRequest());h.port.update(h.id,{visible:false});expect(()=>old.read()).toThrow();await expect(h.primary.prepare(h.id,sourceRequest())).rejects.toThrow();h.port.update(h.id,{visible:true});expect(scene(await h.primary.prepare(h.id,sourceRequest())).years[0].cells[0].value).toBeCloseTo(-12,12);
});
it('source preparation never locks original, private raw or native input rows',async()=>{
 const h=await fixture({style:'heikinashi'});await h.primary.prepare(h.id,sourceRequest());for(const array of [h.dataset.bars,h.raw(),h.core.rawBars,h.core.bars,h.native.bars]){expect(Object.isFrozen(array)).toBe(false);expect(Object.isFrozen(array[0])).toBe(false);const descriptor=Object.getOwnPropertyDescriptor(array[0],'close')!;expect(descriptor.writable).toBe(true);expect(descriptor.configurable).toBe(true);}
});
