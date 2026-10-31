import {describe,expect,it} from 'vitest';
import {WATCH_BYTES,removeWatchRows,activeWatchList,addWatchList,createWatchBook,insertWatchSection,rebindWatchRow,recolorWatchFlags,referenceFromDataset,renameWatchFlag,resetWatchColumnWidth,restoreWatchBook,restoreWatchOrder,selectWatchList,setWatchColumnVisible,setWatchFlag,setWatchManualOrder,setWatchSort,favoriteWatchList,type WatchBook,type WatchReference} from '../../src/watchlists/model';
import {WatchCapacityError,WatchReferenceError,WatchStaleError,addWatchMembers,watchFlagIndex,isWatchMember,setWatchFlags,watchFlagOf,watchListChoices,watchListMembers,watchListRevision,watchMembership,watchReferenceForDataset} from '../../src/watchlists/membership';
import {applyWatchConfirmation,assertWatchRowTarget,captureWatchListConfirmation,captureWatchRowTarget,moveWatchRowsToList} from '../../src/watchlists/interactions';
import {pruneWatchSelection,selectWatchClick,selectWatchKey} from '../../src/watchlists/selection';
import {enabledMenuIds,stepWatchMenu,uniqueWatchListName,validateWatchListName,watchColumnMenu,watchListMenu,watchRowMenu,watchSourceBadge} from '../../src/watchlists/menus';
import {orderedWatchRows,watchQuote} from '../../src/watchlists/quotes';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';

// Model/menu evidence only. These are not packaged-GUI passes.
let serial=0;const id=()=>'t'+(++serial);
const real=(symbol:string,exchange:string,datasetId:string,closes=[10,11]):BarDataset=>{const base=fixtureDataset(symbol,closes.length);return{...base,instrument:{...base.instrument,id:exchange+':'+symbol,exchange},bars:base.bars.map((bar,index)=>({...bar,open:closes[index],high:closes[index],low:closes[index],close:closes[index]})),provenance:{...base.provenance,providerId:'local-csv',providerName:'Local CSV',datasetId,fixture:false}};};
const ref=(symbol:string,exchange:string,datasetId:string|null):WatchReference=>({symbol,exchange,datasetId,dailyDatasetId:null,synthetic:false});
const rows=(book:WatchBook)=>activeWatchList(book).rows.map(row=>row.id);

