import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ObjectTreePanel} from '../../src/ui/ObjectTreePanel';
import {placeObjectTreeDropdown,placeObjectTreeMenu,placeObjectTreeSubmenu,OBJECT_TREE_MENU_MARGIN} from '../../src/ui/object-tree-menu-placement';
import {objectTreeHistoryHarness} from './object-tree-history-harness';
import {find,findAll,event} from './object-tree-panel-harness';

// IFACE4 A3/A4 (a plain press emptied the tree selection before the toolbar/menu click) and A5
// (the Move to submenu opened outside the window). Actual ObjectTreePanel handlers, actual adapter
// drawing manager + native Vela DrawingController + actual createWorkspaceHistory (see
// object-tree-history-harness.ts). The press is modeled in browser order (see press below).
// Deterministic hook mock; no DOM, focus, layout or packaged GUI claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
let disposers:Array<()=>void>=[];
afterEach(()=>{for(const dispose of disposers)dispose();disposers=[];});

const dataset={instrument:{id:'synthetic',symbol:'SYNTH',name:'SYNTHETIC fixture',exchange:'LOCAL',currency:'USD',assetClass:'stock' as const,tickSize:0.01,lotSize:1,timezone:'UTC'},resolution:'1D'};
async function mount(options:Parameters<typeof objectTreeHistoryHarness>[0]={}){
 const h=await objectTreeHistoryHarness(options);disposers.push(h.dispose);
 const props:any={chart:h.chart,dataset,get indicators(){return h.port.list();},onError:vi.fn()};
 const render=()=>{hooks.cursor=0;return ObjectTreePanel({...props,indicators:props.indicators});};
 render();hooks.effects.forEach(effect=>effect());
 const row=(key:string)=>find(render(),node=>node.props?.['data-node-key']===key);
 const selected=()=>findAll(render(),node=>node.props?.role==='treeitem'&&node.props['aria-selected']===true).map(node=>node.props['data-node-key']);
 const groupButton=()=>find(render(),node=>node.props?.['data-name']==='group-button');
 const menuItem=(label:string)=>find(render(),node=>node.props?.role==='menuitem'&&node.props['aria-label']===label);
 const menu=(label:string)=>find(render(),node=>node.props?.role==='menu'&&node.props['aria-label']===label);
 /** Path of rendered elements from the panel root to the first node matching `target`. */
 const pathTo=(target:(node:any)=>boolean)=>{let found:any[]|null=null;const visit=(node:any,trail:any[])=>{if(found)return;if(Array.isArray(node)){for(const child of node)visit(child,trail);return;}if(!node?.props)return;const next=[...trail,node];if(target(node)){found=next;return;}visit(node.props.children,next);};visit(render(),[]);if(!found)throw Error('Press target missing');return found as any[];};
 /** One pointer press in browser order: React capture handlers root to target, bubble handlers target to
  * root, then, unless propagation was stopped, the document listener of the pinned renderer's drawing bar
  * (UserDrawingController.onPopupDismissed, chunk-UNUVPQFW.js:16980-16985): a press without Shift/Ctrl/Cmd
  * clears the drawing selection through the intent it emits, {kind:'select',ids:[]}. */
 const press=(target:(node:any)=>boolean,extra:Record<string,unknown>={})=>{
  const path=pathTo(target);let stopped=false;const e={...event(extra),button:0,...extra,stopPropagation:()=>{stopped=true;}};
  for(const node of path){if(stopped)break;node.props.onPointerDownCapture?.(e);}
  for(const node of [...path].reverse()){if(stopped)break;node.props.onPointerDown?.(e);}
  if(!stopped&&!(e.shiftKey||e.ctrlKey||e.metaKey))h.native.controller.onIntent({kind:'select',ids:[]});
 };
 const click=(key:string,extra:Record<string,unknown>={})=>{press(node=>node.props?.['data-node-key']===key,extra);row(key).props.onClick(event(extra));};
 /** Exactly one history step; undo restores, redo reapplies. */
 const oneStep=(action:()=>void,check:(phase:'after'|'undone'|'redone')=>void)=>{
  const before=h.committed(),steps=h.history.status().undo;action();
  expect(h.history.status().undo).toBe(steps+1);expect(props.onError).not.toHaveBeenCalled();const after=h.committed();check('after');
  expect(h.restore('undo')).toBe(true);expect(h.committed()).toEqual(before);check('undone');
  expect(h.restore('redo')).toBe(true);expect(h.committed()).toEqual(after);check('redone');
 };
 return {h,props,render,row,selected,groupButton,menuItem,menu,press,click,oneStep};
}
const groupMembers=(t:Awaited<ReturnType<typeof mount>>)=>t.h.adapter.manager.state().groups.map(group=>[...group.memberIds].sort());

