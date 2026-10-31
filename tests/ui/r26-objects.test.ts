import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {ObjectTreePanel} from '../../src/ui/ObjectTreePanel';
import {chartMenuEntries} from '../../src/ui/ChartContextMenu';
import {drawingMenu,dropGroupTarget,rowButtonTargets} from '../../src/ui/object-tree-model';
import {objectTreeHarness,find,findAll,event} from './object-tree-panel-harness';

// Object tree groups (Ungroup, drag into and out of a group), bulk row buttons on a multi-selection, Cut and
// Paste from the tree, and the chart drawing menu's Cut, Paste and cited Visual order. Actual ObjectTreePanel handlers over the
// actual drawing-manager port and native Vela controller (object-tree-panel-harness.ts, SYNTHETIC). No DOM or packaged GUI claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
let disposers:Array<()=>void>=[];
afterEach(()=>{for(const dispose of disposers)dispose();disposers=[];});

const dataset={instrument:{id:'synthetic',symbol:'SYNTH',name:'SYNTHETIC fixture',exchange:'LOCAL',currency:'USD',assetClass:'stock' as const,tickSize:0.01,lotSize:1,timezone:'UTC'},resolution:'1D'};
async function mount(options:Parameters<typeof objectTreeHarness>[0]={},chartExtra:Record<string,unknown>={}){
 const h=await objectTreeHarness(options);disposers.push(h.dispose);
 const chart={...h.chart,...chartExtra};
 const props:any={chart,dataset,get indicators(){return h.indicators.port.list();},onDrawingsChanged:vi.fn(),onSelectionChange:vi.fn(),onError:vi.fn()};
 const render=()=>{hooks.cursor=0;return ObjectTreePanel({...props,indicators:props.indicators});};
 render();hooks.effects.map(effect=>effect());
 const rows=()=>findAll(render(),node=>node.props?.role==='treeitem');
 const row=(key:string)=>find(render(),node=>node.props?.['data-node-key']===key);
 const rowButton=(key:string,name:string)=>find(row(key),node=>node.type==='button'&&node.props['data-name']===name);
 const menuLabels=()=>findAll(render(),node=>node.props?.role==='menuitem').map(node=>node.props['aria-label']);
 const menuItem=(label:string)=>find(render(),node=>node.props?.role==='menuitem'&&node.props['aria-label']===label);
 const section=()=>find(render(),node=>node.type==='section');
 return {h,props,chart,render,rows,row,rowButton,menuLabels,menuItem,section};
}
const groupOf=(t:Awaited<ReturnType<typeof mount>>)=>t.h.manager.state().groups.map(group=>[group.name,[...group.memberIds].sort()]);
const drag=(t:Awaited<ReturnType<typeof mount>>,from:string,to:string,place:'before'|'after'='before')=>{
 const transfer={setData(){},effectAllowed:''};t.row(from).props.onDragStart({...event(),dataTransfer:transfer});
 const target=t.row(to),rect={top:0,height:38};target.props.onDrop({...event(),clientY:place==='after'?30:5,currentTarget:{getBoundingClientRect:()=>rect}});
};

describe('groups in the Object tree',()=>{
 it('a group row menu offers Ungroup; it dissolves the group as one manager step and selects the former members',async()=>{
  const t=await mount();t.h.manager.group(['line-a','line-b'],'Group 1');const id=t.h.manager.state().groups[0].id;
  t.row('group:'+id).props.onContextMenu(event());
  expect(t.menuLabels()).toEqual(['Ungroup','Rename','Visual order','Copy','Clone','Lock','Hide','Remove']);
  const before=t.props.onDrawingsChanged.mock.calls.length;t.menuItem('Ungroup').props.onClick();
  expect(t.h.manager.state().groups).toEqual([]);expect(t.props.onDrawingsChanged).toHaveBeenCalledTimes(before+1);
  expect(t.rows().map(node=>node.props['data-node-key'])).toEqual(['series','drawing:line-c','drawing:line-b','drawing:line-a']);
  expect(t.row('drawing:line-a').props['aria-selected']).toBe(true);expect(t.row('drawing:line-b').props['aria-selected']).toBe(true);
 });
 it('dragging a drawing onto a group row moves it into the group in one step',async()=>{
  const t=await mount();t.h.manager.group(['line-a'],'Group 1');const id=t.h.manager.state().groups[0].id;
  const before=t.props.onDrawingsChanged.mock.calls.length;
  t.row('drawing:line-c').props.onClick(event());drag(t,'drawing:line-c','group:'+id,'after');
  expect(groupOf(t)).toEqual([['Group 1',['line-a','line-c']]]);expect(t.props.onDrawingsChanged).toHaveBeenCalledTimes(before+1);
  expect(t.rows().find(node=>node.props['data-node-key']==='drawing:line-c')!.props['aria-level']).toBe(2);
 });
 it('dragging a member onto a top-level drawing takes it out of the group; the emptied group is dropped',async()=>{
  const t=await mount();t.h.manager.group(['line-a'],'Group 1');const id=t.h.manager.state().groups[0].id;
  t.row('drawing:line-a').props.onClick(event());drag(t,'drawing:line-a','drawing:line-c','after');
  expect(t.h.manager.state().groups).toEqual([]);expect(t.rows().some(node=>node.props['data-node-key']==='group:'+id)).toBe(false);
  // Placed directly behind line-c (front-most first): line-c, line-a, line-b.
  expect(t.rows().map(node=>node.props['data-node-key'])).toEqual(['series','drawing:line-c','drawing:line-a','drawing:line-b']);
 });
 it('dragging a member onto a member of another group moves it between groups',async()=>{
  const t=await mount();t.h.manager.group(['line-a'],'G1');t.h.manager.group(['line-b','line-c'],'G2');
  t.row('drawing:line-a').props.onClick(event());drag(t,'drawing:line-a','drawing:line-b');
  expect(groupOf(t)).toEqual([['G2',['line-a','line-b','line-c']]]);
 });
 it('model: the drop target group',()=>{
  expect(dropGroupTarget({kind:'group',id:'g',parentKey:null})).toBe('g');
  expect(dropGroupTarget({kind:'drawing',id:'a',parentKey:'group:g'})).toBe('g');
  expect(dropGroupTarget({kind:'drawing',id:'a',parentKey:null})).toBeNull();
 });
});