describe('source-aware membership API for screener and panel callers',()=>{
 it('keeps the same ticker from two sources as two members sharing one market flag; another exchange stays separate',()=>{
  const a=real('GME','NYSE','csv-a'),b=real('GME','NYSE','csv-b'),c=real('GME','NASDAQ','csv-c');let book=createWatchBook([]);
  const first=addWatchMembers(book,book.activeId,[watchReferenceForDataset(a),watchReferenceForDataset(b),watchReferenceForDataset(c)],id);book=first.book;
  expect(first.added).toHaveLength(3);expect(watchListMembers(book,book.activeId).map(row=>row.datasetId)).toEqual(['csv-a','csv-b','csv-c']);
  const again=addWatchMembers(book,book.activeId,[watchReferenceForDataset(b)],id);expect(again.added).toEqual([]);expect(again.skipped).toHaveLength(1);expect(again.book).toBe(book);
  expect(isWatchMember(book,book.activeId,ref('GME','NYSE','csv-z'))).toBe(false);expect(isWatchMember(book,book.activeId,ref('GME','NYSE','csv-z'),'market')).toBe(true);
  book=setWatchFlags(book,[watchReferenceForDataset(a)],'blue');expect(watchFlagOf(book,ref('GME','NYSE','csv-b'))).toBe('blue');expect(watchFlagOf(book,ref('GME','NASDAQ','csv-c'))).toBeNull();
  expect(watchMembership(book,'flag:blue')).toEqual({sources:new Set([JSON.stringify(['NYSE','GME','csv-a'])]),markets:new Set(['NYSE:GME'])});
 });
 it('treats empty lists as empty, not unavailable, and keeps red available while other empty colors disappear',()=>{
  let book=createWatchBook([]);expect(watchListMembers(book,book.activeId)).toEqual([]);
  expect(watchListChoices(book).map(choice=>choice.id)).toEqual(['initial-list','flag:red']);
  expect(addWatchMembers(book,book.activeId,[],id).book).toBe(book);
  book=setWatchFlags(book,[ref('A','LOCAL',null)],'green');expect(watchListChoices(book).map(choice=>choice.id)).toContain('flag:green');
  book=setWatchFlags(book,[ref('A','LOCAL',null)],null);expect(watchListChoices(book).map(choice=>choice.id)).not.toContain('flag:green');
 });
 it('rejects capacity overflow atomically with a capacity error and no partial rows',()=>{
  const full=Array.from({length:4999},(_,i)=>({id:'r'+i,kind:'symbol' as const,reference:ref('T'+i,'LOCAL',null)})),book=restoreWatchBook({...createWatchBook([]),lists:[{id:'big',name:'Big',favorite:false,rows:full,sort:null}],activeId:'big'}),before=JSON.stringify(book);
  expect(()=>addWatchMembers(book,'big',[ref('X','LOCAL',null),ref('Y','LOCAL',null)],id)).toThrow(WatchCapacityError);expect(JSON.stringify(book)).toBe(before);
  expect(addWatchMembers(book,'big',[ref('X','LOCAL',null)],id).book.lists[0].rows).toHaveLength(5000);
  const flags=Array.from({length:5000},(_,i)=>({reference:ref('F'+i,'LOCAL',null),color:'red' as const})),flagged=restoreWatchBook({...createWatchBook([]),flags});
  expect(()=>setWatchFlags(flagged,[ref('NEW','LOCAL',null)],'red')).toThrow(WatchCapacityError);expect(()=>addWatchMembers(flagged,'flag:red',[ref('NEW','LOCAL',null)],id)).toThrow(WatchCapacityError);
  expect(setWatchFlags(flagged,[ref('F1','LOCAL',null)],'blue').flags).toHaveLength(5000);
 });
 it('refuses writes against a changed or deleted list (stale action)',()=>{
  let book=createWatchBook(['GME']);const revision=watchListRevision(book,book.activeId);book=insertWatchSection(book,book.activeId,'s','S',null);
  expect(()=>addWatchMembers(book,book.activeId,[ref('X','LOCAL',null)],id,{expectedRevision:revision})).toThrow(WatchStaleError);
  expect(()=>addWatchMembers(book,'gone',[ref('X','LOCAL',null)],id)).toThrow(WatchStaleError);expect(()=>watchListMembers(book,'flag:black')).toThrow(WatchStaleError);
  expect(addWatchMembers(book,book.activeId,[ref('X','LOCAL',null)],id,{expectedRevision:watchListRevision(book,book.activeId)}).added).toHaveLength(1);
 });
 it('flags through a flagged-list ID by market identity without duplicating markets',()=>{
  let book=createWatchBook([]);book=addWatchMembers(book,'flag:purple',[ref('A','LOCAL','one'),ref('A','LOCAL','two'),ref('B','LOCAL',null)],id).book;
  expect(book.flags.map(row=>row.color)).toEqual(['purple','purple']);expect(book.lastFlag).toBe('purple');
 });
});

