import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {Modal} from '../../src/ui/Modal';
import {activeWatchList,addWatchList,createWatchBook,insertWatchSection,referenceFromDataset,selectWatchList,setWatchColumnVisible,type WatchBook} from '../../src/watchlists/model';
import {addWatchMembers,setWatchFlags,watchListMembers} from '../../src/watchlists/membership';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';

// Watchlist: type-to-add and the Last price tick flash. Harness copied from r34-watchlist-panel. SYNTHETIC data only.
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

it('typing a letter in the watchlist opens Add symbols with that letter', ()=>{
 const view=setup();const event=keyEvent('g');view.render().props.onKeyDown(event);
 expect(event.preventDefault).toHaveBeenCalled();expect(event.stopPropagation).toHaveBeenCalled();
 const tree=view.render(),input=find(tree,node=>node.props?.['aria-label']==='Search to add symbols');
 expect(input).toBeTruthy();expect(input.props.value).toBe('G');
});
it('Ctrl and Alt letters do not open Add symbols', ()=>{
 const view=setup();
 for(const [k,extra] of [['g',{ctrlKey:true}],['g',{altKey:true}],['g',{metaKey:true}]] as const)view.render().props.onKeyDown(keyEvent(k,extra));
 expect(find(view.render(),node=>node.props?.['aria-label']==='Search to add symbols')).toBeNull();
});
// Shifted letters, digits and flagged lists open Add symbols too, as in the reference watchlist.
it('Shift letters, digits and a flagged list open Add symbols with the typed character', ()=>{
 for(const [k,extra,seed] of [['W',{shiftKey:true},'W'],['5',{},'5']] as const){
  const view=setup(),event=keyEvent(k,extra);view.render().props.onKeyDown(event);
  expect(event.stopPropagation).toHaveBeenCalled();
  expect(find(view.render(),node=>node.props?.['aria-label']==='Search to add symbols')?.props.value).toBe(seed);
 }
 const flagged=setup(selectWatchList(createWatchBook(['GME']),'flag:red'));flagged.render().props.onKeyDown(keyEvent('a'));
 expect(find(flagged.render(),node=>node.props?.['aria-label']==='Search to add symbols')?.props.value).toBe('A');
});
it('the Add symbols search field upper-cases typed text', ()=>{
 const view=setup();view.render().props.onKeyDown(keyEvent('a'));
 find(view.render(),node=>node.props?.['aria-label']==='Search to add symbols').props.onChange({target:{value:'Amd'}});
 expect(find(view.render(),node=>node.props?.['aria-label']==='Search to add symbols').props.value).toBe('AMD');
});
it('the panel host is marked for the App type-to-add route', ()=>{
 expect(setup().render().props['data-lv-type-to-add']).toBe('');
});
