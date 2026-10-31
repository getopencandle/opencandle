import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {SymbolInfoDialog} from '../../src/ui/SymbolInfoDialog';

// root wiring: the main series Flag and More buttons, the More menu routes (registry commands, Hide, the watchlist
// submenu with Create new list) and the Status line Values and Background switches, in the actual App closures. Same explicit
// React scheduling as tests/ui/r4-indui-app-wiring.test.ts (App is called directly; child components are not mounted).
// Written before the wiring landed. SYNTHETIC fixture data. Not a DOM, native window, canvas or packaged executable test.
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

const row=(id:string)=>({id,kind:'sma',inputs:{length:9,source:'close'},plots:{},visible:true,offset:0,rendererId:id,paneId:'price',diagnostics:[],presentationDiagnostics:[],policies:[],series:[],informationBars:3,latestInformationTime:null});
async function setup(rows:any[]=[]){
 vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});
 vi.stubGlobal('document',{querySelector:vi.fn(()=>null)});
 const render=()=>{hooks.cursor=0;return App();};
 render();const boot=hooks.effects[0];hooks.effects=[];boot();for(let i=0;i<5;i++)await Promise.resolve();
 const controller={drawings:{getTool:()=>null,getMode:()=>null},setTool:vi.fn(),setDrawingMode:vi.fn(),onToolChanged:()=>()=>{},onDrawingModeChanged:()=>()=>{},
  indicators:{list:()=>rows,subscribe:vi.fn(()=>()=>{}),values:()=>({series:[{id:'sma',values:[1,2,3]}]})},
  priceScale:{settings:()=>({mainSide:'right'}),execute:vi.fn(()=>({ok:true}))}};
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost).props;
 const runEffect=(marker:string)=>{const index=hooks.effects.findIndex(fn=>String(fn).includes(marker));if(index<0)throw Error('Missing scheduled App effect: '+marker);return hooks.effects.splice(index,1)[0]();};
 grid().onReady(controller);hooks.effects=[];render();
 if(rows.length)runEffect('indicators.subscribe');
 const heading=()=>find(render(),node=>node.props.className==='chart-heading');
 const legend=()=>find(render(),node=>node.props.className==='indicator-legend');
 const workspaceCell=()=>hooks.cells.findIndex(cell=>cell&&typeof cell==='object'&&'chartSettings' in cell&&'grid' in cell&&'symbol' in cell);
 const workspace=()=>hooks.cells[workspaceCell()];
 const patch=(next:Record<string,unknown>)=>{const index=workspaceCell();hooks.cells[index]={...hooks.cells[index],...next};};
 const menu=()=>find(render(),node=>node.props.className==='lv-series-menu-host');
 const more=()=>find(heading(),node=>node.props['data-qa']==='legend-more-action').props.onClick();
 const item=(id:string)=>find(menu(),node=>node.props['data-menu-id']===id);
 return{render,heading,legend,workspace,patch,menu,more,item,controller};
}