describe('IFACE4 A3/A4: presses inside the tree keep its selection',()=>{
 it('A3: pressing the toolbar Create a group keeps both selected drawings and groups them in one undo step',async()=>{
  const t=await mount();t.click('drawing:line-a');t.click('drawing:line-c',{ctrlKey:true});
  expect(t.selected().sort()).toEqual(['drawing:line-a','drawing:line-c']);expect(t.groupButton().props.disabled).toBe(false);
  t.oneStep(()=>{t.press(node=>node.props?.['data-name']==='group-button');expect(t.selected().sort()).toEqual(['drawing:line-a','drawing:line-c']);expect(t.groupButton().props.disabled).toBe(false);t.groupButton().props.onClick();},
   phase=>{expect(groupMembers(t)).toEqual(phase==='undone'?[]:[['line-a','line-c']]);expect(t.h.nativeRows().map(row=>row.id).sort()).toEqual(['line-a','line-b','line-c']);});
 });
 it('A4: a plain right-click on one of two selected drawings keeps both; the menu groups both in one undo step',async()=>{
  const t=await mount();t.click('drawing:line-a');t.click('drawing:line-b',{ctrlKey:true});
  t.oneStep(()=>{t.press(node=>node.props?.['data-node-key']==='drawing:line-b',{button:2});t.row('drawing:line-b').props.onContextMenu(event());expect(t.selected().sort()).toEqual(['drawing:line-a','drawing:line-b']);
   t.press(node=>node.props?.role==='menuitem'&&node.props['aria-label']==='Create a group of drawings');t.menuItem('Create a group of drawings').props.onClick();},
   phase=>expect(groupMembers(t)).toEqual(phase==='undone'?[]:[['line-a','line-b']]));
 });
 it('a plain press on another row still replaces the selection, and the chart selection follows',async()=>{
  const t=await mount();t.click('drawing:line-a');t.click('drawing:line-c',{ctrlKey:true});t.click('drawing:line-b');
  expect(t.selected()).toEqual(['drawing:line-b']);expect(t.h.native.selection()).toEqual(['line-b']);
 });
});

