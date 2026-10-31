import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ObjectTreePanel} from '../../src/ui/ObjectTreePanel';
import {seriesTreeMenu,studyDropPlan,studyMenu} from '../../src/ui/object-tree-model';
import {indicatorClipboard} from '../../src/chart/legend-model';
import {objectTreeHarness,text,find,findAll,event} from './object-tree-panel-harness';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];indicatorClipboard.clear();});
let disposers:Array<()=>void>=[];
afterEach(()=>{for(const dispose of disposers)dispose();disposers=[];});

// Indicator Visual order, Copy and drag, and the series row menu, through the actual
// ObjectTreePanel handlers over the actual indicator port (object-tree-panel-harness). Deterministic hook mock; no DOM, focus
// or packaged GUI claim. SYNTHETIC fixtures.
const dataset={instrument:{id:'synthetic',symbol:'SYNTH',name:'SYNTHETIC fixture',exchange:'LOCAL',currency:'USD',assetClass:'stock' as const,tickSize:0.01,lotSize:1,timezone:'UTC'},resolution:'1D'};
async function mount(kinds:NonNullable<Parameters<typeof objectTreeHarness>[0]>['indicators'],extra:Record<string,unknown>={}){
 const h=await objectTreeHarness({drawings:[],indicators:kinds});disposers.push(h.dispose);
 const props:any={chart:h.chart,dataset,get indicators(){return h.indicators.port.list();},onDrawingsChanged:vi.fn(),onSelectionChange:vi.fn(),onError:vi.fn(),...extra};
 const render=()=>{hooks.cursor=0;return ObjectTreePanel({...props,indicators:props.indicators});};
 render();hooks.effects.map(effect=>effect());
 const row=(key:string)=>find(render(),node=>node.props?.['data-node-key']===key);
 const menuItem=(label:string)=>find(render(),node=>(node.props?.role==='menuitem'||node.props?.role==='menuitemradio')&&node.props['aria-label']===label);
 const submenu=(label:string)=>findAll(find(render(),node=>node.props?.role==='menu'&&node.props['aria-label']===label),node=>node.props?.role==='menuitem');
 const alert=()=>{const found=findAll(render(),node=>node.props?.role==='alert');return found.length?text(found[0]):'';};
 const order=()=>h.indicators.port.list().map(item=>item.id);
 const titles=()=>findAll(render(),node=>node.props?.['data-node-kind']==='study').map(node=>node.props['data-node-key']);
 return {h,props,render,row,menuItem,submenu,alert,order,titles};
}
const visualOrder=(t:Awaited<ReturnType<typeof mount>>,id:string)=>{t.row('study:'+id).props.onContextMenu(event());t.menuItem('Visual order').props.onClick();return Object.fromEntries(t.submenu('Visual order').map(node=>[node.props['aria-label'],!node.props.disabled]));};
const drag=(t:Awaited<ReturnType<typeof mount>>,from:string,to:string,place:'before'|'after')=>{
 const data={effectAllowed:'',setData:vi.fn()};t.row(from).props.onDragStart({...event(),dataTransfer:data});
 const over={...event(),clientY:place==='after'?30:0,currentTarget:{getBoundingClientRect:()=>({top:0,height:20})}};t.row(to).props.onDragOver(over);t.row(to).props.onDrop(over);t.row(to).props.onDragEnd?.();
 return over;
};

