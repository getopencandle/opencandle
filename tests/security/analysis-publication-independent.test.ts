import {expect,it} from 'vitest';
import {nativeCoreHarness} from '../chart/native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {createComparisonPort} from '../../src/chart/compare-port';
import {acquireIndicatorDisplayPort} from '../../src/chart/indicator-display-source';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {createAnalysisPublication,AnalysisPublicationError,isAnalysisPublicationFailure,type AnalysisPublicationProof} from '../../src/chart/analysis-publication';
import {createAnalysisTransactionEngine,type AnalysisScriptLease} from '../../src/chart/analysis-transaction';
import {createConfigurationEditor} from '../../src/chart/configuration-edit';
import {beginChartTreeSuspension} from '../../src/chart/tree-suspension';
import {confirmAnalysisPublication} from '../../src/ui/analysis-capture-confirmation';

type ReviewHost={captureOwner():{isCurrent():boolean;quarantine(message:unknown):void}};
const indicatorFactory=createIndicatorPort as unknown as (...args:unknown[])=>ReturnType<typeof createIndicatorPort>;
const comparisonFactory=createComparisonPort as unknown as (...args:unknown[])=>ReturnType<typeof createComparisonPort>;
const caught=(action:()=>unknown):unknown=>{try{action();return undefined;}catch(error){return error;}};
function ownership(){
 let owner:object={},captures=0;const quarantines:unknown[]=[];
 const host:ReviewHost={captureOwner(){const opening=owner;captures++;return{isCurrent:()=>opening===owner,quarantine(message){if(opening!==owner)throw Error('Attempted to quarantine a replacement owner');quarantines.push(message);}};}};
 return{host,quarantines,retire(){owner={};},captures:()=>captures};
}
function indicators(native:Awaited<ReturnType<typeof nativeCoreHarness>>,owner:ReturnType<typeof ownership>){return indicatorFactory(native.chart,undefined,undefined,undefined,native.bridge.claim,undefined,owner.host);}
function comparisons(native:Awaited<ReturnType<typeof nativeCoreHarness>>,owner:ReturnType<typeof ownership>){return comparisonFactory(native.chart,native.bridge.claim,owner.host);}

it('captures the operation owner before actual native callbacks and cannot borrow the replacement owner at flush',async()=>{
 const native=await nativeCoreHarness(),owner=ownership(),port=indicators(native,owner);const mount=native.renderer.mountIndicator;let switched=false,published=0;
 try{
  native.renderer.mountIndicator=function(...args:Parameters<typeof mount>){if(!switched){switched=true;owner.retire();}return mount.apply(this,args);};
  port.subscribe(()=>{published++;});
  const error=caught(()=>port.add('sma',{length:1}));
  expect(port.list()).toHaveLength(1);expect(switched).toBe(true);expect(published).toBe(0);expect(owner.quarantines).toEqual([]);
  expect(error).toMatchObject({accepted:true,recoveryRequired:true});expect(owner.captures()).toBeGreaterThan(0);
 }finally{native.renderer.mountIndicator=mount;port.dispose();native.dispose();}
});

it.each(['indicator','comparison'] as const)('stops %s persistence siblings after the original publication owner retires',async kind=>{
 const native=await nativeCoreHarness(),owner=ownership(),port=kind==='indicator'?indicators(native,owner):comparisons(native,owner);const calls:string[]=[];
 try{
  port.subscribe(()=>{calls.push('retire');owner.retire();return false;});port.subscribe(()=>{calls.push('borrowed-owner');});
  const error=caught(()=>kind==='indicator'?(port as ReturnType<typeof createIndicatorPort>).add('sma',{length:1}):(port as ReturnType<typeof createComparisonPort>).add(fixtureDataset('SPY',1)));
  expect(error).toMatchObject({accepted:true,recoveryRequired:true});expect(calls).toEqual(['retire']);expect(port.list()).toHaveLength(1);expect(owner.quarantines).toEqual([]);
 }finally{port.dispose();native.dispose();}
});

