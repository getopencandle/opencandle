import {afterEach,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {readFileSync,mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {AlpacaLiveProvider,selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import {SymbolMathProvider} from '../../src/domain/symbol-math-live';
import {ALPACA_SHAPE,planLiveInterval} from '../../src/domain/live-intervals';
import type {LiveHandle} from '../../src/domain/live-provider';
import type {BarDataset} from '../../src/domain/types';
import {clearLiveDatasets} from '../../src/ui/live-registry';

// (diagnosis evidence, added checks only). Packaged r31: the stub-derived GME/SPY 1D legend did not move
// in 2 of 3 45 s windows. This shows, on the real keyless path (real electron/main.cjs with Electron mocked,
// LV_ALPACA_STUB=synthetic, the real preload, the real alpaca-stub, the real AlpacaLiveProvider and SymbolMathProvider; the
// harness), that the derived series recomputes on EVERY component update (no throttle, no coalescing, no
// dropped tick), and that a 1D component updates once a minute by design (native daily bars take the published 'd' bar,
// no trade ticks), which is the stub cadence the flow saw. SYNTHETIC data, no key, no network.
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const mainFile=path.resolve('electron/main.cjs');
async function boot(){
  const profileDir=mkdtempSync(path.join(realpathSync.native(os.tmpdir()),'lv-r36-derived-'));
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
const require0=createRequire(path.resolve('electron/main.cjs'));
afterEach(()=>{clearLiveDatasets();selectAlpacaSyntheticStub(false);});

it('the derived GME/SPY series recomputes on every component stream update (real stub, 1m, real trade ticks)',async()=>{
  const main=await boot();
  try{
    selectAlpacaSyntheticStub(true);
    const alpaca=new AlpacaLiveProvider(main.lv);
    const components=new Map<string,LiveHandle>();
    const provider=new SymbolMathProvider((symbol,resolution)=>{const handle=alpaca.open(symbol,resolution);components.set(symbol,handle);return handle;});
    const handle=provider.open('gme / spy','1m');
    try{
      for(let i=0;i<80&&handle.dataset().bars.length<50;i++){await pause(50);await flush();}
      expect(handle.dataset().bars.length).toBeGreaterThan(50);
      const componentChanges:string[]=[],derived:BarDataset[]=[];
      const offs=[...components].map(([symbol,component])=>component.onChange(()=>componentChanges.push(symbol)));
      const off=handle.onChange(dataset=>{
        // Every derived notification carries bars recomputed from the components as they are right now.
        const gme=components.get('GME')!.dataset().bars,spy=components.get('SPY')!.dataset().bars,last=dataset.bars.at(-1)!;
        const g=gme.find(bar=>bar.time===last.time),s=spy.find(bar=>bar.time===last.time);
        if(g&&s)expect(last.close).toBeCloseTo(g.close/s.close,12);
        derived.push(dataset);
      });
      try{for(let i=0;i<70&&componentChanges.length<6;i++){await pause(50);await flush();}}finally{off();offs.forEach(fn=>fn());}
      expect(componentChanges.length).toBeGreaterThanOrEqual(6);
      // One derived recompute per component update: nothing is throttled, coalesced or dropped.
      expect(derived.length).toBe(componentChanges.length);
      expect(new Set(derived).size).toBe(derived.length); // a fresh recompute each time, never a stale cached copy
    }finally{handle.close();}
  }finally{await main.close();}
},60000);

it('a 1D Alpaca component takes the published daily bar only (no trade ticks); the stub publishes it once a minute',()=>{
  const plan=planLiveInterval(ALPACA_SHAPE,'1D');
  expect(plan.ok&&plan.plan.ticks).toBe(false);
  const minute=planLiveInterval(ALPACA_SHAPE,'1m');
  expect(minute.ok&&minute.plan.ticks).toBe(true);
  // The real stub socket on a controlled clock: trades every tick, the daily bar ('d') only at a minute boundary.
  const stub=require0('./alpaca-stub.cjs');
  const tmp=path.join(os.tmpdir()),profile=path.join(tmp,'lv-r36-socket-profile');
  let clock=Date.UTC(2026,9,23,14,0,10);
  const transport=stub.alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic'},packaged:false,profile,tmpdir:tmp,now:()=>clock,tickMs:3600000});
  expect(transport.mode).toBe('synthetic');
  const daily:number[]=[],trades:number[]=[],messages:any[]=[];
  vi.useFakeTimers();
  const socket=new transport.WebSocket(require0('./public-alpaca.cjs').WS_URL);
  try{
    socket.onmessage=(event:{data:string})=>messages.push(...JSON.parse(event.data));
    socket.symbols=new Set(['GME','SPY']);socket.quoteSymbols=new Set();socket.minute=Math.floor(clock/60000);
    vi.runOnlyPendingTimers();
    for(let second=0;second<120;second++){
      clock+=1000;messages.length=0;socket.tick();vi.runOnlyPendingTimers();
      if(messages.some(item=>item.T==='d'))daily.push(second);
      if(messages.some(item=>item.T==='t'))trades.push(second);
    }
  }finally{vi.useRealTimers();socket.close();}
  expect(trades.length).toBe(120);
  // 14:00:10 + 1 s steps: the boundaries are 14:01:00 and 14:02:00.
  expect(daily).toEqual([49,109]);
});
