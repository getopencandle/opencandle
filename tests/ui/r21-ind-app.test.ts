import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {IndicatorDialog} from '../../src/ui/IndicatorDialog';
import {ObjectTreeDataWindowWidget} from '../../src/ui/ObjectTreePanelWidget';

// root wiring in the actual App closures (same explicit React scheduling as tests/ui/r4-indui-app-wiring.test.ts
// the App function is called directly, child components are not mounted). SYNTHETIC fixture rows and a SYNTHETIC pane
// list. Not a DOM, native window, canvas or packaged executable test.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.length!==old.deps.length||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
  useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},
  useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
  useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),
  useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.length!==old.length||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}
 };
});
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{
 if(Array.isArray(node)){for(const child of node)findAll(child,test,out);}
 else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}
 return out;
}
const find=(node:any,test:(node:any)=>boolean)=>findAll(node,test)[0]??null;
function content(node:any):string{return Array.isArray(node)?node.map(content).join(''):node?.props?content(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

const row=(id:string,extra:Record<string,unknown>={})=>({id,kind:'sma',inputs:{length:9,source:'close'},plots:{},visible:true,offset:0,rendererId:'n-'+id,paneId:'price',diagnostics:[],presentationDiagnostics:[],policies:[],series:[],informationBars:3,latestInformationTime:null,...extra});
async function setup(rows:any[],panes:any[]|null){
 vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});
 vi.stubGlobal('document',{querySelector:vi.fn(()=>null)});
 const render=()=>{hooks.cursor=0;return App();};
 render();const boot=hooks.effects[0];hooks.effects=[];boot();for(let i=0;i<5;i++)await Promise.resolve();
 const move=vi.fn();
 const controller:any={drawings:{getTool:()=>null,getMode:()=>null},setTool:vi.fn(),setDrawingMode:vi.fn(),onToolChanged:()=>()=>{},onDrawingModeChanged:()=>()=>{},indicators:{list:()=>rows,subscribe:vi.fn(()=>()=>{}),move,serialize:()=>rows.map(({rendererId,diagnostics,presentationDiagnostics,policies,series,informationBars,latestInformationTime,...saved})=>saved)},...(panes?{chart:{panes:{list:()=>panes}}}:{})};
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 const runEffect=(marker:string)=>{const index=hooks.effects.findIndex(fn=>String(fn).includes(marker));if(index<0)throw Error('Missing scheduled App effect: '+marker);return hooks.effects.splice(index,1)[0]();};
 grid().onReady(controller);hooks.effects=[];render();runEffect('indicators.subscribe');
 const legend=()=>find(render(),node=>node.props.className==='indicator-legend');
 const rowOf=(id:string)=>find(legend(),node=>node.props?.['data-legend-row']===id);
 const more=(id:string)=>find(rowOf(id),node=>node.props['data-qa']==='legend-more-action').props.onClick();
 const menuItem=(id:string)=>find(find(legend(),node=>node.props.role==='menu'),node=>node.props['data-menu-id']===id);
 const submenu=()=>find(legend(),node=>node.props.role==='menu'&&node.props['aria-label']==='Move to');
 return{render,legend,rowOf,more,menuItem,submenu,controller,move};
}
const twoPanes=[{id:'price',kind:'price',indicators:[{id:'n-sma'}]},{id:'r-1',kind:'study',indicators:[{id:'n-rsi'}]}];
const rows=()=>[row('sma'),row('rsi',{kind:'rsi',inputs:{length:14,source:'close'},paneId:'lv-pane-rsi'})];

describe(' legend Move to lists existing panes (IND.OBJECT_TREE.MOVE_PANE, legend More)',()=>{
 it('with two panes the submenu adds Existing pane above/below with the reason on the missing neighbour',async()=>{
  const ui=await setup(rows(),twoPanes);
  ui.more('rsi');ui.menuItem('moveTo').props.onClick();
  const buttons=findAll(ui.submenu(),node=>node.type==='button');
  expect(buttons.map(node=>content(node))).toEqual(['New pane above','New pane below','Existing pane above','Existing pane below']);
  expect(buttons[2].props.disabled).toBe(false);
  expect(buttons[3].props.disabled).toBe(true);expect(buttons[3].props.title).toMatch(/no pane below/);
 });
 it('the submenu item ids are the App route choices (existing-above / existing-below)',async()=>{
  const ui=await setup(rows(),twoPanes);
  ui.more('rsi');ui.menuItem('moveTo').props.onClick();
  expect(findAll(ui.submenu(),node=>node.type==='button').map(node=>node.props['data-menu-id'])).toEqual(['above','below','existing-above','existing-below']);
 });
 it('without a readable pane list the submenu keeps the two cited entries',async()=>{
  const ui=await setup(rows(),null);
  ui.more('rsi');ui.menuItem('moveTo').props.onClick();
  expect(findAll(ui.submenu(),node=>node.type==='button').map(node=>content(node))).toEqual(['New pane above','New pane below']);
 });
});

describe(' collapsed legend counter',()=>{
 it('the collapsed toggler shows how many indicators the legend holds; the expanded one does not',async()=>{
  const ui=await setup(rows(),twoPanes);
  const toggler=()=>find(ui.render(),node=>node.props['data-qa']==='legend-toggler');
  const counter=()=>find(ui.render(),node=>node.props['data-qa']==='legend-collapsed-sources-counter');
  expect(counter()).toBeNull();
  toggler().props.onClick();
  expect(counter()).not.toBeNull();expect(content(counter())).toBe('2');
  expect(toggler().props['aria-label']).toMatch(/2 indicators/);
  toggler().props.onClick();
  expect(counter()).toBeNull();
 });
});

describe(' Object tree routes in App',()=>{
 async function tree(){
  const ui=await setup(rows(),twoPanes);
  ui.more('sma');ui.menuItem('objectTree').props.onClick();
  return {ui,props:()=>find(ui.render(),node=>node.type===ObjectTreeDataWindowWidget).props.objectTree};
 }
 it('opts in to existing-pane moves and a host Pin to scale route',async()=>{
  const {props}=await tree();
  expect(typeof props().onIndicatorMoveExisting).toBe('function');
  expect(typeof props().onIndicatorScale).toBe('function');
  expect(typeof props().indicatorScale).toBe('function');
 });
 it('Visibility on intervals from the Object tree opens the settings on the Visibility tab',async()=>{
  const {ui,props}=await tree();
  props().onOpenIndicatorSettings('rsi','visibility');
  const dialog=find(ui.render(),node=>node.type===IndicatorDialog);
  expect(dialog.props.initialSelected).toBe('rsi');expect(dialog.props.initialTab).toBe('Visibility');
 });
 it('Settings from the Object tree still opens the instance without a tab',async()=>{
  const {ui,props}=await tree();
  props().onOpenIndicatorSettings('sma');
  const dialog=find(ui.render(),node=>node.type===IndicatorDialog);
  expect(dialog.props.initialSelected).toBe('sma');expect(dialog.props.initialTab).toBeNull();
 });
});
