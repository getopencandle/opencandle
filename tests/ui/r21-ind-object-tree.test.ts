import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ObjectTreePanel} from '../../src/ui/ObjectTreePanel';
import {objectTreeHarness,text,find,findAll,event} from './object-tree-panel-harness';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
let disposers:Array<()=>void>=[];
afterEach(()=>{for(const dispose of disposers)dispose();disposers=[];});

// Actual ObjectTreePanel handlers over the actual indicator port
// (object-tree-panel-harness, L1 native host). Deterministic hook mock; no DOM, focus or packaged GUI claim. SYNTHETIC fixtures.
const dataset={instrument:{id:'synthetic',symbol:'SYNTH',name:'SYNTHETIC fixture',exchange:'LOCAL',currency:'USD',assetClass:'stock' as const,tickSize:0.01,lotSize:1,timezone:'UTC'},resolution:'1D'};
async function mount(options:Parameters<typeof objectTreeHarness>[0]={},extra:Record<string,unknown>={}){
 const h=await objectTreeHarness({drawings:[],...options});disposers.push(h.dispose);
 const props:any={chart:h.chart,dataset,get indicators(){return h.indicators.port.list();},onDrawingsChanged:vi.fn(),onSelectionChange:vi.fn(),onError:vi.fn(),...extra};
 const render=()=>{hooks.cursor=0;return ObjectTreePanel({...props,indicators:props.indicators});};
 render();hooks.effects.map(effect=>effect());
 const row=(key:string)=>find(render(),node=>node.props?.['data-node-key']===key);
 const rowButton=(key:string,name:string)=>find(row(key),node=>node.type==='button'&&node.props['data-name']===name);
 const menuItem=(label:string)=>find(render(),node=>(node.props?.role==='menuitem'||node.props?.role==='menuitemradio')&&node.props['aria-label']===label);
 const submenu=(label:string)=>findAll(find(render(),node=>node.props?.role==='menu'&&node.props['aria-label']===label),node=>node.props?.role==='menuitem'||node.props?.role==='menuitemradio');
 const alert=()=>{const found=findAll(render(),node=>node.props?.role==='alert');return found.length?text(found[0]):'';};
 return {h,props,render,row,rowButton,menuItem,submenu,alert};
}
const restricted=(port:any,id:string)=>{const row=port.list().find((item:any)=>item.id===id);port.update(id,{presentation:{...(row.presentation??{schemaVersion:1,precision:'auto',guides:{},fills:{}}),visibility:{schemaVersion:1,mode:'include',intervals:['60m'],ranges:[]}}});};

describe(' Move to an existing pane (opt-in host route)',()=>{
 it('without the opt-in the submenu keeps the two cited new-pane entries only',async()=>{
  const t=await mount({indicators:['sma','rsi']},{onIndicatorMove:vi.fn()});const rsi=t.h.ids[1];
  t.row('study:'+rsi).props.onContextMenu(event());t.menuItem('Move to').props.onClick();
  expect(t.submenu('Move to').map(node=>node.props['aria-label'])).toEqual(['New pane above','New pane below']);
 });
 it('a host route that cannot merge never lists the entries, even with existingPaneMoves',async()=>{
  const t=await mount({indicators:['sma','rsi']},{onIndicatorMove:vi.fn(),existingPaneMoves:true});
  t.row('study:'+t.h.ids[1]).props.onContextMenu(event());t.menuItem('Move to').props.onClick();
  expect(t.submenu('Move to').map(node=>node.props['aria-label'])).toEqual(['New pane above','New pane below']);
 });
 it('with the host existing-pane route the submenu adds Existing pane above/below with reasons, and the route gets the choice',async()=>{
  const move=vi.fn();const t=await mount({indicators:['sma','rsi']},{onIndicatorMove:vi.fn(),onIndicatorMoveExisting:move});const [sma,rsi]=t.h.ids;
  t.row('study:'+rsi).props.onContextMenu(event());t.menuItem('Move to').props.onClick();
  const items=t.submenu('Move to');
  expect(items.map(node=>node.props['aria-label'])).toEqual(['New pane above','New pane below','Existing pane above','Existing pane below']);
  expect(items[3].props.disabled).toBe(true);expect(items[3].props.title).toMatch(/no pane below/);
  expect(items[2].props.disabled).toBeFalsy();
  t.menuItem('Existing pane above').props.onClick();
  expect(move).toHaveBeenCalledWith(expect.objectContaining({id:rsi}),'existing-above');
  // The price-pane SMA can move down into the RSI pane.
  t.row('study:'+sma).props.onContextMenu(event());t.menuItem('Move to').props.onClick();
  expect(t.menuItem('Existing pane above').props.disabled).toBe(true);expect(t.menuItem('Existing pane below').props.disabled).toBeFalsy();
 });
 it('the default route (no host) moves through the indicator port into the neighbour pane',async()=>{
  const t=await mount({indicators:['rsi','macd']},{existingPaneMoves:true});const [rsi,macd]=t.h.ids;const port=t.h.indicators.port;
  const paneOf=(id:string)=>port.list().find(row=>row.id===id)!.paneId;
  expect(paneOf(rsi)).not.toBe(paneOf(macd));
  t.row('study:'+macd).props.onContextMenu(event());t.menuItem('Move to').props.onClick();t.menuItem('Existing pane above').props.onClick();
  expect(t.alert()).toBe('');expect(paneOf(macd)).toBe(paneOf(rsi));
  t.row('study:'+macd).props.onContextMenu(event());t.menuItem('Move to').props.onClick();t.menuItem('Existing pane above').props.onClick();
  expect(t.alert()).toBe('');expect(paneOf(macd)).toBe('price');
 });
 it('the toolbar Move to menu stays the cited two entries',async()=>{
  const t=await mount({indicators:['sma','rsi']},{onIndicatorMove:vi.fn(),onIndicatorMoveExisting:vi.fn()});
  t.row('study:'+t.h.ids[1]).props.onClick(event());
  const toolbar=find(t.render(),node=>node.type==='button'&&node.props.className==='lv-ot-toolbar-button'&&node.props['aria-label']==='Move to');
  toolbar.props.onClick(event());
  const labels=findAll(t.render(),node=>node.props?.role==='menuitem'&&!node.props['data-menu-id']).map(node=>text(node));
  expect(labels.filter(label=>/pane/.test(label))).toEqual(['New pane above','New pane below']);
 });
});

