import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {prepareWorkspaceData} from '../../src/ui/workspace-transfer';
import {clearLiveDatasets,liveDatasetById,registerLiveDataset} from '../../src/ui/live-registry';
import {persistableWorkspace,reconnectLiveCharts,restoreLiveCharts,restoreLiveComparisons,disconnectedLiveMessage,ALPACA_KEY_WAIT_MESSAGE} from '../../src/ui/live-workspace';
import {buildStartupLiveGrid} from '../../src/ui/startup-open';
import {createInitialWorkspace as freshWorkspace} from '../../src/ui/workspace-state';
import {patchWorkspace} from '../../src/ui/workspace-grid';
import {alpacaSearchDatasets,selectAlpacaSyntheticStub,ALPACA_STUB_PROVIDER_ID} from '../../src/domain/alpaca-live';
import type {BarDataset} from '../../src/domain/types';

// A saved Alpaca live chart (GME) and live comparison (SPY) must come back on relaunch whatever the
// order in which the saved workspace, the Alpaca key status and the provider namespace (keyless stub) arrive. The key
// status and the bridge are mocked; no key, no network. Synthetic bars only.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test)??(node.props.dataSources?find(node.props.dataSources,test):null);}return null;}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(yes=>resolve=yes);return{resolve,promise};};
const t0=1_700_000_000,settings={mode:'percent' as const,color:'#42a5f5',width:2,visible:true,baseline:'first-visible-match' as const};
function live(symbol:string):BarDataset{
 const shell=alpacaSearchDatasets(true,[symbol],'5m').find(row=>row.instrument.symbol===symbol)!;
 const dataset={...shell,bars:[0,1,2].map(i=>({time:t0+i*300,open:10+i,high:11+i,low:9+i,close:10.5+i,volume:100}))};registerLiveDataset(dataset);return dataset;
}
/** The workspace a session leaves on disk: a GME live chart with a live SPY comparison, saved in the given provider namespace. */
function savedWorkspace(stub:boolean){
 selectAlpacaSyntheticStub(stub);
 const gme=live('GME'),spy=live('SPY');
 const opened=patchWorkspace(createInitialWorkspace(),{symbol:'GME',sourceId:gme.provenance.datasetId});
 const compared=patchWorkspace(opened,{comparisons:[{id:'cmp-spy',datasetId:spy.provenance.datasetId,...settings}]} as never);
 const safe=persistableWorkspace(compared) as any;
 // A fresh launch: nothing is registered yet and main has not reported the key status (so no stub namespace either).
 clearLiveDatasets();selectAlpacaSyntheticStub(false);
 return{safe,cell:compared.grid!.layout.activeCellId,gmeId:gme.provenance.datasetId,spyId:spy.provenance.datasetId};
}
const fileOf=(safe:any)=>prepareWorkspaceJSON({...safe,paper:createPaperAccount({initialBalance:500}),alerts:[]});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];clearLiveDatasets();selectAlpacaSyntheticStub(false);vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();clearLiveDatasets();selectAlpacaSyntheticStub(false);});

