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

// The header symbol is a HeaderSymbolButton element (shallow trees do not expand it): expose its click as the "Search symbols" button.
function headerSearchButton(tree:any):any{const header=find(tree,(node:any)=>node.type===HeaderSymbolButton);return header?{props:{onClick:()=>header.props.onOpen('','toolbar')}}:null;}

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
 const data=prepareWorkspaceJSON({...createInitialWorkspace(),paper:createPaperAccount({initialBalance:500}),alerts:[]});
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
 return{bridge,calls,render,effects,button,settings,search};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];clearLiveDatasets();});
afterEach(()=>{vi.unstubAllGlobals();clearLiveDatasets();});

it('Data sources is mounted from the existing menu and live stays off by default: no subscription, no Live rows',async()=>{
 const ui=await setup();
 ui.button('Data sources').props.onClick();
 const panel=ui.settings();expect(panel).toBeTruthy();expect(panel.coinbaseEnabled).toBe(false);
 ui.settings().onCoinbaseEnabledChange?.call(null,false);
 ui.button('Search symbols').props.onClick();
 const rows=ui.search().candidates.filter((row:any)=>row.sourceKind==='live');
 expect(rows).toEqual([]);
 expect(ui.bridge.subscribeCoinbase).not.toHaveBeenCalled();expect(ui.bridge.fetchCoinbaseCandles).not.toHaveBeenCalled();
});

it('enabling Coinbase lists three Live rows; choosing one backfills then streams; turning it off unsubscribes',async()=>{
 const ui=await setup();
 ui.button('Data sources').props.onClick();
 ui.settings().onCoinbaseEnabledChange(true);ui.effects();
 expect(ui.settings().coinbaseEnabled).toBe(true);
 ui.settings().onCoinbaseEnabledChange(true);
 // close the settings dialog, open symbol search
 find(ui.render(),node=>node.type===DataSourcesPanel);
 ui.button('Search symbols').props.onClick();
 const props=ui.search(),rows=props.candidates.filter((row:any)=>row.sourceKind==='live');
 expect(rows.map((row:any)=>row.symbol).sort()).toEqual(['BTC-USD','ETH-USD','SOL-USD']);
 const btc=rows.find((row:any)=>row.symbol==='BTC-USD');
 expect(props.onSelect(switchRequest(btc,'toolbar'))).toBe(true);await flush();ui.effects();await flush();
 expect(ui.bridge.fetchCoinbaseCandles).toHaveBeenCalledOnce();expect(ui.bridge.subscribeCoinbase).toHaveBeenCalled();
 expect(ui.calls.indexOf('fetch:BTC-USD')).toBeLessThan(ui.calls.indexOf('subscribe:BTC-USD'));
 // The heading says "Live" (not "No live connection") while the feed is open.
 const heading=find(ui.render(),node=>node.props?.className==='chart-heading');
 expect(String(heading.props.title)).toContain('Live data');expect(String(heading.props.title)).not.toContain('No live connection');
 // Turning the setting off closes the feed: unsubscribe is sent and the chart moves off the live source.
 ui.bridge.unsubscribeCoinbase.mockClear();
 ui.button('Data sources').props.onClick?.();
 ui.settings()?.onCoinbaseEnabledChange(false);ui.effects();await flush();ui.effects();
 expect(ui.bridge.unsubscribeCoinbase).toHaveBeenCalled();
 const after=find(ui.render(),node=>node.props?.className==='chart-heading');
 expect(String(after.props.title)).toContain('No live connection');
});

it('Alpaca rows appear only after the saved key reports configured',async()=>{
 const off=await setup({alpacaConfigured:false});
 off.button('Data sources').props.onClick();off.settings().onAlpacaSymbolsChange(['AAPL']);off.effects();
 off.button('Search symbols').props.onClick();
 expect(off.search().candidates.filter((row:any)=>row.providerId==='alpaca-iex')).toEqual([]);
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];
 const on=await setup({alpacaConfigured:true});
 on.button('Data sources').props.onClick();on.settings().onAlpacaSymbolsChange(['AAPL']);on.effects();
 on.button('Search symbols').props.onClick();
 expect(on.search().candidates.filter((row:any)=>row.providerId==='alpaca-iex').map((row:any)=>row.symbol)).toEqual(['AAPL']);
});

for(const interval of [null,'7m','60m','15m','1W','12M'])it('EXE-SWEEP-1021 I4: unticking Coinbase with a live chart open ('+(interval??'5m')+') keeps Data sources open and shows the off state',async()=>{
 const ui=await setup();
 ui.button('Data sources').props.onClick();ui.settings().onCoinbaseEnabledChange(true);ui.effects();
 ui.button('Search symbols').props.onClick();
 const btc=ui.search().candidates.find((row:any)=>row.sourceKind==='live'&&row.symbol==='BTC-USD');
 ui.search().onSelect(switchRequest(btc,'toolbar'));await flush();ui.effects();await flush();
 if(interval){(globalThis as any).document={getElementById:()=>null};try{ui.button('Chart intervals').props.onClick();}finally{delete (globalThis as any).document;}const menu=find(ui.render(),node=>node.type===IntervalMenu).props;expect(menu.onApplyLive(interval,menu.state)).not.toBe(false);await flush();ui.effects();await flush();ui.effects();}
 ui.button('Data sources').props.onClick();
 expect(ui.settings()?.coinbaseEnabled).toBe(true);
 // Effects run the way React runs them: an effect that throws reaches the RecoveryBoundary (detaching every dialog).
 const errors:string[]=[];const strict=()=>{ui.render();for(const effect of hooks.effects.splice(0))try{effect();}catch(error){errors.push(String(error));}};
 ui.settings().onCoinbaseEnabledChange(false);strict();await flush();strict();await flush();strict();
 expect(errors).toEqual([]);
 expect(ui.bridge.unsubscribeCoinbase).toHaveBeenCalled();
 const panel=ui.settings();expect(panel).toBeTruthy();expect(panel.coinbaseEnabled).toBe(false);
 // The box still answers: ticking it again is honoured while the dialog stays open.
 panel.onCoinbaseEnabledChange(true);ui.effects();await flush();ui.effects();
 expect(ui.settings()?.coinbaseEnabled).toBe(true);
});
