import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {createWatchBook,type WatchBook} from '../../src/watchlists/model';

// The watchlist menus' check glyphs (a tick or a dot before checkable rows) are visual only. A menuitemradio or
// menuitemcheckbox is named by its label ("Blue", "Sort ascending"), and its state is aria-checked, so the packaged flow can find
// the flag colour by name (scripts/exe/flows/watchlist.mjs: getByRole('menuitemradio', {name: /^Blue/})). Actual Panel handlers
// with controlled hooks (the wlcore-panel.test.ts harness). No DOM, focus, paint or packaged executable evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:new Map<number,()=>void>()}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const same=(a:any[],b:any[])=>a?.length===b?.length&&a.every((v,i)=>Object.is(v,b[i]));return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useMemo:(factory:()=>any,deps:any[])=>{const i=hooks.cursor++;if(!(i in hooks.cells)||!same(hooks.cells[i].deps,deps))hooks.cells[i]={deps,value:factory()};return hooks.cells[i].value;},
 useEffect:(effect:()=>void|(()=>void),deps:any[])=>{const i=hooks.cursor++;if(!(i in hooks.cells)||!same(hooks.cells[i],deps)){hooks.effects.get(i)?.();hooks.cells[i]=deps;const cleanup=effect();if(cleanup)hooks.effects.set(i,cleanup);}}
};});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
/** Accessible name from content: aria-hidden subtrees and the disabled-reason <small> do not count when aria-label is absent. */
const accessibleText=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(accessibleText).join(''):node?.props?(node.props['aria-hidden']===true||node.props['aria-hidden']==='true'?'':accessibleText(node.props.children)):'';
const nameOf=(button:any)=>(button.props['aria-label']??accessibleText(button.props.children)).replace(/\s+/g,' ').trim();
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const match=find(child,test);if(match)return match;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>findAll(child,test,out));else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}return out;}
const mouse=(extra={})=>({ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,detail:1,clientX:40,clientY:50,preventDefault:vi.fn(),stopPropagation:vi.fn(),...extra});
function setup(book:WatchBook=createWatchBook(['GME','SPY','QQQ'])){
 hooks.cells=[];hooks.cursor=0;
 const props:any={book,datasets:[],onChange:vi.fn((next:WatchBook)=>{props.book=next;return true;}),onOpen:vi.fn(()=>true),onOpenAll:vi.fn(()=>true)};
 const render=()=>{hooks.cursor=0;return WatchlistPanel(props);};
 const row=(id:string)=>find(render(),node=>node.type==='tr'&&node.key===id).props;
 const menu=()=>find(render(),node=>node.props?.role==='menu');
 const items=()=>findAll(menu(),node=>node.type==='button');
 return{props,render,row,menu,items};
}
beforeEach(()=>{vi.useFakeTimers();hooks.cells=[];hooks.cursor=0;hooks.effects.clear();vi.stubGlobal('document',{querySelector:()=>null});vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});});
afterEach(()=>{for(const cleanup of hooks.effects.values())cleanup();vi.useRealTimers();vi.unstubAllGlobals();});

it('row menu flag colours are menuitemradio rows named by their colour, with the state in aria-checked and the glyph hidden',()=>{
 const ui=setup();
 ui.row('initial-row-1').onClick(mouse());ui.row('initial-row-1').onContextMenu(mouse());
 const radios=ui.items().filter(node=>node.props.role==='menuitemradio');
 expect(radios.map(nameOf).map(name=>name.replace(/ ?Alt\+Enter$/,''))).toEqual(['Red','Orange','Green','Blue','Purple','Cyan','Pink']);
 const blue=radios.find(node=>/^Blue/.test(nameOf(node)))!;
 expect(blue).toBeTruthy();expect(blue.props['aria-checked']).toBe(false);
 // The glyph is still painted for sighted users.
 expect(text(blue.props.children)).toMatch(/^· Blue/);
 blue.props.onClick();
 expect(ui.props.book.flags.map((row:any)=>row.reference.symbol+':'+row.color)).toEqual(['SPY:blue']);
 ui.row('initial-row-1').onContextMenu(mouse());
 const checked=ui.items().find(node=>node.props.role==='menuitemradio'&&/^Blue/.test(nameOf(node)))!;
 expect(checked.props['aria-checked']).toBe(true);expect(text(checked.props.children)).toMatch(/^✓ Blue/);expect(nameOf(checked)).toMatch(/^Blue ?Alt\+Enter$/);
});
it('column menu checkable rows are named by their label too',()=>{
 const ui=setup();
 const header=find(ui.render(),node=>node.type==='th');header.props.onContextMenu(mouse());
 const names=ui.items().filter(node=>node.props.role==='menuitemradio'||node.props.role==='menuitemcheckbox').map(nameOf);
 expect(names).toContain('Sort ascending');expect(names.some(name=>name.startsWith('Symbol'))).toBe(true);
 expect(names.every(name=>!/^[✓·]/.test(name))).toBe(true);
});