describe(' Object tree indicator Visual order',()=>{
 it('lists the steps for two indicators on one pane and moves through the indicator port (no host routes)',async()=>{
  const t=await mount(['sma','ema']);const [sma,ema]=t.h.ids;
  expect(visualOrder(t,sma)).toEqual({'Bring to front':false,'Send to back':true,'Bring forward':false,'Send backward':true});
  t.menuItem('Send to back').props.onClick();
  expect(t.alert()).toBe('');expect(t.order()).toEqual([ema,sma]);expect(t.titles()).toEqual(['study:'+ema,'study:'+sma]);
  expect(visualOrder(t,sma)).toEqual({'Bring to front':true,'Send to back':false,'Bring forward':true,'Send backward':false});
 });
 it('follows undo, redo and a layout restore of the saved order (no kept stale state)',async()=>{
  const t=await mount(['sma','ema']);const [sma,ema]=t.h.ids,port=t.h.indicators.port;
  const before=port.serialize();visualOrder(t,sma);t.menuItem('Send to back').props.onClick();const after=port.serialize();
  // Undo: the workspace restores the earlier snapshot through the same port path.
  port.restore(before);expect(t.titles()).toEqual(['study:'+sma,'study:'+ema]);expect(visualOrder(t,sma)['Bring to front']).toBe(false);expect(visualOrder(t,sma)['Send to back']).toBe(true);
  // Redo.
  port.restore(after);expect(t.titles()).toEqual(['study:'+ema,'study:'+sma]);expect(visualOrder(t,ema)['Send to back']).toBe(true);
  // Layout restore: a fresh copy of the saved layout (new objects, same order).
  port.restore(structuredClone(before));expect(t.titles()).toEqual(['study:'+sma,'study:'+ema]);
  visualOrder(t,ema);t.menuItem('Bring to front').props.onClick();expect(t.order()).toEqual([ema,sma]);
 });
 it('a lone indicator on its pane gets no steps; a host route receives the full new order',async()=>{
  const reorder=vi.fn(),t=await mount(['sma','rsi','ema'],{onIndicatorAction:vi.fn(),onIndicatorReorder:reorder});const [sma,rsi,ema]=t.h.ids;
  t.row('study:'+rsi).props.onContextMenu(event());expect(t.menuItem('Visual order').props.disabled).toBe(true);
  visualOrder(t,ema);t.menuItem('Bring forward').props.onClick();
  expect(reorder).toHaveBeenCalledWith([ema,rsi,sma]);expect(t.order()).toEqual([sma,rsi,ema]);
 });
 it('a host with its own indicator route but no reorder route gets no Visual order and no same-pane drag',async()=>{
  const t=await mount(['sma','ema'],{onIndicatorAction:vi.fn()});const [sma,ema]=t.h.ids;
  t.row('study:'+sma).props.onContextMenu(event());expect(t.menuItem('Visual order').props.disabled).toBe(true);
  expect(t.row('study:'+sma).props.draggable).toBeUndefined();expect(t.order()).toEqual([sma,ema]);
 });
});

describe(' Object tree indicator Copy',()=>{
 it('Copy in the row menu and Ctrl + C on one selected indicator fill the indicator clipboard',async()=>{
  const copied=vi.fn(),t=await mount(['rsi'],{onIndicatorCopied:copied});const [rsi]=t.h.ids;
  t.row('study:'+rsi).props.onContextMenu(event());expect(t.menuItem('Copy').props.disabled).toBeFalsy();t.menuItem('Copy').props.onClick();
  expect(indicatorClipboard.get()).toMatchObject({kind:'rsi',title:'RSI'});expect(copied).toHaveBeenCalledWith(expect.stringMatching(/^RSI copied\. /));
  indicatorClipboard.clear();
  const tree=find(t.render(),node=>node.props?.className==='lv-ot');tree.props.onKeyDown({...event(),key:'c',ctrlKey:true});
  expect(indicatorClipboard.get()?.kind).toBe('rsi');expect(t.h.indicators.port.list()).toHaveLength(1);
 });
});

describe(' Object tree indicator drag',()=>{
 it('same pane: the dragged indicator lands before or after the target (one restore)',async()=>{
  const t=await mount(['sma','ema','wma']);const [sma,ema,wma]=t.h.ids;
  drag(t,'study:'+sma,'study:'+wma,'after');expect(t.alert()).toBe('');expect(t.order()).toEqual([ema,wma,sma]);
  drag(t,'study:'+sma,'study:'+ema,'before');expect(t.order()).toEqual([sma,ema,wma]);
 });
 it('another pane: the dragged indicator moves into the target pane through the port, or the host route',async()=>{
  const t=await mount(['sma','rsi']);const [sma,rsi]=t.h.ids,paneOf=(id:string)=>t.h.indicators.port.list().find(row=>row.id===id)!.paneId;
  expect(paneOf(rsi)).not.toBe('price');
  drag(t,'study:'+rsi,'study:'+sma,'before');expect(t.alert()).toBe('');expect(paneOf(rsi)).toBe('price');
  const move=vi.fn(),host=await mount(['sma','rsi'],{onIndicatorAction:vi.fn(),onIndicatorMovePane:move});
  drag(host,'study:'+host.h.ids[1],'study:'+host.h.ids[0],'after');
  expect(move).toHaveBeenCalledWith(expect.objectContaining({id:host.h.ids[1]}),'price');
 });
 it('drawing drags never reach an indicator row, and an indicator drop on a drawing does nothing',async()=>{
  const t=await mount(['sma','ema']);const before=t.order();
  const data={effectAllowed:'',setData:vi.fn()};t.row('study:'+t.h.ids[0]).props.onDragStart({...event(),dataTransfer:data});
  const over={...event(),currentTarget:{getBoundingClientRect:()=>({top:0,height:20})}};t.row('series').props.onDragOver(over);
  expect(over.preventDefault).not.toHaveBeenCalled();t.row('series').props.onDrop(over);t.row('study:'+t.h.ids[0]).props.onDragEnd();
  expect(t.order()).toEqual(before);
 });
});