it('snapshots registered observers, skips removed/new observers, and prohibits reentrant mutation without repeating native work',async()=>{
 const native=await nativeCoreHarness(),owner=ownership(),port=indicators(native,owner),calls:string[]=[];let reentrant:unknown;
 try{
  let removeSecond=()=>{};
  port.subscribe(()=>{calls.push('first');removeSecond();port.subscribe(()=>{calls.push('new');});reentrant=caught(()=>port.add('ema',{length:1}));});
  removeSecond=port.subscribe(()=>{calls.push('removed');});port.subscribe(()=>{calls.push('reject');return false;});
  const error=caught(()=>port.add('sma',{length:1}));
  expect(error).toMatchObject({accepted:true,recoveryRequired:true});expect(reentrant).toBeInstanceOf(Error);expect(calls).toEqual(['first','reject']);expect(port.list().map(row=>row.kind)).toEqual(['sma']);expect(owner.quarantines).toHaveLength(1);
  expect(caught(()=>port.add('ema',{length:1}))).toBeInstanceOf(Error);expect(port.list()).toHaveLength(1);
 }finally{port.dispose();native.dispose();}
});

it.each(['move','hide','remove'] as const)('retains accepted native %s exactly once after a rejected canonical publication',async action=>{
 const native=await nativeCoreHarness(),owner=ownership(),port=indicators(native,owner);let attempts=0;
 try{
  const id=port.add('sma',{length:1}),rendererId=port.list()[0].rendererId;
  port.subscribe(()=>{attempts++;return false;});
  const error=caught(()=>action==='move'?port.move(id,{newPane:true}):action==='hide'?port.update(id,{visible:false}):port.remove(id));
  expect(error).toMatchObject({accepted:true,recoveryRequired:true});expect(attempts).toBe(1);expect(owner.quarantines).toHaveLength(1);
  if(action==='remove'){expect(port.list()).toEqual([]);expect(native.native.scene.indicators.has(rendererId)).toBe(false);}
  else if(action==='hide'){expect(port.list()[0].visible).toBe(false);expect(native.records.get(rendererId).hidden).toBe(true);}
  else expect(port.list()[0].paneId).not.toBe('price');
 }finally{port.dispose();native.dispose();}
});

it('a real native preaccept mount failure restores numeric values, saved settings and the complete accepted private display tuple',async()=>{
 const native=await nativeCoreHarness(),owner=ownership(),port=indicators(native,owner);const mount=native.renderer.mountIndicator;let attempts=0;
 try{
  const id=port.add('sma',{length:1}),before=port.serialize(),values=port.values(id),display=acquireIndicatorDisplayPort(port,native.chart),entry=display.read()[0];
  const tuple={input:entry.input,series:structuredClone(entry.series),plots:structuredClone(entry.plots),precision:entry.precision};
  const rendererId=port.list()[0].rendererId,scene=structuredClone(native.native.scene.indicators.get(rendererId));
  port.subscribe(()=>{attempts++;});let failed=false;
  native.renderer.mountIndicator=function(...args:Parameters<typeof mount>){if(!failed){failed=true;throw Error('Independent literal native mount failure');}return mount.apply(this,args);};
  const error=caught(()=>port.update(id,{plots:{sma:{...defaultPlotStyle('sma','sma',0),color:'#123456',opacity:37,trackPrice:true}}}));
  expect(error).toBeInstanceOf(Error);expect(error).not.toMatchObject({accepted:true});expect(failed).toBe(true);expect(attempts).toBe(0);expect(owner.quarantines).toEqual([]);
  expect(port.serialize()).toEqual(before);expect(port.values(id)).toEqual(values);expect(native.native.scene.indicators.get(rendererId)).toEqual(scene);
  const restored=display.read()[0];expect(restored.input).toBe(tuple.input);expect(restored.series).toEqual(tuple.series);expect(restored.plots).toEqual(tuple.plots);expect(restored.precision).toBe(tuple.precision);
 }finally{native.renderer.mountIndicator=mount;port.dispose();native.dispose();}
});


