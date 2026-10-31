import {describe,expect,it,vi} from 'vitest';
import {LosslessDrawingDocument,type OwnedDrawingRemoveBatch} from '../../src/chart/contracts';
import {buildDrawingRemovalCandidate} from '../../src/chart/drawing-removal-candidate';

type Row=Record<string,unknown>;
type Group={id:string;name:string;memberIds:string[];future?:{keep:number};futureOwn?:undefined};
const row=(id:string,extra:Row={}):Row=>({id,type:'trendline',paneId:'price',anchors:[{time:1000,price:10},{time:2000,price:20}],style:{lineColor:'#123456',lineWidth:2},...extra});
function fixture(){
 const rows=[row('A',{futureOwn:undefined,future:{signedZero:-0}}),row('B',{locked:true}),row('C',{visible:false}),{id:'X',type:'SYNTHETIC-future-tool',payload:{keep:[false,null,-0]},futureOwn:undefined}];
 const groups:Group[]=[{id:'G',name:'Levels',memberIds:['A','B'],future:{keep:7}},{id:'H',name:'Empty',memberIds:[],futureOwn:undefined}];
 const manager={schemaVersion:1,groups,templates:[{id:'T',name:'SYNTHETIC style',type:'trendline',properties:{'style.lineColor':'#123456'},futureOwn:undefined}],futureRoot:{keep:-0}};
 const value={version:1,drawings:rows,lvDrawingManager:manager,futureRoot:{kept:true},futureOwn:undefined},document=new LosslessDrawingDocument();document.load(value);
 const prepare=()=>document.prepareOwnedRemoveBatch([document.all()[0]]);
 return{document,value,rows,manager,prepare};
}

