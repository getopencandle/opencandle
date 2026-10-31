import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {App} from '../../src/ui/App';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';
import {DataSourcesPanel} from '../../src/ui/data-sources-panel';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {clearLiveDatasets,liveDatasetById} from '../../src/ui/live-registry';
import {persistableWorkspace,disconnectedLiveMessage} from '../../src/ui/live-workspace';
import {buildStartupLiveGrid} from '../../src/ui/startup-open';
import {patchWorkspace} from '../../src/ui/workspace-grid';
import {selectAlpacaSyntheticStub,ALPACA_STUB_PROVIDER_ID} from '../../src/domain/alpaca-live';
import {describeStreamStatus} from '../../src/ui/LiveDataSettings';
import {launchMain,type Booted} from '../desktop/r30-key-lifecycle-main';

// The App side of the Alpaca key lifecycle. App (hooks run by a small stand-in for React, as in
// r24-restore-race) on window.lv from the real preload and the real main process on the keyless stub
// (LV_ALPACA_STUB=synthetic-lifecycle), plus a mocked Coinbase public feed. A GME chart and a BTC-USD chart are open. Clear
// key: GME shows the Disconnected stand-in, BTC-USD keeps streaming. A wrong (SYNTHETIC) key: the Data sources line shows the
// rejected-key text and nothing retries. The stub key: GME reopens and ticks. A relaunch: still connected. No real key, no
// network (the global fetch and WebSocket throw).
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps),useEffect:(fn:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old[i]))){hooks.cells[index]=deps;hooks.effects.push(fn);}}};
});
const require=createRequire(import.meta.url);
const {STUB_KEYS}=require('../../electron/alpaca-stub.cjs');
const WRONG=Object.freeze({keyId:'LVSYNTHETICWRONG0000',secret:'lv-synthetic-wrong-not-a-key-000000000'});
const KEY_REJECTED='Alpaca rejected the key.';
const GME='live:'+ALPACA_STUB_PROVIDER_ID+':GME:1m',BTC='live:coinbase-public:BTC-USD:1m';
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test)??(node.props.dataSources?find(node.props.dataSources,test):null);}return null;}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const profiles:string[]=[];
afterAll(()=>{for(const dir of profiles)rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];clearLiveDatasets();selectAlpacaSyntheticStub(false);});
afterEach(()=>{vi.unstubAllGlobals();clearLiveDatasets();selectAlpacaSyntheticStub(false);});

