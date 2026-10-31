// Fail-first checks for the kept-surface bug class of (a kept element or kept props object
// whose child reads something during render that changed without the reuse deps changing). The real App under the
// controlled-hooks harness of tests/performance/r30-live-store-render-counts.test.ts (copied: vi.mock is per file), a
// mocked bridge, a SYNTHETIC Coinbase stream (fake socket) and a SYNTHETIC stand-in chart controller. No network.
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {DataSourcesPanel} from '../../src/ui/data-sources-panel';
import {SymbolSearchDialog} from '../../src/ui/SymbolSearchDialog';
import {HeaderSymbolButton} from '../../src/ui/HeaderSymbolButton';
import {DrawingToolbar} from '../../src/ui/DrawingToolbar';
import {ChartBottomToolbar} from '../../src/ui/bottom-toolbar';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {PaperTradingDock} from '../../src/ui/PaperTradingDock';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {switchRequest} from '../../src/ui/symbol-search';
import {clearLiveDatasets} from '../../src/ui/live-registry';
import {liveQuotes,topOfBookDisplayQuote} from '../../src/domain/live-quotes';
// surfaces
import {ChartSettingsDialog} from '../../src/ui/chart-settings-dialog';
import {SymbolInfoDialog} from '../../src/ui/SymbolInfoDialog';
import {IntervalMenu} from '../../src/ui/IntervalMenu';
import {IntervalDialog} from '../../src/ui/IntervalDialog';
import {ScriptLibraryPanel} from '../../src/ui/ScriptLibraryPanel';
import {PaperOrderTicket} from '../../src/ui/PaperOrderTicket';
import {AlertsDock} from '../../src/ui/AlertsDock';
import {ObjectTreeDataWindowWidget} from '../../src/ui/ObjectTreePanelWidget';
import {WorkspaceAlerts} from '../../src/ui/WorkspaceAlerts';
import {AlertDialog} from '../../src/ui/AlertDialog';
import {DrawingUtilityBlock} from '../../src/ui/DrawingUtilityBlock';
import {DrawingTools} from '../../src/ui/DrawingTools';
import {IndicatorDialog} from '../../src/ui/IndicatorDialog';
import {createLocalAlert} from '../../src/domain/alerts';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>,sets:0}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
  useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{const next=typeof value==='function'?value(hooks.cells[index]):value;if(!Object.is(next,hooks.cells[index]))hooks.sets++;hooks.cells[index]=next;}];},
  useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
  useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),
  useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}},
  // Components rendered in their own scope below (WorkspaceAlerts) use layout effects; App does not.
  useLayoutEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}},
  // A consumer reads its store snapshot (bindings are rendered by expand() below, in their own hook scope).
  useSyncExternalStore:(_subscribe:any,getSnapshot:()=>any)=>{hooks.cursor++;return getSnapshot();}};
});
const baseline=!!process.env.LV_RENDER_BASELINE;
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test)??(node.props.dataSources?find(node.props.dataSources,test):null);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
/** Renders a binding component (a function element whose single child is the consumer) in its own hook scope and returns
 * the consumer element it renders; any other element is returned as it is. */
function expand(element:any):any{
 const name=typeof element?.type==='function'?element.type.name:'';if(!/Binding$/.test(name))return element;
 const saved={cells:hooks.cells,cursor:hooks.cursor};hooks.cells=[];hooks.cursor=0;
 try{return element.type(element.props);}finally{hooks.cells=saved.cells;hooks.cursor=saved.cursor;}
}
/** The consumer of `type` as React would render it: through the binding that wraps it, if any. */
function consumer(tree:any,type:any):any{
 const binding=find(tree,node=>typeof node.type==='function'&&/Binding$/.test(node.type.name)&&find(node.props.children,child=>child.type===type)!==null);
 return binding?expand(binding):find(tree,node=>node.type===type);
}
// The Symbol search opens BTC-USD at the chart interval (1D): a daily backfill; the stream (5-minute candles and the ticker)
// drives the forming day. A batch carries a candle, the ticker or both, whichever the 1D plan reads.
const DAY=Math.floor(Date.now()/86_400_000)*86_400,T0=DAY+3_600;
const candle=(time:number,close:number)=>({productId:'BTC-USD',seconds:300,time,open:100,high:Math.max(101,close),low:99,close,volume:2});
const ticker=(time:number,price:number,bid:number,ask:number)=>({productId:'BTC-USD',time,price,high:price,low:price,bid,ask,bidSize:1,askSize:1});
const batch=(candles:any[],tickers:any[])=>({schemaVersion:1,kind:'batch',candles,tickers,gap:false,receivedAt:''});