it('independent external holds preserve outer dirty state through a proved inner cancellation and enforce LIFO',()=>{
 const owner=ownership(),service=createAnalysisPublication('independent',owner.host);let published=0;
 service.subscribe(()=>{published++;});
 const outer=service.beginExternalTransaction();service.changed();const inner=service.beginExternalTransaction();service.changed();
 expect(caught(()=>outer.release(true))).toBeInstanceOf(Error);expect(published).toBe(0);
 inner.release(false,{restored:true,ownerCurrent:()=>true});expect(published).toBe(0);outer.release(true);expect(published).toBe(1);
 expect(caught(()=>outer.release(true))).toBeInstanceOf(Error);service.dispose();
});
it('a dirty external cancellation without restoration is an accepted failure rather than silent canonical/native divergence',()=>{
 const owner=ownership(),service=createAnalysisPublication('independent',owner.host);let published=0;
 service.subscribe(()=>{published++;});const hold=service.beginExternalTransaction();service.changed();
 const error=caught(()=>hold.release(false));expect(error).toBeInstanceOf(AnalysisPublicationError);expect(error).toMatchObject({accepted:true,recoveryRequired:true});expect(published).toBe(0);expect(owner.quarantines).toHaveLength(1);expect(caught(()=>service.assertMutable())).toBe(error);service.dispose();
});
it('a restored cancellation cannot use a proof whose exact enclosing owner has retired',()=>{
 const owner=ownership(),service=createAnalysisPublication('independent',owner.host);const hold=service.beginExternalTransaction();service.changed();owner.retire();
 const error=caught(()=>hold.release(false,{restored:true,ownerCurrent:()=>false}));
 expect(error).toBeInstanceOf(AnalysisPublicationError);expect(owner.quarantines).toEqual([]);service.dispose();
});
it('service rebase requires explicit still-current enclosing proof before and after final owner capture',()=>{
 let current={},reads=0,quarantined=0;const service=createAnalysisPublication('independent',{captureOwner(){const opening=current;return{isCurrent:()=>current===opening,quarantine(){quarantined++;}};}});let notifications=0;
 service.subscribe(()=>{notifications++;});const hold=service.beginExternalTransaction();service.changed();current={};
 const error=caught(()=>hold.release(true,{ownerCurrent:()=>++reads===1}));
 expect(error).toBeInstanceOf(AnalysisPublicationError);expect(reads).toBe(2);expect(notifications).toBe(0);expect(quarantined).toBe(0);service.dispose();
});
it('subscriber and quarantine exceptions remain together while every original owned sibling executes once',()=>{
 const original=Error('Independent observer failed'),cleanup=Error('Independent quarantine failed');let sibling=0;
 const service=createAnalysisPublication('independent',{captureOwner:()=>({isCurrent:()=>true,quarantine(){throw cleanup;}})});
 service.subscribe(()=>{throw original;});service.subscribe(()=>false);service.subscribe(()=>{sibling++;});
 const error=caught(()=>service.transaction(()=>service.changed()));expect(error).toBeInstanceOf(AnalysisPublicationError);expect((error as AnalysisPublicationError).errors).toContain(original);expect((error as AnalysisPublicationError).errors).toContain(cleanup);expect((error as AnalysisPublicationError).errors).toHaveLength(3);expect(sibling).toBe(1);service.dispose();
});

it('nested accepted native work defers retirement publication errors until the outer action leaves rollback-capable code',()=>{
 const owner=ownership(),service=createAnalysisPublication('independent',owner.host);let outerCompleted=false;
 const error=caught(()=>service.transaction(()=>{service.transaction(()=>{service.changed();owner.retire();});outerCompleted=true;}));
 expect(outerCompleted).toBe(true);expect(error).toBeInstanceOf(AnalysisPublicationError);expect(owner.quarantines).toEqual([]);service.dispose();
});


