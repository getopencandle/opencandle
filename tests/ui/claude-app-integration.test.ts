import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {ImportDialog} from '../../src/ui/ImportDialog';
import {SymbolSearchDialog} from '../../src/ui/SymbolSearchDialog';
import {QuickSearchDialog} from '../../src/ui/QuickSearchDialog';
import {KeyboardShortcutsDialog} from '../../src/ui/KeyboardShortcutsDialog';
import {CalendarDialog} from '../../src/ui/CalendarDialog';
import {FundamentalsDialog} from '../../src/ui/FundamentalsDialog';
import {ScreenerDialog} from '../../src/ui/ScreenerDialog';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {PaperPanel} from '../../src/ui/PaperPanel';
import {PaperTradingDock} from '../../src/ui/PaperTradingDock';
import {DrawingToolbar} from '../../src/ui/DrawingToolbar';
import {IndicatorDialog} from '../../src/ui/IndicatorDialog';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createPaperAccount} from '../../src/domain/paper';
import {HeaderSymbolButton} from '../../src/ui/HeaderSymbolButton';
import {switchRequest} from '../../src/ui/symbol-search';
import {renameWatchList} from '../../src/watchlists/model';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {prepareWorkspaceData} from '../../src/ui/workspace-transfer';
import type {BarDataset} from '../../src/domain/types';

