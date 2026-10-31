import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ScreenerDialog,type ScreenerDialogProps} from '../../src/ui/ScreenerDialog';
import {createScreenerSettings,type ScreenerSettings} from '../../src/domain/screener-state';
import type {BarDataset} from '../../src/domain/types';
import {addWatchList,createWatchBook,type WatchBook,type WatchReference} from '../../src/watchlists/model';
import {addWatchMembers,setWatchFlags,watchFlagOf,watchListMembers,watchReferenceForDataset} from '../../src/watchlists/membership';
// Actual ScreenerDialog handlers with controlled hooks. Not DOM, focus, paint, App wiring or packaged executable evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:(fn:any)=>fn(),
 useEffect:(effect:any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((value,index)=>!Object.is(value,old.deps[index]))){old?.cleanup?.();const cleanup=effect();hooks.cells[i]={deps,cleanup};if(cleanup)hooks.cleanups.push(cleanup);}}
};});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const match=find(child,predicate);if(match)return match;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function make(symbol:string,exchange:string,datasetId:string,closes:number[]):BarDataset{
 return{instrument:{id:exchange+':'+symbol,symbol,name:symbol,exchange,currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'UTC'},bars:closes.map((close,index)=>({time:1700000000+index*86400,open:close,high:close+1,low:close-0.5,close,volume:1000})),resolution:'1D',
  provenance:{providerId:'prov',providerName:'Test import',datasetId,fixture:false,coverage:closes.length+' rows',asOf:1700000000,delaySeconds:null,adjustment:'raw',session:'regular',timezone:'UTC',state:'ready',license:'test',revision:'r1',notes:[]}};
}
const A=make('AAA','NASDAQ','prov:AAA',[10,12]),B=make('AAA','NYSE','prov:NYSE-AAA',[50,55]),C=make('CCC','NASDAQ','prov:CCC',[20,18]),F=make('FFF','NASDAQ','prov:FFF',[1,2]);
let counter=0;const makeId=()=>'r'+(++counter);
const techBook=(refs:WatchReference[]=[])=>{const book=addWatchList(createWatchBook([]),'tech','Tech');return refs.length?addWatchMembers(book,'tech',refs,makeId).book:book;};
function setup(extra:Partial<ScreenerDialogProps>={}){
 const props:any={datasets:[A,B,C,F],settings:createScreenerSettings(),watchBook:techBook(),onClose:vi.fn(),onSelect:vi.fn(),
  onChange:vi.fn((next:ScreenerSettings)=>{props.settings=next;return true;}),
  onWatchBook:vi.fn((next:WatchBook,expected:WatchBook)=>{if(props.watchBook!==expected)return false;props.watchBook=next;return true;}),...extra};
 const render=()=>{hooks.cursor=0;return ScreenerDialog(props);};
 const row=(id:string)=>{const node=find(render(),node=>node.type==='tr'&&node.key===id);if(!node)throw new Error('Missing row '+id);return node.props;};
 const button=(name:string)=>{const node=find(render(),node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name));if(!node)throw new Error('Missing button '+name);return node.props;};
 const control=(label:string)=>{const node=find(render(),node=>node.props?.['aria-label']===label);if(!node)throw new Error('Missing control '+label);return node.props;};
 const click=(id:string,mods:{ctrl?:boolean;shift?:boolean}={})=>row(id).onClick({ctrlKey:!!mods.ctrl,metaKey:false,shiftKey:!!mods.shift,target:null});
 const key=(value:string,mods:{ctrl?:boolean;shift?:boolean}={})=>find(render(),node=>node.props?.className==='screener-body').props.onKeyDown({key:value,ctrlKey:!!mods.ctrl,metaKey:false,shiftKey:!!mods.shift,altKey:false,nativeEvent:{isComposing:false},target:{closest:()=>null},preventDefault:vi.fn(),stopPropagation:vi.fn()});
 const selected=()=>['NASDAQ:AAA','NYSE:AAA','NASDAQ:CCC','NASDAQ:FFF'].filter(id=>find(render(),node=>node.type==='tr'&&node.key===id)?.props['aria-selected']);
 const status=()=>text(find(render(),node=>node.type==='output'));
 const alert=()=>text(find(render(),node=>node.props?.role==='alert'));
 return{props,render,row,button,control,click,key,selected,status,alert};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];counter=0;});afterEach(()=>hooks.cleanups.forEach(cleanup=>cleanup()));
