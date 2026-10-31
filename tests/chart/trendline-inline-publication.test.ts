import {expect,it,vi} from 'vitest';
import {captureTrendlineInlineOpening} from '../../src/chart/trendline-inline-publication';
import {DrawingEditRecoveryError} from '../../src/chart/drawing-edit-transaction';
import {templateAdapterHarness} from './drawing-template-adapter-harness';
import {annotationRecord} from './trendline-annotation-native-harness';

async function setup(){
 const record=annotationRecord(true),f=await templateAdapterHarness([record]);let source=true,mutable=true;
 const update=vi.fn(f.edit),assertMutable=vi.fn(()=>{if(!mutable)throw Error('Pending chart');}),host={document:f.document,facade:{ctrl:f.native.controller},assertSource:()=>{if(!source)throw Error('Source replaced');},assertMutable,update};
 return{f,host,update,open:()=>captureTrendlineInlineOpening(host,record.id),source:(value:boolean)=>{source=value;},mutable:(value:boolean)=>{mutable=value;}};
}
it('inline opening publishes only text through the actual adapter and keeps all unrelated settings',async()=>{
 const x=await setup();try{const before=x.f.document.serialize(),opening=x.open();expect(opening.initialValue).toBe(x.f.rows[0].text!.value);expect(opening.commit('SYNTHETIC\nchanged')).toEqual({accepted:true,changed:true});expect(x.update).toHaveBeenCalledExactlyOnceWith(x.f.rows[0].id,{'text.value':'SYNTHETIC\nchanged'});const expected=structuredClone(before);(expected.drawings as any[])[0].text.value='SYNTHETIC\nchanged';expect(x.f.document.serialize()).toEqual(expected);expect(()=>opening.assertCurrent()).toThrow();expect(()=>opening.commit('again')).toThrow();expect(x.f.document.undo()).toBe(true);expect(x.f.document.serialize()).toEqual(before);}finally{x.f.native.dispose();}
});
it('unchanged text consumes its private opening but creates no canonical history boundary',async()=>{
 const x=await setup();try{const opening=x.open();expect(opening.commit(opening.initialValue!)).toEqual({accepted:true,changed:false});expect(()=>opening.commit('second')).toThrow();expect(x.update).toHaveBeenCalledTimes(1);expect(x.f.document.undo()).toBe(false);}finally{x.f.native.dispose();}
});
it('pending ordinary rejection retains the exact opening for correction and accepted clear preserves the line',async()=>{
 const x=await setup();try{const opening=x.open();x.mutable(false);expect(()=>opening.commit('later')).toThrow('Pending');expect(x.update).not.toHaveBeenCalled();opening.assertCurrent();x.mutable(true);expect(opening.commit('')).toEqual({accepted:true,changed:true});expect(x.f.document.all()).toHaveLength(1);expect((x.f.document.all()[0].text as any).value).toBe('');}finally{x.f.native.dispose();}
});
it.each(['source','equal canonical replacement','equal native replacement'] as const)('a retired inline opening cannot edit after %s',async cause=>{
 const x=await setup();try{const opening=x.open();if(cause==='source')x.source(false);else if(cause==='equal canonical replacement')x.f.document.load(x.f.document.serialize());else x.f.native.controller.fromJSON(x.f.document.serialize());expect(()=>opening.commit('stale')).toThrow();x.source(true);expect(()=>opening.commit('restored')).toThrow();expect(x.update).not.toHaveBeenCalled();}finally{x.f.native.dispose();}
});
it('inline publication rejects nested commits without issuing a second adapter edit',async()=>{
 const x=await setup();try{const opening=x.open();x.update.mockImplementationOnce((id,patch)=>{expect(()=>opening.commit('nested')).toThrow('already in progress');return x.f.edit(id,patch);});opening.commit('outer');expect(x.update).toHaveBeenCalledTimes(1);expect((x.f.document.all()[0].text as any).value).toBe('outer');}finally{x.f.native.dispose();}
});
it('accepted subscriber failure cannot be retried or roll back accepted inline text',async()=>{
 const x=await setup();try{const opening=x.open();x.f.subscribe(()=>{throw Error('SYNTHETIC rejected saved publication');});expect(()=>opening.commit('accepted')).toThrow(DrawingEditRecoveryError);expect((x.f.document.all()[0].text as any).value).toBe('accepted');expect(()=>opening.commit('retry')).toThrow();expect(x.update).toHaveBeenCalledTimes(1);}finally{x.f.native.dispose();}
});
it('opening rechecks source and canonical identity after mutability callbacks',async()=>{
 const x=await setup();try{const opening=x.open();x.host.assertMutable.mockImplementationOnce(()=>{x.f.document.load(x.f.document.serialize());});expect(()=>opening.commit('stale')).toThrow();expect(x.update).not.toHaveBeenCalled();}finally{x.f.native.dispose();}
});
