import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
// Independent second review of watchlists (second reviewer). Model, menu and handler evidence only; no DOM, GUI or packaged executable.
// Re-review: the three former it.fails DEFECT tests (high, medium, low) are now plain assertions of the fixed behavior.
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {activeWatchList,addWatchList,createWatchBook,importWatchText,mergeWatchBook,removeWatchRows,renameWatchFlag,renameWatchList,resolveWatchSource,restoreWatchBook,selectWatchList,setWatchFlag,setWatchSort,type WatchBook,type WatchReference} from '../../src/watchlists/model';
import {WatchCapacityError,WatchReferenceError,WatchStaleError,addWatchMembers,setWatchFlags,watchFlagIndex,watchFlagOf,watchListMembers,watchListRevision,watchReferenceForDataset} from '../../src/watchlists/membership';
import {uniqueWatchListName,validateWatchListName} from '../../src/watchlists/menus';
import {applyWatchConfirmation,assertWatchRowTarget,captureWatchConfirmation,captureWatchListConfirmation,captureWatchRowTarget,moveWatchRowsToList} from '../../src/watchlists/interactions';
import {selectWatchClick,selectWatchKey} from '../../src/watchlists/selection';
import {watchRowMenu} from '../../src/watchlists/menus';
import {watchQuote} from '../../src/watchlists/quotes';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';

let serial=0;const uid=()=>'rv'+(++serial);
const ref=(symbol:string,exchange:string,datasetId:string|null):WatchReference=>({symbol,exchange,datasetId,dailyDatasetId:null,synthetic:false});
const real=(symbol:string,exchange:string,datasetId:string,closes:number[],volumes?:number[]):BarDataset=>{const base=fixtureDataset(symbol,closes.length);return{...base,instrument:{...base.instrument,id:exchange+':'+symbol,exchange},bars:base.bars.map((bar,i)=>({...bar,open:closes[i],high:closes[i],low:closes[i],close:closes[i],volume:volumes?.[i]??bar.volume})),provenance:{...base.provenance,providerId:'local-csv',providerName:'Local CSV',datasetId,fixture:false}};};
const deepFreeze=<T,>(value:T):T=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value as object))deepFreeze(child);}return value;};
const customBook=(rows:number,flags=0,id='big'):WatchBook=>restoreWatchBook({...createWatchBook([]),lists:[{id,name:'Big',favorite:false,sort:null,rows:Array.from({length:rows},(_,i)=>({id:'r'+i,kind:'symbol',reference:ref('F'+i,'LOCAL',null)}))}],activeId:id,flags:Array.from({length:flags},(_,i)=>({reference:ref('F'+i,'LOCAL',null),color:'red' as const}))});
const flaggedBook=(n:number):WatchBook=>restoreWatchBook({...createWatchBook([]),activeId:'flag:red',flags:Array.from({length:n},(_,i)=>({reference:ref('F'+i,'LOCAL',null),color:'red' as const}))});

