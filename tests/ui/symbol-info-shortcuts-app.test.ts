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

// Symbol info and the Keyboard shortcuts reference in the actual App (harness of tests/ui/shell-app.test.ts:
// controlled hook store, SYNTHETIC data). Not a DOM, native-window or packaged executable test.
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
 const keydown=()=>{render();let index=-1;hooks.effects.forEach((fn,at)=>{if(/addEventListener\(["']keydown["']/.test(String(fn)))index=at;});if(index<0)throw Error('Missing keyboard effect');hooks.effects.splice(index,1)[0]!();return listeners.get('keydown')!;};
 const ready=()=>{const native=nativeChart();node(WorkspaceChartHost).props.onReady(native.controller);render();return native;};
 return{render,node,button,main,keydown,ready};
}
import {HeaderSymbolButton} from '../../src/ui/HeaderSymbolButton';
import {WatchQuotesBinding} from '../../src/ui/live-dataset-store';
import {SymbolInfoDialog} from '../../src/ui/SymbolInfoDialog';
import {KeyboardShortcutsDialog} from '../../src/ui/KeyboardShortcutsDialog';

describe(' App wiring: Symbol info and Keyboard shortcuts',()=>{
 it('the header symbol opens Symbol info for the chart dataset, and it closes',async()=>{
  const ui=await setup();const header=ui.node(HeaderSymbolButton);expect(typeof header.props.onInfo).toBe('function');
  header.props.onInfo();const dialog=ui.node(SymbolInfoDialog);expect(dialog).toBeTruthy();
  const host=ui.node(WorkspaceChartHost).props;expect(dialog.props.dataset.provenance.datasetId).toBe(host.activeDatasetId);
  dialog.props.onClose();expect(ui.node(SymbolInfoDialog)).toBeNull();
 });
 it('Help on the right rail opens a menu with Keyboard shortcuts, which opens the reference',async()=>{
  const ui=await setup(),menu=()=>find(ui.render(),row=>row.props?.role==='menu'&&row.props['aria-label']==='Help');
  expect(menu().props.hidden).toBe(true);ui.button('Help').props.onClick();expect(menu().props.hidden).toBe(false);
  ui.button('Keyboard shortcuts').props.onClick();expect(menu().props.hidden).toBe(true);
  const dialog=ui.node(KeyboardShortcutsDialog);expect(dialog).toBeTruthy();dialog.props.onClose();expect(ui.node(KeyboardShortcutsDialog)).toBeNull();
 });
 it('Ctrl+/ opens the reference',async()=>{
  const ui=await setup();ui.ready();const listener=ui.keydown();
  const event=keyEvent('/',{ctrlKey:true});listener(event);ui.render();
  expect(event.preventDefault).toHaveBeenCalled();expect(ui.node(KeyboardShortcutsDialog)).toBeTruthy();
 });
 it('the watchlist Details Symbol info button opens the dialog for that watchlist symbol, and the toolbar command still shows the chart symbol',async()=>{
  const ui=await setup(),host=ui.node(WorkspaceChartHost).props,list=ui.node(WatchlistPanel);expect(typeof list.props.onOpenSymbolInfo).toBe('function');
  const rows=ui.node(WatchQuotesBinding).props.universe as any[],other=rows.find(row=>row.provenance.datasetId!==host.activeDatasetId);expect(other).toBeTruthy();
  expect(list.props.onOpenSymbolInfo({exchange:other.instrument.exchange,symbol:'NO SUCH SYMBOL',synthetic:other.provenance.fixture})).toBe(false);expect(ui.node(SymbolInfoDialog)).toBeNull();
  expect(list.props.onOpenSymbolInfo({exchange:other.instrument.exchange,symbol:other.instrument.symbol,synthetic:other.provenance.fixture})).toBe(true);
  const dialog=ui.node(SymbolInfoDialog);expect(dialog.props.dataset.provenance.datasetId).toBe(other.provenance.datasetId);expect(dialog.props.dataset.provenance.datasetId).not.toBe(host.activeDatasetId);
  dialog.props.onClose();expect(ui.node(SymbolInfoDialog)).toBeNull();
  list.props.onOpenSymbolInfo({exchange:other.instrument.exchange,symbol:other.instrument.symbol,synthetic:other.provenance.fixture});ui.node(SymbolInfoDialog);
  ui.node(HeaderSymbolButton).props.onInfo();expect(ui.node(SymbolInfoDialog).props.dataset.provenance.datasetId).toBe(host.activeDatasetId);
 });
});

