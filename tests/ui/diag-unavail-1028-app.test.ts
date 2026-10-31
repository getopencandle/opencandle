import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {App} from '../../src/ui/App';
import {DataSourcesPanel} from '../../src/ui/data-sources-panel';
import {SymbolSearchDialog} from '../../src/ui/SymbolSearchDialog';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {HeaderSymbolButton} from '../../src/ui/HeaderSymbolButton';
import {switchRequest} from '../../src/ui/symbol-search';
import {clearLiveDatasets} from '../../src/ui/live-registry';
import {IntervalMenu} from '../../src/ui/IntervalMenu';
import type {Bar} from '../../src/domain/types';
import {requestLiveHistory} from '../../src/domain/live-history';

// Repro: a live Coinbase BTC-USD 4h -> 1D switch shows the cached 1D
// bars at once and fetches the REST refresh; the refresh is a new revision of the feed (not growth). When the routine
// background autosave held the chart tree in between, the refresh was published mid-hold: the held chart refused it
// ("Chart unavailable: Error: The chart input is held by an owned workspace transition.") and the hold's resume found
// its dataset universe superseded ("Saved locally, but the chart workspace needs recovery"). The coordinator below
// resumes exactly like grid-tree-coordinator (the held datasets must still be the current ones). Actual App closures under
// controlled React hooks and a SYNTHETIC bridge with delayed responses; no network, no DOM.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test)??(node.props.dataSources?find(node.props.dataSources,test):null);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>resolve=yes);return{resolve,promise};};
const NOW=Date.UTC(2026,9,28,12,0,0);
const SIZES:Record<string,number>={ONE_MINUTE:60,FIVE_MINUTE:300,FIFTEEN_MINUTE:900,ONE_HOUR:3600,SIX_HOUR:21600,ONE_DAY:86400};
const candles=(size:number,start:number,end:number)=>{const out:Bar[]=[];for(let t=Math.ceil(start/size)*size;t<=end;t+=size){const p=60000+(t/size)%17;out.push({time:t,open:p,high:p+5,low:p-5,close:p+1,volume:2});}return out;};

async function setup(){
 const feed={schemaVersion:1,state:'ready',attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{},productIds:['BTC-USD']};
 const data=prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount({initialBalance:500}),alerts:[]});
 let revision=1;const held:Record<string,ReturnType<typeof deferred<void>>>={};
 const dayEnd=Math.floor(NOW/1000/86400)*86400-86400,cachedDay=candles(86400,dayEnd-199*86400,dayEnd);
 const bridge:any={
  loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision,savedAt:'2026-10-28T00:00:00Z',data,storage:{directory:'Synthetic profile',backend:'json-atomic'}}})),
  saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:++revision,savedAt:'2026-10-28T00:00:01Z'}})),
  onFlushRequest:vi.fn(()=>vi.fn()),
  // Delayed REST responses: a granularity listed in `held` answers only when the test releases it.
  fetchCoinbaseCandles:vi.fn(async(input:any)=>{const gate=held[input.granularity];if(gate)await gate.promise;const size=SIZES[input.granularity];return{ok:true,value:{schemaVersion:1,productId:input.productId,granularity:input.granularity,seconds:size,bars:candles(size,input.start,input.end),provenance:{provider:'synthetic',kind:'public-unauthenticated',sourceUrl:'synthetic',retrievedAt:'',bytes:0,license:''}}};}),
  subscribeCoinbase:vi.fn(async()=>({ok:true,value:feed})),unsubscribeCoinbase:vi.fn(async()=>({ok:true,value:feed})),onCoinbaseEvent:vi.fn(()=>()=>{}),
  alpacaKeyStatus:vi.fn(async()=>({ok:true,value:{configured:false,keyIdHint:null,encryption:true}})),
  // The local bar cache holds closed 1D bars (the chart was opened at 1D before): a 1D open shows them at once.
  readBarCache:vi.fn(async({key}:any)=>({ok:true,value:key.interval==='1D'?{schemaVersion:1,key,savedAt:'synthetic',synthetic:false,bars:cachedDay.map(bar=>({...bar}))}:null})),
  writeBarCache:vi.fn(async()=>({ok:true,value:{schemaVersion:1,bytes:1,entries:1,maxBytes:1}})),
  discardBarCache:vi.fn(async()=>({ok:true,value:{removed:0}})),
 };
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 vi.stubGlobal('document',{getElementById:()=>null,querySelector:()=>null,activeElement:null,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const render=()=>{hooks.cursor=0;return App();};
 const host=()=>find(render(),node=>node.type===WorkspaceChartHost)?.props;
 // Resumes like grid-tree-coordinator: the held tree's dataset universe must still be the current one.
 const holds:Array<{datasets:unknown;resumed:boolean}>=[];
 const coordinator={suspend:vi.fn((expected:any)=>{const row={datasets:expected.datasets,resumed:false};holds.push(row);return{isCurrent:()=>!row.resumed,resume:()=>{row.resumed=true;if(host()?.datasets!==row.datasets)throw Error('Original chart tree ownership was superseded');}};})};
 render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 host()?.onTransactionReady(coordinator);render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports */}
 const effects=()=>{render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
 const settle=async()=>{for(let i=0;i<4;i++){await flush();effects();}};
 await settle();
 const button=(name:string)=>{const found=find(render(),node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name));if(found)return found;if(name==='Search symbols'){const header=find(render(),node=>node.type===HeaderSymbolButton);if(header)return{props:{onClick:()=>header.props.onOpen('','toolbar')}};}throw Error('Missing control '+name);};
 const status=()=>text(find(render(),node=>node.type==='footer'&&node.props.className==='statusbar'));
 const activeDataset=()=>{const props=host(),state=props.state,id=state.layout.activeCellId,cell=state.layout.cells.find((row:any)=>row.id===id);return props.datasets.find((dataset:any)=>dataset.provenance.datasetId.startsWith('live:')&&dataset.instrument.symbol===cell.symbol&&dataset.resolution===cell.interval)??null;};
 return{bridge,held,holds,coordinator,render,effects,settle,button,status,host,activeDataset};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];clearLiveDatasets();vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date'],now:NOW});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();clearLiveDatasets();});