// Actual App closures and recovery model, with explicit React scheduling. This is
// not a DOM, native-window, canvas, accessibility, or packaged executable test.
// Effects other than startup and explicitly selected subscriptions stay dormant.
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
function find(node:any,test:(node:any)=>boolean):any{
 if(Array.isArray(node)){for(const child of node){const result=find(child,test);if(result)return result;}}
 else if(node?.props){if(test(node))return node;return find(node.props.children,test);}
 return null;
}
function content(node:any):string{return Array.isArray(node)?node.map(content).join(''):node?.props?content(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
async function setup(){
 const listeners=new Map<string,Function>(),addEventListener=vi.fn((name:string,fn:Function)=>listeners.set(name,fn));
 vi.stubGlobal('window',{addEventListener,removeEventListener:vi.fn((name:string,fn:Function)=>{if(listeners.get(name)===fn)listeners.delete(name);})});
 vi.stubGlobal('document',{querySelector:vi.fn(()=>null)});
 const render=()=>{hooks.cursor=0;return App();};
 render();const boot=hooks.effects[0];hooks.effects=[];boot();for(let i=0;i<5;i++)await Promise.resolve();
 const node=(type:any)=>find(render(),row=>row.type===type);
 const button=(name:string)=>{const result=find(render(),row=>row.type==='button'&&(row.props['aria-label']===name||content(row)===name));const header=result??(name==='Search symbols'?find(render(),row=>row.type===HeaderSymbolButton):null);if(!header)throw Error('Missing actual App button: '+name);return result??{props:{onClick:()=>header.props.onOpen('','toolbar')}};};
 const click=(name:string)=>button(name).props.onClick();
 const status=()=>content(find(render(),row=>row.type==='output'&&row.props.role==='status'));
 const runEffect=(marker:string)=>{const index=hooks.effects.findIndex(fn=>String(fn).includes(marker));if(index<0)throw Error('Missing scheduled App effect: '+marker);return hooks.effects.splice(index,1)[0]();};
 return{render,node,button,click,status,runEffect,listeners,grid:()=>node(WorkspaceChartHost).props};
}
type Harness=Awaited<ReturnType<typeof setup>>;
function imported(symbol='GME',id='test-import-gme'):BarDataset{
 const synthetic=fixtureDataset(symbol,3);
 // Artificial test bytes model a user's non-synthetic declaration. They are never
 // a real historical sample, and the test does not claim actual price accuracy.
 return {...synthetic,instrument:{...synthetic.instrument,id:'TESTEX:'+symbol,exchange:'TESTEX',name:'Artificial import boundary test'},provenance:{...synthetic.provenance,providerId:'test-local-import',providerName:'Test import declaration',datasetId:id,fixture:false,coverage:'Artificial handler-test input',session:'regular',adjustment:'split-adjusted',notes:['Artificial unit test only. Not actual market data.']}};
}
function importThroughDialog(ui:Harness,data=imported()){
 ui.click('Import data');const props=ui.node(ImportDialog).props;expect(props.onImport(data)).toBe(true);props.onClose();return data;
}
/** The header symbol is a button: it opens the Symbol search (the dialog owns Enter and exact entry). */
function openHeaderSearch(ui:Harness){ui.click('Search symbols');return ui.node(SymbolSearchDialog).props;}
function keyEvent(key:string,extra:Record<string,unknown>={}){return{key,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,isComposing:false,repeat:false,target:{closest:()=>null},preventDefault:vi.fn(),stopImmediatePropagation:vi.fn(),...extra};}
function nativeChart(rows:any[]=[]){
 let tool:string|null=null,mode:string|null=null;
 const toolListeners=new Set<(value:string|null)=>void>(),modeListeners=new Set<(value:any)=>void>();
 const controller={
  drawings:{getTool:()=>tool,getMode:()=>mode},
  setTool:vi.fn((value:string|null)=>{tool=value;for(const fn of toolListeners)fn(value);}),
  setDrawingMode:vi.fn((value:any)=>{mode=value;for(const fn of modeListeners)fn(value);}),
  onToolChanged:(fn:(value:string|null)=>void)=>{toolListeners.add(fn);return()=>toolListeners.delete(fn);},
  onDrawingModeChanged:(fn:(value:any)=>void)=>{modeListeners.add(fn);return()=>modeListeners.delete(fn);},
  indicators:{list:()=>rows,subscribe:vi.fn(()=>()=>{})}
 };
 return{controller,toolListeners,modeListeners};
}

describe('Shared App integration, handler and model coverage only',()=>{
 it('commits declared import provenance and never manufactures a quote for imported OHLCV',async()=>{
  const ui=await setup(),data=importThroughDialog(ui);
  expect(ui.grid().activeDatasetId).toBe(data.provenance.datasetId);
  expect(ui.status()).toContain('Session regular (declared); adjustment split-adjusted (declared)');
  expect(ui.status()).not.toContain('SYNTHETIC');
  ui.click('Paper trading');ui.node(PaperTradingDock).props.onOpenTicket(null);const paper=ui.node(PaperPanel).props;
  expect(paper.quote).toBeNull();expect(paper.account.virtual).toBe(true);expect(paper.instrument.id).toBe('TESTEX:GME');
 });
 it('retired import callbacks cannot commit after their dialog has closed',async()=>{
  const ui=await setup();ui.click('Import data');const old=ui.node(ImportDialog).props;old.onClose();
  expect(()=>old.onImport(imported())).toThrow(/closed|replaced/);expect(ui.grid().datasets.some((row:BarDataset)=>row.provenance.datasetId==='test-import-gme')).toBe(false);
 });
 it('the header search lists ambiguous GME sources instead of replacing an import with demo data',async()=>{
  const ui=await setup(),data=importThroughDialog(ui);const search=openHeaderSearch(ui);
  expect(search.origin).toBe('toolbar');expect(search.currentDatasetId).toBe(data.provenance.datasetId);
  expect(search.candidates.filter((row:any)=>row.symbol==='GME').map((row:any)=>row.synthetic).sort()).toEqual([false,true]);
  expect(ui.grid().activeDatasetId).toBe(data.provenance.datasetId);
 });
 it('selecting an exact candidate from the header search resolves the supplied import or the demo symbol',async()=>{
  const ui=await setup(),data=importThroughDialog(ui);let search=openHeaderSearch(ui);
  const spy=search.candidates.find((row:any)=>row.symbol==='SPY'&&row.synthetic);expect(search.onSelect(switchRequest(spy,'entry'))).toBe(true);expect(ui.grid().activeDatasetId).toBe('lv-synthetic-v1:SPY');
  search=openHeaderSearch(ui);const supplied=search.candidates.find((row:any)=>row.symbol==='GME'&&!row.synthetic);
  expect(search.onSelect(switchRequest(supplied,'entry'))).toBe(true);expect(ui.grid().activeDatasetId).toBe(data.provenance.datasetId);
  expect(search.candidates.some((row:any)=>row.symbol==='UNSUPPLIED')).toBe(false);
 });
 it('search exposes a current ownership guard and selects an exact supplied candidate',async()=>{
  const ui=await setup(),data=importThroughDialog(ui);ui.click('Search symbols');const search=ui.node(SymbolSearchDialog).props;
  search.assertOwner();const spy=search.candidates.find((row:any)=>row.symbol==='SPY'&&row.synthetic);
  expect(search.onSelect(switchRequest(spy,'toolbar'))).toBe(true);expect(ui.grid().activeDatasetId).not.toBe(data.provenance.datasetId);
  expect(ui.status()).toContain('synthetic demo data');/* The status names the fixture provider 'LarryVision synthetic demo data' */search.onClose();expect(()=>search.assertOwner()).toThrow(/closed|replaced/);
  const saved=ui.grid().activeDatasetId;expect(()=>search.onSelect(switchRequest(search.candidates.find((row:any)=>row.datasetId===data.provenance.datasetId),'toolbar'))).toThrow(/closed|replaced/);expect(ui.grid().activeDatasetId).toBe(saved);
 });
 it('each calendar shortcut carries its kind and reopens with a new local identity',async()=>{
  const ui=await setup(),keys=new Set<string>();
  for(const[label,kind]of [['Economic','economic'],['Earnings and revenue','earnings'],['Dividends','dividend'],['IPO','ipo']]){
   ui.click(label);const node=ui.node(CalendarDialog);expect(node.props.initialKind).toBe(kind);keys.add(String(node.key));node.props.onClose();
  }
  expect(keys.size).toBe(4);ui.click('IPO');const again=ui.node(CalendarDialog);expect(keys.has(String(again.key))).toBe(false);again.props.onClose();
  ui.click('Calendar');expect(ui.node(CalendarDialog).props.initialKind).toBeUndefined();
 });
 it('calendar financial navigation transfers synchronously and an old close cannot dismiss its replacement',async()=>{
  const ui=await setup();ui.click('Earnings and revenue');const old=ui.node(CalendarDialog).props;
  expect(old.onOpenFinancials('SYNTHETIC:SPY','SPY')).toBe(true);
  const financials=ui.node(FundamentalsDialog);expect(financials.props.market).toEqual({exchange:'SYNTHETIC',symbol:'SPY',synthetic:true});expect(ui.grid().activeDatasetId).toBe('lv-synthetic-v1:SPY');
  old.onClose();expect(ui.node(FundamentalsDialog)).not.toBeNull();expect(()=>old.onSelectSymbol('SYNTHETIC:GME','GME')).toThrow(/closed|replaced/);
 });
 it('calendar unavailable or ambiguous history retains its dialog and exact selected source',async()=>{
  const ui=await setup(),data=importThroughDialog(ui);ui.click('Earnings and revenue');const calendar=ui.node(CalendarDialog).props;
  expect(calendar.onOpenFinancials(null,'GME')).toBe(false);expect(ui.status()).toContain('More than one data source matches');expect(ui.node(FundamentalsDialog)).toBeNull();expect(ui.grid().activeDatasetId).toBe(data.provenance.datasetId);
  expect(calendar.onOpenFinancials('TESTEX:MISSING','MISSING')).toBe(false);expect(ui.status()).toContain('No price data matches');expect(ui.node(CalendarDialog)).not.toBeNull();
 });
 it('screener watchlist publication checks both original book identity and dialog authority',async()=>{
  const ui=await setup();ui.click('Stock screener');const old=ui.node(ScreenerDialog).props,expected=old.watchBook;
  const next=renameWatchList(expected,expected.activeId,'Independent screen results');
  expect(old.onWatchBook(next,expected)).toBe(true);expect(ui.node(WatchlistPanel).props.book).toBe(next);
  expect(()=>old.onWatchBook(expected,expected)).toThrow(/watchlists changed/);expect(ui.node(WatchlistPanel).props.book).toBe(next);
  const current=ui.node(ScreenerDialog).props;current.onClose();expect(()=>current.onWatchBook(expected,next)).toThrow(/closed|replaced/);
 });
 it('fundamentals saves preferences through the analysis ownership guard and refuses an outdated draft',async()=>{
  const ui=await setup();ui.click('Fundamentals');const old=ui.node(FundamentalsDialog).props;
  const next={...old.preferences,view:{...old.preferences.view,tab:'balance',cutoffMode:'date',cutoffDate:'2024-06-30',revisions:'original'}};
  expect(old.onPreferencesChange(next)).toBe(true);expect(ui.node(FundamentalsDialog).props.preferences).toBe(next);
  expect(()=>old.onPreferencesChange(old.preferences)).toThrow(/saved analysis data changed/);
  const live=ui.node(FundamentalsDialog).props;live.onClose();expect(()=>live.onPreferencesChange(next)).toThrow(/closed|replaced/);
 });
 it('screener rejection by the complete-workspace storage guard leaves the book and price source unchanged',async()=>{
  const ui=await setup();ui.click('Stock screener');const props=ui.node(ScreenerDialog).props,expected=props.watchBook,source=ui.grid().activeDatasetId;
  // A callback is not persistable JSON. It must fail before any publication,
  // without allocating a large data fixture to trip the storage limit.
  const rejected={...renameWatchList(expected,expected.activeId,'Rejected draft'),unpersistable:()=>0};
  expect(props.onWatchBook(rejected,expected)).toBe(false);expect(ui.node(WatchlistPanel).props.book).toBe(expected);expect(ui.grid().activeDatasetId).toBe(source);
  const accepted=renameWatchList(expected,expected.activeId,'Valid retry');expect(props.onWatchBook(accepted,expected)).toBe(true);expect(ui.node(WatchlistPanel).props.book).toBe(accepted);
 });
 it('watchlist summary callback keeps synthetic, reported, and ETF availability distinct and memoizes unchanged input',async()=>{
  const ui=await setup(),summary=ui.node(WatchlistPanel).props.fundamentalsFor,real={exchange:'TESTEX',symbol:'GME',synthetic:false},demo={exchange:'SYNTHETIC',symbol:'GME',synthetic:true};
  const unloaded=summary(real,'stock');expect(unloaded.market).toEqual(real);expect(unloaded.availability).toBe('not-loaded');expect(unloaded.fields).toEqual([]);expect(summary(real,'stock')).toBe(unloaded);
  const synthetic=summary(demo,'stock');expect(synthetic.availability).toBe('not-applicable');expect(synthetic.reason).toContain('SYNTHETIC DEMO');expect(synthetic.fields).toEqual([]);
  const etf=summary({exchange:'TESTEX',symbol:'SPY',synthetic:false},'etf');expect(etf.availability).toBe('not-applicable');expect(etf.reason).toContain('ETF');expect(etf.fields).toEqual([]);
 });
 it('watchlist financial navigation preserves exchange and synthetic identity without switching chart prices',async()=>{
  const ui=await setup(),before=ui.grid().activeDatasetId,market={exchange:'TESTEX',symbol:'GME',synthetic:false};
  expect(ui.node(WatchlistPanel).props.onOpenFundamentals(market)).toBe(true);expect(ui.node(FundamentalsDialog).props.market).toBe(market);expect(ui.grid().activeDatasetId).toBe(before);
  ui.node(FundamentalsDialog).props.onClose();ui.click('Fundamentals');expect(ui.node(FundamentalsDialog).props.market).toEqual({exchange:'SYNTHETIC',symbol:'GME',synthetic:true});
 });
 it('fundamentals preferences round trip and migrate explicitly, while invalid cutoff settings fail recovery',()=>{
  const workspace=createInitialWorkspace(),paper=createPaperAccount({id:'test-paper',now:0}),prefs=workspace.fundamentalsPreferences;
  const changed={...prefs,view:{...prefs.view,tab:'balance',cutoffMode:'date',cutoffDate:'2024-06-30',revisions:'original'},links:[{exchange:'TESTEX',symbol:'GME',synthetic:false,documentId:'user-linked-filing'}]};
  const payload={...workspace,fundamentalsPreferences:changed,paper,alerts:[]};
  expect(prepareWorkspaceData(payload).workspace.fundamentalsPreferences).toEqual(changed);
  const legacy={...payload} as Record<string,unknown>;delete legacy.fundamentalsPreferences;const restored=prepareWorkspaceData(legacy);
  expect(restored.workspace.fundamentalsPreferences).toEqual({schemaVersion:1,view:{tab:'income',basis:'FY',currency:null,scale:'auto',cutoffMode:'today',cutoffDate:null,revisions:'latest',columns:8,line:null},links:[]});
  expect(restored.migrations).toContain('Legacy export: initialized fundamentalsPreferences using documented local defaults.');
  expect(()=>prepareWorkspaceData({...payload,fundamentalsPreferences:{...changed,view:{...changed.view,cutoffDate:null}}})).toThrow(/cutoff/);
 });
 it('renderer tool and mode events update the toolbar, and retired charts cannot repaint its active state',async()=>{
  const ui=await setup(),first=nativeChart();ui.grid().onReady(first.controller);hooks.effects=[];ui.render();const off=ui.runEffect('onToolChanged') as ()=>void;
  first.controller.setTool('ray');expect(ui.node(DrawingToolbar).props.activeTool).toBe('ray');first.controller.setDrawingMode('measure');expect(ui.node(DrawingToolbar).props.activeMode).toBe('measure');
  const second=nativeChart(),retained=[...first.toolListeners][0],retainedMode=[...first.modeListeners][0];ui.grid().onReady(second.controller);hooks.effects=[];ui.render();ui.runEffect('onToolChanged');
  second.controller.setTool('trendline');second.controller.setDrawingMode('measure');retained('rectangle');retainedMode(null);expect(ui.node(DrawingToolbar).props.activeTool).toBe('trendline');expect(ui.node(DrawingToolbar).props.activeMode).toBe('measure');off();expect(first.toolListeners.size).toBe(0);expect(first.modeListeners.size).toBe(0);
 });
 it('Alt+T always arms and Escape clears both tool and mode; typed entry respects editing and open menus',async()=>{
  const ui=await setup(),native=nativeChart();ui.grid().onReady(native.controller);hooks.effects=[];ui.render();ui.runEffect('onToolChanged');ui.runEffect('addEventListener');const handler=ui.listeners.get('keydown')!;
  handler(keyEvent('t',{altKey:true}));handler(keyEvent('t',{altKey:true}));expect(native.controller.setTool.mock.calls.map(args=>args[0])).toEqual(['trendline','trendline']);
  native.controller.setDrawingMode('measure');handler(keyEvent('Escape'));expect(native.controller.drawings.getTool()).toBeNull();expect(native.controller.drawings.getMode()).toBeNull();
  handler(keyEvent('g',{target:{closest:()=>({})}}));expect(ui.node(SymbolSearchDialog)).toBeNull();
  handler(keyEvent('g',{target:{closest:(selector:string)=>selector.includes('[role=menu]')?{}:null}}));expect(ui.node(SymbolSearchDialog)).toBeNull();
  const typed=keyEvent('g');handler(typed);expect(typed.preventDefault).toHaveBeenCalledOnce();expect(typed.stopImmediatePropagation).toHaveBeenCalledOnce();expect(ui.node(SymbolSearchDialog).props).toMatchObject({origin:'typed',initialQuery:'G'});
 });
 it('Ctrl+K opens Quick search without inventing a ticker or swallowing repeats; a chosen row runs after the palette closes',async()=>{
  const ui=await setup();ui.render();ui.runEffect('addEventListener');const handler=ui.listeners.get('keydown')!;
  const repeated=keyEvent('k',{ctrlKey:true,repeat:true});handler(repeated);expect(repeated.preventDefault).not.toHaveBeenCalled();expect(ui.node(QuickSearchDialog)).toBeNull();
  const pressed=keyEvent('k',{ctrlKey:true});handler(pressed);expect(pressed.preventDefault).toHaveBeenCalledOnce();
  // Ctrl+K is Quick search; its Symbols group replaces the old symbol-only route.
  const palette=ui.node(QuickSearchDialog);expect(palette.props.initialQuery).toBe('');expect(ui.node(SymbolSearchDialog)).toBeNull();
  const row=palette.props.index.find((item:any)=>item.id==='command:keyboard-shortcuts');expect(row).toBeTruthy();
  palette.props.onRun(row);expect(ui.node(QuickSearchDialog)).toBeNull();expect(ui.node(KeyboardShortcutsDialog)).toBeNull();
  ui.render();while(hooks.effects.some(fn=>String(fn).includes('pendingQuickSearch')))ui.runEffect('pendingQuickSearch');expect(ui.node(KeyboardShortcutsDialog)).toBeTruthy();
 });
 it('duplicate indicator legends have distinct labels, open the selected instance, and general reopening clears that focus',async()=>{
  const ui=await setup(),rows=['first-sma','second-sma'].map(id=>({id,kind:'sma',inputs:{length:9,source:'close'},visible:true,offset:0,plots:{},rendererId:id,paneId:'price',diagnostics:[],presentationDiagnostics:[],policies:[],series:[],informationBars:3,latestInformationTime:null}));
  const native=nativeChart(rows);ui.grid().onReady(native.controller);hooks.effects=[];ui.render();ui.runEffect('indicators.subscribe');
  // Legend rows are grouped per pane: each row is .lv-legend-row; the duplicate number is on its title button.
  const tree=ui.render(),titleOf=(id:string)=>find(find(tree,node=>node.props?.['data-legend-row']===id),node=>node.props?.className==='lv-legend-title');
  const first=titleOf('first-sma'),second=titleOf('second-sma');expect(first.props.title).not.toBe(second.props.title);expect(first.props.title).toContain('#1');expect(second.props.title).toContain('#2');
  second.props.onClick();expect(ui.node(IndicatorDialog).props.initialSelected).toBe('second-sma');ui.node(IndicatorDialog).props.onClose();ui.click('Indicators');expect(ui.node(IndicatorDialog).props.initialSelected).toBeNull();
 });
});