describe('source-aware identity: same ticker from two sources is never merged',()=>{
 it('copy and move keep both sources of NYSE:GME as separate rows while sharing one market flag',()=>{
  let book=addWatchList(createWatchBook([]),'b','Other');book=selectWatchList(book,'initial-list');
  book=addWatchMembers(book,'initial-list',[ref('GME','NYSE','csv-a'),ref('GME','NYSE','csv-b')],uid).book;
  book=addWatchMembers(book,'b',[ref('GME','NYSE','csv-a')],uid).book;
  const bRow=activeWatchList(book).rows.find(row=>row.kind==='symbol'&&row.reference.datasetId==='csv-b')!;
  const moved=moveWatchRowsToList(book,'initial-list','b',[bRow.id],uid);
  expect(moved.added.map(row=>row.datasetId)).toEqual(['csv-b']);expect(moved.skipped).toEqual([]);
  expect(watchListMembers(moved.book,'b').map(row=>row.datasetId)).toEqual(['csv-a','csv-b']);
  expect(watchListMembers(moved.book,'initial-list').map(row=>row.datasetId)).toEqual(['csv-a']);
  const copied=addWatchMembers(moved.book,'b',[ref('GME','NYSE','csv-a'),ref('GME','NASDAQ','csv-a')],uid);
  expect(copied.skipped.map(row=>row.exchange)).toEqual(['NYSE']);expect(copied.added.map(row=>row.exchange)).toEqual(['NASDAQ']);
  const flagged=setWatchFlags(copied.book,[ref('GME','NYSE','csv-b')],'blue');
  expect(flagged.flags.map(row=>[row.reference.exchange,row.color])).toEqual([['NYSE','blue']]);
 });
 it('an unbound row and a bound row of the same ticker are distinct members',()=>{
  const book=addWatchMembers(createWatchBook([]),'initial-list',[ref('GME','NYSE',null),ref('GME','NYSE','csv-a'),ref('GME','NYSE',null)],uid);
  expect(book.added.map(row=>row.datasetId)).toEqual([null,'csv-a']);expect(book.skipped).toHaveLength(1);
 });
 it('FIXED (was low): a dataset literally named "null" is distinct from the unbound row, and the book round-trips',()=>{
  const book=addWatchMembers(createWatchBook([]),'initial-list',[ref('GME','NYSE',null)],uid).book;
  const result=addWatchMembers(book,'initial-list',[ref('GME','NYSE','null')],uid);
  expect(result.added.map(row=>row.datasetId)).toEqual(['null']);expect(result.skipped).toEqual([]);
  expect(watchListMembers(restoreWatchBook(JSON.parse(JSON.stringify(result.book))),'initial-list').map(row=>row.datasetId)).toEqual([null,'null']);
  expect(addWatchMembers(result.book,'initial-list',[ref('GME','NYSE','null')],uid).skipped).toHaveLength(1);
 });
});

describe('atomic writes never mutate the input book',()=>{
 it('per-list overflow, book-wide overflow and stale revision throw typed errors on a deep-frozen book',()=>{
  const full=deepFreeze(customBook(5000));
  expect(()=>addWatchMembers(full,'big',[ref('NEW','LOCAL',null)],uid)).toThrow(WatchCapacityError);
  // Observation: even 20,000 minimal rows (ids 'r0'..) exceed 2 MiB, so the book-wide 20,000-row limit is unreachable; bytes always bind first.
  const lists=Array.from({length:4},(_,l)=>({id:'l'+l,name:'L'+l,favorite:false,sort:null,rows:Array.from({length:5000},(_,i)=>({id:'r'+i,kind:'symbol' as const,reference:ref('S'+i,'X'+l,null)}))}));
  expect(()=>restoreWatchBook({...createWatchBook([]),lists,activeId:'l0'})).toThrow();
  const three=deepFreeze(restoreWatchBook({...createWatchBook([]),lists:[...lists.slice(0,3),{id:'e',name:'E',favorite:false,sort:null,rows:[]}],activeId:'e'}));
  expect(()=>addWatchMembers(three,'e',Array.from({length:5000},(_,i)=>ref('S'+i,'Y',null)),uid)).toThrow(WatchCapacityError);
  const book=three,revision=watchListRevision(book,'e');
  expect(()=>addWatchMembers(book,'e',[ref('ONE','LOCAL',null)],uid,{expectedRevision:revision+'x'})).toThrow(WatchStaleError);
 });
 it('the 2 MiB byte bound is enforced with a capacity error before the row limits are reached',()=>{
  const long='d'.repeat(4000),rows=Array.from({length:500},(_,i)=>({id:'r'+i,kind:'symbol' as const,reference:ref('S'+i,'LOCAL',long+i)}));
  const book=deepFreeze(restoreWatchBook({...createWatchBook([]),lists:[{id:'big',name:'Big',favorite:false,sort:null,rows}],activeId:'big'}));
  const more=Array.from({length:60},(_,i)=>ref('T'+i,'LOCAL',long+i));
  expect(()=>addWatchMembers(book,'big',more,uid)).toThrow(WatchCapacityError);
  expect(()=>setWatchFlags(book,more,'red')).toThrow(WatchCapacityError);
 });
 it('a batch with one invalid reference adds nothing; move into a full or deleted list changes nothing',()=>{
  const book=deepFreeze(addWatchList(customBook(5000),'small','Small'));
  expect(()=>addWatchMembers(book,'small',[ref('OK','LOCAL',null),{...ref('bad lower','LOCAL',null)}],uid)).toThrow();
  const small=deepFreeze(addWatchMembers(book,'small',[ref('M','LOCAL',null)],uid).book),rowId=activeWatchList(small).rows[0].id;
  expect(()=>moveWatchRowsToList(small,'small','big',[rowId],uid)).toThrow(WatchCapacityError);
  expect(()=>moveWatchRowsToList(small,'small','gone',[rowId],uid)).toThrow(WatchStaleError);
 });
 it('flag batches are atomic and keep one color per market',()=>{
  const book=deepFreeze(createWatchBook(['GME','SPY']));
  expect(()=>setWatchFlags(book,[ref('A','LOCAL',null),{} as WatchReference],'green')).toThrow();
  const next=setWatchFlags(book,[ref('A','LOCAL','x'),ref('A','LOCAL','y')],'green');
  expect(next.flags).toHaveLength(1);expect(next.lastFlag).toBe('green');
 });
});

