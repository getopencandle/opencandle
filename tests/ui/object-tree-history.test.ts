import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ObjectTreePanel,studyMoveTarget} from '../../src/ui/ObjectTreePanel';
import {objectTreeHistoryHarness} from './object-tree-history-harness';
import {find,findAll,event} from './object-tree-panel-harness';

// One workspace undo step per Object tree editing action, with exact undo and redo. Actual
// ObjectTreePanel handlers; actual adapter drawing manager/notification batching/loadDrawings and
// the actual indicator port; actual createWorkspaceHistory (see object-tree-history-harness.ts for
// what is modeled). Deterministic hook mock; no DOM or packaged GUI claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
let disposers:Array<()=>void>=[];
afterEach(()=>{for(const dispose of disposers)dispose();disposers=[];});

const dataset={instrument:{id:'synthetic',symbol:'SYNTH',name:'SYNTHETIC fixture',exchange:'LOCAL',currency:'USD',assetClass:'stock' as const,tickSize:0.01,lotSize:1,timezone:'UTC'},resolution:'1D'};
async function mount(options:Parameters<typeof objectTreeHistoryHarness>[0]={},extra:Record<string,unknown>={}){
 const h=await objectTreeHistoryHarness(options);disposers.push(h.dispose);
 const props:any={chart:h.chart,dataset,get indicators(){return h.port.list();},onError:vi.fn(),...extra};
 const render=()=>{hooks.cursor=0;return ObjectTreePanel({...props,indicators:props.indicators});};
 render();hooks.effects.forEach(effect=>effect());
 const row=(key:string)=>find(render(),node=>node.props?.['data-node-key']===key);
 const rowKeys=()=>findAll(render(),node=>node.props?.role==='treeitem').map(node=>node.props['data-node-key']);
 const rowButton=(key:string,name:string)=>find(row(key),node=>node.type==='button'&&node.props['data-name']===name);
 const menuItem=(label:string)=>find(render(),node=>node.props?.role==='menuitem'&&node.props['aria-label']===label);
 /** Runs one panel action and proves: exactly one history step, undo restores, redo reapplies. */
 const oneStep=(action:()=>void,check:(phase:'after'|'undone'|'redone')=>void)=>{
  const before=h.committed(),steps=h.history.status().undo;
  action();
  expect(h.history.status().undo).toBe(steps+1);expect(props.onError).not.toHaveBeenCalled();
  const after=h.committed();expect(after).not.toEqual(before);check('after');
  expect(h.restore('undo')).toBe(true);expect(h.committed()).toEqual(before);expect(h.history.status()).toMatchObject({undo:steps,redo:1});check('undone');
  expect(h.restore('redo')).toBe(true);expect(h.committed()).toEqual(after);expect(h.history.status()).toMatchObject({undo:steps+1,redo:0});check('redone');
 };
 return {h,props,render,row,rowKeys,rowButton,menuItem,oneStep};
}
const native=(t:Awaited<ReturnType<typeof mount>>,id:string)=>t.h.nativeRows().find(row=>row.id===id);
const doc=(t:Awaited<ReturnType<typeof mount>>)=>(t.h.committed().drawings as any).drawings as any[];