/** The saved workspace: a two-chart layout, BTC-USD (Coinbase) and GME (the stub namespace), both 1m. */
function savedFile(){
 selectAlpacaSyntheticStub(true);
 const seed={...createInitialWorkspace(),liveData:{coinbase:true,alpacaSymbols:[]}};
 const built=buildStartupLiveGrid(seed as any,[{source:'coinbase',symbol:'BTC-USD'},{source:'alpaca',symbol:'GME'}],'1m',{coinbase:true,alpacaKey:true});
 const safe=persistableWorkspace(patchWorkspace(seed as any,{grid:built.grid}) as any);
 clearLiveDatasets();selectAlpacaSyntheticStub(false);
 return prepareWorkspaceJSON({...safe,paper:createPaperAccount({initialBalance:500}),alerts:[]});
}
/** A mocked Coinbase public feed: candles once, then a trade batch whenever the test pushes one. */
function coinbase(){
 const handlers=new Set<(event:any)=>void>(),t0=Math.floor(Date.now()/60000)*60-600;
 const status={schemaVersion:1,state:'ready',attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{},productIds:['BTC-USD']};
 const bridge={
  fetchCoinbaseCandles:vi.fn(async(input:any)=>({ok:true,value:{schemaVersion:1,productId:input.productId,granularity:input.granularity,seconds:60,bars:[0,1,2,3,4].map(i=>({time:t0+i*60,open:100+i,high:101+i,low:99+i,close:100.5+i,volume:2})),provenance:{provider:'test',kind:'public-unauthenticated',sourceUrl:'https://example.invalid/',retrievedAt:new Date().toISOString(),bytes:1,license:'test'}}})),
  subscribeCoinbase:vi.fn(async()=>({ok:true,value:status})),unsubscribeCoinbase:vi.fn(async()=>({ok:true,value:status})),
  onCoinbaseEvent:vi.fn((handler:(event:any)=>void)=>{handlers.add(handler);return()=>handlers.delete(handler);}),
 };
 let price=105;
 const tick=()=>{price+=0.25;const now=Date.now();for(const handler of handlers)handler({schemaVersion:1,kind:'batch',candles:[],tickers:[{productId:'BTC-USD',time:Math.floor(now/1000),price,high:price,low:price,bid:null,ask:null}],receivedAt:new Date(now).toISOString()});};
 return{bridge,tick};
}
async function mountApp(main:Booted,cb:ReturnType<typeof coinbase>){
 const file=savedFile();
 const lv:any={...main.lv,...cb.bridge,
  loadWorkspace:vi.fn(async()=>({ok:true,value:{schemaVersion:1,revision:1,savedAt:'2026-10-22T00:00:00Z',data:file,storage:{directory:'Synthetic profile',backend:'json-atomic'}}})),
  saveWorkspace:vi.fn(async()=>({ok:true,value:{revision:2,savedAt:'2026-10-22T00:00:01Z'}}))};
 vi.stubGlobal('window',{lv,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const render=()=>{hooks.cursor=0;return App();};render();const mounted=hooks.effects;hooks.effects=[];mounted[0]();await flush();
 find(render(),node=>node.type===WorkspaceChartHost)?.props.onTransactionReady({suspend:vi.fn(()=>({isCurrent:()=>true,resume:vi.fn()}))});render();
 for(const effect of mounted.slice(1))try{effect();}catch{/* effects for absent DOM ports */}
 const effects=async()=>{for(let i=0;i<3;i++){await flush();render();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}}};
 await effects();
 const cells=()=>{const state=find(render(),node=>node.type===WorkspaceChartHost)?.props.state;return state?state.layout.cells.map((row:any)=>state.cells[row.id].datasetId):[];};
 /** What LiveDataSettings does with a key result: report it to App (onAlpacaKeyStatus). */
 const report=async(result:any)=>{expect(result.ok).toBe(true);let panel=find(render(),node=>node.type===DataSourcesPanel);
  // Settings > Data sources: open the Settings dialog the way its toolbar button does.
  if(!panel){find(render(),node=>typeof node.props?.onClick==='function'&&String(node.props.onClick).includes('openSettings()')).props.onClick();await effects();panel=find(render(),node=>node.type===DataSourcesPanel);}
  panel.props.live.onAlpacaKeyStatus(result.value);await effects();};
 /** Wait for a condition while App's effects keep running. */
 const until=async(check:()=>void,timeout=8000)=>{const end=Date.now()+timeout;for(;;){await effects();try{check();return;}catch(error){if(Date.now()>end)throw error;}await pause(50);}};
 return{lv,render,effects,cells,report,until};
}
const lastStatus=(b:Booted)=>b.events.filter(e=>e.kind==='status').at(-1)?.status;
const connects=(b:Booted)=>b.events.filter(e=>e.kind==='status'&&e.status.state==='connecting').length;

describe('App: the Alpaca key lifecycle on the keyless stub',()=>{
 it('clear, wrong key, stub key, relaunch: only Alpaca charts follow the key, Coinbase keeps streaming, nothing retries a rejected key',async()=>{
  const fetch=vi.fn(()=>{throw new Error('network used');}),Socket=vi.fn(()=>{throw new Error('socket used');});
  const profile=mkdtempSync(path.join(os.tmpdir(),'lv-r30-keylife-app-'));profiles.push(profile);
  let main=await launchMain(profile);
  const cb=coinbase();
  let ui=await mountApp(main,cb);vi.stubGlobal('fetch',fetch);vi.stubGlobal('WebSocket',Socket);
  // ---- Both charts open and stream.
  await ui.until(()=>{expect(ui.cells()).toEqual([BTC,GME]);expect(liveDatasetById(GME)?.provenance.state).toBe('ready');expect(liveDatasetById(GME)!.bars.length).toBeGreaterThan(0);expect(liveDatasetById(BTC)?.provenance.state).toBe('ready');});
  let gme=liveDatasetById(GME);await ui.until(()=>expect(liveDatasetById(GME)).not.toBe(gme));
  // ---- Clear key: GME moves to its Disconnected stand-in under the same dataset id; BTC-USD keeps streaming.
  await ui.report(await ui.lv.clearAlpacaKey());
  await ui.until(()=>{const shown=liveDatasetById(GME)!;expect(shown.provenance.state).toBe('disconnected');expect(shown.bars).toEqual([]);expect(shown.provenance.notes[0]).toBe(disconnectedLiveMessage({providerId:ALPACA_STUB_PROVIDER_ID,symbol:'GME'}));});
  expect(ui.cells()).toEqual([BTC,GME]);
  expect(cb.bridge.unsubscribeCoinbase).not.toHaveBeenCalled();
  const btc=liveDatasetById(BTC)!;expect(btc.provenance.state).toBe('ready');
  cb.tick();await ui.until(()=>{expect(liveDatasetById(BTC)).not.toBe(btc);expect(liveDatasetById(BTC)!.provenance.state).toBe('ready');});
  await ui.until(()=>expect(lastStatus(main)?.state).toBe('idle'),4000);
  // ---- A wrong key: GME reopens, Alpaca refuses it, and the Data sources line says so. One stream attempt, no REST retry.
  const before=connects(main);
  await ui.report(await ui.lv.saveAlpacaKey({...WRONG}));
  await ui.until(()=>expect(lastStatus(main)?.state).toBe('auth-failed'));
  const line=describeStreamStatus((await ui.lv.alpacaStatus()).value);
  expect(line).toContain('Live stream stopped: '+KEY_REJECTED);expect(line).toContain('(Alpaca code 402: auth failed)');
  await ui.until(()=>expect(liveDatasetById(GME)!.provenance.notes.join(' ')).toContain(KEY_REJECTED));
  expect(liveDatasetById(GME)!.provenance.state).not.toBe('ready');
  const bars=main.invoked.filter(channel=>channel==='lv:alpaca:bars').length;
  await pause(4500);await ui.effects();
  expect(connects(main)-before,'one stream attempt with the rejected key').toBe(1);
  expect(main.invoked.filter(channel=>channel==='lv:alpaca:bars').length,'no REST retry with the rejected key').toBe(bars);
  expect(liveDatasetById(BTC)!.provenance.state).toBe('ready');
  // ---- The stub key: the same GME chart loads and ticks (the key stayed configured, so App does not reopen it itself).
  await ui.report(await ui.lv.saveAlpacaKey({...STUB_KEYS}));
  await ui.until(()=>{const shown=liveDatasetById(GME)!;expect(shown.provenance.state).toBe('ready');expect(shown.bars.length).toBeGreaterThan(0);expect(shown.provenance.notes.join(' ')).not.toContain(KEY_REJECTED);},10000);
  gme=liveDatasetById(GME);await ui.until(()=>expect(liveDatasetById(GME)).not.toBe(gme));
  expect(ui.cells()).toEqual([BTC,GME]);
  main.quit();
  // ---- Relaunch on the same profile: the stub key is still saved and GME opens live again.
  hooks.cells=[];hooks.cursor=0;hooks.effects=[];clearLiveDatasets();selectAlpacaSyntheticStub(false);vi.unstubAllGlobals();
  main=await launchMain(profile);
  expect(await main.lv.alpacaKeyStatus()).toEqual({ok:true,value:{configured:true,keyIdHint:'****STUB',encryption:true,synthetic:true}});
  ui=await mountApp(main,coinbase());vi.stubGlobal('fetch',fetch);vi.stubGlobal('WebSocket',Socket);
  await ui.until(()=>{expect(ui.cells()).toEqual([BTC,GME]);expect(liveDatasetById(GME)?.provenance.state).toBe('ready');expect(liveDatasetById(GME)!.bars.length).toBeGreaterThan(0);});
  gme=liveDatasetById(GME);await ui.until(()=>expect(liveDatasetById(GME)).not.toBe(gme));
  main.quit();
  expect(fetch).not.toHaveBeenCalled();expect(Socket).not.toHaveBeenCalled();
 },90000);
});