describe(' main series legend buttons and More menu in App',()=>{
 it('the series row shows Flag symbol and More (28x22) and More opens the series menu',async()=>{
  const ui=await setup();
  const qa=findAll(ui.heading(),node=>node.type==='button'&&typeof node.props['data-qa']==='string');
  expect(qa.map(node=>node.props['data-qa'])).toEqual(['legend-flag-action','legend-more-action']);
  for(const button of qa)expect(button.props.style).toMatchObject({width:28,height:22});
  expect(ui.menu()).toBeNull();
  ui.more();
  const symbol=ui.workspace().symbol;
  const ids=findAll(ui.menu(),node=>node.props.role==='menuitem').map(node=>node.props['data-menu-id']);
  expect(ids).toEqual(['alert','order','addIndicator','symbolInfo','metrics','copyPrice','paste','tableView','moveTo','pinToScale','hide','watchlist','note','settings']);
  expect(content(ui.item('watchlist'))).toBe('Add '+symbol+' to watchlist');
  expect(content(ui.item('alert'))).toContain('Alt + A');
  expect(find(ui.heading(),node=>node.props['data-qa']==='legend-more-action').props['aria-expanded']).toBe(true);
 });
 it('Symbol info runs the registry command and Hide hides the main series (the row then reads Show)',async()=>{
  const ui=await setup();
  ui.more();ui.item('symbolInfo').props.onClick();
  expect(ui.menu()).toBeNull();
  expect(find(ui.render(),node=>node.type===SymbolInfoDialog)).not.toBeNull();
  find(ui.render(),node=>node.type===SymbolInfoDialog).props.onClose();
  ui.more();ui.item('hide').props.onClick();
  const grid=ui.workspace().grid;
  expect(grid.cells[grid.layout.activeCellId].seriesHidden).toBe(true);
  ui.more();expect(content(ui.item('hide'))).toBe('Show');
 });
 it('Move to lists both new panes disabled with a reason; Pin to scale moves the main scale through the price scale port',async()=>{
  const ui=await setup();
  ui.more();ui.item('moveTo').props.onClick();
  const sub=find(ui.menu(),node=>node.props.role==='menu'&&node.props['aria-label']==='Move to');
  expect(findAll(sub,node=>node.type==='button').map(node=>[content(node),node.props.disabled])).toEqual([['New pane above',true],['New pane below',true]]);
  ui.item('pinToScale').props.onClick();
  const pin=find(ui.menu(),node=>node.props.role==='menu'&&node.props['aria-label']==='Pin to scale (now right)');
  find(pin,node=>node.props['data-menu-id']==='left').props.onClick();
  expect(ui.controller.priceScale.execute).toHaveBeenCalledWith('moveLeft',{origin:'chart-pointer'});
 });
 it('the watchlist submenu adds the symbol to the chosen list, and Create new list makes a list holding it',async()=>{
  const ui=await setup();
  const book=ui.workspace().watchBook,symbol=ui.workspace().symbol,first=book.lists[0];
  ui.more();ui.item('watchlist').props.onClick();
  const sub=()=>find(ui.menu(),node=>node.props.role==='menu'&&node.props['aria-label']==='Add '+symbol+' to watchlist');
  const entries=findAll(sub(),node=>node.props.role==='menuitemradio').map(node=>content(node));
  expect(entries).toEqual([...book.lists.map((list:any)=>list.name),'Create new list…']);
  ui.more();expect(ui.menu()).toBeNull();
  // Remove the symbol from the first list so adding it is observable.
  ui.patch({watchBook:{...book,lists:book.lists.map((list:any,i:number)=>i===0?{...list,rows:list.rows.filter((r:any)=>r.kind!=='symbol'||r.reference.symbol!==symbol)}:list)}});
  ui.more();ui.item('watchlist').props.onClick();
  find(sub(),node=>node.props['data-menu-id']==='list:'+first.id).props.onClick();
  expect(ui.workspace().watchBook.lists[0].rows.some((r:any)=>r.kind==='symbol'&&r.reference.symbol===symbol)).toBe(true);
  ui.more();ui.item('watchlist').props.onClick();
  find(sub(),node=>node.props['data-menu-id']==='create').props.onClick();
  const form=find(sub(),node=>node.type==='form');
  expect(form).not.toBeNull();
  find(form,node=>node.type==='input').props.onChange({target:{value:'Legend picks'}});
  find(sub(),node=>node.type==='form').props.onSubmit({preventDefault:()=>{}});
  const created=ui.workspace().watchBook.lists.find((list:any)=>list.name==='Legend picks');
  expect(created.rows.map((r:any)=>r.reference?.symbol)).toEqual([symbol]);
  expect(ui.menu()).toBeNull();
 });
 it('Flag symbol sets and clears the red flag for the chart symbol',async()=>{
  const ui=await setup();
  const flag=()=>find(ui.heading(),node=>node.props['data-qa']==='legend-flag-action'),symbol=ui.workspace().symbol;
  expect(flag().props['aria-pressed']).toBe(false);
  flag().props.onClick();
  expect(ui.workspace().watchBook.flags.filter((f:any)=>f.reference.symbol===symbol).map((f:any)=>f.color)).toEqual(['red']);
  expect(flag().props['aria-pressed']).toBe(true);
  flag().props.onClick();
  expect(ui.workspace().watchBook.flags.some((f:any)=>f.reference.symbol===symbol)).toBe(false);
 });
});

describe(' Status line switches in App',()=>{
 it('Values off removes the indicator legend values; Background off clears the series row background',async()=>{
  const ui=await setup([row('only-sma')]);
  expect(findAll(ui.legend(),node=>node.props['data-legend-values']).length).toBe(1);
  ui.patch({appearance:{...ui.workspace().appearance,indicatorValuesVisible:false}});
  expect(findAll(ui.legend(),node=>node.props['data-legend-values']).length).toBe(0);
  expect(ui.heading().props['data-status-background']).toBe('on');
  expect(String(ui.heading().props.style?.background)).toContain('color-mix');
  const ws=ui.workspace();
  ui.patch({chartSettings:{...ws.chartSettings,statusLine:{...ws.chartSettings.statusLine,background:{visible:false,transparency:50}}}});
  expect(ui.heading().props['data-status-background']).toBe('off');
  expect(ui.heading().props.style?.background).toBeUndefined();
 });
});