describe('stale action guards',()=>{
 it('a chooser delete of a non-active list is refused after the list changes, and succeeds unchanged without moving the active list',()=>{
  let book=addWatchList(createWatchBook(['GME']),'two','Two');book=selectWatchList(book,'initial-list');
  const pending=captureWatchListConfirmation(book,'two','delete');
  const added=addWatchMembers(book,'two',[ref('X','LOCAL',null)],uid).book;
  expect(()=>applyWatchConfirmation(added,pending,'fallback')).toThrow(/changed/);
  expect(()=>applyWatchConfirmation(renameWatchList(book,'two','Renamed'),pending,'fallback')).toThrow(/changed/);
  expect(()=>applyWatchConfirmation(applyWatchConfirmation(book,pending,'f'),pending,'fallback')).toThrow(/changed/);
  const done=applyWatchConfirmation(book,pending,'fallback');
  expect(done.lists.map(list=>list.id)).toEqual(['initial-list']);expect(done.activeId).toBe('initial-list');
 });
 it('an active-list delete confirmation is refused when the user switched lists meanwhile; a flagged clear is refused after a new flag',()=>{
  const book=addWatchList(createWatchBook(['GME']),'two','Two'),pending=captureWatchConfirmation(book,'delete');
  expect(()=>applyWatchConfirmation(selectWatchList(book,'initial-list'),pending,'f')).toThrow(/changed/);
  const flagged=setWatchFlag(book,ref('A','LOCAL',null),'red'),clear=captureWatchListConfirmation(flagged,'flag:red','clear');
  expect(()=>applyWatchConfirmation(setWatchFlag(flagged,ref('B','LOCAL',null),'red'),clear,'f')).toThrow(/changed/);
  expect(applyWatchConfirmation(flagged,clear,'f').flags).toEqual([]);
  expect(()=>captureWatchListConfirmation(flagged,'flag:red','delete')).toThrow();
 });
 it('a row target is stale after a rebind, removal or list switch, but survives an unrelated change',()=>{
  let book=createWatchBook(['GME','SPY']);const [a,b]=activeWatchList(book).rows.map(row=>row.id),target=captureWatchRowTarget(book,[a]);
  expect(()=>assertWatchRowTarget(removeWatchRows(book,book.activeId,[a]),target)).toThrow(WatchStaleError);
  expect(()=>assertWatchRowTarget(addWatchList(book,'x','X'),target)).toThrow(WatchStaleError);
  expect(assertWatchRowTarget(removeWatchRows(book,book.activeId,[b]),target).map(row=>row.id)).toEqual([a]);
 });
});