async function setup({live=true,alerts=[]}:{live?:boolean;alerts?:any[]}={}){
 let emit:(event:any)=>void=()=>{};
 const status={schemaVersion:1,state:'ready',attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{},productIds:['BTC-USD']};
 const data=prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount({initialBalance:500}),alerts});
 const bridge:any={
  loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision:1,savedAt:'2026-10-22T00:00:00Z',data,storage:{directory:'Synthetic profile',backend:'json-atomic'}}})),
  saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:2,savedAt:'2026-10-22T00:00:01Z'}})),
  fetchCoinbaseCandles:vi.fn(async(input:any)=>({ok:true,value:{schemaVersion:1,productId:input.productId,granularity:input.granularity,seconds:86_400,bars:[0,1,2].map(i=>({time:DAY-(2-i)*86_400,open:100,high:101,low:99,close:100.5,volume:2})),provenance:{provider:'test',kind:'public-unauthenticated',sourceUrl:'https://example.invalid/',retrievedAt:'2026-10-22T00:00:00Z',bytes:1,license:'test'}}})),
  subscribeCoinbase:vi.fn(async()=>({ok:true,value:status})),
  unsubscribeCoinbase:vi.fn(async()=>({ok:true,value:status})),
  onCoinbaseEvent:vi.fn((handler:(event:any)=>void)=>{emit=handler;return()=>{};}),
  alpacaKeyStatus:vi.fn(async()=>({ok:true,value:{configured:false,keyIdHint:null,encryption:true}})),
 };
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady({suspend:vi.fn(()=>({isCurrent:()=>true,resume:vi.fn()}))});render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports */}
 const effects=()=>{render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
 await flush();effects();await flush();effects();
 const button=(name:string)=>{const found=find(render(),node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name));if(found)return found;if(name==='Search symbols'){const header=find(render(),node=>node.type===HeaderSymbolButton);return{props:{onClick:()=>header.props.onOpen('','toolbar')}};}throw Error('Missing control '+name);};
 // Coinbase on, then BTC-USD live from the Symbol search (backfill, then the stream).
 const tick=async(event:any)=>{emit(event);await vi.advanceTimersByTimeAsync(1500);await flush();};
 // The order-ticket probe stays on the SYNTHETIC demo chart.
 if(!live)return{bridge,render,effects,button,tick};
 button('Data sources').props.onClick();find(render(),node=>node.type===DataSourcesPanel).props.live.onCoinbaseEnabledChange(true);effects();
 button('Search symbols').props.onClick();
 const search=find(render(),node=>node.type===SymbolSearchDialog).props,btc=search.candidates.find((row:any)=>row.sourceKind==='live'&&row.symbol==='BTC-USD');
 expect(search.onSelect(switchRequest(btc,'toolbar'))).toBe(true);await flush();effects();await flush();effects();
 return{bridge,render,effects,button,tick};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.sets=0;clearLiveDatasets();liveQuotes.reset();vi.useFakeTimers({toFake:['setTimeout','clearTimeout','setInterval','clearInterval']});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();clearLiveDatasets();liveQuotes.reset();});

const pick=(tree:any,type:any)=>find(tree,node=>node.type===type);
type Ui=Awaited<ReturnType<typeof setup>>;
/** A SYNTHETIC stand-in controller: the drawing manager, the renderer's drawing facade, the indicator port and the
 * calculation bars, all held in `state` so a test can change them the way a non-notifying path does (loadDrawings, a
 * dropped tool notification, live bars of a hidden indicator). Every other member is absent. */
function standInChart(){
 const state={rows:[] as Record<string,unknown>[],native:[] as object[],tool:null as string|null,mode:null as string|null,bars:[] as unknown[],indicators:[] as any[],scales:{} as Record<string,unknown>,drawingListeners:new Set<()=>void>(),toolListeners:new Set<(type:string|null)=>void>()};
 const members:Record<string,unknown>={
  drawingManager:{list:()=>state.rows,state:()=>({groups:[]}),select:()=>{}},
  drawings:{all:()=>state.native,getTool:()=>state.tool,getMode:()=>state.mode,setTool:(type:string|null)=>{state.tool=type;},select:()=>{}},
  setTool:(type:string|null)=>{state.tool=type;},setDrawingMode:(mode:string|null)=>{state.mode=mode;},
  onDrawingsChanged:(listener:()=>void)=>{state.drawingListeners.add(listener);return()=>{state.drawingListeners.delete(listener);};},
  onToolChanged:(listener:(type:string|null)=>void)=>{state.toolListeners.add(listener);return()=>{state.toolListeners.delete(listener);};},
  onDrawingSelection:()=>()=>{},onDrawingModeChanged:()=>()=>{},
  drawingCatalog:()=>[],
  indicators:{list:()=>state.indicators,subscribe:()=>()=>{},catalog:[],scale:(id:string)=>state.scales[id]??null},
  getCalculationBars:()=>state.bars,
 };
 return {state,chart:new Proxy(members,{get:(target,key)=>target[key as string]})};
}
type StandIn=ReturnType<typeof standInChart>;
const host=(ui:Ui)=>pick(ui.render(),WorkspaceChartHost);
function settle(ui:Ui){ui.effects();ui.render();ui.render();}
/** The stand-in becomes the active chart, and the transaction coordinator applies a history entry the way the grid
 * analysis coordinator does: the charts load the entry first (loadDrawings, which notifies nobody), then the model commits. */
