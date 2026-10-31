import {expect,it,vi} from 'vitest';
import {LosslessDrawingDocument,type OwnedDrawingInsertBatch} from '../../src/chart/contracts';

type Row=Record<string,unknown>;
function fixture(){
 const document=new LosslessDrawingDocument(),rows:Row[]=[0,1].map(index=>({id:'SYNTHETIC source '+index,type:'trendline',paneId:'price',zIndex:0,anchors:[{time:1000,price:10},{time:2000,price:20}],style:{lineColor:'#123456',lineWidth:2},props:{lvTrendlineStats:{schemaVersion:99,future:{value:'SYNTHETIC opaque'}},futureProps:[false,null,-0]},text:{value:'SYNTHETIC label\r\nretained',futureText:{kept:true}},futureOwn:undefined,lvPaneBinding:{schemaVersion:1,target:{kind:'price'}}}));
 document.load({version:1,drawings:rows,opaqueRoot:{retained:true},lvDrawingManager:{schemaVersion:1,groups:[{id:'SYNTHETIC group',name:'SYNTHETIC',memberIds:[rows[0].id]}],templates:[]}});
 const copies=(sources:Row[]=document.all()):Row[]=>sources.map((row,index)=>({...row,id:'SYNTHETIC copy '+index,zIndex:50+index}));
 const prepare=()=>document.prepareOwnedInsertBatch(document.all(),copies());
 return{document,rows,copies,prepare};
}

it('appends exact complete opaque copies once, preserving omission, signed zero and one stable-ID history command',()=>{
 const f=fixture(),before=f.document.serialize(),lease=f.prepare(),candidate=lease.readCandidate();
 expect(lease.count).toBe(2);expect(Object.isFrozen(lease)).toBe(true);expect(Object.isFrozen(lease.ids)).toBe(true);expect(lease.ids).toEqual(['SYNTHETIC copy 0','SYNTHETIC copy 1']);expect(f.document.serialize()).toEqual(before);
 expect((candidate.drawings as Row[]).slice(0,2)).toEqual(f.rows);expect(candidate.lvDrawingManager).toEqual(before.lvDrawingManager);expect(Object.hasOwn((candidate.drawings as Row[])[2],'futureOwn')).toBe(true);expect(Object.is(((candidate.drawings as Row[])[2].props as any).futureProps[2],-0)).toBe(true);
 lease.stage();const receipt=lease.accept();receipt.assertCurrent();expect(f.document.serialize()).toEqual(candidate);expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toEqual(candidate);expect(f.document.redo()).toBe(false);
});

it('rollback restores the exact prior document and both existing history directions',()=>{
 const f=fixture(),a=f.document.serialize(),first=f.document.all(),second=first.map(row=>({...row,locked:true}));f.document.stageEditedRecords(first,second);const b=f.document.serialize();const third=second.map(row=>({...row,visible:false}));f.document.stageEditedRecords(second,third);const c=f.document.serialize();expect(f.document.undo()).toBe(true);
 const lease=f.prepare();lease.stage();const receipt=lease.rollback();receipt.assertCurrent();expect(f.document.serialize()).toEqual(b);expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toEqual(c);expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(b);expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(a);expect(f.document.undo()).toBe(false);
});

it('copied receivers cannot preview, consume or retire genuine insertion authority',()=>{
 const f=fixture(),lease=f.prepare(),copy={...lease};
 for(const method of ['readCandidate','stage','assertCurrent','accept','rollback'] as const)expect(()=>copy[method]()).toThrow(/Foreign/);
 lease.stage();for(const method of ['readCandidate','stage','assertCurrent','accept','rollback'] as const)expect(()=>lease[method].call({} as OwnedDrawingInsertBatch)).toThrow(/Foreign/);lease.assertCurrent();const receipt=lease.accept();expect(()=>({...receipt}).assertCurrent()).toThrow(/Foreign/);receipt.assertCurrent();
 for(const method of ['readCandidate','stage','assertCurrent','accept','rollback'] as const)expect(()=>lease[method]()).toThrow(/consumed/);
});

