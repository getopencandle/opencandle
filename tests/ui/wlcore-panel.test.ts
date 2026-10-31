import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {Modal} from '../../src/ui/Modal';
import {activeWatchList,addWatchList,createWatchBook,insertWatchSection,referenceFromDataset,selectWatchList,type WatchBook} from '../../src/watchlists/model';
import {addWatchMembers,setWatchFlags,watchListMembers} from '../../src/watchlists/membership';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';

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
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>findAll(child,test,out));else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}return out;}
const mouse=(extra={})=>({ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,detail:1,clientX:40,clientY:50,preventDefault:vi.fn(),stopPropagation:vi.fn(),...extra});
const keyEvent=(key:string,extra={})=>({key,nativeEvent:{isComposing:false},target:{closest:()=>null},preventDefault:vi.fn(),stopPropagation:vi.fn(),altKey:false,shiftKey:false,ctrlKey:false,metaKey:false,...extra});
function setup(book:WatchBook=createWatchBook(['GME','SPY','QQQ']),datasets:BarDataset[]=[],extra:Record<string,unknown>={}){
 hooks.cells=[];hooks.cursor=0;
 const props:any={book,datasets,onChange:vi.fn((next:WatchBook)=>{props.book=next;return true;}),onOpen:vi.fn(()=>true),onOpenAll:vi.fn(()=>true),onNotes:vi.fn(()=>true),...extra};
 const render=()=>{hooks.cursor=0;return WatchlistPanel(props);};
 const row=(id:string)=>find(render(),node=>node.type==='tr'&&node.key===id).props;
 const cells=(id:string)=>find(render(),node=>node.type==='tr'&&node.key===id).props.children as any[];
 const menu=()=>find(render(),node=>node.props?.role==='menu');
 const item=(id:string)=>{const found=find(menu(),node=>node.type==='button'&&node.key===id);if(!found)throw Error('Missing menu item '+id);return found.props;};
 const label=(value:string)=>{const found=find(render(),node=>node.type==='button'&&(node.props['aria-label']===value||text(node.props.children)===value));if(!found)throw Error('Missing button '+value);return found.props;};
 const key=(value:string,extra={})=>render().props.onKeyDown(keyEvent(value,extra));
 const status=()=>text(find(render(),node=>node.props?.role==='status'));
 const modalAlert=()=>text(find(render(),node=>node.props?.role==='alert'&&node.type==='span'));
 return{props,render,row,cells,menu,item,label,key,status,modalAlert};
}
const real=(symbol:string,closes:number[]):BarDataset=>{const base=fixtureDataset(symbol,closes.length);return{...base,resolution:'1D',instrument:{...base.instrument,id:'NYSE:'+symbol,exchange:'NYSE'},provenance:{...base.provenance,providerId:'wl-test',providerName:'Synthetic test provider',datasetId:'wl:'+symbol,fixture:false,session:'regular'},bars:closes.map((close,index)=>({time:1767225600+index*86400,open:close,high:close,low:close,close,volume:100}))};};
let ids=0;const id=()=>'p'+(++ids);
beforeEach(()=>{vi.useFakeTimers();hooks.cells=[];hooks.cursor=0;hooks.effects.clear();vi.stubGlobal('document',{querySelector:()=>null});vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});});
afterEach(()=>{for(const cleanup of hooks.effects.values())cleanup();vi.useRealTimers();vi.unstubAllGlobals();});

it('cells: a zero previous close shows n/a with its reason, missing data shows N/A, and Last names its close time and source',()=>{
 const zero=real('ZERO',[0,5]),missing=real('ONE',[5]);let book=addWatchList(createWatchBook([]),'L','Mine');book=addWatchMembers(book,'L',[referenceFromDataset(zero),referenceFromDataset(missing)],id).book;
 const ui=setup(book,[zero,missing]),rows=activeWatchList(book).rows.map(row=>row.id);
 const [, zeroLast, zeroPct]=ui.cells(rows[0]),[, , missingPct]=ui.cells(rows[1]);
 expect(text(zeroPct).replace(/×$/,'')).toBe('n/a')/* The last cell also holds the row remove X */;expect(zeroPct.props.title).toBe('Previous close is zero');expect(zeroPct.props['aria-label']).toBe('Not applicable');
 expect(text(missingPct).replace(/×$/,'')).toBe('N/A');expect(missingPct.props['aria-label']).toBe('Unavailable');expect(missingPct.props.title.startsWith('Unavailable.')).toBe(true);
 expect(text(zeroLast)).toBe('5');expect(zeroLast.props.title).toBe('Last 5 at 2026-01-02T00:00:00.000Z, from Synthetic test provider, 1D');
});