function attach(ui:Ui){
 const fake=standInChart(),apply=vi.fn(async(request:any)=>{request.commitModel(()=>{});return{publicationErrors:[]};});
 host(ui).props.onReady(fake.chart);ui.effects();
 host(ui).props.onTransactionReady({suspend:vi.fn(()=>({isCurrent:()=>true,resume:vi.fn()})),apply});ui.effects();
 return {fake,apply};
}
const TREND={id:'dw-1',type:'trendline',visible:true,locked:false,anchors:[{time:1_000_000,price:100},{time:1_240_000,price:110}]};
/** One drawing placed: the native change is published (App's mirror captures it) and the grid records the workspace
 * drawing document through the real drawing workspace command (one history entry). */
function placeDrawing(ui:Ui,fake:StandIn){
 fake.state.rows=[TREND];fake.state.native=[{}];for(const listener of [...fake.state.drawingListeners])listener();
 const grid=host(ui).props.state,active=grid.layout.activeCellId;
 const next={...grid,cells:{...grid.cells,[active]:{...grid.cells[active],drawings:{version:1,drawings:[TREND]}}}};
 host(ui).props.onCaptureDrawingWorkspace(grid).prepare(next).publish(()=>{});settle(ui);
}
async function undo(ui:Ui){host(ui).props.onDrawingHistory('undo',host(ui).props.state);await flush();ui.effects();await flush();ui.effects();}

it('a workspace Undo (restoreHistory; loadDrawings publishes no change) refreshes the remove counts and the object tree',async()=>{
 const ui=await setup({live:false});
 const {fake,apply}=attach(ui);
 placeDrawing(ui,fake);
 ui.button('Object tree and data window').props.onClick();settle(ui);
 const before=ui.render(),tree=pick(before,ObjectTreeDataWindowWidget).props.objectTree;
 expect(pick(before,DrawingUtilityBlock).props.counts.drawings).toBe(1);
 // The Undo reloads the chart's drawings (none now) and publishes no drawing change.
 apply.mockImplementation(async(request:any)=>{fake.state.rows=[];fake.state.native=[{}];request.commitModel(()=>{});return{publicationErrors:[]};});
 await undo(ui);
 expect(apply).toHaveBeenCalledTimes(1);
 const after=ui.render(),state=host(ui).props.state;
 expect(state.cells[state.layout.activeCellId].drawings.drawings).toEqual([]);
 expect(pick(after,ObjectTreeDataWindowWidget).props.objectTree,'the kept object tree props are rebuilt after the Undo').not.toBe(tree);
 expect(pick(after,DrawingUtilityBlock).props.counts.drawings,'the Remove menu counts the restored drawings').toBe(0);
});

