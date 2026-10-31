import {it,expect} from 'vitest';
import {createWatchBook,insertWatchSection,activeWatchList,renameWatchList,rebindWatchRow,referenceFromDataset,addWatchList,mergeWatchBook,setWatchFlag,selectWatchList,cycleWatchSort,restoreWatchBook,editWatchSection} from '../../src/watchlists/model';
import {applyWatchConfirmation,captureWatchConfirmation,moveWatchSelection} from '../../src/watchlists/interactions';
import {fixtureDataset} from '../../src/domain/fixtures';
import {watchQuote} from '../../src/watchlists/quotes';
function groups(){let book=createWatchBook(['GME','SPY','AAPL','MSFT','QQQ','DIA']);book=insertWatchSection(book,book.activeId,'A','A','initial-row-0');book=insertWatchSection(book,book.activeId,'B','B','initial-row-2');return insertWatchSection(book,book.activeId,'C','C','initial-row-4');}
const rowIds=(book:ReturnType<typeof createWatchBook>)=>activeWatchList(book).rows.map(row=>row.id);
it('moves whole adjacent sections in both directions without changing member ownership',()=>{
 const book=groups(),before=JSON.stringify(book),down=moveWatchSelection(book,book.activeId,'A',1);
 expect(rowIds(down)).toEqual(['B','initial-row-2','initial-row-3','A','initial-row-0','initial-row-1','C','initial-row-4','initial-row-5']);
 expect(moveWatchSelection(down,book.activeId,'A',-1)).toEqual(book);
 expect(moveWatchSelection(book,book.activeId,'A',-1)).toBe(book);
 expect(moveWatchSelection(book,book.activeId,'C',1)).toBe(book);expect(JSON.stringify(book)).toBe(before);
});
it('pins confirmation to reviewed contents and rejects stale or switched-list confirmations',()=>{
 const book=groups(),pending=captureWatchConfirmation(book,'section-all','A');
 expect(rowIds(applyWatchConfirmation(book,pending,'unused'))).toEqual(['B','initial-row-2','initial-row-3','C','initial-row-4','initial-row-5']);
 expect(()=>applyWatchConfirmation(renameWatchList(book,book.activeId,'Changed'),pending,'unused')).toThrow('changed');
 expect(()=>applyWatchConfirmation(addWatchList(book,'other','Other'),pending,'unused')).toThrow('changed');
 expect(rowIds(book)).toHaveLength(9);
});
it('rejects incompatible daily binding before replacing a valid selection',()=>{
 const book=createWatchBook(['GME']),primary=fixtureDataset('GME',500),daily={...primary,provenance:{...primary.provenance,datasetId:'daily'}};
 const valid=rebindWatchRow(book,book.activeId,'initial-row-0',daily,true,[primary,daily]);
 expect(()=>rebindWatchRow(valid,book.activeId,'initial-row-0',{...daily,resolution:'1m'},true,[primary])).toThrow('original daily');
 expect(()=>rebindWatchRow(valid,book.activeId,'initial-row-0',{...daily,provenance:{...daily.provenance,providerId:'different'}},true,[primary])).toThrow('original daily');
 expect(activeWatchList(valid).rows[0]).toMatchObject({reference:{dailyDatasetId:'daily'}});
});
it('retains supported long source identities and does not turn session coverage into an extended quote',()=>{
 const source=fixtureDataset('GME',3);source.provenance.datasetId='derived:'+ 'x'.repeat(1000);source.provenance.session='extended';
 const book=createWatchBook(['GME']),rebound=rebindWatchRow(book,book.activeId,'initial-row-0',source);
 expect(restoreWatchBook(rebound)).toEqual(rebound);expect(watchQuote(referenceFromDataset(source),[source]).extended).toBeNull();
});
it('merges JSON with fresh identities while preserving local display and global flag colors',()=>{
 let book=createWatchBook(['GME']);book=setWatchFlag(book,referenceFromDataset(fixtureDataset('GME')),'blue');
 let incoming=createWatchBook(['SPY']);incoming=setWatchFlag(incoming,referenceFromDataset(fixtureDataset('GME')),'red');incoming.display.label='description';
 let counter=0;const merged=mergeWatchBook(book,incoming,()=>`import-${++counter}`);
 expect(merged.display.label).toBe('ticker');expect(merged.flags[0].color).toBe('blue');expect(merged.lists.map(list=>list.id)).toEqual(['initial-list','import-1']);expect(activeWatchList(merged).rows[0].id).toBe('import-2');expect(book.lists).toHaveLength(1);
});
it('retains flag sort through recovery and refuses section identity injection',()=>{
 let book=setWatchFlag(createWatchBook(),referenceFromDataset(fixtureDataset('GME')),'blue');book=selectWatchList(book,'flag:blue');book=cycleWatchSort(book,book.activeId,'last');
 expect(activeWatchList(restoreWatchBook(book)).sort).toEqual({column:'last',direction:'asc'});
 const section=groups(),edited=editWatchSection(section,section.activeId,'A',{id:'injected',kind:'symbol',name:'Name'} as any);
 expect(activeWatchList(edited).rows[0]).toEqual({id:'A',kind:'section',name:'Name',collapsed:false});
});
