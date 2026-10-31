import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {BOTTOM_PANEL_DEFAULT,BOTTOM_PANEL_KEY_STEP,BOTTOM_PANEL_MAX_HEIGHT,BOTTOM_PANEL_MIN_HEIGHT,BOTTOM_PANEL_TABS,bottomPanelDragHeight,bottomPanelKeyHeight,bottomPanelLayoutId,bottomPanelTabsFor,bottomPanelView,collapseBottomPanel,mountedBottomTabs,nextVisitedTabs,openBottomTab,restoreBottomPanelBook,selectBottomTab,withBottomPanelView} from '../../src/ui/bottom-panel-model';
import {BottomPanel} from '../../src/ui/BottomPanel';
import {StrategyDialog} from '../../src/ui/StrategyDialog';
import {PaperTradingDock} from '../../src/ui/PaperTradingDock';
import {ScriptLibraryPanel} from '../../src/ui/ScriptLibraryPanel';
import {Modal} from '../../src/ui/Modal';
import {createScriptLibrary} from '../../src/ui/script-library';
import {initialScript} from '../../src/ui/ScriptPanel';
import {DEFAULT_STRATEGY_CONFIG} from '../../src/domain/strategy';
import {createPaperAccount} from '../../src/domain/paper';
import {fixtureDataset} from '../../src/domain/fixtures';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {createInitialWorkspace} from '../../src/ui/workspace-state';

// The tabbed bottom panel model and chrome, and the docked placements of its three tab owners. Controlled
// hooks (no DOM); SYNTHETIC data only.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:()=>{hooks.cursor++;},useLayoutEffect:()=>{hooks.cursor++;},useMemo:(fn:()=>any)=>{hooks.cursor++;return fn();},useCallback:(fn:any)=>{hooks.cursor++;return fn;}};});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function findAll(tree:any,match:(node:any)=>boolean):any[]{const out:any[]=[];const visit=(node:any)=>{if(Array.isArray(node)){node.forEach(visit);return;}if(!node?.props)return;if(match(node))out.push(node);visit(node.props.children);};visit(tree);return out;}
const find=(tree:any,match:(node:any)=>boolean)=>{const found=findAll(tree,match)[0];if(!found)throw new Error('Synthetic target missing.');return found;};
const render=(fn:()=>any)=>()=>{hooks.cursor=0;return fn();};
const PORTAL=Symbol.for('react.portal');
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;vi.stubGlobal('CSS',{supports:()=>true});});afterEach(()=>vi.unstubAllGlobals());

