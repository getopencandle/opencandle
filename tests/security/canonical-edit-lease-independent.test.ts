import {expect,it} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';

const row=(color='red')=>({id:'line-a',type:'Trendline',anchors:[{x:0,y:12},{x:1,y:15}],style:{lineColor:color},opaque:{untouched:['future',3]}});
function fixture(){const document=new LosslessDrawingDocument();document.load({version:1,drawings:[row()],opaqueRoot:{future:true}});return document;}
function prepare(document:LosslessDrawingDocument,color='blue'){return document.prepareOwnedEditBatch(document.all(),[row(color)]);}

it('accepted two-row batch has exactly one history step and detached supplier data',()=>{
 const document=fixture();document.load({version:1,drawings:[row(),{...row(),id:'line-b'}]});
 const before=document.serialize(),expected=document.all(),next=expected.map(value=>({...value,style:{lineColor:'blue'}}));
 const lease=document.prepareOwnedEditBatch(expected,next);next[0].style.lineColor='poison';
 lease.stage();lease.accept();expect(document.all().map(value=>value.style)).toEqual([{lineColor:'blue'},{lineColor:'blue'}]);
 expect(()=>lease.rollback()).toThrow();expect(document.undo()).toBe(true);expect(document.serialize()).toEqual(before);expect(document.undo()).toBe(false);
});

it('rollback restores an existing future and past rather than replacing either with the attempted edit',()=>{
 const document=fixture();document.stageEditedRecord(row(),row('green'));document.stageEditedRecord(row('green'),row('purple'));document.undo();
 const lease=prepare(document);lease.stage();lease.rollback();
 expect(document.all()[0]).toEqual(row('green'));expect(document.redo()).toBe(true);expect(document.all()[0]).toEqual(row('purple'));
 expect(document.undo()).toBe(true);expect(document.undo()).toBe(true);expect(document.all()[0]).toEqual(row());expect(document.undo()).toBe(false);
});

it('copied and unbound capability methods cannot consume the original',()=>{
 const document=fixture(),lease=prepare(document),copy={...lease};
 expect(()=>copy.stage()).toThrow(/receiver/);expect(()=>lease.stage.call(undefined)).toThrow(/receiver/);
 lease.stage();expect(()=>copy.accept()).toThrow(/receiver/);expect(()=>lease.accept.call(copy)).toThrow(/receiver/);lease.accept();
 expect(document.all()[0]).toEqual(row('blue'));expect(()=>lease.stage()).toThrow();
});

for(const [name,mutate] of [
 ['equal-value load',(document:LosslessDrawingDocument)=>document.load(document.serialize())],
 ['no-op Undo',(document:LosslessDrawingDocument)=>document.undo()],
 ['no-op Redo',(document:LosslessDrawingDocument)=>document.redo()],
 ['failed load',(document:LosslessDrawingDocument)=>{try{document.load(null);}catch{}}],
 ['failed atomic action',(document:LosslessDrawingDocument)=>{try{document.atomic(()=>{throw Error('original failure');});}catch{}}],
 ['unchanged metadata',(document:LosslessDrawingDocument)=>document.stageManagerMetadata(document.serialize(),document.serialize())],
] as const)it(`prepared lease cannot survive ${name}`,()=>{
 const document=fixture(),lease=prepare(document);mutate(document);const authoritative=document.serialize();
 expect(()=>lease.stage()).toThrow(/retired/);expect(document.serialize()).toEqual(authoritative);
});

it('same-byte replacement after stage blocks rollback without changing replacement history',()=>{
 const document=fixture(),lease=prepare(document);lease.stage();const replaced=document.serialize();document.load(replaced);
 expect(()=>lease.rollback()).toThrow(/retired/);expect(document.serialize()).toEqual(replaced);expect(document.undo()).toBe(false);
});

it('unrelated edits after staging retain their exact history on rejected rollback',()=>{
 const document=fixture(),lease=prepare(document);lease.stage();document.stageEditedRecord(row('blue'),row('green'));
 expect(()=>lease.rollback()).toThrow(/retired/);expect(document.all()[0]).toEqual(row('green'));
 expect(document.undo()).toBe(true);expect(document.all()[0]).toEqual(row('blue'));expect(document.undo()).toBe(true);expect(document.all()[0]).toEqual(row());
});

it('candidate accessors are rejected without executing them or modifying canonical history',()=>{
 const document=fixture(),next=row('blue');let reads=0;Object.defineProperty(next,'injected',{enumerable:true,get(){reads++;return 1;}});
 expect(()=>document.prepareOwnedEditBatch(document.all(),[next])).toThrow();expect(reads).toBe(0);expect(document.all()[0]).toEqual(row());expect(document.undo()).toBe(false);
});

it('accepted receipt is receiver-bound and permanently retired by a later no-op mutation attempt',()=>{
 const document=fixture(),lease=prepare(document);lease.stage();const accepted=lease.accept();accepted.assertCurrent();
 expect(()=>({...accepted}).assertCurrent()).toThrow(/receiver/);expect(()=>accepted.assertCurrent.call(undefined)).toThrow(/receiver/);
 expect(document.redo()).toBe(false);const current=document.serialize();expect(()=>accepted.assertCurrent()).toThrow(/retired/);expect(()=>accepted.assertCurrent()).toThrow(/retired/);expect(document.serialize()).toEqual(current);
});

it('replaced history accessor cannot execute during stage or revive its retired capability',()=>{
 const document=fixture(),lease=prepare(document),descriptor=Object.getOwnPropertyDescriptor(document,'future')!;let reads=0;
 Object.defineProperty(document,'future',{configurable:true,enumerable:true,get(){reads++;return descriptor.value;}});
 expect(()=>lease.stage()).toThrow(/descriptor/);expect(reads).toBe(0);Object.defineProperty(document,'future',descriptor);
 expect(()=>lease.stage()).toThrow(/invalidated/);expect(document.all()[0]).toEqual(row());
});

it('rollback exposes only a bound readonly restored-state receipt that retires on later no-op mutation',()=>{
 const document=fixture(),before=document.serialize(),lease=prepare(document);lease.stage();const restored=lease.rollback();
 expect(Object.isFrozen(restored)).toBe(true);restored.assertCurrent();expect(document.serialize()).toEqual(before);
 expect(()=>({...restored}).assertCurrent()).toThrow(/receiver/);expect(()=>restored.assertCurrent.call(undefined)).toThrow(/receiver/);
 expect(()=>lease.rollback()).toThrow(/consumed/);restored.assertCurrent();document.atomic(()=>{});
 expect(()=>restored.assertCurrent()).toThrow(/retired/);expect(()=>restored.assertCurrent()).toThrow(/retired/);expect(document.serialize()).toEqual(before);expect(document.undo()).toBe(false);
});
