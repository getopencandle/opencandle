import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ObjectTreePanel} from '../../src/ui/ObjectTreePanel';
import {objectTreeHarness,find,findAll,event} from './object-tree-panel-harness';

// Keyboard route of the Object tree context menu
// fact). Component-handler evidence on the actual drawing-manager port: the same deterministic hook mock
// as object-tree-panel.test.ts plus a tiny ref/focus simulation (ref callbacks run detach-then-attach,
// children first, like React's commit). There is no DOM here: real focus delivery in the packaged app is
// not claimed. SYNTHETIC fixtures.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
let disposers:Array<()=>void>=[];
afterEach(()=>{for(const dispose of disposers)dispose();disposers=[];});

const dataset={instrument:{id:'synthetic',symbol:'SYNTH',name:'SYNTHETIC fixture',exchange:'LOCAL',currency:'USD',assetClass:'stock' as const,tickSize:0.01,lotSize:1,timezone:'UTC'},resolution:'1D'};
const idOf=(node:any)=>node.props['data-node-key']??node.props['aria-label']??node.props['data-menu-id']??node.props.role??String(node.type);

async function mount(options:Parameters<typeof objectTreeHarness>[0]={},extra:Record<string,unknown>={}){
 const h=await objectTreeHarness(options);disposers.push(h.dispose);
 const props:any={chart:h.chart,dataset,get indicators(){return h.indicators.port.list();},onDrawingsChanged:vi.fn(),onSelectionChange:vi.fn(),onError:vi.fn(),...extra};
 const render=()=>{hooks.cursor=0;return ObjectTreePanel({...props,indicators:props.indicators});};
 render();hooks.effects.map(effect=>effect());
 // Fake document: elements persist per ancestor path; focus() records the active element and fires onFocus.
 const world={active:null as any},elements=new Map<string,any>();let previous:any[]=[];
 const commitOnce=()=>{
  const tree=render(),attach:Array<{node:any;path:string}>=[];
  const visit=(node:any,path:string)=>{if(Array.isArray(node))return node.forEach(child=>visit(child,path));if(!node?.props)return;const here=path+'/'+idOf(node);visit(node.props.children,here);if(typeof node.props.ref==='function')attach.push({node,path:here});};
  visit(tree,'');
  for(const node of previous)node.props.ref(null); // unmounted refs detach too
  previous=attach.map(entry=>entry.node);
  for(const {node,path} of attach){let el=elements.get(path);if(!el){el={name:path.split('/').slice(-1)[0],path,focus(){world.active=el;el.node?.props.onFocus?.();}};elements.set(path,el);}el.node=node;node.props.ref(el);}
  return tree;
 };
 const settle=()=>{for(let i=0;i<4;i++)commitOnce();return render();};
 settle();
 const row=(key:string)=>find(render(),node=>node.props?.['data-node-key']===key);
 const menuItems=()=>findAll(render(),node=>node.props?.role==='menuitem'&&node.props['data-menu-id']);
 const item=(label:string)=>find(render(),node=>node.props?.role==='menuitem'&&node.props['aria-label']===label);
 const menus=()=>findAll(render(),node=>node.props?.role==='menu');
 const focused=()=>world.active?.name??null;
 const press=(label:string,key:string)=>{const e=event({key});item(label).props.onKeyDown(e);settle();return e;};
 /** Click the row (focus on it), then the keyboard contextmenu event. */
 const openMenu=(key:string)=>{row(key).props.onClick(event());settle();world.active=[...elements.values()].find(el=>el.name===key)??null;row(key).props.onContextMenu(event());settle();};
 return {h,props,render,settle,row,item,menuItems,menus,focused,press,openMenu,world};
}
const nativeById=(h:Awaited<ReturnType<typeof objectTreeHarness>>,id:string)=>h.nativeRows().find(item=>item.id===id)!;
const enabledLabels=(t:Awaited<ReturnType<typeof mount>>)=>t.menuItems().filter(node=>!node.props.disabled).map(node=>node.props['aria-label']);
const selectedKeys=(t:Awaited<ReturnType<typeof mount>>)=>findAll(t.render(),node=>node.props?.role==='treeitem'&&node.props['aria-selected']).map(node=>node.props['data-node-key']);

