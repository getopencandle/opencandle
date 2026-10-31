import {describe,expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';
import {DEFAULT_FLAG_NAME,activeWatchList,addWatchList,createWatchBook,favoriteWatchList,moveWatchRow,recolorWatchFlags,referenceFromDataset,removeWatchRows,renameWatchFlag,restoreWatchBook,restoreWatchOrder,selectWatchList,setWatchFlag,setWatchManualOrder,setWatchSort,type WatchBook,type WatchReference} from '../../src/watchlists/model';
import {addWatchMembers,setWatchFlags,watchListChoices,watchListMembers} from '../../src/watchlists/membership';
import {orderedWatchRows,watchQuote} from '../../src/watchlists/quotes';
import {DETAIL_BLOCK_IDS,detailBlockAvailability,prepareDetailSnapshot} from '../../src/watchlists/details';
import {createScreenerConfiguration,runSavedScreener,type ScreenerConfiguration} from '../../src/domain/screener-state';
import {resolveScreenerUniverse} from '../../src/domain/screener-state';

// Refined-leaf evidence. Each test asserts the leaf's own sentence. SYNTHETIC inputs only; covers flag-name uniqueness and detail categories by type.
let serial=0;const id=()=>'r'+(++serial);
const ref=(symbol:string,exchange='NYSE',datasetId:string|null=null,synthetic=false):WatchReference=>({symbol,exchange,datasetId,dailyDatasetId:null,synthetic});
const json=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function source(symbol:string,exchange:string,closes:number[],resolution='1D',assetClass:'stock'|'index'='stock'):BarDataset{
 const base=fixtureDataset(symbol,closes.length);
 return{...base,resolution,instrument:{...base.instrument,id:exchange+':'+symbol,exchange,assetClass},provenance:{...base.provenance,providerId:'wl-test',datasetId:'wl:'+exchange+':'+symbol+':'+resolution,fixture:false,session:'regular'},bars:closes.map((close,index)=>({time:1767225600+index*86400,open:close,high:close+1,low:close-1,close,volume:1000+index}))};
}

describe('flags',()=>{
 it('FLAG.LAST_COLOR: the last used color is remembered across a restart',()=>{
  let book=createWatchBook([]);book=setWatchFlag(book,ref('AAA'),'green');expect(book.lastFlag).toBe('green');
  const restarted=restoreWatchBook(json(book));expect(restarted.lastFlag).toBe('green');
  expect(setWatchFlag(restarted,ref('BBB'),null).lastFlag).toBe('green');
  expect(recolorWatchFlags(restarted,'green','pink').lastFlag).toBe('pink');
 });
 it('FLAG.SINGLE_COLOR: one color per market; recoloring transfers membership and keeps custom-list rows',()=>{
  let book=addWatchList(createWatchBook([]),'L','Mine');book=addWatchMembers(book,'L',[ref('AAA')],id).book;
  book=setWatchFlag(book,ref('AAA'),'red');book=setWatchFlag(book,ref('AAA'),'blue');
  expect(book.flags.filter(row=>row.reference.symbol==='AAA').map(row=>row.color)).toEqual(['blue']);
  expect(watchListMembers(book,'flag:red')).toEqual([]);expect(watchListMembers(book,'flag:blue').map(row=>row.symbol)).toEqual(['AAA']);
  expect(watchListMembers(book,'L').map(row=>row.symbol)).toEqual(['AAA']);
  expect(()=>restoreWatchBook({...book,flags:[...book.flags,{reference:ref('AAA'),color:'red'}]})).toThrow('One flag color');
 });
 it('FLAG.BULK_RECOLOR: a whole list changes color; an occupied target merges and the selection follows',()=>{
  let book=createWatchBook([]);book=setWatchFlags(book,[ref('AAA'),ref('BBB')],'orange');book=setWatchFlags(book,[ref('CCC')],'cyan');book=selectWatchList(book,'flag:orange');
  const moved=recolorWatchFlags(book,'orange','cyan');expect(moved.activeId).toBe('flag:cyan');expect(watchListMembers(moved,'flag:cyan').map(row=>row.symbol).sort()).toEqual(['AAA','BBB','CCC']);expect(watchListChoices(moved).map(row=>row.id)).not.toContain('flag:orange');
  expect(recolorWatchFlags(book,'orange','orange')).toBe(book);expect(()=>recolorWatchFlags(book,'pink','red')).toThrow('empty');
 });
 it('FLAG.NAME: unique among flagged lists at rename commit, empty restores the default, saved duplicates restore unchanged',()=>{
  let book=createWatchBook([]);book=setWatchFlags(book,[ref('AAA')],'blue');
  const named=renameWatchFlag(book,'blue','Tech');expect(activeWatchList({...named,activeId:'flag:blue'}).name).toBe('Tech');
  const twice=setWatchFlags(named,[ref('BBB')],'green');
  expect(()=>renameWatchFlag(twice,'green','  tech  ')).toThrow('Another flagged list already uses this name');
  expect(()=>renameWatchFlag(twice,'green','Red flagged')).toThrow('Another flagged list already uses this name');
  expect(renameWatchFlag(twice,'blue','TECH').flagNames!.blue).toBe('TECH');
  expect(activeWatchList({...renameWatchFlag(named,'blue',''),activeId:'flag:blue'}).name).toBe(DEFAULT_FLAG_NAME('blue'));
  const saved=json({...twice,flagNames:{blue:'Tech',green:'Tech'}});expect(JSON.stringify(restoreWatchBook(saved))).toBe(JSON.stringify(restoreWatchBook(json(restoreWatchBook(saved)))));
  expect(restoreWatchBook(saved).flagNames).toEqual({blue:'Tech',green:'Tech'});
 });
 it('FLAG.REMOVE_FROM_LIST: removing from a flagged list unflags; an empty non-red list disappears, red stays, custom removal never unflags',()=>{
  let book=addWatchList(createWatchBook([]),'L','Mine');book=addWatchMembers(book,'L',[ref('AAA')],id).book;book=setWatchFlags(book,[ref('AAA'),ref('BBB')],'blue');book=selectWatchList(book,'flag:blue');
  const rows=activeWatchList(book).rows.map(row=>row.id),one=removeWatchRows(book,'flag:blue',[rows[0]]);expect(one.flags.map(row=>row.reference.symbol)).toEqual(['BBB']);
  const none=removeWatchRows(one,'flag:blue',activeWatchList(one).rows.map(row=>row.id));expect(none.activeId).toBe('flag:red');expect(watchListChoices(none).map(row=>row.id)).not.toContain('flag:blue');
  let red=setWatchFlags(createWatchBook([]),[ref('AAA')],'red');red=selectWatchList(red,'flag:red');red=removeWatchRows(red,'flag:red',activeWatchList(red).rows.map(row=>row.id));expect(red.activeId).toBe('flag:red');expect(watchListChoices(red).map(row=>row.id)).toContain('flag:red');
  const custom=selectWatchList(book,'L'),removed=removeWatchRows(custom,'L',activeWatchList(custom).rows.map(row=>row.id));expect(removed.flags.map(row=>row.reference.symbol).sort()).toEqual(['AAA','BBB']);
 });
});

describe('favorites and sorting',()=>{
 it('FAVORITE.ADD_REMOVE: starring and unstarring never change rows',()=>{
  let book=addWatchList(createWatchBook(['GME']),'L','Mine');book=addWatchMembers(book,'L',[ref('AAA'),ref('BBB')],id).book;const rows=JSON.stringify(book.lists.find(list=>list.id==='L')!.rows);
  const starred=favoriteWatchList(book,'L');expect(starred.lists.find(list=>list.id==='L')!.favorite).toBe(true);expect(watchListChoices(starred)[0].id).toBe('L');
  const unstarred=favoriteWatchList(starred,'L');expect(unstarred.lists.find(list=>list.id==='L')!.favorite).toBe(false);expect(JSON.stringify(unstarred.lists.find(list=>list.id==='L')!.rows)).toBe(rows);expect(JSON.stringify(starred.lists.find(list=>list.id==='L')!.rows)).toBe(rows);
 });
 it('FAVORITE.OPEN: a starred list opens with the same identity and keeps unavailable bindings',()=>{
  let book=addWatchList(createWatchBook([]),'L','Mine');book=addWatchMembers(book,'L',[ref('AAA','NYSE',null),ref('BBB','NYSE','csv:missing')],id).book;book=favoriteWatchList(book,'L');book=selectWatchList(book,'initial-list');
  const opened=selectWatchList(restoreWatchBook(json(book)),'L');expect(opened.activeId).toBe('L');expect(activeWatchList(opened).rows.map(row=>(row as any).reference.datasetId)).toEqual([null,'csv:missing']);expect(activeWatchList(opened).favorite).toBe(true);
 });
 it('SORT.MUTATION_RESTORE: add, remove and move under a sort save the shown order; restore never resurrects deleted rows or drops new ones',()=>{
  const sources=[source('CCC','NYSE',[10,30]),source('AAA','NYSE',[10,10]),source('BBB','NYSE',[10,20])];
  let book=addWatchList(createWatchBook([]),'L','Mine');book=addWatchMembers(book,'L',sources.map(referenceFromDataset),id).book;
  const quotesOf=(b:WatchBook)=>new Map(activeWatchList({...b,activeId:'L'}).rows.flatMap(row=>row.kind==='symbol'?[[row.id,watchQuote(row.reference,sources)] as const]:[]));
  const symbols=(b:WatchBook)=>activeWatchList({...b,activeId:'L'}).rows.map(row=>(row as any).reference.symbol);
  book=setWatchSort(book,'L',{column:'symbol',direction:'asc'});expect(orderedWatchRows(activeWatchList({...book,activeId:'L'}),quotesOf(book)).map(row=>(row as any).reference.symbol)).toEqual(['AAA','BBB','CCC']);
  // saving the shown order: the displayed permutation becomes the manual order, then the move lands where it is displayed
  const shown=orderedWatchRows(activeWatchList({...book,activeId:'L'}),quotesOf(book)).map(row=>row.id);book=setWatchManualOrder(book,'L',shown);expect(symbols(book)).toEqual(['AAA','BBB','CCC']);
  const ids=activeWatchList({...book,activeId:'L'}).rows.map(row=>row.id);book=moveWatchRow(book,'L',ids[2],ids[0]);expect(symbols(book)).toEqual(['CCC','AAA','BBB']);expect(activeWatchList({...book,activeId:'L'}).sort).toBeNull();
  book=removeWatchRows(book,'L',[ids[1]]);book=addWatchMembers(book,'L',[ref('ZZZ')],id).book;book=setWatchSort(book,'L',{column:'symbol',direction:'desc'});
  const restored=restoreWatchOrder(book,'L');expect(symbols(restored)).toEqual(['CCC','AAA','ZZZ']);expect(activeWatchList({...restored,activeId:'L'}).sort).toBeNull();
  expect(addWatchMembers(setWatchSort(book,'L',{column:'symbol',direction:'asc'}),'L',[ref('YYY')],id).book.lists.find(list=>list.id==='L')!.sort).toBeNull();
 });
});

describe('daily basis, details and screener links',()=>{
 it('QUOTE.DAILY_BASIS: change compares daily bars only; an intraday previous bar is never a substitute',()=>{
  const daily=source('DDD','NYSE',[100,110],'1D'),minute={...source('DDD','NYSE',[111,150,160],'1m'),provenance:{...daily.provenance,datasetId:'wl:minute'}};
  const withCompanion=watchQuote({...referenceFromDataset(minute),dailyDatasetId:daily.provenance.datasetId},[minute,daily]);
  expect(withCompanion.last).toBe(160);expect(withCompanion.change).toBe(10);expect(withCompanion.changePercent).toBeCloseTo(10,12);expect(withCompanion.dailyBasis).toBe(true);
  const alone=watchQuote(referenceFromDataset(minute),[minute]);expect(alone.change).toBeNull();expect(alone.volume).toBeNull();expect(alone.dailyBasis).toBe(false);expect(alone.reason).toContain('Daily change and volume are unavailable without a compatible daily snapshot');
  const other={...daily,provenance:{...daily.provenance,session:'extended' as const}},mismatch=watchQuote({...referenceFromDataset(minute),dailyDatasetId:daily.provenance.datasetId},[minute,other]);expect(mismatch.change).toBeNull();expect(mismatch.reason).toContain('missing, ambiguous or has a different source basis');
 });
 it('DETAILS.SELECT: details prepare from the instrument alone when no chart source is bound',()=>{
  const reference=ref('NOSRC','NYSE',null),quote=watchQuote(reference,[]),prepared=prepareDetailSnapshot(reference,quote);
  expect(prepared.snapshot.symbol).toBe('NOSRC');expect(prepared.snapshot.exchange).toBe('NYSE');/* Plain wording */expect(prepared.snapshot.blocks.source[0].value).toContain('No data source for this symbol');expect(prepared.snapshot.blocks.summary[0].value).toBeNull();
  const bound=source('SRC','NYSE',[1,2]),second=prepareDetailSnapshot(referenceFromDataset(bound),watchQuote(referenceFromDataset(bound),[bound]));expect(second.snapshot.blocks.identity.find(row=>row.label==='Ticker')!.value).toBe('SRC');expect(second.identity).not.toBe(prepared.identity);
 });
 it('DETAILS.EXPAND: categories not applicable to the instrument type are marked, never hidden, and saved blocks are untouched',()=>{
  const stock=detailBlockAvailability('stock'),index=detailBlockAvailability('index'),unknown=detailBlockAvailability(null);
  expect(DETAIL_BLOCK_IDS.every(block=>stock[block]===null&&unknown[block]===null)).toBe(true);
  expect(index.daily).toBe('Not available for this instrument type');expect(index.summary).toBeNull();expect(Object.keys(index)).toEqual([...DETAIL_BLOCK_IDS]);
  expect(detailBlockAvailability('crypto').daily).toBeNull();
 });
 it('SCREENER.ADD_SELECTED: canonical identities keep unresolved bindings and never infer a fixture from a ticker',()=>{
  const book=addWatchList(createWatchBook([]),'L','Mine'),result=addWatchMembers(book,'L',[ref('GME','NYSE',null)],id);
  const row=activeWatchList({...result.book,activeId:'L'}).rows[0] as any;expect(row.reference).toEqual({symbol:'GME',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false});
  expect(()=>addWatchMembers(book,'L',[{symbol:'GME',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:true}],id)).toThrow();
 });
 it('SCREENER.FLAG_PROPAGATION: a screener flag change updates the global flagged list without duplicate markets',()=>{
  const bound=ref('GME','NYSE','wl:a'),second=ref('GME','NYSE','wl:b');let book=setWatchFlags(createWatchBook([]),[bound],'red');book=setWatchFlags(book,[second],'blue');
  expect(book.flags).toHaveLength(1);expect(book.flags[0].color).toBe('blue');expect(watchListMembers(book,'flag:red')).toEqual([]);expect(setWatchFlags(book,[bound,second],null).flags).toEqual([]);
 });
 it('SCREENER.FILTER_MEMBERSHIP: an empty list is empty not unavailable; creating and deleting lists updates the chooser',()=>{
  const dataset=source('GME','NYSE',[10,11]);let book=addWatchList(createWatchBook([]),'L','Mine');
  const config=(listId:string):ScreenerConfiguration=>{const base=createScreenerConfiguration();return{...base,universe:{...base.universe,watchlist:{listId,name:'x',match:'market'}}};};
  const empty=resolveScreenerUniverse([dataset],config('L').universe,book);expect(empty.watchlist).toMatchObject({state:'empty',members:0});expect(empty.coverage.outsideWatchlist).toBe(1);
  const gone=resolveScreenerUniverse([dataset],config('missing').universe,book);expect(gone.watchlist!.state).toBe('missing-list');expect(gone.coverage.outsideWatchlist).toBeNull();
  const unconnected=resolveScreenerUniverse([dataset],config('L').universe,null);expect(unconnected.watchlist!.state).toBe('not-connected');
  expect(watchListChoices(book).map(row=>row.id)).toContain('L');book=addWatchMembers(book,'L',[referenceFromDataset(dataset)],id).book;
  expect(runSavedScreener([dataset],config('L'),book).universe.watchlist).toMatchObject({state:'ready',members:1,loaded:1});
  const removed=restoreWatchBook({...book,lists:book.lists.filter(list=>list.id!=='L'),activeId:'initial-list'});expect(watchListChoices(removed).map(row=>row.id)).not.toContain('L');
 });
});