it('input and preview mutation cannot alter private staged copies',()=>{
 const f=fixture(),source=f.document.all(),copies=f.copies(source),lease=f.document.prepareOwnedInsertBatch(source,copies),preview=lease.readCandidate(),expected=structuredClone(preview);
 (source[0].style as any).lineWidth=99;(copies[0].props as any).futureProps[0]='changed';(preview.drawings as Row[]).length=0;(preview.opaqueRoot as any).retained=false;
 lease.stage();lease.accept();expect(f.document.serialize()).toEqual(expected);
});

it('competing insertion leases cannot borrow another lease staged document or epoch',()=>{
 const f=fixture(),first=f.prepare(),second=f.prepare();first.stage();expect(()=>second.stage()).toThrow(/retired/);first.assertCurrent();first.accept();expect(f.document.all()).toHaveLength(4);expect(f.document.undo()).toBe(true);expect(f.document.undo()).toBe(false);
});

it.each(['load','undo','redo','failed-load','failed-edit','metadata-noop','binding-noop','merge-noop','atomic-noop','atomic-throw'] as const)('%s retires prepared insertion even when canonical bytes are unchanged',kind=>{
 const f=fixture(),before=f.document.serialize(),lease=f.prepare(),rows=f.document.all();
 if(kind==='load')f.document.load(before);
 if(kind==='undo')expect(f.document.undo()).toBe(false);
 if(kind==='redo')expect(f.document.redo()).toBe(false);
 if(kind==='failed-load')expect(()=>f.document.load(null)).toThrow();
 if(kind==='failed-edit')expect(()=>f.document.stageEditedRecords([],[])).toThrow();
 if(kind==='metadata-noop')expect(f.document.stageManagerMetadata(before,before)).toBe(false);
 if(kind==='binding-noop')f.document.enrichPaneBindings(before,before);
 if(kind==='merge-noop')f.document.mergeRenderable(rows,new Set(['trendline']));
 if(kind==='atomic-noop')f.document.atomic(()=>{});
 if(kind==='atomic-throw')expect(()=>f.document.atomic(()=>{throw Error('SYNTHETIC failed operation');})).toThrow();
 expect(f.document.serialize()).toEqual(before);expect(()=>lease.stage()).toThrow(/retired/);expect(()=>lease.stage()).toThrow(/invalidated/);expect(f.document.serialize()).toEqual(before);
});

it('equal replacement after staging permanently forbids cleanup, including after values are restored',()=>{
 const f=fixture(),lease=f.prepare();lease.stage();const staged=f.document.serialize();f.document.load(staged);expect(()=>lease.rollback()).toThrow(/retired/);f.document.load(staged);expect(()=>lease.rollback()).toThrow(/invalidated/);expect(f.document.serialize()).toEqual(staged);expect(f.document.undo()).toBe(false);
});

it('a newer edit of an inserted model and its history survive an old rollback attempt',()=>{
 const f=fixture(),lease=f.prepare();lease.stage();const staged=f.document.serialize(),copy=f.document.all()[2];f.document.stageEditedRecord(copy,{...copy,locked:true});const newer=f.document.serialize();expect(()=>lease.rollback()).toThrow(/retired/);expect(f.document.serialize()).toEqual(newer);expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(staged);
});

it('an outer discarded atomic operation cannot revive its insertion or receipt',()=>{
 const f=fixture(),before=f.document.serialize();let lease:OwnedDrawingInsertBatch|undefined;
 expect(()=>f.document.atomic(()=>{lease=f.prepare();lease.stage();throw Error('SYNTHETIC discarded owner');})).toThrow('discarded');expect(()=>lease!.rollback()).toThrow(/retired/);expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
});