const ref=(dataset:BarDataset)=>watchReferenceForDataset(dataset);

it('Shift-click selects a range in displayed order and Add publishes one book with exact sources, then reports duplicates',()=>{
 const ui=setup();
 // Default sort is symbol ascending; ties by instrument id: NASDAQ:AAA, NYSE:AAA, NASDAQ:CCC, NASDAQ:FFF.
 ui.click('NASDAQ:AAA');ui.click('NASDAQ:CCC',{shift:true});expect(ui.selected()).toEqual(['NASDAQ:AAA','NYSE:AAA','NASDAQ:CCC']);
 ui.click('NYSE:AAA',{ctrl:true});expect(ui.selected()).toEqual(['NASDAQ:AAA','NASDAQ:CCC']);
 ui.click('NYSE:AAA',{ctrl:true});
 ui.button('Add selected to watchlist').onClick();ui.button('Add selected to Tech').onClick();
 expect(ui.props.onWatchBook).toHaveBeenCalledOnce();
 expect(watchListMembers(ui.props.watchBook,'tech')).toEqual([ref(A),ref(B),ref(C)]);
 expect(ui.status()).toContain('Added 3 sources to "Tech"');
 ui.button('Add selected to watchlist').onClick();ui.button('Add selected to Tech').onClick();
 expect(ui.props.onWatchBook).toHaveBeenCalledOnce();expect(ui.status()).toContain('Nothing added. All 3 selected sources are already in "Tech"');
});
it('a list changed after the panel opened refuses the add and publishes nothing',()=>{
 const ui=setup();ui.click('NASDAQ:AAA');ui.button('Add selected to watchlist').onClick();
 const changed=addWatchMembers(ui.props.watchBook,'tech',[ref(F)],makeId).book;ui.props.watchBook=changed;
 ui.button('Add selected to Tech').onClick();
 expect(ui.props.onWatchBook).not.toHaveBeenCalled();expect(ui.props.watchBook).toBe(changed);
 expect(ui.alert()).toContain('changed after it was chosen');expect(()=>ui.button('Add selected to Tech')).toThrow('Missing button');
});
it('results that changed after the panel opened are refused as stale',()=>{
 const ui=setup();ui.click('NASDAQ:CCC');ui.button('Add selected to watchlist').onClick();
 ui.props.datasets=[A,B,F];ui.render();ui.button('Add selected to Tech').onClick();
 expect(ui.props.onWatchBook).not.toHaveBeenCalled();expect(ui.alert()).toContain('no longer in the current results');
});
it('capacity failure leaves the book, the selection and the open panel unchanged',()=>{
 const filler=Array.from({length:4999},(_,index)=>({symbol:'S'+index,exchange:'TEST',datasetId:'fill:'+index,dailyDatasetId:null,synthetic:false}));
 const ui=setup({watchBook:techBook(filler)}),before=ui.props.watchBook,beforeText=JSON.stringify(before);
 ui.click('NASDAQ:AAA');ui.click('NYSE:AAA',{shift:true});ui.button('Add selected to watchlist').onClick();ui.button('Add selected to Tech').onClick();
 expect(ui.props.onWatchBook).not.toHaveBeenCalled();expect(ui.props.watchBook).toBe(before);expect(JSON.stringify(ui.props.watchBook)).toBe(beforeText);
 expect(ui.alert()).toContain('would hold 5001 rows');expect(ui.selected()).toEqual(['NASDAQ:AAA','NYSE:AAA']);expect(ui.button('Add selected to Tech')).toBeTruthy();
});
it('host rejection publishes nothing and says so',()=>{
 const ui=setup({onWatchBook:vi.fn(()=>false)}),before=ui.props.watchBook;
 ui.click('NASDAQ:FFF');ui.button('Add selected to watchlist').onClick();ui.button('Add selected to Tech').onClick();
 expect(ui.props.watchBook).toBe(before);expect(ui.alert()).toContain('rejected. Nothing was changed');
});
it('Flag applies by exchange and ticker; the same ticker on another exchange stays unflagged and the Flag column shows it',()=>{
 const settings=createScreenerSettings();settings.columns=[...settings.columns,{id:'flag',metric:'flag',label:'Flag color'}];
 const ui=setup({settings});
 ui.control('Select NYSE:AAA result').onClick({shiftKey:false,ctrlKey:false,metaKey:false});ui.button('Flag selected').onClick();ui.button('Flag Red').onClick();
 expect(ui.props.onWatchBook).toHaveBeenCalledOnce();
 expect(watchFlagOf(ui.props.watchBook,{exchange:'NYSE',symbol:'AAA'})).toBe('red');expect(watchFlagOf(ui.props.watchBook,{exchange:'NASDAQ',symbol:'AAA'})).toBeNull();
 const cell=(id:string)=>text(ui.row(id).children[1][ui.props.settings.columns.length-1]);
 expect(cell('NYSE:AAA')).toBe('Red');expect(cell('NASDAQ:AAA')).toBe('Not flagged');
 ui.button('Flag selected').onClick();ui.button('Remove flag').onClick();expect(watchFlagOf(ui.props.watchBook,{exchange:'NYSE',symbol:'AAA'})).toBeNull();
});
it('a flag changed elsewhere after the Flag panel opened is refused',()=>{
 const ui=setup();ui.click('NASDAQ:CCC');ui.button('Flag selected').onClick();
 ui.props.watchBook=setWatchFlags(ui.props.watchBook,[ref(C)],'green');
 ui.button('Flag Red').onClick();expect(ui.props.onWatchBook).not.toHaveBeenCalled();expect(watchFlagOf(ui.props.watchBook,{exchange:'NASDAQ',symbol:'CCC'})).toBe('green');
 expect(ui.alert()).toContain('Flags on the selected markets changed');
});
it('creates a new list from the selection without switching the active watchlist, and validates its name',()=>{
 const ui=setup(),active=ui.props.watchBook.activeId;ui.key('a',{ctrl:true});expect(ui.selected()).toHaveLength(4);
 ui.button('Add selected to watchlist').onClick();ui.button('Create list with selected').onClick();
 expect(ui.alert()).toContain('Enter a list name');expect(ui.props.onWatchBook).not.toHaveBeenCalled();
 ui.control('New watchlist name').onChange({target:{value:'tech'}});ui.button('Create list with selected').onClick();expect(ui.alert()).toContain('already uses this name');
 ui.control('New watchlist name').onChange({target:{value:'Momentum'}});ui.button('Create list with selected').onClick();
 const created=ui.props.watchBook.lists.find((list:any)=>list.name==='Momentum');
 expect(watchListMembers(ui.props.watchBook,created.id)).toEqual([ref(A),ref(B),ref(C),ref(F)]);expect(ui.props.watchBook.activeId).toBe(active);
});
it('without a connected book the actions and the watchlist universe are disabled, and flag cells are unavailable',()=>{
 const settings=createScreenerSettings();settings.columns=[...settings.columns,{id:'flag',metric:'flag'}];
 const ui=setup({watchBook:undefined,settings});ui.click('NASDAQ:AAA');
 expect(ui.button('Add selected to watchlist').disabled).toBe(true);expect(ui.button('Flag selected').disabled).toBe(true);expect(ui.control('Screener watchlist universe').disabled).toBe(true);
 expect(text(ui.render())).toContain('Local watchlists are not connected');expect(text(ui.row('NASDAQ:AAA').children[1].at(-1))).toBe('n/a');expect(ui.row('NASDAQ:AAA').children[1].at(-1).props.title).toContain('(unavailable)');
});
it('watchlist universe selector scopes results, and an empty list is reported as empty rather than unavailable',()=>{
 const ui=setup({watchBook:techBook([ref(A),ref(F)])});
 ui.control('Screener watchlist universe').onChange({target:{value:'tech'}});
 expect(ui.props.settings.universe.watchlist).toEqual({listId:'tech',name:'Tech',match:'source'});
 expect(find(ui.render(),node=>node.type==='tr'&&node.key==='NYSE:AAA')).toBeNull();expect(ui.row('NASDAQ:FFF')).toBeTruthy();
 expect(text(ui.render())).toContain('Watchlist universe "Tech" by exact bound source: 2 symbols; 2 with loaded sources');
 ui.props.watchBook=techBook();ui.render();expect(text(ui.render())).toContain('The watchlist "Tech" has no symbols, so the universe is empty.');
 ui.props.watchBook=createWatchBook([]);expect(text(ui.render())).toContain('Watchlist membership is unavailable.');expect(text(ui.render())).toContain('Tech (unavailable)');
 ui.control('Screener watchlist universe').onChange({target:{value:''}});expect(Object.hasOwn(ui.props.settings.universe,'watchlist')).toBe(false);
});
it('keyboard selection moves focus, extends with Shift and Escape closes an open action panel without publishing',()=>{
 const ui=setup();ui.key('ArrowDown');expect(ui.selected()).toEqual(['NASDAQ:AAA']);ui.key('ArrowDown',{shift:true});ui.key('ArrowDown',{shift:true});
 expect(ui.selected()).toEqual(['NASDAQ:AAA','NYSE:AAA','NASDAQ:CCC']);ui.key('End');expect(ui.selected()).toEqual(['NASDAQ:FFF']);
 ui.button('Add selected to watchlist').onClick();expect(ui.button('Add selected to Tech')).toBeTruthy();ui.key('Escape');
 expect(()=>ui.button('Add selected to Tech')).toThrow('Missing button');expect(ui.props.onWatchBook).not.toHaveBeenCalled();
});
it('Add filter with a new field adds a parameterized column instance and binds the filter to it',()=>{
 const P=make('PPP','NASDAQ','prov:PPP',[10,11,12,15]),Q=make('QQQ','NASDAQ','prov:QQQ',[10,11,12,12.5]);
 // performance length 3: PPP 15/10-1 = 50%; QQQ 12.5/10-1 = 25%.
 const ui=setup({datasets:[P,Q]});ui.button('Add filter').onClick();
 ui.control('Filter column').onChange({target:{value:'lv-new-filter-field'}});ui.control('Filter field metric').onChange({target:{value:'performance'}});
 ui.control('Filter field length').onChange({target:{value:'3'}});ui.control('Filter value').onChange({target:{value:'30'}});
 find(ui.render(),node=>node.type==='form').props.onSubmit({preventDefault:vi.fn()});
 const added=ui.props.settings.columns.at(-1);expect(added).toMatchObject({metric:'performance',parameters:{length:3}});
 expect(ui.props.settings.filters).toEqual([expect.objectContaining({columnId:added.id,operator:'gt',value:30,active:true})]);
 expect(find(ui.render(),node=>node.type==='tr'&&node.key==='NASDAQ:QQQ')).toBeNull();expect(ui.row('NASDAQ:PPP')).toBeTruthy();
});
it('Duplicate column keeps the original instance and adds an independent one with edited parameters',()=>{
 const ui=setup(),rsi=ui.props.settings.columns.find((column:any)=>column.metric==='rsi');
 const heading=find(ui.render(),node=>node.type==='th'&&node.key===rsi.id);find(heading,node=>node.type==='button'&&text(node)==='Duplicate with other parameters').props.onClick();
 ui.control('Column length').onChange({target:{value:'7'}});find(ui.render(),node=>node.type==='form').props.onSubmit({preventDefault:vi.fn()});
 const rsis=ui.props.settings.columns.filter((column:any)=>column.metric==='rsi');
 expect(rsis).toHaveLength(2);expect(rsis[0]).toEqual(rsi);expect(rsis[1].parameters.length).toBe(7);expect(rsis[1].id).not.toBe(rsi.id);
});
it('Add offers custom lists only; flagged lists change through Flag with its current-flag check',()=>{
 const ui=setup();ui.click('NASDAQ:AAA');ui.button('Add selected to watchlist').onClick();
 expect(ui.button('Add selected to Tech')).toBeTruthy();expect(()=>ui.button('Add selected to Red flagged')).toThrow('Missing button');
});
it('a selection with an identifier that cannot be a watchlist member publishes nothing and names it',()=>{
 const low=make('LOW','nasdaq','prov:low',[1,2]);const ui=setup({datasets:[A,low]});ui.key('a',{ctrl:true});
 ui.button('Add selected to watchlist').onClick();expect(ui.alert()).toContain('Not eligible: nasdaq:LOW');expect(ui.props.onWatchBook).not.toHaveBeenCalled();
 expect(()=>ui.button('Add selected to Tech')).toThrow('Missing button');
});
it('new-list creation refuses the 100-list limit and host rejection without publishing',()=>{
 let full=techBook();for(let index=0;full.lists.length<100;index++)full=addWatchList(full,'extra'+index,'Extra '+index);
 const ui=setup({watchBook:full});ui.click('NASDAQ:AAA');ui.button('Add selected to watchlist').onClick();
 ui.control('New watchlist name').onChange({target:{value:'One more'}});ui.button('Create list with selected').onClick();
 expect(ui.alert()).toContain('already holds 100 lists');expect(ui.props.watchBook).toBe(full);
 const reject=setup({onWatchBook:vi.fn(()=>false)}),before=reject.props.watchBook;reject.click('NASDAQ:AAA');reject.button('Add selected to watchlist').onClick();
 reject.control('New watchlist name').onChange({target:{value:'Momentum'}});reject.button('Create list with selected').onClick();
 expect(reject.props.watchBook).toBe(before);expect(reject.alert()).toContain('rejected. Nothing was changed');
});
it('selects a range across result pages and adds every selected source in display order',()=>{
 const many=Array.from({length:150},(_,index)=>make('S'+String(index).padStart(3,'0'),'NASDAQ','prov:S'+index,[1,2]));
 const ui=setup({datasets:many});ui.key('Home');ui.key('End',{shift:true});
 expect(text(ui.render())).toContain('150 of 150 matching rows selected');expect(text(ui.render())).toContain('Page 2 of 2');
 ui.button('Add selected to watchlist').onClick();ui.button('Add selected to Tech').onClick();
 expect(watchListMembers(ui.props.watchBook,'tech').map(member=>member.symbol)).toEqual(many.map(dataset=>dataset.instrument.symbol));
});
it('Shift on a row checkbox selects a range; a row that leaves the results does not come back selected',()=>{
 const ui=setup();const box=(id:string,shiftKey=false)=>ui.control('Select '+id+' result').onClick({shiftKey,ctrlKey:false,metaKey:false});
 box('NASDAQ:AAA');box('NASDAQ:CCC',true);expect(ui.selected()).toEqual(['NASDAQ:AAA','NYSE:AAA','NASDAQ:CCC']);
 ui.props.datasets=[A,B,F];ui.render();ui.props.datasets=[A,B,C,F];ui.render();expect(ui.selected()).toEqual(['NASDAQ:AAA','NYSE:AAA']);
});
it('universe editor changes the watchlist match; a flagged list defaults to exchange-and-ticker matching',()=>{
 const ui=setup({watchBook:techBook([ref(A)])});ui.control('Screener watchlist universe').onChange({target:{value:'tech'}});
 ui.button('Source universe').onClick();ui.control('Screener watchlist match').onChange({target:{value:'market'}});
 find(ui.render(),node=>node.type==='form').props.onSubmit({preventDefault:vi.fn()});expect(ui.props.settings.universe.watchlist.match).toBe('market');
 ui.control('Screener watchlist universe').onChange({target:{value:'flag:red'}});expect(ui.props.settings.universe.watchlist).toEqual({listId:'flag:red',name:'Red flagged',match:'market'});
 ui.control('Screener watchlist universe').onChange({target:{value:'tech'}});expect(ui.props.settings.universe.watchlist.match).toBe('source');
});
it('CSV export is blocked while membership is unavailable, so it cannot pass for an empty result',()=>{
 const settings=createScreenerSettings();settings.universe={...settings.universe,watchlist:{listId:'gone',name:'Gone',match:'source'}};
 const ui=setup({settings});expect(ui.button('Export matching rows CSV').disabled).toBe(true);
 ui.props.settings={...settings,universe:{...settings.universe,watchlist:{listId:'tech',name:'Tech',match:'source'}}};expect(ui.button('Export matching rows CSV').disabled).toBe(false);
});
it('a dataset whose identity notes cannot hold renders with notes disabled for that row instead of crashing the table',()=>{
 const low=make('LOW','nasdaq','prov:low',[1,2]),onNotes=vi.fn(()=>true);const ui=setup({datasets:[A,low],onNotes});
 expect(ui.row('nasdaq:LOW')).toBeTruthy();expect(()=>ui.button('Add note for nasdaq:LOW')).toThrow('Missing button');expect(ui.button('Add note for NASDAQ:AAA')).toBeTruthy();
 ui.row('nasdaq:LOW').onContextMenu({preventDefault:vi.fn()});expect(ui.row('nasdaq:LOW')['aria-selected']).toBe(true);expect(()=>ui.button('Add local symbol note')).toThrow('Missing button');
});
it('toggling the unavailable-predicate view and back keeps the selection',()=>{
 const ui=setup();ui.click('NASDAQ:AAA');ui.click('NASDAQ:CCC',{ctrl:true});
 const showUnknown=find(ui.render(),node=>node.type==='label'&&text(node)==='Show rows without data');
 find(showUnknown,node=>node.type==='input').props.onChange({target:{checked:true}});ui.render();
 find(showUnknown,node=>node.type==='input').props.onChange({target:{checked:false}});expect(ui.selected()).toEqual(['NASDAQ:AAA','NASDAQ:CCC']);
});