function leaves(error:unknown):unknown[]{return error instanceof AggregateError?[error,...error.errors.flatMap(leaves)]:[error];}
async function actualEngineFixture(){
 const native=await nativeCoreHarness(),owner=ownership(),port=indicators(native,owner),id=port.add('sma',{length:1});let queueEpoch=0;
 const pending:boolean[]=[],broken:string[]=[],events:string[]=[];
 const scripts:AnalysisScriptLease={pauseAndCapture(){events.push('pause');},stage(){events.push('stage');},rollback(){events.push('script rollback');},resume(committed){events.push('resume '+committed);},abandon(){events.push('abandon');}};
 const integration={
  async exclusive<T>(action:(owner:{isCurrent:()=>boolean})=>Promise<T>|T,guard?:()=>boolean):Promise<T>{if(guard&&!guard())throw Error('Independent queue owner retired');const epoch=++queueEpoch;return action({isCurrent:()=>queueEpoch===epoch});},
  validate(_request:{offset:number}){},noOp:()=>false,capture:()=>port.serialize(),
  hold(queueOwner:{isCurrent:()=>boolean}){const hold=port.beginExternalTransaction();return{release(publish:boolean,proof?:AnalysisPublicationProof){hold.release(publish,{...proof,ownerCurrent:queueOwner.isCurrent});}};},
  async apply(request:{offset:number}){port.update(id,{offset:request.offset});},async restore(snapshot:ReturnType<typeof port.serialize>){port.restore(snapshot);},scripts:()=>scripts,pending(value:boolean){pending.push(value);},broken(message:string){broken.push(message);}
 };
 return{native,owner,port,id,scripts,integration,pending,broken,events,engine:createAnalysisTransactionEngine(integration),dispose(){port.dispose();native.dispose();}};
}
it('actual analysis seal publishes accepted native work once and cannot treat a rejected canonical publication as rollback-capable',async()=>{
 const f=await actualEngineFixture();let notifications=0;
 try{
  f.port.subscribe(()=>{notifications++;return false;});const lease=await f.engine.prepare({offset:1});expect(notifications).toBe(0);expect(f.port.list()[0].offset).toBe(1);lease.commit();
  const error=caught(()=>lease.seal());expect(leaves(error).some(value=>value instanceof AnalysisPublicationError)).toBe(true);expect(notifications).toBe(1);expect(f.port.list()[0].offset).toBe(1);expect(f.events).not.toContain('script rollback');expect(f.pending).toEqual([true,false]);expect(f.broken).toHaveLength(1);
  await expect(lease.rollback()).rejects.toThrow();expect(f.port.list()[0].offset).toBe(1);
 }finally{f.dispose();}
});
it('actual analysis rollback provides restoration proof only after native restoration and script recovery, suppressing every intermediate notification',async()=>{
 const f=await actualEngineFixture();let notifications=0;
 try{
  const before=f.port.serialize();f.port.subscribe(()=>{notifications++;});const lease=await f.engine.prepare({offset:2});expect(notifications).toBe(0);await lease.rollback();
  expect(f.port.serialize()).toEqual(before);expect(notifications).toBe(0);expect(f.events).toEqual(['pause','stage','script rollback','resume false']);expect(f.pending).toEqual([true,false]);expect(f.owner.quarantines).toEqual([]);expect(f.broken).toEqual([]);
 }finally{f.dispose();}
});
it('a throwing engine failure diagnostic cannot replace the accepted-publication error or its rejected-subscriber cause',async()=>{
 const f=await actualEngineFixture(),diagnostic=Error('Independent failure diagnostic threw');
 try{
  f.integration.broken=()=>{throw diagnostic;};f.port.subscribe(()=>false);const lease=await f.engine.prepare({offset:3});lease.commit();const error=caught(()=>lease.seal());
  const causes=leaves(error);expect(causes).toContain(diagnostic);expect(causes.some(value=>value instanceof AnalysisPublicationError)).toBe(true);expect(f.port.list()[0].offset).toBe(3);expect(f.pending).toEqual([true,false]);expect(f.events).not.toContain('script rollback');
 }finally{f.dispose();}
});