it('rejects stale or altered source data, repeated sources/IDs, existing IDs, type changes and noncopy properties before staging',()=>{
 const f=fixture(),before=f.document.serialize(),source=f.document.all(),copies=f.copies(source);
 const invalid:[Row[],Row[]][]=[
  [source,[{...copies[0],id:source[0].id},copies[1]]],
  [source,[copies[0],{...copies[1],id:copies[0].id}]],
  [[source[0],source[0]],copies],
  [source,[{...copies[0],type:'hline'},copies[1]]],
  [source,[{...copies[0],text:{value:'lost opaque data'}},copies[1]]],
  [[{...source[0],locked:true},source[1]],copies],
  [source,[{...copies[0],futureOwn:'replaced'},copies[1]]],
 ];
 for(const [old,next]of invalid)expect(()=>f.document.prepareOwnedInsertBatch(old,next)).toThrow();
 const removed={...copies[0]};delete removed.futureOwn;expect(()=>f.document.prepareOwnedInsertBatch(source,[removed,copies[1]])).toThrow(/only/);
 for(const zIndex of [0,-1,.5,Infinity,Number.MAX_SAFE_INTEGER+1,undefined,'50'])expect(()=>f.document.prepareOwnedInsertBatch(source,[{...copies[0],zIndex},copies[1]])).toThrow();
 expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
});

it('strict descriptor and collection boundaries reject without running getters or serializers',()=>{
 const f=fixture(),before=f.document.serialize(),sources=f.document.all();let reads=0;
 const getter=f.copies(sources);Object.defineProperty(getter[0],'props',{enumerable:true,get(){reads++;return{};}});expect(()=>f.document.prepareOwnedInsertBatch(sources,getter)).toThrow(/accessors/);
 const hidden=f.copies(sources);Object.defineProperty(hidden[0],'hidden',{value:true,enumerable:false});expect(()=>f.document.prepareOwnedInsertBatch(sources,hidden)).toThrow(/hidden/);
 const symbol=f.copies(sources);Object.defineProperty(symbol[0],Symbol('SYNTHETIC'),{value:true});expect(()=>f.document.prepareOwnedInsertBatch(sources,symbol)).toThrow(/symbol/);
 const sparse=f.copies(sources);delete sparse[0];expect(()=>f.document.prepareOwnedInsertBatch(sources,sparse)).toThrow(/sparse/);
 const hook=f.copies(sources);hook[0].toJSON=()=>{reads++;return{};};expect(()=>f.document.prepareOwnedInsertBatch(sources,hook)).toThrow(/plain JSON/);expect(reads).toBe(0);expect(f.document.serialize()).toEqual(before);
});

it('bounds command, final document and byte work before clone or canonical mutation',()=>{
 const f=fixture(),before=f.document.serialize();expect(()=>f.document.prepareOwnedInsertBatch([],[])).toThrow(/bounded/);
 const sources=Array.from({length:129},(_,i)=>({...f.rows[0],id:'SYNTHETIC many '+i})),copies=f.copies(sources);expect(()=>f.document.prepareOwnedInsertBatch(sources,copies)).toThrow(/bounded/);
 const huge=f.copies();huge[0].futureText='x'.repeat(17*1024*1024);const clone=vi.spyOn(globalThis,'structuredClone').mockImplementation(()=>{throw Error('Unexpected clone before quota rejection');});try{expect(()=>f.document.prepareOwnedInsertBatch(f.rows,huge)).toThrow(/resource|32 MiB/);}finally{clone.mockRestore();}
 expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
 const full=new LosslessDrawingDocument(),rows=Array.from({length:10000},(_,i)=>({id:'SYNTHETIC capacity '+i,type:'trendline',opaque:i}));full.load({version:1,drawings:rows});expect(()=>full.prepareOwnedInsertBatch([rows[0]],[{...rows[0],id:'SYNTHETIC excess',zIndex:1}])).toThrow(/10000/);expect(full.all()).toHaveLength(10000);expect(full.undo()).toBe(false);
});