describe(' bottom panel model',()=>{
 it('lists the tabs in reference order without the screener, and offers the Trading panel only with an account',()=>{
  expect(BOTTOM_PANEL_TABS.map(row=>row.label)).toEqual(['Script editor','Strategy tester','Trading panel']);
  expect(bottomPanelTabsFor(true)).toEqual(['script','strategy','trading']);expect(bottomPanelTabsFor(false)).toEqual(['script','strategy']);
  expect(bottomPanelTabsFor(true)).toBe(bottomPanelTabsFor(true));
 });
 it('a tab click opens an inactive tab and collapses the active one; open never collapses',()=>{
  const closed={...BOTTOM_PANEL_DEFAULT};
  const strategy=selectBottomTab(closed,'strategy');expect(strategy).toEqual({open:true,tab:'strategy',height:320});
  expect(selectBottomTab(strategy,'strategy')).toEqual({open:false,tab:'strategy',height:320});
  expect(selectBottomTab(strategy,'script')).toEqual({open:true,tab:'script',height:320});
  expect(openBottomTab(strategy,'strategy')).toEqual(strategy);expect(collapseBottomPanel(closed)).toBe(closed);
 });
 it('resizes by keyboard and drag within the limits',()=>{
  expect(bottomPanelKeyHeight('ArrowUp',300)).toBe(300+BOTTOM_PANEL_KEY_STEP);expect(bottomPanelKeyHeight('ArrowDown',300)).toBe(300-BOTTOM_PANEL_KEY_STEP);
  expect(bottomPanelKeyHeight('PageUp',300,350)).toBe(350);expect(bottomPanelKeyHeight('Home',300)).toBe(BOTTOM_PANEL_MIN_HEIGHT);expect(bottomPanelKeyHeight('End',300,500)).toBe(500);
  expect(bottomPanelKeyHeight('ArrowDown',BOTTOM_PANEL_MIN_HEIGHT)).toBe(BOTTOM_PANEL_MIN_HEIGHT);expect(bottomPanelKeyHeight('Enter',300)).toBeNull();
  expect(bottomPanelDragHeight(300,500,400)).toBe(400);expect(bottomPanelDragHeight(300,500,900)).toBe(BOTTOM_PANEL_MIN_HEIGHT);expect(bottomPanelDragHeight(300,500,-9000,640)).toBe(640);
 });
 it('saves one view per layout, drops deleted layouts and restores exactly',()=>{
  let book=withBottomPanelView(undefined,'layout-a',{open:true,tab:'trading',height:401.6});
  book=withBottomPanelView(book,'layout-b',{open:false,tab:'strategy',height:10});
  expect(book).toEqual({schemaVersion:1,layouts:{'layout-a':{open:true,tab:'trading',height:402},'layout-b':{open:false,tab:'strategy',height:BOTTOM_PANEL_MIN_HEIGHT}}});
  expect(bottomPanelView(book,'layout-a')).toEqual({open:true,tab:'trading',height:402});expect(bottomPanelView(book,'missing')).toEqual(BOTTOM_PANEL_DEFAULT);
  expect(Object.keys(withBottomPanelView(book,'layout-b',{open:true,tab:'script',height:300},['layout-b']).layouts)).toEqual(['layout-b']);
  expect(restoreBottomPanelBook(structuredClone(book))).toEqual(book);
  for(const bad of [{schemaVersion:2,layouts:{}},{schemaVersion:1,layouts:{a:{open:true,tab:'screener',height:300}}},{schemaVersion:1,layouts:{a:{open:true,tab:'script',height:BOTTOM_PANEL_MAX_HEIGHT+1}}},{schemaVersion:1,layouts:{a:{open:true,tab:'script',height:300,extra:1}}},{schemaVersion:1,layouts:{'bad id':{open:true,tab:'script',height:300}}},{schemaVersion:1}])expect(()=>restoreBottomPanelBook(bad)).toThrow();
  expect(bottomPanelView({schemaVersion:1,layouts:{a:{open:'yes'}}},'a')).toEqual(BOTTOM_PANEL_DEFAULT);
  expect(bottomPanelLayoutId({layoutLibrary:{activeId:'lib'},grid:{layout:{id:'grid'}}})).toBe('lib');expect(bottomPanelLayoutId({grid:{layout:{id:'grid'}}})).toBe('grid');
 });
 it('keeps visited tabs mounted while expanded and none while collapsed',()=>{
  const script={open:true,tab:'script' as const,height:300},strategy={...script,tab:'strategy' as const},closed={...strategy,open:false};
  const visited=nextVisitedTabs(script,strategy,[]);expect(visited).toEqual(['script','strategy']);expect(mountedBottomTabs(strategy,visited)).toEqual(['script','strategy']);
  expect(nextVisitedTabs(strategy,closed,visited)).toEqual([]);expect(mountedBottomTabs(closed,visited)).toEqual([]);
  expect(nextVisitedTabs(closed,{...closed,open:true,tab:'trading'},visited)).toEqual(['trading']);
 });
 it('workspace recovery keeps a valid saved panel, rejects an invalid one, and leaves an older workspace without the field',()=>{
  const base=createInitialWorkspace(),id=bottomPanelLayoutId(base),bottomPanel=withBottomPanelView(undefined,id,{open:true,tab:'strategy',height:360});
  expect((restoreWorkspace({...structuredClone(base),bottomPanel},createInitialWorkspace()) as any).bottomPanel).toEqual(bottomPanel);
  expect(()=>restoreWorkspace({...structuredClone(base),bottomPanel:{schemaVersion:1,layouts:{[id]:{open:true,tab:'strategy',height:1}}}},createInitialWorkspace())).toThrow();
  expect(Object.hasOwn(restoreWorkspace(structuredClone(base),createInitialWorkspace()),'bottomPanel')).toBe(false);
 });
});