describe('strict restore does not depend on when the key status arrives',()=>{
 it('a reference saved on the keyless stub restores before main reports the stub, and invalid ones still fail',()=>{
  const {safe,cell}=savedWorkspace(true);
  expect(safe.liveCharts[cell].providerId).toBe(ALPACA_STUB_PROVIDER_ID);
  expect(safe.liveComparisons[cell][0].providerId).toBe(ALPACA_STUB_PROVIDER_ID);
  expect(()=>prepareWorkspaceData(fileOf(safe))).not.toThrow();
  // Strict validation is kept for genuinely invalid references.
  const good={providerId:ALPACA_STUB_PROVIDER_ID,symbol:'GME',interval:'5m'};
  expect(restoreLiveCharts({a:good})).toEqual({a:good});
  expect(()=>restoreLiveCharts({a:{...good,providerId:'alpaca-other'}})).toThrow();
  expect(()=>restoreLiveCharts({a:{...good,providerId:'alpaca-sip-delayed'}})).toThrow();
  expect(()=>restoreLiveCharts({a:{...good,symbol:'gme'}})).toThrow();
  expect(()=>restoreLiveCharts({a:{...good,interval:'7s'}})).toThrow();
  expect(()=>restoreLiveCharts({a:{...good,apiKey:'x'}})).toThrow();
  const compare={...good,position:0,comparison:{id:'x',...settings}};
  expect(restoreLiveComparisons({a:[compare]})).toEqual({a:[compare]});
  expect(()=>restoreLiveComparisons({a:[{...compare,providerId:'alpaca-other'}]})).toThrow();
 });
 it('a chart put on its Disconnected stand-in while the key status was pending reopens once the key is known',()=>{
  const {safe,cell,gmeId,spyId}=savedWorkspace(false);
  const restored=prepareWorkspaceData(fileOf(safe)).workspace as any;
  const early=reconnectLiveCharts(restored,{coinbase:false,alpacaKey:false});
  expect(early.workspace.grid.cells[cell].datasetId).toBe(gmeId);
  expect(liveDatasetById(gmeId)?.provenance.state).toBe('disconnected');
  const late=reconnectLiveCharts(early.workspace,{coinbase:false,alpacaKey:true});
  expect(late.reopen.map(row=>row.symbol).sort()).toEqual(['GME','SPY']);
  expect(late.workspace.grid.cells[cell].datasetId).toBe(gmeId);
  expect(late.workspace.grid.cells[cell].comparisons.map((row:any)=>row.datasetId)).toEqual([spyId]);
  expect(liveDatasetById(gmeId)?.provenance.state).toBe('loading');
 });
 it('a reference from the other Alpaca namespace follows the current session namespace',()=>{
  const {safe,cell}=savedWorkspace(false);
  const restored=prepareWorkspaceData(fileOf(safe)).workspace as any;
  selectAlpacaSyntheticStub(true);
  const r=reconnectLiveCharts(restored,{coinbase:false,alpacaKey:true});
  expect(r.reopen.map(row=>row.providerId)).toEqual([ALPACA_STUB_PROVIDER_ID,ALPACA_STUB_PROVIDER_ID]);
  expect(r.workspace.grid!.cells[cell].datasetId).toBe('live:alpaca-stub:GME:5m');
  expect(r.workspace.grid!.cells[cell].comparisons.map((row:any)=>row.datasetId)).toEqual(['live:alpaca-stub:SPY:5m']);
 });
 it('an Alpaca stand-in says it is waiting for the key check, and moves to the stub namespace when a late status selects it',()=>{
  const {safe,cell}=savedWorkspace(false);
  const restored=prepareWorkspaceData(fileOf(safe)).workspace as any;
  const waiting=reconnectLiveCharts(restored,{coinbase:false,alpacaKey:false,alpacaPending:true});
  expect(waiting.reopen).toEqual([]);
  expect(waiting.disconnected.map(row=>row.message)).toEqual([ALPACA_KEY_WAIT_MESSAGE,ALPACA_KEY_WAIT_MESSAGE]);
  expect(liveDatasetById('live:alpaca-iex:GME:5m')?.provenance.notes[0]).toBe(ALPACA_KEY_WAIT_MESSAGE);
  expect(liveDatasetById('live:alpaca-iex:SPY:5m')?.provenance.notes[0]).toBe(ALPACA_KEY_WAIT_MESSAGE);
  selectAlpacaSyntheticStub(true);
  const late=reconnectLiveCharts(waiting.workspace,{coinbase:false,alpacaKey:true});
  expect(late.reopen.map(row=>row.providerId+':'+row.symbol).sort()).toEqual(['alpaca-stub:GME','alpaca-stub:SPY']);
  expect(late.workspace.grid!.cells[cell].datasetId).toBe('live:alpaca-stub:GME:5m');
  expect(late.workspace.grid!.cells[cell].comparisons.map((row:any)=>row.datasetId)).toEqual(['live:alpaca-stub:SPY:5m']);
 });
 it('a late status without a key replaces the waiting message with the plain turned-off message',()=>{
  const {safe}=savedWorkspace(false);
  const restored=prepareWorkspaceData(fileOf(safe)).workspace as any;
  const waiting=reconnectLiveCharts(restored,{coinbase:false,alpacaKey:false,alpacaPending:true});
  const answered=reconnectLiveCharts(waiting.workspace,{coinbase:false,alpacaKey:false});
  expect(answered.reopen).toEqual([]);
  expect(liveDatasetById('live:alpaca-iex:GME:5m')?.provenance.notes[0]).toBe(disconnectedLiveMessage({providerId:'alpaca-iex',symbol:'GME'}));
  expect(liveDatasetById('live:alpaca-iex:SPY:5m')?.provenance.notes[0]).toBe(disconnectedLiveMessage({providerId:'alpaca-iex',symbol:'SPY'}));
 });
});

