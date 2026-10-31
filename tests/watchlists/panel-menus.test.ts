import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {Modal} from '../../src/ui/Modal';
import {activeWatchList,addWatchList,createWatchBook,insertWatchSection,removeWatchRows,selectWatchList,setWatchSort,type WatchBook} from '../../src/watchlists/model';
import {addWatchMembers,watchListMembers} from '../../src/watchlists/membership';
import {fixtureDataset} from '../../src/domain/fixtures';
import {WATCH_CLICK_DELAY_MS} from '../../src/watchlists/gestures';
// Actual Panel handlers with controlled hooks. No DOM, focus, paint or packaged executable evidence.
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
const keyEvent=(key:string,extra={})=>({key,nativeEvent:{isComposing:false},target:{closest:()=>null},preventDefault:vi.fn(),stopPropagation:vi.fn(),altKey:false,shiftKey:false,ctrlKey:false,metaKey:false,...extra});
function setup(book:WatchBook=createWatchBook(['GME','SPY','QQQ']),datasets:any[]=[]){
 const props:any={book,datasets,onChange:vi.fn((next:WatchBook)=>{props.book=next;return true;}),onOpen:vi.fn(()=>true),onOpenAll:vi.fn(()=>true),onNotes:vi.fn(()=>true)};
 const render=()=>{hooks.cursor=0;return WatchlistPanel(props);};
 const row=(id:string)=>find(render(),node=>node.type==='tr'&&node.key===id).props;
 const menu=()=>find(render(),node=>node.props?.role==='menu');
 const item=(id:string)=>{const found=find(menu(),node=>node.type==='button'&&node.key===id);if(!found)throw Error('Missing menu item '+id);return found.props;};
 const label=(value:string)=>{const found=find(render(),node=>node.type==='button'&&(node.props['aria-label']===value||text(node.props.children)===value));if(!found)throw Error('Missing button '+value);return found.props;};
 const key=(value:string,extra={})=>render().props.onKeyDown(keyEvent(value,extra));
 const status=()=>text(find(render(),node=>node.props?.role==='status'));
 const selected=()=>activeWatchList(props.book).rows.filter(r=>find(render(),node=>node.type==='tr'&&node.key===r.id)?.props['aria-selected']).map(r=>r.id);
 return{props,render,row,menu,item,label,key,status,selected};
}
beforeEach(()=>{vi.useFakeTimers();hooks.cells=[];hooks.cursor=0;hooks.effects.clear();vi.stubGlobal('document',{querySelector:()=>null});vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});});
afterEach(()=>{for(const cleanup of hooks.effects.values())cleanup();vi.useRealTimers();vi.unstubAllGlobals();});

