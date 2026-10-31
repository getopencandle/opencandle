import {afterEach,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync,mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {AlpacaLiveProvider,ALPACA_STUB_PROVIDER_ID,ALPACA_STUB_PROVIDER_NAME,selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import {SymbolMathProvider,SYMBOL_MATH_PROVIDER_ID,staticComponentHandle,symbolMathDatasetId,SYNTHETIC_DERIVED_MIX_REFUSAL} from '../../src/domain/symbol-math-live';
import type {LiveHandle} from '../../src/domain/live-provider';
import type {BarDataset} from '../../src/domain/types';
import {clearLiveDatasets,registerLiveDataset} from '../../src/ui/live-registry';
import {patchWorkspace,suppliedSourceId} from '../../src/ui/workspace-grid';
import {createInitialWorkspace} from '../../src/ui/workspace-state';

// The packaged r27 live-alpaca flow (keyless stub) listed the Derived GME/SPY row, but choosing it was
// refused with "The requested data source is unavailable." This reproduces the whole
// keyless path in one process, with no network and no key: the real electron/main.cjs (Electron mocked,
// LV_ALPACA_STUB=synthetic, a throwaway profile in the OS temp folder) and the real preload give the renderer its window.lv;
// the real alpaca-stub answers. The real AlpacaLiveProvider opens GME and SPY for the real SymbolMathProvider, and the
// derived dataset is committed exactly as App openLive commits it ({symbol, sourceId}) through patchWorkspace.
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const mainFile=path.resolve('electron/main.cjs');
async function boot(){
  const profileDir=mkdtempSync(path.join(realpathSync.native(os.tmpdir()),'lv-r31-derived-'));
  const handlers=new Map<string,(event:unknown,value?:unknown)=>Promise<any>>();
  const app=Object.assign(new EventEmitter(),{isPackaged:false,requestSingleInstanceLock:()=>true,quit:vi.fn(),getPath:()=>profileDir,getAppPath:()=>profileDir,whenReady:()=>Promise.resolve(),commandLine:{appendSwitch:vi.fn()},setPath:vi.fn()});
  const frame={url:'lv://app/index.html'};
  const listeners=new Map<string,Set<(event:unknown,value:unknown)=>void>>();
  const web=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),isLoading:()=>false,isDestroyed:()=>false,isCrashed:()=>false,mainFrame:frame,send:(channel:string,value:unknown)=>{for(const fn of listeners.get(channel)??[])fn({},value);}});
  class Window extends EventEmitter{webContents=web;show=vi.fn();loadURL=vi.fn(async()=>{});isDestroyed=()=>false;close=vi.fn();}
  const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu:vi.fn()},protocol:{registerSchemesAsPrivileged:vi.fn(),handle:vi.fn()},safeStorage:{isEncryptionAvailable:()=>true},
    session:{defaultSession:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn(),on:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}}},
    ipcMain:{handle:(name:string,fn:any)=>handlers.set(name,fn)},dialog:{showErrorBox:vi.fn()},utilityProcess:{}};
  const real=createRequire(mainFile);
  const require=(name:string):any=>{
    if(name==='electron')return electron;
    if(name==='./storage.cjs')return{WorkspaceStore:class{}};
    if(name==='./script-jobs.cjs')return{ScriptJobs:class{close(){}}};
    if(name==='./public-sec.cjs')return{SecCompanyFacts:class{close(){}}};
    if(name==='./import-data.cjs')return{titles:{},limits:{}};
    if(name==='./alert-webhook.cjs')return{postAlertWebhook:()=>({delivered:false,status:0,error:null}),alertWebhookInput:(v:any)=>v};if(name==='./alert-notify.cjs')return{showAlertNotification:()=>({shown:false}),alertNotificationInput:(v:any)=>v};
    if(name==='../build-identity.json')return{buildId:'synthetic'};
    if(name==='./startup-diagnostics.cjs')return{createStartupDiagnostics:()=>({record:()=>undefined}),safeCode:()=>null};
    return real(name);
  };
  const errors:unknown[][]=[];
  runInNewContext(readFileSync(mainFile,'utf8'),{require,process:{argv:['--lv-profile='+profileDir],pid:1,env:{LV_ALPACA_STUB:'synthetic'}},__dirname:path.dirname(mainFile),console:{error:(...args:unknown[])=>errors.push(args)},setTimeout,clearTimeout,Buffer,Response,URL});
  for(let i=0;i<8;i++)await Promise.resolve();
  const calls:Array<{channel:string;value:unknown}>=[];
  const invoke=(channel:string,value?:unknown)=>{calls.push({channel,value});return handlers.get(channel)!({sender:web,senderFrame:frame},value);};
  let lv:any;
  const preload={contextBridge:{exposeInMainWorld:(_name:string,api:any)=>{lv=api;}},ipcRenderer:{invoke,on:(channel:string,fn:any)=>{if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel)!.add(fn);},removeListener:(channel:string,fn:any)=>listeners.get(channel)?.delete(fn)}};
  runInNewContext(readFileSync('electron/preload.cjs','utf8'),{require:(name:string)=>{if(name==='electron')return preload;throw Error('Unexpected dependency '+name);},Object,Promise,TypeError,String,Number,Array,Error});
  return{lv,calls,errors,close:async()=>{try{await invoke('lv:alpaca:unsubscribe');}catch{/* closed */}rmSync(profileDir,{recursive:true,force:true});}};
}
/** A non-synthetic import of `symbol` at 1D (a local file), on the given bar times. */
function importOf(symbol:string,times:number[]):BarDataset{
  return{instrument:{id:'LOCAL:'+symbol,symbol,name:symbol,exchange:'LOCAL',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'America/New_York'},resolution:'1D',
    bars:times.map((time,index)=>({time,open:10+index,high:11+index,low:9+index,close:10.5+index,volume:100})),
    provenance:{providerId:'local-import',providerName:'Local import',datasetId:'import:'+symbol,fixture:false,coverage:'test',asOf:0,delaySeconds:null,adjustment:'raw',session:'unknown',timezone:'America/New_York',state:'ready',license:'test',revision:'1',notes:[]}} as BarDataset;
}
afterEach(()=>{clearLiveDatasets();selectAlpacaSyntheticStub(false);});

