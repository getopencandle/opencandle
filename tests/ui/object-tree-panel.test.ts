import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ObjectTreePanel} from '../../src/ui/ObjectTreePanel';
import {objectTreeHarness,text,find,findAll,event} from './object-tree-panel-harness';

// Actual ObjectTreePanel handlers on the actual drawing-manager port + native Vela drawing
// controller and the actual indicator port (see object-tree-panel-harness.ts). Deterministic
// hook mock; no DOM, focus, keyboard delivery or packaged GUI claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
let disposers:Array<()=>void>=[];
afterEach(()=>{for(const dispose of disposers)dispose();disposers=[];});

const dataset={instrument:{id:'synthetic',symbol:'SYNTH',name:'SYNTHETIC fixture',exchange:'LOCAL',currency:'USD',assetClass:'stock' as const,tickSize:0.01,lotSize:1,timezone:'UTC'},resolution:'1D'};
async function mount(options:Parameters<typeof objectTreeHarness>[0]={},extra:Record<string,unknown>={}){
 const h=await objectTreeHarness(options);disposers.push(h.dispose);
 const props:any={chart:h.chart,dataset,get indicators(){return h.indicators.port.list();},onDrawingsChanged:vi.fn(),onSelectionChange:vi.fn(),onError:vi.fn(),...extra};
 const render=()=>{hooks.cursor=0;return ObjectTreePanel({...props,indicators:props.indicators});};
 render();const cleanups=hooks.effects.map(effect=>effect());
 const rows=()=>findAll(render(),node=>node.props?.role==='treeitem');
 const row=(key:string)=>find(render(),node=>node.props?.['data-node-key']===key);
 const rowButton=(key:string,name:string)=>find(row(key),node=>node.type==='button'&&node.props['data-name']===name);
 const toolbar=(label:string)=>find(render(),node=>node.type==='button'&&node.props.className==='lv-ot-toolbar-button'&&node.props['aria-label']===label);
 const menuItem=(label:string)=>find(render(),node=>node.props?.role==='menuitem'&&node.props['aria-label']===label);
 const alert=()=>{const found=findAll(render(),node=>node.props?.role==='alert');return found.length?text(found[0]):'';};
 return {h,props,render,rows,row,rowButton,toolbar,menuItem,alert,cleanups};
}
const nativeById=(h:Awaited<ReturnType<typeof objectTreeHarness>>,id:string)=>h.nativeRows().find(row=>row.id===id)!;