describe('ERASER.MODEL.EXACT_CANDIDATE canonical one-hit deletion',()=>{
 it('deletes only literal A and its membership, preserving ordered opaque rows, empty groups and templates',()=>{
  const f=fixture(),before=f.document.serialize(),lease=f.prepare(),candidate=lease.readCandidate();
  expect(lease.count).toBe(1);expect(lease.ids).toEqual(['A']);expect(Object.isFrozen(lease)).toBe(true);expect(Object.isFrozen(lease.ids)).toBe(true);
  expect(f.document.serialize()).toEqual(before);
  expect(candidate).toEqual({...f.value,drawings:[f.rows[1],f.rows[2],f.rows[3]],lvDrawingManager:{...f.manager,groups:[{...f.manager.groups[0],memberIds:['B']},f.manager.groups[1]]}});
  const opaque=(candidate.drawings as Row[])[2];expect(Object.hasOwn(candidate,'futureOwn')).toBe(true);expect(Object.hasOwn(opaque,'futureOwn')).toBe(true);
  expect(Object.is((opaque.payload as {keep:unknown[]}).keep[2],-0)).toBe(true);expect(Object.is((candidate.lvDrawingManager as typeof f.manager).futureRoot.keep,-0)).toBe(true);
  lease.stage();const accepted=lease.accept();accepted.assertCurrent();expect(f.document.serialize()).toEqual(candidate);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
  expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toEqual(candidate);expect(f.document.redo()).toBe(false);
 });
 it('preserves absent manager metadata and own undefined metadata as different canonical values',()=>{
  for(const present of [false,true]){
   const document=new LosslessDrawingDocument(),value:Row={version:1,drawings:[row('A'),row('B')],...(present?{lvDrawingManager:undefined}:{})};document.load(value);
   const lease=document.prepareOwnedRemoveBatch([document.all()[0]]);expect(Object.hasOwn(lease.readCandidate(),'lvDrawingManager')).toBe(present);
   lease.stage();lease.accept();expect(Object.hasOwn(document.serialize(),'lvDrawingManager')).toBe(present);expect(document.all().map(value=>value.id)).toEqual(['B']);
  }
 });
 it('keeps an empty group when its only member is removed and does not add the target to another group',()=>{
  const f=fixture();f.value.lvDrawingManager.groups[0].memberIds=['A'];f.document.load(f.value);const lease=f.prepare();lease.stage();lease.accept();
  expect((f.document.serialize().lvDrawingManager as typeof f.manager).groups).toEqual([{...f.manager.groups[0],memberIds:[]},f.manager.groups[1]]);
 });
 it('does not alias caller rows or detached previews into the private candidate',()=>{
  const f=fixture(),expected=f.document.all().slice(0,1),lease=f.document.prepareOwnedRemoveBatch(expected),candidate=lease.readCandidate(),literal=structuredClone(candidate);
  (expected[0].style as Row).lineWidth=99;(candidate.drawings as Row[]).length=0;(candidate.lvDrawingManager as typeof f.manager).groups[0].memberIds.push('X');
  lease.stage();lease.accept();expect(f.document.serialize()).toEqual(literal);
 });
 it('the pure candidate does not mutate its input or return shared nested values',()=>{
  const f=fixture(),before=structuredClone(f.value),result=buildDrawingRemovalCandidate(f.value,[f.rows[0]]);expect(result.ids).toEqual(['A']);
  (result.candidate.drawings as Row[])[0].locked=false;(result.candidate.lvDrawingManager as typeof f.manager).groups[0].memberIds.length=0;
  expect(f.value).toEqual(before);
 });
 it('rollback restores both existing history branches without adding another step',()=>{
  const f=fixture(),a=f.document.serialize(),old=f.document.all(),changed=old.map(value=>value.id==='C'?{...value,visible:true}:value);f.document.stageEditedRecords(old,changed);const b=f.document.serialize();
  f.document.stageEditedRecords(changed,changed.map(value=>value.id==='C'?{...value,visible:false}:value));const c=f.document.serialize();expect(f.document.undo()).toBe(true);
  const lease=f.prepare();lease.stage();const restored=lease.rollback();restored.assertCurrent();expect(f.document.serialize()).toEqual(b);
  expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toEqual(c);expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(b);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(a);expect(f.document.undo()).toBe(false);
 });
 it('a committed hit clears the old redo branch and the next distinct hit adds one further step',()=>{
  const document=new LosslessDrawingDocument(),rows=[row('A'),row('D')];document.load({version:1,drawings:rows});document.stageEditedRecord(rows[1],{...rows[1],visible:false});expect(document.undo()).toBe(true);
  const first=document.prepareOwnedRemoveBatch([document.all()[0]]);first.stage();first.accept();expect(document.redo()).toBe(false);
  const second=document.prepareOwnedRemoveBatch([document.all()[0]]);second.stage();second.accept();expect(document.all()).toEqual([]);
  expect(document.undo()).toBe(true);expect(document.all()).toEqual([rows[1]]);expect(document.undo()).toBe(true);expect(document.all()).toEqual(rows);expect(document.undo()).toBe(false);
 });
});