it('on the keyless stub, GME/SPY opens from two SYNTHETIC stub feeds, is labelled SYNTHETIC, and commits like openLive',async()=>{
  const main=await boot();
  try{
    expect(main.errors.flat().join(' ')).toContain('synthetic stub');
    const status=await main.lv.alpacaKeyStatus();
    expect(status.ok&&status.value.synthetic).toBe(true);
    // App does this when the key status says synthetic:true.
    selectAlpacaSyntheticStub(true);
    const alpaca=new AlpacaLiveProvider(main.lv);
    const opened:string[]=[];
    // App openComponentFeed for a US ticker with the (stub) key present: the Alpaca provider.
    const provider=new SymbolMathProvider((symbol,resolution)=>{opened.push(symbol);return alpaca.open(symbol,resolution);});
    const handle=provider.open('gme / spy','1D');
    try{
      expect(opened).toEqual(['GME','SPY']);
      expect(handle.datasetId).toBe(symbolMathDatasetId('GME/SPY','1D'));
      for(let i=0;i<60&&handle.dataset().bars.length<100;i++){await pause(50);await flush();}
      const derived=handle.dataset();
      expect(derived.bars.length).toBeGreaterThan(100);
      // The chart says SYNTHETIC, names its stub components, and is flagged as synthetic data.
      expect(derived.provenance.providerName).toBe(`SYNTHETIC · Derived: GME/SPY from ${ALPACA_STUB_PROVIDER_NAME}`);
      expect(derived.provenance.fixture).toBe(true);
      expect(derived.provenance.providerId).toBe(SYMBOL_MATH_PROVIDER_ID);
      // App attachLive then openLive: register the feed snapshot, then commit {symbol, sourceId}.
      registerLiveDataset(derived);
      expect(suppliedSourceId({imports:[]},derived)).toBe(handle.datasetId);
      const next=patchWorkspace(createInitialWorkspace(),{symbol:derived.instrument.symbol,sourceId:handle.datasetId});
      expect(next.symbol).toBe('GME/SPY');
      expect(next.sourceId).toBe(handle.datasetId);
      expect(next.grid.cells[next.grid.layout.activeCellId].datasetId).toBe(handle.datasetId);
      expect(main.calls.some(row=>row.channel==='lv:alpaca:bars')||main.calls.some(row=>/alpaca/.test(row.channel))).toBe(true);
    }finally{handle.close();}
  }finally{await main.close();}
},60000);

