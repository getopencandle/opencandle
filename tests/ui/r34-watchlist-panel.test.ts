import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {Modal} from '../../src/ui/Modal';
import {activeWatchList,addWatchList,createWatchBook,insertWatchSection,referenceFromDataset,selectWatchList,setWatchColumnVisible,type WatchBook} from '../../src/watchlists/model';
import {addWatchMembers,setWatchFlags,watchListMembers} from '../../src/watchlists/membership';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';

// Actual Panel handlers with controlled hooks (copied from wlcore-panel). SYNTHETIC data only; no DOM or paint evidence.
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

const ET=(h:number,m=0,d=21)=>Date.UTC(2026,9,d,h+4,m)/1000; // EDT, Wednesday 2026-10-21
const ny=(symbol:string,closes:number[]):BarDataset=>{const set=real(symbol,closes);return{...set,instrument:{...set.instrument,timezone:'America/New_York',assetClass:'stock'}};};
function listBook(symbols:string[]):WatchBook{let book=addWatchList(createWatchBook([]),'L','Mine');book=addWatchMembers(book,'L',symbols.map(symbol=>({symbol,exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false})),id).book;return selectWatchList(book,'L');}
const symbolsOf=(book:WatchBook)=>activeWatchList(book).rows.map(row=>row.kind==='symbol'?row.reference.symbol:'#'+row.name);
const cell=(cells:any[],column:string)=>cells.find(node=>node.key===column);

it('Chg and Chg% cells carry the up or down class; Last stays neutral',()=>{
 const up=ny('GME',[10,12]),down=ny('SPY',[10,9]);let book=createWatchBook([]);
 book=addWatchMembers(book,activeWatchList(book).id,[referenceFromDataset(up),referenceFromDataset(down)],id).book;
 book=setWatchColumnVisible(book,'change',true); // the default columns are Symbol, Last and Chg%
 const ui=setup(book,[up,down]),[gme,spy]=activeWatchList(book).rows.map(row=>row.id);
 expect(cell(ui.cells(gme!),'change').props.className?.replace(' wl-remove-host','')/* The last cell also hosts the row remove X */).toBe('wl-up');expect(cell(ui.cells(gme!),'changePercent').props.className?.replace(' wl-remove-host','')/* The last cell also hosts the row remove X */).toBe('wl-up');
 expect(cell(ui.cells(spy!),'change').props.className?.replace(' wl-remove-host','')/* The last cell also hosts the row remove X */).toBe('wl-down');expect(cell(ui.cells(gme!),'last').props.className).toBeUndefined();
});

it('the active chart symbol row carries the current-symbol marker, and only that row',()=>{
 const gme=ny('GME',[10,12]),spy=ny('SPY',[5,6]);let book=createWatchBook([]);
 book=addWatchMembers(book,activeWatchList(book).id,[referenceFromDataset(gme),referenceFromDataset(spy)],id).book;
 const [a,b]=activeWatchList(book).rows.map(row=>row.id),ui=setup(book,[gme,spy],{currentMarket:'NYSE:SPY'});
 expect(ui.row(b!)['aria-current']).toBe('true');expect(ui.row(b!)['data-wl-current']).toBe('');
 expect(ui.row(a!)['aria-current']).toBeUndefined();expect(ui.row(a!)['data-wl-current']).toBeUndefined();
 expect(setup(book,[gme,spy]).row(b!)['aria-current']).toBeUndefined();
});

it('FLOWS-AUDIT5 #11: the active row follows the chart symbol, and a symbol outside the list clears the stale highlight',()=>{
 const gme=ny('GME',[10,12]),spy=ny('SPY',[5,6]);let book=createWatchBook([]);
 book=addWatchMembers(book,activeWatchList(book).id,[referenceFromDataset(gme),referenceFromDataset(spy)],id).book;
 const [a,b]=activeWatchList(book).rows.map(row=>row.id),ui=setup(book,[gme,spy],{currentMarket:'NYSE:GME'});
 ui.render();expect(ui.row(a!)['aria-selected']).toBe(true);
 ui.props.currentMarket='NYSE:SPY';ui.render();expect(ui.row(b!)['aria-selected']).toBe(true);expect(ui.row(a!)['aria-selected']).toBe(false);
 ui.props.currentMarket='NYSE:ZZZ';ui.render();expect(ui.row(a!)['aria-selected']).toBe(false);expect(ui.row(b!)['aria-selected']).toBe(false);
});