describe('list confirmation, row targets and moves',()=>{
 it('confirms deletion of a non-active chosen list, and cancel is a no-op',()=>{
  let book=addWatchList(createWatchBook(['GME']),'other','Other');book=selectWatchList(book,'initial-list');const before=JSON.stringify(book),pending=captureWatchListConfirmation(book,'other','delete');
  expect(JSON.stringify(book)).toBe(before);// Cancel: the pending record is discarded and nothing is applied.
  const deleted=applyWatchConfirmation(book,pending,'fallback');expect(deleted.lists.map(list=>list.id)).toEqual(['initial-list']);expect(deleted.activeId).toBe('initial-list');
  const changed=addWatchMembers(book,'other',[ref('X','LOCAL',null)],id).book;expect(()=>applyWatchConfirmation(changed,pending,'fallback')).toThrow('changed');
  expect(()=>applyWatchConfirmation(deleted,pending,'fallback')).toThrow('changed');
  expect(()=>captureWatchListConfirmation(book,'flag:red','delete')).toThrow('Clear');
  const flagged=setWatchFlag(book,ref('X','LOCAL',null),'red'),clear=captureWatchListConfirmation(flagged,'flag:red','clear');expect(applyWatchConfirmation(flagged,clear,'unused').flags).toEqual([]);
 });
 it('row targets reject a changed target row but tolerate unrelated additions',()=>{
  const book=createWatchBook(['GME','SPY']),target=captureWatchRowTarget(book,['initial-row-0']);
  expect(assertWatchRowTarget(addWatchMembers(book,book.activeId,[ref('X','LOCAL',null)],id).book,target)).toHaveLength(1);
  const rebound=rebindWatchRow(book,book.activeId,'initial-row-0',{...fixtureDataset('GME',3),provenance:{...fixtureDataset('GME',3).provenance,datasetId:'other-synthetic'}});
  expect(()=>assertWatchRowTarget(rebound,target)).toThrow(WatchStaleError);expect(()=>assertWatchRowTarget(addWatchList(book,'x','X'),target)).toThrow(WatchStaleError);
  expect(()=>captureWatchRowTarget(book,['missing'])).toThrow();
 });
 it('moves symbols to another list atomically, skipping existing sources and removing them from the origin',()=>{
  let book=addWatchList(createWatchBook([]),'dest','Dest');book=addWatchMembers(book,'dest',[ref('A','LOCAL','x')],id).book;book=selectWatchList(book,'initial-list');
  book=addWatchMembers(book,'initial-list',[ref('A','LOCAL','x'),ref('B','LOCAL','y'),ref('C','LOCAL','z')],id).book;const ids=rows(book);
  const moved=moveWatchRowsToList(book,'initial-list','dest',ids.slice(0,2),id);expect(moved.added.map(row=>row.symbol)).toEqual(['B']);expect(moved.skipped.map(row=>row.symbol)).toEqual(['A']);
  expect(watchListMembers(moved.book,'initial-list').map(row=>row.symbol)).toEqual(['C']);expect(watchListMembers(moved.book,'dest').map(row=>row.symbol)).toEqual(['A','B']);
  expect(()=>moveWatchRowsToList(book,'flag:red','dest',ids,id)).toThrow();expect(()=>moveWatchRowsToList(book,'initial-list','initial-list',ids,id)).toThrow();
 });
});

describe('selection policy',()=>{
 const ids=['a','b','c','d','e'];
 it('click, Ctrl toggle and Shift range use a fixed anchor with focus first',()=>{
  let s=selectWatchClick({selected:[],anchor:null},ids,'b',{});expect(s).toEqual({selected:['b'],anchor:'b'});
  s=selectWatchClick(s,ids,'d',{shift:true});expect(s).toEqual({selected:['d','b','c'],anchor:'b'});
  s=selectWatchClick(s,ids,'a',{shift:true});expect(s).toEqual({selected:['a','b'],anchor:'b'});
  s=selectWatchClick(s,ids,'e',{ctrl:true});expect(s).toEqual({selected:['e','a','b'],anchor:'e'});
  s=selectWatchClick(s,ids,'c',{ctrl:true,shift:true});expect(s.selected[0]).toBe('c');expect([...s.selected].sort()).toEqual(['a','b','c','d','e']);
  expect(selectWatchClick(s,ids,'a',{ctrl:true}).selected).not.toContain('a');
 });
 it('keyboard moves focus, Shift extends from the anchor, Home/End and Ctrl+A work, other keys are not handled',()=>{
  let s=selectWatchKey({selected:[],anchor:null},ids,'ArrowDown',{})!;expect(s.selected).toEqual(['a']);
  s=selectWatchKey(s,ids,'ArrowDown',{shift:true})!;s=selectWatchKey(s,ids,'ArrowDown',{shift:true})!;expect(s).toEqual({selected:['c','a','b'],anchor:'a'});
  s=selectWatchKey(s,ids,'ArrowUp',{shift:true})!;expect(s.selected).toEqual(['b','a']);
  expect(selectWatchKey(s,ids,'End',{})!.selected).toEqual(['e']);expect(selectWatchKey(s,ids,'Home',{shift:true})!.selected).toEqual(['a']);
  expect(selectWatchKey(s,ids,'a',{ctrl:true})!.selected).toHaveLength(5);expect(selectWatchKey(s,ids,'Enter',{})).toBeNull();expect(selectWatchKey(s,[],'ArrowDown',{})).toBeNull();
  expect(selectWatchKey({selected:['e'],anchor:'e'},ids,'ArrowDown',{})!.selected).toEqual(['e']);
 });
 it('prunes deleted rows and keeps the same object when nothing changed',()=>{
  const s={selected:['a','x'],anchor:'x'};expect(pruneWatchSelection(s,new Set(['a']))).toEqual({selected:['a'],anchor:null});const same={selected:['a'],anchor:'a'};expect(pruneWatchSelection(same,new Set(['a']))).toBe(same);
 });
});

