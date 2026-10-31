import {expect,it} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';

function fixture(){const document=new LosslessDrawingDocument();document.load({version:1,drawings:[{id:'SYNTHETIC line',type:'trendline',anchors:[{time:1,price:10},{time:2,price:20}],opaque:{retained:true}}]});return document;}

it('read-only owner acquisition, assertion and detached serialization do not create or replace history',()=>{
 const document=fixture(),before=document.serialize(),receipt=document.captureReadOnlyOwner();
 expect(Object.isFrozen(receipt)).toBe(true);receipt.assertCurrent();const copy=document.serialize();(copy.drawings as any[])[0].opaque.retained=false;
 expect(document.all()).toEqual(before.drawings);receipt.assertCurrent();expect(document.undo()).toBe(false);expect(()=>receipt.assertCurrent()).toThrow('retired');
});
it('equal-value supported load permanently retires the old readonly owner',()=>{
 const document=fixture(),receipt=document.captureReadOnlyOwner(),value=document.serialize();document.load(value);
 expect(()=>receipt.assertCurrent()).toThrow('retired');document.load(value);expect(()=>receipt.assertCurrent()).toThrow('retired');document.captureReadOnlyOwner().assertCurrent();
});
it('failed supported mutation and no-op undo/redo retire read-only owners',()=>{
 const document=fixture();let receipt=document.captureReadOnlyOwner();expect(()=>document.load({version:1,drawings:null})).toThrow();expect(()=>receipt.assertCurrent()).toThrow('retired');
 for(const action of [()=>document.undo(),()=>document.redo(),()=>document.atomic(()=>{})]){receipt=document.captureReadOnlyOwner();action();expect(()=>receipt.assertCurrent()).toThrow('retired');}
});
it('foreign receiver attempts do not consume the genuine readonly owner',()=>{
 const receipt=fixture().captureReadOnlyOwner();expect(()=>receipt.assertCurrent.call({...receipt})).toThrow('Foreign');receipt.assertCurrent();
});
it('descriptor replacement retires before invoking an accessor and cannot revive by restoring it',()=>{
 const document=fixture(),receipt=document.captureReadOnlyOwner(),original=Object.getOwnPropertyDescriptor(document,'document')!;let reads=0;
 Object.defineProperty(document,'document',{get(){reads++;throw Error('Unintended getter');},configurable:true,enumerable:true});
 expect(()=>receipt.assertCurrent()).toThrow('descriptor');expect(reads).toBe(0);Object.defineProperty(document,'document',original);expect(()=>receipt.assertCurrent()).toThrow('retired');
});
