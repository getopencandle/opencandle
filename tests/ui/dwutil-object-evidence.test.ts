import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ObjectTreePanel} from '../../src/ui/ObjectTreePanel';
import {find,findAll,event,text} from './object-tree-panel-harness';
import {realChart} from './indicator-real-port-harness';
import {dwutilObjectFixture,type DwutilObjectFixture} from './dwutil-object-harness';

// evidence for .OBJECT.{SELECT,LOCK,UNLOCK,HIDE,SHOW,DELETE,BRING_TO_FRONT
// SEND_TO_BACK,UNDO,REDO} through the real routes: the drawing-manager port, the actual
// ObjectTreePanel handlers (deterministic hook mock) and the actual native controller.
// Each test asserts: exactly the target rows change, one history step, undo then redo,
// save then restore keeps the value, unrelated rows/groups/templates are byte-identical.
// Component-handler evidence only; no DOM, packaged GUI, focus or reference comparison.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
let disposers:Array<()=>void>=[];
afterEach(()=>{for(const dispose of disposers)dispose();disposers=[];});

const dataset={instrument:{id:'synthetic',symbol:'SYNTH',name:'SYNTHETIC fixture',exchange:'LOCAL',currency:'USD',assetClass:'stock' as const,tickSize:0.01,lotSize:1,timezone:'UTC'},resolution:'1D'};
async function mount(){
 const fx=await dwutilObjectFixture();disposers.push(fx.dispose);
 const indicators=realChart(),subscribers=new Set<()=>void>();fx.subscribe(()=>{for(const callback of [...subscribers])callback();});
 let retired=false;
 const chart:any={drawingManager:fx.manager,captureDrawingManagerOwner:()=>{const assert=()=>{if(retired)throw Error('SYNTHETIC drawing manager source changed.');};return assert;},onDrawingsChanged:(callback:()=>void)=>{subscribers.add(callback);return()=>{subscribers.delete(callback);};},onDrawingSelection:(callback:(ids:string[])=>void)=>fx.native.on('drawing:selected',({ids}:{ids:string[]})=>callback(ids)),drawings:fx.facade,indicators:indicators.port,chart:indicators.host.chart,drawingCatalog:()=>[{type:'trendline',label:'Trend Line'}],duplicateDrawings:vi.fn()};
 const props:any={chart,dataset,get indicators(){return indicators.port.list();},onDrawingsChanged:vi.fn(),onSelectionChange:vi.fn(),onError:vi.fn()};
 const render=()=>{hooks.cursor=0;return ObjectTreePanel({...props,indicators:props.indicators});};
 render();hooks.effects.map(effect=>effect());
 const row=(key:string)=>find(render(),node=>node.props?.['data-node-key']===key);
 const rowButton=(key:string,name:string)=>find(row(key),node=>node.type==='button'&&node.props['data-name']===name);
 const menuItem=(label:string)=>find(render(),node=>node.props?.role==='menuitem'&&node.props['aria-label']===label);
 const alert=()=>{const found=findAll(render(),node=>node.props?.role==='alert');return found.length?text(found[0]):'';};
 return{fx,props,render,row,rowButton,menuItem,alert};
}
/** Group and template metadata plus the untouched row, so "unrelated byte-identical" is meaningful. */
function seed(fx:DwutilObjectFixture){const group=fx.manager.group(['line-c'],'Keep');const template=fx.manager.saveTemplate('line-c','Keep look');return{group,template};}
const stable=(fx:DwutilObjectFixture,ids:string[])=>({rows:fx.json(ids.map(id=>fx.row(id))),book:fx.json(fx.doc().lvDrawingManager)});
const same=(fx:DwutilObjectFixture,before:ReturnType<typeof stable>,ids:string[])=>{expect(fx.json(ids.map(id=>fx.row(id)))).toBe(before.rows);expect(fx.json(fx.doc().lvDrawingManager)).toBe(before.book);};
const nativeRow=(fx:DwutilObjectFixture,id:string)=>fx.nativeRows().find(row=>row.id===id)!;
/** Steps taken after seeding are measured from this baseline. */
const baseline=(fx:DwutilObjectFixture)=>fx.steps();