describe(' Object tree series row menu',()=>{
 it('the series row opens the legend series rows its routes allow; Move to keeps its reason',async()=>{
  const settings=vi.fn(),pin=vi.fn(),alert=vi.fn(),visibility=vi.fn();
  const t=await mount([],{onSeriesSettings:settings,onSeriesPinToScale:pin,onSeriesAlert:alert,onSeriesVisibility:visibility,seriesVisible:true,seriesScaleSide:()=>'right'});
  t.row('series').props.onContextMenu(event());
  const menu=find(t.render(),node=>node.props?.role==='menu'&&node.props['aria-label']==='Object tree menu');
  expect(findAll(menu,node=>node.props?.role==='menuitem'&&!String(node.props['data-menu-id']).includes('-move-')&&!String(node.props['data-menu-id']).includes('-pin-')).map(node=>node.props['aria-label'])).toEqual(['Add alert on SYNTH…','Move to','Pin to scale (now right)','Hide','Settings…']);
  t.menuItem('Move to').props.onClick();
  expect(t.submenu('Move to').map(node=>[node.props['aria-label'],!!node.props.disabled,node.props.title])).toEqual([['New pane above',true,'The main series always stays in the top pane in OpenCandle.'],['New pane below',true,'The main series always stays in the top pane in OpenCandle.']]);
  t.menuItem('Pin to scale (now right)').props.onClick();t.menuItem('Pin to new left scale').props.onClick();expect(pin).toHaveBeenCalledWith('left');
  t.row('series').props.onContextMenu(event());t.menuItem('Settings…').props.onClick();expect(settings).toHaveBeenCalledOnce();
  t.row('series').props.onContextMenu(event());t.menuItem('Hide').props.onClick();expect(visibility).toHaveBeenCalledWith(false);
  t.row('series').props.onContextMenu(event());t.menuItem('Add alert on SYNTH…').props.onClick();expect(alert).toHaveBeenCalledOnce();
 });
});

describe(' Object tree model',()=>{
 it('studyMenu takes the host Visual order steps and enables Copy',()=>{
  const items=studyMenu('RSI',null,{alert:true,childStudy:true,favorite:true,visualOrder:true,intervals:true,moveTo:true,pinToScale:false,copy:true,settings:true},true,{visualOrder:[{id:'front',label:'Bring to front',disabled:true},{id:'back',label:'Send to back'}]});
  expect(items.find(item=>item.id==='visual-order')).toMatchObject({submenu:[{id:'front',disabled:true},{id:'back'}]});
  expect(items.find(item=>item.id==='visual-order')?.disabled).toBeUndefined();expect(items.find(item=>item.id==='copy')?.disabled).toBeUndefined();
  expect(studyMenu('RSI',null,{alert:true,childStudy:true,favorite:true,visualOrder:false,intervals:true,moveTo:true,pinToScale:false,copy:false,settings:true},true,{visualOrder:[{id:'front',label:'Bring to front'}]}).find(item=>item.id==='visual-order')).toMatchObject({disabled:true,submenu:[{id:'front',disabled:true},{id:'back',disabled:true},{id:'forward',disabled:true},{id:'backward',disabled:true}]});
 });
 it('seriesTreeMenu leaves out rows with no route and tidies separators',()=>{
  expect(seriesTreeMenu({symbol:'GME',hidden:true,routes:{}}).map(item=>item.separator?'-':item.label)).toEqual(['Move to']);
  expect(seriesTreeMenu({symbol:'GME',hidden:true,mainScaleSide:'left',routes:{hide:true,pinToScale:true,settings:true}}).map(item=>item.separator?'-':item.label)).toEqual(['Move to','Pin to scale (now left)','Show','-','Settings…']);
 });
 it('studyDropPlan orders on one pane, moves across panes, and ignores no-ops',()=>{
  const rows=[{id:'a',paneId:'price'},{id:'b',paneId:'p1'},{id:'c',paneId:'price'}];
  expect(studyDropPlan(rows,'c','a','before')).toEqual({kind:'order',ids:['c','a','b']});
  expect(studyDropPlan(rows,'a','c','after')).toEqual({kind:'order',ids:['b','c','a']});
  expect(studyDropPlan(rows,'a','c','before')).toEqual({kind:'order',ids:['b','a','c']});
  expect(studyDropPlan(rows,'b','a','before')).toEqual({kind:'move',target:'price'});
  expect(studyDropPlan(rows,'a','b','after')).toEqual({kind:'move',target:{pane:'p1'}});
  expect(studyDropPlan(rows,'a','a','after')).toBeNull();expect(studyDropPlan([{id:'a',paneId:'price'},{id:'c',paneId:'price'}],'a','c','before')).toBeNull();
  expect(studyDropPlan([{id:'a',paneId:'price'},{id:'z',paneId:null}],'a','z','before')).toBeNull();
 });
});