describe('rows and hover buttons',()=>{
 it('series, indicator and drawing rows in order with per-kind buttons',async()=>{
  const t=await mount({indicators:['volume']});
  const rows=t.rows();
  expect(rows.map(node=>[node.props['data-node-kind'],node.props['aria-label']])).toEqual([['series','SYNTH · LOCAL, 1D'],['study','Vol'],['drawing','Trend Line'],['drawing','Trend Line'],['drawing','Trend Line']]);
  const buttons=(key:string)=>findAll(t.row(key),node=>node.type==='button'&&node.props['data-name']).map(node=>node.props['aria-label']);
  expect(buttons('series')).toEqual(['Hide']);
  expect(buttons('study:'+t.h.ids[0])).toEqual(['Hide','Remove']);
  expect(buttons('drawing:line-a')).toEqual(['Lock','Hide','Remove']);
  expect(t.rowButton('series','hide').props.disabled).toBe(true);
  // Native drawings start with ascending draw-order keys: the newest is front-most.
  expect(rows.slice(2).map(node=>node.props['data-node-key'])).toEqual(['drawing:line-c','drawing:line-b','drawing:line-a']);
 });
 it('drawing Lock, Hide and Remove act through the drawing manager port and reach the native controller',async()=>{
  const t=await mount();
  t.rowButton('drawing:line-a','lock').props.onClick(event());
  expect(nativeById(t.h,'line-a').locked).toBe(true);expect(t.rowButton('drawing:line-a','lock').props['aria-label']).toBe('Unlock');expect(t.rowButton('drawing:line-a','lock').props['aria-pressed']).toBe(true);
  t.rowButton('drawing:line-a','hide').props.onClick(event());
  expect(nativeById(t.h,'line-a').visible).toBe(false);expect(t.rowButton('drawing:line-a','hide').props['aria-label']).toBe('Show');expect(t.row('drawing:line-a').props.className).toContain('is-hidden');
  t.rowButton('drawing:line-a','hide').props.onClick(event());expect(nativeById(t.h,'line-a').visible).toBe(true);
  t.rowButton('drawing:line-b','remove').props.onClick(event());
  expect(t.h.nativeRows().map(row=>row.id).sort()).toEqual(['line-a','line-c']);
  expect(t.rows().map(node=>node.props['data-node-key'])).toEqual(['series','drawing:line-c','drawing:line-a']);
  expect(t.h.calls.filter(call=>!call.startsWith('select'))).toEqual(['update:line-a','update:line-a','update:line-a','remove:line-b']);
  expect(t.props.onDrawingsChanged).toHaveBeenCalledTimes(4);
 });
 it('indicator Hide and Remove use the real indicator port by default',async()=>{
  const t=await mount({indicators:['volume','sma']});const [vol,sma]=t.h.ids;
  t.rowButton('study:'+vol,'hide').props.onClick(event());
  expect(t.h.indicators.port.list().find(row=>row.id===vol)!.visible).toBe(false);
  expect(t.rowButton('study:'+vol,'hide').props['aria-label']).toBe('Show');
  t.rowButton('study:'+sma,'remove').props.onClick(event());
  expect(t.h.indicators.port.list().map(row=>row.id)).toEqual([vol]);
 });
 it('an owner-checked indicator route replaces the default port call',async()=>{
  const route=vi.fn();const t=await mount({indicators:['volume']},{onIndicatorAction:route});
  t.rowButton('study:'+t.h.ids[0],'hide').props.onClick(event());
  expect(route).toHaveBeenCalledWith(expect.objectContaining({id:t.h.ids[0]}),'toggle');expect(t.h.indicators.port.list()[0].visible).toBe(true);
 });
 it('series Hide calls the provided series route only',async()=>{
  const route=vi.fn();const t=await mount({},{onSeriesVisibility:route,seriesVisible:true});
  expect(t.rowButton('series','hide').props.disabled).toBe(false);t.rowButton('series','hide').props.onClick(event());expect(route).toHaveBeenCalledWith(false);
 });
 it('a retired chart source refuses the action and reports it',async()=>{
  const t=await mount();t.h.retire();t.rowButton('drawing:line-a','lock').props.onClick(event());
  expect(nativeById(t.h,'line-a').locked).toBe(false);expect(t.alert()).toContain('source changed');expect(t.props.onError).toHaveBeenCalled();
 });
});

describe('selection sync with the chart',()=>{
 it('clicking a drawing row selects it on the native chart; chart selection selects the row',async()=>{
  const t=await mount();
  t.row('drawing:line-b').props.onClick(event());
  expect(t.h.native.controller.selectedIds).toEqual(['line-b']);expect(t.row('drawing:line-b').props['aria-selected']).toBe(true);
  t.h.facade.select(['line-c']);
  expect(t.row('drawing:line-c').props['aria-selected']).toBe(true);expect(t.row('drawing:line-b').props['aria-selected']).toBe(false);
  t.row('drawing:line-a').props.onClick(event({ctrlKey:true}));
  expect([...t.h.native.controller.selectedIds].sort()).toEqual(['line-a','line-c']);
  t.row('series').props.onClick(event());
  expect(t.h.native.controller.selectedIds).toEqual([]);expect(t.row('series').props['aria-selected']).toBe(true);
  expect(t.props.onSelectionChange).toHaveBeenLastCalledWith(['series']);
 });
 it('shift-click selects a range of rows',async()=>{
  const t=await mount();t.row('drawing:line-c').props.onClick(event());t.row('drawing:line-a').props.onClick(event({shiftKey:true}));
  expect([...t.h.native.controller.selectedIds].sort()).toEqual(['line-a','line-b','line-c']);
 });
 it('Delete removes the selected drawings; series rows are never removed',async()=>{
  const t=await mount();t.row('drawing:line-c').props.onClick(event());t.row('series').props.onClick(event({ctrlKey:true}));
  t.render().props.onKeyDown(event({key:'Delete'}));
  expect(t.h.nativeRows().map(row=>row.id).sort()).toEqual(['line-a','line-b']);expect(t.row('series')).toBeTruthy();
 });
});