it('the symbol cell shows a market-status dot from the LV calendar for a New York source',()=>{
 vi.setSystemTime(ET(8)*1000);const gme=ny('GME',[10,12]);let book=createWatchBook([]);
 book=addWatchMembers(book,activeWatchList(book).id,[referenceFromDataset(gme)],id).book;const row=activeWatchList(book).rows[0]!.id;
 const dot=()=>find(cell(setup(book,[gme]).cells(row),'symbol'),(node:any)=>node.props?.className==='wl-status');
 expect(dot().props['data-state']).toBe('pre');expect(dot().props.title).toBe('Pre-market, OpenCandle calendar');
 vi.setSystemTime(ET(10)*1000);expect(dot().props['data-state']).toBe('open');
 const loose=createWatchBook(['ZZZ']),unbound=setup(loose);expect(find(cell(unbound.cells(activeWatchList(loose).rows[0]!.id),'symbol'),(node:any)=>node.props?.className==='wl-status')).toBeNull();
});

it('dragging one row of a multi-selection moves the whole selection to the drop slot',()=>{
 const book=listBook(['AAA','BBB','CCC','DDD']),ui=setup(book),[a,b,,d]=activeWatchList(book).rows.map(row=>row.id);
 ui.row(b!).onClick(mouse());ui.row(d!).onClick(mouse({ctrlKey:true}));
 // The pointer reorder reads row boxes from the list element (a 30 px row each, in display order).
 const host=find(ui.render(),(node:any)=>node.props?.className==='wl-table').props.ref,classes=()=>({add:vi.fn(),remove:vi.fn()});
 const fakeRows=()=>symbolsOf(ui.props.book).map((_,index)=>({dataset:{wlRowId:activeWatchList(ui.props.book).rows[index]!.id},style:{transform:''},classList:classes(),getBoundingClientRect:()=>({top:28+index*30,height:30,bottom:58+index*30})}));
 host.current={scrollTop:0,classList:classes(),appendChild:vi.fn(),getBoundingClientRect:()=>({top:0,bottom:400}),querySelector:()=>({getBoundingClientRect:()=>({height:28})}),querySelectorAll:()=>fakeRows()};
 const drag=(id:string,fromY:number,toY:number)=>{const at={pointerId:1,button:0,currentTarget:{setPointerCapture:vi.fn(),hasPointerCapture:()=>false}};ui.row(id).onPointerDown({...at,clientY:fromY,target:{closest:()=>null}});ui.row(id).onPointerMove({...at,clientY:fromY+6});ui.row(id).onPointerMove({...at,clientY:toY});ui.row(id).onPointerUp(at);};
 // D (4th row) is pressed with B selected too; both lift (in list order) and land before AAA, the top slot.
 drag(d!,28+3*30+15,20);
 expect(ui.props.onChange).toHaveBeenCalledTimes(1);expect(symbolsOf(ui.props.book)).toEqual(['BBB','DDD','AAA','CCC']);
 // The click that follows a drag neither selects nor opens a chart.
 expect(ui.row(d!).onClick(mouse())).toBeUndefined();expect(ui.props.onOpen).not.toHaveBeenCalled();
 // A row outside the selection still moves alone: CCC (last) to before BBB (2nd).
 const c=activeWatchList(ui.props.book).rows.find(row=>row.kind==='symbol'&&row.reference.symbol==='CCC')!.id;
 drag(c,28+3*30+15,40);expect(symbolsOf(ui.props.book)).toEqual(['CCC','BBB','DDD','AAA']);
 // A press without movement is a click, not a move.
 const calls=ui.props.onChange.mock.calls.length;ui.row(c).onPointerDown({pointerId:2,button:0,clientY:70,currentTarget:{},target:{closest:()=>null}});ui.row(c).onPointerUp({pointerId:2});expect(ui.props.onChange.mock.calls.length).toBe(calls);
});

it('the export dialog writes the one-line TXT layout with ###Name entries when asked',async()=>{
 let book=addWatchList(createWatchBook([]),'L','Mine');book=addWatchMembers(book,'L',[{symbol:'AAA',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false}],id).book;book=insertWatchSection(book,'L','sec','Group',null);
 book=addWatchMembers(book,'L',[{symbol:'BBB',exchange:'NYSE',datasetId:null,dailyDatasetId:null,synthetic:false}],id).book;book=selectWatchList(book,'L');
 const exportData=vi.fn(async(_value:any)=>({ok:true,value:{fileName:'x.txt',bytes:1}}));vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn(),lv:{exportData}});
 const ui=setup(book);ui.label('Watchlist column menu').onClick();ui.item('import-export').onClick();
 const exportButton=()=>findAll(ui.render(),node=>node.type==='button'&&text(node)==='Export active list TXT')[0].props;
 const oneLine=()=>find(findAll(ui.render(),node=>node.type==='label'&&text(node).includes('Write TXT on one line')),(node:any)=>node.type==='input').props;
 expect(oneLine().checked).toBe(false);oneLine().onChange({target:{checked:true}});
 await exportButton().onClick();expect(exportData.mock.calls.at(-1)![0].text).toBe('NYSE:AAA,###Group,NYSE:BBB');
});