describe('Object tree context menu keyboard route',()=>{
 it('opening the menu from a row focuses the first enabled menu item and gives the menu proper roles',async()=>{
  const t=await mount();t.openMenu('drawing:line-a');
  expect(t.menus().map(node=>node.props['aria-label'])).toEqual(['Object tree menu']);
  expect(t.focused()).toBe('Create a group of drawings');
  expect(t.menuItems().filter(node=>node.props.tabIndex===0).map(node=>node.props['aria-label'])).toEqual(['Create a group of drawings']);
  expect(t.menuItems().every(node=>node.props.role==='menuitem')).toBe(true);
 });
 it('row -> context menu -> arrows -> Enter locks the drawing (Lock is reachable by keyboard); focus returns to the row',async()=>{
  const t=await mount();t.openMenu('drawing:line-a');
  const key=t.press('Create a group of drawings','ArrowDown');expect(key.preventDefault).toHaveBeenCalled();
  expect(t.focused()).toBe('Rename');expect(t.menuItems().filter(node=>node.props.tabIndex===0).map(node=>node.props['aria-label'])).toEqual(['Rename']);
  t.press('Rename','ArrowDown');expect(t.focused()).toBe('Visual order');
  // Disabled rows (Move to; Copy without a copy route) are skipped by the arrows.
  t.press('Visual order','ArrowDown');expect(t.focused()).toBe('Clone');
  t.press('Clone','ArrowDown');expect(t.focused()).toBe('Lock');
  t.press('Lock','Enter');
  expect(nativeById(t.h,'line-a').locked).toBe(true);
  expect(t.menus()).toEqual([]);expect(t.focused()).toBe('drawing:line-a');
 });
 it('Space activates the focused item too',async()=>{
  const t=await mount();t.openMenu('drawing:line-a');t.press('Create a group of drawings','ArrowDown');t.press('Rename','ArrowDown');t.press('Visual order','ArrowDown');t.press('Clone','ArrowDown');t.press('Lock','ArrowDown');expect(t.focused()).toBe('Hide');
  t.press('Hide',' ');expect(nativeById(t.h,'line-a').visible).toBe(false);expect(t.menus()).toEqual([]);
 });
 it('Escape closes the menu and returns focus to the row it was opened from',async()=>{
  const t=await mount();t.openMenu('drawing:line-b');expect(t.focused()).toBe('Create a group of drawings');
  t.press('Create a group of drawings','Escape');
  expect(t.menus()).toEqual([]);expect(t.focused()).toBe('drawing:line-b');
 });
 it('Tab closes the menu and returns focus to the row',async()=>{
  const t=await mount();t.openMenu('drawing:line-b');t.press('Create a group of drawings','ArrowDown');
  const e=t.press('Rename','Tab');expect(e.preventDefault).toHaveBeenCalled();
  expect(t.menus()).toEqual([]);expect(t.focused()).toBe('drawing:line-b');
 });
 it('arrow keys do not move the tree selection while the menu is open',async()=>{
  const t=await mount();t.openMenu('drawing:line-b');
  expect(selectedKeys(t)).toEqual(['drawing:line-b']);const selectCalls=t.h.calls.filter(call=>call.startsWith('select')).length;
  // The item handler consumes the arrow; and an arrow that reaches the panel anyway is ignored while the menu is open.
  t.press('Create a group of drawings','ArrowDown');t.press('Rename','ArrowUp');
  const e=event({key:'ArrowDown'});t.render().props.onKeyDown(e);
  expect(e.preventDefault).not.toHaveBeenCalled();
  expect(selectedKeys(t)).toEqual(['drawing:line-b']);expect(t.h.calls.filter(call=>call.startsWith('select')).length).toBe(selectCalls);
 });
 it('with the menu closed the arrows still move the tree selection',async()=>{
  const t=await mount();t.row('drawing:line-c').props.onClick(event());
  t.render().props.onKeyDown(event({key:'ArrowDown'}));
  expect(selectedKeys(t)).toEqual(['drawing:line-b']);
 });
 it('SMALLS2 1028: ArrowDown/ArrowUp move focus with the selection; Home/End select and focus the first/last row',async()=>{
  const t=await mount();const keys=findAll(t.render(),node=>node.props?.role==='treeitem').map(node=>node.props['data-node-key']);
  t.row('drawing:line-c').props.onClick(event());t.settle();
  const down=event({key:'ArrowDown'});t.render().props.onKeyDown(down);t.settle();expect(down.preventDefault).toHaveBeenCalled();
  expect(selectedKeys(t)).toEqual(['drawing:line-b']);expect(t.focused()).toBe('drawing:line-b');
  t.render().props.onKeyDown(event({key:'ArrowUp'}));t.settle();expect(t.focused()).toBe('drawing:line-c');
  const end=event({key:'End'});t.render().props.onKeyDown(end);t.settle();expect(end.preventDefault).toHaveBeenCalled();
  expect(selectedKeys(t)).toEqual([keys.at(-1)]);expect(t.focused()).toBe(keys.at(-1));
  t.render().props.onKeyDown(event({key:'Home'}));t.settle();expect(selectedKeys(t)).toEqual([keys[0]]);expect(t.focused()).toBe(keys[0]);
 });
 it('ArrowDown/ArrowUp wrap, Home/End jump, and disabled items are skipped',async()=>{
  const t=await mount({indicators:['rsi']});const id=t.h.ids[0];t.openMenu('study:'+id);
  const all=t.menuItems().map(node=>node.props['aria-label']),enabled=enabledLabels(t);
  expect(enabled.length).toBeGreaterThan(2);expect(enabled.length).toBeLessThan(all.length); // fixture really has disabled items
  expect(t.focused()).toBe(enabled[0]);
  for(let i=1;i<=enabled.length;i++){t.press(t.focused()!,'ArrowDown');expect(t.focused()).toBe(enabled[i%enabled.length]);}
  t.press(t.focused()!,'ArrowUp');expect(t.focused()).toBe(enabled.at(-1));
  t.press(t.focused()!,'Home');expect(t.focused()).toBe(enabled[0]);
  t.press(t.focused()!,'End');expect(t.focused()).toBe(enabled.at(-1));
 });
 it('submenus: ArrowRight and Enter open and focus the first item, ArrowLeft closes back to the trigger, Enter runs the item',async()=>{
  const move=vi.fn();const t=await mount({indicators:['rsi']},{onIndicatorMove:move});const id=t.h.ids[0];t.openMenu('study:'+id);
  while(t.focused()!=='Move to')t.press(t.focused()!,'ArrowDown');
  expect(t.item('Move to').props['aria-haspopup']).toBe('menu');expect(t.item('Move to').props['aria-expanded']).toBe(false);
  t.press('Move to','ArrowRight');
  expect(t.item('Move to').props['aria-expanded']).toBe(true);expect(t.menus().map(node=>node.props['aria-label'])).toEqual(['Object tree menu','Move to']);
  expect(t.focused()).toBe('New pane above');
  t.press('New pane above','ArrowDown');expect(t.focused()).toBe('New pane below');t.press('New pane below','ArrowDown');expect(t.focused()).toBe('New pane above');
  t.press('New pane above','ArrowLeft');
  expect(t.item('Move to').props['aria-expanded']).toBe(false);expect(t.menus().map(node=>node.props['aria-label'])).toEqual(['Object tree menu']);expect(t.focused()).toBe('Move to');
  t.press('Move to','Enter');expect(t.focused()).toBe('New pane above');
  t.press('New pane above','Escape'); // closes one level only
  expect(t.focused()).toBe('Move to');expect(t.menus()).toHaveLength(1);
  t.press('Move to','Enter');t.press('New pane above','ArrowDown');t.press('New pane below','Enter');
  expect(move).toHaveBeenCalledWith(expect.objectContaining({id}),'below');expect(t.menus()).toEqual([]);
 });
 it('Remove from the keyboard leaves focus on a remaining row',async()=>{
  const t=await mount();t.openMenu('drawing:line-b');
  while(t.focused()!=='Remove')t.press(t.focused()!,'ArrowDown');
  t.press('Remove','Enter');
  expect(t.h.nativeRows().map(item=>item.id).sort()).toEqual(['line-a','line-c']);expect(t.menus()).toEqual([]);
  expect(String(t.focused()).startsWith('drawing:')||t.focused()==='series').toBe(true);expect(t.focused()).not.toBe('drawing:line-b');
 });
 it('mouse behaviour is unchanged: hover opens a submenu and click runs the item',async()=>{
  const move=vi.fn();const t=await mount({indicators:['rsi']},{onIndicatorMove:move});const id=t.h.ids[0];
  t.row('study:'+id).props.onContextMenu(event());
  t.item('Move to').props.onMouseEnter();expect(t.item('Move to').props['aria-expanded']).toBe(true);
  t.item('New pane above').props.onClick();expect(move).toHaveBeenCalledWith(expect.objectContaining({id}),'above');expect(t.menus()).toEqual([]);
 });
});