describe('selection over the displayed (sorted, filtered) order',()=>{
 it('Shift ranges follow the display order passed in, not manual order, and never include IDs outside it',()=>{
  const display=['c','a','d','b'];// e.g. sorted view; 'h' is hidden in a collapsed section
  const first=selectWatchClick({selected:[],anchor:null},display,'a',{});
  const range=selectWatchClick(first,display,'b',{shift:true});
  expect(range.selected[0]).toBe('b');expect(new Set(range.selected)).toEqual(new Set(['a','d','b']));expect(range.anchor).toBe('a');
  const ctrl=selectWatchClick({selected:['a','h'],anchor:'a'},display,'c',{ctrl:true});
  expect(ctrl.selected).toEqual(['c','a']);
  const up=selectWatchKey(range,display,'ArrowUp',{shift:true})!;expect(new Set(up.selected)).toEqual(new Set(['a','d']));expect(up.selected[0]).toBe('d');
  const home=selectWatchKey(range,display,'Home',{shift:true})!;expect(new Set(home.selected)).toEqual(new Set(['c','a']));
 });
});

describe('quotes: missing is never zero, NaN or fixture',()=>{
 it('non-finite closes and volumes become null; prior close of zero gives no percent',()=>{
  const primary=real('ABC','NYSE','p',[10,Number.NaN]);
  const q=watchQuote(ref('ABC','NYSE','p'),[primary]);expect(q.last).toBeNull();
  const daily=real('ABC','NYSE','d',[0,5],[100,Number.POSITIVE_INFINITY]);
  const r=watchQuote({...ref('ABC','NYSE','d')},[daily]);
  expect(r.last).toBe(5);expect(r.change).toBe(5);expect(r.changePercent).toBeNull();expect(r.volume).toBeNull();
 });
 it('unresolved, missing and forged synthetic references never resolve to the fixture',()=>{
  const fixtures=['GME','SPY'].map(symbol=>fixtureDataset(symbol,500));
  expect(resolveWatchSource(ref('GME','NYSE',null),fixtures)).toBeNull();
  expect(resolveWatchSource(ref('GME','NYSE','csv-missing'),fixtures)).toBeNull();
  expect(resolveWatchSource(ref('GME','NYSE',fixtures[0].provenance.datasetId),fixtures)).toBeNull();
  expect(resolveWatchSource({...ref('GME','NYSE',fixtures[0].provenance.datasetId),synthetic:true},[])).toBeNull();
  const imported=importWatchText(createWatchBook([]),'NYSE:GME,AMEX:SPY','txt','Txt',uid),quote=watchQuote(activeWatchList(imported).rows[0].kind==='symbol'?(activeWatchList(imported).rows[0] as any).reference:null,fixtures);
  expect([quote.last,quote.change,quote.changePercent,quote.volume,quote.dataset]).toEqual([null,null,null,null,null]);
  // C05 path: a screener fixture row added via watchReferenceForDataset must still resolve (as explicit synthetic).
  expect(resolveWatchSource(watchReferenceForDataset(fixtures[0]),[])?.instrument.symbol).toBe('GME');
 });
});