describe('IFACE4 A5: menus stay inside the window',()=>{
 const viewport={width:1424,height:800},m=OBJECT_TREE_MENU_MARGIN;
 it('the context menu flips to the left of the pointer when its right side lacks room (receipt: menu x 1228 to 1479 in a 1424 px window)',()=>{
  expect(placeObjectTreeMenu({x:1228,y:300},{width:251,height:420},viewport)).toEqual({left:977,top:300});
  expect(placeObjectTreeMenu({x:200,y:700},{width:251,height:420},viewport)).toEqual({left:200,top:280});
  expect(placeObjectTreeMenu({x:100,y:100},{width:251,height:420},viewport)).toEqual({left:100,top:100});
  // Neither side fits: clamp inside the window, never past an edge.
  expect(placeObjectTreeMenu({x:150,y:150},{width:251,height:420},{width:300,height:500})).toEqual({left:300-m-251,top:500-m-420});
  expect(placeObjectTreeMenu({x:5,y:5},{width:400,height:600},{width:300,height:500})).toEqual({left:m,top:m});
 });
 it('the Move to submenu opens left of its parent menu when the right side lacks room (receipt: submenu x 1353 to 1573), stays right when it fits, and clamps vertically',()=>{
  const item={left:1133,right:1353,top:500,bottom:532};
  expect(placeObjectTreeSubmenu(item,{width:220,height:76},viewport)).toEqual({side:'left',left:913,top:494});
  expect(placeObjectTreeSubmenu({left:300,right:551,top:40,bottom:72},{width:220,height:76},viewport)).toEqual({side:'right',left:551,top:34});
  expect(placeObjectTreeSubmenu({left:300,right:551,top:780,bottom:812},{width:220,height:76},viewport).top).toBe(800-m-76);
  // Neither side fits: the side with more room, clamped inside the window.
  expect(placeObjectTreeSubmenu({left:100,right:250,top:10,bottom:42},{width:220,height:76},{width:400,height:300})).toEqual({side:'right',left:400-m-220,top:m});
  expect(placeObjectTreeSubmenu({left:150,right:300,top:10,bottom:42},{width:220,height:76},{width:400,height:300})).toEqual({side:'left',left:m,top:m});
 });
 it('a toolbar menu under a right-edge button aligns its right edge with the button',()=>{
  expect(placeObjectTreeDropdown({left:1380,right:1418,top:0,bottom:38},{width:220,height:76},viewport)).toEqual({left:1198,top:38});
  expect(placeObjectTreeDropdown({left:20,right:58,top:0,bottom:38},{width:220,height:76},viewport)).toEqual({left:20,top:38});
  expect(placeObjectTreeDropdown({left:20,right:58,top:760,bottom:798},{width:220,height:76},viewport)).toEqual({left:20,top:684});
 });
 /** A mounted menu box: fixed (style left/top = client px) or absolute (offset inside its parent). */
 const box=(rect:{left:number;top:number;width:number;height:number},parent?:{left:number;top:number;right:number;bottom:number},style:Record<string,string>={})=>{
  const element:any={style:{...style},parentElement:parent?{getBoundingClientRect:()=>({...parent,width:parent.right-parent.left,height:parent.bottom-parent.top})}:null,ownerDocument:{defaultView:{innerWidth:viewport.width+17,innerHeight:viewport.height},documentElement:{clientWidth:viewport.width,clientHeight:viewport.height}},
   offsetLeft:parent?rect.left-parent.left:rect.left,offsetTop:parent?rect.top-parent.top:rect.top};
  element.getBoundingClientRect=()=>{const left=parseFloat(element.style.left),top=parseFloat(element.style.top),x=Number.isFinite(left)?(parent?parent.left+left:left):rect.left,y=Number.isFinite(top)?(parent?parent.top+top:top):rect.top;return {left:x,top:y,right:x+rect.width,bottom:y+rect.height,width:rect.width,height:rect.height};};
  return element;
 };
 it('the rendered context menu, its Move to submenu and the toolbar Move to menu apply that placement through their refs',async()=>{
  const t=await mount({indicators:['volume']}),key='study:'+t.h.ids[0];
  t.row(key).props.onContextMenu(event({clientX:1228,clientY:300}));
  const root=box({left:1228,top:300,width:251,height:420},undefined,{left:'1228px',top:'300px'});t.menu('Object tree menu').props.ref(root);
  expect(root.style).toMatchObject({left:'977px',top:'300px'});t.menu('Object tree menu').props.ref(root);expect(root.style.left).toBe('977px');
  t.menuItem('Move to').props.onMouseEnter();
  const sub=box({left:1228,top:494,width:220,height:76},{left:977,right:1228,top:500,bottom:532});t.menu('Move to').props.ref(sub);
  expect(sub.getBoundingClientRect()).toMatchObject({left:757,right:977,top:494});expect(sub.style).toMatchObject({left:'-220px',top:'-6px'});
  expect(t.menuItem('New pane above').props.disabled).toBeFalsy();
  t.render().props.onKeyDown(event({key:'Escape'}));expect(findAll(t.render(),node=>node.props?.role==='menu')).toEqual([]);t.row(key).props.onClick(event());
  find(t.render(),node=>node.props?.['data-name']==='move-to-button').props.onClick();
  const drop=box({left:1380,top:38,width:220,height:76},{left:1380,right:1418,top:0,bottom:38});t.menu('Move to').props.ref(drop);
  expect(drop.getBoundingClientRect()).toMatchObject({left:1198,right:1418,top:38});
 });
});
