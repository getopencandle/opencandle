import {expect,it,vi} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';

function setup(){
 const document=new LosslessDrawingDocument(),rows=[0,1].map(index=>({id:'SYNTHETIC-'+index,type:'trendline',paneId:'price',anchors:[{time:1000,price:10},{time:2000,price:20}],style:{lineColor:'#123456',lineWidth:1},opaque:{label:'SYNTHETIC retained'}}));
 document.load({version:1,drawings:rows,opaqueRoot:{retained:true}});
 const next=()=>document.all().map(row=>({...row,style:{...(row.style as object),lineWidth:4}}));
 return{document,rows,next,prepare:()=>document.prepareOwnedEditBatch(document.all(),next())};
}
it('stages a multi-row edit once and acceptance keeps one canonical Undo/Redo command',()=>{
 const h=setup(),before=h.document.serialize(),batch=h.prepare();expect(batch.count).toBe(2);batch.assertCurrent();expect(h.document.serialize()).toEqual(before);batch.stage();expect(h.document.all()).toEqual(h.next());batch.accept();
 for(const action of [()=>batch.stage(),()=>batch.assertCurrent(),()=>batch.accept(),()=>batch.rollback()])expect(action).toThrow(/consumed/);
 expect(h.document.undo()).toBe(true);expect(h.document.serialize()).toEqual(before);expect(h.document.undo()).toBe(false);expect(h.document.redo()).toBe(true);expect(h.document.all()).toEqual(h.next());
});
it('rollback restores both existing past and future stacks exactly',()=>{
 const h=setup(),a=h.document.serialize(),bRows=h.next();h.document.stageEditedRecords(h.document.all(),bRows);const b=h.document.serialize(),cRows=bRows.map(row=>({...row,style:{...row.style,lineWidth:7}}));h.document.stageEditedRecords(bRows,cRows);const c=h.document.serialize();h.document.undo();
 const batch=h.document.prepareOwnedEditBatch(h.document.all(),h.document.all().map(row=>({...row,style:{...(row.style as object),lineWidth:9}})));batch.stage();batch.rollback();expect(h.document.serialize()).toEqual(b);expect(()=>batch.rollback()).toThrow(/consumed/);
 expect(h.document.redo()).toBe(true);expect(h.document.serialize()).toEqual(c);expect(h.document.undo()).toBe(true);expect(h.document.serialize()).toEqual(b);expect(h.document.undo()).toBe(true);expect(h.document.serialize()).toEqual(a);expect(h.document.undo()).toBe(false);
});
it('copied and foreign receivers cannot use or consume a genuine lease',()=>{
 const h=setup(),batch=h.prepare(),copy={...batch};for(const method of ['stage','assertCurrent','accept','rollback'] as const)expect(()=>copy[method]()).toThrow(/Foreign/);
 batch.stage();for(const method of ['stage','assertCurrent','accept','rollback'] as const)expect(()=>batch[method].call({} as any)).toThrow(/Foreign/);batch.assertCurrent();batch.rollback();expect(h.document.all()).toEqual(h.rows);
});
it('competing prepared leases cannot borrow the first staged epoch',()=>{
 const h=setup(),first=h.prepare(),second=h.prepare();first.stage();expect(()=>second.stage()).toThrow(/retired/);first.assertCurrent();first.accept();expect(h.document.all()[0].style).toMatchObject({lineWidth:4});
});
it.each(['load','undo','redo','failed-load','failed-edit','metadata-noop','binding-noop','merge-noop','atomic-noop','atomic-throw'] as const)('a %s entry retires a prepared lease even when canonical bytes are unchanged',kind=>{
 const h=setup(),batch=h.prepare(),before=h.document.serialize(),rows=h.document.all();
 if(kind==='load')h.document.load(before);
 if(kind==='undo')expect(h.document.undo()).toBe(false);
 if(kind==='redo')expect(h.document.redo()).toBe(false);
 if(kind==='failed-load')expect(()=>h.document.load(null)).toThrow();
 if(kind==='failed-edit')expect(()=>h.document.stageEditedRecords([],[])).toThrow();
 if(kind==='metadata-noop')expect(h.document.stageManagerMetadata(before,before)).toBe(false);
 if(kind==='binding-noop')h.document.enrichPaneBindings(before,before);
 if(kind==='merge-noop')h.document.mergeRenderable(rows,new Set(['trendline']));
 if(kind==='atomic-noop')h.document.atomic(()=>{});
 if(kind==='atomic-throw')expect(()=>h.document.atomic(()=>{throw Error('SYNTHETIC callback failure');})).toThrow();
 expect(h.document.serialize()).toEqual(before);expect(()=>batch.stage()).toThrow(/retired/);expect(h.document.serialize()).toEqual(before);expect(h.document.undo()).toBe(false);
});
it('equal-value load after staging retires rollback without recreating history',()=>{
 const h=setup(),batch=h.prepare();batch.stage();const accepted=h.document.serialize();h.document.load(accepted);
 expect(()=>batch.rollback()).toThrow(/retired/);expect(h.document.serialize()).toEqual(accepted);expect(h.document.undo()).toBe(false);expect(h.document.redo()).toBe(false);
});
it('an unrelated newer edit and its history survive a rejected old rollback',()=>{
 const h=setup(),batch=h.prepare();batch.stage();const staged=h.document.serialize(),old=h.document.all()[1],replacement={...old,style:{...(old.style as object),lineColor:'#abcdef'}};h.document.stageEditedRecord(old,replacement);const newest=h.document.serialize();
 expect(()=>batch.rollback()).toThrow(/retired/);expect(h.document.serialize()).toEqual(newest);expect(h.document.undo()).toBe(true);expect(h.document.serialize()).toEqual(staged);
});
it('an outer atomic failure cannot resurrect a lease minted within its discarded mutation',()=>{
 const h=setup();let batch:ReturnType<typeof h.prepare>|undefined;const before=h.document.serialize();
 expect(()=>h.document.atomic(()=>{batch=h.prepare();batch.stage();throw Error('SYNTHETIC outer failure');})).toThrow('SYNTHETIC outer failure');
 expect(()=>batch!.rollback()).toThrow(/retired/);expect(h.document.serialize()).toEqual(before);expect(h.document.undo()).toBe(false);
});
it('staging and rollback use only prepared private state, without clone or serialization callbacks',()=>{
 const h=setup(),batch=h.prepare(),clone=vi.spyOn(globalThis,'structuredClone').mockImplementation(()=>{throw Error('Unexpected clone during private transition');}),serialize=vi.spyOn(h.document,'serialize').mockImplementation(()=>{throw Error('Unexpected serializer callback');});
 try{batch.stage();batch.assertCurrent();batch.rollback();}finally{clone.mockRestore();serialize.mockRestore();}
 expect(h.document.all()).toEqual(h.rows);expect(h.document.undo()).toBe(false);
});
it('bounded preparation rejects changed IDs, duplicates, no-op batches, accessors and oversized values before cloning',()=>{
 const h=setup(),before=h.document.serialize(),rows=h.document.all();
 expect(()=>h.document.prepareOwnedEditBatch(rows,rows)).toThrow(/changed batch/);
 expect(()=>h.document.prepareOwnedEditBatch(rows,[{...rows[0],id:'NEW'},rows[1]])).toThrow(/canonical/);
 expect(()=>h.document.prepareOwnedEditBatch([rows[0],rows[0]],h.next())).toThrow(/canonical/);
 let reads=0;const next=h.next();Object.defineProperty(next[0],'style',{enumerable:true,get(){reads++;return{};}});expect(()=>h.document.prepareOwnedEditBatch(rows,next)).toThrow(/accessors/);expect(reads).toBe(0);
 const huge=h.next();(huge[0] as any).opaque='x'.repeat(17*1024*1024);const clone=vi.spyOn(globalThis,'structuredClone').mockImplementation(()=>{throw Error('Unexpected clone before resource rejection');});try{expect(()=>h.document.prepareOwnedEditBatch(rows,huge)).toThrow(/resource|32 MiB/);}finally{clone.mockRestore();}
 expect(h.document.serialize()).toEqual(before);expect(h.document.undo()).toBe(false);
});
it('private transitions cannot invoke a replaced public-shaped epoch method',()=>{
 const h=setup(),batch=h.prepare(),callback=vi.fn(()=>{throw Error('SYNTHETIC external callback');});Object.defineProperty(h.document,'enterMutation',{value:callback,configurable:true});
 batch.stage();batch.rollback();expect(callback).not.toHaveBeenCalled();expect(h.document.all()).toEqual(h.rows);
});
it('a canonical accessor replacement retires rollback before reading or invoking it',()=>{
 const h=setup(),batch=h.prepare();batch.stage();const property=Object.getOwnPropertyDescriptor(h.document,'document')!;let reads=0;
 Object.defineProperty(h.document,'document',{configurable:true,get(){reads++;return property.value;}});
 expect(()=>batch.rollback()).toThrow(/owner|descriptor|retired/);expect(reads).toBe(0);
 Object.defineProperty(h.document,'document',property);expect(h.document.all()).toEqual(h.next());
});
it('a history accessor replacement retires preparation before reading or invoking it',()=>{
 const h=setup(),property=Object.getOwnPropertyDescriptor(h.document,'past')!;let reads=0;
 Object.defineProperty(h.document,'past',{configurable:true,get(){reads++;return property.value;}});
 expect(()=>h.document.prepareOwnedEditBatch(h.rows,h.next())).toThrow(/owner|descriptor|retired/);expect(reads).toBe(0);Object.defineProperty(h.document,'past',property);
});
it('acceptance retains read-only ownership after consuming rollback, and equal-value replacement retires it permanently',()=>{
 const h=setup(),batch=h.prepare();batch.stage();const receipt=batch.accept(),accepted=h.document.serialize();receipt.assertCurrent();expect(()=>({...receipt}).assertCurrent()).toThrow(/Foreign/);expect(()=>batch.rollback()).toThrow(/consumed/);receipt.assertCurrent();
 h.document.load(accepted);expect(()=>receipt.assertCurrent()).toThrow(/retired/);expect(()=>receipt.assertCurrent()).toThrow(/retired/);expect(h.document.serialize()).toEqual(accepted);expect(h.document.undo()).toBe(false);
});
it('owned rollback returns a readonly restored-state receipt and cannot authorize another rollback',()=>{
 const h=setup(),before=h.document.serialize(),batch=h.prepare();batch.stage();const receipt=batch.rollback();expect(Object.isFrozen(receipt)).toBe(true);receipt.assertCurrent();expect(h.document.serialize()).toEqual(before);
 expect(()=>({...receipt}).assertCurrent()).toThrow(/Foreign/);expect(()=>batch.rollback()).toThrow(/consumed/);receipt.assertCurrent();h.document.load(before);expect(()=>receipt.assertCurrent()).toThrow(/retired/);expect(()=>receipt.assertCurrent()).toThrow(/retired/);expect(h.document.serialize()).toEqual(before);
});