describe('multi-selection bulk row buttons',()=>{
 it('Lock and Hide on a row of a ctrl-click multi-selection act on every selected drawing, one step each',async()=>{
  const t=await mount();t.row('drawing:line-a').props.onClick(event());t.row('drawing:line-c').props.onClick(event({ctrlKey:true}));
  const before=t.props.onDrawingsChanged.mock.calls.length;
  t.rowButton('drawing:line-a','lock').props.onClick(event());
  expect(t.h.nativeRows().filter(row=>row.locked).map(row=>row.id).sort()).toEqual(['line-a','line-c']);
  t.rowButton('drawing:line-c','hide').props.onClick(event());
  expect(t.h.nativeRows().filter(row=>!row.visible).map(row=>row.id).sort()).toEqual(['line-a','line-c']);
  expect(t.props.onDrawingsChanged).toHaveBeenCalledTimes(before+2);expect(t.h.nativeRows().find(row=>row.id==='line-b')!.locked).toBe(false);
 });
 it('Remove on a row of a shift-click range removes the whole range in one manager call',async()=>{
  const t=await mount();t.row('drawing:line-c').props.onClick(event());t.row('drawing:line-b').props.onClick(event({shiftKey:true}));
  t.rowButton('drawing:line-b','remove').props.onClick(event());
  expect(t.h.nativeRows().map(row=>row.id)).toEqual(['line-a']);expect(t.h.calls.filter(call=>call.startsWith('remove'))).toEqual(['remove:line-c,line-b']);
 });
 it('a row outside the selection still acts on that row only; Hide on a selection with an indicator toggles it too',async()=>{
  const t=await mount({indicators:['volume']});const vol=t.h.ids[0];
  t.row('drawing:line-a').props.onClick(event());t.row('drawing:line-b').props.onClick(event({ctrlKey:true}));
  t.rowButton('drawing:line-c','lock').props.onClick(event());
  expect(t.h.nativeRows().filter(row=>row.locked).map(row=>row.id)).toEqual(['line-c']);
  t.row('study:'+vol).props.onClick(event({ctrlKey:true}));t.rowButton('drawing:line-a','hide').props.onClick(event());
  expect(t.h.indicators.port.list()[0].visible).toBe(false);expect(t.h.nativeRows().filter(row=>!row.visible).map(row=>row.id).sort()).toEqual(['line-a','line-b']);
  expect(rowButtonTargets({key:'x'},['x','y'])).toBe('selection');expect(rowButtonTargets({key:'z'},['x','y'])).toBe('row');expect(rowButtonTargets({key:'x'},['x'])).toBe('row');
 });
});