describe('sorting, order restoration, display and persistence',()=>{
 it('explicit sorts keep unavailable values last in both directions and restore returns the manual order',()=>{
  const high=real('H','LOCAL','h',[1,30]),low=real('L','LOCAL','l',[1,5]);let book=createWatchBook([]);
  book=addWatchMembers(book,book.activeId,[watchReferenceForDataset(high),ref('U','LOCAL',null),watchReferenceForDataset(low)],id).book;
  const quotes=(b:WatchBook)=>new Map(activeWatchList(b).rows.flatMap(row=>row.kind==='symbol'?[[row.id,watchQuote(row.reference,[high,low])] as const]:[]));
  const symbols=(b:WatchBook)=>orderedWatchRows(activeWatchList(b),quotes(b)).map(row=>row.kind==='symbol'?row.reference.symbol:'');
  expect(symbols(setWatchSort(book,book.activeId,{column:'last',direction:'asc'}))).toEqual(['L','H','U']);
  const desc=setWatchSort(book,book.activeId,{column:'last',direction:'desc'});expect(symbols(desc)).toEqual(['H','L','U']);
  expect(symbols(restoreWatchOrder(desc,book.activeId))).toEqual(['H','U','L']);
  const saved=setWatchManualOrder(desc,book.activeId,orderedWatchRows(activeWatchList(desc),quotes(desc)).map(row=>row.id));expect(activeWatchList(saved).sort).toBeNull();expect(symbols(saved)).toEqual(['H','L','U']);
  expect(()=>setWatchManualOrder(desc,book.activeId,rows(desc).slice(1))).toThrow('no longer matches');
  expect(()=>setWatchSort(book,book.activeId,{column:'bogus' as any,direction:'asc'})).toThrow();
 });
 it('column visibility and width reset are bounded and Symbol stays required',()=>{
  let book=createWatchBook();book=setWatchColumnVisible(book,'volume',true);expect(book.display.columns).toEqual(['symbol','last','changePercent','volume']);
  expect(setWatchColumnVisible(book,'volume',true)).toBe(book);expect(()=>setWatchColumnVisible(book,'symbol',false)).toThrow('required');
  book=setWatchColumnVisible(book,'last',false);expect(book.display.columns).toEqual(['symbol','changePercent','volume']);
  const wide=restoreWatchBook({...book,display:{...book.display,widths:{...book.display.widths,last:300}}});expect(resetWatchColumnWidth(wide,'last').display.widths.last).toBe(85);expect(resetWatchColumnWidth(book,'last')).toBe(book);
 });
 it('round-trips favorites, sections, flags, flag names, flag sorts and widths through JSON restore',()=>{
  let book=addWatchList(createWatchBook(['GME','SPY']),'two','Two');book=favoriteWatchList(book,'two');book=selectWatchList(book,'initial-list');
  book=insertWatchSection(book,'initial-list','sec','Section',null);book=setWatchFlags(book,[ref('A','LOCAL',null)],'cyan');book=renameWatchFlag(book,'cyan','Earnings week');book=setWatchSort(book,'flag:cyan',{column:'symbol',direction:'desc'});
  const restored=restoreWatchBook(JSON.parse(JSON.stringify(book)));expect(restored).toEqual(book);expect(activeWatchList(selectWatchList(restored,'flag:cyan')).name).toBe('Earnings week');
  expect(Object.hasOwn(restoreWatchBook(JSON.parse(JSON.stringify(createWatchBook()))),'flagNames')).toBe(false);
  for(const flagNames of [{black:'x'},{red:''},{red:'a\u0001'},[]])expect(()=>restoreWatchBook({...book,flagNames})).toThrow();
  expect(renameWatchFlag(book,'cyan',' ').flagNames).toEqual({});
 });
 it('recolors a flagged list by merging into the target color and following the open list',()=>{
  let book=setWatchFlags(createWatchBook([]),[ref('A','LOCAL',null),ref('B','LOCAL',null)],'orange');book=setWatchFlags(book,[ref('C','LOCAL',null)],'blue');book=selectWatchList(book,'flag:orange');
  const next=recolorWatchFlags(book,'orange','blue');expect(next.flags.every(row=>row.color==='blue')).toBe(true);expect(next.flags).toHaveLength(3);expect(next.activeId).toBe('flag:blue');
  expect(()=>recolorWatchFlags(next,'orange','red')).toThrow('empty');expect(recolorWatchFlags(next,'blue','blue')).toBe(next);
 });
});

