import {expect,it} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';

type Row=Record<string,unknown>;
function row(id='SYNTHETIC source'):Row{return{id,type:'trendline',paneId:'price',zIndex:1,anchors:[{time:1000000,price:100},{time:1120000,price:120}],props:{lvTrendlineStats:{schemaVersion:99,opaque:[null,'unknown']},future:{empty:undefined,signedZero:-0,nested:{value:'SYNTHETIC preserve'}}},text:{value:'SYNTHETIC annotation'},visible:false,locked:true};}
function setup(){const document=new LosslessDrawingDocument(),source=row();document.load({version:1,drawings:[source],lvDrawingManager:{schemaVersion:1,groups:[],templates:[]},futureDocument:{untouched:true}});return{document,source:document.all()[0]};}
const clone=(source:Row,id='SYNTHETIC copy',zIndex=10):Row=>({...structuredClone(source),id,zIndex});
it('rollback preserves an earlier command and redo branch rather than substituting a load',()=>{
 const {document,source}=setup(),second={...source,lvName:'SYNTHETIC second'},third={...second,lvName:'SYNTHETIC third'};
 document.stageEditedRecord(source,second);const acceptedSecond=document.all()[0];document.stageEditedRecord(acceptedSecond,third);expect(document.undo()).toBe(true);
 const current=document.all()[0],before=document.serialize(),lease=document.prepareOwnedInsertBatch([current],[clone(current)]);lease.stage();const restored=lease.rollback();restored.assertCurrent();expect(document.serialize()).toEqual(before);
 expect(document.redo()).toBe(true);expect(document.all()).toEqual([third]);expect(()=>restored.assertCurrent()).toThrow();expect(document.undo()).toBe(true);expect(document.undo()).toBe(true);expect(document.all()).toEqual([source]);expect(document.undo()).toBe(false);
});
it('accepted multi-copy is exactly one new command with stable identities and cleared old redo',()=>{
 const {document,source}=setup(),other={...structuredClone(source),id:'SYNTHETIC other'};document.load({...document.serialize(),drawings:[source,other]});
 const second={...source,lvName:'SYNTHETIC second'},abandoned={...second,lvName:'SYNTHETIC abandoned redo'};document.stageEditedRecord(source,second);document.stageEditedRecord(second,abandoned);expect(document.undo()).toBe(true);
 const current=document.all(),copies=[clone(current[1],'SYNTHETIC copy-B',20),clone(current[0],'SYNTHETIC copy-A',21)];
 const lease=document.prepareOwnedInsertBatch([current[1],current[0]],copies);expect(lease.ids).toEqual(['SYNTHETIC copy-B','SYNTHETIC copy-A']);lease.stage();const accepted=lease.accept();accepted.assertCurrent();const complete=document.serialize();
 expect(document.undo()).toBe(true);expect(document.all()).toEqual(current);expect(()=>accepted.assertCurrent()).toThrow();expect(document.redo()).toBe(true);expect(document.serialize()).toEqual(complete);expect(document.redo()).toBe(false);expect(document.undo()).toBe(true);expect(document.undo()).toBe(true);expect(document.all()).toEqual([source,other]);expect(document.undo()).toBe(false);
});
it('preview and supplied clones expose no mutation authority and retain undefined, negative zero and opaque metadata',()=>{
 const {document,source}=setup(),copy=clone(source),before=document.serialize(),lease=document.prepareOwnedInsertBatch([source],[copy]);
 (copy.props as any).future.nested.value='SYNTHETIC caller mutation';const first=lease.readCandidate();(first.drawings as Row[])[1].text={value:'SYNTHETIC preview mutation'};
 expect(document.serialize()).toEqual(before);expect(()=>((lease.ids as unknown as string[]).push('forged'))).toThrow();
 lease.stage();const inserted=document.all()[1];expect((inserted.props as any).future.nested.value).toBe('SYNTHETIC preserve');expect(Object.hasOwn((inserted.props as any).future,'empty')).toBe(true);expect(Object.is((inserted.props as any).future.signedZero,-0)).toBe(true);expect(inserted.text).toEqual(source.text);expect(inserted.props).toEqual(source.props);lease.accept();
});
it('canonical same-byte ABA through supported edit and Undo permanently retires staged rollback',()=>{
 const {document,source}=setup(),lease=document.prepareOwnedInsertBatch([source],[clone(source)]);lease.stage();const staged=document.serialize(),changed={...source,lvName:'SYNTHETIC nested accepted change'};
 document.stageEditedRecord(source,changed);expect(document.undo()).toBe(true);expect(document.serialize()).toEqual(staged);
 expect(()=>lease.rollback()).toThrow();expect(()=>lease.assertCurrent()).toThrow();expect(document.serialize()).toEqual(staged);expect(document.redo()).toBe(true);expect(document.all()[0]).toEqual(changed);
});
it('equal-value metadata attempts and rejected supported writes retire prepared insertion without publishing',()=>{
 for(const mutate of [(d:LosslessDrawingDocument)=>{const before=d.serialize();expect(d.stageManagerMetadata(before,before)).toBe(false);},(d:LosslessDrawingDocument)=>{expect(()=>d.load({version:1,drawings:[null]})).toThrow();},(d:LosslessDrawingDocument)=>{const before=d.serialize();d.enrichPaneBindings(before,before);}]){
  const {document,source}=setup(),lease=document.prepareOwnedInsertBatch([source],[clone(source)]),before=document.serialize();mutate(document);expect(document.serialize()).toEqual(before);expect(()=>lease.stage()).toThrow();expect(()=>lease.readCandidate()).toThrow();expect(document.all()).toHaveLength(1);expect(document.undo()).toBe(false);
 }
});
it('copied and unbound lease receivers cannot stage or inspect a real candidate',()=>{
 const {document,source}=setup(),lease=document.prepareOwnedInsertBatch([source],[clone(source)]),copied={...lease},before=document.serialize();
 expect(()=>copied.readCandidate()).toThrow();expect(()=>copied.stage()).toThrow();expect(()=>lease.accept.call(copied)).toThrow();const unbound=lease.readCandidate;expect(()=>unbound()).toThrow();expect(document.serialize()).toEqual(before);lease.stage();const accepted=lease.accept();expect(()=>accepted.assertCurrent.call({...accepted})).toThrow();accepted.assertCurrent();
});
it('accessor-bearing copy rejection invokes no getters and preserves existing canonical history',()=>{
 const {document,source}=setup(),updated={...source,lvName:'SYNTHETIC accepted before invalid copy'};document.stageEditedRecord(source,updated);const copy=clone(updated);let reads=0;
 Object.defineProperty(copy,'future',{enumerable:true,get(){reads++;throw Error('SYNTHETIC accessor must not run');}});const before=document.serialize();expect(()=>document.prepareOwnedInsertBatch([updated],[copy])).toThrow();expect(reads).toBe(0);expect(document.serialize()).toEqual(before);expect(document.undo()).toBe(true);expect(document.all()).toEqual([source]);
});