describe('OBJECT.SELECT',()=>{
 it('clicking a row selects exactly that drawing, mirrors to the chart and writes no history',async()=>{
  const t=await mount(),fx=t.fx;seed(fx);const start=baseline(fx),before=stable(fx,['line-a','line-c']);
  t.row('drawing:line-b').props.onClick(event());
  expect(fx.native.controller.selectedIds).toEqual(['line-b']);expect(t.row('drawing:line-b').props['aria-selected']).toBe(true);expect(t.row('drawing:line-a').props['aria-selected']).toBe(false);
  expect(fx.steps()).toBe(start);same(fx,before,['line-a','line-c']);
  expect(fx.manager.select(['line-a','line-c'])).toEqual({selectedIds:['line-a','line-c'],unavailableIds:[]});expect([...fx.native.controller.selectedIds].sort()).toEqual(['line-a','line-c']);expect(fx.steps()).toBe(start);
  expect(fx.json(fx.saved().map(row=>row.id))).toBe(fx.json(['line-a','line-b','line-c']));
 });
});

describe.each([
 {leaf:'LOCK',field:'locked',set:true,before:false,button:'lock',expectLabel:'Unlock',undoText:'lock objects'},
 {leaf:'HIDE',field:'visible',set:false,before:true,button:'hide',expectLabel:'Show',undoText:'hide objects'},
])('DW.OBJECT.$leaf',({field,set,before:initial,button,expectLabel})=>{
 it('row button changes exactly the target row in one history step, with undo then redo and save/restore',async()=>{
  const t=await mount(),fx=t.fx;seed(fx);const start=baseline(fx),untouched=['line-b','line-c'],snapshot=stable(fx,untouched);
  const rowBefore=fx.json(fx.row('line-a'));
  t.rowButton('drawing:line-a',button).props.onClick(event());
  expect(nativeRow(fx,'line-a')[field as 'locked']).toBe(set);expect(fx.row('line-a')[field]).toBe(set);expect(t.rowButton('drawing:line-a',button).props['aria-label']).toBe(expectLabel);
  expect(fx.steps()).toBe(start+1);expect(fx.transactions()).toBe(1+2);// two seeding transactions precede the action
  same(fx,snapshot,untouched);
  expect(fx.json(fx.saved().find(row=>row.id==='line-a'))).toBe(fx.json(fx.row('line-a')));expect((fx.saved().find(row=>row.id==='line-a') as any)[field]).toBe(set);
  fx.undo();expect(fx.json(fx.row('line-a'))).toBe(rowBefore);expect((nativeRow(fx,'line-a') as any)[field]).toBe(initial);same(fx,snapshot,untouched);
  fx.redo();expect(fx.row('line-a')[field]).toBe(set);expect((nativeRow(fx,'line-a') as any)[field]).toBe(set);same(fx,snapshot,untouched);
 });
 it('manager bulk route changes only the chosen rows in a single transaction',async()=>{
  const fx=await dwutilObjectFixture();disposers.push(fx.dispose);seed(fx);const start=baseline(fx),snapshot=stable(fx,['line-c']),transactions=fx.transactions();
  fx.manager.set(['line-a','line-b'],{[field]:set});
  expect(fx.transactions()).toBe(transactions+1);expect(fx.steps()).toBe(start+1);
  expect(['line-a','line-b'].map(id=>fx.row(id)[field])).toEqual([set,set]);expect(fx.calls.filter(call=>call.startsWith('update')).at(-1)).toBe('update:line-a,line-b');same(fx,snapshot,['line-c']);
  fx.undo();expect(['line-a','line-b'].map(id=>fx.row(id)[field])).toEqual([initial,initial]);fx.redo();expect(['line-a','line-b'].map(id=>fx.row(id)[field])).toEqual([set,set]);
 });
});

