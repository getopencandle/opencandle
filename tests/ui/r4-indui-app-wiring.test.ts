import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {IndicatorDialog} from '../../src/ui/IndicatorDialog';
import {ObjectTreeDataWindowWidget} from '../../src/ui/ObjectTreePanelWidget';
import {LEGEND_TOGGLER_TOOLTIP,LEGEND_TOGGLER_COLLAPSED_TOOLTIP} from '../../src/chart/status-line-model';

// R4 root wiring of the legend strip, More menu, legend toggler and series status line in the actual App closures.
// Same explicit React scheduling as tests/ui/claude-app-integration.test.ts (the App function is called directly; child
// components are not mounted). Written before the wiring landed. SYNTHETIC fixture data. Not a DOM, native window,
// canvas or packaged executable test.
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
 const heading=()=>find(render(),node=>node.props.className==='chart-heading');
 const legend=()=>find(render(),node=>node.props.className==='indicator-legend');
 const workspaceCell=()=>hooks.cells.findIndex(cell=>cell&&typeof cell==='object'&&'chartSettings' in cell&&'grid' in cell&&'symbol' in cell);
 const setStatusLine=(patch:Record<string,unknown>)=>{const index=workspaceCell();const ws=hooks.cells[index];hooks.cells[index]={...ws,chartSettings:{...ws.chartSettings,statusLine:{...ws.chartSettings.statusLine,...patch}}};};
 return{render,heading,legend,setStatusLine,controller};
}
const parts=(node:any)=>findAll(node,child=>typeof child.props?.['data-status-part']==='string').map(child=>child.props['data-status-part']);

describe('R4 series status line in App',()=>{
 it('the chart heading renders the status line parts in fact order, interval and exchange included',async()=>{
  const ui=await setup(),heading=ui.heading();
  expect(parts(heading)).toEqual(['logo','title','interval','exchange','chartValues','chartValues','chartValues','chartValues','barChange']);
  const interval=content(find(ui.render(),node=>node.props.className==='interval-badge'));
  expect(content(find(heading,node=>node.props['data-status-part']==='interval'))).toContain(interval);
  expect(content(find(heading,node=>node.props['data-status-part']==='exchange')).replace(' · ','').trim().length).toBeGreaterThan(0);
  // UI audit 1028 #11: one quiet DEMO badge; the synthetic namespace reads as its source, not SYNTHETIC.
  expect(content(heading)).toContain('DEMO');expect(content(heading)).not.toContain('SYNTHETIC');
 });
 it('the status line toggles in the saved chart settings change what App renders',async()=>{
  const ui=await setup();
  ui.setStatusLine({title:{visible:false,source:'name'},logo:false,volume:true});
  expect(parts(ui.heading())).toEqual(['interval','exchange','chartValues','chartValues','chartValues','chartValues','barChange','volume']);
  ui.setStatusLine({chartValues:false,barChange:false,volume:false,background:{visible:false,transparency:50}});
  expect(parts(ui.heading())).toEqual(['interval','exchange']);
  expect(ui.heading().props.style?.background).toBeUndefined();
 });
});