async function mount(data:unknown,extra:Record<string,unknown>,key:Promise<any>){
 const bridge:any={
  loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision:1,savedAt:'2026-10-22T00:00:00Z',data,storage:{directory:'Synthetic profile',backend:'json-atomic'}}})),
  saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:2,savedAt:'2026-10-22T00:00:01Z'}})),
  alpacaKeyStatus:vi.fn(()=>key),...extra,
 };
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady({suspend:vi.fn(()=>({isCurrent:()=>true,resume:vi.fn()}))});render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports */}
 const effects=async()=>{for(let i=0;i<3;i++){await flush();render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}}};
 await effects();
 return{bridge,render,effects,grid:()=>find(render(),node=>node.type===WorkspaceChartHost)?.props};
}
function alpacaBridge(fetched:string[]){
 const aStatus={schemaVersion:1,state:'ready',attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{},symbols:[]};
 return{
  fetchAlpacaBars:vi.fn(async(input:any)=>{fetched.push(input.symbol);return{ok:true,value:{schemaVersion:1,symbol:input.symbol,timeframe:input.timeframe,seconds:0,feed:input.feed,bars:[],nextPageToken:null,provenance:{provider:'synthetic',kind:'owner-key',feed:input.feed,delaySeconds:0,sourceUrl:'',retrievedAt:'',bytes:0,license:''}}};}),
  subscribeAlpaca:vi.fn(async()=>({ok:true,value:aStatus})),unsubscribeAlpaca:vi.fn(async()=>({ok:true,value:null})),onAlpacaEvent:vi.fn(()=>()=>{}),
 };
}
function coinbaseBridge(fetched:string[]){
 const status={schemaVersion:1,state:'ready',attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{},productIds:['BTC-USD']};
 return{
  fetchCoinbaseCandles:vi.fn(async(input:any)=>{fetched.push(input.productId);return{ok:true,value:{schemaVersion:1,productId:input.productId,granularity:input.granularity,seconds:300,bars:[{time:t0,open:100,high:101,low:99,close:100.5,volume:2}],provenance:{provider:'test',kind:'public-unauthenticated',sourceUrl:'https://example.invalid/',retrievedAt:'2026-10-22T00:00:00Z',bytes:1,license:'test'}}};}),
  subscribeCoinbase:vi.fn(async()=>({ok:true,value:status})),unsubscribeCoinbase:vi.fn(async()=>({ok:true,value:status})),onCoinbaseEvent:vi.fn(()=>()=>{}),
 };
}
describe('App: the key status never settles',()=>{
 it('after 8 s Coinbase reopens, Alpaca waits with a plain message, and a late status reopens Alpaca',async()=>{
  const seed={...freshWorkspace(),liveData:{coinbase:true,alpacaSymbols:[]}};
  const built=buildStartupLiveGrid(seed as any,[{source:'coinbase',symbol:'BTC-USD'},{source:'alpaca',symbol:'GME'}],'5m',{coinbase:true,alpacaKey:true});
  const safe=persistableWorkspace(patchWorkspace(seed as any,{grid:built.grid}) as any);clearLiveDatasets();
  const key=deferred(),fetched:string[]=[];
  const ui=await mount(fileOf(safe),{...alpacaBridge(fetched),...coinbaseBridge(fetched)},key.promise);
  expect(ui.grid(),'the saved workspace is installed').toBeTruthy();
  // Before the bound: everything waits for the key check.
  await vi.advanceTimersByTimeAsync(7000);await ui.effects();
  expect(fetched).toEqual([]);
  await vi.advanceTimersByTimeAsync(1000);await ui.effects();await ui.effects();
  expect(fetched).toEqual(['BTC-USD']);
  const cells=()=>{const state=ui.grid().state;return state.layout.cells.map((row:any)=>state.cells[row.id].datasetId);};
  expect(cells()).toEqual(['live:coinbase-public:BTC-USD:5m','live:alpaca-iex:GME:5m']);
  expect(liveDatasetById('live:alpaca-iex:GME:5m')?.provenance.notes[0]).toBe(ALPACA_KEY_WAIT_MESSAGE);
  expect(liveDatasetById('live:alpaca-iex:GME:5m')?.provenance.state).toBe('disconnected');
  // The status answers late: the Alpaca chart reopens through the same path.
  key.resolve({ok:true,value:{configured:true,keyIdHint:null,encryption:true}});
  await ui.effects();await ui.effects();
  expect(fetched.filter(symbol=>symbol==='GME').length).toBeGreaterThan(0);
  expect(fetched.filter(symbol=>symbol==='BTC-USD').length).toBe(1);
  expect(cells()).toEqual(['live:coinbase-public:BTC-USD:5m','live:alpaca-iex:GME:5m']);
 });
});

