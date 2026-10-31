import {PortfolioDialog} from '../../src/ui/PortfolioDialog';
import {MarketViewsDialog} from '../../src/ui/MarketViewsDialog';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {ChartSettingsDialog} from '../../src/ui/chart-settings-dialog';
import {AboutDialog} from '../../src/ui/AboutDialog';
import {ImportDialog} from '../../src/ui/ImportDialog';
import {CalendarDialog} from '../../src/ui/CalendarDialog';
import {nextRailPanel} from '../../src/ui/shell';
import {ObjectTreeDataWindowWidget} from '../../src/ui/ObjectTreePanelWidget';
import {ChartBottomToolbar} from '../../src/ui/bottom-toolbar';
import {BOTTOM_RANGES} from '../../src/chart/bottom-toolbar';

// Actual App closures with controlled React scheduling (same harness pattern as the other App tests).
// Covers the SHELL frame: main menu, right rail panels/actions, layout setup, toast, routed hotkeys.
// Not a DOM, native-window, canvas or packaged executable test.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.length!==old.deps.length||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
  useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},
  useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
  useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),
  useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.length!==old.length||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}},
  useLayoutEffect:()=>{}
 };
});
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{
 if(Array.isArray(node)){for(const child of node)findAll(child,test,out);}
 else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}
 return out;
}
const find=(node:any,test:(node:any)=>boolean)=>findAll(node,test)[0]??null;
function content(node:any):string{return Array.isArray(node)?node.map(content).join(''):node?.props?content(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';}
function keyEvent(key:string,extra:Record<string,unknown>={}){return{key,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,isComposing:false,repeat:false,target:{closest:()=>null},preventDefault:vi.fn(),stopImmediatePropagation:vi.fn(),...extra};}
function nativeChart(){
 let tool:string|null=null,mode:string|null=null;
 const controller={drawings:{getTool:()=>tool,getMode:()=>mode},setTool:vi.fn((value:string|null)=>{tool=value;}),setDrawingMode:vi.fn((value:any)=>{mode=value;}),onToolChanged:()=>()=>{},onDrawingModeChanged:()=>()=>{},indicators:{list:()=>[],subscribe:vi.fn(()=>()=>{})},priceScale:{execute:vi.fn(()=>({ok:true}))}};
 return{controller};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
async function setup(){
 const listeners=new Map<string,Function>();
 vi.stubGlobal('window',{addEventListener:vi.fn((name:string,fn:Function)=>listeners.set(name,fn)),removeEventListener:vi.fn()});
 vi.stubGlobal('document',{querySelector:vi.fn(()=>null),getElementById:vi.fn(()=>null)});
 const render=()=>{hooks.cursor=0;return App();};
 render();const boot=hooks.effects[0];hooks.effects=[];boot();for(let i=0;i<5;i++)await Promise.resolve();
 const node=(type:any)=>find(render(),row=>row.type===type);
 const button=(name:string)=>{const rows=findAll(render(),row=>row.type==='button'&&(row.props['aria-label']===name||content(row)===name));if(rows.length!==1)throw Error('Expected one App button '+name+', found '+rows.length);return rows[0];};
 const main=()=>find(render(),row=>row.type==='main');
 const keydown=()=>{render();let index=-1;hooks.effects.forEach((fn,at)=>{if(/window\.addEventListener\(["']keydown["']/.test(String(fn)))index=at;});if(index<0)throw Error('Missing keyboard effect');hooks.effects.splice(index,1)[0]!();return listeners.get('keydown')!;};
 const ready=()=>{const native=nativeChart();node(WorkspaceChartHost).props.onReady(native.controller);render();return native;};
 return{render,node,button,main,keydown,ready};
}

describe('SHELL frame through the actual App handlers',()=>{
 it('main menu: one trigger, hidden role=menu items that close the menu before opening their dialog',async()=>{
  const ui=await setup(),trigger=()=>ui.button('Main menu');
  expect(trigger().props['aria-haspopup']).toBe('menu');expect(trigger().props['aria-expanded']).toBe(false);
  const menu=()=>find(ui.render(),row=>row.props?.role==='menu'&&row.props['aria-label']==='Main menu');
  expect(menu().props.hidden).toBe(true);
  expect(findAll(menu(),row=>row.props?.role==='menuitem').map(content)).toEqual(['About OpenCandle','Import data','Export workspace','Export bars','Export image','Data sources','Local storage']);
  trigger().props.onClick();expect(trigger().props['aria-expanded']).toBe(true);expect(menu().props.hidden).toBe(false);
  ui.button('Local storage').props.onClick();expect(menu().props.hidden).toBe(true);expect(ui.node(ChartSettingsDialog)).toBeTruthy();
  ui.node(ChartSettingsDialog).props.onCancel();
  trigger().props.onClick();ui.button('About OpenCandle').props.onClick();expect(ui.node(AboutDialog)).toBeTruthy();expect(menu().props.hidden).toBe(true);
  ui.node(AboutDialog).props.onClose();ui.button('Import data').props.onClick();expect(ui.node(ImportDialog)).toBeTruthy();
 });
 it('right rail: panel slots toggle the widget panel and collapse it; actions keep their names and dialogs',async()=>{
  const ui=await setup();
  const rail=find(ui.render(),row=>row.type==='nav'&&row.props['aria-label']==='Right toolbar');
  expect(rail.props['data-lv-rail']).toBe('');
  const names=findAll(rail,row=>row.type==='button'&&row.props.className==='lv-rail-button').map(row=>row.props.children);
  expect(names).toEqual(['Watchlist','Alerts','Object tree and data window','Stock screener','Script editor','Calendar','News and filings','Fundamentals','Heatmap','Markets','Portfolio','Strategy tester','Paper trading','Help']);
  const panel=()=>find(ui.render(),row=>row.type==='aside'&&row.props.className==='right-panel');
  expect(ui.button('Watchlist').props['aria-pressed']).toBe(true);// The Watchlist panel heading was dropped (its one-row header shows the list name); the panel is still visible and named.
  expect(panel().props.hidden).toBe(false);expect(panel().props['aria-label']).toBe('Watchlist');expect(find(panel(),row=>row.type==='strong')).toBeFalsy();expect(find(panel(),row=>row.type===WatchlistPanel)).toBeTruthy();
  const tree='Object tree and data window';
  ui.button(tree).props.onClick();expect(ui.button(tree).props['aria-pressed']).toBe(true);expect(ui.button('Watchlist').props['aria-pressed']).toBe(false);
  expect(find(panel(),row=>row.props?.className==='panel-heading')).toBeNull();const widget=find(panel(),row=>row.type===ObjectTreeDataWindowWidget);expect(widget.props.tab).toBe('object_tree');
  widget.props.onTabChange('data-window');expect(find(ui.render(),row=>row.type===ObjectTreeDataWindowWidget).props.tab).toBe('data-window');
  ui.button(tree).props.onClick();expect(panel().props.hidden).toBe(true);expect(ui.main().props.className).toBe('workspace lv-panel-collapsed');
  ui.button('Watchlist').props.onClick();expect(panel().props.hidden).toBe(false);expect(ui.main().props.className).toBe('workspace');
  ui.button('Calendar').props.onClick();expect(ui.node(CalendarDialog).props.initialKind).toBeUndefined();
  expect(ui.button('Open calendar views').props['aria-haspopup']).toBe('menu');
  ui.button('Portfolio').props.onClick();expect(ui.node(PortfolioDialog)).toBeTruthy();// PORT/MARKETS: each new dialog opens from its right-rail entry.
  ui.button('Markets').props.onClick();expect(ui.node(MarketViewsDialog)).toBeTruthy();
  expect(nextRailPanel('watchlist','watchlist')).toBeNull();expect(nextRailPanel(null,'objects')).toBe('objects');expect(nextRailPanel('objects','watchlist')).toBe('watchlist');
 });
 it('no rows below the chart besides the bottom toolbar; messages stay in one role=status region',async()=>{
  const ui=await setup(),tree=ui.render();
  expect(find(tree,row=>row.props?.className==='analysis-tabs')).toBeNull();expect(find(tree,row=>row.props?.className==='workspace-footer')).toBeNull();
  const status=findAll(tree,row=>row.type==='output'&&row.props.role==='status');expect(status).toHaveLength(1);expect(status[0].props['aria-live']).toBe('polite');
  expect(find(tree,row=>row.type==='footer'&&row.props.className==='statusbar')).toBeTruthy();
  const bottom=find(tree,row=>row.type===ChartBottomToolbar);expect(bottom).toBeTruthy();expect(BOTTOM_RANGES.map(row=>row.label)).toEqual(['1D','5D','1M','3M','6M','YTD','1Y','5Y','All']);
  expect(typeof bottom.props.onGoTo).toBe('function');expect(typeof bottom.props.onRange).toBe('function');expect(bottom.props.chartReady).toBe(false);
 });
 it('layout setup toggles the header popover state and the anchor variable',async()=>{
  const ui=await setup();ui.ready();
  expect(ui.main().props['data-layout-setup']).toBeUndefined();
  ui.button('Layout setup').props.onClick({currentTarget:{getBoundingClientRect:()=>({right:1500})}});
  expect(ui.main().props['data-layout-setup']).toBe('open');expect(ui.button('Layout setup').props['aria-expanded']).toBe(true);
  ui.button('Layout setup').props.onClick({currentTarget:null});expect(ui.main().props['data-layout-setup']).toBeUndefined();
 });
 it('Create alert (header button and Alt+A) opens the alert manager with a fresh create request',async()=>{
  const ui=await setup();
  expect(ui.button('Create alert').props.disabled).toBe(true);
  ui.ready();
  const alerts=()=>ui.node(WorkspaceAlerts).props;expect(alerts().open).toBe(false);expect(alerts().createRequest).toBeNull();
  ui.button('Create alert').props.onClick();expect(alerts().open).toBe(true);expect(alerts().createRequest).toEqual({});
  const first=alerts().createRequest;alerts().onClose();expect(alerts().createRequest).toBeNull();
  const handler=ui.keydown(),typing=keyEvent('a',{altKey:true,target:{closest:()=>({})}});handler(typing);expect(alerts().open).toBe(false);expect(typing.preventDefault).not.toHaveBeenCalled();
  const shortcut=keyEvent('a',{altKey:true});handler(shortcut);expect(shortcut.preventDefault).toHaveBeenCalledOnce();expect(alerts().open).toBe(true);expect(alerts().createRequest).toEqual({});expect(alerts().createRequest).not.toBe(first);
 });
 it('drawing hotkeys: Alt+T, Alt+F and Alt+Shift+R arm their tools; modified or typing keys do not',async()=>{
  const ui=await setup(),native=ui.ready(),handler=ui.keydown();
  for(const [key,extra] of [['t',{altKey:true}],['f',{altKey:true}],['R',{altKey:true,shiftKey:true}]] as const)handler(keyEvent(key,extra));
  expect(native.controller.setTool.mock.calls.map(args=>args[0])).toEqual(['trendline','fibretracement','box']);
  handler(keyEvent('f',{altKey:true,ctrlKey:true}));handler(keyEvent('f',{altKey:true,target:{closest:()=>({})}}));handler(keyEvent('r',{altKey:true}));
  expect(native.controller.setTool).toHaveBeenCalledTimes(3);
  expect(native.controller.priceScale.execute).toHaveBeenCalledWith('resetChart',{origin:'keyboard'});
 });
});