describe('persistence and backward compatibility',()=>{
 // Independent literal for the previous review's two synthetic rows, trailing section and
 // one unresolved market flag. Field order and omitted flagNames follow checkpoint 4519's
 // published schema/serializer, inspected in source. No current builder or baseline code
 // computes this oracle, and the test has no dependency on a private sibling checkout.
 const legacyCanonical={schemaVersion:1,lists:[{id:'initial-list',name:'Watchlist',favorite:false,rows:[
  {id:'initial-row-0',kind:'symbol',reference:{symbol:'GME',exchange:'SYNTHETIC',datasetId:'lv-synthetic-v1:GME',dailyDatasetId:null,synthetic:true}},
  {id:'initial-row-1',kind:'symbol',reference:{symbol:'SPY',exchange:'SYNTHETIC',datasetId:'lv-synthetic-v1:SPY',dailyDatasetId:null,synthetic:true}},
  {id:'s1',kind:'section',name:'Tech',collapsed:false},
 ],sort:{column:'last',direction:'desc'}}],flags:[{reference:{symbol:'GME',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false},color:'blue'}],activeId:'initial-list',lastFlag:'blue',flagSorts:{},notes:[],display:{label:'ticker',monogram:false,separators:false,density:'compact',columns:['symbol','last','changePercent'],widths:{symbol:100,last:85,change:85,changePercent:85,volume:95,extended:95}}};
 it('a legacy saved book retains the explicit checkpoint 4519 serialization with no flagNames key',()=>{
  const expected=JSON.stringify(legacyCanonical),saved=JSON.parse(expected),restored=restoreWatchBook(saved);
  expect(JSON.stringify(restored)).toBe(expected);
  expect(Object.hasOwn(restored,'flagNames')).toBe(false);
  expect(JSON.stringify(restoreWatchBook(JSON.parse(JSON.stringify(restored))))).toBe(expected);
 });
 it('legacy books missing optional notes and flag sorts receive only their known empty defaults',()=>{
  const saved=JSON.parse(JSON.stringify(legacyCanonical));delete saved.notes;delete saved.flagSorts;
  const before=JSON.stringify(saved),restored=restoreWatchBook(saved);
  expect(JSON.stringify(restored)).toBe(JSON.stringify(legacyCanonical));expect(Object.hasOwn(restored,'flagNames')).toBe(false);
  expect(JSON.stringify(saved)).toBe(before);
 });
 it('flagNames round-trip, are validated and a blank rename restores the default label',()=>{
  const named=renameWatchFlag(setWatchFlag(createWatchBook(['GME']),ref('A','LOCAL',null),'blue'),'blue','  Swing  ');
  const again=restoreWatchBook(JSON.parse(JSON.stringify(named)));expect(again.flagNames).toEqual({blue:'Swing'});
  expect(activeWatchList(selectWatchList(again,'flag:blue')).name).toBe('Swing');
  expect(activeWatchList(selectWatchList(renameWatchFlag(again,'blue',' '),'flag:blue')).name).toBe('Blue flagged');
  for(const flagNames of [{black:'x'},{red:''},{red:'a\nb'},{red:'x'.repeat(201)},['red'],{red:5}])expect(()=>restoreWatchBook({...again,flagNames})).toThrow();
  // JSON import keeps the existing names (documented precedence) and the incoming lists.
  const merged=mergeWatchBook(createWatchBook(['SPY']),JSON.parse(JSON.stringify(again)),uid);expect(merged.flagNames).toBeUndefined();expect(merged.lists).toHaveLength(2);
 });
});