describe('toolbar, groups, rename and menus',()=>{
 it('toolbar order and enablement; Create a group groups the selection through the manager',async()=>{
  const t=await mount();
  const toolbar=findAll(t.render(),node=>node.props?.className==='lv-ot-toolbar-button').map(node=>[node.props['data-name'],node.props['aria-label'],node.props.disabled]);
  expect(toolbar).toEqual([['group-button','Create a group of drawings',true],['copy-clone-button','Clone, Copy',true],['move-to-button','Move to',true],['manage-drawings-button','Manage layout drawings',true]]);
  t.row('drawing:line-c').props.onClick(event());t.row('drawing:line-a').props.onClick(event({ctrlKey:true}));
  expect(t.toolbar('Create a group of drawings').props.disabled).toBe(false);
  t.toolbar('Create a group of drawings').props.onClick();
  const groups=t.h.manager.state().groups;expect(groups.map(group=>[group.name,group.memberIds.sort()])).toEqual([['Group 1',['line-a','line-c']]]);
  expect(t.rows().map(node=>[node.props['data-node-key'],node.props['aria-level']])).toEqual([['series',1],['group:'+groups[0].id,1],['drawing:line-c',2],['drawing:line-a',2],['drawing:line-b',1]]);
  expect(t.row('group:'+groups[0].id).props['aria-selected']).toBe(true);
  // Group buttons act on every member.
  t.rowButton('group:'+groups[0].id,'lock').props.onClick(event());
  expect(['line-a','line-b','line-c'].map(id=>nativeById(t.h,id).locked)).toEqual([true,false,true]);
  // Collapse hides members.
  find(t.row('group:'+groups[0].id),node=>node.props?.className==='lv-ot-expand').props.onClick(event());
  expect(t.rows().map(node=>node.props['data-node-key'])).toEqual(['series','group:'+groups[0].id,'drawing:line-b']);
  // Removing the group removes its drawings in one manager transaction; the group row goes with them.
  t.rowButton('group:'+groups[0].id,'remove').props.onClick(event());
  expect(t.h.nativeRows().map(row=>row.id)).toEqual(['line-b']);expect(t.h.manager.state().groups.map(group=>group.memberIds)).toEqual([[]]);expect(t.rows().map(node=>node.props['data-node-key'])).toEqual(['series','drawing:line-b']);expect(t.h.calls.filter(call=>call.startsWith('remove'))).toEqual(['remove:line-c,line-a']);
 });
 it('Clone, Copy menu: Clone uses the drawing duplicate route; Copy has no LV route',async()=>{
  const t=await mount();t.row('drawing:line-b').props.onClick(event());
  t.toolbar('Clone, Copy').props.onClick();
  const menu=find(t.render(),node=>node.props?.role==='menu'&&node.props['aria-label']==='Clone, Copy');
  expect(findAll(menu,node=>node.props?.role==='menuitem').map(node=>[node.props['aria-label'],!!node.props.disabled])).toEqual([['Copy',true],['Clone',false]]);
  t.menuItem('Clone').props.onClick();expect(t.h.chart.duplicateDrawings).toHaveBeenCalledWith(['line-b']);
 });
 it('context menu Rename commits on Enter through the manager and Escape cancels',async()=>{
  const t=await mount();
  t.row('drawing:line-a').props.onContextMenu(event());
  const menu=find(t.render(),node=>node.props?.role==='menu'&&node.props['aria-label']==='Object tree menu');
  expect(findAll(menu,node=>node.props?.role==='menuitem').map(node=>node.props['aria-label'])).toEqual(['Create a group of drawings','Rename','Visual order','Copy','Clone','Lock','Hide','Remove']);
  t.menuItem('Rename').props.onClick();
  const input=()=>find(t.render(),node=>node.type==='input'&&node.props['aria-label']==='Rename');
  input().props.onChange({target:{value:'Escaped'}});input().props.onKeyDown(event({key:'Escape'}));
  expect(findAll(t.render(),node=>node.type==='input').length).toBe(0);expect(t.h.doc().drawings).toEqual(expect.arrayContaining([expect.not.objectContaining({lvName:'Escaped'})]));
  t.row('drawing:line-a').props.onContextMenu(event());t.menuItem('Rename').props.onClick();
  const rename=vi.spyOn(t.h.manager,'renameDrawing');
  input().props.onChange({target:{value:'Support'}});const retained=input();retained.props.onKeyDown(event({key:'Enter'}));retained.props.onBlur();
  expect(rename).toHaveBeenCalledTimes(1);
  expect((t.h.doc().drawings as any[]).find(row=>row.id==='line-a').lvName).toBe('Support');
  expect(t.row('drawing:line-a').props['aria-label']).toBe('Support');
 });
 it('indicator context menu follows the reference items; Move to creates a new pane through the port',async()=>{
  const settings=vi.fn();const t=await mount({indicators:['rsi']},{onOpenIndicatorSettings:settings});const id=t.h.ids[0];
  t.row('study:'+id).props.onContextMenu(event());
  const menu=find(t.render(),node=>node.props?.role==='menu'&&node.props['aria-label']==='Object tree menu');
  expect(findAll(menu,node=>node.props?.role==='menuitem').map(node=>node.props['aria-label'])).toEqual(['Add alert on RSI…','Add indicator/strategy on RSI…','Add this indicator to favorites','Visual order','Visibility on intervals','Move to','Pin to scale','Copy','Hide','Remove','Settings…']); // The literal {value} placeholder is dropped placeholder when no readout value exists
  expect(findAll(menu,node=>node.props?.role==='separator').length).toBe(3);
  expect(t.menuItem('Remove').props['aria-keyshortcuts']).toBe('Del');
  t.menuItem('Settings…').props.onClick();expect(settings).toHaveBeenCalledWith(id);
  const paneBefore=t.h.indicators.port.list()[0].paneId;
  t.row('study:'+id).props.onContextMenu(event());t.menuItem('Move to').props.onClick();t.menuItem('New pane above').props.onClick();
  const after=t.h.indicators.port.list()[0].paneId;expect(after).not.toBe(paneBefore);expect(t.alert()).toBe('');
 });
 it('drag reorder brings the moved drawing directly in front of the target through manager order',async()=>{
  const t=await mount();
  const dataTransfer={effectAllowed:'',setData:vi.fn()};
  t.row('drawing:line-a').props.onDragStart(event({dataTransfer}));
  const target=t.row('drawing:line-c');target.props.onDragOver(event({currentTarget:{getBoundingClientRect:()=>({top:0,height:38})},clientY:30}));
  t.row('drawing:line-c').props.onDrop(event({currentTarget:{getBoundingClientRect:()=>({top:0,height:38})},clientY:30}));
  expect(t.h.calls.filter(call=>call.startsWith('front'))).toEqual(['front:line-a','front:line-c']);
  expect(t.rows().map(node=>node.props['data-node-key'])).toEqual(['series','drawing:line-c','drawing:line-a','drawing:line-b']);
 });
 it('unsubscribes from chart events on cleanup',async()=>{
  const t=await mount();for(const cleanup of t.cleanups)(cleanup as (()=>void)|undefined)?.();
  const before=t.h.calls.length;t.h.facade.select(['line-a']);expect(t.row('drawing:line-a').props['aria-selected']).toBe(false);expect(t.h.calls.length).toBe(before);
 });
});