describe('App: startup symbols while the key check is late',()=>{
 for(const stub of [false,true])it('--lv-open-symbols=GME,SPY,GME.WS with a key status at 12 s ('+(stub?'keyless stub':'owner key')+'): all three end up live, each opened once',async()=>{
  const fetched:string[]=[],answer={ok:true,value:{configured:true,keyIdHint:stub?'****STUB':null,encryption:true,...(stub?{synthetic:true}:{})}};
  const key=new Promise<any>(resolve=>setTimeout(()=>resolve(answer),12_000));
  const startupOpenSymbols=vi.fn(async()=>({ok:true,value:'GME,SPY,GME.WS'})),searchAlpacaAssets=vi.fn(async()=>({ok:false,error:{code:'X',message:'not used'}}));
  const ui=await mount(fileOf(freshWorkspace()),{...alpacaBridge(fetched),startupOpenSymbols,searchAlpacaAssets},key);
  const live=()=>{const state=ui.grid().state;return state.layout.cells.map((row:any)=>state.cells[row.id].datasetId).filter((id:string)=>id.startsWith('live:'));};
  await vi.advanceTimersByTimeAsync(8000);await ui.effects();await ui.effects();
  // Past the 8 s bound: three live charts wait on their stand-ins. Nothing opened, nothing synthetic, nothing quarantined.
  expect(ui.grid(),'the workspace is installed').toBeTruthy();
  expect(startupOpenSymbols).toHaveBeenCalledTimes(1);
  expect(live()).toEqual(['live:alpaca-iex:GME:1m','live:alpaca-iex:SPY:1m','live:alpaca-iex:GME.WS:1m']);
  for(const id of live()){const shown=liveDatasetById(id)!;expect(shown.provenance.fixture).toBe(false);expect(shown.bars).toEqual([]);expect(shown.provenance.notes[0]).toBe(ALPACA_KEY_WAIT_MESSAGE);}
  expect(fetched).toEqual([]);
  await vi.advanceTimersByTimeAsync(4000);await ui.effects();await ui.effects();await ui.effects();
  const prefix='live:'+(stub?'alpaca-stub':'alpaca-iex')+':';
  expect(live()).toEqual([prefix+'GME:1m',prefix+'SPY:1m',prefix+'GME.WS:1m']);
  expect(startupOpenSymbols,'startup-open does not run twice').toHaveBeenCalledTimes(1);
  expect(searchAlpacaAssets).not.toHaveBeenCalled();
  const opens=ui.bridge.fetchAlpacaBars.mock.calls.filter((call:any[])=>!call[0].pageToken).map((call:any[])=>call[0].symbol+':'+call[0].feed);
  const perSymbol=(symbol:string)=>opens.filter((row:string)=>row.startsWith(symbol+':')).length;
  expect(perSymbol('GME')).toBeGreaterThan(0);
  // Each feed opened exactly once: the same first-page requests for every symbol, none repeated.
  expect(perSymbol('SPY')).toBe(perSymbol('GME'));expect(perSymbol('GME.WS')).toBe(perSymbol('GME'));
  expect(new Set(opens).size).toBe(opens.length);
  expect(ui.grid(),'nothing is quarantined').toBeTruthy();
 });
});