it('a derived chart may not mix a SYNTHETIC stub component with real data (no silent substitution)',async()=>{
  const main=await boot();
  try{
    selectAlpacaSyntheticStub(true);
    const alpaca=new AlpacaLiveProvider(main.lv);
    const closed:string[]=[];
    const day=86400,times=Array.from({length:30},(_,i)=>Date.UTC(2026,8,1)/1000+i*day);
    // GME is the SYNTHETIC stub; IMP is a real (non-synthetic) local import.
    const provider=new SymbolMathProvider((symbol,resolution)=>{const handle:LiveHandle=symbol==='IMP'?staticComponentHandle(importOf('IMP',times)):alpaca.open(symbol,resolution);return{...handle,close:()=>{closed.push(symbol);handle.close();}};});
    expect(()=>provider.open('GME/IMP','1D')).toThrow(SYNTHETIC_DERIVED_MIX_REFUSAL);
    expect(()=>provider.open('GME/IMP','1D')).toThrow(/^GME\/IMP: /);
    // Every component it opened is closed again.
    expect(closed.sort()).toEqual(['GME','GME','IMP','IMP']);
    expect(provider.componentSymbols()).toEqual([]);
  }finally{await main.close();}
},60000);

it('the strict-source gate still refuses synthetic live data that is not a stub-run derived chart',()=>{
  const bars=[{time:1,open:1,high:1,low:1,close:1,volume:0}];
  const derived={instrument:{id:'DERIVED:GME/SPY',symbol:'GME/SPY',name:'Derived: GME/SPY',exchange:'DERIVED',currency:'USD',assetClass:'stock',tickSize:0.0001,lotSize:1,timezone:'America/New_York'},resolution:'1D',bars,
    provenance:{providerId:SYMBOL_MATH_PROVIDER_ID,providerName:`SYNTHETIC · Derived: GME/SPY from ${ALPACA_STUB_PROVIDER_NAME}`,datasetId:symbolMathDatasetId('GME/SPY','1D'),fixture:true,coverage:'x',asOf:0,delaySeconds:null,adjustment:'raw',session:'unknown',timezone:'America/New_York',state:'ready',license:'x',revision:'derived-v1:1:x',notes:[]}} as unknown as BarDataset;
  registerLiveDataset(derived);
  // Outside a keyless stub run, a synthetic derived feed is never accepted as a source.
  selectAlpacaSyntheticStub(false);
  expect(()=>suppliedSourceId({imports:[]},derived)).toThrow('The requested data source is unavailable.');
  selectAlpacaSyntheticStub(true);
  expect(suppliedSourceId({imports:[]},derived)).toBe(derived.provenance.datasetId);
  // A synthetic derived feed without the SYNTHETIC label is refused even in a stub run.
  const unlabelled={...derived,provenance:{...derived.provenance,providerName:'Derived: GME/SPY from Alpaca',datasetId:symbolMathDatasetId('GME/QQQ','1D')}} as BarDataset;
  registerLiveDataset(unlabelled);
  expect(()=>suppliedSourceId({imports:[]},unlabelled)).toThrow('The requested data source is unavailable.');
  // Any other synthetic (fixture) live feed is still refused.
  const otherLive={...derived,instrument:{...derived.instrument,id:'US:GME',symbol:'GME',exchange:'US'},provenance:{...derived.provenance,providerId:ALPACA_STUB_PROVIDER_ID,providerName:ALPACA_STUB_PROVIDER_NAME,datasetId:'live:alpaca-stub:GME:1D'}} as BarDataset;
  registerLiveDataset(otherLive);
  expect(()=>suppliedSourceId({imports:[]},otherLive)).toThrow('The requested data source is unavailable.');
});
