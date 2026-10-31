// render-count probe. The real App under controlled React hooks (the harness of the
// live App tests), a mocked bridge and a SYNTHETIC-labelled Coinbase stream (fake socket, no network). A child counts as
// re-rendered when its element is not the previous render's element (React's bailout rule). Consumers of live values are
// read through their bindings, so the same assertions hold on the pre-lane tree (where App passed the values itself):
// LV_RENDER_BASELINE=1 prints the counts without the lane's expectations (used to measure the pre-lane tree).
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

async function setup({live=true}:{live?:boolean}={}){
 let emit:(event:any)=>void=()=>{};
 const status={schemaVersion:1,state:'ready',attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{},productIds:['BTC-USD']};
 const data=prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount({initialBalance:500}),alerts:[]});
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

it('one live bar tick of the active chart re-renders the chart and the watchlist only; toolbars and an open dialog keep their element',async()=>{
 const ui=await setup();
 const host=()=>find(ui.render(),node=>node.type===WorkspaceChartHost);
 expect(String(host().props.activeDatasetId)).toContain('BTC-USD');
 await ui.tick(batch([],[ticker(T0,100.5,100.4,100.6)]));ui.effects();
 ui.button('Search symbols').props.onClick();ui.effects();
 const before=ui.render(),pick=(tree:any,type:any)=>find(tree,node=>node.type===type);
 const toolbarsBefore=[HeaderSymbolButton,DrawingToolbar,ChartBottomToolbar].map(type=>pick(before,type)),dialogBefore=pick(before,SymbolSearchDialog),hostBefore=pick(before,WorkspaceChartHost);
 expect(toolbarsBefore.every(Boolean)).toBe(true);expect(dialogBefore).toBeTruthy();
 hooks.sets=0;
 await ui.tick(batch([candle(T0,104.25)],[ticker(T0+60,104.25,104.2,104.3)]));
 const after=ui.render();
 const report={lane:'R30-LIVE-STORE',baseline,appStateUpdates:hooks.sets,
  chartRerendered:pick(after,WorkspaceChartHost)!==hostBefore,
  toolbarsRerendered:[HeaderSymbolButton,DrawingToolbar,ChartBottomToolbar].filter((type,index)=>pick(after,type)!==toolbarsBefore[index]).map(type=>type.name),
  dialogRerendered:pick(after,SymbolSearchDialog)!==dialogBefore};
 console.log(JSON.stringify(report));
 // The chart and the watchlist follow the tick (consumers), whatever renders them.
 expect(report.chartRerendered).toBe(true);
 expect(pick(after,WorkspaceChartHost).props.activeBars.at(-1).close).toBe(104.25);
 const watch=consumer(after,WatchlistPanel);expect(watch).toBeTruthy();
 expect((watch.props.quoteDatasets??watch.props.datasets).find((row:any)=>row.provenance.datasetId===hostBefore.props.activeDatasetId).bars.at(-1).close).toBe(104.25);
 if(baseline)return;
 expect(report.toolbarsRerendered).toEqual([]);
 expect(report.dialogRerendered).toBe(false);
 // The symbol search a user types in still holds the newest closures: its select runs the current App.
 expect(pick(after,SymbolSearchDialog).props.candidates.some((row:any)=>row.symbol==='BTC-USD')).toBe(true);
});

it('a quote-only tick reaches the quote consumer (the paper dock book) without an App render; the toolbar keeps its element',async()=>{
 // The order ticket cannot open on a Coinbase chart (paper refuses the instrument), so the dock is the quote consumer here;
 // tests/ui/r30-live-store.test.ts covers the ticket binding. The book rule is App's: topOfBookDisplayQuote(live, action quote).
 const ui=await setup();
 await ui.tick(batch([],[ticker(T0,100.5,100.4,100.6)]));ui.effects();
 const before=ui.render(),toolbar=find(before,node=>node.type===DrawingToolbar),id=find(before,node=>node.type===PaperTradingDock).props.instrument.id;
 expect(liveQuotes.get(id)?.bid).toBe(100.4);
 hooks.sets=0;
 // Same price and time: no bar changes, only the best bid and ask move.
 await ui.tick(batch([],[ticker(T0,100.5,100.45,100.55)]));
 const appStateUpdates=hooks.sets,after=ui.render();
 console.log(JSON.stringify({lane:'R30-LIVE-STORE',baseline,quoteTickAppStateUpdates:appStateUpdates,toolbarRerendered:find(after,node=>node.type===DrawingToolbar)!==toolbar}));
 expect(liveQuotes.get(id)?.bid).toBe(100.45);
 const dock=consumer(after,PaperTradingDock);expect(dock.type).toBe(PaperTradingDock);
 expect(dock.props.book??null).toEqual(topOfBookDisplayQuote(liveQuotes.get(id),dock.props.quote,Date.now()));
 if(baseline)return;
 expect(appStateUpdates,'a quote no longer renders App').toBe(0);
 expect(find(after,node=>node.type===DrawingToolbar)).toBe(toolbar);
});

