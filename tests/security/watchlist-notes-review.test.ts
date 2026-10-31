import {expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {addWatchNote,deleteWatchNote,editWatchNote,notesForMarket,restoreWatchNotes,type NoteMarket} from '../../src/watchlists/notes';
import {createWatchBook,exportWatchText,mergeWatchBook,restoreWatchBook,WATCH_BYTES} from '../../src/watchlists/model';
const require=createRequire(import.meta.url);
const {dataExportInput}=require('../../electron/validation.cjs');
const market:NoteMarket={exchange:'NYSE',symbol:'GME',synthetic:false};
const note=()=>addWatchNote([],'original',market,'Synthetic reviewer note only',100)[0];

it('rejects hidden, symbol and nested accessor fields before any note or book getter is read',()=>{
  let reads=0;const getter={...note(),market:{...market}};
  Object.defineProperty(getter.market,'symbol',{enumerable:true,get(){reads++;return 'GME';}});
  const hidden={...note()};Object.defineProperty(hidden,'unexpected',{value:'hidden'});
  const hiddenRequired={...note()};Object.defineProperty(hiddenRequired,'revision',{value:1,enumerable:false});
  const symbol={...note(),[Symbol('hidden')]:1};
  const nested={...note(),market:{...market,provider:'Unsupported binding'}};
  for(const value of [getter,hidden,hiddenRequired,symbol,nested])expect(()=>restoreWatchNotes([value])).toThrow();
  const book=createWatchBook();Object.defineProperty(book.display,'widths',{enumerable:true,get(){reads++;return {};}});
  expect(()=>restoreWatchBook(book)).toThrow();expect(reads).toBe(0);
});

it('rejects sparse, inherited, custom and serialization-hook data without running hooks',()=>{
  let calls=0;const toJSON={...note(),toJSON(){calls++;return note();}};
  const decorated=[note()] as any;decorated.extra=1;
  const hidden=[note()];Object.defineProperty(hidden,'0',{value:note(),enumerable:false});
  const inherited=Object.create(note());
  class CustomArray extends Array {}
  const custom=new CustomArray();custom.push(note());
  for(const value of [[toJSON],decorated,hidden,[inherited],custom,new Array(1)])expect(()=>restoreWatchNotes(value)).toThrow();
  const cycle:any=note();cycle.market=cycle;expect(()=>restoreWatchNotes([cycle])).toThrow();expect(calls).toBe(0);
});

it('keeps prototype-sensitive IDs and all market identities literal without aliases or rebinding',()=>{
  let notes=addWatchNote([],'__proto__',market,'NYSE real identity',100);
  notes=addWatchNote(notes,'constructor',{...market,exchange:'NASDAQ'},'Other exchange',101);
  notes=addWatchNote(notes,'toString',{...market,synthetic:true},'Synthetic identity',102);
  notes=addWatchNote(notes,'null-market',null,'Unassociated note',103);
  expect(notesForMarket(notes,market).map(row=>row.id)).toEqual(['__proto__']);
  expect(notesForMarket(notes,{...market,exchange:'NASDAQ'}).map(row=>row.id)).toEqual(['constructor']);
  expect(notesForMarket(notes,{...market,synthetic:true}).map(row=>row.id)).toEqual(['toString']);
  expect(notesForMarket(notes,null).map(row=>row.id)).toEqual(['null-market']);
  const input=JSON.stringify({...createWatchBook(),notes});const restored=restoreWatchBook(JSON.parse(input));
  expect(restored.notes).toEqual(notes);expect(Object.getPrototypeOf(restored)).toBe(Object.prototype);
  notes[0].market!.symbol='SPY';expect(restored.notes![0].market!.symbol).toBe('GME');
  expect(exportWatchText(restored)).not.toContain('NYSE real identity');
});

it('only missing legacy notes migrate and unsupported explicit values retain the original book',()=>{
  const base=createWatchBook(),original=JSON.stringify(base);delete base.notes;
  expect(restoreWatchBook(base).notes).toEqual([]);
  for(const notes of [null,undefined,false,{},'legacy text'])expect(()=>restoreWatchBook({...base,notes})).toThrow();
  const withNotes=restoreWatchBook({...base,notes:[note()]});const serial=JSON.stringify(withNotes);
  expect(()=>restoreWatchBook({...withNotes,notes:[{...note(),revision:Infinity}]})).toThrow();
  expect(JSON.stringify(withNotes)).toBe(serial);expect(JSON.parse(original).notes).toEqual([]);
});

it('enforces exact serialized book bytes even when JSON escaping exceeds raw note UTF-8 bytes',()=>{
  const notes=Array.from({length:17},(_,index)=>({...note(),id:'escaped-'+index,text:'\\'.repeat(64*1024)}));
  expect(restoreWatchNotes(notes)).toHaveLength(17);
  const book={...createWatchBook(),notes};expect(Buffer.byteLength(JSON.stringify(book),'utf8')).toBeGreaterThan(WATCH_BYTES);
  expect(()=>restoreWatchBook(book)).toThrow();
  const bounded=restoreWatchBook({...createWatchBook(),notes:notes.slice(0,15)});
  const exported=dataExportInput({format:'json',suggestedName:'SYNTHETIC-watchlist-notes.json',text:JSON.stringify(bounded)});
  expect(exported.bytes.length).toBeLessThanOrEqual(WATCH_BYTES);expect(restoreWatchBook(JSON.parse(exported.bytes.toString('utf8')))).toEqual(bounded);
});

it('preserves immutable revisions at timestamp boundaries and rejects stale or exhausted edits',()=>{
  const first=addWatchNote([],'zero',market,'Time zero',0),updated=editWatchNote(first,'zero',1,'Same clock edit',0);
  expect(updated[0]).toMatchObject({createdAt:0,updatedAt:0,revision:2});expect(first[0].revision).toBe(1);
  const boundary=restoreWatchNotes([{...note(),createdAt:253402300799,updatedAt:253402300799,revision:Number.MAX_SAFE_INTEGER}]);const unchanged=JSON.stringify(boundary);
  expect(()=>editWatchNote(boundary,'original',Number.MAX_SAFE_INTEGER,'Too late',253402300799)).toThrow(/revision/i);
  expect(()=>editWatchNote(updated,'zero',1,'Stale',1)).toThrow();expect(()=>deleteWatchNote(updated,'zero',1)).toThrow();
  for(const value of [-1,0.5,253402300800,NaN,Infinity])expect(()=>restoreWatchNotes([{...note(),createdAt:value,updatedAt:value}])).toThrow();
  expect(JSON.stringify(boundary)).toBe(unchanged);
});

it('rejects colliding imported note IDs and aggregate overflow without mutating the accepted book',()=>{
  const target=restoreWatchBook({...createWatchBook(),notes:[note()]}),incoming=restoreWatchBook({...createWatchBook(),notes:[{...note(),id:'incoming'}]});
  const original=JSON.stringify(target);let index=0;
  expect(()=>mergeWatchBook(target,incoming,()=>++index<=3?'fresh-'+index:'original')).toThrow(/Duplicate note/i);
  expect(JSON.stringify(target)).toBe(original);
  const large=restoreWatchBook({...createWatchBook(),notes:Array.from({length:16},(_,i)=>({...note(),id:'large-'+i,text:'x'.repeat(64*1024)}))});let ids=0;
  expect(()=>mergeWatchBook(large,large,()=> 'merge-'+(++ids))).toThrow(/2 MiB|limits/i);
  expect(large.notes).toHaveLength(16);expect(JSON.stringify(target)).toBe(original);
});