describe('quotes and menu availability',()=>{
 it('never shows fixture prices for an unresolved real-market ticker and turns non-finite volume into unavailable',()=>{
  const fixture=fixtureDataset('GME',10),unresolved=ref('GME','NYSE',null);expect(watchQuote(unresolved,[fixture])).toMatchObject({last:null,change:null,volume:null,dataset:null});
  const missing=ref('GME','NYSE','not-loaded');expect(watchQuote(missing,[fixture]).last).toBeNull();
  expect(watchSourceBadge(unresolved,null,false)?.text).toBe('UNRESOLVED');expect(watchSourceBadge(missing,null,false)?.text).toBe('SOURCE MISSING');
  const daily=real('GME','NYSE','d',[10,12]);daily.bars[1].volume=Number.NaN;const quote=watchQuote(watchReferenceForDataset(daily),[daily]);expect(quote.last).toBe(12);expect(quote.change).toBe(2);expect(quote.changePercent).toBe(20);expect(quote.volume).toBeNull();
  let book=addWatchMembers(createWatchBook([]),'initial-list',[unresolved],id).book;const menu=watchRowMenu({book,selected:rows(book),datasets:[fixture],notes:false});
  const open=menu.flatMap(group=>group.items).find(item=>item.id==='open')!;expect(open.disabled).toMatch(/No data source for/);
 });
 it('menus expose disabled reasons instead of inert items and roving focus wraps over enabled items',()=>{
  let book=setWatchFlags(createWatchBook(['GME']),[ref('A','LOCAL',null)],'red');book=selectWatchList(book,'flag:red');
  const list=watchListMenu(book).flatMap(group=>group.items);expect(list.find(item=>item.id==='delete')!.disabled).toMatch(/Clear/);expect(list.find(item=>item.id==='recolor:blue')!.disabled).toBeNull();expect(list.find(item=>item.id==='hotlists')!.disabled).toBeTruthy();
  const column=watchColumnMenu(book,'symbol').flatMap(group=>group.items);expect(column.find(item=>item.id==='hide')!.disabled).toMatch(/required/);expect(column.find(item=>item.id==='restore')!.disabled).toBeTruthy();
  const custom=addWatchList(createWatchBook(['GME']),'copy','Copy');const target=addWatchMembers(custom,'copy',watchListMembers(custom,'initial-list'),id).book,rowMenu=watchRowMenu({book:selectWatchList(target,'initial-list'),selected:['initial-row-0'],datasets:[],notes:true}).flatMap(group=>group.items);
  expect(rowMenu.find(item=>item.id==='copy:copy')!.disabled).toMatch(/already/);expect(rowMenu.find(item=>item.id==='move:copy')!.disabled).toBeNull();
  const ids=enabledMenuIds([{label:null,items:[{id:'a',label:'A'},{id:'b',label:'B',disabled:'no'},{id:'c',label:'C'}]}]);expect(ids).toEqual(['a','c']);
  expect(stepWatchMenu(ids,null,'ArrowDown')).toBe('a');expect(stepWatchMenu(ids,'c','ArrowDown')).toBe('a');expect(stepWatchMenu(ids,'a','ArrowUp')).toBe('c');expect(stepWatchMenu(ids,'a','End')).toBe('c');expect(stepWatchMenu([],null,'Home')).toBeNull();
 });
 it('validates list names: trimmed, nonblank, bounded and unique among custom lists ignoring case',()=>{
  const book=addWatchList(createWatchBook(),'two','Tech');expect(validateWatchListName(book,'  Energy ')).toBe('Energy');
  for(const bad of ['','   ','x'.repeat(201),'a\nb','tech'])expect(()=>validateWatchListName(book,bad)).toThrow();expect(validateWatchListName(book,'TECH','two')).toBe('TECH');
 });
});

