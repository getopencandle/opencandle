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

// A pointer moving onto "Move to" opens its submenu on hover, and the click
// that follows must keep it open (it used to toggle it shut), so "New pane above" is reachable by pointer. SYNTHETIC fixtures.
describe('Bugfix K OT-MOVETO: hover then click on a submenu item keeps the submenu open',()=>{
 it('hover opens Move to and the click that follows leaves it open with New pane above reachable',async()=>{
  const move=vi.fn();const t=await mount({indicators:['rsi']},{onIndicatorMove:move});const id=t.h.ids[0];
  t.row('study:'+id).props.onContextMenu(event());t.settle();
  t.item('Move to').props.onMouseEnter();t.settle();
  expect(t.item('Move to').props['aria-expanded']).toBe(true);
  t.item('Move to').props.onClick();t.settle();
  expect(t.item('Move to').props['aria-expanded']).toBe(true);
  expect(t.menus().map(node=>node.props['aria-label'])).toEqual(['Object tree menu','Move to']);
  t.item('New pane above').props.onClick();
  expect(move).toHaveBeenCalledWith(expect.objectContaining({id}),'above');expect(t.menus()).toEqual([]);
 });
 it('a click on Move to without a prior hover opens the submenu, and a second click keeps it open',async()=>{
  const t=await mount({indicators:['rsi']},{onIndicatorMove:vi.fn()});const id=t.h.ids[0];
  t.row('study:'+id).props.onContextMenu(event());t.settle();
  t.item('Move to').props.onClick();t.settle();
  expect(t.item('Move to').props['aria-expanded']).toBe(true);
  t.item('Move to').props.onClick();t.settle();
  expect(t.item('Move to').props['aria-expanded']).toBe(true);
 });
});