it('list menu Delete opens a confirmation that Cancel leaves unchanged; Confirm deletes once',()=>{
 const ui=setup(addWatchList(createWatchBook(['GME']),'two','Two')),before=ui.props.book;
 ui.label('Open watchlists').onClick();expect(ui.menu()).not.toBeNull();ui.label('Delete active list').onClick();expect(ui.menu()).toBeNull();
 const modal=()=>find(ui.render(),node=>node.type===Modal&&node.props.title==='Confirm watchlist change');expect(text(modal())).toContain('"Two"');
 ui.label('Cancel').onClick();expect(modal()).toBeNull();expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.props.book).toBe(before);
 ui.label('Open watchlists').onClick();ui.label('Delete active list').onClick();ui.label('Confirm change').onClick();
 expect(ui.props.onChange).toHaveBeenCalledOnce();expect(ui.props.book.lists.map((list:any)=>list.id)).toEqual(['initial-list']);
});
it('row context menu flags the whole selection with one publication and Alt+Enter reuses the last color',()=>{
 const ui=setup();ui.row('initial-row-0').onClick(mouse());ui.row('initial-row-2').onClick(mouse({shiftKey:true}));
 expect(ui.selected()).toEqual(['initial-row-0','initial-row-1','initial-row-2']);
 ui.row('initial-row-1').onContextMenu(mouse());expect(ui.menu().props['aria-label']).toBe('Watchlist row actions');ui.item('flag:blue').onClick();
 expect(ui.props.onChange).toHaveBeenCalledOnce();expect(ui.props.book.flags.map((row:any)=>row.reference.symbol+':'+row.color).sort()).toEqual(['GME:blue','QQQ:blue','SPY:blue']);
 ui.row('initial-row-0').onClick(mouse());ui.row('initial-row-0').onContextMenu(mouse());ui.item('unflag').onClick();expect(ui.props.book.flags.map((row:any)=>row.reference.symbol).sort()).toEqual(['QQQ','SPY']);
 ui.row('initial-row-0').onClick(mouse());ui.key('Enter',{altKey:true});expect(ui.props.book.flags.find((row:any)=>row.reference.symbol==='GME')?.color).toBe('blue');expect(ui.props.book.flags).toHaveLength(3);
 vi.advanceTimersByTime(WATCH_CLICK_DELAY_MS);expect(ui.props.onOpen.mock.calls.map((call:any)=>call[0].instrument.symbol)).toEqual(['GME','GME','GME']);// Each plain click opens at once; the shift-click and menu work open nothing
});
it('an open row menu refuses a stale action after the list changed underneath it',()=>{
 const ui=setup();ui.row('initial-row-0').onContextMenu(mouse());const remove=ui.item('remove');
 ui.props.book=removeWatchRows(ui.props.book,'initial-list',['initial-row-0']);ui.render();remove.onClick();
 expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.status()).toMatch(/changed while this menu was open/);
});
it('Shift+arrows extend, Ctrl+A selects all, Delete removes exactly the selection; Escape closes the menu by keyboard',()=>{
 const ui=setup();ui.key('ArrowDown');ui.key('ArrowDown',{shiftKey:true});expect(ui.selected()).toEqual(['initial-row-0','initial-row-1']);
 ui.key('a',{ctrlKey:true});expect(ui.selected()).toHaveLength(3);ui.key('F10',{shiftKey:true});expect(ui.menu()).not.toBeNull();
 ui.menu().props.onKeyDown(keyEvent('ArrowDown'));ui.menu().props.onKeyDown(keyEvent('Escape'));expect(ui.menu()).toBeNull();
 ui.key('ArrowUp');expect(ui.selected()).toEqual(['initial-row-0']);ui.key('Delete');expect(ui.props.book.lists[0].rows.map((row:any)=>row.id)).toEqual(['initial-row-1','initial-row-2']);
});
it('keyboard menu navigation activates the focused enabled item with Enter',()=>{
 const ui=setup();ui.row('initial-row-0').onContextMenu(mouse());const nav=(k:string)=>ui.menu().props.onKeyDown(keyEvent(k));
 nav('End');nav('Enter');expect(ui.props.book.lists[0].rows.map((row:any)=>row.id)).toEqual(['initial-row-1','initial-row-2']);
});
it('column header menu sorts, restores manual order and toggles columns; Symbol cannot be hidden',()=>{
 const ui=setup(),header=()=>find(ui.render(),node=>node.type==='th'&&node.key==='last').props;
 header().onContextMenu(mouse());expect(ui.menu().props['aria-label']).toBe('Watchlist column actions');ui.item('sort-desc').onClick();
 expect(activeWatchList(ui.props.book).sort).toEqual({column:'last',direction:'desc'});
 header().onContextMenu(mouse());ui.item('restore').onClick();expect(activeWatchList(ui.props.book).sort).toBeNull();
 header().onContextMenu(mouse());ui.item('column:volume').onClick();expect(ui.props.book.display.columns).toContain('volume');
 find(ui.render(),node=>node.type==='th'&&node.key==='symbol').props.onContextMenu(mouse());expect(ui.item('hide').disabled).toBe(true);
});
it('moving a row in a sorted list saves the displayed order first, then moves where the user sees it',()=>{
 // Manual SPY,GME,QQQ displays as GME,QQQ,SPY. Moving QQQ up must give QQQ,GME,SPY (manual-order moving would give SPY,QQQ,GME).
 let book=createWatchBook(['SPY','GME','QQQ']);book=setWatchSort(book,'initial-list',{column:'symbol',direction:'asc'});const ui=setup(book);
 ui.row('initial-row-2').onClick(mouse());ui.key('ArrowUp',{altKey:true});
 expect(activeWatchList(ui.props.book).sort).toBeNull();expect(watchListMembers(ui.props.book,'initial-list').map(row=>row.symbol)).toEqual(['QQQ','GME','SPY']);
});
it('copy and move to another list report skipped duplicates and never duplicate a source',()=>{
 let book=addWatchList(createWatchBook(['GME','SPY']),'dest','Dest');book=addWatchMembers(book,'dest',watchListMembers(book,'initial-list').slice(0,1),()=>'pre').book;book=selectWatchList(book,'initial-list');const ui=setup(book);
 ui.key('a',{ctrlKey:true});ui.row('initial-row-0').onContextMenu(mouse());ui.item('copy:dest').onClick();expect(ui.status()).toMatch(/Copied 1 .*1 already there/);
 expect(watchListMembers(ui.props.book,'dest').map(row=>row.symbol)).toEqual(['GME','SPY']);
 ui.key('a',{ctrlKey:true});ui.row('initial-row-0').onContextMenu(mouse());expect(ui.item('copy:dest').disabled).toBe(true);ui.item('move:dest').onClick();
 expect(watchListMembers(ui.props.book,'initial-list')).toEqual([]);expect(watchListMembers(ui.props.book,'dest')).toHaveLength(2);
});
it('section menu renames through a validated dialog; blank names are refused and Cancel keeps the old name',()=>{
 const ui=setup(insertWatchSection(createWatchBook(['GME']),'initial-list','sec','Old',null));ui.row('sec').onContextMenu(mouse());ui.item('section-rename').onClick();
 const field=()=>find(ui.render(),node=>node.props?.['aria-label']==='Watchlist name').props;field().onChange({target:{value:'   '}});ui.label('Rename').onClick();
 expect(ui.props.onChange).not.toHaveBeenCalled();expect(text(find(ui.render(),node=>node.props?.role==='alert'))).toMatch(/section name/);
 ui.label('Cancel').onClick();expect((activeWatchList(ui.props.book).rows.find(r=>r.id==='sec') as any).name).toBe('Old');
 ui.row('sec').onContextMenu(mouse());ui.item('section-rename').onClick();field().onChange({target:{value:' New '}});ui.label('Rename').onClick();expect((activeWatchList(ui.props.book).rows.find(r=>r.id==='sec') as any).name).toBe('New');
});
it('list chooser deletes a non-active list only after confirmation and rejects duplicate new-list names',()=>{
 const ui=setup(selectWatchList(addWatchList(createWatchBook(['GME']),'two','Two'),'initial-list'));
 ui.label('Open watchlists').onClick();ui.item('open-list').onClick();ui.label('Delete list Two').onClick();ui.label('Confirm change').onClick();
 expect(ui.props.book.lists.map((list:any)=>list.id)).toEqual(['initial-list']);expect(ui.props.book.activeId).toBe('initial-list');
 ui.label('Open watchlists').onClick();ui.item('new').onClick();find(ui.render(),node=>node.props?.['aria-label']==='Watchlist name').props.onChange({target:{value:'watchlist'}});ui.label('Create').onClick();
 expect(text(find(ui.render(),node=>node.props?.role==='alert'))).toMatch(/already uses/);expect(ui.props.book.lists).toHaveLength(1);
});
it('unresolved rows show unavailable cells and a disabled Open item instead of fixture prices',()=>{
 const book=addWatchMembers(createWatchBook([]),'initial-list',[{symbol:'GME',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false}],()=>'nyse').book,ui=setup(book,[fixtureDataset('GME',20)]);
 const cells=find(ui.render(),node=>node.type==='tr'&&node.key==='nyse').props.children;expect(cells.slice(1).map(text).map((value:string)=>value.replace(/×$/,''))).toEqual(['N/A','N/A'])/* The last cell also holds the row remove X */;expect(text(cells[0])).toContain('UNRESOLVED');
 ui.row('nyse').onContextMenu(mouse());expect(ui.item('open').disabled).toBe(true);expect(ui.item('open').title).toMatch(/No data source for/);
});
it('adding a section in a sorted list places it where the user sees the focused row',()=>{
 // Manual SPY,GME,QQQ displays GME,QQQ,SPY. A section above QQQ must sit between GME and QQQ in the saved order.
 const ui=setup(setWatchSort(createWatchBook(['SPY','GME','QQQ']),'initial-list',{column:'symbol',direction:'asc'}));
 ui.row('initial-row-2').onContextMenu(mouse());ui.item('section-above').onClick();expect(ui.props.onChange).not.toHaveBeenCalled();ui.label('Add').onClick();
 const order=activeWatchList(ui.props.book).rows.map((row:any)=>row.kind==='section'?'[section]':row.reference.symbol);expect(order).toEqual(['GME','[section]','QQQ','SPY']);expect(activeWatchList(ui.props.book).sort).toBeNull();
});
it('section headings and collapsed rows never ride along in a symbol batch',()=>{
 const ui=setup(insertWatchSection(createWatchBook(['GME','SPY','QQQ']),'initial-list','sec','Group','initial-row-1'));
 ui.row('sec').onContextMenu(mouse());ui.key('Escape');ui.row('initial-row-0').onClick(mouse({ctrlKey:true}));expect(ui.selected()).toEqual(['initial-row-0']);
 ui.key('Delete');expect(activeWatchList(ui.props.book).rows.map((row:any)=>row.id)).toEqual(['sec','initial-row-1','initial-row-2']);
 ui.row('initial-row-1').onClick(mouse());ui.row('initial-row-2').onClick(mouse({shiftKey:true}));expect(ui.selected()).toEqual(['initial-row-1','initial-row-2']);
 find(ui.render(),node=>node.type==='button'&&node.props['aria-label']==='Collapse Group').props.onClick();const collapsed=ui.props.book;
 ui.key('Delete');expect(ui.props.book).toBe(collapsed);expect(activeWatchList(ui.props.book).rows).toHaveLength(3);
});
it('Alt+Up at the top of a sorted list keeps the sort and publishes nothing',()=>{
 const ui=setup(setWatchSort(createWatchBook(['SPY','GME']),'initial-list',{column:'symbol',direction:'asc'}));ui.row('initial-row-1').onClick(mouse());ui.key('ArrowUp',{altKey:true});
 expect(ui.props.onChange).not.toHaveBeenCalled();expect(activeWatchList(ui.props.book).sort).not.toBeNull();expect(ui.status()).toMatch(/top/);
});
it('recoloring into a non-empty flag color needs confirmation; Cancel keeps both lists and a changed list refuses',()=>{
 let book=createWatchBook(['GME','SPY','QQQ']);const refs=watchListMembers(book,'initial-list');book=selectWatchList(addWatchMembers(addWatchMembers(book,'flag:orange',refs.slice(0,2),()=>'x').book,'flag:green',refs.slice(2),()=>'y').book,'flag:orange');
 const ui=setup(book);ui.label('Open watchlists').onClick();ui.item('recolor:green').onClick();expect(ui.props.onChange).not.toHaveBeenCalled();
 const modal=()=>find(ui.render(),node=>node.type===Modal&&node.props.title==='Merge flagged lists');expect(text(modal())).toContain('already holds 1');
 ui.label('Cancel').onClick();expect(modal()).toBeNull();expect(ui.props.book).toBe(book);
 ui.label('Open watchlists').onClick();ui.item('recolor:green').onClick();ui.props.book=addWatchMembers(ui.props.book,'flag:green',[{symbol:'NEW',exchange:'LOCAL',datasetId:null,dailyDatasetId:null,synthetic:false}],()=>'z').book;
 ui.label('Merge lists').onClick();expect(ui.props.onChange).not.toHaveBeenCalled();expect(text(modal())).toMatch(/changed/);
 ui.label('Cancel').onClick();ui.label('Open watchlists').onClick();ui.item('recolor:blue').onClick();expect(ui.props.book.flags.filter((row:any)=>row.color==='blue')).toHaveLength(2);expect(ui.props.book.activeId).toBe('flag:blue');
});
it('second review: Cancel on Add section publishes nothing; the section appears only after Add',()=>{
 const ui=setup();ui.row('initial-row-1').onContextMenu(mouse());ui.item('section-above').onClick();ui.label('Cancel').onClick();
 expect(ui.props.onChange).not.toHaveBeenCalled();expect(activeWatchList(ui.props.book).rows.some((row:any)=>row.kind==='section')).toBe(false);
 ui.label('Open watchlists').onClick();ui.item('add-section').onClick();find(ui.render(),node=>node.props?.['aria-label']==='Watchlist name').props.onChange({target:{value:'Energy'}});ui.label('Add').onClick();
 expect(activeWatchList(ui.props.book).rows.filter((row:any)=>row.kind==='section').map((row:any)=>row.name)).toEqual(['Energy']);
});
it('second review: a recolor merge is refused when the target list changed even if its size did not',()=>{
 let book=createWatchBook(['GME','SPY','QQQ']);const refs=watchListMembers(book,'initial-list');book=selectWatchList(addWatchMembers(addWatchMembers(book,'flag:orange',refs.slice(0,1),()=>'x').book,'flag:green',refs.slice(1,2),()=>'y').book,'flag:orange');
 const ui=setup(book);ui.label('Open watchlists').onClick();ui.item('recolor:green').onClick();
 ui.props.book=addWatchMembers(addWatchMembers(ui.props.book,'flag:red',refs.slice(1,2),()=>'z').book,'flag:green',refs.slice(2),()=>'w').book;// green swaps SPY for QQQ: same count
 ui.label('Merge lists').onClick();expect(ui.props.onChange).not.toHaveBeenCalled();expect(text(find(ui.render(),node=>node.type===Modal&&node.props.title==='Merge flagged lists'))).toMatch(/changed/);
});
it('second review: a TXT import never duplicates an existing list name',()=>{
 const ui=setup();ui.label('Watchlist column menu').onClick();ui.item('import-export').onClick();find(ui.render(),node=>node.type==='input'&&node.props.value!==undefined&&node.props['aria-label']===undefined&&node.props.type!=='checkbox').props.onChange({target:{value:'watchlist'}});
 find(ui.render(),node=>node.props?.['aria-label']==='Watchlist import text').props.onChange({target:{value:'LOCAL:DEMO1'}});ui.label('Import pasted list').onClick();expect(ui.props.book.lists.map((list:any)=>list.name)).toEqual(['Watchlist','watchlist (2)']);
});
it('second review: unflagging thousands of rows from a flagged list is one bounded write',()=>{
 const refs=Array.from({length:3000},(_,i)=>({symbol:'F'+i,exchange:'LOCAL',datasetId:null,dailyDatasetId:null,synthetic:false}));const book=selectWatchList(addWatchMembers(createWatchBook([]),'flag:red',refs,()=>'u').book,'flag:red'),ui=setup(book);
 ui.key('a',{ctrlKey:true});const start=performance.now();ui.key('Delete');expect(performance.now()-start).toBeLessThan(2000);expect(ui.props.onChange).toHaveBeenCalledOnce();expect(ui.props.book.flags).toEqual([]);
},30000);