describe('R4 indicator legend strip, More menu and toggler in App',()=>{
 it('each row renders the model title and arguments and the model hover buttons in order',async()=>{
  const ui=await setup([row('first-sma'),row('second-sma',{presentation:{schemaVersion:1,precision:'default',guides:{},fills:{},visibility:{schemaVersion:1,mode:'include',intervals:['1D'],ranges:[]}}})]);
  // Rows are grouped per pane since r17: each row is a [data-legend-row] node inside its pane group.
  const rowOf=(id:string)=>findAll(ui.legend(),node=>node.props?.['data-legend-row']===id)[0],first=rowOf('first-sma'),second=rowOf('second-sma');
  expect(content(first.props.children[0])).toContain('SMA 9 close');expect(content(first.props.children[0])).toContain('#1');
  const qa=(entry:any)=>findAll(entry,node=>node.type==='button'&&typeof node.props['data-qa']==='string').map(node=>node.props['data-qa']);
  expect(qa(first)).toEqual(['legend-show-hide-action','legend-settings-action','legend-delete-action','legend-more-action']);
  expect(qa(second)).toEqual(['legend-show-hide-action','legend-interval-show-hide-action','legend-settings-action','legend-delete-action','legend-more-action']);
  for(const button of findAll(first,node=>node.type==='button'&&node.props['data-qa']))expect(button.props.style).toMatchObject({width:28,height:22});
 });
 it('the indicator titles and inputs toggles gate the legend readout',async()=>{
  const ui=await setup([row('only-sma')]);
  ui.setStatusLine({indicatorInputs:false});
  expect(content(ui.legend().props.children[0].props.children[0]).trim()).toBe('SMA');
  ui.setStatusLine({indicatorTitles:false,indicatorInputs:true});
  expect(content(ui.legend().props.children[0].props.children[0]).trim()).toBe('9 close');
 });
 it('More opens the 15-row legend menu (Copy is connected; Visual order is hidden for a lone indicator) with unavailable rows showing their reason',async()=>{
  const ui=await setup([row('only-sma')]);
  find(ui.legend(),node=>node.props['data-qa']==='legend-more-action').props.onClick();
  const menu=find(ui.legend(),node=>node.props.role==='menu');
  expect(menu.props['aria-label']).toBe('More for SMA 9 close');
  const rows=findAll(menu,node=>node.props.role==='separator'||node.props.role==='menuitem');
  expect(rows.length).toBe(15);
  expect(rows.filter(node=>node.props.role==='menuitem').map(node=>node.props['data-menu-id'])).toEqual(['alert','addIndicator','favorite','intervals','moveTo','pinToScale','copy','hide','remove','objectTree','settings']);
  const item=(id:string)=>find(menu,node=>node.props['data-menu-id']===id);
  // Copy is connected (indicator clipboard); Visual order needs another indicator on the pane.
  expect(item('visualOrder')).toBeNull();expect(item('copy')).not.toBeNull();
  expect(item('pinToScale').props.disabled).toBe(true);expect(item('pinToScale').props.title).toMatch(/not mounted/);
  expect(content(item('alert'))).toContain('Alt + A');
 });
 it('More menu routes: Settings opens the instance, Object tree opens the rail panel, Move to lists both new panes',async()=>{
  const ui=await setup([row('only-sma')]);
  const more=()=>find(ui.legend(),node=>node.props['data-qa']==='legend-more-action').props.onClick();
  const item=(id:string)=>find(find(ui.legend(),node=>node.props.role==='menu'),node=>node.props['data-menu-id']===id);
  more();item('settings').props.onClick();
  expect(find(ui.render(),node=>node.type===IndicatorDialog).props.initialSelected).toBe('only-sma');
  find(ui.render(),node=>node.type===IndicatorDialog).props.onClose();
  more();item('moveTo').props.onClick();
  const sub=find(ui.legend(),node=>node.props.role==='menu'&&node.props['aria-label']==='Move to');
  expect(findAll(sub,node=>node.type==='button').map(node=>content(node))).toEqual(['New pane above','New pane below']);
  item('objectTree').props.onClick();
  expect(find(ui.legend(),node=>node.props.role==='menu')).toBeNull();
  expect(find(ui.render(),node=>node.type===ObjectTreeDataWindowWidget)).not.toBeNull();
 });
 it('the legend toggler collapses and expands the rows with the model tooltip',async()=>{
  const ui=await setup([row('only-sma')]);
  const toggler=()=>find(ui.render(),node=>node.props['data-qa']==='legend-toggler');
  expect(toggler().props.title).toBe(LEGEND_TOGGLER_TOOLTIP);expect(toggler().props['aria-expanded']).toBe(true);
  toggler().props.onClick();
  expect(toggler().props.title).toBe(LEGEND_TOGGLER_COLLAPSED_TOOLTIP);expect(toggler().props['aria-expanded']).toBe(false);
  expect(findAll(ui.legend(),node=>node.props['data-legend-row']).length).toBe(0);
  toggler().props.onClick();
  expect(findAll(ui.legend(),node=>node.props['data-legend-row']).length).toBe(1);
 });
});