// Not fail-first (a guard): DrawingToolbar and DrawingTools read the renderer tool while rendering and App's tool mirror drops
// renderer notifications while a save or a workspace transaction runs. Both are rebuilt when that window closes only because
// their deps hold changeDrawingFavorites, whose memo deps include workspaceBusy and storageBusy. This pins that coverage.
it(' guard: the drawing toolbar and All drawing tools re-render after a renderer tool change App dropped during a local save',async()=>{
 const ui=await setup({live:false});
 const {fake}=attach(ui);
 pick(ui.render(),DrawingToolbar).props.onSelect('trendline');settle(ui);
 expect(fake.state.tool).toBe('trendline');
 const toolbar=pick(ui.render(),DrawingToolbar);expect(toolbar.props.activeTool).toBe('trendline');
 pick(ui.render(),DrawingToolbar).props.onOpenAll();settle(ui);expect(pick(ui.render(),DrawingTools)).toBeTruthy();
 // A workspace change starts the local save; while it is in flight App's tool mirror ignores renderer notifications.
 let finish:(value:unknown)=>void=()=>{};
 ui.bridge.saveWorkspace.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const saves=ui.bridge.saveWorkspace.mock.calls.length;
 pick(ui.render(),ChartBottomToolbar).props.onTimezone('UTC');ui.effects();
 for(let i=0;i<20&&ui.bridge.saveWorkspace.mock.calls.length===saves;i++){await vi.advanceTimersByTimeAsync(500);await flush();ui.effects();}
 expect(ui.bridge.saveWorkspace.mock.calls.length,'the local save started').toBeGreaterThan(saves);
 const during=pick(ui.render(),DrawingToolbar),duringTools=pick(ui.render(),DrawingTools);
 // The renderer returns to the cursor (a placement finished) during the save.
 fake.state.tool=null;for(const listener of [...fake.state.toolListeners])listener(null);
 finish({ok:true,value:{revision:3,savedAt:'2026-10-22T00:00:02Z'}});
 await flush();ui.effects();await flush();ui.effects();settle(ui);
 // DrawingToolbar reads the renderer tool while it renders; a kept element keeps Trend Line pressed.
 const rebuilt=pick(ui.render(),DrawingToolbar);
 expect(rebuilt,'the toolbar re-renders with the renderer tool').not.toBe(during);
 expect(pick(ui.render(),DrawingTools),'All drawing tools re-renders too').not.toBe(duringTools);
 // A plain App render afterwards keeps it again ('s saving holds).
 ui.button('Alerts').props.onClick();settle(ui);
 expect(pick(ui.render(),DrawingToolbar)).toBe(rebuilt);
});

// Not fail-first (a guard): the Indicators dialog is never kept today, because App passes a new storageWrite object on every
// render (App.tsx analysisStorageWrite), so 's slot rebuilds it with each App render. It reads the chart while rendering
// (chart.getCalculationBars for a hidden indicator's 'The chart has N bars', chart.indicators.scale), so a future change that
// keeps it must also key those reads.
it(' guard: the open Indicators dialog follows the chart bar count of a hidden indicator across a live bar',async()=>{
 const ui=await setup();
 await ui.tick(batch([],[ticker(T0,100.5,100.4,100.6)]));ui.effects();
 const fake=standInChart();
 fake.state.indicators=[{...factoryIndicatorDefault('sma'),id:'ind-1',kind:'sma',visible:false,rendererId:'r-1',diagnostics:[],policies:[],series:[],paneId:'price',informationBars:0,latestInformationTime:null,presentationDiagnostics:[]}];
 fake.state.bars=[1,2,3];
 host(ui).props.onReady(fake.chart);ui.effects();
 ui.button('Indicators').props.onClick();settle(ui);
 const dialog=pick(ui.render(),IndicatorDialog);expect(dialog,'the Indicators dialog is open').toBeTruthy();
 fake.state.bars=[1,2,3,4];
 await ui.tick(batch([candle(T0+300,104.5)],[ticker(T0+360,104.5,104.45,104.55)]));
 expect(pick(ui.render(),IndicatorDialog),'a new chart bar: rebuilt').not.toBe(dialog);
});

it('the Alerts rail panel re-renders when an alert expiration passes on the clock',async()=>{
 const now=Math.floor(Date.now()/1000);
 const alert=createLocalAlert({id:'syn-1',name:'SYNTHETIC expiring',message:'SYNTHETIC',instrumentId:'SYNTHETIC instrument',sourceId:'close',mode:'ordinary',runId:'ordinary',createdAt:now-60,expiresAt:now+120,condition:{kind:'greater',value:10},frequency:'every-time'} as any);
 const ui=await setup({alerts:[alert]});
 await ui.tick(batch([],[ticker(T0,100.5,100.4,100.6)]));ui.effects();
 ui.button('Alerts').props.onClick();settle(ui);
 const dock=pick(ui.render(),AlertsDock);expect(dock.props.alerts.length).toBe(1);
 await ui.tick(batch([candle(T0,104.25)],[ticker(T0+60,104.25,104.2,104.3)]));
 expect(pick(ui.render(),AlertsDock),'nothing it shows changed').toBe(dock);
 const clock=vi.spyOn(Date,'now').mockReturnValue((now+300)*1000);
 try{
  await ui.tick(batch([candle(T0,104.5)],[ticker(T0+120,104.5,104.45,104.55)]));
  const after=pick(ui.render(),AlertsDock);
  // AlertsDock reads now() while rendering (Clone is offered only before the expiration).
  expect(after,'the dock re-renders once the expiration passed').not.toBe(dock);
  expect(pick(ui.render(),AlertsDock)).toBe(after);
 }finally{clock.mockRestore();}
});
