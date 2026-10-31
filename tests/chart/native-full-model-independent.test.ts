import {expect,it} from 'vitest';
import {NativeRenderer,type NativeIndicatorOutput,type ScenePatch} from '@luxalgo/vela';
import {nativeCoreHarness} from './native-core-harness';

const output=(color='#123456'):NativeIndicatorOutput=>({series:[{id:'independent-main',title:'Main',kind:'line',paneId:'',points:[{time:1700000000000,value:10}],style:{color,width:2,lineStyle:'solid'}}],fills:[],priceLines:[]});
const patch=(id:string):ScenePatch=>({kind:'value',indicatorId:id,series:[],dirty:{from:1700000000000,to:1700000000000}});
const nextModel=(test:Awaited<ReturnType<typeof nativeCoreHarness>>)=>{const next=test.core.buildNativeModel(test.record,output('#abcdef'));test.core.placeModel(next,test.record.id,test.record.model.paneId);return next;};
it('rejects a copied native handle even when its serialized identity matches',async()=>{
 const test=await nativeCoreHarness();try{test.emit(output());const previous=test.native.scene.indicators.get(test.record.id);
 expect(()=>test.bridge.update({...test.record.renderHandle},patch(test.record.id))).toThrow(/handle ownership/i);
 expect(test.native.scene.indicators.get(test.record.id)).toBe(previous);
 }finally{test.dispose();}
});
it('rejects output accessors before executing them or replacing the accepted scene',async()=>{
 const test=await nativeCoreHarness();try{test.emit(output());const previous=test.native.scene.indicators.get(test.record.id),next=nextModel(test);let reads=0;
 Object.defineProperty(next.series[0],'id',{enumerable:true,get(){reads++;return 'independent-main';}});test.record.model=next;
 expect(()=>test.bridge.update(test.record.renderHandle,patch(test.record.id))).toThrow(/data/i);expect(reads).toBe(0);expect(test.native.scene.indicators.get(test.record.id)).toBe(previous);
 }finally{test.dispose();}
});
it('rejects a claim retired reentrantly during final core validation without native publication',async()=>{
 const test=await nativeCoreHarness();try{test.emit(output());const previous=test.native.scene.indicators.get(test.record.id);test.record.model=nextModel(test);
 let reads=0;test.core.registry.get=(id:string)=>{if(++reads===2)test.release();return test.records.get(id);};
 expect(()=>test.bridge.update(test.record.renderHandle,patch(test.record.id))).toThrow(/changed during validation/i);expect(test.native.scene.indicators.get(test.record.id)).toBe(previous);
 }finally{test.dispose();}
});
it('rejects an old renderer after the owning core adopts a replacement renderer',async()=>{
 const test=await nativeCoreHarness();try{test.emit(output());const previous=test.native.scene.indicators.get(test.record.id);test.record.model=nextModel(test);test.core.renderer=new NativeRenderer();
 expect(()=>test.bridge.update(test.record.renderHandle,patch(test.record.id))).toThrow(/renderer|owner/i);expect(test.native.scene.indicators.get(test.record.id)).toBe(previous);
 }finally{test.dispose();}
});
it('restores exact accepted scene and core model after a late mount failure',async()=>{
 const test=await nativeCoreHarness();try{test.emit(output());const previous=test.native.scene.indicators.get(test.record.id);test.record.model=nextModel(test);
 const initial=new Error('independent late mount failure');let calls=0;test.native.mountIndicator=(model:unknown)=>{const handle=NativeRenderer.prototype.mountIndicator.call(test.renderer,model as any);if(++calls===1)throw initial;return handle;};
 expect(()=>test.bridge.update(test.record.renderHandle,patch(test.record.id))).toThrow(initial);expect(calls).toBe(2);expect(test.native.scene.indicators.get(test.record.id)).toBe(previous);expect(test.record.model).toBe(previous);
 }finally{test.dispose();}
});
it('preserves both native update and recovery failures rather than reporting a successful rollback',async()=>{
 const test=await nativeCoreHarness();try{test.emit(output());test.record.model=nextModel(test);
 const initial=new Error('independent publication failure'),recovery=new Error('independent recovery failure');let calls=0;test.native.mountIndicator=()=>{throw ++calls===1?initial:recovery;};
 let failure:unknown;try{test.bridge.update(test.record.renderHandle,patch(test.record.id));}catch(error){failure=error;}
 expect(failure).toBeInstanceOf(AggregateError);expect((failure as AggregateError).errors).toEqual([initial,recovery]);expect(calls).toBe(2);
 }finally{test.dispose();}
});
it('does not overwrite a newer core model when publication retires the owner before throwing',async()=>{
 const test=await nativeCoreHarness();try{test.emit(output());test.record.model=nextModel(test);const replacement=nextModel(test),initial=new Error('independent retired publication');let calls=0;
 test.native.mountIndicator=()=>{calls++;test.record.model=replacement;test.release();throw initial;};
 expect(()=>test.bridge.update(test.record.renderHandle,patch(test.record.id))).toThrow();expect(calls).toBe(1);expect(test.record.model).toBe(replacement);
 }finally{test.dispose();}
});
