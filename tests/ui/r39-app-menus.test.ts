import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {indicatorClipboard} from '../../src/chart/legend-model';
import {barMarksVisibility} from '../../src/chart/context-menu';

// Root wiring of the legend Copy and Visual order rows and the new chart menu
// handlers in the actual App closures. Same explicit React scheduling as tests/ui/r4-indui-app-wiring.test.ts (the App
// function is called directly; child components are not mounted). SYNTHETIC fixture data. Not a DOM, native window, canvas
// or packaged executable test.
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
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];indicatorClipboard.clear();barMarksVisibility.clear();});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

const row=(id:string,extra:Record<string,unknown>={})=>({id,kind:'sma',inputs:{length:9,source:'close'},plots:{},visible:true,offset:0,rendererId:id,paneId:'price',diagnostics:[],presentationDiagnostics:[],policies:[],series:[],informationBars:3,latestInformationTime:null,...extra});
async function setup(rows:any[]=[]){
 vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});
 vi.stubGlobal('document',{querySelector:vi.fn(()=>null)});
 const render=()=>{hooks.cursor=0;return App();};
 render();const boot=hooks.effects[0];hooks.effects=[];boot();for(let i=0;i<5;i++)await Promise.resolve();
 const controller={drawings:{getTool:()=>null,getMode:()=>null},setTool:vi.fn(),setDrawingMode:vi.fn(),onToolChanged:()=>()=>{},onDrawingModeChanged:()=>()=>{},indicators:{list:()=>rows,subscribe:vi.fn(()=>()=>{})}};
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 const runEffect=(marker:string)=>{const index=hooks.effects.findIndex(fn=>String(fn).includes(marker));if(index<0)throw Error('Missing scheduled App effect: '+marker);return hooks.effects.splice(index,1)[0]();};
 if(rows.length){grid().onReady(controller);hooks.effects=[];render();runEffect('indicators.subscribe');}
 const legend=()=>find(render(),node=>node.props.className==='indicator-legend');
 const more=(id:string)=>find(findAll(legend(),node=>node.props?.['data-legend-row']===id)[0],node=>node.props['data-qa']==='legend-more-action').props.onClick();
 const menu=()=>find(legend(),node=>node.props.role==='menu');
 const item=(id:string)=>find(menu(),node=>node.props['data-menu-id']===id);
 return{render,legend,grid,more,menu,item,controller};
}

describe(' legend Copy and Visual order in App',()=>{
 it('Copy is listed and fills the indicator clipboard; a lone indicator has no Visual order',async()=>{
  const ui=await setup([row('only-sma')]);ui.more('only-sma');
  expect(ui.item('visualOrder')).toBeNull();
  const ids=findAll(ui.menu(),node=>node.props.role==='menuitem').map(node=>node.props['data-menu-id']);
  expect(ids).toEqual(['alert','addIndicator','favorite','intervals','moveTo','pinToScale','copy','hide','remove','objectTree','settings']);
  expect(content(ui.item('copy'))).toContain('Ctrl + C');
  ui.item('copy').props.onClick();
  expect(indicatorClipboard.get()).toMatchObject({kind:'sma',title:'SMA',settings:{inputs:{length:9,source:'close'}}});
  expect(ui.menu()).toBeNull();
 });
 it('two indicators on one pane: Visual order opens its submenu with the steps that can move',async()=>{
  const ui=await setup([row('first'),row('second'),row('own',{kind:'rsi',paneId:'pane-rsi'})]);
  ui.more('first');ui.item('visualOrder').props.onClick();
  const sub=find(ui.legend(),node=>node.props.role==='menu'&&node.props['aria-label']==='Visual order');
  expect(findAll(sub,node=>node.type==='button').map(node=>[content(node),!!node.props.disabled])).toEqual([['Bring to front',true],['Send to back',false],['Bring forward',true],['Send backward',false]]);
  ui.more('own');expect(ui.menu()).not.toBeNull();expect(ui.item('copy')).not.toBeNull();expect(ui.item('visualOrder')).toBeNull();
 });
});

describe(' chart menu handlers in App',()=>{
 it('the chart host receives the indicator, series and body row handlers',async()=>{
  const ui=await setup([row('only-sma')]),actions=ui.grid().contextActions;
  for(const id of ['indicator-settings','indicator-hide','indicator-remove','indicator-alert','indicator-add-on','indicator-intervals','indicator-copy','indicator-order','indicator-move','indicator-pin','indicator-paste','series-hide','series-pin','watchlist-add','hline','hide-marks'])expect(typeof actions[id],id).toBe('function');
 });
 it('Hide marks on bars toggles the clicked chart cell; indicator rows refuse a menu from another chart',async()=>{
  const ui=await setup([row('only-sma')]),actions=ui.grid().contextActions;
  const lease={release(){},isCurrent:()=>true,isOwnerCurrent:()=>true};
  expect(actions['hide-marks']({cellId:'cell-x',entity:{kind:'chart'},controller:ui.controller},lease)).toBe(true);
  expect(barMarksVisibility.hiddenFor('cell-x')).toBe(true);
  expect(actions['hide-marks']({cellId:'cell-x',entity:{kind:'chart'},controller:ui.controller},lease)).toBe(true);
  expect(barMarksVisibility.hiddenFor('cell-x')).toBe(false);
  expect(actions['indicator-copy']({cellId:'cell-x',entity:{kind:'indicator',id:'only-sma',rendererId:'only-sma'},controller:{}},lease)).toMatchObject({ok:false,message:expect.stringMatching(/another chart/)});
  expect(indicatorClipboard.get()).toBeNull();
 });
});