describe(' indicator hidden on the current interval (IND.OBJECT_TREE.HIDE)',()=>{
 it('the Hide button names the interval state and opens the Visibility tab instead of toggling',async()=>{
  const open=vi.fn(),action=vi.fn();const t=await mount({indicators:['rsi']},{onOpenIndicatorSettings:open,onIndicatorAction:action});const id=t.h.ids[0];
  expect(t.rowButton('study:'+id,'hide').props['aria-label']).toBe('Hide');
  restricted(t.h.indicators.port,id);
  const button=t.rowButton('study:'+id,'hide');
  expect(button.props['aria-label']).toBe('Indicator is hidden on current interval');
  button.props.onClick(event());
  expect(open).toHaveBeenCalledWith(id,'visibility');expect(action).not.toHaveBeenCalled();
 });
 it('a matching interval keeps the plain Hide toggle',async()=>{
  const action=vi.fn();const t=await mount({indicators:['rsi']},{onIndicatorAction:action});const id=t.h.ids[0];
  t.props.dataset={...dataset,resolution:'60m'};restricted(t.h.indicators.port,id);
  const button=t.rowButton('study:'+id,'hide');expect(button.props['aria-label']).toBe('Hide');
  button.props.onClick(event());expect(action).toHaveBeenCalledWith(expect.objectContaining({id}),'toggle');
 });
});

describe(' Pin to scale from the Object tree (IND.OBJECT_TREE.ASSIGN_SCALE, opt-in host route)',()=>{
 it('without a host scale route Pin to scale stays disabled with its reason',async()=>{
  const t=await mount({indicators:['rsi']});t.row('study:'+t.h.ids[0]).props.onContextMenu(event());
  expect(t.menuItem('Pin to scale').props.disabled).toBe(true);
 });
 it('with the host route the item names the current placement and its submenu runs the host',async()=>{
  const scale=vi.fn();const t=await mount({indicators:['rsi']},{onIndicatorScale:scale,indicatorScale:()=>({current:'none',sides:{left:true,none:true}})});const id=t.h.ids[0];
  t.row('study:'+id).props.onContextMenu(event());
  const item=t.menuItem('Pin to scale (now no scale)');expect(item.props.disabled).toBeFalsy();item.props.onClick();
  const entries=t.submenu('Pin to scale (now no scale)');expect(entries.length).toBe(4);
  const left=entries.find(node=>/left/i.test(node.props['aria-label']));expect(left).toBeTruthy();
  left.props.onClick();
  expect(scale).toHaveBeenCalledWith(expect.objectContaining({id}),'left');
 });
});