describe('Cut, Copy and Paste from the tree',()=>{
 it('the drawing menu lists Cut and Paste when the chart offers them; Cut and Paste reach the chart routes',async()=>{
  const cutDrawings=vi.fn(),pasteDrawings=vi.fn(),copyDrawings=vi.fn();let size=0;
  const t=await mount({},{cutDrawings,pasteDrawings,copyDrawings,clipboardSize:()=>size});
  t.row('drawing:line-a').props.onContextMenu(event());
  expect(t.menuLabels()).toEqual(['Create a group of drawings','Rename','Visual order','Copy','Cut','Paste','Clone','Lock','Hide','Remove']);
  expect(t.menuItem('Paste').props.disabled).toBe(true);expect(t.menuItem('Cut')['props']['aria-keyshortcuts']).toBe('Ctrl+X');
  t.menuItem('Cut').props.onClick();expect(cutDrawings).toHaveBeenCalledWith(['line-a']);
  size=1;t.row('drawing:line-b').props.onContextMenu(event());expect(t.menuItem('Paste').props.disabled).toBeFalsy();
  t.menuItem('Paste').props.onClick();expect(pasteDrawings).toHaveBeenCalledTimes(1);
 });
 it('Ctrl+C, Ctrl+X and Ctrl+V on the tree copy, cut and paste the selection',async()=>{
  const cutDrawings=vi.fn(),pasteDrawings=vi.fn(),copyDrawings=vi.fn();
  const t=await mount({},{cutDrawings,pasteDrawings,copyDrawings,clipboardSize:()=>1});
  t.row('drawing:line-a').props.onClick(event());t.row('drawing:line-b').props.onClick(event({ctrlKey:true}));
  const key=(k:string)=>t.section().props.onKeyDown({...event({ctrlKey:true}),key:k,altKey:false});
  // Tree order, front-most first.
  key('c');expect(copyDrawings).toHaveBeenCalledWith(['line-b','line-a']);
  key('x');expect(cutDrawings).toHaveBeenCalledWith(['line-b','line-a']);
  key('v');expect(pasteDrawings).toHaveBeenCalledTimes(1);
  expect(t.props.onDrawingsChanged).toHaveBeenCalledTimes(2);// cut and paste each publish once; copy writes nothing
 });
 it('model: Cut, Paste and Ungroup entries stay absent without their routes',()=>{
  const node={kind:'drawing' as const,locked:false,visible:true,renderable:true};
  expect(drawingMenu(node,true,{copy:true,clone:true,order:null}).map(item=>item.id)).toEqual(['group','rename','copy','clone','lock','hide','remove']);
  expect(drawingMenu({...node,kind:'group'},true,{copy:true,clone:true,order:null,ungroup:true}).map(item=>item.id)[0]).toBe('ungroup');
 });
});

describe('chart drawing menu',()=>{
 const snap=(ids:string[],controller:Record<string,unknown>)=>({entity:{kind:'drawing',ids,fingerprints:{}},controller,point:{price:null},instrument:{}}) as any;
 const yes=()=>true,all:any={'drawing-front':yes,'drawing-back':yes,'drawing-forward':yes,'drawing-backward':yes,'drawing-copy':yes,'drawing-cut':yes,'drawing-remove':yes,paste:yes,objects:yes};
 it('Visual order rows follow the cited order and a step that cannot move is not offered; Cut follows Copy',()=>{
  const free={drawingManager:{list:()=>[],orderState:()=>({front:false,back:false,forward:false,backward:false})}};
  expect(chartMenuEntries(snap(['a'],free),all).map(row=>row.label)).toEqual(['Copy','Cut','Bring to front','Send to back','Bring forward','Send backward','Remove']);
  const top={drawingManager:{list:()=>[],orderState:()=>({front:true,back:false,forward:true,backward:false})}};
  expect(chartMenuEntries(snap(['a'],top),all).map(row=>row.label)).toEqual(['Copy','Cut','Send to back','Send backward','Remove']);
 });
 it('the chart menu offers Paste (Ctrl + V) only while the clipboard holds drawings',()=>{
  const chart=(size:number)=>({entity:{kind:'chart'},controller:{clipboardSize:()=>size},point:{price:null},instrument:{}}) as any;
  expect(chartMenuEntries(chart(0),all).map(row=>row.label)).toEqual(['Drawing objects']);
  const rows=chartMenuEntries(chart(2),all);expect(rows.map(row=>row.label)).toEqual(['Drawing objects','Paste']);expect(rows[1].hint).toBe('Ctrl + V');
 });
});

describe('App wiring (source assertions, not UI evidence)',()=>{
 const app=readFileSync('src/ui/App.tsx','utf8');
 it('Ctrl+X reaches the cut route on the chart and elsewhere; the menu handlers exist',()=>{
  expect(app).toContain("clipKey==='x'&&owner==='router'");
  expect(app).toContain("chart.drawingUtility.cutSelection()");
  expect(app).toContain("'drawing-cut':drawingContextRun((controller,ids)=>{controller.cutDrawings(ids);");
  expect(app).toMatch(/paste:\(snapshot:ChartMenuSnapshot\)=>\{try\{snapshot\.controller\.pasteDrawings\(\);/);
 });
});
