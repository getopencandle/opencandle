import {expect,it} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';

function fixture(){const doc=new LosslessDrawingDocument();doc.load({version:1,drawings:[{id:'SYNTHETIC readonly line',type:'trendline',anchors:[{time:1,price:10},{time:2,price:20}],style:{lineWidth:1}}]});return doc;}

it('an owner acquired inside an aborted supported transaction cannot survive its state restoration',()=>{
 const doc=fixture(),before=doc.serialize();let inner:ReturnType<typeof doc.captureReadOnlyOwner>|undefined;
 expect(()=>doc.atomic(()=>{inner=doc.captureReadOnlyOwner();inner.assertCurrent();throw Error('SYNTHETIC abort after capture');})).toThrow(/abort after capture/);
 expect(doc.serialize()).toEqual(before);expect(()=>inner!.assertCurrent()).toThrow(/retired/);doc.captureReadOnlyOwner().assertCurrent();expect(doc.undo()).toBe(false);
});

it('pure edit preparation preserves readonly ownership while staging and rollback retire their respective owners',()=>{
 const doc=fixture(),before=doc.serialize(),opening=doc.captureReadOnlyOwner(),original=doc.all()[0],next={...original,style:{lineWidth:2}};
 const edit=doc.prepareOwnedEditBatch([original],[next]);opening.assertCurrent();edit.stage();expect(()=>opening.assertCurrent()).toThrow(/retired/);
 const staged=doc.captureReadOnlyOwner(),restored=edit.rollback();expect(()=>staged.assertCurrent()).toThrow(/retired/);expect(doc.serialize()).toEqual(before);restored.assertCurrent();
 const current=doc.captureReadOnlyOwner();expect(()=>edit.stage()).toThrow(/consumed|invalidated/);current.assertCurrent();restored.assertCurrent();
});

it('readonly acquisition rejects state accessors before invoking them',()=>{
 for(const field of ['document','past','future']){const doc=fixture(),descriptor=Object.getOwnPropertyDescriptor(doc,field)!;let reads=0;
  Object.defineProperty(doc,field,{configurable:true,enumerable:true,get(){reads++;throw Error('SYNTHETIC forbidden read');}});
  expect(()=>doc.captureReadOnlyOwner()).toThrow(/descriptor/);expect(reads).toBe(0);Object.defineProperty(doc,field,descriptor);doc.captureReadOnlyOwner().assertCurrent();
 }
});