describe(' bottom panel chrome',()=>{
 const hostRefs={script:vi.fn(),strategy:vi.fn(),trading:vi.fn()};
 it('renders the offered tabs, toggles them, and keeps every host element in the panel',()=>{
  const onChange=vi.fn(),onMaximize=vi.fn(),ui=render(()=>BottomPanel({view:{open:true,tab:'strategy',height:300},tabs:['script','strategy'],maximized:false,onChange,onMaximize,hostRefs}));
  const tabs=findAll(ui(),node=>node.props.role==='tab');expect(tabs.map(text)).toEqual(['Script editor','Strategy tester']);expect(tabs.map(tab=>tab.props['aria-selected'])).toEqual([false,true]);
  tabs[1].props.onClick();expect(onChange).toHaveBeenLastCalledWith({open:false,tab:'strategy',height:300});
  tabs[0].props.onClick();expect(onChange).toHaveBeenLastCalledWith({open:true,tab:'script',height:300});
  const hosts=findAll(ui(),node=>node.props.role==='tabpanel');expect(hosts.map(host=>[host.props.id,host.props.hidden])).toEqual([['lv-bottom-host-script',true],['lv-bottom-host-strategy',false],['lv-bottom-host-trading',true]]);
  expect(hosts.map(host=>host.props.ref)).toEqual([hostRefs.script,hostRefs.strategy,hostRefs.trading]);
  expect(find(ui(),node=>node.props.role==='region').props.style).toEqual({height:'min(300px, calc(100% - 96px))'});
 });
 it('resizes from the keyboard, maximizes and collapses',()=>{
  const onChange=vi.fn(),onMaximize=vi.fn(),ui=render(()=>BottomPanel({view:{open:true,tab:'script',height:300},tabs:['script','strategy','trading'],maximized:false,onChange,onMaximize,hostRefs}));
  const grip=find(ui(),node=>node.props.role==='separator');expect(grip.props['aria-valuenow']).toBe(300);
  const key={key:'ArrowUp',preventDefault:vi.fn()};grip.props.onKeyDown(key);expect(key.preventDefault).toHaveBeenCalled();expect(onChange).toHaveBeenLastCalledWith({open:true,tab:'script',height:300+BOTTOM_PANEL_KEY_STEP});
  find(ui(),node=>node.props['aria-label']==='Maximize bottom panel').props.onClick();expect(onMaximize).toHaveBeenLastCalledWith(true);
  find(ui(),node=>node.props['aria-label']==='Collapse bottom panel').props.onClick();expect(onMaximize).toHaveBeenLastCalledWith(false);expect(onChange).toHaveBeenLastCalledWith({open:false,tab:'script',height:300});
  const max=render(()=>BottomPanel({view:{open:true,tab:'script',height:300},tabs:['script'],maximized:true,onChange,onMaximize,hostRefs}));
  expect(findAll(max(),node=>node.props.role==='separator')).toHaveLength(0);expect(find(max(),node=>node.props.role==='region').props['data-maximized']).toBe('true');
  find(max(),node=>node.props['aria-label']==='Restore bottom panel size').props.onClick();expect(onMaximize).toHaveBeenLastCalledWith(false);
 });
 it('collapsed, it shows only the strip; Expand opens the saved tab',()=>{
  const onChange=vi.fn(),ui=render(()=>BottomPanel({view:{open:false,tab:'trading',height:300},tabs:['script','strategy','trading'],maximized:false,onChange,onMaximize:vi.fn(),hostRefs}));
  expect(findAll(ui(),node=>node.props.role==='separator')).toHaveLength(0);expect(find(ui(),node=>node.props.className==='lv-bottom-panel-body').props.hidden).toBe(true);
  expect(find(ui(),node=>node.props.role==='region').props.style).toBeUndefined();
  find(ui(),node=>node.props['aria-label']==='Expand bottom panel').props.onClick();expect(onChange).toHaveBeenLastCalledWith({open:true,tab:'trading',height:300});
 });
});