describe('drawing actions: one undo step each, exact undo and redo',()=>{
 it('Hide',async()=>{const t=await mount();t.oneStep(()=>t.rowButton('drawing:line-a','hide').props.onClick(event()),phase=>{expect(native(t,'line-a')!.visible).toBe(phase==='undone');expect(t.rowButton('drawing:line-a','hide').props['aria-label']).toBe(phase==='undone'?'Hide':'Show');});});
 it('Lock',async()=>{const t=await mount();t.oneStep(()=>t.rowButton('drawing:line-b','lock').props.onClick(event()),phase=>{expect(native(t,'line-b')!.locked).toBe(phase!=='undone');expect(t.rowButton('drawing:line-b','lock').props['aria-label']).toBe(phase==='undone'?'Lock':'Unlock');});});
 it('Remove',async()=>{const t=await mount();t.oneStep(()=>t.rowButton('drawing:line-c','remove').props.onClick(event()),phase=>{expect(!!native(t,'line-c')).toBe(phase==='undone');expect(t.rowKeys().includes('drawing:line-c')).toBe(phase==='undone');});});
 it('Rename',async()=>{const t=await mount();t.oneStep(()=>{t.row('drawing:line-a').props.onContextMenu(event());t.menuItem('Rename').props.onClick();const input=()=>find(t.render(),node=>node.type==='input'&&node.props['aria-label']==='Rename');input().props.onChange({target:{value:'Support'}});input().props.onKeyDown(event({key:'Enter'}));},phase=>{expect(doc(t).find(row=>row.id==='line-a').lvName).toBe(phase==='undone'?undefined:'Support');expect(t.row('drawing:line-a').props['aria-label']).toBe(phase==='undone'?'Trend Line':'Support');});});
 it('Create a group of drawings',async()=>{const t=await mount();t.row('drawing:line-a').props.onClick(event());t.row('drawing:line-c').props.onClick(event({ctrlKey:true}));
  t.oneStep(()=>find(t.render(),node=>node.props?.['data-name']==='group-button').props.onClick(),phase=>{const groups=t.h.adapter.manager.state().groups;expect(groups.length).toBe(phase==='undone'?0:1);expect(t.rowKeys().some(key=>key.startsWith('group:'))).toBe(phase!=='undone');});});
 it('Remove a group removes its drawings and its row in one step',async()=>{const t=await mount();t.row('drawing:line-a').props.onClick(event());t.row('drawing:line-b').props.onClick(event({ctrlKey:true}));find(t.render(),node=>node.props?.['data-name']==='group-button').props.onClick();
  const group=t.rowKeys().find(key=>key.startsWith('group:'))!;
  t.oneStep(()=>t.rowButton(group,'remove').props.onClick(event()),phase=>{expect(t.h.nativeRows().map(row=>row.id).sort()).toEqual(phase==='undone'?['line-a','line-b','line-c']:['line-c']);expect(t.rowKeys().includes(group)).toBe(phase==='undone');});});
 it('Drag reorder',async()=>{const t=await mount();const box={getBoundingClientRect:()=>({top:0,height:38})};
  expect(t.rowKeys().slice(1)).toEqual(['drawing:line-c','drawing:line-b','drawing:line-a']);
  t.oneStep(()=>{t.row('drawing:line-a').props.onDragStart(event({dataTransfer:{setData:vi.fn()}}));t.row('drawing:line-c').props.onDragOver(event({currentTarget:box,clientY:30}));t.row('drawing:line-c').props.onDrop(event({currentTarget:box,clientY:30}));},
   phase=>expect(t.rowKeys().slice(1)).toEqual(phase==='undone'?['drawing:line-c','drawing:line-b','drawing:line-a']:['drawing:line-c','drawing:line-a','drawing:line-b']));
 });
 it('Clone goes to the drawing duplicate route (its own workspace publication with history)',async()=>{const t=await mount();t.row('drawing:line-b').props.onClick(event());find(t.render(),node=>node.props?.['data-name']==='copy-clone-button').props.onClick();t.menuItem('Clone').props.onClick();expect(t.h.chart.duplicateDrawings).toHaveBeenCalledWith(['line-b']);});
});