// The remaining surfaces. Each is opened, App renders twice more (a handler App recreates is forwarded
// once, 's reuse rule), then one live bar tick of the active chart (a new close) arrives. A surface that does not show
// the bars keeps its element; a surface that shows them still gets the new close.
const pick=(tree:any,type:any)=>find(tree,node=>node.type===type);
type Ui=Awaited<ReturnType<typeof setup>>;
async function warm(ui:Ui){await ui.tick(batch([],[ticker(T0,100.5,100.4,100.6)]));ui.effects();}
function settle(ui:Ui){ui.effects();ui.render();ui.render();}
async function acrossTick(ui:Ui,types:any[],close:number){
 const before=ui.render(),kept=types.map(type=>pick(before,type));
 expect(kept.map(Boolean),'every surface is open: '+types.map(type=>type.name).join(', ')).toEqual(types.map(()=>true));
 await ui.tick(batch([candle(T0,close)],[ticker(T0+60,close,close-0.05,close+0.05)]));
 const after=ui.render();
 expect(pick(after,WorkspaceChartHost).props.activeBars.at(-1).close,'the tick reached the chart').toBe(close);
 const rerendered=types.filter((type,index)=>pick(after,type)!==kept[index]).map(type=>type.name);
 console.log(JSON.stringify({lane:'R32-DIALOG-PERF',baseline,surfaces:types.map(type=>type.name),rerendered}));
 return{before,after,rerendered};
}

it('Chart settings on its Data sources tab keeps its element and its panel across a live bar tick',async()=>{
 const ui=await setup();await warm(ui);
 ui.button('Data sources').props.onClick();settle(ui);
 const {after,rerendered}=await acrossTick(ui,[ChartSettingsDialog,DataSourcesPanel],104.25);
 expect(pick(after,ChartSettingsDialog).props.initialTab).toBe('datasources');
 expect(pick(after,DataSourcesPanel).props.live.coinbaseEnabled).toBe(true);
 if(baseline)return;
 expect(rerendered).toEqual([]);
});

it('Chart settings takes its chart reads when it opens, not on a tick',async()=>{
 const ui=await setup();await warm(ui);
 // A stand-in controller (SYNTHETIC values) that counts the four reads Chart settings takes; every other member is absent.
 const reads={settings:0,ratio:0,options:0,type:0};
 const chart:any=new Proxy({},{get:(_target,key)=>key==='priceScale'?{settings:()=>{reads.settings++;return{mainSide:'right'};},ratio:()=>{reads.ratio++;return 1;}}:key==='getChartOptions'?()=>{reads.options++;return{scale:'linear',invert:false,auto:true};}:key==='getChartSettings'?()=>{reads.type++;return{};}:undefined});
 pick(ui.render(),WorkspaceChartHost).props.onReady(chart);ui.effects();
 ui.button('Data sources').props.onClick();settle(ui);
 const opened={...reads},dialog=pick(ui.render(),ChartSettingsDialog);
 expect(dialog.props.ratio).toBe(1);expect(dialog.props.scaleMode).toEqual({scale:'linear',invert:false,auto:true});
 await ui.tick(batch([candle(T0,104.25)],[ticker(T0+60,104.25,104.2,104.3)]));ui.render();ui.render();
 console.log(JSON.stringify({lane:'R32-DIALOG-PERF',baseline,chartSettingsReadsAfterOpen:{settings:reads.settings-opened.settings,ratio:reads.ratio-opened.ratio,options:reads.options-opened.options}}));
 if(baseline)return;
 expect({settings:reads.settings,ratio:reads.ratio,options:reads.options}).toEqual({settings:opened.settings,ratio:opened.ratio,options:opened.options});
});

it('Symbol info keeps its element across a live bar tick',async()=>{
 const ui=await setup();await warm(ui);
 pick(ui.render(),HeaderSymbolButton).props.onInfo();settle(ui);
 const {after,rerendered}=await acrossTick(ui,[SymbolInfoDialog],104.25);
 expect(pick(after,SymbolInfoDialog).props.dataset.instrument.symbol).toBe('BTC-USD');
 if(baseline)return;
 expect(rerendered).toEqual([]);
});

it('the interval menu and the Chart intervals dialog keep their element across a live bar tick',async()=>{
 const ui=await setup();await warm(ui);
 // The menu opens under its badge (no DOM here: the badge is absent and the menu takes its default place).
 vi.stubGlobal('document',{getElementById:()=>null});
 ui.button('Chart intervals').props.onClick();settle(ui);
 const menu=await acrossTick(ui,[IntervalMenu],104.25);
 expect(pick(menu.after,IntervalMenu).props.current.resolution).toBe('1D');
 pick(menu.after,IntervalMenu).props.onAdvanced();settle(ui);
 const dialog=await acrossTick(ui,[IntervalDialog],104.5);
 expect(pick(dialog.after,IntervalDialog).props.current.instrument.symbol).toBe('BTC-USD');
 if(baseline)return;
 expect(menu.rerendered).toEqual([]);
 expect(dialog.rerendered).toEqual([]);
});