it('list menu: Add alert on list opens the alert dialog for the active list, and flagged lists keep their id',()=>{
 const off=setup();off.label('Open watchlists').onClick();expect(off.item('alert').disabled).toBe(true);expect(off.item('alert').title).toMatch(/not connected/);
 const onListAlert=vi.fn(()=>true),ui=setup(createWatchBook(['GME']),[],{onListAlert});ui.label('Open watchlists').onClick();expect(ui.item('alert').disabled).toBe(false);expect(text(find(ui.menu(),node=>node.key==='alert'))).toContain('Add alert on list...');
 expect(text(ui.menu())).not.toMatch(new RegExp(String.fromCharCode(0x2014)));ui.item('alert').onClick();expect(onListAlert).toHaveBeenCalledWith('initial-list');
 let flagged=setWatchFlags(createWatchBook(['GME']),[{symbol:'GME',exchange:'SYNTHETIC',datasetId:'x',dailyDatasetId:null,synthetic:false}],'blue');flagged=selectWatchList(flagged,'flag:blue');
 const second=vi.fn(()=>true),other=setup(flagged,[],{onListAlert:second});other.label('Open watchlists').onClick();other.item('alert').onClick();expect(second).toHaveBeenCalledWith('flag:blue');
 const capped=setup(createWatchBook(['GME']),[],{onListAlert,listAlertDisabled:'A workspace holds at most 20 list alerts.'});capped.label('Open watchlists').onClick();expect(capped.item('alert').disabled).toBe(true);expect(capped.item('alert').title).toBe('A workspace holds at most 20 list alerts.');
 const refused=setup(createWatchBook(['GME']),[],{onListAlert:vi.fn(()=>false)});refused.label('Open watchlists').onClick();refused.item('alert').onClick();expect(refused.status()).toContain('alert dialog could not be opened');
});

it('Plus search adds at the bottom of the list, or at the bottom of the selected section',()=>{
 const spy=fixtureDataset('SPY',500),qqq=fixtureDataset('QQQ',500);let book=addWatchList(createWatchBook([]),'L','Mine');
 book=addWatchMembers(book,'L',[{symbol:'AAA',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false}],id).book;book=insertWatchSection(book,'L','sec','Group',null);
 book=addWatchMembers(book,'L',[{symbol:'BBB',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false}],id).book;book=insertWatchSection(book,'L','sec2','Other',null);
 const names=(b:WatchBook)=>activeWatchList(b).rows.map(row=>row.kind==='section'?'#'+row.name:row.reference.symbol);
 const ui=setup(book,[spy,qqq]);
 const choose=(symbol:string)=>{const button=findAll(ui.render(),node=>node.type==='button'&&node.props.className==='wl-choice').find(node=>node.props['data-wl-symbol']===symbol&&text(node).startsWith(symbol));if(!button)throw Error('No choice '+symbol);button.props.onClick();};
 ui.label('Add watchlist symbols').onClick();choose('SPY');expect(names(ui.props.book)).toEqual(['AAA','#Group','BBB','#Other','SPY']);
 ui.label('Close').onClick();ui.row('sec').onContextMenu(mouse());ui.menu().props.onKeyDown(keyEvent('Escape'));
 ui.label('Add watchlist symbols').onClick();choose('QQQ');expect(names(ui.props.book)).toEqual(['AAA','#Group','BBB','QQQ','#Other','SPY']);
 // UI audit 1028 #1: the placement hint moved from a paragraph to the search field tooltip.
 expect(find(ui.render(),node=>node.type==='input'&&node.props['aria-label']==='Search to add symbols').props.title).toContain('last row of the list, or of the selected section');
});

it('TXT export keeps sections without flattening; Cancel writes nothing and a failed write says so',async()=>{
 let book=addWatchList(createWatchBook([]),'L','Mine');book=addWatchMembers(book,'L',[{symbol:'AAA',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false}],id).book;book=insertWatchSection(book,'L','sec','Group',null);
 book=addWatchMembers(book,'L',[{symbol:'BBB',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false}],id).book;
 const exportData=vi.fn(async(_value:any)=>({ok:true,value:{fileName:'x.txt',bytes:1}}));vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn(),lv:{exportData}});
 const ui=setup(book);ui.label('Watchlist column menu').onClick();ui.item('import-export').onClick();const exportButton=()=>findAll(ui.render(),node=>node.type==='button'&&text(node)==='Export active list TXT')[0].props;
 await exportButton().onClick();expect(exportData).toHaveBeenCalledOnce();expect(exportData.mock.calls[0][0]).toEqual({format:'txt',text:'NYSE:AAA\n###Group\nNYSE:BBB',suggestedName:'OpenCandle-watchlists.txt'});expect(ui.modalAlert()).toBe('Exported locally.');
 exportData.mockResolvedValueOnce({ok:false,error:{code:'CANCELLED',message:'Export cancelled.'}} as any);await exportButton().onClick();expect(ui.modalAlert()).toBe('Export cancelled. Nothing was written.');
 exportData.mockResolvedValueOnce({ok:false,error:{code:'OPERATION_FAILED',message:'Local operation failed.'}} as any);await exportButton().onClick();expect(ui.modalAlert()).toBe('The file could not be saved.');
 expect(ui.props.onChange).not.toHaveBeenCalled();
 const flat=findAll(ui.render(),node=>node.type==='input'&&node.props.type==='checkbox').find(node=>node.props.checked===false);flat!.props.onChange({target:{checked:true}});await exportButton().onClick();expect(exportData.mock.calls.at(-1)![0].text).toBe('NYSE:AAA,NYSE:BBB');
});