describe('ERASER.MODEL.INVALID_GROUP complete supported-manager admission',()=>{
 for(const [name,amend] of [
  ['unknown schema',(m:Row)=>{m.schemaVersion=2;}],
  ['missing groups',(m:Row)=>{delete m.groups;}],
  ['missing templates',(m:Row)=>{delete m.templates;}],
  ['null group',(m:Row)=>{(m.groups as unknown[])[0]=null;}],
  ['numeric group ID',(m:Row)=>{(m.groups as Row[])[0].id=7;}],
  ['duplicate group ID',(m:Row)=>{(m.groups as Row[])[1].id='G';}],
  ['invalid group name',(m:Row)=>{(m.groups as Row[])[0].name=7;}],
  ['duplicate member',(m:Row)=>{(m.groups as Row[])[0].memberIds=['A','A'];}],
  ['overlapping member',(m:Row)=>{(m.groups as Row[])[1].memberIds=['A'];}],
  ['orphan member',(m:Row)=>{(m.groups as Row[])[0].memberIds=['A','missing'];}],
  ['nonstring member',(m:Row)=>{(m.groups as Row[])[0].memberIds=['A',7];}],
  ['null template',(m:Row)=>{(m.templates as unknown[])[0]=null;}],
  ['duplicate template',(m:Row)=>{(m.templates as unknown[]).push(structuredClone((m.templates as Row[])[0]));}],
  ['numeric template ID',(m:Row)=>{(m.templates as Row[])[0].id=7;}],
  ['invalid template name',(m:Row)=>{(m.templates as Row[])[0].name=null;}],
  ['invalid template type',(m:Row)=>{(m.templates as Row[])[0].type=7;}],
  ['invalid template properties',(m:Row)=>{(m.templates as Row[])[0].properties=[];}],
 ] as Array<[string,(manager:Row)=>void]>)it('rejects '+name+' without deletion or history',()=>{
  const f=fixture();amend(f.value.lvDrawingManager);f.document.load(f.value);const before=f.document.serialize();
  expect(()=>f.prepare()).toThrow(/manager|group|template|membership/i);expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
 });
 it.each([null,[],false].map(value=>({value})))('rejects a non-manager container $value unchanged',({value})=>{
  const document=new LosslessDrawingDocument(),saved={version:1,drawings:[row('A')],lvDrawingManager:value};document.load(saved);
  expect(()=>document.prepareOwnedRemoveBatch(document.all())).toThrow(/manager/i);expect(document.serialize()).toEqual(saved);
 });
});

describe('ERASER.MODEL.EXACT_CANDIDATE identity and strict data boundaries',()=>{
 it('refuses empty/multi-target requests, stale data, repeat deletion and altered opaque values',()=>{
  const f=fixture(),before=f.document.serialize(),source=f.document.all()[0];
  for(const expected of [[],f.document.all().slice(0,2),[{...source,id:'missing'}],[{...source,locked:true}],[{...source,type:'ray'}]])expect(()=>f.document.prepareOwnedRemoveBatch(expected)).toThrow();
  const omitted={...source};delete omitted.futureOwn;expect(()=>f.document.prepareOwnedRemoveBatch([omitted])).toThrow();
  expect(()=>f.document.prepareOwnedRemoveBatch([{...source,future:{signedZero:0}}])).toThrow();expect(f.document.serialize()).toEqual(before);
  const lease=f.prepare();lease.stage();lease.accept();expect(()=>f.document.prepareOwnedRemoveBatch([source])).toThrow();expect(f.document.all().map(value=>value.id)).toEqual(['B','C','X']);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
 });
 it('refuses sparse/decorated/accessor/hidden/symbol arrays or records without invoking getters or serialization',()=>{
  const f=fixture(),source=f.document.all()[0];let reads=0;const sparse:Row[]=[];sparse.length=1;const extra=[source];Object.assign(extra,{extra:true});
  const getter=[source];Object.defineProperty(getter,'0',{enumerable:true,get(){reads++;return source;}});
  const hidden=[{...source}];Object.defineProperty(hidden[0],'secretField',{value:true,enumerable:false});
  const symbol=[{...source}];Object.defineProperty(symbol[0],Symbol('SYNTHETIC'),{value:true});
  const serializer=[{...source,toJSON(){reads++;return source;}}];
  for(const invalid of [sparse,extra,getter,hidden,symbol,serializer])expect(()=>f.document.prepareOwnedRemoveBatch(invalid)).toThrow();
  expect(reads).toBe(0);expect(f.document.serialize()).toEqual(f.value);expect(f.document.undo()).toBe(false);
 });
 it('validates manager accessors before invoking any getter',()=>{
  const f=fixture();let reads=0;Object.defineProperty(f.value.lvDrawingManager,'groups',{enumerable:true,get(){reads++;return [];}});
  expect(()=>buildDrawingRemovalCandidate(f.value,[f.rows[0]])).toThrow(/accessors/i);expect(reads).toBe(0);
 });
 it('rejects duplicate or malformed retained canonical identities, even if the target itself matches',()=>{
  const f=fixture();for(const extra of [{...f.rows[1],id:'A'},{...f.rows[1],type:7},{...f.rows[1],id:''}])expect(()=>buildDrawingRemovalCandidate({...f.value,drawings:[...f.rows,extra]},[f.rows[0]])).toThrow(/identit/i);
 });
 it('accepts deletion at the admitted 10000-record boundary and rejects overflow',()=>{
  const rows=Array.from({length:10000},(_,index)=>({id:'SYNTHETIC '+index,type:'trendline',future:index})),document=new LosslessDrawingDocument();document.load({version:1,drawings:rows});
  const lease=document.prepareOwnedRemoveBatch([rows[0]]);lease.stage();lease.accept();expect(document.all()).toHaveLength(9999);expect(document.all()[0].id).toBe('SYNTHETIC 1');
  expect(()=>buildDrawingRemovalCandidate({version:1,drawings:[...rows,{id:'extra',type:'trendline'}]},[rows[0]])).toThrow(/10000/);
 });
 it('enforces bounded plain-data depth before clone or mutation',()=>{
  const f=fixture();let nested:Row={};for(let index=0;index<42;index++)nested={child:nested};const invalid={...f.value,futureDepth:nested},clone=vi.spyOn(globalThis,'structuredClone').mockImplementation(()=>{throw Error('Unexpected clone');});
  try{expect(()=>buildDrawingRemovalCandidate(invalid,[f.rows[0]])).toThrow(/resource|limit/i);}finally{clone.mockRestore();}
  expect(f.document.serialize()).toEqual(f.value);
 });
});

