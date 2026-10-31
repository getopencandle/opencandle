import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ObjectTreePanel} from '../../src/ui/ObjectTreePanel';
import {studyMenu} from '../../src/ui/object-tree-model';
import {objectTreeHarness,find,findAll,event} from './object-tree-panel-harness';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
let disposers:Array<()=>void>=[];
afterEach(()=>{for(const dispose of disposers)dispose();disposers=[];});

// The Object tree indicator row's alert, add-on, favorite and the series row's Table view items appear once
// the host supplies their routes, call them with the row id, and the favorite wording follows the host's favorite reader.
// Deterministic hook mock over the actual indicator port (object-tree-panel-harness). SYNTHETIC fixtures.
const dataset={instrument:{id:'synthetic',symbol:'SYNTH',name:'SYNTHETIC fixture',exchange:'LOCAL',currency:'USD',assetClass:'stock' as const,tickSize:0.01,lotSize:1,timezone:'UTC'},resolution:'1D'};
async function mount(extra:Record<string,unknown>={}){
 const h=await objectTreeHarness({drawings:[],indicators:['rsi']});disposers.push(h.dispose);
 const props:any={chart:h.chart,dataset,get indicators(){return h.indicators.port.list();},onDrawingsChanged:vi.fn(),onSelectionChange:vi.fn(),onError:vi.fn(),...extra};
 const render=()=>{hooks.cursor=0;return ObjectTreePanel({...props,indicators:props.indicators});};
 render();hooks.effects.map(effect=>effect());
 const row=(key:string)=>find(render(),node=>node.props?.['data-node-key']===key);
 const items=()=>findAll(render(),node=>node.props?.role==='menuitem').map(node=>({label:String(node.props['aria-label']),disabled:!!node.props.disabled,node}));
 return {h,render,row,items};
}

describe('INDMENU Object tree indicator row routes',()=>{
 it('without host routes the three items stay disabled',async()=>{
  const t=await mount();const [rsi]=t.h.ids;t.row('study:'+rsi).props.onContextMenu(event());
  const shown=t.items().filter(item=>/alert|indicator\/strategy|favorites/.test(item.label));
  expect(shown.length).toBe(3);expect(shown.every(item=>item.disabled)).toBe(true);
 });
 it('host routes enable alert, add-on and favorite and receive the row id',async()=>{
  const alert=vi.fn(),child=vi.fn(),favorite=vi.fn();let favorited=false;
  const t=await mount({onAddIndicatorAlert:alert,onAddChildIndicator:child,onFavoriteIndicator:(id:string)=>{favorite(id);favorited=!favorited;},isFavoriteIndicator:()=>favorited});
  const [rsi]=t.h.ids;const open=()=>{t.row('study:'+rsi).props.onContextMenu(event());return t.items();};
  let menu=open();
  const alertItem=menu.find(item=>item.label.startsWith('Add alert on '))!;expect(alertItem.disabled).toBe(false);expect(alertItem.label).not.toContain('{value}');
  alertItem.node.props.onClick();expect(alert).toHaveBeenCalledWith(rsi);
  menu=open();menu.find(item=>item.label.startsWith('Add indicator/strategy on '))!.node.props.onClick();expect(child).toHaveBeenCalledWith(rsi);
  menu=open();const add=menu.find(item=>item.label==='Add this indicator to favorites')!;expect(add.disabled).toBe(false);add.node.props.onClick();expect(favorite).toHaveBeenCalledWith(rsi);
  menu=open();expect(menu.some(item=>item.label==='Remove this indicator from favorites')).toBe(true);expect(menu.some(item=>item.label==='Add this indicator to favorites')).toBe(false);
 });
 it('a throwing favorite reader keeps the add wording',async()=>{
  const t=await mount({onFavoriteIndicator:vi.fn(),isFavoriteIndicator:()=>{throw Error('boom');}});const [rsi]=t.h.ids;
  t.row('study:'+rsi).props.onContextMenu(event());expect(t.items().some(item=>item.label==='Add this indicator to favorites')).toBe(true);
 });
 it('the series row lists Table view once the host routes it',async()=>{
  const table=vi.fn(),t=await mount({onSeriesTableView:table});
  const series=find(t.render(),node=>node.props?.['data-node-kind']==='series');series.props.onContextMenu(event());
  const item=t.items().find(row=>row.label==='Table view')!;expect(item).toBeTruthy();item.node.props.onClick();expect(table).toHaveBeenCalled();
 });
 it('studyMenu: favorited flips the wording; a null value drops the at part',()=>{
  const routes={alert:true,childStudy:true,favorite:true,visualOrder:false,intervals:true,moveTo:true,pinToScale:false,copy:true,settings:true};
  expect(studyMenu('RSI',null,routes,true,{favorited:true}).find(item=>item.id==='favorite')!.label).toBe('Remove this indicator from favorites');
  expect(studyMenu('RSI',null,routes,true).find(item=>item.id==='alert')!.label).toBe('Add alert on RSI…');
  expect(studyMenu('RSI','55.10',routes,true).find(item=>item.id==='alert')!.label).toBe('Add alert on RSI at 55.10…');
 });
});