describe('indicator actions: one undo step each, exact undo and redo',()=>{
 it('Hide',async()=>{const t=await mount({indicators:['volume']});const id=t.h.ids[0];t.oneStep(()=>t.rowButton('study:'+id,'hide').props.onClick(event()),phase=>expect(t.h.port.list()[0].visible).toBe(phase==='undone'));});
 it('Remove by the row button, the menu and the Delete key',async()=>{
  const t=await mount({indicators:['volume','sma','rsi']});const [vol,sma,rsi]=t.h.ids;
  t.oneStep(()=>t.rowButton('study:'+vol,'remove').props.onClick(event()),phase=>expect(t.h.port.list().map(row=>row.id)).toEqual(phase==='undone'?[vol,sma,rsi]:[sma,rsi]));
  // Each oneStep ends redone, so the next action starts from the previous result.
  t.oneStep(()=>{t.row('study:'+sma).props.onContextMenu(event());t.menuItem('Remove').props.onClick();},phase=>expect(t.h.port.list().map(row=>row.id)).toEqual(phase==='undone'?[sma,rsi]:[rsi]));
  t.oneStep(()=>{t.row('study:'+rsi).props.onClick(event());t.render().props.onKeyDown(event({key:'Delete'}));},phase=>expect(t.h.port.list().map(row=>row.id).includes(rsi)).toBe(phase==='undone'));
 });
 // FX-F5 (the reviewer's exact sequence. Ctrl-select Volume, SMA and line-a
 // then Delete: one workspace undo step, and one Undo restores both indicators and the drawing.
 it('FX-F5 Delete over 2 indicators + 1 drawing is ONE undo step restoring all three',async()=>{
  const t=await mount({indicators:['volume','sma']});const [vol,sma]=t.h.ids;
  t.row('study:'+vol).props.onClick(event());t.row('study:'+sma).props.onClick(event({ctrlKey:true}));t.row('drawing:line-a').props.onClick(event({ctrlKey:true}));
  t.oneStep(()=>t.render().props.onKeyDown(event({key:'Delete'})),phase=>{
   expect(t.h.port.list().map(row=>row.id)).toEqual(phase==='undone'?[vol,sma]:[]);
   expect(t.h.nativeRows().map(row=>row.id).sort()).toEqual(phase==='undone'?['line-a','line-b','line-c']:['line-b','line-c']);
  });
 });
 it('FX-F5 the drawing-row menu Remove over a mixed selection and Delete over 2 indicators are one step each',async()=>{
  const t=await mount({indicators:['volume','sma','rsi']});const [vol,sma,rsi]=t.h.ids;
  t.row('study:'+vol).props.onClick(event());t.row('drawing:line-b').props.onClick(event({ctrlKey:true}));
  t.oneStep(()=>{t.row('drawing:line-b').props.onContextMenu(event());t.menuItem('Remove').props.onClick();},phase=>{
   expect(t.h.port.list().map(row=>row.id)).toEqual(phase==='undone'?[vol,sma,rsi]:[sma,rsi]);expect(!!native(t,'line-b')).toBe(phase==='undone');
  });
  t.row('study:'+sma).props.onClick(event());t.row('study:'+rsi).props.onClick(event({ctrlKey:true}));
  t.oneStep(()=>t.render().props.onKeyDown(event({key:'Delete'})),phase=>expect(t.h.port.list().map(row=>row.id)).toEqual(phase==='undone'?[sma,rsi]:[]));
 });
 it('FX-F5 a host batch route (as App wires it) gets the whole selection once and is one step; an indicator-only host route is never bypassed',async()=>{
  const {removeObjectsAsOneStep}=await import('../../src/ui/object-tree-removal');
  const batch=vi.fn((request:any)=>removeObjectsAsOneStep(t.h.port,request.indicators.map((row:any)=>row.id),request.drawingIds.length?request.removeDrawings:undefined));
  const t=await mount({indicators:['volume','sma']},{onIndicatorAction:vi.fn(),onRemoveObjects:batch});const [vol,sma]=t.h.ids;
  t.row('study:'+vol).props.onClick(event());t.row('study:'+sma).props.onClick(event({ctrlKey:true}));t.row('drawing:line-c').props.onClick(event({ctrlKey:true}));
  t.oneStep(()=>t.render().props.onKeyDown(event({key:'Delete'})),phase=>{expect(t.h.port.list()).toHaveLength(phase==='undone'?2:0);expect(!!native(t,'line-c')).toBe(phase==='undone');});
  expect(batch).toHaveBeenCalledOnce();expect(batch.mock.calls[0][0].indicators.map((row:any)=>row.id)).toEqual([vol,sma]);expect(batch.mock.calls[0][0].drawingIds).toEqual(['line-c']);expect(t.props.onIndicatorAction).not.toHaveBeenCalled();
  const route=vi.fn(),u=await mount({indicators:['volume','sma']},{onIndicatorAction:route});const [a,b]=u.h.ids,spy=vi.spyOn(u.h.port,'remove');
  u.row('study:'+a).props.onClick(event());u.row('study:'+b).props.onClick(event({ctrlKey:true}));u.render().props.onKeyDown(event({key:'Delete'}));
  expect(route.mock.calls.map(call=>[call[0].id,call[1]])).toEqual([[a,'remove'],[b,'remove']]);expect(spy).not.toHaveBeenCalled();
 });
 // Redo re-adds the indicator in its own pane; pane ORDER on redo is restored by the analysis frame
 // (paneLayout), which this harness does not model, so redo checks pane membership only.
 it('Move to > New pane above and New pane below land on opposite sides of the source pane',async()=>{
  const t=await mount({indicators:['sma']});const id=t.h.ids[0],pane=()=>t.h.indicatorHost.chart.panes.list().find(item=>item.indicators.some(native=>native.id===t.h.port.list()[0].rendererId))!.id;
  expect(t.h.indicatorHost.order()).toEqual(['price']);expect(pane()).toBe('price');
  expect(studyMoveTarget(t.h.chart,t.h.port.list()[0].rendererId,'above')).toEqual({newPane:{before:'price'}});
  expect(studyMoveTarget(t.h.chart,t.h.port.list()[0].rendererId,'below')).toEqual({newPane:{after:'price'}});
  t.oneStep(()=>{t.row('study:'+id).props.onContextMenu(event());t.menuItem('Move to').props.onClick();t.menuItem('New pane above').props.onClick();},phase=>{const order=t.h.indicatorHost.order();if(phase==='undone')expect(pane()).toBe('price');else if(phase==='after')expect(order).toEqual([pane(),'price']);else expect(pane()).not.toBe('price');});
  t.h.restore('undo');expect(pane()).toBe('price');
  t.oneStep(()=>{t.row('study:'+id).props.onContextMenu(event());t.menuItem('Move to').props.onClick();t.menuItem('New pane below').props.onClick();},phase=>{const order=t.h.indicatorHost.order();if(phase==='undone')expect(pane()).toBe('price');else if(phase==='after')expect(order).toEqual(['price',pane()]);else expect(pane()).not.toBe('price');});
 });
 it('toolbar Move to uses the same placement',async()=>{
  const t=await mount({indicators:['sma']});const id=t.h.ids[0];t.row('study:'+id).props.onClick(event());
  find(t.render(),node=>node.props?.['data-name']==='move-to-button').props.onClick();t.menuItem('New pane above').props.onClick();
  const order=t.h.indicatorHost.order();expect(order[1]).toBe('price');expect(order[0]).not.toBe('price');expect(t.h.history.status().undo).toBe(1);
 });
 it('a host indicator route without a move route disables Move to; a host move route is used instead of the port',async()=>{
  const action=vi.fn(),t=await mount({indicators:['sma']},{onIndicatorAction:action});const id=t.h.ids[0];t.row('study:'+id).props.onClick(event());
  expect(find(t.render(),node=>node.props?.['data-name']==='move-to-button').props.disabled).toBe(true);
  t.row('study:'+id).props.onContextMenu(event());expect(t.menuItem('Move to').props.disabled).toBe(true);
  const move=vi.fn();t.props.onIndicatorMove=move;const spy=vi.spyOn(t.h.port,'move');
  t.row('study:'+id).props.onContextMenu(event());t.menuItem('Move to').props.onClick();t.menuItem('New pane below').props.onClick();
  expect(move).toHaveBeenCalledWith(expect.objectContaining({id}),'below');expect(spy).not.toHaveBeenCalled();expect(t.h.history.status().undo).toBe(0);
 });
});
