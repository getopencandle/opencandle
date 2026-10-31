import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {Modal} from '../../src/ui/Modal';
import {activeWatchList,addWatchList,createWatchBook,insertWatchSection,referenceFromDataset,selectWatchList,type WatchBook} from '../../src/watchlists/model';
import {addWatchMembers,setWatchFlags,watchListMembers} from '../../src/watchlists/membership';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';

// Actual Panel handlers with controlled hooks. No DOM, focus, paint or packaged executable evidence.
// Watchlist live panel: live quotes from background feeds and the plain over-cap note. SYNTHETIC data; controlled hooks, no DOM.
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
beforeEach(()=>{vi.useFakeTimers();hooks.cells=[];hooks.cursor=0;hooks.effects.clear();vi.stubGlobal('document',{querySelector:()=>null});vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});});
afterEach(()=>{for(const cleanup of hooks.effects.values())cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
const ET=(h:number,m=0)=>Date.UTC(2026,9,21,h+4,m)/1000,NYM=(d:number)=>Date.UTC(2026,9,d,4)/1000;
function live(symbol:string,resolution:string,bars:Array<[number,number]>):BarDataset{const base=fixtureDataset('GME',2);return{...base,resolution,instrument:{...base.instrument,id:'US:'+symbol,symbol,name:'SYNTHETIC '+symbol,exchange:'US',assetClass:'stock',timezone:'America/New_York',currency:'USD'},provenance:{...base.provenance,providerId:'alpaca-iex',providerName:'SYNTHETIC live',datasetId:`live:alpaca-iex:${symbol}:${resolution}`,fixture:false,session:'unknown',state:'ready',delaySeconds:0},bars:bars.map(([time,close])=>({time,open:close,high:close,low:close,close,volume:3}))};}
it('a row on a live feed no chart streams shows the background quote, follows new snapshots, and an over-cap row says NO LIVE',()=>{
 const gme=live('GME','1m',[[ET(9,30),24],[ET(10),26.5]]),spy=live('SPY','1m',[[ET(9,30),580]]),gmeDaily=live('GME','1D',[[NYM(20),25],[NYM(21),26]]);
 let n=0;const book=addWatchMembers(createWatchBook([]),createWatchBook([]).lists[0].id,[referenceFromDataset(gme),referenceFromDataset(spy)],()=>'w'+ ++n).book;
 const rowIds=activeWatchList(book).rows.map(row=>row.id);
 const ui=setup(book,[],{quoteDatasets:[gme,gmeDaily],liveNotes:new Map([['US:SPY',{text:'NO LIVE',title:'Not streaming: SYNTHETIC cap title'}]])});
 const before=text(ui.cells(rowIds[0]));expect(before).toContain('26.5');expect(before).toContain('+6%');
 const badge=find(ui.render(),node=>node.props?.['data-wl-live-note']!==undefined);expect(text(badge)).toBe('NO LIVE');expect(badge.props.title).toBe('Not streaming: SYNTHETIC cap title');
 expect(find(ui.row(rowIds[1]).children,node=>node.props?.['data-wl-live-note']!==undefined)).not.toBeNull();
 expect(find(ui.row(rowIds[0]).children,node=>node.props?.['data-wl-live-note']!==undefined)).toBeNull();
 ui.props.quoteDatasets=[live('GME','1m',[[ET(9,30),24],[ET(10),26.5],[ET(10,1),27.25]]),gmeDaily];
 expect(text(ui.cells(rowIds[0]))).toContain('27.25');expect(text(ui.cells(rowIds[0]))).toContain('+9%');
 ui.props.liveNotes=new Map();expect(find(ui.render(),node=>node.props?.['data-wl-live-note']!==undefined)).toBeNull();
});
