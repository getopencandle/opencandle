import {expect,it} from 'vitest';
import {addWatchNote,editWatchNote,deleteWatchNote,notesForMarket,restoreWatchNotes,NOTE_TEXT_BYTES,type NoteMarket} from '../../src/watchlists/notes';
import {createWatchBook,restoreWatchBook,mergeWatchBook,removeWatchRows,exportWatchText} from '../../src/watchlists/model';
const market:NoteMarket={exchange:'NYSE',symbol:'GME',synthetic:false};
it('retains literal multiline notes with exact market and synthetic identity across restart',()=>{
 const one=addWatchNote([],'a',market,'Literal <img src=x>\nSecond line 🟩',100),two=addWatchNote(one,'b',{...market,synthetic:true},'Synthetic-only note',101),three=addWatchNote(two,'c',{...market,exchange:'NASDAQ'},'Other listing',102);
 expect(notesForMarket(three,market).map(note=>note.id)).toEqual(['a']);expect(notesForMarket(three,{...market,synthetic:true}).map(note=>note.id)).toEqual(['b']);
 expect(restoreWatchNotes(JSON.parse(JSON.stringify(three)))).toEqual(three);expect(three[0].text).toBe('Literal <img src=x>\nSecond line 🟩');
});
it('edits and deletes by revision even when wall-clock timestamps are equal',()=>{
 const before=addWatchNote([],'a',market,'First',100),after=editWatchNote(before,'a',1,'Second',100);
 expect(after[0]).toMatchObject({id:'a',revision:2,createdAt:100,updatedAt:100,text:'Second'});expect(before[0].text).toBe('First');
 expect(()=>editWatchNote(after,'a',1,'Stale',100)).toThrow(/changed|revision/i);expect(()=>deleteWatchNote(after,'a',1)).toThrow(/changed|revision/i);expect(deleteWatchNote(after,'a',2)).toEqual([]);
 expect(()=>editWatchNote(before,'a',1,'Clock reversal',99)).toThrow(/time/i);expect(()=>editWatchNote([{...before[0],revision:Number.MAX_SAFE_INTEGER}],'a',Number.MAX_SAFE_INTEGER,'Overflow',101)).toThrow(/revision/i);
});
it('rejects malformed, duplicate and over-budget note collections atomically',()=>{
 const source=addWatchNote([],'a',market,'Text',100),unchanged=JSON.stringify(source);
 for(const value of [null,{},[...source,...source],[{...source[0],extra:1}],[{...source[0],market:{...market,datasetId:'x'}}],[{...source[0],revision:0}],[{...source[0],updatedAt:99}],[{...source[0],createdAt:1.5}],[{...source[0],text:'  \n'}]])expect(()=>restoreWatchNotes(value)).toThrow();
 expect(()=>addWatchNote(source,'a',market,'Duplicate',101)).toThrow(/duplicate/i);expect(()=>addWatchNote(source,'b',market,'🟩'.repeat(NOTE_TEXT_BYTES/4+1),101)).toThrow(/64 KiB/i);
 expect(addWatchNote([],'boundary',market,'🟩'.repeat(NOTE_TEXT_BYTES/4),100)[0].text.length).toBe(NOTE_TEXT_BYTES/2);expect(JSON.stringify(source)).toBe(unchanged);
 expect(()=>restoreWatchNotes(Array.from({length:1001},(_,index)=>({...source[0],id:String(index)})))).toThrow(/1000|1,000/);
});
it('rejects accessors, custom arrays, holes and cycles without invoking note getters',()=>{
 const source=addWatchNote([],'a',market,'Text',100);let reads=0;const bad={...source[0]};Object.defineProperty(bad,'text',{enumerable:true,get(){reads++;return 'Hidden';}});
 expect(()=>restoreWatchNotes([bad])).toThrow(/accessor|data/i);expect(reads).toBe(0);
 class Custom extends Array{}const custom=new Custom();custom.push(...source);expect(()=>restoreWatchNotes(custom)).toThrow();expect(()=>restoreWatchNotes(new Array(1))).toThrow();
 const cycle:any={...source[0]};cycle.market=cycle;expect(()=>restoreWatchNotes([cycle])).toThrow();
 const book=createWatchBook();Object.defineProperty(book,'notes',{enumerable:true,get(){reads++;return source;}});expect(()=>restoreWatchBook(book)).toThrow();expect(reads).toBe(0);
});
it('migrates only missing notes, retains unassociated legacy groups and does not delete notes with list rows',()=>{
 const book=createWatchBook();delete book.notes;expect(restoreWatchBook(book).notes).toEqual([]);expect(()=>restoreWatchBook({...book,notes:null})).toThrow();expect(()=>restoreWatchBook({...book,notes:undefined})).toThrow();
 const notes=addWatchNote(addWatchNote([],'market',market,'Market note',100),'legacy',null,'Unassociated',101),withNotes=restoreWatchBook({...book,notes}),removed=removeWatchRows(withNotes,withNotes.activeId,['initial-row-0']);
 expect(removed.notes).toEqual(notes);expect(notesForMarket(notes,null).map(note=>note.id)).toEqual(['legacy']);expect(exportWatchText(withNotes)).toBe('SYNTHETIC:GME,SYNTHETIC:SPY');expect(exportWatchText(withNotes)).not.toContain('note');
});
it('lossless merge gives imported notes fresh IDs and preserves the entire accepted book on a bad import',()=>{
 const target=restoreWatchBook({...createWatchBook(),notes:addWatchNote([],'same',market,'Target',100)}),incoming=restoreWatchBook({...createWatchBook(),notes:addWatchNote([],'same',market,'Imported',101)});let sequence=0;
 const merged=mergeWatchBook(target,incoming,()=> 'new-'+(++sequence));expect(merged.notes?.map(note=>note.text)).toEqual(['Target','Imported']);expect(merged.notes?.[1].id).not.toBe('same');expect(merged.notes?.[0]).toEqual(target.notes?.[0]);
 const before=JSON.stringify(target);expect(()=>mergeWatchBook(target,{...incoming,notes:[{...incoming.notes![0],revision:-1}]},()=> 'bad')).toThrow();expect(JSON.stringify(target)).toBe(before);
 const huge=Array.from({length:40},(_,index)=>({...incoming.notes![0],id:'n'+index,text:'x'.repeat(NOTE_TEXT_BYTES)}));expect(()=>restoreWatchBook({...target,notes:huge})).toThrow(/2 MiB|limits/i);
});