// ---------- handler-level checks through the actual component (same controlled-hook technique as the builder's suite) ----------
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:new Map<number,()=>void>()}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const same=(a:any[],b:any[])=>a?.length===b?.length&&a.every((v,i)=>Object.is(v,b[i]));return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useMemo:(factory:()=>any,deps:any[])=>{const i=hooks.cursor++;if(!(i in hooks.cells)||!same(hooks.cells[i].deps,deps))hooks.cells[i]={deps,value:factory()};return hooks.cells[i].value;},
 useEffect:(effect:()=>void|(()=>void),deps:any[])=>{const i=hooks.cursor++;if(!(i in hooks.cells)||!same(hooks.cells[i],deps)){hooks.effects.get(i)?.();hooks.cells[i]=deps;const cleanup=effect();if(cleanup)hooks.effects.set(i,cleanup);}}
};});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const match=find(child,test);if(match)return match;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
const mouse=(extra={})=>({ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,detail:1,clientX:40,clientY:50,preventDefault:vi.fn(),stopPropagation:vi.fn(),...extra});
function panel(book:WatchBook,datasets:BarDataset[]=[]){
 const props:any={book,datasets,onChange:vi.fn((next:WatchBook)=>{props.book=next;return true;}),onOpen:vi.fn(()=>true),onOpenAll:vi.fn(()=>true)};
 const render=()=>{hooks.cursor=0;return WatchlistPanel(props);};
 const tr=(id:string)=>find(render(),node=>node.type==='tr'&&node.key===id);
 const selected=()=>activeWatchList(props.book).rows.filter(row=>tr(row.id)?.props['aria-selected']).map(row=>row.id);
 const order=()=>find(render(),node=>node.type==='tbody').props.children.map((node:any)=>node.key);
 return{props,render,tr,selected,order};
}
describe('panel handlers',()=>{
 beforeEach(()=>{vi.useFakeTimers();hooks.cells=[];hooks.cursor=0;hooks.effects.clear();vi.stubGlobal('document',{querySelector:()=>null});vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});});
 afterEach(()=>{for(const cleanup of hooks.effects.values())cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
 const symbols=['GME','SPY','QQQ','AAPL','MSFT'];
 // Independent expectation: displayed order computed here from the fixture closes, not from orderedWatchRows.
 const expectedDesc=()=>symbols.map((symbol,index)=>({id:'initial-row-'+index,last:fixtureDataset(symbol,500).bars.at(-1)!.close})).sort((a,b)=>b.last-a.last).map(row=>row.id);
 it('Shift-click in a sorted list selects the displayed range',()=>{
  const ui=panel(setWatchSort(createWatchBook(symbols),'initial-list',{column:'last',direction:'desc'})),display=expectedDesc();
  expect(ui.order()).toEqual(display);
  ui.tr(display[0]).props.onClick(mouse());ui.tr(display[2]).props.onClick(mouse({shiftKey:true}));
  expect(new Set(ui.selected())).toEqual(new Set(display.slice(0,3)));
 });
 it('dragging in a sorted list moves the row where the user sees it and saves that order',()=>{
  const ui=panel(setWatchSort(createWatchBook(symbols),'initial-list',{column:'last',direction:'desc'})),display=expectedDesc();
  // Reordering moved to pointer events (watchlist-row-drag.ts). A fake list host lays the rows out 20px apart
  // in displayed order; the pointer presses the fourth displayed row and lifts it above the first one.
  const element=(id:string,index:number)=>({dataset:{wlRowId:id},getBoundingClientRect:()=>({top:index*20,height:20}),classList:{add:vi.fn(),remove:vi.fn()},style:{} as Record<string,string>});
  const rows=ui.order().map(element),host=find(ui.render(),node=>node.props?.className==='wl-table');
  (host.props.ref??host.ref).current={getBoundingClientRect:()=>({top:0,bottom:1000}),scrollTop:0,classList:{add:vi.fn(),remove:vi.fn()},appendChild:vi.fn(),querySelector:()=>null,querySelectorAll:()=>rows};
  const pressed=rows[3],pointer=(clientY:number)=>({pointerId:1,clientY,button:0,currentTarget:pressed,target:{closest:()=>null},preventDefault:vi.fn()});
  // Press, pass the slop (the grab point is fixed there), then carry the row to the top and release.
  ui.tr(display[3]).props.onPointerDown(pointer(70));ui.tr(display[3]).props.onPointerMove(pointer(65));ui.tr(display[3]).props.onPointerMove(pointer(5));ui.tr(display[3]).props.onPointerUp(pointer(5));
  const list=activeWatchList(ui.props.book);
  expect(list.sort).toBeNull();expect(list.rows.map(row=>row.id)).toEqual([display[3],display[0],display[1],display[2],display[4]]);
 });
 it('a row bound to a missing real source shows N/A and SOURCE MISSING, never the fixture close for the same ticker',()=>{
  const fixture=fixtureDataset('GME',500),close=fixture.bars.at(-1)!.close;
  const book=addWatchMembers(createWatchBook([]),'initial-list',[ref('GME','NYSE','csv-missing')],uid).book,ui=panel(book,[fixture]);
  const row=ui.tr(activeWatchList(book).rows[0].id),cells=text(row);
  expect(cells).toContain('SOURCE MISSING');expect(cells).toContain('N/A');expect(cells).not.toContain(close.toLocaleString(undefined,{maximumFractionDigits:2}));
 });
 const key=(ui:ReturnType<typeof panel>,value:string,extra={})=>ui.render().props.onKeyDown({key:value,nativeEvent:{isComposing:false},target:{closest:()=>null},preventDefault:vi.fn(),stopPropagation:vi.fn(),altKey:false,shiftKey:false,ctrlKey:false,metaKey:false,...extra});
 it('re-review: Ctrl+A then Delete on a 5,000-flag Red flagged list publishes once and stays bounded',()=>{
  const ui=panel(flaggedBook(5000));key(ui,'ArrowDown');key(ui,'a',{ctrlKey:true});
  // Fake timers stub the clocks in this block; switch to real timers just for the measurement.
  vi.useRealTimers();const start=performance.now();key(ui,'Delete');const ms=performance.now()-start;
  console.log(`[C04 re-review] panel Ctrl+A + Delete on 5000-flag Red list: ${ms.toFixed(1)} ms (includes one harness render)`);
  expect(ui.props.onChange).toHaveBeenCalledOnce();expect(ui.props.book.flags).toEqual([]);expect(ms).toBeLessThan(2000);
 },60000);
 it('re-review: Add section then Cancel publishes nothing; Add places it above the focused row in a sorted list',()=>{
  const ui=panel(setWatchSort(createWatchBook(symbols),'initial-list',{column:'last',direction:'desc'})),display=expectedDesc(),before=ui.props.book;
  ui.tr(display[1]).props.onClick(mouse());ui.tr(display[1]).props.onContextMenu(mouse());
  find(ui.render(),node=>node.type==='button'&&node.key==='section-above').props.onClick();
  find(ui.render(),node=>node.type==='button'&&text(node.props.children)==='Cancel').props.onClick();
  expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.props.book).toBe(before);
  ui.tr(display[1]).props.onContextMenu(mouse());find(ui.render(),node=>node.type==='button'&&node.key==='section-above').props.onClick();
  find(ui.render(),node=>node.type==='input'&&node.props['aria-label']==='Watchlist name').props.onChange({target:{value:'Leaders'}});
  find(ui.render(),node=>node.type==='button'&&text(node.props.children)==='Add').props.onClick();
  const rows=activeWatchList(ui.props.book).rows;expect(activeWatchList(ui.props.book).sort).toBeNull();
  expect(rows.map(row=>row.kind==='section'?'S:'+row.name:row.id)).toEqual([display[0],'S:Leaders',...display.slice(1)]);
 });
});