it('incomplete actual analysis rollback preserves the native recovery and diagnostic causes and cannot silently cancel its dirty hold',async()=>{
 const f=await actualEngineFixture(),restore=Error('Independent native restoration failed'),diagnostic=Error('Independent rollback diagnostic failed');
 try{
  f.integration.restore=async()=>{throw restore;};f.integration.broken=()=>{throw diagnostic;};const lease=await f.engine.prepare({offset:4});
  let failure:unknown;try{await lease.rollback();}catch(error){failure=error;}
  const causes=leaves(failure);expect(causes).toContain(restore);expect(causes).toContain(diagnostic);expect(causes.some(value=>value instanceof AnalysisPublicationError)).toBe(true);
  expect(f.port.list()[0].offset).toBe(4);expect(f.owner.quarantines).toHaveLength(1);expect(f.events).toContain('abandon');expect(f.events).not.toContain('resume false');expect(f.pending).toEqual([true,false]);
 }finally{f.dispose();}
});
it('configuration recovery failure cannot certify rollback proof while accepted native changes remain',async()=>{
 const f=await actualEngineFixture(),restore=Error('Independent configuration native recovery failed');let notifications=0;
 try{
  f.port.subscribe(()=>{notifications++;});const editor=createConfigurationEditor({exclusive:f.integration.exclusive,validate:f.integration.validate,capture:f.integration.capture,hold:f.integration.hold,apply(request:{offset:number}){f.port.update(f.id,{offset:request.offset});return request.offset;},async restore(){throw restore;},pending:f.integration.pending,broken:f.integration.broken});
  const lease=await editor.prepare({offset:5});let failure:unknown;try{await lease.rollback();}catch(error){failure=error;}
  expect(leaves(failure)).toContain(restore);expect(leaves(failure).some(value=>value instanceof AnalysisPublicationError)).toBe(true);expect(f.port.list()[0].offset).toBe(5);expect(notifications).toBe(0);expect(f.owner.quarantines).toHaveLength(1);expect(f.pending).toEqual([true,false]);
 }finally{f.dispose();}
});
it('tree retirement cannot silently discard accepted native changes made under its notification hold',async()=>{
 const f=await actualEngineFixture();let notifications=0,released=0;
 try{
  f.port.subscribe(()=>{notifications++;});const tree=beginChartTreeSuspension({assert(){},reserve:()=>({isCurrent:()=>true,release(){released++;}}),hold:f.integration.hold,script:f.scripts,pending:f.integration.pending,broken:f.integration.broken,dispose(){}});
  f.port.update(f.id,{offset:6});const error=caught(()=>tree.retire());
  expect(leaves(error).some(value=>value instanceof AnalysisPublicationError)).toBe(true);expect(f.port.list()[0].offset).toBe(6);expect(notifications).toBe(0);expect(f.owner.quarantines).toHaveLength(1);expect(released).toBe(1);expect(f.pending).toEqual([true,false]);expect(f.events).toContain('abandon');
 }finally{f.dispose();}
});

it('accepted publication classification cannot be starved by a wide noisy diagnostic sibling',()=>{
 const accepted=new AnalysisPublicationError('Independent',[Error('canonical rejected')]),noise=new AggregateError(Array.from({length:64},(_,index)=>Error('diagnostic '+index)),'independent diagnostic tree');
 expect(isAnalysisPublicationFailure(new AggregateError([accepted,noise],'accepted mutation and cleanup'))).toBe(true);
});

it('saved/native confirmation compares valid data semantics rather than harmless JSON object insertion order',()=>{
 const saved=[{id:'independent-sma',kind:'sma',inputs:{length:1,source:'close'},plots:{},offset:0,visible:true,paneId:'price'}];
 const native=[{paneId:'price',visible:true,offset:0,plots:{},inputs:{source:'close',length:1},kind:'sma',id:'independent-sma'}];let refresh=0,quarantines=0;
 expect(()=>confirmAnalysisPublication('Indicator',{assertCurrent(){},readSaved:()=>saved,readNative:()=>native,refresh(){refresh++;},quarantine(){quarantines++;}})).not.toThrow();expect(refresh).toBe(1);expect(quarantines).toBe(0);
});

it('pending-clear cleanup cannot mask an accepted publication failure after actual native seal',async()=>{
 const f=await actualEngineFixture(),pendingFailure=Error('Independent pending clear failed');
 try{
  f.integration.pending=value=>{f.pending.push(value);if(!value)throw pendingFailure;};f.port.subscribe(()=>false);const lease=await f.engine.prepare({offset:7});lease.commit();const error=caught(()=>lease.seal());
  expect(leaves(error)).toContain(pendingFailure);expect(leaves(error).some(value=>value instanceof AnalysisPublicationError)).toBe(true);expect(f.port.list()[0].offset).toBe(7);expect(f.pending).toEqual([true,false]);
 }finally{f.dispose();}
});
