import {afterEach,expect,it} from 'vitest';
import {builtinVwapFixture,scalarVwapRows} from '../fixtures/builtin-vwap-presentation';
import {drainVwap} from '../chart/vwap-indicator-native-harness';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
import {VWAP_BAND_DEFAULTS} from '../../src/domain/indicators';
import {builtinPresentationFixture,builtinRows} from '../fixtures/builtin-presentation';
const held:Awaited<ReturnType<typeof builtinVwapFixture>>[]=[];
const synchronous:Awaited<ReturnType<typeof builtinPresentationFixture>>[]=[];
afterEach(()=>{for(const h of synchronous.splice(0).reverse())h.dispose();for(const h of held.splice(0).reverse())h.dispose();});
async function fixture(options:Parameters<typeof builtinVwapFixture>[0]={}){const h=await builtinVwapFixture(options);held.push(h);return h;}
function ready(h:Awaited<ReturnType<typeof fixture>>,id:string){const view=h.port.captureReadout?.(id);expect(view?.state).toBe('ready');if(view?.state!=='ready')throw Error('Missing accepted VWAP scalar proof.');return view;}
const add=(h:Awaited<ReturnType<typeof fixture>>)=>h.port.add('vwap',{kernelVersion:2,source:'close'});

it('a genuine accepted asynchronous VWAP exposes literal scalar values after pending',async()=>{
 const h=await fixture(),id=add(h);expect(h.port.captureReadout?.(id).state).toBe('unavailable');await h.finish();const view=ready(h,id);
 expect(h.rows.map(row=>view.readAt(row.time).plots[0].value)).toEqual([12,44/3,98/6]);expect(h.port.values(id).series[0].values).toEqual([12,44/3,98/6]);
});
it('native reentrancy sees pending and the single normal publication sees settled values',async()=>{
 const h=await fixture(),id=add(h),nativeReads:string[]=[],publications:string[]=[];
 const mount=h.renderer.mountIndicator.bind(h.renderer);h.renderer.mountIndicator=(output:any)=>{nativeReads.push(h.port.captureReadout?.(id).state??'missing');return mount(output);};
 const off=h.port.subscribe(()=>{const view=h.port.captureReadout?.(id);publications.push(view?.state??'missing');if(view?.state==='ready')expect(view.readAt(h.rows[2].time).plots[0].value).toBe(98/6);});
 await h.finish();off();expect(nativeReads.length).toBeGreaterThan(0);expect(nativeReads.every(state=>state==='unavailable')).toBe(true);expect(publications).toEqual(['ready']);
});
it('a synchronous native observer cannot cancel its own still-pending scalar draft by querying it',async()=>{
 const h=await builtinPresentationFixture();synchronous.push(h);const id=h.port.add('sma',{length:2}),mount=h.renderer.mountIndicator.bind(h.renderer),observed:string[]=[];
 h.renderer.mountIndicator=(output:any)=>{observed.push(h.port.captureReadout?.(id).state??'missing');return mount(output);};
 h.publish(builtinRows().map((row,index)=>index===1?{...row,high:14,close:13}:row));expect(observed.length).toBeGreaterThan(0);expect(observed.every(state=>state==='unavailable')).toBe(true);const view=h.port.captureReadout?.(id);expect(view?.state).toBe('ready');if(view?.state==='ready')expect(view.readAt(160).plots[0].value).toBe(8);
});
it('a retired async cleanup cannot delete a current same-model legacy descendant proof',async()=>{
 const h=await fixture(),id=add(h);let armed=false,attempting=false,replaced=false,blockedDuringPublication=0,checkpointAttempts=0,descendant:ReturnType<typeof ready>|undefined;const subscriberStates:string[]=[];
 h.port.subscribe(()=>{const state=h.port.captureReadout?.(id).state??'missing';if(subscriberStates.length<32)subscriberStates.push(state);if(state==='ready'&&!replaced)armed=true;});
 h.onPublicationAssert(()=>{if(!armed||attempting||replaced||checkpointAttempts>=64)return;checkpointAttempts++;attempting=true;try{
   let probe:ReturnType<typeof h.port.beginExternalTransaction>;const eventsBefore=subscriberStates.length;try{probe=h.port.beginExternalTransaction();}catch(error){if(error instanceof Error&&/cannot change during workspace publication/i.test(error.message)){blockedDuringPublication++;return;}throw error;}probe.release(true);expect(subscriberStates).toHaveLength(eventsBefore);h.port.update(id,{inputs:{kernelVersion:1}});
   replaced=true;armed=false;descendant=ready(h,id);
  }finally{attempting=false;}});
 let finishError:unknown;try{await h.finish();}catch(error){finishError=error;}expect(finishError).toBeInstanceOf(Error);const describe=(error:unknown,depth=0):unknown=>({message:String(error),children:depth<2&&error instanceof AggregateError?error.errors.slice(0,4).map(child=>describe(child,depth+1)):[]});const diagnostic=JSON.stringify({finishError:describe(finishError),subscriberStates,checkpointAttempts,blockedDuringPublication});expect(replaced,diagnostic).toBe(true);expect(blockedDuringPublication).toBeGreaterThan(0);expect(h.port.serialize()[0].inputs.kernelVersion).toBe(1);expect(descendant).toBeDefined();descendant!.assertCurrent();expect(descendant!.readAt(h.rows[0].time).plots[0].value).toBe(12);expect(ready(h,id).readAt(h.rows[1].time).plots[0].value).toBeCloseTo(44/3,12);
});
it('an unchanged ready VWAP recompute retains its proof without another worker or emission',async()=>{
 const h=await fixture(),id=add(h);await h.finish();const view=ready(h,id),workers=h.transports.length,output=h.instance(id).acceptedOutput;h.port.recompute();view.assertCurrent();expect(ready(h,id).readAt(h.rows[1].time).plots[0].value).toBe(44/3);expect(h.transports).toHaveLength(workers);expect(h.instance(id).acceptedOutput).toBe(output);
});
it('offset native paint leaves the accepted unshifted VWAP scalar grid unchanged',async()=>{
 const h=await fixture(),id=add(h);await h.finish();const old=ready(h,id);h.port.update(id,{offset:1,presentation:{...defaultIndicatorPresentation('vwap'),precision:3}});await h.finish();const view=ready(h,id);expect(()=>old.assertCurrent()).toThrow();expect(view.readAt(h.rows[0].time).plots[0].value).toBe(12);expect(view.readAt(h.rows[2].time).plots[0].value).toBe(98/6);expect(view.readAt(h.rows[2].time).precision).toBe(3);expect(h.instance(id).acceptedOutput.series[0].points[0].value).toBe(null);
});
it('percentage band scalars preserve the genuine worker units and labels',async()=>{
 const h=await fixture(),id=h.port.add('vwap',{...VWAP_BAND_DEFAULTS,kernelVersion:2,source:'close',bandMode:'Percentage',band1Enabled:true,band1Multiplier:1,band2Enabled:false,band3Enabled:false});await h.finish();const plots=ready(h,id).readAt(h.rows[0].time).plots;expect(plots).toHaveLength(3);expect(plots[0].value).toBe(12);expect(plots[1].value).toBeCloseTo(12.12,12);expect(plots[2].value).toBeCloseTo(11.88,12);expect(plots.every(plot=>plot.label.length>0)).toBe(true);
});
it('actual native HA mapping preserves the accepted once-transformed worker calculation',async()=>{
 const h=await fixture({style:'heikinashi'}),id=add(h);await h.finish();expect(h.core.bars.map((row:any)=>row.close)).toEqual([10.5,14,17]);const view=ready(h,id);expect(h.rows.map(row=>view.readAt(row.time).plots[0].value)).toEqual([10.5,38.5/3,89.5/6]);expect(h.port.values(id).series[0].values).toEqual([10.5,38.5/3,89.5/6]);
});
it('wrong native HA mapping withholds optional proof while the accepted worker calculation remains',async()=>{
 const h=await fixture({style:'heikinashi'});h.core.bars=h.rows.map(row=>({...row,time:row.time*1000}));const id=add(h);await h.finish();expect(h.port.values(id).series[0].values).toEqual([10.5,38.5/3,89.5/6]);expect(h.port.captureReadout?.(id).state).toBe('unavailable');
});
it('a completed worker native emission failure cannot publish a scalar receipt',async()=>{
 const h=await fixture(),id=add(h),mount=h.renderer.mountIndicator.bind(h.renderer);let once=true;h.renderer.mountIndicator=(output:any)=>{const result=mount(output);if(once&&output.series.length){once=false;throw Error('Synthetic native rejection.');}return result;};await expect(h.finish()).rejects.toThrow();expect(h.port.captureReadout?.(id).state).toBe('unavailable');
});
it('workspace publication rejection keeps accepted normal values and retires optional proof',async()=>{
 const h=await fixture(),id=add(h),off=h.port.subscribe(()=>{throw Error('Synthetic workspace rejection.');});await expect(h.finish()).rejects.toThrow();off();expect(h.port.values(id).series[0].values).toEqual([12,44/3,98/6]);expect(h.port.captureReadout?.(id).state).toBe('unavailable');
});
it('a source retired by native emission cannot lend readiness to the old accepted job',async()=>{
 const h=await fixture(),id=add(h),mount=h.renderer.mountIndicator.bind(h.renderer);let once=true;h.renderer.mountIndicator=(output:any)=>{const result=mount(output);if(once&&output.series.length){once=false;h.retire();}return result;};await expect(h.finish()).rejects.toThrow();expect(h.port.captureReadout?.(id).state).toBe('unavailable');
});
it('source replacement retires old callbacks and accepts only the new worker prefix',async()=>{
 const h=await fixture(),id=add(h);await drainVwap();const oldWorker=h.transports[0];h.replace(scalarVwapRows().map(row=>({...row,close:row.close+10,high:row.high+10})));await drainVwap();oldWorker.finish();expect(h.port.captureReadout?.(id).state).toBe('unavailable');await h.finish();expect(ready(h,id).readAt(h.rows[0].time).plots[0].value).toBe(22);
});
it('removing a pending study cancels its job and late transport output cannot create a view',async()=>{
 const h=await fixture(),id=add(h);await drainVwap();const worker=h.transports[0];h.port.remove(id);worker.finish();await drainVwap();expect(h.port.captureReadout?.(id).state).toBe('unavailable');expect(h.port.list()).toEqual([]);expect(worker.terminated).toBeGreaterThan(0);
});
it('actual hide and show replace the scalar owner even with the same public native identifier',async()=>{
 const h=await fixture(),id=add(h);await h.finish();const old=ready(h,id),nativeId=h.port.list()[0].rendererId;h.enableActualVisibility(id);h.port.update(id,{visible:false});expect(h.port.captureReadout?.(id).state).toBe('unavailable');expect(()=>old.assertCurrent()).toThrow();h.port.update(id,{visible:true});await h.finish();expect(h.port.list()[0].rendererId).toBe(nativeId);expect(ready(h,id).readAt(h.rows[0].time).plots[0].value).toBe(12);
});
it('invalid or absent inspection timestamps do not retire a genuine settled VWAP view',async()=>{
 const h=await fixture(),id=add(h);await h.finish();const view=ready(h,id);for(const time of [NaN,Infinity,h.rows[0].time-1,h.rows[2].time+60])expect(()=>view.readAt(time)).toThrow();expect(view.readAt(h.rows[1].time).plots[0].value).toBe(44/3);
});
it('one thousand scalar reads never clone history, query ctx bars or start another job',async()=>{
 const h=await fixture(),id=add(h);await h.finish();const view=ready(h,id),model=h.instance(id),workers=h.transports.length,values=h.port.values,list=h.port.list,bars=model.ctx.bars;let forbidden=0;
 h.port.values=(()=>{forbidden++;throw Error('History clone.');}) as any;h.port.list=(()=>{forbidden++;throw Error('Metadata enumeration.');}) as any;model.ctx.bars=()=>{forbidden++;throw Error('Native history read.');};
 try{for(let index=0;index<1000;index++)expect(view.readAt(h.rows[1].time).plots[0].value).toBe(44/3);expect(forbidden).toBe(0);expect(h.transports).toHaveLength(workers);}finally{h.port.values=values;h.port.list=list;model.ctx.bars=bars;}
});
it('native pane movement rebinds only the pane proof without another VWAP calculation',async()=>{
 const h=await fixture(),id=add(h);await h.finish();const old=ready(h,id),before=old.readAt(h.rows[0].time).paneId,workers=h.transports.length;h.port.move(id,{newPane:true});expect(()=>old.assertCurrent()).toThrow();const value=ready(h,id).readAt(h.rows[0].time);expect(value.paneId).not.toBe(before);expect(value.plots[0].value).toBe(12);expect(h.transports).toHaveLength(workers);
});
it('changing the installed VWAP callback cannot upgrade its existing accepted receipt',async()=>{
 const h=await fixture(),id=add(h);await h.finish();const view=ready(h,id);h.instance(id).vwapCompute=()=>{};expect(()=>view.assertCurrent()).toThrow();expect(h.port.captureReadout?.(id).state).toBe('unavailable');
});
it('a real client abort preserves unavailable calculation state without a scalar fallback',async()=>{
 const h=await fixture(),id=add(h);await drainVwap();const worker=h.transports[0];h.client.dispose();await drainVwap();await h.port.waitForVwap();expect(worker.terminated).toBeGreaterThan(0);expect(h.port.values(id).series).toEqual([]);expect(h.port.captureReadout?.(id).state).toBe('unavailable');
});
it('a numeric source edit obtains a fresh actual job and cannot reuse the old readout',async()=>{
 const h=await fixture(),id=add(h);await h.finish();const old=ready(h,id);h.port.update(id,{inputs:{source:'high'}});expect(()=>old.assertCurrent()).toThrow();expect(h.port.captureReadout?.(id).state).toBe('unavailable');await h.finish();expect(h.rows.map(row=>ready(h,id).readAt(row.time).plots[0].value)).toEqual([14,18,20]);
});
it('native edit rejection cannot revive an older view and explicit current recompute reproves rollback',async()=>{
 const h=await fixture(),id=add(h);await h.finish();const old=ready(h,id),model=h.instance(id),handle=model.handle,original=handle.setInputs;let once=true;handle.setInputs=(inputs:any)=>{const accepted=original.call(handle,inputs);if(once){once=false;throw Error('Synthetic native input rejection after authenticated callback.');}return accepted;};
 expect(()=>h.port.update(id,{inputs:{source:'high'}})).toThrow();handle.setInputs=original;expect(()=>old.assertCurrent()).toThrow();expect(h.port.captureReadout?.(id).state).toBe('unavailable');expect(h.port.values(id).series[0].values).toEqual([12,44/3,98/6]);h.port.recompute();await h.finish();expect(ready(h,id).readAt(h.rows[1].time).plots[0].value).toBe(44/3);
});
it('owned restore uses a new model and does not reactivate a saved view token',async()=>{
 const h=await fixture(),id=add(h);await h.finish();const saved=h.port.serialize(),old=ready(h,id),model=h.instance(id);h.port.update(id,{inputs:{source:'high'}});await h.finish();expect(ready(h,id).readAt(h.rows[0].time).plots[0].value).toBe(14);expect(h.port.restore(saved).changed).toBe(true);await h.finish();expect(h.instance(id)).not.toBe(model);expect(()=>old.assertCurrent()).toThrow();expect(ready(h,id).readAt(h.rows[0].time).plots[0].value).toBe(12);
});
it('disposing the actual port retires retained settled views',async()=>{
 const h=await fixture(),id=add(h);await h.finish();const view=ready(h,id);h.port.dispose();expect(()=>view.assertCurrent()).toThrow();expect(h.port.captureReadout?.(id).state).toBe('unavailable');
});