it('exact final 10000 capacity and 128-copy command boundary remain accepted',()=>{
 const document=new LosslessDrawingDocument(),rows=Array.from({length:9872},(_,i)=>({id:'SYNTHETIC bounded '+i,type:'trendline',opaque:i}));document.load({version:1,drawings:rows});const source=rows.slice(0,128),copies=source.map((row,i)=>({...row,id:'SYNTHETIC appended '+i,zIndex:i+1})),lease=document.prepareOwnedInsertBatch(source,copies);expect(lease.count).toBe(128);lease.stage();lease.accept();expect(document.all()).toHaveLength(10000);expect(document.undo()).toBe(true);expect(document.all()).toEqual(rows);expect(document.undo()).toBe(false);
});

it('stage and rollback require no public clone, serialization, or public-shaped epoch callback',()=>{
 const f=fixture(),lease=f.prepare(),clone=vi.spyOn(globalThis,'structuredClone').mockImplementation(()=>{throw Error('Unexpected transition clone');}),serialize=vi.spyOn(f.document,'serialize').mockImplementation(()=>{throw Error('Unexpected serializer callback');}),epoch=vi.fn(()=>{throw Error('Unexpected public epoch');});Object.defineProperty(f.document,'enterMutation',{value:epoch,configurable:true});
 try{lease.stage();lease.assertCurrent();const receipt=lease.rollback();receipt.assertCurrent();expect(epoch).not.toHaveBeenCalled();}finally{clone.mockRestore();serialize.mockRestore();}expect(f.document.all()).toEqual(f.rows);expect(f.document.undo()).toBe(false);
});

it('reentrant preview copying retires before returning a candidate for another owner',()=>{
 const f=fixture(),lease=f.prepare(),before=f.document.serialize(),original=globalThis.structuredClone;let first=true;
 const clone=vi.spyOn(globalThis,'structuredClone').mockImplementation((value:any)=>{if(first){first=false;f.document.load(before);}return original(value);});try{expect(()=>lease.readCandidate()).toThrow(/retired/);}finally{clone.mockRestore();}expect(()=>lease.stage()).toThrow(/invalidated/);expect(f.document.serialize()).toEqual(before);
});

it('canonical and history accessor replacement reject before getters and permanently retire an observed lease',()=>{
 const f=fixture(),lease=f.prepare();lease.stage();const descriptor=Object.getOwnPropertyDescriptor(f.document,'document')!;let reads=0;Object.defineProperty(f.document,'document',{configurable:true,get(){reads++;return descriptor.value;}});expect(()=>lease.rollback()).toThrow(/descriptor/);Object.defineProperty(f.document,'document',descriptor);expect(()=>lease.rollback()).toThrow(/invalidated/);expect(reads).toBe(0);expect(f.document.all()).toHaveLength(4);
 const g=fixture(),history=Object.getOwnPropertyDescriptor(g.document,'past')!;Object.defineProperty(g.document,'past',{configurable:true,get(){reads++;return history.value;}});expect(()=>g.prepare()).toThrow(/descriptor/);Object.defineProperty(g.document,'past',history);expect(reads).toBe(0);
});

it('accepted and restored receipts reject copied receivers and retire on a later equal mutation',()=>{
 for(const action of ['accept','rollback'] as const){const f=fixture(),lease=f.prepare();lease.stage();const receipt=lease[action]();receipt.assertCurrent();expect(()=>({...receipt}).assertCurrent()).toThrow(/Foreign/);receipt.assertCurrent();const snapshot=f.document.serialize();f.document.load(snapshot);expect(()=>receipt.assertCurrent()).toThrow(/retired/);expect(()=>receipt.assertCurrent()).toThrow(/retired/);expect(()=>lease.rollback()).toThrow(/consumed/);expect(f.document.serialize()).toEqual(snapshot);}
});
