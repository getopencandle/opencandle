import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {activeWatchList,addWatchList,createWatchBook,selectWatchList,type WatchBook} from '../../src/watchlists/model';

// In "Open watchlist", the "Search watchlists" field opens the first match on a plain Enter only. Alt+Enter
// (the global flag shortcut), Ctrl+Enter and Cmd+Enter leave the dialog and the active list alone. Controlled hooks, no DOM.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:new Map<number,()=>void>()}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const same=(a:any[],b:any[])=>a?.length===b?.length&&a.every((v,i)=>Object.is(v,b[i]));return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useMemo:(factory:()=>any,deps:any[])=>{const i=hooks.cursor++;if(!(i in hooks.cells)||!same(hooks.cells[i].deps,deps))hooks.cells[i]={deps,value:factory()};return hooks.cells[i].value;},
 useEffect:(effect:()=>void|(()=>void),deps:any[])=>{const i=hooks.cursor++;if(!(i in hooks.cells)||!same(hooks.cells[i],deps)){hooks.effects.get(i)?.();hooks.cells[i]=deps;const cleanup=effect();if(cleanup)hooks.effects.set(i,cleanup);}}
};});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const match=find(child,test);if(match)return match;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
const keyEvent=(key:string,extra={})=>({key,nativeEvent:{isComposing:false},target:{closest:()=>null},preventDefault:vi.fn(),stopPropagation:vi.fn(),altKey:false,shiftKey:false,ctrlKey:false,metaKey:false,...extra});
function setup(book:WatchBook){
 hooks.cells=[];hooks.cursor=0;
 const props:any={book,datasets:[],onChange:vi.fn((next:WatchBook)=>{props.book=next;return true;}),onOpen:vi.fn(()=>true),onOpenAll:vi.fn(()=>true),onNotes:vi.fn(()=>true)};
 const render=()=>{hooks.cursor=0;return WatchlistPanel(props);};
 const button=(value:string)=>{const found=find(render(),node=>node.type==='button'&&(node.props['aria-label']===value||text(node.props.children)===value));if(!found)throw Error('Missing button '+value);return found.props;};
 const menuItem=(id:string)=>{const found=find(find(render(),node=>node.props?.role==='menu'),node=>node.type==='button'&&node.key===id);if(!found)throw Error('Missing menu item '+id);return found.props;};
 const search=()=>find(render(),node=>node.type==='input'&&node.props['aria-label']==='Search watchlists')?.props??null;
 const chooser=()=>find(render(),node=>node.props?.title==='Open watchlist');
 return{props,render,button,menuItem,search,chooser};
}
beforeEach(()=>{vi.useFakeTimers();hooks.cells=[];hooks.cursor=0;hooks.effects.clear();vi.stubGlobal('document',{querySelector:()=>null});vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});});
afterEach(()=>{for(const cleanup of hooks.effects.values())cleanup();vi.useRealTimers();vi.unstubAllGlobals();});

it('Alt+Enter, Ctrl+Enter and Cmd+Enter in Search watchlists do not open a list; a plain Enter still does',()=>{
 const base=createWatchBook(['GME']),book=selectWatchList(addWatchList(base,'other','Other list'),base.activeId);
 const ui=setup(book),startId=activeWatchList(ui.props.book).id;
 expect(startId).not.toBe('other');
 ui.button('Open watchlists').onClick();ui.menuItem('open-list').onClick();
 expect(ui.chooser(),'the Open watchlist dialog is open').toBeTruthy();
 ui.search().onChange({target:{value:'Other'}});
 for(const modifier of [{altKey:true},{ctrlKey:true},{metaKey:true}]){
  const event=keyEvent('Enter',modifier);
  ui.search().onKeyDown(event);
  expect(event.preventDefault,'left to other shortcuts: '+JSON.stringify(modifier)).not.toHaveBeenCalled();
  expect(ui.props.onChange).not.toHaveBeenCalled();
  expect(ui.chooser(),'the dialog stays open after '+JSON.stringify(modifier)).toBeTruthy();
  expect(activeWatchList(ui.props.book).id).toBe(startId);
 }
 const plain=keyEvent('Enter');
 ui.search().onKeyDown(plain);
 expect(plain.preventDefault).toHaveBeenCalled();
 expect(ui.props.onChange).toHaveBeenCalledTimes(1);
 expect(activeWatchList(ui.props.book).name).toBe('Other list');
 expect(ui.chooser(),'a plain Enter opens the match and closes the dialog').toBeNull();
});