describe('review regressions',()=>{
 it('flags a 5,000-market batch with one validation pass (bounded time) and keeps the same result as single flags',()=>{
  const refs=Array.from({length:5000},(_,i)=>ref('B'+i,'LOCAL',null)),start=performance.now(),book=setWatchFlags(createWatchBook([]),refs,'pink'),elapsed=performance.now()-start;
  expect(book.flags).toHaveLength(5000);expect(elapsed).toBeLessThan(3000);
  let single=createWatchBook([]);for(const reference of refs.slice(0,3))single=setWatchFlag(single,reference,'pink');expect(setWatchFlags(createWatchBook([]),refs.slice(0,3),'pink')).toEqual(single);
 });
 it('showing a column appends it after the current order instead of resetting the order',()=>{
  const book=restoreWatchBook({...createWatchBook(),display:{...createWatchBook().display,columns:['symbol','changePercent','last']}});
  expect(setWatchColumnVisible(book,'volume',true).display.columns).toEqual(['symbol','changePercent','last','volume']);
 });
 it('a move at the 2 MiB book limit is net zero and allowed, while the same rows cannot be added as a copy',()=>{
  // 20,000 full rows exceed 2 MiB, so the byte bound is the binding book-wide limit. Rows carry long synthetic dataset IDs.
  const size=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length,row=(i:number)=>({id:'r'+String(i).padStart(4,'0'),kind:'symbol' as const,reference:ref('S'+String(i).padStart(4,'0'),'LOCAL','d'.repeat(4000)+String(i).padStart(4,'0'))});
  const skeleton=(rows:any[])=>({...createWatchBook([]),lists:[{id:'a',name:'A',favorite:false,rows,sort:null},{id:'e',name:'E',favorite:false,rows:[row(9999)],sort:null}],activeId:'e'});
  const per=size(skeleton([row(0),row(1)]))-size(skeleton([row(0)])),count=Math.floor((WATCH_BYTES-size(skeleton([])))/per),book=restoreWatchBook(skeleton(Array.from({length:count},(_,i)=>row(i))));
  expect(size(book)+per).toBeGreaterThan(WATCH_BYTES);
  expect(()=>addWatchMembers(book,'a',watchListMembers(book,'e'),()=>'r9998')).toThrow(WatchCapacityError);
  const moved=moveWatchRowsToList(book,'e','a',['r9999'],()=>'r9998');expect(watchListMembers(moved.book,'a')).toHaveLength(count+1);expect(watchListMembers(moved.book,'e')).toEqual([]);
 });
});

