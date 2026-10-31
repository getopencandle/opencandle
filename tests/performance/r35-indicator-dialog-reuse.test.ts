// App's storageWrite for the Indicators dialog is one kept object, so the dialog's slot holds across a
// live tick; the dialog's render-time chart reads (bar count, scale, source choices, pane sizes) key it. Harness copied from
// tests/performance/r34-reuse-audit.test.ts (vi.mock is per file): the real App under controlled hooks, a mocked bridge, a
// SYNTHETIC Coinbase stream and a SYNTHETIC stand-in chart controller. No network.
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

const SMA_ROW={...factoryIndicatorDefault('sma'),id:'ind-1',kind:'sma',visible:false,rendererId:'r-1',diagnostics:[],policies:[],series:[],paneId:'price',informationBars:0,latestInformationTime:null,presentationDiagnostics:[]};
async function openIndicators(){
 const ui=await setup();
 await ui.tick(batch([],[ticker(T0,100.5,100.4,100.6)]));ui.effects();
 const fake=standInChart();fake.state.indicators=[{...SMA_ROW}];fake.state.bars=[1,2,3];
 host(ui).props.onReady(fake.chart);ui.effects();
 ui.button('Indicators').props.onClick();settle(ui);
 const dialog=pick(ui.render(),IndicatorDialog);expect(dialog,'the Indicators dialog is open').toBeTruthy();
 return{ui,fake,dialog};
}

it('App hands the Indicators dialog the same storageWrite object on every render',async()=>{
 const {ui,dialog}=await openIndicators();
 await ui.tick(batch([],[ticker(T0+60,100.5,100.4,100.6)]));
 const again=find(ui.render(),node=>node.type===IndicatorDialog)??dialog;
 expect(again.props.storageWrite,'one storageWrite object').toBe(dialog.props.storageWrite);
 expect(dialog.props.storageWrite.state()).toBe('idle');
});

it('the open Indicators dialog keeps its element across a live tick that changes nothing it reads',async()=>{
 const {ui,dialog}=await openIndicators();
 await ui.tick(batch([],[ticker(T0+60,100.5,100.4,100.6)]));
 expect(pick(ui.render(),IndicatorDialog),'kept: same bar count, scale and sources').toBe(dialog);
});

it('the kept Indicators dialog is rebuilt when the chart bar count or an instance scale changes without a prop change',async()=>{
 const {ui,fake,dialog}=await openIndicators();
 fake.state.bars=[1,2,3,4];
 await ui.tick(batch([],[ticker(T0+60,100.5,100.4,100.6)]));
 const afterBars=pick(ui.render(),IndicatorDialog);
 expect(afterBars,'a new chart bar: rebuilt').not.toBe(dialog);
 fake.state.scales['ind-1']={side:'left',gaps:{top:0,bottom:0}};
 await ui.tick(batch([],[ticker(T0+120,100.5,100.4,100.6)]));
 const afterScale=pick(ui.render(),IndicatorDialog);
 expect(afterScale,'a scale change: rebuilt').not.toBe(afterBars);
 await ui.tick(batch([],[ticker(T0+180,100.5,100.4,100.6)]));
 expect(pick(ui.render(),IndicatorDialog),'then kept again').toBe(afterScale);
});

it('a storageWrite member called on the kept object runs the newest App closure',async()=>{
 const {ui,dialog}=await openIndicators();
 await ui.tick(batch([],[ticker(T0+60,100.5,100.4,100.6)]));
 const ran=vi.fn();dialog.props.storageWrite.afterWrite(ran);await flush();
 expect(ran).toHaveBeenCalledTimes(1);
});

it('the storageWrite object is replaced with the chart, so a queued change keeps the checks of its own chart',async()=>{
 const {ui,dialog}=await openIndicators();
 const replacement=standInChart();replacement.state.indicators=[{...SMA_ROW}];replacement.state.bars=[1,2,3];
 host(ui).props.onReady(replacement.chart);settle(ui);
 const after=pick(ui.render(),IndicatorDialog);
 expect(after,'the dialog follows the new chart').not.toBe(dialog);
 expect(after.props.storageWrite,'a new storageWrite object for the new chart').not.toBe(dialog.props.storageWrite);
});