describe('ERASER.MODEL.REMOVAL_OWNER private canonical lifetime',()=>{
 it('copied receivers cannot preview or consume the genuine lease or receipt',()=>{
  const f=fixture(),lease=f.prepare();for(const method of ['readCandidate','stage','assertCurrent','accept','rollback'] as const)expect(()=>({...lease})[method]()).toThrow(/Foreign/);
  lease.stage();lease.assertCurrent();const accepted=lease.accept();expect(()=>({...accepted}).assertCurrent()).toThrow(/Foreign/);accepted.assertCurrent();
  for(const method of ['readCandidate','stage','assertCurrent','accept','rollback'] as const)expect(()=>lease[method]()).toThrow(/consumed/);
 });
 it('competing prepared leases cannot consume another staged deletion',()=>{
  const f=fixture(),one=f.prepare(),two=f.prepare();one.stage();expect(()=>two.stage()).toThrow(/retired/);one.assertCurrent();one.accept();expect(f.document.all().map(value=>value.id)).toEqual(['B','C','X']);
 });
 it.each(['load','undo','redo','failed-load','failed-edit','metadata-noop','binding-noop','merge-noop','atomic-noop','atomic-throw'] as const)('%s retires prepared removal even when data matches',kind=>{
  const f=fixture(),lease=f.prepare(),before=f.document.serialize();
  if(kind==='load')f.document.load(before);if(kind==='undo')expect(f.document.undo()).toBe(false);if(kind==='redo')expect(f.document.redo()).toBe(false);
  if(kind==='failed-load')expect(()=>f.document.load(null)).toThrow();if(kind==='failed-edit')expect(()=>f.document.stageEditedRecords([],[])).toThrow();
  if(kind==='metadata-noop')expect(f.document.stageManagerMetadata(before,before)).toBe(false);if(kind==='binding-noop')f.document.enrichPaneBindings(before,before);
  if(kind==='merge-noop')f.document.mergeRenderable([],new Set());if(kind==='atomic-noop')f.document.atomic(()=>{});if(kind==='atomic-throw')expect(()=>f.document.atomic(()=>{throw Error('SYNTHETIC rejected');})).toThrow();
  expect(()=>lease.stage()).toThrow(/retired/);expect(()=>lease.stage()).toThrow(/invalidated/);expect(f.document.serialize()).toEqual(before);
 });
 it('newer equal-value replacement after stage forbids rollback permanently',()=>{
  const f=fixture(),lease=f.prepare();lease.stage();const staged=f.document.serialize();f.document.load(staged);expect(()=>lease.rollback()).toThrow(/retired/);f.document.load(staged);expect(()=>lease.rollback()).toThrow(/invalidated/);expect(f.document.serialize()).toEqual(staged);
 });
 it('a discarded outer atomic operation cannot revive staged removal authority',()=>{
  const f=fixture(),before=f.document.serialize();let lease:OwnedDrawingRemoveBatch|undefined;
  expect(()=>f.document.atomic(()=>{lease=f.prepare();lease.stage();throw Error('SYNTHETIC discarded');})).toThrow('discarded');expect(()=>lease!.rollback()).toThrow(/retired/);expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
 });
 it('stage/rollback use no public clone, serializer or public-shaped epoch callback',()=>{
  const f=fixture(),lease=f.prepare(),clone=vi.spyOn(globalThis,'structuredClone').mockImplementation(()=>{throw Error('Unexpected transition clone');}),serialize=vi.spyOn(f.document,'serialize').mockImplementation(()=>{throw Error('Unexpected transition serialization');}),epoch=vi.fn();Object.defineProperty(f.document,'enterMutation',{value:epoch});
  try{lease.stage();const restored=lease.rollback();restored.assertCurrent();expect(epoch).not.toHaveBeenCalled();}finally{clone.mockRestore();serialize.mockRestore();}
  expect(f.document.serialize()).toEqual(f.value);expect(f.document.undo()).toBe(false);
 });
 it('reentrant preparation or preview copying cannot return an owned candidate for a replaced document',()=>{
  for(const preview of [false,true]){const f=fixture(),lease=preview?f.prepare():null,before=f.document.serialize(),original=globalThis.structuredClone;let first=true;
   const clone=vi.spyOn(globalThis,'structuredClone').mockImplementation((value:any)=>{if(first){first=false;f.document.load(before);}return original(value);});
   try{expect(()=>preview?lease!.readCandidate():f.document.prepareOwnedRemoveBatch([f.rows[0]])).toThrow(/retired|changed/);}finally{clone.mockRestore();}
   expect(f.document.serialize()).toEqual(before);
  }
 });
 it('rejects substituted document/history descriptors before getters and does not revive after restoration',()=>{
  const f=fixture(),lease=f.prepare();lease.stage();const descriptor=Object.getOwnPropertyDescriptor(f.document,'document')!;let reads=0;Object.defineProperty(f.document,'document',{configurable:true,get(){reads++;return descriptor.value;}});
  expect(()=>lease.rollback()).toThrow(/descriptor/);Object.defineProperty(f.document,'document',descriptor);expect(()=>lease.rollback()).toThrow(/invalidated/);expect(reads).toBe(0);
  const g=fixture(),past=Object.getOwnPropertyDescriptor(g.document,'past')!;Object.defineProperty(g.document,'past',{configurable:true,get(){reads++;return past.value;}});expect(()=>g.prepare()).toThrow(/descriptor/);Object.defineProperty(g.document,'past',past);expect(reads).toBe(0);
 });
 it('accepted and rolled-back receipts retire after a later equal supported mutation',()=>{
  for(const result of ['accept','rollback'] as const){const f=fixture(),lease=f.prepare();lease.stage();const receipt=lease[result]();receipt.assertCurrent();const current=f.document.serialize();f.document.load(current);expect(()=>receipt.assertCurrent()).toThrow(/retired/);expect(()=>receipt.assertCurrent()).toThrow(/retired/);expect(f.document.serialize()).toEqual(current);}
 });
});