it('the closed Script editor keeps its element across a live bar tick; the open one still gets the new bars',async()=>{
 const ui=await setup();await warm(ui);settle(ui);
 const closed=await acrossTick(ui,[ScriptLibraryPanel],104.25);
 expect(pick(closed.after,ScriptLibraryPanel).props.open).toBe(false);
 ui.button('Script editor').props.onClick();settle(ui);
 const open=await acrossTick(ui,[ScriptLibraryPanel],104.5);
 // Open, it follows the tick: an execution in flight belongs to the exact bars it was given (new bars cancel it).
 expect(pick(open.after,ScriptLibraryPanel).props.open).toBe(true);
 expect(pick(open.after,ScriptLibraryPanel).props.bars.at(-1).close).toBe(104.5);
 if(baseline)return;
 expect(closed.rerendered).toEqual([]);
});

it('the Alerts rail panel keeps its element; the object tree keeps its props while the data window follows the tick',async()=>{
 const ui=await setup();await warm(ui);
 ui.button('Alerts').props.onClick();settle(ui);
 const alerts=await acrossTick(ui,[AlertsDock],104.25);
 ui.button('Object tree and data window').props.onClick();settle(ui);
 const widget=(tree:any)=>pick(tree,ObjectTreeDataWindowWidget);
 const objects=await acrossTick(ui,[ObjectTreeDataWindowWidget],104.5);
 expect(widget(objects.after).props.dataWindow.bars.at(-1).close).toBe(104.5);
 expect(widget(objects.after).props.objectTree.dataset.instrument.symbol).toBe('BTC-USD');
 if(baseline)return;
 expect(alerts.rerendered).toEqual([]);
 expect(widget(objects.after).props.objectTree).toBe(widget(objects.before).props.objectTree);
});

it('the open Alerts dialog keeps its element across a live bar tick; WorkspaceAlerts still gets the new bars',async()=>{
 const ui=await setup();await warm(ui);
 ui.button('Alerts').props.onClick();ui.effects();pick(ui.render(),AlertsDock).props.onCreate();settle(ui);
 // WorkspaceAlerts renders in its own hook scope with its effects discarded (no evaluation runs): only its element counts.
 const scope:any[]=[];
 // The dialog's clock (no observation yet: the wall second) is held still while it renders.
 const alertsDialog=(tree:any)=>{const element=pick(tree,WorkspaceAlerts),saved={cells:hooks.cells,cursor:hooks.cursor,effects:hooks.effects.length};hooks.cells=scope;hooks.cursor=0;const clock=vi.spyOn(Date,'now').mockReturnValue(T0*1000+30_000);
  try{return{props:element.props,dialog:element.type(element.props)};}finally{clock.mockRestore();hooks.cells=saved.cells;hooks.cursor=saved.cursor;hooks.effects.length=saved.effects;}};
 {
  alertsDialog(ui.render());alertsDialog(ui.render());
  const before=alertsDialog(ui.render());expect(before.dialog.type).toBe(AlertDialog);expect(before.dialog.props.open).toBe(true);
  await ui.tick(batch([candle(T0,104.25)],[ticker(T0+60,104.25,104.2,104.3)]));
  const after=alertsDialog(ui.render());
  expect(after.props.bars.at(-1).close).toBe(104.25);
  console.log(JSON.stringify({lane:'R32-DIALOG-PERF',baseline,surfaces:['AlertDialog'],rerendered:after.dialog===before.dialog?[]:['AlertDialog']}));
  if(baseline)return;
  expect(after.dialog).toBe(before.dialog);
 }
});

it('the order ticket form keeps its element while App renders for something it does not show',async()=>{
 // The ticket cannot open on the Coinbase chart (paper refuses the instrument): the SYNTHETIC demo chart is used, and an App
 // render that changes nothing the ticket reads (a rail panel switch) stands in for a tick that leaves its quote unchanged.
 const ui=await setup({live:false});
 pick(ui.render(),PaperTradingDock).props.onOpenTicket('buy');settle(ui);
 const before=ui.render(),ticket=pick(before,PaperOrderTicket);expect(ticket).toBeTruthy();
 hooks.sets=0;ui.button('Alerts').props.onClick();ui.effects();
 const after=ui.render();expect(hooks.sets).toBeGreaterThan(0);
 console.log(JSON.stringify({lane:'R32-DIALOG-PERF',baseline,surfaces:['PaperOrderTicket'],rerendered:pick(after,PaperOrderTicket)===ticket?[]:['PaperOrderTicket']}));
 expect(pick(after,PaperOrderTicket).props.quote).toEqual(ticket.props.quote);
 if(baseline)return;
 expect(pick(after,PaperOrderTicket)).toBe(ticket);
});