it('Alt+Enter flags the selection with the last color only from panel focus and never from an input or during composition; the chart never receives it',()=>{
 const ui=setup();ui.row('initial-row-0').onClick(mouse());
 const inInput=keyEvent('Enter',{altKey:true,target:{closest:(selector:string)=>/input/.test(selector)?{}:null}});ui.render().props.onKeyDown(inInput);expect(ui.props.book.flags).toEqual([]);expect(inInput.preventDefault).not.toHaveBeenCalled();expect(inInput.stopPropagation).not.toHaveBeenCalled();
 const composing=keyEvent('Enter',{altKey:true,nativeEvent:{isComposing:true}});ui.render().props.onKeyDown(composing);expect(ui.props.book.flags).toEqual([]);
 const own=keyEvent('Enter',{altKey:true});ui.render().props.onKeyDown(own);expect(ui.props.book.flags.map((row:any)=>row.reference.symbol+':'+row.color)).toEqual(['GME:red']);expect(own.preventDefault).toHaveBeenCalled();expect(own.stopPropagation).toHaveBeenCalled();
 ui.row('initial-row-1').onClick(mouse());ui.row('initial-row-1').onContextMenu(mouse());ui.item('flag:green').onClick();
 ui.row('initial-row-2').onClick(mouse());ui.key('Enter',{altKey:true});expect(ui.props.book.flags.find((row:any)=>row.reference.symbol==='QQQ')?.color).toBe('green');
 expect(ui.props.book.lastFlag).toBe('green');
});

it('renaming a flagged list refuses a name another flagged list uses, and keeps the draft',()=>{
 let book=setWatchFlags(createWatchBook([]),[{symbol:'A',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false}],'blue');book=setWatchFlags(book,[{symbol:'B',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false}],'green');
 book=selectWatchList(book,'flag:green');const ui=setup(book);
 ui.label('Open watchlists').onClick();ui.item('rename').onClick();const input=()=>find(ui.render(),node=>node.type==='input'&&node.props['aria-label']==='Watchlist name').props;
 input().onChange({target:{value:'blue flagged'}});ui.label('Rename').onClick();expect(ui.modalAlert()).toBe('Another flagged list already uses this name.');expect(ui.props.onChange).not.toHaveBeenCalled();expect(input().value).toBe('blue flagged');
 input().onChange({target:{value:'Mine'}});ui.label('Rename').onClick();expect(ui.props.onChange).toHaveBeenCalledOnce();expect(ui.props.book.flagNames).toEqual({green:'Mine'});
});

it('bulk recolor into an occupied color asks first and is refused when either list changed meanwhile',()=>{
 let book=setWatchFlags(createWatchBook([]),[{symbol:'A',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false}],'orange');book=setWatchFlags(book,[{symbol:'B',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false}],'cyan');book=selectWatchList(book,'flag:orange');
 const ui=setup(book);ui.label('Open watchlists').onClick();ui.item('recolor:cyan').onClick();
 const modal=()=>find(ui.render(),node=>node.type===Modal&&node.props.title==='Merge flagged lists');expect(text(modal())).toContain('already holds 1 markets');expect(ui.props.onChange).not.toHaveBeenCalled();
 ui.props.book=setWatchFlags(ui.props.book,[{symbol:'C',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false}],'cyan');ui.label('Merge lists').onClick();
 expect(ui.props.onChange).not.toHaveBeenCalled();expect(text(modal())).toContain('changed while confirmation was open');
 ui.label('Cancel').onClick();expect(modal()).toBeNull();
 ui.label('Open watchlists').onClick();ui.item('recolor:cyan').onClick();ui.label('Merge lists').onClick();expect(ui.props.onChange).toHaveBeenCalledOnce();expect(watchListMembers(ui.props.book,'flag:cyan').map(row=>row.symbol).sort()).toEqual(['A','B','C']);
});