describe.each([
 {leaf:'UNLOCK',field:'locked',on:true,off:false,button:'lock',label:'Lock',undoText:'unlock objects'},
 {leaf:'SHOW',field:'visible',on:false,off:true,button:'hide',label:'Hide',undoText:'show objects'},
])('DW.OBJECT.$leaf',({field,on,off,button,label})=>{
 it('context-menu route restores exactly the target row in one history step with undo then redo and save/restore',async()=>{
  const t=await mount(),fx=t.fx;seed(fx);
  t.rowButton('drawing:line-a',button).props.onClick(event());// put the row in the opposite state first
  const start=fx.steps(),untouched=['line-b','line-c'],snapshot=stable(fx,untouched),rowBefore=fx.json(fx.row('line-a'));
  expect((nativeRow(fx,'line-a') as any)[field]).toBe(on);
  t.row('drawing:line-a').props.onContextMenu(event());
  // The context menu names the action for the row's current state (SOT#row.contextTitles).
  const opposite=label==='Lock'?'Unlock':'Show';t.menuItem(opposite).props.onClick();
  expect((nativeRow(fx,'line-a') as any)[field]).toBe(off);expect(fx.row('line-a')[field]).toBe(off);
  expect(fx.steps()).toBe(start+1);same(fx,snapshot,untouched);
  expect((fx.saved().find(row=>row.id==='line-a') as any)[field]).toBe(off);
  fx.undo();expect(fx.json(fx.row('line-a'))).toBe(rowBefore);expect((nativeRow(fx,'line-a') as any)[field]).toBe(on);
  fx.redo();expect((nativeRow(fx,'line-a') as any)[field]).toBe(off);same(fx,snapshot,untouched);
 });
 it('manager dialog route (bulk set) restores several rows at once',async()=>{
  const fx=await dwutilObjectFixture();disposers.push(fx.dispose);seed(fx);fx.manager.set(['line-a','line-b'],{[field]:on});
  const start=fx.steps(),snapshot=stable(fx,['line-c']);
  fx.manager.set(['line-a','line-b'],{[field]:off});
  expect(['line-a','line-b'].map(id=>(nativeRow(fx,id) as any)[field])).toEqual([off,off]);expect(fx.steps()).toBe(start+1);same(fx,snapshot,['line-c']);
  fx.undo();expect(['line-a','line-b'].map(id=>(nativeRow(fx,id) as any)[field])).toEqual([on,on]);fx.redo();expect(['line-a','line-b'].map(id=>(nativeRow(fx,id) as any)[field])).toEqual([off,off]);
 });
});

describe('OBJECT.DELETE',()=>{
 it('row Remove, the Delete key and the manager each remove exactly the targets in one step, prune groups, and undo restores them',async()=>{
  const t=await mount(),fx=t.fx;seed(fx);fx.manager.group(['line-a','line-b'],'Pair');const start=fx.steps(),untouched=['line-c'],snapshot=stable(fx,untouched);
  const rowBefore=fx.json(fx.row('line-a'));
  t.rowButton('drawing:line-a','remove').props.onClick(event());
  expect(fx.nativeRows().map(row=>row.id).sort()).toEqual(['line-b','line-c']);expect(fx.rows().map(row=>row.id).sort()).toEqual(['line-b','line-c']);
  expect(fx.manager.state().groups.map(group=>group.memberIds)).toEqual([['line-c'],['line-b']]);expect(fx.steps()).toBe(start+1);same(fx,{rows:snapshot.rows,book:fx.json(fx.doc().lvDrawingManager)},untouched);
  fx.undo();expect(fx.nativeRows().map(row=>row.id).sort()).toEqual(['line-a','line-b','line-c']);expect(fx.json(fx.row('line-a'))).toBe(rowBefore);expect(fx.manager.state().groups.find(group=>group.name==='Pair')!.memberIds).toEqual(['line-a','line-b']);
  fx.redo();expect(fx.nativeRows().map(row=>row.id).sort()).toEqual(['line-b','line-c']);
  expect(fx.saved().map(row=>row.id).sort()).toEqual(['line-b','line-c']);
  // Delete key on the tree removes the selected drawing in one more step.
  t.row('drawing:line-b').props.onClick(event());const before=fx.steps();t.render().props.onKeyDown(event({key:'Delete'}));
  expect(fx.nativeRows().map(row=>row.id)).toEqual(['line-c']);expect(fx.steps()).toBe(before+1);
  // Manager route.
  const manager=await dwutilObjectFixture();disposers.push(manager.dispose);const first=manager.steps();manager.manager.remove(['line-b','line-c']);
  expect(manager.nativeRows().map(row=>row.id)).toEqual(['line-a']);expect(manager.steps()).toBe(first+1);manager.undo();expect(manager.nativeRows()).toHaveLength(3);manager.redo();expect(manager.nativeRows()).toHaveLength(1);
 });
});