describe('second review regressions',()=>{
 const flaggedBook=(count:number)=>addWatchMembers(createWatchBook([]),'flag:red',Array.from({length:count},(_,i)=>ref('F'+i,'LOCAL',null)),id).book;
 it('removes 5,000 rows of a flagged list (global unflag) in one bounded write and keeps the open-list rule',()=>{
  const book=selectWatchList(flaggedBook(5000),'flag:red'),ids=activeWatchList(book).rows.map(row=>row.id),start=performance.now(),next=removeWatchRows(book,'flag:red',ids);
  expect(performance.now()-start).toBeLessThan(1000);expect(next.flags).toEqual([]);expect(next.activeId).toBe('flag:red');expect(removeWatchRows(book,'flag:red',['missing'])).toBe(book);
  let blue=setWatchFlags(createWatchBook([]),[ref('A','LOCAL',null)],'blue');blue=selectWatchList(blue,'flag:blue');expect(removeWatchRows(blue,'flag:blue',activeWatchList(blue).rows.map(row=>row.id)).activeId).toBe('flag:red');
 },30000);
 it('builds the row menu for 5,000 selected rows with 5,000 flags in bounded time with correct flag state',()=>{
  const refs=Array.from({length:5000},(_,i)=>ref('S'+i,'LOCAL',null));let book=addWatchMembers(createWatchBook([]),'initial-list',refs,id).book;book=setWatchFlags(book,refs,'cyan');book=addWatchList(book,'other','Other');book=selectWatchList(book,'initial-list');
  const start=performance.now(),items=watchRowMenu({book,selected:rows(book),datasets:[],notes:false}).flatMap(group=>group.items);expect(performance.now()-start).toBeLessThan(1000);
  expect(items.find(item=>item.id==='flag:cyan')!.checked).toBe(true);expect(items.find(item=>item.id==='copy:other')!.disabled).toBeNull();
 },30000);
 it('treats a dataset literally named "null" as distinct from an unbound row everywhere, including restore',()=>{
  const book=addWatchMembers(createWatchBook([]),'initial-list',[ref('GME','NYSE',null)],id).book,result=addWatchMembers(book,'initial-list',[ref('GME','NYSE','null')],id);
  expect(result.added).toHaveLength(1);expect(restoreWatchBook(JSON.parse(JSON.stringify(result.book)))).toEqual(result.book);expect(addWatchMembers(result.book,'initial-list',[ref('GME','NYSE','null')],id).skipped).toHaveLength(1);
 });
 it('invalid references and colors throw WatchReferenceError and change nothing',()=>{
  const book=createWatchBook([]),bad=real('BRK','NYSE','csv');bad.instrument.symbol='BRK B';
  expect(()=>watchReferenceForDataset(bad)).toThrow(WatchReferenceError);expect(()=>addWatchMembers(book,'initial-list',[ref('ok','NYSE',null)],id)).toThrow(WatchReferenceError);
  expect(()=>setWatchFlags(book,[ref('A B','LOCAL',null)],'red')).toThrow(WatchReferenceError);expect(()=>setWatchFlags(book,[],'black' as any)).toThrow(WatchReferenceError);
 });
 it('indexes flags once per flags array and stays correct after a change',()=>{
  const book=setWatchFlags(createWatchBook([]),[ref('A','LOCAL',null)],'green');expect(watchFlagIndex(book)).toBe(watchFlagIndex(book));expect(watchFlagOf(book,{exchange:'LOCAL',symbol:'A'})).toBe('green');
  const next=setWatchFlags(book,[ref('A','LOCAL',null)],'pink');expect(watchFlagOf(next,{exchange:'LOCAL',symbol:'A'})).toBe('pink');expect(watchFlagOf(book,{exchange:'LOCAL',symbol:'A'})).toBe('green');expect(watchFlagOf(next,{exchange:'LOCAL',symbol:'B'})).toBeNull();
 });
 it('import names are made unique and a list may keep its own name on rename',()=>{
  let book=addWatchList(createWatchBook(),'two','Tech');expect(uniqueWatchListName(book,'tech')).toBe('tech (2)');expect(uniqueWatchListName(book,'  ')).toBe('Imported list');
  book=restoreWatchBook({...book,lists:[...book.lists,{id:'dup',name:'Tech',favorite:false,rows:[],sort:null}]});expect(validateWatchListName(book,'Tech','dup')).toBe('Tech');expect(()=>validateWatchListName(book,'tech','dup')).toThrow('already');
  expect(uniqueWatchListName(addWatchList(book,'t2','tech (2)'),'Tech')).toBe('Tech (3)');
 });
});