it('a live 4h -> 1D switch whose REST refresh lands while the background save holds the chart waits for the hold, then shows',async()=>{
 const ui=await setup();
 ui.button('Data sources').props.onClick();ui.render();find(ui.render(),node=>node.type===DataSourcesPanel).props.live.onCoinbaseEnabledChange(true);ui.effects();
 ui.button('Search symbols').props.onClick();
 const btc=find(ui.render(),node=>node.type===SymbolSearchDialog).props.candidates.find((row:any)=>row.sourceKind==='live'&&row.symbol==='BTC-USD');
 find(ui.render(),node=>node.type===SymbolSearchDialog).props.onSelect(switchRequest(btc,'toolbar'));await ui.settle();
 const menuOf=()=>{if(!find(ui.render(),node=>node.type===IntervalMenu))find(ui.render(),node=>node.type==='button'&&node.props.id==='lv-interval-badge')?.props.onClick();return find(ui.render(),node=>node.type===IntervalMenu).props;};
 let menu=menuOf();expect(menu.onApplyLive('4h',menu.state)).not.toBe(false);await ui.settle();
 await vi.advanceTimersByTimeAsync(1500);await ui.settle();
 expect(ui.activeDataset()?.resolution).toBe('240m');
 // 4h -> 1D: the cache answers at once, the 1D REST refresh (ONE_DAY) and the save write stay in flight.
 const refresh=deferred<void>();ui.held.ONE_DAY=refresh;
 const write=deferred<any>();ui.bridge.saveWorkspace.mockReturnValueOnce(write.promise);
 menu=menuOf();expect(menu.onApplyLive('1D',menu.state)).not.toBe(false);await ui.settle();
 const cached=ui.activeDataset();expect(cached?.resolution).toBe('1D');expect(cached?.provenance.notes.join(' ')).toMatch(/cache/i);
 ui.holds.length=0;await vi.advanceTimersByTimeAsync(1500);await ui.settle();
 expect(ui.holds.length,'the background save holds the chart tree').toBe(1);expect(ui.holds[0].resumed).toBe(false);
 // The refresh lands mid-hold (a new revision of the 1D feed).
 refresh.resolve();await ui.settle();
 expect(ui.activeDataset(),'not published into the held tree').toBe(cached);
 write.resolve({ok:true,value:{revision:99,savedAt:'2026-10-28T00:00:02Z'}});await ui.settle();
 expect(ui.status()).not.toMatch(/needs recovery|Chart unavailable/);
 const refreshed=ui.activeDataset();
 expect(refreshed?.resolution).toBe('1D');expect(refreshed?.provenance.revision).not.toBe(cached.provenance.revision);
 expect(refreshed?.provenance.notes.join(' ')).not.toMatch(/cache/i);
 // History backfill is growth of the same lineage: a page landing while a save holds the tree is not a supersession.
 const write2=deferred<any>();ui.bridge.saveWorkspace.mockReturnValueOnce(write2.promise);ui.holds.length=0;
 const host=ui.host(),next=structuredClone(host.state);next.cells[next.layout.activeCellId].appearance.background='#13579b';host.onChange(next);ui.effects();
 await vi.advanceTimersByTimeAsync(1500);await ui.settle();expect(ui.holds.length).toBe(1);
 const oldest=refreshed.bars[0].time,pages=()=>ui.bridge.fetchCoinbaseCandles.mock.calls.filter((call:any)=>call[0].granularity==='ONE_DAY'&&call[0].end<=oldest).length;expect(requestLiveHistory(refreshed.provenance.datasetId)).toBe(true);await ui.settle();await vi.advanceTimersByTimeAsync(300);await ui.settle();
 write2.resolve({ok:true,value:{revision:100,savedAt:'2026-10-28T00:00:03Z'}});await ui.settle();
 expect(ui.holds[0].resumed).toBe(true);expect(ui.status()).not.toMatch(/needs recovery|Chart unavailable/);expect(pages(),'an older 1D page was fetched and merged during the hold').toBeGreaterThan(0);
 // 1D -> 1W -> 4h quickly: every switch lands on its own feed; no failure on the way.
 menu=menuOf();expect(menu.onApplyLive('1W',menu.state)).not.toBe(false);await ui.settle();
 menu=menuOf();expect(menu.onApplyLive('4h',menu.state)).not.toBe(false);await ui.settle();await vi.advanceTimersByTimeAsync(1500);await ui.settle();
 expect(ui.activeDataset()?.resolution).toBe('240m');expect(ui.status()).not.toMatch(/needs recovery|Chart unavailable/);
});