describe.each([
 {leaf:'BRING_TO_FRONT',position:'front' as const,target:'line-a'},
 {leaf:'SEND_TO_BACK',position:'back' as const,target:'line-c'},
])('DW.OBJECT.$leaf',({position,target})=>{
 it('manager order moves exactly the target in one step; undo then redo; save/restore keeps z',async()=>{
  const fx=await dwutilObjectFixture();disposers.push(fx.dispose);seed(fx);const start=fx.steps(),z=(id:string)=>nativeRow(fx,id).zIndex as number,order=()=>['line-a','line-b','line-c'].sort((a,b)=>z(b)-z(a));
  const others=['line-a','line-b','line-c'].filter(id=>id!==target),before=Object.fromEntries(others.map(id=>[id,z(id)])),orderBefore=order();
  fx.manager.order([target],position);
  if(position==='front')expect(order()[0]).toBe(target);else expect(order().at(-1)).toBe(target);
  expect(fx.row(target).zIndex).toBe(z(target));expect(fx.steps()).toBe(start+1);
  for(const id of others)expect(z(id)).toBe(before[id]);// unrelated stacking values are unchanged
  expect((fx.saved().find(row=>row.id===target) as any).zIndex).toBe(z(target));
  fx.undo();expect(order()).toEqual(orderBefore);fx.redo();expect(order()[position==='front'?0:2]).toBe(target);
 });
 it('object-tree drag reorder reaches the same manager route in a single transaction per call',async()=>{
  const t=await mount(),fx=t.fx;seed(fx);const dataTransfer={effectAllowed:'',setData:vi.fn()},start=fx.steps();
  t.row('drawing:line-a').props.onDragStart(event({dataTransfer}));
  t.row('drawing:line-c').props.onDragOver(event({currentTarget:{getBoundingClientRect:()=>({top:0,height:38})},clientY:30}));
  t.row('drawing:line-c').props.onDrop(event({currentTarget:{getBoundingClientRect:()=>({top:0,height:38})},clientY:30}));
  expect(fx.calls.filter(call=>call.startsWith('front'))).toEqual(['front:line-a','front:line-c']);expect(fx.steps()).toBeGreaterThan(start);
 });
});

describe('OBJECT.UNDO and .OBJECT.REDO',()=>{
 it('every drawing action above is one reversible workspace step: chain of lock, hide and remove undoes and redoes in order',async()=>{
  const fx=await dwutilObjectFixture();disposers.push(fx.dispose);seed(fx);const start=fx.steps(),snapshots=[fx.json(fx.rows())];
  fx.manager.set(['line-a'],{locked:true});snapshots.push(fx.json(fx.rows()));
  fx.manager.set(['line-b'],{visible:false});snapshots.push(fx.json(fx.rows()));
  fx.manager.remove(['line-c']);snapshots.push(fx.json(fx.rows()));
  expect(fx.steps()).toBe(start+3);
  for(let step=2;step>=0;step--){fx.undo();expect(fx.json(fx.rows())).toBe(snapshots[step]);}
  expect(fx.nativeRows().map(row=>row.id).sort()).toEqual(['line-a','line-b','line-c']);
  for(let step=1;step<=3;step++){fx.redo();expect(fx.json(fx.rows())).toBe(snapshots[step]);}
  expect(fx.history.status().redo).toBe(0);
  expect(fx.json(fx.saved())).toBe(fx.json(fx.rows()));
 });
});