describe(' docked tab owners',()=>{
 it('the Strategy tester docks as a region with Open floating; floating keeps the dialog with Dock to bottom',()=>{
  const onPlacement=vi.fn(),onClose=vi.fn(),docked=render(()=>StrategyDialog({execution:null,config:DEFAULT_STRATEGY_CONFIG,onChange:vi.fn(),onClose,placement:'docked',onPlacement,dockHost:null}));
  const region=find(docked(),node=>node.type==='section'&&node.props.role==='region');expect(region.props['aria-label']).toBe('Strategy tester');expect(findAll(docked(),node=>node.type===Modal)).toHaveLength(0);
  find(docked(),node=>node.type==='button'&&text(node)==='Open floating').props.onClick();expect(onPlacement).toHaveBeenCalledWith('floating');
  expect(text(docked())).toContain('Add a strategy to see results');
  hooks.cells=[];const floating=render(()=>StrategyDialog({execution:null,config:DEFAULT_STRATEGY_CONFIG,onChange:vi.fn(),onClose,placement:'floating',onPlacement}));
  expect(findAll(floating(),node=>node.type===Modal)).toHaveLength(1);find(floating(),node=>node.type==='button'&&text(node)==='Dock to bottom').props.onClick();expect(onPlacement).toHaveBeenLastCalledWith('docked');
  hooks.cells=[];const plain=render(()=>StrategyDialog({execution:null,config:DEFAULT_STRATEGY_CONFIG,onChange:vi.fn(),onClose}));
  expect(findAll(plain(),node=>node.type==='button'&&text(node)==='Dock to bottom')).toHaveLength(0);
  hooks.cells=[];const host={nodeType:1} as unknown as HTMLElement,portal=render(()=>StrategyDialog({execution:null,config:DEFAULT_STRATEGY_CONFIG,onChange:vi.fn(),onClose,placement:'docked',dockHost:host}))();
  expect(portal.$$typeof).toBe(PORTAL);expect(portal.containerInfo).toBe(host);
 });
 it('the paper dock as the Trading panel tab has no collapsed bar and no collapse button of its own',()=>{
  const instrument=fixtureDataset('GME',5).instrument,account=createPaperAccount({id:'synthetic-account',name:'Synthetic paper'});
  const base={account,instrument,now:0,onToggle:vi.fn(),onAccountChange:vi.fn(),onOpenTicket:vi.fn()};
  expect(render(()=>PaperTradingDock({...base,open:false,embedded:true}))()).toBeNull();
  hooks.cells=[];const open=render(()=>PaperTradingDock({...base,open:true,embedded:true}))();
  expect(open.props.className).toBe('lv-paper-dock lv-paper-dock-embedded');expect(findAll(open,node=>node.props['aria-label']==='Collapse the paper trading panel')).toHaveLength(0);
  hooks.cells=[];const host={nodeType:1} as unknown as HTMLElement,portal=render(()=>PaperTradingDock({...base,open:true,embedded:true,dockHost:host}))();
  expect(portal.$$typeof).toBe(PORTAL);expect(portal.containerInfo).toBe(host);
  hooks.cells=[];const legacy=render(()=>PaperTradingDock({...base,open:false}))();expect(legacy.props.className).toBe('lv-paper-dock collapsed');
 });
 it('the embedded script editor drops its own header; the standalone dock keeps Close',()=>{
  const base={open:true,onClose:vi.fn(),chart:null,bars:[],fixture:true,identity:'Synthetic dock',library:createScriptLibrary(initialScript),onChange:vi.fn(),bindings:[],onBindingsChange:vi.fn(),placement:'docked' as const,onPlacement:vi.fn(),dockHost:null};
  const embedded=render(()=>ScriptLibraryPanel({...base,embedded:true}))();
  expect(embedded.props.className).toBe('lv-script-dock lv-script-dock-embedded');expect(findAll(embedded,node=>node.props['aria-label']==='Close script editor')).toHaveLength(0);
  expect(findAll(embedded,node=>node.type==='button'&&text(node)==='Open floating')).toHaveLength(1);
  hooks.cells=[];const standalone=render(()=>ScriptLibraryPanel(base))();expect(findAll(standalone,node=>node.props['aria-label']==='Close script editor')).toHaveLength(1);
 });
});
