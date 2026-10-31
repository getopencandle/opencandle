import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {SymbolDetails} from '../../src/ui/SymbolDetails';
import {Modal} from '../../src/ui/Modal';
import {createWatchBook} from '../../src/watchlists/model';
const hooks=vi.hoisted(()=>({scope:'parent',stores:new Map<string,{cells:any[];cursor:number;effects:Map<number,()=>void>}>(),writes:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react'),same=(a:any[],b:any[])=>a?.length===b?.length&&a.every((value,index)=>Object.is(value,b[index]));
 const store=()=>{let value=hooks.stores.get(hooks.scope);if(!value){value={cells:[],cursor:0,effects:new Map()};hooks.stores.set(hooks.scope,value);}return value;};
 return{...actual,useState:(initial:any)=>{const s=store(),index=s.cursor++;if(!(index in s.cells))s.cells[index]=typeof initial==='function'?initial():initial;return[s.cells[index],(next:any)=>{hooks.writes++;s.cells[index]=typeof next==='function'?next(s.cells[index]):next;}];},useRef:(initial:any)=>{const s=store(),index=s.cursor++;if(!(index in s.cells))s.cells[index]={current:initial};return s.cells[index];},useMemo:(factory:()=>any,deps:any[])=>{const s=store(),index=s.cursor++;if(!(index in s.cells)||!same(s.cells[index].deps,deps))s.cells[index]={deps,value:factory()};return s.cells[index].value;},useEffect:(effect:()=>void|(()=>void),deps:any[])=>{const s=store(),index=s.cursor++;if(!(index in s.cells)||!same(s.cells[index],deps)){s.effects.get(index)?.();s.cells[index]=deps;const off=effect();if(off)s.effects.set(index,off);}}};
});
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,test);if(result)return result;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function renderIn<T>(name:string,render:()=>T):T{hooks.scope=name;const old=hooks.stores.get(name);if(old)old.cursor=0;return render();}
beforeEach(()=>{hooks.scope='parent';hooks.stores.clear();hooks.writes=0;vi.useFakeTimers();vi.stubGlobal('document',{querySelector:()=>null});vi.stubGlobal('window',{addEventListener(){},removeEventListener(){}});});
afterEach(()=>{for(const store of hooks.stores.values())for(const cleanup of store.effects.values())cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
function setup(){
 let props:any={book:createWatchBook(),datasets:[],onOpen:vi.fn(()=>true),onOpenAll:vi.fn(()=>true),onNotes:vi.fn(()=>true),onChange:vi.fn((next:any)=>{props={...props,book:next};return true;})};
 let element:any=null;
 const parent=()=>renderIn('parent',()=>WatchlistPanel(props));
 const row=(id='initial-row-0')=>find(parent(),node=>node.type==='tr'&&node.key===id);
 row().props.onClick({ctrlKey:true,metaKey:false,shiftKey:false,altKey:false,detail:1});
 const child=()=>{expect(element,'selected row should expose actual SymbolDetails').not.toBeNull();return renderIn('details',()=>SymbolDetails(element.props));};
 const details=()=>{element=find(parent(),node=>node.type===SymbolDetails);return child();};
 return{parent,row,details,child,props:()=>props};
}
it('actual parent memo preserves the expanded details session across its own accepted collapse publication',()=>{
 const h=setup();find(h.details(),node=>node.type==='button'&&text(node)==='Expand details').props.onClick();
 const opening=find(h.details(),node=>node.type===Modal);expect(opening).not.toBeNull();
 find(opening,node=>node.type==='button'&&node.props['aria-label']==='Collapse Price snapshot').props.onClick();
 expect(h.props().onChange).toHaveBeenCalledTimes(1);expect(h.props().book.detailBlocks.collapsed).toContain('summary');
 const after=find(h.details(),node=>node.type===Modal);expect(after,'own preference save must not mint a new synthetic source identity and close expanded view').not.toBeNull();
 expect(find(after,node=>node.type==='button'&&node.props['aria-label']==='Expand Price snapshot')).not.toBeNull();
});
it('retained actual detail note handler cannot use a different same-event watchlist selection before React renders',()=>{
 const h=setup(),old=find(h.details(),node=>node.type==='button'&&text(node)==='Add note');
 h.row('initial-row-1').props.onClick({ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,detail:1});const writes=hooks.writes;old.props.onClick();
 expect(h.props().onNotes).not.toHaveBeenCalled();expect(hooks.writes).toBe(writes);
});
it('retained canceled Customize submit cannot publish or add an old error after child-only rerender',()=>{
 const h=setup();find(h.details(),node=>node.type==='button'&&text(node)==='Customize blocks').props.onClick();
 const modal=find(h.child(),node=>node.type===Modal),form=find(modal,node=>node.type==='form');
 find(modal,node=>node.type==='button'&&text(node)==='Cancel').props.onClick();expect(find(h.child(),node=>node.type===Modal)).toBeNull();const writes=hooks.writes;
 form.props.onSubmit({preventDefault(){}});expect(h.props().onChange).not.toHaveBeenCalled();expect(hooks.writes).toBe(writes);
});
it('a replaced Customize submit cannot write an error into a new expanded session with the same selected source',()=>{
 const h=setup();find(h.details(),node=>node.type==='button'&&text(node)==='Customize blocks').props.onClick();
 const form=find(h.child(),node=>node.type==='form');find(h.child(),node=>node.type==='button'&&text(node)==='Expand details').props.onClick();
 expect(find(h.child(),node=>node.type===Modal).props.title).toMatch(/GME details/);const writes=hooks.writes;form.props.onSubmit({preventDefault(){}});
 expect(h.props().onChange).not.toHaveBeenCalled();expect(hooks.writes).toBe(writes);expect(text(find(h.child(),node=>node.type===Modal))).not.toMatch(/changed|replaced/);
});
it('rejected actual parent preference publication that reentrantly changes selection cannot add an old child error',()=>{
 const h=setup();find(h.details(),node=>node.type==='button'&&text(node)==='Customize blocks').props.onClick();const form=find(h.child(),node=>node.type==='form');let writes=-1;
 h.props().onChange.mockImplementation(()=>{h.row('initial-row-1').props.onClick({ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,detail:1});writes=hooks.writes;return false;});
 form.props.onSubmit({preventDefault(){}});expect(h.props().onChange).toHaveBeenCalledTimes(1);expect(hooks.writes).toBe(writes);expect(h.props().book.detailBlocks).toBeUndefined();
});