describe('performance of large selections (the earlier freeze)',()=>{
 it('one 5,000-market flag batch stays bounded',()=>{
  const book=customBook(5000),refs=watchListMembers(book,'big'),start=performance.now();
  expect(setWatchFlags(book,refs,'red').flags).toHaveLength(5000);expect(performance.now()-start).toBeLessThan(2000);
 });
 it('FIXED (was high): unflagging 200 and then all 5,000 rows of a 5,000-flag flagged list is one bounded write',()=>{
  const book=flaggedBook(5000),rows=activeWatchList(book).rows,ids=rows.map(row=>row.id);
  let start=performance.now();const some=removeWatchRows(book,'flag:red',ids.slice(0,200)),ms200=performance.now()-start;
  expect(some.flags).toHaveLength(4800);expect(some.flags.some(row=>row.reference.symbol==='F0')).toBe(false);expect(some.flags[0].reference.symbol).toBe('F200');expect(some.activeId).toBe('flag:red');
  start=performance.now();const all=removeWatchRows(book,'flag:red',ids),msAll=performance.now()-start;
  expect(all.flags).toEqual([]);expect(all.activeId).toBe('flag:red');expect(all.lastFlag).toBe(book.lastFlag);
  console.log(`[C04 re-review] removeWatchRows flag:red 5000 flags: 200 rows ${ms200.toFixed(1)} ms; all 5000 rows ${msAll.toFixed(1)} ms`);
  expect(ms200).toBeLessThan(500);expect(msAll).toBeLessThan(1000);
  // Removing a non-red flagged list's last rows falls back to red, as setWatchFlag did.
  const blue=selectWatchList(setWatchFlags(createWatchBook([]),[ref('A','LOCAL',null)],'blue'),'flag:blue');
  expect(removeWatchRows(blue,'flag:blue',activeWatchList(blue).rows.map(row=>row.id)).activeId).toBe('flag:red');
 },60000);
 it('FIXED (was medium): the row menu model for 5,000 selected rows with 5,000 flags is linear',()=>{
  const book=addWatchList(customBook(5000,5000),'other','Other'),ids=activeWatchList(selectWatchList(book,'big')).rows.map(row=>row.id),start=performance.now();
  const groups=watchRowMenu({book:selectWatchList(book,'big'),selected:ids,datasets:[],notes:false}),ms=performance.now()-start;
  console.log(`[C04 re-review] watchRowMenu 5000 selected / 5000 flags: ${ms.toFixed(1)} ms`);
  expect(ms).toBeLessThan(400);
  const flagGroup=groups.find(group=>group.label==='Flag')!;expect(flagGroup.items.find(entry=>entry.id==='flag:red')!.checked).toBe(true);
  expect(groups.find(group=>group.label==='Copy to list')!.items[0].disabled).toBeNull();// 5,000 fresh rows fit exactly into the empty list
  const full=addWatchMembers(book,'other',[ref('Z','LOCAL',null)],uid).book;
  expect(watchRowMenu({book:selectWatchList(full,'big'),selected:ids,datasets:[],notes:false}).find(group=>group.label==='Copy to list')!.items[0].disabled).toBe('This list has room for 4999 more rows.');
 },60000);
});

