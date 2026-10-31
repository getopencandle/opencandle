import {it,expect} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {linkedDatasetAtInterval} from '../../src/ui/source-basis';
import {resolveGridLinkedDataset} from '../../src/ui/MultiChartGrid';
import {createWatchBook,insertWatchSection,editWatchSection,activeWatchList} from '../../src/watchlists/model';
import {captureWatchConfirmation,applyWatchConfirmation,moveWatchSelection} from '../../src/watchlists/interactions';
it('rejects a matching ticker with another declared venue or synthetic basis',()=>{
 const source=fixtureDataset('GME',2),other={...source,resolution:'1m',provenance:{...source.provenance,datasetId:'review-minute'}};
 for(const candidate of [{...other,instrument:{...other.instrument,exchange:'NYSE'}},{...other,provenance:{...other.provenance,fixture:false}}])expect(()=>linkedDatasetAtInterval([candidate],source,'1m')).toThrow('No supplied');
 expect(source.resolution).toBe('1D');
});
it('the grid dropdown linked resolver retains exact provider/basis and refuses cross-symbol guesses',()=>{
 const selected=fixtureDataset('GME',2),compatible={...selected,resolution:'5m',provenance:{...selected.provenance,datasetId:'five'}};expect(resolveGridLinkedDataset([compatible],'GME','5m',selected)).toBe(compatible);
 for(const candidate of [{...compatible,provenance:{...compatible.provenance,providerId:'other'}},{...compatible,instrument:{...compatible.instrument,currency:'EUR'}},{...compatible,provenance:{...compatible.provenance,coverage:'other venue'}}])expect(()=>resolveGridLinkedDataset([candidate],'GME','5m',selected)).toThrow('No supplied');
 expect(()=>resolveGridLinkedDataset([compatible],'SPY','5m',selected)).toThrow('Pick a data source');expect(()=>resolveGridLinkedDataset([compatible,{...compatible,provenance:{...compatible.provenance,datasetId:'duplicate'}}],'GME','5m',selected)).toThrow('Multiple supplied');
});
it('a changed reviewed section rejects destruction atomically',()=>{
 const book=insertWatchSection(createWatchBook(['GME','SPY']),'initial-list','section','Review','initial-row-0'),pending=captureWatchConfirmation(book,'section-all','section'),changed=editWatchSection(book,book.activeId,'section',{collapsed:true}),before=JSON.stringify(changed);
 expect(()=>applyWatchConfirmation(changed,pending,'replacement')).toThrow('changed');expect(JSON.stringify(changed)).toBe(before);expect(activeWatchList(changed).rows).toHaveLength(3);
});
it('empty adjacent sections move without absorbing a neighboring symbol block',()=>{
 let book=createWatchBook(['GME','SPY']);book=insertWatchSection(book,book.activeId,'A','A','initial-row-0');book=insertWatchSection(book,book.activeId,'B','B','A');
 const moved=moveWatchSelection(book,book.activeId,'B',1);expect(activeWatchList(moved).rows.map(row=>row.id)).toEqual(['A','initial-row-0','initial-row-1','B']);expect(moveWatchSelection(moved,book.activeId,'B',-1)).toEqual(book);
});
