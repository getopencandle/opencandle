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
import {clearLiveDatasets,registerLiveDataset} from '../../src/ui/live-registry';
import {buildStartupLiveGrid} from '../../src/ui/startup-open';
import {persistableWorkspace} from '../../src/ui/live-workspace';
import {patchWorkspace} from '../../src/ui/workspace-grid';
import {coinbaseSearchDatasets} from '../../src/domain/coinbase-live';

// The header symbol is a HeaderSymbolButton element (shallow trees do not expand it): expose its click as the "Search symbols" button.
function headerSearchButton(tree:any):any{const header=find(tree,(node:any)=>node.type===HeaderSymbolButton);return header?{props:{onClick:()=>header.props.onOpen('','toolbar')}}:null;}

// harness copied from live-reconnect-grid-app.test.ts.
// The real App closures under controlled React hooks and a mocked bridge (same harness as the
// autosave App tests). No network, no DOM, no launch. The bridge records every live call.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test)??(node.props.dataSources?find(node.props.dataSources,test):null);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};

async function setup(opts:{alpacaConfigured?:boolean}={}){
 const calls:string[]=[];
 const status={schemaVersion:1,state:'ready',attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{},productIds:['BTC-USD']};
 // Synthetic saved layout: two live Coinbase charts (what a multi-chart startup leaves behind), saved with references only.
 const seed={...createInitialWorkspace(),liveData:{coinbase:true,alpacaSymbols:[]}};
 const built=buildStartupLiveGrid(seed as any,[{source:'coinbase',symbol:'BTC-USD'}],'5m',{coinbase:true,alpacaKey:false});
 // ETH-USD is compared on the BTC-USD chart (its live dataset is registered the way an open feed would be).
 const eth=coinbaseSearchDatasets(true,'5m').find(row=>row.instrument.symbol==='ETH-USD')!;registerLiveDataset({...eth,bars:[{time:1_700_000_000,open:50,high:51,low:49,close:50.5,volume:1}]});
 const opened=patchWorkspace(seed as any,{grid:built.grid}) as any;
 const compared=patchWorkspace(opened,{comparisons:[{id:'cmp-eth',datasetId:eth.provenance.datasetId,mode:'percent',color:'#42a5f5',width:2,visible:true,baseline:'first-visible-match'}]} as never) as any;
 const saved=persistableWorkspace(compared) as any;
 expect(saved.liveComparisons).toBeDefined();expect(JSON.stringify(saved.grid)).not.toContain('live:');
clearLiveDatasets();
 const data=prepareWorkspaceJSON({...saved,paper:createPaperAccount({initialBalance:500}),alerts:[]});
 const bridge:any={
  loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision:1,savedAt:'2026-10-20T00:00:00Z',data,storage:{directory:'Synthetic profile',backend:'json-atomic'}}})),
  saveWorkspace:vi.fn(async(_input:any)=>({ok:true,value:{revision:2,savedAt:'2026-10-20T00:00:01Z'}})),
  fetchCoinbaseCandles:vi.fn(async(input:any)=>{calls.push('fetch:'+input.productId);return{ok:true,value:{schemaVersion:1,productId:input.productId,granularity:input.granularity,seconds:300,bars:[{time:1_700_000_000,open:100,high:101,low:99,close:100.5,volume:2}],provenance:{provider:'test',kind:'public-unauthenticated',sourceUrl:'https://example.invalid/',retrievedAt:'2026-10-20T00:00:00Z',bytes:1,license:'test'}}};}),
  subscribeCoinbase:vi.fn(async(input:any)=>{calls.push('subscribe:'+input.productIds.join(','));return{ok:true,value:status};}),
  unsubscribeCoinbase:vi.fn(async()=>{calls.push('unsubscribe');return{ok:true,value:status};}),
  onCoinbaseEvent:vi.fn(()=>()=>{}),
  alpacaKeyStatus:vi.fn(async()=>({ok:true,value:{configured:!!opts.alpacaConfigured,keyIdHint:null,encryption:true}})),
 };
 vi.stubGlobal('window',{lv:bridge,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady({suspend:vi.fn(()=>({isCurrent:()=>true,resume:vi.fn()}))});render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports */}
 const effects=()=>{render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
 await flush();effects();await flush();effects();
 const button=(name:string)=>{const found=find(render(),node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name))??(name==='Search symbols'?headerSearchButton(render()):null);if(!found)throw Error('Missing control '+name);return found;};
 const settings=()=>find(render(),node=>node.type===DataSourcesPanel)?.props.live;
 const search=()=>find(render(),node=>node.type===SymbolSearchDialog)?.props;
 return{bridge,calls,render,effects,button,settings,search,grid:()=>find(render(),node=>node.type===WorkspaceChartHost).props};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];clearLiveDatasets();});
afterEach(()=>{vi.unstubAllGlobals();clearLiveDatasets();});

it('a saved chart with a live comparison reopens with the comparison and subscribes to its feed',async()=>{
 const ui=await setup();
 await flush();ui.effects();await flush();ui.effects();await flush();ui.effects();
 expect(ui.calls.filter(call=>call.startsWith('fetch:')).sort()).toEqual(['fetch:BTC-USD','fetch:ETH-USD']);
 expect(ui.calls.some(call=>call.startsWith('subscribe:')&&call.includes('ETH-USD'))).toBe(true);
 const state=ui.grid().state,cell=state.cells[state.layout.activeCellId],ethId=coinbaseSearchDatasets(true,'5m').find(row=>row.instrument.symbol==='ETH-USD')!.provenance.datasetId;
 expect(state.layout.cells[0].symbol).toBe('BTC-USD');
 expect(cell.comparisons).toEqual([{id:'cmp-eth',datasetId:ethId,mode:'percent',color:'#42a5f5',width:2,visible:true,baseline:'first-visible-match'}]);
 // Nothing closed the comparison feed: a comparison counts as a chart naming it.
 expect(ui.calls).not.toContain('unsubscribe');
});