async function launch(stub:boolean){
 const {safe,cell}=savedWorkspace(stub),data=fileOf(safe);
 const key=deferred(),fetched:string[]=[];
 const aStatus={schemaVersion:1,state:'ready',attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{},symbols:[]};
 const bridge:any={
  loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision:1,savedAt:'2026-10-22T00:00:00Z',data,storage:{directory:'Synthetic profile',backend:'json-atomic'}}})),
  saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:2,savedAt:'2026-10-22T00:00:01Z'}})),
  // The key status arrives only when the test says so (after the saved workspace was installed).
  alpacaKeyStatus:vi.fn(()=>key.promise),
  fetchAlpacaBars:vi.fn(async(input:any)=>{fetched.push(input.symbol);return{ok:true,value:{schemaVersion:1,symbol:input.symbol,timeframe:input.timeframe,seconds:0,feed:input.feed,bars:[],nextPageToken:null,provenance:{provider:'synthetic',kind:'owner-key',feed:input.feed,delaySeconds:0,sourceUrl:'',retrievedAt:'',bytes:0,license:''}}};}),
  subscribeAlpaca:vi.fn(async()=>({ok:true,value:aStatus})),unsubscribeAlpaca:vi.fn(async()=>({ok:true,value:null})),onAlpacaEvent:vi.fn(()=>()=>{}),
 };
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady({suspend:vi.fn(()=>({isCurrent:()=>true,resume:vi.fn()}))});render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports */}
 const effects=async()=>{for(let i=0;i<3;i++){await flush();render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}}};
 await effects();
 const grid=()=>find(render(),node=>node.type===WorkspaceChartHost)?.props;
 return{bridge,key,fetched,effects,grid,cell};
}
describe('App: the key status arrives after the saved workspace',()=>{
 for(const stub of [false,true])it((stub?'keyless stub':'owner Alpaca key')+': the GME chart and SPY comparison reopen and are never quarantined',async()=>{
  const ui=await launch(stub);
  // Waiting for the key status: the workspace is installed, nothing is quarantined, no feed is opened yet.
  expect(ui.grid(),'the saved workspace is installed, not held for recovery').toBeTruthy();
  expect(ui.fetched).toEqual([]);
  ui.key.resolve({ok:true,value:{configured:true,keyIdHint:stub?'****STUB':null,encryption:true,...(stub?{synthetic:true}:{})}});
  await ui.effects();await ui.effects();
  expect(ui.grid(),'the saved workspace is installed, not held for recovery').toBeTruthy();
  expect([...new Set(ui.fetched)].sort()).toEqual(['GME','SPY']);
  const cell=ui.grid().state.cells[ui.cell],prefix='live:'+(stub?'alpaca-stub':'alpaca-iex')+':';
  expect(cell.datasetId).toBe(prefix+'GME:5m');
  expect(cell.comparisons.map((row:any)=>row.datasetId)).toEqual([prefix+'SPY:5m']);
 });
});