describe('re-review: new C05-facing exports are additive and typed',()=>{
 it('WatchReferenceError is an Error with code "reference" from watchReferenceForDataset, addWatchMembers and setWatchFlags; nothing changes',()=>{
  const bad=real('GME','NYSE','csv',[1,2]);const spaced={...bad,instrument:{...bad.instrument,symbol:'BRK B'}};
  const book=deepFreeze(createWatchBook(['GME']));
  for(const run of [()=>watchReferenceForDataset(spaced),()=>addWatchMembers(book,'initial-list',[ref('OK','LOCAL',null),ref('brk b','LOCAL',null)],uid),()=>setWatchFlags(book,[ref('bad lower','LOCAL',null)],'red'),()=>setWatchFlags(book,[],'black' as any)]){
   let caught:unknown;try{run();}catch(cause){caught=cause;}
   expect(caught).toBeInstanceOf(WatchReferenceError);expect(caught).toBeInstanceOf(Error);expect((caught as WatchReferenceError).code).toBe('reference');
  }
 });
 it('watchFlagIndex/watchFlagOf follow each new book and never serve a stale index',()=>{
  const one=setWatchFlags(createWatchBook([]),[ref('A','LOCAL','x')],'green');
  expect(watchFlagOf(one,{exchange:'LOCAL',symbol:'A'})).toBe('green');expect(watchFlagIndex(one).get('LOCAL:A')).toBe('green');
  const two=setWatchFlags(one,[ref('A','LOCAL','y')],'blue'),three=setWatchFlags(two,[ref('A','LOCAL',null)],null);
  expect([watchFlagOf(one,{exchange:'LOCAL',symbol:'A'}),watchFlagOf(two,{exchange:'LOCAL',symbol:'A'}),watchFlagOf(three,{exchange:'LOCAL',symbol:'A'})]).toEqual(['green','blue',null]);
  expect(watchFlagIndex(two)).toBe(watchFlagIndex(two));expect(watchFlagIndex(two).size).toBe(1);
 });
 it('import names are made unique, and a list may keep its own exact name on rename',()=>{
  const book=addWatchList(createWatchBook([]),'b','Tech');
  expect(uniqueWatchListName(book,'tech')).toBe('tech (2)');expect(uniqueWatchListName(book,'Other')).toBe('Other');expect(uniqueWatchListName(book,'  ')).toBe('Imported list');
  expect(validateWatchListName(book,'Tech','b')).toBe('Tech');expect(()=>validateWatchListName(book,'tech','initial-list')).toThrow(/already/);
 });
});
